// stabilization-a.spec.js — Stabilization A (correctness & honesty):
// same-dataset parity, line color-by (per-category lines), and the small
// export/legend fixes. Renderer-level tests via buildXTrace, mirroring the
// existing renderer specs.

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

// ── Parity: same-dataset (no join) ──────────────────────────────────────────
test('parity compares two columns of one dataset with no join', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'obs,pred\n1,1.1\n2,1.9\n3,3.2\n4,3.8', '_pa_same.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildParityTrace({ id: 'p', name: 'P', datasetId: ds.id,
      chartType: 'parity', xCol: 'obs', yCol: 'pred' }, appState.datasets);
    const m = r.traces.find(t => t.mode === 'markers');
    return { error: r.error, n: r.n, hasStats: !!r.stats && isFinite(r.stats.nse),
             x: m && m.x, y: m && m.y };
  });
  expect(out.error).toBeNull();          // no "join dataset not found"
  expect(out.n).toBe(4);
  expect(out.hasStats).toBe(true);       // NSE/MAE/RMSE computed
  expect(out.x).toEqual([1, 2, 3, 4]);   // X = observed column
  expect(out.y).toEqual([1.1, 1.9, 3.2, 3.8]); // Y = modelled column, same rows
});
