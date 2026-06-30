// chart.js — renderPlot dispatcher (per-plot, Phase 7)
// (theme + base layout live in layout.js; PNG/ZIP export in export.js;
//  the per-series trace cache lives in render-cache.js — buildSeriesResult
//  + pruneTraceCache; decoration helpers — right axis, parity stats, notes,
//  log interactions — live in decorations.js)

const RENDERERS = {
  scatter:   buildScatterTrace,
  line:      buildLineTrace,
  bar:       buildBarTrace,
  parity:    buildParityTrace,
  contour:   buildContourTrace,
  histogram: buildHistogramTrace,
  boxplot:   buildBoxplotTrace,
  violin:    buildViolinTrace,
  heatmap:   buildHeatmapTrace,
  pair:      buildPairTrace,
};

// ── renderPlot — renders the whole grid ───────────────────────────────────

function renderPlot() {
  // Release cached traces for deleted series BEFORE the empty return —
  // deleting the last series must free its cached traces (Phase 4)
  pruneTraceCache(appState.series);

  if (!appState.series.length) {
    if (appState.plotRendered) clearPlot(); // everything deleted → release all panels
    return;
  }

  // Un-hide the grid BEFORE plotting. Plotly.react sizes against the
  // container; on the FIRST render, plotting into a still-`display:none`
  // grid measured a zero-height box and the plot came up tiny, only
  // snapping to full size when a later edit triggered Plotly.Plots.resize
  // (maintainer-reported). Make the container visible first so the very
  // first render measures correctly.
  appState.plotRendered = true;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('plotGrid').classList.remove('hidden');

  renderPlotGrid(); // panels exist before plotting into them

  for (const plot of appState.plots) { if (plot.hidden) continue; renderOnePlot(plot); } // skip hidden panels (workspace ergonomics)

  document.getElementById('downloadBtn').style.display    = '';
  document.getElementById('downloadSvgBtn').style.display = '';
  document.getElementById('exportDataBtn').style.display  = '';
  // Export all only earns its place with 2+ panels (1 panel = same as ↓ PNG)
  document.getElementById('exportAllBtn').style.display = appState.plots.filter(p => !p.hidden).length > 1 ? '' : 'none';
  document.getElementById('savedStrip').style.display  = appState.savedPlots.filter(Boolean).length ? '' : 'none';
  document.getElementById('saveBtn').style.display     = '';
  syncAutoLabels();
}

