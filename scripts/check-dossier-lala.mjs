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
     This check once read facts.json out of LIVE, which step [1] had already overwritten, so it
     compared a freshly-built stamp against the manifest that built it and could never fail. It
     reads the stash now, so it judges what is COMMITTED.

     AND IT COMPARES AGAINST THE PIN, NOT AGAINST TODAY'S LIVE PACK. That was the second half of
     the same mistake: the dossier is frozen at one archive vintage and the live pack is rebuilt
     about four times a day, so this asked a frozen claim to equal a moving target and every
     daily ingest turned it red on a document nothing had changed. The stamp the masthead prints
     must resolve to the archive the dossier was actually built from -- which is the frozen pack
     beside it, described by archive-pin.json. A newer live pack is expected and is reported by
     the drift diagnostic in [5], which cannot fail this gate. */
  console.log("\n[3] the published provenance resolves to the frozen archive pin");
  const facts = JSON.parse(await readFile(join(scratch, "facts.json"), "utf8"));
  const pin = JSON.parse(await readFile(join(LIVE, "data/archive-pin.json"), "utf8"));
  const stamp = facts.archive_provenance.archive_stamp;
  /* NON-VACUOUS, as before: a pin missing the field would otherwise make every comparison below
     trivially true, which is exactly how the previous version of this check passed on a stale
     stamp. The pin must NAME an identity before it can be compared to one. */
  for (const field of ["archive_stamp", "archive_built_utc", "methodology_version",
    "processing_version"]) {
    ok(`the pin names ${field}`,
      typeof pin[field] === "string" && pin[field].length > 0,
      `archive-pin.json has no usable ${field} -- this check would otherwise pass vacuously`);
  }
  ok("the pin declares a hash for every frozen file",
    pin.files && Object.keys(pin.files).length > 0
      && Object.values(pin.files).every((h) => /^sha256:[0-9a-f]{64}$/.test(h)),
    "archive-pin.json must describe the frozen bytes it pins, or it pins nothing");
  ok(`the committed masthead prints the pinned archive stamp (${stamp})`, stamp === pin.archive_stamp,
    `the pin names ${pin.archive_stamp}; the committed page prints ${stamp}. The dossier must `
    + "claim the vintage it was built from.");
  for (const [k, v] of [["archive_built_utc", facts.archive_provenance.archive_built_utc],
    ["methodology_version", facts.archive_provenance.methodology_version],
    ["processing_version", facts.archive_provenance.processing_version]]) {
    ok(`and its ${k} matches the pin`, v === pin[k], `pin ${pin[k]} vs published ${v}`);
  }

  console.log("\n[4] the pinned inputs are pinned, not read live");
  const gen = await readFile(join(ROOT, "scripts/build-dossier-lala.mjs"), "utf8");
  for (const live of ["docs/data/forecast-log.json", "docs/data/calibration.json"]) {
    ok(`${live} is not read at build time`,
      !new RegExp(`readFile\\([^)]*${live.replace(/[.\/]/g, "\\$&")}`).test(gen),
      "a refreshed live file would silently restate what Millibar recorded about a past storm");
  }
  for (const f of ["bdeck-cp012026.dat", "env-ships-rt.json",
    "forecast-log-cp012026.json", "calibration.json", "archive-pin.json"]) {
    const p = join(LIVE, "data", f);
    ok(`data/${f} is committed`, await readFile(p).then(() => true, () => false));
  }
  /* THE FROZEN ARCHIVE IS AN INPUT LIKE ANY OTHER, and the generator hard-fails on a hash
     mismatch before computing anything -- so [1] passing already proves integrity. What is
     asserted here is that the frozen pack is PRESENT and that the build reads it rather than the
     live one, because a build that silently fell back to docs/storm-atlas/data/ would reproduce
     the original defect under a new name. */
  ok("the build opens the frozen archive, not the live pack",
    /openArchive\(FROZEN_ARCHIVE\)/.test(gen)
      && !/openArchive\(\s*join\(ROOT,\s*"docs\/storm-atlas/.test(gen),
    "a dossier computed from the mutable pack cannot claim a frozen vintage");
  for (const f of Object.keys(pin.files)) {
    ok(`data/archive/${f} is committed`,
      await readFile(join(LIVE, "data/archive", f)).then(() => true, () => false));
  }

  /* ---- [5] LIVE VERSUS FROZEN: A DIAGNOSTIC, NEVER A VERDICT --------------------------------
   *
   * Whether today's archive still says what the frozen one said is worth knowing and must not
   * decide whether the frozen artifact is valid. A stamp change on its own is EXPECTED: the
   * ingest revises 2026 provisional rows, this cohort excludes them, and the stamp hashes the
   * whole pack. So this prints and does not fail. If a fact a reader would quote ever diverges,
   * that is a prompt to consider republishing deliberately -- never a reason to rewrite a frozen
   * document automatically. */
  console.log("\n[5] the current archive, against the frozen one — diagnostic only");
  try {
    const live = JSON.parse(await readFile(
      join(ROOT, "docs/storm-atlas/data/atlas-manifest.json"), "utf8"));
    const liveStamp = live.stamp ?? live.archive_stamp;
    if (liveStamp === pin.archive_stamp) {
      console.log(`  note  CURRENT ARCHIVE MATCHES FROZEN DOSSIER — both ${pin.archive_stamp}`);
    } else {
      console.log(`  note  FROZEN DOSSIER != CURRENT ARCHIVE — frozen ${pin.archive_stamp}, `
        + `current ${liveStamp}`);
      console.log("        Expected: the ingest rebuilds the pack several times a day and the "
        + "stamp hashes provisional rows this cohort excludes.");
      const same = live.archive_built_utc === pin.archive_built_utc
        && live.methodology_version === pin.methodology_version
        && live.processing_version === pin.processing_version;
      console.log(same
        ? "        Archive identity is otherwise unchanged: same build time, methodology and "
          + "processing version."
        : `        Archive identity HAS moved: built ${live.archive_built_utc} vs frozen `
          + `${pin.archive_built_utc}, methodology ${live.methodology_version} vs `
          + `${pin.methodology_version}, processing ${live.processing_version} vs `
          + `${pin.processing_version}. Worth a deliberate look at whether to republish.`);
    }
  } catch (e) {
    console.log(`  note  the live pack could not be read for comparison (${e.message}) — the `
      + "frozen dossier is unaffected");
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
