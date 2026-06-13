// phase5.spec.js — Phase 5: statistical engine reference values, cleaning
// operations, correlation matrix, normal fit overlay, CSV export
//
// Reference values are hand-computed (Data Scientist acceptance criteria):
//   summaryStats([1,2,3,4,5]): mean 3, sample std √(10/4)=1.5811…,
//     P25 2, median 3, P75 4 (linear interpolation)
//   pearson x=[1,2,3,4], y=[1,3,2,4]: cov terms 4, ss 5·5 → r = 0.8
//   pairwise-complete a vs c (c missing row 1): r = 3/√21 = 0.65465…
//   fitNormal([2,4,4,4,5,5,7,9]): μ = 5, σ = √(32/7) = 2.13809…

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(350);
  fs.unlinkSync(csvPath);
}

// ── Statistical engine ────────────────────────────────────────────────────

test('summaryStats matches hand-computed references', async ({ page }) => {
  await page.goto(FILE_URL);
  const s = await page.evaluate(() =>
    summaryStats([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }], 'v')
  );
  expect(s.n).toBe(5);
  expect(s.missing).toBe(0);
  expect(s.mean).toBeCloseTo(3, 12);
  expect(s.std).toBeCloseTo(Math.sqrt(10 / 4), 12); // SAMPLE std (n−1)
  expect(s.p25).toBeCloseTo(2, 12);
  expect(s.median).toBeCloseTo(3, 12);
  expect(s.p75).toBeCloseTo(4, 12);
  expect(s.min).toBe(1);
  expect(s.max).toBe(5);
});

test('summaryStats counts non-numeric and empty values as missing', async ({ page }) => {
  await page.goto(FILE_URL);
  const s = await page.evaluate(() =>
    summaryStats([{ v: 1 }, { v: '' }, { v: null }, { v: 'x' }, { v: 2 }, { v: 3 }], 'v')
  );
  expect(s.n).toBe(3);
  expect(s.missing).toBe(3);
});

test('pearsonMatrix: known r, symmetry, unit diagonal, pairwise deletion', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => {
    const rows = [
      { a: 1, b: 2, c: 1 },
      { a: 2, b: 4, c: null },
      { a: 3, b: 6, c: 3 },
      { a: 4, b: 8, c: 2 },
    ];
    return pearsonMatrix(rows, ['a', 'b', 'c']);
  });
  expect(r[0][0]).toBe(1);                      // diagonal
  expect(r[1][1]).toBe(1);
  expect(r[0][1]).toBeCloseTo(1, 12);           // perfect linear a–b
  expect(r[1][0]).toBe(r[0][1]);                // symmetric
  expect(r[0][2]).toBeCloseTo(3 / Math.sqrt(21), 12); // pairwise-complete a–c
});

test('pearson r = 0.8 reference; anticorrelation = −1', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => ({
    point8: pearsonMatrix(
      [{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 4 }], ['x', 'y'])[0][1],
    anti: pearsonMatrix(
      [{ x: 1, y: 6 }, { x: 2, y: 4 }, { x: 3, y: 2 }], ['x', 'y'])[0][1],
  }));
  expect(r.point8).toBeCloseTo(0.8, 12);
  expect(r.anti).toBeCloseTo(-1, 12);
});

test('fitNormal matches hand-computed μ and sample σ', async ({ page }) => {
  await page.goto(FILE_URL);
  const f = await page.evaluate(() => fitNormal([2, 4, 4, 4, 5, 5, 7, 9]));
  expect(f.mu).toBeCloseTo(5, 12);
  expect(f.sigma).toBeCloseTo(Math.sqrt(32 / 7), 12);
  expect(f.n).toBe(8);
});

// ── Cleaning operations ───────────────────────────────────────────────────

test('renameColumn rewrites rows and renameColumnRefs follows series', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const ds = { id: 'd1', name: 'd', color: '#000', headers: ['old', 'y'],
                 rows: [{ old: 1, y: 2 }, { old: 3, y: 4 }] };
    const series = [
      { id: 's1', datasetId: 'd1', chartType: 'scatter', xCol: 'old', yCol: 'y',
        filters: [{ col: 'old', op: 'gt', value: 0, enabled: true }], style: {} },
      { id: 's2', datasetId: 'other', joinDatasetId: 'd1', chartType: 'parity',
        xCol: 'obs', yCol: 'old', joinKey: 'k', filters: [], style: {} },
    ];
    const ok = renameColumn(ds, 'old', 'fresh');
    const touched = renameColumnRefs(series, 'd1', 'old', 'fresh');
    return { ok, touched, headers: ds.headers, row0: ds.rows[0],
             s1x: series[0].xCol, s1f: series[0].filters[0].col, s2y: series[1].yCol };
  });
  expect(out.ok).toBe(true);
  expect(out.headers).toEqual(['fresh', 'y']);
  expect(out.row0).toEqual({ fresh: 1, y: 2 });
  expect(out.s1x).toBe('fresh');
  expect(out.s1f).toBe('fresh');
  expect(out.s2y).toBe('fresh'); // parity Y lives on the join dataset
  expect(out.touched).toBe(2);
});

