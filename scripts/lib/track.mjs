/* DOES THE CENTRE CROSS A COASTLINE — Phase 1 of docs/PLAN-TRACK-MODEL.md.
 *
 * Everything else on this board prices INTENSITY ("does it reach 65 kt"). Every contract
 * actually traded is a TRACK question ("does the centre cross a coastline"). This is the
 * missing half. It answers only the geometry; it does not produce a probability, and
 * nothing here may be composed into one until the backtest has scored it.
 *
 * NHC's definition is the one implemented: LANDFALL IS THE CENTRE CROSSING THE COASTLINE.
 * An eyewall over land is not a landfall. Lala put its eyewall across the southern Big
 * Island, did 13 inches of rain and hurricane-force gusts, and did not make landfall.
 *
 * ---------------------------------------------------------------------------------------
 * THE TRAP, AND WHY THE ANSWER IS THREE-WAY RATHER THAN A BOOLEAN
 *
 * An a-deck stores positions every 6 hours. A straight line between two 6-hourly points is
 * an INTERPOLATION ARTEFACT — it is not a claim by the model about the path taken. A model
 * whose centre-tracker loses a vortex east of an island and re-acquires a new vorticity
 * maximum west of it emits exactly the same two points as a physical traverse.
 *
 * On Lala this was not hypothetical: seven of nine "landfall" members in one cycle crossed
 * only because that interpolated line cut the island, at implied leg speeds of 15-19 kt
 * against a storm translating 7-8 kt. A crossesCoast() returning a boolean would have
 * priced those seven as landfalls.
 *
 * So a crossing is reported as one of:
 *
 *   "landfall" — the centre crossed, and the leg that did it is consistent with how fast
 *                this storm is actually moving.
 *   "suspect"  — the centre crossed on paper, but the leg implies a translation speed the
 *                storm is not doing. Likelier a centre relocation than a traverse.
 *   "none"     — the centre stayed offshore.
 *
 * ---------------------------------------------------------------------------------------
 * THE GATE IS NOT CALIBRATED YET, AND IT SAYS SO
 *
 * The repo's own rule, written after the consensus blend rode the live edge book for two
 * days and turned out to be noise: DO NOT SHIP A MODEL BEFORE THE BACKTEST SCORES IT. A
 * speed-ratio threshold picked here would be a number chosen to make the Lala anecdote come
 * out right, which is precisely the failure mode.
 *
 * So `calibrated` defaults to FALSE and in that state every crossing returns "suspect" and
 * `cleanCount` is 0. The gate arithmetic runs and is reported, so a fixture can score it —
 * it simply does not get to call anything a landfall until it has been scored. Turn it on
 * only from a caller that has evidence, by passing { calibrated: true, ratio }.
 */

const NM_PER_DEG = 60;
const R_NM = 3440.065;

/* Great-circle distance in nautical miles. */
export function distanceNm(a, b) {
  if (!a || !b) return null;
  const [la1, lo1] = a, [la2, lo2] = b;
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return null;
  const p1 = (la1 * Math.PI) / 180, p2 = (la2 * Math.PI) / 180;
  const dp = p2 - p1, dl = ((lo2 - lo1) * Math.PI) / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Ray casting. Rings are [lat, lon]; the test runs in lon/lat with longitude scaled so a
   degree of longitude is not treated as a degree of latitude near the poles — irrelevant to
   the inside/outside answer, but it keeps the same convention as everything below. */
export function pointInRing(pt, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const [la, lo] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ai, oi] = ring[i], [aj, oj] = ring[j];
    /* Strictly-above test on one endpoint and not the other: a vertex exactly on the ray is
       counted once rather than twice, which is what stops a track that clips a vertex from
       reading as two crossings and cancelling itself out. */
    if ((oi > lo) !== (oj > lo)) {
      const x = ai + ((lo - oi) / (oj - oi)) * (aj - ai);
      if (la < x) inside = !inside;
    }
  }
  return inside;
}

/* Is this position on land, per the vendored coastline?
   Regions are checked whole — a region whose rings include an inner ring (a lake) would
   toggle correctly by the same parity rule. */
export function pointOnLand(lat, lon, regions) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const region of regions || []) {
    let inside = false;
    for (const ring of region.rings || []) if (pointInRing([lat, lon], ring)) inside = !inside;
    if (inside) return region;
  }
  return null;
}

/* Segment-segment intersection in (lon, lat), returning the parametric position along a->b
   so the crossing point and the fraction of the leg at which it happened are both known.
   Longitude is scaled by cos(mean lat) so a diagonal leg is not distorted. */
function segmentHit(a, b, p, q) {
  const s = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180) || 1;
  const ax = a[1] * s, ay = a[0], bx = b[1] * s, by = b[0];
  const px = p[1] * s, py = p[0], qx = q[1] * s, qy = q[0];
  const rx = bx - ax, ry = by - ay, sx = qx - px, sy = qy - py;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;                 // parallel or degenerate
  const t = ((px - ax) * sy - (py - ay) * sx) / den;
  const u = ((px - ax) * ry - (py - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, lat: ay + t * ry, lon: (ax + t * rx) / s };
}

/* Every coastline crossing on one leg, in the order they occur along it. */
export function legCrossings(a, b, regions) {
  const hits = [];
  for (const region of regions || []) {
    for (const ring of region.rings || []) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const h = segmentHit(a, b, ring[j], ring[i]);
        if (h) hits.push({ ...h, region: region.id, regionName: region.name });
      }
    }
  }
  return hits.sort((x, y) => x.t - y.t);
}

