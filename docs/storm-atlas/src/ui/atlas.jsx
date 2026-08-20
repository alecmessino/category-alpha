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
import { fetchCoastlines } from "../engine/coastlines.js";
import { genesisDensity, getAnalogs, pathwayDensity } from "../engine/analogs.js";
import { filterStorms, genesisBounds, seasonRange } from "../engine/query.js";
import {
  EMPTY_COHORT, cohortResult, conditionsOf, normalise, parentOf, parseQuery, sameCohort,
  sentenceOf, toQuery,
} from "../engine/cohort.js";
import { activeAt, advance, buildTimeline, fromActive, toActive } from "../engine/timeline.js";
import { projectWorld } from "../render/atlas-layer.js";
import { previewCounts } from "../engine/preview.js";
import { changedKeyOf, compareResults } from "../engine/compare.js";
import { envAtGenesis, envCoverage } from "../engine/env.js";
import { loadCalibration } from "../engine/calibration.js";
import { AtlasMap } from "./map.jsx";
import { CohortBuilder } from "./cohort-builder.jsx";
import { StormPanel } from "./storm-panel.jsx";
import { CohortPanel } from "./cohort-panel.jsx";
import { Transport } from "./transport.jsx";
import { ArchiveTransport } from "./archive-transport.jsx";
import { MONO, TextButton, claimText } from "./kit.jsx";

/* Split out of the entry chunk. The drawer is reached by a button or the P key, never on the
   path to a first paint or a first click, so its bytes should not be in the file that has to
   arrive before the map can draw. The panels are NOT split: they open on the first click, and
   a chunk fetch there would cost more than the bytes save. */
const ProvenanceDrawer = React.lazy(() =>
  import("./provenance.jsx").then((m) => ({ default: m.ProvenanceDrawer })));

/* The ledger is a whole second surface and most visits never open it, so it is split out too.
   Its own root element carries the grid class: React.Suspense emits no DOM node, so whatever
   the lazy component renders IS the grid child. */
const CalibrationLedger = React.lazy(() =>
  import("./calibration.jsx").then((m) => ({ default: m.CalibrationLedger })));

const DATA_BASE = "data";
const DEFAULT_RADIUS_KM = 500;

