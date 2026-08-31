/* THE EVIDENCE DECK — one table where six panel sections used to be.
 *
 * WHAT THIS REPLACES, AND WHY IT IS ONE GRID.
 *
 * The panel published intensity as a ladder, landfall as a nested list of regions, timing as its
 * own section, and pathway and environment as two more. Five shapes, five denominators, five
 * places to learn a new layout -- and an analyst comparing "did these storms get stronger, come
 * ashore more often, or take longer to do it" had to hold three different renderings in their
 * head to answer one question. Here every outcome domain is a ROW GROUP on the same axis, timing
 * is a pair of COLUMNS rather than a section, and status is a column that reads the same way in
 * every row.
 *
 * THE RULE THAT SURVIVES INTACT: the four panel rules of outcome-card.jsx are not relaxed by
 * being tabulated.
 *
 *   1. NO BARE PERCENTAGE. The rate cell never renders without the count cell and the interval
 *      cell in the same row. That is now structural rather than editorial -- they are three
 *      cells of one grid row and cannot be separated by a layout change.
 *   2. A REFUSED RATE PRINTS ITS REFUSAL, never 0.0%. The rate cell holds an em dash and the
 *      STATUS cell holds the word. A refusal never inflates to the rate's size.
 *   3. AN UNSCOREABLE CONTRACT PRINTS ITS OWN COUNTS -- what it has against what it needs.
 *   4. THE QUALIFICATION TRAVELS WITH THE NUMBERS. A status word sits in its own row and is
 *      never hoisted, aggregated, or summarised into a count of qualifications.
 *
 * THE FAILURE MODE THIS FILE IS BUILT AGAINST is a status detaching from its row. In a list of
 * blocks a refusal is physically attached to the thing it refuses; in a grid, every cell is a
 * sibling of every other cell, and a row that renders its status one cell late puts "RATE
 * REFUSED" beside a real percentage belonging to a different contract. So the row is a single
 * element with `display:contents` and every cell is authored inside it -- there is no code path
 * that emits a cell outside its row -- and scripts/check-evidence-deck.mjs asserts, per row, that
 * a refused contract renders no rate anywhere within it.
 *
 * NINE COLUMNS, EIGHT HEADINGS. MED h and P25-P75 are two tracks under one heading, because they
 * are one statement about duration and a reader reads them together.
 */

import React from "react";
import { CATEGORY_ORDER } from "../render/palette.js";
import { regionLabel } from "../engine/cohort-language.js";
import { intensityContractKey, landfallContractKey } from "../engine/calibration.js";
import { REFUSALS } from "./refusal.jsx";
import { refusalKindOf, countsOf } from "./outcome-card.jsx";
import { Chip, CohortSpec } from "./kit.jsx";
import { WhatChanged } from "./condition-strip.jsx";
import { baselineSentence } from "../engine/cohort-language.js";
import { Refusal } from "./refusal.jsx";
import { claimText } from "./kit.jsx";

const CIRCULAR = "CONDITIONED ON -- NOT AN OUTCOME";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

/* ── THE THREE MARKS ──────────────────────────────────────────────────────────────────────
 *
 * Nine treatments become three. This is a PRESENTATION grouping and nothing else: the engine's
 * six refusal kinds keep their identities, their claim ids and their wording, because
 * scripts/test-atlas-refusals.mjs proves every state the surface can print has a row a reader
 * can look it up in, and collapsing the kinds would collapse that correspondence too. What a
 * reader learns is three marks; what the record keeps is six states, and the STATUS word is
 * where the distinction stays visible.
 *
 *   ▤  refused      the sample gate, in all three of the ways it can bind
 *   ⌁  not evaluable  outside the record's era or coverage -- and an unrecorded outcome
 *   ↺  conditioned on  the variable is in the query, so it is not an outcome of it
 */
export const MARKS = {
  REFUSED: { glyph: "▤", label: "REFUSED" },
  NOT_EVALUABLE: { glyph: "⌁", label: "NOT EVALUABLE" },
  CONDITIONED_ON: { glyph: "↺", label: "CONDITIONED ON" },
};

const MARK_OF_KIND = {
  RATE_REFUSED: "REFUSED",
  BASE_RATE_ONLY: "REFUSED",
  OUT_OF_SCOPE: "REFUSED",
  NOT_EVALUABLE: "NOT_EVALUABLE",
  UNKNOWN: "NOT_EVALUABLE",
  CONDITIONED_ON: "CONDITIONED_ON",
};

export function markGroupOf(kind) { return MARK_OF_KIND[kind] || null; }

/* THE STATUS VOCABULARY, CLOSED. A status cell may print one of these and nothing else -- no
   free text, no engine string, no count. It is a label, not a sentence: the sentence lives in
   the row's refusal block where there is room to be correct rather than short.

   SELF_CONTRIBUTION is here rather than in REFUSALS because it is not a refusal. The rate is
   real and the row keeps it; what the word says is that this reader's own selected storm is
   most of the numerator, which is a fact about the evidence and not a reason to withhold it. */
export const STATUS_WORDS = new Set([
  "SUPPORTED", "MIXED", "PARTIAL", "NOT REACHED", "WITHHELD", "NOT JUDGED", "NOT CHECKED",
  "SELF-CONTRIBUTION", "RATE REFUSED", "BASE RATE ONLY", "OUT OF SCOPE", "NOT EVALUABLE",
  "CONDITIONED ON", "— UNKNOWN",
]);

/* WHICH WORD A SCOREABLE ROW CARRIES.
 *
 * Only the comparison can put a word here, and it says exactly what engine/compare.js is
 * permitted to say -- whether the two samples separate. SUPPORTED where the intervals are
 * disjoint, MIXED where they overlap. Neither is a test and neither borrows the vocabulary of
 * one; they are the two permitted statements, shortened to a column width, with the sentence
 * itself still printed in the deck's key.
 *
 * A row with no comparison carries NO word. An empty status cell is the honest rendering of
 * "nothing has been claimed about this row": inventing a word for it would publish a
 * qualification the engine never made. */
function statusOfScoreable(delta) {
  if (!delta || delta.overlap === null || delta.baseRate === null) return null;
  return delta.overlap ? "MIXED" : "SUPPORTED";
}

export const pct1 = (x) => `${(100 * x).toFixed(1)}%`;

/* THE COLUMN LIST. Every consumer of the grid reads this and nothing else.
 *
 * THE LOCKED RESEARCH-TABLE HIERARCHY IS `OUTCOME | n / N | RATE | 95% WILSON`, and the two
 * changes from the deck it replaces are both subtractions.
 *
 * THE WIDE BAR IS GONE. It was a 110px-minimum track carrying the rate as a length, the interval
 * as a band and the archive baseline as a tick -- a second, softer rendering of the two columns
 * beside it, competing with them for the same eye at four times the width. What magnitude
 * encoding survives is a 3px hairline in the row's own class ink, inside the outcome cell: enough
 * to group the ladder by class at a glance, too little to be read as a second answer.
 *
 * THE INTERVAL TAKES A COLUMN OF ITS OWN. It shared the rate's cell so that "89.2% [88.1-90.1%]"
 * read as one statement, which it is -- but the frozen table heads it `95% WILSON`, and a
 * bracketed suffix under a heading that names it is the same value stated twice. Panel rule 1 is
 * unchanged and is what the gates assert: A PUBLISHED RATE IMPLIES A COUNT AND AN INTERVAL ON
 * THE SAME ROW. `.at-dc-int` is still the element that carries it, one track to the right.
 *
 * `timing` false simply removes the two duration tracks. The control that restores them is a
 * line of its own beneath the rows rather than a ninth column: at a 486px measure a track spent
 * on a fold is a track taken from an outcome name. */
/* THE DECK'S TRACKS, AND STATUS IS NO LONGER ONE OF THEM.
 *
 * TWO THINGS CHANGED HERE AND BOTH EXIST TO STOP THE LEDGER'S MEASURE MOVING THE MAP.
 *
 * THE COMPARISON COLUMN IS SUMMONED. ITS WIDTH IS RESERVED. THOSE ARE TWO DIFFERENT THINGS.
 *
 * `vs` is pushed into this list only once a comparison exists, and no `.at-dc-vs` cell and no
 * `VS ARCHIVE` heading is rendered before then -- an empty column under that heading claims a
 * comparison the deck is not making, which check-atlas-acceptance asserts against in as many
 * words. But the WIDTH it will need is held open from the start, as a trailing track that no
 * cell claims (see `deckTemplate`), so the four resting columns land on exactly the same
 * x-positions whether or not a condition exists.
 *
 * WHY BOTH HALVES MATTER. `--at-ledger` used to widen from 33.75vw to 41vw under
 * `:has(.at-dc-vs)` to make room for the sixth column. That came out of `--at-plate-avail`,
 * which bounds the plate: measured at 1440, one condition took the plate from 834x499 to 730x437
 * and the camera from zoom 3.25 to 3.00, three degrees north, with the reader's hands nowhere
 * near the map. Retiring the status track pays for the comparison inside the measure the ledger
 * already had; reserving its width stops the ledger's own columns shifting under the reader when
 * it arrives. scripts/check-atlas-stability.mjs asserts the first, and the deck's own geometry
 * is what makes the second true rather than approximately true.
 *
 * STATUS IS A LINE, NOT A COLUMN, AT EVERY WIDTH. It was already this below 1340 and below 480,
 * for the reason that applies at every width: a 14-term controlled vocabulary set at 9.5px in
 * the rightmost, most-droppable track is the least legible thing on the row whose whole content,
 * when it refuses, IS the qualification. Promoting the narrow treatment is also what pays for
 * the reserved comparison track -- five tracks and four gutters measure 468 against the 486
 * measure, where six and five would measure 556 and scroll the ledger sideways at the canonical
 * width. The CELL is still emitted on every row, the head's included: it is what the DOM gates
 * read, what check-atlas-published-values captures, and what keeps a status inside the row it
 * governs. It is emitted OUTSIDE this list and spans the row -- see DataRow. */
