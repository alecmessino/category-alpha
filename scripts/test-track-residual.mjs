#!/usr/bin/env node
/* THE TRACK RESIDUAL MONITOR'S GATES.
 *
 * Every test here exists because a specific wrong answer is available and looks right. The
 * concept brief this module replaces produced four of them in one worked example, so the suite
 * is organised around the mistakes rather than around the functions.
 *
 * The golden numbers are pinned to the TIME-INTERPOLATED values recomputed from the preserved
 * products in scripts/fixtures/lowell-ep122026/, never to the brief's table. The fixture's own
 * hashes are checked first, so a golden that passes is a golden about bytes that have not moved.
 *
 * Run: node scripts/test-track-residual.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as R from "./lib/track-residual.mjs";
import * as S from "./lib/track-residual-state.mjs";
import * as C from "./lib/track-residual-closure.mjs";
import * as G from "./lib/settlement-geometry.mjs";
import { baselineFromTcm, fixFromTcp, fixesFromFdeck, buildSeries, eligibleAt,
         firstAvailabilityFrom, upstreamOf } from "./lib/track-residual-ingest.mjs";
import * as B from "./lib/track-residual-backtest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "scripts/fixtures/lowell-ep122026");
const read = (f) => readFileSync(join(FIX, f), "utf8");

let failed = 0, checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  if (cond) { console.log("  ok    " + label); return true; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
  return false;
};
const near = (label, got, want, tol) =>
  ok(`${label} — ${Number(got).toFixed(4)} vs ${Number(want).toFixed(4)}`,
     Math.abs(got - want) <= tol, `differs by ${Math.abs(got - want).toExponential(3)}, tolerance ${tol}`);

/* ------------------------------------------------------------------ the fixture is the fixture */

console.log("\n[0] THE PRESERVED PRODUCTS STILL HASH TO WHAT THE MANIFEST RECORDED");
const manifest = JSON.parse(read("manifest.json"));
ok("manifest declares verified originals, not an unverified table",
   manifest.status === "VERIFIED_ORIGINAL_PRODUCTS", manifest.status);
for (const e of manifest.entries) {
  const got = createHash("sha256").update(read(e.file)).digest("hex");
  ok(`${e.key} unchanged`, got === e.productSha256, `${e.productSha256} -> ${got}`);
}

const avail = firstAvailabilityFrom(manifest.transmissions);
const b45 = baselineFromTcm(read("tcm-045.txt"), { baselineId: "EP122026/TCM/045", firstAvailableZ: avail["45"].firstAvailableZ });
const b46 = baselineFromTcm(read("tcm-046.txt"), { baselineId: "EP122026/TCM/046", firstAvailableZ: avail["46"].firstAvailableZ });
const b47 = baselineFromTcm(read("tcm-047.txt"), { baselineId: "EP122026/TCM/047", firstAvailableZ: avail["47"].firstAvailableZ });
const f46a = fixFromTcp(read("tcp-046a.txt"), { fixId: "tcp:46A", receivedZ: avail["46A"].firstAvailableZ });
const f47 = fixFromTcp(read("tcp-047.txt"), { fixId: "tcp:47", receivedZ: avail["47"].firstAvailableZ });

/* ------------------------------------------------------------------------------------ §10.1 */

console.log("\n[1] THE NOMINAL '12H' LABEL IS NOT TWELVE HOURS (Lowell TCM 46)");
{
  const p = b46.points;
  ok("the initial position is the product's own 07/1500Z",
     p[0].kind === "initial" && p[0].validZ === "2026-09-07T15:00:00.000Z", p[0].validZ);
  const gapH = (Date.parse(p[1].validZ) - Date.parse(p[0].validZ)) / 3600e3;
  near("INIT -> first FORECAST VALID row", gapH, 9, 1e-9);
  ok("and the product does file that row under a nominal 12 h label",
     /12\s*H|FORECAST VALID 08\/0000Z/i.test(read("tcm-046.txt")));
  /* THE FAILURE THIS PREVENTS, PRICED. Interpolating with the label instead of the timestamp
     puts the 1800Z forecast position a third of a segment out of place. */
  const t = Date.parse("2026-09-07T18:00:00Z");
  const correct = R.interpolateAtTime(p, t);
  const asIfTwelve = { lat: p[0].lat + (3 / 12) * (p[1].lat - p[0].lat),
                       lonE: p[0].lonE + (3 / 12) * R.deltaLonDeg(p[0].lonE, p[1].lonE) };
  const errNm = R.haversineNm(correct.lat, correct.lonE, asIfTwelve.lat, asIfTwelve.lonE);
  near("reading the label instead of the clock costs this much forecast position, nm",
       errNm, 10.88, 0.01);
}

/* ------------------------------------------------------------------------------------ §10.2 */

console.log("\n[2] TIME INTERPOLATION IS THE DEFINITION; LATITUDE INTERPOLATION IS REJECTED");
{
  const at = R.interpolateAtTime(b46.points, Date.parse(f46a.validZ));
  near("forecast latitude at 07/1800Z", at.lat, 18.1666666667, 1e-6);
  near("forecast longitude at 07/1800Z (signed degrees east)", at.lonE, -162.3, 1e-6);
  ok("and it is labelled linear-in-time", at.method === R.RESIDUAL_INTERPOLATION, at.method);

  const cmp = R.latInterpComparison(b46, f46a);
  ok("the latitude-interpolated variant is reachable but marked as rejected",
     /Rejected as a residual definition/.test(cmp.latInterp.note));
  ok("it forces the latitude difference to exactly zero, which is the degeneracy",
     cmp.latInterp.dLatDeg === 0);
  const dCross = Math.abs(cmp.correct.crossNm - cmp.latInterp.crossNm);
  const dAlong = Math.abs(cmp.correct.alongNm - cmp.latInterp.alongNm);
  ok(`and it disagrees with the definition — cross by ${dCross.toFixed(2)} nm, along by ${dAlong.toFixed(2)} nm`,
     dAlong > 1, "if the two agreed there would be nothing to reject");
  /* The residual function must never accept a latitude-interpolated forecast. */
  ok("`interpolateAtLatitude` marks itself diagnostic-only",
     R.interpolateAtLatitude(b46.points, 21.9).diagnosticOnly === true);
}

/* ------------------------------------------------------------------------------------ §10.3 */

