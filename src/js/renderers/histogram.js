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

  const traces = [{
    type: 'histogram',
    x: xV,
    nbinsx: bins,
    name: series.name || 'Histogram',
    marker: { color: series.style?.color ?? (ds.color ?? '#5b8dee') },
    opacity: series.style?.opacity
      ?? (Number(document.getElementById('markerOpacity')?.value ?? 80) / 100),
    hovertemplate: `${series.xCol}: %{x}<br>count: %{y}<extra></extra>`,
  }];

  // Normal fit overlay (Phase 5, Data Scientist spec): the pdf is scaled by
  // n·binWidth so the curve lives on the COUNT axis the bars use — plotting
  // the raw density against counts is the classic scaling mistake.
  let fitAnnot = null;
  if (series.fitNormal) {
    const fit = fitNormal(xV);
    if (fit && fit.sigma > 0) {
      const lo = Math.min(...xV), hi = Math.max(...xV);
      const binWidth = (hi - lo) / bins;
      const cx = [], cy = [];
      for (let i = 0; i <= 200; i++) {
        const x = lo + (hi - lo) * i / 200;
        cx.push(x);
        cy.push(normalPdf(x, fit.mu, fit.sigma) * fit.n * binWidth);
      }
      const f = v => Number(v).toPrecision(4);
      traces.push({
        type: 'scatter', mode: 'lines',
        x: cx, y: cy,
        name: `Normal fit (μ=${f(fit.mu)}, σ=${f(fit.sigma)})`,
        line: { color: '#d55e00', width: 2 },
        hoverinfo: 'skip',
      });
      fitAnnot = {
        // Series name is user data — caller inserts text into a Plotly
        // annotation (restricted pseudo-HTML) → escHtml at build site (chart.js)
        sr: `${series.name} normal fit: mu=${f(fit.mu)}, sigma=${f(fit.sigma)}, n=${fit.n}`,
      };
    }
  }

  return { traces, error: null, fitAnnot };
}
