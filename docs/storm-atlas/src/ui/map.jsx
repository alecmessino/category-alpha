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
import { OperationalLayer } from "../render/operational-layer.js";
import { PathwayLayer } from "../render/pathway-layer.js";
import { CoastlineLayer } from "../render/coastline-layer.js";
import { ReplayHeadsLayer, ReplayLayer } from "../render/replay-layer.js";
import { hitGenesis } from "../render/hit-test.js";
import { CATEGORY_COLOR, MAJOR_FROM } from "../render/palette.js";
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

/* ── THE CAMERA ────────────────────────────────────────────────────────────────────────────
 *
 * THREE THINGS MOVE THIS MAP AND THEY ARE NAMED SEPARATELY, because a reader who cannot predict
 * when the view will move stops trusting the view.
 *
 *   HOME     the canonical NA + EP aperture. Longitude-fitted and clamped: see below.
 *   FIT      whatever evidence is currently drawn. Contain-fitted, with a margin, unclamped --
 *            a reader who has filtered to dateline crossers is asking to be taken to them.
 *   SUBJECT  selecting a storm fits that storm's track. The one automatic move, and it is a
 *            NAVIGATION rather than a re-frame: the reader asked to look at one storm.
 *
 * AND NOTHING ELSE MOVES IT. A cohort edit, a layer toggle, a mode switch and a replay tick all
 * leave the camera exactly where the reader put it. That is the rule `userMoved` records and
 * scripts/check-atlas-camera.mjs measures; it is stated here because the failure it prevents --
 * a query change quietly re-framing a map somebody had just panned -- reads as a bug in the
 * filter rather than as a camera decision.
 */

/**
 * Fit `frame` on the map, with an optional clamp the resulting VIEW may not leave.
 *
 * THE APERTURE BINDS ON LONGITUDE, AND THAT IS THE RULE BOTH EARLIER MODELS WERE REACHING FOR.
 *
 * `fitBounds` CONTAINS: it shows the whole frame and whatever else the plate's shape demands on
 * the looser axis. With a 3.19-shaped frame on a 3.84-shaped plate that surplus is 100 degrees
 * of longitude, and it opened a plate captioned NORTH ATLANTIC + EAST PACIFIC on the Philippine
 * Sea. So the aperture COVERED instead, which binds on the axis the plate is tighter in.
 *
 * That was the same rule stated in terms of one plate shape, and it stopped being true when the
 * plate changed shape. The instrument's plate is 834x541 beside its ledger rather than 1920x500
 * above its deck -- aspect 1.54 against the frame's projected 2.89 -- and a cover fit on a plate
 * SQUARER than its frame binds on LATITUDE and crops the other axis. Measured at 1440: longitude
 * 128.5W to 55.2W, seventy-three degrees, with the East Pacific development region off the left
 * edge of a plate captioned for it. check-atlas-camera caught it, which is what it is for.
 *
 * `aperture` states the rule directly: the frame's LONGITUDE is what fills the plate, always.
 * On a plate wider than its frame that is what cover did; on a squarer one it is what contain
 * does; and it is never either of their failure modes, because it never consults the plate's
 * shape at all. Latitude is whatever follows -- bounded, as it always was, by the clamp below,
 * which is the research geography and the only thing that decides what a reader may open on.
 *
 * SNAP IS FLOORED, NOT CEILED. Leaflet quantises zoom to zoomSnap; ceiling a cover fit would
 * crop up to a fifth of the frame away to satisfy the snap. Flooring shows slightly MORE than
 * the frame instead, which is the direction an aperture is allowed to be wrong in.
 *
 * THE CLAMP IS A SEPARATE STEP AND IT OUTRANKS THE FIT. It raises the zoom until the clamp box
 * covers the plate -- so no view outside it is reachable at that zoom -- and then pans the
 * result back inside, in projected pixels rather than in degrees, since a degree of latitude is
 * not a fixed number of pixels in Mercator.
 */
