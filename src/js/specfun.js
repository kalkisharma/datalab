// specfun.js — special functions backing the p-values
// (split from hypothesis.js at Phase 15 — §6: the file crossed the trigger
// the day it was created; the CDF numerics are the cohesive half. Lanczos
// log-gamma, regularized incomplete beta (Lentz CF), regularized incomplete
// gamma (series + Lentz CF), and the A–S 7.1.26 normal CDF.)
//
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

// ── Inverse normal CDF (probit) — Acklam's rational approximation ──────────
// Φ⁻¹(p): the theoretical-quantile axis of the Q–Q plot (Phase 19) and the
// df→∞ limit of the t quantile. Acklam's raw relative error is < 1.15e-9 over
// the whole open interval — BETTER than our A–S 7.1.26 normalCdf (|ε| < 1.5e-7),
// so we deliberately do NOT Halley-refine against normalCdf (that would drag the
// result toward the coarser forward map). References are hand-taken from
// published normal quantiles (§20): Φ⁻¹(0.975)=1.9599639845, Φ⁻¹(0.75)=0.6744897502.
const _ACK_A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const _ACK_B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const _ACK_C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const _ACK_D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

function normalInv(p) {
  if (!(p > 0) || !(p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN; // p ∉ [0,1] (or NaN)
  }
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {                        // lower tail
    q = Math.sqrt(-2 * Math.log(p));
    return (((((_ACK_C[0] * q + _ACK_C[1]) * q + _ACK_C[2]) * q + _ACK_C[3]) * q + _ACK_C[4]) * q + _ACK_C[5]) /
           ((((_ACK_D[0] * q + _ACK_D[1]) * q + _ACK_D[2]) * q + _ACK_D[3]) * q + 1);
  }
  if (p <= pHigh) {                      // central region
    q = p - 0.5; r = q * q;
    return (((((_ACK_A[0] * r + _ACK_A[1]) * r + _ACK_A[2]) * r + _ACK_A[3]) * r + _ACK_A[4]) * r + _ACK_A[5]) * q /
           (((((_ACK_B[0] * r + _ACK_B[1]) * r + _ACK_B[2]) * r + _ACK_B[3]) * r + _ACK_B[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));   // upper tail
  return -(((((_ACK_C[0] * q + _ACK_C[1]) * q + _ACK_C[2]) * q + _ACK_C[3]) * q + _ACK_C[4]) * q + _ACK_C[5]) /
          ((((_ACK_D[0] * q + _ACK_D[1]) * q + _ACK_D[2]) * q + _ACK_D[3]) * q + 1);
}

// ── Student's t inverse quantile — bisection on the two-tailed CDF ─────────
// tQuantile(c, df): the value t* > 0 with P(T ≤ t*) = c (c ∈ (0.5,1)). No new
// approximation — bisect the EXISTING pTwoTailedT, which is P(|T| > t) and
// strictly decreasing in t for t > 0. THE TRAP: the 97.5% point corresponds to
// two-tailed p = 2·(1−c) = 0.05, NOT 0.025. Used for CI/PI bands (df = n−2).
// df→∞ → normalInv(c); references: t(0.975,10)=2.228, t(0.975,1)=12.706 (§20).
function tQuantile(c, df) {
  if (!(df > 0) || !(c > 0.5) || !(c < 1)) return NaN;
  if (df > 1e7) return normalInv(c); // asymptotic limit; also dodges regIncBeta at extreme a
  const target = 2 * (1 - c); // two-tailed p for the upper point
  let lo = 0, hi = 2;
  while (pTwoTailedT(hi, df) > target && hi < 1e12) hi *= 2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    // pTwoTailedT decreasing: p(mid) > target ⇒ root is to the right
    if (pTwoTailedT(mid, df) > target) lo = mid; else hi = mid;
    if (hi - lo < 1e-11 * (1 + hi)) break;
  }
  return (lo + hi) / 2;
}

