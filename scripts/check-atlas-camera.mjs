#!/usr/bin/env node
/* THE CAMERA: WHAT MOVES IT, WHAT MAY NOT, AND WHERE IT OPENS.
 *
 * Three things move this map and they are named separately, because a reader who cannot predict
 * when the view will move stops trusting the view:
 *
 *   HOME     the canonical NA + EP aperture.
 *   FIT      whatever evidence is currently drawn.
 *   SUBJECT  selecting a storm fits that storm's track -- the one automatic move.
 *
 * AND NOTHING ELSE MAY. A cohort edit, a condition removal, RESET QUERY, a layer toggle and a
 * mode switch all leave the camera exactly where the reader put it. That rule is invisible: a
 * surface that quietly re-frames on every filter change looks like a surface that is being
 * helpful, and the cost -- an analyst who panned to the Gulf, added a month condition, and found
 * themselves back over the mid-Atlantic -- is only felt by someone doing real work. So it is
 * measured rather than reviewed.
 *
 * THE APERTURE IS MEASURED AS GEOGRAPHY, NOT AS A ZOOM LEVEL. The failure this pass corrected
 * was not a wrong zoom; it was a contain fit on a plate wider than its frame opening 253 degrees
 * of longitude -- 141E to 34E, the whole West Pacific and half of Asia -- on a plate captioned
 * NORTH ATLANTIC + EAST PACIFIC, at every viewport, forever. A zoom assertion would have passed
 * throughout. So this asserts the BOX: inside the research geography, and holding the tropical
 * corridor the archive's mass actually occupies.
 *
 * Run: node scripts/check-atlas-camera.mjs [--require-browser]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dir, "../docs");

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
    ? "[camera] playwright is absent and --require-browser was given"
    : "[camera] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

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

const open = async (query, w = 1920, h = 1080) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  /* AND THE MAP HANDLE, not just the archive. Every check below reads __ATLAS_MAP through
     view(); waiting only on the archive and then sleeping a fixed 800ms is a race that a loaded
     runner loses -- the gate then dies on `undefined.getZoom()` before asserting anything, which
     reads as an infrastructure error rather than as the camera check it never reached. */
  await page.waitForFunction(() => globalThis.__ATLAS_MAP, { timeout: 90000 });
  await page.waitForTimeout(800);
};

const view = () => page.evaluate(() => {
  const m = globalThis.__ATLAS_MAP;
  const b = m.getBounds();
  return {
    s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast(),
    zoom: m.getZoom(), lat: m.getCenter().lat, lon: m.getCenter().lng,
    moved: globalThis.__ATLAS_CAMERA ? globalThis.__ATLAS_CAMERA.movedByReader() : null,
  };
});
/* CAMERA EQUALITY IS MEASURED IN SCREEN PIXELS, NOT IN DEGREES.
 *
 * This helper used to compare lat/lon to 1e-6 degrees -- about 0.1 m, roughly one part in
 * 22,000 of a pixel at zoom 6. That is not an invariant the surface can hold, and the gate went
 * red on it: deselecting a storm closes the inspector dock, the plate's container grows back by
 * 380px, the ResizeObserver in map.jsx calls invalidateSize, and Leaflet compensates for the new
 * box by adjusting the centre -- which is the CORRECT behaviour, and it necessarily moves
 * getCenter(). Measured, that compensation lands 0.32 of one CSS pixel differently on a loaded
 * runner than on an idle one. Reproduced identically on main, so it was never a regression;
 * the gate was asserting sub-pixel identity across a resize that legitimately pans.
 *
 * The thing worth protecting is that deselection does not RE-FRAME: the three real camera moves
 * measure 281, 335 and 496 px, three orders of magnitude above that noise floor. So the question
 * the gate asks is now "did the camera move a distance a reader could see", and the answer is a
 * projected pixel displacement.
 *
 * TWO PREDICATES, NOT ONE, and a deliberate dead band between them. A single tolerance serving
 * both `same` and `!same` is ambiguous in a way that can WEAKEN a negative assertion: loosening
 * it lets a small-but-intended camera change be classified as "same", and the `!same` that was
 * meant to catch a missing move passes vacuously. So the two questions are asked by name, with
 * a gap between 1px and MEANINGFUL_PX that satisfies NEITHER. A change landing in that band
 * fails both the "stayed" and the "moved" assertion -- loudly, rather than silently picking one.
 *
 * AND CANONICAL RESTORATION IS STILL EXACT. HOME sets a deterministic aperture with no resize in
 * play, and it measures 0.00 px in both the idle and the loaded condition, so those two
 * assertions keep degree-exact equality. Nothing is loosened that does not need to be. */

