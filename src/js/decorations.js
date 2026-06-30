// decorations.js — plot-level decorations applied by renderOnePlot:
// right Y axis (dual-Y), parity stats annotations, free-text notes, and log
// interactions (right-axis/notes/log split from chart.js at the Phase 14
// exit refactor review; parity stats joined them at the v2.10.0 §6 review —
// all function extractions, suite-verified)

// Right Y axis is meaningful only for value-over-x types (Phase 14);
// parity (equal axes), histogram/boxplot/violin (distribution), contour/
// heatmap (matrix) conflict geometrically
function series14RightOk(s) {
  return s.chartType === 'scatter' || s.chartType === 'line' || s.chartType === 'bar';
}

// Right Y axis layout (Phase 14): no gridlines (the left grid stays
// authoritative); both titles tint to their first series' colors — the
// DS coupling condition made structural. Manual ranges and Log Y stay
// left-only by design. Mutates layout in place.
function applyRightAxis(layout, leftSeries, rightSeries, leftColor, rightColor, warnings) {
  if (!rightSeries.length) return;
  const y2 = JSON.parse(JSON.stringify(layout.yaxis));
  y2.overlaying = 'y';
  y2.side = 'right';
  y2.showgrid = false;
  delete y2.range;
  delete y2.type;
  y2.title = { text: rightSeries[0].yCol || '',
               font: { ...y2.title.font, color: rightColor } };
  layout.yaxis2 = y2;
  layout.yaxis.title.font.color = leftColor ?? layout.yaxis.title.font.color;
  const leftCols = new Set(leftSeries.map(s2 => s2.yCol));
  const dupCol = rightSeries.find(s2 => leftCols.has(s2.yCol));
  if (dupCol) {
    warnings.push({ name: 'Right axis', warning:
      `"${dupCol.yCol}" is on BOTH axes — dual axes for the same quantity mislead; consider one axis.` });
  }
}

// Parity stats annotations (split from chart.js at the v2.10.0 §6 refactor
// review — parity-specific presentation lifted out of the generic
// dispatcher into the decorations family): one NSE/MAE/RMSE/N box per
// parity series, stacked; a single parity series keeps its draggable stored
// position. Sets layout.annotations and prepends screen-reader lines.
// Runs BEFORE appendNotes so notes append after these (see _noteOffset).
function appendParityStats(layout, parityResults, plot, srParts) {
  if (!parityResults.length) return;
  const fmt = v => isNaN(v) ? 'N/A' : Number(v).toPrecision(4);
  // Best-fit R² (when the series has a fit) is shown HERE, not in the legend,
  // at the series' chosen significant figures (v2.19.0).
  const r2Txt = p => p.fitInfo ? `R² = ${isNaN(p.fitInfo.r2) ? 'N/A' : Number(p.fitInfo.r2).toPrecision(p.fitInfo.sig)}<br>` : '';
  const r2Sr  = p => p.fitInfo ? `, R2=${isNaN(p.fitInfo.r2) ? 'N/A' : Number(p.fitInfo.r2).toPrecision(p.fitInfo.sig)}` : '';
  const th  = plotTheme();
  const single = parityResults.length === 1;
  // Tie each box to its parity series' OWN subplot cell via axis-DOMAIN refs
  // ('x{sfx} domain'/'y{sfx} domain'), so it sits inside that cell's plot area
  // and stays there as more subplots are added — rather than at the whole-figure
  // corner. Still draggable; a dragged single-parity box persists in
  // plotConfig.annotPos (now in cell-domain coords). Boxes sharing a cell stack
  // upward via a per-cell counter so different cells don't offset each other.
  const perCell = {};
  layout.annotations = parityResults.map(p => {
    const sfx = p.sfx || '';
    const i = perCell[sfx] ?? 0; perCell[sfx] = i + 1;
    const base = single ? (plot.plotConfig.annotPos ?? { x: 0.98, y: 0.04 })
                        : { x: 0.98, y: 0.04 };
    return {
      x: base.x, y: base.y + i * 0.24,
      xref: `x${sfx} domain`, yref: `y${sfx} domain`,
      xanchor: base.x > 0.5 ? 'right' : 'left',
      yanchor: base.y < 0.5 ? 'bottom' : 'top',
      // Series names are user data — escHtml applied (Plotly pseudo-HTML)
      text: (single ? '' : `<b>${escHtml(p.name)}</b><br>`)
        + `NSE = ${fmt(p.stats.nse)}<br>MAE = ${fmt(p.stats.mae)}<br>RMSE = ${fmt(p.stats.rmse)}<br>${r2Txt(p)}N = ${p.n}`,
      showarrow: false,
      bgcolor: th.annotBg,
      bordercolor: th.annotBorder, borderwidth: 1, borderpad: 8,
      font: { family: 'JetBrains Mono,monospace',
              size: parseFloat(document.getElementById('fsAnnot')?.value) || 11,
              color: th.title },
      align: 'left',
    };
  });
  parityResults.forEach(p => srParts.unshift(
    `${p.name} statistics: NSE=${fmt(p.stats.nse)}, MAE=${fmt(p.stats.mae)}, RMSE=${fmt(p.stats.rmse)}${r2Sr(p)}, N=${p.n}`
  ));
}