export function columnsOf({ vs, timing }) {
  const cols = ["outcome", "count", "rate", "int"];
  if (vs) cols.push("vs");
  if (timing) cols.push("med", "iqr");
  return cols;
}

/* THE RATE AND ITS INTERVAL, AS ONE STATEMENT IN TWO COLUMNS. Both read the same `refused`
   branch, so there is no arrangement of props that prints a percentage without its bounds or
   bounds without their percentage -- the coupling that mattered was never the shared cell, it
   was the shared condition.

   ONE PERCENT SIGN, AT THE END OF THE INTERVAL, AND NO BRACKETS. "[19.2%-31.2%]" reads as two
   quantities; the interval is one, and this is the form every other surface in the repository
   prints it in. The brackets were the cell's punctuation -- they said "this belongs to the
   number on its left" -- and under a column headed `95% WILSON` they say nothing the heading has
   not. The unit stays: a bound with no unit beside a rate with one is a reader's problem, not a
   designer's economy. */
function RateCell({ cell, refused }) {
  return refused
    ? <span className="at-slot" title="the archive publishes no rate here">—</span>
    : <span className="at-val">{pct1(cell.rate)}</span>;
}

/* THE INTERVAL, IN TYPE, WHICH IS THE CANONICAL RENDERING. A refused row shows one dash: the
   element is still emitted so panel rule 1's selector finds an interval on every row -- it
   simply holds nothing when there is no rate for it to bound. */
function IntervalCell({ cell, refused }) {
  return (
    <span className="at-dc-int">
      {!refused && cell && cell.ci95 ? (
        <span className="at-val">
          {(100 * cell.ci95[0]).toFixed(1)}–{(100 * cell.ci95[1]).toFixed(1)}%
        </span>
      ) : <span className="at-slot" aria-hidden="true">—</span>}
    </span>
  );
}

/* ── THE DECK ─────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object}   props.result          the cohort result -- intensity, landfall, unscoreable,
 *                                         time_to_event, min_sample, landfall_note
 * @param {object}   [props.comparison]    compareResults output, or null in the default state
 * @param {object}   [props.subject]       the selected storm's membership, when one is selected.
 *                                         `{ id, name, reached: {key: bool}, inCohort: bool }`
 * @param {function} [props.onEvidence]    opens a contract's row in the calibration ledger
 * @param {boolean}  [props.foldTiming]    the two duration columns fold behind a control that
 *                                         names them. The data is not dropped; the columns are.
 * @param {object[]} [props.conditions]   conditionsOf(spec) -- the hold-out control's inventory
 * @param {function} [props.onBaseline]   pins a different condition as the one held out
 * @param {object}   [props.whatChanged]  `{ edit }` -- what the last edit was and what it cost
 * @param {string}   [props.citation]     the Cohort Spec, as one citable line
 * @param {string}   [props.citationUrl]  the URL that reopens exactly this cohort
 */
export function EvidenceDeck({ result, comparison, subject, onEvidence, foldTiming = false,
  timingOpen = false, onToggleTiming,
  environment = null, spec = null, pathway = null,
  conditions = [], onBaseline, whatChanged = null, replayNote = null,
  citation = null, citationUrl = null,
  collapseGroups = false, openGroups = null, onToggleGroup }) {
  if (!result) return null;
  const r = result;

  /* AN EMPTY POOL IS NAMED, NOT TABULATED. With no storms every cell would be 0 of 0 and every
     rate a refusal, which renders as a full table of nothing -- and a reader scanning it reads
     structure before content and sees an answer. The state has one thing to say and says it. */
  if (!r.n_cases) return <EmptyPool result={r} spec={spec} />;

  const groups = buildGroups(r, comparison, subject);

  /* THE GRID IS SIZED BY WHAT IS ACTUALLY RENDERED, NOT BY WHAT THE WIDTH ASKED FOR.
   *
   * `data-timing-folded` used to carry the PROP, and the cells were emitted from the prop AND
   * the reader's disclosure state. So opening + TIMING COLUMNS at 1300 put two more cells into
   * every row while the grid still had seven tracks, and each row's last cell wrapped into an
   * implicit eighth row -- a STATUS word one line below the row it governs, which is the single
   * failure the whole `display:contents` construction exists to make unreachable. The attribute
   * is the EFFECTIVE state now, and the column list below is what both the template and the
   * cells are built from, so the two cannot disagree at all. */
  const timingOn = !foldTiming || timingOpen;

  /* THE TWO CONDITIONAL COLUMNS, DECIDED FROM THE DATA RATHER THAN FROM THE WIDTH.
   *
   * VS ARCHIVE needs something to compare against: a comparison, or a selected storm whose
   * verdicts the column answers instead. With neither, every cell in it read "is the archive".
   *
   * STATUS needs a status. Panel rule 4 is not negotiable -- a refused row says so in its own
   * status cell -- so this is computed by ASKING EVERY ROW what word it would print, with the
   * same three expressions the row itself uses, before anything is rendered. One refusal
   * anywhere brings the column back for the whole deck. */
  const showVs = !!comparison || !!subject;
  const cols = columnsOf({ vs: showVs, timing: timingOn });
  const shape = { cols, subject, onEvidence };
  /* THE RESERVATION IS A TRACK IN THE TEMPLATE THAT NO CELL IS EMITTED FOR, and it is DECLARED
     rather than inferred. `data-reserved-tracks` is what lets check-responsive-matrix keep the
     rule it has always enforced -- every track is claimed by exactly one cell -- while allowing
     the one track that is deliberately unclaimed. A cell that genuinely goes missing still fails
     it, because the offset is a number the deck publishes rather than a tolerance the gate grants.
     It is a trailing track, so the full-width blocks that span `1/-1` -- every refusal sentence,
     the preamble, the limits -- keep the whole measure and are unaffected either way. */
  const reserved = showVs ? 0 : 1;
  const deckTemplate = cols.map((k) => `var(--at-col-${k})`)
    .concat(reserved ? ["var(--at-col-vs)"] : []).join(" ");

  /* WHICH REFUSAL SENTENCES REPEAT, WHICH IS WHAT THE BOUND IS ACTUALLY FOR.
   *
   * The specification bounds refusal copy to eighteen words with the full argument behind SEE
   * THE EVIDENCE. Applied literally to every row it breaks a rule that outranks it: a refused
   * rate prints THE ARCHIVE'S OWN REASON, VERBATIM -- panel rule 2 -- and truncating an OUT OF
   * SCOPE reason at eighteen words cuts it precisely before "outside the population this query
   * draws from", the clause that distinguishes "these events do not exist" from "these events
   * exist somewhere you cannot reach". Methodology 1.1.0 split BASE RATE ONLY in two to make
   * exactly that distinction; a bound that erases it would undo the split on screen.
   *
   * The repetition the bound exists to prevent is real, though: below the sample gate every
   * contract refuses on the SAME sentence, twelve times over. The deck answers that below the
   * matrix now rather than inside it -- one block per governing refusal, each distinct sentence
   * printed once with the contracts it speaks for -- so no row prints a sentence at all and
   * there is nothing left in the table for a truncation bound to clip. See GroupedLimits. */

  /* THE TEMPLATE IS COMPOSED FROM THE SAME LIST THE CELLS ARE, so a column that is not emitted
     has no track and a track with no column cannot exist. The track SIZES stay in atlas.css as
     --at-col-* custom properties: this decides which columns there ARE, the stylesheet decides
     how WIDE each one is, and neither can silently become the other. */
  const gridStyle = { "--at-deck-cols": deckTemplate };

  return (
    /* THE LIMITS ARE A SIBLING OF THE GRID, NOT A CELL IN IT, AND THAT IS A POSITIONING FACT
       RATHER THAN A TASTE ONE. They are pinned to the ledger's foot with `position:sticky`, and a
       sticky GRID ITEM is confined to its own grid area -- one row tall -- so it has nowhere to
       stick to and simply sits where it was placed. Measured: the block was on screen before a
       scroll and gone after one, which is the exact opposite of what pinning is for. Outside the
       grid its containing block is the scrolling column, and it stays against the foot of it. */
    <>
    <div className="at-deck" data-evidence-deck style={gridStyle}
      data-reserved-tracks={reserved ? String(reserved) : undefined}
      data-deck-mode={showVs ? "cohort" : "archive"}
      data-timing-folded={timingOn ? undefined : ""}>
      <DeckPreamble result={r} spec={spec} />
      <DeckHead shape={shape} />
      {groups.map((g) => {
        /* INTENSITY IS RESIDENT AT EVERY WIDTH. It is the ladder the archive is built on and the
           one group a reader arrives to read; the others give up their rows first, and give them
           up to a control that names how many it holds rather than to silence. */
        const collapsed = collapseGroups && g.key !== "intensity"
          && !(openGroups && openGroups[g.key]);
        return (
          <React.Fragment key={g.key}>
            <GroupRow group={g} shape={shape} collapsed={collapsed}
              onExpand={onToggleGroup ? () => onToggleGroup(g.key) : undefined} />
            {/* THE DENOMINATOR'S OWN QUALIFIER, ON A LINE OF ITS OWN.
                It used to ride in the INTERVAL cell and move to a full-width line only when that
                column folded, so the same sentence had two positions depending on the monitor.
                The interval no longer has a cell of its own, and this was always the better of
                the two: it is a sentence about what these rates are rates OF, not a value in a
                column, and a strip gives up whole items rather than half a word. */}
            {g.note ? (
              <div className="at-deck-groupnote" data-group-note={g.key}>{g.note}</div>
            ) : null}
            {collapsed ? null : g.rows.map((row) => (
              <DataRow key={row.key} row={row} shape={shape} />
            ))}
            {collapsed ? null : <GroupQualification which={g.key} result={r} />}
          </React.Fragment>
        );
      })}

      <TimingFold open={timingOn} onToggle={onToggleTiming} />
      <GroupedLimits groups={groups} onEvidence={onEvidence} />



      {/* THE TABLE'S FOOT. What the last edit did, and what every delta above is measured
          against. Both belong here rather than above the rows: a reader arrives at the deck to
          read the ladder, and a block between the question and the evidence is a block they
          scroll past. */}
      <DeckFoot comparison={comparison} conditions={conditions} onBaseline={onBaseline}
        whatChanged={whatChanged} groups={groups}
        citation={citation} citationUrl={citationUrl} />

      {/* THE ENVIRONMENT, AS A DISCLOSURE RATHER THAN A SECTION.
          It is a LENS and not a filter -- under half this archive carries any environment and
          none of it predates 1982 -- so it qualifies the cohort without narrowing it, and it
          belongs below the outcomes rather than beside them. Rendered through the existing
          EnvLens so its coverage rules, its era-boundary warning and its refusal are the ones
          already proven by test-atlas-env; this decides only where it sits.

          OPEN BY DEFAULT, WHICH IS THE POINT OF THE DISCLOSURE HERE. Collapsing it would put a
          coverage statement -- "1,430 of 3,885 evaluable" -- behind a click, and a reader who
          never opens it would read every environment figure as though it covered the cohort. A
          disclosure that can be CLOSED is a way to reclaim space; one that starts closed is a
          way to hide a qualification. */}
      <RatesAssume />

      {/* THE PATHWAY, AS A DISCLOSURE. It is a COUNT of distinct storms through each cell and
          not a probability of anything, which is the single most misreadable surface here -- a
          shaded map over an ocean is read as a forecast cone unless it says otherwise, in as
          many words, next to itself. */}
      {pathway ? (
        <details className="at-deck-env" data-deck-pathway open>
          <summary>HISTORICAL PATHWAY FREQUENCY</summary>
          <div className="at-env-body">
            <p className="at-foot-line">
              <strong>THIS IS NOT A FORECAST.</strong> {claimText("atlas.pathway")}
            </p>
          </div>
        </details>
      ) : null}

      {/* THE REPLAY'S DISCLOSURE, AND IT IS OPEN. The clock skips off-season stretches, which
          is a distortion of pace a reader has to be told about BEFORE it happens rather than
          when it flashes past on a 40px transport. Present only in replay mode, because in
          explore mode there is no clock to distort. */}
      {replayNote ? (
        <details className="at-deck-env" data-deck-replay open>
          <summary>THE RECORD, IN THE ORDER IT HAPPENED — what the clock does to time</summary>
          <div className="at-env-body">{replayNote}</div>
        </details>
      ) : null}

      {environment ? (
        <details className="at-deck-env" data-deck-environment open>
          <summary>THE ENVIRONMENT THEY FORMED IN — a lens, not a filter</summary>
          <div className="at-env-body">{environment}</div>
        </details>
      ) : null}
    </div>

    {/* THE LIMITS, PINNED AT THE LEDGER'S FOOT UNDER ONE INK RULE.
       *
       * WHY PINNED RATHER THAN PLACED. These were under the INTENSITY group, which was the right
       * answer in a deck that ran the width of the screen: at the foot they sat below eighteen
       * rows, and a qualification that needs scrolling to reach is, for a reader who does not
       * scroll, absent. In a 486px column that scrolls, `position:sticky` gives the property
       * both placements were reaching for -- they are on screen at EVERY scroll position, and
       * they are still below every rate they qualify, so the archive's own sentence ("Intensity
       * rates above are therefore biased LOW") stays true about the page.
       *
       * THE ARCHIVE'S OWN SENTENCES, VERBATIM, WHICH IS WHERE THE FROZEN FRAME AND THE ENGINE
       * DISAGREE AND THE ENGINE WINS. 5c sets each limit as a 14px mono count against an 11.5px
       * serif clause -- `269 · no recorded outcome` -- and that typesetting would be right: a
       * limit is a finding of the same kind and weight as a rate, and setting it smaller would
       * be an editorial claim the archive never made. But the counts are not separable here.
       * The archive publishes these as whole measured sentences with their figures inside them
       * ("1704 of 3885 storms in this cohort are from before 1971, when East Pacific intensities
       * were estimated without geostationary satellites..."), and pulling a numeral out of one
       * to set it larger means parsing a published string and rewording what is left. Rewording
       * a finding is how a finding stops being one. So the block is pinned, ruled and given the
       * frame's prose step, and its counts stay inside the sentences that measured them. */}
    <Limits result={r} />
    </>
  );
}

