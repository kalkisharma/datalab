// plot-export-bulk.spec.js — plot-data CSV export, bulk axis retarget, and the
// active-plot series highlight.

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

// ── Export: plotted data → CSV (dataset + series labelled) ──────────────────
test('exportPlotData writes one row per point with dataset + series columns; skips non-x/y series', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,10\n2,20', '_pe_a.csv');
  await loadCSV(page, 'x,y\n3,30\n4,40', '_pe_b.csv');
  const out = await page.evaluate(async () => {
    appState.datasets[0].name = 'A';
    appState.datasets[1].name = 'B';
    const pid = appState.plots[0].id;
    const dsA = appState.datasets[0].id, dsB = appState.datasets[1].id;
    appState.series = [
      { id: 's1', name: 'SA', datasetId: dsA, plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' },
      { id: 's2', name: 'SB', datasetId: dsB, plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' },
      { id: 's3', name: 'H',  datasetId: dsA, plotId: pid, chartType: 'histogram', xCol: 'x' },
    ];
    // Capture the CSV without triggering a real download
    let blob = null;
    const origCreate = URL.createObjectURL, origClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = b => { blob = b; return 'blob:cap'; };
    HTMLAnchorElement.prototype.click = function () {};
    exportPlotData();
    URL.createObjectURL = origCreate; HTMLAnchorElement.prototype.click = origClick;
    return { csv: await blob.text(), notice: document.getElementById('dataAlerts').textContent };
  });
  const lines = out.csv.trim().split(/\r?\n/);
  expect(lines[0]).toBe('dataset,series,x,y');     // header
  expect(lines).toContain('A,SA,1,10');
  expect(lines).toContain('A,SA,2,20');
  expect(lines).toContain('B,SB,3,30');
  expect(lines.length).toBe(5);                     // header + 4 points (histogram excluded)
  expect(out.notice).toMatch(/1 non-x\/y series not included/);
});

// ── Bulk axis retarget: apply where possible + notice ───────────────────────
test('bulkSetAxis retargets every series whose dataset has the column; skips the rest with a notice', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,9\n3,4,8', '_pb_a.csv');  // has z
  await loadCSV(page, 'x,y\n5,6\n7,8', '_pb_b.csv');         // no z
  const out = await page.evaluate(() => {
    const pid = appState.plots[0].id;
    const dsA = appState.datasets[0].id, dsB = appState.datasets[1].id;
    appState.series = [
      { id: 'a', name: 'A', datasetId: dsA, plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' },
      { id: 'b', name: 'B', datasetId: dsB, plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' },
      { id: 'c', name: 'C', datasetId: dsA, plotId: pid, chartType: 'scatter', xCol: 'x', yCol: 'y' },
    ];
    bulkSetAxis('x', 'z');
    const xc = id => appState.series.find(s => s.id === id).xCol;
    return { a: xc('a'), b: xc('b'), c: xc('c'), notice: document.getElementById('dataAlerts').textContent };
  });
  expect(out.a).toBe('z');   // dsA has z → retargeted
  expect(out.c).toBe('z');
  expect(out.b).toBe('x');   // dsB lacks z → unchanged
  expect(out.notice).toMatch(/Set X to "z" for 2 of 3 series — 1 skipped/);
});

// ── Active-plot series highlight ────────────────────────────────────────────
test('series rows highlight for the active plot and the highlight follows the active plot', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_ph.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0].id;
    appState.plots.push(makePlot('Plot 2'));
    const p1 = appState.plots[0].id, p2 = appState.plots[1].id;
    appState.series = [
      { id: 's1', name: 'one', datasetId: ds, plotId: p1, chartType: 'scatter', xCol: 'x', yCol: 'y' },
      { id: 's2', name: 'two', datasetId: ds, plotId: p2, chartType: 'scatter', xCol: 'x', yCol: 'y' },
    ];
    const hot = () => [...document.querySelectorAll('.series-item.active-plot-series')].map(el => el.dataset.sid).sort();
    renderSeriesList();
    const onP1 = hot();          // active defaults to plot 1
    setActivePlot(p2);
    const onP2 = hot();          // setActivePlot re-renders the list
    return { onP1, onP2 };
  });
  expect(out.onP1).toEqual(['s1']); // only the active plot's series is highlighted
  expect(out.onP2).toEqual(['s2']); // highlight moved with the active plot
});
