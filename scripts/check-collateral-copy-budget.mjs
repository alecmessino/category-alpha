#!/usr/bin/env node
/* THE WORD BUDGET.
 *
 * The artifacts are fixed-extent sheets and the prose is the only elastic thing on them, so a
 * slot's length is a layout constraint, not a style preference. Measured on this build: the
 * first drafting pass produced copy roughly twice what the page holds -- artifact A alone
 * overflowed by 802 px -- and every one of those words was correct. Length was the failure.
 *
 * Budgets are ceilings and they were derived by measurement, not taste: each is what its block
 * can carry at the type size the sheet uses. scripts/check-collateral-fit.mjs is the authority
 * on whether a page fits; this one says WHICH SLOT to cut when it does not, which is the thing
 * a browser measurement cannot tell you.
 *
 * Run: node scripts/check-collateral-copy-budget.mjs
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ROOT } from "./lib/atlas-verify.mjs";

export const BUDGETS = {
  A: { "answers.now": 44, "answers.adds": 30, "answers.commercial": 33, "lede": 34, "tag-97L": 22, "tag-KARINA": 21, "tag-95E": 22, "tag-LOWELL": 22, "atlas-value-97L": 37, "atlas-value-KARINA": 35, "atlas-value-95E": 35, "atlas-value-LOWELL": 27, "refusal-note": 51 },
  B: { "answers.now": 74, "answers.adds": 45, "answers.commercial": 57, "lede": 46, "cell-rationale": 65, "reading-the-ledger": 49, "radius-sensitivity": 32, "seasonal-timing": 45, "analog-plate-note": 29, "commercial": 142, "hole": 89 },
  B1: { "answers.now": 29, "answers.adds": 43, "answers.commercial": 30, "lede": 45, "trigger-explainability": 60, "near-miss": 81, "basis-risk": 83, "how-used": 13 },
  B2: { "answers.now": 44, "answers.adds": 33, "answers.commercial": 23, "lede": 45, "geography-not-probability": 64, "exposure-map": 68, "frequency-bands": 36, "not-this": 60 },
  C: { "answers.now": 49, "answers.adds": 45, "answers.commercial": 51, "lede": 68, "live-vs-history": 86, "land-rows": 39, "so-what": 36 },
  D: { "answers.now": 81, "answers.adds": 52, "answers.commercial": 58, "one-sentence": 59, "users-can": 140, "moat": 91, "delivery": 41, "pilot": 23, "sample-note": 41 },
};

/* SLOTS NO LONGER RENDERED. The type-gate pass cut the blocks these fed; the copy stays in
   copy.json so the cut is reversible, and it is listed here so an unused slot reads as retired
   rather than as an unbudgeted surprise. scripts/lib/collateral-cuts.mjs records why. */
export const RETIRED = {"A": ["plate-note"], "C": ["rarity"]};

export const words = (html) => String(html || "").replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim().split(" ").filter(Boolean).length;

/* Importable without running. The budgets are shared with other tooling, and a module that
   process.exit()s on import takes its importer down with it -- which it did, silently, the
   first time this file was reused. */
const RUN_DIRECTLY = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (!RUN_DIRECTLY) { /* imported for BUDGETS only */ } else {
const copy = JSON.parse(readFileSync(join(ROOT, "docs/collateral/copy.json"), "utf8"));
let over = 0;
let missing = 0;

for (const [art, budget] of Object.entries(BUDGETS)) {
  const c = copy[art] && copy[art].copy;
  if (!c) { console.log(`  FAIL  ${art} — no copy`); missing++; continue; }
  const got = new Map((c.sections || []).map((s) => [s.slot, words(s.body)]));
  for (const f of ["now", "adds", "commercial"]) got.set(`answers.${f}`, words(c.answers[f]));
  let total = 0;
  let artOver = 0;
  const lines = [];
  for (const [slot, cap] of Object.entries(budget)) {
    if (!got.has(slot)) { missing++; lines.push(`    MISSING slot "${slot}"`); continue; }
    const w = got.get(slot);
    total += w;
    if (w > cap) { artOver++; over++; lines.push(`    OVER  ${slot.padEnd(26)} ${w} / ${cap}`); }
  }
  for (const [slot] of got) {
    if (slot in budget) continue;
    if ((RETIRED[art] || []).includes(slot)) lines.push(`    retired slot "${slot}" — block cut for the type gate`);
    else lines.push(`    extra slot "${slot}" (no budget set)`);
  }
  const cap = Object.values(budget).reduce((a, b) => a + b, 0);
  console.log(`${artOver || missing ? "  FAIL " : "  ok   "} ${art} — ${total} words of ${cap} budgeted`
    + (artOver ? `, ${artOver} slot(s) over` : ""));
  lines.forEach((l) => console.log(l));
}

if (over || missing) {
  console.log(`\n${over} slot(s) over budget, ${missing} missing`);
  process.exit(1);
}
console.log("\nevery slot is inside its budget");
}