/* WHICH WORD A ROW WOULD PRINT IN STATUS, computed in one place because two things read it:
   the row that renders it, and the deck deciding whether the column exists at all. Two
   expressions that had to agree would eventually not, and the day they disagreed a refusal
   would lose its word. */
/* THE THREE TESTS, ONCE. Every reading of "is this row refused" on this surface -- the deck's
   own cells, the answer ladder beside the plate, the grouped limits below the matrix -- goes
   through this, so a row cannot be refused in one place and scoreable in another. */
export function isRefusedRow(row) {
  const { cell, unscoreable } = row;
  return !!unscoreable || !!(cell && (cell.status === CIRCULAR || cell.rate === null));
}

export function statusWordOf(row) {
  const { delta, selfContribution } = row;
  const refused = isRefusedRow(row);
  if (refused) return REFUSALS[refusalKindOfRow(row)].title;
  if (selfContribution) return "SELF-CONTRIBUTION";
  return statusOfScoreable(delta);
}

/* The refusal kind, from the same three tests, for the same reason. */
export function refusalKindOfRow(row) {
  const { cell, unscoreable } = row;
  if (unscoreable) return refusalKindOf(unscoreable);
  if (cell && cell.status === CIRCULAR) return "CONDITIONED_ON";
  if (cell && cell.rate === null) return "RATE_REFUSED";
  return null;
}

/* THE COLUMN HEADS. Uppercase at the label token, which is the only size uppercase is allowed
   at besides the stamps. The duration heading is two tracks, because MED h and P25-P75 are one
   statement about duration and a reader reads them together. */
/* ONE CONTROL, NAMING EVERYTHING IT HOLDS. The fold names its contents -- + TIMING COLUMNS --
   and opening it restores both duration tracks. Only TIMING is ever behind it: the interval is
   not a column any more and so has nothing to restore, and a control offering to bring back
   something that never left is a control that lies about the state. */
function DeckHead({ shape }) {
  const { cols, subject } = shape;
  const head = {
    outcome: <span className="at-dc at-dc-outcome" key="outcome">OUTCOME</span>,
    count: <span className="at-dc at-dc-count" key="count">n / N</span>,
    rate: <span className="at-dc at-dc-rate" key="rate">RATE</span>,
    int: <span className="at-dc at-dc-interval" key="int">95% WILSON</span>,
    vs: (
      <span className="at-dc at-dc-vs" key="vs">{subject ? "SUBJECT" : "VS ARCHIVE"}</span>
    ),
    status: <span className="at-dc at-dc-status" key="status">STATUS</span>,
    med: <span className="at-dc at-dc-med" key="med">MED h</span>,
    iqr: <span className="at-dc at-dc-iqr" key="iqr">P25–P75</span>,
  };
  /* THE STATUS HEAD IS EMITTED AND HIDDEN RATHER THAN DROPPED, and the distinction is the deck's
     own: `visibility:hidden` still occupies layout, so the cell stays in the shared
     auto-placement flow, while `display:none` would take one item out of one row and walk every
     column after it out of alignment. It is also what `hasStatusColumn` reads in three gates. */
  return (
    <div className="at-deck-row at-deck-head" role="row">
      {cols.map((k) => head[k])}
      {head.status}
    </div>
  );
}

/* THE FOLD, ON A LINE OF ITS OWN BENEATH THE ROWS.
 *
 * It was a ninth column in the head, which at a 486px measure is a track spent on a control
 * rather than on an outcome name. On its own full-width line it can say what it holds in words
 * instead of in four characters, and it sits where the reader who has finished the ladder is
 * looking rather than in the row they read first.
 *
 * ONE CONTROL, NAMING EVERYTHING IT HOLDS. Only TIMING is ever behind it: the interval is a
 * column at every width and so has nothing to restore, and a control offering to bring back
 * something that never left is a control that lies about the state. */
function TimingFold({ open, onToggle }) {
  if (!onToggle) return null;
  return (
    <div className="at-deck-foldline">
      <button type="button" className="at-fold-btn" data-timing-fold onClick={onToggle}
        title="the median and interquartile hours to each outcome, for every row">
        {open ? "− TIMING COLUMNS" : "+ TIMING COLUMNS"}
      </button>
      <span className="at-deck-foldnote">
        median and interquartile hours to each outcome
      </span>
    </div>
  );
}

