// line.js — line chart renderer
//
// Log scale guidance: same as scatter — linear by default, log when data
// spans multiple orders of magnitude. Datetime X-axis supported in Phase 3.
// Data Scientist: reviewed and approved for Phase 1.

/**
 * @param {object}   series
 * @param {object[]} datasets
 * @returns {{ traces: object[], error: string|null }}
 */
function buildLineTrace(series, datasets) {
  const ds = datasets.find(d => d.id === series.datasetId);
  if (!ds) return { traces: [], error: 'Dataset not found.' };

  const rows = applyFilters(ds.rows, series.filters || [], series.filterLogic || 'and');
  if (!rows.length) return { traces: [], error: 'No rows pass the active filters.' };

  if (!series.xCol || !series.yCol) return { traces: [], error: 'X and Y columns are required.' };

  const isDatetime = classifyColumn(ds.rows, series.xCol) === 'datetime';
  let xV, yV, eV = null;
  if (isDatetime) {
    const dt = datetimeXY(ds, rows, series.xCol, series.yCol, series.errCol);
    if (dt.error) return { traces: [], error: dt.error };
    // Lines must be drawn in time order or they zigzag back through time
    const order = dt.xV.map((_, i) => i).sort((a, b) => dt.xV[a] < dt.xV[b] ? -1 : 1);
    xV = order.map(i => dt.xV[i]);
    yV = order.map(i => dt.yV[i]);
    if (dt.eV) eV = order.map(i => dt.eV[i]); // errors follow the time sort
  } else {
    // Memoized extraction only valid on the unfiltered dataset rows
    const unfiltered = rows === ds.rows;
    xV = unfiltered ? colValsCached(ds, series.xCol) : colVals(rows, series.xCol);
    yV = unfiltered ? colValsCached(ds, series.yCol) : colVals(rows, series.yCol);
    if (series.errCol) eV = colVals(rows, series.errCol); // row-aligned with x/y
  }

  const color = series.style?.color ?? (ds.color ?? '#5b8dee');
  const lineWidth = series.style?.lineWidth ?? 2;
  const symbol = series.style?.symbol ?? 'circle'; // line builds markers by hand (no buildMarkerStyle)
  // Error bars: name carries "± column" — semantics always visible (§20).
  // legendLabel (Phase 16) overrides the auto label incl. the suffix.
  const baseName = series.legendLabel || ((series.name || 'Line') + (series.errCol ? ` (± ${series.errCol})` : ''));
  const hover = `${series.xCol}: %{x}<br>${series.yCol}: %{y}<extra></extra>`;
  let warning = null;

  // Color-by (Stab A — previously a silent no-op): a CATEGORICAL column draws
  // one line per category, reusing categoryGroups (each group sorted by X so
  // the line doesn't zigzag). Numeric color-by isn't meaningful for a line (a
  // line is one colour) and datetime X keeps the single time-sorted line —
  // both warn and fall through to the single line below.
  if (series.colorCol && !isDatetime) {
    if (colorMapping(rows, series.colorCol).isNumeric) {
      warning = 'Color-by needs a categorical column for line plots — drew one line.';
    } else {
      // Normalize missing values (null/undefined/empty/whitespace) to one
      // clearly-labelled "(blank)" group rather than letting empty strings form
      // an unlabelled category — and surface the count so a "(blank)" line in
      // the legend isn't mistaken for a real category (§20 honesty).
      const colorVals = rows.map(r => {
        const v = r[series.colorCol];
        return (v == null || String(v).trim() === '') ? '(blank)' : v;
      });
      const groups = categoryGroupsFromValues(colorVals);
      const warnings = [];
      const blankCount = (groups.find(g => g.cat === '(blank)') || {}).idx?.length || 0;
      if (blankCount) warnings.push(`${blankCount} row${blankCount === 1 ? '' : 's'} have no "${series.colorCol}" value — grouped as "(blank)".`);
      // High-cardinality guard (Stab A follow-up, mirrors the boxplot/heatmap
      // >50 rule): one line per category becomes unreadable and slow well
      // before the palette runs out, so warn on count, not just colour reuse.
      if (groups.length > 50) {
        warnings.push(`"${series.colorCol}" has ${groups.length} categories — too many to read as separate lines; filter the data or pick a column with fewer groups.`);
      } else if (groups.length > PALETTE.length) {
        warnings.push(`"${series.colorCol}" has ${groups.length} categories — only ${PALETTE.length} palette colours, so colours repeat.`);
      }
      warning = warnings.length ? warnings.join(' ') : null;
      const traces = groups.map((g, gi) => {
        const idx = [...g.idx].sort((a, b) => xV[a] - xV[b]); // X order within the group
        const tr = {
          type: 'scatter', mode: 'lines+markers',
          x: idx.map(i => xV[i]), y: idx.map(i => yV[i]),
          name: g.cat, line: { color: g.color, width: lineWidth }, marker: { color: g.color, size: 4, symbol },
          legendgroup: series.id, hovertemplate: hover,
        };
        if (gi === 0) tr.legendgrouptitle = { text: baseName };
        if (eV) tr.error_y = errorBarsFromCol(idx.map(i => eV[i]));
        return tr;
      });
      return { traces, error: null, warning };
    }
  } else if (series.colorCol && isDatetime) {
    warning = 'Color-by is not supported with a datetime X axis for lines — drew one line.';
  }

  const trace = {
    type: 'scatter', mode: 'lines+markers', x: xV, y: yV,
    name: baseName,
    line: { color, width: lineWidth },
    marker: { color, size: 4, symbol },
    hovertemplate: hover,
  };
  if (eV) trace.error_y = errorBarsFromCol(eV);

  return { traces: [trace], error: null, warning };
}
