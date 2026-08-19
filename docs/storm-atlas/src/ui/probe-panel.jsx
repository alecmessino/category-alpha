/* WHAT FORMED HERE, AND WHERE DID IT GO?
 *
 * The reader clicks open water; this is the answer. It is the archive's own analog query, run
 * in the browser at proven parity with the Python, and it publishes exactly what that query
 * publishes unconditionally: the pool, the effective sample size, the counts, and every gap the
 * archive recorded about them.
 *
 * WHAT IT DOES NOT PUBLISH, AND SAYS SO. No probability, no Wilson interval, no skill number.
 * Those are conditioned rates, and this build has not yet proven its port of them against the
 * archive. Publishing them anyway -- as a division the browser could obviously do -- is exactly
 * the drift the parity gate exists to prevent, so the panel shows the refusal instead. A
 * numerator over a denominator is not a rate; it is the evidence a rate would be computed from,
 * and the archive returns it whether or not the sample earns a rate.
 *
 * EVERY REFUSAL HERE IS SET AS A CAVEAT, NOT AS AN ALERT. The status wording is the engine's own
 * string and the mark beside it is defined once, in the Epistemic Key at the foot of the panel.
 * A refusal a reader has learned to skip is a refusal that failed.
 */

import React from "react";
import { CATEGORY_COLOR, CATEGORY_ORDER } from "../render/palette.js";
import { formatPosition } from "../engine/geo.js";
import {
  Capt, Chip, Drv, Figure, Gap, Head, MONO, Masthead, Note, Num, OverDenom, Refusal, Row,
  TextButton, Txt, claimText,
} from "./kit.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

const RADII = [250, 500, 800, 1200];

