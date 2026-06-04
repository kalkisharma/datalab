// filters.js — filter row UI inside the series modal (state lives in _modalFilters)
//
// Value cell adapts to the operator (Phase 3):
//   scalar ops (eq/neq/lt/gt/lte/gte) → one text input
//   in_range                          → min + max number inputs ({ min, max })
//   in_set                            → comma-separated text input (string[])

let _modalFilters = [];

function renderFilterList(filters, ds) {
  _modalFilters = filters.map(f => ({ ...f }));
  const list = document.getElementById('mFilterList');
  // innerHTML: empty string — no user data
  list.innerHTML = '';
  _modalFilters.forEach((f, i) => appendFilterRow(list, f, i, ds));
}

function filterValueCellHTML(f) {
  // escHtml applied to all user-entered filter values
  if (f.op === 'in_range') {
    const v = (f.value && typeof f.value === 'object' && !Array.isArray(f.value)) ? f.value : {};
    return `<input type="number" class="filter-val fv-min" value="${escHtml(String(v.min ?? ''))}" placeholder="min" aria-label="Range minimum" />
            <input type="number" class="filter-val fv-max" value="${escHtml(String(v.max ?? ''))}" placeholder="max" aria-label="Range maximum" />`;
  }
  if (f.op === 'in_set') {
    const v = Array.isArray(f.value) ? f.value.join(', ') : '';
    return `<input type="text" class="filter-val fv-set" value="${escHtml(v)}" placeholder="a, b, c" aria-label="Set values, comma separated" />`;
  }
  return `<input type="text" class="filter-val fv-scalar" value="${escHtml(String(f.value ?? ''))}" placeholder="Value" aria-label="Filter value" />`;
}

function wireFilterValueCell(row, i) {
  row.querySelector('.fv-scalar')?.addEventListener('input', e => { _modalFilters[i].value = e.target.value; });
  row.querySelector('.fv-set')?.addEventListener('input', e => {
    _modalFilters[i].value = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
  });
  const syncRange = () => {
    _modalFilters[i].value = {
      min: row.querySelector('.fv-min')?.value ?? '',
      max: row.querySelector('.fv-max')?.value ?? '',
    };
  };
  row.querySelector('.fv-min')?.addEventListener('input', syncRange);
  row.querySelector('.fv-max')?.addEventListener('input', syncRange);
}

function appendFilterRow(list, f, i, ds) {
  const colOptions = (ds?.headers || []).map(c =>
    `<option value="${escHtml(c)}" ${f.col===c?'selected':''}>${escHtml(c)}</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'filter-row';
  // innerHTML: column names escaped via escHtml() in colOptions; filter values escaped in filterValueCellHTML()
  row.innerHTML = `
    <input type="checkbox" class="filter-ena" ${f.enabled!==false?'checked':''} aria-label="Enable filter" />
    <select class="filter-col" aria-label="Filter column"><option value="">Column…</option>${colOptions}</select>
    <select class="filter-op" aria-label="Filter operator">
      <option value="eq"  ${f.op==='eq' ?'selected':''}>= </option>
      <option value="neq" ${f.op==='neq'?'selected':''}>≠ </option>
      <option value="lt"  ${f.op==='lt' ?'selected':''}>< </option>
      <option value="gt"  ${f.op==='gt' ?'selected':''}>> </option>
      <option value="lte" ${f.op==='lte'?'selected':''}>≤ </option>
      <option value="gte" ${f.op==='gte'?'selected':''}>≥ </option>
      <option value="in_range" ${f.op==='in_range'?'selected':''}>in range</option>
      <option value="in_set"   ${f.op==='in_set'  ?'selected':''}>in set</option>
    </select>
    <span class="filter-val-cell">${filterValueCellHTML(f)}</span>
    <button class="filter-del" aria-label="Remove filter">×</button>`;
  row.querySelector('.filter-col').addEventListener('change', e => { _modalFilters[i].col = e.target.value; });
  row.querySelector('.filter-op').addEventListener('change', e => {
    _modalFilters[i].op = e.target.value;
    // Operator family changed → reset the value and swap the value cell
    _modalFilters[i].value = e.target.value === 'in_range' ? { min: '', max: '' }
                           : e.target.value === 'in_set'   ? []
                           : '';
    const cell = row.querySelector('.filter-val-cell');
    // innerHTML: filter values escaped in filterValueCellHTML()
    cell.innerHTML = filterValueCellHTML(_modalFilters[i]);
    wireFilterValueCell(row, i);
  });
  wireFilterValueCell(row, i);
  row.querySelector('.filter-ena').addEventListener('change', e => { _modalFilters[i].enabled = e.target.checked; });
  row.querySelector('.filter-del').addEventListener('click',  () => {
    _modalFilters.splice(i, 1);
    renderFilterList(_modalFilters, document.getElementById('mDataset') ? appState.datasets.find(d=>d.id===document.getElementById('mDataset').value) : null);
    updateFilterCount();
  });
  list.appendChild(row);
}

function addFilterRow(ds) {
  const f = { col: ds?.headers?.[0] ?? '', op: 'eq', value: '', enabled: true };
  _modalFilters.push(f);
  const list = document.getElementById('mFilterList');
  appendFilterRow(list, f, _modalFilters.length - 1, ds);
}

function updateFilterCount() {
  const el = document.getElementById('mFilterCount');
  if (!el) return;
  const active = _modalFilters.filter(f => f.enabled !== false).length;
  el.textContent = active ? `(${active} active)` : '';
}
