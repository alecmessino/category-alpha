#!/usr/bin/env node
/* Tests for the zero-peek data gate and the backtest engine.
 *
 * A backtest that leaks does not throw, does not warn, and does not look wrong. It returns
 * a better number. That is the entire reason this suite exists and the reason every
 * assertion below is a REFUSAL being made to happen rather than a happy path being
 * confirmed: the failure mode of a leaky gate is silence, so the only evidence that the
 * gate works is watching it turn something away.
 *
 * Run: node scripts/test-backtest.mjs
 */
import {
  dtgMs, admitAdeckRow, admitBestTrackRecord, gateAdeck, sealBestTrack, assertNoLeak,
  gateDecks, ADECK_AID_LATENCY_MIN, BDECK_PUBLICATION_LAG_MIN,
} from "./lib/backtest-gate.mjs";
import { runBacktest, scoreBacktests, synopticSteps } from "./lib/backtest-runner.mjs";
import { parseAdeck, parseBestTrack } from "./lib/atcf.mjs";

let fail = 0;
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const ck = (n, cond, detail) => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + n + (cond ? "" : `  — ${detail}`)); };

const T = (iso) => Date.parse(iso);

/* ---- fixtures ------------------------------------------------------------------
   A two-cycle a-deck and a four-row best track for one storm. Written out rather than
   generated so the exact DTGs are visible next to the assertions about them. */
const ADECK = [
  // 00Z cycle
  "AL, 09, 2026081500, 03, OFCL,   0, 180N,  450W,  45, 1000, TS",
  "AL, 09, 2026081500, 03, OFCL,  24, 190N,  470W,  60,  990, TS",
  "AL, 09, 2026081500, 03, OFCL,  48, 200N,  490W,  80,  975, HU",
  "AL, 09, 2026081500, 03, HCCA,  48, 201N,  491W,  85,  972, HU",
  "AL, 09, 2026081500, 03, CARQ, -12, 175N,  440W,  40, 1003, TS",
  // 06Z cycle
  "AL, 09, 2026081506, 03, OFCL,   0, 185N,  460W,  55,  995, TS",
  "AL, 09, 2026081506, 03, OFCL,  24, 195N,  480W,  70,  982, HU",
  "AL, 09, 2026081506, 03, OFCL, 120, 240N,  560W,  95,  960, HU",
  "AL, 09, 2026081506, 03, HCCA,  24, 196N,  481W,  72,  980, HU",
].join("\n");

const BDECK = [
  "AL, 09, 2026081500,   , BEST,   0, 180N,  450W,  45, 1000, TS",
  "AL, 09, 2026081506,   , BEST,   0, 185N,  460W,  55,  995, TS",
  "AL, 09, 2026081512,   , BEST,   0, 191N,  471W,  65,  988, HU",
  "AL, 09, 2026081518,   , BEST,   0, 198N,  483W,  80,  974, HU",
].join("\n");

const A_ROWS = parseAdeck(ADECK, { allCycles: true }).rows;
const B_RECS = parseBestTrack(BDECK).records;

console.log("\n[1] the fixtures parse, and parseAdeck keeps every cycle when asked");
{
  eq("the default still returns the latest cycle only", [...new Set(parseAdeck(ADECK).rows.map((r) => r.cycle))], ["2026081506"]);
  eq("allCycles returns both", [...new Set(A_ROWS.map((r) => r.cycle))], ["2026081500", "2026081506"]);
  eq("and the two cycles' rows are not merged into each other",
    A_ROWS.filter((r) => r.tech === "OFCL" && r.tau === 0).map((r) => r.vmax), [45, 55]);
  eq("the census still describes the LATEST cycle, not the sum of all of them",
    parseAdeck(ADECK, { allCycles: true }).techs, { OFCL: 3, HCCA: 1 });
  eq("four best-track records", B_RECS.length, 4);
  eq("a malformed DTG is null, never NaN — NaN compares false against every clock", dtgMs("nope"), null);
}

