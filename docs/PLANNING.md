# datalab — Full Team Planning Document

## What This Tool Is

A standalone HTML file for data science work — starting with visualization and expanding to data cleaning and statistical analysis. Zero barrier to entry: open the file in any browser, no server, no install, no internet required.

**Workflow vision:** Load CSVs → explore with plots → clean/filter data → run stats → export results.

**Phase 1–4:** Visualization (multiple chart types, N datasets, N series, filters) — shipped.
**Phase 5–16:** Data cleaning UI, summary statistics, correlation matrices, distribution fits/KDE, hypothesis tests with effect sizes, computed columns, subplot grids, legend/colorbar polish — shipped. **Phase 17:** interpolated contours — shipped (v2.10.0). **Phase 18:** Plotly 3.x — shipped (v2.12.0). Workspace ergonomics shipped (v2.11.0); encoding & style controls shipped (v2.14.0). The tool is now a full visualization + cleaning + statistics workbench; the remaining scoped extension is **statistical diagnostics** (Phase 19) — see the phase sections below. *(This line read "designed in but not built yet" until the v2.10.0 doc review corrected the drift; the "later phases" list re-drifted as those phases shipped and was corrected again at the post-v2.14.0 review.)*

---

## Decision: New Project, Not an Extension of parity-plotting

Only ~20–30% of parity-plotting is reusable. Its core (inner join, A/B state model, parity stats, error bands) is baked in too deep to generalize cleanly. parity-plotting remains a finished, specialized QA/validation tool — untouched.

---

## Name: `datalab`

- Repo: `datalab/` (new local folder + new git repo)
- In-app title: "DataLab"
- Built output: `datalab.html`
- parity-plotting stays at its own path, unchanged

---

## Practical First Steps

> **Archived at Phase 0 exit** (housekeeping completed at Phase 2 exit) — superseded by git history and CHANGELOG.md.

---

## What Gets Reused vs. Written Fresh

| Component | Action | Source |
|-----------|--------|--------|
| CSV parsing (`parseCSV`) | Copy function | `src/js/data.js` |
| Drag-drop dropzone | Copy function | `src/js/wiring.js` |
| Searchable dropdown (`makeDD`) | Copy function | `src/js/ui.js` |
| Saved plots strip | Copy functions | `src/js/saves.js` |
| ZIP export (`downloadZip`) | Copy function | `src/js/chart.js` |
| `escHtml`, `debounce` | Copy functions | `src/js/wiring.js`, `state.js` |
| CSS design language | Copy file, adapt | `src/style.css` |
| Build system | Copy file, update | `build.js` |
| PapaParse, JSZip | Copy libs | `lib/` |
| **State model** | **Write fresh** | — |
| **HTML layout** | **Write fresh** | — |
| **All renderers** | **Write fresh** | — |
| **Series/filter UI** | **Write fresh** | — |
| **renderPlot dispatcher** | **Write fresh** | — |
| **Plotly bundle** | **Download fresh** (full bundle) | plotly CDN (one-time manual) |

---

## Team Roster

| Role | Phase | Notes |
|------|-------|-------|
| **Engineering Lead** | **All** | **PLANNING.md + STANDARDS.md ownership, versioning decisions, phase exit sign-off, conflict resolution, work sequencing and dependency ordering within phases, blocker flagging** |
| Frontend Developer | All | UI panels, event wiring, modal, DOM, dataset color assignment |
| Data Visualization Engineer | All | Plotly renderers, trace dispatch, renderer interface contract author, log scale guidance per renderer |
| Data Engineer | All | CSV parsing, column typing, filter evaluation, operator encoding spec, schema changelog |
| QA Engineer | All | Playwright tests, regression, benchmark maintenance, XSS test author, `tests/data/README.md` owner |
| UX Designer | All | Series modal UX, filter UI, user flow, error states, empty states, per-phase flow descriptions |
| Security Engineer | All | escHtml audit, safe filter parser, pre-commit hook, XSS test reviewer, color validation |
| Performance Engineer | Phase 2+ | Benchmark thresholds, render profiling, large datasets, benchmark dataset spec sign-off |
| Accessibility Specialist | All phases (basic pass); Phase 4 (full audit) | ARIA, keyboard nav, ARIA_CHECKLIST.md owner, `.sr-only` reviewer |
| Data Scientist | All phases (correctness + exploratory testing); Phase 5+ (primary owner) | Statistical correctness, chart type guidance, misleading visualization review, real-dataset exploratory testing |

---

## State Architecture

**Critical decision: state-first, not DOM-first.**
parity-plotting snapshots ~40 DOM element IDs. That approach breaks with N dynamic datasets/series. In datalab, `appState` is the source of truth — the DOM renders from state, not the other way around.

> **The schema documentation IS `src/js/state.js`** — its comment block carries the full, current field listing, kept honest by sitting next to the code it describes. PLANNING no longer mirrors it: the field-by-field copy here drifted at two consecutive exits despite a dedicated checklist item (Phases 10 and 12), so the Phase 13 review removed the failure mode instead of adding more process. What belongs here is only what does NOT churn:

```js
// Session file = { _schema: 'datalab-session', app, saved, state: {...appState} }
// Serializes cleanly with JSON.stringify — no DOM parsing.
// State version 2 since Phase 7; every change since is additive-with-defaults
// (no migrations required, §3). Migrations per version live in sessions.js.
// Import validates all ids against /^[\w-]{1,64}$/ (Phase 8 security fix).
// CHANGELOG ## Schema records every addition per release.
```

**Filter operator encoding** (defined in full in `applyFilters()` comment block — Phase 0 deliverable):

| Phase | Operators | `op` string | `value` type |
|-------|-----------|-------------|--------------|
| 0–2 | `=`, `≠`, `<`, `>`, `≤`, `≥` | `"eq"`, `"neq"`, `"lt"`, `"gt"`, `"lte"`, `"gte"` | scalar |
| 3+ | numeric range | `"in_range"` | `{ min, max }` |
| 3+ | categorical set | `"in_set"` | `string[]` |

The `op` field and `value` shape are forward-compatible from day one — Phase 3 adds new op types without a schema migration. **Changing the behavior of an existing `op` string is a MAJOR version bump** (see STANDARDS.md §3).

---

## Renderer Interface Contract

Defined in full in the comment block at the top of `shared.js` (Phase 0 deliverable, authored by Data Viz Engineer, approved by Engineering Lead). Summary:

```js
// Every renderer exports a function with this signature:
// buildTrace(series, datasets, ctx?) → { traces: Plotly.Data[], error: string | null,
//                                        warning?: string | null }
// (warning added Phase 3; ctx added Phase 13 per §7 — plot context, currently
//  { xLog }, cache-keyed; parity additionally returns layout/stats/annotSR —
//  see shared.js for the full, authoritative contract text)
//
// Error messages may contain user data (column names, dataset names).
// Callers MUST apply escHtml() before inserting error into the DOM.
// Error containers MUST use role="alert".
```

> Phase 10 note: subplot figures will strain the single-axis-pair assumption in
> `result.layout` — any contract amendment follows §7 (Data Viz authors, EL approves).

---

## UX: Series Editor Modal

Use a modal per series — not a flat panel:

1. Left panel: dataset list + series list (name, type, dataset, edit/delete)
2. "+ Add Series" → opens modal: dataset picker → chart type → columns → filters → style → Save
3. Modal closes; series added to list
4. Auto-render (debounced) — the plot updates on every series add/edit/delete and on style/range changes. The original "Render button" alternative was removed at Phase 16 (maintainer review: it was inconsistent — style edits already auto-rendered while series adds waited for a click).

**Modal field matrix** — all chart types share: X col, Y col (where applicable), color-by col, filters, style. Chart-type-specific fields:

| Chart type | Specific fields | Notes |
|------------|----------------|-------|
| scatter | error ± column (Phase 9); trendline with degree picker — linear/quadratic/cubic (Phases 9 + 13); per-group linear fits opt-in (Phase 11); size-by col, area-proportional (Phase 14) | — |
| line | line width; error ± column (Phase 9) | — |
| bar (Phase 9) | category X, aggregation (none/count/sum/mean/median), SD/SEM error bars (mean only) | silent aggregation forbidden (§20) |
| parity | join dataset, join key, show ±5% band, show ±10% band; color-by + size-by from the OBSERVED dataset (Phase 16) | Requires two loaded datasets; Y options come from the JOIN dataset (Phase 9 fix); color/size threaded through the join pairing |
| contour | Z col (third numeric column) | Requires pre-gridded/equally-spaced data; validated at creation |
| histogram | bin count (FD default, render-time); fit picker (normal/lognormal/Weibull, Phase 11; Phase 5 fitNormal honored via fallback); KDE overlay | Client-side binning |
| boxplot | X col (optional, categorical); Y col (numeric) | Max 50 categorical X values; render-time warning if exceeded |
| violin (Phase 11) | as boxplot | Plotly-native trace, Tukey box inside |
| heatmap (Phase 14) | X category, Y category, aggregation, value column | explicit aggregation per the bar precedent; colorbar names it |

Scatter/line/bar additionally get a Right Y axis toggle (Phase 14; not in subplot grids); scatter gets Size-by (area-proportional, Phase 14). Phase 16: categorical Color-by renders as a discrete named legend (scatter + parity); numeric Color-by gets a labeled, editable colorbar; Size-by adds a min/median/max size key; every series gets a Legend-label override.

All chart types additionally get a Cell picker when the target plot has a subplot grid (Phase 10).

Datetime columns are shown in column pickers but disabled with tooltip: "datetime columns supported in Phase 3."

---

## File Structure

> Refreshed at Phase 8 scoping — the block had drifted (missing the Phase 3–7 file splits).
> Refreshed again post-v2.13.0: added `date-prompt.js` (split in Stab A), and the
> documentation set moved into `docs/` (README stays at repo root as the entry point;
> `REVIEW_GUIDE.md` + `CODE_WALKTHROUGH.md` added).

```
datalab/
  src/
    index.html
    style.css           — includes .sr-only utility class
    js/
      state.js          — appState schema, VERSION, escHtml
      data.js           — parseCSV + ingestion (dropzone/handleFile, Phase 15), applyFilters, classifyColumn, datetime detection
      ui.js             — makeDD, dataset panel, series list
      modal.js          — series editor modal: open/close/save
      date-prompt.js    — ambiguous-date format prompt (split from modal.js, Stab A / v2.13.0)
      modal-fields.js   — modal field assembly: Style + Filters + wiring (split Phase 3)
      modal-chart-fields.js — per-chart-type Columns/setup HTML (split from modal-fields, Phase 16)
      filters.js        — filter row UI
      grid.js           — multi-plot live grid, active plot (Phase 7)
      chart.js          — renderPlot dispatcher (per-plot assembly)
      render-cache.js   — per-series trace cache (split from chart.js, v2.10.0 §6 review)
      layout.js         — plot theme + base layout (split Phase 6 exit)
      export.js         — PNG/SVG download, ZIP, style presets
      sessions.js       — session export/import + state migrations
      stats.js          — statistical engine + cleaning ops (Phase 5)
      distributions.js  — distribution fits + KDE (split from stats.js, Phase 11)
      specfun.js        — special functions backing the p-values (split Phase 15)
      hypothesis.js     — Welch t, ANOVA, MWU, Kruskal–Wallis, paired t, Wilcoxon (split Phase 15)
      expr.js           — safe expression engine for computed columns (Phase 12, §8)
      compare.js        — Compare groups: parametric/rank/paired UI (Phase 13, extended Phase 15)
      decorations.js    — dual-Y, parity stats, notes, log interactions (split from chart.js, Phase 14 + v2.10.0)
      dt-preview.js     — paginated Data Tools preview (split from datatools.js, Phase 14)
      datatools.js      — Data Tools modal (Phase 5; preview Phase 9; computed columns Phase 12)
      saves.js          — saved plot snapshots strip
      wiring.js         — event wiring, dropzone, bootstrap
      grid-interp.js    — scattered (x,y,z) → regular grid for interpolated contours (Phase 17)
      renderers/
        shared.js       — renderer interface contract, colVals, buildMarkerStyle, colorMapping
        one file per chart type (scatter, line, bar, parity, contour, histogram, boxplot, …)
  lib/
    plotly.min.js       — Full bundle
    papaparse.min.js
    jszip.min.js
  tests/                — feature-named *.spec.js suites (see the directory;
                          §14 naming). Fixed points: smoke (every PR),
                          xss (every PR), a11y (axe, every PR),
                          bench (BENCH=1, release only),
                          approved-csp.js (THE CSP string, §17)
    data/
      README.md         — Dataset specs and sourcing instructions (QA-owned)
      test_*.csv        — Committed synthetic datasets (max 500KB each)
  build.js
  .gitattributes      — artifact + lib eol exemptions (release integrity, §9)
  .githooks/          — version-controlled pre-commit hook (core.hooksPath, §8)
  README.md           — user-facing front page (kept at root as the entry point)
  docs/               — all project documentation
    REVIEW_GUIDE.md     — plain-language orientation for first-time/non-technical reviewers
    CODE_WALKTHROUGH.md — full file-by-file technical walkthrough (owned EL + Data Viz; updated every release, §4/§17)
    PLANNING.md
    STANDARDS.md
    ARIA_CHECKLIST.md
    DEPENDENCIES.md     — pinned versions + verified source URLs + SHA-256; build.js verifies before bundling
    CHANGELOG.md
```

---

## Landscape Review (Phase 8 scoping round)

Surveyed: Excel/Sheets; matplotlib/seaborn/ggplot2; Plotly Express/Dash; Tableau/Power BI; GraphPad Prism/OriginLab/SigmaPlot; Veusz/LabPlot/SciDAVis; gnuplot; RAWGraphs/Datawrapper.

**Niche (team consensus):** DataLab is the only zero-install, zero-internet, GUI-driven option where data provably never leaves the machine — web tools upload, desktop tools install, code tools need code. Feature bar: *what does a scientist/engineer with a sensitive CSV expect on day one?*

**Gaps adopted into the plan:** bar charts, error bars, log axes, trendline + R², data table preview (→ Phase 9). Subplots/faceting already planned (→ Phase 10).

**Decision records (do not relitigate without new information):**
- **`.xlsx` import — rejected for now (EL ruling, Security objection sustained):** SheetJS-class dependency = large new attack surface parsing complex untrusted binaries in a confidentiality-critical tool (§9, §10). README documents the Excel→CSV export path instead. Revisit only on sustained maintainer demand.
- **Dual Y axis — parked with Data Scientist conditions (§12 misleading-viz authority):** only with distinct units, axes color-matched to their series, never for same-unit pairs. Future list, gated on a DS-approved design.
- **Computed columns — future, security-spike-first:** highest-utility future item (Data Engineer), but any formula feature must satisfy the new STANDARDS §8 expression-evaluation rule (no string-to-code path). Design spike before any scoping. *(Outcome: spike ran Phase 11, ACCEPTED; shipped v2.5.0 exactly to the spike design.)*

---

## Versions and Phases

Phases close when their exit criteria are met — not on a calendar schedule.

---

### Phase 0 — Foundation `(internal, no version tag)`
**Goal:** State schema, filter parser, operator encoding, renderer interface contract, security baseline, build shell. Nothing renders yet.

- [ ] `appState` schema defined — Data Engineer + UX + Data Scientist (Data Scientist confirms schema supports future statistical features)
- [ ] Filter operator set reviewed by Data Scientist — confirm baseline operators sufficient for real data science workflows
- [ ] `applyFilters()` with safe switch parser — no eval, ever (Data Engineer + Security)
- [ ] Filter operator encoding spec documented in `applyFilters()` comment block (Data Engineer)
- [ ] Renderer interface contract (`buildTrace(series, datasets) → { traces, error }`) authored by Data Viz Engineer, approved by Engineering Lead; lives in `shared.js` comment block
- [ ] `escHtml()` audit rule: every `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` site has a comment listing which values are escaped (Security)
- [ ] Column name escaping contract documented in `parseCSV()` comment block (Data Engineer + Security)
- [ ] Playwright XSS injection test written — 5 insertion points: series name, column name, filter value, plot title, axis labels; 2 payloads: `<script>alert(1)</script>` and `"><img src=x onerror=alert(1)>`; rationale: all are user-controlled strings reaching the DOM via innerHTML (QA writes, Security reviews)
- [ ] Pre-commit hook expanded to grep for `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` AND prohibited network APIs (`fetch(`, `WebSocket(`, `RTCPeerConnection`, `sendBeacon`, `indexedDB`) (Security)
- [ ] `DEPENDENCIES.md` created with Plotly, PapaParse, JSZip pinned versions and SHA-256 hashes (Security)
- [ ] `build.js` updated to verify library SHA-256 hashes against `DEPENDENCIES.md` before bundling — build aborts on mismatch (Security + Frontend)
- [ ] CSP `<meta>` tag embedded in built `datalab.html` — policy: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none';` (Security)
- [ ] Build system set up; `datalab.html` builds as empty shell (Frontend)
- [ ] `ARIA_CHECKLIST.md` created with minimum checklist from STANDARDS.md §14 (Accessibility Specialist)
- [ ] Repo initialized; parity-plotting untouched

