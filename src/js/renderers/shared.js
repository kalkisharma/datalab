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
//     its renderer file. Data Viz Engineer writes it; Data Scientist reviews.
//
// Shared utilities (colVals, buildMarkerStyle, colorMapping) are helpers
// in this file — not part of the interface. Tested via renderers.
//
// ─────────────────────────────────────────────────────────────────────────

const PALETTE = [
  '#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f',
  '#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
];

/**
 * Extract numeric values for a column from rows. Non-finite values become NaN.
 * @param {object[]} rows
 * @param {string}   col
 * @returns {number[]}
 */
function colVals(rows, col) {
  return rows.map(r => {
    const v = r[col];
    const n = Number(v);
    return (v === null || v === undefined || v === '' || !Number.isFinite(n)) ? NaN : n;
  });
}

/**
 * Build a Plotly marker config from a series style + global style state.
 * @param {object} seriesStyle  - series.style (may be partial)
 * @param {number} [colorOverride] - optional numeric array for color mapping
 * @returns {object} Plotly marker object
 */
function buildMarkerStyle(seriesStyle, colorOverride) {
  const s = seriesStyle || {};
  const marker = {
    size:    s.markerSize    ?? Number(document.getElementById('markerSize')?.value  ?? 6),
    opacity: s.opacity       ?? (Number(document.getElementById('markerOpacity')?.value ?? 80) / 100),
    line: {
      color: s.edgeColor ?? document.getElementById('edgeColor')?.value ?? '#ffffff',
      width: s.lineWidth  ?? Number(document.getElementById('edgeWidth')?.value  ?? 0.5),
    },
  };
  if (colorOverride !== undefined) {
    marker.color     = colorOverride;
    marker.colorscale = document.getElementById('cmapSelect')?.value ?? 'Viridis';
    marker.showscale  = true;
  } else {
    // Use the series color (dataset palette color or per-series override)
    marker.color = s.color ?? '#5b8dee';
  }
  return marker;
}

/**
 * Map a categorical or numeric color column to Plotly color values.
 * Returns an array of numeric values (for colorscale) if numeric,
 * or maps categories to palette indices if categorical.
 * @param {object[]} rows
 * @param {string}   col
 * @returns {{ colorVals: number[], isNumeric: boolean }}
 */
function colorMapping(rows, col) {
  const raw = rows.map(r => r[col]);
  const nums = raw.map(v => Number(v));
  const isNumeric = nums.filter(Number.isFinite).length > raw.length * 0.5;
  if (isNumeric) return { colorVals: nums, isNumeric: true };

  // Categorical: map each unique string to a palette index
  const cats = [...new Set(raw.map(String))];
  const colorVals = raw.map(v => cats.indexOf(String(v)));
  return { colorVals, isNumeric: false };
}
