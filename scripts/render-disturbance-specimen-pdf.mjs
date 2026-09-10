#!/usr/bin/env node
/* Render the frozen specimen's print sheet to a one-page Letter PDF, and PROVE it is one page.
 *
 * TWO THINGS THIS GETS RIGHT THAT THE OBVIOUS VERSION DOES NOT.
 *
 * 1. MARGINS ARE SET ONCE. The print sheet declares `@page { size: Letter; margin: ... }`. Passing
 *    Playwright's own `margin` option as well makes Chromium apply both, and the sheet silently
 *    paginates to two pages while every in-page measurement still says it fits. `preferCSSPageSize`
 *    hands the decision to the document, which is the only place it is written down.
 *
 * 2. THE PAGE COUNT AND THE TYPE FLOOR ARE ASSERTED, NOT ASSUMED. A prospect-facing sheet that
 *    quietly grew a second page, or dropped a label to 6pt, is a defect a person would only find
 *    after sending it. Both are checked here and the build fails on either.
 *
 * Legibility contract, from the brief: body/callout >= 8.5pt, table/detail >= 7.5pt, footer/legal
 * >= 7pt. All THREE tiers are asserted separately. A single 7pt floor would pass a sheet whose
 * headline verdict had quietly shrunk to 7.4pt, which is what this sheet did before the tiers
 * were written down. Every text leaf must match exactly one TIERS entry -- an unclassified leaf
 * fails the build rather than defaulting to the most forgiving floor, so new markup cannot slip
 * in under the lowest tier by omission.
 *
 * Run: node scripts/render-disturbance-specimen-pdf.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const DIR = resolve("research/specimens/2026-09-09-three-systems");
const OUT = join(DIR, "Storm Atlas — Three Systems, Three Answers — 2026-09-09.pdf");
/* The legibility contract, by role. First match wins, so order matters: the narrower selector
   for a role sits above the broader one. Disagree with a classification here, in one place. */
