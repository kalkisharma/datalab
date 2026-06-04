// grid.js — multi-plot live grid: panel lifecycle, active plot, layout (Phase 7)

function activePlot() {
  return appState.plots.find(p => p.id === appState.activePlotId) ?? appState.plots[0];
}

function activePlotDiv() {
  return document.getElementById('plotDiv-' + activePlot().id);
}

function plotDivFor(pid) {
  return document.getElementById('plotDiv-' + pid);
}

// ── Grid rendering ────────────────────────────────────────────────────────
// Reconciles panels against appState.plots WITHOUT rebuilding existing
// panel DOM — destroying a panel's .panel-plot node would kill its live
// Plotly instance on every chrome update.

function renderPlotGrid() {
  const grid = document.getElementById('plotGrid');

  // Remove panels whose plot is gone
  grid.querySelectorAll('.plot-panel').forEach(panel => {
    if (!appState.plots.some(p => p.id === panel.dataset.pid)) panel.remove();
  });

  // Create missing panels, update names/active state on existing ones
  appState.plots.forEach(p => {
    let panel = grid.querySelector(`.plot-panel[data-pid="${p.id}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'plot-panel';
      panel.dataset.pid = p.id;
      // innerHTML: plot name escaped via escHtml() — user-editable string
      panel.innerHTML = `
        <div class="panel-header">
          <input class="panel-name" type="text" value="${escHtml(p.name)}" aria-label="Plot name" />
          <button class="panel-del" aria-label="Delete plot ${escHtml(p.name)}" title="Delete plot">×</button>
        </div>
        <div class="panel-errors"></div>
        <div class="panel-plot" id="plotDiv-${p.id}"></div>
        <span class="sr-only" id="plotSR-${p.id}" aria-live="polite"></span>`;
      panel.addEventListener('click', e => {
        // Activating must not steal interactions inside the Plotly canvas
        if (!e.target.closest('.panel-plot')) setActivePlot(p.id);
      });
      panel.querySelector('.panel-plot').addEventListener('mousedown', () => setActivePlot(p.id));
      panel.querySelector('.panel-name').addEventListener('input', e => { p.name = e.target.value || 'Plot'; });
      panel.querySelector('.panel-del').addEventListener('click', e => { e.stopPropagation(); deletePlot(p.id); });
      grid.appendChild(panel);
    } else {
      const nameEl = panel.querySelector('.panel-name');
      if (nameEl.value !== p.name && document.activeElement !== nameEl) nameEl.value = p.name;
    }
    panel.classList.toggle('active', p.id === appState.activePlotId);
    panel.setAttribute('aria-label', `Plot panel ${p.name}${p.id === appState.activePlotId ? ', active' : ''}`);
  });

  // Auto columns: 1 → full width, 2 → side by side, 3-4 → 2×2, 5+ → 3 cols
  const n = appState.plots.length;
  grid.className = 'plot-grid cols-' + (n <= 1 ? 1 : n <= 4 ? 2 : 3);
  if (n > 6) {
    const box = document.getElementById('dataAlerts');
    // innerHTML: static text — no user data
    if (box && !box.textContent.includes('plots is a lot')) {
      // innerHTML: static literal text only — no user data
      box.innerHTML += '<div class="alert warn" role="alert">More than 6 plots is a lot for one screen — consider sessions for separate analyses.</div>';
    }
  }

  // Column changes resize every live panel
  appState.plots.forEach(p => {
    const pd = plotDivFor(p.id);
    if (pd && pd.data) { try { Plotly.Plots.resize(pd); } catch (e) {} }
  });
}

// ── Active plot ───────────────────────────────────────────────────────────
// The Plot settings panel edits the active plot; switching syncs inputs.

function setActivePlot(pid) {
  if (appState.activePlotId === pid) return;
  appState.activePlotId = pid;
  syncActivePlotInputs();
  renderPlotGrid();
}

function syncActivePlotInputs() {
  const cfg = activePlot().plotConfig;
  const g = id => document.getElementById(id);
  g('activePlotLabel').textContent = `Editing: ${activePlot().name}`;
  g('inputTitle').value  = cfg.title  || '';
  g('inputXLabel').value = cfg.xLabel || '';
  g('inputYLabel').value = cfg.yLabel || '';
  ['xMin', 'xMax', 'yMin', 'yMax'].forEach(k => { g(k).value = cfg[k] ?? ''; });
  g('showLegend').checked = cfg.legendShow ?? true;
  updateLockBtn('titleLock',  cfg.titleLocked);
  updateLockBtn('xLabelLock', cfg.xLabelLocked);
  updateLockBtn('yLabelLock', cfg.yLabelLocked);
}

// ── Add / delete ──────────────────────────────────────────────────────────

function addPlot() {
  const p = makePlot(`Plot ${appState.plots.length + 1}`);
  appState.plots.push(p);
  appState.activePlotId = p.id;
  syncActivePlotInputs();
  renderPlotGrid();
  if (appState.plotRendered) debounceRender();
}

function deletePlot(pid) {
  if (appState.plots.length <= 1) return; // the grid always has one plot
  const p = appState.plots.find(x => x.id === pid);
  const owned = appState.series.filter(s => s.plotId === pid);
  if (owned.length && !confirm(`Delete "${p.name}" and its ${owned.length} series?`)) return;

  clearPanel(pid); // release the panel's WebGL buffers before removing it
  appState.series = appState.series.filter(s => s.plotId !== pid);
  appState.plots  = appState.plots.filter(x => x.id !== pid);
  if (appState.activePlotId === pid) appState.activePlotId = appState.plots[0].id;
  syncActivePlotInputs();
  renderPlotGrid();
  renderSeriesList();
  updateRenderBtn();
  if (appState.plotRendered) debounceRender();
}

// Purge + node replacement — Plotly.purge alone retains scattergl WebGL
// buffers (Phase 4 memory profile); same release strategy per panel.
function clearPanel(pid) {
  const pd = plotDivFor(pid);
  if (!pd) return;
  try { Plotly.purge(pd); } catch (e) { /* nothing rendered */ }
  pd.replaceWith(pd.cloneNode(false));
  const sr = document.getElementById('plotSR-' + pid);
  if (sr) sr.textContent = '';
}
