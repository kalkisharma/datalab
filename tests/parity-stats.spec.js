// parity-stats.spec.js — numerical correctness of parity statistics
//
// Hand-derived reference from the NSE definition (Phase 8 correction —
// the Phase 1 reference was pinned to the implementation's output, which
// used mean(modelled) in SS_tot; the definition requires mean(observed).
// STANDARDS §20: reference values derive from the formula, never the code):
//   NSE = 1 − Σ(mod−obs)² / Σ(obs − mean(obs))²
//   observed x = [10, 20, 30, 40], modelled y = [12, 18, 33, 40]
//   residuals (y-x) = [2, -2, 3, 0]
//   SS_res = 4+4+9+0 = 17
//   mean(x) = 25; SS_tot = 15² + 5² + 5² + 15² = 500
//   NSE  = 1 - 17/500 = 0.966
//   MAE  = 7/4 = 1.75
//   RMSE = sqrt(17/4) = 2.061552...

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

test('computeParityStats matches hand-computed NSE/MAE/RMSE', async ({ page }) => {
  await page.goto(FILE_URL);
  const stats = await page.evaluate(() =>
    computeParityStats([10, 20, 30, 40], [12, 18, 33, 40])
  );
  expect(stats.nse).toBeCloseTo(1 - 17 / 500, 10);
  expect(stats.mae).toBeCloseTo(1.75, 10);
  expect(stats.rmse).toBeCloseTo(Math.sqrt(17 / 4), 10);
});

// Distinguishing case for the Phase 8 NSE correction: a model that always
// predicts mean(observed) scores NSE = 0 BY DEFINITION (it is the baseline
// the score is measured against). The pre-correction formula computed SS_tot
// around mean(modelled) — variance 0 here — and returned NaN. The original
// reference data could not tell the formulas apart (0.96632 vs 0.96600).
test('constant model at mean(observed) scores NSE = 0', async ({ page }) => {
  await page.goto(FILE_URL);
  const stats = await page.evaluate(() =>
    computeParityStats([10, 20, 30, 40], [25, 25, 25, 25]) // mean(obs) = 25
  );
  // SS_res = 15²+5²+5²+15² = 500 = SS_tot → NSE = 1 − 500/500 = 0
  expect(stats.nse).toBeCloseTo(0, 10);
});

// Regression test for the Phase 1 blocks-phase finding: x and y were filtered
// for finite values independently, misaligning pairs after any one-sided NaN.
// A NaN in x at row 2 must drop the WHOLE pair, leaving the remaining pairs
// correctly aligned — not shift y values onto the wrong x values.
test('parity pairs with one-sided NaN are dropped together, not misaligned', async ({ page }) => {
  await page.goto(FILE_URL);
  const result = await page.evaluate(() => {
    const dsA = {
      id: 'a', name: 'A', color: '#000',
      headers: ['key', 'obs'],
      rows: [
        { key: 1, obs: 10 },
        { key: 2, obs: 'bad' },  // non-numeric x — pair must be dropped
        { key: 3, obs: 30 },
        { key: 4, obs: 40 },
      ],
    };
    const dsB = {
      id: 'b', name: 'B', color: '#000',
      headers: ['key', 'mod'],
      rows: [
        { key: 1, mod: 12 },
        { key: 2, mod: 99 },     // y is finite, but its x partner is not
        { key: 3, mod: 33 },
        { key: 4, mod: 40 },
      ],
    };
    const series = {
      id: 's1', name: 'p', chartType: 'parity',
      datasetId: 'a', joinDatasetId: 'b', joinKey: 'key',
      xCol: 'obs', yCol: 'mod', filters: [], style: {},
    };
    return buildParityTrace(series, [dsA, dsB]);
  });

  expect(result.error).toBeNull();
  expect(result.n).toBe(3); // pair (bad, 99) dropped entirely
  // With misaligned filtering, y=99 would have paired against x=30 — RMSE
  // would explode. Correct pairing: (10,12),(30,33),(40,40).
  const xs = [10, 30, 40], ys = [12, 33, 40];
  const ssR = xs.reduce((s, x, i) => s + (ys[i] - x) ** 2, 0); // 4+9+0 = 13
  expect(result.stats.rmse).toBeCloseTo(Math.sqrt(ssR / 3), 10);
  expect(result.stats.mae).toBeCloseTo((2 + 3 + 0) / 3, 10);
});

// ── Best-fit line (v2.15.0) ────────────────────────────────────────────────
// Linear least-squares fit (modelled vs observed) with R² in the legend,
// complementing the y=x reference. Exact data so the fit is unambiguous.
test('parity best-fit line: linear fit trace carries the equation and R²', async ({ page }) => {
  await page.goto(FILE_URL);
  const result = await page.evaluate(() => {
    const ds = { id:'a', name:'A', color:'#000', headers:['obs','mod'],
      rows:[{obs:1,mod:3},{obs:2,mod:5},{obs:3,mod:7}] }; // mod = 2·obs + 1, R²=1
    const series = { id:'s1', name:'p', chartType:'parity', datasetId:'a',
      xCol:'obs', yCol:'mod', parityFit:true, filters:[], style:{} };
    return buildParityTrace(series, [ds]);
  });
  expect(result.error).toBeNull();
  const fit = result.traces.find(t => typeof t.name === 'string' && t.name.startsWith('Best fit:'));
  expect(fit).toBeTruthy();
  expect(fit.mode).toBe('lines');
  expect(fit.name).toContain('y = 2.000x + 1.000');
  expect(fit.name).toContain('R² = 1.000');
  // The line is evaluated from the fit across the equal-axis range
  expect(fit.x).toEqual([result.axMin, result.axMax]);
  expect(fit.y[0]).toBeCloseTo(2 * result.axMin + 1, 10);
  expect(fit.y[1]).toBeCloseTo(2 * result.axMax + 1, 10);
  // Screen-reader mirror is emitted for the dispatcher to pick up
  expect(result.fitAnnot && result.fitAnnot.sr).toContain('R2=1.000');
});

