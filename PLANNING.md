# datalab — Full Team Planning Document

## What This Tool Is

A standalone HTML file for data science work — starting with visualization and expanding to data cleaning and statistical analysis. Zero barrier to entry: open the file in any browser, no server, no install, no internet required.

**Workflow vision:** Load CSVs → explore with plots → clean/filter data → run stats → export results.

**Phase 1–4 scope:** Visualization only (multiple chart types, N datasets, N series, filters).
**Phase 5+ scope:** Data cleaning UI, statistical summaries, distributions, correlation matrices — designed in but not built yet.

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

> **Authoritative schema lives in `src/js/state.js`** — the sketch below is the orientation copy. (Phase 11 review: it drifted again between Phases 8 and 10; the refresh is now an explicit item on the phase-exit security checklist so it cannot be skipped silently.)

```js
const appState = {            // state version 2 (Phase 7; additive since)
  version: 2,
  datasets: [
    // { id, name, rows, headers, color, dateFormats? }
  ],
  series: [
    // {
    //   id, name, plotId, datasetId, xCol, yCol, colorCol, chartType,
    //   // chart-type-specific: zCol (contour); binCount, fitNormal (histogram);
    //   // joinDatasetId, joinKey, band5, band10 (parity);
    //   // agg, errMode (bar, Phase 9); errCol, trendline (scatter/line, Phase 9)
    //   cell,    // { row, col } subplot cell, Phase 10 — default 1·1
    //   filters: [{ col, op, value, enabled }], filterLogic,
    //   style: { color, markerSize, opacity, lineWidth }, enabled
    // }
  ],
  plots: [
    // { id, name,
    //   plotConfig: { title, xLabel, yLabel, *Locked flags, annotPos,
    //     legendShow, legendPos, xMin/xMax/yMin/yMax, xLog, yLog /* Phase 9 */ },
    //   grid }  // { rows, cols, shareX, shareY } | null — Phase 10
  ],
  activePlotId,
  style: { markerSize, markerOpacity, edgeColor, edgeWidth, colormap },
  savedPlots: [],
  plotRendered: false,
};

// Session file = { _schema: 'datalab-session', app, saved, state: {...appState} }
// Serializes cleanly with JSON.stringify — no DOM parsing.
// Migrations per state version live in sessions.js (v1 → v2 shipped Phase 7);
// everything since Phase 7 is additive-with-defaults (no migrations, §3).
// Import validates all ids against /^[\w-]{1,64}$/ (Phase 8 security fix).
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
// buildTrace(series, datasets) → { traces: Plotly.Data[], error: string | null,
//                                  warning?: string | null }
// (warning added Phase 3; parity additionally returns layout/stats/annotSR —
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
4. "Render" button (or auto-render with debounce once columns are set)

**Modal field matrix** — all chart types share: X col, Y col (where applicable), color-by col, filters, style. Chart-type-specific fields:

| Chart type | Specific fields | Notes |
|------------|----------------|-------|
| scatter | error ± column, linear trendline (Phase 9); size col never implemented (Phase 8 record correction — future candidate) | per-group trendlines opt-in planned Phase 11 |
| line | line width; error ± column (Phase 9) | — |
| bar (Phase 9) | category X, aggregation (none/count/sum/mean/median), SD/SEM error bars (mean only) | silent aggregation forbidden (§20) |
| parity | join dataset, join key, show ±5% band, show ±10% band | Requires two loaded datasets; Y options come from the JOIN dataset (Phase 9 fix) |
| contour | Z col (third numeric column) | Requires pre-gridded/equally-spaced data; validated at creation |
| histogram | bin count (FD default, render-time); fit normal (Phase 5) → fit picker + KDE planned Phase 11 | Client-side binning |
| boxplot | X col (optional, categorical); Y col (numeric) | Max 50 categorical X values; render-time warning if exceeded |
| violin (planned Phase 11) | as boxplot | Plotly-native trace |

All chart types additionally get a Cell picker when the target plot has a subplot grid (Phase 10).

Datetime columns are shown in column pickers but disabled with tooltip: "datetime columns supported in Phase 3."

---

## File Structure

> Refreshed at Phase 8 scoping — the block had drifted (missing the Phase 3–7 file splits).

```
datalab/
  src/
    index.html
    style.css           — includes .sr-only utility class
    js/
      state.js          — appState schema, VERSION, escHtml
      data.js           — parseCSV, applyFilters, classifyColumn, datetime detection
      ui.js             — makeDD, dataset panel, series list
      modal.js          — series editor modal + date format prompt
      modal-fields.js   — per-chart-type modal fields (split Phase 3)
      filters.js        — filter row UI
      grid.js           — multi-plot live grid, active plot (Phase 7)
      chart.js          — renderPlot dispatcher, trace cache
      layout.js         — plot theme + base layout (split Phase 6 exit)
      export.js         — PNG/SVG download, ZIP, style presets
      sessions.js       — session export/import + state migrations
      stats.js          — statistical engine + cleaning ops (Phase 5)
      datatools.js      — Data Tools modal (Phase 5)
      saves.js          — saved plot snapshots strip
      wiring.js         — event wiring, dropzone, bootstrap
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
  PLANNING.md
  STANDARDS.md
  ARIA_CHECKLIST.md
  DEPENDENCIES.md     — pinned versions + verified source URLs + SHA-256; build.js verifies before bundling
  README.md
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
- **Computed columns — future, security-spike-first:** highest-utility future item (Data Engineer), but any formula feature must satisfy the new STANDARDS §8 expression-evaluation rule (no string-to-code path). Design spike before any scoping.

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
- [ ] Maintainer action (carried since v1.0.0, non-blocking): manual screen reader session — NVDA on Windows now satisfies the primary requirement per amended STANDARDS §15

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
- [ ] UX flow descriptions for the fit picker, KDE toggle, violin fields, per-group-fit checkbox — before branches, per §12 (UX Designer)
- [ ] `stats.js`: `fitLognormal`, `fitWeibull` (MLE + Newton guard), `kdeBinned` — references via independent tool per §20 (Data Scientist + QA)
- [ ] Histogram fit picker + KDE overlay, `fitNormal` back-compat (Frontend + Data Viz + Data Scientist)
- [ ] `renderers/violin.js` (8th type) + modal fields + badge; §6 review with shared.js (Data Viz + Data Scientist)
- [ ] Per-group trendlines, opt-in, ≤ 10 groups with warning (Data Viz + Data Scientist) *(parallel-safe with violin)*
- [ ] Computed-columns security spike document (docs-only): AST evaluator + operator allowlist design per §8 → Phase 12 scope or rejection (Security + Data Engineer; EL approves)
- [ ] Tests: fit references, KDE integration ≈ 1, violin validation errors, per-group fit cap, back-compat fitNormal session; axe states extended for new modal fields (QA + Accessibility)
- [ ] README feature updates (UX)
- [ ] Exploratory test: real datasets through fits/KDE/violin/grouped-fit paths (Data Scientist — at exit)

