#!/usr/bin/env node
/* FREEZE THE SEPT 9 SPECIMEN so rebuilding it cannot silently change the result.
 *
 * The live builder (build-disturbance-brief.mjs) refetches NHC on every run, and it SHOULD —
 * within one working session the elapsed-hours figure in this brief moved from 72 h to 78 h
 * because NHC issued a new advisory mid-edit. That is the builder working. It also means a
 * prospect-facing document built from it is undated evidence unless its inputs are pinned.
 *
 * So this writes an immutable copy of every input, with a SHA-256 for each, split by what kind
 * of provenance each one actually has — because they are not the same kind:
 *
 *   ARCHIVED   NHC keeps a permanent, addressable copy. Re-fetchable byte-for-byte forever.
 *              (the 2321Z outlook via the text/refresh archive; advisory 1 via /archive/2026/)
 *   CAPTURED   NHC serves only the current version and keeps no archive. What is frozen here is
 *              the copy this script pulled, hashed at capture. It CANNOT be re-fetched later,
 *              and the manifest says so rather than implying a permanence that does not exist.
 *   DERIVED    Outputs of the genesis archive. Frozen as computed, with the hashes of the
 *              archive tables that produced them, so the inputs behind them stay checkable.
 *
 * Conflating those three is how a specimen ends up claiming reproducibility it does not have.
 *
 * Run: node scripts/freeze-disturbance-specimen.mjs        (network + python; run once)
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "research/specimens/2026-09-09-three-systems");
const SRC = join(SPEC, "sources");

const sha = (b) => createHash("sha256").update(b).digest("hex");
const entries = [];

async function grab(kind, key, url, file, note) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(join(SRC, file), buf);
  entries.push({ kind, key, url, file, bytes: buf.length, sha256: sha(buf),
                 retrievedZ: new Date().toISOString(), note });
  process.stdout.write(`  ${kind.padEnd(8)} ${key.padEnd(22)} ${sha(buf).slice(0, 16)}  ${buf.length} B\n`);
  return buf;
}

async function main() {
  mkdirSync(SRC, { recursive: true });

  /* --- ARCHIVED: permanently addressable at NHC ------------------------------------------ */
  await grab("ARCHIVED", "two-ep-092321", 
    "https://www.nhc.noaa.gov/text/refresh/MIATWOEP+shtml/092321_MIATWOEP.shtml",
    "two-ep-092321.shtml",
    "Tropical Weather Outlook issued 500 PM PDT Wed Sep 9 2026 (2321Z) — the issuance this specimen reads.");
  await grab("ARCHIVED", "tcm-ep14-001",
    "https://www.nhc.noaa.gov/archive/2026/ep14/ep142026.fstadv.001.shtml",
    "tcm-ep142026-001.shtml",
    "Forecast/Advisory 1 for TD Fourteen-E, 2100 UTC Wed Sep 09 2026 — the forecast this specimen times.");
  await grab("ARCHIVED", "tcd-ep14-001",
    "https://www.nhc.noaa.gov/archive/2026/ep14/ep142026.discus.001.shtml",
    "tcd-ep142026-001.shtml",
    "Discussion 1 for TD Fourteen-E. Context only; nothing is computed from it.");

  /* --- CAPTURED: live-only, no NHC archive exists ---------------------------------------- */
  await grab("CAPTURED", "gtwo-shapefiles",
    "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip", "gtwo_shapefiles.zip",
    "Graphical outlook polygons. NHC serves only the current issuance and archives none, so this "
    + "capture cannot be re-fetched. The specimen builder reads THIS file, and the issuance stamp "
    + "inside it is asserted to be 202609092323 before anything is drawn.");
  await grab("CAPTURED", "bdeck-ep142026",
    "https://ftp.nhc.noaa.gov/atcf/btk/bep142026.dat", "bep142026.dat",
    "Working best track for EP142026. The file grows as the storm runs; the rows this specimen "
    + "uses (through 2026-09-10T00Z) are frozen here. Best track is revisable for months — this "
    + "is the operational file as it stood, not a post-season product.");
  await grab("CAPTURED", "currentstorms",
    "https://www.nhc.noaa.gov/CurrentStorms.json", "CurrentStorms.json",
    "Active-storm summary. Live-only; superseded every advisory cycle.");

  /* --- DERIVED: the archive's own answers, frozen as computed ----------------------------- */
  const QUERIES = {
    "analogs-d1-alleras":  ["13.21", "-147.30", null],
    "analogs-d1-1971":     ["13.21", "-147.30", "1971"],
    "analogs-d2-1971":     ["15.84", "-120.05", "1971"],
    "analogs-e14-genesis": ["15.8", "-115.0", "1971"],
    "analogs-e14-firsttrack-WITHDRAWN": ["12.6", "-108.7", "1971"],
  };
  for (const [key, [lat, lon, minSeason]] of Object.entries(QUERIES)) {
    const args = ["scripts/genesis/cli.py", "analogs", "--lat", lat, "--lon", lon,
                  "--radius", "500", "--months", "9", "--regions", "hawaii", "--json"];
    if (minSeason) args.push("--min-pool-season", minSeason);
    const out = execFileSync("python3", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 });
    const file = key + ".json";
    writeFileSync(join(SRC, file), out);
    entries.push({ kind: "DERIVED", key, url: null, file, bytes: Buffer.byteLength(out),
                   sha256: sha(out), retrievedZ: new Date().toISOString(),
                   command: "python3 " + args.join(" "),
                   note: key.includes("WITHDRAWN")
                     ? "The cohort the first version drew, from the pre-genesis disturbance fix. Frozen so the correction is checkable; not a result."
                     : "Storm Atlas analog query output." });
    process.stdout.write(`  DERIVED  ${key.slice(0, 22).padEnd(22)} ${sha(out).slice(0, 16)}  ${Buffer.byteLength(out)} B\n`);
  }

  /* --- the archive tables behind those answers, hashed but not copied --------------------- */
  const archiveDir = join(ROOT, "data/genesis-archive");
  const tables = readdirSync(archiveDir).filter((f) => f.endsWith(".parquet")).sort()
    .map((f) => { const b = readFileSync(join(archiveDir, f));
                  return { file: "data/genesis-archive/" + f, bytes: b.length, sha256: sha(b) }; });
  const archiveManifest = JSON.parse(readFileSync(join(archiveDir, "MANIFEST.json"), "utf8"));

  const manifest = {
    schema: "millibar.specimen/1",
    name: "Storm Atlas — Three Systems, Three Answers",
    asOf: "2026-09-09T23:21:00Z",
    asOfLocal: "500 PM PDT Wed Sep 9 2026",
    frozenAt: new Date().toISOString(),
    purpose: "A prospect-facing research specimen. The analysis is fixed to the 09 Sep 2026 "
           + "outlook issuance so that rebuilding it cannot silently change the result.",
    reproducibility: {
      ARCHIVED: "Permanently addressable at NHC. Re-fetch and compare the hash.",
      CAPTURED: "Live-only at source; NHC keeps no archive. The frozen copy IS the record and "
              + "cannot be re-fetched. Verify against the hash here, not against the live URL.",
      DERIVED: "Recomputable from the pinned archive tables below with the recorded command.",
    },
    sources: entries,
    genesisArchive: {
      methodologyVersion: archiveManifest.methodology_version || null,
      builtAt: archiveManifest.built_at || null,
      upstream: (archiveManifest.sources || []).map((s) => ({ key: s.key, url: s.url, sha256: s.sha256 })),
      tables,
    },
    notResponsible: [
      "This specimen is research output, not a forecast and not advice.",
      "For live warnings and watches, NHC is the only authority.",
    ],
  };
  writeFileSync(join(SPEC, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n  ${entries.length} sources frozen · ${tables.length} archive tables hashed`);
  console.log(`  Wrote ${join(SPEC, "MANIFEST.json")}`);
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
