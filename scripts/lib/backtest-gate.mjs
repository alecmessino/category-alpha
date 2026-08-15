/* THE ZERO-PEEK DATA GATE.
 *
 * A backtest is a claim that the engine WOULD have produced these numbers at these times.
 * The claim is worth exactly as much as the gate that stands between the estimator and
 * everything the world had not yet published. Every leak inflates the score, every leak is
 * invisible in the output, and the better the leak the better the result looks.
 *
 * This file is that gate, and nothing else. It is pure: decks and a simulated clock in,
 * an admitted subset out, with a written reason for every row it withheld.
 *
 * ------------------------------------------------------------------------------------
 * THE TWO DECKS ARE GATED ON DIFFERENT CLOCKS, AND THIS IS THE WHOLE IDEA
 *
 * An A-DECK row is a FORECAST. It is stamped with the cycle it was issued at (column 3,
 * the DTG) and with a tau — how far ahead of that cycle it reaches. A row from the 12Z
 * cycle with tau 120 describes a moment five days in the future, and it was still
 * published at 12Z. So the gate is on the CYCLE, never on the tau. A model that may see
 * the 12Z guidance may see all of it, out to tau 168, because a forecaster at 12Z could.
 *
 * A B-DECK row is an ANALYSIS. It is stamped with the time it describes, always at tau 0,
 * and it says what the storm actually was. A row for 18Z is knowledge of 18Z. The gate is
 * on that valid time, and a row valid after the decision time is the future — it is the
 * answer sheet, and admitting it is the single most effective way to build a backtest that
 * beats the market on paper and loses money in the world.
 *
 * Forecast: gated by ISSUANCE.  Analysis: gated by VALIDITY.  Confusing the two in either
 * direction breaks it — gating the a-deck on tau throws away the forecasts the whole
 * exercise is about, and gating the b-deck on issuance admits the outcome.
 * ------------------------------------------------------------------------------------
 *
 * TWO LEAKS THAT SURVIVE THE OBVIOUS RULE, and both are handled below.
 */

/* LEAK 1 — THE A-DECK FILLS IN PROGRESSIVELY AFTER ITS CYCLE TIME.
 *
 * This is not speculation about ATCF; it is written into this repo's own live verifier,
 * which excuses a storm read minutes past 00Z for showing one CARQ record where a read ten
 * minutes later shows thirty aids. The cycle stamp says 00Z. The rows appeared over the
 * following minutes-to-hours as each model finished running and each aid was interpolated.
 *
 * So `cycle <= t` admits rows that did not exist at t. The leak is small per row and
 * systematically favourable: the aids that arrive late are the expensive multi-model
 * consensus members, which are also the most skilful. A backtest that quietly grants the
 * 00Z consensus at 00Z:01 is testing an engine nobody can run.
 *
 * The allowance below is a POLICY CONSTANT, not a measurement — the true per-aid latency
 * is knowable only from timestamped captures of the deck as it filled, which this repo does
 * not have. One hour covers the observed fill-in window with headroom. Its direction of
 * safety is the reason it is safe to guess: RAISING it can only withhold information, never
 * invent it, so an over-estimate makes the backtest pessimistic and an under-estimate makes
 * it a lie. When in doubt, raise it. */
export const ADECK_AID_LATENCY_MIN = 60;

/* LEAK 2 — A B-DECK ROW IS WRITTEN AFTER THE HOUR IT DESCRIBES.
 *
 * NHC's advisory package for synoptic time T goes out around T+3h, and the b-deck row for
 * T is written with it. So `validTime <= t` still admits the analysis of the hour that has
 * just ended but has not yet been published. Three hours matches the advisory schedule.
 *
 * There is a second, IRREDUCIBLE problem with the b-deck that no constant fixes, and it is
 * reported rather than papered over: the b-deck an archive serves today is the POST-SEASON
 * REANALYSIS. NHC revises intensities and positions after the season, so the values a
 * backtest reads for a past storm are frequently not the values the operational forecaster
 * had. Gating the timestamps perfectly still leaves an engine being fed a better analysis
 * of the past than existed at the time. `sealBestTrack` records this on every result and it
 * must be carried into any published score — it cannot be corrected away, only disclosed. */
export const BDECK_PUBLICATION_LAG_MIN = 180;

/* ATCF DTG (YYYYMMDDHH, UTC) to epoch ms. Returns null rather than NaN so a malformed
   stamp is withheld by the gate instead of comparing false against every clock. */
export function dtgMs(dtg) {
  const s = String(dtg || "");
  if (!/^\d{10}$/.test(s)) return null;
  const ms = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10));
  return Number.isFinite(ms) ? ms : null;
}

const gate_fail = (status, note) => Object.freeze({ ok: false, status, note: String(note) });

/* ---------------------------------------------------------------------------------
 * A-DECK — admitted by issuance.
 *
 * `row.tau` is deliberately not consulted. That is the rule, and it is worth stating as an
 * absence because the intuitive implementation ("do not let the model see the future")
 * reaches for tau immediately and is wrong.
 */
