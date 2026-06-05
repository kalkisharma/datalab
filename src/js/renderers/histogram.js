// histogram.js — histogram renderer (Freedman-Diaconis bin count, computed at render time)
//
// Log scale guidance: linear count axis by default. A log Y axis is
// appropriate for heavy-tailed distributions where rare bins vanish next to
// the mode; a log X axis only when the variable itself spans decades.
// Data Scientist: FD rule reviewed and approved for Phase 3.
//
// Binning (Data Scientist sign-off): Freedman-Diaconis — bin width
// 2·IQR/n^(1/3) — is the default because it adapts to both spread and
// sample size and resists outliers. Computed on demand at render time from
// the filtered column values; never cached in state (STANDARDS.md §19).
// Falls back to Sturges (log2(n)+1) when IQR is 0 (heavily repeated
// values). User-configurable via series.binCount (blank = FD). Capped at
// 500 bins to keep degenerate column choices renderable.

/**
 * @param {number[]} vals - finite numeric values
 * @returns {number} bin count
 */
function fdBinCount(vals) {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (n < 2) return 1;
  const q = p => {
    const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  const iqr   = q(0.75) - q(0.25);
  const range = v[n - 1] - v[0];
  if (range === 0) return 1;
  if (iqr === 0) return Math.min(500, Math.ceil(Math.log2(n) + 1)); // Sturges fallback
  return Math.max(1, Math.min(500, Math.ceil(range / (2 * iqr / Math.cbrt(n)))));
}

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null }}
 */
function buildHistogramTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol) return { traces: [], error: 'A numeric column is required.' };
  if (classifyColumn(ds.rows, series.xCol) !== 'numeric') {
    return { traces: [], error: `Column "${series.xCol}" is not numeric — histograms need a numeric column.` };
  }

  const xV = colVals(rows, series.xCol).filter(Number.isFinite);
  if (!xV.length) return { traces: [], error: `No finite numeric values in "${series.xCol}".` };

  const bins = (series.binCount && series.binCount > 0)
    ? Math.min(500, series.binCount)
    : fdBinCount(xV);

  // Loop, not Math.min(...xV) — spread overflows the stack on huge columns
  let lo = Infinity, hi = -Infinity;
  for (const v of xV) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const binWidth = (hi - lo) / bins;

  const traces = [{
    type: 'histogram',
    x: xV,
    nbinsx: bins, // requested count, kept for reference — xbins below is authoritative
    name: series.name || 'Histogram',
    marker: { color: series.style?.color ?? (ds.color ?? '#5b8dee') },
    opacity: series.style?.opacity
      ?? (Number(document.getElementById('markerOpacity')?.value ?? 80) / 100),
    hovertemplate: `${series.xCol}: %{x}<br>count: %{y}<extra></extra>`,
  }];

  // Explicit bin edges (Phase 8 fix): nbinsx is only a hint — Plotly snaps
  // to "nice" boundaries, so the actual bin width could differ from the FD
  // width the normal-fit overlay scales by, mis-scaling the curve
  if (binWidth > 0) {
    traces[0].autobinx = false;
    traces[0].xbins = { start: lo, end: hi + binWidth / 1e6, size: binWidth };
  }

  // Distribution fit overlay (Phase 5 normal; Phase 11 picker). The pdf is
  // scaled by n·binWidth so the curve lives on the COUNT axis the bars use —
  // plotting raw density against counts is the classic scaling mistake.
  // For lognormal/Weibull, n is the POSITIVE-value count (the fitted
  // subset), so the curve matches the bars it actually models.
  // Back-compat: fitNormal (Phase 5 boolean) reads as fitDist 'normal'.
  const fitDist = series.fitDist ?? (series.fitNormal ? 'normal' : null);
  let fitAnnot = null;
  let warning  = null;
  const f = v => Number(v).toPrecision(4);
  const curve = (pdf, count, name) => {
    const cx = [], cy = [];
    for (let i = 0; i <= 200; i++) {
      const x = lo + (hi - lo) * i / 200;
      cx.push(x);
      cy.push(pdf(x) * count * binWidth);
    }
    traces.push({
      type: 'scatter', mode: 'lines', x: cx, y: cy, name,
      line: { color: '#d55e00', width: 2 }, hoverinfo: 'skip',
    });
  };

  if (fitDist && binWidth > 0) {
    const nonPos = xV.filter(v => v <= 0).length;
    if (fitDist === 'normal') {
      const fit = fitNormal(xV);
      if (fit && fit.sigma > 0) {
        curve(x => normalPdf(x, fit.mu, fit.sigma), fit.n, `Normal fit (μ=${f(fit.mu)}, σ=${f(fit.sigma)})`);
        fitAnnot = { sr: `${series.name} normal fit: mu=${f(fit.mu)}, sigma=${f(fit.sigma)}, n=${fit.n}` };
      }
    } else if (nonPos === xV.length) {
      warning = `${fitDist} fits need positive data — no positive values in "${series.xCol}".`;
    } else if (fitDist === 'lognormal') {
      const fit = fitLognormal(xV);
      if (fit) {
        curve(x => lognormalPdf(x, fit.mu, fit.sigma), fit.n, `Lognormal fit (μ=${f(fit.mu)}, σ=${f(fit.sigma)})`);
        fitAnnot = { sr: `${series.name} lognormal fit: mu=${f(fit.mu)}, sigma=${f(fit.sigma)}, n=${fit.n}` };
      }
      if (nonPos) warning = `Lognormal fit uses the ${xV.length - nonPos} positive value(s) — ${nonPos} non-positive excluded.`;
    } else if (fitDist === 'weibull') {
      const fit = fitWeibull(xV);
      if (fit) {
        curve(x => weibullPdf(x, fit.k, fit.lambda), fit.n, `Weibull fit (k=${f(fit.k)}, λ=${f(fit.lambda)})`);
        fitAnnot = { sr: `${series.name} Weibull fit: k=${f(fit.k)}, lambda=${f(fit.lambda)}, n=${fit.n}` };
      } else {
        warning = 'Weibull fit did not converge for this data.';
      }
      if (fit && nonPos) warning = `Weibull fit uses the ${xV.length - nonPos} positive value(s) — ${nonPos} non-positive excluded.`;
    }
  }

  // KDE overlay (Phase 11): binned Gaussian KDE, Silverman bandwidth —
  // density scaled to the count axis like the fits
  if (series.kde && binWidth > 0) {
    const kde = kdeBinned(xV, lo, hi, binWidth);
    if (kde) {
      traces.push({
        type: 'scatter', mode: 'lines',
        x: kde.xs, y: kde.ys.map(d => d * xV.length * binWidth),
        name: 'KDE (Silverman)',
        line: { color: '#999999', width: 2, dash: 'dot' },
        hoverinfo: 'skip',
      });
    }
  }

  return { traces, error: null, warning, fitAnnot };
}
