#!/usr/bin/env node
/* CAN THIS INSTRUMENT BE USED WITHOUT A POINTER?
 *
 * The Atlas's primary gesture is a click on the ocean: click open water to ask what formed
 * there, click a genesis point to open that storm. Everything else on the surface is words, and
 * words were always reachable -- so a keyboard reader could get to every sentence on the page
 * and to none of the thing the page is for. That is the failure this gate exists to prevent, and
 * it is invisible in a screenshot: a plate with no keyboard route looks exactly like one with a
 * route nobody has taken.
 *
 * Four properties, driven with keys only -- no click is used to establish any of them:
 *   1. EVERY CONTROL IS REACHABLE AND NAMED. Tab reaches the plate's modes, the reticle, the
 *      camera controls, the clauses of the question and the rows of the answer, and each has an
 *      accessible name that says what it does.
 *   2. STATE IS ANNOUNCED, NOT DRAWN. Anything with a held/pressed state carries aria-pressed
 *      and it tracks the state -- a hold drawn only as a colour is a hold a screen reader cannot
 *      report.
 *   3. THE MAP ANSWERS THE KEYBOARD. The reticle moves with the arrows, its readout follows it,
 *      Enter does what a click does (a storm opens, or the question is asked), Escape gives the
 *      arrows back to the map.
 *   4. THE CROSSHAIR SPEAKS. A polite live region says what is under it, because a reader who
 *      cannot see the foot band change cannot see the cell count change either.
 *
 * Run: node scripts/check-atlas-a11y.mjs [--require-browser]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const REQUIRE = process.argv.includes("--require-browser");

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.log("[a11y] SKIPPED, not passed: playwright is not installed");
  process.exit(REQUIRE ? 2 : 0);
}

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

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
  serviceWorkers: "block" });
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const open = async (query = "") => {
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(1200);
};

/* The accessible name, by the rules that actually apply here: an explicit label, else the title,
   else the text. Everything on this surface is one of the three. */
const NAME_OF = `(el) => (el.getAttribute("aria-label") || el.getAttribute("title")
  || (el.textContent || "").trim())`;

