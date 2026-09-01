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
  A: { "answers.adds": 30, "answers.commercial": 26, "lede": 34, "atlas-value-97L": 31, "atlas-value-KARINA": 32, "atlas-value-95E": 32, "atlas-value-LOWELL": 27, "plate-note": 42, "refusal-note": 37 },
  B: { "lede": 46, "cell-rationale": 65, "reading-the-ledger": 40, "radius-sensitivity": 32, "seasonal-timing": 45, "analog-plate-note": 29, "commercial": 142, "hole": 89 },
  B1: { "answers.now": 29, "trigger-explainability": 60, "near-miss": 81, "basis-risk": 83, "how-used": 13 },
  B2: { "answers.now": 44, "answers.adds": 33, "answers.commercial": 23, "lede": 45, "geography-not-probability": 64, "exposure-map": 68, "frequency-bands": 36, "not-this": 60 },
  C: { "live-vs-history": 80, "land-rows": 39, "so-what": 36 },
  D: { "one-sentence": 59, "users-can": 140, "moat": 91, "delivery": 41, "pilot": 23, "sample-note": 41 },
  E: { "lede": 25, "discrete-terms": 84, "cohort-note": 21, "history-note": 61, "desk-use": 39, "desk-not": 64 },
};

/* SLOTS NO LONGER RENDERED. The type-gate pass cut the blocks these fed; the copy stays in
   copy.json so the cut is reversible, and it is listed here so an unused slot reads as retired
   rather than as an unbudgeted surprise. scripts/lib/collateral-cuts.mjs records why. */
export const RETIRED = {
  "A": ["tag-97L", "tag-KARINA", "tag-95E", "tag-LOWELL", "answers.now"],
  "B": ["answers.now", "answers.adds", "answers.commercial"],
  "B1": ["lede", "answers.adds", "answers.commercial"],
  "C": ["lede", "rarity", "answers.now", "answers.adds", "answers.commercial"],
  "D": ["answers.now", "answers.adds", "answers.commercial"],
  /* E was drawn without an answers rail at all -- the evidence-bridge table does that work --
     so its three rail slots are absent by design rather than by cut. */
  "E": ["answers.now", "answers.adds", "answers.commercial"],
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
let dead = 0;

/* DOES THE COPY ACTUALLY REACH THE PAGE? A slot can pass a word budget and still print nowhere --
   which is what happened when the answers rails came off four artifacts and their prose stayed in
   copy.json unreferenced. A budgeted slot whose text is absent from the rendered artifact is a
   failure; a slot listed in RETIRED is exempt, and is expected to be absent. */
const FILES = {
  A: "A-active-systems-overview.html",
  B: "B-97L-gulf-event-dossier.html",
  B1: "B1-97L-reinsurance-ils-parametric.html",
  B2: "B2-97L-energy-weather-trading.html",
  C: "C-karina-major-hurricane-analog-brief.html",
  D: "D-storm-atlas-tear-sheet.html",
  E: "E-discrete-event-contract-evidence.html",
};
const flat = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const rendered = {};
for (const [art, f] of Object.entries(FILES)) {
  try { rendered[art] = flat(readFileSync(join(ROOT, "docs/collateral", f), "utf8")); }
  catch { rendered[art] = ""; }
}

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
    /* A seven-word probe from the middle of the slot: long enough not to collide with boilerplate,
       short enough to survive a template that wraps or re-punctuates around it. */
    const src = slot.startsWith("answers.")
      ? c.answers[slot.split(".")[1]]
      : (c.sections.find((x) => x.slot === slot) || {}).body;
    const probe = flat(src).split(" ").slice(2, 9).join(" ");
    if (probe && rendered[art] && !rendered[art].includes(probe)) {
      dead++;
      lines.push(`    DEAD  ${slot.padEnd(26)} budgeted but printed nowhere in ${FILES[art]}`);
    }
  }
  for (const [slot] of got) {
    if (slot in budget) continue;
    if ((RETIRED[art] || []).includes(slot)) lines.push(`    retired  ${slot.padEnd(26)} block cut or compressed — see scripts/lib/collateral-cuts.mjs`);
    else lines.push(`    extra slot "${slot}" (no budget set)`);
  }
  const cap = Object.values(budget).reduce((a, b) => a + b, 0);
  console.log(`${artOver || missing || lines.some((l) => l.includes("DEAD")) ? "  FAIL " : "  ok   "} ${art} — ${total} words of ${cap} budgeted`
    + (artOver ? `, ${artOver} slot(s) over` : ""));
  lines.forEach((l) => console.log(l));
}

if (over || missing || dead) {
  console.log(`\n${over} slot(s) over budget, ${missing} missing, ${dead} budgeted but never printed`);
  process.exit(1);
}
console.log("\nevery slot is inside its budget");
}