export function Atlas() {
  const [archive, setArchive] = React.useState(null);
  const [manifest, setManifest] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [world, setWorld] = React.useState(null);
  const [coast, setCoast] = React.useState(null);

  /* THE SINGLE SOURCE OF TRUTH. One object decides which storms are drawn, which are counted,
     what the outcome cards say, what the URL carries and what a saved scenario is. The rail
     writes to it; nothing else holds query state. */
  const [cohort, setCohortState] = React.useState(() => parseQuery(location.search).spec);
  /* WHAT THE READER LAST CHANGED, which is what the comparison is against by default.
     A fixed position in the lifecycle order would be the wrong default: a reader who narrows to
     Aug-Sep wants to see what the months did, not what the season floor did, and "last in
     lifecycle order" happens to be the season. Tracked here because only the shell knows which
     click produced the current cohort. `baselinePin` overrides it when the reader picks a
     different condition to hold out -- which is the what-if control. */
  const [lastChanged, setLastChanged] = React.useState(null);
  const [baselinePin, setBaselinePin] = React.useState(null);

  const setCohort = React.useCallback((next) => {
    setCohortState((prev) => {
      const n = typeof next === "function" ? next(prev) : next;
      const k = changedKeyOf(n, prev);
      if (k) { setLastChanged(k); setBaselinePin(null); }
      return n;
    });
  }, []);
  const [urlVersion] = React.useState(() => parseQuery(location.search).versionMismatch);
  /* WHICH SURFACE. Read from the URL on mount so the calibration ledger is addressable -- the
     terminal home links straight to it and every refusal deep-links to its own contract row.
     Named `surface` and not `view`: `view` below is the map viewport, and reusing the word
     would make this diff read as a rename of something unrelated.
     The tactical surface stays the default. The DOM and bench harnesses load a bare
     /storm-atlas/ and immediately reach for __ATLAS_MAP, which only exists while the map is
     mounted, so a calibration default would break both. */
  const [surface, setSurface] = React.useState(
    () => (new URLSearchParams(location.search).get("view") === "calibration"
      ? "calibration" : "tactical"));
  const [ledgerAnchor, setLedgerAnchor] = React.useState(
    () => new URLSearchParams(location.search).get("contract") || null);
  const [cal, setCal] = React.useState(null);
  const [calError, setCalError] = React.useState(null);
  /* THE METHODOLOGY A SHARED LINK WAS MADE UNDER. A cohort URL carries `v`, which versions the
     SPEC SHAPE, and until 1.1.0 nothing carried the methodology at all -- so a bump silently
     re-answered every link anyone had shared, with different refusals and no notice. A change
     no reader can detect is a silent one from their side, whatever the commit log says. */
  const [urlMethodology] = React.useState(
    () => new URLSearchParams(location.search).get("m"));
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
      /* THE COASTLINE COMES AFTER THE TRACKS, DELIBERATELY. It is the geometry the landfall
         rule tests against and it is the plate's authoritative line, but it is 226 KB and the
         map is legible without it. Requesting it here rather than in parallel with the pack
         keeps the critical path exactly what it was. Nothing is substituted while it is in
         flight: the contextual tier draws, and the modelled regions arrive when they arrive. */
      fetchCoastlines(`${DATA_BASE}/atlas-coastlines-v1.bin.gz`).then((c) => {
        if (cancelled) return;
        setCoast(c);
        globalThis.__ATLAS_COASTLINES = c;
      }).catch((e) => {
        /* A missing coastline is not a missing archive. The plate keeps its contextual tier
           and says so in the foot band rather than claiming a contrast it does not have. */
        if (!cancelled) setCoast({ failed: String(e && e.message ? e.message : e) });
      });
    }).catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, []);

  const bounds = React.useMemo(() => (archive ? seasonRange(archive) : [1851, 2026]), [archive]);
  const home = React.useMemo(() => (archive ? coreFrame(archive) : null), [archive]);
  /* ONE COHORT, ONE ANSWER. Membership and outcomes come from the same object now: the storms
     drawn on the map ARE the storms in every denominator. Until 3.2 these were two calls -- one
     deciding what was drawn, another deciding what was scored -- and keeping them from
     disagreeing was the shell's job rather than the engine's. */
  const result = React.useMemo(
    () => (archive ? cohortResult(archive, cohort) : null), [archive, cohort]);

  /* THE BASELINE IS ONE OBJECT, USED TWICE. It is the population drawn behind the cohort on the
     map AND the reference every delta is measured against -- and those must be the same thing,
     or the picture and the numbers are answering different questions, which is the exact failure
     3.2 existed to end. The condition it holds out is the one the reader pinned, else the one
     they last changed, else the last in lifecycle order. */
  const baselineKey = baselinePin || lastChanged;
  const baselineSpec = React.useMemo(
    () => parentOf(cohort, baselineKey || undefined), [cohort, baselineKey]);
  const context = React.useMemo(
    () => (archive && baselineSpec ? cohortResult(archive, baselineSpec) : null),
    [archive, baselineSpec]);

  const comparison = React.useMemo(
    () => (result && context ? compareResults(result, context) : null), [result, context]);

  /* THE ENVIRONMENT LENS. Coverage is answered from the core pack -- `env_at_genesis_row` is a
     core index -- so how many of this cohort can be evaluated at all, and the NOT EVALUABLE
     refusal that follows, cost nothing and are honest on first paint. The 991 KB environment
     block is fetched only when a reader asks to see the distributions, and `envEpoch` exists
     so the lens recomputes once it lands: the archive object is mutated in place by
     loadEnvironment, which React has no way to notice. */
  const [envLoading, setEnvLoading] = React.useState(false);
  const [envEpoch, setEnvEpoch] = React.useState(0);
  const envCov = React.useMemo(
    () => (archive && result ? envCoverage(archive, result.rows) : null), [archive, result]);
  const envLens = React.useMemo(
    () => (archive && result && envEpoch ? envAtGenesis(archive, result.rows) : null),
    [archive, result, envEpoch]);
  const loadEnv = React.useCallback(() => {
    if (!archive || archive.env) { setEnvEpoch((n) => n + 1); return; }
    setEnvLoading(true);
    archive.loadEnvironment(`${DATA_BASE}/atlas-env-v1.bin.gz`)
      .then(() => { setEnvEpoch((n) => n + 1); })
      .finally(() => setEnvLoading(false));
  }, [archive]);

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
    /* MERGED, NOT REPLACED. toQuery builds a fresh URLSearchParams from the spec alone, so
       writing it straight back would silently drop ?view= and ?contract= on the next chip
       click -- a deep link into the ledger that survives exactly until the reader touches
       anything. The cohort still owns every key it knows about; the surface owns the rest. */
    const p = new URLSearchParams(toQuery(cohort));
    if (surface !== "tactical") p.set("view", surface);
    if (ledgerAnchor) p.set("contract", ledgerAnchor);
    /* Stamped ALONGSIDE the cohort, never inside toQuery: the methodology is not part of a
       cohort's identity, and folding it in would make two identical cohorts built under
       different versions stop comparing equal. */
    if (archive) p.set("m", archive.manifest.methodology_version);
    const q = p.toString();
    const next = q ? `?${q}` : location.pathname;
    if (location.search.replace(/^\?/, "") !== q) history.replaceState(null, "", next);
  }, [cohort, surface, ledgerAnchor, archive]);

  /* The ledger's 16 KB is fetched only when the ledger is opened. Nothing on the tactical
     surface needs it, and a reader who never asks the question should not pay for the answer. */
  React.useEffect(() => {
    if (surface !== "calibration" || cal || calError) return;
    let cancelled = false;
    loadCalibration(DATA_BASE)
      .then((c) => { if (!cancelled) setCal(c); })
      .catch((e) => { if (!cancelled) setCalError(e); });
    return () => { cancelled = true; };
  }, [surface, cal, calError]);

  /* A refusal on the tactical surface asks for its evidence. */
  const openLedger = React.useCallback((contractKey) => {
    setLedgerAnchor(contractKey || null);
    setSurface("calibration");
    setSelected(null);
  }, []);

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

  /* THE LEDGER IS A SURFACE, NOT A PANEL. It replaces the rail, stage and panel rather than
     opening beside them, because a page that answers "is any of this any good" while the thing
     being judged is still on screen invites the reader to skim it. The header stays: the
     archive's scale and the provenance key belong on both surfaces. */
  if (surface === "calibration") {
    return (
      <div data-surface="calibration" data-view="calibration" data-atlas className="atlas-shell" style={{
        position: "fixed", inset: 0,
        background: "var(--surface-app)", color: "var(--text-1)", overflow: "hidden",
      }}>
        <Header archive={archive} onProvenance={() => setProvOpen(true)} />
        <React.Suspense fallback={<LedgerBoot />}>
          {calError ? <LedgerError error={calError} onBack={() => setSurface("tactical")} />
            : cal ? (
              <CalibrationLedger cal={cal} anchor={ledgerAnchor}
                onBack={() => { setSurface("tactical"); setLedgerAnchor(null); }}
                onClearAnchor={() => setLedgerAnchor(null)} />
            ) : <LedgerBoot />}
        </React.Suspense>
        <React.Suspense fallback={null}>
          {provOpen ? (
            <ProvenanceDrawer archive={archive} coast={coast} open={provOpen}
              onClose={() => setProvOpen(false)} frame={null} />
          ) : null}
        </React.Suspense>
      </div>
    );
  }

  return (
    <div data-surface="tactical" data-view="tactical" data-atlas className="atlas-shell" style={{
      position: "fixed", inset: 0,
      background: "var(--surface-app)", color: "var(--text-1)", overflow: "hidden",
    }}>
      <Header archive={archive} onProvenance={() => setProvOpen(true)}
        onLedger={() => openLedger(null)} />

      <div className="atlas-rail" style={{ overflowY: "auto",
        borderRight: "1px solid var(--border-dim)", background: "var(--surface-card)" }}>
        <MethodologyMoved was={urlMethodology} now={archive.manifest.methodology_version} />
        <CohortBuilder archive={archive} cohort={cohort}
          setCohort={(f) => setCohort(normalise(f))}
          result={result} preview={preview}
          layers={layers} setLayers={setLayers} bounds={bounds}
          mode={mode} setMode={setMode}
          showPathway={showPathway} setShowPathway={setShowPathway}
          showGenesisDensity={showGenesisDensity} setShowGenesisDensity={setShowGenesisDensity}
          timeline={timeline} sentence={sentence} conditions={conditionsOf(cohort)}
          envCoverage={envCov}
          onReset={() => { setCohort(normalise(EMPTY_COHORT)); setSelected(null); }} />
      </div>

      <div className="atlas-stage" style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
        <AtlasMap
          archive={archive} world={world} coast={coast} rows={contextRows} emphasis={emphasis}
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
          kept={result.kept} lifted={emphasis ? emphasis.length : 0}
          selectedCount={selected === null ? 0 : 1}
        >
          {mode === "explore" && !cohort.where && selected === null ? <Invitation /> : null}
          <Legend colorBy={layers.colorBy} showPathway={showPathway} probe={!!cohort.where}
            showGenesisDensity={showGenesisDensity} />
        </AtlasMap>
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
            pathwayOn={showPathway} onShowPathway={setShowPathway}
            comparison={comparison} conditions={conditionsOf(cohort)}
            onBaseline={setBaselinePin}
            archive={archive} envCoverage={envCov} envLens={envLens}
            envLoading={envLoading} onLoadEnv={loadEnv} onEvidence={openLedger} />
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
          <ProvenanceDrawer archive={archive} coast={coast} open={provOpen}
            onClose={() => setProvOpen(false)} frame={view ? view.frame : null} />
        ) : null}
      </React.Suspense>
    </div>
  );
}

