# Changelog

## v2.23.0 — Parity 3-way bridge join

### Features
- **Parity "Join by" bridge dataset.** A parity series can now match observed
  and modelled values through a separate lookup/bridge table: observed (A)
  → bridge (M) → modelled (B), via two keys (A↔M and M↔B). "Join by" defaults
  to the compare-against dataset, so a plain two-file join is unchanged.
- Every join hop must be **1:1** — duplicate keys are a hard error (naming the
  dataset and column), so the observed↔modelled pairing the parity stats depend
  on can never be silently corrupted.

## Schema
### v2.23.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series` fields (parity): `joinByDatasetId` (bridge dataset;
  null = same as `joinDatasetId` = direct join), `joinKeyB` (bridge↔modelled key).
  `joinKey` is then observed↔bridge.
- v2.0–v2.22 session files load unchanged.

## v2.22.0 — Per-subplot labels, titles & shared colorbar

### Features
- **Searchable axis labels.** The Title / X / Y label fields now suggest the
  loaded datasets' column names (native datalist) while still accepting free
  text — type or pick; editing locks the label, "auto" reverts.
- **Per-subplot axis labels & titles.** In a subplot grid, an "Edit cell" Row×Col
  selector lets you set an optional X label, Y label, and title per cell (blank =
  the existing auto behavior).
- **Plot-level shared colorbar.** When subplots share one colorbar (a shared
  Color-by), a "Shared colorbar" block overrides the per-series colorbar
  (colormap, title, range, reverse) and renders exactly one bar. It forces a
  shared color range (the values you set, or the union across cells) so the
  single bar is honest, and satisfies the mixed-scale warning.

### Internal
- §6: extracted the `plotly_relayout` persistence hook from `chart.js` to
  `decorations.js` (`bindRelayoutPersistence`) — discharges the seam named since
  v2.14.0; `chart.js` 354 → ~300. `grid.js` (343) and `decorations.js` (320) are
  over the trigger and **tolerated** this release; named seam for `grid.js` is a
  per-cell sub-panel builder (`grid-cells.js`) at the next touch.

## Schema
### v2.22.0 (state version unchanged at 2 — all additive, no migration)
- New optional `plotConfig.cells` (keyed `"r,c"` → `{xLabel?, yLabel?, title?}`,
  blank = auto) and `plotConfig.colorbar` (`null` = use per-series).
- v2.0–v2.21 session files load unchanged.

## v2.21.0 — Parity readout controls

### Features
- **Notes toggle.** Free-text notes are now togglable per plot, alongside the
  Legend and Stats-box toggles.
- **Choose which parity stats show.** A per-series "Statistics box" picker
  (NSE / MAE / RMSE / R², all on by default) controls what appears in the box;
  R² is available when the best-fit line is on. Deselecting everything hides the
  box rather than drawing an empty one.
- **N moves to the legend.** The datapoint count now reads `name (n=14)` in the
  legend (default on, per series). When the plot's legend is hidden, N falls back
  into the stats box so the stats keep their sample size; N is always present in
  the screen-reader summary.

### Internal
- §6: extracted the shared modal control builders (`sizeByExtraControls`,
  `colorbarExtraControls`) into `modal-field-controls.js` — discharges the
  split obligation recorded at v2.20.0.

## Schema
### v2.21.0 (state version unchanged at 2 — all additive, no migration)
- New optional `plotConfig.notesShow` (bool, absent = shown).
- New optional `series` fields (parity): `parityStats` (array, absent = all
  four), `parityShowN` (bool, absent = true).
- v2.0–v2.20 session files load unchanged.

## v2.20.0 — Colormap overrides & contour lines

### Features
- **Per-plot and per-series colormap.** The global Colormap is now a default:
  set a colormap for a specific plot ("Colormap (this plot)" in Plot settings)
  to override it, and a colormap per series (in the Colorbar section) to
  override both. Resolution is series → plot → global.
- **Mixed-scale warning.** When two or more color-mapped series on one plot use
  different colormaps or color ranges, a warning notes that identical colors may
  not mean identical values.
