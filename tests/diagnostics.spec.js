// diagnostics.spec.js — Phase 19: probit + t-quantile numerics, Q–Q plot,
// residual plot, and CI/PI trendline bands.
//
// References are published or hand-derived from the formulas (§20), never
// pinned to code output — matching comparison.spec.js.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

// ── A. Numerics: normalInv (probit) + tQuantile ───────────────────────────

test('normalInv matches published normal quantiles + guards', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => ({
    p975: normalInv(0.975), p75: normalInv(0.75), p5: normalInv(0.5),
    p90: normalInv(0.90), p99: normalInv(0.99), p001: normalInv(0.001), p999: normalInv(0.999),
    sym: normalInv(0.025) + normalInv(0.975),
    inf0: normalInv(0) === -Infinity, inf1: normalInv(1) === Infinity,
    nanHi: Number.isNaN(normalInv(1.2)), nanLo: Number.isNaN(normalInv(-0.1)),
  }));
  expect(r.p975).toBeCloseTo(1.959964, 6);
  expect(r.p75).toBeCloseTo(0.674490, 6);
  expect(r.p5).toBeCloseTo(0, 10);
  expect(r.p90).toBeCloseTo(1.281552, 6);
  expect(r.p99).toBeCloseTo(2.326348, 6);
  expect(r.p001).toBeCloseTo(-3.090232, 5);   // tail: pin to 5
  expect(r.p999).toBeCloseTo(3.090232, 5);
  expect(r.sym).toBeCloseTo(0, 10);           // Φ⁻¹(p) = −Φ⁻¹(1−p)
  expect(r.inf0 && r.inf1 && r.nanHi && r.nanLo).toBe(true);
});

test('tQuantile matches the published t-table + inverse round-trip + df→∞', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => ({
    t10: tQuantile(0.975, 10), t1: tQuantile(0.975, 1), t2: tQuantile(0.975, 2), t5_95: tQuantile(0.95, 5),
    // inverse round-trip against the SHIPPED forward CDF (method-independent)
    rt1: pTwoTailedT(tQuantile(0.975, 1), 1), rt3: pTwoTailedT(tQuantile(0.975, 3), 3),
    rt10: pTwoTailedT(tQuantile(0.975, 10), 10), rt30: pTwoTailedT(tQuantile(0.975, 30), 30),
    tInf: tQuantile(0.975, 1e5), probit975: normalInv(0.975),
    nanC: Number.isNaN(tQuantile(0.5, 10)), nanDf: Number.isNaN(tQuantile(0.975, 0)),
  }));
  expect(r.t10).toBeCloseTo(2.228139, 5);
  expect(r.t1).toBeCloseTo(12.70620, 4);
  expect(r.t2).toBeCloseTo(4.302653, 4);
  expect(r.t5_95).toBeCloseTo(2.015048, 4);
  for (const rt of [r.rt1, r.rt3, r.rt10, r.rt30]) expect(rt).toBeCloseTo(0.05, 6);
  expect(r.tInf).toBeCloseTo(1.95996, 3);     // df→∞ recovers the probit
  expect(r.tInf).toBeCloseTo(r.probit975, 3); // cross-check the two functions
  expect(r.nanC && r.nanDf).toBe(true);
});

test('linearFit exposes meanX / sxx / ssRes for the bands (additive)', async ({ page }) => {
  await page.goto(FILE_URL);
  // x=[-2,-1,0,1,2] (x̄=0, Sxx=10), y=[-1,0,0,0,1] → a=0.4, SSres=0.4
  const f = await page.evaluate(() => linearFit([-2, -1, 0, 1, 2], [-1, 0, 0, 0, 1]));
  expect(f.a).toBeCloseTo(0.4, 10);
  expect(f.meanX).toBeCloseTo(0, 10);
  expect(f.sxx).toBeCloseTo(10, 10);
  expect(f.ssRes).toBeCloseTo(0.4, 10);
});

// ── B. Q–Q plot ───────────────────────────────────────────────────────────

const qqCorr = (traces) => {
  const m = traces.find(t => t.mode === 'markers');
  return { x: m.x, y: m.y };
};

