#!/usr/bin/env node
/* Tests for the ATCF deck parsers — the highest-value feed on the board and the one
 * whose failure modes are silent.
 *
 * Every fixture here is a real record shape taken from live decks (acp012026,
 * aal942026, fcp012026, 14 Aug 2026), not an invented one. That matters: the two traps
 * these parsers exist to avoid are both things the live data actually does, and a
 * made-up fixture would not contain either.
 *
 *   1. TVCN, the track consensus, ships vmax=0 on every row because it has no intensity
 *      to give. Read as a forecast, that is a consensus predicting the storm dissipates
 *      to nothing — and it would drag every blend it touches down with it.
 *   2. One forecast appears on three rows, once per wind-radius threshold. Counted
 *      naively, one aid becomes three members and the "disagreement" between them is
 *      zero, so a spread that is supposed to widen the probability band collapses it.
 *
 * Run: node scripts/test-atcf.mjs
 */
import { parseAdeck, parseBestTrack, parseFdeck, consensusFrom, latestScatPass,
         latestAircraftFix, deckStem, atcfLat, atcfLon, spreadOf } from "./lib/atcf.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

console.log("\n[1] positions are tenths of a degree with a hemisphere");
eq("north", atcfLat("236N"), 23.6);
eq("south", atcfLat("108S"), -10.8);
eq("west", atcfLon("1732W"), -173.2);
eq("east", atcfLon("1748E"), 174.8);
/* No hemisphere means we cannot place it. A bare number defaulted to north-west would
   put a Pacific storm in the Atlantic without anything looking wrong. */
eq("a bare number is refused, not assumed", atcfLat("236"), null);
eq("and zero is absent, not the equator", atcfLat("0N"), null);

console.log("\n[2] the a-deck, including both traps");
/* Two cycles, so "latest" has to be chosen rather than assumed. HCCA appears three times
   at tau 24 — once per radius threshold — and TVCN carries vmax 0 throughout. */
const ADECK = `
CP, 01, 2026081412, 03, HCCA,   0, 170N, 1503W,  50,  997,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081412, 03, HCCA,  24, 184N, 1546W,  60,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, CARQ, -24, 150N, 1440W,  40,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, CARQ,   0, 170N, 1503W,  50,  997,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, HCCA,   0, 170N, 1503W,  50,  997, TS,  34, NEQ,  180,    0,    0,  120,
CP, 01, 2026081418, 03, HCCA,  24, 184N, 1546W,  74,    0, HU,  34, NEQ,   60,   60,   40,   40,
CP, 01, 2026081418, 03, HCCA,  24, 184N, 1546W,  74,    0, HU,  50, NEQ,   30,   30,   20,   20,
CP, 01, 2026081418, 03, HCCA,  24, 184N, 1546W,  74,    0, HU,  64, NEQ,   15,   15,   10,   10,
CP, 01, 2026081418, 03, HCCA, 120, 226N, 1718W, 104,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, IVCN,   0, 170N, 1503W,  50,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, IVCN, 120,    0,     0,  79,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, GDMI,   0, 170N, 1503W,  50,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, GDMI, 120, 224N, 1710W,  83,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, TVCN,   0, 170N, 1503W,   0,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, TVCN, 120, 226N, 1718W,   0,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, OFCL,   0, 170N, 1503W,  50,    0,   ,   0,    ,    0,    0,    0,    0,
CP, 01, 2026081418, 03, OFCL, 120, 226N, 1718W,  70,    0,   ,   0,    ,    0,    0,    0,    0,
`;
const A = parseAdeck(ADECK);
eq("it parses", A.ok, true);
eq("the latest cycle is chosen, not the first seen", A.latestCycle, "2026081418");
eq("and dated", A.cycleIso, "2026-08-14T18:00:00.000Z");
eq("the earlier cycle's rows are not in the working set",
   A.rows.filter((r) => r.tech === "HCCA" && r.tau === 24 && r.vmax === 60).length, 0);
/* TRAP 2: three rows, one forecast. */
eq("one forecast per (tech, tau) after the radii rows merge",
   A.rows.filter((r) => r.tech === "HCCA" && r.tau === 24).length, 1);
eq("and it keeps the intensity", A.rows.find((r) => r.tech === "HCCA" && r.tau === 24).vmax, 74);
/* TRAP 1: a zero is missing, not a forecast of calm. */
eq("a track aid's zero intensity is absent, not zero",
   A.rows.filter((r) => r.tech === "TVCN").every((r) => r.vmax === null), true);