- **Contour lines, labels, and grid.** Toggle the iso-lines (default on), turn
  on iso-labels with a label size (default off), and show/hide the contour's
  axis grid. Labels honor the manual color range and level count.
- **Separate colorbar fonts.** A Plot-typography toggle (default off) lets the
  colorbar title and tick sizes be set independently of the axis/tick label
  sizes.
- The contour modal's setup is regrouped (Colorbar / Contour lines / Shading /
  Scattered data) for clarity.

### Internal
- §6: `modal-chart-fields.js` is over the ~300-line trigger — tolerated this
  release; the next change there extracts the shared control builders
  (`sizeByExtraControls`, `colorbarExtraControls`) into `modal-field-controls.js`.

## Schema
### v2.20.0 (state version unchanged at 2 — all additive, no migration)
- New optional `plotConfig.colormap` (per-plot colormap; null = inherit).
- New optional `series` fields: `colormap` (per-series); contour `isoLines`,
  `isoLabels`, `isoLabelSize`, `displayGrid`.
- Style-preset file (`datalab-style-preset-v2`) gains `typography.fsCbarTitle`,
  `fsCbarTick`, and `fsCbarSeparate`; older presets load unchanged.
- v2.0–v2.19 session files load unchanged.

## v2.19.0 — Parity best-fit reporting

### Features
- **Best-fit R² moves to the stats box.** The parity best-fit line's R² now
  appears in the NSE/MAE/RMSE annotation box (alongside the fit it describes),
  not in the legend.
- **Toggle the equation.** "Show equation in legend" (default on) — turn it off
  for a clean "Best fit" legend entry without the `y = mx + b` text.
- **Significant figures.** Set the sig figs (1–10, default 4) for the equation
  and the R².

## Schema
### v2.19.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series` fields (parity): `parityFitEquation` (bool, absent =
  true), `parityFitSigFigs` (int, absent = 4).
- v2.0–v2.18 session files load unchanged.

## v2.18.1 — Colormap fix (6 of 12 were broken)

### Fixes
- **Six colormaps rendered as the wrong scale.** Plasma, Inferno, Magma,
  Coolwarm, Turbo, and Reds are not built-in Plotly named scales, so selecting
  them silently fell back to a default — the dropdown label disagreed with the
  rendered colors (a §20 honesty defect; the perceptually-uniform,
  colorblind-safe maps were among the broken ones). A new `colorscales.js`
  resolver maps every option to an explicit colorscale Plotly honors, and
  allowlists unknown values to Viridis (also closing a session-import gap).
- The Colormap picker is now grouped (perceptually-uniform/colorblind-safe →
  diverging → single-hue → rainbow), with rainbow maps (Turbo, Jet) marked as
  not perceptually uniform and diverging maps (RdBu, Coolwarm) noted as for
  data with a meaningful midpoint.

No schema change — the stored colormap name is untouched; only how it resolves
to colors changed. v2.0–v2.18.0 sessions load unchanged.

## v2.18.0 — Colorbar controls

### Features
- **Colorbar controls** across the color-mapped charts (contour, heatmap, and
  scatter/parity numeric color-by):
  - **Manual color range** — Color min / max inputs (blank = auto) set the
    colorbar's value range (`zmin`/`zmax`, or `cmin`/`cmax` for marker color-by).
  - **Reverse colormap** — a per-series toggle to flip the color direction.
  - **Hide / custom colorbar title** — set the title or hide it entirely
    (contour and scatter/parity color-by). Heatmaps keep their title (it names
    the aggregation — §20), but gain the range and reverse controls.
  - **Contour levels** — set the approximate number of contour bands
    (`ncontours`); blank = auto.

  The colormap itself is still the shared **Colormap** selector in the Style
  panel. Defaults are unchanged, so existing plots look the same.

## Schema
### v2.18.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series` fields: `colorbarTitleHide`, `colorReverse`, `colorMin`,
  `colorMax` (all colorbar charts), `contourLevels` (contour).
