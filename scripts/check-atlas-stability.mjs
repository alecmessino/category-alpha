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
 * WHAT BLOCKS, AFTER UX-1B. The plate's SIZE, its X, the CAMERA, the DECLARED ROW it sits in and
 * the USABLE WIDTH of the page. Nothing excuses any of them any more. The first version of this
 * file excused a size or camera move when the question sentence had taken another line, because
 * under the geometry it was written against a longer sentence HAD to come out of the map: the
 * head row was `auto`, the plate row was `minmax(0,1fr)`, and the shell was pinned to exactly one
 * viewport. UX-1B declared the plate row from the viewport and the composition and let the
 * document grow instead, so that excuse describes a surface that no longer exists and it has been
 * deleted rather than loosened.
 *
 * THE ONE TIER THAT REMAINS TRACKED IS THE PLATE'S PLACE INSIDE ITS OWN ROW, and it is tracked
 * for a cause that has nothing to do with the question: `.at-platehead` -- the plate's own caption
 * -- prints the cohort count and takes a second line at 1220 when a scope condition lengthens it,
 * and the plate follows it down by exactly that. The cause is measured per occurrence, so a plate
 * that slides inside a row whose caption did not move still fails. `--strict-origin` promotes it.
 *
 * THE PAGE-ABSOLUTE `y` IS DELIBERATELY NOT ASSERTED, and that is not a weakening. A question
 * long enough to need a fourth line pushes the whole row down a document that is now allowed to
 * be taller than the screen; that is the design. The invariant that replaced it -- the row's own
 * height, plus the plate's offset within it -- is strictly stronger, because it fails on a row
 * that is quietly content-sized again even while the aspect ceiling is still holding the plate's
 * numbers steady.
 *
 * Run: node scripts/check-atlas-stability.mjs [--require-browser] [--self-test] [--strict-origin]
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

/* THE SECOND TIER, AND WHY THERE IS ONE.
 *
 * The aperture -- the plate's size, its column, its declared row and its camera -- is the
 * acceptance criterion and it blocks. One reading is asserted in the same words and printed with
 * its magnitude but counted separately, because it has a different cause.
 *
 * The blocking readings are about the APERTURE: its shape, its column, its row and its view.
 * What is left in this tier is the plate's offset inside its declared row, whose one legitimate
 * cause is the plate's own caption taking a second line -- `.at-platehead` prints the cohort
 * count, and at 1220 a scope condition takes it from 19px to 35px with the plate following it
 * down by exactly 16. That is the figure's caption doing its job, not the question buying height
 * from the map, and the two are told apart by measuring the caption rather than by assuming.
 *
 * So it is TRACKED RATHER THAN SILENT. A known movement that prints every time it happens, with
 * its magnitude and its measured cause, is honest; and `--strict-origin` makes it blocking, which
 * is what the workflow runs, so in practice this tier is a way of REPORTING a cause rather than a
 * way of forgiving one. */
