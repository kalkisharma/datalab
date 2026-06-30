// export.js — PNG/SVG download, ZIP export, and style presets

// ── Export ────────────────────────────────────────────────────────────────

// Shared filename sanitizer (Phase 8 refactor review — was duplicated at
// every export site): strips symbols, collapses whitespace to underscores
function safeFilename(s, fallback) {
  return String(s || '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || fallback;
}

// Export dimensions: the Export-size sliders, or — when "Match on-screen size"
// is ticked — the panel's live rendered pixel box (workspace ergonomics). The
// guard falls back to the sliders if the panel has no measured width yet.
function exportDims(pd) {
  const fw = parseInt(document.getElementById('figW').value);
  const fh = parseInt(document.getElementById('figH').value);
  if (document.getElementById('matchScreen')?.checked && pd && pd.clientWidth) {
    return { w: Math.round(pd.clientWidth), h: Math.round(pd.clientHeight) };
  }
  return { w: fw, h: fh };
}

async function downloadPlot(format = 'png') {
  // Exports the ACTIVE panel at the Export size, or the panel's on-screen size
  // when "Match on-screen size" is on (panels autosize to their cell).
  //
  // Renders off-screen via a fixed-size static newPlot + toImage — the same
  // proven path downloadZip uses — instead of Plotly.downloadImage on the live
  // responsive div. downloadImage clones-and-resizes the live div, and that
  // resize was dropping minor gridlines (and any zoomed range) from the image;
  // a fixed-size static render of a clone of the live layout is a faithful copy
  // of the screen (minor grid, current ranges, and decorations all included).
  const pd = activePlotDiv();
  if (!pd || !pd.data) return;
  const { w, h } = exportDims(pd);
  const filename = safeFilename(activePlot().plotConfig.title || activePlot().name, 'datalab_plot');
  // SVG notice (Stab A): scattergl traces (WebGL, >10k points) rasterize inside
  // the SVG — axes/text and non-GL traces stay vector. Tell the user rather
  // than let them discover blurry markers in a "vector" file.
  if (format === 'svg' && (pd._fullData || []).some(t => t.type === 'scattergl')) {
    const box = document.getElementById('dataAlerts');
    // innerHTML: static notice — no user data
    if (box) box.innerHTML = '<div class="alert warn" role="alert">SVG export: large scatter layers (&gt;10k points) use WebGL and rasterize inside the SVG — axes, text, and other traces stay vector.</div>';
  }
  const div = document.createElement('div');
  div.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;`;
  document.body.appendChild(div);
  try {
    const layout = JSON.parse(JSON.stringify(pd.layout)); // live layout incl. minor grid + current ranges
    layout.width = w; layout.height = h; layout.autosize = false; // fixed size — no responsive resize
    await Plotly.newPlot(div, pd.data, layout, { staticPlot: true, displayModeBar: false });
    const url = await Plotly.toImage(div, { format, width: w, height: h });
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.${format}`; a.click();
  } finally {
    Plotly.purge(div); div.remove();
  }
}

// ── Export plot data as CSV ───────────────────────────────────────────────
// The active plot's plotted points, long format: dataset, series, x, y (+ color
// / size when used). Rebuilt from each series' FILTERED rows via the same
// helpers the renderers use (applyFilters, innerJoinRows), so the CSV matches
// what's on screen. v1 covers the x/y series (scatter/line/parity); other
// chart types on the plot are skipped with a notice.
function exportPlotData() {
  const plot = activePlot();
  const pid  = plot.id;
  const XY   = new Set(['scatter', 'line', 'parity']);
  const series = appState.series.filter(s =>
    (s.plotId ?? appState.plots[0].id) === pid && s.enabled !== false);
  const out = [];
  let skipped = 0, usesColor = false, usesSize = false;

  for (const s of series) {
    const ds = appState.datasets.find(d => d.id === s.datasetId);
    if (!XY.has(s.chartType) || !ds || !s.xCol || !s.yCol) { skipped++; continue; }
    const sName = s.name || s.chartType;
    const filt  = rows => applyFilters(rows, s.filters || [], s.filterLogic || 'and');
    // A cross-dataset join (parity always-optional; scatter optional): X from
    // this dataset, Y from the joined one, matched + filtered together.
    let xRows, yRows;
    if (s.joinDatasetId && (s.chartType === 'parity' || s.chartType === 'scatter')) {
      const jds = appState.datasets.find(d => d.id === s.joinDatasetId);
      if (!jds || !s.joinKey) { skipped++; continue; }
      const { mA, mB } = innerJoinRows(ds.rows, jds.rows, s.joinKey);
      xRows = filt(mA); yRows = filt(mB);
    } else {
      xRows = yRows = filt(ds.rows);
    }
    const n = Math.min(xRows.length, yRows.length);
    for (let i = 0; i < n; i++) {
      const row = { dataset: ds.name, series: sName, x: xRows[i][s.xCol], y: yRows[i][s.yCol] };
      if (s.colorCol) { row.color = xRows[i][s.colorCol]; usesColor = true; }
      if (s.sizeCol)  { row.size  = xRows[i][s.sizeCol];  usesSize  = true; }
      out.push(row);
    }
  }

  if (!out.length) { flashNotice('No x/y series data on this plot to export.', 'warn'); return; }
  const columns = ['dataset', 'series', 'x', 'y', ...(usesColor ? ['color'] : []), ...(usesSize ? ['size'] : [])];
  const csv  = Papa.unparse(out, { columns });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${safeFilename(plot.plotConfig.title || plot.name, 'plot')}_data.csv`; a.click();
  URL.revokeObjectURL(url); // download is async; safe to revoke immediately
  if (skipped) flashNotice(`Exported ${out.length} points; ${skipped} non-x/y series not included.`, 'warn');
}

// ── Export all (Phase 8) ──────────────────────────────────────────────────
// One PNG per visible plot panel, sequential downloads at the Export size.
// The browser may ask once for multiple-download permission (documented in
// the README); the maintainer chose individual files over a ZIP.

async function exportAllPlots() {
  const btn  = document.getElementById('exportAllBtn');
  const orig = btn.textContent;
  btn.disabled = true;
  try {
    let n = 0;
    for (const plot of appState.plots) {
      if (plot.hidden) continue; // skip hidden panels (workspace ergonomics)
      const pd = plotDivFor(plot.id);
      if (!pd || !pd.data || !pd.data.length) continue; // skip empty panels
      n++;
      btn.textContent = `${n}…`;
      const { w, h } = exportDims(pd); // per panel — honors "Match on-screen size"
      const base = safeFilename(plot.plotConfig.title || plot.name, `plot_${n}`);
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
  typography: { fields: ['fsTitle', 'fsAxis', 'fsTick', 'fsLegend', 'fsAnnot', 'fsCbarTitle', 'fsCbarTick'], checks: ['fsCbarSeparate'] },
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
   ['frameWidth','frameWidthVal',''], ['gridWidth','gridWidthVal',''],
   ['fsCbarTitle','fsCbarTitleVal',''], ['fsCbarTick','fsCbarTickVal','']
  ].forEach(([id, valId, suffix]) => {
    const el = document.getElementById(id), val = document.getElementById(valId);
    if (el && val) val.textContent = el.value + suffix;
  });
  // Separate-colorbar-fonts toggle drives the two slider enabled states (v2.20.0)
  const cbSep = document.getElementById('fsCbarSeparate')?.checked;
  document.getElementById('fsCbarTitle').disabled = !cbSep;
  document.getElementById('fsCbarTick').disabled  = !cbSep;
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
      const name   = safeFilename(snap.title, `plot_${i + 1}`);
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
