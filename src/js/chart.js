// chart.js — renderPlot dispatcher (per-plot, Phase 7) and trace cache
// (theme + base layout live in layout.js; PNG/ZIP export in export.js)

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
};

// (series14RightOk / applyRightAxis / appendNotes live in decorations.js —
// Phase 14 exit refactor review)

// ── Trace cache (Phase 2, Performance) ────────────────────────────────────
//
// Keyed per series id; the key captures everything a trace depends on:
// the series definition itself, the revision of every dataset it reads,
// and the global style panel values that buildMarkerStyle consumes.
// A style-only re-render reuses every cached trace.

const _traceCache = new Map(); // series.id → { key, result }

function globalStyleKey() {
  return ['markerSize', 'markerOpacity', 'edgeColor', 'edgeWidth', 'cmapSelect']
    .map(id => document.getElementById(id)?.value ?? '')
    .join('|');
}

function buildSeriesResult(s, ctx) {
  const key = JSON.stringify(s)
    + '|' + datasetRev(s.datasetId)
    + (s.joinDatasetId ? '|' + datasetRev(s.joinDatasetId) : '')
    + '|' + globalStyleKey()
    + '|x' + (ctx?.xLog ? 1 : 0); // plot context affects histogram binning (Phase 13)
  const cached = _traceCache.get(s.id);
  if (cached && cached.key === key) return cached.result;
  const result = RENDERERS[s.chartType](s, appState.datasets, ctx);
  _traceCache.set(s.id, { key, result });
  return result;
}

// ── renderPlot — renders the whole grid ───────────────────────────────────

function renderPlot() {
  // Prune cache entries for deleted series BEFORE the empty return —
  // deleting the last series must release its cached traces (Phase 4)
  for (const id of [..._traceCache.keys()]) {
    if (!appState.series.some(s => s.id === id)) _traceCache.delete(id);
  }

  if (!appState.series.length) {
    if (appState.plotRendered) clearPlot(); // everything deleted → release all panels
    return;
  }

  renderPlotGrid(); // panels exist before plotting into them

  for (const plot of appState.plots) renderOnePlot(plot);

  appState.plotRendered = true;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('plotGrid').classList.remove('hidden');
  document.getElementById('downloadBtn').style.display    = '';
  document.getElementById('downloadSvgBtn').style.display = '';
  // Export all only earns its place with 2+ panels (1 panel = same as ↓ PNG)
  document.getElementById('exportAllBtn').style.display = appState.plots.length > 1 ? '' : 'none';
  document.getElementById('savedStrip').style.display  = appState.savedPlots.filter(Boolean).length ? '' : 'none';
  document.getElementById('saveBtn').style.display     = '';
  syncAutoLabels();
}

function renderOnePlot(plot) {
  const pd = plotDivFor(plot.id);
  if (!pd) return;

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

  for (const s of appState.series) {
    if ((s.plotId ?? appState.plots[0].id) !== plot.id) continue;
    if (s.enabled === false) continue;
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

    const result = buildSeriesResult(s, { xLog: !!plot.plotConfig.xLog });
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
      // The figure title stays plot-level; only axis labels are per-cell
      if (!plot.plotConfig.xLabelLocked) layout['xaxis' + sfx].title.text = s.xCol || '';
      if (!plot.plotConfig.yLabelLocked) layout['yaxis' + sfx].title.text = s.yCol || '';
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

  showPanelErrors(plot.id, errors, warnings);

  // Stats annotations — one per parity series, stacked; single parity keeps
  // its draggable stored position
  if (parityResults.length) {
    const fmt = v => isNaN(v) ? 'N/A' : Number(v).toPrecision(4);
    const th  = plotTheme();
    const single = parityResults.length === 1;
    const base = single ? (plot.plotConfig.annotPos ?? { x: 0.98, y: 0.04 })
                        : { x: 0.98, y: 0.04 };
    layout.annotations = parityResults.map((p, i) => ({
      x: base.x, y: base.y + i * 0.24,
      xref: 'paper', yref: 'paper',
      xanchor: base.x > 0.5 ? 'right' : 'left',
      yanchor: base.y < 0.5 ? 'bottom' : 'top',
      // Series names are user data — escHtml applied (Plotly pseudo-HTML)
      text: (single ? '' : `<b>${escHtml(p.name)}</b><br>`)
        + `NSE = ${fmt(p.stats.nse)}<br>MAE = ${fmt(p.stats.mae)}<br>RMSE = ${fmt(p.stats.rmse)}<br>N = ${p.n}`,
      showarrow: false,
      bgcolor: th.annotBg,
      bordercolor: th.annotBorder, borderwidth: 1, borderpad: 8,
      font: { family: 'JetBrains Mono,monospace',
              size: parseFloat(document.getElementById('fsAnnot')?.value) || 11,
              color: th.title },
      align: 'left',
    }));
    parityResults.forEach(p => srParts.unshift(
      `${p.name} statistics: NSE=${fmt(p.stats.nse)}, MAE=${fmt(p.stats.mae)}, RMSE=${fmt(p.stats.rmse)}, N=${p.n}`
    ));
  }

  appendNotes(layout, plot, pd, srParts);
  applyColorbarFonts(traces); // colorbar title/ticks follow the typography sliders (Phase 16)

  const srEl = document.getElementById('plotSR-' + plot.id);
  if (srEl) srEl.textContent = srParts.join('; ');

  Plotly.react(pd, traces, layout, {
    responsive: true, // panels follow their grid cell
    displayModeBar: true,
    displaylogo: false,
    edits: { legendPosition: true, annotationPosition: true },
  });

  // Persist a dragged legend per plot (Phase 6 behavior, now per panel).
  // Re-bound after clearPanel because that replaces the node.
  if (!pd._legendHooked) {
    pd.on('plotly_relayout', e => {
      if (e['legend.x'] !== undefined || e['legend.y'] !== undefined) {
        plot.plotConfig.legendPos = {
          x: e['legend.x'] ?? plot.plotConfig.legendPos?.x ?? 0.01,
          y: e['legend.y'] ?? plot.plotConfig.legendPos?.y ?? 0.99,
        };
      }
      // Dragged notes persist (Phase 14): indices past _noteOffset are notes
      for (const k of Object.keys(e)) {
        const m = /^annotations\[(\d+)\]\.(x|y)$/.exec(k);
        if (!m) continue;
        const idx = parseInt(m[1]) - (pd._noteOffset ?? 0);
        const ns = plot.plotConfig.notes ?? [];
        if (idx >= 0 && idx < ns.length) ns[idx][m[2]] = e[k];
      }
    });
    pd._legendHooked = true;
  }
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