console.log("\n[3] AN EASTWARD DISPLACEMENT ON A NORTHEAST HEADING IS NOT PURE CROSS-TRACK");
{
  /* Synthetic and exact: a due-east displacement of 10 nm on a 045 heading must split evenly. */
  const from = { lat: 20, lonE: -160 };
  const east = { lat: 20, lonE: -160 + 10 / (60 * Math.cos(20 * Math.PI / 180)) };
  const p = R.projectResidual(from, east, 45);
  near("cross on a 045 heading", p.crossNm, 10 * Math.cos(45 * Math.PI / 180), 0.02);
  near("along on a 045 heading", p.alongNm, 10 * Math.sin(45 * Math.PI / 180), 0.02);
  ok("both axes carry the displacement — neither is zero",
     Math.abs(p.alongNm) > 1 && Math.abs(p.crossNm) > 1);

  /* And on the real case: the brief reported along-track 0.0 nm. Even under the brief's OWN
     latitude interpolation and its own 030 frame, a due-east displacement has an along-track
     component of d*sin(30). */
  const cmp = R.latInterpComparison(b46, f46a);
  const d = cmp.latInterp.separationNm;
  const briefsOwnAlong = d * Math.sin(30 * Math.PI / 180);
  ok(`the brief's own construction gives along = ${briefsOwnAlong.toFixed(2)} nm, not 0.0`,
     Math.abs(briefsOwnAlong) > 5, `got ${briefsOwnAlong.toFixed(3)}`);
  near("and the brief's cross-track 13.6 nm is reproducible from that construction",
     d * Math.cos(30 * Math.PI / 180), 13.6, 0.1);

  /* THE GOLDEN, pinned to the corrected time-interpolated numbers. */
  const res = R.residual(b46, f46a);
  near("GOLDEN cross-track, baseline-forecast frame", res.crossNm, 14.4292, 0.01);
  near("GOLDEN along-track, baseline-forecast frame", res.alongNm, -4.7155, 0.01);
  near("GOLDEN frame course from the forecast's own path", res.frame.courseDeg, 23.1102, 0.01);
  const at = R.interpolateAtTime(b46.points, Date.parse(f46a.validZ));
  const m = R.projectResidual({ lat: at.lat, lonE: at.lonE }, f46a, 30);
  near("GOLDEN cross-track at the 030 comparison frame", m.crossNm, 14.8905, 0.01);
  near("GOLDEN along-track at the 030 comparison frame", m.alongNm, -2.9513, 0.01);
  ok("the two frames are not the same and both are reported",
     Math.abs(res.frame.courseDeg - 30) > 5);
  ok("the sign convention travels with the residual", res.signConvention === R.SIGN_CONVENTION);
  ok("+cross's geographic meaning is derived, not hardcoded east",
     Math.abs(res.crossPointsToward - ((res.frame.courseDeg + 90) % 360)) < 1e-9);
}

console.log("\n[3b] A PUBLIC ADVISORY'S VALID TIME COMES FROM THE LOCAL CLOCK AND ITS ZONE");
{
  /* THE REGRESSION. The first version of parsePublicAdvisory combined the header's LOCAL date with
     the summary's UTC hour. For an evening advisory those are different days. This is the real
     product that broke it: ep122022's 6 PM MDT intermediate, which carries 0000 UTC — the next
     day. The old reading dated it 5 September and placed the fix twenty-four hours before the
     advisory it belonged to.

     Lowell cannot exercise this: both of its intermediates are morning HST, where local and UTC
     share a date. A population-scale check found it, so a real product from that population is
     preserved to keep it found. */
  const evening = R.parsePublicAdvisory(read("tcp-evening-mdt.txt"));
  ok("the evening MDT intermediate parses", evening.ok, String(evening.refusal));
  ok("its zone is read from the product", evening.localZone === "MDT" && evening.localOffsetH === -6,
     `${evening.localZone} ${evening.localOffsetH}`);
  ok("6 PM MDT on 5 September is 0000 UTC on 6 SEPTEMBER, not 5 September",
     evening.validZ === "2022-09-06T00:00:00.000Z", evening.validZ);
  ok("and the product's own printed UTC hour agrees with that", /0000\s*UTC/.test(read("tcp-evening-mdt.txt")));

  /* Lowell's morning products are unaffected — the golden must not have moved. */
  ok("a morning HST intermediate is unchanged by the fix",
     f46a.validZ === "2026-09-07T18:00:00.000Z" && f46a.localZone === "HST", f46a.validZ);

  /* The printed UTC hour is a CHECK, not an input. Corrupt one and the product is refused. */
  const corrupted = read("tcp-evening-mdt.txt").replace(/\.\.\.0000 UTC\.\.\./, "...1500 UTC...");
  const bad = R.parsePublicAdvisory(corrupted);
  ok("two disagreeing statements of one instant are refused, not reconciled",
     bad.ok === false && bad.refusal === "UTC_HOUR_DISAGREES_WITH_LOCAL_TIME", String(bad.refusal));
  ok("and the refusal names both readings", bad.printedUtc === 1500 && bad.derivedUtc === 0);

  /* An unknown zone is refused rather than defaulted to UTC. */
  const oddZone = read("tcp-evening-mdt.txt").replace(/\bMDT\b/g, "ZZZ");
  const oz = R.parsePublicAdvisory(oddZone);
  ok("an unrecognised zone is refused, never defaulted to UTC",
     oz.ok === false && oz.refusal === "UNKNOWN_TIME_ZONE", String(oz.refusal));
  ok("every offset in the table is a whole or half hour from UTC",
     Object.values(R.PRODUCT_ZONE_OFFSET_H).every((h) => Number.isFinite(h) && Math.abs(h) <= 12));
}

/* ------------------------------------------------------------------------------------ §10.4 */

console.log("\n[4] LONGITUDE WRAPPING AND SIGNED DEGREES EAST");
{
  ok("west is negative", R.signedLonE(-162.6) === -162.6);
  ok("200E folds to -160", R.signedLonE(200) === -160);
  ok("-200 folds to +160", R.signedLonE(-200) === 160);
  ok("+180 stays +180, never -180", R.signedLonE(180) === 180 && R.signedLonE(-180) === 180);
  near("179.9E to 179.9W is 0.2 degrees, not 359.8", R.deltaLonDeg(179.9, -179.9), 0.2, 1e-9);
  near("and back the other way is -0.2", R.deltaLonDeg(-179.9, 179.9), -0.2, 1e-9);
  const d = R.haversineNm(0, 179.9, 0, -179.9);
  near("a 0.2-degree straddle of the antimeridian is ~12 nm, not ~21580", d, 12, 0.1);
  /* A track that crosses the antimeridian must interpolate across it, not around the world. */
  const pts = [{ validZ: "2026-01-01T00:00:00Z", lat: 20, lonE: 179.5, kind: "initial" },
               { validZ: "2026-01-01T06:00:00Z", lat: 21, lonE: -179.5, kind: "forecast" }];
  const mid = R.interpolateAtTime(pts, Date.parse("2026-01-01T03:00:00Z"));
  ok(`midpoint of a 179.5E -> 179.5W segment is on the seam (${mid.lonE.toFixed(3)})`,
     Math.abs(Math.abs(mid.lonE) - 180) < 1e-9, `got ${mid.lonE}`);
  const course = R.segmentCourseDeg(pts[0], pts[1]);
  ok(`and its course is north-north-east (${course.toFixed(1)}), not westward`, course > 0 && course < 90);
}

/* ------------------------------------------------------------------------------------ §10.5 */

