/* THE BACKTEST ENGINE.
 *
 * Replays a storm forward through a simulated clock, asks an estimator for a probability
 * at each step using only what had been published by then, and scores the result against
 * what the storm actually did.
 *
 * Three design decisions carry the whole file, and each one exists to close a specific way
 * a backtest lies.
 *
 * 1. PURE, AND THE NETWORK IS NOT AVAILABLE TO IT.
 *    Decks arrive as text or parsed records; the clock arrives as a list of instants. This
 *    module cannot fetch. That is the point: a runner that can fetch can fetch the CURRENT
 *    deck in the middle of simulating a past moment, and the resulting score is wrong in
 *    the flattering direction with nothing in the output to show it.
 *
 * 2. THE ESTIMATOR IS INJECTED, AND IS HANDED ONLY A GATED BUNDLE.
 *    It never receives the deck, the runner, or the clock. It receives what a forecaster
 *    had at that instant. Injection also keeps this file from importing the live pipeline,
 *    which is what would otherwise drag the network back in through the side door.
 *
 * 3. THE OUTCOME IS SCORED BY CODE THIS REPO ALREADY TRUSTS.
 *    `outcomeFromBestTrack` and `summarize` come from `scripts/lib/calibration.mjs`
 *    unchanged. A backtest with its own private scorer can be wrong in a way the live
 *    scorecard is not, and then the two numbers disagree and nobody can say which is
 *    broken. In particular this inherits the refusal that matters most: a score is
 *    withheld until enough DISTINCT STORMS have resolved, because every forecast made
 *    during one storm's life shares that storm's single outcome.
 */
import { gateDecks } from "./backtest-gate.mjs";
import { parseAdeck, parseBestTrack } from "./atcf.mjs";
import {
  entryFrom, appendEntries, outcomeFromBestTrack, summarize,
  HURRICANE_REPORTED_KT, MIN_RESOLVED_STORMS,
} from "./calibration.mjs";

const bt_fail = (status, note) => Object.freeze({ ok: false, status, note: String(note) });

/* Decision times, generated on the ATCF synoptic lattice rather than on a wall clock.
   Forecasts are made against 00/06/12/18Z cycles, and a backtest stepping every four hours
   would ask for a probability at 04Z off the 00Z deck — a decision no desk ever makes,
   scored as though it did. Floored, never rounded: a decision cannot be informed by a
   cycle that had not been issued when it was taken. */
export function synopticSteps(fromMs, toMs, stepHours) {
  const step = (stepHours || 6) * 3600e3;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
  const first = Math.ceil(fromMs / step) * step;
  const out = [];
  for (let t = first; t <= toMs; t += step) out.push(t);
  return out;
}

/* Normalise whatever the caller had to hand. Text is the common case (a committed deck
   fixture); already-parsed records are accepted so a caller with them does not re-parse. */
function decks(input) {
  const aRows = input.adeckRows
    || (input.adeckText ? (parseAdeck(input.adeckText, { allCycles: true }).rows || []) : null);
  const bRecs = input.bestTrackRecords
    || (input.bestTrackText ? (parseBestTrack(input.bestTrackText).records || []) : null);
  return { aRows, bRecs };
}

/* ==================================================================================
 * runBacktest
 *
 * input:
 *   stormId            ATCF id, e.g. "AL092026" — the unit the scorer counts
 *   name               display name, defaults to stormId
 *   adeckText | adeckRows
 *   bestTrackText | bestTrackRecords
 *   decisionTimes      epoch ms array; defaults to the synoptic lattice spanned by the
 *                      admitted b-deck, which is the storm's own life rather than a
 *                      calendar window chosen by hand
 *   estimate(bundle, ctx) -> { pCal, pRaw, pMarket?, used?, quality?, currentKt? } | null
 *                      returning null means "declined to price", which is a real and
 *                      correct answer and is recorded as one rather than as a zero
 *   thresholdKt        defaults to 65 kt, the same constant the live estimator uses
 *   opts               forwarded to the gate: aidLatencyMin, publicationLagMin
 */
