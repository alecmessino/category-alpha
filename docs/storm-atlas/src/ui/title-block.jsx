import React from "react";
export function TitleBlock({ archive, onProvenance, onLedger }) {
  const m = archive.manifest, p = m.provenance || {};
  return <header className="at-title-block">
    <a className="at-title-identity" href="../" title="Open Millibar Terminal"><small>SHEET 01 / HISTORICAL RESEARCH</small><strong>Storm Atlas · Millibar</strong></a>
    <span><small>METHOD</small>{m.methodology_version}</span>
    <span><small>PACK</small>{p.archive_stamp?.slice(0, 16) || "—"}</span>
    <span className="at-title-built"><small>BUILT</small>{p.archive_built_utc?.slice(0, 10) || "—"}</span>
    <nav aria-label="Atlas reference"><button onClick={onLedger}>CALIBRATION</button><button onClick={onProvenance}>PROVENANCE</button><a href="#atlas-schedule">SCHEDULE ↓</a></nav>
  </header>;
}
