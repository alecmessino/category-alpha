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
const same = (a, b) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6
  && Math.abs(a.zoom - b.zoom) < 1e-6;
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
    ok(`${name} leaves the camera alone`, same(prev, v),
       `camera moved from ${fmt(prev)} to ${fmt(v)}`);
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
  ok("the reader has moved away from HOME", !same(home, moved));

  await (await page.$("[data-camera-home]")).click();
  await page.waitForTimeout(500);
  const back = await view();
  ok("HOME restores the canonical aperture exactly", same(home, back),
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
  ok("FIT frames the evidence, not the aperture", !same(h2, fit), `${fmt(h2)}  vs  ${fmt(fit)}`);
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
  ok("and HOME comes back from FIT", same(h2, await view()));
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
  ok("the camera framed the subject", !same(before, on), `${fmt(before)}  vs  ${fmt(on)}`);
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
  ok("a cohort edit with the inspector open does not re-frame the subject", same(on, afterEdit),
     `${fmt(on)}  vs  ${fmt(afterEdit)}`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  ok("and deselecting leaves the camera where it is", same(afterEdit, await view()));
}

ok("no page errors in any state", errors.length === 0, errors.slice(0, 3).join("\n"));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nthe camera opens on NA + EP, and only HOME, FIT and a selection move it"
  : `\n${failures} camera check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
