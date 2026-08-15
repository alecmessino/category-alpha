#!/usr/bin/env node
/* Tests for the calibration ledger and the scorecard.
 *
 * This file is scoring the board's own honesty, so the thing it has to get right is not
 * the arithmetic — Brier is a mean of squares — but the REFUSALS. A calibration report is
 * uniquely dangerous when it is wrong, because its whole purpose is to be believed: it is
 * the number someone points at when they decide the engine works.
 *
 * The trap it exists to avoid, asserted hardest below:
 *
 *   FORECASTS WITHIN ONE STORM ARE NOT INDEPENDENT. A storm that becomes a hurricane makes
 *   every forecast issued during its life "correct". Three storms can produce four hundred
 *   entries and a beautiful Brier score that measures three coin flips. Every threshold in
 *   the scorer therefore counts DISTINCT RESOLVED STORMS, and these tests prove it by
 *   handing it a large sample drawn from a tiny number of storms and requiring a refusal.
 *
 * Run: node scripts/test-calibration.mjs
 */
import { forecastKey, entryFrom, appendEntries, outcomeFromBestTrack, brier, skill,
         reliability, summarize, MIN_RESOLVED_STORMS, MIN_RELIABILITY_STORMS,
         HURRICANE_REPORTED_KT } from "./lib/calibration.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = g != null && Math.abs(g - w) <= tol; if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${g} want=${w}±${tol}`)); };

const NOW = Date.UTC(2026, 7, 20, 0, 0);
const iso = (hAgo) => new Date(NOW - hAgo * 3600e3).toISOString();

console.log("\n[1] a forecast is identified by the state it was built from");
/* Re-reading the same advisory and the same guidance cycle ten minutes later is the SAME
   forecast. Recording it again would inflate the sample with copies of itself, which is
   the independence trap arriving by a second route. */
const base = { stormId: "CP012026", name: "Lala", tsZ: iso(10), advNum: "10A", conCycle: "2026081500", pCal: 0.75, pRaw: 0.6 };
eq("the key is storm + question + advisory + cycle", forecastKey(entryFrom(base, {})),
   "CP012026|hurricane|10A|2026081500");
const again = entryFrom({ ...base, tsZ: iso(9), pCal: 0.751 }, {});
eq("a re-read of the same state has the same key", again.key, forecastKey(entryFrom(base, {})));
const newAdv = entryFrom({ ...base, advNum: "11" }, {});
ck("a new advisory is a new forecast", newAdv.key !== again.key, newAdv.key);
const newCycle = entryFrom({ ...base, conCycle: "2026081506" }, {});
ck("and so is a new guidance cycle", newCycle.key !== again.key, newCycle.key);
/* No probability, no forecast. An unpriced storm must not enter the sample as a null. */
eq("a storm with no probability is not a forecast", entryFrom({ stormId: "X", tsZ: iso(1) }, {}), null);

console.log("\n[2] the ledger appends without duplicating");
const a1 = appendEntries([], [entryFrom(base, {}), again, newAdv]);
eq("duplicates collapse", a1.added, 2);
eq("and the ledger holds one per state", a1.ledger.length, 2);
const a2 = appendEntries(a1.ledger, [entryFrom(base, {})]);
eq("re-appending an existing state adds nothing", a2.added, 0);
ck("entries are ordered by time", a2.ledger.every((e, i, arr) => i === 0 || String(arr[i - 1].tsZ) <= String(e.tsZ)));

console.log("\n[3] the outcome comes from the best track and nothing else");
const track = (kts) => kts.map((kt, i) => ({ kt, iso: new Date(NOW - (kts.length - i) * 6 * 3600e3).toISOString() }));
const reached = outcomeFromBestTrack(track([35, 45, 55, 65, 80]), HURRICANE_REPORTED_KT, { nowMs: NOW });
eq("a storm that reached the threshold resolves to 1", reached.outcome, 1);
eq("with its peak", reached.peakKt, 80);
ck("and when it first crossed", !!reached.firstCrossIso, reached.firstCrossIso);
const missed = outcomeFromBestTrack(track([35, 45, 55, 60, 55]), HURRICANE_REPORTED_KT, { nowMs: NOW });
eq("one that did not resolves to 0", missed.outcome, 0);
eq("peak still recorded", missed.peakKt, 60);
eq("and no crossing", missed.firstCrossIso, null);
/* 60 kt is not 65 kt. Best-track intensities come in 5 kt steps and the contract resolves
   on the reported number, so there is no rounding up to be generous. */
eq("just short is short", outcomeFromBestTrack(track([60]), HURRICANE_REPORTED_KT, { nowMs: NOW }).outcome, 0);
eq("exactly at the threshold counts", outcomeFromBestTrack(track([65]), HURRICANE_REPORTED_KT, { nowMs: NOW }).outcome, 1);
eq("an empty track resolves to nothing at all", outcomeFromBestTrack([], HURRICANE_REPORTED_KT, {}), null);
/* A track still being written, and one NHC has not reanalysed, are both flagged. */
const fresh = outcomeFromBestTrack([{ kt: 70, iso: new Date(NOW - 3600e3).toISOString() }], 65, { nowMs: NOW });
eq("a track still settling is provisional", fresh.provisional, true);
const settled = outcomeFromBestTrack([{ kt: 70, iso: new Date(NOW - 72 * 3600e3).toISOString() }], 65, { nowMs: NOW });
eq("an old one is not", settled.provisional, false);
ck("and the source names the reanalysis caveat", /reanalysis/.test(settled.source), settled.source);

