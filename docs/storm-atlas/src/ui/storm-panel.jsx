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
import {
  Capt, Drv, Figure, Head, MONO, Masthead, Note, Num, OverDenom, Refusal, Row, TextButton, Txt,
  claimText, fmtHours, fmtUTC,
} from "./kit.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

export function StormPanel({ storm, archive, onClose, onReplay, replaying, spec }) {
  if (!storm) return null;
  const s = storm;
  const catColor = s.max_category ? CATEGORY_COLOR[s.max_category] : "var(--t2)";
  const q = s.quality;

  const loc = (
    <>
      {s.season} · {s.basin}{s.genesis_subbasin ? ` / ${s.genesis_subbasin}` : ""} ·{" "}
      <span>{s.atcf_id || s.storm_id}</span>
    </>
  );

  return (
    <>
      <Masthead kicker="One storm, whole life"
        right={<TextButton onClick={onClose} title="clear selection">Clear</TextButton>}
        title={s.name || "UNNAMED"} titleClass="storm" loc={loc} spec={spec}>
        {s.provisional === true ? (
          <div style={{ ...MONO, marginTop: 8, fontSize: 9, color: "var(--flag)",
            letterSpacing: ".8px", border: "1px solid #4a3a14", padding: "3px 6px",
            display: "inline-block" }}>
            PROVISIONAL — THIS SEASON HAS NOT BEEN POST-ANALYSED
          </div>
        ) : null}
      </Masthead>

      <div className="at-pad">
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button type="button" onClick={onReplay}
            className={replaying ? "at-tbtn at-wide at-on" : "at-tbtn at-wide"}>
            {replaying ? "❚❚ PAUSE REPLAY" : "▶ REPLAY THIS STORM"}
          </button>
        </div>

        <Head n="01">Genesis</Head>
        <Row k="first tropical fix" v={<Txt value={fmtUTC(s.genesis_t)} />}
          title="The archive defines genesis as the first TROPICAL point in the best track." />
        <Row k="position" v={s.genesis_lat === null ? <Txt value={null} />
          : <Txt value={formatPosition(s.genesis_lat, s.genesis_lon)} />} />
        <Row k="first fix of any kind" v={<Txt value={fmtUTC(s.first_track_t)} />}
          title="The best track may begin before genesis, as a disturbance or a low." />
        <Row k="stage at first fix" v={<Txt value={s.first_track_stage} transform="upper" />} />

        <Head n="02" right={s.max_category ? s.max_category.toUpperCase() : "no class"}>
          Intensity
        </Head>
        <Figure tone={catColor}
          value={s.peak_vmax_kt === null ? "—" : Math.round(s.peak_vmax_kt).toLocaleString()}
          denom={s.peak_vmax_kt === null
            ? "NO INTENSITY RECORDED"
            : <>kt peak · {CAT_LABEL[s.max_category] || "no class"}</>} />
        <Capt>
          Peak of the recorded fixes · <OverDenom n={q.observed} of={q.total} /> observed
        </Capt>
        <Row k="minimum pressure" v={<Num value={s.min_mslp_mb} unit="mb"
          absent="no central pressure was recorded for this storm" />} />
        <Row k="lifetime" v={<span><Txt value={fmtHours(s.lifetime_hours)} /><Drv
          title="Derived: end of track minus genesis. The archive stores no lifetime column." /></span>}
          title="Derived: end of track minus genesis. The archive stores no lifetime column." />
        <Row k="track fixes" v={<Num value={s.track_points} />} />

        <Head n="03" right="hours from genesis">Intensification</Head>
        <Note style={{ marginBottom: 6 }}>
          A dash means the storm <b>never reached</b> the threshold — not that it happened at
          hour zero.
        </Note>
        {[["ts", "TROPICAL STORM · 34 kt", s.hours_to_ts, false],
          ["cat1", "CATEGORY 1 · 64 kt", s.hours_to_cat1, false],
          ["cat2", "CATEGORY 2 · 83 kt", s.hours_to_cat2, true],
          ["cat3", "CATEGORY 3 · 96 kt", s.hours_to_cat3, false],
          ["cat4", "CATEGORY 4 · 113 kt", s.hours_to_cat4, true],
          ["cat5", "CATEGORY 5 · 137 kt", s.hours_to_cat5, true]].map(([k, label, v, derived]) => (
          <Row key={k} k={label} dim={v === null} tone={v === null ? undefined : CATEGORY_COLOR[k]}
            title={derived
              ? "Derived by the Atlas pack by replaying the archive's own crossing rule; the "
                + "archive stores no elapsed-hours column for this threshold."
              : "An archive column."}
            v={<span>
              <Txt value={fmtHours(v)} absent="this storm never reached this threshold" />
              {derived ? <Drv /> : null}
            </span>} />
        ))}
        <Row k="time to peak" v={<Txt value={fmtHours(s.hours_to_peak)} />} />

        <Head n="04" right={String(s.landfalls.length || "none")}>Landfall</Head>
        {s.landfalls.length === 0 ? (
          <Note>
            No coastline crossing was detected for this storm in the five modelled regions.
          </Note>
        ) : s.landfalls.map((l, i) => <LandfallGroup key={i} l={l} />)}

        <Head n="05" right={`±${archive.manifest.env_genesis_window_hours} h of genesis`}>
          Environment
        </Head>
        <EnvNote storm={s} archive={archive} />

        <Head n="06">Data quality</Head>
        <Row k="observed fixes" v={<OverDenom n={q.observed} of={q.total} />}
          title="The source published this position and intensity at this time." />
        <Row k="interpolated fixes" tone={q.interpolated ? "var(--flag)" : undefined}
          v={<OverDenom n={q.interpolated} of={q.total} />}
          title="IBTrACS interpolated these; the archive never creates a row of its own." />
        {q.provisional ? <Row k="provisional fixes" tone="var(--flag)"
          v={<OverDenom n={q.provisional} of={q.total} />} /> : null}
        {q.crossings_interpolated_only ? (
          <Note style={{ marginTop: 7 }}>
            <b style={{ color: "var(--flag)" }}>
              THRESHOLD CROSSINGS REST ON INTERPOLATED FIXES
            </b> — this track carries no observed point, so the archive fell back to its
            interpolated ones and flagged the row ({s.genesis_source_key}).
          </Note>
        ) : null}
        <Row k="track type" dim v={<Txt value={s.track_type} />} />
        <Row k="storm id" dim v={<Txt value={s.storm_id} />} />
        <Row k="source" dim v={<Txt value={s.source_key} />} />
      </div>
    </>
  );
}