console.log("\n[a11y] every control is reachable by Tab, and named");
await open();
{
  /* Walked with the keyboard rather than enumerated from the DOM: what matters is not that a
     button exists but that Tab arrives at it. */
  const reached = await page.evaluate(async () => {
    const seen = [];
    const start = document.body;
    start.focus();
    for (let i = 0; i < 120; i++) {
      /* Playwright drives the real Tab below; here we only need the tabbable set the browser
         itself computes, in order, which is what `:is(...)`+tabindex gives without simulating. */
      break;
    }
    return seen;
  });
  void reached;
  const tabbed = [];
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const cur = await page.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const name = ${NAME_OF};
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, hook: [...el.attributes].map((a) => a.name)
          .filter((n) => n.startsWith("data-")).join(","),
        name: name(el).slice(0, 60), pressed: el.getAttribute("aria-pressed"),
        visible: r.width > 0 && r.height > 0 };
    })()`);
    if (cur) tabbed.push(cur);
  }
  const has = (hook) => tabbed.some((t) => (t.hook || "").includes(hook));
  ok(`Tab reaches ${tabbed.length} controls without leaving the surface`, tabbed.length >= 12);
  ok("the plate's mode segment is reachable", has("data-plate-mode"));
  ok("the keyboard reticle is reachable", has("data-reticle-toggle"));
  ok("the question's clauses are reachable", has("data-zone-edit"));
  ok("the answer's rows are reachable", has("data-lens-row"));
  ok("the citation is reachable", has("data-cite-cohort"));
  const unnamed = tabbed.filter((t) => !t.name);
  ok("every control Tab reaches has an accessible name", unnamed.length === 0,
    JSON.stringify(unnamed.slice(0, 6)));
  const invisible = tabbed.filter((t) => !t.visible);
  ok("and none of them is an invisible tab stop", invisible.length === 0,
    JSON.stringify(invisible.slice(0, 6)));
}

console.log("\n[a11y] state is announced rather than only drawn");
{
  const modes = await page.$$eval("[data-plate-mode]", (els) =>
    els.map((e) => [e.getAttribute("data-plate-mode"), e.getAttribute("aria-pressed")]));
  ok("every plate mode declares aria-pressed", modes.every(([, p]) => p === "true" || p === "false"),
    JSON.stringify(modes));
  ok("exactly one is pressed", modes.filter(([, p]) => p === "true").length === 1);
  /* Driven with the KEYBOARD: focus the control and press Enter, the way a reader would. */
  await page.focus('[data-plate-mode="genesis"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  const after = await page.$$eval("[data-plate-mode]", (els) =>
    els.map((e) => [e.getAttribute("data-plate-mode"), e.getAttribute("aria-pressed")]));
  ok("and pressing one with the keyboard moves the pressed state",
    after.find((m) => m[0] === "genesis")[1] === "true"
    && after.find((m) => m[0] === "pathway")[1] === "false", JSON.stringify(after));
  await page.focus('[data-plate-mode="pathway"]');
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);

  const rows = await page.$$eval("[data-lens-row]", (els) =>
    els.map((e) => e.getAttribute("aria-pressed")));
  ok("every liftable row declares aria-pressed", rows.length > 0 && rows.every((p) => p === "false"),
    JSON.stringify(rows));
}

console.log("\n[a11y] the map answers the keyboard");
{
  await open("w=12,-105,800&s0=1971");
  await page.focus("[data-reticle-toggle]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const up = await page.evaluate(() => {
    const r = document.querySelector("[data-reticle]");
    const b = r && r.getBoundingClientRect();
    return { present: !!r, x: b ? Math.round(b.x) : null, y: b ? Math.round(b.y) : null,
      pressed: document.querySelector("[data-reticle-toggle]").getAttribute("aria-pressed"),
      live: (document.querySelector("[data-plate-live]") || {}).textContent || "",
      polite: (document.querySelector("[data-plate-live]") || {}).getAttribute
        ? document.querySelector("[data-plate-live]").getAttribute("aria-live") : null };
  });
  ok("the reticle appears and the button reads pressed", up.present && up.pressed === "true");
  ok("and a polite live region describes what is under it",
    up.polite === "polite" && /Enter (opens|asks)/.test(up.live), JSON.stringify(up.live));

  const coordsBefore = await page.$eval("#at-coords", (e) => e.textContent);
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(400);
  const moved = await page.evaluate(() => {
    const b = document.querySelector("[data-reticle]").getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y),
      coords: (document.getElementById("at-coords") || {}).textContent,
      cell: (document.getElementById("at-cell") || {}).textContent,
      live: (document.querySelector("[data-plate-live]") || {}).textContent };
  });
  ok("the arrows move it", moved.x > up.x && moved.y < up.y,
    `${up.x},${up.y} -> ${moved.x},${moved.y}`);
  ok("the position readout follows it", moved.coords !== coordsBefore && /[NS].*[EW]/.test(moved.coords),
    JSON.stringify(moved.coords));
  /* THE LITERAL CELL COUNT, ON KEYBOARD FOCUS. The same statement the pointer gets: a shaded
     cell a keyboard reader cannot read the count of is a probability surface to them. */
  ok("and so does the cell's literal count", /CELL .*·.*\d/.test(moved.cell || ""),
    JSON.stringify(moved.cell));
  ok("the live region is rewritten as it moves", !!moved.live && moved.live !== up.live);

  /* THE MAP DOES NOT ALSO PAN. While the crosshair is up the arrows belong to it. */
  const cam = await page.evaluate(() => {
    const m = globalThis.__ATLAS_MAP; const c = m.getCenter();
    return [c.lat.toFixed(5), c.lng.toFixed(5), m.getZoom()].join(",");
  });
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(350);
  const cam2 = await page.evaluate(() => {
    const m = globalThis.__ATLAS_MAP; const c = m.getCenter();
    return [c.lat.toFixed(5), c.lng.toFixed(5), m.getZoom()].join(",");
  });
  ok("and the map does not pan underneath it", cam === cam2, `${cam} -> ${cam2}`);

  /* ENTER DOES WHAT A CLICK DOES. Parked over open water it asks the question -- which writes
     the cohort's location condition, exactly as a click would. */
  const urlBefore = await page.evaluate(() => location.search);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  const asked = await page.evaluate(() => ({ url: location.search,
    question: (document.querySelector("[data-question]") || {}).textContent || "" }));
  ok("Enter over open water asks the archive's question",
    asked.url !== urlBefore && /w=/.test(asked.url), `${urlBefore} -> ${asked.url}`);

  /* ESCAPE GIVES THE ARROWS BACK, and returns focus to the control that took them. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const done = await page.evaluate(() => ({
    present: !!document.querySelector("[data-reticle]"),
    pressed: document.querySelector("[data-reticle-toggle]").getAttribute("aria-pressed"),
    focus: document.activeElement && document.activeElement.hasAttribute("data-reticle-toggle"),
  }));
  ok("Escape dismisses the reticle and returns focus to its control",
    !done.present && done.pressed === "false" && done.focus, JSON.stringify(done));
}

console.log("\n[a11y] a genesis point can be opened without a pointer");
{
  await open();
  /* Park the reticle on a genesis point the archive really holds, by asking the page where one
     is on screen -- the keyboard then does the selecting. */
  /* AN ISOLATED ONE. The hit test deliberately REFUSES an ambiguous point -- where a second
     genesis sits nearly as close it falls back to a probe, because a selection the reader did
     not mean is worse than none -- so aiming at the densest part of the Atlantic would be
     testing that rule rather than the keyboard. This picks a point with clear water around it,
     which is what a reader aiming by hand would also do. */
  const target = await page.evaluate(() => {
    const A = globalThis.__ATLAS.archive;
    const m = globalThis.__ATLAS_MAP;
    const size = m.getSize();
    const pts = [];
    for (let row = 0; row < A.nStorms; row++) {
      const la = A.genesisLat[row];
      if (Number.isNaN(la)) continue;
      const p = m.latLngToContainerPoint([la, A.genesisLon[row]]);
      if (p.x > 60 && p.y > 60 && p.x < size.x - 60 && p.y < size.y - 60) {
        pts.push({ row, x: p.x, y: p.y });
      }
    }
    for (const a of pts) {
      let nearest = Infinity;
      for (const b of pts) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < nearest) nearest = d;
      }
      if (nearest > 40) {
        return { x: Math.round(a.x), y: Math.round(a.y),
          name: A.storms.str("name", a.row) || "UNNAMED" };
      }
    }
    return null;
  });
  ok("the plate is showing at least one genesis point to aim at", !!target);
  await page.focus("[data-reticle-toggle]");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  /* Walk the crosshair to it with the arrows alone -- 12px a press, 2px with Alt. */
  let last = null;
  /* One axis at a time, the axis with the larger error first, and the fine 2px step (Alt) once
     that axis is within a coarse step -- which is how a reader would actually do it. */
  const walk = async () => {
    for (let i = 0; i < 300; i++) {
      const at = await page.evaluate(() => {
        const b = document.querySelector("[data-reticle]").getBoundingClientRect();
        const p = document.querySelector(".at-plate").getBoundingClientRect();
        return { x: Math.round(b.x - p.x + 12), y: Math.round(b.y - p.y + 12) };
      });
      const dx = target.x - at.x;
      const dy = target.y - at.y;
      last = { at, dx, dy };
      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) return true;
      const useX = Math.abs(dx) >= Math.abs(dy);
      const d = useX ? dx : dy;
      const fine = Math.abs(d) < 12;
      const key = useX ? (d > 0 ? "ArrowRight" : "ArrowLeft") : (d > 0 ? "ArrowDown" : "ArrowUp");
      await page.keyboard.press(fine ? `Alt+${key}` : key);
      await page.waitForTimeout(18);
    }
    return false;
  };
  const arrived = await walk();
  ok("the arrows reach a genesis point", arrived,
    `target ${target.x},${target.y}; last ${JSON.stringify(last)}`);
  const live = await page.evaluate(() => (document.querySelector("[data-plate-live]") || {}).textContent);
  ok("and the live region names the storm under the crosshair", /Enter opens this storm/.test(live || ""),
    JSON.stringify(live));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  const opened = await page.evaluate(() => ({
    inspector: !!document.querySelector("[data-inspector]"),
    url: location.search,
  }));
  ok("Enter opens that storm, as a click would", opened.inspector && /storm=/.test(opened.url),
    JSON.stringify(opened));
}

console.log("\n[a11y] the brush is an inspection, and it says so");
{
  await open("w=12,-105,800&s0=1971");
  const before = await page.evaluate(() => ({ url: location.search,
    cohort: (document.querySelector("[data-cohort-size]") || {}).textContent }));
  const box = await page.evaluate(() => {
    const b = document.querySelector(".at-plate").getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.w * 0.3, box.y + box.h * 0.35);
  await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.6, box.y + box.h * 0.65, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(700);
  const brushed = await page.evaluate(() => ({
    set: !!document.querySelector("[data-brush-set]"),
    echo: (document.querySelector("[data-lens-echo]") || {}).textContent || "",
    lifted: (globalThis.__ATLAS_POPULATION.lastFrame() || {}).lensed || 0,
    lens: globalThis.__ATLAS_LENS ? globalThis.__ATLAS_LENS.count : null,
    url: location.search,
    cohort: (document.querySelector("[data-cohort-size]") || {}).textContent,
  }));
  ok("a shift-drag lifts the storms through that water", brushed.set && brushed.lifted > 0
    && brushed.lens === brushed.lifted, JSON.stringify(brushed));
  ok("and states the count on the plate's foot", /LOOKING AT BRUSHED AREA/.test(brushed.echo),
    JSON.stringify(brushed.echo));
  ok("it writes no URL and no cohort", brushed.url === before.url && brushed.cohort === before.cohort,
    `${before.url} -> ${brushed.url}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const cleared = await page.evaluate(() => ({
    set: !!document.querySelector("[data-brush-set]"),
    lifted: (globalThis.__ATLAS_POPULATION.lastFrame() || {}).lensed || 0,
  }));
  ok("Escape clears it", !cleared.set && cleared.lifted === 0, JSON.stringify(cleared));
}

ok("no page errors in any state", errors.length === 0, errors.join("\n"));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nthe instrument answers the keyboard: every control named, every state announced, the plate reachable"
  : `\n${failures} accessibility check(s) failed`);
process.exit(failures ? 1 : 0);