console.log("\n[4] the arithmetic");
eq("a perfect forecast scores zero", brier([{ p: 1, o: 1 }, { p: 0, o: 0 }]), 0);
eq("a coin flip scores a quarter", brier([{ p: 0.5, o: 1 }, { p: 0.5, o: 0 }]), 0.25);
eq("a confidently wrong forecast scores one", brier([{ p: 0, o: 1 }]), 1);
eq("no usable pairs scores nothing", brier([{ p: null, o: 1 }]), null);
near("skill is one minus the ratio", skill(0.1, 0.2), 0.5, 1e-9);
eq("no skill against a perfect reference", skill(0.1, 0), null);
near("worse than the reference is negative", skill(0.3, 0.2), -0.5, 1e-9);

console.log("\n[5] THE GATE: storms are the sample size, not entries");
/* A large, correlated sample from a tiny number of storms. This is the exact shape of the
   number that would otherwise be published and believed. */
function ledgerOf(nStorms, perStorm, outcome, p) {
  const out = [];
  for (let s = 0; s < nStorms; s++) {
    for (let i = 0; i < perStorm; i++) {
      out.push({ stormId: "ST" + s, key: "ST" + s + "|" + i, tsZ: iso(100 - i),
        pCal: p, pRaw: p, pMarket: p,
        resolved: { outcome: typeof outcome === "function" ? outcome(s) : outcome, provisional: false } });
    }
  }
  return out;
}
const many = summarize(ledgerOf(3, 40, 1, 0.9), {});
eq("120 forecasts from 3 storms is refused", many.ok, false);
eq("and the entry count is reported honestly", many.counts.resolvedEntries, 120);
eq("alongside the number that actually gates it", many.counts.resolvedStorms, 3);
ck("the refusal explains why entries are not the sample",
   /shares that storm's single outcome/.test(many.note), many.note);
ck("and shows progress toward the threshold",
   many.progress.have === 3 && many.progress.need === MIN_RESOLVED_STORMS, JSON.stringify(many.progress));
/* Enough storms, and it scores. */
const enough = summarize(ledgerOf(MIN_RESOLVED_STORMS, 4, (s) => (s % 2 === 0 ? 1 : 0), 0.5), {});
eq("ten resolved storms is enough to score", enough.ok, true);
eq("the storms are counted, not the forecasts", enough.counts.resolvedStorms, MIN_RESOLVED_STORMS);
near("and a coin flip on a balanced sample scores a quarter", enough.brier.calibrated, 0.25, 1e-9);

console.log("\n[6] the three estimates are scored side by side");
/* The whole point: pCal alone says whether the board is good; against pRaw it says whether
   the CALIBRATION earned its keep; against the market it says whether there is an edge. */
const mixed = [];
for (let s = 0; s < MIN_RESOLVED_STORMS; s++) {
  const o = s % 2 === 0 ? 1 : 0;
  mixed.push({ stormId: "S" + s, key: "S" + s, tsZ: iso(50),
    /* calibrated is sharp and right, raw is a coin flip, market is confidently wrong */
    pCal: o ? 0.9 : 0.1, pRaw: 0.5, pMarket: o ? 0.2 : 0.8,
    resolved: { outcome: o, provisional: false } });
}
const m = summarize(mixed, {});
near("the calibrated estimate scores well", m.brier.calibrated, 0.01, 1e-9);
near("the raw estimate scores a quarter", m.brier.raw, 0.25, 1e-9);
near("the market scores badly", m.brier.market, 0.64, 1e-9);
ck("so calibration shows positive skill over raw", m.skill.calibrationVsRaw > 0.9, String(m.skill.calibrationVsRaw));
ck("and positive skill over the market", m.skill.vsMarket > 0.9, String(m.skill.vsMarket));
/* The output that says STOP. A board worse than the market must report a negative number
   rather than quietly reporting only its own Brier. */
const losing = mixed.map((e) => ({ ...e, pCal: e.resolved.outcome ? 0.2 : 0.8, pMarket: e.resolved.outcome ? 0.9 : 0.1 }));
ck("a board worse than the market reports negative skill against it",
   summarize(losing, {}).skill.vsMarket < 0, String(summarize(losing, {}).skill.vsMarket));

console.log("\n[7] the reliability curve is refused for far longer");
eq("it is null at the scoring threshold", enough.reliability, null);
ck("with a stated reason", /reliability curve needs/.test(enough.reliabilityNote), enough.reliabilityNote);
const lots = summarize(ledgerOf(MIN_RELIABILITY_STORMS, 2, (s) => (s % 2 === 0 ? 1 : 0), 0.5), {});
ck("and appears once there are enough storms", Array.isArray(lots.reliability), typeof lots.reliability);
/* Each bin reports its own support in STORMS, because a bin with forty entries from one
   storm is a bin with one observation in it. */
ck("every bin reports its storm support",
   (lots.reliability || []).every((b) => Number.isFinite(b.storms)), JSON.stringify((lots.reliability || [])[2]));
const rel = reliability([{ p: 0.1, o: 0, stormId: "a" }, { p: 0.9, o: 1, stormId: "b" }], 5);
eq("a forecast lands in its own bin", [rel[0].n, rel[4].n], [1, 1]);
eq("and the observed frequency is the frequency observed", [rel[0].observed, rel[4].observed], [0, 1]);

console.log("\n[8] a skill score compares the SAME storms, or it is not a skill score");
/* THE LIVE SHAPE. The ledger's first entries were seeded from frames written before the
   calibrated probability existed on them, so they carry pRaw and pMarket but pCal of null.
   Scoring each series over whatever it happened to have would compare the board on a
   handful of forecasts against the market on all of them and publish the quotient.
   Built so the two samples disagree in a direction that is impossible to misread: on the
   entries WITHOUT a calibrated number the market was perfect, and on the ones WITH it the
   market was wrong. Any unpaired comparison flatters the board enormously. */
const partial = [];
for (let s = 0; s < MIN_RESOLVED_STORMS; s++) {
  const hit = s % 2 === 0 ? 1 : 0;
  /* Covered: the board and the market both quoted, and the market leaned the wrong way.
     0.4/0.6 is chosen so the numbers land either side of the board's 0.25 — the market's
     squared error here is 0.36, and averaging that with the free zeroes below drags its
     marginal score to 0.18. That is what flips the sign. */
  partial.push({ stormId: "PT" + s, key: "PT" + s + "|cov", tsZ: iso(100),
    pCal: 0.5, pRaw: 0.5, pMarket: hit === 1 ? 0.4 : 0.6,
    resolved: { outcome: hit, provisional: false } });
  /* Uncovered: no calibrated number was published, and the market nailed it. */
  partial.push({ stormId: "PT" + s, key: "PT" + s + "|unc", tsZ: iso(99),
    pCal: null, pRaw: 0.5, pMarket: hit,
    resolved: { outcome: hit, provisional: false } });
}
const P = summarize(partial, {});
eq("it scores, because the storms are there", P.ok, true);
eq("the calibrated series covers half the resolved forecasts", P.brierN.calibrated, MIN_RESOLVED_STORMS);
eq("the market series covers all of them", P.brierN.market, MIN_RESOLVED_STORMS * 2);
/* The marginal market Brier is dragged down by the perfect half it alone has. */
near("so the marginal market Brier looks excellent", P.brier.market, 0.18, 1e-9);
near("and the calibrated one is a coin flip", P.brier.calibrated, 0.25, 1e-9);
/* Unpaired, skill vs market is 1 - 0.25/0.18 = -0.39: the board declared WORSE than the
   market on the strength of ten forecasts it never made. Paired, both series are scored on
   the ten entries that have both, where the market's 0.36 is the worse number and the true
   answer is 1 - 0.25/0.36 = +0.31. The sign is the whole point — one of these says stop
   trading and the other says the edge is real. */
ck("unpaired, the comparison would have inverted the answer",
   skill(P.brier.calibrated, P.brier.market) < 0, String(skill(P.brier.calibrated, P.brier.market)));
eq("the paired comparison uses only the overlap", P.paired.calibratedVsMarket.entries, MIN_RESOLVED_STORMS);
near("where the market scores its own quotes, not the ones it got for free",
     P.paired.calibratedVsMarket.market, 0.36, 1e-9);
ck("so the board is correctly credited with skill, not charged with a deficit",
   P.skill.vsMarket > 0, String(P.skill.vsMarket));
near("and the paired number is the one arithmetic says it should be",
     P.skill.vsMarket, 1 - 0.25 / 0.36, 1e-9);
ck("and the divergence is stated rather than left to be inferred",
   /coverage differs across series/.test(P.coverageNote || ""), String(P.coverageNote));
/* When coverage IS complete there is nothing to warn about and the paired numbers agree
   with the marginal ones — the guard must not fire on the ordinary case. */
eq("a complete ledger raises no coverage note", enough.coverageNote, null);
near("and its paired market score matches the marginal one",
     enough.paired.calibratedVsMarket.market, enough.brier.market, 1e-12);

console.log("\n[9] an empty ledger says so rather than dividing by zero");
const empty = summarize([], {});
eq("it refuses", empty.ok, false);
eq("with zero of everything", [empty.counts.entries, empty.counts.resolvedStorms], [0, 0]);
eq("unresolved entries do not count as resolved",
   summarize([{ stormId: "A", key: "A", pCal: 0.5 }], {}).counts.resolvedStorms, 0);

console.log(fail ? `\n${fail} FAILED\n` : "\nall calibration checks passed\n");
process.exit(fail ? 1 : 0);
