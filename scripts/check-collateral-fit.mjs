#!/usr/bin/env node
/* DOES EACH SHEET ACTUALLY FIT ITS PAGE?
 *
 * The collateral is print-ready or it is not, and "1 page" is a claim the browser can settle.
 * The stylesheet makes the on-screen sheet EXACTLY the printed content box -- Letter at a 10 mm
 * @page margin, so 196 x 259 mm -- with `overflow:hidden`, which means a block that would
 * paginate on paper overflows here instead. This measures that overflow.
 *
 * Why it is a gate rather than a habit: every copy edit moves the boxes, and an artifact that
 * silently grew to two pages still looks finished on screen. Measured on this build: three of
 * the six artifacts were over by 100-200 px before the layout was reworked, and none of them
 * looked wrong.
 *
 * Needs a browser. Run: node scripts/check-collateral-fit.mjs
 */
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { ROOT } from "./lib/atlas-verify.mjs";

const DIR = join(ROOT, "docs/collateral");
/* Sheets a document is ALLOWED to run to. The manifest is a reference document and paginates
   by design; everything else is a fixed-extent sheet and its count is part of the brief. */
const EXPECTED = {
  "A-active-systems-overview.html": 1,
  "B-97L-gulf-event-dossier.html": 2,
  "B1-97L-reinsurance-ils-parametric.html": 1,
  "B2-97L-energy-weather-trading.html": 1,
  "C-karina-major-hurricane-analog-brief.html": 1,
  "D-storm-atlas-tear-sheet.html": 1,
};

let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch {
  console.log("playwright-core is not installed; the fit gate needs a browser. Skipping.");
  process.exit(0);
}
const EXE = process.env.MT_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });
let failed = 0;

for (const f of readdirSync(DIR).filter((x) => x.endsWith(".html")).sort()) {
  await page.goto(`file://${DIR}/${f}`, { waitUntil: "networkidle" });
  const sheets = await page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => ({
    over: s.scrollHeight - s.clientHeight,
    budget: s.clientHeight,
    manifest: s.classList.contains("manifest"),
  })));
  const expected = EXPECTED[f];
  if (expected === undefined) {
    console.log(`  ok    ${f} — reference document, ${sheets.length} sheet(s), paginates by design`);
    continue;
  }
  if (sheets.length !== expected) {
    failed++;
    console.log(`  FAIL  ${f} — ${sheets.length} sheet(s), expected ${expected}`);
  }
  sheets.forEach((s, i) => {
    if (s.over > 0) {
      failed++;
      console.log(`  FAIL  ${f} sheet ${i + 1} overflows its page by ${s.over}px `
        + `(budget ${s.budget}px). It will print as two pages.`);
    } else {
      console.log(`  ok    ${f} sheet ${i + 1} fits — ${s.budget + s.over}px of ${s.budget}px used`);
    }
  });
}
await browser.close();
if (failed) { console.log(`\n${failed} sheet(s) do not fit`); process.exit(1); }
console.log("\nevery sheet fits its page");
