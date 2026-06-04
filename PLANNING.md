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

> **Note:** This section is archived at Phase 0 exit — replaced by git history and CHANGELOG.md.

1. **Create the new repo**
   ```
   mkdir datalab && cd datalab && git init
   ```
2. **Copy from parity-plotting:** `lib/papaparse.min.js`, `lib/jszip.min.js`, `build.js` (update module list), `src/style.css` (adapt)
3. **Download full Plotly bundle** (one-time manual download — not a runtime fetch): `plotly.min.js` from plotly CDN or npm → `datalab/lib/plotly.min.js` (~3.46 MB)
4. **Copy these functions from parity-plotting:** `parseCSV()`, `wireDropzone()`, `handleFile()`, `debounce()`, `makeDD()`, `escHtml()`, `savePlot()`, `mkCard()`, `restorePlot()`, `delSaved()`, `downloadZip()`
5. **Write from scratch:** `appState` schema, `index.html` layout, all renderers, `ui.js` panel builders, `chart.js` dispatcher

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

```js
const appState = {
  datasets: [
    // { id, name, rows, headers, color }
  ],
  series: [
    // {
    //   id, datasetId, xCol, yCol, colorCol, chartType,
    //   // parity-specific (only when chartType === 'parity'):
    //   joinDatasetId, joinKey, showBands, band5, band10,
    //   // all series:
    //   filters: [{ col, op, value, enabled }],
    //   style: { color, markerSize, opacity, lineWidth }
    // }
  ],
  plotConfig: {
    title, xLabel, yLabel, figWidth, figHeight,
    titleLocked, xLabelLocked, yLabelLocked,
    annotPos, figInited,
    majorGrid, minorGrid,
  },
  style: {
    // Global defaults, overridden per-series
    markerSize, markerOpacity, edgeColor, edgeWidth, colormap,
    // font sizes
  },
  savedPlots: [],
  plotRendered: false,
};

// Sessions = [{ name, state: {...appState} }]
// Serializes cleanly with JSON.stringify — no DOM parsing
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
// buildTrace(series, datasets) → { traces: Plotly.Data[], error: string | null }
//
// series   — the series object from appState.series
// datasets — the full appState.datasets array
// traces   — array of Plotly trace objects (may be empty on error)
// error    — human-readable error string if the series cannot render, else null
//
// Error messages may contain user data (column names, dataset names).
// Callers MUST apply escHtml() before inserting error into the DOM.
// Error containers MUST use role="alert".
//
// Shared utilities (colVals, buildMarkerStyle, colorMapping) are helpers in shared.js,
// not part of this interface. They are tested via the renderers that use them.
```

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
| scatter | size col (optional) | — |
| line | line width | — |
| parity | join dataset, join key, show ±5% band, show ±10% band | Requires two loaded datasets |
| contour | Z col (third numeric column) | Requires pre-gridded/equally-spaced data; validated at creation. Data Scientist to review guidance in Phase 3 |
| histogram | bin count (user-configurable; default uses Freedman-Diaconis rule, computed at render time) | Client-side binning, no server needed |
| boxplot | X col (optional, categorical); Y col (numeric) | Max 50 categorical X values; render-time warning if exceeded |

Datetime columns are shown in column pickers but disabled with tooltip: "datetime columns supported in Phase 3."

---

## File Structure

