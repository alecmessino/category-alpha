#!/usr/bin/env node
/* Tests for the coastline crossing test.
 *
 * The case that matters most is Lala: a hurricane whose EYEWALL was over the southern Big
 * Island, which did not make landfall, because the centre never crossed. If this module
 * calls that a landfall it is worse than useless — it would have priced a contract that
 * resolved NO.
 *
 * Run: node scripts/test-track.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crossesCoast, pointOnLand, pointInRing, distanceNm, referenceSpeedKt, legCrossings } from "./lib/track.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const COAST = JSON.parse(readFileSync(resolve(__dir, "../docs/data/coastline.json"), "utf8"));

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = g != null && Math.abs(g - w) <= tol; if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${g} want=${w}±${tol}`)); };

console.log("\n[1] the vendored coastline is what it claims to be");
const hi = COAST.regions.filter((r) => r.group === "HI");
const conus = COAST.regions.filter((r) => r.group === "CONUS");
ck("Hawaii is present", hi.length === 1, String(hi.length));
ck("with every main island", hi[0].rings.length >= 8, hi[0].rings.length + " rings");
ck("CONUS is present", conus.length >= 40, conus.length + " regions");
ck("no Alaska", !COAST.regions.some((r) => r.id === "AK"));
ck("every ring can enclose an area", COAST.regions.every((r) => r.rings.every((g) => g.length >= 4)));
ck("and the source is recorded", /census\.gov/.test(COAST.source), COAST.source);

console.log("\n[2] a point is on land, or it is not");
/* Known positions, checked against the real polygons. */
ck("Hilo is on the Big Island", !!pointOnLand(19.71, -155.08, COAST.regions));
ck("Honolulu is on Oahu", !!pointOnLand(21.31, -157.86, COAST.regions));
ck("Kahului is on Maui", !!pointOnLand(20.89, -156.47, COAST.regions));
ck("Miami is on land", !!pointOnLand(25.77, -80.19, COAST.regions));
ck("open ocean south of Hawaii is not", !pointOnLand(18.0, -156.0, COAST.regions));
ck("the Alenuihaha channel is not land", !pointOnLand(20.45, -156.15, COAST.regions));
ck("mid-Atlantic is not land", !pointOnLand(25.0, -50.0, COAST.regions));
eq("a non-position answers null", pointOnLand(NaN, -156, COAST.regions), null);
eq("a degenerate ring encloses nothing", pointInRing([20, -156], [[20, -156], [20, -156]]), false);

console.log("\n[3] distances are nautical miles");
near("one degree of latitude is 60 nm", distanceNm([20, -156], [21, -156]), 60, 0.5);
near("Honolulu to Hilo is about 190 nm", distanceNm([21.31, -157.86], [19.71, -155.08]), 190, 12);
eq("a missing point has no distance", distanceNm(null, [20, -156]), null);

console.log("\n[4] THE LALA CASE — eyewall ashore, centre offshore, NOT a landfall");
/* Real observed centre positions, from this session's advisory record. 02Z through 09Z on
   16 Aug 2026, while the eyewall was over the southern Big Island and South Point was
   recording hurricane-force gusts. */
const LALA = [
  { hr: 0, lat: 18.6, lon: -155.9, kt: 65 },
  { hr: 1, lat: 18.7, lon: -156.0, kt: 70 },
  { hr: 2, lat: 18.8, lon: -156.2, kt: 70 },
  { hr: 3, lat: 19.0, lon: -156.3, kt: 70 },
  { hr: 4, lat: 19.1, lon: -156.5, kt: 65 },
  { hr: 7, lat: 19.6, lon: -157.0, kt: 65 },
];
const lala = crossesCoast(LALA, COAST);
eq("no landfall", lala.verdict, "none");
eq("and no crossing at all", lala.crossings.length, 0);
ck("the centre stayed well offshore", lala.closestNm > 15 && lala.closestNm < 40, lala.closestNm + " nm");
eq("closest to Hawaii", lala.closestRegion, "HI");
ck("and its own translation speed was measured", lala.refSpeedKt > 5 && lala.refSpeedKt < 20,
   lala.refSpeedKt + " kt");

