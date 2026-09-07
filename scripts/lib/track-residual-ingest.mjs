/* TURNING WHAT IS ALREADY INGESTED INTO A RESIDUAL SERIES.
 *
 * SCOPE, STATED NARROWLY. v0 reads official advisory products (TCM / TCP / TCP-intermediate /
 * TCD) and the centre fixes ALREADY PARSED IN THIS REPOSITORY from the ATCF f-deck by
 * lib/atcf.mjs. Nothing else. Raw radar, raw satellite imagery and raw HDOB are not centre
 * fixes — extracting a centre from them is a separate capability that would need its own
 * validation, and it is not in this task.
 *
 * An f-deck row IS an admissible centre fix here because it is a filed, parsed fix with a valid
 * time, a producing site and a stated position confidence. It arrives already normalised by the
 * board's own parser, which is the test §7 sets: available, documented, and in-repo.
 *
 * NO SOURCE IS GROUND TRUTH. The advisory position is a forecaster's analysis. The aircraft fix
 * is an instrument reading of a centre that was moving while the plane flew through it. The best
 * track is revisable for months. Each row records what it is; none is labelled truth, and the
 * strip's markers are by SOURCE FAMILY for that reason.
 *
 * FIVE TIMES, ALL DIFFERENT, ALL PERSISTED:
 *
 *   cycleZ            the model/deck cycle a forecast was built on
 *   initialValidZ     the valid time of the initial position
 *   issuedZ           when the product says it was issued
 *   firstAvailableZ   when it actually went out — from the archived message filename, to the
 *                     minute. Measured across 2024, transmission runs from 146 min early to 177
 *                     min late against the nominal slot, so the nominal hour is not a proxy.
 *   receivedZ         when this pipeline read it
 *
 * OPERATIONAL EVALUATION USES ONLY WHAT WAS AVAILABLE AT THE ASSESSMENT TIME. `eligibleAt`
 * enforces it. The specific leak it exists to stop: scoring an aircraft fix against an advisory
 * that had ALREADY INGESTED that fix, and calling the difference lead. Lowell 46A is exactly
 * that shape — its position was located by aircraft, and the next forecast advisory (47) was
 * built knowing it.
 *
 * WHEN A HISTORICAL RECEIPT TIME IS UNKNOWN it is null and `availabilityAssumption` says which
 * assumption was substituted. It is never quietly set equal to the valid time.
 */

import { parseFdeck } from "./atcf.mjs";
import { parseForecastAdvisory, parsePublicAdvisory, signedLonE } from "./track-residual.mjs";
import { centreDefinitionOfFixType } from "./track-residual-state.mjs";

const MS = (iso) => Date.parse(iso);

/**
 * SOURCE FAMILIES, for the strip's markers. A family is a KIND OF INSTRUMENT, not a rank.
 * Nothing in this module orders them, and nothing treats one as ground truth.
 */
export const SOURCE_FAMILIES = {
  official: { label: "official advisory", members: ["advisory-analysed"] },
  aircraft: { label: "aircraft", members: ["aircraft-fix"] },
  satellite: { label: "satellite estimate", members: ["dvorak-subjective", "dvorak-objective"] },
  microwave: { label: "microwave", members: ["microwave"] },
  scatterometer: { label: "scatterometer", members: ["scatterometer"] },
  radar: { label: "radar", members: ["radar-centroid"] },
  bestTrack: { label: "working best track", members: ["best-track"] },
};
export function familyOf(centreDefinition) {
  for (const [k, v] of Object.entries(SOURCE_FAMILIES))
    if (v.members.includes(centreDefinition)) return k;
  return "other";
}

/* Satellite platform tokens as they appear in f-deck trailing fields. Scanned for rather than
   read at a fixed index, because the column differs between fix formats and a fixed index would
   silently pick up a Dvorak code on the next format that appears. */
const PLATFORM = /^(GOES\d+|GOES-\d+|HIMAWARI\d*|HIMA\d*|METEOSAT\d*|MSG\d|MET\d{1,2}|NOAA\d{1,2}|DMSP\d{2}|METOP-?[ABC]|GPM|TRMM|SUOMI|NPP|JPSS\d?)$/i;