/* A GROUP ROW CARRIES THE DENOMINATOR ONCE. Every row beneath it shares that denominator, so
   repeating it per row is thirteen copies of one fact -- and the rule is that no percent appears
   without its count, not that every cell restates the population. */
function GroupRow({ group, shape, collapsed, onExpand }) {
  const { cols } = shape;
  const cell = {
    outcome: (
      <span className="at-dc at-dc-outcome" key="outcome">
        {group.label}
        {/* THE ROWS ARE FOLDED, NOT DROPPED, AND THE CONTROL COUNTS THEM. A group row that
            simply stopped having rows beneath it would read as a group with nothing in it --
            which is the one thing a refusal-carrying table must never look like. */}
        {collapsed ? (
          <button type="button" className="at-group-fold" data-group-fold={group.key}
            onClick={onExpand}
            title={`${group.rows.length} contracts in this group, folded at this width`}>
            + {group.rows.length}
          </button>
        ) : null}
      </span>
    ),
    count: (
      <span className="at-dc at-dc-count" key="count">
        {group.denom !== null ? <>of {group.denom.toLocaleString()}</> : null}
      </span>
    ),
    rate: <span className="at-dc at-dc-rate" key="rate" />,
    int: <span className="at-dc at-dc-interval" key="int" />,
    vs: <span className="at-dc at-dc-vs" key="vs" />,
    status: <span className="at-dc at-dc-status" key="status" />,
    med: <span className="at-dc at-dc-med" key="med" />,
    iqr: <span className="at-dc at-dc-iqr" key="iqr" />,
  };
  return (
    <div className="at-deck-row at-deck-group" data-deck-group={group.label} role="row">
      {cols.map((k) => cell[k])}
      {cell.status}
    </div>
  );
}

/* ONE CONTRACT.
 *
 * EVERY CELL IS AUTHORED INSIDE THIS ELEMENT. The row is `display:contents` so the cells sit on
 * the parent grid, but they are emitted here, together, from one map over one column list --
 * which is what makes "a status detached from its row" unreachable rather than merely unlikely.
 * A refused row takes the refused branch for the rate cell AND the status cell in the same
 * expression; there is no arrangement of props that produces one without the other. */
function DataRow({ row, shape }) {
  const { cols, subject, onEvidence } = shape;
  const { label, tone, cell, unscoreable, delta, timing, contractKey, selfContribution } = row;
  const refused = !!unscoreable || (cell && (cell.status === CIRCULAR || cell.rate === null));
  const kind = refusalKindOfRow(row);
  const mark = kind ? markGroupOf(kind) : null;
  const status = statusWordOf(row);

  const out = {
    /* THE CLASS HAIRLINE LIVES HERE, WHICH IS THE WHOLE OF WHAT IS LEFT OF THE BAR.
       Three pixels of the row's own class ink, four on a major -- the same 1.35 extra stroke the
       plate gives cat3 and above, for the same reason: the cat2/cat3 pair decides "major
       hurricane" and is the one pair a reader must never misread. It encodes CLASS, not
       magnitude, and it carries no number, so nothing about it can be read as a second answer
       to the rate two cells along. The ink is the PAPER derivation of the cartographic ramp --
       verified in check-atlas-adherence to clear 3:1 on every paper ground, to separate at 1px
       from its neighbours and to darken monotonically so the ordering survives in monochrome. */
    outcome: (
      <span className="at-dc at-dc-outcome" key="outcome">
        <i className="at-dc-tick" data-bar-class={tone} aria-hidden="true" />
        {mark ? (
          <span className="at-mark" data-mark={mark} aria-hidden="true">{MARKS[mark].glyph}</span>
        ) : <span className="at-mark" aria-hidden="true" />}
        {/* THE NAME CARRIES ITSELF AS A TITLE. At a 486px measure the longest region contracts
            -- "Central America · ≥64 KT" -- ellipsise, and an ellipsis is an acceptable answer to
            a narrow column ONLY when the whole string is one hover away. */}
        <span className="at-dc-name" title={label}>{label}</span>
      </span>
    ),
    /* RULE 1 AND RULE 2. The rate publishes or it does not, and a refusal never inflates to the
       rate's size: the slot holds an em dash and the word lives in STATUS. The dash is CONTENT,
       not decoration -- it means "the archive has no value here" -- so it is held to the same
       contrast bar as the value it replaces. */
    rate: (
      <span className="at-dc at-dc-rate" key="rate">
        <RateCell cell={cell} refused={refused} />
      </span>
    ),
    int: (
      <span className="at-dc at-dc-interval" key="int">
        <IntervalCell cell={cell} refused={refused} />
      </span>
    ),
    /* RULE 1 AND RULE 3, AND THE DENOMINATOR TRAVELS WITH THE NUMERATOR NOW.
       The count published `3,224` and the denominator lived once, in the group heading -- which
       is correct until a reader scrolls the group heading off the top of a 486px column and is
       left with a numerator and no idea what it is out of. `n / N` states the fraction on the row
       that publishes it. Neither figure is new: N is the same `n_storms` the group heading
       prints, from the same cell, and check-atlas-published-values fails if a count cell ever
       carries a number no group publishes as a denominator.

       An unscoreable contract states what it has against what it needs, which is the finding
       rather than a consolation. */
    count: (
      <span className="at-dc at-dc-count" key="count">
        {cell ? (
          <span className="at-val">
            {cell.count.toLocaleString()}
            {cell.n_storms ? <> / {cell.n_storms.toLocaleString()}</> : null}
          </span>
        ) : null}
        {/* THE SCOPE COUNTS ARE NOT IN THIS CELL ANY MORE -- see LimitBlock. They are one
            measured sentence, `8 in the NA basin since 2022 · 181 archive-wide · 10 needed`,
            and an 84px numeric track cannot hold it: set `nowrap` it ran 350px across the
            ledger and painted over three other rows' outcome names; set to wrap it was five
            lines of prose in the column that exists to carry `n / N`. It belongs with the
            refusal it qualifies, which is where a reader is already reading why this row has
            no rate. The string itself is unchanged. */}
      </span>
    ),
    /* VS ARCHIVE, OR THE SUBJECT. With no storm selected the column compares this cohort with
       the archive; with one selected it answers a different question -- did THIS storm reach
       this contract -- and the heading changes with it. A storm the archive holds no verdict
       for gets the slot dash rather than a NO it never earned.

       CONDITIONED ON WINS OVER THE SUBJECT, AND THIS IS THE FIFTH RULE ENFORCED IN A CELL.
       A variable in the query is not an outcome of it: every storm in this cohort reached this
       contract BY CONSTRUCTION, so the selected storm did too, and printing REACHED would be
       true, vacuous, and read as evidence. Other refusals keep their subject verdict: below the
       sample gate the archive still knows what THIS storm did, and that is a fact about the
       storm rather than an artefact of the question. */
    vs: (
      <span className="at-dc at-dc-vs" key="vs">
        {kind === "CONDITIONED_ON"
          ? <span className="at-slot"
              title="this variable is in the query, so it is not an outcome of it">—</span>
          : subject ? <SubjectCell row={row} subject={subject} />
            : <VsArchive delta={delta} refused={refused} />}
      </span>
    ),
    /* ONE INK, NEVER COLOURED, NEVER AGGREGATED, NEVER A SCORE. The status is a word about THIS
       row and it is rendered inside this row's element -- see the header comment. */
    status: (
      <span className="at-dc at-dc-status" key="status" data-status={status || undefined}
        title={status || undefined}>
        {status || null}
      </span>
    ),
    med: (
      <span className="at-dc at-dc-med" key="med">
        {timing && timing.n ? <span className="at-val">{Math.round(timing.median)}</span>
          : <span className="at-slot">—</span>}
      </span>
    ),
    iqr: (
      <span className="at-dc at-dc-iqr" key="iqr">
        {timing && timing.n ? (
          <span className="at-val">{Math.round(timing.p25)}–{Math.round(timing.p75)}</span>
        ) : <span className="at-slot">—</span>}
      </span>
    ),
  };

  return (
    <div className={"at-deck-row at-deck-data" + (selfContribution ? " at-deck-self" : "")}
      data-outcome={label} data-contract-row={contractKey || undefined}
      /* THE ROW STILL DECLARES THAT IT IS REFUSED, AND WHICH REFUSAL GOVERNS IT. It used to
         declare that by CONTAINING a `data-refusal` block, so removing the prose from the row
         removed the fact with it -- and the state audit, which reads refusal coverage off the
         rows, went quiet on a surface that refuses exactly as much as it did. `data-refusal-state`
         is the state, not the explanation: the explanation is one block below the matrix, and
         `data-refusal` stays reserved for it, because check-atlas-dom holds everything carrying
         that attribute to naming the way out. Same hook the answer ladder's rows use. */
      data-refusal-state={refused ? (kind || "") : undefined}
      data-self-contribution={selfContribution ? "" : undefined} role="row">

      {cols.map((k) => out[k])}
      {/* THE STATUS, ON THE LINE BELOW ITS OWN ROW AND INSIDE ITS OWN ROW ELEMENT. It is emitted
          after the tracks rather than among them because it no longer HAS a track: it spans every
          one of them, which is the single exception check-responsive-matrix draws for a cell
          leaving the line -- "it has not fallen off the end of a line it was meant to be on, it
          has been GIVEN the whole next line". Empty on a row with nothing to qualify, at zero
          height, so a resting deck reads exactly as it did. */}
      {out.status}

      {/* THE ARGUMENT, BOUNDED. A statement of at most eighteen words carrying the count that
          produced it; the full reason is behind SEE THE EVIDENCE. It spans every column because
          it qualifies the whole row, and it is the only element here that may carry
          `data-refusal` -- the DOM gate requires everything with that attribute to name the way
          out, which a two-word status cell cannot do. */}
      {/* A HOISTED ROW EMITS NO LINE AT ALL, rather than an emptied one. The row keeps its mark,
          its status word and its rate slot; the sentence, the counts and the way out are stated
          once beneath the group. Blanking only the REASON and keeping the remedy -- which is
          what this did -- left the row holding a way out of a refusal it no longer stated, and
          measured on a two-storm cohort that was eleven lines whose entire content was "YOU CAN
          CHANGE THIS. A wider cohort would carry a rate…". It also put `data-refusal` on an
          element naming an exit and nothing to exit FROM, which is the one thing that attribute
          must never mean. */}
      {/* AND NO ROW CARRIES ITS OWN SENTENCE ANY MORE. Hoisting stated a shared line once per
          GROUP, which was the right answer while the deck was a scrolling column: it took twelve
          identical paragraphs down to one. It still left every UNSHARED refusal printing its own
          block between two rows of a table -- six of them on a conditioned East Pacific cohort,
          each four lines of prose in the middle of the matrix -- and a reader scanning rates read
          them as the answer's texture. Under the composition the matrix is a table and the
          limits are a section beneath it: one block per governing refusal, every distinct
          sentence stated once with the contracts that share it, and the remedy said once rather
          than once per row. See GroupedLimits. */}
      {selfContribution ? <SelfContribution row={row} subject={subject} /> : null}
    </div>
  );
}

