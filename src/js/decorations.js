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
  const fmt   = v => isNaN(v) ? 'N/A' : Number(v).toPrecision(4);
  const r2fmt = p => isNaN(p.fitInfo.r2) ? 'N/A' : Number(p.fitInfo.r2).toPrecision(p.fitInfo.sig);
  const th    = plotTheme();
  const single = parityResults.length === 1;
  const legendShown = plot.plotConfig.legendShow !== false;
  // Which stats to show (v2.21.0): absent parityStats = all four; an explicit
  // array filters. R² only when the series has a best-fit. N lives in the legend
  // (parity.js) unless the legend is hidden or the series' N toggle is off — then
  // it falls back to the box here. N is ALWAYS kept in the SR mirror (the
  // accessibility source of truth for sample size — never orphaned).
  const pick = (p, k) => p.parityStats ? p.parityStats.includes(k) : true;
  const visLines = p => {
    const L = [];
    if (pick(p, 'nse'))  L.push(`NSE = ${fmt(p.stats.nse)}`);
    if (pick(p, 'mae'))  L.push(`MAE = ${fmt(p.stats.mae)}`);
    if (pick(p, 'rmse')) L.push(`RMSE = ${fmt(p.stats.rmse)}`);
    if (pick(p, 'r2') && p.fitInfo) L.push(`R² = ${r2fmt(p)}`);
    if (!((p.parityShowN !== false) && legendShown)) L.push(`N = ${p.n}`); // box fallback for N
    return L;
  };

  // Tie each box to its parity series' OWN subplot cell via axis-DOMAIN refs, so
  // it sits inside that cell's plot area. A single box keeps its draggable stored
  // position (plotConfig.annotPos). Boxes sharing a cell stack upward by a
  // CUMULATIVE offset based on line count, so variable-height boxes don't overlap.
  const perCell = {};
  const annots = [];
  for (const p of parityResults) {
    const lines = visLines(p);
    if (!lines.length) continue; // never render an empty, labeled box (§20)
    const sfx  = p.sfx || '';
    const yOff = perCell[sfx] ?? 0;
    perCell[sfx] = yOff + lines.length * 0.055 + 0.05; // ~per-line height + gap
    const base = single ? (plot.plotConfig.annotPos ?? { x: 0.98, y: 0.04 })
                        : { x: 0.98, y: 0.04 };
    annots.push({
      x: base.x, y: base.y + yOff,
      xref: `x${sfx} domain`, yref: `y${sfx} domain`,
      xanchor: base.x > 0.5 ? 'right' : 'left',
      yanchor: base.y < 0.5 ? 'bottom' : 'top',
      // Series names are user data — escHtml applied (Plotly pseudo-HTML)
      text: (single ? '' : `<b>${escHtml(p.name)}</b><br>`) + lines.join('<br>'),
      showarrow: false,
      bgcolor: th.annotBg,
      bordercolor: th.annotBorder, borderwidth: 1, borderpad: 8,
      font: { family: 'JetBrains Mono,monospace',
              size: parseFloat(document.getElementById('fsAnnot')?.value) || 11,
              color: th.title },
      align: 'left',
    });
  }
  layout.annotations = annots;

  parityResults.forEach(p => {
    const sr = [];
    if (pick(p, 'nse'))  sr.push(`NSE=${fmt(p.stats.nse)}`);
    if (pick(p, 'mae'))  sr.push(`MAE=${fmt(p.stats.mae)}`);
    if (pick(p, 'rmse')) sr.push(`RMSE=${fmt(p.stats.rmse)}`);
    if (pick(p, 'r2') && p.fitInfo) sr.push(`R2=${r2fmt(p)}`);
    sr.push(`N=${p.n}`); // always — never orphan the sample size for AT users
    srParts.unshift(`${p.name} statistics: ${sr.join(', ')}`);
  });
}

// Free-text notes (Phase 14): appended AFTER the parity annotations so
// the relayout hook can map dragged indices back through the offset
// stored on the plot div.
function appendNotes(layout, plot, pd, srParts) {
  // Per-plot notes toggle (v2.21.0): hides notes WITHOUT deleting them. Treat
  // hidden as an empty note set so _noteOffset below still equals the parity-box
  // count — the relayout drag hook (chart.js) routes box drags by that offset,
  // and a stale offset would write a dragged box's coords into a hidden note.
  const notes = plot.plotConfig.notesShow === false ? [] : (plot.plotConfig.notes ?? []);
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