/** The upstream platform a fix depends on, when the row names one. Null is honest; a guess is not. */
export function upstreamOf(rawLine) {
  for (const f of String(rawLine || "").split(",").map((s) => s.trim())) {
    if (PLATFORM.test(f)) return f.toUpperCase();
  }
  return null;
}

/**
 * f-deck rows to residual fixes, with dependence recorded.
 *
 * `upstream` is the grouping key the independence count uses. When the row names a platform, two
 * agencies reading the same platform group together — which is precisely the Lowell case, where
 * PGTW and PHFO filed subjective Dvorak fixes thirty minutes apart off one GOES-18 image. When
 * no platform is named, the fix groups by its producing site, which over-groups rather than
 * under-groups; that direction is the safe one.
 */
export function fixesFromFdeck(text, opts) {
  const o = opts || {};
  const lines = String(text || "").split(/\r?\n/);
  const parsed = parseFdeck(text);
  const byTimeType = new Map();
  for (const ln of lines) {
    const c = ln.split(",").map((s) => s.trim());
    if (c.length < 12 || !/^\d{12}$/.test(c[2])) continue;
    byTimeType.set(c[2] + "|" + c[4], ln);
  }
  const out = [];
  for (const f of parsed.fixes) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    const t = MS(f.iso);
    if (o.fromMs != null && t < o.fromMs) continue;
    if (o.toMs != null && t > o.toMs) continue;
    const raw = byTimeType.get(f.time + "|" + f.type) || "";
    const platform = upstreamOf(raw);
    const centreDefinition = centreDefinitionOfFixType(f.type, f.format);
    out.push({
      fixId: `fdeck:${f.time}:${f.type}:${f.site || "?"}`,
      validZ: f.iso,
      /* NOT KNOWN for an archived deck. Never defaulted to the valid time. */
      receivedZ: o.receivedZ || null,
      availabilityAssumption: o.receivedZ ? null
        : "RECEIPT TIME UNKNOWN — archived deck; no arrival time is recorded and none is assumed.",
      lat: f.lat, lonE: signedLonE(f.lon),
      source: "atcf-fdeck", site: f.site || null,
      derivation: f.type, derivationLabel: f.formatLabel,
      centreDefinition, family: familyOf(centreDefinition),
      /* SHARED UPSTREAM. Platform first, producing site only as a fallback. */
      upstream: platform ? `platform:${platform}` : `site:${f.site || "unknown"}`,
      upstreamNamed: !!platform,
      positionConfidence: f.positionConfidence ?? null,
      /* A confidence CODE, not a sigma. The f-deck's 1/2/3 scale has no published variance. */
      positionConfidenceIsNotSigma: true,
      raw,
    });
  }
  return out;
}

/** A baseline from a forecast/advisory product, with every time it carries. */
export function baselineFromTcm(text, meta) {
  const m = meta || {};
  const adv = parseForecastAdvisory(text);
  if (!adv.ok) return { ok: false, refusal: adv.refusal };
  return {
    ok: true,
    baselineId: m.baselineId || `${adv.stormId || "?"}/TCM/${adv.advisoryNumber || "?"}`,
    stormId: adv.stormId, advisoryNumber: adv.advisoryNumber,
    product: "fstadv",
    /* THE FIVE TIMES. cycleZ is null unless the caller knows the deck cycle — an advisory does
       not print one, and inventing it from the issue hour would be a guess. */
    cycleZ: m.cycleZ ?? null,
    initialValidZ: adv.initialValidZ,
    issuedZ: adv.issuedZ,
    firstAvailableZ: m.firstAvailableZ ?? null,
    receivedZ: m.receivedZ ?? null,
    availabilityAssumption: m.firstAvailableZ ? null
      : "FIRST-AVAILABILITY UNKNOWN — the archived message filename carries the transmit time to "
      + "the minute; it was not supplied here, so no availability is assumed.",
    points: adv.points,
    positionAccuracyText: adv.positionAccuracyText,
    positionAccuracyNm: adv.positionAccuracyNm,
    reportedMotion: adv.reportedMotion,
    centreDefinition: "advisory-analysed",
    source: m.source || null,
  };
}

