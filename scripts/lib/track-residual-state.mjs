/* WHAT MAY BE SAID ABOUT A RESIDUAL, AND WHAT MAY NOT.
 *
 * track-residual.mjs measures a departure. This file decides what can honestly be claimed from a
 * set of them, and it is deliberately much more willing to refuse than to answer.
 *
 * THE ONE SENTENCE THIS MODULE EXISTS TO ENFORCE:
 *
 *   A residual can be reported with its uncertainty; a bias cannot be asserted from one fix,
 *   and this module will not assert one.
 *
 * FOUR REFUSALS, NOT ONE. A single "insufficient data" flag conflates four independent
 * questions, and conflating them is how "we have three fixes" becomes "we have a trend":
 *
 *   dataQuality             Are these fixes admissible at all? (position, time, coverage,
 *                           mixed centre definitions, duplicates)
 *   uncertaintyCalibration  Do we know how wide the band is? (in v0: no, and it says so)
 *   sampleSufficiency       Are there enough INDEPENDENT observations? (not enough rows —
 *                           enough independent ones)
 *   trendStatus             Is a direction of departure established? (in v0: never)
 *
 * Each carries its own reason. A series can be perfectly clean, perfectly sampled, and still
 * report UNCALIBRATED_UNCERTAINTY, because nobody has fitted the band yet. That combination is
 * the normal state of this module today and it is not a bug.
 *
 * ------------------------------------------------------------------------------------------
 * WHY THE NOISE FLOOR IS AN ASSUMPTION AND IS LABELLED ONE
 *
 * The concept brief proposed a quadrature floor built from 12 nm / 5 nm / 12 nm / 6 nm defaults
 * and called anything inside it WITHIN_NOISE. Three problems, all of which this file keeps
 * visible rather than fixing by assertion:
 *
 *  - The numbers are not measured. They are plausible magnitudes, not an empirical floor for
 *    this pipeline, this basin, or these centre definitions. They are exported as
 *    PROVISIONAL_SIGMA_NM and every consumer that reads them gets `provisional: true` attached.
 *  - Quadrature assumes independence. Two Dvorak fixes off the same GOES-18 image are not two
 *    looks at the storm, and adding their variances as though they were shrinks a band that
 *    should not shrink.
 *  - WITHIN_NOISE IS NOT EVIDENCE OF ABSENCE. A residual smaller than an unvalidated floor is a
 *    residual we cannot distinguish from noise. That is a statement about the floor.
 *
 * A PRINTED "POSITION ACCURATE WITHIN 15 NM" IS NOT A SIGMA. It is a stated bound on the
 * analysed centre with no distributional claim attached. `withinNmToSigma` will convert it, but
 * only when handed an explicit named assumption, and it returns the assumption alongside the
 * number so the conversion cannot travel without its label.
 *
 * ------------------------------------------------------------------------------------------
 * SOURCE TIER IS NOT ACCURACY AND IS NOT INDEPENDENCE.
 *
 * The brief's promotion rule (three same-sign residuals, six hours, n≥3, Tier 0–1) treats a tier
 * as a warrant. It is not. A tier says what KIND of instrument produced a fix. Two fixes of the
 * same tier can share a satellite pass; a lower tier can be more accurate than a higher one for
 * a particular storm; and six hours does not necessarily span a trochoidal wobble, which for a
 * large hurricane can run longer than that. The rule is implemented here — as
 * `candidateTrendRule`, evaluated and reported — and its result is NEVER promoted. It is a
 * hypothesis this module carries so that a backtest can eventually score it.
 */

import { haversineNm, deltaBearingDeg } from "./track-residual.mjs";

/* ------------------------------------------------------------------------- taxonomies */

/**
 * CENTRE DEFINITIONS. Not qualities — definitions. Different instruments answer "where is the
 * centre" with different questions, and the disagreement between them is real and is several
 * nautical miles even when every fix is correct.
 */
