/* THE TRACK RESIDUAL — where the storm actually is, against where an issued forecast said it
 * would be, in the frame that forecast was pointing, with the sign convention printed.
 *
 * WHAT THIS MODULE IS FOR. An advisory is a claim about future positions. A centre fix is an
 * observation. The difference between them, evaluated at a shared valid time, is a RESIDUAL: a
 * measurement, reportable with its uncertainty. It is not a trend, not a bias, not a forecast of
 * the next advisory, and nothing in this file computes one. The state machine that refuses those
 * claims lives in track-residual-state.mjs; this file is the geometry underneath it.
 *
 * ------------------------------------------------------------------------------------------
 * THREE THINGS THE CONCEPT BRIEF GOT WRONG, AND WHAT THIS FILE DOES INSTEAD
 *
 * 1. IT INTERPOLATED TO THE OBSERVED LATITUDE. The brief's §4.2 says the forecast is
 *    interpolated in TIME; its worked example interpolates to the observed LATITUDE. Those are
 *    different operations and the second one is degenerate: matching latitude forces the
 *    latitude difference to zero, so for a northbound storm the along-track residual is
 *    mechanically ~0 and the whole departure is reported as lateral. The example then read that
 *    artefact as physics — "latitude verified exactly, forward speed was perfect".
 *
 *    Interpolation here is LINEAR IN TIME between adjacent forecast positions and nothing else.
 *    Latitude interpolation survives only as an explicitly named diagnostic
 *    (`interpolateAtLatitude`) which refuses when its own construction is invalid, and which no
 *    residual is ever computed from.
 *
 * 2. IT TRUSTED THE NOMINAL LEAD LABELS. A forecast/advisory prints rows labelled by the
 *    forecaster's cycle, not by elapsed time. Lowell's TCM 46 is issued at 07/1500Z and its
 *    first FORECAST VALID row is 08/0000Z — NINE hours, filed under a nominal "12H". Reading
 *    the label puts the interpolation a third of a segment out of place, silently, on every
 *    off-synoptic advisory. Only the explicit UTC valid times in the product are read here; the
 *    labels are not parsed at all, and `leadHours` is always computed from timestamps.
 *
 * 3. IT PROJECTED ONTO ONE AXIS. An eastward displacement on a north-northeast heading has a
 *    component on BOTH the cross-track and along-track axes. On the corrected Lowell numbers
 *    the along-track term is about -3 nm, not 0. The projection here is a full 2-D rotation of
 *    the great-circle displacement into the frame, so neither axis can absorb the other.
 *
 * ------------------------------------------------------------------------------------------
 * THE FRAME IS THE FORECAST'S, NOT THE STORM'S.
 *
 * Along-track and cross-track are meaningless without a direction, and there are two candidates:
 * the direction the BASELINE FORECAST was heading at the evaluated time, and the direction the
 * storm was reported to be MOVING. They are not the same — on Lowell at 07/1800Z the forecast's
 * own local course is 023° and the intermediate advisory reports motion 030° — and they answer
 * different questions. "Did the storm leave the forecast track, and on which side" is a question
 * about the FORECAST, so the frame is the forecast's local direction at the evaluated time,
 * derived from the same piecewise-linear-in-time path the position came from. Reported motion is
 * retained beside it as a separate field and never substituted.
 *
 * SIGN CONVENTION, which every consumer must print:
 *
 *   +cross  = RIGHT of the baseline forecast's direction of travel
 *   +along  = AHEAD along that direction
 *
 * There is no hardcoded east anywhere in this file. "Right of a 023° heading" happens to be
 * roughly east-southeast for Lowell and would be roughly west for a storm heading 203°; the
 * geographic meaning is derived from the frame, per call. And ALONG-TRACK IS NOT A SPEED ERROR:
 * it is a displacement along the forecast direction, which a timing error produces but so does a
 * storm that took a shorter path to the same place.
 *
 * LONGITUDE is stored and returned as SIGNED DEGREES EAST, always. West is negative. Differences
 * are wrapped to (-180, +180] by `deltaLonDeg` so a storm at 179.9E and one at 179.9W are 0.2°
 * apart rather than 359.8°. Nothing here special-cases a basin.
 *
 * DISTANCES are great-circle on the sphere the rest of this repository uses (EARTH_R_KM from the
 * archive's geo module), converted to nautical miles at the exact definition 1 nm = 1.852 km.
 * A residual computed here and a distance computed by the archive cannot disagree about the size
 * of the planet.
 */

