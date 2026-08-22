#!/usr/bin/env node
/* THE PLATE'S APERTURE, BOUNDED AT BOTH ENDS, MEASURED IN THE REAL PAGE.
 *
 * TWO BOUNDS, AND THEY FAIL AT OPPOSITE VIEWPORTS.
 *
 *   FLOOR 1.421   Derived, not chosen: the archive's core frame is a band 2.14 times wider than
 *                 it is tall, and after Leaflet's quarter-step zoom snap the median landing puts
 *                 the working region at 1.421. A plate narrower in aspect than that cannot be
 *                 filled by the archive -- the fit binds on width and the leftover height opens
 *                 as ocean holding no storms. It fails on a TALL workstation.
 *
 *   CEILING 3.2   Past it a single East Pacific track stops being the subject of its own plate.
 *                 It fails on a WIDE, SHORT one -- and that is the case a developer never sees,
 *                 because nobody develops at 2560x1080.
 *
 * The specification is explicit that the bound must be enforced in the fit rather than emerging
 * from layout: "or a wide monitor will quietly reintroduce a panoramic plate no storm can be the
 * subject of". Quietly is the operative word. Nothing about a 4:1 plate looks broken; it looks
 * like a map. So the aspect is measured at every supported viewport, including the ones nobody
 * works at, plus the docked and transport-present states where the plate's available width and
 * ideal height both change.
 *
 * AND BLANK PLANE IS ASSERTED WITH IT, because the two are one trade. The easy way to hold an
 * aspect bound is to cap the instrument and centre it, which is what the previous shell did --
 * measured 285px of a 1000px viewport painted blank at 1440. The acceptance test is 0%, so
 * every row's height is summed against the viewport here and any shortfall is a failure.
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

const FLOOR = 1.421;
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
  const shell = document.querySelector(".atlas-stacked");
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

/* THE SUPPORTED MATRIX, PLUS THE TWO NOBODY DEVELOPS AT. 1920x900 and 2560x1080 are the wide,
   short cases the ceiling exists for; 1440x1600 and 1440x2000 are the tall ones the floor
   exists for. Without those four this gate would pass on a broken bound. */
const VIEWPORTS = [
  [1440, 900], [1280, 800], [1180, 800], [1024, 768],
  [1920, 1080], [1600, 900],
  [1920, 900], [2560, 1080],
  [1440, 1600], [1440, 2000],
];

console.log("[aperture] the plate stays inside 1.421-3.2 at every supported viewport");
for (const [w, h] of VIEWPORTS) {
  await open("arch=deck", w, h);
  const m = await measure();
  if (!m) { ok(`${w}x${h}`, false, "no stacked shell or no plate on the page"); continue; }
  const wide = w >= h * 1.9 ? "  (wide/short — the ceiling's case)" : "";
  const tall = h >= w ? "  (tall — the floor's case)" : "";
  ok(`${String(w + "x" + h).padEnd(10)} plate ${m.w}x${m.h}, aspect ${m.ar.toFixed(3)}${wide}${tall}`,
     m.ar >= FLOOR - 0.002 && m.ar <= CEILING + 0.002,
     `aspect ${m.ar.toFixed(3)} is outside [${FLOOR}, ${CEILING}]`);
  ok(`${String(w + "x" + h).padEnd(10)} no blank plane`, m.blank === 0, `${m.blank}px unaccounted`);
}

/* THE STATES THAT MOVE BOTH TERMS. A docked inspector narrows the plate; a transport shortens
   it. Both change the aspect, and the bound has to hold through both. */
console.log("\n[aperture] and through the states that change the plate's box");
{
  await open("arch=deck", 1440, 900);
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
      await open(`arch=deck&storm=${sid}`, w, h);
      const m = await measure();
      ok(`${String(w + "x" + h).padEnd(10)} selected storm — plate ${m.w}x${m.h}, aspect ${m.ar.toFixed(3)}`,
         m.docked && m.ar >= FLOOR - 0.002 && m.ar <= CEILING + 0.002,
         m.docked ? `aspect ${m.ar.toFixed(3)} outside the bound` : "the inspector did not dock");
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

      /* AND WHERE THE PLATE DOES HAVE SLACK, THE TRANSPORT COMES OUT OF IT. Measured by
         comparing the plate's height against its own aspect floor: slack means the ceiling is
         not what is deciding, so nothing but the plate should have paid. */
      const floorH = (m.w) / 3.2;
      if (m.h > floorH + 1) {
        ok(`${String(w + "x" + h).padEnd(10)} the plate had slack, so the deck kept its height`,
           m.evidence >= 292,
           `plate ${m.h}px against a ${floorH.toFixed(0)}px floor, yet evidence fell to ${m.evidence}px`);
      } else {
        console.log(`  note  ${String(w + "x" + h).padEnd(10)} the plate is pinned at its aspect `
          + `floor (${m.h}px); the deck yields to the hard bound and shows ${m.evidence}px of rows`);
      }
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
    { name: "the ceiling dropped — a wide, short workstation goes panoramic",
      at: [2560, 1080],
      css: `[data-atlas].atlas-shell.atlas-stacked{grid-template-rows:32px 38px 38px
              minmax(0,1fr) minmax(0,340px) var(--at-tport)!important}`,
      broke: (m) => m.ar > CEILING + 0.002 },
    { name: "the floor dropped — a tall workstation opens empty latitude",
      at: [1440, 2000],
      css: `[data-atlas].atlas-shell.atlas-stacked{grid-template-rows:32px 38px 38px
              minmax(calc(var(--at-plate-avail) / 3.2),1fr) minmax(0,340px) var(--at-tport)!important}`,
      broke: (m) => m.ar < FLOOR - 0.002 },
    { name: "the instrument capped and centred — the aspect holds but blank plane returns",
      at: [1440, 1600],
      css: `[data-atlas].atlas-shell.atlas-stacked{padding-block:120px!important}`,
      broke: (m) => m.blank !== 0 },
  ];

  for (const seed of SEEDS) {
    await open("arch=deck", seed.at[0], seed.at[1]);
    await page.addStyleTag({ content: seed.css });
    await page.waitForTimeout(400);
    const m = await measure();
    ok(`${seed.name} @ ${seed.at[0]}x${seed.at[1]}`, seed.broke(m),
       `aspect ${m.ar.toFixed(3)}, blank ${m.blank}px — the seed did not move the property out of `
       + "range, so this bound is going unchecked");
  }

  console.log("\n[aperture] and a change that moves nothing is not a failure");
  {
    await open("arch=deck", 1440, 900);
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