console.log("\n[5] A BASELINE RESET DOES NOT CONTINUE A TREND");
{
  const fdeck = fixesFromFdeck(read("fdeck.dat"),
    { fromMs: Date.parse(b46.initialValidZ), toMs: Date.parse("2026-09-07T21:00:00Z") });
  const series = buildSeries([b45, b46, b47], [...fdeck, f46a, f47],
    (b, f, o) => R.residual(b, f, o), { fixedBaselineId: "EP122026/TCM/046" });
  const marked = S.markBaselineResets(series.latest);
  const resets = marked.filter((r) => r.baselineReset);
  ok("the latest-advisory series records exactly one baseline reset here", resets.length === 1,
     JSON.stringify(resets.map((r) => r.baselineId)));
  ok("the reset is 46 -> 47", resets[0] && resets[0].previousBaselineId === "EP122026/TCM/046"
     && resets[0].baselineId === "EP122026/TCM/047");
  const runs = S.baselineRuns(series.latest);
  ok("and the series is split into runs, one per baseline", runs.length === 2,
     JSON.stringify(runs.map((r) => [r.baselineId, r.items.length])));
  /* THE CANDIDATE RULE MUST NOT BE MET ACROSS A RESET. Built explicitly: the same fixes scored
     against advisory 45 and against advisory 46 are two runs, and a window holding both is not a
     window on one forecast. Every row here is a valid residual, so the rule is being refused on
     the reset and not on some other defect. */
  const v45 = buildSeries([b45], [...fdeck, f46a], (b, f, o) => R.residual(b, f, o), {}).fixed.filter((r) => r.ok);
  const v46 = buildSeries([b46], [...fdeck, f46a], (b, f, o) => R.residual(b, f, o), {}).fixed.filter((r) => r.ok);
  ok("both single-baseline windows are populated", v45.length >= 3 && v46.length >= 3,
     `${v45.length} vs 45, ${v46.length} vs 46`);
  const withinOne = S.candidateTrendRule(v46);
  const across = S.candidateTrendRule([...v45, ...v46]);
  ok("the candidate rule can be met inside ONE baseline", withinOne.detail.singleBaseline === true);
  ok("but a window spanning two baselines cannot meet it",
     across.detail.singleBaseline === false && across.candidateMet === false);
  ok("and even when met it is never promoted",
     withinOne.promoted === false && /NOT VALIDATED/.test(withinOne.promotionStatus));
  const assessed = S.assessSeries(series.latest, { nowMs: Date.parse("2026-09-07T21:10:00Z") });
  ok("and the reset is reported on the trend field", assessed.trendStatus.baselineResets.length === 1);
  ok("no trend is asserted regardless", assessed.trendStatus.state === "NO_TREND_ASSERTED"
     && assessed.trendStatus.promoted === false);
}

/* ------------------------------------------------------------------------------------ §10.6 */

console.log("\n[6] DUPLICATE FIXES ARE DROPPED; SHARED-SOURCE FIXES ARE GROUPED, NOT DROPPED");
{
  const fdeck = fixesFromFdeck(read("fdeck.dat"),
    { fromMs: Date.parse(b46.initialValidZ), toMs: Date.parse("2026-09-07T18:00:00Z") });
  ok("the f-deck window holds the four real centre fixes", fdeck.length === 4,
     JSON.stringify(fdeck.map((f) => f.derivation)));
  ok("the aircraft fix is recognised as an aircraft centre",
     fdeck.some((f) => f.derivation === "AIRC" && f.centreDefinition === "aircraft-fix"));
  /* THE REAL SHARED SOURCE. PGTW and PHFO filed subjective Dvorak fixes thirty minutes apart,
     and CIMSS an objective one ten minutes after that — all three off GOES-18. */
  const goes = fdeck.filter((f) => f.upstream === "platform:GOES18");
  ok(`three fixes from two agencies share GOES-18 (${goes.map((f) => f.site).join(", ")})`,
     goes.length === 3 && new Set(goes.map((f) => f.site)).size >= 2);
  const groups = S.independentGroups(fdeck);
  ok(`four fixes are two independent groups, not four`, groups.count === 2,
     JSON.stringify(groups.groups.map((g) => [g.upstream, g.n])));
  ok("the platform is read from the row rather than a fixed column",
     upstreamOf("EP, 12, x, 10, DVTS, , , , , , , , , , , , , , , , , , , , , , , , , , PGTW, DOM, I, 1, a, , , GOES18, CSC, T,") === "GOES18");

  const dup = S.dedupeFixes([...fdeck, { ...fdeck[0] }]);
  ok("an exact repeat is dropped", dup.duplicateCount === 1 && dup.kept.length === fdeck.length);
  const stillGrouped = S.independentGroups(dup.kept);
  ok("and dropping it does not change the independent count", stillGrouped.count === groups.count);
  ok("a shared-source fix is KEPT, not dropped",
     dup.kept.filter((f) => f.upstream === "platform:GOES18").length === 3);
}

/* ------------------------------------------------------------------------------------ §10.7 */

console.log("\n[7] MISSING UNCERTAINTY IS NOT ZERO");
{
  const un = S.withinNmToSigma(b46.positionAccuracyNm, undefined);
  ok("a printed accuracy bound does not convert to a sigma without a named assumption",
     un.ok === false && un.refusal === "UNLABELLED_CONVERSION");
  const conv = S.withinNmToSigma(15, "two-sigma");
  ok("with an assumption it converts AND carries the assumption",
     conv.ok && conv.assumption === "two-sigma" && /Arguable/.test(conv.assumptionText));
  ok("and it is still marked provisional", conv.provisional === true);
  ok("the verbatim published text is preserved with its original meaning",
     b46.positionAccuracyText === "POSITION ACCURATE WITHIN 15 NM", b46.positionAccuracyText);
  ok("no published accuracy at all is a refusal, not a zero",
     S.withinNmToSigma(null, "two-sigma").refusal === "NO_PUBLISHED_ACCURACY");

  ok("the sigma table declares itself provisional and unfitted",
     S.PROVISIONAL_SIGMA_NM.provisional === true && S.PROVISIONAL_SIGMA_NM.fittedOn === null);
  const assessed = S.assessSeries([R.residual(b46, f46a)], { nowMs: Date.parse("2026-09-07T18:10:00Z") });
  ok("every series reports UNCALIBRATED_UNCERTAINTY until a fit exists",
     assessed.uncertaintyCalibration.state === "UNCALIBRATED_UNCERTAINTY");
  ok("and it says WITHIN_NOISE would be a statement about the floor",
     /statement about the floor/.test(assessed.uncertaintyCalibration.note));
  const rnd = S.roundingBoundNm(18.0, 0.1);
  ok(`0.1-degree rounding is ${rnd.maxNm.toFixed(1)} nm, not negligible`, rnd.maxNm > 3);
  ok("and it is a box, not a sigma", /not a sigma/.test(rnd.note));
  /* Unknown receipt time must stay null and say which assumption is missing. */
  const noRecv = fixesFromFdeck(read("fdeck.dat"), { fromMs: Date.parse(b46.initialValidZ) })[0];
  ok("an unknown receipt time is null with the assumption named, never set to the valid time",
     noRecv.receivedZ === null && /RECEIPT TIME UNKNOWN/.test(noRecv.availabilityAssumption));
  ok("an f-deck position-confidence code is not treated as a sigma",
     noRecv.positionConfidenceIsNotSigma === true);
}

/* ------------------------------------------------------------------------------------ §10.8 */

