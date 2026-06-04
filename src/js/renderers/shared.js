// shared.js — renderer interface contract and shared trace utilities

// ── Renderer Interface Contract ───────────────────────────────────────────
//
// Every renderer exports a function with this signature:
//
//   buildTrace(series, datasets) → { traces: Plotly.Data[], error: string | null, warning?: string | null }
//
//   series   — one entry from appState.series
//   datasets — the full appState.datasets array
//   traces   — array of Plotly trace objects (may be empty if error is set)
//   error    — human-readable message if the series cannot render, else null
//   warning  — optional non-blocking message (rendering proceeds); same
//              escaping rules as error. Added Phase 3 (EL + Data Viz review)
//              for the boxplot >50-categories case.
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

// Okabe-Ito palette — the standard color-vision-deficiency-safe set
// (Okabe & Ito 2008), distinguishable under protanopia, deuteranopia, and
// tritanopia. Data Scientist sign-off, Phase 4 (replaces Tableau-10).
const PALETTE = [
  '#0072b2', // blue
  '#e69f00', // orange
  '#009e73', // bluish green
  '#d55e00', // vermillion
  '#cc79a7', // reddish purple
  '#56b4e9', // sky blue
  '#f0e442', // yellow
  '#999999', // grey
];

// ── Dataset revisions + memoized column extraction (Phase 2, Performance) ──
//
// Revisions live in a module map, not on the dataset object, so they never
// leak into serialized session state. Bumping a revision invalidates every
// cached column extraction for that dataset; the trace cache in chart.js
// keys on revisions too, so it invalidates transitively.

const _dsRev    = new Map(); // dsId → integer revision
const _colCache = new Map(); // dsId + '\x00' + col → number[]

function datasetRev(dsId) { return _dsRev.get(dsId) ?? 0; }

function bumpDatasetRev(dsId) {
  _dsRev.set(dsId, datasetRev(dsId) + 1);
  for (const k of [..._colCache.keys()]) {
    if (k.startsWith(dsId + '\x00')) _colCache.delete(k);
  }
}

// Memoized colVals over the FULL (unfiltered) rows of a dataset. Only valid
// when the caller is operating on ds.rows itself — renderers fall back to
// plain colVals when filters produce a different row array.
function colValsCached(ds, col) {
  const key = ds.id + '\x00' + col;
  let v = _colCache.get(key);
  if (!v) { v = colVals(ds.rows, col); _colCache.set(key, v); }
  return v;
}

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
 * Datetime X pairs: converts X with the dataset's stored (or detected)
 * format and drops pairs TOGETHER — a null date or non-finite Y removes the
 * whole pair (same pairing rule as parity, Phase 1 finding).
 * @returns {{ xV: string[], yV: number[] } | { error: string }}
 */
function datetimeXY(ds, rows, xCol, yCol) {
  let fmt = ds.dateFormats?.[xCol];
  if (!fmt) {
    const det = detectDateFormat(rows.map(r => r[xCol]));
    if (det === 'ambiguous') {
      return { error: `Date format for "${xCol}" is ambiguous — edit the series to choose MM/DD or DD/MM.` };
    }
    fmt = det || 'ISO';
  }
  const xV = [], yV = [];
  for (const r of rows) {
    const d = parseDateValue(r[xCol], fmt);
    const y = Number(r[yCol]);
    if (d !== null && Number.isFinite(y)) { xV.push(d); yV.push(y); }
  }
  return { xV, yV };
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
      color: s.edgeColor ?? document.getElementById('edgeColor')?.value ?? '#333333',
      // edgeWidth, not lineWidth — lineWidth is the line-trace width (schema, state.js)
      width: s.edgeWidth ?? Number(document.getElementById('edgeWidth')?.value ?? 0.5),
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
