#!/usr/bin/env node
/* Tests for the Tropical Cyclone Discussion ingest.
 *
 * This is the only product on the board that is PROSE, and prose is where invention gets
 * in. The parser's job is to classify one thing — where the official forecast sits inside
 * the guidance envelope — and to carry the sentence it classified from, verbatim, so the
 * classification can be checked in a glance. Everything asserted below is either "the
 * quote is exactly what the forecaster wrote" or "no match produced no field", because a
 * confident category attached to the wrong sentence is worse than no category at all.
 *
 * The fixture is the real CP012026 discussion for Advisory 9, 14 Aug 2026.
 *
 * Run: node scripts/test-discussion.mjs
 */
import { parseDiscussion, parseWatchesWarnings, parseForecastAdvisory } from "./fetch-data.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `\n         got  ${JSON.stringify(g)}\n         want ${JSON.stringify(w)}`)); };

const NOW = Date.UTC(2026, 7, 14, 15, 30);      // 14 Aug 2026 15:30Z

const DISC = `
775
WTPA42 PHFO 141444
TCDCP2

Tropical Storm Lala Discussion Number   9
NWS Central Pacific Hurricane Center Honolulu HI   CP012026
500 AM HST Fri Aug 14 2026

Lala has remained relatively steady state overnight. The storm continues to be
asymmetric, with most of the deep convection and tropical-storm-force winds on
its north side. Earlier data from an Air Force reconnaissance aircraft indicate
that the minimum pressure has been generally unchanged around 997 mb and the
maximum winds still near 60 mph (50 knots). The aircraft data and an OSCAT pass
from around 09:00 UTC indicate that the wind field has contracted, which could be
a sign that circulation is becoming more compact and might lead to strengthening
soon.

Lala is moving west-northwestward at 10 mph (10 knots), and this general motion is
expected to persist during the next few days as a mid-level high pressure system
remains anchored north of the Hawaiian Islands. The NHC track forecast is mostly
unchanged from the previous one, and is based on a blend of the latest Google
DeepMind, HCCA, and TVCA aids, which have been performing quite well for this
storm.

Steady strengthening is expected during the next day or so since the storm appears
to be consolidating while environmental conditions remain generally favorable.
Lala is still forecast to become a category 1 hurricane when it reaches the Big
Island. The latest NHC intensity forecast is similar to the previous advisory and
remains near the upper end of the guidance envelope.

$$
Forecaster Cangialosi/Pierce
`;

console.log("\nTropical Cyclone Discussion\n");
const d = parseDiscussion(DISC, NOW);
ck("the discussion parses at all", !!d);

// --- issuance, measured from the WMO header, not from when we happened to read it ---
eq("issuance comes from the WMO header", d.issuedZ, "2026-08-14T14:44:00.000Z");
eq("lag is measured against this cycle's clock", d.lagMin, 46);
eq("forecaster is attributed", d.forecaster, "Cangialosi/Pierce");

/* The load-bearing extraction. P(reaches hurricane) on this board is built ON the
   official intensity forecast, so a forecast sitting at the top of the guidance envelope
   means every number derived from it carries that tilt. */
eq("INTENSITY guidance is read as ABOVE", d.guidance.intensity && d.guidance.intensity.position, "above");
ck("and it carries the sentence it read that from",
  d.guidance.intensity && /remains near the upper end of the guidance envelope\.$/.test(d.guidance.intensity.quote),
  d.guidance.intensity ? JSON.stringify(d.guidance.intensity.quote) : "(none)");
ck("the quote is a sentence, not a runaway match",
  d.guidance.intensity && d.guidance.intensity.quote.length < 200,
  d.guidance.intensity ? d.guidance.intensity.quote.length + " chars" : "");

/* The bug this file exists for. The TRACK forecast is also described as a blend of aids,
   and classifying on phrasing alone let that sentence set the intensity position — the
   one number on this board that is built on the official intensity forecast. */
eq("the track blend is filed under TRACK, not intensity", d.guidance.track && d.guidance.track.position, "with");
ck("and it is the track sentence, not the intensity one",
  d.guidance.track && /NHC track forecast/i.test(d.guidance.track.quote), d.guidance.track ? d.guidance.track.quote.slice(0, 60) : "");
ck("the two aspects did not collapse into each other",
  d.guidance.intensity.quote !== d.guidance.track.quote);

// --- observations are quoted, never converted into an instrument feed ---
const kinds = d.cues.map((c) => c.value);
ck("aircraft reconnaissance is noted", kinds.includes("aircraft"));
ck("the scatterometer pass is noted", kinds.includes("scatterometer"));
ck("a strengthening trend is noted", kinds.includes("strengthening"));
ck("every cue carries its verbatim sentence", d.cues.every((c) => c.quote && c.quote.length > 10 && c.quote.length <= 400));
ck("no cue invents a number", d.cues.every((c) => typeof c.value === "string"));

// --- refusals: the whole point ---
console.log("\nRefusals\n");
ck("empty text yields null, not an empty shell", parseDiscussion("", NOW) === null);
ck("unrelated text yields null", parseDiscussion("The quick brown fox jumped.", NOW) === null);

const NO_GUIDANCE = DISC.replace(/The latest NHC intensity forecast[^$]*?envelope\./, "");
const ng = parseDiscussion(NO_GUIDANCE, NOW);
ck("no intensity guidance sentence means NO intensity field — not a default",
  ng && ng.guidance.intensity === null);
