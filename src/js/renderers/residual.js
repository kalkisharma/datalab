// residual.js — residual diagnostic plot renderer (Phase 19)
//
// Residuals (observed − fitted) vs fitted values for a least-squares fit of the
// chosen X/Y and degree (reuses linearFit/polyFit). Its own panel because the
// axes are ŷ/residual, not the source scatter's X/Y — it composes with grids
// and sessions rather than overlaying.
//
// Reading it (Data Scientist guidance, §20):
//   - Random scatter around 0  ⇒ the fit is adequate; constant variance.
//   - A funnel (spread grows with fitted)  ⇒ heteroscedasticity — the standard
//     errors (and any CI/PI bands) are understated.
//   - A curve / U-shape  ⇒ the mean model is wrong (missing curvature) — raise
//     the degree or transform.
// This plot DIAGNOSES; it does not TEST. Residuals are RAW (observed − fitted),
// not standardized — dividing by s would need leverage we don't compute and
// would imply an outlier threshold this tool isn't testing.
//
// Log scale: none — residuals are signed and centered on 0.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, warning?: string|null,
 *            layout?: object, fitAnnot?: {sr:string} }}
 */
function buildResidualTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const { xCol, yCol } = series;
  if (!xCol || !yCol) return { traces: [], error: 'Select X and Y columns for the residual plot.' };
  for (const [c, lbl] of [[xCol, 'X'], [yCol, 'Y']]) {
    if (classifyColumn(ds.rows, c) !== 'numeric') {
      return { traces: [], error: `Column "${c}" is not numeric — the residual plot needs numeric ${lbl}.` };
    }
  }

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  // Finite pairs only — a one-sided NaN drops the whole pair (parity precedent).
  const fx = [], fy = [];
  const xv = colVals(rows, xCol), yv = colVals(rows, yCol);
  for (let i = 0; i < rows.length; i++) {
    if (Number.isFinite(xv[i]) && Number.isFinite(yv[i])) { fx.push(xv[i]); fy.push(yv[i]); }
  }
  const n = fx.length;
  if (n < 2) return { traces: [], error: 'The residual plot needs at least 2 points with finite X and Y.' };

  const degree = Math.min(3, Math.max(1, series.trendDegree || 1));
  let evalFit;
  if (degree === 1) {
    const fit = linearFit(fx, fy);
    if (!fit) return { traces: [], error: 'The residual plot needs at least 2 points with varying X.' };
    evalFit = x => fit.a * x + fit.b;
  } else {
    const fit = polyFit(fx, fy, degree);
    if (!fit) return { traces: [], error: `A degree-${degree} fit needs at least ${degree + 1} points with varying X.` };
    evalFit = x => { let yh = 0, p = 1; for (let k = 0; k <= degree; k++) { yh += fit.coef[k] * p; p *= x; } return yh; };
  }

  const fitted = new Array(n), resid = new Array(n);
  let maxAbs = 0, sse = 0;
  for (let i = 0; i < n; i++) {
    const yh = evalFit(fx[i]);
    fitted[i] = yh; resid[i] = fy[i] - yh;
    maxAbs = Math.max(maxAbs, Math.abs(resid[i]));
    sse += resid[i] * resid[i];
  }
  const [loF, hiF] = extent(fitted); // single-pass min/max (avoids the large-array spread trap)

  const marker = buildMarkerStyle(series.style);
  const traces = [
    {
      type: 'scatter', mode: 'markers', x: fitted, y: resid,
      name: series.legendLabel || series.name || `${yCol} residuals`,
      marker, hovertemplate: 'fitted=%{x}<br>residual=%{y}<extra></extra>',
    },
    {
      type: 'scatter', mode: 'lines', x: [loF, hiF], y: [0, 0],
      name: 'zero', line: { color: '#888', width: 1, dash: 'dash' },
      hoverinfo: 'skip', showlegend: false,
    },
  ];

  const rmse = Math.sqrt(sse / n);
  const shape = maxAbs < 1e-8 ? 'residuals ≈ 0 (near-exact fit)' : 'check for funnel (variance) or curve (wrong degree) patterns';
  const f = v => Number(v).toPrecision(4);

  return {
    traces, error: null,
    layout: {
      xaxis: { title: { text: 'Fitted values' } },
      yaxis: { title: { text: 'Residuals' }, zeroline: true },
    },
    fitAnnot: { sr: `Residual plot of ${yCol} vs ${xCol}, degree ${degree}: n=${n}, RMSE=${f(rmse)} — ${shape}. Diagnoses fit adequacy; not a formal test.` },
  };
}
