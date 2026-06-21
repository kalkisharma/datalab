// shared.js — renderer interface contract and shared trace utilities

// ── Renderer Interface Contract ───────────────────────────────────────────
//
// Every renderer exports a function with this signature:
//
//   buildTrace(series, datasets, ctx?) → { traces: Plotly.Data[], error: string | null, warning?: string | null }
//
//   series   — one entry from appState.series
//   datasets — the full appState.datasets array
//   ctx      — OPTIONAL plot-level context (Phase 13 amendment per §7,
//              Data Viz authored, EL approved): currently { xLog: boolean }.
//              Only renderers whose OUTPUT depends on plot state read it
//              (histogram log-space binning); the trace cache keys on it.
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
 * errCol (Phase 9, optional): a ± error column kept aligned with the pairs;
 * a non-finite error keeps the pair, the error becomes NaN (no bar drawn).
 * @returns {{ xV: string[], yV: number[], eV: number[]|null } | { error: string }}
 */
function datetimeXY(ds, rows, xCol, yCol, errCol) {
  let fmt = ds.dateFormats?.[xCol];
  if (!fmt) {
    const det = detectDateFormat(rows.map(r => r[xCol]));
    if (det === 'ambiguous') {
      return { error: `Date format for "${xCol}" is ambiguous — edit the series to choose MM/DD or DD/MM.` };
    }
    fmt = det || 'ISO';
  }
  const xV = [], yV = [], eV = errCol ? [] : null;
  for (const r of rows) {
    const d = parseDateValue(r[xCol], fmt);
    const y = Number(r[yCol]);
    if (d !== null && Number.isFinite(y)) {
      xV.push(d); yV.push(y);
      if (eV) { const e = Number(r[errCol]); eV.push(Number.isFinite(e) ? e : NaN); }
    }
  }
  return { xV, yV, eV };
}

/**
 * Plotly error_y config from a ± column (Phase 9). The SEMANTICS rule
 * (STANDARDS §20) is satisfied by the caller appending "± col" to the
 * trace name — never attach this without that label.
 * @param {number[]} eV - aligned ± values (NaN = no bar for that point)
 * @returns {object} Plotly error_y
 */
function errorBarsFromCol(eV) {
  return { type: 'data', array: eV, visible: true };
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
    // Marker shape (Phase 19+): per-series override, else the (future) global
    // control, else Plotly's circle. The #markerSymbol lookup is intentionally
    // left in place so a Stab-C global control needs no renderer change.
    symbol:  s.symbol        ?? document.getElementById('markerSymbol')?.value ?? 'circle',
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
 * Marker sizes for a size-by series (Phase 14 mapping; shared by scatter and
 * parity since Phase 16). Two laws:
 *   'area'     — marker AREA is linear in the value, so diameter ∝ √v. The
 *                honest default: radius/diameter-proportional mapping
 *                exaggerates large values quadratically (DS ruling, §20).
 *   'diameter' — marker DIAMETER is linear in the value (the user opts in;
 *                the renderer warns that it exaggerates).
 * dMin/dMax are the px diameter endpoints (default 4 → 28). Non-finite values
 * get dMin; all-equal values get the midpoint (dMin+dMax)/2.
 *
 * Defaults reproduce the pre-Phase-19 output exactly (dMin=4, dMax=28, area).
 * @param {number[]} values
 * @param {{law?:'area'|'diameter', dMin?:number, dMax?:number}} [opts]
 * @returns {number[]} px diameters, aligned to values
 */
function areaSizes(values, opts = {}) {
  const law = opts.law === 'diameter' ? 'diameter' : 'area';
  const dMin = Number.isFinite(opts.dMin) ? opts.dMin : 4;
  const dMax = Number.isFinite(opts.dMax) ? opts.dMax : 28;
  const dMin2 = dMin * dMin, dMax2 = dMax * dMax; // area endpoints
  let mn = Infinity, mx = -Infinity;
  for (const v of values) if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return values.map(v => {
    if (!Number.isFinite(v) || mx === mn) return (mx === mn && Number.isFinite(v)) ? (dMin + dMax) / 2 : dMin;
    const f = (v - mn) / (mx - mn);
    return law === 'diameter' ? dMin + f * (dMax - dMin) : Math.sqrt(dMin2 + f * (dMax2 - dMin2));
  });
}

/**
 * Partition indices by the distinct values in an aligned array, preserving
 * first-seen order and assigning each a palette color. The discrete-legend
 * color-by path (scatter + parity, Phase 16) builds one trace per group —
 * replacing the old continuous-colorbar-over-palette-indices rendering,
 * which read as a numeric ramp for categories. Parity passes values already
 * aligned to its joined/finite pairs; scatter passes a row column.
 * @param {Array} values
 * @returns {{ cat: string, idx: number[], color: string }[]}
 */
function categoryGroupsFromValues(values) {
  const order = [];
  const map = new Map();
  values.forEach((v, i) => {
    const c = String(v ?? '(blank)');
    if (!map.has(c)) { map.set(c, []); order.push(c); }
    map.get(c).push(i);
  });
  return order.map((c, gi) => ({ cat: c, idx: map.get(c), color: PALETTE[gi % PALETTE.length] }));
}

function categoryGroups(rows, col) {
  return categoryGroupsFromValues(rows.map(r => r[col]));
}

/**
 * Legend-only "size key" traces for a bubble (size-by) series — Plotly has
 * no native size legend (Phase 16). Swatches at evenly-spaced quantiles of
 * the size column (count=3 → min/median/max, the default; DS: median is the
 * robust center, true min/max the endpoints). Marker sizes go through the
 * SAME areaSizes(opts) mapping as the data so the key never lies about the
 * bubbles (the load-bearing coupling — §12/§20); grey so it reads as size,
 * not a data color. Plotted at (null, null) so they add no points to the axes.
 * @param {number[]} values - finite-or-NaN size values (post pairing/filter)
 * @param {string}   col    - size column name (default legend title)
 * @param {string}   group  - unique legendgroup id (per series)
 * @param {{law?:string, dMin?:number, dMax?:number, label?:string,
 *          count?:number, separate?:boolean}} [opts] - law/dMin/dMax MUST match
 *          the data call; label overrides the title; count sets swatch count;
 *          separate routes the key to a second legend (legend2).
 * @returns {object[]}
 */
function sizeKeyTraces(values, col, group, opts = {}) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return [];
  const sorted = [...finite].sort((a, b) => a - b);
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  if (lo === hi) return []; // all values equal — no meaningful range to key
  const n = Math.max(2, Math.round(Number.isFinite(opts.count) ? opts.count : 3));
  // Evenly-spaced quantiles (n=3 → 0, 0.5, 1 = min/median/max, today's set).
  // Dedupe: adjacent quantiles can coincide on small/skewed data.
  const reps = [...new Set(Array.from({ length: n }, (_, i) => quantile(sorted, i / (n - 1))))];
  const px = areaSizes(reps, opts); // same opts → swatch sizes match the bubbles
  const title = opts.label || `Size: ${col}`;
  const f = v => Number(v).toPrecision(3);
  return reps.map((v, i) => ({
    type: 'scatter', mode: 'markers', x: [null], y: [null],
    name: f(v),
    marker: { size: px[i], color: '#9e9e9e', line: { width: 0.5, color: '#666' } },
    legendgroup: group, showlegend: true, hoverinfo: 'skip',
    ...(opts.separate ? { legend: 'legend2' } : {}),
    ...(i === 0 ? { legendgrouptitle: { text: title } } : {}),
  }));
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
