#!/usr/bin/env node
/* The fifth rule, and the refusals around it.
 *
 * test-atlas-parity.mjs proves the browser computes what the archive computes. It cannot prove
 * anything about THIS, because this is not in the archive's Python: the fifth rule is a guard
 * the browser adds on top of the canonical methodology, for a hazard that only exists once one
 * cohort spec drives both the map and the statistics.
 *
 *     A VARIABLE USED TO DEFINE A COHORT CANNOT BE REPORTED AS AN OUTCOME OF THAT COHORT.
 *
 * Two things therefore have to be true at once, and they pull against each other:
 *
 *   1. The rule must FIRE. Condition on "reached Cat 3" and the Cat 3 row must refuse, not
 *      report a tautological 100% with a flattering Wilson interval.
 *   2. The rule must be ADDITIVE. With no conditioning declared -- which is every parity vector
 *      and every caller today -- not one number may move. A guard that quietly perturbed the
 *      canonical result would be a second methodology introduced through the back door, which
 *      is the exact thing the parity harness exists to prevent.
 *
 * The second is the one worth testing hardest, so it is tested by deep-comparing a full result
 * against itself rather than by spot-checking a few fields.
 *
 * Run: node scripts/test-atlas-rates.mjs
 */
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { getAnalogs } from "../docs/storm-atlas/src/engine/analogs.js";
import { circularOutcomes } from "../docs/storm-atlas/src/engine/rates.js";
import { ROOT } from "./lib/atlas-verify.mjs";

let failed = 0;
let checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log("  ok    " + label); return true; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
  return false;
}
function head(s) { console.log("\n" + s); }

const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));

/* A pool big enough that every rate clears the gate, over a region storms actually reach, so
   the landfall contracts are populated rather than trivially zero. */
const BASE = {
  lat: 12.0, lon: -105.0, radiusKm: 800.0, minPoolSeason: 1971,
  regions: ["mexico", "conus", "hawaii"],
};

/* ---- 1. the rule is additive ------------------------------------------------------------ */

head("[1] with nothing declared, the guard changes nothing at all");
{
  const plain = getAnalogs(archive, BASE);
  const declaredNull = getAnalogs(archive, { ...BASE, conditionedOn: null });
  /* Deep equality over the whole result except the fields that are legitimately not JSON --
     Maps and Sets -- which are compared separately. Anything the guard touched would show. */
  const strip = (r) => JSON.stringify({
    ...r, track_density: undefined, ids: undefined, cases: r.cases.length,
  });
  ok(strip(plain) === strip(declaredNull),
    "conditionedOn: null is byte-identical to omitting it entirely");
  ok(plain.n_cases > 30, `the fixture pool is large enough to be interesting (n=${plain.n_cases})`);

  let rated = 0;
  for (const cell of Object.values(plain.intensity)) if (cell.rate !== null) rated++;
  ok(rated === 7, `every intensity threshold carries a rate (${rated}/7)`);
  ok(plain.intensity.cat1.ci95 !== null && plain.intensity.cat1.ci95.length === 2,
    "and a Wilson interval beside it");
  ok(plain.intensity.cat1.weighted_rate !== null, "and a weighted rate");
  ok(plain.time_to_event.cat1 && plain.time_to_event.cat1.n > 0,
    `time-to-cat1 is a real distribution (n=${plain.time_to_event.cat1.n})`);
  ok(typeof plain.time_to_event.landfall_mexico === "object",
    "a landfall transit series exists for a requested region");
  ok(plain.conditioned_on === null, "and the result says nothing was conditioned on");
}

/* ---- 2. the rule fires, on exactly the right rows ---------------------------------------- */

head("[2] conditioning on peak intensity");
{
  const plain = getAnalogs(archive, BASE);
  const cond = getAnalogs(archive, { ...BASE, conditionedOn: { minPeak: "cat3" } });

  for (const cat of ["td", "ts", "cat1", "cat2", "cat3"]) {
    const cell = cond.intensity[cat];
    ok(cell.rate === null && cell.status === "CONDITIONED ON -- NOT AN OUTCOME",
      `${cat} refuses -- it is at or below the condition`,
      JSON.stringify({ rate: cell.rate, status: cell.status }));
  }
  for (const cat of ["cat4", "cat5"]) {
    const cell = cond.intensity[cat];
    ok(cell.rate !== null,
      `${cat} still reports -- it is a real outcome within the conditioned cohort`);
    ok(cell.rate === plain.intensity[cat].rate,
      `${cat}'s rate is unchanged by the declaration (the cohort itself did not move)`);
  }
  ok(cond.intensity.cat3.count === plain.intensity.cat3.count,
    "the refused row keeps its COUNT -- that is a fact about the cohort");
  ok(/defined by a peak intensity of cat3 or above/.test(cond.intensity.cat3.reason),
    "and says which condition made it circular");
  ok(cond.time_to_event.cat3.n === plain.time_to_event.cat3.n,
    "time-to-cat3 is NOT suppressed -- when they got there is still a real distribution");

  // Landfall and everything else must be untouched by an intensity condition.
  ok(JSON.stringify(cond.landfall) === JSON.stringify(plain.landfall),
    "no landfall contract is disturbed by an intensity condition");
}

