// pair.js — pair plot / scatterplot matrix (SPLOM) renderer  [WHOLE-PLOT type]
//
// A SPLOM scatters every selected numeric column against every other in an N×N
// matrix, with each column's marginal HISTOGRAM on the diagonal. Unlike the
// single-axis-pair renderers, `pair` is a WHOLE-PLOT chart type: the returned
// `layout` owns the entire figure (its own N×N axis grid), and the dispatcher
// routes it through renderPairPlot() in chart.js BEFORE the per-cell series loop
// (see the §7 carve-out in shared.js). A pair plot cannot share a plot with
// other series or a subplot grid (blocked at save, degraded+warned at render).
//
// RENDERING (v2.25.0): built from plain SVG `scatter` (off-diagonal) + SVG
// `histogram` (diagonal) traces on an N×N `layout.grid`, NOT a single Plotly
// `splom` trace. The splom trace is regl/WebGL-only and dead-ended ("WebGL is
// not supported") on browsers with hardware acceleration off / GPU blocklisted
// / in VMs+RDP — where every other (SVG) DataLab chart renders fine. The SVG
// grid works everywhere, fixes the degraded SVG export, and gives us the
// histogram diagonal the splom could not draw (its shared data-range axis is
// not a count axis). The one splom affordance lost is built-in linked brushing,
// which DataLab's static-export model doesn't use.
//
// Honesty (§20):
//   - No correlation r is shown — the scatter is the honest primitive; the Data
//     Tools correlation heatmap is the project's r surface.
//   - Off-diagonal cells use pairwise-complete points, so different cells can
//     have different n; disclosed in a warning when any column has gaps.
//   - Diagonal histograms use the same Freedman-Diaconis bin-COUNT rule
//     (fdBinCount) as the histogram chart type. (The count is passed as nbinsx,
//     so Plotly may still snap edges; the histogram chart type additionally
//     pins exact edges — the bin RULE matches, the rendered edges can differ.)
//
// Color-by is CATEGORICAL (one trace per group per cell, palette color) — the
// canonical pairplot "hue"; diagonal histograms overlay per group. Numeric
// color-by is intentionally deferred.
//
// Column cap: >8 selected columns warns (N² cells get unreadable); >12 is
// blocked at save and capped+warned at render. Large row counts × cells warn
// (SVG points are heavier than the old GL path).
//
// Log scale guidance: SPLOM axes are linear; per-axis log isn't exposed.

const PAIR_SOFT_CAP = 8;
const PAIR_HARD_CAP = 12;
const PAIR_POINT_BUDGET = 40000; // scatter points across all cells before a slowdown warning

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, warning?: string|null, layout?: object }}
 */
function buildPairTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const notes = [];
  const numericOf = c => classifyColumn(ds.rows, c) === 'numeric';

  // Resolve columns: explicit pairCols (drop any now missing / non-numeric —
  // a SPLOM over the survivors is still valid and honest), else all numeric.
  let cols;
  if (Array.isArray(series.pairCols) && series.pairCols.length) {
    const present = series.pairCols.filter(c => ds.headers.includes(c) && numericOf(c));
    const dropped = series.pairCols.length - present.length;
    if (dropped) notes.push(`${dropped} selected column${dropped > 1 ? 's are' : ' is'} no longer available — showing ${present.length}.`);
    cols = present;
  } else {
    cols = ds.headers.filter(numericOf);
  }

  if (cols.length < 2) {
    return { traces: [], error: 'A pair plot needs at least 2 numeric columns — select more columns (or check the dataset has numeric data).' };
  }
  // Render-time backstop for the hard cap (the modal blocks >cap at save).
  if (cols.length > PAIR_HARD_CAP) {
    notes.push(`Showing the first ${PAIR_HARD_CAP} of ${cols.length} columns — beyond that the matrix is unreadable.`);
    cols = cols.slice(0, PAIR_HARD_CAP);
  } else if (cols.length > PAIR_SOFT_CAP) {
    notes.push(`${cols.length} columns = ${cols.length * cols.length} cells — a lot to read at once; consider fewer.`);
  }

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  const N = cols.length;
  // Extract once; reused for the completeness check and every cell/group subset.
  const colData = {};
  for (const c of cols) colData[c] = colVals(rows, c);

  // Pairwise-complete disclosure (§20): each off-diagonal cell drops rows
  // non-finite in EITHER of its two columns, so n can differ per cell. Surface
  // the gap between fully-complete rows and total when any column has gaps.
  let complete = 0;
  for (let i = 0; i < rows.length; i++) {
    if (cols.every(c => Number.isFinite(colData[c][i]))) complete++;
  }
  if (complete < rows.length) {
    notes.push(`Cells use pairwise-complete points: ${complete} of ${rows.length} rows are complete on all ${N} columns, so n varies per cell.`);
  }
  // Point-budget warning (SVG markers are heavier than the old GL path).
  const offDiagCells = N * N - N;
  if (rows.length * offDiagCells > PAIR_POINT_BUDGET) {
    notes.push(`Large matrix (~${(rows.length * offDiagCells / 1000).toFixed(0)}k points) may render slowly — filter rows or use fewer columns.`);
  }

  const mSize = series.style?.markerSize ?? Number(document.getElementById('markerSize')?.value ?? 6);
  const mOpac = series.style?.opacity ?? (Number(document.getElementById('markerOpacity')?.value ?? 80) / 100);

  // Categorical hue: one scatter trace per group per off-diagonal cell + one
  // overlaid histogram per group per diagonal cell (the canonical pairplot
  // "hue"). No hue: one scatter / one histogram per cell.
  const hue = series.colorCol;
  const groups = (hue && ds.headers.includes(hue))
    ? categoryGroupsFromValues(rows.map(r => r[hue]))
    : null;
  if (groups && groups.length > PALETTE.length) {
    notes.push(`${groups.length} groups exceed the ${PALETTE.length}-color palette — colors repeat.`);
  }
  const soloColor = series.style?.color ?? ds.color ?? PALETTE[0];

  const axisNum = (r, c) => (r - 1) * N + c;      // 1-based cell → axis number
  const sfxOf   = k => (k === 1 ? '' : String(k));

  const traces = [];
  let legendShown = false; // one legend entry per group (from the first scatter cell)

  for (let r = 1; r <= N; r++) {
    for (let c = 1; c <= N; c++) {
      const k = axisNum(r, c), sfx = sfxOf(k);
      const ax = 'x' + sfx, ay = 'y' + sfx;
      const colX = cols[c - 1], colY = cols[r - 1];

      if (r === c) {
        // Diagonal: marginal histogram of colX (its values ARE this column/row's variable).
        if (groups) {
          for (const g of groups) {
            const gv = g.idx.map(i => colData[colX][i]).filter(Number.isFinite);
            traces.push({
              type: 'histogram', x: gv, xaxis: ax, yaxis: ay,
              marker: { color: g.color }, opacity: 0.6,
              nbinsx: fdBinCount(gv), legendgroup: g.cat, showlegend: false, hoverinfo: 'x+y',
            });
          }
        } else {
          const dv = colData[colX].filter(Number.isFinite);
          traces.push({
            type: 'histogram', x: dv, xaxis: ax, yaxis: ay,
            marker: { color: soloColor }, nbinsx: fdBinCount(dv), showlegend: false, hoverinfo: 'x+y',
          });
        }
      } else {
        // Off-diagonal: scatter of colX (x) vs colY (y).
        if (groups) {
          const showLegendHere = !legendShown;
          for (const g of groups) {
            const gx = [], gy = [];
            for (const i of g.idx) {
              if (Number.isFinite(colData[colX][i]) && Number.isFinite(colData[colY][i])) {
                gx.push(colData[colX][i]); gy.push(colData[colY][i]);
              }
            }
            traces.push({
              type: 'scatter', mode: 'markers', x: gx, y: gy, xaxis: ax, yaxis: ay,
              name: g.cat, legendgroup: g.cat, showlegend: showLegendHere,
              marker: { size: mSize, opacity: mOpac, color: g.color, line: { width: 0 } },
              hoverinfo: 'x+y',
            });
          }
          legendShown = true;
        } else {
          traces.push({
            type: 'scatter', mode: 'markers', x: colData[colX], y: colData[colY], xaxis: ax, yaxis: ay,
            showlegend: false,
            marker: { size: mSize, opacity: mOpac, color: soloColor, line: { width: 0 } },
            hoverinfo: 'x+y',
          });
        }
      }
    }
  }

  // Whole-plot layout: the N×N grid + one themed axis pair per cell (merged
  // WHOLESALE by chart.js, not through the per-cell remap). Edge labels only:
  // x-title/ticks on the bottom row (the column variable — correct on the
  // bottom-right diagonal too, whose x IS that variable); y-title/ticks on the
  // first column's OFF-diagonal cells (the top-left diagonal's y is a count
  // axis, so it gets no variable label — that variable is named by column 1's
  // bottom x-title instead). This keeps the count axis from being mislabeled.
  const th = plotTheme();
  const iv = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  const showMaj = document.getElementById('majorGrid')?.checked ?? true;
  const fsTk = iv('fsTick', 10), fsA = iv('fsAxis', 12);
  const axisBase = {
    showgrid: showMaj, gridcolor: showMaj ? th.grid : 'rgba(0,0,0,0)',
    zeroline: false, linecolor: th.axis, linewidth: 1, mirror: true, tickcolor: th.axis,
  };
  const layout = { grid: { rows: N, columns: N, pattern: 'independent' } };
  if (groups) layout.barmode = 'overlay';
  for (let r = 1; r <= N; r++) {
    for (let c = 1; c <= N; c++) {
      const sfx = sfxOf(axisNum(r, c));
      const xEdge = (r === N), yEdge = (c === 1 && r !== c);
      layout['xaxis' + sfx] = {
        ...axisBase, showticklabels: xEdge,
        tickfont: { family: 'JetBrains Mono,monospace', size: fsTk, color: th.tick },
        title: xEdge ? { text: cols[c - 1], font: { size: fsA, color: th.axisTitle } } : undefined,
      };
      layout['yaxis' + sfx] = {
        ...axisBase, showticklabels: yEdge,
        tickfont: { family: 'JetBrains Mono,monospace', size: fsTk, color: th.tick },
        title: yEdge ? { text: cols[r - 1], font: { size: fsA, color: th.axisTitle } } : undefined,
      };
    }
  }

  return { traces, layout, error: null, warning: notes.length ? notes.join(' ') : null };
}
