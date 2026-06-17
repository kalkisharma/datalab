// grid-interp.js — scattered (x, y, z) → regular grid, for interpolated
// contours (Phase 17, v2.10.0). The algorithm and its rejections were fixed
// by the Phase 15 design spike (PLANNING.md Phase 17); this is the accepted
// path: binned-mean gridding + convex-hull mask + data-support radius mask +
// harmonic (Laplace) gap-fill.
//
// No-fabrication guarantee (Data Scientist, §20): every filled value is a
// Gauss–Seidel relaxation of the discrete Laplace equation with the binned
// data cells held fixed. The maximum principle bounds each interpolated value
// by its neighbours, so a filled cell can never exceed the data's own range —
// no invented peaks or valleys. This is satisfied by PROOF, not by testing.
//
// Honesty masks (§20, misleading-viz): a cell is left as a GAP (null), never
// invented, when it is outside the data's convex hull (no extrapolation) OR
// when the nearest data cell is farther than R = 1.5 × the cell diagonal
// (covers ordinary single-cell binning holes without bridging real concave
// voids — the half-annulus case from the spike stays empty). R is a fixed
// constant for v2.10.0.
//
// Reference policy for the test (§20): a LINEAR field is harmonic and its
// discrete Laplace interpolant is exact, so sampling f = a·x + b·y + c on the
// grid nodes and gridding it must recover f at every non-gap cell to machine
// precision — an exact reference derived from the definition, not the code.

// Andrew's monotone chain. pts: [[x,y],…] → hull vertices, CCW. O(n log n).
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p.slice();
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper); // CCW
}

// Inside-or-on a CCW convex polygon: left of (or on) every directed edge.
function pointInHull(hull, x, y) {
  const n = hull.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-9) return false;
  }
  return true;
}

/**
 * Grid scattered (x, y, z) triples onto a regular mesh.
 * @param {number[][]} pts  finite [x, y, z] triples
 * @param {{n?:number}} [opts]  n = grid nodes per axis (default adaptive)
 * @returns {{x:number[], y:number[], z:(number|null)[][], filled:number}|null}
 *   z[j][i] is the value at (x[i], y[j]); null marks a gap. null return =
 *   not enough non-degenerate data to form a grid.
 */
function gridScattered(pts, opts = {}) {
  if (!pts || pts.length < 3) return null;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [x, y] of pts) {
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
  }
  if (!(xmax > xmin) || !(ymax > ymin)) return null; // collinear / single value

  // Adaptive resolution: ~one node per data point, capped at 60 (the spike's
  // measured budget at 100k points) with a floor of 8. An explicit n wins.
  const n = Math.max(8, Math.min(opts.n || 60, Math.round(Math.sqrt(pts.length))));
  const dx = (xmax - xmin) / (n - 1), dy = (ymax - ymin) / (n - 1);
  const X = [], Y = [];
  for (let i = 0; i < n; i++) { X.push(xmin + i * dx); Y.push(ymin + i * dy); }

  // Binned mean: each point joins its nearest node; the node value is the
  // mean of its points (explicit aggregation — the bar/heatmap precedent).
  const sum = Array.from({ length: n }, () => new Array(n).fill(0));
  const cnt = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const [x, y, z] of pts) {
    const i = Math.round((x - xmin) / dx), j = Math.round((y - ymin) / dy);
    sum[j][i] += z; cnt[j][i]++;
  }
  const z = Array.from({ length: n }, () => new Array(n).fill(null));
  const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  let dmin = Infinity, dmax = -Infinity, dmean = 0, m = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (cnt[j][i] > 0) {
      const v = sum[j][i] / cnt[j][i];
      z[j][i] = v; fixed[j][i] = true;
      if (v < dmin) dmin = v; if (v > dmax) dmax = v; dmean += v; m++;
    }
  }
  dmean = m ? dmean / m : 0;

  // Decide which empty in-hull cells may be filled: inside the convex hull
  // (no extrapolation) AND within R of a data cell (data-support mask).
  const hull = convexHull(pts.map(p => [p[0], p[1]]));
  const R = 1.5 * Math.hypot(dx, dy);
  const wx = Math.max(1, Math.ceil(R / dx)), wy = Math.max(1, Math.ceil(R / dy));
  const fillable = Array.from({ length: n }, () => new Array(n).fill(false));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (fixed[j][i] || !pointInHull(hull, X[i], Y[j])) continue;
    let near = false;
    for (let jj = Math.max(0, j - wy); jj <= Math.min(n - 1, j + wy) && !near; jj++)
      for (let ii = Math.max(0, i - wx); ii <= Math.min(n - 1, i + wx); ii++) {
        if (fixed[jj][ii] && Math.hypot((ii - i) * dx, (jj - j) * dy) <= R) { near = true; break; }
      }
    if (near) { fillable[j][i] = true; z[j][i] = dmean; } // seed; gaps stay null
  }

  // Harmonic gap-fill: Gauss–Seidel relaxation of ∇²z = 0. Data cells are
  // Dirichlet boundary (held fixed); gap cells are excluded from every
  // average. Converges to the discrete harmonic interpolant — max principle
  // bounds each value by the fixed data, so dmin ≤ filled ≤ dmax always.
  const NBR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let it = 0; it < 2000; it++) {
    let maxd = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (!fillable[j][i]) continue;
      let s = 0, c = 0;
      for (const [dj, di] of NBR) {
        const jj = j + dj, ii = i + di;
        if (jj < 0 || jj >= n || ii < 0 || ii >= n || z[jj][ii] === null) continue;
        s += z[jj][ii]; c++;
      }
      if (c) { const nv = s / c; if (Math.abs(nv - z[j][i]) > maxd) maxd = Math.abs(nv - z[j][i]); z[j][i] = nv; }
    }
    if (maxd < 1e-9 * (Math.abs(dmean) + 1)) break;
  }

  let filled = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (fillable[j][i]) filled++;
  return { x: X, y: Y, z, filled };
}
