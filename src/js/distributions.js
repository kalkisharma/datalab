// distributions.js — distribution fitting and density estimation
// (split from stats.js at the Phase 11 exit refactor review — verbatim move.
// The Data Scientist owns correctness; references per STANDARDS §20.)

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
