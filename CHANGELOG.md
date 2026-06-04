# Changelog

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
