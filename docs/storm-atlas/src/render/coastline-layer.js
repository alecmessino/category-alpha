/* The plate's cartographic ink: the archive's own coastline, and the graticule under it.
 *
 * TWO TIERS, AND THE DIFFERENCE IS A STATEMENT. The CONTEXT tier is Natural Earth 1:110m land
 * -- South America, Africa, Canada, the detail this archive's landfall rule never looks at --
 * packed with the archive (scripts/build-atlas-context.mjs) and drawn here at contextual ink,
 * in place of the third-party tile service the plate used to fetch. The five modelled regions
 * are drawn over it, from the archive's own rings, at full contrast. That contrast difference
 * is not decoration: it says where a landfall can be detected at all.
 *
 * COAST AND BORDER ARE DIFFERENT LINES. The source is admin-1, so Texas and Louisiana share an
 * edge and California meets the Pacific along one. An edge in two rings is interior to the land
 * union; an edge in one is on its boundary, and the boundary is what the crossing rule tests.
 * The split is computed once at build time (scripts/build-atlas-coastlines.mjs) and arrives in
 * the pack, so drawing a state line at half a pixel and a coast at a quarter more costs the
 * frame nothing.
 *
 * NOTHING HERE IS SIMPLIFIED AT DRAW TIME EITHER. The tracks are decimated by zoom because a
 * six-hourly fix is denser than the screen; the coast is not, because a decimated coast would
 * be a different coast from the one the archive tested, at exactly the zoom where a reader
 * looks closely to check a landfall.
 */

import { AtlasLayer } from "./atlas-layer.js";

/* The design's cartographic ink, at the weights it states. Screen pixels: this canvas draws in
   screen space and is repainted on every zoom, so there is no scale division to undo. */
export const PLATE_INK = {
  graticule: "#c9cfd7",
  graticuleWidth: 0.7,
  halo: "#eef0f3",
  haloWidth: 3.4,
  land: "#d8dde4",
  border: "#a3acb8",
  borderWidth: 0.5,
  coast: "#596674",
  coastWidth: 1.25,
  /* The context tier sits one tone above the plate and its coast is a hairline: legible as a
     silhouette, never mistakable for the modelled rings drawn over it. */
  contextLand: "#e2e6eb",
  contextCoast: "#929da9",
  contextCoastWidth: 0.7,
};

