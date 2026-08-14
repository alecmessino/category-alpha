#!/usr/bin/env node
/* End-to-end verification of the DEPLOYED site, in a real browser.
 *
 * Everything else in CI checks the code and the committed files. This checks the
 * thing none of that can: that GitHub Pages is actually serving this commit, over
 * the public internet, and that the page renders correctly when it does.
 *
 * It runs in GitHub Actions because the authoring sandbox cannot reach *.github.io
 * (egress allowlist). It is not a manual step and must never become one.
 *
 * Verifies:
 *   1. Pages is serving THIS commit — served assets byte-match the checkout (sha256),
 *      polling while a deploy propagates rather than failing on a race.
 *   2. The app boots, with cache disabled at the protocol level.
 *   3. Every storm-independent panel renders. With no active cyclone the
 *      awaiting-telemetry notice replaces the map — and ONLY the map.
 *   4. Full market coverage, nothing silently trimmed, board grouped by series.
 *   5. The fillable cap is priced at the ask, not the mid.
 *   6. No console errors, no page errors, no failed same-origin requests.
 *
 * Usage: node scripts/verify-live.mjs [--url https://...] [--wait-min 12]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = (arg("url", process.env.MT_LIVE_URL || "https://alecmessino.github.io/category-alpha/")).replace(/\/?$/, "/");
const WAIT_MIN = Number(arg("wait-min", process.env.MT_WAIT_MIN || 12));

const results = [];
const add = (check, pass, detail = "") => results.push({ check, pass, detail: String(detail) });
const sha = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- 1. is Pages serving THIS commit? ------------------------------------
   Compare served bytes against the checkout. A push takes a minute or two to
   propagate, so poll rather than failing on the race — but fail loudly if it
   never lands, because that is exactly the "deployed but not really" case this
   whole script exists to catch. */
const ASSETS = ["index.html", "app/main.jsx", "app/claims.js", "app/compute.js", "app/panels.jsx", "vendor/leaflet.css"];

async function servedSha(path) {
  const url = BASE + path + "?cb=" + Date.now();          // busts the CDN edge
  const r = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache", "Pragma": "no-cache" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
  return sha(Buffer.from(await r.arrayBuffer()));
}

async function waitForDeploy() {
  const want = {};
  for (const a of ASSETS) want[a] = sha(await readFile(resolve(ROOT, "docs", a)));
  const deadline = Date.now() + WAIT_MIN * 60000;
  let mismatch = null, attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    mismatch = null;
    for (const a of ASSETS) {
      let got;
      try { got = await servedSha(a); } catch (e) { mismatch = `${a}: ${e.message}`; break; }
      if (got !== want[a]) { mismatch = `${a}: served ${got} != commit ${want[a]}`; break; }
    }
    if (!mismatch) {
      add("Pages is serving this commit", true, `${ASSETS.length} assets byte-match the checkout (attempt ${attempt})`);
      return true;
    }
    await sleep(20000);
  }
  add("Pages is serving this commit", false, `still mismatched after ${WAIT_MIN}m — ${mismatch}`);
  return false;
}

const deployed = await waitForDeploy();

/* ---- 2-6. render the live page ------------------------------------------
   Everything below runs inside a try/finally. A crash here previously produced NO
   report at all, and the workflow's commit step then found no file and exited 0 —
   so a hard failure looked exactly like a quiet success. Silence must never be
   mistaken for a pass. */
let browser = null;
const origin = new URL(BASE).origin;
let ours = [], third = [], thirdConsole = [];      // read by the report, so hoisted
try {
browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 2560, height: 1400 } });
const page = await ctx.newPage();

const consoleErrors = [], pageErrors = [], netFailures = [];
page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 200)));
/* Classify by the URL the error came FROM. A failed CARTO/GIBS tile surfaces as a
   generic "Failed to load resource" with no stack, and must not fail the build; a
   genuine JS error in our own code must. m.location().url carries the origin. */
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const at = (m.location() || {}).url || "";
  consoleErrors.push({ text: m.text().slice(0, 200), at });
});
page.on("requestfailed", (r) => netFailures.push({ url: r.url(), why: (r.failure() || {}).errorText || "failed" }));
page.on("response", (r) => { if (r.status() >= 400) netFailures.push({ url: r.url(), why: "HTTP " + r.status() }); });

// Hard-refresh semantics: no cache at the protocol level.
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

let nav = null;
try {
  nav = await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
} catch (e) {
  add("live URL responds", false, e.message.split("\n")[0]);
}
if (nav) add("live URL responds", nav.status() === 200, `HTTP ${nav.status()} at ${BASE}`);

await page.waitForTimeout(4000);