test('renameColumn refuses duplicates; castNumeric and handleMissing behave per spec', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['a', 'b'],
                 rows: [{ a: '1', b: 1 }, { a: 'abc', b: null }, { a: '', b: 3 }, { a: '4', b: 5 }] };
    const dupRefused = !renameColumn(ds, 'a', 'b');
    const castFailed = castNumeric(ds, 'a'); // 'abc' fails; '' → missing, not a failure
    const aAfterCast = ds.rows.map(r => r.a);
    const filled = handleMissing(ds, 'b', 'mean');  // mean of [1,3,5] = 3
    const bAfterFill = ds.rows.map(r => r.b);
    const dropped = handleMissing(ds, 'a', 'drop'); // rows where a missing: 'abc'→null, ''→null
    return { dupRefused, castFailed, aAfterCast, filled, bAfterFill, dropped, remaining: ds.rows.length };
  });
  expect(out.dupRefused).toBe(true);
  expect(out.castFailed).toBe(1);
  expect(out.aAfterCast).toEqual([1, null, null, 4]);
  expect(out.filled).toBe(1);
  expect(out.bAfterFill).toEqual([1, 3, 3, 5]);
  expect(out.dropped).toBe(2);
  expect(out.remaining).toBe(2);
});

// ── Data Tools modal UI ───────────────────────────────────────────────────

test('Σ opens Data Tools with stats table; rename via UI follows series refs', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'temp,flow\n20,1\n30,2\n40,3', '_p5_dt.csv');

  // A series referencing the column we will rename
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'temp');
  await page.selectOption('#mYCol', 'flow');
  await page.click('#modalSave');

  await page.click('.dataset-tools');
  await expect(page.locator('#dataToolsOverlay')).not.toHaveClass(/hidden/);
  // :not(.dt-preview) — the Phase 9 preview table shares the base class
  await expect(page.locator('.stats-table:not(.dt-preview)')).toContainText('temp');
  // mean of [20,30,40] = 30.00
  await expect(page.locator('.stats-table:not(.dt-preview)')).toContainText('30.00');

  await page.selectOption('#dtCol', 'temp');
  await page.fill('#dtNewName', 'temperature_C');
  await page.click('#dtRenameBtn');
  await expect(page.locator('#dtMsg')).toContainText('1 series reference(s) updated');

  const xCol = await page.evaluate(() => appState.series[0].xCol);
  expect(xCol).toBe('temperature_C');

  // Escape closes
  await page.keyboard.press('Escape');
  await expect(page.locator('#dataToolsOverlay')).toHaveClass(/hidden/);
});

test('correlation heatmap renders to the plot area with unit diagonal', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'a,b,c\n1,2,9\n2,4,7\n3,6,5\n4,8,1', '_p5_corr.csv');
  await page.click('.dataset-tools');
  await page.click('#dtCorrBtn');
  await page.waitForTimeout(600);

  await expect(page.locator('#dataToolsOverlay')).toHaveClass(/hidden/); // closed itself
  const z = await page.evaluate(() => activePlotDiv().data[0].z);
  expect(z[0][0]).toBe(1);
  expect(z[1][1]).toBe(1);
  expect(z[0][1]).toBeCloseTo(1, 10);   // a–b perfectly correlated
  expect(z[0][2]).toBeLessThan(0);      // a–c anticorrelated
  expect(z[0][2]).toBeCloseTo(z[2][0], 12); // symmetric
});

test('histogram normal fit overlays a correctly scaled curve', async ({ page }) => {
  await page.goto(FILE_URL);
  // 500 deterministic ~normal values via inverse-ish sum trick
  let csv = 'v\n';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) {
    csv += `${(Array.from({ length: 12 }, rnd).reduce((a, b) => a + b, 0) - 6) * 2 + 50}\n`;
  }
  await loadCSV(page, csv, '_p5_fit.csv');

  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="histogram"]');
  await page.selectOption('#mXCol', 'v');
  // Phase 11: the Fit normal checkbox became the fit picker; the old
  // fitNormal boolean back-compat path is covered in distributions.spec.js
  await page.selectOption('#mFitDist', 'normal');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(800);

  const out = await page.evaluate(() => {
    const gd = activePlotDiv();
    const fit = gd.data.find(t => t.mode === 'lines');
    const series = appState.series[0];
    return {
      hasFit: !!fit,
      name: fit?.name,
      peakX: fit ? fit.x[fit.y.indexOf(Math.max(...fit.y))] : null,
      sr: document.querySelector('.plot-panel .sr-only').textContent,
    };
  });
  expect(out.hasFit).toBe(true);
  expect(out.name).toContain('μ=');
  expect(out.peakX).toBeGreaterThan(48); // curve peaks at μ ≈ 50
  expect(out.peakX).toBeLessThan(52);
  expect(out.sr).toContain('normal fit');
});

test('CSV export excludes dropped columns', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'keep,drop_me\n1,2\n3,4', '_p5_export.csv');
  const csv = await page.evaluate(() => {
    const ds = appState.datasets[0];
    dropColumn(ds, 'drop_me');
    return Papa.unparse(ds.rows, { columns: ds.headers });
  });
  expect(csv).toContain('keep');
  expect(csv).not.toContain('drop_me');
  expect(csv.split('\n').length).toBe(3); // header + 2 rows
});
