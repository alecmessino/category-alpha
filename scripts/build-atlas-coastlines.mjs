#!/usr/bin/env node
/* Pack the archive's OWN coastline geometry for the Storm Atlas plate.
 *
 * WHY THIS EXISTS. The five files under data/genesis-archive/coastlines/ are not a basemap.
 * They are the rings the landfall rule tests against: a crossing is a transition of the union
 * of these polygons, and every landfall row the archive publishes was decided by this geometry
 * and no other. Drawing the plate's authoritative coastline from anything else means the line a
 * reader sees is not the line the claim was made against.
 *
 * THE GEOMETRY IS NOT SIMPLIFIED, AND CANNOT BE. Decimating a ring to save payload would make
 * the displayed coast diverge from the detection geometry, which defeats the entire point of
 * using it. So the payload is cut by ENCODING rather than by dropping vertices, and the
 * encoding is exactly lossless:
 *
 *   Every coordinate in all five source files carries AT MOST FOUR DECIMAL PLACES -- that is
 *   the precision Natural Earth publishes and the precision the archive tested against. So
 *   round(v * 10_000) is an exact integer for every vertex, it fits in int32 with three orders
 *   of magnitude to spare (|180| * 1e4 = 1.8e6), and dividing back by 10_000 returns the
 *   source value bit for bit. scripts/test-atlas-coastlines.mjs asserts that vertex by vertex
 *   against the GeoJSON rather than trusting this paragraph.
 *
 *   Consecutive vertices of a ring are metres apart, so the integers are then DELTA-CODED
 *   along each ring. That is what makes the stream compress: 1.41 MB of GeoJSON becomes about
 *   220 KB gzipped, against 406 KB for gzipping the GeoJSON itself, with the same 69,471
 *   vertices arriving.
 *
 * COASTAL EDGES ARE SEPARATED FROM ADMIN BORDERS, HERE RATHER THAN AT DRAW TIME.
 * The source is admin-1: US states, Mexican states, Caribbean map units. Adjacent units share
 * their border exactly -- measured, 17,818 edges appear in precisely two rings and 33,324 in
 * exactly one, and none appears three times. An edge in two rings is interior to the land
 * union; an edge in one is on its boundary, which is the coastline the crossing rule sees. The
 * classification is a hash lookup at build time and costs the renderer nothing, and it is what
 * lets the plate draw a state line and a coast in different inks without inventing either.
 *
 * Run: node scripts/build-atlas-coastlines.mjs
 */
import { gzipSync } from "node:zlib";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data/genesis-archive/coastlines");
const OUT = join(ROOT, "docs/storm-atlas/data/atlas-coastlines-v1.bin.gz");

export const MAGIC = "MBCOAST1";
/** Fixed-point scale. Ten thousand because the sources carry four decimals and no more. */
export const SCALE = 10000;
/** Drawn in the order the plate wants them under one another; ordering is not semantic. */
export const REGIONS = ["conus", "mexico", "central_america", "caribbean", "hawaii"];

/** Read the five files and flatten them to rings, keeping each ring's region. */
export async function readRings(dir = SRC) {
  const rings = [];
  const regionOf = [];
  const perRegion = {};
  for (let r = 0; r < REGIONS.length; r++) {
    const name = REGIONS[r];
    const doc = JSON.parse(await readFile(join(dir, `${name}.geojson`), "utf8"));
    let n = 0;
    for (const f of doc.features) {
      const g = f.geometry;
      /* Polygon is [ring, hole...]; MultiPolygon is [[ring, hole...], ...]. Holes are rings
         too -- an inland sea's shore is a coastline the crossing rule sees exactly like an
         outer one -- so both are flattened rather than distinguished. */
      const polys = g.type === "Polygon" ? [g.coordinates]
        : g.type === "MultiPolygon" ? g.coordinates
          : (() => { throw new Error(`${name}: unexpected geometry ${g.type}`); })();
      for (const poly of polys) {
        for (const ring of poly) { rings.push(ring); regionOf.push(r); n++; }
      }
    }
    perRegion[name] = { rings: n, features: doc.features.length };
  }
  return { rings, regionOf, perRegion };
}

/** round(v * SCALE), refusing anything the scale cannot carry exactly. */
function fixed(v, what) {
  const i = Math.round(v * SCALE);
  if (Math.abs(i / SCALE - v) > 1e-9) {
    throw new Error(`${what}: ${v} is not exact at 1/${SCALE} -- the sources carry four ` +
      "decimals; a source that carries more may not be packed at this scale");
  }
  return i;
}

