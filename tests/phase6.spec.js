// phase6.spec.js — Phase 6: plot typography, frame controls (auto-with-
// override), legend show/hide + position persistence, chrome typography

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

async function loadAndRender(page) {
  const csvPath = path.join(__dirname, 'data', '_p6.csv');
  fs.writeFileSync(csvPath, 'x,y\n1,2\n3,4\n5,6');
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.click('#modalSave');
  await page.click('#renderBtn');
  await page.waitForTimeout(700);
}

const fullLayout = page => page.evaluate(() => {
  const fl = activePlotDiv()._fullLayout;
  return {
    titleSize:  fl.title.font.size,
    axisSize:   fl.xaxis.title.font.size,
    tickSize:   fl.xaxis.tickfont.size,
    legendSize: fl.legend?.font.size,
    showlegend: fl.showlegend,
    lineColor:  fl.xaxis.linecolor,
    lineWidth:  fl.xaxis.linewidth,
    gridColor:  fl.xaxis.gridcolor,
    legendX:    fl.legend?.x,
    legendY:    fl.legend?.y,
  };
});

test('typography sliders drive every plot font', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadAndRender(page);

  let fl = await fullLayout(page);
  expect(fl.titleSize).toBe(14);   // defaults
  expect(fl.tickSize).toBe(10);

  await page.evaluate(() => {
    document.getElementById('fsTitle').value  = '24';
    document.getElementById('fsAxis').value   = '18';
    document.getElementById('fsTick').value   = '14';
    document.getElementById('fsLegend').value = '16';
    renderPlot();
  });
  await page.waitForTimeout(400);

  fl = await fullLayout(page);
  expect(fl.titleSize).toBe(24);
  expect(fl.axisSize).toBe(18);
  expect(fl.tickSize).toBe(14);
  expect(fl.legendSize).toBe(16);
});

test('frame auto follows the theme; override applies; re-check restores auto', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadAndRender(page);

  // Auto on white background → theme axis color
  let fl = await fullLayout(page);
  expect(fl.lineColor).toBe('#aaaaaa');
  expect(fl.lineWidth).toBe(1);

  // Explicit override
  await page.evaluate(() => {
    document.getElementById('frameAuto').checked = false;
    document.getElementById('frameColor').disabled = false;
    document.getElementById('frameColor').value = '#ff0000';
    document.getElementById('frameWidth').value = '3';
    renderPlot();
  });
  await page.waitForTimeout(400);
  fl = await fullLayout(page);
  expect(fl.lineColor).toBe('#ff0000');
  expect(fl.lineWidth).toBe(3);

  // Auto re-checked → back to theme even though the input still says red
  await page.evaluate(() => {
    document.getElementById('frameAuto').checked = true;
    renderPlot();
  });
  await page.waitForTimeout(400);
  fl = await fullLayout(page);
  expect(fl.lineColor).toBe('#aaaaaa');

  // Gridline override too
  await page.evaluate(() => {
    document.getElementById('gridAuto').checked = false;
    document.getElementById('gridColor').value = '#00ff00';
    renderPlot();
  });
  await page.waitForTimeout(400);
  fl = await fullLayout(page);
  expect(fl.gridColor).toBe('#00ff00');
});

test('legend toggle hides it; dragged position survives re-render and session round-trip', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadAndRender(page);

  // Hide
  await page.uncheck('#showLegend');
  await page.waitForTimeout(400);
  expect((await fullLayout(page)).showlegend).toBe(false);
  await page.check('#showLegend');
  await page.waitForTimeout(400);
  expect((await fullLayout(page)).showlegend).toBe(true);

  // Simulate a legend drag (Plotly emits plotly_relayout with legend.x/y)
  await page.evaluate(() =>
    Plotly.relayout(activePlotDiv(), { 'legend.x': 0.55, 'legend.y': 0.45 })
  );
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => activePlot().plotConfig.legendPos)).toEqual({ x: 0.55, y: 0.45 });

  // A style-only re-render must NOT snap it back (the Phase 6 fix)
  await page.evaluate(() => renderPlot());
  await page.waitForTimeout(400);
  const fl = await fullLayout(page);
  expect(fl.legendX).toBeCloseTo(0.55, 10);
  expect(fl.legendY).toBeCloseTo(0.45, 10);

  // Session round-trip carries position and visibility
  const exported = await page.evaluate(() =>
    JSON.stringify({ _schema: 'datalab-session', app: VERSION, state: appState }));
  await page.goto(FILE_URL);
  await page.evaluate(payload => {
    applySessionState(migrateSessionState(JSON.parse(payload).state));
  }, exported);
  await page.waitForTimeout(700);
  const pos = await page.evaluate(() => activePlot().plotConfig.legendPos);
  expect(pos).toEqual({ x: 0.55, y: 0.45 });
});

test('annotation font slider reaches parity stats annotations', async ({ page }) => {
  await page.goto(FILE_URL);
  const csvPath = path.join(__dirname, 'data', '_p6b.csv');
  fs.writeFileSync(csvPath, 'k,obs,mod\n1,10,11\n2,20,19\n3,30,33');
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);

  await page.evaluate(() => {
    const ds = appState.datasets[0];
    appState.series.push({ id: 'p', name: 'p', datasetId: ds.id, chartType: 'parity',
      joinDatasetId: ds.id, joinKey: 'k', xCol: 'obs', yCol: 'mod',
      filters: [], style: {}, enabled: true, band5: false, band10: false });
    document.getElementById('fsAnnot').value = '17';
    renderPlot();
  });
  await page.waitForTimeout(500);
  const size = await page.evaluate(() =>
    activePlotDiv()._fullLayout.annotations[0].font.size);
  expect(size).toBe(17);
});

test('a v1 flat style preset loads typography and frame fields through the real loader', async ({ page }) => {
  await page.goto(FILE_URL);
  // v1 flat file exactly as a pre-Phase-8 export wrote it
  const v1 = {
    _schema: 'datalab-style-preset-v1',
    fsTitle: '22', frameAuto: false, frameColor: '#112233', showLegend: false,
  };
  const presetPath = path.join(__dirname, 'data', '_p6_preset_v1.json');
  fs.writeFileSync(presetPath, JSON.stringify(v1));
  await page.setInputFiles('#presetFileInput', presetPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(presetPath);

  const out = await page.evaluate(() => ({
    fsTitle:   document.getElementById('fsTitle').value,
    frameAuto: document.getElementById('frameAuto').checked,
    frameColor: document.getElementById('frameColor').value,
    legend:    document.getElementById('showLegend').checked,
    // frame color input enabled because frameAuto came in false
    colorEnabled: !document.getElementById('frameColor').disabled,
  }));
  expect(out.fsTitle).toBe('22');
  expect(out.frameAuto).toBe(false);
  expect(out.frameColor).toBe('#112233');
  expect(out.legend).toBe(false);
  expect(out.colorEnabled).toBe(true);
});

test('chrome typography is the larger scale', async ({ page }) => {
  await page.goto(FILE_URL);
  const sizes = await page.evaluate(() => ({
    body:    getComputedStyle(document.body).fontSize,
    section: getComputedStyle(document.querySelector('.section-title')).fontSize,
    hint:    getComputedStyle(document.querySelector('.dz-hint')).fontSize,
  }));
  expect(sizes.body).toBe('14px');
  expect(sizes.section).toBe('11px');
  expect(sizes.hint).toBe('12px');
});