export function admitAdeckRow(row, tMs, opts) {
  const o = opts || {};
  const latency = o.aidLatencyMin ?? ADECK_AID_LATENCY_MIN;
  const c = dtgMs(row && row.cycle);
  if (c == null) return { admit: false, reason: "unparseable cycle DTG" };
  const availableAt = c + latency * 60000;
  if (availableAt > tMs) {
    return {
      admit: false,
      reason: c > tMs
        ? `cycle ${row.cycle} is after the decision time`
        : `cycle ${row.cycle} had not finished filling in — aids land up to ${latency} min after the cycle stamp`,
    };
  }
  return { admit: true, reason: null, availableAt };
}

export function gateAdeck(rows, tMs, opts) {
  const all = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.rows) ? rows.rows : null);
  if (!all) return gate_fail(422, "a-deck rows are not an array — pass parseAdeck(text, {allCycles:true}).rows, not the raw text");
  if (!Number.isFinite(tMs)) return gate_fail(422, "decision time is not a finite epoch — a gate with no clock admits everything");

  const admitted = [], withheld = [];
  for (const r of all) {
    const v = admitAdeckRow(r, tMs, opts);
    (v.admit ? admitted : withheld).push(v.admit ? r : { cycle: r.cycle, tech: r.tech, tau: r.tau, reason: v.reason });
  }
  if (!admitted.length) {
    return gate_fail(412, `no a-deck row had been issued by ${new Date(tMs).toISOString()} (${all.length} row(s) withheld). This is a legitimate state early in a storm's life, not a defect — but the estimator must be given nothing rather than the nearest cycle`);
  }
  /* The newest ADMITTED cycle is what "the current guidance" means at t. Reporting it
     separately matters: an engine handed every historical cycle at once and left to pick
     would pick differently from one that only ever saw the newest, and the backtest would
     be measuring the picking. */
  const cycles = [...new Set(admitted.map((r) => r.cycle))].sort();
  const latestCycle = cycles[cycles.length - 1];
  return Object.freeze({
    ok: true, status: 0,
    note: `${admitted.length}/${all.length} a-deck row(s) admitted across ${cycles.length} cycle(s), newest ${latestCycle}`
      + ` · ${withheld.length} withheld as not-yet-issued at ${new Date(tMs).toISOString()}`,
    value: Object.freeze({
      rows: admitted,
      latestCycle,
      latestCycleRows: admitted.filter((r) => r.cycle === latestCycle),
      cycles, withheld,
      aidLatencyMin: opts?.aidLatencyMin ?? ADECK_AID_LATENCY_MIN,
    }),
  });
}

/* ---------------------------------------------------------------------------------
 * B-DECK — admitted by validity, and split into two channels that must never be joined.
 *
 * `visible` is what the estimator may read: the storm's observed history up to the
 * decision time. `sealed` is the rest, which exists only to score the forecast afterwards.
 * They are returned as separate objects rather than as one annotated list because a single
 * list with an `isFuture` flag is one filter-predicate typo away from being handed whole to
 * a model, and that typo produces a backtest that looks superb.
 */
export function admitBestTrackRecord(rec, tMs, opts) {
  const o = opts || {};
  const lag = o.publicationLagMin ?? BDECK_PUBLICATION_LAG_MIN;
  const v = rec && rec.iso ? Date.parse(rec.iso) : dtgMs(rec && rec.time);
  if (!Number.isFinite(v)) return { admit: false, reason: "unparseable valid time" };
  const publishedAt = v + lag * 60000;
  if (publishedAt > tMs) {
    return {
      admit: false,
      reason: v > tMs
        ? `valid ${rec.iso || rec.time} is after the decision time — this is the answer sheet`
        : `valid ${rec.iso || rec.time} but not yet published; the b-deck row lands with the advisory package about ${lag} min later`,
    };
  }
  return { admit: true, reason: null, publishedAt };
}

export function sealBestTrack(records, tMs, opts) {
  const recs = Array.isArray(records) ? records : (records && Array.isArray(records.records) ? records.records : null);
  if (!recs) return gate_fail(422, "best-track records are not an array — pass parseBestTrack(text).records");
  if (!Number.isFinite(tMs)) return gate_fail(422, "decision time is not a finite epoch — a gate with no clock admits everything");

  const visible = [], sealed = [];
  for (const r of recs) {
    const v = admitBestTrackRecord(r, tMs, opts);
    (v.admit ? visible : sealed).push(r);
  }
  return Object.freeze({
    ok: true, status: 0,
    note: `${visible.length}/${recs.length} best-track record(s) visible at ${new Date(tMs).toISOString()};`
      + ` ${sealed.length} sealed as future or not-yet-published`,
    value: Object.freeze({
      visible, sealed,
      publicationLagMin: opts?.publicationLagMin ?? BDECK_PUBLICATION_LAG_MIN,
      /* Carried on every result, deliberately un-suppressible. A b-deck fetched from an
         archive today has been reanalysed since; gating its timestamps does not make it the
         analysis the operational forecaster held. Any score built on this must say so. */
      provenanceCaveat: "b-deck records served from an archive are post-season reanalysis, not the operational values available at the decision time. Timestamp gating cannot correct this; a score built on it is optimistic by an unmeasured amount and must be published with this stated",
    }),
  });
}

