// phase7.spec.js — Phase 7 multi-plot live grid: migration v1→v2, two-plot
// independence, per-plot settings isolation, delete cascade, active switching

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

async function addScatter(page, name) {
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(120);
}

// ── Migration v1 → v2 ─────────────────────────────────────────────────────

test('a v1 session file migrates losslessly into a 1-plot grid', async ({ page }) => {
  await page.goto(FILE_URL);
  // Hand-built v1-shaped state, exactly what a v1.x export contained
  const v1 = JSON.stringify({
    _schema: 'datalab-session', app: '1.2.0',
    state: {
      version: 1,
      datasets: [{ id: 'd1', name: 'old-data', color: '#0072b2',
                   headers: ['x', 'y'], rows: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
      series: [{ id: 's1', name: 'legacy', datasetId: 'd1', chartType: 'scatter',
                 xCol: 'x', yCol: 'y', filters: [], style: { color: '#0072b2' }, enabled: true }],
      plotConfig: { title: 'My old title', titleLocked: true, legendShow: false },
      style: {}, savedPlots: [],
    },
  });
  await page.evaluate(payload => {
    const p = JSON.parse(payload);
    applySessionState(migrateSessionState(p.state));
  }, v1);
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => ({
    version:   appState.version,
    plots:     appState.plots.length,
    plotName:  appState.plots[0].name,
    title:     appState.plots[0].plotConfig.title,
    locked:    appState.plots[0].plotConfig.titleLocked,
    legend:    appState.plots[0].plotConfig.legendShow,
    seriesPid: appState.series[0].plotId,
    panels:    document.querySelectorAll('.plot-panel').length,
    traces:    activePlotDiv().data?.length ?? 0,
    renderedTitle: activePlotDiv()._fullLayout.title.text,
  }));
  expect(out.version).toBe(2);
  expect(out.plots).toBe(1);
  expect(out.title).toBe('My old title');
  expect(out.locked).toBe(true);
  expect(out.legend).toBe(false);          // v1 per-plot flag carried over
  expect(out.seriesPid).toBe(appStatePlotId(out)); // series assigned to plots[0]
  expect(out.panels).toBe(1);
  expect(out.traces).toBeGreaterThan(0);
  expect(out.renderedTitle).toBe('My old title'); // locked title survives
});

// helper: plots[0].id is 'p1' from the migration
function appStatePlotId() { return 'p1'; }

// ── Two plots, independent series and settings ────────────────────────────

test('two plots render disjoint series with isolated settings', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,9\n3,4,7\n5,6,5', '_p7_two.csv');
  await addScatter(page, 'on-plot-1');

  // Add a second plot (becomes active) and a series targeted at it
  await page.click('#addPlotBtn');
  expect(await page.evaluate(() => appState.plots.length)).toBe(2);
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="line"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'z');
  await page.fill('#mSeriesName', 'on-plot-2');
  await page.click('#modalSave');

  // Set a title and a manual range on the ACTIVE (second) plot. The range
  // inputs sit in a collapsed <details>, so drive them through their real
  // input events rather than expanding the section
  await page.fill('#inputTitle', 'Second plot title');
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('xMin', '0'); set('xMax', '10');
  });

  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => {
    const [p1, p2] = appState.plots;
    const d1 = document.getElementById('plotDiv-' + p1.id);
    const d2 = document.getElementById('plotDiv-' + p2.id);
    return {
      panels:   document.querySelectorAll('.plot-panel').length,
      gridCols: document.getElementById('plotGrid').className,
      t1: d1.data.map(t => t.name), t2: d2.data.map(t => t.name),
      title1: d1._fullLayout.title.text, title2: d2._fullLayout.title.text,
      range1: d1._fullLayout.xaxis.range, range2: d2._fullLayout.xaxis.range,
      r2isManual: p2.plotConfig.xMin === '0' && p2.plotConfig.xMax === '10',
    };
  });
  expect(out.panels).toBe(2);
  expect(out.gridCols).toContain('cols-2');
  expect(out.t1).toEqual(['on-plot-1']);
  expect(out.t2).toEqual(['on-plot-2']);
  expect(out.title2).toBe('Second plot title');
  expect(out.title1).not.toBe('Second plot title'); // isolation
  expect(out.r2isManual).toBe(true);
  expect(out.range2[0]).toBe(0);
  expect(out.range2[1]).toBe(10);
  // Plot 1's range is auto (Plotly-computed), not [0,10]
  expect(out.range1[1]).not.toBe(10);
});

