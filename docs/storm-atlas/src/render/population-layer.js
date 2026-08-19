/* The historical population: every filtered track, its genesis points and its landfalls.
 *
 * This is the layer the brief calls the hero, and the one constraint that shapes it is that
 * 3,959 bright tracks are not a picture of anything. The default is deliberately restrained --
 * one ink, low alpha, so that where storms have actually gone emerges from accumulated overlap
 * rather than from 3,959 competing lines. Turning intensity on splits the same geometry into
 * seven category paths, which is still seven stroke calls rather than 224,153.
 *
 * WHY IT IS FAST. Three properties, all of them structural rather than clever:
 *   1. Positions were projected into a unit world square once at load, so a frame is a
 *      multiply per point (see atlas-layer.js).
 *   2. Segments are batched by colour, not by storm. A whole basin in one ink is ONE path and
 *      ONE stroke; in intensity mode it is seven. Per-storm strokes would be 3,959.
 *   3. Line geometry is decimated by zoom. MARKS ARE NOT: a genesis point, a threshold
 *      crossing and a landfall are drawn from the actual fix at every zoom, and hit-testing
 *      always uses full resolution. Decimation makes a line cheaper to draw; it must never
 *      make the archive look different.
 */

import { AtlasLayer, worldOffsets } from "./atlas-layer.js";
import {
  CATEGORY_COLOR, CATEGORY_ORDER, GENESIS_INK, LANDFALL_INK, POPULATION_INK, UNKNOWN_INK,
  categoryIndexRaw,
} from "./palette.js";

/* Stride by zoom. At basin zoom a 6-hourly track is far denser than the screen can resolve, so
   drawing every other fix is invisible; below zoom 5 nothing is decimated at all. The stride in
   force is reported to the UI so the provenance panel can state it rather than imply full
   resolution. */
export function strideForZoom(zoom) {
  if (zoom >= 5) return 1;
  if (zoom >= 4) return 2;
  return 3;
}

