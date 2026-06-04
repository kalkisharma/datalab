// wiring.js — event listeners, drag-drop dropzone, and DOM bootstrapping

// ── Utilities ─────────────────────────────────────────────────────────────

function g(id) { return document.getElementById(id); }

function uid() {
  return 'dl-' + Math.random().toString(36).slice(2, 9);
}

/**
 * @param {Function} fn
 * @param {number}   ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Dropzone ──────────────────────────────────────────────────────────────

function wireDropzone() {
  const dz = g('dropzone');
  const fi = g('fileInput');
  fi.addEventListener('change', e => {
    [...e.target.files].forEach(f => handleFile(f));
    fi.value = ''; // allow re-selecting the same file
  });
  dz.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); fi.click(); } });
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    [...e.dataTransfer.files].filter(f => f.name.endsWith('.csv')).forEach(f => handleFile(f));
  });
}

/**
 * @param {File} file
 */
function handleFile(file) {
  parseCSV(file, result => {
    if (!result.data.length) return;
    const headers = result.meta.fields || Object.keys(result.data[0] || {});
    if (!headers.length) return;

    const name = file.name.replace(/\.csv$/i, '');

    // Reload: same file name as an existing dataset replaces its data in
    // place (id, display name, and color survive), bumps the dataset
    // revision to invalidate caches, and re-validates every series that
    // references it
    const existing = appState.datasets.find(d => d.name === name);
    if (existing) {
      existing.rows    = result.data;
      existing.headers = headers;
      bumpDatasetRev(existing.id);
      const problems = appState.series
        .filter(s => s.datasetId === existing.id || s.joinDatasetId === existing.id)
        .map(s => ({ series: s, missing: validateSeriesColumns(s, appState.datasets) }))
        .filter(p => p.missing.length);
      showDataAlerts(existing, problems);
      renderDatasetList();
      renderSeriesList();
      if (appState.plotRendered) debounceRender();
      return;
    }

    // New dataset: pull color from palette by position
    const color = PALETTE[appState.datasets.length % PALETTE.length];
    appState.datasets.push({ id: uid(), name, rows: result.data, headers, color });
    showDataAlerts(null, []);
    renderDatasetList();
    renderSeriesList();
    updateRenderBtn();
  });
}

// ── Lock buttons ──────────────────────────────────────────────────────────

function updateLockBtn(id, locked) {
  const btn = g(id);
  if (!btn) return;
  btn.textContent = locked ? 'lock' : 'auto';
  btn.classList.toggle('locked', locked);
}

// ── Slider sync ───────────────────────────────────────────────────────────

function syncSlider(rangeId, valId, suffix) {
  const range = g(rangeId), val = g(valId);
  if (!range || !val) return;
  val.textContent = range.value + (suffix || '');
  range.addEventListener('input', () => {
    val.textContent = range.value + (suffix || '');
    if (appState.plotRendered) debounceRender();
  });
}

function syncSliderNum(rangeId, numId) {
  const range = g(rangeId), num = g(numId);
  if (!range || !num) return;
  num.value = range.value;
  range.addEventListener('input', () => { num.value = range.value; if (appState.plotRendered) debounceRender(); });
  num.addEventListener('input', () => {
    const v = Math.max(parseInt(num.min||0), Math.min(parseInt(num.max||99999), parseInt(num.value)||0));
    range.value = v; num.value = v;
    if (appState.plotRendered) debounceRender();
  });
}

const debounceRender = debounce(renderPlot, 350);

// ── Bootstrap ─────────────────────────────────────────────────────────────

function init() {
  wireDropzone();

  // Modal triggers
  g('addSeriesBtn').addEventListener('click', () => openModal(null));
  g('modalClose')  .addEventListener('click', closeModal);
  g('modalCancel') .addEventListener('click', closeModal);
  g('modalSave')   .addEventListener('click', saveModalSeries);

  // Close modal on overlay click (outside modal box)
  g('modalOverlay').addEventListener('click', e => {
    if (e.target === g('modalOverlay')) closeModal();
  });

  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !g('modalOverlay').classList.contains('hidden')) closeModal();
  });

  // Render button
  g('renderBtn').addEventListener('click', renderPlot);

  // Export buttons
  g('downloadBtn').addEventListener('click', downloadPlot);
  g('zipBtn')     .addEventListener('click', downloadZip);
  g('saveBtn')    .addEventListener('click', savePlot);

  // Reset axis ranges
  g('resetRangesBtn').addEventListener('click', () => {
    ['xMin','xMax','yMin','yMax'].forEach(id => { if (g(id)) g(id).value = ''; });
    if (appState.plotRendered) renderPlot();
  });

  // Title / axis label lock buttons
  g('titleLock').addEventListener('click', () => {
    appState.plotConfig.titleLocked = !appState.plotConfig.titleLocked;
    updateLockBtn('titleLock', appState.plotConfig.titleLocked);
    if (!appState.plotConfig.titleLocked) syncTitle();
    if (appState.plotRendered) renderPlot();
  });
  g('xLabelLock').addEventListener('click', () => {
    appState.plotConfig.xLabelLocked = !appState.plotConfig.xLabelLocked;
    updateLockBtn('xLabelLock', appState.plotConfig.xLabelLocked);
    if (!appState.plotConfig.xLabelLocked) syncXLabel();
    if (appState.plotRendered) renderPlot();
  });
  g('yLabelLock').addEventListener('click', () => {
    appState.plotConfig.yLabelLocked = !appState.plotConfig.yLabelLocked;
    updateLockBtn('yLabelLock', appState.plotConfig.yLabelLocked);
    if (!appState.plotConfig.yLabelLocked) syncYLabel();
    if (appState.plotRendered) renderPlot();
  });

  // Title / label inputs — re-render on change
  ['inputTitle','inputXLabel','inputYLabel'].forEach(id => {
    g(id)?.addEventListener('input', () => { if (appState.plotRendered) debounceRender(); });
  });

  // Sliders
  syncSlider('markerSize',    'markerSizeVal',    '');
  syncSlider('markerOpacity', 'markerOpacityVal', '%');
  syncSlider('edgeWidth',     'edgeWidthVal',     '');
  syncSliderNum('figW', 'figWNum');
  syncSliderNum('figH', 'figHNum');

  // Re-render on style changes
  ['plotBg','cmapSelect','edgeColor','majorGrid','minorGrid'].forEach(id => {
    g(id)?.addEventListener('change', () => { if (appState.plotRendered) renderPlot(); });
  });

  // beforeunload guard — warn if there are unsaved series or unsaved plot changes
  window.addEventListener('beforeunload', e => {
    if (appState.series.length || appState.plotRendered) {
      e.preventDefault();
      e.returnValue = ''; // required for Chrome to show the dialog
    }
  });

  updateLockBtn('titleLock',  false);
  updateLockBtn('xLabelLock', false);
  updateLockBtn('yLabelLock', false);
  renderSeriesList();
}

document.addEventListener('DOMContentLoaded', init);