export function applyFrame(m, frame, { clamp = null, mode = "cover", padPx = 0, anchor = null } = {}) {
  if (!m || !frame) return false;
  let tb;
  try { tb = L.latLngBounds(frame); } catch { return false; }
  if (!tb || !tb.isValid()) return false;

  /* THE SIZE IS RE-READ BEFORE ANYTHING IS MEASURED, AND THAT IS NOT DEFENSIVE -- IT IS THE FIX
   * FOR A REAL CROP.
   *
   * Leaflet caches its container size and refreshes it only on invalidateSize, which this
   * component drives from a ResizeObserver -- asynchronously, after React has committed. So a
   * fit that runs IN the commit that changed the plate's box measures the box it had BEFORE.
   * Selecting a storm is exactly that commit: the inspector docks and takes 380px of width in
   * the same render the subject fit fires in. Measured: a track spanning 31.8 degrees of
   * longitude was fitted against a 1920px plate and drawn on the 1540px one it had become --
   * zoom 6.25 where 6.0 was needed, and 3.4 degrees of the storm off both ends of its own plate.
   *
   * pan:false because this is a measurement, not a move: the fit below decides where the camera
   * goes, and letting invalidateSize re-centre first would put a pan the reader did not ask for
   * in front of it. */
  try { m.invalidateSize({ animate: false, pan: false }); } catch { /* not yet in the document */ }
  const z0 = m.getZoom() || 0;
  const size = m.getSize();
  const w = Math.max(32, size.x - 2 * padPx);
  const h = Math.max(32, size.y - 2 * padPx);
  const nw0 = m.project(tb.getNorthWest(), z0);
  const se0 = m.project(tb.getSouthEast(), z0);
  const sx = Math.abs(se0.x - nw0.x);
  const sy = Math.abs(se0.y - nw0.y);
  if (!(sx > 0) || !(sy > 0)) return false;

  const snap = m.options.zoomSnap || 0;
  /* THREE MODES, AND ONLY ONE OF THEM CONSULTS THE PLATE'S SHAPE.
       aperture  the frame's longitude fills the plate. The opening view, and the one fit whose
                 job is to show a stated geography rather than a measured object.
       contain   the whole frame fits, with surplus on the looser axis. FIT and the subject fit,
                 where the frame IS the object and cropping any of it would hide evidence.
       cover     the frame fills the plate and the looser axis is cropped. Kept because a caller
                 may still want it; no caller does today. */
  let z = m.getScaleZoom(mode === "aperture"
    ? w / sx
    : mode === "cover"
      ? Math.max(w / sx, h / sy)
      : Math.min(w / sx, h / sy), z0);
  if (snap) z = Math.floor(z / snap) * snap;

  const cb = clamp ? L.latLngBounds(clamp) : null;
  if (cb && cb.isValid()) z = Math.max(z, m.getBoundsZoom(cb, true));
  z = Math.max(m.getMinZoom(), Math.min(m.getMaxZoom(), z));

  /* THE CENTRE. Two rules, and the second only matters when the view is narrower than the frame.
   *
   * BY DEFAULT, THE FRAME'S MERCATOR MIDPOINT, not the mean of its degrees. A band from 7N to
   * 47N has its arithmetic centre at 27N and its projected centre at 30N, and centring on the
   * former puts three degrees of the recurvature corridor off the top of the plate.
   *
   * AND AN EXPLICIT ANCHOR WHERE ONE IS GIVEN, WHICH IS THE APERTURE'S CASE. A midpoint is the
   * middle of a RANGE and a range has two ends; the archive's genesis longitude runs from a
   * 1st percentile of 164W -- the East Pacific tail -- to a 99th of 17W, and its midpoint is
   * 91W, twelve degrees west of where the storms actually are. That cost nothing while the plate
   * was wide enough to show the whole range. On the instrument's 834px plate the clamp allows
   * about 133 degrees of the frame's 149, so sixteen degrees are cropped, and centring on the
   * midpoint cropped eight of them off the EAST -- taking the Atlantic main development region,
   * the densest genesis region in the archive, off a plate captioned for it.
   *
   * The anchor is the archive's MEDIAN genesis position, which is 79.4W on this pack. A median
   * is not dragged by a tail and a midpoint is, and it is derived from the archive rather than
   * typed here, so it moves if the archive does. */
  const nw = m.project(tb.getNorthWest(), z);
  const se = m.project(tb.getSouthEast(), z);
  const centre = anchor ? m.project(L.latLng(anchor[0], anchor[1]), z) : nw.add(se).divideBy(2);

  /* THE CLAMP IS APPLIED IN PROJECTED SPACE, BEFORE THE ONLY setView, AND THAT IS NOT TIDINESS.
   *
   * It used to set the view, read the resulting bounds back, work out how far outside the clamp
   * they were, and set the view again. Every one of those steps goes through project/unproject,
   * and the round trip does not return exactly what it was given -- so the SAME frame, clamp and
   * container produced two answers a tenth of a degree apart depending on where the camera
   * happened to be standing when it was asked. Measured: the opening view landed at 0.1S and
   * HOME, from a panned camera, at 0.0 -- which is invisible to a reader and is precisely what
   * "HOME restores the canonical aperture EXACTLY" exists to forbid, because a camera that
   * cannot return to its own aperture cannot be trusted to have one.
   *
   * Clamping the CENTRE against the clamp's own projected box makes the result a pure function
   * of (frame, clamp, anchor, zoom, container size). Two calls with the same five agree to the
   * bit, whatever the camera was doing beforehand.
   *
   * AND WHERE THE VIEW IS LARGER THAN THE CLAMP the centre is the clamp's own, rather than an
   * edge. That case is reachable at a viewport short enough that the plate cannot hold the
   * clamp's aspect, and aligning to an edge there would open the plate on the Arctic or the
   * southern hemisphere depending only on which test ran first. */
  if (cb && cb.isValid()) {
    const cnw = m.project(cb.getNorthWest(), z);
    const cse = m.project(cb.getSouthEast(), z);
    const halfView = m.getSize().divideBy(2);
    const lo = { x: cnw.x + halfView.x, y: cnw.y + halfView.y };
    const hi = { x: cse.x - halfView.x, y: cse.y - halfView.y };
    centre.x = lo.x <= hi.x ? Math.min(Math.max(centre.x, lo.x), hi.x) : (cnw.x + cse.x) / 2;
    centre.y = lo.y <= hi.y ? Math.min(Math.max(centre.y, lo.y), hi.y) : (cnw.y + cse.y) / 2;
  }
  /* AND THE VIEW'S TOP-LEFT IS PUT ON THE PIXEL GRID BEFORE THE CENTRE IS UNPROJECTED.
   *
   * Leaflet reports `getCenter()` two different ways: the latLng it was SET to, while the map
   * has not moved, and the latLng under the container's MIDDLE PIXEL once it has. With an odd
   * container height the middle pixel is a half pixel, so those two differ -- and the same
   * aperture, read back after a pan and after a clean set, was two coordinates a third of a
   * pixel apart. Invisible on screen, and fatal to "HOME restores the canonical aperture
   * EXACTLY", which is the assertion that a reader can always get back to where they started.
   *
   * Rounding the centre alone does not close it, because it is the OFFSET between the centre and
   * the container's middle that is fractional. Rounding the view's top-left does: with the
   * origin on a whole pixel, the container's middle lands exactly where the centre was set, and
   * the two readings are the same coordinate by construction. */
  const half = m.getSize().divideBy(2);
  const origin = L.point(Math.round(centre.x - half.x), Math.round(centre.y - half.y));
  m.setView(m.unproject(origin.add(half), z), z, { animate: false });
  return true;
}

