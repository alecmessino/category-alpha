/* Where every number on this screen came from.
 *
 * The archive's provenance discipline is not a footnote on this product, it is the product, so
 * this drawer is one keystroke away rather than buried: the sources and their hashes, the two
 * versions that govern what is shown, every gap the archive recorded about its own inputs, the
 * columns it holds that carry no data, and the places the Atlas itself made a choice -- the
 * coordinate quantisation, the line decimation, and the geometry the plate draws its coastline
 * from.
 *
 * Nothing here is written by hand. Every value is read from the pack the browser loaded.
 *
 * SET AS A COLOPHON, NOT AS A MODAL. A serif heading, a rule under it, and the record beneath:
 * this is the back matter of the plate, and it should read like it.
 */

import React from "react";
import { Gap, Head, Note, Row, TextButton, Txt } from "./kit.jsx";

export function ProvenanceDrawer({ archive, coast, open, onClose, frame }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  const c = coast && coast.header ? coast.header : null;
  return (
    <>
      <div className="at-veil" onClick={onClose} />
      <aside className="at-drawer" aria-hidden={!open} aria-label="provenance">
        <div className="at-dh">
          <h2>Provenance</h2>
          <span style={{ marginLeft: "auto" }}>
            <TextButton onClick={onClose} title="close (ESC)">ESC</TextButton>
          </span>
        </div>

        <div className="at-body">
          <Head n="01">Versions</Head>
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

          <Head n="02">What is loaded</Head>
          {Object.entries(m.counts).map(([k, v]) => (
            <Row key={k} k={k.replace(/_/g, " ")} v={v.toLocaleString()} />
          ))}
          <Row k="observed fixes" v={m.quality.track_points.observed.toLocaleString()} />
          <Row k="interpolated fixes" tone="var(--flag)"
            v={m.quality.track_points.interpolated.toLocaleString()}
            title="Interpolated by IBTrACS, not by this archive. An interpolated point may never
                   establish a threshold crossing." />
          <Row k="storms with env near genesis"
            v={`${m.quality.storms_with_env_at_genesis.toLocaleString()} of ${m.counts.storms.toLocaleString()}`}
            title={`An environment record within ${m.env_genesis_window_hours} h of genesis. SHIPS
                    begins in 1982 and its developmental file ends in 2023.`} />
          <Row k="landfalls with a withheld class" tone="var(--flag)"
            v={m.quality.landfall_category_withheld.toLocaleString()}
            title="Segment crossings whose bracketing fixes disagreed about the Saffir-Simpson
                   class. The archive publishes none rather than interpolating one." />

          <Head n="03">Sources</Head>
          <Note>
            The official files the archive was built from. Their own hashes are recorded in the
            archive's manifest; what this pack vouches for directly is the sha256 of each table
            it read, below.
          </Note>
          <div className="at-srcs">
            {(p.archive_sources || []).map((s) => <i key={s}>{s}</i>)}
          </div>
          <div style={{ marginTop: 9 }}>
            {Object.entries(p.table_sha256 || {}).map(([t, v]) => (
              <Row key={t} k={`${t}.parquet`} v={<Txt value={v.sha256.slice(0, 16)} />} />
            ))}
          </div>

          <Head n="04">What this surface chose</Head>
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

          {/* THE PLATE'S COASTLINE. It is not a basemap and it is not decoration: it is the
              geometry the landfall rule tests against, drawn so the line a reader sees is the
              line the claim was made against. What it cost and what it did not cost -- no
              vertex removed, none moved -- belongs on the record beside everything else. */}
          <Head n="05" right={c ? "archive-owned" : "not loaded"}>The coastline on the plate</Head>
          {c ? (
            <>
              <Note style={{ marginBottom: 6 }}>{c.note}</Note>
              <Row k="regions drawn at full contrast" v={c.regions.join(" · ")} />
              <Row k="rings" v={c.counts.rings.toLocaleString()} />
              <Row k="vertices" v={c.counts.vertices.toLocaleString()}
                title="Every vertex the archive tested against. None was removed and none was
                       moved: a simplified coast would diverge from the detection geometry at
                       exactly the zoom where a reader looks closely to check a landfall." />
              <Row k="land-union boundary edges" v={c.counts.boundary_edges.toLocaleString()}
                title="The edges the crossing rule sees as coastline: those belonging to exactly
                       one polygon." />
              <Row k="interior admin borders" v={c.counts.shared_edges.toLocaleString()}
                title="Edges shared by two adjacent units. Drawn backed off, because a state line
                       is not a coast." />
              <Row k="packed at" v={`1/${c.scale.toLocaleString()}°, lossless`}
                title="The sources publish four decimals, so a 1/10000° fixed-point grid carries
                       every coordinate exactly. scripts/test-atlas-coastlines.mjs compares every
                       vertex against the GeoJSON." />
              <div className="at-srcs">
                {((c.provenance || {}).geometry_sources || []).map((s) => (
                  <i key={s.key} title={s.licence}>{s.key} · {(s.sha256 || "").slice(0, 12)}</i>
                ))}
              </div>
              <Note style={{ marginTop: 9 }}>
                Everything outside these five regions is contextual basemap, held at a lower
                contrast on purpose. That difference is a statement about where a landfall can be
                detected at all.
              </Note>
            </>
          ) : (
            <Note>
              The archive's coastline pack has not loaded{coast && coast.failed
                ? <> — <b>{coast.failed}</b></> : null}. The plate is drawing contextual
              geography only; no other geometry has been substituted for the modelled regions.
            </Note>
          )}

          <Head n="06">Columns the archive holds empty</Head>
          <Note style={{ marginBottom: 6 }}>{m.empty_in_archive._note}</Note>
          {Object.entries(m.empty_in_archive).filter(([k]) => k !== "_note").map(([k, v]) => (
            <Row key={k} k={k} v={<Txt value={v} />} dim />
          ))}

          <Head n="07">Not in this pack</Head>
          <Note style={{ marginBottom: 6 }}>{m.not_packed._note}</Note>
          {Object.entries(m.not_packed).filter(([k]) => k !== "_note").map(([k, v]) => (
            <Row key={k} k={k} v={<Txt value={Array.isArray(v) ? v.join(", ") : v} />} dim />
          ))}

          <Head n="08">Gaps recorded by the archive</Head>
          {(p.gaps || []).map((g, i) => (
            <div key={i} className="at-grp">
              <Gap label={g.key} text={
                <>
                  <b>{g.what}</b>
                  <div style={{ marginTop: 4 }}>{g.impact}</div>
                </>
              } />
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
