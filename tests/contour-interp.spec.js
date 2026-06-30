// contour-interp.spec.js — interpolated contours (Phase 17, v2.10.0): the
// gridScattered numerics core (in isolation) plus the buildContourTrace
// opt-in renderer wiring.
//
// Reference policy (STANDARDS §20 — derived from the definition, not the code):
// - Exactness: a LINEAR field f = a·x + b·y + c is harmonic, and the discrete
//   Laplace interpolant of exact boundary data is exactly the linear field.
//   Sampling f on the nodes and gridding it must recover f at every non-gap
//   cell to ~1e-6 — including a filled interior hole.
// - No fabrication (max principle): every non-gap value must lie within the
//   data's own [min, max]; the harmonic fill can never overshoot.
// - No extrapolation: cells outside the data's convex hull are gaps (null).
// - Concave-void honesty: a hole far from any data (annulus centre) stays a
//   gap even though it is inside the convex hull.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = `file://${path.resolve(__dirname, '..', 'datalab.html')}`;

// ── Shading control + colorbar title (v2.17.0) ─────────────────────────────
const GRID2x2 = {
  id: 'a', name: 'A', color: '#000', headers: ['x', 'y', 'z'],
  rows: [{ x: 1, y: 1, z: 10 }, { x: 1, y: 2, z: 20 }, { x: 2, y: 1, z: 30 }, { x: 2, y: 2, z: 40 }],
};
const CONTOUR_BASE = { id: 's', name: 'c', chartType: 'contour', datasetId: 'a',
  xCol: 'x', yCol: 'y', zCol: 'z', filters: [], style: {} };

test('contour Smooth-shading toggle switches coloring + line smoothing', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(({ ds, base }) => {
    const smooth = buildContourTrace({ ...base }, [ds]).traces[0];                  // default = on
    const banded = buildContourTrace({ ...base, contourSmooth: false }, [ds]).traces[0];
    return {
      smoothColoring: smooth.contours.coloring, smoothLine: smooth.line.smoothing,
      bandedColoring: banded.contours.coloring, bandedLine: banded.line.smoothing,
    };
  }, { ds: GRID2x2, base: CONTOUR_BASE });
  expect(out.smoothColoring).toBe('heatmap'); expect(out.smoothLine).toBe(1);  // unchanged default
  expect(out.bandedColoring).toBe('fill');    expect(out.bandedLine).toBe(0);  // discrete bands, straight edges
});

test('contour colorbar title uses colorbarLabel, falls back to the Z column', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(({ ds, base }) => ({
    dflt:   buildContourTrace({ ...base }, [ds]).traces[0].colorbar.title.text,
    custom: buildContourTrace({ ...base, colorbarLabel: 'Pressure (kPa)' }, [ds]).traces[0].colorbar.title.text,
  }), { ds: GRID2x2, base: CONTOUR_BASE });
  expect(out.dflt).toBe('z');
  expect(out.custom).toBe('Pressure (kPa)');
});

// ── Colorbar controls (v2.18.0) ────────────────────────────────────────────
test('contour colorbar controls: range, reverse, hide-title, level count', async ({ page }) => {
  await page.goto(FILE_URL);
  const t = await page.evaluate(({ ds, base }) =>
    buildContourTrace({ ...base, colorMin: 5, colorMax: 35, colorReverse: true,
      colorbarTitleHide: true, contourLevels: 8 }, [ds]).traces[0],
    { ds: GRID2x2, base: CONTOUR_BASE });
  expect(t.zmin).toBe(5); expect(t.zmax).toBe(35);
  expect(t.reversescale).toBe(true);
  expect(t.ncontours).toBe(8);
  expect(t.colorbar.title.text).toBe(''); // title hidden
});

test('contour colorbar defaults add no range/reverse/level keys; title = Z', async ({ page }) => {
  await page.goto(FILE_URL);
  const t = await page.evaluate(({ ds, base }) =>
    buildContourTrace({ ...base }, [ds]).traces[0], { ds: GRID2x2, base: CONTOUR_BASE });
  expect(t.zmin).toBeUndefined(); expect(t.zmax).toBeUndefined();
  expect(t.reversescale).toBeUndefined(); expect(t.ncontours).toBeUndefined();
  expect(t.colorbar.title.text).toBe('z');
});