export function AtlasMap({
  archive, world, coast, rows, emphasis, selected, onSelect, onProbe, probe, replayMs, home,
  operationalTrack = null,
  homeClamp = null, homeAnchor = null, evidenceFrame = null, subjectFrame = null,
  colorBy, showPathway, pathway, pathwayStep, dimPopulation, softenEmphasis, onViewChange,
  onHover, showGenesis = true, showLandfalls = true,
  showGenesisDensity, genesisDensity, mode = "explore", timeline, replayCursorMin,
  kept = 0, context = 0, selectedCount = 0, hint, onGesture, cameraApi = null, children,
}) {
  const el = React.useRef(null);
  const plate = React.useRef(null);
  const map = React.useRef(null);
  const layers = React.useRef({});
  const [ready, setReady] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const [frame, setFrame] = React.useState(null);

  /* THE CAMERA'S TWO BITS OF MEMORY.
     `moving` counts the re-frames this component is itself performing, so the move events they
     emit are not mistaken for the reader's hand. `userMoved` is what those events set, and the
     only thing that clears it is an explicit HOME or FIT. */
  const moving = React.useRef(0);
  const userMoved = React.useRef(false);
  const fittedSubject = React.useRef(null);
  /* WHETHER THE CAMERA IS STILL SHOWING THE CANONICAL APERTURE AND NOTHING ELSE HAS CLAIMED IT.
     Separate from `userMoved`, which records only whether the READER moved: FIT and the subject
     fit also leave the aperture, and a resize must not drag either of them back to it. */
  const atAperture = React.useRef(true);

  // Callers change identity every render; keep them in a ref so the map is built once.
  const cb = React.useRef({});
  cb.current = { onSelect, onProbe, onViewChange, onHover, onGesture };
  /* The frames change identity on every cohort edit; the controls read them from here so that
     wiring HOME and FIT does not rebuild the map. */
  const frames = React.useRef({});
  frames.current = { home, homeClamp, homeAnchor, evidenceFrame, subjectFrame };

  /* EVERY MOVE THIS COMPONENT MAKES GOES THROUGH HERE, so that the move events Leaflet emits
     from it are attributable. Synchronous by construction -- every re-frame is `animate:false`,
     and Leaflet fires move/zoom/moveend inline for those -- so the counter is back at zero
     before any event the reader could have caused. */
  const camera = (m, fn) => {
    moving.current += 1;
    try { return fn(); } finally { moving.current -= 1; }
  };

  /* HOME AND FIT, AS FUNCTIONS RATHER THAN AS BUTTONS, because three things call them: the two
     controls on the plate, and the keyboard. Both CLEAR `userMoved`: an explicit re-frame is the
     reader handing the camera back. */
  const goHome = React.useCallback(() => {
    const m = map.current;
    if (!m) return;
    const f = frames.current;
    camera(m, () => applyFrame(m, f.home,
      { clamp: f.homeClamp, anchor: f.homeAnchor, mode: "aperture" }));
    userMoved.current = false;
    atAperture.current = true;
  }, []);

  /* FIT IS CONTAIN, AND IT IS NOT CLAMPED. The clamp exists so the surface does not OPEN on
     geography it does not research; a reader who has asked for the storms that crossed the
     dateline is asking to be taken to them, and refusing would be the camera overruling the
     query. The margin is 24px on each side so a track does not run into the graticule ticks. */
  const goFit = React.useCallback(() => {
    const m = map.current;
    if (!m) return;
    const f = frames.current;
    const target = f.subjectFrame || f.evidenceFrame || f.home;
    camera(m, () => applyFrame(m, target, { mode: "contain", padPx: 24 }));
    userMoved.current = false;
    atAperture.current = false;
  }, []);

  React.useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      preferCanvas: true, zoomControl: false, attributionControl: true,
      minZoom: 2, maxZoom: 8, zoomSnap: 0.25, worldCopyJump: false,
    }).setView(FALLBACK_CENTER, FALLBACK_ZOOM);
    /* THE OPENING FRAME: LONGITUDE-FITTED, ANCHORED AND CLAMPED. See applyFrame above for why
       it is neither a fitBounds nor a cover -- each of those is the right rule for one plate
       shape and the wrong one for the other, and the plate's shape is a layout decision. The
       anchor is the archive's median genesis position, so the sixteen degrees the clamp makes
       this plate crop come off the sparse ends of both tails rather than off the Atlantic main
       development region. `homeClamp` is the research geography and is the bound that makes the
       difference visible in a gate rather than in a review. */
    camera(m, () => applyFrame(m, home,
      { clamp: homeClamp, anchor: homeAnchor, mode: "aperture" }));

    /* THE TWO RECOVERY CONTROLS, ON THE MAP, ABOVE THE ZOOM.
     *
     * THEY ARE NOT THE SAME CONTROL AND THEY ARE NOT RESET QUERY EITHER. Three things a reader
     * can be lost in, three ways out, and each names exactly one of them:
     *
     *   RESET QUERY  clears the conditions.        It is on the condition strip.
     *   HOME         restores the canonical camera. It changes nothing about the question.
     *   FIT          frames the current evidence.   It changes nothing about the question either.
     *
     * A single "reset" that did all three would be the fastest control to build and the one a
     * reader can never use deliberately: having panned away from a cohort they spent five
     * minutes building, the way back must not also throw the cohort away.
     *
     * Built with Leaflet's own control plumbing rather than as an absolutely positioned overlay,
     * so it participates in the same stacking and pointer-event containment as the zoom control
     * beneath it and cannot end up under the graticule or over the attribution. */
    const nav = L.control({ position: "topright" });
    nav.onAdd = () => {
      const box = L.DomUtil.create("div", "leaflet-bar at-mapnav");
      const mk = (label, title, hook, fn) => {
        const a = L.DomUtil.create("a", "", box);
        a.href = "#";
        a.textContent = label;
        a.title = title;
        a.setAttribute("role", "button");
        a.setAttribute(hook, "");
        L.DomEvent.on(a, "click", (ev) => { L.DomEvent.stop(ev); fn(); });
        return a;
      };
      mk("HOME", "the canonical North Atlantic + East Pacific aperture (H)",
        "data-camera-home", () => goHome());
      mk("FIT", "frame the evidence currently drawn (F)", "data-camera-fit", () => goFit());
      L.DomEvent.disableClickPropagation(box);
      return box;
    };
    nav.addTo(m);
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
    /* THE OPERATIONAL TRACK OF A CURRENT STORM. Mounted always, holding a track almost never --
       an empty layer costs one canvas and no paint. When it DOES hold one the selection layer is
       fed -1, so the two never draw at the same time: precedence on the plate is one track or
       the other, never both a pixel apart. */
    const operational = new OperationalLayer().addTo(m);
    const replayHeads = new ReplayHeadsLayer().addTo(m);
    layers.current = { coastline, pathwayLayer, genesisLayer, population, replay, selection,
      operational, replayHeads };

    const readFrame = () => setFrame(measure(m));
    m.on("moveend zoomend resize", () => {
      readFrame();
      if (cb.current.onViewChange) cb.current.onViewChange(readView(m, population));
    });
    /* WHOSE HAND MOVED THE CAMERA. `moving` is non-zero only inside applyFrame, so anything
       arriving with it at zero is the reader -- a drag, a wheel, a zoom button, a double click.
       A resize is NOT one of those: the plate changes height when the inspector's transport
       appears, and treating that as the reader's pan would let one automatic re-frame authorise
       the next. */
    m.on("movestart zoomstart", () => {
      if (!moving.current) { userMoved.current = true; atAperture.current = false; }
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
    /* THE APERTURE IS RE-DERIVED ON A RESIZE, NOT PAN-COMPENSATED, AND THAT IS THE DIFFERENCE
     * BETWEEN A VIEW AND A POSITION.
     *
     * `invalidateSize` keeps the geographic CENTRE still when the container changes size, which
     * is right for a camera the reader placed and wrong for a stated aperture: the aperture is
     * defined by a frame, a clamp and the plate's box, so when the box changes the aperture
     * changes with it. Measured, that distinction was worth 0.04 degrees of longitude and it was
     * visible as a gate failure: the ledger widens the moment the deck first renders a
     * comparison column, the plate narrows in the same commit, and the opening view drifted off
     * the canonical aperture by half the width delta -- so HOME and the opening view were two
     * different views of the same archive.
     *
     * ONLY WHILE THE APERTURE IS WHAT IS ON SCREEN. A reader who has panned, a FIT, and the
     * subject fit all clear `atAperture`, and a resize leaves every one of them exactly where it
     * is -- re-framing a storm somebody is reading because a panel opened is the same theft the
     * persistence rule forbids. */
    const settle = () => {
      /* THE WHOLE SETTLE IS ATTRIBUTABLE, AND THAT IS A FIX RATHER THAN TIDINESS. `invalidateSize`
         pans to keep the geographic centre still, and a pan fires `movestart` -- so outside
         `camera()` a container resize registered as THE READER MOVING THE MAP. It cleared
         `atAperture` before the line below could read it, which is why the aperture was never
         actually re-derived; it also told every automatic fit on this surface to yield to a
         reader who had done nothing but change the width of their window. */
      camera(m, () => {
        const wasAtAperture = atAperture.current;
        m.invalidateSize({ animate: false });
        if (wasAtAperture) {
          const f = frames.current;
          applyFrame(m, f.home,
            { clamp: f.homeClamp, anchor: f.homeAnchor, mode: "aperture" });
        }
      });
      readFrame();
    };
    const t = setTimeout(settle, 200);
    const ro = new ResizeObserver(settle);
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
    /* ONE TRACK ON SCREEN. Where an operational record governs the selected storm, the ARCHIVE's
       track for that storm is not drawn -- the operational layer draws instead. This is the map's
       half of the precedence rule, and it is why the archive stub of a current storm never
       appears alongside the record that supersedes it. */
    const governed = !!operationalTrack;
    layers.current.selection.setStorm(selected === null || governed ? -1 : selected);
    layers.current.operational.setTrack(governed ? operationalTrack : null);
  }, [ready, selected, operationalTrack]);

  /* THE CAMERA, REACHABLE FROM OUTSIDE. The shell binds H and F to these, and the camera gate
     drives them; both are the same two functions the controls call, so a keystroke and a click
     cannot come to mean different things. `userMoved` is exposed read-only, because the whole
     persistence rule is a claim about it and a claim that cannot be measured is not enforced. */
  React.useEffect(() => {
    if (!ready) return undefined;
    const api = { home: goHome, fit: goFit, movedByReader: () => userMoved.current };
    if (cameraApi) cameraApi.current = api;
    globalThis.__ATLAS_CAMERA = api;
    return () => { if (cameraApi) cameraApi.current = null; };
  }, [ready, cameraApi, goHome, goFit]);

  /* THE ONE AUTOMATIC MOVE, AND ITS THREE GUARDS.
   *
   * Selecting a storm frames that storm, because the reader asked to look at it and hunting for
   * a single 40-hour track inside a 150-degree aperture is not a thing anyone should have to do.
   * The specification permits this explicitly -- selected-storm navigation MAY intentionally fit
   * the track -- and it is the only place camera persistence yields.
   *
   *   IT FIRES ON THE SELECTION CHANGING, not on the frame's identity changing. `subjectFrame`
   *   is a fresh array on every render; keyed on it, a cohort edit with a storm already selected
   *   would re-frame the map, which is exactly the theft the persistence rule forbids.
   *   IT DOES NOT FIRE ON DESELECTION. Closing the inspector returns the reader to whatever they
   *   were looking at, not to a camera decision made on their behalf.
   *   IT IS CONTAIN, WITH A MARGIN, so the whole track and its landfall marks are on the plate. */
  React.useEffect(() => {
    if (!ready) return;
    if (selected === null) { fittedSubject.current = null; return; }
    /* THE KEY IS THE SELECTION AND THE TRACK'S EXTENT, not the selection alone.
     *
     * A current storm's operational track is a separate 20 KB fetch, so it can land AFTER a
     * `?storm=` link has already selected the storm and framed it. Framed on the archive stub
     * alone, CP012026 fits a 49-fix track and then draws a 63-fix one running 1,900 km further
     * west -- half of it off the plate, which reads as a map that cut the storm short.
     *
     * SO THE SECOND FIT EXISTS, AND IT YIELDS TO THE READER. If they have moved the camera since
     * the first one, the late-arriving track does not take it back: an automatic move that
     * overrides a deliberate one is exactly the theft the persistence rule forbids, and the fact
     * that this one is finishing an earlier move does not make it the reader's. */
    const key = `${selected}|${operationalTrack ? operationalTrack.fixes.length : 0}`;
    if (fittedSubject.current === key) return;
    const refit = fittedSubject.current !== null;
    fittedSubject.current = key;
    if (refit && userMoved.current) return;
    const f = frames.current.subjectFrame;
    if (!f) return;
    const m = map.current;
    camera(m, () => applyFrame(m, f, { mode: "contain", padPx: 34 }));
    atAperture.current = false;
  }, [ready, selected, operationalTrack]);

  React.useEffect(() => {
    if (!ready) return;
    const ms = replayMs === undefined ? null : replayMs;
    layers.current.selection.setReplayTime(ms);
    layers.current.operational.setReplayTime(ms);
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
      {/* THE PAPER SET, ABOVE THE PLATE AND ALIGNED TO ITS EDGES.
          PLATE 1 · NORTH ATLANTIC + EAST PACIFIC, what is drawn, and the aperture it is drawn
          through. The band it replaces was a dark strip INSIDE the rectangle, and 5c's first
          move is to take both strips off: the plate becomes one uninterrupted rectangle and its
          metadata is set in paper immediately above and below it, which is how a plate in a
          journal is captioned. It also returns the 58px the two bands were using.

          THE TWO FIGURES ARE THE ONE THING ON THIS LINE A READER CHECKS. They reconcile the ink
          with the ledger: COHORT is what is lifted and is the denominator of every rate beside
          it, CONTEXT is the population drawn behind it. Unfiltered they are the same number, so
          only one is printed -- "3,959 COHORT · 3,959 CONTEXT" states nothing twice.

          THE APERTURE IS READ OFF THE MAP, NOT WRITTEN HERE. It is the plate's STATED aperture
          in the sense the locked rules use -- the bounds a coordinate readout is legal inside --
          so it has to be the bounds actually rendered, and it moves when the reader pans. A
          fixed pair of coordinates under a movable camera is a caption that becomes a lie on the
          first drag. */}
      <div className="at-platehead">
        <span className="at-plate-title">PLATE 1 · NORTH ATLANTIC + EAST PACIFIC</span>
        <span className="at-plate-counts">
          {mode === "replay" ? (
            <><em>{kept.toLocaleString()}</em> IN THIS RUN</>
          ) : (
            <>
              <em>{kept.toLocaleString()}</em> COHORT
              {context && context !== kept
                ? <> · <em>{context.toLocaleString()}</em> CONTEXT</> : null}
              {selectedCount ? <> · <em>{selectedCount}</em> SELECTED</> : null}
            </>
          )}
        </span>
        {/* THE ONE STATE THE LINE STILL NAMES, and it is not atmosphere: in replay the static
            population is deliberately withheld, so a plate that looks empty is correct and a
            reader has to be told which of the two things they are looking at. */}
        {mode === "replay" ? <span className="at-plate-mode">REPLAY</span> : null}
        <span className="at-r at-plate-aperture" data-plate-aperture>{apertureOf(frame)}</span>
      </div>

      {/* THE STAGE IS THE DARK SUBTREE AND IT HOLDS THE PLATE AND NOTHING ELSE.
          atlas.css re-declares the whole dark ink ramp on `.atlas-stage` inside the light shell,
          because everything drawn over cartography inherits the surface's text tokens. Now that
          the captions are on paper they must be OUTSIDE that boundary or they would resolve
          near-white ink on a near-white ground -- so the stage wraps exactly the rectangle. */}
      <div className="atlas-stage">
        <div className="at-plate" ref={plate}>
          <div ref={el} style={{ position: "absolute", inset: 0 }} />
          <PlateFrame frame={frame} />
          {children}
          {hover ? <HoverChip hover={hover} frame={frame} /> : null}
        </div>
      </div>

      {/* THE CLASS KEY AND THE MEASURE, ON THE PAPER LINE DIRECTLY BENEATH THE PLATE.
          The Saffir-Simpson key is not decoration and it is never dropped for minimalism: the
          plate colours every fix by the class it had reached, and a coloured map with no key is
          a map that cannot be read. It is compact and subordinate -- 9.5px mono, the smallest
          step the frame has -- but it is present wherever class-coloured tracks are.

          THE SCALE BAR IS COMPUTED, NOT STATED. `measure()` asks the projection how far 100px
          is at the plate's own centre latitude, at the size the plate actually rendered, and
          snaps the bar to a round distance. It moves with a pan and with a resize, and there is
          no constant anywhere in this file that a layout change could leave stale.

          THE LIVE COORDINATE NOW SITS ON PAPER, which is 5c's one named risk: during a pan the
          numbers change just off the map. Left-aligned to the plate's own edge and immediately
          beneath it so it reads as the plate's footer. */}
      <div className="at-platefoot">
        <ClassKey />
        <span className="at-plate-measure">
          <ScaleBar frame={frame} />
          <span className="at-plate-proj">MERCATOR · TICKS 10° / 5°</span>
          <span className="at-r"><em id="at-coords">—</em></span>
        </span>
      </div>

      {/* FIGURE 1 — WHAT IS DRAWN, IN A SENTENCE, IN THE SAME SERIF AS THE QUESTION.
          The one borrowing from 5b. It names what the ink is, that five landfall regions are
          drawn at full contrast while every other coastline is context, that the landfall rule
          never consults the basemap, and the two gestures.

          THE COASTLINE STATEMENT IS TWO STATEMENTS WEARING ONE SENTENCE. With the archive's
          rings loaded it is METHODOLOGY -- which geometry is authoritative -- and the caption
          carries it in prose with the rest of the argument behind PLATE NOTES. With the rings
          ABSENT it is a DEGRADED STATE: the plate is drawing a coastline the landfall rule was
          never written against, and that is not something a reader should have to open anything
          to discover. So the fallback is stated at full weight, in the caption's own line. */}
      <div className="at-plate-figure">
        <p className="at-plate-caption" data-plate-caption>
          <em>Figure 1.</em>{" "}
          {mode === "replay"
            ? <>Genesis points and tracks of the {kept.toLocaleString()} storms in this run, drawn
                in the order the archive recorded them and coloured by the class each fix had
                reached.</>
            : <>Genesis points and tracks of the {kept.toLocaleString()} storms in this cohort,
                coloured by the class each fix had reached.</>}{" "}
          {hasArchiveCoast ? (
            <>Five modelled landfall regions are drawn at full contrast; every other coastline is
              context, and the landfall rule never consults it.</>
          ) : (
            <b className="at-plate-model" data-coastline-degraded>
              Contextual coastline only — the archive’s own rings have not loaded, so the line on
              screen is not the geometry the landfall rule is written against.
            </b>
          )}{" "}
          <span className="at-plate-gesture">
            Click any ocean point for what formed near there; click a genesis point for one storm.
          </span>
          {/* THE INSTRUCTION RETIRES ITSELF. It is here for a reader who has not yet discovered
              that the plate answers a click, and it is noise for one who has -- so the shell
              stops passing it after the first probe, selection or condition. */}
          {hint ? <span className="at-plate-hint">{" "}{hint}</span> : null}
        </p>
        <span className="at-plate-acts">
          {hasArchiveCoast ? (
            <details className="at-plate-notes" data-plate-notes>
              <summary title="what this plate draws, and from which geometry">PLATE NOTES</summary>
              <div className="at-plate-notes-body">
                <p>
                  <b>COASTLINE</b> The five modelled landfall regions are drawn from the
                  archive&rsquo;s own rings at full contrast. Everything else is a contextual
                  basemap and the landfall rule never consults it.
                </p>
                <p>
                  <b>PROJECTION</b> Web Mercator. The graticule is ruled on the plate&rsquo;s
                  margin rather than across it: 10° major ticks with labels, 5° minor.
                </p>
                <p>
                  <b>THE GESTURE</b> Click open water to ask what formed near there and where it
                  went. Click a genesis point to open that storm. HOME restores the canonical
                  aperture; FIT frames whatever is drawn now.
                </p>
              </div>
            </details>
          ) : null}
        </span>
      </div>
    </>
  );
}

