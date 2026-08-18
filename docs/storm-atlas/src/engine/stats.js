/* The statistics, transliterated from scripts/genesis/schema.py and retrieval/analogs.py.
 *
 * Nothing here is an approximation of the archive's method and nothing here is faster than it.
 * Where a browser implementation could be cheaper by being looser, it is not: a rate the Atlas
 * shows must be the rate the archive would publish, or the Atlas must decline to show it.
 */

/** Saffir-Simpson thresholds in knots. The definitions every threshold question is answered
 *  against, in one place -- scripts/genesis/schema.py:37. */
export const THRESHOLDS_KT = {
  td: 0, // a depression has a closed circulation, not a wind threshold
  ts: 34,
  cat1: 64,
  cat2: 83,
  cat3: 96,
  cat4: 113,
  cat5: 137,
};

export const CATEGORIES = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];

/** A contract needs this many distinct storms carrying the outcome, ARCHIVE-WIDE, before any
 *  skill claim about it is possible -- analogs.py:116. */
export const MIN_EVENTS_FOR_SKILL = 10;

/**
 * Saffir-Simpson bucket for a wind speed, or null when there is no wind value.
 *
 * Returns null rather than 'td' for a missing value: a storm whose intensity was never
 * recorded is not a depression, it is unknown, and the difference matters when the archive is
 * asked what fraction reached a threshold.
 */
export function categoryFor(vmaxKt) {
  if (vmaxKt === null || vmaxKt === undefined || Number.isNaN(vmaxKt)) return null;
  const v = Number(vmaxKt);
  if (!Number.isFinite(v)) return null;
  if (v >= THRESHOLDS_KT.cat5) return "cat5";
  if (v >= THRESHOLDS_KT.cat4) return "cat4";
  if (v >= THRESHOLDS_KT.cat3) return "cat3";
  if (v >= THRESHOLDS_KT.cat2) return "cat2";
  if (v >= THRESHOLDS_KT.cat1) return "cat1";
  if (v >= THRESHOLDS_KT.ts) return "ts";
  return "td";
}

/**
 * Wilson score interval -- published beside every rate.
 *
 * Chosen over the textbook normal interval because analog samples are small and outcomes are
 * often near 0 or 1, exactly where the normal interval produces bounds outside [0,1] and
 * quietly implies a precision the sample cannot support.
 *
 * Uses only multiplication, division and sqrt, all of which IEEE-754 specifies exactly, so
 * this agrees with the Python bit for bit rather than approximately.
 */
export function wilsonInterval(k, n, z = 1.96) {
  if (n <= 0) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0.0, centre - half), Math.min(1.0, centre + half)];
}

/**
 * Kish's effective sample size, (sum w)^2 / sum(w^2).
 *
 * Distance weighting means 40 analogs can carry the information of 12. This makes that
 * visible. THE SAMPLE GATE IS NEVER APPLIED TO IT: min_sample is checked against the raw
 * distinct-storm count, so a flattering ESS can never unlock a rate -- analogs.py:24-27.
 */
export function kishEss(weights) {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i];
    sumSq += weights[i] * weights[i];
  }
  return sumSq > 0 ? (sum * sum) / sumSq : 0.0;
}

/**
 * Linear-interpolated quantile, matching analogs.py:187 exactly -- including its use of
 * Math.floor on the fractional position and its clamp of the upper index.
 */
export function percentile(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return Number(s[0]);
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, s.length - 1);
  const frac = pos - lo;
  return s[lo] * (1 - frac) + s[hi] * frac;
}
