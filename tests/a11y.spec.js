// a11y.spec.js — Phase 4 full ARIA audit (axe-core)
//
// Scans the app in its main interactive states: empty, with data and a
// rendered plot, series modal open, help dialog open. The GA exit
// criterion is "No ARIA violations" — any violation fails the suite.
//
// Note (Accessibility Specialist): automated scanning covers the checklist
// items machine-detectably; actual screen reader behavior testing
// (VoiceOver on macOS, NVDA on Windows) is a manual session — see
// PLANNING.md Phase 4 notes.

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
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

async function audit(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  if (results.violations.length) {
    console.log(`\n[${label}] violations:`);
    for (const v of results.violations) {
      console.log(`  ${v.id} (${v.impact}): ${v.help}`);
      v.nodes.slice(0, 3).forEach(n => console.log(`    → ${n.target.join(' ')}`));
    }
  }
  return results.violations;
}

test('axe: empty state has no violations', async ({ page }) => {
  await page.goto(FILE_URL);
  expect(await audit(page, 'empty')).toHaveLength(0);
});

test('axe: loaded data + rendered plot has no violations', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,site\n1,2,a\n3,4,b\n5,6,a', '_a11y.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.click('#modalSave');
  // Put every badge type in the series list so all badge colors are scanned
  await page.evaluate(() => {
    ['line', 'parity', 'contour', 'histogram', 'boxplot'].forEach((t, i) => {
      appState.series.push({ id: 'a11y' + i, name: t + ' badge', datasetId: appState.datasets[0].id,
        chartType: t, xCol: 'x', yCol: 'y', filters: [], style: {}, enabled: false });
    });
    renderSeriesList();
  });
  await page.click('#renderBtn');
  await page.waitForTimeout(1000);
  // Plotly's generated SVG internals are third-party output — exclude the
  // plot canvas itself, audit everything we author around it
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.panel-plot')
    .analyze();
  if (results.violations.length) {
    results.violations.forEach(v => console.log(`${v.id}: ${v.help} — ${v.nodes[0]?.target}`));
  }
  expect(results.violations).toHaveLength(0);
});

test('axe: series modal open has no violations', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_a11y2.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="parity"]');
  await page.waitForTimeout(200);
  expect(await audit(page, 'modal')).toHaveLength(0);
});

test('axe: help dialog open has no violations', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.click('#helpBtn');
  await page.waitForTimeout(200);
  expect(await audit(page, 'help')).toHaveLength(0);
});

test('axe: data tools modal open has no violations', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'a,b,site\n1,2,x\n3,4,y\n5,6,x', '_a11y3.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);
  expect(await audit(page, 'data-tools')).toHaveLength(0);
});

test('axe: preset category picker open has no violations', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.evaluate(() => {
    document.getElementById('presetSaveBtn').closest('details').open = true;
  });
  await page.click('#presetSaveBtn');
  await page.waitForTimeout(200);
  expect(await audit(page, 'preset-picker')).toHaveLength(0);
});
