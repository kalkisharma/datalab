// compare.js — Compare groups section of the Data Tools modal
// (Phase 13: Welch t / ANOVA; Phase 15: Method select adds Mann–Whitney /
// Kruskal–Wallis, Compare select adds paired columns — paired t / Wilcoxon.
// Own module from day one — EL §6 foresight ruling.)
//
// Reporting rules (§20 + Phase 15 pre-impl review): the verdict line always
// carries effect size and n — a p-value never renders alone; rank-based
// verdicts append "(normal approx.)" whenever any group/pair count is
// below 10; rank-based tables show median + IQR (the honest center for the
// test being run), parametric tables show mean + SD.

function compareSectionHTML(ds) {
  const numericCols = ds.headers.filter(c => classifyColumn(ds.rows, c) === 'numeric');
  if (numericCols.length === 0) return '';
  // escHtml applied to all column names in all three pickers
  const numOpts = numericCols.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const grpOpts = ds.headers.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const pairedOff = numericCols.length < 2
    ? ' disabled title="Paired comparison needs at least 2 numeric columns"' : '';
  return `
    <div class="modal-section-title">Compare groups</div>
    <div class="modal-field">
      <label class="modal-label" for="cmpKind">Compare</label>
      <select id="cmpKind">
        <option value="groups">Groups</option>
        <option value="paired"${pairedOff}>Paired columns</option>
      </select>
    </div>
    <div class="modal-field">
      <label class="modal-label" for="cmpMethod">Method</label>
      <select id="cmpMethod">
        <option value="param">Parametric</option>
        <option value="rank">Rank-based</option>
      </select>
    </div>
    <div class="modal-field">
      <label class="modal-label" for="cmpVal">Numeric column</label>
      <select id="cmpVal">${numOpts}</select>
    </div>
    <div class="modal-field" id="cmpGroupField">
      <label class="modal-label" for="cmpGroup">Group column</label>
      <select id="cmpGroup">${grpOpts}</select>
    </div>
    <div class="modal-field hidden" id="cmpVal2Field">
      <label class="modal-label" for="cmpVal2">Second column</label>
      <select id="cmpVal2">${numOpts}</select>
    </div>
    <button class="btn btn-sm" id="cmpRun">Compare</button>
    <div id="cmpResult" aria-live="polite"></div>`;
}

function wireCompareSection(ds) {
  const btn = document.getElementById('cmpRun');
  if (!btn) return; // dataset had no numeric columns
  document.getElementById('cmpKind').addEventListener('change', e => {
    const paired = e.target.value === 'paired';
    document.getElementById('cmpGroupField').classList.toggle('hidden', paired);
    document.getElementById('cmpVal2Field').classList.toggle('hidden', !paired);
  });
  btn.addEventListener('click', () => runCompare(ds));
}

// ── Shared formatting ─────────────────────────────────────────────────────

const _cmpFmt  = v => Number(v).toPrecision(4);
const _cmpFmtP = p => p < 0.0001 ? 'p < 0.0001' : `p = ${Number(p).toPrecision(2)}`;

// Median + IQR for the rank-based table rows
function _cmpRankRow(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  return { center: quantile(sorted, 0.5),
           spread: quantile(sorted, 0.75) - quantile(sorted, 0.25) };
}