const TIERS = [
  /* BODY / CALLOUT -- the argument itself: prose, the callout headline, the spine verdicts. */
  { sel: ".callout, .callout *", min: 8.5, tier: "body/callout" },
  { sel: ".sy .v", min: 8.5, tier: "body/callout" },
  { sel: ".lede, .lede *, .panel > p, .panel > p *", min: 8.5, tier: "body/callout" },
  { sel: "h1, h2, .sy .n, .clock .o b", min: 8.5, tier: "body/callout" },
  /* TABLE / DETAIL -- labels, figures, annotations and chart type that support the argument. */
  { sel: "table, table *, .cap, .ct, .cv", min: 7.5, tier: "table/detail" },
  { sel: ".eyebrow, .panel .hd .q, .sy .t, .sy .k, .sy .p", min: 7.5, tier: "table/detail" },
  { sel: ".qp, .qp *, .clock, .clock *", min: 7.5, tier: "table/detail" },
  /* FOOTER / LEGAL -- provenance, replay instructions, the research-only notice. */
  { sel: "footer, footer *, .frozen, .frozen *", min: 7, tier: "footer/legal" },
];
const CHROME = process.env.MT_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const srv = createServer(async (rq, rs) => {
  const p = decodeURIComponent(rq.url.split("?")[0]);
  try {
    const b = await readFile(join(DIR, p));
    rs.writeHead(200, { "content-type": extname(p) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream" });
    rs.end(b);
  } catch { rs.writeHead(404); rs.end("404"); }
});
await new Promise((r) => srv.listen(8150, "127.0.0.1", r));

/* MEASURE AT THE PRINT WIDTH, NOT THE DEFAULT VIEWPORT. The page box is 8.5in less its side
   margins — about 739 CSS px. Measuring at a 1280px viewport lays the three-column bands out far
   wider than they will print, reports a height that fits, and then paginates to two pages. */
/* Read the page box out of the sheet's own @page rule, so the measurement and the print can
   never disagree about what the margins are. */
const sheetCss = await readFile(join(DIR, "print.html"), "utf8");
const pm = /@page\s*\{[^}]*margin:\s*([\d.]+)in\s+([\d.]+)in\s+([\d.]+)in/.exec(sheetCss);
if (!pm) throw new Error("cannot read the @page margin from print.html");
const [mTop, mSide, mBot] = [Number(pm[1]), Number(pm[2]), Number(pm[3])];
const PAGE_W = Math.round((8.5 - mSide * 2) * 96);
const PAGE_H = Math.round((11 - mTop - mBot) * 96);
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: PAGE_W, height: PAGE_H } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://127.0.0.1:8150/print.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

await page.emulateMedia({ media: "print" });
await page.waitForTimeout(200);
const fit = await page.evaluate(() => ({ h: document.documentElement.scrollHeight,
                                         w: document.documentElement.scrollWidth }));
console.log(`  print box ${PAGE_W}×${PAGE_H}px · content ${fit.h}px `
  + (fit.h <= PAGE_H ? "(fits)" : `(OVER by ${fit.h - PAGE_H}px)`));

/* Measure every text leaf, classify it, and keep the worst offender per tier. */
const measured = await page.evaluate((tiers) => {
  const rows = [];
  for (const el of document.querySelectorAll("*")) {
    const t = (el.textContent || "").trim();
    if (!t || el.children.length) continue;
    /* Not rendered -> not type a reader can fail to read. This drops <title>, <style> and the
       inlined payload <script>, which carry text but paint nothing. */
    if (!el.getClientRects().length) continue;
    const pt = parseFloat(getComputedStyle(el).fontSize) * 72 / 96;
    const hit = tiers.find((x) => el.matches(x.sel));
    rows.push({ pt, tier: hit ? hit.tier : null, min: hit ? hit.min : null,
                where: (el.getAttribute("class") || el.tagName) + ": " + t.slice(0, 40) });
  }
  return rows;
}, TIERS);

const unclassified = measured.filter((r) => !r.tier);
const worst = {};
for (const r of measured.filter((r) => r.tier))
  if (!worst[r.tier] || r.pt < worst[r.tier].pt) worst[r.tier] = r;

await page.pdf({ path: OUT, printBackground: true, preferCSSPageSize: true });
await browser.close();
srv.close();

const buf = await readFile(OUT);
const m = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/.exec(buf.toString("latin1"));
const pages = m ? Number(m[1]) : NaN;

let bad = 0;
const ok = (label, cond, detail) => { if (cond) console.log("  ok    " + label);
  else { bad++; console.log("  FAIL  " + label + (detail ? "\n        " + detail : "")); } };

ok("the print sheet raised no script error", errs.length === 0, errs.slice(0, 2).join(" | "));
ok(`content fits the page box at print width (${fit.h} of ${PAGE_H}px)`, fit.h <= PAGE_H,
   "measured at the real print width, not the default viewport");
ok(`the PDF is exactly one Letter page (got ${pages})`, pages === 1,
   "margins are declared once, in the sheet's @page rule; do not also pass a margin option here");
ok(`every text leaf is classified into a legibility tier (${measured.length} leaves)`,
   unclassified.length === 0,
   unclassified.slice(0, 3).map((r) => r.where).join(" | ") + "  <- add these to TIERS");
for (const { tier, min } of [{ tier: "body/callout", min: 8.5 }, { tier: "table/detail", min: 7.5 },
                             { tier: "footer/legal", min: 7 }]) {
  const w = worst[tier];
  ok(`${tier} type holds >= ${min}pt (smallest ${w ? w.pt.toFixed(2) : "n/a"}pt)`,
     w != null && w.pt >= min - 0.01, w && w.where);
}
console.log(`\n  ${bad ? "FAILED" : "PASSED"} · ${buf.length} bytes · ${OUT}`);
process.exit(bad ? 1 : 0);
