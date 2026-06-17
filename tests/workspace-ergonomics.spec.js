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

// ── #4 Export at on-screen resolution ───────────────────────────────────────
test('"match on-screen size" exports at the panel size, else the sliders', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_we_ex.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0], pid = appState.plots[0].id;
    appState.series = [{ id: 's1', name: 'A', datasetId: ds.id, plotId: pid,
                         chartType: 'scatter', xCol: 'x', yCol: 'y' }];
    renderPlot();
    const pd = document.getElementById('plotDiv-' + pid);
    const calls = [], orig = Plotly.downloadImage;
    Plotly.downloadImage = (gd, opts) => { calls.push(opts); return Promise.resolve('data:,'); };
    document.getElementById('matchScreen').checked = false;
    downloadPlot('png');
    document.getElementById('matchScreen').checked = true;
    downloadPlot('png');
    Plotly.downloadImage = orig;
    return { off: calls[0], on: calls[1],
             cw: Math.round(pd.clientWidth), ch: Math.round(pd.clientHeight),
             figW: parseInt(document.getElementById('figW').value),
             figH: parseInt(document.getElementById('figH').value) };
  });
  expect(out.off.width).toBe(out.figW);   // sliders when off
  expect(out.off.height).toBe(out.figH);
  expect(out.cw).toBeGreaterThan(0);       // panel is really measured
  expect(out.on.width).toBe(out.cw);       // panel size when on
  expect(out.on.height).toBe(out.ch);
});

// ── #5 Hide / show plots ────────────────────────────────────────────────────
test('hide a plot to a restorable chip; last visible cannot be hidden', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_we_hp.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0], p1 = appState.plots[0].id;
    addPlot();                       // plot 2 becomes active
    const p2 = appState.activePlotId;
    appState.series = [
      { id: 'a', name: 'A', datasetId: ds.id, plotId: p1, chartType: 'scatter', xCol: 'x', yCol: 'y' },
      { id: 'b', name: 'B', datasetId: ds.id, plotId: p2, chartType: 'scatter', xCol: 'x', yCol: 'y' },
    ];
    renderPlot();
    togglePlotHidden(p2);            // hide the active plot
    const panel2 = document.querySelector('.plot-panel[data-pid="' + p2 + '"]');
    const afterHide = {
      panel2Display: panel2.style.display,
      chips: document.querySelectorAll('#hiddenPlotsBar .hidden-plot-chip').length,
      barShown: document.getElementById('hiddenPlotsBar').style.display !== 'none',
      activeMovedOff: appState.activePlotId === p1,
      p2hidden: appState.plots.find(p => p.id === p2).hidden === true,
    };
    togglePlotHidden(p1);            // try to hide the last visible — refused
    const p1stillVisible = !appState.plots.find(p => p.id === p1).hidden;
    document.querySelector('#hiddenPlotsBar .hidden-plot-chip').click(); // restore p2
    const afterShow = {
      p2shown: appState.plots.find(p => p.id === p2).hidden === false,
      barEmpty: document.getElementById('hiddenPlotsBar').style.display === 'none',
    };
    return { ...afterHide, p1stillVisible, ...afterShow };
  });
  expect(out.panel2Display).toBe('none');  // panel leaves the grid flow
  expect(out.chips).toBe(1);               // one restorable chip
  expect(out.barShown).toBe(true);
  expect(out.activeMovedOff).toBe(true);   // active moves off the hidden plot
  expect(out.p2hidden).toBe(true);
  expect(out.p1stillVisible).toBe(true);   // last visible refuses to hide
  expect(out.p2shown).toBe(true);          // chip restores it
  expect(out.barEmpty).toBe(true);         // bar empties when nothing hidden
});
