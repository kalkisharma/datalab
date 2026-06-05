// preview.spec.js — Data Tools paginated data preview (Phase 9)
//
// Pagination is the perf guarantee (≤ 50 DOM rows at any dataset size) and
// every cell is escHtml'd — the preview is the largest innerHTML surface
// in the app, so it gets its own injection test.

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

test('preview paginates at 50 rows with working Prev/Next and live counts', async ({ page }) => {
  await page.goto(FILE_URL);
  const rows = Array.from({ length: 120 }, (_, i) => `${i + 1},${(i + 1) * 2}`).join('\n');
  await loadCSV(page, 'a,b\n' + rows, '_prev_120.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);

  const state = () => page.evaluate(() => ({
    domRows: document.querySelectorAll('#dtPreview tbody tr').length,
    info:    document.querySelector('.dt-page-info').textContent,
    first:   document.querySelector('#dtPreview tbody tr td')?.textContent,
    prevDis: document.getElementById('dtPrevPage').disabled,
    nextDis: document.getElementById('dtNextPage').disabled,
  }));

  let s = await state();
  expect(s.domRows).toBe(50);            // never more than one page in the DOM
  expect(s.info).toBe('rows 1–50 of 120');
  expect(s.first).toBe('1');
  expect(s.prevDis).toBe(true);

  await page.click('#dtNextPage');
  s = await state();
  expect(s.info).toBe('rows 51–100 of 120');
  expect(s.first).toBe('51');
  expect(s.prevDis).toBe(false);

  await page.click('#dtNextPage');
  s = await state();
  expect(s.domRows).toBe(20);            // last partial page
  expect(s.info).toBe('rows 101–120 of 120');
  expect(s.nextDis).toBe(true);
});

test('preview cells are escaped — CSV payloads do not execute', async ({ page }) => {
  await page.goto(FILE_URL);
  const payload = '"><img src=x onerror="window.__xss=1">';
  // RFC 4180 quoting so the payload survives parsing as a VALUE
  const quoted = '"' + payload.replace(/"/g, '""') + '"';
  await loadCSV(page, `name,v\n${quoted},1\nok,2`, '_prev_xss.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);

  expect(await page.evaluate(() => window.__xss === undefined)).toBe(true);
  // The payload is DISPLAYED as text, proving it went through escaping
  const cell = await page.evaluate(() =>
    document.querySelector('#dtPreview tbody tr td').textContent);
  expect(cell).toContain('onerror');
});

test('preview refreshes after cleaning ops and excludes dropped columns', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'a,b\n1,2\n,4\n5,6', '_prev_clean.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);

  // Drop rows with missing "a" (row 2)
  await page.selectOption('#dtCol', 'a');
  await page.selectOption('#dtMissMode', 'drop');
  await page.click('#dtMissBtn');
  await page.waitForTimeout(200);
  let out = await page.evaluate(() => ({
    rows: document.querySelectorAll('#dtPreview tbody tr').length,
    info: document.querySelector('.dt-page-info').textContent,
  }));
  expect(out.rows).toBe(2);
  expect(out.info).toBe('rows 1–2 of 2');

  // Drop column "b" — header disappears from the preview
  await page.selectOption('#dtCol', 'b');
  await page.click('#dtDropBtn');
  await page.waitForTimeout(200);
  const headers = await page.evaluate(() =>
    [...document.querySelectorAll('#dtPreview thead th')].map(th => th.textContent));
  expect(headers).toEqual(['a']);
});
