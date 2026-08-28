#!/usr/bin/env node
/* EVERY PUBLISHED FIGURE ON THE ATLAS, PINNED TO A COMMITTED SNAPSHOT.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT ANOTHER DOM CHECK. The other browser gates assert the
 * SHAPE of the surface -- that a rate carries its interval, that a refused row says so, that no
 * qualification is hidden. None of them asserts the DIGITS. A presentation change that renamed a
 * denominator, re-rounded a rate, swapped a Wilson bound for a Wald one, or quietly dropped the
 * `n / N` pair for a bare numerator would pass every one of them, and the surface would go on
 * looking exactly as honest while publishing something else.
 *
 * That is precisely the failure a LAYOUT pull request is most likely to cause and least likely
 * to notice, so the numbers are frozen here as data rather than as prose. The snapshot is not a
 * source of truth about the archive -- engine/rates.js and the cohort tests own that -- it is a
 * source of truth about WHAT REACHED THE SCREEN, captured from the surface itself before the
 * layout moved and compared against the surface after.
 *
 * WHAT IS CAPTURED, AND WHY EACH IS IN THE LIST:
 *
 *   cohort size         the denominator every rate below is relative to
 *   the question        the engine's own sentence, which is also the citation
 *   per row             outcome name · numerator · denominator · rate · Wilson bounds · status
 *   refusal kinds       BASE_RATE_ONLY / OUT_OF_SCOPE / CONDITIONED_ON / RATE_REFUSED, per row
 *   refusal strings     the archive's own sentences, verbatim, normalised only for whitespace
 *   limits              the archive-gap counts pinned at the ledger foot
 *   the URL             what the surface writes for a state, character for character
 *
 * FOUR STATES, CHOSEN SO EVERY PUBLISHING PATH IS EXERCISED: the unqueried archive, a
 * conditioned cohort with a comparison, a small Atlantic cohort that drives an OUT OF SCOPE
 * refusal, and an outcome-conditioned cohort that drives CONDITIONED_ON. A snapshot over the
 * resting state alone would let a refusal string drift untested.
 *
 * Run:  node scripts/check-atlas-published-values.mjs [--require-browser]
 *       node scripts/check-atlas-published-values.mjs --update    (rewrite the snapshot)
 *
 * --update is deliberately not something CI can reach. Rewriting the snapshot is how a
 * genuinely intended change to a published figure gets recorded, and it must be a decision
 * somebody makes in a diff a reviewer reads, never a step a failing job takes for itself.
 */
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const DOCS = join(ROOT, "docs");
const SNAPSHOT = join(ROOT, "scripts/fixtures/atlas-published-values.json");
const UPDATE = process.argv.includes("--update");

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
    ? "[values] playwright is absent and --require-browser was given"
    : "[values] SKIPPED, not passed: playwright is absent");
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

/* THE READER. Everything below comes off the rendered DOM, never off `globalThis.__ATLAS` --
 * reading the engine would prove the engine still agrees with itself and say nothing at all
 * about what a reader can see. The selectors are the deck's published contract:
 * `[data-outcome]` names a row, and the four value cells carry their own classes.
 *
 * TEXT IS NORMALISED FOR WHITESPACE AND NOTHING ELSE. No case folding, no punctuation
 * stripping, no number re-parsing: "89.2%" and "89.20%" are different published claims and this
 * file must not be the thing that decides they are the same. The one transformation applied is
 * collapsing runs of whitespace, because a line break inside a cell is a layout fact.
 */