import { EARTH_R_KM } from "../../docs/storm-atlas/src/engine/geo.js";

/** Exact by definition. */
export const KM_PER_NM = 1.852;
export const NM_PER_DEG_LAT = (EARTH_R_KM * Math.PI / 180) / KM_PER_NM;

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Printed on every artefact. Consumers must render this string, not paraphrase it. */
export const SIGN_CONVENTION =
  "+CROSS = RIGHT OF BASELINE FORECAST DIRECTION · +ALONG = AHEAD ALONG IT · ALONG ≠ SPEED ERROR";

/** The interpolation this module defines a residual against. Any other value is a diagnostic. */
export const RESIDUAL_INTERPOLATION = "linear-in-time";

/* ---------------------------------------------------------------- longitude, signed degrees E */

/** Any longitude to signed degrees east in (-180, +180]. */
export function signedLonE(lon) {
  if (!Number.isFinite(lon)) return null;
  const v = Number(lon);
  /* A value already in range is returned UNCHANGED. Folding it through the modulus and back
     would introduce a rounding error of order 1e-14 for no reason — and -162.6 coming back as
     -162.59999999999997 is exactly the sort of drift that makes a golden test flaky and then
     gets "fixed" by loosening the tolerance. */
  if (v > -180 && v <= 180) return v;
  let x = ((v + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

/** b − a in degrees of longitude, wrapped to (-180, +180]. The antimeridian is not a wall. */
export function deltaLonDeg(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  let d = ((Number(b) - Number(a) + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/* --------------------------------------------------------------------- great-circle geometry */

/** Great-circle distance in nautical miles. */
export function haversineNm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = deltaLonDeg(lon1, lon2) * DEG;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * EARTH_R_KM / KM_PER_NM;
}

/** Initial great-circle bearing from 1 to 2, degrees true in [0, 360). */
export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = deltaLonDeg(lon1, lon2) * DEG;
  const p1 = lat1 * DEG, p2 = lat2 * DEG;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  if (y === 0 && x === 0) return null;          // the two points coincide: no bearing exists
  return (Math.atan2(y, x) * RAD + 360) % 360;
}

/** Signed smallest difference b − a in degrees, in (-180, +180]. */
export function deltaBearingDeg(a, b) { return deltaLonDeg(a, b); }

/** The point a fraction f of the way along the great circle from 1 to 2. Used to MEASURE the
    error of the linear interpolation this module actually uses, never as a substitute for it. */
export function geodesicInterpolate(lat1, lon1, lat2, lon2, f) {
  const p1 = lat1 * DEG, l1 = lon1 * DEG, p2 = lat2 * DEG, l2 = lon2 * DEG;
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(deltaLonDeg(lon1, lon2) * DEG / 2) ** 2));
  if (!Number.isFinite(d) || d === 0) return { lat: lat1, lonE: signedLonE(lon1) };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD, lonE: signedLonE(Math.atan2(y, x) * RAD) };
}

/* ------------------------------------------------------------------ reading issued forecasts */

const MS = (iso) => (iso ? Date.parse(iso) : NaN);

/* A forecast/advisory (TCM) gives its own issue hour and then a series of rows carrying an
   explicit day-of-month and HHMM. The DAY is what disambiguates the month roll; the nominal
   lead label ("12H", "24H") is NOT PARSED, on purpose — see the header. */
const TCM_ISSUE = /^\s*(\d{3,4})\s+UTC\s+[A-Z]{3}\s+([A-Z]{3})\s+(\d{2})\s+(\d{4})\s*$/im;
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

/**
 * Parse the positions out of an NHC forecast/advisory (TCM).
 *
 * Returns `{ ok, issuedZ, initialValidZ, points, positionAccuracyText, positionAccuracyNm,
 *            reportedMotion, refusal }`.
 *
 * `points` are `{ validZ, lat, lonE, kt, gustKt, kind }` in time order, `kind` being
 * `"initial" | "forecast" | "outlook"`. OUTLOOK rows are parsed and RETAINED but are excluded
 * from `coverage` by default: an outlook is a different product of a different accuracy, and a
 * residual scored against one would be scored against something NHC did not issue as a forecast.
 */
export function parseForecastAdvisory(text, opts) {
  const o = opts || {};
  const src = String(text || "");
  const iss = TCM_ISSUE.exec(src);
  if (!iss) return { ok: false, refusal: "NO_ISSUE_LINE", points: [] };
  const hh = Math.floor(Number(iss[1]) / 100), mi = Number(iss[1]) % 100;
  const mon = MONTHS[iss[2].toUpperCase()];
  if (mon == null) return { ok: false, refusal: "UNREADABLE_ISSUE_MONTH", points: [] };
  const year = Number(iss[4]);
  const issuedMs = Date.UTC(year, mon, Number(iss[3]), hh, mi);

  /* Day-of-month + HHMM, resolved against the issue date. A row whose day is far BEFORE the
     issue day has rolled into the next month; nothing here ever rolls backwards, because a
     forecast row is never in the past. */
  const atDay = (dd, hhmm) => {
    const h = Math.floor(Number(hhmm) / 100), m = Number(hhmm) % 100;
    let d = Date.UTC(year, mon, Number(dd), h, m);
    if (d < issuedMs - 3 * 3600e3) d = Date.UTC(year, mon + 1, Number(dd), h, m);
    return d;
  };

  const points = [];
  const push = (kind, dd, hhmm, la, ns, lo, ew, kt, gust) => {
    let lat = Number(la); if (/S/i.test(ns)) lat = -lat;
    let lon = Number(lo); if (/W/i.test(ew)) lon = -lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    points.push({ validZ: new Date(atDay(dd, hhmm)).toISOString(), lat, lonE: signedLonE(lon),
                  kt: Number.isFinite(Number(kt)) ? Number(kt) : null,
                  gustKt: Number.isFinite(Number(gust)) ? Number(gust) : null, kind });
  };

  /* The INITIAL position. Two layouts are in service; both name the valid time explicitly. */
  const init = /(?:CENTER LOCATED NEAR|REPEAT\.\.\.CENTER LOCATED NEAR)\s+([\d.]+)\s*([NS])\s+([\d.]+)\s*([EW])\s+AT\s+(\d{2})\/(\d{4})Z/i.exec(src);
  const initKt = /MAX SUSTAINED WINDS\s+(\d+)\s*KT(?:\s+WITH GUSTS TO\s+(\d+)\s*KT)?/i.exec(src);
  if (init) push("initial", init[5], init[6], init[1], init[2], init[3], init[4],
                 initKt ? initKt[1] : null, initKt ? initKt[2] : null);

  const rowRe = /(FORECAST|OUTLOOK)\s+VALID\s+(\d{2})\/(\d{4})Z\s+([\d.]+)\s*([NS])\s+([\d.]+)\s*([EW])(?:[^\n]*\n\s*MAX\s+WIND\s+(\d+)\s*KT(?:[.\s]*GUSTS\s+(\d+)\s*KT)?)?/gi;
  for (const m of src.matchAll(rowRe)) {
    push(m[1].toUpperCase() === "OUTLOOK" ? "outlook" : "forecast",
         m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9]);
  }
  points.sort((a, b) => MS(a.validZ) - MS(b.validZ));

  const within = /POSITION ACCURATE WITHIN\s+(\d+)\s*NM/i.exec(src);
  const motion = /PRESENT MOVEMENT TOWARD [^\n]*?\bOR\s+(\d+)\s+DEGREES AT\s+(\d+)\s*KT/i.exec(src);
  const advNum = /FORECAST\/ADVISORY NUMBER\s+(\d+[A-Z]?)/i.exec(src);
  const stormId = /\b([A-Z]{2}\d{6})\b/.exec(src);

  return {
    ok: points.length > 0,
    refusal: points.length ? null : "NO_POSITIONS_PARSED",
    advisoryNumber: advNum ? advNum[1] : null,
    stormId: stormId ? stormId[1] : null,
    issuedZ: new Date(issuedMs).toISOString(),
    initialValidZ: points.length && points[0].kind === "initial" ? points[0].validZ : null,
    points,
    /* VERBATIM, with its original meaning. This is a stated bound on the analysed centre, not a
       standard deviation, and this module never converts it without an explicit labelled call. */
    positionAccuracyText: within ? within[0].replace(/\s+/g, " ").trim() : null,
    positionAccuracyNm: within ? Number(within[1]) : null,
    /* Reported motion, kept SEPARATE from the frame. See the header. */
    reportedMotion: motion ? { deg: Number(motion[1]), kt: Number(motion[2]), units: "kt",
                              text: motion[0].replace(/\s+/g, " ").trim() } : null,
    includesOutlook: !!o.includeOutlook,
  };
}