export const CoastlineLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    // Under every layer that carries data. The ink is the plate, not a finding on it.
    zIndexOffset: -1,
    graticuleStepDeg: 10,
  },

  /** The decoded coastline pack, or null while it is still arriving. */
  setCoastlines(pack) {
    this._c = pack;
    this.redraw();
    return this;
  },

  /** The decoded context pack (Natural Earth 110m land), or null while it is still arriving.
      NAMED `_land`, NOT `_ctx`: the base layer keeps the canvas 2D context on `this._ctx`, and a
      pack stored there replaces it -- every subsequent _paint throws on ctx.setTransform and the
      whole plate stops re-measuring. */
  setContext(pack) {
    this._land = pack;
    this.redraw();
    return this;
  },

  loaded() {
    return !!this._c;
  },

  draw(ctx, view) {
    this._graticule(ctx, view);
    const { scale, ox, width } = view;

    /* Which world copies are on screen. Every ring here sits well inside one world, so this is
       a cull and a wrap rather than the tracks' antimeridian unwrapping. */
    const offsets = [];
    for (let o = -1; o <= 1; o++) {
      if ((0 + o) * scale - ox <= width + 32 && (1 + o) * scale - ox >= -32) offsets.push(o);
    }

    /* THE CONTEXT TIER, UNDER EVERYTHING BUT THE GRATICULE. A silhouette fill and a hairline
       coast, at inks one tone above the plate: enough to place the Gulf against Central America
       and a recurving track against Newfoundland, too little to compete with the modelled rings
       that follow. Where the two tiers overlap the modelled fill is opaque and wins. */
    const x = this._land;
    if (x) {
      for (const o of offsets) {
        const shift = o * scale;
        const visible = this._visibleRings(view, shift, x);
        if (!visible.length) continue;
        this._fill(ctx, view, shift, visible, x, PLATE_INK.contextLand);
        this._strokeRings(ctx, view, shift, visible, x, PLATE_INK.contextCoast,
          PLATE_INK.contextCoastWidth);
      }
    }

    const c = this._c;
    if (!c) return;
    for (const o of offsets) {
      const shift = o * scale;
      const visible = this._visibleRings(view, shift);
      if (!visible.length) continue;
      // 1. the halo: every coastal edge, wide and barely lighter than the plate
      this._strokeEdges(ctx, view, shift, visible, 1, PLATE_INK.halo, PLATE_INK.haloWidth);
      // 2. the land itself, opaque, so the contextual tier does not read through the modelled one
      this._fill(ctx, view, shift, visible);
      // 3. interior admin borders, backed off
      this._strokeEdges(ctx, view, shift, visible, 0, PLATE_INK.border, PLATE_INK.borderWidth);
      // 4. the coastline the landfall rule tests against, at full contrast
      this._strokeEdges(ctx, view, shift, visible, 1, PLATE_INK.coast, PLATE_INK.coastWidth);
    }
  },

  /** Ring indexes whose world-space box intersects the canvas at this world offset. */
  _visibleRings(view, shift, pack = this._c) {
    const c = pack;
    const { scale, ox, oy, width, height } = view;
    const out = [];
    const pad = 8;
    for (let r = 0; r < c.nRings; r++) {
      const x0 = c.minX[r] * scale - ox + shift;
      const x1 = c.maxX[r] * scale - ox + shift;
      if (x1 < -pad || x0 > width + pad) continue;
      const y0 = c.minY[r] * scale - oy;
      const y1 = c.maxY[r] * scale - oy;
      if (y1 < -pad || y0 > height + pad) continue;
      out.push(r);
    }
    return out;
  },

  _fill(ctx, view, shift, rings, pack = this._c, ink = PLATE_INK.land) {
    const c = pack;
    const { scale, ox, oy } = view;
    ctx.save();
    ctx.fillStyle = ink;
    ctx.beginPath();
    for (const r of rings) {
      const s = c.ringOffset[r];
      const e = c.ringOffset[r + 1];
      if (e - s < 3) continue;
      ctx.moveTo(c.wx[s] * scale - ox + shift, c.wy[s] * scale - oy);
      for (let k = s + 1; k < e; k++) {
        ctx.lineTo(c.wx[k] * scale - ox + shift, c.wy[k] * scale - oy);
      }
      ctx.closePath();
    }
    /* Even-odd, because a lake or a lagoon arrives as a ring inside another ring and is water.
       Filling it as land would put coastline on the wrong side of the crossing rule. */
    ctx.fill("evenodd");
    ctx.restore();
  },

  /* Every ring of a pack as one stroked path -- the context tier's coast, which carries no
     coastal/border split because it has no interior borders to split from. */
  _strokeRings(ctx, view, shift, rings, pack, ink, lineWidth) {
    const c = pack;
    const { scale, ox, oy } = view;
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (const r of rings) {
      const s = c.ringOffset[r];
      const e = c.ringOffset[r + 1];
      if (e - s < 2) continue;
      ctx.moveTo(c.wx[s] * scale - ox + shift, c.wy[s] * scale - oy);
      for (let k = s + 1; k < e; k++) ctx.lineTo(c.wx[k] * scale - ox + shift, c.wy[k] * scale - oy);
    }
    ctx.stroke();
    ctx.restore();
  },

  /* One path for the whole class, one stroke. `want` selects the coastal flag: 1 draws the
     land-union boundary, 0 draws the borders interior to it. */
  _strokeEdges(ctx, view, shift, rings, want, ink, lineWidth) {
    const c = this._c;
    const { scale, ox, oy } = view;
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (const r of rings) {
      const s = c.ringOffset[r];
      const e = c.ringOffset[r + 1];
      let open = false;
      for (let k = s; k + 1 < e; k++) {
        if (c.coastal[k] !== want) { open = false; continue; }
        const x = c.wx[k] * scale - ox + shift;
        const y = c.wy[k] * scale - oy;
        if (!open) { ctx.moveTo(x, y); open = true; }
        ctx.lineTo(c.wx[k + 1] * scale - ox + shift, c.wy[k + 1] * scale - oy);
      }
    }
    ctx.stroke();
    ctx.restore();
  },

  /* The graticule, drawn under everything. It is the only line on this plate that is not a
     measurement, so it is the faintest thing on it. */
  _graticule(ctx, view) {
    const { scale, ox, oy, width, height } = view;
    const step = this.options.graticuleStepDeg;
    /* Derived from the CANVAS extent, not from the map's bounds. The canvas is painted a
       quarter of a viewport beyond each edge so a drag has somewhere to go before it exposes
       unpainted pixels; a graticule ruled only to the viewport would leave that margin blank
       and the lines would appear to stop mid-drag. */
    const lon0 = Math.floor((ox / scale) * 360 - 180);
    const lon1 = Math.ceil(((ox + width) / scale) * 360 - 180);
    ctx.save();
    ctx.strokeStyle = PLATE_INK.graticule;
    ctx.lineWidth = PLATE_INK.graticuleWidth;
    ctx.beginPath();
    for (let lon = Math.floor(lon0 / step) * step; lon <= lon1 + step; lon += step) {
      const x = ((lon + 180) / 360) * scale - ox;
      if (x < -1 || x > width + 1) continue;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    const top = invMercY(oy / scale);
    const bottom = invMercY((oy + height) / scale);
    const south = Math.max(-80, Math.floor(bottom / step) * step);
    const north = Math.min(80, Math.ceil(top / step) * step);
    for (let lat = south; lat <= north; lat += step) {
      const y = mercY(lat) * scale - oy;
      if (y < -1 || y > height + 1) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  },
});

const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

export function mercY(lat) {
  let la = lat;
  if (la > MAX_LAT) la = MAX_LAT;
  else if (la < -MAX_LAT) la = -MAX_LAT;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI);
}

/** The inverse, for turning a canvas edge back into the latitude the graticule needs. */
export function invMercY(wy) {
  return (2 * Math.atan(Math.exp((0.5 - wy) * 2 * Math.PI)) - Math.PI / 2) / DEG;
}
