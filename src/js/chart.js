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
};

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

function buildSeriesResult(s) {
  const key = JSON.stringify(s)
    + '|' + datasetRev(s.datasetId)
    + (s.joinDatasetId ? '|' + datasetRev(s.joinDatasetId) : '')
    + '|' + globalStyleKey();
  const cached = _traceCache.get(s.id);
  if (cached && cached.key === key) return cached.result;
  const result = RENDERERS[s.chartType](s, appState.datasets);
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

  for (const s of appState.series) {
    if ((s.plotId ?? appState.plots[0].id) !== plot.id) continue;
    if (s.enabled === false) continue;
    if (!RENDERERS[s.chartType]) continue;

    // Clear error for missing column refs (e.g. after a dataset reload)
    const missing = validateSeriesColumns(s, appState.datasets);
    if (missing.length) {
      errors.push({ name: s.name, error: `references missing ${missing.join(', ')} — edit the series or reload the original CSV` });
      continue;
    }

    const result = buildSeriesResult(s);
    if (result.error) { errors.push({ name: s.name, error: result.error }); continue; }
    if (result.warning) warnings.push({ name: s.name, warning: result.warning });

    traces.push(...result.traces);

    if (result.layout) {
      // Merge axis overrides INTO the styled axis objects — a wholesale
      // Object.assign replaced layout.xaxis/yaxis from buildBaseLayout,
      // silently dropping titles, fonts, and frame styling on parity plots
      // (Phase 8 fix)
      for (const [k, v] of Object.entries(result.layout)) {
        if ((k === 'xaxis' || k === 'yaxis') && layout[k]) Object.assign(layout[k], v);
        else layout[k] = v;
      }
    }
    if (result.stats && result.annotSR) parityResults.push({ name: s.name, ...result });
    if (result.fitAnnot) srParts.push(result.fitAnnot.sr);
  }

  // Multiple parity series: each computed its own equal-axis range and the
  // last one won, clipping the others — use the union (Phase 8 fix)
  if (parityResults.length > 1) {
    const mn = Math.min(...parityResults.map(p => p.axMin));
    const mx = Math.max(...parityResults.map(p => p.axMax));
    layout.xaxis.range = [mn, mx];
    layout.yaxis.range = [mn, mx];
  }

  // Log-axis interactions (Phase 9, Data Scientist rulings)
  const cfg = plot.plotConfig;
  if (cfg.xLog || cfg.yLog) {
    if (cfg.xLog && plotSeries(plot).some(s => s.chartType === 'histogram' && s.enabled !== false)) {
      warnings.push({ name: 'Log X', warning:
        'Histograms bin in linear space — Log X is ignored for this plot (Log Y works).' });
    }
    // Plotly silently drops non-positive values on a log axis — surface it
    let nx = 0, ny = 0;
    for (const t of traces) {
      if (cfg.xLog && Array.isArray(t.x)) nx += t.x.filter(v => typeof v === 'number' && v <= 0).length;
      if (cfg.yLog && Array.isArray(t.y)) ny += t.y.filter(v => typeof v === 'number' && v <= 0).length;
    }
    if (nx) warnings.push({ name: 'Log X', warning: `${nx} non-positive value(s) cannot be shown on a log X axis.` });
    if (ny) warnings.push({ name: 'Log Y', warning: `${ny} non-positive value(s) cannot be shown on a log Y axis.` });

    // Parity ranges are linear data units; Plotly log ranges are log10.
    // Equal axes stay equal in log-log; anything else renders linear.
    // Range re-derived from the UNPADDED data extremes and padded in log
    // space — the linear 5% pad goes negative even for positive data.
    if (parityResults.length) {
      const dmn = Math.min(...parityResults.map(p => p.dataMin));
      const dmx = Math.max(...parityResults.map(p => p.dataMax));
      if (cfg.xLog && cfg.yLog && dmn > 0) {
        const lo = Math.log10(dmn), hi = Math.log10(dmx);
        const pad = (hi - lo) * 0.05 || 0.05;
        layout.xaxis.range = [lo - pad, hi + pad];
        layout.yaxis.range = [lo - pad, hi + pad];
      } else {
        layout.xaxis.type = 'linear';
        layout.yaxis.type = 'linear';
        warnings.push({ name: 'Parity', warning:
          'A parity plot needs BOTH Log X and Log Y and all-positive data — rendered linear.' });
      }
    }
  }

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

// ── Auto-label helpers (per the ACTIVE plot's inputs) ─────────────────────

function plotSeries(plot) {
  return appState.series.filter(s => (s.plotId ?? appState.plots[0].id) === plot.id);
}

function autoTitle(plot) {
  const list = plotSeries(plot);
  if (!list.length) return plot.name;
  const types = [...new Set(list.map(s => s.chartType))];
  return types.length === 1
    ? `${types[0].charAt(0).toUpperCase() + types[0].slice(1)} plot`
    : 'Multi-series plot';
}
function autoXLabel(plot) { return plotSeries(plot)[0]?.xCol || ''; }
function autoYLabel(plot) { return plotSeries(plot)[0]?.yCol || ''; }

// Inputs mirror the ACTIVE plot; unlocked fields track their auto values
function syncAutoLabels() {
  const plot = activePlot(), cfg = plot.plotConfig;
  if (!cfg.titleLocked)  { cfg.title  = autoTitle(plot);  document.getElementById('inputTitle').value  = cfg.title; }
  if (!cfg.xLabelLocked) { cfg.xLabel = autoXLabel(plot); document.getElementById('inputXLabel').value = cfg.xLabel; }
  if (!cfg.yLabelLocked) { cfg.yLabel = autoYLabel(plot); document.getElementById('inputYLabel').value = cfg.yLabel; }
}

// ── Per-panel errors ──────────────────────────────────────────────────────

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
