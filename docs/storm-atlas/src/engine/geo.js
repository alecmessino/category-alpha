/* Geometry, transliterated from scripts/genesis/retrieval/analogs.py.
 *
 * This file is not "a haversine". It is THAT haversine, and the difference matters: the Atlas
 * publishes analog pools that must agree with the archive's own Python, and every line below is
 * written to reproduce CPython's floating-point behaviour rather than merely its algebra.
 * Three places where the obvious JS is silently different:
 *
 *   1. DEGREES TO RADIANS. CPython's math.radians(x) multiplies by a precomputed pi/180.
 *      Writing `x * Math.PI / 180` in JS evaluates as `(x * Math.PI) / 180`, a different
 *      association and a different last bit. `x * DEG` with DEG folded once reproduces CPython.
 *
 *   2. MODULO. Python's % takes the sign of the DIVISOR; JavaScript's takes the sign of the
 *      dividend. `(-20) % 360` is 340 in Python and -20 in JS, so a naive port puts a storm at
 *      160E on the wrong side of the planet. The antimeridian is exactly where this archive's
 *      Central Pacific work lives, so this is not a theoretical concern.
 *
 *   3. SQUARING. Python's sin(x)**2 goes through libm pow(); x*x is the same double, because
 *      both are the correctly-rounded square, and it is clearer.
 */

export const EARTH_R_KM = 6371.0088;

const DEG = Math.PI / 180;

/** Python's `((lon + 180.0) % 360.0) - 180.0`, with Python's modulo semantics. */
export function wrap180(lon) {
  const x = (lon + 180.0) % 360.0;
  return (x < 0 ? x + 360.0 : x) - 180.0;
}

/**
 * Great-circle distance in km. Handles the antimeridian correctly, which matters here: the
 * Central Pacific search box straddles 180 and a naive planar dlon would put a storm at 179E
 * ten thousand km from one at 179W.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * DEG;
  const p2 = lat2 * DEG;
  const dphi = p2 - p1;
  const dlam = wrap180(lon2 - lon1) * DEG;
  const sp = Math.sin(dphi / 2);
  const sl = Math.sin(dlam / 2);
  const a = sp * sp + Math.cos(p1) * Math.cos(p2) * sl * sl;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1.0, Math.sqrt(a)));
}

/**
 * Human-readable position with hemisphere letters.
 *
 * Signed degrees are correct for arithmetic and wrong for reading: a Central Pacific
 * disturbance printed as "-140.0E" invites exactly the sign confusion this archive spends so
 * much effort avoiding, so every human-facing surface prints hemispheres.
 */
export function formatPosition(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const w = wrap180(lon);
  const ew = w >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}${ns} ${Math.abs(w).toFixed(1)}${ew}`;
}
