#!/usr/bin/env node
/* Does the Epistemic Key define what the engine actually says?
 *
 * The Storm Atlas prints a refusal as a status line and explains that status once, in a key at
 * the foot of every panel. That only works while the two are the same sentence. The wording is
 * authored in docs/app/claims.js beside every other claim; the engine that DECIDES to refuse
 * lives in docs/storm-atlas/src/engine/analogs.js and carries its own copy of the string,
 * because it also runs in Node for the parity test where no claim registry exists.
 *
 * Two copies of a string is a drift waiting to happen, so this is the gate that makes it safe:
 * it reads both and requires them to be identical, character for character. The same argument
 * as the methodology version, which the browser also declares twice and which
 * scripts/test-atlas-parity.mjs also refuses to let diverge.
 *
 * It also checks the direction nobody thinks about: that the key defines every mark the panels
 * use, so a panel cannot introduce a sixth kind of refusal that the reader has no way to look
 * up.
 *
 * Run: node scripts/test-atlas-refusals.mjs
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLAIMS = join(ROOT, "docs/app/claims.js");
const ANALOGS = join(ROOT, "docs/storm-atlas/src/engine/analogs.js");
const UI = join(ROOT, "docs/storm-atlas/src/ui");

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

/* The registry is a plain object literal inside an IIFE that expects a browser. Rather than
   stand up a fake `window`, the object is read out of the source the same way audit-claims.mjs
   reads the claim ids -- from the text that ships. */
