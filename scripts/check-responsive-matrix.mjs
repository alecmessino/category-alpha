#!/usr/bin/env node
/* THE VISUAL RESPONSIVE MATRIX: REAL STATES, AT EVERY BREAKPOINT THE LADDER NAMES.
 *
 * WHY THIS IS NOT THE STATE GATE AGAIN. check-atlas-states drives many states at ONE width and
 * asserts what must be true of the ANSWER: no refused contract publishes a rate, every status
 * sits in its row, the aperture holds. This gate drives a few states at EVERY width and asserts
 * what must be true of the SURFACE -- that nothing is clipped without a way to read it, that no
 * qualification is hidden, that no row's cells come apart, and that the inspector and its bridge
 * survive a viewport narrow enough to take the dock off the plate row.
 *
 * The four failures it is written to catch are the four the acceptance test names, and each of
 * them has already happened at least once in this integration:
 *
 *   CLIPPING              a caption, a status word or a condition ellipsised into meaninglessness
 *   HIDDEN QUALIFICATION  a refusal, a gap note or a denominator caveat that stops being rendered
 *   DETACHED STATUS       a row whose cells fall onto two grid rows, so a STATUS word sits one
 *                         line below the contract it governs -- which is exactly what the folded
 *                         header did while its grid still had seven tracks and it emitted eight
 *                         children
 *   INSPECTOR/BRIDGE      a dock that overflows, a bridge that scrolls out of reach, a transport
 *                         buried under an overlay
 *
 * Run: node scripts/check-responsive-matrix.mjs [--require-browser]
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
    ? "[responsive] playwright is absent and --require-browser was given"
    : "[responsive] SKIPPED, not passed: playwright is absent");
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
    } catch { res.writeHead(404); res.end("nf"); }
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
let errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/net::|ERR_/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
});

const open = async (query, w, h) => {
  errors = [];
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(900);
};

/* ── the audit, run inside the page ───────────────────────────────────────────────────────── */
const AUDIT = (vw) => {
  const bad = [];
  const note = [];
  const rect = (el) => el.getBoundingClientRect();
  const shown = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const b = rect(el);
    return b.width > 0.5 && b.height > 0.5;
  };

  const deck = document.querySelector("[data-evidence-deck]");
  if (!deck) { bad.push("no evidence deck"); return { bad, note }; }

  /* 1 · NO ROW COMES APART.
   *
   * Rows are `display:contents`, so a row is only a row because its cells landed on the same
   * grid line. Cell count per row must equal the deck's TRACK count -- one child too many and
   * the last one wraps into an implicit row, which is a status word detached from its contract
   * and looks like nothing at all until you measure it. */
  const tracks = getComputedStyle(deck).gridTemplateColumns.trim().split(/\s+/).length;
  const rows = [...deck.querySelectorAll(".at-deck-row")];
  if (!rows.length) bad.push("the deck rendered no rows");
  for (const row of rows) {
    const cells = [...row.children].filter((c) => c.classList.contains("at-dc"));
    const label = row.getAttribute("data-outcome") || row.getAttribute("data-deck-group")
      || (row.classList.contains("at-deck-head") ? "HEAD" : "row");
    if (cells.length !== tracks) {
      bad.push(`${label}: ${cells.length} cells against ${tracks} tracks — the last one wraps`);
      continue;
    }
    const tops = cells.map((c) => Math.round(rect(c).top));
    if (Math.max(...tops) - Math.min(...tops) > 1) {
      bad.push(`${label}: cells span ${Math.max(...tops) - Math.min(...tops)}px of vertical — the row is on two lines`);
    }
  }

  /* 2 · NOTHING IS CLIPPED WITHOUT A WAY TO READ IT.
   *
   * An ellipsis is an acceptable answer to a narrow column ONLY when the whole string is one
   * hover away. Anything overflowing its box with no title is a word a reader simply cannot
   * get to. Scroll containers are exempt: overflow there is the design. */
  for (const el of document.querySelectorAll(
    ".at-dc, .at-cond, .at-zone-label, .at-question-text, .at-fig, .at-foot-line, .at-say-text")) {
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const titled = el.title || el.querySelector("[title]")
      || (el.closest("[title]") && el.closest("[title]").title);
    if (!titled) {
      bad.push(`clipped with no title: "${(el.textContent || "").trim().slice(0, 48)}"`);
    }
  }

  /* 3 · NO QUALIFICATION IS HIDDEN.
   *
   * Everything the archive says ABOUT its own numbers has to survive every width: the refusals,
   * the gap notes, the unknown note, the landfall denominator, the group note the interval
   * column used to carry, and the baseline the whole VS ARCHIVE column is measured against.
   * Present in the DOM is not enough -- a 0x0 box or a `display:none` is a hidden qualification
   * with a passing selector. */
  const QUAL = "[data-refusal],[data-archive-gaps],[data-unknown-note],[data-landfall-note],"
    + "[data-group-note],[data-baseline],[data-no-comparison],[data-shared-reason]";
  for (const el of document.querySelectorAll(QUAL)) {
    if (!shown(el)) bad.push(`hidden qualification: ${el.getAttribute("data-refusal") || el.className}`);
  }
  /* AND A DISCLOSURE THAT STARTS CLOSED IS A WAY TO HIDE ONE. Every details element the deck
     owns carries a qualification -- what the rates assume, the pathway's denial of being a
     forecast, the environment's coverage -- and all of them ship open. */
  for (const d of deck.querySelectorAll("details")) {
    if (!d.open) bad.push(`a deck disclosure is closed: ${(d.querySelector("summary") || {}).textContent}`);
  }

  /* 4 · WHAT IS FOLDED IS COUNTED AND NAMED, never silently dropped. */
  const foldBtn = deck.querySelector("[data-timing-fold]");
  const intervalFolded = deck.hasAttribute("data-interval-folded");
  const timingFolded = deck.hasAttribute("data-timing-folded");
  if (timingFolded && !foldBtn) bad.push("columns are folded with no control to restore them");
  if (foldBtn) {
    const t = (foldBtn.textContent || "").trim();
    if (timingFolded && !/TIMING/.test(t)) bad.push(`the fold does not name TIMING: "${t}"`);
    /* AND IT MUST NOT NAME THE INTERVAL, because the interval is not behind it. The interval
       gives up its TRACK below 1280 and keeps its VALUE, in the rate's cell -- a control
       offering to restore something that never left is a control that lies about the state. */
    if (/INTERVAL/.test(t)) bad.push(`the fold offers to restore an interval that never left: "${t}"`);
    note.push("fold:" + t);
  }
  if (intervalFolded) {
    /* THE COLUMN GAVE UP ITS TRACK; THE VALUE STAYED ON THE ROW.
       Panel rule 1 -- a published rate implies a count and an interval on the same row -- does
       not relax at a narrower viewport, and a hover-only title is not an interval a touch reader
       can reach. So every row that prints a rate must still print its bounds, in the cell the
       rate is in. */
    for (const row of deck.querySelectorAll("[data-outcome]")) {
      const rate = row.querySelector(".at-dc-rate");
      if (!rate || !/\d[\d,.]*\s*%/.test(rate.textContent || "")) continue;
      const ci = rate.querySelector(".at-dc-int");
      if (!ci || !/\d/.test(ci.textContent || "")) {
        bad.push(`${row.getAttribute("data-outcome")}: the interval folded and the bounds went with it`);
      }
    }
    note.push("interval-folded");
  }
  for (const g of deck.querySelectorAll("[data-group-fold]")) {
    if (!/\+\s*\d+/.test(g.textContent || "")) bad.push("a folded group does not count its rows");
    note.push("group-folded:" + g.getAttribute("data-group-fold"));
  }

  /* 5 · THE PAGE NEVER SCROLLS SIDEWAYS. */
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) {
    bad.push(`the page scrolls sideways: ${de.scrollWidth} against a ${innerWidth} viewport`);
  }

  /* 6 · THE PLATE. Bounded above 900, a stated fraction of the viewport below it. */
  const plate = document.querySelector(".at-plate");
  if (!shown(plate)) bad.push("the plate is not on screen");
  else {
    const b = rect(plate);
    if (vw >= 900) {
      const ar = b.width / b.height;
      if (!(ar >= 1.419 && ar <= 3.202)) bad.push(`plate aspect ${ar.toFixed(3)} outside [1.421, 3.2]`);
      note.push("aspect:" + ar.toFixed(3));
    } else {
      /* THE BOUND IS OFF BY DESIGN HERE, so what is asserted instead is the thing it was
         switched off in favour of: a stated 40vh, which is a fraction of the viewport rather
         than a shape derived from a layout this width does not have. */
      const share = b.height / innerHeight;
      if (!(share > 0.30 && share < 0.50)) bad.push(`plate is ${(100 * share).toFixed(1)}vh, not the stated 40`);
      note.push("plate-vh:" + (100 * share).toFixed(1));
    }
  }

  /* 7 · THE INSPECTOR AND ITS BRIDGE. */
  const dock = document.querySelector("[data-inspector-dock]");
  if (dock) {
    note.push("dock");
    const db = rect(dock);
    if (!shown(dock)) bad.push("a storm is selected and the inspector is not on screen");
    if (db.right > innerWidth + 1 || db.left < -1) bad.push("the inspector is off the side of the viewport");
    if (db.bottom > innerHeight + 1) bad.push("the inspector runs past the bottom of the viewport");
    /* THE SUBJECT'S NAME IS THE ONE FACT THE INSPECTOR EXISTS TO CARRY, and "rendered" is not
       "on screen": the masthead was once 29px tall around 226px of content, so the name was
       painted in legible ink and clipped out of its own scroll box. Measured against the head's
       visible rectangle, not against the document. */
    const nm = document.querySelector(".at-masthead h2");
    const hd = document.querySelector(".at-insp-head");
    if (!nm || !hd) bad.push("the inspector has no subject masthead");
    else {
      const nb = nm.getBoundingClientRect(), hb = hd.getBoundingClientRect();
      if (nb.height < 8 || nb.top < hb.top - 1 || nb.bottom > hb.bottom + 1) {
        bad.push(`the subject's name is clipped out of the masthead `
          + `(name ${Math.round(nb.top)}-${Math.round(nb.bottom)}, head ${Math.round(hb.top)}-${Math.round(hb.bottom)})`);
      }
    }
    const bridge = document.querySelector("[data-bridge-pinned]");
    if (!shown(bridge)) bad.push("the Storm to Cohort bridge is not on screen with a storm selected");
    else {
      const bb = rect(bridge);
      note.push("bridge");
      if (bb.bottom > db.bottom + 1) bad.push("the bridge hangs below the inspector that pins it");
      if (bb.right > innerWidth + 1) bad.push("the bridge runs off the side of the viewport");
      if (bb.height < 20) bad.push(`the bridge is ${bb.height.toFixed(0)}px tall — crushed, not pinned`);
    }
    /* THE TRANSPORT STAYS REACHABLE. It is how a reader plays the storm the inspector is
       describing, so an overlay that covered it would put the subject on screen and its
       controls underneath the thing describing it. */
    const tport = document.querySelector(".at-transport");
    if (tport && shown(tport)) {
      const tb = rect(tport);
      const covered = tb.top >= db.top - 1 && tb.bottom <= db.bottom + 1
        && tb.left >= db.left - 1 && tb.right <= db.right + 1;
      if (covered) bad.push("the inspector overlay covers the transport");
      note.push("transport");
    }
  }
  return { bad, note };
};