export function runBacktest(input, opts) {
  const o = opts || {};
  if (!input || !input.stormId) return bt_fail(422, "runBacktest needs a stormId — the scorer counts distinct storms, so an entry without one cannot be scored");
  const { aRows, bRecs } = decks(input);
  if (!Array.isArray(bRecs) || !bRecs.length) {
    return bt_fail(404, `no best track for ${input.stormId} — without it there is no outcome, and a run that cannot resolve is a simulation, not a backtest`);
  }
  if (!Array.isArray(aRows)) {
    return bt_fail(422, `no a-deck for ${input.stormId} — pass adeckText or adeckRows. A backtest with no guidance is testing the advisory alone, which is a different question and should be asked deliberately`);
  }
  if (typeof input.estimate !== "function") {
    return bt_fail(422, "runBacktest needs an estimate(bundle, ctx) function. It is injected rather than imported so this module cannot reach the live pipeline, and through it the network");
  }

  const thresholdKt = input.thresholdKt || HURRICANE_REPORTED_KT;

  /* THE ORACLE. Computed once, from the WHOLE best track including everything the gate
     seals away, because scoring is the one activity that is supposed to see the future.
     It is computed here, at the top, and then not touched again until every estimate has
     been made — so there is no point in the loop where it is in scope alongside a bundle
     being assembled for the estimator. */
  const oracle = outcomeFromBestTrack(bRecs, thresholdKt, { nowMs: o.nowMs ?? null, settleHours: o.settleHours });
  if (!oracle) return bt_fail(422, `the best track for ${input.stormId} carried no intensities — nothing to resolve against`);

  const validMs = bRecs.map((r) => (r.iso ? Date.parse(r.iso) : NaN)).filter(Number.isFinite);
  const times = input.decisionTimes
    || synopticSteps(Math.min(...validMs), Math.max(...validMs), input.stepHours || 6);
  if (!times.length) return bt_fail(422, `no decision times for ${input.stormId} — the best track spans no synoptic slot`);

  const entries = [];
  const steps = [];
  for (const t of times) {
    const gated = gateDecks({ adeckRows: aRows, bestTrackRecords: bRecs }, t, o);
    if (!gated.ok) {
      /* A refused gate is recorded in the honesty contract's shape and the step is
         skipped. It is never downgraded to "estimate with whatever we have" — that is the
         moment a backtest starts scoring a model nobody could run. */
      steps.push({ tsZ: new Date(t).toISOString(), ok: false, status: gated.status, note: gated.note });
      continue;
    }
    const ctx = Object.freeze({
      tMs: t, tsZ: new Date(t).toISOString(), stormId: input.stormId,
      thresholdKt, sealedCount: gated.value.sealed.length,
    });
    let est = null, err = null;
    try { est = input.estimate(gated.value.bundle, ctx); }
    catch (e) { err = e && e.message ? e.message : String(e); }
    if (err) {
      steps.push({ tsZ: ctx.tsZ, ok: false, status: 500, note: `estimator threw: ${err}` });
      continue;
    }
    if (!est || (est.pCal == null && est.pRaw == null)) {
      steps.push({ tsZ: ctx.tsZ, ok: true, status: 0, note: "estimator declined to price — recorded as a refusal, not as a probability", priced: false });
      continue;
    }
    /* THE PAIR TRAVELS TOGETHER. The same rule the live frame writer follows: a calibrated
       probability with no raw estimate beside it cannot be scored against the thing it was
       supposed to improve on, and the paired skill number is the one this whole exercise is
       accountable to. */
    if (est.pCal != null && est.pRaw == null) {
      steps.push({ tsZ: ctx.tsZ, ok: false, status: 409, note: "estimator returned a calibrated probability with no raw estimate beside it — the calibration is computed from the raw one, so it existed and was dropped" });
      continue;
    }
    const e = entryFrom({
      stormId: input.stormId, name: input.name || input.stormId, tsZ: ctx.tsZ,
      /* Forecast identity is the state it was built on, exactly as live: a new advisory or
         a new guidance cycle. Without a distinct key per step the ledger would refuse
         every entry after the first as a duplicate — and, more quietly, a lattice finer
         than the cycle would fill the sample with copies of one forecast. */
      advNum: est.advNum ?? null,
      conCycle: est.conCycle ?? gated.value.bundle.adeckLatestCycle ?? null,
      pCal: est.pCal ?? null, pRaw: est.pRaw ?? null, pMarket: est.pMarket ?? null,
      contractId: est.contractId ?? null, used: est.used ?? null, quality: est.quality ?? null,
      advisoryLagMin: est.advisoryLagMin ?? null, currentKt: est.currentKt ?? null,
    }, { thresholdKt });
    if (!e) { steps.push({ tsZ: ctx.tsZ, ok: false, status: 422, note: "entry could not be keyed" }); continue; }
    entries.push(e);
    steps.push({ tsZ: ctx.tsZ, ok: true, status: 0, priced: true, pCal: e.pCal, pRaw: e.pRaw, conCycle: e.conCycle, note: gated.note });
  }

  /* RESOLVE, with the same after-the-fact exclusion the live loop applies. A forecast
     issued after the storm had already crossed the threshold is not a forecast of
     anything, and scoring it would inflate every series at once — most of all the
     calibrated one, which is the series being defended. */
  const crossMs = oracle.firstCrossIso ? Date.parse(oracle.firstCrossIso) : null;
  let scored = 0, excluded = 0;
  for (const e of entries) {
    const tMs = Date.parse(e.tsZ);
    if (crossMs && tMs && tMs >= crossMs) { e.excluded = "made after the threshold was already crossed"; excluded++; continue; }
    e.resolved = oracle;
    e.leadHr = (crossMs && tMs) ? Math.round((crossMs - tMs) / 3600e3) : null;
    scored++;
  }

  return Object.freeze({
    ok: true, status: 0,
    note: `${input.stormId}: ${entries.length} forecast(s) over ${times.length} decision time(s), ${scored} scored, ${excluded} excluded as after-the-fact`
      + ` · outcome ${oracle.outcome ? "REACHED" : "did not reach"} ${thresholdKt} kt (peak ${oracle.peakKt} kt)${oracle.provisional ? ", PROVISIONAL" : ""}`,
    value: Object.freeze({ entries, steps, outcome: oracle, decisionTimes: times, thresholdKt }),
  });
}

