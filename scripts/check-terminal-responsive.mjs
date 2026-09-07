#!/usr/bin/env node
/* THE TERMINAL AT EVERY WIDTH, WITH THE GUIDANCE ENVELOPE ON SCREEN.
 *
 * What this asserts is a property of the RENDERED page, not of a function:
 *
 *   MAP FLOOR         the map keeps its height (≥480px on a desktop, ≥300px on a phone) and
 *                     its share of the width at every band — apparatus moves before the map
 *                     shrinks, and nothing ever scrolls the page sideways
 *   SEMANTICS         the model-guidance panel says on screen that its lines are raw guidance and
 *                     not a probability, and that its envelope is not the cone
 *   FRESHNESS         the feed-health pills carry a status word and an age, and the string "NaN"
 *                     appears nowhere on the page — the regression that put "ADV NaNm" in the
 *                     header
 *   VALID TIME        the lead table shows a valid-time column and the health row a VALID TIME cell
 *   NO FUTURE LEAK    rewound to a frame that recorded an older cycle, the panel says so and shows
 *                     that cycle's scalars rather than the latest deck's
 *   NULL ≠ 0          a storm with no deck renders the no-guidance claim, never a zero spread
 *   BRIDGE            the OPEN HISTORICAL CONTEXT link carries the GENESIS fix, not the current
 *                     position, and names the storm by ATCF id
 *   A11Y              the layer toggles are buttons with aria-pressed, the tabs are tabs, the fan
 *                     is an image with a name, the health table has column headers
 *   PERFORMANCE       first render of the guidance panel inside a stated budget; the envelope
 *                     adds less than 100 KB to the snapshot
 *
 * THE DATA IS A FIXTURE, DETERMINISTICALLY. docs/data/latest.json is the real committed snapshot
 * (whatever it holds today); this harness attaches the guidance envelope computed from the
 * committed two-cycle a-deck fixtures and the genesis fix from the committed b-deck fixtures, so
 * the same bytes render on every run whether or not the refresh loop has produced guidance yet.
 * Storms without a fixture keep no envelope on purpose: that is the null state under test.
 *
 * Run: node scripts/check-terminal-responsive.mjs [--require-browser] [--shots DIR]
 */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { HERMETIC, serviceWorkerEscape } from "./lib/browser-harness.mjs";
import { parseAdeckCycles, parseBestTrack } from "./lib/atcf.mjs";
import { guidanceFrom, guidanceFrameScalars, genesisFromBestTrack } from "./lib/guidance.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const DOCS = join(ROOT, "docs");
const REQUIRE_BROWSER = process.argv.includes("--require-browser");
const SHOTS = (() => { const i = process.argv.indexOf("--shots"); return i >= 0 ? resolve(process.argv[i + 1] || ".terminal-shots") : null; })();
const CI = process.argv.includes("--ci");
const TIME_SCALE = CI ? 3 : 1;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return true; }
  failures++; console.log("  FAIL  " + label + (detail ? "  — " + detail : "")); return false;
};

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* reported below */ }
if (!chromium) {
  console.log(REQUIRE_BROWSER ? "[terminal] playwright is absent and --require-browser was given" : "[terminal] SKIPPED, not passed: playwright is absent");
  process.exit(REQUIRE_BROWSER ? 2 : 0);
}

/* ---- the fixture snapshot -------------------------------------------------------------------- */
const latest = JSON.parse(await readFile(join(DOCS, "data/latest.json"), "utf8"));
const framesJson = JSON.parse(await readFile(join(DOCS, "data/frames.json"), "utf8"));
const before = JSON.stringify(latest).length;
const withDeck = [];
for (const s of latest.storms || []) {
  const stem = String(s.id).toLowerCase();
  let a = null, b = null;
  try { a = await readFile(join(__dir, "fixtures", `adeck-${stem}-2cycles.dat`), "utf8"); } catch { /* no fixture: null state */ }
  try { b = await readFile(join(__dir, "fixtures", `bdeck-${stem}.dat`), "utf8"); } catch { /* none */ }
  s.guidance = a ? guidanceFrom(parseAdeckCycles(a, { keep: 2 }), { fetchedAt: latest.generatedAt }) : null;
  s.genesis = b ? genesisFromBestTrack(parseBestTrack(b).records) : null;
  if (s.guidance) withDeck.push(s.id);
}
/* ONE STORM IS DELIBERATELY LEFT WITHOUT AN ENVELOPE, whatever the snapshot happens to hold.
   The null path — a storm with no deck renders the claim and never a zero — used to be
   exercised only when the ocean obliged by carrying a storm this repo has no fixture for, and
   the day Karina dissipated it stopped being exercised at all. Withholding the last eligible
   storm's envelope makes the state deterministic, and it is only withheld while at least one
   storm still has one. */