/* ── the matrix ──────────────────────────────────────────────────────────────────────────── */
/* FIVE WIDTHS, ONE PER BAND OF THE LADDER, each a real size rather than the boundary itself:
   a breakpoint tested only at its own pixel proves the rule fires, not that the layout inside
   the band works. */
const VIEWPORTS = [
  ["workstation      >=1440", 1440, 900],
  ["timing folded  1280-1439", 1320, 860],
  ["interval folded 1180-1279", 1220, 820],
  ["groups folded    900-1179", 1024, 768],
  ["one column         < 900", 820, 1180],
];

await open("", 1440, 900);
const pick = await page.evaluate(() => {
  const a = globalThis.__ATLAS.archive;
  for (let i = 0; i < a.nStorms; i++) {
    const s = a.storm(i);
    if (s && s.name && s.max_category && s.landfalls && s.landfalls.length) return s.storm_id;
  }
  return null;
});

/* THE STATES. Five, chosen so that between them every element this gate looks for is on screen
   at least once: a baseline block needs a condition, a refusal needs a cohort small enough to
   trip the gate, a bridge needs a storm, a replay note needs the clock running. */
const STATES = [
  ["the unqueried archive", ""],
  ["a conditioned cohort", "w=12,-105,800&s0=1971"],
  ["below the sample gate", "s0=2022&b=NA&i=cat3"],
  ["a storm selected", `storm=${pick}`],
  ["a storm inside its cohort", `i=cat4&storm=${pick}`],
];

