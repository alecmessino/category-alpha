#!/usr/bin/env node
/* THE ACCEPTANCE CRITERION, MEASURED AT FIRST PAINT.
 *
 * At 1920x1080, with nothing scrolled and nothing opened, EIGHT things must be on screen at the
 * same time. Not reachable, not one scroll away, not present in the DOM -- inside the viewport
 * rectangle, with a box that has area.
 *
 *   1  the canonical question          the serif sentence, in the engine's own words
 *   2  the active conditions           all three zones, set or unset, with the boundary legible
 *   3  a focused map                   framed on the research geography, not on the planet
 *   4  the cohort size                 the denominator every rate below is relative to
 *   5  the complete intensity ladder   every rung, TS through Cat 5 -- not the first four
 *   6  a rate AND its Wilson interval  in the same cell, as one statement
 *   7  the archive comparison, or its status, WHERE APPLICABLE
 *   8  the first material qualification  a refusal, a gap note, a denominator caveat
 *
 * WHERE APPLICABLE IS DOING REAL WORK IN 7, and it is the reason this gate drives two states
 * rather than one. Unqueried, the cohort IS the archive: there is no comparison to publish, and
 * the deck says so by not printing a column of "is the archive" thirteen times. So 7 is asserted
 * as a COLUMN in the cohort state and as its correct ABSENCE in the archive state -- and the
 * status column is required in both, because one contract refuses even on the whole archive and
 * a refusal without its word is the failure panel rule 4 exists for.
 *
 * AND NONE OF IT MAY BE BOUGHT BY SHRINKING TYPE. Every data type size is measured with the
 * eight, against the floor the type scale declares. A surface that fitted all eight by dropping
 * the interval to 10px would have passed the letter of the criterion and broken the sentence
 * underneath it.
 *
 * Run: node scripts/check-atlas-acceptance.mjs [--require-browser]
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
    ? "[acceptance] playwright is absent and --require-browser was given"
    : "[acceptance] SKIPPED, not passed: playwright is absent");
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

const open = async (query, w, h) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(900);
};

const EIGHT = () => {
  /* ON SCREEN means inside the viewport rectangle with a box that has area. A `display:none`
     element and one scrolled below the fold are both absent, and both used to satisfy a
     selector. */
  const vis = (el) => {
    if (!el) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && b.top >= -1 && b.bottom <= innerHeight + 1
      && b.left >= -1 && b.right <= innerWidth + 1;
  };
  const deck = document.querySelector("[data-evidence-deck]");
  const rows = [...document.querySelectorAll("[data-outcome]")];
  const intensity = rows.filter((r) => /CATEGORY|TROPICAL/.test(r.getAttribute("data-outcome") || ""));
  const LADDER = ["TROPICAL STORM", "CATEGORY 1", "CATEGORY 2", "CATEGORY 3", "CATEGORY 4",
    "CATEGORY 5"];
  const named = intensity.map((r) => r.getAttribute("data-outcome"));

  /* A RATE AND ITS INTERVAL IN THE SAME CELL. Read off the first row that publishes a rate at
     all: the pair is what must be visible, not merely a percentage. */
  const rated = rows.find((r) => {
    const c = r.querySelector(".at-dc-rate");
    return c && /\d[\d,.]*\s*%/.test(c.textContent || "");
  });
  const rateCell = rated && rated.querySelector(".at-dc-rate");
  const ciInCell = rateCell && rateCell.querySelector(".at-dc-int");

  const quals = [...document.querySelectorAll(
    "[data-refusal],[data-archive-gaps],[data-unknown-note],[data-landfall-note],[data-group-note]")]
    .filter(vis);

  return {
    question: vis(document.querySelector("[data-question]")),
    questionText: (document.querySelector("[data-question]") || {}).textContent || "",
    conditions: [...document.querySelectorAll("[data-zone]")].filter(vis).length === 3,
    map: vis(document.querySelector(".at-plate")),
    cohortSize: vis(document.querySelector("[data-cohort-size]")),
    ladderComplete: LADDER.every((k) => named.includes(k))
      && intensity.every((r) => vis(r.querySelector(".at-dc-rate"))),
    ladderNamed: named.join(", "),
    rateAndCi: !!(rateCell && vis(rateCell) && ciInCell
      && /\d[\d,.]*\s*%/.test(rateCell.textContent || "")
      && /\d/.test(ciInCell.textContent || "")),
    rateSample: rateCell ? rateCell.textContent.replace(/\s+/g, " ").trim() : null,
    vsColumn: !!(deck && deck.querySelector(".at-deck-head .at-dc-vs"))
      && rows.some((r) => vis(r.querySelector(".at-dc-vs"))),
    statusColumn: !!(deck && deck.querySelector(".at-deck-head .at-dc-status")),
    statusVisible: rows.some((r) => {
      const c = r.querySelector(".at-dc-status");
      return c && vis(c) && (c.textContent || "").trim();
    }),
    /* A ROW THAT REFUSES, ANYWHERE IN THE DECK -- above the fold or below it. The column's
       existence is a structural claim about the deck; whether one particular word is on screen
       is a claim about scroll position, and conflating the two is how the first draft of this
       gate reported a correct archive-mode deck as a broken one. */
    refusalRows: rows.filter((r) => r.querySelector("[data-refusal]")).length,
    qualification: quals.length > 0,
    qualSample: quals.length ? quals[0].textContent.replace(/\s+/g, " ").trim().slice(0, 72) : null,
    mode: deck ? deck.getAttribute("data-deck-mode") : null,
    cite: vis(document.querySelector("[data-cite-cohort]")),
    /* THE TYPE FLOOR, MEASURED WITH THE EIGHT. Nothing numeric below 12, nothing at all below the
       stamp token. The interval is included by name: it is the value most likely to be shrunk to
       make a merged cell fit. */
    smallestData: Math.min(...[...document.querySelectorAll(
      ".at-dc-name, .at-dc-rate .at-val, .at-dc-int .at-val, .at-dc-count .at-val, .at-question-text")]
      .map((e) => parseFloat(getComputedStyle(e).fontSize))),
    /* AND NOTHING SCROLLS. A deck that answers eight of eight because the reader is looking at
       the top of a scrolled column has answered none of them at first paint. */
    deckScrolled: (() => {
      const row = document.querySelector("[data-evidence-row]");
      return row ? row.scrollTop : 0;
    })(),
    sideways: document.documentElement.scrollWidth > innerWidth + 1,
  };
};

