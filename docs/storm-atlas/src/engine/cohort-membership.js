/* ONE STORM'S STANDING IN ONE COHORT. Membership explained, never similarity scored.
 *
 * WHAT THIS ANSWERS. A reader looking at a storm can ask the archive to build the cohort around
 * where it formed. Two questions follow immediately and neither had an answer:
 *
 *   WHY IS THIS STORM IN THAT COHORT?  -- which of the reader's conditions it satisfies.
 *   WHAT IS IT DOING TO THE NUMBERS?   -- it is in the cohort, so it is in the denominators,
 *                                         and where the evidence is thin it may be a large part
 *                                         of a numerator too.
 *
 * WHAT THIS IS NOT, AND THE DISTINCTION IS THE WHOLE FILE. There is no similarity here, no
 * analog score, no weighting and no new predicate. A cohort is defined by CONDITIONS, and a
 * storm either satisfies each of them or does not; that is a membership fact the Cohort Spec
 * already decides. Anything that ranked storms by how "like" the selected one they are would be
 * a second methodology, invented in a UI file, sitting beside an archive that spent its whole
 * design refusing exactly that.
 *
 * SO NOTHING BELOW IMPLEMENTS A TEST. `whyMatched` runs the ENGINE'S OWN `filterStorms` once per
 * condition, over a spec carrying only that condition, and asks whether the row came back. The
 * predicate is therefore the same code that built the cohort, not a copy of it that could drift
 * from it. `contributionOf` reads the case list `scoreCases` already populated and applies the
 * scorer's own landfall rule to the storm's own rows -- the same array, the same fields.
 *
 * THE STORM IS NOT REMOVED FROM ITS OWN COHORT. It satisfies the conditions, so under the
 * methodology it is a member, and dropping it would be a new rule about which storms count.
 * What is owed instead is a statement: it is one of the N, and it may be one of the few events
 * behind a rate a reader is about to read as being about it. Measured on this pack, a 500 km
 * genesis cohort around Iniki holds 36 storms and publishes a 5.6% Hawaii landfall rate on two
 * observed events -- and Iniki is one of the two. Said out loud that is a caveat a reader can
 * weigh. Left silent it is the fifth rule's hazard wearing a different hat.
 */

import { EMPTY_COHORT, conditionsOf, normalise, toFilters } from "./cohort.js";
import { filterStorms } from "./query.js";

/* The spec carrying ONE condition and nothing else, built from the reader's own values.
 *
 * Keyed by the same keys `conditionsOf` publishes, so a condition that exists there and not here
 * is a missing entry rather than a silent pass -- `whyMatched` reports it as undecidable instead
 * of claiming the storm satisfied something nobody checked. */
const ONLY = {
  where: (s) => ({ where: s.where }),
  months: (s) => ({ months: s.months }),
  season: (s) => ({ seasonFrom: s.seasonFrom, seasonTo: s.seasonTo }),
  basins: (s) => ({ basins: s.basins }),
  subbasinsEntered: (s) => ({ subbasinsEntered: s.subbasinsEntered }),
  namedOnly: (s) => ({ namedOnly: s.namedOnly }),
  includeProvisional: (s) => ({ includeProvisional: s.includeProvisional }),
  intensity: (s) => ({ intensity: s.intensity }),
  landfall: (s) => ({ landfall: s.landfall }),
};

/* THE RECORD SCOPE IS NOT A CONDITION AND IT STILL DECIDES MEMBERSHIP.
 *
 * `conditionsOf` publishes `includeProvisional` only when it is TRUE, because only then is it a
 * clause in the reader's question. When it is FALSE it is still a gate -- and it is the FIRST
 * test `filterStorms` applies (query.js:82), before distance, month or basin. A probe rebuilt
 * from EMPTY_COHORT alone therefore silently reverts it to false, and a provisional storm is
 * rejected before any of the reader's conditions is evaluated: every condition comes back
 * MISSED. The panel would then tell a reader that a 2025 storm did not form within 500 km of
 * its own genesis coordinates -- on the same screen that says it is one of the N.
 *
 * Measured on this pack before the fix: 145 (cohort, storm) pairs across 296 cohorts reported at
 * least one condition MISSED for a storm that `filterStorms` had kept, and every one of them was
 * a provisional storm.
 *
 * SO THE PROBES OPEN THE SCOPE RATHER THAN INHERITING IT. Each probe answers exactly one
 * question -- does this storm satisfy THIS condition -- and the record scope is not one of the
 * reader's conditions, so it must not be allowed to answer for them. A probe that inherited
 * `includeProvisional: false` would report MISSED for every condition of a provisional storm
 * just as the empty default did. The scope is then published SEPARATELY, below, on the one
 * occasion it is the thing that decided membership; that keeps the panel's own equivalence
 * intact -- every entry matched still means, and only means, that the storm is in the cohort. */
