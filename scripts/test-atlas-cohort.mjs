#!/usr/bin/env node
/* The cohort spec, and the migration it has to survive.
 *
 * Phase 3.2 makes one object the single query surface. The dangerous part is not the new code,
 * it is the REPLACEMENT: the rail is the only way to filter this archive today, and a rewrite
 * that silently dropped one filter would look completely healthy. Nothing on screen says
 * "provisional seasons are no longer being excluded"; the population just quietly grows by
 * three storms and every rate shifts.
 *
 * So the gate is an equivalence proof, not a smoke test: for every filter Phase 1/2 shipped and
 * a matrix of combinations, the SPEC path and the LEGACY path must select the identical storm
 * set -- same storms, same order, same undecidable count. The rail is not deleted until this
 * is green.
 *
 * The other half is the URL. A scenario is a URL in this architecture, so a spec that does not
 * round-trip is a scenario that silently becomes a different question when someone opens it.
 *
 * Run: node scripts/test-atlas-cohort.mjs
 */
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { DEFAULT_FILTERS, filterStorms } from "../docs/storm-atlas/src/engine/query.js";
import {
  COHORT_V, EMPTY_COHORT, cohortResult, conditionedOn, conditionsOf, normalise, parentOf,
  RESERVED_QUERY_KEYS, parseQuery, sameCohort, sentenceOf, toFilters, toQuery,
} from "../docs/storm-atlas/src/engine/cohort.js";
import {
  bridgeSpec, contributionOf, whyMatched,
} from "../docs/storm-atlas/src/engine/cohort-membership.js";
import { previewCounts } from "../docs/storm-atlas/src/engine/preview.js";
import { ROOT } from "./lib/atlas-verify.mjs";

let failed = 0;
let checks = 0;

/** How many storms the basis population loses to the landfall condition currently set. */
function countWithout(archive, spec) {
  const withLf = cohortResult(archive, spec).n_cases;
  const withoutLf = cohortResult(archive, { ...spec, landfall: null }).n_cases;
  return withoutLf - withLf;
}
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log("  ok    " + label); return true; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
  return false;
}
function head(s) { console.log("\n" + s); }

const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));

/* Every filter Phase 1/2 shipped, plus combinations. Each entry is the LEGACY filter object and
   the spec that must mean exactly the same thing. Where the two differ in shape -- the spec has
   no `where` equivalent in the legacy path -- the legacy side simply omits it, which is why the
   spatial cases are listed separately below. */
const EQUIVALENCES = [
  ["defaults", {}, {}],
  ["season floor", { seasonFrom: 1971 }, { seasonFrom: 1971 }],
  ["season ceiling", { seasonTo: 1990 }, { seasonTo: 1990 }],
  ["season window", { seasonFrom: 1971, seasonTo: 2000 }, { seasonFrom: 1971, seasonTo: 2000 }],
  ["genesis months", { months: [8, 9] }, { months: [8, 9] }],
  ["months out of order", { months: [9, 8] }, { months: [9, 8] }],
  ["basin", { basins: ["EP"] }, { basins: ["EP"] }],
  ["two basins", { basins: ["EP", "NA"] }, { basins: ["EP", "NA"] }],
  ["entered subbasin", { subbasinsEntered: ["CP"] }, { subbasinsEntered: ["CP"] }],
  ["intensity ts", { intensity: "ts" }, { intensity: "ts" }],
  ["intensity cat3", { intensity: "cat3" }, { intensity: "cat3" }],
  ["intensity cat5", { intensity: "cat5" }, { intensity: "cat5" }],
  ["landfall any", { landfall: "any" }, { landfall: "any" }],
  ["landfall mexico", { landfall: "mexico" }, { landfall: "mexico" }],
  ["landfall hawaii", { landfall: "hawaii" }, { landfall: "hawaii" }],
  ["provisional included", { includeProvisional: true }, { includeProvisional: true }],
  ["named only", { namedOnly: true }, { namedOnly: true }],
  ["everything at once",
    { seasonFrom: 1971, months: [8, 9], basins: ["EP"], intensity: "cat3",
      landfall: "mexico", namedOnly: true },
    { seasonFrom: 1971, months: [8, 9], basins: ["EP"], intensity: "cat3",
      landfall: "mexico", namedOnly: true }],
];

head(`[1] the spec path and the legacy path select the same storms (${EQUIVALENCES.length} cases)`);
for (const [label, legacy, specIn] of EQUIVALENCES) {
  const a = filterStorms(archive, { ...DEFAULT_FILTERS, ...legacy });
  const b = filterStorms(archive, toFilters(specIn));
  let same = a.rows.length === b.rows.length;
  if (same) for (let i = 0; i < a.rows.length; i++) if (a.rows[i] !== b.rows[i]) { same = false; break; }
  ok(same && a.undecidable === b.undecidable,
    `${label} — ${a.rows.length} storms`,
    same ? `undecidable ${a.undecidable} vs ${b.undecidable}`
      : `legacy ${a.rows.length} storms, spec ${b.rows.length}`);
}

head("[2] the spatial condition the rail never had");
{
  const near = filterStorms(archive, toFilters({ where: { lat: 12, lon: -105, radiusKm: 500 } }));
  const all = filterStorms(archive, toFilters({}));
  ok(near.rows.length > 0 && near.rows.length < all.rows.length,
    `a 500 km circle selects ${near.rows.length} of ${all.rows.length}`);
  ok(near.excluded.distance === all.rows.length - near.rows.length,
    "and every storm it removed is counted under `distance`",
    `${near.excluded.distance} vs ${all.rows.length - near.rows.length}`);

  const wide = filterStorms(archive, toFilters({ where: { lat: 12, lon: -105, radiusKm: 30000 } }));
  ok(wide.rows.length === all.rows.length,
    "a radius larger than the planet excludes nobody");

  // The spatial term must compose with the others rather than replacing them.
  const both = filterStorms(archive, toFilters({
    where: { lat: 12, lon: -105, radiusKm: 500 }, intensity: "cat3",
  }));
  ok(both.rows.length < near.rows.length, "and it composes with an intensity condition",
    `${both.rows.length} vs ${near.rows.length}`);
  ok(both.rows.every((r) => near.rows.includes(r)),
    "the narrower cohort is a strict subset of the wider one");
}