/* THE OPENING VIEW.
 *
 * WHY NOT THE ARCHIVE'S FULL EXTENT. `genesisBounds` returns the min/max of every genesis
 * coordinate, and this archive holds 343 storms with a West Pacific genesis -- IBTrACS keeps
 * dateline crossers in the loaded basin files -- so its longitude range runs -179.8 to +180.0.
 * That is 359.8 degrees, and fitting it opened the plate on the entire planet at the minimum
 * zoom: measured, latitude -88.5 to +89.4 on a 1920x1742 workstation, Antarctica and the Arctic
 * both on screen and 13.7% of the plate carrying any track ink. The reader met a dark void with
 * a band in it.
 *
 * WHAT THIS FRAMES INSTEAD. The archive's own mass, in three measured steps and nothing else:
 *
 *   1. THE DOMINANT LOBE. Longitude is bimodal here -- a North Atlantic / East Pacific lobe and
 *      a West Pacific tail of 343 storms, with 128 degrees of empty longitude between them:
 *      from 14W to 114E this archive holds not one genesis. The lobe is taken as every genesis
 *      within LOBE_DEG of the archive's MEDIAN genesis longitude, measured the short way round.
 *      Measured on this pack: 3,588 of 3,905 storms, 91.9%, which is precisely the North
 *      Atlantic plus East Pacific the plate is titled for.
 *   2. ITS CORE LONGITUDE, at the 1st and 99th percentile of that lobe. Percentiles rather than
 *      extremes because one storm at 179.8W should not widen the opening view by 15 degrees.
 *   3. ITS LATITUDE BAND, from the TRACK POINTS of those storms rather than their genesis --
 *      the plate draws whole trajectories, and a storm that forms at 12N and recurves to 50N
 *      occupies all of that. The floor is the genesis floor, because nothing forms below it.
 *
 * WHAT IT COMES OUT AS, on this pack: 1.9N to 58.0N, 166.3W to 17.4W. That is 148.9 degrees of
 * longitude against 56.1 of latitude -- in Web Mercator a band 2.14 times wider than it is tall,
 * which is the number the plate's aspect cap in atlas.css is derived from. The two have to be
 * read together: this decides WHAT the plate opens on, and the cap decides what SHAPE it opens
 * on, and a fit is only honest when both are right.
 *
 * NOTHING HERE IS A CLAIM. It is a camera position, derived from coordinates the pack already
 * holds, and it changes only where the map opens: pan, zoom and every filter behave exactly as
 * before, and the West Pacific is one drag away. The percentiles are stated here rather than
 * tuned by eye so the framing moves with the archive if the archive moves.
 */
