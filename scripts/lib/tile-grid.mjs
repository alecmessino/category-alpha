/* MAP INTEGRITY — grading the Leaflet tile grid from the DOM, never from pixels.
 *
 * The question this answers: is the satellite layer actually drawn over the storm, or is
 * the map showing a dark skeleton that looks like night-time ocean? Those two states are
 * visually similar and structurally opposite, and nothing in the existing verification
 * distinguishes them — `verify-live.mjs` asserts the map's height and position, which a
 * completely blank map satisfies perfectly.
 *
 * ------------------------------------------------------------------------------------
 * WHY NOT PIXELS, AND THIS IS NOT A PREFERENCE
 *
 * The obvious implementation is to draw a tile into a <canvas> and read it back. It does
 * not work here, and it fails in the way that wastes the most time: `drawImage` succeeds,
 * and the SecurityError arrives later, at `getImageData`.
 *
 * `docs/app/map.jsx` builds tiles through Leaflet, which creates plain <img> elements with
 * NO `crossOrigin` attribute. An image loaded without `crossOrigin` taints the canvas it
 * is drawn into REGARDLESS of what the server sent — GIBS does send
 * `Access-Control-Allow-Origin: *`, and it makes no difference, because the taint rule is
 * about how the element requested the image, not about how the server answered. So every
 * pixel read against a GIBS tile throws, and the only ways out are to set `crossOrigin` on
 * Leaflet's tiles (which changes how the live map fetches every tile, to serve a test) or
 * to re-fetch each tile a second time in cors mode (which grades a different HTTP request
 * from the one the user is looking at).
 *
 * What IS readable cross-origin, with no taint and no second request:
 *
 *     img.complete        did the load finish
 *     img.naturalWidth    256 for a real tile, 1 for the errorTileUrl placeholder, 0 for
 *     img.naturalHeight   a load that produced nothing at all
 *     getBoundingClientRect()   where Leaflet placed it in the grid
 *
 * That is a complete census of which grid slots have imagery, which is the entire
 * question. `map.jsx` sets `errorTileUrl` to a 1x1 transparent GIF, so a 404 from GIBS
 * resolves to a tile of natural size 1x1 — an unambiguous, dimension-only signal that a
 * slot is empty, available without reading a single pixel.
 * ------------------------------------------------------------------------------------
 */

/* ==================================================================================
 * THE LIMB, PREDICTED RATHER THAN THRESHOLDED
 *
 * The first version of this gated on a flat empty fraction: more than 33.3% of slots
 * without imagery and the map fails. That number was a judgement call and it measured the
 * wrong thing. The empty fraction of a viewport depends on WHERE THE VIEWPORT IS, not on
 * whether anything is broken — a storm under nadir shows 0% empty on a healthy render, one
 * near the edge of the satellite's field shows well over half on an equally healthy render.
 * So the same constant simultaneously fails correct pictures at the limb and passes broken
 * ones at nadir. Every value you pick is wrong somewhere, because the quantity being
 * compared is not the quantity that matters.
 *
 * The quantity that matters is per-tile and it is knowable exactly. A geostationary
 * satellite sees a fixed cap of the Earth, centred on its sub-satellite point, bounded by
 * the geometric horizon:
 *
 *     cos(limb angle) = R_earth / R_geostationary  ->  81.30 degrees
 *
 * That is not a policy number. It falls out of the orbit radius, and it lets every slot be
 * classified before the map is even looked at: a tile whose four corners all lie inside the
 * cap MUST have imagery, and a tile whose corners all lie outside it must not. So a single
 * missing tile over the storm fails, and sixty per cent of a viewport empty at the limb
 * passes — which is exactly backwards from what the ratio did.
 *
 * The disk boundary is not tile-aligned, and tiles straddling it are genuinely partial. The
 * all-four-corners rule leaves those unjudged without needing a fudge factor, and one small
 * margin pulls the "must be filled" boundary in from the horizon, because the outermost
 * ring of the disk is extremely oblique and GIBS's reprojection to EPSG:3857 does not always
 * render it. The margin applies to that side ONLY, because that is the only side that can
 * produce a FAIL.
 */
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
export const GEOSTATIONARY_RADIUS_KM = 42164.0;
export const LIMB_ANGLE_DEG = Math.acos(EARTH_EQUATORIAL_RADIUS_KM / GEOSTATIONARY_RADIUS_KM) * 180 / Math.PI;
export const LIMB_MARGIN_DEG = 3.0;

