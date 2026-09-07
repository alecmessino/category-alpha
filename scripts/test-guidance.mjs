#!/usr/bin/env node
/* Tests for the guidance engine — the model-disagreement layer over the ATCF a-deck.
 *
 * What these protect, in the order the hard constraints name them:
 *
 *   SEMANTICS        a member count is never a probability; the envelope is never the cone;
 *                    the official forecast and the consensus aids are never counted as members
 *   VALID TIME       every point carries the instant it is about, and the previous cycle is
 *                    compared at the CURRENT cycle's valid times, not at matching tau
 *   NO FUTURE LEAK   a cycle whose date-time group is after `asOf` is not used
 *   NULL IS NOT ZERO an aid with no intensity, a lead with one member, a fan hour with no
 *                    member — each is null or n=0, never a confident 0
 *   ISOLATION        nothing here reaches the probability engine or the Kelly path
 *
 * Two fixtures are real decks (aep132026 / aep122026, cycles 2026090612 and 2026090618, roster
 * techs only); the synthetic decks are built inline so the geometry under test is known exactly.
 *
 * Run: node scripts/test-guidance.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAdeckCycles, parseFdeck } from "./lib/atcf.mjs";
import { guidanceFrom, guidanceFrameScalars, genesisFromBestTrack, positionAt, partition,
         haversineKm, scenarioThresholdKm, ROSTER, LEADS } from "./lib/guidance.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => ck(n, g != null && Math.abs(g - w) <= tol, `got=${g} want=${w}±${tol}`);

/* ---- a synthetic deck builder: known geometry, ATCF row shape ------------------------------ */
function row(cycle, tech, tau, lat, lon, vmax, rad) {
  const la = Math.round(Math.abs(lat) * 10) + (lat < 0 ? "S" : "N");
  const lo = Math.round(Math.abs(lon) * 10) + (lon < 0 ? "W" : "E");
  return `EP, 12, ${cycle}, 03, ${tech}, ${String(tau).padStart(3)}, ${la}, ${lo}, ${vmax == null ? 0 : vmax}, 0, XX, ${rad || 0}, NEQ, 0, 0, 0, 0`;
}
/* A member moving due west from lon0 at `westPerHr` deg/h, starting at (lat0, lon0) at tau 0. */
function straight(cycle, tech, lat0, lon0, westPerHr, taus, kts) {
  return taus.map((t, i) => row(cycle, tech, t, lat0, lon0 - westPerHr * t, kts ? kts[i] : 50));
}
const TAUS = [0, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120];

console.log("\n[1] roster semantics on a real deck");
const EP12 = parseAdeckCycles(readFileSync(resolve(__dir, "fixtures/adeck-ep122026-2cycles.dat"), "utf8"), { keep: 2 });
const G = guidanceFrom(EP12, { fetchedAt: "2026-09-06T21:51:00.000Z" });
ck("the engine answered", !!G);
eq("latest and previous cycles", [G.cycle, G.previousCycle, G.cycleGapHr], ["2026090618", "2026090612", 6]);
eq("semantics say what this is not", [G.semantics.isProbability, G.semantics.isForecastCone], [false, false]);
ck("the official forecast is present and is NOT a spread member", G.roster.present.includes("OFCL") && !G.roster.inSpread.includes("OFCL"));
ck("the consensus aids are present and are NOT spread members", ["TVCN", "HCCA", "IVCN"].every((t) => G.roster.present.includes(t) && !G.roster.inSpread.includes(t)));
ck("statistical intensity aids are in the fan and not the track spread", ["SHIP", "DSHP", "LGEM"].every((t) => G.roster.inFan.includes(t) && !G.roster.inSpread.includes(t)));
ck("global models are in the track spread and not the intensity fan", ["AVNI", "UKXI", "CMCI"].every((t) => G.roster.inSpread.includes(t) && !G.roster.inFan.includes(t)));
ck("baselines are listed as excluded, by name", G.roster.excluded.baselines.includes("CLP5") && G.roster.excluded.baselines.includes("XTRP"));
ck("the early (interpolated) forms answered, no late forms", G.roster.lateForms.length === 0);
ck("the deterministic core is complete on this cycle", G.roster.complete === true);
/* THE RULE, MECHANICALLY: no key in the whole output is named as a probability or a fraction. */
const keys = new Set();
(function walk(o) { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(walk);
  for (const k of Object.keys(o)) { keys.add(k); walk(o[k]); } })(G);
