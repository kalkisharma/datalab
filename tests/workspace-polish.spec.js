// workspace-polish.spec.js — Phase 16 workspace items: style-preset buttons
// lifted out of the Style accordion, and the screen-reader dataset-load
// announcement (closes the Phase 15 NVDA finding).

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

test('preset buttons live in their own section, not inside the Style accordion', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const summaries = [...document.querySelectorAll('details.section > summary')]
      .map(s => s.textContent.trim());
    // The details whose summary is exactly "Style"
    const styleDetails = [...document.querySelectorAll('details.section')]
      .find(d => d.querySelector('summary')?.textContent.trim() === 'Style');
    const save = document.getElementById('presetSaveBtn');
    return {
      hasPresetSection: summaries.includes('Style presets'),
      saveInsideStyle: !!(styleDetails && styleDetails.contains(save)),
      saveExists: !!save,
    };
  });
  expect(out.saveExists).toBe(true);
  expect(out.hasPresetSection).toBe(true);   // dedicated top-level section
  expect(out.saveInsideStyle).toBe(false);   // no longer buried under Style
});

test('loading a dataset announces it to screen readers', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'a,b,c\n1,2,3\n4,5,6', 'sensors.csv');
  const status = await page.textContent('#loadStatus');
  expect(status).toBe('Loaded sensors: 2 rows, 3 columns');

  // Reload the same name → "Reloaded" with the new shape
  await loadCSV(page, 'a,b,c,d\n1,2,3,4\n5,6,7,8\n9,10,11,12', 'sensors.csv');
  const reloaded = await page.textContent('#loadStatus');
  expect(reloaded).toBe('Reloaded sensors: 3 rows, 4 columns');
});

test('the load-status region is visually hidden but a live region', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const el = document.getElementById('loadStatus');
    return { live: el.getAttribute('aria-live'), srOnly: el.classList.contains('sr-only') };
  });
  expect(out.live).toBe('polite');
  expect(out.srOnly).toBe(true);
});
