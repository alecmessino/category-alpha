#!/usr/bin/env node
/* RENDER A SEND-READY SHEET TO A ONE-PAGE PDF, AND PROVE IT IS ONE.
 *
 * The outbound rule for this collateral is one PDF, one replay URL, one ask. The PDF is the
 * artifact that actually leaves, so everything the gates assert about the HTML has to survive
 * the print pipeline, and three things routinely do not:
 *
 *   1. MARGINS APPLIED TWICE. Each sheet declares `@page { size: Letter; margin: 10mm }` and the
 *      whole layout is built against the 196 x 259 mm box that leaves. Passing Playwright's own
 *      `margin` option as well makes Chromium apply both and the sheet paginates, while every
 *      in-page measurement still says it fits. `preferCSSPageSize` hands the decision to the
 *      document, which is the only place the page is described.
 *   2. FONTS THAT DID NOT ARRIVE. The sheets load Source Serif 4 / Inter / IBM Plex Mono over the
 *      network and fall back to Georgia / system sans / Menlo if the request fails. The fallback
 *      renders -- silently, at different metrics -- and a sheet measured at 9px of spare room is
 *      not guaranteed to survive that. So the render asserts the webfaces actually loaded before
 *      it prints, and refuses rather than shipping a PDF set in fallback type.
 *   3. A SECOND PAGE NOBODY LOOKED AT. The fit gate measures the DOM; this counts pages in the
 *      produced file. They answer the same question at different ends of the pipeline and only
 *      the second one is about the thing that gets emailed.
 *
 * Run: node scripts/render-collateral-pdf.mjs [E] [B1]
 */
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { ROOT } from "./lib/atlas-verify.mjs";
import { pdfPageCount } from "./lib/pdf-pagecount.mjs";

const DIR = join(ROOT, "docs/collateral");
const OUTDIR = join(DIR, "pdf");

/* The send-ready sheets and the names they go out under. The export date is in the filename; the
   OPERATIONAL AS OF stamp inside the sheet is the date of the readings, and the two are
   deliberately different things. */
const SHEETS = {
  E: ["E-discrete-event-contract-evidence.html",
    "Storm Atlas — Discrete Event-Contract Evidence — E — 2026-09-13.pdf"],
  B1: ["B1-97L-reinsurance-ils-parametric.html",
    "Storm Atlas — Reinsurance, ILS & Parametric — B1 — 2026-09-13.pdf"],
};
/* The faces the sheets ask for. A rendered leaf resolving to anything else means the webfont
   never arrived and the page is set in fallback metrics. */
const WANT_FACES = ["Source Serif 4", "Inter", "IBM Plex Mono"];

const want = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const keys = want.length ? want : Object.keys(SHEETS);
const unknown = keys.filter((k) => !SHEETS[k]);
if (unknown.length) {
  console.error(`unknown sheet(s): ${unknown.join(", ")}; known: ${Object.keys(SHEETS).join(", ")}`);
  process.exit(2);
}

const { chromium } = await import("playwright-core");
async function findChromium() {
  if (process.env.MT_CHROMIUM) return process.env.MT_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return null;
  const { readdir, access } = await import("node:fs/promises");
  let dirs = [];
  try { dirs = (await readdir(base)).filter((d) => d.startsWith("chromium-")).sort(); } catch { return null; }
  for (const d of dirs.reverse()) {
    const exe = join(base, d, "chrome-linux", "chrome");
    try { await access(exe); return exe; } catch { /* next */ }
  }
  return null;
}
const EXE = await findChromium();
const { mkdir } = await import("node:fs/promises");
await mkdir(OUTDIR, { recursive: true });

const browser = await chromium.launch(EXE ? { executablePath: EXE, args: ["--no-sandbox"] }
  : { args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });
let failed = 0;

for (const k of keys) {
  const [src, out] = SHEETS[k];
  const path = join(OUTDIR, out);
  if (!existsSync(join(DIR, src))) { console.log(`  FAIL  ${src} does not exist`); failed++; continue; }
  await page.goto(`file://${join(DIR, src)}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  /* THE FACES ACTUALLY IN USE, not the ones requested. Chromium reports the resolved family per
     element, so this reads what the page is set in rather than what its CSS asked for. */
  const faces = await page.evaluate(() => {
    const used = new Set();
    for (const el of document.querySelectorAll(".sheet *")) {
      if (!el.textContent || !el.textContent.trim()) continue;
      const fam = getComputedStyle(el).fontFamily.split(",")[0].replace(/^['"]|['"]$/g, "");
      used.add(fam);
    }
    return [...used];
  });
  const loaded = await page.evaluate((want) => want.filter((f) => document.fonts.check(`12px "${f}"`)),
    WANT_FACES);
  const asked = WANT_FACES.filter((f) => faces.includes(f));
  const missing = asked.filter((f) => !loaded.includes(f));

  /* The same measurement the fit gate makes, repeated here so a PDF is never produced from a
     page this process has not itself seen fit. */
  const sheets = await page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => {
    const budget = s.clientHeight, h = s.style.height, o = s.style.overflow;
    s.style.height = "auto"; s.style.overflow = "visible";
    const content = s.clientHeight;
    s.style.height = h; s.style.overflow = o;
    return { budget, content };
  }));
  const over = sheets.filter((s) => s.content > s.budget);

  console.log(`${k} — ${src}`);
  console.log(`   faces in use: ${asked.join(", ") || "(none of the webfaces)"}`
    + `${missing.length ? `   NOT LOADED: ${missing.join(", ")}` : "   all loaded"}`);
  console.log(`   sheet height: ${sheets.map((s) => `${s.content}/${s.budget}px`).join(", ")}`);
  if (missing.length) { console.log(`  FAIL  webfont(s) did not load; PDF would ship in fallback type`); failed++; continue; }
  if (over.length) { console.log(`  FAIL  sheet overflows its page; not printing`); failed++; continue; }

  /* margin is NOT passed — the document's own @page rule is the single source of truth. */
  await page.pdf({ path, printBackground: true, preferCSSPageSize: true });
  const c = pdfPageCount(path);
  const onePage = c.agree && c.objs === 1;
  console.log(`   ${onePage ? "ok" : "FAIL"}  ${c.objs} page(s) (declared ${c.declared}), `
    + `${(c.bytes / 1024).toFixed(0)} KB → ${resolve(path).replace(ROOT + "/", "")}`);
  if (!onePage) failed++;
  console.log("");
}

await browser.close();
console.log(failed ? `${failed} failure(s)` : "every sheet printed as a single Letter page");
process.exit(failed ? 1 : 0);
