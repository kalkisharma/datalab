// violin.js — violin plot renderer (numeric Y, optional categorical X, max 50 categories)
//
// Log scale guidance: same as boxplot — log Y when category distributions
// span decades; X is categorical, never log.
//
// Distribution shape (Data Scientist sign-off, Phase 11): Plotly's native
// violin trace — KDE-based density outline with the Tukey box and median
// line shown inside (box.visible) so the violin stays comparable to the
// boxplot it complements. Points beyond the whiskers drawn individually,
// matching the boxplot convention.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, warning?: string|null }}
 */
function buildViolinTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.yCol) return { traces: [], error: 'A numeric Y column is required.' };
  if (classifyColumn(ds.rows, series.yCol) !== 'numeric') {
    return { traces: [], error: `Column "${series.yCol}" is not numeric — violin plots need a numeric Y.` };
  }

  const trace = {
    type: 'violin',
    name: series.name || 'Violin',
    marker: { color: series.style?.color ?? (ds.color ?? '#5b8dee') },
    box: { visible: true },       // Tukey box inside, comparable to boxplot
    meanline: { visible: true },
    points: 'outliers',
  };

  let warning = null;

  if (series.xCol) {
    // Grouped: one violin per category; pairs kept together (boxplot rule)
    const xs = [], ys = [];
    for (const r of rows) {
      const y = Number(r[series.yCol]);
      if (!Number.isFinite(y)) continue;
      xs.push(String(r[series.xCol] ?? '(blank)'));
      ys.push(y);
    }
    if (!ys.length) return { traces: [], error: `No finite numeric values in "${series.yCol}".` };
    const nCats = new Set(xs).size;
    if (nCats > BOXPLOT_MAX_CATEGORIES) {
      warning = `"${series.xCol}" has ${nCats} categories — more than ${BOXPLOT_MAX_CATEGORIES} makes violins unreadable. Consider filtering or a different X column.`;
    }
    trace.x = xs;
    trace.y = ys;
  } else {
    const ys = colVals(rows, series.yCol).filter(Number.isFinite);
    if (!ys.length) return { traces: [], error: `No finite numeric values in "${series.yCol}".` };
    trace.y = ys;
  }

  return { traces: [trace], error: null, warning };
}
