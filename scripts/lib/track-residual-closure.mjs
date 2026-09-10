/* CLOSURE: CONDITIONAL KINEMATICS, AND NOTHING ELSE.
 *
 * The question this file answers is narrow and it is stated in full on every result:
 *
 *   "Holding a named displacement assumption, what rate of advance would put the centre at this
 *    geometry by this time, and does the assumed path intersect that geometry inside the
 *    forecast's own coverage?"
 *
 * It is not a probability. It is not a landfall forecast. It is not "comfortably reachable". No
 * function here emits P(centre reaches X) and none ever will while the module is unscored — the
 * refusal is structural, not a policy someone can relax by passing a flag.
 *
 * ------------------------------------------------------------------------------------------
 * THE FRAME ERROR THIS FILE EXISTS TO PREVENT
 *
 * The concept brief computed a closure by SUBTRACTING A CROSS-TRACK RESIDUAL FROM AN EASTWARD
 * SHORELINE GAP. Those are not the same coordinate. Cross-track is measured perpendicular to a
 * forecast heading of about 023°; an east-west gap to a shoreline is measured along a parallel.
 * Subtracting one from the other is a category error that happens to produce a plausible-looking
 * number of nautical miles, which is the worst kind.
 *
 * So: every distance in this file is a GREAT-CIRCLE DISTANCE BETWEEN TWO POSITIONS, and every
 * displacement assumption is applied to a POSITION before any distance is taken. There is one
 * frame, it is the sphere, and nothing is ever subtracted across frames. `assertSameFrame` is
 * exported so a caller cannot quietly reintroduce the mistake.
 *
 * ------------------------------------------------------------------------------------------
 * A NAMED POINT IS NOT A SHORE
 *
 * "Niihau, 21.9N 160.2W" is a waypoint. A landfall is a transition of a POLYGON boundary, and
 * the distance to an island is the distance to its coastline, not to a label placed somewhere
 * inside it. Every coastline claim here takes rings — the same GeoJSON rings the genesis
 * archive's landfall rule tests against — and measures to the segment, via lib/geo-segment.mjs.
 * A caller that has only a waypoint gets a refusal, not a coastline claim.
 *
 * ------------------------------------------------------------------------------------------
 * THE LATITUDE-CROSSING DIAGNOSTIC IS KEPT FOR v0, AND IT SAYS SO
 *
 * Some targets really are parallels, and the brief's own worked closure was one. It is retained
 * as an explicitly-labelled DIAGNOSTIC with three refusals attached (not crossed inside
 * coverage, crossed more than once, heading not predominantly meridional) and one rule: THE SAME
 * DISPLACEMENT COMPONENT IS USED THROUGHOUT. The brief moved between a cross-track number, an
 * eastward number and a latitude number inside one calculation; here the assumption is named
 * once and applied once.
 */

import { haversineNm, initialBearingDeg, deltaBearingDeg, deltaLonDeg, signedLonE,
         coveragePoints, interpolateAtTime, interpolateAtLatitude, localCourseDeg,
         KM_PER_NM } from "./track-residual.mjs";
import { nearestRingKm } from "./geo-segment.mjs";

const MS = (iso) => Date.parse(iso);

/* -------------------------------------------------------------------------- frame discipline */

/** Every quantity that will be combined must declare the same frame. Combining a
    "cross-track-nm" with a "shoreline-gap-east-nm" throws here rather than producing a number. */
export function assertSameFrame(a, b) {
  if (!a || !b || !a.frame || !b.frame) throw new Error("closure: an unframed quantity");
  if (a.frame !== b.frame)
    throw new Error(`closure: refusing to combine ${a.frame} with ${b.frame} — different coordinates`);
  return true;
}

/** A great-circle separation between two positions. The only distance this file produces. */
export function separation(from, to) {
  return { frame: "great-circle-nm", nm: haversineNm(from.lat, from.lonE, to.lat, to.lonE),
           bearingDeg: initialBearingDeg(from.lat, from.lonE, to.lat, to.lonE) };
}

/* ------------------------------------------------------- the future-displacement assumptions */

/**
 * WHAT THE STORM IS ASSUMED TO DO NEXT. Named, because the answer depends entirely on it and a
 * closure with an unnamed assumption is a guess wearing a decimal point.
 *
 *  forecast-as-issued     the baseline track, unmodified. The null hypothesis.
 *  residual-persists      the measured along/cross residual is held CONSTANT and added to every
 *                         future forecast position, in that position's own local frame. This is
 *                         a kinematic assumption, not a validated persistence model.
 *  residual-decays        the residual is held and linearly relaxed to zero over `decayHours`.
 *
 * None of these is scored. They are three ways of drawing a conditional line.
 */
