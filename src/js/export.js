// export.js — PNG/SVG download, ZIP export, and style presets

// ── Export ────────────────────────────────────────────────────────────────

function downloadPlot(format = 'png') {
  // Exports the ACTIVE panel; Export size sliders define the export size
  // (panels themselves autosize to their grid cell — Phase 7)
  const title    = activePlot().plotConfig.title || activePlot().name || 'datalab_plot';
  const filename = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'datalab_plot';
  const w = parseInt(document.getElementById('figW').value);
  const h = parseInt(document.getElementById('figH').value);
  // Note: scattergl traces (WebGL, >10k points) are rasterized inside the
  // SVG by Plotly — vector output applies to axes/text and SVG traces
  Plotly.downloadImage(activePlotDiv(), { format, width: w, height: h, filename });
}

// ── Export all (Phase 8) ──────────────────────────────────────────────────
// One PNG per visible plot panel, sequential downloads at the Export size.
// The browser may ask once for multiple-download permission (documented in
// the README); the maintainer chose individual files over a ZIP.

async function exportAllPlots() {
  const w = parseInt(document.getElementById('figW').value);
  const h = parseInt(document.getElementById('figH').value);
  const btn  = document.getElementById('exportAllBtn');
  const orig = btn.textContent;
  btn.disabled = true;
  try {
    let n = 0;
    for (const plot of appState.plots) {
      const pd = plotDivFor(plot.id);
      if (!pd || !pd.data || !pd.data.length) continue; // skip empty panels
      n++;
      btn.textContent = `${n}…`;
      const base = (plot.plotConfig.title || plot.name || '')
        .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || `plot_${n}`;
      await Plotly.downloadImage(pd, { format: 'png', width: w, height: h,
        filename: `${String(n).padStart(2, '0')}_${base}` });
    }
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// ── Style presets ─────────────────────────────────────────────────────────
//
// v2 (Phase 8): sectioned by category so the user chooses what a preset
// carries. v1 flat files keep loading — every category reads its fields
// from the same flat object. Format change logged in CHANGELOG ## Schema.

const PRESET_SCHEMA_V1 = 'datalab-style-preset-v1';
const PRESET_SCHEMA_V2 = 'datalab-style-preset-v2';

// Category → input ids. Loading applies ONLY ids listed here — file content
// never selects which DOM elements get written (allowlist, Security review).
const PRESET_CATEGORIES = {
  style:      { fields: ['plotBg', 'cmapSelect', 'markerSize', 'markerOpacity', 'edgeColor', 'edgeWidth'], checks: [] },
  exportSize: { fields: ['figW', 'figH'], checks: [] },
  typography: { fields: ['fsTitle', 'fsAxis', 'fsTick', 'fsLegend', 'fsAnnot'], checks: [] },
  frame:      { fields: ['frameColor', 'frameWidth', 'gridColor', 'gridWidth'],
                checks: ['frameAuto', 'gridAuto', 'majorGrid', 'minorGrid', 'showLegend'] },
};

// Picker checkbox id → category key
const PRESET_PICKS = { pcStyle: 'style', pcExportSize: 'exportSize',
                       pcTypography: 'typography', pcFrame: 'frame' };

let _presetTrigger = null; // focus restored here on close (ARIA checklist 3)

function openPresetPicker() {
  _presetTrigger = document.activeElement;
  document.getElementById('presetOverlay').classList.remove('hidden');
  document.getElementById('pcStyle').focus();
  updatePresetSaveState();
}

function closePresetPicker() {
  document.getElementById('presetOverlay').classList.add('hidden');
  _presetTrigger?.focus?.();
  _presetTrigger = null;
}

// Zero categories selected = nothing to save — disable rather than emit {}
function updatePresetSaveState() {
  const any = Object.keys(PRESET_PICKS).some(id => document.getElementById(id).checked);
  document.getElementById('presetSave').disabled = !any;
}

function savePreset() {
  const preset = { _schema: PRESET_SCHEMA_V2 };
  for (const [boxId, key] of Object.entries(PRESET_PICKS)) {
    if (!document.getElementById(boxId).checked) continue;
    const cat = PRESET_CATEGORIES[key], sec = {};
    cat.fields.forEach(id => { sec[id] = document.getElementById(id)?.value; });
    cat.checks.forEach(id => { sec[id] = document.getElementById(id)?.checked; });
    preset[key] = sec;
  }
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'datalab_style.json'; a.click();
  URL.revokeObjectURL(url); // safe to revoke immediately — download is async
  closePresetPicker();
}

function loadPresetFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let preset;
    try { preset = JSON.parse(reader.result); }
    catch { sessionAlert('Not a valid JSON file.'); return; }
    if (preset?._schema === PRESET_SCHEMA_V1) {
      // v1 flat preset = all categories, each reading from the flat object
      applyPresetSections({ style: preset, exportSize: preset, typography: preset, frame: preset });
    } else if (preset?._schema === PRESET_SCHEMA_V2) {
      applyPresetSections(preset);
    } else {
      sessionAlert('Not a DataLab style preset.');
    }
  };
  reader.readAsText(file);
}

