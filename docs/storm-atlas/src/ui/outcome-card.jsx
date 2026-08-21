/* ONE OUTCOME, UNDER THE ARCHIVE'S FOUR PANEL RULES.
 *
 *   1. NO BARE PERCENTAGE. The percent never appears without the count, the denominator and the
 *      95% Wilson interval in the same block. A reader who wants only the percent has to ignore
 *      the evidence beside it; they are never handed the percent alone.
 *   2. A REFUSED RATE PRINTS ITS REFUSAL -- the archive's own reason, verbatim. Never 0.0%.
 *   3. AN UNSCOREABLE CONTRACT PRINTS `BASE RATE ONLY`. No skill number for it exists anywhere
 *      in this repository to display.
 *   4. THE CONDITIONING NOTE TRAVELS WITH THE NUMBERS, so it cannot drift from what it
 *      qualifies.
 *
 * THE INTERVAL IS DRAWN, NOT ONLY PRINTED. The bar carries the rate as a filled length and the
 * Wilson interval as a paler band spanning it, so the width of what is not known is the first
 * thing seen and the digits are the confirmation. 26.9% [23.3-30.8] and 30.2% [24.5-36.7] are
 * two lines of near-identical text and two visibly different bands; the second is the reading
 * that matters, and 3.4's comparison rests on a reader already having it.
 *
 * THIS IS THE ONLY PLACE A RATE IS RENDERED. `OutcomeLadder` and `RateLine` both live here, so
 * the ladder and the compact form in a list cannot come to disagree about how a refusal reads.
 *
 * THE SIX PER-CONTRACT CARDS ARE GONE, and with them CardHead, IntervalBar, Delta and
 * ConditionedGroup. They are not kept "in case": a second way to render a rate is a second way
 * for a rate to be rendered wrongly, and the whole argument for one rendering site is that there
 * is exactly one. The measure, the interval band and the baseline beneath it all survive inside
 * the ladder row -- see atlas.css for what the compression does and does not give up.
 */

import React from "react";
import { MONO, OverDenom } from "./kit.jsx";
import { REFUSALS, Refusal } from "./refusal.jsx";

const CIRCULAR = "CONDITIONED ON -- NOT AN OUTCOME";

/* WHICH REFUSAL THE ENGINE PRODUCED. The status string is the engine's, not the surface's --
   picking the card by re-deriving the condition here would be a second implementation of the
   gate, and the two would drift. */
export function refusalKindOf(u) {
  return u && /^OUT OF SCOPE/.test(u.status || "") ? "OUT_OF_SCOPE" : "BASE_RATE_ONLY";
}

/* BOTH COUNTS, because their difference IS the finding: 0 in scope against 11 archive-wide says
   "your population cannot reach these", which is a different statement from "they do not
   exist". Before 1.1.0 only the second number was shown, and it was the wrong one. */
export function countsOf(u) {
  if (!u) return undefined;
  if (u.scope_events === undefined || u.scope_events === u.archive_events) {
    return `${u.archive_events} archive-wide · ${u.required} needed`;
  }
  return `${u.scope_events} ${u.scope} · ${u.archive_events} archive-wide · `
    + `${u.required} needed`;
}

/* ---- THE LADDER ---------------------------------------------------------------------------
 *
 * One row per contract, on one axis, under the SAME four panel rules the card keeps. See
 * atlas.css for why six cards became six rows; what follows is what each row has to carry.
 *
 * THE REFUSAL OCCUPIES THE RATE COLUMN. That is the whole ordering argument of this pass in one
 * detail: when the archive will not give a number, the place the number would have been is
 * where the reader is already looking, and putting `RATE REFUSED` anywhere else makes the
 * absence of the result look like the absence of a row. The engine's own reason still renders
 * in full beneath the row -- shortened refusal prose would be a different refusal.
 *
 * `data-refusal` IS NOT PUT ON THE RATE SLOT. The DOM gate asserts that EVERY element carrying
 * that attribute names the way out ("Remove that condition", "a wider cohort would carry a
 * rate"), which a two-word status slot cannot. The slot is a plain span; the attribute stays on
 * the block that actually explains, which is also the only place it was ever true.
 */