function renderOnePlot(plot) {
  const pd = plotDivFor(plot.id);
  if (!pd) return;

  // Pair plot (SPLOM) is a WHOLE-PLOT type: it owns its own N×N axis grid, so
  // it can't go through the single-axis-pair loop or coexist with the subplot
  // grid. Intercept it here, before any grid/loop machinery (§7 carve-out).
  const pairSeries = appState.series.find(s =>
    (s.plotId ?? appState.plots[0].id) === plot.id && s.enabled !== false && s.chartType === 'pair');
  if (pairSeries) { renderPairPlot(plot, pd, pairSeries); return; }

  const traces   = [];
  const errors   = [];
  const warnings = [];
  let   layout   = buildBaseLayout(plot);
  const parityResults = []; // every parity series annotated, not just the last
  const srParts = [];       // screen-reader mirror lines
  // Dual-Y bookkeeping (Phase 14)
  const leftSeries = [], rightSeries = [];
  let leftColor = null, rightColor = null, rightGridWarned = false;

  // ── Subplot grid (Phase 10) ─────────────────────────────────────────────
  // One Plotly div, one figure: each cell is an axis pair (xaxis/xaxis2/…).
  // Renderers stay single-axis-pair — the dispatcher remaps their traces
  // and layout overrides onto the cell's axis keys (spike decision, no §7
  // contract change). Out-of-range cells clamp to the grid edge at render
  // time; the stored cell is preserved so re-growing restores it.
  const grid = (plot.grid && plot.grid.rows * plot.grid.cols > 1) ? plot.grid : null;
  const cellOf = s => {
    const r = Math.min(Math.max(s.cell?.row ?? 1, 1), grid.rows);
    const c = Math.min(Math.max(s.cell?.col ?? 1, 1), grid.cols);
    const k = (r - 1) * grid.cols + c; // 1-based axis number
    return { r, c, sfx: k === 1 ? '' : String(k) };
  };
  if (grid) {
    layout.grid = { rows: grid.rows, columns: grid.cols, pattern: 'independent' };
    // Every cell gets the full styled axis pair (deep clone of the base)
    for (let k = 2; k <= grid.rows * grid.cols; k++) {
      layout['xaxis' + k] = JSON.parse(JSON.stringify(layout.xaxis));
      layout['yaxis' + k] = JSON.parse(JSON.stringify(layout.yaxis));
    }
  }

  // Plot-level shared-colorbar override (v2.22.0): computed once; baked onto every
  // series below and collapsed to a single bar after the loop. null when inactive.
  const sharedCb = sharedColorbarConfig(plot);

  for (const s of appState.series) {
    if ((s.plotId ?? appState.plots[0].id) !== plot.id) continue;
    if (s.enabled === false) continue;
    if (s.chartType === 'pair') continue; // whole-plot type — handled by the early branch above
    if (!RENDERERS[s.chartType]) continue;

    const cell  = grid ? cellOf(s) : null;
    const sfx   = cell ? cell.sfx : '';
    // Per-cell error labels name the cell (UX flow, Phase 10)
    const label = cell ? `R${cell.r}C${cell.c} · ${s.name}` : s.name;

    // Clear error for missing column refs (e.g. after a dataset reload)
    const missing = validateSeriesColumns(s, appState.datasets);
    if (missing.length) {
      errors.push({ name: label, error: `references missing ${missing.join(', ')} — edit the series or reload the original CSV` });
      continue;
    }

    // Bake the resolved effective colormap (series > plot > global, v2.20.0) and
    // the subplot-wide shared color/size override (grid only) onto a clone, so
    // the renderer reads concrete values and the trace-cache key reflects them.
    const ov = { colormap: effectiveColormap(s, plot) };
    if (grid) {
      const cfg = plot.plotConfig;
      const dsH = appState.datasets.find(d => d.id === s.datasetId)?.headers || [];
      if (cfg.sharedColorCol && dsH.includes(cfg.sharedColorCol)) ov.colorCol = cfg.sharedColorCol;
      if (cfg.sharedSizeCol  && dsH.includes(cfg.sharedSizeCol))  ov.sizeCol  = cfg.sharedSizeCol;
    }
    // Plot colorbar override (v2.22.0): bake the shared-colorbar fields onto every
    // series so all cells share one scale (single bar suppressed below).
    if (sharedCb) Object.assign(ov, sharedCb);
    const eff = { ...s, ...ov };
    const result = buildSeriesResult(eff, { xLog: !!plot.plotConfig.xLog });
    if (result.error) { errors.push({ name: label, error: result.error }); continue; }
    if (result.warning) warnings.push({ name: label, warning: result.warning });

    // Right Y axis (Phase 14): scatter/line/bar only, never inside a grid
    // (Phase 13 review decision — falls back left with a warning)
    const wantsRight = series14RightOk(s) && s.rightAxis;
    if (s.rightAxis && grid && !rightGridWarned) {
      rightGridWarned = true;
      warnings.push({ name: 'Right axis', warning:
        'Dual Y is unavailable in subplot grids — rendered on the left.' });
    }
    for (const t of result.traces) {
      // Cached traces persist across renders — always set or clear the axis
      // refs so a grid or right-axis change can't leave stale assignments
      if (grid) { t.xaxis = 'x' + sfx; t.yaxis = 'y' + sfx; }
      else { delete t.xaxis; delete t.yaxis; }
      if (!grid && wantsRight) t.yaxis = 'y2';
      if (s.legendHide) t.showlegend = false; // hide this series from the legend (workspace ergonomics)
      traces.push(t);
    }
    if (!grid) {
      const sColor = s.style?.color
        ?? appState.datasets.find(d => d.id === s.datasetId)?.color ?? '#5b8dee';
      if (wantsRight) { rightSeries.push(s); if (!rightColor) rightColor = sColor; }
      else { leftSeries.push(s); if (!leftColor) leftColor = sColor; }
    }

    if (result.layout) {
      // Merge axis overrides INTO the styled axis objects (Phase 8 fix),
      // remapped onto the series' cell axes (Phase 10) — parity's
      // scaleanchor must anchor to ITS cell's x axis
      for (const [k, v] of Object.entries(result.layout)) {
        const key = (k === 'xaxis' || k === 'yaxis') ? k + sfx : k;
        if ((k === 'xaxis' || k === 'yaxis') && layout[key]) {
          const vv = { ...v };
          if (vv.scaleanchor) vv.scaleanchor = 'x' + sfx;
          Object.assign(layout[key], vv);
        } else layout[key] = v;
      }
    }
    if (result.stats && result.annotSR) parityResults.push({ name: label, sfx, ...result });
    if (result.fitAnnot) srParts.push(result.fitAnnot.sr);
  }

  applyRightAxis(layout, leftSeries, rightSeries, leftColor, rightColor, warnings);

  // Per-cell auto axis labels: first series in the cell, unless the plot's
  // labels are locked (locked labels apply to every cell — spike decision)
  if (grid) {
    const firstByCell = new Map();
    for (const s of appState.series) {
      if ((s.plotId ?? appState.plots[0].id) !== plot.id || s.enabled === false) continue;
      const { sfx } = cellOf(s);
      if (!firstByCell.has(sfx)) firstByCell.set(sfx, s);
    }
    for (const [sfx, s] of firstByCell) {
      // Per-cell axis labels (v2.22.0): a stored per-cell override wins, then a
      // locked plot-wide label, then the per-cell auto (first series' column).
      // The figure title stays plot-level; cell titles are added separately.
      const { r, c } = cellOf(s);
      const ov = plot.plotConfig.cells?.[`${r},${c}`] || {};
      layout['xaxis' + sfx].title.text = ov.xLabel || (plot.plotConfig.xLabelLocked ? plot.plotConfig.xLabel : (s.xCol || ''));
      layout['yaxis' + sfx].title.text = ov.yLabel || (plot.plotConfig.yLabelLocked ? plot.plotConfig.yLabel : (s.yCol || ''));
    }
  }

  // Multiple parity series: each computed its own equal-axis range and the
  // last one won, clipping the others — use the union (Phase 8 fix),
  // grouped per cell axis pair (Phase 10)
  const parityByCell = {};
  for (const p of parityResults) (parityByCell[p.sfx] ||= []).push(p);
  for (const [sfx, list] of Object.entries(parityByCell)) {
    if (list.length > 1) {
      const mn = Math.min(...list.map(p => p.axMin));
      const mx = Math.max(...list.map(p => p.axMax));
      layout['xaxis' + sfx].range = [mn, mx];
      layout['yaxis' + sfx].range = [mn, mx];
    }
  }

  // Axis sharing (Phase 10): non-parity cells match the first non-parity
  // cell's axes. Parity cells keep their equal-axis geometry — sharing
  // would break the y=x constraint (Data Scientist, spike decision).
  if (grid && (grid.shareX || grid.shareY)) {
    const paritySfx = new Set(parityResults.map(p => p.sfx));
    const allSfx = [];
    for (let k = 1; k <= grid.rows * grid.cols; k++) allSfx.push(k === 1 ? '' : String(k));
    const sharable = allSfx.filter(x => !paritySfx.has(x));
    if (paritySfx.size) {
      warnings.push({ name: 'Subplots', warning:
        'Parity cells keep equal axes and are excluded from axis sharing.' });
    }
    const anchor = sharable[0];
    for (const x of sharable.slice(1)) {
      if (grid.shareX) layout['xaxis' + x].matches = 'x' + anchor;
      if (grid.shareY) layout['yaxis' + x].matches = 'y' + anchor;
    }
  }

  applyLogInteractions(layout, plot, traces, warnings, parityByCell);

  // Mixed-scale warning (Data Scientist guardrail, v2.20.0): 2+ color-mapped
  // series on one plot using different colormaps or color ranges — identical
  // colors then don't mean identical values. Soft warning, never a block.
  // A plot colorbar override forces one shared scale + a single bar — that IS
  // the one-scale guarantee, so it satisfies (suppresses) the mixed-scale warning.
  if (sharedCb) suppressExtraColorbars(traces);
  const cbSeries = appState.series.filter(s =>
    (s.plotId ?? appState.plots[0].id) === plot.id && s.enabled !== false &&
    (s.chartType === 'contour' || s.chartType === 'heatmap' ||
     ((s.chartType === 'scatter' || s.chartType === 'parity') && s.colorCol)));
  if (!sharedCb && cbSeries.length > 1) {
    const maps   = new Set(cbSeries.map(s => effectiveColormap(s, plot)));
    const ranges = new Set(cbSeries.map(s => `${s.colorMin ?? ''}:${s.colorMax ?? ''}`));
    if (maps.size > 1 || ranges.size > 1) {
      warnings.push({ name: 'Colorbar', warning:
        'Multiple color-mapped series on this plot use different colormaps or ranges — identical colors may not mean identical values. Consider one colormap and range per plot.' });
    }
  }

  showPanelErrors(plot.id, errors, warnings);

  if (plot.plotConfig.statsShow !== false) appendParityStats(layout, parityResults, plot, srParts); // stats-box toggle (workspace ergonomics)
  appendNotes(layout, plot, pd, srParts);
  appendCellTitles(layout, plot, grid, srParts); // per-subplot titles (v2.22.0) — after notes so a stray drag is ignored
  applyColorbarFonts(traces); // colorbar title/ticks follow the typography sliders (Phase 16)

  const srEl = document.getElementById('plotSR-' + plot.id);
  if (srEl) srEl.textContent = srParts.join('; ');

  Plotly.react(pd, traces, layout, {
    responsive: true, // panels follow their grid cell
    displayModeBar: true,
    displaylogo: false,
    edits: { legendPosition: true, annotationPosition: true },
  });

  // Persist dragged legend(s) / annotations / zoom per panel (Phase 6+, now in
  // decorations.js — the §6 seam discharged at v2.22.0). Re-bound after
  // clearPanel replaces the node (guarded by pd._legendHooked inside).
  bindRelayoutPersistence(pd, plot);
}

