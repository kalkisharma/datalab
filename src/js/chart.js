// chart.js — renderPlot dispatcher, PNG export, and ZIP export

const RENDERERS = {
  scatter:   buildScatterTrace,
  line:      buildLineTrace,
  parity:    buildParityTrace,
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
  if (!appState.series.length) return;

  // Prune cache entries for deleted series
  for (const id of [..._traceCache.keys()]) {
    if (!appState.series.some(s => s.id === id)) _traceCache.delete(id);
  }

  const traces  = [];
  const errors  = [];
  let   layout  = buildBaseLayout();
  let   parityAnnot = null;

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

    traces.push(...result.traces);

    // Parity renderers return extra layout (equal axes) and stats annotation
    if (result.layout) Object.assign(layout, result.layout);
    if (result.stats && result.annotSR) parityAnnot = result;
  }

  showRenderErrors(errors);
  // Empty traces still render (blank axes) — toggling every series off should
  // visibly empty the plot, not silently keep the stale one

  // Stats annotation for parity
  if (parityAnnot) {
    const { stats, axMin, axMax, n } = parityAnnot;
    const fmt = v => isNaN(v) ? 'N/A' : Number(v).toPrecision(4);
    const annotPos = appState.plotConfig.annotPos ?? { x: 0.98, y: 0.04 };
    layout.annotations = [{
      x: annotPos.x, y: annotPos.y,
      xref: 'paper', yref: 'paper',
      xanchor: annotPos.x > 0.5 ? 'right' : 'left',
      yanchor: annotPos.y < 0.5 ? 'bottom' : 'top',
      // escHtml not needed here — these are computed numeric strings, not user input
      text: `NSE = ${fmt(stats.nse)}<br>MAE = ${fmt(stats.mae)}<br>RMSE = ${fmt(stats.rmse)}<br>N = ${n}`,
      showarrow: false,
      bgcolor: plotTheme().annotBg,
      bordercolor: plotTheme().annotBorder, borderwidth: 1, borderpad: 8,
      font: { family: 'JetBrains Mono,monospace', size: 11, color: plotTheme().title },
      align: 'left',
    }];
    // Update .sr-only annotation span for screen reader accessibility
    const srEl = document.getElementById('plotAnnotSR');
    if (srEl) {
      // escHtml applied to stats text — fmt() produces numeric strings (safe),
      // but escHtml ensures safety if format ever changes
      srEl.textContent = `Plot statistics: NSE=${fmt(stats.nse)}, MAE=${fmt(stats.mae)}, RMSE=${fmt(stats.rmse)}, N=${n}`;
    }
  }

  Plotly.react('plotDiv', traces, layout, {
    responsive: false,
    displayModeBar: true,
    displaylogo: false,
    edits: { legendPosition: true, annotationPosition: true },
  });

  appState.plotRendered = true;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('plotArea').classList.remove('hidden');
  document.getElementById('downloadBtn').style.display = '';
  document.getElementById('savedStrip').style.display  = appState.savedPlots.filter(Boolean).length ? '' : 'none';
  document.getElementById('saveBtn').style.display     = '';
  syncTitle(); syncXLabel(); syncYLabel();
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
  const figW = parseInt(document.getElementById('figW')?.value  ?? 700);
  const figH = parseInt(document.getElementById('figH')?.value  ?? 500);
  const showMaj = document.getElementById('majorGrid')?.checked ?? true;
  const showMin = document.getElementById('minorGrid')?.checked ?? false;
  const th = plotTheme();

  const xRange = getManualRange('xMin', 'xMax');
  const yRange = getManualRange('yMin', 'yMax');

  const axisBase = {
    showgrid: showMaj, gridcolor: showMaj ? th.grid : 'rgba(0,0,0,0)', gridwidth: 1,
    minor: { showgrid: showMin, gridcolor: th.minor, gridwidth: 0.5 },
    zerolinecolor: th.axis, zerolinewidth: 1,
    linecolor: th.axis, linewidth: 1, mirror: true,
    tickfont: { family: 'JetBrains Mono,monospace', size: 10, color: th.tick },
    tickcolor: th.axis,
  };

  return {
    paper_bgcolor: th.bg, plot_bgcolor: th.bg,
    width: figW, height: figH,
    font: { family: 'IBM Plex Sans,system-ui,sans-serif', color: th.text, size: 12 },
    title: {
      text: cfg.titleLocked ? document.getElementById('inputTitle').value : autoTitle(),
      x: 0.5, xanchor: 'center', xref: 'paper',
      font: { size: 14, color: th.title },
    },
    xaxis: {
      ...axisBase,
      range: xRange,
      title: {
        text: cfg.xLabelLocked ? document.getElementById('inputXLabel').value : autoXLabel(),
        font: { size: 12, color: th.axisTitle },
      },
    },
    yaxis: {
      ...axisBase,
      range: yRange,
      title: {
        text: cfg.yLabelLocked ? document.getElementById('inputYLabel').value : autoYLabel(),
        font: { size: 12, color: th.axisTitle },
      },
    },
    legend: {
      font: { size: 11, color: th.text },
      bgcolor: th.legendBg, bordercolor: th.legendBorder, borderwidth: 1,
      x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top',
    },
    margin: { l: 60, r: 30, t: 50, b: 60 },
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

function showRenderErrors(errors) {
  const box = document.getElementById('renderErrors');
  // innerHTML: empty string — no user data
  if (!errors.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  // escHtml applied to series name and error message — both may contain user data
  box.innerHTML = errors.map(e =>
    `<div class="render-error" role="alert"><strong>${escHtml(e.name)}:</strong> ${escHtml(e.error)}</div>`
  ).join('');
  box.style.display = '';
}

// ── Export ────────────────────────────────────────────────────────────────

function downloadPlot() {
  const title    = document.getElementById('inputTitle').value || 'datalab_plot';
  const filename = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'datalab_plot';
  const w = parseInt(document.getElementById('figW').value);
  const h = parseInt(document.getElementById('figH').value);
  Plotly.downloadImage('plotDiv', { format: 'png', width: w, height: h, filename });
}

async function downloadZip() {
  const plots = appState.savedPlots.filter(Boolean);
  const btn   = document.getElementById('zipBtn');
  if (!plots.length) {
    btn.textContent = 'Nothing saved';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = '↓ ZIP'; btn.disabled = false; }, 2000);
    return;
  }
  const orig = btn.textContent;
  btn.disabled = true;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(div);
  let exportErr = false;
  try {
    const zip = new JSZip();
    for (let i = 0; i < plots.length; i++) {
      btn.textContent = `${i + 1}/${plots.length}…`;
      const snap = plots[i];
      const w = snap.layout.width || 700, h = snap.layout.height || 500;
      div.style.width = w + 'px'; div.style.height = h + 'px';
      await Plotly.newPlot(div, snap.data, snap.layout, { staticPlot: true, displayModeBar: false });
      const url    = await Plotly.toImage(div, { format: 'png', width: w, height: h });
      const base64 = url.split(',')[1];
      const name   = (snap.title || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || `plot_${i + 1}`;
      zip.file(`${String(i + 1).padStart(2, '0')}_${name}.png`, base64, { base64: true });
      Plotly.purge(div);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'datalab_plots.zip'; a.click();
    URL.revokeObjectURL(url); // safe to revoke immediately — browser handles download async
  } catch (e) {
    console.error('ZIP export failed:', e); exportErr = true;
  } finally {
    div.remove(); btn.disabled = false;
    if (exportErr) { btn.textContent = 'Export failed'; setTimeout(() => { btn.textContent = orig; }, 3000); }
    else btn.textContent = orig;
  }
}
