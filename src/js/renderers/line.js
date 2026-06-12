// line.js — line chart renderer
//
// Log scale guidance: same as scatter — linear by default, log when data
// spans multiple orders of magnitude. Datetime X-axis supported in Phase 3.
// Data Scientist: reviewed and approved for Phase 1.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null }}
 */
function buildLineTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X and Y columns are required.' };

  let xV, yV, eV = null;
  if (classifyColumn(ds.rows, series.xCol) === 'datetime') {
    const dt = datetimeXY(ds, rows, series.xCol, series.yCol, series.errCol);
    if (dt.error) return { traces: [], error: dt.error };
    // Lines must be drawn in time order or they zigzag back through time
    const order = dt.xV.map((_, i) => i).sort((a, b) => dt.xV[a] < dt.xV[b] ? -1 : 1);
    xV = order.map(i => dt.xV[i]);
    yV = order.map(i => dt.yV[i]);
    if (dt.eV) eV = order.map(i => dt.eV[i]); // errors follow the time sort
  } else {
    // Memoized extraction only valid on the unfiltered dataset rows
    const unfiltered = rows === ds.rows;
    xV = unfiltered ? colValsCached(ds, series.xCol) : colVals(rows, series.xCol);
    yV = unfiltered ? colValsCached(ds, series.yCol) : colVals(rows, series.yCol);
    if (series.errCol) eV = colVals(rows, series.errCol); // row-aligned with x/y
  }

  const color = series.style?.color ?? (ds.color ?? '#5b8dee');
  const lineWidth = series.style?.lineWidth ?? 2;

  const trace = {
    type: 'scatter',
    mode: 'lines+markers',
    x: xV,
    y: yV,
    // Error bars: name carries "± column" — semantics always visible (§20).
    // legendLabel (Phase 16) overrides the auto label incl. the suffix.
    name: series.legendLabel || ((series.name || 'Line') + (series.errCol ? ` (± ${series.errCol})` : '')),
    line: { color, width: lineWidth },
    marker: { color, size: 4 },
    hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<extra></extra>`,
  };
  if (eV) trace.error_y = errorBarsFromCol(eV);

  return { traces: [trace], error: null };
}
