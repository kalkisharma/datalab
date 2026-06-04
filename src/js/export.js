// export.js — PNG/SVG download, ZIP export, and style presets

// ── Export ────────────────────────────────────────────────────────────────

function downloadPlot(format = 'png') {
  const title    = document.getElementById('inputTitle').value || 'datalab_plot';
  const filename = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'datalab_plot';
  const w = parseInt(document.getElementById('figW').value);
  const h = parseInt(document.getElementById('figH').value);
  // Note: scattergl traces (WebGL, >10k points) are rasterized inside the
  // SVG by Plotly — vector output applies to axes/text and SVG traces
  Plotly.downloadImage('plotDiv', { format, width: w, height: h, filename });
}

// ── Style presets ─────────────────────────────────────────────────────────

const PRESET_SCHEMA = 'datalab-style-preset-v1';
const PRESET_FIELDS = ['plotBg', 'cmapSelect', 'markerSize', 'markerOpacity',
                       'edgeColor', 'edgeWidth', 'figW', 'figH'];
const PRESET_CHECKS = ['majorGrid', 'minorGrid'];

function savePreset() {
  const preset = { _schema: PRESET_SCHEMA };
  PRESET_FIELDS.forEach(id => { preset[id] = document.getElementById(id)?.value; });
  PRESET_CHECKS.forEach(id => { preset[id] = document.getElementById(id)?.checked; });
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'datalab_style.json'; a.click();
  URL.revokeObjectURL(url); // safe to revoke immediately — download is async
}

function loadPresetFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let preset;
    try { preset = JSON.parse(reader.result); }
    catch { sessionAlert('Not a valid JSON file.'); return; }
    if (preset?._schema !== PRESET_SCHEMA) { sessionAlert('Not a DataLab style preset.'); return; }
    PRESET_FIELDS.forEach(id => {
      const el = document.getElementById(id);
      if (el && preset[id] != null) el.value = preset[id];
    });
    PRESET_CHECKS.forEach(id => {
      const el = document.getElementById(id);
      if (el && preset[id] != null) el.checked = preset[id];
    });
    // Sync slider value displays and number twins
    document.getElementById('markerSizeVal').textContent    = document.getElementById('markerSize').value;
    document.getElementById('markerOpacityVal').textContent = document.getElementById('markerOpacity').value + '%';
    document.getElementById('edgeWidthVal').textContent     = document.getElementById('edgeWidth').value;
    document.getElementById('figWNum').value = document.getElementById('figW').value;
    document.getElementById('figHNum').value = document.getElementById('figH').value;
    if (appState.plotRendered) renderPlot();
  };
  reader.readAsText(file);
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