export const CENTRE_DEFINITIONS = {
  "aircraft-fix":       { label: "aircraft centre fix", basis: "in-situ penetration or centre drop" },
  "advisory-analysed":  { label: "advisory analysed centre", basis: "forecaster's analysis of all sources" },
  "best-track":         { label: "working best track", basis: "post-analysis, revisable" },
  "dvorak-subjective":  { label: "subjective Dvorak", basis: "analyst's cloud-pattern centre" },
  "dvorak-objective":   { label: "objective Dvorak (ADT)", basis: "algorithmic cloud-pattern centre" },
  "microwave":          { label: "microwave centre", basis: "convective/eyewall structure at depth" },
  "scatterometer":      { label: "scatterometer centre", basis: "surface wind circulation" },
  "radar-centroid":     { label: "radar centroid", basis: "reflectivity structure" },
};

/** Map an ATCF f-deck fix type to a centre definition. Unknown types are kept AS THEMSELVES. */
export function centreDefinitionOfFixType(type, format) {
  const t = String(type || "").toUpperCase();
  if (["AIRC", "DRPS"].includes(t)) return "aircraft-fix";
  if (t === "DVTS") return "dvorak-subjective";
  if (t === "DVTO") return "dvorak-objective";
  if (["SSMI", "SSMS", "AMSU", "TRMM", "GPM", "MICR"].includes(t)) return "microwave";
  if (["ASCT", "OSCT", "SCAT", "ASCA"].includes(t)) return "scatterometer";
  if (["RDRT", "RDRD", "RADR"].includes(t)) return "radar-centroid";
  if (format === 50) return "aircraft-fix";
  if (format === 10) return "dvorak-subjective";
  if (format === 20) return "dvorak-objective";
  if (format === 30) return "microwave";
  if (format === 31) return "scatterometer";
  if (format === 40) return "radar-centroid";
  return null;
}

/**
 * PROVISIONAL. Not measured. Not a floor. Present so the surface can draw a band and label it
 * unfitted, and so a future calibration has something to replace.
 *
 * The values are the concept brief's own, carried unchanged so that when they are eventually
 * fitted the diff shows exactly what changed and by how much.
 */
export const PROVISIONAL_SIGMA_NM = {
  provisional: true,
  fittedOn: null,
  note: "ASSUMED, NOT MEASURED. No empirical fit exists for this pipeline. Never present these "
      + "as a noise floor and never read WITHIN_NOISE as absence of signal.",
  observation: 12,
  baseline: 5,
  wobble: 12,
  rounding: 6,
};

/**
 * Coordinate rounding, which is not negligible and is usually forgotten.
 *
 * Advisories publish 0.1°. At 18N that is 6.0 nm of latitude and 5.7 nm of longitude, so a
 * rounded position sits inside a box roughly 3 nm on each half-side. Reported as a bound, in the
 * units the residual is in, computed from the actual latitude rather than assumed.
 */
export function roundingBoundNm(lat, stepDeg) {
  const step = stepDeg ?? 0.1;
  const NM_PER_DEG = 60;
  const halfLat = (step / 2) * NM_PER_DEG;
  const halfLon = (step / 2) * NM_PER_DEG * Math.cos((lat || 0) * Math.PI / 180);
  return { stepDeg: step, halfLatNm: halfLat, halfLonNm: halfLon,
           maxNm: Math.sqrt(halfLat * halfLat + halfLon * halfLon),
           note: "A half-step box, not a sigma." };
}

/**
 * THE ONLY WAY A PRINTED ACCURACY BOUND BECOMES A SIGMA HERE.
 *
 * Refuses without an explicit named assumption. The two named assumptions are both arguable and
 * neither is NHC's — which is the point of making the caller name one.
 */