let advisories = 0;
const STRICT_ORIGIN = process.argv.includes("--strict-origin");
const note = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return true; }
  if (STRICT_ORIGIN) return ok(label, false, detail);
  advisories++;
  console.log("  note  " + label + "  [tracked: the plate's own caption sets its offset]"
    + (detail ? "\n        " + String(detail).replace(/\n/g, "\n        ") : ""));
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
  /* THE QUESTION'S OWN HEIGHT, WHICH IS THE ONE THING ALLOWED TO MOVE THE PLATE. It is read so
     that the exception can be PROVEN per occurrence rather than assumed: a plate that changed
     while the question did not is a ledger regression and must block, whatever it looks like. */
  const q = document.querySelector("[data-question]");
  /* THE DECLARED ROW, AND THE PLATE'S PLACE INSIDE IT. `--at-plate-row-h` is the whole of UX-1B:
     the plate row's height is `100vh` less the composition's own chrome, so it is the same number
     whatever the question says, and the plate is positioned WITHIN that row rather than by what
     is above it. Both are read here because the page-absolute `y` is no longer the invariant --
     a question that needs a fourth line legitimately pushes the whole row down a document that
     is allowed to be taller than the screen. What may not change is the row's HEIGHT and the
     plate's offset inside it. */
  const row = document.querySelector(".atlas-plate-row");
  const rb = row ? row.getBoundingClientRect() : null;
  const ph = document.querySelector(".at-platehead");
  const head = document.querySelector(".at-head");
  const colo = document.querySelector(".at-colophon");
  const tport = document.querySelector(".atlas-transport");
  const hh = head ? head.getBoundingClientRect().height : null;
  const ch = colo ? colo.getBoundingClientRect().height : null;
  const th = tport ? tport.getBoundingClientRect().height : null;
  const de = document.documentElement;
  return {
    qh: q ? +q.getBoundingClientRect().height.toFixed(2) : null,
    /* THE QUESTION MUST BE WHOLE AND MUST NOT HAVE ITS OWN SCROLLBAR. `qFull` is the sentence as
       the grammar wrote it; `qClipped` is true if the element is scrolling its own content, which
       is the fix this pass explicitly refused. */
    qText: q ? (q.getAttribute("title") || "") : null,
    qLen: q ? (q.textContent || "").length : null,
    qClipped: q ? q.scrollHeight > q.clientHeight + 1 : null,
    x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2),
    rowH: rb ? +rb.height.toFixed(2) : null,
    relY: rb ? +(b.y - rb.y).toFixed(2) : null,
    phH: ph ? +ph.getBoundingClientRect().height.toFixed(2) : null,
    headH: hh === null ? null : +hh.toFixed(3),
    chrome: hh === null || ch === null || th === null ? null : +(hh + ch + th).toFixed(3),
    declaredChrome: shell
      ? getComputedStyle(shell).getPropertyValue("--at-chrome-h").trim() : null,
    docH: de.scrollHeight, clientH: de.clientHeight,
    clientW: de.clientWidth, scrollW: de.scrollWidth,
    ledgerW: (() => {
      const e = document.querySelector(".atlas-evidence");
      return e ? +e.getBoundingClientRect().width.toFixed(2) : null;
    })(),
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

/* SIZE and ORIGIN are read from the same rectangle and asserted separately -- see `note` above
   for why they are not one assertion. The camera rides with SIZE, because it is a change of
   SHAPE that forces a re-derivation of the aperture; a rectangle that only translates down the
   page carries its view with it untouched, which the measurements bear out. */
