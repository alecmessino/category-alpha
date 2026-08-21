/* WHAT CHANGED, BY HOW MUCH, RELATIVE TO WHAT, AND WHETHER THE EVIDENCE DISTINGUISHES IT.
 *
 * This is the what-if layer. A reader adds a condition and the outcome distribution moves; the
 * only question that matters next is whether the move is the archive speaking or the sample
 * shrinking. Four answers, and the reader should have to work for none of them.
 *
 * THE HONESTY CONSTRAINT THAT DECIDES EVERY WORD BELOW.
 * Comparing two Wilson intervals for overlap is a WEAK heuristic. It is not a hypothesis test,
 * this build runs no hypothesis test, and the words "significant", "not significant" and "p"
 * are terms of art for a test that is not being run -- so they appear nowhere in this file, in
 * any surface that reads it, or in the built bundle, and a gate asserts that. Two statements
 * are permitted:
 *
 *   intervals overlap  -> the samples do not separate these two rates
 *   intervals disjoint -> the samples separate these two rates
 *
 * Neither says anything about truth, cause, or probability of a difference. They say what the
 * samples can and cannot distinguish, which is all an interval can say.
 *
 * AND THE HARDER CAVEAT, WHICH MOST TOOLS OMIT. The default baseline is the PARENT cohort, and
 * a parent CONTAINS its child: the same storms appear on both sides. These are not two
 * independent estimates, and interval comparison between nested samples is weaker still --
 * weaker than the already-weak independent case, because shared storms drag the two rates
 * toward each other. So the relationship between the two populations is computed rather than
 * assumed, published beside the numbers, and named in words. A comparison that hides its own
 * nesting is a comparison that flatters itself.
 *
 * WHAT IS NOT COMPARED, AND WHY. Time-to-event distributions are not differenced here. A shift
 * in a median hour is easy to render and hard to qualify -- the archive publishes p25/p50/p75
 * and no interval on the median -- so a delta on it would be exactly the bare number this
 * repository refuses everywhere else. Counts and quantiles are shown for both cohorts side by
 * side instead, and the reader compares them knowing what they are.
 */

import { cohortResult, conditionsOf, parentOf } from "./cohort.js";

/** Neither rate exists, so no comparison exists. Distinct from "no difference". */
export const NO_COMPARISON = "NO COMPARISON";
/** Both rates exist and their 95% intervals overlap. */
export const NOT_SEPARATED = "SAMPLES DO NOT SEPARATE";
/** Both rates exist and their 95% intervals do not overlap. */
export const SEPARATED = "SAMPLES SEPARATE";

/**
 * Compare a cohort against a baseline, computing both.
 *
 * @param archive
 * @param spec            the cohort
 * @param baselineSpec    the baseline; defaults to the PARENT -- this cohort with its last
 *                        condition removed. Passed explicitly rather than derived inside, so a
 *                        user-pinned baseline is a different argument and not a rewrite.
 */
export function compare(archive, spec, baselineSpec) {
  const base = baselineSpec || parentOf(spec);
  if (!base) return null;
  return compareResults(cohortResult(archive, spec), cohortResult(archive, base),
    { changedKey: changedKeyOf(spec, base) });
}

/**
 * The same comparison over results already computed. This is what the UI calls: the shell
 * already holds both cohorts, and scoring them twice to compare them would double the cost of
 * every chip click for no new information.
 *
 * @returns {{changed, cohort, baseline, relation, intensity, landfall}}
 */
export function compareResults(cohort, baseline, { changedKey = null } = {}) {
  if (!cohort || !baseline) return null;
  const relation = relate(cohort, baseline);
  const changed = describeChange(cohort.spec, baseline.spec, changedKey);

  const intensity = {};
  for (const k of Object.keys(cohort.intensity)) {
    intensity[k] = delta(cohort.intensity[k], baseline.intensity[k]);
  }
  const landfall = {};
  for (const region of Object.keys(cohort.landfall)) {
    const b = baseline.landfall[region];
    landfall[region] = {
      any: delta(cohort.landfall[region].any, b ? b.any : null),
      hurricane: delta(cohort.landfall[region].hurricane, b ? b.hurricane : null),
    };
  }
  return { changed, cohort, baseline, relation, intensity, landfall };
}

/**
 * One contract, compared.
 *
 * @returns {{verdict, rate, baseRate, deltaPp, direction, overlap, why, statement}}
 *   `deltaPp` is in PERCENTAGE POINTS, never a ratio: "the rate rose from 4% to 8%" is +4 points
 *   and also a doubling, and the second framing makes a two-storm difference sound like a
 *   finding. Points are the honest unit for a rate difference.
 */