export const WITHIN_ASSUMPTIONS = {
  "uniform-disc": { divisor: 2, text: "Treats WITHIN r as a uniform disc of radius r; sigma per axis = r/2. Arguable." },
  "two-sigma":    { divisor: 2, text: "Treats WITHIN r as a 2-sigma bound; sigma = r/2. Arguable." },
  "one-sigma":    { divisor: 1, text: "Treats WITHIN r as 1 sigma. Almost certainly too wide." },
};
export function withinNmToSigma(withinNm, assumption) {
  const a = WITHIN_ASSUMPTIONS[assumption];
  if (!Number.isFinite(withinNm)) return { ok: false, refusal: "NO_PUBLISHED_ACCURACY" };
  if (!a) return { ok: false, refusal: "UNLABELLED_CONVERSION",
                   note: "A printed accuracy bound is not a standard deviation. Name an "
                       + "assumption from WITHIN_ASSUMPTIONS or do not convert." };
  return { ok: true, sigmaNm: withinNm / a.divisor, assumption, assumptionText: a.text,
           sourceText: `POSITION ACCURATE WITHIN ${withinNm} NM`, labelled: true, provisional: true };
}

/* -------------------------------------------------------------- duplicates and dependence */

/**
 * DEDUPLICATION AND SHARED UPSTREAM SOURCES.
 *
 * Two things are collapsed and they are different:
 *
 *  - A DUPLICATE is the same fix arriving twice: same valid time, same position, same
 *    derivation. It contributes nothing and is dropped.
 *  - A SHARED UPSTREAM SOURCE is two fixes that are not identical but are not independent
 *    either — two agencies reading the same GOES-18 image thirty minutes apart, an advisory
 *    position that already incorporated the aircraft fix beside it in the list. They are KEPT,
 *    because they are real observations, but they are grouped, and the independent count is the
 *    number of GROUPS.
 *
 * That distinction is the whole reason a Wilson interval over fixes is meaningless.
 */
export function dedupeFixes(fixes) {
  const seen = new Map();
  const kept = [];
  const dropped = [];
  for (const f of fixes || []) {
    const key = [f.validZ, f.lat, f.lonE, f.derivation || f.source || "", f.centreDefinition || ""].join("|");
    if (seen.has(key)) { dropped.push({ ...f, duplicateOf: seen.get(key) }); continue; }
    seen.set(key, f.fixId || key);
    kept.push(f);
  }
  return { kept, dropped, duplicateCount: dropped.length };
}

/**
 * Group fixes by what they actually depend on. `upstream` is the honest key when a fix carries
 * one (a satellite id, an aircraft mission, an advisory number); otherwise the centre definition
 * stands in, which is conservative — it groups more, never less.
 */
export function independentGroups(fixes) {
  const groups = new Map();
  for (const f of fixes || []) {
    const key = f.upstream || f.centreDefinition || f.source || "unattributed";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return {
    count: groups.size,
    groups: [...groups.entries()].map(([k, v]) => ({ upstream: k, n: v.length,
      fixIds: v.map((f) => f.fixId || f.validZ) })),
    note: "Independent GROUPS, not fixes. Two agencies reading one satellite image are one group.",
  };
}

/**
 * MIXED CENTRE DEFINITIONS. Allowed only with a MEASURED offset between them.
 *
 * There is no measured offset in this build, so any series spanning more than one definition
 * fails data quality and says which definitions it spanned. The alternative — averaging an
 * aircraft centre against an ADT centre — buries a systematic several-nm difference inside a
 * number presented as an observation.
 */
export function centreDefinitionCheck(fixes, measuredOffsets) {
  const defs = [...new Set((fixes || []).map((f) => f.centreDefinition).filter(Boolean))];
  if (defs.length <= 1) return { ok: true, definitions: defs, refusal: null };
  const have = measuredOffsets || {};
  const missing = [];
  for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) {
    const k1 = `${defs[i]}|${defs[j]}`, k2 = `${defs[j]}|${defs[i]}`;
    if (have[k1] == null && have[k2] == null) missing.push(k1);
  }
  if (!missing.length) return { ok: true, definitions: defs, refusal: null, offsetsUsed: Object.keys(have) };
  return { ok: false, definitions: defs, refusal: "MIXED_CENTRE_DEFINITIONS", missingOffsets: missing,
           note: "An offset term between these definitions has not been measured, so they are "
               + "not one series." };
}

/* ------------------------------------------------------------------------ baseline identity */

