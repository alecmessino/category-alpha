/* WHAT FORMED HERE, AND WHERE DID IT GO?
 *
 * The reader clicks open water; this is the answer. It is the archive's own analog query, run
 * in the browser at proven parity with the Python, and it publishes exactly what that query
 * publishes unconditionally: the pool, the effective sample size, the counts, and every gap the
 * archive recorded about them.
 *
 * WHAT IT PUBLISHES, AND UNDER WHICH RULES. As of Phase 3.1 the conditioned rates are ported
 * and proven at parity, so they appear -- under the same four rules the terminal's Analog Prior
 * panel keeps, because two surfaces of one archive must not disagree about how a rate is shown:
 *
 *   1. NO BARE PERCENTAGE. Every rate renders as count / denominator, the percent, and its 95%
 *      Wilson interval in the same row. A reader who wants only the percent has to ignore the
 *      evidence beside it; they are never given the percent alone.
 *   2. A REFUSED RATE PRINTS THE REFUSAL, with the archive's own reason -- never 0.0%.
 *   3. AN UNSCOREABLE CONTRACT PRINTS `BASE RATE ONLY`. No skill number for it exists anywhere
 *      in this repository to display.
 *   4. THE CONDITIONING NOTE IS REPRODUCED, because a genesis-conditioned rate that does not
 *      say so is a different claim from the one the archive made.
 */

import React from "react";
import { CATEGORY_COLOR, CATEGORY_ORDER } from "../render/palette.js";
import { formatPosition } from "../engine/geo.js";
import { Chip, Gap, Head, MONO, Num, OverDenom, Row, Txt, claimText } from "./kit.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

const RADII = [250, 500, 800, 1200];