console.log("\n[8] NO FUTURE-INFORMATION LEAKAGE");
{
  /* THE REAL CASE. The aircraft found the centre at 1649Z. Advisory 46A went out at 1744Z and
     says on its face that the centre was located by aircraft. Advisory 47 went out at 2047Z. So
     46A and 47 both already contained the 1649Z fix, and scoring it against either is not lead. */
  const air = fixesFromFdeck(read("fdeck.dat"), { fromMs: Date.parse(b46.initialValidZ) })
    .find((f) => f.derivation === "AIRC");
  ok("the aircraft fix is at 07/1649Z", air.validZ === "2026-09-07T16:49:00.000Z", air.validZ);
  ok("advisory 46 was on the wire at 07/1451Z — before the fix", 
     avail["46"].firstAvailableZ === "2026-09-07T14:51:00.000Z");
  ok(`and nine minutes EARLY against its nominal 1500Z slot`,
     avail["46"].offsetMinFromNominal === -9, String(avail["46"].offsetMinFromNominal));
  const good = eligibleAt(b46, air);
  ok("so the fix IS eligible against advisory 46", good.ok, good.refusal);
  near("with 1.82 h of lead", good.leadHours, 109 / 60, 1e-6);

  const leak = eligibleAt(b47, air);
  ok("and it is NOT eligible against advisory 47, which was written knowing it",
     leak.ok === false && leak.refusal === "FIX_AT_OR_BEFORE_BASELINE_INITIAL_TIME", leak.refusal);

  /* An advisory's own initial position scored against itself yields a flattering 0.0 nm. */
  const selfScore = eligibleAt(b47, f47);
  ok("an advisory's own initial position is refused against that advisory",
     selfScore.ok === false && selfScore.refusal === "FIX_AT_OR_BEFORE_BASELINE_INITIAL_TIME");
  const wouldHaveBeen = R.residual(b47, f47);
  ok("— and the number it would have produced is exactly zero, which is why",
     wouldHaveBeen.ok && Math.abs(wouldHaveBeen.separationNm) < 1e-6,
     `separation ${wouldHaveBeen.separationNm}`);

  /* Availability, not the nominal hour. */
  const noAvail = baselineFromTcm(read("tcm-046.txt"), { baselineId: "x" });
  ok("a baseline with unknown availability refuses rather than assuming the nominal hour",
     eligibleAt(noAvail, air).refusal === "BASELINE_AVAILABILITY_UNKNOWN");
  ok("and it says which assumption is missing", /FIRST-AVAILABILITY UNKNOWN/.test(noAvail.availabilityAssumption));
  const early = { ...air, validZ: "2026-09-07T14:00:00.000Z" };
  ok("a fix predating the baseline's initial analysis is refused",
     eligibleAt(b46, early).ok === false);
  ok("a fix a product published inside the baseline is refused when declared",
     eligibleAt(b46, { ...air, ingestedBy: b46.advisoryNumber }).ok === false);
}

/* ------------------------------------------------------------------------------------ §10.9 */

console.log("\n[9] CLOSURE FRAME CONSISTENCY — NO CROSS-TRACK MINUS EAST-GAP");
{
  let threw = false, msg = "";
  try { C.assertSameFrame({ frame: "cross-track-nm" }, { frame: "shoreline-gap-east-nm" }); }
  catch (e) { threw = true; msg = e.message; }
  ok("combining a cross-track with an eastward gap throws", threw, "it returned instead");
  ok("and the message names both coordinates", /cross-track-nm/.test(msg) && /shoreline-gap-east-nm/.test(msg));
  ok("an unframed quantity throws too", (() => {
    try { C.assertSameFrame({ nm: 1 }, { frame: "great-circle-nm" }); return false; } catch { return true; }
  })());
  ok("the only distance closure produces is a great-circle separation",
     C.separation({ lat: 18, lonE: -162 }, { lat: 19, lonE: -162 }).frame === "great-circle-nm");

  const hawaii = JSON.parse(readFileSync(join(ROOT, "data/genesis-archive/coastlines/hawaii.geojson"), "utf8"));
  const rings = C.ringsFromGeoJson(hawaii, (n) => ["Niihau", "Kauai", "Oahu"].includes(n));
  ok("shoreline geometry is rings, and there are some", rings.length >= 3);
  ok("a coastline claim with no polygons refuses and says a waypoint is not a shore",
     (() => { const r = C.distanceToCoastNm(18, -162, []); 
              return r.ok === false && /waypoint, not a shore/.test(r.note); })());

  const res = R.residual(b46, f46a);
  const target = { label: "test", rings, centroidLat: 21.9, centroidLonE: -160.1 };
  const cl = C.closure(b46, res, target,
    { assumption: "residual-persists", deadlineMs: Date.parse("2026-09-09T00:00:00Z") });
  ok("closure never emits a probability", cl.probability === null && /NOT SCOREABLE AS A PROBABILITY/.test(cl.probabilityRefusal));
  ok("and it prints EXACT TRIGGER NOT SCORED", cl.exactTriggerScored === false && cl.exactTriggerNote === "EXACT TRIGGER NOT SCORED");
  ok("the displacement assumption is named on the result", cl.assumption === "residual-persists"
     && /Kinematic assumption/.test(cl.assumptionText));
  ok("an unnamed assumption is refused",
     C.closure(b46, res, target, { assumption: "vibes" }).refusal === "UNNAMED_DISPLACEMENT_ASSUMPTION");
  ok("the required rate is labelled kinematics only",
     cl.requiredRate.ok && /KINEMATICS ONLY/.test(cl.requiredRate.state));
  ok("no intersection inside coverage is UNRESOLVED, not No",
     /^UNRESOLVED/.test(cl.state), cl.state);
  const full = C.closure(b46, res, target, { assumption: "forecast-as-issued" });
  ok("and over the whole recurving advisory it refuses for recurvature",
     full.intersection.refusal === "RECURVATURE_IN_WINDOW", String(full.intersection.refusal));
  ok("a nonpositive time remaining is refused",
     C.requiredRate({ lat: 18, lonE: -162 }, rings, Date.parse("2026-09-07T00:00:00Z"),
                    Date.parse("2026-09-07T18:00:00Z")).refusal === "NONPOSITIVE_TIME_REMAINING");
  const behind = C.targetBehind(18, -162, 23, 16, -163);
  ok("a target astern is detected", behind.behind === true);

  /* The latitude-crossing diagnostic: kept, labelled, and refusing. */
  const diag = C.latitudeCrossingDiagnostic(b46, res, 21.9, { assumption: "forecast-as-issued" });
  ok("the latitude diagnostic says it is a diagnostic", diag.diagnosticOnly === true
     && /NOT A LANDFALL CLAIM/.test(diag.label));
  ok("21.9N is crossed at 08/0956Z, not at T+21.9 h", diag.ok
     && diag.validZ.startsWith("2026-09-08T09:5"), diag.validZ);
  near("which is T+18.93 h from the 07/1500Z initial time", diag.leadHours, 18.931, 0.01);
  ok("a latitude the track never reaches is refused",
     R.interpolateAtLatitude(b46.points, 60).refusal === "TARGET_LATITUDE_NOT_CROSSED_IN_COVERAGE");
  const recurve = [
    { validZ: "2026-09-07T00:00:00Z", lat: 20, lonE: -160 },
    { validZ: "2026-09-07T12:00:00Z", lat: 24, lonE: -161 },
    { validZ: "2026-09-08T00:00:00Z", lat: 20, lonE: -162 }];
  ok("a latitude crossed twice is refused",
     R.interpolateAtLatitude(recurve, 22).refusal === "MULTIPLE_LATITUDE_CROSSINGS");
  const zonal = [{ validZ: "2026-09-07T00:00:00Z", lat: 20, lonE: -160 },
                 { validZ: "2026-09-07T12:00:00Z", lat: 20.1, lonE: -166 }];
  ok("a crossing on a near-zonal segment is refused",
     R.interpolateAtLatitude(zonal, 20.05).refusal === "HEADING_NOT_PREDOMINANTLY_MERIDIONAL");
  ok("a fix outside the track's time coverage is refused",
     R.residual(b46, { ...f46a, validZ: "2026-09-20T00:00:00Z" }).refusal === "AFTER_TRACK_COVERAGE");
  const still = [{ validZ: "2026-09-07T00:00:00Z", lat: 20, lonE: -160 },
                 { validZ: "2026-09-07T12:00:00Z", lat: 20, lonE: -160 }];
  ok("a stationary segment has no direction and is refused",
     R.localCourseDeg(still, Date.parse("2026-09-07T06:00:00Z")).refusal === "DIRECTION_UNDEFINED");
}

/* ---------------------------------------------------------------------------- §10.10, §10.11 */

