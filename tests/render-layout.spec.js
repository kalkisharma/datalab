// render-layout.spec.js — the FIRST render must size to its visible
// container, not a hidden-box fallback. Regression for the maintainer
// report: plotting into a still-`display:none` grid sized the plot tiny
// until an edit triggered a resize.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

test.use({ viewport: { width: 1280, height: 900 } }); // tall enough that the
// container height differs clearly from Plotly's 450px hidden-box fallback

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(300);
  fs.unlinkSync(csvPath);
}

test('on startup only the empty state shows — the plot grid stays hidden', async ({ page }) => {
  await page.goto(FILE_URL);
  await page.waitForTimeout(400); // after init() reconciles the grid
  const s = await page.evaluate(() => {
    const empty = document.getElementById('emptyState');
    const grid  = document.getElementById('plotGrid');
    return {
      emptyVisible: getComputedStyle(empty).display !== 'none',
      gridHidden:   getComputedStyle(grid).display === 'none',
      gridHasHiddenClass: grid.classList.contains('hidden'),
      // renderPlotGrid sets the cols class — it must NOT have removed `hidden`
      gridCols: grid.classList.contains('cols-1'),
    };
  });
  expect(s.emptyVisible).toBe(true);
  expect(s.gridHidden).toBe(true);          // no empty plot region below the message
  expect(s.gridHasHiddenClass).toBe(true);  // the cols-class pass preserved `hidden`
  expect(s.gridCols).toBe(true);
});

test('first render fills its container — no edit needed to size correctly', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4\n4,5', '_layout.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)           // the FIRST render — no edits after
  await page.waitForTimeout(600);

  const m = await page.evaluate(() => {
    const pd = activePlotDiv();
    return { laidOut: pd._fullLayout.height, container: pd.clientHeight };
  });
  // Autosize measured the visible container: drawn height tracks the box
  expect(m.container).toBeGreaterThan(300);
  expect(Math.abs(m.laidOut - m.container)).toBeLessThan(3);
  // And specifically NOT stuck at the 450px hidden-box fallback while the
  // container is taller (the bug's signature)
  expect(m.laidOut).not.toBe(450);
});
