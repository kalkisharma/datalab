// completions.spec.js — heatmap, bubble sizes, dual-Y, notes, datetime
// casting, column reorder (Phase 14)

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

// ── Heatmap ───────────────────────────────────────────────────────────────

const HM_DS = {
  id: 'd1', name: 'hm', color: '#000000',
  headers: ['site', 'month', 'flow'],
  rows: [
    { site: 'a', month: 'jan', flow: 2 }, { site: 'a', month: 'jan', flow: 4 },
    { site: 'a', month: 'feb', flow: 6 }, { site: 'b', month: 'jan', flow: 10 },
  ],
};

test('heatmap: explicit aggregation, duplicate-combo error, named colorbar, gaps', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(ds => {
    const mk = extra => Object.assign({ id: 's1', name: 'H', chartType: 'heatmap',
      datasetId: 'd1', xCol: 'site', yCol: 'month', zCol: 'flow', filters: [], style: {} }, extra);
    return {
      none:  buildHeatmapTrace(mk({ agg: 'none' }),  [ds]),
      mean:  buildHeatmapTrace(mk({ agg: 'mean' }),  [ds]),
      count: buildHeatmapTrace(mk({ agg: 'count', zCol: null }), [ds]),
    };
  }, HM_DS);

  expect(out.none.error).toContain('repeats');                  // (a, jan) ×2
  expect(out.none.error).toContain('choose an aggregation');
  const t = out.mean.traces[0];
  expect(t.z).toEqual([[3, 10], [6, null]]);                    // mean(2,4)=3; gap for (b,feb)
  expect(t.colorbar.title.text).toBe('mean(flow)');             // §20: aggregation named
  expect(out.count.traces[0].z).toEqual([[2, 1], [1, null]]);
  expect(out.count.traces[0].colorbar.title.text).toBe('count');
});

// ── Bubble sizes ──────────────────────────────────────────────────────────

test('bubble sizes are AREA-proportional: 0→4px, max→28px, mid→20px', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,pop\n1,2,0\n2,4,100\n3,6,50\n4,8,', '_cmp_bubble.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.selectOption('#mSizeCol', 'pop');
  await page.fill('#mSeriesName', 'bub');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const t = activePlotDiv().data[0];
    return { sizes: t.marker.size, name: t.name, custom: t.customdata };
  });
  // Area linear in value: d = √(16 + f·(784−16)) → f=0: 4, f=1: 28, f=0.5: 20
  expect(out.sizes[0]).toBeCloseTo(4, 10);
  expect(out.sizes[1]).toBeCloseTo(28, 10);
  expect(out.sizes[2]).toBeCloseTo(20, 10);
  expect(out.sizes[3]).toBeCloseTo(4, 10);    // missing → minimum
  expect(out.name).toContain('(size: pop)');  // semantics in the legend
  expect(out.custom[1]).toBe(100);            // hover shows the raw value
});

// ── Dual Y axis ───────────────────────────────────────────────────────────

test('right axis: y2 overlay, tinted titles, same-column warning, grid exclusion', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,flow,stage\n1,10,2.1\n2,40,2.9\n3,90,3.7', '_cmp_dualy.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="line"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'flow');
  await page.fill('#mSeriesName', 'left');
  await page.click('#modalSave');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="line"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'stage');
  await page.check('#mRightAxis');
  // Distinct series color — the tint must follow the SERIES color exactly
  await page.evaluate(() => { document.getElementById('mStyleColor').value = '#d55e00'; });
  await page.fill('#mSeriesName', 'right');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);

  let out = await page.evaluate(() => {
    const fl = activePlotDiv()._fullLayout;
    const right = activePlotDiv().data.find(t => t.name === 'right');
    return {
      y2side: fl.yaxis2?.side, y2over: fl.yaxis2?.overlaying,
      y2grid: fl.yaxis2?.showgrid, y2title: fl.yaxis2?.title.text,
      traceAxis: right.yaxis,
      leftTint: fl.yaxis.title.font.color, rightTint: fl.yaxis2?.title.font.color,
      warn: document.querySelector('.panel-errors')?.textContent ?? '',
    };
  });
  expect(out.y2side).toBe('right');
  expect(out.y2over).toBe('y');
  expect(out.y2grid).toBe(false);             // left grid stays authoritative
  expect(out.y2title).toBe('stage');
  expect(out.traceAxis).toBe('y2');
  expect(out.rightTint).toBe('#d55e00');        // DS coupling: tint = series color
  expect(out.leftTint).toBe('#0072b2');         // left follows its series too
  expect(out.warn).toBe('');                    // distinct columns — no warning

  // Same column on both axes → warning
  await page.evaluate(() => { appState.series[1].yCol = 'flow'; renderPlot(); });
  await page.waitForTimeout(500);
  out = await page.evaluate(() => ({
    warn: document.querySelector('.panel-errors')?.textContent ?? '' }));
  expect(out.warn).toContain('BOTH axes');

  // In a subplot grid the toggle is ignored with a warning
  await page.evaluate(() => {
    appState.series[1].yCol = 'stage';
    activePlot().grid = { rows: 1, cols: 2, shareX: false, shareY: false };
    renderPlot();
  });
  await page.waitForTimeout(500);
  out = await page.evaluate(() => ({
    warn: document.querySelector('.panel-errors')?.textContent ?? '',
    axis: activePlotDiv().data.find(t => t.name === 'right')?.yaxis,
  }));
  expect(out.warn).toContain('unavailable in subplot grids');
  expect(out.axis).not.toBe('y2');
});

