// saves.js — save, restore, and delete named plot snapshots

async function savePlot() {
  if (!appState.plotRendered) return;
  const plotDiv = activePlotDiv(); // snapshot the active panel (Phase 7)
  const data    = JSON.parse(JSON.stringify(plotDiv._fullData    || []));
  const layout  = JSON.parse(JSON.stringify(plotDiv._fullLayout  || {}));
  const idx     = appState.savedPlots.length;
  const snap    = {
    data, layout,
    title: layout.title?.text || `Plot ${idx + 1}`,
    thumb: null,
  };
  appState.savedPlots.push(snap);
  mkCard(idx, snap, true);
  document.getElementById('savedStrip').style.display = '';
  document.getElementById('zipBtn').style.display     = '';
  try {
    const url = await Plotly.toImage(activePlotDiv(), { format: 'png', width: 200, height: 120 });
    snap.thumb = url;
    const img = document.querySelector(`#saved-card-${idx} .saved-thumb`);
    if (img) {
      img.src = url; img.style.display = '';
      const ph = img.previousElementSibling; if (ph) ph.style.display = 'none';
    }
  } catch (e) { /* thumbnail is optional */ }
}

function mkCard(idx, snap, scroll) {
  const strip = document.getElementById('savedScroll');
  const card  = document.createElement('div');
  card.className = 'saved-card'; card.id = `saved-card-${idx}`;
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  // escHtml applied to snap.title — may contain user-entered plot title
  card.innerHTML = `
    <div class="saved-thumb-placeholder" style="display:${snap.thumb?'none':'flex'}">generating…</div>
    <img class="saved-thumb" src="${snap.thumb||''}" style="display:${snap.thumb?'block':'none'}" alt="Plot thumbnail">
    <div class="saved-card-footer">
      <input class="saved-card-title" type="text" value="${escHtml(snap.title)}"
             placeholder="Title…" aria-label="Saved plot title" onclick="event.stopPropagation()" />
      <button class="saved-del" data-idx="${idx}" aria-label="Delete saved plot" title="Delete">×</button>
    </div>`;
  card.addEventListener('click', () => restorePlot(idx));
  card.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); restorePlot(idx); } });
  card.querySelector('.saved-card-title').addEventListener('input', function() {
    if (appState.savedPlots[idx]) appState.savedPlots[idx].title = this.value;
  });
  card.querySelector('.saved-del').addEventListener('click', e => { e.stopPropagation(); delSaved(idx); });
  strip.appendChild(card);
  if (scroll) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
}

function restorePlot(idx) {
  const snap = appState.savedPlots[idx]; if (!snap) return;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('plotGrid').classList.remove('hidden');
  // Restores into the ACTIVE panel (Phase 7); autosize overrides any fixed
  // size stored in older snapshots
  const pd = activePlotDiv();
  Plotly.react(pd, snap.data, { ...snap.layout, autosize: true, width: undefined, height: undefined }, {
    responsive: false, displayModeBar: true, displaylogo: false,
    edits: { legendPosition: true, annotationPosition: true },
  });
  appState.plotRendered = true;
  document.querySelectorAll('.saved-card').forEach(c => c.classList.remove('active-card'));
  document.getElementById(`saved-card-${idx}`)?.classList.add('active-card');
}

function delSaved(idx) {
  // Set to null rather than splice so numeric IDs in card IDs stay stable
  appState.savedPlots[idx] = null;
  document.getElementById(`saved-card-${idx}`)?.remove();
  if (!appState.savedPlots.filter(Boolean).length) {
    document.getElementById('savedStrip').style.display = 'none';
  }
}