/** A fix from a public advisory (full or intermediate). */
export function fixFromTcp(text, meta) {
  const m = meta || {};
  const a = parsePublicAdvisory(text);
  if (!a.ok) return { ok: false, refusal: a.refusal };
  return {
    ok: true,
    fixId: m.fixId || `tcp:${a.advisoryNumber}`,
    validZ: a.validZ,
    receivedZ: m.receivedZ ?? null,
    availabilityAssumption: m.receivedZ ? null
      : "RECEIPT TIME UNKNOWN — archived product; no arrival time is recorded and none is assumed.",
    lat: a.lat, lonE: a.lonE,
    source: "nhc-tcp", derivation: "public advisory", derivationLabel: "official advisory position",
    centreDefinition: a.centreDefinition, family: familyOf(a.centreDefinition),
    /* An advisory position is the forecaster's synthesis of everything they had, so it depends
       on whatever they used. Grouped by the advisory itself: two products of one advisory are
       one observation, not two. */
    upstream: `advisory:${a.advisoryNumber}`,
    upstreamNamed: true,
    reportedMotion: a.reportedMotion,
    advisoryNumber: a.advisoryNumber,
  };
}

/**
 * THE LEAK GATE.
 *
 * A fix may be scored against a baseline only when the baseline could not already contain it.
 * Three conditions, all necessary:
 *
 *   1. The fix's valid time is at or after the baseline's initial valid time (otherwise it is
 *      history the forecaster had).
 *   2. The baseline was AVAILABLE at the assessment time — first-availability, not the nominal
 *      issue hour, when it is known.
 *   3. The fix was not published inside the baseline's own product, or by a product the baseline
 *      superseded. `ingestedBy` lets a caller state the advisory that already carried a fix.
 *
 * Refuses on unknown availability rather than assuming it, because assuming availability is the
 * direction that flatters the module.
 */
export function eligibleAt(baseline, fix, opts) {
  const o = opts || {};
  const tFix = MS(fix.validZ);
  const tInit = MS(baseline.initialValidZ);
  if (!Number.isFinite(tFix) || !Number.isFinite(tInit))
    return { ok: false, refusal: "MISSING_TIME" };
  /* STRICTLY POSITIVE LEAD, and the equality case is the one that matters.
     At the baseline's own initial valid time the "forecast" IS the analysis of that moment, so a
     residual there is zero by construction and carries no information about the forecast. Worse,
     when the fix is the advisory's own initial position — which is exactly what happens when the
     latest-advisory series reaches a new advisory — scoring it produces a clean 0.0 nm that
     looks like a forecast that was right. It is not lead. It is the same number twice. */
  if (tFix <= tInit) return { ok: false, refusal: "FIX_AT_OR_BEFORE_BASELINE_INITIAL_TIME",
                              note: "Zero or negative lead: the baseline's initial analysis "
                                  + "covers this moment, so this is not a forecast departure." };

  const avail = MS(baseline.firstAvailableZ || "");
  if (!Number.isFinite(avail) && !o.allowUnknownAvailability)
    return { ok: false, refusal: "BASELINE_AVAILABILITY_UNKNOWN",
             note: baseline.availabilityAssumption || null };
  if (Number.isFinite(avail) && tFix < avail)
    return { ok: false, refusal: "FIX_PREDATES_BASELINE_AVAILABILITY" };

  if (fix.ingestedBy && String(fix.ingestedBy) === String(baseline.advisoryNumber))
    return { ok: false, refusal: "FIX_ALREADY_IN_BASELINE" };

  /* THE ONE THAT ACTUALLY BITES. A fix must never be scored against a LATER advisory that was
     written with the fix in hand — that is the difference between measuring a departure and
     grading a forecaster on information they already had. */
  if (o.laterBaselines) {
    for (const b of o.laterBaselines) {
      const bi = MS(b.initialValidZ);
      if (Number.isFinite(bi) && bi >= tFix && b.baselineId === baseline.baselineId)
        return { ok: false, refusal: "BASELINE_POSTDATES_FIX" };
    }
  }
  return { ok: true, refusal: null,
           leadHours: (tFix - tInit) / 3600e3,
           availabilityKnown: Number.isFinite(avail) };
}