/* Operational slots. GIBS names its layers by slot rather than by spacecraft, which is what
   we want — the slot is what fixes the geometry, and a satellite rotating into it does not
   move the disk. A layer that is not a geostationary product maps to `null`, meaning it has
   no limb at all: VIIRS CorrectedReflectance is a polar-orbiter daily mosaic covering the
   whole globe, so EVERY empty tile in it is a fault. The old ratio gate passed a broken
   VIIRS render happily. */
export const SUB_SATELLITE_LON = { "GOES-East": -75.2, "GOES-West": -137.0 };
export const GLOBAL_LAYER_RE = /VIIRS|MODIS|CorrectedReflectance|BlueMarble/i;

/* A layer that attached and delivered nothing has no interior void and no in-disk fault —
   every empty slot is border-connected and the prediction says the whole viewport is off
   the disk only if the geolocation failed. This is the backstop for a blank map. */
export const ABSENT_LAYER_EMPTY_RATIO = 0.9;

/* THE FALLBACK, and the only place the old constant survives. When the tiles cannot be
   geolocated — no loaded tile to anchor the lattice against, an unrecognised layer, a
   transposed parse — there is no prediction to make and the topological check below cannot
   see a large failure that happens to touch the viewport edge. A coarse ratio is then
   better than nothing, and 33.3% is the value it always was. It is a fallback, not the
   gate: the report says which one fired. */
export const LIMB_EMPTY_MAX = 0.333;

/* Below this the ratio in gate 3 is not a measurement, and a pane that renders this few
   tiles has not laid out yet. Graded UNKNOWN rather than passed: a check that reports
   "fine" on a grid it could not see is how a blank map ships. */
export const MIN_GRADED_TILES = 12;

/* Tiles still in flight are not empty, they are unfinished. Too many pending and the census
   was taken too early — UNKNOWN, so the caller settles and re-collects rather than
   believing a count taken mid-load. */
export const MAX_PENDING_RATIO = 0.2;

export const GRADED_HOSTS = ["gibs.earthdata.nasa.gov"];

/* ==================================================================================
 * THE COLLECTOR — runs INSIDE the page.
 *
 * Written as a zero-argument, dependency-free function so it can be handed straight to
 * `page.evaluate()`, which serialises the source and runs it in the browser where none of
 * this module's constants exist. Nothing here may reference anything outside its own body.
 *
 * It reads geometry rather than URLs on purpose. GIBS addresses tiles /{z}/{y}/{x} and
 * CARTO addresses them /{z}/{x}/{y}; parsing coordinates out of the URL would need a
 * per-host rule and would silently transpose one of them, which is exactly the kind of bug
 * that makes an adjacency check report holes that are not there. Leaflet has already
 * placed every tile on a regular lattice — reading that lattice back needs no host
 * knowledge at all.
 */