export const PopulationLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    // How much of the ink one track carries. Tuned so ~50 overlapping tracks saturate: the
    // shape of the population reads before any individual line does.
    trackAlpha: 0.16,
    trackWidth: 1.0,
    showGenesis: true,
    showLandfalls: true,
    colorBy: "uniform", // "uniform" | "intensity"
    dimmed: false, // true when a storm is selected and the population is context
    softenEmphasis: false, // true when the density surface is shown and should read through
  },

  /* The rows to draw BRIGHT, with everything else receding to context.
   *
   * This is the brief's central experience: a reader clicks the ocean and the storms that
   * formed there emerge from the population. It is done by alpha, never by removing the rest --
   * the comparison against the whole record IS the analysis, and a pool of 194 shown alone says
   * nothing about whether 194 is many or few. */
  setEmphasis(rows) {
    this._emph = rows && rows.length ? new Set(rows) : null;
    this.redraw();
    return this;
  },

  setArchive(archive, world) {
    this._a = archive;
    this._world = world;
    return this;
  },

  /** The rows to draw, as a plain Array or Uint32Array of storm indexes. */
  setSelection(rows) {
    this._rows = rows;
    this.redraw();
    return this;
  },

  setStyle(patch) {
    Object.assign(this.options, patch);
    this.redraw();
    return this;
  },

  /** What the last frame actually drew, for the provenance panel. Reported, not implied. */
  lastFrame() {
    return this._stats || null;
  },

  draw(ctx, view) {
    const a = this._a;
    const rows = this._rows;
    if (!a || !rows || !rows.length) {
      this._stats = { storms: 0, segments: 0, stride: 1, decimated: false };
      return;
    }
    const { wx, wy } = this._world;
    const { scale, ox, oy, width, height } = view;
    const stride = strideForZoom(view.zoom);
    const emph = this._emph;
    const base = this.options.dimmed ? this.options.trackAlpha * 0.45 : this.options.trackAlpha;

    ctx.lineWidth = this.options.trackWidth;
    let segments = 0;

    /* Two passes when a pool is emphasised: the rest of the record first, pushed well back, then
       the pool over it at full weight. Same geometry, different standing. */
    const passes = emph
      ? [{ rows: rows.filter((i) => !emph.has(i)), alpha: base * 0.3,
           width: this.options.trackWidth },
         { rows: rows.filter((i) => emph.has(i)),
           alpha: Math.min(1, base * (this.options.softenEmphasis ? 1.1 : 3.2)),
           width: this.options.trackWidth + 0.3 }]
      : [{ rows, alpha: base, width: this.options.trackWidth }];

    for (const pass of passes) {
      if (!pass.rows.length) continue;
      ctx.globalAlpha = pass.alpha;
      ctx.lineWidth = pass.width;
      if (this.options.colorBy === "intensity") {
        segments += this._drawByCategory(ctx, pass.rows, wx, wy, scale, ox, oy, width, height,
          stride);
      } else {
        ctx.strokeStyle = POPULATION_INK;
        ctx.beginPath();
        segments += this._tracePaths(ctx, pass.rows, wx, wy, scale, ox, oy, width, height,
          stride, -1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    if (this.options.showLandfalls) this._drawLandfalls(ctx, rows, view);
    if (this.options.showGenesis) this._drawGenesis(ctx, rows, view);

    this._stats = {
      storms: rows.length,
      emphasised: emph ? emph.size : 0,
      segments,
      stride,
      decimated: stride > 1,
      colorBy: this.options.colorBy,
    };
  },

  /* One path per category, seven strokes for the whole archive. A segment takes the category of
     the fix it starts from; a fix with no recorded wind is drawn in UNKNOWN_INK, which is
     outside the ramp on purpose. */
  _drawByCategory(ctx, rows, wx, wy, scale, ox, oy, w, h, stride) {
    let total = 0;
    for (let cat = -1; cat < 7; cat++) {
      ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
      ctx.beginPath();
      total += this._tracePaths(ctx, rows, wx, wy, scale, ox, oy, w, h, stride, cat);
      ctx.stroke();
    }
    return total;
  },

  /* Walks each storm's contiguous slice. `only` of -1 means "every segment"; otherwise only
     segments whose starting fix falls in that category are added to the current path. */
  _tracePaths(ctx, rows, wx, wy, scale, ox, oy, w, h, stride, only) {
    const a = this._a;
    const { minX, maxX } = this._world;
    const vmax = a.ptVmax;
    const pad = 8;
    let segments = 0;
    const all = only === -1;
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r];
      const start = a.tpOffset[i];
      const end = start + a.tpCount[i];
      if (end - start < 2) continue;
      /* Longitudes are unwrapped along each storm, so a dateline crosser sits partly outside
         the [0,1] world. Drawing it at one or both neighbouring world offsets is what makes it
         appear on both sides of the seam instead of streaking between them. For the 99% of
         storms nowhere near the seam this is a single pass. */
      const offsets = worldOffsets(minX[i], maxX[i], scale, ox, w);
      for (let oi = 0; oi < offsets.length; oi++) {
        const shift = offsets[oi] * scale;
        let px = 0;
        let py = 0;
        let have = false;
        for (let k = start; k < end; k += stride) {
          const x = wx[k] * scale - ox + shift;
          const y = wy[k] * scale - oy;
          if (have) {
            // Cheap segment-level cull: both ends outside the same edge cannot cross the canvas.
            const outLeft = px < -pad && x < -pad;
            const outRight = px > w + pad && x > w + pad;
            const outTop = py < -pad && y < -pad;
            const outBottom = py > h + pad && y > h + pad;
            if (!(outLeft || outRight || outTop || outBottom)) {
              if (all || categoryIndexRaw(vmax[k - stride]) === only) {
                ctx.moveTo(px, py);
                ctx.lineTo(x, y);
                segments++;
              }
            }
          }
          px = x;
          py = y;
          have = true;
        }
        // The final fix is always joined, whatever the stride, so a track never stops short of
        // where the storm actually ended.
        const last = end - 1;
        if (have && (last - start) % stride !== 0) {
          const x = wx[last] * scale - ox + shift;
          const y = wy[last] * scale - oy;
          if (all || categoryIndexRaw(vmax[last - 1]) === only) {
            ctx.moveTo(px, py);
            ctx.lineTo(x, y);
            segments++;
          }
        }
      }
    }
    return segments;
  },

  _drawGenesis(ctx, rows, view) {
    const a = this._a;
    const { scale, ox, oy, width, height } = view;
    const g = a.genesis;
    const lat = g.raw("genesis_lat");
    const lon = g.raw("genesis_lon");
    const rad = view.zoom >= 5 ? 2.4 : 1.7;
    const emph = this._emph;
    ctx.fillStyle = GENESIS_INK;
    ctx.globalAlpha = emph ? 0.18 : (this.options.dimmed ? 0.35 : 0.75);
    ctx.beginPath();
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r];
      if (emph && emph.has(i)) continue;
      const la = lat[i];
      if (Number.isNaN(la)) continue; // 54 storms have no genesis point at all
      const p = worldOf(la, lon[i]);
      const x = p.wx * scale - ox;
      const y = p.wy * scale - oy;
      if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
      ctx.moveTo(x + rad, y);
      ctx.arc(x, y, rad, 0, TAU);
    }
    ctx.fill();
    if (emph) {
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      for (let r = 0; r < rows.length; r++) {
        const i = rows[r];
        if (!emph.has(i)) continue;
        const la = lat[i];
        if (Number.isNaN(la)) continue;
        const p = worldOf(la, lon[i]);
        const x = p.wx * scale - ox;
        const y = p.wy * scale - oy;
        if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
        ctx.moveTo(x + rad + 0.6, y);
        ctx.arc(x, y, rad + 0.6, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  _drawLandfalls(ctx, rows, view) {
    const a = this._a;
    const { scale, ox, oy, width, height } = view;
    const L = a.landfalls;
    const lat = L.raw("lat");
    const lon = L.raw("lon");
    const suspect = L.raw("suspect_relocation");
    ctx.globalAlpha = this.options.dimmed ? 0.4 : 0.9;
    ctx.fillStyle = LANDFALL_INK;
    const half = view.zoom >= 5 ? 2.2 : 1.6;
    for (let r = 0; r < rows.length; r++) {
      const i = rows[r];
      const s = a.lfOffset[i];
      const n = a.lfCount[i];
      for (let k = s; k < s + n; k++) {
        // A crossing the archive flags as a probable relocation artefact is excluded from every
        // rate it publishes; drawing it as an ordinary landfall would put it back.
        if (suspect[k] === 2) continue;
        const p = worldOf(lat[k], lon[k]);
        const x = p.wx * scale - ox;
        const y = p.wy * scale - oy;
        if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
        ctx.fillRect(x - half, y - half, half * 2, half * 2);
      }
    }
    ctx.globalAlpha = 1;
  },
});

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

function worldOf(lat, lon) {
  let la = lat;
  if (la > MAX_LAT) la = MAX_LAT;
  else if (la < -MAX_LAT) la = -MAX_LAT;
  return {
    wx: (lon + 180) / 360,
    wy: 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI),
  };
}