const OPEN_SCOPE = { includeProvisional: true };

/* THE ONE CONDITION THE ARCHIVE CAN DECLINE TO JUDGE.
 *
 * RULE 4: an absent outcome is not a zero. `filterStorms` does not EXCLUDE a storm whose peak
 * wind was never recorded -- it counts it as UNDECIDABLE (query.js:110) and the cohort panel
 * says so in as many words: "neither included nor counted as failing". The count comes back
 * from that call; the identity of the storms does not. So this asks the same column at the same
 * test -- `max_vmax_kt === null` IS the engine's rule, not a second reading of it.
 *
 * Without this a storm the archive never measured is printed as having MISSED the threshold,
 * which is the empirical zero this repository exists to refuse, stated about a named storm. */
const UNJUDGED = {
  intensity: (archive, row) => archive.storms.num("max_vmax_kt", row) === null,
};

/**
 * Which of the cohort's conditions this storm satisfies, condition by condition.
 *
 * @returns {Array<{key, label, value, zone, verdict}>} `verdict` is one of:
 *   "matched"   -- the engine's own filter kept this storm under that condition alone;
 *   "missed"    -- it did not;
 *   "unjudged"  -- the archive holds nothing to judge it with, so it is neither (rule 4);
 *   "unchecked" -- the condition has no entry in ONLY. An unknown, never an assumed yes.
 *
 * COST. One `filterStorms` pass per condition, each a linear scan the engine already runs on
 * every chip click: measured 6.4 ms for a three-condition cohort over 3,959 storms, against a
 * 16 ms budget for scoring a whole cohort. It is computed once per (storm, spec) and must stay
 * that way -- per render it would be the most expensive thing on the surface.
 *
 * WHY NOT SIMPLY DIFF THE EXCLUSION LEDGER. `filterStorms` counts each rejected storm against
 * the FIRST condition that rejected it, so a storm failing two conditions appears under one. For
 * a count that is the right accounting; for "why is this one in or out" it would report a single
 * cause where there may be several, which is exactly the misreading the empty-cohort panel now
 * warns about.
 */
export function whyMatched(archive, spec, row) {
  if (!archive || row === null || row === undefined || row < 0) return [];
  const s = normalise(spec);
  const out = conditionsOf(s).map((c) => {
    const at = { key: c.key, label: c.label, value: c.value, zone: c.zone };
    const build = ONLY[c.key];
    if (!build) return { ...at, verdict: "unchecked" };
    if (UNJUDGED[c.key] && UNJUDGED[c.key](archive, row)) return { ...at, verdict: "unjudged" };
    const only = normalise({ ...EMPTY_COHORT, ...OPEN_SCOPE, ...build(s) });
    const r = filterStorms(archive, toFilters(only));
    let matched = false;
    for (let i = 0; i < r.rows.length; i++) {
      if (r.rows[i] === row) { matched = true; break; }
    }
    return { ...at, verdict: matched ? "matched" : "missed" };
  });

  /* AND WHY IT IS NOT IN, WHEN NO CONDITION SAYS SO. With the scope out of the probes, a
     provisional storm MATCHES every condition the reader set and is still not in the cohort --
     which on its own would be the most confusing state the panel could show. The switch that did
     it is named, and named as a control the reader has rather than as a limit of the record,
     because it is one. */
  if (!s.includeProvisional && archive.storms.bool("provisional", row) === true) {
    out.push({ key: "provisionalScope", zone: "scope", label: "RECORD SCOPE",
      value: "provisional seasons are excluded — this one has not been post-analysed",
      verdict: "missed" });
  }
  return out;
}

/**
 * What this storm is doing to the cohort's own numbers.
 *
 * @returns {{isMember, n, contracts: Array<{key, region, kind, count, nStorms}>}}
 *
 * READ OFF THE SCORED CASE LIST, NOT RECOMPUTED. `scoreCases` sets `case.landfalls` from
 * `stormLandfalls` and then counts a case toward `region:any` when it holds a landfall row for
 * that region that is not a suspect relocation, and toward `region:hurricane` when one of those
 * rows is flagged `hurricane`. Both fields are archive columns and both are already on the case
 * this function looks up, so the answer comes from the same array the scorer counted rather than
 * from a second reading of the same rule.
 *
 * LANDFALL CONTRACTS ONLY, DELIBERATELY. An intensity contract's numerator is a threshold
 * comparison, and re-expressing a threshold here -- even correctly -- would put a second copy of
 * a number the methodology owns into a UI-facing module. Membership is still reported for those:
 * "this storm is 1 of 36" is true of every contract on the panel, and it is the statement that
 * matters. Where the archive's evidence is thin enough for one storm to move a rate, it is a
 * landfall contract, which is the case this exists for.
 */
