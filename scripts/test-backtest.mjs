#!/usr/bin/env node
/* Tests for the historical replay harness.
 *
 * The assertions that matter are the ZERO-PEEK ones. A backtest that can see the future is
 * worse than no backtest: it produces a confident number, and the number is a lie.
 *
 * Run: node scripts/test-backtest.mjs
 */
import { cycleMs, visibleAt, milestones, fixVisibleAt, outcomeFrom, entryOf,
         brierOf, reliabilityTable, aggregate, MIN_BACKTEST_STORMS } from "./lib/backtest.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = g != null && Math.abs(g - w) <= tol; if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${g} want=${w}±${tol}`)); };

console.log("\n[1] a cycle is a UTC instant");
eq("YYYYMMDDHH parses", cycleMs("2026081500"), Date.UTC(2026, 7, 15, 0));
eq("and 18Z is 18Z", cycleMs("2026081518"), Date.UTC(2026, 7, 15, 18));
eq("nonsense is not a time", cycleMs("nope"), null);
eq("nor is a short string", cycleMs("20260815"), null);
eq("nor null", cycleMs(null), null);

console.log("\n[2] ZERO PEEK: the simulation can only see what had been issued");
/* An archived deck holds every cycle the storm ever had. This is the whole trap. */
const deck = [
  { cycle: "2026081500", tech: "OFCL", tau: 0,  vmax: 45 },
  { cycle: "2026081500", tech: "OFCL", tau: 48, vmax: 70 },
  { cycle: "2026081506", tech: "OFCL", tau: 0,  vmax: 55 },
  { cycle: "2026081512", tech: "OFCL", tau: 0,  vmax: 75 },
  { cycle: "2026081518", tech: "OFCL", tau: 0,  vmax: 90 },
];
const t06 = cycleMs("2026081506");
const seen = visibleAt(deck, t06);
eq("at 06Z the 00Z and 06Z cycles are visible", seen.length, 3);
ck("and nothing later is", seen.every((r) => cycleMs(r.cycle) <= t06), JSON.stringify(seen.map((r) => r.cycle)));
ck("specifically, the 12Z and 18Z rows are absent",
   !seen.some((r) => r.cycle === "2026081512" || r.cycle === "2026081518"));
/* The distinction that matters, and it is easy to get backwards. A tau>0 row is a FORECAST
   the operator genuinely had — the 00Z cycle's +48h call of 70 kt was on the desk at 00Z and
   is fair game. What must never be visible is a later ANALYSIS: what the storm turned out to
   be. So the gate is checked on tau 0 rows, which are the observations. */
const analysesSeen = seen.filter((r) => r.tau === 0).map((r) => r.vmax);
eq("the analyses visible at 06Z are 45 and 55 kt", analysesSeen.sort((a, b) => a - b), [45, 55]);
ck("the 75 and 90 kt analyses are NOT visible — that would be reading the outcome",
   !analysesSeen.includes(75) && !analysesSeen.includes(90), JSON.stringify(analysesSeen));
ck("but the 00Z forecast of 70 kt IS, because it was issued at 00Z",
   seen.some((r) => r.tau === 48 && r.vmax === 70));
eq("at the first cycle only the first cycle is visible", visibleAt(deck, cycleMs("2026081500")).length, 2);
eq("before the storm existed, nothing is", visibleAt(deck, Date.UTC(2026, 7, 14)).length, 0);
/* A row with an unparseable cycle must be DROPPED, not admitted. Admitting it would be a
   silent hole in the guarantee. */
eq("a row with no usable cycle is never visible",
   visibleAt([{ cycle: "junk", vmax: 200 }], Date.UTC(2030, 0, 1)).length, 0);

console.log("\n[3] milestones are the cycles, in order");
eq("four distinct cycles", milestones(deck).length, 4);
eq("ascending", milestones(deck), [cycleMs("2026081500"), cycleMs("2026081506"),
                                   cycleMs("2026081512"), cycleMs("2026081518")]);
eq("windowed from", milestones(deck, { fromMs: cycleMs("2026081512") }).length, 2);
eq("windowed to", milestones(deck, { toMs: cycleMs("2026081506") }).length, 2);

console.log("\n[4] a recon fix is visible only once it has been filed");
const fixes = [
  { iso: "2026-08-15T02:00:00Z", mslp: 995 },
  { iso: "2026-08-15T08:00:00Z", mslp: 985 },
  { iso: "2026-08-15T14:00:00Z", mslp: 970 },
];
eq("at 06Z the 02Z fix is the latest one", fixVisibleAt(fixes, t06).mslp, 995);
eq("at 12Z it is the 08Z fix", fixVisibleAt(fixes, cycleMs("2026081512")).mslp, 985);
eq("before any fix, none", fixVisibleAt(fixes, Date.UTC(2026, 7, 15, 0)), null);
ck("and a deeper later fix never leaks backwards",
   fixVisibleAt(fixes, t06).mslp !== 970);

console.log("\n[5] the outcome comes from the b-deck, read after the fact");
eq("a storm that reached hurricane resolves to 1",
   outcomeFrom([{ vmax: 35 }, { vmax: 60 }, { vmax: 80 }], 65).outcome, 1);
eq("with its true peak", outcomeFrom([{ vmax: 35 }, { vmax: 80 }], 65).peakKt, 80);
eq("one that did not resolves to 0", outcomeFrom([{ vmax: 35 }, { vmax: 60 }], 65).outcome, 0);
eq("exactly at threshold counts", outcomeFrom([{ vmax: 65 }], 65).outcome, 1);
eq("just short is short", outcomeFrom([{ vmax: 60 }], 65).outcome, 0);
/* 0 means missing in ATCF, not calm. Treating it as an intensity would drag every peak. */
eq("zeroes are missing, not calm", outcomeFrom([{ vmax: 0 }, { vmax: 70 }], 65).peakKt, 70);
eq("an empty b-deck resolves to nothing", outcomeFrom([], 65), null);

