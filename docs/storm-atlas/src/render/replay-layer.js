/* The archive unfolding: 3,885 storms revealed in the order they happened.
 *
 * WHY THIS ACCUMULATES. Mean concurrency over the whole record is 0.74 storms -- for most of
 * history the map holds one storm or none. A replay that cleared each frame would therefore show
 * a single line wandering an empty ocean, 3,885 times, and would say nothing at all about the
 * shape of the record. What makes the run worth watching is that the mat of trajectories BUILDS:
 * the main development regions fill in, the recurve appears, the Gulf and the Mexican coast
 * accumulate landfall marks. So this layer keeps what it has drawn, and only ever adds.
 *
 * REVEALING IS A PREFIX, NOT A SAMPLE. The timeline is sorted by first fix, so "every storm
 * revealed so far" is a prefix of it, and growing that prefix is exact at any tick size. That
 * matters more than it sounds: 26 storms in this archive consist of a SINGLE FIX -- they exist
 * at one instant and have no duration -- so a clock that revealed storms by asking "what is
 * active right now" steps straight over them. It loses 11 of them at a six-hourly tick while
 * looking perfectly healthy. `activeAt` is used only to decide what to draw BRIGHT.
 *
 * TWO CANVASES, AND THEY ARE DIFFERENT KINDS OF THING. Accumulated ink is history and must
 * persist; the bright head of a storm in progress is a thing at an instant and must not smear a
 * trail of dots behind it. So ReplayLayer accumulates and ReplayHeadsLayer clears every frame.
 *
 * NOTHING IS INVENTED TO SMOOTH THE MOTION. The head interpolates along the segment between the
 * two fixes bracketing the cursor, so movement is continuous, but every mark and every colour
 * comes from a real fix -- the same discipline the selection layer already keeps.
 */

import { AtlasLayer, worldOffsets } from "./atlas-layer.js";
import { activeAt, fixAt, revealedThrough } from "../engine/timeline.js";
import {
  CATEGORY_COLOR, CATEGORY_ORDER, GENESIS_INK, LANDFALL_INK, POPULATION_INK, UNKNOWN_INK,
  categoryIndexRaw,
} from "./palette.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

/* ---- the accumulating history ---------------------------------------------------------- */

