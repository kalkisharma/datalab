// hypothesis.js — hypothesis tests and their p-value numerics
// (split from distributions.js at Phase 15 start — verbatim move, §6; the
// Phase 13 exit note called this split. The Data Scientist owns correctness;
// references per STANDARDS §20 come from published statistical tables.)
//
// p-values for t and F need the regularized incomplete beta I_x(a,b).
// Hand-written (zero dependencies, §8/§9): Lanczos log-gamma + the
// modified-Lentz continued fraction. References in tests come from
// PUBLISHED STATISTICAL TABLES (the §20 independent source): e.g.
// t(0.025,10) = 2.228 ⇒ two-tailed p(2.228, df 10) = 0.05;
// F(0.05; 3,10) = 3.708 ⇒ p = 0.05.
//
// Reporting rule (§20): a p-value is NEVER displayed without its effect
// size and per-group sample sizes — the callers in compare.js comply.

// Lanczos approximation, g = 7, n = 9 — standard coefficients
const _LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(z) {
  if (z < 0.5) { // reflection
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = _LANCZOS[0];
  for (let i = 1; i < 9; i++) x += _LANCZOS[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Continued fraction for I_x(a,b) — modified Lentz
function _betacf(x, a, b) {
  const EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;  if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Regularized incomplete beta I_x(a, b).
 * @param {number} x - 0..1
 * @param {number} a - > 0
 * @param {number} b - > 0
 * @returns {number}
 */
function regIncBeta(x, a, b) {
  if (!(a > 0) || !(b > 0)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta);
  // Evaluate the continued fraction on whichever side converges; the flip
  // is NON-recursive — a recursive 1 − I_{1−x}(b,a) loops forever exactly
  // at the symmetric boundary (x = 0.5, a = b), found by the I(0.5,2,2) test
  if (x < (a + 1) / (a + b + 2)) return front * _betacf(x, a, b) / a;
  return 1 - front * _betacf(1 - x, b, a) / b;
}

// Two-tailed p for Student's t: p = I_{df/(df+t²)}(df/2, 1/2)
function pTwoTailedT(t, df) {
  if (!Number.isFinite(t) || !(df > 0)) return NaN;
  return regIncBeta(df / (df + t * t), df / 2, 0.5);
}

// Upper-tail p for F(d1, d2): P(F > f) = I_{d2/(d2 + d1·f)}(d2/2, d1/2)
function pUpperF(f, d1, d2) {
  if (!Number.isFinite(f) || f < 0 || !(d1 > 0) || !(d2 > 0)) return NaN;
  return regIncBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

/**
 * Welch's t-test (unequal variances — the only variant offered, DS ruling).
 * Cohen's d uses the CLASSICAL POOLED SD ( √(((n1−1)s1²+(n2−1)s2²)/(n1+n2−2)) )
 * — documented choice; d_av and d_s differ only in pathological imbalance.
 * @param {number[]} xs - finite values, group 1 (n ≥ 2)
 * @param {number[]} ys - finite values, group 2 (n ≥ 2)
 * @returns {{ t, df, p, d, n1, n2, m1, m2, s1, s2 }|null}
 */
function tTestWelch(xs, ys) {
  const n1 = xs.length, n2 = ys.length;
  if (n1 < 2 || n2 < 2) return null;
  const m1 = xs.reduce((a, b) => a + b, 0) / n1;
  const m2 = ys.reduce((a, b) => a + b, 0) / n2;
  const v1 = xs.reduce((s, x) => s + (x - m1) ** 2, 0) / (n1 - 1);
  const v2 = ys.reduce((s, x) => s + (x - m2) ** 2, 0) / (n2 - 1);
  const se2 = v1 / n1 + v2 / n2;
  if (se2 === 0) return null; // both groups constant — no test
  const t = (m1 - m2) / Math.sqrt(se2);
  // Welch–Satterthwaite degrees of freedom
  const df = se2 * se2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  const sp = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  const d = sp === 0 ? NaN : (m1 - m2) / sp;
  return { t, df, p: pTwoTailedT(t, df), d,
           n1, n2, m1, m2, s1: Math.sqrt(v1), s2: Math.sqrt(v2) };
}

// ── Rank-based and paired tests (Phase 15) ────────────────────────────────
//
// p-values use the tie-corrected NORMAL APPROXIMATION with continuity
// correction — the approximation IS the documented definition (pre-impl
// review decision): test references are hand-derived from these formulas,
// with agreement-within-tolerance checks against published exact values at
// moderate n. Callers append "(normal approx.)" to the verdict whenever any
// group/pair count is below 10 — an unannounced approximate p is the
// naked-p failure family (§20).

// Standard normal CDF via the Abramowitz–Stegun 7.1.26 erf approximation
// (|ε| < 1.5e−7 — far below the 2-significant-digit p display precision)
function normalCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 +
              t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z / 2);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// Regularized incomplete gamma — series for x < s+1, Lentz continued
// fraction otherwise (same numerics family as regIncBeta above)
function _gammaPSeries(s, x) {
  let sum = 1 / s, term = sum;
  for (let k = 1; k < 500; k++) {
    term *= x / (s + k);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 3e-14) break;
  }
  return sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
}

function _gammaQCF(s, x) {
  const FPMIN = 1e-300;
  let b = x + 1 - s, c = 1 / FPMIN, d = 1 / b, h = d;
  for (let k = 1; k < 500; k++) {
    const an = -k * (k - s);
    b += 2;
    d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-14) break;
  }
  return h * Math.exp(-x + s * Math.log(x) - logGamma(s));
}

// Upper-tail p for chi-squared: P(χ²_df > x) = Q(df/2, x/2)
function pUpperChi2(x, df) {
  if (!Number.isFinite(x) || x < 0 || !(df > 0)) return NaN;
  const s = df / 2, hx = x / 2;
  if (hx === 0) return 1;
  return hx < s + 1 ? 1 - _gammaPSeries(s, hx) : _gammaQCF(s, hx);
}

/**
 * Average ranks (1-based) with the tie term Σ(t³−t) — the ONE ranker shared
 * by MWU, Kruskal–Wallis, and the signed-rank (pre-impl review: three
 * hand-rolled rankers would be three chances to disagree).
 * @param {number[]} vals
 * @returns {{ ranks: number[], tieSum: number }}
 */
function rankWithTies(vals) {
  const idx = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(vals.length);
  let tieSum = 0, i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // average of 1-based ranks i+1 … j+1
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    const t = j - i + 1;
    if (t > 1) tieSum += t * t * t - t;
    i = j + 1;
  }
  return { ranks, tieSum };
}

/**
 * Mann–Whitney U (2 groups, rank-based). U reported is min(U1, U2), the
 * tabled convention. r is the rank-biserial correlation r = 2·U1/(n1·n2) − 1
 * (positive when group 1 tends larger).
 * @param {number[]} xs - finite values, group 1 (n ≥ 2)
 * @param {number[]} ys - finite values, group 2 (n ≥ 2)
 * @returns {{ U, z, p, r, n1, n2 }|null}
 */
function mannWhitneyU(xs, ys) {
  const n1 = xs.length, n2 = ys.length;
  if (n1 < 2 || n2 < 2) return null;
  const { ranks, tieSum } = rankWithTies(xs.concat(ys));
  let R1 = 0;
  for (let i = 0; i < n1; i++) R1 += ranks[i];
  const U1 = R1 - n1 * (n1 + 1) / 2;
  const U = Math.min(U1, n1 * n2 - U1);
  const n = n1 + n2;
  const sigma2 = (n1 * n2 / 12) * ((n + 1) - tieSum / (n * (n - 1)));
  if (sigma2 <= 0) return null; // every pooled value identical — no ordering
  const z = (U - n1 * n2 / 2 + 0.5) / Math.sqrt(sigma2); // continuity corr.
  return { U, z, p: Math.min(1, 2 * normalCdf(z)),
           r: 2 * U1 / (n1 * n2) - 1, n1, n2 };
}

/**
 * Kruskal–Wallis (3+ groups, rank-based), tie-corrected H, p from the
 * chi-squared approximation. ε² = H/(N−1) is the effect size (0..1).
 * @param {number[][]} groups - each with ≥ 2 finite values, k ≥ 2
 * @returns {{ H, df, p, eps2 }|null}
 */
function kruskalWallis(groups) {
  const k = groups.length;
  if (k < 2 || groups.some(g => g.length < 2)) return null;
  const all = [];
  for (const grp of groups) all.push(...grp);
  const N = all.length;
  const { ranks, tieSum } = rankWithTies(all);
  let H = 0, off = 0;
  for (const grp of groups) {
    let R = 0;
    for (let i = 0; i < grp.length; i++) R += ranks[off + i];
    H += R * R / grp.length;
    off += grp.length;
  }
  H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
  const C = 1 - tieSum / (N * N * N - N); // tie correction divisor
  if (C <= 0) return null; // every pooled value identical
  H /= C;
  return { H, df: k - 1, p: pUpperChi2(H, k - 1), eps2: H / (N - 1) };
}

/**
 * Paired t on the differences x−y (index-aligned complete pairs only —
 * the caller drops incomplete pairs and reports the count).
 * dz = mean(diff)/sd(diff) is the paired effect size.
 * @param {number[]} xs
 * @param {number[]} ys - same length
 * @returns {{ t, df, p, dz, n }|null}
 */
function pairedT(xs, ys) {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const d = xs.map((x, i) => x - ys[i]);
  const m = d.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
  if (sd === 0) return null; // constant difference — no variability to test
  const t = m / (sd / Math.sqrt(n));
  return { t, df: n - 1, p: pTwoTailedT(t, n - 1), dz: m / sd, n };
}

/**
 * Wilcoxon signed-rank. Zero differences are DROPPED before ranking (the
 * standard convention — matches published tables; pre-impl decision);
 * nZero reports how many. W reported is min(W+, W−), the tabled convention.
 * r is the matched-pairs rank-biserial r = (W+ − W−)/(n(n+1)/2)
 * (positive when x tends larger than y).
 * @param {number[]} xs
 * @param {number[]} ys - same length
 * @returns {{ W, z, p, r, n, nZero }|null}
 */
function wilcoxonSignedRank(xs, ys) {
  if (xs.length !== ys.length) return null;
  const diffs = [];
  let nZero = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - ys[i];
    if (d === 0) { nZero++; continue; }
    diffs.push(d);
  }
  const n = diffs.length;
  if (n < 2) return null;
  const { ranks, tieSum } = rankWithTies(diffs.map(Math.abs));
  let Wplus = 0;
  for (let i = 0; i < n; i++) if (diffs[i] > 0) Wplus += ranks[i];
  const Wtot = n * (n + 1) / 2;
  const W = Math.min(Wplus, Wtot - Wplus);
  const sigma2 = n * (n + 1) * (2 * n + 1) / 24 - tieSum / 48;
  if (sigma2 <= 0) return null; // all |diffs| tied at one value AND n tiny
  const z = (W - Wtot / 2 + 0.5) / Math.sqrt(sigma2); // continuity corr.
  return { W, z, p: Math.min(1, 2 * normalCdf(z)),
           r: (2 * Wplus - Wtot) / Wtot, n, nZero };
}

