#!/usr/bin/env node
/* Regression test for the NHC Tropical Weather Outlook parser.
 *
 * The fixtures below are the REAL products, verbatim, issued 800 PM EDT / 500 PM PDT
 * Tue Aug 11 2026. They exist because the terminal was reporting "no active tropical
 * cyclones" — true of CurrentStorms.json, which only carries classified systems —
 * while three Atlantic areas were under watch, one at 80% over seven days.
 *
 * The percentages are NHC's published forecasts. This parser lifts them verbatim and
 * attributes them; it must never derive, smooth or reinterpret them.
 *
 * Run: node scripts/test-outlook.mjs
 */
import { parseTWO } from "./fetch-data.mjs";

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};
const ck = (name, cond, detail = "") => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + name + (detail ? "  " + detail : "")); };

const ATL = `ZCZC MIATWOAT ALL
TTAA00 KNHC DDHHMM

Tropical Weather Outlook
NWS National Hurricane Center Miami FL
800 PM EDT Tue Aug 11 2026

For the North Atlantic...Caribbean Sea and the Gulf of America:

1. Central Tropical Atlantic (AL92):
Showers and thunderstorms are showing some signs of organization in
association with a tropical wave located around 700 miles southwest
of the Cabo Verde Islands. Environmental conditions are forecast to
be conducive for development during the next few days, and a
tropical depression will likely form within a couple of days while
the system moves westward to west-northwestward across the central
tropical Atlantic.
* Formation chance through 48 hours...medium...60 percent.
* Formation chance through 7 days...high...80 percent.

2. Central Subtropical Atlantic (AL93):
Satellite images indicate that the low-level circulation associated
with a broad area of low pressure located about 900 miles east-
northeast of Bermuda has become better defined today.  Further
development of this system is possible, and a short-lived tropical
depression or storm could form during the next day or so while it
moves eastward at around 20 mph across the central subtropical
Atlantic.  The system is forecast to reach cooler waters by
Thursday, ending its chances of formation.
* Formation chance through 48 hours...medium...40 percent.
* Formation chance through 7 days...medium...40 percent.

3. Eastern Tropical Atlantic:
A tropical wave just offshore of the coast of west Africa is
producing disorganized showers and thunderstorms.  Environmental
conditions are forecast to be generally conducive for some
development of this system during the next several days while it
moves westward or west-northwestward across the eastern and central
tropical Atlantic.
* Formation chance through 48 hours...low...10 percent.
* Formation chance through 7 days...low...20 percent.

Forecaster Blake
`;

const EPAC = `ZCZC MIATWOEP ALL
TTAA00 KNHC DDHHMM

Tropical Weather Outlook
NWS National Hurricane Center Miami FL
500 PM PDT Tue Aug 11 2026

For the eastern and central North Pacific east of 180 longitude:

1. Central Pacific (CP93):
Visible satellite imagery indicates that a well-defined low-level
center has formed in association with the low pressure system
located about 1050 miles east-southeast of the Hawaiian Islands.
* Formation chance through 48 hours...high...90 percent.
* Formation chance through 7 days...high...90 percent.

2. Western East Pacific (EP99):
A well-defined low pressure system located about midway between
Hawaii and the west coast of Mexico is producing some shower and
thunderstorm activity.
* Formation chance through 48 hours...high...70 percent.
* Formation chance through 7 days...high...70 percent.


Forecaster Hagen
`;

console.log("\n[1] Atlantic product — three areas, verbatim probabilities");
const a = parseTWO(ATL, "atlantic");
eq("area count", a.areas.length, 3);
eq("issued", a.issued, "800 PM EDT Tue Aug 11 2026");
eq("invest IDs", a.areas.map((x) => x.id), ["AL92", "AL93", null]);
eq("48h percentages", a.areas.map((x) => x.pct48), [60, 40, 10]);
eq("7-day percentages", a.areas.map((x) => x.pct7d), [80, 40, 20]);
eq("titles have the ID stripped", a.areas.map((x) => x.title),
   ["Central Tropical Atlantic", "Central Subtropical Atlantic", "Eastern Tropical Atlantic"]);
ck("summary captured, prose only", /tropical wave located around 700 miles/.test(a.areas[0].summary)
   && !/Formation chance/.test(a.areas[0].summary));
eq("basin tagged", [...new Set(a.areas.map((x) => x.basin))], ["atlantic"]);

console.log("\n[2] Pacific product — the same shape, different basin");
const p = parseTWO(EPAC, "pacific");
eq("area count", p.areas.length, 2);
eq("issued", p.issued, "500 PM PDT Tue Aug 11 2026");
eq("invest IDs", p.areas.map((x) => x.id), ["CP93", "EP99"]);
eq("48h percentages", p.areas.map((x) => x.pct48), [90, 70]);
eq("7-day percentages", p.areas.map((x) => x.pct7d), [90, 70]);

console.log("\n[3] an area with no invest ID is kept, not dropped");
ck("third Atlantic area survives without an ID", a.areas[2] && a.areas[2].id === null && a.areas[2].pct7d === 20);

console.log("\n[4] a quiet basin parses to zero areas, not to an error");
const quiet = parseTWO(`Tropical Weather Outlook
NWS National Hurricane Center Miami FL
800 AM EDT Sun Aug 30 2026

For the North Atlantic...Caribbean Sea and the Gulf of America:

Tropical cyclone formation is not expected during the next 7 days.

Forecaster Blake
`, "atlantic");
eq("no areas", quiet.areas.length, 0);
ck("still reports an issue time", !!quiet.issued, quiet.issued || "");

console.log("\n[5] an HTML-wrapped product parses — the .shtml page is not the raw text");
/* The live .shtml fetch returned HTTP 200, the issue line parsed, and zero areas came
   out. Entity padding after the heading colon defeats /:\s*$/, which is the most
   likely difference between the served page and the raw product. */
const WRAPPED = `<html><body><pre>
Tropical Weather Outlook
NWS National Hurricane Center Miami FL
800 PM EDT Tue Aug 11 2026

For the North Atlantic...Caribbean Sea and the Gulf of America:

1. Central Tropical Atlantic (AL92):&nbsp;
Showers and thunderstorms are showing some signs of organization.
* Formation chance through 48 hours...medium...60 percent.
* Formation chance through 7 days...high...80 percent.
</pre></body></html>`;
const wrapped = parseTWO(WRAPPED, "atlantic");
eq("HTML-wrapped area count", wrapped.areas.length, 1);
eq("HTML-wrapped ID", wrapped.areas[0] && wrapped.areas[0].id, "AL92");
eq("HTML-wrapped 7-day", wrapped.areas[0] && wrapped.areas[0].pct7d, 80);

console.log("\n[6] malformed input degrades to empty rather than inventing areas");
eq("garbage", parseTWO("not a product at all", "atlantic").areas.length, 0);
eq("empty", parseTWO("", "atlantic").areas.length, 0);
ck("a heading with no percentages is not treated as an area",
   parseTWO("1. Somewhere (AL99):\nprose with no formation lines\n", "atlantic").areas.length === 0);

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