// ── renderPairPlot — whole-plot SPLOM render path ─────────────────────────
// A pair plot owns the entire figure (its own N×N axis grid), so it bypasses
// the per-cell series loop, the subplot grid, and the axis remap. The renderer
// returns themed axes 1..N which we merge wholesale onto the base layout.
function renderPairPlot(plot, pd, series) {
  const errors = [], warnings = [];

  // A pair plot uses the whole panel — disclose any co-resident series that a
  // hand-edited session may have left on this plot (save-time blocks this; this
  // is the render-time backstop, §8 fail-closed).
  const others = appState.series.filter(s =>
    (s.plotId ?? appState.plots[0].id) === plot.id && s.enabled !== false && s.id !== series.id);
  if (others.length) warnings.push({ name: 'Pair plot',
    warning: `${others.length} other series on this plot ${others.length > 1 ? 'are' : 'is'} hidden — a pair plot uses the whole panel.` });

  // validateSeriesColumns self-heals pairCols (renderer drops missing); only a
  // removed dataset is fatal here.
  const result = buildSeriesResult(series, { xLog: false });
  if (result.error) {
    errors.push({ name: series.name, error: result.error });
    showPanelErrors(plot.id, errors, warnings);
    Plotly.react(pd, [], buildBaseLayout(plot), { responsive: true, displaylogo: false });
    return;
  }
  if (result.warning) warnings.push({ name: series.name, warning: result.warning });

  // Base layout carries the theme, title, legend, and typography; the single
  // xaxis/yaxis don't apply to a matrix (the renderer supplies xaxis..xaxisN).
  const layout = buildBaseLayout(plot);
  delete layout.xaxis; delete layout.yaxis;
  Object.assign(layout, result.layout);

  showPanelErrors(plot.id, errors, warnings);

  const srEl = document.getElementById('plotSR-' + plot.id);
  if (srEl) srEl.textContent = `Pair plot (scatterplot matrix): ${series.name}.`;

  Plotly.react(pd, result.traces, layout, {
    responsive: true, displayModeBar: true, displaylogo: false,
    edits: { legendPosition: true, annotationPosition: true },
  });
  bindRelayoutPersistence(pd, plot);
}

