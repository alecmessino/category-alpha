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
import { UNSCOREABLE_REQUIRES_CANONICAL } from "../docs/storm-atlas/src/engine/analogs.js";

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
  ok("five marks are declared", marks.length === 5, `found ${marks.length}`);
  ok("every key names its own mark", marks.every((m) => m.key === m.mark),
    marks.filter((m) => m.key !== m.mark).map((m) => m.key).join(", "));
  ok("every mark carries a status", marks.every((m) => m.status.length > 2));
  const glosses = [...block.matchAll(/gloss:/g)].length;
  ok("every mark carries a gloss for the key", glosses >= 5, `${glosses} glosses`);
  const uniq = new Set(marks.map((m) => m.status));
  ok("no two marks share a status", uniq.size === marks.length,
    "a shared status makes the key ambiguous about which mark a panel meant");
}

console.log("\n[2] the statuses are the engine's, verbatim");
{
  const byKey = Object.fromEntries(marks.map((m) => [m.key, m.status]));
  ok("`refused` is exactly what analogs.js returns for a rate it will not compute",
    byKey.refused === UNSCOREABLE_REQUIRES_CANONICAL.status,
    `registry ${JSON.stringify(byKey.refused)} vs engine ` +
    JSON.stringify(UNSCOREABLE_REQUIRES_CANONICAL.status));

  /* The archive-scarcity refusal is built per region and kind inside getAnalogs, so its status
     is matched against the source literal rather than by running a query. */
  const analogs = await readFile(ANALOGS, "utf8");
  const m = /status: "((?:[^"\\]|\\.)*)",\n\s*reason: `only \$\{n\} storm\(s\)/.exec(analogs);
  ok("analogs.js still publishes an archive-scarcity status", !!m,
    "the literal moved; this gate can no longer see it");
  if (m) {
    ok("`base` is exactly that status", byKey.base === m[1],
      `registry ${JSON.stringify(byKey.base)} vs engine ${JSON.stringify(m[1])}`);
  }
  /* `notev` is the archive's withheld Saffir-Simpson class. The archive publishes the absence,
     the pack carries it as a null category, and the storm panel is where it surfaces. */
  ok("`notev` is the archive's withheld-class wording", byKey.notev === "WITHHELD");
  ok("`unk` is the em-dash convention, not a word", byKey.unk === "— UNKNOWN");
}

console.log("\n[3] the panels use no mark the key does not define");
{
  const declared = new Set(marks.map((m) => m.mark));
  const seen = new Set();
  const bad = [];
  for (const f of ["probe-panel.jsx", "storm-panel.jsx", "atlas.jsx", "kit.jsx", "rail.jsx"]) {
    const text = await readFile(join(UI, f), "utf8");
    /* The whole opening tag, because a call site may carry a React key or a status override
       before the kind -- matching only the first attribute would silently miss a mark. */
    for (const tag of text.matchAll(/<Refusal\b([^>]*)>/g)) {
      const k = /\bkind="(\w+)"/.exec(tag[1]);
      if (!k) { bad.push(`${f}: <Refusal> with no kind`); continue; }
      seen.add(k[1]);
      if (!declared.has(k[1])) bad.push(`${f}: ${k[1]}`);
    }
  }
  ok("every rendered mark is declared", bad.length === 0, bad.join(", "));
  ok("the surface actually uses more than one", seen.size >= 3,
    `only ${[...seen].join(", ")} reach a panel`);
  /* A key row for a mark nothing can print is furniture. Each of the five has to be reachable
     from real archive data, which is what check-atlas-dom.mjs then exercises on the screen. */
  const unreachable = [...declared].filter((d) => !seen.has(d));
  ok("no key row describes a mark no panel can print", unreachable.length === 0,
    unreachable.join(", "));
}

console.log(failures
  ? `\n${failures} refusal-registry check(s) failed — the key and the engine disagree\n`
  : "\nthe key defines exactly what the engine says\n");
process.exit(failures ? 1 : 0);