const READ = () => {
  const txt = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null);

  /* THE FIGURES, NOT THE TYPESETTING. A layout may move a denominator out of a group heading
   * and into every row, and it may put a Wilson interval in its own column instead of inside
   * the rate's cell. Neither of those changes a published number, and a gate that compared the
   * composed string would report both as twenty broken rates -- which is how a numbers gate
   * gets a reputation for crying wolf and then gets ignored on the day it is right.
   *
   * So each cell is read as the ORDERED LIST OF NUMERALS IT CONTAINS. `3,224` and
   * `3,224 / 3,616` differ; `[88.1-90.1%]` and `88.1-90.1%` do not. The separators are
   * captured too, in `raw`, so a genuine formatting change is still VISIBLE in the diff when
   * the snapshot is rewritten -- it simply does not fail the run on its own. */
  const figures = (el) => {
    const t = txt(el);
    if (t === null) return null;
    return (t.match(/\d[\d,]*(?:\.\d+)?/g) || []);
  };
  /* AND EACH IS READ FROM THE VALUE ELEMENT, NOT THE WHOLE CELL. An unscoreable row's count cell
     holds the value AND the badge saying what the contract has against what it needs -- two
     statements, adjacent, with nothing between them in the text stream -- so reading the cell
     whole ran "2 / 3,885" into "2 archive-wide" and produced the figure 3,8852. The badge is
     captured beside the value instead, where it is pinned on its own terms. */
  const valueOf = (el) => figures(el && el.querySelector(".at-val"));
  const rows = [...document.querySelectorAll("[data-outcome]")].map((r) => ({
    outcome: r.getAttribute("data-outcome"),
    contract: r.getAttribute("data-contract-row") || null,
    /* n, and N when the row carries its own denominator. */
    count: valueOf(r.querySelector(".at-dc-count")),
    countRaw: txt(r.querySelector(".at-dc-count .at-val")),
    /* WHAT AN UNSCOREABLE CONTRACT HAS AGAINST WHAT IT NEEDS. A refusal is not a blank, so this
       is published and is pinned like everything else the surface prints. */
    /* SCOPED TO THE ROW, NOT TO A CELL. The scope/archive-wide/required counts are a published
       figure wherever the layout puts them; pinning the CELL they sat in would make this gate
       an assertion about grid columns, which is the one thing a values snapshot must not be. */
    need: txt(r.querySelector(".at-need")),
    rate: txt(r.querySelector(".at-dc-rate .at-val")),
    /* THE TWO WILSON BOUNDS, IN ORDER. Whatever brackets or unit sign wrap them. */
    interval: valueOf(r.querySelector(".at-dc-int")),
    intervalRaw: txt(r.querySelector(".at-dc-int .at-val")),
    status: txt(r.querySelector(".at-dc-status")),
    refusalKind: (r.querySelector("[data-refusal]") || {}).getAttribute
      ? r.querySelector("[data-refusal]").getAttribute("data-refusal") : null,
    /* THE ARCHIVE'S SENTENCE, WITHOUT THE COUNTS THAT SIT BESIDE IT. `need` is captured on its
       own line above; reading it a second time here, as part of a concatenation, would pin the
       two together and make a change to WHERE the counts sit read as a change to WHAT the
       refusal says. They are different claims and this file keeps them apart. */
    refusalText: (() => {
      const el = r.querySelector("[data-refusal]");
      if (!el) return null;
      const c = el.cloneNode(true);
      c.querySelectorAll(".at-need").forEach((n) => n.remove());
      return (c.textContent || "").replace(/\s+/g, " ").trim() || null;
    })(),
  }));
  const groups = [...document.querySelectorAll("[data-deck-group]")].map((g) => ({
    label: g.getAttribute("data-deck-group"),
    denominator: (figures(g) || [])[0] || null,
  }));
  return {
    url: location.search,
    question: txt(document.querySelector("[data-question]")),
    cohortSize: txt(document.querySelector("[data-cohort-size]")),
    groups,
    rows,
    /* THE LIMITS, WHEREVER THEY ARE PINNED. The attribute is the contract; which box it sits
       in is the layout's business and this gate has no opinion about it. */
    gaps: txt(document.querySelector("[data-archive-gaps]")),
    unknown: txt(document.querySelector("[data-unknown-note]")),
    landfallNote: txt(document.querySelector("[data-landfall-note]")),
    /* THE CITATION. The line a reader would quote, which must not diverge from the question.
       Two stamps are folded out of it, and for the same reason in both cases: they are not
       PUBLISHED VALUES, they are where this build happened to come from.

         the origin  this fixture is served from an ephemeral port, and the host a reader
                     copies from is not one of the values this gate is pinning.
         the pack    the archive's own content stamp, which the daily ingest rewrites whenever
                     the record is rebuilt. Pinned literally it fails the gate on the day the
                     archive is updated and no figure moved -- measured, on a run where all
                     eighteen rows, both denominators and every refusal matched exactly and the
                     only difference in four states was `PACK 476b25a0` against `984fc4d7`.

       The pack is not simply discarded, though: a citation quoting a DIFFERENT pack from the
       one the surface loaded would be a real defect -- a reader would be handed a stamp that
       does not identify the numbers above it -- so the identity is asserted below instead of
       the digits being frozen here. */
    citation: (txt(document.querySelector("[data-cohort-spec]")) || "")
      .split(location.origin).join("{origin}")
      .replace(/PACK [0-9a-f]{6,}/, "PACK {pack}") || null,
    /* AND THE STAMP IT FOLDED IS THE ARCHIVE'S OWN. Read from the manifest the surface is
       actually serving, so the check is an identity rather than a second copy of the string. */
    packQuotesTheArchive: (() => {
      const cited = ((txt(document.querySelector("[data-cohort-spec]")) || "")
        .match(/PACK ([0-9a-f]{6,})/) || [])[1] || null;
      const a = globalThis.__ATLAS && globalThis.__ATLAS.archive;
      const stamp = a && a.manifest && (a.manifest.provenance || {}).archive_stamp;
      return cited !== null && stamp != null && cited === String(stamp);
    })(),
  };
};

/* FOUR STATES. The query strings are the surface's own -- each is a URL the Atlas writes and
   reads back -- so a change to the URL grammar fails here as loudly as a change to a rate. */
