// bar.js — bar chart renderer (categorical X, numeric Y, explicit aggregation)
//
// Log scale guidance: log Y only when category values span decades — bars
// on a log axis have no meaningful zero baseline, which can mislead; prefer
// linear unless the spread demands it. X is categorical, never log.
//
// Aggregation (Data Scientist ruling, Phase 9 — STANDARDS §20): silent
// aggregation is forbidden. agg='none' (default) errors when any category
// repeats, telling the user to choose; count/sum/mean/median aggregate
// explicitly and the trace NAME and hover always state the aggregation.
// Error bars (mean only): SD = sample standard deviation (n−1), SEM =
// SD/√n; the chosen semantics appear in the trace name — an unlabeled
// error bar is a §20 correctness violation.

const BAR_MAX_CATEGORIES = 50; // same readability bound as boxplot

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, warning?: string|null }}
 */
function buildBarTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol) return { traces: [], error: 'A category (X) column is required.' };
  const agg = series.agg || 'none';
  if (agg !== 'count') {
    if (!series.yCol) return { traces: [], error: 'A numeric Y column is required (or use the count aggregation).' };
    if (classifyColumn(ds.rows, series.yCol) !== 'numeric') {
      return { traces: [], error: `Column "${series.yCol}" is not numeric — bars need a numeric Y.` };
    }
  }

  // Group rows by category, preserving first-seen order
  const groups = new Map(); // cat → number[] (or count for agg='count')
  for (const r of rows) {
    const cat = String(r[series.xCol] ?? '(blank)');
    if (agg === 'count') {
      groups.set(cat, (groups.get(cat) ?? 0) + 1);
      continue;
    }
    const y = finiteOrNaN(r[series.yCol]);
    if (!Number.isFinite(y)) continue;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(y);
  }
  if (!groups.size) return { traces: [], error: `No finite numeric values in "${series.yCol}".` };

  let warning = null;
  if (groups.size > BAR_MAX_CATEGORIES) {
    warning = `"${series.xCol}" has ${groups.size} categories — more than ${BAR_MAX_CATEGORIES} makes bars unreadable. Consider filtering or aggregating differently.`;
  }

  // Explicit-aggregation rule: 'none' must mean one row per category
  if (agg === 'none') {
    const dup = [...groups.entries()].find(([, v]) => v.length > 1);
    if (dup) {
      // Caller escHtml-escapes error strings per the renderer contract
      return { traces: [], error:
        `"${series.xCol}" repeats (e.g. "${dup[0]}" × ${dup[1].length}) — ` +
        `choose an aggregation (count, sum, mean, median) or filter to one row per category.` };
    }
  }

  const cats = [...groups.keys()];
  const yV = cats.map(c => {
    const v = groups.get(c);
    switch (agg) {
      case 'count':  return v;
      case 'sum':    return v.reduce((a, b) => a + b, 0);
      case 'mean':   return v.reduce((a, b) => a + b, 0) / v.length;
      case 'median': return quantile([...v].sort((a, b) => a - b), 0.5);
      default:       return v[0]; // 'none' — exactly one value per category
    }
  });

  // Name states the aggregation (§20) — and the error semantics if present
  const base = series.name || 'Bar';
  const aggLabel = agg === 'none' ? '' :
    agg === 'count' ? ' (count)' : ` (${agg} of ${series.yCol})`;

  const trace = {
    type: 'bar',
    x: cats, y: yV,
    name: base + aggLabel,
    marker: { color: series.style?.color ?? (ds.color ?? '#5b8dee') },
    hovertemplate: `${series.xCol}: %{x}<br>${agg === 'count' ? 'count' : (agg === 'none' ? series.yCol : `${agg}(${series.yCol})`)}: %{y}<extra></extra>`,
  };

  // Error bars — mean only; semantics in the name, never bare (§20)
  if (series.errMode === 'sd' || series.errMode === 'sem') {
    if (agg !== 'mean') {
      return { traces: [], error: 'SD/SEM error bars require the mean aggregation.' };
    }
    const errs = cats.map(c => {
      const v = groups.get(c);
      if (v.length < 2) return 0;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
      return series.errMode === 'sem' ? sd / Math.sqrt(v.length) : sd;
    });
    trace.error_y = { type: 'data', array: errs, visible: true };
    trace.name = `${base} (mean ± ${series.errMode.toUpperCase()} of ${series.yCol})`;
  }

  return { traces: [trace], error: null, warning };
}
