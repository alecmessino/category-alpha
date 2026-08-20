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
 *
 * THE CHROME IS LOCKED TO THE COLUMNS. The header is three zones whose widths are the rail's,
 * the map's and the panel's, so the instrument reads as one frame rather than as a bar sitting
 * on top of three panes. One pair of CSS variables drives both, which is what keeps the lock
 * through every breakpoint.
 *
 * TWO THINGS ARE RENDERED ONCE, BY THIS SHELL, RATHER THAN BY EACH STATE: the Cohort Spec that
 * states which population is being described, and the Epistemic Key that defines the five
 * marks. Both are properties of the surface, not of a panel, and a copy per state is a copy
 * that drifts.
 */

import React from "react";
import { loadArchive } from "../engine/archive.js";
import { fetchCoastlines } from "../engine/coastlines.js";
import { genesisDensity, getAnalogs, pathwayDensity } from "../engine/analogs.js";
import {
  DEFAULT_FILTERS, INTENSITY_FILTERS, LANDFALL_FILTERS, filterStorms, genesisBounds, seasonRange,
} from "../engine/query.js";
import { activeAt, advance, buildTimeline, fromActive, toActive } from "../engine/timeline.js";
import { formatPosition } from "../engine/geo.js";
import { projectWorld } from "../render/atlas-layer.js";
import { AtlasMap } from "./map.jsx";
import { Rail } from "./rail.jsx";
import { StormPanel } from "./storm-panel.jsx";
import { ProbePanel } from "./probe-panel.jsx";
import { Transport } from "./transport.jsx";
import { ArchiveTransport } from "./archive-transport.jsx";
import {
  Drv, EpistemicKey, Head, Lede, MONO, Masthead, Note, Prose, Refusal, Row, TextButton, claimText,
} from "./kit.jsx";

/* Split out of the entry chunk. The drawer is reached by a button or the P key, never on the
   path to a first paint or a first click, so its bytes should not be in the file that has to
   arrive before the map can draw. The panels are NOT split: they open on the first click, and
   a chunk fetch there would cost more than the bytes save. */
const ProvenanceDrawer = React.lazy(() =>
  import("./provenance.jsx").then((m) => ({ default: m.ProvenanceDrawer })));

