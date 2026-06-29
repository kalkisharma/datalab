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
  const out = await page.evaluate(async () => {
    const ds = appState.datasets[0], pid = appState.plots[0].id;
    appState.series = [{ id: 's1', name: 'A', datasetId: ds.id, plotId: pid,
                         chartType: 'scatter', xCol: 'x', yCol: 'y' }];
    renderPlot();
    const pd = document.getElementById('plotDiv-' + pid);
    // Export now renders off-screen (newPlot + toImage); capture the size it
    // requests rather than the old Plotly.downloadImage opts.
    const calls = [], origNew = Plotly.newPlot, origImg = Plotly.toImage;
    Plotly.newPlot = () => Promise.resolve();
    Plotly.toImage = (gd, opts) => { calls.push(opts); return Promise.resolve('data:image/png;base64,'); };
    document.getElementById('matchScreen').checked = false;
    await downloadPlot('png');
    document.getElementById('matchScreen').checked = true;
    await downloadPlot('png');
    Plotly.newPlot = origNew; Plotly.toImage = origImg;
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

// ── #7 Subplot shared color-by / size-by ────────────────────────────────────
test('subplot shared color-by applies one encoding across all cells', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,site\n1,2,A\n2,3,B\n3,4,A\n4,5,B', '_we_se.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0], plot = appState.plots[0];
    plot.grid = { rows: 1, cols: 2, shareX: false, shareY: false };
    plot.plotConfig.sharedColorCol = 'site';      // shared, neither series sets colorCol
    appState.series = [
      { id: 's1', name: 'L', datasetId: ds.id, plotId: plot.id, chartType: 'scatter', xCol: 'x', yCol: 'y', cell: { row: 1, col: 1 } },
      { id: 's2', name: 'R', datasetId: ds.id, plotId: plot.id, chartType: 'scatter', xCol: 'x', yCol: 'y', cell: { row: 1, col: 2 } },
    ];
    renderPlot();
    const names = (document.getElementById('plotDiv-' + plot.id)._fullData || []).map(t => t.name);
    return { a: names.filter(n => n === 'A').length, b: names.filter(n => n === 'B').length, names };
  });
  expect(out.a).toBe(2);  // a category-"A" trace in each of the two cells
  expect(out.b).toBe(2);  // a category-"B" trace in each cell — shared encoding took effect
});

// ── #3 Optional cross-dataset scatter join ──────────────────────────────────
// The mandatory alignment test (Data Scientist): a dropped/unmatched row must
// not misalign X (primary) and Y (join). B's rows are deliberately out of order
// and missing key "c".
test('scatter join pairs X (primary) with Y (join) on the key; unmatched rows drop, no misalignment', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'id,xv\na,10\nb,20\nc,30\nd,40', '_we_jA.csv');
  await loadCSV(page, 'id,yv\nb,200\nd,400\na,100', '_we_jB.csv');
  const out = await page.evaluate(() => {
    const [dA, dB] = appState.datasets;
    const r = buildScatterTrace({ id: 'j1', name: 'J', datasetId: dA.id, joinDatasetId: dB.id,
      joinKey: 'id', chartType: 'scatter', xCol: 'xv', yCol: 'yv' }, appState.datasets);
    const t = r.traces[0] || {};
    return { error: r.error, x: t.x, y: t.y };
  });
  expect(out.error).toBeNull();
  expect(out.x).toEqual([10, 20, 40]);    // "c" dropped — no match in the join dataset
  expect(out.y).toEqual([100, 200, 400]); // paired by key despite the join dataset's order
});

test('scatter without a join plots all rows (the opt-in changes nothing by default)', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'xv,yv\n1,2\n3,4\n5,6', '_we_nj.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 's', name: 'S', datasetId: ds.id,
      chartType: 'scatter', xCol: 'xv', yCol: 'yv' }, appState.datasets);
    return { x: r.traces[0].x, y: r.traces[0].y };
  });
  expect(out.x).toEqual([1, 3, 5]);
  expect(out.y).toEqual([2, 4, 6]);
});
