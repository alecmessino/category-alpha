/* The selected storm: its whole life, drawn over a population that has receded but not left.
 *
 * The lifecycle the brief asks to be legible --
 *     PRE-GENESIS -> GENESIS -> INTENSIFICATION -> PEAK -> LANDFALL / DISSIPATION
 * -- is drawn here as geometry rather than described in a table, and two of its stages exist
 * only because the archive is honest about things a best-track file usually hides:
 *
 * PRE-GENESIS IS REAL TRACK. The archive's genesis is the first TROPICAL fix, and 1,580 fixes
 * in this archive sit before it, as disturbances and lows, reaching 252 hours back. Truncating
 * the track at genesis would throw away observed positions; drawing them like the rest would
 * imply a storm existed before one did. They are drawn dimmed and named.
 *
 * INTERPOLATION IS NOT OBSERVATION. Roughly half of all fixes were interpolated by IBTrACS
 * rather than observed, and the archive refuses to let an interpolated point establish a
 * threshold crossing. So an interpolated segment is dashed, and a crossing mark is only ever
 * drawn where the archive placed one -- on an observed fix.
 */

import { AtlasLayer, worldOffsets } from "./atlas-layer.js";
import {
  CATEGORY_COLOR, CATEGORY_ORDER, GENESIS_INK, LANDFALL_INK, SELECTION_INK, UNKNOWN_INK,
  categoryIndexRaw,
} from "./palette.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

export const SelectionLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    zIndexOffset: 2,
    width: 2.2,
  },

  setArchive(archive, world) {
    this._a = archive;
    this._world = world;
    return this;
  },

  /** row = storm index, or -1 for nothing selected. */
  setStorm(row) {
    if (this._row === row) return this;
    this._row = row;
    this._detail = row >= 0 && this._a ? this._a.storm(row) : null;
    this._replayMs = null;
    this.redraw();
    return this;
  },

  /**
   * Reveal the track only as far as this instant.
   *
   * The replay travels between ACTUAL FIXES. The head is interpolated along the segment
   * between the two fixes that bracket the cursor so the motion is continuous, but every mark,
   * every wind and every category shown beside it comes from a real fix -- nothing is invented
   * to make the animation smoother.
   */
  setReplayTime(ms) {
    this._replayMs = ms;
    this.redrawNow();
    return this;
  },

  detail() {
    return this._detail;
  },

  /** The fix in force at the replay cursor, and how far along the next segment it sits. */
  replayState() {
    const a = this._a;
    if (!a || this._row === undefined || this._row < 0 || this._replayMs === null) return null;
    const [start, end] = a.trackRange(this._row);
    const t = a.ptT;
    const cursorMin = this._replayMs / 60000;
    let k = start;
    while (k + 1 < end && t[k + 1] <= cursorMin) k++;
    const frac = k + 1 < end && t[k + 1] > t[k]
      ? Math.min(1, Math.max(0, (cursorMin - t[k]) / (t[k + 1] - t[k])))
      : 0;
    return { index: k, next: k + 1 < end ? k + 1 : null, frac, start, end };
  },

  draw(ctx, view) {
    const a = this._a;
    const row = this._row;
    if (!a || row === undefined || row < 0) return;
    const { wx, wy, minX, maxX } = this._world;
    const { scale, ox, oy } = view;
    const [start, end] = a.trackRange(row);
    if (end - start < 1) return;
    /* One offset, not three: the selected storm is drawn where it is visible, and if a dateline
       crosser is visible on both sides the first offset wins. Drawing the focus twice would put
       two replay heads on screen, which reads as two storms. */
    const offs = worldOffsets(minX[row], maxX[row], scale, ox, view.width);
    const shift = (offs.length ? offs[0] : 0) * scale;

    const genesisMin = a.genesisT[row];
    const hasGenesis = !Number.isNaN(genesisMin) && genesisMin !== -2147483648;
    const t = a.ptT;
    const q = a.ptQuality;
    const vmax = a.ptVmax;

    const rs = this.replayState();
    const limit = rs ? rs.index : end - 1;

    const X = (k) => wx[k] * scale - ox + shift;
    const Y = (k) => wy[k] * scale - oy;

    /* Four passes so that dash pattern and colour never fight: pre-genesis, then observed and
       interpolated segments of the storm proper. */
    ctx.lineWidth = this.options.width;

    // 1. pre-genesis, dimmed and dashed
    if (hasGenesis) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = UNKNOWN_INK;
      ctx.beginPath();
      let moved = false;
      for (let k = start; k < Math.min(limit, end - 1); k++) {
        if (t[k + 1] > genesisMin) break;
        if (!moved) { ctx.moveTo(X(k), Y(k)); moved = true; }
        ctx.lineTo(X(k + 1), Y(k + 1));
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. the storm proper, coloured by the intensity at the fix each segment leaves
    for (const interpolated of [false, true]) {
      ctx.save();
      if (interpolated) {
        ctx.setLineDash([3, 3]);
        ctx.globalAlpha = 0.75;
      }
      for (let cat = -1; cat < 7; cat++) {
        ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
        ctx.beginPath();
        let drew = false;
        for (let k = start; k < Math.min(limit, end - 1); k++) {
          if (hasGenesis && t[k + 1] <= genesisMin) continue;
          const isInterp = q[k] === a.qInterpolated || q[k + 1] === a.qInterpolated;
          if (isInterp !== interpolated) continue;
          if (categoryIndexRaw(vmax[k]) !== cat) continue;
          ctx.moveTo(X(k), Y(k));
          ctx.lineTo(X(k + 1), Y(k + 1));
          drew = true;
        }
        if (drew) ctx.stroke();
      }
      ctx.restore();
    }

    // 3. the lifecycle marks, each from an actual fix
    const marks = this._marks(view);
    for (const m of marks) {
      if (rs && m.t !== null && m.t > this._replayMs) continue;
      drawMark(ctx, m);
    }

    // 4. the replay head, interpolated along the current segment for continuity only
    if (rs) {
      let hx = X(rs.index);
      let hy = Y(rs.index);
      if (rs.next !== null && rs.frac > 0) {
        hx += (X(rs.next) - hx) * rs.frac;
        hy += (Y(rs.next) - hy) * rs.frac;
      }
      const cat = categoryIndexRaw(vmax[rs.index]);
      ctx.save();
      ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
      ctx.fillStyle = "#04060c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 5.5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 1.6, 0, TAU);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.restore();
    }
  },

  /** Genesis, threshold crossings, peak, landfalls and the final fix -- with their instants,
   *  so replay can withhold a mark that has not happened yet. */
  _marks(view) {
    const a = this._a;
    const d = this._detail;
    const row = this._row;
    const { scale, ox, oy } = view;
    const { wx, wy, minX, maxX } = this._world;
    const out = [];
    const shift = (() => {
      const offs = worldOffsets(minX[row], maxX[row], scale, ox, view.width);
      return (offs.length ? offs[0] : 0) * scale;
    })();
    const at = (lat, lon) => {
      const p = world(lat, lon);
      return [p.wx * scale - ox + shift, p.wy * scale - oy];
    };
    // A fix already in the packed arrays projects straight out of them; only coordinates the
    // archive publishes separately (genesis, crossings, landfalls) need the trig above.
    const atFix = (k) => [wx[k] * scale - ox + shift, wy[k] * scale - oy];

    if (d.genesis_lat !== null) {
      const [x, y] = at(d.genesis_lat, d.genesis_lon);
      out.push({ x, y, t: d.genesis_t, kind: "genesis", color: GENESIS_INK, label: "GENESIS" });
    }
    for (const key of ["ts", "cat1"]) {
      const p = d.crossing_positions[key];
      if (!p) continue;
      const [x, y] = at(p.lat, p.lon);
      out.push({ x, y, t: d.crossings[key], kind: "crossing",
        color: CATEGORY_COLOR[key], label: key.toUpperCase() });
    }
    /* cat2..cat5 have a crossing TIME in the archive but no crossing position, so the mark is
       placed on the fix at that instant rather than at a coordinate the archive never
       published. If no fix carries the instant, no mark is drawn. */
    const [start, end] = a.trackRange(row);
    for (const key of ["cat2", "cat3", "cat4", "cat5"]) {
      const ms = d.crossings[key];
      if (ms === null) continue;
      const min = ms / 60000;
      let hit = -1;
      for (let k = start; k < end; k++) if (a.ptT[k] === min) { hit = k; break; }
      if (hit < 0) continue;
      const [cx, cy] = atFix(hit);
      out.push({ x: cx, y: cy, t: ms, kind: "crossing",
        color: CATEGORY_COLOR[key], label: key.toUpperCase() });
    }
    // peak: the fix carrying the storm's maximum recorded wind
    let peakK = -1;
    let peakV = -32768;
    for (let k = start; k < end; k++) {
      const v = a.ptVmax[k];
      if (v !== -32768 && v > peakV) { peakV = v; peakK = k; }
    }
    if (peakK >= 0) {
      const [px, py] = atFix(peakK);
      out.push({ x: px, y: py, t: a.ptT[peakK] * 60000, kind: "peak", color: SELECTION_INK,
        label: `PEAK ${peakV} kt` });
    }
    for (const l of d.landfalls) {
      const [x, y] = at(l.lat, l.lon);
      out.push({ x, y, t: l.t, kind: "landfall", color: LANDFALL_INK,
        label: (l.sub_region || l.region || "LANDFALL").toUpperCase(),
        hollow: l.suspect_relocation === true });
    }
    if (end - start > 0) {
      const last = end - 1;
      const [ex, ey] = atFix(last);
      out.push({ x: ex, y: ey, t: a.ptT[last] * 60000, kind: "end", color: "#8ea3bd",
        label: "END" });
    }
    return out;
  },
});