function LandfallGroup({ l }) {
  return (
    <div className="at-grp">
      <Row k={(l.sub_region || l.region || "—").replace(/_/g, " ")}
        tone={l.hurricane_at_landfall === true ? "var(--neg)" : undefined}
        v={<Num value={l.vmax_kt} unit="kt"
          digits={l.vmax_kt !== null && l.vmax_kt % 1 ? 1 : 0}
          absent="no wind was recorded at the crossing fix" />} />
      <Row k="region" dim v={<Txt value={l.region} />} />
      <Row k="crossed" v={<Txt value={fmtUTC(l.t)} />} />
      <Row k="position" v={<Txt value={formatPosition(l.lat, l.lon)} />} />
      <Row k="class at landfall" v={
        l.category
          ? <Txt value={l.category} transform="upper" />
          : <span title={"A segment crossing whose bracketing fixes disagreed about the "
              + "Saffir-Simpson class. The archive publishes no class rather than interpolating "
              + "one -- this is the rule that kept Iniki honest."}
              style={{ ...MONO, color: "var(--flag)", cursor: "help" }}>WITHHELD</span>} />
      <Row k="detection" dim v={
        <span>
          <Txt value={l.detection} />
          {l.derived ? <span style={{ ...MONO, color: "var(--flag)", marginLeft: 6 }}
            title="Derived: the great-circle segment between two published fixes crossed the
                   coastline polygon, and the intensity was interpolated between them.">
            DERIVED</span> : null}
        </span>} />
      {l.closest_approach_km !== null ? (
        <Row k="closest published fix" dim
          v={<Num value={l.closest_approach_km} unit="km" digits={1} />} />
      ) : null}
      {/* The archive's own withheld class, set as the refusal it is. The mark is the key's
          `notev` -- a ruled-out cell -- because this is a value the archive could have
          interpolated and declined to. */}
      {l.category ? null : (
        <Refusal kind="notev">
          The bracketing fixes disagreed about the Saffir-Simpson class at this crossing, so the
          archive publishes <b>no class at all</b> rather than a plausible one. The wind and the
          position above are the crossing's own; only the class is withheld.
        </Refusal>
      )}
      {l.suspect_relocation === true ? (
        <Note style={{ color: "var(--neg)", marginTop: 4 }}>
          SUSPECT RELOCATION — excluded from every rate the archive publishes (implied speed{" "}
          <Num value={l.implied_speed_kt} unit="kt" digits={1} />).
        </Note>
      ) : null}
    </div>
  );
}

function EnvNote({ storm, archive }) {
  const e = storm.env_at_genesis;
  if (!e || e.row < 0) {
    return (
      <Refusal kind="unk">
        The archive holds no environment record within {e ? e.window_hours : 12} hours of this
        storm's genesis. SHIPS begins in 1982 and its developmental file ends in 2023, so most of
        the record has none — <b>
          {archive.manifest.quality.storms_with_env_at_genesis.toLocaleString()} of{" "}
          {archive.manifest.counts.storms.toLocaleString()}
        </b> storms do.
      </Refusal>
    );
  }
  return (
    <>
      <Row k="record near genesis" v={<Txt value={`yes, ${e.dt_hours.toFixed(1)} h away`} />} />
      <Refusal kind="cond">{claimText("atlas.environment")}</Refusal>
    </>
  );
}
