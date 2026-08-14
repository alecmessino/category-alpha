#!/usr/bin/env node
/* Tests for the official-advisory ingest: forecast intensity, watches and warnings, and
 * the per-storm anchor built from them.
 *
 * This code replaces a REFUSAL. The board used to say nothing about a contract asking
 * whether a specific named storm becomes a hurricane, on the grounds that there was no
 * per-storm model. Replacing silence with a number is only an improvement if the number
 * is better than the silence was — so most of what is asserted here is the refusal paths,
 * and above all the one where the storm no longer exists. A five-day-old forecast for a
 * storm that has dissipated is the most dangerous thing this board could display:
 * confidently precise, and about nothing.
 *
 * Run: node scripts/test-advisory.mjs
 */
import { parseForecastAdvisory, parseWatchesWarnings, reachesHurricaneP, stormAnchor, INTENSITY_MAE } from "./fetch-data.mjs";

let fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };

/* The real Forecast/Advisory shape. Positions with MAX WIND beneath them, an INITIAL
   line, wind-radii lines that must not be mistaken for anything, and an OUTLOOK. */
const TCM = `
TROPICAL STORM LALA FORECAST/ADVISORY NUMBER   6
NWS CENTRAL PACIFIC HURRICANE CENTER HONOLULU HI   CP012026
2100 UTC THU AUG 13 2026

INITIAL   13/2100Z 15.4N 146.2W
MAX WIND  45 KT...GUSTS  55 KT.
34 KT... 90NE  60SE  40SW  70NW.

FORECAST VALID 14/0600Z 16.1N 147.8W
MAX WIND  50 KT...GUSTS  60 KT.
34 KT...100NE  70SE  50SW  80NW.

FORECAST VALID 15/1800Z 18.9N 154.0W
MAX WIND  65 KT...GUSTS  80 KT.

OUTLOOK VALID 18/1800Z 22.5N 166.0W
MAX WIND  70 KT...GUSTS  85 KT.
`;

console.log("\n[1] the intensity forecast is read, not thrown away");
const pts = parseForecastAdvisory(TCM, "2026-08-13T21:00:00Z");
eq("four points", pts.length, 4);
eq("intensities in lead-time order", pts.map((p) => p.kt), [45, 50, 65, 70]);
eq("gusts too", pts.map((p) => p.gustKt), [55, 60, 80, 85]);
eq("the INITIAL line is flagged and sits at hour zero", [pts[0].initial, pts[0].hr], [true, 0]);
eq("the OUTLOOK is flagged", pts[3].outlook, true);
ck("positions still parse as before", pts[1].lat === 16.1 && pts[1].lon === -147.8);
ck("wind radii lines are not mistaken for positions", pts.every((p) => p.kt >= 45));

console.log("\n[2] a product with no MAX WIND still yields a track, with wind absent not zero");
const noWind = parseForecastAdvisory("FORECAST VALID 14/0600Z 16.1N 147.8W\n", "2026-08-13T21:00:00Z");
eq("one point", noWind.length, 1);
eq("kt is null, not 0", noWind[0].kt, null);
eq("and it cannot be priced", reachesHurricaneP(noWind), null);

console.log("\n[3] P(reaches hurricane) is the peak, at the peak's own error");
const r = reachesHurricaneP(pts);
ck("a probability comes back", r && r.p > 0 && r.p < 1, r && r.p.toFixed(3));
eq("it uses the tallest forecast point", [r.peakKt, r.peakHr], [70, 117]);
ck("a forecast above the threshold gives better than even", r.p > 0.5, r.p.toFixed(3));
ck("but nowhere near certain, because the error at that range is large", r.p < 0.8, r.p.toFixed(3));
ck("the basis names the error it used", /mean absolute/.test(r.basis) && /kt/.test(r.basis), r.basis);

/* The property that matters: a wider error must not RAISE the answer when the forecast is
   already above the threshold. Scoring every point and keeping the best did exactly that,
   which is why the peak is taken instead. */
const near1 = reachesHurricaneP([{ hr: 24, kt: 70, initial: false }]);
const far1 = reachesHurricaneP([{ hr: 120, kt: 70, initial: false }]);
ck("the same forecast at longer range is LESS informative, not more",
   near1.p > far1.p, `24h=${near1.p.toFixed(3)} 120h=${far1.p.toFixed(3)}`);
