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

/* THE LIMB THRESHOLD.
 *
 * A GOES full disk is a circle on a globe; in EPSG:3857 the map is a rectangle. A viewport
 * over a storm near the edge of the satellite's field legitimately contains slots with no
 * imagery, and they are not a fault — they are the edge of the world the satellite can
 * see. So a raw "any empty tile fails" check fires constantly on correct renders.
 *
 * 33.3% is a POLICY CONSTANT, chosen, not derived. There is no projection identity that
 * produces it: the empty fraction depends on where the viewport sits relative to the limb,
 * and ranges from 0 for a storm under nadir to well over half for one at the edge. A third
 * is the point past which a reader would stop calling it "the edge of the disk" and start
 * calling it "the imagery is missing", and it is set here as a named, overridable number
 * so that judgement is visible and arguable instead of buried in an inequality.
 *
 * It is deliberately NOT the only gate, because a ratio cannot see shape — see
 * `interiorHoles` below, which fails a single missing tile in the middle of the picture at
 * an empty fraction of two per cent. The ratio catches "the layer did not attach"; the
 * hole check catches "tiles are failing". They are different faults and neither test
 * finds the other.
 */
export const LIMB_EMPTY_MAX = 0.333;

/* Below this the ratio is not a measurement. Six empty slots out of nine is 67% and means
   nothing; a map pane that renders that few tiles has not laid out yet. Graded UNKNOWN
   rather than passed, because a check that reports "fine" on a grid it could not see is
   how a blank map ships. */
export const MIN_GRADED_TILES = 12;

/* Tiles still in flight are not empty, they are unfinished. If too many are pending the
   census was taken too early and the verdict is UNKNOWN — the caller should settle and
   re-collect rather than believe a number taken mid-load. */
export const MAX_PENDING_RATIO = 0.2;

/* The hosts whose grids are graded. CARTO's dark basemap is deliberately excluded: it has
   a tile everywhere on Earth, so an empty CARTO slot is a CDN failure rather than a limb,
   and folding it into the same ratio would let a healthy basemap mask a missing satellite
   layer. */
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
    const host = (() => { try { return new URL(img.currentSrc || img.src, location.href).hostname; } catch { return "?"; } })();
    const container = img.parentElement;
    const pane = (() => { let n = img; while (n && !(n.classList && n.classList.contains("leaflet-pane"))) n = n.parentElement; return n ? n.className.replace(/\s*leaflet-pane\s*/, "").trim() : "?"; })();
    /* The blank placeholder is not on a host — it is a data: URI — so it inherits the
       group of the container it sits in rather than forming one of its own. */
    const key = container ? (container.dataset.mtGrid || (container.dataset.mtGrid = String(groups.size))) : "orphan";
    if (!groups.has(key)) groups.set(key, { pane, hosts: {}, imgs: [] });
    const g = groups.get(key);
    if (host !== "?" && !/^data:/.test(img.src)) g.hosts[host] = (g.hosts[host] || 0) + 1;
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
      });
    }
    const host = Object.entries(g.hosts).sort((a, b) => b[1] - a[1])[0];
    out.layers.push({ pane: g.pane, host: host ? host[0] : null, pitch: Math.round(pitch), tiles });
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

/* An empty slot whose four orthogonal neighbours are all present AND loaded is not the
   limb. The limb is a connected boundary: every slot outside the disk touches either
   another outside slot or the edge of the collected lattice. A hole surrounded by imagery
   is a tile that failed, and it fails the map at any empty ratio at all — which is the
   whole reason the 33.3% gate is not sufficient on its own. */
export function interiorHoles(tiles) {
  const at = new Map();
  for (const t of tiles) at.set(t.col + ":" + t.row, t);
  const holes = [];
  for (const t of tiles) {
    if (t.state === "loaded" || t.state === "pending") continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => at.get((t.col + dc) + ":" + (t.row + dr)));
    if (n.every((x) => x && x.state === "loaded")) holes.push({ col: t.col, row: t.row, state: t.state });
  }
  return holes;
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
    const holes = interiorHoles(tiles);
    const ratio = settled > 0 ? empty / settled : null;
    report.push({ host, pane: layer.pane, total, settled, pending, blank, failed, empty, ratio, holes: holes.length, holeAt: holes.slice(0, 5) });
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

  /* THE HOLE GATE, first, because it is the unambiguous one. */
  const holed = report.filter((r) => r.holes > 0);
  if (holed.length) {
    return g_fail(409, `${holed.map((r) => `${r.host}: ${r.holes} empty slot(s) fully enclosed by loaded imagery, e.g. ${r.holeAt.map((h) => `(${h.col},${h.row})=${h.state}`).join(", ")}`).join(" · ")}. `
      + `A limb is a connected boundary — every slot outside the disk touches another outside slot or the edge of the lattice — so an enclosed empty slot is a tile that failed, not curvature, and it fails at any empty ratio`);
  }

  /* THE LIMB GATE. Strictly greater than the threshold fails, so a grid sitting exactly at
     33.3% passes: the constant is the largest empty fraction still called limb. */
  const over = report.filter((r) => r.settled >= minTiles && r.ratio != null && r.ratio > limbMax);
  if (over.length) {
    return g_fail(409, `${over.map((r) => `${r.host} ${(r.ratio * 100).toFixed(1)}% empty (${r.empty}/${r.settled}: ${r.blank} placeholder, ${r.failed} no-load)`).join(" · ")}`
      + ` exceeds the ${(limbMax * 100).toFixed(1)}% limb allowance. Past this the picture is missing rather than curved — check that map.jsx resolved a published GOES slot instead of falling through its twelve 10-minute candidates to the VIIRS daily fallback`);
  }

  const worst = report.reduce((a, b) => ((b.ratio ?? 0) > (a.ratio ?? 0) ? b : a), report[0]);
  return Object.freeze({
    ok: true, status: 0,
    note: `${report.length} graded layer(s)${retained ? ` (+${retained} retained from a previous zoom, not graded)` : ""}`
      + ` · worst ${worst.host} ${((worst.ratio ?? 0) * 100).toFixed(1)}% empty of ${worst.settled} settled tiles, within the ${(limbMax * 100).toFixed(1)}% limb allowance`
      + ` · no interior holes`,
    value: { layers: report, retained, limbEmptyMax: limbMax },
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
