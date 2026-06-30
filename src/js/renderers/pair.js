// pair.js — pair plot / scatterplot matrix (SPLOM) renderer  [WHOLE-PLOT type]
//
// A SPLOM scatters every selected numeric column against every other. Unlike
// the single-axis-pair renderers, `pair` is a WHOLE-PLOT chart type: the
// returned `layout` owns the entire figure (its own N×N axis grid), and the
// dispatcher routes it through renderPairPlot() in chart.js BEFORE the per-cell
// series loop (see the §7 carve-out in shared.js). A pair plot cannot share a
// plot with other series or a subplot grid (blocked at save, degraded+warned
// at render for hand-edited sessions).
//
// Honesty (§20):
//   - No correlation r is shown — the scatter is the honest primitive; the
//     Data Tools correlation heatmap is the project's r surface.
//   - Cells use pairwise-complete points, so different cells can have different
//     n; this is disclosed in a warning when any selected column has gaps.
//   - The diagonal is BLANK (Plotly's splom cannot draw a histogram there — its
//     shared data-range axis is not a count axis); each variable is labeled on
//     the matrix edge via its dimension label.
//
// Color-by is CATEGORICAL (one splom trace per group, palette color) — the
// canonical pairplot "hue". Numeric color-by is intentionally deferred (a ramp
// across many small cells reads as decorative).
//
// Column cap: >8 selected columns warns (N² cells get unreadable); >12 is
// blocked at save and capped+warned at render (the hand-edited-session backstop).
//
// Log scale guidance: SPLOM axes are linear; per-axis log isn't exposed (the
// matrix shares one type per column/row, and the global Log toggles don't map).

const PAIR_SOFT_CAP = 8;
const PAIR_HARD_CAP = 12;

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

  // Extract once; reused for the completeness check and every group subset.
  const colData = {};
  for (const c of cols) colData[c] = colVals(rows, c);

  // Pairwise-complete disclosure (§20): each off-diagonal cell drops rows
  // non-finite in EITHER of its two columns, so n can differ per cell. Surface
  // the gap between fully-complete rows and total when any column has missing
  // values (mirrors pearsonMatrix's documented pairwise-deletion hazard).
  let complete = 0;
  for (let i = 0; i < rows.length; i++) {
    if (cols.every(c => Number.isFinite(colData[c][i]))) complete++;
  }
  if (complete < rows.length) {
    notes.push(`Cells use pairwise-complete points: ${complete} of ${rows.length} rows are complete on all ${cols.length} columns, so n varies per cell.`);
  }

  // Marker: line width 0 keeps splom on the regl/WebGL fast path; size/opacity
  // follow the global Style panel + per-series overrides.
  const mSize = series.style?.markerSize ?? Number(document.getElementById('markerSize')?.value ?? 6);
  const mOpac = series.style?.opacity ?? (Number(document.getElementById('markerOpacity')?.value ?? 80) / 100);
  const baseTrace = {
    type: 'splom',
    diagonal: { visible: false },      // §20: no native histogram; blank, edge-labeled diagonal
    showupperhalf: true, showlowerhalf: true,
    marker: { size: mSize, opacity: mOpac, line: { width: 0 } },
  };

  let traces;
  const hue = series.colorCol;
  if (hue && ds.headers.includes(hue)) {
    // Categorical hue: one splom trace per group (the canonical pairplot use),
    // reusing the shared per-group palette + (blank)-group handling.
    const groups = categoryGroupsFromValues(rows.map(r => r[hue]));
    if (groups.length > PALETTE.length) {
      notes.push(`${groups.length} groups exceed the ${PALETTE.length}-color palette — colors repeat.`);
    }
    traces = groups.map(g => ({
      ...baseTrace,
      name: g.cat,
      legendgroup: g.cat,
      showlegend: true,
      dimensions: cols.map(c => ({ label: c, values: g.idx.map(i => colData[c][i]) })),
      marker: { ...baseTrace.marker, color: g.color },
    }));
  } else {
    traces = [{
      ...baseTrace,
      name: series.name || 'Pair plot',
      showlegend: false,                 // a lone splom legend entry is noise
      dimensions: cols.map(c => ({ label: c, values: colData[c] })),
      marker: { ...baseTrace.marker, color: series.style?.color ?? ds.color ?? PALETTE[0] },
    }];
  }

  // Whole-plot layout: splom auto-builds the N×N grid from the dimensions; we
  // supply themed axis objects 1..N so grid/ticks/labels match the app theme
  // (chart.js merges this WHOLESALE, not through the per-cell remap). Variable
  // names come from the dimension labels on the matrix edges.
  const th = plotTheme();
  const iv = (id, d) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : d; };
  const showMaj = document.getElementById('majorGrid')?.checked ?? true;
  const fsTk = iv('fsTick', 10), fsA = iv('fsAxis', 12);
  const axisStyle = {
    showgrid: showMaj, gridcolor: showMaj ? th.grid : 'rgba(0,0,0,0)',
    zeroline: false, linecolor: th.axis, linewidth: 1, mirror: true,
    tickfont: { family: 'JetBrains Mono,monospace', size: fsTk, color: th.tick },
    tickcolor: th.axis,
    title: { font: { size: fsA, color: th.axisTitle } },
  };
  const layout = {};
  for (let i = 1; i <= cols.length; i++) {
    const sfx = i === 1 ? '' : String(i);
    layout['xaxis' + sfx] = JSON.parse(JSON.stringify(axisStyle));
    layout['yaxis' + sfx] = JSON.parse(JSON.stringify(axisStyle));
  }

  return { traces, layout, error: null, warning: notes.length ? notes.join(' ') : null };
}
