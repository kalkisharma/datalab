// stabilization-a.spec.js — Stabilization A (correctness & honesty):
// same-dataset parity, line color-by (per-category lines), and the small
// export/legend fixes. Renderer-level tests via buildXTrace, mirroring the
// existing renderer specs.

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

// ── Parity: same-dataset (no join) ──────────────────────────────────────────
test('parity compares two columns of one dataset with no join', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'obs,pred\n1,1.1\n2,1.9\n3,3.2\n4,3.8', '_pa_same.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildParityTrace({ id: 'p', name: 'P', datasetId: ds.id,
      chartType: 'parity', xCol: 'obs', yCol: 'pred' }, appState.datasets);
    const m = r.traces.find(t => t.mode === 'markers');
    return { error: r.error, n: r.n, hasStats: !!r.stats && isFinite(r.stats.nse),
             x: m && m.x, y: m && m.y };
  });
  expect(out.error).toBeNull();          // no "join dataset not found"
  expect(out.n).toBe(4);
  expect(out.hasStats).toBe(true);       // NSE/MAE/RMSE computed
  expect(out.x).toEqual([1, 2, 3, 4]);   // X = observed column
  expect(out.y).toEqual([1.1, 1.9, 3.2, 3.8]); // Y = modelled column, same rows
});

// ── Line color-by (was a silent no-op) ──────────────────────────────────────
test('line color-by splits into one line per category; no color-by = single line', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,grp\n1,2,A\n2,3,B\n3,4,A\n4,5,B', '_ln_cb.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const cb = buildLineTrace({ id: 'l1', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', colorCol: 'grp' }, appState.datasets);
    const plain = buildLineTrace({ id: 'l2', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y' }, appState.datasets);
    return { cbN: cb.traces.length, cbNames: cb.traces.map(t => t.name).sort(),
             cbModes: cb.traces.map(t => t.mode), plainN: plain.traces.length };
  });
  expect(out.cbN).toBe(2);                                  // one line per category
  expect(out.cbNames).toEqual(['A', 'B']);
  expect(out.cbModes.every(m => m === 'lines+markers')).toBe(true); // still lines, not a no-op
  expect(out.plainN).toBe(1);                               // no color-by → single line (unchanged)
});

// ── Legend drag clamped to the figure ───────────────────────────────────────
test('a legend dragged outside [0,1] is clamped within the figure', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_sa_lg.csv');
  const pos = await page.evaluate(() => {
    const ds = appState.datasets[0], pid = appState.plots[0].id;
    appState.series = [{ id: 's', name: 'S', datasetId: ds.id, plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' }];
    renderPlot();
    document.getElementById('plotDiv-' + pid).emit('plotly_relayout', { 'legend.x': 2.5, 'legend.y': -0.4 });
    return appState.plots[0].plotConfig.legendPos;
  });
  expect(pos.x).toBe(1);  // clamped from 2.5
  expect(pos.y).toBe(0);  // clamped from -0.4
});

// ── Dragged parity stats box persists ───────────────────────────────────────
test('a dragged parity stats box position is persisted (survives re-render/export)', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'obs,pred\n1,1.1\n2,2.2\n3,2.9\n4,4.1', '_sa_an.csv');
  const annotPos = await page.evaluate(() => {
    const ds = appState.datasets[0], pid = appState.plots[0].id;
    appState.series = [{ id: 'p', name: 'P', datasetId: ds.id, plotId: pid, chartType: 'parity', xCol: 'obs', yCol: 'pred' }];
    renderPlot();
    // single parity → stats annotation at index 0, before any notes
    document.getElementById('plotDiv-' + pid).emit('plotly_relayout', { 'annotations[0].x': 0.3, 'annotations[0].y': 0.7 });
    return appState.plots[0].plotConfig.annotPos;
  });
  expect(annotPos).toEqual({ x: 0.3, y: 0.7 });
});

// ── SVG export notice for WebGL scatter ─────────────────────────────────────
test('SVG export of a WebGL (>10k pt) scatter shows a rasterization notice; PNG does not', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const rows = []; for (let i = 0; i < 10001; i++) rows.push({ x: i, y: i % 100 });
    appState.datasets.push({ id: 'big', name: 'big', rows, headers: ['x', 'y'], color: '#333333' });
    const pid = appState.plots[0].id;
    appState.series = [{ id: 's', name: 'S', datasetId: 'big', plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' }];
    renderPlot();
    const pd = document.getElementById('plotDiv-' + pid);
    const isGl = (pd._fullData || []).some(t => t.type === 'scattergl');
    const orig = Plotly.downloadImage; Plotly.downloadImage = () => Promise.resolve('');
    const alerts = document.getElementById('dataAlerts');
    alerts.innerHTML = ''; downloadPlot('svg'); const svg = alerts.textContent;
    alerts.innerHTML = ''; downloadPlot('png'); const png = alerts.textContent;
    Plotly.downloadImage = orig;
    return { isGl, svg, png };
  });
  expect(out.isGl).toBe(true);            // confirms the WebGL path
  expect(out.svg).toMatch(/rasterize/i);  // notice on SVG
  expect(out.png).toBe('');               // silent on PNG
});
