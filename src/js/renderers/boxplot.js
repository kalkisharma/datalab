// boxplot.js — box plot renderer (numeric Y, optional categorical X, max 50 categories)
//
// Log scale guidance: log Y is appropriate when category medians span
// decades — otherwise the smallest boxes flatten to lines. X is
// categorical, never log.
//
// Whiskers and outliers (Data Scientist sign-off, Phase 3): Plotly's
// defaults are the Tukey convention — box spans Q1–Q3 (linear-interpolated
// quartiles), whiskers extend to the most extreme points within 1.5·IQR of
// the box, points beyond are drawn individually as outliers
// (boxpoints: 'outliers'). This matches the standard textbook definition;
// no custom whisker math is introduced.

const BOXPLOT_MAX_CATEGORIES = 50;

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, warning: string|null }}
 */
function buildBoxplotTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.', warning: null };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.', warning: null };

  if (!series.yCol) return { traces: [], error: 'A numeric Y column is required.', warning: null };
  if (classifyColumn(ds.rows, series.yCol) !== 'numeric') {
    return { traces: [], error: `Column "${series.yCol}" is not numeric — box plots need a numeric Y.`, warning: null };
  }

  const trace = {
    type: 'box',
    name: series.name || 'Box plot',
    marker: { color: series.style?.color ?? (ds.color ?? '#5b8dee') },
    boxpoints: 'outliers', // Tukey: points beyond 1.5·IQR drawn individually
  };

  let warning = null;

  if (series.xCol) {
    // Grouped: one box per category. Pairs kept together — a row only
    // contributes when its Y is finite.
    const xs = [], ys = [];
    for (const r of rows) {
      const y = Number(r[series.yCol]);
      if (!Number.isFinite(y)) continue;
      xs.push(String(r[series.xCol] ?? '(blank)'));
      ys.push(y);
    }
    if (!ys.length) return { traces: [], error: `No finite numeric values in "${series.yCol}".`, warning: null };
    const nCats = new Set(xs).size;
    if (nCats > BOXPLOT_MAX_CATEGORIES) {
      warning = `"${series.xCol}" has ${nCats} categories — more than ${BOXPLOT_MAX_CATEGORIES} makes box plots unreadable. Consider filtering or a different X column.`;
    }
    trace.x = xs;
    trace.y = ys;
  } else {
    const ys = colVals(rows, series.yCol).filter(Number.isFinite);
    if (!ys.length) return { traces: [], error: `No finite numeric values in "${series.yCol}".`, warning: null };
    trace.y = ys;
  }

  return { traces: [trace], error: null, warning };
}
