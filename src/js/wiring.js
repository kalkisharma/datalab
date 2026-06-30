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

// ── Dialog wiring ─────────────────────────────────────────────────────────
// Every dialog shares the same chrome: close button(s), a click on the
// overlay outside the box, and Escape. One registry and ONE document-level
// keydown listener replace the four copy-pasted blocks this file had grown
// (§6 review, Phase 15 — behavior identical: dialogs are mutually exclusive,
// and each old Esc listener only acted on its own open dialog anyway).

const _dialogs = [];

function wireDialog(overlayId, closeFn, closeBtnIds) {
  _dialogs.push({ overlayId, closeFn });
  closeBtnIds.forEach(id => g(id).addEventListener('click', closeFn));
  g(overlayId).addEventListener('click', e => {
    if (e.target === g(overlayId)) closeFn();
  });
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  _dialogs.forEach(({ overlayId, closeFn }) => {
    if (!g(overlayId).classList.contains('hidden')) closeFn();
  });
});

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
  g('pasteSeriesBtn').addEventListener('click', pasteSeries);
  g('modalSave')   .addEventListener('click', saveModalSeries);
  wireDialog('modalOverlay', closeModal, ['modalClose', 'modalCancel']);

  // Export buttons
  g('downloadBtn')   .addEventListener('click', () => downloadPlot('png'));
  g('downloadSvgBtn').addEventListener('click', () => downloadPlot('svg'));
  g('exportAllBtn')  .addEventListener('click', exportAllPlots);
  g('exportDataBtn') .addEventListener('click', exportPlotData);
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
  wireDialog('presetOverlay', closePresetPicker, ['presetCancel', 'presetClose']);
  Object.keys(PRESET_PICKS).forEach(id => g(id).addEventListener('change', updatePresetSaveState));
  g('presetLoadBtn').addEventListener('click', () => g('presetFileInput').click());
  g('presetFileInput').addEventListener('change', e => {
    if (e.target.files[0]) loadPresetFile(e.target.files[0]);
    e.target.value = '';
  });

  // Data Tools modal
  g('dtCorrBtn').addEventListener('click', renderCorrelation);
  g('dtExportBtn').addEventListener('click', exportCleanedCSV);
  wireDialog('dataToolsOverlay', closeDataTools, ['dtClose']);

  // Keyboard shortcuts reference (focus managed like other dialogs)
  let _helpTrigger = null;
  const closeHelp = () => { g('helpOverlay').classList.add('hidden'); _helpTrigger?.focus?.(); };
  g('helpBtn').addEventListener('click', () => {
    _helpTrigger = document.activeElement;
    g('helpOverlay').classList.remove('hidden');
    g('helpClose').focus();
  });
  wireDialog('helpOverlay', closeHelp, ['helpClose']);

  // + Plot (Phase 7 grid)
  g('addPlotBtn').addEventListener('click', addPlot);

  // Manual axis ranges live in the ACTIVE plot's config
  ['xMin','xMax','yMin','yMax'].forEach(id => {
    g(id).addEventListener('input', () => {
      activePlot().plotConfig[id] = g(id).value;
      if (appState.plotRendered) debounceRender();
    });
  });
  // Per-plot colormap override (v2.20.0): blank = inherit the global picker
  g('plotCmap')?.addEventListener('change', () => {
    activePlot().plotConfig.colormap = g('plotCmap').value || null;
    if (appState.plotRendered) renderPlot();
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
  syncSlider('fsCbarTitle', 'fsCbarTitleVal', ''); // separate colorbar fonts (v2.20.0)
  syncSlider('fsCbarTick',  'fsCbarTickVal',  '');
  syncSlider('frameWidth', 'frameWidthVal', '');
  syncSlider('gridWidth',  'gridWidthVal',  '');
  syncSliderNum('figW', 'figWNum');
  syncSliderNum('figH', 'figHNum');
  // "Match on-screen size" greys the export-size sliders (workspace ergonomics)
  document.getElementById('matchScreen').addEventListener('change', e => {
    ['figW', 'figWNum', 'figH', 'figHNum'].forEach(id => { document.getElementById(id).disabled = e.target.checked; });
  });

  // Re-render on style changes
  ['plotBg','cmapSelect','edgeColor','majorGrid','minorGrid','frameColor','gridColor'].forEach(id => {
    g(id)?.addEventListener('change', () => { if (appState.plotRendered) renderPlot(); });
  });

  // Separate colorbar fonts (v2.20.0): the toggle enables/disables the two
  // dedicated sliders and re-renders.
  g('fsCbarSeparate')?.addEventListener('change', () => {
    const on = g('fsCbarSeparate').checked;
    g('fsCbarTitle').disabled = !on;
    g('fsCbarTick').disabled  = !on;
    if (appState.plotRendered) debounceRender();
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
  g('showStats').addEventListener('change', () => {
    activePlot().plotConfig.statsShow = g('showStats').checked;
    if (appState.plotRendered) renderPlot();
  });
  g('showNotes').addEventListener('change', () => { // notes visibility (v2.21.0)
    activePlot().plotConfig.notesShow = g('showNotes').checked;
    if (appState.plotRendered) renderPlot();
  });

  // Notes (Phase 14) — added to the ACTIVE plot at center; dragging
  // persists via the relayout hook in chart.js
  g('noteAdd').addEventListener('click', () => {
    const text = g('noteText').value.trim();
    if (!text) return;
    const cfg = activePlot().plotConfig;
    (cfg.notes = cfg.notes ?? []).push({ id: uid(), text, x: 0.5, y: 0.5 });
    g('noteText').value = '';
    renderNoteList();
    if (appState.plotRendered) renderPlot();
  });

  // Subplot grid (Phase 10) — 1×1 stores null so non-grid plots stay
  // byte-identical to v2.2 sessions
  const syncGridControls = () => {
    const rows = parseInt(g('gridRows').value), cols = parseInt(g('gridCols').value);
    activePlot().grid = (rows * cols > 1)
      ? { rows, cols, shareX: g('gridShareX').checked, shareY: g('gridShareY').checked }
      : null;
    if (appState.plotRendered) renderPlot();
  };
  ['gridRows', 'gridCols', 'gridShareX', 'gridShareY'].forEach(id =>
    g(id).addEventListener('change', syncGridControls));
  // Subplot-wide color/size-by (workspace ergonomics)
  ['sharedColorCol', 'sharedSizeCol'].forEach(id =>
    g(id).addEventListener('change', () => {
      activePlot().plotConfig[id] = g(id).value || null;
      syncActivePlotInputs(); // refresh the shared-colorbar block visibility (v2.22.0)
      if (appState.plotRendered) renderPlot();
    }));

  // Keep the label-suggestion datalist current: repopulate whenever a label
  // field is focused (covers "loaded a CSV, then typed a label", v2.22.0).
  ['inputTitle', 'inputXLabel', 'inputYLabel', 'cellXLabel', 'cellYLabel'].forEach(id =>
    g(id)?.addEventListener('focus', populateLabelDatalist));

  // Per-cell overrides (v2.22.0): the Edit-cell selector re-points the fields;
  // each field writes plotConfig.cells["r,c"][field] (blank removes it).
  g('cellTarget')?.addEventListener('change', loadCellOverrideFields);
  const writeCell = (field, el) => {
    const key = g('cellTarget')?.value; if (!/^\d+,\d+$/.test(key || '')) return;
    const cfg = activePlot().plotConfig;
    cfg.cells = cfg.cells || {};
    const ov = { ...(cfg.cells[key] || {}) };
    const v = el.value.trim();
    if (v) ov[field] = v; else delete ov[field];
    if (Object.keys(ov).length) cfg.cells[key] = ov; else delete cfg.cells[key];
    if (appState.plotRendered) debounceRender();
  };
  [['cellTitle', 'title'], ['cellXLabel', 'xLabel'], ['cellYLabel', 'yLabel']].forEach(([id, field]) =>
    g(id)?.addEventListener('input', () => writeCell(field, g(id))));

  // Shared colorbar override (v2.22.0): the six controls collapse into
  // plotConfig.colorbar, or null when entirely empty (= use per-series).
  const writeSharedCb = () => {
    const cfg = activePlot().plotConfig;
    const num = id => { const n = parseFloat(g(id).value); return Number.isFinite(n) ? n : null; };
    const o = {
      colormap: g('sharedCbMap').value || null,
      label:    g('sharedCbTitle').value.trim() || null,
      titleHide: g('sharedCbHide').checked,
      reverse:   g('sharedCbReverse').checked,
      min: num('sharedCbMin'), max: num('sharedCbMax'),
    };
    const empty = !o.colormap && !o.label && !o.titleHide && !o.reverse && o.min == null && o.max == null;
    cfg.colorbar = empty ? null : o;
    if (appState.plotRendered) renderPlot();
  };
  ['sharedCbMap', 'sharedCbTitle', 'sharedCbHide', 'sharedCbReverse', 'sharedCbMin', 'sharedCbMax'].forEach(id =>
    g(id)?.addEventListener('change', writeSharedCb));

  // Bulk axis retarget: one-shot — set the column on all series, then reset
  // the select (it's an action trigger, not a persistent value)
  [['bulkXCol', 'x'], ['bulkYCol', 'y']].forEach(([id, axis]) =>
    g(id).addEventListener('change', () => {
      const col = g(id).value;
      g(id).value = '';
      bulkSetAxis(axis, col);
    }));

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
