// filters.js — filter row UI inside the series modal (state lives in _modalFilters)

let _modalFilters = [];

function renderFilterList(filters, ds) {
  _modalFilters = filters.map(f => ({ ...f }));
  const list = document.getElementById('mFilterList');
  // innerHTML: empty string — no user data
  list.innerHTML = '';
  _modalFilters.forEach((f, i) => appendFilterRow(list, f, i, ds));
}

function appendFilterRow(list, f, i, ds) {
  const colOptions = (ds?.headers || []).map(c =>
    `<option value="${escHtml(c)}" ${f.col===c?'selected':''}>${escHtml(c)}</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'filter-row';
  // innerHTML: column names escaped via escHtml() in colOptions; filter value escaped via escHtml()
  row.innerHTML = `
    <input type="checkbox" class="filter-ena" ${f.enabled!==false?'checked':''} aria-label="Enable filter" />
    <select class="filter-col"><option value="">Column…</option>${colOptions}</select>
    <select class="filter-op">
      <option value="eq"  ${f.op==='eq' ?'selected':''}>= </option>
      <option value="neq" ${f.op==='neq'?'selected':''}>≠ </option>
      <option value="lt"  ${f.op==='lt' ?'selected':''}>< </option>
      <option value="gt"  ${f.op==='gt' ?'selected':''}>> </option>
      <option value="lte" ${f.op==='lte'?'selected':''}>≤ </option>
      <option value="gte" ${f.op==='gte'?'selected':''}>≥ </option>
    </select>
    <input type="text" class="filter-val" value="${escHtml(String(f.value??''))}" placeholder="Value" />
    <button class="filter-del" aria-label="Remove filter">×</button>`;
  row.querySelector('.filter-col').addEventListener('change', e => { _modalFilters[i].col = e.target.value; });
  row.querySelector('.filter-op' ).addEventListener('change', e => { _modalFilters[i].op  = e.target.value; });
  row.querySelector('.filter-val').addEventListener('input',  e => { _modalFilters[i].value = e.target.value; });
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