export function delta(cell, baseCell) {
  const out = {
    verdict: NO_COMPARISON, rate: null, baseRate: null, deltaPp: null, direction: null,
    overlap: null, why: null, statement: null,
    n: cell ? cell.n_storms : null, baseN: baseCell ? baseCell.n_storms : null,
  };
  if (!cell || !baseCell) { out.why = "the baseline does not report this contract"; return out; }

  /* A refusal on either side is not a difference of zero. It is the absence of one of the two
     numbers a difference is made of, and it is reported as such with the reason that produced
     it -- so the reader sees WHICH side could not answer. */
  if (cell.status || baseCell.status) {
    out.why = cell.status
      ? "this cohort is conditioned on this outcome, so it has no rate to compare"
      : "the baseline is conditioned on this outcome, so it has no rate to compare";
    return out;
  }
  if (cell.rate === null || baseCell.rate === null) {
    out.why = cell.rate === null
      ? `this cohort's rate is refused — ${cell.refused_reason}`
      : `the baseline's rate is refused — ${baseCell.refused_reason}`;
    return out;
  }

  out.rate = cell.rate;
  out.baseRate = baseCell.rate;
  out.deltaPp = 100 * (cell.rate - baseCell.rate);
  out.direction = out.deltaPp > 0 ? "higher" : out.deltaPp < 0 ? "lower" : "identical";

  const a = cell.ci95;
  const b = baseCell.ci95;
  if (!a || !b) { out.why = "one side publishes no interval"; return out; }
  out.overlap = a[0] <= b[1] && b[0] <= a[1];
  out.verdict = out.overlap ? NOT_SEPARATED : SEPARATED;
  out.statement = out.overlap
    ? `${Math.abs(out.deltaPp).toFixed(1)} points ${out.direction}, but the intervals overlap — `
      + "these samples do not separate the two rates"
    : `${Math.abs(out.deltaPp).toFixed(1)} points ${out.direction}, and the intervals do not `
      + "overlap — these samples separate the two rates";
  return out;
}

/* ---- how the two populations are related ------------------------------------------------- */

/**
 * Nested, overlapping, or disjoint -- MEASURED, not assumed.
 *
 * Dropping a condition almost always widens the population, so the baseline almost always
 * contains the cohort. Almost: dropping `includeProvisional` REMOVES the provisional seasons,
 * so that one baseline is a subset instead. Asserting containment would be right most of the
 * time, and a comparison that is right most of the time about whether its own samples are
 * independent is not one this archive should publish.
 */
export function relate(cohort, baseline) {
  const inBase = new Set(baseline.rows);
  let shared = 0;
  for (const r of cohort.rows) if (inBase.has(r)) shared++;
  const kind = shared === cohort.rows.length && baseline.rows.length > cohort.rows.length
    ? "baseline contains this cohort"
    : shared === baseline.rows.length && cohort.rows.length > baseline.rows.length
      ? "this cohort contains the baseline"
      : shared === 0 ? "the two populations share no storms"
        : shared === cohort.rows.length && shared === baseline.rows.length
          ? "the two populations are the same storms"
          : "the two populations partly overlap";
  return {
    kind,
    shared,
    n: cohort.rows.length,
    baseN: baseline.rows.length,
    independent: shared === 0,
    /* The sentence that keeps the interval comparison from being read as a test. Stated for
       every relation, because "these share no storms" is as load-bearing as "these are nested" --
       it is the only case where the two estimates are actually independent. */
    note: shared === 0
      ? "These two populations share no storms, so the rates are independent estimates. The "
        + "interval comparison below is still a reading aid rather than a test."
      : `${shared.toLocaleString()} of this cohort's ${cohort.rows.length.toLocaleString()} `
        + "storms are also in the baseline, so these are not independent estimates. Shared "
        + "storms pull the two rates toward each other, which makes the interval comparison "
        + "below weaker still — read it as a reading aid, never as a test.",
  };
}

/* ---- naming what moved -------------------------------------------------------------------- */

/** Which condition key differs between a cohort and its baseline. */
export function changedKeyOf(spec, baseSpec) {
  const a = new Map(conditionsOf(spec).map((c) => [c.key, c]));
  const b = new Set(conditionsOf(baseSpec).map((c) => c.key));
  for (const k of a.keys()) if (!b.has(k)) return k;
  for (const k of b) if (!a.has(k)) return k;
  return null;
}

/**
 * The condition that moved, named on the card rather than inferred from context.
 *
 * @returns {{key, label, sentence, direction, zone}|null} `direction` is "added" when the
 *   cohort carries a condition the baseline does not, "removed" the other way round.
 */
export function describeChange(spec, baseSpec, key) {
  const k = key || changedKeyOf(spec, baseSpec);
  if (!k) return null;
  const mine = conditionsOf(spec).find((c) => c.key === k);
  const theirs = conditionsOf(baseSpec).find((c) => c.key === k);
  const c = mine || theirs;
  if (!c) return null;
  return {
    key: k,
    label: c.label,
    sentence: c.sentence,
    /* The NOUN, not the clause. The surface says "the same cohort without X", and X has to be a
       noun phrase there -- "without the intensity condition", never "without that reached
       CAT 3+", which is what joining the condition's own relative clause produced on the
       baseline block and again on every outcome card. engine/cohort-language.js owns both
       forms; this carries the one the comparison needs. */
    noun: c.noun,
    value: c.value,
    zone: c.zone,
    direction: mine && !theirs ? "added" : !mine && theirs ? "removed" : "changed",
  };
}