test('heatmap gets range + reverse, but the title still names the aggregation (§20)', async ({ page }) => {
  await page.goto(FILE_URL);
  const t = await page.evaluate(() => {
    const ds = { id: 'h', name: 'H', color: '#000', headers: ['cx', 'cy', 'v'],
      rows: [{ cx: 'a', cy: 'p', v: 1 }, { cx: 'a', cy: 'q', v: 2 },
             { cx: 'b', cy: 'p', v: 3 }, { cx: 'b', cy: 'q', v: 4 }] };
    const s = { id: 's', name: 'h', chartType: 'heatmap', datasetId: 'h',
      xCol: 'cx', yCol: 'cy', zCol: 'v', agg: 'mean',
      colorMin: 0, colorMax: 5, colorReverse: true, colorbarTitleHide: true, filters: [], style: {} };
    return buildHeatmapTrace(s, [ds]).traces[0];
  });
  expect(t.zmin).toBe(0); expect(t.zmax).toBe(5);
  expect(t.reversescale).toBe(true);
  expect(t.colorbar.title.text).toBe('mean(v)'); // hide ignored — §20 names the aggregation
});

// Iso-lines / labels / grid + per-series colormap (v2.20.0).
test('contour iso-lines default on; labels gated by lines; grid + per-series colormap', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(({ ds, base }) => {
    const dflt    = buildContourTrace({ ...base }, [ds]).traces[0];
    const labeled = buildContourTrace({ ...base, isoLabels: true, isoLabelSize: 14, displayGrid: true, colormap: 'Plasma' }, [ds]);
    const gridOff = buildContourTrace({ ...base, displayGrid: false }, [ds]);
    const noLines = buildContourTrace({ ...base, isoLines: false, isoLabels: true }, [ds]).traces[0];
    return {
      dfltLines: dflt.contours.showlines, dfltLabels: dflt.contours.showlabels,
      labLines: labeled.traces[0].contours.showlines, labLabels: labeled.traces[0].contours.showlabels,
      labSize: labeled.traces[0].contours.labelfont.size,
      gridOn: labeled.layout.xaxis.showgrid, gridOff: gridOff.layout.xaxis.showgrid,
      csArray: Array.isArray(labeled.traces[0].colorscale),
      noLinesLabels: noLines.contours.showlabels,
    };
  }, { ds: GRID2x2, base: CONTOUR_BASE });
  expect(out.dfltLines).toBe(true);      // iso-lines default on (back-compat)
  expect(out.dfltLabels).toBe(false);    // iso-labels default off
  expect(out.labLines).toBe(true);
  expect(out.labLabels).toBe(true);
  expect(out.labSize).toBe(14);
  expect(out.gridOn).toBe(true);
  expect(out.gridOff).toBe(false);
  expect(out.csArray).toBe(true);        // per-series Plasma → explicit array
  expect(out.noLinesLabels).toBe(false); // labels need lines to attach to
});

test('two contour series with different colormaps on one plot warn (mixed scale)', async ({ page }) => {
  await page.goto(FILE_URL);
  const warn = await page.evaluate(({ ds }) => {
    appState.datasets.push(ds);
    const pid = appState.plots[0].id;
    appState.series = [
      { id: 'c1', name: 'c1', datasetId: 'a', plotId: pid, chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z', colormap: 'Viridis', filters: [], style: {} },
      { id: 'c2', name: 'c2', datasetId: 'a', plotId: pid, chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z', colormap: 'Plasma', filters: [], style: {} },
    ];
    renderPlot();
    const box = document.querySelector(`.plot-panel[data-pid="${pid}"] .panel-errors`);
    return box ? box.textContent : '';
  }, { ds: GRID2x2 });
  expect(warn).toMatch(/identical colors may not mean identical values/i);
});

test('linear field is recovered exactly, including a filled interior hole', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const n = 12, lo = 0, hi = 10, h = (hi - lo) / (n - 1);
    const f = (x, y) => 2 * x + 3 * y + 1;
    const pts = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (i === 5 && j === 5) continue; // leave one interior node empty → must be filled
      pts.push([lo + i * h, lo + j * h, f(lo + i * h, lo + j * h)]);
    }
    const g = gridScattered(pts, { n });
    let maxerr = 0, anyNull = false;
    for (let j = 0; j < g.y.length; j++) for (let i = 0; i < g.x.length; i++) {
      const v = g.z[j][i];
      if (v === null) { anyNull = true; continue; }
      maxerr = Math.max(maxerr, Math.abs(v - f(g.x[i], g.y[j])));
    }
    return { maxerr, anyNull, filled: g.filled, hole: g.z[5][5], holeTrue: f(g.x[5], g.y[5]) };
  });
  expect(out.anyNull).toBe(false);      // every node is data or supported fill
  expect(out.filled).toBe(1);           // exactly the one omitted interior node
  expect(out.maxerr).toBeLessThan(1e-6);
  expect(out.hole).toBeCloseTo(out.holeTrue, 6);
});