const LOBE_DEG = 110;      // half-width of the dominant-lobe window, in degrees of longitude
const CORE_Q = 0.01;       // the lobe's core longitude, at q1..q99
const TRACK_Q = 0.005;     // the band's north edge, at q99.5 of the lobe's track latitudes

export function coreFrame(archive) {
  const glat = archive.genesisLat;
  const glon = archive.genesisLon;

  const lons = [];
  for (let i = 0; i < archive.nStorms; i++) {
    if (!Number.isNaN(glat[i])) lons.push(glon[i]);
  }
  if (!lons.length) return genesisBounds(archive);
  const median = quantile(lons.slice().sort(asc), 0.5);

  /* Short-way separation, so a lobe that straddles the antimeridian is still one lobe. */
  const near = (lon) => {
    const d = Math.abs(lon - median) % 360;
    return (d > 180 ? 360 - d : d) <= LOBE_DEG;
  };

  const lobeLon = [];
  const rows = [];
  for (let i = 0; i < archive.nStorms; i++) {
    if (Number.isNaN(glat[i]) || !near(glon[i])) continue;
    lobeLon.push(glon[i]);
    rows.push(i);
  }
  if (lobeLon.length < 2) return genesisBounds(archive);
  lobeLon.sort(asc);

  /* The latitude the plate has to hold is the one the TRACKS reach, not the one they start at.
     Sampled every third fix: the band is a framing decision, not a measurement anyone cites. */
  const lat = [];
  let floor = Infinity;
  for (const i of rows) {
    if (glat[i] < floor) floor = glat[i];
    const [s, e] = archive.trackRange(i);
    for (let k = s; k < e; k += 3) lat.push(archive.ptLat[k] / 100);
  }
  if (!lat.length) return genesisBounds(archive);
  lat.sort(asc);

  const south = Math.min(floor, quantile(lat, TRACK_Q));
  const north = quantile(lat, 1 - TRACK_Q);
  return [[south, quantile(lobeLon, CORE_Q)], [north, quantile(lobeLon, 1 - CORE_Q)]];
}

