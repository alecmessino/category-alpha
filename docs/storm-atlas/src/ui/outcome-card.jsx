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
 * THIS IS THE ONLY PLACE A RATE IS RENDERED. `RateLine` lives here too, so the compact form in a
 * list and the full card cannot come to disagree about how a refusal reads.
 */

import React from "react";
import { MONO, OverDenom } from "./kit.jsx";
import { REFUSALS, Refusal } from "./refusal.jsx";
import { NO_COMPARISON } from "../engine/compare.js";

const CIRCULAR = "CONDITIONED ON -- NOT AN OUTCOME";

/**
 * @param {object} props
 * @param {object} props.cell     a rateResult: {count, n_storms, n_unknown, rate, ci95,
 *                                weighted_rate, refused_reason} or a circular refusal
 * @param {string} props.label    the contract, e.g. "CATEGORY 3"
 * @param {string} [props.tone]   the contract's colour
 * @param {string} [props.of]     what the denominator IS, in words
 * @param {object} [props.unscoreable] the archive's BASE RATE ONLY verdict for this contract
 * @param {string} [props.subject]  what the refusal is about, when the label alone is not enough
 */
export function OutcomeCard({ cell, label, tone, of, unscoreable, note, subject, delta,
  baselineCell, baselineName, onEvidence }) {
  if (!cell && !unscoreable) return null;
  const c = tone || "var(--accent)";

  /* RULE 3 outranks everything below it. When the archive cannot support a conditioned claim
     about a contract at all, no cohort-level number for it is shown -- not even a refused one --
     because the reader's next question would be "so what would make it show", and the answer is
     nothing. */
  if (unscoreable) {
    return (
      <div style={CARD}>
        <CardHead label={label} tone={c} />
        <Refusal kind="BASE_RATE_ONLY" subject={subject}
          counts={`${unscoreable.archive_events} archive-wide · ${unscoreable.required} needed`}
          detail={unscoreable.reason} onEvidence={onEvidence} />
      </div>
    );
  }

  if (cell.status === CIRCULAR) {
    return (
      <div style={CARD}>
        <CardHead label={label} tone={c}
          right={<OverDenom n={cell.count} of={cell.n_storms} />} />
        <Refusal kind="CONDITIONED_ON" subject={subject} detail={cell.reason || undefined}
          counts={`${cell.count} of ${cell.n_storms} — by construction`} />
      </div>
    );
  }

  if (cell.rate === null) {
    return (
      <div style={CARD}>
        <CardHead label={label} tone={c}
          right={<OverDenom n={cell.count} of={cell.n_storms} />} />
        <Refusal kind="RATE_REFUSED" subject={subject} detail={cell.refused_reason}
          counts={`${cell.count} of ${cell.n_storms}`} onEvidence={onEvidence} />
        {cell.n_unknown > 0 ? <UnknownNote n={cell.n_unknown} /> : null}
      </div>
    );
  }

  const ci = cell.ci95;
  return (
    <div style={CARD}>
      <CardHead label={label} tone={c} right={<OverDenom n={cell.count} of={cell.n_storms} />} />
      <IntervalBar rate={cell.rate} ci={ci} tone={c} />
      {/* THE BASELINE ON THE SAME AXIS, IMMEDIATELY BELOW. Adjacency is the comparison: whether
          the two bands overlap is a thing the eye settles in one glance, and the digits under
          them are the confirmation rather than the finding. Separating the two bars with a
          paragraph would turn a picture back into arithmetic. */}
      {baselineCell && baselineCell.ci95 ? (
        <div style={{ marginTop: 2 }}>
          <IntervalBar rate={baselineCell.rate} ci={baselineCell.ci95} tone="var(--text-2)" thin />
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", marginTop: 5 }}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-lg)", fontWeight: 800, color: c,
          lineHeight: 1 }}>
          {(100 * cell.rate).toFixed(1)}%
        </span>
        {ci ? (
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
            95% Wilson {(100 * ci[0]).toFixed(1)}–{(100 * ci[1]).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 3 }}>
        {cell.count.toLocaleString()} of the {cell.n_storms.toLocaleString()}{" "}
        {of || "storms whose outcome the archive recorded"}
        {note ? <> · {note}</> : null}
      </div>
      {delta ? <Delta d={delta} baselineCell={baselineCell} baselineName={baselineName} /> : null}
      {cell.n_unknown > 0 ? <UnknownNote n={cell.n_unknown} /> : null}
    </div>
  );
}

const CARD = {
  border: "1px solid var(--border-dim)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--sp-4) var(--sp-5)",
  marginTop: "var(--sp-3)",
  background: "var(--surface-sunken)",
};

function CardHead({ label, tone, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
      gap: "var(--sp-4)" }}>
      <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", letterSpacing: "var(--track-label)",
        color: tone }}>{label}</span>
      <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)" }}>{right}</span>
    </div>
  );
}

/* The rate as a filled length, the interval as the band it sits inside. The band is the point:
   two cohorts with the same percent and different sample sizes are two different findings, and
   this is where that becomes visible without arithmetic. */
