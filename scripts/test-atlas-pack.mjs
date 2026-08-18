#!/usr/bin/env node
/* Does the Atlas pack still say what the archive says?
 *
 * The Storm Atlas does not read the Parquet. It reads a binary this repo builds from the
 * Parquet, and between those two files sit an encoder, a re-ordering, five sentinel schemes and
 * a fixed-point coordinate representation -- any of which could go wrong quietly. A track drawn
 * a hundredth of a degree off, a wind of 0 where the archive recorded no wind, a landfall time
 * rounded down by fifty-nine seconds: none of those throw, and none of them look wrong.
 *
 * So this compares the two ENDS. scripts/fixtures/atlas-pack-expect.json carries a digest of
 * every packed column computed FROM THE PARQUET by
 * scripts/genesis/build/build_atlas_pack.py:expectations(). This script recomputes those
 * digests from the PACK, through the same accessors the browser uses. Agreement is evidence
 * that the packer moved the archive faithfully AND that the decoder reads it back the same way;
 * a disagreement names the table and column.
 *
 * The digest is byte-level, not textual, so Python and JS cannot disagree about how a float
 * prints: a number is its eight IEEE-754 bytes.
 *
 * Offline. Run: node scripts/test-atlas-pack.mjs
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { readPack } from "../docs/storm-atlas/src/engine/node-io.js";
import { ensureVerification, ROOT } from "./lib/atlas-verify.mjs";

const DATA = join(ROOT, "docs/storm-atlas/data");

/* The pack the Atlas fetches before it can draw anything. The environment pack is lazy and
   deliberately outside this budget -- no Phase 1 surface reads it. */
const CRITICAL_PATH_BUDGET = 2_000_000;
const TOTAL_BUDGET = 3_000_000;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

/* ---- the canonical encoding, byte-for-byte identical to the Python in
   build_atlas_pack.py:_Fnv. Any divergence here would make every digest disagree at once,
   which is a loud failure rather than a subtle one. */
class Fnv {
  constructor() { this.h = 0x811c9dc5 >>> 0; this.buf = new DataView(new ArrayBuffer(8)); }
  byte(b) { this.h = Math.imul((this.h ^ b) >>> 0, 0x01000193) >>> 0; }
  bytes(arr) { for (let i = 0; i < arr.length; i++) this.byte(arr[i]); }
  null() { this.byte(0x00); }
  number(v) {
    this.byte(0x01);
    this.buf.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) this.byte(this.buf.getUint8(i));
  }
  string(v) { this.byte(0x02); this.bytes(new TextEncoder().encode(v)); this.byte(0x00); }
  boolean(v) { this.byte(0x03); this.byte(v ? 1 : 0); }
}

function digestColumn(read, n, kind) {
  const f = new Fnv();
  let nulls = 0;
  for (let i = 0; i < n; i++) {
    const v = read(i);
    if (v === null || v === undefined || (kind === "num" && Number.isNaN(v))) { nulls++; f.null(); continue; }
    if (kind === "num" || kind === "time") f.number(v);
    else if (kind === "str") f.string(v);
    else if (kind === "bool") f.boolean(v);
    else throw new Error("unknown kind " + kind);
  }
  return { n, nulls, fnv1a32: f.h };
}

function compare(label, got, want) {
  const same = got.n === want.n && got.nulls === want.nulls && got.fnv1a32 === want.fnv1a32;
  ok(label, same,
    same ? "" : `pack n=${got.n} nulls=${got.nulls} fnv=${got.fnv1a32} | ` +
                `archive n=${want.n} nulls=${want.nulls} fnv=${want.fnv1a32}`);
}

/* The archive's own digests, computed from the Parquet -- not from the pack, which is the whole
   point. Generated on demand rather than committed; see scripts/lib/atlas-verify.mjs. */
const expect = ensureVerification("pack", "atlas-pack-expect.json");
const core = await readPack(join(DATA, "atlas-core-v1.bin.gz"));
const tracks = await readPack(join(DATA, "atlas-tracks-v1.bin.gz"));
const env = await readPack(join(DATA, "atlas-env-v1.bin.gz"));
const manifest = JSON.parse(await readFile(join(DATA, "atlas-manifest.json"), "utf8"));

const tableOf = {
  storms: core.tables.storms,
  genesis_events: core.tables.genesis_events,
  landfalls: core.tables.landfalls,
  track_points: tracks.tables.track_points,
  environment: env.tables.environment,
};

console.log("\n[1] every packed column against the archive it was built from");
for (const [table, cols] of Object.entries(expect.columns)) {
  const t = tableOf[table];
  ok(`${table} row count`, t.rows === expect.rows[table],
    `pack ${t.rows} vs archive ${expect.rows[table]}`);
  for (const [name, want] of Object.entries(cols)) {
    const read = want.kind === "str" ? (i) => t.str(name, i)
      : want.kind === "bool" ? (i) => t.bool(name, i)
      : want.kind === "time" ? (i) => t.time(name, i)
      : (i) => t.num(name, i);
    compare(`${table}.${name}  (archive ${want.archive_column})`, digestColumn(read, t.rows, want.kind), want);
  }
}

