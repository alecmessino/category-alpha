#!/usr/bin/env node
/* OUTREACH SCREENSHOTS OF /dossier/lala.
 *
 * The dossier is generated, so its screenshots go stale the moment a number moves. This exists so
 * regenerating them is one command rather than an afternoon of cropping, and so the images a
 * recipient sees are the page as published rather than a local approximation of it.
 *
 * THE WEBFONT IS THE REASON THIS IS NOT FOUR LINES. docs/tokens/fonts.css pulls IBM Plex Mono from
 * fonts.googleapis.com, and the dossier's whole telemetry voice -- every timestamp, wind, distance,
 * interval and refusal -- is set in it. In a sandbox with no route to that host the page still
 * renders, silently, in whatever mono the container happens to have, and the screenshots would not
 * look like the page. So both font hosts are intercepted and served from a local cache, and the
 * run REFUSES to write images if the interception did not take. The cache fills itself on the
 * first run where the network allows; behind a proxy Node does not pick up, fill it by hand --
 * fetch FONT_CSS_URL below, take the woff2 URL out of each latin @font-face block, and save
 * them into FONT_CACHE as plex-400.woff2, plex-500.woff2 and plex-600.woff2.
 *
 * Run: node scripts/shoot-dossier-lala.mjs          [FONT_CACHE=... SHOT_DIR=... ALLOW_FALLBACK_FONT=1]
 */
import { createServer } from "node:http";
import { readFile, writeFile, readdir, mkdir, rm, stat } from "node:fs/promises";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const OUT = process.env.SHOT_DIR || join(DOCS, "dossier/lala/screenshots");
const FONT_CACHE = process.env.FONT_CACHE || "/tmp/plexfont";
const WEIGHTS = ["400", "500", "600"];
const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@"
  + WEIGHTS.join(";") + "&display=swap";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
  + "Chrome/120.0.0.0 Safari/537.36";

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".woff": "font/woff", ".png": "image/png" };

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("[dossier-shots] playwright is not installed."); process.exit(2); }

async function findChromium() {
  if (process.env.ATLAS_DOM_CHROMIUM) return process.env.ATLAS_DOM_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return null;
  const { access } = await import("node:fs/promises");
  let dirs = [];
  try { dirs = (await readdir(base)).filter((d) => d.startsWith("chromium-")).sort(); }
  catch { return null; }
  for (const d of dirs.reverse()) {
    const exe = join(base, d, "chrome-linux", "chrome");
    try { await access(exe); return exe; } catch { /* next */ }
  }
  return null;
}

const srv = createServer(async (rq, rs) => {
  let p = decodeURIComponent(rq.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(DOCS, p));
    rs.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
    rs.end(body);
  } catch { rs.writeHead(404); rs.end("not found"); }
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const port = srv.address().port;

async function loadFaces() {
  const out = [];
  for (const w of WEIGHTS) {
    const buf = await readFile(join(FONT_CACHE, `plex-${w}.woff2`)).catch(() => null);
    if (buf) out.push([w, buf]);
  }
  return out;
}

/* Fill the cache from Google Fonts when it is empty and the network allows. A failure here is not
   an error -- the load check further down is what decides whether the run may write images. Only
   the latin subset is kept: the dossier has no Cyrillic or Greek, and the other subsets are glyphs
   no screenshot will ever show. Google serves one @font-face block per subset, and the latin one
   is the block whose unicode-range covers U+0000-00FF. */
async function fillFontCache() {
  const res = await fetch(FONT_CSS_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) return;
  const css = await res.text();
  await mkdir(FONT_CACHE, { recursive: true });
  for (const block of css.split("@font-face").slice(1)) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const href = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
    const range = block.match(/unicode-range:([^;]+);/)?.[1] || "";
    if (!weight || !href || !WEIGHTS.includes(weight) || !/U\+0000-00FF/.test(range)) continue;
    const font = await fetch(href, { headers: { "User-Agent": UA } });
    if (font.ok) await writeFile(join(FONT_CACHE, `plex-${weight}.woff2`),
      Buffer.from(await font.arrayBuffer()));
  }
}

let faces = await loadFaces();
if (faces.length === 0) {
  await fillFontCache().catch(() => { /* reported by the load check below */ });
  faces = await loadFaces();
}
/* font-display:block, not swap: a swap would let the first paint go out in the fallback and the
   screenshot could catch it mid-swap. */
