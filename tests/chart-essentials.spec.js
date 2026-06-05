// chart-essentials.spec.js — bar charts, error bars, trendlines (Phase 9)
//
// Hand-derived references (per STANDARDS §20 — from the formulas, not code):
//
// linearFit on (0,1),(1,3),(2,4),(3,4):
//   mx = 1.5, my = 3
//   sxx = 2.25+0.25+0.25+2.25 = 5
//   sxy = (−1.5)(−2)+(−0.5)(0)+(0.5)(1)+(1.5)(1) = 5
//   syy = 4+0+1+1 = 6
//   a = 5/5 = 1, b = 3 − 1·1.5 = 1.5, R² = 25/(5·6) = 0.83333…
//
// bar mean ± SD for category "a" with values [2, 4, 6]:
//   mean = 4, SD (n−1) = √((4+0+4)/2) = 2, SEM = 2/√3 = 1.15470…

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

// ── linearFit reference values ────────────────────────────────────────────

test('linearFit matches hand-derived slope, intercept, R²', async ({ page }) => {
  await page.goto(FILE_URL);
  const fit = await page.evaluate(() => linearFit([0, 1, 2, 3], [1, 3, 4, 4]));
  expect(fit.a).toBeCloseTo(1, 10);
  expect(fit.b).toBeCloseTo(1.5, 10);
  expect(fit.r2).toBeCloseTo(25 / 30, 10);
  expect(fit.n).toBe(4);
  // Degenerate guards
  expect(await page.evaluate(() => linearFit([5, 5, 5], [1, 2, 3]))).toBeNull(); // no x variance
  expect(await page.evaluate(() => linearFit([1], [2]))).toBeNull();             // n < 2
});

// ── Bar renderer ──────────────────────────────────────────────────────────

const BAR_DS = {
  id: 'd1', name: 'bar-data', color: '#0072b2',
  headers: ['cat', 'val'],
  rows: [
    { cat: 'a', val: 2 }, { cat: 'a', val: 4 }, { cat: 'a', val: 6 },
    { cat: 'b', val: 10 },
  ],
};

function barSeries(extra) {
  return Object.assign({
    id: 's1', name: 'B', chartType: 'bar', datasetId: 'd1',
    xCol: 'cat', yCol: 'val', filters: [], style: {},
  }, extra);
}

test('bar with agg=none errors on duplicate categories, naming the fix', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(([ds, s]) => buildBarTrace(s, [ds]), [BAR_DS, barSeries({ agg: 'none' })]);
  expect(out.traces).toHaveLength(0);
  expect(out.error).toContain('repeats');
  expect(out.error).toContain('choose an aggregation');
});

test('bar aggregations compute mean/sum/count/median and label the trace', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(([ds, mk]) => ({
    mean:   buildBarTrace(Object.assign({}, mk, { agg: 'mean' }),   [ds]),
    sum:    buildBarTrace(Object.assign({}, mk, { agg: 'sum' }),    [ds]),
    count:  buildBarTrace(Object.assign({}, mk, { agg: 'count' }),  [ds]),
    median: buildBarTrace(Object.assign({}, mk, { agg: 'median' }), [ds]),
  }), [BAR_DS, barSeries({})]);

  expect(out.mean.traces[0].y).toEqual([4, 10]);       // mean(2,4,6)=4
  expect(out.sum.traces[0].y).toEqual([12, 10]);
  expect(out.count.traces[0].y).toEqual([3, 1]);
  expect(out.median.traces[0].y).toEqual([4, 10]);
  // §20: the aggregation is displayed, never silent
  expect(out.mean.traces[0].name).toContain('mean of val');
  expect(out.count.traces[0].name).toContain('count');
});

test('bar mean ± SD / SEM match hand-derived values and name the semantics', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(([ds, mk]) => ({
    sd:  buildBarTrace(Object.assign({}, mk, { agg: 'mean', errMode: 'sd' }),  [ds]),
    sem: buildBarTrace(Object.assign({}, mk, { agg: 'mean', errMode: 'sem' }), [ds]),
    bad: buildBarTrace(Object.assign({}, mk, { agg: 'sum',  errMode: 'sd' }),  [ds]),
  }), [BAR_DS, barSeries({})]);

  expect(out.sd.traces[0].error_y.array[0]).toBeCloseTo(2, 10);              // SD(2,4,6)
  expect(out.sem.traces[0].error_y.array[0]).toBeCloseTo(2 / Math.sqrt(3), 10);
  expect(out.sd.traces[0].name).toContain('mean ± SD of val');               // §20 semantics
  expect(out.sem.traces[0].name).toContain('mean ± SEM of val');
  expect(out.bad.error).toContain('mean aggregation');                       // SD without mean
});

// ── Error column on scatter/line ──────────────────────────────────────────

test('scatter/line error column attaches ± bars and labels the legend', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y,e\n1,2,0.5\n2,4,1\n3,6,1.5', '_ce_err.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.selectOption('#mErrCol', 'e');
  await page.fill('#mSeriesName', 'with-errors');
  await page.click('#modalSave');
  await page.click('#renderBtn');
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const t = activePlotDiv().data[0];
    return { err: t.error_y?.array, name: t.name };
  });
  expect(out.err).toEqual([0.5, 1, 1.5]);
  expect(out.name).toBe('with-errors (± e)'); // §20: semantics in the legend
});

// ── Trendline end-to-end ──────────────────────────────────────────────────

test('scatter trendline draws the fit with equation and R² in the legend + sr mirror', async ({ page }) => {
  await page.goto(FILE_URL);
  await loadCSV(page, 'x,y\n0,1\n1,3\n2,4\n3,4', '_ce_trend.csv');
  await page.click('#addSeriesBtn');
  await page.click('.ct-btn[data-ct="scatter"]');
  await page.selectOption('#mXCol', 'x');
  await page.selectOption('#mYCol', 'y');
  await page.check('#mTrend');
  await page.fill('#mSeriesName', 'fitme');
  await page.click('#modalSave');
  await page.click('#renderBtn');
  await page.waitForTimeout(700);

  const out = await page.evaluate(() => {
    const fit = activePlotDiv().data.find(t => t.mode === 'lines');
    const sr  = document.getElementById('plotSR-' + activePlot().id).textContent;
    return { name: fit?.name, y: fit?.y, sr };
  });
  expect(out.name).toContain('y = 1.000x + 1.500');
  expect(out.name).toContain('R² = 0.8333');
  expect(out.y[0]).toBeCloseTo(1.5, 10);  // a·0 + b
  expect(out.y[1]).toBeCloseTo(4.5, 10);  // a·3 + b
  expect(out.sr).toContain('linear fit');
  expect(out.sr).toContain('R2=0.8333');
});
