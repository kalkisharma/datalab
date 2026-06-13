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
    const save = document.getElementById('presetSaveBtn');
    // The collapsible Style section
    const styleDetails = [...document.querySelectorAll('details.section')]
      .find(d => d.querySelector('summary')?.textContent.trim() === 'Style');
    const titles = [...document.querySelectorAll('.section-title')].map(t => t.textContent.trim());
    return {
      saveExists: !!save,
      inAnyDetails: !!save.closest('details'),      // should be false — always visible
      insideStyle: !!(styleDetails && styleDetails.contains(save)),
      hasPresetTitle: titles.includes('Style presets'),
    };
  });
  expect(out.saveExists).toBe(true);
  expect(out.hasPresetTitle).toBe(true);   // labeled section
  expect(out.inAnyDetails).toBe(false);    // always-visible, not behind a disclosure
  expect(out.insideStyle).toBe(false);     // and not buried under Style
});

test('adding a series auto-renders — no Render button needed', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_autorender.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.click('#modalSave'); // no Render click — auto-render should fire
  await page.waitForTimeout(600);  // cover the debounce
  const out = await page.evaluate(() => ({
    rendered: appState.plotRendered,
    hasTrace: (activePlotDiv()?.data || []).length > 0,
    noButton: document.getElementById('renderBtn') === null,
  }));
  expect(out.noButton).toBe(true);   // the button is gone
  expect(out.rendered).toBe(true);   // plot rendered without it
  expect(out.hasTrace).toBe(true);
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
