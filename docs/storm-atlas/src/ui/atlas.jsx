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
import { genesisDensity, getAnalogs, pathwayDensity } from "../engine/analogs.js";
import { filterStorms, genesisBounds, seasonRange } from "../engine/query.js";
import {
  EMPTY_COHORT, cohortResult, conditionsOf, normalise, parentOf, parseQuery, sameCohort,
  sentenceOf, toQuery,
} from "../engine/cohort.js";
import { activeAt, advance, buildTimeline, fromActive, toActive } from "../engine/timeline.js";
import { projectWorld } from "../render/atlas-layer.js";
import { previewCounts } from "../engine/preview.js";
import { AtlasMap } from "./map.jsx";
import { CohortBuilder } from "./cohort-builder.jsx";
import { StormPanel } from "./storm-panel.jsx";
import { CohortPanel } from "./cohort-panel.jsx";
import { Transport } from "./transport.jsx";
import { ArchiveTransport } from "./archive-transport.jsx";
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

  /* THE SINGLE SOURCE OF TRUTH. One object decides which storms are drawn, which are counted,
     what the outcome cards say, what the URL carries and what a saved scenario is. The rail
     writes to it; nothing else holds query state. */
  const [cohort, setCohort] = React.useState(() => parseQuery(location.search).spec);
  const [urlVersion] = React.useState(() => parseQuery(location.search).versionMismatch);
  const [layers, setLayers] = React.useState({
    colorBy: "uniform", genesis: true, landfalls: true,
  });
  const [selected, setSelected] = React.useState(null);
  /* Off by default. The individual trajectories are the hero -- the density surface is the
     same storms counted, and stacking both means neither reads. Turning it on dims the tracks
     so the surface can be seen. */
  const [showPathway, setShowPathway] = React.useState(false);
  const [showGenesisDensity, setShowGenesisDensity] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [cursorMs, setCursorMs] = React.useState(null);
  /* "explore" is the map as a finished record; "replay" unfolds it in time. The filters drive
     both unchanged, which is what makes "watch only the majors" or "watch only the storms that
     hit Mexico" come for free rather than needing their own controls. */
  const [mode, setMode] = React.useState("explore");
  const [replayCursorMin, setReplayCursorMin] = React.useState(null);
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
      globalThis.__ATLAS = { archive: a, world: w, getAnalogs, pathwayDensity, genesisDensity };
      globalThis.__ATLAS_QUERY = { filterStorms, seasonRange, genesisBounds };
      globalThis.__ATLAS_COHORT = { cohortResult, previewCounts, normalise, parentOf, toQuery };
      globalThis.__ATLAS_TIMELINE = { buildTimeline, advance, activeAt, fromActive, toActive };
      globalThis.__ATLAS_PROJECT = projectWorld;
    }).catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, []);

  const bounds = React.useMemo(() => (archive ? seasonRange(archive) : [1851, 2026]), [archive]);
  const home = React.useMemo(() => (archive ? genesisBounds(archive) : null), [archive]);
  /* ONE COHORT, ONE ANSWER. Membership and outcomes come from the same object now: the storms
     drawn on the map ARE the storms in every denominator. Until 3.2 these were two calls -- one
     deciding what was drawn, another deciding what was scored -- and keeping them from
     disagreeing was the shell's job rather than the engine's. */
  const result = React.useMemo(
    () => (archive ? cohortResult(archive, cohort) : null), [archive, cohort]);

  /* THE POPULATION STAYS VISIBLE AS CONTEXT, and the context is exactly the PARENT cohort --
     this cohort with its location condition dropped. Comparing against the whole archive would
     be the wrong reference (it would include storms excluded for reasons that have nothing to do
     with where they formed), and it is also the object 3.4's baseline needs, so it is computed
     the same way here rather than approximated. */
  const context = React.useMemo(() => {
    if (!archive || !cohort.where) return null;
    const p = parentOf(cohort, "where");
    return p ? cohortResult(archive, p) : null;
  }, [archive, cohort]);

  /* What each chip would cost, computed once per cohort -- five filter passes and five scans.
     Measured: 2.9 ms on a 65-storm cohort, 3.9 ms on 539, 6.9 ms over the whole archive. That
     is what makes a live count on every control affordable rather than aspirational. */
  const preview = React.useMemo(
    () => (archive ? previewCounts(archive, cohort) : null), [archive, cohort]);
  const sentence = React.useMemo(() => sentenceOf(cohort), [cohort]);

  const contextRows = context ? context.rows : (result ? result.rows : null);
  const emphasis = context ? result.rows : null;

  /* THE DENSITY SURFACES ARE NOT TIED TO A PROBE. With a probe they show the matched pool --
     where those storms went. Without one they show the current filter over the whole archive,
     which is what makes "all storms · TS+ · Cat 3+ · Mexico · CONUS · Hawaii" reachable: every
     one of those is a filter that already exists. Measured at 7.9 ms for all 3,885 storms. */
  const pathway = React.useMemo(() => {
    if (!archive || !result || !showPathway) return null;
    return pathwayDensity(archive, result.rows, 2.0);
  }, [archive, result, showPathway]);

  const genesisGrid = React.useMemo(() => {
    if (!archive || !result || !showGenesisDensity) return null;
    return genesisDensity(archive, result.rows, 2.0);
  }, [archive, result, showGenesisDensity]);

  /* The replay clock, built from whatever the filter currently selects. Rebuilt on a filter
     change on purpose: a run is over a population, and changing the population is a new run. */
  const timeline = React.useMemo(
    () => (archive && result && mode === "replay" ? buildTimeline(archive, result.rows) : null),
    [archive, result, mode]);

  React.useEffect(() => {
    if (mode !== "replay") { setPlaying(false); return; }
    setReplayCursorMin(timeline && timeline.n ? timeline.firstT : null);
  }, [mode, timeline]);

  /* THE COHORT IS THE ADDRESS BAR. A scenario is a URL in this architecture -- shareable,
     bookmarkable and diffable with no server at all -- so the spec is written back on every
     change. replaceState rather than pushState: building a query is one continuous act, and
     filling the back button with twelve half-formed cohorts would make Back useless for
     leaving the page. */
  React.useEffect(() => {
    const q = toQuery(cohort);
    const next = q ? `?${q}` : location.pathname;
    if (location.search.replace(/^\?/, "") !== q) history.replaceState(null, "", next);
  }, [cohort]);

  const selectStorm = React.useCallback((row) => {
    setSelected(row);
    setCursorMs(null);
    setPlaying(false);
  }, []);

  // Handles for the interaction checks, alongside __ATLAS_MAP. Nothing in the app reads them.
  React.useEffect(() => { globalThis.__ATLAS_SELECT = selectStorm; }, [selectStorm]);
  React.useEffect(() => { globalThis.__ATLAS_SET_CURSOR = setCursorMs; }, []);

  /* Clicking the ocean sets the cohort's LOCATION CONDITION -- it does not open a separate
     probe with its own query. That separation was the two-surface problem in miniature. */
  const onProbe = React.useCallback((lat, lon) => {
    setSelected(null);
    setPlaying(false);
    setCohort((c) => normalise({
      ...c, where: { lat, lon, radiusKm: c.where ? c.where.radiusKm : DEFAULT_RADIUS_KM },
    }));
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === "Escape") {
        setProvOpen(false); setSelected(null);
        setCohort((c) => normalise({ ...c, where: null }));
      }
      if (e.key === "p" || e.key === "P") setProvOpen((v) => !v);
      if (e.key === " " && (selected !== null || mode === "replay")) {
        e.preventDefault(); setPlaying((v) => !v);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [selected, mode]);

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
        <CohortBuilder archive={archive} cohort={cohort}
          setCohort={(f) => setCohort(normalise(f))}
          result={result} preview={preview}
          layers={layers} setLayers={setLayers} bounds={bounds}
          mode={mode} setMode={setMode}
          showPathway={showPathway} setShowPathway={setShowPathway}
          showGenesisDensity={showGenesisDensity} setShowGenesisDensity={setShowGenesisDensity}
          timeline={timeline} sentence={sentence} conditions={conditionsOf(cohort)}
          onReset={() => { setCohort(normalise(EMPTY_COHORT)); setSelected(null); }} />
      </div>

      <div className="atlas-stage" style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
        <AtlasMap
          archive={archive} world={world} rows={contextRows} emphasis={emphasis}
          selected={selected} home={home}
          onSelect={selectStorm} onProbe={onProbe} probe={cohort.where}
          replayMs={selected !== null && cursorMs !== null ? cursorMs : undefined}
          colorBy={layers.colorBy} dimPopulation={selected !== null}
          softenEmphasis={showPathway}
          showGenesis={layers.genesis} showLandfalls={layers.landfalls}
          showPathway={showPathway} pathway={pathway}
          showGenesisDensity={showGenesisDensity} genesisDensity={genesisGrid}
          mode={mode} timeline={timeline} replayCursorMin={replayCursorMin}
          pathwayStep={2.0} onViewChange={setView}
        />
        {mode === "explore" && !cohort.where && selected === null ? <Invitation /> : null}
        <Legend colorBy={layers.colorBy} showPathway={showPathway} probe={!!cohort.where}
          showGenesisDensity={showGenesisDensity} />
      </div>

      <div className="atlas-panel" style={{ overflowY: "auto",
        borderLeft: "1px solid var(--border-dim)", background: "var(--surface-card)" }}>
        {storm ? (
          <StormPanel storm={storm} archive={archive} onClose={() => setSelected(null)}
            onReplay={() => setPlaying((v) => !v)} replaying={playing} />
        ) : mode === "replay" ? (
          <ReplayNote timeline={timeline} result={result} />
        ) : conditionsOf(cohort).length ? (
          /* THE ANSWER IS PUBLISHED FOR ANY COHORT, not only for one with a location. Before
             3.3 this panel answered a click on open water and nothing else, so narrowing to
             "Cat 3+, since 1971, Aug-Sep" produced a map and no statistics at all. */
          <CohortPanel spec={cohort} result={result} sentence={sentence}
            peak={peakOf(pathway)} pathway={pathway} onSelectStorm={selectStorm}
            pathwayOn={showPathway} onShowPathway={setShowPathway} />
        ) : (
          <Introduction archive={archive} />
        )}
      </div>

      <div className="atlas-transport">
        {mode === "replay" ? (
          <ArchiveTransport timeline={timeline} cursorMin={replayCursorMin}
            setCursorMin={setReplayCursorMin} playing={playing} setPlaying={setPlaying} />
        ) : selected !== null ? (
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

/* Every density surface on screen has to name what its shading COUNTS. A coloured grid over a
   map is read as a probability unless it says otherwise, and neither of these is one. */
function Legend({ colorBy, showPathway, showGenesisDensity, probe }) {
  const items = [["ts", "TS"], ["cat1", "1"], ["cat2", "2"], ["cat3", "3"], ["cat4", "4"],
    ["cat5", "5"]];
  const surfaces = [];
  if (showPathway) {
    surfaces.push(["56, 189, 248", "HISTORICAL PATHWAY FREQUENCY",
      probe ? "storms of the matched pool through each 2° cell — not a forecast"
        : "storms of the current filter through each 2° cell — not a forecast"]);
  }
  if (showGenesisDensity) {
    surfaces.push(["167, 139, 250", "GENESIS COUNT",
      "storms that formed in each 2° cell — a count, not a rate"]);
  }
  if (colorBy !== "intensity" && !surfaces.length) return null;
  return (
    <div style={{
      position: "absolute", right: 12, bottom: 14, zIndex: 450, pointerEvents: "none",
      background: "rgba(7,12,22,.82)", border: "1px solid var(--border-strong)",
      borderRadius: "var(--radius-sm)", padding: "6px 9px", display: "flex",
      flexDirection: "column", gap: 5, alignItems: "flex-start", maxWidth: 340,
    }}>
      {surfaces.map(([hue, title, note]) => (
        <div key={title} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", flex: "none" }}>
            {[0.18, 0.38, 0.62].map((a) => (
              <span key={a} style={{ width: 9, height: 9, background: `rgba(${hue}, ${a})` }} />
            ))}
          </span>
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-1)",
            letterSpacing: "var(--track-label)" }}>{title}
            <span style={{ color: "var(--text-2)", letterSpacing: 0 }}> · {note}</span>
          </span>
        </div>
      ))}
      {colorBy === "intensity" ? (
        <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center" }}>
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
      ) : null}
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

/* What the run is doing, and what it is doing to time. The skip is a real distortion of pace and
   the reader is told about it before it happens, not only when it flashes past on the transport. */
function ReplayNote({ timeline, result }) {
  const tl = timeline;
  const quiet = tl && tl.spanMin ? (tl.spanMin - tl.activeMin) / tl.spanMin : null;
  return (
    <div style={{ padding: "var(--sp-6)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-body)",
        color: "var(--text-1)", lineHeight: "var(--lh-body)" }}>
        The record, in the order it happened.
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: "var(--sp-5)" }}>
        {!tl || !tl.n ? (
          <p style={{ margin: 0 }}>
            The current filter selects no storms, so there is nothing to replay.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 var(--sp-5)" }}>
              <strong style={{ color: "var(--text-1)" }}>{tl.n.toLocaleString()} storms</strong>{" "}
              between {fmtYear(tl.firstT)} and {fmtYear(tl.lastT)}. Tracks stay on the map as they
              are revealed, so what builds up is the shape of the whole record rather than one
              storm at a time.
            </p>
            {/* Stated as years rather than as a percentage, deliberately: this build renders no
                percentage it computed itself, and "43.5 of 174.5 years" is the more concrete
                statement anyway. */}
            <p style={{ margin: "0 0 var(--sp-5)" }}>
              <strong style={{ color: "var(--warn)" }}>The clock skips quiet stretches.</strong>{" "}
              {quiet !== null
                ? <>Only {yearsOf(tl.activeMin)} of those {yearsOf(tl.spanMin)} calendar years
                    have a storm anywhere on the map</>
                : <>Much of the span has no storm active</>} — the rest is off-season, repeated.
              Those gaps are jumped and every jump is announced on the transport. Nothing else is
              changed: every storm appears, once, in order, over its whole observed span.
            </p>
            {result && result.excluded && result.excluded.noGenesis ? (
              <p style={{ margin: "0 0 var(--sp-5)" }}>
                {result.excluded.noGenesis} storms are not in this run: the archive holds no
                genesis point for them, so the filter cannot place them.
              </p>
            ) : null}
            <p style={{ margin: "0 0 var(--sp-5)" }}>
              The filters on the left drive the run. Narrow to Cat 3+ and only the majors unfold;
              narrow to a landfall region and only the storms that reached it do.
            </p>
            <p style={{ margin: 0, color: "var(--text-2)" }}>{claimText("atlas.replay")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function fmtYear(min) {
  return new Date(min * 60000).getUTCFullYear();
}

function yearsOf(minutes) {
  return (minutes / 525600).toFixed(1);
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

/** Busiest cell in a density grid. The grid is now computed by the shell rather than carried
 *  inside an analog result, so this takes the Map directly. */
function peakOf(grid) {
  let peak = 0;
  if (grid) for (const v of grid.values()) if (v > peak) peak = v;
  return peak;
}
