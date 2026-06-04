// modal.js — series editor modal: open/close, adaptive fields, filters, save

let _editingSeriesId = null;
let _modalTrigger    = null; // element that opened the modal — focus restored here on close

function openModal(editId) {
  _editingSeriesId = editId || null;
  _modalTrigger    = document.activeElement;
  const overlay = document.getElementById('modalOverlay');
  const title   = document.getElementById('modalTitle');
  const body    = document.getElementById('modalBody');
  const err     = document.getElementById('modalError');

  title.textContent = editId ? 'Edit Series' : 'Add Series';
  err.textContent = '';

  const existing = editId ? appState.series.find(s => s.id === editId) : null;

  // innerHTML: output of buildModalBody — all user strings escaped via escHtml() inside that function
  body.innerHTML = buildModalBody(existing);
  wireModalBody(body, existing);

  overlay.classList.remove('hidden');
  // Focus first interactive element on open (ARIA focus management)
  const first = body.querySelector('select, input, button');
  if (first) first.focus();
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('hidden');
  // Restore focus to whatever opened the modal (ARIA checklist item 3);
  // fall back to the add button if the trigger is gone (e.g. series deleted)
  const trigger = (_modalTrigger && document.contains(_modalTrigger))
    ? _modalTrigger
    : document.getElementById('addSeriesBtn');
  if (trigger) trigger.focus();
  _editingSeriesId = null;
  _modalTrigger    = null;
}

function buildModalBody(existing) {
  const dsOptions = appState.datasets.map(ds =>
    // escHtml applied to dataset name in option text
    `<option value="${escHtml(ds.id)}" ${existing?.datasetId === ds.id ? 'selected' : ''}>${escHtml(ds.name)}</option>`
  ).join('');

  const chartTypes = ['scatter','line','parity','contour','histogram','boxplot'];
  const ctBtns = chartTypes.map(t =>
    `<button class="ct-btn ${existing?.chartType === t ? 'active' : ''}" data-ct="${t}">${t}</button>`
  ).join('');

  return `
    <div class="modal-field">
      <label class="modal-label">Name</label>
      <input type="text" class="ctrl-input" id="mSeriesName"
             value="${escHtml(existing?.name || '')}" placeholder="Series name" />
    </div>
    <div class="modal-field">
      <label class="modal-label">Dataset <span class="required">*</span></label>
      <select id="mDataset">${dsOptions}</select>
    </div>
    <div class="modal-field">
      <label class="modal-label">Chart type <span class="required">*</span></label>
      <div class="chart-type-grid" id="mChartTypeGrid">${ctBtns}</div>
      <input type="hidden" id="mChartType" value="${existing?.chartType || ''}" />
    </div>
    <div id="mDynamicFields"></div>`;
}

function wireModalBody(body, existing) {
  // Chart type selection
  body.querySelectorAll('.ct-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('mChartType').value = btn.dataset.ct;
      renderDynamicFields(existing);
    });
  });

  // Dataset change triggers field refresh
  document.getElementById('mDataset').addEventListener('change', () => renderDynamicFields(existing));

  // Initial render if editing
  if (existing?.chartType) renderDynamicFields(existing);
}

