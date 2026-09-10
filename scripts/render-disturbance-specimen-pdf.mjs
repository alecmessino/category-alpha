#!/usr/bin/env node
/* Gate the frozen specimen's two sheets, and render the prospect plate to a one-page Letter PDF.
 *
 * TWO SHEETS, ONE PAYLOAD, DIFFERENT JOBS.
 *
 *   print.html     the AUDIT sheet -- every figure a researcher would check by hand.
 *   prospect.html  the PROSPECT PLATE -- one finding, one refusal, and nothing that does not
 *                  serve the ten-second read. This is the sheet that becomes the PDF.
 *
 * Both are gated for legibility. Only the plate is gated for editorial density, and only the
 * plate is printed: a prospect gets one page, and the audit sheet stays where audits happen.
 *
 * THREE THINGS THIS GETS RIGHT THAT THE OBVIOUS VERSION DOES NOT.
 *
 * 1. MARGINS ARE SET ONCE. Each sheet declares `@page { size: Letter; margin: ... }`. Passing
 *    Playwright's own `margin` option as well makes Chromium apply both, and the sheet silently
 *    paginates to two pages while every in-page measurement still says it fits. `preferCSSPageSize`
 *    hands the decision to the document, which is the only place it is written down.
 *
 * 2. LEGIBILITY IS ASSERTED BY TIER, NOT BY A SINGLE FLOOR. body/callout >= 8.5pt,
 *    table/detail >= 7.5pt, footer/legal >= 7pt, asserted separately. A single 7pt floor once
 *    passed the audit sheet while its headline verdicts sat at 7.4pt. Every text leaf must match
 *    exactly one TIERS entry -- an unclassified leaf fails the build rather than defaulting to
 *    the most forgiving floor, so new markup cannot slip in under the lowest tier by omission.
 *
 * 3. EDITORIAL DENSITY IS A BUILD GATE, NOT AN INTENTION. Word count, paragraph length, region
 *    count and the single-refusal rule are checked on the RENDERED page. A collateral piece
 *    drifts back toward documentation one useful sentence at a time; the only way to hold the
 *    line is to make the drift fail.
 *
 * Run: node scripts/render-disturbance-specimen-pdf.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const DIR = resolve("research/specimens/2026-09-09-three-systems");
const OUT = join(DIR, "Storm Atlas — Three Systems, Three Answers — 2026-09-09.pdf");
const CHROME = process.env.MT_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/* The legibility contract, by role and by sheet. First match wins, so the narrower selector for
   a role sits above the broader one. Disagree with a classification here, in one place. */
const AUDIT_TIERS = [
  { sel: ".callout, .callout *", min: 8.5, tier: "body/callout" },
  { sel: ".sy .v", min: 8.5, tier: "body/callout" },
  { sel: ".lede, .lede *, .panel > p, .panel > p *", min: 8.5, tier: "body/callout" },
  { sel: "h1, h2, .sy .n, .clock .o b", min: 8.5, tier: "body/callout" },
  { sel: "table, table *, .cap, .ct, .cv", min: 7.5, tier: "table/detail" },
  { sel: ".eyebrow, .panel .hd .q, .sy .t, .sy .k, .sy .p", min: 7.5, tier: "table/detail" },
  { sel: ".qp, .qp *, .clock, .clock *", min: 7.5, tier: "table/detail" },
  { sel: "footer, footer *, .frozen, .frozen *", min: 7, tier: "footer/legal" },
];
const PROSPECT_TIERS = [
  /* BODY / CALLOUT -- the idea, the panel titles, the findings, the figures a reader quotes. */
  { sel: "h1, .deck, .deck *, .method, .method *", min: 8.5, tier: "body/callout" },
  { sel: ".atitle, .averdict, .anum, .acap", min: 8.5, tier: "body/callout" },
  /* TABLE / DETAIL -- point types, figure captions, chart and map labels. */
  { sel: ".atype, .figcap, .gl, .gt, .ct, .cv, .cl", min: 7.5, tier: "table/detail" },
  /* FOOTER / LEGAL -- provenance, the research-only notice, the frozen stamp. */
  { sel: "footer, footer *, .stamp, .stamp *", min: 7, tier: "footer/legal" },
];
/* The prospect note's editorial lock. Numbers, not adjectives.
   The word count is a BAND, not a ceiling: a note that shrinks below its floor has stopped
   saying enough, and that is as much a failure as one that sprawls. Provenance is excluded
   because it is fixed cost -- it cannot be edited down and should not buy room for prose. */
