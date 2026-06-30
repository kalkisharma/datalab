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
          <button class="panel-hide" aria-label="Hide plot ${escHtml(p.name)}" title="Hide plot">⊘</button>
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
      panel.querySelector('.panel-name').addEventListener('input', e => {
        p.name = e.target.value || 'Plot';
        // Rename ripples everywhere the name is shown: the "Editing:" label,
        // series plot chips, and the panel's aria-labels (Phase 8 fix —
        // these stayed stale until an unrelated re-render)
        panel.setAttribute('aria-label', `Plot panel ${p.name}${p.id === appState.activePlotId ? ', active' : ''}`);
        panel.querySelector('.panel-del').setAttribute('aria-label', `Delete plot ${p.name}`);
        syncActivePlotInputs();
        renderSeriesList();
      });
      panel.querySelector('.panel-hide').addEventListener('click', e => { e.stopPropagation(); togglePlotHidden(p.id); });
      panel.querySelector('.panel-del').addEventListener('click', e => { e.stopPropagation(); deletePlot(p.id); });
      grid.appendChild(panel);
    } else {
      const nameEl = panel.querySelector('.panel-name');
      if (nameEl.value !== p.name && document.activeElement !== nameEl) nameEl.value = p.name;
    }
    panel.classList.toggle('active', p.id === appState.activePlotId);
    panel.style.display = p.hidden ? 'none' : '';
    panel.setAttribute('aria-label', `Plot panel ${p.name}${p.id === appState.activePlotId ? ', active' : ''}`);
  });

  // Auto columns: 1 → full width, 2 → side by side, 3-4 → 2×2, 5+ → 3 cols.
  // Set the cols-* class via classList — a wholesale `grid.className = …`
  // here clobbered the `hidden` class, so init()'s grid reconciliation
  // un-hid an empty grid on startup and it showed below the empty state
  // (maintainer-reported startup split; the visible/hidden state is owned
  // solely by renderPlot/clearPlot, never by this layout pass).
  const n = appState.plots.filter(p => !p.hidden).length || 1; // visible panels drive the layout
  grid.classList.remove('cols-1', 'cols-2', 'cols-3');
  grid.classList.add('cols-' + (n <= 1 ? 1 : n <= 4 ? 2 : 3));
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

  renderHiddenBar();
}

// ── Show / hide plots (workspace ergonomics) ───────────────────────────────
// Hiding keeps the plot + its series in state; the panel leaves the grid flow
// and a restorable chip appears. The last visible plot can never be hidden.
function togglePlotHidden(pid) {
  const p = appState.plots.find(x => x.id === pid);
  if (!p) return;
  if (!p.hidden) {
    if (appState.plots.filter(x => !x.hidden).length <= 1) return; // keep one visible
    p.hidden = true;
    if (appState.activePlotId === pid) appState.activePlotId = appState.plots.find(x => !x.hidden).id;
  } else {
    p.hidden = false;
  }
  syncActivePlotInputs();
  renderPlotGrid();
  if (appState.plotRendered) renderPlot();
}

function renderHiddenBar() {
  const bar = document.getElementById('hiddenPlotsBar');
  if (!bar) return;
  const hidden = appState.plots.filter(p => p.hidden);
  if (!hidden.length) { bar.style.display = 'none'; bar.innerHTML = ''; return; } // innerHTML: empty string — no user data
  // escHtml applied to plot names — user-editable strings
  bar.innerHTML = '<span class="hidden-plots-label">Hidden plots:</span>' + hidden.map(p =>
    `<button class="hidden-plot-chip" data-pid="${escHtml(p.id)}" title="Show plot">${escHtml(p.name)} ▸</button>`
  ).join('');
  bar.style.display = '';
  bar.querySelectorAll('.hidden-plot-chip').forEach(btn =>
    btn.addEventListener('click', () => togglePlotHidden(btn.dataset.pid)));
}

// ── Active plot ───────────────────────────────────────────────────────────
// The Plot settings panel edits the active plot; switching syncs inputs.

function setActivePlot(pid) {
  if (appState.activePlotId === pid) return;
  appState.activePlotId = pid;
  syncActivePlotInputs();
  renderPlotGrid();
  renderSeriesList(); // re-highlight the active plot's series in the list
}