const below = reachesHurricaneP([{ hr: 24, kt: 45, initial: false }]);
ck("a forecast well below the threshold is unlikely", below.p < 0.1, below.p.toFixed(3));
const at = reachesHurricaneP([{ hr: 24, kt: 64, initial: false }]);
ck("a forecast exactly at the threshold is a coin flip", Math.abs(at.p - 0.5) < 0.02, at.p.toFixed(3));

console.log("\n[4] a storm already at hurricane strength is settled by observation");
const already = reachesHurricaneP([{ hr: 0, kt: 80, initial: true }, { hr: 24, kt: 90 }]);
ck("high probability", already.p > 0.95, already.p.toFixed(3));
eq("and it says so", already.already, true);
ck("never exactly 1 — the analysis intensity is itself an estimate", already.p < 1);

console.log("\n[5] watches and warnings — the sharpest line in the product");
const TCP = `
WATCHES AND WARNINGS
--------------------
CHANGES WITH THIS ADVISORY:

None.

SUMMARY OF WATCHES AND WARNINGS IN EFFECT:

A Hurricane Watch is in effect for...
* Hawaii County

A Hurricane Watch means that hurricane conditions are possible
within the watch area.

DISCUSSION AND OUTLOOK
----------------------
At 200 PM HST the center was located near 15.6 North.
`;
const w = parseWatchesWarnings(TCP);
eq("the watch is found", w.highest, "Hurricane Watch");
eq("with its area", w.inEffect[0].areas, ["Hawaii County"]);
eq("no change this advisory", w.changed, false);
ck("a watch means intermediate advisories every 3 hours", w.intermediateCadence);

const TCP2 = TCP.replace("None.", "A Hurricane Warning is issued for Hawaii County.")
  .replace("A Hurricane Watch is in effect for...", "A Hurricane Warning is in effect for...");
const w2 = parseWatchesWarnings(TCP2);
eq("an upgrade is detected", w2.highest, "Hurricane Warning");
eq("and flagged as a change", w2.changed, true);
ck("a warning outranks a watch", w2.highestRank > w.highestRank);
eq("a product with no watch block yields null", parseWatchesWarnings("no such block here"), null);

console.log("\n[6] the anchor exists only while the storm does");
const LALA = { id: "CP012026", name: "Lala", wind: 45, advisoryLagMin: 20,
  hurricaneP: reachesHurricaneP(pts), watches: w };
const T = "KXHURRICANENAMES-26DEC01CPAC-LAL";
const L = "Will Lala be categorized as a hurricane in the Central Pacific in 2026?";

const a = stormAnchor(L, T, [LALA]);
ck("an active storm is priced", a != null && a.p > 0, a && a.p.toFixed(3));
eq("and the source is named as the forecast, not the climatology", a.source, "NHC forecast");
ck("it carries both layers", a.layers.length === 2 && a.layers[0].id === "official");
ck("the watch layer is populated", !a.layers[1].unavailable, JSON.stringify(a.layers[1]));

/* THE failure this whole file exists for. */
eq("a storm absent from the live feed is NOT priced", stormAnchor(L, T, []), null);
eq("nor is a different storm's contract", stormAnchor("Will Moke be categorized as a hurricane?", "KXHURRICANENAMES-26DEC01CPAC-MOK", [LALA]), null);
eq("a stale advisory is refused rather than shown",
   stormAnchor(L, T, [Object.assign({}, LALA, { advisoryLagMin: 400 })]), null);
eq("a storm with no parsed intensity forecast is refused",
   stormAnchor(L, T, [Object.assign({}, LALA, { hurricaneP: null })]), null);
eq("a non-naming series is refused", stormAnchor(L, "KXHURCTOT-26DEC01-T5", [LALA]), null);
eq("an unparseable label is refused", stormAnchor("Something else entirely", T, [LALA]), null);

console.log("\n[7] the published error table is NHC's, and monotone in lead time");
const hrs = Object.keys(INTENSITY_MAE).map(Number).sort((x, y) => x - y);
ck("errors grow with lead time", hrs.every((h, i) => i === 0 || INTENSITY_MAE[h] >= INTENSITY_MAE[hrs[i - 1]]),
   JSON.stringify(INTENSITY_MAE));
ck("and are in a plausible range for intensity forecasting",
   INTENSITY_MAE[24] > 3 && INTENSITY_MAE[24] < 12 && INTENSITY_MAE[120] < 25);

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