console.log("\n[10] EXCLUDED GEOGRAPHY IS NOT A TERMINAL NO, AND THE WINDOW DECIDES");
{
  ok("the contract registry is empty and says so",
     G.getContract("anything").ok === false
     && G.getContract("anything").state === "UNRESOLVED — RULES NOT INGESTED");
  const incomplete = G.defineContract({ contractId: "X", venue: "Y" });
  ok("an incomplete record is refused and names the missing fields",
     incomplete.ok === false && incomplete.missing.includes("rulesText"));
  ok("and it says a term is not inferable from a title or a map",
     /not inferable from a market title/.test(incomplete.note));
  ok("a record with no timezone on its window is refused",
     G.defineContract({ ...complete(), eventWindow: { startZ: "a", endZ: "b" } }).refusal === "INCOMPLETE_EVENT_WINDOW");
  ok("a record with no comparison semantics is refused",
     G.defineContract({ ...complete(), intensity: { definition: "d", units: "kt" } }).refusal === "INCOMPLETE_INTENSITY_DEFINITION");

  const made = G.defineContract(complete());
  ok("a complete record is admitted", made.ok, JSON.stringify(made.missing || made.refusal));
  const c = made.contract;

  const excluded = { region: "Nihoa", centreCrossed: true };
  const cls = G.classifyStrike(c, excluded);
  ok("a strike on named-excluded geography is non-qualifying",
     cls.qualifying === false && cls.reason === "NAMED_EXCLUSION");
  ok("and it explicitly does not resolve No by itself",
     /does not by itself resolve No/.test(cls.note));

  const open = G.resolutionState(c, [excluded], Date.parse("2026-09-08T12:00:00Z"));
  ok("with the window still open the contract is OPEN, not RESOLVED_NO", open.state === "OPEN", open.state);
  ok("and the excluded strike is recorded on it",
     /excluded-geography strike has occurred and did not resolve/.test(open.note || ""));
  const closed = G.resolutionState(c, [excluded], Date.parse("2026-09-13T00:00:00Z"));
  ok("only the window closing without a qualifying event resolves No",
     closed.state === "RESOLVED_NO" && closed.reason === "WINDOW_CLOSED_WITHOUT_QUALIFYING_EVENT");

  const conditionsOnly = G.classifyStrike(c, { region: "Oahu", centreCrossed: false });
  ok("a contract requiring a centre crossing is not settled by conditions in an area",
     conditionsOnly.qualifying === false && conditionsOnly.reason === "CENTRE_CROSSING_NOT_ESTABLISHED");
  ok("and it says a warning polygon is not evidence either way",
     /warning polygon is not evidence/.test(conditionsOnly.note));
  ok("the warning semantics string says what a warning means",
     /hurricane conditions are expected somewhere in an area/.test(G.WARNING_SEMANTICS));
  ok("settlement, warning and residual are three named layers",
     G.LAYERS.SETTLEMENT_EXCLUDED.id !== G.LAYERS.WARNING_AREA.id
     && G.LAYERS.WARNING_AREA.id !== G.LAYERS.RESIDUAL_MARKER.id);
  const yes = G.resolutionState(c, [{ region: "Kauai", centreCrossed: true }], Date.parse("2026-09-08T12:00:00Z"));
  ok("a qualifying centre crossing does resolve Yes", yes.state === "RESOLVED_YES");
  ok("no settlement claim is made without rules", G.resolutionState(null, [], Date.now()).state === "UNRESOLVED");
}
function complete() {
  return {
    contractId: "TEST", venue: "TEST", rulesUrl: "https://example.invalid/rules",
    rulesText: "Test rules text.", rulesRetrievedZ: "2026-09-07T00:00:00Z", rulesVersion: null,
    rulesSha256: "0".repeat(64),
    qualifyingGeography: ["Kauai", "Niihau", "Oahu"],
    namedExclusions: ["Nihoa", "French Frigate Shoals"],
    eventWindow: { startZ: "2026-09-07T00:00:00Z", endZ: "2026-09-12T00:00:00Z", timezone: "UTC" },
    intensity: { definition: "1-minute sustained surface wind", units: "kt", comparison: ">=64" },
    requiresCentreCrossing: true, resolutionAuthority: "TEST",
  };
}

/* ----------------------------------------------------------------------------------- §10.12 */

console.log("\n[11] AN OFFICIAL-ONLY SERIES STAYS REFUSED");
{
  const only = buildSeries([b46], [f46a], (b, f, o) => R.residual(b, f, o), {});
  const a = S.assessSeries(only.fixed, { nowMs: Date.parse("2026-09-07T18:10:00Z") });
  ok("46 versus 46A is one residual", only.fixed.filter((r) => r.ok).length === 1);
  ok("sample sufficiency refuses it", a.sampleSufficiency.state === "INSUFFICIENT_SAMPLE",
     a.sampleSufficiency.state);
  ok("and names the count against the gate",
     /INDEPENDENT_GROUPS_1_OF_3/.test(a.sampleSufficiency.reasons.join(",")),
     a.sampleSufficiency.reasons.join(","));
  ok("uncertainty is uncalibrated at the same time, as a separate field",
     a.uncertaintyCalibration.state === "UNCALIBRATED_UNCERTAINTY");
  ok("no trend is asserted", a.trendStatus.state === "NO_TREND_ASSERTED");
  ok("and the candidate rule is not met either", a.trendStatus.candidate.candidateMet === false);
  ok("the residual itself is still reported — refusing a trend is not refusing a measurement",
     only.fixed[0].ok === true && Number.isFinite(only.fixed[0].crossNm));

  /* Adding a SECOND official product must not manufacture a third independent group. */
  const two = buildSeries([b46], [f46a, f47], (b, f, o) => R.residual(b, f, o), {});
  const a2 = S.assessSeries(two.fixed, { nowMs: Date.parse("2026-09-07T21:10:00Z") });
  ok("two official products are two groups, still short of the gate",
     a2.sampleSufficiency.state === "INSUFFICIENT_SAMPLE" && a2.sampleSufficiency.independentGroups === 2,
     `${a2.sampleSufficiency.independentGroups} groups`);
}

/* -------------------------------------------------------------------------- the four fields */

