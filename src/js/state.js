// state.js — application state schema, session serialization, and escHtml

// Single source of truth for the app version (STANDARDS.md §3).
// build.js parses the declaration below — do not rename or reformat it.
const VERSION = '1.0.0';

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
//   // parity-specific (only when chartType === 'parity'):
//   joinDatasetId, joinKey, showBands, band5, band10,
//   // all series:
//   filters: [{ col, op, value, enabled }],
//   style:   { color, markerSize, opacity, lineWidth }
// }
//
// Dataset shape (entries in appState.datasets):
// { id, name, rows, headers, color }
//
const appState = {
  version:  1,
  datasets: [],
  series:   [],
  plotConfig: {
    title:        '',
    xLabel:       '',
    yLabel:       '',
    figWidth:     700,
    figHeight:    500,
    titleLocked:  false,
    xLabelLocked: false,
    yLabelLocked: false,
    annotPos:     null,   // { x, y } in paper coords; null = default
    figInited:    false,  // true after first render sets slider defaults
    majorGrid:    true,
    minorGrid:    false,
  },
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