export const DISPLACEMENT_ASSUMPTIONS = {
  "forecast-as-issued": "The issued forecast, unmodified. No residual is carried forward.",
  "residual-persists": "The measured along/cross residual held constant and applied to every "
                     + "future forecast position in that position's own local frame. Kinematic "
                     + "assumption; not a validated persistence model.",
  "residual-decays": "As residual-persists, relaxed linearly to zero over decayHours.",
};

/** Move a position `alongNm` ahead and `crossNm` right of a course. One rotation, one frame. */
export function offsetPosition(lat, lonE, courseDeg, alongNm, crossNm) {
  const d = Math.hypot(alongNm, crossNm);
  if (d === 0) return { lat, lonE };
  const brg = (courseDeg + Math.atan2(crossNm, alongNm) * 180 / Math.PI + 360) % 360;
  const R_NM = 6371.0088 / KM_PER_NM;      // matched to EARTH_R_KM via haversineNm's radius
  const dr = d / R_NM, p1 = lat * Math.PI / 180, l1 = lonE * Math.PI / 180, th = brg * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 * 180 / Math.PI, lonE: signedLonE(l2 * 180 / Math.PI) };
}

/**
 * The conditional path: the baseline forecast positions with a named displacement applied.
 * Returns points in the SAME shape as a baseline track, so everything downstream — coverage,
 * interpolation, intersection — is the same code as for an unmodified forecast.
 */
export function assumedPath(baseline, residualRecord, assumption, opts) {
  const o = opts || {};
  if (!DISPLACEMENT_ASSUMPTIONS[assumption])
    return { ok: false, refusal: "UNNAMED_DISPLACEMENT_ASSUMPTION",
             allowed: Object.keys(DISPLACEMENT_ASSUMPTIONS) };
  const pts = coveragePoints(baseline, o);
  if (pts.length < 2) return { ok: false, refusal: "TRACK_TOO_SHORT" };
  if (assumption === "forecast-as-issued")
    return { ok: true, assumption, assumptionText: DISPLACEMENT_ASSUMPTIONS[assumption], points: pts.slice() };
  if (!residualRecord || !residualRecord.ok)
    return { ok: false, refusal: "NO_RESIDUAL_TO_CARRY" };

  const t0 = MS(residualRecord.fixValidZ);
  const decayH = o.decayHours ?? 24;
  const out = [];
  for (const p of pts) {
    const t = MS(p.validZ);
    if (t < t0) { out.push(p); continue; }
    const course = localCourseDeg(pts, Math.min(t, MS(pts[pts.length - 1].validZ)));
    if (!course.ok) return { ok: false, refusal: "DIRECTION_UNDEFINED_ON_PATH" };
    let k = 1;
    if (assumption === "residual-decays") k = Math.max(0, 1 - (t - t0) / (decayH * 3600e3));
    const moved = offsetPosition(p.lat, p.lonE, course.courseDeg,
                                 residualRecord.alongNm * k, residualRecord.crossNm * k);
    out.push({ ...p, lat: moved.lat, lonE: moved.lonE, displaced: true, displacementFactor: k });
  }
  return { ok: true, assumption, assumptionText: DISPLACEMENT_ASSUMPTIONS[assumption], points: out,
           carriedAlongNm: residualRecord.alongNm, carriedCrossNm: residualRecord.crossNm,
           note: "Conditional geometry. Not a forecast, not a probability." };
}

/* --------------------------------------------------------------------------- shoreline geometry */

/** Rings from a GeoJSON FeatureCollection, as [[lat, lon], ...] per ring, with their names. */
export function ringsFromGeoJson(doc, filter) {
  const rings = [];
  for (const f of (doc && doc.features) || []) {
    const name = (f.properties && (f.properties.name || f.properties.name_official)) || null;
    if (filter && !filter(name, f.properties)) continue;
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) for (const ring of poly)
      rings.push({ name, points: ring.map(([lon, lat]) => [lat, lon]) });
  }
  return rings;
}

/**
 * Point in ring, by ray casting in lon/lat.
 *
 * PLANAR, AND SAID SO. Over an island a few tenths of a degree across, treating lon/lat as a
 * plane misplaces the boundary by far less than the position uncertainty of any fix that will
 * ever be tested against it. It would be wrong across a pole or the antimeridian, and neither
 * appears in the Hawaii rings this is used with. A caller working elsewhere must check that
 * before trusting it.
 */
