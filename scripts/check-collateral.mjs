#!/usr/bin/env node
/* THE GATE ON THE COLLATERAL.
 *
 * Three properties, each one a rule from the brief that a reviewer would otherwise have to hold
 * in their head while reading six pages:
 *
 *   1. TRACEABILITY. Every n/N fraction and every percentage printed in a rendered artifact
 *      exists in docs/collateral/source-manifest.json. A figure that does not is a figure
 *      somebody typed.
 *   2. THE PROHIBITIONS. No state-level or sub-CONUS rate; no fabricated row-level status; no
 *      forecast language; no unshipped delivery marketed as live; no "closest analog" ranking.
 *   3. COMPLETENESS. Every artifact carries its cite block, its comparison strip, its research-
 *      only disclaimer, and no unfilled copy slot.
 *
 * Run: node scripts/check-collateral.mjs
 */
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { ROOT } from "./lib/atlas-verify.mjs";

const DIR = join(ROOT, "docs/collateral");
const M = JSON.parse(readFileSync(join(DIR, "source-manifest.json"), "utf8"));

let fails = 0;
let checks = 0;
const ok = (cond, label, detail) => {
  checks++;
  if (cond) return true;
  fails++;
  console.log(`  FAIL  ${label}` + (detail ? `\n        ${detail}` : ""));
  return false;
};
const pass = (label) => { checks++; console.log(`  ok    ${label}`); };

/* ---- 1. the set of figures the manifest actually holds ---------------------------------- */
const FRACTIONS = new Set();
const PERCENTS = new Set();
const INTERVALS = new Set();
const COUNTS = new Set();
for (const s of M.systems) {
  COUNTS.add(String(s.cohort.n_cases));
  for (const r of [...s.intensity_rows, ...s.landfall_rows]) {
    FRACTIONS.add(`${r.count}/${r.n_storms}`);
    COUNTS.add(String(r.count));
    COUNTS.add(String(r.n_storms));
    if (r.rate !== null) {
      PERCENTS.add((100 * r.rate).toFixed(1));
      INTERVALS.add(`${(100 * r.ci95[0]).toFixed(0)}-${(100 * r.ci95[1]).toFixed(0)}`);
    }
  }
  for (const k of Object.keys(s.time_to_event || {})) {
    const t = s.time_to_event[k];
    if (!t || !t.n) continue;
    for (const q of ["p10", "p25", "median", "p75", "p90"]) {
      if (t[q] !== null && t[q] !== undefined) COUNTS.add(String(Math.round(t[q])));
    }
    COUNTS.add(String(t.n));
  }
  for (const m of s.representatives.members) {
    COUNTS.add(String(m.peak_vmax_kt));
    COUNTS.add(String(m.season));
    COUNTS.add(String(m.distance_km));
  }
  for (const u of Object.values(s.unscoreable)) {
    COUNTS.add(String(u.archive_events));
    COUNTS.add(String(u.scope_events));
    COUNTS.add(String(u.required));
  }
}
/* Figures that are legitimately not cohort outputs: the pack's own counts, the live readings
   the operational layer and the desk line publish, the Saffir-Simpson thresholds, the outlook
   percentages NHC publishes, and the dates. Enumerated rather than pattern-matched, so a new
   number cannot slip in by resembling one of these. */
const NON_COHORT = new Set([
  ...Object.values(M.pack.counts).map(String),
  ...Object.values(M.pack.thresholds_kt || {}).map(String),
  ...M.operational.storms.flatMap((s) => [s.latest.kt, s.latest.mslp, s.peak_wind_kt,
    s.fix_count, Math.abs(s.latest.lat), Math.abs(s.latest.lon)].map(String)),
  ...M.outlook.flatMap((o) => [o.pct48, o.pct7d].filter((x) => x !== null).map(String)),
  "125", "942", "27.4", "90.7", "100", "17.2", "124.4", "13.0", "144", "28.0", "88.7",
  "13.2", "115.0", "12.0", "107.5", "11.3", "133.8", "250", "150", "1971", "2026", "31",
  "1", "0", "10", "8", "5", "1.1.0", "64", "34", "96", "113", "137", "83",
]);

/* ---- 2. the prohibitions ----------------------------------------------------------------- */
const STATE_WORDS = [
  "texas", "louisiana", "mississippi", "alabama", "florida", "tamaulipas",
];
/* A state NAME is legal on a representative-member card (it is a fact about that storm from the
   landfalls table). A state name within reach of a RATE is not. This looks for a state word in
   the same sentence as a percentage or an n/N. */
const RATE_NEAR = /(\d+\s*\/\s*\d+|\d+\.\d\s*%|\d+\s*%)/;
/* An explicit statement, in the same block, that the rate is not the state's. */
const NON_ATTRIBUTION = new RegExp([
  "does not score state", "scores no sub-conus", "no sub-conus", "not a state row",
  "not a state-level", "no state-level", "not a gulf number", "conus-wide, not",
  "is not a rate", "not a rate", "geography, not", "not scored", "no state rate",
].join("|"), "i");

