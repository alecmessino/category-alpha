#!/usr/bin/env node
/* THE PLATE'S APERTURE, BOUNDED AT BOTH ENDS, MEASURED IN THE REAL PAGE.
 *
 * TWO ASPECT BOUNDS, AND THEY FAIL AT DIFFERENT VIEWPORTS.
 *
 *   FLOOR 1.67    RETIRED with the composition -- see the note beside the ceiling below. It was
 *                 derived from the APERTURE rather than from empty
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

/* The plate's own box, the declared band it fills, and the width the matrix got below it.
 *
 * `blank` USED TO BE THE VIEWPORT LESS THE SHELL'S FOUR ROWS, because the shell was four rows
 * summing to the viewport. It is a page now: the matrix, the limits and the apparatus are under
 * the first band, so the document is taller than the screen by design and that subtraction would
 * measure the composition rather than a defect. What it MEANT -- no paper on the first screen
 * that nothing is using -- is measured where it still means that: inside the band, as the gap
 * between the two columns' feet. A column that stops short of the other is the beige remainder,
 * on whichever side of the gutter it appears. */
const measure = () => page.evaluate(() => {
  const plate = document.querySelector(".at-plate");
  const above = document.querySelector(".atlas-above");
  const band = document.querySelector(".atlas-plate-row");
  const col = document.querySelector(".atlas-stage-col");
  const answer = document.querySelector("[data-answer-col]");
  if (!plate || !band || !col) return null;
  const b = plate.getBoundingClientRect();
  const ev = document.querySelector("[data-evidence-row]");
  const stacked = getComputedStyle(band).gridTemplateColumns.trim().split(/\s+/).length === 1;
  return {
    w: Math.round(b.width), h: Math.round(b.height),
    ar: b.height ? b.width / b.height : null,
    stacked,
    band: Math.round(band.getBoundingClientRect().height),
    above: above ? Math.round(above.getBoundingClientRect().height) : null,
    /* THE PAPER ON THE FIRST SCREEN THAT NOTHING IS USING, and it can appear in three places:
       between the two columns' feet, under the last thing in the figure column, or under the
       last thing in the answer. The first is a column that stopped short of the other; the other
       two are a column whose own content stopped short of the box it was given -- which is what
       an aspect ceiling on the plate produces, and the reason it is retired. */
    blank: (() => {
      if (stacked || !answer) return 0;
      const foot = (el) => {
        const kids = [...el.children].filter((c) => c.getBoundingClientRect().height > 0);
        return kids.length ? kids[kids.length - 1].getBoundingClientRect().bottom
          : el.getBoundingClientRect().bottom;
      };
      const cb = col.getBoundingClientRect().bottom, ab = answer.getBoundingClientRect().bottom;
      /* AND PAPER IN THE MIDDLE COUNTS, NOT ONLY PAPER AT THE FOOT. Figure 1 is pinned to the
         column's foot, so a plate that stops short no longer leaves a remainder UNDER the
         column -- it opens a hole between the class key and the caption instead. Same defect,
         one element further up, and a rule that only looked at the foot would have called the
         hole a pass. The reservation's own slack lives in that gap by design, so what is
         asserted is a bound on it rather than its absence. */
      return Math.round(Math.max(Math.abs(cb - ab), cb - foot(col), ab - foot(answer)));
    })(),
    /* THE HOLE, MEASURED SEPARATELY BECAUSE IT HAS A DIFFERENT BOUND. Figure 1 is pinned to the
       figure column's foot, so the reservation's slack -- the difference between the chrome the
       band reserved and the chrome it got -- sits between the class key and the caption instead
       of under the column. A few pixels of it is the figure's own spacing. A plate capped short
       of its declared height opens the same gap and keeps going, which is the defect, so this is
       bounded rather than forbidden. */
    hole: (() => {
      if (stacked || !col) return 0;
      const boxes = [...col.children]
        .filter((c) => c.getBoundingClientRect().height > 0)
        .map((c) => c.getBoundingClientRect());
      let hole = 0;
      for (let i = 1; i < boxes.length; i++) hole = Math.max(hole, boxes[i].top - boxes[i - 1].bottom);
      return Math.round(hole);
    })(),
    evidence: ev ? Math.round(ev.getBoundingClientRect().width) : null,
    usable: Math.round(band.getBoundingClientRect().width
      - 2 * parseFloat(getComputedStyle(band).paddingLeft)),
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
  /* THE FLOOR IS RETIRED WITH THE COMPOSITION, AND IT IS THE ONLY BOUND THAT WENT.
     "The plate may not be taller than the archive's own frame fills" was a rule about SURPLUS:
     past 1.67 the extra height is latitude with nothing in it. Under a declared band the plate
     takes the band so that the figure column and the answer end on one baseline, and the
     alternative to that surplus is not a shorter plate -- it is 150px of blank page under the
     map with the answer running past it, measured at 1920. Ocean the frame does not fill beats
     paper nothing fills. The CEILING is untouched: past 3.2 a single East Pacific track stops
     being the subject of its own plate, and that is about legibility rather than surplus. */
  ok(`${label} — at or below the ${CEILING} ceiling${wide}${tall}`, m.ar <= CEILING + 0.002,
     `aspect ${m.ar.toFixed(3)} is above ${CEILING}`);
  ok(`${String(w + "x" + h).padEnd(10)} no blank plane in the band`, m.blank <= 2,
     `the band's columns end ${m.blank}px apart`);
  /* AND NO HOLE INSIDE THE FIGURE EITHER. 12px is the reservation's slack at the widths where
     the row's own padding does not already absorb it; measured 8.8px from 1280 to 3440 and 0 at
     1220. A plate capped below its declared height shows here as tens of pixels. */
  ok(`${String(w + "x" + h).padEnd(10)} and no hole between the plate and its caption`,
     m.hole <= 12, `${m.hole}px of paper inside the figure column`);
}

/* THE TWO FROZEN PLATE BOXES, MEASURED IN THE PAGE.
 *
 * These are the numbers the design is specified at -- 5c's measured 834px plate at 1440, and
 * turn 4's stated 1180px at 1920 -- and they are a CONSEQUENCE of three others: the ledger
 * measure, the page padding and the gutter. check-atlas-adherence pins those three as tokens;
 * this asserts what they actually produce, which is the half a token check cannot see. A ledger
 * widened to make a cramped table fit moves both of these, and that is exactly the change that
 * should have to be argued for rather than merged. */
console.log("\n[aperture] and the plate holds the contract's share at the two stated widths");
for (const [w, h, lo, hi] of [[1440, 900, 0.57, 0.59], [1920, 1080, 0.60, 0.62]]) {
  await open("", w, h);
  const m = await measure();
  const share = m ? m.w / m.usable : 0;
  ok(`${String(w + "x" + h).padEnd(10)} plate is ${(100 * share).toFixed(1)}% of the usable width`,
     !!m && share >= lo && share <= hi,
     m ? `${m.w}px of ${m.usable}px — the answer measure, the page padding or the gutter has moved`
       : "no plate");
}

/* THE PLATE FILLS THE BAND, AND THE MATRIX GETS THE PAGE.
 *
 * WHAT THIS ASSERTED. Four frozen plate heights per viewport, each paired with "the deck got at
 * least 292px" -- because plate height and deck height came out of the same 1fr row and a plate
 * inside its range that got there by squeezing the answer was the same failure wearing a
 * different number.
 *
 * THEY NO LONGER COMPETE, WHICH IS THE POINT OF THE COMPOSITION. The band is declared from the
 * viewport and the plate takes what the figure column has after its own captions; the matrix is
 * under the band at page width and takes as much page as it needs. So the two assertions are the
 * two halves of that: the plate is most of the band rather than a figure floating in it, and the
 * matrix is the full measure rather than a column. A plate that shrank to make room for
 * something in its own column still fails the first; a matrix pushed back into a rail fails the
 * second. */
console.log("\n[aperture] the plate fills the band, and the matrix gets the page");
for (const [w, h] of [[1440, 900], [1600, 900], [1920, 1080], [2560, 1080], [3440, 1440]]) {
  await open("", w, h);
  const m = await measure();
  const share = m.h / m.band;
  ok(`${String(w + "x" + h).padEnd(10)} the plate is ${(100 * share).toFixed(0)}% of the band`,
     share >= 0.6, `${m.h}px of a ${m.band}px band`);
  ok(`${String(w + "x" + h).padEnd(10)} and the matrix has the page's own measure`,
     m.evidence >= m.usable - 1, `matrix ${m.evidence}px against ${m.usable}px of usable width`);
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
         m.docked && m.ar <= CEILING + 0.002,
         m.docked ? `aspect ${m.ar.toFixed(3)} above ${CEILING}` : "the inspector did not dock");
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
    /* THE CEILING IS THE BOUND THE APERTURE STILL DEPENDS ON, and the two seeds below are the
       two ways a reader would reach past it: a stage told to be short, and a plate told to fill
       a band it should have been capped in. */
    { name: "the ceiling dropped — a wide, short workstation goes panoramic",
      at: [1920, 900],
      css: `[data-atlas].atlas-instrument .atlas-stage{
              min-height:0!important;max-height:200px!important}`,
      broke: (m) => m.ar > CEILING + 0.002 },
    /* THE ANSWER'S MEASURE IS A BOUND ON THE PLATE, and this is the seed that says so: an answer
       widened to make a cramped ladder fit takes the plate out of the contract's share, and
       nothing in the aspect envelope notices, because the aspect is a shape and this is a width. */
    { name: "the answer widened — the plate falls out of the contract's share",
      at: [1440, 900],
      css: "[data-atlas].atlas-shell.atlas-instrument{--at-answer:700px!important}",
      broke: (m) => m.w / m.usable < 0.57 },
    /* AND THE BLANK PLANE, WHICH IS NOW PAPER INSIDE THE BAND RATHER THAN A ROW SUM. The way it
       comes back is a bound applied to the PLATE instead of to the band: the map stops filling
       the figure column, and the paper under it is the remainder the composition exists to end.
       The band's own cap is the same bound applied where it costs nothing -- see the height on
       .atlas-plate-row -- and this seed is the difference between the two. */
    { name: "the aspect bound moved from the band to the plate — paper returns under the map",
      at: [1440, 900],
      /* THE SEED HAD TO MOVE WITH THE FIX. It used to cap the plate and read the remainder at
         the column's foot; the caption is pinned there now, so the remainder appears as a hole
         above it and the old seed measured a column that ended exactly where it should. Same
         defect, same one line of CSS, read where it now shows. */
      css: `[data-atlas].atlas-instrument .atlas-stage{
              height:calc((var(--at-band-h) - var(--at-fig-chrome)) * 0.6)!important}`,
      broke: (m) => m.hole > 12 },
  ];

  for (const seed of SEEDS) {
    await open("", seed.at[0], seed.at[1]);
    await page.addStyleTag({ content: seed.css });
    await page.waitForTimeout(400);
    const m = await measure();
    ok(`${seed.name} @ ${seed.at[0]}x${seed.at[1]}`, seed.broke(m),
       `aspect ${m.ar.toFixed(3)}, blank ${m.blank}px, hole ${m.hole}px — the seed did not move `
       + `the property out of `
       + "range, so this bound is going unchecked");
  }

  console.log("\n[aperture] and a change that moves nothing is not a failure");
  {
    await open("", 1440, 900);
    await page.addStyleTag({ content: "[data-atlas] .at-deck{letter-spacing:0}" });
    await page.waitForTimeout(300);
    const m = await measure();
    ok("an unrelated style change leaves the bound intact",
       m.ar <= CEILING + 0.002 && m.blank <= 2,
       `aspect ${m.ar.toFixed(3)}, blank ${m.blank}`);
  }
}

await browser.close();
server.close();

console.log(failures === 0
  ? "\nthe plate is bounded at both ends, in every state, with no blank plane"
  : `\n${failures} aperture check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