test('filled values never exceed the data range (max principle)', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const pts = []; let zmin = Infinity, zmax = -Infinity;
    for (let k = 0; k < 800; k++) {
      const x = rnd() * 10, y = rnd() * 10, z = Math.sin(x) * Math.cos(y);
      pts.push([x, y, z]); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
    }
    const g = gridScattered(pts, { n: 40 });
    let lo = Infinity, hi = -Infinity, nn = 0;
    for (let j = 0; j < g.y.length; j++) for (let i = 0; i < g.x.length; i++) {
      const v = g.z[j][i]; if (v === null) continue;
      nn++; lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    return { zmin, zmax, lo, hi, nn };
  });
  expect(out.nn).toBeGreaterThan(0);
  expect(out.lo).toBeGreaterThanOrEqual(out.zmin - 1e-9);
  expect(out.hi).toBeLessThanOrEqual(out.zmax + 1e-9);
});

test('no extrapolation: convex-hull corners stay empty', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const pts = [];
    for (let k = 0; k < 360; k++) { const t = 2 * Math.PI * k / 360; pts.push([Math.cos(t), Math.sin(t), Math.cos(t)]); }
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      const x = -0.8 + 1.6 * a / 7, y = -0.8 + 1.6 * b / 7;
      if (x * x + y * y <= 0.81) pts.push([x, y, x]);
    }
    const g = gridScattered(pts, { n: 30 }), N = g.x.length - 1;
    return { c00: g.z[0][0], c0N: g.z[0][N], cN0: g.z[N][0], cNN: g.z[N][N] };
  });
  // The unit-disk hull never reaches the bounding-box corners
  expect(out.c00).toBeNull();
  expect(out.c0N).toBeNull();
  expect(out.cN0).toBeNull();
  expect(out.cNN).toBeNull();
});

test('concave void stays empty: an annulus centre is a gap, not filled', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const pts = [];
    for (const r of [0.5, 0.7, 0.85, 1.0]) for (let k = 0; k < 120; k++) {
      const t = 2 * Math.PI * k / 120; pts.push([r * Math.cos(t), r * Math.sin(t), r]);
    }
    const g = gridScattered(pts, { n: 41 });
    let ci = 0, cj = 0, bx = Infinity, by = Infinity;
    for (let i = 0; i < g.x.length; i++) if (Math.abs(g.x[i]) < bx) { bx = Math.abs(g.x[i]); ci = i; }
    for (let j = 0; j < g.y.length; j++) if (Math.abs(g.y[j]) < by) { by = Math.abs(g.y[j]); cj = j; }
    return { center: g.z[cj][ci], cx: g.x[ci], cy: g.y[cj] };
  });
  expect(Math.hypot(out.cx, out.cy)).toBeLessThan(0.1); // genuinely the centre
  expect(out.center).toBeNull();                        // far from data → gap
});

// ── Renderer wiring (buildContourTrace opt-in) ──────────────────────────────

// Disk of scattered points centred at (5,5); the bounding-box corners fall
// outside the convex hull, guaranteeing gap cells in the gridded surface.
function diskRows() {
  const rows = [];
  for (let k = 0; k < 600; k++) {
    const t = 2 * Math.PI * k / 50, r = 4 * Math.sqrt((k % 50) / 50);
    const x = 5 + r * Math.cos(t), y = 5 + r * Math.sin(t);
    rows.push({ x, y, z: x + y });
  }
  return rows;
}

