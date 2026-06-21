// marker-shape.spec.js — per-series marker shape (style.symbol) for scatter,
// parity, and line. Renderer-level via buildXTrace; one shape per series,
// inherited across color-by categories; blank = default circle.

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

const dataTrace = r => r.traces.find(t => !/^__size_/.test(t.legendgroup || '') && t.marker);

test('scatter marker shape applies via style.symbol; blank defaults to circle', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n2,3\n3,4', '_ms_sc.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const sq = buildScatterTrace({ id: 's', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', style: { symbol: 'square' } }, appState.datasets);
    const def = buildScatterTrace({ id: 's', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y' }, appState.datasets);
    const mk = r => r.traces.find(t => t.marker).marker.symbol;
    return { square: mk(sq), deflt: mk(def) };
  });
  expect(out.square).toBe('square');
  expect(out.deflt).toBe('circle'); // unchanged default
});

test('parity inherits the marker shape (shared buildMarkerStyle)', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'obs,pred\n1,1.1\n2,1.9\n3,3.2', '_ms_pa.csv');
  const symbol = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildParityTrace({ id: 'p', name: 'P', datasetId: ds.id, chartType: 'parity',
      xCol: 'obs', yCol: 'pred', style: { symbol: 'diamond' } }, appState.datasets);
    return r.traces.find(t => t.mode === 'markers').marker.symbol;
  });
  expect(symbol).toBe('diamond');
});

test('line markers carry the shape on both the single and per-category paths', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,g\n1,2,A\n2,3,B\n3,4,A\n4,5,B', '_ms_ln.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const single = buildLineTrace({ id: 'l', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', style: { symbol: 'star' } }, appState.datasets);
    const grouped = buildLineTrace({ id: 'l', name: 'L', datasetId: ds.id, chartType: 'line',
      xCol: 'x', yCol: 'y', colorCol: 'g', style: { symbol: 'star' } }, appState.datasets);
    return {
      single: single.traces[0].marker.symbol,
      grouped: grouped.traces.map(t => t.marker.symbol),
    };
  });
  expect(out.single).toBe('star');
  expect(out.grouped).toEqual(['star', 'star']); // every per-category line shares the one shape
});

test('color-by categorical: one shape across all category traces, color varies', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,site\n1,2,A\n2,3,B\n3,4,A\n4,5,C', '_ms_cb.csv');
  const out = await page.evaluate(() => {
    const ds = appState.datasets[0];
    const r = buildScatterTrace({ id: 's', name: 'S', datasetId: ds.id, chartType: 'scatter',
      xCol: 'x', yCol: 'y', colorCol: 'site', style: { symbol: 'triangle-up' } }, appState.datasets);
    const cats = r.traces.filter(t => t.mode === 'markers');
    return { symbols: cats.map(t => t.marker.symbol), colors: cats.map(t => t.marker.color) };
  });
  expect(out.symbols.every(s => s === 'triangle-up')).toBe(true); // shape shared
  expect(new Set(out.colors).size).toBeGreaterThan(1);            // colors differ
});