test('Q–Q of normal data is straight; skewed data curves', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const n = 60;
    // Normal: build the sample AS the theoretical quantiles → exactly straight.
    const normal = Array.from({ length: n }, (_, i) => ({ v: normalInv((i + 1 - 0.375) / (n + 0.25)) }));
    // Skewed: exponential ramp.
    const skew = Array.from({ length: n }, (_, i) => ({ v: Math.exp(i / 10) }));
    const mk = rows => ({ id: 'd', name: 'D', color: '#000', headers: ['v'], rows });
    const rN = buildQQTrace({ datasetId: 'd', chartType: 'qq', xCol: 'v', style: {} }, [mk(normal)]);
    const rS = buildQQTrace({ datasetId: 'd', chartType: 'qq', xCol: 'v', style: {} }, [mk(skew)]);
    const mN = rN.traces.find(t => t.mode === 'markers'), mS = rS.traces.find(t => t.mode === 'markers');
    return { corrN: pearsonR(mN.x, mN.y), corrS: pearsonR(mS.x, mS.y),
      srN: rN.fitAnnot.sr, srS: rS.fitAnnot.sr,
      xTitle: rN.layout.xaxis.title.text, yTitle: rN.layout.yaxis.title.text,
      nTraces: rN.traces.length };
  });
  expect(out.corrN).toBeCloseTo(1, 6);            // normal is straight
  expect(out.corrS).toBeLessThan(0.98);           // skewed curves
  expect(out.corrS).toBeLessThan(out.corrN - 0.01);
  expect(out.srN).toMatch(/consistent with normal/i);
  expect(out.srS).toMatch(/departure/i);
  expect(out.srN).toMatch(/not a formal normality test/i);
  expect(out.xTitle).toBe('Theoretical quantiles');
  expect(out.yTitle).toBe('Sample quantiles');
  expect(out.nTraces).toBe(2);                    // markers + reference line
});

test('Q–Q handles ties and drops non-finite; errors below n=3', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => {
    const rows = [{ v: 5 }, { v: 5 }, { v: 5 }, { v: 7 }, { v: '' }, { v: 9 }]; // ties + one blank
    const ds = [{ id: 'd', name: 'D', color: '#000', headers: ['v'], rows }];
    const ok = buildQQTrace({ datasetId: 'd', chartType: 'qq', xCol: 'v', style: {} }, ds);
    const m = ok.traces.find(t => t.mode === 'markers');
    const tooFew = buildQQTrace({ datasetId: 'd', chartType: 'qq', xCol: 'v', style: {} },
      [{ id: 'd', name: 'D', color: '#000', headers: ['v'], rows: [{ v: 1 }, { v: 2 }] }]);
    return { nPts: m.x.length, anyNaN: m.x.some(v => !Number.isFinite(v)), err: tooFew.error };
  });
  expect(r.nPts).toBe(5);          // 6 rows − 1 blank
  expect(r.anyNaN).toBe(false);    // ties get distinct positions, no NaN
  expect(r.err).toMatch(/at least 3/i);
});

// ── C. Residual plot ──────────────────────────────────────────────────────

test('residuals of an exact fit are ~0; a bad fit shows structure', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    // y = x² − 2x + 3 exactly
    const rows = [-2, -1, 0, 1, 2, 3].map(x => ({ x, y: x * x - 2 * x + 3 }));
    const ds = [{ id: 'd', name: 'D', color: '#000', headers: ['x', 'y'], rows }];
    const exact = buildResidualTrace({ datasetId: 'd', chartType: 'residual', xCol: 'x', yCol: 'y', trendDegree: 2, style: {} }, ds);
    const bad = buildResidualTrace({ datasetId: 'd', chartType: 'residual', xCol: 'x', yCol: 'y', trendDegree: 1, style: {} }, ds);
    const rE = exact.traces.find(t => t.mode === 'markers').y;
    const rB = bad.traces.find(t => t.mode === 'markers').y;
    return { maxExact: Math.max(...rE.map(Math.abs)), maxBad: Math.max(...rB.map(Math.abs)),
      // curved: the ends share a sign opposite the middle for a line through a parabola
      ends: Math.sign(rB[0]) === Math.sign(rB[rB.length - 1]),
      mid: Math.sign(rB[Math.floor(rB.length / 2)]),
      xTitle: exact.layout.xaxis.title.text, yTitle: exact.layout.yaxis.title.text,
      sr: exact.fitAnnot.sr, nTraces: exact.traces.length };
  });
  expect(out.maxExact).toBeLessThan(1e-8);      // exact fit → residuals ≈ 0
  expect(out.maxBad).toBeGreaterThan(0.5);      // wrong degree → structure
  expect(out.ends).toBe(true);                  // both ends same sign (curved)
  expect(out.xTitle).toBe('Fitted values');
  expect(out.yTitle).toBe('Residuals');
  expect(out.sr).toMatch(/residuals ≈ 0/i);
  expect(out.nTraces).toBe(2);                  // markers + zero line
});

// ── D. CI/PI bands ─────────────────────────────────────────────────────────

