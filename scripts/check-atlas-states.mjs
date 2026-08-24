#!/usr/bin/env node
/* THE STACKED SHELL, IN THE STATES A READER ACTUALLY REACHES.
 *
 * WHY A STATE MATRIX RATHER THAN A SCREENSHOT SET. Every layout bug this integration has produced
 * so far was invisible in the state it was introduced in and obvious two states later: the plate
 * measured 0x0 only once it was inside a single-cell row; the rows came out shifted only once a
 * transport existed to claim row 3; the qualification block was missing only when NOTHING refused,
 * which is the one state -- the unqueried archive -- that a developer looks at least.
 *
 * So this drives the surface through the real states and asserts the same invariants in all of
 * them. The invariants are the ones that must not depend on which question was asked:
 *
 *   the five rows are present and in order
 *   the plate stays inside its aperture bounds
 *   no refused contract publishes a rate anywhere in its row
 *   every status sits inside the row it governs
 *   the condition boundary is legible -- three zones, always
 *   nothing throws
 *
 * AND COVERAGE IS REPORTED RATHER THAN ASSUMED. Several of the interesting states cannot be
 * reached by URL alone -- whether a cohort contains a BASE RATE ONLY contract depends on the
 * archive, not on the query -- so the harness DETECTS which of them it actually visited and
 * prints the list. A matrix that silently never reached a refusal would be a matrix that proves
 * nothing about refusals, and the honest form of that is a printed count rather than a green tick.
 *
 * Run: node scripts/check-atlas-states.mjs [--require-browser]
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
    ? "[states] playwright is absent and --require-browser was given"
    : "[states] SKIPPED, not passed: playwright is absent");
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

const open = async (query, w = 1440, h = 900) => {
  errors = [];
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`,
    { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(1000);
};

/* The invariants, read once per state. Rows are display:contents, so everything goes via a cell. */
const AUDIT = () => {
  const bad = [];
  const seen = [];
  const PCT = /\d[\d,.]*\s*%/;
  const shell = document.querySelector(".atlas-stacked");
  if (!shell) { bad.push("the stacked shell did not render"); return { bad, seen }; }

  /* the five rows, in order */
  const order = [...shell.children].map((c) => c.className.split(" ")[0]);
  const want = ["at-ident", "at-question", "at-strip", "atlas-plate-row", "atlas-evidence", "atlas-transport"];
  if (JSON.stringify(order.slice(0, 6)) !== JSON.stringify(want)) {
    bad.push(`row order is ${JSON.stringify(order.slice(0, 6))}`);
  }

  /* THE PLATE'S APERTURE AND ITS CAP.
     The envelope is 1.421 to 3.2, widened to 4.0 from 1600 up with nothing docked -- there the
     500px cap, not the shell's leftover height, is what set the shape. Past 2000px of plate the
     cap and the 4.0 ceiling cannot both hold and the cap wins; the aspect is not asserted there
     and the cap still is. check-plate-aperture.mjs is where all of that is derived. */
  const plate = document.querySelector(".at-plate");
  if (!plate) bad.push("no plate");
  else {
    const b = plate.getBoundingClientRect();
    const ar = b.width / b.height;
    const docked = !!document.querySelector("[data-inspector-dock]");
    const ceil = innerWidth >= 1600 && !docked ? 4.0 : 3.2;
    if (b.height > 501) bad.push(`plate is ${Math.round(b.height)}px, past the 500px cap`);
    if (ar < 1.419) bad.push(`plate aspect ${ar.toFixed(3)} below the 1.421 floor`);
    if (b.width <= 2001 && ar > ceil + 0.002) {
      bad.push(`plate aspect ${ar.toFixed(3)} above the ${ceil} ceiling`);
    }
  }

  /* the condition boundary — three zones, always */
  const zones = [...document.querySelectorAll("[data-zone]")].map((z) => z.getAttribute("data-zone"));
  if (JSON.stringify(zones) !== '["given","outcome","scope"]') bad.push(`zones are ${JSON.stringify(zones)}`);

  /* PER ROW: A REFUSED CONTRACT PUBLISHES NO RATE, AND ITS STATUS IS INSIDE IT.
   *
   * THE STATUS COLUMN IS CONDITIONAL AND THE RULE IS NOT, so the rule is stated the sharp way
   * round. The archive-mode allocation drops the column when NO row in the deck has a word to
   * put in it; one refusal anywhere brings it back for every row. So:
   *
   *   the column exists  ->  every row carries exactly one status cell
   *   a row is refused   ->  it carries a status cell WITH TEXT, whatever the mode
   *
   * The second is what panel rule 4 actually protects, and it is strictly stronger than the flat
   * "every row has a cell" this replaced: that version passed on a deck whose refusal had a cell
   * and no word in it. */
  const hasStatusColumn = !!document.querySelector(".at-deck-head .at-dc-status");
  for (const row of document.querySelectorAll("[data-outcome]")) {
    const name = row.getAttribute("data-outcome");
    const refusal = row.querySelector("[data-refusal]");
    const status = row.querySelector(".at-dc-status");
    if (hasStatusColumn && !status) bad.push(`${name}: no status cell in the row`);
    if (refusal && !status) {
      bad.push(`${name}: refused, and the deck is rendering no status column at all`);
    }
    if (refusal) {
      seen.push("refusal:" + refusal.getAttribute("data-refusal"));
      /* THE CELLS, NOT THE PROSE. A conditioned-on row's reason legitimately contains "100%" --
         "a rate would be 100% because of how the question was asked, not because of anything the
         record says" -- and that sentence is the refusal, not a published rate. Scanning the
         whole row flagged it, which was a false positive in this audit rather than a bug on the
         surface. What must carry no percentage is the row's DATA CELLS: the place a reader looks
         for a number. */
      const cells = [...row.querySelectorAll(".at-dc")]
        .map((c) => c.textContent || "").join(" ");
      if (PCT.test(cells)) {
        bad.push(`${name}: refused, yet a percentage appears in a data cell`);
      }
      if (!(status && status.textContent.trim())) bad.push(`${name}: refused with an empty status`);
    }
    const st = status && status.textContent.trim();
    if (st) seen.push("status:" + st);
  }
  for (const m of document.querySelectorAll("[data-mark]")) seen.push("mark:" + m.getAttribute("data-mark"));
  if (document.querySelector("[data-archive-gaps]")) seen.push("archive-gaps");
  if (document.querySelector("[data-unknown-note]")) seen.push("unknown-note");
  if (document.querySelector("[data-landfall-note]")) seen.push("landfall-note");
  if (document.querySelector("[data-self-contribution]")) seen.push("self-contribution");
  if (document.querySelector("[data-bridge-pinned]")) seen.push("bridge");
  if (document.querySelector("[data-bridge-replay-guard]")) seen.push("replay-guard");
  if (document.querySelector("[data-folded-regions]")) seen.push("landfall-fold");
  if (document.querySelector("[data-inspector-dock]")) seen.push("inspector-dock");
  if (document.querySelector("[data-last-edit]")) seen.push("last-edit");
  for (const c of document.querySelectorAll("[data-condition-zone]")) {
    seen.push("condition:" + c.getAttribute("data-condition-zone"));
  }
  return { bad, seen };
};

