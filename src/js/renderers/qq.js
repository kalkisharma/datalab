// qq.js — normal quantile-quantile (Q–Q) plot renderer (Phase 19)
//
// Assesses whether a numeric column is normally distributed: the sorted sample
// values (Y) against the theoretical standard-normal quantiles (X) they would
// have if normal. Points near the reference line ⇒ consistent with normality;
// systematic curvature (S-shape = heavy/light tails, bend = skew) ⇒ departure.
// A VISUAL diagnostic, not a formal normality test — no p-value (§20).
//
// Numerics (Data Scientist, §20):
//   - Plotting positions: Blom (i − 3/8)/(n + 1/4) — the best simple estimate
//     of E[order statistic], and strictly inside (0,1) so probit never hits a
//     boundary. (Differs from R's a=3/8 (n≤10) / a=1/2 (n>10) switch by design —
//     one convention, no discontinuity.)
//   - Theoretical axis: STANDARDIZED normal quantiles z = Φ⁻¹(p) (normalInv).
//     The axis stays honest z; the reference line carries the location/scale.
//   - Reference line: through the QUARTILES (robust) — a mean±sd line would be
//     bent by the very departures the plot exists to reveal. Sample quartiles
//     use the existing quantile() (no second convention).
//
// Log scale: none — quantiles are signed (z is negative below the median), so a
// log axis is meaningless; warns if a plot log toggle is on.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @param {object}  [ctx] - { xLog, yLog } plot context (only used to warn)
 * @returns {{ traces: object[], error: string|null, warning?: string|null,
 *            layout?: object, fitAnnot?: {sr:string} }}
 */
function buildQQTrace(series, datasets, ctx) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const col = series.xCol;
  if (!col) return { traces: [], error: 'Select a numeric column for the Q–Q plot.' };
  if (classifyColumn(ds.rows, col) !== 'numeric') {
    return { traces: [], error: `Column "${col}" is not numeric — a Q–Q plot needs numeric data.` };
  }

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  const sorted = colVals(rows, col).filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 3) return { traces: [], error: 'A Q–Q plot needs at least 3 finite values.' };

  // Blom plotting positions → standardized-normal theoretical quantiles.
  const theo = new Array(n);
  for (let i = 0; i < n; i++) theo[i] = normalInv((i + 1 - 0.375) / (n + 0.25));

  // Robust reference line through the (theoretical, sample) quartile pairs.
  const q1s = quantile(sorted, 0.25), q3s = quantile(sorted, 0.75);
  const q1t = normalInv(0.25), q3t = normalInv(0.75); // ∓0.6744897502
  const slope = (q3s - q1s) / (q3t - q1t);
  const intercept = q1s - slope * q1t;
  const xLo = theo[0], xHi = theo[n - 1];

  const color = series.style?.color ?? ds.color ?? PALETTE[0];
  const marker = buildMarkerStyle(series.style);
  const traces = [
    {
      type: 'scatter', mode: 'markers', x: theo, y: sorted,
      name: series.legendLabel || series.name || col,
      marker, hovertemplate: 'z=%{x:.3f}<br>value=%{y}<extra></extra>',
    },
    {
      type: 'scatter', mode: 'lines',
      x: [xLo, xHi], y: [slope * xLo + intercept, slope * xHi + intercept],
      name: 'Normal (quartile) reference',
      line: { color: '#d55e00', width: 2, dash: 'dash' },
      hoverinfo: 'skip', showlegend: false,
    },
  ];

  // Correlation of the Q–Q points: near 1 = straight (consistent with normal),
  // lower = curved. Reported, never claimed as a test statistic (§20).
  const r = pearsonR(theo, sorted);
  const verdict = r >= 0.99 ? 'close to the line (consistent with normal)'
    : r >= 0.97 ? 'mild departure from the line'
    : 'clear departure from the line (non-normal)';
  const f = v => Number(v).toPrecision(4);

  const warning = (ctx && (ctx.xLog || ctx.yLog))
    ? 'Q–Q axes are signed quantiles — a log scale is meaningless here and is ignored.' : null;

  return {
    traces, error: null, warning,
    layout: {
      xaxis: { title: { text: 'Theoretical quantiles' } },
      yaxis: { title: { text: 'Sample quantiles' } },
    },
    fitAnnot: { sr: `Q–Q plot of ${col}: n=${n}, straight-line correlation r=${f(r)} — ${verdict}. Visual diagnostic, not a formal normality test.` },
  };
}