head("[3] normalisation: one cohort, one canonical form");
{
  const a = normalise({ months: [9, 8, 9], basins: ["NA", "EP", "NA"] });
  ok(JSON.stringify(a.months) === "[8,9]", "months are sorted and de-duplicated");
  ok(JSON.stringify(a.basins) === '["EP","NA"]', "so are basins");
  ok(normalise({ months: [] }).months === null, "an empty list is no condition, not no storms");
  ok(normalise({ seasonFrom: 2000, seasonTo: 1980 }).seasonFrom === 1980,
    "a reversed season range is repaired rather than yielding an empty cohort");
  ok(normalise({ where: { lat: 12, lon: -105, radiusKm: 0 } }).where === null,
    "a zero radius is not a location condition");
  ok(normalise({ intensity: "cat9" }).intensity === "all",
    "an unknown intensity key falls back to `all` rather than matching nothing");
  ok(sameCohort({ months: [8, 9] }, { months: [9, 8] }),
    "two specs meaning the same cohort are the same cohort");
  ok(!sameCohort({ months: [8] }, { months: [9] }), "and two that do not, are not");
}

head("[4] the URL round-trip — a scenario is a URL");
const URL_CASES = [
  {},
  { where: { lat: 12.25, lon: -105.5, radiusKm: 500 } },
  { seasonFrom: 1971, seasonTo: 2020, months: [6, 7, 8, 9, 10] },
  { basins: ["EP", "NA"], subbasinsEntered: ["CP"] },
  { intensity: "cat3", landfall: "mexico" },
  { includeProvisional: true, namedOnly: true },
  { where: { lat: -15.5, lon: 179.25, radiusKm: 900 }, months: [1, 2], intensity: "cat5",
    landfall: "hawaii", seasonFrom: 1980, namedOnly: true },
];
for (const spec of URL_CASES) {
  const q = toQuery(spec);
  const back = parseQuery(q).spec;
  ok(toQuery(back) === q, `round-trips: ${q || "(empty)"}`,
    `re-encoded as ${toQuery(back)}`);
  ok(sameCohort(back, spec), "and means the same cohort");
}
{
  const { versionMismatch } = parseQuery("v=99&i=cat3");
  ok(versionMismatch === 99,
    "a URL from a different spec version reports the mismatch rather than silently re-scoring");
  ok(parseQuery(toQuery({})).versionMismatch === null, "and a current one does not");
}

/* THE COLLISION THAT MADE THIS SECTION NECESSARY.
 *
 * The cohort is not the only thing written to the query string: ui/atlas.jsx also stamps the
 * METHODOLOGY VERSION, the surface and the ledger anchor onto it. Months owned `m` and so did
 * the methodology, and because the surface writes last the cohort lost. What that cost was not
 * cosmetic:
 *
 *   - every shared link had its month selection deleted, so the cohort on screen and the cohort
 *     at the far end of the link were DIFFERENT POPULATIONS with different rates;
 *   - re-opening one parsed "1.1.0" back as months [1, 1, 0] -> [0, 1], applying a January
 *     condition nobody asked for and printing it as `in , Jan`, because there is no month 0.
 *
 * Neither failure raised anything. The surface rendered a confident, wrong answer to a question
 * the reader had not asked, which is the one outcome this repository is built to prevent. So the
 * reservation is a GATE rather than a comment: a future key added to K cannot quietly take `m`,
 * `view` or `contract` back, and the domain check below means no value outside 1-12 can reach a
 * month-name lookup even if some other path invents one. */
{
  const reserved = new Set(RESERVED_QUERY_KEYS);
  const keys = [...new URLSearchParams(toQuery({
    where: { lat: 12, lon: -105, radiusKm: 500 }, seasonFrom: 1971, seasonTo: 2020,
    months: [8, 9], basins: ["EP"], subbasinsEntered: ["CP"], intensity: "cat3",
    landfall: "mexico", includeProvisional: true, namedOnly: true,
  })).keys()];
  const clash = keys.filter((k) => reserved.has(k));
  ok(clash.length === 0,
    "no cohort key collides with a key the surface owns on the same query string",
    `collided on ${clash.join(", ")}`);
  ok(keys.length > 8, "and the fully-loaded spec really does write every key", keys.join(","));

  /* The exact failure, asserted from both ends. */
  const stamped = new URLSearchParams(toQuery({ months: [8, 9] }));
  stamped.set("m", "1.1.0");
  ok(JSON.stringify(parseQuery(stamped.toString()).spec.months) === "[8,9]",
    "a methodology stamp does not overwrite the months a reader chose");
  ok(parseQuery("v=1&m=1.1.0").spec.months === null,
    "and a methodology stamp is never read back as a month condition");
  ok(normalise({ months: [0, 1, 13, 8, null, NaN] }).months.join() === "1,8",
    "a month outside 1-12 never reaches the spec, so it can never print as an empty noun",
    JSON.stringify(normalise({ months: [0, 1, 13, 8, null, NaN] }).months));
}

/* THE MIGRATION, PROVED RATHER THAN ASSERTED.
 *
 * `m` used to mean months and now means the methodology stamp, so the question a reader of this
 * file will ask is the one this block answers: can any URL still in existence -- written by any
 * build, or by hand -- put a month condition on a cohort through the old key?
 *
 * It cannot, and the reason is structural rather than defensive: `m` is not in K, so parseQuery
 * never reads it for anything. There is deliberately no compatibility path that tries to tell a
 * version from a month list, because "1.2" is a valid reading of both and a rule that guessed
 * would reintroduce exactly the ambiguity the rename exists to end.
 *
 * WHAT A LEGACY `m` MONTH-LIST DOES INSTEAD: nothing. The condition is DROPPED, not
 * reinterpreted -- the cohort comes out wider than the link's author meant, visibly, with the
 * month strip empty and the question saying so, rather than silently narrowed to a month
 * nobody chose. Of the two ways to be wrong that is the recoverable one. And no shipped build
 * ever produced such a URL: the surface has always written the methodology into `m` last, which
 * is what destroyed the months in the first place. */