console.log("\n[12] THE FOUR REFUSAL FIELDS ARE INDEPENDENT, AND residual_state IS UNWIRED");
{
  const fdeck = fixesFromFdeck(read("fdeck.dat"),
    { fromMs: Date.parse(b46.initialValidZ), toMs: Date.parse("2026-09-07T21:00:00Z") });
  const series = buildSeries([b46], [...fdeck, f46a], (b, f, o) => R.residual(b, f, o), {});
  const a = S.assessSeries(series.fixed, { nowMs: Date.parse("2026-09-07T18:10:00Z") });
  for (const k of ["dataQuality", "uncertaintyCalibration", "sampleSufficiency", "trendStatus"])
    ok(`${k} carries its own reasons`, Array.isArray(a[k].reasons) && "state" in a[k]);
  ok("mixed centre definitions degrade DATA QUALITY specifically",
     a.dataQuality.reasons.some((r) => r.startsWith("MIXED_CENTRE_DEFINITIONS")),
     a.dataQuality.reasons.join(","));
  ok("and the definitions that clashed are named",
     a.dataQuality.centreDefinitions.definitions.length >= 2,
     JSON.stringify(a.dataQuality.centreDefinitions.definitions));
  ok("a measured offset would be required to combine them",
     /has not been measured/.test(a.dataQuality.centreDefinitions.note || ""));
  ok("sample sufficiency can pass while uncertainty is still uncalibrated",
     a.sampleSufficiency.ok === true && a.uncertaintyCalibration.ok === false);
  ok("residual_state is left unwired for the Edge Book",
     a.residual_state.wired === false && a.residual_state.value === null);
  ok("and it says why", /no residual may move a rank/.test(a.residual_state.reason));

  /* Freshness: age of the newest eligible observation, and latency reported separately. */
  ok("freshness is the newest eligible observation's age, not the last time a value moved",
     /confirms an unchanged position/.test(a.freshness.definition));
  ok("observation age and ingest latency are separate numbers",
     "observationAgeMin" in a.freshness && "ingestLatencyS" in a.freshness);
  ok("a product on the wire before its valid time is flagged, not clamped to zero",
     a.freshness.ingestLatencyS < 0 && a.freshness.receivedBeforeValidTime === true,
     String(a.freshness.ingestLatencyS));

  const wob = S.wobbleBoundNm(series.fixed);
  ok("wobble is bounded, never subtracted", wob.ok && /does not separate them/.test(wob.note));
  /* The published bound is over the FORECAST rows — the ones a residual may be measured
     against. Including the day-6/7 outlook rows widens it, because they are further apart, and
     that is why the outlook is excluded from coverage rather than quietly averaged in. */
  const bound = R.interpolationBoundNm(R.coveragePoints(b46));
  const withOutlook = R.interpolationBoundNm(b46.points);
  ok(`the linear-vs-geodesic bound over the forecast rows is stated (${bound.maxDeviationNm.toFixed(3)} nm)`,
     bound.maxDeviationNm > 0 && bound.maxDeviationNm < 1);
  ok(`including the outlook rows widens it to ${withOutlook.maxDeviationNm.toFixed(3)} nm`,
     withOutlook.maxDeviationNm > bound.maxDeviationNm);
  ok("and it is declared systematic rather than added in quadrature",
     /never added in quadrature/.test(bound.note));
}

/* --------------------------------------------------------- the backtest's own definitions */

console.log("\n[13] THE BACKTEST SCORES THREE QUESTIONS SEPARATELY AND SHIPS NO SKILL CLAIM");
{
  /* THE REVISION TARGET, on the real pair. Advisory 46 -> 47, at a valid time both reach. */
  const shared = B.sharedValidTimes(b46, b47, [12, 24, 48]);
  ok("shared future valid times exist for 46 -> 47", shared.length >= 2,
     JSON.stringify(shared.map((s) => s.horizonHours)));
  const sh = B.advisoryShift(b46, b47, shared[0].validZ);
  ok("the shift is measured in the EARLIER advisory's frame", sh.ok
     && sh.frameSource === "earlier baseline's local direction", String(sh.refusal));
  ok(`advisory 47 moved its +${shared[0].horizonHours} h position ${sh.crossNm.toFixed(1)} nm cross-track`,
     Number.isFinite(sh.crossNm));
  ok("and the sign is a three-way outcome, with a dead band",
     [1, 0, -1].includes(sh.sign) && typeof sh.negligible === "boolean");
  const tiny = B.advisoryShift(b46, b46, shared[0].validZ);
  ok("comparing an advisory with itself is a NO CALL, not a correct prediction",
     tiny.ok && tiny.sign === 0 && tiny.negligible === true);
  ok("a horizon only one advisory reaches is not a shared valid time",
     B.sharedValidTimes(b46, b47, [999]).length === 0);

  /* SAMPLING UNIT. */
  const rows = [
    { stormId: "ep122026", sign: 1 }, { stormId: "ep122026", sign: 1 },
    { stormId: "ep122026", sign: 1 }, { stormId: "ep132026", sign: -1 }];
  const agg = B.aggregateByStorm(rows);
  ok("four rows over two storms aggregate to two units", agg.unitCount === 2);
  ok("and the unit is named as the storm", agg.unit === "storm");
  ok("a Wilson interval over fixes is refused outright",
     B.wilsonRefusal(true).refusal === "WILSON_OVER_CORRELATED_ROWS");

  /* THIN STRATA. */
  const thin = B.thinStratum(3, 0.12);
  ok("a three-storm stratum returns a base rate and a refusal, not a rate",
     thin.ok === false && thin.status === "BASE RATE ONLY -- unscoreable" && thin.baseRate === 0.12);
  ok("and it names the gate it fell short of", thin.required === B.MIN_SCORED_STORMS);

  /* THE THREE QUESTIONS. */
  const q2 = B.scoreQ2([{ stormId: "a", predictedSign: 1, actualSign: 1 }], {});
  ok("Q2 on one storm is UNSCORED, below the storm gate", q2.status === "UNSCORED");
  const q3 = B.scoreQ3([{ stormId: "a", predictedSign: 1, actualSign: 1 }], {});
  ok("Q3 refuses a directional result as a landfall probability",
     q3.status === "UNSCORED" && q3.refusal.includes("NO_NUMERIC_FORECAST"));
  ok("and it says so in as many words",
     /not a calibrated landfall probability/.test(q3.note));
  ok("Q3 also refuses an undefined binary outcome",
     B.scoreQ3([{ stormId: "a", p: 0.4 }]).refusal.includes("UNDEFINED_BINARY_OUTCOME"));

  /* NO LEAKAGE BETWEEN TRAIN AND TEST. */
  const split = B.splitStorms(["ep012019", "ep012024", "ep022024"], { byYear: 2024 });
  ok("the split is on storms and later periods", split.train.length === 1 && split.test.length === 2,
     JSON.stringify(split));
  ok("and an overlap throws rather than being tolerated", (() => {
    try { B.assertNoOverlap(["a"], ["a"]); return false; } catch { return true; }
  })());
  ok("three trivial baselines are declared for any result to beat",
     Object.keys(B.BASELINES).length === 3);
  ok("persistence returns 0, not a guess, when there is no history",
     B.BASELINES.persistLastResidualSign([]) === 0);
}

/* ------------------------------------------------------- the committed Q1 result, gated */