/* THE DEFAULT STATE SAYS SO IN WORDS. With no condition set this cohort IS the archive, and a
   column of "+0.0 pp" against itself is a comparison that reads as a finding. */
function VsArchive({ delta, refused }) {
  if (refused) return <span className="at-slot">—</span>;
  if (!delta) return null;
  if (delta.baseRate === null) {
    return <span className="at-isarchive">is the archive</span>;
  }
  const mag = Math.abs(delta.deltaPp);
  const fig = mag < 0.05 ? "<0.1" : `${delta.deltaPp > 0 ? "+" : "−"}${mag.toFixed(1)}`;
  return <span className="at-val">{fig} pp</span>;
}

/* REACHED / NO / SLOT. The three states are not two: a storm the archive holds no verdict for is
   not a storm that failed the contract, and printing NO for it would publish a judgement the
   record does not contain. */
function SubjectCell({ row, subject }) {
  const v = subjectReached(subject, row.contractKey);
  if (row.selfContribution) return <span className="at-reached">IS THE COUNT</span>;
  if (v === true) return <span className="at-reached">REACHED</span>;
  if (v === false) return <span className="at-notreached">NO</span>;
  return <span className="at-slot" title="the archive records no verdict for this storm here">—</span>;
}

/* THE WAY OUT, IN THE REFUSAL REGISTRY'S OWN WORDS, WHEREVER IT IS PRINTED. A reader who learns
   "A LIMIT OF THE RECORD" on a row must not meet a paraphrase of it under the group, so the row
   line and the hoisted line render THIS, rather than two copies of one branch. Two copies is
   exactly how the hoisted line came to print the RATE_REFUSED remedy over a CONDITIONED_ON
   reason: it had been written out a second time, with the kind hard-coded. */
function RemedyLine({ kind }) {
  const r = REFUSALS[kind];
  if (!r) return null;
  return (
    <span className="at-say-remedy">
      {r.resolvable === "no" ? <><strong>A LIMIT OF THE RECORD.</strong> {r.irreducible}</>
        : <><strong>{r.resolvable === "partly" ? "PARTLY IN YOUR HANDS." : "YOU CAN CHANGE THIS."}</strong>{" "}
          {r.remedyShort || r.remedy}</>}
    </span>
  );
}


/* ── LIMITS & EXCLUSIONS: ONE BLOCK PER GOVERNING REFUSAL ──────────────────────────────────
 *
 * WHAT THIS REPLACES. A refusal used to be stated on the row it governed -- the archive's own
 * sentence, its counts and its way out, between two rows of the table -- with identical lines
 * hoisted to one per group. Measured on a conditioned East Pacific cohort: six OUT OF SCOPE
 * blocks, each four lines, interleaved through a sixteen-row matrix, and the reader scanning
 * rates read the prose as the table's texture rather than as its qualification.
 *
 * WHAT IS PRESERVED, EXACTLY. Every row keeps its mark, its state word and its counts -- panel
 * rule 4 is untouched, and a refused row still says so where it is. What moves is the SENTENCE.
 * Each governing refusal gets one block; inside it, every DISTINCT sentence the engine wrote is
 * printed once, verbatim, with the contracts that share it named beside it and their own counts
 * with them. Nothing is summarised, nothing is truncated and no reason speaks for a row it does
 * not describe -- which is the same rule the group-level hoist enforced, applied across the
 * matrix instead of inside one group.
 *
 * THE WAY OUT IS SAID ONCE PER KIND, and that is the whole economy: the remedy is a fact about
 * the REFUSAL, not about the contract, so twelve rows sharing a kind shared twelve copies of it.
 */
function GroupedLimits({ groups, onEvidence }) {
  const byKind = new Map();
  for (const g of groups) {
    for (const row of g.rows) {
      const kind = refusalKindOfRow(row);
      if (!kind) continue;
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind).push(row);
    }
  }
  if (!byKind.size) return null;
  return (
    <section className="at-deck-limitgroups" data-limit-groups>
      <div className="at-limitgroups-head">
        <span className="at-foot-k">LIMITS &amp; EXCLUSIONS</span>
        <span className="at-limitgroups-note">
          one explanation per governing refusal — every row above carries its own state and count
        </span>
      </div>
      {[...byKind].map(([kind, rows]) => (
        <LimitBlock key={kind} kind={kind} rows={rows} onEvidence={onEvidence} />
      ))}
    </section>
  );
}

function LimitBlock({ kind, rows, onEvidence }) {
  const r = REFUSALS[kind];
  /* DISTINCT SENTENCES, IN THE ORDER THE ROWS APPEAR, each with the contracts it speaks for.
   *
   * ONE LINE REPLACES N, SO THE KEY IS EVERYTHING THOSE N LINES WOULD HAVE PRINTED -- and this
   * line prints three things, of which the block already fixes one:
   *
   *   kind    which way out there is. It is the BLOCK, so every line inside one is already
   *           agreed on it. Keyed on the sentence alone and grouped across kinds, the shared
   *           line hard-coded RATE_REFUSED -- so ?i=cat4, where five contracts refuse
   *           CONDITIONED_ON because the cohort was defined by the outcome, was told "a wider
   *           cohort would carry a rate: drop a condition, widen the radius, or extend the
   *           seasons". None of those three moves a circular contract.
   *   counts  the scope/archive/required triple, published on this line and not derivable from
   *           the sentence. A BASE RATE ONLY reason names only the ARCHIVE-WIDE total, so two
   *           regions with the same total and different in-scope counts write the same sentence
   *           and publish different numbers. Not reachable in today's archive -- hawaii:hurricane
   *           is the only contract under the archive-wide gate -- which is exactly why it belongs
   *           in the key rather than in a comment about why it cannot happen yet.
   *   reason  the sentence itself, which is what grouping was always about.
   *
   * Joined on NUL, the one character neither can contain, so no two distinct pairs collide. */
  const byReason = new Map();
  for (const row of rows) {
    const counts = countsOf(row.unscoreable) || "";
    const reason = reasonOf(row) || "";
    const key = `${counts}\u0000${reason}`;
    if (!byReason.has(key)) byReason.set(key, { counts, reason, labels: [] });
    byReason.get(key).labels.push(row.label);
  }
  const first = rows.find((row) => row.contractKey);
  return (
    <div className="at-limit" data-refusal={r.kind} data-limit-kind={r.kind}>
      <div className="at-limit-head">
        <span className="at-mark" data-mark={markGroupOf(kind)} aria-hidden="true">
          {MARKS[markGroupOf(kind)].glyph}
        </span>
        <span className="at-limit-title">{r.title}</span>
        <span className="at-limit-count">
          {rows.length} CONTRACT{rows.length === 1 ? "" : "S"}
        </span>
      </div>
      {[...byReason.values()].map((b, i) => (
        /* THE LABELS ARE PUBLISHED TWICE: joined for the reader, enumerated for a machine.
           A contract label can itself contain the separator -- `Hawaii · ≥64 KT` is one
           contract, not two -- so anything that needs the list back has to read the array
           rather than split the rendered line. check-atlas-published-values did split it,
           and reported the Hawaii hurricane contract as unrefused and a phantom `Hawaii`
           as refused. */
        <div className="at-limit-line" key={i} data-contracts={JSON.stringify(b.labels)}>
          <span className="at-limit-which">{b.labels.join(" · ")}</span>
          {b.counts ? (
            <span className="at-need" title="events in scope · archive-wide · required">
              {b.counts}
            </span>
          ) : null}
          <span className="at-say-text">{b.reason}</span>
        </div>
      ))}
      <RemedyLine kind={kind} />
      {onEvidence && first ? (
        <button type="button" className="at-say-link" data-evidence-link
          onClick={() => onEvidence(first.contractKey)}>SEE THE EVIDENCE →</button>
      ) : null}
    </div>
  );
}


