/* HISTORICAL PATHWAY FREQUENCY -- where storms that formed here have actually gone.
 *
 * THIS IS NOT A FORECAST AND MUST NOT LOOK LIKE ONE. It is a count: for each two-degree cell,
 * how many storms of the matched pool passed through it. The visual grammar is deliberately
 * cellular rather than smooth, because a smoothed envelope around a set of historical tracks
 * is visually indistinguishable from a forecast cone, and a reader who has seen a cone will
 * read one here. Squares do not lie that way.
 *
 * EACH STORM IS COUNTED ONCE PER CELL. Counting fixes instead would let a slow-moving storm
 * outvote a fast one and turn a pathway map into a speed map -- the archive's own
 * `track_density` makes the same choice, and this layer renders exactly what it returns.
 *
 * ONE HUE, VARYING ALPHA. A rainbow ramp implies thresholds the count does not have.
 */

import { AtlasLayer } from "./atlas-layer.js";

const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

export const PathwayLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    zIndexOffset: 1,
    stepDeg: 2.0,
    hue: "79, 195, 247", // the Atlas accent, as rgb components
    /* alpha = floor + span * (n / peak) ^ gamma. The floor keeps a cell that one storm passed
       through visible as one storm rather than as nothing; the gamma opens out the long tail,
       where the interesting structure of a pathway map actually is. */
    alphaFloor: 0.11,
    alphaSpan: 0.46,
    alphaGamma: 0.55,
    /* With a storm selected the surface is context under a subject: every cell's alpha is
       multiplied by this, and nothing about the counts or the ramp changes. */
    dimScale: 0.42,
  },

  /** density: Map of "lat,lon" (cell south-west corner) -> distinct storms through that cell */
  setDensity(density, stepDeg) {
    this._density = density;
    if (stepDeg) this.options.stepDeg = stepDeg;
    this._peak = 0;
    if (density) for (const v of density.values()) if (v > this._peak) this._peak = v;
    this.redraw();
    return this;
  },

  peak() {
    return this._peak || 0;
  },

  setDimmed(on) {
    const v = !!on;
    if (this._dim === v) return this;
    this._dim = v;
    this.redraw();
    return this;
  },

  /** The cell under the pointer or the keyboard reticle, as a "lat,lon" key, or null. Drawn as
      an outline so the literal count in the foot band is visibly THIS cell's. */
  setHover(key) {
    if (this._hover === key) return this;
    this._hover = key || null;
    this.redraw();
    return this;
  },

  draw(ctx, view) {
    const d = this._density;
    const { scale, ox, oy, width, height } = view;
    const step = this.options.stepDeg;
    const peak = this._peak || 1;
    if (this._hover && d) this._outline(ctx, view, this._hover, step);
    if (!d || !d.size) return;

    for (const [key, n] of d) {
      const c = key.indexOf(",");
      const lat0 = Number(key.slice(0, c));
      const lon0 = Number(key.slice(c + 1));
      const a = world(lat0 + step, lon0); // north-west corner
      const b = world(lat0, lon0 + step); // south-east corner
      const x0 = a.wx * scale - ox;
      const y0 = a.wy * scale - oy;
      const x1 = b.wx * scale - ox;
      const y1 = b.wy * scale - oy;
      if (x1 < 0 || y1 < 0 || x0 > width || y0 > height) continue;
      const o = this.options;
      const alpha = (o.alphaFloor + o.alphaSpan * Math.pow(n / peak, o.alphaGamma))
        * (this._dim ? o.dimScale : 1);
      ctx.fillStyle = `rgba(${this.options.hue}, ${alpha.toFixed(4)})`;
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  },
});

PathwayLayer.prototype._outline = function outline(ctx, view, key, step) {
  const { scale, ox, oy } = view;
  const c = key.indexOf(",");
  const lat0 = Number(key.slice(0, c));
  const lon0 = Number(key.slice(c + 1));
  const a = world(lat0 + step, lon0);
  const b = world(lat0, lon0 + step);
  ctx.save();
  ctx.strokeStyle = `rgba(${this.options.hue}, 0.95)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(a.wx * scale - ox) + 0.5, Math.round(a.wy * scale - oy) + 0.5,
    Math.round((b.wx - a.wx) * scale) - 1, Math.round((b.wy - a.wy) * scale) - 1);
  ctx.restore();
};

function world(lat, lon) {
  let la = lat;
  if (la > MAX_LAT) la = MAX_LAT;
  else if (la < -MAX_LAT) la = -MAX_LAT;
  return {
    wx: (lon + 180) / 360,
    wy: 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI),
  };
}
