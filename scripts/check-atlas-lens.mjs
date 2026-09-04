#!/usr/bin/env node
/* MAP ↔ EVIDENCE COORDINATION: does holding a row draw that row's own storms, and nothing else?
 *
 * The lens is the one place on this surface where a published NUMBER and a set of drawn TRACKS
 * claim to be the same thing. Three ways that can be false, and a screenshot shows none of them:
 *
 *   THE SET COULD BE RE-DERIVED. If the renderer decided for itself which storms "reached
 *   Category 4", the plate would be answering a second time, with a second implementation, and
 *   the two would eventually disagree. So the assertion is numeric: the number of storms the
 *   layer LIFTED equals the numerator the ladder PRINTED, row by row, on real cohorts.
 *
 *   IT COULD PUBLISH. Holds are view state -- they may not write a rate, the cohort, the
 *   citation or the URL. The address bar, the question, the cohort size and every published
 *   figure are captured before and after and required identical.
 *
 *   IT COULD NOT COME BACK. A hold that cannot be released exactly is a state a reader is stuck
 *   in. Release is asserted as an exact restore of the plate's rect, the camera and the drawn
 *   population.
 *
 * Run: node scripts/check-atlas-lens.mjs [--require-browser]
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
  console.log("[lens] SKIPPED, not passed: playwright is not installed");
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

const open = async (query) => {
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(1200);
};

/* What the page publishes, in one read: the address bar, the question, the cohort size and every
   figure on the answer. A hold may change none of it. */
const published = () => page.evaluate(() => ({
  url: location.search,
  question: (document.querySelector("[data-question]") || {}).textContent || "",
  cohort: (document.querySelector("[data-cohort-size]") || {}).textContent || "",
  rows: [...document.querySelectorAll("[data-finding]")].map((r) => [
    (r.querySelector(".at-ans-label") || {}).textContent,
    (r.querySelector(".at-ans-rate") || {}).textContent,
    (r.querySelector(".at-ans-sup") || {}).textContent,
    (r.querySelector(".at-ans-st") || {}).textContent,
  ].join(" | ")),
  plate: (() => { const b = document.querySelector(".at-plate").getBoundingClientRect();
    return [Math.round(b.width), Math.round(b.height)].join("x"); })(),
  camera: (() => { const m = globalThis.__ATLAS_MAP; const c = m.getCenter();
    return [c.lat.toFixed(4), c.lng.toFixed(4), m.getZoom()].join(","); })(),
  drawn: (globalThis.__ATLAS_POPULATION.lastFrame() || {}).storms || 0,
}));

const STATES = [
  ["the unqueried archive", ""],
  ["a conditioned cohort", "w=12,-105,800&s0=1971"],
  ["an outcome-conditioned cohort", "i=cat4"],
];

