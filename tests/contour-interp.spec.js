// contour-interp.spec.js — gridScattered numerics for interpolated contours
// (Phase 17, v2.10.0). Tests the gridding core in isolation, before the
// renderer/modal wiring is built (deliverable order per §18).
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