export const ReplayLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    zIndexOffset: 1,
    accumulate: true,
    trackWidth: 1.0,
    trackAlpha: 0.5,
    colorBy: "uniform",
    showMarks: true,
  },

  setArchive(archive, world) {
    this._a = archive;
    this._world = world;
    return this;
  },

  /** A new timeline means a different history; everything drawn so far is wrong. */
  setTimeline(tl) {
    this._tl = tl;
    this._rewind();
    this.invalidate();
    this.redraw();
    return this;
  },

  /** Move the cursor. Forward is incremental; anything else rebuilds. */
  setCursor(cursorMin) {
    const prev = this._cursor;
    this._cursor = cursorMin;
    if (prev === undefined || cursorMin < prev) { this._rewind(); this.invalidate(); }
    this.redrawNow();
    return this;
  },

  cursor() {
    return this._cursor === undefined ? null : this._cursor;
  },

  /** How many storms of the timeline have been revealed. Reported, not estimated. */
  revealed() {
    return this._revealed || 0;
  },

  _rewind() {
    const n = this._tl ? this._tl.n : 0;
    /* `_head[p]` is the last point index of storm p already inked. -1 means "not started".
       This is what makes a tick cost only the new segments rather than the whole prefix. */
    this._head = new Int32Array(n).fill(-1);
    this._open = [];       // revealed but not yet fully drawn; stays tiny (concurrency <= 9)
    this._revealed = 0;    // how much of the sorted-by-start prefix has entered _open
    /* Marks are drawn once and then remembered, because the canvas never clears between ticks.
       A rewind means the canvas HAS been cleared, so the memory has to go with it -- otherwise
       every genesis dot and landfall mark silently disappears on the first pan. */
    this._markDone = new Uint8Array(n);
  },

  draw(ctx, view) {
    const a = this._a;
    const tl = this._tl;
    if (!a || !tl || !tl.n || this._cursor === undefined) return;
    if (view.full) this._rewind();

    const cursor = this._cursor;
    const { wx, wy, minX, maxX } = this._world;
    const { scale, ox, oy } = view;
    const ptT = a.ptT;

    // Grow the prefix. Every newly revealed storm joins the open set, in order.
    const upto = revealedThrough(tl, cursor);
    for (let p = this._revealed; p < upto; p++) this._open.push(p);
    this._revealed = upto;

    ctx.save();
    ctx.globalAlpha = this.options.trackAlpha;
    ctx.lineWidth = this.options.trackWidth;
    const byCategory = this.options.colorBy === "intensity";
    if (!byCategory) ctx.strokeStyle = POPULATION_INK;

    /* Colour batching only pays when a pass draws many storms at once, which is the full-repaint
       case. An incremental tick touches a handful of segments, so it strokes them directly. */
    let alive = 0;
    for (let q = 0; q < this._open.length; q++) {
      const p = this._open[q];
      const row = tl.row[p];
      const [start, end] = a.trackRange(row);
      const target = tl.end[p] <= cursor
        ? end - 1
        : fixAt(ptT, start, end, cursor).index;
      let from = this._head[p];
      if (from < 0) from = start;
      if (target > from || this._head[p] < 0) {
        const offs = worldOffsets(minX[row], maxX[row], scale, ox, view.width);
        for (const o of offs) {
          const shift = o * scale;
          if (byCategory) {
            this._strokeByCategory(ctx, a, wx, wy, scale, ox, oy, shift, from, target);
          } else {
            ctx.beginPath();
            ctx.moveTo(wx[from] * scale - ox + shift, wy[from] * scale - oy);
            for (let k = from + 1; k <= target; k++) {
              ctx.lineTo(wx[k] * scale - ox + shift, wy[k] * scale - oy);
            }
            ctx.stroke();
          }
        }
        this._head[p] = target;
      }
      // Keep it open only while there is still track left to ink.
      if (this._head[p] < end - 1) this._open[alive++] = p;
    }
    this._open.length = alive;
    ctx.restore();

    if (this.options.showMarks) this._marks(ctx, view, upto);
  },

  /* A segment takes the category of the fix it leaves, and a fix with no recorded wind is drawn
     outside the ramp rather than being coloured as though it were weak. */
  _strokeByCategory(ctx, a, wx, wy, scale, ox, oy, shift, from, target) {
    const vmax = a.ptVmax;
    let k = from;
    while (k < target) {
      const cat = categoryIndexRaw(vmax[k]);
      let j = k + 1;
      while (j < target && categoryIndexRaw(vmax[j]) === cat) j++;
      ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
      ctx.beginPath();
      ctx.moveTo(wx[k] * scale - ox + shift, wy[k] * scale - oy);
      for (let m = k + 1; m <= j; m++) ctx.lineTo(wx[m] * scale - ox + shift, wy[m] * scale - oy);
      ctx.stroke();
      k = j;
    }
  },

  /* Genesis and landfall marks appear as their instant passes and then stay, so "where storms
     form" and "where they come ashore" emerge from the run rather than being asserted. Drawn
     once per storm: _markDone remembers, because this canvas never clears between ticks. */
  _marks(ctx, view, upto) {
    const a = this._a;
    const tl = this._tl;
    const cursor = this._cursor;
    const { scale, ox, oy, width, height } = view;
    const L = a.landfalls;
    const lfLat = L.raw("lat");
    const lfLon = L.raw("lon");
    const lfT = L.raw("t");
    const lfSuspect = L.raw("suspect_relocation");
    const cursorMs = cursor * 60000;

    ctx.save();
    for (let p = 0; p < upto; p++) {
      if (this._markDone[p] === 3) continue;
      const row = tl.row[p];

      if (!(this._markDone[p] & 1)) {
        const g = tl.genesis[p];
        if (g !== -2147483648 && g <= cursor) {
          const la = a.genesisLat[row];
          if (!Number.isNaN(la)) {
            const q = worldOf(la, a.genesisLon[row]);
            const x = q.wx * scale - ox;
            const y = q.wy * scale - oy;
            if (x > -6 && y > -6 && x < width + 6 && y < height + 6) {
              ctx.fillStyle = GENESIS_INK;
              ctx.globalAlpha = 0.85;
              ctx.beginPath();
              ctx.arc(x, y, view.zoom >= 5 ? 2.4 : 1.7, 0, TAU);
              ctx.fill();
            }
            this._markDone[p] |= 1;
          } else this._markDone[p] |= 1;
        }
      }

      if (!(this._markDone[p] & 2)) {
        const s = a.lfOffset[row];
        const n = a.lfCount[row];
        let allDrawn = true;
        for (let k = s; k < s + n; k++) {
          // Excluded from every rate the archive publishes; drawing it would put it back.
          if (lfSuspect[k] === 2) continue;
          if (lfT[k] > cursorMs) { allDrawn = false; continue; }
          const q = worldOf(lfLat[k], lfLon[k]);
          const x = q.wx * scale - ox;
          const y = q.wy * scale - oy;
          if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue;
          ctx.fillStyle = LANDFALL_INK;
          ctx.globalAlpha = 0.9;
          const half = view.zoom >= 5 ? 2.2 : 1.6;
          ctx.fillRect(x - half, y - half, half * 2, half * 2);
        }
        if (allDrawn && tl.end[p] <= cursor) this._markDone[p] |= 2;
      }
    }
    ctx.restore();
  },
});

