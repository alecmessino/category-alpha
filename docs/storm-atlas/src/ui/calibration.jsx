/* THE CALIBRATION LEDGER.
 *
 * Every other surface here answers "what does the record say". This one answers the question a
 * serious reader asks immediately afterwards, and that almost no analytical product will answer
 * about itself: IS ANY OF THIS ANY GOOD?
 *
 * It is a first-class surface rather than a panel, because the answer is not an annotation on
 * the product -- it is the product's warrant. A reader who cannot find it cannot audit anything
 * else on the site, and a reader who finds only its flattering half has been sold something.
 *
 * SO IT LEADS WITH BOTH HALVES.
 *
 *   The clean half: of the eight contracts the replay could score, six beat climatology. The
 *   fewest replay events on a contract WITH skill is 57; the most on one WITHOUT is 6. Nothing
 *   sits between. Skill is a function of how many events the replayed population actually
 *   carried, and the separation is a gap rather than a trend.
 *
 *   The other half: the refusal gate that is supposed to protect a reader from the second group
 *   counts events ARCHIVE-WIDE, not within the population a query can draw from. CONUS landfall
 *   has 699 events archive-wide and one in the east-Pacific replay. The gate passes it; the
 *   method scores worse than climatology on it. Of the four contracts that earned no skill
 *   claim, the gate catches one.
 *
 * The second half is a defect in the gate, and publishing it is the whole argument for the
 * ledger existing. Fixing it changes what both surfaces refuse and is a METHODOLOGY_VERSION
 * decision, not something this page should do quietly.
 *
 * WHAT IS COPIED VERBATIM, AND WHY. `conditions_on` and `cannot_answer` are the harness's own
 * words. The second is the more important: this backtest says nothing about whether a
 * disturbance becomes a storm at all, because the failures are absent from the best-track
 * archive. A calibration page that let a reader carry these numbers over to that question would
 * be claiming skill at the one thing it never tested.
 */

import React from "react";
import { VERDICT, byEvidence, headline, stateOf, unscoredNote } from "../engine/calibration.js";
import { Head, MONO, Row } from "./kit.jsx";

const TONE = { pos: "var(--pos)", warn: "var(--warn)", neg: "var(--neg)" };