const MEANINGFUL_PX = 8;

/* Web Mercator, the projection Leaflet's default CRS uses, at 256px tiles. Implemented here
   rather than read from the page so the self-test below can run without a browser; asserted
   against the live map's own project() in [0], so it cannot drift from what the map does. */
function projectPx(lat, lon, zoom) {
  const world = 256 * 2 ** zoom;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return [
    (lon + 180) / 360 * world,
    world / 2 - world * Math.log(Math.tan(Math.PI / 4 + clamped / 2)) / (2 * Math.PI),
  ];
}

/** Centre-to-centre displacement in CSS pixels, projected at `a`'s zoom. */
function centrePxDelta(a, b) {
  const [ax, ay] = projectPx(a.lat, a.lon, a.zoom);
  const [bx, by] = projectPx(b.lat, b.lon, a.zoom);
  return Math.hypot(ax - bx, ay - by);
}

/** The camera stayed put: identical zoom, and a centre a reader could not see move. */
const sameCameraWithinPx = (a, b, tolPx = 1) =>
  a.zoom === b.zoom && centrePxDelta(a, b) < tolPx;

/** The camera is exactly where it was, to the degree. For canonical HOME restoration only. */
const sameCameraExactly = (a, b) => Math.abs(a.lat - b.lat) < 1e-6
  && Math.abs(a.lon - b.lon) < 1e-6 && Math.abs(a.zoom - b.zoom) < 1e-6;

/** The camera made a move a reader would see: a zoom change, or a visible centre displacement. */
const cameraMovedMeaningfully = (a, b, minPx = MEANINGFUL_PX) =>
  a.zoom !== b.zoom || centrePxDelta(a, b) >= minPx;
const fmt = (v) => `lat ${v.s.toFixed(1)}..${v.n.toFixed(1)}  lon ${v.w.toFixed(1)}..${v.e.toFixed(1)}  z${v.zoom}`;

/* THE RESEARCH GEOGRAPHY, restated here rather than imported: a gate that reads its bound from
   the file it is checking cannot catch that file widening the bound. */
const NA_EP = { s: 0, n: 65, w: -180, e: 0 };
/* AND THE CORRIDOR THE APERTURE HAS TO HOLD, which is the other half. A view can sit inside the
   research geography and still be useless -- zoomed onto the Sargasso Sea satisfies the clamp
   and frames nothing. These are the two boxes the opening view must CONTAIN: the main
   development region across both basins, and the recurvature corridor off the US east coast. */
const MUST_HOLD = [
  { name: "the Atlantic main development region", s: 11, n: 18, w: -60, e: -20 },
  { name: "the Gulf and Caribbean", s: 12, n: 29, w: -96, e: -62 },
  { name: "the East Pacific development region", s: 11, n: 19, w: -140, e: -95 },
  { name: "the US east-coast recurvature corridor", s: 30, n: 42, w: -80, e: -62 },
];

/* [0] THE MEASURING STICK ITSELF, before it is used to judge anything.
 *
 * These predicates decide every verdict below, so a fault in them is invisible: a
 * sameCameraWithinPx that is too generous turns a real re-frame into a pass, and a
 * cameraMovedMeaningfully that is too generous turns a MISSING move into a pass. Both are
 * checked against real measurements taken from this surface -- the sub-pixel resize
 * compensation that made this gate red, and the three genuine camera moves it must keep
 * catching -- plus the 191px displacement produced by a pan:false experiment on map.jsx's
 * ResizeObserver, which is the shape of the regression this gate exists to catch.
 */
