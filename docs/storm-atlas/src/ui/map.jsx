/* The map, which is the page -- framed as a plate.
 *
 * Conventions are the terminal's, deliberately: preferCanvas, the same zoom range and snap, and
 * the same three-mechanism resize discipline. Two surfaces of one product should not disagree
 * about how a map behaves, and the terminal's map.jsx already learned each of these the hard
 * way.
 *
 * THE PRIMARY INTERACTION IS ON THE MAP ITSELF. Clicking a genesis point selects that storm.
 * Clicking open water asks the archive's central question at that point -- what formed near
 * here, and where did it go -- and answers it by revealing trajectories, not by opening a
 * dialog. That gesture has to be discoverable in one try, so it is the map that responds.
 *
 * THE CAPTION BANDS ARE SIBLINGS OF THE MAP, NOT OVERLAYS. A plate in a journal is captioned
 * above and below, outside the image, and nothing about the figure is ever hidden by its own
 * caption. So the stage is a three-row grid and the map occupies the middle row; the head band
 * says what is drawn and the foot band says at what scale, in what projection, and against
 * which coastline. An overlay would have been easier and would sit on top of the Gulf.
 *
 * TWO TIERS OF COASTLINE, AND THE DIFFERENCE IS THE POINT. The tile layer is CONTEXT -- South
 * America, Africa, Canada, everything the landfall rule never looks at -- and is held back to
 * that role. The five modelled regions are drawn over it from the archive's own rings, at full
 * contrast, by coastline-layer.js. A reader can see, without being told, where this archive can
 * detect a landfall at all.
 */

import React from "react";
import { PopulationLayer } from "../render/population-layer.js";
import { SelectionLayer } from "../render/selection-layer.js";
import { PathwayLayer } from "../render/pathway-layer.js";
import { CoastlineLayer } from "../render/coastline-layer.js";
import { ReplayHeadsLayer, ReplayLayer } from "../render/replay-layer.js";
import { hitGenesis } from "../render/hit-test.js";
import { formatPosition } from "../engine/geo.js";

const L = globalThis.L;

/* Fallback only. The opening view is fitted to the archive's own genesis extent, so the first
   screen frames the ocean this archive actually has something to say about rather than a
   centre someone once typed. */
const FALLBACK_CENTER = [21, -78];
const FALLBACK_ZOOM = 3;
const EMPTY_ROWS = new Uint32Array(0);

/* The scale bar snaps to one of these rather than printing whatever 100 px happens to be.
   A bar labelled "1,143 KM" is a measurement of the viewport, not of the map. */
const SCALE_STEPS = [100, 200, 250, 500, 1000, 2000, 4000];

