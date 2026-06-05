// datatools.js — per-dataset Data Tools modal: summary stats, cleaning
// operations, correlation heatmap, CSV export (Phase 5)

let _dtDatasetId = null;
let _dtTrigger   = null;
let _dtPage      = 0; // preview page (Phase 9)

function openDataTools(dsId) {
  const ds = appState.datasets.find(d => d.id === dsId);
  if (!ds) return;
  _dtDatasetId = dsId;
  _dtTrigger   = document.activeElement;
  _dtPage      = 0;

  document.getElementById('dtTitle').textContent = `Data Tools — ${ds.name}`;
  document.getElementById('dtMsg').textContent = '';
  renderDataToolsBody(ds);

  const numericCols = ds.headers.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  const corrBtn = document.getElementById('dtCorrBtn');
  corrBtn.disabled = numericCols.length < 2;
  corrBtn.title = corrBtn.disabled
    ? 'Correlation needs at least 2 numeric columns'
    : 'Render a Pearson correlation heatmap to the plot area';

  document.getElementById('dataToolsOverlay').classList.remove('hidden');
  document.getElementById('dtClose').focus(); // ARIA: focus into the dialog
}

function closeDataTools() {
  document.getElementById('dataToolsOverlay').classList.add('hidden');
  _dtTrigger?.focus?.();
  _dtDatasetId = null;
  _dtTrigger   = null;
}