/* Pick real storms out of the pack for the states a query cannot construct. */
await open("");
const picks = await page.evaluate(() => {
  const a = globalThis.__ATLAS.archive;
  const out = { withLandfalls: null, preGenesis: null, plain: null, derivedLandfall: null };
  for (let i = 0; i < a.nStorms; i++) {
    const s = a.storm(i);
    if (!s) continue;
    if (!out.plain && s.name && s.max_category) out.plain = s.storm_id;
    if (!out.withLandfalls && s.landfalls && s.landfalls.length >= 2) out.withLandfalls = s.storm_id;
    if (!out.derivedLandfall && s.landfalls && s.landfalls.some((l) => l.derived || l.suspect_relocation)) {
      out.derivedLandfall = s.storm_id;
    }
    if (!out.preGenesis && (s.genesis_lat === null || s.genesis_lon === null)) out.preGenesis = s.storm_id;
    if (out.plain && out.withLandfalls && out.derivedLandfall && out.preGenesis) break;
  }
  return out;
});

/* THE MATRIX. Each entry is a state a reader can actually be in. */
const STATES = [
  ["default archive", "", 1440, 900],
  ["medium cohort", "s0=1990&s1=2010", 1440, 900],
  ["small cohort", "i=cat5&s0=2015", 1440, 900],
  /* TIGHT ENOUGH TO TRIP THE SAMPLE GATE ITSELF. Without one of these the matrix reaches
     BASE RATE ONLY and OUT OF SCOPE but never RATE REFUSED -- the most common refusal on the
     surface -- and would report full coverage of a state it had not visited. */
  ["below the sample gate", "s0=2022&b=NA&i=cat3", 1440, 900],
  ["a single season", "s0=2005&s1=2005&i=cat4", 1440, 900],
  ["outcome-conditioned cohort", "i=cat4", 1440, 900],
  ["landfall-conditioned cohort", "l=conus", 1440, 900],
  ["location-probed cohort", "w=25,-75,400", 1440, 900],
  ["named only, provisional in", "n=1&p=1", 1440, 900],
  ["months and basin", "mo=8.9&b=NA", 1440, 900],
  ["selected storm", `storm=${picks.plain}`, 1440, 900],
  ["selected storm with landfalls", `storm=${picks.withLandfalls}`, 1440, 900],
  ["complex landfall provenance", `storm=${picks.derivedLandfall || picks.withLandfalls}`, 1440, 900],
  ["pre-genesis storm", `storm=${picks.preGenesis || picks.plain}`, 1440, 900],
  ["storm inside its own cohort", `i=cat4&storm=${picks.plain}`, 1440, 900],
  ["storm outside the cohort", `i=cat5&s0=2020&storm=${picks.plain}`, 1440, 900],
  /* NOT "m=replay": `m` is the METHODOLOGY VERSION on this surface, and setting it to a mode
     name makes the surface correctly report a methodology mismatch. Replay is entered through
     the builder's mode chip, which is where a reader enters it. */
  ["replay mid-life", "__replay__", 1440, 900],
  ["narrow workstation", "", 1280, 800],
  ["narrower still", "", 1180, 800],
  ["the collapse width", "", 1100, 800],
  ["wide and short", "", 1920, 900],
  ["tall workstation", "", 1440, 1600],
];

