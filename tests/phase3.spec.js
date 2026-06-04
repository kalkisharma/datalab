// phase3.spec.js — Phase 3: new chart types, renderer validation errors,
// AND/OR + extended filters, datetime support

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

// Most tests drive the renderers/filters directly via page.evaluate — the
// modal UI path is covered by smoke/series-list/multi-series specs.

function evalWith(page, fn) { return page.evaluate(fn); }

async function freshPage(page) { await page.goto(FILE_URL); }

// ── Histogram ─────────────────────────────────────────────────────────────

test('histogram: FD bin count adapts to data; manual binCount honored', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ v: Math.sin(i) * 50 + 50 }));
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['v'], rows };
    const auto   = buildHistogramTrace({ id:'s', name:'h', datasetId:'d', chartType:'histogram', xCol:'v', filters:[], style:{} }, [ds]);
    const manual = buildHistogramTrace({ id:'s2', name:'h2', datasetId:'d', chartType:'histogram', xCol:'v', binCount: 7, filters:[], style:{} }, [ds]);
    return { autoBins: auto.traces[0].nbinsx, manualBins: manual.traces[0].nbinsx, autoErr: auto.error };
  });
  expect(r.autoErr).toBeNull();
  expect(r.autoBins).toBeGreaterThan(1);
  expect(r.autoBins).toBeLessThanOrEqual(500);
  expect(r.manualBins).toBe(7);
});

test('histogram: categorical column produces a clear error (QA validation)', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ site: 'site_' + (i % 5) }));
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['site'], rows };
    return buildHistogramTrace({ id:'s', name:'h', datasetId:'d', chartType:'histogram', xCol:'site', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toContain('not numeric');
});

// ── Boxplot ───────────────────────────────────────────────────────────────

test('boxplot: grouped by category renders; >50 categories warns but renders (QA validation)', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const mk = nCats => {
      const rows = Array.from({ length: nCats * 4 }, (_, i) => ({ g: 'g' + (i % nCats), v: Math.random() * 10 }));
      const ds = { id: 'd', name: 'd', color: '#000', headers: ['g', 'v'], rows };
      return buildBoxplotTrace({ id:'s', name:'b', datasetId:'d', chartType:'boxplot', xCol:'g', yCol:'v', filters:[], style:{} }, [ds]);
    };
    return { ok: mk(8), over: mk(60) };
  });
  expect(r.ok.error).toBeNull();
  expect(r.ok.warning).toBeNull();
  expect(r.over.error).toBeNull();          // still renders…
  expect(r.over.warning).toContain('60');   // …but warns
  expect(r.over.traces.length).toBe(1);
});

test('boxplot: non-numeric Y produces a clear error', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [{ g: 'a', v: 1 }, { g: 'b', v: 2 }];
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['g', 'v'], rows };
    return buildBoxplotTrace({ id:'s', name:'b', datasetId:'d', chartType:'boxplot', yCol:'g', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toContain('not numeric');
});

// ── Contour ───────────────────────────────────────────────────────────────

test('contour: valid grid renders with z matrix', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [];
    for (const x of [0, 1, 2]) for (const y of [10, 20]) rows.push({ x, y, z: x * y });
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['x', 'y', 'z'], rows };
    return buildContourTrace({ id:'s', name:'c', datasetId:'d', chartType:'contour', xCol:'x', yCol:'y', zCol:'z', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toBeNull();
  expect(r.traces[0].x).toEqual([0, 1, 2]);
  expect(r.traces[0].y).toEqual([10, 20]);
  expect(r.traces[0].z).toEqual([[0, 10, 20], [0, 20, 40]]);
});

