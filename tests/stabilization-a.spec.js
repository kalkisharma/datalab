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

// ── Post-v2.13.0 review follow-ups: honesty warnings ────────────────────────

// Item 6: same-column self-comparison guard.
test('parity warns when X and Y are the same column; not when they differ', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'a,b\n1,2\n2,4\n3,5', '_pa_self.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const base = { id: 'p', name: 'P', datasetId: ds.id, chartType: 'parity' };
    const same = buildParityTrace({ ...base, xCol: 'a', yCol: 'a' }, appState.datasets);
    const diff = buildParityTrace({ ...base, xCol: 'a', yCol: 'b' }, appState.datasets);
    return { sameErr: same.error, sameWarn: same.warning, diffWarn: diff.warning };
  });
  expect(out.sameErr).toBeNull();              // still renders — warn, don't block
  expect(out.sameWarn).toMatch(/same column/i);
  expect(out.diffWarn).toBeNull();             // different columns: no warning
});

// Item 4: missing color values fold into one labelled "(blank)" group + warn.
test('line color-by groups missing color values as "(blank)" and warns', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,grp\n1,2,A\n2,3,\n3,4,A\n4,5,B', '_ln_blank.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildLineTrace({ id: 'l', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', colorCol: 'grp' }, appState.datasets);
    return { warn: r.warning, names: r.traces.map(t => t.name).sort() };
  });
  expect(out.names).toContain('(blank)');      // missing value → one labelled group
  expect(out.warn).toMatch(/no "grp" value/i); // and the user is told
});

// Item 5: high-cardinality cap (mirrors the boxplot/heatmap >50 guard).
test('line color-by warns when a column has too many categories (>50)', async ({ page }) => {
  await page.goto(FILE_URL);
  let csv = 'x,y,id\n';
  for (let i = 0; i < 60; i++) csv += `${i},${i},c${i}\n`;
  await loadCSV(page, csv, '_ln_hicard.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildLineTrace({ id: 'l', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', colorCol: 'id' }, appState.datasets);
    return { warn: r.warning, n: r.traces.length };
  });
  expect(out.n).toBe(60);                       // still drawn
  expect(out.warn).toMatch(/too many to read/i);
});