- v2.0–v2.17 session files load unchanged.

## v2.17.0 — Contour shading & colorbar title

### Features
- **Contour smoothing control** — a new "Smooth shading" toggle (default on, so
  existing plots are unchanged). Off renders discrete bands with straight edges
  faithful to the grid, instead of Plotly's interpolated heatmap shading and
  spline-smoothed contour lines.
- **Contour colorbar title** — the contour colorbar title is now editable (blank
  falls back to the Z column name), matching the colorbar-label control that
  scatter/parity numeric color-by already had.

## Schema
### v2.17.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series.contourSmooth` (bool, absent = smooth on).
- `series.colorbarLabel` now also drives the contour colorbar title (the field
  already existed for scatter/parity).
- v2.0–v2.16 session files load unchanged.

## v2.16.0 — Best-fit line styling

### Features
- **Parity best-fit line styling** — the best-fit line now takes a colour, a
  width, and a style (solid / dash / dot / dash-dot). Defaults are unchanged
  (series colour, width 2, solid), so existing plots look the same.

## Schema
### v2.16.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series` fields (parity): `parityFitColor` (hex), `parityFitWidth`
  (px), `parityFitStyle` (`solid`|`dash`|`dot`|`dashdot`).
- v2.0–v2.15 session files load unchanged.

## v2.15.0 — Parity fits & faithful exports

### Features
- **Parity best-fit line** — an optional linear least-squares fit (modelled vs
  observed) drawn alongside the y=x reference, with its equation and R² in the
  legend. R² (regression fit) is reported in addition to NSE (parity agreement);
  the two answer different questions.
- **Parity band styling** — the ±5% / ±10% error bands now take a colour and an
  opacity (shared across both bands); blank keeps the original blue.
- **Larger markers** — the marker-size slider now reaches 40 (was 20), and the
  per-series marker-size cap is 60 (was 30).

### Fixes
- **Parity stats box stays in its subplot** — the NSE/MAE/RMSE box is anchored to
  its parity series' own cell (axis-domain coords), so it stays inside that
  cell's plot area as subplots are added instead of drifting to the figure
  corner. It is still draggable, and a moved single-parity box still persists.
- **PNG/SVG export now matches the screen** — minor gridlines (and a zoomed
  axis range) were dropped from the exported image because the live, responsive
  panel was cloned-and-resized during download. Export now renders off-screen at
  a fixed size from a copy of the live layout, so the file is a faithful copy of
  what's on screen.
- **Interactive zoom/pan persists** — dragging to zoom (or pan) is written back
  into the plot's stored range, so it survives the next re-render (e.g. toggling
  gridlines) and is reflected in exports; a double-click reset returns to auto.

## Schema
### v2.15.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series` fields (parity): `parityFit` (bool — linear best-fit
  line + R²), `bandColor` (hex) and `bandOpacity` (0–1) for shared band styling.
- v2.0–v2.14 session files load unchanged.

## v2.14.0 — Encoding & Style Controls

### Features
- **Size-by controls (scatter, parity)** — choose the sizing law (area-proportional,
  the honest default, or diameter-proportional with a warning), set the min/max
  marker size, and customise the size legend: a label, the swatch count, hide it,
  or move it to its **own second legend** (draggable, position persisted).
- **Marker shape (scatter, parity, line)** — pick a per-series marker symbol
  (circle, square, diamond, triangle, cross, x, star, …); blank inherits circle.
- **Line series controls** — toggle markers on/off, set a marker colour separate
  from the line colour, and choose a line style (solid / dash / dot / dash-dot).

### Fixes
- **Global marker size now works on line plots** — line markers were a hardcoded
  4 px that ignored the Marker-size slider and per-series size; they now honour
  both (default 6 px, matching scatter).
- **Honesty (§20)** — line colour-by warns when missing values form a "(blank)"
  group or when a column has too many categories (>50); parity warns when X and Y
  are the same column (a trivial NSE = 1).
- The series legend label drops the redundant "(size: …)" suffix when the size
  key has its own legend.
