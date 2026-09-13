#!/usr/bin/env node
/* NO STALE PRESENT-TENSE LIVE CLAIM ON A SHEET THAT IS SENT.
 *
 * The terminal and the collateral have opposite relationships with time, and the same sentence
 * is correct on one and false on the other. A terminal re-renders on its own tick, so "Edouard
 * IS at 29.9N 94.0W" is a reading of the moment it is read. A PDF is rendered once and opened
 * whenever the recipient opens it, so the same sentence asserts, on that day, a position observed
 * on the ingest's day. Nothing in the file goes stale -- the CLAIM does, because the tense makes
 * the reading a statement about now.
 *
 * This is not hypothetical for this package. The two prospect-send sheets were rendered at the
 * 01 Sep 2026 21:08 UTC ingest with AL052026 live and both carried LIVE STATUS in the masthead
 * and "AL052026 ... is at 29.9N 94.0W, 45 kt on NHC advisory 006" in the text. AL052026 has since
 * left the feed. The numbers were right; the tense had turned them into a false claim.
 *
 * The fix these sheets use is not deletion and not a refresh. A refresh only re-arms the same
 * failure with a newer date. The reading stays, verbatim, and is DATED: the masthead key reads
 * OPERATIONAL AS OF rather than LIVE STATUS, the sentence is in the past, and the paragraph
 * carries the ingest's day so it can be read correctly on any later day.
 *
 * WHAT IS CHECKED, on the prospect-send sheets only:
 *   1. No LIVE framing label. LIVE STATUS / LIVE, <stamp> presents a frozen reading as current.
 *   2. Every live reading -- an advisory number, a b-deck reference, an operational fix, a named
 *      live system -- sits in a block that also carries the ingest's day.
 *   3. No present-tense verb binds a live subject to a reading: "X is at", "NHC classifies",
 *      "is currently", "is now". Past tense, or a dated as-of, or it does not ship.
 *   4. The as-of day printed IS the manifest's ingest day, so a dated claim cannot drift from
 *      the evidence that backs it any more than a live one could.
 *
 * Evergreen statements are deliberately allowed and are the reason (3) matches subjects rather
 * than verbs: "the archive holds no genesis row for it" and "the pack does not hold AL052026"
 * are facts about the committed pack, true on any day, and re-verified against the current pack
 * by scripts/check-collateral-replay.mjs. Only a LIVE subject is required to be in the past.
 *
 * Run: node scripts/check-collateral-asof.mjs
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { ROOT } from "./lib/atlas-verify.mjs";

const DIR = join(ROOT, "docs/collateral");
const M = JSON.parse(readFileSync(join(DIR, "source-manifest.json"), "utf8"));

/* The sheets that leave the building. A/B/B2/C/D are not exempt because they are allowed to be
   stale -- they are simply not in this workstream, and listing them here would fail a gate on
   sheets nobody re-exported. Add a sheet here when it is made send-ready. */
const SEND_READY = [
  "B1-97L-reinsurance-ils-parametric.html",
  "E-discrete-event-contract-evidence.html",
];

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const gen = new Date(M.operational.generated_at);
const STAMP_DAY = `${String(gen.getUTCDate()).padStart(2, "0")} ${MON[gen.getUTCMonth()]} `
  + `${gen.getUTCFullYear()}`;

/* Every name the operational layer and the desk line carry on this ingest. Read off the manifest
   rather than typed, so a sheet cannot smuggle in a live system by naming one this file has
   never heard of. */
const LIVE_NAMES = [...new Set([
  ...(M.nhc_advisories || []).flatMap((a) => [a.name, a.atcf_id]),
  ...(M.operational.storms || []).flatMap((s) => [s.name, s.atcf_id]),
].filter(Boolean))];

/* A COORDINATE IS NOT A READING JUST BECAUSE IT IS A COORDINATE. Two kinds appear on these
   sheets and only one of them can go stale:
     DECLARED    the cohort's own query cell, 28.0°N 88.7°W. It is a parameter of the published
                 question, it is in the replay URL, and it is as true in a year as it is today.
     OBSERVED    an operational latest fix, an advisory centre, a first tropical-status fix. Each
                 is a reading of one instant and needs that instant printed beside it.
   Both are read off the manifest, and a coordinate that is both is DECLARED -- the cell is what
   the sheet is about, and requiring the cohort's own cell to be dated would date the cohort. */
const key = (lat, lon, f) => `${Math.abs(lat).toFixed(f)}|${Math.abs(lon).toFixed(f)}`;
const DECLARED_COORDS = new Set();
const OBSERVED_COORDS = new Set();
const put = (set, lat, lon) => {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return;
  for (const f of [1, 0]) set.add(key(lat, lon, f));
};
for (const sy of M.systems) put(DECLARED_COORDS, sy.coordinates_queried.lat, sy.coordinates_queried.lon);
for (const st of M.operational.storms || []) put(OBSERVED_COORDS, st.latest.lat, st.latest.lon);
for (const a of M.nhc_advisories || []) put(OBSERVED_COORDS, a.lat, a.lon);
for (const g of M.genesis_determinations || []) {
  const x = g.first_tropical_fix_in_operational_record;
  if (x) put(OBSERVED_COORDS, x.lat, x.lon);
}
for (const k of DECLARED_COORDS) OBSERVED_COORDS.delete(k);