// Show/populate the bulk-axis control: visible when the active plot has 2+ x/y
// series; options = union of their datasets' columns (incl. join datasets, since
// Y can come from one). Called from renderSeriesList so it tracks every series
// add/delete/edit AND the active-plot switch — not just plot config syncs.
function syncBulkAxisControl() {
  const baWrap = document.getElementById('bulkAxisWrap');
  if (!baWrap) return;
  const XY = new Set(['scatter', 'line', 'parity', 'bar']);
  const xySeries = appState.series.filter(s =>
    (s.plotId ?? appState.plots[0].id) === activePlot().id && XY.has(s.chartType));
  baWrap.style.display = xySeries.length >= 2 ? '' : 'none';
  if (xySeries.length < 2) return;
  const cols = new Set();
  xySeries.forEach(s => [s.datasetId, s.joinDatasetId].forEach(id =>
    (appState.datasets.find(d => d.id === id)?.headers || []).forEach(c => cols.add(c))));
  const opts = '<option value="">— pick a column —</option>' +
    [...cols].map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  // innerHTML: option labels are column names, escHtml'd above. The selects are
  // one-shot action triggers, reset to the placeholder on every render.
  ['bulkXCol', 'bulkYCol'].forEach(id => { document.getElementById(id).innerHTML = opts; });
}

// Bulk-retarget an axis column for every x/y series in the active plot at once
// (saves editing each one). Apply-where-possible: series whose relevant dataset
// lacks the column are skipped, reported in a non-blocking notice. Mutates the
// series directly (no hidden state) — individuals stay editable.
function bulkSetAxis(axis, col) {
  if (!col) return;
  const field = axis === 'x' ? 'xCol' : 'yCol';
  const pid = activePlot().id;
  const XY = new Set(['scatter', 'line', 'parity', 'bar']);
  const series = appState.series.filter(s =>
    (s.plotId ?? appState.plots[0].id) === pid && XY.has(s.chartType));
  let applied = 0;
  for (const s of series) {
    // Y of a joined series comes from the JOIN dataset; X (and the default) from
    // the series' own dataset — check the column against the right one.
    const dsId = (field === 'yCol' && s.joinDatasetId) ? s.joinDatasetId : s.datasetId;
    const ds = appState.datasets.find(d => d.id === dsId);
    if (ds && ds.headers.includes(col)) { s[field] = col; applied++; }
  }
  const skipped = series.length - applied;
  renderSeriesList();
  scheduleRender();
  flashNotice(`Set ${axis.toUpperCase()} to "${col}" for ${applied} of ${series.length} series`
    + (skipped ? ` — ${skipped} skipped (no "${col}" column)` : '') + '.', skipped ? 'warn' : 'success');
}

// Column-name suggestions for the Title / X / Y label inputs (v2.22.0): the
// union of every loaded dataset's headers. innerHTML — names escaped for the
// option value attribute (§8); datalist options are inert, not a script sink.
function populateLabelDatalist() {
  const dl = document.getElementById('labelCols');
  if (!dl) return;
  const cols = new Set();
  appState.datasets.forEach(d => (d.headers || []).forEach(c => cols.add(c)));
  // innerHTML: column names (user data) escaped via escHtml into the value attribute
  dl.innerHTML = [...cols].map(c => `<option value="${escHtml(c)}"></option>`).join('');
}

// Load the Edit-cell selector's current cell overrides into the three fields,
// and announce the target for screen readers (v2.22.0).
function loadCellOverrideFields() {
  const cfg = activePlot().plotConfig;
  const key = document.getElementById('cellTarget')?.value || '';
  const ov = (cfg.cells && cfg.cells[key]) || {};
  document.getElementById('cellTitle').value  = ov.title  ?? '';
  document.getElementById('cellXLabel').value = ov.xLabel ?? '';
  document.getElementById('cellYLabel').value = ov.yLabel ?? '';
  const m = /^(\d+),(\d+)$/.exec(key);
  const status = document.getElementById('cellTargetStatus');
  if (status && m) status.textContent = `Editing Row ${m[1]}, Column ${m[2]}`;
}

