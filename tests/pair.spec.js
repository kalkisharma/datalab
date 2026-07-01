// pair.spec.js — pair plot / scatterplot matrix (SPLOM) renderer + modal guards
//
// v2.25.0: the matrix is built from plain SVG `scatter` (off-diagonal) +
// `histogram` (diagonal) traces on an N×N layout.grid — NOT a WebGL `splom`
// trace — so it renders on every browser (the splom dead-ended with "WebGL is
// not supported" where hardware acceleration was off / GPU blocklisted / in a
// VM). Because these are SVG traces they render headless and CAN be verified
// in-app (unlike the old splom).

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

const typeCounts = (traces) => traces.reduce((m, t) => { m[t.type] = (m[t.type] || 0) + 1; return m; }, {});

test('pair plot builds an SVG scatter+histogram matrix (no WebGL splom)', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => buildPairTrace(
    { id: 's', datasetId: 'd', chartType: 'pair', pairCols: null, style: {} },
    [{ id: 'd', name: 'D', color: '#123456', headers: ['a', 'b', 'c'],
       rows: Array.from({ length: 20 }, (_, i) => ({ a: i, b: i * 2, c: 20 - i })) }]
  ));
  expect(r.error).toBeNull();
  const types = r.traces.reduce((m, t) => { m[t.type] = (m[t.type] || 0) + 1; return m; }, {});
  expect(types.splom).toBeUndefined();          // no WebGL trace
  expect(types.scatter).toBe(6);                // N²−N off-diagonal cells (3²−3)
  expect(types.histogram).toBe(3);              // N diagonal marginals
  // Whole-plot N×N grid + one themed axis pair per cell.
  expect(r.layout.grid).toMatchObject({ rows: 3, columns: 3, pattern: 'independent' });
  expect(Object.keys(r.layout).filter(k => /^xaxis\d*$/.test(k))).toHaveLength(9);
  // Edge labels only: bottom row carries the column-variable x-titles.
  expect(r.layout.xaxis7.title.text).toBe('a'); // cell (row3,col1)
  expect(r.layout.xaxis9.title.text).toBe('c'); // cell (row3,col3)
  // Off-diagonal markers have no WebGL edge (SVG fast path irrelevant, but kept 0).
  expect(r.traces.find(t => t.type === 'scatter').marker.line.width).toBe(0);
});

test('categorical hue → per-group scatter + overlaid histograms, one legend entry per group', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => buildPairTrace(
    { id: 's', datasetId: 'd', chartType: 'pair', pairCols: ['a', 'b'], colorCol: 'g', style: {} },
    [{ id: 'd', name: 'D', color: '#000', headers: ['a', 'b', 'g'],
       rows: Array.from({ length: 12 }, (_, i) => ({ a: i, b: i % 4, g: ['x', 'y', 'z'][i % 3] })) }]
  ));
  expect(r.error).toBeNull();
  const scat = r.traces.filter(t => t.type === 'scatter');
  const hist = r.traces.filter(t => t.type === 'histogram');
  // 2×2 grid: 2 off-diagonal cells × 3 groups = 6 scatter; 2 diagonal × 3 = 6 histograms.
  expect(scat).toHaveLength(6);
  expect(hist).toHaveLength(6);
  // Exactly one legend entry per group (from the first off-diagonal cell).
  expect(scat.filter(t => t.showlegend)).toHaveLength(3);
  expect([...new Set(scat.filter(t => t.showlegend).map(t => t.name))].sort()).toEqual(['x', 'y', 'z']);
  // Diagonal histograms overlay by group.
  expect(r.layout.barmode).toBe('overlay');
  expect(new Set(scat.map(t => t.marker.color)).size).toBe(3);
});

test('missing explicit columns drop with a warning; <2 survivors is a hard error', async ({ page }) => {
  await page.goto(FILE_URL);
  const ds = [{ id: 'd', name: 'D', color: '#000', headers: ['a', 'b'],
    rows: Array.from({ length: 8 }, (_, i) => ({ a: i, b: i * 2 })) }];

  const drop = await page.evaluate((ds) => buildPairTrace(
    { datasetId: 'd', chartType: 'pair', pairCols: ['a', 'b', 'gone'], style: {} }, ds), ds);
  expect(drop.error).toBeNull();
  expect(drop.layout.grid).toMatchObject({ rows: 2, columns: 2 });
  expect(drop.warning).toMatch(/no longer available/i);

  const tooFew = await page.evaluate((ds) => buildPairTrace(
    { datasetId: 'd', chartType: 'pair', pairCols: ['a', 'gone1', 'gone2'], style: {} }, ds), ds);
  expect(tooFew.traces).toHaveLength(0);
  expect(tooFew.error).toMatch(/at least 2 numeric/i);
});