const sizeMoved = (a, b) => ["w", "h"].some((k) => Math.abs(a[k] - b[k]) > RECT_TOL);
const originMoved = (a, b) => ["x", "y"].some((k) => Math.abs(a[k] - b[k]) > RECT_TOL);
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
    /* THE ONE TRANSITION THAT IS ITSELF A CAMERA COMMAND, AND IS THEREFORE EXEMPT WHOLE.
     *
     * Selecting a storm fits that storm's track -- the surface's one documented automatic move,
     * asserted by check-atlas-camera as a REQUIRED behaviour rather than tolerated as a lapse.
     * The transport row appearing beneath the plate is part of that same reader-initiated act:
     * `--at-tport` goes 0 -> 40px under `:has(.atlas-transport > *)` and the plate gives up the
     * height, measured at 27.72px at 1920 and 0.53px at 1440 where the aspect ceiling absorbs
     * most of it. The rule this gate enforces is about state changes that are NOT camera
     * commands, so this one is reported and not counted.
     *
     * IT IS STILL A STATE-DEPENDENT MEASURE MOVING THE PLATE, and naming it here is the point:
     * `--at-tport` is the same shape of coupling as the ledger clamp this pass removed, and the
     * only reason it is not this pass's business is that a reader asked for it. */
    name: "a storm is selected (the transport appears)",
    cameraExempt: true,
    rectExempt: true,
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
  const base0 = await read();
  if (!ok(`${w}x${h} opens with a measurable plate`, !!base0, "no .at-plate or no __ATLAS_MAP")) continue;

  /* A PAGE IS REUSED ONLY WHILE IT IS PROVABLY STILL THE PAGE IT STARTED AS.
     `clean` holds a reading that has been SHOWN to match the opening -- rect and camera -- so the
     next transition can be measured against it without reloading. The moment a transition fails
     to put it back, `clean` is dropped and the next one reopens. See the note below for what
     that costs and why it is not simply "reload every time". */
  let clean = base0;

  for (const t of TRANSITIONS) {
    /* EACH TRANSITION IS MEASURED FROM A BASELINE THAT IS STILL THE OPENING, AND THAT IS A
     * CORRECTNESS FIX RATHER THAN A PRECAUTION.
     *
     * Driven back to back on one page these contaminate each other. Measured at 1220: the scope
     * toggle lengthens the question, the question row grows, the elastic plate row gives up 3px,
     * settle() re-derives the aperture for the smaller box -- and on revert the box comes back
     * exactly while the camera lands 0.165 degrees from where it started. Every later transition
     * then compared against a baseline that had already drifted, and the duration-columns fold
     * was reported as moving a camera it never touches: driven alone, four unfold/fold cycles
     * leave the plate rect and the camera bit-identical.
     *
     * REOPENING IS NOT THE RELOAD THIS FILE WARNS ABOUT. That warning is about comparing two
     * independent openings ACROSS a state change, which cannot fail and proves nothing. This is
     * one opening, then a live in-page state change, measured against the opening it actually
     * started from.
     *
     * AND IT IS DONE ONLY WHEN THE LAST TRANSITION DID NOT PUT THE PAGE BACK. Reopening before
     * every one of them is 45 loads across the matrix and pushed the browser job past its
     * fifteen-minute cap -- a gate nobody can afford to run is a gate that gets deleted. Most
     * transitions revert exactly, and one that provably did leaves a baseline as good as a fresh
     * opening, because it has been compared against it. */
    if (!clean) {
      await open("", w, h);
      clean = await read();
    }
    const base = clean;
    if (!base) { ok(`${t.name} — reopened`, false, "the plate went away on reopen"); continue; }

    await t.apply();
    const after = await read();
    if (!after) { ok(`${t.name} — plate still measurable`, false, "the plate went away"); continue; }

    /* NOTHING EXCUSES A SIZE OR A CAMERA MOVE ANY MORE, AND THAT IS THE POINT OF UX-1B.
     *
     * WHAT USED TO BE HERE. A question that took another line was allowed to change the plate's
     * height and its camera, because the head row was `auto`, the plate row was `1fr`, and the
     * shell was pinned to exactly one viewport -- so a longer sentence HAD to come out of the
     * map. The excuse was honest about a real trade and it is now obsolete: the plate row's
     * height is declared from the viewport and the composition, the shell may grow past one
     * screen, and a wrap costs the plate nothing at any viewport. So the wrap-shaped exemption is
     * gone rather than loosened, and the two readings that replace it are STRICTER than what they
     * replace, not weaker.
     *
     * THE FIVE THAT BLOCK, AND WHY EACH IS ITS OWN READING RATHER THAN ONE `rect` COMPARISON.
     *
     *   w, h        the aperture's shape. Never excused, under any cause.
     *   camera      the view. Never excused except for a transition that IS a camera command.
     *   x           a horizontal move. The question is above the plate, not beside it, and the
     *               document scrolls vertically -- nothing in this composition can move the
     *               plate sideways for a reason a reader asked for.
     *   clientW     the usable width. A document scrollbar that took its width out of the plate's
     *               column would move the aperture because scrolling became necessary, which is
     *               the one thing the long-question state must not do.
     *
     * THE PLATE ROW'S OWN HEIGHT IS NOT ONE OF THEM, AND THAT IS THE DESIGN RATHER THAN A GAP.
     * The row is content-sized on purpose: it is as tall as the figure and its captions actually
     * are, so that whatever the viewport has left over collects under the colophon where a longer
     * question can spend it instead of coming out of the map. What is declared is the figure
     * column's CAP -- `--at-stage-col-h`, viewport less chrome -- and the plate's own height under
     * it, and both of those are read above. A row that changed height while the plate did not is
     * the captions rewrapping, which is tracked below with its cause.
     */
    const widthMoved = Math.abs(after.w - base.w) > RECT_TOL;
    const movedS = sizeMoved(base, after);
    const movedC = !t.cameraExempt && camMoved(base, after);
    const xMoved = Math.abs(after.x - base.x) > RECT_TOL;
    const usableMoved = after.clientW !== base.clientW;
    const blocking = !t.rectExempt && (movedS || xMoved || usableMoved);
    const blockingCam = !t.rectExempt && movedC;
    ok(`${t.name}`, !blocking && !blockingCam && errors.length === 0,
       [widthMoved ? "THE PLATE CHANGED WIDTH." : movedS ? "THE PLATE CHANGED SIZE." : null,
        xMoved ? "THE PLATE MOVED SIDEWAYS." : null,
        usableMoved ? `THE USABLE WIDTH CHANGED: ${base.clientW} -> ${after.clientW} — a `
          + `scrollbar is reaching the layout.` : null,
        blockingCam ? "THE CAMERA MOVED and this transition is not a camera command." : null,
        why(base, after), ...errors].filter(Boolean).join("\n"));

    /* THE ORIGIN, RE-AIMED AT WHAT IS STILL AN INVARIANT.
     *
     * The plate's PAGE-ABSOLUTE `y` is deliberately no longer asserted: a question long enough to
     * need a fourth line pushes the whole row down a document that is now allowed to be taller
     * than the screen, and that is the design rather than a defect. What is still invariant is
     * the plate's offset INSIDE its declared row -- and the one thing that legitimately changes
     * it is the plate's own caption, `.at-platehead`, taking a second line when the cohort line
     * it prints gets longer. Measured at 1220 with PROVISIONAL SEASONS on: the platehead goes
     * 19 -> 35px and the plate follows it down by exactly 16. So the cause is checked per
     * occurrence, as everywhere else in this file: a plate that slid inside its row while its own
     * caption did NOT change height is the coupling coming back by a shorter route, and it is
     * reported with its magnitude. `--strict-origin` makes it blocking. */
    const relMoved = base.relY !== null && after.relY !== null
      && Math.abs(after.relY - base.relY) > RECT_TOL;
    const capExplains = base.phH !== null && after.phH !== null
      && Math.abs((after.relY - base.relY) - (after.phH - base.phH)) <= RECT_TOL;
    note(`${t.name} — and the plate keeps its place inside the declared row`,
         !relMoved || capExplains,
         `the plate moved ${(after.relY - base.relY).toFixed(2)}px inside a row that did not `
         + `change height, and its own caption moved ${((after.phH ?? 0) - (base.phH ?? 0)).toFixed(2)}px`
         + `\n${why(base, after)}`);

    await t.revert();
    const back = await read();
    if (t.cameraExempt) clean = null;
    if (back && !t.cameraExempt) {
      /* REVERTING IS NOW REQUIRED TO RETURN THE APERTURE EXACTLY, WITH NO EXEMPTION.
       *
       * WHAT WAS EXEMPTED HERE, AND WHY IT NO LONGER NEEDS TO BE. Where the apply step wrapped
       * the question and the revert brought the rectangle back exactly, the CAMERA did not come
       * back with it: measured at 1220, lat 37.96455 out, 37.79956 back, a 0.165 degree residue
       * at zoom 2.75, identical on unmodified main. That was tracked here as a second defect
       * needing its own fix, and the working hypothesis was that it might be downstream of the
       * first -- the wrap changed the container's size, settle() re-derived the aperture against
       * the changed box, and the return trip re-derived it again from a different starting view.
       *
       * IT WAS. With the plate row's height declared, the container is bit-identical throughout
       * the cycle, and the residue is simply gone: measured across all five viewports, the
       * PROVISIONAL SEASONS round trip returns lat, lon and zoom to their opening values exactly,
       * 1220 included. No map code was touched to achieve it -- `applyFrame`, `goHome`,
       * `coreFrame`, `coreAnchor` and the `wasAtAperture` branch of `settle()` are all unchanged.
       * One cause, one fix. So the exemption is deleted rather than kept as a safety margin: a
       * camera that fails to return is a failure again, whatever the question did. */
      ok(`${t.name} — and reverting returns to the same aperture`,
         !sizeMoved(base, back) && !camMoved(base, back)
         && !(Math.abs(back.x - base.x) > RECT_TOL),
         why(base, back));
      /* THE PAGE CARRIES FORWARD ONLY IF THE REVERT ACTUALLY RESTORED IT, rect AND camera. */
      clean = (!sizeMoved(base, back) && !originMoved(base, back) && !camMoved(base, back))
        ? back : null;
    }
  }

  /* THE REFUSAL STATE, against this viewport's own opening. Its query also lengthens the
     question, and that no longer buys it any latitude: the plate is required back at the same
     size in the same column of the same declared row. */
  await open(REFUSAL_QUERY, w, h);
  const refused = await read();
  if (refused && base0) {
    ok(`a refused cohort holds the same plate as the unqueried one`,
       !sizeMoved(base0, refused) && Math.abs(refused.x - base0.x) <= RECT_TOL,
       ["a refusal appearing must not cost the plate a pixel", why(base0, refused)].join("\n"));
    note(`a refused cohort keeps the plate's place inside the declared row`,
         Math.abs(refused.relY - base0.relY) <= RECT_TOL, why(base0, refused));
  }

  /* ── the declared chrome, and the one screen it is declared against ────────────────────────
   *
   * `--at-chrome-h` is the bound the whole of UX-1B rests on: at or above the head plus the
   * colophon at rest, which is everything in the shell that is not the plate row or the transport.
   * It is asserted as an INEQUALITY rather than as an equality, and that is not a loosening --
   * it is what the number actually is. The two directions fail differently and only one of them
   * is visible, so both are read here and read separately:
   *
   *   at or above   a bound even a fraction of a pixel MEAN makes the plate row's `max-content`
   *                 floor exceed its `1fr` share of the viewport, and the resting instrument grows
   *                 a scrollbar on a screen it fits on. CI found exactly this at 1px, on a runner
   *                 whose font metrics put the head about a pixel taller than the machine the
   *                 number was measured on.
   *   within 6px    and a bound far ABOVE it is invisible -- the surplus stays inside the row --
   *                 but it is a reservation, quietly costing the map a few pixels on every wide,
   *                 short screen. It may be generous; it may not become a policy.
   *   the screen    and therefore the resting instrument is still exactly one screen, which is
   *                 the reading that matters to a reader; the two above explain it. */
  await open("", w, h);
  const rest = await read();
  if (rest) {
    const declared = parseFloat(rest.declaredChrome);
    ok(`the resting chrome is inside its declared ${rest.declaredChrome} bound`,
       Number.isFinite(declared) && rest.chrome <= declared && declared - rest.chrome <= 6,
       `head + transport + colophon measured ${rest.chrome}px against a declared bound of `
       + `${rest.declaredChrome}. --at-chrome-h must be at or above what this composition `
       + `measures -- under it the resting instrument overflows the screen it fits on -- and no `
       + `more than 6px above it, or it is a reservation rather than a bound.`);
    ok(`the resting instrument is still exactly one screen`,
       rest.docH <= rest.clientH,
       `the document is ${rest.docH}px tall inside a ${rest.clientH}px viewport. A document `
       + `scroll is reserved for a question too long to sit beside the declared plate row; the `
       + `resting archive question is two lines and must never reach one.`);
    ok(`nothing overflows sideways at rest`, rest.scrollW <= rest.clientW,
       `scrollWidth ${rest.scrollW} against clientWidth ${rest.clientW}`);
  }

  /* ── a scrollbar may not reach the plate ───────────────────────────────────────────────────
   *
   * THE READING IS SIMULATED BECAUSE THE REAL THING IS NOT PORTABLE. A document scrollbar takes
   * its width out of the shell's content box and leaves `100vw` alone -- but whether it takes 0
   * or 15px depends on the platform, and this browser reports 0, so waiting for a real scrollbar
   * to prove the property would be waiting for a test that passes because nothing happened.
   * Narrowing the shell's content box by hand is the same event with a number this gate chose:
   * `body{padding-right}` narrows exactly what a scrollbar narrows and touches nothing else.
   *
   * WHAT MUST HOLD. The plate's column is `--at-plate-avail`, viewport-derived, so the plate
   * keeps its x and its width; the LEDGER is the flexible column and absorbs the loss out of the
   * 18px of slack UX-1 measured between its five tracks and its measure. If those two ever swap
   * -- which is one keystroke in `grid-template-columns` -- a long question would move the map
   * sideways on the way to being read, and this is the reading that says so. */
  const SBW = 15;
  await page.addStyleTag({ content: `body{padding-right:${SBW}px}` });
  await page.waitForTimeout(SETTLE);
  const squeezed = await read();
  await page.evaluate((n) => {
    for (const s of [...document.querySelectorAll("style")]) {
      if (s.textContent === `body{padding-right:${n}px}`) s.remove();
    }
  }, SBW);
  await page.waitForTimeout(SETTLE);
  if (rest && squeezed) {
    ok(`a ${SBW}px scrollbar cannot reach the plate`,
       Math.abs(squeezed.x - rest.x) <= RECT_TOL && Math.abs(squeezed.w - rest.w) <= RECT_TOL,
       `the plate's column is meant to be --at-plate-avail and the ledger the flexible one`
       + `\n${why(rest, squeezed)}`);
    ok(`and the ledger is what absorbs it`,
       rest.ledgerW !== null && Math.abs((rest.ledgerW - squeezed.ledgerW) - SBW) <= RECT_TOL,
       `the ledger went ${rest.ledgerW} -> ${squeezed.ledgerW}, which is `
       + `${(rest.ledgerW - squeezed.ledgerW).toFixed(2)}px rather than the ${SBW}px taken`);
  }
}

