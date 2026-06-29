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
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
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
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);

  await expect(page.locator('#downloadBtn')).toBeVisible();
  await expect(page.locator('#exportAllBtn')).toBeHidden();
});

// ── Faithful export + range persistence (v2.15.0) ──────────────────────────

// An interactive zoom/pan (plotly_relayout) must persist into the plot's stored
// range so a later re-render (e.g. toggling gridlines) keeps it — previously it
// lived only on the node and was reset, and the export then captured the reset.
test('interactive zoom persists into plotConfig and the Min/Max fields', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4\n5,6', '_exp_zoom.csv');
  await addScatter(page, 'only', 'y');
  await page.evaluate(() => renderPlot());
  await page.waitForTimeout(500);

  const out = await page.evaluate(() => {
    const pd = activePlotDiv();
    pd.emit('plotly_relayout', { 'xaxis.range[0]': 2, 'xaxis.range[1]': 4,
                                 'yaxis.range[0]': 1, 'yaxis.range[1]': 5 });
    const c = activePlot().plotConfig;
    return { c, xMin: document.getElementById('xMin').value, xMax: document.getElementById('xMax').value };
  });
  expect(out.c.xMin).toBe('2'); expect(out.c.xMax).toBe('4');
  expect(out.c.yMin).toBe('1'); expect(out.c.yMax).toBe('5');
  expect(out.xMin).toBe('2');   expect(out.xMax).toBe('4'); // mirrored into the panel inputs

  // A double-click reset (autorange) returns the stored range to auto
  const reset = await page.evaluate(() => {
    activePlotDiv().emit('plotly_relayout', { 'xaxis.autorange': true, 'yaxis.autorange': true });
    return activePlot().plotConfig;
  });
  expect(reset.xMin).toBe(''); expect(reset.xMax).toBe('');
  expect(reset.yMin).toBe(''); expect(reset.yMax).toBe('');
});

// The PNG export renders off-screen from a copy of the LIVE layout at a fixed
// size — so minor gridlines (and the current range) are in the exported image,
// the symptom that was previously dropped by the responsive clone-and-resize.
test('PNG export renders off-screen from a layout carrying minor gridlines', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4\n5,6', '_exp_minor.csv');
  await addScatter(page, 'only', 'y');
  await page.check('#minorGrid'); // change handler re-renders with minor.showgrid on
  await page.evaluate(() => renderPlot());
  await page.waitForTimeout(400);

  const captured = await page.evaluate(async () => {
    const orig = Plotly.newPlot;
    let cap = null;
    Plotly.newPlot = function (div, data, layout) { cap = JSON.parse(JSON.stringify(layout)); return orig.apply(this, arguments); };
    try { await downloadPlot('png'); } finally { Plotly.newPlot = orig; }
    return cap;
  });
  expect(captured).toBeTruthy();
  expect(captured.xaxis.minor.showgrid).toBe(true); // minor grid is in the exported layout
  expect(captured.autosize).toBe(false);            // fixed size — no responsive resize
  expect(captured.width).toBeGreaterThan(0);
  expect(captured.height).toBeGreaterThan(0);
});