export function AtlasMap({
  archive, world, coast, rows, emphasis, selected, onSelect, onProbe, probe, replayMs, home,
  colorBy, showPathway, pathway, pathwayStep, dimPopulation, softenEmphasis, onViewChange,
  onHover, showGenesis = true, showLandfalls = true,
  showGenesisDensity, genesisDensity, mode = "explore", timeline, replayCursorMin,
  kept = 0, lifted = 0, selectedCount = 0, hint, children,
}) {
  const el = React.useRef(null);
  const plate = React.useRef(null);
  const map = React.useRef(null);
  const layers = React.useRef({});
  const [ready, setReady] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [frame, setFrame] = React.useState(null);

  // Callers change identity every render; keep them in a ref so the map is built once.
  const cb = React.useRef({});
  cb.current = { onSelect, onProbe, onViewChange, onHover };

  React.useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      preferCanvas: true, zoomControl: false, attributionControl: true,
      minZoom: 2, maxZoom: 8, zoomSnap: 0.25, worldCopyJump: false,
    }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);
    if (home) {
      /* A CONTAIN FIT, AND NOTHING TAKEN OUT OF IT.
       *
       * The plate's aspect is capped at the archive's own working shape in atlas.css, so a
       * contain fit of the core frame already opens on the working region: there is no cover
       * step here, nothing is cropped to make the plate look busier, and the whole frame is on
       * the plate at every supported viewport.
       *
       * What changed is the padding, from 4% on each side to none. `fitBounds` FLOORS the zoom
       * to zoomSnap, which is a quarter step here, so the fit is already as much as 19% looser
       * than the frame asked for before any padding is added. Eight per cent of pad on top of
       * that floor was compounding into as much as 103 degrees of latitude on a plate whose
       * frame is 56 -- and every one of the extra degrees is empty Southern Ocean or Arctic.
       * With no pad the floor is the only slack left, which is what the plate's aspect cap is
       * sized against.
       *
       * The snap floor is deliberate and stays: rounding to the NEAREST step instead would
       * tighten the view by up to half a step, and measured on this pack that took the dominant
       * genesis lobe from 99.9% inside the opening window to 98.1% at one supported width. A
       * frame that is not entirely on the plate is not a frame. */
      try { m.fitBounds(L.latLngBounds(home), { animate: false }); }
      catch { /* a degenerate extent keeps the fallback view */ }
    }
    L.control.zoom({ position: "topright" }).addTo(m);
    /* CONTEXT, AND ONLY CONTEXT. This is the same tile endpoint the terminal draws, backed off
       from 0.62 to 0.42 so it sits at the contextual ink level against the plate's own
       background rather than competing with the archive geometry laid over it. It earns its
       place by drawing the land this archive holds no rings for -- South America, Africa,
       Canada -- and by carrying detail at high zoom outside the modelled regions. */
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 9, opacity: 0.42,
      attribution: "© OpenStreetMap · CARTO",
    }).addTo(m);
    m.attributionControl.addAttribution("IBTrACS · HURDAT2 · Natural Earth 10m");

    const coastline = new CoastlineLayer().addTo(m);
    const pathwayLayer = new PathwayLayer().addTo(m);
    /* A SECOND INSTANCE, not a second class. PathwayLayer already renders a Map of
       "lat,lon" -> count; it owns one density and one peak, so two grids on screen at once
       need two of it. Violet rather than the pathway's cyan: the two surfaces answer different
       questions -- where storms WENT and where they FORMED -- and a shared hue would invite
       reading one for the other. */
    const genesisLayer = new PathwayLayer({ hue: "155, 123, 240", zIndexOffset: 1 }).addTo(m);
    const population = new PopulationLayer().addTo(m);
    const replay = new ReplayLayer().addTo(m);
    const selection = new SelectionLayer().addTo(m);
    const replayHeads = new ReplayHeadsLayer().addTo(m);
    layers.current = { coastline, pathwayLayer, genesisLayer, population, replay, selection,
      replayHeads };

    const readFrame = () => setFrame(measure(m));
    m.on("moveend zoomend resize", () => {
      readFrame();
      if (cb.current.onViewChange) cb.current.onViewChange(readView(m, population));
    });
    m.on("click", (e) => {
      const hit = hitGenesis(archiveRef.current, m, e.containerPoint,
        { rows: rowSetRef.current });
      if (hit) cb.current.onSelect && cb.current.onSelect(hit.row);
      else cb.current.onProbe && cb.current.onProbe(e.latlng.lat, e.latlng.lng);
    });
    m.on("mousemove", (e) => {
      // Hover tests exactly what a click will do, so the pointer never promises a selection
      // the click will not make.
      const hit = hitGenesis(archiveRef.current, m, e.containerPoint,
        { rows: rowSetRef.current, tolerance: 9 });
      const a = archiveRef.current;
      m.getContainer().style.cursor = hit ? "pointer" : "crosshair";
      const next = hit
        ? { row: hit.row, name: a.storms.str("name", hit.row),
            season: a.storms.num("season", hit.row),
            category: a.storms.str("max_category", hit.row), x: e.containerPoint.x,
            y: e.containerPoint.y }
        : null;
      setHover(next);
      /* Written straight to the two readouts rather than through state. A position that
         changes on every mouse move would re-render the whole plate sixty times a second to
         update eleven characters. */
      writeCoords(formatPosition(e.latlng.lat, e.latlng.lng));
      if (cb.current.onHover) cb.current.onHover(next);
    });
    m.on("mouseout", () => {
      setHover(null);
      writeCoords("—");
      if (cb.current.onHover) cb.current.onHover(null);
    });

    /* Leaflet caches the container size and does not observe it. All three of these exist in
       the terminal for the same reason: without them the map paints grey bands where tiles
       should be, and a click lands several degrees from where it looked. */
    const t = setTimeout(() => { m.invalidateSize(); readFrame(); }, 200);
    const ro = new ResizeObserver(() => { m.invalidateSize({ animate: false }); readFrame(); });
    ro.observe(el.current);

    map.current = m;
    /* Handles for the layout, interaction and performance checks -- the same reason the
       terminal's map exposes window.__MT_MAP. Nothing in the app reads these. */
    globalThis.__ATLAS_MAP = m;
    globalThis.__ATLAS_POPULATION = population;
    globalThis.__ATLAS_COASTLINE = coastline;
    globalThis.__ATLAS_REPLAY = replay;
    globalThis.__ATLAS_REPLAY_HEADS = replayHeads;
    globalThis.__ATLAS_HIT = (map_, pt) => hitGenesis(archiveRef.current, map_, pt,
      { rows: rowSetRef.current });
    setReady(true);
    readFrame();
    if (cb.current.onViewChange) cb.current.onViewChange(readView(m, population));

    return () => {
      clearTimeout(t);
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // Refs the map's own handlers read, so they never close over a stale render.
  const archiveRef = React.useRef(archive);
  const worldRef = React.useRef(world);
  const rowSetRef = React.useRef(null);
  archiveRef.current = archive;
  worldRef.current = world;

  React.useEffect(() => {
    if (!ready) return;
    layers.current.population.setArchive(archive, world);
    layers.current.selection.setArchive(archive, world);
    layers.current.replay.setArchive(archive, world);
    layers.current.replayHeads.setArchive(archive, world);
  }, [ready, archive, world]);

  /* The archive's own rings, when they arrive. Until then the plate draws its graticule over
     the contextual tier and the foot band says which coastline is on screen -- nothing else is
     substituted for the modelled regions. */
  React.useEffect(() => {
    if (!ready) return;
    layers.current.coastline.setCoastlines(coast && coast.wx ? coast : null);
  }, [ready, coast]);

  React.useEffect(() => {
    if (!ready) return;
    rowSetRef.current = rows ? new Set(rows) : null;
    /* In replay the static population is withheld on purpose: revealing it over time is the
       whole point, and drawing the finished mat underneath would give away the ending. */
    layers.current.population.setSelection(mode === "replay" ? EMPTY_ROWS : rows);
  }, [ready, rows, mode]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.population.setStyle({
      colorBy, dimmed: dimPopulation, softenEmphasis, showGenesis, showLandfalls,
    });
    layers.current.replay.setStyle({ colorBy, showMarks: showGenesis || showLandfalls });
  }, [ready, colorBy, dimPopulation, softenEmphasis, showGenesis, showLandfalls]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.population.setEmphasis(emphasis);
  }, [ready, emphasis]);

  /* WHAT THE LAYER ACTUALLY DREW, REPORTED AFTER IT DREW IT.
   *
   * `onViewChange` fired from exactly two places: `moveend zoomend resize`, and once at init --
   * which is BEFORE the rows exist. So the provenance drawer's section 05, the one headed WHAT
   * THIS SURFACE CHOSE, rendered the init snapshot for the whole session unless the reader
   * happened to pan: "LINE DECIMATION none · DRAWN THIS FRAME 0 storms · 0 segments", on a
   * screen whose plate head said 3,885 TRACKS DRAWN and whose layer had in fact drawn 67,781
   * segments at stride 3, decimated. A surface that exists to disclose its own simplifications
   * was reporting that it had made none.
   *
   * TWO FRAMES, DELIBERATELY. `redraw()` coalesces into one requestAnimationFrame and paints
   * there; reading the stats in the same frame is a race with it. The second frame is after the
   * paint, whatever order the callbacks were queued in. This reads no state and changes no
   * drawing -- it only reports. */
  React.useEffect(() => {
    if (!ready) return undefined;
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => {
        if (map.current && cb.current.onViewChange) {
          cb.current.onViewChange(readView(map.current, layers.current.population));
        }
      });
    });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [ready, rows, emphasis, colorBy, dimPopulation, softenEmphasis, showGenesis, showLandfalls,
    mode]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.selection.setStorm(selected === null ? -1 : selected);
  }, [ready, selected]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.selection.setReplayTime(replayMs === undefined ? null : replayMs);
  }, [ready, replayMs]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.pathwayLayer.setDensity(showPathway ? pathway : null, pathwayStep);
  }, [ready, showPathway, pathway, pathwayStep]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.genesisLayer.setDensity(showGenesisDensity ? genesisDensity : null, pathwayStep);
  }, [ready, showGenesisDensity, genesisDensity, pathwayStep]);

  /* The replay. Both layers are mounted for the life of the map and simply hold no timeline
     outside replay mode -- adding and removing canvases on a mode switch would throw away the
     accumulated picture every time, which is exactly what this layer exists not to do. */
  React.useEffect(() => {
    if (!ready) return;
    const tl = mode === "replay" ? timeline : null;
    layers.current.replay.setTimeline(tl);
    layers.current.replayHeads.setTimeline(tl);
  }, [ready, mode, timeline]);

  React.useEffect(() => {
    if (!ready || mode !== "replay" || replayCursorMin === null || replayCursorMin === undefined) return;
    layers.current.replay.setCursor(replayCursorMin);
    layers.current.replayHeads.setCursor(replayCursorMin);
  }, [ready, mode, replayCursorMin]);

  /* The probe ring: where the reader asked the archive's question. A true-metre circle of the
     query's own radius, so the sample is visibly a circle on the map rather than an
     abstraction in a panel. */
  React.useEffect(() => {
    if (!ready) return;
    const m = map.current;
    if (layers.current.probeRing) { m.removeLayer(layers.current.probeRing); layers.current.probeRing = null; }
    if (!probe) return;
    /* Leaflet options do not accept CSS custom properties, so the token is resolved to a
       computed value first -- off the map's own container, because the accent is declared on
       the Atlas surface and not on :root. */
    const accent = cssVar(m.getContainer(), "--accent", "#4fc3f7");
    const ring = L.circle([probe.lat, probe.lon], {
      radius: probe.radiusKm * 1000, color: accent, weight: 1.2, opacity: 0.9,
      fill: true, fillColor: accent, fillOpacity: 0.04, dashArray: "3,4", interactive: false,
      renderer: L.canvas({ padding: 0.3 }),
    });
    ring.addTo(m);
    layers.current.probeRing = ring;
  }, [ready, probe && probe.lat, probe && probe.lon, probe && probe.radiusKm]);

  const hasArchiveCoast = !!(coast && coast.wx);

  return (
    <>
      <div className="at-platehead">
        <span className="at-plate-title">PLATE · NORTH ATLANTIC + EAST PACIFIC</span>
        {/* WHAT IS ACTUALLY ON THE PLATE.
            `kept` was the COHORT count and `lifted` was the cohort count again, while the layer
            underneath was handed the BASELINE's rows -- so a 192-storm probe reported
            "192 TRACKS DRAWN · 192 LIFTED BY THE QUERY" with 3,885 tracks visibly on screen.
            Two numbers, both wrong, and neither of them the one a reader would use to check
            that the map and the panel are answering the same question. `kept` is now the row
            count the plate was given and `lifted` is the cohort inside it, so the second figure
            reconciles with the cohort in both rails and the first reconciles with the ink. */}
        {/* IN REPLAY, NOTHING IS DRAWN YET. The static population is withheld on purpose while
            the clock runs -- revealing it over time is the whole point -- so "3,885 TRACKS
            DRAWN" sat over an empty plate at the start of every run, contradicting the picture
            and the transport beneath it, which correctly reads REVEALED 1 / 3,885. The same
            number is true of the run as a POPULATION, which is what it names here instead; how
            much of it has been revealed is the transport's to say, and it does. */}
        <span>
          <em>{kept.toLocaleString()}</em> {mode === "replay" ? "IN THIS RUN" : "TRACKS DRAWN"}
          {lifted && mode !== "replay"
            ? <> · <em>{lifted.toLocaleString()}</em> LIFTED BY THE QUERY</> : null}
          {selectedCount ? <> · <em>{selectedCount}</em> SELECTED</> : null}
        </span>
        <span className="at-r">
          {mode === "replay" ? "REPLAY · ARCHIVE CLOCK RUNNING"
            : "EXPLORE · THE RECORD AS A FINISHED MAP"}
        </span>
      </div>

      <div className="at-plate" ref={plate}>
        <div ref={el} style={{ position: "absolute", inset: 0 }} />
        <PlateFrame frame={frame} />
        {children}
        {hover ? <HoverChip hover={hover} frame={frame} /> : null}
      </div>

      <div className="at-platefoot">
        <ScaleBar frame={frame} />
        <span className="at-plate-proj">MERCATOR · GRATICULE 10° · TICKS 5°</span>
        <span className="at-plate-model">
          {hasArchiveCoast
            ? "COASTLINE AT FULL CONTRAST · THE FIVE MODELLED LANDFALL REGIONS"
            : "CONTEXTUAL COASTLINE ONLY · THE ARCHIVE'S RINGS HAVE NOT LOADED"}
        </span>
        {/* The gesture, restated compactly once the reader is working. The full-size invitation
            over the plate is right on an unqueried map and wrong the moment there is data under
            it; this is where it goes instead -- in the caption band, at caption weight, beside
            the scale and the projection, where it competes with nothing. */}
        {hint ? <span className="at-plate-hint">{hint}</span> : null}
        <span className="at-r"><em id="at-coords">—</em></span>
      </div>
    </>
  );
}