function applyPresetSections(p) {
  for (const [key, cat] of Object.entries(PRESET_CATEGORIES)) {
    const sec = p[key];
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) continue; // shape check
    cat.fields.forEach(id => {
      const el = document.getElementById(id);
      if (el && sec[id] != null) el.value = sec[id];
    });
    cat.checks.forEach(id => {
      const el = document.getElementById(id);
      if (el && sec[id] != null) el.checked = !!sec[id];
    });
  }
  // Sync slider value displays and number twins
  [['markerSize','markerSizeVal',''], ['markerOpacity','markerOpacityVal','%'],
   ['edgeWidth','edgeWidthVal',''], ['fsTitle','fsTitleVal',''], ['fsAxis','fsAxisVal',''],
   ['fsTick','fsTickVal',''], ['fsLegend','fsLegendVal',''], ['fsAnnot','fsAnnotVal',''],
   ['frameWidth','frameWidthVal',''], ['gridWidth','gridWidthVal','']
  ].forEach(([id, valId, suffix]) => {
    const el = document.getElementById(id), val = document.getElementById(valId);
    if (el && val) val.textContent = el.value + suffix;
  });
  document.getElementById('figWNum').value = document.getElementById('figW').value;
  document.getElementById('figHNum').value = document.getElementById('figH').value;
  // Frame auto state drives the color inputs' enabled state
  document.getElementById('frameColor').disabled = document.getElementById('frameAuto').checked;
  document.getElementById('gridColor').disabled  = document.getElementById('gridAuto').checked;
  // Legend visibility mirrors into the ACTIVE plot's config (Phase 7)
  activePlot().plotConfig.legendShow = document.getElementById('showLegend').checked;
  if (appState.plotRendered) renderPlot();
}

async function downloadZip() {
  const plots = appState.savedPlots.filter(Boolean);
  const btn   = document.getElementById('zipBtn');
  if (!plots.length) {
    btn.textContent = 'Nothing saved';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = '↓ ZIP'; btn.disabled = false; }, 2000);
    return;
  }
  const orig = btn.textContent;
  btn.disabled = true;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(div);
  let exportErr = false;
  try {
    const zip = new JSZip();
    for (let i = 0; i < plots.length; i++) {
      btn.textContent = `${i + 1}/${plots.length}…`;
      const snap = plots[i];
      const w = snap.layout.width || 700, h = snap.layout.height || 500;
      div.style.width = w + 'px'; div.style.height = h + 'px';
      await Plotly.newPlot(div, snap.data, snap.layout, { staticPlot: true, displayModeBar: false });
      const url    = await Plotly.toImage(div, { format: 'png', width: w, height: h });
      const base64 = url.split(',')[1];
      const name   = (snap.title || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || `plot_${i + 1}`;
      zip.file(`${String(i + 1).padStart(2, '0')}_${name}.png`, base64, { base64: true });
      Plotly.purge(div);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'datalab_plots.zip'; a.click();
    URL.revokeObjectURL(url); // safe to revoke immediately — browser handles download async
  } catch (e) {
    console.error('ZIP export failed:', e); exportErr = true;
  } finally {
    div.remove(); btn.disabled = false;
    if (exportErr) { btn.textContent = 'Export failed'; setTimeout(() => { btn.textContent = orig; }, 3000); }
    else btn.textContent = orig;
  }
}
