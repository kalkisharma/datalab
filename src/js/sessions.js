// sessions.js — full-state session export/import (JSON round-trip)
//
// The exported file carries the complete appState — datasets (rows
// included), series, plot config, style, saved plots — plus the state
// schema version. Import validates the schema marker and runs migrations
// for older versions before applying. Newer-than-supported versions are
// refused with a clear message rather than half-loaded.

const SESSION_SCHEMA = 'datalab-session';

function exportSession() {
  const payload = {
    _schema: SESSION_SCHEMA,
    app:     VERSION,
    saved:   new Date().toISOString(),
    state:   appState,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'datalab_session.json'; a.click();
  URL.revokeObjectURL(url); // safe to revoke immediately — download is async
}

function importSessionFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let payload;
    try { payload = JSON.parse(reader.result); }
    catch { sessionAlert('Not a valid JSON file.'); return; }
    if (payload?._schema !== SESSION_SCHEMA || !payload.state) {
      sessionAlert('Not a DataLab session file.'); return;
    }
    const v = payload.state.version ?? 0;
    if (v > 1) {
      sessionAlert(`This session was saved by a newer DataLab (state v${v}) — update the app to load it.`);
      return;
    }
    applySessionState(migrateSessionState(payload.state));
  };
  reader.readAsText(file);
}

// Migration stubs per state version (STANDARDS.md §3). v1 is current.
function migrateSessionState(st) {
  // v0 → v1: no released v0 files exist; treat as v1
  st.version = 1;
  return st;
}

function applySessionState(st) {
  // Release the outgoing datasets' memoized columns before replacing them
  appState.datasets.forEach(d => bumpDatasetRev(d.id));

  appState.version      = st.version;
  appState.datasets     = st.datasets   ?? [];
  appState.series       = st.series     ?? [];
  appState.plotConfig   = { ...appState.plotConfig, ...(st.plotConfig ?? {}) };
  appState.style        = { ...appState.style,      ...(st.style      ?? {}) };
  appState.savedPlots   = st.savedPlots ?? [];
  appState.plotRendered = false;

  // Imported data invalidates every cache keyed on dataset revisions
  appState.datasets.forEach(d => bumpDatasetRev(d.id));

  renderDatasetList();
  renderSeriesList();
  updateRenderBtn();
  showDataAlerts(null, []);

  // Mirror session-carried plotConfig flags back into their UI controls
  const legendCb = document.getElementById('showLegend');
  if (legendCb) legendCb.checked = appState.plotConfig.legendShow ?? true;

  // Rebuild the saved plots strip
  const strip = document.getElementById('savedScroll');
  // innerHTML: empty string — no user data
  strip.innerHTML = '';
  appState.savedPlots.forEach((snap, i) => { if (snap) mkCard(i, snap, false); });
  document.getElementById('savedStrip').style.display =
    appState.savedPlots.filter(Boolean).length ? '' : 'none';

  if (appState.series.length) renderPlot();
}

function sessionAlert(msg) {
  const box = document.getElementById('dataAlerts');
  // innerHTML: message escaped via escHtml — may quote file content
  if (box) box.innerHTML = `<div class="alert danger" role="alert">${escHtml(msg)}</div>`;
}