// Release every panel and return to the empty state (Phase 4 strategy:
// purge + node replacement, since scattergl retains buffers past purge)
function clearPlot() {
  appState.plots.forEach(p => clearPanel(p.id));
  appState.plotRendered = false;
  document.getElementById('plotGrid').classList.add('hidden');
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('downloadBtn').style.display    = 'none';
  document.getElementById('downloadSvgBtn').style.display = 'none';
  document.getElementById('exportDataBtn').style.display  = 'none';
  document.getElementById('exportAllBtn').style.display   = 'none';
}

// ── Per-panel errors ──────────────────────────────────────────────────────
// (auto-label helpers moved to layout.js at the Phase 10 exit refactor
// review — verbatim move; buildBaseLayout is their primary consumer)

function showPanelErrors(pid, errors, warnings = []) {
  const box = document.querySelector(`.plot-panel[data-pid="${pid}"] .panel-errors`);
  if (!box) return;
  // innerHTML: empty string — no user data
  if (!errors.length && !warnings.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  // escHtml applied to series names, error and warning messages — user data
  box.innerHTML =
    errors.map(e =>
      `<div class="render-error" role="alert"><strong>${escHtml(e.name)}:</strong> ${escHtml(e.error)}</div>`
    ).join('') +
    warnings.map(w =>
      `<div class="render-warning" role="alert"><strong>${escHtml(w.name)}:</strong> ${escHtml(w.warning)}</div>`
    ).join('');
  box.style.display = '';
}
