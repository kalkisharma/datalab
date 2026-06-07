// hypothesis.js — hypothesis tests: Welch t, one-way ANOVA, Mann–Whitney U,
// Kruskal–Wallis, paired t, Wilcoxon signed-rank
// (split from distributions.js at Phase 15 start — §6, the split the
// Phase 13 exit note called; CDF numerics split onward to specfun.js the
// same phase. The Data Scientist owns correctness; references per
// STANDARDS §20 come from published statistical tables and hand-derived
// formula cases — see comparison.spec.js header.)
//
// Reporting rule (§20): a p-value is NEVER displayed without its effect
// size and per-group sample sizes — the callers in compare.js comply.

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

// ── Rank-based and paired tests (Phase 15) ────────────────────────────────
//
// p-values use the tie-corrected NORMAL APPROXIMATION with continuity
// correction — the approximation IS the documented definition (pre-impl
// review decision): test references are hand-derived from these formulas,
// with agreement-within-tolerance checks against published exact values at
// moderate n. Callers append "(normal approx.)" to the verdict whenever any
// group/pair count is below 10 — an unannounced approximate p is the
// naked-p failure family (§20).

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
