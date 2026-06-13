// comparison.spec.js — Welch t, ANOVA, incomplete beta, log-space binning,
// polynomial trendlines (Phase 13); rank-based and paired tests (Phase 15)
//
// Phase 15 reference policy (§20 + pre-impl review): the tie-corrected
// normal approximation IS the documented definition — references are
// hand-derived from those formulas (z → p via the normal CDF, derived
// independently), with tolerance checks against published exact values:
// - normal CDF anchor: Φ(−1.96) = 0.0250 (standard normal table)
// - χ² anchors: χ²(0.05, df 2) = 5.991 ⇒ p = 0.05; χ²(0.01, df 5) = 15.086
//   ⇒ p = 0.01 (published tables); df 2 closed form p = e^(−x/2)
// - MWU hand case [1..5] vs [6..10]: U = 0, σ² = (25/12)·11, z = −12/σ =
//   −2.50672, p = 2Φ(z) = 0.012186
// - MWU bracket at the published critical value U(10,10, α=.05 two-tail)=23:
//   constructed no-tie samples with U=23 (p=0.04515 < .05) and U=24
//   (p=0.05390 > .05)
// - KW hand case [1,2,3],[4,5,6],[7,8,9]: R = 6,15,24 ⇒ H = 7.2, df = 2,
//   p = e^(−3.6) = 0.0273237, ε² = 7.2/8 = 0.9
// - Wilcoxon hand case diffs [1..6] all positive: W = 0, σ² = 22.75,
//   z = −10/4.7697 = −2.09657, p = 0.036032; exact-enumeration check at
//   n=10, W=8: 25 subsets of {1..10} sum ≤ 8 ⇒ exact p = 50/1024 =
//   0.048828; approximation 0.052787, |gap| = 0.00396 < 0.005 tolerance
// - paired t hand case [5,6,7,8] vs [1,2,4,4]: diffs [4,4,3,4] ⇒ mean 3.75,
//   sd 0.5, t = 15, df = 3, dz = 7.5; published t(0.001, df 3) = 10.215 ⇒
//   p < 0.002
//
// Reference policy (§20):
// - p-values: PUBLISHED STATISTICAL TABLES are the independent source.
//   t critical values (two-tailed): t(0.025, df=10) = 2.228 ⇒ p = 0.05;
//   t(0.05, df=10) = 1.812 ⇒ p = 0.10. F critical values:
//   F(0.05; 3, 10) = 3.708 ⇒ p = 0.05; F(0.01; 2, 12) = 6.927 ⇒ p = 0.01.
//   (Standard tables, e.g. NIST/SEMATECH e-Handbook.)
// - Welch hand case: x=[1..5] (m=3, s²=2.5), y=[2,4,6,8,10] (m=6, s²=10):
//   t = −3/√(0.5+2) = −1.897367; df = 2.5²/(0.5²/4 + 2²/4) = 5.882;
//   pooled SD = √(((4)(2.5)+(4)(10))/8) = 2.5 ⇒ d = −1.2.
// - ANOVA hand case: [1,2,3],[2,3,4],[6,7,8]: SSB=42, SSW=6, F(2,6)=21,
//   η² = 42/48 = 0.875; published F(0.01;2,6)=10.92 ⇒ p < 0.01.
// - Polynomial: exact recovery (fitting y=x²−2x+3 returns [3,−2,1], R²=1)
//   plus the defining normal-equation property (residuals ⟂ design columns).

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);
}

test('p-values match published critical-value tables', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    t10_2228: pTwoTailedT(2.228, 10),
    t10_1812: pTwoTailedT(1.812, 10),
    f310_3708: pUpperF(3.708, 3, 10),
    f212_6927: pUpperF(6.927, 2, 12),
    beta_half: regIncBeta(0.5, 2, 2), // symmetric: exactly 0.5
  }));
  expect(out.t10_2228).toBeCloseTo(0.05, 3);
  expect(out.t10_1812).toBeCloseTo(0.10, 3);
  expect(out.f310_3708).toBeCloseTo(0.05, 3);
  expect(out.f212_6927).toBeCloseTo(0.01, 3);
  expect(out.beta_half).toBeCloseTo(0.5, 10);
});

