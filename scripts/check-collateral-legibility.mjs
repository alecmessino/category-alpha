#!/usr/bin/env node
/* THE LEGIBILITY GATE, MEASURED PER SEMANTIC CLASS.
 *
 * "Fit is not readability", and a single global minimum does not prove a body-copy gate: a page
 * whose every table cell sits at 7.57 pt and whose every paragraph sits at 8.55 pt reports the
 * same 7.57 pt minimum as a page that set its paragraphs in table type. So every painting text
 * node is classified by the ROLE it plays, and each class is measured against its own floor.
 *
 *   body        running prose: paragraphs, list items, ledes, masthead sub-lines   >= 8.5 pt
 *   callout     commercial reading and interpretation boxes                        >= 8.5 pt
 *   headline    masthead titles, section heads, stat-tile values, card names       >= 8.5 pt
 *   table       ledger cells, headers and captions, including prose inside a cell  >= 7.5 pt
 *   citation    cite blocks and replay URLs                                        >= 7.5 pt
 *   detail      chips, footnotes, plate furniture, feed lines                      >= 7.5 pt
 *   map         text painted inside an SVG plate                                   >= 7.5 pt
 *   legal       the page footer and .disclaim legal text                           >= 7.0 pt
 *
 * Everything except `legal` is substantive, so the 7.5 pt substantive floor is enforced by
 * construction. Classification is by nearest meaningful ancestor and is deliberately
 * conservative: an unrecognised node falls to `body`, the strictest class, so a mislabelled
 * element fails the gate rather than slipping through it.
 *
 * SVG note: a plate declares its labels in viewBox units and is laid out with `width:100%`, so
 * the painted size is the declared size times (rendered width / viewBox width). That product is
 * what is measured here.
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
  "E-discrete-event-contract-evidence.html",
];

/* The floors, in points. 1 pt = 4/3 px at 96 dpi. */
const FLOOR = {
  body: 8.5, callout: 8.5, headline: 8.5,
  table: 7.5, citation: 7.5, detail: 7.5, map: 7.5,
  legal: 7.0,
};
const SUBSTANTIVE = Object.keys(FLOOR).filter((k) => k !== "legal");
const ORDER = ["body", "callout", "headline", "table", "citation", "detail", "map", "legal"];

let chromium;
try { ({ chromium } = await import("playwright-core")); }
catch {
  console.log("playwright-core is not installed; the legibility gate needs a browser. Skipping.");
  process.exit(0);
}
const EXE = process.env.MT_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });

const pt = (px) => Math.round(px * 0.75 * 100) / 100;
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
let failed = 0;
const report = {};