const banned = [...keys].filter((k) => /prob|fraction|pct$|percent|confidence|likelihood|^p$/i.test(k) && !["spreadDeltaPct", "isProbability"].includes(k));
eq("no output field is named as a probability, fraction or confidence", banned, []);
ck("the one field that mentions probability is the flag saying this is not one", keys.has("isProbability") && G.semantics.isProbability === false);
ck("scenario counts are integers, never fractions", G.leads.every((l) => Number.isInteger(l.scenarios) && l.clusters.every((c) => Array.isArray(c))));
ck("every lead states the partition threshold it used", G.leads.every((l) => l.thresholdKm === scenarioThresholdKm(l.hr)));

console.log("\n[2] valid time on every point");
ck("cycle date-time group is the valid time of tau 0", G.validZ === "2026-09-06T18:00:00.000Z");
ck("each lead's valid time is cycle + lead", G.leads.every((l) => Date.parse(l.validZ) === Date.parse(G.cycleIso) + l.hr * 3600000));
ck("each track point carries its own valid time", G.aids.every((a) => a.track.every((p) => Date.parse(p.validZ) === Date.parse(G.cycleIso) + p.hr * 3600000)));
ck("the fan rows carry valid time too", G.intensityFan.every((f) => Date.parse(f.validZ) === Date.parse(G.cycleIso) + f.hr * 3600000));
ck("nothing is carried past 120h", G.aids.every((a) => a.track.every((p) => p.hr <= 120) && a.intensity.every((p) => p.hr <= 120)));
ck("the fetch time is carried beside the valid time, never merged into it", G.fetchedAt === "2026-09-06T21:51:00.000Z" && G.cadenceMin === 360);

console.log("\n[3] cycle-to-cycle comparison happens at the same VALID TIME, not the same tau");
/* Previous cycle 12Z: three members moving west at 0.1 deg/h from lon -120 (so lon = -120 - 0.1*tau).
   Current cycle 18Z: the same members, started from where the previous run had them at 18Z
   (lon -120.6) and moving at the same speed. Every valid time then coincides exactly, so the
   centroid shift must be 0 and the OFCL shift must be 0. */
const P = "2026090612", C = "2026090618";
const deckA = [
  ...straight(P, "AVNI", 15.0, -120, 0.1, TAUS), ...straight(P, "HWFI", 15.4, -120, 0.1, TAUS), ...straight(P, "CMCI", 14.6, -120, 0.1, TAUS),
  ...straight(P, "OFCL", 15.0, -120, 0.1, TAUS),
  ...straight(C, "AVNI", 15.0, -120.6, 0.1, TAUS), ...straight(C, "HWFI", 15.4, -120.6, 0.1, TAUS), ...straight(C, "CMCI", 14.6, -120.6, 0.1, TAUS),
  ...straight(C, "OFCL", 15.0, -120.6, 0.1, TAUS),
].join("\n");
const GA = guidanceFrom(parseAdeckCycles(deckA, { keep: 2 }));
const l24 = GA.leads.find((l) => l.hr === 24);
eq("same valid time, same place: centroid shift is 0 km", l24.prev.centroidShiftKm, 0);
eq("… and the official track shift is 0 km", l24.prev.ofclShiftKm, 0);
ck("the previous cycle was read at tau 30 for the current tau 24 (interpolated between 24 and 36)", l24.prev.n === 3);
/* A naive tau-to-tau comparison would report the 0.6 deg the storm moved in six hours: ~64 km. */
const naiveKm = haversineKm(15, -120 - 0.1 * 24, 15, -120.6 - 0.1 * 24);
ck("which is not the ~" + Math.round(naiveKm) + " km a tau-matched comparison would have reported", naiveKm > 50 && l24.prev.centroidShiftKm === 0);
/* Now shift the current cycle one degree north: every member, so the centroid moves ~111 km. */
const deckB = deckA.replace(/2026090618, 03, (AVNI|HWFI|CMCI|OFCL),\s*(\d+),\s*(\d+)N/g,
  (m, tech, tau, la) => `2026090618, 03, ${tech}, ${tau}, ${Number(la) + 10}N`);
