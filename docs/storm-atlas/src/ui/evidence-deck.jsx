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

const pct1 = (x) => `${(100 * x).toFixed(1)}%`;

/* ── THE DECK ─────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object}   props.result          the cohort result -- intensity, landfall, unscoreable,
 *                                         time_to_event, min_sample, landfall_note
 * @param {object}   [props.comparison]    compareResults output, or null in the default state
 * @param {object}   [props.subject]       the selected storm's membership, when one is selected.
 *                                         `{ id, name, reached: {key: bool}, inCohort: bool }`
 * @param {function} [props.onEvidence]    opens a contract's row in the calibration ledger
 * @param {boolean}  [props.foldTiming]    1280-1439: the two duration columns fold behind a
 *                                         disclosure. The data is not dropped; the columns are.
 * @param {object[]} [props.conditions]   conditionsOf(spec) -- the hold-out control's inventory
 * @param {function} [props.onBaseline]   pins a different condition as the one held out
 * @param {object}   [props.whatChanged]  `{ edit }` -- what the last edit was and what it cost
 * @param {string}   [props.citation]     the Cohort Spec, as one citable line
 * @param {string}   [props.citationUrl]  the URL that reopens exactly this cohort
 */
export function EvidenceDeck({ result, comparison, subject, onEvidence, foldTiming = false,
  foldInterval = false, timingOpen = false, onToggleTiming,
  foldLandfall = false, landfallOpen = false,
  onToggleLandfall, environment = null, spec = null, pathway = null,
  conditions = [], onBaseline, whatChanged = null, replayNote = null,
  citation = null, citationUrl = null,
  collapseGroups = false, openGroups = null, onToggleGroup }) {
  if (!result) return null;
  const r = result;

  /* AN EMPTY POOL IS NAMED, NOT TABULATED. With no storms every cell would be 0 of 0 and every
     rate a refusal, which renders as a full table of nothing -- and a reader scanning it reads
     structure before content and sees an answer. The state has one thing to say and says it. */
  if (!r.n_cases) return <EmptyPool result={r} spec={spec} />;

  const groups = buildGroups(r, comparison, subject, foldLandfall && !landfallOpen);

  /* THE GRID IS SIZED BY WHAT IS ACTUALLY RENDERED, NOT BY WHAT THE WIDTH ASKED FOR.
   *
   * `data-timing-folded` used to carry the PROP, and the cells were emitted from the prop AND
   * the reader's disclosure state. So opening + TIMING COLUMNS at 1300 put two more cells into
   * every row while the grid still had seven tracks, and each row's last cell wrapped into an
   * implicit eighth row -- a STATUS word one line below the row it governs, which is the single
   * failure the whole `display:contents` construction exists to make unreachable. Both
   * attributes are the EFFECTIVE state now, and head, group and data rows all emit exactly one
   * child per track in every combination. */
  const timingOn = !foldTiming || timingOpen;
  /* THE INTERVAL DOES NOT FOLD AWAY, IT MOVES IN WITH THE RATE, and the difference is a rule.
   *
   * The specification's ladder says the interval "folds into the bar's title" below 1280. Its
   * own section on the table says, of the same column, that "the band alone is not an accessible
   * statement" -- and panel rule 1, which predates the redesign, says a published rate implies a
   * count AND an interval on the same row. A title is hover-only and absent on touch, so the
   * ladder's step would have retired a rule the same document states two pages earlier.
   *
   * Reconciled by giving up the COLUMN and keeping the VALUE: below 1280 the bounds render
   * inside the rate cell, on the same line, in the same row. The track is reclaimed, nothing is
   * behind a hover, and check-evidence-deck's rule 1 still finds an interval element in the row.
   * The bar keeps the bounds in its title as well, because the band is drawn there. */
  const intervalOn = !foldInterval || timingOpen;

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
   * contract refuses on the SAME sentence, twelve times over. So the two rules are reconciled
   * the way the panel already reconciled them -- by HOISTING rather than truncating. A reason
   * shared by more than one row is stated once beneath the group and marked on each row; a
   * reason unique to its row is printed in full, where it is the finding rather than noise. */
  const reasonCounts = new Map();
  for (const g of groups) {
    for (const row of g.rows) {
      const reason = reasonOf(row);
      if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }
  }
  const shared = new Set([...reasonCounts].filter(([, n]) => n > 1).map(([k]) => k));

  return (
    <div className="at-deck" data-evidence-deck
      data-timing-folded={timingOn ? undefined : ""}
      data-interval-folded={intervalOn ? undefined : ""}>
      <DeckPreamble result={r} spec={spec} />
      <DeckHead timingOn={timingOn} intervalOn={intervalOn} onToggleTiming={onToggleTiming}
        subject={subject} />
      {groups.map((g) => {
        /* INTENSITY IS RESIDENT AT EVERY WIDTH. It is the ladder the archive is built on and the
           one group a reader arrives to read; the others give up their rows first, and give them
           up to a control that names how many it holds rather than to silence. */
        const collapsed = collapseGroups && g.key !== "intensity"
          && !(openGroups && openGroups[g.key]);
        return (
          <React.Fragment key={g.key}>
            <GroupRow group={g} timingOn={timingOn} intervalOn={intervalOn} subject={subject}
              collapsed={collapsed}
              onExpand={onToggleGroup ? () => onToggleGroup(g.key) : undefined} />
            {/* THE DENOMINATOR'S OWN QUALIFIER, WHERE THE INTERVAL COLUMN USED TO HOLD IT.
                It rides in the INTERVAL cell at full width; when that column folds the sentence
                moves to a line of its own rather than ellipsising inside a narrower cell. A
                strip gives up whole items, never half a word -- and the whole word here is the
                definition of what these rates are rates OF. */}
            {!intervalOn && g.note ? (
              <div className="at-deck-groupnote" data-group-note={g.key}>{g.note}</div>
            ) : null}
            {collapsed ? null : g.rows.map((row) => (
              <DataRow key={row.key} row={row} timingOn={timingOn} intervalOn={intervalOn}
                subject={subject} onEvidence={onEvidence} shared={shared} />
            ))}
            {collapsed ? null : <SharedReason group={g} shared={shared} onEvidence={onEvidence} />}
            {!collapsed && g.folded ? (
              <FoldedRegions folded={g.folded} onOpen={onToggleLandfall} />
            ) : null}
            {collapsed ? null : <GroupQualification which={g.key} result={r} />}
          </React.Fragment>
        );
      })}

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
  );
}