function asc(a, b) { return a - b; }

function quantile(sorted, p) {
  const i = Math.round(p * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, i))];
}

/* WHAT CHANGED UNDER A LINK SOMEONE ALREADY HAD.
 *
 * Shown only when a URL carries a methodology version other than this build's. It does not
 * refuse to answer -- the cohort is the same cohort and the counts are the same counts -- it
 * says which definitions moved, because the one thing a reader of a shared scenario cannot do
 * is notice that the refusals were recomputed. 1.1.0 is named specifically: it is the only bump
 * so far and the only one whose effect a reader would see. */
function MethodologyMoved({ was, now }) {
  if (!was || !now || was === now) return null;
  return (
    <div data-methodology-moved style={{
      margin: "var(--sp-5) var(--sp-6) 0",
      border: "1px solid var(--border-strong)",
      borderLeft: "var(--bw-signal) solid var(--warn)",
      borderRadius: "var(--radius-sm)", padding: "var(--sp-3) var(--sp-4)",
      background: "color-mix(in srgb, var(--warn) 6%, transparent)",
    }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800,
        color: "var(--warn)", letterSpacing: ".5px" }}>
        THE METHODOLOGY MOVED SINCE THIS LINK WAS MADE
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 3 }}>
        This link was made under methodology {was}; the archive now publishes under {now}. The
        cohort is unchanged and so are its counts — what may differ is which contracts are
        refused. 1.1.0 stopped counting the refusal gate over the whole archive and started
        counting it over the population a query can actually draw from, so some contracts that
        published a rate under {was} now refuse as OUT OF SCOPE.
      </div>
    </div>
  );
}