export function OutcomeLadder({ rows, baselineName, unknown, onEvidence, conditionedReason }) {
  if (!rows || !rows.length) return null;
  const anySep = rows.some((r) => r.delta && r.delta.overlap !== null);
  return (
    <>
      <div className="at-ladder" data-outcome-ladder>
        {rows.map((r) => (
          <LadderRow key={r.key} {...r} baselineName={baselineName}
            onEvidence={r.onEvidence || onEvidence} />
        ))}
      </div>

      {/* THE TWO PERMITTED STATEMENTS, SPELLED OUT ONCE. Each row carries a mark rather than a
          sentence, because a sentence per row is the repetition this ladder exists to end -- but
          a mark whose meaning is not written down is a badge, so both readings are given here in
          the exact words engine/compare.js permits and no others. */}
      {anySep ? (
        <div className="at-lkey">
          The upper band on each rung is this cohort&rsquo;s 95% interval — its width is the
          sample speaking; the fainter one beneath it is the baseline, on the same axis.
          <br />
          <span className="at-sep at-on" /> the intervals do not overlap — these samples separate
          the two rates. <span className="at-sep" /> the intervals overlap — these samples do not
          separate the two rates. Neither is a test.
        </div>
      ) : null}

      {/* SAID ONCE, NOT ONCE PER ROW -- the same discipline ConditionedGroup established. */}
      {conditionedReason ? (
        <div data-refusal="CONDITIONED_ON" style={{ fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-caption)", color: "var(--text-2)", lineHeight: "var(--lh-body)",
          marginTop: "var(--sp-3)" }}>
          {conditionedReason}
          {/* The engine's reason ends with the instruction, so this line carries only the
              classification -- see REFUSALS.CONDITIONED_ON.remedyShort. What a reader needs
              here that the reason does not give them is which KIND of refusal this is: one
              they can act on, or a limit of the record. */}
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-link)",
            marginTop: 5 }}>
            <strong>YOU CAN CHANGE THIS.</strong>
            {REFUSALS.CONDITIONED_ON.remedyShort
              ? ` ${REFUSALS.CONDITIONED_ON.remedyShort}` : null}
          </div>
        </div>
      ) : null}

      {/* AND THE UNKNOWNS ONCE, BECAUSE THERE IS ONE SET OF THEM. Every intensity contract on
          this ladder shares a denominator, so the storms outside it are the same storms in every
          row -- printing the identical four-line refusal under all six said the same thing six
          times and made the ladder unreadable to say it. */}
      {unknown > 0 ? <UnknownNote n={unknown} /> : null}
    </>
  );
}

