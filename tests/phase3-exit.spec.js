// phase3-exit.spec.js — Phase 3 exit: date prompt UI flow (ARIA pass) and
// the Data Scientist exploratory scenario across all 5 chart types

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(350);
  fs.unlinkSync(csvPath);
}

// ── Date format prompt UI (ARIA: focus, Escape, choice persistence) ───────

test('ambiguous datetime: prompt opens focused, choice saves series, asked once', async ({ page }) => {
  await page.goto(FILE_URL);
  // Every date has both components ≤ 12 → ambiguous
  await loadCSV(page, 'when,v\n01/02/2024,1\n03/04/2024,2\n05/06/2024,3', 'ambig.csv');

  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="line"]');
  await page.selectOption('#mXCol', 'when');
  await page.selectOption('#mYCol', 'v');
  await page.click('#modalSave');

  // Prompt visible, focus on the first action (ARIA checklist item 3)
  await expect(page.locator('#dateFmtOverlay')).not.toHaveClass(/hidden/);
  const focused = await page.evaluate(() => document.activeElement.id);
  expect(focused).toBe('dateFmtMDY');

  // Choose DD/MM — series saves, format stored on the dataset
  await page.click('#dateFmtDMY');
  await page.waitForTimeout(200);
  await expect(page.locator('#modalOverlay')).toHaveClass(/hidden/);
  const stored = await page.evaluate(() => ({
    fmt: appState.datasets[0].dateFormats?.when,
    series: appState.series.length,
  }));
  expect(stored.fmt).toBe('DMY');
  expect(stored.series).toBe(1);

  // Second series on the same column: no prompt (asked once)
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'when');
  await page.selectOption('#mYCol', 'v');
  await page.click('#modalSave');
  await page.waitForTimeout(200);
  await expect(page.locator('#dateFmtOverlay')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => appState.series.length)).toBe(2);
});

test('ambiguous datetime: Escape cancels back to the series modal unsaved', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'when,v\n01/02/2024,1\n03/04/2024,2', 'ambig2.csv');

  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="line"]');
  await page.selectOption('#mXCol', 'when');
  await page.selectOption('#mYCol', 'v');
  await page.click('#modalSave');
  await expect(page.locator('#dateFmtOverlay')).not.toHaveClass(/hidden/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#dateFmtOverlay')).toHaveClass(/hidden/);
  // Series modal still open (save did not complete), nothing saved
  await expect(page.locator('#modalOverlay')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => appState.series.length)).toBe(0);
  expect(await page.evaluate(() => appState.datasets[0].dateFormats?.when)).toBeUndefined();
});

// ── Exploratory: all 5 chart types end-to-end (Data Scientist) ────────────

test('all 5 chart types render together from realistic CSVs', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(FILE_URL);

  // Sensor-style data: numeric temp/flow, categorical site
  let sensor = 'sample_id,temperature,flow_rate,site\n';
  for (let i = 0; i < 240; i++) {
    sensor += `S${i},${(20 + (i % 60) + Math.sin(i)).toFixed(2)},${(10 + (i % 90)).toFixed(1)},site_${i % 4}\n`;
  }
  await loadCSV(page, sensor, 'sensor.csv');

  // Pre-gridded sweep for contour: 6 × 5 grid
  let grid = 'xpos,ypos,response\n';
  for (const x of [0, 1, 2, 3, 4, 5]) for (const y of [0, 10, 20, 30, 40]) {
    grid += `${x},${y},${(x * y + x).toFixed(1)}\n`;
  }
  await loadCSV(page, grid, 'sweep.csv');

  const add = async (type, opts) => {
    await page.click('#addSeriesBtn');
    if (opts.dataset) await page.selectOption('#mDataset', { label: opts.dataset });
    await page.click(`.ct-btn[data-ct="${type}"]`);
    if (opts.x) await page.selectOption('#mXCol', opts.x);
    if (opts.y) await page.selectOption('#mYCol', opts.y);
    if (opts.z) await page.selectOption('#mZCol', opts.z);
    if (opts.join) { await page.selectOption('#mJoinDataset', { label: opts.join }); await page.selectOption('#mJoinKey', opts.key); }
    await page.fill('#mSeriesName', opts.name);
    await page.click('#modalSave');
    await page.waitForTimeout(150);
  };

  await add('scatter',   { dataset: 'sensor', x: 'temperature', y: 'flow_rate', name: 'scatter' });
  await add('line',      { dataset: 'sensor', x: 'temperature', y: 'flow_rate', name: 'line' });
  await add('histogram', { dataset: 'sensor', x: 'temperature', name: 'hist' });
  await add('boxplot',   { dataset: 'sensor', y: 'flow_rate', x: 'site', name: 'box' });
  await add('contour',   { dataset: 'sweep',  x: 'xpos', y: 'ypos', z: 'response', name: 'contour' });

  expect(await page.evaluate(() => appState.series.length)).toBe(5);
  await page.click('#renderBtn');
  await page.waitForTimeout(1500);

  // All five render without errors (overlaying them is statistically odd but
  // must not break — the Data Scientist's concern is correctness, not taste)
  await expect(page.locator('.panel-errors .render-error')).toHaveCount(0);
  const types = await page.evaluate(() =>
    activePlotDiv().data.map(t => t.type)
  );
  expect(types).toContain('histogram');
  expect(types).toContain('box');
  expect(types).toContain('contour');
});