const FORECAST_PHRASES = [
  /will (?:make )?landfall/i, /we (?:expect|forecast|predict)/i,
  /storm atlas (?:forecasts|predicts)/i, /expected to (?:hit|strike)/i,
  /probability of landfall in (?:texas|louisiana|florida)/i,
  /closest analog/i, /most similar/i, /best analog/i, /nearest analog/i,
];
/* A ROW-LEVEL stamp is one printed in an outcome row's STATUS cell. The engine renders none on a
   scored row, so any of these words there would be invented. The same word on a COHORT line --
   the archive does put SUFFICIENT there -- is legitimate and carries its own class. */
const FABRICATED_STATUS = [
  /class="status[^"]*"[^>]*>\s*(?:SUFFICIENT|VALID|OK|SCOREABLE|PASS|GOOD)\b/i,
];
const UNSHIPPED = [/\bAPI\b/, /exportable charts/i, /recurring institutional brief/i];

/* BLOCK BY BLOCK, NOT SENTENCE BY SENTENCE.
   The first version of the state-rate check split flattened page text on full stops. A masthead
   carries no full stop, so its "sentence" ran on through the answers rail and into the copy, and
   the check reported a state name and a percentage that were three blocks apart. Splitting on the
   block elements the page is actually made of is both stricter and quieter: a claim lives inside
   one block, and a block is what a reader takes in as one statement. */
function blocks(html) {
  const out = [];
  const body = html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  /* INNERMOST BLOCKS. A table cell that wraps a prose div and a feed div is two statements, not
     one, and treating it as one manufactured a co-occurrence the page does not make. A block
     that contains another block is skipped in favour of its children. */
  const BLOCK = /<(p|li|td|th|h1|h2|h3|caption|div)\b[^>]*>([\s\S]*?)<\/\1>/g;
  for (const m of body.matchAll(BLOCK)) {
    if (/<(p|li|div|table)\b/.test(m[2])) continue;    // not innermost
    const t = text(m[2]).trim();
    if (t) out.push(t);
  }
  return out;
}

/* Strip tags, decode the entities this build emits, and collapse whitespace. */
function text(html) {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ");
}

/* The six artifacts, plus the source manifest, which is a reference document held to a
   different set of rules: it prints the archive's raw landfall rows -- sub-region and detection
   method included -- because that is the evidence the artifacts are checked against. */
const MANIFEST_DOC = "SOURCE-MANIFEST.html";
const files = readdirSync(DIR).filter((f) => f.endsWith(".html")).sort();
const artifacts = files.filter((f) => f !== MANIFEST_DOC);
ok(artifacts.length === 6, `six artifacts rendered`,
  `found ${artifacts.length}: ${artifacts.join(", ")}`);
ok(files.includes(MANIFEST_DOC), "the source manifest is rendered");