console.log("[camera] the pixel yardstick, before anything is measured with it");
{
  const at = (lat, lon, zoom) => ({ lat, lon, zoom, s: 0, n: 0, w: 0, e: 0 });

  /* The measured resize compensation: 0.32px at zoom 6. Must read as "stayed". */
  const before = at(12.7039, -74.7000, 6);
  const resized = at(12.7047, -74.7070, 6);
  const dResize = centrePxDelta(before, resized);
  ok(`the 0.32px resize compensation is not a move (${dResize.toFixed(2)} px)`,
    dResize < 1 && sameCameraWithinPx(before, resized),
    "the sub-pixel pan Leaflet applies on a container resize must not read as a re-frame");
  ok("and it is not a meaningful move either", !cameraMovedMeaningfully(before, resized));

  /* THE REGRESSION THIS GATE EXISTS TO CATCH. Passing pan:false to the ResizeObserver's
     invalidateSize in map.jsx -- a plausible "fix" for the above -- stops Leaflet compensating
     and the plate jumps 4.2 degrees of longitude. Measured: lon -74.7000 -> -70.5322 at zoom 6.
     If that ever reads as "the camera stayed where it is", this gate is worthless. */
  const panFalse = at(12.7047, -70.5322, 6);
  const dPanFalse = centrePxDelta(before, panFalse);
  ok(`the pan:false jump is ~191px (${dPanFalse.toFixed(1)} px)`,
    dPanFalse > 150 && dPanFalse < 250, "the recorded regression fixture has drifted");
  ok("and it fails a stayed-put assertion decisively",
    !sameCameraWithinPx(before, panFalse),
    `${dPanFalse.toFixed(1)} px read as unchanged`);
  ok("and registers as a meaningful move", cameraMovedMeaningfully(before, panFalse));
  ok(`it clears the dead band by ${(dPanFalse / MEANINGFUL_PX).toFixed(0)}x`,
    dPanFalse >= MEANINGFUL_PX * 10);

  /* The three real moves, at their measured sizes. Each must register as a move, so the
     negative assertions below cannot pass vacuously. */
  for (const [name, a, b] of [
    ["a reader's drag (~335-456 px)", at(24.5, -96.0, 5), at(24.5, -78.0, 5)],
    ["FIT reframing to evidence (~496 px)", at(25.0, -75.0, 5), at(38.0, -52.0, 5)],
    ["selecting a storm (~281 px, +2 zoom)", at(24.5, -96.0, 4), at(12.7, -74.7, 6)],
  ]) {
    ok(`${name} registers as a move`, cameraMovedMeaningfully(a, b),
      `only ${centrePxDelta(a, b).toFixed(1)} px`);
    ok(`${name} does not read as unchanged`, !sameCameraWithinPx(a, b));
  }

  /* A zoom change alone is a move, whatever the centre does. */
  ok("a zoom change alone is a move", cameraMovedMeaningfully(at(20, -70, 5), at(20, -70, 6)));
  ok("and never reads as unchanged", !sameCameraWithinPx(at(20, -70, 5), at(20, -70, 6)));

  /* The dead band is deliberate and must stay empty of verdicts: 1px..8px satisfies NEITHER
     predicate, so a change landing there fails whichever assertion was made about it. */
  const degPerPx = 360 / (256 * 2 ** 6);
  const band = at(12.7039, -74.7000 + degPerPx * (1 + MEANINGFUL_PX) / 2, 6);
  const dBand = centrePxDelta(before, band);
  ok(`the ${dBand.toFixed(1)}px dead band satisfies neither predicate`,
    dBand > 1 && dBand < MEANINGFUL_PX
      && !sameCameraWithinPx(before, band) && !cameraMovedMeaningfully(before, band),
    "a change between 1px and MEANINGFUL_PX must fail loudly, not be classified either way");

  /* Exact restoration stays exact: HOME measures 0.00px, so it is held to degrees. */
  ok("sameCameraExactly rejects even the sub-pixel compensation",
    !sameCameraExactly(before, resized));
  ok("and accepts an identical camera", sameCameraExactly(before, at(12.7039, -74.7000, 6)));
}

/* AND THAT THE YARDSTICK IS THE MAP'S OWN. projectPx is Web Mercator written out here so the
   block above can run without a browser; if the map's CRS were ever something else, every pixel
   verdict would be measured with the wrong ruler while still looking self-consistent. So it is
   checked against Leaflet's own project() on the live map. */
