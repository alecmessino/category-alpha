/* The canvas layer everything draws on, and the projection that makes it fast.
 *
 * 224,153 track points cannot become DOM elements, and they cannot become Leaflet vector
 * layers either -- L.Polyline allocates an object and a path per storm and re-projects every
 * LatLng on every frame. So the Atlas draws into one canvas per concern and projects the
 * points itself.
 *
 * THE PROJECTION IS PRECOMPUTED ONCE AND IS THEN A MULTIPLY.
 * Web Mercator's y is a logarithm, and calling it 224,153 times per frame is most of a frame's
 * budget. But the expensive part -- ln(tan(pi/4 + lat/2)) -- does not depend on zoom at all: it
 * is a fixed position in a unit world square. So it is computed once at load into a pair of
 * Float32Arrays, and drawing a frame becomes `wx * scale` and `wy * scale`. Float32 costs about
 * eight thousandths of a pixel at the Atlas's deepest zoom, which is well under a hairline.
 *
 * PANNING DOES NOT REDRAW. The canvas lives inside a Leaflet pane, and Leaflet transforms its
 * panes during a drag, so a pan moves the already-drawn pixels for free. The canvas is sized
 * with padding beyond the viewport so that a drag can travel a way before it exposes an unpainted
 * edge; a redraw happens on moveend, zoomend and resize. A zoom animates by CSS transform and
 * redraws when it settles -- the same contract Leaflet's own renderer offers its vectors.
 */

const L = globalThis.L;

/** Leaflet's EPSG:3857 clamps here; beyond it Mercator y runs to infinity. */
const MAX_LAT = 85.0511287798;
const DEG = Math.PI / 180;

/**
 * Project every track point into the unit world square, once, with longitudes UNWRAPPED along
 * each storm.
 *
 * THE BUG THIS EXISTS TO PREVENT. A storm crossing the antimeridian has consecutive fixes at
 * 179.9E and 179.9W. Projected independently those are wx 0.9997 and wx 0.0003, and the line
 * between them is drawn straight across the entire map -- a horizontal streak from one edge to
 * the other, through ocean the storm was never in. The archive has 341 storms with a West
 * Pacific genesis and 664 with a Central Pacific track point, so this is not an edge case here,
 * it is the Central Pacific.
 *
 * So x is accumulated ALONG each storm rather than computed per point: whenever a step would
 * jump more than half a world, a whole world is added or subtracted, and the track stays
 * continuous. A storm can then legitimately sit outside [0,1], which is why the layers draw at
 * world offsets of -1, 0 and +1 and cull by each storm's own x-range.
 */
export function projectWorld(archive) {
  const n = archive.nPoints;
  const latE2 = archive.ptLat;
  const lonE2 = archive.ptLon;
  const wx = new Float32Array(n);
  const wy = new Float32Array(n);
  const minX = new Float32Array(archive.nStorms);
  const maxX = new Float32Array(archive.nStorms);

  for (let s = 0; s < archive.nStorms; s++) {
    const start = archive.tpOffset[s];
    const end = start + archive.tpCount[s];
    let lo = Infinity;
    let hi = -Infinity;
    let prev = 0;
    for (let k = start; k < end; k++) {
      let lat = latE2[k] / 100;
      if (lat > MAX_LAT) lat = MAX_LAT;
      else if (lat < -MAX_LAT) lat = -MAX_LAT;
      wy[k] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / (2 * Math.PI);

      let x = (lonE2[k] / 100 + 180) / 360;
      if (k > start) {
        // Take the short way round; anything else is a line across the planet.
        while (x - prev > 0.5) x -= 1;
        while (x - prev < -0.5) x += 1;
      }
      wx[k] = x;
      prev = x;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    minX[s] = lo === Infinity ? 0 : lo;
    maxX[s] = hi === -Infinity ? 0 : hi;
  }
  return { wx, wy, minX, maxX };
}

/** The world offsets a storm needs to be drawn at to appear wherever it is visible.
 *  Almost always just [0]; two passes only for tracks that straddle the seam. */
export function worldOffsets(minX, maxX, scale, ox, width) {
  const out = [];
  for (let o = -1; o <= 1; o++) {
    const x0 = (minX + o) * scale - ox;
    const x1 = (maxX + o) * scale - ox;
    if (x1 >= -16 && x0 <= width + 16) out.push(o);
  }
  return out;
}

/** The same projection for a single point, for marks that are not in the packed arrays. */
export function projectPoint(lat, lon) {
  let la = lat;
  if (la > MAX_LAT) la = MAX_LAT;
  else if (la < -MAX_LAT) la = -MAX_LAT;
  return {
    wx: (lon + 180) / 360,
    wy: 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI),
  };
}