test('Welch t-test matches the hand-derived case; degenerate guards hold', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    r: tTestWelch([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]),
    constant: tTestWelch([3, 3, 3], [5, 5, 5]),
    tooFew: tTestWelch([1], [2, 3]),
  }));
  expect(out.r.t).toBeCloseTo(-1.897367, 5);
  expect(out.r.df).toBeCloseTo(5.882, 3);
  expect(out.r.d).toBeCloseTo(-1.2, 10);
  expect(out.r.p).toBeGreaterThan(0.10); // |t|=1.897 < t(0.05,5.88)≈1.95
  expect(out.r.p).toBeLessThan(0.13);
  expect(out.constant).toBeNull();
  expect(out.tooFew).toBeNull();
});

test('one-way ANOVA matches the hand-derived case', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() =>
    anovaOneWay([[1, 2, 3], [2, 3, 4], [6, 7, 8]]));
  expect(r.F).toBeCloseTo(21, 10);
  expect(r.dfb).toBe(2);
  expect(r.dfw).toBe(6);
  expect(r.eta2).toBeCloseTo(0.875, 10);
  expect(r.p).toBeLessThan(0.01);    // published F(0.01;2,6) = 10.92 < 21
  expect(r.p).toBeGreaterThan(0.0005);
  expect(r.groups.map(g => g.mean)).toEqual([2, 3, 7]);
});

test('normal CDF and chi-squared match published tables', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    phi196: normalCdf(-1.96),
    phi0:   normalCdf(0),
    chi2_2: pUpperChi2(5.991, 2),
    chi2_5: pUpperChi2(15.086, 5),
    chi2df2closed: pUpperChi2(3.6, 2), // df 2 closed form: e^(−1.8)
  }));
  expect(out.phi196).toBeCloseTo(0.025, 4);
  expect(out.phi0).toBeCloseTo(0.5, 6); // A–S 7.1.26 documented |ε| < 1.5e−7
  expect(out.chi2_2).toBeCloseTo(0.05, 3);
  expect(out.chi2_5).toBeCloseTo(0.01, 3);
  expect(out.chi2df2closed).toBeCloseTo(Math.exp(-1.8), 6);
});

test('rankWithTies: average ranks and the tie term', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => rankWithTies([10, 20, 20, 30]));
  expect(out.ranks).toEqual([1, 2.5, 2.5, 4]);
  expect(out.tieSum).toBe(6); // one tie group of 2: 2³−2
});

test('Mann-Whitney U: hand case, published critical-value bracket, guards', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    hand: mannWhitneyU([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]),
    // No-tie constructions with U1 = 23 / 24 against ys = 1..10
    // (published two-tailed α=.05 critical U for n1=n2=10 is 23)
    u23: mannWhitneyU([-1, -2, -3, -4, 1.5, 2.5, 3.5, 4.5, 5.5, 8.5],
                      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    u24: mannWhitneyU([-1, -2, -3, -4, 1.5, 2.5, 3.5, 4.5, 6.5, 8.5],
                      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    constant: mannWhitneyU([3, 3, 3], [3, 3, 3]), // no ordering information
    tooFew: mannWhitneyU([1], [2, 3]),
  }));
  expect(out.hand.U).toBe(0);
  expect(out.hand.p).toBeCloseTo(0.012186, 5);
  expect(out.hand.r).toBeCloseTo(-1, 10); // group 1 entirely smaller
  expect(out.u23.U).toBe(23);
  expect(out.u23.p).toBeLessThan(0.05);   // 0.04515
  expect(out.u24.U).toBe(24);
  expect(out.u24.p).toBeGreaterThan(0.05); // 0.05390
  expect(out.constant).toBeNull();
  expect(out.tooFew).toBeNull();
});

test('Kruskal-Wallis: hand case with the df-2 closed form', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() =>
    kruskalWallis([[1, 2, 3], [4, 5, 6], [7, 8, 9]]));
  expect(r.H).toBeCloseTo(7.2, 10);
  expect(r.df).toBe(2);
  expect(r.p).toBeCloseTo(Math.exp(-3.6), 6); // 0.0273237
  expect(r.eps2).toBeCloseTo(0.9, 10);
});

