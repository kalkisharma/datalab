// ui.js — panel builders and searchable dropdowns (series modal lives in modal.js)

const _ddControllers = new Map();

/**
 * Searchable dropdown with keyboard navigation.
 * items: [{ value, label }]
 * @param {string}   inputId
 * @param {string}   ddId
 * @param {object[]} items
 * @param {Function} onSel  called with (value)
 */
function makeDD(inputId, ddId, items, onSel) {
  // Abort previous controller for this input — makeDD is called again when
  // items change (e.g. column list updates), and without this, old listeners
  // stack causing duplicate onSel firings.
  if (_ddControllers.has(inputId)) _ddControllers.get(inputId).abort();
  const ac = new AbortController(), sig = ac.signal;
  _ddControllers.set(inputId, ac);
  const inp = document.getElementById(inputId);
  const dd  = document.getElementById(ddId);
  if (!inp || !dd) return;
  let _filt = [];

  function render(f) {
    f = f.toLowerCase();
    _filt = items.filter(x => x.label.toLowerCase().includes(f));
    // escHtml applied to item labels — column names are user-controlled strings
    dd.innerHTML = _filt.length
      ? _filt.map((x, i) =>
          `<div class="opt${x.value === (inp._selVal ?? '') ? ' selected' : ''}" data-fi="${i}" role="option">${escHtml(x.label)}</div>`
        ).join('')
      : '<div class="no-results">No matches</div>';
    dd.querySelectorAll('.opt').forEach(el => el.addEventListener('mousedown', e => {
      e.preventDefault();
      const item = _filt[parseInt(el.dataset.fi)];
      inp.value = item.label; inp._selVal = item.value;
      onSel(item.value); dd.classList.remove('open');
    }));
  }

  inp.addEventListener('focus',  () => { render(inp.value); dd.classList.add('open'); }, { signal: sig });
  inp.addEventListener('input',  () => render(inp.value), { signal: sig });
  // 150 ms delay: clicking an option fires blur before mousedown on the option;
  // without the delay the dropdown closes and the mousedown is lost.
  inp.addEventListener('blur',   () => setTimeout(() => dd.classList.remove('open'), 150), { signal: sig });
}

// ── Dataset panel ─────────────────────────────────────────────────────────

// Reload feedback under the dropzone. reloadedDs = null clears the area.
function showDataAlerts(reloadedDs, problems) {
  const box = document.getElementById('dataAlerts');
  if (!box) return;
  // innerHTML: empty string — no user data
  if (!reloadedDs) { box.innerHTML = ''; return; }
  // escHtml applied to: dataset name, series names, missing-reference text
  let html = `<div class="alert success">Reloaded ${escHtml(reloadedDs.name)} — ${reloadedDs.rows.length}r·${reloadedDs.headers.length}c</div>`;
  problems.forEach(p => {
    html += `<div class="alert warn" role="alert">Series "${escHtml(p.series.name)}" references missing ${escHtml(p.missing.join(', '))}</div>`;
  });
  // innerHTML: dataset name, series names, and missing-ref text all escaped via escHtml() above
  box.innerHTML = html;
}

function renderDatasetList() {
  const list = document.getElementById('datasetList');
  // innerHTML: empty string — no user data
  if (!appState.datasets.length) { list.innerHTML = ''; return; }
  // escHtml applied to: dataset name, row/col counts
  list.innerHTML = appState.datasets.map(ds => `
    <div class="dataset-chip" role="listitem" data-dsid="${ds.id}">
      <button class="dataset-color" style="background:${ds.color}" title="Change dataset color"
              aria-label="Change color of dataset ${escHtml(ds.name)}" data-dsid="${ds.id}"></button>
      <input class="dataset-name" type="text" value="${escHtml(ds.name)}"
             aria-label="Dataset name" data-dsid="${ds.id}" />
      <span class="dataset-info">${ds.rows.length}r·${ds.headers.length}c</span>
      <button class="dataset-tools" aria-label="Data tools for ${escHtml(ds.name)}"
              data-dsid="${ds.id}" title="Data tools — stats, cleaning, correlation">Σ</button>
      <button class="dataset-del" aria-label="Remove dataset ${escHtml(ds.name)}"
              data-dsid="${ds.id}" title="Remove">×</button>
    </div>`).join('');

  list.querySelectorAll('.dataset-name').forEach(inp => {
    inp.addEventListener('input', () => {
      const ds = appState.datasets.find(d => d.id === inp.dataset.dsid);
      if (ds) ds.name = inp.value || 'Dataset';
    });
  });
  list.querySelectorAll('.dataset-del').forEach(btn => {
    btn.addEventListener('click', () => removeDataset(btn.dataset.dsid));
  });
  list.querySelectorAll('.dataset-color').forEach(dot => {
    dot.addEventListener('click', () => editDatasetColor(dot.dataset.dsid));
  });
  list.querySelectorAll('.dataset-tools').forEach(btn => {
    btn.addEventListener('click', () => openDataTools(btn.dataset.dsid));
  });
}

// Native color picker for a dataset dot. Series that inherited the old
// color follow it; explicit per-series overrides are left alone.
function editDatasetColor(dsId) {
  const ds = appState.datasets.find(d => d.id === dsId);
  if (!ds) return;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = ds.color;
  input.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const oldColor = ds.color;
    ds.color = input.value;
    appState.series.forEach(s => {
      if (s.datasetId === dsId && s.style?.color === oldColor) s.style.color = input.value;
    });
    bumpDatasetRev(dsId);
    renderDatasetList();
    if (appState.plotRendered) debounceRender();
  });
  input.addEventListener('blur', () => input.remove());
  input.click();
}