/**
 * THE TWO SERIES, built together so they cannot drift apart.
 *
 *  fixed    — every eligible fix against ONE baseline, until that baseline is superseded
 *  latest   — every eligible fix against whatever baseline was in force at the fix
 */
export function buildSeries(baselines, fixes, residualFn, opts) {
  const o = opts || {};
  const sorted = [...baselines].sort((a, b) => MS(a.initialValidZ) - MS(b.initialValidZ));
  const inForce = (t) => {
    let best = null;
    for (const b of sorted) { if (MS(b.initialValidZ) <= t) best = b; else break; }
    return best;
  };
  const fixed = [], latest = [];
  const target = o.fixedBaselineId ? sorted.find((b) => b.baselineId === o.fixedBaselineId) : sorted[0];
  for (const f of [...fixes].sort((a, b) => MS(a.validZ) - MS(b.validZ))) {
    const t = MS(f.validZ);
    if (target) {
      const el = eligibleAt(target, f, o);
      const r = el.ok ? residualFn(target, f, o)
                      : { ok: false, refusal: el.refusal, baselineId: target.baselineId,
                          fixId: f.fixId, fixValidZ: f.validZ };
      fixed.push({ ...r, ...carry(f) });
    }
    const b = inForce(t);
    if (b) {
      const el = eligibleAt(b, f, o);
      const r = el.ok ? residualFn(b, f, o)
                      : { ok: false, refusal: el.refusal, baselineId: b.baselineId,
                          fixId: f.fixId, fixValidZ: f.validZ };
      latest.push({ ...r, ...carry(f) });
    }
  }
  return { fixed, latest,
           fixedBaselineId: target ? target.baselineId : null,
           note: "Two series, never merged. A step in `latest` at a baseline reset is the reset, "
               + "not the storm." };
}

const carry = (f) => ({
  source: f.source, derivation: f.derivation, derivationLabel: f.derivationLabel,
  centreDefinition: f.centreDefinition, family: f.family, upstream: f.upstream,
  upstreamNamed: f.upstreamNamed, site: f.site || null,
  receivedZ: f.receivedZ || null, availabilityAssumption: f.availabilityAssumption || null,
  positionConfidence: f.positionConfidence ?? null,
});

/**
 * FIRST AVAILABILITY FROM A TRANSMISSION LIST.
 *
 * NHC's live adv/ directory writes one timestamped info file per transmission, and an advisory
 * number can appear more than once — a correction, or a retransmission. Measured on Lowell,
 * advisory 45A appears at 11:43Z and again at 14:50Z, three hours apart. What the later file
 * means is NOT ESTABLISHED here, so the earliest stamp is taken as first availability (the
 * moment the information was first on the wire, which is the question the leak gate asks) and
 * every later stamp is kept beside it rather than discarded or averaged.
 */
export function firstAvailabilityFrom(transmissions) {
  const byNum = new Map();
  for (const t of transmissions || []) {
    if (!t.advisoryNumber) continue;
    const k = String(t.advisoryNumber);
    if (!byNum.has(k)) byNum.set(k, []);
    byNum.get(k).push(t);
  }
  const out = {};
  for (const [k, list] of byNum) {
    list.sort((a, b) => MS(a.firstAvailableZ) - MS(b.firstAvailableZ));
    out[k] = {
      firstAvailableZ: list[0].firstAvailableZ,
      nominalValidZ: list[0].nominalValidZ,
      offsetMinFromNominal: list[0].offsetMinFromNominal,
      laterStamps: list.slice(1).map((x) => x.firstAvailableZ),
      note: list.length > 1
        ? "A later file exists for this advisory number. Its meaning (correction or "
          + "retransmission) is not established, so the earliest stamp is used and the rest kept."
        : null,
    };
  }
  return out;
}