test('over the hard cap (12) is capped and warned at render', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => {
    const cols = Array.from({ length: 14 }, (_, k) => 'c' + k);
    const ds = { id: 'd', name: 'D', color: '#000', headers: cols,
      rows: Array.from({ length: 6 }, (_, i) => { const o = {}; cols.forEach((c, k) => o[c] = i + k); return o; }) };
    return buildPairTrace({ datasetId: 'd', chartType: 'pair', pairCols: null, style: {} }, [ds]);
  });
  expect(r.error).toBeNull();
  expect(r.layout.grid).toMatchObject({ rows: 12, columns: 12 });   // capped from 14
  expect(r.traces.filter(t => t.type === 'histogram')).toHaveLength(12);
  expect(r.warning).toMatch(/first 12 of 14/i);
});

test('pairwise-complete deletion is disclosed when a column has gaps (§20)', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => buildPairTrace(
    { datasetId: 'd', chartType: 'pair', pairCols: ['a', 'b'], style: {} },
    [{ id: 'd', name: 'D', color: '#000', headers: ['a', 'b'],
       rows: Array.from({ length: 10 }, (_, i) => ({ a: i, b: (i % 5 === 0) ? '' : i * 2 })) }]
  ));
  expect(r.warning).toMatch(/pairwise-complete/i);
  expect(r.warning).toMatch(/8 of 10/);
});

test('a pair plot renders in-app without WebGL (the shipped defect fix)', async ({ page }) => {
  await page.goto(FILE_URL);
  const csv = 'a,b,c,g\n' + Array.from({ length: 30 }, (_, i) =>
    `${i},${(i * 2 + i % 3)},${30 - i},${['x', 'y', 'z'][i % 3]}`).join('\n');
  await page.setInputFiles('#fileInput', { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(300);
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="pair"]');
  await page.waitForTimeout(150);
  await page.selectOption('#mColorCol', 'g');
  await page.fill('#mSeriesName', 'pairs');
  await page.click('#modalSave');
  await page.waitForTimeout(500);
  const rendered = await page.evaluate(() => {
    const pd = activePlotDiv();
    const fd = pd._fullData || [];
    const fl = pd._fullLayout || {};
    return {
      types: [...new Set(fd.map(t => t.type))].sort(),
      hasSplom: fd.some(t => t.type === 'splom'),
      axisCount: Object.keys(fl).filter(k => /^xaxis\d*$/.test(k)).length,
      // Plotly injects the WebGL-unsupported <p> into the panel on gl failure
      webglMsg: (pd.querySelector('.gl-container') || {}).textContent || '',
    };
  });
  // 3 numeric cols (a,b,c; g is the categorical hue) → 3×3 grid = 9 axis pairs;
  // SVG scatter + histogram only, no WebGL splom.
  expect(rendered.hasSplom).toBe(false);
  expect(rendered.types).toEqual(['histogram', 'scatter']);
  expect(rendered.axisCount).toBe(9);
  expect(rendered.webglMsg).not.toMatch(/WebGL is not supported/i);
});

test('a pair plot is blocked from sharing a plot with other series', async ({ page }) => {
  await page.goto(FILE_URL);
  const csv = 'a,b,c,g\n' + Array.from({ length: 12 }, (_, i) =>
    `${i},${i * 2},${12 - i},${['x', 'y'][i % 2]}`).join('\n');
  await page.setInputFiles('#fileInput', { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(300);

  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="pair"]');
  await page.waitForTimeout(120);
  await page.fill('#mSeriesName', 'pairs');
  await page.click('#modalSave');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => appState.series.length)).toBe(1);

  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.waitForTimeout(120);
  await page.selectOption('#mXCol', 'a');
  await page.selectOption('#mYCol', 'b');
  await page.click('#modalSave');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.getElementById('modalError').textContent)).toMatch(/whole panel/i);
  expect(await page.evaluate(() => appState.series.length)).toBe(1);
});

test('the modal defaults to the first 8 numeric columns and shows the cell count', async ({ page }) => {
  await page.goto(FILE_URL);
  const cols = Array.from({ length: 11 }, (_, k) => 'n' + k);
  const csv = cols.join(',') + '\n' +
    Array.from({ length: 6 }, (_, i) => cols.map((_, k) => i + k).join(',')).join('\n');
  await page.setInputFiles('#fileInput', { name: 'wide.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(300);
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="pair"]');
  await page.waitForTimeout(150);
  const checked = await page.evaluate(() =>
    [...document.querySelectorAll('.mPairCol')].filter(b => b.checked).length);
  expect(checked).toBe(8);
  expect(await page.evaluate(() => document.getElementById('mPairCount').textContent))
    .toMatch(/8 columns → 64 cells/);
});
