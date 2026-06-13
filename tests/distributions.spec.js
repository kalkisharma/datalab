// distributions.spec.js — lognormal/Weibull fits, KDE, violin, per-group
// trendlines (Phase 11)
//
// Reference policy (STANDARDS §20):
// - Lognormal: hand-derived. vals = [e¹, e², e³] → ln = [1,2,3]:
//   μ = 2, σ (sample, n−1) = 1. pdf at x = e²: 1/(e²·√(2π)).
// - Weibull MLE has no closed form — the test verifies the DEFINING
//   equations hold at the returned estimates (residual ≈ 0) plus scale
//   equivariance (fit(c·x): k invariant, λ scales by c). Derived from the
//   definition, not the implementation.
// - KDE: density must integrate to ≈ 1 over its grid.

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

// ── Estimator references ──────────────────────────────────────────────────

test('fitLognormal matches hand-derived μ, σ; rejects non-positive-only data', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const fit = fitLognormal([Math.E, Math.E ** 2, Math.E ** 3]);
    return { fit, pdfAtE2: lognormalPdf(Math.E ** 2, fit.mu, fit.sigma), none: fitLognormal([-1, 0]) };
  });
  expect(out.fit.mu).toBeCloseTo(2, 10);
  expect(out.fit.sigma).toBeCloseTo(1, 10);
  expect(out.pdfAtE2).toBeCloseTo(1 / (Math.E ** 2 * Math.sqrt(2 * Math.PI)), 10);
  expect(out.none).toBeNull();
});

test('fitWeibull satisfies the MLE defining equations and scale equivariance', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const data = [0.5, 1.1, 1.9, 2.3, 3.7, 4.1, 5.6, 7.2, 8.8, 12.5];
    const fit = fitWeibull(data);
    if (!fit) return { fit: null };
    // Residual of the defining equation at k̂ (independent of the solver)
    const n = data.length, lnx = data.map(Math.log);
    const L = lnx.reduce((a, b) => a + b, 0) / n;
    let A = 0, B = 0, S = 0;
    for (let i = 0; i < n; i++) { const xk = data[i] ** fit.k; A += xk * lnx[i]; B += xk; S += xk; }
    const residual = A / B - 1 / fit.k - L;
    const lambdaDef = Math.pow(S / n, 1 / fit.k);
    // Scale equivariance: ×3 the data → k invariant, λ ×3
    const fit3 = fitWeibull(data.map(x => x * 3));
    return { fit, residual, lambdaDef, fit3,
             degenerate: fitWeibull([5, 5, 5]), tooFew: fitWeibull([2]) };
  });
  expect(out.fit).not.toBeNull();
  expect(Math.abs(out.residual)).toBeLessThan(1e-8);            // MLE equation holds
  expect(out.fit.lambda).toBeCloseTo(out.lambdaDef, 8);         // λ̂ definition holds
  expect(out.fit3.k).toBeCloseTo(out.fit.k, 6);                 // k scale-invariant
  expect(out.fit3.lambda).toBeCloseTo(out.fit.lambda * 3, 6);   // λ scales
  expect(out.degenerate).toBeNull();                            // no fake fit, no hang
  expect(out.tooFew).toBeNull();
});

test('kdeBinned density integrates to ≈ 1 and peaks near the mode', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    // Bimodal-ish sample concentrated around 5
    const vals = [];
    for (let i = 0; i < 500; i++) vals.push(5 + 2 * Math.sin(i * 1.7) + (i % 7) * 0.1);
    const kde = kdeBinned(vals, Math.min(...vals), Math.max(...vals), 0.25);
    const step = kde.xs[1] - kde.xs[0];
    const integral = kde.ys.reduce((s, y) => s + y * step, 0);
    const peakX = kde.xs[kde.ys.indexOf(Math.max(...kde.ys))];
    return { integral, peakX };
  });
  expect(out.integral).toBeGreaterThan(0.97);
  expect(out.integral).toBeLessThan(1.03);
  expect(out.peakX).toBeGreaterThan(3);
  expect(out.peakX).toBeLessThan(8);
});

// ── Back-compat and end-to-end overlays ───────────────────────────────────

