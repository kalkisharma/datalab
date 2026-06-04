// scatter.js — scatter plot renderer
//
// Log scale guidance: linear by default. Log scale appropriate when data
// spans multiple orders of magnitude (>3 decades). Offer via axis range UI.
// Data Scientist: reviewed and approved for Phase 1.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null }}
 */
function buildScatterTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || []);
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X and Y columns are required.' };

  const xV = colVals(rows, series.xCol);
  const yV = colVals(rows, series.yCol);

  let markerColor;
  if (series.colorCol) {
    const { colorVals } = colorMapping(rows, series.colorCol);
    markerColor = colorVals;
  }

  const marker = buildMarkerStyle(series.style, series.colorCol ? markerColor : undefined);
  if (!series.colorCol) marker.color = series.style?.color ?? (ds.color ?? '#5b8dee');

  return {
    traces: [{
      type: 'scatter',
      mode: 'markers',
      x: xV,
      y: yV,
      name: series.name || 'Scatter',
      marker,
      hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<extra></extra>`,
    }],
    error: null,
  };
}