export function encode({ rings, regionOf, perRegion }, provenance) {
  let nVertices = 0;
  for (const ring of rings) nVertices += ring.length;

  const delta = new Int32Array(nVertices * 2);
  const ringOffset = new Uint32Array(rings.length + 1);
  const ringRegion = new Uint8Array(rings.length);
  const coastal = new Uint8Array(nVertices);

  /* Pass one: the integer grid, and how many rings each undirected edge appears in. */
  const grid = [];
  const seen = new Map();
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    const g = new Int32Array(ring.length * 2);
    for (let i = 0; i < ring.length; i++) {
      g[i * 2] = fixed(ring[i][0], `ring ${r} vertex ${i} lon`);
      g[i * 2 + 1] = fixed(ring[i][1], `ring ${r} vertex ${i} lat`);
    }
    grid.push(g);
    for (let i = 0; i + 1 < ring.length; i++) {
      seen.set(edgeKey(g, i), (seen.get(edgeKey(g, i)) || 0) + 1);
    }
  }

  /* Pass two: deltas along each ring, and the coastal flag per starting vertex. */
  let v = 0;
  let px = 0;
  let py = 0;
  for (let r = 0; r < rings.length; r++) {
    const g = grid[r];
    ringOffset[r] = v;
    ringRegion[r] = regionOf[r];
    const n = g.length / 2;
    for (let i = 0; i < n; i++) {
      delta[v * 2] = g[i * 2] - px;
      delta[v * 2 + 1] = g[i * 2 + 1] - py;
      px = g[i * 2];
      py = g[i * 2 + 1];
      /* The flag belongs to the edge LEAVING this vertex. A closed ring repeats its first
         vertex last, so that final vertex leaves no edge and stays 0. */
      coastal[v] = i + 1 < n && seen.get(edgeKey(g, i)) === 1 ? 1 : 0;
      v++;
    }
  }
  ringOffset[rings.length] = v;

  let shared = 0;
  for (const c of seen.values()) {
    if (c === 1) continue;
    if (c !== 2) throw new Error(`an edge appears in ${c} rings; the land union is not simple`);
    shared++;
  }

  const header = {
    format: "atlas-coastlines-v1",
    scale: SCALE,
    regions: REGIONS,
    counts: {
      rings: rings.length,
      vertices: nVertices,
      boundary_edges: [...seen.values()].filter((c) => c === 1).length,
      shared_edges: shared,
      per_region: perRegion,
    },
    sections: {},
    note:
      "The archive's own landfall geometry, packed losslessly at 1/10000 degree -- the "
      + "precision the sources publish. No vertex was removed or moved: the coastline drawn "
      + "on the plate is the coastline every landfall row was decided against. `coastal` "
      + "marks the edges that lie on the boundary of the land union (the crossing rule's "
      + "coastline); the rest are borders interior to it.",
    provenance,
  };

  const sections = [
    ["delta", delta, 4],
    ["ring_offset", ringOffset, 4],
    ["ring_region", ringRegion, 1],
    ["coastal", coastal, 1],
  ];
  let offset = 0;
  for (const [name, arr, align] of sections) {
    offset = Math.ceil(offset / align) * align;
    header.sections[name] = {
      dtype: arr.BYTES_PER_ELEMENT === 4 ? (arr instanceof Int32Array ? "i32" : "u32") : "u8",
      offset, length: arr.length,
    };
    offset += arr.byteLength;
  }
  const payloadLen = offset;

  /* The payload holds Int32Arrays, and a TypedArray view must start on a multiple of its
     element size. Padding the header is what lets the browser view the bytes the network
     delivered instead of copying them. The padding is SPACES rather than zero bytes so the
     header stays valid JSON with nothing trimmed off it first. */
  const json = JSON.stringify(header);
  const headerBytes = Buffer.from(json + " ".repeat((4 - ((12 + Buffer.byteLength(json)) % 4)) % 4),
    "utf8");
  const base = 12 + headerBytes.length;
  const out = Buffer.alloc(base + payloadLen);
  out.write(MAGIC, 0, "latin1");
  out.writeUInt32LE(headerBytes.length, 8);
  headerBytes.copy(out, 12);
  for (const [name, arr] of sections) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
      .copy(out, base + header.sections[name].offset);
  }
  return { buffer: out, header };
}

export async function buildCoastlines({ dir = SRC, out = OUT } = {}) {
  const sources = JSON.parse(await readFile(join(dir, "SOURCES.json"), "utf8"));
  const rings = await readRings(dir);
  const { buffer, header } = encode(rings, {
    built_from: "data/genesis-archive/coastlines/",
    processing_version: sources.processing_version,
    built_utc: sources.built_utc,
    /* Carried so the drawer can say what the plate is drawing without a second fetch of
       SOURCES.json, and so the licence travels with the bytes. */
    geometry_sources: (sources.sources || []).map((s) => ({
      key: s.key, url: s.url, sha256: s.sha256, licence: s.licence,
    })),
    gaps: (sources.gaps || []).map((g) => ({ key: g.key, what: g.what, impact: g.impact })),
  });
  const gz = gzipSync(buffer, { level: 9 });
  await writeFile(out, gz);
  return { header, raw: buffer.length, gz: gz.length };
}

function edgeKey(g, i) {
  const ax = g[i * 2];
  const ay = g[i * 2 + 1];
  const bx = g[i * 2 + 2];
  const by = g[i * 2 + 3];
  // Undirected: the two rings sharing a border traverse it in opposite directions.
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax},${ay},${bx},${by}`
    : `${bx},${by},${ax},${ay}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { header, raw, gz } = await buildCoastlines();
  const c = header.counts;
  console.log(`  rings          ${c.rings.toLocaleString().padStart(12)}`);
  console.log(`  vertices       ${c.vertices.toLocaleString().padStart(12)}   (none removed)`);
  console.log(`  coastal edges  ${c.boundary_edges.toLocaleString().padStart(12)}   on the land union boundary`);
  console.log(`  shared edges   ${c.shared_edges.toLocaleString().padStart(12)}   interior admin borders`);
  console.log(`  packed         ${raw.toLocaleString().padStart(12)} B`);
  console.log(`  gzipped        ${gz.toLocaleString().padStart(12)} B   -> docs/storm-atlas/data/`);
}