function drawMark(ctx, m) {
  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = m.color;
  ctx.fillStyle = "#04060c";
  if (m.kind === "landfall") {
    const s = 4.2;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - s);
    ctx.lineTo(m.x + s, m.y);
    ctx.lineTo(m.x, m.y + s);
    ctx.lineTo(m.x - s, m.y);
    ctx.closePath();
    if (!m.hollow) { ctx.fillStyle = m.color; ctx.fill(); } else { ctx.fill(); ctx.stroke(); }
  } else if (m.kind === "peak") {
    ctx.beginPath();
    ctx.arc(m.x, m.y, 4.6, 0, TAU);
    ctx.fill();
    ctx.stroke();
  } else if (m.kind === "genesis") {
    ctx.beginPath();
    ctx.arc(m.x, m.y, 4.2, 0, TAU);
    ctx.fillStyle = m.color;
    ctx.fill();
  } else if (m.kind === "end") {
    ctx.beginPath();
    ctx.moveTo(m.x - 3.4, m.y - 3.4);
    ctx.lineTo(m.x + 3.4, m.y + 3.4);
    ctx.moveTo(m.x + 3.4, m.y - 3.4);
    ctx.lineTo(m.x - 3.4, m.y + 3.4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.rect(m.x - 3, m.y - 3, 6, 6);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function world(lat, lon) {
  let la = lat;
  if (la > MAX_LAT) la = MAX_LAT;
  else if (la < -MAX_LAT) la = -MAX_LAT;
  return {
    wx: (lon + 180) / 360,
    wy: 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI),
  };
}
