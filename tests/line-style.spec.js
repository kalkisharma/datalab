// line-style.spec.js — line-series controls (Phase 19+): the global-marker-size
// fix, the show-markers toggle, line dash, and a separate marker color.
// Renderer-level via buildLineTrace.

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

// BUG FIX: line markers now honor the global #markerSize slider + per-series size
test('line markers honor the global marker-size slider and per-series size (was hardcoded 4)', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_ls_size.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const base = { id: 'l', name: 'L', datasetId: ds.id, chartType: 'line', xCol: 'x', yCol: 'y' };
    const mk = s => buildLineTrace(s, appState.datasets).traces[0].marker.size;
    const deflt = mk(base);                                       // global default
    const perSeries = mk({ ...base, style: { markerSize: 12 } }); // per-series override
    document.getElementById('markerSize').value = '10';
    const slider = mk(base);                                      // global slider reaches line markers
    return { deflt, perSeries, slider };
  });
  expect(out.deflt).toBe(6);      // the global default — no longer the hardcoded 4
  expect(out.perSeries).toBe(12); // per-series override wins
  expect(out.slider).toBe(10);    // moving the global slider now resizes line markers
});

test('show-markers toggle switches the trace mode; default keeps markers', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_ls_mode.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const base = { id: 'l', name: 'L', datasetId: ds.id, chartType: 'line', xCol: 'x', yCol: 'y' };
    const mode = s => buildLineTrace(s, appState.datasets).traces[0].mode;
    return { on: mode(base), off: mode({ ...base, style: { showMarkers: false } }) };
  });
  expect(out.on).toBe('lines+markers'); // default unchanged
  expect(out.off).toBe('lines');        // markers hidden
});

test('line style sets the dash; default is solid', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_ls_dash.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const base = { id: 'l', name: 'L', datasetId: ds.id, chartType: 'line', xCol: 'x', yCol: 'y' };
    const dash = s => buildLineTrace(s, appState.datasets).traces[0].line.dash;
    return { dashed: dash({ ...base, style: { lineDash: 'dash' } }), solid: dash(base) };
  });
  expect(out.dashed).toBe('dash');
  expect(out.solid).toBeUndefined(); // undefined = Plotly solid
});

test('marker color overrides only the single line; color-by keeps category colors', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,g\n1,2,A\n2,3,B\n3,4,A\n4,5,B', '_ls_mc.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const single = buildLineTrace({ id: 'l', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', style: { color: '#0000ff', markerColor: '#ff0000' } }, appState.datasets);
    const grouped = buildLineTrace({ id: 'l', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', colorCol: 'g', style: { color: '#0000ff', markerColor: '#ff0000' } }, appState.datasets);
    return {
      lineColor:   single.traces[0].line.color,
      markerColor: single.traces[0].marker.color,
      groupedMatch: grouped.traces.every(t => t.marker.color === t.line.color), // category color wins
    };
  });
  expect(out.lineColor).toBe('#0000ff');    // line keeps its color
  expect(out.markerColor).toBe('#ff0000');  // markers take the override
  expect(out.groupedMatch).toBe(true);      // per-category: marker == line color, override ignored
});
