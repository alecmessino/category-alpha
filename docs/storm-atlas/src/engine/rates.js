/* The conditioned rates, transliterated from scripts/genesis/retrieval/analogs.py.
 *
 * This is the half Phase 1 refused. The Atlas answered "which storms formed here and where did
 * they go" and returned UNSCOREABLE -- REQUIRES CANONICAL COMPUTATION wherever a rate belonged,
 * because a rate the browser computed a cheaper way is not a smaller version of the archive's
 * answer, it is a different answer wearing its clothes. Nothing here is cheaper. `_rate` at
 * analogs.py:370, `wilson_interval` at :202 and `_pct` at :187 are reproduced operation for
 * operation, and scripts/test-atlas-parity.mjs compares the results field by field.
 *
 * THE FOUR RULES THIS FILE EXISTS TO KEEP (analogs.py:14-30)
 *   1. A rate is refused below min_sample. Counts are always returned.
 *   2. The sample is STORMS, not track points.
 *   3. Effective sample size is published beside every rate, and the gate is applied to the RAW
 *      distinct-storm count, never to the flattering ESS.
 *   4. An absent outcome is not a zero -- unknowns leave the denominator and are counted.
 *
 * AND A FIFTH, WHICH IS THIS BUILD'S OWN -- see `circularOutcomes` below.
 */

import { percentile, wilsonInterval } from "./stats.js";

/**
 * A count, and a rate only when the sample earns one. Port of `_rate` (analogs.py:370).
 *
 * The refusal reason is the archive's own string, character for character, because the surface
 * prints it verbatim: a reason that drifts between the two implementations would be a second
 * methodology announcing itself in prose.
 *
 * `memberIds` IS THE NUMERATOR'S IDENTITIES, AND IT ARRIVES HERE FOR ONE REASON: this is the
 * call that publishes `count`, so it is the only place the two cannot drift apart. The caller
 * collects them inside the same branch that increments the count -- see scoreCases -- and
 * nothing downstream may reconstruct them from a threshold, a region or a rate. `null` means
 * the caller did not ask for them; `[]` means the numerator is genuinely empty, and the two are
 * different statements about the archive.
 */
export function rateResult(count, nKnown, nUnknown, minSample, weightedNum, weightedDen,
  memberIds = null) {
  if (nKnown < minSample) {
    return {
      n_storms: nKnown,
      n_unknown: nUnknown,
      count,
      rate: null,
      weighted_rate: null,
      ci95: null,
      refused_reason: `${nKnown} storms with a known outcome < min_sample=${minSample}`,
      /* A REFUSED CELL KEEPS ITS IDENTITIES, because it keeps its count. The rate is what the
         sample did not earn; the events behind it are observed events, and "which storms" is
         answerable whether or not a percentage is. */
      member_ids: memberIds,
    };
  }
  return {
    n_storms: nKnown,
    n_unknown: nUnknown,
    count,
    rate: count / nKnown,
    weighted_rate: weightedDen > 0 ? weightedNum / weightedDen : null,
    ci95: wilsonInterval(count, nKnown),
    refused_reason: null,
    member_ids: memberIds,
  };
}

/** Port of `dist` (analogs.py:694): NaN and null dropped, then five linear-interpolated
 *  quantiles over what remains. `n` is the count of USABLE values, not of cases. */
export function timeDistribution(values) {
  const v = [];
  for (const x of values) {
    if (x === null || x === undefined) continue;
    if (typeof x !== "number" || Number.isNaN(x)) continue;
    v.push(x);
  }
  return {
    n: v.length,
    p10: percentile(v, 0.10),
    p25: percentile(v, 0.25),
    median: percentile(v, 0.50),
    p75: percentile(v, 0.75),
    p90: percentile(v, 0.90),
  };
}