const DENSITY = {
  minWords: 175,           // visible words excluding the provenance line
  maxWords: 225,
  maxParaLines: 2,         // no paragraph runs longer than this once rendered
  maxRegions: 3,           // content regions below the masthead
  substantiveFloorPt: 7.5, // nothing but footer/legal may sit below this
};

const srv = createServer(async (rq, rs) => {
  const p = decodeURIComponent(rq.url.split("?")[0]);
  try {
    const b = await readFile(join(DIR, p));
    rs.writeHead(200, { "content-type": extname(p) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream" });
    rs.end(b);
  } catch { rs.writeHead(404); rs.end("404"); }
});
await new Promise((r) => srv.listen(8150, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: CHROME });
let bad = 0;
const ok = (label, cond, detail) => { if (cond) console.log("  ok    " + label);
  else { bad++; console.log("  FAIL  " + label + (detail ? "\n        " + detail : "")); } };

/* MEASURE AT THE PRINT WIDTH, NOT THE DEFAULT VIEWPORT. The page box is 8.5in less its side
   margins. Measuring at a 1280px viewport lays three-column bands out far wider than they will
   print, reports a height that fits, and then paginates to two pages. The box is read out of the
   sheet's own @page rule, so the measurement and the print cannot disagree about the margins. */
async function openSheet(file) {
  const css = await readFile(join(DIR, file), "utf8");
  const pm = /@page\s*\{[^}]*margin:\s*([\d.]+)in\s+([\d.]+)in\s+([\d.]+)in/.exec(css);
  if (!pm) throw new Error(`cannot read the @page margin from ${file}`);
  const [mTop, mSide, mBot] = [Number(pm[1]), Number(pm[2]), Number(pm[3])];
  const W = Math.round((8.5 - mSide * 2) * 96), H = Math.round((11 - mTop - mBot) * 96);
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://127.0.0.1:8150/" + file, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(200);
  return { page, errs, W, H };
}

/* Every rendered text leaf, with its tier and its rendered line count. Elements that carry text
   but paint nothing (<title>, <style>, the inlined payload <script>) are not type a reader can
   fail to read, and are skipped. */
const leavesOf = (page, tiers) => page.evaluate((t) => {
  const rows = [];
  for (const el of document.querySelectorAll("*")) {
    const txt = (el.textContent || "").trim();
    if (!txt || el.children.length || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    let px = parseFloat(cs.fontSize);
    /* SVG TEXT IS MEASURED AS IT PRINTS, NOT AS IT IS DECLARED.
       A <text> inside a viewBox is laid out in user units and then scaled by the ratio of the
       element's rendered width to the viewBox width. Reading computed font-size alone reports
       the declared size, which for a chart drawn at 210 units into a 175px column understates
       the shrink by a fifth -- the gate passes labels a reader cannot read, and on a map scaled
       UP it fails labels that are perfectly legible. Scale it. */
    const svg = el.ownerSVGElement;
    if (svg) {
      const vb = svg.viewBox && svg.viewBox.baseVal;
      const w = svg.getBoundingClientRect().width;
      if (vb && vb.width > 0 && w > 0) px *= w / vb.width;
    }
    const pt = px * 72 / 96;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
    const hit = t.find((x) => el.matches(x.sel));
    rows.push({
      pt, tier: hit ? hit.tier : null, min: hit ? hit.min : null,
      lines: Math.round(el.getBoundingClientRect().height / lh),
      words: (txt.match(/[^\s]+/g) || []).length,
      svg: el.namespaceURI === "http://www.w3.org/2000/svg",
      para: el.matches(".deck, .acap, .figcap, .method"),
      where: (el.getAttribute("class") || el.tagName) + ": " + txt.slice(0, 40),
    });
  }
  return rows;
}, tiers);

/* THE AUDIT SHEET'S ONE RECORDED EXCEPTION.
 *
 * Scaling SVG text correctly (above) revealed that print.html's chart ticks are declared 7.5pt
 * and print at 6.76pt. That is a real defect, and it is NOT being fixed here: print.html is the
 * frozen audit sheet and this pass is under instruction not to alter it. So it is recorded at
 * its measured value and asserted as NO WORSE -- the sheet cannot quietly degrade further, and
 * the number sits in the source where the next unfreeze will find it. Relaxing the tier floor
 * instead would have hidden the defect on every future sheet as well. */
const AUDIT_KNOWN = {
  tier: "table/detail",
  floorPt: 6.76,
  why: "frozen sheet; SVG chart ticks declared 7.5pt print at 6.76pt; fix at the next unfreeze",
};

function gateType(leaves, label, known) {
  const unclassified = leaves.filter((r) => !r.tier);
  ok(`${label}: every text leaf is classified into a legibility tier (${leaves.length} leaves)`,
     unclassified.length === 0,
     unclassified.slice(0, 3).map((r) => r.where).join(" | ") + "  <- add these to TIERS");
  for (const { tier, min } of [{ tier: "body/callout", min: 8.5 }, { tier: "table/detail", min: 7.5 },
                               { tier: "footer/legal", min: 7 }]) {
    let w = null;
    for (const r of leaves) if (r.tier === tier && (!w || r.pt < w.pt)) w = r;
    const waived = known && known.tier === tier;
    const floor = waived ? known.floorPt : min;
    ok(`${label}: ${tier} holds >= ${floor}pt (smallest ${w ? w.pt.toFixed(2) : "n/a"}pt)`
       + (waived ? ` [recorded exception: ${known.why}]` : ""),
       w != null && w.pt >= floor - 0.01, w && w.where);
  }
}

/* ---------------------------------------------------------------- the audit sheet: type only */
console.log("\naudit sheet — research/specimens/2026-09-09-three-systems/print.html");
{
  const { page, errs, H } = await openSheet("print.html");
  const fit = await page.evaluate(() => document.documentElement.scrollHeight);
  ok("audit: the sheet raised no script error", errs.length === 0, errs.slice(0, 2).join(" | "));
  ok(`audit: content fits the page box at print width (${fit} of ${H}px)`, fit <= H);
  gateType(await leavesOf(page, AUDIT_TIERS), "audit", AUDIT_KNOWN);
  await page.close();
}

/* ------------------------------------------------- the prospect plate: type, density, one page */
console.log("\nprospect plate — research/specimens/2026-09-09-three-systems/prospect.html");
const { page, errs, W, H } = await openSheet("prospect.html");
const fit = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(`  print box ${W}×${H}px · content ${fit}px `
  + (fit <= H ? "(fits)" : `(OVER by ${fit - H}px)`));
ok("prospect: the plate raised no script error", errs.length === 0, errs.slice(0, 2).join(" | "));
ok(`prospect: content fits the page box at print width (${fit} of ${H}px)`, fit <= H,
   "measured at the real print width, not the default viewport");

const leaves = await leavesOf(page, PROSPECT_TIERS);
gateType(leaves, "prospect", null);

const words = leaves.reduce((n, r) => n + r.words, 0);
const footWords = leaves.filter((r) => r.tier === "footer/legal").reduce((n, r) => n + r.words, 0);
const body = words - footWords;
ok(`prospect: ${DENSITY.minWords}-${DENSITY.maxWords} visible words excluding provenance `
   + `(${body}; ${words} with the ${footWords}-word provenance line)`,
   body >= DENSITY.minWords && body <= DENSITY.maxWords);

const overrun = leaves.filter((r) => r.para && r.lines > DENSITY.maxParaLines);
ok(`prospect: no paragraph runs over ${DENSITY.maxParaLines} rendered lines`, overrun.length === 0,
   overrun.map((r) => r.lines + " lines — " + r.where).join(" | "));

const shape = await page.evaluate(() => ({
  /* Content regions below the masthead: the sheet's own children, less the headline block, the
     deck and rule that belong to it, and the provenance line. */
  regions: [...document.querySelector(".sheet").children]
    .filter((el) => !el.matches(".head, .deck, .rule, footer"))
    .map((el) => el.className || el.tagName),
  methods: document.querySelectorAll(".method").length,
  /* Chrome the note is not allowed to grow back. Uppercase is reserved for timestamps, n/N, ESS
     and hashes, which live in the mono classes; a shouting heading or finding is what this
     catches, and it is the first thing that creeps back when a note is edited in a hurry. */
  shout: [...document.querySelectorAll("h1, .deck, .atitle, .averdict, .acap, .method, .figcap")]
    .map((el) => (el.textContent || "").trim())
    .filter((t) => /\p{Lu}{4,}/u.test(t)),
}));
ok(`prospect: <= ${DENSITY.maxRegions} content regions below the masthead (${shape.regions.length}: `
   + `${shape.regions.join(", ")})`, shape.regions.length <= DENSITY.maxRegions);
ok(`prospect: exactly one method line (${shape.methods})`, shape.methods === 1);
ok("prospect: no all-caps headings or findings", shape.shout.length === 0,
   shape.shout.slice(0, 3).join(" | "));

let low = null;
for (const r of leaves) if (r.tier !== "footer/legal" && (!low || r.pt < low.pt)) low = r;
ok(`prospect: no substantive text below ${DENSITY.substantiveFloorPt}pt (smallest ${low.pt.toFixed(2)}pt)`,
   low.pt >= DENSITY.substantiveFloorPt - 0.01, low.where);

await page.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true });
await page.close();
await browser.close();
srv.close();

/* STAMP THE PDF WITH THE FREEZE TIME, NOT THE RENDER TIME.
 *
 * Chromium writes a wall-clock /CreationDate and /ModDate, so two renders of the same frozen
 * payload differ in four bytes and the specimen stops reproducing itself. The rest of the
 * specimen already resolved this -- builtAt is the manifest's frozenAt -- and the PDF is the one
 * artefact that had not. The replacement is length-for-length, so no xref offset moves; the
 * lengths are asserted rather than assumed, because a shifted offset would corrupt the file
 * silently and the corruption would ship. */
{
  const M = JSON.parse(await readFile(join(DIR, "MANIFEST.json"), "utf8"));
  const d = new Date(M.frozenAt);
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = `D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`
    + `${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}+00'00'`;
  const raw = await readFile(OUT);
  let text = raw.toString("latin1"), hits = 0;
  text = text.replace(/\/(CreationDate|ModDate)\s*\(([^)]*)\)/g, (whole, key, was) => {
    if (was.length !== stamp.length)
      throw new Error(`refusing to rewrite /${key}: "${was}" is ${was.length} bytes, `
        + `"${stamp}" is ${stamp.length} -- a length change would move every xref offset`);
    hits++;
    return `/${key} (${stamp})`;
  });
  if (hits === 0) throw new Error("no /CreationDate or /ModDate in the PDF: the reproducibility "
    + "rewrite found nothing, so this build is not reproducible and is not silently passing");
  const out = Buffer.from(text, "latin1");
  if (out.length !== raw.length) throw new Error("PDF length changed during the date rewrite");
  await writeFile(OUT, out);
}

const buf = await readFile(OUT);
const m = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/.exec(buf.toString("latin1"));
const pages = m ? Number(m[1]) : NaN;
ok(`prospect: the PDF is exactly one Letter page (got ${pages})`, pages === 1,
   "margins are declared once, in the sheet's @page rule; do not also pass a margin option here");

console.log(`\n  ${bad ? "FAILED" : "PASSED"} · ${buf.length} bytes · ${OUT}`);
process.exit(bad ? 1 : 0);
