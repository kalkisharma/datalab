// size-by.spec.js — Phase 19 size-by controls: sizing law (area/diameter),
// editable min/max px, size-key overrides (hide / label / count), and the
// optional second legend. Renderer-level via buildScatterTrace, plus a
// render-path check for the second legend's layout + drag persistence.

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

// sizes 10,20,30,40,50 — convenient: min 10, median 30, max 50
const SIZE_CSV = 'x,y,m\n1,1,10\n2,2,20\n3,3,30\n4,4,40\n5,5,50';

// 1 — hide the size key but keep the bubble sizing
test('sizeKeyHide suppresses the size-key swatches but still sizes the bubbles', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_hide.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 'h', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeKeyHide: true }, appState.datasets);
    const data = r.traces.find(t => !/^__size_/.test(t.legendgroup || '') && Array.isArray(t.marker?.size));
    return {
      keyCount: r.traces.filter(t => /^__size_/.test(t.legendgroup || '')).length,
      bubblesSized: Array.isArray(data.marker.size) && data.marker.size.length === 5,
    };
  });
  expect(out.keyCount).toBe(0);        // no swatches
  expect(out.bubblesSized).toBe(true); // bubbles still area-sized
});

// 2 — custom min/max px change the data AND the key, in lockstep
test('custom sizeMin/sizeMax resize the bubbles and the key matches them', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_minmax.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 'mm', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeMin: 10, sizeMax: 40 }, appState.datasets);
    const data = r.traces.find(t => Array.isArray(t.marker?.size) && !/^__size_/.test(t.legendgroup || ''));
    const key  = r.traces.filter(t => /^__size_/.test(t.legendgroup || ''));
    return { dataMin: Math.round(data.marker.size[0]), dataMax: Math.round(data.marker.size[4]),
             keyMin: Math.round(key[0].marker.size), keyMax: Math.round(key[2].marker.size) };
  });
  expect(out.dataMin).toBe(10);  // min value → sizeMin px
  expect(out.dataMax).toBe(40);  // max value → sizeMax px
  expect(out.keyMin).toBe(10);   // key swatch matches the bubbles (the coupling)
  expect(out.keyMax).toBe(40);
});

// 3 — diameter law warns and sizes linearly in diameter (not area)
test('sizeLaw "diameter" warns and sizes diameter-linearly', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_diam.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const diam = buildScatterTrace({ id: 'd', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeLaw: 'diameter' }, appState.datasets);
    const area = buildScatterTrace({ id: 'a', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm' }, appState.datasets);
    const med = r => Math.round(r.traces.find(t => Array.isArray(t.marker?.size)).marker.size[2]);
    return { warn: diam.warning, diamMedian: med(diam), areaMedian: med(area) };
  });
  expect(out.warn).toMatch(/exaggerates/i);
  expect(out.diamMedian).toBe(16);   // 4 + 0.5*(28-4) — linear in diameter
  expect(out.areaMedian).toBe(20);   // sqrt(16 + 0.5*768) — linear in area (the honest default)
});

// 4 — swatch count
test('sizeKeyCount controls how many swatches the size key shows', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_count.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 'c', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeKeyCount: 5 }, appState.datasets);
    const key = r.traces.filter(t => /^__size_/.test(t.legendgroup || ''));
    return { n: key.length, labels: key.map(t => t.name) };
  });
  expect(out.n).toBe(5);
  expect(out.labels).toEqual(['10.0', '20.0', '30.0', '40.0', '50.0']);
});

// 5 — custom size-legend label
test('sizeKeyLabel overrides the "Size: <col>" legend title', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_label.csv');
  const title = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 'l', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeKeyLabel: 'Population' }, appState.datasets);
    return r.traces.find(t => t.legendgrouptitle)?.legendgrouptitle.text;
  });
  expect(title).toBe('Population');
});

// 6 — route the size key to a second legend
test('sizeKeySeparate routes the size key to legend2', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_sep.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const sep = buildScatterTrace({ id: 's', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeKeySeparate: true }, appState.datasets);
    const main = buildScatterTrace({ id: 's', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm' }, appState.datasets);
    const k = r => r.traces.filter(t => /^__size_/.test(t.legendgroup || ''));
    return { sepLegends: k(sep).map(t => t.legend), mainLegends: k(main).map(t => t.legend) };
  });
  expect(out.sepLegends.every(l => l === 'legend2')).toBe(true);   // routed to the 2nd legend
  expect(out.mainLegends.every(l => l === undefined)).toBe(true);  // default → main legend
});

// 7 — the second legend appears in the layout and its drag position persists
test('separate size legend yields a layout legend2 whose dragged position persists', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, SIZE_CSV, '_sb_l2.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0], pid = appState.plots[0].id;
    appState.series = [{ id: 's', name: 'S', datasetId: ds.id, plotId: pid, chartType: 'scatter',
      xCol: 'x', yCol: 'y', sizeCol: 'm', sizeKeySeparate: true }];
    renderPlot();
    const pd = document.getElementById('plotDiv-' + pid);
    const hasL2 = !!pd._fullLayout.legend2;
    pd.emit('plotly_relayout', { 'legend2.x': 0.2, 'legend2.y': 0.6 });
    return { hasL2, pos: appState.plots[0].plotConfig.legend2Pos };
  });
  expect(out.hasL2).toBe(true);
  expect(out.pos).toEqual({ x: 0.2, y: 0.6 });
});