/* WHICH SENTENCE A ROW WOULD PRINT, so repetition can be counted before anything is rendered. */
function reasonOf(row) {
  if (row.unscoreable) return row.unscoreable.reason || null;
  const c = row.cell;
  if (!c) return null;
  if (c.status === CIRCULAR) return c.reason || null;
  return c.rate === null ? (c.refused_reason || null) : null;
}


/* THE BOUND IS ON THE STATEMENT, NOT ON THE ARGUMENT. Eighteen words is what fits in the deck
   without pushing the next row off the screen; the whole reason is one click away and is never
   rewritten. Truncation stops at a word and says it has, so a reader is never left believing
   they have read a complete sentence they have not. */
export function bound(text, max = 18) {
  if (!text) return null;
  const words = String(text).trim().split(/\s+/);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ") + "…";
}

/* ISSUE 15 — SELF-CONTRIBUTION, AS A DISCLOSURE AND NOTHING MORE.
 *
 * The row keeps its numerator and its denominator, the SUBJECT column reads IS THE COUNT, the
 * STATUS column reads SELF-CONTRIBUTION, and the row takes the one fill this deck permits. What
 * does NOT happen: no exclusion, no independence claim, no new engine, no threshold change. The
 * reader is told that most of this numerator is the storm they are looking at, and left to
 * decide what that is worth. */
function SelfContribution({ row, subject }) {
  const who = subject && subject.name ? subject.name : "The selected storm";
  return (
    <div className="at-deck-say" data-self-contribution-note>
      <span className="at-say-text">
        {who} is the whole of this numerator — {row.cell.count.toLocaleString()} of{" "}
        {row.cell.n_storms.toLocaleString()}, below the sample gate.
      </span>
      <span className="at-say-remedy">
        The rate stands as the archive computed it. Nothing is excluded and no independence is claimed.
      </span>
    </div>
  );
}



/* ── WHAT THE READER NEEDS BEFORE THE FIRST RATE ─────────────────────────────────────────
 *
 * THE COUNT AND THE GATE ARE ONE FACT -- how much evidence is there, and is it enough -- so they
 * read as one line. The effective sample size keeps its own, because it carries a statement
 * neither of the others makes: every storm in a cohort counts once, membership being decided by
 * hard conditions rather than by a weight, so the ESS IS the count and no storm is standing in
 * for another. A distance-weighted analog pool does not have that property.
 *
 * AND THE ASSUMPTIONS TRAVEL WITH THE NUMBERS. This is the fourth panel rule, and it is the one
 * a table makes easiest to lose: the rates are GENESIS-CONDITIONED, landfall does not decompose
 * as a product of marginals, and a variable used to define a cohort is not reported as an
 * outcome of it. None of that is standing methodology a reader can be assumed to carry -- it is
 * a statement about how the numbers on THIS screen were computed.
 *
 * EVERY SENTENCE COMES FROM docs/app/claims.js, through claimText, and none is written here. The
 * registry is the one authorship site for a capability claim; a second copy in a component is
 * exactly the drift the claim audit exists to catch. */
function DeckPreamble({ result, spec }) {
  const r = result;
  return (
    <div className="at-deck-pre" data-deck-preamble>
      {/* THE COHORT COUNT AND THE SAMPLE GATE ARE NOT HERE ANY MORE, AND THAT IS THE POINT.
       *
       * `3,885` used to be printed three times on one screen: a 22px numeral beside the question,
       * a 26px numeral here, and again in the plate's head band. Three renderings of one number
       * make a reader look for the difference between them, and the frozen frame gives cohort
       * identity ONE primary home -- the 11.5px line directly under the question, where it is the
       * denominator of everything below it. `SUFFICIENT · 3885 ≥ 10` went with it, to the same
       * line, in the same words.
       *
       * WHAT STAYED IS WHAT IS NOT A REPEAT. The effective sample size is a DIFFERENT number from
       * the count -- it is what the count is worth once the design effect is taken out -- and
       * dropping a published figure to tidy a line is not a layout decision anybody gets to
       * make. `count · rate · 95% Wilson` did go: the column heads now say exactly that, one
       * line below, in the table it describes. */}
      <div className="at-pre-line">
        <span className="at-foot-k">EFFECTIVE SAMPLE SIZE</span>
        <span className="at-val">{Number(r.effective_sample_size).toFixed(1)}</span>
      </div>

      <div className="at-pre-line at-pre-prose">
        Distinct storms reaching each threshold, over the storms whose outcome the archive
        actually recorded.
      </div>

      {/* WHY NO WEIGHTED RATE, SAID RATHER THAN SILENTLY OMITTED -- AND SAID IN ONE LINE.
          Distance is already a condition of membership, so weighting by it again would count the
          same variable twice and the weighted rate would equal the unweighted one. Printed only
          when a location condition is what makes it true.

          FOUR LINES OF PROSE BETWEEN THE QUESTION AND THE TABLE IS WHERE THIS WAS, and a reader
          arriving to read a ladder scrolls past a paragraph. The SURFACE now carries the claim in
          one line -- which is the whole of what changes an interpretation: these are storms, not
          storm-kilometres -- and the ARGUMENT for it sits one disclosure below, in the wording it
          always had. Nothing was shortened away: `at-pre-more` holds the same sentences, and the
          summary states the finding rather than promising "more information".

          IT IS A COLLAPSE, NOT A MOVE. The note is still adjacent to the evidence it qualifies,
          still inside the deck, and still above the first rate -- a caveat that changes how a
          number is read may be made shorter and may not be made further away. */}
      {spec && spec.where ? (
        <details className="at-pre-line at-pre-prose at-pre-more" data-weighting-note>
          <summary>
            Every storm here counts once — distance is a condition of membership, not a weight.
          </summary>
          <p>
            Distance is already a condition of membership — within {spec.where.radiusKm} km — so
            it is not also used as a weight; weighting by it again would count the same variable
            twice. The weighted rate would equal the unweighted rate, and is not printed twice
            under two names.
          </p>
        </details>
      ) : null}

    </div>
  );
}

/* WHAT THE RATES ARE AND WHAT THEY ASSUME — BELOW THE TABLE, NOT ABOVE IT.
 *
 * This is standing methodology: genesis-conditioned rates, landfall not decomposing as a product
 * of marginals, a variable used to define a cohort not being reported as an outcome of it. All
 * three are true of every cohort and none is a fact about THIS one.
 *
 * It sat above the table for one draft and cost the acceptance test: three claim paragraphs of
 * fifty words each pushed the outcome rows and their qualification off the first screen, and
 * answer density fell from five of five to four. Below the table it is still rendered, still in
 * the page's text, still one scroll from the rates it governs -- and the first screen is the
 * question, the cohort, the map, the rates and what qualifies them, which is what the density
 * target is measuring.
 *
 * NOT COLLAPSED TO ACHIEVE THAT. A closed disclosure would have bought the same pixels and hidden
 * a statement about how every number above was computed; moving it is not hiding it. */
function RatesAssume() {
  return (
    <details className="at-pre-assume" data-rates-assume open>
      <summary>WHAT THESE RATES ARE, AND WHAT THEY ASSUME</summary>
      <p className="at-foot-line">{claimText("atlas.subject")}</p>
      <p className="at-foot-line">{claimText("atlas.rates")}</p>
      <p className="at-foot-line">{claimText("atlas.conditioning")}</p>
    </details>
  );
}

/* THE EMPTY POOL. Its words are the panel's own, because they are the only correct ones: the
   per-condition counts are taken IN THE ORDER THE FILTERS RUN, so the largest is not necessarily
   the condition that emptied the cohort -- and a reader told otherwise will remove the wrong one.
   The genesis-only paragraph appears only with a location condition, which is the only state it
   is true of. */
function EmptyPool({ result, spec }) {
  return (
    <div className="at-deck-empty" data-empty-pool>
      <div className="at-empty-k">[ NO STORMS MATCHED THIS COHORT ]</div>
      <p className="at-foot-line">
        There is no sample here, so there are no rates. Every condition you set is listed above
        with what it removed — but those counts are taken in the order the filters run, and a
        storm rejected by two conditions is counted only against the first. The largest number is
        therefore not necessarily the condition that emptied the cohort. Remove them one at a
        time to find out which one did.
      </p>
      {spec && spec.where ? (
        <>
          <p className="at-foot-line">
            Matching is on GENESIS LOCATION ONLY: where a storm formed, not where it went. A point
            along a common track will usually match nothing, because storms arrive at those
            positions rather than forming there.
          </p>
          <p className="at-foot-line">
            Widen the radius only if that is a question you actually mean to ask — a wider circle
            answers a different question, it does not find a missing sample.
          </p>
        </>
      ) : null}
      {result.gaps && result.gaps.length ? (
        <div data-archive-gaps className="at-foot-block">
          <span className="at-foot-k">GAPS THE ARCHIVE RECORDED</span>
          {result.gaps.map((g, i) => <span className="at-foot-line" key={i}>{g}</span>)}
        </div>
      ) : null}
    </div>
  );
}