const claims = await readFile(CLAIMS, "utf8");
const block = claims.slice(claims.indexOf("var REFUSALS = {"));
const marks = [...block.slice(0, block.indexOf("\n  };")).matchAll(
  /\n    (\w+): \{\n\s*mark: "([^"]+)",\n\s*status: "((?:[^"\\]|\\.)*)"/g)]
  .map((m) => ({ key: m[1], mark: m[2], status: m[3] }));

console.log("\n[1] the registry is well formed");
{
  ok("six marks are declared", marks.length === 6, `found ${marks.length}`);
  ok("every key names its own mark", marks.every((m) => m.key === m.mark),
    marks.filter((m) => m.key !== m.mark).map((m) => m.key).join(", "));
  ok("every mark carries a status", marks.every((m) => m.status.length > 2));
  const glosses = [...block.matchAll(/gloss:/g)].length;
  ok("every mark carries a gloss for the key", glosses >= 6, `${glosses} glosses`);
  const uniq = new Set(marks.map((m) => m.status));
  ok("no two marks share a status", uniq.size === marks.length,
    "a shared status makes the key ambiguous about which mark a panel meant");
}

console.log("\n[2] the statuses are the engine's, verbatim");
{
  const byKey = Object.fromEntries(marks.map((m) => [m.key, m.status]));
  const analogs = await readFile(ANALOGS, "utf8");

  /* THE TWO REFUSALS METHODOLOGY 1.1.0 SPLIT. Before it there was one, and its sentence -- "no
     cohort you can build changes that" -- was false for eleven of the twelve contracts the
     archive holds. `base` is now only the irreducible case, counted ARCHIVE-WIDE; `oos` is the
     resolvable one, counted over the population the query can actually reach. Both are built
     inside getAnalogs per region and kind, so both are matched against the source literal
     rather than by running a query. A key that documented only one of them would leave a
     reader looking at a status with no row to look it up in -- which is what this file is
     for. */
  for (const [key, want] of [["base", "BASE RATE ONLY -- unscoreable"],
                             ["oos", "OUT OF SCOPE -- unscoreable here"]]) {
    const seen = analogs.includes(`status: "${want}"`);
    ok(`analogs.js still publishes the \`${key}\` status`, seen,
      "the literal moved; this gate can no longer see it");
    ok(`\`${key}\` is exactly that status`, byKey[key] === want,
      `registry ${JSON.stringify(byKey[key])} vs engine ${JSON.stringify(want)}`);
  }

  /* `notev` is the archive's withheld Saffir-Simpson class. The archive publishes the absence,
     the pack carries it as a null category, and the storm panel is where it surfaces. */
  ok("`notev` is the archive's withheld-class wording", byKey.notev === "WITHHELD");
  ok("`unk` is the em-dash convention, not a word", byKey.unk === "— UNKNOWN");
}

console.log("\n[3] the panels use no mark the key does not define");
{
  /* The Atlas defines its states once, in ui/refusal.jsx, and each declares the Epistemic Key
     row it corresponds to. Reading that file rather than re-listing the states here keeps this
     gate from becoming the third copy of the thing it exists to stop drifting. */
  const src = await readFile(join(UI, "refusal.jsx"), "utf8");
  const states = [...src.matchAll(/\n    kind: "(\w+)",\n\s*claim: "(\w+)",\n\s*title: "([^"]+)"/g)]
    .map((m) => ({ kind: m[1], claim: m[2], title: m[3] }));
  ok("refusal.jsx declares six states", states.length === 6, `found ${states.length}`);

  const declared = new Set(marks.map((m) => m.mark));
  ok("every Atlas state has a row in the Epistemic Key",
    states.every((st) => declared.has(st.claim)),
    states.filter((st) => !declared.has(st.claim)).map((st) => st.kind).join(", ") +
    " — a reader would meet this status with nowhere to look it up");

  /* Every panel that can print a refusal, named explicitly. A glob would quietly stop covering
     a panel the day someone renamed one, which is the failure this is meant to catch. */
  const PANELS = ["evidence-deck.jsx", "cohort-builder.jsx", "env-lens.jsx",
                  "calibration.jsx", "storm-panel.jsx", "atlas.jsx", "kit.jsx"];
  const byKind = new Map(states.map((st) => [st.kind, st]));
  const seen = new Set();
  const bad = [];
  for (const f of PANELS) {
    let text;
    try { text = await readFile(join(UI, f), "utf8"); }
    catch { bad.push(`${f}: named by this gate and not on disk`); continue; }
    /* The whole opening tag, because a call site may carry a React key or a status override
       before the kind -- matching only the first attribute would silently miss a mark. */
    for (const tag of text.matchAll(/<Refusal\b([^>]*)>/g)) {
      const k = /\bkind=\{?["'{]?([A-Za-z_.]+)/.exec(tag[1]);
      if (!k) { bad.push(`${f}: <Refusal> with no kind`); continue; }
      const kind = k[1].replace(/^REFUSALS\./, "");
      /* A computed kind (refusalKindOf(u), a variable) cannot be resolved statically. It is
         still covered: the value can only come from REFUSALS, and check-atlas-dom.mjs drives
         the real states onto a real screen. */
      if (/^[A-Z_]+$/.test(kind)) {
        seen.add(kind);
        if (!byKind.has(kind)) bad.push(`${f}: ${kind}`);
      }
    }
  }
  ok("every rendered state is one refusal.jsx defines", bad.length === 0, bad.join(", "));

  /* AND EVERY STATE IS REACHABLE, WHICH IS THE STRONGER CLAIM AND THE ONE WORTH MAKING.
   *
   * This used to assert only that more than one kind reached a panel, and it was satisfied by
   * `outcome-card.jsx` -- a ladder and a rate line that no surface has rendered since the deck
   * replaced them. Dead JSX that still names refusal kinds is exactly the code that goes on
   * satisfying a coverage rule while nothing renders it, so the file was removed and the rule
   * had to say what it actually meant.
   *
   * The four ROW refusals do not reach the screen as literal <Refusal> tags at all: a refused row
   * carries a mark and a status word, and its sentence is printed once per governing refusal in
   * the deck's limits block, through `REFUSALS[kind]` with the kind computed from the cell. The
   * table that decides which mark each kind takes -- MARK_OF_KIND in evidence-deck.jsx -- is
   * therefore the honest place to read the row kinds from, and between it and the literal call
   * sites every one of the six states must be accounted for. check-atlas-dom.mjs is the other
   * half: it drives the real states onto a real screen and reads the words back. */
  const deck = await readFile(join(UI, "evidence-deck.jsx"), "utf8");
  const markTable = deck.slice(deck.indexOf("const MARK_OF_KIND"), deck.indexOf("export function markGroupOf"));
  const marked = new Set([...markTable.matchAll(/^\s*([A-Z_]+):/gm)].map((m) => m[1]));
  ok("the deck's mark table names a mark for every row refusal",
    ["RATE_REFUSED", "BASE_RATE_ONLY", "OUT_OF_SCOPE", "CONDITIONED_ON", "NOT_EVALUABLE", "UNKNOWN"]
      .every((k) => marked.has(k)),
    `mark table holds ${[...marked].join(", ")}`);
  const reachable = new Set([...seen, ...marked]);
  const unreachable = states.filter((st) => !reachable.has(st.kind)).map((st) => st.kind);
  ok("every state refusal.jsx defines can reach the surface", unreachable.length === 0,
    `${unreachable.join(", ")} is defined and nothing on the surface can print it`);
}

console.log(failures
  ? `\n${failures} refusal-registry check(s) failed — the key and the engine disagree\n`
  : "\nthe key defines exactly what the engine says\n");
process.exit(failures ? 1 : 0);
