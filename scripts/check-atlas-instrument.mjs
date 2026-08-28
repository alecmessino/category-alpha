#!/usr/bin/env node
/* THE RESTING INSTRUMENT, AGAINST THE FROZEN FRAME, MEASURED IN THE REAL PAGE.
 *
 * WHAT THIS OWNS THAT NOTHING ELSE DOES. The other browser gates each hold one property across
 * every state: the aperture's bounds, the camera's persistence, every word's contrast, every
 * refusal's reachability. None of them asserts the RESTING SCREEN's own composition, and that
 * composition is a specification -- `5c · Minimal Research Instrument` -- with numbers in it.
 *
 * The five things below are the ones a layout change is most likely to lose quietly, in the
 * order they would be lost:
 *
 *   1  THE HIERARCHY.       The question dominates the page. A 30px serif sentence with the
 *                           cohort stated once beneath it, and no second rendering of the same
 *                           count anywhere in the head.
 *   2  THE PLATE.           One uninterrupted rectangle. Its metadata is set in PAPER above and
 *                           below it, aligned to its edges, and resolves paper ink -- a caption
 *                           left inside the dark subtree would be near-white on near-white.
 *   3  THE CLASS KEY.       Present wherever class-coloured tracks are, drawn from the plate's
 *                           OWN palette, with the major classes carrying extra stroke.
 *   4  THE SCALE BAR.       COMPUTED FROM THE RENDERED PLATE BOX, and geographically correct.
 *                           This is the one the frozen handoff singles out: a scale bar stored
 *                           as a constant is a measurement of a mock, and it is wrong on every
 *                           screen that is not the mock. So it is checked as GEOMETRY -- the
 *                           projection's own distance across the bar's pixels against the
 *                           distance the bar claims -- at every width, after a resize, and after
 *                           a zoom.
 *   5  THE LEDGER'S ENDS.   The column heads pinned to the top and the limits pinned to the
 *                           foot, so what the columns are and what the record does not hold are
 *                           on screen at every scroll position.
 *
 * Run: node scripts/check-atlas-instrument.mjs [--require-browser]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const DOCS = join(ROOT, "docs");

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
    ? "[instrument] playwright is absent and --require-browser was given"
    : "[instrument] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

/* THE PLATE'S OWN PALETTE, READ FROM THE RENDERER RATHER THAN RESTATED. A key drawn in colours
   this file typed would prove the key matches this file; what has to hold is that it matches the
   cartography, so the table comes out of the module the tracks are drawn from. */
const paletteSrc = await readFile(join(ROOT, "docs/storm-atlas/src/render/palette.js"), "utf8");
const CATEGORY_COLOR = Object.fromEntries(
  [...paletteSrc.slice(paletteSrc.indexOf("CATEGORY_COLOR"), paletteSrc.indexOf("CATEGORY_ORDER"))
    .matchAll(/\b(td|ts|cat[1-5])\s*:\s*"(#[0-9a-f]{6})"/gi)]
    .map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]),
);
const MAJOR_FROM = Number((paletteSrc.match(/MAJOR_FROM\s*=\s*(\d+)/) || [])[1]);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml",
  ".gz": "application/octet-stream", ".geojson": "application/json" };
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
  await page.waitForTimeout(1000);
};

/* THE FIVE WIDTHS THE FROZEN RESPONSIVE CONTRACT NAMES, and 390 with them. 900 is the boundary
   the side-by-side instrument holds down to; 768 and 760 are the stacked pair either side of it,
   which exist as two entries because a rule tested only at its own breakpoint proves the rule
   fires, not that the layout inside the band works. */
const WIDTHS = [[1920, 1080], [1440, 900], [900, 900], [768, 1024], [760, 1024], [390, 844]];