export function collectTileGridInPage() {
  const out = { ok: true, layers: [], note: null };
  const imgs = Array.from(document.querySelectorAll("img.leaflet-tile"));
  if (!imgs.length) { out.ok = false; out.note = "no img.leaflet-tile in the document"; return out; }

  /* Group by the container Leaflet owns. One TileLayer at one zoom level is one container,
     which is the unit a grid check is about — grading two zoom levels of the same layer
     together would compare lattices of different pitch. */
  const groups = new Map();
  for (const img of imgs) {
    const u = (() => { try { return new URL(img.currentSrc || img.src, location.href); } catch { return null; } })();
    const host = u && !/^data:/.test(img.src) ? u.hostname : "?";
    const container = img.parentElement;
    const pane = (() => { let n = img; while (n && !(n.classList && n.classList.contains("leaflet-pane"))) n = n.parentElement; return n ? n.className.replace(/\s*leaflet-pane\s*/, "").trim() : "?"; })();
    /* The blank placeholder is not on a host — it is a data: URI — so it inherits the
       group of the container it sits in rather than forming one of its own. */
    const key = container ? (container.dataset.mtGrid || (container.dataset.mtGrid = String(groups.size))) : "orphan";
    if (!groups.has(key)) groups.set(key, { pane, hosts: {}, imgs: [], keys: new Map(), layer: null });
    const g = groups.get(key);
    if (host !== "?") {
      g.hosts[host] = (g.hosts[host] || 0) + 1;
      /* GIBS paths are /wmts/epsg3857/best/<layer>/default/<time>/<tms>/{z}/{y}/{x}.<ext>.
         The layer name is captured once per container; the coordinate triple is captured
         per tile so the grader can anchor the lattice to real tile indices.

         Only LOADED tiles can carry one. Leaflet replaces src with errorTileUrl when a tile
         fails, so the empty slots — the ones we most want to place — have lost their URL.
         That is fine and is what the lattice is for: two loaded tiles fix the offset
         between DOM column/row and tile x/y, and every slot follows from it. */
      const seg = u.pathname.split("/").filter(Boolean);
      if (seg.length >= 8 && seg[0] === "wmts") g.layer = g.layer || seg[3];
      const tail = seg.slice(-3);
      if (tail.length === 3) g.keys.set(img, tail.join("/").replace(/\.[a-z]+$/i, ""));
    }
    g.imgs.push(img);
  }

  for (const [, g] of groups) {
    /* The rendered tile pitch, taken from the tiles themselves. zoomSnap is 0.25 on this
       map, so a tile is CSS-scaled and is NOT 256 css pixels wide at every zoom. Measuring
       it rather than assuming it is what keeps the lattice indices integral. */
    const widths = g.imgs.map((i) => i.getBoundingClientRect().width).filter((w) => w > 1).sort((a, b) => a - b);
    const pitch = widths.length ? widths[Math.floor(widths.length / 2)] : 256;
    const tiles = [];
    for (const img of g.imgs) {
      const r = img.getBoundingClientRect();
      /* naturalWidth/Height and complete are all readable cross-origin. No canvas is
         created anywhere in this function, and none may be added: the moment a pixel is
         read the whole check starts throwing SecurityError on the layer it exists to
         grade. */
      const nw = img.naturalWidth, nh = img.naturalHeight;
      let state;
      if (!img.complete) state = "pending";
      else if (nw === 0 || nh === 0) state = "failed";        // load produced nothing at all
      else if (nw <= 1 && nh <= 1) state = "blank";           // the 1x1 errorTileUrl placeholder
      else state = "loaded";
      tiles.push({
        col: pitch > 1 ? Math.round(r.left / pitch) : 0,
        row: pitch > 1 ? Math.round(r.top / pitch) : 0,
        w: nw, h: nh, state,
        key: g.keys.get(img) || null,          // "z/y/x", loaded tiles only
      });
    }
    const host = Object.entries(g.hosts).sort((a, b) => b[1] - a[1])[0];
    out.layers.push({ pane: g.pane, host: host ? host[0] : null, layer: g.layer, pitch: Math.round(pitch), tiles });
  }
  return out;
}

/* ==================================================================================
 * THE GRADER — pure, runs in Node, and is where every judgement lives.
 *
 * Kept out of the page so it can be tested against hand-built censuses. A grader that only
 * ever runs inside a browser against whatever the live map happened to draw can only be
 * tested by hoping the right failure occurs.
 */

const g_fail = (status, note) => Object.freeze({ ok: false, status, note: String(note) });

/* ENCLOSED EMPTY REGIONS, by flood fill from the border.
 *
 * The limb enters the viewport from outside, so every off-disk slot is reachable from the
 * edge of the collected lattice through other off-disk slots. Flood the empty slots
 * starting at the border; anything empty that the flood does not reach is enclosed by
 * imagery and is tiles failing.
 *
 * EIGHT-CONNECTED, deliberately. The disk boundary is not tile-aligned, so a real limb is
 * ragged and can touch a corner diagonally at the edge of the viewport. Flooding
 * four-connected would call that ragged corner an enclosed void and fail a correct render —
 * and a false failure here is the expensive one, because it teaches an operator to ignore
 * the check. The cost is that a void touching the limb diagonally is absorbed; gate 1
 * catches that case by geometry, which is why the prediction runs first.
 *
 * This replaces a four-orthogonal-neighbours test that only ever caught a SINGLE isolated
 * tile. A 2x2 block of failures — what a CDN error or a rate limit actually produces — had
 * every member adjacent to another empty member and escaped it completely.
 */