const GB = guidanceFrom(parseAdeckCycles(deckB, { keep: 2 }));
near("a one-degree northward shift reads as ~111 km of centroid shift", GB.leads.find((l) => l.hr === 24).prev.centroidShiftKm, 111, 2);
near("… and as ~111 km of official-track shift", GB.leads.find((l) => l.hr === 24).prev.ofclShiftKm, 111, 2);
eq("with the spread itself unchanged", GB.leads.find((l) => l.hr === 24).prev.spreadDeltaKm, 0);

console.log("\n[4] no future leakage");
const asOfBefore18 = guidanceFrom(parseAdeckCycles(deckA, { keep: 2 }), { asOf: "2026-09-06T17:59:00Z" });
eq("asOf before the 18Z group: the 12Z cycle answers, and it has no predecessor", [asOfBefore18.cycle, asOfBefore18.previousCycle], ["2026090612", null]);
eq("asOf at exactly the group time admits it (the group is a lower bound on availability)", guidanceFrom(parseAdeckCycles(deckA, { keep: 2 }), { asOf: "2026-09-06T18:00:00Z" }).cycle, "2026090618");
eq("asOf before every cycle: nothing, not an empty envelope", guidanceFrom(parseAdeckCycles(deckA, { keep: 2 }), { asOf: "2026-09-06T11:00:00Z" }), null);

console.log("\n[5] null is not zero");
const oneMember = guidanceFrom(parseAdeckCycles([...straight(C, "AVNI", 15, -120, 0.1, TAUS), ...straight(C, "OFCL", 15, -120, 0.1, TAUS)].join("\n"), { keep: 2 }));
eq("one member: no spread (null), not a spread of 0", [oneMember.leads[0].n, oneMember.leads[0].meanKm, oneMember.leads[0].maxKm], [1, null, null]);
eq("one member: no scenarios counted from a partition of one", oneMember.leads[0].scenarios, 0);
eq("no intensity members: fan rows say n=0 and carry nulls beside the official value", [oneMember.intensityFan[0].n, oneMember.intensityFan[0].min, oneMember.intensityFan[0].median, oneMember.intensityFan[0].ofcl], [0, null, null, 50]);
eq("no intensity members and no official forecast: no fan rows at all, not rows of zeros",
  guidanceFrom(parseAdeckCycles(straight(C, "AVNI", 15, -120, 0.1, TAUS).join("\n"), { keep: 2 })).intensityFan, []);