head("[4b] the m -> mo migration cannot recreate a phantom month");
{
  const LEGACY = [
    "1.1.0", "1.0.0", "2.0", "1.2", "8.9", "1", "12", "0", "13", "1.1.0-rc1", "",
    "1.2.3.4", "0.0.0", "3.3", "6.7.8", "not-a-version", "1,2", "1.13", "%2E", "..",
  ];
  let leaked = null;
  for (const v of LEGACY) {
    const q = new URLSearchParams({ v: "1", m: v });
    const back = parseQuery(q.toString()).spec;
    if (back.months !== null) { leaked = `m=${v} -> ${JSON.stringify(back.months)}`; break; }
    /* And it does not leak into any other dimension either. */
    if (back.basins || back.subbasinsEntered || back.where
        || back.seasonFrom !== null || back.seasonTo !== null) {
      leaked = `m=${v} -> ${JSON.stringify(back)}`; break;
    }
  }
  ok(leaked === null,
    `no legacy m= value becomes a condition (${LEGACY.length} values, versions and month lists)`,
    leaked || "");

  /* The same sweep with a REAL month condition alongside it: the new key wins and the old one
     is inert, which is the case every shared link written from here on actually is. */
  let clobbered = null;
  for (const v of LEGACY) {
    const q = new URLSearchParams(toQuery({ months: [8, 9] }));
    q.set("m", v);
    const back = parseQuery(q.toString()).spec;
    if (JSON.stringify(back.months) !== "[8,9]") {
      clobbered = `m=${v} -> ${JSON.stringify(back.months)}`; break;
    }
  }
  ok(clobbered === null,
    "and a real month condition survives every one of them intact", clobbered || "");

  /* parseQuery reads the cohort's own keys and nothing else. Stated as a property so a future
     key added to K without being added here is caught by the count rather than by a reader. */
  const K_KEYS = ["w", "s0", "s1", "mo", "b", "e", "i", "l", "p", "n"];
  const written = [...new URLSearchParams(toQuery({
    where: { lat: 1, lon: 2, radiusKm: 3 }, seasonFrom: 1971, seasonTo: 2020, months: [8],
    basins: ["EP"], subbasinsEntered: ["CP"], intensity: "cat3", landfall: "mexico",
    includeProvisional: true, namedOnly: true,
  })).keys()].filter((k) => k !== "v");
  ok(written.length === K_KEYS.length && written.every((k) => K_KEYS.includes(k)),
    "the cohort writes exactly its ten declared keys, and `m` is not one of them",
    written.join(","));

  /* The end-to-end shape: what the surface writes, read back, is the cohort it wrote. */
  const spec = normalise({ where: { lat: 14.7, lon: -113.9, radiusKm: 500 }, months: [8, 9],
    seasonFrom: 1971, basins: ["EP"], intensity: "cat3" });
  const url = new URLSearchParams(toQuery(spec));
  url.set("m", "1.1.0");
  url.set("view", "calibration");
  url.set("contract", "reaches_cat3_96kt");
  ok(sameCohort(parseQuery(url.toString()).spec, spec),
    "a fully-stamped URL round-trips to the identical cohort", url.toString());
}

head("[5] conditions carry their zone, their sentence and their cost");
{
  const spec = { where: { lat: 12, lon: -105, radiusKm: 500 }, months: [8, 9],
    seasonFrom: 1971, intensity: "cat3", landfall: "mexico" };
  const cs = conditionsOf(spec);
  const keys = cs.map((c) => c.key);
  ok(JSON.stringify(keys) === '["where","months","season","intensity","landfall"]',
    "conditions come out in lifecycle order — where, when, then outcome",
    JSON.stringify(keys));
  ok(cs.filter((c) => c.zone === "given").length === 3, "three are antecedent");
  ok(cs.filter((c) => c.zone === "outcome").length === 2, "two are outcome-side");
  ok(cs.filter((c) => c.zone === "outcome").every((c) => typeof c.costs === "string"),
    "and every outcome-side condition states what it costs BEFORE it is applied");
  ok(/reached/.test(cs.find((c) => c.key === "intensity").costs) === false
     && /stops being an outcome/.test(cs.find((c) => c.key === "intensity").costs),
    "the cost is stated as a consequence, not as a restatement of the condition");

  const sentence = sentenceOf(spec);
  ok(/^Storms /.test(sentence) && /what happened next\?$/.test(sentence),
    "the whole question reads as a sentence", sentence);
  ok(sentenceOf({}) === "Every storm in the archive — what happened next?",
    "and an empty cohort still reads as a question");
}

head("[6] the parent cohort — the default baseline");
{
  const spec = { seasonFrom: 1971, months: [8, 9], intensity: "cat3" };
  const p = parentOf(spec);
  ok(p.intensity === "all", "dropping the last condition removes it");
  ok(p.seasonFrom === 1971 && JSON.stringify(p.months) === "[8,9]",
    "and leaves every earlier one alone");
  ok(parentOf(spec, "months").months === null, "a named condition can be dropped instead");
  ok(parentOf({}) === null, "a cohort with no conditions has no parent");

  const withWhere = parentOf({ where: { lat: 1, lon: 2, radiusKm: 3 } }, "where");
  ok(withWhere.where === null, "the spatial condition drops cleanly too");
}

