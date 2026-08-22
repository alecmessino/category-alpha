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
 */
export function EvidenceDeck({ result, comparison, subject, onEvidence, foldTiming = false,
  timingOpen = false, onToggleTiming }) {
  if (!result) return null;
  const r = result;
  const groups = buildGroups(r, comparison, subject);

  return (
    <div className="at-deck" data-evidence-deck data-timing-folded={foldTiming ? "" : undefined}>
      <DeckHead foldTiming={foldTiming} timingOpen={timingOpen} onToggleTiming={onToggleTiming}
        subject={subject} />
      {groups.map((g) => (
        <React.Fragment key={g.key}>
          <GroupRow group={g} foldTiming={foldTiming && !timingOpen} subject={subject} />
          {g.rows.map((row) => (
            <DataRow key={row.key} row={row} foldTiming={foldTiming && !timingOpen}
              subject={subject} onEvidence={onEvidence} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

/* THE COLUMN HEADS. Uppercase at the label token, which is the only size uppercase is allowed
   at besides the stamps. The duration heading spans both of its tracks. */
function DeckHead({ foldTiming, timingOpen, onToggleTiming, subject }) {
  const showTiming = !foldTiming || timingOpen;
  return (
    <div className="at-deck-row at-deck-head" role="row">
      <span className="at-dc at-dc-outcome">OUTCOME</span>
      <span className="at-dc at-dc-bar" aria-hidden="true" />
      <span className="at-dc at-dc-rate">RATE</span>
      <span className="at-dc at-dc-count">COUNT</span>
      <span className="at-dc at-dc-int">INTERVAL</span>
      <span className="at-dc at-dc-vs">{subject ? "SUBJECT" : "VS ARCHIVE"}</span>
      {showTiming ? (
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
function GroupRow({ group, foldTiming, subject }) {
  return (
    <div className="at-deck-row at-deck-group" data-deck-group={group.label} role="row">
      <span className="at-dc at-dc-outcome">{group.label}</span>
      <span className="at-dc at-dc-bar" aria-hidden="true" />
      <span className="at-dc at-dc-rate" />
      <span className="at-dc at-dc-count">{group.denom !== null ? (
        <>of {group.denom.toLocaleString()}</>
      ) : null}</span>
      <span className="at-dc at-dc-int">{group.note || null}</span>
      <span className="at-dc at-dc-vs" />
      {foldTiming ? null : <><span className="at-dc at-dc-med" /><span className="at-dc at-dc-iqr" /></>}
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
function DataRow({ row, foldTiming, subject, onEvidence }) {
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
      <span className="at-dc at-dc-bar">
        <Bar cell={refused ? null : cell} classKey={tone} baseline={delta ? delta.baseRate : null}
          refused={refused} />
      </span>

      {/* RULE 2, STRUCTURALLY. A refusal never inflates to the rate's size; the slot holds an
          em dash and the word lives in STATUS. The dash is CONTENT, not decoration -- it means
          "the archive has no value here" -- so it is held to the same contrast bar as the value
          it replaces and never dimmed into a hairline ink. */}
      <span className="at-dc at-dc-rate">
        {refused ? <span className="at-slot" title="the archive publishes no rate here">—</span>
          : <span className="at-val">{pct1(cell.rate)}</span>}
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

      <span className="at-dc at-dc-int">
        {!refused && cell.ci95 ? (
          <span className="at-val">[{pct1(cell.ci95[0])}–{pct1(cell.ci95[1])}]</span>
        ) : <span className="at-slot">—</span>}
      </span>

      {/* VS ARCHIVE, OR THE SUBJECT. With no storm selected the column compares this cohort with
          the archive; with one selected it answers a different question -- did THIS storm reach
          this contract -- and the heading changes with it. A storm the archive holds no verdict
          for gets the slot dash rather than a NO it never earned. */}
      <span className="at-dc at-dc-vs">
        {subject ? <SubjectCell row={row} subject={subject} />
          : <VsArchive delta={delta} refused={refused} />}
      </span>

      {foldTiming ? null : (
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
      )}

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
  const v = subject && subject.reached ? subject.reached[row.contractKey] : undefined;
  if (row.selfContribution) return <span className="at-reached">IS THE COUNT</span>;
  if (v === true) return <span className="at-reached">REACHED</span>;
  if (v === false) return <span className="at-notreached">NO</span>;
  return <span className="at-slot" title="the archive records no verdict for this storm here">—</span>;
}

/* AT MOST EIGHTEEN WORDS, CARRYING THE COUNT. Never an alert box, never a tint, never a coloured
   background -- a refusal is part of the argument, not an error in it. */
function RowRefusal({ kind, cell, unscoreable, onEvidence }) {
  const r = REFUSALS[kind];
  const statement = unscoreable ? unscoreable.reason
    : kind === "CONDITIONED_ON" ? cell.reason
      : cell.refused_reason;
  return (
    <div className="at-deck-say" data-refusal={r.kind}>
      <span className="at-say-text">{bound(statement)}</span>
      <span className="at-say-remedy">
        {r.resolvable === "no" ? r.irreducible : (r.remedyShort || r.remedy)}
      </span>
      {onEvidence ? (
        <button type="button" className="at-say-link" data-evidence-link onClick={onEvidence}>
          SEE THE EVIDENCE →
        </button>
      ) : null}
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

/* ── ROW ASSEMBLY ─────────────────────────────────────────────────────────────────────────
 *
 * Groups never interleave, because a landfall rate and an intensity rate do not share a
 * denominator and a sort that mixed them would put two different questions on one axis. Within a
 * group the archive's own ladder order is the default; landfall regions order by evidence, which
 * is what the panel already did -- alphabetical order buried the one region these storms reached
 * under four they did not. */
function buildGroups(r, comparison, subject) {
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
  const regions = Object.entries(r.landfall || {})
    .sort((a, b) => b[1].any.count - a[1].any.count || a[0].localeCompare(b[0]));
  if (regions.length) {
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
  if (!subject.reached || subject.reached[contractKey] !== true) return false;
  const n = cell.count;
  if (!n || !minSample || n >= minSample) return false;
  return n === 1;
}
