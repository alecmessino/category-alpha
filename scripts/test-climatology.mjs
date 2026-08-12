#!/usr/bin/env node
/* Regression tests for the basin climatologies, the season-to-date counter and the
 * per-name ordinal estimators.
 *
 * These exist because the board went from 25 anchored contracts out of 151 to most of
 * them in one change, and every one of those new numbers is a probability shown to an
 * operator next to a price. A probability that is wrong in a direction nobody can see is
 * worse than no probability, so each estimator is checked against a fixture whose answer
 * is known by construction, and every refusal path is checked too — the refusals are the
 * honesty contract.
 *
 * Run: node scripts/test-climatology.mjs
 */
import { parseHurdat2, seriesQuantity, namePosition, ordinalOutcome, namingAnchor, parseBdeck } from "./fetch-data.mjs";

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};
const ck = (name, cond, detail = "") => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + name + (detail ? "  " + detail : "")); };
const near = (name, got, want, tol = 1e-9) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  got=${got} want=${want}`));
};

/* A HURDAT2 fixture in the real format. Three basins, three seasons.
   Header: <ID>, <NAME>, <track line count>,
   Track:  YYYYMMDD, HHMM, R, STATUS, LAT, LON, WIND, PRESSURE, ... */
const trk = (date, status, wind) => `${date}, 0000,  , ${status}, 20.0N,  60.0W, ${String(wind).padStart(3)}, 1000,`;
const HURDAT = [
  // --- 2001: Atlantic gets 3 named (1 hurricane, 1 major); EP gets 1; CP gets NONE ---
  "AL012001,          ALPHA,      2,", trk("20010701", "TS", 45), trk("20010702", "TS", 50),
  "AL022001,           BETA,      2,", trk("20010801", "TS", 40), trk("20010802", "HU", 100),
  "AL032001,          GAMMA,      2,", trk("20010901", "TS", 35), trk("20010902", "TS", 60),
  "AL042001,          DELTA,      1,", trk("20010915", "TD", 25),   // never named — must not count
  "EP012001,            UNO,      2,", trk("20010710", "TS", 40), trk("20010711", "HU", 70),
  // --- 2002: Atlantic gets 1 named; EP gets 2; CP gets 1 ---
  "AL012002,          ALPHA,      1,", trk("20020815", "TS", 50),
  "EP012002,            UNO,      1,", trk("20020705", "TS", 45),
  "EP022002,            DOS,      2,", trk("20020820", "TS", 40), trk("20020821", "HU", 110),
  "CP012002,           KEONI,     2,", trk("20020901", "TS", 40), trk("20020902", "HU", 65),
  // --- 2003: Atlantic gets 2 named (2nd is a major); EP none; CP none ---
  "AL012003,          ALPHA,      1,", trk("20030710", "TS", 40),
  "AL022003,           BETA,      2,", trk("20030905", "TS", 60), trk("20030906", "HU", 100),
].join("\n");

console.log("\n[1] the basin prefix selects which storms count");
const atl = parseHurdat2(HURDAT, 2000, 9999, ["AL"]);
const ep = parseHurdat2(HURDAT, 2000, 9999, ["EP"]);
const cp = parseHurdat2(HURDAT, 2000, 9999, ["CP"]);
eq("Atlantic named per season", atl.namedstorms, [3, 1, 2]);
eq("Atlantic hurricanes per season", atl.hurricanes, [1, 0, 1]);
eq("Atlantic majors per season", atl.major, [1, 0, 1]);
eq("eastern Pacific named per season", ep.namedstorms, [1, 2, 0]);
eq("eastern Pacific hurricanes per season", ep.hurricanes, [1, 1, 0]);
ck("a 25 kt depression never counts as a named storm", atl.namedstorms[0] === 3, "AL042001 peaked at 25 kt");
ck("the default basin is still the Atlantic", JSON.stringify(parseHurdat2(HURDAT, 2000, 9999).namedstorms) === JSON.stringify([3, 1, 2]));

console.log("\n[2] a season with no storms in THIS basin is a zero, not a missing row");
/* The failure this guards: filtering by prefix first would drop 2001 and 2003 from the
   central Pacific entirely, leaving a one-season sample of a busy year — every central
   Pacific probability would then be computed off the basin's best season. */
eq("central Pacific keeps all three seasons", cp.years, [2001, 2002, 2003]);
eq("central Pacific counts, zeros included", cp.namedstorms, [0, 1, 0]);
eq("eastern Pacific keeps the season it had none", ep.namedstorms.length, 3);

console.log("\n[3] excludeYear drops the running season so it is never its own climatology");
eq("2003 excluded", parseHurdat2(HURDAT, 2000, 2003, ["AL"]).years, [2001, 2002]);

console.log("\n[4] every series on the live board maps to a quantity and a basin");
const SERIES = [
  ["KXHURCTOT-26DEC01-T6", "hurricane", "atlantic"],
  ["KXHURCTOTMAJ-26DEC01-T2", "major", "atlantic"],
  ["KXTROPSTORM-26DEC01-T18", "namedstorm", "atlantic"],
  ["KXHURRICANE-26DEC01EPACTOT-12", "hurricane", "epac"],
  ["KXHURRICANE-26DEC01EPACMAJ-6", "major", "epac"],
  ["KXNAMEDSTORM-26DEC01EPACTOT-18", "namedstorm", "epac"],
  ["KXHURRICANE-26DEC01CPACTOT-2", "hurricane", "cpac"],
  ["KXHURRICANE-26DEC01CPACMAJ-2", "major", "cpac"],
  ["KXNAMEDSTORM-26DEC01CPACTOT-4", "namedstorm", "cpac"],
  ["KXHURRICANENAMES-26DEC01ATL-CRI", "naming", null],
  ["KXHURRICANENAMES-26DEC01EPAC-ELI", "naming", null],
  ["KXFIRSTHURRICANE-26DEC01ATL-CRI", "naming", null],
  ["KXNEXTHURDATE-26DEC01-26AUG15", "timing", null],
  ["KXNEXTCAT5HURDATE-26DEC01-26OCT01", "timing", null],
];
for (const [ticker, q, basin] of SERIES) {
  const sq = seriesQuantity(ticker);
  eq(ticker.slice(0, 34), sq && [sq.q, sq.basin], [q, basin]);
}
ck("a naming ticker is NOT mistaken for a Pacific count ladder",
   seriesQuantity("KXHURRICANENAMES-26DEC01EPAC-ELI").q === "naming",
   "it carries EPAC in the id, which the basin test would otherwise catch first");
eq("an unknown series stays unmapped", seriesQuantity("KXSOMETHINGELSE-26"), null);

console.log("\n[5] name position comes from the first letter of the list alphabet");
eq("Arthur is Atlantic #1", namePosition("atlantic", "Arthur"), 1);
eq("Dolly is Atlantic #4", namePosition("atlantic", "Dolly"), 4);
eq("Rene is Atlantic #17 — Q is skipped", namePosition("atlantic", "Rene"), 17);
eq("Wilfred is Atlantic #21, the last", namePosition("atlantic", "Wilfred"), 21);
eq("Atlantic has no X name", namePosition("atlantic", "Xavier"), null);
eq("Xavier is eastern Pacific #22", namePosition("epac", "Xavier"), 22);
eq("Zeke is eastern Pacific #24, the last", namePosition("epac", "Zeke"), 24);
eq("the central Pacific has no positional list", namePosition("cpac", "Mokihana"), null);
/* The live Atlantic board is exactly these 21 tickers. If NHC ever changed the skipped
   letters this assertion is where it would surface, rather than in a silent off-by-one
   that shifts every per-name probability by one slot. */
const ATL_LIVE = ["Arthur", "Bertha", "Cristobal", "Dolly", "Edouard", "Fay", "Gonzalo", "Hanna", "Isaias",
  "Josephine", "Kyle", "Leah", "Marco", "Nana", "Omar", "Paulette", "Rene", "Sally", "Teddy", "Vicky", "Wilfred"];
eq("the live Atlantic list maps to 1..21 with no gaps",
   ATL_LIVE.map((n) => namePosition("atlantic", n)), ATL_LIVE.map((_, i) => i + 1));

console.log("\n[6] the ordinal estimator counts seasons, and the fixture answer is known");
/* Atlantic fixture, from day 0 so every storm is 'still to form':
     2001: TS, HU(major), TS     2002: TS     2003: TS, HU(major)
   1st storm of the season reached hurricane strength in 0 of 3 seasons.
   2nd storm reached hurricane strength in 2 of 3 (2001 Beta, 2003 Beta).
   3rd storm exists in 1 of 3 and was not a hurricane. */
const o1 = ordinalOutcome(atl, 1, 0);
eq("every season has a first storm", o1.pUsed, 1);
eq("the first storm is never a hurricane here", o1.pHurricane, 0);
const o2 = ordinalOutcome(atl, 2, 0);
near("two of three seasons have a second storm reaching hurricane strength", o2.pHurricane, 2 / 3);
near("and in both it was the season's first hurricane", o2.pFirstHurricane, 2 / 3);
const o3 = ordinalOutcome(atl, 3, 0);
near("only one season reaches a third storm", o3.pUsed, 1 / 3);
eq("that third storm was not a hurricane", o3.pHurricane, 0);
ck("a position past every season returns zero rather than throwing", ordinalOutcome(atl, 99, 0).pUsed === 0);
eq("kRemaining below 1 is refused", ordinalOutcome(atl, 0, 0), null);
eq("a climatology with no season sequence is refused", ordinalOutcome({ seasonNamed: [] }, 1, 0), null);

console.log("\n[7] day-of-year restricts history to the part of the season still ahead");
/* Day 220 is 8 August. ATLANTIC storms forming on or after it: 2001 Gamma (1 Sep, TS
   only), 2002 Alpha (15 Aug, TS only), 2003 Beta (5 Sep, HU). So the first storm still
   to form is a hurricane in exactly one of the three seasons.
   Note what is NOT in that list: 2002's Dos is a hurricane forming 20 Aug, but it is an
   EP storm. If the basin filter leaked, this assertion would read 2/3. */
const late = ordinalOutcome(atl, 1, 220);
near("the next storm to form is a hurricane in 1 of 3 seasons after 8 August", late.pHurricane, 1 / 3);
eq("no Atlantic season in the fixture has a SECOND storm left after 8 August", ordinalOutcome(atl, 2, 220).pUsed, 0);
near("the eastern Pacific's next storm after 8 August is a hurricane in 1 of 3 — Dos", ordinalOutcome(ep, 1, 220).pHurricane, 1 / 3);
ck("later in the season is not the same question as the whole season",
   late.pHurricane !== o1.pHurricane, `day0=${o1.pHurricane} day220=${late.pHurricane}`);

console.log("\n[8] the per-name anchor refuses every case where the ordinal is the wrong question");
const clims = { atlantic: atl, epac: ep, cpac: cp };
const std = { atlantic: { namedstorms: 3, hurricanes: 0, major: 0 }, epac: { namedstorms: 7, hurricanes: 2, major: 1 }, cpac: { namedstorms: 1, hurricanes: 0, major: 0 } };
const A = (label, ticker, s = std) => namingAnchor(label, ticker, clims, s, null);

eq("a name already used is refused — that is a question about one storm",
   A("Will Cristobal be categorized as a hurricane in the Atlantic in 2026?", "KXHURRICANENAMES-26DEC01ATL-CRI"), null);
ck("the next unused name IS answered",
   A("Will Dolly be categorized as a hurricane in the Atlantic in 2026?", "KXHURRICANENAMES-26DEC01ATL-DOL") != null);
eq("the central Pacific is refused — its list is not positional",
   A("Will Mokihana be categorized as a hurricane in the Central Pacific in 2026?", "KXHURRICANENAMES-26DEC01CPAC-MOK"), null);
eq("no season-to-date feed means no per-name anchor at all",
   A("Will Dolly be categorized as a hurricane in the Atlantic in 2026?", "KXHURRICANENAMES-26DEC01ATL-DOL", null), null);
eq("a series that is not a naming market is refused",
   A("Will there be more than 5 hurricanes?", "KXHURCTOT-26DEC01-T5"), null);

console.log("\n[9] first-hurricane collapses to zero once the season has one");
const firstAtl = A("Will Dolly be the first Atlantic hurricane in 2026?", "KXFIRSTHURRICANE-26DEC01ATL-DOL");
ck("with no hurricane yet, an unformed name can still be the first", firstAtl && firstAtl.p > 0, String(firstAtl && firstAtl.p));
const stdWithHur = { atlantic: { namedstorms: 3, hurricanes: 1, major: 0 } };
const firstGone = namingAnchor("Will Dolly be the first Atlantic hurricane in 2026?", "KXFIRSTHURRICANE-26DEC01ATL-DOL", clims, stdWithHur, null);
eq("once the season has a hurricane, every unformed name is exactly zero", firstGone && firstGone.p, 0);
ck("and it says why rather than just showing 0%", /already has 1 hurricane/.test(firstGone.basis), firstGone.basis);

console.log("\n[10] the position used is absolute, not an index into what is still listed");
/* The eastern Pacific board is missing F and G because those storms already formed.
   Reading position from the listed set would put Hernan at #6 instead of #8 and shift
   every probability on the ladder. */
eq("Hernan is eastern Pacific #8 regardless of what is listed", namePosition("epac", "Hernan"), 8);
const her = A("Will Hernan be categorized as a hurricane in the Eastern Pacific in 2026?", "KXHURRICANENAMES-26DEC01EPAC-HER");
ck("with 7 named storms recorded, Hernan is the next to form", her && /#1 storm still to form/.test(her.basis), her && her.basis);

console.log("\n[11] b-deck thresholds match the climatology thresholds exactly");
/* If these two ever disagree, L2 subtracts a count measured one way from a climatology
   measured another, and the error is invisible in the output. */
const bd = (rows) => parseBdeck(rows.map((r) => `AL, 03, ${r[0]},   , BEST,   0, 200N,  600W, ${r[1]}, 1000, ${r[2]},`).join("\n"));
eq("33 kt is not a named storm", bd([["2026081200", " 33", "TD"]]).named, false);
eq("34 kt with TS status is", bd([["2026081200", " 34", "TS"]]).named, true);
eq("a subtropical storm counts as named", bd([["2026081200", " 45", "SS"]]).named, true);
eq("HU status is a hurricane", bd([["2026081200", " 70", "HU"]]).hurricane, true);
eq("95 kt is not a major", bd([["2026081200", " 95", "HU"]]).major, false);
eq("96 kt is", bd([["2026081200", " 96", "HU"]]).major, true);
eq("peak wind is the max over the track", bd([["2026081200", " 40", "TS"], ["2026081206", " 85", "HU"], ["2026081212", " 50", "TS"]]).vmax, 85);
eq("a storm that never reaches 34 kt is nothing", bd([["2026081200", " 30", "TD"]]), { vmax: 30, named: false, hurricane: false, major: false });
eq("garbage yields a zero record rather than throwing", parseBdeck("not a b-deck"), { vmax: 0, named: false, hurricane: false, major: false });
eq("empty input is safe", parseBdeck(""), { vmax: 0, named: false, hurricane: false, major: false });

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
