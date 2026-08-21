/* THE FIVE REFUSALS.
 *
 * When the archive will not answer, this is what says so. It is not an error surface -- nothing
 * has gone wrong -- it is the part of the product that makes every number beside it worth
 * believing. An archive that answers everything is an archive that is guessing somewhere.
 *
 * THE DISTINCTION THAT MATTERS MOST IS NOT WHY, IT IS WHETHER THE READER CAN DO ANYTHING.
 * Three of these dissolve if the reader asks a different question. Two do not, and no cohort
 * that can be built will make them go away. Presenting the second kind with a suggestion --
 * "try widening the radius" -- would be a more comfortable lie than refusing outright, because
 * it sends the reader looking for a number the record does not contain. So the two irreducible
 * states are drawn in a flat, unactionable grey with a dashed rule and say, in as many words,
 * that this is a limit of the record.
 *
 *   RATE REFUSED    the sample is below the archive's gate. Counts still publish.   RESOLVABLE
 *   CONDITIONED ON  this variable defined the cohort -- the fifth rule.             RESOLVABLE
 *   OUT OF SCOPE    the events exist, somewhere this query cannot reach.            RESOLVABLE
 *   NOT EVALUABLE   no environment record near genesis for these storms.            PARTLY
 *   BASE RATE ONLY  the WHOLE archive holds too few events for any skill claim.     IRREDUCIBLE
 *   -- UNKNOWN      the outcome was never recorded. Out of the denominator, counted. IRREDUCIBLE
 *
 * OUT OF SCOPE ARRIVED WITH METHODOLOGY 1.1.0 AND IT SPLIT BASE RATE ONLY IN TWO. The gate used
 * to count events across the whole archive, so every refusal it produced claimed to be a limit
 * of the record. Measured, exactly one contract is: hawaii:hurricane, at two events. The rest
 * were limits of the POPULATION THE QUERY ASKED ABOUT -- a Florida cohort was being told its
 * Hawaii landfall rate was 0.0% [0.0-3.2%] on the strength of eleven Pacific storms it could
 * never contain. Those are now OUT OF SCOPE, they are resolvable, and they say where the events
 * actually are. BASE RATE ONLY keeps its sentence, which is once again true.
 *
 * Each carries a distinct mark, a distinct colour role and distinct wording, so which refusal
 * fired is legible without reading the sentence. check-atlas-dom asserts all five reach the
 * screen and that no two of them say the same thing.
 */

import React from "react";
import { MONO } from "./kit.jsx";

/* One definition per state. The UI reads this; it never writes its own copy of a refusal, for
   the same reason the gaps are reproduced verbatim -- prose written twice drifts.
 *
 * `claim` names this state's row in the terminal's Epistemic Key (docs/app/claims.js). The two
 * surfaces necessarily hold two vocabularies -- the key is a reader-facing glossary shared with
 * a terminal that knows nothing about cohorts -- but the CORRESPONDENCE is data, declared here
 * once, so scripts/test-atlas-refusals.mjs can prove every state the Atlas can print has a row
 * a reader can look it up in, and that no row describes a state nothing prints. */
