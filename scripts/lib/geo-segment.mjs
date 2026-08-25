/* Minimum geodesic distance from a point to a POLYLINE SEGMENT, not to a stored vertex.
 *
 * WHY THIS EXISTS. Measuring to the nearest stored vertex answers a different question from
 * "how close did the storm come to the coast", and the gap between the two is a function of how
 * finely the coastline happens to be sampled. The archive's `hawaii` region carries 651 vertices
 * across 14 rings; along a stretch where consecutive vertices sit 20 km apart, a track passing
 * midway between them measures up to ~10 km further from the nearest VERTEX than from the COAST.
 * That error is silent, always positive, and lands directly on the one number a reader would
 * quote. So the distance is taken to the segment.
 *
 * THE METHOD IS 3D VECTOR, NOT CROSS-TRACK TRIGONOMETRY. The textbook cross-track formula needs
 * a sign convention for the along-track term and degrades near the endpoints and near-antipodal
 * cases. Converting to unit vectors on the sphere makes the containment test two dot products
 * and removes every branch that would otherwise need a tolerance:
 *
 *   n  = A x B                  the normal of the great circle through A and B
 *   P' = P - (P . n^) n^        P projected onto that great circle, renormalised
 *   P' is ON the minor arc when (A x P') . n >= 0 and (P' x B) . n >= 0
 *
 * When P' is on the arc the distance is the angle between P and P'. When it is not, the closest
 * point is whichever endpoint is nearer, which is what the final line returns.
 *
 * A degenerate segment (A == B, which closed rings produce at the seam) falls back to the point
 * distance rather than dividing by a zero-length normal.
 *
 * The radius is the archive's own EARTH_R_KM, so a distance computed here and a distance computed
 * by haversineKm cannot disagree about the size of the planet.
 */

import { EARTH_R_KM } from "../../docs/storm-atlas/src/engine/geo.js";

const DEG = Math.PI / 180;

/** Lat/lon in degrees to a unit vector. */
export function toVec(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  const c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => Math.sqrt(dot(a, a));
function unit(a) {
  const m = norm(a);
  return m === 0 ? null : [a[0] / m, a[1] / m, a[2] / m];
}

/** Central angle between two unit vectors, numerically stable at small angles. */
function angleBetween(a, b) {
  const c = cross(a, b);
  return Math.atan2(norm(c), dot(a, b));
}

/**
 * Minimum great-circle distance in km from unit-vector P to the minor arc AB.
 *
 * @param {number[]} P unit vector
 * @param {number[]} A unit vector
 * @param {number[]} B unit vector
 */
export function pointToArcKm(P, A, B) {
  const n = cross(A, B);
  const nu = unit(n);
  /* A zero-length normal means A and B are the same point (or antipodal, which a coastline
     segment never is). There is no arc to project onto, so the endpoint IS the answer. */
  if (!nu) return angleBetween(P, A) * EARTH_R_KM;

  const d = dot(P, nu);
  const proj = unit([P[0] - d * nu[0], P[1] - d * nu[1], P[2] - d * nu[2]]);
  if (proj) {
    /* On the minor arc? Both cross products must point the same way as the normal. */
    const onArc = dot(cross(A, proj), n) >= 0 && dot(cross(proj, B), n) >= 0;
    if (onArc) return angleBetween(P, proj) * EARTH_R_KM;
  }
  return Math.min(angleBetween(P, A), angleBetween(P, B)) * EARTH_R_KM;
}

/**
 * Minimum distance in km from one lat/lon to a set of rings.
 *
 * `rings` is an array of arrays of [lat, lon]. Each ring is treated as CLOSED: the segment from
 * its last vertex back to its first is included, because these are island outlines and the seam
 * is coastline like any other.
 *
 * Returns {km, ring, seg} so a caller can say WHICH ring answered — the difference between an
 * inhabited island and an uninhabited atoll is the whole point of partitioning them.
 */
export function nearestRingKm(lat, lon, rings) {
  const P = toVec(lat, lon);
  let best = { km: Infinity, ring: -1, seg: -1 };
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    if (ring.length === 0) continue;
    if (ring.length === 1) {
      const km = angleBetween(P, toVec(ring[0][0], ring[0][1])) * EARTH_R_KM;
      if (km < best.km) best = { km, ring: r, seg: 0 };
      continue;
    }
    let A = toVec(ring[0][0], ring[0][1]);
    const first = A;
    for (let k = 1; k <= ring.length; k++) {
      const v = k === ring.length ? ring[0] : ring[k];
      const B = k === ring.length ? first : toVec(v[0], v[1]);
      const km = pointToArcKm(P, A, B);
      if (km < best.km) best = { km, ring: r, seg: k - 1 };
      A = B;
    }
  }
  return best;
}