Exit criteria: lognormal/Weibull/KDE match independent-tool references; a v2.x session with `fitNormal: true` renders identically; violin renders with validation errors on wrong input; per-group fits are opt-in, capped, palette-matched; the spike doc is approved or rejected with rationale; a fresh clone gets a working hook by following the README; all prior tests green.

### Phase 12+ — Future `(not scoped)`
- Computed columns — gated on the Phase 11 security spike outcome (§8 expression-evaluation rule)
- Distribution comparison tests (t-test, ANOVA) — Data Scientist owns scope
- Dual Y axis — gated on Data Scientist conditions (see Landscape Review decision record)
- Log-space histogram binning (deferred from Phase 9's log-axes work)
- Type casting to datetime; column reorder; scatter size-by column (Phase 1 design intent, never built)
- Interpolated (non-gridded) contours; free-text plot annotations; general-purpose heatmap chart type; higher-order trendline fits

---

## Security Checklist (Every Phase Exit)

- [ ] Every `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` site has a comment listing which values are escaped
- [ ] `escHtml()` applied to: series names, filter values, column names, dataset names, titles, labels, category strings in hovertemplates, renderer error messages before DOM insertion
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
- [ ] `PLANNING.md` and `STANDARDS.md` reviewed and updated by Engineering Lead; the State Architecture orientation sketch and file tree reflect the shipped phase

---

## Key Risks

| Risk | Owner | Mitigation |
|------|-------|------------|
| eval() temptation for filter predicates | Security + Data Engineer | Safe switch parser in Phase 0; forbidden in review |
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
| Full Plotly bundle (3.8 MB) slow first load | — | Acceptable for local file://; noted in README |
| Phase 5 scope creep into Phase 1–4 | Engineering Lead | Phase 5 explicitly out of scope until v1.0.0 ships |
| Accidental data exfiltration via network API | Security | CSP blocks at browser level; pre-commit hook catches at code level; two independent layers |
| Tampered release file downloaded by user | Security | SHA-256 hash published with every release; users instructed to verify before use |
| Bundled library compromised or version-drifted | Security | DEPENDENCIES.md pins exact versions + hashes; build.js verifies before bundling |
| Standards drift as phases progress | Engineering Lead | STANDARDS.md + PLANNING.md reviewed and updated at every phase exit |