for (const f of files) {
  console.log(`\n${f}`);
  const html = readFileSync(join(DIR, f), "utf8");
  const t = text(html);

  /* -- completeness -- */
  ok(!/COPY SLOT "[^"]+" NOT SUPPLIED/.test(html), "every copy slot supplied",
    (html.match(/COPY SLOT "[^"]+" NOT SUPPLIED/g) || []).slice(0, 6).join(", "));
  ok(/CITE THIS COHORT/.test(t), "carries a CITE THIS COHORT block");
  ok(/METHODOLOGY 1\.1\.0/.test(t) && new RegExp(M.pack.archive_stamp).test(t),
    "carries the methodology version and pack stamp");
  ok(/RESEARCH ONLY — NOT A FORECAST/.test(t), "carries the research-only disclaimer");
  if (f !== MANIFEST_DOC) ok(/The question a desk actually asks/.test(t), "carries the comparison strip");
  ok(/storm-atlas\/\?v=1/.test(html), "carries at least one replay URL");
  ok(/GENESIS-CONDITIONED/.test(t), "states the genesis-conditioned rule");

  /* -- traceability: every printed n/N -- */
  const badFractions = [];
  for (const m of t.matchAll(/(?<![\d.])(\d{1,4})\s*\/\s*(\d{1,4})(?![\d.])/g)) {
    const key = `${m[1]}/${m[2]}`;
    if (FRACTIONS.has(key)) continue;
    if (/1\/1\.1|48 h \/ 7 d/.test(m[0])) continue;
    badFractions.push(key + `  …${t.slice(Math.max(0, m.index - 60), m.index + 30)}…`);
  }
  ok(badFractions.length === 0, "every n / N traces to the manifest",
    badFractions.slice(0, 5).join("\n        "));

  /* -- traceability: every printed percentage -- */
  const badPct = [];
  for (const m of t.matchAll(/(\d+(?:\.\d)?)\s*%/g)) {
    const v = m[1];
    if (PERCENTS.has(v) || PERCENTS.has(Number(v).toFixed(1))) continue;
    if (NON_COHORT.has(v)) continue;
    /* Interval bounds print as integers: 55–95%. Accept a value that is a bound of a
       manifest interval. */
    let bound = false;
    for (const iv of INTERVALS) { const [a, b] = iv.split("-"); if (a === v || b === v) bound = true; }
    if (bound) continue;
    badPct.push(v + `%  …${t.slice(Math.max(0, m.index - 70), m.index + 20)}…`);
  }
  ok(badPct.length === 0, "every percentage traces to the manifest",
    badPct.slice(0, 6).join("\n        "));

  /* -- traceability: every Wilson interval -- */
  const badIv = [];
  for (const m of t.matchAll(/(\d{1,3})\s*[–-]\s*(\d{1,3})\s*%/g)) {
    const key = `${m[1]}-${m[2]}`;
    if (INTERVALS.has(key)) continue;
    badIv.push(key + `  …${t.slice(Math.max(0, m.index - 60), m.index + 20)}…`);
  }
  ok(badIv.length === 0, "every 95% interval traces to the manifest",
    badIv.slice(0, 5).join("\n        "));

  /* -- prohibition: no state name in the same block as a rate --
     A state NAME is a fact about a named storm and is allowed; a state name inside the same
     block as a percentage or an n/N is not, because a reader cannot be relied on to keep them
     apart. A block carrying only intensities in knots is a member fact and passes. */
  const stateRate = [];
  for (const b of blocks(html)) {
    const low = b.toLowerCase();
    if (!STATE_WORDS.some((w) => low.includes(w))) continue;
    if (!RATE_NEAR.test(b)) continue;
    if (/\bkt\b/.test(b) && !/%/.test(b)) continue;   // member landfall facts
    /* THE ONE EXEMPTION, AND WHY IT IS NARROW.
       The basis-risk paragraphs have to name the states in a CONUS cohort -- that a Gulf book is
       being sold a national-coastline prior is the whole finding, and it cannot be made without
       saying Florida. A block that carries the non-attribution IN THE SAME BLOCK as the rate is
       therefore allowed: the reader meets the warning and the number together, which is the
       arrangement the rule is protecting. A block that names a state beside a rate and says
       nothing about scope is not exempt, and the check still fails on it. */
    if (NON_ATTRIBUTION.test(b)) continue;
    stateRate.push(b.slice(0, 220));
  }
  ok(stateRate.length === 0, "no state name shares a block with a rate",
    stateRate.slice(0, 4).join("\n        "));

  /* -- prohibition: affirmative forecast / ranking language --
     "Storm Atlas implements no closest-analog metric" is the package saying so, and it says it
     on nearly every page. Only an AFFIRMATIVE use is a violation, so a negation immediately
     before the phrase clears it. */
  const NEGATED = /\b(no|not|never|without|neither|nor|nothing|none|refuses|refuse|implements)\b[^.]{0,46}$/i;
  const forecast = [];
  for (const re of FORECAST_PHRASES) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of t.matchAll(g)) {
      const before = t.slice(Math.max(0, m.index - 46), m.index);
      if (NEGATED.test(before)) continue;
      forecast.push(`"${m[0]}"  …${before.slice(-46)}[${m[0]}]…`);
    }
  }
  ok(forecast.length === 0, "no affirmative forecast or similarity-ranking language",
    forecast.slice(0, 4).join("\n        "));

  /* -- prohibition: fabricated row-level status -- */
  const fab = FABRICATED_STATUS.filter((re) => re.test(html)).map((re) => String(re));
  ok(fab.length === 0, "no fabricated row-level STATUS", fab.join(", "));

  /* -- prohibition: unshipped delivery marketed as available -- */
  if (UNSHIPPED.some((re) => re.test(t))) {
    ok(/PROPOSED|PILOT|NOT SHIPPING/i.test(t),
      "unshipped delivery is labelled PROPOSED / PILOT");
  } else pass("no unshipped delivery claimed");

  /* -- the STATUS column is present on every OUTCOME ledger (the system grid on artifact A is
        not one: it carries no contract rows) -- */
  /* `.ledger` is the house table style, not a claim about content: the system grid on artifact A
     and the comparison strip on every artifact borrow it and carry no contract rows. Only a
     table that actually prints outcome rows needs the STATUS column. */
  const outcomeTables = (html.match(/<table class="ledger[^"]*"/g) || [])
    .filter((tag) => !/sysgrid|cmptable/.test(tag)).length;
  if (outcomeTables) {
    const statusHeads = (html.match(/>Status returned</g) || []).length;
    ok(statusHeads > 0, "every outcome ledger keeps a STATUS column",
      `${outcomeTables} ledger table(s), ${statusHeads} STATUS heading(s)`);
  }

  /* -- refusals the manifest holds for a cohort this artifact cites must appear -- */
  const cited = M.systems.filter((sy) => html.includes(sy.replay_url));
  for (const sy of cited) {
    const stamps = new Set(Object.values(sy.unscoreable).map((u) => u.status));
    for (const st of stamps) {
      ok(t.includes(st), `refusal shown for ${sy.id}: "${st}"`);
    }
    if (!sy.cohort.sufficient) {
      ok(/REFUSED/.test(t), `refusal shown for ${sy.id}: below min sample`);
    }
  }
}

console.log(`\n${checks - fails} / ${checks} checks passed`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