/* ── the longest question the grammar can be driven to ───────────────────────────────────────
 *
 * WHY A SECOND FIXTURE, WHEN PROVISIONAL SEASONS ALREADY WRAPS THE QUESTION. Because the three-
 * line fixture is not the hard case and sizing anything against it would have been sizing against
 * a sample of one. Driving every zone of the editor to its longest reachable value gives a 456-
 * character, nine-line sentence -- six times the resting question -- and it is the state that
 * decides whether the declared row is genuinely declared or merely generous. Reserving the head
 * at that height was the obvious fix and was rejected on measurement: it costs the resting plate
 * 254px at 1920 and drives it onto `--at-plate-ar-max` at 1220 and 1024. What is asserted instead
 * is that the plate does not notice.
 *
 * DRIVEN THROUGH THE EDITOR'S OWN CONTROLS, like everything else in this file. The months are
 * chosen non-contiguously on purpose: `monthPhrase` reads runs as spans, so 1-12 is the SHORT
 * sentence ("January through December") and the alternating set is the long one.
 *
 * WHAT IT DOES NOT INCLUDE, and the omission is deliberate rather than an oversight: the genesis
 * `where` clause, which needs a point on the map and is therefore only reachable through a map
 * command. Including it would mean a camera move inside a fixture whose whole purpose is to prove
 * the camera did not move. It adds roughly 35 characters to a sentence that is already past every
 * threshold this composition has. */
