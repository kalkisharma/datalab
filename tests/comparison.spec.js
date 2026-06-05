// comparison.spec.js — Welch t, ANOVA, incomplete beta, log-space binning,
// polynomial trendlines (Phase 13)
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

test('histogram + Log X bins in log space; the old warning is gone', async ({ page }) => {
  await page.goto(FILE_URL);
  // Three decades of data — log bins are the only sane choice
  const vals = Array.from({ length: 90 }, (_, i) => (Math.pow(10, (i % 30) / 10 + 1)).toFixed(3));
  await loadCSV(page, 'v\n' + vals.join('\n') + '\n-5', '_cmp_logbin.csv'); // one non-positive
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="histogram"]');
  await page.selectOption('#mXCol', 'v');
  await page.click('#modalSave');
  await page.click('#renderBtn');
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
  await page.click('#renderBtn');
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