const fontCss = faces.map(([w]) => `@font-face{font-family:'IBM Plex Mono';font-style:normal;`
  + `font-weight:${w};font-display:block;`
  + `src:url(http://127.0.0.1:${port}/__plex-${w}.woff2) format('woff2');}`).join("\n");

const exe = await findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe, args: ["--no-sandbox"] }
  : { args: ["--no-sandbox"] });

const problems = [];
async function open(width, height, deviceScaleFactor = 2) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  await ctx.route("**/__plex-*.woff2", async (route) => {
    const w = route.request().url().match(/__plex-(\d+)/)[1];
    const hit = faces.find(([fw]) => fw === w);
    if (!hit) return route.abort();
    route.fulfill({ status: 200, contentType: "font/woff2", body: hit[1] });
  });
  await ctx.route("https://fonts.googleapis.com/**",
    (route) => route.fulfill({ status: 200, contentType: "text/css", body: fontCss }));
  await ctx.route("https://fonts.gstatic.com/**", (route) => route.abort());
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  pg.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  await pg.goto(`http://127.0.0.1:${port}/dossier/lala/`, { waitUntil: "networkidle" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(400);
  return { ctx, pg };
}

/* Prove the typeface before spending any shots on a page set in the wrong one. */
{
  const { ctx, pg } = await open(1240, 900);
  const loaded = await pg.evaluate(() =>
    [...document.fonts].filter((f) => f.family === "IBM Plex Mono" && f.status === "loaded").length);
  await ctx.close();
  if (loaded > 0) console.log(`IBM Plex Mono: ${loaded} face(s) loaded`);
  else if (process.env.ALLOW_FALLBACK_FONT) console.log("WARNING: fallback mono, ALLOW_FALLBACK_FONT set");
  else {
    console.error(`[dossier-shots] IBM Plex Mono did not load from ${FONT_CACHE}. Every number on `
      + "the page would be set in a substitute mono. Populate the cache (see the header of this "
      + "file) or re-run with ALLOW_FALLBACK_FONT=1 if you truly want that.");
    await browser.close(); srv.close(); process.exit(1);
  }
}

/* Section index -> filename. The order is the reading order, so the files sort into it. */
const SECTIONS = [["02-how-to-read", 0], ["03-event-overview", 1], ["04-chronology", 2],
  ["05-historical-record", 3], ["06-recorded-vs-happened", 4], ["07-provenance-discipline", 5],
  ["08-parametric-relevance", 6], ["09-institutional-use", 7]];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

{
  const { ctx, pg } = await open(1240, 900);
  const n = await pg.locator("section").count();
  if (n !== SECTIONS.length) {
    console.error(`[dossier-shots] the page has ${n} sections, this script names ${SECTIONS.length}.`);
    await browser.close(); srv.close(); process.exit(1);
  }
  await pg.screenshot({ path: join(OUT, "01-masthead.png") });          // what a recipient sees first
  for (const [name, i] of SECTIONS) {
    await pg.locator("section").nth(i).screenshot({ path: join(OUT, `${name}.png`) });
  }
  await ctx.close();
}
{
  /* The whole page at 1x. At 2x it is a 20 MB image nothing will open. */
  const { ctx, pg } = await open(1240, 900, 1);
  await pg.screenshot({ path: join(OUT, "00-full-page.png"), fullPage: true });
  await ctx.close();
}
{
  const { ctx, pg } = await open(430, 932);
  await pg.screenshot({ path: join(OUT, "10-mobile.png") });
  await ctx.close();
}

await browser.close(); srv.close();

if (problems.length) {
  console.log("\nPAGE PROBLEMS:");
  for (const p of [...new Set(problems)].slice(0, 8)) console.log("  " + p);
}
let total = 0;
console.log(`\n${relOut()}:`);
for (const f of (await readdir(OUT)).sort()) {
  const kb = Math.round((await stat(join(OUT, f))).size / 1024);
  total += kb;
  console.log(`  ${f.padEnd(30)} ${String(kb).padStart(5)} KB`);
}
console.log(`  ${"total".padEnd(30)} ${String(total).padStart(5)} KB`);
function relOut() { return OUT.startsWith(ROOT) ? OUT.slice(ROOT.length + 1) : OUT; }
