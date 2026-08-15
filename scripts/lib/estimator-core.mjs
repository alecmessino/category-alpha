/* THE ESTIMATOR CORE.
 *
 * Moved here verbatim from scripts/fetch-data.mjs so the live board and the historical
 * backtest call the SAME function. A backtest against a parallel replica validates a model
 * nobody is trading: the two drift, and the score keeps looking fine.
 *
 * NOTHING IN THIS FILE WAS EDITED IN THE MOVE — not the math, not GUIDANCE_TILT, not
 * GUIDANCE_SIGN, not a line of formatting. scripts/verify-extraction.mjs proves it against
 * outputs captured before the move, field by field, requiring exact equality.
 */
const INTENSITY_MAE = { 0: 0, 12: 5.5, 24: 7.5, 36: 9.0, 48: 10.0, 72: 11.5, 96: 12.5, 120: 13.5 };
const HURRICANE_REPORTED_KT = 65;
const KT_INCREMENT = 5;
const LATENT_THRESHOLD = HURRICANE_REPORTED_KT - KT_INCREMENT / 2;   // 62.5
/* How far the answer moves if the error width is wrong. The published MAE is an
   unconditional, mostly-Atlantic figure being applied to a Pacific storm forecast to
   intensify — both of which argue the true spread is wider here — so the band is
   asymmetric and reported alongside the point rather than instead of it. */
const SIGMA_BAND = { tight: 0.8, wide: 1.6 };

/* ---- the guidance-envelope tilt ----------------------------------------------
 * The Tropical Cyclone Discussion states where the forecaster placed the official
 * intensity forecast inside the guidance envelope. For Lala on 14 Aug it is "remains near
 * the upper end of the guidance envelope". P(reaches hurricane) is computed FROM that
 * official forecast, so when the forecast sits at the top of the aids, the estimate
 * inherits that position and reading it as a central estimate overstates the answer.
 *
 * This is the one place on the board where a piece of prose moves a number, so the rule
 * it follows is narrow and stated here rather than inferred:
 *
 *   - It moves the estimate in the DIRECTION the forecaster stated, and only that.
 *   - Its SIZE is a fraction of the forecast's own published mean absolute error at the
 *     relevant lead time, so the adjustment scales with how uncertain that forecast
 *     already is instead of being an absolute number of knots invented here.
 *   - The fraction itself is an OPERATOR SETTING. It is not observed and there is no feed
 *     that could produce it: NHC publishes the position in words, never a magnitude. It is
 *     declared, small, and registered in claims.js under the "operator" owner, which is
 *     exactly the owner class for a number a human asserted.
 *   - The unadjusted estimate is always published alongside, and the reported band is
 *     widened to contain it, so the adjustment can never move the answer somewhere the
 *     unadjusted arithmetic does not reach.
 *
 * A quarter of one MAE is roughly a fifth of a category step at day-three lead times: big
 * enough to matter at the margin, too small to manufacture an edge on its own. Anything
 * larger would be asserting knowledge of the envelope's width, which we do not have. */
const GUIDANCE_TILT = 0.25;
const GUIDANCE_SIGN = { above: -1, below: +1, with: 0 };

function maeAt(hr) {
  const keys = Object.keys(INTENSITY_MAE).map(Number).sort((a, b) => a - b);
  if (hr <= keys[0]) return INTENSITY_MAE[keys[0]];
  for (let i = 1; i < keys.length; i++) {
    if (hr <= keys[i]) {
      const a = keys[i - 1], b = keys[i];
      return INTENSITY_MAE[a] + (INTENSITY_MAE[b] - INTENSITY_MAE[a]) * ((hr - a) / (b - a));
    }
  }
  return INTENSITY_MAE[keys[keys.length - 1]];
}

// Standard normal CDF via erf, good to ~1e-7 — no library available in this runtime.
function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/* trackPoints must carry kt. Returns null — never a number — when the forecast cannot
   answer the question, because silence is better than a probability with no forecast
   under it. */