function removeDataset(id) {
  // Remove dataset and any series that depend on it
  appState.datasets = appState.datasets.filter(d => d.id !== id);
  appState.series   = appState.series.filter(
    s => s.datasetId !== id && s.joinDatasetId !== id
  );
  // Release this dataset's memoized column arrays (Phase 4 memory profile)
  bumpDatasetRev(id);
  renderDatasetList();
  renderSeriesList();
  scheduleRender();
}

// ── Series panel ──────────────────────────────────────────────────────────

function renderSeriesList() {
  const list  = document.getElementById('seriesList');
  const empty = document.getElementById('seriesEmpty');
  const addBtn = document.getElementById('addSeriesBtn');

  if (!appState.datasets.length) {
    addBtn.disabled = true;
    addBtn.title = 'Load a CSV first';
  } else {
    addBtn.disabled = false;
    addBtn.title = '';
  }

  if (!appState.series.length) {
    empty.style.display = '';
    list.querySelectorAll('.series-item').forEach(el => el.remove());
    return;
  }
  empty.style.display = 'none';
  list.querySelectorAll('.series-item').forEach(el => el.remove());

  appState.series.forEach((s, idx) => {
    const ds = appState.datasets.find(d => d.id === s.datasetId);
    const dsName = ds ? ds.name : '?';
    const item = document.createElement('div');
    item.className = 'series-item';
    item.setAttribute('role', 'listitem');
    item.dataset.sid = s.id;
    const plotName = appState.plots.find(p => p.id === s.plotId)?.name ?? '';
    // escHtml applied to: series name, dataset name, plot name
    item.innerHTML = `
      <input type="checkbox" class="series-ena" ${s.enabled !== false ? 'checked' : ''}
             aria-label="Show series ${escHtml(s.name)}" title="Show/hide on plot" />
      <span class="series-badge ${s.chartType}">${escHtml(s.chartType)}</span>
      <span class="series-name" title="${escHtml(s.name)} · ${escHtml(dsName)}${plotName ? ' · ' + escHtml(plotName) : ''}">${escHtml(s.name)}</span>
      ${appState.plots.length > 1 && plotName ? `<span class="series-plotchip" title="Plot">${escHtml(plotName)}</span>` : ''}
      <button class="series-move" data-dir="-1" aria-label="Move series ${escHtml(s.name)} up"
              title="Move up" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button class="series-move" data-dir="1" aria-label="Move series ${escHtml(s.name)} down"
              title="Move down" ${idx === appState.series.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="series-edit" aria-label="Edit series ${escHtml(s.name)}" title="Edit">✎</button>
      <button class="series-del"  aria-label="Delete series ${escHtml(s.name)}" title="Delete">×</button>`;
    // Keyboard nav (roving tabindex): arrows move between rows, Enter edits,
    // Delete removes. Buttons inside rows stay Tab-reachable as usual.
    item.tabIndex = idx === 0 ? 0 : -1;
    item.setAttribute('aria-label', `Series ${s.name}, ${s.chartType}, ${dsName}`);
    item.addEventListener('keydown', e => {
      if (e.target !== item) return; // don't hijack keys inside inputs/buttons
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const rows = [...list.querySelectorAll('.series-item')];
        const next = rows[rows.indexOf(item) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) { item.tabIndex = -1; next.tabIndex = 0; next.focus(); }
      } else if (e.key === 'Enter') {
        openModal(s.id);
      } else if (e.key === 'Delete') {
        appState.series = appState.series.filter(x => x.id !== s.id);
        renderSeriesList();
        scheduleRender();
        if (appState.plotRendered) debounceRender();
        document.querySelector('.series-item')?.focus();
      }
    });
    item.querySelector('.series-ena').addEventListener('change', e => {
      s.enabled = e.target.checked;
      if (appState.plotRendered) debounceRender();
    });
    item.querySelectorAll('.series-move').forEach(btn => {
      btn.addEventListener('click', () => moveSeries(s.id, parseInt(btn.dataset.dir)));
    });
    item.querySelector('.series-edit').addEventListener('click', () => openModal(s.id));
    item.querySelector('.series-del').addEventListener('click', () => {
      appState.series = appState.series.filter(x => x.id !== s.id);
      renderSeriesList();
      scheduleRender();
      if (appState.plotRendered) debounceRender();
    });
    list.appendChild(item); // seriesEmpty hint lives outside the role=list container
  });
}

// Swap a series with its neighbor; row order = trace draw order on the plot
function moveSeries(id, dir) {
  const i = appState.series.findIndex(s => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= appState.series.length) return;
  [appState.series[i], appState.series[j]] = [appState.series[j], appState.series[i]];
  renderSeriesList();
  // Keep keyboard focus on the moved row's button so repeated moves work without re-tabbing
  document.querySelector(`.series-item[data-sid="${id}"] .series-move[data-dir="${dir}"]`)?.focus();
  if (appState.plotRendered) debounceRender();
}

// Auto-render (Phase 16 — the manual Render button was removed): any change
// to the renderable series set schedules a debounced render, matching the
// style/range controls that already auto-render. The empty case clears the
// grid immediately (no point debouncing a teardown). Called from every site
// that adds, edits, deletes, or loads series.
function scheduleRender() {
  if (appState.series.length) debounceRender();
  else if (appState.plotRendered) clearPlot();
}
