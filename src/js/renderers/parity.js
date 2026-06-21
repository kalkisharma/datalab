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

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X (observed) and Y (modelled) columns are required.', layout: null };

  // Parity compares an observed vs a modelled value. Two modes (Stab A):
  //   • Cross-dataset: X from this dataset, Y from a JOIN dataset, matched on a
  //     key — for observed and predicted living in separate files.
  //   • Same-dataset (no join): X and Y are two columns of THIS dataset — the
  //     common case. Both sides are the same filtered rows, so pairs are
  //     row-aligned by construction.
  let rowsA, rowsB;
  if (series.joinDatasetId) {
    const joinDs = datasets.find(d => d.id === series.joinDatasetId);
    if (!joinDs) return { traces: [], error: 'Join dataset not found. Select a second dataset, or clear the join for a same-dataset parity.', layout: null };
    if (!series.joinKey) return { traces: [], error: 'Join key column is required for a cross-dataset parity.', layout: null };
    // Inner join on the key
    const { mA, mB } = innerJoinRows(ds.rows, joinDs.rows, series.joinKey);
    if (!mA.length) return { traces: [], error: 'No rows matched on the join key. Check key column values.', layout: null };
    rowsA = applyFilters(mA, series.filters || [], series.filterLogic || 'and');
    rowsB = applyFilters(mB, series.filters || [], series.filterLogic || 'and');
  } else {
    rowsA = rowsB = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  }
  if (!rowsA.length) return { traces: [], error: 'No rows pass the active filters.', layout: null };

  // Pairs must be filtered TOGETHER — independent filtering would misalign
  // x/y pairings after any row where only one side is non-finite, silently
  // corrupting the stats. (Data Scientist blocks-phase finding, Phase 1.)
  const xRaw = colVals(rowsA, series.xCol);
  const yRaw = colVals(rowsB, series.yCol);
  // Color/size come from the OBSERVED dataset (rowsA) and are threaded
  // through the SAME finite-pair filter as x/y so they stay point-aligned
  // (Phase 16). Misalignment here is the Phase 1 pairing bug reborn — the
  // mandatory alignment test guards it.
  const colorObs = series.colorCol ? rowsA.map(r => r[series.colorCol]) : null;
  const sizeObs  = series.sizeCol  ? colVals(rowsA, series.sizeCol)     : null;
  const xs = [], ys = [], catV = [], szV = [];
  for (let i = 0; i < Math.min(xRaw.length, yRaw.length); i++) {
    if (Number.isFinite(xRaw[i]) && Number.isFinite(yRaw[i])) {
      xs.push(xRaw[i]); ys.push(yRaw[i]);
      if (colorObs) catV.push(colorObs[i]);
      if (sizeObs)  szV.push(sizeObs[i]);
    }
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

  // Color-by (Phase 16): numeric → colorscale + labeled colorbar; categorical
  // → one trace per category; else solid. Size-by reuses the shared area
  // mapping. Both encodings are decided before slicing so the marker base
  // (edge/opacity) is shared. Numeric-ness mirrors colorMapping (>50% finite).
  // Same-column self-comparison guard (Stab A follow-up): in same-dataset mode
  // nothing stops X and Y being the same column — that yields a perfect y=x
  // line with NSE=1 by construction, which looks like a flawless model but is
  // meaningless. Warn rather than block (§20 honesty); the plot is still valid.
  let warning = (!series.joinDatasetId && series.xCol === series.yCol)
    ? `X and Y are the same column ("${series.xCol}") — every point lies on y = x and NSE = 1 by construction. Pick a different modelled column for a meaningful comparison.`
    : null;
  let colorMode = 'solid';
  if (series.colorCol) {
    const finiteFrac = catV.filter(v => Number.isFinite(Number(v))).length / (catV.length || 1);
    colorMode = finiteFrac > 0.5 ? 'numeric' : 'categorical';
  }
  const marker = buildMarkerStyle(series.style, colorMode === 'numeric' ? catV.map(Number) : undefined);
  if (colorMode !== 'numeric') marker.color = series.style?.color ?? (ds.color ?? '#5b8dee');
  if (colorMode === 'numeric') marker.colorbar = { title: { text: series.colorbarLabel || series.colorCol } };
  let sizeNote = '', sizeOpts = null;
  if (sizeObs) {
    sizeOpts = { law: series.sizeLaw, dMin: series.sizeMin, dMax: series.sizeMax };
    marker.size = areaSizes(szV, sizeOpts);
    sizeNote = ` (size: ${series.sizeCol})`;
    if (series.sizeLaw === 'diameter') {
      const dWarn = 'Diameter-proportional sizing exaggerates large values — a 2× value reads as ~4× the area; area-proportional is the honest default.';
      warning = warning ? `${warning} ${dWarn}` : dWarn;
    }
  }

  const baseName = series.legendLabel || (series.name || 'Parity'); // legendLabel overrides (Phase 16)
  const hover = `${series.xCol}: %{x:.4g}<br>${series.yCol}: %{y:.4g}`
    + (sizeObs ? `<br>${series.sizeCol}: %{customdata}` : '') + '<extra></extra>';

  const traces = [];

  // Scatter trace(s) — one per category when color-by is categorical
  if (colorMode === 'categorical') {
    const groups = categoryGroupsFromValues(catV);
    if (groups.length > PALETTE.length) {
      const repeatMsg = `"${series.colorCol}" has ${groups.length} categories — only ${PALETTE.length} palette colors, so colors repeat.`;
      warning = warning ? `${warning} ${repeatMsg}` : repeatMsg;
    }
    groups.forEach((g, gi) => {
      const gm = { ...marker, color: g.color };
      if (Array.isArray(marker.size)) gm.size = g.idx.map(i => marker.size[i]);
      const tr = {
        type: 'scatter', mode: 'markers',
        x: g.idx.map(i => xs[i]), y: g.idx.map(i => ys[i]),
        name: g.cat, marker: gm, legendgroup: series.id, hovertemplate: hover,
      };
      if (gi === 0) tr.legendgrouptitle = { text: baseName };
      if (sizeObs) tr.customdata = g.idx.map(i => szV[i]);
      traces.push(tr);
    });
  } else {
    const tr = {
      type: 'scatter', mode: 'markers',
      x: xs, y: ys, name: baseName, marker, hovertemplate: hover,
    };
    if (sizeObs) tr.customdata = szV;
    traces.push(tr);
  }
  // Size key (Phase 16): legend swatches matching the bubble mapping. Phase 19:
  // optional hide, custom label/count, and routing to a separate legend.
  if (sizeObs && !series.sizeKeyHide) {
    traces.push(...sizeKeyTraces(szV, series.sizeCol, '__size_' + series.id,
      { ...sizeOpts, label: series.sizeKeyLabel, count: series.sizeKeyCount, separate: series.sizeKeySeparate }));
  }

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

  // dataMin/dataMax are the unpadded extremes — log-log panels re-derive
  // their range from these (linear padding can push axMin negative even
  // for all-positive data; Phase 9 log axes)
  return { traces, error: null, warning, layout, stats, annotSR, axMin, axMax, dataMin: mn, dataMax: mx, n };
}

function fmt(v) { return isNaN(v) ? 'N/A' : Number(v).toPrecision(4); }

function computeParityStats(xs, ys) {
  // NSE = 1 - SS_res / SS_tot, SS_tot around mean of OBSERVED (xs) — the
  // standard Nash-Sutcliffe denominator. Phase 8 correction: this previously
  // used mean(modelled), deviating from the definition above; the pinned
  // reference values were re-derived from the formula, not the code
  // (STANDARDS §20 reference-value rule).
  const n   = xs.length;
  const mX  = xs.reduce((a, b) => a + b, 0) / n;
  const ssT = xs.reduce((s, x) => s + (x - mX) ** 2, 0);
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