/**
 * TWO SERIES, KEPT APART.
 *
 *  fixed-baseline    every residual measured against ONE issued advisory, for as long as that
 *                    advisory is the one in force
 *  latest-advisory   every residual measured against whatever advisory was current at the fix
 *
 * They answer different questions and their jumps mean different things. A baseline RESET — the
 * moment a new advisory supersedes the old one — puts a step in the latest-advisory series that
 * is an artefact of the reset, not a movement of the storm. Every reset is marked, and nothing
 * in this module reads a trend across one.
 */
export function markBaselineResets(series) {
  const out = [];
  let prev = null;
  for (const r of series || []) {
    const reset = prev != null && r.baselineId !== prev;
    out.push({ ...r, baselineReset: reset, previousBaselineId: reset ? prev : null });
    prev = r.baselineId;
  }
  return out;
}

/** Contiguous runs sharing one baseline. A trend may only ever be evaluated inside one run. */
export function baselineRuns(series) {
  const runs = [];
  for (const r of series || []) {
    const last = runs[runs.length - 1];
    if (last && last.baselineId === r.baselineId) last.items.push(r);
    else runs.push({ baselineId: r.baselineId, items: [r] });
  }
  return runs;
}

/* ------------------------------------------------------------------ the evaluation window */

/**
 * HOW A SIX-HOUR WINDOW CAN EXIST WHEN ADVISORIES ARE SIX-HOURLY.
 *
 * If the only observations were full advisories, a six-hour window would hold exactly two of
 * them, one of which is the baseline's own initial position — so an official-only series can
 * never clear a sample gate of three. That is the correct answer, not a defect, and this module
 * returns it rather than lowering the gate.
 *
 * The window is possible at all because of what falls BETWEEN advisories: intermediate public
 * advisories (every three hours when watches or warnings are up), and non-advisory centre fixes
 * in the f-deck — aircraft, microwave, Dvorak — which arrive on their own cadence. Those are
 * what populate a window; the official products are what anchor it.
 */
export const WINDOW_HOURS = 6;
export const MIN_INDEPENDENT_FIXES = 3;

export function windowOf(series, endMs, hours) {
  const h = hours ?? WINDOW_HOURS;
  const lo = endMs - h * 3600e3;
  return (series || []).filter((r) => {
    const t = Date.parse(r.fixValidZ);
    return Number.isFinite(t) && t > lo && t <= endMs;
  });
}

/* --------------------------------------------------------------------- freshness and latency */

/**
 * FRESHNESS IS THE AGE OF THE NEWEST ELIGIBLE OBSERVATION — including one that confirms an
 * unchanged position. Defining it as "the last time the residual moved" makes a stable storm
 * look like a dead feed, which is the one reading that would get an operator to stop watching
 * the panel at exactly the wrong moment.
 *
 * Observation age and ingestion latency are DIFFERENT NUMBERS and are returned separately. A fix
 * valid at 1700Z that reached the pipeline at 1742Z is 42 minutes of latency and, at 1800Z, one
 * hour of age. Reporting one as the other hides whichever half is broken.
 */
export function informationAge(fixes, nowMs) {
  const eligible = (fixes || []).filter((f) => f.eligible !== false && Number.isFinite(Date.parse(f.validZ)));
  if (!eligible.length) return { ok: false, refusal: "NO_ELIGIBLE_OBSERVATION" };
  let newest = eligible[0];
  for (const f of eligible) if (Date.parse(f.validZ) > Date.parse(newest.validZ)) newest = f;
  const validMs = Date.parse(newest.validZ);
  const recvMs = Date.parse(newest.receivedZ || "");
  return {
    ok: true,
    effectiveInformationAgeMin: (nowMs - validMs) / 60000,
    observationAgeMin: (nowMs - validMs) / 60000,
    ingestLatencyS: Number.isFinite(recvMs) ? (recvMs - validMs) / 1000 : null,
    /* A NEGATIVE LATENCY IS REAL AND IS NOT AN ERROR. NHC transmits an advisory before the hour
       it is valid for — measured on Lowell, 46A was on the wire at 1744Z carrying an 1800Z valid
       time, sixteen minutes ahead of itself. Clamping that to zero would hide a genuine property
       of the feed, so it is reported with a flag rather than repaired. */
    receivedBeforeValidTime: Number.isFinite(recvMs) ? recvMs < validMs : null,
    newestFixId: newest.fixId || null,
    newestValidZ: newest.validZ,
    definition: "Age of the newest input eligible to enter the residual series, including one "
              + "that confirms an unchanged position.",
  };
}

