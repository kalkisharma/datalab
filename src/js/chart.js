// chart.js — renderPlot dispatcher, trace cache, layout, and plot theme
// (PNG/ZIP export lives in export.js)

const RENDERERS = {
  scatter:   buildScatterTrace,
  line:      buildLineTrace,
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
// A style-only re-render (figure size, gridlines, labels) reuses every
// cached trace and pays only the Plotly.react cost.

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

// ── renderPlot ────────────────────────────────────────────────────────────

function renderPlot() {
  // Prune cache entries for deleted series BEFORE the empty-list return —
  // deleting the last series must release its cached traces (Phase 4
  // memory profile found ~160 MB stranded here at 1M rows × 10 series)
  for (const id of [..._traceCache.keys()]) {
    if (!appState.series.some(s => s.id === id)) _traceCache.delete(id);
  }

  if (!appState.series.length) {
    if (appState.plotRendered) clearPlot(); // last series deleted → release everything
    return;
  }

  const traces   = [];
  const errors   = [];
  const warnings = [];
  let   layout   = buildBaseLayout();
  const parityResults = []; // one entry per parity series — all annotated, not just the last
  const srParts = [];       // screen-reader mirror lines (parity stats, normal fits)

  for (const s of appState.series) {
    if (s.enabled === false) continue; // hidden via series list toggle
    if (!RENDERERS[s.chartType]) continue;

    // Clear error for missing column refs (e.g. after a dataset reload)
    // instead of the all-NaN fallthrough the renderer would produce
    const missing = validateSeriesColumns(s, appState.datasets);
    if (missing.length) {
      errors.push({ name: s.name, error: `references missing ${missing.join(', ')} — edit the series or reload the original CSV` });
      continue;
    }

    const result = buildSeriesResult(s);
    if (result.error) { errors.push({ name: s.name, error: result.error }); continue; }
    if (result.warning) warnings.push({ name: s.name, warning: result.warning });

    traces.push(...result.traces);

    // Parity renderers return extra layout (equal axes) and stats annotation
    if (result.layout) Object.assign(layout, result.layout);
    if (result.stats && result.annotSR) parityResults.push({ name: s.name, ...result });
    if (result.fitAnnot) srParts.push(result.fitAnnot.sr); // histogram normal fit
  }

  showRenderErrors(errors, warnings);
  // Empty traces still render (blank axes) — toggling every series off should
  // visibly empty the plot, not silently keep the stale one

  // Stats annotations — one per parity series, stacked bottom-right.
  // (Phase 4 fix for the Phase 2/3 known issue: previously only the last
  // parity series was annotated.) A single parity keeps the draggable
  // stored position; multiples use fixed stacking so they never overlap.
  if (parityResults.length) {
    const fmt = v => isNaN(v) ? 'N/A' : Number(v).toPrecision(4);
    const th  = plotTheme();
    const single = parityResults.length === 1;
    const base = single ? (appState.plotConfig.annotPos ?? { x: 0.98, y: 0.04 })
                        : { x: 0.98, y: 0.04 };
    layout.annotations = parityResults.map((p, i) => ({
      x: base.x, y: base.y + i * 0.24,
      xref: 'paper', yref: 'paper',
      xanchor: base.x > 0.5 ? 'right' : 'left',
      yanchor: base.y < 0.5 ? 'bottom' : 'top',
      // Plotly annotation text is rendered as restricted pseudo-HTML; series
      // names are user data — escHtml applied. Stats are computed numerics.
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

  // Mirror for screen readers (.sr-only span, aria-live) — parity stats and
  // histogram normal fits together; cleared when none apply
  const srEl = document.getElementById('plotAnnotSR');
  if (srEl) srEl.textContent = srParts.join('; ');

  Plotly.react('plotDiv', traces, layout, {
    responsive: false,
    displayModeBar: true,
    displaylogo: false,
    edits: { legendPosition: true, annotationPosition: true },
  });

  // Persist a dragged legend so re-renders stop snapping it back to the
  // default corner (Phase 6). Hook survives react; re-bound after clearPlot
  // because that replaces the node.
  const pd = document.getElementById('plotDiv');
  if (!pd._legendHooked) {
    pd.on('plotly_relayout', e => {
      if (e['legend.x'] !== undefined || e['legend.y'] !== undefined) {
        appState.plotConfig.legendPos = {
          x: e['legend.x'] ?? appState.plotConfig.legendPos?.x ?? 0.01,
          y: e['legend.y'] ?? appState.plotConfig.legendPos?.y ?? 0.99,
        };
      }
    });
    pd._legendHooked = true;
  }

  appState.plotRendered = true;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('plotArea').classList.remove('hidden');
  document.getElementById('downloadBtn').style.display    = '';
  document.getElementById('downloadSvgBtn').style.display = '';
  document.getElementById('savedStrip').style.display  = appState.savedPlots.filter(Boolean).length ? '' : 'none';
  document.getElementById('saveBtn').style.display     = '';
  syncTitle(); syncXLabel(); syncYLabel();
}

// Fully release the plot and return to the empty state. Plotly.purge alone
// is not enough: scattergl retains WebGL buffers bound to the node past
// purge (Phase 4 memory profile measured ~150 MB stranded at 1M rows ×
// 10 series) — replacing the node is the reliable release.
function clearPlot() {
  const pd = document.getElementById('plotDiv');
  try { Plotly.purge(pd); } catch (e) { /* nothing rendered */ }
  pd.replaceWith(pd.cloneNode(false)); // keeps id/attrs, drops gl context
  appState.plotRendered = false;
  document.getElementById('plotArea').classList.add('hidden');
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('downloadBtn').style.display    = 'none';
  document.getElementById('downloadSvgBtn').style.display = 'none';
  const srEl = document.getElementById('plotAnnotSR');
  if (srEl) srEl.textContent = '';
}

// Foreground palette adapts to the user-chosen plot background: light
// backgrounds (default white) get dark grid/text, dark backgrounds get the
// app's dark-theme set. Driven by relative luminance of the bg color.
function isDarkColor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return false; // type="color" inputs always yield #rrggbb; default light
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

function plotTheme() {
  const bg = document.getElementById('plotBg')?.value ?? '#ffffff';
  return isDarkColor(bg)
    ? { bg, grid: '#2e2e3e', minor: '#1e1e28', axis: '#3a3a4e',
        tick: '#9090a8', text: '#e2e2ec', title: '#e2e2ec', axisTitle: '#9090a8',
        legendBg: 'rgba(19,19,26,0.9)', legendBorder: '#2e2e3e',
        annotBg: 'rgba(19,19,26,0.88)', annotBorder: '#3a3a4e' }
    : { bg, grid: '#e0e0e0', minor: '#f0f0f0', axis: '#aaaaaa',
        tick: '#222222', text: '#333333', title: '#111111', axisTitle: '#222222',
        legendBg: 'rgba(255,255,255,0.9)', legendBorder: '#cccccc',
        annotBg: 'rgba(255,255,255,0.88)', annotBorder: '#aaaaaa' };
}

function buildBaseLayout() {
  const cfg  = appState.plotConfig;
  const iv = (id, dflt) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : dflt; };
  const figW = iv('figW', 700), figH = iv('figH', 500);
  const showMaj = document.getElementById('majorGrid')?.checked ?? true;
  const showMin = document.getElementById('minorGrid')?.checked ?? false;
  const th = plotTheme();

  // Plot typography (Phase 6 — completes the Phase 1 deliverable)
  const fsT = iv('fsTitle', 14), fsA = iv('fsAxis', 12), fsTk = iv('fsTick', 10);
  const fsL = iv('fsLegend', 11);

  // Frame controls: "auto" follows the background-luminance theme; an
  // explicit value overrides until the auto box is re-checked
  const frameAuto  = document.getElementById('frameAuto')?.checked ?? true;
  const gridAuto   = document.getElementById('gridAuto')?.checked  ?? true;
  const frameColor = frameAuto ? th.axis : (document.getElementById('frameColor')?.value ?? th.axis);
  const gridColor  = gridAuto  ? th.grid : (document.getElementById('gridColor')?.value  ?? th.grid);
  const frameWidth = iv('frameWidth', 1);
  const gridWidth  = iv('gridWidth', 1);

  const xRange = getManualRange('xMin', 'xMax');
  const yRange = getManualRange('yMin', 'yMax');

  const axisBase = {
    showgrid: showMaj, gridcolor: showMaj ? gridColor : 'rgba(0,0,0,0)', gridwidth: gridWidth,
    minor: { showgrid: showMin, gridcolor: th.minor, gridwidth: Math.max(0.5, gridWidth / 2) },
    zerolinecolor: frameColor, zerolinewidth: frameWidth,
    linecolor: frameColor, linewidth: frameWidth, mirror: true,
    tickfont: { family: 'JetBrains Mono,monospace', size: fsTk, color: th.tick },
    tickcolor: frameColor,
  };

  // Dragged legend position persists in state (plotly_relayout hook below);
  // default is top-left
  const legendPos = cfg.legendPos ?? { x: 0.01, y: 0.99 };

  return {
    paper_bgcolor: th.bg, plot_bgcolor: th.bg,
    width: figW, height: figH,
    font: { family: 'IBM Plex Sans,system-ui,sans-serif', color: th.text, size: 12 },
    showlegend: cfg.legendShow ?? true,
    title: {
      text: cfg.titleLocked ? document.getElementById('inputTitle').value : autoTitle(),
      x: 0.5, xanchor: 'center', xref: 'paper',
      font: { size: fsT, color: th.title },
    },
    xaxis: {
      ...axisBase,
      range: xRange,
      title: {
        text: cfg.xLabelLocked ? document.getElementById('inputXLabel').value : autoXLabel(),
        font: { size: fsA, color: th.axisTitle },
      },
    },
    yaxis: {
      ...axisBase,
      range: yRange,
      title: {
        text: cfg.yLabelLocked ? document.getElementById('inputYLabel').value : autoYLabel(),
        font: { size: fsA, color: th.axisTitle },
      },
    },
    legend: {
      font: { size: fsL, color: th.text },
      bgcolor: th.legendBg, bordercolor: th.legendBorder, borderwidth: 1,
      x: legendPos.x, y: legendPos.y, xanchor: 'left', yanchor: 'top',
    },
    // Margins scale with the fonts so large labels are not clipped on export
    margin: {
      l: Math.round(28 + fsA + fsTk * 2.4), r: 30,
      t: Math.round(20 + fsT * 2), b: Math.round(24 + fsA + fsTk * 2),
    },
  };
}

function getManualRange(minId, maxId) {
  const mn = document.getElementById(minId)?.value;
  const mx = document.getElementById(maxId)?.value;
  if (mn === '' && mx === '') return undefined;
  return [mn === '' ? null : parseFloat(mn), mx === '' ? null : parseFloat(mx)];
}

// ── Auto-label helpers ────────────────────────────────────────────────────

function autoTitle() {
  if (!appState.series.length) return 'DataLab';
  const types = [...new Set(appState.series.map(s => s.chartType))];
  return types.length === 1
    ? `${types[0].charAt(0).toUpperCase()+types[0].slice(1)} plot`
    : 'Multi-series plot';
}
function autoXLabel() {
  const s = appState.series[0];
  return s?.xCol || '';
}
function autoYLabel() {
  const s = appState.series[0];
  return s?.yCol || '';
}
function syncTitle()  {
  if (!appState.plotConfig.titleLocked)
    document.getElementById('inputTitle').value = autoTitle();
}
function syncXLabel() {
  if (!appState.plotConfig.xLabelLocked)
    document.getElementById('inputXLabel').value = autoXLabel();
}
function syncYLabel() {
  if (!appState.plotConfig.yLabelLocked)
    document.getElementById('inputYLabel').value = autoYLabel();
}

// ── Render errors display ─────────────────────────────────────────────────

function showRenderErrors(errors, warnings = []) {
  const box = document.getElementById('renderErrors');
  // innerHTML: empty string — no user data
  if (!errors.length && !warnings.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  // escHtml applied to series names, error and warning messages — all may contain user data
  box.innerHTML =
    errors.map(e =>
      `<div class="render-error" role="alert"><strong>${escHtml(e.name)}:</strong> ${escHtml(e.error)}</div>`
    ).join('') +
    warnings.map(w =>
      `<div class="render-warning" role="alert"><strong>${escHtml(w.name)}:</strong> ${escHtml(w.warning)}</div>`
    ).join('');
  box.style.display = '';
}
