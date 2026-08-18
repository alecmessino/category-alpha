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

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
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
    } catch { res.writeHead(404); res.end("not found"); }
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
  await page.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}`) ? r.continue() : r.abort());
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

// The committed payload is not required to contain an empty pool; the fixture is required to
// contain everything.
let bad = await run("committed payload", null, "live");
bad += await run("edge fixture (refused rates, empty pool, null environment)", EDGE, "fixture");

if (bad) { console.log(`\n[panel-dom] ${bad} failure(s)`); process.exit(1); }
console.log("\n[panel-dom] the honesty surface reaches the screen on both payloads");