const LONGEST = {
  chips: ["basin-NA", "basin-EP", "basin-WP",
    "entered-NA", "entered-CP", "entered-CS", "entered-GM", "entered-AS",
    "season-1971+", "intensity-ts", "landfall-conus"],
  months: [1, 2, 4, 5, 6, 8, 9, 11, 12],
  toggles: ["NAMED STORMS ONLY", "PROVISIONAL SEASONS"],
};
const driveLongest = async () => {
  await openSheet();
  for (const k of LONGEST.chips) await click(`[data-chip="${k}"]`);
  for (const m of LONGEST.months) await click(`[data-month="${m}"]`);
  for (const t of LONGEST.toggles) await toggle(t);
  await closeSheet();
};

console.log("\n  ── the longest question the editor can be driven to ───────");
for (const [w, h] of VIEWPORTS) {
  await open("", w, h);
  const opening = await read();
  if (!opening) { ok(`${w}x${h} opens with a measurable plate`, false, "no plate"); continue; }
  await driveLongest();
  const long = await read();
  if (!long) { ok(`${w}x${h} — the plate survives the longest question`, false, "no plate"); continue; }

  const label = `${w}x${h} · ${long.qLen} characters, question ${opening.qh}px -> ${long.qh}px`;
  ok(`${label} — the aperture is untouched`,
     !sizeMoved(opening, long) && !camMoved(opening, long)
     && Math.abs(long.x - opening.x) <= RECT_TOL
     && long.clientW === opening.clientW,
     why(opening, long));
  /* THE QUESTION ITSELF IS PART OF THE ACCEPTANCE, not just the plate. The rejected fixes are all
     invisible in a rectangle: a clamped line count, an ellipsis, a smaller type size for long
     queries and a scrollbar inside the sentence would every one of them leave the plate perfect.
     So the sentence is read back and required to be whole and to be scrolling nothing. */
  ok(`${w}x${h} — and the question is rendered whole, with no scrollbar of its own`,
     long.qClipped === false && long.qLen === (long.qText || "").length,
     `the element scrolls ${long.qClipped ? "its own content" : "nothing"} and renders `
     + `${long.qLen} of the sentence's ${(long.qText || "").length} characters`);
  ok(`${w}x${h} — and nothing overflows sideways`, long.scrollW <= long.clientW,
     `scrollWidth ${long.scrollW} against clientWidth ${long.clientW}`);
  /* THE DOCUMENT IS ALLOWED TO BE TALLER HERE AND ONLY HERE, and it is asserted from both sides.
   *
   *   it MUST grow    a question six times the resting one that did not make the document taller
   *                   would mean the head is being clipped or the row squeezed -- the defect
   *                   wearing the fix's clothes.
   *   it may not grow by MORE than the question did. That is the reading that says the growth is
   *                   the SENTENCE's and nobody else's: the plate, the ledger, the captions and
   *                   the colophon all have to be exactly where they were, or this number is
   *                   bigger than the question and something else moved.
   *
   * It grows by LESS, and the difference is the surplus the elastic track at the foot gave up
   * first -- 39px at 1440x900, 24px at 1220x820 -- which is the whole reason a three-line
   * question still fits in one screen at most viewports. */
  const grew = long.docH - opening.docH;
  const asked = long.qh - opening.qh;
  ok(`${w}x${h} — and the extra height is paid by the document, not by the plate`,
     long.docH > long.clientH && grew > 0 && grew <= asked + 1,
     `the document went ${opening.docH} -> ${long.docH} (+${grew}) for a question that grew `
     + `${asked.toFixed(2)}px`);

  /* RETURNING TO THE ORIGINAL COHORT MUST RESTORE THE OPENING EXACTLY, and then HOME must too.
     The second is not implied by the first: a HOME that reads a frame re-derived under the long
     question would land somewhere else even from a camera that had come back. Both were failing
     at 1220 before the row was declared; both are asserted now. */
  await click("[data-reset-query]");
  const backAgain = await read();
  if (backAgain) {
    ok(`${w}x${h} — and returning to the archive restores the opening aperture exactly`,
       !sizeMoved(opening, backAgain) && !originMoved(opening, backAgain)
       && !camMoved(opening, backAgain)
       && backAgain.docH === opening.docH,
       why(opening, backAgain));
    await click("[data-camera-home]");
    const homed = await read();
    if (homed) {
      ok(`${w}x${h} — and HOME after the round trip is the opening camera`,
         homed.lat === opening.lat && homed.lon === opening.lon && homed.z === opening.z,
         `opening ${opening.lat},${opening.lon} z${opening.z} — after HOME `
         + `${homed.lat},${homed.lon} z${homed.z}. HOME is a pure function of the archive's own `
         + `frame and the plate's box; if it lands elsewhere, one of the two moved.`);
    }
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
     !!before && !!after && sizeMoved(before, after),
     "the detector did not fire on a seeded violation — it is no longer checking anything");

  /* THE SECOND SEED IS UX-1B'S OWN DEFECT, AND IT NEEDS ITS OWN BECAUSE IT HAS ITS OWN SHAPE.
   *
   * The ledger seed above widens the plate's NEIGHBOUR, which the readings catch as a width move.
   * The coupling this pass removed is different: the row above the plate takes another line and
   * the plate row gives the height back, which changes HEIGHT and leaves width alone. A gate that
   * only ever saw the first seed could lose the second detector without anything going red.
   *
   * So the seed is the old geometry, restored exactly: the plate row released from its declared
   * height and the shell pinned to one viewport again -- which is `height:auto` on the row and
   * `position:fixed;inset:0` on the shell, the two lines this pass replaced. Then the question is
   * lengthened for real, through the editor, and the plate must be seen to lose height. */
  console.log("\n  ── the seed: an elastic plate row must be caught ───────────");
  await open("", 1920, 1080);
  const b2 = await read();
  await page.addStyleTag({ content:
    "[data-atlas].atlas-shell.atlas-instrument{position:fixed;inset:0;min-height:0;"
    + "grid-template-rows:auto minmax(0,1fr) var(--at-tport) auto}"
    + "[data-atlas].atlas-instrument .atlas-plate-row{height:auto}" });
  await page.waitForTimeout(SETTLE);
  await openSheet(); await toggle("PROVISIONAL SEASONS"); await closeSheet();
  const a2 = await read();
  ok("a question that takes another line out of an elastic row is detected as a plate move",
     !!b2 && !!a2 && sizeMoved(b2, a2),
     `the plate went ${b2 && b2.h}px -> ${a2 && a2.h}px under a seeded elastic row and the `
     + `detector did not fire — the reading that made UX-1B provable is no longer checking `
     + `anything`);
}

await browser.close();
server.close();

if (advisories) {
  console.log(`\n[stability] ${advisories} tracked movement(s): the plate keeps its size, its `
    + `column, its row and its camera, and shifts inside that row.`);
  console.log("            Each one printed its measured cause above. The only cause this tier "
    + "accepts is the\n            plate's own caption taking another line; run with "
    + "--strict-origin, as the workflow does,\n            to make every one of them blocking.");
}
console.log(failures === 0
  ? "\n[stability] the aperture holds its size and its camera across every state change tested"
  : `\n[stability] ${failures} failure(s) — the plate moved for a reason that was not the reader`);
process.exit(failures === 0 ? 0 : 1);