/* ── WHAT QUALIFIES THE ROWS, DIRECTLY BENEATH THE ROWS IT QUALIFIES ──────────────────────
 *
 * These are not refusals and they do not belong to any single row. They are the archive's own
 * statements about the evidence, and leaving them out was the most expensive omission in the
 * first draft of this deck: with no conditions set nothing refuses, every status cell is empty,
 * and the surface published thirteen confident rates with NOTHING qualifying them. The
 * answer-density criterion that caught it -- "material evidence qualification visible" --
 * measured zero, correctly.
 *
 * PLACED PER GROUP, WHICH IS BOTH A LEGIBILITY FIX AND A CORRECTNESS ONE.
 *
 * The first version put all of it at the deck's foot, below eighteen rows. It was present and it
 * required scrolling to reach, which for an acceptance test measured at 0px scroll is the same
 * as absent. But moving it UP to the head was not available either: the archive's own sentence
 * reads "Intensity rates above are therefore biased LOW", so a block above the rates would make
 * the engine's text wrong about the page, and rewording a measured finding to suit a layout is
 * how a finding stops being one.
 *
 * Directly under the INTENSITY group satisfies both: "above" stays true, and it lands inside the
 * first screen. That is also exactly where the panel this replaces put it, for the same reason.
 *
 * `data-archive-gaps` lets the DOM gate exempt the percentages quoted INSIDE these sentences --
 * "1.7% Cat 3 in the 1960s" -- from the no-bare-percentage rule by identity rather than by
 * position on the page.
 */
function Limits({ result }) {
  const gaps = result.gaps || [];
  const unknown = unknownOf(result);
  if (!gaps.length && !unknown) return null;
  return (
    <div className="at-deck-limits" data-deck-limits data-deck-qualification="intensity">
      {gaps.length ? (
        <div data-archive-gaps className="at-foot-block">
          {/* THE HEADING IS THE ONE IT ALWAYS WAS. The block moved and its typesetting changed;
              its words did not, and a published string is not something a layout gets to
              rewrite on its way past. */}
          <span className="at-foot-k">GAPS THE ARCHIVE RECORDED</span>
          {gaps.map((g, i) => <span className="at-foot-line" key={i}>{g}</span>)}
        </div>
      ) : null}
      {/* RENDERED THROUGH Refusal, NOT RE-DRAWN. UNKNOWN is one of the six states the Epistemic
          Key documents, and test-atlas-refusals proves every state the surface can print has a
          row a reader can look it up in. A hand-drawn copy here would carry the words without
          the hook -- present on screen and invisible to the gate that checks the correspondence,
          which is the worst of both. */}
      {unknown > 0 ? (
        <div className="at-foot-block" data-unknown-note>
          <Refusal kind="UNKNOWN" compact
            counts={`${unknown.toLocaleString()} storm${unknown === 1 ? "" : "s"}`} />
        </div>
      ) : null}
    </div>
  );
}

function GroupQualification({ which, result }) {
  /* THE LANDFALL DENOMINATOR, when a condition has changed what these rates are rates OF. Not a
     refusal -- they are real -- but "43.8% made landfall in Mexico" means something different
     one condition later, and the difference is a factor of three. */
  if (which === "landfall" && result.landfall_note) {
    return (
      <div className="at-deck-foot" data-deck-qualification={which}>
        <div className="at-foot-block" data-landfall-note>
          <span className="at-foot-k">LANDFALL DENOMINATOR</span>
          <span className="at-foot-line">{result.landfall_note}</span>
        </div>
      </div>
    );
  }
  return null;
}

/* THE UNKNOWNS ARE ONE SET, NOT ONE PER ROW. Every intensity contract shares a denominator, so
   the largest n_unknown across them IS the count of storms the archive never recorded an outcome
   for. Taken as a max rather than a sum for exactly that reason: summing would count the same
   storms once per contract. Same derivation the panel used. */
function unknownOf(r) {
  let n = 0;
  for (const c of CATEGORY_ORDER) {
    const cell = r.intensity[c];
    if (cell && cell.n_unknown > n) n = cell.n_unknown;
  }
  return n;
}

/* ── ROW ASSEMBLY ─────────────────────────────────────────────────────────────────────────
 *
 * Groups never interleave, because a landfall rate and an intensity rate do not share a
 * denominator and a sort that mixed them would put two different questions on one axis. Within a
 * group the archive's own ladder order is the default; landfall regions order by evidence, which
 * is what the panel already did -- alphabetical order buried the one region these storms reached
 * under four they did not. */
export function buildGroups(r, comparison, subject) {
  const groups = [];
  const tte = r.time_to_event || {};

  /* INTENSITY. TD is not a rung: the ladder starts where the archive's own thresholds start. */
  const intensityRows = CATEGORY_ORDER.filter((c) => c !== "td").map((cat) => {
    const cell = r.intensity[cat];
    const key = intensityContractKey(cat);
    return {
      key: `int:${cat}`,
      label: CAT_LABEL[cat],
      tone: cat,
      cell,
      unscoreable: r.unscoreable ? r.unscoreable[cat] : undefined,
      delta: comparison ? comparison.intensity[cat] : null,
      timing: tte[cat],
      contractKey: key,
      selfContribution: isSelfContribution(cell, subject, key, r.min_sample),
    };
  });
  groups.push({
    key: "intensity", label: "INTENSITY",
    denom: intensityRows.length && intensityRows[0].cell ? intensityRows[0].cell.n_storms : null,
    note: "storms whose peak the archive recorded",
    rows: intensityRows,
  });

  /* LANDFALL. Two contracts per region -- any, and >=64 kt -- on their own rows rather than
     packed into one, because they have different numerators and a shared row would have to pick
     one of them to draw. */
  const allRegions = Object.entries(r.landfall || {})
    .sort((a, b) => b[1].any.count - a[1].any.count || a[0].localeCompare(b[0]));

  /* BELOW 1440 THE LOW-EVIDENCE REGIONS COLLAPSE TO ONE ROW, and which ones is decided by the
     archive rather than by the alphabet: the list is already ordered by evidence, so the ones
     that fold are the ones a reader scanning from the top reaches last. The summary states how
     many regions it holds AND how many of their contracts refused -- a fold that hid four
     refusals behind the word "more" would be hiding exactly what a reader needs to know is
     there. One click brings them all back, which is the rule for every fold on this surface.

     AND ABOVE 1440 NOTHING FOLDS, INCLUDING THE REGIONS WITH NO EVIDENCE. That was tried and
     reverted, and the reason is worth keeping.

     The case for folding them looks strong. On a 500 km cohort around CP012026's genesis the
     deck holds 26 storms, ONE observed crossing -- in Hawaii -- and eight further rows reading 0
     for Caribbean, Central America, CONUS and Mexico, four regions those storms never
     approached. Eight rows of zero under the one row that answers the question reads as the
     answer competing with four non-answers for the same eye, and folding them behind the summary
     put Hawaii and the intensity ladder alone above the fold.

     IT ALSO HID THE REFUSALS, WHICH ARE THE POINT. Six of those eight contracts publish no rate
     at all: they publish OUT OF SCOPE or BASE RATE ONLY. Methodology 1.1.0 split those two apart
     precisely so a zero could never be read as an empirical never -- the Florida click, where an
     Atlantic cohort was told its Hawaii landfall rate was 0.0% [0.0-3.2%] as a scoreable
     contract on the strength of eleven Pacific storms it could never contain. A fold keyed on
     "no evidence" folds exactly the rows whose whole content is the explanation of why there is
     none, and scripts/check-atlas-dom.mjs [4g] fails when it does.

     The prioritisation the fold was reaching for is already here and costs none of that: the
     list is ORDERED BY EVIDENCE, so Hawaii leads a Hawaii cohort and the four zeros follow it.
     Order demotes. Hiding deletes. */
  const regions = allRegions;
  if (allRegions.length) {
    const rows = [];
    for (const [region, kinds] of regions) {
      for (const kind of ["any", "hurricane"]) {
        const cell = kinds[kind];
        const key = landfallContractKey(region, kind);
        rows.push({
          key: `lf:${region}:${kind}`,
          label: `${regionLabel(region)}${kind === "hurricane" ? " · ≥64 KT" : ""}`,
          tone: kind === "hurricane" ? "cat1" : "ts",
          cell,
          unscoreable: r.unscoreable ? r.unscoreable[`${region}:${kind}`] : undefined,
          delta: comparison ? comparison.landfall[region][kind] : null,
          timing: tte[`landfall_${region}`],
          contractKey: key,
          selfContribution: isSelfContribution(cell, subject, key, r.min_sample),
        });
      }
    }
    groups.push({
      key: "landfall", label: "LANDFALL",
      denom: rows.length && rows[0].cell ? rows[0].cell.n_storms : null,
      note: r.landfall_note ? "denominator changed by a condition" : null,
      rows,
    });
  }

  return groups;
}

/* THE TRIGGER, STATED ONCE, AND READ LITERALLY.
 *
 * Four things, all of them: a storm is selected, it is a member of this cohort, it reached this
 * contract, and it is A MAJORITY OF a numerator that sits below the sample gate.
 *
 * One storm is a majority of n only when 1 > n/2 -- which is n = 1, and the specification's own
 * wording for the SUBJECT cell settles it independently: the column is to read IS THE COUNT, not
 * "is most of the count". So the trigger is the storm being the entire numerator. That is
 * narrow, and deliberately so: a disclosure that fired on "a noticeable share" would need a
 * threshold, and a threshold here would be a new epistemic rule rather than a disclosure of an
 * existing one. */
export function isSelfContribution(cell, subject, contractKey, minSample) {
  if (!subject || !subject.inCohort || !cell || cell.rate === null) return false;
  if (subjectReached(subject, contractKey) !== true) return false;
  const n = cell.count;
  if (!n || !minSample || n >= minSample) return false;
  return n === 1;
}