/**
 * Parse the observed centre out of a public advisory (TCP), full or intermediate.
 *
 * The SUMMARY block is read rather than the prose, because the prose wraps across lines and the
 * summary does not. The prose IS read for one thing: whether the centre was located by aircraft,
 * because an aircraft centre and a satellite-estimated centre are different definitions of
 * "centre" and this module refuses to mix definitions silently.
 */
export function parsePublicAdvisory(text) {
  const src = String(text || "");
  const sum = /SUMMARY OF\s+[^.\n]*?\.\.\.(\d{4})\s*UTC\.\.\.INFORMATION/i.exec(src);
  const loc = /^LOCATION\.\.\.([\d.]+)([NS])\s+([\d.]+)([EW])\s*$/im.exec(src);
  const dateLine = /^\s*\d{3,4}\s+(?:AM|PM)\s+[A-Z]{3}\s+[A-Z]{3}\s+([A-Z]{3})\s+(\d{2})\s+(\d{4})\s*$/im.exec(src);
  if (!sum || !loc || !dateLine) return { ok: false, refusal: "NO_SUMMARY_BLOCK" };
  const mon = MONTHS[dateLine[1].toUpperCase()];
  if (mon == null) return { ok: false, refusal: "UNREADABLE_MONTH" };
  const hhmm = Number(sum[1]);
  /* The local date on the header line and the UTC hour in the summary can straddle midnight
     UTC. HST is UTC-10 and every product here is a morning one, so the UTC day is the local day;
     a product where they differ is refused rather than guessed. */
  const validMs = Date.UTC(Number(dateLine[3]), mon, Number(dateLine[2]),
                           Math.floor(hhmm / 100), hhmm % 100);
  let lat = Number(loc[1]); if (/S/i.test(loc[2])) lat = -lat;
  let lon = Number(loc[3]); if (/W/i.test(loc[4])) lon = -lon;
  const byAircraft = /was located\s*\n?\s*by an? [^\n]*(?:Hurricane Hunter|Air Force|NOAA)[^\n]*aircraft/i.test(src)
                  || /located by an? [^\n]*aircraft/i.test(src);
  const motion = /PRESENT MOVEMENT\.\.\.[A-Z]+ OR\s+(\d+)\s+DEGREES AT\s+(\d+)\s*MPH/i.exec(src);
  const advNum = /Advisory Number\s+(\d+[A-Z]?)/i.exec(src);
  return {
    ok: true, refusal: null,
    advisoryNumber: advNum ? advNum[1] : null,
    validZ: new Date(validMs).toISOString(),
    lat, lonE: signedLonE(lon),
    /* THE CENTRE DEFINITION, named. Not a quality grade — a statement of what was measured. */
    centreDefinition: byAircraft ? "aircraft-fix" : "advisory-analysed",
    /* MPH, as printed. Never silently compared against the TCM's knots. */
    reportedMotion: motion ? { deg: Number(motion[1]), mph: Number(motion[2]), units: "mph",
                              text: motion[0].replace(/\s+/g, " ").trim() } : null,
  };
}