if (withDeck.length > 1) {
  const drop = withDeck.pop();
  (latest.storms || []).find((s) => s.id === drop).guidance = null;
}
const added = JSON.stringify(latest).length - before;
/* Frames: the latest cycle's scalars on the newer half, and a DIFFERENT (older) cycle with
   different numbers on the older half, so the register has a cycle change to report and the
   rewind path has a frame that disagrees with the latest deck. */
/* The loader shows the LAST 24 frames (data-loader.js slices the history), so the older cycle
   goes on the older half of those, not of the whole file. */
const frames = framesJson.frames || [];
const SHOWN = 24;
const firstShown = Math.max(0, frames.length - SHOWN);
const half = Math.floor(Math.min(frames.length, SHOWN) / 2);
frames.forEach((fr, i) => {
  for (const s of latest.storms || []) {
    if (!fr.storms || !fr.storms[s.id]) continue;
    const sc = guidanceFrameScalars(s.guidance);
    if (s.guidance && i - firstShown < half) {
      Object.assign(fr.storms[s.id], sc, { gCycle: s.guidance.previousCycle || "2026090612",
        gTrack72: sc.gTrack72 != null ? sc.gTrack72 + 40 : null, gScen72: sc.gScen72 != null ? sc.gScen72 + 1 : null });
    } else Object.assign(fr.storms[s.id], sc);
  }
});
const FIXTURE = { "/data/latest.json": JSON.stringify(latest), "/data/frames.json": JSON.stringify(framesJson) };
console.log(`[terminal] fixture: ${withDeck.length} storm(s) with an envelope (${withDeck.join(", ") || "none"}), ${(latest.storms || []).length - withDeck.length} without · envelope adds ${added} bytes`);
ok("the envelope adds less than 100 KB to the snapshot", added < 100000, added + " bytes");
ok("at least one storm in the snapshot has a fixture deck (the check needs a rendered envelope)", withDeck.length >= 1);
ok("at least one storm has NO deck (the null state must render too)", (latest.storms || []).length > withDeck.length,
  "every storm in the snapshot carries an envelope and none could be withheld — the null path is unexercised");

/* ---- server ------------------------------------------------------------------------------- */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".jsx": "text/babel", ".json": "application/json",
  ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".gz": "application/octet-stream" };
const MISSING = [];
const server = await new Promise((r) => {
  const s = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    if (FIXTURE[p]) { res.writeHead(200, { "content-type": "application/json" }); res.end(FIXTURE[p]); return; }
    try {
      const b = await readFile(join(DOCS, p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(b);
    } catch {
      if (/^\/favicon\.ico$|^\/\.well-known\//.test(p)) { res.writeHead(204); res.end(); return; }
      MISSING.push(p); res.writeHead(404); res.end("nf");
    }
  });
  s.listen(0, () => r(s));
});
const port = server.address().port;

/* A playwright release launches the chromium it was pinned to; a container that ships one at
   PLAYWRIGHT_BROWSERS_PATH is driven as-is (same approach as check-panel-dom). */
async function findChromium() {
  if (process.env.PANEL_DOM_CHROMIUM) return process.env.PANEL_DOM_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH; if (!base) return null;
  const { readdir, access } = await import("node:fs/promises");
  let dirs = []; try { dirs = (await readdir(base)).filter((d) => d.startsWith("chromium-")).sort(); } catch { return null; }
  for (const d of dirs.reverse()) { const exe = join(base, d, "chrome-linux", "chrome"); try { await access(exe); return exe; } catch { /* next */ } }
  return null;
}
const EXE = await findChromium();
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});
const ctx = await browser.newContext({ ...HERMETIC, deviceScaleFactor: 1 });
await ctx.route("**/*", (route) => {
  const u = route.request().url();
  if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
  return route.abort();          // tiles, fonts, imagery probes: none of it is under test
});
const page = await ctx.newPage();
let errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/net::|ERR_|Failed to load resource/.test(m.text())) errors.push("console: " + m.text().slice(0, 200)); });