- Two parity tests that broke on Stabilization A's new join-dataset option were
  fixed (the suite was 183 pass / 2 fail at the v2.13.0 tag; now green).

### Internal / Docs
- New reviewer docs — `docs/REVIEW_GUIDE.md` (plain-language orientation) and
  `docs/CODE_WALKTHROUGH.md` (full file-by-file walkthrough). All documentation
  moved into `docs/`; `README.md` stays at the repo root.
- Left panel: "Style presets" moved to the bottom; "Applies to all plots" scope
  captions added to the global Style/Typography/Frame sections.
- §6: `chart.js` (311), `modal-chart-fields.js` (306), and `modal.js` (305) are
  over the ~300 trigger — tolerated this release with named split seams
  (chart.js's `plotly_relayout` hook → `decorations.js`; the modal save/field
  assembly at the next modal change).

## Schema
### v2.14.0 (state version unchanged at 2 — all additive, no migration)
- New optional `series.style` fields: `symbol` (scatter/parity/line marker shape);
  `showMarkers`, `markerColor`, `lineDash` (line only; `color` is the line colour).
- New optional `series` fields (scatter/parity size-by): `sizeLaw`, `sizeMin`,
  `sizeMax`, `sizeKeyLabel`, `sizeKeyCount`, `sizeKeyHide`, `sizeKeySeparate`.
