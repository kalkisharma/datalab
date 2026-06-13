// series-list.spec.js — Phase 2 series list interactions:
// enable/disable toggle, reorder, per-series style overrides

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

async function addSeries(page, chartType, name) {
  await page.click('#addSeriesBtn');
  await page.click(`.ct-btn[data-ct="${chartType}"]`);
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  if (name) await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(100);
}

async function traceCount(page) {
  return page.evaluate(() => activePlotDiv().data?.length ?? 0);
}

test('toggling a series off removes its trace; back on restores it', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4\n5,6', '_sl_toggle.csv');
  await addSeries(page, 'scatter', 'one');
  await addSeries(page, 'line', 'two');

  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(800);
  expect(await traceCount(page)).toBe(2);

  // Toggle the first series off — debounced re-render
  await page.locator('.series-item .series-ena').first().uncheck();
  await page.waitForTimeout(800);
  expect(await traceCount(page)).toBe(1);

  await page.locator('.series-item .series-ena').first().check();
  await page.waitForTimeout(800);
  expect(await traceCount(page)).toBe(2);
});

test('move buttons reorder series; boundary buttons disabled', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_sl_reorder.csv');
  await addSeries(page, 'scatter', 'first');
  await addSeries(page, 'line', 'second');

  const names = () => page.evaluate(() => appState.series.map(s => s.name));
  expect(await names()).toEqual(['first', 'second']);

  // First row: up disabled; last row: down disabled
  await expect(page.locator('.series-item').first().locator('.series-move[data-dir="-1"]')).toBeDisabled();
  await expect(page.locator('.series-item').last().locator('.series-move[data-dir="1"]')).toBeDisabled();

  // Move 'second' up
  await page.locator('.series-item').last().locator('.series-move[data-dir="-1"]').click();
  expect(await names()).toEqual(['second', 'first']);
});

test('per-series style overrides persist and apply to the trace', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4\n5,6', '_sl_style.csv');

  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.fill('#mStyleMarkerSize', '15');
  await page.click('#modalSave');
  await page.waitForTimeout(100);

  const style = await page.evaluate(() => appState.series[0].style);
  expect(style.markerSize).toBe(15);

  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(800);
  const markerSize = await page.evaluate(() =>
    activePlotDiv().data[0].marker.size
  );
  expect(markerSize).toBe(15);
});

test('editing a series preserves its color and enabled state', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_sl_edit.csv');
  await addSeries(page, 'scatter', 'keepme');

  const colorBefore = await page.evaluate(() => appState.series[0].style.color);
  expect(colorBefore).toBeTruthy();

  // Toggle off, then edit — both must survive the edit round-trip
  await page.locator('.series-item .series-ena').first().uncheck();
  await page.locator('.series-item .series-edit').first().click();
  await page.fill('#mSeriesName', 'renamed');
  await page.click('#modalSave');
  await page.waitForTimeout(100);

  const after = await page.evaluate(() => ({
    color:   appState.series[0].style.color,
    enabled: appState.series[0].enabled,
    name:    appState.series[0].name,
  }));
  expect(after.color).toBe(colorBefore);
  expect(after.enabled).toBe(false);
  expect(after.name).toBe('renamed');
});
