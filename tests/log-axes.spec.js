// log-axes.spec.js — per-plot log scale toggles (Phase 9)
//
// DS rulings under test: non-positive values warn (Plotly drops them
// silently); histogram ignores Log X with a warning; parity requires
// log-log + all-positive or falls back to linear; manual ranges are
// entered in data units and converted to log10 internally.

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

async function addSeries(page, ct, x, y, name) {
  await page.click('#addSeriesBtn');
  await page.click(`.ct-btn[data-ct="${ct}"]`);
  if (x) await page.selectOption('#mXCol', x);
  if (y) await page.selectOption('#mYCol', y);
  await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(120);
}

async function setLog(page, axis, on) {
  await page.evaluate(([axis, on]) => {
    const el = document.getElementById(axis + 'LogChk');
    el.checked = on;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [axis, on]);
}

test('log toggles drive axis type and round-trip through session state', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n10,20\n100,200', '_log_basic.csv');
  await addSeries(page, 'scatter', 'x', 'y', 's');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);

  await setLog(page, 'x', true);
  await setLog(page, 'y', true);
  await page.waitForTimeout(700);

  const types = await page.evaluate(() => ({
    x: activePlotDiv()._fullLayout.xaxis.type,
    y: activePlotDiv()._fullLayout.yaxis.type,
    cfgX: activePlot().plotConfig.xLog,
  }));
  expect(types.x).toBe('log');
  expect(types.y).toBe('log');
  expect(types.cfgX).toBe(true);

  // Round-trip: export state, reload, re-import — flags survive
  const exported = await page.evaluate(() =>
    JSON.stringify({ _schema: 'datalab-session', app: VERSION, state: appState }));
  await page.goto(FILE_URL);
  await page.evaluate(p => applySessionState(migrateSessionState(JSON.parse(p).state)), exported);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    cfg: activePlot().plotConfig.xLog && activePlot().plotConfig.yLog,
    type: activePlotDiv()._fullLayout.xaxis.type,
    chk: document.getElementById('xLogChk').checked,
  }));
  expect(after.cfg).toBe(true);
  expect(after.type).toBe('log');
  expect(after.chk).toBe(true);
});

test('non-positive values on a log axis produce a warning with the count', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n-5,2\n0,4\n10,6', '_log_nonpos.csv');
  await addSeries(page, 'scatter', 'x', 'y', 's');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);
  await setLog(page, 'x', true);
  await page.waitForTimeout(700);

  const warn = await page.locator('.panel-errors .render-warning').textContent();
  expect(warn).toContain('Log X');
  expect(warn).toContain('2 non-positive');
});

test('histogram honors Log X with log-space bins; Log Y applies', async ({ page }) => {
  // Phase 13 completed the Phase 9 deferral (§3 documented-deferral
  // carve-out): this test previously asserted the warn-and-ignore behavior
  await page.goto(FILE_URL);
  await loadCSV(page, 'v\n1\n2\n2\n3\n3\n3\n8\n9', '_log_hist.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="histogram"]');
  await page.selectOption('#mXCol', 'v');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);
  await setLog(page, 'x', true);
  await setLog(page, 'y', true);
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => ({
    xType: activePlotDiv()._fullLayout.xaxis.type,
    yType: activePlotDiv()._fullLayout.yaxis.type,
    xbins: activePlotDiv().data[0].xbins,
    warn: document.querySelector('.panel-errors')?.textContent ?? '',
  }));
  expect(out.xType).toBe('log');             // honored (Phase 13)
  expect(out.yType).toBe('log');
  // log10 units: data 1..9 → bins start at log10(1) = 0, end ≈ log10(9)
  expect(out.xbins.start).toBeCloseTo(0, 6);
  expect(out.xbins.size).toBeLessThan(1);
  expect(out.warn).not.toContain('ignored'); // old warning retired
});

test('parity falls back to linear unless log-log with positive data', async ({ page }) => {
  await page.goto(FILE_URL);
  const mk = (page, rows) => rows;
  await loadCSV(page, 'k,obs\n1,10\n2,100\n3,1000', '_log_parA.csv');
  await loadCSV(page, 'k,mod\n1,12\n2,90\n3,1100', '_log_parB.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="parity"]');
  await page.selectOption('#mJoinDataset', { index: 0 });
  await page.selectOption('#mJoinKey', 'k');
  await page.selectOption('#mXCol', 'obs');
  await page.selectOption('#mYCol', 'mod');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);

  // X only → linear fallback + warning
  await setLog(page, 'x', true);
  await page.waitForTimeout(700);
  let out = await page.evaluate(() => ({
    xType: activePlotDiv()._fullLayout.xaxis.type,
    warn: document.querySelector('.panel-errors')?.textContent ?? '',
  }));
  expect(out.xType).not.toBe('log');
  expect(out.warn).toContain('BOTH Log X and Log Y');

  // Log-log with positive data → log axes; the REQUESTED ranges are equal
  // (the displayed _fullLayout ranges differ by panel aspect — scaleanchor
  // expands one axis to keep equal SCALE, which is the parity guarantee)
  await setLog(page, 'y', true);
  await page.waitForTimeout(700);
  out = await page.evaluate(() => ({
    xType:  activePlotDiv()._fullLayout.xaxis.type,
    anchor: activePlotDiv()._fullLayout.yaxis.scaleanchor,
    xR:     activePlotDiv()._fullLayout.xaxis.range,
    yR:     activePlotDiv()._fullLayout.yaxis.range,
  }));
  expect(out.xType).toBe('log');
  // Equal SCALE is enforced via scaleanchor; the unconstrained axis expands
  // to fit the panel aspect, so its range is a superset of the constrained one
  expect(out.anchor).toBe('x');
  expect(out.xR[0]).toBeLessThanOrEqual(out.yR[0] + 1e-6);
  expect(out.xR[1]).toBeGreaterThanOrEqual(out.yR[1] - 1e-6);
  // Constrained axis carries the log10 padded data extent: [1, log10(1100)] ± 5%
  expect(out.yR[0]).toBeCloseTo(1 - (Math.log10(1100) - 1) * 0.05, 6);
  expect(out.yR[1]).toBeCloseTo(Math.log10(1100) + (Math.log10(1100) - 1) * 0.05, 6);
});

test('manual ranges on a log axis are converted from data units to log10', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n10,20\n100,200', '_log_rng.csv');
  await addSeries(page, 'scatter', 'x', 'y', 's');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);
  await setLog(page, 'x', true);
  await page.evaluate(() => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('xMin', '1'); set('xMax', '1000');
  });
  await page.waitForTimeout(700);

  const range = await page.evaluate(() => activePlotDiv()._fullLayout.xaxis.range);
  expect(range[0]).toBeCloseTo(0, 6); // log10(1)
  expect(range[1]).toBeCloseTo(3, 6); // log10(1000)
});
