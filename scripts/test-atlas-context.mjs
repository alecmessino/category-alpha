#!/usr/bin/env node
/* Is the plate's context land the vendored Natural Earth geometry, and is the plate drawn from
 * this origin alone?
 *
 * The context tier exists so the plate stops depending on a third-party tile service. That is
 * only true while (1) the committed pack is what the vendored TopoJSON packs to, byte for byte,
 * (2) the browser's decoder reproduces every vertex of that TopoJSON as a number, and (3) no
 * source file on the plate reaches for a tile host again. Each is asserted here, offline.
 *
 * Run: node scripts/test-atlas-context.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OUT, SRC_DIR, buildContext, readTopology } from "./build-atlas-context.mjs";
import { decodeContext } from "../docs/storm-atlas/src/engine/coastlines.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/* Deferred, off the critical path, and small: 110m land is 20 KB gzipped. */
const GZ_BUDGET = 40000;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

console.log("\n[1] the committed pack is what the vendored source packs to");
const committed = await readFile(OUT);
const fresh = await buildContext({ out: null });
ok("byte-identical to a fresh build", Buffer.compare(committed, fresh.gzBytes) === 0,
  `committed ${committed.length} B, fresh ${fresh.gzBytes.length} B`);
ok(`gzipped size within budget (${committed.length.toLocaleString()} B <= ${GZ_BUDGET.toLocaleString()})`,
  committed.length <= GZ_BUDGET);

console.log("\n[2] the browser's decoder reproduces every vertex of the TopoJSON");
const raw = gunzipSync(committed);
const pack = decodeContext(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const topo = JSON.parse(await readFile(join(SRC_DIR, "land-110m.json"), "utf8"));
const { rings, transform } = readTopology(topo);
ok(`the same ring count (${rings.length})`, pack.nRings === rings.length, `pack ${pack.nRings}`);
let nv = 0;
for (const r of rings) nv += r.length;
ok(`the same vertex count (${nv.toLocaleString()})`, pack.nVertices === nv, `pack ${pack.nVertices}`);
{
  let bad = 0;
  let k = 0;
  const [kx, ky] = transform.scale;
  const [dx, dy] = transform.translate;
  for (let r = 0; r < rings.length && r < pack.nRings; r++) {
    if (pack.ringOffset[r] !== k) bad++;
    for (const [x, y] of rings[r]) {
      if (pack.lon[k] !== x * kx + dx || pack.lat[k] !== y * ky + dy) bad++;
      k++;
    }
  }
  ok("every vertex decodes to the source coordinate exactly", bad === 0, `${bad} disagreements`);
}
ok("the header names what this tier is not used for",
  /landfall/.test(pack.header.provenance && pack.header.provenance.not_used_for || ""));

console.log("\n[3] nothing on the plate reaches for a tile host");
{
  const dir = join(ROOT, "docs/storm-atlas/src");
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(jsx?|css)$/.test(e.name)) files.push(p);
    }
  };
  await walk(dir);
  files.push(join(ROOT, "docs/storm-atlas/atlas.css"), join(ROOT, "docs/storm-atlas/index.html"));
  const hits = [];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    /* Comments may still tell the story of the tile layer; code may not call one. */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/tileLayer\(|cartocdn|basemaps\.|tile\.openstreetmap|fonts\.googleapis|fonts\.gstatic/.test(code)) {
      hits.push(f.slice(ROOT.length + 1));
    }
  }
  ok("no source calls a tile service or a font CDN", hits.length === 0, hits.join(", "));
}

console.log(failures === 0
  ? "\nthe plate's context is the vendored Natural Earth geometry, from this origin alone"
  : `\n${failures} context check(s) failed`);
process.exit(failures ? 1 : 0);