Exit criteria: State serializes to JSON. Filter parser in place with operator encoding spec. Data Scientist schema and operator review complete. Renderer interface approved. Build works. Pre-commit hook active (covers injection vectors and prohibited network APIs). XSS test written. CSP meta tag present in built HTML. DEPENDENCIES.md complete with verified hashes. Build hash verification passing.

---

### Phase 1 — MVP `v0.1.0`
**Goal:** Load CSVs, add series (scatter, line, parity), render, save, export. Usable end-to-end.

Parity is included in Phase 1 because it validates the renderer architecture against a known-good output, enables immediate use by parity-plotting users, and exercises the join/filter path early.

Deliverables:
- [ ] Datasets panel: drag-drop N CSVs, each gets name + color; color assignment owned by Frontend Developer
- [ ] Dataset color validation: hex or rgba only (per STANDARDS.md §8 regex) — implemented when datasets panel is built (Security)
- [ ] `.sr-only` CSS class defined in `style.css` — Frontend implements, Accessibility Specialist reviews before merge
- [ ] Series modal: dataset picker, chart type, adaptive field set per chart type, X/Y col, color-by (Frontend + UX)
- [ ] UX flow description for series modal — must include error states (missing required fields, disabled datetime columns) and empty states (pre-CSV, pre-series) — written before branch is created (UX Designer)
- [ ] `classifyColumn()`: classifies columns as numeric, categorical, or datetime; datetime shown but disabled in Phase 1 picker with tooltip (Data Engineer)
- [ ] `renderers/shared.js`: `colVals`, `buildMarkerStyle`, `colorMapping` (Data Viz)
- [ ] `renderers/scatter.js`, `renderers/line.js` — log scale guidance comment included (Data Viz, Data Scientist reviews)
- [ ] `renderers/parity.js`: scatter + y=x line + ±5%/10% bands + NSE/MAE/RMSE annotation + join-key matching + equal axis ranges explicitly set in layout (Data Viz + Data Engineer)
- [ ] Parity metrics (NSE/MAE/RMSE) reviewed by Data Scientist for statistical correctness before Phase 1 exits
- [ ] Plotly annotation accessibility: NSE/MAE/RMSE annotation text duplicated in `.sr-only` `<span>` adjacent to plot (Accessibility Specialist reviews before Phase 1 exits)
- [ ] Default colormap reviewed by Data Scientist for perceptual uniformity
- [ ] Basic AND-only filter UI: predicate chips in modal, row count preview; operators from Phase 0 encoding spec (Frontend + Data Engineer)
- [ ] `renderPlot()` dispatcher: iterates series, calls renderer, handles `{ traces, error }` return, applies `escHtml()` to error messages, uses `role="alert"` on error containers (Data Viz)
- [ ] Style panel: marker size, opacity, edge, gridlines, axis ranges, colormap (Frontend)
- [ ] Typography & Size panel (Frontend)
- [ ] Save/restore/delete plots; session tabs; ZIP export; PNG export (Frontend + Data Viz)
- [ ] `beforeunload` guard: triggers when there are unsaved series or unsaved plot session changes (Frontend)
- [ ] `tests/smoke.spec.js`: load one CSV, add one scatter series, assert no JS errors and non-empty `<svg>`; verify CSP meta tag exact string match; soft-assert Plotly WebGL canvas present (`.gl-container`) — written before first renderer merges (QA)
- [ ] `tests/data/README.md`: created with placeholder dataset spec (QA)
- [ ] Cold render pending test added to `tests/bench.spec.js` as skipped (QA)
- [ ] QA and Security review whether color validation and CSS injection need dedicated Playwright test coverage
- [ ] ARIA pass: datasets panel, series list, series modal — explicit check on focus management on modal open/close (Accessibility)
- [ ] Exploratory test with real CSVs: load at least 2 real-world datasets, exercise scatter/line/parity end-to-end, document findings (Data Scientist)

Exit criteria: Load 2 CSVs, add a parity series with a join key, render with error bands and NSE/MAE/RMSE stats. Load 1 CSV, add a scatter series with a filter. Save, restore, ZIP. Smoke test green. Playwright XSS test passes. No XSS. ARIA pass complete. Data Scientist sign-off on parity metrics correctness, colormap defaults, and exploratory test findings.

---

### Phase 2 — Multi-Series `v0.2.0`
**Goal:** N series overlaid on one chart, series CRUD, performance baseline.

- [x] N CSVs loaded simultaneously (Frontend)
- [x] Series list: reorder, edit, delete (Frontend + UX)
- [x] UX flow description for series list interactions — written before branch is created (UX Designer)
- [x] Per-series style overrides: color, marker size, line width (Frontend + Data Viz)
- [x] Series legend: enable/disable toggles (Data Viz)
- [x] Column reference validation on dataset reload (Data Engineer)
- [x] Memoized column extraction + trace cache; cache invalidated on dataset reload or column rename (Performance Engineer)
- [x] Synthetic 50k-row benchmark dataset generated and committed to `tests/data/` per README spec; Performance Engineer signs off on dataset spec (QA + Performance Engineer)
- [x] `tests/data/README.md` completed with full benchmark dataset spec (QA)
- [x] `tests/bench.spec.js` warm render benchmark active — 10 series × 50k rows, warm render < 2s, memoized path (see STANDARDS.md §10) (QA + Performance Engineer)
- [x] Keyboard nav for series list (Accessibility)
- [x] ARIA pass on all panels introduced this phase (Accessibility)
- [x] Exploratory test with real multi-series datasets; advise on series color default palette (Data Scientist)

Exit criteria: 3 CSVs, 6 series, reorder, edit, warm render < 2s. Smoke test green on every PR. Performance benchmark passing. Data Scientist exploratory test complete.

---

### Phase 3 — Full Chart Types + Advanced Filters `v0.3.0`
**Goal:** All 5 chart types. AND/OR filter logic. Datetime support.

- [x] `renderers/contour.js`: 3 numeric cols (x, y, z); validates at series creation — requires pre-gridded data; error message with `role="alert"` and `escHtml()`; log scale guidance comment included (Data Viz)
- [x] Contour data requirements reviewed by Data Scientist — confirm or update "pre-gridded" guidance; interpolated contour support explicitly deferred to Phase 5+ (Data Scientist)
- [x] `renderers/histogram.js`: 1 numeric col; Freedman-Diaconis bin count computed on demand at render time from column values (not cached in state); user-configurable bin count; log scale guidance comment included (Data Viz + Data Engineer)
- [x] Histogram binning defaults reviewed by Data Scientist — confirm FD rule is appropriate, advise on configurable range (Data Scientist)
- [x] `renderers/boxplot.js`: numeric Y + optional categorical X; render-time warning if categorical X > 50 unique values; log scale guidance comment included (Data Viz + Data Engineer)
- [x] Boxplot whisker calculation and outlier detection reviewed by Data Scientist for statistical correctness (Data Scientist)
- [x] AND/OR filter toggle per series (Data Engineer + Frontend)
- [x] Extended operators: `in_range` and `in_set` per encoding spec from Phase 0 (Data Engineer)
- [x] Disabled filter rules (checkbox per rule, not delete-only) (UX)
- [x] Datetime column support: ISO 8601, MM/DD/YYYY, DD/MM/YYYY; when format is ambiguous (e.g., 01/02/2024), user is prompted to select format (Data Engineer + Data Viz)
- [x] Datetime format ambiguity prompt: UX flow description written before implementation; must be an accessible modal with keyboard nav (UX Designer + Accessibility)
- [x] Renderer validation error testing: contour with non-numeric column, boxplot with >50 categories, histogram with categorical column (QA)
- [x] Cold render benchmark active — < 5s (see STANDARDS.md §10) (QA + Performance Engineer)
- [x] Filter re-evaluation < 500ms at 100k rows (Performance Engineer)
- [x] ARIA pass on all panels introduced this phase; `role="alert"` on all renderer error containers verified; datetime format prompt modal accessibility verified (Accessibility)
- [x] Exploratory test all 5 chart types with real datasets; flag misleading defaults (Data Scientist)

Exit criteria: All 5 chart types render. Parity with AND/OR filters. Contour validation message on wrong input. Boxplot warning at >50 categories. Cold render < 5s. Filter < 500ms. Renderer validation errors tested. Data Scientist sign-off on statistical correctness of all chart types.

---

### Phase 4 — Polish + GA `v1.0.0`
**Goal:** Feature-complete, accessible, stable.

- [x] Style preset save/load JSON (Frontend)
- [x] SVG export (Data Viz)
- [x] Session JSON export/import — save full state to file, reload later (Frontend + Data Engineer)
- [x] Full ARIA audit: dynamic panels, modal, filter rows, dataset chips (Accessibility)
- [x] Screen reader behavior testing — automated ARIA audit clean (axe, 4 app states); manual VoiceOver/NVDA session requires macOS/assistive hardware — flagged to the maintainer as the one human-action item, does not block code-side GA
- [x] Keyboard shortcuts reference panel (Accessibility + UX)
- [x] Color-blind-safe default palette (UX + Data Viz + Data Scientist — Data Scientist confirms perceptual and scientific appropriateness)
- [x] Full Playwright regression suite (QA)
- [x] Memory profiler: 1M rows + 10 series + delete all → heap returns to baseline (Performance Engineer)
- [x] Final exploratory test of full tool end-to-end with real datasets; Data Scientist sign-off that outputs are correct and non-misleading (Data Scientist)

Exit criteria: No ARIA violations. Screen reader tested. No memory leaks. Session round-trips via JSON. SVG export works. Data Scientist final sign-off.

---

### Phase 5 — Data Cleaning + Statistics `v1.1.0`
**Goal:** Summary stats, correlation, cleaning ops, normal fit, CSV export.
**Data Scientist is primary owner** — requirements and acceptance criteria below are theirs; no feature ships without their correctness sign-off.

- [x] `stats.js`: `summaryStats` (n, missing, mean, median, sample std n-1, min/P25/P75/max, linear-interpolation quantiles), `pearsonMatrix` (pairwise-complete deletion, documented), `fitNormal` (sample mean/std) — each pinned to hand-computed reference values in tests (Data Scientist)
- [x] Data Tools modal per dataset (Σ button on the chip): summary stats table, cleaning operations, correlation button, CSV export (Frontend + UX; flow description recorded)
- [x] Cleaning ops: rename column (series references follow), drop column, cast to numeric (reports unparseable count), missing values (drop rows / fill mean / fill median / fill constant); every op bumps the dataset revision and re-validates series (Data Engineer)
- [x] Correlation heatmap rendered to the plot area: symmetric −1…+1 scale, diagonal 1 (Data Viz + Data Scientist)
- [x] Histogram series gains "Fit normal" option: overlay scaled pdf × n × binWidth, μ/σ annotation with .sr-only mirror (Data Viz + Data Scientist)
- [x] Export cleaned CSV via Papa.unparse, current headers only (Data Engineer)
- [x] ARIA pass on the Data Tools modal; axe states extended (Accessibility)
- [x] Tests: statistical reference values, cleaning op behaviors incl. rename follow-through, correlation properties, fit overlay scaling (QA + Data Scientist)

Exit criteria: stats match hand-computed references. Rename follows through to series. Correlation symmetric with unit diagonal. Fit overlay integrates to n. CSV round-trips. axe clean. Data Scientist sign-off.

### Phase 6 — Plot Controls & UI Polish `v1.2.0`
**Goal:** Finish the plot-control surface (typography, frame, legend) and fix the too-small UI chrome. Sourced from maintainer review of v1.1.0.

- [x] UI chrome typography — evidence: phase6.spec.js "chrome typography is the larger scale"; all 5 axe states green at the new sizes (commit 6509819)
- [x] Plot typography panel — evidence: phase6.spec.js "typography sliders drive every plot font", "annotation font slider reaches parity stats annotations", preset round-trip test (commit 6509819)
- [x] Plot frame controls — evidence: phase6.spec.js "frame auto follows the theme; override applies; re-check restores auto" (commit 6509819)
- [x] Legend controls — evidence: phase6.spec.js "legend toggle hides it; dragged position survives re-render and session round-trip" (commit 6509819)
- [x] Relabel "Edge color" → "Marker edge" — evidence: src/index.html label text (commit 6509819). Note: a separate Markers heading was judged unnecessary once the label named the target; descoped
- [x] Tests — evidence: tests/phase6.spec.js, 6 tests, all listed behaviors covered (commit 6509819)

Schema (all optional with defaults, no migration): plotConfig.legendShow, plotConfig.legendPos {x, y}; style gains font-size and frame fields.

Exit criteria: every new control affects the rendered plot and round-trips through a session file. Legend stays where it was dragged. axe clean. Record corrections above visible in this document.

### Phase 7 — Multi-Plot Live Grid `v2.0.0`
**Goal:** Multiple live plots side by side. Maintainer chose the live grid over workspace tabs.

**Schema (MAJOR — state version 1 → 2, first real migration):**
- `appState.plots: [{ id, name, plotConfig }]` — each plot owns title, axis labels + locks, axis ranges, legendShow/legendPos, annotPos
- Every series gains `plotId`
- Migration v1→v2: wrap the singleton `plotConfig` into `plots[0]` ("Plot 1"), assign every series to it. Old session files load identically into a 1-plot grid.

**Design decisions (EL + UX, maintainer to confirm):**
- **Global vs per-plot:** style (colormap, markers, background, typography, frame) stays global for a consistent grid; title/labels/ranges/legend are per-plot
- **Sizing:** panels autosize to their grid cell (responsive); the Figure size sliders become the export size
- **Active plot:** clicking a panel makes it active (highlighted); the Plot settings panel binds to the active plot; new series default to it (modal gains a Plot picker)
- **Grid:** auto-layout — 1 plot full-width, 2 side by side, 3–4 in 2×2, then 3 columns; soft warning above 6 plots
- **Deleting a plot deletes its series** (confirm when it has any); per-panel error strips and sr-only mirrors

Deliverables:
- [x] State: plots array, series.plotId, migration v1→v2 — evidence: phase7 "a v1 session file migrates losslessly into a 1-plot grid" (hand-built v1 payload incl. locked title, legendShow carry-over)
- [x] Grid UI — evidence: grid.js reconciliation; phase7 two-plot, active-switching, and delete-cascade tests; responsive via Plotly responsive:true + autosize
- [x] Per-plot rendering — evidence: renderOnePlot in chart.js; phase7 "two plots render disjoint series with isolated settings"; per-panel errors verified by swept reload-validation tests
- [x] Plot settings binding — evidence: phase7 "clicking a panel activates it and syncs the settings inputs" + isolated ranges in the two-plot test
- [x] Series modal Plot picker + series plot chips — evidence: phase7 two-plot test creates series via the picker; chip rendered when plots > 1 (ui.js)
- [x] Saves + correlation retargeted to the active panel — evidence: phase5 correlation test green post-sweep; saves.js/datatools.js use activePlotDiv()
- [x] Memory — evidence: bench memory gate green through the per-panel release (986 MB peak → 11.4 MB after delete-all); deletePlot calls clearPanel before removal
- [x] ARIA — evidence: panels carry aria-labels incl. active state; all 5 axe states green on the grid (a11y suite post-sweep)
- [x] Tests — evidence: tests/phase7.spec.js (5 tests, all listed scenarios); 78 functional + 4 benchmarks green

Exit criteria: v1 session files migrate losslessly into a 1-plot grid. Two plots render different series with independent titles/ranges/legends. Plot delete releases memory. axe clean. All prior 73 tests still green.

