// export.spec.js — Export all: one PNG per visible plot panel (Phase 8)

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

async function addScatter(page, name, yCol) {
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', yCol);
  await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(120);
}

test('export all downloads one numbered PNG per visible plot', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,9\n3,4,7\n5,6,5', '_exp_all.csv');
  await addScatter(page, 'first', 'y');     // plot 1
  await page.click('#addPlotBtn');          // plot 2 (active)
  await addScatter(page, 'second', 'z');
  await page.click('#renderBtn');
  await page.waitForTimeout(900);

  // Visible only when the grid has 2+ panels
  await expect(page.locator('#exportAllBtn')).toBeVisible();

  const downloads = [];
  page.on('download', d => downloads.push(d.suggestedFilename()));
  await page.click('#exportAllBtn');
  // Two sequential downloads at the export size
  await expect.poll(() => downloads.length, { timeout: 15000 }).toBe(2);

  expect(downloads[0]).toMatch(/^01_.+\.png$/);
  expect(downloads[1]).toMatch(/^02_.+\.png$/);
  expect(downloads[0]).not.toBe(downloads[1]);
  // Button restored after the run
  await expect(page.locator('#exportAllBtn')).toBeEnabled();
});

test('export all button hidden with a single plot', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_exp_one.csv');
  await addScatter(page, 'only', 'y');
  await page.click('#renderBtn');
  await page.waitForTimeout(700);

  await expect(page.locator('#downloadBtn')).toBeVisible();
  await expect(page.locator('#exportAllBtn')).toBeHidden();
});