await open("", 1920, 1080);
{
  const probes = [[12.7, -74.7, 6], [38.0, -52.0, 5], [24.5, -96.0, 4], [-15.0, 150.0, 3]];
  const leaflet = await page.evaluate((ps) => ps.map(([la, lo, z]) => {
    const pt = globalThis.__ATLAS_MAP.project({ lat: la, lng: lo }, z);
    return [pt.x, pt.y];
  }), probes);
  let worst = 0;
  for (let i = 0; i < probes.length; i++) {
    const [la, lo, z] = probes[i];
    const [mx, my] = projectPx(la, lo, z);
    worst = Math.max(worst, Math.hypot(mx - leaflet[i][0], my - leaflet[i][1]));
  }
  ok(`projectPx agrees with the map's own CRS (worst ${worst.toFixed(4)} px over 4 probes)`,
    worst < 0.01, "the gate is measuring pixels with a different projection than the map draws");
}

console.log("[camera] the opening view is the NA + EP aperture, at every supported viewport");
for (const [w, h] of [[1440, 900], [1600, 900], [1920, 1080], [1280, 800], [2560, 1080],
  [1440, 1600], [1024, 768]]) {
  await open("", w, h);
  const v = await view();
  ok(`${String(w + "x" + h).padEnd(10)} ${fmt(v)}`,
     v.w >= NA_EP.w - 0.5 && v.e <= NA_EP.e + 0.5 && v.s >= NA_EP.s - 0.5 && v.n <= NA_EP.n + 0.5,
     `the opening view leaves the research geography this plate is captioned for`);
  for (const box of MUST_HOLD) {
    /* THE ULTRAWIDE CAP CROPS LATITUDE, AND THAT IS STATED RATHER THAN EXEMPTED. At 2560x500 and
       3440x500 the plate holds about 27 and 19 degrees of latitude: the hard height cap is what
       decides the shape there, and the corridor cannot fit inside it. The longitude assertion
       still applies at every width -- it is the one the West Pacific bug lived in. */
    const latOk = v.s <= box.s + 0.5 && v.n >= box.n - 0.5;
    const lonOk = v.w <= box.w + 0.5 && v.e >= box.e - 0.5;
    if (w > 2000 && !latOk) {
      console.log(`  note  ${String(w + "x" + h).padEnd(10)} ${box.name}: latitude cropped by the `
        + `500px cap (view holds ${(v.n - v.s).toFixed(0)}°)`);
      ok(`${String(w + "x" + h).padEnd(10)} ${box.name} — longitude`, lonOk,
         `lon ${v.w.toFixed(1)}..${v.e.toFixed(1)} does not span ${box.w}..${box.e}`);
    } else {
      ok(`${String(w + "x" + h).padEnd(10)} holds ${box.name}`, latOk && lonOk,
         `${fmt(v)} does not contain ${box.s}..${box.n}N ${box.w}..${box.e}`);
    }
  }
}

console.log("\n[camera] a query change never steals a camera the reader has moved");
{
  await open("", 1920, 1080);
  /* Moved the way a reader moves it: a real drag on the plate, so the movestart the surface
     listens for is the one a pointer produced. */
  const box = await page.$(".at-plate");
  const b = await box.boundingBox();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5 - 260, b.y + b.height * 0.5 - 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const panned = await view();
  ok("a drag registers as the reader's own move", panned.moved === true);

  /* EVERY WAY THE QUESTION CAN CHANGE, ONE AT A TIME. Each is applied through the surface's own
     controls or its own URL, never by calling into the map. */
  const STEPS = [
    /* ON OPEN WATER, AND THE POINT IS CHOSEN RATHER THAN GUESSED. A click that lands on a
       genesis dot SELECTS a storm, which legitimately frames it -- so a fixed coordinate makes
       this probe assert the persistence rule on a run where the surface was allowed to move,
       and report the one automatic move as the failure. The hit test the map itself uses is
       asked first, and the first point it declines is the one clicked. */
    ["a location condition from a click on open water", async () => {
      const pt = await page.evaluate(() => {
        const m = globalThis.__ATLAS_MAP;
        const s = m.getSize();
        for (let fx = 0.30; fx <= 0.72; fx += 0.06) {
          for (let fy = 0.30; fy <= 0.72; fy += 0.06) {
            const p = { x: Math.round(s.x * fx), y: Math.round(s.y * fy) };
            if (!globalThis.__ATLAS_HIT(m, p)) return p;
          }
        }
        return null;
      });
      if (!pt) return;
      await page.mouse.click(b.x + pt.x, b.y + pt.y);
      await page.waitForTimeout(700);
      const docked = await page.$("[data-inspector-dock]");
      if (docked) throw new Error("the open-water click still selected a storm");
    }],
    ["a condition removed by its own ×", async () => {
      const x = await page.$("[data-condition-clear]");
      if (x) { await x.click(); await page.waitForTimeout(600); }
    }],
    ["an outcome condition added in the builder", async () => {
      await (await page.$('[data-zone-edit="outcome"]')).click();
      await page.waitForTimeout(350);
      const chip = await page.$('[data-chip="intensity-cat3"]')
        || await page.$('[data-chip="intensity-cat4"]');
      if (chip) { await chip.click(); await page.waitForTimeout(700); }
      const close = await page.$("[data-sheet-close]");
      if (close) { await close.click(); await page.waitForTimeout(400); }
    }],
    ["RESET QUERY", async () => {
      const r = await page.$("[data-reset-query]");
      if (r) { await r.click(); await page.waitForTimeout(700); }
    }],
  ];
  let prev = panned;
  for (const [name, act] of STEPS) {
    await act();
    const v = await view();
    ok(`${name} leaves the camera alone`, sameCameraWithinPx(prev, v),
       `camera moved from ${fmt(prev)} to ${fmt(v)} `
       + `(${centrePxDelta(prev, v).toFixed(2)} px)`);
    prev = v;
  }
}

