// shared.js — renderer interface contract and shared trace utilities

// ── Renderer Interface Contract ───────────────────────────────────────────
//
// Every renderer exports a function with this signature:
//
//   buildTrace(series, datasets) → { traces: Plotly.Data[], error: string | null }
//
//   series   — one entry from appState.series
//   datasets — the full appState.datasets array
//   traces   — array of Plotly trace objects (may be empty if error is set)
//   error    — human-readable message if the series cannot render, else null
//
// Rules:
//   - Error messages may contain user data (column names, dataset names).
//     Callers MUST apply escHtml() before inserting error into the DOM.
//     Error containers MUST use role="alert".
//   - Equal axis ranges are required for parity renderers (set explicitly
//     in the returned layout, not left to Plotly auto-range).
//   - Log scale guidance for each chart type is documented at the top of
//     its renderer file. Data Scientist reviews before renderer merges.
//
// Shared utilities (colVals, buildMarkerStyle, colorMapping) are helpers
// in this file, not part of the interface. Tested via the renderers that
// use them.
//
// ─────────────────────────────────────────────────────────────────────────
