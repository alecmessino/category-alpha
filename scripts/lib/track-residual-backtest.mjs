/* THREE QUESTIONS, SCORED SEPARATELY, AND NONE OF THEM SCORED YET.
 *
 * This file holds the scoring primitives and the definitions they need, so that when a backtest
 * is run the choices it rests on were made BEFORE the results existed. It scores nothing on
 * import and it ships no number.
 *
 * THE THREE QUESTIONS ARE NOT ONE QUESTION.
 *
 *   Q1  Is the position-departure MEASUREMENT accurate? — a geometry question, answerable
 *       against an independent position, and the only one this build can approach today.
 *   Q2  Does a promoted residual predict the SIGN of the next advisory's track shift at shared
 *       future valid times? — a forecasting question about NHC, not about the storm.
 *   Q3  Does anything here predict a qualifying LANDFALL or contract resolution? — a question
 *       about rare events with a different unit, a different base rate, and a different loss.
 *
 * SUCCESS ON Q1 OR Q2 DOES NOT ESTABLISH Q3, and the file refuses to let a Q2 result be
 * reported in Q3's language: `scoreQ3` returns UNSCORED unless it is handed a defined binary
 * outcome AND a numeric forecast, which is what a Brier score requires and what directional
 * classification accuracy is not.
 *
 * ------------------------------------------------------------------------------------------
 * THE SAMPLING UNIT IS THE STORM, NOT THE FIX.
 *
 * Fixes inside one storm are not independent: a storm that departs east departs east on every
 * fix that afternoon. Three storms can produce four hundred rows and a Wilson interval that
 * describes three coin flips to three decimal places. `aggregateByStorm` collapses to one entry
 * per storm (or per promotion event, when that is the unit under test) BEFORE anything is
 * counted, and `wilsonRefusal` exists to make the wrong version fail loudly rather than quietly.
 *
 * THE REVISION TARGET IS DEFINED HERE, BEFORE SCORING.
 *
 * "The next advisory's track shift" is ambiguous until four things are fixed, and fixing them
 * after seeing results is how a null result becomes a positive one:
 *
 *   frame      the EARLIER baseline's local direction at the shared valid time. Not the later
 *              one's — that frame already contains the revision being measured.
 *   horizon    a named lead, evaluated at the SHARED VALID TIME. Comparing advisory N's +24 h
 *              against advisory N+1's +24 h compares two different moments and reports the
 *              storm's own motion as a revision.
 *   dead band  shifts under `NEGLIGIBLE_SHIFT_NM` are scored as NO CALL, not as a sign. A
 *              coin-flip on a 0.3 nm revision is noise dressed as skill.
 *   direction  the sign of the CROSS-TRACK component only. Along-track revisions are a timing
 *              change and are recorded but not the target.
 */

import { residual, localCourseDeg, projectResidual, interpolateAtTime, coveragePoints,
         haversineNm } from "./track-residual.mjs";

const MS = (iso) => Date.parse(iso);

/** Below this the revision is NO CALL. Chosen before any scoring, on the reasoning that it is
    smaller than the coordinate rounding of the products being compared. */
export const NEGLIGIBLE_SHIFT_NM = 6;

/** Distinct resolved STORMS, not entries, before anything is published. Matched to the terminal's
    own calibration gate so two surfaces cannot disagree about what "enough" means. */
export const MIN_SCORED_STORMS = 10;
export const MIN_RELIABILITY_STORMS = 30;

export const HORIZONS_H = [12, 24, 48, 72];

/**
 * THE REVISION TARGET, computed.
 *
 * How far, and on which side, advisory N+1 moved its forecast relative to advisory N, at one
 * shared future valid time, in advisory N's frame at that time.
 */
export function advisoryShift(earlier, later, sharedValidZ) {
  const tMs = MS(sharedValidZ);
  const a = interpolateAtTime(coveragePoints(earlier), tMs);
  const b = interpolateAtTime(coveragePoints(later), tMs);
  if (!a.ok) return { ok: false, refusal: "EARLIER_" + a.refusal };
  if (!b.ok) return { ok: false, refusal: "LATER_" + b.refusal };
  const frame = localCourseDeg(coveragePoints(earlier), tMs);
  if (!frame.ok) return { ok: false, refusal: "FRAME_" + frame.refusal };
  const p = projectResidual({ lat: a.lat, lonE: a.lonE }, { lat: b.lat, lonE: b.lonE }, frame.courseDeg);
  const negligible = Math.abs(p.crossNm) < NEGLIGIBLE_SHIFT_NM;
  return {
    ok: true,
    sharedValidZ, frameDeg: frame.courseDeg, frameSource: "earlier baseline's local direction",
    crossNm: p.crossNm, alongNm: p.alongNm, separationNm: p.separationNm,
    /* NO CALL is a third outcome, not a coin flip. */
    sign: negligible ? 0 : Math.sign(p.crossNm),
    negligible,
    leadHours: (tMs - MS(earlier.initialValidZ)) / 3600e3,
  };
}