function LedgerBoot() {
  return (
    <div className="atlas-calibration" style={{ display: "flex", alignItems: "center",
      justifyContent: "center", color: "var(--text-2)", ...MONO,
      fontSize: "var(--fs-mono-sm)" }}>
      reading the calibration ledger…
    </div>
  );
}

/* A ledger that will not load says so and offers the way back. It does NOT fall through to an
   empty page: a calibration surface that renders nothing reads exactly like a calibration
   surface with nothing to report. */
function LedgerError({ error, onBack }) {
  return (
    <div className="atlas-calibration" style={{ display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: "var(--sp-4)",
      padding: "var(--sp-8)", textAlign: "center" }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-md)", color: "var(--neg)",
        letterSpacing: "var(--track-label)" }}>[ THE LEDGER COULD NOT BE READ ]</div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        maxWidth: "60ch", lineHeight: "var(--lh-body)" }}>
        {String(error && error.message ? error.message : error)}
        <br /><br />
        No calibration figures are shown rather than stale ones. The scores this page reports
        are the archive's; without the file there is nothing to report.
      </div>
      <button type="button" onClick={onBack} style={{
        ...MONO, fontSize: "var(--fs-mono-xs)", padding: "5px 10px", background: "transparent",
        border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
        color: "var(--text-2)", cursor: "pointer",
      }}>← BACK TO THE MAP</button>
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

function Header({ archive, onProvenance, onLedger }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  return (
    <header className="at-header">
      <div className="at-brand">
        <h1>Storm Atlas</h1>
        {/* The tagline ellipsises before the rail's floor does, so the whole of it is carried
            as the element's own title as well as its text. */}
        <div className="at-sub" title="Millibar · genesis-to-intensity archive">
          <a href="../" title="back to Millibar Terminal">‹ Millibar</a>
          {" · genesis-to-intensity archive"}
        </div>
      </div>
      <ScaleLine manifest={m} />
      <div className="at-sys">
        <div className="at-stack">
          <div title={`METHODOLOGY ${m.methodology_version} · PACK ${p.archive_stamp}`}>
            METHODOLOGY <em>{m.methodology_version}</em> · PACK <em>{p.archive_stamp}</em>
          </div>
          <div title={`BUILT ${p.archive_built_utc || ""}`}>
            BUILT <em>{(p.archive_built_utc || "").replace("T", " ").replace(/:\d\dZ?$/, "Z")}</em>
          </div>
        </div>
        {/* NOT BEHIND A TOGGLE. The ledger is how a reader checks whether anything else on this
            site is worth believing, so it sits in the masthead beside provenance rather than
            inside a panel someone has to know to open. */}
        {onLedger ? (
          <TextButton onClick={onLedger} hook="data-open-ledger"
            title="how well calibrated is this? the archive's own backtest">Calibration</TextButton>
        ) : null}
        <TextButton onClick={onProvenance} title="provenance (P)">Provenance</TextButton>
      </div>
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
    <div data-surface="tactical" data-atlas style={{
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
    <div data-surface="tactical" data-atlas style={{
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