export function enclosedVoids(tiles) {
  const empty = new Map();
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const t of tiles) {
    minC = Math.min(minC, t.col); maxC = Math.max(maxC, t.col);
    minR = Math.min(minR, t.row); maxR = Math.max(maxR, t.row);
    if (t.state === "blank" || t.state === "failed") empty.set(t.col + ":" + t.row, t);
  }
  if (!empty.size) return { voids: [], regions: 0 };

  /* Seed from every empty slot on the lattice border, plus any empty slot with a missing
     neighbour — a gap in the collected lattice is the outside too, and treating it as
     enclosure would invent a fault out of a tile Leaflet had not created yet. */
  const present = new Set(tiles.map((t) => t.col + ":" + t.row));
  const seen = new Set(), stack = [];
  for (const [k, t] of empty) {
    const onBorder = t.col === minC || t.col === maxC || t.row === minR || t.row === maxR;
    const gapAdjacent = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dc, dr]) => !present.has((t.col + dc) + ":" + (t.row + dr)));
    if (onBorder || gapAdjacent) { seen.add(k); stack.push(t); }
  }
  while (stack.length) {
    const t = stack.pop();
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      if (!dc && !dr) continue;
      const k = (t.col + dc) + ":" + (t.row + dr);
      if (!empty.has(k) || seen.has(k)) continue;
      seen.add(k); stack.push(empty.get(k));
    }
  }

  const voids = [...empty.entries()].filter(([k]) => !seen.has(k)).map(([, t]) => t);
  /* Count distinct regions too: one region of nine is a dead tile server, nine regions of
     one is intermittent loss, and they want different responses. */
  const left = new Set(voids.map((t) => t.col + ":" + t.row));
  let regions = 0;
  for (const t of voids) {
    const k = t.col + ":" + t.row;
    if (!left.has(k)) continue;
    regions++;
    const st = [t]; left.delete(k);
    while (st.length) {
      const c = st.pop();
      for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
        const kk = (c.col + dc) + ":" + (c.row + dr);
        if (!left.has(kk)) continue;
        left.delete(kk); st.push(voids.find((v) => v.col + ":" + v.row === kk));
      }
    }
  }
  return { voids, regions };
}

/* ---- WEB MERCATOR TILE GEOMETRY -------------------------------------------------
   GoogleMapsCompatible, which is what both GIBS TileMatrixSets in map.jsx use. Exported
   so the arithmetic is testable against values that can be checked by hand rather than
   only through a rendered map. */
