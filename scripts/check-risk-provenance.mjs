/* NO PUBLISHED RISK RECORD MAY DEPEND ON A FILE THAT IS NOT IN THE REPOSITORY.
 *
 * THE FAILURE THIS EXISTS FOR, EXACTLY. The Lowell Rev 3 hand-off shipped a pipeline whose
 * build stat'd `pipeline/raw/ne_10m_land.geojson` to put its SHA-256 in the published
 * source register. That file was not in the package. A clean checkout did not produce a
 * degraded record or a warning -- it produced a FileNotFoundError, and the record could not
 * be rebuilt at all. Meanwhile the geometry the build actually opened, a pipeline-local
 * `hawaii_land.geojson`, appeared nowhere in its own register.
 *
 * So the defect had two halves, and a gate that checks one of them is worth very little:
 *
 *   DECLARED BUT ABSENT   a register entry with no file behind it. The build breaks, or
 *                         worse, the register asserts a hash nobody can check.
 *   READ BUT UNDECLARED   a file the build opens that the register never mentions. The
 *                         record's provenance is then simply incomplete, and silently so.
 *
 * Both are checked here, in both directions, over every published risk manifest.
 *
 * WHY NODE AND NOT PYTHON. scripts/risk/gates.py checks the same invariant with the
 * pipeline's own declared_inputs(), but it needs shapely, pypdf and a browser. This one
 * needs nothing, so it runs in the offline Checks job on every pull request -- which is
 * where a missing input has to be caught, not in the release job after it is merged.
 *
 * Run: node scripts/check-risk-provenance.mjs [--self-test]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RISK = join(ROOT, "docs", "risk");

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/* A register entry is admissible only if it says where the file is. A bare basename cannot
   be resolved to a tracked path, which is how "ne_10m_land.geojson" managed to look like
   provenance while naming nothing the repository contained. Raw products are resolved
   against the event's own raw/ directory; everything else must carry an explicit path. */
function resolveEntry(entry, rawDir) {
  if (entry.path) return join(ROOT, entry.path);
  if (rawDir && existsSync(join(rawDir, entry.file))) return join(rawDir, entry.file);
  return null;
}

function checkManifest(manifestPath) {
  const rel = relative(ROOT, manifestPath);
  const problems = [];
  let m;
  try {
    m = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    return [{ kind: "unparseable", detail: String(e.message) }];
  }
  const sources = m?.event_manifest?.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    return [{ kind: "no source register", detail: `${rel} declares no sources` }];
  }

  /* The event's raw directory, named by the manifest rather than guessed at. */
  const withPath = sources.find((s) => s.path && s.path.includes("/raw/"));
  const rawDir = withPath ? join(ROOT, withPath.path, "..") : null;

  let hashed = 0;
  for (const s of sources) {
    if (!s.file || !s.sha256) {
      problems.push({ kind: "incomplete entry", detail: JSON.stringify(s).slice(0, 120) });
      continue;
    }
    const p = resolveEntry(s, rawDir);
    if (!p || !existsSync(p)) {
      problems.push({
        kind: "DECLARED BUT ABSENT",
        detail: `${s.file} is in the register of ${rel} but not in the repository`,
      });
      continue;
    }
    const actual = sha256(p);
    if (actual !== s.sha256) {
      problems.push({
        kind: "HASH MISMATCH",
        detail: `${s.file}: register says ${s.sha256.slice(0, 12)}…, file is ${actual.slice(0, 12)}…`,
      });
      continue;
    }
    hashed++;
  }

  /* READ BUT UNDECLARED, for the inputs the repository can see: every file in the event's
     raw directory must appear in the register. A product that was archived and then quietly
     dropped from the register is exactly as invisible as one that was never archived. */
  if (rawDir && existsSync(rawDir)) {
    const declared = new Set(sources.map((s) => s.file));
    for (const name of readdirSync(rawDir)) {
      if (statSync(join(rawDir, name)).isDirectory()) continue;
      if (!declared.has(name)) {
        problems.push({
          kind: "READ BUT UNDECLARED",
          detail: `${name} is archived under ${relative(ROOT, rawDir)} but absent from the register`,
        });
      }
    }
  }

  /* The geometry a coastline-distance claim rests on must name a tracked file and carry
     provenance, not a one-line string. */
  const geom = m?.event_manifest?.geometry;
  if (geom) {
    if (!geom.file || !existsSync(join(ROOT, geom.file))) {
      problems.push({ kind: "DECLARED BUT ABSENT", detail: `geometry ${geom.file} is not in the repository` });
    }
    if (!geom.provenance || Object.keys(geom.provenance).length === 0) {
      problems.push({ kind: "geometry without provenance", detail: `${geom.file} carries no provenance block` });
    }
  }

  return problems.length ? problems : { ok: true, sources: sources.length, hashed };
}

function selfTest() {
  /* Make it fire. The three shapes below are the ones that shipped, or nearly did. */
  const cases = [
    ["declared but absent", { event_manifest: { sources: [
      { file: "ne_10m_land.geojson", sha256: "0".repeat(64), path: "data/risk/nope/ne_10m_land.geojson" }] } }, true],
    ["bare basename resolving to nothing", { event_manifest: { sources: [
      { file: "ne_10m_land.geojson", sha256: "0".repeat(64) }] } }, true],
    ["no register at all", { event_manifest: { sources: [] } }, true],
    ["geometry without provenance", { event_manifest: {
      sources: [{ file: "x", sha256: "0".repeat(64), path: "README.md" }],
      geometry: { file: "README.md", provenance: {} } } }, true],
  ];
  const tmp = join(ROOT, ".risk-provenance-selftest.json");
  const bad = [];
  for (const [name, doc, mustFail] of cases) {
    writeFileSync(tmp, JSON.stringify(doc));
    const r = checkManifest(tmp);
    const failed = Array.isArray(r);
    if (failed !== mustFail) bad.push(`${mustFail ? "missed" : "false positive"}: ${name}`);
  }
  rmSync(tmp, { force: true });
  if (bad.length) {
    console.error("FAIL  the provenance gate does not do what it claims\n");
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`PASS  provenance gate self-test: ${cases.length} bad registers rejected`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

if (!existsSync(RISK)) {
  console.log("PASS  no published risk records yet (docs/risk/ absent)");
  process.exit(0);
}

const manifests = [];
for (const dir of readdirSync(RISK)) {
  const d = join(RISK, dir);
  if (!statSync(d).isDirectory()) continue;
  for (const f of readdirSync(d)) {
    if (f.endsWith(".manifest.json")) manifests.push(join(d, f));
  }
}

if (manifests.length === 0) {
  console.error("FAIL  docs/risk/ exists but publishes no manifest");
  console.error("      A risk record without a machine-readable manifest has no provenance to check.");
  process.exit(1);
}

let failed = false;
for (const mp of manifests) {
  const r = checkManifest(mp);
  const rel = relative(ROOT, mp);
  if (Array.isArray(r)) {
    failed = true;
    console.error(`FAIL  ${rel}`);
    for (const p of r) console.error(`        [${p.kind}] ${p.detail}`);
  } else {
    console.log(`PASS  ${rel}`);
    console.log(`        ${r.hashed}/${r.sources} declared inputs present and hash-matched`);
  }
}
process.exit(failed ? 1 : 0);
