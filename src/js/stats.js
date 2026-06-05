// stats.js — statistical engine and cleaning operations (Phase 5)
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
 * @returns {{ a: number, b: number, r2: number, n: number }|null}
 *          null when n < 2 or x has no variance
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
  return { a, b, r2, n };
}

// ── Normal distribution fit ───────────────────────────────────────────────
// Maximum-likelihood-style fit using the sample mean and SAMPLE std (n−1).
// Overlay scaling belongs to the caller: counts ≈ pdf(x) · n · binWidth.
/**
 * @param {number[]} vals - finite values
 * @returns {{ mu: number, sigma: number, n: number }|null}
 */
function fitNormal(vals) {
  const v = vals.filter(Number.isFinite);
  const n = v.length;
  if (n < 2) return null;
  const mu = v.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1));
  return { mu, sigma, n };
}

function normalPdf(x, mu, sigma) {
  if (sigma === 0) return NaN;
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// ── Lognormal fit (Phase 11) ──────────────────────────────────────────────
// μ, σ are the mean and SAMPLE std (n−1) of ln(x) — same estimator family
// as fitNormal for consistency across the fit picker (strict MLE would use
// n; the difference vanishes for the n where a fit is meaningful).
// Requires all-positive data; the caller filters and warns.
/**
 * @param {number[]} vals - finite POSITIVE values
 * @returns {{ mu: number, sigma: number, n: number }|null}
 */
function fitLognormal(vals) {
  const v = vals.filter(x => Number.isFinite(x) && x > 0);
  const n = v.length;
  if (n < 2) return null;
  const lnx = v.map(Math.log);
  const mu = lnx.reduce((a, b) => a + b, 0) / n;
  const sigma = Math.sqrt(lnx.reduce((s, x) => s + (x - mu) ** 2, 0) / (n - 1));
  if (sigma === 0) return null; // degenerate — all values equal
  return { mu, sigma, n };
}

function lognormalPdf(x, mu, sigma) {
  if (x <= 0 || sigma === 0) return 0;
  const z = (Math.log(x) - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (x * sigma * Math.sqrt(2 * Math.PI));
}

// ── Weibull fit (Phase 11) ────────────────────────────────────────────────
// Maximum likelihood: the shape k̂ solves
//   g(k) = Σxᵏln x / Σxᵏ − 1/k − mean(ln x) = 0
// and the scale is λ̂ = (Σxᵏ/n)^(1/k). Newton iteration with a numerical
// derivative, halving on overshoot, hard bounds, and a residual check —
// no convergence ⇒ null, never a bogus fit. Rank-regression was rejected
// at scoping (biased). Tests verify the MLE equations hold at the returned
// estimates (definition-residual, §20) — Weibull MLE has no closed form
// to hand-derive.
/**
 * @param {number[]} vals - finite POSITIVE values
 * @returns {{ k: number, lambda: number, n: number }|null}
 */
function fitWeibull(vals) {
  const v = vals.filter(x => Number.isFinite(x) && x > 0);
  const n = v.length;
  if (n < 2) return null;
  const lnx = v.map(Math.log);
  const L = lnx.reduce((a, b) => a + b, 0) / n;
  const sdln = Math.sqrt(lnx.reduce((s, x) => s + (x - L) ** 2, 0) / n);
  if (sdln === 0) return null; // all values equal — k → ∞, no finite MLE

  const g = k => {
    let A = 0, B = 0;
    for (let i = 0; i < n; i++) { const xk = v[i] ** k; A += xk * lnx[i]; B += xk; }
    return A / B - 1 / k - L;
  };

  let k = Math.min(100, Math.max(0.05, 1.2 / sdln)); // standard starting point
  let converged = false;
  for (let it = 0; it < 60; it++) {
    const gk = g(k);
    if (Math.abs(gk) < 1e-12) { converged = true; break; }
    const h = Math.max(1e-8, k * 1e-6);
    const d = (g(k + h) - gk) / h;
    if (!Number.isFinite(d) || d === 0) break;
    let next = k - gk / d;
    if (!Number.isFinite(next) || next <= 0 || next > 1e4) next = k / 2; // guard overshoot
    if (Math.abs(next - k) < 1e-12 * Math.max(1, k)) { k = next; converged = true; break; }
    k = next;
  }
  if (!converged && Math.abs(g(k)) > 1e-8) return null;

  const lambda = Math.pow(v.reduce((s, x) => s + x ** k, 0) / n, 1 / k);
  return { k, lambda, n };
}

function weibullPdf(x, k, lambda) {
  if (x <= 0 || k <= 0 || lambda <= 0) return 0;
  const t = x / lambda;
  return (k / lambda) * Math.pow(t, k - 1) * Math.exp(-Math.pow(t, k));
}

// ── Binned KDE (Phase 11) ─────────────────────────────────────────────────
// Gaussian kernel, Silverman's rule bandwidth, evaluated from BIN COUNTS
// rather than raw points (Performance ruling at scoping): O(bins × grid)
// instead of O(n × grid) — visually identical for an overlay; the
// approximation error is below a pixel at any plot size.
/**
 * @param {number[]} vals - finite values (bandwidth needs raw spread)
 * @param {number}   lo
 * @param {number}   hi
 * @param {number}   binWidth
 * @returns {{ xs: number[], ys: number[] }|null} density on a 200-pt grid
 */
function kdeBinned(vals, lo, hi, binWidth) {
  const n = vals.length;
  if (n < 2 || !(binWidth > 0)) return null;
  // Silverman: h = 0.9·min(sd, IQR/1.34)·n^(−1/5)
  const sorted = [...vals].sort((a, b) => a - b);
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const spread = Math.min(sd || Infinity, iqr ? iqr / 1.34 : Infinity);
  if (!Number.isFinite(spread) || spread === 0) return null;
  const h = 0.9 * spread * Math.pow(n, -0.2);

  // Bin the data once
  const nBins = Math.max(1, Math.round((hi - lo) / binWidth));
  const counts = new Array(nBins).fill(0);
  for (const x of vals) {
    const b = Math.min(nBins - 1, Math.max(0, Math.floor((x - lo) / binWidth)));
    counts[b]++;
  }
  const centers = counts.map((_, b) => lo + (b + 0.5) * binWidth);

  // Evaluate on a 200-point grid extended one bandwidth past the data
  const gLo = lo - h, gHi = hi + h;
  const xs = [], ys = [];
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  for (let i = 0; i <= 200; i++) {
    const gx = gLo + (gHi - gLo) * i / 200;
    let acc = 0;
    for (let b = 0; b < nBins; b++) {
      if (!counts[b]) continue;
      const z = (gx - centers[b]) / h;
      if (z > 6 || z < -6) continue; // kernel support cutoff
      acc += counts[b] * Math.exp(-0.5 * z * z);
    }
    xs.push(gx); ys.push(acc * norm);
  }
  return { xs, ys };
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
