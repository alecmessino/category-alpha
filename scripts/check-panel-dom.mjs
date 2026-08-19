/* WHAT THIS CHECKS, AND WHY IT IS NOT LIKE THE OTHER SUITES.
 *
 * Every other check in scripts/ asserts something about a function's return value. This one
 * asserts something about the SCREEN: that the Analog prior panel's honesty surface -- the
 * denominators, the Wilson intervals, the refusal reasons, the conditioning note -- actually
 * reaches a rendered DOM. A rule that only lives in source is a rule nobody enforced, and this
 * panel's entire job is to not undo the archive's refusal discipline on the way to a pixel.
 *
 * It loads docs/ in a real Chromium TWICE:
 *   1. against the committed payload  (docs/data/analogs.json)
 *   2. against scripts/fixtures/analogs-edge.json, which carries a refused rate, an empty pool
 *      and a null environment
 * The second run is not optional. The live payload frequently contains NO refused rate and no
 * empty pool -- as of writing, all three of its entries clear min_sample -- so a check that
 * only ever sees live data leaves every refusal path unexercised and reports green.
 *
 * NOT IN .github/workflows/checks.yml, deliberately. That job's header promises it is entirely
 * offline; this needs a browser binary it would have to download. Run it by hand after touching
 * docs/app/analogs.jsx, docs/app/claims.js or the emitter:
 *
 *     npm i --no-save playwright && npx playwright install chromium
 *     node scripts/check-panel-dom.mjs
 *
 * Exits non-zero on any page error or any missing probe.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const EDGE = join(ROOT, "scripts/fixtures/analogs-edge.json");

/* THE GUARD THAT STOPS A VACUOUS PASS.
 *
 * A skip prints "SKIPPED, not passed" and exits 0, which is right on a developer's machine and
 * catastrophic in CI: a workflow step that runs this without a browser installed goes green
 * forever while testing nothing, and the gate that catches the failures the static checks
 * cannot would be the gate nobody notices died. `--require-browser` turns the skip into an
 * exit 2. CI passes it; a laptop without playwright does not have to. */
const REQUIRE_BROWSER = process.argv.includes("--require-browser")
  || process.env.ATLAS_REQUIRE_BROWSER === "1";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  if (REQUIRE_BROWSER) {
    console.error("[panel-dom] playwright is REQUIRED here and is not installed.");
    console.error("            this gate was asked to run and could not, which is a failure,");
    console.error("            not a skip. install it or drop --require-browser.");
    process.exit(2);
  }
  console.log("[panel-dom] playwright is not installed - SKIPPED, not passed.");
  console.log("            npm i --no-save playwright && npx playwright install chromium");
  process.exit(0);
}

/* A playwright release only launches the browser build it was pinned to, and an environment
   that already ships a chromium (this repo's dev container does, at PLAYWRIGHT_BROWSERS_PATH)
   will not generally have that exact build. Rather than fail on the mismatch, look for a
   chromium already on disk and say which one is being driven -- a browser is a browser for the
   purpose of asking what text reached the DOM. Override with PANEL_DOM_CHROMIUM. */
