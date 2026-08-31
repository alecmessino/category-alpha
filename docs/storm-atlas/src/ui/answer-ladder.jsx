/* THE ANSWER, BESIDE THE PLATE, IN EIGHT ROWS.
 *
 * WHAT THIS REPLACES AND WHY. The evidence ledger used to hold the right-hand column: every
 * contract this cohort can be asked -- sixteen to eighteen rows -- inside a 486px measure that
 * scrolled 3,457px of deck through a 673px window. Measured on the deployed surface at 1440 with
 * one genesis-radius condition set. That is not an answer beside a map; it is the whole evidence
 * base wearing an answer's position, and it failed in three ways at once: the reader could not
 * see the finding without scrolling, the plate lost width to a table that never fit anyway, and
 * the refusal prose repeated after every row it governed.
 *
 * THE ANSWER IS NOW A SELECTION, AND THE SELECTION IS DECLARED. Six intensity rows -- the whole
 * ladder, because omitting rungs from an ordered scale is an editorial claim about which
 * thresholds matter -- then the two landfall contracts this cohort actually turns on. Eight, and
 * the number is fixed: what is not among them is one screen below in the complete matrix, at page
 * width, with the eight underscored so the relationship is visible rather than asserted.
 *
 * WHICH TWO LANDFALLS, AND WHO DECIDES. The engine does. buildGroups orders landfall regions by
 * the count the archive holds, so the first rows are the ones this cohort's storms actually
 * reached; this file takes the first two that publish a rate, and where none does -- a cohort
 * below the sample gate -- the first two by count, which are the two the reader would ask about.
 * Nothing is hand-picked per cohort and no region is named in this file.
 *
 * A REFUSED ROW KEEPS THE ROW AND LOSES ONLY THE RATE. Where the archive publishes no rate the
 * COUNT stands in the rate's place, at the rate's size, because the count is the finding -- the
 * same argument the deck already makes for the unrecorded-outcome total. The row carries its
 * state word. It carries no sentence: the sentence is written once, per governing refusal, in
 * Limits & exclusions below the matrix.
 */
import React from "react";
import { buildGroups, statusWordOf, refusalKindOfRow, isRefusedRow, pct1 }
  from "./evidence-deck.jsx";

/* ── the selection ──────────────────────────────────────────────────────────────────────── */

/** The whole intensity ladder, then the two landfall contracts with the most evidence. */
export function primaryEight(groups) {
  const intensity = (groups.find((g) => g.key === "intensity") || { rows: [] }).rows;
  const landfall = (groups.find((g) => g.key === "landfall") || { rows: [] }).rows;
  const scoreable = landfall.filter((row) => row.cell && row.cell.rate !== null && !row.unscoreable);
  const pick = (scoreable.length >= 2 ? scoreable : landfall).slice(0, 2);
  return { intensity, landfall: pick, denomL: landfall.length && landfall[0].cell
    ? landfall[0].cell.n_storms : null };
}

/* ── the synthesis ──────────────────────────────────────────────────────────────────────────
 *
 * TWO OR THREE LINES, AND EVERY CLAUSE IS COMPUTED. This is the one place on the surface that
 * says something ABOUT the rows rather than printing them, so it is written to refuse a claim it
 * cannot count. The first draft of this sentence read "storms born here reach every intensity
 * threshold more often than the archive" over a ladder whose Category 5 row was −2.1 pp: a
 * universal its own evidence falsified, three inches above the row that falsified it. Every
 * sentence below is therefore gated on a count, and where the pattern does not hold the sentence
 * says what does rather than reaching for a shape.
 */