function IntervalBar({ rate, ci, tone, thin }) {
  const pct = (x) => `${Math.max(0, Math.min(100, 100 * x))}%`;
  /* BOTH BOUNDS HAVE TO BE VISIBLE. Drawn as band-then-fill, the lower bound disappears under
     the fill and the bar reads as "67% and it might be more", which is half the statement. The
     edge marks are drawn last, over everything, so the interval reads as the span it is. */
  return (
    <div style={{ position: "relative", height: thin ? 6 : 10, marginTop: thin ? 0 : 7,
      background: "var(--surface-app)", borderRadius: 2, overflow: "hidden" }}>
      {ci ? (
        <div title={`95% Wilson interval ${(100 * ci[0]).toFixed(1)}–${(100 * ci[1]).toFixed(1)}%`}
          style={{ position: "absolute", top: 0, bottom: 0, left: pct(ci[0]),
            width: pct(ci[1] - ci[0]),
            background: `color-mix(in srgb, ${tone} 26%, transparent)` }} />
      ) : null}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: pct(rate),
        background: `color-mix(in srgb, ${tone} 55%, transparent)` }} />
      {ci ? [ci[0], ci[1]].map((b, i) => (
        <div key={i} style={{ position: "absolute", top: 1, bottom: 1, left: pct(b), width: 1,
          background: "var(--text-1)", opacity: 0.75 }} />
      )) : null}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(rate), width: 2,
        background: tone }} />
    </div>
  );
}

/* THE SAME AXIS, TWICE. This is the whole comparison, and it is a picture before it is a
 * sentence: the baseline's interval is drawn directly beneath the cohort's, on the same 0-100%
 * scale, so whether the two bands overlap is seen rather than computed. The digits underneath
 * confirm what the eye already has.
 *
 * The words are constrained -- see engine/compare.js. Overlapping intervals are a weak
 * heuristic, not a test, so this renders only the two permitted statements and never the
 * vocabulary of a test that is not being run. */
function Delta({ d, baselineCell, baselineName }) {
  if (!d) return null;

  if (d.verdict === NO_COMPARISON) {
    return (
      <div style={DELTA_BOX}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
          NO COMPARISON — {d.why}
        </span>
      </div>
    );
  }

  const sign = d.deltaPp > 0 ? "+" : d.deltaPp < 0 ? "−" : "±";
  const dirTone = d.overlap ? "var(--text-2)"
    : d.deltaPp > 0 ? "var(--pos)" : "var(--neg)";

  return (
    <div style={DELTA_BOX}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        lineHeight: "var(--lh-body)" }}>
        baseline {(100 * d.baseRate).toFixed(1)}%
        {baselineCell && baselineCell.ci95
          ? ` [${(100 * baselineCell.ci95[0]).toFixed(1)}–${(100 * baselineCell.ci95[1]).toFixed(1)}%]`
          : null}
        {baselineName ? <> · {baselineName}</> : null}
      </div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-sm)", marginTop: 3, color: dirTone }}>
        {sign}{Math.abs(d.deltaPp).toFixed(1)} points {d.direction}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        lineHeight: "var(--lh-body)", marginTop: 2,
        color: d.overlap ? "var(--warn)" : "var(--text-1)" }}>
        {d.overlap
          ? "The intervals overlap — these samples do not separate the two rates."
          : "The intervals do not overlap — these samples separate the two rates."}
      </div>
    </div>
  );
}

const DELTA_BOX = {
  borderTop: "1px solid var(--border-dim)",
  marginTop: "var(--sp-3)",
  paddingTop: "var(--sp-3)",
};

/* SAID ONCE, NOT ONCE PER ROW.
 *
 * Conditioning on CAT 3+ makes four rows circular at a stroke -- TS, Cat 1, Cat 2 and Cat 3 are
 * all carried by construction -- and rendering the same three-paragraph explanation four times
 * running is how a real methodological point turns into wallpaper the reader learns to scroll
 * past. The counts stay per contract, because they are per contract; the reason is stated once,
 * because it is one reason. */
export function ConditionedGroup({ rows, reason }) {
  if (!rows.length) return null;
  return (
    <div style={{ ...CARD, borderLeft: "var(--bw-signal) solid var(--warn)" }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800, color: "var(--warn)",
        letterSpacing: ".5px" }}>
        ↺ CONDITIONED ON — not outcomes of this cohort
      </div>
      <div style={{ marginTop: "var(--sp-3)" }}>
        {rows.map(({ label, tone, cell }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between",
            alignItems: "baseline", gap: "var(--sp-4)", padding: "2px 0" }}>
            <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: tone }}>{label}</span>
            <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)" }}>
              <OverDenom n={cell.count} of={cell.n_storms} />
              <span style={{ color: "var(--text-2)" }}> · by construction</span>
            </span>
          </div>
        ))}
      </div>
      <div data-refusal="CONDITIONED_ON" style={{ fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-caption)", color: "var(--text-2)", lineHeight: "var(--lh-body)",
        marginTop: "var(--sp-3)" }}>
        {reason}
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-link)",
          marginTop: 5 }}>
          <strong>YOU CAN CHANGE THIS.</strong> {REFUSALS.CONDITIONED_ON.remedy}
        </div>
      </div>
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
export function RateLine({ cell, label }) {
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
    </div>
  );
}
