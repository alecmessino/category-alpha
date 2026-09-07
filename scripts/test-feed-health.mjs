#!/usr/bin/env node
/* Tests for docs/app/feed-health.js — the one rule every operational source is judged by.
 *
 * The module is a plain browser script (the terminal has no bundler), so it is loaded here the
 * way scripts/test-staleness.mjs loads compute.js: evaluated in a vm with a bare `window`. The
 * same bytes the page runs are the bytes under test.
 *
 * What is protected:
 *   - the four status words, at the boundaries the cadence and grace define
 *   - two clocks kept apart: AGE is valid→now, INGEST LAG is valid→fetched, never conflated
 *   - a future valid time is reported as FUTURE, never clamped to a zero age (replay leak guard)
 *   - an absent feed is NO FEED with null ages — never an age of 0, never LIVE
 *   - event-driven sources (recon, scatterometer) are never called STALE for not flying
 *   - the worst-of rule picks the storm that is furthest behind
 *   - the board rows are built from plain values, and the ADV row cannot produce NaN — the
 *     regression that put "ADV NaNm" in the header for weeks
 *
 * Run: node scripts/test-feed-health.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

const ctx = { window: {} };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(readFileSync(resolve(__dir, "../docs/app/feed-health.js"), "utf8"), ctx, { filename: "feed-health.js" });
const FH = ctx.window.MTFeedHealth;
ck("the module registered itself on window", !!FH && typeof FH.classify === "function");

const T0 = Date.UTC(2026, 8, 6, 18, 0);           // 18:00Z
const at = (min) => T0 + min * 60000;

console.log("\n[1] the status ladder on a six-hourly source (cadence 360, grace 90)");
const six = (ageMin, extra) => FH.classify({ validZ: T0, cadenceMin: 360, nowMs: at(ageMin), ...(extra || {}) });
eq("fresh", six(5).status, "LIVE");
eq("one cadence", six(360).status, "LIVE");
eq("one cadence plus the whole grace", six(450).status, "LIVE");
eq("one minute past grace", six(451).status, "DELAYED");
eq("two cadences", six(720).status, "DELAYED");
eq("past two cadences", six(721).status, "STALE");
eq("the grace is stated on the row", six(5).graceMin, 90);
eq("the expected-by instant is stated", six(5).expectedByZ, new Date(at(360)).toISOString());
eq("overdue is 0 while on schedule, minutes once late", [six(100).overdueMin, six(400).overdueMin], [0, 40]);

console.log("\n[2] the ten-minute pipeline tick (cadence 10, grace floors at 15)");
const ten = (ageMin) => FH.classify({ validZ: T0, cadenceMin: 10, nowMs: at(ageMin) });
eq("grace never drops below fifteen minutes", ten(0).graceMin, 15);
eq("25 minutes is still LIVE", ten(25).status, "LIVE");
eq("26 minutes is DELAYED", ten(26).status, "DELAYED");
eq("the stale line is stated, and it is past the grace: cadence + two graces = 40", ten(26).staleAtMin, 40);
eq("40 minutes is still DELAYED", ten(40).status, "DELAYED");
eq("41 minutes is STALE", ten(41).status, "STALE");
eq("on the six-hourly source the stale line is two cadences", six(5).staleAtMin, 720);

console.log("\n[3] two clocks, never one");
const r = FH.classify({ validZ: T0, fetchedAt: at(77), cadenceMin: 360, nowMs: at(200) });
eq("AGE is valid → now", r.ageMin, 200);
eq("INGEST LAG is valid → fetched", r.ingestLagMin, 77);
eq("FETCH AGE is fetched → now", r.fetchAgeMin, 123);
eq("the valid and fetched instants are carried verbatim", [r.validZ, r.fetchedAt], [new Date(T0).toISOString(), new Date(at(77)).toISOString()]);

console.log("\n[4] the replay guard: a valid time after the clock is FUTURE, never age 0");
const fut = FH.classify({ validZ: at(60), cadenceMin: 360, nowMs: T0 });
eq("status", fut.status, "FUTURE");
eq("the negative age is reported, not clamped", fut.ageMin, -60);
ck("and it ranks worse than STALE, so a worst-of never hides it", FH.RANK.FUTURE > FH.RANK.STALE);

console.log("\n[5] absent is absent");
const none = FH.classify({ ok: false, cadenceMin: 360, nowMs: T0 });
eq("a feed that did not answer is NO FEED", none.status, "NO FEED");
eq("with no age, not an age of zero", [none.ageMin, none.fetchAgeMin, none.ingestLagMin], [null, null, null]);
eq("no valid time, same answer", FH.classify({ ok: true, validZ: null, cadenceMin: 360, nowMs: T0 }).status, "NO FEED");
eq("an unparseable valid time is not a valid time", FH.classify({ validZ: "not a date", cadenceMin: 360, nowMs: T0 }).status, "NO FEED");
eq("no clock: UNKNOWN, never LIVE by default", FH.classify({ validZ: T0, cadenceMin: 360 }).status, "UNKNOWN");

console.log("\n[6] event-driven sources are dated, not judged");
const ev = FH.classify({ validZ: T0, cadenceMin: null, nowMs: at(30 * 60) });
eq("a thirty-hour-old aircraft fix is EVENT, not STALE", ev.status, "EVENT");
eq("its age is still shown", ev.ageMin, 1800);
eq("and it carries no cadence to be overdue against", [ev.cadenceMin, ev.expectedByZ, ev.overdueMin], [null, null, null]);

console.log("\n[7] worst-of");
const a = six(5), b = six(500), c = six(800);
eq("the furthest-behind row wins", FH.worst([a, b, c]).status, "STALE");
eq("LIVE and DELAYED: DELAYED", FH.worst([a, b]).status, "DELAYED");
eq("two LIVE rows: the older one", FH.worst([six(5), six(100)]).ageMin, 100);
eq("latest: the most recent event", FH.latest([six(500), six(5), null]).ageMin, 5);
eq("latest of nothing dated: null", FH.latest([FH.classify({ ok: false, nowMs: T0 })]), null);
eq("nothing to judge: null, not LIVE", FH.worst([]), null);
eq("nulls in the list are ignored", FH.worst([null, a]).status, "LIVE");

console.log("\n[8] the board rows — built from plain values, so functions cannot leak in");
const model = {
  nowMs: at(171), generatedAt: T0, fetchedAt: T0, marketsOk: true, outlookOk: true, outlookIssuedZ: at(0),
  satelliteAt: at(160),
  storms: [
    { advisoryIssuedZ: at(-26), guidanceCycleIso: T0, shipsCycleIso: T0, reconFixIso: null, ascatIso: at(-9 * 60) },
    { advisoryIssuedZ: at(-30), guidanceCycleIso: T0, shipsCycleIso: T0, reconFixIso: null, ascatIso: null },
  ],
};
const rows = FH.rows(model);
const row = (k) => rows.find((x) => x.k === k);
eq("ten rows, one per source", rows.map((x) => x.k), ["ADV", "GUID", "SHIPS", "RECON", "SCAT", "SAT", "MKT", "TWO", "SNAP", "SST"]);
eq("ADV: the worst storm's advisory age, as a number", row("ADV").h.ageMin, 201);
ck("ADV never NaN — the regression this module exists to end", Number.isFinite(row("ADV").h.ageMin) && !/NaN/.test(JSON.stringify(rows)));
eq("ADV status", row("ADV").h.status, "LIVE");
eq("GUID: the deck cycle judged against six hours", [row("GUID").h.ageMin, row("GUID").h.status], [171, "LIVE"]);
eq("RECON with no fix anywhere: NO FEED, not stale", row("RECON").h.status, "NO FEED");
eq("SCAT: the one pass that exists is an EVENT, dated from its own instant (9h before the cycle, 171 min after it: 711 min)", [row("SCAT").h.status, row("SCAT").h.ageMin], ["EVENT", 711]);
eq("SNAP: a 171-minute-old snapshot is STALE against a ten-minute tick", row("SNAP").h.status, "STALE");
eq("ADV: ingest lag is the advisory's own valid → fetched, 30 min for the worst storm", row("ADV").h.ingestLagMin, 30);
eq("SAT: an eleven-minute-old slot is LIVE", row("SAT").h.status, "LIVE");
eq("SST: not wired, shown OFF", row("SST").h.status, "OFF");
eq("every row states its cadence, null where there is none", rows.map((x) => x.cadenceMin), [360, 360, 360, null, null, 10, 10, 360, 10, null]);
/* The frame's own clock. Rewinding the clock to the advisory's issuance must not read a
   future guidance cycle as live. */
const rewound = FH.rows({ ...model, nowMs: at(-30), generatedAt: at(-30) });
eq("at a frame before the 18Z cycle, the deck is FUTURE — not knowable then", rewound.find((x) => x.k === "GUID").h.status, "FUTURE");
eq("a model with no storms yields NO FEED rows, not a crash and not LIVE", FH.rows({ nowMs: T0, generatedAt: T0 }).find((x) => x.k === "ADV").h.status, "NO FEED");

console.log("\n[9] formatting");
eq("minutes", FH.fmtMin(12), "12m");
eq("hours", FH.fmtMin(67), "1h07m");
eq("days", FH.fmtMin(3000), "2d02h");
eq("null", FH.fmtMin(null), "—");
eq("a negative age keeps its sign", FH.fmtMin(-60), "−1h00m");
eq("Z stamps", FH.fmtZ(new Date(T0).toISOString()), "06 Sep 18:00Z");

console.log(fail ? `\n${fail} feed-health check(s) FAILED` : "\nall feed-health checks passed");
process.exit(fail ? 1 : 0);