test('a session with the Phase 5 fitNormal boolean still renders a normal fit', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.evaluate(() => {
    const rows = [];
    for (let i = 0; i < 200; i++) rows.push({ v: 10 + Math.sin(i) * 3 + (i % 5) });
    applySessionState(migrateSessionState({
      version: 2,
      datasets: [{ id: 'd1', name: 'old', rows, headers: ['v'], color: '#0072b2' }],
      series: [{ id: 's1', name: 'legacy-fit', plotId: 'p1', datasetId: 'd1',
                 chartType: 'histogram', xCol: 'v', fitNormal: true, // Phase 5 field
                 filters: [], style: {}, enabled: true }],
      plots: [{ id: 'p1', name: 'Plot 1', plotConfig: {} }],
      activePlotId: 'p1', style: {}, savedPlots: [],
    }));
  });
  await page.waitForTimeout(900);
  const fit = await page.evaluate(() =>
    activePlotDiv().data.find(t => t.mode === 'lines')?.name ?? null);
  expect(fit).toContain('Normal fit');
});

test('weibull fit + KDE overlay render through the UI with parameters in the legend', async ({ page }) => {
  await page.goto(FILE_URL);
  const vals = Array.from({ length: 60 }, (_, i) => (0.5 + (i % 12) * 0.8 + i * 0.05).toFixed(2));
  await loadCSV(page, 'v\n' + vals.join('\n'), '_dist_weib.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="histogram"]');
  await page.selectOption('#mXCol', 'v');
  await page.selectOption('#mFitDist', 'weibull');
  await page.check('#mKde');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => ({
    names: activePlotDiv().data.map(t => t.name),
    sr: document.getElementById('plotSR-' + activePlot().id).textContent,
  }));
  expect(out.names.some(n => /Weibull fit \(k=.+λ=/.test(n))).toBe(true);
  expect(out.names).toContain('KDE (Silverman)');
  expect(out.sr).toContain('Weibull fit');
});

// ── Violin ────────────────────────────────────────────────────────────────

test('violin renders grouped with box inside; non-numeric Y errors', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'site,v\na,1\na,2\nb,5\nb,7\nb,6', '_dist_violin.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="violin"]');
  await page.selectOption('#mYCol', 'v');
  await page.selectOption('#mXCol', 'site');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => {
    const t = activePlotDiv().data[0];
    return { type: t.type, box: t.box?.visible, cats: new Set(t.x).size,
             err: buildViolinTrace({ id: 'v2', name: 'bad', datasetId: appState.datasets[0].id,
               chartType: 'violin', yCol: 'site', filters: [], style: {} }, appState.datasets).error };
  });
  expect(out.type).toBe('violin');
  expect(out.box).toBe(true);
  expect(out.cats).toBe(2);
  expect(out.err).toContain('not numeric');
});

// ── Per-group trendlines ──────────────────────────────────────────────────

test('per-group trendlines: one palette fit per category; cap and fallback behaviors', async ({ page }) => {
  await page.goto(FILE_URL);
  // Two groups with clearly different slopes: g1 y=2x, g2 y=-x+10
  let csv = 'x,y,g\n';
  for (let x = 1; x <= 5; x++) csv += `${x},${2 * x},g1\n${x},${10 - x},g2\n`;
  await loadCSV(page, csv, '_dist_groups.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.selectOption('#mColorCol', 'g');
  await page.check('#mTrend');
  await page.check('#mTrendGroups');
  await page.fill('#mSeriesName', 'grp');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => {
    const fits = activePlotDiv().data.filter(t => t.mode === 'lines');
    return { n: fits.length, names: fits.map(t => t.name),
             colors: fits.map(t => t.line.color),
             sr: document.getElementById('plotSR-' + activePlot().id).textContent };
  });
  expect(out.n).toBe(2);
  expect(out.names[0]).toMatch(/^g1: y = 2\.000x/);
  expect(out.names[1]).toMatch(/^g2: y = −1\.000x|^g2: y = -1\.000x/);
  expect(out.names.every(n => n.includes('R²'))).toBe(true);
  expect(new Set(out.colors).size).toBe(2); // palette-distinct
  expect(out.sr).toContain('per-group linear fits');

  // Fallback: per-group without categorical color-by → single fit + warning
  const fb = await page.evaluate(() => {
    const s = appState.series[0];
    const r = buildScatterTrace(Object.assign({}, s, { colorCol: null }), appState.datasets);
    return { fits: r.traces.filter(t => t.mode === 'lines').length, warning: r.warning };
  });
  expect(fb.fits).toBe(1);
  expect(fb.warning).toContain('Color-by');
});