export function pointInRing(lat, lonE, ring) {
  let inside = false;
  const pts = ring;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [yi, xi] = pts[i], [yj, xj] = pts[j];
    if ((yi > lat) !== (yj > lat)) {
      const x = xi + ((lat - yi) / (yj - yi)) * (xj - xi);
      if (lonE < x) inside = !inside;
    }
  }
  return inside;
}

/** Which named ring, if any, contains this position. */
export function containingRing(lat, lonE, rings) {
  for (const r of rings) if (pointInRing(lat, lonE, r.points)) return r.name || "(unnamed ring)";
  return null;
}

/**
 * DISTANCE TO A COASTLINE, to the SEGMENT and not to a stored vertex, via the archive's own
 * geo-segment module. Returns nautical miles and which ring answered — a claim about an
 * inhabited island and a claim about an uninhabited atoll are different claims.
 */
export function distanceToCoastNm(lat, lonE, rings, opts) {
  const o = opts || {};
  if (!rings || !rings.length) return { ok: false, refusal: "NO_SHORELINE_GEOMETRY",
    note: "A named lon/lat is a waypoint, not a shore. Supply polygons." };
  let best = null;
  for (const r of rings) {
    const hit = nearestRingKm(lat, lonE, [r.points]);
    if (!best || hit.km < best.km) best = { km: hit.km, name: r.name || "(unnamed ring)", seg: hit.seg };
  }
  /* AMBIGUOUS SHORE SIDE. When a second, differently-named shore is within the tolerance, the
     question "how far to the coast" has two answers and no reason to prefer one. */
  const tolNm = o.ambiguityToleranceNm ?? 5;
  const others = [];
  for (const r of rings) {
    const nm = (r.name || "(unnamed ring)");
    if (nm === best.name) continue;
    const hit = nearestRingKm(lat, lonE, [r.points]);
    if (Math.abs(hit.km / KM_PER_NM - best.km / KM_PER_NM) < tolNm) others.push({ name: nm, nm: hit.km / KM_PER_NM });
  }
  return {
    ok: true, frame: "great-circle-nm",
    nm: best.km / KM_PER_NM, ring: best.name,
    inside: containingRing(lat, lonE, rings),
    ambiguousShoreSide: others.length > 0 ? others : null,
    refusal: others.length ? "AMBIGUOUS_SHORE_SIDE" : null,
  };
}

/* ---------------------------------------------------------------------------- required rate */

/**
 * THE REQUIRED RATE. Kinematics, printed as kinematics.
 *
 * Distance from a stated position to the nearest point of a stated geometry, divided by the time
 * remaining in a stated window. It says what the storm would have to do. It says nothing about
 * whether it will, and nothing here converts it into a likelihood.
 */
export function requiredRate(from, targetRings, deadlineMs, nowMs, opts) {
  const hours = (deadlineMs - nowMs) / 3600e3;
  if (!(hours > 0)) return { ok: false, refusal: "NONPOSITIVE_TIME_REMAINING", hoursRemaining: hours };
  const d = distanceToCoastNm(from.lat, from.lonE, targetRings, opts);
  if (!d.ok) return { ok: false, refusal: d.refusal };
  if (d.inside) return { ok: true, alreadyInside: d.inside, requiredKt: 0, hoursRemaining: hours,
                         frame: "great-circle-nm", state: "CENTRE ALREADY INSIDE TARGET GEOMETRY" };
  return {
    ok: true, frame: "great-circle-nm",
    distanceNm: d.nm, nearestRing: d.ring, hoursRemaining: hours,
    requiredKt: d.nm / hours,
    ambiguousShoreSide: d.ambiguousShoreSide,
    state: "REQUIRED RATE — KINEMATICS ONLY",
    note: "Distance to the nearest point of the supplied shoreline geometry over the time "
        + "remaining. Not a probability, not a forecast, not a statement that this rate is "
        + "achievable.",
  };
}

/* ----------------------------------------------------------------------- path × geometry */

/**
 * DOES THE ASSUMED PATH ENTER THE TARGET GEOMETRY INSIDE COVERAGE?
 *
 * Densified between forecast nodes so a short island is not stepped over by a twelve-hour
 * segment. Every ambiguity is a refusal, not a choice:
 *
 *   NO_INTERSECTION_IN_COVERAGE   the assumed path never enters, within the forecast's own reach
 *   MULTIPLE_CROSSINGS            it enters more than once — "the" crossing does not exist
 *   RECURVATURE_IN_WINDOW         the course turns more than `maxTurnDeg` inside the window, so a
 *                                 single displacement assumption is not describing one motion
 *   TARGET_BEHIND_STORM           the geometry is astern of the current course at the fix
 */