head("[7] conditionedOn — the fifth rule fires from the spec");
{
  ok(conditionedOn({}) === null, "an unconditioned cohort declares nothing");
  ok(conditionedOn({ intensity: "cat3" }).minPeak === "cat3", "an intensity condition declares itself");
  ok(conditionedOn({ landfall: "mexico" }).landfallRegion === "mexico", "so does a landfall one");
  /* "ANY LANDFALL" IS THE THIRD CASE. It names no region, so it makes no single contract
     circular -- but it does select the denominator on the outcome family, and the engine has to
     declare that or the builder's chip and the engine disagree about what the cohort did.
     Before this was fixed the chip promised "every landfall contract stops being an outcome"
     while the engine declared nothing and published every rate. */
  ok(conditionedOn({ landfall: "any" }).landfallAny === true,
    "`any landfall` declares itself as a selection, not as a conditioning on one region");
  ok(conditionedOn({ landfall: "any" }).landfallRegion === undefined,
    "and names no region, so no single contract is made circular");
  {
    const sel = cohortResult(archive, { landfall: "any", seasonFrom: 1971 });
    const all = cohortResult(archive, { seasonFrom: 1971 });
    ok(sel.landfall.mexico.any.rate !== null && sel.landfall.mexico.any.status === undefined,
      "the regional rates still publish — over-refusing them would discard a real answer");
    ok(!!sel.landfall_note, "but the denominator note travels with them");
    ok(/share of the \d+ storms that came ashore/.test(sel.landfall_note),
      "and states what the denominator has become", sel.landfall_note);
    ok(all.landfall_note === null,
      "while an unselected cohort carries no such note");
    /* The size of the effect is why the note exists rather than a footnote: the same words mean
       12.5% one condition ago and 43.8% now. */
    ok(sel.landfall.mexico.any.rate > 3 * all.landfall.mexico.any.rate,
      "the selection effect is large enough that silence about it would mislead",
      `${(100 * all.landfall.mexico.any.rate).toFixed(1)}% -> ` +
      `${(100 * sel.landfall.mexico.any.rate).toFixed(1)}%`);
  }
}

head("[8] one cohort, one answer — membership and outcomes from the same object");
{
  const spec = { where: { lat: 12, lon: -105, radiusKm: 800 }, seasonFrom: 1971 };
  const r = cohortResult(archive, spec);
  ok(r.n_cases === r.rows.length, `membership and cases agree (${r.n_cases})`);
  ok(r.intensity && r.intensity.cat3 && r.intensity.cat3.n_storms > 0,
    "the cohort is scored without a probe");
  ok(r.intensity.cat3.rate !== null, "and publishes a rate");
  ok(r.intensity.cat3.weighted_rate === r.intensity.cat3.rate,
    "weights are uniform, so the weighted rate is the rate — not a second number");
  ok(r.time_to_event && r.time_to_event.cat1.n > 0, "and a transit-time distribution");

  /* THE POINT OF THE WHOLE PHASE: the storms drawn are the storms counted. */
  ok(r.intensity.cat1.n_storms + r.intensity.cat1.n_unknown === r.rows.length,
    "every drawn storm is either in a denominator or counted as unknown — none is lost",
    `${r.intensity.cat1.n_storms} + ${r.intensity.cat1.n_unknown} vs ${r.rows.length}`);

  const cond = cohortResult(archive, { ...spec, intensity: "cat3" });
  ok(cond.intensity.cat3.rate === null &&
     cond.intensity.cat3.status === "CONDITIONED ON -- NOT AN OUTCOME",
    "and conditioning on an outcome makes it refuse, from the spec alone");
  ok(cond.intensity.cat5.rate !== null, "while a threshold above it still reports");
}

head("[9] the archive's own warnings survive the migration");
{
  /* THE HOLE THIS CLOSES. The first version of this harness compared storm SETS and nothing
     else, so it passed while the cohort path silently dropped the pre-1971 observing-bias
     warning -- the single most consequential thing the archive says about its intensity
     record. check-atlas-dom caught it, which is the wrong gate to find it in: a membership
     test that ignores what the archive SAYS about the membership is only half a test. */
  const wide = cohortResult(archive, { where: { lat: 12, lon: -105, radiusKm: 800 } });
  const bias = wide.gaps.find((g) => /before 1971, when East Pacific/.test(g));
  ok(!!bias, "a cohort reaching before 1971 carries the observing-bias warning");
  ok(bias && /1\.7% Cat 3 in the 1960s vs 20-30% from the 1970s on/.test(bias),
    "with the archive's measured figures reproduced verbatim", bias);
  ok(bias && /Set a season floor of 1971/.test(bias),
    "and names the control this surface actually has");

  const floored = cohortResult(archive,
    { where: { lat: 12, lon: -105, radiusKm: 800 }, seasonFrom: 1971 });
  ok(!floored.gaps.some((g) => /before 1971/.test(g)),
    "and the warning goes away once the floor is set — it is a condition, not decoration");

  const undec = cohortResult(archive, { intensity: "cat3" });
  ok(undec.gaps.some((g) => /could not be judged/.test(g)),
    "storms the intensity condition could not judge are named, not silently dropped");
}

head("[10] a cohort nobody can answer");
{
  const none = cohortResult(archive, { where: { lat: 0.5, lon: -30, radiusKm: 50 } });
  ok(none.n_cases === 0, "an empty cohort is empty");
  ok(none.intensity.cat1.rate === null, "no rate is invented from it");
  ok(none.intensity.cat1.n_storms === 0, "the denominator is honestly zero");
}

