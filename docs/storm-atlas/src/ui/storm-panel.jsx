/* One storm, and its whole life.
 *
 * Every value here is an archive column, a count of archive rows, or a subtraction of two
 * archive timestamps. Where a column is null the panel says so and says why -- a storm whose
 * intensity was never recorded shows an em-dash for its peak, not a zero, and its
 * threshold-crossing rows are absent rather than false.
 *
 * Three distinctions this panel exists to keep visible, because each is a place the archive
 * knows something a prettier panel would flatten:
 *   - OBSERVED vs INTERPOLATED fixes, and the fact that a crossing may never rest on an
 *     interpolated one.
 *   - A landfall the archive DERIVED from geometry versus one a source flagged, and the
 *     Saffir-Simpson class it WITHHELD when the bracketing fixes disagreed.
 *   - Whether any environment was archived near this storm's genesis at all, which for most of
 *     the record is no.
 */

import React from "react";
import { CATEGORY_COLOR } from "../render/palette.js";
import { formatPosition } from "../engine/geo.js";
import { Head, MONO, Num, OverDenom, Row, Txt, claimText, fmtHours, fmtUTC } from "./kit.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

export function StormPanel({ storm, archive, onClose, onReplay, replaying }) {
  if (!storm) return null;
  const s = storm;
  const catColor = s.max_category ? CATEGORY_COLOR[s.max_category] : "var(--text-2)";
  const q = s.quality;

  return (
    <div style={{ padding: "var(--sp-5) var(--sp-6) var(--sp-8)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: "var(--sp-4)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-sans)", fontSize: "var(--fs-hero)",
            fontWeight: "var(--fw-black)", lineHeight: "var(--lh-tight)", color: "var(--text-1)",
            letterSpacing: "-.3px", overflow: "hidden", textOverflow: "ellipsis",
          }}>{s.name || "UNNAMED"}</div>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-2)",
            marginTop: 3 }}>
            {s.season} · {s.basin}{s.genesis_subbasin ? ` / ${s.genesis_subbasin}` : ""} ·{" "}
            {s.atcf_id || s.storm_id}
          </div>
        </div>
        <button type="button" onClick={onClose} title="clear selection" style={{
          ...MONO, fontSize: "var(--fs-mono-sm)", background: "transparent",
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
          color: "var(--text-2)", cursor: "pointer", padding: "3px 7px", flex: "none",
        }}>✕</button>
      </div>

      {s.provisional === true ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)",
          border: "1px solid var(--warn)", borderRadius: "var(--radius-sm)",
          padding: "4px 7px", marginTop: "var(--sp-4)", display: "inline-block" }}>
          PROVISIONAL — this season has not been post-analysed
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--sp-3)", marginTop: "var(--sp-5)" }}>
        <button type="button" onClick={onReplay} style={{
          ...MONO, fontSize: "var(--fs-mono-sm)", padding: "6px 12px",
          border: "1px solid " + (replaying ? "var(--accent)" : "var(--border-strong)"),
          background: replaying ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
          color: replaying ? "var(--accent)" : "var(--text-1)", borderRadius: "var(--radius-sm)",
          cursor: "pointer", letterSpacing: ".5px",
        }}>{replaying ? "❚❚ PAUSE REPLAY" : "▶ REPLAY THIS STORM"}</button>
      </div>

      <Head>GENESIS</Head>
      <Row k="first tropical fix" v={<Txt value={fmtUTC(s.genesis_t)} />}
        title="The archive defines genesis as the first TROPICAL point in the best track." />
      <Row k="position" v={s.genesis_lat === null ? <Txt value={null} />
        : <Txt value={formatPosition(s.genesis_lat, s.genesis_lon)} />} />
      <Row k="first fix of any kind" v={<Txt value={fmtUTC(s.first_track_t)} />}
        title="The best track may begin before genesis, as a disturbance or a low." />
      <Row k="stage at first fix" v={<Txt value={s.first_track_stage} transform="upper" />} />

      <Head>INTENSITY</Head>
      <Row k="peak intensity" v={
        <span>
          <Num value={s.peak_vmax_kt} unit="kt" tone={catColor} />
          {s.max_category
            ? <span style={{ ...MONO, color: catColor, marginLeft: 8 }}>
                {CAT_LABEL[s.max_category]}
              </span>
            : <span style={{ ...MONO, color: "var(--warn)", marginLeft: 8 }}>
                NO INTENSITY RECORDED
              </span>}
        </span>} />
      <Row k="minimum pressure" v={<Num value={s.min_mslp_mb} unit="mb"
        absent="no central pressure was recorded for this storm" />} />
      <Row k="lifetime" v={<Txt value={fmtHours(s.lifetime_hours)} />}
        title="Derived: end of track minus genesis. The archive stores no lifetime column." />
      <Row k="track fixes" v={<Num value={s.track_points} />} />

      <Head>DEVELOPMENT</Head>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        marginBottom: "var(--sp-3)", lineHeight: "var(--lh-body)" }}>
        Hours from genesis to the first fix at or above each threshold. A dash means the storm
        never reached it — not that it happened at hour zero.
      </div>
      {[["ts", "TROPICAL STORM · 34 kt", s.hours_to_ts, false],
        ["cat1", "CATEGORY 1 · 64 kt", s.hours_to_cat1, false],
        ["cat2", "CATEGORY 2 · 83 kt", s.hours_to_cat2, true],
        ["cat3", "CATEGORY 3 · 96 kt", s.hours_to_cat3, false],
        ["cat4", "CATEGORY 4 · 113 kt", s.hours_to_cat4, true],
        ["cat5", "CATEGORY 5 · 137 kt", s.hours_to_cat5, true]].map(([k, label, v, derived]) => (
        <Row key={k} k={label} tone={v === null ? undefined : CATEGORY_COLOR[k]}
          title={derived
            ? "Derived by the Atlas pack by replaying the archive's own crossing rule; the "
              + "archive stores no elapsed-hours column for this threshold."
            : "An archive column."}
          v={<span>
            <Txt value={fmtHours(v)} absent="this storm never reached this threshold" />
            {derived ? <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
              color: "var(--text-2)", marginLeft: 6 }} title="derived, not an archive column">
              ·d</span> : null}
          </span>} />
      ))}
      <Row k="time to peak" v={<Txt value={fmtHours(s.hours_to_peak)} />} />

      <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
        {s.landfalls.length || "none"}
      </span>}>LANDFALL</Head>
      {s.landfalls.length === 0 ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          padding: "var(--sp-3) 0" }}>
          No coastline crossing was detected for this storm in the five modelled regions.
        </div>
      ) : s.landfalls.map((l, i) => <LandfallRow key={i} l={l} />)}

      <Head>ENVIRONMENT</Head>
      <EnvNote storm={s} archive={archive} />

      <Head>DATA QUALITY</Head>
      <Row k="observed fixes" v={<OverDenom n={q.observed} of={q.total} />}
        title="The source published this position and intensity at this time." />
      <Row k="interpolated fixes" tone={q.interpolated ? "var(--warn)" : undefined}
        v={<OverDenom n={q.interpolated} of={q.total} />}
        title="IBTrACS interpolated these; the archive never creates a row of its own." />
      {q.provisional ? <Row k="provisional fixes" tone="var(--warn)"
        v={<OverDenom n={q.provisional} of={q.total} />} /> : null}
      {q.crossings_interpolated_only ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)",
          border: "1px solid var(--warn)", borderRadius: "var(--radius-sm)",
          padding: "5px 7px", marginTop: "var(--sp-3)", lineHeight: "var(--lh-body)" }}>
          THRESHOLD CROSSINGS REST ON INTERPOLATED FIXES — this track carries no observed point,
          so the archive fell back to its interpolated ones and flagged the row
          <span style={{ color: "var(--text-2)" }}> ({s.genesis_source_key})</span>.
        </div>
      ) : null}
      <Row k="track type" v={<Txt value={s.track_type} />} />
      <Row k="storm id" v={<Txt value={s.storm_id} />} />
      <Row k="source" v={<Txt value={s.source_key} />} />
    </div>
  );
}