export function pathIntersection(pathPoints, rings, opts) {
  const o = opts || {};
  const stepMin = o.stepMinutes ?? 15;
  const maxTurnDeg = o.maxTurnDeg ?? 90;
  const pts = (pathPoints || []).filter((p) => Number.isFinite(MS(p.validZ)));
  if (pts.length < 2) return { ok: false, refusal: "TRACK_TOO_SHORT" };
  if (!rings || !rings.length) return { ok: false, refusal: "NO_SHORELINE_GEOMETRY" };

  /* Recurvature: total turning of the path's own course across the window. */
  let turn = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = initialBearingDeg(pts[i - 1].lat, pts[i - 1].lonE, pts[i].lat, pts[i].lonE);
    const b = initialBearingDeg(pts[i].lat, pts[i].lonE, pts[i + 1].lat, pts[i + 1].lonE);
    if (a != null && b != null) turn += Math.abs(deltaBearingDeg(a, b));
  }

  const t0 = MS(pts[0].validZ), tN = MS(pts[pts.length - 1].validZ);
  const entries = [];
  let wasInside = containingRing(pts[0].lat, pts[0].lonE, rings);
  for (let t = t0; t <= tN; t += stepMin * 60000) {
    const at = interpolateAtTime(pts, t);
    if (!at.ok) continue;
    const inside = containingRing(at.lat, at.lonE, rings);
    if (inside && !wasInside) entries.push({ validZ: new Date(t).toISOString(), ring: inside, lat: at.lat, lonE: at.lonE });
    wasInside = inside;
  }

  if (turn > maxTurnDeg)
    return { ok: false, refusal: "RECURVATURE_IN_WINDOW", totalTurnDeg: turn, crossings: entries.length };
  if (entries.length === 0)
    return { ok: false, refusal: "NO_INTERSECTION_IN_COVERAGE", coverage: [pts[0].validZ, pts[pts.length - 1].validZ],
             totalTurnDeg: turn };
  if (entries.length > 1)
    return { ok: false, refusal: "MULTIPLE_CROSSINGS", crossings: entries.length, entries, totalTurnDeg: turn };
  return { ok: true, refusal: null, entry: entries[0], totalTurnDeg: turn,
           stepMinutes: stepMin,
           note: "A centre entering the supplied polygon under a named displacement assumption. "
               + "Conditional geometry, not a landfall forecast." };
}

/**
 * Cut a path at a deadline, keeping an interpolated endpoint exactly at it. Refuses rather than
 * returning a one-point path, because a path with no length has no course and no crossing.
 */
export function truncatePath(points, deadlineMs) {
  const pts = (points || []).filter((p) => Number.isFinite(MS(p.validZ)));
  if (pts.length < 2) return { ok: false, refusal: "TRACK_TOO_SHORT" };
  const t0 = MS(pts[0].validZ), tN = MS(pts[pts.length - 1].validZ);
  if (deadlineMs <= t0) return { ok: false, refusal: "DEADLINE_AT_OR_BEFORE_PATH_START" };
  if (deadlineMs >= tN) return { ok: true, points: pts.slice(), truncated: false };
  const kept = pts.filter((p) => MS(p.validZ) < deadlineMs);
  const at = interpolateAtTime(pts, deadlineMs);
  if (!at.ok) return { ok: false, refusal: at.refusal };
  kept.push({ validZ: new Date(deadlineMs).toISOString(), lat: at.lat, lonE: at.lonE,
              kind: "deadline", interpolated: true });
  return { ok: true, points: kept, truncated: true };
}

/** Is the target astern? Compared against the path's own course at the fix, in one frame. */
export function targetBehind(fromLat, fromLonE, courseDeg, targetLat, targetLonE) {
  const brg = initialBearingDeg(fromLat, fromLonE, targetLat, targetLonE);
  if (brg == null) return { behind: false, refusal: "COINCIDENT_POSITIONS" };
  const rel = Math.abs(deltaBearingDeg(courseDeg, brg));
  return { behind: rel > 90, relativeBearingDeg: rel };
}

/* --------------------------------------------------------------- the assembled closure state */

/**
 * ONE DOCUMENTED TARGET-APPROACH CALCULATION.
 *
 * Everything above, assembled, in one frame, under one named assumption. The result carries the
 * assumption, the geometry it used, the required rate, the intersection verdict and — always —
 * whether the thing scored is the thing a contract would settle on.
 */
