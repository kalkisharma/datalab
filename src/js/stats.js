// stats.js — statistical engine and cleaning operations (Phase 5)
// (distribution fits + KDE split to distributions.js at the Phase 11 exit)
//
// The Data Scientist owns the correctness of everything in this file.
// Methodology notes are inline at each function; tests pin the outputs to
// hand-computed reference values (tests/phase5.spec.js).

// ── Missing-value guard ───────────────────────────────────────────────────
// Number(null) and Number('') coerce to 0 — which would silently turn
// missing values into zeros and corrupt every statistic computed here.
// (Caught by the reference-value tests; same rule colVals uses.)
function finiteOrNaN(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// ── Quantile ──────────────────────────────────────────────────────────────
// Linear interpolation between order statistics (R type 7) — the same
// convention the Freedman-Diaconis helper in histogram.js uses.
/**
 * @param {number[]} sorted - ascending finite values
 * @param {number}   p      - 0..1
 * @returns {number}
 */
function quantile(sorted, p) {
  const n = sorted.length;
  if (!n) return NaN;
  const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// ── Summary statistics ────────────────────────────────────────────────────
// std is the SAMPLE standard deviation (n−1 denominator, Bessel's
// correction) — these are summaries of a sample, not a full population.
/**
 * @param {object[]} rows
 * @param {string}   col
 * @returns {object|null} null when the column has no finite values
 */
function summaryStats(rows, col) {
  const raw = rows.map(r => r[col]);
  const v = raw.map(finiteOrNaN).filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  const missing = raw.length - n;
  if (!n) return null;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const std  = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  return {
    n, missing, mean, std,
    min: v[0], p25: quantile(v, 0.25), median: quantile(v, 0.5),
    p75: quantile(v, 0.75), max: v[n - 1],
  };
}

// ── Pearson correlation ───────────────────────────────────────────────────
// Pairwise-complete deletion: each cell uses only the rows where BOTH
// columns are finite. Different cells may therefore be computed on
// different subsets — standard for missing data, but worth knowing when
// missingness is not random.
/**
 * @param {object[]} rows
 * @param {string[]} cols - numeric column names
 * @returns {number[][]} symmetric matrix, diagonal 1, NaN when < 2 pairs
 */
function pearsonMatrix(rows, cols) {
  const vals = cols.map(c => rows.map(r => finiteOrNaN(r[c])));
  const m = cols.map(() => new Array(cols.length).fill(NaN));
  for (let i = 0; i < cols.length; i++) {
    m[i][i] = 1;
    for (let j = i + 1; j < cols.length; j++) {
      const xs = [], ys = [];
      for (let k = 0; k < rows.length; k++) {
        if (Number.isFinite(vals[i][k]) && Number.isFinite(vals[j][k])) {
          xs.push(vals[i][k]); ys.push(vals[j][k]);
        }
      }
      const r = pearsonR(xs, ys);
      m[i][j] = r; m[j][i] = r;
    }
  }
  return m;
}

function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return (sxx === 0 || syy === 0) ? NaN : sxy / Math.sqrt(sxx * syy);
}

// ── Linear least-squares fit (Phase 9, trendline) ─────────────────────────
// y = a·x + b minimizing Σ(y − ŷ)²; R² = sxy²/(sxx·syy) — equivalent to
// 1 − SS_res/SS_tot for simple linear regression. Reference values in
// trendline tests are hand-derived from these formulas (§20).
/**
 * @param {number[]} xs
 * @param {number[]} ys - same length, finite pairs only
 * @returns {{ a: number, b: number, r2: number, n: number,
 *            meanX: number, sxx: number, ssRes: number }|null}
 *          null when n < 2 or x has no variance.
 *          meanX/sxx/ssRes are additive (Phase 19) — the CI/PI band SEs need
 *          them; existing callers ignore the extra keys. ssRes = Σ(y−ŷ)²,
 *          clamped ≥ 0 against float cancellation on near-perfect fits.
 */
function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return null; // vertical data — no least-squares line
  const a = sxy / sxx;
  const b = my - a * mx;
  const r2 = syy === 0 ? NaN : (sxy * sxy) / (sxx * syy);
  const ssRes = Math.max(0, syy - a * sxy); // = Σ(y−ŷ)² for the OLS line
  return { a, b, r2, n, meanX: mx, sxx, ssRes };
}

// ── Polynomial least squares (Phase 13, trendline degrees 2–3) ───────────
// Normal equations XᵀXβ = Xᵀy solved by Gaussian elimination with partial
// pivoting (matrix is at most 4×4 for cubic). R² = 1 − SSres/SStot.
// Tests use exact-recovery references (fitting degree-d data returns its
// coefficients — hand-derivable) plus the defining normal-equation
// property: residuals are orthogonal to every design column (§20).
/**
 * @param {number[]} xs
 * @param {number[]} ys  - same length, finite pairs only
 * @param {number}   deg - 1..3
 * @returns {{ coef: number[], r2: number, n: number }|null} coef[k] · xᵏ
 */
