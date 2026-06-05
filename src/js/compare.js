// compare.js — Compare groups section of the Data Tools modal (Phase 13)
// (own module from day one — EL §6 foresight ruling: datatools.js was at
// 263 lines when this was scoped; tests in distributions.js, UI here)
//
// Reporting rule (§20): the verdict line always carries effect size and
// per-group n — a p-value never renders alone.

function compareSectionHTML(ds) {
  const numericCols = ds.headers.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  if (numericCols.length === 0) return '';
  // escHtml applied to all column names in both pickers
  const numOpts = numericCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const grpOpts = ds.headers.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  return `
    <div class="modal-section-title">Compare groups</div>
    <div class="modal-field">
      <label class="modal-label" for="cmpVal">Numeric column</label>
      <select id="cmpVal">${numOpts}</select>
    </div>
    <div class="modal-field">
      <label class="modal-label" for="cmpGroup">Group column</label>
      <select id="cmpGroup">${grpOpts}</select>
    </div>
    <button class="btn btn-sm" id="cmpRun">Compare</button>
    <div id="cmpResult" aria-live="polite"></div>`;
}

function wireCompareSection(ds) {
  const btn = document.getElementById('cmpRun');
  if (!btn) return; // dataset had no numeric columns
  btn.addEventListener('click', () => runCompare(ds));
}

function runCompare(ds) {
  const valCol = document.getElementById('cmpVal').value;
  const grpCol = document.getElementById('cmpGroup').value;
  const box = document.getElementById('cmpResult');
  // textContent for messages; table path below escapes all user strings
  const msg = t => { box.textContent = t; };

  // Group finite values by category, preserving first-seen order
  const byCat = new Map();
  for (const r of ds.rows) {
    const v = finiteOrNaN(r[valCol]);
    if (!Number.isFinite(v)) continue;
    const cat = String(r[grpCol] ?? '(blank)');
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(v);
  }
  const excluded = [...byCat.entries()].filter(([, v]) => v.length < 2).map(([c]) => c);
  const usable   = [...byCat.entries()].filter(([, v]) => v.length >= 2);
  if (usable.length < 2) { msg('Need at least 2 groups with 2+ finite values each.'); return; }
  if (usable.length > 50) { msg(`"${grpCol}" has ${usable.length} groups — filter to fewer than 50 to compare.`); return; }

  const names  = usable.map(([c]) => c);
  const groups = usable.map(([, v]) => v);
  const fmt  = v => Number(v).toPrecision(4);
  const fmtP = p => p < 0.0001 ? 'p < 0.0001' : `p = ${Number(p).toPrecision(2)}`;

  let verdict, rows;
  if (groups.length === 2) {
    const r = tTestWelch(groups[0], groups[1]);
    if (!r) { msg('Both groups are constant — no variance to test.'); return; }
    verdict = `Welch t = ${fmt(r.t)}, df = ${fmt(r.df)}, ${fmtP(r.p)}, Cohen's d = ${fmt(r.d)}`;
    rows = [
      { name: names[0], n: r.n1, mean: r.m1, sd: r.s1 },
      { name: names[1], n: r.n2, mean: r.m2, sd: r.s2 },
    ];
  } else {
    const r = anovaOneWay(groups);
    if (!r) { msg('All groups are constant — no variance to test.'); return; }
    verdict = `F(${r.dfb}, ${r.dfw}) = ${fmt(r.F)}, ${fmtP(r.p)}, η² = ${fmt(r.eta2)}`;
    rows = r.groups.map((g, i) => ({ name: names[i], ...g }));
  }

  // escHtml applied to group names and the excluded list — user data;
  // verdict numbers are computed numerics
  box.innerHTML = `
    <table class="stats-table" style="margin-top:8px">
      <thead><tr><th scope="col">Group</th><th scope="col">n</th>
        <th scope="col">mean</th><th scope="col">SD</th></tr></thead>
      <tbody>${rows.map(g =>
        `<tr><td>${escHtml(g.name)}</td><td>${g.n}</td><td>${fmt(g.mean)}</td><td>${fmt(g.sd)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="field-hint" style="margin-top:6px"><strong>${verdict}</strong>${
      excluded.length ? ` — excluded (fewer than 2 values): ${excluded.map(escHtml).join(', ')}` : ''}</div>`;
}