test('parity best-fit line is absent unless parityFit is set', async ({ page }) => {
  await page.goto(FILE_URL);
  const has = await page.evaluate(() => {
    const ds = { id:'a', name:'A', color:'#000', headers:['obs','mod'],
      rows:[{obs:1,mod:3},{obs:2,mod:5},{obs:3,mod:7}] };
    const series = { id:'s1', name:'p', chartType:'parity', datasetId:'a',
      xCol:'obs', yCol:'mod', filters:[], style:{} };
    const r = buildParityTrace(series, [ds]);
    return { hasFit: r.traces.some(t => typeof t.name === 'string' && t.name.startsWith('Best fit:')),
             fitAnnot: r.fitAnnot };
  });
  expect(has.hasFit).toBe(false);
  expect(has.fitAnnot).toBeNull();
});

// ── Band styling (v2.15.0) ──────────────────────────────────────────────────
// A shared colour + opacity drive BOTH the ±5% and ±10% bands; the fill stays
// at the original ~0.24 fill:line opacity ratio.
test('parity band color + opacity apply to both bands', async ({ page }) => {
  await page.goto(FILE_URL);
  const bands = await page.evaluate(() => {
    const ds = { id:'a', name:'A', color:'#000', headers:['obs','mod'],
      rows:[{obs:1,mod:1.1},{obs:2,mod:1.9},{obs:3,mod:3.2}] };
    const series = { id:'s1', name:'p', chartType:'parity', datasetId:'a',
      xCol:'obs', yCol:'mod', band5:true, band10:true,
      bandColor:'#ff0000', bandOpacity:0.5, filters:[], style:{} };
    return buildParityTrace(series, [ds]).traces.filter(t => t.fill === 'toself')
      .map(t => ({ line: t.line.color, fill: t.fillcolor }));
  });
  expect(bands.length).toBeGreaterThanOrEqual(2);
  for (const b of bands) {
    expect(b.line).toBe('rgba(255,0,0,0.5)');
    expect(b.fill).toBe('rgba(255,0,0,0.12)'); // 0.5 × 0.24
  }
});

test('parity bands keep the original blue when unstyled', async ({ page }) => {
  await page.goto(FILE_URL);
  const band = await page.evaluate(() => {
    const ds = { id:'a', name:'A', color:'#000', headers:['obs','mod'],
      rows:[{obs:1,mod:1.1},{obs:2,mod:1.9},{obs:3,mod:3.2}] };
    const series = { id:'s1', name:'p', chartType:'parity', datasetId:'a',
      xCol:'obs', yCol:'mod', band10:true, filters:[], style:{} };
    return buildParityTrace(series, [ds]).traces.find(t => t.fill === 'toself');
  });
  expect(band.line.color).toBe('rgba(91,141,238,0.25)');
  expect(band.fillcolor).toBe('rgba(91,141,238,0.06)'); // 0.25 × 0.24
});

// ── Stats box tied to its subplot cell (v2.15.0) ───────────────────────────
// Each NSE/MAE/RMSE box anchors to its parity series' own cell via axis-domain
// refs, so it stays inside that cell's plot area as subplots are added. Boxes
// sharing a cell stack upward; the per-cell counter resets across cells.
test('parity stats box anchors to its cell and stacks per cell', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const layout = {};
    const st = { nse: 1, mae: 0, rmse: 0 };
    const parityResults = [
      { name: 'A', sfx: '',  n: 3, stats: st }, // cell 1
      { name: 'B', sfx: '',  n: 3, stats: st }, // cell 1 (stacks above A)
      { name: 'C', sfx: '2', n: 3, stats: st }, // cell 2 (counter resets)
    ];
    appendParityStats(layout, parityResults, { plotConfig: {} }, []);
    return layout.annotations.map(a => ({ xref: a.xref, yref: a.yref, y: a.y }));
  });
  expect(out[0]).toMatchObject({ xref: 'x domain',  yref: 'y domain'  });
  expect(out[1]).toMatchObject({ xref: 'x domain',  yref: 'y domain'  });
  expect(out[2]).toMatchObject({ xref: 'x2 domain', yref: 'y2 domain' });
  expect(out[0].y).toBeCloseTo(0.04, 10);   // first in cell 1
  expect(out[1].y).toBeCloseTo(0.28, 10);   // second in cell 1 stacks up
  expect(out[2].y).toBeCloseTo(0.04, 10);   // first in cell 2 — counter reset
});

test('parity layout enforces equal axis ranges', async ({ page }) => {
  await page.goto(FILE_URL);
  const result = await page.evaluate(() => {
    const dsA = { id:'a', name:'A', color:'#000', headers:['key','obs'],
      rows:[{key:1,obs:1},{key:2,obs:2},{key:3,obs:3}] };
    const dsB = { id:'b', name:'B', color:'#000', headers:['key','mod'],
      rows:[{key:1,mod:100},{key:2,mod:200},{key:3,mod:300}] };
    const series = { id:'s1', name:'p', chartType:'parity', datasetId:'a',
      joinDatasetId:'b', joinKey:'key', xCol:'obs', yCol:'mod', filters:[], style:{} };
    return buildParityTrace(series, [dsA, dsB]);
  });
  // Equal axes even when x and y span wildly different ranges — that is the
  // point of a parity plot (STANDARDS.md §19 correctness requirement)
  expect(result.layout.xaxis.range).toEqual(result.layout.yaxis.range);
  expect(result.layout.yaxis.scaleanchor).toBe('x');
});