/* ------------------------------------------------------------------------------ interpolation */

/** The forecast points a residual may be measured against: FORECAST + INITIAL, outlook only on
    request. Returned in time order. */
export function coveragePoints(advisory, opts) {
  const o = opts || {};
  const keep = (p) => p.kind !== "outlook" || o.includeOutlook;
  return (advisory && advisory.points ? advisory.points : []).filter(keep);
}

/**
 * THE INTERPOLATION. Piecewise LINEAR IN TIME between adjacent forecast positions.
 *
 * Refuses — returns `{ ok: false, refusal }` — rather than extrapolating, when the requested
 * time is outside the track's coverage. An extrapolated forecast position is not a forecast.
 */
export function interpolateAtTime(points, tMs, opts) {
  const pts = (points || []).filter((p) => Number.isFinite(MS(p.validZ)));
  if (pts.length < 2) return { ok: false, refusal: "TRACK_TOO_SHORT" };
  const t0 = MS(pts[0].validZ), tN = MS(pts[pts.length - 1].validZ);
  if (!Number.isFinite(tMs)) return { ok: false, refusal: "NO_FIX_TIME" };
  if (tMs < t0) return { ok: false, refusal: "BEFORE_TRACK_COVERAGE", coverage: [pts[0].validZ, pts[pts.length - 1].validZ] };
  if (tMs > tN) return { ok: false, refusal: "AFTER_TRACK_COVERAGE", coverage: [pts[0].validZ, pts[pts.length - 1].validZ] };

  let i = 0;
  while (i < pts.length - 2 && MS(pts[i + 1].validZ) <= tMs) i++;
  const a = pts[i], b = pts[i + 1];
  const ta = MS(a.validZ), tb = MS(b.validZ);
  if (tb === ta) return { ok: false, refusal: "ZERO_LENGTH_SEGMENT" };
  const f = (tMs - ta) / (tb - ta);
  const dLon = deltaLonDeg(a.lonE, b.lonE);
  const lat = a.lat + f * (b.lat - a.lat);
  const lonE = signedLonE(a.lonE + f * dLon);

  /* AT AN INTERIOR NODE THE LOCAL DIRECTION IS AMBIGUOUS. The position is not — both segments
     agree on it — but the course is discontinuous, and a caller that projects onto one of two
     courses without knowing there were two is making a silent choice. The size of the
     discontinuity is reported so it can be refused on, or printed. */
  let nodeDiscontinuityDeg = null;
  if (tMs === ta && i > 0) {
    const prev = segmentCourseDeg(pts[i - 1], pts[i]);
    const next = segmentCourseDeg(a, b);
    if (prev != null && next != null) nodeDiscontinuityDeg = Math.abs(deltaBearingDeg(prev, next));
  }

  return {
    ok: true, refusal: null, lat, lonE,
    method: RESIDUAL_INTERPOLATION,
    segment: [i, i + 1], segmentValidZ: [a.validZ, b.validZ], fraction: f,
    segmentHours: (tb - ta) / 3600e3,
    nodeDiscontinuityDeg,
    outlookUsed: a.kind === "outlook" || b.kind === "outlook",
    ...(opts && opts.keepNodes ? { nodes: [a, b] } : {}),
  };
}

