// date-prompt.js — ambiguous-date format prompt (split from modal.js at the
// Stabilization-A §6 review: modal.js had reached 323 lines and the next modal
// change was the parity single-dataset work; this self-contained dialog was
// the named split seam). Called from saveModalSeries (data.js drives the
// detection); resumes the save via the onDone callback.

let _dateFmtAC = null;

function showDateFormatPrompt(ds, col, onDone) {
  const overlay = document.getElementById('dateFmtOverlay');
  const text    = document.getElementById('dateFmtText');
  const prev    = document.activeElement;

  const samples = ds.rows.map(r => r[col]).filter(v => v != null && v !== '').slice(0, 3);
  // textContent — no HTML interpretation, no escaping needed
  text.textContent = `The dates in "${col}" are ambiguous (e.g. ${samples.join(', ')}). Which format are they?`;

  _dateFmtAC?.abort();
  _dateFmtAC = new AbortController();
  const sig = _dateFmtAC.signal;

  const close = () => { overlay.classList.add('hidden'); _dateFmtAC.abort(); };
  const choose = fmt => {
    ds.dateFormats = ds.dateFormats || {};
    ds.dateFormats[col] = fmt;
    bumpDatasetRev(ds.id); // cached traces depend on the parse format
    close();
    onDone();
  };
  const cancel = () => { close(); prev?.focus?.(); }; // back to the series modal, unsaved

  document.getElementById('dateFmtMDY').addEventListener('click', () => choose('MDY'), { signal: sig });
  document.getElementById('dateFmtDMY').addEventListener('click', () => choose('DMY'), { signal: sig });
  document.getElementById('dateFmtClose').addEventListener('click', cancel, { signal: sig });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
  }, { signal: sig, capture: true });

  overlay.classList.remove('hidden');
  document.getElementById('dateFmtMDY').focus(); // ARIA: focus first action
}