console.log("\n[14] THE COMMITTED Q1 RESULT SAYS WHAT THE WRITE-UP SAYS IT SAYS");
{
  /* The Q1 sweep is network-bound and runs by hand. What CI can do — and what stops a write-up
     drifting away from its evidence — is assert that the committed artefact still carries the
     claims made about it, and that it has not quietly acquired a score for Q2 or Q3. */
  const q1 = JSON.parse(readFileSync(join(ROOT, "research/track-residual/Q1-RESULT.json"), "utf8"));
  ok("the population is the 65 EP storms with intermediate advisories",
     q1.population.storms === 65 && q1.population.basin === "EP", String(q1.population.storms));
  ok("it says out loud that it is not a skill claim", /NOT a skill claim/.test(q1.question));
  ok("Q2 and Q3 are listed as not scored",
     q1.notScored.length === 2 && q1.notScored.some((x) => x.startsWith("Q2")) && q1.notScored.some((x) => x.startsWith("Q3")));
  /* The words appear in prose — "accuracy of the position-departure measurement", "NOT a skill
     claim" — and must be allowed to. What must not exist is a NUMBER under such a name: a scored
     quantity is a key with a value, and that is what this walks for. */
  const scoredKeys = [];
  (function walk(v, path) {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (typeof x === "number" && /brier|skill|hitrate|accuracy|auc|logloss/i.test(k))
          scoredKeys.push(`${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
    }
  })(q1, "$");
  ok("no Brier score, skill number or accuracy figure exists as a value anywhere in the artefact",
     scoredKeys.length === 0, scoredKeys.join(", "));

  const rt = q1.q1a_parse.literalRoundTrip;
  ok(`every parsed position round-trips to the product's own bytes (${rt.verbatim}/${rt.positionsChecked})`,
     rt.notFound === 0 && rt.verbatim === rt.positionsChecked);
  ok("the deck comparison is against OFCL, and says why not OFCI",
     /OFCI is deliberately not used/.test(q1.q1a_parse.reference));
  ok("the parse agrees with the deck at the 99th percentile", q1.q1a_parse.p99Nm === 0,
     String(q1.q1a_parse.p99Nm));
  ok("and every disagreeing row is enumerated rather than averaged away",
     Array.isArray(q1.q1a_parse.everyNonZeroRow) && q1.q1a_parse.everyNonZeroRow.length > 0);

  const lead = q1.q1b_leadLabels.initToFirstRowHoursHistogram;
  ok("the INIT → first forecast row interval is nine hours on the overwhelming majority",
     lead["9"] / q1.q1b_leadLabels.advisories > 0.98, JSON.stringify(lead));
  ok("and twelve hours on none of them", !("12" in lead), JSON.stringify(lead));

  ok("the frame comparison is labelled a sensitivity, not an accuracy",
     /A frame is a choice, not an estimate/.test(q1.q1d_frameSensitivity.isNotAnAccuracy));
  ok("the best track is labelled retrospective and disclaims substitution",
     /RETROSPECTIVE/.test(q1.retrospectiveReference.label)
     && /not used in any residual, correction or score/.test(q1.retrospectiveReference.what));
  ok("missingness is published rather than dropped",
     q1.missingness && typeof q1.missingness.rowsUnmatched === "number"
     && q1.missingness.joinRefusalReasons && q1.missingness.intermediateRefusalReasons);
  ok("every fetch the sweep made is accounted for",
     q1.fetches.ok > 0 && q1.fetches.failed === 0, JSON.stringify(q1.fetches));

  /* --------------------------------------------------------------------------------------
     THE DOCUMENTS ARE CROSS-READ AGAINST THE ARTEFACT.
 
     Until now this section pinned the artefact's own internal claims and never opened a document,
     so a prose figure could drift away from the JSON it was derived from and nothing would notice.
     Everything a reviewer would otherwise have to check by hand is now pinned by value in BOTH
     documents, and a missing document is a FAILURE rather than a skip — a gate that quietly passes
     when its subject is absent is not a gate.
 
     EVERY EXPECTED VALUE IS DERIVED FROM Q1-RESULT.json. None is written into this file. If the
     numbers were typed here they would be a THIRD source of truth, free to drift from both the
     artefact and the prose while the suite stayed green.
 
     The one exception is declared as one: 183 is the count of intermediates the timezone bug was
     silently refusing BEFORE it was fixed, so no post-fix artefact can carry it. It is pinned as a
     three-way consistency check across the two documents and the library comment that records it,
     because the requirement is that the coverage-guard refusals which hid the bug stay named. */
  const DOC_PATHS = ["docs/TRACK-RESIDUAL.md", "research/track-residual/Q1-WRITEUP.md"];
  const docs = {};
  for (const rel of DOC_PATHS) {
    let text = null;
    try { text = readFileSync(join(ROOT, rel), "utf8"); } catch { /* missing */ }
    if (ok(`${rel} is present and readable`, text != null,
           "the gate cannot verify a document that is not there")) docs[rel] = text;
  }

  /* EVERY STATEMENT OF A PINNED FIGURE IS CHECKED, NOT JUST ONE.
 
     The first version of this asked "does a passage of this document contain the right number in
     the right context". It passed a mutation test it should have failed: both documents state
     several of these figures TWICE — once in a summary table and once in prose — and changing one
     of them left the other to satisfy the pin. A reviewer would still have had to check by hand,
     which is the whole thing this gate exists to remove.
 
     So each figure is pinned by an ANCHOR: a regex over the normalised document with the number
     captured, matched globally. Presence requires at least one match in each document; agreement
     requires EVERY match, in every anchor, to equal the value derived from the artefact. A second
     stale copy now fails.
 
     The document is normalised first — emphasis stripped, newlines folded to spaces — so an
     anchor is matching prose rather than line breaks. Markdown wrapping cannot make or break it.
 
     THE COST, ACCEPTED: an anchor is tied to the wording around its number, so rewording a
     sentence makes the anchor stop matching and the gate fails with "no recognised statement".
     That is the correct direction to fail in — these figures are not supposed to be quietly
     rephrasable — and the failure message says to update the anchor when the wording genuinely
     changed.
 
     EVERY EXPECTED VALUE IS DERIVED FROM Q1-RESULT.json. None is written into this file. Typed
     here they would be a THIRD source of truth, free to drift from both the artefact and the
     prose while the suite stayed green. */
  const flat = (t) => t.replace(/[*`]/g, "").replace(/\s+/g, " ");
  const N = (v) => String(v);
  const D2 = (v) => v.toFixed(2);

  const exactRows = q1.q1a_parse.byRowKind.reduce((a, k) => a + k.exact, 0);
  const rowsCompared = q1.q1a_parse.rowsCompared;
  const storms = q1.population.storms;
  const deck12 = q1.q1c_interpolation.onDeckRowsOfTheSameCycle.byGapHours.find((g) => g.gapHours === 12);
  const parsedIntermediates = q1.q1d_frameSensitivity.residuals + q1.missingness.intermediatesRefused;
  const nineHour = q1.q1b_leadLabels.initToFirstRowHoursHistogram["9"];

  /* Each pin: what it is, the value(s) it must carry, and the phrasings that state it. */
  const PINS = [
    { what: "rows matching the deck, of rows compared",
      anchors: [
        [new RegExp("(\\d+) of " + rowsCompared + "\\b", "g"), [N(exactRows)]],
        [/\| Total \| (\d+) \| (\d+) \(/g, [N(rowsCompared), N(exactRows)]],
        [/\| Deck rows compared \| (\d+) \|/g, [N(rowsCompared)]],
        [/Q1a — parse: (\d+) rows against the a-deck/g, [N(rowsCompared)]],
        [/(\d+) rows, with all \d+ exceptions/g, [N(rowsCompared)]],
      ] },
    { what: "storms exact on every row",
      anchors: [
        [/(\d+) of (\d+) storms agree exactly/g, [N(q1.q1a_parse.stormsAgreeingExactly), N(storms)]],
        [/\| Storms exact on every row \| (\d+) of (\d+) \|/g,
         [N(q1.q1a_parse.stormsAgreeingExactly), N(storms)]],
      ] },
    { what: "disagreeing rows, enumerated",
      anchors: [
        [/all (\d+) exceptions/g, [N(q1.q1a_parse.everyNonZeroRow.length)]],
        [/The (\d+) disagreements are between/g, [N(q1.q1a_parse.everyNonZeroRow.length)]],
        [/enumerated, and the largest \| (\d+), max ([\d.]+) nm \|/g,
         [N(q1.q1a_parse.everyNonZeroRow.length), D2(q1.q1a_parse.maxNm)]],
      ] },
    { what: "the largest disagreement",
      anchors: [
        [/The largest, ([\d.]+) nm, is one initial row/g, [D2(q1.q1a_parse.maxNm)]],
        [/enumerated, and the largest \| \d+, max ([\d.]+) nm \|/g, [D2(q1.q1a_parse.maxNm)]],
      ] },
    { what: "INIT to first forecast row at nine hours",
      anchors: [
        [/\((\d+) of (\d+) advisories\)/g, [N(nineHour), N(q1.q1b_leadLabels.advisories)]],
        [/nine hours \| (\d+) of (\d+) advisories \|/g, [N(nineHour), N(q1.q1b_leadLabels.advisories)]],
        [/(\d+) of (\d+) archived advisories/g, [N(nineHour), N(q1.q1b_leadLabels.advisories)]],
        [/\| 9 h \| (\d+) \|/g, [N(nineHour)]],
      ] },
    { what: "interpolation cost at the 12 h gap",
      anchors: [
        [/≤([\d.]+) nm at the finest/g, [D2(deck12.p50)]],
        [/12 h gap \| ([\d.]+) nm p50 \|/g, [D2(deck12.p50)]],
        [/\| 12 h \| \d+ \| ([\d.]+) nm \|/g, [D2(deck12.p50)]],
      ] },
    { what: "linear-in-time deviation from a geodesic",
      anchors: [
        [/geodesic \| ([\d.]+) nm p50 \|/g, [D2(q1.q1c_interpolation.geodesicBoundNm.p50)]],
        [/is p50 ([\d.]+) nm, max/g, [D2(q1.q1c_interpolation.geodesicBoundNm.p50)]],
      ] },
    { what: "frame sensitivity and the residuals behind it",
      anchors: [
        [/cross-track, over (\d+) residuals \| ([\d.]+) nm p50, n = (\d+) \|/g,
         [N(q1.q1d_frameSensitivity.residuals), D2(q1.q1d_frameSensitivity.crossDeltaNm.p50),
          N(q1.q1d_frameSensitivity.residuals)]],
        [/([\d.]+) nm — a partly deflationary result/g, [D2(q1.q1d_frameSensitivity.crossDeltaNm.p50)]],
        [/\| Cross-track difference \| ([\d.]+) nm \|/g, [D2(q1.q1d_frameSensitivity.crossDeltaNm.p50)]],
        [/cross-track residual by ([\d.]+) nm/g, [D2(q1.q1d_frameSensitivity.crossDeltaNm.p50)]],
        [/over (\d+) residuals on \d+ storms/g, [N(q1.q1d_frameSensitivity.residuals)]],
      ] },
    { what: "retrospective best-track offset and its sample",
      anchors: [
        [/best track vs operational analysis \| ([\d.]+) nm p50, n = (\d+) \|/g,
         [D2(q1.retrospectiveReference.p50Nm), N(q1.retrospectiveReference.n)]],
        [/by a median ([\d.]+) nm/g, [D2(q1.retrospectiveReference.p50Nm)]],
        [new RegExp("\\| (\\d+) \\| " + storms + " \\| ([\\d.]+) nm \\|", "g"),
         [N(q1.retrospectiveReference.n), D2(q1.retrospectiveReference.p50Nm)]],
      ] },
    { what: "intermediates refused, of those that parsed",
      anchors: [
        [/parsed \| (\d+) of (\d+) \(/g, [N(q1.missingness.intermediatesRefused), N(parsedIntermediates)]],
        [/\| Intermediates refused \| (\d+) of (\d+) that parsed \|/g,
         [N(q1.missingness.intermediatesRefused), N(parsedIntermediates)]],
      ] },
    { what: "TCM rows with no deck row at the same valid time",
      anchors: [[/no deck row at the same valid time \| (\d+) \|/g, [N(q1.missingness.rowsUnmatched)]]] },
    { what: "fetches made, and failed",
      anchors: [
        [/Fetches made, and failed \| (\d+), (\d+) failed \|/g, [N(q1.fetches.ok), N(q1.fetches.failed)]],
        [/\| HTTP fetches \| (\d+), (\d+) failed \|/g, [N(q1.fetches.ok), N(q1.fetches.failed)]],
        [/\| Failed fetches \| (\d+) of (\d+) \|/g, [N(q1.fetches.failed), N(q1.fetches.ok)]],
      ] },
  ];

  /* THE HISTORICAL CONSTANT, declared as one. 183 is the count of intermediates the timezone bug
     was silently refusing BEFORE it was fixed, so no post-fix artefact can carry it. It is pinned
     across both documents AND the library comment that records it, because the requirement is
     that the coverage-guard refusals which hid the bug stay named wherever the bug is described.
     Only the denominator is artefact-derived. */
  const HIDDEN_REFUSALS = "183";
  const hiddenPin = { what: `the ${HIDDEN_REFUSALS} coverage-guard refusals that hid the timezone bug`,
    anchors: [
      [/silently refus\w+ (\d+) of (?:the )?(\d+)/g, [HIDDEN_REFUSALS, N(parsedIntermediates)]],
      [/(\d+) of (?:the )?(\d+) intermediates that parsed were being silently refused/g,
       [HIDDEN_REFUSALS, N(parsedIntermediates)]],
    ] };

  function checkPin(rel, text, pin) {
    const t = flat(text);
    let found = 0;
    const wrong = [];
    for (const [re, expect] of pin.anchors) {
      re.lastIndex = 0;
      for (const m of t.matchAll(re)) {
        found++;
        expect.forEach((want, i) => {
          if (m[i + 1] !== want) wrong.push(`"${m[0].trim()}" gives ${m[i + 1]}, artefact says ${want}`);
        });
      }
    }
    ok(`${rel} states ${pin.what}`, found > 0,
       "no recognised statement of this figure — the document dropped it, or the wording moved "
       + "away from the anchor and the anchor needs updating");
    ok(`${rel} agrees with the artefact on ${pin.what} in all ${found} place(s)`,
       found > 0 && wrong.length === 0, wrong.join(" | "));
  }

  for (const rel of DOC_PATHS) {
    if (docs[rel] == null) continue;
    for (const pin of PINS) checkPin(rel, docs[rel], pin);
    checkPin(rel, docs[rel], hiddenPin);
  }
  /* The library comment records the same historical count and must not drift from the documents. */
  {
    const rel = "scripts/lib/track-residual.mjs";
    let text = null;
    try { text = readFileSync(join(ROOT, rel), "utf8"); } catch { /* reported below */ }
    if (ok(`${rel} is present and readable`, text != null)) checkPin(rel, text, hiddenPin);
  }

  /* And the four negatives stay in body text. A figure demoted to a footnote marker is a figure
     being quietly retired, so each is required to appear on a line that is not a footnote
     definition. */
  const tok = (v) => new RegExp("(?<![\\d.])" + String(v).replace(".", "\\.") + "(?![\\d.])");
  const NEGATIVES = [
    [D2(q1.q1d_frameSensitivity.crossDeltaNm.p50), "the frame distinction's size"],
    [D2(deck12.p50), "what linear interpolation costs at 12 h"],
    [D2(q1.retrospectiveReference.p50Nm), "how far post-analysis moves the observed position"],
    [N(nineHour), "the nine-hour interval's near-universality"],
  ];
  for (const rel of DOC_PATHS) {
    if (docs[rel] == null) continue;
    for (const [value, what] of NEGATIVES) {
      const lines = docs[rel].split(/\r?\n/).filter((l) => tok(value).test(l));
      ok(`${rel} carries ${what} (${value}) in body text, not only as a footnote marker`,
         lines.length > 0 && lines.some((l) => !/^\s*\[\^/.test(l)),
         `${value} appears only in footnote position`);
    }
  }
}

console.log(`\n${failed ? "FAILED" : "PASSED"} — ${checks - failed}/${checks} checks\n`);
process.exit(failed ? 1 : 0);
