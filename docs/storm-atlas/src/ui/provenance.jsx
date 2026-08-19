/* Where every number on this screen came from.
 *
 * The archive's provenance discipline is not a footnote on this product, it is the product, so
 * this drawer is one keystroke away rather than buried: the sources and their hashes, the two
 * versions that govern what is shown, every gap the archive recorded about its own inputs, the
 * columns it holds that carry no data, and the two places the Atlas itself made a choice --
 * the coordinate quantisation and the line decimation.
 *
 * Nothing here is written by hand. Every value is read from the pack the browser loaded.
 */

import React from "react";
import { Gap, Head, MONO, Row, Txt } from "./kit.jsx";

export function ProvenanceDrawer({ archive, open, onClose, frame }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  return (
    <aside
      aria-hidden={!open}
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "92vw",
        background: "var(--surface-card)", borderLeft: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-cmd)", zIndex: 1200, overflowY: "auto",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform var(--dur-drawer)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "var(--pad-panel-hd)", borderBottom: "1px solid var(--border-dim)",
        position: "sticky", top: 0, background: "var(--surface-sunken)", zIndex: 1 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-label)",
          fontWeight: "var(--fw-bold)", letterSpacing: "var(--track-caps)",
          textTransform: "uppercase", color: "var(--accent)" }}>PROVENANCE</span>
        <button type="button" onClick={onClose} style={{
          ...MONO, fontSize: "var(--fs-mono-sm)", background: "transparent",
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
          color: "var(--text-2)", cursor: "pointer", padding: "3px 7px",
        }}>ESC</button>
      </div>

      <div style={{ padding: "0 var(--sp-6) var(--sp-8)" }}>
        <Head>VERSIONS</Head>
        <Row k="methodology" v={<Txt value={m.methodology_version} />}
          title="Which definitions turn rows into a published number: the refusal gates, the
                 analog weighting, the interval, the effective sample size. The browser declares
                 the same constant as the archive, and scripts/test-atlas-parity.mjs fails the
                 build if they disagree." />
        <Row k="processing" v={<Txt value={m.processing_version} />}
          title="Which code turned source bytes into archive rows." />
        <Row k="pack format" v={<Txt value={String(m.pack_format)} />} />
        <Row k="archive stamp" v={<Txt value={p.archive_stamp} />}
          title="A hash of every table this pack was built from. It replaces a build timestamp
                 so an unchanged archive produces an unchanged pack." />
        <Row k="archive built" v={<Txt value={p.archive_built_utc} />} />

        <Head>WHAT IS LOADED</Head>
        {Object.entries(m.counts).map(([k, v]) => (
          <Row key={k} k={k.replace(/_/g, " ")} v={v.toLocaleString()} />
        ))}
        <Row k="observed fixes" v={m.quality.track_points.observed.toLocaleString()} />
        <Row k="interpolated fixes" tone="var(--warn)"
          v={m.quality.track_points.interpolated.toLocaleString()}
          title="Interpolated by IBTrACS, not by this archive. An interpolated point may never
                 establish a threshold crossing." />
        <Row k="storms with env near genesis"
          v={`${m.quality.storms_with_env_at_genesis.toLocaleString()} of ${m.counts.storms.toLocaleString()}`}
          title={`An environment record within ${m.env_genesis_window_hours} h of genesis. SHIPS
                  begins in 1982 and its developmental file ends in 2023.`} />
        <Row k="landfalls with a withheld class" tone="var(--warn)"
          v={m.quality.landfall_category_withheld.toLocaleString()}
          title="Segment crossings whose bracketing fixes disagreed about the Saffir-Simpson
                 class. The archive publishes none rather than interpolating one." />

        <Head>SOURCES</Head>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--text-2)", lineHeight: "var(--lh-body)", marginBottom: "var(--sp-3)" }}>
          The official files the archive was built from. Their own hashes are recorded in the
          archive's manifest; what this pack vouches for directly is the sha256 of each table it
          read, below.
        </div>
        {(p.archive_sources || []).map((s) => (
          <Row key={s} k={s} v="" dim />
        ))}
        {Object.entries(p.table_sha256 || {}).map(([t, v]) => (
          <Row key={t} k={`${t}.parquet`} v={<Txt value={v.sha256.slice(0, 16)} />} />
        ))}

        <Head>WHAT THIS SURFACE CHOSE</Head>
        <Row k="track geometry" v={<Txt value={`${m.track_geometry.quantised_to_deg}°`} />}
          title={m.track_geometry.note} />
        <Row k="worst deviation"
          v={<Txt value={`${m.track_geometry.max_deviation_deg.toExponential(1)}°`} />}
          title="Measured, not assumed. Genesis, crossing and landfall coordinates are carried
                 at full float64 and are not quantised at all." />
        {frame ? (
          <>
            <Row k="line decimation"
              v={<Txt value={frame.stride > 1 ? `every ${frame.stride}th fix` : "none"} />}
              title="Applies to the drawn LINE only. Marks and hit-testing always use full
                     resolution." />
            <Row k="drawn this frame"
              v={<Txt value={`${frame.storms.toLocaleString()} storms · ${frame.segments.toLocaleString()} segments`} />} />
          </>
        ) : null}

        <Head>COLUMNS THE ARCHIVE HOLDS EMPTY</Head>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--text-2)", lineHeight: "var(--lh-body)", marginBottom: "var(--sp-3)" }}>
          {m.empty_in_archive._note}
        </div>
        {Object.entries(m.empty_in_archive).filter(([k]) => k !== "_note").map(([k, v]) => (
          <Row key={k} k={k} v={<Txt value={v} />} dim />
        ))}

        <Head>NOT IN THIS PACK</Head>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--text-2)", lineHeight: "var(--lh-body)", marginBottom: "var(--sp-3)" }}>
          {m.not_packed._note}
        </div>
        {Object.entries(m.not_packed).filter(([k]) => k !== "_note").map(([k, v]) => (
          <Row key={k} k={k} v={<Txt value={Array.isArray(v) ? v.join(", ") : v} />} dim />
        ))}

        <Head>GAPS RECORDED BY THE ARCHIVE</Head>
        {(p.gaps || []).map((g, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--border-dim)",
            padding: "var(--sp-3) 0" }}>
            <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)" }}>
              {g.key}
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
              color: "var(--text-1)", lineHeight: "var(--lh-body)", marginTop: 2 }}>
              {g.what}
            </div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
              color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 4 }}>
              {g.impact}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