/** Every shared future valid time between two advisories, at the named horizons. */
export function sharedValidTimes(earlier, later, horizons) {
  const hs = horizons || HORIZONS_H;
  const out = [];
  const t0 = MS(later.initialValidZ);
  const eEnd = MS(coveragePoints(earlier).slice(-1)[0].validZ);
  const lEnd = MS(coveragePoints(later).slice(-1)[0].validZ);
  for (const h of hs) {
    const t = t0 + h * 3600e3;
    /* SHARED means inside BOTH tracks. A horizon only one advisory reaches is not a comparison. */
    if (t <= eEnd && t <= lEnd) out.push({ horizonHours: h, validZ: new Date(t).toISOString() });
  }
  return out;
}

/* ------------------------------------------------------------------------ sampling discipline */

/**
 * ONE ENTRY PER STORM (or per promotion event). Collapses correlated rows before any count.
 * `reduce` decides how — the default takes the storm's modal sign, which is the honest summary
 * of "which way did this storm depart", and records how mixed it was.
 */
export function aggregateByStorm(entries, opts) {
  const o = opts || {};
  const key = o.unit === "promotion" ? ((e) => `${e.stormId}|${e.promotionId}`) : ((e) => e.stormId);
  const byKey = new Map();
  for (const e of entries || []) {
    const k = key(e);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(e);
  }
  const out = [];
  for (const [k, rows] of byKey) {
    const signs = rows.map((r) => r.sign).filter((s) => s === 1 || s === -1);
    const pos = signs.filter((s) => s === 1).length, neg = signs.length - pos;
    out.push({
      unitKey: k, stormId: rows[0].stormId, n: rows.length,
      sign: pos === neg ? 0 : (pos > neg ? 1 : -1),
      mixed: pos > 0 && neg > 0,
      agreementFraction: signs.length ? Math.max(pos, neg) / signs.length : null,
      rows: o.keepRows ? rows : undefined,
    });
  }
  return { units: out, unitCount: out.length, unit: o.unit || "storm",
           note: "One unit per storm. Fixes within a storm are not independent, so a count over "
               + "fixes would describe the storm's own persistence, not the rule's skill." };
}

/** A Wilson interval over correlated rows is not acceptable. Asking for one is a refusal. */
export function wilsonRefusal(overFixes) {
  if (overFixes) return { ok: false, refusal: "WILSON_OVER_CORRELATED_ROWS",
    note: "Aggregate to storms first. A binomial interval assumes independent trials and fixes "
        + "within one storm are not." };
  return { ok: true };
}

/** A stratum too thin to score returns its base rate and a refusal, in the Atlas's own voice. */
export function thinStratum(nStorms, baseRate, opts) {
  const min = (opts && opts.min) || MIN_SCORED_STORMS;
  if (nStorms >= min) return { ok: true, nStorms };
  return {
    ok: false,
    status: "BASE RATE ONLY -- unscoreable",
    refusal: "BELOW_STORM_GATE",
    nStorms, required: min, baseRate: baseRate ?? null,
    note: "Too few distinct storms to score. The base rate is the evidence; it is not the answer.",
  };
}

/* --------------------------------------------------------------------------- the three scores */

/**
 * Q1 — ACCURACY OF THE MEASUREMENT ITSELF.
 *
 * Not skill. This asks whether the residual this module computes agrees with the residual an
 * independent position implies, which is a question about arithmetic, parsing and frames rather
 * than about forecasting. It is the only one of the three that a single storm can inform, and
 * it is still reported per storm.
 */
export function scoreQ1(pairs, opts) {
  const rows = (pairs || []).filter((p) => Number.isFinite(p.computedNm) && Number.isFinite(p.referenceNm));
  const agg = aggregateByStorm(rows.map((r) => ({ ...r, sign: 0 })), opts);
  if (!rows.length) return { question: "Q1", status: "UNSCORED", refusal: "NO_PAIRS" };
  const errs = rows.map((r) => r.computedNm - r.referenceNm);
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
  const gate = thinStratum(agg.unitCount, null, opts);
  return {
    question: "Q1 — accuracy of the position-departure measurement",
    status: gate.ok ? "SCORED" : "UNSCORED",
    ...(gate.ok ? {} : { gate }),
    n: rows.length, storms: agg.unitCount,
    maeNm: mae, maxNm: Math.max(...errs.map(Math.abs)),
    note: "A measurement check, not a skill claim. It says the geometry is right, nothing more.",
  };
}

/**
 * Q2 — DID A PROMOTED RESIDUAL PREDICT THE SIGN OF THE NEXT ADVISORY'S SHIFT?
 *
 * Directional classification, scored against three named baselines, on storms, with NO CALLs
 * excluded from the denominator and REPORTED rather than dropped silently.
 *
 * Never reported as a probability. `scoreQ3` will not accept its output.
 */
