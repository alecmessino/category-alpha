#!/usr/bin/env node
/* THE FROZEN-VERSUS-LIVE CONTRACT, PROVED IN BOTH DIRECTIONS.
 *
 * The Lala dossier is a point-in-time artifact. It used to compute from the mutable Storm Atlas
 * pack and publish that pack's stamp as its own provenance, so the genesis ingest -- which
 * rebuilds the pack about four times a day -- restamped the artifact and turned the byte-identity
 * gate red on a document nothing had changed. Measured across three ingests, exactly one field
 * moved: `archive_stamp`. Structurally so, because the ingest revises 2026 PROVISIONAL rows, the
 * cohort excludes them, and the stamp hashes the whole pack.
 *
 * The fix pins the archive bytes beside the dossier. That creates two failure modes which look
 * alike from a distance and must never be confused:
 *
 *   SOURCE INTEGRITY  the frozen bytes are not the bytes the pin describes. The dossier cannot
 *                     claim its vintage. HARD FAIL, in the generator, before anything computes.
 *   FACT DRIFT        the frozen source is intact but a derived value moved. The generator MUST
 *                     still emit it, so the byte-identity gate can name the field -- a refusal
 *                     here would hide the one diff a reader needs to decide whether to republish.
 *
 * Four mutations prove the distinction, each in a scratch copy of the tree so nothing committed
 * is touched.
 *
 * Run: node scripts/test-dossier-frozen.mjs
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failed = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

/* A scratch tree carrying everything the dossier build and check read. Copied rather than
   mutated in place, because a test that edits the committed dossier to prove a point is a test
   that can leave the repository wrong when it dies halfway. */
async function scratchTree() {
  const dir = await mkdtemp(join(tmpdir(), "dossier-frozen-"));
  for (const p of ["scripts", "docs/dossier", "docs/storm-atlas/data", "docs/storm-atlas/src",
    "docs/data"]) {
    await cp(join(ROOT, p), join(dir, p), { recursive: true });
  }
  return dir;
}

const run = (dir, script) => {
  try {
    const out = execFileSync(process.execPath, [join(dir, "scripts", script)],
      { cwd: dir, stdio: "pipe", encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || "") + String(e.stderr || "") };
  }
};

const pinPath = (d) => join(d, "docs/dossier/lala/data/archive-pin.json");
const readPin = async (d) => JSON.parse(await readFile(pinPath(d), "utf8"));
const writePin = async (d, pin) => writeFile(pinPath(d), JSON.stringify(pin, null, 1) + "\n");
const sha = (buf) => "sha256:" + createHash("sha256").update(buf).digest("hex");

/* ---- baseline ------------------------------------------------------------------------------ */
console.log("\n[0] the committed dossier, untouched");
{
  const d = await scratchTree();
  try {
    const build = run(d, "build-dossier-lala.mjs");
    ok("the generator completes against the frozen archive", build.code === 0,
      build.out.split("\n").slice(-6).join("\n        "));
    const check = run(d, "check-dossier-lala.mjs");
    ok("and every dossier check passes", check.code === 0,
      check.out.split("\n").filter((l) => /FAIL/.test(l)).join("\n        "));
  } finally { await rm(d, { recursive: true, force: true }); }
}

/* ---- A. the live pack moves; the frozen artifact does not care ------------------------------ */
console.log("\n[A] the LIVE archive advances — the frozen dossier stays valid");
{
  const d = await scratchTree();
  try {
    /* Advance the live manifest the way an ingest does: a new stamp, everything else intact.
       This is the exact event that used to turn the gate red. */
    const p = join(d, "docs/storm-atlas/data/atlas-manifest.json");
    const live = JSON.parse(await readFile(p, "utf8"));
    live.archive_stamp = "0000feedfacecafe";
    await writeFile(p, JSON.stringify(live, null, 1) + "\n");

    const build = run(d, "build-dossier-lala.mjs");
    ok("the generator still completes", build.code === 0, build.out.slice(-300));
    const check = run(d, "check-dossier-lala.mjs");
    ok("[2] and [3] stay green with the live pack ahead", check.code === 0,
      check.out.split("\n").filter((l) => /FAIL/.test(l)).join("\n        "));
    ok("and the drift is REPORTED rather than failed",
      /FROZEN DOSSIER != CURRENT ARCHIVE/.test(check.out),
      "the diagnostic should name the divergence it just tolerated");
    /* THE POINT OF THE WHOLE PR: the artifact keeps the PIN's stamp, and never picks up the
       live pack's. Asserted both ways -- present, and the live one absent -- because a check
       that only looked for the pinned value would pass on a file carrying both. */
    const rebuilt = await readFile(join(d, "docs/dossier/lala/facts.json"), "utf8");
    const pinned = (await readPin(d)).archive_stamp;
    ok(`the published stamp is still the pinned one (${pinned})`, rebuilt.includes(pinned),
      "a live-pack change must not restamp a frozen artifact");
    ok("and the live pack's stamp is nowhere in the artifact",
      !rebuilt.includes("0000feedfacecafe"),
      "the frozen dossier picked up an identity it was not built from");
  } finally { await rm(d, { recursive: true, force: true }); }
}