/* The tick frame and the graticule labels, ruled on the plate's own edges.
 *
 * A plate in a journal is ruled at its margin rather than crossed by a grid, so the graticule's
 * information is carried by ticks on all four edges: 5° minor, 10° major. It says the same
 * thing as more lines over the ocean would, and leaves the ocean alone. */
function PlateFrame({ frame }) {
  if (!frame) return null;
  const { w, h, ticksX, ticksY, labX, labY } = frame;
  return (
    <svg className="at-frame" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {ticksX.map((t) => (
        <g key={`x${t.x}`}>
          <path d={`M${t.x} 0 V${t.len}`} stroke={t.ink} strokeWidth="1" />
          <path d={`M${t.x} ${h} V${h - t.len}`} stroke={t.ink} strokeWidth="1" />
        </g>
      ))}
      {ticksY.map((t) => (
        <g key={`y${t.y}`}>
          <path d={`M0 ${t.y} H${t.len}`} stroke={t.ink} strokeWidth="1" />
          <path d={`M${w} ${t.y} H${w - t.len}`} stroke={t.ink} strokeWidth="1" />
        </g>
      ))}
      {labY.map((l) => (
        <text key={`ly${l.y}`} x="8" y={l.y - 4} fill="#7f92a8" fontFamily="var(--font-mono)"
          fontSize="9.5" letterSpacing="1">{l.text}</text>
      ))}
      {labX.map((l) => (
        <text key={`lx${l.x}`} x={l.x + 4} y={h - 7} fill="#7f92a8" fontFamily="var(--font-mono)"
          fontSize="9.5" letterSpacing="1">{l.text}</text>
      ))}
    </svg>
  );
}

