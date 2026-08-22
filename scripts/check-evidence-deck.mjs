#!/usr/bin/env node
/* THE EVIDENCE DECK'S SEMANTICS, ASSERTED PER ROW.
 *
 * WHY THIS EXISTS. Folding six panel sections into one grid is the step where a status can
 * silently detach from the row it governs. In a list of blocks, a refusal is PHYSICALLY attached
 * to the thing it refuses -- it is inside the same box, and no layout change can separate them.
 * In a grid, every cell is a sibling of every other cell: a row that emits its status one cell
 * late puts "RATE REFUSED" beside a real percentage belonging to a different contract, and the
 * page looks completely normal doing it. Nothing about that is visible in a screenshot, and no
 * existing gate would catch it, because every individual value on screen is one the engine
 * really produced.
 *
 * So the deck is audited as a DOM, per row, against the four panel rules it inherited:
 *
 *   1. NO BARE PERCENTAGE -- a row showing a rate shows its count and its interval too.
 *   2. A REFUSED ROW RENDERS NO RATE ANYWHERE INSIDE IT. Not a dimmed one, not a zero, not a
 *      percentage in a title attribute. The strongest form of the rule, because the failure it
 *      guards against is a percentage appearing on a row that refused.
 *   3. AN UNSCOREABLE CONTRACT STATES WHAT IT HAS AGAINST WHAT IT NEEDS.
 *   4. EVERY STATUS SITS INSIDE THE ROW IT GOVERNS -- exactly one per row, never hoisted.
 *
 * HOW IT IS RENDERED. The deck is compiled with the pinned esbuild and rendered to static markup
 * with fixtures covering every state a row can be in, then parsed in a real browser rather than
 * by regex -- an attribute check written against a string is a second HTML parser, and it would
 * be wrong in exactly the cases that matter.
 *
 * --self-test SEEDS EACH REGRESSION AND REQUIRES THE AUDIT TO CATCH IT. Every rule below is
 * given a mutation that violates it and nothing else, so a rule that quietly stopped matching --
 * a renamed hook, a changed class -- fails here instead of going green over an unchecked deck.
 *
 * Run: node scripts/check-evidence-deck.mjs [--self-test] [--require-browser]
 */
import { build } from "esbuild";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

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
    ? "[deck] playwright is absent and --require-browser was given"
    : "[deck] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

/* ── the fixtures ─────────────────────────────────────────────────────────────────────────
 *
 * One row in every state a row can be in. The shapes are the engine's own -- see
 * engine/rates.js -- and the numbers are chosen so a mistake is legible: a refused row that
 * leaked a rate would leak 41.2%, which appears nowhere else. */
const cell = (over) => ({
  n_storms: 190, n_unknown: 0, count: 47, rate: 0.247,
  weighted_rate: 0.247, ci95: [0.192, 0.312], refused_reason: null,
  conditioned_on: null, status: "OK", reason: null, ...over,
});

const REFUSED_REASON = "3 storms with a known outcome < min_sample=10, so this rate is refused "
  + "rather than published as a number nobody should act on.";

