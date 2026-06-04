// layout.js — plot theme (background-luminance adaptive) and base layout
// (split from chart.js at the Phase 6 exit refactor review — verbatim move)

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

function buildBaseLayout(plot) {
  // Per-plot config (Phase 7); inputs in the left panel mirror the ACTIVE
  // plot, but every plot renders from its own stored config
  const cfg  = plot.plotConfig;
  const iv = (id, dflt) => { const v = parseFloat(document.getElementById(id)?.value); return Number.isFinite(v) ? v : dflt; };
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

  // Manual axis ranges live in the plot's config ('' = auto)
  const rng = (mn, mx) => (cfg[mn] === '' && cfg[mx] === '') ? undefined
    : [cfg[mn] === '' ? null : parseFloat(cfg[mn]), cfg[mx] === '' ? null : parseFloat(cfg[mx])];
  const xRange = rng('xMin', 'xMax');
  const yRange = rng('yMin', 'yMax');

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
    autosize: true, // panels fill their grid cell; Figure size = export size
    font: { family: 'IBM Plex Sans,system-ui,sans-serif', color: th.text, size: 12 },
    showlegend: cfg.legendShow ?? true,
    title: {
      text: cfg.titleLocked ? cfg.title : autoTitle(plot),
      x: 0.5, xanchor: 'center', xref: 'paper',
      font: { size: fsT, color: th.title },
    },
    xaxis: {
      ...axisBase,
      range: xRange,
      title: {
        text: cfg.xLabelLocked ? cfg.xLabel : autoXLabel(plot),
        font: { size: fsA, color: th.axisTitle },
      },
    },
    yaxis: {
      ...axisBase,
      range: yRange,
      title: {
        text: cfg.yLabelLocked ? cfg.yLabel : autoYLabel(plot),
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
