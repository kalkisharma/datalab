# Changelog

## v1.1.0 — Data Cleaning + Statistics

### Features
- **Data Tools** (Σ button on each dataset): summary statistics table
  (n, missing, mean, median, sample std, min/P25/P75/max), cleaning
  operations, correlation matrix, CSV export
- **Cleaning operations:** rename column (series references follow
  automatically), drop column, cast to numeric (reports unparseable
  values), missing-value handling (drop rows, fill with mean/median/value)
- **Correlation matrix:** Pearson r heatmap of all numeric columns,
  pairwise-complete deletion, symmetric ±1 scale
- **Histogram normal fit:** overlay a fitted normal curve (μ, σ in the
  legend) scaled to the count axis
- **Export cleaned CSV** with the current column set

### Methodology notes (Data Scientist)
- Standard deviations are sample (n−1); quantiles use linear interpolation
- Correlation uses pairwise-complete deletion — cells may be computed on
  different row subsets when data is missing
- Fixed during acceptance testing: `Number(null)`/`Number('')` coerce to
  0 in JavaScript — missing values were counted as zeros in early builds
  of the stats engine; all extraction now goes through an explicit guard

## Schema

### v1.1.0
- `series.fitNormal` (optional boolean, default false) — backward
  compatible, no migration. Cleaning operations mutate dataset rows and
  headers in place; the state schema is unchanged.

## v1.0.0 — GA

First general-availability release.

### Features
- **Session export/import:** save the entire workspace (datasets, series,
  styles, saved plots) to a JSON file and reload it later; versioned with
  migration support, newer-version files refused safely
- **Style presets:** save/load the global style panel as JSON
- **SVG export** alongside PNG and ZIP
- **Color-blind-safe default palette** (Okabe-Ito)
- **Keyboard shortcuts reference** — press ? in the header
- Dataset colors are now editable (click the color dot); series that
  inherited the color follow it
- Multiple parity series each get their own stats annotation

### Accessibility
- WCAG 2.1 AA verified with axe across four app states — zero violations
- Contrast fixes: muted text, accent buttons/badges, danger color
- Dropzone restructured so the file input is the real focusable control
- Full keyboard operation; focus management on all dialogs

### Stability
- Memory profile at 1M rows × 10 series: deleting everything returns the
  heap to within 1.4 MB of baseline. Three leaks fixed: trace-cache prune
  ordering, column-cache release on dataset removal, and WebGL buffer
  release when the last series is deleted (Plotly.purge alone retains
  scattergl buffers — the plot node is replaced)
- Deleting the last series now clears the plot and returns to the empty
  state instead of leaving a stale figure

### Notes
- Manual screen reader testing (VoiceOver/NVDA) requires assistive
  hardware and remains a maintainer action item; the automated ARIA audit
  is clean

## Schema

### v1.0.0
- Session file format introduced: `{ _schema: "datalab-session", app,
  saved, state }` where `state` is versioned appState (`version: 1`).
  Style preset format: `{ _schema: "datalab-style-preset-v1", ... }`.
- No changes to the state schema itself — sessions saved by any v0.x
  in-memory state load without migration.

## v0.3.0 — Phase 3 Full Chart Types + Advanced Filters

### Features
- Three new chart types: **contour** (pre-gridded data, strict grid
  validation with actionable errors), **histogram** (Freedman-Diaconis
  auto-binning, manual override), **boxplot** (Tukey whiskers/outliers,
  optional categorical grouping, readability warning above 50 categories)
- AND/OR filter logic per series; new operators: numeric range
  (`in range`) and categorical set (`in set`) with adaptive filter UI
- Datetime X-axis support for scatter and line: ISO 8601, MM/DD/YYYY,
  DD/MM/YYYY; slash format proven from the data where possible, otherwise
  an accessible prompt asks once per dataset+column; line charts drawn in
  time order