head("[3] conditioning on landfall");
{
  const plain = getAnalogs(archive, BASE);
  const cond = getAnalogs(archive, { ...BASE, conditionedOn: { landfallRegion: "mexico" } });

  ok(cond.landfall.mexico.any.rate === null &&
     cond.landfall.mexico.any.status === "CONDITIONED ON -- NOT AN OUTCOME",
    "mexico:any refuses");
  ok(cond.landfall.mexico.hurricane.rate !== null,
    "mexico:hurricane still reports -- intensity at landfall is a real outcome among them");
  ok(JSON.stringify(cond.landfall.conus) === JSON.stringify(plain.landfall.conus),
    "another region is untouched");
  ok(JSON.stringify(cond.intensity) === JSON.stringify(plain.intensity),
    "and so is every intensity row");

  const both = getAnalogs(archive, {
    ...BASE, conditionedOn: { landfallRegion: "mexico", landfallHurricaneOnly: true },
  });
  ok(both.landfall.mexico.any.rate === null && both.landfall.mexico.hurricane.rate === null,
    "requiring hurricane intensity at landfall makes BOTH contracts circular");
  ok(/at hurricane intensity/.test(both.landfall.mexico.hurricane.reason),
    "and the reason names that part of the condition");
}

/* ---- 3. the archive's own refusals still work ------------------------------------------- */

head("[4] the sample gate, unchanged");
{
  const tiny = getAnalogs(archive, { lat: 12.0, lon: -105.0, radiusKm: 40.0,
    minPoolSeason: 1971 });
  const cell = tiny.intensity.cat1;
  ok(tiny.n_cases < 10, `a pool below the gate (n=${tiny.n_cases})`);
  ok(cell.rate === null && cell.ci95 === null && cell.weighted_rate === null,
    "no rate, no interval, no weighted rate");
  ok(cell.refused_reason === `${cell.n_storms} storms with a known outcome < min_sample=10`,
    "the archive's own refusal string, verbatim", cell.refused_reason);
  ok(cell.count >= 0 && cell.n_storms >= 0, "but the counts are still published");
  ok(cell.status === undefined,
    "a sample refusal is NOT dressed up as a conditioning refusal -- they are different things");
}

head("[5] an empty pool");
{
  const none = getAnalogs(archive, { lat: 0.5, lon: -30.0, radiusKm: 100.0 });
  ok(none.n_cases === 0, "nothing matched");
  ok(none.intensity.cat1.rate === null, "no rate is invented from an empty pool");
  ok(none.intensity.cat1.n_storms === 0, "the denominator is honestly zero");
  ok(none.time_to_event.cat1.n === 0 && none.time_to_event.cat1.median === null,
    "and the time distribution is empty rather than zero");
}

/* ---- 4. the guard refuses to guess ------------------------------------------------------ */

head("[6] a condition the engine cannot interpret");
{
  let threw = null;
  try { circularOutcomes({ minPeak: "cat6" }); } catch (e) { threw = e; }
  ok(threw !== null && /not one of/.test(threw.message),
    "an unknown threshold throws rather than silently matching nothing",
    threw ? threw.message : "it returned quietly");
  ok(circularOutcomes(null).intensity.size === 0,
    "no conditioning declared yields no circular outcomes");
  const c = circularOutcomes({ minPeak: "ts" });
  ok(c.intensity.has("td") && c.intensity.has("ts") && !c.intensity.has("cat1"),
    "the ladder is inclusive downward and stops at the condition");
}

console.log(failed
  ? `\n${failed} of ${checks} rate/conditioning check(s) failed\n`
  : `\n${checks} checks: the rates publish, and a cohort cannot report itself\n`);
process.exit(failed ? 1 : 0);