const STATES = [
  ["the unqueried archive", ""],
  ["a conditioned cohort", "w=12,-105,800&s0=1971"],
  ["an Atlantic cohort that cannot reach Hawaii", "v=1&w=25,-80,500"],
  ["a cohort conditioned on its own outcome", "i=cat4"],
];

const seen = {};
for (const [name, query] of STATES) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(1100);
  seen[name] = await page.evaluate(READ);
}

await browser.close();
server.close();

if (UPDATE) {
  await writeFile(SNAPSHOT, JSON.stringify(seen, null, 1) + "\n");
  console.log(`[values] snapshot rewritten: ${SNAPSHOT.replace(ROOT + "/", "")}`);
  console.log("         review the diff — every line of it is a published figure that moved.");
  process.exit(0);
}

let want;
try { want = JSON.parse(await readFile(SNAPSHOT, "utf8")); } catch (e) {
  console.log(`[values] no snapshot at ${SNAPSHOT.replace(ROOT + "/", "")} — run with --update to write one`);
  process.exit(2);
}

console.log("[values] every published figure, against the committed snapshot");
for (const [name] of STATES) {
  const got = seen[name];
  const exp = want[name];
  if (!exp) { ok(`${name} — the snapshot has no entry for this state`, false); continue; }

  console.log(`\n  ${name}`);
  ok("  the question, in the engine's own words", got.question === exp.question,
     `want ${JSON.stringify(exp.question)}\ngot  ${JSON.stringify(got.question)}`);
  ok("  the URL the surface writes", got.url === exp.url,
     `want ${exp.url}\ngot  ${got.url}`);
  ok("  the cohort size", got.cohortSize === exp.cohortSize,
     `want ${exp.cohortSize}, got ${got.cohortSize}`);
  ok("  the group denominators", JSON.stringify(got.groups) === JSON.stringify(exp.groups),
     `want ${JSON.stringify(exp.groups)}\ngot  ${JSON.stringify(got.groups)}`);

  /* PER ROW, AND KEYED BY OUTCOME RATHER THAN BY INDEX. A layout is allowed to reorder or fold
     rows; it is not allowed to change what any of them says. Comparing by position would report
     a reordering as twenty wrong numbers and hide a genuinely wrong one among them. */
  const byName = new Map(got.rows.map((r) => [r.outcome, r]));
  const missing = exp.rows.filter((r) => !byName.has(r.outcome)).map((r) => r.outcome);
  ok(`  every published row still reaches the screen (${exp.rows.length})`, missing.length === 0,
     `missing: ${missing.join(", ")}`);
  /* THE GROUP DENOMINATORS, AS A SET. Used below to prove that a denominator which APPEARS in a
     row is the one the group already published rather than a number the layout invented. */
  const denominators = new Set(got.groups.map((g) => g.denominator).filter(Boolean));
  for (const e of exp.rows) {
    const g = byName.get(e.outcome);
    if (!g) continue;
    const same = ["rate", "status", "refusalKind", "refusalText", "contract", "need"]
      .filter((k) => JSON.stringify(g[k]) !== JSON.stringify(e[k]));
    /* THE NUMERATOR IS THE FIRST FIGURE IN THE COUNT CELL AND IT NEVER MOVES. Any FURTHER
       figure in that cell must already be a published group denominator -- that is what makes
       `n / N` a relocation rather than a new claim. */
    const wantN = (e.count || [])[0] || null;
    const gotN = (g.count || [])[0] || null;
    if (wantN !== gotN) same.push(`numerator: want ${wantN}, got ${gotN}`);
    for (const extra of (g.count || []).slice(1)) {
      if (!denominators.has(extra) && !(e.count || []).includes(extra)) {
        same.push(`the count cell carries ${extra}, which no group publishes as a denominator`);
      }
    }
    const wantCi = e.interval || [];
    const gotCi = g.interval || [];
    if (JSON.stringify(wantCi) !== JSON.stringify(gotCi)) {
      same.push(`Wilson bounds: want ${JSON.stringify(wantCi)}, got ${JSON.stringify(gotCi)}`);
    }
    ok(`  ${e.outcome}`, same.length === 0,
       same.map((k) => (k.includes(":") ? k
         : `${k}: want ${JSON.stringify(e[k])}, got ${JSON.stringify(g[k])}`)).join("\n"));
  }

  for (const k of ["gaps", "unknown", "landfallNote", "citation", "packQuotesTheArchive"]) {
    ok(`  ${k}`, got[k] === exp[k], `want ${JSON.stringify(exp[k])}\ngot  ${JSON.stringify(got[k])}`);
  }
}

ok("\nno page errors in any state", errors.length === 0, errors.slice(0, 3).join("\n"));

console.log(failures === 0
  ? "\nevery published figure, denominator, interval and refusal is unchanged"
  : `\n${failures} published value(s) moved`);
process.exit(failures === 0 ? 0 : 1);