/* ---------------------------------------------------------------------------------
 * THE LEAK ASSERTION.
 *
 * Called on the bundle actually handed to the estimator, after every filter, right before
 * the call. The gates above are correct; this checks that what came out of them is what
 * arrived, because between the gate and the model sits ordinary application code and the
 * whole failure mode of a backtest is that it never complains.
 *
 * A guard has to be made to fire, so `scripts/test-backtest.mjs` hands it a leaking bundle
 * and asserts the refusal rather than reading this and pronouncing it correct.
 */
export function assertNoLeak(bundle, tMs, opts) {
  const o = opts || {};
  const aidLatency = o.aidLatencyMin ?? ADECK_AID_LATENCY_MIN;
  const pubLag = o.publicationLagMin ?? BDECK_PUBLICATION_LAG_MIN;
  const leaks = [];

  for (const r of (bundle && bundle.adeck) || []) {
    const c = dtgMs(r.cycle);
    if (c == null) { leaks.push(`a-deck row ${r.tech}/${r.tau} has an unparseable cycle`); continue; }
    if (c + aidLatency * 60000 > tMs) {
      leaks.push(`a-deck ${r.tech} tau ${r.tau} from cycle ${r.cycle}, which was not available until ${new Date(c + aidLatency * 60000).toISOString()}`);
    }
  }
  for (const r of (bundle && bundle.bestTrack) || []) {
    const v = r && r.iso ? Date.parse(r.iso) : dtgMs(r && r.time);
    if (!Number.isFinite(v)) { leaks.push("best-track record with an unparseable valid time"); continue; }
    if (v + pubLag * 60000 > tMs) {
      leaks.push(`best-track ${r.iso || r.time} at ${r.kt ?? "?"} kt — ${v > tMs ? "this is the outcome" : "published only at " + new Date(v + pubLag * 60000).toISOString()}`);
    }
  }
  /* Anything at all carrying a future timestamp, whatever key it arrived under. A bundle
     grows fields over time and each new one is a new way to smuggle the answer in. */
  for (const [k, val] of Object.entries(bundle || {})) {
    if (k === "adeck" || k === "bestTrack") continue;
    const iso = val && typeof val === "object" ? (val.iso || val.tsZ || val.observedAt) : null;
    const ms = iso ? Date.parse(iso) : NaN;
    if (Number.isFinite(ms) && ms > tMs) leaks.push(`bundle.${k} carries ${iso}, after the decision time`);
  }

  if (leaks.length) {
    return gate_fail(409, `${leaks.length} zero-peek violation(s) at ${new Date(tMs).toISOString()}: ${leaks.slice(0, 6).join(" · ")}${leaks.length > 6 ? ` · and ${leaks.length - 6} more` : ""}`);
  }
  return Object.freeze({
    ok: true, status: 0,
    note: `bundle is clean at ${new Date(tMs).toISOString()}: ${((bundle && bundle.adeck) || []).length} a-deck row(s) all issued at least ${aidLatency} min earlier, ${((bundle && bundle.bestTrack) || []).length} best-track record(s) all published at least ${pubLag} min after their valid time and before now`,
    value: null,
  });
}

/* ---------------------------------------------------------------------------------
 * The convenience wrapper: one decision time in, one estimator-ready bundle out, already
 * asserted. Callers should use this rather than composing the pieces, so the assertion
 * cannot be the step somebody skips.
 */
export function gateDecks(input, tMs, opts) {
  const a = gateAdeck(input.adeckRows || [], tMs, opts);
  const b = sealBestTrack(input.bestTrackRecords || [], tMs, opts);
  if (!b.ok) return b;
  /* An a-deck gate that refuses is not fatal to the run — a storm can be too young to have
     guidance and the estimator should be told that, in the same shape a live feed failure
     would take. */
  const bundle = {
    adeck: a.ok ? a.value.rows : [],
    adeckLatestCycle: a.ok ? a.value.latestCycle : null,
    adeckFeed: a.ok ? { ok: true, status: 0, note: a.note } : a,
    bestTrack: b.value.visible,
  };
  const clean = assertNoLeak(bundle, tMs, opts);
  if (!clean.ok) return clean;
  return Object.freeze({
    ok: true, status: 0,
    note: `${a.ok ? a.note : "no guidance yet: " + a.note} | ${b.note}`,
    value: Object.freeze({ bundle, sealed: b.value.sealed, provenanceCaveat: b.value.provenanceCaveat, adeckWithheld: a.ok ? a.value.withheld : [] }),
  });
}
