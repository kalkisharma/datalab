// xss.spec.js — XSS injection tests
//
// Insertion points (5): series name, column name, filter value, plot title,
// axis labels. Rationale: all are user-controlled strings that reach the DOM
// via innerHTML — the highest-risk injection surface in the app.
//
// Payloads (2):
//   PAYLOAD_SCRIPT  — classic script injection
//   PAYLOAD_IMG     — attribute break-out + event handler
//
// Verification: window.__xss must remain undefined after injection.
// The CSP connect-src 'none' is a browser-level backstop, but these tests
// verify that escHtml() prevents execution at the DOM insertion point.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

const PAYLOAD_SCRIPT = '<script>window.__xss=1<\/script>';
const PAYLOAD_IMG    = '"><img src=x onerror="window.__xss=1">';

const APPROVED_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; worker-src blob:; object-src 'none'; " +
  "base-uri 'none'; form-action 'none';";

// ── Helpers ───────────────────────────────────────────────────────────────

async function loadApp(page) {
  await page.goto(FILE_URL);
}

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);
}

async function xssNotExecuted(page) {
  return await page.evaluate(() => window.__xss === undefined);
}

// ── CSP verification ──────────────────────────────────────────────────────

test('CSP meta tag is present with approved policy', async ({ page }) => {
  await loadApp(page);
  const csp = await page.$eval(
    'meta[http-equiv="Content-Security-Policy"]',
    el => el.getAttribute('content').replace(/\s+/g, ' ').trim()
  );
  expect(csp).toBe(APPROVED_CSP);
});

test('connect-src blocks outbound fetch', async ({ page }) => {
  await loadApp(page);
  const blocked = await page.evaluate(async () => {
    try { await fetch('https://example.com'); return false; }
    catch { return true; }
  });
  expect(blocked).toBe(true);
});

// ── Series name injection ─────────────────────────────────────────────────

for (const [label, payload] of [['PAYLOAD_SCRIPT', PAYLOAD_SCRIPT], ['PAYLOAD_IMG', PAYLOAD_IMG]]) {
  test(`series name: ${label} does not execute`, async ({ page }) => {
    await loadApp(page);
    await loadCSV(page, 'x,y\n1,2\n3,4', '_xss_series_name.csv');

    await page.click('#addSeriesBtn');
    await page.click('.ct-btn[data-ct="scatter"]');
    await page.selectOption('#mXCol', 'x');
    await page.selectOption('#mYCol', 'y');
    await page.fill('#mSeriesName', payload);
    await page.click('#modalSave');
    await page.waitForTimeout(200);

    expect(await xssNotExecuted(page)).toBe(true);
  });
}

// ── Column name injection ─────────────────────────────────────────────────

// CSV-encode a field: wrap in quotes, double internal quotes (RFC 4180)
function csvField(s) { return `"${s.replace(/"/g, '""')}"`; }

for (const [label, payload] of [['PAYLOAD_SCRIPT', PAYLOAD_SCRIPT], ['PAYLOAD_IMG', PAYLOAD_IMG]]) {
  test(`column name: ${label} does not execute`, async ({ page }) => {
    await loadApp(page);
    // CSV header contains the payload, properly CSV-quoted so the file parses
    await loadCSV(page, `${csvField(payload)},y\n1,2\n3,4`, '_xss_col_name.csv');
    await page.waitForTimeout(200);

    // Open modal — the payload column name should appear in a dropdown
    await page.click('#addSeriesBtn');
    await page.click('.ct-btn[data-ct="scatter"]');
    await page.waitForTimeout(200);

    expect(await xssNotExecuted(page)).toBe(true);
  });
}

// ── Filter value injection ────────────────────────────────────────────────

for (const [label, payload] of [['PAYLOAD_SCRIPT', PAYLOAD_SCRIPT], ['PAYLOAD_IMG', PAYLOAD_IMG]]) {
  test(`filter value: ${label} does not execute`, async ({ page }) => {
    await loadApp(page);
    await loadCSV(page, 'x,y\n1,2\n3,4', '_xss_filter.csv');

    await page.click('#addSeriesBtn');
    await page.click('.ct-btn[data-ct="scatter"]');
    await page.selectOption('#mXCol', 'x');
    await page.selectOption('#mYCol', 'y');
    await page.click('#mAddFilter');
    await page.waitForTimeout(100);
    // Fill the filter value field with the payload
    await page.fill('.filter-val', payload);
    await page.click('#modalSave');
    await page.waitForTimeout(200);

    expect(await xssNotExecuted(page)).toBe(true);
  });
}

// ── Plot title injection ──────────────────────────────────────────────────

for (const [label, payload] of [['PAYLOAD_SCRIPT', PAYLOAD_SCRIPT], ['PAYLOAD_IMG', PAYLOAD_IMG]]) {
  test(`plot title: ${label} does not execute`, async ({ page }) => {
    await loadApp(page);
    await loadCSV(page, 'x,y\n1,2\n3,4', '_xss_title.csv');

    await page.click('#addSeriesBtn');
    await page.click('.ct-btn[data-ct="scatter"]');
    await page.selectOption('#mXCol', 'x');
    await page.selectOption('#mYCol', 'y');
    await page.click('#modalSave');
    // Title is rendered by Plotly — not via innerHTML, but verify anyway
    await page.fill('#inputTitle', payload);
    await page.click('#renderBtn');
    await page.waitForTimeout(500);

    expect(await xssNotExecuted(page)).toBe(true);
  });
}

// ── Axis label injection ──────────────────────────────────────────────────

for (const [label, payload] of [['PAYLOAD_SCRIPT', PAYLOAD_SCRIPT], ['PAYLOAD_IMG', PAYLOAD_IMG]]) {
  test(`axis labels: ${label} does not execute`, async ({ page }) => {
    await loadApp(page);
    await loadCSV(page, 'x,y\n1,2\n3,4', '_xss_axis.csv');

    await page.click('#addSeriesBtn');
    await page.click('.ct-btn[data-ct="scatter"]');
    await page.selectOption('#mXCol', 'x');
    await page.selectOption('#mYCol', 'y');
    await page.click('#modalSave');
    await page.fill('#inputXLabel', payload);
    await page.fill('#inputYLabel', payload);
    await page.click('#renderBtn');
    await page.waitForTimeout(500);

    expect(await xssNotExecuted(page)).toBe(true);
  });
}
