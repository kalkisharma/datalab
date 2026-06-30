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

// Per-subplot titles (v2.22.0): a config-driven title per cell, positioned at
// the top of the cell via axis-DOMAIN refs (the parity-stats-box pattern, so it
// tracks the cell on grid resize). Appended AFTER notes so a stray drag lands
// outside both the note and parity-box index ranges in the relayout hook and is
// simply ignored — titles are config-driven, never persisted by drag. Mirrored
// in the .sr-only summary (Plotly SVG text isn't exposed to screen readers).
function appendCellTitles(layout, plot, grid, srParts) {
  if (!grid) return;
  const cells = plot.plotConfig.cells || {};
  const th = plotTheme();
  const fsT = parseFloat(document.getElementById('fsTitle')?.value) || 14;
  const adds = [];
  for (const [key, ov] of Object.entries(cells)) {
    if (!ov || !ov.title) continue;
    const m = /^(\d+),(\d+)$/.exec(key);
    if (!m) continue;
    const r = +m[1], c = +m[2];
    if (r < 1 || r > grid.rows || c < 1 || c > grid.cols) continue;
    const k = (r - 1) * grid.cols + c;
    const sfx = k === 1 ? '' : String(k);
    adds.push({
      x: 0.5, y: 1.0, xref: `x${sfx} domain`, yref: `y${sfx} domain`,
      xanchor: 'center', yanchor: 'bottom', yshift: 6,
      // Plotly annotation text is inert SVG (XSS-suite covered, §8) — not escHtml'd
      text: ov.title, showarrow: false,
      font: { size: Math.round(fsT * 0.9), color: th.title },
    });
    srParts.push(`Subplot R${r}C${c} title: ${ov.title}`);
  }
  if (adds.length) layout.annotations = [...(layout.annotations ?? []), ...adds];
}

// Per-panel plotly_relayout persistence (extracted from chart.js at the v2.22.0
// §6 split — the named seam recorded since v2.14.0). Persists a dragged legend
// and second legend (clamped to the figure), dragged annotations (notes vs the
// parity stats box, routed by pd._noteOffset), and interactive zoom/pan into
// plotConfig. Bound once per plot div; re-bound after clearPanel replaces it.
function bindRelayoutPersistence(pd, plot) {
  if (pd._legendHooked) return;
  pd.on('plotly_relayout', e => {
    if (e['legend.x'] !== undefined || e['legend.y'] !== undefined) {
      const clamp = v => Math.max(0, Math.min(1, v));
      const lx = clamp(e['legend.x'] ?? plot.plotConfig.legendPos?.x ?? 0.01);
      const ly = clamp(e['legend.y'] ?? plot.plotConfig.legendPos?.y ?? 0.99);
      plot.plotConfig.legendPos = { x: lx, y: ly };
      const outX = e['legend.x'] !== undefined && (e['legend.x'] < 0 || e['legend.x'] > 1);
      const outY = e['legend.y'] !== undefined && (e['legend.y'] < 0 || e['legend.y'] > 1);
      if (outX || outY) { try { Plotly.relayout(pd, { 'legend.x': lx, 'legend.y': ly }); } catch (err) {} }
    }
    // Second legend (Phase 19): persists and clamps like the main legend.
    if (e['legend2.x'] !== undefined || e['legend2.y'] !== undefined) {
      const clamp = v => Math.max(0, Math.min(1, v));
      const lx = clamp(e['legend2.x'] ?? plot.plotConfig.legend2Pos?.x ?? 0.99);
      const ly = clamp(e['legend2.y'] ?? plot.plotConfig.legend2Pos?.y ?? 0.99);
      plot.plotConfig.legend2Pos = { x: lx, y: ly };
      const outX = e['legend2.x'] !== undefined && (e['legend2.x'] < 0 || e['legend2.x'] > 1);
      const outY = e['legend2.y'] !== undefined && (e['legend2.y'] < 0 || e['legend2.y'] > 1);
      if (outX || outY) { try { Plotly.relayout(pd, { 'legend2.x': lx, 'legend2.y': ly }); } catch (err) {} }
    }
    // Dragged annotations: indices past _noteOffset are notes (Phase 14); before
    // it is the parity stats box (Stab A → plotConfig.annotPos). Per-cell titles
    // (v2.22.0) sit past both ranges and are intentionally ignored here.
    for (const k of Object.keys(e)) {
      const m = /^annotations\[(\d+)\]\.(x|y)$/.exec(k);
      if (!m) continue;
      const ai = parseInt(m[1]);
      const noteIdx = ai - (pd._noteOffset ?? 0);
      const ns = plot.plotConfig.notes ?? [];
      if (noteIdx >= 0 && noteIdx < ns.length) {
        ns[noteIdx][m[2]] = e[k];
      } else if (ai < (pd._noteOffset ?? 0)) {
        plot.plotConfig.annotPos = plot.plotConfig.annotPos || { x: 0.98, y: 0.04 };
        plot.plotConfig.annotPos[m[2]] = e[k];
      }
    }
    // Persist interactive zoom/pan (base xaxis/yaxis only; parity re-forces its
    // own equal-axis range). Plotly emits xaxis.range[0/1] on zoom, xaxis.autorange
    // on a double-click reset. Mirror into the panel Min/Max inputs when active.
    const isActive = plot.id === activePlot().id;
    for (const ax of ['xaxis', 'yaxis']) {
      const cfgMin = ax === 'xaxis' ? 'xMin' : 'yMin';
      const cfgMax = ax === 'xaxis' ? 'xMax' : 'yMax';
      const isLog  = ax === 'xaxis' ? plot.plotConfig.xLog : plot.plotConfig.yLog;
      const lo = e[`${ax}.range[0]`], hi = e[`${ax}.range[1]`];
      if (lo !== undefined && hi !== undefined) {
        const conv = v => isLog ? Math.pow(10, v) : v;
        plot.plotConfig[cfgMin] = String(conv(lo));
        plot.plotConfig[cfgMax] = String(conv(hi));
      } else if (e[`${ax}.autorange`]) {
        plot.plotConfig[cfgMin] = ''; plot.plotConfig[cfgMax] = '';
      } else continue;
      if (isActive) {
        const elMin = document.getElementById(cfgMin), elMax = document.getElementById(cfgMax);
        if (elMin) elMin.value = plot.plotConfig[cfgMin];
        if (elMax) elMax.value = plot.plotConfig[cfgMax];
      }
    }
  });
  pd._legendHooked = true;
}