export const REFUSALS = {
  RATE_REFUSED: {
    kind: "RATE_REFUSED",
    claim: "refused",
    title: "RATE REFUSED",
    mark: "⊘",
    tone: "var(--neg)",
    resolvable: "yes",
    remedy: "A wider cohort would carry a rate: drop a condition, widen the radius, or extend "
          + "the seasons. The counts below are real either way.",
  },
  CONDITIONED_ON: {
    kind: "CONDITIONED_ON",
    claim: "cond",
    title: "CONDITIONED ON",
    mark: "↺",
    tone: "var(--warn)",
    resolvable: "yes",
    /* Short on purpose. The engine's own `reason` is rendered above this line and explains the
       circularity in full; a second paragraph restating it turns the card into a lecture and
       buries the one thing this line is for -- whether the reader can act. */
    remedy: "Remove that condition and it becomes an outcome again.",
    /* Empty on purpose, not missing. The engine's reason for a circular contract ends with
       "Remove that condition to make this an outcome again", so the line beneath it has nothing
       left to add except the one thing the reason does NOT say: which of the two kinds of
       refusal this is. An empty string renders the classification alone. */
    remedyShort: "",
  },
  OUT_OF_SCOPE: {
    kind: "OUT_OF_SCOPE",
    claim: "oos",
    title: "OUT OF SCOPE",
    mark: "⇱",
    tone: "var(--warn)",
    resolvable: "yes",
    remedy: "The events exist in this archive, outside the population you asked about. Widen the "
          + "basin or the era and this contract becomes scoreable — a skill number over a "
          + "population that does not carry the events would be borrowed from one that does.",
    /* THE SAME SENTENCE, TWICE, SIX TIMES OVER. The engine writes its own reason for this
       refusal and that reason ALREADY ENDS with the widening instruction -- so a card carrying
       both printed "Widen the basin or the era and this contract becomes scoreable; a skill
       number over a population that does not carry the events would be borrowed from one that
       does" and then said it again, in the next paragraph, with an em-dash instead of a
       semicolon. Measured on one rendered panel: twelve occurrences of that clause across six
       refusals. `remedyShort` is what the line says when the engine has already said the rest;
       `remedy` still stands alone where there is no engine reason, which is the compact form in
       a list. Neither is a paraphrase of the other -- the short one is the long one's first
       sentence, and the part that is dropped is the part already on screen. */
    remedyShort: "The events exist in this archive, outside the population you asked about.",
  },
  NOT_EVALUABLE: {
    kind: "NOT_EVALUABLE",
    claim: "notev",
    title: "NOT EVALUABLE",
    mark: "⌁",
    tone: "var(--text-2)",
    resolvable: "partly",
    /* TWO REMEDIES, BECAUSE THERE ARE TWO STATES AND ONLY ONE OF THEM IS REACHABLE TODAY.
     *
     * This refusal used to carry a single sentence -- "Dropping the environmental condition
     * restores the cohort" -- and printed it directly beneath the builder's own statement that
     * NO ENVIRONMENTAL CONDITION IS OFFERED. Twice per page, the surface told the reader to
     * remove a control that does not exist. That is worse than an unhelpful remedy: a reader
     * who believes they set a condition they never set does not trust the count either.
     *
     * The distinction the two sentences draw is the one that decides what a reader can DO, and
     * it is the same distinction the brief names:
     *
     *   recordLimit   the observations do not exist for these storms. Nothing in the query put
     *                 them outside the record and nothing in the query brings them back; what a
     *                 reader CAN do is ask a question the record reaches.
     *   queryCaused   a condition the reader set is what removed the evidence, so dropping it
     *                 restores the cohort -- and still cannot restore the observations.
     *
     * `remedy` is the record-limit case because that is the only one this build can reach: the
     * environment is a LENS and not a filter, so no environmental condition can be active. The
     * second sentence is kept rather than deleted because it becomes the true one the day a
     * condition is offered, and a remedy written fresh at that point would be a remedy nobody
     * had checked against this table. `remedyWhen` in the component selects between them; the
     * surface never writes either. */
    remedy: "No environmental condition is active, so there is nothing to drop. These storms sit "
          + "outside the environment record's era and coverage — a cohort inside it can be "
          + "evaluated, and the observations themselves cannot be recovered.",
    remedyQueryCaused: "Dropping the environmental condition restores the cohort; it cannot "
          + "restore the observations.",
  },
  BASE_RATE_ONLY: {
    kind: "BASE_RATE_ONLY",
    claim: "base",
    title: "BASE RATE ONLY",
    mark: "▤",
    tone: "var(--text-2)",
    resolvable: "no",
    remedy: null,
    irreducible: "The whole archive holds too few of these events for any conditioned claim. "
               + "No cohort you can build changes that -- the count is the finding.",
  },
  UNKNOWN: {
    kind: "UNKNOWN",
    claim: "unk",
    title: "— UNKNOWN",
    mark: "—",
    tone: "var(--text-2)",
    resolvable: "no",
    remedy: null,
    irreducible: "Nobody recorded this outcome. These storms are out of every denominator above "
               + "and counted here instead. An unrecorded outcome is not a zero, and widening "
               + "the cohort will not measure them retroactively.",
  },
};

/**
 * @param {object} props
 * @param {string} props.kind        one of REFUSALS
 * @param {string} [props.detail]    the archive's own reason, reproduced rather than paraphrased
 * @param {string} [props.subject]   what was refused, e.g. "CATEGORY 3" or "mexico · >=64 kt"
 * @param {node}   [props.counts]    what the archive DOES publish here -- a refusal is not a blank
 * @param {string} [props.cause]     "record" (default) or "query" -- WHICH of the refusal's
 *   remedies is true of this rendering. A refusal that names a condition the reader has not set
 *   is a refusal that sends them looking for a control that is not there, so the state picks the
 *   sentence and the call site never writes one.
 */