console.log("\n[5b] the b-deck also says WHEN the question stopped being open");
/* THE TRAP THIS CAUGHT, on the first real run. Scoring every cycle in the deck recorded
   forecasts made AFTER the storm had already been a hurricane — a decaying remnant
   correctly priced at 1% went into the ledger as a 1%-that-happened, because the outcome
   was 1. It put 124 entries in the lowest reliability bin at 47% observed against 2%
   forecast, and made the whole Brier score meaningless. */
const crossed = outcomeFrom([
  { vmax: 35, iso: "2026-08-10T00:00:00Z" },
  { vmax: 55, iso: "2026-08-10T12:00:00Z" },
  { vmax: 70, iso: "2026-08-11T00:00:00Z" },
  { vmax: 90, iso: "2026-08-11T12:00:00Z" },
  { vmax: 40, iso: "2026-08-13T00:00:00Z" },
], 65);
eq("it resolves 1", crossed.outcome, 1);
eq("and names the instant it first crossed", crossed.firstCrossIso, "2026-08-11T00:00:00Z");
ck("which is the FIRST crossing, not the peak",
   crossed.firstCrossIso !== "2026-08-11T12:00:00Z", crossed.firstCrossIso);
eq("a storm that never crossed has no crossing",
   outcomeFrom([{ vmax: 40, iso: "2026-08-10T00:00:00Z" }], 65).firstCrossIso, null);
eq("and still reports its peak", outcomeFrom([{ vmax: 40, iso: "x" }], 65).peakKt, 40);
/* Rows with no timestamp must not fabricate one. */
eq("a crossing with no iso reports null rather than a guess",
   outcomeFrom([{ vmax: 70 }], 65).firstCrossIso, null);

console.log("\n[6] the payload is the shape the ledger stores");
eq("a full entry", entryOf({ tMs: Date.UTC(2026, 7, 15, 4, 10), stormId: "AL012026",
                            rawP: 0.6731, calP: 0.7674, outcome: 1 }),
   { timestamp: "2026-08-15T04:10:00.000Z", storm_id: "AL012026",
     raw_p: 0.673, calibrated_p: 0.767, target_threshold: "hurricane", outcome: 1 });
eq("a step with no probability is not an entry",
   entryOf({ tMs: 0, stormId: "X", rawP: null, calP: 0.5, outcome: 1 }), null);

console.log("\n[7] the arithmetic");
eq("a perfect forecast scores zero", brierOf([{ p: 1, o: 1 }, { p: 0, o: 0 }]), 0);
eq("a coin flip scores a quarter", brierOf([{ p: 0.5, o: 1 }, { p: 0.5, o: 0 }]), 0.25);
eq("nothing usable scores nothing", brierOf([{ p: null, o: 1 }]), null);
const rel = reliabilityTable([{ p: 0.05, o: 0, stormId: "a" }, { p: 0.95, o: 1, stormId: "b" }], 10);
eq("ten bins", rel.length, 10);
eq("first and last are populated", [rel[0].n, rel[9].n], [1, 1]);
eq("and observe what happened", [rel[0].observed, rel[9].observed], [0, 1]);
eq("p=1.0 lands in the top bin, not off the end",
   reliabilityTable([{ p: 1, o: 1, stormId: "a" }], 10)[9].n, 1);
ck("every bin reports storm support", rel.every((b) => Number.isFinite(b.storms)));

console.log("\n[8] the same storm-level gate as the live scorer");
const many = [];
for (let i = 0; i < 200; i++) many.push({ storm_id: "ST" + (i % 3), raw_p: 0.9, calibrated_p: 0.9, outcome: 1 });
const refused = aggregate(many, {});
eq("200 forecasts from 3 storms is refused", refused.ok, false);
eq("entries counted honestly", refused.counts.entries, 200);
eq("storms are what gate it", refused.counts.storms, 3);
ck("and the refusal says why", /shares that/.test(refused.note), refused.note);

const enough = [];
for (let s = 0; s < MIN_BACKTEST_STORMS; s++) {
  const hit = s % 2;
  for (let i = 0; i < 4; i++) {
    enough.push({ storm_id: "ST" + s, raw_p: 0.5, calibrated_p: 0.5, outcome: hit });
  }
}
const scored = aggregate(enough, {});
eq("ten storms scores", scored.ok, true);
near("a coin flip on a balanced sample is a quarter", scored.brier.calibrated, 0.25, 1e-9);
near("base rate is one half", scored.baseRate, 0.5, 1e-9);
eq("and the table has ten bins", scored.reliability.length, 10);

/* Calibration that helps must show positive skill against raw, and one that hurts must
   show negative. Both directions, so a sign error cannot pass. */
const better = enough.map((e) => ({ ...e, calibrated_p: e.outcome ? 0.9 : 0.1, raw_p: 0.5 }));
ck("a calibration that helps scores positive against raw",
   aggregate(better, {}).skill.calibratedVsRaw > 0, String(aggregate(better, {}).skill.calibratedVsRaw));
const worse = enough.map((e) => ({ ...e, calibrated_p: e.outcome ? 0.1 : 0.9, raw_p: 0.5 }));
ck("and one that hurts scores negative",
   aggregate(worse, {}).skill.calibratedVsRaw < 0, String(aggregate(worse, {}).skill.calibratedVsRaw));

console.log(fail ? `\n${fail} FAILED\n` : "\nall backtest checks passed\n");
process.exit(fail ? 1 : 0);