/* ---- THE FIFTH RULE ---------------------------------------------------------------------
 *
 * A VARIABLE USED TO DEFINE A COHORT CANNOT BE REPORTED AS AN OUTCOME OF THAT COHORT.
 *
 * The archive's own four rules protect against sampling error. This one protects against a
 * question that cannot be asked. Condition a cohort on "reached Cat 3" and then ask what
 * fraction reached Cat 3, and the answer is 100% with a tight Wilson interval: arithmetically
 * flawless, completely circular, and indistinguishable on screen from a finding.
 *
 * It is not a hazard the Atlas has today, which is exactly why it is being closed now. The
 * shell keeps the two query surfaces apart by hand -- ui/atlas.jsx passes months, season,
 * basins and provisional into getAnalogs and pointedly not intensity or landfall. That
 * separation is load-bearing and it stops working the moment one cohort spec drives both, which
 * is what Phase 3 builds. Enforcing it in the UI would mean the engine still computes a
 * circular number and merely declines to draw it; enforced here, the number does not exist.
 *
 * WHAT IS AND IS NOT CIRCULAR, precisely:
 *   - conditioning on minPeak=cat3 makes every threshold AT OR BELOW cat3 circular. cat4 and
 *     cat5 remain genuine outcomes WITHIN the conditioned cohort and are still reported.
 *   - conditioning on a landfall region makes that region's `any` contract circular. Its
 *     `hurricane` contract is a real outcome among storms that came ashore there -- unless the
 *     condition itself required hurricane intensity, which makes both circular.
 *   - other regions are untouched.
 *   - TIME-TO-EVENT IS NEVER CIRCULAR. If every storm in the cohort reached Cat 3, the rate is
 *     a tautology but WHEN they reached it is a real distribution. Suppressing it would discard
 *     the most useful thing a conditioned cohort has to say.
 */

/** Thresholds in the archive's own ladder order, so "at or below" is an index comparison. */
const LADDER = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];

/**
 * Which outcome keys a conditioning spec makes circular.
 *
 * @param conditionedOn {{minPeak?: string|null, landfallRegion?: string|null,
 *                        landfallHurricaneOnly?: boolean}}
 * @returns {{intensity: Set<string>, landfall: Set<string>}} keys that must refuse.
 *          Landfall keys are "region:any" / "region:hurricane".
 */
export function circularOutcomes(conditionedOn) {
  const out = { intensity: new Set(), landfall: new Set() };
  if (!conditionedOn) return out;

  const { minPeak = null, landfallRegion = null, landfallHurricaneOnly = false } = conditionedOn;

  if (minPeak) {
    const at = LADDER.indexOf(minPeak);
    if (at < 0) {
      throw new Error(
        `conditionedOn.minPeak='${minPeak}' is not one of ${LADDER.join(", ")} -- refusing ` +
        "rather than guessing which threshold was meant, because a mis-parsed condition would " +
        "silently publish a circular rate as a real one.");
    }
    for (let i = 0; i <= at; i++) out.intensity.add(LADDER[i]);
  }

  if (landfallRegion) {
    out.landfall.add(`${landfallRegion}:any`);
    if (landfallHurricaneOnly) out.landfall.add(`${landfallRegion}:hurricane`);
  }
  return out;
}

/** The refusal a circular outcome renders instead of a rate. Counts survive -- they are facts
 *  about the cohort; only the RATE is meaningless, and the reason says which condition did it. */
export function circularRefusal(count, nStorms, nUnknown, because, memberIds = null) {
  return {
    n_storms: nStorms,
    n_unknown: nUnknown,
    count,
    rate: null,
    weighted_rate: null,
    ci95: null,
    refused_reason: null,
    /* AND SO DOES A CIRCULAR ONE. Every storm in the cohort carries this outcome by
       construction, so the identities are the cohort's -- which is exactly why the RATE is
       refused and the COUNT is not. */
    member_ids: memberIds,
    conditioned_on: because,
    status: "CONDITIONED ON -- NOT AN OUTCOME",
    reason:
      `This cohort was defined by ${because}, so every storm in it carries this outcome by ` +
      "construction. The count is real; a rate would be 100% because of how the question was " +
      "asked, not because of anything the record says. Remove that condition to make this an " +
      "outcome again.",
  };
}