test('paired t: hand case and the constant-difference guard', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    hand: pairedT([5, 6, 7, 8], [1, 2, 4, 4]),
    constant: pairedT([1, 2, 3], [0, 1, 2]), // diff ≡ 1 — sd 0
    same: pairedT([1, 2, 3], [1, 2, 3]),     // diff ≡ 0 — sd 0
  }));
  expect(out.hand.t).toBeCloseTo(15, 10);
  expect(out.hand.df).toBe(3);
  expect(out.hand.dz).toBeCloseTo(7.5, 10);
  expect(out.hand.p).toBeLessThan(0.002); // published t(0.001, df 3) = 10.215
  expect(out.constant).toBeNull();
  expect(out.same).toBeNull();
});

test('Wilcoxon signed-rank: hand case, zero-drop, exact-enumeration tolerance', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    hand: wilcoxonSignedRank([2, 3, 4, 5, 6, 7], [1, 1, 1, 1, 1, 1]),
    zeros: wilcoxonSignedRank([1, 2, 3], [1, 1, 1]), // one zero diff dropped
    // diffs [−1..−7, +8, −9, −10]: W+ = 8 = the published n=10 critical W;
    // exact p = 50/1024 = 0.048828 by subset enumeration (see header)
    w8: wilcoxonSignedRank([-1, -2, -3, -4, -5, -6, -7, 8, -9, -10],
                           [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    allZero: wilcoxonSignedRank([1, 2], [1, 2]), // every diff zero → n 0
  }));
  expect(out.hand.W).toBe(0);
  expect(out.hand.p).toBeCloseTo(0.036032, 5);
  expect(out.hand.r).toBeCloseTo(1, 10); // x entirely larger
  expect(out.zeros.nZero).toBe(1);
  expect(out.zeros.n).toBe(2);
  expect(out.w8.W).toBe(8);
  expect(Math.abs(out.w8.p - 0.048828)).toBeLessThan(0.005); // approx vs exact
  expect(out.allZero).toBeNull();
});

test('Compare groups UI: verdict always carries effect size and n (§20)', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page,
    'v,site\n1,a\n2,a\n3,a\n4,a\n5,a\n2,b\n4,b\n6,b\n8,b\n10,b\n9,x',
    '_cmp_ui.csv'); // x has one value → excluded
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);
  await page.selectOption('#cmpVal', 'v');
  await page.selectOption('#cmpGroup', 'site');
  await page.click('#cmpRun');
  await page.waitForTimeout(200);

  const out = await page.evaluate(() => ({
    text: document.getElementById('cmpResult').textContent,
    rows: document.querySelectorAll('#cmpResult tbody tr').length,
  }));
  expect(out.rows).toBe(2);
  expect(out.text).toContain('Welch t = -1.897');
  expect(out.text).toContain("Cohen's d = -1.200");
  expect(out.text).toContain('p = 0.1');           // never naked: with d and table
  expect(out.text).toContain('excluded');          // group x named
  expect(out.text).toContain('x');
});

test('Compare groups UI, rank-based: MWU verdict, median/IQR table, approx marker', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page,
    'v,site\n1,a\n2,a\n3,a\n4,a\n5,a\n2,b\n4,b\n6,b\n8,b\n10,b\n9,x',
    '_cmp_rank.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);
  // one numeric column → the Paired option is disabled with a tooltip
  const pairedDisabled = await page.evaluate(() =>
    document.querySelector('#cmpKind option[value="paired"]').disabled);
  expect(pairedDisabled).toBe(true);

  await page.selectOption('#cmpMethod', 'rank');
  await page.selectOption('#cmpVal', 'v');
  await page.selectOption('#cmpGroup', 'site');
  await page.click('#cmpRun');
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => ({
    text: document.getElementById('cmpResult').textContent,
    heads: [...document.querySelectorAll('#cmpResult th')].map(th => th.textContent),
  }));
  // Hand case (header): pooled ranks give U = 5, r = 2·5/25 − 1 = −0.6
  expect(out.text).toContain('Mann–Whitney U = 5.000');
  expect(out.text).toContain('rank-biserial r = -0.6000');
  expect(out.text).toContain('(normal approx.)'); // groups of 5 < 10
  expect(out.heads).toContain('median');          // rank table is median/IQR
  expect(out.heads).toContain('IQR');
  expect(out.text).toContain('excluded');         // single-value group still named
});