/* THE COLUMN HEADS. Uppercase at the label token, which is the only size uppercase is allowed
   at besides the stamps. The duration heading spans both of its tracks. */
/* ONE CONTROL, NAMING EVERYTHING IT HOLDS. Two folded column groups could have been two
   buttons, but there is one track to put them in and a second affordance would have to come out
   of a column that is carrying data. So the fold names its contents -- + TIMING COLUMNS, or
   + INTERVAL · TIMING once the interval has folded too -- and opening it restores both. Every
   folded item stays reachable in one click from where it was, and the affordance says what it
   holds. */
function DeckHead({ timingOn, intervalOn, onToggleTiming, subject }) {
  /* Only TIMING is ever behind this control: the interval gives up its track but keeps its
     value, so there is nothing about it to restore. */
  return (
    <div className="at-deck-row at-deck-head" role="row">
      <span className="at-dc at-dc-outcome">OUTCOME</span>
      <span className="at-dc at-dc-bar" aria-hidden="true" />
      <span className={"at-dc at-dc-rate" + (intervalOn ? "" : " at-dc-rate-wide")}>
        RATE{intervalOn ? null : <span className="at-dc-int-inline">95% CI</span>}
      </span>
      <span className="at-dc at-dc-count">COUNT</span>
      {intervalOn ? <span className="at-dc at-dc-int">INTERVAL</span> : null}
      <span className="at-dc at-dc-vs">{subject ? "SUBJECT" : "VS ARCHIVE"}</span>
      {timingOn ? (
        <>
          <span className="at-dc at-dc-med">MED h</span>
          <span className="at-dc at-dc-iqr">P25–P75</span>
        </>
      ) : (
        <button type="button" className="at-dc at-dc-fold" data-timing-fold
          onClick={onToggleTiming}
          title="the median and interquartile duration for every row, folded at this width">
          + TIMING COLUMNS
        </button>
      )}
      <span className="at-dc at-dc-status">STATUS</span>
    </div>
  );
}

/* A GROUP ROW CARRIES THE DENOMINATOR ONCE. Every row beneath it shares that denominator, so
   repeating it per row is thirteen copies of one fact -- and the rule is that no percent appears
   without its count, not that every cell restates the population. The group's own status word is
   the one thing it may add: where a whole group refuses for one reason, the word sits here and
   the rows say which contracts it fired on. */
