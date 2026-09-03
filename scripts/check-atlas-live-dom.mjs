#!/usr/bin/env node
/* DOES THE OPERATIONAL RECORD REACH THE SCREEN, AND DOES THE FAILURE REACH IT TOO?
 *
 * scripts/test-atlas-live.mjs proves the freshness contract in the engine: given the pinned
 * b-deck, the selected-storm representation is 115 kt, 947 mb and 63 fixes rather than the
 * archive's 65 kt, 988 mb and 49. That is the arithmetic. This is the pixels.
 *
 * The distinction matters here more than usual, because the bug being fixed was NEVER an
 * arithmetic bug. Every number the old panel printed was a correct archive column. What was
 * wrong was the sentence around them -- "One storm, whole life" over a storm that was still
 * being flown -- and a sentence is not something an engine test can see.
 *
 * SERVED FROM THE FIXTURE, NOT FROM THE COMMITTED ARTIFACT. docs/storm-atlas/data/atlas-live-v1.json
 * is rewritten every ten minutes by the refresh job, so a gate asserting what it contains would
 * be asserting today's weather. This one intercepts that one URL and answers with an artifact
 * built from scripts/fixtures/bdeck-cp012026.dat, so its verdict is the same in five years. The
 * rest of the page -- the packs, the bundle, the stylesheet -- is exactly what is committed.
 *
 * THREE PASSES, because three states must be distinguishable on screen:
 *   [1] the artifact loads and governs the storm      -> OPERATIONAL / PROVISIONAL
 *   [2] the artifact 404s                             -> LIVE CONTINUATION UNAVAILABLE
 *   [3] the artifact loads and expects nothing        -> the archive's own provisional wording
 *
 * NOT IN THE FAST JOB: it needs a browser binary, like every other check-*-dom gate.
 *   node scripts/check-atlas-live-dom.mjs --require-browser
 */
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HERMETIC, serviceWorkerEscape } from "./lib/browser-harness.mjs";
import { parseBestTrack } from "./lib/atcf.mjs";
import { buildAtlasLive } from "./lib/atlas-live.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const FIXTURE = join(ROOT, "scripts/fixtures/bdeck-cp012026.dat");
const LIVE_PATH = "/storm-atlas/data/atlas-live-v1.json";

/* Same guard as every other browser gate: a skip is right on a laptop and catastrophic in CI. */
const REQUIRE_BROWSER = process.argv.includes("--require-browser")
  || process.env.ATLAS_REQUIRE_BROWSER === "1";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  if (REQUIRE_BROWSER) {
    console.error("[atlas-live-dom] playwright is REQUIRED here and is not installed.");
    process.exit(2);
  }
  console.log("[atlas-live-dom] playwright is not installed - SKIPPED, not passed.");
  process.exit(0);
}

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

/* ---- the fixture artifact, and the numbers it carries -------------------------------- */

const deckText = await readFile(FIXTURE, "utf8");
const deck = parseBestTrack(deckText);
/* A FIXED INSTANT so the artifact is byte-reproducible and its published age never moves. */
const NOW = Date.parse("2026-08-25T15:43:45.983Z");
const ARTIFACT = buildAtlasLive({
  storms: [{ id: "CP012026", name: "Lala" }],
  intel: { byStorm: { CP012026: {
    bestTrackHistory: deck.records,
    /* A SHIPS RUN, so the LATEST OPERATIONAL ENVIRONMENT block is exercised rather than
       skipped. Two fields, both published by the real product, both at tau 0. */
    ships: {
      ok: true, cycleIso: "2026-08-25T12:00:00.000Z",
      features: { shearKt: 6, sstC: 24 },
      labels: { shearKt: "850-200 mb deep-layer shear", sstC: "sea-surface temperature" },
      availability: { ohc: true, ir: true },
    },
    bestTrackSource: { url: "fixture://bdeck-cp012026.dat", status: 200, bytes: deckText.length },
  } } },
  nowMs: NOW,
  previous: null,
});
const EMPTY = buildAtlasLive({ storms: [], intel: { byStorm: {} }, nowMs: NOW, previous: null });

const REC = ARTIFACT.storms.CP012026;
/* Derived from the fixture rather than written down, so refreshing the fixture cannot leave this
   gate asserting a state the fixture no longer holds. */
const EXPECT = {
  peakKt: REC.peak_wind_kt,
  minMb: REC.min_mslp_mb,
  fixes: REC.fix_count,
  latestKt: REC.latest.kt,
  through: REC.latest_valid_time.slice(0, 10) + " " + REC.latest_valid_time.slice(11, 16) + "Z",
};

