/* STORM ATLAS -- the shell.
 *
 * What the first ten seconds have to do, in order:
 *   1. Put the archive's scale on screen. The manifest is a few kilobytes and arrives first,
 *      so the counts are legible before the track block has finished downloading.
 *   2. Draw the population. Restrained by default -- one ink at low alpha, so the shape of
 *      where storms actually go emerges from overlap rather than from 3,959 competing lines.
 *   3. Make the question obvious. Clicking open water asks it; trajectories answer it on the
 *      map, not in a dialog.
 *
 * The map is the page. Everything else explains what is on it.
 */

import React from "react";
import { loadArchive } from "../engine/archive.js";
import { getAnalogs } from "../engine/analogs.js";
import { DEFAULT_FILTERS, filterStorms, genesisBounds, seasonRange } from "../engine/query.js";
import { projectWorld } from "../render/atlas-layer.js";
import { AtlasMap } from "./map.jsx";
import { Rail } from "./rail.jsx";
import { StormPanel } from "./storm-panel.jsx";
import { ProbePanel } from "./probe-panel.jsx";
import { Transport } from "./transport.jsx";
import { MONO, claimText } from "./kit.jsx";

/* Split out of the entry chunk. The drawer is reached by a button or the P key, never on the
   path to a first paint or a first click, so its bytes should not be in the file that has to
   arrive before the map can draw. The panels are NOT split: they open on the first click, and
   a chunk fetch there would cost more than the bytes save. */
const ProvenanceDrawer = React.lazy(() =>
  import("./provenance.jsx").then((m) => ({ default: m.ProvenanceDrawer })));

const DATA_BASE = "data";
const DEFAULT_RADIUS_KM = 500;

