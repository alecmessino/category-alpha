/* THE LEGIBILITY CUT REGISTER.
 *
 * The type gate fixes three sizes -- 8.5 pt body and callout, 7.5 pt table, citation and detail,
 * 7 pt footer and legal -- and the instruction that produced it was explicit: cut content before
 * shrinking type, and if a sheet still cannot hold one page, report the conflict rather than
 * resolve it with a smaller point size. At the old scale these artifacts carried roughly twice
 * what a Letter page holds at the gate, so blocks came out. This file is where they are recorded.
 *
 * It is not a changelog. It is a gate input: scripts/check-collateral.mjs requires the cite block
 * and the comparison strip on every artifact, and the only way an artifact may be missing one is
 * to name it here with what it cost and what carries the same content instead. A block can be
 * dropped, but it cannot be dropped silently.
 */
export const LEGIBILITY_CUTS = {
  "A-active-systems-overview.html": [
    { block: "basin plate — four queried points",
      px: 327,
      instead: "the four-system table states each point type and coordinate; B and B2 keep their plates",
      why: "a second view of four points the table already states, on the page with the least room" },
    { block: "commercial tag stack (four boxes)",
      px: 299,
      instead: "the Atlas value-add column of the same table",
      why: "one interpretation per system, printed twice on one sheet" },
    { block: "comparison strip",
      px: 173,
      instead: "the answers rail at the head of this page; B, B1, B2 and D carry the full strip",
      why: "the mandated scan order needed every remaining pixel" },
    { block: "full citation strings in the cohort list",
      px: 105,
      instead: "the replay URL for each of the four cohorts, plus the source manifest",
      why: "four four-line cite strings; the URL reproduces the string and every number behind it" },
  ],
  "B-97L-gulf-event-dossier.html": [
    { block: "answers rail",
      px: 161,
      instead: "the live strip directly below it, the cell rationale beside that, and the commercial box on sheet 2",
      why: "three columns restating what the sheet says at length" },
    { block: "representative members, cut from eight to four",
      px: 113,
      instead: "the four printed members and the replay URL, which names all twelve",
      why: "eight cards at 92 px wide wrap to five lines each" },
    { block: "Replay column in the radius-sensitivity table",
      px: 60,
      instead: "the two variant replay URLs printed under the table",
      why: "a 78-character URL inside a six-column table wraps to four lines per row" },
  ],
  "B1-97L-reinsurance-ils-parametric.html": [
    { block: "answers rail",
      px: 133,
      instead: "the published question in the masthead and the live line beneath it",
      why: "the page opens with the question in full and closes with basis risk and two replay URLs" },
    { block: "member-card row (eight cards)",
      px: 135,
      instead: "the near-miss note, which names Anita, Alicia and Barry with the facts a trigger turns on",
      why: "cards repeat members the near-miss note already names" },
    { block: "the published-question panel, folded into the masthead",
      px: 104,
      instead: "the masthead sub-line, which carries the same sentence",
      why: "a sunken panel for one sentence" },
  ],
  "C-karina-major-hurricane-analog-brief.html": [
    { block: "answers rail",
      px: 130,
      instead: "the live tiles and the SO WHAT box",
      why: "the tiles carry the live status and the box carries the commercial read" },
    { block: "member-card row",
      px: 163,
      instead: "the replay URL, which reopens the cohort and names all fourteen members",
      why: "the live tiles, nineteen contract rows and the refusal table fill the sheet" },
    { block: "comparison strip",
      px: 147,
      instead: "B, B1, B2 and D carry the full strip",
      why: "this page's argument is a live major hurricane beside its own cohort" },
    { block: "coverage-gaps note and the rarity box",
      px: 133,
      instead: "the rarity statement folded into the live-vs-history box; gaps are in the source manifest",
      why: "the refusal table is the load-bearing half of that section and needed the width" },
  ],
  "D-storm-atlas-tear-sheet.html": [
    { block: "colophon — archive scale, as built",
      px: 182,
      instead: "the page footer, which prints every count, the methodology version, the pack hash, the build time and the sources",
      why: "a five-row table restating the footer" },
    { block: "full citation strings in the three worked samples",
      px: 132,
      instead: "each sample's replay URL",
      why: "three four-line cite strings on a one-page tear sheet" },
  ],
};

/** Does this artifact have a recorded cut whose block name matches? */
export function cutRecorded(file, pattern) {
  return (LEGIBILITY_CUTS[file] || []).some((c) => pattern.test(c.block));
}
