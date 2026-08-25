#!/usr/bin/env node
/* THE SEGMENT DISTANCE, WHICH ONE NUMBER IN THE LALA DOSSIER RESTS ON.
 *
 * "Closest approach to the Main Hawaiian Islands: 61 km" is the most quotable line in
 * /dossier/lala, and it is the output of scripts/lib/geo-segment.mjs. The first draft of that
 * dossier measured to the nearest STORED COASTLINE VERTEX, which answers a different question:
 * the error is a function of how finely the coastline happens to be sampled, it is always
 * positive, and it lands directly on the number a reader would quote.
 *
 * The function has two branches and the dangerous one is silent. If the arc-containment test
 * always answered "no", every call would quietly return the nearer ENDPOINT — the vertex
 * distance again, now wearing the word "segment". Nothing would throw and every distance would
 * still look plausible. So the interior branch is asserted to actually fire, with a value that
 * is verifiably the perpendicular distance and not either endpoint.
 *
 * Run: node scripts/test-geo-segment.mjs
 */
import { EARTH_R_KM, haversineKm } from "../docs/storm-atlas/src/engine/geo.js";
import { nearestRingKm, pointToArcKm, toVec } from "./lib/geo-segment.mjs";

let failed = 0;
let checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  if (cond) { console.log("  ok    " + label); return; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};
const near = (label, got, want, tolKm) =>
  ok(`${label} — ${got.toFixed(3)} km vs ${want.toFixed(3)} km`, Math.abs(got - want) <= tolKm,
    `differs by ${Math.abs(got - want).toFixed(4)} km, tolerance ${tolKm}`);

const arc = (pLat, pLon, aLat, aLon, bLat, bLon) =>
  pointToArcKm(toVec(pLat, pLon), toVec(aLat, aLon), toVec(bLat, bLon));

console.log("\n[1] the endpoints and the degenerate cases");
near("a point sitting on A", arc(0, 0, 0, 0, 0, 10), 0, 1e-9);
near("a point sitting on B", arc(0, 10, 0, 0, 0, 10), 0, 1e-9);
near("a point past B falls back to B", arc(0, 20, 0, 0, 0, 10), haversineKm(0, 20, 0, 10), 1e-6);
near("a point before A falls back to A", arc(0, -20, 0, 0, 0, 10), haversineKm(0, -20, 0, 0), 1e-6);
/* Closed rings repeat their first vertex at the seam, so A == B reaches this function. */
near("a zero-length segment is a point", arc(5, 5, 0, 0, 0, 0), haversineKm(5, 5, 0, 0), 1e-6);

console.log("\n[2] THE INTERIOR BRANCH ACTUALLY FIRES");
{
  /* An equatorial segment and a point one degree north of its midpoint. The perpendicular foot
     is at (0N, 5E), inside the arc, so the answer must be one degree of latitude — and must be
     strictly LESS than either endpoint, which is the whole reason the branch exists. */
  const got = arc(1, 5, 0, 0, 0, 10);
  const perpendicular = haversineKm(1, 5, 0, 5);
  const nearerEndpoint = Math.min(haversineKm(1, 5, 0, 0), haversineKm(1, 5, 0, 10));
  near("perpendicular foot inside the arc", got, perpendicular, 0.5);
  ok("and it beats the nearer endpoint, so the branch is not a no-op",
    got < nearerEndpoint - 1,
    `segment ${got.toFixed(2)} km vs nearest endpoint ${nearerEndpoint.toFixed(2)} km`);
}

console.log("\n[3] containment is decided correctly, both ways");
{
  /* A 4.8 km segment off Hawaii Island and a point 61 km west of it — the real geometry from
     the dossier. The foot lies 11.1 km from A along a 4.8 km arc, so it is OUTSIDE, and the
     answer must be the endpoint rather than the (smaller) distance to the great circle. A
     function that skipped the containment test would report ~60.77 km here. */
  const got = arc(19.1, -156.5, 19.0962, -155.9121, 19.1386, -155.9199);
  const endpoint = Math.min(haversineKm(19.1, -156.5, 19.0962, -155.9121),
    haversineKm(19.1, -156.5, 19.1386, -155.9199));
  near("a foot beyond the arc returns the endpoint, not the great circle", got, endpoint, 1e-6);
  ok("and it is NOT the great-circle distance", Math.abs(got - 60.77) > 0.2,
    `${got.toFixed(3)} km — 60.77 km would mean containment was never tested`);
}

console.log("\n[4] the invariant that makes the correction worth making");
{
  /* Distance to a segment can never exceed distance to the nearest vertex of the same polyline:
     the vertices are ON the segments. Asserted over a coarse ring where the two differ a lot. */
  const ring = [[0, 0], [0, 10], [5, 10], [5, 0]];
  const verts = () => Math.min(...ring.map(([la, lo]) => haversineKm(2.5, 5, la, lo)));
  const seg = nearestRingKm(2.5, 5, [ring]).km;
  ok("segment distance <= nearest-vertex distance", seg <= verts() + 1e-9,
    `segment ${seg.toFixed(2)} km, nearest vertex ${verts().toFixed(2)} km`);
  ok("and on a coarse ring the two genuinely differ", verts() - seg > 10,
    `difference ${(verts() - seg).toFixed(2)} km — if this is ~0 the test proves nothing`);
}

console.log("\n[5] the ring is closed");
{
  /* The seam segment — last vertex back to first — is coastline like any other. A ring treated
     as an open polyline would leave a gap a track could pass through unmeasured. */
  const ring = [[0, 0], [0, 10], [10, 10], [10, 0]];
  /* A point just outside the seam edge (the 0E meridian side, between lat 0 and 10). */
  const got = nearestRingKm(5, -1, [ring]).km;
  near("a point beside the closing edge measures to that edge", got, haversineKm(5, -1, 5, 0), 1.0);
}

console.log("\n[6] the radius is the archive's, not a second opinion");
{
  const quarter = pointToArcKm(toVec(90, 0), toVec(0, 0), toVec(0, 0));
  near("pole to equator is a quarter meridian", quarter, (Math.PI / 2) * EARTH_R_KM, 1e-6);
}

console.log(failed
  ? `\n${failed} of ${checks} segment-distance check(s) failed\n`
  : `\n${checks} checks: distances are to the coastline, not to its stored vertices\n`);
process.exit(failed ? 1 : 0);