- Plot background color control, default white; axis/grid/text/legend
  colors adapt to the chosen background's luminance
- Non-blocking render warnings (distinct from errors) in the plot area

### Performance (all release gates green)
- Cold render gate now binding: 520 ms vs 5 s target (10 series × 50k rows)
- Filter re-evaluation: 36 ms vs 500 ms target (100k rows, 3 predicates)
- Warm render: 12 ms vs 2 s target

### Known issues (carried to Phase 4)
- With multiple parity series, only the last one's stats annotation shows
- Dataset colors assigned from the palette, not yet user-editable

## Schema

### v0.3.0
- `series.zCol` (contour), `series.binCount` (histogram),
  `series.filterLogic` ('and'|'or', default 'and'), and
  `dataset.dateFormats` (per-column 'ISO'|'MDY'|'DMY') added — all
  optional with backward-compatible defaults, no migration required.
- New filter `op` strings `in_range` and `in_set` per the Phase 0
  encoding spec — additive, no migration.

## v0.2.0 — Phase 2 Multi-Series

### Features
- Series list: show/hide toggle per series, up/down reorder (row order =
  draw order), keyboard navigation (arrows between rows, Enter edits,
  Delete removes)
- Per-series style overrides in the modal: color, marker size, line width
  (line charts) — blank fields inherit the global Style panel
- Dataset reload: dropping a CSV with an existing dataset's name replaces
  its data in place (name/color/series references preserved); series whose
  columns no longer exist are flagged in the panel and produce a clear
  render error instead of an empty plot

### Performance
- Trace cache + memoized column extraction: style-only re-renders reuse
  all traces (warm render median 5 ms at 10 series × 50k rows; target 2 s)
- Scatter switches to WebGL above 10k points — cold render at 50k×10
  improved 9.3 s → 0.26 s

### Fixed
- Editing a series no longer loses its color or visibility state
- Marker edge width no longer conflated with line width

### Known issues
- With multiple parity series, only the last one's stats annotation is
  shown (Phase 3)
- Dataset colors are assigned from the palette and not yet user-editable
  (Phase 3)

## Schema

### v0.2.0
- `series.enabled` added (optional boolean, default true) — backward
  compatible, no migration required.

## v0.1.0 — Phase 1 MVP

First usable release. Open `datalab.html` in any browser — no server, no install, no internet.

### Features
- Drag-drop N CSV datasets, each with editable name and palette color
- Series editor modal: dataset picker, chart type, adaptive per-type fields
- Chart types: scatter, line, parity
- Parity plots: inner join on key across two datasets, y=x line, ±5%/±10%
  error bands, NSE/MAE/RMSE annotation, equal axis ranges enforced
- AND-only filters per series: `=`, `≠`, `<`, `>`, `≤`, `≥`
- Style controls: colormap, marker size/opacity, edge color/width, gridlines
- Figure size and manual axis ranges
- Auto/locked plot title and axis labels
- Save plots with thumbnails, restore, delete; ZIP export; PNG download
- `beforeunload` guard against losing unsaved work

### Security
- CSP meta tag blocks all network access at the browser level
- All user strings escaped via `escHtml()` before DOM insertion
- 12-test Playwright XSS suite (5 insertion points × 2 payloads + CSP checks)
- Bundled library hashes verified at build time against `DEPENDENCIES.md`
- No localStorage/sessionStorage/cookies — session-only state

### Fixed during phase review
- Parity stats: x/y pairs with a one-sided non-finite value are now dropped
  together rather than independently filtered (which misaligned every
  subsequent pair and silently corrupted NSE/MAE/RMSE)

## Schema

### v0.1.0
- Initial schema, `version: 1`. Fields: `datasets[]`, `series[]`,
  `plotConfig`, `style`, `savedPlots[]`, `plotRendered`.
- Filter operators: `eq`, `neq`, `lt`, `gt`, `lte`, `gte` (scalar values).