/* ---- B. frozen bytes move without their hash ------------------------------------------------ */
console.log("\n[B] a frozen byte changes and its hash does not — INTEGRITY, hard fail");
{
  const d = await scratchTree();
  try {
    const f = join(d, "docs/dossier/lala/data/archive/atlas-core-v1.bin.gz");
    const buf = await readFile(f);
    buf[buf.length - 1] ^= 0xff;            // one bit, deep in the pack
    await writeFile(f, buf);
    const build = run(d, "build-dossier-lala.mjs");
    ok("the generator refuses to build", build.code !== 0);
    ok("and says the vintage cannot be claimed",
      /INTEGRITY FAILURE/.test(build.out) && /atlas-core-v1\.bin\.gz/.test(build.out),
      build.out.split("\n").slice(-4).join("\n        "));
  } finally { await rm(d, { recursive: true, force: true }); }
}

/* ---- C. published provenance disagrees with the pin ----------------------------------------- */
console.log("\n[C] the dossier claims a stamp the pin does not name — [3] fails");
{
  const d = await scratchTree();
  try {
    /* Mutate the COMMITTED facts, not the pin: this is the shape of a dossier republished
       against one archive while still carrying another's identity. */
    const p = join(d, "docs/dossier/lala/facts.json");
    const facts = JSON.parse(await readFile(p, "utf8"));
    facts.archive_provenance.archive_stamp = "deadbeefdeadbeef";
    await writeFile(p, JSON.stringify(facts, null, 2) + "\n");
    const check = run(d, "check-dossier-lala.mjs");
    ok("the check fails", check.code !== 0);
    ok("and names the pin as the authority",
      /the pin names c3998bd7bd784a62/.test(check.out),
      check.out.split("\n").filter((l) => /FAIL/.test(l)).slice(0, 3).join("\n        "));
  } finally { await rm(d, { recursive: true, force: true }); }
}

/* ---- C2. a pin that names nothing must not pass vacuously ----------------------------------- */
console.log("\n[C2] a pin with no stamp cannot make [3] trivially true");
{
  const d = await scratchTree();
  try {
    const pin = await readPin(d);
    delete pin.archive_stamp;
    await writePin(d, pin);
    const check = run(d, "check-dossier-lala.mjs");
    ok("the check fails rather than comparing against nothing", check.code !== 0);
    ok("and says the pin names no stamp",
      /the pin names archive_stamp/.test(check.out),
      check.out.split("\n").filter((l) => /FAIL/.test(l)).slice(0, 2).join("\n        "));
  } finally { await rm(d, { recursive: true, force: true }); }
}

/* ---- D. valid frozen source, hash updated, a derived fact moves ----------------------------- */
console.log("\n[D] the frozen source legitimately changes — FACT DRIFT, [2] names the field");
{
  const d = await scratchTree();
  try {
    /* SWAPPING THE WHOLE PACK FOR TODAY'S DOES NOT WORK HERE, and the reason is the finding
       this PR rests on: measured across vintages, every archive-derived value in the dossier is
       byte-identical, because the ingest only revises provisional rows the cohort excludes. A
       mutation that changes nothing proves nothing.

       So this moves a value the dossier actually publishes from the frozen archive -- the storm
       count on the masthead's citation line -- and re-hashes the pin so SOURCE INTEGRITY REMAINS
       VALID. That is the whole point: intact source, moved fact. */
    const frozen = join(d, "docs/dossier/lala/data/archive");
    const mPath = join(frozen, "atlas-manifest.json");
    const m = JSON.parse(await readFile(mPath, "utf8"));
    m.counts.storms = m.counts.storms + 1;
    await writeFile(mPath, JSON.stringify(m, null, 1) + "\n");
    const pin = await readPin(d);
    pin.files["atlas-manifest.json"] = sha(await readFile(mPath));
    await writePin(d, pin);

    /* THE COMMITTED OUTPUTS ARE PUT BACK BETWEEN THE TWO RUNS, and that is not incidental.
       Running the generator first overwrites the very artifact the byte-identity gate is meant
       to compare against, so the check then compares the drift with itself and passes -- which
       is exactly what the first draft of this test did, and why it reported a green [2] over a
       fact that had moved. Snapshot, build, restore, check. */
    const outDir = join(d, "docs/dossier/lala");
    const snap = await mkdtemp(join(tmpdir(), "dossier-committed-"));
    await cp(outDir, snap, { recursive: true });

    const build = run(d, "build-dossier-lala.mjs");
    ok("the generator COMPLETES — drift is not an integrity failure", build.code === 0,
      build.out.split("\n").slice(-4).join("\n        "));
    ok("and the rebuilt facts carry the moved value",
      JSON.parse(await readFile(join(outDir, "facts.json"), "utf8"))
        .archive_provenance.storms === m.counts.storms,
      "the mutation did not reach the generated output, so this proves nothing");

    await rm(outDir, { recursive: true, force: true });
    await cp(snap, outDir, { recursive: true });
    await rm(snap, { recursive: true, force: true });

    const check = run(d, "check-dossier-lala.mjs");
    ok("[2] fails", check.code !== 0);
    ok("and names the file whose content moved",
      /FAIL\s+facts\.json/.test(check.out),
      check.out.split("\n").filter((l) => /FAIL/.test(l)).slice(0, 4).join("\n        "));
  } finally { await rm(d, { recursive: true, force: true }); }
}

console.log(failed
  ? `\n${failed} frozen-archive contract check(s) failed\n`
  : "\nintegrity is a hard failure, fact drift is a reported diff, and a newer live pack is neither\n");
process.exit(failed ? 1 : 0);