/* ── THE SUBJECT'S OWN VERDICTS ───────────────────────────────────────────────────────────
 *
 * A PRESENTATION READ, AND NOTHING MORE. Every value here comes from fields the pack already
 * holds on the storm -- `max_category` and the landfall rows -- compared against the same
 * contract keys the ledger uses. Nothing is computed that the engine does not already compute,
 * no threshold is introduced, and the archive's own answer is never overridden.
 *
 * THREE STATES, NOT TWO, AND THE THIRD IS THE WHOLE POINT. A contract this storm did not reach
 * gets NO. A contract the archive cannot answer FOR THIS STORM -- an unrecorded peak intensity,
 * a track with no landfall record at all -- gets NOTHING, and the deck renders the slot dash.
 * Printing NO there would publish a judgement the record does not contain: "this storm did not
 * reach Category 3" and "nobody recorded how strong this storm got" are different statements,
 * and the second one is not evidence of the first.
 *
 * A KEY IS ABSENT RATHER THAN FALSE for the undecidable case, which is what makes the
 * distinction survive: `reached[key] === true` is REACHED, `=== false` is NO, and `undefined`
 * is the slot. A default of false anywhere in this function would quietly convert every
 * unrecorded storm into a failed one.
 */
export function subjectVerdicts(storm) {
  if (!storm) return null;
  const out = {};

  /* INTENSITY. The ladder is ordered, so reaching cat4 means reaching everything below it --
     the same monotonic reading the archive's own thresholds carry. An unrecorded peak leaves
     EVERY intensity contract undecided rather than defaulting them to NO. */
  const peak = storm.max_category;
  const at = peak ? CATEGORY_ORDER.indexOf(peak) : -1;
  if (at >= 0) {
    for (const cat of CATEGORY_ORDER) {
      if (cat === "td") continue;
      const key = intensityContractKey(cat);
      if (key) out[key] = at >= CATEGORY_ORDER.indexOf(cat);
    }
  }

  /* LANDFALL. `storm.landfalls` is the archive's own detection, so an empty array is a real
     answer -- this storm came ashore nowhere the archive recognises -- while a missing array is
     no answer at all. Only the first case may produce a NO. */
  if (Array.isArray(storm.landfalls)) {
    const byRegion = new Map();
    for (const l of storm.landfalls) {
      if (!l || !l.region) continue;
      const seen = byRegion.get(l.region) || { any: false, hurricane: false };
      seen.any = true;
      if (l.hurricane_at_landfall === true) seen.hurricane = true;
      byRegion.set(l.region, seen);
    }
    /* Regions the deck will ask about are not known here, so every region the storm touched is
       answered TRUE and the deck's own rows supply the FALSE for the rest -- see below. */
    for (const [region, seen] of byRegion) {
      out[landfallContractKey(region, "any")] = seen.any;
      out[landfallContractKey(region, "hurricane")] = seen.hurricane;
    }
    out.__landfallsKnown = true;
  }
  return out;
}

/* The deck asks about regions this storm may never have touched, and an absent key would render
   a slot where the archive has a real NO. Given a known landfall record, any region not in it is
   a genuine "did not come ashore here" -- so the deck fills the gap at read time rather than
   this function enumerating every region the archive has. */
export function subjectReached(subject, contractKey) {
  if (!subject || !subject.reached) return undefined;
  const v = subject.reached[contractKey];
  if (v !== undefined) return v;
  if (subject.reached.__landfallsKnown && /^landfall_/.test(contractKey)) return false;
  return undefined;
}

/* ── THE TABLE'S FOOT ──────────────────────────────────────────────────────────────────────
 *
 * TWO BLOCKS THAT THE DELETED PANEL CARRIED AND THE DECK MUST NOT LOSE.
 *
 * The redesign folds thirteen comparison CARDS into one column of signed percentage points, and
 * that is the intended trade: the per-row question "by how much" is answered in the cell, and
 * "do the samples separate" is answered by the STATUS word. But two things a card carried are
 * not per-row at all, and deleting cohort-panel.jsx deleted them with it:
 *
 *   WHAT IS THE BASELINE   every "+5.1 pp" on this page is relative to something, and a reader
 *                          must not be able to scroll into a column of deltas without having
 *                          passed the sentence that names what they are deltas FROM.
 *   HOW ARE THE TWO POPULATIONS RELATED  the baseline CONTAINS the cohort, so the same storms
 *                          are on both sides and the two rates are not independent estimates.
 *                          engine/compare.js measures the relation and writes the sentence; the
 *                          surface's only job is to print it where the deltas are.
 *
 * Both are stated once, in the foot, because both are facts about the whole table. The HOLD OUT
 * control comes with them -- "what if I had not restricted the season" is one click rather than
 * a re-entry, and it is the control that makes the baseline a choice rather than a default. */
function DeckFoot({ comparison, conditions, onBaseline, whatChanged, groups,
  citation, citationUrl }) {
  const c = comparison;
  return (
    <div className="at-deck-foot-block" data-deck-foot>
      {/* WHAT CHANGED, AND WHAT IT IS NOT. Written to the specification's bound -- the edit, the
          population delta, and at most two rate deltas -- and labelled in as many words as
          A READING AID, NOT AN ATTRIBUTION. */}
      <WhatChanged edit={whatChanged ? whatChanged.edit : null}
        deltas={c ? topDeltas(groups) : []} />
      {c ? (
        <Baseline c={c} conditions={conditions} onBaseline={onBaseline} groups={groups} />
      ) : null}

      {/* CITE THIS COHORT — THE THIRD THING THE PANEL CARRIED AND THE DECK HAD DROPPED.
          It closes the answer rather than opening it, which is where the deleted panel put it
          and for the reason it gave: a reader cites a result AFTER reading it, and five lines of
          stamps above the table push the first outcome rate off a 1280 viewport. It computes
          nothing and asserts nothing the conditions have not already applied -- its whole point
          is that the analyst it is sent to opens the identical cohort. `citation` went on being
          computed in atlas.jsx after cohort-panel.jsx was deleted, with nothing consuming it:
          a live wire ending in air, which is exactly how a provenance surface disappears
          without a single gate going red. */}
      {citation ? (
        <div className="at-deck-cite" data-cohort-citation>
          <span className="at-foot-k">CITE THIS COHORT</span>
          <CohortSpec text={citation} url={citationUrl} />
        </div>
      ) : null}
    </div>
  );
}

/* AT MOST TWO, AND THE ENGINE WRITES BOTH OF THEM.
 *
 * `delta.statement` is compare.js's own sentence -- the magnitude, the direction word, and which
 * of the two permitted interval readings applies -- and it is printed verbatim. What this adds
 * is the row's name and the baseline RATE, because a statement that says "5.1 points higher"
 * without saying higher than what is the exact omission the baseline block exists to prevent.
 *
 * Ordered by magnitude rather than by ladder position: two lines is the whole budget, so they
 * go to the two rows where the cohort and its baseline differ most. */
function topDeltas(groups) {
  const out = [];
  for (const g of groups) {
    for (const row of g.rows) {
      const d = row.delta;
      if (!d || d.baseRate === null || d.deltaPp === null || !d.statement) continue;
      out.push({ label: row.label, d });
    }
  }
  out.sort((a, b) => Math.abs(b.d.deltaPp) - Math.abs(a.d.deltaPp));
  return out.slice(0, 2).map(({ label, d }) =>
    `${label} — baseline ${(100 * d.baseRate).toFixed(1)}%, ${d.statement}`);
}

/* THE BASELINE, ABOVE NOTHING AND BELOW EVERYTHING IT QUALIFIES.
 *
 * In the panel this block sat above the cards, on the reasoning that a reader must not reach a
 * "+5.1 points" without having passed the sentence naming what it is relative to. In the deck
 * the deltas are a COLUMN, and a block above the table is a block between the question and the
 * evidence -- so it moves to the foot, and the column head carries the short form. The words are
 * the same words and the relation note is still the engine's. */
function Baseline({ c, conditions, onBaseline, groups }) {
  const b = c.baseline;
  const comparable = groups.some((g) => g.rows.some(
    (row) => row.delta && row.delta.deltaPp !== null));
  return (
    <div className="at-deck-baseline" data-baseline>
      <span className="at-foot-k">COMPARED WITH</span>
      <p className="at-foot-line">
        {c.changed
          ? <>the same cohort without <strong>{c.changed.noun}</strong></>
          : baselineSentence(null)}
      </p>
      <p className="at-foot-fig">
        {b.n_cases.toLocaleString()} storms · effective sample{" "}
        {b.effective_sample_size.toFixed(1)}
        {" · "}{b.sufficient ? "SUFFICIENT" : `BELOW SAMPLE · ${b.n_cases} < ${b.min_sample}`}
      </p>
      {/* THE NOTE POINTS AT A COMPARISON, AND SOMETIMES THERE IS NONE. compareResults returns an
          object even when every contract short-circuits, so on a below-gate cohort the block
          would promise a comparison over a ladder in which every rung is refused. The engine's
          words are unchanged; what is added is the state they were written without. */}
      {!comparable ? (
        <p className="at-foot-none" data-no-comparison>
          ⊘ NO CONTRACT IN THIS COHORT HAS A RATE TO COMPARE — every one of them is refused
          above, so there is no delta on this page. The baseline&rsquo;s own figures stand.
        </p>
      ) : null}
      <p className="at-foot-note">{c.relation.note}</p>

      {conditions && conditions.length > 1 ? (
        <div className="at-foot-holdout">
          <span className="at-foot-k">HOLD OUT</span>
          {conditions.map((cond) => (
            <Chip key={cond.key} chipKey={`baseline-${cond.key}`}
              active={!!(c.changed && c.changed.key === cond.key)}
              onClick={() => onBaseline && onBaseline(cond.key)}>{cond.label}</Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
