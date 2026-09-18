#!/usr/bin/env node
/* IS THE PUBLISHED COHORT ARCHIVE IDENTITY THE THING IT CLAIMS TO BE?
 *
 * `provenance.archive_stamp` digests all six archive tables, two of which change every day by
 * design, so it moved seven times across seven ingests over an archive that had not changed.
 * `provenance.cohort_archive_id` covers only the four tables a cohort answer depends on. That
 * is a claim with two halves, and both are checked here:
 *
 *   INVARIANT   changing build/runtime metadata, the pack files, or either daily table must
 *               NOT move it -- otherwise it is the old stamp wearing a new name.
 *   SENSITIVE   changing any one of the four cohort tables MUST move it -- otherwise it is not
 *               an identity at all.
 *
 * Plus: the stored value is recomputed from the manifest's own table_sha256, so a stale or
 * hand-edited id fails here rather than sitting in the file looking plausible; and the covered
 * table list is compared against the Atlas engine's own COHORT_SOURCE_TABLES, so a new cohort
 * dependency cannot be added on one side without the identity being extended on the other.
 *
 * WHAT THIS DOES NOT CLAIM. It says nothing about the packed binary the browser reads. That
 * bridge is scripts/test-atlas-pack.mjs, which digests every packed column from the Parquet and
 * recomputes it from the pack through the browser's own accessors.
 *
 * Offline, stdlib only. Run: node scripts/test-atlas-cohort-identity.mjs [--self-test]
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COHORT_SOURCE_TABLES } from "../docs/storm-atlas/src/engine/cohort.js";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MANIFEST = join(ROOT, "docs", "storm-atlas", "data", "atlas-manifest.json");
const DERIVATION = "cohort-archive-id/1";

/* The derivation, in JS, mirroring scripts/genesis/build/cohort_identity.py. The payload is a
   LIST in the constant's order -- there are no objects in it, so Python's sort_keys has nothing
   to reorder and the two serialisations are byte-identical. */