/* ---- the instant: storms in progress right now ------------------------------------------ */

export const ReplayHeadsLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    zIndexOffset: 3,
    accumulate: false,     // a head is a thing at an instant, not a thing that happened
    width: 1.9,
  },

  setArchive(archive, world) {
    this._a = archive;
    this._world = world;
    return this;
  },

  setTimeline(tl) {
    this._tl = tl;
    this.redraw();
    return this;
  },

  setCursor(cursorMin) {
    this._cursor = cursorMin;
    this.redrawNow();
    return this;
  },

  /** The storms on the map at the cursor, as storm rows -- for the transport's readout. */
  activeRows() {
    const tl = this._tl;
    if (!tl || this._cursor === undefined) return [];
    const out = [];
    for (const p of activeAt(tl, this._cursor)) out.push(tl.row[p]);
    return out;
  },

  draw(ctx, view) {
    const a = this._a;
    const tl = this._tl;
    if (!a || !tl || !tl.n || this._cursor === undefined) return;
    const cursor = this._cursor;
    const { wx, wy, minX, maxX } = this._world;
    const { scale, ox, oy } = view;
    const ptT = a.ptT;
    const vmax = a.ptVmax;

    for (const p of activeAt(tl, cursor)) {
      const row = tl.row[p];
      const [start, end] = a.trackRange(row);
      const at = fixAt(ptT, start, end, cursor);
      const offs = worldOffsets(minX[row], maxX[row], scale, ox, view.width);
      if (!offs.length) continue;
      const shift = offs[0] * scale;
      const cat = categoryIndexRaw(vmax[at.index]);
      const ink = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];

      // the storm so far, at full weight -- the part of the mat that is happening now
      ctx.save();
      ctx.lineWidth = this.options.width;
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(wx[start] * scale - ox + shift, wy[start] * scale - oy);
      for (let k = start + 1; k <= at.index; k++) {
        ctx.lineTo(wx[k] * scale - ox + shift, wy[k] * scale - oy);
      }
      let hx = wx[at.index] * scale - ox + shift;
      let hy = wy[at.index] * scale - oy;
      if (at.next !== null && at.frac > 0) {
        hx += (wx[at.next] * scale - ox + shift - hx) * at.frac;
        hy += (wy[at.next] * scale - oy - hy) * at.frac;
      }
      ctx.lineTo(hx, hy);
      ctx.stroke();

      ctx.fillStyle = "#04060c";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(hx, hy, 4.2, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 1.4, 0, TAU);
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.restore();
    }
  },
});

function worldOf(lat, lon) {
  let la = lat;
  if (la > MAX_LAT) la = MAX_LAT;
  else if (la < -MAX_LAT) la = -MAX_LAT;
  return {
    wx: (lon + 180) / 360,
    wy: 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI),
  };
}
