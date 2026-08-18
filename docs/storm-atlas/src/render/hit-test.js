/* What is under the cursor -- and the rule that decides between the Atlas's two gestures.
 *
 * THE PROBLEM. At basin zoom the archive draws a mat of 3,885 tracks in which almost every
 * pixel is within a few pixels of some storm. Hit-testing tracks therefore makes the primary
 * gesture unreachable: a click meant to ask "what formed here" gets answered with "here is
 * LILY 1967", chosen essentially at random from the forty tracks under the pointer. Worse, the
 * reader cannot tell which one they are about to get, so the selection feels arbitrary because
 * it is.
 *
 * THE RULE. Genesis points are the click targets for storms; everything else probes -- but a
 * genesis point only counts as a target when it is DISTINGUISHABLE from its neighbours.
 *
 * That second clause is doing real work. Genesis dots are sparse over the map as a whole (at the
 * opening view, fewer than 5% of pixels are within nine of one) but they are saturated in the
 * east Pacific main development region, where the nearest dot to an arbitrary pixel is about a
 * pixel away. Selecting on proximity alone would therefore steal the primary gesture in exactly
 * the region a reader most wants to ask "what formed here" -- and would hand back one of forty
 * co-located storms, chosen by rounding.
 *
 * So a click selects only when one dot is clearly nearer than the next: an unambiguous target.
 * Where dots are packed the click probes instead, which is the more meaningful answer there
 * anyway, and zooming in separates them until picking one means something. The interface
 * degrades toward the honest answer rather than toward an arbitrary one.
 *
 * Hovering tests exactly what clicking will do, so the pointer never promises a selection the
 * click will not make.
 */

/**
 * @param archive   the loaded Archive
 * @param map       the Leaflet map
 * @param point     a Leaflet container point
 * @param rows      optional Set of storm rows to restrict the search to (the current filter)
 * @param tolerance search radius in screen pixels
 * @returns {{row, distancePx}|null}
 */
export function hitGenesis(archive, map, point,
  { rows = null, tolerance = 9, ambiguityRatio = 1.8 } = {}) {
  const zoom = map.getZoom();
  const scale = 256 * Math.pow(2, zoom);
  /* The same chain the renderer uses, and it has to be: container pixel = world * scale minus
     (pixel origin + the layer point of the container's own top-left). Deriving it any other way
     makes the pointer test a different place than the eye sees. */
  const pixelOrigin = map.getPixelOrigin();
  const topLeft = map.containerPointToLayerPoint([0, 0]);
  const ox = pixelOrigin.x + topLeft.x;
  const oy = pixelOrigin.y + topLeft.y;

  const idx = genesisIndex(archive);
  const centre = map.containerPointToLatLng(point);
  const padDeg = Math.max((tolerance * 360) / scale, 0.05) + idx.cellDeg;

  let best = -1;
  let bestD2 = (tolerance + 1) * (tolerance + 1);
  let secondD2 = Infinity;
  const { cellDeg, nx, ny, starts, order, wx, wy } = idx;

  for (let cy = Math.floor((centre.lat - padDeg + 90) / cellDeg);
       cy <= Math.floor((centre.lat + padDeg + 90) / cellDeg); cy++) {
    if (cy < 0 || cy >= ny) continue;
    for (let cxRaw = Math.floor((centre.lng - padDeg + 180) / cellDeg);
         cxRaw <= Math.floor((centre.lng + padDeg + 180) / cellDeg); cxRaw++) {
      // Wrap rather than clamp: a search box straddling the antimeridian must reach both sides.
      const cx = ((cxRaw % nx) + nx) % nx;
      const c = cy * nx + cx;
      for (let s = starts[c]; s < starts[c + 1]; s++) {
        const row = order[s];
        if (rows && !rows.has(row)) continue;
        // Try the neighbouring worlds too, so a genesis point near the seam is clickable from
        // whichever side of it is on screen.
        for (let o = -1; o <= 1; o++) {
          const dx = (wx[row] + o) * scale - ox - point.x;
          const dy = wy[row] * scale - oy - point.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) { secondD2 = bestD2; bestD2 = d2; best = row; }
          else if (d2 < secondD2) secondD2 = d2;
        }
      }
    }
  }
  if (best < 0) return null;
  /* Ambiguous: another genesis point is about as close, so there is no single storm the reader
     can be said to have pointed at. Probing is the honest answer, and zooming in resolves it. */
  const nearest = Math.sqrt(bestD2);
  const second = Math.sqrt(secondD2);
  if (Number.isFinite(second) && second < nearest * ambiguityRatio + 2) return null;
  return { row: best, distancePx: nearest };
}

/* A bucket grid over the 3,959 genesis points. Built once and cached on the archive: it is four
   orders of magnitude smaller than an index over the 224,153 track points, and it is the only
   index the pointer needs. */
const CACHE = new WeakMap();
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

function genesisIndex(archive) {
  const hit = CACHE.get(archive);
  if (hit) return hit;

  const lat = archive.genesis.raw("genesis_lat");
  const lon = archive.genesis.raw("genesis_lon");
  const n = archive.nStorms;
  const cellDeg = 5;
  const nx = Math.ceil(360 / cellDeg);
  const ny = Math.ceil(180 / cellDeg);
  const counts = new Uint32Array(nx * ny + 1);
  const cellOf = new Int32Array(n).fill(-1);
  const wx = new Float64Array(n);
  const wy = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const la = lat[i];
    // 54 storms have no genesis point in the archive. They have no click target either, rather
    // than a target at a position nobody recorded.
    if (Number.isNaN(la)) continue;
    let clamped = la;
    if (clamped > MAX_LAT) clamped = MAX_LAT;
    else if (clamped < -MAX_LAT) clamped = -MAX_LAT;
    wx[i] = (lon[i] + 180) / 360;
    wy[i] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (clamped * DEG) / 2)) / (2 * Math.PI);
    let cx = Math.floor((lon[i] + 180) / cellDeg);
    let cy = Math.floor((la + 90) / cellDeg);
    if (cx >= nx) cx = nx - 1; if (cx < 0) cx = 0;
    if (cy >= ny) cy = ny - 1; if (cy < 0) cy = 0;
    const c = cy * nx + cx;
    cellOf[i] = c;
    counts[c + 1]++;
  }
  for (let c = 0; c < nx * ny; c++) counts[c + 1] += counts[c];
  const order = new Uint32Array(n);
  const cursor = counts.slice(0, nx * ny);
  let placed = 0;
  for (let i = 0; i < n; i++) {
    if (cellOf[i] < 0) continue;
    order[cursor[cellOf[i]]++] = i;
    placed++;
  }
  const idx = { cellDeg, nx, ny, starts: counts, order: order.subarray(0, placed), wx, wy };
  CACHE.set(archive, idx);
  return idx;
}