const bandData = () => ({ id: 'd', name: 'D', color: '#000', headers: ['x', 'y'],
  rows: [-2, -1, 0, 1, 2].map((x, i) => ({ x, y: [-1, 0, 0, 0, 1][i] })) });

const buildBands = (page, extra = {}) => page.evaluate((extra) => {
  const ds = [{ id: 'd', name: 'D', color: '#000', headers: ['x', 'y', 'g'],
    rows: [-2, -1, 0, 1, 2].map((x, i) => ({ x, y: [-1, 0, 0, 0, 1][i], g: ['a', 'b'][i % 2] })) }];
  const s = { datasetId: 'd', chartType: 'scatter', xCol: 'x', yCol: 'y', trendline: true,
    trendDegree: 1, trendBands: 'both', style: {}, ...extra };
  const r = buildScatterTrace(s, ds, { xLog: false });
  const names = r.traces.map(t => t.name || '');
  const ci = r.traces.find(t => /\bCI\b/.test(t.name || ''));
  const pi = r.traces.find(t => /\bPI\b/.test(t.name || ''));
  return { names, ciName: ci?.name, piName: pi?.name,
    ciY: ci?.y, piY: pi?.y, xs: ci?.x, warning: r.warning,
    hasBands: !!(ci || pi) };
}, extra);

test('CI/PI bands: hand-derived half-widths, CI ⊂ PI, flare at the extremes, self-named', async ({ page }) => {
  await page.goto(FILE_URL);
  const b = await buildBands(page);
  // Polygon y = [...upper(101), ...lower reversed(101)] → half-width at column i
  // is (y[i] − y[N−1−i]) / 2. Fit ŷ=0.4x, s=√(0.4/3), t(0.975,3)=3.182446 ⇒
  // CI half at x̄=0 = t·s·√(1/5) = 0.5196913; PI half = t·s·√(1+1/5) = 1.2729785.
  const N = b.ciY.length;                 // 202
  const halfCI = i => (b.ciY[i] - b.ciY[N - 1 - i]) / 2;
  const halfPI = i => (b.piY[i] - b.piY[N - 1 - i]) / 2;
  const mid = b.xs.indexOf(0);            // x=0 is x̄, at column 50
  expect(halfCI(mid)).toBeCloseTo(0.5196913, 5);
  expect(halfPI(mid)).toBeCloseTo(1.2729785, 5);
  // Names carry the level (unlabeled band = §20 violation).
  expect(b.ciName).toMatch(/95% CI/);
  expect(b.piName).toMatch(/95% PI/);
  // CI ⊂ PI at every sampled column.
  let subset = true;
  for (let i = 0; i <= 100; i++) if (halfPI(i) <= halfCI(i)) subset = false;
  expect(subset).toBe(true);
  // Both minimized at x̄ and flaring toward the extremes.
  expect(halfCI(0)).toBeGreaterThan(halfCI(mid));
  expect(halfCI(100)).toBeGreaterThan(halfCI(mid));
  expect(halfPI(0)).toBeGreaterThan(halfPI(mid));
});

test('bands are linear-only: suppressed with a warning for degree>1 and per-group', async ({ page }) => {
  await page.goto(FILE_URL);
  const deg2 = await buildBands(page, { trendDegree: 2 });
  expect(deg2.hasBands).toBe(false);
  expect(deg2.warning).toMatch(/linear.*only|degree/i);

  const grp = await buildBands(page, { trendGroups: true, colorCol: 'g' });
  expect(grp.hasBands).toBe(false);
  expect(grp.warning).toMatch(/per-group/i);

  const none = await buildBands(page, { trendBands: 'none' });
  expect(none.hasBands).toBe(false);
});