eq("no fan members: intensity spread is null", oneMember.summary.intensitySpread72Kt, null);
eq("no previous cycle: trend is null, not 'steady'", oneMember.trend, null);
/* TVCN ships vmax=0 on every row (a track aid). It must contribute a track and no intensity. */
const tvcnOnly = straight(C, "TVCN", 15, -120, 0.1, TAUS, TAUS.map(() => 0)).join("\n");
const GT = guidanceFrom(parseAdeckCycles(tvcnOnly, { keep: 2 }));
ck("a zero-intensity aid contributes a track and no intensity", GT.aids[0].track.length === TAUS.length && GT.aids[0].intensity.length === 0 && GT.aids[0].peakKt === null);
eq("frame scalars for no guidance are all null", Object.values(guidanceFrameScalars(null)).every((v) => v === null), true);
const scal = guidanceFrameScalars(G);
ck("frame scalars for a real deck carry the cycle and the 72h metrics", scal.gCycle === "2026090618" && scal.gTrack72 > 0 && scal.gN72 === 12);
/* A track that stops at 72h has nothing to say at 96h: the member is absent, not extrapolated. */
const shortA = straight(C, "AVNI", 15, -120, 0.1, TAUS.filter((t) => t <= 72));
const deckShort = [...shortA, ...straight(C, "HWFI", 15.4, -120, 0.1, TAUS), ...straight(C, "CMCI", 14.6, -120, 0.1, TAUS)].join("\n");
const GS = guidanceFrom(parseAdeckCycles(deckShort, { keep: 2 }));
eq("a member whose track ends at 72h is counted at 72h and absent at 96h", [GS.leads.find((l) => l.hr === 72).n, GS.leads.find((l) => l.hr === 96).n], [3, 2]);
eq("positionAt never extrapolates", positionAt([{ hr: 0, lat: 1, lon: 1 }, { hr: 24, lat: 2, lon: 2 }], 48), null);

console.log("\n[6] what is excluded, and counted as excluded");
const withEns = [
  ...straight(C, "AVNI", 15, -120, 0.1, TAUS), ...straight(C, "HWFI", 15.4, -120, 0.1, TAUS),
  ...straight(C, "AP01", 25, -110, 0.1, TAUS), ...straight(C, "AP02", 5, -130, 0.1, TAUS), ...straight(C, "AC00", 5, -130, 0.1, TAUS),
  ...straight(C, "CLP5", 30, -100, 0.1, TAUS), ...straight(C, "XTRP", 30, -100, 0.1, TAUS),
].join("\n");
const GE = guidanceFrom(parseAdeckCycles(withEns, { keep: 2 }));
eq("ensemble perturbations do not enter the spread", GE.leads[0].n, 2);
eq("… but the census says how many were in the deck", GE.roster.excluded.ensembleMembers, 3);
eq("baselines are named as excluded", GE.roster.excluded.baselines, ["CLP5", "XTRP"]);
ck("the spread is the two members' disagreement, not the baselines' distance", GE.leads[0].meanKm < 30);

console.log("\n[7] early forms preferred; late forms named when they are all there is");
const both = [...straight(C, "HWFI", 15, -120, 0.1, TAUS), ...straight(C, "HWRF", 25, -110, 0.1, TAUS), ...straight(C, "AVNI", 15.2, -120, 0.1, TAUS)].join("\n");
const GBoth = guidanceFrom(parseAdeckCycles(both, { keep: 2 }));
eq("HWFI answers for HWRF when both are present", GBoth.aids.find((a) => a.key === "HWRF").tech, "HWFI");
eq("… and it is not flagged late", GBoth.roster.lateForms, []);
const lateOnly = [...straight(C, "HWRF", 15, -120, 0.1, TAUS), ...straight(C, "AVNI", 15.2, -120, 0.1, TAUS)].join("\n");
const GLate = guidanceFrom(parseAdeckCycles(lateOnly, { keep: 2 }));
eq("HWRF answers when HWFI is absent, and says it is the late form", [GLate.aids.find((a) => a.key === "HWRF").tech, GLate.roster.lateForms], ["HWRF", ["HWRF"]]);
ck("a missing family is named, not silently absent", GLate.roster.missing.some((m) => m.key === "HAFA") && GLate.roster.complete === false);

