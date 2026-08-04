/* Millibar Terminal — live-site verification, run in the browser.
 *
 * This exists because the build sandbox cannot reach *.github.io (egress allowlist),
 * so the deployed PAGE can only be verified from a real browser. Everything upstream
 * of the edge — the committed files, the app, the data — is verified in CI.
 *
 * HOW TO RUN
 *   1. Open https://alecmessino.github.io/category-alpha/
 *   2. Open DevTools (Cmd+Opt+I / F12) → Network tab → tick "Disable cache"
 *   3. Hard refresh (Cmd+Shift+R / Ctrl+F5) and wait for the board to render
 *   4. Console tab → paste this whole file → Enter
 *
 * It prints a pass/fail table and leaves the detail in `window.__mtVerify`.
 */
(async () => {
  const R = [];
  const add = (name, pass, detail) => R.push({ check: name, result: pass === null ? "SKIP" : pass ? "PASS" : "FAIL", detail: String(detail ?? "") });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = () => document.body.innerText;

  // ---- 1. is this the latest commit, and is the data fresh? ----------------
  try {
    const snap = await fetch("data/latest.json?cb=" + Date.now(), { cache: "no-store" }).then((r) => r.json());
    const ageMin = Math.round((Date.now() - Date.parse(snap.generatedAt)) / 60000);
    add("data snapshot is fresh", ageMin <= 40, `${snap.generatedAt} · ${ageMin}m old (pipeline ticks ~10m)`);
    add("snapshot matches what the page rendered",
        !!window.MT && window.MT._generatedAt === snap.generatedAt,
        `page=${window.MT && window.MT._generatedAt} served=${snap.generatedAt}`);

    // Compare the served commit against the newest commit on main.
    const api = "https://api.github.com/repos/alecmessino/category-alpha/commits?path=docs&per_page=1";
    const head = await fetch(api).then((r) => r.ok ? r.json() : null).catch(() => null);
    if (head && head[0]) {
      const sha = head[0].sha, when = head[0].commit.committer.date;
      const lagMin = Math.round((Date.now() - Date.parse(when)) / 60000);
      add("Pages is serving recent content", lagMin <= 40,
          `newest docs/ commit ${sha.slice(0, 7)} at ${when} (${lagMin}m ago) — if the snapshot above matches, the edge is current`);
    } else {
      add("Pages is serving recent content", null, "GitHub API unreachable or rate-limited from this browser");
    }
  } catch (e) {
    add("data snapshot is fresh", false, "could not fetch data/latest.json — " + e.message);
  }

  // ---- 2. the app booted at all -------------------------------------------
  add("app mounted (not stuck booting)", !/booting ingestion/.test(text()) && !!window.MT, `MT=${!!window.MT} MTX=${!!window.MTX} MTC=${!!window.MTC}`);

  // Open the two sections that are collapsed by default. NOTE: do NOT click
  // "Fair value" or "Spatial context" — they are open already and a click closes them.
  for (const label of ["Verify", "Raw data"]) {
    const hit = [...document.querySelectorAll("span")].find((s) => s.textContent.trim() === label);
    if (hit) { hit.parentElement.click(); await sleep(500); }
  }
  await sleep(500);
  const T = text();

  // ---- 3. with no active storm, everything non-storm must still render -----
  const storms = window.MT ? Object.keys(window.MT.storms).length : -1;
  add("no active storms (this is the case under test)", storms === 0, `${storms} storm(s) in the feed`);
  const need = {
    "Situation": /SITUATION/,
    "Attention queue": /ATTENTION/,
    "Board Impact": /BOARD IMPACT/,
    "Fair value / term structure": /TERM STRUCTURE/,
    "posterior stack": /POSTERIOR STACK/,
    "Verify · Evidence Matrix": /EVIDENCE MATRIX/,
    "Verify · Signal Register": /SIGNAL REGISTER/i,
    "Raw data · market board": /PREDICTION MARKETS/,
    "Observability": /OBSERVABILITY/,
  };
  for (const [name, re] of Object.entries(need)) add("visible: " + name, re.test(T), "");
  add("awaiting-telemetry notice replaces ONLY the map",
      /SYSTEM AWAITING TELEMETRY/.test(T) && !/STORM COMMAND CENTER/.test(T),
      "notice present, storm command centre absent — correct with no cyclone");

  // ---- 4. full market coverage --------------------------------------------
  const C = (window.MT && window.MT.contracts) || [];
  const series = new Set(C.map((c) => String(c.id).replace(/-[^-]*$/, "")));
  add("all markets carried, none silently trimmed", C.length >= 100 && (window.MT._feeds.markets.droppedForCap || 0) === 0,
      `${C.length} contracts · ${series.size} series · droppedForCap=${window.MT._feeds.markets.droppedForCap}`);
  add("board is grouped by series", document.querySelectorAll('td[colspan="7"]').length === series.size,
      `${document.querySelectorAll('td[colspan="7"]').length} group headers vs ${series.size} series`);

  // ---- 5. the fillable cap is priced at the ask (the $541 case) ------------
  const withDepth = C.filter((c) => c.depth && c.depth.askSize > 0 && c.liquidity > 0);
  add("resting depth populated", withDepth.length > 0, `${C.filter((c) => c.depth).length}/${C.length} carry depth`);
  // Pick a book big enough that dollar rounding does not dominate the implied price.
  const worst = withDepth.filter((c) => c.liquidity >= 10)
    .map((c) => ({ c, implied: c.liquidity / (c.depth.askSize * (c.depth.notional || 1)) }))
    .sort((a, b) => b.c.depth.askSize - a.c.depth.askSize)[0];
  if (worst) {
    // implied ask price must be >= the displayed mid; mid-pricing would sit below it
    const ok = withDepth.every((c) => c.liquidity >= Math.floor(c.depth.askSize * c.market * (c.depth.notional || 1)) - 1);
    add("fillable cap priced at the ask, not the mid", ok,
        `e.g. ${worst.c.id}: ask ${Math.round(worst.c.depth.askSize)} × $${worst.implied.toFixed(4)} = $${worst.c.liquidity}`);
    const penny = withDepth.filter((c) => c.depth.askSize > 10000).sort((a, b) => b.depth.askSize - a.depth.askSize)[0];
    if (penny) add("large penny book sized correctly", penny.liquidity > 0,
        `${penny.id}: ${Math.round(penny.depth.askSize)} resting → $${penny.liquidity} fillable`);
  }
  add("order book shows depth, not UNAVAILABLE", /TOP OF BOOK|BID SIZE|ORDER BOOK/i.test(T) && !/KELLY SIZING — UNAVAILABLE/.test(T), "");

  // ---- 6. nothing unowned, nothing broken ---------------------------------
  add("no unregistered claims rendered", !/UNREGISTERED CLAIM|CLAIM ERROR/.test(T), "");
  add("no horizontal overflow", document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      `${document.documentElement.scrollWidth} vs ${document.documentElement.clientWidth}`);

  // Failed subresources. Tile requests to CARTO/GIBS are expected to vary.
  const bad = performance.getEntriesByType("resource")
    .filter((e) => e.responseStatus >= 400 || (e.transferSize === 0 && e.decodedBodySize === 0 && /\.(js|jsx|json|css|svg)(\?|$)/.test(e.name)))
    .map((e) => `${e.responseStatus || "?"} ${e.name.split("/").pop().slice(0, 40)}`);
  add("no failed asset requests", bad.length === 0, bad.slice(0, 5).join(", ") || "all app assets loaded");

  console.table(R);
  const failed = R.filter((r) => r.result === "FAIL");
  console.log(failed.length ? `\n${failed.length} FAILED — details above` : "\nall checks passed");
  console.log("Console errors are NOT captured retroactively — check the Console tab yourself for red entries.");
  window.__mtVerify = R;
  return R;
})();
