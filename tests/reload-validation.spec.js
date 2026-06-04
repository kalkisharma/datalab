// reload-validation.spec.js — Phase 2: dataset reload column validation
// and series list keyboard navigation

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
  if (name) await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(100);
}

test('reloading a CSV with the same name replaces data in place', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_rv_same.csv');
  const before = await page.evaluate(() => ({
    count: appState.datasets.length,
    id:    appState.datasets[0].id,
    rows:  appState.datasets[0].rows.length,
  }));
  expect(before.count).toBe(1);
  expect(before.rows).toBe(2);

  await loadCSV(page, 'x,y\n1,2\n3,4\n5,6\n7,8', '_rv_same.csv');
  const after = await page.evaluate(() => ({
    count: appState.datasets.length,
    id:    appState.datasets[0].id,
    rows:  appState.datasets[0].rows.length,
  }));
  expect(after.count).toBe(1);        // replaced, not duplicated
  expect(after.id).toBe(before.id);   // identity preserved — series refs stay valid
  expect(after.rows).toBe(4);

  // Success alert shown
  await expect(page.locator('#dataAlerts .alert.success')).toBeVisible();
});

test('reload with missing columns warns and produces a clear render error', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_rv_missing.csv');
  await addScatter(page, 'depends-on-xy');
  await page.click('#renderBtn');
  await page.waitForTimeout(600);

  // Reload same filename with different columns — series now references
  // columns that no longer exist
  await loadCSV(page, 'a,b\n1,2\n3,4', '_rv_missing.csv');

  // Warning alert in the datasets panel names the broken series
  const warn = page.locator('#dataAlerts .alert.warn');
  await expect(warn).toBeVisible();
  await expect(warn).toContainText('depends-on-xy');

  // Debounced re-render surfaces a clear render error, not an all-NaN plot
  await page.waitForTimeout(800);
  const err = page.locator('#renderErrors .render-error');
  await expect(err).toBeVisible();
  await expect(err).toContainText('missing');
});

test('series list keyboard nav: arrows move focus, Delete removes', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_rv_kbd.csv');
  await addScatter(page, 'row-one');
  await addScatter(page, 'row-two');

  // Focus first row, ArrowDown moves to second (roving tabindex)
  await page.locator('.series-item').first().focus();
  await page.keyboard.press('ArrowDown');
  const focusedName = await page.evaluate(() =>
    document.activeElement.getAttribute('aria-label')
  );
  expect(focusedName).toContain('row-two');

  // Delete removes the focused series
  await page.keyboard.press('Delete');
  const names = await page.evaluate(() => appState.series.map(s => s.name));
  expect(names).toEqual(['row-one']);
});
