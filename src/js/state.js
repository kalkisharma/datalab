// state.js — application state schema, session serialization, and escHtml

// Single source of truth for the app version (STANDARDS.md §3).
// build.js parses the declaration below — do not rename or reformat it.
const VERSION = '2.20.0';

// ── appState ──────────────────────────────────────────────────────────────
//
// Single source of truth for all application state. The DOM renders from
// appState — never the other way around. Serializes cleanly with
// JSON.stringify (no DOM references, no functions).
//
// Session serialization format:
//   [{ name: string, state: { ...appState } }]
//
// The version field is required in all serialized sessions. A change to the
// behavior of an existing field is a MAJOR version bump. Adding a new
// optional field with a backward-compatible default does not require a
// migration. See STANDARDS.md §3.
//
// Series shape (entries in appState.series):
// {
//   id, datasetId, xCol, yCol, colorCol, chartType,
//   // join: joinDatasetId, joinKey — parity always; scatter optional (workspace ergonomics)
//   // parity-only: showBands, band5, band10; parityFit (bool — linear best-fit
//   //   line; R² is shown in the stats box, not the legend); parityFitEquation
//   //   (bool, absent = true — show the equation in the legend); parityFitSigFigs
//   //   (int 1–10, absent = 4 — sig figs for the equation + R²); parityFitColor
//   //   (hex, absent = series color) / parityFitWidth (px, absent = 2) /
//   //   parityFitStyle ('solid'|'dash'|'dot'|'dashdot', absent = solid) — best-fit
//   //   line styling; bandColor (hex) / bandOpacity (0–1) — shared ±5%/±10% band
//   //   styling, absent = default blue #5b8dee
//   // contour (Phase 17): interpolate (bool) — grid scattered (x,y,z) when true;
//   //                      showPoints (bool) — overlay sample locations;
//   //                      contourSmooth (bool, absent = true) — false renders
//   //                      discrete bands with straight edges (no Plotly smoothing);
//   //                      contourLevels (int ≥ 2, absent = auto) — ncontours;
//   //                      isoLines (bool, absent = true) — show contour lines;
//   //                      isoLabels (bool, absent = false) — label the levels;
//   //                      isoLabelSize (px, absent = 10); displayGrid (bool,
//   //                      absent = inherit global) — this contour's axis grid (v2.20.0)
//   // colorbar controls (v2.18.0; contour/heatmap/scatter+parity numeric color-by):
//   //   colorbarLabel (str — title text, absent = column/agg name); colorbarTitleHide
//   //   (bool — no title; heatmap always names the aggregation, §20, so it ignores
//   //   this); colorMin/colorMax (num, absent = auto — zmin/zmax for contour/heatmap,
//   //   cmin/cmax for marker color-by); colorReverse (bool — reverse the colormap);
//   //   colormap (str, absent = inherit plot then global) — per-series override (v2.20.0)

//   // bar (Phase 9): agg ('none'|'count'|'sum'|'mean'|'median'),
//   //                errMode ('sd'|'sem'|null — mean only)
//   // scatter/line (Phase 9): errCol (± column), trendline (scatter only)
//   // scatter/parity size-by (Phase 14 + 19): sizeCol; sizeLaw ('area' default
//   //   | 'diameter' — exaggerates, warns); sizeMin/sizeMax (px, default 4/28);
//   //   sizeKeyLabel (size-legend title); sizeKeyCount (swatches, default 3);
//   //   sizeKeyHide (bool); sizeKeySeparate (bool — route size key to legend2)
//   // subplots (Phase 10): cell { row, col } 1-based, optional (default 1·1)
//   // all series: legendHide (bool) — suppress this series' legend entries (workspace ergonomics)
//   filters: [{ col, op, value, enabled }],
//   style:   { color, markerSize, opacity, lineWidth, symbol?, showMarkers?, markerColor?, lineDash? }
//   //   symbol (Phase 19+): per-series marker shape (scatter/parity/line);
//   //   absent = global/default 'circle'. Plotly marker-symbol name.
//   //   LINE-only (Phase 19+): showMarkers (bool, absent = true — toggle markers);
//   //   markerColor (hex, absent = inherit the line colour, single-line path);
//   //   lineDash ('dash'|'dot'|'dashdot', absent = solid). color = LINE colour.
// }
//
// Plot shape (entries in appState.plots):
// { id, name, plotConfig, hidden?,  // hidden (bool, default false) — panel hidden from the grid but kept in state (workspace ergonomics)
//   grid? }  // Phase 10: { rows, cols, shareX, shareY } | null — additive
//            // with default null (no grid), so state stays v2 (§3)
//
// Dataset shape (entries in appState.datasets):
// { id, name, rows, headers, color }
//
// Per-plot configuration (Phase 7: plotConfig went from singleton to one
// per plot — state version 2, migration in sessions.js)
function makeDefaultPlotConfig() {
  return {
    title:        '',
    xLabel:       '',
    yLabel:       '',
    titleLocked:  false,
    xLabelLocked: false,
    yLabelLocked: false,
    annotPos:     null,   // { x, y } paper coords; null = default
    legendShow:   true,
    statsShow:    true,   // parity NSE/MAE/RMSE box — toggle like the legend (workspace ergonomics)
    legendPos:    null,   // { x, y }; null = default corner
    legend2Pos:   null,   // { x, y }; second legend for opt-in size keys (Phase 19), null = default corner
    xMin: '', xMax: '', yMin: '', yMax: '', // manual axis ranges ('' = auto)
    colormap: null, // per-plot colormap override (v2.20.0); null = inherit the global picker
    // Log axis toggles (Phase 9 — additive with defaults, no migration §3)
    xLog: false, yLog: false,
    // Free-text notes (Phase 14): [{ id, text, x, y }] in paper coords
    notes: [],
    // Subplot-wide encoding (workspace ergonomics): one color-by / size-by
    // applied to every cell, overriding per-series; null = per-series
    sharedColorCol: null,
    sharedSizeCol:  null,
  };
}

function makePlot(name) {
  return {
    // uid() lives in wiring.js — declared later in the bundle but defined
    // before any runtime call (function declarations hoist per bundle)
    id:   typeof uid === 'function' ? uid() : 'p1',
    name,
    plotConfig: makeDefaultPlotConfig(),
  };
}

const appState = {
  version:  2,
  datasets: [],
  series:   [],   // each series carries plotId (Phase 7)
  plots:    [{ id: 'p1', name: 'Plot 1', plotConfig: makeDefaultPlotConfig() }],
  activePlotId: 'p1',
  style: {
    markerSize:    6,
    markerOpacity: 0.8,
    edgeColor:     '#ffffff',
    edgeWidth:     0.5,
    colormap:      'Viridis',
  },
  savedPlots:   [],
  plotRendered: false,
};

// ── escHtml ───────────────────────────────────────────────────────────────
//
// Escapes a value for safe insertion into innerHTML contexts.
// Must be applied to ALL user-controlled strings before DOM insertion:
// series names, filter values, column names, dataset names, titles,
// labels, category strings, hovertemplate values, and renderer errors.
//
// Note: raw trimmed column names are used for display in dropdown menus.
// Escaped versions are used only when interpolated into innerHTML contexts.
// See parseCSV() in data.js for the escaping contract at parse time.
//
/**
 * @param {*} s
 * @returns {string}
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