export function ProbePanel({ probe, result, onRadius, onClose, onSelectStorm, onShowPathway,
  pathwayOn, peak, pathway, context }) {
  if (!probe || !result) return null;
  const r = result;
  const n = r.n_cases;

  return (
    <div style={{ padding: "var(--sp-5) var(--sp-6) var(--sp-8)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--sp-4)" }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-title)",
            fontWeight: "var(--fw-black)", color: "var(--text-1)", letterSpacing: "-.2px",
            lineHeight: "var(--lh-tight)" }}>
            STORMS THAT FORMED HERE
          </div>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--accent)",
            marginTop: 3 }}>
            {formatPosition(probe.lat, probe.lon)}
          </div>
        </div>
        <button type="button" onClick={onClose} style={{
          ...MONO, fontSize: "var(--fs-mono-sm)", background: "transparent",
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
          color: "var(--text-2)", cursor: "pointer", padding: "3px 7px", flex: "none",
        }}>✕</button>
      </div>

      <div style={{ display: "flex", gap: 4, marginTop: "var(--sp-5)", alignItems: "center" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          marginRight: 2 }}>RADIUS</span>
        {RADII.map((km) => (
          <Chip key={km} active={probe.radiusKm === km} onClick={() => onRadius(km)}>
            {km} km
          </Chip>
        ))}
      </div>

      {n === 0 ? <NoAnalogs probe={probe} gaps={r.gaps} /> : (
        <>
          <Head>GENESIS POOL</Head>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)" }}>
            <span style={{ ...MONO, fontSize: "var(--fs-stat)", fontWeight: 800,
              color: "var(--text-1)", lineHeight: 1 }}>{n}</span>
            <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-2)" }}>
              storms formed within {probe.radiusKm} km
            </span>
          </div>
          <Row k="effective sample size"
            title="Kish's ESS. Distance weighting means 40 analogs can carry the information of
                   12; this makes that visible. The sample gate is applied to the RAW count, never
                   to this."
            v={<Num value={r.effective_sample_size} digits={1} />} />
          <Row k="sample gate" v={
            r.sufficient
              ? <span style={{ ...MONO, color: "var(--pos)" }}>
                  SUFFICIENT · {n} ≥ {r.min_sample}
                </span>
              : <span style={{ ...MONO, color: "var(--neg)" }}>
                  BELOW SAMPLE · {n} &lt; {r.min_sample}
                </span>} />
          <Row k="seasons in pool" v={<Txt value={seasonSpan(r.cases)} />} />
          <Row k="median genesis" v={<Txt value={medianPosition(r.cases)} />} />

          <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
            color: "var(--text-2)" }}>count · rate · 95% Wilson</span>}>WHAT THEY BECAME</Head>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            lineHeight: "var(--lh-body)", marginBottom: "var(--sp-3)" }}>
            Distinct storms reaching each threshold, over the storms whose intensity the archive
            actually recorded.
          </div>
          {CATEGORY_ORDER.filter((c) => c !== "td").map((cat) => {
            const cell = r.intensity[cat];
            if (!cell) return null;
            return (
              <div key={cat} style={{ padding: "3px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                  <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
                    color: CATEGORY_COLOR[cat], width: 128, flex: "none" }}>
                    {CAT_LABEL[cat]}
                  </span>
                  <div style={{ flex: 1, height: 4, background: "var(--surface-sunken)",
                    borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      width: cell.n_storms ? `${(100 * cell.count) / cell.n_storms}%` : 0,
                      height: "100%", background: CATEGORY_COLOR[cat], opacity: 0.65,
                    }} />
                  </div>
                  <span style={{ width: 62, textAlign: "right", flex: "none" }}>
                    <OverDenom n={cell.count} of={cell.n_storms} />
                  </span>
                </div>
                <RateLine cell={cell} />
              </div>
            );
          })}
          {r.intensity.ts && r.intensity.ts.n_unknown > 0 ? (
            <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)",
              marginTop: "var(--sp-3)", lineHeight: "var(--lh-body)" }}>
              {r.intensity.ts.n_unknown} storm(s) are out of every denominator above —
              the archive records no intensity for them. An unknown outcome is not a failure to
              reach a threshold.
            </div>
          ) : null}

          {Object.keys(r.landfall).length ? (
            <>
              <Head>WHERE THEY LANDED</Head>
              {Object.entries(r.landfall).sort().map(([region, kinds]) => (
                <div key={region}>
                  <Row k={region.replace(/_/g, " ")} v={
                    <span>
                      <OverDenom n={kinds.any.count} of={kinds.any.n_storms} />
                      <span style={{ color: "var(--text-2)" }}> · ≥64 kt </span>
                      <OverDenom n={kinds.hurricane.count} of={kinds.hurricane.n_storms} />
                    </span>} />
                  <div style={{ paddingLeft: "var(--sp-4)" }}>
                    <RateLine cell={kinds.any} label="any" />
                    <RateLine cell={kinds.hurricane} label="≥64 kt" />
                  </div>
                  {["any", "hurricane"].map((kind) => {
                    const u = r.unscoreable[`${region}:${kind}`];
                    if (!u) return null;
                    return (
                      <div key={kind} style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
                        color: "var(--neg)", paddingLeft: "var(--sp-4)",
                        lineHeight: "var(--lh-body)", marginBottom: 3 }}>
                        <strong>{u.status}</strong> ({kind === "hurricane" ? "≥64 kt" : "any"}) —{" "}
                        {u.archive_events} event(s) archive-wide, {u.required} needed.
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          ) : null}

          <Head right={
            <Chip active={pathwayOn} onClick={() => onShowPathway(!pathwayOn)}>
              {pathwayOn ? "SHOWN" : "SHOW"}
            </Chip>
          }>HISTORICAL PATHWAY FREQUENCY</Head>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            lineHeight: "var(--lh-body)" }}>
            {(pathway ? pathway.size : 0).toLocaleString()} two-degree cells, each counting the
            distinct storms of this cohort that passed through it
            {peak ? <> · busiest cell carries {peak}</> : null}.
            <div style={{ color: "var(--warn)", marginTop: 4 }}>
              THIS IS NOT A FORECAST. {claimText("atlas.pathway")}
            </div>
          </div>

          {hasTimes(r.time_to_event) ? (
            <>
              <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
                color: "var(--text-2)" }}>hours from genesis</span>}>HOW LONG IT TOOK</Head>
              {Object.entries(r.time_to_event).map(([key, d]) => {
                if (!d || !d.n) return null;
                return (
                  <Row key={key} k={key.replace("landfall_", "landfall · ").replace(/_/g, " ")}
                    v={<span style={{ ...MONO }}>
                      {Math.round(d.median)} h
                      <span style={{ color: "var(--text-2)" }}>
                        {" "}· p25 {Math.round(d.p25)} · p75 {Math.round(d.p75)} · n {d.n}
                      </span>
                    </span>} />
                );
              })}
            </>
          ) : null}

          {/* RULE 4: the conditioning note travels with the numbers rather than being written
              into the page, so it cannot drift away from what it qualifies. */}
          <Head>WHAT THESE RATES ASSUME</Head>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            lineHeight: "var(--lh-body)" }}>
            {claimText("atlas.rates")}
          </div>

          {r.gaps.length ? (
            <>
              <Head>GAPS THE ARCHIVE RECORDED</Head>
              {r.gaps.map((g, i) => <Gap key={i} text={g} />)}
            </>
          ) : null}

          <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
            color: "var(--text-2)" }}>by weight</span>}>THE POOL</Head>
          <div style={{ maxHeight: 260, overflowY: "auto", marginRight: "calc(-1 * var(--sp-3))",
            paddingRight: "var(--sp-3)" }}>
            {r.cases.map((c) => (
              <button key={c.storm_id} type="button" onClick={() => onSelectStorm(c.row)}
                style={{
                  display: "flex", width: "100%", gap: "var(--sp-3)", alignItems: "baseline",
                  padding: "3px 0", background: "transparent", border: 0,
                  borderTop: "1px solid var(--border-dim)", cursor: "pointer", textAlign: "left",
                }}>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-1)",
                  flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name || "UNNAMED"}
                </span>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
                  {c.season}
                </span>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", width: 46,
                  textAlign: "right",
                  color: c.max_category ? CATEGORY_COLOR[c.max_category] : "var(--warn)" }}>
                  {c.max_category ? c.max_category.toUpperCase() : "—"}
                </span>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", width: 54,
                  textAlign: "right", color: "var(--text-2)" }}>
                  {Math.round(c.distance_km)} km
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* The empty state is a specific message, not a table of zeroes. Rendering "0 / 0" for a query
   that matched nothing invites exactly the misreading this whole surface exists to prevent. */