/* HOW FAST THIS STORM IS ACTUALLY MOVING, from the track itself rather than from a constant.
 *
 * LEAVE-ONE-OUT, AND THAT IS THE WHOLE POINT. A relocation leg is fast, and if it is
 * included in the median it raises the very bar it is about to be measured against. On a
 * three-point member with legs of 6.6 and 17.9 kt the pooled median is 12.3, so the 17.9 kt
 * jump scores a ratio of 1.46 and walks under any sane threshold — the artefact hides
 * inside its own reference. Excluding the leg under test gives 17.9/6.6 = 2.7 and it is
 * caught. This was found by the test in [6] failing, not by reasoning about it.
 *
 * Legs with no elapsed time are dropped rather than treated as infinite. */
export function legSpeedsKt(points) {
  const v = [];
  for (let i = 1; i < (points || []).length; i++) {
    const a = points[i - 1], b = points[i];
    const dt = b.hr - a.hr;
    if (!(dt > 0)) { v.push(null); continue; }
    const d = distanceNm([a.lat, a.lon], [b.lat, b.lon]);
    v.push(d == null ? null : d / dt);
  }
  return v;
}
function medianOf(v) {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function referenceSpeedKt(points, excludeLeg) {
  const v = legSpeedsKt(points);
  return medianOf(Number.isInteger(excludeLeg) ? v.filter((_, i) => i !== excludeLeg) : v);
}

/* THE ANSWER.
 *
 * points: [{ hr, lat, lon, kt? }] in increasing hr — a member's forecast track, or an
 *         observed track. kt is carried through to the crossing so a caller can ask what
 *         the intensity was AT the crossing, which is the half of the contract that the
 *         intensity engine cannot answer on its own.
 * coastline: { regions: [...] } as built by scripts/build-coastline.mjs.
 */
export function crossesCoast(points, coastline, opts) {
  const o = opts || {};
  const regions = (coastline && coastline.regions) || [];
  const pts = (points || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
                                              && Number.isFinite(p.hr))
                            .sort((a, b) => a.hr - b.hr);
  const out = {
    verdict: "none", crossings: [], cleanCount: 0, suspectCount: 0,
    refSpeedKt: null, closestNm: null, closestRegion: null,
    calibrated: !!o.calibrated, ratio: Number.isFinite(o.ratio) ? o.ratio : null,
    note: null,
  };
  if (pts.length < 2) { out.note = "fewer than two usable positions — no leg to test"; return out; }

  const ref = referenceSpeedKt(pts);
  out.refSpeedKt = ref == null ? null : Math.round(ref * 10) / 10;

  /* Closest approach of the CENTRE to any coast, sampled at the track's own points. Not the
     contract's question, but it is the number that separates "nearly" from "not remotely"
     and it is what an operator asks first. */
  for (const p of pts) {
    for (const region of regions) {
      for (const ring of region.rings || []) {
        for (const v of ring) {
          const d = distanceNm([p.lat, p.lon], v);
          if (d != null && (out.closestNm == null || d < out.closestNm)) {
            out.closestNm = d; out.closestRegion = region.id;
          }
        }
      }
    }
  }
  if (out.closestNm != null) out.closestNm = Math.round(out.closestNm * 10) / 10;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dt = b.hr - a.hr;
    const hits = legCrossings([a.lat, a.lon], [b.lat, b.lon], regions);
    if (!hits.length) continue;
    const startedOnLand = !!pointOnLand(a.lat, a.lon, regions);
    /* An ENTRY is what a landfall is. A leg that begins on land and exits is a departure,
       and a leg that enters and exits is a traverse — both contain an entry unless the leg
       started ashore. */
    const entry = startedOnLand ? null : hits[0];
    if (!entry) continue;

    const d = distanceNm([a.lat, a.lon], [b.lat, b.lon]);
    const legKt = dt > 0 && d != null ? d / dt : null;
    /* Measured against the OTHER legs, never against a median this leg helped set. */
    const legRef = referenceSpeedKt(pts, i - 1);
    const ratio = legKt != null && legRef ? legKt / legRef : null;

    /* THE GATE. A leg implying a translation far above what this storm is doing did not
       carry the centre across anything — it is two positions with a relocation between
       them. The threshold is the caller's, and absent one nothing is called clean. */
    let status;
    if (!out.calibrated) {
      status = "suspect";
    } else if (ratio == null) {
      status = "suspect";
    } else {
      status = ratio > out.ratio ? "suspect" : "landfall";
    }

    out.crossings.push({
      fromHr: a.hr, toHr: b.hr,
      lat: Math.round(entry.lat * 1000) / 1000, lon: Math.round(entry.lon * 1000) / 1000,
      region: entry.region, regionName: entry.regionName,
      /* Intensity at the crossing, interpolated along the leg. This is what makes a JOINT
         crossing-AND-intensity question answerable without multiplying two marginals. */
      ktAtCrossing: (Number.isFinite(a.kt) && Number.isFinite(b.kt))
        ? Math.round((a.kt + (b.kt - a.kt) * entry.t) * 10) / 10
        : (Number.isFinite(a.kt) ? a.kt : null),
      legKt: legKt == null ? null : Math.round(legKt * 10) / 10,
      refKt: legRef == null ? null : Math.round(legRef * 10) / 10,
      ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
      status,
    });
  }

  out.cleanCount = out.crossings.filter((c) => c.status === "landfall").length;
  out.suspectCount = out.crossings.filter((c) => c.status === "suspect").length;
  out.verdict = out.cleanCount ? "landfall" : out.suspectCount ? "suspect" : "none";
  if (!out.calibrated && out.crossings.length) {
    out.note = "speed gate is UNCALIBRATED — every crossing is reported suspect and none is "
             + "counted clean. Pass { calibrated: true, ratio } only from a caller with a "
             + "scored threshold.";
  }
  return out;
}