/* ---- the server, with one route answered from the fixture ---------------------------- */

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".gz": "application/gzip" };
const BROWSER_PROBES = [/^\/favicon\.ico$/, /^\/\.well-known\//];
const MISSING = [];

/* What the intercepted route answers with. Rewritten between passes. */
let liveMode = "fixture";   // "fixture" | "missing" | "empty"

const server = await new Promise((r) => {
  const s = createServer(async (req, res) => {
    let p = "/";
    try {
      p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      if (p === LIVE_PATH) {
        if (liveMode === "missing") { res.writeHead(404); res.end("not found"); return; }
        const body = JSON.stringify(liveMode === "empty" ? EMPTY : ARTIFACT);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(body);
        return;
      }
      const b = await readFile(join(DOCS, p));
      res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(b);
    } catch {
      if (BROWSER_PROBES.some((re) => re.test(p))) { res.writeHead(204); res.end(); return; }
      MISSING.push(p);
      res.writeHead(404);
      res.end("not found");
    }
  });
  s.listen(0, "127.0.0.1", () => r(s));
});
const port = server.address().port;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

const exe = await findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...HERMETIC });
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/net::|ERR_/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
});

/* The archive row the fixture is about, resolved in the page rather than written down: the pack
   is rebuilt four times a day and a hard-coded row index would rot. */
const LALA_ATCF = REC.atcf_id;

const open = async () => {
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive,
    null, { timeout: 90000 });
  const row = await page.evaluate((id) => {
    const a = globalThis.__ATLAS.archive;
    for (let i = 0; i < a.nStorms; i++) if (a.storms.str("atcf_id", i) === id) return i;
    return -1;
  }, LALA_ATCF);
  if (row < 0) return { row: -1 };
  const info = await page.evaluate((i) => {
    const a = globalThis.__ATLAS.archive;
    return { provisional: a.storms.bool("provisional", i),
      stormId: a.storms.str("storm_id", i),
      archivePeak: a.storms.num("max_vmax_kt", i),
      archiveMslp: a.storms.num("min_mslp_mb", i),
      archiveFixes: a.storms.num("track_points", i) };
  }, row);
  await page.evaluate((i) => globalThis.__ATLAS_SELECT(i), row);
  await page.waitForTimeout(1200);
  /* THE STRIP IS THE PANEL'S DEFAULT AND THE RECORD IS ONE PRESS AWAY. A selected storm opens on
     the minimum strip the locked rules ask for -- which record is speaking, what it recorded, and
     the bridge -- and OPEN RECORD shows the track, landfall, environment and quality blocks this
     gate reads. Pressed here so every assertion below is made against the same content it always
     was; what changed is which screen a reader meets first, not what the panel holds. */
  const open = await page.$("[data-open-record]");
  if (open) { await open.click(); await page.waitForTimeout(500); }
  return { row, ...info };
};

const inspector = () => page.evaluate(() => {
  const el = document.querySelector("[data-inspector]");
  if (!el) return null;
  return {
    state: el.getAttribute("data-source-state"),
    text: el.innerText.replace(/\s+/g, " "),
    badge: (document.querySelector("[data-source-badge]") || {}).innerText || null,
    through: (document.querySelector("[data-source-through]") || {}).innerText || null,
    envBlock: !!document.querySelector("[data-operational-env]"),
    archiveScope: (document.querySelector("[data-bridge-archive-scope]") || {}).innerText || null,
    /* ON SCREEN, not merely rendered: the failure this whole change is about was a true
       statement inside a scroll box nobody opens. */
    badgeOnScreen: (() => {
      const b = document.querySelector("[data-source-badge]");
      if (!b) return false;
      const r = b.getBoundingClientRect();
      const h = document.querySelector(".at-insp-head").getBoundingClientRect();
      return r.height > 0 && r.bottom <= h.bottom + 1 && r.top >= h.top - 1
        && r.bottom <= innerHeight + 1;
    })(),
    figureOnScreen: (() => {
      const f = document.querySelector(".at-figure");
      if (!f) return false;
      const r = f.getBoundingClientRect();
      return r.height > 0 && r.top >= -1 && r.bottom <= innerHeight + 1;
    })(),
    figure: (document.querySelector(".at-figure") || {}).innerText || null,
  };
});

/* ERRORS ARE ACCOUNTED FOR PER PASS, because one pass 404s on purpose.
 *
 * Pass [2] serves 404 for the live artifact -- that is the whole point of it -- and Chromium
 * logs the refused fetch as a console error carrying no path (a same-origin 404 never does).
 * Sweeping it into a global "no errors" assertion would either fail every run or teach the gate
 * to ignore 404s, which is the drift the other DOM gates explicitly warn against. So each pass
 * clears the list, and the pass that expects a 404 asserts that it got exactly that and nothing
 * else -- which makes the deliberate failure a CHECK rather than an exemption. */
