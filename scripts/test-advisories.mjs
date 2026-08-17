#!/usr/bin/env node
/* Tests for the advisory transmission timeline.
 *
 * This decides WHEN the backtest is allowed to see a cycle's guidance. Get it wrong in the
 * early direction and the engine reads a forecast that already absorbed the recon fix it is
 * about to apply again — the exact double-count this project fixed once already.
 *
 * Run: node scripts/test-advisories.mjs
 */
import { transmitMs, parseMessagesIndex, advisoryTimeline, advisoryInForce,
         cycleTransmitMs, offsetFromNominal } from "./lib/advisories.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

console.log("\n[1] a filename stamp is an instant");
eq("MMDDHHMM plus the directory year", transmitMs("09252055", 2024), Date.UTC(2024, 8, 25, 20, 55));
eq("midnight", transmitMs("01010000", 2024), Date.UTC(2024, 0, 1, 0, 0));
/* The calendar must not silently absorb an impossible date. */
eq("31 February is not a date", transmitMs("02312100", 2024), null);
eq("month 13 is not a month", transmitMs("13012100", 2024), null);
eq("hour 24 is not an hour", transmitMs("09252400", 2024), null);
eq("short stamps are refused", transmitMs("0925205", 2024), null);
eq("and no year means no instant", transmitMs("09252055", null), null);
/* 29 Feb is real in a leap year and not otherwise. */
ck("29 Feb 2024 parses", transmitMs("02291200", 2024) != null);
eq("29 Feb 2023 does not", transmitMs("02291200", 2023), null);

console.log("\n[2] the index parses to (storm, product, number, send time)");
const HTML = `
<a href="al092024.fstadv.001.09231457">al092024.fstadv...</a> 2025-04-18 20:31 2.0K
<a href="al092024.fstadv.010.09252055">al092024.fstadv...</a>
<a href="al092024.public_a.010.09252343">al092024.public_a...</a>
<a href="al092024.public.010.09252056">al092024.public...</a>
<a href="al142024.fstadv.009.10071200">al142024.fstadv...</a>
<a href="al092024.discus.010.09252057">not a product we take</a>
<a href="al092024.fstadv.011.BADSTAMP">unparseable stamp</a>
`;
const idx = parseMessagesIndex(HTML, 2024);
eq("five usable entries", idx.length, 5);
ck("sorted by send time", idx.every((e, i, a) => i === 0 || a[i - 1].transmitMs <= e.transmitMs));
ck("discus is not taken", !idx.some((e) => e.product === "discus"));
ck("an unparseable stamp is dropped, not guessed", !idx.some((e) => e.advNum === 11));
eq("advisory 10 of al09 sent 20:55Z",
   idx.find((e) => e.stormId === "al092024" && e.product === "fstadv" && e.advNum === 10).transmitMs,
   Date.UTC(2024, 8, 25, 20, 55));
eq("its intermediate 10A sent 23:43Z",
   idx.find((e) => e.product === "public_a" && e.advNum === 10).transmitMs,
   Date.UTC(2024, 8, 25, 23, 43));

console.log("\n[3] the timeline is per storm, and the intermediates are IN it");
const t09 = advisoryTimeline(idx, "al092024");
eq("four products for al09", t09.length, 4);
ck("al14 is not in al09's timeline", !t09.some((e) => e.stormId === "al142024"));
ck("public_a is present by default", t09.some((e) => e.product === "public_a"));
eq("restricting to fstadv drops it",
   advisoryTimeline(idx, "al092024", { products: ["fstadv"] }).length, 2);
eq("an unknown storm has no timeline", advisoryTimeline(idx, "al992024").length, 0);

console.log("\n[4] the advisory in force is the last one actually SENT");
const at = (h, m) => Date.UTC(2024, 8, 25, h, m);
eq("at 21:00Z it is advisory 10", advisoryInForce(t09, at(21, 0)).advNum, 10);
eq("one minute before 20:55 it is still advisory 1",
   advisoryInForce(t09, at(20, 54)).advNum, 1);
eq("exactly at the send minute it is in force", advisoryInForce(t09, at(20, 55)).advNum, 10);
/* THE ONE THAT MATTERS. 10A went out at 23:43. Before that, 10 is in force. */
eq("at 23:42 the intermediate has not gone out",
   advisoryInForce(t09, at(23, 42)).product, "public");
eq("at 23:43 it has", advisoryInForce(t09, at(23, 43)).product, "public_a");
eq("before the first advisory, nothing is in force",
   advisoryInForce(t09, Date.UTC(2024, 8, 20)), null);

console.log("\n[5] a cycle's guidance becomes visible when its advisory transmits");
const DTG = Date.UTC(2024, 8, 25, 18);
eq("cycle 2024092518 -> 20:55Z, not 18:00Z", cycleTransmitMs(t09, DTG), Date.UTC(2024, 8, 25, 20, 55));
/* This is the whole point: the gate moves nearly three hours later. */
ck("which is 175 minutes after the DTG the old gate used",
   (cycleTransmitMs(t09, DTG) - DTG) / 60000 === 175, String((cycleTransmitMs(t09, DTG) - DTG) / 60000));
/* An advisory sent BEFORE the DTG belongs to an earlier cycle and must not be claimed. */
eq("a cycle after the last advisory has none",
   cycleTransmitMs(t09, Date.UTC(2024, 8, 26, 18)), null);
/* The window cap stops a cycle borrowing an advisory from far in the future — the case
   where NHC handed the storm to WPC and this archive has no entry for it. */
eq("nothing within the window means null, never a guess",
   cycleTransmitMs(t09, Date.UTC(2024, 8, 24, 0)), null);
eq("and a cycle a week earlier gets nothing rather than a distant advisory",
   cycleTransmitMs(t09, Date.UTC(2024, 8, 18, 0)), null);
/* Only fstadv defines a cycle's guidance; an intermediate is not a new deck. */
const onlyIntermediate = advisoryTimeline(idx, "al092024", { products: ["public_a"] });
eq("a timeline with no fstadv yields null", cycleTransmitMs(onlyIntermediate, DTG), null);

console.log("\n[6] nominal time is not a usable proxy, and this is how we know");
/* Measured over all 398 fstadv in 2024: 391 went out EARLY, median 19 min. A gate built on
   the nominal hour would be wrong in both directions and unbounded in one. */
eq("20:55 is five minutes before the 21Z slot", offsetFromNominal(Date.UTC(2024, 8, 25, 20, 55)), -5);
eq("14:57 is three minutes before the 15Z slot", offsetFromNominal(Date.UTC(2024, 8, 23, 14, 57)), -3);
eq("a late one reads positive", offsetFromNominal(Date.UTC(2024, 8, 25, 21, 12)), 12);
eq("and it wraps across midnight", offsetFromNominal(Date.UTC(2024, 8, 25, 2, 55)), -5);

console.log(fail ? `\n${fail} FAILED\n` : "\nall advisory-timeline checks passed\n");
process.exit(fail ? 1 : 0);