test('Compare groups UI, rank-based 3+ groups: Kruskal-Wallis with eps²', async ({ page }) => {
  await page.goto(FILE_URL);
  // The KW hand case: H = 7.2, df = 2, p = e^(−3.6) ≈ 0.027, ε² = 0.9
  await loadCSV(page,
    'v,g\n1,a\n2,a\n3,a\n4,b\n5,b\n6,b\n7,c\n8,c\n9,c',
    '_cmp_kw.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);
  await page.selectOption('#cmpMethod', 'rank');
  await page.selectOption('#cmpVal', 'v');
  await page.selectOption('#cmpGroup', 'g');
  await page.click('#cmpRun');
  await page.waitForTimeout(200);
  const text = await page.evaluate(() => document.getElementById('cmpResult').textContent);
  expect(text).toContain('Kruskal–Wallis H(2) = 7.200');
  expect(text).toContain('p = 0.027');
  expect(text).toContain('ε² = 0.9000');
  expect(text).toContain('(normal approx.)'); // groups of 3 < 10
});

test('Compare UI, paired columns: t and Wilcoxon verdicts, dropped pairs, same-column guard', async ({ page }) => {
  await page.goto(FILE_URL);
  // Paired t hand case (header): t = 15, df = 3, dz = 7.5; one incomplete row
  await loadCSV(page,
    'before,after\n5,1\n6,2\n7,4\n8,4\n9,\n',
    '_cmp_paired.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);
  await page.selectOption('#cmpKind', 'paired');
  // group field hides, second-column field shows
  const vis = await page.evaluate(() => ({
    grp: document.getElementById('cmpGroupField').classList.contains('hidden'),
    val2: document.getElementById('cmpVal2Field').classList.contains('hidden'),
  }));
  expect(vis.grp).toBe(true);
  expect(vis.val2).toBe(false);

  // Same column in both pickers → guard, no test
  await page.selectOption('#cmpVal', 'before');
  await page.selectOption('#cmpVal2', 'before');
  await page.click('#cmpRun');
  await page.waitForTimeout(100);
  let text = await page.evaluate(() => document.getElementById('cmpResult').textContent);
  expect(text).toContain('two different columns');

  await page.selectOption('#cmpVal2', 'after');
  await page.click('#cmpRun');
  await page.waitForTimeout(100);
  const out = await page.evaluate(() => ({
    text: document.getElementById('cmpResult').textContent,
    heads: [...document.querySelectorAll('#cmpResult th')].map(th => th.textContent),
  }));
  expect(out.text).toContain('Paired t = 15.00');
  expect(out.text).toContain('df = 3');
  expect(out.text).toContain('dz = 7.500');
  expect(out.text).toContain('n = 4 pairs');
  expect(out.text).toContain('1 incomplete pair(s) dropped');
  expect(out.heads).toContain('Column'); // paired table rows are columns

  // Rank-based: Wilcoxon on diffs [4,4,3,4] → W = 0, r = 1, n = 4 < 10
  await page.selectOption('#cmpMethod', 'rank');
  await page.click('#cmpRun');
  await page.waitForTimeout(100);
  text = await page.evaluate(() => document.getElementById('cmpResult').textContent);
  expect(text).toContain('Wilcoxon W = 0.000');
  expect(text).toContain('rank-biserial r = 1.000');
  expect(text).toContain('(normal approx.)');
  expect(text).toContain('n = 4 pairs');
});

test('histogram + Log X bins in log space; the old warning is gone', async ({ page }) => {
  await page.goto(FILE_URL);
  // Three decades of data — log bins are the only sane choice
  const vals = Array.from({ length: 90 }, (_, i) => (Math.pow(10, (i % 30) / 10 + 1)).toFixed(3));
  await loadCSV(page, 'v\n' + vals.join('\n') + '\n-5', '_cmp_logbin.csv'); // one non-positive
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="histogram"]');
  await page.selectOption('#mXCol', 'v');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const el = document.getElementById('xLogChk');
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const pd = activePlotDiv();
    return {
      xType: pd._fullLayout.xaxis.type,
      xbins: pd.data[0].xbins,
      warn: document.querySelector('.panel-errors')?.textContent ?? '',
    };
  });
  expect(out.xType).toBe('log');                       // honored, not suppressed
  expect(out.warn).not.toContain('ignored');           // old warning retired
  expect(out.warn).toContain('non-positive');          // exclusion still surfaced
  // xbins are in log10 units: data spans 10..~890 → log range ≈ [1, 2.95]
  expect(out.xbins.start).toBeGreaterThan(0.9);
  expect(out.xbins.start).toBeLessThan(1.1);
  expect(out.xbins.size).toBeLessThan(1);              // sub-decade bins
});