for (const [name, query] of STATES) {
  console.log(`\n[lens] ${name}`);
  await open(query);
  const before = await published();

  /* Every row that offers a lens, and what it published. */
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-lens-row]")].map((r) => ({
    key: r.getAttribute("data-lens-row"),
    label: (r.querySelector(".at-ans-label") || {}).textContent || "",
    /* THE NUMERATOR AS THE ROW PRINTS IT. A scoreable row prints "n / N · lo-hi%" in its
       supporting line; a refused one prints the count in the rate cell. Both are parsed from the
       DOM rather than from the engine, so what is compared is what a reader can see. */
    sup: (r.querySelector(".at-ans-sup") || {}).textContent || "",
    rate: (r.querySelector(".at-ans-rate") || {}).textContent || "",
    refused: r.hasAttribute("data-refused"),
    pressed: r.getAttribute("aria-pressed"),
  })));
  ok(`at least four rows offer a lens (${rows.length})`, rows.length >= 4);
  ok("and none of them starts held", rows.every((r) => r.pressed === "false"));

  for (const row of rows.slice(0, 4)) {
    const numerator = (() => {
      const m = row.refused ? row.rate.match(/^([\d,]+)/) : row.sup.match(/^([\d,]+)\s*\//);
      return m ? Number(m[1].replace(/,/g, "")) : null;
    })();
    await page.click(`[data-lens-row="${row.key}"]`);
    await page.waitForTimeout(450);
    const held = await page.evaluate(() => ({
      lens: globalThis.__ATLAS_LENS
        ? { count: globalThis.__ATLAS_LENS.count, rows: globalThis.__ATLAS_LENS.rows.length,
            label: globalThis.__ATLAS_LENS.label, held: globalThis.__ATLAS_LENS.held }
        : null,
      lifted: (globalThis.__ATLAS_POPULATION.lastFrame() || {}).lensed || 0,
      echo: (document.querySelector("[data-lens-echo]") || {}).textContent || "",
      pressed: document.querySelector("[aria-pressed='true'][data-lens-row]")
        ? document.querySelector("[aria-pressed='true'][data-lens-row]").getAttribute("data-lens-row") : null,
    }));
    const label = row.label.slice(0, 22).padEnd(22);
    ok(`${label} the plate lifts the storms the row counted (${numerator})`,
      numerator !== null && held.lens && held.lens.rows === numerator && held.lifted === numerator,
      `row printed ${numerator}, engine handed ${held.lens && held.lens.rows}, layer lifted ${held.lifted}`);
    ok(`${label} the foot echoes that row and says it is held`,
      held.echo.includes("LOOKING AT") && held.echo.includes("HELD")
      && held.echo.includes(row.label.split(" · ")[0]),
      JSON.stringify(held.echo));
    ok(`${label} exactly that row reads as pressed`, held.pressed === row.key, String(held.pressed));

    const during = await published();
    ok(`${label} the hold publishes nothing`,
      during.url === before.url && during.question === before.question
      && during.cohort === before.cohort && during.rows.join("\n") === before.rows.join("\n"),
      [during.url !== before.url ? `url ${before.url} -> ${during.url}` : null,
        during.cohort !== before.cohort ? `cohort ${before.cohort} -> ${during.cohort}` : null,
        during.rows.join("\n") !== before.rows.join("\n") ? "a published figure moved" : null,
      ].filter(Boolean).join("; "));
    ok(`${label} and moves neither the plate nor the camera`,
      during.plate === before.plate && during.camera === before.camera,
      `${before.plate}/${before.camera} -> ${during.plate}/${during.camera}`);

    /* RELEASE, AND IT MUST BE EXACT. */
    await page.click(`[data-lens-row="${row.key}"]`);
    await page.waitForTimeout(400);
    const after = await published();
    const cleared = await page.evaluate(() => ({
      lens: globalThis.__ATLAS_LENS,
      lifted: (globalThis.__ATLAS_POPULATION.lastFrame() || {}).lensed || 0,
      echo: !!document.querySelector("[data-lens-echo]"),
      pressed: !!document.querySelector("[aria-pressed='true'][data-lens-row]"),
    }));
    ok(`${label} releasing restores the frame exactly`,
      !cleared.lens && cleared.lifted === 0 && !cleared.echo && !cleared.pressed
      && JSON.stringify(after) === JSON.stringify(before),
      JSON.stringify(cleared));
  }

  /* ESCAPE RELEASES, and it is the hold it releases rather than the reader's query. */
  await page.click(`[data-lens-row="${rows[0].key}"]`);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const esc = await published();
  ok("Escape releases the hold and leaves the query alone",
    !(await page.evaluate(() => globalThis.__ATLAS_LENS)) && esc.url === before.url
    && esc.cohort === before.cohort);

  /* THE KEYBOARD REACHES IT AT ALL. A control only a pointer can use is not a control. */
  const viaKey = await page.evaluate(async (key) => {
    const el = document.querySelector(`[data-lens-row="${key}"]`);
    el.focus();
    const focused = document.activeElement === el;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    return { focused, held: !!(globalThis.__ATLAS_LENS && globalThis.__ATLAS_LENS.held) };
  }, rows[0].key);
  ok("a row takes focus and Enter holds it", viaKey.focused && viaKey.held, JSON.stringify(viaKey));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

/* A COHORT EDIT RELEASES THE HOLD, because the row a reader held belonged to the previous
   answer. Driven through the surface's own control rather than a reload. */
console.log("\n[lens] a cohort edit releases the hold");
{
  await open("w=12,-105,800&s0=1971");
  const key = await page.evaluate(() => {
    const el = document.querySelector("[data-lens-row]");
    return el && el.getAttribute("data-lens-row");
  });
  await page.click(`[data-lens-row="${key}"]`);
  await page.waitForTimeout(350);
  ok("held before the edit", !!(await page.evaluate(() => globalThis.__ATLAS_LENS)));
  await page.click("[data-condition-clear]");
  await page.waitForTimeout(700);
  ok("released by the edit", !(await page.evaluate(() => globalThis.__ATLAS_LENS)));
  ok("and no row is left reading as pressed",
    !(await page.evaluate(() => !!document.querySelector("[aria-pressed='true'][data-lens-row]"))));
}

ok("no page errors in any state", errors.length === 0, errors.join("\n"));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nthe plate lifts exactly what the answer counted, and a hold publishes nothing"
  : `\n${failures} lens check(s) failed`);
process.exit(failures ? 1 : 0);