if (SHOTS) await mkdir(SHOTS, { recursive: true });

/* ---- the widths: one per band of the terminal's own ladder ---------------------------------- */
const WIDTHS = [
  { name: "wide",     w: 2560, h: 1440, floor: 480, share: 0.5 },   // the analyst wall (zoom 1.4 applies)
  { name: "half",     w: 1280, h: 1440, floor: 480, share: 0.5 },   // half of a 2560 display, side by side with a chart
  { name: "compact",  w: 1024, h: 768,  floor: 480, share: 0.5 },
  { name: "narrow",   w: 900,  h: 700,  floor: 480, share: 0.5 },   // the last width before the rail folds under
  { name: "phone",    w: 390,  h: 844,  floor: 300, share: 0.9 },
];
const STORM = withDeck[0];
const NO_DECK = (latest.storms || []).map((s) => s.id).find((id) => !withDeck.includes(id));
/* The deck's own numbers, for the as-of steps: what LIVE must show, what a historical frame
   must NOT show, and the +40 km the fixture wrote onto the older half. */
const STORM_G = (latest.storms || []).find((s) => s.id === STORM).guidance;
const liveTrack72 = STORM_G ? STORM_G.summary.trackSpread72Km : null;
const liveCycleIso = STORM_G ? STORM_G.cycleIso : null;
const liveInSpread = STORM_G ? STORM_G.roster.inSpread.length : null;