function renderDataToolsBody(ds) {
  const body = document.getElementById('dtBody');
  const numericCols = ds.headers.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  const fmt = v => Number(v).toPrecision(4);

  // Summary stats table
  let statsHtml;
  if (!numericCols.length) {
    statsHtml = '<div class="empty-hint">No numeric columns in this dataset.</div>';
  } else {
    // escHtml applied to column names; stats values are computed numerics
    statsHtml = `<table class="stats-table">
      <thead><tr><th scope="col">Column</th><th scope="col">n</th><th scope="col">miss</th>
        <th scope="col">mean</th><th scope="col">std</th><th scope="col">min</th>
        <th scope="col">P25</th><th scope="col">med</th><th scope="col">P75</th><th scope="col">max</th></tr></thead>
      <tbody>` +
      numericCols.map(c => {
        const s = summaryStats(ds.rows, c);
        if (!s) return `<tr><td>${escHtml(c)}</td><td colspan="9">no finite values</td></tr>`;
        return `<tr><td>${escHtml(c)}</td><td>${s.n}</td><td>${s.missing}</td>
          <td>${fmt(s.mean)}</td><td>${fmt(s.std)}</td><td>${fmt(s.min)}</td>
          <td>${fmt(s.p25)}</td><td>${fmt(s.median)}</td><td>${fmt(s.p75)}</td><td>${fmt(s.max)}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  // escHtml applied to all column names in the picker
  const colOptions = ds.headers.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  // innerHTML: column names escaped above; everything else is static markup
  body.innerHTML = `
    <div class="modal-section-title" style="margin-top:0;padding-top:0;border-top:none">Summary statistics</div>
    ${statsHtml}
    <div class="modal-section-title">Preview</div>
    <div id="dtPreview"></div>
    <div class="modal-section-title">Cleaning</div>
    <div class="modal-field">
      <label class="modal-label" for="dtCol">Column</label>
      <select id="dtCol">${colOptions}</select>
    </div>
    <div class="modal-field">
      <label class="modal-label" for="dtNewName">Rename to</label>
      <div class="input-lock-row">
        <input type="text" class="ctrl-input" id="dtNewName" placeholder="New column name" />
        <button class="btn btn-sm" id="dtRenameBtn">Rename</button>
      </div>
    </div>
    <div class="check-row" style="gap:8px">
      <button class="btn btn-sm" id="dtDropBtn">Drop column</button>
      <button class="btn btn-sm" id="dtCastBtn">Cast to numeric</button>
    </div>
    <div class="modal-field" style="margin-top:14px">
      <label class="modal-label" for="dtMissMode">Missing values</label>
      <div class="input-lock-row">
        <select id="dtMissMode" style="flex:2">
          <option value="drop">Drop rows</option>
          <option value="mean">Fill with mean</option>
          <option value="median">Fill with median</option>
          <option value="value">Fill with value…</option>
        </select>
        <input type="text" class="ctrl-input" id="dtFillVal" placeholder="value" style="flex:1;display:none" />
        <button class="btn btn-sm" id="dtMissBtn">Apply</button>
      </div>
    </div>
    <div class="modal-section-title">New column</div>
    <div class="modal-field">
      <label class="modal-label" for="dtNcName">Name</label>
      <input type="text" class="ctrl-input" id="dtNcName" placeholder="New column name" />
    </div>
    <div class="modal-field">
      <label class="modal-label" for="dtNcExpr">Expression</label>
      <input type="text" class="ctrl-input" id="dtNcExpr"
             placeholder="(temp - 32) * 5/9 — columns by name, \`backticks\` for spaces" />
      <div class="field-hint" id="dtNcPreview" aria-live="polite"></div>
    </div>
    <button class="btn btn-sm" id="dtNcAdd" disabled>Add column</button>`;

  // Wire cleaning ops
  const col = () => document.getElementById('dtCol').value;
  const msg = t => { document.getElementById('dtMsg').textContent = t; }; // textContent — no escaping needed

  document.getElementById('dtMissMode').addEventListener('change', e => {
    document.getElementById('dtFillVal').style.display = e.target.value === 'value' ? '' : 'none';
  });

  document.getElementById('dtRenameBtn').addEventListener('click', () => {
    const nw = document.getElementById('dtNewName').value.trim();
    const old = col();
    if (!renameColumn(ds, old, nw)) { msg('Rename failed: empty or duplicate name.'); return; }
    const touched = renameColumnRefs(appState.series, ds.id, old, nw);
    afterCleaningOp(ds, `Renamed "${old}" to "${nw}" — ${touched} series reference(s) updated.`);
  });

  document.getElementById('dtDropBtn').addEventListener('click', () => {
    const c = col();
    dropColumn(ds, c);
    afterCleaningOp(ds, `Dropped "${c}". Series that referenced it will show a clear error until edited.`);
  });

  document.getElementById('dtCastBtn').addEventListener('click', () => {
    const c = col();
    const failed = castNumeric(ds, c);
    afterCleaningOp(ds, `Cast "${c}" to numeric — ${failed} value(s) could not be parsed and are now missing.`);
  });

  document.getElementById('dtMissBtn').addEventListener('click', () => {
    const c = col(), mode = document.getElementById('dtMissMode').value;
    const fillVal = document.getElementById('dtFillVal').value;
    const count = handleMissing(ds, c, mode, fillVal);
    afterCleaningOp(ds, mode === 'drop'
      ? `Dropped ${count} row(s) with missing "${c}".`
      : `Filled ${count} missing value(s) in "${c}".`);
  });

  // New column (Phase 12): live parse preview on every keystroke; Add
  // materializes values once (provenance — source edits do NOT recompute).
  // All output goes through textContent — expression text never reaches
  // innerHTML.
  const ncName = document.getElementById('dtNcName');
  const ncExpr = document.getElementById('dtNcExpr');
  const ncPrev = document.getElementById('dtNcPreview');
  const ncAdd  = document.getElementById('dtNcAdd');
  const ncSync = () => {
    const name = ncName.value.trim();
    if (!ncExpr.value.trim()) { ncPrev.textContent = ''; ncAdd.disabled = true; return; }
    const { ast, error } = parseExpr(ncExpr.value, ds.headers);
    if (error) { ncPrev.textContent = error; ncAdd.disabled = true; return; }
    const sample = ds.rows.slice(0, 5)
      .map(r => { const v = evalExpr(ast, r); return Number.isFinite(v) ? String(+v.toPrecision(6)) : 'NaN'; });
    let note = '';
    if (!name) note = ' — enter a column name';
    else if (ds.headers.includes(name)) note = ` — "${name}" already exists`;
    ncPrev.textContent = `Preview: ${sample.join(', ')}${ds.rows.length > 5 ? ', …' : ''}${note}`;
    ncAdd.disabled = !!note;
  };
  ncName.addEventListener('input', ncSync);
  ncExpr.addEventListener('input', ncSync);
  ncAdd.addEventListener('click', () => {
    const name = ncName.value.trim();
    const { ast, error } = parseExpr(ncExpr.value, ds.headers);
    if (error || !name || ds.headers.includes(name)) return;
    for (const r of ds.rows) r[name] = evalExpr(ast, r); // materialize once
    ds.headers.push(name);
    (ds.computed = ds.computed || {})[name] = ncExpr.value; // provenance metadata
    afterCleaningOp(ds, `Added "${name}" = ${ncExpr.value} — materialized; later source edits do not recompute.`);
  });

  renderDTPreview(ds); // preview reflects the dataset as it currently stands
}

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

// Every op invalidates caches, re-validates series, refreshes UI in place
function afterCleaningOp(ds, message) {
  bumpDatasetRev(ds.id);
  const problems = appState.series
    .filter(s => s.datasetId === ds.id || s.joinDatasetId === ds.id)
    .map(s => ({ series: s, missing: validateSeriesColumns(s, appState.datasets) }))
    .filter(p => p.missing.length);
  showDataAlerts(ds, problems);
  renderDatasetList();
  renderSeriesList();
  renderDataToolsBody(ds); // stats table reflects the change immediately
  document.getElementById('dtMsg').textContent = message;
  if (appState.plotRendered) debounceRender();
}

// ── Correlation heatmap (rendered to the plot area as a one-off view) ─────

function renderCorrelation() {
  const ds = appState.datasets.find(d => d.id === _dtDatasetId);
  if (!ds) return;
  const cols = ds.headers.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  if (cols.length < 2) return;

  const m  = pearsonMatrix(ds.rows, cols).map(row => row.map(v => Number.isFinite(v) ? v : null));
  const th = plotTheme();
  const pd = activePlotDiv();
  Plotly.react(pd, [{
    type: 'heatmap',
    x: cols, y: cols, z: m,
    zmin: -1, zmax: 1,
    colorscale: 'RdBu', reversescale: true, // +1 warm, −1 cool, 0 white
    colorbar: { title: { text: 'Pearson r' } },
    hovertemplate: '%{x} × %{y}: r = %{z:.3f}<extra></extra>',
  }], {
    paper_bgcolor: th.bg, plot_bgcolor: th.bg,
    autosize: true,
    font: { family: 'IBM Plex Sans,system-ui,sans-serif', color: th.text, size: 12 },
    title: { text: `Correlation — ${ds.name}`, x: 0.5, xanchor: 'center', font: { size: 14, color: th.title } },
    xaxis: { tickfont: { size: 10, color: th.tick } },
    yaxis: { tickfont: { size: 10, color: th.tick }, autorange: 'reversed' },
    margin: { l: 100, r: 30, t: 50, b: 80 },
  }, { responsive: false, displayModeBar: true, displaylogo: false });

  appState.plotRendered = true;
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('plotGrid').classList.remove('hidden');
  document.getElementById('downloadBtn').style.display    = '';
  document.getElementById('downloadSvgBtn').style.display = '';
  // Screen reader summary of the matrix
  const sr = document.getElementById('plotSR-' + activePlot().id);
  if (sr) sr.textContent = `Correlation matrix for ${ds.name}: ${cols.length} numeric columns. ` +
    cols.flatMap((a, i) => cols.slice(i + 1).map((b, jo) =>
      `${a} and ${b}: ${m[i][i + 1 + jo] === null ? 'undefined' : m[i][i + 1 + jo].toFixed(3)}`
    )).join('; ');
  closeDataTools();
}

// ── CSV export ────────────────────────────────────────────────────────────

function exportCleanedCSV() {
  const ds = appState.datasets.find(d => d.id === _dtDatasetId);
  if (!ds) return;
  // Papa.unparse with the header list as the column set — dropped columns
  // stay out of the file even though row objects may still hold the values
  const csv  = Papa.unparse(ds.rows, { columns: ds.headers });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const name = safeFilename(ds.name, 'dataset'); // shared sanitizer in export.js
  a.href = url; a.download = `${name}_cleaned.csv`; a.click();
  URL.revokeObjectURL(url); // safe to revoke immediately — download is async
}