const RESULT = {
  min_sample: 10,
  landfall_note: null,
  time_to_event: { cat3: { median: 61, p25: 44, p75: 92, n: 40 } },
  intensity: {
    ts: cell(),
    cat1: cell({ count: 31, rate: 0.163, ci95: [0.115, 0.226] }),
    /* refused: below the sample gate */
    cat2: cell({ count: 3, rate: null, ci95: null, refused_reason: REFUSED_REASON }),
    cat3: cell({ count: 40, rate: 0.412, ci95: [0.345, 0.482] }),
    /* circular: the cohort was defined by this */
    cat4: cell({ count: 190, rate: null, ci95: null,
      status: "CONDITIONED ON -- NOT AN OUTCOME",
      conditioned_on: "storms that reached Category 4",
      reason: "This cohort was defined by storms that reached Category 4, so every storm in it "
        + "carries this outcome by construction. Remove that condition to make this an outcome again." }),
    /* self-contribution: one storm IS the numerator, below the gate */
    cat5: cell({ count: 1, rate: 0.005, ci95: [0.000, 0.029] }),
  },
  landfall: {
    conus: { any: cell({ count: 55, rate: 0.289, ci95: [0.229, 0.358] }),
      hurricane: cell({ count: 2, rate: null, ci95: null, refused_reason: REFUSED_REASON }) },
  },
  unscoreable: {
    /* an OUT OF SCOPE contract: the events exist, outside this population */
    "conus:hurricane": { status: "OUT OF SCOPE", scope_events: 0, archive_events: 11,
      required: 10, scope: "in this cohort",
      reason: "The events exist in this archive, outside the population you asked about." },
  },
};

const COMPARISON = {
  intensity: {
    ts: { baseRate: 0.201, deltaPp: 4.6, direction: "higher", overlap: false },
    cat1: { baseRate: 0.170, deltaPp: -0.7, direction: "lower", overlap: true },
    cat2: null, cat3: { baseRate: 0.300, deltaPp: 11.2, direction: "higher", overlap: false },
    cat4: null, cat5: { baseRate: 0.004, deltaPp: 0.1, direction: "higher", overlap: true },
  },
  landfall: { conus: { any: { baseRate: 0.250, deltaPp: 3.9, direction: "higher", overlap: true },
    hurricane: null } },
};

/* KEYED BY THE HARNESS'S OWN CONTRACT KEY -- see engine/calibration.js. Writing a plausible key
   here instead ("intensity:cat5") is exactly how a fixture passes while the feature never fires,
   which is what the first run of this gate caught. */
const SUBJECT = { id: "AL092021", name: "IDA", inCohort: true,
  reached: { reaches_cat5_137kt: true, reaches_cat3_96kt: true, reaches_ts_34kt: false } };

/* ── render ───────────────────────────────────────────────────────────────────────────── */

/* BUILT INSIDE THE REPOSITORY, NOT IN /tmp, and for one reason: the bundle keeps react external
   so it stays small, and node resolves a bare `react` specifier from the IMPORTER's directory.
   A bundle in /tmp cannot see ./node_modules and fails to load. Removed on the way out. */
const dir = await mkdtemp(join(ROOT, ".deck-build-"));
const entry = join(dir, "entry.jsx");
await writeFile(entry, `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceDeck, subjectVerdicts, subjectReached }
  from ${JSON.stringify(resolve(ROOT, "docs/storm-atlas/src/ui/evidence-deck.jsx"))};
export function render(props) {
  return renderToStaticMarkup(React.createElement(EvidenceDeck, props));
}
export { subjectVerdicts, subjectReached };
`);
const outfile = join(dir, "bundle.mjs");
await build({
  entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node",
  jsx: "automatic", logLevel: "silent",
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
});
const { render, subjectVerdicts, subjectReached } = await import(outfile);

const HTML_DEFAULT = render({ result: RESULT, comparison: COMPARISON, onEvidence: () => {} });
const HTML_SUBJECT = render({ result: RESULT, comparison: COMPARISON, subject: SUBJECT,
  onEvidence: () => {} });
const HTML_FOLDED = render({ result: RESULT, comparison: COMPARISON, foldTiming: true });

/* ── the audit ────────────────────────────────────────────────────────────────────────────
 *
 * Runs in the page, against a real DOM. Returns a list of violation strings; an empty list is
 * the only passing result. */