test('bands edge cases: n<3 skips with a warning; zero-residual fit gives finite zero-width bands', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => {
    const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const dsTwo = [{ id: 'dTwo', name: 'D', color: '#000', headers: ['x', 'y'], rows: two }];
    const rTwo = buildScatterTrace({ datasetId: 'dTwo', chartType: 'scatter', xCol: 'x', yCol: 'y', trendline: true, trendDegree: 1, trendBands: 'ci', style: {} }, dsTwo, {});
    // perfect linear fit (y=2x) over 5 points → ssRes=0 → s=0 → zero-width, finite.
    // (distinct dataset id so the memoized column cache doesn't collide with dTwo)
    const perfect = [-2, -1, 0, 1, 2].map(x => ({ x, y: 2 * x }));
    const dsP = [{ id: 'dPerfect', name: 'D', color: '#000', headers: ['x', 'y'], rows: perfect }];
    const rP = buildScatterTrace({ datasetId: 'dPerfect', chartType: 'scatter', xCol: 'x', yCol: 'y', trendline: true, trendDegree: 1, trendBands: 'both', style: {} }, dsP, {});
    const ciP = rP.traces.find(t => /\bCI\b/.test(t.name || ''));
    return { twoBands: rTwo.traces.some(t => /\bCI\b/.test(t.name || '')), twoWarn: rTwo.warning,
      perfNaN: ciP ? ciP.y.some(v => !Number.isFinite(v)) : true,
      perfWidth0: ciP ? Math.max(...ciP.y.slice(0, 101).map((up, i) => Math.abs(up - 2 * ciP.x[i]))) : 99 };
  });
  expect(r.twoBands).toBe(false);
  expect(r.twoWarn).toMatch(/at least 3/i);
  expect(r.perfNaN).toBe(false);              // no NaN
  expect(r.perfWidth0).toBeLessThan(1e-9);    // widths collapse to 0
});

test('bands render under the fit line; a bad stored trendBands value fails closed (§8)', async ({ page }) => {
  await page.goto(FILE_URL);
  const b = await buildBands(page); // trendBands 'both'
  const piIdx = b.names.findIndex(n => /\bPI\b/.test(n));
  const ciIdx = b.names.findIndex(n => /\bCI\b/.test(n));
  const fitIdx = b.names.findIndex(n => /^Fit:/.test(n));
  expect(piIdx).toBeGreaterThan(-1);
  expect(piIdx).toBeLessThan(ciIdx);   // PI drawn before CI (wider, underneath)
  expect(ciIdx).toBeLessThan(fitIdx);  // both drawn before the fit line (under it)
  // A hand-edited/garbage stored value must draw no bands and not throw (allowlist).
  expect((await buildBands(page, { trendBands: 'javascript:alert(1)' })).hasBands).toBe(false);
  expect((await buildBands(page, { trendBands: ['both'] })).hasBands).toBe(false); // wrong type
  expect((await buildBands(page, { trendBands: '__proto__' })).hasBands).toBe(false);
});

test('Q–Q errors on a constant column and warns under a log axis', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => {
    const constDs = [{ id: 'dc', name: 'D', color: '#000', headers: ['v'], rows: [{ v: 5 }, { v: 5 }, { v: 5 }, { v: 5 }] }];
    const okDs = [{ id: 'dok', name: 'D', color: '#000', headers: ['v'], rows: Array.from({ length: 10 }, (_, i) => ({ v: i })) }];
    return {
      constErr: buildQQTrace({ datasetId: 'dc', chartType: 'qq', xCol: 'v', style: {} }, constDs).error,
      logWarn: buildQQTrace({ datasetId: 'dok', chartType: 'qq', xCol: 'v', style: {} }, okDs, { xLog: true }).warning,
    };
  });
  expect(r.constErr).toMatch(/no variance/i);
  expect(r.logWarn).toMatch(/log scale/i);
});

test('residual drops one-sided-NaN pairs, keeping the rest aligned', async ({ page }) => {
  await page.goto(FILE_URL);
  const n = await page.evaluate(() => {
    const ds = [{ id: 'd', name: 'D', color: '#000', headers: ['x', 'y'],
      rows: [{ x: 0, y: 0 }, { x: 1, y: '' }, { x: 2, y: 4 }, { x: 3, y: 6 }] }]; // blank y → whole pair dropped
    return buildResidualTrace({ datasetId: 'd', chartType: 'residual', xCol: 'x', yCol: 'y', trendDegree: 1, style: {} }, ds)
      .traces.find(t => t.mode === 'markers').x.length;
  });
  expect(n).toBe(3);
});

