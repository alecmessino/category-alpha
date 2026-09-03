#!/usr/bin/env node
/* The six states of the instrument, photographed from the real page.
 *
 * These are the frames the handoff is reviewed against, so they are GENERATED rather than
 * collected: every one is the shipped bundle, driven through the surface's own controls, at the
 * canonical 1440x900. A screenshot taken by hand is a screenshot of whatever happened to be on
 * screen that afternoon.
 *
 * Run: node scripts/shoot-atlas.mjs [--out docs/storm-atlas/shots]
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
/* NOT UNDER docs/. Everything in docs/ is the published site, and a set of 2x review frames is
   several megabytes of it that no reader of the Atlas needs. They are build output: reproducible
   from this script at any commit, ignored by git, and handed to a reviewer directly. */
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(ROOT, ".atlas-shots");

const { chromium } = await import("playwright");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml",
  ".gz": "application/octet-stream" };
const server = await new Promise((r) => {
  const s = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const b = await readFile(join(DOCS, p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end("not found"); }
  });
  s.listen(0, () => r(s));
});
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, serviceWorkers: "block" });
/* Hermetic, like every gate: the surface is drawn from this origin alone, and a shot that
   depended on a font CDN would be a shot of a page nobody serves. */
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();
await mkdir(OUT, { recursive: true });

const open = async (query = "") => {
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(1800);
};
const shot = async (name) => {
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${name.padEnd(22)} ${file}`);
};

console.log("\n[shots] the six states, at 1440x900");

/* 1 · RESTING. Pathway counts over the archive, which is what the plate now rests on. */
await open();
await shot("01-resting");

/* 2 · CONDITIONED. A genesis-radius cohort with a season floor: the comparison column arrives,
   the cohort line states the population, the deltas appear. */
await open("w=12,-105,800&s0=1971");
await shot("02-conditioned");

/* 3 · OUTCOME-SELECTED. One row of the answer held: its own storms lifted on the plate, the
   foot echoing the row's already-published figures. */
await page.click('[data-lens-row="int:cat3"]').catch(async () => {
  const k = await page.evaluate(() => document.querySelector("[data-lens-row]").getAttribute("data-lens-row"));
  await page.click(`[data-lens-row="${k}"]`);
});
await page.waitForTimeout(900);
await shot("03-outcome-selected");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* 4 · GEOGRAPHIC SELECTION. A shift-drag brush over the Gulf: the storms of this cohort that
   went through that water, counted, publishing nothing. */
{
  const b = await page.evaluate(() => {
    const r = document.querySelector(".at-plate").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.w * 0.28, b.y + b.h * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.w * 0.62, b.y + b.h * 0.66, { steps: 14 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(900);
  await shot("04-geographic-selection");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

/* 5 · ANALOG-SELECTED. One storm, opened from the plate: the strip, its bridge, and the answer
   column answering for the subject rather than for the archive. */
{
  await open("w=12,-105,800&s0=1971");
  const row = await page.evaluate(() => {
    const A = globalThis.__ATLAS.archive;
    const rows = globalThis.__ATLAS_DRAWN_ROWS || [];
    for (const r of rows) {
      if (A.storms.str("name", r) && A.storms.str("max_category", r)) return r;
    }
    return rows[0];
  });
  await page.evaluate((r) => globalThis.__ATLAS_SELECT(r), row);
  await page.waitForTimeout(1500);
  await shot("05-analog-selected");
  /* And the record behind it, since the strip is what a reader meets first. */
  const open2 = await page.$("[data-open-record]");
  if (open2) { await open2.click(); await page.waitForTimeout(600); await shot("05b-analog-record"); }
}

/* 6 · REFUSAL. An East Pacific cohort narrowed until contracts refuse: BASE RATE ONLY, OUT OF
   SCOPE and the conditioned-on rule, each stated where it applies and explained once below. */
await open("s0=2022&b=NA&i=cat3");
await shot("06-refusal");
await page.evaluate(() => {
  const el = document.querySelector("[data-limit-groups]");
  if (el) el.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(600);
await shot("06b-refusal-limits");

/* And the editor, anchored to the clause that opened it -- the one composition change a still
   frame of the resting screen cannot show. */
await open("w=12,-105,800&s0=1971");
await page.click("[data-zone-edit]");
await page.waitForTimeout(700);
await shot("07-clause-editor");

await browser.close();
server.close();
console.log("\nthe six states are in " + OUT);