const AUDIT = () => {
  const bad = [];
  const PCT = /\d[\d,.]*\s*%/;
  const rows = [...document.querySelectorAll("[data-outcome]")];
  if (!rows.length) bad.push("no rows rendered at all");

  for (const row of rows) {
    const name = row.getAttribute("data-outcome");
    const statuses = [...row.querySelectorAll("[data-status]")];
    const rate = row.querySelector(".at-dc-rate");
    const count = row.querySelector(".at-dc-count");
    const interval = row.querySelector(".at-dc-int");
    const refusalBlock = row.querySelector("[data-refusal]");
    const refused = !!refusalBlock;

    /* RULE 4 — exactly one status, and it is inside this row. */
    if (statuses.length > 1) bad.push(`${name}: ${statuses.length} status cells in one row`);
    if (!row.querySelector(".at-dc-status")) bad.push(`${name}: no status cell in the row`);
    for (const s of statuses) {
      if (!row.contains(s)) bad.push(`${name}: a status is not inside its own row`);
    }

    /* RULE 2 — a refused row renders no rate ANYWHERE inside it, including in an attribute. */
    if (refused) {
      const text = row.textContent || "";
      if (PCT.test(text)) {
        bad.push(`${name}: refused, yet a percentage appears in the row (${(text.match(PCT) || [])[0]})`);
      }
      for (const el of row.querySelectorAll("[title]")) {
        if (PCT.test(el.getAttribute("title") || "")) {
          bad.push(`${name}: refused, yet a percentage appears in a title attribute`);
        }
      }
      if (rate && !/[—–-]/.test(rate.textContent || "")) {
        bad.push(`${name}: refused, but the rate cell holds no slot dash`);
      }
      /* RULE 4 again, the sharp edge: a refused row must SAY so in its own status cell. */
      const st = row.querySelector(".at-dc-status");
      if (!(st && (st.textContent || "").trim())) {
        bad.push(`${name}: refused, but its status cell is empty — the status has detached`);
      }
    }

    /* RULE 1 — no bare percentage. A rate implies a count and an interval on the same row. */
    if (!refused && rate && PCT.test(rate.textContent || "")) {
      if (!(count && (count.textContent || "").trim())) bad.push(`${name}: a rate with no count`);
      if (!(interval && /\d/.test(interval.textContent || ""))) {
        bad.push(`${name}: a rate with no interval`);
      }
    }

    /* THE FIFTH RULE, IN THE SUBJECT COLUMN. A conditioned-on row must not present the selected
       storm's verdict: every member reached that contract by construction, so REACHED there is
       vacuous and reads as evidence. */
    if (refusalBlock && refusalBlock.getAttribute("data-refusal") === "CONDITIONED_ON") {
      const vs = row.querySelector(".at-dc-vs");
      if (vs && /(REACHED|IS THE COUNT|\bNO\b)/.test(vs.textContent || "")) {
        bad.push(`${name}: conditioned on, yet the subject column publishes a verdict `
          + `("${(vs.textContent || "").trim()}")`);
      }
    }

    /* The bar never carries a number. */
    const bar = row.querySelector(".at-dc-bar");
    if (bar && /\d/.test(bar.textContent || "")) bad.push(`${name}: the bar carries a number`);
  }

  /* Everything carrying data-refusal must name the way out — the rule the old panel kept, and
     the reason a two-word status cell is never given that attribute. */
  for (const el of document.querySelectorAll("[data-refusal]")) {
    const t = (el.textContent || "").trim();
    if (t.split(/\s+/).length < 6) {
      bad.push(`a [data-refusal] block does not name the way out: "${t.slice(0, 60)}"`);
    }
  }

  /* The closed status vocabulary. A status cell may print one of these and nothing else. */
  const WORDS = new Set(["SUPPORTED", "MIXED", "PARTIAL", "NOT REACHED", "WITHHELD", "NOT JUDGED",
    "NOT CHECKED", "SELF-CONTRIBUTION", "RATE REFUSED", "BASE RATE ONLY", "OUT OF SCOPE",
    "NOT EVALUABLE", "CONDITIONED ON", "— UNKNOWN"]);
  /* DATA ROWS ONLY. The header's own status cell carries the column heading "STATUS", which is
     a label and not a claim about any contract. Scoping this to the header would have made the
     first version of this rule fire on every deck ever rendered. */
  for (const el of document.querySelectorAll(".at-deck-data .at-dc-status")) {
    const t = (el.textContent || "").trim();
    if (t && !WORDS.has(t)) bad.push(`a status cell prints a word outside the vocabulary: "${t}"`);
  }

  /* A refusal statement is bounded — the argument lives behind SEE THE EVIDENCE. */
  for (const el of document.querySelectorAll(".at-say-text")) {
    const n = (el.textContent || "").trim().split(/\s+/).length;
    if (n > 19) bad.push(`a refusal statement runs to ${n} words`);
  }
  return bad;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const auditOf = async (html) => {
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  return page.evaluate(AUDIT);
};

console.log("[deck] the rendered deck, per row");
{
  const bad = await auditOf(HTML_DEFAULT);
  ok("the default deck satisfies every panel rule", bad.length === 0, bad.join("\n"));
}
{
  const bad = await auditOf(HTML_SUBJECT);
  ok("and so does the deck with a storm selected", bad.length === 0, bad.join("\n"));
}
{
  const bad = await auditOf(HTML_FOLDED);
  ok("and so does the deck with the timing columns folded", bad.length === 0, bad.join("\n"));
}

/* The states that must actually be present, so the audit above is not passing over an empty
   page. A gate whose fixtures never reach the interesting branch is a gate that proves nothing. */
console.log("\n[deck] and every state the fixtures were built to reach is on the page");
{
  await page.setContent(`<!doctype html><html><body>${HTML_DEFAULT}</body></html>`);
  const seen = await page.evaluate(() => ({
    rows: document.querySelectorAll("[data-outcome]").length,
    refusals: document.querySelectorAll("[data-refusal]").length,
    marks: [...document.querySelectorAll("[data-mark]")].map((e) => e.getAttribute("data-mark")),
    statuses: [...document.querySelectorAll(".at-dc-status")].map((e) => e.textContent.trim()).filter(Boolean),
    groups: [...document.querySelectorAll("[data-deck-group]")].map((e) => e.getAttribute("data-deck-group")),
    links: document.querySelectorAll("[data-evidence-link]").length,
  }));
  ok("every contract has a row", seen.rows === 8, `saw ${seen.rows}`);
  ok("both row groups render", JSON.stringify(seen.groups) === '["INTENSITY","LANDFALL"]', JSON.stringify(seen.groups));
  ok("a refused row, a circular row and an unscoreable one all refuse", seen.refusals >= 3, `saw ${seen.refusals}`);
  /* TWO OF THE THREE, AND THE THIRD IS NAMED RATHER THAN ASSUMED. NOT EVALUABLE is the
     environment's mark, and the environment group is not on this deck yet -- so asserting all
     three here would be asserting a state the fixtures cannot reach, which is how a gate starts
     passing over something that never happens. What IS asserted: every mark rendered is one of
     the three, and the two that this deck can produce both do. */
  const MARKSET = new Set(["REFUSED", "NOT_EVALUABLE", "CONDITIONED_ON"]);
  ok("every mark rendered is one of the three a reader has to learn",
     seen.marks.every((m) => MARKSET.has(m)), JSON.stringify(seen.marks));
  ok("and both marks this deck can produce do appear",
     new Set(seen.marks).has("REFUSED") && new Set(seen.marks).has("CONDITIONED_ON"),
     JSON.stringify(seen.marks));
  ok("SUPPORTED and MIXED both appear, so the comparison column is live",
     seen.statuses.includes("SUPPORTED") && seen.statuses.includes("MIXED"),
     JSON.stringify(seen.statuses));
  ok("every refusal offers its evidence", seen.links >= 3, `saw ${seen.links}`);
}
{
  await page.setContent(`<!doctype html><html><body>${HTML_SUBJECT}</body></html>`);
  const s = await page.evaluate(() => {
    const row = document.querySelector("[data-self-contribution]");
    if (!row) return null;
    return {
      status: (row.querySelector(".at-dc-status") || {}).textContent,
      subject: (row.querySelector(".at-dc-vs") || {}).textContent,
      rate: (row.querySelector(".at-dc-rate") || {}).textContent,
      count: (row.querySelector(".at-dc-count") || {}).textContent,
    };
  });
  ok("issue 15 fires: the row is marked as a self-contribution", !!s, "no row carried the hook");
  if (s) {
    ok("its status reads SELF-CONTRIBUTION", (s.status || "").trim() === "SELF-CONTRIBUTION", s.status);
    ok("its subject cell reads IS THE COUNT", (s.subject || "").trim() === "IS THE COUNT", s.subject);
    ok("and the rate is NOT withheld — nothing is excluded", /%/.test(s.rate || ""), s.rate);
    ok("and it keeps its numerator", /\d/.test(s.count || ""), s.count);
  }
}

/* ── THE SUBJECT'S VERDICTS ───────────────────────────────────────────────────────────────
 *
 * The rule that matters here is the one that is easy to get wrong and impossible to see: an
 * archive that does not know how strong a storm got must NOT produce a NO. "This storm did not
 * reach Category 3" and "nobody recorded how strong this storm got" are different statements,
 * and the second is not evidence for the first. A `false` default anywhere in that derivation
 * silently converts every unrecorded storm into a failed one, on a column a reader scans.
 */
console.log("\n[deck] the subject's verdicts, and the three states they must keep");
{
  const IDA = { max_category: "cat4", landfalls: [
    { region: "conus", hurricane_at_landfall: true },
    { region: "mexico", hurricane_at_landfall: false },
  ] };
  const v = subjectVerdicts(IDA);
  const R = (k) => subjectReached({ reached: v }, k);

  ok("a Cat 4 storm reached every rung at or below it",
     R("reaches_cat4_113kt") === true && R("reaches_cat3_96kt") === true
       && R("reaches_ts_34kt") === true, JSON.stringify(v));
  ok("and did not reach the rung above it", R("reaches_cat5_137kt") === false);
  ok("a region it came ashore in reads REACHED", R("landfall_conus_any") === true);
  ok("at hurricane strength where the archive says so", R("landfall_conus_hurricane") === true);
  ok("and NOT at hurricane strength where it says otherwise",
     R("landfall_mexico_hurricane") === false);
  ok("a region it never reached is a real NO, not a slot",
     R("landfall_hawaii_any") === false,
     "the landfall record is known, so an untouched region is an answer");

  /* THE TWO UNDECIDABLE CASES. Both must come back undefined -- the deck renders the slot. */
  const NOPEAK = { max_category: null, landfalls: [] };
  const w = subjectVerdicts(NOPEAK);
  ok("an unrecorded peak leaves EVERY intensity contract undecided",
     subjectReached({ reached: w }, "reaches_cat3_96kt") === undefined,
     `got ${JSON.stringify(subjectReached({ reached: w }, "reaches_cat3_96kt"))} — an unrecorded `
     + "peak has been rendered as a failed one");
  ok("and never as a NO", subjectReached({ reached: w }, "reaches_cat3_96kt") !== false);

  const NOLF = { max_category: "cat1", landfalls: undefined };
  const x = subjectVerdicts(NOLF);
  ok("a storm with no landfall record leaves every landfall contract undecided",
     subjectReached({ reached: x }, "landfall_conus_any") === undefined,
     "a missing landfall record has been rendered as 'came ashore nowhere'");
  ok("while its intensity contracts are still answered",
     subjectReached({ reached: x }, "reaches_cat1_64kt") === true);

  ok("and a storm with no record at all yields no verdicts", subjectVerdicts(null) === null);
}

/* ── the seeded regressions ───────────────────────────────────────────────────────────────
 *
 * Each mutation breaks exactly one rule. The audit must catch every one; a rule that cannot be
 * shown to fire is not a rule. */
if (process.argv.includes("--self-test")) {
  console.log("\n[deck] seeded regressions — the audit must catch every one");

  const SEEDS = [
    {
      name: "a status detached from its row (moved out of the row element)",
      /* Matched on data-status, which only a DATA row's status cell carries. The first version
         matched on the class alone and moved the HEADER's "STATUS" heading instead -- a mutation
         that breaks nothing, seeding a regression the audit was right not to report. THE SEED
         WAS WRONG, NOT THE RULE, and a seed that cannot fail is the same problem as a rule that
         cannot fire. */
      mutate: (h) => h.replace(/(<span class="at-dc at-dc-status" data-status="[^"]*">[^<]*<\/span>)(<\/div>)/, "$2$1"),
    },
    {
      name: "a refused row leaking a percentage into its rate cell",
      mutate: (h) => h.replace(/(<span class="at-dc at-dc-rate"><span class="at-slot"[^>]*>)—/, "$10.0%"),
    },
    {
      name: "a refused row leaking a percentage through a title attribute",
      mutate: (h) => h.replace(/(<span class="at-slot" title=")the archive publishes no rate here/,
        "$1would have been 12.5%"),
    },
    {
      name: "a rate published with its count cell emptied",
      /* Targeted at a cell that actually holds a value: emptying a refused row's count breaks
         no rule, so a looser pattern would seed a violation that is not one. */
      mutate: (h) => h.replace(/<span class="at-dc at-dc-count"><span class="at-val">[^<]*<\/span><\/span>/,
        '<span class="at-dc at-dc-count"></span>'),
    },
    {
      name: "a status word invented outside the closed vocabulary",
      mutate: (h) => h.replace(/>SUPPORTED</, ">LIKELY<"),
    },
    {
      name: "a number leaking onto the bar",
      mutate: (h) => h.replace(/(<span class="at-dc at-dc-bar">)/, "$124.7%"),
    },
    {
      name: "a data-refusal block reduced to a two-word status",
      mutate: (h) => h.replace(/(<div class="at-deck-say" data-refusal="[A-Z_]+">).*?(<\/div>)/, "$1RATE REFUSED$2"),
    },
    {
      name: "a conditioned-on row publishing the subject's verdict as evidence",
      mutate: (h) => h.replace(
        /(<span class="at-dc at-dc-vs"><span class="at-slot" title="this variable is in the query[^"]*">)—/,
        "$1REACHED"),
    },
    {
      name: "a refusal statement running past the bound",
      mutate: (h) => h.replace(/(<span class="at-say-text">)/,
        "$1" + "word ".repeat(25)),
    },
  ];

  for (const seed of SEEDS) {
    const mutated = seed.mutate(HTML_DEFAULT);
    if (mutated === HTML_DEFAULT) {
      ok(seed.name, false, "the mutation did not change the markup — the seed no longer matches "
        + "the deck's output, so this regression is going unchecked");
      continue;
    }
    const bad = await auditOf(mutated);
    ok(seed.name, bad.length > 0, "the audit did not catch it");
  }

  /* AND IT STAYS SILENT ON A CHANGE THAT BREAKS NOTHING. An audit that fails on any edit is an
     audit that gets deleted the first time someone renames a class. */
  console.log("\n[deck] and it stays silent on a harmless change");
  {
    const harmless = HTML_DEFAULT.replace(/<div class="at-deck"/, '<div data-extra="1" class="at-deck"');
    const bad = await auditOf(harmless);
    ok("an added attribute is not a violation", bad.length === 0, bad.join("\n"));
  }
}

await browser.close();
await rm(dir, { recursive: true, force: true });

console.log(failures === 0
  ? "\nevery row carries its own status, and no refused contract publishes a rate"
  : `\n${failures} deck check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