/** Course of the linear-in-time path across one segment, at its start, degrees true. Null when
    the two points coincide — a stationary segment has no direction, and inventing one would put
    a sign on a residual that has no side. */
export function segmentCourseDeg(a, b) {
  const dLat = b.lat - a.lat;
  const dLon = deltaLonDeg(a.lonE, b.lonE);
  if (dLat === 0 && dLon === 0) return null;
  const midLat = (a.lat + b.lat) / 2;
  return (Math.atan2(dLon * Math.cos(midLat * DEG), dLat) * RAD + 360) % 360;
}

/**
 * THE FRAME: the baseline forecast's own local direction at the evaluated time.
 *
 * Derived from the same piecewise-linear-in-time path the position came from, so the frame and
 * the position can never describe different curves. Refuses when the containing segment is
 * stationary.
 */
export function localCourseDeg(points, tMs) {
  const at = interpolateAtTime(points, tMs, { keepNodes: true });
  if (!at.ok) return { ok: false, refusal: at.refusal, coverage: at.coverage || null };
  const [a, b] = at.nodes;
  const course = segmentCourseDeg(a, b);
  if (course == null) return { ok: false, refusal: "DIRECTION_UNDEFINED" };
  return { ok: true, refusal: null, courseDeg: course,
           source: "baseline-forecast-local-direction",
           segmentValidZ: at.segmentValidZ, nodeDiscontinuityDeg: at.nodeDiscontinuityDeg };
}