export function scoreQ2(entries, opts) {
  const o = opts || {};
  const rows = (entries || []).filter((e) => e.predictedSign === 1 || e.predictedSign === -1);
  const noCall = (entries || []).length - rows.length;
  const scored = rows.filter((e) => e.actualSign === 1 || e.actualSign === -1);
  const negligible = rows.length - scored.length;
  const agg = aggregateByStorm(scored.map((e) => ({ ...e, sign: e.predictedSign === e.actualSign ? 1 : -1 })), o);
  const gate = thinStratum(agg.unitCount, null, o);
  if (!gate.ok) return { question: "Q2", status: "UNSCORED", gate, storms: agg.unitCount,
                         promotions: rows.length, noCall, negligibleActual: negligible };
  const hits = agg.units.filter((u) => u.sign === 1).length;
  return {
    question: "Q2 — sign of the next advisory's track shift at shared future valid times",
    status: "SCORED",
    storms: agg.unitCount, hitsByStorm: hits, accuracyByStorm: hits / agg.unitCount,
    promotions: rows.length, noCall, negligibleActual: negligible,
    baselines: o.baselines || null,
    caution: "Directional classification accuracy. NOT a calibrated probability and never to be "
           + "reported as one.",
  };
}

/**
 * Q3 — DID ANYTHING HERE PREDICT A QUALIFYING LANDFALL OR CONTRACT RESOLUTION?
 *
 * A Brier score needs a defined binary outcome and a numeric forecast in [0,1]. This module
 * emits neither, so this returns UNSCORED and says which of the two is missing. It will keep
 * returning UNSCORED until something actually produces a probability, which nothing does.
 */
export function scoreQ3(entries, opts) {
  const rows = entries || [];
  const withOutcome = rows.filter((e) => e.outcome === 0 || e.outcome === 1);
  const withForecast = rows.filter((e) => Number.isFinite(e.p) && e.p >= 0 && e.p <= 1);
  const missing = [];
  if (!rows.length) missing.push("NO_ENTRIES");
  if (withOutcome.length !== rows.length) missing.push("UNDEFINED_BINARY_OUTCOME");
  if (withForecast.length !== rows.length) missing.push("NO_NUMERIC_FORECAST");
  if (missing.length)
    return { question: "Q3 — qualifying landfall / contract resolution", status: "UNSCORED",
             refusal: missing,
             note: "Directional classification accuracy from Q2 is not a calibrated landfall "
                 + "probability and is not accepted here. Until Q3 is actually scored, the "
                 + "module reports kinematics and refusals only." };
  const agg = aggregateByStorm(rows.map((e) => ({ ...e, sign: 0 })), opts);
  const gate = thinStratum(agg.unitCount, null, opts);
  if (!gate.ok) return { question: "Q3", status: "UNSCORED", gate };
  const bs = rows.reduce((s, e) => s + (e.p - e.outcome) ** 2, 0) / rows.length;
  return { question: "Q3", status: "SCORED", brier: bs, storms: agg.unitCount };
}

/* ------------------------------------------------------------------------------- baselines */

/**
 * THE THREE BASELINES ANY RESULT MUST BEAT TO MEAN ANYTHING. All trivial, which is the point:
 * a rule that does not beat "assume it does again" has not been shown to add information.
 */
export const BASELINES = {
  persistLastResidualSign: (history) => {
    const last = [...(history || [])].reverse().find((r) => r.sign === 1 || r.sign === -1);
    return last ? last.sign : 0;
  },
  persistLastOfficialBias: (history) => {
    const last = [...(history || [])].reverse().find((r) => r.officialShiftSign === 1 || r.officialShiftSign === -1);
    return last ? last.officialShiftSign : 0;
  },
  climatology: (history, opts) => (opts && opts.climatologySign) || 0,
};

/** Training and held-out are split on STORMS and on later PERIODS, never on rows. */
export function splitStorms(stormIds, opts) {
  const o = opts || {};
  const ids = [...new Set(stormIds || [])].sort();
  if (o.byYear) {
    const train = ids.filter((s) => Number(String(s).slice(-4)) < o.byYear);
    const test = ids.filter((s) => Number(String(s).slice(-4)) >= o.byYear);
    return { train, test, method: `held-out period: seasons >= ${o.byYear}`,
             note: "Later periods, not a random split: a rule tuned on 2015-2020 and tested on "
                 + "2021+ is tested against a forecasting system that has itself changed." };
  }
  const k = Math.max(1, Math.floor(ids.length * (o.trainFraction ?? 0.6)));
  return { train: ids.slice(0, k), test: ids.slice(k), method: "held-out storms",
           note: "Thresholds are chosen on the training storms only." };
}

/** Nothing is fitted on evaluation storms. Enforced, not intended. */
export function assertNoOverlap(train, test) {
  const t = new Set(train || []);
  const bad = (test || []).filter((s) => t.has(s));
  if (bad.length) throw new Error("backtest: evaluation storms appear in training: " + bad.join(","));
  return true;
}

export { residual, haversineNm };
