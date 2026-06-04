// multi-series.spec.js — Phase 2 exit criteria scenario
// (Data Scientist exploratory test, kept as a permanent regression test)
//
// 3 CSVs with realistic structure (noise, categories, NaN holes), 6 series
// including a cross-dataset parity, reorder, edit — full render verified.

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs   = require('fs');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

function sensorCSV(seed, rows) {
  // Deterministic pseudo-random so failures reproduce
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let out = 'sample_id,temperature,pressure,flow_rate,site\n';
  for (let i = 0; i < rows; i++) {
    const t = (20 + rnd() * 60).toFixed(2);
    // ~3% NaN holes in pressure — real sensor data has gaps
    const p = rnd() < 0.03 ? '' : (1 + rnd() * 4).toFixed(3);
    const f = (10 + rnd() * 90).toFixed(1);
    out += `S${String(i).padStart(4, '0')},${t},${p},${f},site_${i % 4}\n`;
  }
  return out;
}

async function loadCSV(page, content, filename) {
  const csvPath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(csvPath, content);
  await page.setInputFiles('#fileInput', csvPath);
  await page.waitForTimeout(400);
  fs.unlinkSync(csvPath);
}

async function addSeries(page, { type, x, y, name, joinDs, joinKey, dataset }) {
  await page.click('#addSeriesBtn');
  if (dataset) await page.selectOption('#mDataset', { label: dataset });
  await page.click(`.ct-btn[data-ct="${type}"]`);
  if (joinDs)  await page.selectOption('#mJoinDataset', { label: joinDs });
  if (joinKey) await page.selectOption('#mJoinKey', joinKey);
  await page.selectOption('#mXCol', x);
  await page.selectOption('#mYCol', y);
  await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(150);
}

test('exit criteria: 3 CSVs, 6 series, reorder, edit, render', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(FILE_URL);

  // 3 realistic CSVs — observed/modelled pair shares sample_id for parity
  await loadCSV(page, sensorCSV(1, 300), 'observed.csv');
  await loadCSV(page, sensorCSV(2, 300), 'modelled.csv');
  await loadCSV(page, sensorCSV(3, 200), 'validation.csv');
  expect(await page.evaluate(() => appState.datasets.length)).toBe(3);

  // 6 series across the datasets, including one cross-dataset parity
  await addSeries(page, { type: 'scatter', dataset: 'observed',   x: 'temperature', y: 'pressure',  name: 's1 temp-pres' });
  await addSeries(page, { type: 'scatter', dataset: 'observed',   x: 'temperature', y: 'flow_rate', name: 's2 temp-flow' });
  await addSeries(page, { type: 'line',    dataset: 'modelled',   x: 'temperature', y: 'pressure',  name: 's3 model line' });
  await addSeries(page, { type: 'scatter', dataset: 'modelled',   x: 'flow_rate',   y: 'pressure',  name: 's4 flow-pres' });
  await addSeries(page, { type: 'scatter', dataset: 'validation', x: 'temperature', y: 'flow_rate', name: 's5 validation' });
  await addSeries(page, { type: 'parity',  dataset: 'observed',   x: 'temperature', y: 'temperature',
                          name: 's6 parity', joinDs: 'modelled', joinKey: 'sample_id' });
  expect(await page.evaluate(() => appState.series.length)).toBe(6);

  // Render all 6 — parity contributes extra traces (y=x line, bands)
  await page.click('#renderBtn');
  await page.waitForTimeout(1500);
  const traceCount = await page.evaluate(() => activePlotDiv().data.length);
  expect(traceCount).toBeGreaterThanOrEqual(6);

  // No render errors — NaN holes must not break anything
  await expect(page.locator('.panel-errors .render-error')).toHaveCount(0);

  // Reorder: move s6 up; edit s2's name — both must survive a re-render
  await page.locator('.series-item').last().locator('.series-move[data-dir="-1"]').click();
  await page.waitForTimeout(600);
  const order = await page.evaluate(() => appState.series.map(s => s.name));
  expect(order[4]).toBe('s6 parity');

  await page.locator('.series-item').nth(1).locator('.series-edit').click();
  await page.fill('#mSeriesName', 's2 renamed');
  await page.click('#modalSave');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => appState.series[1].name)).toBe('s2 renamed');

  // Parity stats annotation exists and is mirrored for screen readers
  const sr = await page.locator('.plot-panel .sr-only').textContent();
  expect(sr).toContain('NSE');
});