ck("and the track classification is unaffected by its absence",
  ng && ng.guidance.track && ng.guidance.track.position === "with");
ck("but the rest of the discussion still parses", ng && ng.cues.length > 0 && ng.issuedZ === "2026-08-14T14:44:00.000Z");

const BELOW = DISC.replace("remains near the upper end of the guidance envelope",
  "is at the lower end of the guidance envelope");
eq("the opposite phrasing is read as BELOW", parseDiscussion(BELOW, NOW).guidance.intensity.position, "below");

const BLEND = DISC.replace("The latest NHC intensity forecast is similar to the previous advisory and\nremains near the upper end of the guidance envelope.",
  "The intensity forecast is in line with the consensus aids.");
eq("a consensus phrasing is read as WITH", parseDiscussion(BLEND, NOW).guidance.intensity.position, "with");

/* A sentence that talks about guidance without naming what it is guiding is left alone.
   Guessing which aspect it meant is the whole failure mode. */
const VAGUE = parseDiscussion("WTPA42 PHFO 141444\n\nThe forecast is near the upper end of the guidance.", NOW);
ck("an unattributed guidance sentence is not classified", VAGUE && VAGUE.guidance === null);
ck("and the product is still dated, so the refusal is visible rather than silent",
  VAGUE && VAGUE.issuedZ === "2026-08-14T14:44:00.000Z");

/* ---- the watch/warning bullet wrap, which dropped an island ---------------------
   NHC hard-wraps this product, so a long area name runs onto an unmarked continuation
   line. Matching only lines beginning with "*" silently truncated Maui County's warning
   to "...Molokai and", dropping Kahoolawe off a Tropical Storm Warning. */
console.log("\nWatch and warning bullets that wrap\n");
const ADV9 = `
944
WTPA32 PHFO 141443
TCPCP2

BULLETIN
Tropical Storm Lala Advisory Number   9

WATCHES AND WARNINGS
--------------------
CHANGES WITH THIS ADVISORY:

The Tropical Storm Watch for Maui County has been upgraded to a
Tropical Storm Warning.

A Tropical Storm Watch has been issued for Oahu and Kauai Counties.

SUMMARY OF WATCHES AND WARNINGS IN EFFECT:

A Hurricane Warning is in effect for...
* Hawaii County
 
A Tropical Storm Warning is in effect for...
* Maui County, including the islands of Maui, Lanai, Molokai and
Kahoolawe
 
A Tropical Storm Watch is in effect for...
* Oahu
* Kauai County, including the islands of Kauai and Niihau
 
A Hurricane Warning means that hurricane conditions are expected 
somewhere within the warning area.

DISCUSSION AND OUTLOOK
----------------------
At 500 AM HST the center was located near 16.7 North.
`;
const w = parseWatchesWarnings(ADV9);
eq("three groups in effect", w.inEffect.length, 3);
eq("the wrapped area is rejoined, so Kahoolawe is not dropped",
  w.inEffect[1].areas,
  ["Maui County, including the islands of Maui, Lanai, Molokai and Kahoolawe"]);
eq("an unwrapped single bullet is unchanged", w.inEffect[0].areas, ["Hawaii County"]);
eq("two bullets stay two bullets", w.inEffect[2].areas.length, 2);
eq("highest in effect is the Hurricane Warning", w.highest, "Hurricane Warning");
eq("and it outranks the others", w.highestRank, 4);
ck("the changes block is captured", /upgraded to a Tropical Storm Warning/.test(w.changes.replace(/\s+/g, " ")));
ck("prose after the bullets is not swallowed as an area",
  !JSON.stringify(w.inEffect).includes("hurricane conditions are expected"));
/* The separator lines in the real product are a single SPACE, not empty. A parser that
   only stops at truly-blank lines ran through the next two headers and returned one
   group where there were three — which is what the deployed board showed. */
ck("a whitespace-only separator still closes a group",
  w.inEffect.every((g) => !/is in effect for/i.test(JSON.stringify(g.areas))));

/* ---- the INITIAL line carries its intensity inline in the compact TCM layout ---- */
console.log("\nForecast advisory: both intensity layouts\n");
const TCM = `
FORECAST/ADVISORY NUMBER   9

INITIAL       14/1500Z 16.7N 149.5W    50 KT  60 MPH
 34 KT... 205NE   0SE   0SW  60NW.

FORECAST VALID 15/0000Z 17.2N 151.2W
MAX WIND  55 KT...GUSTS  65 KT.

FORECAST VALID 15/1200Z 18.0N 153.3W
MAX WIND  65 KT...GUSTS  80 KT.
`;
const pts = parseForecastAdvisory(TCM, "2026-08-14T15:00:00Z");
eq("three points", pts.length, 3);
eq("hour zero keeps its inline intensity", pts[0].kt, 50);
eq("and it is flagged as the initial position", pts[0].initial, true);
eq("a MAX WIND line still wins where it exists", pts[1].kt, 55);
eq("gusts come from the MAX WIND line", pts[1].gustKt, 65);
eq("the peak is read correctly", Math.max(...pts.map((p) => p.kt)), 65);
ck("no point invents a gust it was not given", pts[0].gustKt === null);

console.log(fail ? `\n${fail} FAILED\n` : "\nall discussion checks passed\n");
process.exit(fail ? 1 : 0);
