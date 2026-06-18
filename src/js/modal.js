// modal.js — series editor modal: open/close, save
// (per-chart-type fields live in modal-fields.js; filter rows in filters.js;
//  the ambiguous-date prompt is in date-prompt.js — split at the Stab-A §6 review)

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

// Cell picker (Phase 10) — only when the target plot has a subplot grid;
// rebuilt by wireModalBody when the Plot picker changes. Static labels
// only — no user data in the markup.
function cellPickerHTML(plotId, cell) {
  const grid = appState.plots.find(p => p.id === plotId)?.grid;
  if (!grid || grid.rows * grid.cols < 2) return '';
  let opts = '';
  for (let r = 1; r <= grid.rows; r++) {
    for (let c = 1; c <= grid.cols; c++) {
      const sel = (cell?.row ?? 1) === r && (cell?.col ?? 1) === c ? 'selected' : '';
      opts += `<option value="${r},${c}" ${sel}>Row ${r} · Col ${c}</option>`;
    }
  }
  return `
    <div class="modal-field">
      <label class="modal-label" for="mCell">Cell</label>
      <select id="mCell">${opts}</select>
    </div>`;
}

function buildModalBody(existing) {
  const dsOptions = appState.datasets.map(ds =>
    // escHtml applied to dataset name in option text
    `<option value="${escHtml(ds.id)}" ${existing?.datasetId === ds.id ? 'selected' : ''}>${escHtml(ds.name)}</option>`
  ).join('');

  const chartTypes = ['scatter','line','bar','parity','contour','histogram','boxplot','violin','heatmap'];
  const ctBtns = chartTypes.map(t =>
    `<button class="ct-btn ${existing?.chartType === t ? 'active' : ''}" data-ct="${t}">${t}</button>`
  ).join('');

  // Plot picker (Phase 7) — defaults to the active plot
  const targetPlot = existing?.plotId ?? appState.activePlotId;
  const plotOptions = appState.plots.map(p =>
    // escHtml applied to plot name — user-editable string
    `<option value="${escHtml(p.id)}" ${targetPlot === p.id ? 'selected' : ''}>${escHtml(p.name)}</option>`
  ).join('');


  return `
    <div class="modal-field">
      <label class="modal-label" for="mSeriesName">Name</label>
      <input type="text" class="ctrl-input" id="mSeriesName"
             value="${escHtml(existing?.name || '')}" placeholder="Series name" />
    </div>
    <div class="modal-field">
      <label class="modal-label" for="mLegendLabel">Legend label <span class="field-hint" style="margin:0">(optional; overrides the auto label and its suffixes)</span></label>
      <input type="text" class="ctrl-input" id="mLegendLabel"
             value="${escHtml(existing?.legendLabel || '')}" placeholder="auto" />
    </div>
    <div class="check-row">
      <label><input type="checkbox" id="mLegendHide" ${existing?.legendHide ? 'checked' : ''} />
        Hide this series from the legend</label>
    </div>
    ${appState.plots.length > 1 ? `
    <div class="modal-field">
      <label class="modal-label" for="mPlot">Plot</label>
      <select id="mPlot">${plotOptions}</select>
    </div>` : ''}
    <div id="mCellWrap">${cellPickerHTML(targetPlot, existing?.cell)}</div>
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

  // Plot change refreshes the Cell picker for the new target's grid
  document.getElementById('mPlot')?.addEventListener('change', e => {
    // innerHTML: static row/col labels only — no user data (cellPickerHTML)
    document.getElementById('mCellWrap').innerHTML = cellPickerHTML(e.target.value, existing?.cell);
  });

  // Initial render if editing
  if (existing?.chartType) renderDynamicFields(existing);
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
  } else if (chartType === 'bar') {
    const agg = document.getElementById('mBarAgg')?.value || 'none';
    if (!xCol) { err.textContent = 'Category (X) column is required.'; return false; }
    if (agg !== 'count' && !yCol) { err.textContent = 'Y column is required (or choose the Count aggregation).'; return false; }
    if (document.getElementById('mBarErr')?.value && agg !== 'mean') {
      err.textContent = 'SD/SEM error bars require the Mean aggregation.'; return false;
    }
  } else if (chartType === 'heatmap') {
    const agg = document.getElementById('mBarAgg')?.value || 'none';
    if (!xCol || !yCol) { err.textContent = 'X and Y category columns are required.'; return false; }
    if (agg !== 'count' && !zCol) { err.textContent = 'Value column is required (or choose the Count aggregation).'; return false; }
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
    plotId:    document.getElementById('mPlot')?.value || existing?.plotId || appState.activePlotId,
    datasetId: dsId,
    chartType,
    xCol,
    yCol,
    zCol:      zCol || null,                                  // contour only
    interpolate: document.getElementById('mInterpolate')?.checked ?? false,  // contour only (Phase 17)
    showPoints:  document.getElementById('mShowPoints')?.checked ?? false,   // contour interpolate overlay (Phase 17)
    binCount:  Number(document.getElementById('mBinCount')?.value) || null, // histogram only
    // fitDist supersedes the Phase 5 fitNormal boolean; old sessions are
    // read via the renderer's fitDist ?? fitNormal fallback
    fitDist:   document.getElementById('mFitDist')?.value || null,          // histogram only
    kde:       document.getElementById('mKde')?.checked ?? false,           // histogram only
    // Cell (Phase 10): from the picker when shown, else preserve — a series
    // keeps its cell when edited while its plot has no grid
    cell:      (() => {
      const sel = document.getElementById('mCell');
      if (!sel) return existing?.cell ?? null;
      const [r, c] = sel.value.split(',');
      return { row: parseInt(r), col: parseInt(c) };
    })(),
    agg:       document.getElementById('mBarAgg')?.value || null,           // bar only
    errMode:   document.getElementById('mBarErr')?.value || null,           // bar only (sd|sem)
    errCol:    document.getElementById('mErrCol')?.value || null,           // scatter/line ± column
    sizeCol:   document.getElementById('mSizeCol')?.value || null,          // scatter bubble size (Phase 14)
    rightAxis: document.getElementById('mRightAxis')?.checked ?? false,     // scatter/line/bar (Phase 14)
    trendline: document.getElementById('mTrend')?.checked ?? false,         // scatter only
    trendDegree: parseInt(document.getElementById('mTrendDeg')?.value) || 1, // scatter only (Phase 13)
    trendGroups: document.getElementById('mTrendGroups')?.checked ?? false, // scatter only (Phase 11)
    colorCol:  document.getElementById('mColorCol')?.value || null,
    colorbarLabel: document.getElementById('mColorbarLabel')?.value.trim() || null, // numeric color-by (Phase 16)
    legendLabel:   document.getElementById('mLegendLabel')?.value.trim() || null,   // overrides auto legend text (Phase 16)
    legendHide:    document.getElementById('mLegendHide')?.checked ?? false,        // suppress legend entries (workspace ergonomics)
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

  // Scatter optional cross-dataset join (workspace ergonomics)
  if (chartType === 'scatter') {
    const jd = document.getElementById('mJoinDataset')?.value || null;
    series.joinDatasetId = jd;
    series.joinKey = jd ? (document.getElementById('mJoinKey')?.value || null) : null;
    if (jd && !series.joinKey) { err.textContent = 'Select a join key, or clear the join dataset.'; return false; }
  }

  if (_editingSeriesId) {
    const idx = appState.series.findIndex(s => s.id === _editingSeriesId);
    if (idx >= 0) appState.series[idx] = series;
  } else {
    appState.series.push(series);
  }

  renderSeriesList();
  scheduleRender();
  closeModal();
  if (appState.plotRendered) debounceRender();
  return true;
}
