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

  /* 1 · NO ROW COMES APART BY ACCIDENT.
   *
   * Rows are `display:contents`, so a row is only a row because its cells landed on the same
   * grid line. Cell count per row must equal the deck's TRACK count -- one child too many and
   * the last one wraps into an implicit row, which is a status word detached from its contract
   * and looks like nothing at all until you measure it.
   *
   * ONE CELL IS ALLOWED OFF THE LINE, AND ONLY BY SPANNING IT. Where the ledger's measure will
   * not hold every track -- a phone, or a conditioned cohort below 1340 where the comparison
   * column takes a sixth -- the STATUS stops being a column and becomes a full-width line
   * directly under the row that owns it. That is the opposite of the failure above rather than
   * an instance of it: the cell has not fallen off the end of a line it was meant to be on, it
   * has been GIVEN the whole next line, and it is still emitted inside its own row element, so
   * it cannot detach from the contract it qualifies.
   *
   * So the exception is drawn as narrowly as it can be: a cell may leave the line only if its
   * own `grid-column` spans every track, and it must then sit BELOW its row's other cells. A
   * status that merely wrapped, drifted or landed beside the wrong row still fails. */
  /* A TRACK THE DECK DECLARES AS RESERVED IS CLAIMED BY NOTHING, ON PURPOSE.
     The comparison column's WIDTH is held open before the comparison exists, so the resting
     columns do not shift when it arrives, while no `.at-dc-vs` cell and no `VS ARCHIVE` heading
     is rendered -- which is what check-atlas-acceptance requires of a cohort that IS the archive.
     The rule below is unchanged in strength: every track is still claimed by exactly one cell,
     less a count the DECK PUBLISHES rather than a tolerance this gate grants. A cell that goes
     missing still fails, because the offset does not move when it does. */
  const reserved = Number(deck.getAttribute("data-reserved-tracks") || 0);
  const tracks = getComputedStyle(deck).gridTemplateColumns.trim().split(/\s+/).length - reserved;
  const spansTheRow = (c) => {
    const cs = getComputedStyle(c);
    return cs.gridColumnStart === "1" && cs.gridColumnEnd === "-1";
  };
  const rows = [...deck.querySelectorAll(".at-deck-row")];
  if (!rows.length) bad.push("the deck rendered no rows");
  for (const row of rows) {
    const all = [...row.children].filter((c) => c.classList.contains("at-dc"));
    const label = row.getAttribute("data-outcome") || row.getAttribute("data-deck-group")
      || (row.classList.contains("at-deck-head") ? "HEAD" : "row");
    const cells = all.filter((c) => !spansTheRow(c));
    const below = all.filter(spansTheRow);
    /* THE COUNT IS OF CELLS THAT ARE ON THE LINE, WHICH IS WHAT THE RULE WAS ALWAYS ABOUT.
     *
     * This compared EVERY cell against the track count, which was the same number while the
     * status still occupied a 0px track and spanned it. It no longer does: the status has no
     * track at any width, so a row emits one more element than the deck has columns and this
     * read it as the wrap it exists to catch.
     *
     * The property is unchanged and so is its sharpness. A cell may leave the line ONLY by
     * spanning every track, and it must still sit below its row -- both asserted below. What is
     * counted here is the cells that claim a column: too few and a row is short, too many and one
     * of them really has wrapped into an implicit row where it detaches from its contract. A
     * status that merely drifted still fails, because it would not span. */
    if (cells.length !== tracks) {
      bad.push(`${label}: ${cells.length} cells on the line against ${tracks} tracks`
        + `${below.length ? ` (${below.length} spanning below)` : " — the last one wraps"}`);
      continue;
    }
    const tops = cells.map((c) => Math.round(rect(c).top));
    /* AND THE SUB-LINE IS UNDER ITS OWN ROW, not above it and not beside it. */
    for (const c of below) {
      const t = Math.round(rect(c).top);
      if (tops.length && t < Math.min(...tops) - 1) {
        bad.push(`${label}: a full-width cell sits ABOVE the row it belongs to`);
      }
    }
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
    ".at-dc, .at-clause, .at-cohort-n, .at-question-text, .at-fig, .at-foot-line, "
    + ".at-say-text, .at-plate-caption, .at-classkey-item")) {
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
     forecast, the environment's coverage -- and all of them ship open.
     
     ONE KIND IS ALLOWED TO SHIP CLOSED, AND IT PAYS FOR THE PRIVILEGE IN ITS SUMMARY. A caveat
     may be collapsed to its FINDING with its ARGUMENT behind the disclosure -- that is the
     difference between shortening a qualification and hiding one -- but only if the summary
     states the finding as a sentence a reader can act on. "MORE" or "DETAILS" over a hidden
     caveat is the exact move this rule exists to forbid, so a closed disclosure whose summary is
     a label rather than a statement fails here as loudly as a hidden refusal. */
  for (const d of deck.querySelectorAll("details")) {
    if (d.open) continue;
    const sum = ((d.querySelector("summary") || {}).textContent || "").trim();
    if (!d.hasAttribute("data-weighting-note")) {
      bad.push(`a deck disclosure is closed: ${sum}`);
    } else if (sum.split(/\s+/).length < 8 || !/[a-z]/.test(sum)) {
      bad.push(`a collapsed caveat states no finding in its summary: "${sum}"`);
    }
  }

  /* 4 · WHAT IS FOLDED IS COUNTED AND NAMED, never silently dropped. */
  /* THE FOLD IS A LINE OF ITS OWN NOW RATHER THAN A NINTH COLUMN -- at a 486px measure a track
     spent on a control is a track taken from an outcome name -- but the rule is unchanged: what
     is folded is counted and named, never silently dropped. */
  const foldBtn = deck.querySelector("[data-timing-fold]");
  const timingFolded = deck.hasAttribute("data-timing-folded");
  if (timingFolded && !foldBtn) bad.push("columns are folded with no control to restore them");
  if (foldBtn) {
    const t = (foldBtn.textContent || "").trim();
    if (timingFolded && !/TIMING/.test(t)) bad.push(`the fold does not name TIMING: "${t}"`);
    /* AND IT MUST NOT NAME THE INTERVAL, because the interval is not a column at any width. It
       shares the rate's cell everywhere -- "53.3% [48.5-58.2%]" is one statement -- so a control
       offering to restore it would be a control that lies about the state. */
    if (/INTERVAL/.test(t)) bad.push(`the fold offers to restore an interval that never left: "${t}"`);
    note.push("fold:" + t);
  }
  /* THE RATE, ITS COUNT AND ITS INTERVAL ARE ONE ROW AT EVERY WIDTH, and that is asserted rather
     than merely arranged. Panel rule 1 -- a published rate implies a count and an interval on
     the same row -- does not relax at a narrower viewport, and a hover-only title is not an
     interval a touch reader can reach.
     ON THE ROW, NOT IN THE CELL. The shared cell was one implementation of the rule, chosen when
     the interval had no heading of its own; the frozen research table heads it `95% WILSON` and
     gives it a track. `.at-dc-int` is still the element it is checked through, and it must be
     VISIBLE -- a track scrolled off the side of the ledger is not on the row a reader can see. */
  for (const row of deck.querySelectorAll("[data-outcome]")) {
    const rate = row.querySelector(".at-dc-rate");
    if (!rate || !/\d[\d,.]*\s*%/.test(rate.textContent || "")) continue;
    const ci = row.querySelector(".at-dc-int");
    const count = row.querySelector(".at-dc-count");
    if (!ci || !/\d/.test(ci.textContent || "") || !shown(ci)) {
      bad.push(`${row.getAttribute("data-outcome")}: a rate without its interval on the same row`);
    }
    if (!count || !/\d/.test(count.textContent || "") || !shown(count)) {
      bad.push(`${row.getAttribute("data-outcome")}: a rate without its count on the same row`);
    }
  }
  /* AND THE TWO CONDITIONAL COLUMNS ARE CONSISTENT WITH WHAT THE ROWS HOLD. The allocation may
     drop VS ARCHIVE and STATUS -- see evidence-deck.jsx -- but never while a row has something
     to put in them. This is the rule check-atlas-states asserts per row, stated per deck. */
  const hasStatusCol = !!deck.querySelector(".at-deck-head .at-dc-status");
  if (!hasStatusCol && deck.querySelector("[data-outcome] [data-refusal]")) {
    bad.push("a row is refused and the deck is rendering no status column");
  }
  note.push("deck-mode:" + (deck.getAttribute("data-deck-mode") || "?"));
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
      /* ONE APERTURE BOUND. The hard 500px height cap went with the stacked shell; the 1.67
         FLOOR -- "the plate may not be taller than the archive's own frame fills" -- went with
         the declared band, because under it the plate takes the band so that the figure column
         and the answer end on one baseline, and a ceiling on its height is 150px of paper under
         the map with the answer running past it. The surplus is ocean rather than blank page.
         What remains is the bound about legibility rather than surplus: past 3.2 a single East
         Pacific track stops being the subject of its own plate, and that one holds at every
         width, including the stacked ones where the plate is capped and centres instead. */
      const ar = b.width / b.height;
      if (b.width <= 2001 && ar > 3.202) {
        bad.push(`plate aspect ${ar.toFixed(3)} above the 3.2 ceiling`);
      }
      note.push("aspect:" + ar.toFixed(3));
    } else {
      /* STACKED, THE FIGURE IS CAPPED SO THAT THE ANSWER IS ON THE FIRST SCREEN.
         A stated 392px figure was the right rule when the stack put the whole evidence ledger
         under the map: the figure was the first thing and the reader scrolled to the table
         either way. Under the composition the stack is PLATE -> ANSWER -> MATRIX and the
         contract requires the sample and at least two numerical findings to clear the fold at
         1024x768 -- which a 392px figure does not allow. So the height is a CAP read from the
         viewport, 30vh to 300px and 17vh to 155px on a phone, and what is asserted is the cap
         rather than a constant. check-atlas-contract.mjs asserts the consequence: what actually
         clears the fold.

         30vh, NOT 26. The figure was 26vh capped at 205px, which at 1024x768 made a 639px plate
         inside a 972px column -- a strip with a 333x220 rectangle of paper beside it, because
         only the PLATE narrowed while its head, key and caption kept the band's width. The
         figure is centred as one block now and the share went up with the fold budget that a
         one-line caption freed. The ceiling is 300 rather than 205 because on a tall stacked
         viewport the share is not what binds: 768x1024 has the height to give and the aspect
         floor is what stops the plate, at 716x300. */
      const cap = vw <= 480 ? Math.min(0.17 * innerHeight, 155) : Math.min(0.30 * innerHeight, 300);
      if (b.height > cap + 2) {
        bad.push(`plate is ${Math.round(b.height)}px, past the ${Math.round(cap)}px cap the `
          + "stack allows it");
      }
      note.push("plate-figure:" + Math.round(b.height));
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
  ["two columns    1280-1439", 1320, 860],
  ["two columns    1180-1279", 1220, 820],
  ["two columns     900-1179", 1024, 768],
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
   So the shape is read at each width and asserted to be the one the specification names -- which
   also pins the boundary, since a step that moved would show up here as the wrong column count
   rather than as a layout that merely still fits.

   THE LADDER IS SHORTER THAN IT WAS, AND THAT IS THE FROZEN FRAME'S DOING RATHER THAN AN
   OMISSION. Three rungs were retired by the resting instrument, and each is asserted below as an
   INVARIANT instead -- which is a stronger statement than a rung, not a weaker one:

     the interval   used to move into the rate's cell at 1280. It is its own column at every
                    width now, asserted per row in the audit above.
     the timing pair used to be resident at >=1440 and fold below it, so the most-read table on
                    the surface had two shapes depending on the monitor. The frozen ledger is
                    OUTCOME | n / N | RATE | 95% WILSON at every width, and the two duration
                    columns are behind their named control everywhere -- including at 2560.
     the groups     used to fold behind a `+ N` chevron below 1180. Nothing folds now: every
                    contract, including every refused one, is resident at every width. A
                    qualification one interaction from view is a qualification a reader does
                    not apply, and the narrow ledger has the measure for them because the bar
                    and the duration columns left.

   WHAT STILL STEPS IS THE SHELL, ONCE, AND IT STEPS AT 1180 NOW. Plate and the eight-row answer
   side by side above it; PLATE -> ANSWER -> MATRIX stacked below. It moved from 900 because the
   answer is eight rows rather than a scrolling column: two columns at 1024 give it 350px, which
   is a rate and its outcome name on separate lines.

   THE INSPECTOR IS AN OVERLAY ON BOTH SIDES OF THAT STEP -- it never takes a column of the band,
   so the plate's width, and therefore its aperture, is not a function of whether a storm is
   selected. It cannot reach the evidence at any width now, because the evidence is under the
   band rather than beside it; the reading below still asserts it, because "the overlay does not
   cover the reader's table" is the property, and a property that holds by construction today is
   the one worth pinning before a later construction changes. */
console.log("\n[responsive] the ladder gives up what it says it gives up, where it says it does");
const LADDER = [
  [1920, 1080, { columns: 2, dock: "over the plate", timing: true, groups: false }],
  [1440, 900,  { columns: 2, dock: "over the plate", timing: true, groups: false }],
  [1320, 860,  { columns: 2, dock: "over the plate", timing: true, groups: false }],
  [1220, 820,  { columns: 2, dock: "over the plate", timing: true, groups: false }],
  [1024, 768,  { columns: 1, dock: "over the plate", timing: true, groups: false }],
  [900, 900,   { columns: 1, dock: "over the plate", timing: true, groups: false }],
  [880, 1180,  { columns: 1, dock: "over the plate", timing: true, groups: false }],
];
for (const [w, h, want] of LADDER) {
  await open(`i=cat4&storm=${pick}`, w, h);
  const got = await page.evaluate(() => {
    const deck = document.querySelector("[data-evidence-deck]");
    const dock = document.querySelector("[data-inspector-dock]");
    const row = document.querySelector(".atlas-plate-row");
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const hits = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right
      && a.top < b.bottom && b.top < a.bottom;
    const d = box(dock), led = box(document.querySelector(".atlas-evidence"));
    return {
      /* THE ROW'S OWN TRACK LIST, which is the thing the plate's width is computed against. */
      columns: getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length,
      /* AN OVERLAY THAT REACHES THE EVIDENCE HAS TAKEN THE READER'S TABLE AWAY, not just the
         map's right-hand margin. The dock is allowed over the plate and nothing else. */
      dock: !dock ? "absent" : hits(d, led) ? "over the evidence" : "over the plate",
      timing: deck.hasAttribute("data-timing-folded"),
      groups: !!deck.querySelector("[data-group-fold]"),
    };
  });
  const diff = Object.keys(want).filter((k) => want[k] !== got[k]);
  ok(`${String(w).padStart(4)}px  ${got.columns} column${got.columns === 1 ? "" : "s"}`
     + ` · timing ${got.timing ? "folded" : "resident"}`
     + ` · groups ${got.groups ? "folded" : "resident"}`
     + ` · inspector ${got.dock}`,
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
    /* READ OFF THE ANSWER, WHICH IS WHAT SITS BESIDE THE PLATE NOW. The five were read off the
       deck when the deck held the right-hand column; it is under the band at page width, and
       the eight-row answer is what a reader sees without scrolling. Same five things, same
       viewport, same bar -- the element that has to satisfy them moved. */
    const rows = [...document.querySelectorAll("[data-finding]")];
    const quals = rows.map((r) => r.querySelector(".at-ans-st"))
      .filter((e) => e && vis(e) && e.textContent.trim())
      .concat([...document.querySelectorAll("[data-limits-pointer]")].filter(vis));
    return {
      question: vis(document.querySelector("[data-question]")),
      cohort: vis(document.querySelector("[data-cohort-size]"))
        && rows.some((r) => vis(r.querySelector(".at-ans-sup") || r)),
      map: vis(document.querySelector(".at-plate")),
      outcomes: rows.map((r) => r.querySelector(".at-ans-rate")).filter(vis).length > 0,
      qualification: quals.length > 0,
      smallestType: Math.min(...[...document.querySelectorAll(
        ".at-ans-label, .at-ans-rate, .at-question-text")]
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