/* Computed from the map, never from the zoom level. `map.distance` is the projection's own
   answer for two points on the same row of pixels, so the bar means what it says at whatever
   latitude the reader has panned to. */
function ScaleBar({ frame }) {
  if (!frame || !frame.scale) return null;
  const { km, px } = frame.scale;
  return (
    <span className="at-scalebar">
      <i style={{ width: `${px}px` }} />
      <em>{km.toLocaleString()} KM</em>
    </span>
  );
}

/* Clamped on BOTH axes against the plate box. A chip that flips only horizontally still ends up
   under the foot band at the bottom of the map, which is where a reader hovers the Gulf coast. */
function HoverChip({ hover, frame }) {
  const w = frame ? frame.w : 0;
  const h = frame ? frame.h : 0;
  const CHIP_W = 220;
  const CHIP_H = 26;
  const left = Math.max(4, Math.min(hover.x + 14, Math.max(4, w - CHIP_W - 4)));
  const top = Math.max(4, Math.min(hover.y + 12, Math.max(4, h - CHIP_H - 4)));
  return (
    <div className="at-hover" style={{ left, top }}>
      {hover.name || "UNNAMED"} <span>{hover.season}</span>
      {hover.category
        ? <span> · {hover.category.toUpperCase()}</span>
        : <span style={{ color: "var(--flag)" }}> · NO INTENSITY RECORDED</span>}
    </div>
  );
}