export function Atlas() {
  const [archive, setArchive] = React.useState(null);
  const [manifest, setManifest] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [world, setWorld] = React.useState(null);

  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [layers, setLayers] = React.useState({
    colorBy: "uniform", genesis: true, landfalls: true,
  });
  const [selected, setSelected] = React.useState(null);
  const [probe, setProbe] = React.useState(null);
  /* Off by default. The individual trajectories are the hero -- the density surface is the
     same storms counted, and stacking both means neither reads. Turning it on dims the tracks
     so the surface can be seen. */
  const [showPathway, setShowPathway] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [cursorMs, setCursorMs] = React.useState(null);
  const [provOpen, setProvOpen] = React.useState(false);
  const [view, setView] = React.useState(null);

  /* The manifest lands first so the scale line can paint while the 972 KB track block is still
     in flight; the two packs are then fetched in parallel. */
  React.useEffect(() => {
    let cancelled = false;
    loadArchive(DATA_BASE, {
      onProgress: (p) => { if (!cancelled && p.manifest) setManifest(p.manifest); },
    }).then((a) => {
      if (cancelled) return;
      const w = projectWorld(a);
      setWorld(w);
      setArchive(a);
      globalThis.__ATLAS = { archive: a, world: w, getAnalogs };
      globalThis.__ATLAS_QUERY = { filterStorms, seasonRange, genesisBounds };
      globalThis.__ATLAS_PROJECT = projectWorld;
    }).catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, []);

  const bounds = React.useMemo(() => (archive ? seasonRange(archive) : [1851, 2026]), [archive]);
  const home = React.useMemo(() => (archive ? genesisBounds(archive) : null), [archive]);
  const result = React.useMemo(
    () => (archive ? filterStorms(archive, filters) : null), [archive, filters]);

  const analog = React.useMemo(() => {
    if (!archive || !probe) return null;
    return getAnalogs(archive, {
      lat: probe.lat, lon: probe.lon, radiusKm: probe.radiusKm,
      seasonMonths: filters.months, minPoolSeason: filters.seasonFrom,
      basins: filters.basins, includeProvisional: filters.includeProvisional,
      regions: ["hawaii", "mexico", "conus"],
    });
  }, [archive, probe, filters.months, filters.seasonFrom, filters.basins,
      filters.includeProvisional]);

  /* The pool the probe matched, as storm rows -- what the map lifts out of the population. */
  const emphasis = React.useMemo(
    () => (analog ? analog.cases.map((c) => c.row) : null), [analog]);

  const selectStorm = React.useCallback((row) => {
    setSelected(row);
    setProbe(null);
    setCursorMs(null);
    setPlaying(false);
  }, []);

  // Handle for the interaction checks, alongside __ATLAS_MAP. Nothing in the app reads it.
  React.useEffect(() => { globalThis.__ATLAS_SELECT = selectStorm; }, [selectStorm]);

  const onProbe = React.useCallback((lat, lon) => {
    setSelected(null);
    setPlaying(false);
    setProbe((p) => ({ lat, lon, radiusKm: p ? p.radiusKm : DEFAULT_RADIUS_KM }));
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "Escape") { setProvOpen(false); setSelected(null); setProbe(null); }
      if (e.key === "p" || e.key === "P") setProvOpen((v) => !v);
      if (e.key === " " && selected !== null) { e.preventDefault(); setPlaying((v) => !v); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [selected]);

  if (error) return <BootError error={error} />;
  if (!archive || !world || !result) return <Boot manifest={manifest} />;

  const storm = selected === null ? null : archive.storm(selected);

  return (
    <div data-surface="tactical" className="atlas-shell" style={{
      position: "fixed", inset: 0,
      background: "var(--surface-app)", color: "var(--text-1)", overflow: "hidden",
    }}>
      <Header manifest={archive.manifest} onProvenance={() => setProvOpen(true)} />

      <div className="atlas-rail" style={{ overflowY: "auto",
        borderRight: "1px solid var(--border-dim)", background: "var(--surface-card)" }}>
        <Rail archive={archive} filters={filters} setFilters={setFilters} result={result}
          layers={layers} setLayers={setLayers} bounds={bounds}
          onReset={() => { setFilters(DEFAULT_FILTERS); setSelected(null); setProbe(null); }} />
      </div>

      <div className="atlas-stage" style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
        <AtlasMap
          archive={archive} world={world} rows={result.rows} emphasis={emphasis}
          selected={selected} home={home}
          onSelect={selectStorm} onProbe={onProbe} probe={probe}
          replayMs={selected !== null && cursorMs !== null ? cursorMs : undefined}
          colorBy={layers.colorBy} dimPopulation={selected !== null}
          softenEmphasis={showPathway}
          showPathway={showPathway && !!analog} pathway={analog ? analog.track_density : null}
          pathwayStep={2.0} onViewChange={setView}
        />
        {!probe && selected === null ? <Invitation /> : null}
        <Legend colorBy={layers.colorBy} />
      </div>

      <div className="atlas-panel" style={{ overflowY: "auto",
        borderLeft: "1px solid var(--border-dim)", background: "var(--surface-card)" }}>
        {storm ? (
          <StormPanel storm={storm} archive={archive} onClose={() => setSelected(null)}
            onReplay={() => setPlaying((v) => !v)} replaying={playing} />
        ) : probe ? (
          <ProbePanel probe={probe} result={analog} peak={analog ? peakOf(analog) : 0}
            onRadius={(km) => setProbe((p) => ({ ...p, radiusKm: km }))}
            onClose={() => setProbe(null)} onSelectStorm={selectStorm}
            pathwayOn={showPathway} onShowPathway={setShowPathway} />
        ) : (
          <Introduction archive={archive} />
        )}
      </div>

      <div className="atlas-transport">
        {selected !== null ? (
          <Transport archive={archive} row={selected} playing={playing} setPlaying={setPlaying}
            cursorMs={cursorMs} setCursorMs={setCursorMs} />
        ) : null}
      </div>

      <React.Suspense fallback={null}>
        {provOpen ? (
          <ProvenanceDrawer archive={archive} open={provOpen}
            onClose={() => setProvOpen(false)} frame={view ? view.frame : null} />
        ) : null}
      </React.Suspense>
    </div>
  );
}

/* The archive's scale, on screen before anything is interactive. Counts come from the pack that
   was actually loaded -- not from a constant, and not from MANIFEST.json, which is stale for
   two of these tables. */
function ScaleLine({ manifest, dim }) {
  if (!manifest) return null;
  const c = manifest.counts;
  const items = [
    [c.storms, "STORMS"],
    [c.track_points, "TRACK POINTS"],
    [c.genesis_events, "GENESIS EVENTS"],
    [c.landfalls, "LANDFALLS"],
    [c.environment, "ENVIRONMENT OBS"],
  ];
  return (
    <div style={{ display: "flex", gap: "var(--sp-6)", flexWrap: "wrap",
      opacity: dim ? 0.75 : 1 }}>
      {items.map(([n, label]) => (
        <span key={label} style={{ ...MONO, fontSize: "var(--fs-mono-sm)", whiteSpace: "nowrap" }}>
          <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{n.toLocaleString()}</span>
          <span style={{ color: "var(--text-2)", marginLeft: 5,
            letterSpacing: "var(--track-label)" }}>{label}</span>
        </span>
      ))}
    </div>
  );
}

function Header({ manifest, onProvenance }) {
  return (
    <header style={{
      gridColumn: "1 / -1", gridRow: "1", display: "flex", alignItems: "center",
      justifyContent: "space-between", gap: "var(--sp-4) var(--sp-6)", flexWrap: "wrap",
      padding: "var(--sp-4) var(--sp-6)", borderBottom: "1px solid var(--border-dim)",
      background: "var(--surface-card)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-4) var(--sp-6)",
        minWidth: 0, flexWrap: "wrap", flex: "1 1 auto" }}>
        <a href="../" title="back to Millibar Terminal" style={{
          ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          textDecoration: "none", flex: "none",
        }}>‹ MILLIBAR</a>
        <span style={{
          fontFamily: "var(--font-sans)", fontSize: "var(--fs-title)",
          fontWeight: "var(--fw-black)", letterSpacing: "var(--track-caps)",
          textTransform: "uppercase", color: "var(--text-1)", flex: "none",
        }}>STORM ATLAS</span>
        <ScaleLine manifest={manifest} />
      </div>
      <button type="button" onClick={onProvenance} title="provenance (P)" style={{
        ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
        border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
        color: "var(--text-2)", cursor: "pointer", padding: "4px 8px", flex: "none",
        letterSpacing: "var(--track-label)",
      }}>PROVENANCE</button>
    </header>
  );
}

/* The one instruction the surface gives, placed where the gesture happens. */
function Invitation() {
  return (
    <div style={{
      position: "absolute", left: "50%", bottom: 26, transform: "translateX(-50%)",
      pointerEvents: "none", zIndex: 450, textAlign: "center",
    }}>
      <div style={{
        ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-1)",
        background: "rgba(7,12,22,.82)", border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)", padding: "7px 14px",
        letterSpacing: "var(--track-label)",
      }}>
CLICK ANY OCEAN POINT — what formed there, and where it went · CLICK A GENESIS POINT for one storm
      </div>
    </div>
  );
}

