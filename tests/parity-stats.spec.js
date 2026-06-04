// parity-stats.spec.js — numerical correctness of parity statistics
//
// Hand-computed reference (Data Scientist, Phase 1 sign-off):
//   observed x = [10, 20, 30, 40], modelled y = [12, 18, 33, 40]
//   residuals (y-x) = [2, -2, 3, 0]
//   SS_res = 4+4+9+0 = 17
//   mean(y) = 25.75; SS_tot = 13.75² + 7.75² + 7.25² + 14.25² = 504.75
//   NSE  = 1 - 17/504.75 = 0.966320...
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
  expect(stats.nse).toBeCloseTo(1 - 17 / 504.75, 10);
  expect(stats.mae).toBeCloseTo(1.75, 10);
  expect(stats.rmse).toBeCloseTo(Math.sqrt(17 / 4), 10);
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
