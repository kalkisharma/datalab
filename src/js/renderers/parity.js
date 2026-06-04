// parity.js — parity plot renderer (scatter + y=x line + error bands + stats)
//
// Log scale guidance: log scale is appropriate for parity plots when data spans
// multiple orders of magnitude, but the equal-axis requirement still applies.
// Equal axis ranges are ALWAYS explicitly set — never left to Plotly auto-range.
// Data Scientist: NSE/MAE/RMSE formulas reviewed and approved for Phase 1.
//
// NSE (Nash-Sutcliffe Efficiency) = 1 - SS_res/SS_tot where SS_tot is variance
// around mean(observed). NSE=1 is perfect, NSE=0 means model is no better than
// the mean, NSE<0 means the mean is a better predictor than the model.
// This is appropriate for parity (y=x) assessment, not for regression fit (R²).

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, layout: object|null }}
 */
function buildParityTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.', layout: null };

  // Parity requires two datasets joined on a key
  const joinDs = datasets.find(d => d.id === series.joinDatasetId);
  if (!joinDs) return { traces: [], error: 'Join dataset not found. Select a second dataset for parity.', layout: null };

  if (!series.joinKey) return { traces: [], error: 'Join key column is required for parity.', layout: null };
  if (!series.xCol || !series.yCol) return { traces: [], error: 'X (observed) and Y (modelled) columns are required.', layout: null };

  // Inner join on the key
  const { mA, mB } = innerJoinRows(ds.rows, joinDs.rows, series.joinKey);
  if (!mA.length) return { traces: [], error: 'No rows matched on the join key. Check key column values.', layout: null };

  const rowsA = applyFilters(mA, series.filters || []);
  const rowsB = applyFilters(mB, series.filters || []);
  if (!rowsA.length) return { traces: [], error: 'No rows pass the active filters.', layout: null };

  // Pairs must be filtered TOGETHER — independent filtering would misalign
  // x/y pairings after any row where only one side is non-finite, silently
  // corrupting the stats. (Data Scientist blocks-phase finding, Phase 1.)
  const xRaw = colVals(rowsA, series.xCol);
  const yRaw = colVals(rowsB, series.yCol);
  const xs = [], ys = [];
  for (let i = 0; i < Math.min(xRaw.length, yRaw.length); i++) {
    if (Number.isFinite(xRaw[i]) && Number.isFinite(yRaw[i])) { xs.push(xRaw[i]); ys.push(yRaw[i]); }
  }
  const n = xs.length;

  if (!n) return { traces: [], error: 'No finite numeric value pairs found in selected columns.', layout: null };

  // Compute stats
  const stats = computeParityStats(xs, ys);

  // Axis range — equal axes, explicitly set (STANDARDS.md §19 correctness requirement)
  const allV = [...xs, ...ys];
  const mn = Math.min(...allV), mx = Math.max(...allV);
  const pad = (mx - mn) * 0.05;
  const axMin = mn - pad, axMax = mx + pad;

  const color = series.style?.color ?? (ds.color ?? '#5b8dee');
  const marker = buildMarkerStyle(series.style);
  marker.color = color;

  const traces = [];

  // Scatter trace
  traces.push({
    type: 'scatter', mode: 'markers',
    x: xs, y: ys,
    name: series.name || 'Parity',
    marker,
    hovertemplate: `${series.xCol}: %{x:.4g}<br>${series.yCol}: %{y:.4g}<extra></extra>`,
  });

  // y=x parity line
  traces.push({
    type: 'scatter', mode: 'lines',
    x: [axMin, axMax], y: [axMin, axMax],
    name: 'y = x', showlegend: false,
    line: { color: '#888888', width: 1.5, dash: 'dash' },
    hoverinfo: 'skip',
  });

  // Error bands
  if (series.band5)  traces.push(...buildBandTraces(axMin, axMax, 0.05, '±5%'));
  if (series.band10) traces.push(...buildBandTraces(axMin, axMax, 0.10, '±10%'));

  // Layout with equal axis ranges
  const layout = {
    xaxis: { range: [axMin, axMax] },
    yaxis: { range: [axMin, axMax], scaleanchor: 'x', scaleratio: 1, constrain: 'domain' },
  };

  // Build .sr-only annotation text for accessibility
  const annotSR = `Stats: NSE=${fmt(stats.nse)}, MAE=${fmt(stats.mae)}, RMSE=${fmt(stats.rmse)}, N=${n}`;

  return { traces, error: null, layout, stats, annotSR, axMin, axMax, n };
}

function fmt(v) { return isNaN(v) ? 'N/A' : Number(v).toPrecision(4); }

function computeParityStats(xs, ys) {
  // NSE = 1 - SS_res / SS_tot  (SS_tot around mean of observed)
  const n   = xs.length;
  const mY  = ys.reduce((a, b) => a + b, 0) / n;
  const ssT = ys.reduce((s, y) => s + (y - mY) ** 2, 0);
  const ssR = xs.reduce((s, x, i) => s + (ys[i] - x) ** 2, 0);
  const nse  = ssT === 0 ? NaN : 1 - ssR / ssT;
  const rmse = Math.sqrt(ssR / n);
  const mae  = xs.reduce((s, x, i) => s + Math.abs(ys[i] - x), 0) / n;
  return { nse, rmse, mae };
}

function innerJoinRows(rowsA, rowsB, key) {
  const map = new Map();
  for (const r of rowsB) {
    const k = String(r[key] ?? '').trim().toLowerCase();
    if (!map.has(k)) map.set(k, r);
  }
  const mA = [], mB = [], used = new Set();
  for (const r of rowsA) {
    const k = String(r[key] ?? '').trim().toLowerCase();
    if (map.has(k) && !used.has(k)) { mA.push(r); mB.push(map.get(k)); used.add(k); }
  }
  return { mA, mB };
}

function buildBandTraces(mn, mx, pct, name) {
  const props = {
    type: 'scatter', mode: 'lines', hoverinfo: 'skip',
    fill: 'toself', fillcolor: 'rgba(91,141,238,0.06)',
    line: { color: 'rgba(91,141,238,0.25)', width: 1, dash: 'dot' },
    showlegend: true,
  };
  if (mn >= 0) {
    return [{ ...props, name, x:[mn,mx,mx,mn,mn], y:[mn*(1+pct),mx*(1+pct),mx*(1-pct),mn*(1-pct),mn*(1+pct)] }];
  } else if (mx <= 0) {
    return [{ ...props, name, x:[mn,mx,mx,mn,mn], y:[mn*(1-pct),mx*(1-pct),mx*(1+pct),mn*(1+pct),mn*(1-pct)] }];
  } else {
    // Spans zero: two triangles to avoid self-intersecting polygon
    return [
      { ...props, name, showlegend:false, x:[mn,0,mn,mn], y:[mn*(1-pct),0,mn*(1+pct),mn*(1-pct)] },
      { ...props, name, x:[0,mx,mx,0], y:[0,mx*(1+pct),mx*(1-pct),0] },
    ];
  }
}