function LadderRow({ label, tone, cell, unscoreable, subject, delta, baselineCell, baselineName,
  onEvidence, of }) {
  const c = tone || "var(--accent)";
  const refused = !!unscoreable || (cell && (cell.status === CIRCULAR || cell.rate === null));
  const kind = unscoreable ? refusalKindOf(unscoreable)
    : cell && cell.status === CIRCULAR ? "CONDITIONED_ON"
      : cell && cell.rate === null ? "RATE_REFUSED" : null;
  const r = kind ? REFUSALS[kind] : null;

  return (
    <div className="at-lrow" data-outcome={label}>
      <div className="at-lhd">
        <span className="at-lname" style={{ color: c }}>{label}</span>
        {cell ? (
          <span className="at-lct"><OverDenom n={cell.count} of={cell.n_storms} /></span>
        ) : null}
        {refused ? (
          <span className="at-lref" style={{ color: r ? r.tone : "var(--text-2)" }}>
            {r ? `${r.mark} ${r.title}` : "—"}
          </span>
        ) : (
          <span className="at-lrate" style={{ color: c }}>
            {(100 * cell.rate).toFixed(1)}%
          </span>
        )}
      </div>

      {/* THE TWO BANDS, ON ONE AXIS. Adjacency is the comparison: whether they overlap is
          settled by the eye in a glance, and the digits underneath confirm it. */}
      {!refused && cell.ci95 ? (
        <div className="at-lbars">
          <Meas rate={cell.rate} ci={cell.ci95} tone={c} />
          {baselineCell && baselineCell.ci95
            ? <Meas rate={baselineCell.rate} ci={baselineCell.ci95} tone="var(--t4)" />
            : null}
        </div>
      ) : null}

      {!refused ? (
        <div className="at-lft">
          {cell.ci95 ? (
            <span>95% Wilson <em>[{(100 * cell.ci95[0]).toFixed(1)}–{(100 * cell.ci95[1]).toFixed(1)}%]</em></span>
          ) : null}
          {delta && delta.baseRate !== null ? (
            <>
              <span>baseline <em>{(100 * delta.baseRate).toFixed(1)}%</em></span>
              {/* DIRECTION IS NOT A VERDICT, so it is not coloured like one.
                  The card this replaced painted a rise green and a fall red. A Category 5 rate
                  18 points higher than its baseline is not good news, a landfall rate 11 points
                  lower is not bad news, and this surface has no opinion about either -- it is a
                  record of what happened. The sign and the word already carry the direction; the
                  only thing worth encoding beyond them is whether the samples separate, which is
                  what the mark does. */}
              <span style={{ color: delta.overlap ? "var(--t4)" : "var(--t2)" }}>
                <DeltaFigure d={delta} /> {delta.direction}
                {delta.overlap === null ? null
                  : <span className={delta.overlap ? "at-sep" : "at-sep at-on"} />}
              </span>
            </>
          ) : delta && delta.why ? (
            <span>no comparison — {delta.why}</span>
          ) : null}
          <span>{cell.count.toLocaleString()} of {cell.n_storms.toLocaleString()}{" "}
            {of || "storms whose outcome the archive recorded"}</span>
        </div>
      ) : null}

      {/* The engine's own words, verbatim, for the contracts that refuse. A circular row's
          reason is shared by every circular row and is stated once under the ladder instead. */}
      {unscoreable ? (
        <Refusal kind={refusalKindOf(unscoreable)} subject={subject}
          counts={countsOf(unscoreable)} detail={unscoreable.reason} onEvidence={onEvidence} />
      ) : cell && cell.status !== CIRCULAR && cell.rate === null ? (
        <Refusal kind="RATE_REFUSED" subject={subject} detail={cell.refused_reason}
          counts={`${cell.count} of ${cell.n_storms}`} onEvidence={onEvidence} />
      ) : null}
    </div>
  );
}

/* THE SIGN AND THE MAGNITUDE MUST AGREE, and at one decimal place they did not.
 *
 * A delta of -0.04 points printed as "−0.0 points lower": a minus sign in front of a zero, and
 * a direction word for a difference the rounded figure says does not exist. The reverse case
 * printed "±0.0 points identical" only when the difference was EXACTLY zero, so the two states
 * a reader could not tell apart were "identical" and "not identical but too small to show".
 *
 * Below a twentieth of a point the figure states the BOUND rather than a rounded value, which
 * is true, keeps the direction word honest, and cannot be read as a sign attached to a zero. */
function DeltaFigure({ d, unit = "points" }) {
  const mag = Math.abs(d.deltaPp);
  if (mag < 0.05) return <>&lt;0.1 {unit}</>;
  return <>{d.deltaPp > 0 ? "+" : "−"}{mag.toFixed(1)} {unit}</>;
}

/** One measure: the rate as a length, the interval as the band it sits inside, both bounds
 *  marked. Same construction as the card's bar, at ladder scale. */