/**
 * LATITUDE INTERPOLATION — A DIAGNOSTIC, NEVER A RESIDUAL.
 *
 * Answers "when does this track cross latitude L, under the same piecewise construction". It is
 * kept because a latitude-crossing question is sometimes the honest one (a target that is a
 * parallel, not a point), and it is fenced because the concept brief used it as the residual
 * definition, where it is degenerate.
 *
 * Refuses when: latitude is not crossed inside coverage; crossed more than once (a recurving
 * storm crosses 21.9N northbound and again southbound, and "the" crossing does not exist); or
 * the crossing segment is not predominantly meridional, where a small latitude change carries a
 * large and badly-conditioned time.
 */
export function interpolateAtLatitude(points, targetLat, opts) {
  const o = opts || {};
  const minMeridionalRatio = o.minMeridionalRatio ?? 1.0;  // |Δlat nm| ≥ |Δlon nm|
  const pts = (points || []).filter((p) => Number.isFinite(MS(p.validZ)));
  if (pts.length < 2) return { ok: false, refusal: "TRACK_TOO_SHORT" };
  const hits = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const lo = Math.min(a.lat, b.lat), hi = Math.max(a.lat, b.lat);
    if (targetLat < lo || targetLat > hi) continue;
    if (a.lat === b.lat) return { ok: false, refusal: "SEGMENT_PARALLEL_TO_TARGET" };
    const f = (targetLat - a.lat) / (b.lat - a.lat);
    const ta = MS(a.validZ), tb = MS(b.validZ);
    const dLatNm = Math.abs(b.lat - a.lat) * NM_PER_DEG_LAT;
    const dLonNm = Math.abs(deltaLonDeg(a.lonE, b.lonE)) * NM_PER_DEG_LAT * Math.cos((a.lat + b.lat) / 2 * DEG);
    hits.push({
      index: i, fraction: f,
      tMs: ta + f * (tb - ta),
      validZ: new Date(ta + f * (tb - ta)).toISOString(),
      lonE: signedLonE(a.lonE + f * deltaLonDeg(a.lonE, b.lonE)),
      meridionalRatio: dLonNm === 0 ? Infinity : dLatNm / dLonNm,
      segmentValidZ: [a.validZ, b.validZ],
    });
  }
  if (!hits.length) return { ok: false, refusal: "TARGET_LATITUDE_NOT_CROSSED_IN_COVERAGE" };
  if (hits.length > 1) return { ok: false, refusal: "MULTIPLE_LATITUDE_CROSSINGS", crossings: hits.length };
  const h = hits[0];
  if (h.meridionalRatio < minMeridionalRatio)
    return { ok: false, refusal: "HEADING_NOT_PREDOMINANTLY_MERIDIONAL", meridionalRatio: h.meridionalRatio };
  return {
    ok: true, refusal: null, ...h,
    method: "linear-in-latitude",
    diagnosticOnly: true,
    note: "A latitude is not a lead time. leadHours below is computed from the track's own valid "
        + "times, not from the target latitude's numeric value.",
    leadHours: (h.tMs - MS(pts[0].validZ)) / 3600e3,
  };
}

