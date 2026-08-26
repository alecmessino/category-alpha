#!/usr/bin/env node
/* THE COMMITTED DOSSIER MUST BE WHAT THE GENERATOR PRODUCES.
 *
 * /dossier/lala is a point-in-time document that quotes 115 kt, 61 km, 1/26 and 141 ledger entries
 * as facts. Two ways it could stop being true without anyone noticing:
 *
 *   1. Someone edits docs/dossier/lala/index.html by hand. The page then says something the facts
 *      do not, and scripts/build-dossier-lala.mjs would silently revert it on the next run.
 *   2. An input moves under it. The b-deck, the SHIPS series, the ledger slice and the calibration
 *      state are all PINNED under docs/dossier/lala/data/ precisely so they cannot; the archive
 *      pack is not, and it carries the stamp the masthead prints.
 *
 * So this gate regenerates every output into a scratch tree and requires byte identity with what
 * is committed. A failure is not a puzzle: run `node scripts/build-dossier-lala.mjs` and commit the
 * result, having first read what changed and confirmed the document still says what it should.
 *
 * Run: node scripts/check-dossier-lala.mjs
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = join(ROOT, "docs/dossier/lala");

let failed = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

/* Every generated file, relative to docs/dossier/lala. data/ is input, not output. */
async function outputs(dir, base = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.name === "data" || e.name === "screenshots") continue;
    if (e.isDirectory()) out.push(...await outputs(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

console.log("\n[1] the generator runs");
const scratch = await mkdtemp(join(tmpdir(), "dossier-"));
try {
  /* Regenerate in place, having stashed the committed outputs, then compare and restore. The
     generator writes only into docs/dossier/lala, so a copy of that directory is the whole state. */
  const before = await outputs(LIVE);
  ok("the committed dossier has output files", before.length > 0);
  for (const f of before) await cp(join(LIVE, f), join(scratch, f), { recursive: true, force: true })
    .catch(async () => { await cp(join(LIVE, f), join(scratch, f)); });

  let ran = true;
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts/build-dossier-lala.mjs")],
      { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    ran = false;
    ok("scripts/build-dossier-lala.mjs exits 0", false,
      String(e.stderr || e.stdout || e.message).split("\n").slice(-8).join("\n        "));
  }
  if (ran) ok("scripts/build-dossier-lala.mjs exits 0", true);

  console.log("\n[2] every committed output is byte-identical to a fresh build");
  const after = await outputs(LIVE);
  ok(`the file set is unchanged (${after.length} files)`, after.join("|") === before.join("|"),
    `committed: ${before.join(", ")}\n        rebuilt:  ${after.join(", ")}`);
  for (const f of after) {
    const [a, b] = await Promise.all([
      readFile(join(scratch, f)).catch(() => null), readFile(join(LIVE, f)),
    ]);
    ok(f, a !== null && a.equals(b),
      a === null ? "not present in the committed tree"
        : `${a.length} committed bytes vs ${b.length} rebuilt — run node scripts/build-dossier-lala.mjs and commit`);
  }

  /* THE COMMITTED STAMP, READ FROM THE STASH -- NOT FROM THE TREE [1] JUST REGENERATED.
     This check read facts.json out of LIVE, which step [1] had already overwritten, so it
     compared a freshly-built stamp against the manifest that built it and could never fail. It
     reported `ok archive stamp c3998bd7bd784a62 is the current pack's` on a run where [2] was
     failing precisely because the COMMITTED masthead still printed d4c919a670f68bb2. A check
     written to catch a stale stamp was green on a stale stamp. It reads the stash now. */
  console.log("\n[3] the masthead's archive stamp matches the pack it claims");
  const facts = JSON.parse(await readFile(join(scratch, "facts.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(ROOT, "docs/storm-atlas/data/atlas-manifest.json"), "utf8"));
  const stamp = facts.archive_provenance.archive_stamp;
  const packStamp = manifest.stamp ?? manifest.archive_stamp;
  ok("the manifest carries a stamp to compare against", typeof packStamp === "string" && packStamp.length > 0,
    "no stamp field in atlas-manifest.json -- this check would otherwise pass vacuously");
  ok(`the committed masthead prints the current pack's stamp (${stamp})`, stamp === packStamp,
    `the pack in the tree is ${packStamp}; the committed page prints ${stamp}. The archive was `
    + "rebuilt under the dossier -- regenerate it and re-shoot the screenshots, which print it too.");

  console.log("\n[4] the pinned inputs are pinned, not read live");
  const gen = await readFile(join(ROOT, "scripts/build-dossier-lala.mjs"), "utf8");
  for (const live of ["docs/data/forecast-log.json", "docs/data/calibration.json"]) {
    ok(`${live} is not read at build time`,
      !new RegExp(`readFile\\([^)]*${live.replace(/[.\/]/g, "\\$&")}`).test(gen),
      "a refreshed live file would silently restate what Millibar recorded about a past storm");
  }
  for (const pin of ["bdeck-cp012026.dat", "env-ships-rt.json",
    "forecast-log-cp012026.json", "calibration.json"]) {
    const p = join(LIVE, "data", pin);
    ok(`data/${pin} is committed`, await readFile(p).then(() => true, () => false));
  }
} finally {
  /* AND PUT THE TREE BACK. The generator writes in place, so without this a FAILING run leaves
     regenerated files behind as uncommitted changes -- the next `git status` shows a diff nobody
     made, and re-running the gate then compares the rebuild against itself and passes. A check
     that launders its own failure on the second run is worse than no check. */
  try {
    for (const f of await outputs(LIVE)) {
      const stashed = await readFile(join(scratch, f)).catch(() => null);
      if (stashed) await writeFile(join(LIVE, f), stashed);
    }
  } catch { /* the scratch copy is gone; nothing to restore from */ }
  await rm(scratch, { recursive: true, force: true });
}

console.log(failed
  ? `\n${failed} dossier check(s) failed — the committed page is not what the generator produces\n`
  : "\nthe committed dossier is exactly what scripts/build-dossier-lala.mjs produces\n");
process.exit(failed ? 1 : 0);
