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
  "C-karina-major-hurricane-analog-brief.html": 2,
  "D-storm-atlas-tear-sheet.html": 1,
  "E-discrete-event-contract-evidence.html": 1,
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
  /* MEASURE THE CONTENT, NOT THE CLAMP. The sheet is a fixed box with overflow:hidden, so
     scrollHeight can never report less than the box -- a sheet with room to spare and one filled
     to the millimetre both read zero. Releasing the height for the measurement gives the real
     content height, which is the only number that predicts the printed page. */
  const sheets = await page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => {
    const budget = s.clientHeight;
    const h = s.style.height;
    const o = s.style.overflow;
    s.style.height = "auto";
    s.style.overflow = "visible";
    const content = s.clientHeight;
    s.style.height = h;
    s.style.overflow = o;
    /* WIDTH IS A FIT QUESTION TOO, AND NOTHING WAS ASKING IT. A ledger whose cells are all
       nowrap cannot shrink below its own min-content width; dropped into a half-width grid
       track it silently runs past the track, over its neighbour and off the sheet, where
       overflow:hidden clips it. Height gates cannot see that -- the sheet still fits -- so it
       reached print. Measure the widest painted node against the sheet's content box. */
    /* THE CONTENT BOX IS INSIDE A 10 mm BORDER, NOT A PADDING. getBoundingClientRect() on the
       sheet returns the BORDER box -- 816 px -- while everything on the page lays out inside the
       742 px padding box. Measuring against the former quietly forgave 37.8 px of bleed on each
       side, which is a margin a printer will not honour. clientLeft is that border width. */
    const box = s.getBoundingClientRect();
    const inner = { left: box.left + s.clientLeft, right: box.left + s.clientLeft + s.clientWidth };
    const wide = [];
    for (const e of s.querySelectorAll("*")) {
      if (e.ownerSVGElement || e.tagName === "svg") continue;
      const r = e.getBoundingClientRect();
      if (!r.width) continue;
      const past = Math.round(Math.max(r.right - inner.right, inner.left - r.left));
      if (past > 1) wide.push({ past, what: `${e.tagName.toLowerCase()}.${(typeof e.className === "string" ? e.className : "")}`.trim() });
    }
    /* AND EACH TABLE AGAINST ITS OWN COLUMN. A table can overrun its grid track, print over its
       neighbour, and still stop short of the sheet edge -- overlap without overflow. The sheet
       check above cannot see that; this one can, and overlap is the defect a reader meets. */
    for (const t of s.querySelectorAll("table")) {
      const cell = t.parentElement;
      if (!cell) continue;
      const cr = cell.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const past = Math.round(tr.right - cr.right);
      if (past > 1) wide.push({ past, what: `table.${t.className} over its ${Math.round(cr.width)}px column`, track: true });
    }
    wide.sort((a, b) => b.past - a.past);
    return { over: content - budget, budget, manifest: s.classList.contains("manifest"),
      widest: wide[0] || null, wideCount: wide.length };
  }));
  const expected = EXPECTED[f];
  if (expected === undefined) {
    console.log(`  ok    ${f} — reference document, ${sheets.length} sheet(s), paginates by design`);
    continue;
  }
  if (sheets.length !== expected) {
    failed++;
    console.log(`  FAIL  ${f} — ${sheets.length} sheet(s), expected ${expected}`);
  }
  /* A SAFETY MARGIN, BECAUSE THE PDF IS THE GROUND TRUTH AND THE SCREEN IS THE PROXY.
     Print lays the same CSS out with its own font metrics and rounding, and a sheet measured at
     exactly 0 px of headroom printed as two pages. Eight pixels is what that discrepancy
     measured; the gate now demands it, so "fits on screen" means "prints on one page". */
  const HEADROOM = 8;
  sheets.forEach((s, i) => {
    if (s.over > -HEADROOM) {
      failed++;
      console.log(`  FAIL  ${f} sheet ${i + 1} is ${s.over > 0 ? `${s.over}px over` : `within ${-s.over}px of`} `
        + `its ${s.budget}px page — needs ${HEADROOM}px of headroom to print as one.`);
    } else {
      console.log(`  ok    ${f} sheet ${i + 1} fits — ${s.budget + s.over}px of ${s.budget}px used, `
        + `${-s.over}px spare`);
    }
    if (s.widest) {
      failed++;
      console.log(`  FAIL  ${f} sheet ${i + 1} runs ${s.widest.past}px past `
        + `${s.widest.track ? "its column" : "the content box"} `
        + `(${s.wideCount} node(s), widest ${s.widest.what}) — it is clipped, not laid out.`);
    }
  });
}
await browser.close();
if (failed) { console.log(`\n${failed} sheet failure(s)`); process.exit(1); }
console.log("\nevery sheet fits its page");