export function tileLonRange(z, x) {
  const n = Math.pow(2, z);
  return [x / n * 360 - 180, (x + 1) / n * 360 - 180];
}
export function tileLatRange(z, y) {
  const n = Math.pow(2, z);
  const lat = (yy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
  return [lat(y + 1), lat(y)];                       // south, north
}

/* Geocentric angle between a point and the sub-satellite point, which sits on the equator.
   cos(alpha) = cos(lat) * cos(lon - subLon). Beyond LIMB_ANGLE_DEG the point is below the
   satellite's horizon and there is no imagery to be had. */
export function geocentricAngleDeg(lat, lon, subLon) {
  const d = (v) => v * Math.PI / 180;
  let dl = ((lon - subLon + 540) % 360) - 180;
  return Math.acos(Math.max(-1, Math.min(1, Math.cos(d(lat)) * Math.cos(d(dl))))) * 180 / Math.PI;
}

/* Classify one tile against the disk. All four corners, so a tile straddling the limb —
   genuinely half imagery and half nothing — is returned as "edge" and judged by neither
   gate. That is what removes the need for a fudge factor on the outside. */
export function tileDiskClass(z, x, y, subLon, opts) {
  const o = opts || {};
  const inner = (o.limbAngleDeg ?? LIMB_ANGLE_DEG) - (o.limbMarginDeg ?? LIMB_MARGIN_DEG);
  const outer = o.limbAngleDeg ?? LIMB_ANGLE_DEG;
  if (subLon == null) return "inside";               // a global mosaic has no limb at all
  const [south, north] = tileLatRange(z, y);
  const [west, east] = tileLonRange(z, x);
  const angles = [[south, west], [south, east], [north, west], [north, east]]
    .map(([la, lo]) => geocentricAngleDeg(la, lo, subLon));
  if (angles.every((a) => a <= inner)) return "inside";
  if (angles.every((a) => a >= outer)) return "outside";
  return "edge";
}

/* ---- ANCHORING THE LATTICE ------------------------------------------------------
   DOM column/row and tile x/y differ by a constant offset. Two loaded tiles fix it, and
   every further loaded tile must agree — a disagreement means the parse is wrong (a
   transposed y/x, a second zoom level mixed into one container) and the whole geolocation
   is refused rather than used to produce confident nonsense.

   GIBS addresses tiles /{z}/{y}/{x}; CARTO addresses them /{z}/{x}/{y}. Only GIBS is
   graded, so the order is known — but "known" is how a transposition survives review, so
   the fit is checked and then sanity-checked again below. */
export function anchorLattice(tiles) {
  const known = (tiles || []).filter((t) => t.key);
  if (known.length < 2) return null;
  let z = null, dx = null, dy = null;
  for (const t of known) {
    const p = String(t.key).split("/").map(Number);
    if (p.length !== 3 || p.some((v) => !Number.isInteger(v))) return null;
    const [tz, ty, tx] = p;                          // GIBS order: z / y / x
    if (z == null) { z = tz; dx = tx - t.col; dy = ty - t.row; continue; }
    if (tz !== z || tx - t.col !== dx || ty - t.row !== dy) return null;
  }
  return { z, dx, dy, anchors: known.length };
}

export function gradeTileGrid(census, opts) {
  const o = opts || {};
  const limbMax = o.limbEmptyMax ?? LIMB_EMPTY_MAX;
  const minTiles = o.minTiles ?? MIN_GRADED_TILES;
  const hosts = o.hosts || GRADED_HOSTS;

  if (!census || census.ok === false) {
    return g_fail(503, `tile census unavailable: ${(census && census.note) || "collector returned nothing"} — the map pane may not have rendered, which is not the same as the imagery being absent`);
  }
  const graded = (census.layers || []).filter((l) => l.host && hosts.some((h) => String(l.host).endsWith(h)));
  if (!graded.length) {
    return g_fail(503, `no tile layer from ${hosts.join(", ")} is in the DOM. Either the satellite layer is toggled off, or every candidate slot probe failed and map.jsx never attached one — those need opposite responses and this check cannot tell them apart`);
  }

  /* Leaflet retains the previous zoom level's tiles in a second container while a new one
     fills in. Grading the retained lattice would grade a picture the user is no longer
     looking at, so per host the ACTIVE layer is the one with the most tiles, and the rest
     are reported as retained. */
  const byHost = new Map();
  for (const l of graded) {
    const prev = byHost.get(l.host);
    if (!prev || l.tiles.length > prev.tiles.length) byHost.set(l.host, l);
  }
  const retained = graded.length - byHost.size;

  const report = [];
  for (const [host, layer] of byHost) {
    const tiles = layer.tiles || [];
    const total = tiles.length;
    const pending = tiles.filter((t) => t.state === "pending").length;
    const blank = tiles.filter((t) => t.state === "blank").length;
    const failed = tiles.filter((t) => t.state === "failed").length;
    const empty = blank + failed;
    const settled = total - pending;
    const { voids, regions } = enclosedVoids(tiles);
    const ratio = settled > 0 ? empty / settled : null;

    /* THE PREDICTION, when the lattice can be anchored to real tile indices. */
    let disk = null, geoNote = null;
    const fit = anchorLattice(tiles);
    const slot = layer.layer ? Object.keys(SUB_SATELLITE_LON).find((k) => layer.layer.startsWith(k)) : null;
    const isGlobal = layer.layer ? GLOBAL_LAYER_RE.test(layer.layer) : false;
    if (!fit) geoNote = "no consistent lattice anchor — fewer than two loaded tiles, or their coordinates disagree";
    else if (!slot && !isGlobal) geoNote = `layer "${layer.layer || "?"}" is neither a known geostationary slot nor a recognised global mosaic`;
    else {
      const subLon = slot ? SUB_SATELLITE_LON[slot] : null;
      const classed = tiles.map((t) => ({ t, x: t.col + fit.dx, y: t.row + fit.dy }))
        .map((e) => ({ ...e, cls: tileDiskClass(fit.z, e.x, e.y, subLon, o) }));
      /* SANITY CHECK ON THE PARSE. If the coordinate order were transposed the loaded
         tiles would scatter across the globe and most would fall outside the disk. A
         majority of loaded tiles must classify as inside; otherwise the geolocation is
         refused and gate 2 carries the layer alone. Believing a transposed fit would fail
         every correct render with great confidence. */
      const loaded = classed.filter((e) => e.t.state === "loaded");
      const inside = loaded.filter((e) => e.cls === "inside").length;
      if (loaded.length && inside / loaded.length < 0.5) {
        geoNote = `${inside}/${loaded.length} loaded tiles classify as inside the disk — the coordinate fit is not trustworthy and is refused`;
      } else {
        const bad = classed.filter((e) => e.cls === "inside" && (e.t.state === "blank" || e.t.state === "failed"));
        disk = {
          z: fit.z, subLon, slot: slot || "global", anchors: fit.anchors,
          inDisk: classed.filter((e) => e.cls === "inside").length,
          offDisk: classed.filter((e) => e.cls === "outside").length,
          onLimb: classed.filter((e) => e.cls === "edge").length,
          inDiskEmpty: bad.length,
          sample: bad.slice(0, 3).map((e) => {
            const [south, north] = tileLatRange(fit.z, e.y);
            const [west, east] = tileLonRange(fit.z, e.x);
            const lat = (south + north) / 2, lon = (west + east) / 2;
            return { x: e.x, y: e.y, lat, lon, angle: geocentricAngleDeg(lat, lon, subLon) };
          }),
        };
      }
    }

    report.push({ host, layer: layer.layer, pane: layer.pane, total, settled, pending, blank, failed, empty, ratio,
      voids: voids.length, voidRegions: regions, voidAt: voids.slice(0, 5).map((t) => ({ col: t.col, row: t.row, state: t.state })),
      disk, geoNote });
  }

  /* UNKNOWN before FAIL, always. A grid that had not finished laying out must never be
     reported as a layout error — that is the false positive this whole check is built to
     avoid, and reporting it would train an operator to ignore the check. */
  const tooSmall = report.filter((r) => r.settled < minTiles);
  if (tooSmall.length === report.length) {
    return g_fail(503, `only ${report.map((r) => r.settled).join("/")} settled tile(s) across ${report.length} layer(s), under the ${minTiles} needed for a ratio to mean anything. The pane has not laid out — settle and re-collect rather than grading this`);
  }
  const tooPending = report.filter((r) => r.total > 0 && r.pending / r.total > (o.maxPendingRatio ?? MAX_PENDING_RATIO));
  if (tooPending.length) {
    return g_fail(503, `${tooPending.map((r) => `${r.host} ${r.pending}/${r.total} still loading`).join(" · ")} — the census was taken mid-load and its empty count is not a measurement`);
  }

  /* ---- GATE 1: THE PREDICTION ---------------------------------------------------
     Per-tile, no ratio. An empty slot whose four corners all lie inside the satellite's
     horizon is imagery that should exist and does not, and one of them fails the map. */
  const predicted = [];
  for (const r of report) {
    if (!r.disk) continue;
    if (r.disk.inDiskEmpty > 0) {
      predicted.push(`${r.host} ${r.layer || "?"}: ${r.disk.inDiskEmpty} empty slot(s) inside the ${r.disk.subLon == null ? "global mosaic" : `disk of the ${r.disk.slot} satellite at ${r.disk.subLon}\u00b0`}`
        + `, e.g. ${r.disk.sample.map((t) => `z${r.disk.z}/x${t.x}/y${t.y} at ${t.lat.toFixed(1)}\u00b0,${t.lon.toFixed(1)}\u00b0 (${t.angle.toFixed(1)}\u00b0 from nadir, limb is ${LIMB_ANGLE_DEG.toFixed(1)}\u00b0)`).join("; ")}`);
    }
  }
  if (predicted.length) {
    return g_fail(409, `${predicted.join(" \u00b7 ")}. These are not curvature: the geometry says the satellite is looking at them`);
  }

  /* ---- GATE 2: THE TOPOLOGY -----------------------------------------------------
     Belt and braces behind the prediction, and the whole gate when a layer cannot be
     geolocated. A limb is a connected region entering the viewport from outside, so every
     off-disk slot reaches the edge of the lattice through other off-disk slots. An empty
     region that does NOT is enclosed by imagery and is a fault at any size.

     This supersedes the earlier four-orthogonal-neighbours test, which only ever caught a
     SINGLE isolated tile: a 2x2 block of failures — the shape a CDN error or a rate limit
     actually produces — had every member adjacent to another empty member and escaped
     entirely. A flood fill has no such blind spot. */
  const voided = report.filter((r) => r.voids > 0);
  if (voided.length) {
    return g_fail(409, `${voided.map((r) => `${r.host}: ${r.voids} empty slot(s) in ${r.voidRegions} region(s) enclosed by loaded imagery, e.g. ${r.voidAt.map((h) => `(${h.col},${h.row})=${h.state}`).join(", ")}`).join(" \u00b7 ")}. `
      + `A limb reaches the edge of the viewport by definition, so an enclosed empty region is tiles failing, not curvature`);
  }

  /* ---- GATE 3: THE ABSENT LAYER -------------------------------------------------
     A layer that attached and returned nothing has no in-disk fault and no enclosed void —
     every empty slot is border-connected — so neither gate above sees it, and a blank map
     is the failure this whole check exists to catch. Where the tiles could not be
     geolocated the bound tightens to the old 33.3% ratio, because gate 1 is unavailable and
     gate 2 cannot see a large failure that happens to touch the viewport edge. */
  for (const r of report) {
    const bound = r.disk ? (o.absentLayerEmptyRatio ?? ABSENT_LAYER_EMPTY_RATIO) : limbMax;
    if (r.settled >= minTiles && r.ratio != null && r.ratio > bound) {
      return g_fail(409, `${r.host} ${(r.ratio * 100).toFixed(1)}% empty (${r.empty}/${r.settled}: ${r.blank} placeholder, ${r.failed} no-load), over the ${(bound * 100).toFixed(1)}% bound`
        + (r.disk ? " for a layer that attached and delivered nothing"
                  : ` \u2014 tiles could not be geolocated (${r.geoNote}), so the coarse limb ratio applies instead of the per-tile prediction`)
        + `. Check that map.jsx resolved a published GOES slot instead of falling through its twelve 10-minute candidates to the VIIRS daily fallback`);
    }
  }

  const worst = report.reduce((a, b) => ((b.ratio ?? 0) > (a.ratio ?? 0) ? b : a), report[0]);
  return Object.freeze({
    ok: true, status: 0,
    note: `${report.length} graded layer(s)${retained ? ` (+${retained} retained from a previous zoom, not graded)` : ""}`
      + ` \u00b7 ${report.map((r) => r.disk
        ? `${r.host} ${r.layer || "?"}: ${r.disk.inDisk} in-disk slot(s) all filled, ${r.disk.offDisk} off-disk, ${r.disk.onLimb} straddling the limb (unjudged)`
        : `${r.host}: ${(r.ratio ?? 0) * 100}% empty under the coarse limb ratio \u2014 ${r.geoNote}`).join(" \u00b7 ")}`
      + ` \u00b7 no enclosed empty regions`,
    value: { layers: report, retained, limbAngleDeg: LIMB_ANGLE_DEG, limbMarginDeg: LIMB_MARGIN_DEG, fallbackRatio: limbMax },
  });
}

/* ==================================================================================
 * THE BYPASS, MADE ENFORCEABLE
 *
 * "It must explicitly bypass canvas pixel reads" is a requirement about code that does not
 * exist yet as much as about code that does. Somebody will one day want a mean-brightness
 * check and will reach for a canvas, it will work in their local test against a
 * same-origin fixture, and it will throw SecurityError on the deployed board against GIBS.
 *
 * So the prohibition is a check rather than a comment. Run it over whatever source ends up
 * carrying the in-page collector.
 */
const PIXEL_READS = /\b(getImageData|toDataURL|toBlob|createImageBitmap)\s*\(/g;

export function auditNoCanvasReads(sources) {
  const hits = [];
  for (const { path, text } of sources || []) {
    for (const m of String(text || "").matchAll(PIXEL_READS)) {
      const line = String(text).slice(0, m.index).split("\n").length;
      hits.push(`${path}:${line} ${m[0]}`);
    }
  }
  if (hits.length) {
    return g_fail(409, `${hits.length} canvas pixel read(s) in the map-verification path: ${hits.join(", ")}. `
      + `Leaflet's tiles carry no crossOrigin attribute, so drawing one into a canvas taints it whatever CORS headers GIBS sends, and the read throws SecurityError on the deployed board while passing against any same-origin fixture`);
  }
  return Object.freeze({ ok: true, status: 0, note: `no canvas pixel reads across ${(sources || []).length} source(s) — the grid census is DOM geometry and naturalWidth only`, value: { sources: (sources || []).length } });
}