eq("and a zero pressure is absent too", A.rows.find((r) => r.tech === "IVCN" && r.tau === 0).mslp, null);
eq("negative lead times survive — CARQ carries the recent past", A.rows.some((r) => r.tech === "CARQ" && r.tau === -24), true);

console.log("\n[3] the consensus that gets priced");
const C = consensusFrom(A);
ck("HCCA answers for the corrected consensus", C.corrected.tech === "HCCA", C.corrected.tech);
ck("the variable intensity consensus answers", C.variableIntensity.tech === "IVCN");
ck("the track consensus answers with a track", C.variableTrack.tech === "TVCN" && C.variableTrack.track.length === 2);
ck("DeepMind answers under the id the deck actually carries", C.deepmind.tech === "GDMI", C.deepmind.tech);
eq("three aids vote", C.n, 3);
/* The peak is the mean of the members' peaks, not the peak of an averaged curve: the
   contract asks whether the storm EVER reaches a threshold, so each member answers that
   question on its own and the answers are averaged. */
eq("the consensus peak is the mean of the members' peaks", C.peakKt, Math.round(((104 + 79 + 83) / 3) * 10) / 10);
ck("and the disagreement is measured, not assumed", C.spreadKt > 10, String(C.spreadKt));
eq("the range is carried too", [C.minKt, C.maxKt], [79, 104]);
/* A track aid must never be counted as an intensity member — that is trap 1 arriving by
   a different door. */
eq("the track consensus does NOT vote on intensity", C.members.some((m) => m.tech === "TVCN"), false);
ck("nothing is reported missing when everything answered", C.missing.length === 0, C.missing.join("|"));

console.log("\n[4] a missing aid is information, and it is named");
const thin = parseAdeck(ADECK.split("\n").filter((l) => !/GDMI|IVCN/.test(l)).join("\n"));
const C2 = consensusFrom(thin);
eq("one aid left", C2.n, 1);
eq("its spread is null — one member agreeing with itself is not agreement", C2.spreadKt, null);
ck("and the absent aids are listed", C2.missing.length === 2, C2.missing.join(" | "));
/* Absence of the whole family is a refusal, not an empty consensus. */
const none = parseAdeck(ADECK.split("\n").filter((l) => !/GDMI|IVCN|HCCA/.test(l)).join("\n"));
eq("no intensity aid at all refuses outright", consensusFrom(none), null);
eq("and an unparseable deck refuses", consensusFrom(parseAdeck("garbage\nnot,a,deck")), null);

console.log("\n[5] spread is a sample statistic with a floor of two");
eq("one value has no spread", spreadOf([50]), null);
eq("two do", spreadOf([50, 60]).sd, Math.sqrt(50));
eq("and non-numbers are dropped rather than poisoning it", spreadOf([50, 60, null, NaN]).n, 2);

console.log("\n[6] the b-deck: what has happened, never what will");
const BDECK = `
CP, 01, 2026081412,   , BEST,   0, 167N, 1494W,  45,  999, TS,  34, NEQ,  120,   60,    0,   90,
CP, 01, 2026081418,   , BEST,   0, 170N, 1503W,  50,  997, TS,  34, NEQ,  180,    0,    0,  120,
CP, 01, 2026081418,   , BEST,   0, 170N, 1503W,  50,  997, TS,  50, NEQ,   30,    0,    0,   20,
`;
const B = parseBestTrack(BDECK);
eq("two synoptic times, not three rows", B.records.length, 2);
eq("the latest is the latest", B.latest.kt, 50);
eq("radii merge across the threshold rows", Object.keys(B.latest.radii), ["34", "50"]);
/* A quadrant of zero is a real answer here — no winds of that strength on that side —
   which is the opposite of the a-deck rule and the reason they are separate parsers. */
eq("a zero quadrant is an observation, not a gap", B.latest.radii[34].se, 0);