// Plot-level shared-colorbar override (v2.22.0). Active only when a subplot grid
// has a shared color-by AND plotConfig.colorbar is set. Returns the per-series
// fields to bake onto EVERY series so all cells share ONE scale — the honest
// precondition for a single colorbar — with the colour range forced: explicit
// min/max, else the union over the plot's shared-colour values (a single bar over
// per-cell auto-scales would misread, §20). Returns null when inactive.
function sharedColorbarConfig(plot) {
  const cfg = plot.plotConfig;
  const grid = plot.grid && plot.grid.rows * plot.grid.cols > 1; // grid lives on plot, not plotConfig
  if (!grid || !cfg.sharedColorCol || !cfg.colorbar) return null;
  const cb = cfg.colorbar;
  const out = { colorReverse: !!cb.reverse, colorbarTitleHide: !!cb.titleHide };
  if (cb.colormap) out.colormap = cb.colormap;
  if (cb.label) out.colorbarLabel = cb.label;
  let dlo = Infinity, dhi = -Infinity;
  if (!Number.isFinite(cb.min) || !Number.isFinite(cb.max)) {
    for (const s of appState.series) {
      if ((s.plotId ?? appState.plots[0].id) !== plot.id || s.enabled === false) continue;
      const ds = appState.datasets.find(d => d.id === s.datasetId);
      if (!ds || !(ds.headers || []).includes(cfg.sharedColorCol)) continue;
      const rows = applyFilters(ds.rows, s.filters || [], s.filterLogic || 'and');
      for (const v of colVals(rows, cfg.sharedColorCol)) {
        if (Number.isFinite(v)) { if (v < dlo) dlo = v; if (v > dhi) dhi = v; }
      }
    }
  }
  const cmin = Number.isFinite(cb.min) ? cb.min : dlo;
  const cmax = Number.isFinite(cb.max) ? cb.max : dhi;
  if (Number.isFinite(cmin)) out.colorMin = cmin;
  if (Number.isFinite(cmax)) out.colorMax = cmax;
  return out;
}

// Keep exactly one colorbar when a shared colorbar is active (v2.22.0): the first
// colour-mapped trace keeps its bar; the rest are silenced so N identical bars
// don't stack. Covers marker color-by (scatter/parity) and trace-level colorbars.
function suppressExtraColorbars(traces) {
  let kept = false;
  for (const t of traces) {
    const mk = t.marker;
    if (!(mk && (mk.showscale || mk.colorbar)) && !(t.showscale || t.colorbar)) continue;
    if (!kept) { kept = true; continue; }
    if (mk) { mk.showscale = false; delete mk.colorbar; }
    t.showscale = false; delete t.colorbar;
  }
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