### Phase 8 — Export, Presets & Control Refinements `v2.1.0`
**Goal:** Bulk export, categorized presets, control polish, NSE correction, and the v2.0.0 code-review carry-overs. Sourced from maintainer review of v2.0.0.

**Design decisions (team, maintainer-driven):**
- **Slider alignment (UX):** `figW` and `figH` get identical ranges (300–1600, step 50) so equal values sit at equal thumb positions. DOM-only change, no state impact.
- **Typography maxima (UX + Data Viz):** all five plot-typography sliders max out at 40. Margins already scale with font size (`buildBaseLayout`), so no clipping at max — Data Viz verifies at exit.
- **Bulk export (EL + Frontend):** "Export all" downloads each visible plot panel as an **individual PNG** at the Export size, named `NN_<plot name>.png`. Sequential `Plotly.downloadImage` calls; the browser asks permission for multiple automatic downloads on first use — accepted trade-off, maintainer chose individual files over a ZIP. Saved-plots ZIP export is unchanged.
- **Preset categories (UX + Data Engineer):** saving a preset opens an accessible category picker (checkboxes, all on by default): **Style** (background, colormap, markers, edges), **Export size**, **Plot typography**, **Frame & grid** (frame/grid controls, major/minor toggles, legend default). New sectioned schema marker `datalab-style-preset-v2`; loading applies only the sections present in the file. **v1 flat presets must keep loading** (interpreted as all-categories). Category picker dialog follows ARIA_CHECKLIST (focus in, Esc, focus restore).
- **NSE correction (Data Scientist):** `computeParityStats` computes SS_tot around **mean(modelled)**; the standard Nash–Sutcliffe definition — and the renderer's own doc comment — require **mean(observed)**: NSE = 1 − Σ(mod−obs)² / Σ(obs−mean(obs))². Fix the denominator and recompute the pinned references in `parity-stats.spec.js` (reference example becomes SS_tot = 500, NSE = 1 − 17/500 = 0.966). Displayed-statistic correction, not a schema change. Root cause noted: Phase 1 sign-off pinned the reference to the same wrong formula — reference values must be derived from the definition, not from the code.

**Preset picker flow (UX, recorded per §12):** Save preset → dialog "Save style preset" (`role=dialog`, focus to first checkbox; Esc / overlay click / Cancel close and restore focus to the trigger). Four category checkboxes, all on by default. Save disabled at zero categories — the only error state; controls always hold values, so there are no empty states. Save → JSON download → dialog closes. Load is unchanged: v2 applies present sections, v1 applies everything, wrong schema → existing alert path.

Deliverables (dependency order per §18; Security flagged items 2–3 as must-precede file-import work):
- [x] "Figure size" → "Export size" relabel + autosize hint (UX) — evidence: commit a6c9e47
- [x] Carry-over (v2.0.0 review, Security — §18 flag): session import validates plot/dataset/series ids against `/^[\w-]+$/`; reject on import; `xss.spec.js` malicious-session cases — evidence: commit 0f3f6a5 (2 payload tests + legitimate-id guard)
- [x] Pre-commit hook gap (Security): hook §5b now greps staged HTML for the prohibited-API list — evidence: `.git/hooks/pre-commit` (not version-controlled — **re-apply if the repo is recloned**); verified clean-pass + staged-`fetch(`-blocked at implementation
- [x] NSE denominator fix + reference values re-derived from the definition per §20 — evidence: commit 84863b4 (incl. distinguishing constant-at-mean test, CHANGELOG `## Corrections`)
- [x] `figW`/`figH` range unification 300–1600 — evidence: commit 8c0e59d
- [x] Typography slider maxima → 40, all five sliders — evidence: commit 8c0e59d; margin scaling in buildBaseLayout confirmed (Data Viz)
- [x] Carry-over: plot rename refreshes `activePlotLabel`, series plot chips, panel aria-labels — evidence: commit b7c4afe
- [x] Carry-over: multi-parity range union — evidence: commit d241e63 (also fixed parity axis overrides replacing styled axes wholesale — parity plots had lost titles/fonts/frame styling)
- [x] Carry-over: histogram explicit `xbins` — evidence: commit d8dc6e9 (overlay reuses identical lo/hi/width; loop min/max replaces spread)
- [x] "Export all" bulk PNG export — evidence: commit bc0c26b; export.spec.js asserts one numbered download per visible plot + hidden at 1 panel; README documents the permission prompt
- [x] UX flow description for the preset category picker — evidence: recorded above, per §12
- [x] Preset category picker + sectioned `datalab-style-preset-v2` with v1 back-compat, allowlist loader, CHANGELOG `## Schema` — evidence: commit bc0c26b; preset.spec.js (section isolation, malformed-shape, save filtering, zero-category disable, Esc focus restore); phase6 v1 round-trip drives the real loader
- [x] NSE/MAE/RMSE definitions in the help dialog — evidence: commit bc0c26b
- [x] Maintainer action (carried since v1.0.0): manual screen reader session. **RETIRED at v2.8.0 (Phase 15)** — satisfied by the automated real-NVDA speech-capture session under maintainer attestation (STANDARDS §15 carve-out); see the Phase 15 NVDA deliverable for the transcript record. The longest-open action item in the project is closed.

Exit criteria: equal slider values align visually. All typography sliders reach 40 without label clipping. Export-all produces one correctly named PNG per visible plot. A v1 preset still loads; a v2 preset with only Typography checked changes nothing else. NSE matches the textbook definition against newly hand-derived references. Malicious-session XSS test green. Pre-commit hook greps HTML for prohibited APIs. All prior tests green.

### Phase 9 — Chart Essentials `v2.2.0`
**Goal:** Close the table-stakes gaps every surveyed plotting tool covers: bar charts, error bars, log axes, trendlines, data preview. Sourced from the landscape review.

**Design decisions (team, landscape round):**
- **Bar renderer (Data Viz + Data Scientist):** categorical X + numeric Y with an explicit aggregation select — `none` (default; errors on duplicate categories telling the user to pick an aggregation), `count`, `sum`, `mean`, `median`. Silent aggregation is the misleading-viz failure mode — the user must choose (DS ruling). New renderer → §6 review of shared.js + renderer together; validation-error tests per the Phase 3 precedent.
- **Error bars (Data Scientist owns semantics):** scatter, line, bar. Sources: a ± column (symmetric), or computed SD/SEM when a bar series aggregates. **The legend/hover must state what the bar represents (SD vs SEM vs column name)** — unlabeled error bars are a §20 correctness violation, not a style choice.
- **Log axes (record correction):** every renderer has carried DS-reviewed log-scale guidance since Phase 1–3 — scatter.js says "offer via axis range UI" — and the control never shipped. Per-plot `xLog`/`yLog` checkboxes in the Axis ranges section. Additive optional plotConfig fields with defaults → **no migration, state stays v2** (§3). Interactions: parity allows log-log but equal ranges still enforced; histogram gets log **Y only** (log X requires log-space binning — deferred with the distributions work); non-positive values on a log axis produce a renderer warning (Plotly silently drops them — surfacing that is DS-required).
- **Trendline (Data Scientist owns formula):** scatter series option — linear least-squares y = ax + b with R², annotation + `.sr-only` mirror per the parity-stats precedent. Reference tests hand-derived per §20. Higher-order fits deferred to the distributions phase.
- **Data preview (Frontend + Performance):** Data Tools modal gains a paginated table view (50 rows/page) of the current dataset. Every cell escHtml'd (largest new innerHTML surface in the app — Security reviews the one rendering site). No full-table DOM at any row count — pagination is the perf guarantee; informational timing only, no new binding target.
- **Subplot design spike (docs-only, per amended §16):** the Phase 10 spike runs during Phase 9 — schema decision (v2-additive vs v3), Plotly `matches` axes with scattergl measured against §11 targets, renderer-contract amendment draft, UX flow. Output: Phase 10 deliverables scoped in this document.

**UX flow descriptions (recorded per §12, before implementation):**
- **Log axes:** two checkboxes ("Log X", "Log Y") in the Axis ranges section, bound to the active plot like the range inputs; sync on plot switch. Non-positive values on a log axis → per-panel warning with the hidden count. Histogram panels ignore Log X (warning explains: linear bins) — Log Y works. Parity panels apply log only when both boxes are on and all data positive; otherwise a warning and linear render. Manual ranges entered in data units are converted internally (Plotly log ranges are log₁₀).
- **Bar fields (series modal):** Category (X) column → Aggregation select (None default · count · sum · mean · median) → Y column (numeric; disabled for count) → Error bars select (None · SD · SEM; selectable only with mean). Error states: duplicate categories under None → render error naming the fix; SD/SEM without mean → modal validation error. The trace name and hover always state the aggregation (§20 no-silent-aggregation).
- **Error column (scatter/line):** optional "± column" select (numeric). The legend name carries "± column" so the bar's meaning is always visible (§20). Works with datetime X (pairs drop together).
- **Trendline (scatter):** checkbox "Linear trendline". Adds a fit line whose legend entry is the equation + R²; `.sr-only` mirror per the parity-stats precedent. Datetime X → warning, no fit.
- **Data preview (Data Tools):** table directly under Summary statistics — 50 rows per page, Prev/Next + "rows X–Y of N", every cell escaped, dropped columns excluded, refreshes after every cleaning op. No full-table DOM at any size.

Deliverables (dependency order per §18):
- [x] UX flow descriptions — evidence: commit 0d4d89b (recorded before implementation, §12)
- [x] Log axes: per-plot xLog/yLog, non-positive warnings, histogram/parity interactions — evidence: commit 6c98690, 5 tests; parity log-log range derived from unpadded extremes. Bug found en route: parity modal Y picker listed primary-dataset columns (fix 3408de4)
- [x] Bar renderer with explicit aggregation + validation-error tests — evidence: commit 8bf256c; duplicate-category error, aggregation always displayed
- [x] Error bars on scatter/line/bar with mandatory semantics labeling — evidence: commit 8bf256c; legend carries ± column / mean ± SD/SEM, hand-derived SD/SEM references
- [x] Trendline: linear fit + R² in the legend + sr-only mirror — evidence: commit 8bf256c; linearFit references hand-derived per §20 (a=1, b=1.5, R²=5/6)
- [x] Data preview tab in Data Tools, paginated, fully escaped — evidence: commit fce10db; ≤50 DOM rows, dedicated injection test
- [x] Subplot design spike document → Phase 10 scope — evidence: spike outcomes + measured 648 ms cold / 170 ms warm recorded in Phase 10 above; EL approved
- [x] README: feature list update + Excel→CSV guidance — evidence: commits bc0c26b (Excel→CSV, Phase 8) + 109936b (Phase 9 features, missing Data tools line)
- [x] ARIA pass on new modal fields and preview tab — evidence: commit 109936b (7th axe state: bar modal); preview scanned by the existing data-tools state
- [x] Exploratory test: realistic river-monitoring dataset (3 sites × 24 months, heavy-tailed flow incl. a zero) through bar mean±SD, log axes, error column, trendline, preview — evidence: session at v2.2.0 exit. Findings (§20 format, both `informational`, neither blocks): (1) bars on a log Y axis get no baseline hint in the UI — guidance lives in bar.js; consider a soft hint later; (2) a trendline across mixed populations correctly reports weak R² (0.081 over 3 site clusters) — per-group trendlines are a natural future ask (added to Phase 11+). Zero-flow point correctly produced the "1 non-positive value" log warning; all semantics labels rendered as specified.

Exit criteria: all four new capabilities render correctly and round-trip through session files (log flags, error-bar config, trendline config are series/plot state). Bar with duplicate categories and no aggregation produces the explicit error. Error bars always carry semantics labels. Log axis with non-positive data warns. Trendline R² matches hand-derived references. Preview never renders more than one page of DOM rows. Subplot spike approved and Phase 10 scoped. All prior tests green.

### Phase 10 — Subplot Figures `(scoped by the Phase 9 spike; version set by schema outcome)`
**Goal:** Subplots that share axes inside a single figure — one Plotly div, one exported image (publication-style multi-panel figures). Maintainer request at v2.0.0 review.

**Where it fits (EL decision, landscape round):** after Phase 9 — the essentials are higher value per unit risk, and the spike runs docs-only during Phase 9. It builds **on** the Phase 7 grid rather than replacing it: a plot panel can optionally become an r×c subplot figure; the grid keeps handling side-by-side independent figures. The two compose — a grid of figures, some of which contain subplots.

**Design spike outcomes (Phase 9, all questions resolved — EL approved):**
- **Schema (Data Engineer + EL):** plots gain optional `grid: { rows, cols, shareX, shareY }`; series gain optional `cell: { row, col }` defaulting to 1×1. Additive with defaults → **state stays v2, no migration; Phase 10 is a MINOR (v2.3.0)**. Per-cell plotConfig REJECTED for this phase — it forces v3; cells share the figure's title/typography, per-cell axis labels derive from the first series in the cell. Revisit per-cell config only on demonstrated need.
- **Rendering (Data Viz):** single div per figure; `layout.grid { rows, columns, pattern: 'independent' }`; the dispatcher assigns each series' traces to its cell's `xaxis`/`yaxis` keys; sharing via `matches`. **Renderer contract UNCHANGED** — renderers stay single-axis-pair; `renderOnePlot` remaps `result.layout` axis overrides onto the cell's axis keys. No §7 amendment needed.
- **Performance (measured, Phase 9 spike):** 4 × 50k scattergl in a 2×2 matched-axes grid, single div — **cold 648 ms, warm restyle 170 ms** — comfortably inside the §11 gates (cold < 5 s, warm < 2 s). A grid-figure case joins bench.spec.js as informational.
- **Parity in cells (Data Scientist):** the equal-axis constraint applies per cell; a parity cell is excluded from cross-cell axis sharing with a warning — sharing would break the y=x geometry.
- **UX:** Plot settings gains a per-plot "Subplot grid" row (rows × cols + share X / share Y); the series modal shows a Cell picker when the target plot has a grid; per-cell errors name their cell in the panel error strip. Active plot stays panel-level. Flow description before the branch, per §12.
- **Export:** unchanged — one figure = one image at Export size; Export all treats a subplot figure as one file.

**UX flow description (recorded per §12, before implementation):**
Plot settings gains a "Subplot grid" row for the ACTIVE plot: Rows × Cols selects (1–3 each; 1×1 = no grid) plus Share X / Share Y checkboxes. Switching plots syncs the controls. When the series modal's target plot has a grid, a Cell picker appears (Row r · Col c, defaulting to 1·1); changing the target plot refreshes the picker. Each cell's axis labels auto-derive from the first series in that cell unless the plot's labels are locked (locked labels apply to every cell). Per-cell render errors are prefixed with their cell (R1C2 · name: …). Shrinking the grid clamps out-of-range series into the nearest edge cell at render time — the stored cell is preserved, so re-growing the grid restores the arrangement. A parity cell is excluded from axis sharing with a warning. No empty states beyond the existing ones; error states are the per-cell strip entries.

Deliverables:
- [x] State: `plot.grid` + `series.cell` additive fields; session round-trip — evidence: commit c47d58f; round-trip test incl. control re-sync
- [x] Dispatcher: cell → axis assignment, renderer layout-override remapping (scaleanchor follows its cell), `matches` wiring — evidence: commit c47d58f; cached-trace axis refs set/cleared every render so grid changes can't go stale
- [x] Plot settings grid controls + series modal Cell picker; UX flow recorded first — evidence: commits 45054f9 (flow) + c47d58f
- [x] Parity-cell exclusion from sharing + per-cell error labels — evidence: commit c47d58f; parity union and log-log grouped per cell
- [x] Tests: cell axes + per-cell auto labels, shareX matches + session round-trip, parity exclusion + warning, shrink-clamp/regrow — evidence: tests/subplots.spec.js (4); grid controls covered by the empty-state axe scan (aria-labeled selects)
- [x] Bench: grid-figure informational case — evidence: bench.spec.js; 2×2 × 50k scattergl figure cold-renders 229–488 ms through the real pipeline (spike predicted 648 ms)
- [x] Exit exploratory (Data Scientist): mixed-type 2×2 figure (line / scatter+trendline / histogram / bar mean±SD) — every trace landed on its cell axes, trendline followed its series' cell, per-cell labels correct. One `informational` finding: an aggregated bar's auto Y label shows the raw column name while the legend carries the aggregation — acceptable, the legend is the semantics carrier.