// Open the sections that are collapsed by default. Fair value and Spatial context
// are open already — clicking them would CLOSE them and fake a failure.
for (const label of ["Verify", "Raw data"]) {
  await page.evaluate((l) => {
    const s = [...document.querySelectorAll("span")].find((x) => x.textContent.trim() === l);
    if (s) s.parentElement.click();
  }, label);
  await page.waitForTimeout(600);
}

const probe = await page.evaluate(() => {
  const T = document.body.innerText;
  const MT = window.MT, C = (MT && MT.contracts) || [];
  const series = new Set(C.map((c) => String(c.id).replace(/-[^-]*$/, "")));
  const withDepth = C.filter((c) => c.depth && c.depth.askSize > 0 && c.liquidity > 0);
  const biggest = withDepth.filter((c) => c.liquidity >= 10)
    .sort((a, b) => b.depth.askSize - a.depth.askSize)[0] || null;
  return {
    booted: !!MT && !/booting ingestion/.test(T),
    globals: { MT: !!window.MT, MTX: !!window.MTX, MTC: !!window.MTC },
    storms: MT ? Object.keys(MT.storms).length : -1,
    generatedAt: MT ? MT._generatedAt : null,
    sections: {
      Situation: /SITUATION/.test(T), Attention: /ATTENTION/.test(T),
      "Board Impact": /BOARD IMPACT/.test(T), "Term structure": /TERM STRUCTURE/.test(T),
      "Posterior stack": /POSTERIOR STACK/.test(T), "Evidence Matrix": /EVIDENCE MATRIX/.test(T),
      "Signal Register": /SIGNAL REGISTER/i.test(T), "Market board": /PREDICTION MARKETS/.test(T),
      Observability: /OBSERVABILITY/.test(T),
    },
    awaitingNotice: /SYSTEM AWAITING TELEMETRY/.test(T),
    commandCentre: /STORM COMMAND CENTER/.test(T),
    contracts: C.length,
    seriesCount: series.size,
    groupHeaders: document.querySelectorAll('td[colspan="7"]').length,
    droppedForCap: (MT && MT._feeds && MT._feeds.markets && MT._feeds.markets.droppedForCap) || 0,
    depthCount: C.filter((c) => c.depth).length,
    // Ask-priced cap: the dollars resting must be >= size x the displayed (mid) price.
    capPricedAtAsk: withDepth.every((c) => c.liquidity >= Math.floor(c.depth.askSize * c.market * (c.depth.notional || 1)) - 1),
    capExample: biggest ? { id: biggest.id, askSize: Math.round(biggest.depth.askSize),
      implied: +(biggest.liquidity / (biggest.depth.askSize * (biggest.depth.notional || 1))).toFixed(4),
      fillable: biggest.liquidity } : null,
    orderBookLive: /TOP OF BOOK|BID SIZE/i.test(T) && !/KELLY SIZING — UNAVAILABLE/.test(T),
    /* Feed to pixels for the outlook. The board reported a quiet basin for days while
       NHC had three Atlantic areas under watch, one at 80% over seven days, because
       the parser yielded nothing and nothing downstream could tell that apart from a
       genuinely quiet basin. This asserts the published numbers reach the page. */
    genesis: (() => {
      const areas = (MT && MT._outlook) || [];
      return {
        count: areas.length,
        blockShown: /GENESIS WATCH/.test(T),
        missing: areas
          .filter((a) => !(T.includes(a.title) && (a.pct7d == null || T.includes(a.pct7d + "%"))))
          .map((a) => a.id || a.title),
      };
    })(),
    /* The edge book is the surface that tells an operator what to buy. Two things must
       hold on the live page: it renders at all, and nothing it ranks is a bet the model
       does not actually support. Anything ranked without an anchor, or with a negative
       expected value, is a defect that reaches straight through to a position. */
    edgebook: (() => {
      if (!window.MTX || typeof MTX.edgeBook !== "function") return { present: false };
      let b = null;
      try { b = MTX.edgeBook(null, 10000, 0.25, {}); } catch (e) { return { present: true, threw: String(e && e.message || e) }; }
      return {
        present: true, rendered: /EDGE BOOK/i.test(T),
        ranked: b.rows.length, candidates: b.candidates,
        anchored: b.coverage.anchored, total: b.coverage.total,
        unanchoredRanked: b.rows.filter((r) => r.model == null).length,
        negativeEV: b.rows.filter((r) => !(r.ev > 0)).length,
        overStaked: b.rows.filter((r) => r.stake > r.capacityDollars + 1e-6).length,
        duplicateLadders: b.rows.length - new Set(b.rows.map((r) => r.ladder)).size,
        accounted: Object.values(b.skipped).reduce((a, x) => a + x, 0) + b.candidates === b.coverage.total,
      };
    })(),
    /* A ladder spread is reported as risk-free, so a false positive here is worse than
       any mispriced model row: it tells an operator to take a position on arithmetic that
       does not hold. Re-derive every claimed spread from the raw book on the live page. */
    ladder: (() => {
      if (!window.MTX || typeof MTX.ladderArbs !== "function") return { present: false };
      let L = null;
      try { L = MTX.ladderArbs(null); } catch (e) { return { present: true, threw: String(e && e.message || e) }; }
      const bad = L.executable.filter((x) => {
        const buy = MT.contracts.find((c) => c.id === x.buyId);
        const sell = MT.contracts.find((c) => c.id === x.sellId);
        if (!buy || !sell) return true;
        return !(sell.yesBid > buy.yesAsk)                       // the inequality must hold
            || buy.strike >= sell.strike                          // and in the right direction
            || String(buy.id).replace(/-[^-]*$/, "") !== String(sell.id).replace(/-[^-]*$/, "")
            || !(x.net > 0) || !(x.size > 0);
      }).length;
      return { present: true, executable: L.executable.length, displayed: L.displayed.length, bad };
    })(),
    /* Layout regressions do not throw. They push a row off-screen, or make the whole
       rail jitter as digits change width, and nothing fails. These are the two that were
       just fixed, asserted against the rendered page so they cannot come back quietly. */
    layout: (() => {
      const de = document.documentElement;
      const cs = getComputedStyle(document.body);
      const grids = [...document.querySelectorAll(".mt-grid")];
      const overflowing = grids.filter((g) => g.scrollWidth > g.clientWidth + 2).length;
      const map = document.querySelector(".leaflet-container");
      return {
        bodyOverflow: de.scrollWidth - de.clientWidth,
        tabularNums: /tabular-nums/.test(cs.fontVariantNumeric || "") || /tnum/.test(cs.fontFeatureSettings || ""),
        grids: grids.length, overflowingGrids: overflowing,
        mapHeight: map ? Math.round(map.getBoundingClientRect().height) : null,
        /* Position, not just size. The map was made taller and left sixth down the page,
           which is the half-fix this asserts against: how far you must scroll before the
           only panel that shows you WHERE the storm is comes into view. */
        mapTop: map ? Math.round(map.getBoundingClientRect().top + window.scrollY) : null,
        stormConsole: /ACTIVE SYSTEMS/i.test(T),
        hud: /\bADV\b/.test(T) && /\bSNAP\b/.test(T),
      };
    })(),
    unregisteredClaim: /UNREGISTERED CLAIM|CLAIM ERROR/.test(T),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

add("app mounted", probe.booted, JSON.stringify(probe.globals));
const ageMin = probe.generatedAt ? Math.round((Date.now() - Date.parse(probe.generatedAt)) / 60000) : null;
add("served snapshot is fresh", ageMin != null && ageMin <= 45, `${probe.generatedAt} · ${ageMin}m old`);

for (const [name, ok] of Object.entries(probe.sections)) add("renders: " + name, ok);

/* The storm-specific block is the ONLY thing that may disappear, and exactly one of
   the two states must hold. Both true, or both false, is a bug. */
const stormState = probe.storms === 0
  ? (probe.awaitingNotice && !probe.commandCentre)
  : (probe.commandCentre && !probe.awaitingNotice);
add("storm block swaps correctly", stormState,
  `${probe.storms} storm(s) · notice=${probe.awaitingNotice} commandCentre=${probe.commandCentre}`);

/* Both directions. Areas under watch must appear; a genuinely quiet basin must not
   render an empty watch block. */
add("genesis watch matches the outlook feed",
  probe.genesis.count > 0
    ? (probe.genesis.blockShown && probe.genesis.missing.length === 0)
    : !probe.genesis.blockShown,
  `${probe.genesis.count} area(s) · block=${probe.genesis.blockShown}` +
  (probe.genesis.missing.length ? ` · NOT RENDERED: ${probe.genesis.missing.join(", ")}` : ""));

const eb = probe.edgebook || {};
add("edge book renders and ranks nothing it cannot support",
  eb.present && !eb.threw && eb.rendered && eb.unanchoredRanked === 0 && eb.negativeEV === 0
    && eb.overStaked === 0 && eb.duplicateLadders === 0 && eb.accounted === true,
  eb.threw ? "threw: " + eb.threw
    : `${eb.ranked} ranked of ${eb.candidates} candidates · ${eb.anchored}/${eb.total} anchored`
      + ` · unanchored-ranked=${eb.unanchoredRanked} negativeEV=${eb.negativeEV}`
      + ` overStaked=${eb.overStaked} dupLadders=${eb.duplicateLadders} accounted=${eb.accounted}`);

const ld = probe.ladder || {};
add("every ladder spread claimed is re-derivable from the book",
  ld.present && !ld.threw && ld.bad === 0,
  ld.threw ? "threw: " + ld.threw
    : `${ld.executable} executable · ${ld.displayed} displayed-only · unverifiable=${ld.bad}`);

const LY = probe.layout || {};
add("no horizontal overflow and no jittering digits",
  LY.bodyOverflow <= 0 && LY.tabularNums === true && LY.overflowingGrids === 0,
  `bodyOverflow=${LY.bodyOverflow}px tabularNums=${LY.tabularNums} grids=${LY.grids} overflowing=${LY.overflowingGrids}`);
add("the map is a centrepiece, not a thumbnail",
  LY.mapHeight != null && LY.mapHeight >= 480,
  `map ${LY.mapHeight}px`);
add("and it is near the top, not buried",
  LY.mapTop != null && LY.mapTop <= 900,
  `map starts ${LY.mapTop}px down the page`);

add("all markets carried", probe.contracts >= 100 && probe.droppedForCap === 0,
  `${probe.contracts} contracts · ${probe.seriesCount} series · droppedForCap=${probe.droppedForCap}`);
add("board grouped by series", probe.groupHeaders === probe.seriesCount,
  `${probe.groupHeaders} group headers vs ${probe.seriesCount} series`);
add("resting depth populated", probe.depthCount === probe.contracts,
  `${probe.depthCount}/${probe.contracts} carry depth`);
add("fillable cap priced at the ask", probe.capPricedAtAsk,
  probe.capExample ? `${probe.capExample.id}: ${probe.capExample.askSize} × $${probe.capExample.implied} = $${probe.capExample.fillable}` : "no book to sample");
add("order book shows depth", probe.orderBookLive);
add("no unregistered claims", !probe.unregisteredClaim);
add("no horizontal overflow", probe.overflow <= 0, `${probe.overflow}px`);

/* Same-origin failures are ours and must fail the build. Map tiles come from CARTO
   and NASA GIBS; those legitimately 404 for slots that do not exist, so they are
   reported but never fail the run. */
ours = netFailures.filter((f) => f.url.startsWith(origin));
third = netFailures.filter((f) => !f.url.startsWith(origin));
add("no failed same-origin requests", ours.length === 0,
  ours.slice(0, 4).map((f) => `${f.why} ${f.url.replace(origin, "")}`).join(", ") || "all app assets loaded");
add("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ") || "none");
const ourConsole = consoleErrors.filter((e) => !e.at || e.at.startsWith(origin));
thirdConsole = consoleErrors.filter((e) => e.at && !e.at.startsWith(origin));
add("no console errors from our code", ourConsole.length === 0,
  ourConsole.slice(0, 3).map((e) => e.text).join(" | ") || "none");

await page.screenshot({ path: "live-verify.png", fullPage: false });
} catch (err) {
  add("verification completed without crashing", false, String(err && err.message || err).split("\n")[0]);
} finally {
  if (browser) await browser.close().catch(() => {});
}

/* ---- report -------------------------------------------------------------- */
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log("\nLIVE VERIFICATION — " + BASE + "\n");
for (const r of results) console.log("  " + pad(r.pass ? "PASS" : "FAIL", 6) + pad(r.check, 34) + r.detail.slice(0, 90));
const thirdTotal = third.length + thirdConsole.length;
if (thirdTotal) console.log(`\n  note: ${thirdTotal} third-party request(s) failed (CARTO / NASA GIBS tiles) — reported, not a site defect`);

const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} FAILED\n` : `\nall ${results.length} checks passed\n`);

/* Write the verdict into the repo. A red build is visible in the Actions tab, but the
   RESULT should not be locked behind API access — this makes it readable over git by
   anyone, and lets the terminal report its own last deployment check. */
const report = {
  schema: "millibar-verify-live/1",
  ranAt: new Date().toISOString(),
  url: BASE,
  sha: process.env.GITHUB_SHA || null,
  runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  ok: failed.length === 0 && deployed,
  passed: results.length - failed.length,
  total: results.length,
  failures: failed.map((r) => ({ check: r.check, detail: r.detail })),
  thirdPartyFailures: thirdTotal,
  checks: results.map((r) => ({ check: r.check, pass: r.pass, detail: r.detail })),
};
try {
  await mkdir(resolve(ROOT, "docs/data"), { recursive: true });
  await writeFile(resolve(ROOT, "docs/data/verify-live.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("wrote docs/data/verify-live.json");
} catch (e) { console.log("could not write report: " + e.message); }

process.exit(failed.length || !deployed ? 1 : 0);
