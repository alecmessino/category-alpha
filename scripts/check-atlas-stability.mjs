#!/usr/bin/env node
/* THE APERTURE INVARIANT: WHAT A READER IS LOOKING AT MAY NOT MOVE BECAUSE THE UI GEOMETRY DID.
 *
 * THE RULE, IN ONE LINE. At a given viewport and a given camera state, a change to the QUERY may
 * change what is DRAWN inside the aperture. It may not change the aperture.
 *
 * WHY THIS GATE EXISTS, AND WHY NOTHING ELSE COULD HAVE CAUGHT IT. Measured on the deployed
 * surface at 1440x900: adding one genesis-radius condition took the plate from 834x499 to
 * 730x437 -- 23% of its area -- and took the camera with it, from zoom 3.25 to 3.00 with the
 * centre moving a degree north. At 1920 the same edit moved the centre 3.2 degrees north and
 * opened 13 more degrees of longitude. The reader had not touched the map.
 *
 * The chain is short and every link was individually reasonable. `--at-ledger` was widened by
 * `:has(.at-dc-vs)` so that a sixth column would fit; `--at-plate-avail` is computed from the
 * ledger; `.atlas-stage`'s height bounds are computed from `--at-plate-avail`; the Leaflet
 * container is observed by a ResizeObserver; and `settle()` re-derives the aperture when the box
 * changes, which is CORRECT -- an aperture is defined by a frame, a clamp and the plate's box, and
 * pan-compensating instead once put HOME and the opening view measurably apart. The defect is not
 * in `settle()`. It is that the plate's box had any business changing because a column appeared.
 *
 * WHY THE EXISTING GATES ARE ALL GREEN ON IT.
 *
 *   check-plate-aperture   is the only gate that reads `.at-plate`'s width, and every one of its
 *                          measurement sites opens with an EMPTY query. It has never seen a
 *                          conditioned plate.
 *   check-atlas-camera     asserts that a cohort edit leaves the camera alone -- but it DRAGS
 *                          first, and a pointer-originated `movestart` clears `atAperture`, so
 *                          the `if (wasAtAperture)` branch is unreachable for the whole of its
 *                          persistence sequence. It tests the one branch that was never broken.
 *   check-responsive-matrix  asserts nothing overflows. Nothing did.
 *
 * A surface can pass every overflow and every responsive assertion and still move the map out
 * from under the person reading it. So this gate asserts the one thing none of them do: the
 * RECTANGLE and the CAMERA, before and after, across every state change that is not itself a
 * camera command.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED. Everything INSIDE the ledger. The status word moving from
 * its own track to a line under the row it governs, the outcome column taking up the slack, the
 * comparison track appearing -- all of that is the ledger rearranging its own contents and is
 * none of the aperture's business. This gate reads `--at-ledger` and the deck's track list and
 * PRINTS them on failure, because they are the likeliest cause, but it never fails on them. It
 * fails when the plate moved.
 *
 * Run: node scripts/check-atlas-stability.mjs [--require-browser] [--self-test]
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
    ? "[stability] playwright is absent and --require-browser was given"
    : "[stability] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}
const SELF_TEST = process.argv.includes("--self-test");

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
    } catch { res.writeHead(404); res.end("nf"); }
  });
  s.listen(0, "127.0.0.1", () => r(s));
});
const port = server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "block" });
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();
let errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

/* THE SETTLE IS 700ms AND IT IS NOT PADDING. `settle()` is driven by a ResizeObserver behind a
   200ms timeout, and it runs AFTER React has committed. A reading taken before it lands would
   record the old box against the new query and report a stability this surface does not have --
   a gate that passes because it measured too early is worse than no gate. */
const SETTLE = 700;

const open = async (query, w, h) => {
  errors = [];
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS_MAP && globalThis.__ATLAS, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
};

/* THE READING. The rectangle and the camera are the assertion; the ledger measure and the deck's
   track list ride along so that a failure names its own cause instead of leaving one to be
   guessed at from a pixel count. */
const read = () => page.evaluate(() => {
  const el = document.querySelector(".at-plate");
  const m = globalThis.__ATLAS_MAP;
  if (!el || !m) return null;
  const b = el.getBoundingClientRect();
  const c = m.getCenter();
  const shell = document.querySelector(".atlas-instrument");
  const deck = document.querySelector(".at-deck");
  return {
    x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2),
    lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), z: +m.getZoom().toFixed(4),
    ledger: shell ? getComputedStyle(shell).getPropertyValue("--at-ledger").trim() : null,
    cols: deck ? getComputedStyle(deck).gridTemplateColumns : null,
    hasVs: !!document.querySelector(".at-dc-vs"),
    hasRefusal: !!document.querySelector("[data-refusal]"),
    hasTransport: !!document.querySelector(".atlas-transport > *"),
    sheetOpen: !!document.querySelector("[data-builder-sheet]"),
  };
});

