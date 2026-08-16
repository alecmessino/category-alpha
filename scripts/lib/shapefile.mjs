/* Minimal zip + shapefile reader, for NHC's graphical Tropical Weather Outlook.
 *
 * The text outlook gives a probability and a prose location ("Western Portion of the East
 * Pacific"). It carries no coordinates, so the map could only ever list the areas — the branch
 * that tried to plot them read a.lat/a.lon, which never existed.
 *
 * gtwo_shapefiles.zip carries the actual polygons NHC draws, plus a .dbf with basin, area
 * number and both probabilities. That joins to the parsed text on (basin, area number).
 *
 * No dependency: the zip entries are deflate, which zlib already does. No fetch and no clock
 * in here — the caller supplies the bytes, so this stays testable against a fixture.
 */
import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50, CEN = 0x02014b50, LOC = 0x04034b50;

/* Entries come from the CENTRAL DIRECTORY, not the local headers. A local header may carry
   zero sizes and defer them to a trailing data descriptor; the central directory always has
   the real ones. */
export function unzipEntries(buf) {
  const out = {};
  if (!buf || buf.length < 22) return out;
  let eo = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eo = i; break; }
  }
  if (eo < 0) return out;
  const count = buf.readUInt16LE(eo + 10);
  let p = buf.readUInt32LE(eo + 16);
  for (let k = 0; k < count && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== CEN) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString("latin1");
    p += 46 + nlen + elen + clen;
    if (buf.readUInt32LE(lo) !== LOC) continue;
    const lnlen = buf.readUInt16LE(lo + 26), lelen = buf.readUInt16LE(lo + 28);
    const start = lo + 30 + lnlen + lelen;
    const raw = buf.slice(start, start + csize);
    try {
      out[name] = method === 8 ? inflateRawSync(raw) : method === 0 ? raw : null;
    } catch { out[name] = null; }
    if (out[name] == null) delete out[name];
  }
  return out;
}

/* .shp polygons. Rings come back as [lat, lon] because that is what Leaflet and the rest of
   this repo use; the file itself stores X=lon, Y=lat. */
export function parsePolygons(shp) {
  const out = [];
  if (!shp || shp.length < 100) return out;
  let p = 100;
  while (p + 8 <= shp.length) {
    const clen = shp.readInt32BE(p + 4) * 2;
    const c = p + 8;
    if (c + 44 > shp.length) break;
    const type = shp.readInt32LE(c);
    if (type === 5 || type === 15 || type === 25) {          // Polygon / PolygonZ / PolygonM
      const nparts = shp.readInt32LE(c + 36), npts = shp.readInt32LE(c + 40);
      if (nparts > 0 && npts > 0) {
        const parts = [];
        for (let k = 0; k < nparts; k++) parts.push(shp.readInt32LE(c + 44 + k * 4));
        const po = c + 44 + nparts * 4;
        const rings = [];
        for (let k = 0; k < nparts; k++) {
          const a = parts[k], b = k + 1 < nparts ? parts[k + 1] : npts;
          const ring = [];
          for (let i = a; i < b; i++) {
            ring.push([shp.readDoubleLE(po + i * 16 + 8), shp.readDoubleLE(po + i * 16)]);
          }
          if (ring.length >= 3) rings.push(ring);
        }
        if (rings.length) {
          out.push({ rings, bbox: [0, 1, 2, 3].map((k) => shp.readDoubleLE(c + 4 + k * 8)) });
        }
      }
    }
    if (clen <= 0) break;
    p = c + clen;
  }
  return out;
}

/* .dbf attribute table. Only the character fields matter here. */
export function parseDbf(dbf) {
  const out = [];
  if (!dbf || dbf.length < 32) return out;
  const nrec = dbf.readInt32LE(4), hlen = dbf.readInt16LE(8), rlen = dbf.readInt16LE(10);
  if (!nrec || !hlen || !rlen) return out;
  const fields = [];
  for (let p = 32; p < hlen - 1 && dbf[p] !== 0x0d; p += 32) {
    fields.push({ name: dbf.slice(p, p + 11).toString("latin1").replace(/\0.*/s, "").trim(),
                  len: dbf[p + 16] });
  }
  for (let i = 0; i < nrec; i++) {
    let p = hlen + i * rlen;
    if (p + rlen > dbf.length) break;
    if (dbf[p] === 0x2a) continue;                            // deleted record
    p += 1;
    const r = {};
    for (const f of fields) { r[f.name] = dbf.slice(p, p + f.len).toString("latin1").trim(); p += f.len; }
    out.push(r);
  }
  return out;
}

const pct = (s) => { const m = /(\d+)/.exec(String(s || "")); return m ? Number(m[1]) : null; };

/* The whole product, joined: one entry per outlook area with its polygon.
 *
 * The .shp and .dbf are parallel arrays — record i of the table describes polygon i — so a
 * length mismatch means the bundle is not self-consistent and the pairing would be a guess.
 * Return nothing rather than mis-attribute a probability to the wrong blob. */
export function parseOutlookShapes(zipBuf) {
  const files = unzipEntries(zipBuf);
  const shpName = Object.keys(files).find((n) => /areas.*\.shp$/i.test(n));
  const dbfName = Object.keys(files).find((n) => /areas.*\.dbf$/i.test(n));
  if (!shpName || !dbfName) return { areas: [], issued: null, note: "no gtwo_areas layer in bundle" };
  const polys = parsePolygons(files[shpName]);
  const rows = parseDbf(files[dbfName]);
  if (polys.length !== rows.length) {
    return { areas: [], issued: null,
             note: `bundle not self-consistent: ${polys.length} polygons, ${rows.length} attribute rows` };
  }
  const stamp = /(\d{12})/.exec(shpName);
  const areas = rows.map((r, i) => ({
    basin: String(r.BASIN || "").toLowerCase(),
    n: Number(r.AREA) || null,
    pct48: pct(r.PROB2DAY),
    pct7d: pct(r.PROB7DAY),
    rings: polys[i].rings,
    bbox: polys[i].bbox,
  }));
  return { areas, issued: stamp ? stamp[1] : null, note: `${areas.length} outlook area(s)` };
}

/* Join geometry onto the areas the text outlook already produced.
 *
 * The text is authoritative for wording and probability — it is the product NHC actually
 * publishes. This only adds rings. An area with no matching polygon keeps its text entry and
 * simply is not drawn, which is the honest outcome; a polygon with no matching text is
 * dropped, because there is nothing to label it with. */
export function attachShapes(textAreas, shapeAreas) {
  const byKey = new Map();
  for (const s of shapeAreas || []) if (s.n != null) byKey.set(s.basin + "#" + s.n, s);
  let matched = 0;
  const areas = (textAreas || []).map((a) => {
    const s = byKey.get(String(a.basin || "").toLowerCase() + "#" + a.n);
    if (!s) return a;
    matched++;
    return Object.assign({}, a, { rings: s.rings, bbox: s.bbox });
  });
  return { areas, matched, unmatched: (textAreas || []).length - matched };
}