console.log("\n[camera] HOME and FIT reframe, and they are not the same control");
{
  await open("", 1920, 1080);
  const home = await view();
  const box = await page.$(".at-plate");
  const b = await box.boundingBox();
  await page.mouse.move(b.x + 200, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(b.x + 520, b.y + 300, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const moved = await view();
  ok("the reader has moved away from HOME", cameraMovedMeaningfully(home, moved),
     `only ${centrePxDelta(home, moved).toFixed(2)} px — a drag must move the camera visibly`);

  await (await page.$("[data-camera-home]")).click();
  await page.waitForTimeout(500);
  const back = await view();
  ok("HOME restores the canonical aperture exactly", sameCameraExactly(home, back),
     `${fmt(home)}  vs  ${fmt(back)}`);
  ok("and it hands the camera back — the reader's move is cleared", back.moved === false);

  /* FIT IS A DIFFERENT ANSWER TO A DIFFERENT QUESTION, and its contract is CONTAINMENT rather
     than tightness. "Tighter than the aperture" is the wrong assertion and was measured to be
     wrong: a 300km probe off Florida matches storms whose whole tracks run from Cape Verde to
     Newfoundland, so the evidence really is wider than the opening view and a FIT that shrank
     to fit the probe RING would be hiding most of what it framed. What FIT promises is that
     everything drawn is on the plate. */
  await open("w=25,-75,300&s0=1990", 1920, 1080);
  const h2 = await view();
  await (await page.$("[data-camera-fit]")).click();
  await page.waitForTimeout(500);
  const fit = await view();
  ok("FIT frames the evidence, not the aperture", cameraMovedMeaningfully(h2, fit),
     `${fmt(h2)}  vs  ${fmt(fit)}  (only ${centrePxDelta(h2, fit).toFixed(2)} px)`);
  const drawn = await page.evaluate(() => {
    const a = globalThis.__ATLAS.archive;
    const rows = globalThis.__ATLAS_DRAWN_ROWS || [];
    let S = 90; let N = -90; let W = 180; let E = -180;
    for (const i of rows) {
      const [s, e] = a.trackRange(i);
      for (let k = s; k < e; k += 3) {
        const la = a.ptLat[k] / 100; const lo = a.ptLon[k] / 100;
        if (la < S) S = la; if (la > N) N = la; if (lo < W) W = lo; if (lo > E) E = lo;
      }
    }
    return rows.length ? { S, N, W, E, n: rows.length } : null;
  });
  ok("the surface publishes which rows are lifted, so this is measurable", !!drawn);
  if (drawn) {
    ok(`and every one of the ${drawn.n} lifted tracks is on the plate`,
       fit.s <= drawn.S + 0.01 && fit.n >= drawn.N - 0.01
       && fit.w <= drawn.W + 0.01 && fit.e >= drawn.E - 0.01,
       `evidence ${drawn.S.toFixed(1)}..${drawn.N.toFixed(1)}N ${drawn.W.toFixed(1)}..${drawn.E.toFixed(1)} `
       + `against ${fmt(fit)}`);
  }
  await (await page.$("[data-camera-home]")).click();
  await page.waitForTimeout(500);
  {
    const back2 = await view();
    /* THE CENTRE AT FULL PRECISION IN THE FAILURE MESSAGE, because this assertion is exact and
       the differences it catches are sub-pixel: a bounds line rounded to a tenth of a degree
       reports two identical-looking views and leaves nobody any way to see what moved. */
    ok("and HOME comes back from FIT", sameCameraExactly(h2, back2),
       `${fmt(h2)}  vs  ${fmt(back2)}\n`
       + `centre ${h2.lat.toFixed(9)},${h2.lon.toFixed(9)} `
       + `vs ${back2.lat.toFixed(9)},${back2.lon.toFixed(9)}`);
  }
}

console.log("\n[camera] selecting a storm frames that storm, and deselecting does not move");
{
  await open("", 1920, 1080);
  const sid = await page.evaluate(() => {
    const a = globalThis.__ATLAS.archive;
    for (let i = 0; i < a.nStorms; i++) {
      const s = a.storm(i);
      if (s && s.name && s.max_category && s.landfalls && s.landfalls.length) return { id: s.storm_id, row: i };
    }
    return null;
  });
  ok("a storm exists to select", !!sid);
  const before = await view();
  await page.evaluate((row) => globalThis.__ATLAS_SELECT(row), sid.row);
  await page.waitForTimeout(700);
  const on = await view();
  ok("the camera framed the subject", cameraMovedMeaningfully(before, on),
     `${fmt(before)}  vs  ${fmt(on)}  (only ${centrePxDelta(before, on).toFixed(2)} px)`);
  const track = await page.evaluate((row) => {
    const a = globalThis.__ATLAS.archive;
    const [s, e] = a.trackRange(row);
    let S = 90; let N = -90; let W = 180; let E = -180;
    for (let k = s; k < e; k++) {
      const la = a.ptLat[k] / 100; const lo = a.ptLon[k] / 100;
      if (la < S) S = la; if (la > N) N = la; if (lo < W) W = lo; if (lo > E) E = lo;
    }
    return { S, N, W, E };
  }, sid.row);
  ok("and the whole track is on the plate, with a margin",
     on.s <= track.S && on.n >= track.N && on.w <= track.W && on.e >= track.E,
     `track ${track.S.toFixed(1)}..${track.N.toFixed(1)}N ${track.W.toFixed(1)}..${track.E.toFixed(1)} `
     + `against ${fmt(on)}`);

  /* AND A COHORT EDIT WITH A STORM STILL SELECTED DOES NOT RE-FRAME IT. `subjectFrame` is a
     fresh array on every render; an effect keyed on it rather than on the selection would move
     the camera on every filter change with an inspector open -- the persistence rule broken in
     the one state where it is hardest to notice. */
  await page.evaluate(() => {
    const c = globalThis.__ATLAS_COHORT;
    globalThis.__ATLAS_SET_COHORT
      && globalThis.__ATLAS_SET_COHORT(c.normalise({ seasonFrom: 1980 }));
  });
  const chip = await page.$('[data-zone-edit="given"]');
  if (chip) {
    await chip.click();
    await page.waitForTimeout(350);
    const mon = await page.$('[data-chip="month-9"]') || await page.$('[data-chip="month-8"]');
    if (mon) { await mon.click(); await page.waitForTimeout(700); }
    const close = await page.$("[data-sheet-close]");
    if (close) { await close.click(); await page.waitForTimeout(400); }
  }
  const afterEdit = await view();
  ok("a cohort edit with the inspector open does not re-frame the subject",
     sameCameraWithinPx(on, afterEdit),
     `${fmt(on)}  vs  ${fmt(afterEdit)}  (${centrePxDelta(on, afterEdit).toFixed(2)} px)`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  {
    /* The dock closes here, so the container resizes and Leaflet pans to compensate. What must
       hold is that no RE-FRAME happened -- see the helper's note. */
    const off = await view();
    ok("and deselecting leaves the camera where it is", sameCameraWithinPx(afterEdit, off),
       `${fmt(afterEdit)}  vs  ${fmt(off)}  (${centrePxDelta(afterEdit, off).toFixed(2)} px)`);
  }
}

ok("no page errors in any state", errors.length === 0, errors.slice(0, 3).join("\n"));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nthe camera opens on NA + EP, and only HOME, FIT and a selection move it"
  : `\n${failures} camera check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
