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
import { LEGIBILITY_CUTS } from "./lib/collateral-cuts.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { ROOT } from "./lib/atlas-verify.mjs";

const DIR = join(ROOT, "docs/collateral");
const M = JSON.parse(readFileSync(join(DIR, "source-manifest.json"), "utf8"));
const CONTRACT_SOURCES = JSON.parse(readFileSync(join(DIR, "contract-sources.json"), "utf8")).sources;

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
  /* NHC advisory values and the operational first-tropical fix, read off the manifest each
     build -- never a typed list, which went stale the first time an advisory was reissued. */
  ...(M.nhc_advisories || []).flatMap((a) => [a.lat, Math.abs(a.lon), a.wind_kt, a.mslp_mb,
    Number(a.advisory), a.lat.toFixed(1), Math.abs(a.lon).toFixed(1)].map(String)),
  ...(M.genesis_determinations || []).flatMap((g) => g.first_tropical_fix_in_operational_record
    ? [g.first_tropical_fix_in_operational_record.lat, Math.abs(g.first_tropical_fix_in_operational_record.lon),
      g.first_tropical_fix_in_operational_record.kt, g.first_tropical_fix_in_operational_record.mslp].map(String) : []),
  "100", "28.0", "88.7", "13.2", "115.0", "12.0", "107.5", "11.3", "133.8", "250", "150",
  "1971", "2026", "31", "1", "0", "10", "8", "5", "1.1.0", "64", "34", "96", "113", "137", "83",
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
/* THE REGISTER MAY NOT NAME A PROTECTED ELEMENT. Recording a cut explains it; it never makes a
   required element optional, and an entry claiming to have cut one is a contradiction the build
   should refuse rather than publish. */
for (const [file, entries] of Object.entries(LEGIBILITY_CUTS)) {
  for (const e of entries) {
    /* PROTECTED is read as written, not as a keyword list. Provenance -- a cite block and its
       replay URL -- is protected on every prospect-facing sheet. The PLATE clause names one
       plate on one artifact: the four-mark NA + EP plate on A, which is that page's hero visual.
       A different artifact dropping a map to buy room for evidence is a layout decision the
       brief invites, so the plate half of this check is scoped to A. */
    const everywhere = /\bcite\b|citation string|replay url|provenance/i.test(e.block);
    const plateOnA = /^A-/.test(file) && /\bplate\b/i.test(e.block);
    const claimsProtected = e.kind === "cut" && (everywhere || plateOnA);
    ok(!claimsProtected, `cut register: ${file} does not claim to have cut a protected element`,
      `"${e.block}" — see PROTECTED in scripts/lib/collateral-cuts.mjs`);
  }
}

/* ---- THE TRIGGER LOCK, PREMISE ------------------------------------------------------------
   Artifact E prints EXACT TRIGGER NOT SCORED. That is a claim about the archive, so it is
   checked against the archive rather than trusted: the landfall contract registry must carry
   exactly two intensity forms -- `any` and `hurricane` (>= 64 kt) -- over whole regions, with no
   sub-CONUS region and no key that joins an intensity to a region beyond hurricane. If a future
   pack ever DID hold a Cat 4-at-landfall row, this assertion fails first and the refusal comes
   off the page before anyone has to notice it went stale. */
const LF_KEYS = new Set(M.systems.flatMap((sy) => sy.landfall_rows.map((r) => r.key)));
const badForm = [...LF_KEYS].filter((k) => !/^[a-z_]+:(any|hurricane)$/.test(k));
ok(badForm.length === 0,
  "landfall registry holds only the `any` and `hurricane` forms — no Cat 4 landfall row exists",
  badForm.join(", "));
