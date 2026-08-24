/* THE TWO ROWS ABOVE THE CONDITION STRIP.
 *
 * The old masthead did four jobs in 54px: identity, the archive's five headline counts, the
 * build stamps, and the two ways out to provenance and the calibration ledger. Those are not
 * one thing, and the redesign separates them by WHAT A READER DOES WITH THEM.
 *
 *   IDENTITY STRIP, 28px   who this is and which archive is loaded. Read once per session.
 *   QUESTION LINE,  34px   what is being asked, and of how many storms. Read constantly.
 *
 * THE QUESTION IS SET IN SERIF, AND THAT IS THE WHOLE ARGUMENT OF THIS ROW. Every other word on
 * this surface is sans or mono -- a research question typeset as a sentence is the one place the
 * instrument stops sounding like a terminal and states, in a normal English sentence, what it is
 * about to answer. The engine already writes that sentence: `sentenceOf(spec)` is the same text
 * the citation carries, so the line a reader sees and the line they would quote cannot diverge.
 *
 * AND THE COHORT SIZE SITS BESIDE IT, at the figure token -- the one large number the type scale
 * allows on screen at a time. It is here rather than in the deck because it is the DENOMINATOR
 * of everything below: a reader who has the question and the population has the two things every
 * rate in the deck is relative to, before scrolling anything.
 *
 * THE NUMERAL CAME DOWN FROM 26 TO 22, AND NOTHING ELSE ON EITHER ROW MOVED. It is still the
 * largest figure on the surface and still the only one at the figure token; what it stopped
 * being is larger than the serif question beside it, which had the row reading as a number with
 * a caption rather than as a question with its population. The four pixels and the row's tighter
 * padding went to the evidence deck, not to the map -- see --at-deck-min in atlas.css.
 */

import React from "react";
import { TextButton } from "./kit.jsx";

/* THE ARCHIVE'S SCALE, AT THREE FIGURES RATHER THAN FIVE.
 *
 * WHICH THREE, AND WHY THE OTHER TWO LEFT. The strip's job is to say how big the thing being
 * consulted is, in one glance, once a session. Storms, track points and landfalls do that:
 * they are the three denominators the surface actually publishes rates over, and a reader who
 * has them can tell whether "390 cohort" is a slice or a rounding error.
 *
 * GENESIS EVENTS is 3,959 -- the same number as STORMS on every pack this archive has ever
 * built, because the archive keys one genesis per storm. Printing it beside STORMS spent a
 * whole item of a degrading strip restating the item next to it. ENVIRONMENT OBS is 32,940 and
 * counts rows of a table under half the cohort can be evaluated against; as a headline it reads
 * as scale and it is a COVERAGE fact, which is the env lens's to state and does.
 *
 * Both are in the provenance drawer, in section 02, where every count in the manifest is listed
 * from the pack that was actually loaded -- so nothing was dropped, it was filed.
 */
function ScaleLine({ manifest }) {
  if (!manifest) return null;
  const c = manifest.counts;
  const items = [
    [c.storms, "STORMS"], [c.track_points, "TRACK POINTS"], [c.landfalls, "LANDFALLS"],
  ];
  return (
    <div className="at-ledger">
      {items.map(([n, label]) => (
        <span className="at-fig" key={label}>
          <b>{n.toLocaleString()}</b><span>{label}</span>
        </span>
      ))}
    </div>
  );
}

/* Who this is, which archive, and the two ways out. One line, 28px, read once.
 *
 * THREE ZONES AND NOTHING BETWEEN THEM:
 *
 *   LEFT    STORM ATLAS ‹ MILLIBAR
 *   MIDDLE  3,959 storms · 224,153 track points · 3,379 landfalls
 *   RIGHT   METHOD 1.1 · CALIBRATION · PROVENANCE
 *
 * WHAT LEFT THE RIGHT-HAND ZONE, AND WHERE IT WENT. The pack hash and the build timestamp were
 * two of the four 9px stamps here. Neither is legible at a glance, neither changes what a reader
 * does next, and both are already published -- with their derivations -- in the provenance
 * drawer this row's own control opens. The methodology version stays, shortened to METHOD 1.1
 * from METHODOLOGY 1.1.0: it is the one stamp that changes what the numbers below MEAN, and the
 * patch digit has never distinguished two live builds. The full version, the hash and the build
 * time are all one click away, and the element still carries the full string as its title.
 *
 * `data-open-ledger` and the provenance control keep their hooks and their behaviour: the
 * calibration ledger is how a reader checks whether anything else here is worth believing, and
 * it stays in the chrome rather than inside a panel someone has to know to open. */
export function IdentityStrip({ archive, onProvenance, onLedger }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  const method = String(m.methodology_version || "");
  const short = method.split(".").slice(0, 2).join(".") || method;
  return (
    <header className="at-ident" data-identity-strip>
      <h1 className="at-ident-brand">Storm Atlas</h1>
      <a className="at-ident-back" href="../" title="back to Millibar Terminal">‹ Millibar</a>

      {/* THE ARCHIVE'S OWN SCALE. Three counts from the pack that was actually loaded, not from
          anything written here -- which is what makes them a check on the load rather than a
          decoration. The classes carry a measured degradation ladder: the third figure drops at
          1240 and the rest at 1040, on the rule that a strip gives up WHOLE ITEMS rather than
          half a word. A truncated count is a wrong count; an absent one is only absent. */}
      <ScaleLine manifest={m} />

      <div className="at-ident-acts">
        <span className="at-ident-method"
          title={`METHODOLOGY ${method} · PACK ${p.archive_stamp} · BUILT ${p.archive_built_utc || ""}`}>
          METHOD <em>{short}</em>
        </span>
        {onLedger ? (
          <TextButton onClick={onLedger} hook="data-open-ledger"
            title="how well calibrated is this? the archive's own backtest">Calibration</TextButton>
        ) : null}
        <TextButton onClick={onProvenance}
          title="provenance — sources, hashes, the pack stamp and the build time (P)">
          Provenance
        </TextButton>
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
export function QuestionLine({ question, kept, total, citation, citationUrl }) {
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
        {/* CITE, BESIDE THE COUNT IT CITES, AND DELIBERATELY SMALL.
            The full block -- the sentence, its stamps and the URL, all visible and all copied --
            stays at the deck's foot where a reader arrives at it AFTER reading the answer. This
            is the same payload reachable from where the question is, for the reader who already
            knows what they are quoting and only wants it on the clipboard. One word at the label
            token: a second full citation block on this row would put five lines of provenance
            between the question and the map. */}
        {citation ? <Cite text={citation} url={citationUrl} /> : null}
      </div>
    </div>
  );
}

/* WHAT IS COPIED IS WHAT THE DECK'S OWN CITATION COPIES -- the question in words, stamped with
   the definitions it was answered under, and the URL that reproduces it exactly, in that order.
   Two citation affordances that put different things on the clipboard would be worse than one. */
function Cite({ text, url }) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    const payload = url ? `${text}\n${url}` : text;
    const done = () => setCopied(true);
    if (navigator.clipboard) navigator.clipboard.writeText(payload).then(done, done);
    else done();
  };
  return (
    <button type="button" className="at-question-cite" data-cite-cohort onClick={copy}
      title="copy this cohort — the question, its stamps and the URL that reopens it">
      {copied ? "COPIED" : "CITE"}
    </button>
  );
}
