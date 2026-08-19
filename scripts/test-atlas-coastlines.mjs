#!/usr/bin/env node
/* Is the plate's coastline the archive's coastline?
 *
 * The Storm Atlas draws its authoritative coast from a packed copy of the five files under
 * data/genesis-archive/coastlines/, and the whole justification for doing that rather than
 * using a basemap is that these are the rings the landfall rule tests against. That
 * justification survives exactly as long as the packed copy is the same geometry.
 *
 * So this does not sample, and it does not compare a checksum of a checksum: it decodes the
 * pack through the SAME accessor the browser uses and compares EVERY vertex of EVERY ring
 * against the GeoJSON, as a number. A pack built from a simplified, decimated, re-projected or
 * re-rounded source fails here rather than shipping a coast that quietly disagrees with the
 * claims drawn on top of it.
 *
 * It also checks the thing the fixed-point scale rests on -- that no source coordinate carries
 * more than four decimals -- because that is a property of the input, not of this code, and a
 * future source refresh could change it without changing anything else.
 *
 * Run: node scripts/test-atlas-coastlines.mjs
 */
import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGIONS, SCALE, readRings } from "./build-atlas-coastlines.mjs";
import { decodeCoastlines } from "../docs/storm-atlas/src/engine/coastlines.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data/genesis-archive/coastlines");
const PACK = join(ROOT, "docs/storm-atlas/data/atlas-coastlines-v1.bin.gz");

/* Deferred, not critical-path: it lands after core+tracks. The budget is still stated, because
   a deferred download is still a download and the bench gates the total. */
const GZ_BUDGET = 260000;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

const raw = gunzipSync(await readFile(PACK));
const pack = decodeCoastlines(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const source = await readRings(SRC);
const sources = JSON.parse(await readFile(join(SRC, "SOURCES.json"), "utf8"));

console.log("\n[1] the pack holds what the archive holds");
{
  ok("the same regions, in the same order",
    pack.regions.join(",") === REGIONS.join(","), pack.regions.join(","));
  ok(`the same ring count (${source.rings.length})`, pack.nRings === source.rings.length,
    `pack ${pack.nRings} vs source ${source.rings.length}`);
  let v = 0;
  for (const r of source.rings) v += r.length;
  ok(`the same vertex count (${v.toLocaleString()})`, pack.nVertices === v,
    `pack ${pack.nVertices} vs source ${v}`);

  /* SOURCES.json publishes a vertex count per region and it is the archive's own statement
     about this geometry. A pack that agrees with the files but not with the manifest means the
     files moved under the manifest, which is worth failing for. */
  let mismatched = 0;
  for (const [name, meta] of Object.entries(sources.regions)) {
    const r = REGIONS.indexOf(name);
    let n = 0;
    for (let i = 0; i < pack.nRings; i++) {
      if (pack.ringRegion[i] !== r) continue;
      /* SOURCES.json counts every coordinate in the ring, its repeated closing point
         included -- measured against all five files, not assumed. */
      n += pack.ringOffset[i + 1] - pack.ringOffset[i];
    }
    if (n !== meta.vertices) {
      mismatched++;
      console.log(`        ${name}: pack ${n} vs SOURCES.json ${meta.vertices}`);
    }
  }
  ok("every region's vertex count matches SOURCES.json", mismatched === 0);
}

console.log("\n[2] every vertex, against the GeoJSON");
{
  let worst = 0;
  let bad = 0;
  let checked = 0;
  for (let r = 0; r < source.rings.length; r++) {
    const ring = source.rings[r];
    const start = pack.ringOffset[r];
    if (pack.ringOffset[r + 1] - start !== ring.length) {
      bad++;
      continue;
    }
    if (pack.ringRegion[r] !== source.regionOf[r]) bad++;
    for (let i = 0; i < ring.length; i++) {
      const dx = Math.abs(pack.lon[start + i] - ring[i][0]);
      const dy = Math.abs(pack.lat[start + i] - ring[i][1]);
      if (dx > worst) worst = dx;
      if (dy > worst) worst = dy;
      if (dx !== 0 || dy !== 0) bad++;
      checked++;
    }
  }
  ok(`${checked.toLocaleString()} vertices decode to the source value exactly`, bad === 0,
    `${bad} disagreed; worst deviation ${worst.toExponential(2)}°`);
  ok("worst deviation is exactly zero — no vertex was moved", worst === 0,
    `${worst.toExponential(2)}°`);
}

console.log("\n[3] the fixed-point scale is exact for this source");
{
  let over = 0;
  let maxDec = 0;
  for (const name of REGIONS) {
    const text = await readFile(join(SRC, `${name}.geojson`), "utf8");
    for (const m of text.matchAll(/-?\d+\.(\d+)/g)) {
      if (m[1].length > maxDec) maxDec = m[1].length;
      if (m[1].length > 4) over++;
    }
  }
  ok(`no source number carries more than four decimals (saw ${maxDec})`, over === 0,
    `${over} numbers would not survive a 1/${SCALE} grid`);
}

console.log("\n[4] the land union, split from its interior borders");
{
  const c = pack.header.counts;
  ok("the boundary edge count is published", c.boundary_edges > 0);
  ok("the interior border count is published", c.shared_edges > 0);
  /* The partition is what lets the plate draw a coast and a state line differently. If every
     edge were classified the same way, the two-tier statement on the plate would be a lie told
     with two colours. */
  ok("both classes are non-trivial", c.boundary_edges > 1000 && c.shared_edges > 1000,
    `${c.boundary_edges} boundary / ${c.shared_edges} interior`);
  let flagged = 0;
  for (let k = 0; k < pack.coastal.length; k++) if (pack.coastal[k]) flagged++;
  ok("the per-vertex flags agree with the header count", flagged === c.boundary_edges,
    `${flagged} flagged vs ${c.boundary_edges} declared`);
}

console.log("\n[5] provenance travels with the bytes");
{
  const p = pack.header.provenance || {};
  ok("the geometry sources are named", (p.geometry_sources || []).length > 0);
  ok("each carries its sha256",
    (p.geometry_sources || []).every((s) => /^[0-9a-f]{64}$/.test(s.sha256 || "")));
  ok("each carries its licence",
    (p.geometry_sources || []).every((s) => (s.licence || "").length > 10));
  ok("the archive's land-union caveat is carried through",
    (p.gaps || []).some((g) => g.key === "coastlines.land_union_edge"));
  ok("the pack declares it did not simplify", /No vertex was removed or moved/
    .test(pack.header.note || ""));
}

console.log("\n[6] what it costs to serve");
{
  const gz = (await stat(PACK)).size;
  ok(`gzipped <= ${(GZ_BUDGET / 1e3).toFixed(0)} KB`, gz <= GZ_BUDGET,
    `${gz.toLocaleString()} B`);
  console.log(`        ${gz.toLocaleString()} B gzipped for ${pack.nVertices.toLocaleString()} ` +
    "vertices — against 405,853 B for gzipping the GeoJSON itself");
}

console.log(failures
  ? `\n${failures} coastline check(s) failed — run: node scripts/build-atlas-coastlines.mjs\n`
  : "\nthe plate's coastline is the archive's coastline\n");
process.exit(failures ? 1 : 0);
