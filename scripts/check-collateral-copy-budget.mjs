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
  A: { "answers.now": 44, "answers.adds": 42, "answers.commercial": 43, lede: 32, "tag-97L": 20, "tag-KARINA": 20, "tag-95E": 21, "tag-LOWELL": 21, "atlas-value-97L": 71, "atlas-value-KARINA": 43, "atlas-value-95E": 37, "atlas-value-LOWELL": 34, "plate-note": 38, "refusal-note": 62 },
  B: { "answers.now": 54, "answers.adds": 44, "answers.commercial": 54, lede: 49, "cell-rationale": 119, "reading-the-ledger": 129, "radius-sensitivity": 152, "seasonal-timing": 135, "analog-plate-note": 92, commercial: 323, hole: 157 },
  B1: { "answers.now": 46, "answers.adds": 42, "answers.commercial": 48, lede: 45, "trigger-explainability": 85, "near-miss": 165, "basis-risk": 130, "how-used": 36 },
  B2: { "answers.now": 43, "answers.adds": 40, "answers.commercial": 48, lede: 59, "geography-not-probability": 128, "exposure-map": 166, "frequency-bands": 92, "not-this": 66 },
  C: { "answers.now": 49, "answers.adds": 44, "answers.commercial": 49, lede: 47, "live-vs-history": 100, rarity: 60, "land-rows": 80, "so-what": 37 },
  D: { "answers.now": 63, "answers.adds": 50, "answers.commercial": 56, "one-sentence": 58, "users-can": 286, moat: 158, delivery: 66, pilot: 22, "sample-note": 101 },
};

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
    if (!(slot in budget)) lines.push(`    extra slot "${slot}" (no budget set)`);
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