// ── Notes ─────────────────────────────────────────────────────────────────

test('notes: add renders an annotation, text is escaped, round-trips, deletes', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n1,2\n3,4', '_cmp_notes.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.click('#modalSave');
  await page.evaluate(() => renderPlot()); // auto-render replaced the button (Phase 16)
  await page.waitForTimeout(700);

  const payload = '"><img src=x onerror="window.__xss=1">peak flow';
  await page.fill('#noteText', payload);
  await page.click('#noteAdd');
  await page.waitForTimeout(500);

  let out = await page.evaluate(() => ({
    xss: window.__xss === undefined,
    annots: activePlotDiv()._fullLayout.annotations?.length ?? 0,
    listed: document.querySelectorAll('#noteList .note-item').length,
    stored: activePlot().plotConfig.notes[0],
  }));
  expect(out.xss).toBe(true);          // escaped at the Plotly build site
  expect(out.annots).toBe(1);
  expect(out.listed).toBe(1);
  expect(out.stored.text).toContain('peak flow'); // raw in state per contract

  // Round-trip
  const exported = await page.evaluate(() =>
    JSON.stringify({ _schema: 'datalab-session', app: VERSION, state: appState }));
  await page.goto(FILE_URL);
  await page.evaluate(p => applySessionState(migrateSessionState(JSON.parse(p).state)), exported);
  await page.waitForTimeout(700);
  out = await page.evaluate(() => ({
    xss: window.__xss === undefined,
    notes: activePlot().plotConfig.notes.length,
    annots: activePlotDiv()._fullLayout.annotations?.length ?? 0,
  }));
  expect(out.xss).toBe(true);
  expect(out.notes).toBe(1);
  expect(out.annots).toBe(1);

  // Delete
  await page.click('.note-del');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() =>
    activePlotDiv()._fullLayout.annotations?.length ?? 0)).toBe(0);
});

// ── Datetime casting + column reorder ─────────────────────────────────────

test('cast to datetime rewrites ISO; reorder drives headers, pickers, export', async ({ page }) => {
  await page.goto(FILE_URL);
  // 13/01/2024 proves DD/MM — unambiguous, no prompt
  await loadCSV(page, 'when,v\n13/01/2024,1\n14/02/2024,2\nbad,3', '_cmp_cast.csv');
  await page.click('.dataset-tools');
  await page.waitForTimeout(300);

  await page.selectOption('#dtCol', 'when');
  await page.click('#dtCastDtBtn');
  await page.waitForTimeout(300);
  let out = await page.evaluate(() => ({
    vals: appState.datasets[0].rows.map(r => r.when),
    fmt: appState.datasets[0].dateFormats.when,
    msg: document.getElementById('dtMsg').textContent,
  }));
  expect(out.vals).toEqual(['2024-01-13', '2024-02-14', null]);
  expect(out.fmt).toBe('ISO');
  expect(out.msg).toContain('1 value(s) could not be parsed');

  // Reorder: move "when" right → headers flip; CSV export follows
  await page.selectOption('#dtCol', 'when');
  await page.click('#dtMoveR');
  await page.waitForTimeout(300);
  out = await page.evaluate(() => ({
    headers: appState.datasets[0].headers,
    selected: document.getElementById('dtCol').value,
    csv: Papa.unparse(appState.datasets[0].rows, { columns: appState.datasets[0].headers }).split('\n')[0].trim(), // Papa emits \r\n
  }));
  expect(out.headers).toEqual(['v', 'when']);
  expect(out.selected).toBe('when');   // moved column stays selected
  expect(out.csv).toBe('v,when');
});