/* ---------------------------------------------------------------- the candidate trend rule */

/**
 * THE BRIEF'S PROMOTION RULE, IMPLEMENTED AND NOT BELIEVED.
 *
 * Three same-sign cross-track residuals inside six hours from at least three fixes of source
 * tier 0–1. Evaluated here so a backtest can score it. Its verdict is reported as
 * `candidateMet`, and `promoted` is ALWAYS false, because no version of this rule has been
 * validated against held-out storms.
 *
 * Three specific reasons it is a hypothesis and not a law, each of which the backtest must
 * settle rather than assume:
 *   - Source tier is neither accuracy nor independence.
 *   - Six hours is shorter than some trochoidal cycles, so "persistent" can be one wobble.
 *   - Same-sign is a weak test when consecutive fixes share an upstream source.
 */
export function candidateTrendRule(windowSeries, opts) {
  const o = opts || {};
  const minN = o.minIndependent ?? MIN_INDEPENDENT_FIXES;
  const usable = (windowSeries || []).filter((r) => r.ok && Number.isFinite(r.crossNm));
  const groups = independentGroups(usable);
  const signs = usable.map((r) => Math.sign(r.crossNm)).filter((s) => s !== 0);
  const sameSign = signs.length >= minN && signs.every((s) => s === signs[0]);
  const spanH = usable.length >= 2
    ? (Date.parse(usable[usable.length - 1].fixValidZ) - Date.parse(usable[0].fixValidZ)) / 3600e3 : 0;
  const oneBaseline = new Set(usable.map((r) => r.baselineId)).size <= 1;
  return {
    candidateMet: sameSign && groups.count >= minN && oneBaseline && spanH <= WINDOW_HOURS,
    promoted: false,
    promotionStatus: "CANDIDATE RULE — NOT VALIDATED",
    reasonNotPromoted: "No held-out-storm backtest has scored this rule. Source tier is not "
                     + "independence; six hours need not span a trochoidal cycle.",
    detail: { n: usable.length, independentGroups: groups.count, sameSign, spanHours: spanH,
              singleBaseline: oneBaseline, signs },
  };
}

/* ---------------------------------------------------------------------------- the assessment */

/**
 * THE FOUR FIELDS. Every one of them names its reason, and none of them is allowed to be
 * inferred from another.
 */