/* THE SAFFIR-SIMPSON KEY, AT THE SMALLEST STEP THE FRAME HAS.
 *
 * THE INK IS THE PLATE'S OWN, WHICH IS THE ONLY THING A KEY IS ALLOWED TO BE. It comes from
 * render/palette.js -- the same table the tracks are drawn from -- so the key cannot drift from
 * the cartography it explains. It is deliberately NOT the paper ramp the ledger's row ticks use:
 * that ramp is a paper derivation for marks that live on paper, and printing it here would be a
 * key to a map nobody is looking at.
 *
 * AND EACH SWATCH CARRIES THE PLATE'S GROUND WITH IT. The cartographic ramp was chosen against a
 * near-black stage; on paper #4fc3f7 measures 1.8:1, which is below the 3:1 WCAG 1.4.11 asks of
 * a graphical object that carries meaning. So the swatch is a tile of the stage's own ink with
 * the class stroke inside it -- a two-millimetre sample of the plate rather than a colour chip.
 * The identity ink is unchanged, the contrast is the contrast the reader sees on the map itself,
 * and the sample says what it is a sample OF.
 *
 * THE MAJOR CLASSES CARRY THE EXTRA STROKE HERE TOO. MAJOR_WEIGHT is 1.35 on the plate, and the
 * key's strokes are 3px and 4px for the same reason: the cat2/cat3 pair decides "major
 * hurricane" and is the one pair a reader must never misread, so the distinction is drawn in
 * weight as well as hue and survives monochrome and colour blindness.
 */