console.log("[responsive] every state, at every width the ladder names");
const reached = new Set();
for (const [vname, w, h] of VIEWPORTS) {
  for (const [sname, query] of STATES) {
    await open(query, w, h);
    const { bad, note } = await page.evaluate(AUDIT, w);
    note.forEach((n) => reached.add(`${w}:${n.split(":")[0]}`));
    ok(`${vname}  ·  ${sname}`, bad.length === 0 && errors.length === 0,
       [...bad, ...errors].join("\n"));
  }
}

/* ── the ladder actually steps ────────────────────────────────────────────────────────────── */
/* A MATRIX THAT PASSED WITHOUT THE LADDER EVER FIRING WOULD PROVE NOTHING ABOUT THE LADDER.
   So the fold state is read at each width and asserted to be the one the specification names --
   which also pins the boundaries, since a step that moved would show up here as the wrong
   column count rather than as a layout that merely still fits. */
console.log("\n[responsive] the ladder gives up what it says it gives up, where it says it does");
const LADDER = [
  [1440, 900, { timing: false, interval: false, groups: false, dockColumn: true }],
  [1320, 860, { timing: true, interval: false, groups: false, dockColumn: true }],
  [1220, 820, { timing: true, interval: true, groups: false, dockColumn: true }],
  [1024, 768, { timing: true, interval: true, groups: true, dockColumn: false }],
  [880, 1180, { timing: true, interval: true, groups: true, dockColumn: false }],
];
for (const [w, h, want] of LADDER) {
  await open(`i=cat4&storm=${pick}`, w, h);
  const got = await page.evaluate(() => {
    const deck = document.querySelector("[data-evidence-deck]");
    const dock = document.querySelector("[data-inspector-dock]");
    const row = document.querySelector(".atlas-plate-row");
    return {
      timing: deck.hasAttribute("data-timing-folded"),
      interval: deck.hasAttribute("data-interval-folded"),
      groups: !!deck.querySelector("[data-group-fold]"),
      /* A DOCK IN THE ROW TAKES A COLUMN OF IT; AN OVERLAY DOES NOT. Read from the plate row's
         own track list rather than from the dock's position, because that is the thing the
         plate's width -- and therefore its aperture -- is actually computed against. */
      dockColumn: !!dock
        && getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length === 2,
    };
  });
  const diff = Object.keys(want).filter((k) => want[k] !== got[k]);
  ok(`${String(w).padStart(4)}px  timing ${got.timing ? "folded" : "resident"}`
     + ` · interval ${got.interval ? "folded" : "resident"}`
     + ` · groups ${got.groups ? "folded" : "resident"}`
     + ` · inspector ${got.dockColumn ? "docked" : "overlaid"}`,
     diff.length === 0, diff.map((k) => `${k}: want ${want[k]}, got ${got[k]}`).join("; "));
}

