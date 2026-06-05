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

  const isDatetime = classifyColumn(ds.rows, series.xCol) === 'datetime';
  let xV, yV, eV = null;
  if (isDatetime) {
    const dt = datetimeXY(ds, rows, series.xCol, series.yCol, series.errCol);
    if (dt.error) return { traces: [], error: dt.error };
    ({ xV, yV, eV } = dt);
  } else {
    // Memoized extraction only valid on the unfiltered dataset rows
    const unfiltered = rows === ds.rows;
    xV = unfiltered ? colValsCached(ds, series.xCol) : colVals(rows, series.xCol);
    yV = unfiltered ? colValsCached(ds, series.yCol) : colVals(rows, series.yCol);
    if (series.errCol) eV = colVals(rows, series.errCol); // row-aligned with x/y
  }

  let markerColor;
  if (series.colorCol) {
    const { colorVals } = colorMapping(rows, series.colorCol);
    markerColor = colorVals;
  }

  const marker = buildMarkerStyle(series.style, series.colorCol ? markerColor : undefined);
  if (!series.colorCol) marker.color = series.style?.color ?? (ds.color ?? '#5b8dee');

  // Error bars: name carries "± column" — semantics always visible (§20)
  const name = (series.name || 'Scatter') + (series.errCol ? ` (± ${series.errCol})` : '');

  const traces = [{
    // WebGL above 10k points — SVG scatter at 50k×10 series measured 9.3s
    // cold render vs the 5s Phase 3 gate (CSP worker-src blob: permits
    // Plotly's GL workers). Below the threshold SVG keeps crisper markers.
    type: rows.length > 10000 ? 'scattergl' : 'scatter',
    mode: 'markers',
    x: xV,
    y: yV,
    name,
    marker,
    hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<extra></extra>`,
  }];
  if (eV) traces[0].error_y = errorBarsFromCol(eV);

  // Linear trendline (Phase 9): least squares on the finite pairs; the
  // legend entry IS the annotation — equation + R² (linearFit in stats.js)
  let fitAnnot = null;
  let warning  = null;
  if (series.trendline) {
    if (isDatetime) {
      warning = 'Trendline needs a numeric X — not drawn for datetime axes.';
    } else {
      const fx = [], fy = [];
      for (let i = 0; i < xV.length; i++) {
        if (Number.isFinite(xV[i]) && Number.isFinite(yV[i])) { fx.push(xV[i]); fy.push(yV[i]); }
      }
      const fit = linearFit(fx, fy);
      if (!fit) {
        warning = 'Trendline needs at least 2 points with varying X.';
      } else {
        const f = v => Number(v).toPrecision(4);
        const lo = Math.min(...fx), hi = Math.max(...fx);
        traces.push({
          type: 'scatter', mode: 'lines',
          x: [lo, hi], y: [fit.a * lo + fit.b, fit.a * hi + fit.b],
          name: `Fit: y = ${f(fit.a)}x ${fit.b < 0 ? '−' : '+'} ${f(Math.abs(fit.b))} (R² = ${f(fit.r2)})`,
          line: { color: '#d55e00', width: 2, dash: 'dash' },
          hoverinfo: 'skip',
        });
        fitAnnot = {
          // Series name is user data — escHtml applied at the sr-only sink
          sr: `${series.name} linear fit: slope=${f(fit.a)}, intercept=${f(fit.b)}, R2=${f(fit.r2)}, n=${fit.n}`,
        };
      }
    }
  }

  return { traces, error: null, warning, fitAnnot };
}
