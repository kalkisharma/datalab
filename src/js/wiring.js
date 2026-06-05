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
  // Keyboard: the file input is natively focusable and opens on Enter —
  // no keydown shim on the wrapper (axe nested-interactive, Phase 4 audit)
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
  g('downloadBtn')   .addEventListener('click', () => downloadPlot('png'));
  g('downloadSvgBtn').addEventListener('click', () => downloadPlot('svg'));
  g('exportAllBtn')  .addEventListener('click', exportAllPlots);
  g('zipBtn')        .addEventListener('click', downloadZip);
  g('saveBtn')       .addEventListener('click', savePlot);

  // Session export/import
  g('sessionSaveBtn').addEventListener('click', exportSession);
  g('sessionLoadBtn').addEventListener('click', () => g('sessionFileInput').click());
  g('sessionFileInput').addEventListener('change', e => {
    if (e.target.files[0]) importSessionFile(e.target.files[0]);
    e.target.value = '';
  });

  // Style presets — Save opens the category picker (Phase 8)
  g('presetSaveBtn').addEventListener('click', openPresetPicker);
  g('presetSave')   .addEventListener('click', savePreset);
  g('presetCancel') .addEventListener('click', closePresetPicker);
  g('presetClose')  .addEventListener('click', closePresetPicker);
  g('presetOverlay').addEventListener('click', e => {
    if (e.target === g('presetOverlay')) closePresetPicker();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !g('presetOverlay').classList.contains('hidden')) closePresetPicker();
  });
  Object.keys(PRESET_PICKS).forEach(id => g(id).addEventListener('change', updatePresetSaveState));
  g('presetLoadBtn').addEventListener('click', () => g('presetFileInput').click());
  g('presetFileInput').addEventListener('change', e => {
    if (e.target.files[0]) loadPresetFile(e.target.files[0]);
    e.target.value = '';
  });

  // Data Tools modal
  g('dtClose').addEventListener('click', closeDataTools);
  g('dtCorrBtn').addEventListener('click', renderCorrelation);
  g('dtExportBtn').addEventListener('click', exportCleanedCSV);
  g('dataToolsOverlay').addEventListener('click', e => {
    if (e.target === g('dataToolsOverlay')) closeDataTools();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !g('dataToolsOverlay').classList.contains('hidden')) closeDataTools();
  });

  // Keyboard shortcuts reference (focus managed like other dialogs)
  let _helpTrigger = null;
  const closeHelp = () => { g('helpOverlay').classList.add('hidden'); _helpTrigger?.focus?.(); };
  g('helpBtn').addEventListener('click', () => {
    _helpTrigger = document.activeElement;
    g('helpOverlay').classList.remove('hidden');
    g('helpClose').focus();
  });
  g('helpClose').addEventListener('click', closeHelp);
  g('helpOverlay').addEventListener('click', e => { if (e.target === g('helpOverlay')) closeHelp(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !g('helpOverlay').classList.contains('hidden')) closeHelp();
  });

  // + Plot (Phase 7 grid)
  g('addPlotBtn').addEventListener('click', addPlot);

  // Manual axis ranges live in the ACTIVE plot's config
  ['xMin','xMax','yMin','yMax'].forEach(id => {
    g(id).addEventListener('input', () => {
      activePlot().plotConfig[id] = g(id).value;
      if (appState.plotRendered) debounceRender();
    });
  });
  // Log scales live in the ACTIVE plot's config (Phase 9)
  [['xLogChk', 'xLog'], ['yLogChk', 'yLog']].forEach(([id, key]) => {
    g(id).addEventListener('change', () => {
      activePlot().plotConfig[key] = g(id).checked;
      if (appState.plotRendered) renderPlot();
    });
  });
  g('resetRangesBtn').addEventListener('click', () => {
    ['xMin','xMax','yMin','yMax'].forEach(id => {
      g(id).value = '';
      activePlot().plotConfig[id] = '';
    });
    [['xLogChk', 'xLog'], ['yLogChk', 'yLog']].forEach(([id, key]) => {
      g(id).checked = false;
      activePlot().plotConfig[key] = false;
    });
    if (appState.plotRendered) renderPlot();
  });

  // Title / axis label lock buttons (active plot)
  [['titleLock', 'titleLocked'], ['xLabelLock', 'xLabelLocked'], ['yLabelLock', 'yLabelLocked']]
    .forEach(([btnId, flag]) => {
      g(btnId).addEventListener('click', () => {
        const cfg = activePlot().plotConfig;
        cfg[flag] = !cfg[flag];
        updateLockBtn(btnId, cfg[flag]);
        if (!cfg[flag]) syncAutoLabels();
        if (appState.plotRendered) renderPlot();
      });
    });

  // Title / label inputs write through to the active plot; typing locks the
  // field so the auto value stops overwriting it
  [['inputTitle', 'title', 'titleLocked', 'titleLock'],
   ['inputXLabel', 'xLabel', 'xLabelLocked', 'xLabelLock'],
   ['inputYLabel', 'yLabel', 'yLabelLocked', 'yLabelLock']]
    .forEach(([inputId, key, flag, btnId]) => {
      g(inputId).addEventListener('input', () => {
        const cfg = activePlot().plotConfig;
        cfg[key] = g(inputId).value;
        if (!cfg[flag]) { cfg[flag] = true; updateLockBtn(btnId, true); }
        if (appState.plotRendered) debounceRender();
      });
    });

  // Sliders
  syncSlider('markerSize',    'markerSizeVal',    '');
  syncSlider('markerOpacity', 'markerOpacityVal', '%');
  syncSlider('edgeWidth',     'edgeWidthVal',     '');
  syncSlider('fsTitle',  'fsTitleVal',  '');
  syncSlider('fsAxis',   'fsAxisVal',   '');
  syncSlider('fsTick',   'fsTickVal',   '');
  syncSlider('fsLegend', 'fsLegendVal', '');
  syncSlider('fsAnnot',  'fsAnnotVal',  '');
  syncSlider('frameWidth', 'frameWidthVal', '');
  syncSlider('gridWidth',  'gridWidthVal',  '');
  syncSliderNum('figW', 'figWNum');
  syncSliderNum('figH', 'figHNum');

  // Re-render on style changes
  ['plotBg','cmapSelect','edgeColor','majorGrid','minorGrid','frameColor','gridColor'].forEach(id => {
    g(id)?.addEventListener('change', () => { if (appState.plotRendered) renderPlot(); });
  });

  // Frame "auto" checkboxes: auto = follow the background theme; unchecking
  // enables the explicit color input (Phase 6, approved design)
  [['frameAuto', 'frameColor'], ['gridAuto', 'gridColor']].forEach(([autoId, colorId]) => {
    g(autoId).addEventListener('change', () => {
      g(colorId).disabled = g(autoId).checked;
      if (appState.plotRendered) renderPlot();
    });
  });

  // Legend visibility is per plot (active) so sessions round-trip it
  g('showLegend').addEventListener('change', () => {
    activePlot().plotConfig.legendShow = g('showLegend').checked;
    if (appState.plotRendered) renderPlot();
  });

  // beforeunload guard — warn if there are unsaved series or unsaved plot changes
  window.addEventListener('beforeunload', e => {
    if (appState.series.length || appState.plotRendered) {
      e.preventDefault();
      e.returnValue = ''; // required for Chrome to show the dialog
    }
  });

  renderPlotGrid();
  syncActivePlotInputs();
  renderSeriesList();
}

document.addEventListener('DOMContentLoaded', init);
