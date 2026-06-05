// preset.spec.js — style preset category picker and sectioned v2 schema
// (Phase 8; v1 flat back-compat covered in phase6.spec.js)

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

async function loadPresetJSON(page, obj, filename) {
  const p = path.join(__dirname, 'data', filename);
  fs.writeFileSync(p, JSON.stringify(obj));
  await page.setInputFiles('#presetFileInput', p);
  await page.waitForTimeout(300);
  fs.unlinkSync(p);
}

test('a v2 preset with only typography changes nothing else', async ({ page }) => {
  await page.goto(FILE_URL);
  const before = await page.evaluate(() => ({
    markerSize: document.getElementById('markerSize').value,
    figW:       document.getElementById('figW').value,
    frameAuto:  document.getElementById('frameAuto').checked,
  }));

  await loadPresetJSON(page, {
    _schema: 'datalab-style-preset-v2',
    typography: { fsTitle: '26', fsTick: '14' },
  }, '_preset_typo_only.json');

  const out = await page.evaluate(() => ({
    fsTitle:    document.getElementById('fsTitle').value,
    fsTick:     document.getElementById('fsTick').value,
    fsTitleVal: document.getElementById('fsTitleVal').textContent, // display synced
    markerSize: document.getElementById('markerSize').value,
    figW:       document.getElementById('figW').value,
    frameAuto:  document.getElementById('frameAuto').checked,
  }));
  expect(out.fsTitle).toBe('26');
  expect(out.fsTick).toBe('14');
  expect(out.fsTitleVal).toBe('26');
  expect(out.markerSize).toBe(before.markerSize);
  expect(out.figW).toBe(before.figW);
  expect(out.frameAuto).toBe(before.frameAuto);
});

test('malformed sections are ignored, valid ones still apply', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadPresetJSON(page, {
    _schema: 'datalab-style-preset-v2',
    style: ['not', 'an', 'object'],      // array — fails the shape check
    exportSize: { figW: '900' },
  }, '_preset_malformed.json');

  const out = await page.evaluate(() => ({
    figW:    document.getElementById('figW').value,
    figWNum: document.getElementById('figWNum').value, // twin synced
  }));
  expect(out.figW).toBe('900');
  expect(out.figWNum).toBe('900');
});

test('picker saves only the checked categories as a v2 file', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.evaluate(() => {
    document.getElementById('fsTitle').value = '30';
    // The button sits in the collapsed Style <details> section
    document.getElementById('presetSaveBtn').closest('details').open = true;
  });

  await page.click('#presetSaveBtn');
  await expect(page.locator('#presetOverlay')).not.toHaveClass(/hidden/);
  // Focus lands on the first category checkbox (ARIA checklist 3)
  expect(await page.evaluate(() => document.activeElement.id)).toBe('pcStyle');

  // Keep only Plot typography
  await page.uncheck('#pcStyle');
  await page.uncheck('#pcExportSize');
  await page.uncheck('#pcFrame');

  // Capture the saved blob in-page — Chromium's blob-download artifact is
  // file-locked on Windows, so reading the download from disk is flaky
  await page.evaluate(() => {
    const orig = URL.createObjectURL.bind(URL);
    window.__savedPreset = null;
    URL.createObjectURL = blob => {
      blob.text().then(t => { window.__savedPreset = t; });
      return orig(blob);
    };
  });
  await page.click('#presetSave');
  await page.waitForFunction(() => window.__savedPreset !== null);
  const saved = JSON.parse(await page.evaluate(() => window.__savedPreset));

  expect(saved._schema).toBe('datalab-style-preset-v2');
  expect(saved.typography.fsTitle).toBe('30');
  expect(saved.style).toBeUndefined();
  expect(saved.exportSize).toBeUndefined();
  expect(saved.frame).toBeUndefined();
  // Dialog closed after save
  await expect(page.locator('#presetOverlay')).toHaveClass(/hidden/);
});

test('save is disabled with zero categories; Escape cancels and restores focus', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.evaluate(() => {
    document.getElementById('presetSaveBtn').closest('details').open = true;
  });
  await page.click('#presetSaveBtn');
  await page.uncheck('#pcStyle');
  await page.uncheck('#pcExportSize');
  await page.uncheck('#pcTypography');
  await page.uncheck('#pcFrame');
  await expect(page.locator('#presetSave')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(page.locator('#presetOverlay')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => document.activeElement.id)).toBe('presetSaveBtn');
});