/* -------------------------------------------------------------------------------- projection */

/**
 * Project an observed position's departure from a forecast position into the forecast's frame.
 *
 * The displacement is the full great-circle vector from forecast to observed, rotated by the
 * frame course. Both components come out of one rotation, so an eastward displacement on a
 * north-northeast heading lands on BOTH axes — which is the whole correction to the brief.
 */
export function projectResidual(fcst, obs, frameDeg) {
  const dNm = haversineNm(fcst.lat, fcst.lonE, obs.lat, obs.lonE);
  if (dNm === 0) return { separationNm: 0, alongNm: 0, crossNm: 0, bearingDeg: null, frameDeg };
  const brg = initialBearingDeg(fcst.lat, fcst.lonE, obs.lat, obs.lonE);
  const rel = deltaBearingDeg(frameDeg, brg) * DEG;
  return {
    separationNm: dNm,
    alongNm: dNm * Math.cos(rel),
    crossNm: dNm * Math.sin(rel),
    bearingDeg: brg,
    frameDeg,
    /* What "+cross" points at on the ground, for THIS call. Derived, never assumed. */
    crossPointsToward: (frameDeg + 90) % 360,
  };
}

/* ----------------------------------------------------------------------------- the residual */

/**
 * ONE RESIDUAL: one observed fix against one issued baseline.
 *
 * `baseline` is `{ baselineId, points, ...provenance }`; `fix` is
 * `{ validZ, lat, lonE, source, derivation, centreDefinition, ... }`.
 *
 * Returns a record that always carries its frame, its interpolation, its sign convention and its
 * refusal — never a bare pair of numbers.
 */
export function residual(baseline, fix, opts) {
  const o = opts || {};
  const pts = coveragePoints(baseline, o);
  const tMs = MS(fix && fix.validZ);
  const base = {
    baselineId: baseline && baseline.baselineId || null,
    fixId: fix && fix.fixId || null,
    fixValidZ: fix && fix.validZ || null,
    signConvention: SIGN_CONVENTION,
    interpolation: RESIDUAL_INTERPOLATION,
  };
  if (!Number.isFinite(tMs)) return { ...base, ok: false, refusal: "NO_FIX_TIME" };
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lonE))
    return { ...base, ok: false, refusal: "NO_FIX_POSITION" };

  const at = interpolateAtTime(pts, tMs);
  if (!at.ok) return { ...base, ok: false, refusal: at.refusal, coverage: at.coverage || null };
  const frame = localCourseDeg(pts, tMs);
  if (!frame.ok) return { ...base, ok: false, refusal: frame.refusal };

  const proj = projectResidual({ lat: at.lat, lonE: at.lonE }, { lat: fix.lat, lonE: fix.lonE }, frame.courseDeg);
  const t0 = MS(pts[0].validZ);

  return {
    ...base,
    ok: true, refusal: null,
    forecast: { lat: at.lat, lonE: at.lonE, validZ: fix.validZ },
    observed: { lat: fix.lat, lonE: fix.lonE, validZ: fix.validZ },
    frame: { courseDeg: frame.courseDeg, source: frame.source,
             nodeDiscontinuityDeg: frame.nodeDiscontinuityDeg,
             /* Reported motion is CARRIED, not used. Two numbers that are often different. */
             reportedMotion: (baseline && baseline.reportedMotion) || null,
             fixReportedMotion: (fix && fix.reportedMotion) || null },
    crossNm: proj.crossNm, alongNm: proj.alongNm, separationNm: proj.separationNm,
    bearingDeg: proj.bearingDeg, crossPointsToward: proj.crossPointsToward,
    leadHours: (tMs - t0) / 3600e3,
    segment: at.segment, segmentValidZ: at.segmentValidZ, segmentHours: at.segmentHours,
    nodeDiscontinuityDeg: at.nodeDiscontinuityDeg,
    outlookUsed: at.outlookUsed,
    centreDefinition: (fix && fix.centreDefinition) || null,
    baselineCentreDefinition: (baseline && baseline.centreDefinition) || "advisory-analysed",
  };
}

