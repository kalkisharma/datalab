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

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X and Y columns are required.' };

  let xV, yV;
  if (classifyColumn(ds.rows, series.xCol) === 'datetime') {
    const dt = datetimeXY(ds, rows, series.xCol, series.yCol);
    if (dt.error) return { traces: [], error: dt.error };
    ({ xV, yV } = dt);
  } else {
    // Memoized extraction only valid on the unfiltered dataset rows
    const unfiltered = rows === ds.rows;
    xV = unfiltered ? colValsCached(ds, series.xCol) : colVals(rows, series.xCol);
    yV = unfiltered ? colValsCached(ds, series.yCol) : colVals(rows, series.yCol);
  }

  let markerColor;
  if (series.colorCol) {
    const { colorVals } = colorMapping(rows, series.colorCol);
    markerColor = colorVals;
  }

  const marker = buildMarkerStyle(series.style, series.colorCol ? markerColor : undefined);
  if (!series.colorCol) marker.color = series.style?.color ?? (ds.color ?? '#5b8dee');

  return {
    traces: [{
      // WebGL above 10k points — SVG scatter at 50k×10 series measured 9.3s
      // cold render vs the 5s Phase 3 gate (CSP worker-src blob: permits
      // Plotly's GL workers). Below the threshold SVG keeps crisper markers.
      type: rows.length > 10000 ? 'scattergl' : 'scatter',
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