console.log("[states] the invariants hold in every state a reader can reach");
const coverage = new Set();
for (const [name, query, w, h] of STATES) {
  await open(query === "__replay__" ? "" : query, w, h);
  if (query === "__replay__") {
    /* Entered the way a reader enters it: open the builder, click the mode chip. */
    const opener = await page.$("[data-zone-edit]");
    if (opener) { await opener.click(); await page.waitForTimeout(250); }
    const chip = await page.$('[data-chip="mode-replay"]');
    if (chip) { await chip.click(); await page.waitForTimeout(900); }
    const close = await page.$("[data-sheet-close]");
    if (close) { await close.click(); await page.waitForTimeout(400); }
  }
  const { bad, seen } = await page.evaluate(AUDIT);
  seen.forEach((x) => coverage.add(x));
  ok(`${name.padEnd(30)} ${w}x${h}`, bad.length === 0 && errors.length === 0,
     [...bad, ...errors].join("\n"));
}

/* ANSWER DENSITY, AT THE VIEWPORT THE ACCEPTANCE TEST NAMES. Five things, all fully on screen
   with nothing scrolled: the question, the cohort and its denominator, the map, the outcome
   rates, and something qualifying them. */
console.log("\n[states] answer density at 1440x900 — the acceptance target");
{
  await open("", 1440, 900);
  const d = await page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.top >= -1 && b.bottom <= innerHeight + 1
        && b.left >= -1 && b.right <= innerWidth + 1; };
    const cells = (rs, cs) => [...document.querySelectorAll(rs)].map((r) => r.querySelector(cs)).filter(Boolean);
    const quals = [...document.querySelectorAll("[data-refusal],[data-archive-gaps],[data-unknown-note],[data-landfall-note]")]
      .filter(vis).concat(cells(".at-deck-data", ".at-dc-status").filter((e) => vis(e) && e.textContent.trim()));
    const rates = cells("[data-outcome]", ".at-dc-rate");
    const intensity = [...document.querySelectorAll("[data-outcome]")]
      .filter((r) => /CATEGORY|TROPICAL/.test(r.getAttribute("data-outcome") || ""));
    const last = intensity[intensity.length - 1];
    return {
      question: vis(document.querySelector("[data-question]")),
      cohort: vis(document.querySelector("[data-cohort-size]"))
        && cells("[data-deck-group]", ".at-dc-outcome").some(vis),
      map: vis(document.querySelector(".at-plate")),
      outcomes: rates.filter(vis).length > 0,
      qualification: quals.length > 0,
      lastIntensityRate: last ? vis(last.querySelector(".at-dc-rate")) : false,
    };
  });
  const names = { question: "1 · the question", cohort: "2 · the cohort and its denominator",
    map: "3 · map evidence", outcomes: "4 · primary outcome rates",
    qualification: "5 · material evidence qualification" };
  let hits = 0;
  for (const k of Object.keys(names)) { if (d[k]) hits++; ok(names[k], d[k]); }
  ok(`answer density is ${hits} of 5`, hits === 5, `${hits} of 5`);
  ok("and the last intensity rate needs 0px of scroll", d.lastIntensityRate);
}

/* WHAT THE MATRIX ACTUALLY REACHED. Printed rather than asserted where the archive decides, and
   asserted where the surface does. */
console.log("\n[states] coverage the matrix actually reached");
const REQUIRED = ["bridge", "inspector-dock", "landfall-fold", "archive-gaps", "unknown-note",
  "mark:REFUSED", "mark:CONDITIONED_ON", "condition:given", "condition:outcome", "condition:scope",
  /* The three ways the gate can bind, each reached by a real query rather than assumed. */
  "refusal:RATE_REFUSED", "refusal:BASE_RATE_ONLY", "refusal:OUT_OF_SCOPE", "refusal:CONDITIONED_ON",
  "status:SUPPORTED", "status:MIXED"];
for (const r of REQUIRED) {
  ok(`reached: ${r}`, coverage.has(r), "no state in the matrix produced this — it is untested");
}
const refusals = [...coverage].filter((c) => c.startsWith("refusal:")).sort();
const statuses = [...coverage].filter((c) => c.startsWith("status:")).sort();
console.log(`  note  refusal kinds reached: ${refusals.map((r) => r.slice(8)).join(", ") || "none"}`);
console.log(`  note  status words reached:  ${statuses.map((r) => r.slice(7)).join(", ") || "none"}`);

await browser.close();
server.close();

console.log(failures === 0
  ? "\nevery state holds the invariants, and 1440x900 answers five of five"
  : `\n${failures} state check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
