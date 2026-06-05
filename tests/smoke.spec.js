// smoke.spec.js — smoke render test (runs on every PR)
//
// Verifies:
//   1. App loads without JS errors
//   2. CSP meta tag is present with approved policy
//   3. Core DOM elements exist
//   4. A CSV can be loaded and a scatter series rendered (Phase 1+)

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

// Single source of truth for the approved policy (STANDARDS §17) — was
// duplicated here and in xss.spec.js until the Phase 11 doc review
const { APPROVED_CSP } = require('./approved-csp');

// ── CSP (always active) ───────────────────────────────────────────────────

test('CSP meta tag matches approved policy', async ({ page }) => {
  await page.goto(FILE_URL);
  const csp = await page.$eval(
    'meta[http-equiv="Content-Security-Policy"]',
    el => el.getAttribute('content').replace(/\s+/g, ' ').trim()
  );
  expect(csp).toBe(APPROVED_CSP);
});

// ── DOM structure ─────────────────────────────────────────────────────────

test('core DOM elements are present', async ({ page }) => {
  await page.goto(FILE_URL);
  await expect(page.locator('#dropzone')).toBeVisible();
  await expect(page.locator('#addSeriesBtn')).toBeVisible();
  await expect(page.locator('#renderBtn')).toBeVisible();
  await expect(page.locator('#emptyState')).toBeVisible();
});

test('no JS errors on load', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE_URL);
  await page.waitForTimeout(500);
  expect(errors).toHaveLength(0);
});

// ── Scatter render (Phase 1+) ─────────────────────────────────────────────

test('load CSV, add scatter series, render produces SVG', async ({ page }) => {
  await page.goto(FILE_URL);

  // Create a minimal CSV in memory and drop it onto the dropzone
  const csvContent = 'x,y\n1,2\n3,4\n5,6\n7,8\n9,10';
  const csvPath    = path.join(__dirname, 'data', '_smoke_test.csv');
  fs.writeFileSync(csvPath, csvContent);

  try {
    // Load CSV via file input
    await page.setInputFiles('#fileInput', csvPath);
    await page.waitForTimeout(300);

    // Dataset should appear
    await expect(page.locator('.dataset-chip')).toBeVisible();

    // Open add series modal
    await page.click('#addSeriesBtn');
    await expect(page.locator('#modalOverlay')).not.toHaveClass(/hidden/);

    // Select chart type: scatter
    await page.click('.ct-btn[data-ct="scatter"]');

    // Dynamic fields should appear — select X and Y columns
    await page.selectOption('#mXCol', 'x');
    await page.selectOption('#mYCol', 'y');

    // Save the series
    await page.click('#modalSave');
    await expect(page.locator('#modalOverlay')).toHaveClass(/hidden/);

    // Render
    await page.click('#renderBtn');
    await page.waitForTimeout(1000);

    // Plotly should have produced an SVG inside plotDiv
    const svgCount = await page.locator('.panel-plot svg').count();
    expect(svgCount).toBeGreaterThan(0);

    // Plot background defaults to white; foreground adapts to luminance
    const layout = await page.evaluate(() => {
      const fl = activePlotDiv()._fullLayout;
      return { paper: fl.paper_bgcolor, plot: fl.plot_bgcolor, font: fl.font.color };
    });
    expect(layout.paper).toBe('#ffffff');
    expect(layout.plot).toBe('#ffffff');
    expect(layout.font).toBe('#333333'); // dark text on light background

    // Switching to a dark background flips the foreground palette
    await page.evaluate(() => {
      document.getElementById('plotBg').value = '#13131a';
      renderPlot();
    });
    await page.waitForTimeout(400);
    const dark = await page.evaluate(() => {
      const fl = activePlotDiv()._fullLayout;
      return { paper: fl.paper_bgcolor, font: fl.font.color };
    });
    expect(dark.paper).toBe('#13131a');
    expect(dark.font).toBe('#e2e2ec'); // light text on dark background
  } finally {
    fs.unlinkSync(csvPath);
  }
});