/* ==================================================================================
 * Roll several storms into one ledger and score it.
 *
 * The refusal below is the reason this function exists rather than callers summing runs
 * themselves. A backtest over one storm has a sample size of ONE no matter how many
 * decision times it stepped through, and a Brier score computed over forty entries from
 * that storm reads like a well-supported result. `summarize` already refuses it — this
 * routes every backtest through that refusal instead of letting a caller print the mean of
 * its own steps.
 */
export function scoreBacktests(runs, opts) {
  const o = opts || {};
  const ok = (runs || []).filter((r) => r && r.ok);
  const failed = (runs || []).filter((r) => r && !r.ok);
  if (!ok.length) return bt_fail(412, `no successful backtest run to score (${failed.length} failed: ${failed.map((f) => f.note).slice(0, 3).join(" · ")})`);

  let ledger = [];
  for (const r of ok) ledger = appendEntries(ledger, r.value.entries).ledger;

  const card = summarize(ledger, {
    minStorms: o.minStorms ?? MIN_RESOLVED_STORMS,
    minReliabilityStorms: o.minReliabilityStorms,
    bins: o.bins,
  });

  return Object.freeze({
    ok: true, status: 0,
    note: card.ok
      ? `scored over ${card.counts.resolvedStorms} resolved storm(s)`
      : `score withheld: ${card.note}`,
    value: Object.freeze({
      card, ledger,
      runs: ok.length, failedRuns: failed.length,
      /* Carried up from the gate and never dropped. A backtest score published without it
         claims a precision the archive record does not have. */
      provenanceCaveat: "scored against archived NHC best track, which is post-season reanalysis rather than the operational values available at each decision time. Timestamp gating cannot correct this; the result is optimistic by an unmeasured amount",
    }),
  });
}