test('clicking a panel activates it and syncs the settings inputs', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_p7_active.csv');
  await addScatter(page, 's1');
  await page.click('#addPlotBtn'); // plot 2 active

  await page.fill('#inputTitle', 'P2 title');
  // Click back to panel 1 (header area, not the canvas)
  await page.locator('.plot-panel').first().locator('.panel-header').click();
  await page.waitForTimeout(200);

  const out = await page.evaluate(() => ({
    activeId:  appState.activePlotId,
    firstId:   appState.plots[0].id,
    label:     document.getElementById('activePlotLabel').textContent,
    titleInput: document.getElementById('inputTitle').value,
  }));
  expect(out.activeId).toBe(out.firstId);
  expect(out.label).toContain(await page.evaluate(() => appState.plots[0].name));
  expect(out.titleInput).not.toBe('P2 title'); // inputs re-synced to plot 1
});

// ── Delete cascade ────────────────────────────────────────────────────────

test('deleting a plot cascades to its series after confirm; last plot protected', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_p7_del.csv');
  await addScatter(page, 'keep-me');           // plot 1
  await page.click('#addPlotBtn');
  await addScatter(page, 'doomed');            // plot 2 (active)
  expect(await page.evaluate(() => appState.series.length)).toBe(2);

  page.on('dialog', d => d.accept());
  await page.locator('.plot-panel').nth(1).locator('.panel-del').click();
  await page.waitForTimeout(300);

  const out = await page.evaluate(() => ({
    plots:  appState.plots.length,
    series: appState.series.map(s => s.name),
    active: appState.activePlotId === appState.plots[0].id,
    panels: document.querySelectorAll('.plot-panel').length,
  }));
  expect(out.plots).toBe(1);
  expect(out.series).toEqual(['keep-me']);
  expect(out.active).toBe(true);
  expect(out.panels).toBe(1);

  // The last remaining plot cannot be deleted
  await page.locator('.plot-panel .panel-del').click();
  expect(await page.evaluate(() => appState.plots.length)).toBe(1);
});

// ── Session v2 round-trip with two plots ──────────────────────────────────

test('a two-plot session round-trips completely', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4\n5,6', '_p7_rt.csv');
  await addScatter(page, 'alpha');
  await page.click('#addPlotBtn');
  await addScatter(page, 'beta');
  await page.fill('#inputTitle', 'Beta plot');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(800);

  const exported = await page.evaluate(() =>
    JSON.stringify({ _schema: 'datalab-session', app: VERSION, state: appState }));

  await page.goto(FILE_URL);
  await page.evaluate(payload => {
    applySessionState(migrateSessionState(JSON.parse(payload).state));
  }, exported);
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => ({
    plots:  appState.plots.length,
    panels: document.querySelectorAll('.plot-panel').length,
    title2: appState.plots[1].plotConfig.title,
    series: appState.series.map(s => [s.name, s.plotId === appState.plots[0].id ? 1 : 2]),
    traces2: document.getElementById('plotDiv-' + appState.plots[1].id).data?.length ?? 0,
  }));
  expect(out.plots).toBe(2);
  expect(out.panels).toBe(2);
  expect(out.title2).toBe('Beta plot');
  expect(out.series).toEqual([['alpha', 1], ['beta', 2]]);
  expect(out.traces2).toBeGreaterThan(0);
});
