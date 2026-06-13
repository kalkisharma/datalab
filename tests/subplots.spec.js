// subplots.spec.js — subplot figures: cells, shared axes, parity exclusion,
// session round-trip, grid-shrink clamping (Phase 10)

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

async function setGrid(page, rows, cols, shareX = false, shareY = false) {
  await page.evaluate(([rows, cols, shareX, shareY]) => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el.type === 'checkbox') el.checked = v; else el.value = String(v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('gridShareX', shareX); set('gridShareY', shareY);
    set('gridRows', rows); set('gridCols', cols);
  }, [rows, cols, shareX, shareY]);
  await page.waitForTimeout(200);
}

async function addSeries(page, ct, fields, name, cell) {
  await page.click('#addSeriesBtn');
  await page.click(`.ct-btn[data-ct="${ct}"]`);
  for (const [sel, val] of Object.entries(fields)) await page.selectOption(sel, val);
  if (cell) await page.selectOption('#mCell', cell);
  await page.fill('#mSeriesName', name);
  await page.click('#modalSave');
  await page.waitForTimeout(120);
}

test('2×2 grid assigns traces to cell axes with per-cell auto labels', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,9\n3,4,7\n5,6,5', '_sub_basic.csv');
  await setGrid(page, 2, 2);
  await addSeries(page, 'scatter', { '#mXCol': 'x', '#mYCol': 'y' }, 'cell11', '1,1');
  await addSeries(page, 'line',    { '#mXCol': 'x', '#mYCol': 'z' }, 'cell22', '2,2');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => {
    const pd = activePlotDiv();
    const t = name => pd.data.find(d => d.name === name);
    return {
      gridCfg: pd._fullLayout.grid && { rows: pd._fullLayout.grid.rows, cols: pd._fullLayout.grid.columns },
      ax11: [t('cell11').xaxis, t('cell11').yaxis],
      ax22: [t('cell22').xaxis, t('cell22').yaxis],
      yTitle11: pd._fullLayout.yaxis.title.text,
      yTitle22: pd._fullLayout.yaxis4.title.text,
      // cloned cell axes keep the styled frame
      mirrored: pd._fullLayout.xaxis4.mirror,
      panels: document.querySelectorAll('.plot-panel').length,
    };
  });
  expect(out.gridCfg).toEqual({ rows: 2, cols: 2 });
  expect(out.ax11).toEqual(['x', 'y']);           // cell 1·1 = base axes
  expect(out.ax22).toEqual(['x4', 'y4']);         // cell 2·2 = 4th axis pair
  expect(out.yTitle11).toBe('y');                 // per-cell auto labels
  expect(out.yTitle22).toBe('z');
  expect(out.mirrored).toBe(true);                // styling cloned to cell axes
  expect(out.panels).toBe(1);                     // one figure, one panel
});

test('shareX wires matches across non-parity cells; round-trips via session', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,9\n3,4,7\n5,6,5', '_sub_share.csv');
  await setGrid(page, 1, 2, true, false);
  await addSeries(page, 'scatter', { '#mXCol': 'x', '#mYCol': 'y' }, 'a', '1,1');
  await addSeries(page, 'scatter', { '#mXCol': 'x', '#mYCol': 'z' }, 'b', '1,2');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  let out = await page.evaluate(() => ({
    matches: activePlotDiv()._fullLayout.xaxis2.matches,
    grid: activePlot().grid,
  }));
  expect(out.matches).toBe('x');
  expect(out.grid).toEqual({ rows: 1, cols: 2, shareX: true, shareY: false });

  // Session round-trip preserves grid + cells and re-renders the figure
  const exported = await page.evaluate(() =>
    JSON.stringify({ _schema: 'datalab-session', app: VERSION, state: appState }));
  await page.goto(FILE_URL);
  await page.evaluate(p => applySessionState(migrateSessionState(JSON.parse(p).state)), exported);
  await page.waitForTimeout(900);
  out = await page.evaluate(() => ({
    grid:  appState.plots[0].grid,
    cells: appState.series.map(s => s.cell),
    ax2:   activePlotDiv().data.find(d => d.name === 'b')?.xaxis,
    rowsSel: document.getElementById('gridCols').value, // controls re-synced
  }));
  expect(out.grid).toEqual({ rows: 1, cols: 2, shareX: true, shareY: false });
  expect(out.cells).toEqual([{ row: 1, col: 1 }, { row: 1, col: 2 }]);
  expect(out.ax2).toBe('x2');
  expect(out.rowsSel).toBe('2');
});

test('parity cell is excluded from sharing with a warning; keeps equal axes', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'k,obs,extra\n1,10,5\n2,20,6\n3,30,7', '_sub_parA.csv');
  await loadCSV(page, 'k,mod\n1,12\n2,18\n3,33', '_sub_parB.csv');
  await setGrid(page, 1, 2, true, false);

  // Cell 1·1: scatter; cell 1·2: parity
  await addSeries(page, 'scatter', { '#mXCol': 'k', '#mYCol': 'obs' }, 'plain', '1,1');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="parity"]');
  await page.selectOption('#mJoinDataset', { index: 0 });
  await page.selectOption('#mJoinKey', 'k');
  await page.selectOption('#mXCol', 'obs');
  await page.selectOption('#mYCol', 'mod');
  await page.selectOption('#mCell', '1,2');
  await page.fill('#mSeriesName', 'par');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  const out = await page.evaluate(() => {
    const fl = activePlotDiv()._fullLayout;
    return {
      parityMatches: fl.xaxis2.matches ?? null,   // excluded from sharing
      parityAnchor:  fl.yaxis2.scaleanchor,       // equal axes anchored to ITS cell
      warn: document.querySelector('.panel-errors')?.textContent ?? '',
    };
  });
  expect(out.parityMatches).toBeNull();
  expect(out.parityAnchor).toBe('x2');
  expect(out.warn).toContain('excluded from axis sharing');
});

test('shrinking the grid clamps cells at render and restores on re-grow', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,z\n1,2,9\n3,4,7\n5,6,5', '_sub_clamp.csv');
  await setGrid(page, 2, 2);
  await addSeries(page, 'scatter', { '#mXCol': 'x', '#mYCol': 'y' }, 'a', '1,1');
  await addSeries(page, 'scatter', { '#mXCol': 'x', '#mYCol': 'z' }, 'b', '2,2');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(900);

  // Shrink to 1×1 — figure renders single-pair, no errors, stored cell kept
  await setGrid(page, 1, 1);
  await page.waitForTimeout(700);
  let out = await page.evaluate(() => ({
    grid: activePlot().grid,
    axB:  activePlotDiv().data.find(d => d.name === 'b')?.xaxis ?? null,
    cellB: appState.series[1].cell,
    errs: document.querySelectorAll('.panel-errors .render-error').length,
  }));
  expect(out.grid).toBeNull();
  expect(out.axB).toBeNull();                       // stale x4 ref cleared
  expect(out.cellB).toEqual({ row: 2, col: 2 });    // stored cell preserved
  expect(out.errs).toBe(0);

  // Re-grow — series returns to its cell
  await setGrid(page, 2, 2);
  await page.waitForTimeout(700);
  out = await page.evaluate(() => ({
    axB: activePlotDiv().data.find(d => d.name === 'b')?.xaxis,
  }));
  expect(out.axB).toBe('x4');
});
