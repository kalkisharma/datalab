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
  const sym = document.getElementById('mStyleMarkerSymbol')?.value;
  if (ms !== '' && ms != null) style.markerSize = Number(ms);
  if (lw !== '' && lw != null) style.lineWidth  = Number(lw);
  if (sym) style.symbol = sym; // blank = inherit the global/default shape
  // Line-only controls: store showMarkers only when OFF (absent = default true);
  // store markerColor only when it differs from the line colour (else it inherits
  // and follows future line-colour edits); lineDash blank = solid.
  if (document.getElementById('mStyleShowMarkers')?.checked === false) style.showMarkers = false;
  const mkC = document.getElementById('mStyleMarkerColor')?.value;
  if (mkC && mkC.toLowerCase() !== (style.color || '').toLowerCase()) style.markerColor = mkC;
  const dash = document.getElementById('mStyleLineDash')?.value;
  if (dash) style.lineDash = dash;

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
    contourSmooth: document.getElementById('mContourSmooth')?.checked ?? true, // contour shading smoothing (default on)
    isoLines:     document.getElementById('mIsoLines')?.checked ?? true,        // contour iso-lines (default on, v2.20.0)
    isoLabels:    document.getElementById('mIsoLabels')?.checked ?? false,      // contour iso-labels (default off, v2.20.0)
    isoLabelSize: (v => Number.isFinite(v) && v > 0 ? Math.round(v) : null)(parseFloat(document.getElementById('mIsoLabelSize')?.value)),
    displayGrid:  document.getElementById('mDisplayGrid')?.checked ?? true,     // contour axis grid (default on, v2.20.0)
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
    sizeCol:   document.getElementById('mSizeCol')?.value || null,          // scatter/parity bubble size (Phase 14)
    // Size-by detail (Phase 19, scatter/parity): law/min/max thread into BOTH
    // the bubbles and the size key; the rest customize the size legend.
    sizeLaw:        document.getElementById('mSizeLaw')?.value === 'diameter' ? 'diameter' : null, // null = area (honest default)
    sizeMin:        (v => Number.isFinite(v) ? v : null)(parseFloat(document.getElementById('mSizeMin')?.value)),
    sizeMax:        (v => Number.isFinite(v) ? v : null)(parseFloat(document.getElementById('mSizeMax')?.value)),
    sizeKeyLabel:   document.getElementById('mSizeKeyLabel')?.value.trim() || null,
    sizeKeyCount:   (v => Number.isFinite(v) ? v : null)(parseInt(document.getElementById('mSizeKeyCount')?.value)),
    sizeKeyHide:    document.getElementById('mSizeKeyHide')?.checked ?? false,
    sizeKeySeparate: document.getElementById('mSizeKeySeparate')?.checked ?? false,
    rightAxis: document.getElementById('mRightAxis')?.checked ?? false,     // scatter/line/bar (Phase 14)
    trendline: document.getElementById('mTrend')?.checked ?? false,         // scatter only
    trendDegree: parseInt(document.getElementById('mTrendDeg')?.value) || 1, // scatter only (Phase 13)
    trendGroups: document.getElementById('mTrendGroups')?.checked ?? false, // scatter only (Phase 11)
    colorCol:  document.getElementById('mColorCol')?.value || null,
    colorbarLabel: document.getElementById('mColorbarLabel')?.value.trim() || null, // numeric color-by (Phase 16)
    colormap:      document.getElementById('mColormap')?.value || null,             // per-series colormap override (v2.20.0; blank = inherit)
    colorbarTitleHide: document.getElementById('mColorbarHide')?.checked ?? false,   // hide the colorbar title (v2.18.0)
    colorReverse:      document.getElementById('mColorReverse')?.checked ?? false,   // reverse the colormap (v2.18.0)
    colorMin: (v => Number.isFinite(v) ? v : null)(parseFloat(document.getElementById('mColorMin')?.value)), // manual color range (v2.18.0)
    colorMax: (v => Number.isFinite(v) ? v : null)(parseFloat(document.getElementById('mColorMax')?.value)),
    contourLevels: (v => Number.isFinite(v) && v >= 2 ? Math.round(v) : null)(parseFloat(document.getElementById('mContourLevels')?.value)), // contour ncontours (v2.18.0)
    legendLabel:   document.getElementById('mLegendLabel')?.value.trim() || null,   // overrides auto legend text (Phase 16)
    legendHide:    document.getElementById('mLegendHide')?.checked ?? false,        // suppress legend entries (workspace ergonomics)
    filters:   _modalFilters.map(f => ({ ...f })),
    filterLogic: document.getElementById('mFilterLogic')?.value || 'and',
    style,
    enabled:   existing?.enabled ?? true, // preserve visibility toggle across edits
  };

  // Parity-specific fields. The join is OPTIONAL (Stab A): no join dataset =
  // same-dataset parity (X and Y are two columns here); a join dataset needs a key.
  if (chartType === 'parity') {
    series.joinDatasetId = document.getElementById('mJoinDataset')?.value || null;
    series.joinKey       = series.joinDatasetId ? (document.getElementById('mJoinKey')?.value || null) : null;
    // 3-way bridge join (v2.23.0): "Join by" bridge dataset (null = same as
    // compare-against = direct join) + the bridge→modelled key.
    const _jby = series.joinDatasetId ? (document.getElementById('mJoinByDataset')?.value || null) : null;
    series.joinByDatasetId = (_jby && _jby !== series.joinDatasetId) ? _jby : null;
    series.joinKeyB        = series.joinByDatasetId ? (document.getElementById('mJoinKeyB')?.value || null) : null;
    series.band5         = document.getElementById('mBand5')?.checked  ?? false;
    series.band10        = document.getElementById('mBand10')?.checked ?? true;
    series.bandColor     = document.getElementById('mBandColor')?.value || null;          // shared ±5%/±10% color
    series.bandOpacity   = (v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null)(parseFloat(document.getElementById('mBandOpacity')?.value));
    series.parityFit      = document.getElementById('mParityFit')?.checked ?? false;       // linear best-fit line + R²
    series.parityFitEquation = document.getElementById('mParityFitEquation')?.checked ?? true; // equation in legend (R² is in the box)
    series.parityFitSigFigs  = (v => Number.isFinite(v) && v >= 1 ? Math.min(10, Math.round(v)) : null)(parseFloat(document.getElementById('mParityFitSigFigs')?.value));
    series.parityFitColor = document.getElementById('mParityFitColor')?.value || null;     // fit-line color (absent = series color)
    series.parityFitWidth = (v => Number.isFinite(v) && v > 0 ? v : null)(parseFloat(document.getElementById('mParityFitWidth')?.value));
    series.parityFitStyle = document.getElementById('mParityFitStyle')?.value || null;     // solid|dash|dot|dashdot
    // Which stats to show in the box (v2.21.0): null = all four (keeps existing
    // sessions clean); an explicit array (incl. []) filters. N is governed by the
    // legend toggle below, not this list.
    series.parityShowN = document.getElementById('mParityShowN')?.checked ?? true;
    const _picked = [['nse','mStatNSE'],['mae','mStatMAE'],['rmse','mStatRMSE'],['r2','mStatR2']]
      .filter(([, id]) => document.getElementById(id)?.checked).map(([k]) => k);
    series.parityStats = _picked.length === 4 ? null : _picked;
    if (series.joinDatasetId && !series.joinKey) { err.textContent = 'Select a join key, or switch "Compare against" to this dataset.'; return false; }
    if (series.joinByDatasetId && !series.joinKeyB) { err.textContent = 'Select the second join key (bridge → modelled), or set "Join by" back to the compare-against dataset.'; return false; }
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
  syncActivePlotInputs(); // refresh shared color/size + colorbar options after a series add (v2.22.0)
  scheduleRender();
  closeModal();
  if (appState.plotRendered) debounceRender();
  return true;
}
