// workspace-ergonomics.spec.js — the Workspace & Encoding Ergonomics phase
// (v2.11.0): copy/paste series, hide stats box, scatter join, export at
// on-screen size, hide/show plots, hide series from legend, subplot shared
// color/size-by. Render-integration tests drive appState + renderPlot and
// inspect the live Plotly div, mirroring the existing color-encoding pattern.

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

// ── #6 Hide series from legend ──────────────────────────────────────────────
test('legendHide suppresses a series legend entries but still plots it', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4\n4,5', '_we_lh.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0], pid = appState.plots[0].id;
    appState.series = [{ id: 's1', name: 'A', datasetId: ds.id, plotId: pid,
                         chartType: 'scatter', xCol: 'x', yCol: 'y', legendHide: true }];
    renderPlot();
    const data = document.getElementById('plotDiv-' + pid)._fullData || [];
    return { n: data.length, allHidden: data.every(t => t.showlegend === false) };
  });
  expect(out.n).toBeGreaterThan(0);   // still drawn
  expect(out.allHidden).toBe(true);   // every trace removed from the legend
});

// ── #2 Hide the parity stats annotation box ─────────────────────────────────
test('statsShow:false removes the parity NSE/MAE/RMSE annotation box', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'id,obs\na,1\nb,2\nc,3\nd,4', '_we_a.csv');
  await loadCSV(page, 'id,mod\na,1.1\nb,2.1\nc,2.9\nd,4.2', '_we_b.csv');
  const out = await page.evaluate(() => {
    const [dA, dB] = appState.datasets, pid = appState.plots[0].id;
    const base = { id: 'p1', name: 'P', datasetId: dA.id, joinDatasetId: dB.id,
                   joinKey: 'id', plotId: pid, chartType: 'parity', xCol: 'obs', yCol: 'mod' };
    const statBoxes = (statsShow) => {
      appState.plots[0].plotConfig.statsShow = statsShow;
      appState.series = [{ ...base }];
      renderPlot();
      const pd = document.getElementById('plotDiv-' + pid);
      return (pd._fullLayout.annotations || []).filter(a => (a.text || '').includes('NSE')).length;
    };
    return { withBox: statBoxes(true), without: statBoxes(false) };
  });
  expect(out.withBox).toBe(1);  // present by default
  expect(out.without).toBe(0);  // toggled off
});

// ── #1 Copy / paste series ──────────────────────────────────────────────────
test('copy then paste clones a series into the active plot, original untouched', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_we_cp.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0], p1 = appState.plots[0].id;
    appState.series = [{ id: 's1', name: 'Orig', datasetId: ds.id, plotId: p1,
                         chartType: 'scatter', xCol: 'x', yCol: 'y' }];
    renderSeriesList();
    document.querySelector('.series-item[data-sid="s1"] .series-copy').click();
    addPlot();                              // a new plot becomes active
    const active = appState.activePlotId;
    document.getElementById('pasteSeriesBtn').click();
    const clone = appState.series.find(s => s.id !== 's1');
    return {
      count: appState.series.length, active,
      cloneId: clone && clone.id, clonePlot: clone && clone.plotId,
      cloneName: clone && clone.name, cloneXY: clone && [clone.xCol, clone.yCol],
      origName: appState.series.find(s => s.id === 's1').name,
    };
  });
  expect(out.count).toBe(2);
  expect(out.cloneId).not.toBe('s1');         // fresh id
  expect(out.clonePlot).toBe(out.active);     // pasted into the active plot
  expect(out.cloneName).toBe('Orig (copy)');
  expect(out.cloneXY).toEqual(['x', 'y']);    // definition carried over
  expect(out.origName).toBe('Orig');          // original untouched
});