test('polynomial fits: exact recovery, normal-equation residuals, legend + per-group guard', async ({ page }) => {
  await page.goto(FILE_URL);
  // Engine references
  const eng = await page.evaluate(() => {
    const xs = [-2, -1, 0, 1, 2, 3];
    const quad = polyFit(xs, xs.map(x => x * x - 2 * x + 3), 2);     // exact
    const cube = polyFit(xs, xs.map(x => 2 * x ** 3 - x + 1), 3);    // exact
    // Noisy quadratic: residuals must be orthogonal to 1, x, x²
    const ys = xs.map((x, i) => x * x + (i % 2 ? 0.5 : -0.5));
    const fit = polyFit(xs, ys, 2);
    let d0 = 0, d1 = 0, d2 = 0;
    xs.forEach((x, i) => {
      const r = ys[i] - (fit.coef[0] + fit.coef[1] * x + fit.coef[2] * x * x);
      d0 += r; d1 += r * x; d2 += r * x * x;
    });
    return { quad, cube, dots: [d0, d1, d2], degenerate: polyFit([1, 2], [1, 2], 3) };
  });
  expect(eng.quad.coef[0]).toBeCloseTo(3, 8);
  expect(eng.quad.coef[1]).toBeCloseTo(-2, 8);
  expect(eng.quad.coef[2]).toBeCloseTo(1, 8);
  expect(eng.quad.r2).toBeCloseTo(1, 10);
  expect(eng.cube.coef[3]).toBeCloseTo(2, 8);
  eng.dots.forEach(d => expect(Math.abs(d)).toBeLessThan(1e-8));
  expect(eng.degenerate).toBeNull(); // n < deg+1

  // UI: quadratic legend; per-group + degree>1 warns and stays linear
  let csv = 'x,y,g\n';
  for (let x = -3; x <= 3; x++) csv += `${x},${x * x},g${Math.abs(x) % 2}\n`;
  await loadCSV(page, csv, '_cmp_poly.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.check('#mTrend');
  await page.selectOption('#mTrendDeg', '2');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);
  let out = await page.evaluate(() => ({
    fit: activePlotDiv().data.find(t => t.mode === 'lines')?.name,
    sr: document.getElementById('plotSR-' + activePlot().id).textContent,
  }));
  expect(out.fit).toContain('Fit (deg 2)');
  expect(out.fit).toContain('x²');
  expect(out.fit).toContain('R² = 1.000');
  expect(out.sr).toContain('degree-2 fit');

  const grouped = await page.evaluate(() => {
    const s = appState.series[0];
    const r = buildScatterTrace(Object.assign({}, s, { colorCol: 'g', trendGroups: true }), appState.datasets);
    return { warning: r.warning, fits: r.traces.filter(t => t.mode === 'lines').length };
  });
  expect(grouped.warning).toContain('linear');
  expect(grouped.fits).toBe(2); // per-group linear fits, degree ignored
});
