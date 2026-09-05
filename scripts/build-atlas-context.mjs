#!/usr/bin/env node
/* Pack the plate's CONTEXT land -- Natural Earth 1:110m -- for the Storm Atlas.
 *
 * WHY THIS EXISTS. The plate used to draw its context from a third-party raster tile service:
 * South America, Africa, Canada, the land this archive holds no landfall rings for. A tile
 * endpoint is a runtime dependency the permanent URL cannot vouch for -- every browser gate in
 * this repository aborts that host to stay hermetic, so the gates were measuring a plate with no
 * context at all, and a reader behind a firewall saw the same. Handoff B draws the same context
 * as a rendered Natural Earth silhouette. This packs that geometry so the plate is
 * self-contained: one more file beside the archive, fetched from the same origin, drawn by the
 * same coastline layer at contextual ink.
 *
 * IT IS CONTEXT AND ONLY CONTEXT. The five modelled landfall regions are still drawn from the
 * archive's own rings (build-atlas-coastlines.mjs) at full contrast, on top of this tier. Nothing
 * analytical consults this file: no landfall, no membership, no count.
 *
 * THE ENCODING IS LOSSLESS AGAINST THE SOURCE. TopoJSON stores quantised integer coordinates and
 * a transform; the pack stores the same integers, delta-coded along each ring, and the same
 * transform in its header, so decoding reproduces topojson-client's own `x * kx + dx` to the bit.
 * scripts/test-atlas-context.mjs decodes the pack through the browser's accessor and compares
 * every vertex of every ring against the TopoJSON, as a number.
 *
 * Run: node scripts/build-atlas-context.mjs
 */
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SRC_DIR = join(ROOT, "data/context");
export const OUT = join(ROOT, "docs/storm-atlas/data/atlas-context-v1.bin.gz");
export const MAGIC = "MBCONTX1";

/** Every ring of the land object as quantised integer pairs, in topojson-client's own order. */
export function readTopology(topo) {
  if (topo.type !== "Topology" || !topo.transform || !topo.objects.land) {
    throw new Error("land-110m.json is not a quantised Topology with a `land` object");
  }
  /* Arcs arrive delta-coded in quantised space; decode each once. */
  const arcs = topo.arcs.map((arc) => {
    const pts = [];
    let x = 0;
    let y = 0;
    for (const [dx, dy] of arc) { x += dx; y += dy; pts.push([x, y]); }
    return pts;
  });
  /* A ring is a sequence of arcs; a negative index is that arc reversed (~i). Where two arcs
     meet they share a vertex, and topojson-client drops the duplicate by popping the previous
     arc's last point before appending -- reproduced exactly so the two decoders agree. */
  const ringFromArcs = (idxs) => {
    const pts = [];
    for (const i of idxs) {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      if (pts.length) pts.pop();
      for (const p of a) pts.push(p);
    }
    while (pts.length < 4) pts.push(pts[0]);
    return pts;
  };
  const rings = [];
  const geoms = topo.objects.land.type === "GeometryCollection"
    ? topo.objects.land.geometries : [topo.objects.land];
  for (const g of geoms) {
    const polys = g.type === "Polygon" ? [g.arcs]
      : g.type === "MultiPolygon" ? g.arcs
        : (() => { throw new Error(`unexpected geometry ${g.type}`); })();
    for (const poly of polys) for (const ring of poly) rings.push(ringFromArcs(ring));
  }
  return { rings, transform: topo.transform };
}

export function encode({ rings, transform }, provenance) {
  let nVertices = 0;
  for (const r of rings) nVertices += r.length;
  const delta = new Int32Array(nVertices * 2);
  const ringOffset = new Uint32Array(rings.length + 1);
  let v = 0;
  let px = 0;
  let py = 0;
  for (let r = 0; r < rings.length; r++) {
    ringOffset[r] = v;
    for (const [x, y] of rings[r]) {
      delta[v * 2] = x - px;
      delta[v * 2 + 1] = y - py;
      px = x;
      py = y;
      v++;
    }
  }
  ringOffset[rings.length] = v;

  const header = {
    format: "atlas-context-v1",
    transform,
    counts: { rings: rings.length, vertices: nVertices },
    sections: {},
    note: "Natural Earth 1:110m land, quantised exactly as the TopoJSON source quantises it and "
      + "delta-coded along each ring. Drawn as the plate's CONTEXT tier only: no landfall, "
      + "cohort, count, rate or refusal consults it.",
    provenance,
  };
  const sections = [["delta", delta, 4], ["ring_offset", ringOffset, 4]];
  let offset = 0;
  for (const [name, arr, align] of sections) {
    offset = Math.ceil(offset / align) * align;
    header.sections[name] = { dtype: arr instanceof Int32Array ? "i32" : "u32", offset, length: arr.length };
    offset += arr.byteLength;
  }
  const json = JSON.stringify(header);
  const headerBytes = Buffer.from(json + " ".repeat((4 - ((12 + Buffer.byteLength(json)) % 4)) % 4), "utf8");
  const base = 12 + headerBytes.length;
  const out = Buffer.alloc(base + offset);
  out.write(MAGIC, 0, "latin1");
  out.writeUInt32LE(headerBytes.length, 8);
  headerBytes.copy(out, 12);
  for (const [name, arr] of sections) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(out, base + header.sections[name].offset);
  }
  return { buffer: out, header };
}

export async function buildContext({ dir = SRC_DIR, out = OUT } = {}) {
  const sources = JSON.parse(await readFile(join(dir, "SOURCES.json"), "utf8"));
  const src = sources.sources[0];
  const raw = await readFile(join(dir, src.file));
  const sha = createHash("sha256").update(raw).digest("hex");
  if (sha !== src.sha256) {
    throw new Error(`${src.file}: sha256 ${sha} does not match SOURCES.json (${src.sha256})`);
  }
  const topo = JSON.parse(raw.toString("utf8"));
  const { buffer, header } = encode(readTopology(topo), {
    built_from: `data/context/${src.file}`,
    package: src.package, upstream: src.upstream, licence: src.licence, sha256: src.sha256,
    not_used_for: sources.not_used_for,
  });
  const gz = gzipSync(buffer, { level: 9 });
  // RFC 1952 OS byte is metadata, not geometry. Pin Unix for cross-platform builds.
  gz[9] = 3;
  if (out) await writeFile(out, gz);
  return { header, raw: buffer.length, gz: gz.length, gzBytes: gz };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { header, raw, gz } = await buildContext();
  console.log(`  rings     ${header.counts.rings.toLocaleString().padStart(10)}`);
  console.log(`  vertices  ${header.counts.vertices.toLocaleString().padStart(10)}   (none removed)`);
  console.log(`  packed    ${raw.toLocaleString().padStart(10)} B`);
  console.log(`  gzipped   ${gz.toLocaleString().padStart(10)} B   -> docs/storm-atlas/data/`);
}