export function assessSeries(series, opts) {
  const o = opts || {};
  const nowMs = o.nowMs ?? Date.now();
  const all = markBaselineResets(series || []);
  const usable = all.filter((r) => r.ok);
  const refused = all.filter((r) => !r.ok);

  const fixes = usable.map((r) => ({
    fixId: r.fixId, validZ: r.fixValidZ, receivedZ: r.receivedZ || null,
    lat: r.observed && r.observed.lat, lonE: r.observed && r.observed.lonE,
    source: r.source || null, derivation: r.derivation || null,
    centreDefinition: r.centreDefinition || null, upstream: r.upstream || null,
    eligible: true,
  }));
  const dedup = dedupeFixes(fixes);
  const groups = independentGroups(dedup.kept);
  const centres = centreDefinitionCheck(dedup.kept, o.measuredCentreOffsets);

  /* --- 1. DATA QUALITY --------------------------------------------------------------- */
  const dqReasons = [];
  if (!usable.length) dqReasons.push("NO_USABLE_RESIDUAL");
  for (const r of refused) dqReasons.push("REFUSED_RESIDUAL:" + r.refusal);
  if (dedup.duplicateCount) dqReasons.push(`DUPLICATE_FIXES:${dedup.duplicateCount}`);
  if (!centres.ok) dqReasons.push(centres.refusal + ":" + centres.definitions.join("+"));
  const dataQuality = { ok: dqReasons.length === 0, state: dqReasons.length ? "DEGRADED" : "OK",
                        reasons: dqReasons, centreDefinitions: centres };

  /* --- 2. UNCERTAINTY CALIBRATION ---------------------------------------------------- */
  /* There is no fit. There has never been a fit. The state is the same on every storm and it
     will stay the same until a backtest produces one, which is the honest position and not a
     placeholder. */
  const uncertaintyCalibration = {
    ok: false, state: "UNCALIBRATED_UNCERTAINTY",
    reasons: ["NO_EMPIRICAL_FIT"],
    sigma: { ...PROVISIONAL_SIGMA_NM },
    note: "The band drawn on the strip is the brief's assumed magnitudes, not a fit. "
        + "WITHIN_NOISE would mean 'indistinguishable from an unvalidated floor', which is a "
        + "statement about the floor.",
  };

  /* --- 3. SAMPLE SUFFICIENCY --------------------------------------------------------- */
  const minN = o.minIndependent ?? MIN_INDEPENDENT_FIXES;
  const enough = groups.count >= minN;
  const sampleSufficiency = {
    ok: enough, state: enough ? "SUFFICIENT" : "INSUFFICIENT_SAMPLE",
    reasons: enough ? [] : [`INDEPENDENT_GROUPS_${groups.count}_OF_${minN}`],
    independentGroups: groups.count, fixes: dedup.kept.length, duplicates: dedup.duplicateCount,
    groups: groups.groups,
    note: "The unit is an independent group, not a row. Two agencies on one satellite image are "
        + "one group; an official-only pair (46 and 46A) is one or two, never three.",
  };

  /* --- 4. TREND STATUS --------------------------------------------------------------- */
  const runs = baselineRuns(usable);
  const lastRun = runs.length ? runs[runs.length - 1] : { items: [] };
  const endMs = lastRun.items.length ? Date.parse(lastRun.items[lastRun.items.length - 1].fixValidZ) : nowMs;
  const win = windowOf(lastRun.items, endMs);
  const cand = candidateTrendRule(win, o);
  const trendStatus = {
    ok: false, state: "NO_TREND_ASSERTED", promoted: false,
    reasons: ["RULE_NOT_VALIDATED"].concat(
      dataQuality.ok ? [] : ["DATA_QUALITY_DEGRADED"],
      sampleSufficiency.ok ? [] : ["INSUFFICIENT_SAMPLE"],
      uncertaintyCalibration.ok ? [] : ["UNCALIBRATED_UNCERTAINTY"]),
    candidate: cand,
    baselineResets: all.filter((r) => r.baselineReset).map((r) => ({ at: r.fixValidZ, from: r.previousBaselineId, to: r.baselineId })),
    note: "A residual may be reported with its uncertainty; a bias may not be asserted from an "
        + "insufficient or dependent sample. No trend is asserted across a baseline reset.",
  };

  return {
    signConvention: usable.length ? usable[0].signConvention : null,
    residuals: all,
    dataQuality, uncertaintyCalibration, sampleSufficiency, trendStatus,
    freshness: informationAge(dedup.kept, nowMs),
    /* THE FIELD THE EDGE BOOK WOULD READ IF IT WERE WIRED. IT IS NOT WIRED. */
    residual_state: { value: null, wired: false,
      reason: "Left unwired on purpose: nothing here has been scored against a held-out storm, "
            + "so no residual may move a rank." },
  };
}

/** Wobble is BOUNDED, not removed. Stated as a limit, never subtracted from a residual. */
export function wobbleBoundNm(series) {
  const usable = (series || []).filter((r) => r.ok && Number.isFinite(r.crossNm));
  if (usable.length < 2) return { ok: false, refusal: "TOO_FEW_FOR_A_BOUND" };
  const cross = usable.map((r) => r.crossNm);
  return {
    ok: true,
    peakToPeakNm: Math.max(...cross) - Math.min(...cross),
    note: "An observed spread across the window. It bounds the sum of wobble, observation error "
        + "and any real departure — it does not separate them, and nothing is subtracted from a "
        + "residual on the strength of it.",
  };
}

/* Re-exported so a consumer needs one import to compute and to judge. */
export { haversineNm, deltaBearingDeg };