function renderDynamicFields(existing) {
  const dsId     = document.getElementById('mDataset').value;
  const chartType = document.getElementById('mChartType').value;
  const ds       = appState.datasets.find(d => d.id === dsId);
  const container = document.getElementById('mDynamicFields');

  // innerHTML: empty string — no user data
  if (!ds || !chartType) { container.innerHTML = ''; return; }

  const cols = ds.headers;
  const numericCols = cols.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  const allCols     = cols;

  function colOptions(selected, includeAll) {
    const list = includeAll ? allCols : numericCols;
    return list.map(c => {
      const type = classifyColumn(ds.rows, c);
      const disabled = type === 'datetime' ? 'disabled title="Datetime columns supported in Phase 3"' : '';
      // escHtml applied to column name in option text
      return `<option value="${escHtml(c)}" ${selected === c ? 'selected':''} ${disabled}>${escHtml(c)}${type==='datetime'?' (datetime)':''}</option>`;
    }).join('');
  }

  let html = '';

  if (chartType === 'scatter' || chartType === 'line') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label">X column <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, true)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label">Y column <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label">Color by (optional)</label>
        <select id="mColorCol"><option value="">None</option>${colOptions(existing?.colorCol, true)}</select>
      </div>`;
  } else if (chartType === 'parity') {
    const joinDsOptions = appState.datasets.filter(d => d.id !== dsId).map(d =>
      `<option value="${escHtml(d.id)}" ${existing?.joinDatasetId===d.id?'selected':''}>${escHtml(d.name)}</option>`
    ).join('');
    const joinDs = appState.datasets.find(d => d.id === (existing?.joinDatasetId || appState.datasets.find(d2=>d2.id!==dsId)?.id));
    const joinCols = joinDs ? joinDs.headers : [];
    const sharedKeys = cols.filter(c => joinCols.includes(c));

    html = `
      <div class="modal-section-title">Parity setup</div>
      <div class="modal-field">
        <label class="modal-label">Join dataset (Y / modelled) <span class="required">*</span></label>
        <select id="mJoinDataset">${joinDsOptions || '<option value="">— load a second CSV —</option>'}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label">Join key <span class="required">*</span></label>
        <select id="mJoinKey">
          <option value="">Select key…</option>
          ${sharedKeys.map(c=>`<option value="${escHtml(c)}" ${existing?.joinKey===c?'selected':''}>${escHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label">X column — observed <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label">Y column — modelled <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-section-title">Error bands</div>
      <div class="check-row">
        <label><input type="checkbox" id="mBand5"  ${existing?.band5 ?'checked':''} /> ±5%</label>
        <label><input type="checkbox" id="mBand10" ${existing?.band10??true?'checked':''} /> ±10%</label>
      </div>`;
  }

  // Filters (all chart types)
  html += `
    <div class="modal-section-title">Filters <span class="filter-count" id="mFilterCount"></span></div>
    <div class="filter-list" id="mFilterList"></div>
    <button class="btn btn-sm" id="mAddFilter">+ Add filter</button>`;

  // innerHTML: all column names escaped via colOptions()/escHtml(); dataset/series names escaped via escHtml()
  container.innerHTML = html;

  // Wire filter list
  renderFilterList(existing?.filters || [], ds);
  document.getElementById('mAddFilter').addEventListener('click', () => {
    addFilterRow(ds);
    updateFilterCount();
  });

  updateFilterCount();
}

// ── Filter UI ─────────────────────────────────────────────────────────────

let _modalFilters = [];

function renderFilterList(filters, ds) {
  _modalFilters = filters.map(f => ({ ...f }));
  const list = document.getElementById('mFilterList');
  // innerHTML: empty string — no user data
  list.innerHTML = '';
  _modalFilters.forEach((f, i) => appendFilterRow(list, f, i, ds));
}

function appendFilterRow(list, f, i, ds) {
  const colOptions = (ds?.headers || []).map(c =>
    `<option value="${escHtml(c)}" ${f.col===c?'selected':''}>${escHtml(c)}</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'filter-row';
  // innerHTML: column names escaped via escHtml() in colOptions; filter value escaped via escHtml()
  row.innerHTML = `
    <input type="checkbox" class="filter-ena" ${f.enabled!==false?'checked':''} aria-label="Enable filter" />
    <select class="filter-col"><option value="">Column…</option>${colOptions}</select>
    <select class="filter-op">
      <option value="eq"  ${f.op==='eq' ?'selected':''}>= </option>
      <option value="neq" ${f.op==='neq'?'selected':''}>≠ </option>
      <option value="lt"  ${f.op==='lt' ?'selected':''}>< </option>
      <option value="gt"  ${f.op==='gt' ?'selected':''}>> </option>
      <option value="lte" ${f.op==='lte'?'selected':''}>≤ </option>
      <option value="gte" ${f.op==='gte'?'selected':''}>≥ </option>
    </select>
    <input type="text" class="filter-val" value="${escHtml(String(f.value??''))}" placeholder="Value" />
    <button class="filter-del" aria-label="Remove filter">×</button>`;
  row.querySelector('.filter-col').addEventListener('change', e => { _modalFilters[i].col = e.target.value; });
  row.querySelector('.filter-op' ).addEventListener('change', e => { _modalFilters[i].op  = e.target.value; });
  row.querySelector('.filter-val').addEventListener('input',  e => { _modalFilters[i].value = e.target.value; });
  row.querySelector('.filter-ena').addEventListener('change', e => { _modalFilters[i].enabled = e.target.checked; });
  row.querySelector('.filter-del').addEventListener('click',  () => {
    _modalFilters.splice(i, 1);
    renderFilterList(_modalFilters, document.getElementById('mDataset') ? appState.datasets.find(d=>d.id===document.getElementById('mDataset').value) : null);
    updateFilterCount();
  });
  list.appendChild(row);
}

function addFilterRow(ds) {
  const f = { col: ds?.headers?.[0] ?? '', op: 'eq', value: '', enabled: true };
  _modalFilters.push(f);
  const list = document.getElementById('mFilterList');
  appendFilterRow(list, f, _modalFilters.length - 1, ds);
}

function updateFilterCount() {
  const el = document.getElementById('mFilterCount');
  if (!el) return;
  const active = _modalFilters.filter(f => f.enabled !== false).length;
  el.textContent = active ? `(${active} active)` : '';
}

// ── Modal save ────────────────────────────────────────────────────────────

/**
 * Collects modal field values, validates, and saves/updates the series.
 * @returns {boolean} true if saved successfully
 */
function saveModalSeries() {
  const err     = document.getElementById('modalError');
  err.textContent = '';

  const name      = document.getElementById('mSeriesName').value.trim();
  const dsId      = document.getElementById('mDataset').value;
  const chartType = document.getElementById('mChartType').value;

  if (!dsId)      { err.textContent = 'Please select a dataset.';   return false; }
  if (!chartType) { err.textContent = 'Please select a chart type.'; return false; }

  const xColEl = document.getElementById('mXCol');
  const yColEl = document.getElementById('mYCol');
  const xCol   = xColEl?.value || '';
  const yCol   = yColEl?.value || '';

  if ((chartType !== 'histogram') && !xCol) { err.textContent = 'X column is required.'; return false; }
  if (!yCol && chartType !== 'histogram')    { err.textContent = 'Y column is required.'; return false; }

  const ds    = appState.datasets.find(d => d.id === dsId);
  const autoName = name || `${chartType} · ${escHtml(ds?.name ?? dsId)}`;

  const series = {
    id:        _editingSeriesId || uid(),
    name:      name || autoName,
    datasetId: dsId,
    chartType,
    xCol,
    yCol,
    colorCol:  document.getElementById('mColorCol')?.value || null,
    filters:   _modalFilters.map(f => ({ ...f })),
    style:     {},
  };

  // Parity-specific fields
  if (chartType === 'parity') {
    series.joinDatasetId = document.getElementById('mJoinDataset')?.value || null;
    series.joinKey       = document.getElementById('mJoinKey')?.value     || null;
    series.band5         = document.getElementById('mBand5')?.checked  ?? false;
    series.band10        = document.getElementById('mBand10')?.checked ?? true;
    if (!series.joinDatasetId) { err.textContent = 'Please select a join dataset.'; return false; }
    if (!series.joinKey)       { err.textContent = 'Please select a join key.';     return false; }
  }

  if (_editingSeriesId) {
    const idx = appState.series.findIndex(s => s.id === _editingSeriesId);
    if (idx >= 0) appState.series[idx] = series;
  } else {
    // Assign dataset color to series if no override
    series.style.color = ds?.color ?? PALETTE[appState.series.length % PALETTE.length];
    appState.series.push(series);
  }

  renderSeriesList();
  updateRenderBtn();
  closeModal();
  return true;
}
