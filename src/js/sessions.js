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
    if (v > 2) {
      sessionAlert(`This session was saved by a newer DataLab (state v${v}) — update the app to load it.`);
      return;
    }
    const st = migrateSessionState(payload.state);
    if (!sessionIdsValid(st)) {
      sessionAlert('Session file rejected: malformed internal ids.');
      return;
    }
    applySessionState(st);
  };
  reader.readAsText(file);
}

// Ids from a session file are interpolated into innerHTML id/data attributes
// and querySelector strings (grid.js, ui.js) — escHtml does not cover them.
// Only uid()-shaped ids are accepted so a crafted file cannot smuggle markup
// or selector metacharacters through an id field. Legitimate files always
// pass: uid() emits [a-z0-9-] and the migration uses 'p1'.
const SAFE_ID = /^[\w-]{1,64}$/;

function sessionIdsValid(st) {
  const ids = [
    st.activePlotId,
    ...(st.plots    ?? []).map(p => p.id),
    ...(st.datasets ?? []).map(d => d.id),
    ...(st.series   ?? []).flatMap(s => [s.id, s.plotId, s.datasetId, s.joinDatasetId]),
  ];
  return ids.every(v => v == null || SAFE_ID.test(String(v)));
}

// Migrations per state version (STANDARDS.md §3). v2 is current.
function migrateSessionState(st) {
  if ((st.version ?? 0) <= 1) {
    // v1 → v2 (Phase 7 multi-plot): wrap the singleton plotConfig into
    // plots[0] and assign every series to it — a v1 file loads identically
    // into a 1-plot grid
    const pid = 'p1';
    st.plots = [{
      id: pid, name: 'Plot 1',
      plotConfig: { ...makeDefaultPlotConfig(), ...(st.plotConfig ?? {}) },
    }];
    (st.series ?? []).forEach(s => { if (!s.plotId) s.plotId = pid; });
    delete st.plotConfig;
    st.activePlotId = pid;
    st.version = 2;
  }
  return st;
}

function applySessionState(st) {
  // Release the outgoing datasets' memoized columns and every live panel
  // before replacing them
  appState.datasets.forEach(d => bumpDatasetRev(d.id));
  appState.plots.forEach(p => clearPanel(p.id));

  appState.version      = st.version;
  appState.datasets     = st.datasets   ?? [];
  appState.series       = st.series     ?? [];
  appState.plots        = (st.plots && st.plots.length) ? st.plots
                          : [{ id: 'p1', name: 'Plot 1', plotConfig: makeDefaultPlotConfig() }];
  appState.activePlotId = appState.plots.some(p => p.id === st.activePlotId)
                          ? st.activePlotId : appState.plots[0].id;
  appState.style        = { ...appState.style, ...(st.style ?? {}) };
  appState.savedPlots   = st.savedPlots ?? [];
  appState.plotRendered = false;

  // Imported data invalidates every cache keyed on dataset revisions
  appState.datasets.forEach(d => bumpDatasetRev(d.id));

  renderPlotGrid();
  syncActivePlotInputs(); // mirrors the active plot's config into the UI
  renderDatasetList();
  renderSeriesList();
  updateRenderBtn();
  showDataAlerts(null, []);

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