test('diagnostic axis titles survive inside a subplot grid (the clobber fix)', async ({ page }) => {
  await page.goto(FILE_URL);
  const csv = 'x,y\n' + Array.from({ length: 20 }, (_, i) => `${i},${2 * i + (i % 3)}`).join('\n');
  await page.setInputFiles('#fileInput', { name: 'g.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(300);
  // 1×2 grid so the per-cell auto-label block (which overwrites titles with xCol/yCol) runs.
  await page.evaluate(() => { appState.plots[0].grid = { rows: 1, cols: 2, shareX: false, shareY: false }; });
  await page.click('#addSeriesBtn'); await page.click('.ct-btn[data-ct="qq"]'); await page.waitForTimeout(150);
  await page.selectOption('#mXCol', 'y');
  if (await page.$('#mCell')) await page.selectOption('#mCell', '1,1');
  await page.click('#modalSave'); await page.waitForTimeout(250);
  await page.click('#addSeriesBtn'); await page.click('.ct-btn[data-ct="residual"]'); await page.waitForTimeout(150);
  await page.selectOption('#mXCol', 'x'); await page.selectOption('#mYCol', 'y');
  if (await page.$('#mCell')) await page.selectOption('#mCell', '1,2');
  await page.click('#modalSave'); await page.waitForTimeout(350);
  const t = await page.evaluate(() => {
    const fl = activePlotDiv()._fullLayout;
    return { x1: fl.xaxis?.title?.text, y1: fl.yaxis?.title?.text, x2: fl.xaxis2?.title?.text, y2: fl.yaxis2?.title?.text };
  });
  expect(t.x1).toBe('Theoretical quantiles'); // qq cell — NOT the column name 'y'
  expect(t.y1).toBe('Sample quantiles');
  expect(t.x2).toBe('Fitted values');         // residual cell — NOT 'x'
  expect(t.y2).toBe('Residuals');
});

// ── E. Session round-trip ──────────────────────────────────────────────────

test('qq / residual / trendBands round-trip through a session', async ({ page }) => {
  await page.goto(FILE_URL);
  const survived = await page.evaluate(() => {
    appState.datasets = [{ id: 'd', name: 'D', color: '#123', headers: ['x', 'y'],
      rows: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 2 * i + 1 })) }];
    appState.series = [
      { id: 's1', chartType: 'qq', datasetId: 'd', xCol: 'y', style: {}, filters: [], plotId: 'p1' },
      { id: 's2', chartType: 'residual', datasetId: 'd', xCol: 'x', yCol: 'y', trendDegree: 2, style: {}, filters: [], plotId: 'p1' },
      { id: 's3', chartType: 'scatter', datasetId: 'd', xCol: 'x', yCol: 'y', trendline: true, trendDegree: 1, trendBands: 'both', style: {}, filters: [], plotId: 'p1' },
    ];
    const json = JSON.stringify({ ...appState });
    applySessionState(migrateSessionState(JSON.parse(json)));
    return appState.series.map(s => ({ t: s.chartType, deg: s.trendDegree, tb: s.trendBands }));
  });
  expect(survived[0].t).toBe('qq');
  expect(survived[1].t).toBe('residual');
  expect(survived[1].deg).toBe(2);
  expect(survived[2].tb).toBe('both');
});

// ── F. In-app verification (SVG → renders headless) ────────────────────────

test('all three diagnostics render in-app end to end', async ({ page }) => {
  await page.goto(FILE_URL);
  const csv = 'x,y\n' + Array.from({ length: 40 }, (_, i) => {
    const x = i * 0.25; return `${x},${(2 * x + 3 + Math.sin(i) * 1.5).toFixed(3)}`;
  }).join('\n');
  await page.setInputFiles('#fileInput', { name: 'd.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(300);

  const render = async (setup) => {
    await page.evaluate(() => { appState.series = []; renderSeriesList(); renderPlot(); });
    await page.click('#addSeriesBtn');
    await setup();
    await page.click('#modalSave');
    await page.waitForTimeout(350);
    return page.evaluate(() => {
      const pd = activePlotDiv();
      return { names: (pd._fullData || []).map(t => t.name),
        err: (document.querySelector('.plot-panel .panel-errors')?.textContent || '').trim(),
        xTitle: pd._fullLayout?.xaxis?.title?.text };
    });
  };

  const qq = await render(async () => {
    await page.click('.ct-btn[data-ct="qq"]'); await page.waitForTimeout(100);
    await page.selectOption('#mXCol', 'y');
  });
  expect(qq.err).toBe('');
  expect(qq.xTitle).toBe('Theoretical quantiles');

  const resid = await render(async () => {
    await page.click('.ct-btn[data-ct="residual"]'); await page.waitForTimeout(100);
    await page.selectOption('#mXCol', 'x'); await page.selectOption('#mYCol', 'y');
  });
  expect(resid.err).toBe('');
  expect(resid.xTitle).toBe('Fitted values');

  const bands = await render(async () => {
    await page.click('.ct-btn[data-ct="scatter"]'); await page.waitForTimeout(100);
    await page.selectOption('#mXCol', 'x'); await page.selectOption('#mYCol', 'y');
    await page.check('#mTrend'); await page.waitForTimeout(80);
    await page.selectOption('#mTrendBands', 'both');
  });
  expect(bands.err).toBe('');
  expect(bands.names.some(n => /95% CI/.test(n))).toBe(true);
  expect(bands.names.some(n => /95% PI/.test(n))).toBe(true);
});
