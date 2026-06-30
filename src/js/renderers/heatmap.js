// heatmap.js — general-purpose heatmap renderer (categorical X × categorical Y
// × numeric value with explicit aggregation; Phase 14)
//
// Log scale guidance: both axes are categorical — never log. Value scaling
// is the colorbar's job; a log COLOR scale is a future consideration, not
// an axis property.
//
// Aggregation follows the bar-chart precedent verbatim (STANDARDS §20):
// agg='none' (default) errors when any (X,Y) combination repeats; explicit
// count/sum/mean/median otherwise, and the colorbar title names the
// aggregation. Missing combinations render as gaps (null cells).

/**
 * @param {object}   series - zCol is the value column (contour precedent)
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null, warning?: string|null }}
 */
function buildHeatmapTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X and Y category columns are required.' };
  const agg = series.agg || 'none';
  if (agg !== 'count') {
    if (!series.zCol) return { traces: [], error: 'A numeric value column is required (or use the count aggregation).' };
    if (classifyColumn(ds.rows, series.zCol) !== 'numeric') {
      return { traces: [], error: `Column "${series.zCol}" is not numeric — heatmap values must be numeric.` };
    }
  }

  // Group by (x, y) cell, preserving first-seen axis order
  const xs = [], ys = [];
  const xSeen = new Set(), ySeen = new Set();
  const cells = new Map(); // x \x1f y → number[] (or count)
  for (const r of rows) {
    const cx = String(r[series.xCol] ?? '(blank)');
    const cy = String(r[series.yCol] ?? '(blank)');
    if (agg !== 'count') {
      const v = finiteOrNaN(r[series.zCol]);
      if (!Number.isFinite(v)) continue;
      const k = cx + '\x1f' + cy;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(v);
    } else {
      const k = cx + '\x1f' + cy;
      cells.set(k, (cells.get(k) ?? 0) + 1);
    }
    if (!xSeen.has(cx)) { xSeen.add(cx); xs.push(cx); }
    if (!ySeen.has(cy)) { ySeen.add(cy); ys.push(cy); }
  }
  if (!cells.size) return { traces: [], error: `No finite numeric values in "${series.zCol}".` };

  if (agg === 'none') {
    const dup = [...cells.entries()].find(([, v]) => v.length > 1);
    if (dup) {
      const [cx, cy] = dup[0].split('\x1f');
      // Caller escHtml-escapes error strings per the renderer contract
      return { traces: [], error:
        `(${cx}, ${cy}) repeats ${dup[1].length}× — choose an aggregation (count, sum, mean, median) or filter to one row per combination.` };
    }
  }

  let warning = null;
  if (xs.length > 50 || ys.length > 50) {
    warning = `${xs.length} × ${ys.length} categories — more than 50 on an axis makes heatmaps unreadable. Consider filtering.`;
  }

  const reduce = v => {
    switch (agg) {
      case 'count':  return v;
      case 'sum':    return v.reduce((a, b) => a + b, 0);
      case 'mean':   return v.reduce((a, b) => a + b, 0) / v.length;
      case 'median': return quantile([...v].sort((a, b) => a - b), 0.5);
      default:       return v[0];
    }
  };
  const z = ys.map(cy => xs.map(cx => {
    const v = cells.get(cx + '\x1f' + cy);
    return v === undefined ? null : reduce(v);
  }));

  const aggLabel = agg === 'count' ? 'count'
    : agg === 'none' ? series.zCol : `${agg}(${series.zCol})`;

  // Colorbar controls (v2.18.0): manual color range + reverse colormap. The
  // title stays the aggregation name — it must always be named (§20), so no
  // hide/custom-title control here (unlike contour / numeric color-by).
  const cbExtra = {};
  if (Number.isFinite(series.colorMin)) cbExtra.zmin = series.colorMin;
  if (Number.isFinite(series.colorMax)) cbExtra.zmax = series.colorMax;
  if (series.colorReverse) cbExtra.reversescale = true;

  return {
    traces: [{
      type: 'heatmap',
      x: xs, y: ys, z,
      name: series.name || 'Heatmap',
      colorscale: resolveColorscale(series.colormap),
      ...cbExtra,
      colorbar: { title: { text: aggLabel } }, // aggregation always named (§20)
      hovertemplate: `${series.xCol}: %{x}<br>${series.yCol}: %{y}<br>${aggLabel}: %{z}<extra></extra>`,
    }],
    error: null,
    warning,
  };
}