console.log("\n[7] the f-deck: scatterometer and aircraft fixes");
const FDECK = `
CP, 01, 202608140921,  31, OSCT,         CI,  , 1652N, 14868W,      , 3,  40, 3,     , 3,     ,  34, NEQ,   90,   60,    0,   75,    ,  ,  ,  ,  , 3,    ,    ,  ,   NHC, DPR,
CP, 01, 202608141140,  20, DVTO,          I,  , 1687N, 14939W,      , 2,  34, 2,  990, 2, DVRK,    ,     ,     ,     ,     ,     ,    ,  ,  ,  ,  ,  ,    ,    ,  ,  CIMS, AUT,
CP, 01, 202608141200,  70, ANAL,        CIR,  , 1650N, 14900W,    10, 2,  50, 2,  997, 2, MEAS,  34,  NEQ,  180,    0,    0,  120,    ,  ,  ,  , 2,  ,    ,    , C,  CAR0,    ,
CP, 01, 202608142046,  50, AIRC,         CI,  , 1733N, 15119W,      , 1,  45, 1,  999, 1, MEAS,    ,     ,     ,     ,     ,     ,    ,  ,  ,  ,  ,  ,    ,    ,  ,  AF305, ,
`;
const F = parseFdeck(FDECK);
eq("every fix parses", F.fixes.length, 4);
eq("formats are labelled", F.fixes.map((f) => f.formatLabel),
   ["scatterometer", "objective Dvorak", "analysis", "aircraft"]);
const scat = latestScatPass(F);
eq("the latest scatterometer pass is found", scat.type, "OSCT");
eq("with its objective wind", scat.kt, 40);
eq("and its radii", scat.radii[34].ne, 90);
/* Only the latest. A history of passes is a history of satellite orbits, not of the
   storm — the previous orbit describes a storm that has since moved and changed. */
eq("only one pass is reported", scat.passes, 1);
const air = latestAircraftFix(F);
eq("the aircraft fix is found by format, not only by type", air.mslp, 999);
eq("and carries the measurement flag", air.pressureDerivation, "MEAS");
eq("a deck with no pass reports none", latestScatPass(parseFdeck(FDECK.split("\n").filter((l) => !/OSCT/.test(l)).join("\n"))), null);

console.log("\n[7b] a deck that forecasts nothing is distinguishable from a broken parser");
/* CAUGHT BY THE GATE FAILING IN CI, on Hernan. A null consensus is two different events:
   NHC ran no guidance for a system it is winding down, or this pipeline stopped finding
   the guidance NHC ran. The first is the atmosphere; the second is the silent degradation
   the coverage gate exists to catch. Failing on the first is how a gate gets switched off.
   They are told apart from the data itself: a tech that FORECASTS has rows beyond tau 0. */
const ANALYSIS_ONLY = `
EP, 08, 2026081500, 03, CARQ, -24, 150N, 1320W,  35,    0,   ,   0,    ,    0,    0,    0,    0,
EP, 08, 2026081500, 03, CARQ,   0, 156N, 1321W,  30, 1006,   ,   0,    ,    0,    0,    0,    0,
`;
const AO = parseAdeck(ANALYSIS_ONLY);
eq("the deck parses", AO.ok, true);
eq("and it has a record in it", Object.keys(AO.techs).length, 1);
/* The discriminator: nothing here forecasts anything. */
eq("but nothing in it forecasts", AO.forecastTechs.length, 0);
eq("so there is no consensus to extract", consensusFrom(AO), null);
/* The same shape of deck WITH a forecasting aid must report the opposite, because that is
   the case where a null consensus means the pipeline broke. */
eq("a deck with a forecasting aid says so", parseAdeck(ADECK).forecastTechs.length > 0, true);
ck("and names them", parseAdeck(ADECK).forecastTechs.includes("HCCA"), parseAdeck(ADECK).forecastTechs.join(" "));
/* CARQ carries negative and zero taus only, so it must never be counted as forecasting
   even when it sits alongside aids that do. */
eq("an analysis record is not a forecasting aid", parseAdeck(ADECK).forecastTechs.includes("CARQ"), false);

console.log("\n[8] deck names are built, never guessed");
eq("a real id resolves", deckStem("CP012026").stem, "cp012026");
eq("case does not matter", deckStem("al942026").stem, "al942026");
/* A wrong stem fetches a DIFFERENT STORM'S deck, and every number after that is
   confidently about the wrong system. Refusing is the only safe answer. */
eq("a malformed id is refused", deckStem("LALA"), null);
eq("an unknown basin is refused", deckStem("ZZ012026"), null);
eq("and so is nothing at all", deckStem(null), null);

console.log(fail ? `\n${fail} FAILED\n` : "\nall ATCF checks passed\n");
process.exit(fail ? 1 : 0);