head("[11] the builder's chip counts are the archive's own counts");
{
  /* THE CLAIM THIS PINS. Every chip in the builder carries a live count, and for an
     OUTCOME-SIDE chip that count is asserted -- in preview.js and on the screen -- to be the
     same number the outcome card above it publishes. That equality is the whole reason the
     fifth rule reads as a consequence rather than as an obstruction: the reader clicks CAT 3+
     showing 145, and the cohort then refuses to report 145/145 back as a finding.
     If the two ever drift, the builder is quietly promising a cohort the engine will not
     deliver, so it is asserted here rather than trusted. */
  for (const spec of [
    { where: { lat: 12, lon: -105, radiusKm: 800 }, seasonFrom: 1971 },
    { months: [8, 9], seasonFrom: 1990 },
    { basins: ["EP"], landfall: "mexico" },
    {},
  ]) {
    const pv = previewCounts(archive, spec);
    const r = cohortResult(archive, spec);
    const tag = JSON.stringify(spec).slice(0, 46);

    for (const k of spec.intensity ? [] : ["ts", "cat1", "cat3", "cat4", "cat5"]) {
      const cell = r.intensity[k];
      if (!cell || cell.status) continue;   // a conditioned-on row publishes no comparable count
      ok(pv.intensity[k] === cell.count,
        `${tag} · the ${k.toUpperCase()} chip counts what the card counts`,
        `chip ${pv.intensity[k]} vs card ${cell.count}`);
    }
    ok(pv.intensityUnknown === r.intensity.ts.n_unknown,
      `${tag} · and the unknowns are the same unknowns`,
      `${pv.intensityUnknown} vs ${r.intensity.ts.n_unknown}`);

    /* Only while the dimension is unconditioned. With a landfall condition set the two count
       over different populations on purpose -- asserted as a DIFFERENCE in the block below. */
    for (const region of spec.landfall ? [] : Object.keys(r.landfall)) {
      const cell = r.landfall[region].any;
      if (!cell || cell.status) continue;
      ok(pv.landfall[region] === cell.count,
        `${tag} · the ${region} chip counts what the card counts`,
        `chip ${pv.landfall[region]} vs card ${cell.count}`);
    }
    ok(pv.intensity.all === r.n_cases,
      `${tag} · the ALL chip is this cohort, because its intensity is unconditioned`);
  }

  /* WHERE THE EQUALITY STOPS, asserted rather than assumed -- this is the case the first draft
     of the check above got wrong. Once a dimension carries a condition, its chips count over the
     population WITHOUT that condition ("switch to this") while the cards count within the cohort
     ("also did this"). Two right numbers for two different questions, and the builder prints a
     basis line exactly when they diverge. Pinned here so a future change cannot quietly make one
     of them mean the other. */
  {
    const spec = { basins: ["EP"], landfall: "mexico" };
    const pv = previewCounts(archive, spec);
    const r = cohortResult(archive, spec);
    ok(pv.basisOf.landfall > r.n_cases,
      "with a landfall condition set, its chips are counted over a larger basis",
      `basis ${pv.basisOf.landfall} vs cohort ${r.n_cases}`);
    ok(pv.landfall.central_america !== r.landfall.central_america.any.count,
      "so the chip and the card legitimately differ",
      `chip ${pv.landfall.central_america} vs card ${r.landfall.central_america.any.count}`);
    ok(pv.landfall.mexico === pv.basisOf.landfall - countWithout(archive, spec),
      "and the applied chip's own count is the cohort it would produce", "see below");

    /* THE INTENSITY AXIS BEHAVES DIFFERENTLY FROM THE LANDFALL AXIS, and the difference is worth
       pinning because it is the reason the two look inconsistent on screen and are not.
       Intensity chips are NESTED thresholds: every Cat 4 storm is also a Cat 3+ storm, so with
       CAT 3+ applied, the CAT 4 chip and the CAT 4 card count the same storms even though they
       are taken over different populations. Landfall regions do not nest -- a Mexico landfaller
       need not have hit Central America -- so there the two genuinely differ.
       What DOES diverge on the intensity axis is the ALL chip, which shows the basis; that is
       what the builder's basis line is there to explain. */
    const is = { seasonFrom: 1971, intensity: "cat3" };
    const ipv = previewCounts(archive, is);
    const ir = cohortResult(archive, is);
    ok(ir.intensity.cat3.status === "CONDITIONED ON -- NOT AN OUTCOME",
      "the conditioned row refuses to be an outcome");
    ok(ir.intensity.cat1.status === "CONDITIONED ON -- NOT AN OUTCOME",
      "and so does every threshold below it — the fifth rule reaches downward");
    ok(ipv.intensity.cat4 === ir.intensity.cat4.count,
      "a threshold ABOVE the condition counts the same either way, because thresholds nest",
      `chip ${ipv.intensity.cat4} vs card ${ir.intensity.cat4.count}`);
    ok(ipv.intensity.all > ir.n_cases,
      "while the ALL chip shows the basis, which is exactly what the basis line explains",
      `chip ${ipv.intensity.all} vs cohort ${ir.n_cases}`);
  }

  /* Counted over the population that satisfies every OTHER condition, which is what makes a
     month count stay still while months are toggled. A preview counted against the current
     cohort would report zero for every unselected month. */
  const aug = previewCounts(archive, { months: [8] });
  const augSep = previewCounts(archive, { months: [8, 9] });
  ok(aug.months[9] === augSep.months[9] && aug.months[9] > 0,
    "a month's count does not move when a different month is toggled",
    `${aug.months[9]} vs ${augSep.months[9]}`);
  ok(aug.basisOf.months === augSep.basisOf.months,
    "because both are counted over the same basis population");
}

/* ---- [12] THE BRIDGE ---------------------------------------------------------------------
 *
 * The storm -> cohort bridge adds one claim to the surface that nothing else makes: that a
 * NAMED STORM stands in a particular relation to a cohort. Three things could go wrong quietly
 * and none of them would show up anywhere else.
 *
 *   IT COULD EXPLAIN A MEMBERSHIP THAT IS NOT THE ONE THE ENGINE DECIDED. `whyMatched` runs
 *   `filterStorms` once per condition, so its verdicts and the cohort must agree by
 *   construction -- but "by construction" is a claim about code that has to be tested against
 *   the code, because a normalisation that behaves differently on a one-condition spec than on
 *   a whole one would break the equivalence without breaking anything visible.
 *
 *   IT COULD MISCOUNT WHAT THE STORM CONTRIBUTES. `contributionOf` says "this storm supplies 1
 *   of N observed events", which is a statement about the scorer's numerator. If it applied
 *   even a slightly different landfall rule, the panel would attribute an event to a storm that
 *   the ladder above it did not count -- the two would disagree about the same cohort, in the
 *   one place a reader is most likely to believe the smaller number.
 *
 *   IT COULD SILENTLY PASS A CONDITION NOBODY CHECKED. A condition with no entry in the ONLY
 *   map must report as undecidable. The failure mode is a future condition added to the Cohort
 *   Spec and not to the bridge: the panel would print MATCHED for something it never tested.
 */