/** Base class: owns the canvas, its placement, and when a redraw is owed. */
export const AtlasLayer = L.Layer.extend({
  options: {
    // Fraction of the viewport painted beyond each edge, so a drag has somewhere to go before
    // it reveals unpainted canvas. Leaflet's own renderer uses 0.1; the Atlas draws a whole
    // basin at once and can afford more.
    padding: 0.25,
    pane: "overlayPane",
    zIndexOffset: 0,
  },

  initialize(options) {
    L.setOptions(this, options);
    this._dirty = true;
  },

  onAdd(map) {
    this._map = map;
    const canvas = (this._canvas = document.createElement("canvas"));
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = String(this.options.zIndexOffset);
    this.getPane(this.options.pane).appendChild(canvas);
    this._ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    this._reset();
    map.on("moveend zoomend resize", this._reset, this);
    if (map.options.zoomAnimation && L.Browser.any3d) map.on("zoomanim", this._animateZoom, this);
    return this;
  },

  onRemove(map) {
    map.off("moveend zoomend resize", this._reset, this);
    map.off("zoomanim", this._animateZoom, this);
    if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
    this._ctx = null;
    this._map = null;
    return this;
  },

  /** Mark the layer as owing a repaint; coalesced to one animation frame. */
  redraw() {
    if (!this._map) return this;
    this._dirty = true;
    if (this._frame) return this;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      if (this._dirty) this._paint();
    });
    return this;
  },

  /** Repaint immediately, outside the frame queue -- for a replay tick that must not lag. */
  redrawNow() {
    if (!this._map) return this;
    this._paint();
    return this;
  },

  _reset() {
    if (!this._map) return;
    const map = this._map;
    const size = map.getSize();
    const pad = size.multiplyBy(this.options.padding).round();
    const min = map.containerPointToLayerPoint(pad.multiplyBy(-1)).round();
    const dims = size.add(pad.multiplyBy(2));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = this._canvas;
    c.width = Math.round(dims.x * dpr);
    c.height = Math.round(dims.y * dpr);
    c.style.width = dims.x + "px";
    c.style.height = dims.y + "px";
    L.DomUtil.setPosition(c, min);

    this._origin = min;
    this._size = dims;
    this._dpr = dpr;
    // World-square scale: Leaflet's projected pixel size of the whole planet at this zoom.
    this._scale = 256 * Math.pow(2, map.getZoom());

    /* World coordinate -> canvas pixel, in one multiply and one subtract.
     *
     * Leaflet's chain is: world pixel = project(latlng, zoom); layer point = world pixel minus
     * the map's PIXEL ORIGIN; and this canvas is positioned at layer point `min`. So a canvas
     * pixel is  wx * scale - (pixelOrigin + min). Deriving the offset from project([0,0])
     * instead -- which only tells you where the equator and prime meridian are -- silently
     * shifts the whole layer by the pixel origin, and the map draws a couple of dozen degrees
     * away from the basemap underneath it while still looking like a plausible map. */
    const pixelOrigin = map.getPixelOrigin();
    this._ox = pixelOrigin.x + min.x;
    this._oy = pixelOrigin.y + min.y;
    this._paint();
  },

  /* Leaflet's own L.Renderer._animateZoom, verbatim in effect: during the zoom animation the
     already-painted canvas is translated and scaled by CSS, and _reset repaints it once the
     animation settles. Reimplementing this differently is how a layer ends up drifting a few
     pixels away from the basemap mid-zoom. */
  _animateZoom(e) {
    if (!this._map) return;
    const map = this._map;
    const scale = map.getZoomScale(e.zoom, map.getZoom());
    const offset = map._latLngBoundsToNewLayerBounds(map.getBounds(), e.zoom, e.center).min;
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },

  _paint() {
    const ctx = this._ctx;
    if (!ctx) return;
    this._dirty = false;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._size.x, this._size.y);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    this.draw(ctx, {
      scale: this._scale,
      ox: this._ox,
      oy: this._oy,
      width: this._size.x,
      height: this._size.y,
      zoom: this._map.getZoom(),
    });
  },

  /** Subclasses paint here. `view.scale/ox/oy` turn a world coordinate into a canvas pixel:
   *      px = wx * scale - ox      py = wy * scale - oy                                     */
  draw() {},
});