// Result table + verdict. Rank-based shows median/IQR (DS ruling — the
// honest center for the test being run); parametric shows mean/SD.
// escHtml applied to row names (user data); all numbers are computed.
function _cmpRender(box, rows, rank, verdict, extra, nameHdr) {
  const [c1, c2] = rank ? ['median', 'IQR'] : ['mean', 'SD'];
  // escHtml applied to row names (callers escape anything else user-sourced
  // in verdict/extra, e.g. excluded group names); numbers are computed
  box.innerHTML = `
    <table class="stats-table" style="margin-top:8px">
      <thead><tr><th scope="col">${nameHdr || 'Group'}</th><th scope="col">n</th>
        <th scope="col">${c1}</th><th scope="col">${c2}</th></tr></thead>
      <tbody>${rows.map(g =>
        `<tr><td>${escHtml(g.name)}</td><td>${g.n}</td><td>${_cmpFmt(g.center)}</td><td>${_cmpFmt(g.spread)}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="field-hint" style="margin-top:6px"><strong>${verdict}</strong>${extra}</div>`;
}

// ── Run ───────────────────────────────────────────────────────────────────

function runCompare(ds) {
  const box = document.getElementById('cmpResult');
  const msg = t => { box.textContent = t; }; // textContent for messages
  if (document.getElementById('cmpKind').value === 'paired') runComparePaired(ds, box, msg);
  else runCompareGroups(ds, box, msg);
}

function runCompareGroups(ds, box, msg) {
  const valCol = document.getElementById('cmpVal').value;
  const grpCol = document.getElementById('cmpGroup').value;
  const rank   = document.getElementById('cmpMethod').value === 'rank';

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
  // (normal approx.) marker: any group below 10 (pre-impl review, §20)
  const approx = rank && groups.some(g => g.length < 10) ? ' (normal approx.)' : '';

  let verdict, rows;
  if (groups.length === 2 && !rank) {
    const r = tTestWelch(groups[0], groups[1]);
    if (!r) { msg('Both groups are constant — no variance to test.'); return; }
    verdict = `Welch t = ${_cmpFmt(r.t)}, df = ${_cmpFmt(r.df)}, ${_cmpFmtP(r.p)}, Cohen's d = ${_cmpFmt(r.d)}`;
    rows = [
      { name: names[0], n: r.n1, center: r.m1, spread: r.s1 },
      { name: names[1], n: r.n2, center: r.m2, spread: r.s2 },
    ];
  } else if (groups.length === 2) {
    const r = mannWhitneyU(groups[0], groups[1]);
    if (!r) { msg('Every value is identical — no ordering to test.'); return; }
    verdict = `Mann–Whitney U = ${_cmpFmt(r.U)}, ${_cmpFmtP(r.p)}, rank-biserial r = ${_cmpFmt(r.r)}${approx}`;
    rows = groups.map((g, i) => ({ name: names[i], n: g.length, ..._cmpRankRow(g) }));
  } else if (!rank) {
    const r = anovaOneWay(groups);
    if (!r) { msg('All groups are constant — no variance to test.'); return; }
    verdict = `F(${r.dfb}, ${r.dfw}) = ${_cmpFmt(r.F)}, ${_cmpFmtP(r.p)}, η² = ${_cmpFmt(r.eta2)}`;
    rows = r.groups.map((g, i) => ({ name: names[i], n: g.n, center: g.mean, spread: g.sd }));
  } else {
    const r = kruskalWallis(groups);
    if (!r) { msg('Every value is identical — no ordering to test.'); return; }
    verdict = `Kruskal–Wallis H(${r.df}) = ${_cmpFmt(r.H)}, ${_cmpFmtP(r.p)}, ε² = ${_cmpFmt(r.eps2)}${approx}`;
    rows = groups.map((g, i) => ({ name: names[i], n: g.length, ..._cmpRankRow(g) }));
  }

  // escHtml applied to the excluded group names — user data
  _cmpRender(box, rows, rank, verdict,
    excluded.length ? ` — excluded (fewer than 2 values): ${excluded.map(escHtml).join(', ')}` : '');
}

function runComparePaired(ds, box, msg) {
  const col1 = document.getElementById('cmpVal').value;
  const col2 = document.getElementById('cmpVal2').value;
  const rank = document.getElementById('cmpMethod').value === 'rank';
  if (col1 === col2) { msg('Pick two different columns to compare as pairs.'); return; }

  // A pair = a row where BOTH values are finite. A dropped pair = a row
  // where exactly one is — rows missing both never formed a pair
  // (pre-impl review definition).
  const xs = [], ys = [];
  let dropped = 0;
  for (const r of ds.rows) {
    const a = finiteOrNaN(r[col1]), b = finiteOrNaN(r[col2]);
    const fa = Number.isFinite(a), fb = Number.isFinite(b);
    if (fa && fb) { xs.push(a); ys.push(b); }
    else if (fa !== fb) dropped++;
  }
  if (xs.length < 2) { msg('Need at least 2 complete pairs (rows with both values).'); return; }

  let verdict;
  if (!rank) {
    const r = pairedT(xs, ys);
    if (!r) { msg('The differences are constant — no variability to test.'); return; }
    verdict = `Paired t = ${_cmpFmt(r.t)}, df = ${r.df}, ${_cmpFmtP(r.p)}, dz = ${_cmpFmt(r.dz)}`;
  } else {
    const r = wilcoxonSignedRank(xs, ys);
    if (!r) { msg('The two columns are equal in every complete pair — nothing to test.'); return; }
    const approx = r.n < 10 ? ' (normal approx.)' : '';
    const zeros  = r.nZero ? `, ${r.nZero} zero difference(s) dropped` : '';
    verdict = `Wilcoxon W = ${_cmpFmt(r.W)}, ${_cmpFmtP(r.p)}, rank-biserial r = ${_cmpFmt(r.r)}${zeros}${approx}`;
  }

  const rows = [
    { name: col1, n: xs.length, ...(rank ? _cmpRankRow(xs) : { center: xs.reduce((a, b) => a + b, 0) / xs.length, spread: sampleSd(xs) }) },
    { name: col2, n: ys.length, ...(rank ? _cmpRankRow(ys) : { center: ys.reduce((a, b) => a + b, 0) / ys.length, spread: sampleSd(ys) }) },
  ];
  // n pairs is inseparable from the verdict (§20); dropped count when any
  _cmpRender(box, rows, rank, verdict,
    ` — n = ${xs.length} pairs${dropped ? `, ${dropped} incomplete pair(s) dropped` : ''}`,
    'Column');
}

// Sample SD (n−1) for the paired parametric table
function sampleSd(vals) {
  const n = vals.length;
  const m = vals.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(vals.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
}