async function findChromium() {
  if (process.env.PANEL_DOM_CHROMIUM) return process.env.PANEL_DOM_CHROMIUM;
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
const LAUNCH = EXE ? { executablePath: EXE } : {};
if (EXE) console.log("[panel-dom] driving " + EXE);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".jsx": "text/babel",
  ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon" };

/* Every same-origin path the server could not find, in request order. Reported beside the
   console errors so a failure names the file rather than describing the symptom. */
const MISSING = [];

/* BROWSER HOUSEKEEPING IS NOT A MISSING ASSET, and the list is explicit so it cannot quietly
   grow into "ignore 404s".
 *
 * Chromium asks for these on its own initiative, and WHICH ones it asks for depends on the
 * build: this container's chromium-1194 requests neither, while the build `npx playwright
 * install` puts on a CI runner requests both. That difference turned the first CI run of this
 * gate into 43 failures whose console message -- "Failed to load resource: the server responded
 * with a status of 404 ()" -- named no path at all.
 *
 *   /favicon.ico                                  requested for the tab icon whenever a page
 *                                                 declares only an SVG icon, as this one does.
 *   /.well-known/appspecific/com.chrome.devtools  the automation probe Chrome 136+ makes on
 *                                                 every navigation under DevTools protocol.
 *
 * Neither is requested by this application, so neither can mask an application defect. Any
 * OTHER 404 remains fatal and is now reported with its path. */
const BROWSER_PROBES = [
  /^\/favicon\.ico$/,
  /^\/\.well-known\//,
];
const isBrowserProbe = (p) => BROWSER_PROBES.some((re) => re.test(p));

/* Serve docs/ , optionally substituting the payload the panel fetches. */
function serve(payloadPath) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = (payloadPath && p === "/data/analogs.json") ? payloadPath : join(DOCS, p);
      const b = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(b);
    } catch {
      /* NAME WHAT WAS MISSING. Chromium's console message for a same-origin 404 is "Failed to
         load resource: the server responded with a status of 404 ()" with no URL in it, so a
         run that fails on missing files reports N identical unactionable lines. Recording the
         path here is the difference between "43 failures" and "43 requests for
         /data/frames/....json". */
      if (!isBrowserProbe(p)) MISSING.push(p);
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((r) => server.listen(0, () => r(server)));
}

/* The probes. Each is a property of the RENDERED TEXT, not of the source.
   `always` = a run fails without it. The empty-pool state is the one exception: the archive is
   not obliged to have matched nothing today, so its absence from the live run is a fact about
   this week's ocean rather than a defect. The fixture, which does contain an empty pool, is
   required to show it -- that is what the fixture is for. */
const PROBES = [
  ["panel rendered at all",         /analog/i,                                                    "always"],
  ["conditioning note verbatim",    /Genesis-conditioned/i,                                       "always"],
  ["effective sample size",         /effective sample|ESS/i,                                       "always"],
  ["a count over a denominator",    /\d+\s*\/\s*\d+/,                                              "always"],
  ["a Wilson interval",             /\[\s*\d+(\.\d+)?\s*[-–—]\s*\d+(\.\d+)?\s*%\s*\]/,             "always"],
  ["a refusal reason on screen",    /below the sample gate|< min_sample|too few|not published|no analogs/i, "always"],
  ["a RATE REFUSED cell",           /RATE REFUSED/i,                                              "fixture"],
  ["the no-analogs state",          /no analogs|matched 0|0 storms matched/i,                     "fixture"],
  /* `unscoreable` is counted over the WHOLE archive, not over the matched cases, so an entry
     that matched NOTHING still carries it — and the no-analogs state is exactly where the
     temptation to render nothing is strongest. This locks the statement to that state rather
     than to the page: it must appear within the empty entry, not merely somewhere below it. */
  ["BASE RATE ONLY survives an empty pool", (t) => {
    const i = t.search(/no analogs|0 storms matched/i);
    return i >= 0 && /BASE RATE ONLY/i.test(t.slice(i, i + 1600));
  }, "fixture"],
  ["a BASE RATE ONLY badge",        /BASE RATE ONLY/i,                                             "always"],
  ["genesis-vs-current statement",  /genesis/i,                                                    "always"],
];

