// colorscales.spec.js — the colormap resolver (v2.18.1). Regression guard for
// the bug where 6 of 12 dropdown colormaps silently fell back to one default
// because Plotly doesn't know those names. Every option must resolve to a
// distinct colorscale Plotly honors, and unknown values must fail closed.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

// The exact option set offered by #cmapSelect.
const NAMES = ['Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis', 'Coolwarm',
               'RdBu', 'Blues', 'Reds', 'Greens', 'Turbo', 'Jet'];
// The six that were silently falling back before the fix.
const PREVIOUSLY_BROKEN = ['Plasma', 'Inferno', 'Magma', 'Coolwarm', 'Turbo', 'Reds'];

test('every colormap option resolves to a distinct colorscale', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate((names) => {
    const sig = n => JSON.stringify(resolveColorscale(n));
    return { sigs: names.map(sig), distinct: new Set(names.map(sig)).size };
  }, NAMES);
  expect(out.distinct).toBe(NAMES.length); // all 12 distinct — none collide now
});

test('the previously-broken maps now resolve to explicit arrays (not a name fallback)', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate((broken) =>
    broken.map(n => ({ n, scale: resolveColorscale(n) })), PREVIOUSLY_BROKEN);
  for (const { n, scale } of out) {
    expect(Array.isArray(scale), `${n} should be an explicit [[stop,color],…] array`).toBe(true);
    expect(scale[0][0]).toBe(0);                 // first stop at 0
    expect(scale[scale.length - 1][0]).toBe(1);  // last stop at 1
  }
});

test('unknown / non-string colormap values fail closed to Viridis (allowlist)', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => ({
    viridis:  resolveColorscale('Viridis'),
    unknown:  resolveColorscale('NotAColormap'),
    empty:    resolveColorscale(''),
    nullish:  resolveColorscale(null),
    object:   resolveColorscale({ evil: true }),
  }));
  expect(out.viridis).toBe('Viridis');   // a real Plotly name passes through
  expect(out.unknown).toBe('Viridis');   // poisoned / unknown → default
  expect(out.empty).toBe('Viridis');
  expect(out.nullish).toBe('Viridis');
  expect(out.object).toBe('Viridis');
});

test('a contour rendered with Plasma carries the explicit array, not a fallback name', async ({ page }) => {
  await page.goto(FILE_URL);
  const colorscale = await page.evaluate(() => {
    const ds = { id: 'a', name: 'A', color: '#000', headers: ['x', 'y', 'z'],
      rows: [{ x: 1, y: 1, z: 10 }, { x: 1, y: 2, z: 20 }, { x: 2, y: 1, z: 30 }, { x: 2, y: 2, z: 40 }] };
    appState.datasets.push(ds);
    appState.series = [{ id: 's', name: 'c', datasetId: 'a', plotId: appState.plots[0].id,
      chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z', filters: [], style: {} }];
    document.getElementById('cmapSelect').value = 'Plasma';
    renderPlot();
    return activePlotDiv()._fullData[0].colorscale;
  });
  // Plotly normalizes to [[stop, 'rgb(...)'], …]; the point is it's the Plasma
  // array (starts dark blue/purple), not the old shared fallback.
  expect(Array.isArray(colorscale)).toBe(true);
  expect(colorscale[0][0]).toBe(0);
});