export function synthesise({ result, comparison, groups }) {
  const { intensity, landfall } = primaryEight(groups);
  const min = result.min_sample;

  /* Below the gate nothing is comparable and nothing is scoreable: the refusal IS the finding. */
  if (!result.sufficient) {
    return `No rate is published: ${result.kept.toLocaleString()} storms is below the archive's `
      + `gate of ${min}, so every contract refuses. The counts are real; the rates do not exist.`;
  }

  if (comparison) {
    const scored = intensity.filter((r) => r.delta && r.delta.deltaPp !== null);
    if (!scored.length) {
      return "No intensity threshold in this cohort carries a rate the baseline can be "
        + "compared against.";
    }
    const up = scored.filter((r) => r.delta.deltaPp > 0);
    const down = scored.filter((r) => r.delta.deltaPp < 0);
    let first;
    if (!down.length) {
      first = `All ${scored.length} intensity thresholds run higher than the baseline.`;
    } else if (down.length === 1) {
      const d = down[0];
      first = `${up.length} of ${scored.length} intensity thresholds run higher than the `
        + `baseline — ${d.label} is the exception, at ${signed(d.delta.deltaPp)} pp.`;
    } else {
      first = `${up.length} of ${scored.length} intensity thresholds run higher than the `
        + `baseline; ${down.length} run lower.`;
    }
    return `${first}${landfallClause(landfall)}`;
  }

  /* No comparison: this cohort IS the baseline every other one is read against. */
  const cat1 = intensity.find((r) => r.key === "int:cat1");
  const hurricane = cat1 && cat1.cell && cat1.cell.rate !== null
    ? ` ${pct1(cat1.cell.rate)} of them reach hurricane strength.` : "";
  return `The archive's own base rates — what every conditioned cohort here is measured `
    + `against.${hurricane}`;
}

/** Named only when the two selected contracts agree on a region, which is what makes it one
    fact rather than a list. */
function landfallClause(rows) {
  const scoreable = rows.filter((r) => r.cell && r.cell.rate !== null && !r.unscoreable);
  if (!scoreable.length) return "";
  const region = (r) => r.label.split(" · ")[0];
  if (scoreable.length === 2 && region(scoreable[0]) === region(scoreable[1])) {
    return ` Landfall is ${region(scoreable[0])}'s.`;
  }
  return ` The landfall it turns on is ${scoreable[0].label}, at ${pct1(scoreable[0].cell.rate)}.`;
}

const signed = (pp) => `${pp > 0 ? "+" : pp < 0 ? "−" : ""}${Math.abs(pp).toFixed(1)}`;

/* ── the ladder ─────────────────────────────────────────────────────────────────────────── */

/**
 * @param {object}   props.result       the cohort result
 * @param {object}   [props.comparison] compareResults output, or null
 * @param {object}   [props.subject]    the selected storm's membership, when one is selected
 * @param {number}   props.archiveTotal the archive's own storm count, for the sample line
 */
