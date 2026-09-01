/* THE LEGIBILITY CUT REGISTER — AND WHAT IT MAY NOT DO.
 *
 * The type gate fixes the sizes: 8.5 pt body, callout and subhead; 7.5 pt table, citation, detail
 * and map label; 7 pt footer and legal. Cut content before shrinking type. At the old scale these
 * artifacts carried roughly twice what a Letter page holds at those sizes, so blocks came out or
 * came down, and this file is where each one is named, costed, and given the thing that carries
 * its content instead.
 *
 * IT IS A RECORD, NOT A WAIVER. Recording a removal explains it; it does not make a required
 * element optional. PROTECTED below lists what may never be cut on a prospect-facing sheet, and
 * scripts/check-collateral.mjs enforces those directly against the rendered page -- no entry in
 * this file is consulted, so nothing written here can buy an exemption. A register entry naming a
 * protected element is itself a failure.
 *
 * `kind` is "cut" when a block left the page, "compressed" when it stayed in a smaller form, and
 * "restored" when a later recomposition gave a cut block its room back.
 */
export const PROTECTED = [
  { what: "the four-mark NA + EP plate on artifact A — this clause is about A and no other sheet",
    why: "the hero visual; the one place a reader sees all four queried points against a coastline" },
  { what: "a CITE THIS COHORT block on every prospect-facing artifact",
    why: "provenance is the product; a cohort a counterparty cannot reopen is a number in a deck" },
  { what: "the replay URL beside it",
    why: "the URL is what reproduces the cite string, the counts, the intervals and the refusals" },
  { what: "the comparison — the full strip or a compressed WHAT ATLAS ADDS line",
    why: "compressing it ranks above sacrificing core evidence, the plate or provenance" },
];

