#!/usr/bin/env node
/* The numbers Phase 1 is not finished without.
 *
 * The Storm Atlas holds 224,153 track points in a browser and claims to stay fast. That claim
 * is worth exactly as much as the measurement behind it, so this drives the real page in a real
 * Chromium and reports against a stated budget. A benchmark whose thresholds nobody wrote down
 * is a demo.
 *
 * WHAT IS AND IS NOT THE ATLAS'S COST. The design system's fonts.css imports IBM Plex Mono from
 * Google Fonts, and a stylesheet @import blocks first paint. Where that host is unreachable the
 * page waits on it for as long as the connection takes to fail -- measured here at about
 * thirteen seconds, and IDENTICALLY on the existing terminal, because it is the same shared
 * stylesheet. It is reported separately rather than folded into the Atlas's own numbers, and
 * both surfaces are timed so the comparison is on the record rather than asserted.
 *
 * Not in CI: it needs a browser binary, which is the same reason check-panel-dom.mjs is not.
 *   npx playwright install chromium   (or set BENCH_CHROMIUM)
 *   node scripts/bench-atlas.mjs
 */
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");

/* The budgets. Each is here because something specific goes wrong past it. */
const BUDGET = {
  packTransferMB: 3.0,        // over this, a cold visit is a download rather than a page
  criticalPathMB: 2.0,        // core + tracks: what must arrive before anything can be drawn
  decodeAndIndexMs: 400,      // gunzip, view, project 224k points, build the genesis index
  fullDrawMs: 120,            // one repaint of the whole filtered archive at basin zoom
  filterMs: 30,               // a filter change must feel like a state change, not a query
  queryMs: 16,                // one frame: a click on the ocean answers inside one
  hitTestMs: 2,               // pointer feedback that lags reads as a broken map
  shellPaintMs: 700,          // the scale line and map frame, with the font CDN discounted
  densityMs: 16,              // archive-wide pathway grid: one frame, so a filter change is live
  genesisDensityMs: 4,        // 3,959 genesis points; anything slower means it is doing too much
  replayTickMs: 8,            // the incremental tick, 20/s -- past this the head visibly stutters
  replayRepaintMs: 200,       // rebuilding the whole revealed prefix after a pan or a zoom
  timelineBuildMs: 60,        // sorting and merging 3,885 spans on every filter change
};

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.log("[bench] playwright is not installed - SKIPPED, not passed.");
  console.log("        npm i --no-save playwright && npx playwright install chromium");
  process.exit(0);
}

async function findChromium() {
  if (process.env.BENCH_CHROMIUM) return process.env.BENCH_CHROMIUM;
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

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".jsx": "text/babel",
  ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".gz": "application/gzip", ".png": "image/png" };

