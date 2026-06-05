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

> **Authoritative schema lives in `src/js/state.js`** — the sketch below is the orientation copy, updated at phase exits. (Record correction, Phase 8 scoping: this block had drifted — it still showed the v1 singleton `plotConfig` two phases after the v2 migration shipped.)

```js
const appState = {            // state version 2 (Phase 7)
  version: 2,
  datasets: [
    // { id, name, rows, headers, color, dateFormats? }
  ],
  series: [
    // {
    //   id, name, plotId, datasetId, xCol, yCol, colorCol, chartType,
    //   // chart-type-specific: zCol (contour), binCount/fitNormal (histogram),
    //   // joinDatasetId, joinKey, band5, band10 (parity)
    //   filters: [{ col, op, value, enabled }], filterLogic,
    //   style: { color, markerSize, opacity, lineWidth }, enabled
    // }
  ],
  plots: [
    // { id, name, plotConfig: { title, xLabel, yLabel, *Locked flags,
    //   annotPos, legendShow, legendPos, xMin/xMax/yMin/yMax } }
  ],
  activePlotId,
  style: { markerSize, markerOpacity, edgeColor, edgeWidth, colormap },
  savedPlots: [],
  plotRendered: false,
};

// Session file = { _schema: 'datalab-session', app, saved, state: {...appState} }
// Serializes cleanly with JSON.stringify — no DOM parsing.
// Migrations per state version live in sessions.js (v1 → v2 shipped Phase 7).
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
| scatter | size col (optional) | **Record correction (Phase 8 scoping): size col was never implemented** — no phase record claims it shipped; left here as design intent, candidate for a future phase |
| line | line width | — |
| parity | join dataset, join key, show ±5% band, show ±10% band | Requires two loaded datasets |
| contour | Z col (third numeric column) | Requires pre-gridded/equally-spaced data; validated at creation. Data Scientist to review guidance in Phase 3 |
| histogram | bin count (user-configurable; default uses Freedman-Diaconis rule, computed at render time) | Client-side binning, no server needed |
| boxplot | X col (optional, categorical); Y col (numeric) | Max 50 categorical X values; render-time warning if exceeded |

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
        parity.js / scatter.js / line.js / contour.js / histogram.js / boxplot.js
  lib/
    plotly.min.js       — Full bundle
    papaparse.min.js
    jszip.min.js
  tests/
    smoke.spec.js       — Smoke render test; runs on every PR
    bench.spec.js       — Performance benchmark; runs on release (BENCH=1)
    xss.spec.js         — XSS injection suite; runs on every PR
    a11y.spec.js        — axe ARIA audit (5 app states)
    parity-stats.spec.js — statistical correctness regression tests
    series-list.spec.js — series list interaction tests
    reload-validation.spec.js — dataset reload + keyboard nav tests
    multi-series.spec.js — Phase 2 exit criteria scenario
    phase3-exit.spec.js / phase3..phase7.spec.js — phase exit scenario suites
    data/
      README.md         — Dataset specs and sourcing instructions (QA-owned)
      test_*.csv        — Committed synthetic datasets (max 500KB each)
  build.js
  PLANNING.md
  STANDARDS.md
  ARIA_CHECKLIST.md
  DEPENDENCIES.md     — pinned library versions + SHA-256 hashes; build.js verifies before bundling
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

Deliverables (dependency order per §18; Security flagged items 2–3 as must-precede file-import work):
- [x] "Figure size" → "Export size" relabel + autosize hint (UX) — evidence: src/index.html, export.js/layout.js comments; commit hash recorded at exit walk (working tree at scoping time)
- [ ] Carry-over (v2.0.0 review, Security — §18 flag): session import validates plot/dataset/series ids against `/^[\w-]+$/` — ids reach innerHTML unescaped in grid.js/ui.js; reject or regenerate on import; `xss.spec.js` gains a malicious-session-file case (Security + QA)
- [ ] Pre-commit hook gap (Security): STANDARDS §9 claims the network-API grep covers `src/index.html`, but the hook only greps `src/js/**` (HTML is checked for `ping=` only) — extend the hook to grep staged HTML for the prohibited-API list, bringing implementation up to the written standard (Security)
- [ ] NSE denominator fix + reference values re-derived from the definition per §20 (Data Scientist + QA; `## Corrections` CHANGELOG entry per §3 carve-out)
- [ ] `figW`/`figH` range unification 300–1600 (Frontend + UX) *(parallel-safe)*
- [ ] Typography slider maxima → 40, all five sliders (Frontend; Data Viz confirms no clipping at 40 via margin scaling) *(parallel-safe)*
- [ ] Carry-over (v2.0.0 review, Frontend): renaming a plot refreshes `activePlotLabel`, series plot chips, and panel aria-labels *(parallel-safe)*
- [ ] Carry-over (v2.0.0 review, Data Viz): multiple parity series on one panel use the union of their axis ranges instead of last-wins *(parallel-safe)*
- [ ] Carry-over (v2.0.0 review, Data Viz + Data Scientist): histogram normal-fit overlay passes explicit `xbins` so curve scaling matches the bins Plotly actually draws (`nbinsx` is only a hint) *(parallel-safe)*
- [ ] "Export all" bulk PNG export of visible plots (Frontend + Data Viz; QA test asserts one download event per visible plot; README documents the browser's multiple-download permission prompt)
- [ ] UX flow description for the preset category picker — written before the branch is created, per §12 (UX Designer)
- [ ] Preset category picker + sectioned `datalab-style-preset-v2` schema with v1 back-compat; loader validates section shapes before applying; format change logged under CHANGELOG `## Schema` (Frontend + UX + Data Engineer; dialog accessibility — Accessibility)
- [ ] NSE/MAE/RMSE definitions added to the help dialog (UX + Data Scientist) — discoverability gap: maintainer had to ask what NSE means
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

Deliverables (dependency order per §18):
- [ ] Log axes: per-plot xLog/yLog + renderer warnings for non-positive values; parity/histogram interactions as decided above (Frontend + Data Viz + Data Scientist)
- [ ] Bar renderer with explicit aggregation + validation-error tests (Data Viz + Data Scientist + QA) *(parallel-safe with log axes)*
- [ ] Error bars on scatter/line/bar with mandatory semantics labeling (Data Viz + Data Scientist)
- [ ] Trendline: linear fit + R² annotation + sr-only mirror, references hand-derived per §20 (Data Viz + Data Scientist + QA)
- [ ] Data preview tab in Data Tools, paginated, fully escaped (Frontend + Security + Performance) *(parallel-safe)*
- [ ] UX flow descriptions for the bar/error-bar/trendline modal fields and the preview tab — before branches, per §12 (UX Designer)
- [ ] Subplot design spike document → Phase 10 scope (Data Viz + Data Engineer + UX + Performance; EL approves)
- [ ] README: feature list update + Excel→CSV guidance per the xlsx decision record (UX)
- [ ] ARIA pass on new modal fields and preview tab (Accessibility); axe states extended if a new state is meaningful
- [ ] Exploratory test: real datasets through bar/error-bar/log/trendline paths (Data Scientist)

Exit criteria: all four new capabilities render correctly and round-trip through session files (log flags, error-bar config, trendline config are series/plot state). Bar with duplicate categories and no aggregation produces the explicit error. Error bars always carry semantics labels. Log axis with non-positive data warns. Trendline R² matches hand-derived references. Preview never renders more than one page of DOM rows. Subplot spike approved and Phase 10 scoped. All prior tests green.

### Phase 10 — Subplot Figures `(scoped by the Phase 9 spike; version set by schema outcome)`
**Goal:** Subplots that share axes inside a single figure — one Plotly div, one exported image (publication-style multi-panel figures). Maintainer request at v2.0.0 review.

**Where it fits (EL decision, landscape round):** after Phase 9 — the essentials are higher value per unit risk, and the spike runs docs-only during Phase 9. It builds **on** the Phase 7 grid rather than replacing it: a plot panel can optionally become an r×c subplot figure; the grid keeps handling side-by-side independent figures. The two compose — a grid of figures, some of which contain subplots.

**Open design questions — resolved by the Phase 9 design spike before deliverables are scoped here:**
- **Schema (Data Engineer + EL):** plots gain optional `grid: { rows, cols, shareX, shareY }`; series gain optional `cell: { row, col }`. Additive-with-defaults may keep state v2 (STANDARDS §3), but per-cell axis labels/ranges would force per-cell plotConfig → state v3 + migration. Decision gates the version number (v2.x vs v3.0.0).
- **Rendering (Data Viz):** Plotly grid layout in a single div (`xaxis2`/`yaxis2`, `matches: 'x'` for shared axes). Spike must cover scattergl traces in subplots, per-cell error reporting, and how parity's equal-axis constraint interacts with shared axes.
- **UX (UX Designer):** how a panel toggles between single plot and subplot figure; where the cell picker lives in the series modal; per-cell vs per-figure titles; what "active plot" means when the active panel has cells. UX flow description written before implementation (house rule).
- **Export:** a figure exports as one image at Export size; bulk export treats a subplot figure as one file.
- **Renderer contract (Data Viz + EL):** `result.layout` assumes a single axis pair; subplot cells break that assumption. Any contract amendment follows §7 — Data Viz authors, EL approves, before renderer work begins.
- **Performance (Performance Engineer joins the spike):** shared-axis figures multiply traces per div — spike must measure against the §11 binding targets (warm < 2s, cold < 5s) before deliverables are scoped, not after.

### Phase 11+ — Future `(not scoped)`
- Additional distributions (lognormal, Weibull), distribution comparison tests; KDE/violin plots; higher-order trendline fits
- Computed columns — **security-spike-first**, must satisfy STANDARDS §8 expression-evaluation rule (no string-to-code path); Data Engineer champions, Security gates
- Dual Y axis — gated on Data Scientist conditions (see Landscape Review decision record)
- Type casting to datetime; column reorder; scatter size-by column (Phase 1 design intent, never built)
- Interpolated (non-gridded) contours
- Free-text plot annotations; general-purpose heatmap chart type
- Basic statistical tests (t-test, ANOVA) — pairs with the distributions work; Data Scientist owns scope

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
- [ ] CSP meta tag present in built `datalab.html` with exact approved policy (verified by `tests/smoke.spec.js`)
- [ ] No prohibited network APIs introduced (`fetch`, `WebSocket`, `RTCPeerConnection`, `sendBeacon`, `indexedDB`, `ping` attributes)
- [ ] Library hashes in `DEPENDENCIES.md` match bundled files — build verified clean
- [ ] SHA-256 hash of `datalab.html` published in release notes
- [ ] `PLANNING.md` and `STANDARDS.md` reviewed and updated by Engineering Lead

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