Exit criteria: a 2×2 mixed-type figure renders with correct per-cell axes and labels; shared axes match across non-parity cells; parity cells warn and keep equal axes; grid + cells survive a session round-trip; grid shrink never errors and re-grow restores; all prior tests green. **Exited at v2.3.0** — refactor review moved auto-label helpers to layout.js (chart.js 313 → 294, §6); security checklist clean (new innerHTML sites: cell picker static markup, annotated); 7 axe states green; benchmarks green (warm 5 ms, cold 233 ms, memory 986 MB → 11.5 MB, filter 14 ms).

### Phase 11 — Distributions & Derived Analysis `v2.4.0`
**Goal:** The statistics milestone queued since Phase 5 — distribution fits, KDE, violin plots, per-group trendlines — plus the publish-day integrity chores. **Data Scientist is primary owner** (Phase 5 precedent). Computed-columns security spike runs docs-only inside this phase (§16 exception).

**Design decisions (team scoping session):**
- **Per-group trendlines are OPT-IN (EL ruling via §3):** auto-switching the existing trendline to per-group fits would silently change how saved sessions render. New additive checkbox ("one fit per color group", default off) shown when trendline + categorical color-by are both set; ≤ 10 groups, warning above (fits clutter faster than boxes). Each fit is palette-matched; each legend entry carries group name + equation + R².
- **Weibull via MLE (Data Scientist):** Newton iteration on the shape parameter with a convergence guard; rank-regression rejected (biased, less standard). Lognormal is closed-form (mean/std of ln x). Per §20, references are verified against an independent tool (scipy), documented in the test header — Weibull MLE is not hand-derivable.
- **KDE is binned (Performance + DS):** Gaussian kernel with Silverman bandwidth, evaluated over bin centers weighted by counts instead of raw points — O(bins × grid), visually identical for an overlay; approximation documented at the implementation site.
- **Violin is the 8th chart type (UX):** consistent with the type grid, not a boxplot option. Plotly-native trace; new renderer → §6 review with shared.js.
- **Histogram fit picker:** the Phase 5 "Fit normal" checkbox becomes a select (none / normal / lognormal / Weibull) + a separate KDE checkbox. Back-compat additive: `series.fitDist` read as `fitDist ?? (fitNormal ? 'normal' : null)` — no migration, old sessions render identically.
- **Hook moves into the repo (Security, publish-day finding):** `.githooks/pre-commit` committed; activated by a one-time `git config core.hooksPath .githooks` documented in the README clone steps — the hook no longer dies on reclone. (Companion finding already fixed: `.gitattributes` exempts the artifact and libs from eol normalization so build hash = blob = release asset.)

**UX flow descriptions (recorded per §12, before implementation):**
- **Histogram fit picker:** the Phase 5 "Fit normal" checkbox becomes a "Fit distribution" select (None default / Normal / Lognormal / Weibull) with a separate "KDE overlay" checkbox below it. Old sessions with `fitNormal: true` open with Normal selected. Lognormal/Weibull need all-positive data — non-positive values produce a render warning and no fit. Each fit's legend entry carries its parameters (μ, σ / k, λ); `.sr-only` mirrors as before.
- **Violin fields:** identical to boxplot — numeric Y required, optional categorical X, >50-category warning.
- **Per-group trendlines:** a second checkbox ("One fit per color group") under the trendline checkbox, always visible with a hint that it needs a categorical Color-by. Renderer behavior: categorical color-by → one palette-colored fit per group, each legend entry = group name + equation + R²; more than 10 groups → warning + fall back to the single overall fit; numeric or missing color-by → warning + single fit. Opt-in, default off (§3 — saved sessions render unchanged).

Deliverables (dependency order per §18):
- [x] Chore (Security): `.githooks/` in version control + `core.hooksPath` setup in README; local hook retired — evidence: this commit; tracked hook verified blocking a staged `fetch(` in HTML. Done during the Phase 11 doc review so amended §8 states only true things
- [x] Chore (Security, found at doc review): CSP string deduplicated to `tests/approved-csp.js` — §17's "single source of truth" claim was false (two copies); both suites now import it
- [x] UX flow descriptions — evidence: commit 0441ab4, recorded before implementation (§12)
- [x] `fitLognormal`, `fitWeibull` (MLE + Newton guard), `kdeBinned` — evidence: commit 076ca89; Weibull tested via definition-residual + scale equivariance (§20 — no closed form), lognormal hand-derived, KDE integrates to 1. Split to distributions.js at the exit refactor review (f1de878, stats.js had hit 340)
- [x] Histogram fit picker + KDE overlay, `fitNormal` back-compat — evidence: commit 076ca89; dedicated back-compat session test
- [x] `renderers/violin.js` (8th type) + modal fields + badge — evidence: commit 076ca89; §6 review with shared.js done (interface conformance, no contract deviation)
- [x] Per-group trendlines, opt-in, ≤ 10 groups — evidence: commit 076ca89; cap/fallback/numeric-color-by behaviors tested
- [x] Computed-columns security spike → **ACCEPTED, Phase 12 scoped below** — evidence: spike document in the Phase 12 section (carried in f1de878); Security-authored grammar/pipeline/caps, EL approved
- [x] Tests + axe — evidence: distributions.spec.js (7) + histogram-modal axe state (8 states total); suite at 116
- [x] README feature updates — evidence: f1de878 (also restored the missing subplot-figures line)
- [x] Exploratory test (Data Scientist) — evidence: session at exit on synthetic-Weibull strength data (k=2.3, λ=40 generative): **fitWeibull recovered k=2.297, λ=40.61** — strong estimator validation; lognormal swap, violin-by-batch, and 3-group per-group fits all behaved to spec. No findings.

Exit criteria: lognormal/Weibull/KDE match independent-tool references; a v2.x session with `fitNormal: true` renders identically; violin renders with validation errors on wrong input; per-group fits are opt-in, capped, palette-matched; the spike doc is approved or rejected with rationale; a fresh clone gets a working hook by following the README; all prior tests green. **Exited at v2.4.0** — refactor: distributions.js split (stats.js 340 → 213, §6); 8 axe states; benchmarks green; exploratory recovered the generative Weibull parameters (k 2.297 vs true 2.3). **Record correction (Phase 12 review): the sketch/tree checklist item added one review earlier was missed at this exit walk** — the drift was caught and fixed at the next review, which is the system working, but walkers: the checklist is read bottom to top at your peril.