console.log("\n[1b] quantised columns declare how far they moved");
for (const [table, cols] of Object.entries(expect.columns)) {
  for (const [name, want] of Object.entries(cols)) {
    if (want.quantised_to === undefined) continue;
    const c = tableOf[table].col(name);
    ok(`${table}.${name} is declared quantised to ${want.quantised_to} in the pack header`,
      c.scale === Math.round(1 / want.quantised_to),
      `pack scale ${c.scale}`);
    /* The bound is what makes the quantisation honest rather than merely accepted: at
       1e-9 degrees this admits the archive's own signed-longitude arithmetic (measured worst
       case 2.8e-14 deg, about three nanometres) and refuses anything that would actually move
       a track on screen. */
    ok(`${table}.${name} deviation ${want.max_deviation.toExponential(2)} deg is below 1e-9`,
      want.max_deviation < 1e-9);
  }
}
ok("the manifest publishes the track-geometry quantisation",
  manifest.track_geometry && manifest.track_geometry.quantised_to_deg === 0.01 &&
  manifest.track_geometry.max_deviation_deg < 1e-9,
  JSON.stringify(manifest.track_geometry && {
    q: manifest.track_geometry.quantised_to_deg, d: manifest.track_geometry.max_deviation_deg }));

console.log("\n[2] derived indexes against a re-derivation by the archive's own crossing rule");
const nS = core.tables.storms.rows;
const idx = core.indexes;
const readIdx = (key, kind) => (i) => {
  const c = idx[key];
  const v = c.array[i];
  if (c.nullValue === "nan") return Number.isNaN(v) ? null : v;
  if (c.nullValue !== null && v === c.nullValue) return null;
  return kind === "time" ? v * 60000 : v;
};
compare("cat2_t        (derived:atlas_pack)", digestColumn(readIdx("cat2_t", "time"), nS, "time"), expect.derived.cat2_t);
compare("cat2_hours    (derived:atlas_pack)", digestColumn(readIdx("cat2_hours", "num"), nS, "num"), expect.derived.cat2_hours);
compare("cat4_hours    (derived:atlas_pack)", digestColumn(readIdx("cat4_hours", "num"), nS, "num"), expect.derived.cat4_hours);
compare("cat5_hours    (derived:atlas_pack)", digestColumn(readIdx("cat5_hours", "num"), nS, "num"), expect.derived.cat5_hours);
compare("subbasin_mask (the Iniki guard)", digestColumn(readIdx("subbasin_mask", "num"), nS, "num"), expect.derived.subbasin_mask);
compare("landfall_count", digestColumn(readIdx("landfall_count", "num"), nS, "num"), expect.derived.landfall_count);

console.log("\n[3] the per-storm slices actually partition the tables");
{
  const off = tracks.indexes.storm_offset.array, cnt = tracks.indexes.storm_count.array;
  let run = 0, contiguous = true;
  for (let i = 0; i < nS; i++) { if (off[i] !== run) { contiguous = false; break; } run += cnt[i]; }
  ok("track slices are contiguous and cover every row", contiguous && run === tracks.tables.track_points.rows,
    `covered ${run} of ${tracks.tables.track_points.rows}`);
  let lfTotal = 0;
  for (let i = 0; i < nS; i++) lfTotal += idx.landfall_count.array[i];
  ok("landfall slices cover every landfall", lfTotal === core.tables.landfalls.rows,
    `covered ${lfTotal} of ${core.tables.landfalls.rows}`);
  // Every landfall must sit inside the slice its storm_row claims.
  let misplaced = 0;
  const lo = idx.landfall_offset.array, lc = idx.landfall_count.array;
  const sr = core.tables.landfalls.raw("storm_row");
  for (let i = 0; i < nS; i++) for (let k = lo[i]; k < lo[i] + lc[i]; k++) if (sr[k] !== i) misplaced++;
  ok("every landfall sits in its own storm's slice", misplaced === 0, `${misplaced} misplaced`);
}

console.log("\n[4] versions, counts and the size budget");
for (const [label, p] of [["core", core], ["tracks", tracks], ["env", env]]) {
  ok(`${label} pack declares methodology ${expect.methodology_version}`,
    p.header.methodology_version === expect.methodology_version,
    `pack says ${p.header.methodology_version}`);
  ok(`${label} pack was built from archive ${expect.archive_stamp}`,
    p.header.archive_stamp === expect.archive_stamp,
    `pack says ${p.header.archive_stamp}`);
}
for (const [t, n] of Object.entries(expect.rows)) {
  if (manifest.counts[t] !== undefined) {
    ok(`manifest count for ${t}`, manifest.counts[t] === n, `manifest ${manifest.counts[t]} vs ${n}`);
  }
}
{
  const sizes = {};
  let total = 0;
  for (const f of ["atlas-core-v1.bin.gz", "atlas-tracks-v1.bin.gz", "atlas-env-v1.bin.gz"]) {
    sizes[f] = (await stat(join(DATA, f))).size;
    total += sizes[f];
  }
  const critical = sizes["atlas-core-v1.bin.gz"] + sizes["atlas-tracks-v1.bin.gz"];
  ok(`critical path <= ${(CRITICAL_PATH_BUDGET / 1e6).toFixed(1)} MB gz`, critical <= CRITICAL_PATH_BUDGET,
    `core+tracks is ${critical.toLocaleString()} B`);
  ok(`all packs <= ${(TOTAL_BUDGET / 1e6).toFixed(1)} MB gz`, total <= TOTAL_BUDGET,
    `total is ${total.toLocaleString()} B`);
  console.log(`        core ${sizes["atlas-core-v1.bin.gz"].toLocaleString()} B · ` +
              `tracks ${sizes["atlas-tracks-v1.bin.gz"].toLocaleString()} B · ` +
              `env ${sizes["atlas-env-v1.bin.gz"].toLocaleString()} B (lazy)`);
}

console.log(failures ? `\n${failures} pack check(s) failed\n` : "\nthe pack is the archive\n");
process.exit(failures ? 1 : 0);