export function AnswerLadder({ result, comparison, subject, archiveTotal }) {
  if (!result || !result.n_cases) return null;
  const groups = buildGroups(result, comparison, subject);
  const { intensity, landfall, denomL } = primaryEight(groups);

  /* THE POINTER'S TWO NUMBERS ARE COUNTED HERE, over the same groups the matrix below renders,
     so the line cannot promise a different number of refusals than the reader finds. */
  const all = groups.flatMap((g) => g.rows);
  const contracts = all.length;
  const refused = all.filter(isRefusedRow).length;

  const keyLine = !result.sufficient
    ? "n / N · STATUS — no rate exists, so no interval does"
    : `n / N · 95% WILSON${comparison ? " · Δ VS ARCHIVE · STATUS" : ""}`;

  return (
    <section className="at-answer" data-answer>
      <div className="at-ans-top">
        <div className="at-ans-head">
          <span className="at-ans-n">{result.kept.toLocaleString()}</span>
          <span className="at-ans-l">EFFECTIVE SAMPLE<br />
            OF {archiveTotal.toLocaleString()} ARCHIVE STORMS</span>
          <span className="at-ans-state" data-sample-state>
            {result.sufficient ? "SUFFICIENT" : "BELOW SAMPLE"}
          </span>
        </div>
        <p className="at-ans-syn" data-synthesis>
          {synthesise({ result, comparison, groups })}
        </p>
      </div>

      {/* ONE LADDER, ONE KEY, EIGHT ROWS. Not two sub-columns and not two competing heads: the
          landfall denominator changes, so it is stamped on the rule where it changes and the
          sequence continues. */}
      <div className="at-ans-mid">
        <div className="at-ans-key">
          <span>OUTCOME</span><span>{keyLine}</span>
        </div>
        <div className="at-ans-rows">
          {intensity.map((row) => <AnswerRow key={row.key} row={row} comparison={comparison} />)}
          {landfall.length ? (
            <div className="at-ans-lf">
              LANDFALL{denomL ? ` · of ${denomL.toLocaleString()}` : ""}
            </div>
          ) : null}
          {landfall.map((row) => <AnswerRow key={row.key} row={row} comparison={comparison} />)}
        </div>
      </div>

      <div className="at-ans-foot">
        {/* THE BASELINE IS METHODOLOGICAL CONTEXT, NOT A SECOND HEADLINE. It is attached to the
            answer at stamp size. A comparison that has nothing to compare says nothing here --
            the refusal cohort's whole answer is that no rate exists -- and the block that
            explains that is in the deck's own foot, where it always was. */}
        {/* AND BELOW THE GATE IT SAYS NOTHING AT ALL. A cohort under the sample gate publishes no
            rate, so there is no figure for a baseline to be a baseline OF, and a stamp announcing
            a comparison over eight refused rows is a promise of a reading the surface cannot
            give. The whole answer there is BELOW SAMPLE and the counts; the comparison returns
            the moment a rate does. */}
        {!result.sufficient ? null : comparison ? (
          <p className="at-ans-cmp" data-comparison-note>
            <b>COMPARISON</b> · {comparison.changed
              ? `same cohort without ${comparison.changed.noun}`
              : "the archive"}
            <br />
            {comparison.relation.shared.toLocaleString()} shared storms · descriptive comparison,
            {" "}not independent samples
          </p>
        ) : (
          <p className="at-ans-cmp" data-comparison-note><b>COMPARISON</b> · archive base rates</p>
        )}
        {/* ONE POINTER, ONE FACT. Not the refusal prose, not a second caveat riding along: the
            count of refused contracts and where their explanation is. */}
        <p className="at-ans-pointer" data-limits-pointer>
          {refused} OF {contracts} CONTRACTS REFUSED — EXPLAINED ONCE, BELOW ↓
        </p>
      </div>
    </section>
  );
}

function AnswerRow({ row, comparison }) {
  const { label, cell, delta } = row;
  const refused = isRefusedRow(row);
  const status = statusWordOf(row);
  const kind = refusalKindOfRow(row);
  return (
    /* `data-refusal-state`, NOT `data-refusal`. The second is this surface's hook for a place a
       refusal is EXPLAINED, and check-atlas-dom holds every one of them to naming the way out.
       A row here explains nothing: it carries the state word and its count, and the explanation
       is written once, per governing refusal, below the matrix. Marking it `data-refusal` would
       have made the gate demand the remedy prose on a row the contract forbids prose on -- and
       the gate would have been right. */
    <div className="at-ans-row" data-finding data-refused={refused ? "" : undefined}
      data-refusal-state={kind || undefined}>
      <span className="at-ans-name">
        <span className="at-ans-label" title={label}>{label}</span>
        {/* A LEADER, THE WAY A PRINTED TABLE CARRIES ONE. At this measure the eye has to travel
            from an outcome name to a figure set hard right; the dotted rule is what keeps it on
            the line. It carries no meaning and no text. */}
        <i className="at-ans-ld" aria-hidden="true" />
      </span>
      <span className="at-ans-rate">
        {refused ? (
          <>
            <span className="at-val">{cell ? cell.count.toLocaleString() : "—"}</span>
            {cell && cell.n_storms ? (
              <span className="at-ans-den">OF {cell.n_storms.toLocaleString()}</span>
            ) : null}
          </>
        ) : <span className="at-val">{pct1(cell.rate)}</span>}
      </span>
      <span className="at-ans-vs">
        {!refused && comparison && delta && delta.deltaPp !== null
          ? <span className="at-val">{signed(delta.deltaPp)} pp</span> : null}
      </span>
      <span className="at-ans-sup">
        {refused ? null : (
          <span className="at-val">
            {cell.count.toLocaleString()} / {cell.n_storms.toLocaleString()}
            {cell.ci95 ? <> · {(100 * cell.ci95[0]).toFixed(1)}–{(100 * cell.ci95[1]).toFixed(1)}%</>
              : null}
          </span>
        )}
      </span>
      <span className="at-ans-st" data-status={status || undefined}>{status || null}</span>
    </div>
  );
}
