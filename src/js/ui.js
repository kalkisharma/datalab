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

function renderDatasetList() {
  const list = document.getElementById('datasetList');
  // innerHTML: empty string — no user data
  if (!appState.datasets.length) { list.innerHTML = ''; return; }
  // escHtml applied to: dataset name, row/col counts
  list.innerHTML = appState.datasets.map(ds => `
    <div class="dataset-chip" role="listitem" data-dsid="${ds.id}">
      <div class="dataset-color" style="background:${ds.color}" title="Dataset color"
           data-dsid="${ds.id}"></div>
      <input class="dataset-name" type="text" value="${escHtml(ds.name)}"
             aria-label="Dataset name" data-dsid="${ds.id}" />
      <span class="dataset-info">${ds.rows.length}r·${ds.headers.length}c</span>
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
}

function removeDataset(id) {
  // Remove dataset and any series that depend on it
  appState.datasets = appState.datasets.filter(d => d.id !== id);
  appState.series   = appState.series.filter(
    s => s.datasetId !== id && s.joinDatasetId !== id
  );
  renderDatasetList();
  renderSeriesList();
  updateRenderBtn();
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

  appState.series.forEach(s => {
    const ds = appState.datasets.find(d => d.id === s.datasetId);
    const dsName = ds ? ds.name : '?';
    const item = document.createElement('div');
    item.className = 'series-item';
    item.setAttribute('role', 'listitem');
    item.dataset.sid = s.id;
    // escHtml applied to: series name, dataset name
    item.innerHTML = `
      <span class="series-badge ${s.chartType}">${escHtml(s.chartType)}</span>
      <span class="series-name" title="${escHtml(s.name)} · ${escHtml(dsName)}">${escHtml(s.name)}</span>
      <button class="series-edit" aria-label="Edit series ${escHtml(s.name)}" title="Edit">✎</button>
      <button class="series-del"  aria-label="Delete series ${escHtml(s.name)}" title="Delete">×</button>`;
    item.querySelector('.series-edit').addEventListener('click', () => openModal(s.id));
    item.querySelector('.series-del').addEventListener('click', () => {
      appState.series = appState.series.filter(x => x.id !== s.id);
      renderSeriesList();
      updateRenderBtn();
    });
    list.insertBefore(item, document.getElementById('seriesEmpty'));
  });
}

function updateRenderBtn() {
  const btn = document.getElementById('renderBtn');
  btn.disabled = appState.series.length === 0;
}