function cohortArchiveId(tableSha256, tables = COHORT_SOURCE_TABLES) {
  const missing = tables.filter((t) => !(t in tableSha256));
  if (missing.length) throw new Error(`table(s) absent: ${missing.join(", ")}`);
  const payload = JSON.stringify(
    tables.map((t) => [t, tableSha256[t].sha256, tableSha256[t].bytes]));
  return createHash("sha256").update(payload).digest("hex");
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const bend = (hex) => (hex[0] === "0" ? "1" : "0") + hex.slice(1);

function check(manifest) {
  const problems = [];
  const prov = manifest.provenance || {};
  const t = prov.table_sha256;

  if (!t) return [{ kind: "NO TABLE DIGESTS", detail: "provenance.table_sha256 is absent" }];
  if (!prov.cohort_archive_id) {
    return [{ kind: "NO COHORT IDENTITY",
      detail: "provenance.cohort_archive_id is absent; run scripts/genesis/build/cohort_identity.py" }];
  }

  /* -- the stored value is the derived value, recomputed here from the same inputs ---------- */
  const fresh = cohortArchiveId(t);
  if (prov.cohort_archive_id !== fresh) {
    problems.push({ kind: "IDENTITY DOES NOT DERIVE",
      detail: `manifest says ${prov.cohort_archive_id}, the tables derive ${fresh}` });
  }
  if (!/^[0-9a-f]{64}$/.test(prov.cohort_archive_id)) {
    problems.push({ kind: "IDENTITY TRUNCATED",
      detail: `the canonical identity must be the full 64-hex SHA-256, got `
            + `${prov.cohort_archive_id.length} chars` });
  }
  if (prov.cohort_archive_id_derivation !== DERIVATION) {
    problems.push({ kind: "DERIVATION UNVERSIONED",
      detail: `expected ${DERIVATION}, manifest says ${prov.cohort_archive_id_derivation}` });
  }

  /* -- DEPENDENCY COVERAGE. One contract, stated in two places, compared. ------------------- */
  const declared = [...(prov.cohort_archive_id_tables || [])].sort().join(",");
  const engine = [...COHORT_SOURCE_TABLES].sort().join(",");
  if (declared !== engine) {
    problems.push({ kind: "DEPENDENCY COVERAGE DRIFT",
      detail: `the manifest covers [${declared}] but the Atlas engine's COHORT_SOURCE_TABLES is `
            + `[${engine}]. A cohort dependency was added or removed on one side only.` });
  }

  /* -- INVARIANT: build and runtime metadata must not move it ------------------------------ */
  const NON_CONTENT = [
    ["archive_built_utc", (m) => { m.archive_built_utc = "1999-01-01T00:00:00Z";
                                   m.provenance.archive_built_utc = "1999-01-01T00:00:00Z"; }],
    ["archive_stamp", (m) => { m.archive_stamp = "deadbeefdeadbeef";
                               m.provenance.archive_stamp = "deadbeefdeadbeef"; }],
    ["processing_version", (m) => { m.processing_version = "9.9.9"; }],
    ["methodology_version", (m) => { m.methodology_version = "9.9.9"; }],
    ["files (the packed binaries)", (m) => {
      for (const f of Object.values(m.files || {})) f.sha256 = bend(f.sha256); }],
    ["environment digest", (m) => {
      m.provenance.table_sha256.environment.sha256 = bend(t.environment.sha256); }],
    ["daily_disturbances digest", (m) => {
      m.provenance.table_sha256.daily_disturbances.sha256 = bend(t.daily_disturbances.sha256); }],
    ["gaps", (m) => { m.provenance.gaps = ["a finding added after the fact"]; }],
  ];
  for (const [what, mutate] of NON_CONTENT) {
    const m = clone(manifest);
    if (what.startsWith("environment") && !t.environment) continue;
    if (what.startsWith("daily") && !t.daily_disturbances) continue;
    mutate(m);
    const got = cohortArchiveId(m.provenance.table_sha256);
    if (got !== fresh) {
      problems.push({ kind: "IDENTITY MOVED ON NON-CONTENT",
        detail: `changing ${what} changed the identity ${fresh.slice(0, 16)} -> ${got.slice(0, 16)}` });
    }
  }

  /* -- SENSITIVE: each cohort-driving table must move it ------------------------------------ */
  for (const table of COHORT_SOURCE_TABLES) {
    const m = clone(manifest);
    m.provenance.table_sha256[table].sha256 = bend(t[table].sha256);
    if (cohortArchiveId(m.provenance.table_sha256) === fresh) {
      problems.push({ kind: "IDENTITY BLIND TO CONTENT",
        detail: `changing ${table} did not change the identity` });
    }
  }
  return problems;
}

/* -- HISTORICAL STABILITY. The claim is not "it is stable in principle" but "it did not move
      across the ingests where the old stamp did", so it is measured against the real history.
      A shallow checkout has no history to read; that is reported, never silently passed. */
function historicalStability(n = 12) {
  let shas;
  try {
    shas = execFileSync("git", ["log", "--format=%H", `-${n}`, "--",
      "docs/storm-atlas/data/atlas-manifest.json"], { cwd: ROOT, encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
  } catch {
    return { available: false };
  }
  const ids = new Set(), stamps = new Set();
  let read = 0;
  for (const sha of shas) {
    let doc;
    try {
      doc = JSON.parse(execFileSync("git",
        ["show", `${sha}:docs/storm-atlas/data/atlas-manifest.json`],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }));
    } catch { continue; }
    const t = (doc.provenance || {}).table_sha256;
    if (!t || COHORT_SOURCE_TABLES.some((x) => !(x in t))) continue;
    read++;
    ids.add(cohortArchiveId(t));
    stamps.add(doc.archive_stamp);
  }
  return { available: read > 1, read, ids: ids.size, stamps: stamps.size };
}

function selfTest() {
  const bad = [];
  if (!existsSync(MANIFEST)) {
    console.log("PASS  no atlas manifest yet");
    return 0;
  }
  const real = JSON.parse(readFileSync(MANIFEST, "utf8"));

  if (check(real).length) bad.push("false positive: the real manifest is rejected by its own check");

  /* Every way the identity can be wrong, applied through the checker itself. */
  const cases = [
    ["a hand-edited identity", (m) => { m.provenance.cohort_archive_id = bend(m.provenance.cohort_archive_id); },
      "IDENTITY DOES NOT DERIVE"],
    ["a truncated identity", (m) => { m.provenance.cohort_archive_id =
      m.provenance.cohort_archive_id.slice(0, 16); }, "IDENTITY TRUNCATED"],
    ["an unversioned derivation", (m) => { m.provenance.cohort_archive_id_derivation = "ad hoc"; },
      "DERIVATION UNVERSIONED"],
    ["a cohort dependency added without extending the identity",
      (m) => { m.provenance.cohort_archive_id_tables = ["genesis_events", "landfalls", "storms"]; },
      "DEPENDENCY COVERAGE DRIFT"],
    ["a missing identity", (m) => { delete m.provenance.cohort_archive_id; }, "NO COHORT IDENTITY"],
  ];
  for (const [name, mutate, kind] of cases) {
    const m = clone(real);
    mutate(m);
    const got = check(m).map((p) => p.kind);
    if (!got.includes(kind)) bad.push(`missed: ${name} (got ${got.join(",") || "nothing"})`);
  }

  /* The derivation itself, made to fail: an identity that ignores its inputs must be caught by
     the sensitivity half, and one that hashes the daily tables by the invariance half. */
  const blind = clone(real);
  blind.provenance.table_sha256.storms.sha256 = bend(real.provenance.table_sha256.storms.sha256);
  if (cohortArchiveId(blind.provenance.table_sha256)
      === cohortArchiveId(real.provenance.table_sha256)) {
    bad.push("missed: the derivation is blind to its own inputs");
  }
  const overreaching = cohortArchiveId(real.provenance.table_sha256,
    [...COHORT_SOURCE_TABLES, "daily_disturbances"].sort());
  if (overreaching === cohortArchiveId(real.provenance.table_sha256)) {
    bad.push("missed: covering a daily table would not change the identity");
  }

  if (bad.length) {
    console.error("FAIL  the cohort-identity gate does not do what it claims\n");
    for (const b of bad) console.error(`  ${b}`);
    return 1;
  }
  console.log(`PASS  cohort-identity self-test: ${cases.length} bad manifests rejected, `
            + `the real one allowed`);
  return 0;
}

if (process.argv.includes("--self-test")) process.exit(selfTest());

if (!existsSync(MANIFEST)) {
  console.log("PASS  no atlas manifest yet");
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const problems = check(manifest);
if (problems.length) {
  console.error(`FAIL  ${MANIFEST.replace(ROOT + "/", "")}\n`);
  for (const p of problems) console.error(`        [${p.kind}] ${p.detail}`);
  process.exit(1);
}
const id = manifest.provenance.cohort_archive_id;
console.log(`PASS  the cohort archive identity derives from its own table digests`);
console.log(`      COHORT ARCHIVE · ${id.slice(0, 16)}   (full: ${id})`);
console.log(`      ${manifest.provenance.cohort_archive_id_derivation} over `
          + `${COHORT_SOURCE_TABLES.join(", ")}`);
console.log(`      invariant under build metadata, pack digests, environment and `
          + `daily_disturbances; sensitive to all ${COHORT_SOURCE_TABLES.length} cohort tables`);
const hist = historicalStability();
if (hist.available) {
  console.log(`      across ${hist.read} committed manifests: ${hist.ids} cohort `
            + `identit${hist.ids === 1 ? "y" : "ies"}, ${hist.stamps} archive_stamp value(s)`);
} else {
  console.log(`      historical comparison skipped: no manifest history in this checkout`);
}