```
datalab/
  src/
    index.html
    style.css           — includes .sr-only utility class
    js/
      state.js
      data.js           — parseCSV, applyFilters, classifyColumn
      ui.js             — makeDD, panel builders, modal
      chart.js          — renderPlot dispatcher, downloadPlot, downloadZip
      renderers/
        shared.js       — renderer interface contract, colVals, buildMarkerStyle, colorMapping
        parity.js
        scatter.js
        line.js
        contour.js
        histogram.js
        boxplot.js
      saves.js
      wiring.js
  lib/
    plotly.min.js       — Full bundle (3.46 MB)
    papaparse.min.js
    jszip.min.js
  tests/
    smoke.spec.js       — Smoke render test; runs on every PR
    bench.spec.js       — Performance benchmark; runs on release (Phase 2+)
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

- [ ] N CSVs loaded simultaneously (Frontend)
- [ ] Series list: reorder, edit, delete (Frontend + UX)
- [ ] UX flow description for series list interactions — written before branch is created (UX Designer)
- [ ] Per-series style overrides: color, marker size, line width (Frontend + Data Viz)
- [ ] Series legend: enable/disable toggles (Data Viz)
- [ ] Column reference validation on dataset reload (Data Engineer)
- [ ] Memoized column extraction + trace cache; cache invalidated on dataset reload or column rename (Performance Engineer)
- [ ] Synthetic 50k-row benchmark dataset generated and committed to `tests/data/` per README spec; Performance Engineer signs off on dataset spec (QA + Performance Engineer)
- [ ] `tests/data/README.md` completed with full benchmark dataset spec (QA)
- [ ] `tests/bench.spec.js` warm render benchmark active — 10 series × 50k rows, warm render < 2s, memoized path (see STANDARDS.md §10) (QA + Performance Engineer)
- [ ] Keyboard nav for series list (Accessibility)
- [ ] ARIA pass on all panels introduced this phase (Accessibility)
- [ ] Exploratory test with real multi-series datasets; advise on series color default palette (Data Scientist)

Exit criteria: 3 CSVs, 6 series, reorder, edit, warm render < 2s. Smoke test green on every PR. Performance benchmark passing. Data Scientist exploratory test complete.

---

### Phase 3 — Full Chart Types + Advanced Filters `v0.3.0`
**Goal:** All 5 chart types. AND/OR filter logic. Datetime support.

- [ ] `renderers/contour.js`: 3 numeric cols (x, y, z); validates at series creation — requires pre-gridded data; error message with `role="alert"` and `escHtml()`; log scale guidance comment included (Data Viz)
- [ ] Contour data requirements reviewed by Data Scientist — confirm or update "pre-gridded" guidance; interpolated contour support explicitly deferred to Phase 5+ (Data Scientist)
- [ ] `renderers/histogram.js`: 1 numeric col; Freedman-Diaconis bin count computed on demand at render time from column values (not cached in state); user-configurable bin count; log scale guidance comment included (Data Viz + Data Engineer)
- [ ] Histogram binning defaults reviewed by Data Scientist — confirm FD rule is appropriate, advise on configurable range (Data Scientist)
- [ ] `renderers/boxplot.js`: numeric Y + optional categorical X; render-time warning if categorical X > 50 unique values; log scale guidance comment included (Data Viz + Data Engineer)
- [ ] Boxplot whisker calculation and outlier detection reviewed by Data Scientist for statistical correctness (Data Scientist)
- [ ] AND/OR filter toggle per series (Data Engineer + Frontend)
- [ ] Extended operators: `in_range` and `in_set` per encoding spec from Phase 0 (Data Engineer)
- [ ] Disabled filter rules (checkbox per rule, not delete-only) (UX)
- [ ] Datetime column support: ISO 8601, MM/DD/YYYY, DD/MM/YYYY; when format is ambiguous (e.g., 01/02/2024), user is prompted to select format (Data Engineer + Data Viz)
- [ ] Datetime format ambiguity prompt: UX flow description written before implementation; must be an accessible modal with keyboard nav (UX Designer + Accessibility)
- [ ] Renderer validation error testing: contour with non-numeric column, boxplot with >50 categories, histogram with categorical column (QA)
- [ ] Cold render benchmark active — < 5s (see STANDARDS.md §10) (QA + Performance Engineer)
- [ ] Filter re-evaluation < 500ms at 100k rows (Performance Engineer)
- [ ] ARIA pass on all panels introduced this phase; `role="alert"` on all renderer error containers verified; datetime format prompt modal accessibility verified (Accessibility)
- [ ] Exploratory test all 5 chart types with real datasets; flag misleading defaults (Data Scientist)

Exit criteria: All 5 chart types render. Parity with AND/OR filters. Contour validation message on wrong input. Boxplot warning at >50 categories. Cold render < 5s. Filter < 500ms. Renderer validation errors tested. Data Scientist sign-off on statistical correctness of all chart types.

---

### Phase 4 — Polish + GA `v1.0.0`
**Goal:** Feature-complete, accessible, stable.

- [ ] Style preset save/load JSON (Frontend)
- [ ] SVG export (Data Viz)
- [ ] Session JSON export/import — save full state to file, reload later (Frontend + Data Engineer)
- [ ] Full ARIA audit: dynamic panels, modal, filter rows, dataset chips (Accessibility)
- [ ] Screen reader behavior testing — VoiceOver macOS 13+ mandatory; NVDA secondary (Accessibility)
- [ ] Keyboard shortcuts reference panel (Accessibility + UX)
- [ ] Color-blind-safe default palette (UX + Data Viz + Data Scientist — Data Scientist confirms perceptual and scientific appropriateness)
- [ ] Full Playwright regression suite (QA)
- [ ] Memory profiler: 1M rows + 10 series + delete all → heap returns to baseline (Performance Engineer)
- [ ] Final exploratory test of full tool end-to-end with real datasets; Data Scientist sign-off that outputs are correct and non-misleading (Data Scientist)

Exit criteria: No ARIA violations. Screen reader tested. No memory leaks. Session round-trips via JSON. SVG export works. Data Scientist final sign-off.

---

### Phase 5+ — Data Cleaning + Statistics `(future, not scoped yet)`

**Data Scientist is primary owner of this phase** — defines requirements, validates correctness, and signs off before any statistical feature ships.

- Column rename, drop, reorder
- Type casting (string → numeric, datetime parsing)
- Missing value handling (fill, drop, flag)
- Summary statistics panel (mean, median, std, percentiles, histogram per column)
- Correlation matrix
- Distribution fitting
- Export cleaned CSV

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