test('contour: scattered (non-gridded) points produce a clear error (QA validation)', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = Array.from({ length: 30 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['x', 'y', 'z'], rows };
    return buildContourTrace({ id:'s', name:'c', datasetId:'d', chartType:'contour', xCol:'x', yCol:'y', zCol:'z', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toContain('pre-gridded');
});

test('contour: non-numeric column produces a clear error (QA validation)', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [{ x: 1, y: 1, z: 'oops' }, { x: 2, y: 1, z: 'nope' }];
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['x', 'y', 'z'], rows };
    return buildContourTrace({ id:'s', name:'c', datasetId:'d', chartType:'contour', xCol:'x', yCol:'y', zCol:'z', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toContain('not numeric');
});

// ── Filters: AND/OR + extended operators ──────────────────────────────────

test('applyFilters: OR logic, in_range, and in_set behave per the encoding spec', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [
      { v: 1,  site: 'a' }, { v: 5,  site: 'b' },
      { v: 10, site: 'c' }, { v: 50, site: 'a' },
    ];
    return {
      and: applyFilters(rows, [
        { col: 'v', op: 'gte', value: 5, enabled: true },
        { col: 'site', op: 'eq', value: 'a', enabled: true },
      ], 'and').map(r => r.v),
      or: applyFilters(rows, [
        { col: 'v', op: 'lt', value: 2, enabled: true },
        { col: 'site', op: 'eq', value: 'c', enabled: true },
      ], 'or').map(r => r.v),
      range: applyFilters(rows, [
        { col: 'v', op: 'in_range', value: { min: 2, max: 20 }, enabled: true },
      ]).map(r => r.v),
      set: applyFilters(rows, [
        { col: 'site', op: 'in_set', value: ['a', 'c'], enabled: true },
      ]).map(r => r.v),
      disabledSkipped: applyFilters(rows, [
        { col: 'v', op: 'gte', value: 100, enabled: false },
      ]).length,
    };
  });
  expect(r.and).toEqual([50]);
  expect(r.or).toEqual([1, 10]);
  expect(r.range).toEqual([5, 10]);
  expect(r.set).toEqual([1, 10, 50]);
  expect(r.disabledSkipped).toBe(4);
});

// ── Datetime ──────────────────────────────────────────────────────────────

test('datetime: format detection — ISO, provable MDY/DMY, ambiguous', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => ({
    iso: detectDateFormat(['2024-01-15', '2024-02-20']),
    dmy: detectDateFormat(['15/01/2024', '20/02/2024']),  // first component > 12
    mdy: detectDateFormat(['01/15/2024', '02/20/2024']),  // second component > 12
    amb: detectDateFormat(['01/02/2024', '03/04/2024']),  // both ≤ 12 everywhere
  }));
  expect(r.iso).toBe('ISO');
  expect(r.dmy).toBe('DMY');
  expect(r.mdy).toBe('MDY');
  expect(r.amb).toBe('ambiguous');
});

test('datetime: scatter with datetime X converts values and drops bad pairs together', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [
      { d: '15/01/2024', v: 1 },
      { d: 'not-a-date', v: 2 },   // dropped: bad date
      { d: '20/03/2024', v: 'x' }, // dropped: bad y
      { d: '25/06/2024', v: 4 },
    ];
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['d', 'v'], rows };
    return buildScatterTrace({ id:'s', name:'dt', datasetId:'d', chartType:'scatter', xCol:'d', yCol:'v', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toBeNull();
  expect(r.traces[0].x).toEqual(['2024-01-15', '2024-06-25']);
  expect(r.traces[0].y).toEqual([1, 4]);
});

test('datetime: line sorts pairs into time order', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [
      { d: '2024-06-01', v: 3 },
      { d: '2024-01-01', v: 1 },
      { d: '2024-03-01', v: 2 },
    ];
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['d', 'v'], rows };
    return buildLineTrace({ id:'s', name:'dt', datasetId:'d', chartType:'line', xCol:'d', yCol:'v', filters:[], style:{} }, [ds]);
  });
  expect(r.traces[0].x).toEqual(['2024-01-01', '2024-03-01', '2024-06-01']);
  expect(r.traces[0].y).toEqual([1, 2, 3]);
});

test('datetime: unresolved ambiguous format produces a clear error at render', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [{ d: '01/02/2024', v: 1 }, { d: '03/04/2024', v: 2 }];
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['d', 'v'], rows };
    return buildScatterTrace({ id:'s', name:'dt', datasetId:'d', chartType:'scatter', xCol:'d', yCol:'v', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toContain('ambiguous');
});

test('datetime: stored dataset format resolves ambiguity', async ({ page }) => {
  await freshPage(page);
  const r = await evalWith(page, () => {
    const rows = [{ d: '01/02/2024', v: 1 }];
    const ds = { id: 'd', name: 'd', color: '#000', headers: ['d', 'v'], rows,
                 dateFormats: { d: 'DMY' } };
    return buildScatterTrace({ id:'s', name:'dt', datasetId:'d', chartType:'scatter', xCol:'d', yCol:'v', filters:[], style:{} }, [ds]);
  });
  expect(r.error).toBeNull();
  expect(r.traces[0].x).toEqual(['2024-02-01']); // DMY: 01/02 = Feb 1st
});