const takeErrors = () => { const e = errors.slice(); errors.length = 0; return e; };

/* ---- [1] the operational state --------------------------------------------------------- */
console.log("\n[1] the operational record on screen");
liveMode = "fixture";
const meta = await open();
ok(`the archive still holds ${LALA_ATCF}`, meta.row >= 0,
  "the pack no longer carries the fixture's storm — repoint the fixture");
ok("and its archive row is still PROVISIONAL, which is what the fixture is about",
  meta.provisional === true,
  `provisional=${meta.provisional} — if this season has been post-analysed, the fixture needs `
  + "repointing at a storm that has not");

{
  const i = await inspector();
  ok("the inspector declares its source state on the element",
    i && i.state === "operational", i ? i.state : "no inspector");
  ok("the badge reads OPERATIONAL / PROVISIONAL",
    /OPERATIONAL\s*\/\s*PROVISIONAL/i.test(i.badge || ""), String(i.badge));
  ok("and it is ON SCREEN, inside the masthead, without scrolling", i.badgeOnScreen,
    "the badge rendered into a scroll box — which is where the old provisional flag lived");
  ok("the freshness line names the source and the valid time",
    /ATCF B-DECK/i.test(i.through || "") && (i.through || "").includes(EXPECT.through),
    `${i.through} (expected to contain ${EXPECT.through})`);
  ok("and states an age", /\d+(\.\d+)?\s*[HD]\s*OLD/i.test(i.through || ""), String(i.through));

  ok("the kicker no longer claims a whole life",
    !/whole life/i.test(i.text), i.text.slice(0, 120));
  ok("it says OPERATIONAL TO DATE instead", /OPERATIONAL TO DATE/i.test(i.text));

  ok(`the headline figure is the operational peak (${EXPECT.peakKt} kt)`,
    new RegExp(`\\b${EXPECT.peakKt}\\b`).test(i.figure || ""), String(i.figure));
  ok("labelled OPERATIONAL TO DATE rather than `peak`",
    /OPERATIONAL TO DATE/i.test(i.figure || ""), String(i.figure));
  ok("and the figure is on screen at first paint", i.figureOnScreen,
    "the acceptance criterion is that a first-time viewer sees this without scrolling");

  /* THE REGRESSION, STATED AS THE FAILURE IT WOULD BE. */
  ok(`the figure is NOT the archive's ${meta.archivePeak} kt`,
    !new RegExp(`^\\s*${meta.archivePeak}\\b`).test((i.figure || "").trim())
      || meta.archivePeak >= EXPECT.peakKt,
    `figure "${(i.figure || "").slice(0, 60)}" vs archive ${meta.archivePeak} kt`);

  ok(`the operational minimum pressure (${EXPECT.minMb} mb) is printed`,
    i.text.includes(`${EXPECT.minMb}mb`) || i.text.includes(`${EXPECT.minMb} mb`), "");
  ok(`the operational fix count (${EXPECT.fixes}) is printed`,
    new RegExp(`OPERATIONAL FIXES\\s*\\.*\\s*${EXPECT.fixes}\\b`, "i").test(i.text)
      || i.text.includes(`${EXPECT.fixes}`), "");
  ok("the archive's own peak is still shown, labelled as the archive's",
    /ARCHIVE PEAK/i.test(i.text), "");

  ok("the latest fix and its stage are reported",
    /LATEST FIX/i.test(i.text) && new RegExp(`${EXPECT.latestKt}\\s*kt`, "i").test(i.text), "");

  /* THE THREE SOURCE TAGS. */
  const tags = await page.evaluate(() => [...document.querySelectorAll("[data-src-tag]")]
    .map((e) => e.getAttribute("data-src-tag")));
  ok("section heads carry ARCHIVE / OPERATIONAL / DERIVED tags",
    ["ARCHIVE", "OPERATIONAL", "DERIVED"].every((t) => tags.includes(t)), tags.join(","));

  /* THE ENVIRONMENT SPLIT. */
  ok("the genesis environment keeps its archive heading",
    /ENVIRONMENT AT GENESIS/i.test(i.text), "");
  ok("and the operational environment is a SEPARATE block", i.envBlock);
  ok("which says it is the latest, not the genesis, environment",
    /LATEST OPERATIONAL ENVIRONMENT/i.test(i.text), "");
  ok("and carries the operational-vs-developmental SHIPS warning",
    /OPERATIONAL SHIPS\s*—\s*NOT THE DEVELOPMENTAL ARCHIVE/i.test(i.text)
      && /never pool|not pool|does not pool/i.test(i.text), "");

  /* THE COHORT'S SOURCE, SAID OUT LOUD. */
  ok("the bridge states that the cohort comes from the archive, not the operational track",
    /BUILT FROM THE HISTORICAL ARCHIVE/i.test(i.archiveScope || ""), String(i.archiveScope));
  ok("and the control names it as a historical cohort",
    /BUILD HISTORICAL COHORT AROUND GENESIS/i.test(i.text), "");

  /* NO BLENDING ON THE PLATE: exactly one track layer holds this storm. */
  const drawn = await page.evaluate(() => {
    const c = [...document.querySelectorAll("canvas")];
    return c.length;
  });
  ok("the plate still holds its canvas layers", drawn > 0, String(drawn));

  /* THE TRANSPORT FOLLOWS THE RECORD THAT IS DRAWN. */
  const transport = await page.evaluate(() =>
    (document.querySelector(".at-transport") || {}).innerText || "");
  ok(`the transport scrubs the operational record (FIX n / ${EXPECT.fixes})`,
    new RegExp(`FIX\\s+\\d+\\s*/\\s*${EXPECT.fixes}`).test(transport.replace(/\s+/g, " ")),
    transport.replace(/\s+/g, " ").slice(0, 160));
  ok("and reports the fix quality as operational rather than borrowing `observed`",
    /OPERATIONAL/.test(transport), transport.replace(/\s+/g, " ").slice(0, 160));

  const e = takeErrors();
  ok("the operational pass raised no page errors", e.length === 0, e.slice(0, 4).join("\n        "));
}