function Legend({ colorBy }) {
  if (colorBy !== "intensity") return null;
  const items = [["ts", "TS"], ["cat1", "1"], ["cat2", "2"], ["cat3", "3"], ["cat4", "4"],
    ["cat5", "5"]];
  return (
    <div style={{
      position: "absolute", right: 12, bottom: 14, zIndex: 450, pointerEvents: "none",
      background: "rgba(7,12,22,.82)", border: "1px solid var(--border-strong)",
      borderRadius: "var(--radius-sm)", padding: "6px 9px", display: "flex",
      gap: "var(--sp-4)", alignItems: "center",
    }}>
      {items.map(([k, label]) => (
        <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 2,
            background: `var(--atlas-${k}, ${CAT_HEX[k]})` }} />
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}

const CAT_HEX = { ts: "#7fb2e6", cat1: "#38bdf8", cat2: "#fbbf24", cat3: "#f59e0b",
  cat4: "#ef4444", cat5: "#8b5cf6" };

function Introduction({ archive }) {
  const m = archive.manifest;
  return (
    <div style={{ padding: "var(--sp-6)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-body)",
        color: "var(--text-1)", lineHeight: "var(--lh-body)" }}>
        Every line on this map is a storm that happened.
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: "var(--sp-5)" }}>
        <p style={{ margin: "0 0 var(--sp-5)" }}>
          <strong style={{ color: "var(--text-1)" }}>Click any point on the ocean</strong> to ask
          what formed near there and where it went.{" "}
          <strong style={{ color: "var(--text-1)" }}>Click a genesis point</strong> — one of the
          cyan dots — to follow that storm from its first fix to its last.
        </p>
        <p style={{ margin: "0 0 var(--sp-5)" }}>
          Tracks themselves are not click targets. At this zoom forty of them lie under any
          given pixel, so a click on one would select a storm essentially at random. The genesis
          points are discrete, and so is the choice.
        </p>
        <p style={{ margin: "0 0 var(--sp-5)" }}>
          {claimText("atlas.subject")} {m.counts.storms.toLocaleString()} storms and{" "}
          {m.counts.track_points.toLocaleString()} observed positions, with every threshold
          crossing, every coastline crossing and every gap the archive recorded about itself.
        </p>
        <p style={{ margin: 0 }}>
          Where the archive cannot answer, it says so. That is the point.
        </p>
      </div>
    </div>
  );
}

function Boot({ manifest }) {
  return (
    <div data-surface="tactical" style={{
      position: "fixed", inset: 0, background: "var(--surface-app)", color: "var(--text-1)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "var(--sp-7)", padding: "var(--sp-8)",
    }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-title)",
        fontWeight: "var(--fw-black)", letterSpacing: "var(--track-caps)",
        textTransform: "uppercase" }}>STORM ATLAS</div>
      {manifest ? <ScaleLine manifest={manifest} dim /> : null}
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        letterSpacing: "var(--track-label)" }}>
        {manifest ? "[ READING THE HISTORICAL ARCHIVE… ]" : "[ OPENING THE ARCHIVE… ]"}
      </div>
    </div>
  );
}

function BootError({ error }) {
  return (
    <div data-surface="tactical" style={{
      position: "fixed", inset: 0, background: "var(--surface-app)", color: "var(--text-1)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: "var(--sp-5)", padding: "var(--sp-8)", textAlign: "center",
    }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-md)", color: "var(--neg)",
        letterSpacing: "var(--track-label)" }}>[ THE ARCHIVE COULD NOT BE READ ]</div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        maxWidth: 520, lineHeight: "var(--lh-body)" }}>
        {String(error && error.message ? error.message : error)}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", maxWidth: 520, lineHeight: "var(--lh-body)" }}>
        Nothing is shown rather than something approximate. The Storm Atlas has no fallback
        dataset, because a map drawn from anything but the archive would not be this archive.
      </div>
    </div>
  );
}

function peakOf(analog) {
  let peak = 0;
  for (const v of analog.track_density.values()) if (v > peak) peak = v;
  return peak;
}
