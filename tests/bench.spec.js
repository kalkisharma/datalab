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

  // Binding from Phase 3 (was pending since Phase 1)
  test('cold render: 10 series × 50k rows < 5s', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(FILE_URL);
    const cold = await page.evaluate(() => {
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
      const t0 = performance.now(); renderPlot();
      return performance.now() - t0;
    });
    console.log(`cold render: ${cold.toFixed(0)} ms (target < 5000)`);
    expect(cold).toBeLessThan(5000);
  });

  // Phase 4 GA criterion: no memory leaks. 1M rows + 10 series rendered,
  // then everything deleted — after GC the heap must return near baseline.
  test('memory: 1M rows + 10 series, delete all → heap returns to baseline', async ({ browser }) => {
    test.setTimeout(300_000);
    // --expose-gc to force collection; --enable-precise-memory-info because
    // performance.memory is otherwise quantized to coarse buckets
    const context = await browser.browserType().launch({
      args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
    }).then(b => b.newContext());
    const page = await context.newPage();
    await page.goto(FILE_URL);

    const result = await page.evaluate(async () => {
      const gc = window.gc ?? (() => {});
      const heap = () => performance.memory?.usedJSHeapSize ?? 0;

      gc(); await new Promise(r => setTimeout(r, 200)); gc();
      const baseline = heap();

      // Load 1M rows, 10 series, render. `rows` must be nulled before the
      // final measurement — this closure's own reference would otherwise pin
      // the data and measure the test, not the app.
      let rows = [];
      for (let i = 0; i < 1_000_000; i++) rows.push({ x: i % 1000, y: (i * 7) % 1000 });
      appState.datasets.push({ id: 'mem', name: 'mem', rows, headers: ['x', 'y'], color: '#0072b2' });
      rows = null;
      for (let k = 0; k < 10; k++) {
        appState.series.push({ id: 'm' + k, name: 'mem ' + k, datasetId: 'mem',
          chartType: 'scatter', xCol: 'x', yCol: 'y', filters: [], style: {}, enabled: true });
      }
      renderPlot();
      const peak = heap();

      // Delete everything the way the UI does — removeDataset drops the
      // series, renderPlot prunes caches and clearPlot() releases the gl
      // buffers (no manual purge: the app must clean up after itself)
      removeDataset('mem');
      renderPlot();
      // Two GC rounds with a settle between: Chromium releases WebGL-backed
      // buffers asynchronously after context teardown — the first GC after
      // clearPlot() cannot reclaim them yet (verified: 164 MB after round 1,
      // baseline after round 2)
      gc(); await new Promise(r => setTimeout(r, 300)); gc();
      await new Promise(r => setTimeout(r, 500));
      gc(); await new Promise(r => setTimeout(r, 300)); gc();
      const after = heap();

      return { baseline, peak, after, gcAvailable: !!window.gc };
    });

    console.log(`heap: baseline ${(result.baseline / 1048576).toFixed(1)} MB, ` +
                `peak ${(result.peak / 1048576).toFixed(1)} MB, ` +
                `after delete ${(result.after / 1048576).toFixed(1)} MB ` +
                `(gc ${result.gcAvailable ? 'forced' : 'NOT available'})`);
    expect(result.gcAvailable).toBe(true);
    expect(result.peak).toBeGreaterThan(result.baseline); // sanity: the load was real
    // "Returns to baseline": within 25 MB — Plotly retains some module-level
    // buffers, but the 1M-row dataset (~tens of MB) must be gone
    expect(result.after - result.baseline).toBeLessThan(25 * 1048576);

    await context.close();
  });

  // Binding from Phase 3
  test('filter re-evaluation: 100k rows < 500ms (median of 3)', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(FILE_URL);
    const times = await page.evaluate(() => {
      const rows = [];
      for (let i = 0; i < 100000; i++) {
        rows.push({ v: Math.random() * 100, site: 'site_' + (i % 12) });
      }
      const filters = [
        { col: 'v',    op: 'in_range', value: { min: 20, max: 80 },        enabled: true },
        { col: 'site', op: 'in_set',   value: ['site_1', 'site_4', 'site_9'], enabled: true },
        { col: 'v',    op: 'gte',      value: 25,                           enabled: true },
      ];
      const out = [];
      for (let r = 0; r < 3; r++) {
        const t = performance.now();
        applyFilters(rows, filters, 'and');
        out.push(performance.now() - t);
      }
      return out;
    });
    const med = median(times);
    console.log(`filter re-eval: ${times.map(v => v.toFixed(0)).join(', ')} ms — median ${med.toFixed(0)} (target < 500)`);
    expect(med).toBeLessThan(500);
  });
});