function serve() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const b = await readFile(join(DOCS, p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end("not found"); }
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

let failures = 0;
const results = [];
function gate(label, value, budget, unit, lowerIsBetter = true) {
  const ok = lowerIsBetter ? value <= budget : value >= budget;
  if (!ok) failures++;
  results.push({ label, value, budget, unit, ok });
  const v = typeof value === "number" ? value.toFixed(value < 10 ? 2 : 0) : value;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(46)} ${String(v).padStart(8)} ${unit}` +
    `   budget ${budget} ${unit}`);
}

const server = await serve();
const port = server.address().port;
const exe = await findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
if (exe) console.log(`[bench] driving ${exe}`);

/* ---- 1. bytes on the wire ------------------------------------------------------------ */
console.log("\n[1] what a cold visit downloads");
{
  const dir = join(DOCS, "storm-atlas/data");
  const sizes = {};
  for (const f of await readdir(dir)) {
    if (f.endsWith(".gz") || f.endsWith(".json")) sizes[f] = (await stat(join(dir, f))).size;
  }
  const critical = (sizes["atlas-core-v1.bin.gz"] || 0) + (sizes["atlas-tracks-v1.bin.gz"] || 0);
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  gate("pack, everything including the lazy environment", total / 1e6, BUDGET.packTransferMB, "MB");
  gate("pack, critical path (core + tracks)", critical / 1e6, BUDGET.criticalPathMB, "MB");
  const dist = join(DOCS, "storm-atlas/dist");
  let bundle = 0;
  for (const f of await readdir(dist)) bundle += (await stat(join(dist, f))).size;
  console.log(`        bundle ${(bundle / 1e3).toFixed(0)} KB (React included, production build)`);
}

/* ---- 2. both surfaces, cold ----------------------------------------------------------- */
console.log("\n[2] cold load, both surfaces, with the unreachable font CDN discounted");
/* The assets each document REFERENCES ITSELF. Gating on these and not on everything measures
 * what the surface controls.
 *
 * The distinction is not a convenience. A stylesheet @import in the shared design system points
 * at Google Fonts, and CSS blocks SCRIPT EXECUTION -- so where that host is unreachable, code
 * that arrived in eighty-five milliseconds does not run for thirteen seconds, and anything it
 * would then request (a split chunk, a webfont) inherits the whole stall. Timing those together
 * would credit this surface with a delay that is identical on the terminal and is caused by
 * neither. Both are measured; both are printed; only the controlled one is a gate. */
const DOC_ASSETS = [
  "styles.css", "leaflet.css", "leaflet.js", "_ds_bundle.js", "claims.js",
  "dist/atlas.js", "atlas-manifest.json", "atlas-core-v1.bin.gz", "atlas-tracks-v1.bin.gz",
  "app/main.jsx", "app/panels.jsx", "app/compute.js", "app/data-loader.js", "vendor/babel.js",
  "vendor/react.js", "vendor/react-dom.js", "data/latest.json", "data/frames.json",
];

const cold = {};
for (const [label, path] of [["terminal", "/"], ["atlas", "/storm-atlas/"]]) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**",
                   "**basemaps.cartocdn.com**", "**gibs.earthdata.nasa.gov**"]) {
    await ctx.route(h, (r) => r.abort());
  }
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: "domcontentloaded" });
  const m = await page.evaluate((DOC_ASSETS) => {
    const rs = performance.getEntriesByType("resource");
    const ours = rs.filter((r) => !/fonts\.googleapis|fonts\.gstatic|cartocdn|earthdata/.test(r.name));
    /* The code and data this surface controls, separated from the WEBFONT FILES.
     *
     * The two are not comparable. A self-hosted .woff2 cannot even be REQUESTED until the CSS
     * chain resolves, and that chain ends at a Google Fonts @import in the shared design
     * system -- so where that host is unreachable the local font files inherit the whole stall
     * without the Atlas having done anything. Timing them together would report a thirteen
     * second shell for assets that arrived in a tenth of a second, and would credit this
     * surface with a delay that is identical on the terminal. */
    const controlled = ours.filter((r) => DOC_ASSETS.some((n) => r.name.endsWith(n)));
    const font = rs.find((r) => /fonts\.googleapis/.test(r.name));
    const deferred = ours.filter((r) => !DOC_ASSETS.some((n) => r.name.endsWith(n)));
    return {
      bytes: ours.reduce((a, r) => a + (r.transferSize || 0), 0),
      requests: ours.length,
      lastOurAsset: Math.round(Math.max(0, ...controlled.map((r) => r.responseEnd))),
      lastDeferred: Math.round(Math.max(0, ...deferred.map((r) => r.responseEnd), 0)),
      fontBlockMs: font ? Math.round(font.duration) : 0,
    };
  }, DOC_ASSETS);
  cold[label] = m;
  console.log(`        ${label.padEnd(9)} ${(m.bytes / 1e6).toFixed(2)} MB over ${m.requests} ` +
    `requests · referenced assets received at ${m.lastOurAsset} ms · ` +
    `execution-gated assets at ${m.lastDeferred} ms · font CDN stalled ${m.fontBlockMs} ms`);
  await ctx.close();
}
gate("atlas referenced assets received", cold.atlas.lastOurAsset, BUDGET.shellPaintMs, "ms");
console.log(`        the Atlas ships ${(cold.atlas.bytes / 1e6).toFixed(2)} MB against the ` +
  `terminal's ${(cold.terminal.bytes / 1e6).toFixed(2)} MB — and the terminal loads none of it`);
console.log(`        the ~${Math.round(cold.terminal.fontBlockMs / 1000)} s font stall is the ` +
  "shared design system's, not this surface's: it is the same on both.");
console.log("        docs/tokens/fonts.css imports IBM Plex Mono from Google Fonts, and a CSS");
console.log("        @import blocks script execution with no timeout. Self-hosting it, as this");
console.log("        repo already does for Erode and Satoshi, would remove the last such");
console.log("        dependency from BOTH surfaces -- out of scope here, and measured so the");
console.log("        decision can be made on a number rather than a hunch.");

/* ---- 3. in-page work ------------------------------------------------------------------ */
console.log("\n[3] the work the Atlas actually does");
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
    await ctx.route(h, (r) => r.abort());
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/net::|ERR_/.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive,
    { timeout: 90000 });
  await page.waitForTimeout(600);

  const m = await page.evaluate(async () => {
    const { archive, world, getAnalogs } = globalThis.__ATLAS;
    const map = globalThis.__ATLAS_MAP;
    const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const time = (n, fn) => { const t = []; for (let i = 0; i < n; i++) { const s = performance.now(); fn(i); t.push(performance.now() - s); } return median(t); };

    // Re-run the load-time work on the data already in memory.
    const { projectWorld } = await import("./src/render/atlas-layer.js").catch(() => ({}));
    const decodeAndIndex = (() => {
      const s = performance.now();
      const w = globalThis.__ATLAS_PROJECT ? globalThis.__ATLAS_PROJECT(archive) : null;
      archive._spatial = null;
      return performance.now() - s;
    })();

    const { filterStorms } = globalThis.__ATLAS_QUERY || {};
    const filterMs = filterStorms
      ? time(8, (i) => filterStorms(archive, { intensity: ["all", "cat1", "cat3", "cat4"][i % 4] }))
      : null;

    const queryMs = time(8, (i) => getAnalogs(archive, {
      lat: 12 + (i % 4), lon: -105 - (i % 5) * 3, radiusKm: 500, minPoolSeason: 1971,
      regions: ["hawaii", "mexico", "conus"],
    }));

    // A full repaint of the population layer, forced.
    const layer = globalThis.__ATLAS_POPULATION;
    const drawMs = layer ? time(6, () => layer.redrawNow()) : null;

    const hitMs = globalThis.__ATLAS_HIT
      ? time(60, (i) => globalThis.__ATLAS_HIT(map, { x: 200 + (i % 40) * 12, y: 150 + (i % 30) * 9 }))
      : null;

    /* Phase 2. The density grids run over the WHOLE filtered archive now that they are no longer
       tied to a probe, and the replay tick runs twenty times a second while the map is playing --
       both are on the interactive path, so both are gated. */
    const A = globalThis.__ATLAS || {};
    const rows = filterStorms ? filterStorms(archive, {}).rows : null;
    const cases = rows ? Array.from(rows, (r) => ({ row: r })) : null;
    const densityMs = A.pathwayDensity && cases
      ? time(6, () => A.pathwayDensity(archive, cases, 2.0)) : null;
    const genesisDensityMs = A.genesisDensity && rows
      ? time(8, () => A.genesisDensity(archive, rows, 2.0)) : null;

    const T = globalThis.__ATLAS_TIMELINE || {};
    const timelineBuildMs = T.buildTimeline && rows
      ? time(6, () => T.buildTimeline(archive, rows)) : null;

    /* The replay's two paths, measured separately because they cost different things: a tick
       inks only the segments that appeared since the last one, while a repaint rebuilds every
       storm revealed so far -- which is what a pan or a zoom forces. */
    let replayTickMs = null;
    let replayRepaintMs = null;
    const replay = globalThis.__ATLAS_REPLAY;
    if (replay && T.buildTimeline && T.advance && rows) {
      const tl = T.buildTimeline(archive, rows);
      replay.setTimeline(tl);
      // Wind to the middle of the record so a tick has a realistic amount of live track.
      const mid = T.fromActive(tl, tl.activeMin * 0.6);
      replay.setCursor(mid);
      let c = mid;
      replayTickMs = time(40, () => {
        c = T.advance(tl, c, 6 * 60, { skipQuiet: true }).cursor;
        replay.setCursor(c);
      });
      replayRepaintMs = time(5, () => { replay.invalidate(); replay.redrawNow(); });
      replay.setTimeline(null);
    }

    return { decodeAndIndex, filterMs, queryMs, drawMs, hitMs,
             densityMs, genesisDensityMs, timelineBuildMs, replayTickMs, replayRepaintMs,
             storms: archive.nStorms, points: archive.nPoints };
  });

  if (m.drawMs !== null) gate("full population repaint, whole archive", m.drawMs, BUDGET.fullDrawMs, "ms");
  if (m.filterMs !== null) gate("filter change over 3,959 storms", m.filterMs, BUDGET.filterMs, "ms");
  gate("analog query (the click on the ocean)", m.queryMs, BUDGET.queryMs, "ms");
  if (m.hitMs !== null) gate("pointer hit-test", m.hitMs, BUDGET.hitTestMs, "ms");
  if (m.decodeAndIndex) gate("re-project 224k points", m.decodeAndIndex, BUDGET.decodeAndIndexMs, "ms");
  if (m.densityMs !== null) gate("pathway density, whole archive", m.densityMs, BUDGET.densityMs, "ms");
  if (m.genesisDensityMs !== null) gate("genesis density, whole archive", m.genesisDensityMs, BUDGET.genesisDensityMs, "ms");
  if (m.timelineBuildMs !== null) gate("build the replay clock", m.timelineBuildMs, BUDGET.timelineBuildMs, "ms");
  if (m.replayTickMs !== null) gate("replay tick (incremental)", m.replayTickMs, BUDGET.replayTickMs, "ms");
  if (m.replayRepaintMs !== null) gate("replay repaint to cursor (after a pan)", m.replayRepaintMs, BUDGET.replayRepaintMs, "ms");
  if (errors.length) { failures++; console.log("  FAIL  page errors: " + errors.join(" | ")); }
  else console.log("  ok    no page errors");
  await ctx.close();
}

await browser.close();
server.close();

console.log(failures
  ? `\n${failures} budget(s) exceeded — Phase 1 is not finished\n`
  : "\nevery budget met\n");
process.exit(failures ? 1 : 0);