function LandfallRow({ l }) {
  return (
    <div style={{ borderTop: "1px solid var(--border-dim)", padding: "var(--sp-3) 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)",
        alignItems: "baseline" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-1)" }}>
          {(l.sub_region || l.region || "—").toUpperCase()}
          <span style={{ color: "var(--text-2)" }}> · {l.region}</span>
        </span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)",
          color: l.hurricane_at_landfall === true ? "var(--neg)" : "var(--text-1)" }}>
          <Num value={l.vmax_kt} unit="kt" digits={l.vmax_kt !== null && l.vmax_kt % 1 ? 1 : 0} />
        </span>
      </div>
      <Row k="crossed" v={<Txt value={fmtUTC(l.t)} />} />
      <Row k="position" v={<Txt value={formatPosition(l.lat, l.lon)} />} />
      <Row k="class at landfall" v={
        l.category
          ? <Txt value={l.category} transform="upper" />
          : <span title={"A segment crossing whose bracketing fixes disagreed about the "
              + "Saffir-Simpson class. The archive publishes no class rather than interpolating "
              + "one -- this is the rule that kept Iniki honest."}
              style={{ ...MONO, color: "var(--warn)", cursor: "help" }}>WITHHELD</span>} />
      <Row k="detection" dim v={
        <span>
          <Txt value={l.detection} />
          {l.derived ? <span style={{ ...MONO, color: "var(--warn)", marginLeft: 6 }}
            title="Derived: the great-circle segment between two published fixes crossed the
                   coastline polygon, and the intensity was interpolated between them.">
            DERIVED</span> : null}
        </span>} />
      {l.closest_approach_km !== null ? (
        <Row k="closest published fix" dim
          v={<Num value={l.closest_approach_km} unit="km" digits={1} />} />
      ) : null}
      {l.suspect_relocation === true ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--neg)",
          marginTop: 4 }}>
          SUSPECT RELOCATION — excluded from every rate the archive publishes
          (implied speed <Num value={l.implied_speed_kt} unit="kt" digits={1} />).
        </div>
      ) : null}
    </div>
  );
}

function EnvNote({ storm, archive }) {
  const e = storm.env_at_genesis;
  if (!e || e.row < 0) {
    return (
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        lineHeight: "var(--lh-body)", padding: "var(--sp-3) 0" }}>
        <span style={{ color: "var(--warn)" }}>NO ARCHIVED ENVIRONMENT NEAR GENESIS.</span>{" "}
        The archive holds no environment record within {e ? e.window_hours : 12} hours of this
        storm's genesis. SHIPS begins in 1982 and its developmental file ends in 2023, so most
        of the record has none — {archive.manifest.quality.storms_with_env_at_genesis.toLocaleString()}
        {" "}of {archive.manifest.counts.storms.toLocaleString()} storms do.
      </div>
    );
  }
  return (
    <div>
      <Row k="record near genesis" v={<Txt value={`yes, ${e.dt_hours.toFixed(1)} h away`} />} />
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        lineHeight: "var(--lh-body)", paddingTop: "var(--sp-3)" }}>
        {claimText("atlas.environment")}
      </div>
    </div>
  );
}
