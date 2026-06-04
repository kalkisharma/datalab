// bench.spec.js — performance benchmarks (release gate, Phase 2+)
//
// Run with:  BENCH=1 npx playwright test tests/bench.spec.js
// Skipped in the normal PR suite — benchmarks run on release only
// (STANDARDS.md §11).
//
// Benchmark reference dataset spec (QA + Performance Engineer sign-off):
//   50,000 rows × 4 columns — x: numeric uniform [0,100), y: numeric
//   uniform [0,100), category: 10 unique string values c0–c9, value:
//   numeric uniform [0,1). Generated in-page at test time: a committed
//   CSV would be ~1.2 MB, exceeding the 500 KB limit in tests/data/README.md,
//   and CSV parse time is not part of the render benchmark.
//
// Method (STANDARDS.md §11): performance.now() around renderPlot() (which
// wraps Plotly.react). First render is cold (informational). Warm = 3 runs,
// median. If stddev > 20% of median, one re-run batch; persistent noise is
// logged, not a failure — only genuine target misses fail.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

const SKIP = !process.env.BENCH;

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function stddev(a) { const m = a.reduce((x, y) => x + y) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); }

test.describe('release benchmarks', () => {
  test.skip(SKIP, 'Release benchmark — run with BENCH=1');

  test('warm render: 10 series × 50k rows < 2s (median of 3)', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto(FILE_URL);

    const setup = async () => page.evaluate(() => {
      const rows = [];
      for (let i = 0; i < 50000; i++) {
        rows.push({ x: Math.random() * 100, y: Math.random() * 100,
                    category: 'c' + (i % 10), value: Math.random() });
      }
      appState.datasets.push({ id: 'bench', name: 'bench', rows,
        headers: ['x', 'y', 'category', 'value'], color: '#4e79a7' });
      for (let k = 0; k < 10; k++) {
        appState.series.push({ id: 'bs' + k, name: 'bench ' + k, datasetId: 'bench',
          chartType: 'scatter', xCol: 'x', yCol: 'y', colorCol: null,
          filters: [], style: { color: '#4e79a7' }, enabled: true });
      }
    });
    await setup();

    const runBatch = () => page.evaluate(() => {
      // Cold only meaningful on the first call of the session
      const t0 = performance.now(); renderPlot(); const first = performance.now() - t0;
      const warm = [];
      for (let r = 0; r < 3; r++) {
        const t = performance.now(); renderPlot(); warm.push(performance.now() - t);
      }
      return { first, warm };
    });

    let { first, warm } = await runBatch();
    console.log(`cold render (informational): ${first.toFixed(0)} ms`);
    console.log(`warm renders: ${warm.map(v => v.toFixed(0)).join(', ')} ms`);

    let med = median(warm);
    if (stddev(warm) > 0.2 * med) {
      console.log(`stddev ${stddev(warm).toFixed(0)} > 20% of median — re-running batch`);
      ({ warm } = await runBatch());
      console.log(`warm renders (retry): ${warm.map(v => v.toFixed(0)).join(', ')} ms`);
      med = median(warm);
      if (stddev(warm) > 0.2 * med) {
        console.log('environment still noisy — result recorded, see STANDARDS.md §11');
      }
    }

    console.log(`warm render median: ${med.toFixed(0)} ms (target < 2000)`);
    expect(med).toBeLessThan(2000);
  });

  // Pending since Phase 1; becomes a binding gate (< 5s) at Phase 3
  test.fixme('cold render: 10 series × 50k rows < 5s (binding from Phase 3)', async () => {});
});