### Phase 12 — Computed Columns `v2.5.0` *(scoped by the Phase 11 security spike)*
**Goal:** formula columns in Data Tools — the highest-utility remaining gap (Excel's core feature), under the §8 expression-evaluation rule.

**Security spike outcome (Phase 11, Security + Data Engineer, EL approved — verdict: ACCEPTED):**
- **Grammar:** arithmetic only — column refs, numeric literals, `+ − * / % ^`, unary minus, parentheses, and a **frozen allowlist** of functions (`abs sqrt ln log10 exp pow min max round floor ceil`). No strings, comparisons, booleans, assignment, member access, or user-defined functions — filters already cover predicates.
- **Column references:** bare identifiers matched against the dataset's actual headers (allowlist by construction); backtick-quoted for headers with spaces/symbols. Unknown column = parse-time error.
- **Pipeline:** hand-written tokenizer (fixed alphabet) → recursive-descent parser → AST → per-row switch-interpreter with `finiteOrNaN` coercion. Parse once, evaluate per row. **No string-to-code path anywhere** (§8) — the evaluator is a switch over node types.
- **Hard caps:** expression ≤ 500 chars, ≤ 200 tokens, AST depth ≤ 32 — bounds both abuse and accidental pathology.
- **Materialization:** the new column is computed once and stored as plain row data (sessions carry values, not formulas); the expression string is kept as dataset metadata for display. Re-deriving after data edits is an explicit user action — silent recomputation hides provenance (DS).
- **Performance:** interpreter cost ~tens of ns per node per row → 1M rows × a small AST sits well inside the filter-evaluation budget; measured at implementation against §11.

**UX flow description (recorded per §12, before implementation):**
Data Tools gains a **New column** section under Cleaning: a name field, an expression field (placeholder shows an example like `(temp - 32) * 5/9`), and a **live preview line** that re-parses on every keystroke — showing either the first 5 computed values or the parse error, inline. Add stays disabled until the name is valid (non-empty, no duplicate header) and the expression parses. Columns are referenced bare (`flow`) or backtick-quoted (`` `flow rate` ``) for names with spaces/symbols. On Add: values are **materialized** into the rows, the header is appended, the expression is stored as dataset metadata, and the standard cleaning-op cycle runs (revision bump, series re-validation, stats/preview refresh, confirmation message naming the expression). Materialization is one-shot by design — editing source data later does not silently recompute (provenance, DS ruling); re-derive deliberately with a new name or after dropping the old column. Error states: live parse errors under the expression; duplicate/empty name in the message line. No new empty states.

Deliverables *(UX flow recorded above per §12)*:
- [x] `expr.js` engine with caps, Security-reviewed parser — evidence: commit 1764e4d; 17 parse-time rejection tests incl. prototype reaches, strings, member access, assignment, arity, and all three caps
- [x] Data Tools "New column" with live preview + materialization + metadata — evidence: commit 1764e4d; end-to-end test covers preview, parse-error disable, duplicate-name disable, stats/picker integration
- [x] Tests + 1M-row informational timing — evidence: expr.spec.js (4 tests); bench case measured **359 ms / 1M rows** (filter budget for context: 500 ms binding at 100k)
- [x] CHANGELOG `## Schema` note — evidence: v2.5.0 entry; `ds.computed` additive, NaN→null round-trip tested
- [x] Exploratory test (Data Scientist) — evidence: session at exit on hydrology data: cfs→m³/s conversion, specific discharge ratio, log₁₀ transform — all hand-verified against direct computation. One `informational` finding (positive): **computed columns chain** — a new column can reference an earlier computed one, since headers update between adds; kept as intended behavior.

Exit criteria met — **Exited at v2.5.0**: parser rejects everything outside the grammar at parse time; live preview behaves per the §12 flow; computed values round-trip sessions as plain data; benchmarks green (computed 1M = 359 ms informational); no file over the §6 trigger; suite at 120.

### Phase 13 — Statistical Comparison `v2.6.0`
**Goal:** the comparison statistics queued since Phase 5 — group tests with honest reporting — plus the curve/binning items that share their numerics. **Data Scientist is primary owner.**

**Design decisions (team scoping session):**
- **Welch only (Data Scientist, non-negotiable):** the two-sample test is Welch's t (unequal variances assumed). Student's pooled t is not offered — it is the classic equal-variance footgun and offering both invites wrong choices.
- **No naked p-values (Data Scientist):** every p-value is displayed with its effect size (Cohen's d for two groups, η² for ANOVA) and per-group n/mean/SD. A p-value without context is a misleading-visualization issue under §12/§20 authority.
- **CDF numerics (DS + QA):** t and F p-values need the regularized incomplete beta function — hand-written continued-fraction implementation (Lentz), zero dependencies. References per §20 come from **published statistical tables** (the independent source), cited in the test header.
- **UI placement (UX):** Data Tools gains a "Compare groups" section — numeric column + group column → a results table (groups, n, mean, SD; then Welch t / ANOVA F, p, effect size). Two groups → t-test; three or more → ANOVA; one → error.
- **Module placement (EL, §6 foresight — Phase 13 doc review):** datatools.js sits at 263 lines; Compare groups would cross the ~300 trigger mid-phase. The section is built in its own `compare.js` from the start instead of being split at exit.
- **Log-space histogram binning (completes the Phase 9 deferral):** when a histogram panel has Log X, FD bins are computed on log₁₀ values (exponential bin edges in linear space) and Log X is honored instead of warned away. This changes output for sessions that had xLog+histogram, but those sessions currently show a "deferred" warning naming exactly this work — completing a documented deferral is not a silent change (§3 reasoning recorded).
- **Higher-order trendlines (DS):** quadratic and cubic least squares join the scatter trendline picker (degree select: linear default / 2 / 3); R² reported; degree shown in the legend; per-group still linear-only (overfitting per tiny group, DS ruling).

**UX flow descriptions (recorded per §12, before implementation):**
- **Compare groups (Data Tools):** numeric-column select + group-column select + Compare button; results render below in an `aria-live` region — a per-group table (group, n, mean, SD) followed by the verdict line: `Welch t = …, df = …, p = …, Cohen's d = …` (2 groups) or `F(dfb, dfw) = …, p = …, η² = …` (3+). Groups with fewer than 2 finite values are excluded and named; fewer than 2 usable groups → message; more than 50 groups → message suggesting a filter. p formats as `p = x.xx` (2 sig.) or `p < 0.0001`. Effect size and n's are part of the verdict line — never separable (§20).
- **Trendline degree:** a small degree select (linear default / quadratic / cubic) beside the existing trendline checkbox, enabled only when the checkbox is on. Legend shows the fitted equation with its degree. Per-group fits remain linear — selecting a higher degree with per-group on yields a warning and linear group fits.
- **Log-space binning:** no new controls — the existing histogram + Log X combination simply works: bins become equal in log₁₀ (exponential edges), the old "Log X is ignored" warning retires, non-positive values keep their count warning. Fit/KDE overlays scale by the local bin width so curves still match bars.

Deliverables *(UX flow descriptions recorded above per §12)*:
- [x] `regIncBeta`/`tTestWelch`/`anovaOneWay` in distributions.js — evidence: commit 8af2de6; published-table references (t/F critical values) + hand-derived Welch/ANOVA cases. The I(0.5,2,2) reference caught a real bug: the textbook recursive symmetry flip loops forever at the symmetric boundary — replaced with the non-recursive form
- [x] Compare groups UI in NEW compare.js (EL §6 foresight honored) — evidence: commit 8af2de6; verdict line inseparable from effect size + n (§20)
- [x] Log-space binning; warn-and-ignore retired — evidence: commit 8af2de6; renderer contract gained optional `ctx` third param per §7 (recorded in shared.js); fit overlays scale by local bin width; Phase 9 test updated to the new contract under the §3 documented-deferral carve-out
- [x] Trendline degree picker (linear/quadratic/cubic) — evidence: commit 8af2de6; exact-recovery + residual-orthogonality references; per-group stays linear with warning
- [x] Tests — evidence: comparison.spec.js (6); suite at 126
- [x] ARIA — evidence: Compare groups lives inside the scanned data-tools axe state; `aria-live` results region; 8 states green
- [x] README — evidence: release commit
- [x] Exploratory (Data Scientist) — evidence: session at exit: 3-treatment ANOVA F(2,87)=83.4 with η²=0.66; 3-decade column log-binned at 0.59 dex with a lognormal fit recovering the generative parameters; quadratic trendline recovered generative coefficients (0.01000x² vs true 0.01x²). No findings. Note: distributions.js sits just under the §6 trigger — the next addition there splits hypothesis tests out.

**Exited at v2.6.0.** Release-checklist note (Phase 14 review): the two §4 upkeep lines went one-for-two on their first outing — the DEPENDENCIES entry was caught (late, fixed pre-tag, 03b1e55); the file-tree line was missed (compare.js absent until this review). The mechanism stays — one save justifies it — but walkers: read the checklist, don't recite it.

Exit criteria: t/F/p match published-table references; p never renders without effect size and n's; log-X histograms bin in log space with the old warning gone; cubic fit matches a hand-derived reference; all prior tests green.

### Phase 14 — Chart & Workspace Completions `v2.7.0`
**Goal:** the visualization and data-shaping completions, including the two formerly gated items — dual-Y under the recorded DS conditions, and the Phase 1 size-column intent.

**Design decisions (team scoping session):**
- **Heatmap (9th chart type, Data Viz):** categorical X × categorical Y × numeric value with an **explicit aggregation** select — the bar-chart precedent applies verbatim (`none` errors on duplicate combos; §20 no-silent-aggregation; aggregation named in the colorbar title).
- **Bubble size is AREA-proportional (Data Scientist):** the scatter size-by column maps value → marker area, not radius — radius mapping exaggerates large values quadratically (classic misleading viz). Size range documented in the hover; legend notes the mapping.
- **Dual Y axis (gated conditions now satisfied structurally):** per-series "right axis" toggle; both axis titles tint to their series' colors (the DS coupling condition made visible rather than nagged); render warning only when the same column lands on both axes. Parity/contour/histogram series cannot take the right axis (geometry/binning conflicts). **Dual-Y is unavailable inside subplot grids in v2.7.0** (Data Viz, Phase 13 doc review catch — a right axis per cell multiplies overlaying axis keys and was never designed in the Phase 9 spike; a series with rightAxis in a grid cell renders on the left with a warning; revisit on demonstrated demand).
- **Free-text annotations (UX + Security):** per-plot `plotConfig.annotations[]` (additive) — text, position, draggable via the existing parity-annotation edit path. Annotation text is user data inside Plotly pseudo-HTML → escHtml at the build site, same contract as series names.
- **Datetime casting + column reorder (Data Engineer):** Data Tools cleaning section gains "Cast to datetime" (reuses the Phase 3 format detection + prompt; values stored as ISO strings) and column reorder (up/down per column; header order drives pickers, preview, and CSV export).

**UX flow descriptions (recorded per §12, before implementation):**
- **Heatmap fields:** X (category) → Y (category) → Aggregation (None default · count · sum · mean · median) → Value column (numeric; disabled for count). `none` + duplicate (X,Y) combos → render error naming the fix; >50 uniques on either axis → readability warning; the colorbar title states the aggregation (e.g. `mean(value)`). Missing combos render as gaps.
- **Bubble size:** scatter gains "Size by (optional, numeric)". Marker **area** is linear in the value (min diameter 4 px → max 28 px); non-finite values get the minimum size; the hover shows the raw size value and the series name notes the size column.
- **Right Y axis:** scatter/line/bar get a "Right Y axis" checkbox. The right axis appears when any series uses it — no gridlines (the left grid stays authoritative), both axis titles tint to their first series' colors. Same column on both axes → warning. In a subplot grid the toggle is ignored with a warning (Phase 13 review decision). Manual Y ranges and Log Y apply to the left axis only.
- **Notes (annotations):** Plot settings gains a Notes block for the ACTIVE plot — text input + Add, and a list with per-note delete. A new note lands at plot center; drag it anywhere (position persists, same machinery as the parity-stats annotation). Note text is escaped at the Plotly build site (pseudo-HTML contract).
- **Datetime casting:** Cleaning gains "Cast to datetime" beside "Cast to numeric" — detects the format, reuses the Phase 3 ambiguity prompt when needed, rewrites values as ISO strings, reports the unparseable count.
- **Column reorder:** "◀ Move / Move ▶" beside the cleaning column picker; header order drives pickers, stats, preview, and CSV export; the moved column stays selected.

Deliverables *(UX flow descriptions recorded above per §12)*:
- [x] `renderers/heatmap.js` (9th type) — evidence: commit 89f76c1; duplicate-combo error, named colorbar, gaps, >50 warning; §6 review with shared.js (interface conformance, no deviation)
- [x] Scatter size-by, area-proportional — evidence: commit 89f76c1; exact mapping test (0→4 px, max→28, mid→20), raw value in hover via customdata, size column in the legend name
- [x] Dual-Y with structural DS conditions — evidence: commit 89f76c1; tint-equals-series-color assertions, same-column warning, grid exclusion warning, scatter/line/bar only
- [x] Notes with drag persistence + escHtml — evidence: commit 89f76c1; dedicated XSS payload test, session round-trip, index-offset relayout mapping past parity annotations
- [x] Datetime casting + column reorder — evidence: commit 89f76c1; DD/MM-proving data → ISO, unparseable count, header order drives pickers/preview/CSV
- [x] Tests + axe — evidence: completions.spec.js (5) + heatmap-modal axe state (9 states); suite at 132
- [x] README — evidence: release commit
- [x] Exploratory (Data Scientist) — evidence: session at exit: site×month mean-flow heatmap with named colorbar; stage/flow dual-axis with a dragged note; catchment-sized bubbles spanning exactly 4–28 px. No findings.

**Exited at v2.7.0** — exit refactor review: three files crossed §6 (the phase's breadth showed) — chart.js → decorations.js extraction, datatools.js → dt-preview.js split, modal-fields.js reviewed-tolerated (cohesive builder, splits with the next modal change). 132 tests, 9 axe states, benchmarks green.

**Record correction (Phase 15 review):** the line counts originally recorded above (chart.js "369 → 283", modal-fields "309") were never true of any committed tree — at the v2.7.0 tag chart.js reads 323, modal-fields.js 324, datatools.js 302. Worse, **wiring.js (324) had crossed the §6 trigger entirely unnoticed** while three other files were reviewed by name (modal.js sits at 301). The decisions stand — the extractions happened and the tolerations were judgment calls — but the trigger was being enforced from memory, not measurement. Fixes: §4 release checklist gains a mechanical line-count sweep; the wiring.js review is a named Phase 15 chore.

Exit criteria: heatmap errors on duplicate combos under `none`; bubble areas scale linearly with the value column; dual-Y axis titles visibly tinted with the warning firing only on same-column; annotations round-trip sessions and reject markup; reordered columns drive pickers/preview/export; all prior tests green.

### Phase 15 — Robust Comparison & the Deferred Session `v2.8.0`
**Goal:** complete the comparison-statistics suite with rank-based and paired tests, and retire the longest-carried action item in the project — the manual NVDA session. **Data Scientist is primary owner** of the statistics; the Accessibility Specialist owns the session protocol.

**Design decisions (team scoping session, Phase 15 review):**
- **NVDA session is deliverable #1 (deferral record honored):** carried since v1.0.0, formally parked post-v2.7.0 (ee4f6f9) with the explicit term "named deliverable of whichever milestone is scoped next" — that is this milestone. Protocol (Accessibility): one full NVDA-on-Windows pass of the primary workflows — load CSV → series modal → render → Data Tools (stats, compare, cleaning, computed column) → session save/load → export — findings recorded in §20 format and triaged like exploratory findings. Maintainer action; **blocks the v2.8.0 tag unless re-deferred by a formal PLANNING update at exit** (§16 — no silent re-carry). The external-report trip-wire stays in force meanwhile. Accessibility's compounding-scope objection remains on record.
- **Rank-based tests (Data Scientist, mirrors the Welch ruling):** Mann-Whitney U (2 groups) and Kruskal-Wallis (3+) join Compare groups under a **Method** select — Parametric (default, unchanged) / Rank-based. p-values via the normal approximation with tie correction, documented at the implementation site; references per §20 from published critical-value tables (exact small-n tables cited as the independent source). Effect sizes, inseparable per §20: **rank-biserial r** for MWU, **ε²** for Kruskal-Wallis.
- **Paired tests (Data Scientist):** a **Paired columns** mode in Compare groups — two numeric columns, rows kept only where both are finite (dropped-pair count always shown; silent imputation forbidden). Paired t reuses the existing t CDF on the differences; Wilcoxon signed-rank uses the normal approximation with zero-difference and tie handling documented. Effect sizes: Cohen's d_z and rank-biserial r. The Method select applies in paired mode too (Parametric → paired t; Rank-based → signed-rank) — one orthogonal control, not four buttons.
- **`hypothesis.js` from the start (EL §6 foresight, compare.js precedent):** distributions.js sits at 297 and the Phase 13 exit note already called this split. `logGamma`/`regIncBeta`/`tTestWelch`/`anovaOneWay` move to a new `src/js/hypothesis.js`; all four new tests are built there. The move-only refactor lands first (§6 — behavior-identical, suite green), new numerics second.
- **§6 sweep chore (this review's record correction):** wiring.js (324) crossed the trigger unnoticed at the Phase 14 exit — its review/split is a named chore this phase; modal.js (301) is reviewed with it.
- **Interpolated-contour design spike (docs-only, §16 exception):** gridding algorithm choice (Delaunay barycentric linear vs IDW vs 2-D binned aggregation), convex-hull masking, and performance measured against §11 at 100k rows. Security co-reviews for the zero-new-dependency constraint — a triangulation library is exactly the §9 supply-surface temptation; the expr.js/Lentz precedent says hand-write it. Output scopes Phase 17 (renumbered when the Legend & Colorbar Polish phase was inserted ahead of contours).

**UX flow descriptions (recorded per §12, before implementation):**
- **Compare groups, Method select:** a Method select (Parametric default / Rank-based) above the existing column selects. Rank-based verdict lines: 2 groups → `Mann-Whitney U = …, p = …, rank-biserial r = …`; 3+ → `Kruskal-Wallis H(df) = …, p = …, ε² = …`. The per-group table stays, but rank-based shows **median + IQR** instead of mean ± SD — medians are the honest center for the test being run (DS ruling). Existing exclusion/error states unchanged; p formatting unchanged.
- **Paired columns mode:** a Compare select (Groups default / Paired columns). Paired columns swaps the group-column select for a second numeric-column select. Verdict per Method: `Paired t = …, df = …, p = …, dz = …` or `Wilcoxon W = …, p = …, r = …`. n pairs always shown; a dropped-incomplete-pairs count appears whenever any row was dropped. Fewer than 2 complete pairs → message. Same `aria-live` results region.

**Pre-implementation review (code-level, before any branch — Phase 14/051bae8 precedent). The team read the full touched surface (compare.js, distributions.js, datatools.js, wiring.js, build.js); decisions:**
- **Small-n honesty (DS, §20):** the scoping's "normal approximation" implementation and "published exact tables" references disagree by construction at small n. Resolution: the tie-corrected normal approximation IS the documented definition; references are hand-derived from that formula (z → p via the normal CDF, independent tool), plus agreement-within-stated-tolerance checks against published exact tables at moderate n. The verdict line appends "(normal approx.)" whenever any group/pair n < 10 — an unannounced approximate p is the naked-p failure family.
- **Wilcoxon zeros (DS):** zero differences are dropped before ranking (standard convention, matches the published tables); effective n reported; tie correction in the variance term.
- **Shared ranking (DS + EL):** one `rankWithTies` helper (average ranks + tie term) in hypothesis.js serves MWU, KW, and the signed-rank — three hand-rolled rankers would be three chances to disagree.
- **Paired-mode guards (Data Engineer + UX):** same column in both pickers → message, no test (dual-Y same-column precedent). A dropped pair = a row where exactly one of the two values is finite — rows missing both never formed a pair. The Paired option is disabled with a tooltip when the dataset has < 2 numeric columns (the corr-button precedent).
- **Split mechanics (EL):** distributions.js lines 157–297 are already a cleanly delimited hypothesis-test section; verbatim move to `hypothesis.js` (~155 lines each side); the only cross-file call runs the safe direction (kdeBinned → stats.js quantile). build.js gains one `appJs` line between distributions.js and expr.js; the PLANNING file tree gains hypothesis.js at exit (§4).
- **Test back-compat (QA):** existing compare ids (cmpVal/cmpGroup/cmpRun/cmpResult) stay stable; Method defaults to Parametric, so comparison.spec.js passes unmodified. The new selects reset on modal re-render like every existing compare control — consistency over persistence (UX accepted).
- **wiring.js chore forecast (Frontend):** the growth is four near-identical dialog-wiring blocks (modal/preset/data-tools/help each wire overlay-click + Esc + close, four document-level keydown listeners). The §6 review tries a `wireDialog()` dedup FIRST — likely under the trigger with no split, and one Esc listener instead of four. Split only if dedup falls short.
- **ARIA (§18):** the compare section's DOM structure changes → the data-tools axe pass is invalidated and must be re-done; new selects follow the existing label pattern.
- **Sequencing (EL ruling, Accessibility motion):** the NVDA session runs FIRST in the phase, not at exit — blocking findings discovered at tag time would defeat the deliverable.

Deliverables (dependency order per §18):
- [x] NVDA session — **the v1.0.0 carry RETIRES here.** Satisfied via the automated real-NVDA speech-capture session (commit 22b7631) under the maintainer's attestation that it meets §15 (new automated-session carve-out, STANDARDS §15). Evidence: transcript findings recorded above — mechanical protocol clean (dialogs announce role/title/focus; the Phase 15 `aria-live` verdict region speaks once and re-announces incl. the "(normal approx.)" marker); one finding (silent CSV load) scoped to Phase 16. Accessibility's supplement-not-substitute objection is on record; external-report trip-wire stays armed.
  - **Automated speech-capture supplement run (22b7631, team-agreed; Accessibility position: supplement, NOT substitute).** `tools/nvda-session.js` drove real NVDA through the protocol; transcript findings (§20 format):
    - `dataset`: 24-row 3-group CSV / `workflow`: full protocol via NVDA / `finding`: **all three dialogs announce role + title with correct focus management** («Add Series, dialog … Name, edit, Series name»; «Data Tools …, dialog»; «Keyboard shortcuts, dialog»); Escape restores focus with the trigger announced. **The Phase 15 `aria-live` verdict region speaks once and completely** (table + verdict + effect size), and re-announces the new verdict on a second run including the "(normal approx.)" marker / `severity`: `informational` (positive — the new surface's key AT behavior verified with real NVDA speech)
    - `dataset`: same / `workflow`: load a CSV while the app holds focus / `finding`: **dataset arrival is silent** — no announcement that the file loaded; a screen-reader user must navigate to the datasets list (which does announce itself: «Loaded datasets, list, with 1 items») to confirm. An `aria-live` load-status line would close the gap / `severity`: `next-phase-specific: 16`
    - Harness artifacts (programmatic-focus silences on selects/buttons) are excluded from the record — the app's own focus management demonstrably speaks, and labels are axe-verified.
  - **Remaining manual scope (shrunk to judgment calls, ~10 min):** Tab through the series modal and Compare selects *by ear* — labels comprehensible at speed? Verdict announcement understandable as spoken math («η superscript 2 equals …»)? Any flow that feels like a trap? The mechanical boxes above are pre-cleared.
- [x] Chore: §4 line-count sweep walked; wiring.js reviewed/split, modal.js reviewed with it — evidence: commit 974c89f (wireDialog dedup + ingestion → data.js; wiring 324 → 260, data.js 274; the forecast's "dedup alone suffices" was optimistic — dedup landed ~303, the ingestion move closed it). Sweep decisions for the remaining over-trigger files recorded at the exit walk below
- [x] Refactor: `hypothesis.js` split out of distributions.js — evidence: commit 2585fa6 (verbatim move, distributions 297 → 158, suite green before new numerics); follow-up commit 30d7692 split the CDF special functions onward to `specfun.js` (126) after hypothesis.js was born at 325 — over-trigger on creation day, split at the natural numerics/tests seam rather than tolerated
- [x] `mannWhitneyU` / `kruskalWallis` — evidence: commit 2d88df8; tie-corrected normal approximation + continuity correction; shared `rankWithTies`; published critical-U bracket at n=10,10 (p(23)=.045 < .05 < p(24)=.054); KW hand case H=7.2/p=e^(−3.6); χ² anchors 5.991→.05, 15.086→.01
- [x] `pairedT` / `wilcoxonSignedRank` — evidence: commit 2d88df8; zero-drop documented at site with nZero reported; Wilcoxon exact-enumeration tolerance check (50/1024 = .0488 vs approx .0528, gap .004 < .005); paired t hand case t=15/df=3/dz=7.5
- [x] Compare groups UI: Method select + Paired-columns mode — evidence: commit b2a4601; rank tables median+IQR, paired same-column guard, dropped-pair counting, "(normal approx.)" marker under n=10, Paired disabled <2 numeric cols; Phase 13 tests pass unmodified (ids stable, Parametric default)
- [x] Tests + axe — evidence: commits 2d88df8 + b2a4601; comparison.spec.js 6 → 15 (engine references + 3 UI tests); suite at 141; data-tools axe state re-passed after the DOM change (§18 invalidation honored)
- [x] Interpolated-contour design spike document → Phase 17 scoped (Data Viz + Data Scientist + Security, EL approves) — evidence: measured spike outcomes recorded in Phase 17 below (binned-mean + hull + harmonic fill ACCEPTED at 120 ms/100k with the max-principle no-fabrication proof; IDW rejected at a measured 9.6 s; Delaunay rejected on silent-failure robustness)
- [x] README feature updates — evidence: commit 009aca5
- [x] Exploratory (Data Scientist) — evidence: session on seeded lognormal water-quality data (reproducible, LCG seed 42). Findings (§20 format):
  - `dataset`: 2-site dissolved-metal concentrations, lognormal σ_log = 0.8, two storm outliers in site A / `workflow`: Compare groups, Parametric then Rank-based / `finding`: **textbook divergence, direction included** — Welch reports mean A 8.23 > mean B 4.72 (d = +0.25, p = 0.25, outlier-dragged); MWU reports median A 3.10 < median B 3.75 (r = −0.086) — the parametric direction is an artifact of two storm events, visible at a glance because the rank table shows medians (the DS table ruling paying off) / `severity`: `informational` (positive validation)
  - `dataset`: 3 sites, site C censored at the 0.5 detection limit (heavy ties) / `workflow`: Compare groups, both methods / `finding`: ANOVA F(2,119) = 2.48, p = 0.088, η² = 0.04 (outlier-inflated variance masks the effect) vs Kruskal–Wallis H(2) = 11.60, **p = 0.0030**, ε² = 0.096 — the rank test finds what ANOVA misses, exactly as theory predicts; tie correction handled the DL ties without complaint / `severity`: `informational` (positive validation)
  - `dataset`: 25 paired BOD before/after + 3 incomplete rows / `workflow`: Paired columns, both methods / `finding`: paired t = 8.48, dz = 1.70 and Wilcoxon W = 3, r = 0.98 — concordant where assumptions hold; "3 incomplete pair(s) dropped" visible in both verdicts; approx marker correctly absent at n = 25 / `severity`: `informational`
  - No blockers; no UI changes requested — when methods diverge, the median-vs-mean table contrast already tells the user why.

**Exited at v2.8.0.** NVDA gate cleared by maintainer attestation of the automated speech-capture session (STANDARDS §15 carve-out). Suite 141 green; BENCH=1 full set green (warm/cold/grid/computed/memory/filter — cold 219 ms, filter median 13 ms, heap 10.1 → 999.4 → 11.6 MB). **§6 sweep (new §4 line, first walk):** over-trigger files and decisions — modal-fields.js 324 (tolerated, carried: cohesive builder, no modal change this phase — splits with the next one), chart.js 323 (tolerated: dispatcher+cache core is cohesive post-decorations split), datatools.js 302 (tolerated: post-dt-preview split; compare growth went to compare.js as designed), modal.js 301 (tolerated: dialog lifecycle + focus management is one concern). Security checklist walked: new innerHTML sites annotated (compare.js `_cmpRender`, caught by the hook on first commit attempt — the hook works), all messages via textContent, no new network/storage APIs, XSS suite green.

Exit criteria: U/H/W/p match published references; no p renders without its effect size and n's (§20); rank-based tables show median + IQR; paired mode drops incomplete pairs with a visible count; the NVDA session is done (or formally re-deferred with a fresh record); every file over the §6 trigger has a recorded decision; the spike is approved or rejected with rationale; all prior tests green.

### Phase 16 — Legend & Colorbar Polish `v2.9.0`
**Goal:** make color and size encodings self-describing across renderers, give the user direct control over legend text, and fix two UI-honesty gaps. **Sourced from maintainer review of v2.7.0** (the Phase 6 / Phase 8 maintainer-review precedent). Inserted ahead of the contour work per the Phase 8 ruling — higher value per unit risk, all additive.

**Sequencing note (EL, §16):** this scope is docs-only planning and lands now; **implementation does not begin until Phase 15 is tagged** (v2.8.0 — gated on the NVDA session). No `src/` work starts before then.

**Theme — honest color/size encoding.** Three of the five maintainer items are one coherent problem: an encoding the reader can't decode is a §20 misleading-viz issue, the same family as silent aggregation. A numeric color ramp needs a labeled colorbar; a categorical color needs a named legend; a size mapping needs a size key.

**Design decisions (team scoping session):**
- **Parity color-by AND size-by, from the observed dataset only (maintainer rulings A + C):** the color/size column is pulled from the observed (primary, `series.datasetId`) dataset — not the join dataset (keeps the picker simple; the model output is rarely the grouping variable). The column array is threaded through the **same inner-join + finite-pair filter** as `xs`/`ys` (`parity.js:42-45`), dropping the identical indices — misalignment here would resurrect the Phase 1 `blocks-phase` pairing bug, so a dedicated alignment test is mandatory. Size-by reuses the area-proportional scatter mapping (4–28 px, DS ruling). Maintainer chose **both** over the team's color-by-only lean (recorded — size on parity can obscure y=x agreement; the maintainer accepts that trade for flexibility).
- **Categorical color-by → discrete legend, fixed across scatter AND parity (maintainer ruling B):** today a categorical Color-by renders as a *continuous colorbar over palette indices* (`colorMapping` returns indices → `buildMarkerStyle` sets `showscale:true`) — a pre-existing scatter wart, wrong for categories. Replace with **one trace per category, palette-colored, each named in the legend**; numeric color-by keeps the continuous colorbar. This corrects scatter and is the right behavior for parity from the start. Touches `shared.js` + `scatter.js` + `parity.js` → §6/§7 renderer review (Data Viz authors, EL + one domain role approve).
- **Colorbar label for numeric color-by (item ④):** default the colorbar title to the column name — matching `heatmap.js:94` and `contour.js:73`, which already do this — plus a user-editable label field. The asymmetry (heatmap/contour titled, scatter color-by blank) was the bug.
- **Size legend / key (item ②):** Plotly has no native bubble-size legend. Add **synthetic legend entries at representative values** — the size column's min, median, and max — as non-data traces whose marker *areas* match the real mapping, labeled with the raw values. DS owns the representative set: **median not mean** (robust), with the true min/max as the endpoints; the key communicates AREA, never radius (§20). Applies wherever size-by is active (scatter + parity).
- **Legend-label override (item ③, maintainer ruling):** a per-series field setting the exact legend text, overriding the renderer's auto-suffixes (`(± col)`, `(size: col)`). The series *name* already drives the legend, but you can't currently suppress those appended suffixes — this gives the literal control. Fit-line and band entries keep their own legend names (they are separate traces). Additive `series.legendLabel` (optional; empty = current behavior).
- **Preset buttons relocated (item ⑤):** lift Save/Load preset out of the **Style** accordion into their own top-level **Style presets** section, so their breadth (Style + Export size + Plot typography + Frame & grid — the Phase 8 category picker) is visually honest. DOM/IA move only, no behavior change.
- **Silent CSV-load announcement (folded Phase 15 a11y finding, `next-phase-specific: 16`):** an `aria-live` status line announces dataset arrival ("Loaded <name>: N rows, M columns"). Small, fits this UX-polish phase, and Phase 16 is now the "next phase" the finding named.

**Schema (all additive, no migration — state stays v2, MINOR):** `series.colorCol`/`series.sizeCol` already exist (scatter) and are reused for parity; new optional `series.legendLabel` and `series.colorbarLabel` (default = `colorCol`). v2.0–v2.8 sessions load unchanged.

**Security (§8/§9):** `legendLabel` and `colorbarLabel` are user strings reaching Plotly pseudo-HTML / the DOM → `escHtml()` at the build site, identical contract to series names and notes (Phase 14). No new injection surface beyond that; the pre-commit hook covers the new `innerHTML` sites if any.

**UX flow descriptions (recorded per §12, before implementation):**
- **Parity Color-by / Size-by:** the parity modal's Columns section gains "Color by (optional)" and "Size by (optional, numeric)" pickers, identical to scatter's, populated from the **observed** dataset's columns. Categorical Color-by → discrete legend (one named entry per category); numeric → colorbar with its label. Size-by → area-proportional markers + the size key. Both empty = today's single-color parity. Error/empty states unchanged.
- **Colorbar label:** when a numeric Color-by is set (scatter or parity), a "Colorbar label" text field appears under the Color-by picker, defaulting to the column name; editing it retitles the colorbar live. Cleared = column name.
- **Size key:** no control — whenever Size-by is active the key appears automatically in the legend area (three entries: min / median / max raw values, areas to scale). Hidden when no size column.
- **Legend label:** a "Legend label" text field near the series name, placeholder showing the current auto-generated label; typing overrides it verbatim; cleared = the auto label (name + suffixes). Fit/band entries are unaffected.
- **Style presets:** the Save/Load preset buttons move from inside the Style accordion to a top-level "Style presets" section just below it; the save-category picker dialog (Phase 8) is unchanged. No behavior change — purely where the buttons live.
- **Dataset-load announcement:** no visible control; an `aria-live="polite"` region speaks the dataset name, row count, and column count on load.

Deliverables (dependency order per §18; UX flows recorded above per §12):
- [x] Categorical color-by → discrete legend in `shared.js` + `scatter.js`; numeric keeps the colorbar — evidence: commit 22b7c32; shared `categoryGroups`/`categoryGroupsFromValues`, one trace per category under a legendgroup, size/error sliced per category, >8 palette-repeat warning, datetime-X fallback
- [x] Colorbar label: default to column name + editable `series.colorbarLabel` — evidence: commit 0a23946; field shown only for numeric color-by; Plotly-title no-escHtml convention (matches heatmap/contour), new free-text sink XSS-covered
- [x] Colorbar fonts follow the typography panel (maintainer follow-up: the colorbar was the one plot element ignoring the typography sliders, fixed at 12) — evidence: `applyColorbarFonts` in layout.js applied centrally in the dispatcher + correlation render; colorbar **title** ← "Axis label size", **numbers** ← "Tick label size" (a colorbar is an axis); covers scatter/parity/heatmap/contour/correlation, no new controls
- [x] Parity color-by + size-by from the observed dataset, threaded through the join pairing; **alignment test mandatory** — evidence: commit 79a656b; the dropped-pair test asserts color+size skip the same index x/y drop
- [x] Size key: synthetic min/median/max legend entries, area-honest — evidence: commit 115b6ab; shared `sizeKeyTraces`, grey swatches via `areaSizes`, absent without size-by / all-equal
- [x] Legend-label override `series.legendLabel`; suffix suppression — evidence: commit 28f76b8; scatter/line/parity; categorical → group title
- [x] Preset buttons relocated to a top-level Style presets section — evidence: commit 9149781; DOM/IA only, hint states the breadth
- [x] `aria-live` dataset-load announcement — evidence: commit 9149781; sr-only `#loadStatus`, "Loaded/Reloaded <name>: N rows, M columns" — closes the Phase 15 NVDA finding
- [x] Tests + axe re-pass — evidence: color-encoding.spec.js (10), workspace-polish.spec.js (3), xss colorbar cases, a11y 10th state (numeric color-by reveals the colorbar field); §18 modal re-pass done
- [x] README feature updates — evidence: this release commit (chart-type parity color/size note + "self-describing encodings" bullet)
- [x] Exploratory (Data Scientist) — evidence: end-to-end render on synthetic 3-site QA data (observed vs modelled, Plynlimon-style). Findings (§20 format):
  - `dataset`: 3 sites × 15 paired observed/modelled metal conc + catchment area / `workflow`: parity colored by `site` + sized by `catchment`, rendered through the real dispatcher / `finding`: **decodable without the table** — three distinct-colored site groups under the "Site parity" group title (15 pts each) AND a "Size: catchment" key reading 5.40 / 23.6 / 44.8 (min/median/max); `legend.itemsizing` resolved to `'trace'` so swatch areas track the data / `severity`: `informational` (positive)
  - `finding`: Plotly clamps large legend marker symbols, so the max size-key swatch can look smaller than the data's biggest bubble — **the numeric labels carry the scale regardless**, which is why the key shows raw values. Documented limitation of the synthetic-legend design (the recorded choice), not a defect / `severity`: `informational`
  - No blockers; no misleading defaults. Numeric color-by colorbar label and the legend-label override verified in the same session.

**Second maintainer-review batch (running the built app):**
- [x] **Bug: first render under-sized** — the plot came up tiny in the top of the viewer and only filled the region after an edit. Cause: `renderPlot()` un-hid `#plotGrid` *after* the first `Plotly.react`, which then measured a `display:none` (0-height) container and fell back to Plotly's 450px default; a later edit's `Plotly.Plots.resize` corrected it. Fix: un-hide the grid before plotting. Evidence: commit 78cc4d5; render-layout.spec.js asserts the first render tracks the container (verified failing pre-fix).
- [x] **Render button removed → auto-render** — the button was inconsistent (series adds needed it; style/range edits already auto-rendered). `updateRenderBtn` → `scheduleRender`: any series add/edit/delete/load schedules a debounced render; the empty case clears immediately. Adding a series now just appears. Evidence: this commit; workspace-polish "adding a series auto-renders" test; the 20 specs that clicked `#renderBtn` now call `renderPlot()` directly (deterministic).
- [x] **Style presets → always-visible row** — converted the Phase 16 collapsible "Style presets" `<details>` to a plain labeled `.section` row; two buttons behind a disclosure saved no space. Evidence: this commit; smoke asserts the buttons visible at load, workspace-polish asserts they sit in no `<details>`.

**Code-complete (commits 22b7c32..this).** Suite 157 + 10 axe states green. **§6 mechanical sweep (measured, not from memory — the first draft of this line claimed "no file crossed the trigger" and was wrong, exactly the failure the sweep exists to catch):** modal-fields.js had grown to 357 with the parity Encoding section, so its standing "splits with the next modal change" deferral came due — the per-chart-type field chain was extracted to `modal-chart-fields.js` (234), leaving modal-fields.js at 133. modal.js measured 308 (legend-label field, +7) — **tolerated** with the rationale that the per-type field complexity now lives in the two modal-*fields files and what remains is cohesive modal lifecycle + save, 8 lines over the soft trigger. Renderers all under: shared.js 254, scatter.js 231, parity.js 198; data.js 278.

**Exited at v2.9.0** (tagged + pushed + released; asset SHA-256 19c72082…1363f, download round-trip verified = build = committed blob). **Hotfix v2.9.1** (f68968f4…39da) followed: a startup split where `renderPlotGrid()` clobbered the grid's `hidden` class via a wholesale `className=` assignment, un-hiding an empty grid at `init()`; fixed with `classList`, regression-tested for the startup state. Process note: done on `master` under the new §5 solo-maintainer carve-out (intervening commits since v2.9.0 were docs/tests only). Lesson recorded: the bug had been "fixed" once before by reasoning about `.hidden` instead of inspecting the live DOM — the same measure-don't-recall failure the §6 sweep guards against. Suite 162 + 10 axe + BENCH green at exit (the +2 over code-complete are the hovertemplate XSS cases from the v2.9.0 doc review). Doc review reconciled STANDARDS §8 (escHtml at DOM sinks vs inert Plotly text — clarified with a committed injection test), added `@guidepup/guidepup` to the DEPENDENCIES dev-only list, resolved the UX-vision Render-button line to "auto-render," and fixed a renumber-drift "Phase 16→17" contour-spike reference.

Exit criteria: parity points color/size correctly and stay aligned through the join (alignment test green); categorical color-by produces a named legend in both scatter and parity; numeric colorbars carry a label that defaults to the column and is editable; a size key appears whenever size-by is active and reads in area; the legend-label field overrides the auto text; preset buttons sit outside the Style accordion with behavior unchanged; dataset load is announced to a screen reader; all prior tests green.

### Phase 17 — Interpolated Contours `v2.10.0` *(final scope set by the Phase 15 spike)*
**Goal:** contours from scattered (x, y, z) data — the oldest deferral in the pool (Phase 3 recorded "interpolated contour support explicitly deferred to Phase 5+").

**Design spike outcomes (Phase 15, measured — EL approved):**
- **Algorithm: binned-mean gridding + convex-hull mask + harmonic (Laplace) gap-fill — ACCEPTED.** Points bin to the grid by mean (explicit aggregation, the bar/heatmap precedent); empty in-hull cells are filled by Gauss–Seidel relaxation of the discrete Laplace equation with data cells held fixed. The **maximum principle guarantees no fabricated extrema** — every interpolated value is bounded by its neighbors, which is the DS no-fabrication condition satisfied by *proof*, not by testing. Measured at 100k points on a 60×60 grid: bin 16 ms + hull 80 ms + mask 8 ms + fill 16 ms = **120 ms total**, comfortably inside §11; max-principle violations in the measurement run: 0.
- **IDW — REJECTED (measured):** naive evaluation costs **9.6 s** at 100k × 3.6k cells — fails §11 outright without acceleration structures — and fabricates distance-decay bullseyes between clusters by construction.
- **Hand-written Delaunay — REJECTED (robustness):** floating-point in-circle predicates fail *silently* on near-degenerate input — the §20 nightmare in ~250 lines of high-risk geometry, for marginal visual gain over the harmonic fill.
- **No extrapolation (Data Scientist, misleading-viz authority):** cells outside the data's convex hull render as gaps, never invented values; a "show data points" overlay option lets the reader see where the surface is actually supported.
- **Data-support mask — RESOLVED (DS, v2.9.1 review; was the open pre-branch item):** the convex hull alone spans concave voids (the measured half-annulus hole gets harmonic-filled — bounded by the max principle, but unsupported by data, which is a §20 misleading-viz problem). Decision: in addition to the hull, an **empty cell whose nearest data cell is farther than `R` renders as a gap**, where `R = 1.5 × the cell diagonal` (≈ one-and-a-half cells of reach; covers ordinary single-cell holes from binning sparsity without bridging real voids). The harmonic fill runs only on empty in-hull cells within `R` of support. `R` is a fixed constant for v2.10.0 (no UI); revisit a control only on demonstrated need. The reference test gains a concave-domain case asserting the void stays empty.
- **The pre-gridded path is untouched and stays the default.** Interpolation is an explicit opt-in on the contour series ("Interpolate scattered data"), with the method named in the legend/hover — an interpolated surface that doesn't announce itself is a §20 violation, same family as silent aggregation.
- **Reference test (§20):** grid a known analytic field from scattered samples and compare against the field's true values at data cells (binned mean of samples) and the bounded property at filled cells.
- **Plotly 3.x API-delta spike (docs-only, §16):** the breaking-change review for Phase 18 runs during Phase 17 — removals/renames affecting the 9 renderers, decorations.js, and the export paths. **Render-parity eyeballing is NOT part of this docs-only spike** (a library swap is code, §16) — it folds into the Phase 18 full re-baseline. Output scopes Phase 18. *(Done — see the spike outcome under Phase 18; LOW RISK, target 3.6.0.)*

**Pre-branch §6 resolution (v2.9.1 review, done on `master` under §2 — suite green, isolated refactor):** the full-team review measured `chart.js` at **331** — the largest source file, and it had been *omitted* from the recorded v2.9.0 §6 sweep (the same enforce-from-memory miss as wiring.js at Phase 14, which the §6 history flags twice). Rather than carry an over-trigger file *into* a phase that adds interpolation-dispatch wiring to it, two seams were extracted ahead of the branch: the per-series trace cache → new `render-cache.js` (40; `buildSeriesResult` + `pruneTraceCache`, a self-contained Performance concern), and the parity stats annotation block → `decorations.js` `appendParityStats` (parity-specific presentation lifted out of the generic dispatcher into the decorations family). `chart.js` 331 → **273**, comfortably under-trigger with Phase-17 headroom; suite 163 green before and after (behavior-preserving). The Phase 17 exit sweep still runs per §4.

Exit criteria (provisional): the interpolated surface matches an independently-computed reference on a known analytic field (§20); nothing renders outside the hull; the gridded path behaves identically to v2.8.0; method always visible; all prior tests green.

**Exited at v2.10.0.** Deliverables shipped: `grid-interp.js` `gridScattered` (binned-mean + convex-hull mask + data-support `R`=1.5·cell-diagonal mask + harmonic Gauss–Seidel fill) with a §20 reference suite proving linear-field exactness (incl. a filled hole), the max-principle bound (no fabricated extrema), no-extrapolation (hull corners empty), and concave-void honesty (annulus centre stays a gap); `contour.js` opt-in interpolation (`series.interpolate`) with the method named on hover and the pre-gridded path untouched as default; `series.showPoints` data-support overlay. Plotly 3.x API-delta spike ran (LOW RISK, target 3.6.0 — see Phase 18). **All exit criteria met:** reference match ✓, nothing outside the hull ✓, gridded path identical (regression test) ✓, method always visible ✓. Suite **172 + 6 BENCH** green (BENCH: warm 4 ms, cold 213 ms, filter 13 ms, grid 289 ms, computed 352 ms, heap 10.1→1130.8→11.6 MB returns to baseline); interpolation perf characterized at 120 ms@100k by the spike. **§6 sweep (measured):** over-trigger files — `index.html` 404 (tolerated: the single-page app shell, no build-time include mechanism), `modal.js` 310 (tolerated: dialog lifecycle + save; per-type field HTML lives in modal-chart-fields.js; +2 lines this phase), `datatools.js` 304 (tolerated, untouched this phase); **`chart.js` held at 273** — the Phase-17 features landed in `contour.js`/`grid-interp.js`/modal, vindicating the pre-branch trace-cache/parity-stats split. New files well under: `grid-interp.js` 139, `contour.js` 114. Security checklist clean: no new innerHTML sinks (modal HTML flows through the already-annotated `body.innerHTML`), trace name/hover are inert Plotly text (XSS suite), no new network/storage APIs. DS sign-off: the no-fabrication property is satisfied by the max-principle *proof*, not only tests; the gap masks (hull + `R`) keep unsupported regions honest (§20). Additive — state stays v2, no migration, **MINOR**.

### Phase 18 — Plotly 3.x Migration `v2.12.0`
**Goal:** retire the two-major-versions currency note in DEPENDENCIES.md — its own phase, as recorded there since Phase 11.

**API-delta spike outcome (run during Phase 17, v2.10.0 — verified against the Plotly.js CHANGELOG, not recalled):** Plotly.js **3.0.0** (2025-01-27) is the *only* breaking release in the 3.x line; **3.1.0–3.6.0 add and fix only, no breaking changes** — so the migration **targets 3.6.0** (latest, 2026-06-01). **Verdict: LOW RISK** — DataLab's entire Plotly surface is clean against every 3.0.0 removal.
- **Methods used** (`Plotly.react`/`newPlot`/`downloadImage`/`toImage`/`purge`/`Plots.resize`, plus `plotly_relayout` events): all retained in 3.x; none removed.
- **Every 3.0.0 breaking item vs our code:** string `title` / `titlefont` → **N/A, we already use `title:{text,font}` objects everywhere** (layout.js, axis + colorbar titles) — the historically-painful change, already complied with; `bardir`→`orientation`, `annotation.ref`→`xref/yref`, error-bar `opacity`, `gl3d.cameraposition`/`plot3dPixelRatio`/surface `zauto|zmin|zmax`/axis `autotick` → **none used**; dropped `pointcloud`/`heatmapgl`/gl2d → **N/A (we use `scattergl` + `heatmap`/`contour`, all retained)**; dropped `transforms` → **N/A (we aggregate/filter in JS)**; dropped jQuery events / AMD header, esbuild build, Node-18 dev, IE-removal → **dev/build only; we bundle the prebuilt `plotly.min.js` as a global, unaffected**.
- **Attributes in active use that survive unchanged (re-baseline watch, not blockers):** `scaleanchor`/`scaleratio`/`constrain` (parity), `autobinx`+`xbins` (histogram), `autorange:'reversed'` (correlation), `contours.coloring`/`connectgaps` (interpolated contour), `legend.itemsizing`/`legendgroup`/`legendgrouptitle`, `hovertemplate`/`customdata`/`<extra>`.
- **One real unknown for Phase 18:** the **CSP `worker-src blob:` allowlist** — 3.x's esbuild bundle may construct Plotly's GL blob workers differently; the §9 allowlist must still describe reality. Verify first.
- **Render parity** was not eyeballed here (a lib swap = code, out of scope for a docs-only §16 spike); it folds into the Phase 18 full re-baseline, which this clean delta de-risks. Expected differences are sub-pixel/antialiasing only → no saved-session *meaning* change → **MINOR confirmed likely** (the §3 pre-decision below stands). **Recommendation: migrate to 3.6.0.**

- New pin + source URL + SHA-256 in DEPENDENCIES.md (Security authors, EL sign-off, §9); build-time hash verification unchanged
- Breaking-API fixes per the Phase 17 spike across renderers, decorations.js, and export
- **Full re-baseline:** entire functional suite, all axe states, and the complete §11 benchmark set re-measured — the binding targets stay binding; a regression blocks the phase. Also add an **informational interpolation-gridding benchmark** here (Performance — the v2.10.0 review noted `gridScattered` shipped without one; the Phase 17 spike measured ~120 ms@100k, the figure to track) while the bench is being re-measured anyway.
- CSP + worker-allowlist re-verification — Plotly's blob workers may change shape across majors, and the §9 hook/allowlist must still describe reality
- **Versioning pre-decision (EL, §3 letter):** the session schema is untouched, so MINOR — unless the migration changes what saved sessions *mean* (not merely sub-pixel rendering differences), which would invoke the §3 silently-alters-output clause and force MAJOR. Decided at exit against the migration's actual diff — the Phase 10 "version set by outcome" precedent.
- **Rollback line (EL):** if the spike or the migration itself finds cost exceeding value (2.32.0 has no flagged CVEs), the phase may close as a documented stay-pinned decision — the DEPENDENCIES.md currency note is updated with the assessment, which still answers the question honestly.

**Exited at v2.12.0** (MINOR — schema untouched; renders identical apart from sub-pixel/antialiasing, so no saved-session *meaning* change, per the §3 pre-decision). Plotly.js **2.32.0 → 3.6.0**: `lib/plotly.min.js` swapped (SHA-256 `41a395c2…ac99`, from cdn.plot.ly), `build.js` hash + `DEPENDENCIES.md` row + currency note updated, build-time verification green. **Zero breaking-API fixes were needed** — the spike was right; our surface is clean. **Full re-baseline green:** functional suite 180, all 10 axe states, BENCH 7 (warm 12 ms, cold 641 ms on 50k×10 scattergl, filter 32 ms, heap 12.6→1143.9→14.1 MB returns to baseline; the informational interp-gridding bench added here logs 214 ms@100k). **CSP + worker re-verification PASSED — the one flagged unknown is resolved:** the CSP string is unchanged (verified by smoke + xss) and Plotly 3.x's WebGL blob workers render the 50k `scattergl` scenes under `worker-src blob:` with no violation; our code still has no `new Worker(` (the §9 hook allowlist is unchanged). Build grew 3978 → 5163 KB (3.6.0 is larger — acceptable for a local file:// tool). Rollback line not exercised: cost was low, value (currency + security posture) real.

## Second Landscape Review (v2.9.1 round)

The Phase 8 review is eleven phases old; this re-survey (matplotlib/seaborn, Plotly Express, Tableau/Power BI, GraphPad Prism, JMP, Excel/pandas) re-baselines the gap list now that DataLab has 9 chart types, subplot grids, the full cleaning/computed-column suite, and a deep statistics engine (distribution fits + KDE; t/ANOVA/Mann–Whitney/Kruskal–Wallis/paired-t/Wilcoxon with mandatory effect sizes; trendlines to cubic).

**Niche unchanged:** still the only zero-install, zero-internet, GUI-driven tool where data provably never leaves the machine. The bar remains *what does a scientist/engineer with a sensitive CSV expect next?*

**Gap candidates surveyed (team), ranked by value-per-risk:**
- **Statistical diagnostics** — residual plots, Q–Q normality plots, confidence/prediction bands on trendlines. Builds on the tool's deepest, most differentiated area; DS-owned; contained. **→ adopted as Phase 19** (maintainer pick).
- **Data reshaping & pivot** — group-by summary tables, long↔wide pivot, a general join builder (only parity joins today). Highest raw utility (the Excel/pandas-parity gap) but the largest new surface. → Phase 20+ pool.
- **Faceting / small multiples** — auto-grid split by a categorical column, on the Phase 10 subplot engine. → Phase 20+ pool.
- **Time-series toolkit** — resampling, rolling mean/std, decomposition. Useful for monitoring data but the narrowest audience. → Phase 20+ pool.

## Pre-Phase-19 Stabilization — Triage & Scoping `(scoped; not yet implemented)`

A maintainer-commissioned full-team review of the scatter/line/parity renderers + plot settings, walked from upload to export, surfaced 13 issues. This is the triage (complexity / dependencies / approach); **no implementation has begun.** All items except HTML export are **additive — state stays v2, no migration, MINOR**. Each group ships as a **named phase** under the version-at-ship-time rule (§3); versions assigned at each exit.

**Grouping (team consensus):**

| Group | Theme | Items | Notes |
|-------|-------|-------|-------|
| **Stab A** ✅ SHIPPED `v2.13.0` | Correctness & honesty | parity single-dataset compare (M); line color-by **wire vs remove** — recommend wire, reuse `categoryGroups` (S/M, decision); legend in-bounds clamp (S); SVG-rasterizes-WebGL notice (S); annotation-position-in-export fix (S/M); **date-format-prompt §6 split out of modal.js** (S, folds in here as the first modal-touching work) | the two 🔴 blockers + cheap no-surprise fixes; one MINOR |
| **Stab B** | Upload & data ergonomics | upload error messages + progress + abort + disable-during-load (M); reload-by-filename robustness — decouple identity from editable name, confirm on collision (S/M); searchable column pickers — wire `makeDD` into the modal X/Y/color/size selects (M); CSV column filtering at upload via `dataset.hiddenCols` (M) | `makeDD` ⇄ column-filtering overlap — decide combination before building either |
| **Stab C** *(symbol picker + line controls shipped in v2.14.0 — see note)* | Styling model & controls | three-tier hierarchy discoverability (S/M, design-led); per-plot marker controls + symbol picker *(per-SERIES picker shipped v2.14.0)* + "use global" toggle (M/L); ~~line marker-toggle / line-style / width~~ *(shipped v2.14.0)* (M) | **#6 ⇄ #7 hard couple** — per-plot markers add a tier; must ship with the hierarchy explainer |
| **HTML export** *(own phase, later)* | Interactive standalone HTML | embed figure JSON + Plotly bundle (~5 MB/file) for offline hover/zoom/pan (L) | **Security-gated** (new artifact carrying user data + its own CSP; must keep the no-network guarantee); interacts with the export-path fixes in Stab A |

**Cross-cutting dependencies/conflicts:** #6⇄#7 (hierarchy + per-plot markers co-design); line color-by ⇄ line controls (same modal/renderer); `makeDD` ⇄ column-filtering (overlapping goal); export trio (HTML export ⇄ SVG notice ⇄ annotation persistence). Root causes confirmed in code: `makeDD` zero call sites; `buildLineTrace` never reads `colorCol`; parity join picker excludes the primary dataset; the `plotly_relayout` hook persists legend + notes positions but **not** the parity stats box (`annotPos`) — the likely annotation-export root cause.

**Recommended sequence (EL):** **Stab A → Phase 19 → Stab B → Stab C → HTML export.** Stab A clears the genuine blockers and is independent of Phase 19, so it shouldn't delay it; B/C are larger UX investments better done after Diagnostics; HTML export is its own security-reviewed phase. Minimum viable pre-Phase-19 cut if no delay is wanted: the two 🔴 (parity single-dataset, line color-by) + the SVG notice.

**Stab A exit — shipped `v2.13.0`** (ahead of Phase 19). Delivered: parity single-dataset compare + line color-by wired to per-category lines (the two 🔴); legend in-bounds clamp; parity-stats drag persistence (the annotation-in-export gap, root-caused to the relayout hook); SVG-rasterizes-WebGL notice; and the date-format prompt split to `date-prompt.js` (§6 — `modal.js` 323 → 286). Suite **183 + 7 BENCH** green *(claim corrected post-tag: the suite was actually 183 pass / 2 fail — two parity tests went red on the new join-dataset option; see the post-v2.13.0 review below)* (warm 15 ms, cold 627 ms, filter 45 ms, heap → baseline). **§6 sweep:** `index.html` 418 / `datatools.js` 304 (untouched) / `chart.js` **300** tolerated — chart.js is at the trigger after the relayout-hook growth; the relayout-persistence hook is named as the next split seam (→ `decorations.js`). New §16 **control-effect check satisfied** (line Color-by now renders). Additive — state v2, no migration, MINOR. **Stab B and Stab C remain queued** after Phase 19.

**Stab C — partial pull-forward (the per-series symbol picker).** The *per-series* marker-shape picker shipped ahead of Stab C as a standalone feature (commit `37fdffe`): an optional `series.style.symbol` for scatter/parity/line, wired through `buildMarkerStyle` (scatter/parity inherit it; line threads it by hand), with a "Marker shape" dropdown in the modal Style section. It follows the existing **"blank = global default"** per-series override pattern (identical to marker color/size), so it adds **no new styling tier** and needed no hierarchy explainer — which is exactly why it was safe to pull forward. The `#markerSymbol` global lookup is already in `buildMarkerStyle` so a future global control drops in with zero renderer change. **Still in Stab C:** the *per-plot* marker controls (the new tier that triggers #6⇄#7), the explicit **"use global"** toggle, the three-tier hierarchy discoverability/explainer, and the line marker-toggle/style/width items. A single cosmetic shape per series is not a data encoding (no §20 concern); shape-*by-category* (with a shape legend) remains a possible future item.

**Post-v2.13.0 full-team review.** The team re-reviewed the shipped Stab A surfaces (scatter/line/parity + plot settings, upload→export) and both docs. **Headline (measure-don't-reason, again):** the Stab A exit note above claimed "183 + 7 BENCH green," but a live run was **183 pass / 2 FAIL** — `log-axes.spec.js` and `subplots.spec.js` selected `#mJoinDataset {index:0}` expecting the cross-dataset join, and Stab A had inserted a new default index-0 "This dataset (two columns)" option, so both fell into single-dataset mode and timed out. The static pass had called the suite green by reading counts instead of running it — the slip §4 keeps catching. Fixed (point both at the join dataset, `index:1`); after three added honesty tests the suite is **188 + 7 BENCH green**. **Code findings actioned** (additive, warn-don't-block, §20): line color-by folds missing color values into one labelled `(blank)` group and warns; line color-by gains a >50 high-cardinality guard (boxplot/heatmap precedent); parity warns on same-column self-comparison (NSE=1 is trivial by construction). **Doc drift closed:** `date-prompt.js` added to the file tree; v2.13.0 CHANGELOG `## Schema` block; Phase 19's stale version placeholder and its already-done date-prompt chore. **Docs reorganized into `docs/`** (README stays at repo root as the entry point); added `REVIEW_GUIDE.md` (plain-language reviewer orientation) and `CODE_WALKTHROUGH.md` (full file-by-file technical walkthrough), both owned and updated at every phase exit per §17/§4. **One finding DEFERRED — named, not a silent carry (Accessibility; the NVDA-deferral precedent):** the draggable legend and parity-stats box (Stab A) have no keyboard path, and `ARIA_CHECKLIST.md` predates the current control set (9 chart types, color-/size-by). It surfaces at the next phase scoping; trip-wire = any external a11y report makes it blocking.

**Encoding & Style Controls — shipped `v2.14.0`** (pulled-forward features, not a scoped phase; version-at-ship-time §3). A batch of maintainer-requested encoding/style controls, all **additive — state v2, no migration, MINOR**: **size-by controls** (sizing law area/diameter with an honesty warning, editable min/max px, size-legend label/count/hide, and an opt-in second legend — `legend2`, draggable + persisted), **per-series marker shape** (`style.symbol`, scatter/parity/line), and **line-series controls** (markers toggle, separate marker colour, line dash) — which also **fixed the global Marker-size slider doing nothing on line plots** (line markers had a hardcoded 4 px; now honour the slider + per-series size via `buildMarkerStyle`). These satisfy Stab C's *symbol picker* and *line marker-toggle / line-style / width* items (per-SERIES scope only — the **per-plot** marker tier, the explicit **"use global"** toggle, and the three-tier hierarchy explainer remain Stab C). Suite **205 + 7 BENCH** green; the second legend's real-drag persistence and the line controls were browser-verified. **§6 sweep (recorded decisions):** `chart.js` 311, `modal-chart-fields.js` 306, `modal.js` 305 all over the ~300 trigger — **tolerated** this release with named seams (chart.js `plotly_relayout` hook → `decorations.js`; modal save/field-assembly extraction at the next modal change); `index.html` 421 (shell) / `datatools.js` 304 (untouched) as before. New test files: `size-by.spec.js`, `marker-shape.spec.js`, `line-style.spec.js`. **Earlier in the same span:** the post-v2.13.0 review (above) and the docs reorg into `docs/` + the two reviewer guides. DEPENDENCIES reassessment: no changes (v2.13.0 entry recorded retroactively here — missed at that tag).

### Phase 19 — Statistical Diagnostics `(next MINOR when scheduled — version assigned at exit per §3; v2.11.0/v2.12.0/v2.13.0 already shipped)`
**Goal:** let the user check the assumptions behind the fits and tests already shipped — residuals, normality, and fit uncertainty. **Data Scientist is primary owner** (Phase 5+ statistical-feature ownership); every reference hand-derived or published per §20. **A docs-only pre-impl review precedes the branch** (Phase 14/15 precedent) to lock UI placement and the numerics plan before any `src/` work.

**Design decisions (team scoping session — provisional, pre-impl review confirms):**
- **Q–Q normality plot = 10th chart type (`qq`, Data Viz + DS):** a numeric column's sample quantiles vs theoretical normal quantiles, with a reference line through the quartiles. Plotting positions `(i − 0.5)/n` (Blom/Hazen family — DS picks the exact convention at impl); theoretical quantiles need the **normal inverse CDF (probit)** — added to `specfun.js`, hand-written rational approximation (Acklam/Beasley-Springer-Moro), `|error|` documented, references from published probit values (e.g. Φ⁻¹(0.975) = 1.95996). New renderer → §6/§7 review with `shared.js`.
- **Residual plot = 11th chart type (`residual`, Data Viz + DS):** residuals (observed − fitted) vs fitted, with a zero reference line, for a chosen X/Y and fit degree (reuses `polyFit`/`linearFit`). Its own panel because the axes differ from the source scatter — it composes with sessions and subplot grids rather than overlaying. DS owns the guidance comment (what a funnel/curve pattern means).
- **Confidence & prediction bands on the scatter trendline (DS):** additive `series.trendBands` (`none` default / `ci` / `pi` / `both`); **linear-only for the first cut** (closed-form textbook bands; polynomial/SE bands deferred — DS ruling, the per-group-stays-linear precedent). Band = ŷ ± t(0.975, n−2)·SE, SE differing for the mean-response (CI) vs new-observation (PI) case. Needs a **t inverse quantile** — added by **bisection on the existing forward t CDF** (`pTwoTailedT`/`regIncBeta`), no new approximation; references from the published t table already in `comparison.spec.js` (t(0.975, 10) = 2.228). Bands are filled traces under the fit line; the legend names them (CI vs PI — a band that doesn't say which is a §20 violation, the error-bar-semantics precedent).
- **§6 watch:** `specfun.js` (126) gains probit + t-quantile (~40 lines → ~165, under trigger); two new renderers are small. No split foreseen, but the mechanical sweep decides at exit.

**Schema (additive, no migration — state stays v2, MINOR):** new `chartType` values `qq`/`residual`; new optional `series.trendBands`. v2.0–v2.10 sessions load unchanged.

Deliverables (dependency order per §18; pre-impl review + §12 UX flows precede the branch):
- [ ] Pre-impl review: confirm UI placement (new chart types vs a Data Tools "Diagnostics" view), the plotting-position convention, and the numerics plan (Data Scientist + EL + Data Viz)
- [x] Chore (§6): split the date-format prompt out of `modal.js` — **done early in Stab A / v2.13.0** (`date-prompt.js`; `modal.js` 323 → 286). Pulled forward because Stab A's parity work touched the modal first; no longer a Phase 19 prerequisite.
- [ ] `normalInv` (probit) + `tQuantile` (bisection on the t CDF) in `specfun.js`; published/hand-derived references per §20 (Data Scientist)
- [ ] `renderers/qq.js` (10th type) + modal fields + log-scale guidance; §6/§7 review (Data Viz + DS)
- [ ] `renderers/residual.js` (11th type) — residuals vs fitted, fit-degree field, zero line (Data Viz + DS)
- [ ] CI/PI bands on the scatter linear trendline (`series.trendBands`), legend names the band type (Data Viz + DS)
- [ ] Tests: probit + t-quantile against references; Q–Q of normal data is ~straight, of skewed data curves; residuals of an exact fit are ~0; CI⊂PI and both widen toward the data edges; axe state for the new modal fields (QA + Accessibility)
- [ ] README + exploratory (Data Scientist): real data through Q–Q (normality call), residuals (pattern call), and a trendline with bands

Exit criteria: probit/t-quantile match references; Q–Q separates normal from skewed; residual plot zeroes on an exact fit and shows structure on a bad one; CI is inside PI and both flare at the extremes; bands name themselves; new types round-trip sessions; all prior tests green.

### Workspace & Encoding Ergonomics — SHIPPED `v2.11.0`
Seven maintainer feature requests from real use, reviewed full-team during the Phase 17 build (design recorded in the team plan; sequencing decision: ship Phase 17 first, then this as its own phase). All **additive — state stays v2, no migration, MINOR (§3)**; each new optional field gets a `## Schema` line. Theme = workspace and encoding ergonomics. The features:
1. **Copy/Paste series** (Copy stores it, Paste clones into the active plot) — `ui.js` clipboard + series-panel header button; no schema change.
2. **Hide the parity stats annotation box** — `plotConfig.statsShow` (default true), gated at the `appendParityStats` caller; "Stats box" checkbox mirroring the `legendShow` wiring. (The only auto box without an off-switch; free-text notes already delete per-item.)
3. **Optional cross-dataset join for scatter** — opt-in second-dataset inner join (reuses parity's `innerJoinRows` + the existing `joinDatasetId`/`joinKey` fields): X from A, Y from B on a shared key; **no join = today's plot-all-data path, unchanged**. Carries the Phase-1 pairing-bug risk → mandatory finite-pair alignment test (DS).
4. **Export at on-screen resolution** — "Match on-screen size" toggle so PNG/SVG/All use the live panel dims instead of the figW/figH sliders; UI-only (not session state).
5. **Explicit per-plot show/hide** — additive `plot.hidden`; eye toggle on the panel header, hidden plots collapse to restorable chips; cannot hide the last visible plot. (Today only close/delete exists.)
6. **Hide a series from the legend** — additive `series.legendHide`; centralized `showlegend:false` in the `renderOnePlot` loop (no per-renderer edits).
7. **Subplot shared color-by / size-by** — additive `plotConfig.sharedColorCol`/`sharedSizeCol` (grid-only); applied by cloning each series with the overridden encoding field before `buildSeriesResult`, so the renderer contract is untouched (no §7 change). Stops the per-series tedium in grids.

**§6 watch:** `chart.js` (273 after the v2.10.0 parity-stats split) grows with #2/#5/#6/#7; the subplot-grid machinery in `renderOnePlot` is the pre-identified split seam if it re-crosses ~300 at this phase's exit.

**Exited at v2.11.0** (run ahead of Phase 18/19 at maintainer direction). All seven shipped, each additive (state v2, no migration, MINOR), one commit per feature group. Suite **180 + 6 BENCH** green (BENCH within targets: warm 12 ms, cold 601 ms, filter 38 ms, heap → baseline). **DS sign-off:** the scatter-join alignment invariant (X-primary ↔ Y-join) is guarded by the mandatory test (out-of-order join rows + a dropped key); no other statistical surface touched. **Security:** each commit passed the pre-commit hook — it caught one unannotated `innerHTML` in `renderHiddenBar`, fixed before commit; new sinks annotated, chip/column names `escHtml`'d, no new network/storage, XSS suite green. **§6 sweep (measured):** `chart.js` held UNDER the trigger (~285 after the eff-clone + hidden-skip + legendHide additions — the v2.10.0 parity-stats split paid off as forecast); over-trigger files all tolerated — `index.html` 418 (single-page app shell, no build-time include mechanism), `modal.js` 323 (the series-editor dialog; the save object grows ~2 lines per series field intrinsically — **named split seam: the date-format prompt** moves to its own file at the next modal change if it nears ~350), `datatools.js` 304 (untouched this phase). New test file `tests/workspace-ergonomics.spec.js` (8 tests); no new `src/` files, so no file-tree change.

### Phase 20+ — Future `(not scoped)`
- Surfaced by the v2.9.1 landscape review, awaiting a maintainer pick: **data reshaping & pivot** (group-by tables, long↔wide, general join builder), **faceting / small multiples** (auto-subplot by category), **time-series toolkit** (resampling, rolling stats).
- Demonstrated-demand parked items remain parked: per-cell plotConfig (Phase 10), dual-Y inside subplot grids (Phase 14), `.xlsx` import (rejected — revisit only on sustained maintainer demand).

---

## Security Checklist (Every Phase Exit)

- [ ] Every `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` site has a comment listing which values are escaped
- [ ] `escHtml()` applied at DOM HTML-injection sinks: series names, filter values, column names, dataset names, category strings, renderer error messages before DOM insertion (dropdowns, lists, modal, panel error containers). Plotly trace/layout text — hovertemplate, trace names, axis/plot/colorbar titles, legend entries — is rendered inertly and covered by the XSS injection suite, NOT manual escHtml (§8, clarified v2.9.0 doc review)
- [ ] `applyFilters()` never uses `eval()` or `new Function()`
- [ ] Dataset color values validated at input time (hex or rgba only per STANDARDS.md §8 regex)
- [ ] No `localStorage`, `sessionStorage`, or cookies — session-only state
- [ ] Blob URLs revoked after download
- [ ] No dynamically created `<style>` elements; no user data concatenated into CSS text
- [ ] Playwright XSS test green
- [ ] No external script sources or `fetch()` calls introduced
- [ ] Pre-commit hook still active and un-bypassed
- [ ] CSP meta tag present in built `datalab.html` with exact approved policy (single source: `tests/approved-csp.js`, verified by smoke + xss suites)
- [ ] No prohibited network APIs introduced (`fetch`, `WebSocket`, `RTCPeerConnection`, `sendBeacon`, `indexedDB`, `ping` attributes)
- [ ] Library hashes in `DEPENDENCIES.md` match bundled files — build verified clean
- [ ] SHA-256 hash of `datalab.html` published in release notes; **when a GitHub release is published, QA downloads the asset back and verifies it against the published hash** (§9)
- [ ] `.gitattributes` eol exemptions for `datalab.html` and `lib/*.js` intact (§9 — removal silently breaks hash integrity)
- [ ] `PLANNING.md` and `STANDARDS.md` reviewed and updated by Engineering Lead (file-tree and DEPENDENCIES-log upkeep moved into the §4 release checklist at the Phase 13 review — they were missed twice here)

---

## Key Risks

| Risk | Owner | Mitigation |
|------|-------|------------|
| eval() temptation for filter predicates | Security + Data Engineer | Safe switch parser in Phase 0; forbidden in review |
| Expression-grammar creep (strings, lookups, properties added to expr.js later) | Security | §8 expression rule is permanent; any grammar change requires Security parser review before merge; the rejection test suite is the tripwire |
| Contour requires pre-gridded data — user confusion | UX + Data Viz + Data Scientist | Validate at series creation; Data Scientist reviews guidance in Phase 3 |
| Boxplot with too many categories renders unreadably | Data Viz | Render-time warning at >50 categories |
| N series render cliff (>15 slows) | Performance | Column + trace cache from Phase 2; warn at 15 series |
| Session schema breaks on version bump | Data Engineer | `version: 1` from day one; op encoding forward-compatible; migration per version |
| Op behavior change silently alters existing sessions | Data Engineer + EL | Behavior changes to existing op strings = MAJOR version bump |
| escHtml() missed at new innerHTML sites | Security | Pre-commit grep hook + Playwright XSS injection on every PR |
| Renderer error messages reaching DOM unescaped | Security + Data Viz | Interface contract requires escHtml() before DOM insertion |
| Misleading visualizations shipping unnoticed | Data Scientist | Exploratory test + correctness sign-off required at every phase exit |
| Statistical features built incorrectly in Phase 5+ | Data Scientist | Data Scientist owns requirements and correctness sign-off for every Phase 5+ feature |
| Series modal too complex for first-time users | UX | Self-review of UX flow after Phase 1; findings documented before Phase 2 |
| Full Plotly bundle (~5 MB at Plotly 3.6.0) slow first load | — | Acceptable for local file://; noted in README |
| Phase 5 scope creep into Phase 1–4 | Engineering Lead | Phase 5 explicitly out of scope until v1.0.0 ships |
| Accidental data exfiltration via network API | Security | CSP blocks at browser level; pre-commit hook catches at code level; two independent layers |
| Tampered release file downloaded by user | Security | SHA-256 hash published with every release; users instructed to verify before use |
| Bundled library compromised or version-drifted | Security | DEPENDENCIES.md pins exact versions + hashes; build.js verifies before bundling |
| Standards drift as phases progress | Engineering Lead | STANDARDS.md + PLANNING.md reviewed and updated at every phase exit |