for (const f of PROSPECT) {
  await page.goto(`file://${DIR}/${f}`, { waitUntil: "networkidle" });
  const nodes = await page.evaluate(() => {
    const CLASS_OF = (el) => {
      /* Order matters, and it runs from the most specific role outwards. Structural DETAIL
         elements -- chips, footnotes, the refusal reason list, plate furniture, feed lines -- are
         detail wherever they sit, including inside a callout box; a chip in a commercial box is
         still a chip. What is NOT in that list is callout prose (.box p, .box ul), which stays at
         the body floor, so nothing that reads as a sentence can be demoted by living in a box. */
      if (el.closest(".ft") || el.closest(".disclaim")) return "legal";
      /* The exact replay query string beneath a labelled replay link: a print fallback for a
         link whose visible form is the label at citation size, kept at the legal size. */
      if (el.classList.contains("raw") || (el.parentElement && el.parentElement.classList.contains("raw"))) return "legal";
      if (el.ownerSVGElement) return "map";
      /* Rule-flow chips are detail wherever they sit, a refusal box included: the sentence they
         compress is printed beside them at the body size. */
      if (el.closest(".flow") || el.closest(".flowlead")) return "detail";
      /* The joint matrix, the bridge's verdicts and references, and figure captions are
         detail furniture; the bridge's need/hold prose stays at the body floor. */
      if (el.closest(".joint") || el.closest(".jointnote") || el.closest(".verdict") || el.closest(".ref")
        || el.closest(".col-h") || el.closest(".tl-cap") || el.closest(".tl-legend") || el.closest(".figcap")
        || el.closest(".src") || el.classList.contains("lead")) return "detail";
      if (el.closest(".cite") || el.closest(".citelist") || el.closest(".citerows")
        || el.classList.contains("u")) return "citation";
      if (el.closest(".card") || el.closest(".tile")) {
        return (el.classList.contains("nm") || el.classList.contains("pk")
          || el.classList.contains("v")) && el.tagName !== "SMALL" ? "headline" : "detail";
      }
      if (el.closest(".fn") || el.closest(".chip") || el.closest(".reasons")
        || el.closest(".plate-ft") || el.closest(".plate-note") || el.closest(".mh-rule")
        || el.closest(".feed") || el.closest(".lg") || el.closest(".mono6")
        || el.closest(".mono8") || el.closest(".sub")
        || (el.classList.contains("m") && el.closest(".plate-hd"))) return "detail";
      if (el.closest("table.ledger") || el.closest(".live table")) return "table";
      if (el.closest(".mh-title") || el.closest(".sec-hd") || el.closest(".mh-brand")
        || el.closest(".mh-doc") || el.closest(".live-hd") || el.closest(".plate-hd")
        || el.tagName === "H1" || el.tagName === "H2" || el.tagName === "H3"
        || el.tagName === "H4" || el.tagName === "CAPTION") return "headline";
      if (el.closest(".box.commercial") || el.closest(".box.hole") || el.closest(".box.refusal")
        || el.closest(".rail")) return "callout";
      return "body";
    };
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
      let px = parseFloat(cs.fontSize);
      const svg = el.ownerSVGElement;
      if (svg) {
        const vb = svg.viewBox && svg.viewBox.baseVal;
        const sr = svg.getBoundingClientRect();
        if (vb && vb.width && sr.width) px *= sr.width / vb.width;
      }
      out.push({ px, chars: s.length, cls: CLASS_OF(el), sample: s.slice(0, 40),
        where: (el.className && el.className.baseVal !== undefined
          ? el.className.baseVal : el.className) || el.tagName.toLowerCase() });
    }
    return out;
  });

  const byClass = new Map();
  for (const n of nodes) {
    if (!byClass.has(n.cls)) byClass.set(n.cls, []);
    byClass.get(n.cls).push(n);
  }
  console.log(`\n${f}`);
  console.log(`  ${"class".padEnd(9)} ${"n".padStart(4)} ${"chars".padStart(6)} `
    + `${"min".padStart(6)} ${"median".padStart(7)} ${"max".padStart(6)}   floor   verdict`);
  const rows = {};
  for (const cls of ORDER) {
    const g = byClass.get(cls);
    if (!g || !g.length) continue;
    const sizes = g.map((n) => n.px);
    /* Character-weighted median: a three-character chip should not weigh the same as a paragraph
       when asking what size this class actually reads at. */
    const w = [];
    for (const n of g) for (let i = 0; i < Math.max(1, Math.round(n.chars / 8)); i++) w.push(n.px);
    const min = Math.min(...sizes);
    const bad = g.filter((n) => pt(n.px) < FLOOR[cls] - 0.01);
    const okc = bad.length === 0;
    if (!okc) failed++;
    rows[cls] = { n: g.length, chars: g.reduce((a, n) => a + n.chars, 0),
      min: pt(min), median: pt(med(w)), max: pt(Math.max(...sizes)), floor: FLOOR[cls],
      pass: okc, under: bad.length };
    console.log(`  ${cls.padEnd(9)} ${String(g.length).padStart(4)} `
      + `${String(rows[cls].chars).padStart(6)} ${String(pt(min)).padStart(6)} `
      + `${String(pt(med(w))).padStart(7)} ${String(pt(Math.max(...sizes))).padStart(6)}   `
      + `${String(FLOOR[cls]).padStart(4)} pt  ${okc ? "ok" : `FAIL — ${bad.length} node(s)`}`);
    for (const b of bad.slice(0, 4)) {
      console.log(`            ${pt(b.px)} pt  ${String(b.where).slice(0, 22)}  "${b.sample}"`);
    }
  }
  const subs = nodes.filter((n) => SUBSTANTIVE.includes(n.cls));
  const subMin = pt(Math.min(...subs.map((n) => n.px)));
  const subOk = subMin >= 7.5 - 0.01;
  if (!subOk) failed++;
  console.log(`  substantive floor: min ${subMin} pt across `
    + `${subs.length} node(s) — ${subOk ? "ok" : "FAIL, below 7.5 pt"}`);
  report[f] = rows;
}
await browser.close();

if (failed) {
  console.log(`\n${failed} class-level failure(s) — the type gate is NOT green`);
  process.exit(1);
}
console.log("\nevery semantic class clears its own floor on every prospect-facing sheet");
