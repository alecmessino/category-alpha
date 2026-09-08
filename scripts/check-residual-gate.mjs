#!/usr/bin/env node
/* THE GATE'S OWN GATE: prove §14 can still fail.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT OPTIONAL. Section 14 of scripts/test-track-residual.mjs is
 * the sign-off for Q1: it cross-reads docs/TRACK-RESIDUAL.md and research/track-residual/
 * Q1-WRITEUP.md against Q1-RESULT.json so that no figure in either document is a figure a reviewer
 * has to check by hand. A checker like that is worth exactly what its failures are worth, and its
 * failures are invisible while everything agrees.
 *
 * THE FIRST VERSION OF §14 WAS GREEN AND WRONG. It asked whether a passage of a document contained
 * the right number in the right context. Both documents state several of these figures TWICE —
 * once in a summary table, once in prose — so changing one copy left the other to satisfy the
 * check, and a stale figure sailed through. That was not discovered by reading the code. It was
 * discovered by changing a number and watching the suite stay green.
 *
 * So the mutations are kept, and they run. Each one below is a specific way the documents and the
 * artefact can drift apart; each is applied, the suite is required to FAIL, and the failure is
 * required to name the right thing rather than merely to happen. A gate that fails for the wrong
 * reason is a gate that gets "fixed" by suppressing the wrong message.
 *
 * SAFETY, because this writes to tracked files. Two independent belts:
 *   1. It REFUSES to run when any file it touches has uncommitted changes, so git alone can
 *      always restore the tree even if this process is killed mid-mutation.
 *   2. Every original is held in memory and restored in a finally block, and on SIGINT/SIGTERM.
 * An earlier ad-hoc version of this battery used `git checkout --` to undo a mutation and
 * destroyed uncommitted work in a neighbouring file. That is why restore is from memory here and
 * why the clean-tree check exists.
 *
 * Run: node scripts/check-residual-gate.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUITE = join(ROOT, "scripts/test-track-residual.mjs");

const DOCS = "docs/TRACK-RESIDUAL.md";
const WRITEUP = "research/track-residual/Q1-WRITEUP.md";
const ARTEFACT = "research/track-residual/Q1-RESULT.json";
const LIB = "scripts/lib/track-residual.mjs";
const TOUCHED = [DOCS, WRITEUP, ARTEFACT, LIB];

let failed = 0, checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  if (cond) { console.log("  ok    " + label); return true; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
  return false;
};

/** Run the suite. Returns {exit, out} rather than throwing — a non-zero exit is the point. */
function runSuite() {
  try {
    const out = execFileSync(process.execPath, [SUITE], { cwd: ROOT, encoding: "utf8" });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status ?? 1, out: String(e.stdout || "") + String(e.stderr || "") };
  }
}

/* ---------------------------------------------------------------- the mutations */

/* Each: a name, the file it touches, a transform (null return = delete the file), and a fragment
   the failure output must contain. The fragment is what makes this a test of the RIGHT failure. */
const MUTATIONS = [
  {
    name: "one of two copies in the summary doc goes stale (the table's exact-row count)",
    file: DOCS,
    apply: (t) => t.replace("| **6890** of **6907** |", "| **6889** of **6907** |"),
    expect: "agrees with the artefact on rows matching the deck",
    why: "both documents state this figure twice; the first version of §14 let the prose copy "
       + "vouch for a stale table copy",
  },
  {
    name: "one of two copies in the write-up goes stale (the frame table's cross-delta)",
    file: WRITEUP,
    apply: (t) => t.replace("| Cross-track difference | **0.63 nm**", "| Cross-track difference | **0.73 nm**"),
    expect: "agrees with the artefact on frame sensitivity",
    why: "same shape as above, in the other document and on a negative result",
  },
  {
    name: "the artefact moves and both documents stay put",
    file: ARTEFACT,
    apply: (t) => { const j = JSON.parse(t); j.q1a_parse.stormsAgreeingExactly -= 1; return JSON.stringify(j, null, 2) + "\n"; },
    expect: "agrees with the artefact on storms exact on every row",
    why: "the expected values are derived from the artefact, so a re-run that changes it must "
       + "fail every document that has not been updated",
  },
  {
    name: "a pinned figure is deleted from a document outright",
    file: WRITEUP,
    apply: (t) => t.split(/\r?\n/).filter((l) => !/no deck row at the same valid time/.test(l)).join("\n"),
    expect: "no recognised statement of this figure",
    why: "presence is required, not merely agreement — a figure cannot be retired by deletion",
  },
  {
    name: "the historical 183 refusals are stripped from the library comment",
    file: LIB,
    apply: (t) => t.replace("silently refused 183 of 634", "silently refused many"),
    expect: "coverage-guard refusals that hid the timezone bug",
    why: "the refusals that concealed the timezone bug must stay named wherever the bug is "
       + "described, library comment included",
  },
  {
    name: "a document is missing entirely",
    file: WRITEUP,
    apply: () => null,
    expect: "is present and readable",
    why: "a gate that skips when its subject is absent is not a gate",
  },
];

/* ------------------------------------------------------------------------ run */

function main() {
  console.log("\n[gate] §14 must still be able to fail\n");

  /* BELT 1: refuse to touch a dirty tree. */
  let dirty = "";
  try {
    dirty = execFileSync("git", ["status", "--porcelain", "--", ...TOUCHED],
                         { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { /* not a git checkout; the in-memory restore below still applies */ }
  if (dirty) {
    console.error("REFUSING TO RUN: these files have uncommitted changes, and this script rewrites\n"
      + "them. Commit or stash first, so git can restore the tree even if this process is killed.\n\n"
      + dirty + "\n");
    process.exit(2);
  }

  /* BELT 2: hold every original in memory and put it back no matter how this ends. */
  const originals = new Map();
  for (const rel of TOUCHED) originals.set(rel, readFileSync(join(ROOT, rel), "utf8"));
  const restore = () => {
    for (const [rel, text] of originals) writeFileSync(join(ROOT, rel), text, "utf8");
  };
  const onSignal = () => { restore(); process.exit(130); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const before = runSuite();
    if (!ok("the suite is green before any mutation", before.exit === 0,
            "there is no point testing a detector against a tree that is already failing")) {
      console.log(before.out.split("\n").filter((l) => /FAIL/.test(l)).slice(0, 5).join("\n"));
      return;
    }

    for (const m of MUTATIONS) {
      const path = join(ROOT, m.file);
      const next = m.apply(originals.get(m.file));
      if (next === null) unlinkSync(path);
      else {
        if (next === originals.get(m.file))
          { ok(`mutation applies: ${m.name}`, false, "the edit changed nothing — the text it "
               + "targets has moved, so this mutation is no longer testing anything"); continue; }
        writeFileSync(path, next, "utf8");
      }

      const r = runSuite();
      const caught = r.exit !== 0;
      const named = r.out.includes(m.expect);
      ok(`caught: ${m.name}`, caught, "the suite stayed green — " + m.why);
      ok(`  …and failed for the right reason (names "${m.expect}")`, caught && named,
         caught ? "it failed, but no message mentioned the expected subject; a gate that fails "
                + "for the wrong reason gets fixed by silencing the wrong message"
                : "it did not fail at all");

      restore();
    }

    const after = runSuite();
    ok("the suite is green again once every mutation is undone", after.exit === 0,
       "the battery has left the tree in a failing state");
  } finally {
    restore();
  }

  console.log(`\n${failed ? "FAILED" : "PASSED"} — ${checks - failed}/${checks} checks\n`);
  process.exit(failed ? 1 : 0);
}

main();