/* ------------------------------------------------------- how wrong the interpolation itself is */

/**
 * THE APPROXIMATION ERROR, MEASURED AND STATED.
 *
 * Linear-in-time in lat/lon is not a geodesic. Over an advisory's segment lengths the difference
 * is small, but "small" is not a number and the brief's silence about it is exactly the sort of
 * gap this module is supposed to close. So it is measured: for each segment, the maximum
 * distance between the linear path and the great circle through the same endpoints, sampled
 * densely, in nautical miles.
 *
 * Reported alongside every residual series as a BOUND, not folded into the uncertainty — folding
 * it in would hide it, and it is systematic rather than random.
 */
export function interpolationBoundNm(points, opts) {
  const o = opts || {};
  const n = o.samples || 101;
  const pts = (points || []).filter((p) => Number.isFinite(MS(p.validZ)));
  const perSegment = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    let worst = 0, worstAt = null;
    for (let k = 1; k < n - 1; k++) {
      const f = k / (n - 1);
      const lin = { lat: a.lat + f * (b.lat - a.lat), lonE: signedLonE(a.lonE + f * deltaLonDeg(a.lonE, b.lonE)) };
      const geo = geodesicInterpolate(a.lat, a.lonE, b.lat, b.lonE, f);
      const d = haversineNm(lin.lat, lin.lonE, geo.lat, geo.lonE);
      if (d > worst) { worst = d; worstAt = f; }
    }
    perSegment.push({ segment: [i, i + 1], validZ: [a.validZ, b.validZ],
                      hours: (MS(b.validZ) - MS(a.validZ)) / 3600e3, maxDeviationNm: worst, atFraction: worstAt });
  }
  return {
    method: RESIDUAL_INTERPOLATION,
    against: "great circle through the same two forecast positions",
    maxDeviationNm: perSegment.reduce((m, s) => Math.max(m, s.maxDeviationNm), 0),
    perSegment,
    note: "A systematic bound on the interpolation, not a random error. It is reported beside "
        + "the residual and never added in quadrature to it.",
  };
}

/**
 * WHAT LATITUDE INTERPOLATION WOULD HAVE SAID. Not an alternative definition — the evidence for
 * rejecting one. Returns the residual computed the brief's way alongside the correct one, so the
 * write-up's claim that they differ is a measurement in the test suite rather than an assertion.
 */
export function latInterpComparison(baseline, fix, opts) {
  const pts = coveragePoints(baseline, opts);
  const correct = residual(baseline, fix, opts);
  const lat = interpolateAtLatitude(pts, fix.lat, { minMeridionalRatio: 0 });
  if (!lat.ok) return { correct, latInterp: { ok: false, refusal: lat.refusal } };
  const frame = localCourseDeg(pts, lat.tMs);
  const proj = frame.ok
    ? projectResidual({ lat: fix.lat, lonE: lat.lonE }, { lat: fix.lat, lonE: fix.lonE }, frame.courseDeg)
    : null;
  return {
    correct,
    latInterp: {
      ok: !!proj, forecast: { lat: fix.lat, lonE: lat.lonE },
      /* By construction the latitude difference is zero, so this is what the degeneracy looks
         like as a number rather than as an argument. */
      dLatDeg: 0,
      crossNm: proj ? proj.crossNm : null, alongNm: proj ? proj.alongNm : null,
      separationNm: proj ? proj.separationNm : null,
      impliedValidZ: lat.validZ,
      note: "Rejected as a residual definition: matching latitude forces the latitude difference "
          + "to zero, which for a meridional storm reports the whole departure as lateral.",
    },
  };
}