/* WHAT COUNTS AS MOVED.
   RECT_TOL is half a pixel: sub-pixel layout rounding is real and a fractional wobble is not a
   re-frame, but anything a reader could see is. CAM_DP is the two decimal places the brief names
   -- 0.01 degrees is roughly a kilometre, which is far below the smallest move this gate is
   written to catch (the measured failures move the centre by whole degrees) and far above the
   floating-point noise of a re-projection that did not actually happen. */
const RECT_TOL = 0.5;
const CAM_DP = 2;
const r2 = (n) => Math.round(n * 10 ** CAM_DP) / 10 ** CAM_DP;

const rectMoved = (a, b) => ["x", "y", "w", "h"].some((k) => Math.abs(a[k] - b[k]) > RECT_TOL);
const camMoved = (a, b) => r2(a.lat) !== r2(b.lat) || r2(a.lon) !== r2(b.lon) || r2(a.z) !== r2(b.z);

const fmt = (v) => `plate ${v.w}x${v.h} @(${v.x},${v.y}) · cam ${v.lat},${v.lon} z${v.z}`;
const why = (a, b) => {
  const out = [];
  out.push(`  before  ${fmt(a)}`);
  out.push(`  after   ${fmt(b)}`);
  const d = ["x", "y", "w", "h"].map((k) => `${k}${(b[k] - a[k] >= 0 ? "+" : "")}${(b[k] - a[k]).toFixed(2)}`);
  out.push(`  delta   ${d.join(" ")} · lat${(b.lat - a.lat).toFixed(3)} lon${(b.lon - a.lon).toFixed(3)} z${(b.z - a.z).toFixed(3)}`);
  if (a.ledger !== b.ledger) out.push(`  cause?  --at-ledger ${a.ledger}  ->  ${b.ledger}`);
  if (a.cols !== b.cols) out.push(`  ledger-internal (not itself a failure): deck tracks ${a.cols}  ->  ${b.cols}`);
  return out.join("\n");
};

/* ── the transitions ──────────────────────────────────────────────────────────────────────────
 *
 * EVERY ONE IS DRIVEN THROUGH THE SURFACE'S OWN CONTROLS, never by calling into the map or by
 * reloading with a different query. A reload re-derives the aperture from scratch and would
 * compare two independent openings, which is the one comparison that cannot fail and the one
 * that proves nothing. What is under test is a LIVE state change on a page a reader is already
 * looking at.
 *
 * `cameraExempt` marks the single transition that is allowed to move the camera: selecting a
 * storm fits that storm's track, which is a camera command and is the surface's documented
 * behaviour. Its RECTANGLE is still asserted -- the transport appearing must not resize the
 * plate even though the selection may re-frame it. */
const click = async (sel) => {
  const el = await page.$(sel);
  if (!el) return false;
  await el.click();
  await page.waitForTimeout(SETTLE);
  return true;
};
const openSheet = () => click("[data-zone-edit]");
const closeSheet = () => click("[data-sheet-close]");
/* THE SCOPE TOGGLES CARRY NO HOOK -- `Toggle` renders a bare <button> holding a pill and a label
   span -- so this one control is reached by its words. Everything else in this file is selected
   by a stable `data-` attribute for the reason kit.jsx:171-174 gives: a selector that matches the
   wording of the thing it is checking breaks the moment the wording earns a live count. */
const toggle = async (label) => {
  const el = page.locator("[data-builder-sheet] button", { hasText: label }).first();
  if (!(await el.count())) return false;
  await el.click();
  await page.waitForTimeout(SETTLE);
  return true;
};
const chip = async (key) => {
  await openSheet();
  const hit = await click(`[data-chip="${key}"]`);
  await closeSheet();
  return hit;
};

