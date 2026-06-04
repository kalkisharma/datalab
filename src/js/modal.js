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
      <label class="modal-label" for="mSeriesName">Name</label>
      <input type="text" class="ctrl-input" id="mSeriesName"
             value="${escHtml(existing?.name || '')}" placeholder="Series name" />
    </div>
    <div class="modal-field">
      <label class="modal-label" for="mDataset">Dataset <span class="required">*</span></label>
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

  function colOptions(selected, includeAll, allowDatetime = false) {
    const list = includeAll ? allCols : numericCols;
    return list.map(c => {
      const type = classifyColumn(ds.rows, c);
      const disabled = (type === 'datetime' && !allowDatetime)
        ? 'disabled title="Datetime not supported for this field"' : '';
      // escHtml applied to column name in option text
      return `<option value="${escHtml(c)}" ${selected === c ? 'selected':''} ${disabled}>${escHtml(c)}${type==='datetime'?' (datetime)':''}</option>`;
    }).join('');
  }

  let html = '';

  if (chartType === 'scatter' || chartType === 'line') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X column <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, true, true)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mColorCol">Color by (optional)</label>
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
        <label class="modal-label" for="mJoinDataset">Join dataset (Y / modelled) <span class="required">*</span></label>
        <select id="mJoinDataset">${joinDsOptions || '<option value="">— load a second CSV —</option>'}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mJoinKey">Join key <span class="required">*</span></label>
        <select id="mJoinKey">
          <option value="">Select key…</option>
          ${sharedKeys.map(c=>`<option value="${escHtml(c)}" ${existing?.joinKey===c?'selected':''}>${escHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X column — observed <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column — modelled <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-section-title">Error bands</div>
      <div class="check-row">
        <label><input type="checkbox" id="mBand5"  ${existing?.band5 ?'checked':''} /> ±5%</label>
        <label><input type="checkbox" id="mBand10" ${existing?.band10??true?'checked':''} /> ±10%</label>
      </div>`;
  } else if (chartType === 'histogram') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">Column (numeric) <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mBinCount">Bin count <span class="field-hint" style="margin:0">(blank = auto, Freedman-Diaconis)</span></label>
        <input type="number" class="ctrl-input" id="mBinCount" min="1" max="500"
               value="${existing?.binCount ?? ''}" placeholder="auto" />
      </div>`;
  } else if (chartType === 'boxplot') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column (numeric) <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">Group by X (optional, categorical)</label>
        <select id="mXCol"><option value="">None</option>${colOptions(existing?.xCol, true)}</select>
        <div class="field-hint">One box per unique X value (max 50 before a readability warning).</div>
      </div>`;
  } else if (chartType === 'contour') {
    html = `
      <div class="modal-section-title">Columns</div>
      <div class="modal-field">
        <label class="modal-label" for="mXCol">X column (numeric) <span class="required">*</span></label>
        <select id="mXCol">${colOptions(existing?.xCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mYCol">Y column (numeric) <span class="required">*</span></label>
        <select id="mYCol">${colOptions(existing?.yCol, false)}</select>
      </div>
      <div class="modal-field">
        <label class="modal-label" for="mZCol">Z column (numeric) <span class="required">*</span></label>
        <select id="mZCol">${colOptions(existing?.zCol, false)}</select>
        <div class="field-hint">Contour needs pre-gridded data: every combination of the unique X and Y values exactly once (e.g. a parameter sweep). Scattered points need gridding first.</div>
      </div>`;
  }

  // Style overrides (all chart types) — blank number fields inherit the
  // global Style panel values; color defaults to the series/dataset color
  const curColor = existing?.style?.color ?? ds.color ?? '#5b8dee';
  const showLineWidth = chartType === 'line'; // parity's main trace is markers — no line width
  html += `
    <div class="modal-section-title">Style</div>
    <div class="modal-field">
      <label class="modal-label" for="mStyleColor">Color</label>
      <input type="color" class="edge-color" id="mStyleColor" value="${escHtml(curColor)}" />
    </div>
    <div class="modal-field">
      <label class="modal-label" for="mStyleMarkerSize">Marker size <span class="field-hint" style="margin:0">(blank = global)</span></label>
      <input type="number" class="ctrl-input" id="mStyleMarkerSize" min="1" max="30"
             value="${existing?.style?.markerSize ?? ''}" placeholder="global" />
    </div>
    ${showLineWidth ? `
    <div class="modal-field">
      <label class="modal-label" for="mStyleLineWidth">Line width <span class="field-hint" style="margin:0">(blank = global)</span></label>
      <input type="number" class="ctrl-input" id="mStyleLineWidth" min="0.5" max="10" step="0.5"
             value="${existing?.style?.lineWidth ?? ''}" placeholder="global" />
    </div>` : ''}`;

  // Filters (all chart types)
  html += `
    <div class="modal-section-title">Filters <span class="filter-count" id="mFilterCount"></span></div>
    <div class="modal-field">
      <label class="modal-label" for="mFilterLogic">Combine filters with</label>
      <select id="mFilterLogic">
        <option value="and" ${(existing?.filterLogic ?? 'and') === 'and' ? 'selected' : ''}>AND — every filter must match</option>
        <option value="or"  ${existing?.filterLogic === 'or' ? 'selected' : ''}>OR — any filter may match</option>
      </select>
    </div>
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

// ── Modal save ────────────────────────────────────────────────────────────
// (Filter row UI lives in filters.js — _modalFilters is shared module state)

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

  const xCol = document.getElementById('mXCol')?.value || '';
  const yCol = document.getElementById('mYCol')?.value || '';
  const zCol = document.getElementById('mZCol')?.value || '';

  // Required columns vary by chart type (see modal field matrix, PLANNING.md)
  if (chartType === 'histogram') {
    if (!xCol) { err.textContent = 'A numeric column is required.'; return false; }
  } else if (chartType === 'boxplot') {
    if (!yCol) { err.textContent = 'Y column is required.'; return false; }
  } else {
    if (!xCol) { err.textContent = 'X column is required.'; return false; }
    if (!yCol) { err.textContent = 'Y column is required.'; return false; }
    if (chartType === 'contour' && !zCol) { err.textContent = 'Z column is required.'; return false; }
  }

  const ds    = appState.datasets.find(d => d.id === dsId);

  // Datetime X (scatter/line): resolve the column's date format before the
  // series is saved. Ambiguous slash dates open the format prompt; the save
  // resumes from its callback. Stored per dataset+column — asked once.
  if ((chartType === 'scatter' || chartType === 'line') && xCol && ds
      && classifyColumn(ds.rows, xCol) === 'datetime'
      && !(ds.dateFormats && ds.dateFormats[xCol])) {
    const det = detectDateFormat(ds.rows.map(r => r[xCol]));
    if (det === 'ambiguous') {
      showDateFormatPrompt(ds, xCol, () => saveModalSeries());
      return false; // resumed by the prompt callback
    }
    ds.dateFormats = ds.dateFormats || {};
    ds.dateFormats[xCol] = det || 'ISO';
  }

  // Raw name stored in state per the escaping contract (data.js) — escHtml
  // here would double-escape at every display site
  const autoName = name || `${chartType} · ${ds?.name ?? dsId}`;

  // Style overrides: blank number fields = inherit global Style panel values
  const style = { color: document.getElementById('mStyleColor')?.value || undefined };
  const ms = document.getElementById('mStyleMarkerSize')?.value;
  const lw = document.getElementById('mStyleLineWidth')?.value;
  if (ms !== '' && ms != null) style.markerSize = Number(ms);
  if (lw !== '' && lw != null) style.lineWidth  = Number(lw);

  const existing = _editingSeriesId ? appState.series.find(s => s.id === _editingSeriesId) : null;

  const series = {
    id:        _editingSeriesId || uid(),
    name:      name || autoName,
    datasetId: dsId,
    chartType,
    xCol,
    yCol,
    zCol:      zCol || null,                                  // contour only
    binCount:  Number(document.getElementById('mBinCount')?.value) || null, // histogram only
    colorCol:  document.getElementById('mColorCol')?.value || null,
    filters:   _modalFilters.map(f => ({ ...f })),
    filterLogic: document.getElementById('mFilterLogic')?.value || 'and',
    style,
    enabled:   existing?.enabled ?? true, // preserve visibility toggle across edits
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
    appState.series.push(series);
  }

  renderSeriesList();
  updateRenderBtn();
  closeModal();
  if (appState.plotRendered) debounceRender();
  return true;
}

// ── Date format prompt ────────────────────────────────────────────────────

let _dateFmtAC = null;

function showDateFormatPrompt(ds, col, onDone) {
  const overlay = document.getElementById('dateFmtOverlay');
  const text    = document.getElementById('dateFmtText');
  const prev    = document.activeElement;

  const samples = ds.rows.map(r => r[col]).filter(v => v != null && v !== '').slice(0, 3);
  // textContent — no HTML interpretation, no escaping needed
  text.textContent = `The dates in "${col}" are ambiguous (e.g. ${samples.join(', ')}). Which format are they?`;

  _dateFmtAC?.abort();
  _dateFmtAC = new AbortController();
  const sig = _dateFmtAC.signal;

  const close = () => { overlay.classList.add('hidden'); _dateFmtAC.abort(); };
  const choose = fmt => {
    ds.dateFormats = ds.dateFormats || {};
    ds.dateFormats[col] = fmt;
    bumpDatasetRev(ds.id); // cached traces depend on the parse format
    close();
    onDone();
  };
  const cancel = () => { close(); prev?.focus?.(); }; // back to the series modal, unsaved

  document.getElementById('dateFmtMDY').addEventListener('click', () => choose('MDY'), { signal: sig });
  document.getElementById('dateFmtDMY').addEventListener('click', () => choose('DMY'), { signal: sig });
  document.getElementById('dateFmtClose').addEventListener('click', cancel, { signal: sig });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
  }, { signal: sig, capture: true });

  overlay.classList.remove('hidden');
  document.getElementById('dateFmtMDY').focus(); // ARIA: focus first action
}