console.log("\n[5] a real traverse IS a landfall, once the gate is calibrated");
/* Due west across the Big Island at 8 kt — 48 nm in 6 h, a physically ordinary leg. */
const REAL = [
  { hr: 0, lat: 19.5, lon: -154.4, kt: 80 },
  { hr: 6, lat: 19.5, lon: -155.25, kt: 75 },
  { hr: 12, lat: 19.5, lon: -156.1, kt: 60 },
];
const real = crossesCoast(REAL, COAST, { calibrated: true, ratio: 1.75 });
eq("it lands", real.verdict, "landfall");
ck("on Hawaii", real.crossings[0].region === "HI", real.crossings[0].region);
ck("with the intensity carried to the crossing point",
   real.crossings[0].ktAtCrossing > 60 && real.crossings[0].ktAtCrossing <= 80,
   String(real.crossings[0].ktAtCrossing));
ck("and the leg speed is ordinary", real.crossings[0].ratio <= 1.75, String(real.crossings[0].ratio));

console.log("\n[6] THE RELOCATION ARTEFACT IS NOT A LANDFALL");
/* The Lala failure mode, reproduced. A member creeping west at ~7 kt whose centre then
   jumps 110 nm in one 6-hour leg — 18 kt — straight across the island. That is a tracker
   losing a vortex and re-acquiring one in the lee, not a storm crossing land. */
const JUMP = [
  { hr: 0, lat: 19.5, lon: -154.0, kt: 70 },
  { hr: 6, lat: 19.5, lon: -154.7, kt: 70 },
  { hr: 12, lat: 19.5, lon: -156.6, kt: 55 },
];
const jump = crossesCoast(JUMP, COAST, { calibrated: true, ratio: 1.75 });
eq("the crossing is flagged, not counted", jump.verdict, "suspect");
eq("nothing is counted clean", jump.cleanCount, 0);
ck("because the leg implies a speed the storm is not doing",
   jump.crossings[0].ratio > 1.75, `leg ${jump.crossings[0].legKt} kt vs ref ${jump.refSpeedKt} kt, ratio ${jump.crossings[0].ratio}`);

console.log("\n[7] UNCALIBRATED IS THE DEFAULT, AND IT REFUSES TO CALL ANYTHING CLEAN");
/* The rule that came out of the consensus blend: do not ship a model before the backtest
   scores it. A threshold picked to make section [6] come out right is exactly that
   failure, so absent a scored ratio nothing is a landfall. */
const uncal = crossesCoast(REAL, COAST);
eq("an unambiguous traverse is still only suspect", uncal.verdict, "suspect");
eq("clean count is zero", uncal.cleanCount, 0);
ck("and it says why", /UNCALIBRATED/.test(uncal.note || ""), uncal.note);
ck("the gate arithmetic is still reported, so it can be scored",
   uncal.crossings[0].ratio != null && uncal.crossings[0].legKt != null,
   JSON.stringify({ legKt: uncal.crossings[0].legKt, ratio: uncal.crossings[0].ratio }));

console.log("\n[8] a departure is not a landfall");
/* Starting ashore and moving out to sea crosses the coastline exactly once, and it is not
   an entry. */
const EXIT = [
  { hr: 0, lat: 19.6, lon: -155.5, kt: 60 },
  { hr: 6, lat: 19.6, lon: -156.6, kt: 55 },
];
ck("the start is on land", !!pointOnLand(EXIT[0].lat, EXIT[0].lon, COAST.regions));
eq("moving offshore is not a landfall", crossesCoast(EXIT, COAST, { calibrated: true, ratio: 1.75 }).verdict, "none");

console.log("\n[9] refusals");
eq("one point is not a leg", crossesCoast([{ hr: 0, lat: 19, lon: -156 }], COAST).verdict, "none");
ck("and it says so", /fewer than two/.test(crossesCoast([{ hr: 0, lat: 19, lon: -156 }], COAST).note || ""));
eq("no points at all", crossesCoast([], COAST).verdict, "none");
eq("no coastline means no crossing can be claimed", crossesCoast(REAL, { regions: [] }, { calibrated: true, ratio: 1.75 }).verdict, "none");
eq("unusable positions are dropped, not guessed",
   crossesCoast([{ hr: 0, lat: null, lon: -156 }, { hr: 6, lat: NaN, lon: -155 }], COAST).crossings.length, 0);
eq("a zero-duration leg contributes no speed", referenceSpeedKt([{ hr: 0, lat: 19, lon: -156 }, { hr: 0, lat: 19, lon: -155 }]), null);
eq("and no ring means no hit", legCrossings([19, -156], [19, -155], []).length, 0);

console.log(fail ? `\n${fail} FAILED\n` : "\nall track checks passed\n");
process.exit(fail ? 1 : 0);