/* Does this block print a coordinate the manifest holds as an OBSERVED fix? */
const COORD = /\b(\d{1,3}(?:\.\d)?)\s*°?\s*N,? ?(\d{1,3}(?:\.\d)?)\s*°?\s*W\b/g;
const hasObservedCoord = (s) => [...s.matchAll(COORD)].some(([, la, lo]) =>
  [1, 0].some((f) => OBSERVED_COORDS.has(key(Number(la), Number(lo), f))));

const text = (html) => html
  .replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ").trim();

/* A BLOCK IS A SENTENCE-GROUP, NOT A TAG. The requirement is that a reader meets the date in the
   same breath as the reading, so the unit is the paragraph-ish run of text a reader takes in at
   once: split on the block-level boundaries the sheets actually use. */
const blocks = (html) => html
  .replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ")
  .split(/<\/?(?:p|div|td|th|li|h1|h2|h3|section|header|footer|tr|table|caption)\b[^>]*>/i)
  .map((b) => text(b)).filter(Boolean);

let fails = 0;
let checks = 0;
const ok = (cond, label, detail) => {
  checks++;
  if (cond) return true;
  fails++;
  console.log(`  FAIL  ${label}` + (detail ? `\n        ${detail}` : ""));
  return false;
};

console.log(`ingest ${M.operational.generated_at} — as-of day ${STAMP_DAY}`);
console.log(`live systems on this ingest: ${LIVE_NAMES.join(", ")}\n`);

for (const f of SEND_READY) {
  console.log(f);
  const html = readFileSync(join(DIR, f), "utf8");
  const t = text(html);

  /* 1 -- NO LIVE FRAMING LABEL. Both forms these sheets used are named explicitly; a generic
     /LIVE/ would fire on "not a live feed" and on "any live system", which are the refusals. */
  const labels = [...t.matchAll(/\bLIVE STATUS\b|\bLIVE,\s*\d{2} [A-Z]{3} \d{4}|\bLIVE\s+\d{2} [A-Z]{3} \d{4}/g)]
    .map((m) => m[0]);
  ok(labels.length === 0, "no LIVE framing label presents a frozen reading as current",
    [...new Set(labels)].join(" | "));

  /* 2 -- EVERY LIVE READING CARRIES THE INGEST'S DAY IN ITS OWN BLOCK. */
  const READING = new RegExp(
    String.raw`\badv(?:isory)? \d{3}\b|\bb-deck\b|\btropical-status fix\b|`
    + `\\b(?:${LIVE_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`);
  const undated = blocks(html)
    .filter((b) => (READING.test(b) || hasObservedCoord(b)) && !b.includes(STAMP_DAY));
  ok(undated.length === 0, `every live reading carries the ingest's day (${STAMP_DAY})`,
    undated.slice(0, 3).map((b) => b.slice(0, 150)).join("\n        "));

  /* 3 -- NO PRESENT-TENSE VERB ON A LIVE SUBJECT. Matched from the subject side: a live system's
     name, an ATCF id, or the determining authority, followed by a present-tense reading verb. */
  const SUBJ = `(?:${LIVE_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}`
    + `|NHC/ATCF|NHC|the operational record(?:'s [a-z- ]+)?|it)`;
  /* THE APPOSITIVE IS WHERE THIS HID THE FIRST TIME. "AL052026 (Tropical Storm Edouard, declared
     as Invest 97L) IS AT 29.9N 94.0W" is the exact sentence this gate exists for, and a pattern
     that wanted the verb directly after the subject walked straight past it, because nine words
     of parenthesis sat in between. A bracketed, dashed or comma'd appositive is allowed between
     the two and the verb is still the verb of that subject. */
  const APPOS = String.raw`(?:\s*\([^)]*\)|\s*—[^—.;]*—|\s*,[^,.;]*,)?`;
  const VERB = String.raw`(?:is|are|remains|sits|stands|classifies|carries|holds|shows|reports|returns|has)\b`;
  const present = [...t.matchAll(new RegExp(
    String.raw`[^.;]*\b${SUBJ}${APPOS}\s+(?:currently\s+|now\s+)?${VERB}[^.;]*[.;]`, "g"))]
    .map((m) => m[0].trim())
    /* An evergreen fact about the committed pack is not a live reading and must not be pushed
       into the past: "the archive holds no genesis row", "the pack does not hold AL052026". */
    .filter((sent) => !/\b(?:archive|pack)\b/i.test(sent))
    /* A refusal that names liveness to disclaim it -- "not a live feed", "any live system" -- is
       the opposite of the claim this gate is looking for. */
    .filter((sent) => !/\bnot\b|\bno\b|\bnever\b|\bneither\b|\bany live system\b/i.test(sent));
  ok(present.length === 0, "no present-tense verb binds a live subject to a reading",
    present.slice(0, 3).map((s) => s.slice(0, 150)).join("\n        "));

  /* 4 -- THE AS-OF DAY IS THE INGEST'S DAY. A sheet that dates itself to a day the manifest does
     not hold has been hand-edited away from its evidence, which is the failure a date is
     supposed to prevent. */
  const asOf = [...t.matchAll(/AS OF\s+(\d{2} [A-Z]{3} \d{4})/g)].map((m) => m[1]);
  ok(asOf.length > 0, "the sheet states an as-of day");
  ok(asOf.every((d) => d === STAMP_DAY), "every as-of day is the ingest's own day",
    [...new Set(asOf.filter((d) => d !== STAMP_DAY))].join(", "));
  console.log("");
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED` : `${checks} / ${checks} checks passed`);
process.exit(fails ? 1 : 0);