function GroupRow({ group, timingOn, intervalOn, subject, collapsed, onExpand }) {
  return (
    <div className="at-deck-row at-deck-group" data-deck-group={group.label} role="row">
      <span className="at-dc at-dc-outcome">
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
      <span className="at-dc at-dc-bar" aria-hidden="true" />
      <span className={"at-dc at-dc-rate" + (intervalOn ? "" : " at-dc-rate-wide")} />
      <span className="at-dc at-dc-count">{group.denom !== null ? (
        <>of {group.denom.toLocaleString()}</>
      ) : null}</span>
      {intervalOn ? <span className="at-dc at-dc-int">{group.note || null}</span> : null}
      <span className="at-dc at-dc-vs" />
      {timingOn
        ? <><span className="at-dc at-dc-med" /><span className="at-dc at-dc-iqr" /></>
        : <span className="at-dc at-dc-fold" aria-hidden="true" />}
      <span className="at-dc at-dc-status" />
    </div>
  );
}

/* ONE CONTRACT.
 *
 * EVERY CELL IS AUTHORED INSIDE THIS ELEMENT. The row is `display:contents` so the cells sit on
 * the parent grid, but they are emitted here, together, from one branch -- which is what makes
 * "a status detached from its row" unreachable rather than merely unlikely. A refused row takes
 * the refused branch for the rate cell AND the status cell in the same expression; there is no
 * arrangement of props that produces one without the other. */
