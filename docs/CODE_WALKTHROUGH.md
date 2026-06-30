# DataLab Code Walkthrough

**Audience:** a technical reviewer — an engineer, security auditor, or
contributor — who wants a complete, file-by-file understanding of how
DataLab works. It assumes you can read JavaScript. If you're not technical,
read [`REVIEW_GUIDE.md`](REVIEW_GUIDE.md) instead; it covers the same system
in plain language.

> **Keeping this document current (STANDARDS §17 + §4).** This walkthrough
> is owned by the Engineering Lead (with the Data Visualization Engineer for
> the renderer sections) and is **updated at every release** (phase exit or
> pulled-forward), as part of the release checklist, alongside `PLANNING.md`
> and `STANDARDS.md`. When a
> file is added, removed, split, or changes responsibility, its entry here
> changes in the same commit. The [File Index](#file-index) is the quick
> check: if a file in `src/js/` isn't listed there, this document is stale.
> Descriptions reference files and functions by **name**, not line number,
> so they survive ordinary edits — but the architecture sections must be
> re-read whenever the build order or the renderer contract changes.

---

## 1. The 30-Second Model

DataLab is a **single HTML file** (`datalab.html`) that runs entirely in the
browser — no server, no network, no installation. That file is a **build
output**: `build.js` concatenates ~35 small source files from `src/` plus
three bundled libraries from `lib/` into one self-contained document.

The architecture is **state-first**. A single object, `appState`, is the
source of truth for everything — loaded datasets, defined series, plot
configuration, styling. The DOM is always rendered *from* `appState`; user
actions mutate `appState` and trigger a re-render. Nothing important lives in
the DOM itself. This is the single most important idea in the codebase:
when you want to know "what is true right now," you look at `appState`, not
the screen.

There is **no module system** (no `import`/`export`, no bundler beyond
concatenation). Every source file contributes functions to one shared global
scope. That's why a function defined in `render-cache.js` can call `RENDERERS`
defined in `chart.js` — after concatenation they're in the same scope. The
**order of concatenation in `build.js` is the dependency order**, and it is
the authoritative map of how the pieces stack.

---

## 2. The Build Pipeline (`build.js`)

`build.js` is ~110 lines and does five things, in order:

1. **Reads the version** from the `const VERSION = '…'` declaration in
   `src/js/state.js` — the single source of truth (STANDARDS §3). It parses
   the literal with a regex; do not reformat that line or the build breaks.
2. **Verifies library hashes.** It SHA-256s each file in `lib/`
   (`plotly.min.js`, `papaparse.min.js`, `jszip.min.js`) and compares
   against hardcoded expected hashes (`DEPS` object). **Any mismatch aborts
   the build** with an instruction to update `docs/DEPENDENCIES.md` and get
   Security + EL sign-off. This is the supply-chain integrity gate: a
   tampered or version-drifted library cannot be silently bundled.
3. **Wraps the libraries** in `<script>` tags, escaping any `</script>`
   inside the minified code so the HTML parser doesn't close early.
4. **Assembles the document.** It reads `src/index.html` (the page shell) and
   replaces four injection markers: `%%VERSION%%`, `<!-- INJECT:LIBS -->`,
   `<!-- INJECT:STYLE -->` (← `src/style.css`), and `/* INJECT:SCRIPT */`
   (← all app JS concatenated in dependency order). Function-form
   replacements are used so `$` characters in Plotly's minified code aren't
   misread as regex backreferences.
5. **Writes `datalab.html`**, prints its size and SHA-256, and reminds you to
   publish that hash in the release notes.

The build downloads nothing — every input is already in the repo. The output
is deterministic: the same sources produce the same bytes (and therefore the
same hash), which is what makes release verification meaningful. See
STANDARDS §9 and the `.gitattributes` eol exemptions, which keep the
committed artifact byte-identical to a fresh build.

**Concatenation order** (from `build.js`, your map of the codebase):

```
state → data → ui → filters → modal → modal-chart-fields → modal-fields
→ date-prompt → grid → render-cache → chart → decorations → layout
→ export → sessions → stats → distributions → specfun → hypothesis
→ expr → compare → datatools → dt-preview → saves → wiring → grid-interp
→ renderers/shared → scatter → line → bar → parity → contour
→ histogram → boxplot → violin → heatmap
```

---

## 3. Bootstrapping and the Global-Scope Model

`wiring.js` is the entry point at runtime: it attaches all event listeners,
sets up the drag-and-drop dropzone for CSV files, and bootstraps the DOM once
the page loads. Because everything shares global scope, `wiring.js` can wire a
button to a handler defined in any other file.

A consequence worth internalizing for review: there is no encapsulation
boundary between files. The discipline that keeps this maintainable is the
**file-size policy (STANDARDS §6)** — every file stays under ~300 lines with
a clear single responsibility, and crossing the trigger forces a recorded
split decision at the next phase exit. The split history is visible in the
file headers ("split from X at the Phase N review"). This is why the codebase
is ~35 small files instead of a few large ones.

---

## 4. The State Layer

### `state.js` — the heart
Defines `appState`, the single source of truth. Its comment block is the
**authoritative schema documentation** (PLANNING deliberately does not mirror
it — that copy drifted twice and was deleted). Also defines:
- `VERSION` — the app version (read by `build.js`).
- The **state schema version** (currently 2, since Phase 7). Every change
  since has been *additive with defaults* — new optional fields, no
  migration required. Changing the meaning of an existing field would be a
  MAJOR bump (STANDARDS §3).
- `escHtml()` — the function that escapes user-supplied text before it's
  placed into the DOM. This is the workhorse of the XSS defense; it appears
  throughout the UI files.

### `sessions.js` — save/load the whole workspace
Exports the complete `appState` (datasets with rows included, series, plot
config, style, saved plots) plus the schema version to a JSON file, and
imports it back. Import validates the schema marker, **runs migrations for
older versions** before applying, and **refuses newer-than-supported files**
with a clear message rather than half-loading. All session ids are validated
against `/^[\w-]{1,64}$/` on import (a Phase 8 security fix closing an
injection vector).

### `saves.js` — named plot snapshots
The "saved plots" strip: save, restore, and delete named snapshots of the
current plot, separate from full-session save.

---

## 5. Data Ingestion and Filtering

### `data.js` — CSV in, typed columns, filter evaluation
Three responsibilities:
- **`parseCSV`** (built on the bundled PapaParse) and the ingestion path
  (`handleFile`, dropzone handling). Its header comment defines the
  **column-name escaping contract**: column names are stored *raw*
  (unescaped) in `dataset.headers` and used raw as dropdown text;
  `escHtml()` is applied *at the point of DOM insertion*, never at parse
  time. Any caller interpolating a column name into `innerHTML` must escape.
- **`classifyColumn`** — types each column as numeric, categorical, or
  datetime, including datetime-format detection (ISO 8601, MM/DD/YYYY,
  DD/MM/YYYY) with an ambiguity prompt for cases like `01/02/2024`.
- **`applyFilters`** — the **safe filter parser**. Operators are encoded as
  strings (`eq`, `neq`, `lt`, `gt`, `lte`, `gte`, `in_range`, `in_set`) and
  evaluated through a `switch`. **There is no `eval` or `new Function`** — a
  permanent rule (STANDARDS §8). The encoding is forward-compatible: new
  operator types were added in Phase 3 without a schema migration.

### `filters.js` — the filter-row UI
Builds the per-rule filter UI inside the series modal. The value cell adapts
to the operator: scalar ops show one input, `in_range` shows min+max,
`in_set` shows a comma-separated list. Live filter state lives in
`_modalFilters` until the series is saved.

---

## 6. The Rendering Pipeline (the core data flow)

This is the path from `appState` to pixels. Trace it once and the tool makes
sense.

```
grid.js            owns the multi-plot grid: panel lifecycle, which plot is
                   active, panel layout. Each plot is an entry in
                   appState.plots; series carry a plotId.
   │
   ▼
chart.js           renderPlot() — the dispatcher. For the active/each plot it
   │               calls renderOnePlot(), which walks that plot's series,
   │               calls the right renderer for each, assembles the figure
   │               (subplot grids, axis keys, right-Y), and hands it to Plotly.
   │               RENDERERS (the chartType → renderer map) lives here.
   │
   ├─► render-cache.js   buildSeriesResult(series) — memoized renderer call.
   │                     The cache key captures the series definition, the
   │                     revision of every dataset it reads, and the global
   │                     style values, so a change to any of them invalidates.
   │                     pruneTraceCache() releases deleted series. This is
   │                     the performance backbone (Phase 2).
   │
   ├─► renderers/shared.js + renderers/<type>.js
   │                     The actual trace construction (see §7).
   │
   ├─► decorations.js    Plot-level decorations layered on after traces:
   │                     right Y axis (dual-Y), parity stats annotation box
   │                     (anchored to its own subplot cell via axis-domain refs,
   │                     v2.15.0), free-text notes, and log-axis interactions.
   │                     Drag positions for the legend, notes, and parity stats
   │                     box — plus interactive axis zoom/pan ranges (v2.15.0) —
   │                     are persisted back into plotConfig via a plotly_relayout
   │                     hook (the hook currently lives in chart.js;
   │                     decorations.js is its named next home).
   │
   └─► layout.js         The base layout and plot theme — background-luminance
                         -adaptive colors, axis styling, and the colorbar
                         fonts that follow the typography panel. Centralizes
                         styling so renderers don't each read the DOM.
```

**Key idea:** renderers are pure-ish functions that don't touch the DOM or
global layout. They take data and return traces. Everything about *where* a
trace goes (which subplot cell, which axis) and *how the plot is decorated*
is the dispatcher's and decorations' job. This separation is the renderer
contract, enforced by review (STANDARDS §7).

---

## 7. The Renderer Contract and the Renderers

### `renderers/shared.js` — the contract + shared utilities
The top comment is the **authoritative renderer interface contract**:

```
buildTrace(series, datasets, ctx?) → { traces: Plotly.Data[],
                                       error: string | null,
                                       warning?: string | null }
```

- `series` — one entry from `appState.series`; `datasets` — all loaded
  datasets; `ctx` — optional plot context (currently `{ xLog }`, added Phase
  13 per §7), part of the cache key.
- Renderers return **either** traces **or** an `error` string (never throw);
  the dispatcher escapes the error and shows it in a `role="alert"` container.
  `warning` is non-fatal (e.g., "log axis ignored: non-positive values").
- Error and warning strings may contain user data (column/dataset names), so
  the **caller must `escHtml()` before DOM insertion** — the contract says so.

Shared helpers every renderer leans on:
- **`colVals`** — extract a column's values for a series' rows.
- **`colorMapping`** — decide categorical-vs-numeric color encoding and build
  the mapping (the `isNumeric` heuristic: >50% finite → numeric colorbar,
  else discrete categories).
- **`buildMarkerStyle`** — marker color/size/opacity/edge **and symbol (shape)**
  from series style, each with a global Style-panel fallback (`#markerSize`,
  `#markerSymbol`, …).
- **`areaSizes` / `sizeKeyTraces`** — the size-by mapping and its legend
  swatches; both take an options object (law area/diameter, min/max px, label,
  count, separate-legend) so the key always matches the bubbles (§12/§20).
- **`categoryGroups` / `categoryGroupsFromValues`** — split rows into named
  category groups for discrete color encoding. A missing/empty group value maps
  to a category named `(blank)`. The **line** renderer's color-by surfaces a
  row-count warning for that group (and folds empty/whitespace values into it),
  so it isn't mistaken for a real category (§20 — shipped post-v2.13.0); scatter
  and parity build the `(blank)` group without that warning.

### The renderers (one file per chart type)
Each renderer's header documents its **log-scale guidance** and the **Data
Scientist sign-off** for its statistical conventions. Summary:

| Renderer | Chart type | Notes for a reviewer |
|---|---|---|
| `scatter.js` | scatter | Bubble size-by — configurable law (area default / diameter, which warns), min/max px (default 4→28), and a size key with custom label/count, optional hide, or routing to a second legend — plus color-by, error bars, trendlines (linear/quadratic/cubic), per-series marker shape, optional cross-dataset join. The richest renderer. |
| `line.js` | line | Per-category lines when color-by is set (reuses `categoryGroups`, with a `(blank)` + high-cardinality warning); error bars; datetime X; per-series marker shape; **markers toggle, line dash, separate marker color (single-line), and markers that now honor the global marker-size slider** (v2.14.0 — previously a hardcoded 4 px). |
| `bar.js` | bar | **Explicit aggregation** (none/count/sum/mean/median). `agg='none'` *errors* on repeated categories — silent aggregation is forbidden (§20). |
| `parity.js` | parity | Observed-vs-modelled: y=x line, ±5%/±10% bands (user-controllable colour/opacity, shared, v2.15.0), equal axes (always explicitly set), NSE/MAE/RMSE stats, and an optional linear best-fit line (v2.15.0 — regression fit, conceptually distinct from NSE; stylable colour/width/dash since v2.16.0). The fit's R² is reported in the stats box (not the legend) since v2.19.0, with a legend-equation toggle and configurable significant figures. v2.21.0 lets each series pick which box stats appear (NSE/MAE/RMSE/R²) and moves N (datapoint count) into the legend — falling back to the box when the legend is hidden, and always kept in the screen-reader summary. Works cross-dataset (join) **or** single-dataset (two columns, since v2.13.0). `SS_tot` is variance around **mean(observed)** — the correct NSE denominator. |
| `contour.js` | contour | Default path needs **pre-gridded** data (validated at creation). Opt-in "interpolate scattered data" path routes through `grid-interp.js`. A "Smooth shading" toggle (v2.17.0) switches between Plotly's interpolated heatmap shading and discrete grid-faithful bands. Colorbar controls (v2.18.0, shared with heatmap and scatter/parity numeric color-by): editable/hideable title, manual range (`zmin`/`zmax` or `cmin`/`cmax`), reverse colormap, and `ncontours` level count. v2.20.0 adds iso-line/iso-label/grid toggles and a per-series colormap; the colormap resolves series → plot → global at the dispatcher (`effectiveColormap`, baked onto the eff-clone). |
| `histogram.js` | histogram | Freedman-Diaconis bin count computed at render time; distribution fit overlay (normal/lognormal/Weibull) and KDE. |
| `boxplot.js` | box plot | Tukey whiskers; warns above 50 categorical X values. |
| `violin.js` | violin | Plotly-native violin with the Tukey box inside. |
| `heatmap.js` | heatmap | Categorical X × categorical Y × explicit aggregation; colorbar names the aggregation. |

---

## 8. The UI Layer

### `ui.js` — panels and dropdowns
Builds the datasets panel, the series list, and **`makeDD`**, a searchable,
keyboard-navigable dropdown. *(Review note: `makeDD` currently has zero call
sites — wiring it into the modal's column pickers is a queued "Stab B" item.)*
Also holds the series copy/paste clipboard.

### `modal.js` + `modal-fields.js` + `modal-chart-fields.js` — the series editor
The central dialog for adding/editing a series, split across three files by
the §6 size policy:
- **`modal.js`** — open/close and **save** (`saveModalSeries`): collects the
  field values into a series object and writes it to `appState`.
- **`modal-chart-fields.js`** — pure HTML builder for the per-chart-type
  Columns/setup fields (the parity "Compare against" picker, the scatter
  size-by, etc.). `colOptions` is passed in.
- **`modal-fields.js`** — appends the shared Style + Filters sections and
  wires everything together.

### `date-prompt.js` — the ambiguous-date dialog
A small self-contained modal (split out of `modal.js` in Stabilization A)
that asks the user to disambiguate a date format. Driven by `data.js`'s
detection; resumes the series save through an `onDone` callback. Manages its
own overlay/Escape via one `AbortController`.

---

## 9. Export

### `export.js` — PNG/SVG/ZIP and style presets
PNG and SVG download — rendered off-screen via a fixed-size static `newPlot` +
`toImage` (the same path as the ZIP export) from a clone of the live layout, so
the image faithfully matches the screen, minor gridlines and the current
zoom/range included (v2.15.0 — this replaced an in-place `Plotly.downloadImage`
whose responsive clone-and-resize dropped those). **Export all** (one numbered
PNG per visible panel), ZIP of saved plots, and style-preset save/load. Includes a shared filename sanitizer and the SVG-rasterizes-WebGL
notice (warns that SVG export of WebGL scatter falls back to raster).
Blob URLs are revoked after download (a §9 confidentiality requirement).

---

## 10. The Statistics and Data-Tools Stack

This is the tool's deepest, most differentiated area. The Data Scientist role
owns correctness for all of it; every formula is pinned to hand-computed or
published reference values in the tests (STANDARDS §20).

- **`stats.js`** — the summary-statistics engine and cleaning operations:
  `summaryStats` (n, missing, mean, median, sample std n−1, quartiles by
  linear interpolation), `pearsonMatrix` (pairwise-complete), and the
  cleaning ops (rename — series references follow; drop; cast; missing-value
  handling). The header's missing-value guard explains why `Number('')`→0
  coercion is dangerous and guarded against.
- **`distributions.js`** — distribution fitting (normal, lognormal via MLE,
  Weibull via MLE+Newton) and binned KDE (split from `stats.js` at Phase 11).
- **`specfun.js`** — the special functions backing the p-values: Lanczos
  log-gamma, regularized incomplete beta (Lentz continued fraction),
  regularized incomplete gamma, and the normal CDF (A&S 7.1.26). Split from
  `hypothesis.js` — the cohesive numerics half.
- **`hypothesis.js`** — the hypothesis tests themselves: Welch t, one-way
  ANOVA, Mann–Whitney U, Kruskal–Wallis, paired t, Wilcoxon signed-rank.
  **Reporting rule (§20): a p-value is never returned without its effect size
  and sample size**; rank-based tests append "(normal approx.)" when any
  group is below 10.
- **`compare.js`** — the "Compare groups" section of the Data Tools modal:
  the UI that drives the tests above (Method select for parametric vs
  rank-based; Compare select for groups vs paired columns). Enforces the
  no-naked-p-value rule at the presentation layer.
- **`expr.js`** — the **safe expression engine** for computed columns. Its
  security contract is strict and permanent (STANDARDS §8): **no
  string-to-code path may ever exist** — no `eval`, no `Function`, no member
  access in the grammar. The pipeline is `tokenize → recursive-descent parse
  → AST → interpret`, with a frozen function allowlist and hard caps. The
  rejection test suite is the tripwire for grammar creep.
- **`grid-interp.js`** — scattered (x,y,z) → regular grid for interpolated
  contours: binned-mean gridding + convex-hull mask + data-support-radius
  mask + harmonic (Laplace) gap-fill. Its **no-fabrication guarantee** (§20):
  every filled value is a Gauss–Seidel relaxation of the discrete Laplace
  equation with data cells held fixed, so the maximum principle bounds every
  interpolated value within the surrounding data — nothing is invented
  outside the data's support.
- **`datatools.js`** — the per-dataset Data Tools modal (the Σ button):
  summary-stats table, cleaning operations, correlation heatmap, CSV export.
- **`dt-preview.js`** — the paginated data preview inside Data Tools
  (≤ one page of DOM rows is the performance guarantee).

---

## 11. Security Architecture (what a security reviewer checks)

DataLab's confidentiality guarantee rests on **independent, layered**
defenses. See STANDARDS §8–§9 and the Security Checklist in `PLANNING.md`.

1. **Network isolation, two layers.** A CSP `<meta>` tag in `src/index.html`
   (`default-src 'none'; …`) blocks all network access at the browser level.
   Independently, the **pre-commit hook** (`.githooks/pre-commit`, activated
   via `core.hooksPath`) greps for any network API (`fetch`, `WebSocket`,
   `RTCPeerConnection`, `sendBeacon`, `indexedDB`, `XMLHttpRequest`, …) and
   refuses the commit. The CSP is single-sourced in `tests/approved-csp.js`
   and both the smoke and XSS suites assert the built HTML matches it
   byte-for-byte.
2. **No code execution from input.** `applyFilters` and `expr.js` never use
   `eval`/`Function`. `expr.js`'s grammar deliberately excludes member access
   and any string-to-code path.
3. **XSS defense.** `escHtml()` is applied at every DOM HTML-injection sink
   (series/dataset/column names, filter values, category strings, renderer
   errors), each annotated with a comment listing what's escaped (a §8 rule
   the hook also checks). Inert Plotly text (hovertemplates, trace names,
   titles, colorbar/legend labels) is rendered non-executably by Plotly and
   is covered by the XSS *test suite* rather than manual escaping — a
   distinction clarified in the v2.9.0 review and worth understanding before
   you flag a "missing escHtml".
4. **No persistence.** No `localStorage`, `sessionStorage`, or cookies —
   closing the tab erases everything. Blob URLs are revoked after download.
5. **Supply chain.** The three `lib/` dependencies are pinned by exact
   version and SHA-256 in `docs/DEPENDENCIES.md`; `build.js` re-verifies the
   hashes and aborts on mismatch. Every release publishes the artifact hash
   for download verification.

---

## 12. Testing Architecture

Tests are Playwright specs in `tests/`, feature-named (STANDARDS §14). They
run against the built `datalab.html`. Fixed points that run on every change:

- **`smoke.spec.js`** — loads a CSV, adds a scatter series, asserts no JS
  errors and a non-empty SVG; verifies the CSP meta tag exactly.
- **`xss.spec.js`** — the injection suite: malicious payloads through every
  user-controlled string that reaches the DOM, including inert Plotly text.
- **`a11y.spec.js`** — axe accessibility checks across app states.
- **`bench.spec.js`** — performance benchmarks, **release-only** (`BENCH=1`).
  Binding gates: warm render < 2 s (10 series × 50 k rows), cold < 5 s,
  filter < 500 ms at 100 k rows, heap returns to baseline after delete-all.
- **`approved-csp.js`** — *the* CSP string, the single source both security
  suites check against.

Feature suites (one per area, e.g. `parity-stats.spec.js`,
`stabilization-a.spec.js`, `comparison.spec.js`) pin statistical outputs to
hand-computed/published references. Synthetic datasets live in `tests/data/`
(max 500 KB each), specified in `tests/data/README.md`.

A standing lesson encoded in §4: **run the suite, don't reason about it.**
The post-v2.13.0 review found two parity tests red against a "green suite"
claim — caught only by actually running them. The release checklist requires
a full green suite before any tag.

---

## 13. Cross-Cutting Conventions

Reading these four rules will explain most of what looks unusual:

- **§3 Versioning & schema.** Semver. Additive schema changes (new optional
  fields with defaults) stay MINOR and require no migration; the state
  version has been 2 since Phase 7. Changing an existing field's meaning is
  MAJOR. `CHANGELOG.md`'s `## Schema` section records every addition.
- **§6 File size.** ~300-line trigger; crossing it forces a recorded
  split-or-tolerate decision at the next phase exit, measured with `wc -l`
  (not recalled). The file headers narrate the resulting split history.
- **§19 Comments & headers.** Every file opens with a header stating its
  responsibility and split lineage. Every `innerHTML`-family sink carries an
  escaping annotation. Comments explain *why*, not *what*.
- **§20 Statistical honesty.** No statistic without context (p-values carry
  effect size + n; error bars name their meaning; aggregation is never
  silent; interpolation never fabricates beyond data support). This is a hard
  rule enforced at review and in tests, not a preference.

---

## 14. Worked Example: "Add a scatter series colored by a column"

To see the layers cooperate, follow one action end to end:

1. **User drops `data.csv`.** `wiring.js`'s dropzone handler calls
   `data.js`'s `handleFile` → `parseCSV` → `classifyColumn`. A new dataset
   (with a revision number) is pushed into `appState.datasets`; the panel
   re-renders from state (`ui.js`).
2. **User clicks "+ Add Series," picks scatter, sets X, Y, and Color-by.**
   `modal.js` opens the dialog; `modal-chart-fields.js` builds the scatter
   fields; `filters.js` supplies any filter rows. On Save, `saveModalSeries`
   writes a series object (with `colorCol` set) into `appState.series` and
   schedules a debounced render.
3. **Render.** `chart.js`'s `renderPlot` → `renderOnePlot` finds the series'
   plot, calls `render-cache.js`'s `buildSeriesResult`, which (cache miss)
   calls `RENDERERS['scatter']` = `scatter.js`'s `buildTrace`.
4. **Trace construction.** `scatter.js` uses `shared.js`'s `colorMapping` to
   decide categorical vs numeric color, `categoryGroups` to split rows if
   categorical, and `buildMarkerStyle` for the markers. It returns
   `{ traces, error: null }`.
5. **Assembly + decoration.** `chart.js` assigns the traces to the right
   axis keys, `layout.js` themes the figure, `decorations.js` adds any
   right-Y/notes, and `Plotly.react` draws it.
6. **Persistence.** If the user saves the session, `sessions.js` serializes
   all of `appState` — including this series and its `colorCol` — to JSON,
   tagged with the schema version, for later round-trip.

Every step reads or writes `appState`; nothing of substance lives only in
the DOM.

---

## File Index

The authoritative list of `src/js/` files. Line counts are indicative (the
§6 trigger is ~300); they drift between phases — the **responsibility** is
the stable fact. If a file exists in `src/js/` and is not here, this document
is overdue for its phase-exit update.

| File | Responsibility |
|---|---|
| `state.js` | `appState` schema (the source of truth), `VERSION`, `escHtml` |
| `data.js` | CSV parse/ingest, column classification, `applyFilters` |
| `filters.js` | Filter-row UI in the series modal |
| `ui.js` | Dataset panel, series list, `makeDD` dropdown, series clipboard |
| `modal.js` | Series editor: open/close/save |
| `modal-chart-fields.js` | Per-chart-type Columns/setup field HTML |
| `modal-field-controls.js` | Shared modal field builders (`sizeByExtraControls`, `colorbarExtraControls`) — split from modal-chart-fields.js at v2.21.0 (§6) |
| `modal-fields.js` | Shared Style + Filters sections + wiring |
| `date-prompt.js` | Ambiguous-date format prompt dialog |
| `grid.js` | Multi-plot grid: panel lifecycle, active plot |
| `chart.js` | `renderPlot`/`renderOnePlot` dispatcher; `RENDERERS` map |
| `render-cache.js` | Per-series trace memoization (`buildSeriesResult`) |
| `decorations.js` | Right-Y, parity stats box, notes, per-cell titles, shared-colorbar config, log interactions, and the `plotly_relayout` persistence hook (`bindRelayoutPersistence`, moved from chart.js at v2.22.0) |
| `layout.js` | Plot theme, base layout, colorbar fonts |
| `export.js` | PNG/SVG/ZIP export, style presets |
| `sessions.js` | Full-state JSON session export/import + migrations |
| `saves.js` | Named plot snapshots |
| `stats.js` | Summary stats, correlation, cleaning ops |
| `distributions.js` | Distribution fits + KDE |
| `specfun.js` | Special functions behind the p-values |
| `hypothesis.js` | Welch t, ANOVA, MWU, Kruskal–Wallis, paired t, Wilcoxon |
| `compare.js` | Compare-groups UI in Data Tools |
| `expr.js` | Safe expression engine for computed columns |
| `datatools.js` | Per-dataset Data Tools modal |
| `dt-preview.js` | Paginated data preview |
| `wiring.js` | Event listeners, dropzone, DOM bootstrap |
| `grid-interp.js` | Scattered→grid interpolation for contours |
| `colorscales.js` | `resolveColorscale` — colormap name → Plotly colorscale (explicit arrays for the maps Plotly lacks; allowlists unknown values) |
| `renderers/shared.js` | Renderer contract + shared trace utilities |
| `renderers/scatter.js` | Scatter (size-by, color-by, trendlines, join) |
| `renderers/line.js` | Line (per-category, error bars) |
| `renderers/bar.js` | Bar (explicit aggregation) |
| `renderers/parity.js` | Parity (NSE/MAE/RMSE, bands, equal axes) |
| `renderers/contour.js` | Contour (pre-gridded + interpolated paths) |
| `renderers/histogram.js` | Histogram (FD bins, fits, KDE) |
| `renderers/boxplot.js` | Box plot (Tukey) |
| `renderers/violin.js` | Violin |
| `renderers/heatmap.js` | Heatmap (category × category) |

Non-`src/js` files: `src/index.html` (page shell + CSP + injection markers),
`src/style.css`, `build.js` (assembler), `lib/` (pinned dependencies),
`tests/` (Playwright suites), and the docs in this folder.

---

**See also:** [`REVIEW_GUIDE.md`](REVIEW_GUIDE.md) (plain-language
orientation), [`PLANNING.md`](PLANNING.md) (roadmap + phase history),
[`STANDARDS.md`](STANDARDS.md) (the engineering rulebook).
</content>