/* ---- [2] fail closed ------------------------------------------------------------------- */
console.log("\n[2] the live layer fails, and the panel says so rather than falling back");
liveMode = "missing";
{
  await open();
  const i = await inspector();
  ok("the inspector declares the unavailable state", i && i.state === "unavailable",
    i ? i.state : "no inspector");
  ok("the badge reads LIVE CONTINUATION UNAVAILABLE",
    /LIVE CONTINUATION UNAVAILABLE/i.test(i.badge || ""), String(i.badge));
  ok("and it is on screen without scrolling", i.badgeOnScreen);
  ok("the refusal names the instant the archive representation ends",
    /ARCHIVE REPRESENTATION ENDS\s+\d{4}-\d{2}-\d{2}/i.test(i.text),
    i.text.slice(0, 300));
  ok("the panel does NOT claim a whole life", !/whole life/i.test(i.text));
  ok("and it does not present an operational figure it does not have",
    !/OPERATIONAL TO DATE/i.test(i.figure || ""), String(i.figure));
  ok("the archive's own peak is what is shown, since it is all there is",
    new RegExp(`\\b${meta.archivePeak}\\b`).test(i.figure || ""),
    `${i.figure} vs archive ${meta.archivePeak} kt`);

  /* THE REFUSED FETCH IS ITSELF THE EVIDENCE. Exactly one console error, and it is the 404 this
     pass served on purpose -- proving the page really did try to load the artifact and really
     did fail, rather than the state having been reached some other way. */
  const e = takeErrors();
  ok("the only error is the 404 this pass served on purpose",
    e.length === 1 && /404/.test(e[0]), e.join("\n        ") || "no error at all — did the page fetch it?");
}

/* ---- [3] nothing expected --------------------------------------------------------------- */
console.log("\n[3] a provisional storm nobody is tracking — provisional, but not incomplete");
liveMode = "empty";
{
  await open();
  const i = await inspector();
  ok("the inspector declares the `none` state", i && i.state === "none", i ? i.state : "none");
  ok("the badge is the archive's own provisional wording",
    /HAS NOT BEEN POST-ANALYSED/i.test(i.badge || ""), String(i.badge));
  ok("it does NOT claim a live continuation is missing",
    !/LIVE CONTINUATION UNAVAILABLE/i.test(i.text), "");
  ok("and it does NOT claim a whole life either", !/whole life/i.test(i.text));

  const e = takeErrors();
  ok("the empty-artifact pass raised no page errors", e.length === 0,
    e.slice(0, 4).join("\n        "));
}

/* ---- housekeeping ----------------------------------------------------------------------- */
console.log("\n[4] the page itself");
{
  const escape = await serviceWorkerEscape(page);
  ok("no service worker escaped the harness", escape === null, String(escape));
  /* The intercepted live route is answered by the server, so it is never a file on disk and
     never lands in MISSING. Anything that does is a genuinely absent asset. */
  ok("no same-origin asset was missing", MISSING.length === 0, MISSING.join(", "));
  ok("nothing was left unaccounted for after the last pass", errors.length === 0,
    errors.slice(0, 5).join("\n        "));
}

await browser.close();
server.close();

console.log(failures
  ? `\n${failures} operational-panel check(s) failed — the screen and the record disagree\n`
  : "\nthe operational record reaches the screen, and so does its absence\n");
process.exit(failures ? 1 : 0);