async function run(label, payloadPath, kind) {
  const server = await serve(payloadPath);
  const port = server.address().port;
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 2560, height: 1600 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    const t = m.text();
    // aborted third-party requests are this harness's own doing, not a page defect
    if (m.type() === "error" && !/ERR_FAILED|ERR_ABORTED|net::/.test(t)) errors.push("console: " + t.slice(0, 200));
  });
  // The board polls its own snapshot every 60s, so the network is never idle and `networkidle`
  // never settles; and it pulls map tiles from hosts a DOM check neither needs nor wants.
  /* Same as the overview run below: browser-initiated probes are aborted rather than served, so
     they never register as a 404 the application caused. */
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith(`http://127.0.0.1:${port}`)) return r.abort();
    return isBrowserProbe(new URL(u).pathname) ? r.abort() : r.continue();
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  // ORDER MATTERS. The panel lives in the Models tab, and MT_Section renders no children while
  // it is closed, so nothing calls the payload fetch until the tab is selected -- waiting for
  // __MT_ANALOGS_STATE before clicking waits for a fetch that has not been asked for yet. A
  // check that never reaches the panel also proves nothing about the panel.
  try { await page.getByText(/^Models$/).first().click({ timeout: 15000 }); }
  catch (e) { errors.push("could not reach the Models tab: " + e.message.slice(0, 90)); }
  try { await page.waitForFunction(() => window.__MT_ANALOGS_STATE && window.__MT_ANALOGS_STATE !== "loading", { timeout: 40000 }); }
  catch { errors.push("the panel's payload fetch never resolved"); }
  await page.waitForTimeout(2000);

  const text = await page.evaluate(() => document.body.innerText);
  // The collapsed summary is a separate render path: MT_Section shows `summary` only when
  // closed, and the parent reads it from a payload that lands after mount.
  const entries = await page.evaluate(() => ((window.__MT_ANALOGS || {}).entries || []).length);
  let summary = "(not read)";
  try {
    await page.getByText(/ANALOG PRIOR/i).first().click({ timeout: 8000 });
    await page.waitForTimeout(1200);
    const t2 = await page.evaluate(() => document.body.innerText);
    const m = t2.match(/(\d+) system\(s\) and area\(s\) matched|archive payload not read yet/i);
    summary = m ? m[0] : "(summary line not found)";
  } catch (e) { errors.push("could not collapse the section: " + e.message.slice(0, 90)); }

  await browser.close();
  server.close();

  console.log(`\n=== ${label} ===`);
  console.log(`page errors: ${errors.length}`);
  errors.slice(0, 8).forEach((e) => console.log("   " + e));
  if (MISSING.length) {
    const uniq = [...new Set(MISSING)];
    console.log(`   ${MISSING.length} request(s) 404ed, ${uniq.length} distinct path(s):`);
    uniq.slice(0, 12).forEach((m) => console.log("     404 " + m));
    MISSING.length = 0;
  }
  let missing = 0;
  for (const [name, re, when] of PROBES) {
    const hit = typeof re === "function" ? re(text) : re.test(text);
    const required = when === "always" || when === kind;
    if (!hit && required) missing++;
    console.log(`  ${hit ? "yes" : (required ? "NO " : " - ")}  ${name}`);
  }
  const summaryOk = entries > 0 ? summary.startsWith(String(entries)) : true;
  console.log(`  ${summaryOk ? "yes" : "NO "}  collapsed summary matches the payload (${entries} entries -> "${summary}")`);
  if (!summaryOk) missing++;
  return errors.length + missing;
}

/* THE BOARD BOOTS WITH NO STORM SELECTED, AND MUST SURVIVE IT.
 *
 * main.jsx boots to the overview on purpose -- "Boot to the OVERVIEW, not to storm #1" -- so
 * `storm` is null until someone picks one. Every panel that takes a stormId therefore has to
 * render that state, and the Evidence Matrix did not: it looked up `MT.storms[null]` and handed
 * the undefined result to readers that dereference it. React unmounted the subtree, which on a
 * live board meant the Evidence Matrix, the map, the tab bar and four unrelated panels all
 * disappeared together. It shipped, and stayed broken for a day, because no offline check can
 * see a render and the only thing that could was verify-live -- which runs AFTER deploy.
 *
 * The condition is specific: it needs a storm IN THE FEED (so the evidence array is built) and
 * NO storm selected (so the readers get nothing). That is the default state of a fresh load
 * whenever the basin is active, i.e. the single most common way anyone sees this page.
 */