/* ── the 1280 collapse still answers ──────────────────────────────────────────────────────── */
/* THE DOCUMENTED COLLAPSE MAY DROP TO FOUR OF FIVE, AND MAY NOT DROP BELOW IT. The acceptance
   target is five of five at 1440x900; at 1280 the surface is permitted to give up ONE of the
   five so long as it gives it up through the approved hierarchy -- a folded column with a
   control that names it -- rather than by shrinking type or dropping a qualification. */
console.log("\n[responsive] answer density at the documented 1280 collapse");
{
  await open("s0=2022&b=NA&i=cat3", 1280, 800);
  const d = await page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.top >= -1 && b.bottom <= innerHeight + 1
        && b.left >= -1 && b.right <= innerWidth + 1; };
    const cells = (rs, cs) => [...document.querySelectorAll(rs)]
      .map((r) => r.querySelector(cs)).filter(Boolean);
    const quals = [...document.querySelectorAll(
      "[data-refusal],[data-archive-gaps],[data-unknown-note],[data-landfall-note]")].filter(vis);
    return {
      question: vis(document.querySelector("[data-question]")),
      cohort: vis(document.querySelector("[data-cohort-size]"))
        && cells("[data-deck-group]", ".at-dc-outcome").some(vis),
      map: vis(document.querySelector(".at-plate")),
      outcomes: cells("[data-outcome]", ".at-dc-rate").filter(vis).length > 0,
      qualification: quals.length > 0,
      smallestType: Math.min(...[...document.querySelectorAll(
        ".at-dc-name, .at-dc-rate .at-val, .at-question-text")]
        .map((e) => parseFloat(getComputedStyle(e).fontSize))),
    };
  });
  const names = ["question", "cohort", "map", "outcomes", "qualification"];
  const hits = names.filter((k) => d[k]).length;
  for (const k of names) if (!d[k]) console.log(`  note  1280 gives up: ${k}`);
  ok(`answer density at 1280x800 is ${hits} of 5, and at least 4`, hits >= 4, `${hits} of 5`);
  /* NO BREAKPOINT REDUCES TYPE SIZE TO BUY SPACE, which is the rule the density number would
     otherwise be trivially satisfiable by breaking. */
  ok("and no type size was reduced to get there", d.smallestType >= 11,
     `smallest data type is ${d.smallestType}px`);
}

console.log("\n[responsive] widths that reached an inspector: "
  + [...reached].filter((r) => r.endsWith(":dock")).map((r) => r.split(":")[0]).join(", "));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nevery state holds at every width, and the ladder gives up what it says it does"
  : `\n${failures} responsive check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