console.log("\n[2] A-DECKS ARE GATED BY ISSUANCE, AND TAU IS NEVER CONSULTED");
{
  /* The rule, stated as a test because the intuitive implementation gets it backwards.
     A forecaster at 06Z could read the whole 06Z package, including the tau-120 row that
     describes a moment five days out. Gating on tau would throw away the forecasts the
     entire exercise is about. */
  const t = T("2026-08-15T07:30:00Z");                     // 06Z + 90 min, past the aid latency
  const g = gateAdeck(A_ROWS, t);
  ck("the gate admits at 07:30Z", g.ok, JSON.stringify(g));
  eq("the tau-120 row from the 06Z cycle IS admitted", g.value.rows.some((r) => r.tau === 120), true);
  eq("and the newest admitted cycle is 06Z", g.value.latestCycle, "2026081506");
  eq("nothing was withheld", g.value.withheld.length, 0);

  /* Same rows, ten minutes after the 06Z stamp. The cycle has been issued but the deck is
     still filling in — this repo's own live verifier documents a storm read minutes past a
     cycle showing one CARQ record where a read ten minutes later shows thirty aids. */
  const early = gateAdeck(A_ROWS, T("2026-08-15T06:10:00Z"));
  eq("ten minutes after the cycle stamp, only the PREVIOUS cycle is admitted", early.value.latestCycle, "2026081500");
  eq("and the 06Z rows are withheld as still filling in", early.value.withheld.length, 4);
  ck("with a reason that says so, not just 'too new'",
    /had not finished filling in/.test(early.value.withheld[0].reason), JSON.stringify(early.value.withheld[0]));

  /* Direction of safety. Raising the allowance can only withhold information; lowering it
     can invent availability. So the constant is asserted to behave monotonically. */
  const strict = gateAdeck(A_ROWS, T("2026-08-15T07:30:00Z"), { aidLatencyMin: 240 });
  eq("a stricter latency withholds more, never less", strict.value.latestCycle, "2026081500");
  eq("the default is stated, not implied", ADECK_AID_LATENCY_MIN, 60);

  /* Before the storm's first cycle there is simply no guidance. That is a real state, and
     the estimator must be told it rather than handed the nearest cycle. */
  const none = gateAdeck(A_ROWS, T("2026-08-14T00:00:00Z"));
  ck("before the first cycle the gate refuses", !none.ok && none.status === 412, JSON.stringify(none));
  ck("and calls it a legitimate state rather than a defect", /not a defect/.test(none.note), none.note);
  eq("a gate with no clock is refused — it would admit everything", gateAdeck(A_ROWS, NaN).status, 422);
  eq("and so is raw text passed where rows were expected", gateAdeck(ADECK, T("2026-08-15T12:00:00Z")).status, 422);
}

console.log("\n[3] B-DECKS ARE GATED BY VALIDITY — the tau-0 analysis is the answer sheet");
{
  const t = T("2026-08-15T12:00:00Z");
  const s = sealBestTrack(B_RECS, t);
  ck("the seal succeeds", s.ok, JSON.stringify(s));
  /* At 12:00Z, with a 3-hour publication lag, only the 00Z and 06Z rows have been
     written. The 12Z row describes the hour just ended and lands with the ~15Z package. */
  eq("two records visible", s.value.visible.map((r) => r.time), ["2026081500", "2026081506"]);
  eq("and two sealed", s.value.sealed.map((r) => r.time), ["2026081512", "2026081518"]);
  /* THE ONE THAT MATTERS. 2026081512 is the row where this storm reaches 65 kt. A gate
     that admitted it would hand the model the outcome of the question it is being asked. */
  ck("the 65 kt crossing is sealed, not visible",
    !s.value.visible.some((r) => r.kt >= 65), JSON.stringify(s.value.visible.map((r) => r.kt)));

  const strictLag = sealBestTrack(B_RECS, t, { publicationLagMin: 0 });
  eq("with no publication lag the just-ended hour becomes visible", strictLag.value.visible.length, 3);
  eq("which is exactly the leak the default lag exists to close", BDECK_PUBLICATION_LAG_MIN, 180);

  ck("the reanalysis caveat rides on every result and cannot be gated away",
    /post-season reanalysis/.test(s.value.provenanceCaveat), s.value.provenanceCaveat);

  const rec = admitBestTrackRecord(B_RECS[3], t);
  ck("a future record's reason names it as the answer sheet",
    !rec.admit && /answer sheet/.test(rec.reason), JSON.stringify(rec));
  const justPast = admitBestTrackRecord(B_RECS[2], t);
  ck("a not-yet-published record is refused for a different reason than a future one",
    !justPast.admit && /not yet published/.test(justPast.reason), JSON.stringify(justPast));
}