export function CalibrationLedger({ cal, anchor, onBack, onClearAnchor, cohortBasins }) {
  const h = headline(cal);
  /* Which basins the reader's cohort actually draws from, when they arrived from one, minus the
     ones this replay covered. Derived rather than assumed: a reader whose cohort is EP-only sees
     no mismatch line, and should not. */
  const scopeMismatch = React.useMemo(() => {
    if (!cohortBasins || !cohortBasins.length) return null;
    const covered = new Set(cal.settings.basins);
    const outside = cohortBasins.filter((b) => !covered.has(b));
    return outside.length ? outside.join(", ") : null;
  }, [cohortBasins, cal]);
  const rows = byEvidence(cal);
  const ref = React.useRef(null);
  /* A reader can arrive here from a refusal on a contract the backtest never scored -- Cat 5,
     or a landfall region outside the three the replay covered. A dead anchor would leave them
     concluding either that the page is broken or that silence means the contract was fine. */
  const unscored = unscoredNote(cal, anchor);

  /* A refusal on the tactical surface links straight to its contract here. Scrolling to it is
     the difference between "the evidence exists somewhere" and "here is the evidence". */
  React.useEffect(() => {
    if (!anchor || !ref.current) return;
    const el = ref.current.querySelector(`[data-contract="${anchor}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "auto" });
  }, [anchor]);

  return (
    <div ref={ref} className="atlas-calibration" data-surface="calibration" style={{
      overflowY: "auto", background: "var(--surface-app)", minWidth: 0, minHeight: 0,
    }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "var(--sp-6) var(--sp-7) var(--sp-8)" }}>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between",
          gap: "var(--sp-5)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-title)",
              fontWeight: "var(--fw-black)", color: "var(--text-1)", letterSpacing: "-.2px" }}>
              CALIBRATION LEDGER
            </div>
            <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
              marginTop: 3 }}>
              what this method got right, what it got wrong, and how you would know
            </div>
          </div>
          <button type="button" onClick={onBack} data-back-to-map style={BTN}>
            ← BACK TO THE MAP
          </button>
        </div>

        {/* THE POPULATION THIS LEDGER COVERS, BEFORE ANY NUMBER IN IT IS READ.
         *
         * Every figure on this page comes from ONE replay over ONE population: the east Pacific,
         * 1971 onwards. `cal.settings` said so in a Row halfway down, under a heading, and
         * nowhere else -- while the headline read "6 of 8 SCORED CONTRACTS BEAT CLIMATOLOGY"
         * with no basin attached and every row carried a bare CALIBRATED badge. A reader
         * arriving from a refusal on a North Atlantic cohort, which is exactly how most readers
         * arrive, met an unqualified performance claim about a basin their query cannot reach.
         *
         * BASIN GENERALITY IS AN OPEN RESEARCH QUESTION AND THIS PAGE DOES NOT ANSWER IT. That
         * is not a caveat to be phrased gently: the backtest was never run outside EP, so the
         * honest statement is that nothing here is evidence about NA either way. Saying so costs
         * one line and is the difference between a ledger and an advertisement. */}
        <div data-ledger-scope style={{
          border: "1px solid var(--border-strong)",
          borderLeft: "var(--bw-signal) solid var(--accent)",
          borderRadius: "var(--radius-sm)", padding: "var(--sp-4) var(--sp-5)",
          background: "var(--surface-sunken)", marginTop: "var(--sp-5)",
        }}>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800,
            color: "var(--accent)", letterSpacing: ".5px" }}>
            EVERY FIGURE HERE IS FROM ONE POPULATION
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
            color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 4 }}>
            This backtest replayed <strong style={{ color: "var(--text-1)" }}>
            {cal.settings.basins.join(", ")}</strong> storms from{" "}
            <strong style={{ color: "var(--text-1)" }}>{cal.settings.min_season}</strong> onwards
            — {cal.n_storms_replayed.toLocaleString()} of them. Every Brier score, every
            climatological benchmark and every CALIBRATED verdict below is a statement about that
            population and about no other. The archive holds other basins; this replay did not
            score them, so it is not evidence that the method performs the same way there, and it
            is not evidence that it performs differently either. Whether skill carries across
            basins is an open question this ledger does not answer.
          </div>
          {scopeMismatch ? (
            <div data-scope-mismatch style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
              color: "var(--warn)", lineHeight: "var(--lh-body)", marginTop: 6 }}>
              ⇱ THE COHORT YOU CAME FROM DRAWS ON {scopeMismatch} — which this replay did not
              score. Read the rows below as evidence about {cal.settings.basins.join(", ")}, not
              about your cohort.
            </div>
          ) : null}
        </div>

        {unscored ? (
          <div data-unscored style={{
            border: "1px solid var(--border-strong)",
            borderLeft: "var(--bw-signal) solid var(--warn)",
            borderRadius: "var(--radius-sm)", padding: "var(--sp-4) var(--sp-5)",
            background: "color-mix(in srgb, var(--warn) 6%, transparent)",
            marginTop: "var(--sp-5)",
          }}>
            <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800,
              color: "var(--warn)", letterSpacing: ".5px" }}>NOT SCORED BY THIS BACKTEST</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
              color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 4 }}>
              {unscored}
            </div>
            <button type="button" onClick={onClearAnchor}
              style={{ ...BTN, marginTop: "var(--sp-3)" }}>DISMISS</button>
          </div>
        ) : null}

        {/* ---- WHAT WAS TESTED, in the harness's own words ------------------------------- */}
        <Head>WHAT WAS TESTED</Head>
        <Row k="mode" v={<span style={MONO}>{cal.mode}</span>} />
        <Row k="storms replayed" v={<span style={MONO}>
          {cal.n_storms_replayed.toLocaleString()}
          <span style={{ color: "var(--text-2)" }}>
            {" "}· {cal.n_storms_skipped_burn_in} skipped as burn-in
            {" "}· {cal.ledger.rows.toLocaleString()}-row ledger
          </span>
        </span>} />
        <Row k="population" v={<span style={MONO}>
          {cal.settings.basins.join(", ")} · {cal.settings.min_season}+
          <span style={{ color: "var(--text-2)" }}>
            {" "}· {cal.settings.radius_km} km · ±{cal.settings.season_window_months} months
            {" "}· min_sample {cal.settings.min_sample}
          </span>
        </span>} />
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: "var(--sp-3)" }}>
          <strong style={{ color: "var(--text-1)" }}>Conditions on:</strong> {cal.conditions_on}
        </div>
        {/* The load-bearing sentence on this page. */}
        <div data-cannot-answer style={{
          border: "1px solid var(--border-strong)",
          borderLeft: "var(--bw-signal) solid var(--warn)",
          borderRadius: "var(--radius-sm)", padding: "var(--sp-4) var(--sp-5)",
          background: "color-mix(in srgb, var(--warn) 6%, transparent)",
          marginTop: "var(--sp-4)",
        }}>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800,
            color: "var(--warn)", letterSpacing: ".5px" }}>WHAT THIS CANNOT ANSWER</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
            color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 4 }}>
            {cal.cannot_answer}
          </div>
        </div>

        {/* ---- THE HEADLINE, both halves ------------------------------------------------- */}
        <Head>THE HEADLINE</Head>
        <div data-headline style={{ display: "grid", gap: "var(--sp-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <Card tone="pos" stat={`${h.beat} of ${h.scored}`}
            label={`SCORED CONTRACTS BEAT CLIMATOLOGY · ${cal.settings.basins.join(", ")} `
              + `${cal.settings.min_season}+ ONLY`}
            note="Brier against the archive's own climatological base rate, over a zero-peek
                  replay. Two of the ten contracts had no events in the replayed population and
                  could not be scored at all." />
          <Card tone="pos" stat={`${h.minWith} vs ${h.maxWithout}`}
            label="EVENTS: FEWEST WITH SKILL vs MOST WITHOUT"
            note="Every contract carrying at least 57 events in the replayed population beat
                  climatology; every contract carrying 6 or fewer did not. Nothing sits between
                  the two — the separation is a gap, not a trend line." />
          <Card tone={h.caught < h.notScoring ? "neg" : "pos"}
            stat={`${h.caught} of ${h.notScoring}`}
            label={`NO-SKILL CONTRACTS THE GATE CATCHES · was ${h.caughtBefore} of ${h.notScoring}`}
            note={`The gate used to count events across the whole archive, and caught `
              + `${h.caughtBefore} of ${h.notScoring}. Methodology 1.1.0 counts them within the `
              + `population a query can draw from instead; it now catches ${h.caught}. `
              + `${h.corrected.length} contract(s) moved, and both verdicts stay on every row `
              + "below — a ledger that stopped showing the defect it caught would have no "
              + "record of ever having caught anything."} />
        </div>

        {/* ---- THE TABLE ----------------------------------------------------------------- */}
        <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
          color: "var(--text-2)" }}>ordered by the evidence behind them</span>}>
          SKILL AGAINST EVENT COUNT
        </Head>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780,
            ...MONO, fontSize: "var(--fs-mono-xs)" }}>
            <thead>
              <tr>
                {["CONTRACT", "EVENTS IN REPLAY", "IN SCOPE", "ARCHIVE-WIDE", "BRIER",
                  "CLIMATOLOGY", "SKILL", "", "GATE"].map((c, i) => (
                  <th key={c + i} style={{
                    textAlign: i === 0 ? "left" : "right", padding: "6px 10px",
                    color: "var(--text-2)", fontWeight: 500, letterSpacing: "var(--track-label)",
                    borderBottom: "1px solid var(--border-strong)", whiteSpace: "nowrap",
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const prev = rows[i - 1];
                /* The divider marks where the sign flips. It is drawn from the data rather than
                   placed by hand, so it moves if a rebuild moves the boundary. */
                const flip = prev && prev.scope_audit.beat_climatology === true
                  && c.scope_audit.beat_climatology !== true;
                return (
                  <React.Fragment key={c.key}>
                    {flip ? (
                      <tr data-skill-divider>
                        <td colSpan={9} style={{
                          padding: "8px 10px", color: "var(--neg)",
                          borderTop: "1px dashed var(--neg)",
                          borderBottom: "1px dashed var(--neg)",
                          letterSpacing: ".5px",
                        }}>
                          ↓ BELOW THIS LINE NO CONTRACT BEAT CLIMATOLOGY — the scoped gate
                          refuses {h.caught} of them, the archive-wide gate refused {h.caughtBefore}
                        </td>
                      </tr>
                    ) : null}
                    <ContractRow c={c} highlight={c.key === anchor} />
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ---- PER CONTRACT --------------------------------------------------------------- */}
        <Head>EVERY CONTRACT, IN FULL</Head>
        <div style={{ display: "grid", gap: "var(--sp-4)",
          gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
          {rows.map((c) => (
            <ContractCard key={c.key} c={c} highlight={c.key === anchor}
              onClearAnchor={onClearAnchor} />
          ))}
        </div>

        {/* ---- PROVENANCE ----------------------------------------------------------------- */}
        <Head>PROVENANCE</Head>
        <Row k="backtest built" v={<span style={MONO}>{cal.provenance.backtest_built_utc}</span>} />
        {/* The two dates side by side. The backtest is an expensive replay on its own cadence
            and the archive appends four times a day, so a calibration is always measured on a
            record at least slightly older than the one being queried. Saying how much older is
            cheap; letting a reader assume they are the same date is not. */}
        <Row k="archive as of" v={<span style={MONO}>
          {cal.provenance.archive_as_of}
          {agedDays(cal) !== null ? (
            <span style={{ color: agedDays(cal) > 90 ? "var(--warn)" : "var(--text-2)" }}>
              {" "}· {agedDays(cal)} day{agedDays(cal) === 1 ? "" : "s"} after the backtest
            </span>
          ) : null}
        </span>} />
        <Row k="backtest sha256" v={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)" }}>
          {cal.provenance.backtest_sha256}</span>} />
        <Row k="methodology version"
          v={<span style={MONO}>{cal.provenance.methodology_version}</span>} />
        <Row k="processing version"
          v={<span style={MONO}>{cal.provenance.processing_version}</span>} />
        <Row k="source" v={<span style={MONO}>{cal.provenance.source}</span>} />
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          lineHeight: "var(--lh-body)", marginTop: "var(--sp-3)" }}>
          Nothing on this page is computed in the browser. Every score is the archive's own,
          projected from the run named above, and a CI gate rebuilds this file from that run and
          compares it byte for byte.
        </div>
      </div>
    </div>
  );
}

const BTN = {
  ...MONO, fontSize: "var(--fs-mono-xs)", padding: "5px 10px", background: "transparent",
  border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
  color: "var(--text-2)", cursor: "pointer", whiteSpace: "nowrap",
};

function Card({ stat, label, note, tone }) {
  return (
    <div style={{ border: "1px solid var(--border-dim)",
      borderLeft: `var(--bw-signal) solid ${TONE[tone]}`,
      borderRadius: "var(--radius-sm)", padding: "var(--sp-4) var(--sp-5)",
      background: "var(--surface-card)" }}>
      <div style={{ ...MONO, fontSize: "var(--fs-stat)", fontWeight: 800, lineHeight: 1,
        color: TONE[tone] }}>{stat}</div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-1)",
        letterSpacing: "var(--track-label)", marginTop: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 5 }}>{note}</div>
    </div>
  );
}

function ContractRow({ c, highlight }) {
  const a = c.scope_audit;
  const v = VERDICT[stateOf(c)] || { label: a.verdict, tone: "warn" };
  const cell = { padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap",
    borderTop: "1px solid var(--border-dim)" };
  return (
    <tr data-contract-row={c.key} style={highlight
      ? { background: "color-mix(in srgb, var(--accent) 10%, transparent)" } : undefined}>
      <td style={{ ...cell, textAlign: "left", color: "var(--text-1)" }}>{c.key}</td>
      <td style={{ ...cell, color: a.beat_climatology === true ? "var(--text-1)" : "var(--warn)" }}>
        {c.n_events === null || c.n_events === undefined ? "—" : c.n_events.toLocaleString()}
      </td>
      <td style={{ ...cell, color: a.refused_by_gate ? "var(--warn)" : "var(--text-2)" }}>
        {a.scope_events === undefined ? "—" : a.scope_events.toLocaleString()}
      </td>
      <td style={{ ...cell, color: "var(--text-2)" }}>{a.archive_events.toLocaleString()}</td>
      <td style={{ ...cell, color: "var(--text-2)" }}>{fmt(c.brier)}</td>
      <td style={{ ...cell, color: "var(--text-2)" }}>{fmt(c.brier_climatology)}</td>
      <td style={{ ...cell, color: skillTone(c.skill) }}>
        {c.skill === null || c.skill === undefined ? "—"
          : `${c.skill > 0 ? "+" : ""}${c.skill.toFixed(3)}`}
      </td>
      <td style={{ ...cell, width: 96 }}><SkillBar skill={c.skill} /></td>
      <td style={{ ...cell, color: TONE[v.tone] }}>{v.label}</td>
    </tr>
  );
}

/* Zero is the axis, not the left edge. A skill bar that grew from the left would make -0.17 and
   +0.05 look like different amounts of the same thing. */
function SkillBar({ skill }) {
  if (skill === null || skill === undefined || !Number.isFinite(skill)) {
    return <span style={{ color: "var(--text-2)" }}>—</span>;
  }
  const clamped = Math.max(-1, Math.min(1, skill));
  const half = 46;
  const w = Math.abs(clamped) * half;
  return (
    <span style={{ position: "relative", display: "inline-block", width: half * 2, height: 8,
      background: "var(--surface-sunken)", borderRadius: 1, verticalAlign: "middle" }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, left: half, width: 1,
        background: "var(--border-strong)" }} />
      <span style={{
        position: "absolute", top: 0, bottom: 0, width: Math.max(w, 1),
        left: clamped >= 0 ? half : half - w,
        background: clamped >= 0 ? "var(--pos)" : "var(--neg)",
      }} />
    </span>
  );
}

function ContractCard({ c, highlight, onClearAnchor }) {
  const a = c.scope_audit;
  const v = VERDICT[stateOf(c)] || { label: a.verdict, tone: "warn", short: "" };
  return (
    <div data-contract={c.key} style={{
      border: highlight ? "1px solid var(--accent)" : "1px solid var(--border-dim)",
      borderLeft: `var(--bw-signal) solid ${TONE[v.tone]}`,
      borderRadius: "var(--radius-sm)", padding: "var(--sp-4) var(--sp-5)",
      background: "var(--surface-card)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: "var(--sp-3)" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-1)" }}>
          {c.key}
        </span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800,
          color: TONE[v.tone], whiteSpace: "nowrap" }}>{v.label}</span>
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 2 }}>
        {c.definition}
      </div>

      <div style={{ display: "flex", gap: "var(--sp-5)", marginTop: "var(--sp-4)",
        alignItems: "flex-start" }}>
        <Reliability bins={c.reliability} tone={TONE[v.tone]} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Line k="events / forecasts" v={`${num(c.n_events)} / ${num(c.n_forecasts)}`} />
          <Line k="refused by sample gate" v={num(c.n_refused)} />
          <Line k="empirical base rate" v={pct(c.base_rate)} />
          <Line k="Brier" v={fmt(c.brier)} />
          <Line k="climatology" v={fmt(c.brier_climatology)} />
          <Line k="skill" v={c.skill === null ? "—"
            : `${c.skill > 0 ? "+" : ""}${c.skill.toFixed(3)}`} tone={skillTone(c.skill)} />
          <Line k={`events ${a.scope || "in scope"}`}
            v={`${num(a.scope_events)} / ${a.required} needed`}
            tone={a.refused_by_gate ? "var(--warn)" : undefined} />
          <Line k="archive-wide events" v={`${num(a.archive_events)} / ${a.required} needed`} />
          <Line k="refused by the gate" v={a.refused_by_gate ? "YES" : "no"}
            tone={a.refused_by_gate ? "var(--warn)" : undefined} />
          <Line k="under the archive-wide gate" v={a.refused_by_archive_wide_gate ? "refused" : "allowed"}
            tone={a.corrected ? "var(--neg)" : undefined} />
        </div>
      </div>

      {/* The audit note, verbatim from the emitter, in the row it belongs to. */}
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", lineHeight: "var(--lh-body)",
        marginTop: "var(--sp-3)", color: TONE[v.tone] }}>
        {a.note}
      </div>

      {/* WHAT THE OLD GATE SAID, kept on the contracts the correction moved. This is the
          record of the defect, and it stays on the live surface rather than in an appendix:
          the ledger caught this, and a reader is entitled to see that it did. */}
      {a.corrected ? (
        <div data-corrected style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
          lineHeight: "var(--lh-body)", marginTop: "var(--sp-3)",
          borderTop: "1px dashed var(--border-strong)", paddingTop: "var(--sp-3)",
          color: "var(--text-2)" }}>
          <strong style={{ color: "var(--neg)" }}>UNDER THE ARCHIVE-WIDE GATE:</strong>{" "}
          {a.note_archive_wide}
        </div>
      ) : null}

      {highlight ? (
        <button type="button" onClick={onClearAnchor} style={{ ...BTN, marginTop: "var(--sp-3)" }}>
          CLEAR HIGHLIGHT
        </button>
      ) : null}
    </div>
  );
}

/* The reliability curve. Perfect calibration is the diagonal; a dot's area is the number of
   forecasts behind it, so a curve that wanders in its top bins visibly does so on almost no
   evidence. Bins with no forecasts were dropped by the emitter -- drawing one would put a mark
   on the curve where nothing was measured. */
function Reliability({ bins, tone }) {
  const S = 104;
  const pad = 8;
  const x = (p) => pad + p * (S - 2 * pad);
  const y = (p) => S - pad - p * (S - 2 * pad);
  const maxN = Math.max(1, ...bins.map((b) => b.n));

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img"
      aria-label="reliability curve: predicted against observed"
      style={{ flex: "none", background: "var(--surface-sunken)",
        borderRadius: "var(--radius-sm)" }}>
      <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)}
        stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 2" />
      {bins.length > 1 ? (
        <polyline fill="none" stroke={tone} strokeWidth="1" opacity="0.55"
          points={bins.map((b) => `${x(b.predicted)},${y(b.observed)}`).join(" ")} />
      ) : null}
      {bins.map((b, i) => (
        <circle key={i} cx={x(b.predicted)} cy={y(b.observed)}
          r={2 + 3.2 * Math.sqrt(b.n / maxN)} fill={tone} opacity="0.85">
          <title>{`predicted ${(100 * b.predicted).toFixed(1)}% · observed `
            + `${(100 * b.observed).toFixed(1)}% · n ${b.n}`}</title>
        </circle>
      ))}
      {bins.length === 0 ? (
        <text x={S / 2} y={S / 2} textAnchor="middle" fill="var(--text-2)"
          fontSize="8" fontFamily="var(--font-mono)">NOT SCORED</text>
      ) : null}
    </svg>
  );
}

function Line({ k, v, tone }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)",
      ...MONO, fontSize: "var(--fs-mono-xs)", padding: "1px 0" }}>
      <span style={{ color: "var(--text-2)", letterSpacing: "var(--track-label)" }}>{k}</span>
      <span style={{ color: tone || "var(--text-1)" }}>{v}</span>
    </div>
  );
}

/** How far the archive has moved since the backtest was run. Null when either date is absent. */
function agedDays(cal) {
  const a = Date.parse(cal.provenance.backtest_built_utc);
  const b = Date.parse(`${cal.provenance.archive_as_of}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function skillTone(s) {
  if (s === null || s === undefined) return "var(--text-2)";
  return s > 0 ? "var(--pos)" : "var(--neg)";
}
/* Four decimals hides the contracts that matter most. Hawaii hurricane landfall has a Brier of
   1.0e-3 against a climatology of 3.2e-5 -- both print as "0.0000" at fixed precision, and a
   reader comparing them sees two identical numbers where the record holds a factor of thirty.
   Small values switch to a significant-figure form instead. */
function fmt(x) {
  if (x === null || x === undefined) return "—";
  if (x === 0) return "0";
  return Math.abs(x) < 1e-3 ? x.toExponential(1) : x.toFixed(4);
}
function num(x) { return x === null || x === undefined ? "—" : x.toLocaleString(); }
function pct(x) { return x === null || x === undefined ? "—" : `${(100 * x).toFixed(2)}%`; }