// Free-text notes (Phase 14): appended AFTER the parity annotations so
// the relayout hook can map dragged indices back through the offset
// stored on the plot div.
function appendNotes(layout, plot, pd, srParts) {
  const notes = plot.plotConfig.notes ?? [];
  if (notes.length) {
    const thN = plotTheme();
    layout.annotations = [
      ...(layout.annotations ?? []),
      ...notes.map(n => ({
        x: n.x, y: n.y, xref: 'paper', yref: 'paper',
        // escHtml: note text is user data inside Plotly pseudo-HTML
        text: escHtml(n.text),
        showarrow: false,
        bgcolor: thN.annotBg, bordercolor: thN.annotBorder, borderwidth: 1, borderpad: 6,
        font: { size: parseFloat(document.getElementById('fsAnnot')?.value) || 11, color: thN.title },
      })),
    ];
    notes.forEach(n => srParts.push(`note: ${n.text}`));
  }
  pd._noteOffset = (layout.annotations?.length ?? 0) - notes.length;
}

// Log-axis interactions (Phase 9 rulings, per-cell since Phase 10, moved
// here at the Phase 14 exit refactor review — verbatim from chart.js):
// non-positive counts surfaced (Plotly drops them silently); parity ranges
// re-derived from UNPADDED data extremes and padded in log space, since
// the linear 5% pad goes negative even for positive data.
function applyLogInteractions(layout, plot, traces, warnings, parityByCell) {
  const cfg = plot.plotConfig;
  if (!cfg.xLog && !cfg.yLog) return;
  let nx = 0, ny = 0;
  for (const t of traces) {
    if (cfg.xLog && Array.isArray(t.x)) nx += t.x.filter(v => typeof v === 'number' && v <= 0).length;
    if (cfg.yLog && Array.isArray(t.y)) ny += t.y.filter(v => typeof v === 'number' && v <= 0).length;
  }
  if (nx) warnings.push({ name: 'Log X', warning: `${nx} non-positive value(s) cannot be shown on a log X axis.` });
  if (ny) warnings.push({ name: 'Log Y', warning: `${ny} non-positive value(s) cannot be shown on a log Y axis.` });

  let parityLogWarned = false;
  for (const [sfx, list] of Object.entries(parityByCell)) {
    const dmn = Math.min(...list.map(p => p.dataMin));
    const dmx = Math.max(...list.map(p => p.dataMax));
    if (cfg.xLog && cfg.yLog && dmn > 0) {
      const lo = Math.log10(dmn), hi = Math.log10(dmx);
      const pad = (hi - lo) * 0.05 || 0.05;
      layout['xaxis' + sfx].range = [lo - pad, hi + pad];
      layout['yaxis' + sfx].range = [lo - pad, hi + pad];
    } else {
      layout['xaxis' + sfx].type = 'linear';
      layout['yaxis' + sfx].type = 'linear';
      if (!parityLogWarned) {
        parityLogWarned = true;
        warnings.push({ name: 'Parity', warning:
          'A parity plot needs BOTH Log X and Log Y and all-positive data — rendered linear.' });
      }
    }
  }
}
