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

console.log(failed
  ? `\n${failed} of ${checks} cohort check(s) failed\n`
  : `\n${checks} checks: one spec, one cohort, one answer\n`);
process.exit(failed ? 1 : 0);