function DataRow({ row, timingOn, intervalOn, subject, onEvidence, shared }) {
  const { label, tone, cell, unscoreable, delta, timing, contractKey, selfContribution } = row;
  const refused = !!unscoreable || (cell && (cell.status === CIRCULAR || cell.rate === null));
  const kind = unscoreable ? refusalKindOf(unscoreable)
    : cell && cell.status === CIRCULAR ? "CONDITIONED_ON"
      : cell && cell.rate === null ? "RATE_REFUSED" : null;
  const mark = kind ? markGroupOf(kind) : null;
  const status = refused ? REFUSALS[kind].title
    : selfContribution ? "SELF-CONTRIBUTION"
      : statusOfScoreable(delta);

  return (
    <div className={"at-deck-row at-deck-data" + (selfContribution ? " at-deck-self" : "")}
      data-outcome={label} data-contract-row={contractKey || undefined}
      data-self-contribution={selfContribution ? "" : undefined} role="row">

      <span className="at-dc at-dc-outcome">
        {mark ? (
          <span className="at-mark" data-mark={mark} aria-hidden="true">{MARKS[mark].glyph}</span>
        ) : <span className="at-mark" aria-hidden="true" />}
        <span className="at-dc-name">{label}</span>
      </span>

      {/* THE BAR NEVER CARRIES A NUMBER. It carries the rate as a length, the interval as the
          band it sits inside, and the archive baseline as a tick that overhangs the track --
          so whether the two separate is settled by the eye and confirmed by the digits two
          cells to the right. A refused row shows the hatched track and no fill at all: an empty
          bar and a zero bar must not look alike. */}
      {/* AND WHEN THE INTERVAL COLUMN FOLDS, THE BOUNDS GO INTO THE BAR'S OWN TITLE -- the band
          is already drawn there, and a drawn band with no numbers beside it is not an accessible
          statement of an interval. The column comes back in one click from the head. */}
      <span className="at-dc at-dc-bar"
        title={!intervalOn && !refused && cell && cell.ci95
          ? `95% Wilson interval [${(100 * cell.ci95[0]).toFixed(1)}`
            + `–${(100 * cell.ci95[1]).toFixed(1)}%]`
          : undefined}>
        <Bar cell={refused ? null : cell} classKey={tone} baseline={delta ? delta.baseRate : null}
          refused={refused} />
      </span>

      {/* RULE 2, STRUCTURALLY. A refusal never inflates to the rate's size; the slot holds an
          em dash and the word lives in STATUS. The dash is CONTENT, not decoration -- it means
          "the archive has no value here" -- so it is held to the same contrast bar as the value
          it replaces and never dimmed into a hairline ink. */}
      <span className={"at-dc at-dc-rate" + (intervalOn ? "" : " at-dc-rate-wide")}>
        {refused ? <span className="at-slot" title="the archive publishes no rate here">—</span>
          : <span className="at-val">{pct1(cell.rate)}</span>}
        {/* THE MERGED INTERVAL. Still an `at-dc-int`, so every rule written against the interval
            element goes on finding one; it is simply nested in the cell the rate is in rather
            than occupying a track of its own. */}
        {!intervalOn ? (
          <span className="at-dc-int at-dc-int-inline">
            {!refused && cell.ci95 ? (
              <span className="at-val">
                [{(100 * cell.ci95[0]).toFixed(1)}–{(100 * cell.ci95[1]).toFixed(1)}%]
              </span>
            ) : <span className="at-slot">—</span>}
          </span>
        ) : null}
      </span>

      {/* RULE 1 AND RULE 3. The count publishes whether or not the rate does -- a refusal is not
          a blank -- and an unscoreable contract states what it has against what it needs, which
          is the finding rather than a consolation. */}
      <span className="at-dc at-dc-count">
        {cell ? <span className="at-val">{cell.count.toLocaleString()}</span> : null}
        {unscoreable ? (
          <span className="at-need" title="events in scope · archive-wide · required">
            {countsOf(unscoreable)}
          </span>
        ) : null}
      </span>

      {/* ONE PERCENT SIGN, AT THE END. "[19.2%–31.2%]" reads as two quantities; the interval is
          one, and this is the form every other surface in the repository prints it in. */}
      {intervalOn ? (
        <span className="at-dc at-dc-int">
          {!refused && cell.ci95 ? (
            <span className="at-val">
              [{(100 * cell.ci95[0]).toFixed(1)}–{(100 * cell.ci95[1]).toFixed(1)}%]
            </span>
          ) : <span className="at-slot">—</span>}
        </span>
      ) : null}

      {/* VS ARCHIVE, OR THE SUBJECT. With no storm selected the column compares this cohort with
          the archive; with one selected it answers a different question -- did THIS storm reach
          this contract -- and the heading changes with it. A storm the archive holds no verdict
          for gets the slot dash rather than a NO it never earned. */}
      {/* CONDITIONED ON WINS OVER THE SUBJECT, AND THIS IS THE FIFTH RULE ENFORCED IN A CELL.
          A variable in the query is not an outcome of it: every storm in this cohort reached
          this contract BY CONSTRUCTION, so the selected storm did too, and printing REACHED
          would be true, vacuous, and read as evidence -- the one reading the whole conditioned-on
          treatment exists to prevent. The row states the circularity and the subject cell holds
          the slot. Other refusals keep their subject verdict: below the sample gate the archive
          still knows what THIS storm did, and that is a fact about the storm rather than an
          artefact of the question. */}
      <span className="at-dc at-dc-vs">
        {kind === "CONDITIONED_ON"
          ? <span className="at-slot"
              title="this variable is in the query, so it is not an outcome of it">—</span>
          : subject ? <SubjectCell row={row} subject={subject} />
            : <VsArchive delta={delta} refused={refused} />}
      </span>

      {timingOn ? (
        <>
          <span className="at-dc at-dc-med">
            {timing && timing.n ? <span className="at-val">{Math.round(timing.median)}</span>
              : <span className="at-slot">—</span>}
          </span>
          <span className="at-dc at-dc-iqr">
            {timing && timing.n ? (
              <span className="at-val">{Math.round(timing.p25)}–{Math.round(timing.p75)}</span>
            ) : <span className="at-slot">—</span>}
          </span>
        </>
      ) : <span className="at-dc at-dc-fold" aria-hidden="true" />}

      {/* ONE INK, NEVER COLOURED, NEVER AGGREGATED, NEVER A SCORE. The status is a word about
          THIS row and it is rendered inside this row's element -- see the header comment. */}
      <span className="at-dc at-dc-status" data-status={status || undefined}>
        {status || null}
      </span>

      {/* THE ARGUMENT, BOUNDED. A statement of at most eighteen words carrying the count that
          produced it; the full reason is behind SEE THE EVIDENCE. It spans every column because
          it qualifies the whole row, and it is the only element here that may carry
          `data-refusal` -- the DOM gate requires everything with that attribute to name the way
          out, which a two-word status cell cannot do. */}
      {refused ? (
        <RowRefusal kind={kind} cell={cell} unscoreable={unscoreable}
          hoisted={shared && shared.has(reasonOf(row))}
          onEvidence={onEvidence && contractKey ? () => onEvidence(contractKey) : undefined} />
      ) : null}
      {selfContribution ? <SelfContribution row={row} subject={subject} /> : null}
    </div>
  );
}