console.log("\n[8] the radii duplicates are one member, not three");
const dup = [
  ...straight(C, "AVNI", 15, -120, 0.1, TAUS),
  ...TAUS.map((t) => row(C, "HWFI", t, 15.4, -120 - 0.1 * t, 50, 34)),
  ...TAUS.map((t) => row(C, "HWFI", t, 15.4, -120 - 0.1 * t, 50, 50)),
  ...TAUS.map((t) => row(C, "HWFI", t, 15.4, -120 - 0.1 * t, 50, 64)),
].join("\n");
eq("three radius rows per tau collapse to one member", guidanceFrom(parseAdeckCycles(dup, { keep: 2 })).leads[0].n, 2);

console.log("\n[9] the partition");
const thr = scenarioThresholdKm(72);
eq("threshold at 72h is stated", thr, 402);
const pts = [
  { tech: "A", lat: 20, lon: -120 }, { tech: "B", lat: 20.5, lon: -120.5 }, { tech: "C", lat: 19.5, lon: -119.5 },
  { tech: "D", lat: 26, lon: -128 },
];
eq("three near members and one far: one cluster of three, one singleton", partition(pts, thr), [["A", "B", "C"], ["D"]]);
const two = [...pts, { tech: "E", lat: 26.5, lon: -128.5 }];
eq("two groups: two clusters", partition(two, thr).map((c) => c.length), [3, 2]);
eq("order of input does not change the partition", partition([...two].reverse(), thr), partition(two, thr));
/* And on a real deck the scenario count is a count of clusters of TWO OR MORE. */
const bifur = [
  ...straight(C, "AVNI", 15, -120, 0.1, TAUS), ...straight(C, "CMCI", 15.3, -120, 0.1, TAUS), ...straight(C, "UKXI", 14.7, -120, 0.1, TAUS),
  ...straight(C, "HWFI", 15, -120, 0.25, TAUS), ...straight(C, "HFAI", 15.3, -120, 0.25, TAUS),   // a faster western group
].join("\n");
const GBif = guidanceFrom(parseAdeckCycles(bifur, { keep: 2 }));
const b72 = GBif.leads.find((l) => l.hr === 72);
eq("a genuine bifurcation at 72h reads as two scenarios and no outliers", [b72.scenarios, b72.outliers], [2, []]);
eq("and the clusters name their members", b72.clusters.map((c) => c.length), [3, 2]);
ck("the clusters are counts and names — nothing in the lead is a fraction of members", !("share" in b72) && !("fraction" in b72));

console.log("\n[10] the antimeridian");
const cross = [
  ...straight(C, "AVNI", 15, -179.5, -0.05, TAUS),   // moving EAST across 180 (lon increases past -180 → wraps)
  ...straight(C, "HWFI", 15, 179.5, 0.0, TAUS),
].join("\n");
const GX = guidanceFrom(parseAdeckCycles(cross, { keep: 2 }));
ck("two members either side of 180 have a centroid near 180, not near 0", Math.abs(Math.abs(GX.leads[0].centroid[1]) - 180) < 2, JSON.stringify(GX.leads[0].centroid));

console.log("\n[11] isolation from the probability engine and the Kelly path");
const src = (p) => readFileSync(resolve(__dir, p), "utf8");
ck("probability.mjs does not import the guidance engine", !/guidance\.mjs|guidanceFrom/.test(src("lib/probability.mjs")));
ck("estimator-core.mjs does not import the guidance engine", !/guidance\.mjs|guidanceFrom/.test(src("lib/estimator-core.mjs")));
ck("calibration.mjs does not import the guidance engine", !/guidance\.mjs|guidanceFrom/.test(src("lib/calibration.mjs")));
const fd = src("fetch-data.mjs");
const calCall = fd.slice(fd.indexOf("const cal = calibratedIntensityP({"), fd.indexOf("}, {", fd.indexOf("const cal = calibratedIntensityP({")));
ck("fetch-data hands the engine consensus/recon/ships/ascat and NOT the guidance envelope", calCall.length > 0 && !/guidance/.test(calCall));
const compute = src("../docs/app/compute.js");
const kellySrc = compute.slice(compute.indexOf("function kellyFor"), compute.indexOf("function ", compute.indexOf("function kellyFor") + 10));
/* The edge book DOES read the discussion's stated position of the official forecast inside the
   guidance envelope ("forecast above guidance") — that is NHC prose, owned by the advisory feed,
   and it is not this engine. The scalars this engine emits are what must stay out. */