function polyFit(xs, ys, deg) {
  const n = xs.length, m = deg + 1;
  if (n < m || deg < 1 || deg > 3) return null;
  // Power sums Σxᵏ (k ≤ 2·deg) and moment sums Σy·xᵏ
  const sx = new Array(2 * deg + 1).fill(0);
  const sy = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    let p = 1;
    for (let k = 0; k <= 2 * deg; k++) { sx[k] += p; if (k < m) sy[k] += ys[i] * p; p *= xs[i]; }
  }
  // Augmented system, partial-pivot elimination
  const A = [];
  for (let r = 0; r < m; r++) {
    A.push([]);
    for (let c = 0; c < m; c++) A[r][c] = sx[r + c];
    A[r][m] = sy[r];
  }
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null; // singular — degenerate x
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const fac = A[r][col] / A[col][col];
      for (let c = col; c <= m; c++) A[r][c] -= fac * A[col][c];
    }
  }
  const coef = A.map((row, r) => row[m] / row[r]);
  // R²
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let ssr = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    let yh = 0, p = 1;
    for (let k = 0; k < m; k++) { yh += coef[k] * p; p *= xs[i]; }
    ssr += (ys[i] - yh) ** 2;
    sst += (ys[i] - my) ** 2;
  }
  return { coef, r2: sst === 0 ? NaN : 1 - ssr / sst, n };
}

// ── Cleaning operations ───────────────────────────────────────────────────
// All operations mutate the dataset in place; CALLERS must bump the dataset
// revision and re-validate series afterwards (the Data Tools modal does).

/**
 * Rename a column. Row keys are rewritten; series references are the
 * caller's responsibility (renameColumnRefs).
 * @returns {boolean} false if the new name collides
 */
function renameColumn(ds, oldName, newName) {
  if (!newName || ds.headers.includes(newName)) return false;
  ds.headers = ds.headers.map(h => h === oldName ? newName : h);
  for (const r of ds.rows) { r[newName] = r[oldName]; delete r[oldName]; }
  if (ds.dateFormats?.[oldName]) {
    ds.dateFormats[newName] = ds.dateFormats[oldName];
    delete ds.dateFormats[oldName];
  }
  return true;
}

// Follow a rename through every series referencing the dataset's column —
// without this, renaming breaks plots that were built on the old name.
function renameColumnRefs(seriesList, dsId, oldName, newName) {
  let touched = 0;
  for (const s of seriesList) {
    const own  = s.datasetId === dsId;
    const join = s.joinDatasetId === dsId;
    if (!own && !join) continue;
    let hit = false;
    if (own) {
      for (const k of ['xCol', 'colorCol', 'zCol']) {
        if (s[k] === oldName) { s[k] = newName; hit = true; }
      }
      if (s.chartType !== 'parity' && s.yCol === oldName) { s.yCol = newName; hit = true; }
      (s.filters || []).forEach(f => { if (f.col === oldName) { f.col = newName; hit = true; } });
    }
    if (join && s.chartType === 'parity' && s.yCol === oldName) { s.yCol = newName; hit = true; }
    if (s.joinKey === oldName && (own || join)) { s.joinKey = newName; hit = true; }
    if (hit) touched++;
  }
  return touched;
}

// Drop = remove from headers only; row values stay (cheap at 1M rows) but
// are invisible to pickers and excluded from CSV export (unparse uses the
// header list as its column set).
function dropColumn(ds, col) {
  ds.headers = ds.headers.filter(h => h !== col);
}

/** @returns {number} count of values that could not be parsed (set to null) */
function castNumeric(ds, col) {
  let failed = 0;
  for (const r of ds.rows) {
    const v = r[col];
    if (v === null || v === undefined || v === '') { r[col] = null; continue; }
    const n = Number(v);
    if (Number.isFinite(n)) r[col] = n;
    else { r[col] = null; failed++; }
  }
  return failed;
}

/**
 * @param {'drop'|'mean'|'median'|'value'} mode
 * @param {*} [fillValue] - used when mode === 'value'
 * @returns {number} rows dropped or values filled
 */
function handleMissing(ds, col, mode, fillValue) {
  const isMissing = v => v === null || v === undefined || v === '' ||
                         (typeof v === 'number' && !Number.isFinite(v));
  if (mode === 'drop') {
    const before = ds.rows.length;
    ds.rows = ds.rows.filter(r => !isMissing(r[col]));
    return before - ds.rows.length;
  }
  let fill;
  if (mode === 'value') fill = fillValue;
  else {
    const stats = summaryStats(ds.rows, col);
    if (!stats) return 0;
    fill = mode === 'mean' ? stats.mean : stats.median;
  }
  let filled = 0;
  for (const r of ds.rows) {
    if (isMissing(r[col])) { r[col] = fill; filled++; }
  }
  return filled;
}
