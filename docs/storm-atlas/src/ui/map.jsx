/* The map, which is the page.
 *
 * Conventions are the terminal's, deliberately: preferCanvas, the same CARTO dark basemap at
 * the same opacity, the same zoom range and snap, and the same three-mechanism resize
 * discipline. Two surfaces of one product should not disagree about what a map looks like or
 * how it behaves, and the terminal's map.jsx already learned each of these the hard way.
 *
 * THE PRIMARY INTERACTION IS ON THE MAP ITSELF. Clicking a track selects that storm. Clicking
 * open water asks the archive's central question at that point -- what formed near here, and
 * where did it go -- and answers it by revealing trajectories, not by opening a dialog. That
 * gesture has to be discoverable in one try, so it is the map that responds.
 */

import React from "react";
import { PopulationLayer } from "../render/population-layer.js";
import { SelectionLayer } from "../render/selection-layer.js";
import { PathwayLayer } from "../render/pathway-layer.js";
import { hitGenesis } from "../render/hit-test.js";
import { MONO } from "./kit.jsx";

const L = globalThis.L;

/* Fallback only. The opening view is fitted to the archive's own genesis extent, so the first
   screen frames the ocean this archive actually has something to say about rather than a
   centre someone once typed. */
const FALLBACK_CENTER = [21, -78];
const FALLBACK_ZOOM = 3;

export function AtlasMap({
  archive, world, rows, emphasis, selected, onSelect, onProbe, probe, replayMs, home,
  colorBy, showPathway, pathway, pathwayStep, dimPopulation, softenEmphasis, onViewChange,
  onHover,
}) {
  const el = React.useRef(null);
  const map = React.useRef(null);
  const layers = React.useRef({});
  const [ready, setReady] = React.useState(false);
  const [cursor, setCursor] = React.useState(null);

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
      try { m.fitBounds(L.latLngBounds(home).pad(0.04), { animate: false }); }
      catch { /* a degenerate extent keeps the fallback view */ }
    }
    L.control.zoom({ position: "topright" }).addTo(m);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 9, opacity: 0.62,
      attribution: "© OpenStreetMap · CARTO",
    }).addTo(m);
    m.attributionControl.addAttribution("IBTrACS · HURDAT2");

    const pathwayLayer = new PathwayLayer().addTo(m);
    const population = new PopulationLayer().addTo(m);
    const selection = new SelectionLayer().addTo(m);
    layers.current = { pathwayLayer, population, selection };

    m.on("moveend zoomend", () => {
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
      setCursor(next);
      if (cb.current.onHover) cb.current.onHover(next);
    });
    m.on("mouseout", () => { setCursor(null); if (cb.current.onHover) cb.current.onHover(null); });

    /* Leaflet caches the container size and does not observe it. All three of these exist in
       the terminal for the same reason: without them the map paints grey bands where tiles
       should be, and a click lands several degrees from where it looked. */
    const t = setTimeout(() => m.invalidateSize(), 200);
    const ro = new ResizeObserver(() => m.invalidateSize({ animate: false }));
    ro.observe(el.current);

    map.current = m;
    /* Handles for the layout, interaction and performance checks -- the same reason the
       terminal's map exposes window.__MT_MAP. Nothing in the app reads these. */
    globalThis.__ATLAS_MAP = m;
    globalThis.__ATLAS_POPULATION = population;
    globalThis.__ATLAS_HIT = (map_, pt) => hitGenesis(archiveRef.current, map_, pt,
      { rows: rowSetRef.current });
    setReady(true);
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
  }, [ready, archive, world]);

  React.useEffect(() => {
    if (!ready) return;
    rowSetRef.current = rows ? new Set(rows) : null;
    layers.current.population.setSelection(rows);
  }, [ready, rows]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.population.setStyle({ colorBy, dimmed: dimPopulation, softenEmphasis });
  }, [ready, colorBy, dimPopulation, softenEmphasis]);

  React.useEffect(() => {
    if (!ready) return;
    layers.current.population.setEmphasis(emphasis);
  }, [ready, emphasis]);

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

  /* The probe ring: where the reader asked the archive's question. Drawn as a plain circle of
     the query's own radius so the sample is visibly a circle on the map rather than an
     abstraction in a panel. */
  React.useEffect(() => {
    if (!ready) return;
    const m = map.current;
    if (layers.current.probeRing) { m.removeLayer(layers.current.probeRing); layers.current.probeRing = null; }
    if (!probe) return;
    /* The query's own radius, drawn. The sample IS a circle on the map, and showing it stops
       "within 500 km" from being an abstraction in a panel. Leaflet options do not accept CSS
       custom properties, so the token is resolved to a computed value first. */
    const accent = cssVar("--accent", "#38bdf8");
    const ring = L.circle([probe.lat, probe.lon], {
      radius: probe.radiusKm * 1000, color: accent, weight: 1.6, opacity: 0.95,
      fill: true, fillColor: accent, fillOpacity: 0.05, dashArray: "4,4", interactive: false,
      renderer: L.canvas({ padding: 0.3 }),
    });
    ring.addTo(m);
    layers.current.probeRing = ring;
  }, [ready, probe && probe.lat, probe && probe.lon, probe && probe.radiusKm]);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={el} style={{ position: "absolute", inset: 0, background: "var(--slate-950)" }} />
      {cursor ? <HoverChip cursor={cursor} /> : null}
    </div>
  );
}

function HoverChip({ cursor }) {
  return (
    <div style={{
      position: "absolute", left: cursor.x + 14, top: cursor.y + 12, zIndex: 500,
      pointerEvents: "none", ...MONO, fontSize: "var(--fs-mono-xs)",
      background: "rgba(7,12,22,.92)", border: "1px solid var(--border-strong)",
      borderRadius: "var(--radius-sm)", padding: "4px 7px", color: "var(--text-1)",
      whiteSpace: "nowrap",
    }}>
      {cursor.name || "UNNAMED"} <span style={{ color: "var(--text-2)" }}>{cursor.season}</span>
      {cursor.category
        ? <span style={{ color: "var(--text-2)" }}> · {cursor.category.toUpperCase()}</span>
        : <span style={{ color: "var(--warn)" }}> · no intensity recorded</span>}
    </div>
  );
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

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}
