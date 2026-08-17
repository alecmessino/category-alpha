#!/usr/bin/env node
/* Vendor the coastline the landfall test runs against.
 *
 * Source: US Census cartographic boundary file, 1:500k, state level. It is authoritative,
 * public, versioned, and it parses with scripts/lib/shapefile.mjs exactly as it stands —
 * the reader written for NHC's outlook polygons handles it with no new code and no
 * dependency.
 *
 *   https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip
 *
 * WHY STATE POLYGONS AND NOT A DISSOLVED COASTLINE. A landfall test asks "was the centre
 * outside all land and then inside some land". Interior boundaries are invisible to that
 * question: a track crossing Georgia into Florida is inside land on both sides and never
 * registers. So the union of state polygons is equivalent to a dissolved outline here, and
 * dissolving would be work done to produce the same answer.
 *
 * HAWAII IS KEPT AT FULL RESOLUTION. It is what the board actually trades, the islands are
 * small enough that decimation would move the coast by a meaningful fraction of an island,
 * and the whole state is 2,761 vertices.
 *
 * CONUS IS DECIMATED, and the tolerance is stated rather than tuned to a file size. At
 * 165,097 raw vertices it is ~3 MB of JSON for a test whose own input — a 6-hourly model
 * track — is far coarser than the coast it is being compared against.
 *
 * Run: node scripts/build-coastline.mjs
 * Writes: docs/data/coastline.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipEntries, parsePolygons, parseDbf } from "./lib/shapefile.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, "../docs/data/coastline.json");
const SRC = "https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip";

/* Not the mainland, and not tested against. AK is out because no Atlantic or Pacific
   hurricane contract resolves on it; the territories are out for the same reason and can be
   added the day one does. */
const EXCLUDE = new Set(["AK", "PR", "VI", "GU", "AS", "MP"]);

/* Ramer-Douglas-Peucker, in degrees. Longitude is scaled by cos(lat) so the tolerance is a
   real distance rather than a larger one near the equator than at the pole. */
function rdp(ring, tolDeg) {
  if (ring.length < 3) return ring;
  const latScale = Math.cos((ring[0][0] * Math.PI) / 180) || 1;
  const d2 = (p, a, b) => {
    const px = (p[1] - a[1]) * latScale, py = p[0] - a[0];
    const bx = (b[1] - a[1]) * latScale, by = b[0] - a[0];
    const L = bx * bx + by * by;
    if (L === 0) return px * px + py * py;
    let t = (px * bx + py * by) / L;
    t = Math.max(0, Math.min(1, t));
    const dx = px - t * bx, dy = py - t * by;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  const tol2 = tolDeg * tolDeg;
  while (stack.length) {
    const [i, j] = stack.pop();
    let worst = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const dd = d2(ring[k], ring[i], ring[j]);
      if (dd > worst) { worst = dd; idx = k; }
    }
    if (idx > 0 && worst > tol2) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

const round = (ring, dp) => ring.map(([la, lo]) => [ +la.toFixed(dp), +lo.toFixed(dp) ]);

/* A ring with fewer than four points encloses no area and would silently answer "not on
   land" for everything inside it. Dropped loudly rather than kept as a degenerate. */
const usable = (ring) => ring.length >= 4;

const t0 = Date.now();
const res = await fetch(SRC, { headers: { "User-Agent": "millibar-terminal" } });
if (!res.ok) { console.error(`[coastline] FAILED ${res.status} on ${SRC}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
console.log(`[coastline] ${SRC} · ${buf.length} bytes · ${Date.now() - t0} ms`);

const files = unzipEntries(buf);
const shpName = Object.keys(files).find((n) => /\.shp$/i.test(n));
const dbfName = Object.keys(files).find((n) => /\.dbf$/i.test(n));
if (!shpName || !dbfName) { console.error("[coastline] no shp/dbf in bundle"); process.exit(1); }
const polys = parsePolygons(files[shpName]);
const rows = parseDbf(files[dbfName]);
if (polys.length !== rows.length) {
  console.error(`[coastline] bundle not self-consistent: ${polys.length} polygons, ${rows.length} rows`);
  process.exit(1);
}

const regions = [];
let rawTotal = 0, keptTotal = 0;
for (let i = 0; i < rows.length; i++) {
  const st = String(rows[i].STUSPS || "").toUpperCase();
  if (EXCLUDE.has(st)) continue;
  const hawaii = st === "HI";
  const tol = hawaii ? 0 : 0.01;          // ~0.6 nm at Hawaii's latitude; CONUS only
  const dp = hawaii ? 5 : 4;
  const rings = [];
  for (const ring of polys[i].rings) {
    rawTotal += ring.length;
    const simplified = tol > 0 ? rdp(ring, tol) : ring;
    if (!usable(simplified)) continue;
    const r = round(simplified, dp);
    keptTotal += r.length;
    rings.push(r);
  }
  if (!rings.length) continue;
  regions.push({ id: st, name: rows[i].NAME, group: hawaii ? "HI" : "CONUS", rings });
}

const out = {
  schema: "millibar-coastline/1",
  source: SRC,
  sourceName: "US Census cartographic boundary file, 1:500k, 2023",
  builtAt: new Date().toISOString(),
  note: "Hawaii at full source resolution; CONUS simplified with Ramer-Douglas-Peucker at "
      + "0.01 deg (~0.6 nm). Interior state boundaries are retained and are harmless: a "
      + "point-in-polygon land test cannot see them.",
  regions,
};
await writeFile(OUT, JSON.stringify(out) + "\n");

const hi = regions.filter((r) => r.group === "HI");
const conus = regions.filter((r) => r.group === "CONUS");
const bytes = (await readFile(OUT)).length;
console.log(`[coastline] HI    ${hi.length} region(s), ${hi.reduce((a, r) => a + r.rings.length, 0)} rings, `
  + `${hi.reduce((a, r) => a + r.rings.reduce((b, x) => b + x.length, 0), 0)} vertices (full resolution)`);
console.log(`[coastline] CONUS ${conus.length} region(s), ${conus.reduce((a, r) => a + r.rings.length, 0)} rings, `
  + `${conus.reduce((a, r) => a + r.rings.reduce((b, x) => b + x.length, 0), 0)} vertices`);
console.log(`[coastline] ${rawTotal} raw vertices -> ${keptTotal} kept (${(100 * keptTotal / rawTotal).toFixed(1)}%) · ${bytes} bytes on disk`);
