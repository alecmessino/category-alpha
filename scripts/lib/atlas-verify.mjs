/* Getting the archive's own answers, so the browser's can be checked against them.
 *
 * The Atlas ships a transliteration of scripts/genesis/retrieval/analogs.py. Proving the two
 * agree needs the Python's answers, and those are a function of an archive that is rebuilt four
 * times a day -- so they are generated on demand rather than committed. A committed copy would
 * churn megabytes into git and would test whatever the archive looked like when someone last
 * remembered to regenerate it.
 *
 * IT FAILS LOUDLY WHEN IT CANNOT RUN. If Python or pyarrow is missing this exits 2 rather than
 * skipping, for the same reason scripts/check-jsx.mjs does: a gate that quietly passes when its
 * own tooling is absent reports green for a check it never ran.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BUILD_DIR = join(ROOT, ".atlas-build");

/** Run `genesis.cli atlas-verify` unless the artefact is already current. */
export function ensureVerification(what, file, { force = false } = {}) {
  const path = join(BUILD_DIR, file);
  if (!force && existsSync(path) && isCurrent(path)) return JSON.parse(readFileSync(path, "utf8"));

  const r = spawnSync("python3", ["-m", "genesis.cli", "atlas-verify", "--what", what,
                                  "--out", BUILD_DIR],
    { cwd: join(ROOT, "scripts"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    console.error("[atlas] could not generate the archive's own answers.");
    console.error("[atlas] this needs python3 with scripts/genesis/requirements.txt installed;");
    console.error("[atlas] without it there is no authority to compare the browser against.");
    if (r.stderr) console.error(String(r.stderr).split("\n").slice(-12).join("\n"));
    process.exit(2);
  }
  if (r.stdout) process.stdout.write(r.stdout);
  return JSON.parse(readFileSync(path, "utf8"));
}

/* An artefact is stale when the archive changes underneath it OR when the code that generates
   it changes. Watching only the archive was a real bug: editing the emitter left a cached file
   in place and the test compared the browser against a shape the emitter no longer produced.
   Comparing mtimes is enough and avoids re-hashing 6 MB of Parquet on every run. */
const SOURCES = [
  "data/genesis-archive",
  "scripts/genesis/build/emit_atlas_parity.py",
  "scripts/genesis/build/build_atlas_pack.py",
  "scripts/genesis/retrieval/analogs.py",
  "scripts/genesis/schema.py",
  "scripts/genesis/provenance.py",
];

function isCurrent(path) {
  const t = statSync(path).mtimeMs;
  for (const rel of SOURCES) {
    const p = join(ROOT, rel);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      for (const f of readdirSync(p)) {
        if (!f.endsWith(".parquet") && f !== "MANIFEST.json") continue;
        if (statSync(join(p, f)).mtimeMs > t) return false;
      }
    } else if (st.mtimeMs > t) return false;
  }
  return true;
}
