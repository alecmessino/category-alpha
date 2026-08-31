#!/usr/bin/env node
/* THE LEGIBILITY GATE, MEASURED RATHER THAN ASSERTED.
 *
 * "Fit is not readability." The type scale in collateral-kit.mjs is three tokens, but a token is a
 * promise; this walks the rendered DOM of every prospect-facing sheet, reads the COMPUTED font
 * size of every text node that actually paints, and reports the distribution in points.
 *
 * The floors, at 96 dpi where 1 pt = 4/3 px:
 *   body and callout copy        >= 8.5 pt  (11.33 px)
 *   table, citation, detail      >= 7.5 pt  (10.00 px)
 *   footer and legal only        >= 7.0 pt  ( 9.33 px)
 * Nothing substantive may print below the 7.5 pt floor. A node is treated as footer/legal only if
 * it sits inside the page footer or carries the .disclaim class; everything else is substantive.
 *
 * Text inside an SVG plate counts: an axis label or a mark label is text a reader has to read.
 *
 * Run: node scripts/check-collateral-legibility.mjs
 */
import { join } from "node:path";
import { ROOT } from "./lib/atlas-verify.mjs";

const DIR = join(ROOT, "docs/collateral");
const PROSPECT = [
  "A-active-systems-overview.html",
  "B-97L-gulf-event-dossier.html",
  "B1-97L-reinsurance-ils-parametric.html",
  "B2-97L-energy-weather-trading.html",
  "C-karina-major-hurricane-analog-brief.html",
  "D-storm-atlas-tear-sheet.html",
];
const SUBSTANTIVE_FLOOR_PT = 7.5;
const LEGAL_FLOOR_PT = 7.0;

let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch {
  console.log("playwright-core is not installed; the legibility gate needs a browser. Skipping.");
  process.exit(0);
}
const EXE = process.env.MT_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });

const pt = (px) => Math.round((px * 0.75) * 100) / 100;
const median = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
let failed = 0;

for (const f of PROSPECT) {
  await page.goto(`file://${DIR}/${f}`, { waitUntil: "networkidle" });
  const nodes = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const s = (n.nodeValue || "").trim();
      if (!s) continue;
      const el = n.parentElement;
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      /* An SVG <text> reports its own font-size in user units; the plate is scaled by
         width:100%/height:auto, so the painted size is that size times the render scale. */
      let px = parseFloat(cs.fontSize);
      const svg = el.ownerSVGElement;
      if (svg) {
        const vb = svg.viewBox && svg.viewBox.baseVal;
        const sr = svg.getBoundingClientRect();
        if (vb && vb.width && sr.width) px *= sr.width / vb.width;
      }
      out.push({
        px,
        chars: s.length,
        legal: !!el.closest(".ft") || !!el.closest(".disclaim"),
        where: (el.className && el.className.baseVal !== undefined
          ? el.className.baseVal : el.className) || el.tagName.toLowerCase(),
        sample: s.slice(0, 44),
      });
    }
    return out;
  });

  const sizes = nodes.map((n) => n.px);
  const sub = nodes.filter((n) => !n.legal);
  /* Character-weighted, because one three-character chip should not count the same as a
     paragraph when we ask what size this page mostly reads at. */
  const weighted = [];
  for (const n of nodes) for (let i = 0; i < Math.max(1, Math.round(n.chars / 8)); i++) weighted.push(n.px);

  const minAll = Math.min(...sizes);
  const minSub = Math.min(...sub.map((n) => n.px));
  const under = nodes.filter((n) => pt(n.px) < (n.legal ? LEGAL_FLOOR_PT : SUBSTANTIVE_FLOOR_PT) - 0.01);
  const hist = new Map();
  for (const n of nodes) hist.set(pt(n.px), (hist.get(pt(n.px)) || 0) + 1);

  console.log(`\n${f}`);
  console.log(`  text nodes ${nodes.length}  ·  min ${pt(minAll)} pt  ·  min substantive `
    + `${pt(minSub)} pt  ·  median ${pt(median(sizes))} pt  ·  weighted median `
    + `${pt(median(weighted))} pt  ·  max ${pt(Math.max(...sizes))} pt`);
  console.log(`  sizes in use: ${[...hist].sort((a, b) => a[0] - b[0])
    .map(([p, n]) => `${p}pt x${n}`).join(" · ")}`);
  if (under.length) {
    failed++;
    console.log(`  FAIL  ${under.length} node(s) below the floor:`);
    for (const u of under.slice(0, 8)) {
      console.log(`        ${pt(u.px)} pt  ${u.legal ? "(legal)" : "(substantive)"}  `
        + `${String(u.where).slice(0, 24)}  "${u.sample}"`);
    }
  } else {
    console.log(`  ok    nothing substantive below ${SUBSTANTIVE_FLOOR_PT} pt; `
      + `footer/legal no lower than ${LEGAL_FLOOR_PT} pt`);
  }
}
await browser.close();
if (failed) { console.log(`\n${failed} artifact(s) fail the type gate`); process.exit(1); }
console.log("\nevery prospect-facing sheet meets the type gate");