export function ProbePanel({ probe, result, onRadius, onClose, onSelectStorm, onShowPathway,
  pathwayOn, peak, spec }) {
  if (!probe || !result) return null;
  const r = result;
  const n = r.n_cases;
  const span = seasonSpan(r.cases);

  const loc = (
    <>
      {formatPosition(probe.lat, probe.lon)}
      <span> · r {probe.radiusKm} km
        {n ? <> · median genesis {medianPosition(r.cases)}</> : null}</span>
    </>
  );

  return (
    <>
      <Masthead kicker="Genesis query" right={<TextButton onClick={onClose}>Clear</TextButton>}
        title="Storms that formed here" loc={loc} spec={spec} />
      <div className="at-pad">
        <RadiusRow probe={probe} onRadius={onRadius} />

        {n === 0 ? <NoAnalogs gaps={r.gaps} /> : (
          <>
            <Head n="01" right={`genesis within ${probe.radiusKm} km`}>Cohort</Head>
            <Figure value={n.toLocaleString()}
              denom={span ? `storms · ${span}` : "storms"} />
            <Capt>Genesis within {probe.radiusKm} km · matched on genesis position only</Capt>
            <Row k="effective sample size"
              title="Kish's ESS. Distance weighting means 40 analogs can carry the information of
                     12; this makes that visible. The sample gate is applied to the RAW count, never
                     to this."
              v={<span><Num value={r.effective_sample_size} digits={1} /><Drv /></span>} />
            <Row k="sample gate" v={
              r.sufficient
                ? <span style={{ ...MONO, color: "var(--pos)" }}>
                    SUFFICIENT · {n} ≥ {r.min_sample}
                  </span>
                : <span style={{ ...MONO, color: "var(--neg)" }}>
                    BELOW SAMPLE · {n} &lt; {r.min_sample}
                  </span>} />
            <Row k="seasons in pool" v={<Txt value={span} />} />
            <Row k="median genesis" v={<Txt value={medianPosition(r.cases)} />} />

            <Head n="02" right="counts, not rates">What they became</Head>
            <Note style={{ marginBottom: 8 }}>
              Distinct storms reaching each threshold, over the storms whose intensity the archive
              actually recorded.
            </Note>
            <div className="at-itable">
              {CATEGORY_ORDER.filter((c) => c !== "td").map((cat) => {
                const cell = r.intensity_counts[cat];
                if (!cell) return null;
                const w = cell.n_storms ? (100 * cell.count) / cell.n_storms : 0;
                return (
                  <React.Fragment key={cat}>
                    <span className="at-lab" style={{ color: CATEGORY_COLOR[cat] }}>
                      {CAT_LABEL[cat]}
                    </span>
                    <span className="at-meas">
                      <i style={{ width: `${w}%`, background: CATEGORY_COLOR[cat] }} />
                      <u style={{ left: `${w}%`, background: CATEGORY_COLOR[cat] }} />
                    </span>
                    <span className="at-val">
                      <b>{cell.count.toLocaleString()}</b><s>/</s><u>{cell.n_storms.toLocaleString()}</u>
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
            {r.intensity_counts.ts && r.intensity_counts.ts.n_unknown > 0 ? (
              <Note style={{ marginTop: 9 }}>
                <b style={{ color: "var(--flag)" }}>
                  {r.intensity_counts.ts.n_unknown} storm(s) are out of every denominator above
                </b> — the archive records no intensity for them. An unknown outcome is not a
                failure to reach a threshold.
              </Note>
            ) : null}

            {Object.keys(r.landfall_counts).length ? (
              <>
                <Head n="03" right="any · ≥64 kt">Where they landed</Head>
                {Object.entries(r.landfall_counts).sort().map(([region, kinds]) => (
                  <div key={region}>
                    <Row k={region.replace(/_/g, " ")} v={
                      <span>
                        <OverDenom n={kinds.any.count} of={kinds.any.n_storms} />
                        <span style={{ color: "var(--t4)" }}> · ≥64 kt </span>
                        <OverDenom n={kinds.hurricane.count} of={kinds.hurricane.n_storms} />
                      </span>} />
                    {["hurricane", "any"].map((kind) => {
                      const u = r.unscoreable[`${region}:${kind}`];
                      if (!u) return null;
                      /* The status is the engine's own string; the suffix qualifies WHICH
                         contract it applies to, which is the only thing the region row does not
                         already say. Nothing here is reworded. */
                      return (
                        <Refusal key={kind} kind="base"
                          status={`${u.status} · ${kind === "hurricane" ? "≥64 KT" : "ANY"}`}>
                          {u.reason} {u.archive_events} event(s) archive-wide, {u.required} needed.
                        </Refusal>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : null}

            <Head n="04" right={
              <Chip active={pathwayOn} onClick={() => onShowPathway(!pathwayOn)}
                style={{ padding: "3px 6px" }}>
                {pathwayOn ? "SHOWN" : "SHOW"}
              </Chip>
            }>Historical pathway frequency</Head>
            <Note>
              {r.track_density.size.toLocaleString()} two-degree cells, each counting the distinct
              storms of this pool that passed through it
              {peak ? <> · busiest cell carries <b>{peak}</b></> : null}.{" "}
              <b style={{ color: "var(--flag)" }}>THIS IS NOT A FORECAST.</b>{" "}
              {claimText("atlas.pathway")}
            </Note>

            <Head n="05" right="withheld">Conditioned rates</Head>
            <Refusal kind="refused" status={r.rates.status}>{r.rates.reason}</Refusal>

            {r.gaps.length ? (
              <>
                <Head n="06">Gaps the archive recorded</Head>
                {r.gaps.map((g, i) => <Gap key={i} text={g} />)}
              </>
            ) : null}

            <Head n="07" right="by weight">The pool</Head>
            <div className="at-pool">
              {r.cases.map((c) => (
                <button key={c.storm_id} type="button" onClick={() => onSelectStorm(c.row)}>
                  <span className="at-nm">{c.name || "UNNAMED"}</span>
                  <span className="at-se">{c.season}</span>
                  <span className="at-ct" style={{
                    color: c.max_category ? CATEGORY_COLOR[c.max_category] : "var(--flag)",
                  }}>{c.max_category ? c.max_category.toUpperCase() : "—"}</span>
                  <span className="at-km">{Math.round(c.distance_km)} km</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function RadiusRow({ probe, onRadius }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
      <span style={{ ...MONO, fontSize: 8.5, letterSpacing: ".9px", color: "var(--t3)" }}>
        RADIUS
      </span>
      {RADII.map((km) => (
        <Chip key={km} active={probe.radiusKm === km} onClick={() => onRadius(km)}>{km} km</Chip>
      ))}
    </div>
  );
}

/* The empty state is a specific message, not a table of zeroes. Rendering "0 / 0" for a query
   that matched nothing invites exactly the misreading this whole surface exists to prevent.
   `NO ANALOGS — 0 STORMS MATCHED` is one of the two statuses that qualify a registry entry
   rather than introducing one: the mark is the key's `unk`, because what is absent here is a
   sample, not a number the archive holds. */
function NoAnalogs({ gaps }) {
  return (
    <>
      <Head n="01">Genesis pool</Head>
      <Refusal kind="unk" status="NO ANALOGS — 0 STORMS MATCHED">
        There is no sample here, so there are no rates. Matching is on{" "}
        <b>GENESIS LOCATION ONLY</b>: where a storm formed, not where it went. A point along a
        common track will usually match nothing, because storms arrive at those positions rather
        than forming there.
      </Refusal>
      <Note style={{ marginTop: 10 }}>
        Widening the radius only if that is a question you actually mean to ask — a wider circle
        answers a different question, it does not find a missing sample.
      </Note>
      {gaps.map((g, i) => <Gap key={i} text={g} />)}
    </>
  );
}

function seasonSpan(cases) {
  if (!cases.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of cases) {
    if (c.season === null) continue;
    if (c.season < lo) lo = c.season;
    if (c.season > hi) hi = c.season;
  }
  return Number.isFinite(lo) ? `${lo} – ${hi}` : null;
}

function medianPosition(cases) {
  if (!cases.length) return null;
  const lat = cases.map((c) => c.genesis_lat).sort((a, b) => a - b);
  const lon = cases.map((c) => c.genesis_lon).sort((a, b) => a - b);
  const mid = (a) => (a.length % 2 ? a[(a.length - 1) / 2]
    : (a[a.length / 2 - 1] + a[a.length / 2]) / 2);
  return formatPosition(mid(lat), mid(lon));
}