const TRANSITIONS = [
  {
    name: "the condition editor opens, then closes",
    apply: async () => { await openSheet(); },
    revert: async () => { await closeSheet(); },
  },
  {
    name: "an outcome condition is added (the comparison column appears)",
    apply: async () => { await chip("intensity-cat1"); },
    revert: async () => { await click("[data-condition-clear]"); },
  },
  {
    name: "a landfall condition is added",
    apply: async () => { await chip("landfall-conus"); },
    revert: async () => { await click("[data-condition-clear]"); },
  },
  {
    name: "a genesis basin condition is added",
    apply: async () => { await chip("basin-NA"); },
    revert: async () => { await click("[data-condition-clear]"); },
  },
  {
    name: "a season condition is added",
    apply: async () => { await chip("season-1971+"); },
    revert: async () => { await click("[data-condition-clear]"); },
  },
  {
    name: "a scope toggle is flipped (provisional seasons)",
    apply: async () => { await openSheet(); await toggle("PROVISIONAL SEASONS"); await closeSheet(); },
    revert: async () => { await openSheet(); await toggle("PROVISIONAL SEASONS"); await closeSheet(); },
  },
  {
    name: "the duration columns unfold, then fold",
    apply: async () => { await click("[data-timing-fold]"); },
    revert: async () => { await click("[data-timing-fold]"); },
  },
  {
    name: "a storm is selected (the transport appears)",
    cameraExempt: true,
    apply: async () => {
      await page.evaluate(() => {
        const a = globalThis.__ATLAS.archive;
        for (let i = 0; i < a.nStorms; i++) {
          const s = a.storm(i);
          if (s && s.name && s.landfalls && s.landfalls.length) { globalThis.__ATLAS_SELECT(i); return; }
        }
      });
      await page.waitForTimeout(SETTLE);
    },
    revert: async () => { await page.evaluate(() => globalThis.__ATLAS_SELECT(null)); await page.waitForTimeout(SETTLE); },
  },
];

/* THE REFUSAL TRANSITION IS ITS OWN CASE, because reaching one takes a cohort small enough to
   trip the sample gate and that cannot be done with a single chip. It is driven by the URL and
   compared against its own baseline at the same viewport, which is the honest comparison: the
   question is whether a refused row costs the plate anything, not whether two openings agree. */
const REFUSAL_QUERY = "s0=2022&b=NA&i=cat3";

const VIEWPORTS = [[1920, 1080], [1680, 1050], [1440, 900], [1220, 820], [1024, 768]];

console.log("[stability] the aperture holds while the query changes\n");

for (const [w, h] of VIEWPORTS) {
  console.log(`  ── ${w}x${h} ─────────────────────────────────────────────`);
  await open("", w, h);
  const base = await read();
  if (!ok(`${w}x${h} opens with a measurable plate`, !!base, "no .at-plate or no __ATLAS_MAP")) continue;

  for (const t of TRANSITIONS) {
    await t.apply();
    const after = await read();
    if (!after) { ok(`${t.name} — plate still measurable`, false, "the plate went away"); continue; }

    const movedR = rectMoved(base, after);
    const movedC = !t.cameraExempt && camMoved(base, after);
    ok(`${t.name}`, !movedR && !movedC && errors.length === 0,
       [movedR ? "THE PLATE RECTANGLE MOVED." : null,
        movedC ? "THE CAMERA MOVED and this transition is not a camera command." : null,
        why(base, after), ...errors].filter(Boolean).join("\n"));

    await t.revert();
    const back = await read();
    if (back && !t.cameraExempt) {
      ok(`${t.name} — and reverting returns to the same aperture`,
         !rectMoved(base, back) && !camMoved(base, back), why(base, back));
    }
  }

  /* the refusal state, against its own opening at this viewport */
  await open(REFUSAL_QUERY, w, h);
  const refused = await read();
  if (refused) {
    ok(`a refused cohort holds the same plate as the unqueried one`,
       !rectMoved(base, refused),
       ["a refusal appearing must not cost the plate a pixel", why(base, refused)].join("\n"));
  }
}

/* ── the seed ────────────────────────────────────────────────────────────────────────────────
 *
 * A GATE THAT HAS NEVER BEEN SEEN TO FAIL IS NOT EVIDENCE. Once the surface is stable this file
 * prints nothing but `ok` forever, and a detector that quietly stopped detecting would look
 * exactly the same. So the violation is MANUFACTURED and the gate is required to catch it: the
 * ledger is widened by 60px from a stylesheet injected at runtime, which is precisely the shape
 * of the defect this gate was written for -- a state-dependent measure moving the plate -- and
 * the run fails if that goes unnoticed. */
if (SELF_TEST) {
  console.log("\n  ── the seed: a ledger that widens must be caught ───────────");
  await open("", 1440, 900);
  const before = await read();
  await page.addStyleTag({ content: "[data-atlas].atlas-shell.atlas-instrument{--at-ledger:546px}" });
  await page.waitForTimeout(SETTLE);
  const after = await read();
  ok("a 60px ledger widening is detected as a plate move",
     !!before && !!after && rectMoved(before, after),
     "the detector did not fire on a seeded violation — it is no longer checking anything");
}

await browser.close();
server.close();

console.log(failures === 0
  ? "\n[stability] the aperture is invariant across every state change tested"
  : `\n[stability] ${failures} failure(s) — the plate moved for a reason that was not the reader`);
process.exit(failures === 0 ? 0 : 1);