const ENGINE = /gTrack72|gInt72|gScen72|gOfclCon72|gPeakMed|gPeakOfcl|\.guidance\.(summary|leads|aids|peaks|trend)|guidanceAt\b.*\.(summary|leads)/;
ck("compute.js kellyFor reads no guidance-engine scalar", kellySrc.length > 0 && !ENGINE.test(kellySrc));
const edgeSrc = compute.slice(compute.indexOf("function edgeBook"), compute.indexOf("\n  function ", compute.indexOf("function edgeBook") + 10));
ck("compute.js edgeBook reads no guidance-engine scalar", edgeSrc.length > 0 && !ENGINE.test(edgeSrc));

console.log("\n[12] the real decks behave like real decks");
const EP13 = parseAdeckCycles(readFileSync(resolve(__dir, "fixtures/adeck-ep132026-2cycles.dat"), "utf8"), { keep: 2 });
const G13 = guidanceFrom(EP13, { fetchedAt: "2026-09-06T21:51:00.000Z" });
ck("Marie: twelve spread members at 72h", G13.summary.n72 === 12);
ck("spread grows with lead on both real decks", [G, G13].every((g) => g.leads[LEADS.length - 1].meanKm > g.leads[0].meanKm));
ck("the previous cycle's official track is carried for the ghost line, with its own valid times",
  Array.isArray(G.prevOfclTrack) && G.prevOfclTrack.every((p) => Date.parse(p.validZ) === Date.parse(G.previousCycleIso) + p.hr * 3600000));
ck("the fan's previous-cycle values are marked interpolated", G.intensityFan.every((f) => f.prevInterpolated === true));
ck("payload stays inside budget (30 KB per storm)", JSON.stringify(G).length < 30000 && JSON.stringify(G13).length < 30000,
  `${JSON.stringify(G).length} / ${JSON.stringify(G13).length} bytes`);
ck("every roster family has a class the UI can draw", ROSTER.every((f) => ["official", "consensus", "global", "hurricane", "ensemble-mean", "ai", "statistical"].includes(f.cls)));

console.log("\n[13] genesis is the FIRST fix, never the current one");
const bdeck = [
  { iso: "2026-09-01T00:00:00.000Z", lat: null, lon: null, kt: null },     // a header row with no position
  { iso: "2026-09-01T06:00:00.000Z", lat: 12.1, lon: -101.3, kt: 25 },
  { iso: "2026-09-06T18:00:00.000Z", lat: 23.8, lon: -122.7, kt: 65 },
];
eq("the first positioned fix, with its month", genesisFromBestTrack(bdeck), { lat: 12.1, lon: -101.3, iso: "2026-09-01T06:00:00.000Z", month: 9, kt: 25, source: "NHC ATCF b-deck first fix" });
eq("no fixes, no genesis", genesisFromBestTrack([]), null);

console.log("\n[14] f-deck positions are hundredths");
const F = parseFdeck("CP, 01, 202608140921,  31, OSCT,         CI,  , 1652N, 14868W,      , 3,  40, 3,     , 3,     ,  34, NEQ,   90,   60,    0,   75,    ,  ,  ,  ,  , 3,    ,    ,  ,   NHC, DPR,");
eq("1652N / 14868W is 16.52N 148.68W", [F.fixes[0].lat, F.fixes[0].lon], [16.52, -148.68]);

console.log(fail ? `\n${fail} guidance check(s) FAILED` : "\nall guidance checks passed");
process.exit(fail ? 1 : 0);