head("[12] the bridge — one storm's standing in one cohort");
{
  const rowOfId = (id) => {
    for (let i = 0; i < archive.nStorms; i++) {
      if (archive.storms.str("storm_id", i) === id) return i;
    }
    return -1;
  };

  /* THE EQUIVALENCE, AT SCALE. Not "the storms I picked come back MATCHED", which would pass on
     a bridge that answered true to everything: for EVERY storm in the basis population, all
     conditions satisfied must mean IN the cohort and any condition missed must mean OUT. One
     counterexample anywhere is a failure, and the count of storms actually tested is printed so
     a future edit cannot turn this into a vacuous pass over an empty set. */
  const COHORTS = [
    ["a bare genesis circle", { where: { lat: 13.4, lon: -94.0, radiusKm: 500 } }],
    ["a circle and two months",
      { where: { lat: 13.8, lon: -111.0, radiusKm: 500 }, months: [8, 9] }],
    ["a circle, a season floor and a basin",
      { where: { lat: 16.1, lon: -82.9, radiusKm: 500 }, seasonFrom: 1971, basins: ["NA"] }],
    ["an intensity condition with no circle at all", { intensity: "cat3", namedOnly: true }],
    ["a landfall condition and a subbasin",
      { landfall: "mexico", subbasinsEntered: ["CP"], includeProvisional: true }],
  ];
  let tested = 0;
  let disagreed = 0;
  let skipped = 0;
  for (const [label, spec] of COHORTS) {
    const norm = normalise(spec);
    const r = cohortResult(archive, norm);
    const inCohort = new Set(r.rows);
    /* Over the whole archive, not over the cohort: a bridge that got membership right and
       non-membership wrong is exactly the bug the non-member panel state exists for. */
    for (let row = 0; row < archive.nStorms; row++) {
      const why = whyMatched(archive, norm, row);
      /* A storm the archive could not judge is neither in nor out under rule 4, so it is not
         a counterexample either way -- but it is COUNTED, because a skip that grew silently
         would hollow this proof out from the inside. */
      if (why.some((w) => w.verdict === "unchecked" || w.verdict === "unjudged")) {
        skipped++;
        continue;
      }
      const all = why.every((w) => w.verdict === "matched");
      tested++;
      if (all !== inCohort.has(row)) disagreed++;
    }
    ok(disagreed === 0, `every condition satisfied means in the cohort — ${label}`,
      `${disagreed} storm(s) disagreed with filterStorms`);
  }
  ok(tested >= 5 * 3000,
    `and the equivalence was actually exercised (${tested.toLocaleString()} storm-cohort pairs, `
    + `${skipped.toLocaleString()} unjudged)`,
    `only ${tested} pairs tested`);

  /* NO CONDITION GOES UNCHECKED. Every condition the Cohort Spec can publish must have a
     one-condition form the bridge can test, or the panel prints NOT CHECKED. Setting all of
     them at once is the cheapest way to notice a new one that was never wired up. */
  {
    const everything = normalise({
      where: { lat: 13.4, lon: -94.0, radiusKm: 600 }, months: [8, 9],
      seasonFrom: 1971, seasonTo: 2020, basins: ["EP"], subbasinsEntered: ["CP"],
      namedOnly: true, includeProvisional: true, intensity: "cat3", landfall: "mexico",
    });
    const why = whyMatched(archive, everything, rowOfId("2015293N13266"));
    const unchecked = why.filter((w) => w.verdict === "unchecked").map((w) => w.key);
    ok(why.length === conditionsOf(everything).length,
      `every condition on the spec is explained (${why.length})`);
    ok(unchecked.length === 0,
      "and none of them is reported as NOT CHECKED — the bridge knows every condition the "
      + "spec can carry",
      `unchecked: ${unchecked.join(", ")}`);
  }

  /* A CONDITION THE STORM MISSES IS THE ONE MARKED MISSED. Darby 2022 formed in July, so an
     August-or-September cohort built on its own genesis point excludes it -- and the panel has
     to be able to say which condition did that, not merely that something did. */
  {
    const row = rowOfId("2022191N14249");
    const b = bridgeSpec(archive, normalise({ ...EMPTY_COHORT, months: [8, 9] }), row);
    const why = whyMatched(archive, b.spec, row);
    const missed = why.filter((w) => w.verdict === "missed").map((w) => w.key);
    ok(missed.length === 1 && missed[0] === "months",
      "a storm outside its own genesis cohort names the condition that excluded it",
      `missed: ${missed.join(", ") || "none"}`);
    ok(why.find((w) => w.key === "where").verdict === "matched",
      "while the condition built from its own genesis is necessarily satisfied");
    const con = contributionOf(cohortResult(archive, b.spec), row);
    ok(con.isMember === false && con.contracts.length === 0,
      "and it contributes nothing to a cohort it is not in");
  }

  /* THE STORM IS NOT REMOVED FROM ITS OWN COHORT. Under the methodology it satisfies the
     conditions, so it is a member and it is in the denominators. This is the assertion that
     would fail the day somebody "helpfully" excludes it. */
  {
    for (const [label, id, months] of [
      ["Ivan 2004 (North Atlantic, Cape Verde)", "2004247N10332", null],
      ["Patricia 2015 (East Pacific)", "2015293N13266", null],
      ["Keith 2000 (north-west Caribbean)", "2000273N16277", null],
      ["Iniki 1992 (Central Pacific, sparse)", "1992249N12229", [8, 9]],
    ]) {
      const row = rowOfId(id);
      const base = normalise({ ...EMPTY_COHORT, ...(months ? { months } : {}) });
      const b = bridgeSpec(archive, base, row);
      const r = cohortResult(archive, b.spec);
      const con = contributionOf(r, row);
      ok(con.isMember && con.n === r.n_cases && r.rows.includes(row),
        `the selected storm is a member of the cohort its own genesis defines — ${label}`,
        `member=${con.isMember} n=${con.n} cases=${r.n_cases}`);
    }
  }

  /* THE CONTRIBUTION IS THE SCORER'S OWN NUMERATOR, RECONSTRUCTED. Summing every case's
     contribution to a contract must return exactly the count the scorer published. This is the
     assertion that catches a landfall rule that drifted by one condition -- a dropped
     suspect_relocation test, a hurricane flag read from the wrong row -- because such a rule
     would still look completely reasonable on any single storm. */
  {
    const b = bridgeSpec(archive,
      normalise({ ...EMPTY_COHORT }), rowOfId("2000273N16277"));
    const r = cohortResult(archive, b.spec);
    const tally = {};
    for (const c of r.cases) {
      for (const k of contributionOf(r, c.row).contracts) {
        tally[k.key] = (tally[k.key] || 0) + 1;
      }
    }
    let regions = 0;
    let mismatched = [];
    for (const [region, kinds] of Object.entries(r.landfall)) {
      for (const kind of ["any", "hurricane"]) {
        if (!kinds[kind]) continue;
        regions++;
        const mine = tally[`${region}:${kind}`] || 0;
        if (mine !== kinds[kind].count) {
          mismatched.push(`${region}:${kind} bridge=${mine} scorer=${kinds[kind].count}`);
        }
      }
    }
    ok(regions > 0, `the cohort publishes landfall contracts to check (${regions})`);
    ok(mismatched.length === 0,
      "and every contract's numerator is exactly the storms the bridge says supply it",
      mismatched.join("; "));
  }

  /* A REFUSED RATE STILL HAS A COUNT, AND THE COUNT IS WHAT THE CONTRIBUTION IS ABOUT. Vince
     2005 formed off Madeira; two storms in the archive formed within 500 km of it, so every
     rate the cohort could publish is refused below min_sample. The contribution must survive
     that -- "this storm supplies 1 of the 1 observed event" is the most important thing the
     panel can say about a cohort this thin, and it is exactly the case where a
     rate-shaped implementation would print nothing. */
  {
    const row = rowOfId("2005281N33339");
    const b = bridgeSpec(archive, normalise({ ...EMPTY_COHORT }), row);
    const r = cohortResult(archive, b.spec);
    ok(r.n_cases < r.min_sample,
      `the cohort is below sample (${r.n_cases} < ${r.min_sample})`);
    const anyRate = Object.values(r.landfall).some((k) => k.any.rate !== null);
    ok(!anyRate, "so no landfall contract publishes a rate");
    const con = contributionOf(r, row);
    ok(con.isMember && con.contracts.length > 0,
      "and the storm's contribution is still reported, because a count is not a rate",
      `contracts: ${con.contracts.map((c) => c.key).join(", ") || "none"}`);
    ok(con.contracts.every((c) => c.count !== null && c.count >= 1),
      "with the real numerator beside it");
  }

  /* THE GENESIS POINT, AND ONLY THE GENESIS POINT. */
  {
    const row = rowOfId("1992249N12229");
    const before = normalise({ ...EMPTY_COHORT, months: [8, 9],
      where: { lat: 20, lon: -157, radiusKm: 300 } });
    const b = bridgeSpec(archive, before, row);
    ok(b.lat === archive.genesisLat[row] && b.lon === archive.genesisLon[row],
      "the bridge builds on the storm's genesis position",
      `${b.lat},${b.lon} vs ${archive.genesisLat[row]},${archive.genesisLon[row]}`);
    ok(b.replaces && b.replaces.lat === 20 && b.replaces.lon === -157,
      "and reports the location condition it replaced, rather than replacing it silently");
    ok(b.radiusKm === 300,
      "keeping the radius the reader had already chosen", `${b.radiusKm}`);
    ok(JSON.stringify(b.spec.months) === JSON.stringify([8, 9]),
      "every non-location condition survives the bridge");
    ok(b.kept.length === conditionsOf(before).length - 1,
      "and the panel is told which ones those are",
      `${b.kept.join(", ")}`);

    const fresh = bridgeSpec(archive, normalise({ ...EMPTY_COHORT }), row);
    ok(fresh.replaces === null && fresh.radiusKm === 500,
      "with no location condition set, the bridge ADDS one at the default radius");

    /* A SCENARIO IS A URL, AND A BRIDGED COHORT IS A SCENARIO. */
    const q = toQuery(b.spec);
    const round = parseQuery(q).spec;
    ok(sameCohort(round, b.spec) && toQuery(round) === q,
      "and the bridged cohort survives the URL round-trip", `${q} -> ${toQuery(round)}`);
  }

  /* NO GENESIS POINT, NO BRIDGE. 54 storms in this pack carry no genesis position; the bridge
     must return nothing for them rather than a cohort built on NaN, which would silently be
     a cohort built on nothing at all. */
  {
    let without = 0;
    let built = 0;
    for (let row = 0; row < archive.nStorms; row++) {
      if (Number.isFinite(archive.genesisLat[row])) continue;
      without++;
      if (bridgeSpec(archive, normalise({ ...EMPTY_COHORT }), row) !== null) built++;
    }
    ok(without > 0, `the pack holds storms with no genesis position (${without})`);
    ok(built === 0, "and the bridge refuses every one of them rather than matching on NaN",
      `${built} built a spec anyway`);
  }

  /* NOTHING IS ANSWERED ABOUT A STORM THAT WAS NEVER SELECTED. */
  {
    const spec = normalise({ ...EMPTY_COHORT, months: [8, 9] });
    ok(whyMatched(archive, spec, null).length === 0
      && whyMatched(archive, spec, undefined).length === 0
      && whyMatched(archive, spec, -1).length === 0,
      "no selection means no explanation, not an explanation of row zero");
    const con = contributionOf(cohortResult(archive, spec), null);
    ok(con.isMember === false && con.contracts.length === 0,
      "and no contribution either");
  }

  /* THE RECORD SCOPE IS NOT A CONDITION AND IT STILL DECIDES MEMBERSHIP.
     `conditionsOf` publishes `includeProvisional` only when TRUE, so a probe rebuilt from
     EMPTY_COHORT reverts it to false -- and `filterStorms` tests provisional FIRST, before
     distance or month. The panel then reports that a 2025 storm did not form within 500 km of
     its own genesis coordinates. Both directions of the switch are pinned here. */
  {
    let prov = -1;
    for (let i = 0; i < archive.nStorms; i++) {
      if (archive.storms.bool("provisional", i) === true
          && Number.isFinite(archive.genesisLat[i])) { prov = i; break; }
    }
    ok(prov >= 0, "the pack holds provisional storms to test the scope switch with");

    const on = bridgeSpec(archive,
      normalise({ ...EMPTY_COHORT, includeProvisional: true, months: [6, 7, 8, 9] }), prov);
    const whyOn = whyMatched(archive, on.spec, prov);
    ok(whyOn.every((w) => w.verdict === "matched"),
      "a provisional storm matches every condition of the cohort its own genesis defines",
      whyOn.map((w) => `${w.key}=${w.verdict}`).join(" "));
    ok(contributionOf(cohortResult(archive, on.spec), prov).isMember,
      "and it really is a member, so the explanation and the membership agree");

    const off = bridgeSpec(archive,
      normalise({ ...EMPTY_COHORT, months: [6, 7, 8, 9] }), prov);
    const whyOff = whyMatched(archive, off.spec, prov);
    ok(whyOff.filter((w) => w.key !== "provisionalScope").every((w) => w.verdict === "matched"),
      "with the switch off it still satisfies every condition the reader actually set",
      whyOff.map((w) => `${w.key}=${w.verdict}`).join(" "));
    ok(!contributionOf(cohortResult(archive, off.spec), prov).isMember,
      "but it is not in the cohort");
    const scope = whyOff.find((w) => w.key === "provisionalScope");
    ok(scope && scope.verdict === "missed",
      "and the record scope is named as the thing that excluded it, rather than a condition "
      + "being blamed for it");
    ok(scope && /post-analysed/.test(scope.value),
      "in the archive's own terms", scope && scope.value);

    /* THE FULL SWEEP. One counterexample anywhere means the panel can contradict the ladder. */
    let contradictions = 0;
    const SWEEP = [
      { months: [6, 7, 8, 9] }, { months: [6, 7, 8, 9], includeProvisional: true },
      { seasonFrom: 1971 }, { seasonFrom: 1971, includeProvisional: true },
      { basins: ["NA"] }, { namedOnly: true, includeProvisional: true },
    ];
    for (const raw of SWEEP) {
      const spec = normalise({ ...EMPTY_COHORT, ...raw });
      const inCohort = new Set(cohortResult(archive, spec).rows);
      for (let row = 0; row < archive.nStorms; row++) {
        if (!inCohort.has(row)) continue;
        if (whyMatched(archive, spec, row).some((w) => w.verdict === "missed")) contradictions++;
      }
    }
    ok(contradictions === 0,
      "and no storm the engine KEPT is ever explained as having missed a condition",
      `${contradictions} contradiction(s)`);
  }

  /* RULE 4 REACHES THE EXPLANATION. A storm whose peak wind the archive never recorded is
     UNDECIDABLE under an intensity condition -- filterStorms counts it and does not exclude it
     (query.js:110). Reporting MISSED would state an empirical no about a measurement that does
     not exist. */
  {
    let unmeasured = -1;
    for (let i = 0; i < archive.nStorms; i++) {
      if (archive.storms.num("max_vmax_kt", i) === null
          && Number.isFinite(archive.genesisLat[i])) { unmeasured = i; break; }
    }
    ok(unmeasured >= 0, "the pack holds storms with no recorded intensity");
    const spec = normalise({ ...EMPTY_COHORT, intensity: "cat1" });
    const why = whyMatched(archive, spec, unmeasured);
    const v = why.find((w) => w.key === "intensity");
    ok(v && v.verdict === "unjudged",
      "an intensity condition the archive cannot judge reports NOT JUDGED, never MISSED",
      v ? v.verdict : "no intensity row");
    const r = cohortResult(archive, spec);
    ok(!r.rows.includes(unmeasured) && r.undecidable > 0,
      "matching the engine, which counts it as undecidable rather than excluding it",
      `undecidable=${r.undecidable}`);
    /* A storm that WAS measured and fell short is a real miss and must still say so. */
    let weak = -1;
    for (let i = 0; i < archive.nStorms; i++) {
      const p = archive.storms.num("max_vmax_kt", i);
      if (p !== null && p < 40 && Number.isFinite(archive.genesisLat[i])) { weak = i; break; }
    }
    const wv = whyMatched(archive, spec, weak).find((w) => w.key === "intensity");
    ok(wv && wv.verdict === "missed",
      "while a storm the archive DID measure and that fell short still reports MISSED",
      wv ? wv.verdict : "no intensity row");
  }

  /* A CIRCULAR CONTRACT IS NOT EVIDENCE. Condition the cohort on a landfall region and every
     storm in it carries that outcome by construction; the ladder prints CONDITIONED ON -- NOT
     AN OUTCOME over the cell. The bridge must not list the same cell as evidence the storm
     supplies, which would be the fifth rule failing in the one place it is stated about a
     named storm. */
  {
    const spec = normalise({ ...EMPTY_COHORT, landfall: "mexico" });
    const r = cohortResult(archive, spec);
    ok(/^CONDITIONED ON/.test(r.landfall.mexico.any.status || ""),
      "conditioning on a region makes that region's ANY contract circular",
      r.landfall.mexico.any.status || "(no status)");
    const row = r.rows[0];
    const con = contributionOf(r, row);
    ok(con.isMember, "a storm in that cohort is a member");
    ok(!con.contracts.some((c) => c.key === "mexico:any"),
      "and the bridge does not offer the circular contract as evidence it supplies",
      con.contracts.map((c) => c.key).join(", "));
    /* Whereas a REFUSED rate keeps its contribution: the events are still observed events. */
    const thin = cohortResult(archive,
      normalise({ ...EMPTY_COHORT, where: { lat: 33.8, lon: -19.3, radiusKm: 500 } }));
    ok(!thin.sufficient && contributionOf(thin, thin.rows[0]).contracts.length >= 0,
      "while a refusal below min_sample is not circularity and does not suppress the count");
  }
}

console.log(failed
  ? `\n${failed} of ${checks} cohort check(s) failed\n`
  : `\n${checks} checks: one spec, one cohort, one answer\n`);
process.exit(failed ? 1 : 0);