const SUB_CONUS = /gulf|florida|texas|louisiana|mississippi|alabama|carolina|atlantic_coast/i;
const subConus = [...LF_KEYS].filter((k) => SUB_CONUS.test(k));
ok(subConus.length === 0, "landfall registry holds no sub-CONUS region", subConus.join(", "));
/* The joint products the page must never print: every intensity rate multiplied by every
   landfall rate, on each cohort, at the precisions a page could round them to. */
const FORBIDDEN_PRODUCTS = new Map();
for (const sy of M.systems) {
  for (const a of sy.intensity_rows) {
    for (const b of sy.landfall_rows) {
      if (a.rate === null || b.rate === null) continue;
      const v = a.rate * b.rate * 100;
      for (const p of [v.toFixed(1), String(Math.round(v))]) {
        if (!FORBIDDEN_PRODUCTS.has(p)) FORBIDDEN_PRODUCTS.set(p, `${sy.id} ${a.key} x ${b.key}`);
      }
    }
  }
}

ok(artifacts.length === 7, `seven artifacts rendered`,
  `found ${artifacts.length}: ${artifacts.join(", ")}`);
ok(files.includes(MANIFEST_DOC), "the source manifest is rendered");

for (const f of files) {
  console.log(`\n${f}`);
  const html = readFileSync(join(DIR, f), "utf8");
  const t = text(html);

  /* -- FRESHNESS: THE STAMP IS THE INGEST, AND NO LIVE LINE IS DATED ANYWHERE ELSE ------------
     liveStamp() renders operational.generated_at, so the printed stamp cannot drift from the
     feeds by construction; this checks the rendered text anyway, and then that no sentence on
     the page dates a LIVE reading to a different day than the ingest. A refreshed feed under a
     stale hand-written sentence is exactly the failure this catches. */
  const gen = new Date(M.operational.generated_at);
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const stampDay = `${String(gen.getUTCDate()).padStart(2, "0")} ${MON[gen.getUTCMonth()]} ${gen.getUTCFullYear()}`;
  /* A sheet that prints a live reading must carry the ingest's stamp; a sheet that prints none
     -- D is cohorts and delivery only -- owes no stamp, and must not be dated to another day. */
  const printsLive = /\bLIVE\b|\badv(?:isory)? \d{3}\b|\bb-deck\b/.test(t);
  if (f !== MANIFEST_DOC) {
    if (printsLive) ok(t.includes(stampDay), `live stamp is the ingest's own day (${stampDay})`);
    else pass("no live reading printed; no stamp owed");
    const dated = [...t.matchAll(/\b(\d{2}) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})(?:,| ·| at)? ?\d{2}:\d{2}/g)]
      .map((m) => `${m[1]} ${m[2].toUpperCase()} ${m[3]}`).filter((d) => d !== stampDay);
    ok(dated.length === 0, "no LIVE reading is dated to a day other than the ingest",
      [...new Set(dated)].join(", "));
    /* EVERY PRINTED COORDINATE IS ONE THE MANIFEST HOLDS. Declared cells, member genesis fixes,
       operational latest fixes, advisory centres and first-tropical fixes are all in the
       manifest; a position typed into a sentence is not, and it is exactly what an advisory
       reissue leaves behind. Matched at the precision the sheet prints (0.1 deg or whole). */
    const coordSet = new Set();
    const put = (lat, lon) => { if (lat === null || lat === undefined || lon === null || lon === undefined) return;
      for (const f of [1, 0]) coordSet.add(`${Math.abs(lat).toFixed(f)}|${Math.abs(lon).toFixed(f)}`); };
    for (const sy of M.systems) { put(sy.coordinates_queried.lat, sy.coordinates_queried.lon);
      for (const m of (sy.representatives || {}).members || []) put(m.genesis_lat, m.genesis_lon); }
    for (const st of M.operational.storms) put(st.latest.lat, st.latest.lon);
    for (const a of M.nhc_advisories || []) put(a.lat, a.lon);
    for (const g of M.genesis_determinations || []) { const x = g.first_tropical_fix_in_operational_record; if (x) put(x.lat, x.lon); }
    const printed = [...t.matchAll(/\b(\d{1,2}(?:\.\d)?)°?N,? (\d{2,3}(?:\.\d)?)°?W\b/g)];
    const unknown = printed.filter(([, la, lo]) => !coordSet.has(`${Number(la).toFixed(1)}|${Number(lo).toFixed(1)}`)
      && !coordSet.has(`${Number(la).toFixed(0)}|${Number(lo).toFixed(0)}`)).map((m) => m[0]);
    ok(unknown.length === 0, "every printed coordinate is a manifest coordinate (no stale position)",
      [...new Set(unknown)].join(", "));
    ok(M.operational.health && M.operational.health.ok
      && (M.operational.health.stale_atcf_ids || []).length === 0,
      "operational artifact is healthy with no stale active storm");
  }

  /* -- completeness -- */
  ok(!/COPY SLOT "[^"]+" NOT SUPPLIED/.test(html), "every copy slot supplied",
    (html.match(/COPY SLOT "[^"]+" NOT SUPPLIED/g) || []).slice(0, 6).join(", "));
  /* PROVENANCE IS NOT CUTTABLE. Recording a removal explains it; it does not make a required
     element optional. The cite block and its replay URL are the thing a counterparty reopens, so
     no entry in scripts/lib/collateral-cuts.mjs can excuse their absence -- this check takes no
     register argument at all. */
  ok(/CITE THIS COHORT/.test(t), "carries a CITE THIS COHORT block");
  ok(/storm-atlas\/\?v=1/.test(html), "carries a replay URL beside it");
  /* THE HERO PLATE ON A. Named non-negotiable in the brief, so it is checked against the rendered
     page rather than left to a layout decision. */
  if (f === "A-active-systems-overview.html") {
    ok(/North Atlantic and East Pacific plate, four marks/.test(html),
      "carries the four-mark NA + EP plate");
  }
  ok(/METHODOLOGY 1\.1\.0/.test(t) && new RegExp(M.pack.archive_stamp).test(t),
    "carries the methodology version and pack stamp");
  ok(/RESEARCH ONLY — NOT A FORECAST/.test(t), "carries the research-only disclaimer");
  /* THE COMPARISON, FULL OR COMPRESSED. What Storm Atlas adds over a public map has to be on the
     page; whether it takes a three-row table or a single sentence is a layout decision, and the
     brief ranks compressing it above sacrificing core evidence, the plate or provenance. Either
     form satisfies this; neither being present does not, register entry or no. */
  if (f !== MANIFEST_DOC) {
    ok(/The question a desk actually asks/.test(t) || /WHAT ATLAS ADDS/i.test(t),
      "carries the comparison — full strip or compressed line",
      "neither the strip nor a WHAT ATLAS ADDS line is present");
  }
  ok(/GENESIS-CONDITIONED/.test(t), "states the genesis-conditioned rule");

  /* -- GATE 1: THE QUESTION TEXT MATCHES THE POINT TYPE ------------------------------------
     A cohort keyed to a declared point may not be described as an observed one. The manifest
     settles which it is: `genesis_determinations` runs the archive's own rule against the
     operational record, and `point_type` on each system records the answer. No page may print a
     label the manifest does not carry, and while no live system has an archive genesis row,
     "OBSERVED GENESIS" may not appear on any of them at all. */
  const archiveGenesis = new Set(M.genesis_determinations
    .filter((g) => g.present_in_archive_pack).map((g) => g.atcf_id));
  /* Sentence-scoped and negation-aware, because the correct pages say the phrase constantly --
     "no system here has an Atlas OBSERVED GENESIS point", "DECLARED · NOT ATLAS-OBSERVED". A page
     denying that it has one is the behaviour this check exists to produce, not to punish; what
     fails is an affirmative claim to a point the manifest says the archive does not hold. */
  const genesisClaims = (t.match(/[^.]*OBSERVED GENESIS[^.]*\.?/g) || [])
    .filter((sent) => !/\bnot\b|\bno\b|\bnever\b|\bwithout\b|\bNOT ATLAS-OBSERVED\b/i.test(sent));
  ok(archiveGenesis.size > 0 || genesisClaims.length === 0,
    "no cohort is labelled OBSERVED GENESIS while the archive holds no genesis row for it",
    genesisClaims.slice(0, 3).join(" | "));
  for (const sy of M.systems.filter((x) => html.includes(x.replay_url))) {
    if (sy.point_type === "PRE-GENESIS REFERENCE CELL") continue;
    ok(!new RegExp(`${sy.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]{0,80}observed genesis`, "i").test(t),
      `${sy.id}: the page does not call its declared point an observed one`);
  }
  /* OPERATIONAL FORMATION IS A FACT, AND MAY BE STATED. NHC/ATCF classifying a system, and the
     operational record carrying a first tropical-status fix, are observations with sources and
     instants; a page may print either with attribution. What is prohibited is the CONVERSION:
     neither may be presented as an Atlas OBSERVED GENESIS point, and no cohort may be run from
     one. The two checks above police that conversion -- the point-type label must match the
     manifest, and no declared point may be called observed. There is deliberately no check here
     against the words "has formed": suppressing a sourced operational fact would make the pages
     less accurate, not more careful. */

  /* -- GATE 2: NO COMPOSITION OF AN OUTLOOK PROBABILITY WITH AN ATLAS ROW -------------------
     The correction is specific: an unconditional probability needs an external formation
     probability on the SAME formation event and conditioning set, and none is computed here. The
     sentence must be present, and no sentence may claim the two multiply. */
  ok(/unconditional intensity probability/i.test(t)
    && /same formation event and conditioning set/i.test(t),
    "carries the formation-probability composition rule");
  const multiplyClaims = (t.match(/[^.]*\bmultipl(?:y|ied|ication)\b[^.]*\./gi) || [])
    /* Negation-aware, and "no X is multiplied" is negation just as much as "is not multiplied":
       every sentence in this package that names multiplication does so to forbid it. */
    .filter((sent) => !/\bnot\b|\bno\b|\bnever\b|\bunless\b|\bwould\b|\brequires?\b/i.test(sent));
  ok(multiplyClaims.length === 0,
    "no sentence composes an outlook probability with an Atlas row",
    multiplyClaims.slice(0, 2).join(" | "));

  /* -- GATE 6/7/8: THE DISCRETE TRIGGER LOCK ------------------------------------------------
     These three run on every artifact, and bite on any page that names a JOINT trigger -- an
     intensity condition evaluated AT a landfall. The archive scores intensity attainment over a
     storm's life and landfall over a region; it does not score their conjunction, and the whole
     point of the page that names one is that the conjunction is where the evidence stops. */
  const JOINT = /cat(?:egory)?\s*4\+?\s*(?:hurricane\s*)?(?:at|makes?|making)\s*(?:us|conus|contiguous)?[^.;]{0,32}landfall|cat\s*4\+\s*at\s*conus\s*landfall|at\s*(?:cat|category)\s*4\s*or\s*higher/i;
  if (JOINT.test(t)) {
    /* 6 -- THE EXACT TRIGGER IS NOT SCORED, AND THE PAGE SAYS SO. */
    ok(/EXACT TRIGGER NOT SCORED/.test(t),
      "names the joint trigger and prints EXACT TRIGGER NOT SCORED");
    const scored = blocks(html).filter((b) => JOINT.test(b) && RATE_NEAR.test(b));
    ok(scored.length === 0,
      "no rate, count or interval shares a block with the joint trigger",
      scored.slice(0, 3).map((b) => b.slice(0, 160)).join("\n        "));

    /* 7 -- NO MARGINAL MULTIPLICATION, IN WORDS OR IN ARITHMETIC.
       The language check is negation-aware for the same reason as GATE 2: the only sentences in
       this package that name a product name it to refuse it. The arithmetic check needs no
       language at all -- it recomputes every intensity x landfall product the manifest makes
       possible and fails if the page prints one, whatever it is called. */
    const PRODUCT = /\bx\b|\u00d7|\btimes\b|multiplied by|product of|joint (?:probability|rate|likelihood)|combined (?:probability|rate)/i;
    const products = blocks(html).filter((b) => PRODUCT.test(b) && RATE_NEAR.test(b)
      && !/\bnot\b|\bno\b|\bnever\b|\bneither\b|\bnor\b/i.test(b));
    ok(products.length === 0,
      "no block multiplies an intensity row by a landfall row",
      products.slice(0, 3).map((b) => b.slice(0, 160)).join("\n        "));
    const printed = [];
    for (const m of t.matchAll(/(\d+(?:\.\d)?)\s*%/g)) {
      /* A value the manifest itself publishes is a manifest rate, not a product -- a collision
         between a real row and an arithmetic coincidence resolves in favour of the row. */
      if (PERCENTS.has(m[1]) || PERCENTS.has(Number(m[1]).toFixed(1))) continue;
      if (FORBIDDEN_PRODUCTS.has(m[1])) printed.push(`${m[1]}% = ${FORBIDDEN_PRODUCTS.get(m[1])}`);
    }
    ok(printed.length === 0, "no printed percentage equals a marginal product",
      printed.slice(0, 3).join(", "));

    /* THE CONTRACT'S OWN PROVENANCE. The terms beside the cohort are not Atlas output and do
       not travel on the Atlas cite string, so each one needs a public source printed on the
       sheet -- or, where this build holds no citable document, the gap printed instead. Both
       halves are checked: every entry must appear, and no URL may appear that is not either the
       Atlas replay URL or one of these sources, so a citation cannot be invented on the page. */
    /* THE HEADING MAY NOT OUTRUN THE RECORD. AS PUBLISHED / VERIFIED asserts a document a reader
       can re-open; while a source is held only as a transcription the block must be headed as
       one. Both directions are checked, so restoring the URL without restoring the heading -- or
       the reverse -- fails here rather than on the sheet. */
    const dsrc = CONTRACT_SOURCES.find((x) => x.id === "discrete-terms");
    if (dsrc) {
      const wanted = dsrc.url ? dsrc.heading_when_held : dsrc.heading_when_missing;
      const unwanted = dsrc.url ? dsrc.heading_when_missing : dsrc.heading_when_held;
      ok(t.includes(wanted) && !t.includes(unwanted),
        `terms heading matches the source record (${dsrc.url ? "held" : "transcribed"})`, wanted);
    }

    const srcLine = blocks(html).find((b) => /^SOURCES\b/.test(b)) || "";
    ok(srcLine !== "", "the contract terms carry a SOURCES line");
    for (const src of CONTRACT_SOURCES) {
      const shown = src.url
        ? srcLine.includes(src.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))
        : srcLine.includes(src.gap_note || "SOURCE URL NOT HELD");
      ok(shown, `contract source printed: ${src.label} (${src.url ? "url" : "gap"})`,
        src.url || `${src.publisher}, ${src.accessed}`);
      /* The label is checked INSIDE the sources line, not anywhere on the sheet: "Determination"
         also appears in the printed terms, and a source that lost its label would have passed a
         page-wide search on that coincidence. */
      ok(srcLine.includes(src.label), `contract source labelled: ${src.label}`, srcLine.slice(0, 160));
    }
    const allowedHosts = new Set(CONTRACT_SOURCES.filter((x) => x.url)
      .map((x) => new URL(x.url).host));
    for (const sy of M.systems) allowedHosts.add(new URL(sy.replay_url).host);
    /* CITATIONS, NOT ASSETS. A URL a reader can follow is either printed in the text or sits in
       an anchor; the font stylesheet in <head> is neither, and is not a claim about anything. */
    const cited = [...t.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0])
      .concat([...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]));
    const foreign = cited.filter((u) => { try { return !allowedHosts.has(new URL(u).host); }
      catch { return true; } });
    ok(foreign.length === 0, "every URL on the sheet is the replay URL or a declared source",
      [...new Set(foreign)].slice(0, 3).join(", "));

    /* 8 -- NO REGIONAL-VARIANT FABRICATION. A sub-CONUS place name may appear as a fact about a
       named storm; it may never appear beside a rate, and there is no disclaimer that buys an
       exemption here. The registry has no sub-CONUS row, so any such number would be invented. */
    const REGIONAL = /\bgulf\b|\bflorida\b|\btexas\b|\blouisiana\b|\bmississippi\b|\balabama\b|\bcarolina\b/i;
    const regional = blocks(html).filter((b) => REGIONAL.test(b)
      && (RATE_NEAR.test(b) || /\[\s*\d+\s*[-\u2013]\s*\d+\s*%/.test(b)));
    ok(regional.length === 0,
      "no sub-CONUS region shares a block with a rate or an interval",
      regional.slice(0, 3).map((b) => b.slice(0, 160)).join("\n        "));
  }

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

  /* -- THE REFUSAL INVARIANT: A STAMP A ROW CARRIES IS A STAMP THE READER CAN SEE ----------
     Not "every cohort this page links must print its refusals" -- a replay URL is a pointer, and
     A, D and E point at cohorts whose stamped rows they never tabulate. Not "every outcome table
     has a STATUS column" either -- the evidence row carries its state in the row. The rule that
     is actually owed: every outcome row RENDERED on this sheet that the archive stamped must have
     that stamp visible somewhere on the sheet, in full -- in the row itself (column model), or
     once in the panel note or the UNSCOREABLE box (token model). The renderers put the archive's
     full stamp on each such row as data-status, so this reads what was rendered, not what was
     linked, and needs no inference about which cohort a table belongs to.
     The previous version of this loop matched a raw replay URL against markup where & is &amp;
     and had never fired; it is replaced, not repaired, because its predicate was wrong. */
  const carried = [...new Set([...html.matchAll(/data-status="([^"]+)"/g)].map((m) => m[1]
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"')))];
  for (const st of carried) {
    ok(t.includes(st), `stamp visible for every rendered row that carries it: "${st}"`);
  }
  /* A state token in a row must be the head of a stamp some rendered row actually carries: no
     token may be printed that the archive did not return for this sheet. */
  const heads = new Set(carried.map((st) => st.split(/\s+--\s+/)[0]));
  const tokens = [...new Set([...html.matchAll(/<span class="st">([^<]+)<\/span>/g)].map((m) => m[1]))];
  const orphan = tokens.filter((tok) => !heads.has(tok));
  ok(orphan.length === 0, "no state token is printed that no rendered row carries", orphan.join(", "));
  /* And the STATUS column survives on any column-model outcome ledger -- the house style has one
     and its absence would mean a renderer dropped it. Evidence tables carry state in the row. */
  const columnTables = (html.match(/<table class="ledger(?! compact evidence)[^"]*"/g) || [])
    .filter((tag) => !/sysgrid|cmptable|reflow|timing|sens/.test(tag)).length;
  if (columnTables) {
    const statusHeads = (html.match(/>Status returned</g) || []).length
      + (html.match(/>Status</g) || []).length
      + (html.match(/>Cohort status</g) || []).length;
    ok(statusHeads > 0, "every column-model outcome ledger keeps a STATUS column",
      `${columnTables} ledger table(s), ${statusHeads} STATUS heading(s)`);
  }
}

console.log(`\n${checks - fails} / ${checks} checks passed`);
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