console.log("\n[4] the leak assertion is made to fire");
{
  const t = T("2026-08-15T12:00:00Z");
  const clean = gateDecks({ adeckRows: A_ROWS, bestTrackRecords: B_RECS }, t);
  ck("a properly gated bundle passes its own assertion", clean.ok, JSON.stringify(clean).slice(0, 200));

  /* Hand-built leaks, one per channel, because the gates above are correct and this is
     about the ordinary application code that sits between them and the model. */
  const bLeak = assertNoLeak({ adeck: clean.value.bundle.adeck, bestTrack: B_RECS }, t);
  ck("a bundle carrying the whole best track is refused", !bLeak.ok && bLeak.status === 409, bLeak.note);
  ck("and the note names the 65 kt record as the outcome", /this is the outcome/.test(bLeak.note), bLeak.note);

  const aLeak = assertNoLeak({ adeck: A_ROWS, bestTrack: clean.value.bundle.bestTrack }, T("2026-08-15T06:10:00Z"));
  ck("a bundle carrying a not-yet-filled cycle is refused", !aLeak.ok, aLeak.note);

  /* A bundle grows fields over time, and each new one is a new way to smuggle the answer
     in. Anything carrying a future timestamp under any key is refused. */
  const sideChannel = assertNoLeak({
    adeck: clean.value.bundle.adeck, bestTrack: clean.value.bundle.bestTrack,
    recon: { iso: "2026-08-15T14:00:00Z", mslp: 970 },
  }, t);
  ck("a future-stamped field under a NEW key is refused too", !sideChannel.ok, sideChannel.note);
  ck("and the refusal names the key", /bundle\.recon/.test(sideChannel.note), sideChannel.note);

  ck("the refusal is the flat three-key payload",
    bLeak.ok === false && typeof bLeak.status === "number" && typeof bLeak.note === "string"
      && Object.keys(bLeak).length === 3, JSON.stringify(Object.keys(bLeak)));
}

console.log("\n[5] decision times land on the synoptic lattice, not on a wall clock");
{
  const steps = synopticSteps(T("2026-08-15T01:00:00Z"), T("2026-08-15T19:00:00Z"), 6);
  eq("floored to the next 6-hourly slot and stepped from there",
    steps.map((m) => new Date(m).toISOString()),
    ["2026-08-15T06:00:00.000Z", "2026-08-15T12:00:00.000Z", "2026-08-15T18:00:00.000Z"]);
  eq("a backwards window yields nothing rather than looping", synopticSteps(T("2026-08-16T00:00:00Z"), T("2026-08-15T00:00:00Z")), []);
}