function Meas({ rate, ci, tone }) {
  const pct = (x) => `${Math.max(0, Math.min(100, 100 * x))}%`;
  return (
    <div className="at-lmeas"
      title={ci ? `95% Wilson interval ${(100 * ci[0]).toFixed(1)}–${(100 * ci[1]).toFixed(1)}%`
        : undefined}>
      {ci ? <b style={{ left: pct(ci[0]), width: pct(ci[1] - ci[0]),
        background: `color-mix(in srgb, ${tone} 26%, transparent)` }} /> : null}
      <i style={{ width: pct(rate), background: `color-mix(in srgb, ${tone} 55%, transparent)` }} />
      {ci ? [ci[0], ci[1]].map((b, i) => <u key={i} style={{ left: pct(b) }} />) : null}
    </div>
  );
}

function UnknownNote({ n }) {
  return (
    <Refusal kind="UNKNOWN" compact
      counts={`${n.toLocaleString()} storm${n === 1 ? "" : "s"}`} />
  );
}

/* The compact form, for a list of contracts where a card each would drown the page. Same states,
   same marks, same remedies -- only the layout differs.

   THE REMEDY TRAVELS EVEN HERE, and it is repeated on every line rather than stated once per
   section. A list of ten badges where only the first says what the reader can do about it is a
   list where nine refusals read as verdicts. Repetition is the cost of the rule; the prose still
   comes from REFUSALS, so there is exactly one place it is written. */
export function RateLine({ cell, label, delta, onEvidence }) {
  if (!cell) return null;
  const pre = label ? <span style={{ color: "var(--text-2)" }}>{label} · </span> : null;

  if (cell.status === CIRCULAR) {
    const r = REFUSALS.CONDITIONED_ON;
    return (
      <div data-refusal="CONDITIONED_ON" style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
        color: "var(--warn)", lineHeight: "var(--lh-body)" }}>
        {pre}<strong>{r.mark} {r.title}</strong>
        <span style={{ color: "var(--text-2)" }}> — {r.remedy}</span>
      </div>
    );
  }
  if (cell.rate === null) {
    const r = REFUSALS.RATE_REFUSED;
    return (
      <div data-refusal="RATE_REFUSED" style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
        color: "var(--neg)", lineHeight: "var(--lh-body)" }}>
        {pre}<strong>{r.mark} {r.title}</strong>
        <span style={{ color: "var(--text-2)" }}> — {cell.refused_reason} · {r.remedy}</span>
        {/* A refused landfall rate is exactly where the ledger has something to say -- three of
            the backtest's ten contracts ARE landfall contracts -- and this compact form was the
            one rendering that never offered the link. Where the ledger holds no row for a
            contract it says so on arrival rather than pretending to have scored it. */}
        {onEvidence ? (
          <button type="button" onClick={onEvidence} data-evidence-link style={{
            ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
            border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
            color: "var(--text-link)", cursor: "pointer", padding: "1px 5px", marginLeft: 6,
          }}>SEE THE EVIDENCE →</button>
        ) : null}
      </div>
    );
  }
  const ci = cell.ci95;
  return (
    <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
      lineHeight: "var(--lh-body)" }}>
      {pre}
      <span style={{ color: "var(--text-1)" }}>{(100 * cell.rate).toFixed(1)}%</span>
      {ci ? <> [{(100 * ci[0]).toFixed(0)}–{(100 * ci[1]).toFixed(0)}%]</> : null}
      {cell.weighted_rate !== null && cell.weighted_rate !== cell.rate ? (
        <span title="Distance- and environment-weighted. The archive publishes no interval for
          the weighted rate; the interval to read is the unweighted one beside it.">
          {" "}· weighted {(100 * cell.weighted_rate).toFixed(1)}%
        </span>
      ) : null}
      {delta && delta.baseRate !== null ? (
        <>
          {" · baseline "}{(100 * delta.baseRate).toFixed(1)}%
          <span style={{ color: delta.overlap ? "var(--t4)" : "var(--t2)" }}>
            {" "}<DeltaFigure d={delta} unit="pp" />
            {delta.overlap === null ? null
              : <span className={delta.overlap ? "at-sep" : "at-sep at-on"} />}
          </span>
        </>
      ) : null}
    </div>
  );
}
