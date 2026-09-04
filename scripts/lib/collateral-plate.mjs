/* PLATES. Coastline, analog tracks, the queried cell, and the live system — drawn, and never
 * confused with a rate.
 *
 * Three rules this file exists to keep:
 *   1. A DRAWN TRACK IS NOT A RATE. Tracks come from `all_member_tracks` / `tracks`; nothing on
 *      a plate is derived from an outcome frequency and no plate is ever the source of one.
 *   2. THE LIVE SYSTEM IS DRAWN IN ITS OWN INK, AND LABELLED. Historical geometry is archive
 *      geometry; the live position and the NHC outlook polygon are operational and are marked
 *      LIVE with their own instants. They never share a stroke with history.
 *   3. NO FORECAST GEOMETRY. No cone, no track forecast, no extrapolation. The only forward-
 *      looking shape any plate carries is the NHC outlook AREA, drawn as the live observation
 *      it is and captioned as NHC's, not as an analog.
 *
 * Projection is plate carrée with the x axis scaled by cos(reference latitude) — stated on
 * every plate, because an unstated projection is a quiet claim about distance.
 */

const R_EARTH_KM = 6371.0088;

export function projector({ lon0, lon1, lat0, lat1, width, height, pad = 0 }) {
  const latRef = (lat0 + lat1) / 2;
  const kx = Math.cos((latRef * Math.PI) / 180);
  const w = width - pad * 2;
  const h = height - pad * 2;
  const sx = w / ((lon1 - lon0) * kx);
  const sy = h / (lat1 - lat0);
  const s = Math.min(sx, sy);
  const cx = pad + w / 2;
  const cy = pad + h / 2;
  const mlon = (lon0 + lon1) / 2;
  const mlat = (lat0 + lat1) / 2;
  const P = (lon, lat) => [
    cx + (lon - mlon) * kx * s,
    cy - (lat - mlat) * s,
  ];
  P.scale = s;
  P.kx = kx;
  P.latRef = latRef;
  P.bounds = { lon0, lon1, lat0, lat1 };
  P.size = { width, height };
  /* Kilometres per projected unit at the reference latitude, so a radius circle is drawn at the
     scale the query actually used rather than at an eyeballed one. */
  P.kmPerDeg = (Math.PI / 180) * R_EARTH_KM;
  return P;
}

const f2 = (n) => (Math.round(n * 100) / 100);

/** Coastline rings inside the frame, decimated to the plate's own resolution. */
export function coastPath(coast, P, { decimate = 1 } = {}) {
  const { lon0, lon1, lat0, lat1 } = P.bounds;
  const out = [];
  for (let r = 0; r < coast.nRings; r++) {
    const a = coast.ringOffset[r];
    const b = coast.ringOffset[r + 1];
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (let k = a; k < b; k++) {
      const lo = coast.lon[k], la = coast.lat[k];
      if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
      if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
    }
    if (maxLon < lon0 || minLon > lon1 || maxLat < lat0 || minLat > lat1) continue;
    const span = Math.max(maxLon - minLon, maxLat - minLat);
    /* Rings smaller than a plate pixel are dropped rather than drawn as specks. The drop is
       geometric only: no landfall contract is evaluated here, so nothing measurable is lost. */
    const degPerPx = 1 / P.scale;
    if (span < degPerPx * 1.5) continue;
    const step = Math.max(1, decimate);
    let d = "";
    let n = 0;
    for (let k = a; k < b; k += step) {
      const [x, y] = P(coast.lon[k], coast.lat[k]);
      d += (n++ ? "L" : "M") + f2(x) + " " + f2(y);
    }
    if (n < 3) continue;
    out.push(d + "Z");
  }
  return out;
}

/** A storm's track as an SVG path. Antimeridian-safe: the pack stores signed longitudes and a
 *  track that crosses it is split rather than drawn back across the whole plate. */
export function trackPath(points, P) {
  const segs = [];
  let cur = "";
  let n = 0;
  let prevLon = null;
  for (const [lon, lat] of points) {
    if (prevLon !== null && Math.abs(lon - prevLon) > 180) {
      if (n > 1) segs.push(cur);
      cur = ""; n = 0;
    }
    const [x, y] = P(lon, lat);
    cur += (n++ ? "L" : "M") + f2(x) + " " + f2(y);
    prevLon = lon;
  }
  if (n > 1) segs.push(cur);
  return segs;
}

/** A great-circle radius ring around a point, sampled — the query's actual radius, not a
 *  decorative circle. */
export function radiusRing(lat, lon, radiusKm, P, steps = 180) {
  const d = radiusKm / R_EARTH_KM;
  const la1 = (lat * Math.PI) / 180;
  const lo1 = (lon * Math.PI) / 180;
  let out = "";
  for (let i = 0; i <= steps; i++) {
    const brg = (i / steps) * 2 * Math.PI;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(brg));
    const lo2 = lo1 + Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    const [x, y] = P((lo2 * 180) / Math.PI, (la2 * 180) / Math.PI);
    out += (i ? "L" : "M") + f2(x) + " " + f2(y);
  }
  return out + "Z";
}

export function ringPath(ring, P) {
  let d = "";
  ring.forEach(([lon, lat], i) => {
    const [x, y] = P(lon, lat);
    d += (i ? "L" : "M") + f2(x) + " " + f2(y);
  });
  return d + "Z";
}

/** Graticule, labelled. A plate without one is a picture; with one it is a chart. */
export function graticule(P, { dLon = 10, dLat = 10 } = {}) {
  const { lon0, lon1, lat0, lat1 } = P.bounds;
  const lines = [];
  const labels = [];
  for (let lo = Math.ceil(lon0 / dLon) * dLon; lo <= lon1; lo += dLon) {
    const [x1, y1] = P(lo, lat0);
    const [x2, y2] = P(lo, lat1);
    lines.push(`M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`);
    labels.push({ x: f2(x1), y: f2(y1) + 13, text: `${Math.abs(lo)}°W`, anchor: "middle" });
  }
  for (let la = Math.ceil(lat0 / dLat) * dLat; la <= lat1; la += dLat) {
    const [x1, y1] = P(lon0, la);
    const [x2, y2] = P(lon1, la);
    lines.push(`M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`);
    labels.push({ x: f2(x1) + 5, y: f2(y1) - 4, text: `${la}°N`, anchor: "start" });
  }
  return { lines, labels };
}

export const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

export { f2 };
