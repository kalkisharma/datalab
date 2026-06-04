// modal-fields.js — per-chart-type field builder for the series modal
// (split from modal.js at the Phase 3 exit refactor review — verbatim move)

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
      </div>
      <div class="check-row">
        <label><input type="checkbox" id="mFitNormal" ${existing?.fitNormal ? 'checked' : ''} /> Fit normal distribution (overlay with μ, σ)</label>
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
