// pair.spec.js — pair plot / scatterplot matrix (SPLOM) renderer + modal guards
//
// buildPairTrace is exercised directly (WebGL-independent — the trace objects
// and layout are built regardless of GL availability; only rasterization needs
// a GL context, which headless Chromium lacks). The modal hard-blocks are
// driven through the real UI.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

const numericDS = (cols, n, extra = () => ({})) => ({
  id: 'd', name: 'D', color: '#123456',
  headers: cols.slice(),
  rows: Array.from({ length: n }, (_, i) => {
    const r = {}; cols.forEach((c, k) => { r[c] = i * (k + 1) + (i % 3); });
    return { ...r, ...extra(i) };
  }),
});

test('pair plot builds an N-dimension SPLOM trace with a blank diagonal', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => buildPairTrace(
    { id: 's', datasetId: 'd', chartType: 'pair', pairCols: null, style: {} },
    [{ id: 'd', name: 'D', color: '#123456', headers: ['a', 'b', 'c'],
       rows: Array.from({ length: 10 }, (_, i) => ({ a: i, b: i * 2, c: 10 - i })) }]
  ));
  expect(r.error).toBeNull();
  expect(r.traces).toHaveLength(1);
  expect(r.traces[0].type).toBe('splom');
  expect(r.traces[0].diagonal.visible).toBe(false);           // §20: no native histogram
  expect(r.traces[0].dimensions.map(d => d.label)).toEqual(['a', 'b', 'c']);
  expect(r.traces[0].marker.line.width).toBe(0);              // WebGL fast path
  // The renderer owns the whole layout: one themed axis pair per column.
  expect(Object.keys(r.layout).filter(k => /^xaxis\d*$/.test(k))).toHaveLength(3);
  expect(Object.keys(r.layout).filter(k => /^yaxis\d*$/.test(k))).toHaveLength(3);
  expect(r.layout.xaxis.gridcolor).toBeTruthy();              // themed, not Plotly default
});

test('categorical hue → one splom trace per group, sharing dimensions', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => buildPairTrace(
    { id: 's', datasetId: 'd', chartType: 'pair', pairCols: ['a', 'b'], colorCol: 'g', style: {} },
    [{ id: 'd', name: 'D', color: '#000', headers: ['a', 'b', 'g'],
       rows: Array.from({ length: 12 }, (_, i) => ({ a: i, b: i % 4, g: ['x', 'y', 'z'][i % 3] })) }]
  ));
  expect(r.error).toBeNull();
  expect(r.traces).toHaveLength(3);                            // one per group
  expect(r.traces.every(t => t.type === 'splom')).toBe(true);
  expect(r.traces.map(t => t.name)).toEqual(['x', 'y', 'z']);
  // Identical dimension structure across groups; values are the group's subset.
  for (const t of r.traces) {
    expect(t.dimensions.map(d => d.label)).toEqual(['a', 'b']);
    expect(t.dimensions[0].values).toHaveLength(4);           // 12 rows / 3 groups
    expect(t.showlegend).toBe(true);
  }
  // Distinct palette colors per group.
  expect(new Set(r.traces.map(t => t.marker.color)).size).toBe(3);
});

test('missing explicit columns drop with a warning; <2 survivors is a hard error', async ({ page }) => {
  await page.goto(FILE_URL);
  const ds = [{ id: 'd', name: 'D', color: '#000', headers: ['a', 'b'],
    rows: Array.from({ length: 8 }, (_, i) => ({ a: i, b: i * 2 })) }];

  const drop = await page.evaluate((ds) => buildPairTrace(
    { datasetId: 'd', chartType: 'pair', pairCols: ['a', 'b', 'gone'], style: {} }, ds), ds);
  expect(drop.error).toBeNull();
  expect(drop.traces[0].dimensions.map(d => d.label)).toEqual(['a', 'b']);
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
  expect(r.traces[0].dimensions).toHaveLength(12);
  expect(r.warning).toMatch(/first 12 of 14/i);
});

test('pairwise-complete deletion is disclosed when a column has gaps (§20)', async ({ page }) => {
  await page.goto(FILE_URL);
  const r = await page.evaluate(() => buildPairTrace(
    { datasetId: 'd', chartType: 'pair', pairCols: ['a', 'b'], style: {} },
    [{ id: 'd', name: 'D', color: '#000', headers: ['a', 'b'],
       // 10 rows; b is blank on 2 of them → 8 complete, n varies per cell
       rows: Array.from({ length: 10 }, (_, i) => ({ a: i, b: (i % 5 === 0) ? '' : i * 2 })) }]
  ));
  expect(r.warning).toMatch(/pairwise-complete/i);
  expect(r.warning).toMatch(/8 of 10/);
});

test('a pair plot is blocked from sharing a plot with other series', async ({ page }) => {
  await page.goto(FILE_URL);
  const csv = 'a,b,c,g\n' + Array.from({ length: 12 }, (_, i) =>
    `${i},${i * 2},${12 - i},${['x', 'y'][i % 2]}`).join('\n');
  await page.setInputFiles('#fileInput', { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForTimeout(300);

  // Add the pair plot
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="pair"]');
  await page.waitForTimeout(120);
  await page.fill('#mSeriesName', 'pairs');
  await page.click('#modalSave');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => appState.series.length)).toBe(1);

  // Now a scatter into the same plot must be blocked
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.waitForTimeout(120);
  await page.selectOption('#mXCol', 'a');
  await page.selectOption('#mYCol', 'b');
  await page.click('#modalSave');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => document.getElementById('modalError').textContent)).toMatch(/whole panel/i);
  expect(await page.evaluate(() => appState.series.length)).toBe(1); // not added
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
  expect(checked).toBe(8);                                     // soft-cap default
  expect(await page.evaluate(() => document.getElementById('mPairCount').textContent))
    .toMatch(/8 columns → 64 cells/);
});