const AUDIT = ({ floor, share, stormId }) => {
  const bad = [], note = [];
  const rect = (el) => el.getBoundingClientRect();
  const vw = innerWidth;
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) bad.push(`page scrolls sideways: ${de.scrollWidth} vs ${vw}`);
  const map = document.querySelector(".leaflet-container");
  if (!map) bad.push("no map container"); else {
    const r = rect(map);
    /* The shell may be CSS-zoomed on wide viewports; getBoundingClientRect reports in layout
       pixels that already include the zoom, so a comparison against innerWidth is honest. */
    if (r.height < floor) bad.push(`map height ${Math.round(r.height)} below the ${floor}px floor`);
    if (r.width < vw * share) bad.push(`map width ${Math.round(r.width)} is under ${Math.round(share * 100)}% of ${vw}`);
    if (r.left < -1 || r.right > vw + 1) bad.push("map runs off the side of the viewport");
    note.push(`map ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const text = document.body.innerText || "";
  if (/\bNaN\b/.test(text)) bad.push("the string NaN is on the page");
  const pills = [...document.querySelectorAll("[data-feed-pill]")];
  if (pills.length < 6) bad.push(`feed-health pills: ${pills.length}`);
  for (const p of pills) {
    if (!p.getAttribute("data-feed-status")) bad.push("a feed pill has no status");
    if (p.tagName !== "BUTTON") bad.push("a feed pill is not a button");
  }
  const adv = document.querySelector('[data-feed-pill="ADV"]');
  if (adv && !/\d/.test(adv.textContent) && !/NO FEED/.test(adv.getAttribute("data-feed-status") || "")) bad.push("ADV pill shows no age: " + adv.textContent);
  /* APPARATUS MUST NOT EAT THE MAP. Whatever the width, the layer controls resting on the map
     may cover at most a quarter of its height — on a phone that means they have folded. */
  const tg = document.querySelector("[data-layer-toggles]");
  if (tg && map) {
    const tr = rect(tg), mr = rect(map);
    if (tr.height > mr.height * 0.25) bad.push(`layer controls cover ${Math.round((tr.height / mr.height) * 100)}% of the map height`);
  }
  if (tg && vw < 640 && !tg.querySelector("[data-layer-menu]")) bad.push("on a phone the layer chips have not folded into a menu");
  if (tg && vw < 640) {
    const menu = tg.querySelector("[data-layer-menu]");
    if (menu && menu.tagName !== "BUTTON") bad.push("the layer menu is not a button");
    if (menu && !menu.hasAttribute("aria-expanded")) bad.push("the layer menu lacks aria-expanded");
  }
  const toggles = [...document.querySelectorAll("[data-layer-toggle]")];
  if (!toggles.length && !(vw < 640 && tg && tg.querySelector("[data-layer-menu]"))) bad.push("no layer toggles");
  for (const t of toggles) {
    if (t.tagName !== "BUTTON") bad.push("a layer toggle is not a button");
    if (t.getAttribute("data-layer-toggle") !== "unavailable" && !t.hasAttribute("aria-pressed")) bad.push("a layer toggle lacks aria-pressed");
  }
  const guidToggle = document.querySelector('[data-layer-toggle="guidance"]');
  if (stormId && !guidToggle && !(vw < 640)) bad.push("the Model Guidance layer toggle is not offered for a storm with a deck");
  if (!document.querySelector('[role="tablist"]') || document.querySelectorAll('[role="tab"]').length < 3) bad.push("the tab bar is not a tablist");
  const strip = document.querySelector("[data-guidance-strip]");
  if (stormId) {
    if (!strip) bad.push("no guidance strip on the rail");
    else {
      const sr = rect(strip);
      if (sr.width > 0.5 && sr.right > vw + 1) bad.push("the guidance strip runs off the viewport");
      if (strip.querySelectorAll("[data-guidance-tile]").length !== 5) bad.push("the strip does not carry five metrics");
      const link = strip.querySelector("[data-atlas-bridge-link]");
      if (!link) bad.push("no Atlas bridge link on the strip");
    }
  }
  return { bad, note };
};

const PANEL_AUDIT = ({ stormId, center, genesis, noDeck }) => {
  const bad = [], note = [];
  const rect = (el) => el.getBoundingClientRect();
  const panel = document.querySelector("[data-guidance-panel]");
  if (!panel) { bad.push("no guidance panel under Models"); return { bad, note }; }
  const st = panel.querySelector(`[data-guidance-storm="${stormId}"]`);
  if (!st) { bad.push("the selected storm's guidance block did not render"); return { bad, note }; }
  const sem = st.querySelector("[data-guidance-semantics]");
  if (!sem) bad.push("no semantics footer");
  else {
    const t = sem.textContent;
    if (!/not a probability/i.test(t)) bad.push("semantics footer does not say 'not a probability'");
    if (!/not the NHC cone/i.test(t)) bad.push("semantics footer does not distinguish the envelope from the cone");
    if (!/enters no price/i.test(t)) bad.push("semantics footer does not say it enters no price");
  }
  const leads = st.querySelector("[data-guidance-leads]");
  if (!leads) bad.push("no lead table");
  else {
    const heads = [...leads.querySelectorAll("th")].map((h) => h.textContent.trim());
    if (!heads.includes("VALID")) bad.push("lead table has no VALID column");
    if (!heads.some((h) => /SCENARIOS/.test(h))) bad.push("lead table has no SCENARIOS column");
    if (leads.querySelectorAll("tbody tr").length !== 5) bad.push("lead table does not have five leads");
    const wrap = leads.parentElement;
    if (wrap.scrollWidth > wrap.clientWidth + 1 && getComputedStyle(wrap).overflowX !== "auto") bad.push("lead table overflows without a scroll container");
    if (rect(leads).right > innerWidth + 1 && getComputedStyle(wrap).overflowX !== "auto") bad.push("lead table runs off the page");
    for (const th of leads.querySelectorAll("th")) if (th.getAttribute("scope") !== "col") { bad.push("a lead-table header lacks scope=col"); break; }
  }
  const fan = st.querySelector("[data-guidance-fan]");
  if (!fan) bad.push("no intensity fan");
  else {
    if (fan.getAttribute("role") !== "img" || !fan.getAttribute("aria-label")) bad.push("the fan is not an accessible image");
    const fr = rect(fan);
    if (fr.right > innerWidth + 1) bad.push("the fan overflows the viewport");
    if (fr.width < 200) bad.push("the fan is narrower than 200px");
  }
  const health = st.querySelector("[data-guidance-health]");
  if (!health) bad.push("no feed-health row on the panel");
  else {
    const t = health.textContent;
    for (const k of ["VALID TIME", "FETCHED", "AGE", "EXPECTED CADENCE", "STATUS"]) if (!t.includes(k)) bad.push("health row lacks " + k);
    if (!/LIVE|DELAYED|STALE|NO FEED|FUTURE|EVENT/.test(health.getAttribute("data-feed-status") || "")) bad.push("health row has no status word");
  }
  const bridge = st.querySelector("[data-atlas-bridge-link]");
  if (!bridge) bad.push("no Atlas bridge link on the panel");
  else {
    const href = bridge.getAttribute("href") || "";
    const q = new URLSearchParams(href.split("?")[1] || "");
    if (q.get("atcf") !== stormId) bad.push("bridge does not name the storm by ATCF id: " + href);
    const w = (q.get("w") || "").split(",").map(Number);
    if (w.length !== 3) bad.push("bridge has no w=lat,lon,radius: " + href);
    else {
      if (genesis && (Math.abs(w[0] - genesis.lat) > 0.01 || Math.abs(w[1] - genesis.lon) > 0.01)) bad.push("bridge does not carry the genesis fix: " + href);
      if (center && Math.abs(w[0] - center[0]) < 0.01 && Math.abs(w[1] - center[1]) < 0.01) bad.push("bridge carries the CURRENT position, not genesis: " + href);
      if (w[2] !== 500) bad.push("bridge radius is not 500 km");
    }
    if (!q.get("mo")) bad.push("bridge carries no genesis month");
    const st2 = st.querySelector("[data-atlas-bridge]");
    if (st2 && !/genesis fix/i.test(st2.textContent)) bad.push("the bridge does not say it uses the genesis fix");
  }
  if (noDeck) {
    const nb = panel.querySelector(`[data-guidance-storm="${noDeck}"]`);
    if (!nb) note.push("no-deck storm not in this view (single-storm panel)");
    else {
      if (nb.querySelector("[data-guidance-tiles]")) bad.push("a storm with no deck rendered metric tiles");
      if (/\b0 km\b/.test(nb.textContent)) bad.push("a storm with no deck shows a zero spread");
    }
  }
  const tiles = [...st.querySelectorAll("[data-guidance-tile]")];
  if (tiles.length !== 5) bad.push(`panel tiles: ${tiles.length}`);
  const trackTile = st.querySelector('[data-guidance-tile="track"]');
  if (trackTile && !/\d+\s*km/.test(trackTile.textContent)) bad.push("track-spread tile shows no km value");
  note.push("track tile: " + (trackTile ? trackTile.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "—"));
  return { bad, note };
};

async function boot(w, h) {
  errors = [];
  await page.setViewportSize({ width: w, height: h });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__MT_MAP && document.querySelector("[data-feed-health]"), { timeout: 90000 });
  return Date.now() - t0;
}
async function selectStorm(id) {
  const name = (latest.storms.find((s) => s.id === id) || {}).name;
  await page.evaluate((n) => {
    const els = [...document.querySelectorAll("header *")].filter((e) => e.childElementCount <= 2 && e.textContent.trim().startsWith(n));
    const el = els[els.length - 1]; if (el) el.click();
  }, name);
  await page.waitForFunction(() => document.querySelector("[data-guidance-strip]"), { timeout: 20000 });
  await page.waitForTimeout(400);
}
async function openTab(name) {
  await page.evaluate((n) => { const t = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent.trim() === n); if (t) t.click(); }, name);
  await page.waitForTimeout(400);
}

const stormRec = latest.storms.find((s) => s.id === STORM);
for (const W of WIDTHS) {
  console.log(`\n[${W.name}] ${W.w}x${W.h}`);
  const bootMs = await boot(W.w, W.h);
  ok(`booted in ${bootMs} ms (budget ${6000 * TIME_SCALE})`, bootMs < 6000 * TIME_SCALE);
  const overview = await page.evaluate(AUDIT, { floor: W.floor, share: W.share, stormId: null });
  ok("overview: " + (overview.note.join(" · ") || "audited"), overview.bad.length === 0, overview.bad.join("; "));
  await selectStorm(STORM);
  const withStorm = await page.evaluate(AUDIT, { floor: W.floor, share: W.share, stormId: STORM });
  ok("storm selected: " + (withStorm.note.join(" · ") || "audited"), withStorm.bad.length === 0, withStorm.bad.join("; "));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `terminal-${W.name}-${W.w}-situation.png`), fullPage: false });
  /* The feed-health table, opened from a pill: STALE / NO FEED / EVENT / LIVE side by side, at
     the frame's clock. Captured on the widest band only — the table is the same at every width. */
  if (SHOTS && W.name === "wide") {
    await page.evaluate(() => { const p = document.querySelector('[data-feed-pill="SNAP"]'); if (p) p.click(); });
    await page.waitForTimeout(300);
    const hasTable = await page.evaluate(() => !!document.querySelector("[data-feed-health-table]"));
    ok("the feed-health table opens from a pill", hasTable);
    /* And it is on TOP: the point at the table's centre resolves to the table, not to the map
       section beneath it (which is exactly where it painted with the header at z-index 30). */
    const onTop = await page.evaluate(() => {
      const t = document.querySelector("[data-feed-health-table]"); if (!t) return "no table";
      const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && t.contains(el) ? null : "the table is occluded by " + (el ? el.tagName + "." + String(el.className).slice(0, 30) : "nothing");
    });
    ok("the feed-health table is not occluded by the map", onTop === null, onTop || "");
    await page.screenshot({ path: join(SHOTS, `terminal-${W.name}-${W.w}-feed-health.png`), fullPage: false, clip: { x: W.w - 1000, y: 0, width: 1000, height: 520 } });
    await page.evaluate(() => { const t = document.querySelector("[data-feed-health-table]"); if (t) t.click(); });
  }
  const t1 = Date.now();
  await openTab("Models");
  await page.waitForFunction(() => document.querySelector("[data-guidance-panel] [data-guidance-fan]"), { timeout: 20000 });
  const panelMs = Date.now() - t1;
  ok(`guidance panel rendered in ${panelMs} ms (budget ${2500 * TIME_SCALE})`, panelMs < 2500 * TIME_SCALE);
  const pa = await page.evaluate(PANEL_AUDIT, { stormId: STORM, center: stormRec.center, genesis: stormRec.genesis, noDeck: NO_DECK });
  ok("guidance panel: " + pa.note.join(" · "), pa.bad.length === 0, pa.bad.join("; "));
  const again = await page.evaluate(AUDIT, { floor: W.floor, share: W.share, stormId: STORM });
  ok("with the panel open the map floor and the page width still hold", again.bad.length === 0, again.bad.join("; "));
  if (SHOTS) {
    await page.evaluate(() => { const p = document.querySelector("[data-guidance-panel]"); if (p) p.scrollIntoView({ block: "start" }); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `terminal-${W.name}-${W.w}-guidance.png`), fullPage: false });
  }
  /* The null state: the storm without a deck, on the all-systems panel. */
  if (NO_DECK) {
    await page.evaluate(() => { const b = [...document.querySelectorAll("span")].find((e) => e.textContent.trim() === "All"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const nul = await page.evaluate((id) => {
      const nb = document.querySelector(`[data-guidance-storm="${id}"]`);
      if (!nb) return "the no-deck storm did not render on the all-systems panel";
      if (nb.querySelector("[data-guidance-tiles]")) return "a storm with no deck rendered metric tiles";
      if (!/unavailable|no roster aid|did not answer|no deck/i.test(nb.textContent)) return "the no-deck storm does not say why: " + nb.textContent.slice(0, 120);
      if (/\b0 km\b|\b0 kt\b/.test(nb.textContent)) return "the no-deck storm shows a zero";
      return null;
    }, NO_DECK);
    ok("a storm with no deck renders the claim, not zeros", nul === null, nul || "");
  }
  /* ---- THE AS-OF RULE, IN FOUR STEPS -------------------------------------------------------
   *
   * The frame stores the envelope's SCALARS and no geometry. So the one thing a replay surface
   * must never do here is draw the deck in hand — tracks, lead table, fan — under a timestamp
   * that says the reader is standing somewhere earlier. These four steps are that property:
   *
   *   1 LIVE      geometry, lead table and fan are all present
   *   2 REWOUND   the recorded scalars are shown, and they are the FRAME's numbers
   *   3 REWOUND   no latest geometry survives anywhere: no map lines, no lead table, no fan,
   *               no members, no deck health row — and the explicit state is on screen instead
   *   4 LIVE      returning restores all of it
   *
   * The fixture makes step 2 checkable rather than merely plausible: the older half of the
   * replay window records a DIFFERENT cycle with a 72h spread 40 km wider than the deck's, so
   * "the frame's number" and "the deck's number" cannot be confused for one another.
   */
  const liveKm = liveTrack72;
  const frameKm = liveTrack72 == null ? null : liveTrack72 + 40;
  const readGuidance = () => page.evaluate((id) => {
    const st = document.querySelector(`[data-guidance-storm="${id}"]`);
    const tile = (k) => { const t = st && st.querySelector(`[data-guidance-tile="${k}"]`); return t ? t.textContent.replace(/\s+/g, " ").trim() : null; };
    return {
      block: !!st,
      leads: !!(st && st.querySelector("[data-guidance-leads]")),
      fan: !!(st && st.querySelector("[data-guidance-fan]")),
      members: !!(st && st.querySelector("[data-guidance-members]")),
      health: !!(st && st.querySelector("[data-guidance-health]")),
      absent: !!(st && st.querySelector("[data-guidance-geometry-absent]")),
      rewound: !!(st && st.querySelector("[data-guidance-rewound]")),
      absentText: (() => { const a = st && st.querySelector("[data-guidance-geometry-absent]"); return a ? a.textContent.replace(/\s+/g, " ").trim() : ""; })(),
      track: tile("track"),
      /* The VALUE node, not the whole tile: the tile's text runs the label into the number
         ("Track spread · 72h" + "100" + "km"), so a word-boundary match on the number never
         fires and a bare substring match would find 100 inside 1100. */
      trackValue: (() => { const t = st && st.querySelector('[data-guidance-tile="track"]'); return t && t.children[1] ? t.children[1].textContent.replace(/\s+/g, "") : null; })(),
      drawn: window.__MT_GUIDANCE_DRAWN,
      stripAsOf: !!document.querySelector("[data-guidance-strip-asof]"),
      stripAbsent: !!document.querySelector("[data-guidance-strip] [data-guidance-geometry-absent]"),
      guidChip: (() => { const c = document.querySelector('[data-layer-toggle="guidance"]'); return c ? "offered" : "withheld"; })(),
      text: st ? st.textContent.replace(/\s+/g, " ") : "",
    };
  }, STORM);
  const toLive = async () => {
    await page.evaluate(() => { const b = document.querySelector('[title="Jump to live"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
  };
  const stepBack = async (n) => { for (let i = 0; i < n; i++) { await page.keyboard.press("ArrowLeft"); } await page.waitForTimeout(450); };

  await selectStorm(STORM);
  await openTab("Models");
  await toLive();

  /* 1 · LIVE */
  const live = await readGuidance();
  ok("AS-OF 1 · LIVE renders the lead table, the intensity fan and the members", live.leads && live.fan && live.members, JSON.stringify({ leads: live.leads, fan: live.fan, members: live.members }));
  ok("AS-OF 1 · LIVE draws guidance geometry on the map (" + live.drawn + " layers)", typeof live.drawn === "number" && live.drawn > 0, String(live.drawn));
  ok("AS-OF 1 · LIVE shows no as-of state and no geometry-absent state", !live.absent && !live.rewound && !live.stripAsOf);
  ok("AS-OF 1 · LIVE shows the deck's own 72h spread" + (liveKm != null ? " (" + liveKm + " km)" : ""),
    liveKm == null || live.trackValue === liveKm + "km", live.trackValue || "");
  /* Below 640 the chips fold into one LAYERS control, so the per-layer chip is not in the DOM
     until it is opened; the withheld/offered distinction is asserted at the wider bands. */
  if (W.w >= 640) ok("AS-OF 1 · LIVE offers the Model Guidance layer chip", live.guidChip === "offered");

  /* 2 · REWOUND onto a frame whose recorded deck is not the deck in hand */
  await stepBack(half + 1);
  const rew = await readGuidance();
  ok("AS-OF 2 · REWOUND still shows the metrics the frame recorded", /\d+\s*km/.test(rew.track || ""), rew.track || "");
  ok("AS-OF 2 · REWOUND shows the FRAME's 72h spread" + (frameKm != null ? " (" + frameKm + " km)" : "") + ", not the deck's",
    frameKm == null || (rew.trackValue === frameKm + "km" && rew.trackValue !== liveKm + "km"), rew.trackValue || "");
  ok("AS-OF 2 · REWOUND says AS OF", rew.rewound && /AS OF/.test(rew.text), rew.text.slice(0, 90));

  if (SHOTS && W.name === "wide") {
    await page.evaluate(() => { const p = document.querySelector("[data-guidance-panel]"); if (p) p.scrollIntoView({ block: "start" }); });
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `terminal-${W.name}-${W.w}-guidance-asof.png`), fullPage: false });
  }

  /* 3 · REWOUND cannot render the latest geometry, anywhere */
  ok("AS-OF 3 · REWOUND renders no lead table", !rew.leads);
  ok("AS-OF 3 · REWOUND renders no intensity fan", !rew.fan);
  ok("AS-OF 3 · REWOUND renders no member roster", !rew.members);
  ok("AS-OF 3 · REWOUND renders no deck health row (it would publish the current cycle's valid time)", !rew.health);
  ok("AS-OF 3 · REWOUND draws no guidance geometry on the map (" + rew.drawn + " layers)", rew.drawn === 0, String(rew.drawn));
  if (W.w >= 640) ok("AS-OF 3 · REWOUND withholds the Model Guidance layer chip rather than offering lines that will not appear", rew.guidChip === "withheld");
  ok("AS-OF 3 · REWOUND states the absence in as many words", rew.absent
    && /HISTORICAL GUIDANCE GEOMETRY NOT STORED FOR THIS FRAME/.test(rew.absentText)
    && /Recorded cycle metrics below remain valid as-of this cursor\./.test(rew.absentText), rew.absentText.slice(0, 140));
  ok("AS-OF 3 · the rail strip carries the same state", rew.stripAsOf && rew.stripAbsent);
  /* The deck's distinctive numbers must not survive anywhere in the block. */
  const leak = await page.evaluate(({ id, cyc, n }) => {
    const st = document.querySelector(`[data-guidance-storm="${id}"]`); if (!st) return "no block";
    const t = st.textContent.replace(/\s+/g, " ");
    if (cyc && t.includes(cyc)) return "the deck's cycle id " + cyc + " is on screen under a historical as-of";
    if (n && new RegExp("\\b" + n + " track runs").test(t)) return "the deck's roster count is on screen";
    if (/VALID TIME/.test(t)) return "a deck valid-time row is on screen";
    return null;
  }, { id: STORM, cyc: liveCycleIso ? liveCycleIso.slice(0, 16).replace("T", " ") : null, n: liveInSpread });
  ok("AS-OF 3 · no latest-deck identity leaks into the historical block", leak === null, leak || "");

  /* 4 · back to LIVE */
  await toLive();
  const back = await readGuidance();
  ok("AS-OF 4 · returning to LIVE restores the lead table, the fan and the members", back.leads && back.fan && back.members);
  ok("AS-OF 4 · returning to LIVE restores the map geometry (" + back.drawn + " layers)", back.drawn > 0, String(back.drawn));
  ok("AS-OF 4 · returning to LIVE clears the as-of state", !back.absent && !back.rewound && !back.stripAsOf);
  ok("AS-OF 4 · returning to LIVE shows the deck's spread again",
    liveKm == null || back.trackValue === liveKm + "km", back.trackValue || "");

  /* The rule is a FINGERPRINT, not "any rewind hides": a frame that recorded this very deck
     keeps its geometry, because that geometry is what the board held at that moment. */
  await stepBack(1);
  const near = await readGuidance();
  ok("AS-OF · a rewound frame that recorded THIS deck keeps its geometry", near.leads && near.fan && near.drawn > 0 && !near.absent,
    JSON.stringify({ leads: near.leads, fan: near.fan, drawn: near.drawn, absent: near.absent }));
  await toLive();

  const sw = await serviceWorkerEscape(page);
  ok("no service worker controls the page", sw === null, sw || "");
  ok("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  ok("no missing same-origin assets", MISSING.length === 0, MISSING.slice(0, 5).join(", "));
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} terminal check(s) FAILED` : "\nall terminal responsive checks passed");
process.exit(failures ? 1 : 0);