/**
 * One-way ANOVA. η² = SSB/SST.
 * @param {number[][]} groups - each with ≥ 2 finite values, k ≥ 2
 * @returns {{ F, dfb, dfw, p, eta2, groups: {n, mean, sd}[] }|null}
 */
function anovaOneWay(groups) {
  const k = groups.length;
  if (k < 2 || groups.some(g => g.length < 2)) return null;
  const ns = groups.map(g => g.length);
  const N = ns.reduce((a, b) => a + b, 0);
  const means = groups.map(g => g.reduce((a, b) => a + b, 0) / g.length);
  const grand = groups.flat().reduce((a, b) => a + b, 0) / N;
  let ssb = 0, ssw = 0;
  for (let i = 0; i < k; i++) {
    ssb += ns[i] * (means[i] - grand) ** 2;
    for (const x of groups[i]) ssw += (x - means[i]) ** 2;
  }
  const dfb = k - 1, dfw = N - k;
  if (ssw === 0) return null; // all groups constant — F undefined
  const F = (ssb / dfb) / (ssw / dfw);
  return {
    F, dfb, dfw, p: pUpperF(F, dfb, dfw), eta2: ssb / (ssb + ssw),
    groups: groups.map((g, i) => ({
      n: ns[i], mean: means[i],
      sd: Math.sqrt(g.reduce((s, x) => s + (x - means[i]) ** 2, 0) / (ns[i] - 1)),
    })),
  };
}