const CLASS_KEY = [
  ["td", "TD"], ["ts", "TS"], ["cat1", "1"], ["cat2", "2"],
  ["cat3", "3"], ["cat4", "4"], ["cat5", "5"],
];

function ClassKey() {
  return (
    <span className="at-classkey" data-class-key>
      <span className="at-classkey-k">CLASS</span>
      {CLASS_KEY.map(([k, label], i) => (
        <span className="at-classkey-item" key={k}>
          <span className="at-classkey-sw" aria-hidden="true">
            {/* MAJOR_FROM is an INDEX INTO CATEGORY_ORDER, and CLASS_KEY is that order, so the
                comparison is against the index itself: cat3 and above carry the extra stroke,
                cat2 does not, and the pair that decides "major hurricane" is the pair the extra
                pixel separates. */}
            <i data-class={k}
              style={{ background: CATEGORY_COLOR[k], height: i >= MAJOR_FROM ? 4 : 3 }} />
          </span>
          {label}
        </span>
      ))}
      <span className="at-classkey-major">MAJORS CARRY EXTRA STROKE</span>
    </span>
  );
}

/* THE PLATE'S STATED APERTURE, READ OFF THE RENDERED VIEW.
 *
 * The locked geometry rule is that a coordinate readout is legal only inside the plate's stated
 * aperture and reads `—` outside it. This is that aperture, stated: whatever the camera is
 * actually showing, to the degree, in the same hemisphere letters the graticule labels use. */
function apertureOf(frame) {
  if (!frame || !frame.bounds) return "—";
  const { west, east, south, north } = frame.bounds;
  const lon = (v) => `${Math.abs(Math.round(v))}°${v < 0 ? "W" : "E"}`;
  const lat = (v) => `${Math.abs(Math.round(v))}°${v < 0 ? "S" : "N"}`;
  return `${lon(west)} – ${lon(east)} · ${lat(south)} – ${lat(north)}`;
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
  /* THE RENDERED BOUNDS, CARRIED WITH THE REST OF THE FRAME. The aperture caption and the
     coordinate readout are both claims about what is on the plate right now, so they are read
     from the same settled measurement the ticks and the scale bar are. */
  return {
    w, h, ticksX, ticksY, labX, labY, scale,
    bounds: { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() },
  };
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