export function closure(baseline, residualRecord, target, opts) {
  const o = opts || {};
  const assumption = o.assumption || "forecast-as-issued";
  const rings = target && target.rings;
  const out = {
    target: target && target.label || null,
    assumption, assumptionText: DISPLACEMENT_ASSUMPTIONS[assumption] || null,
    frame: "great-circle-nm",
    /* THE HEADLINE REFUSAL, ALWAYS PRESENT. */
    probability: null,
    probabilityRefusal: "NOT SCOREABLE AS A PROBABILITY — no held-out validation exists for this "
                      + "module, so no P(centre reaches X) is emitted.",
    exactTriggerScored: false,
    exactTriggerNote: "EXACT TRIGGER NOT SCORED",
  };
  if (!rings || !rings.length)
    return { ...out, ok: false, refusal: "NO_SHORELINE_GEOMETRY",
             note: "A named lon/lat is a waypoint, not a shore." };
  if (!residualRecord || !residualRecord.ok)
    return { ...out, ok: false, refusal: "NO_RESIDUAL" };

  const path = assumedPath(baseline, residualRecord, assumption, o);
  if (!path.ok) return { ...out, ok: false, refusal: path.refusal, allowed: path.allowed };

  const fixPos = residualRecord.observed;
  const course = localCourseDeg(coveragePoints(baseline, o), MS(residualRecord.fixValidZ));
  const behind = course.ok
    ? targetBehind(fixPos.lat, fixPos.lonE, course.courseDeg, target.centroidLat, target.centroidLonE)
    : { behind: false };
  if (behind.behind)
    return { ...out, ok: false, refusal: "TARGET_BEHIND_STORM", relativeBearingDeg: behind.relativeBearingDeg };

  /* THE WINDOW BEING ASKED ABOUT, NOT THE WHOLE TRACK.
     Recurvature and intersection are properties of a stretch of path. Testing them over an
     advisory's full five days answers a question nobody asked: Lowell's complete TCM 46 track
     turns 112 degrees, so every closure over it refuses for recurvature — correctly, and
     uselessly. When a deadline is supplied the path is truncated to it first, and the truncation
     is reported, so a refusal is about the window it was asked about. */
  const deadlineMs = o.deadlineMs ?? MS(path.points[path.points.length - 1].validZ);
  const windowed = truncatePath(path.points, deadlineMs);
  if (!windowed.ok) return { ...out, ok: false, refusal: windowed.refusal };
  const inter = pathIntersection(windowed.points, rings, o);
  const rate = requiredRate(fixPos, rings, deadlineMs, MS(residualRecord.fixValidZ), o);

  return {
    ...out,
    ok: true,
    carried: { alongNm: path.carriedAlongNm ?? 0, crossNm: path.carriedCrossNm ?? 0 },
    requiredRate: rate,
    intersection: inter,
    state: inter.ok ? "INTERSECTS UNDER STATED ASSUMPTION — CONDITIONAL"
                    : "UNRESOLVED — " + inter.refusal,
    coverage: [windowed.points[0].validZ, windowed.points[windowed.points.length - 1].validZ],
    fullTrackCoverage: [path.points[0].validZ, path.points[path.points.length - 1].validZ],
    truncatedToDeadline: windowed.truncated,
    knownLimits: [
      "Linear-in-time interpolation between forecast positions.",
      "The displacement assumption is kinematic and unvalidated.",
      "Required rate is arithmetic, not achievability.",
      "Polygon containment is planar in lon/lat, valid at island scale away from the poles.",
    ],
  };
}

/**
 * THE LATITUDE-CROSSING DIAGNOSTIC, KEPT AND FENCED.
 *
 * Returns the time an assumed path crosses a target parallel, with the three refusals attached.
 * The displacement assumption is applied ONCE, to the path, before the crossing is found — the
 * brief's error was to mix a cross-track number into a latitude calculation partway through.
 */
export function latitudeCrossingDiagnostic(baseline, residualRecord, targetLat, opts) {
  const o = opts || {};
  const assumption = o.assumption || "forecast-as-issued";
  const path = assumedPath(baseline, residualRecord, assumption, o);
  if (!path.ok) return { ok: false, refusal: path.refusal, diagnosticOnly: true };
  const hit = interpolateAtLatitude(path.points, targetLat, o);
  return {
    diagnosticOnly: true,
    label: "LATITUDE-CROSSING DIAGNOSTIC — NOT A LANDFALL CLAIM",
    assumption, assumptionText: DISPLACEMENT_ASSUMPTIONS[assumption],
    targetLat,
    ...hit,
    note: "A latitude is not a lead time. The lead below is computed from the path's own valid "
        + "times. A parallel is not a shore: crossing it says nothing about intersecting land.",
  };
}