/* THE BAR. 7px track; the rate as a fill in the class ink, the 95% interval as a lighter band
   over it, the archive baseline as a 1px tick overhanging 2px top and bottom. */
/* THE INK IS CHOSEN IN CSS, NOT HERE, and that is the whole reason this takes a class key
   instead of a colour. The plate's ramp and the light shell's bar echo are two different tables
   -- palette.js draws on a dark stage where a bright amber reads, paper does not -- so an inline
   `background: CATEGORY_COLOR[cat]` would paint the cartographic ink on paper at 1.5:1 and no
   stylesheet could correct it. `data-bar-class` lets each shell resolve its own ramp, which is
   also what keeps the verified light table in atlas.css where the adherence gate reads it. */
function Bar({ cell, classKey, baseline, refused }) {
  const clamp = (x) => `${Math.max(0, Math.min(100, 100 * x))}%`;
  if (refused || !cell || cell.rate === null) {
    return <span className="at-bar-track at-bar-refused" data-bar-class={classKey}
      aria-hidden="true" />;
  }
  return (
    <span className="at-bar-track" data-bar-class={classKey} aria-hidden="true">
      {cell.ci95 ? (
        <span className="at-bar-ci" style={{ left: clamp(cell.ci95[0]),
          width: clamp(cell.ci95[1] - cell.ci95[0]) }} />
      ) : null}
      <span className="at-bar-fill" style={{ width: clamp(cell.rate) }} />
      {baseline !== null && baseline !== undefined ? (
        <span className="at-bar-base" style={{ left: clamp(baseline) }} />
      ) : null}
    </span>
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

/* AT MOST EIGHTEEN WORDS, CARRYING THE COUNT. Never an alert box, never a tint, never a coloured
   background -- a refusal is part of the argument, not an error in it. */
function RowRefusal({ kind, cell, unscoreable, onEvidence, hoisted }) {
  const r = REFUSALS[kind];
  const statement = unscoreable ? unscoreable.reason
    : kind === "CONDITIONED_ON" ? cell.reason
      : cell.refused_reason;
  return (
    <div className="at-deck-say" data-refusal={r.kind}>
      {/* VERBATIM WHERE IT IS THIS ROW'S OWN FINDING; a marker where the same sentence is about
          to be said again under the group. Never truncated: see the note in EvidenceDeck. */}
      <span className="at-say-text">{hoisted ? null : statement}</span>
      {/* THE LINE THAT SEPARATES A REFUSAL A READER CAN ACT ON FROM ONE NOBODY CAN. The words
          are the Refusal component's own, because a reader who learns "A LIMIT OF THE RECORD"
          in one place must not meet a paraphrase of it in another. */}
      <span className="at-say-remedy">
        {r.resolvable === "no" ? <><strong>A LIMIT OF THE RECORD.</strong> {r.irreducible}</>
          : <><strong>{r.resolvable === "partly" ? "PARTLY IN YOUR HANDS." : "YOU CAN CHANGE THIS."}</strong>{" "}
            {r.remedyShort || r.remedy}</>}
      </span>
      {onEvidence ? (
        <button type="button" className="at-say-link" data-evidence-link onClick={onEvidence}>
          SEE THE EVIDENCE →
        </button>
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

/* ONE SENTENCE, ONCE, UNDER THE GROUP THAT SHARES IT. Below the sample gate every contract in a
   group refuses on the same words -- twelve lines of one fact. Hoisted here, the rows keep their
   marks and their status words and the reason is stated in full exactly once. */
function SharedReason({ group, shared, onEvidence }) {
  const reasons = [...new Set(group.rows.map(reasonOf).filter((x) => x && shared.has(x)))];
  if (!reasons.length) return null;
  return (
    <div className="at-deck-say" data-refusal="RATE_REFUSED" data-shared-reason>
      {reasons.map((x, i) => <span className="at-say-text" key={i}>{x}</span>)}
      <span className="at-say-remedy">
        <strong>YOU CAN CHANGE THIS.</strong> {REFUSALS.RATE_REFUSED.remedy}
      </span>
    </div>
  );
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
  const n = r.n_cases;
  return (
    <div className="at-deck-pre" data-deck-preamble>
      <div className="at-pre-line">
        <span className="at-pre-n">{n.toLocaleString()}</span>
        <span className="at-foot-k">storms</span>
        <span className={r.sufficient ? "at-pre-ok" : "at-pre-no"}>
          {r.sufficient ? `SUFFICIENT · ${n} ≥ ${r.min_sample}`
            : `BELOW SAMPLE · ${n} < ${r.min_sample}`}
        </span>
        <span className="at-foot-k">EFFECTIVE SAMPLE SIZE</span>
        <span className="at-val">{Number(r.effective_sample_size).toFixed(1)}</span>
        <span className="at-pre-shape">count · rate · 95% Wilson</span>
      </div>

      <div className="at-pre-line at-pre-prose">
        Distinct storms reaching each threshold, over the storms whose outcome the archive
        actually recorded.
      </div>

      {/* WHY NO WEIGHTED RATE, SAID RATHER THAN SILENTLY OMITTED. Distance is already a
          condition of membership, so weighting by it again would count the same variable twice
          and the weighted rate would equal the unweighted one. Printed only when a location
          condition is what makes it true. */}
      {spec && spec.where ? (
        <div className="at-pre-line at-pre-prose" data-weighting-note>
          Every storm here counts once. Distance is already a condition of membership — within{" "}
          {spec.where.radiusKm} km — so it is not also used as a weight; weighting by it again
          would count the same variable twice. The weighted rate would equal the unweighted rate,
          and is not printed twice under two names.
        </div>
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

/* THE FOLD NAMES WHAT IT HOLDS. "+ 4 MORE" would be an affordance that hides a refusal behind
   a number; this one says which regions, how many contracts, and how many of them refused. */
function FoldedRegions({ folded, onOpen }) {
  return (
    <div className="at-deck-foot" data-folded-regions>
      <button type="button" className="at-fold-btn" data-landfall-fold onClick={onOpen}
        title="show every landfall region">
        + {folded.contracts} MORE LANDFALL CONTRACTS
      </button>
      <span className="at-foot-line">
        {folded.regions.join(", ")}
        {folded.refusals
          ? ` — ${folded.refusals} of ${folded.contracts} refuse at this sample size`
          : " — all scoreable"}
      </span>
    </div>
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
function GroupQualification({ which, result }) {
  if (which === "intensity") {
    const gaps = result.gaps || [];
    const unknown = unknownOf(result);
    if (!gaps.length && !unknown) return null;
    return (
      <div className="at-deck-foot" data-deck-qualification={which}>
        {gaps.length ? (
          <div data-archive-gaps className="at-foot-block">
            <span className="at-foot-k">GAPS THE ARCHIVE RECORDED</span>
            {gaps.map((g, i) => <span className="at-foot-line" key={i}>{g}</span>)}
          </div>
        ) : null}
        {/* RENDERED THROUGH Refusal, NOT RE-DRAWN. UNKNOWN is one of the six states the
            Epistemic Key documents, and test-atlas-refusals proves every state the surface can
            print has a row a reader can look it up in. A hand-drawn copy here would carry the
            words without the hook -- present on screen and invisible to the gate that checks
            the correspondence, which is the worst of both. */}
        {unknown > 0 ? (
          <div className="at-foot-block" data-unknown-note>
            <Refusal kind="UNKNOWN" compact
              counts={`${unknown.toLocaleString()} storm${unknown === 1 ? "" : "s"}`} />
          </div>
        ) : null}
      </div>
    );
  }

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
function buildGroups(r, comparison, subject, foldLandfall) {
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
     there. One click brings them all back, which is the rule for every fold on this surface. */
  const KEEP = 3;
  const regions = foldLandfall ? allRegions.slice(0, KEEP) : allRegions;
  const hidden = foldLandfall ? allRegions.slice(KEEP) : [];
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
    const hiddenRefusals = hidden.reduce((n, [region, kinds]) => n
      + ["any", "hurricane"].filter((k) => {
        const c = kinds[k];
        const u = r.unscoreable ? r.unscoreable[`${region}:${k}`] : undefined;
        return !!u || (c && c.rate === null);
      }).length, 0);
    groups.push({
      key: "landfall", label: "LANDFALL",
      denom: rows.length && rows[0].cell ? rows[0].cell.n_storms : null,
      note: r.landfall_note ? "denominator changed by a condition" : null,
      rows,
      folded: hidden.length
        ? { regions: hidden.map(([region]) => regionLabel(region)), refusals: hiddenRefusals,
            contracts: hidden.length * 2 }
        : null,
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