/* ── 1 · THE HIERARCHY ──────────────────────────────────────────────────────────────────── */
console.log("[instrument] the question dominates, and the cohort is stated once");
for (const [w, h] of WIDTHS) {
  await open("", w, h);
  const d = await page.evaluate(() => {
    const q = document.querySelector("[data-question]");
    const line = document.querySelector("[data-cohort-line]");
    const head = document.querySelector("[data-condition-strip]");
    const n = document.querySelector("[data-cohort-size]");
    if (!q || !line || !head || !n) return null;
    const size = (el) => parseFloat(getComputedStyle(el).fontSize);
    const count = (n.textContent || "").trim();
    return {
      question: size(q), cohort: size(line),
      family: getComputedStyle(q).fontFamily,
      below: line.getBoundingClientRect().top >= q.getBoundingClientRect().bottom - 1,
      repeats: ((head.textContent || "").match(new RegExp(count.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
      /* THE QUESTION IS THE FIRST THING ON THE SURFACE. The identity strip that used to open it
         is the colophon at the foot; anything else above the question is chrome that came back. */
      firstText: (() => {
        const shell = document.querySelector(".atlas-instrument");
        const first = shell && shell.firstElementChild;
        return first ? first.className.split(" ")[0] : null;
      })(),
      clauses: document.querySelectorAll("[data-question] [data-zone-edit]").length,
    };
  });
  const at = `${w}x${h}`;
  ok(`${at.padEnd(9)} the head renders a question and a cohort line`, !!d);
  if (!d) continue;
  const wantQ = w <= 480 ? 24 : 30;
  ok(`${at.padEnd(9)} the question is ${wantQ}px serif`,
     d.question === wantQ && /Source Serif/.test(d.family), `${d.question}px ${d.family}`);
  ok(`${at.padEnd(9)} and dominates the line beneath it`, d.question >= 2 * d.cohort,
     `question ${d.question}px against cohort ${d.cohort}px`);
  ok(`${at.padEnd(9)} which sits below it`, d.below);
  ok(`${at.padEnd(9)} the cohort count is stated exactly once in the head`, d.repeats === 1,
     `${d.repeats} renderings`);
  ok(`${at.padEnd(9)} the question is the first thing on the surface`, d.firstText === "at-head",
     `the surface opens with .${d.firstText}`);
  /* BOTH UNSET SIDES ARE PRESSABLE IN THE SENTENCE, which is the move that retired the strip. */
  ok(`${at.padEnd(9)} both sides are pressable clauses in the sentence`, d.clauses >= 2,
     `${d.clauses} clause controls in the question`);
}

/* ── 2 · THE PLATE, AND THE PAPER SET AROUND IT ─────────────────────────────────────────── */
console.log("\n[instrument] the plate is one uninterrupted rectangle, set in paper");
for (const [w, h] of WIDTHS) {
  await open("", w, h);
  const d = await page.evaluate(() => {
    const plate = document.querySelector(".at-plate");
    const head = document.querySelector(".at-platehead");
    const foot = document.querySelector(".at-platefoot");
    const fig = document.querySelector(".at-plate-figure");
    const stage = document.querySelector(".atlas-stage");
    if (!plate || !head || !foot || !fig || !stage) return null;
    const b = plate.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
    const lum = (c) => {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
      if (!m) return null;
      const f = [1, 2, 3].map((i) => { const v = Number(m[i]) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };
    return {
      /* NOTHING OF THE CAPTION SET OVERLAPS THE PLATE. The bands used to be strips of chrome laid
         over the cartography; 5c's first move is to take both off. */
      headAbove: box(head).b <= b.top + 1,
      footBelow: box(foot).t >= b.bottom - 1,
      figBelow: box(fig).t >= b.bottom - 1,
      /* ALIGNED TO THE PLATE'S OWN EDGES, which is what makes them read as its caption rather
         than as text floating on the page. */
      aligned: Math.abs(box(head).l - b.left) <= 1 && Math.abs(box(foot).l - b.left) <= 1
        && Math.abs(box(fig).l - b.left) <= 1,
      /* AND THEY RESOLVE PAPER INK. The stage re-declares the whole dark ramp for its own
         subtree, so a caption left inside it would be near-white on near-white paper. */
      captionInk: lum(getComputedStyle(foot).color),
      plateGround: lum(getComputedStyle(plate).backgroundColor),
      shellGround: lum(getComputedStyle(document.querySelector(".atlas-instrument")).backgroundColor),
      stageHoldsOnlyPlate: [...stage.children].every((c) => c.classList.contains("at-plate")),
      caption: (document.querySelector("[data-plate-caption]") || {}).textContent || "",
    };
  });
  const at = `${w}x${h}`;
  ok(`${at.padEnd(9)} the plate has a paper set above and below it`, !!d);
  if (!d) continue;
  ok(`${at.padEnd(9)} no caption sits on the cartography`,
     d.headAbove && d.footBelow && d.figBelow,
     `head above ${d.headAbove}, measure below ${d.footBelow}, figure below ${d.figBelow}`);
  ok(`${at.padEnd(9)} and every one is aligned to the plate's edge`, d.aligned);
  ok(`${at.padEnd(9)} the stage wraps the rectangle and nothing else`, d.stageHoldsOnlyPlate);
  /* THE PLATE IS DARK IN BOTH SHELLS AND THE SHELL IT SITS IN IS PAPER: the two grounds must be
     on opposite sides of the middle, and the caption must be readable on the paper one. */
  ok(`${at.padEnd(9)} the plate is dark inside a paper shell`,
     d.plateGround < 0.2 && d.shellGround > 0.6,
     `plate luminance ${d.plateGround}, shell ${d.shellGround}`);
  ok(`${at.padEnd(9)} and the caption resolves paper ink, not the plate's`,
     d.captionInk !== null && d.captionInk < 0.3,
     `caption luminance ${d.captionInk} on a ${d.shellGround} ground`);
  /* FIGURE 1 SAYS WHAT IS DRAWN, which is what turns a map into a figure. */
  ok(`${at.padEnd(9)} Figure 1 names the ink, the regions and the gestures`,
     /^Figure 1\./.test(d.caption.trim())
     && /coloured by the class/.test(d.caption)
     && /Five modelled landfall regions|Contextual coastline only/.test(d.caption)
     && /Click any ocean point/.test(d.caption),
     d.caption.replace(/\s+/g, " ").slice(0, 120));
}

/* ── 3 · THE CLASS KEY ──────────────────────────────────────────────────────────────────── */
console.log("\n[instrument] the class key is present wherever class-coloured tracks are");
for (const [w, h] of WIDTHS) {
  await open("", w, h);
  const d = await page.evaluate(() => {
    const key = document.querySelector("[data-class-key]");
    if (!key) return null;
    const sw = [...key.querySelectorAll("[data-class]")].map((i) => ({
      cls: i.getAttribute("data-class"),
      ink: getComputedStyle(i).backgroundColor,
      h: Math.round(parseFloat(getComputedStyle(i).height)),
    }));
    const r = key.getBoundingClientRect();
    const note = key.querySelector(".at-classkey-major");
    return {
      classes: sw, text: (key.textContent || "").replace(/\s+/g, " ").trim(),
      onScreen: r.width > 0 && r.height > 0 && r.top >= -1 && r.bottom <= innerHeight + 1,
      size: parseFloat(getComputedStyle(key).fontSize),
      noteCut: !!note && note.scrollWidth > note.clientWidth + 1,
    };
  });
  const at = `${w}x${h}`;
  ok(`${at.padEnd(9)} the key is on screen`, !!d && d.onScreen);
  if (!d) continue;
  const want = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];
  ok(`${at.padEnd(9)} it names all seven classes, in the plate's order`,
     JSON.stringify(d.classes.map((c) => c.cls)) === JSON.stringify(want),
     d.classes.map((c) => c.cls).join(","));
  /* THE INK IS THE PLATE'S OWN. A key drawn in the paper ramp would be a key to a map nobody is
     looking at; the swatch carries the stage's ground with it so the cartographic ink is legible
     on paper without being changed. */
  const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
  const wrong = d.classes.filter((c) => c.ink !== rgb(CATEGORY_COLOR[c.cls]));
  ok(`${at.padEnd(9)} every swatch is palette.js's own ink`, wrong.length === 0,
     wrong.map((c) => `${c.cls}: ${c.ink} against ${rgb(CATEGORY_COLOR[c.cls])}`).join(" "));
  /* AND THE MAJORS CARRY EXTRA STROKE, which is how the cat2/cat3 pair -- the one pair a reader
     must never misread -- survives monochrome and colour blindness. */
  /* MAJOR_FROM IS AN INDEX INTO CATEGORY_ORDER, not a count: 4 is the position of cat3, the
     class where a major hurricane begins. Slicing at MAJOR_FROM - 1 would put cat2 among the
     majors, which is precisely the pair this stroke exists to separate. */
  const minor = d.classes.slice(0, MAJOR_FROM);
  const major = d.classes.slice(MAJOR_FROM);
  ok(`${at.padEnd(9)} and the major classes carry extra stroke`,
     major.length === 3 && minor.length === 4 && minor.every((c) => c.h < major[0].h),
     `${minor.map((c) => c.h).join(",")} against ${major.map((c) => c.h).join(",")}`);
  ok(`${at.padEnd(9)} the key says so in words too`, /MAJORS CARRY EXTRA STROKE/.test(d.text));
  /* AND AT THE FRAME'S OWN WIDTHS THE WORDS ARE READ, NOT MERELY PRESENT. The plate foot is one
     line and the note is the lowest-priority thing on it, so below 1440 it gives way to the
     swatches and the measure -- which is the right order, since the swatches ARE the key. At
     1440 and above there is room for all of it, and 1440 is the width 5c was drawn at. */
  if (w >= 1440) {
    ok(`${at.padEnd(9)} and the note is not truncated at the frame's own width`, !d.noteCut);
  } else if (d.noteCut) {
    console.log(`  note  ${at.padEnd(9)} the stroke note gives way to the swatches at this width`);
  }
  ok(`${at.padEnd(9)} and it is subordinate — the frame's smallest step`, d.size === 9.5,
     `${d.size}px`);
}

/* ── 4 · THE SCALE BAR ──────────────────────────────────────────────────────────────────── */
console.log("\n[instrument] the scale bar is computed from the rendered plate, and is correct");

/* THE BAR'S OWN CLAIM, AGAINST THE PROJECTION'S ANSWER FOR THE SAME PIXELS.
 *
 * `m.distance` is the map's own geodesic between two points, so this asks the map how far the
 * bar's rendered width actually is at the plate's centre latitude and compares that with the
 * distance the bar has printed. A bar stored as a constant fails this the moment the plate is
 * any size but the one the constant was measured on -- which is every screen that is not the
 * mock -- and it fails it again on any pan or zoom. */
const scaleTruth = () => page.evaluate(() => {
  const bar = document.querySelector(".at-scalebar i");
  const label = document.querySelector(".at-scalebar em");
  const plate = document.querySelector(".at-plate");
  const m = globalThis.__ATLAS_MAP;
  if (!bar || !label || !m || !plate) return null;
  const px = bar.getBoundingClientRect().width;
  const km = Number((label.textContent || "").replace(/[^\d.]/g, ""));
  const size = m.getSize();
  const y = Math.round(size.y / 2);
  const a = m.containerPointToLatLng([0, y]);
  const b = m.containerPointToLatLng([px, y]);
  return {
    px: Math.round(px * 100) / 100,
    km,
    trueKm: m.distance(a, b) / 1000,
    plateW: Math.round(plate.getBoundingClientRect().width),
    zoom: m.getZoom(),
    lat: Math.round(m.getCenter().lat * 100) / 100,
  };
});

const scaleOk = (label, s) => {
  if (!s) return ok(label, false, "no scale bar on the plate");
  /* ONE PER CENT. The bar's pixel width is rounded to a whole pixel when it is drawn, so at the
     narrowest bar this gate ever sees -- 24px, its own floor -- half a pixel of rounding is 2%.
     The tolerance is stated as the larger of 1% and half a pixel's worth, which is what the
     rounding can actually cost rather than a round number. */
  const tol = Math.max(0.01, 0.5 / s.px) * s.km;
  const near = Math.abs(s.trueKm - s.km) <= tol;
  return ok(label, near,
    `the bar is ${s.px}px and claims ${s.km} km; the projection says ${s.trueKm.toFixed(1)} km `
    + `at ${s.lat}N, zoom ${s.zoom}, plate ${s.plateW}px`);
};

const widths = [];
for (const [w, h] of WIDTHS) {
  await open("", w, h);
  const s = await scaleTruth();
  scaleOk(`${String(w + "x" + h).padEnd(9)} the bar measures what it claims`, s);
  if (s) widths.push({ at: `${w}x${h}`, plate: s.plateW, px: s.px, km: s.km });
}
/* AND IT IS NOT A CONSTANT. Two viewports with different plate widths that produced the same bar
   in the same units would be a bar that had stopped reading the plate. Stated as: the set of
   (plate width -> bar pixels) pairs is not one value repeated. */
{
  const distinct = new Set(widths.map((x) => `${x.px}|${x.km}`));
  ok("the bar is not one stored measurement repeated at every width", distinct.size > 1,
     widths.map((x) => `${x.at}: plate ${x.plate}px -> bar ${x.px}px / ${x.km} km`).join("  "));
  console.log("  note  " + widths.map((x) => `${x.at} plate ${x.plate} bar ${x.px}px ${x.km}km`).join("  ·  "));
}

/* AND IT FOLLOWS THE PLATE AND THE CAMERA, not the page load. A bar computed once at boot passes
   every check above and is wrong the moment a reader resizes their window or zooms in. */
{
  await open("", 1440, 900);
  const before = await scaleTruth();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(900);
  const afterResize = await scaleTruth();
  ok("a resize re-measures the bar",
     before && afterResize && (before.px !== afterResize.px || before.km !== afterResize.km),
     `${before && before.px}px/${before && before.km}km unchanged across a 1440 -> 1920 resize`);
  scaleOk("and the re-measured bar is still correct", afterResize);

  await page.evaluate(() => globalThis.__ATLAS_MAP.setZoom(globalThis.__ATLAS_MAP.getZoom() + 2));
  await page.waitForTimeout(700);
  const afterZoom = await scaleTruth();
  ok("a zoom re-measures it too",
     afterResize && afterZoom && (afterZoom.km !== afterResize.km || afterZoom.px !== afterResize.px),
     `${afterZoom && afterZoom.km} km at both zooms`);
  scaleOk("and it is correct at the new zoom", afterZoom);
}

/* ── 5 · THE LEDGER'S TWO ENDS ──────────────────────────────────────────────────────────── */
console.log("\n[instrument] the ledger's heads and its limits are pinned, at every scroll");
for (const [w, h] of WIDTHS) {
  await open("", w, h);
  const d = await page.evaluate(() => {
    const scroller = innerWidth >= 900
      ? document.querySelector("[data-evidence-row]")
      : document.querySelector(".atlas-instrument");
    const limits = document.querySelector("[data-deck-limits]");
    const head = document.querySelector(".at-deck-head .at-dc-outcome");
    if (!scroller || !limits || !head) return null;
    const vis = (el) => { const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const before = { head: vis(head), limits: vis(limits) };
    scroller.scrollTop = scroller.scrollHeight;
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      res({
        before,
        after: { head: vis(head), limits: vis(limits) },
        scrolled: scroller.scrollTop > 0,
        heads: [...document.querySelectorAll(".at-deck-head .at-dc")].map((e) => e.textContent.trim()),
      });
    })));
  });
  const at = `${w}x${h}`;
  ok(`${at.padEnd(9)} the ledger renders its heads and its limits`, !!d);
  if (!d) continue;
  /* THE LOCKED RESEARCH-TABLE HIERARCHY, IN ORDER. The two conditional columns may follow it;
     what may not happen is the first four being reordered or renamed. */
  ok(`${at.padEnd(9)} the columns are OUTCOME | n / N | RATE | 95% WILSON`,
     JSON.stringify(d.heads.slice(0, 4)) === JSON.stringify(["OUTCOME", "n / N", "RATE", "95% WILSON"]),
     d.heads.join(" | "));
  /* "BOTH ENDS BEFORE ANY SCROLL" IS A CLAIM ABOUT THE LEDGER'S OWN SCROLLER, and below 900
     there isn't one: the instrument stacks, the PAGE becomes the scroll, and the ledger opens
     below a 392px figure and both its captions -- so its head starting under the fold is the
     stacked reading order working, not a pin that failed. What must hold there is the same
     thing in the place it means something, and that is the assertion below: once the reader has
     scrolled to the ledger, the heads and the limits are both on screen. */
  if (w >= 900) {
    ok(`${at.padEnd(9)} both ends are on screen before any scroll`,
       d.before.head && d.before.limits,
       `head ${d.before.head}, limits ${d.before.limits}`);
  } else {
    ok(`${at.padEnd(9)} the limits are pinned to the viewport before any scroll`,
       d.before.limits, `limits ${d.before.limits}`);
  }
  if (d.scrolled) {
    ok(`${at.padEnd(9)} and both are still on screen at the foot of the scroll`,
       d.after.head && d.after.limits,
       `head ${d.after.head}, limits ${d.after.limits}`);
  } else {
    console.log(`  note  ${at.padEnd(9)} the ledger did not need to scroll at this height`);
  }
}

/* ── 5b · AND NOTHING IN IT IS TRUNCATED ────────────────────────────────────────────────── */
/* THE FAILURE THIS EXISTS FOR IS INVISIBLE TO EVERY OTHER GATE IN THE REPOSITORY, INCLUDING THE
 * VALUES SNAPSHOT. `textContent` is complete whether or not a pixel of it reached the reader, so
 * a column head reading `5% WILSON`, an outcome reading `Central Ame…` and a status reading
 * `BASE RATE O…` all pass a content check and all publish something the surface does not mean.
 * At a 486px measure that is not a hypothetical: it happened three times while this frame was
 * being built, and each time the text was right there in the DOM.
 *
 * So every published string in the ledger is measured against the box it was given. A head is
 * the worst of them -- it is right-set, so a track one pixel short eats its FIRST character and
 * `95% WILSON` becomes the name of a different interval.
 *
 * AND IT RUNS IN THREE STATES, NOT ONE, because two of the ledger's columns do not exist until a
 * reader has asked something. `VS ARCHIVE` appears only for a conditioned cohort and STATUS only
 * where something refuses -- so a resting-state sweep had nothing to measure them against, and
 * the comparison head shipped at 64px against the 69 it needs, publishing `'S ARCHIVE` at the
 * canonical desktop width. A gate that only visits the state everything fits in is a gate for
 * the state nobody has a problem with. */
console.log("\n[instrument] and nothing the ledger publishes is truncated to fit");
/* THE THIRD IS NOT A THIRD VIEWPORT, IT IS A THIRD SET OF COLUMNS. Resting is the frozen four;
   a conditioned cohort adds the comparison; below the sample gate adds the refusals, their
   statuses and the scope counts that qualify them. */
const CUT_STATES = [
  ["resting", ""],
  ["a conditioned cohort", "i=cat4"],
  ["below the sample gate", "s0=2022&b=NA&i=cat3"],
];
for (const [w, h] of WIDTHS) for (const [sname, query] of CUT_STATES) {
  await open(query, w, h);
  const cut = await page.evaluate((resting) => {
    /* THE BOX, NOT THE GLYPHS. scrollWidth against clientWidth catches an ellipsis and a clip
       alike; the 1px tolerance is for sub-pixel layout, not for a truncated character. */
    /* AN INVISIBLE ELEMENT PUBLISHES NOTHING, so it cannot publish something truncated. This
       exempts exactly one thing -- the status head where the status is not a column -- and it
       is checked as `visibility`, which still occupies layout, rather than as `display:none`,
       which would take the cell out of the deck's shared grid entirely. */
    const shown = (el) => getComputedStyle(el).visibility !== "hidden";
    /* THE CONTENT'S OWN EXTENT, WHICH IS THE ONLY MEASURE THAT SEES A RIGHT-SET CELL CLIPPED.
       `scrollWidth` reports overflow past the END edge only. Every numeric cell in this ledger
       is `justify-content:flex-end`, so a cell one pixel short overflows at the START, and
       `scrollWidth` equals `clientWidth` while the first characters are being cut off by
       `overflow:hidden` -- which is exactly how `'S ARCHIVE` passed this check. A Range over the
       element's contents measures the laid-out run itself and does not care which edge it ran
       off. Wrapped content is unaffected: the Range's union box is the wrapped box.

       ONLY WHERE THERE IS A BOX TO COMPARE IT TO. An INLINE element has no client box at all --
       `clientWidth` is 0 for a `<span>` -- so measuring a run against it reports every value on
       the surface as truncated. The comparison belongs to the CELL, which is a flex box with a
       real width; the run inside it is what the cell either fits or cuts. */
    const runWidth = (el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().width;
    };
    const over = (el) => shown(el)
      && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
        || (el.clientWidth > 0 && runWidth(el) > el.clientWidth + 1));
    const label = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const out = [];
    const look = (sel, what) => {
      for (const el of document.querySelectorAll(sel)) {
        const t = label(el);
        if (t && over(el)) out.push(`${what} "${t}"`);
      }
    };
    look(".at-deck-head .at-dc", "head");
    /* EVERY DATA CELL, WHICH IS WHERE THE FIGURES ACTUALLY LIVE. A value is an inline span with
       no box of its own; the cell holding it is the thing that either fits it or cuts it, so the
       cell is what is measured and `n / N`, the rate, the interval and the comparison are all
       covered by this one selector rather than by a list that has to be kept in step. */
    look("[data-outcome] .at-dc", "cell");
    look("[data-outcome] .at-dc-name", "outcome");
    look("[data-outcome] .at-dc-status", "status");
    look("[data-cohort-line] .at-cohort-n", "cohort line");

    /* AND NOTHING IS PUSHED PAST THE RIGHT-HAND EDGE OF THE SCREEN, which is the same failure
       arriving as geometry rather than as an ellipsis. A ledger wider than the shell does not
       truncate a single cell -- every check above passes -- it moves the LAST COLUMN off the
       viewport behind a sideways scroll, and the last column is STATUS. Measured at 390: the
       five resting tracks are 468px against 350px of phone, and a refused row refused 118px to
       the right of anything a reader was looking at. */
    if (resting) {
      const shell = document.querySelector(".atlas-instrument");
      if (shell && shell.scrollWidth > shell.clientWidth + 1) {
        out.push(`the instrument scrolls sideways: ${shell.scrollWidth} into ${shell.clientWidth}`);
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) {
        out.push(`the page scrolls sideways: ${document.documentElement.scrollWidth} into ${innerWidth}`);
      }
    }
    /* ASSERTED IN THE RESTING STATE ONLY, AND THE LIMIT IS DELIBERATE. The frozen five tracks
       must fit every screen the frame supports. The OPTIONAL comparison column may not: at 390
       six tracks do not fit 350px by any distribution that leaves an outcome name readable, so
       it keeps its track and the ledger scrolls to reach it -- the rule atlas.css already states
       for it. What must hold in EVERY state is that nothing a row SAYS is off screen, which is
       the status check below and the box checks above; those run unconditionally. */
    /* AND A STATUS THAT EXISTS IS A STATUS ON SCREEN -- in its column where there is one, on its
       own line where there is not. Panel rule 4 is about what a reader can see. */
    for (const c of document.querySelectorAll("[data-outcome] .at-dc-status")) {
      const t = label(c);
      if (!t) continue;
      const r = c.getBoundingClientRect();
      if (r.right > innerWidth + 1 || r.left < -1) out.push(`status off screen "${t}"`);
    }
    return out;
  }, query === "");
  ok(`${`${w}x${h}`.padEnd(9)} ${sname.padEnd(21)} every head, name, figure and status renders whole`,
     cut.length === 0, cut.join("\n"));
}