function reachesHurricaneP(points, threshold, guidance) {
  const reported = threshold || HURRICANE_REPORTED_KT;
  const thr = threshold ? threshold - KT_INCREMENT / 2 : LATENT_THRESHOLD;
  if (!Array.isArray(points) || !points.length) return null;
  const withKt = points.filter((p) => p && Number.isFinite(p.kt) && p.kt > 0);
  if (!withKt.length) return null;

  const current = withKt.find((p) => p.hr === 0 || p.initial) || null;
  // Already there: the question is settled by observation, subject only to the analysis
  // uncertainty in that observation.
  if (current && current.kt >= thr) {
    const pNow = Math.min(0.99, normCdf((current.kt - thr) / (5 * Math.sqrt(Math.PI / 2))));
    return { p: pNow, pLow: pNow, pHigh: pNow,
      peakKt: current.kt, peakHr: 0, sigma: 5, already: true,
      basis: `already carried at ${current.kt} kt in the current advisory, at or above the ${reported} kt`
           + ` hurricane threshold — the question is settled by the classification, not forecast` };
  }

  /* The peak of the forecast, evaluated at its own lead time's error.
     This is the perfectly-correlated limit and it is the principled one. Intensity errors
     at adjacent lead times are close to a single common error rather than independent
     draws, so if one error epsilon shifts the whole curve, then max_t V(t) = Vmax + eps
     and P(ever reaching the threshold) = P(eps >= thr - Vmax) exactly.
     Two treatments were rejected on the way here. Multiplying independent per-period
     probabilities assumes errors that are not independent and comes out far too high.
     Scoring every point and keeping the best comes out too high a different way: it
     cherry-picks whichever lead time happens to be luckiest, and because a wider error
     RAISES the probability whenever the forecast already sits above the threshold, that
     rule systematically rewards the least reliable point on the curve. Wider uncertainty
     is not evidence. */
  const tallest = withKt.reduce((a, b) => (b.kt > a.kt ? b : a), withKt[0]);
  const mae = maeAt(tallest.hr);
  const sigma = Math.max(1e-6, mae * Math.sqrt(Math.PI / 2));
  const clamp = (v) => Math.max(0.01, Math.min(0.99, v));
  const at = (kt, mult) => clamp(normCdf((kt - thr) / (sigma * mult)));

  /* The forecaster's placement of this forecast inside the guidance envelope, applied as
     a displacement of the peak by a declared fraction of that lead time's own error.
     Absent, unclassified, or "with the consensus" all leave the estimate untouched. */
  const pos = guidance && GUIDANCE_SIGN[guidance.position] != null ? guidance.position : null;
  const sign = pos ? GUIDANCE_SIGN[pos] : 0;
  const shiftKt = sign * GUIDANCE_TILT * mae;
  const effKt = tallest.kt + shiftKt;

  const raw = at(tallest.kt, 1);
  const p = at(effKt, 1);
  /* A narrower error moves the answer AWAY from a half, in whichever direction the
     forecast already points; a wider one pulls it toward a half. So the band is not
     symmetric about the point and its ends are sorted rather than assumed.
     The UNADJUSTED estimate is forced inside the band: an adjustment that could push the
     published answer outside the range the plain arithmetic reaches would be doing more
     than tilting, and this is a tilt. */
  const ends = [at(effKt, SIGMA_BAND.tight), at(effKt, SIGMA_BAND.wide), raw].sort((a, b) => a - b);
  const adjustment = sign
    ? { position: pos, shiftKt: Math.round(shiftKt * 10) / 10, tiltOfMae: GUIDANCE_TILT,
        raw, delta: Math.round((p - raw) * 1000) / 1000, quote: (guidance && guidance.quote) || null }
    : null;
  return {
    p, raw, pLow: ends[0], pHigh: ends[ends.length - 1], adjustment,
    peakKt: tallest.kt, peakHr: tallest.hr, sigma, mae, already: false,
    basis: `official forecast peaks at ${tallest.kt} kt at ${tallest.hr}h; NHC's published mean absolute`
         + ` intensity error there is ${mae.toFixed(1)} kt, and reported intensities come in 5 kt steps`
         + ` so ${reported} kt needs ${thr} kt of latent wind —`
         + ` ${Math.round(p * 100)}% central, ${Math.round(ends[0] * 100)}-${Math.round(ends[ends.length - 1] * 100)}%`
         + ` across a plausible range of error widths`
         + (sign ? `; NHC places this forecast ${pos} the guidance envelope, so the peak is read`
                 + ` ${Math.abs(shiftKt).toFixed(1)} kt ${sign < 0 ? "lower" : "higher"}`
                 + ` (${Math.round(raw * 100)}% unadjusted)` : ""),
  };
}

export { INTENSITY_MAE, HURRICANE_REPORTED_KT, KT_INCREMENT, LATENT_THRESHOLD,
         SIGMA_BAND, GUIDANCE_TILT, GUIDANCE_SIGN, maeAt, normCdf, reachesHurricaneP };
/* Re-exported so a caller has one import surface for the estimator. These already live in
   atcf.mjs and are NOT moved — four modules import them from there. */
export { parseAdeck, consensusFrom, parseBestTrack } from "./atcf.mjs";