function NoAnalogs({ probe, gaps }) {
  return (
    <div style={{ marginTop: "var(--sp-6)" }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--warn)",
        letterSpacing: ".5px", marginBottom: "var(--sp-4)" }}>
        [ NO ANALOGS — 0 STORMS MATCHED ]
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)" }}>
        There is no sample here, so there are no rates.
        <br /><br />
        Matching is on GENESIS LOCATION ONLY: where a storm formed, not where it went. A point
        along a common track will usually match nothing, because storms arrive at those
        positions rather than forming there.
        <br /><br />
        Widening the radius only if that is a question you actually mean to ask — a wider circle
        answers a different question, it does not find a missing sample.
      </div>
      {gaps.map((g, i) => <Gap key={i} text={g} />)}
    </div>
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

/* One rate, under the archive's first panel rule: NEVER A BARE PERCENTAGE.
 *
 * The percent only ever appears beside the interval that qualifies it, and the weighted rate
 * only ever appears with the note that the archive publishes no interval for it. Three states,
 * and the two that are not a rate are the ones that matter most:
 *
 *   - REFUSED by the sample gate -> the archive's own reason, verbatim. Never 0.0%.
 *   - CONDITIONED ON -> the fifth rule fired: this variable defined the cohort, so a rate here
 *     would be 100% because of how the question was asked. The count still shows; the rate
 *     cannot exist.
 */
function RateLine({ cell, label }) {
  if (!cell) return null;
  const pre = label
    ? <span style={{ color: "var(--text-2)" }}>{label} · </span>
    : null;

  if (cell.status === "CONDITIONED ON -- NOT AN OUTCOME") {
    return (
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)",
        lineHeight: "var(--lh-body)", paddingLeft: 132 - (label ? 132 : 0) }}>
        {pre}<strong>CONDITIONED ON</strong> — not an outcome of this cohort
      </div>
    );
  }
  if (cell.rate === null) {
    return (
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--neg)",
        lineHeight: "var(--lh-body)" }}>
        {pre}<strong>RATE REFUSED</strong>
        <span style={{ color: "var(--text-2)" }}> — {cell.refused_reason}</span>
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
      {cell.weighted_rate !== null ? (
        <span title="Distance- and environment-weighted. The archive publishes no interval for
          the weighted rate; the interval to read is the unweighted one beside it.">
          {" "}· weighted {(100 * cell.weighted_rate).toFixed(1)}%
        </span>
      ) : null}
    </div>
  );
}

/** Does any time-to-event series carry a usable sample? An all-empty block is not worth a head. */
function hasTimes(tte) {
  if (!tte) return false;
  for (const d of Object.values(tte)) if (d && d.n) return true;
  return false;
}