- New optional `plotConfig.legend2Pos` (the second legend's persisted position).
- v2.0–v2.13 session files load unchanged.

## v2.13.0 — Stabilization A (correctness & honesty)

### Features
- **Parity within one dataset** — a parity series no longer requires a second
  dataset: pick two columns of the same file (observed vs predicted), the
  common case. The cross-dataset join stays available via "Compare against".
- **Line color-by** — colouring a line by a categorical column now draws one
  line per category. It was previously offered in the modal but silently
  ignored.

### Fixes
- **Legend** stays within the figure — a dragged legend is clamped to the plot
  bounds instead of drifting off to the right.
- **Parity stats box** — dragging the NSE/MAE/RMSE box now persists, so it
  survives re-render and exports exactly where you placed it.
- **SVG export** warns when a large (>10k-point) scatter layer will rasterize
  inside the SVG (axes and text stay vector).

### Internal
- The ambiguous-date-format prompt moved to its own file (`date-prompt.js`, §6
  refactor) — no behavior change.

## Schema
### v2.13.0 (state version unchanged at 2 — no new fields)
- Same-dataset parity reuses the **absence** of the existing
  `series.joinDatasetId` (no join selected) instead of adding a field; line
  color-by uses the existing `series.colorCol`. No migration; v2.0–v2.12
  session files load unchanged.

## v2.12.0 — Plotly 3.x

### Changed
- **Plotly.js upgraded 2.32.0 → 3.6.0.** The charting library is now current
  (it had been two major versions behind). DataLab's API surface was already
  clean against every Plotly 3.0.0 breaking change, so there is **no behavior
  change** — plots render identically apart from sub-pixel/antialiasing
  differences. The full functional suite, all accessibility (axe) states, and
  the complete benchmark set were re-baselined green, and WebGL rendering
  (`scattergl`) was confirmed to work under the unchanged Content-Security-
  Policy (`worker-src blob:`). No schema change; sessions are unaffected.

## v2.11.0 — Workspace & Encoding Ergonomics

### Features
- **Copy/paste series** — copy a series and paste it into the active plot, to
  reuse it across plots without rebuilding it.
- **Hide a series from the legend** — a per-series toggle drops its legend
  entry while keeping it plotted.
- **Hide the parity stats box** — a "Stats box" toggle hides the NSE/MAE/RMSE
  annotation, the same way the legend can be hidden.
- **Show / hide plots** — each panel gains a hide toggle that collapses the
  plot to a restorable chip (previously a plot could only be deleted); the last
  visible plot can't be hidden.
- **Export at on-screen size** — a "Match on-screen size" option exports
  PNG/SVG at the panel's displayed size instead of the Export-size sliders.
- **Subplot shared encoding** — one Color-by / Size-by applied to every cell of
  a subplot grid, instead of setting it on each series.
- **Cross-dataset scatter join (optional)** — a scatter series can inner-join a
  second dataset on a shared key (X from the primary dataset, Y from the joined
  one); only matched rows are plotted. Off by default — scatter plots all rows
  as before.

## Schema
### v2.11.0 (state version unchanged at 2 — all additive)
- `series.legendHide`; `plot.hidden`; `plotConfig.statsShow`,
  `plotConfig.sharedColorCol`, `plotConfig.sharedSizeCol` (all optional).
  Scatter series may now also carry the existing `joinDatasetId`/`joinKey`
  (no new field). v2.0–v2.10 session files load unchanged.

## v2.10.0 — Interpolated Contours

### Features
- **Interpolated contours** — a contour series can now be built from
  **scattered** (X, Y, Z) points, not only a pre-gridded sweep. Tick
  "Interpolate scattered data" on the contour setup. The surface is gridded
  by binned-mean aggregation, then empty cells inside the data's reach are
  filled by a harmonic (Laplace) relaxation whose **maximum principle
  guarantees no invented peaks or valleys**. Cells outside the data's convex
  hull, or farther than ~1.5 cells from any sample, render as **gaps — never
  extrapolated**. The method is named on hover. The pre-gridded path is
  unchanged and stays the default.
- **Show data points** — an overlay option on an interpolated contour marks
  the original sample locations, so you can see where the surface is backed
  by data versus interpolated.

## Schema
### v2.10.0 (state version unchanged at 2 — all additive)
- `series.interpolate`, `series.showPoints` (both optional, contour-only).
  v2.0–v2.9 session files load unchanged.

## v2.9.1 — [hotfix]

### Fixes
- **Startup layout** — opening the app no longer shows an empty plot region
  beneath the "No data yet" message. `renderPlotGrid()` set the grid's
  column class with a wholesale assignment that also wiped its `hidden`
  class, so the reconciliation pass at startup un-hid an empty grid. The
  column class is now set via `classList`, leaving visibility to the
  render/clear path. No schema change.

## v2.9.0 — Legend & Colorbar Polish

### Features
- **Self-describing color** — coloring a series by a column now reads
  correctly: a **categorical** column produces a named discrete legend
  (one entry per category, palette-colored) instead of a continuous
  colorbar over category codes; a **numeric** column keeps the colorbar
  and gives it a **label** (defaults to the column name, editable).
- **Parity color & size** — parity plots can be colored and sized by a
  column from the observed dataset, threaded through the join so colors
  and sizes stay aligned with their points.
- **Bubble size key** — a size-by series shows a min / median / max key in
  the legend, with swatch areas matching the data mapping.
- **Legend label override** — a per-series field sets the exact legend
  text, overriding the auto-generated label and its suffixes.
- **Colorbar fonts** follow the typography panel — the title scales with
  "Axis label size", the numbers with "Tick label size".
- **Auto-render** — plots update automatically as you add, edit, or remove
  series; the manual Render button is gone.
- **Style presets** are an always-visible row in the settings panel.
- **Accessibility** — datasets announce their arrival (name, rows,
  columns) to screen readers when loaded.

### Fixes
- The first render now sizes to its container instead of coming up small
  until the next edit.

## Schema
### v2.9.0 (state version unchanged at 2 — all additive)
- `series.colorbarLabel`, `series.legendLabel` (both optional). `colorCol`
  and `sizeCol` (existing) now apply to parity series too. v2.0–v2.8
  session files load unchanged.

## v2.8.0 — Robust Comparison

### Features
- **Rank-based comparison** — Compare groups gains a Method select:
  Parametric (Welch t / ANOVA, unchanged default) or Rank-based
  (Mann–Whitney U for two groups, Kruskal–Wallis for three or more).
  Rank-based results report rank-biserial r / ε² with every p-value and
  show **median + IQR** per group — the honest center for the test being
  run. p-values use the tie-corrected normal approximation; verdicts
  append "(normal approx.)" whenever any group has fewer than 10 values.
- **Paired comparison** — Compare select: Groups or Paired columns. Two
  numeric columns compared row-by-row: paired t (with dz) or Wilcoxon
  signed-rank (with rank-biserial r; zero differences dropped and
  counted, the standard convention). Only complete pairs are used —
  the verdict always shows n pairs and how many incomplete pairs were
  dropped. Picking the same column twice is rejected.

### Internal
- Hypothesis tests live in `hypothesis.js`; the special-function
  numerics (log-gamma, incomplete beta/gamma, normal CDF) in
  `specfun.js`. Dialog wiring deduplicated; CSV ingestion moved next to
  the parser.

## Schema
### v2.8.0 (state version unchanged at 2)
- No session-schema changes — Compare is a Data Tools view; nothing new
  is serialized. v2.0–v2.7 session files load unchanged.

## v2.7.0 — Chart & Workspace Completions

### Features
- **Heatmap** (9th chart type) — category × category × numeric value
  with an explicit aggregation choice; repeated combinations error under
  None; the colorbar names the aggregation; missing combinations render
  as gaps.
- **Bubble sizes** — scatter "Size by" column; marker **area** is
  proportional to the value (4–28 px), hover shows the raw value, the
  legend names the size column.
- **Right Y axis** — per-series toggle for scatter/line/bar; both axis
  titles tint to their series' colors; warns when the same column lands
  on both axes; unavailable inside subplot grids.
- **Notes** — free-text annotations per plot: add/delete in Plot
  settings, drag to position (persists, saved in sessions).
- **Data Tools:** cast to datetime (ISO output, format-ambiguity prompt
  reused) and column reorder (header order drives pickers, preview, and
  CSV export).

## Schema
### v2.7.0 (state version unchanged at 2 — all additive)
- `series.sizeCol`, `series.rightAxis`; `plotConfig.notes`
  (`[{ id, text, x, y }]`). v2.0–v2.6 session files load unchanged.

## v2.6.0 — Statistical Comparison

### Features
- **Compare groups** (Data Tools) — Welch's t-test for two groups,
  one-way ANOVA for three or more. Results always show per-group n,
  mean, SD and the effect size (Cohen's d / η²) alongside the p-value —
  a p-value never appears alone, by policy.
- **Log-space histogram binning** — histograms on a Log X axis now bin
  in log₁₀ (equal bins per decade) instead of warning and staying
  linear, completing the deferral noted in that warning since v2.2.0.
  Fit and KDE overlays scale correctly against the varying bin widths.
- **Quadratic and cubic trendlines** — degree picker beside the
  trendline checkbox; the legend shows the full fitted equation with R².
  Per-group fits remain linear.

## Schema
### v2.6.0 (state version unchanged at 2 — all additive)
- `series.trendDegree` (1–3, default 1). v2.0–v2.5 session files load
  unchanged; sessions with histogram + Log X now render with log bins
  (the previously warned deferral, see Features).

## v2.5.0 — Computed Columns

### Features
- **Computed columns** — Data Tools → New column: derive a column from an
  arithmetic expression over existing columns (`(temp - 32) * 5/9`,
  `` log10(`flow rate`) ``, ratios, unit conversions). Live preview shows
  the first results or the parse error as you type. Columns chain — a
  computed column can reference an earlier one.
- Expressions are arithmetic only — numbers, column names, `+ − * / % ^`,
  parentheses, and 11 math functions. By design there is **no scripting**:
  the expression engine has no access to strings, properties, or code of
  any kind (see `src/js/expr.js` for the security contract).
- Values are **materialized**: computed once, stored as plain data, saved
  in sessions like any column. Editing source data later does not silently
  recompute — re-derive deliberately. The defining expression is kept as
  dataset metadata.

## Schema
### v2.5.0 (state version unchanged at 2 — all additive)
- `dataset.computed` — `{ columnName: expressionString }` provenance
  metadata; computed values live in rows as plain numbers (NaN saves as
  null = missing). v2.0–v2.4 session files load unchanged.

## v2.4.0 — Distributions & Derived Analysis

### Features
- **Distribution fits on histograms** — the Fit-normal checkbox is now a
  picker: Normal, Lognormal, or Weibull (maximum likelihood). Lognormal
  and Weibull exclude non-positive values with a warning; parameters
  appear in the legend. Old sessions with the normal-fit checkbox load
  unchanged.
- **KDE overlay** — Gaussian kernel density (Silverman bandwidth) on any
  histogram.
- **Violin plots** (8th chart type) — KDE outline with the Tukey box
  inside, grouped by category like box plots.
- **Per-group trendlines** — opt-in: one fit per color group (≤ 10),
  palette-colored, each legend entry carrying the group, equation and R².
  Existing single-fit sessions render unchanged.

## Schema
### v2.4.0 (state version unchanged at 2 — all additive)
- `series.fitDist` ('normal' | 'lognormal' | 'weibull'), `series.kde`,
  `series.trendGroups` — `fitNormal` (Phase 5) still honored via fallback
- v2.0–v2.3 session files load unchanged

## v2.3.0 — Subplot Figures

### Features
- **Subplot figures** — any plot panel can become an r × c grid of
  subplots inside a single figure: one Plotly canvas, one exported image
  (publication-style multi-panel figures). Configure under Plot
  settings → Subplot grid; assign each series to a cell in the series
  editor.
- **Shared axes** — share X / share Y across cells. Parity cells keep
  their equal-axis geometry and are excluded from sharing (with a
  warning) — sharing would break the y = x constraint.
- Per-cell axis labels derive from the first series in each cell unless
  the plot's labels are locked; per-cell render errors name their cell
  (R2C1 · series name).
- Shrinking a grid clamps series into the nearest edge cell without
  losing their stored position — re-growing restores the arrangement.

## Schema
### v2.3.0 (state version unchanged at 2 — all additive)
- `plot.grid { rows, cols, shareX, shareY }` (default null = no grid)
- `series.cell { row, col }` (default 1·1)
- v2.0–v2.2 session files load unchanged

## v2.2.0 — Chart Essentials

Sourced from the team landscape review: the table-stakes gaps every
surveyed plotting tool covers.

### Features
- **Bar charts** (7th chart type) — categorical X with an explicit
  aggregation choice (none / count / sum / mean / median). With None,
  repeated categories produce an error telling you to choose — DataLab
  never aggregates silently, and the legend always states the
  aggregation.
- **Error bars** — scatter and line take a ± column (works with datetime
  X); bar means take SD or SEM. The legend always names what the bars
  represent.
- **Log axes** — per-plot Log X / Log Y toggles in Axis ranges. Values
  ≤ 0 that a log axis cannot show are counted in a warning instead of
  vanishing silently. Histograms keep a linear X (bins are linear);
  parity plots render log-log only (equal scale preserved).
- **Linear trendline** (scatter) — least-squares fit; the legend entry is
  the equation and R².
- **Data preview** — paginated table (50 rows/page) in Data Tools,
  reflecting every cleaning operation immediately.

### Fixed
- Parity series editor: the Y (modelled) column picker listed columns
  from the primary dataset instead of the join dataset — with differing
  headers the correct column could not be selected (latent since v0.1.0)

## Schema
### v2.2.0 (state version unchanged at 2 — all additive)
- `plotConfig.xLog` / `plotConfig.yLog` (default false)
- `series.agg`, `series.errMode` (bar), `series.errCol` (scatter/line),
  `series.trendline` (scatter) — all optional with defaults; v2.0/v2.1
  session files load unchanged

## v2.1.0 — Export, Presets & Control Refinements

### Features
- **Export all** — one numbered PNG per visible plot at the Export size
  (the browser may prompt once for multiple-download permission)
- **Preset categories** — saving a style preset now asks which setting
  groups to include: Style, Export size, Plot typography, Frame & grid.
  Old (v1) preset files still load, treated as all categories.
- Parity statistic definitions (NSE / MAE / RMSE) in the help dialog
- Export width/height sliders share one range (300–1600) so equal values
  align; all plot typography sliders now reach 40

### Schema (style preset file — session state schema unchanged at v2)
- `datalab-style-preset-v2`: sectioned by category (`style`, `exportSize`,
  `typography`, `frame`); loading applies only the sections present in the
  file, against a fixed field allowlist. v1 flat files load as
  all-categories.

### Fixed
- "Figure size" panel renamed **"Export size"** with an explanatory hint —
  panels autosize to the grid on screen; the sliders set PNG/SVG export
  dimensions only (was misread as a broken on-screen control)
- **Security:** session import now rejects files whose plot/dataset/series
  ids are not uid-shaped (`/^[\w-]{1,64}$/`). Ids were interpolated into
  innerHTML id attributes unescaped; a hand-crafted session file could
  execute script. Legitimate session files are unaffected.

## Corrections
- **NSE (parity plots) now follows the standard Nash–Sutcliffe definition.**
  Old behavior: SS_tot was computed around the mean of the *modelled*
  values. New behavior: around the mean of the *observed* values, per the
  definition NSE = 1 − Σ(mod−obs)² / Σ(obs − mean(obs))². Displayed NSE
  values change slightly for well-matched data and substantially for biased
  or low-variance models (a constant-at-mean model now correctly scores 0
  instead of NaN). Session data is untouched — only the displayed statistic
  was wrong. Data Scientist sign-off; references re-derived by hand
  (STANDARDS §3 correctness carve-out, §20 reference-value rule).

## v2.0.0 — Multi-Plot Live Grid

### Features
- **Multiple live plots side by side.** + Plot adds a panel; the grid
  auto-arranges (1 full width, 2 side by side, up to 2×2, then 3 columns)
- Each plot owns its title, axis labels, axis ranges, and legend; the
  Plot settings panel edits whichever plot is **active** (click a panel)
- Each series belongs to a plot — the series editor gains a Plot picker
  and the series list shows plot chips when the grid has several
- Panels size themselves to their grid cell; the Figure size sliders now
  set the **export** size. Saves, PNG/SVG export, and the correlation
  heatmap operate on the active panel
- Deleting a plot deletes its series (confirmation shown); the last plot
  cannot be deleted

### Why v2.0.0
The session state schema changed in a breaking way (per-plot
configuration, series→plot assignment). **Session files from any v1.x
load automatically** — they migrate into a single-plot grid with nothing
lost — but files saved by v2 cannot be read by v1.x.

## Schema

### v2.0.0 (state version 2 — first real migration)
- `plotConfig` (singleton) replaced by `plots: [{ id, name, plotConfig }]`
- `series.plotId` added (every series belongs to a plot)
- `activePlotId` added
- Migration v1→v2: the old `plotConfig` becomes `plots[0]` ("Plot 1");
  every series is assigned to it. Newer-version files are refused with a
  clear message.

## v1.2.0 — Plot Controls & UI Polish

Sourced from maintainer review of v1.1.0.

### Features
- **Plot typography panel:** font-size sliders for title, axis labels,
  tick labels, legend, and stats annotations; plot margins scale with the
  fonts so large labels survive export (completes a Phase 1 deliverable
  that had been recorded as done but only half-built — see PLANNING.md
  record corrections)
- **Plot frame controls:** axis line and gridline color + width; "auto"
  follows the background-luminance theme, explicit values override
- **Legend controls:** show/hide toggle; a dragged legend now keeps its
  position across re-renders and session round-trips (previously snapped
  back to the corner on any style change)
- **Larger UI chrome:** header and panel text/symbols scaled up one step;
  left panel widened to match
- Style presets carry all the new fields (older preset files still load)
- "Edge color" relabeled "Marker edge"

## Schema

### v1.2.0
- `plotConfig.legendShow` (optional boolean, default true) and
  `plotConfig.legendPos` (optional {x, y}) — backward compatible, no
  migration.

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
