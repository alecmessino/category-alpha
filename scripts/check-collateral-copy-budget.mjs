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
  A: { "answers.now": 55, "answers.adds": 45, "answers.commercial": 55, lede: 40,
    "tag-97L": 22, "tag-KARINA": 22, "tag-95E": 22, "tag-LOWELL": 22,
    "atlas-value-97L": 85, "atlas-value-KARINA": 65, "atlas-value-95E": 55,
    "atlas-value-LOWELL": 50, "plate-note": 45, "refusal-note": 75 },
  B: { "answers.now": 50, "answers.adds": 40, "answers.commercial": 50, lede: 45,
    "cell-rationale": 110, "reading-the-ledger": 120, "radius-sensitivity": 140,
    "seasonal-timing": 125, "analog-plate-note": 85, commercial: 300, hole: 150 },
  B1: { "answers.now": 45, "answers.adds": 40, "answers.commercial": 45, lede: 45,
    "trigger-explainability": 150, "near-miss": 190, "basis-risk": 200, "how-used": 90 },
  B2: { "answers.now": 45, "answers.adds": 40, "answers.commercial": 45, lede: 55,
    "geography-not-probability": 150, "exposure-map": 200, "frequency-bands": 130,
    "not-this": 100 },
  C: { "answers.now": 45, "answers.adds": 40, "answers.commercial": 45, lede: 50,
    "live-vs-history": 130, rarity: 125, "land-rows": 130, "so-what": 100 },
  D: { "answers.now": 50, "answers.adds": 45, "answers.commercial": 50, "one-sentence": 35,
    "users-can": 300, moat: 180, delivery: 60, pilot: 45, "sample-note": 90 },
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