const DATA_BASE = "data";
const DEFAULT_RADIUS_KM = 500;
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function Atlas() {
  const [archive, setArchive] = React.useState(null);
  const [manifest, setManifest] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [world, setWorld] = React.useState(null);
  const [coast, setCoast] = React.useState(null);

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

  /* THE DENSITY SURFACES ARE NOT TIED TO A PROBE. With a probe they show the matched pool --
     where those storms went. Without one they show the current filter over the whole archive,
     which is what makes "all storms · TS+ · Cat 3+ · Mexico · CONUS · Hawaii" reachable: every
     one of those is a filter that already exists. Measured at 7.9 ms for all 3,885 storms. */
  const pathway = React.useMemo(() => {
    if (!archive || !result || !showPathway) return null;
    if (analog) return analog.track_density;
    return pathwayDensity(archive, result.rows, 2.0);
  }, [archive, result, showPathway, analog]);

  const genesisGrid = React.useMemo(() => {
    if (!archive || !result || !showGenesisDensity) return null;
    return genesisDensity(archive, emphasis && emphasis.length ? emphasis : result.rows, 2.0);
  }, [archive, result, showGenesisDensity, emphasis]);

  /* The replay clock, built from whatever the filter currently selects. Rebuilt on a filter
     change on purpose: a run is over a population, and changing the population is a new run. */
  const timeline = React.useMemo(
    () => (archive && result && mode === "replay" ? buildTimeline(archive, result.rows) : null),
    [archive, result, mode]);

  React.useEffect(() => {
    if (mode !== "replay") { setPlaying(false); return; }
    setReplayCursorMin(timeline && timeline.n ? timeline.firstT : null);
  }, [mode, timeline]);

  const selectStorm = React.useCallback((row) => {
    setSelected(row);
    setProbe(null);
    setCursorMs(null);
    setPlaying(false);
  }, []);

  // Handles for the interaction checks, alongside __ATLAS_MAP. Nothing in the app reads them.
  React.useEffect(() => { globalThis.__ATLAS_SELECT = selectStorm; }, [selectStorm]);
  React.useEffect(() => { globalThis.__ATLAS_SET_CURSOR = setCursorMs; }, []);

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
  const spec = cohortSpec({ archive, filters, probe, storm, bounds });

  return (
    <div data-surface="tactical" data-atlas className="atlas-shell">
      <Header archive={archive} onProvenance={() => setProvOpen(true)} />

      <div className="atlas-rail" style={{ overflowY: "auto" }}>
        <Rail archive={archive} filters={filters} setFilters={setFilters} result={result}
          layers={layers} setLayers={setLayers} bounds={bounds}
          mode={mode} setMode={setMode}
          showPathway={showPathway} setShowPathway={setShowPathway}
          showGenesisDensity={showGenesisDensity} setShowGenesisDensity={setShowGenesisDensity}
          timeline={timeline} probe={probe}
          onReset={() => { setFilters(DEFAULT_FILTERS); setSelected(null); setProbe(null); }} />
      </div>

      <div className="atlas-stage">
        <AtlasMap
          archive={archive} world={world} coast={coast} rows={result.rows} emphasis={emphasis}
          selected={selected} home={home}
          onSelect={selectStorm} onProbe={onProbe} probe={probe}
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
          {mode === "explore" && !probe && selected === null ? <Invitation /> : null}
          <Legend colorBy={layers.colorBy} showPathway={showPathway} probe={!!probe}
            showGenesisDensity={showGenesisDensity} />
        </AtlasMap>
      </div>

      <div className="atlas-panel" style={{ overflowY: "auto" }}>
        {storm ? (
          <StormPanel storm={storm} archive={archive} spec={spec}
            onClose={() => setSelected(null)}
            onReplay={() => setPlaying((v) => !v)} replaying={playing} />
        ) : probe ? (
          <ProbePanel probe={probe} result={analog} peak={analog ? peakOf(analog) : 0} spec={spec}
            onRadius={(km) => setProbe((p) => ({ ...p, radiusKm: km }))}
            onClose={() => setProbe(null)} onSelectStorm={selectStorm}
            pathwayOn={showPathway} onShowPathway={setShowPathway} />
        ) : mode === "replay" ? (
          <ReplayNote timeline={timeline} result={result} spec={spec} />
        ) : (
          <Introduction archive={archive} result={result} spec={spec} />
        )}
        {/* Once, by the shell. Not per state. */}
        <div className="at-pad" style={{ paddingTop: 0 }}><EpistemicKey /></div>
      </div>

      <div className="atlas-transport">
        {mode === "replay" ? (
          <ArchiveTransport timeline={timeline} cursorMin={replayCursorMin}
            setCursorMin={setReplayCursorMin} playing={playing} setPlaying={setPlaying} />
        ) : selected !== null ? (
          <Transport archive={archive} row={selected} playing={playing} setPlaying={setPlaying}
            cursorMs={cursorMs} setCursorMs={setCursorMs} />
        ) : <KeyboardHint />}
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
 * That is 359.8 degrees: fitting it opens the plate on the entire planet, pole to pole, at the
 * minimum zoom. Measured, 20.4% of the plate carried any track ink at rest and the rest was
 * Arctic, Southern Ocean and empty Indian Ocean. The reader met a dark void with a band in it.
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
 * WHAT IT COMES OUT AS, on this pack: 1.9N to 58.0N, 166.3W to 17.4W -- 149 degrees of
 * longitude against 56 of latitude, which in Mercator is a band about 2.1 times wider than it
 * is tall. Every proportion decision downstream of this, in the stylesheet and in the fit, is
 * that ratio.
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

/* THE COHORT SPEC, as a string.
 *
 * Derived entirely from state already on screen. Every segment restates a control the reader
 * can see: the season boxes, the month strip, the basin chips, the intensity threshold the rail
 * already applied, the probe's own radius, the storm they selected -- then the two stamps the
 * pack carries about itself. Nothing here computes anything, and nothing here is a claim the
 * panel above it has not already made.
 */
export function cohortSpec({ archive, filters, probe, storm, bounds }) {
  const m = archive.manifest;
  const f = filters;
  const out = [];

  const allBasins = archive.storms.col("basin").dictionary || [];
  const basins = f.basins && f.basins.length ? f.basins : allBasins;
  out.push(`BASIN ${basins.join("+")}`
    + (f.subbasinsEntered ? ` ∩ ENTERED ${f.subbasinsEntered.join("+")}` : "")
    + (f.namedOnly ? " ∩ NAMED" : ""));

  out.push(`SEASONS ${f.seasonFrom === null ? bounds[0] : f.seasonFrom}`
    + `–${f.seasonTo === null ? bounds[1] : f.seasonTo}`
    + (f.includeProvisional ? " +PROVISIONAL" : ""));

  out.push("GENESIS MONTHS "
    + (f.months && f.months.length
      ? f.months.map((mo) => MONTH_INITIALS[mo - 1]).join("")
      : "ALL"));

  const threshold = (INTENSITY_FILTERS.find((x) => x.key === f.intensity) || {}).threshold;
  out.push(`PEAK ${threshold === null || threshold === undefined ? "UNFILTERED" : `≥${threshold} KT`}`);

  const lf = LANDFALL_FILTERS.find((x) => x.key === f.landfall);
  out.push(`LANDFALL ${lf ? lf.label : "UNFILTERED"}`);

  if (probe) {
    out.push(`GENESIS WITHIN ${probe.radiusKm} KM OF ${formatPosition(probe.lat, probe.lon)}`);
  }
  if (storm) out.push(`STORM ${storm.atcf_id || storm.storm_id}`);

  out.push(`METHODOLOGY ${m.methodology_version}`);
  out.push(`PACK ${m.provenance.archive_stamp}`);
  return out.join(" · ");
}

/* The archive's scale, on screen before anything is interactive. Counts come from the pack that
   was actually loaded -- not from a constant, and not from MANIFEST.json, which is stale for
   two of these tables.
   It degrades by dropping whole figures rather than by clipping one: a count missing its last
   digit is a wrong count, while an absent count is only an absent one. */
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
    <div className="at-ledger" style={dim ? { opacity: 0.75, flex: "none" } : undefined}>
      {items.map(([n, label]) => (
        <div className="at-fig" key={label}>
          <b>{n.toLocaleString()}</b>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Header({ archive, onProvenance }) {
  const m = archive.manifest;
  const p = m.provenance || {};
  return (
    <header className="at-header">
      <div className="at-brand">
        <h1>Storm Atlas</h1>
        <div className="at-sub">
          <a href="../" title="back to Millibar Terminal">‹ Millibar</a>
          {" · genesis-to-intensity archive"}
        </div>
      </div>
      <ScaleLine manifest={m} />
      <div className="at-sys">
        <div className="at-stack">
          <div>METHODOLOGY <em>{m.methodology_version}</em> · PACK <em>{p.archive_stamp}</em></div>
          <div>BUILT <em>{(p.archive_built_utc || "").replace("T", " ").replace(/:\d\dZ?$/, "Z")}</em></div>
        </div>
        <TextButton onClick={onProvenance} title="provenance (P)">Provenance</TextButton>
      </div>
    </header>
  );
}

/* The one instruction the surface gives, placed where the gesture happens. */
function Invitation() {
  return (
    <div className="at-invite">
      <em>Click any ocean point</em> — what formed there, and where it went &nbsp;·&nbsp;{" "}
      <em>Click a genesis point</em> for one storm
    </div>
  );
}

/* The transport's resting state. It also carries the live cursor position, so the readout
   survives the plate foot band's narrow-width degradation rather than disappearing with it. */
function KeyboardHint() {
  return (
    <div className="at-transport">
      <div className="at-hint">
        <span><em>CLICK OCEAN</em> ASK WHAT FORMED THERE</span>
        <span><em>CLICK GENESIS POINT</em> FOLLOW ONE STORM</span>
        <span><em>P</em> PROVENANCE</span>
        <span><em>ESC</em> CLEAR</span>
        <span className="at-r"><em id="at-coords2">—</em></span>
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
    surfaces.push(["79, 195, 247", "HISTORICAL PATHWAY FREQUENCY",
      probe ? "storms of the matched pool through each 2° cell — not a forecast"
        : "storms of the current filter through each 2° cell — not a forecast"]);
  }
  if (showGenesisDensity) {
    surfaces.push(["155, 123, 240", "GENESIS COUNT",
      "storms that formed in each 2° cell — a count, not a rate"]);
  }
  if (colorBy !== "intensity" && !surfaces.length) return null;
  return (
    <div className="at-legend">
      {surfaces.map(([hue, title, note]) => (
        <div className="at-lrow" key={title}>
          <span className="at-sw">
            {[0.16, 0.36, 0.6].map((a) => (
              <i key={a} style={{ background: `rgba(${hue}, ${a})` }} />
            ))}
          </span>
          <span>{title}<span className="at-d"> · {note}</span></span>
        </div>
      ))}
      {colorBy === "intensity" ? (
        <div className="at-lrow">
          {items.map(([k, label]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <i style={{ width: 10, height: 2, display: "block", background: CAT_HEX[k] }} />
              {label}
            </span>
          ))}
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <i style={{ width: 10, height: 2, display: "block", background: "#6a7c92" }} />
            <span className="at-d">no wind recorded</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

const CAT_HEX = { ts: "#8cbdea", cat1: "#4fc3f7", cat2: "#f2c14e", cat3: "#ee7a1f",
  cat4: "#ef5350", cat5: "#9b7bf0" };

function Introduction({ archive, result, spec }) {
  const m = archive.manifest;
  const q = m.quality;
  return (
    <>
      <Masthead kicker="The archive at rest" right={`${result.kept.toLocaleString()} SHOWN`}
        title="Every line on this map is a storm that happened" spec={spec} />
      <div className="at-pad">
        <Lede style={{ marginTop: 14 }}>
          The subject is a historical population, not a forecast. You interrogate it by asking
          where a storm formed — and the map answers with trajectories.
        </Lede>
        <Prose style={{ marginTop: 12 }}>
          <strong>Click any point on the ocean</strong> to ask what formed near there and where it
          went. <strong>Click a genesis point</strong> — one of the cyan dots — to follow that
          storm from its first fix to its last.
        </Prose>
        <Prose style={{ marginTop: 10 }}>
          Tracks themselves are not click targets. At this zoom forty of them lie under any given
          pixel, so a click on one would select a storm essentially at random. The genesis points
          are discrete, and so is the choice.
        </Prose>

        <Head n="01">What the archive holds</Head>
        <Row k="storms" v={m.counts.storms.toLocaleString()} />
        <Row k="with a genesis point" v={q.storms_with_genesis.toLocaleString()}
          title="54 storms have no genesis point at all. They are excluded from a genesis-keyed
                 view and counted, rather than drawn from a position the archive does not have." />
        <Row k="observed fixes" v={q.track_points.observed.toLocaleString()} />
        <Row k="interpolated fixes" v={q.track_points.interpolated.toLocaleString()}
          title="Interpolated by IBTrACS, not by this archive. An interpolated point may never
                 establish a threshold crossing." />
        <Row k="landfalls" v={m.counts.landfalls.toLocaleString()} />
        <Row k="landfalls with a withheld class" v={q.landfall_category_withheld.toLocaleString()}
          title="Segment crossings whose bracketing fixes disagreed about the Saffir-Simpson
                 class. The archive publishes none rather than interpolating one." />
        <Note style={{ marginTop: 10 }}>{claimText("atlas.subject")}</Note>

        <Head n="02" right="±12 h of genesis">Environment</Head>
        <Row k="storms with a record near genesis"
          v={`${q.storms_with_env_at_genesis.toLocaleString()} / ${m.counts.storms.toLocaleString()}`} />
        <Refusal kind="cond">{claimText("atlas.environment")}</Refusal>

        <Note style={{ marginTop: 12 }}>
          Where the archive cannot answer, it says so. That is the point.
        </Note>
      </div>
    </>
  );
}

/* What the run is doing, and what it is doing to time. The skip is a real distortion of pace and
   the reader is told about it before it happens, not only when it flashes past on the transport. */
function ReplayNote({ timeline, result, spec }) {
  const tl = timeline;
  return (
    <>
      <Masthead kicker="Replay"
        right={tl && tl.n ? `${tl.n.toLocaleString()} TRACKS` : "NO TRACKS"}
        title="The record, in the order it happened" spec={spec} />
      <div className="at-pad">
        {!tl || !tl.n ? (
          <Lede style={{ marginTop: 14 }}>
            The current filter selects no storms, so there is nothing to replay.
          </Lede>
        ) : (
          <>
            <Lede style={{ marginTop: 14 }}>
              {tl.n.toLocaleString()} storms between {fmtYear(tl.firstT)} and {fmtYear(tl.lastT)}.
            </Lede>
            <Prose style={{ marginTop: 10 }}>
              Tracks stay on the map as they are revealed, so what builds up is the shape of the
              whole record rather than one storm at a time.
            </Prose>

            <Head n="01" right="honest pace">What the clock does</Head>
            {/* Stated as years rather than as a percentage, deliberately: this build renders no
                percentage it computed itself, and "43.5 of 174.5 years" is the more concrete
                statement anyway. */}
            <Row k="calendar span" v={<span>{yearsOf(tl.spanMin)} <small>years</small></span>} />
            <Row k="with a storm active"
              v={<span>{yearsOf(tl.activeMin)} <small>years</small><Drv /></span>} />
            <Note style={{ marginTop: 8 }}>
              <b style={{ color: "var(--flag)" }}>The clock skips quiet stretches.</b> The rest is
              off-season, repeated. Those gaps are jumped and every jump is announced on the
              transport. Nothing else is changed: every storm appears, once, in order, over its
              whole observed span.
            </Note>
            {result && result.excluded && result.excluded.noGenesis ? (
              <Note style={{ marginTop: 8 }}>
                {result.excluded.noGenesis} storms are not in this run: the archive holds no
                genesis point for them, so the filter cannot place them.
              </Note>
            ) : null}

            <Head n="02">The filters drive the run</Head>
            <Prose>
              Narrow to Cat 3+ and only the majors unfold; narrow to a landfall region and only
              the storms that reached it do. A run is over a population, and changing the
              population is a new run.
            </Prose>
            <Note style={{ marginTop: 10 }}>{claimText("atlas.replay")}</Note>
          </>
        )}
      </div>
    </>
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
      position: "fixed", inset: 0, background: "var(--stage)", color: "var(--t1)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 18, padding: 24,
    }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
        letterSpacing: "3px", textTransform: "uppercase" }}>STORM ATLAS</div>
      {manifest ? <ScaleLine manifest={manifest} dim /> : null}
      <div style={{ ...MONO, fontSize: 9.5, color: "var(--t3)", letterSpacing: "1px" }}>
        {manifest ? "[ READING THE HISTORICAL ARCHIVE… ]" : "[ OPENING THE ARCHIVE… ]"}
      </div>
    </div>
  );
}

function BootError({ error }) {
  return (
    <div data-surface="tactical" data-atlas style={{
      position: "fixed", inset: 0, background: "var(--stage)", color: "var(--t1)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 11, padding: 24, textAlign: "center",
    }}>
      <div style={{ ...MONO, fontSize: 11, color: "var(--neg)", letterSpacing: "1px" }}>
        [ THE ARCHIVE COULD NOT BE READ ]
      </div>
      <div style={{ ...MONO, fontSize: 10, color: "var(--t3)", maxWidth: 520, lineHeight: 1.65 }}>
        {String(error && error.message ? error.message : error)}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--t3)",
        maxWidth: 520, lineHeight: 1.62 }}>
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
