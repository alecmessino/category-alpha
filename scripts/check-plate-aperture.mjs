#!/usr/bin/env node
/* THE PLATE'S APERTURE, BOUNDED AT BOTH ENDS, MEASURED IN THE REAL PAGE.
 *
 * TWO ASPECT BOUNDS, AND THEY FAIL AT DIFFERENT VIEWPORTS.
 *
 *   FLOOR 1.67    Derived, not chosen, and derived from the APERTURE rather than from empty
 *                 ocean: the opening view must contain the four research corridors, which span
 *                 120 degrees of longitude; the clamp allows 61.37 world-units of latitude; and
 *                 Leaflet CEILS the clamp fit to a quarter zoom step, costing up to a factor of
 *                 1.189. 86.1 x 1.189 / 61.37 = 1.668. A plate taller than its width over that
 *                 opens on a view with a development region off the edge of a plate captioned
 *                 for it. It fails on a TALL workstation. See atlas.css for the full derivation
 *                 and check-atlas-camera.mjs for the corridor list it is derived from.
 *
 *   CEILING 3.2   Past it a single East Pacific track stops being the subject of its own plate.
 *                 It fails on a WIDE, SHORT one -- and that is the case a developer never sees,
 *                 because nobody develops at 2560x1080.
 *
 * THE 500px HEIGHT CAP AND THE 4.0 WIDE CEILING ARE GONE, AND THEIR ABSENCE IS THE POINT OF
 * HALF THIS FILE. Both existed because the evidence deck sat UNDER the map: every pixel of plate
 * height came straight out of visible rows, so the map had to be capped and the aspect ceiling
 * relaxed at the widths where the cap was what set the shape. Beside a ledger with its own
 * full-height column there is no such trade -- plate height and row count are independent -- and
 * a cap would only force the frozen 834px plate to aspect 1.67 where 5c measures 1.44.
 *
 * WHAT REPLACED THE CAP AS THE THING THAT DECIDES HOW MUCH OF A MONITOR THE MAP TAKES is the
 * LEDGER MEASURE, and it is asserted here as a measurement rather than only as a token: at 1440
 * the plate must be the frozen 834px and at 1920 the stated 1180px. Those two numbers are what a
 * widened ledger, a trimmed page padding or a changed gutter would move, and they are the modern
 * form of the edit the cap was pinned to prevent.
 *
 * AND THE FOUR VIEWPORT TARGETS ARE ASSERTED AS RANGES, not merely as bounds, because a plate
 * that satisfies every bound and still starves the evidence is the failure this family of checks
 * was opened for. A bound says what is forbidden; a range says what was asked for.
 *
 * AND BLANK PLANE IS ASSERTED WITH ALL OF IT, because they are one trade. The easy way to hold
 * an aspect bound is to cap the instrument and centre it, which is what an earlier shell did --
 * measured 285px of a 1000px viewport painted blank at 1440. The acceptance test is 0%, so every
 * row's height is summed against the viewport here and any shortfall is a failure. It is asserted
 * only at or above 900, where the shell fills the viewport; below that the instrument stacks and
 * the PAGE is the scroll, so the rows are meant to exceed it.
 *
 * Run: node scripts/check-plate-aperture.mjs [--self-test] [--require-browser]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const DOCS = resolve(ROOT, "docs");

const FLOOR = 1.67;
const CEILING = 3.2;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return true; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + String(detail).replace(/\n/g, "\n        ") : ""));
  return false;
};

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* reported below */ }
if (!chromium) {
  const required = process.argv.includes("--require-browser");
  console.log(required
    ? "[aperture] playwright is absent and --require-browser was given"
    : "[aperture] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml",
  ".gz": "application/octet-stream", ".geojson": "application/json" };

const server = await new Promise((r) => {
  const s = createServer(async (req, res) => {
    let p = "/";
    try {
      p = decodeURIComponent(req.url.split("?")[0]);
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
const ctx = await browser.newContext({ serviceWorkers: "block" });
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const open = async (query, w, h) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(900);
};

/* The plate's own box, the shell's row sum, and whether the deck gave up any height. */
const measure = () => page.evaluate(() => {
  const shell = document.querySelector(".atlas-instrument");
  const plate = document.querySelector(".at-plate");
  if (!shell || !plate) return null;
  const b = plate.getBoundingClientRect();
  const used = [...shell.children].reduce((a, c) => a + c.getBoundingClientRect().height, 0);
  const ev = document.querySelector("[data-evidence-row]");
  return {
    w: Math.round(b.width), h: Math.round(b.height),
    ar: b.height ? b.width / b.height : null,
    blank: Math.round(window.innerHeight - used),
    evidence: ev ? Math.round(ev.getBoundingClientRect().height) : null,
    docked: !!document.querySelector(".atlas-dock"),
  };
});

/* THE SUPPORTED MATRIX, PLUS THE ONES NOBODY DEVELOPS AT. 1920x900 and 2560x1080 are the wide,
   short cases the ceiling exists for; 1440x1600 and 1440x2000 are the tall ones the floor exists
   for; 3440x1440 is the ultrawide. Without those five this gate would pass on a broken bound. */
const VIEWPORTS = [
  [1440, 900], [1280, 800], [1180, 800], [1024, 768],
  [1920, 1080], [1600, 900],
  [1920, 900], [2560, 1080], [3440, 1440],
  [1440, 1600], [1440, 2000],
];

console.log("[aperture] the plate stays inside its aspect envelope everywhere");
for (const [w, h] of VIEWPORTS) {
  await open("", w, h);
  const m = await measure();
  if (!m) { ok(`${w}x${h}`, false, "no instrument or no plate on the page"); continue; }
  const wide = w >= h * 1.9 ? "  (wide/short — the ceiling's case)" : "";
  const tall = h >= w ? "  (tall — the floor's case)" : "";
  const label = `${String(w + "x" + h).padEnd(10)} plate ${m.w}x${m.h}, aspect ${m.ar.toFixed(3)}`;
  ok(`${label} — at or above the ${FLOOR} floor${tall}`, m.ar >= FLOOR - 0.002,
     `aspect ${m.ar.toFixed(3)} is below ${FLOOR}: the opening view loses a research corridor`);
  ok(`${label} — at or below the ${CEILING} ceiling${wide}`, m.ar <= CEILING + 0.002,
     `aspect ${m.ar.toFixed(3)} is above ${CEILING}`);
  ok(`${String(w + "x" + h).padEnd(10)} no blank plane`, m.blank === 0, `${m.blank}px unaccounted`);
}

/* THE TWO FROZEN PLATE BOXES, MEASURED IN THE PAGE.
 *
 * These are the numbers the design is specified at -- 5c's measured 834px plate at 1440, and
 * turn 4's stated 1180px at 1920 -- and they are a CONSEQUENCE of three others: the ledger
 * measure, the page padding and the gutter. check-atlas-adherence pins those three as tokens;
 * this asserts what they actually produce, which is the half a token check cannot see. A ledger
 * widened to make a cramped table fit moves both of these, and that is exactly the change that
 * should have to be argued for rather than merged. */
console.log("\n[aperture] and the plate is the frozen box at the two widths the design states");
for (const [w, h, want] of [[1440, 900, 834], [1920, 1080, 1180]]) {
  await open("", w, h);
  const m = await measure();
  ok(`${String(w + "x" + h).padEnd(10)} plate is ${want}px wide`, m && m.w === want,
     m ? `${m.w}px — the ledger measure, the page padding or the gutter has moved` : "no plate");
}

/* THE FOUR VIEWPORT TARGETS, AS RANGES. Every bound above can be satisfied by a plate that is
   still taking two thirds of the screen, which is the state this pass replaced. These are what
   was actually asked for, and the deck's height is asserted with each of them -- a plate inside
   its range that got there by squeezing the answer would be the same failure wearing a
   different number. */
console.log("\n[aperture] and it lands inside the stated range at each target viewport");
const TARGETS = [
  [1440, 900, 490, 510],
  [1600, 900, 530, 550],
  [1920, 1080, 700, 715],
  [2560, 1080, 710, 730],
  [3440, 1440, 1070, 1090],
];
for (const [w, h, lo, hi] of TARGETS) {
  await open("", w, h);
  const m = await measure();
  ok(`${String(w + "x" + h).padEnd(10)} plate ${m.h}px, wanted ${lo || "≤"}–${hi}`,
     m.h >= lo - 1 && m.h <= hi + 1, `${m.h}px is outside [${lo}, ${hi}]`);
  ok(`${String(w + "x" + h).padEnd(10)} the deck got the rest — ${m.evidence}px`,
     m.evidence >= 292, `evidence fell to ${m.evidence}px`);
}

/* THE STATES THAT MOVE BOTH TERMS. A docked inspector narrows the plate; a transport shortens
   it. Both change the aspect, and the bound has to hold through both. */
console.log("\n[aperture] and through the states that change the plate's box");
{
  await open("", 1440, 900);
  const sid = await page.evaluate(() => {
    const a = globalThis.__ATLAS.archive;
    for (let i = 0; i < a.nStorms; i++) {
      const s = a.storm(i);
      if (s && s.name && s.max_category && s.landfalls && s.landfalls.length) return s.storm_id;
    }
    return null;
  });
  ok("a storm with landfalls exists to select", !!sid);
  if (sid) {
    for (const [w, h] of [[1440, 900], [1280, 800], [1920, 900]]) {
      await open(`storm=${sid}`, w, h);
      const m = await measure();
      /* THE BOUNDS HOLD WITH THE INSPECTOR OPEN, AND THE PLATE DOES NOT NARROW FOR IT. The dock
         OVERLAYS the plate rather than taking a column from it: beside a 486px ledger a resident
         380px dock would leave 414px of map, narrower than a track needs to be judgeable and
         bought out of the one element whose job is to be large. So the aperture is unchanged by
         a selection, and that is asserted rather than assumed. */
      ok(`${String(w + "x" + h).padEnd(10)} selected storm — plate ${m.w}x${m.h}, aspect ${m.ar.toFixed(3)}`,
         m.docked && m.ar >= FLOOR - 0.002 && m.ar <= CEILING + 0.002,
         m.docked ? `aspect ${m.ar.toFixed(3)} outside [${FLOOR}, ${CEILING}]` : "the inspector did not dock");
      ok(`${String(w + "x" + h).padEnd(10)} selected storm — no blank plane`, m.blank === 0, `${m.blank}px`);
      /* THE RULE THE ROW MODEL RESTS ON, STATED AS IT ACTUALLY HOLDS.
       *
       * A transport appears with a subject and its height should come out of the PLATE, not the
       * answer -- but that is only possible while the plate has slack above its aspect floor.
       * At a wide, short viewport with the inspector docked, three things cannot all be true:
       * the plate is inside 3.2, the deck keeps 340px, and the viewport is 900px tall. Measured
       * at 1920x900: the plate's floor is 1540/3.2 = 481, the ideal is 412, so the ceiling wins
       * and the deck yields 69px.
       *
       * THAT IS THE SPECIFICATION'S OWN PRIORITY, not a compromise: the bound is hard ("enforced
       * in the fit function"), and the deck is the soft one ("340 fixed; ROWS DROP, never
       * shrink"). So the assertion is not "the deck keeps its height" -- it is the invariant the
       * deck actually promises: whatever height it has, its ROWS are never compressed to fit.
       *
       * The first version of this check asserted a flat 292px floor and failed here. The layout
       * was right and the assertion was wrong, which is worth leaving written down. */
      const rows = await page.evaluate(() => {
        const rs = [...document.querySelectorAll("[data-outcome] .at-dc-outcome")];
        return rs.map((r) => Math.round(r.getBoundingClientRect().height));
      });
      ok(`${String(w + "x" + h).padEnd(10)} the deck drops rows rather than compressing them`,
         rows.length > 0 && rows.every((x) => x >= 20),
         `shortest row ${Math.min(...rows)}px against a 20px floor — rows were squeezed`);

      /* AND THE LEDGER NEVER PAYS FOR THE PLATE. This used to be conditional -- the deck could
         only keep its height while the plate had slack above its aspect floor, because the two
         shared one column of vertical space. They do not any more: the ledger is a track of its
         own, full height, and a transport or a selection comes out of the plate's row. So the
         assertion is unconditional now, which is the strongest form this check has ever had. */
      ok(`${String(w + "x" + h).padEnd(10)} the ledger kept its height`, m.evidence >= 292,
         `evidence fell to ${m.evidence}px with the inspector open`);
    }
  }
}

ok("no page errors in any state", errors.length === 0, errors.slice(0, 3).join("\n"));

/* ── seeded regressions ──────────────────────────────────────────────────────────────────── */
if (process.argv.includes("--self-test")) {
  console.log("\n[aperture] seeded regressions — each must break a bound and be caught");

  /* Each seed replaces the row model with one that omits a term, at the viewport where that
     term is what holds the bound. A seed that does not actually move the aspect out of range is
     reported as unchecked rather than counted as a pass. */
  const SEEDS = [
    /* THE FLOOR IS THE ONE THE APERTURE DEPENDS ON, so it is seeded two ways: dropped to the
       value it used to hold, and removed outright. The first is the exact regression a reader of
       the old file would introduce by "restoring" a number they remembered. */
    { name: "the floor dropped back to 1.421 — a tall workstation crops a research corridor",
      at: [1440, 2000],
      css: "[data-atlas].atlas-shell.atlas-instrument{--at-plate-ar:1.421!important}",
      broke: (m) => m.ar < FLOOR - 0.002 },
    /* THE SEED IS THE SAME REGRESSION, WRITTEN AGAINST THE DECLARATION THAT NOW CARRIES THE
       BOUND. It used to be `max-height:none`, because the plate had no height of its own -- it
       grew into its column and `max-height` was the only thing stopping it. UX-1B gave it a
       declared `height:calc(avail/ar)` and moved the viewport's share to a cap on the figure
       COLUMN, so `max-height:none` now removes nothing and the seed would have passed by doing
       nothing at all. Handing the plate the column's whole declared height is the same defect in
       the new shape: the floor gone, and every pixel a tall viewport has going to the map. */
    { name: "the floor removed — the plate takes every pixel a tall viewport has",
      at: [1440, 2000],
      css: `[data-atlas].atlas-instrument .atlas-stage{
              flex:none!important;height:var(--at-stage-col-h)!important}`,
      broke: (m) => m.ar < FLOOR - 0.002 },
    { name: "the ceiling dropped — a wide, short workstation goes panoramic",
      at: [1920, 900],
      css: `[data-atlas].atlas-instrument .atlas-stage{
              min-height:0!important;max-height:200px!important}`,
      broke: (m) => m.ar > CEILING + 0.002 },
    /* THE LEDGER MEASURE IS A BOUND ON THE PLATE NOW, and this is the seed that says so: a
       ledger widened to make a cramped table fit takes the plate off the frozen box, and nothing
       in the aspect envelope notices, because the aspect is a shape and this is a width. */
    { name: "the ledger widened — the plate leaves the frozen 834px box",
      at: [1440, 900],
      css: "[data-atlas].atlas-shell.atlas-instrument{--at-ledger:640px!important}",
      broke: (m) => m.w !== 834 },
    { name: "the instrument capped and centred — the aspect holds but blank plane returns",
      at: [1440, 1600],
      css: `[data-atlas].atlas-shell.atlas-instrument{padding-block:120px!important}`,
      broke: (m) => m.blank !== 0 },
  ];

  for (const seed of SEEDS) {
    await open("", seed.at[0], seed.at[1]);
    await page.addStyleTag({ content: seed.css });
    await page.waitForTimeout(400);
    const m = await measure();
    ok(`${seed.name} @ ${seed.at[0]}x${seed.at[1]}`, seed.broke(m),
       `aspect ${m.ar.toFixed(3)}, blank ${m.blank}px — the seed did not move the property out of `
       + "range, so this bound is going unchecked");
  }

  console.log("\n[aperture] and a change that moves nothing is not a failure");
  {
    await open("", 1440, 900);
    await page.addStyleTag({ content: "[data-atlas] .at-deck{letter-spacing:0}" });
    await page.waitForTimeout(300);
    const m = await measure();
    ok("an unrelated style change leaves the bound intact",
       m.ar >= FLOOR - 0.002 && m.ar <= CEILING + 0.002 && m.blank === 0,
       `aspect ${m.ar.toFixed(3)}, blank ${m.blank}`);
  }
}

await browser.close();
server.close();

console.log(failures === 0
  ? "\nthe plate is bounded at both ends, in every state, with no blank plane"
  : `\n${failures} aperture check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