/* ── 6 · THE COLOPHON ───────────────────────────────────────────────────────────────────── */
console.log("\n[instrument] identity, provenance and the citation are at the foot");
{
  await open("", 1440, 900);
  const d = await page.evaluate(() => {
    const c = document.querySelector("[data-colophon]");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const shell = document.querySelector(".atlas-instrument");
    return {
      text: (c.textContent || "").replace(/\s+/g, " ").trim(),
      last: shell.lastElementChild === c || [...shell.children].indexOf(c) === shell.children.length - 1,
      onScreen: r.top >= 0 && r.bottom <= innerHeight + 1,
      controls: ["[data-open-ledger]", "[data-cite-cohort]"]
        .map((s) => !!c.querySelector(s)),
      provenance: !!c.querySelector("button[title^='provenance']"),
    };
  });
  ok("the colophon is at the foot of the instrument", !!d && d.last && d.onScreen);
  if (d) {
    ok("it carries the wordmark and the archive's scale",
       /Storm Atlas/.test(d.text) && /STORMS/.test(d.text) && /TRACK POINTS/.test(d.text),
       d.text.slice(0, 120));
    /* THE THREE STAMPS THAT SAY WHAT THE NUMBERS ABOVE MEAN. A reader comparing two screenshots
       taken a week apart needs to see, without opening anything, whether it is the same archive. */
    ok("and the three stamps that change what the numbers mean",
       /METHOD \d+\.\d+\.\d+/.test(d.text) && /PACK [0-9a-f]{8}/.test(d.text)
       && /BUILT \d{4}-\d{2}-\d{2}/.test(d.text), d.text.slice(-90));
    ok("and the three ways out: calibration, provenance, cite",
       d.controls.every(Boolean) && d.provenance,
       `ledger ${d.controls[0]}, cite ${d.controls[1]}, provenance ${d.provenance}`);
  }
}

ok("\nno page errors in any state", errors.length === 0, errors.slice(0, 3).join("\n"));

await browser.close();
server.close();

console.log(failures === 0
  ? "\nthe resting instrument is the frozen frame: question, plate, key, measure, ledger, colophon"
  : `\n${failures} instrument check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