export function Refusal({ kind, detail, subject, counts, compact, onEvidence, cause = "record",
  detailSummary }) {
  const r = REFUSALS[kind];
  if (!r) return null;
  const hard = r.resolvable === "no";
  /* WHICH REMEDY, AND HOW MUCH OF IT.
     `cause` picks between two DIFFERENT remedies -- record limit or query-caused. `remedyShort`
     picks how much of the chosen one to print: when the engine has supplied its own reason, the
     parts of the remedy that reason already contains are not repeated. Both decisions are made
     from state here so that every sentence is still authored in exactly one place. */
  const full = cause === "query" && r.remedyQueryCaused ? r.remedyQueryCaused : r.remedy;
  const remedy = detail && r.remedyShort !== undefined && cause !== "query"
    ? r.remedyShort : full;

  return (
    <div
      data-refusal={r.kind}
      style={{
        border: hard ? "1px dashed var(--border-strong)" : "1px solid var(--border-strong)",
        borderLeft: hard ? "1px dashed var(--border-strong)"
          : `var(--bw-signal) solid ${r.tone}`,
        borderRadius: "var(--radius-sm)",
        padding: compact ? "var(--sp-3)" : "var(--sp-4) var(--sp-5)",
        background: hard ? "transparent" : `color-mix(in srgb, ${r.tone} 6%, transparent)`,
        marginTop: "var(--sp-3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)" }}>
        <span aria-hidden="true" style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: r.tone,
          flex: "none", width: 12, textAlign: "center" }}>{r.mark}</span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800, color: r.tone,
          letterSpacing: ".5px" }}>{r.title}</span>
        {subject ? (
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
            {subject}
          </span>
        ) : null}
        {counts ? (
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-1)",
            marginLeft: "auto" }}>{counts}</span>
        ) : null}
      </div>

      {/* THE REASON, AND WHERE IT SITS.
          By default the archive's own explanation is open, because a refusal a reader cannot
          interrogate is a refusal they have to take on trust. `detailSummary` makes it a
          disclosure instead, for the one place the explanation is a hundred words of standing
          methodology rather than a fact about this cohort -- and even there the status, the
          subject, the counts and the remedy stay on screen, so what is hidden is the argument
          and never the refusal. */}
      {detail ? (
        detailSummary ? (
          <details style={{ marginTop: 4, paddingLeft: 24 }}>
            <summary style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
              cursor: "pointer", letterSpacing: "var(--track-label)" }}>{detailSummary}</summary>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
              color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 4 }}>
              {detail}
            </div>
          </details>
        ) : (
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
            color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 4, paddingLeft: 24 }}>
            {detail}
          </div>
        )
      ) : null}

      {/* THE REFUSAL CARRIES ITS OWN EVIDENCE. A refusal is a claim about the record -- "too few
          events exist for a skill claim here" -- and a reader is entitled to check it. This
          links straight to that contract's row in the calibration ledger, where the archive's
          own backtest says whether the refusal was right. It is the difference between a
          policy and a finding, and it is also where the reader discovers that the gate misses
          three of the four contracts it should be catching. */}
      {onEvidence ? (
        <button type="button" onClick={onEvidence} data-evidence-link style={{
          ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
          color: "var(--text-link)", cursor: "pointer", padding: "3px 7px",
          marginTop: 6, marginLeft: 24,
        }}>SEE THE EVIDENCE →</button>
      ) : null}

      {/* The line that separates a refusal a reader can act on from one nobody can. */}
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", lineHeight: "var(--lh-body)",
        marginTop: 5, paddingLeft: 24, color: hard ? "var(--text-2)" : "var(--text-link)" }}>
        {hard ? (
          <>
            <strong style={{ color: "var(--text-2)" }}>A LIMIT OF THE RECORD.</strong>{" "}
            {r.irreducible}
          </>
        ) : (
          <>
            <strong>{r.resolvable === "partly" ? "PARTLY IN YOUR HANDS." : "YOU CAN CHANGE THIS."}</strong>{" "}
            {remedy}
          </>
        )}
      </div>
    </div>
  );
}