function syncActivePlotInputs() {
  const cfg = activePlot().plotConfig;
  const g = id => document.getElementById(id);
  populateLabelDatalist();
  g('activePlotLabel').textContent = `Editing: ${activePlot().name}`;
  g('inputTitle').value  = cfg.title  || '';
  g('inputXLabel').value = cfg.xLabel || '';
  g('inputYLabel').value = cfg.yLabel || '';
  ['xMin', 'xMax', 'yMin', 'yMax'].forEach(k => { g(k).value = cfg[k] ?? ''; });
  g('xLogChk').checked = cfg.xLog ?? false;
  g('yLogChk').checked = cfg.yLog ?? false;
  g('showLegend').checked = cfg.legendShow ?? true;
  g('showStats').checked = cfg.statsShow ?? true;
  g('showNotes').checked = cfg.notesShow ?? true; // notes visibility toggle (v2.21.0)
  g('plotCmap').value = cfg.colormap ?? ''; // per-plot colormap override (v2.20.0)
  // Subplot grid controls mirror the active plot (Phase 10)
  const gr = activePlot().grid;
  g('gridRows').value = String(gr?.rows ?? 1);
  g('gridCols').value = String(gr?.cols ?? 1);
  g('gridShareX').checked = gr?.shareX ?? false;
  g('gridShareY').checked = gr?.shareY ?? false;
  // Subplot-wide encoding (workspace ergonomics): shown only with a grid;
  // options = union of columns across the plot's series' datasets
  const seWrap = g('sharedEncodeWrap');
  if (seWrap) {
    const hasGrid = (gr?.rows ?? 1) * (gr?.cols ?? 1) > 1;
    seWrap.style.display = hasGrid ? '' : 'none';
    if (hasGrid) {
      const cols = new Set();
      appState.series
        .filter(s => (s.plotId ?? appState.plots[0].id) === activePlot().id)
        .forEach(s => (appState.datasets.find(d => d.id === s.datasetId)?.headers || []).forEach(c => cols.add(c)));
      const fill = (id, val) => {
        // innerHTML: option labels are column names — escHtml applied
        g(id).innerHTML = '<option value="">Per series</option>' +
          [...cols].map(c => `<option value="${escHtml(c)}" ${val === c ? 'selected' : ''}>${escHtml(c)}</option>`).join('');
      };
      fill('sharedColorCol', cfg.sharedColorCol);
      fill('sharedSizeCol', cfg.sharedSizeCol);
      // Shared colorbar override (v2.22.0): block shown only when a shared
      // Color-by is set (a shared colorbar only exists then).
      const cb = cfg.colorbar || {};
      const cbWrap = g('sharedColorbarWrap');
      if (cbWrap) cbWrap.style.display = cfg.sharedColorCol ? '' : 'none';
      // innerHTML: fixed colormap names + a static inherit option — no user data
      g('sharedCbMap').innerHTML = '<option value="">Inherit (plot / global)</option>' + colormapOptionsHTML(cb.colormap);
      g('sharedCbTitle').value    = cb.label ?? '';
      g('sharedCbHide').checked   = !!cb.titleHide;
      g('sharedCbReverse').checked = !!cb.reverse;
      g('sharedCbMin').value = cb.min ?? '';
      g('sharedCbMax').value = cb.max ?? '';
      // Per-cell overrides (v2.22.0): populate the Edit-cell R×C selector and load
      // the targeted cell's stored overrides into the three fields.
      if (g('cellOverrideWrap')) g('cellOverrideWrap').style.display = '';
      const sel = g('cellTarget');
      const prev = /^\d+,\d+$/.test(sel.value) ? sel.value : '1,1';
      const opts = [];
      for (let r = 1; r <= gr.rows; r++) for (let c = 1; c <= gr.cols; c++) opts.push(`<option value="${r},${c}">R${r}·C${c}</option>`);
      // innerHTML: R×C option labels are loop integers — no user data
      sel.innerHTML = opts.join('');
      sel.value = prev; if (!sel.value) sel.value = '1,1';
      loadCellOverrideFields();
    } else {
      ['sharedColorbarWrap', 'cellOverrideWrap'].forEach(id => { const e = g(id); if (e) e.style.display = 'none'; });
    }
  }
  updateLockBtn('titleLock',  cfg.titleLocked);
  updateLockBtn('xLabelLock', cfg.xLabelLocked);
  updateLockBtn('yLabelLock', cfg.yLabelLocked);
  renderNoteList();
}

// Notes list for the ACTIVE plot (Phase 14)
function renderNoteList() {
  const list = document.getElementById('noteList');
  if (!list) return;
  const notes = activePlot().plotConfig.notes ?? [];
  // escHtml applied to note text — user-entered string
  list.innerHTML = notes.map(n => `
    <div class="note-item" role="listitem">
      <span class="note-text" title="${escHtml(n.text)}">${escHtml(n.text)}</span>
      <button class="note-del" data-nid="${n.id}" aria-label="Delete note ${escHtml(n.text)}" title="Delete">×</button>
    </div>`).join('');
  list.querySelectorAll('.note-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const cfg = activePlot().plotConfig;
      cfg.notes = (cfg.notes ?? []).filter(n => n.id !== btn.dataset.nid);
      renderNoteList();
      if (appState.plotRendered) renderPlot();
    });
  });
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
  scheduleRender();
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