/* Everything the caption bands and the frame need, read once per settled view. */
function measure(m) {
  const size = m.getSize();
  const w = size.x;
  const h = size.y;
  const b = m.getBounds();
  const ticksX = [];
  const ticksY = [];
  const labX = [];
  const labY = [];

  const west = Math.ceil(b.getWest() / 5) * 5;
  const east = Math.floor(b.getEast() / 5) * 5;
  for (let lon = west; lon <= east; lon += 5) {
    const x = m.latLngToContainerPoint([b.getNorth(), lon]).x;
    if (x < 0 || x > w) continue;
    const major = ((lon % 10) + 10) % 10 === 0;
    ticksX.push({ x: round1(x), len: major ? 7 : 4, ink: major ? "#5a6c81" : "#3d4a5b" });
    if (((lon % 20) + 20) % 20 === 0 && x > 20 && x < w - 40) {
      labX.push({ x: round1(x), text: `${Math.abs(lon)}°${lon < 0 ? "W" : "E"}` });
    }
  }
  const south = Math.ceil(b.getSouth() / 5) * 5;
  const north = Math.floor(b.getNorth() / 5) * 5;
  for (let lat = south; lat <= north; lat += 5) {
    const y = m.latLngToContainerPoint([lat, b.getWest()]).y;
    if (y < 0 || y > h) continue;
    const major = ((lat % 10) + 10) % 10 === 0;
    ticksY.push({ y: round1(y), len: major ? 7 : 4, ink: major ? "#5a6c81" : "#3d4a5b" });
    if (major && y > 14 && y < h - 16) {
      labY.push({ y: round1(y), text: `${Math.abs(lat)}°${lat < 0 ? "S" : "N"}` });
    }
  }

  let scale = null;
  if (w > 160) {
    const y = Math.round(h / 2);
    const per100 = m.distance(m.containerPointToLatLng([20, y]),
      m.containerPointToLatLng([120, y])) / 1000;
    if (per100 > 0) {
      const km = SCALE_STEPS.find((v) => v >= per100 * 0.55) || SCALE_STEPS[SCALE_STEPS.length - 1];
      scale = { km, px: Math.max(24, Math.min(180, Math.round((100 * km) / per100))) };
    }
  }
  return { w, h, ticksX, ticksY, labX, labY, scale };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/* The live cursor position, written to both readouts.
 *
 * TWO OF THEM, ON PURPOSE. The foot band's copy is the one a reader looks at; it is also the
 * first thing the band drops when the plate gets narrow. The transport's hint row carries the
 * same value and survives that, so the readout never simply disappears. */
function writeCoords(text) {
  for (const id of ["at-coords", "at-coords2"]) {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  }
}

function readView(m, population) {
  const b = m.getBounds();
  return {
    zoom: m.getZoom(),
    center: m.getCenter(),
    bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]],
    frame: population.lastFrame(),
  };
}

function cssVar(node, name, fallback) {
  try {
    const v = getComputedStyle(node).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}
