/* THE TWO ROWS ABOVE THE CONDITION STRIP.
 *
 * The old masthead did four jobs in 54px: identity, the archive's five headline counts, the
 * build stamps, and the two ways out to provenance and the calibration ledger. Those are not
 * one thing, and the redesign separates them by WHAT A READER DOES WITH THEM.
 *
 *   IDENTITY STRIP, 32px   who this is and which archive is loaded. Read once per session.
 *   QUESTION LINE,  38px   what is being asked, and of how many storms. Read constantly.
 *
 * THE QUESTION IS SET IN SERIF, AND THAT IS THE WHOLE ARGUMENT OF THIS ROW. Every other word on
 * this surface is sans or mono -- a research question typeset as a sentence is the one place the
 * instrument stops sounding like a terminal and states, in a normal English sentence, what it is
 * about to answer. The engine already writes that sentence: `sentenceOf(spec)` is the same text
 * the citation carries, so the line a reader sees and the line they would quote cannot diverge.
 *
 * AND THE COHORT SIZE SITS BESIDE IT, at the figure token -- the one 26px number the type scale
 * allows on screen at a time. It is here rather than in the deck because it is the DENOMINATOR
 * of everything below: a reader who has the question and the population has the two things every
 * rate in the deck is relative to, before scrolling anything.
 */

import React from "react";
import { TextButton } from "./kit.jsx";

/* Who this is, which archive, and the two ways out. One line, 32px, read once.
 *
 * `data-open-ledger` and the provenance control keep their hooks and their behaviour: the
 * calibration ledger is how a reader checks whether anything else here is worth believing, and
 * it stays in the chrome rather than inside a panel someone has to know to open. */
export function IdentityStrip({ archive, onProvenance, onLedger }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  return (
    <header className="at-ident" data-identity-strip>
      <h1 className="at-ident-brand">Storm Atlas</h1>
      <a className="at-ident-back" href="../" title="back to Millibar Terminal">‹ Millibar</a>

      <div className="at-ident-stamps">
        {/* THE STAMP TOKEN, AND THE ONLY THING ALLOWED TO USE IT. Methodology version, pack hash
            and build time are the four stamps 9px exists for; nothing else on this surface may
            go below 10. */}
        <span title={`METHODOLOGY ${m.methodology_version}`}>
          METHODOLOGY <em>{m.methodology_version}</em>
        </span>
        <span title={`PACK ${p.archive_stamp}`}>PACK <em>{p.archive_stamp}</em></span>
        <span title={`BUILT ${p.archive_built_utc || ""}`}>
          BUILT <em>{(p.archive_built_utc || "").replace("T", " ").replace(/:\d\dZ?$/, "Z")}</em>
        </span>
      </div>

      <div className="at-ident-acts">
        {onLedger ? (
          <TextButton onClick={onLedger} hook="data-open-ledger"
            title="how well calibrated is this? the archive's own backtest">Calibration</TextButton>
        ) : null}
        <TextButton onClick={onProvenance} title="provenance (P)">Provenance</TextButton>
      </div>
    </header>
  );
}

/**
 * The research question, as one typeset sentence, with the population it is asked of.
 *
 * @param {string} props.question  sentenceOf(spec) — the engine's own words, never re-phrased
 * @param {number} props.kept      storms in the cohort
 * @param {number} [props.total]   storms in the archive, when the cohort is narrower than it
 */
export function QuestionLine({ question, kept, total }) {
  const narrowed = total !== undefined && total !== null && kept !== total;
  return (
    <div className="at-question" data-question-line>
      {/* NOT TRUNCATED WITH AN ELLIPSIS, AND NOT WRAPPED EITHER. A question that ends in "…" is a
          question a reader cannot act on, and one that wraps to two lines takes its height from
          the plate. It ellipsises only as a last resort and carries the whole sentence as its
          own title, so the full text is always one hover away and always in the DOM for a gate
          to read. */}
      <p className="at-question-text" title={question} data-question>{question}</p>
      <div className="at-question-n">
        <span className="at-question-fig" data-cohort-size>{kept.toLocaleString()}</span>
        <span className="at-question-of">
          {narrowed ? <>of {total.toLocaleString()} storms</> : <>storms</>}
        </span>
      </div>
    </div>
  );
}