const STATES = [
  ["the unqueried archive", "", { vs: false }],
  ["a conditioned cohort", "w=12,-105,800&s0=1971", { vs: true }],
];
const VIEWPORTS = [[1920, 1080], [1600, 900], [1440, 900]];

for (const [w, h] of VIEWPORTS) {
  for (const [name, q, want] of STATES) {
    console.log(`\n[acceptance] ${w}x${h} · ${name}`);
    await open(q, w, h);
    const d = await page.evaluate(EIGHT);
    ok("1 · the canonical question", d.question, d.questionText.slice(0, 80));
    ok("2 · the active conditions, all three zones", d.conditions);
    ok("3 · a focused map", d.map);
    ok("4 · the cohort size", d.cohortSize);
    ok("5 · the complete intensity ladder, every rung with its rate", d.ladderComplete,
       d.ladderNamed);
    ok("6 · the rate and its Wilson interval, in one cell", d.rateAndCi, d.rateSample);
    /* 7 · WHERE APPLICABLE, IN BOTH DIRECTIONS. */
    if (want.vs) {
      ok("7 · the archive comparison, as a column", d.vsColumn && d.mode === "cohort",
         `deck mode ${d.mode}`);
    } else {
      ok("7 · no comparison column, because this cohort IS the archive",
         !d.vsColumn && d.mode === "archive", `deck mode ${d.mode}`);
    }
    /* 7b · THE COLUMN EXISTS WHENEVER A ROW NEEDS IT, WHICH IS THE HALF THAT IS STRUCTURAL.
       The archive-mode allocation drops STATUS, and panel rule 4 says a refused row must say so
       in its own status cell -- so one refusal anywhere in the deck brings the column back for
       every row, whether or not that particular row is above the fold. */
    ok(`7b · the status column exists (${d.refusalRows} refused row(s) on this deck)`,
       !d.refusalRows || d.statusColumn,
       "a row refuses and the deck is rendering no status column at all");
    /* AND IN THE COHORT STATE THE WORD ITSELF IS ON SCREEN, because there the comparison puts a
       SUPPORTED or MIXED on the very first intensity rung -- so "status, where applicable" is a
       claim about first paint and not only about structure. */
    if (want.vs) {
      ok("7c · and a status word is on screen beside its own rate", d.statusVisible);
    }
    ok("8 · the first material qualification", d.qualification, d.qualSample);
    ok("· and the cohort can be cited from where the question is", d.cite);
    ok("· nothing was bought by shrinking type", d.smallestData >= 12,
       `smallest data type is ${d.smallestData}px`);
    ok("· nothing is scrolled at first paint", d.deckScrolled === 0, `${d.deckScrolled}px`);
    ok("· and the page does not scroll sideways", !d.sideways);
  }
}

ok("no page errors in any state", errors.length === 0, errors.slice(0, 3).join("\n"));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nall eight are on screen at first paint, at every named viewport"
  : `\n${failures} acceptance check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