test('interpolate:true builds a contour trace from scattered data and names the method', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate((rows) => {
    const ds = { id: 'd1', name: 'D', rows, headers: ['x', 'y', 'z'] };
    const series = { datasetId: 'd1', name: 'Surf', chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z', interpolate: true };
    const res = buildContourTrace(series, [ds]);
    const tr = res.traces[0] || {};
    let hasNull = false;
    if (Array.isArray(tr.z)) for (const row of tr.z) if (row.includes(null)) { hasNull = true; break; }
    return { error: res.error, type: tr.type, name: tr.name, connectgaps: tr.connectgaps, hover: tr.hovertemplate,
             is2d: Array.isArray(tr.z) && Array.isArray(tr.z[0]), hasNull };
  }, diskRows());
  expect(out.error).toBeNull();
  expect(out.type).toBe('contour');
  expect(out.is2d).toBe(true);
  expect(out.name).toMatch(/interpolat/i);   // announces itself (§20)
  expect(out.hover).toMatch(/interpolated/i);
  expect(out.connectgaps).toBe(false);
  expect(out.hasNull).toBe(true);            // corners outside the hull are gaps
});

test('scattered data WITHOUT interpolate still errors — the opt-in never changes the default', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate((rows) => {
    const ds = { id: 'd1', name: 'D', rows, headers: ['x', 'y', 'z'] };
    const series = { datasetId: 'd1', name: 'Surf', chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z' };
    const res = buildContourTrace(series, [ds]);
    return { error: res.error, traces: res.traces.length };
  }, diskRows());
  expect(out.error).toMatch(/pre-gridded/i);
  expect(out.traces).toBe(0);
});

test('pre-gridded data renders unchanged under the default path', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate(() => {
    const rows = [];
    for (let xi = 0; xi < 5; xi++) for (let yi = 0; yi < 4; yi++) rows.push({ x: xi, y: yi, z: xi + yi });
    const ds = { id: 'd1', name: 'D', rows, headers: ['x', 'y', 'z'] };
    const series = { datasetId: 'd1', name: 'Surf', chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z' };
    const res = buildContourTrace(series, [ds]);
    const tr = res.traces[0] || {};
    return { error: res.error, type: tr.type, name: tr.name,
             rows: Array.isArray(tr.z) ? tr.z.length : -1,
             cols: Array.isArray(tr.z) && tr.z[0] ? tr.z[0].length : -1 };
  });
  expect(out.error).toBeNull();
  expect(out.type).toBe('contour');
  expect(out.rows).toBe(4);  // unique Y
  expect(out.cols).toBe(5);  // unique X
  expect(out.name).not.toMatch(/interpolat/i); // default path carries no method tag
});

test('showPoints overlays a markers trace at the raw sample locations', async ({ page }) => {
  await page.goto(FILE_URL);
  const out = await page.evaluate((rows) => {
    const ds = { id: 'd1', name: 'D', rows, headers: ['x', 'y', 'z'] };
    const series = { datasetId: 'd1', name: 'Surf', chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z', interpolate: true, showPoints: true };
    const res = buildContourTrace(series, [ds]);
    const pts = res.traces.find(t => t.mode === 'markers');
    return { n: res.traces.length, contour: res.traces[0].type,
             ptsCount: pts ? pts.x.length : 0, ptsName: pts ? pts.name : null };
  }, diskRows());
  expect(out.n).toBe(2);                 // contour + overlay
  expect(out.contour).toBe('contour');
  expect(out.ptsCount).toBe(600);        // every sample location (diskRows count)
  expect(out.ptsName).toMatch(/data/i);
});

test('interpolate without showPoints draws no overlay', async ({ page }) => {
  await page.goto(FILE_URL);
  const n = await page.evaluate((rows) => {
    const ds = { id: 'd1', name: 'D', rows, headers: ['x', 'y', 'z'] };
    const series = { datasetId: 'd1', name: 'Surf', chartType: 'contour', xCol: 'x', yCol: 'y', zCol: 'z', interpolate: true };
    return buildContourTrace(series, [ds]).traces.length;
  }, diskRows());
  expect(n).toBe(1);                     // contour surface only
});