export function contributionOf(result, row) {
  const out = { isMember: false, n: 0, contracts: [] };
  if (!result || row === null || row === undefined) return out;
  out.n = result.n_cases || 0;

  const self = (result.cases || []).find((c) => c.row === row);
  if (!self) return out;
  out.isMember = true;

  /* A CIRCULAR CONTRACT IS NOT EVIDENCE, AND THE LADDER ABOVE ALREADY SAYS SO. Condition the
     cohort on a landfall region and every storm in it carries that outcome by construction; the
     ladder prints CONDITIONED ON -- NOT AN OUTCOME over that cell. A bridge that listed the same
     cell under "this storm is part of the evidence" would be telling the reader a tautology is a
     finding, and would be the only place on the surface where the fifth rule does not hold. The
     count is still real -- it is the CLAIM that is wrong here -- so the row is dropped rather
     than reworded. A REFUSED cell is different and is kept: a rate below min_sample publishes no
     percentage but the events behind it are observed events, and "this storm supplies 1 of the 1"
     is the most important thing the panel can say about a cohort that thin. */
  const circular = (cell) => !!cell && /^CONDITIONED ON/.test(cell.status || "");

  for (const [region, kinds] of Object.entries(result.landfall || {})) {
    const hits = (self.landfalls || []).filter((l) => l.region === region && !l.suspect_relocation);
    if (!hits.length) continue;
    if (kinds.any && !circular(kinds.any)) {
      out.contracts.push({ key: `${region}:any`, region, kind: "any",
        count: kinds.any.count, nStorms: kinds.any.n_storms });
    }
    if (hits.some((h) => h.hurricane) && kinds.hurricane && !circular(kinds.hurricane)) {
      out.contracts.push({ key: `${region}:hurricane`, region, kind: "hurricane",
        count: kinds.hurricane.count, nStorms: kinds.hurricane.n_storms });
    }
  }
  return out;
}

/**
 * The spatial condition this storm's genesis would put on a cohort, and what it does to the one
 * already on screen.
 *
 * @returns {{lat, lon, radiusKm, replaces: {lat, lon, radiusKm}|null, kept: Array<string>}}
 *   `replaces` is the location condition currently set, when there is one; `kept` names the
 *   non-location conditions that survive, because a bridge that silently dropped them would
 *   answer a different question from the one on screen.
 *
 * THE GENESIS POINT, NEVER THE CURRENT ONE. A storm's position at the replay cursor is where it
 * WAS at an instant; the archive's cohorts are keyed on where a storm FORMED, and every rate a
 * cohort publishes is genesis-conditioned. Matching on a mid-track position would silently ask a
 * question the archive does not answer and dress the result as one it does.
 */
export function bridgeSpec(archive, spec, row, { radiusKm } = {}) {
  const s = normalise(spec);
  const lat = archive.genesisLat[row];
  const lon = archive.genesisLon[row];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  /* The caller owns the default radius -- ui/atlas.jsx already publishes DEFAULT_RADIUS_KM and
     applies it to every probe click, and a second copy here would be a second default that
     could drift from the one the map uses. The literal below is a floor, not a policy. */
  const r = radiusKm || (s.where ? s.where.radiusKm : 500);
  return {
    spec: normalise({ ...s, where: { lat, lon, radiusKm: r } }),
    lat,
    lon,
    radiusKm: r,
    replaces: s.where ? { ...s.where } : null,
    /* THE VALUE, NOT THE COLUMN HEADING. `label` is a two-word row header -- IN, SEASONS,
       BASIN, REACHED -- which reads as a label beside its value and as noise inside a sentence:
       "kept -- IN, SEASONS, BASIN, ENTERED, NAMED, PROVISIONAL, REACHED, CAME ASHORE" told a
       reader nothing about which months or which threshold survived, immediately before a button
       that rebuilds their whole question. `value` is the phrase the verdict rows already print. */
    kept: conditionsOf(s).filter((c) => c.key !== "where").map((c) => c.value),
  };
}