async function runOverviewBoot() {
  const server = await serve(null);
  const port = server.address().port;
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 2560, height: 1600 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/ERR_FAILED|ERR_ABORTED|net::/.test(t)) errors.push("console: " + t.slice(0, 200));
  });
  /* The probes are refused at the route layer rather than served, so they never reach the
     server and never produce a console 404 -- an abort registers as ERR_ABORTED, which the
     filter above already drops as a request this harness itself blocked. */
  await page.route("**/*", (r) => {
    const u = r.request().url();
    if (!u.startsWith(`http://127.0.0.1:${port}`)) return r.abort();
    return isBrowserProbe(new URL(u).pathname) ? r.abort() : r.continue();
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1500);

  console.log("\n=== overview boot: a storm in the feed, none selected ===");
  let bad = 0;

  // The precondition. Without a storm in the feed the evidence array is empty, every reader is
  // unreachable, and a green result here would mean nothing at all -- so say so rather than pass.
  const feed = await page.evaluate(() => ({
    storms: Object.keys((window.MT && window.MT.storms) || {}).length,
    evidence: ((window.MT && window.MT.evidence) || []).length,
  }));
  console.log(`        feed: ${feed.storms} storm(s) · ${feed.evidence} evidence row(s)`);
  if (!feed.evidence) {
    console.log("  ..    no evidence rows in this payload - the storm-dependent readers were not exercised");
  }

  // Reach the panel: it lives in the Models tab, inside a "Verify" section that starts closed.
  try { await page.getByText(/^Models$/).first().click({ timeout: 15000 }); }
  catch (e) { errors.push("could not reach the Models tab: " + e.message.slice(0, 90)); }
  await page.waitForTimeout(500);
  try { await page.getByText(/^Verify$/).first().click({ timeout: 10000 }); }
  catch (e) { errors.push("could not open the Verify section: " + e.message.slice(0, 90)); }
  await page.waitForTimeout(1500);

  const selected = await page.evaluate(() => document.body.innerText);
  const rendered = /Evidence Matrix/i.test(selected);
  console.log(`  ${rendered ? "yes" : "NO "}  the Evidence Matrix renders with no storm selected`);
  if (!rendered) bad++;

  /* It must render the ROWS too, not just its own header -- a table that threw inside its body
     and got replaced by a boundary would still match the title. */
  const rows = await page.evaluate(() => {
    const t = [...document.querySelectorAll("table")].find((x) => /NHC Public Advisory|ENSO phase/i.test(x.innerText));
    return t ? t.querySelectorAll("tbody tr").length : 0;
  });
  console.log(`  ${rows > 0 ? "yes" : "NO "}  its rows render (${rows} row(s))`);
  if (feed.evidence && rows !== feed.evidence) {
    console.log(`        expected ${feed.evidence} row(s) from the payload`);
    bad++;
  }

  /* Readers that need a storm show the terminal's own no-value mark. Readers that do not --
     ENSO, SST -- must still show a real reading, so a blanket em dash would be its own bug. */
  const ensoRead = /(El Ni|La Ni|Neutral|ENSO)/i.test(selected);
  console.log(`  ${ensoRead ? "yes" : "NO "}  the storm-independent readings still show a value`);
  if (!ensoRead) bad++;

  await browser.close();
  server.close();
  console.log(`page errors: ${errors.length}`);
  errors.slice(0, 8).forEach((e) => console.log("   " + e));
  if (MISSING.length) {
    const uniq = [...new Set(MISSING)];
    console.log(`   ${MISSING.length} request(s) 404ed, ${uniq.length} distinct path(s):`);
    uniq.slice(0, 12).forEach((m) => console.log("     404 " + m));
    MISSING.length = 0;
  }
  return errors.length + bad;
}

// The committed payload is not required to contain an empty pool; the fixture is required to
// contain everything.
let bad = await runOverviewBoot();
bad += await run("committed payload", null, "live");
bad += await run("edge fixture (refused rates, empty pool, null environment)", EDGE, "fixture");

if (bad) { console.log(`\n[panel-dom] ${bad} failure(s)`); process.exit(1); }
console.log("\n[panel-dom] the honesty surface reaches the screen on both payloads");
