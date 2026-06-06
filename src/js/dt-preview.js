// dt-preview.js — paginated data preview for the Data Tools modal
// (split from datatools.js at the Phase 14 exit refactor review — verbatim
// move; pagination is the perf guarantee: ≤ one page of DOM rows)

let _dtPage = 0;

function resetDTPreviewPage() { _dtPage = 0; }

// ── Data preview (Phase 9) ────────────────────────────────────────────────
// Paginated table of the dataset as it currently stands. Pagination IS the
// performance guarantee: never more than one page of DOM rows, any dataset
// size. Headers list = visible columns, so dropped columns stay out.

const DT_PAGE_SIZE = 50;

function renderDTPreview(ds) {
  const box = document.getElementById('dtPreview');
  if (!box) return;
  const total = ds.rows.length;
  const pages = Math.max(1, Math.ceil(total / DT_PAGE_SIZE));
  _dtPage = Math.max(0, Math.min(_dtPage, pages - 1)); // clamp after row drops
  const start = _dtPage * DT_PAGE_SIZE;
  const slice = ds.rows.slice(start, start + DT_PAGE_SIZE);
  // innerHTML: every header and cell escaped via escHtml — raw user CSV
  // content, the largest injection surface in the app (Security-reviewed)
  box.innerHTML = `
    <div class="dt-preview-scroll">
      <table class="stats-table dt-preview">
        <thead><tr>${ds.headers.map(h => `<th scope="col">${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${slice.map(r =>
          `<tr>${ds.headers.map(h => `<td>${escHtml(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="dt-page-row">
      <button class="btn btn-sm" id="dtPrevPage" ${_dtPage === 0 ? 'disabled' : ''} aria-label="Previous preview page">‹ Prev</button>
      <span class="dt-page-info" aria-live="polite">rows ${total ? start + 1 : 0}–${Math.min(start + DT_PAGE_SIZE, total)} of ${total}</span>
      <button class="btn btn-sm" id="dtNextPage" ${_dtPage >= pages - 1 ? 'disabled' : ''} aria-label="Next preview page">Next ›</button>
    </div>`;
  document.getElementById('dtPrevPage').addEventListener('click', () => { _dtPage--; renderDTPreview(ds); });
  document.getElementById('dtNextPage').addEventListener('click', () => { _dtPage++; renderDTPreview(ds); });
}