console.log("\n[6] the runner replays a storm and can never reach the future");
{
  /* The estimator records what it was shown, so the test can assert on the INPUT rather
     than on the output — which is the only way to prove the gate held all the way to the
     call site rather than merely at the gate. */
  const shown = [];
  const estimate = (bundle, ctx) => {
    shown.push({
      tsZ: ctx.tsZ,
      maxSeenKt: bundle.bestTrack.length ? Math.max(...bundle.bestTrack.map((r) => r.kt ?? 0)) : null,
      cycle: bundle.adeckLatestCycle,
      aids: bundle.adeck.length,
    });
    const ofcl = bundle.adeck.filter((r) => r.tech === "OFCL" && r.vmax != null);
    if (!ofcl.length) return null;                       // declined to price — a real answer
    const peak = Math.max(...ofcl.map((r) => r.vmax));
    const pRaw = Math.max(0.01, Math.min(0.99, (peak - 45) / 40));
    return { pRaw, pCal: Math.max(0.01, Math.min(0.99, pRaw * 1.1)), conCycle: bundle.adeckLatestCycle, currentKt: 45 };
  };

  const run = runBacktest({
    stormId: "AL092026", name: "Teststorm",
    adeckRows: A_ROWS, bestTrackRecords: B_RECS,
    decisionTimes: [T("2026-08-15T07:30:00Z"), T("2026-08-15T13:30:00Z"), T("2026-08-15T19:30:00Z")],
    estimate,
  });
  ck("the run succeeds", run.ok, JSON.stringify(run).slice(0, 240));

  /* THE CENTRAL ASSERTION. The storm first reaches 65 kt at 12Z. At no decision time may
     the estimator have been shown a best-track record at or above the threshold that had
     not been published yet. */
  for (const s of shown) {
    const t = T(s.tsZ);
    const legal = B_RECS.filter((r) => Date.parse(r.iso) + BDECK_PUBLICATION_LAG_MIN * 60000 <= t);
    const max = legal.length ? Math.max(...legal.map((r) => r.kt)) : null;
    ck(`at ${s.tsZ} the estimator saw only published analyses (max ${s.maxSeenKt} kt)`, s.maxSeenKt === max,
      `saw ${s.maxSeenKt}, legally available ${max}`);
  }
  eq("and it always had the newest ISSUED cycle", shown.map((s) => s.cycle),
    ["2026081506", "2026081506", "2026081506"]);

  /* The after-the-fact exclusion, inherited from the live loop. The storm crossed 65 kt at
     12Z, so the 13:30Z and 19:30Z forecasts are not forecasts of anything. */
  const scored = run.value.entries.filter((e) => e.resolved);
  const excluded = run.value.entries.filter((e) => e.excluded);
  eq("only the pre-crossing forecast is scored", scored.length, 1);
  eq("and the rest are excluded as after-the-fact", excluded.length, 2);
  eq("the outcome came from the whole best track, including what the model never saw", run.value.outcome.outcome, 1);
  eq("with the peak the storm actually reached", run.value.outcome.peakKt, 80);
  eq("and the lead time is recorded", scored[0].leadHr, 5);

  /* The pair rule, enforced at the estimator boundary exactly as it is on the frame. */
  const halfPair = runBacktest({
    stormId: "AL092026", adeckRows: A_ROWS, bestTrackRecords: B_RECS,
    decisionTimes: [T("2026-08-15T07:30:00Z")],
    estimate: () => ({ pCal: 0.6 }),
  });
  ck("a calibrated probability with no raw beside it is refused at the step",
    halfPair.ok && halfPair.value.entries.length === 0
      && /dropped/.test(halfPair.value.steps[0].note), JSON.stringify(halfPair.value.steps));

  /* An estimator that declines is recorded as declining, not as a zero. */
  const declined = runBacktest({
    stormId: "AL092026", adeckRows: A_ROWS, bestTrackRecords: B_RECS,
    decisionTimes: [T("2026-08-15T07:30:00Z")], estimate: () => null,
  });
  eq("a refusal produces no ledger entry", declined.value.entries.length, 0);
  ck("and is recorded as a refusal rather than a probability",
    /declined to price/.test(declined.value.steps[0].note), JSON.stringify(declined.value.steps));

  /* An estimator that throws must not take the run with it, and must not be papered over
     with a default probability either. */
  const thrown = runBacktest({
    stormId: "AL092026", adeckRows: A_ROWS, bestTrackRecords: B_RECS,
    decisionTimes: [T("2026-08-15T07:30:00Z")], estimate: () => { throw new Error("model blew up"); },
  });
  ck("an estimator exception is recorded, not swallowed and not fatal",
    thrown.ok && thrown.value.steps[0].status === 500 && /model blew up/.test(thrown.value.steps[0].note),
    JSON.stringify(thrown.value.steps));

  eq("a run with no best track is refused", runBacktest({ stormId: "X", adeckRows: A_ROWS, bestTrackRecords: [], estimate }).status, 404);
  eq("and one with no estimator is refused", runBacktest({ stormId: "X", adeckRows: A_ROWS, bestTrackRecords: B_RECS }).status, 422);
}

console.log("\n[7] and one storm is a sample size of ONE, however many steps it took");
{
  const estimate = (bundle) => {
    const ofcl = bundle.adeck.filter((r) => r.tech === "OFCL" && r.vmax != null);
    if (!ofcl.length) return null;
    const peak = Math.max(...ofcl.map((r) => r.vmax));
    const pRaw = Math.max(0.01, Math.min(0.99, (peak - 45) / 40));
    return { pRaw, pCal: pRaw, conCycle: bundle.adeckLatestCycle };
  };
  const run = runBacktest({
    stormId: "AL092026", adeckRows: A_ROWS, bestTrackRecords: B_RECS,
    decisionTimes: [T("2026-08-15T07:30:00Z")], estimate,
  });
  const card = scoreBacktests([run]);
  ck("the roll-up succeeds", card.ok, JSON.stringify(card).slice(0, 200));
  eq("but the SCORE is withheld", card.value.card.ok, false);
  ck("because one resolved storm is not ten",
    /1 resolved storm of the 10 needed/.test(card.value.card.note), card.value.card.note);
  ck("and the reanalysis caveat survives the roll-up",
    /post-season reanalysis/.test(card.value.provenanceCaveat), card.value.provenanceCaveat);
  eq("no successful run at all is refused rather than scored as zero", scoreBacktests([]).status, 412);
}

console.log(fail ? `\n${fail} backtest check(s) FAILED\n` : "\nall backtest checks passed\n");
process.exit(fail ? 1 : 0);