export const LEGIBILITY_CUTS = {
  "A-active-systems-overview.html": [
    { kind: "cut", block: "commercial tag stack (four boxes)", px: 299,
      instead: "the Atlas value-add column of the four-system table, and the COMMERCIAL RELEVANCE box",
      why: "one interpretation per system, printed twice on one sheet" },
    { kind: "cut", block: "answers rail (three columns)", px: 102,
      instead: "the table's own timestamped LIVE column, and a COMMERCIAL RELEVANCE box beside the refusal",
      why: "the rail restated the page above it; unrolled, the same content sits where the scan order wants it, and the space buys the plate and the cite panel" },
    { kind: "compressed", block: "comparison strip → a WHAT ATLAS ADDS line", px: 173,
      instead: "one sentence inside the COMMERCIAL RELEVANCE box",
      why: "the strip's argument survives; its three-row table did not fit beside four cohorts" },
    { kind: "compressed", block: "four separately headed cite blocks → one CITE THIS COHORT panel", px: 105,
      instead: "one label, four cohorts named beside their own replay URLs, and a line pointing at the manifest for the full strings",
      why: "a replay URL is 106 characters and wraps to two lines at any width this page can give it, so four repeated labels spent height on labels rather than evidence. The block and every URL stay." },
  ],
  "B-97L-gulf-event-dossier.html": [
    { kind: "cut", block: "answers rail (three columns)", px: 161,
      instead: "the live strip directly below it, the cell rationale beside that, and the commercial box on sheet 2",
      why: "the rail restated three blocks that were already on the dossier" },
    { kind: "compressed", block: "four-column frequency ledgers → two-line evidence rows", px: 0,
      instead: "the same 19 rows, same order, same n/N, rates, intervals and stamps, each row folded to name + rate over denominator + interval + state token",
      why: "a four-column row could not be narrower than the sum of its widest cells and printed over its neighbour; the folded row is as wide as its widest line and the three groups stay side by side" },
    { kind: "compressed", block: "group labels and status stamps → state tokens", px: 0,
      instead: "INTENSITY · GENESIS-CONDITIONED / LANDFALL · SCORED REGIONS / LANDFALL · CONTINUED, OUT OF SCOPE and BASE RATE ONLY in the rows, and the full stamps once in the panel note",
      why: "row = state token, panel note = explanation; the explanation was setting the tables' minimum width twelve times over" },
    { kind: "compressed", block: "two sensitivity cite blocks → lines in the CITE THIS COHORT panel", px: 44,
      instead: "one panel on sheet 1 with the published cite string and three named replay URLs",
      why: "one citation, three ways to reopen it; the sensitivity table they belong to moved to sheet 2 and its URLs stayed beside the frequencies they reproduce" },
    { kind: "compressed", block: "comparison strip → a WHAT ATLAS ADDS line", px: 129,
      instead: "one sentence under the commercial reading on sheet 2",
      why: "the frequency panel took the row anatomy's height and the sample boundary moved to sheet 2 to make room; B2 and D carry the strip in full" },
    { kind: "cut", block: "analog-plate note", px: 30,
      instead: "section 07's own subtitle, which carries the selection rule",
      why: "the note said eight of twelve members print; four do. A stale count is worse than no note, and the rest of it restated the subtitles beside it" },
  ],
  "B1-97L-reinsurance-ils-parametric.html": [
    { kind: "cut", block: "answers rail", px: 133,
      instead: "the published question in the masthead and the live line beneath it",
      why: "the page opens with the question in full and closes with basis risk and two replay URLs" },
    { kind: "cut", block: "member-card row (eight cards)", px: 135,
      instead: "the near-miss note, which names Anita, Alicia and Barry with the facts a trigger turns on",
      why: "cards repeat members the near-miss note already names" },
    { kind: "compressed", block: "the published-question panel → the masthead sub-line", px: 104,
      instead: "the masthead sub-line, which carries the same sentence",
      why: "a sunken panel for one sentence" },
    { kind: "compressed", block: "four-column frequency ledgers → two-line evidence rows", px: 0,
      instead: "the same 19 rows folded to name + rate over denominator + interval + state token; group labels and stamps compressed to tokens, the full stamps printed once above the panel",
      why: "the column model printed over its neighbours at every chrome width; the folded row fits its track" },
    { kind: "compressed", block: "comparison strip → a WHAT ATLAS ADDS line", px: 115,
      instead: "one sentence above the two cite blocks",
      why: "the frequency panel took the row anatomy's height and the page stays one sheet; B2 and D carry the strip in full" },
  ],
  "C-karina-major-hurricane-analog-brief.html": [
    { kind: "cut", block: "answers rail (three columns)", px: 130,
      instead: "the live tiles, which carry what is happening now, and the SO WHAT box, which carries how it helps",
      why: "the rail restated two blocks already on the page" },
    { kind: "compressed", block: "four-column frequency ledgers → two-line evidence rows, three groups", px: 0,
      instead: "the same 19 rows folded to name + rate over denominator + interval + state token, in the same three groups B uses; the full stamps once in the panel note and in UNSCOREABLE on sheet 2",
      why: "twelve landfall rows in one column beside the plate could not fit their track at any chrome; three groups of the folded row share the sheet's width" },
    { kind: "restored", block: "second sheet — member cards, comparison strip, rarity box, seasonal timing", px: 0,
      instead: "sheet 1 is the observation and the frequencies; sheet 2 is what the members did, what the archive will not rank, the refusals and the comparison",
      why: "one sheet held this brief only by cutting the members and the comparison and clipping the landfall column. Page count is subordinate to a reader being able to read it" },
    { kind: "cut", block: "coverage-gaps note", px: 60,
      instead: "the source manifest, which prints every gap the engine reported",
      why: "a gaps list on a brief whose refusal block already names the stamped rows" },
  ],
  "D-storm-atlas-tear-sheet.html": [
    { kind: "cut", block: "colophon — archive scale, as built", px: 182,
      instead: "the page footer, which prints every count, the methodology version, the pack hash, the build time and the sources",
      why: "a five-row table restating the footer" },
    { kind: "compressed", block: "citation strings in the three worked samples → CITE THIS COHORT + URL", px: 132,
      instead: "each sample's labelled cite block and its replay URL",
      why: "three four-line cite strings on a one-page tear sheet. The block and the URL stay on all three." },
    { kind: "compressed", block: "five-column sample ledgers → two-line evidence rows", px: 0,
      instead: "the same rows folded to name + rate over denominator + interval, and the cohort question set as body text rather than legal mono",
      why: "a five-column ledger in a 242 px box was 344-357 px wide and printed over the box beside it" },
  ],
  "E-discrete-event-contract-evidence.html": [
    { kind: "cut", block: "member-card row (representative history)", px: 163,
      instead: "a two-line NAMED HISTORY note under the bridge — Anita 1977 and Alicia 1983, selected by the archive's own rule and printed as storm records, plus the replay URL, which reopens all twelve members",
      why: "the brief asks for two to four members IF SPACE ALLOWS. It does not: the evidence-bridge table is the centre of this page and the three refusals are the deliverable. The two members that matter — the one Cat 4, whose Cat 4 crossing is in Mexico, and the one CONUS hurricane crossing, which is Cat 3 — survive as the note." },
    { kind: "cut", block: "basin plate", px: 130,
      instead: "the cohort ledger, the bridge table and the replay URL",
      why: "the brief is explicit that the evidence-bridge table matters more than a large map on this page. A plate would have cost the bridge two rows." },
    { kind: "compressed", block: "PUBLIC FACTS ONLY disclaimer → trailing sentence of the terms block", px: 16,
      instead: "the same sentence, unchanged, at the end of the published-terms paragraph",
      why: "a two-line paragraph of its own for one sentence that belongs to the terms it qualifies" },
    { kind: "cut", block: "desk-use bullet — \"the three refusals are the deliverable as much as the rows\"", px: 14,
      instead: "section 03's own heading and the three-holes box, which are that statement made at length",
      why: "room for the contract's SOURCES line. The bullet restated the section it sat in; the sources under the terms did not exist anywhere on the sheet." },
    { kind: "compressed", block: "comparison → a WHAT ATLAS ADDS line", px: 14,
      instead: "\"WHAT ATLAS ADDS: a declared cohort, exact n / N with a 95% Wilson interval, a visible refusal, a replay URL.\"",
      why: "room for the SOURCES line the contract terms needed. What Atlas adds survives in full; the public-map contrast it was set against did not fit beside it, and PROTECTED allows the compressed form for exactly this trade." },
    { kind: "compressed", block: "lede → one line", px: 15,
      instead: "the same question, shorter, under a headline that already names the trigger",
      why: "room for the contract's SOURCES line" },
    { kind: "compressed", block: "cohort-note → one line", px: 12,
      instead: "\"Conditional on formation in the declared cell — none is a probability for TD Five or for Discrete's contract.\", with the interval named in the table header and spelled out in the cite string",
      why: "room for the NAMED HISTORY relabelling. The conditioning statement and the no-binding statement both survive; only the restated definition of the interval came out." },
    { kind: "compressed", block: "hole 1 — EXACT TRIGGER NOT SCORED", px: 14,
      instead: "\"No vetted Atlas row exists for Cat 4+ at CONUS landfall; none was created here.\"",
      why: "the dropped clause said no count, rate or interval is published for it — which is what NO ROW EXISTS means, and the bridge prints the same refusal in its own status column" },
  ],
};

/** Does this artifact have a recorded entry whose block name matches? Informational only --
 *  no gate consults it to excuse a missing element. */
export function cutRecorded(file, pattern) {
  return (LEGIBILITY_CUTS[file] || []).some((c) => pattern.test(c.block));
}
