/* The selected storm: its whole life, drawn over a population that has receded but not left.
 *
 * The lifecycle the brief asks to be legible --
 *     PRE-GENESIS -> GENESIS -> INTENSIFICATION -> PEAK -> LANDFALL / DISSIPATION
 * -- is drawn here as geometry rather than described in a table, and two of its stages exist
 * only because the archive is honest about things a best-track file usually hides:
 *
 * PRE-GENESIS IS REAL TRACK. The archive's genesis is the first TROPICAL fix, and 9,450 fixes
 * in this archive sit before it, as disturbances and lows, across 744 storms and reaching 252
 * hours back. Truncating the track at genesis would throw away observed positions; drawing them
 * like the rest would imply a storm existed before one did. They are drawn dimmed and named --
 * and, since this build, on the population layer as well as on the selected storm.
 *
 * Those three counts are ASSERTED, by scripts/test-atlas-provenance.mjs, against the pack the
 * browser loads. The previous version of this sentence said 1,580, and no definition of
 * pre-genesis reproduced it -- the rule was right and the sentence had gone stale. The archive
 * is rebuilt about four times a day, so a count written into a comment drifts by construction
 * unless something recomputes it.
 *
 * INTERPOLATION IS NOT OBSERVATION. Roughly half of all fixes were interpolated by IBTrACS
 * rather than observed, and the archive refuses to let an interpolated point establish a
 * threshold crossing. So an interpolated segment is dashed, and a crossing mark is only ever
 * drawn where the archive placed one -- on an observed fix.
 */

import { AtlasLayer, worldOffsets } from "./atlas-layer.js";
import { fixAt } from "../engine/timeline.js";
import {
  CATEGORY_COLOR, CATEGORY_ORDER, GENESIS_INK, LANDFALL_INK, SELECTION_INK, UNKNOWN_INK,
  categoryIndexRaw,
} from "./palette.js";
import {
  DETECTION_BRACKETING_FIX, DETECTION_SEGMENT_CROSSING, PRE_GENESIS_ALPHA, PRE_GENESIS_DASH,
  SUSPECT_RELOCATION, landfallForm,
} from "./provenance-ink.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

export const SelectionLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    zIndexOffset: 2,
    /* The design's two weights for a selected storm: the whole track at 2.0, and the portion
       the replay cursor has already traversed at 2.8. Because this layer reveals progressively
       -- nothing beyond the cursor is drawn at all -- the heavier weight is simply what is on
       screen during a replay, and the lighter one is the finished track at rest. */
    width: 2.0,
    traversedWidth: 2.8,
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
    /* Shared with the archive-wide replay so the two can never disagree about which fix is in
       force at an instant -- one storm and 3,885 storms are the same question here. */
    const at = fixAt(a.ptT, start, end, this._replayMs / 60000);
    return { index: at.index, next: at.next, frac: at.frac, start, end };
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
    ctx.lineWidth = rs ? this.options.traversedWidth : this.options.width;

    // 1. pre-genesis, dimmed and dashed
    if (hasGenesis) {
      ctx.save();
      ctx.setLineDash(PRE_GENESIS_DASH);
      ctx.globalAlpha = PRE_GENESIS_ALPHA;
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
      /* FILLED, and that is the whole distinction. The archive-wide replay draws its heads
         HOLLOW (replay-layer.js) so that when both are on screen the reader can tell the storm
         they chose from the storms the clock happens to be passing through. Fill one of them and
         the two become the same mark. */
      const cat = categoryIndexRaw(vmax[rs.index]);
      ctx.save();
      ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
      ctx.fillStyle = "#0d131d";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, TAU);
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
      /* `form` says HOW the archive established this landfall, not how much to trust it. The
         mark keeps LANDFALL_INK in every form, and is never coloured by category -- which is
         what keeps a withheld Saffir-Simpson class withheld instead of letting the mark imply
         a class the archive declined to publish. Iniki 1992 is one of those rows. */
      out.push({ x, y, t: l.t, kind: "landfall", color: LANDFALL_INK,
        label: (l.sub_region || l.region || "LANDFALL").toUpperCase(),
        form: landfallForm(l),
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
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = m.color;
  // The plate's own background, so a hollow mark reads as a hole rather than as a dark dot.
  ctx.fillStyle = "#0d131d";
  if (m.kind === "landfall") {
    /* FOUR FORMS, ONE COLOUR. The form states how the archive established the landfall; it is
       NOT a confidence scale and must not read as one. A derived crossing is the archive doing
       its job -- for roughly forty years of East Pacific landfalls it is the only answer that
       exists, because NHC did not systematically flag them until about 1988. So: no second hue,
       no alert glyph, no reduced opacity. Solid is read, outlined is derived. */
    const s = 4.2;
    const diamond = (r) => {
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - r);
      ctx.lineTo(m.x + r, m.y);
      ctx.lineTo(m.x, m.y + r);
      ctx.lineTo(m.x - r, m.y);
      ctx.closePath();
    };
    const form = m.form || (m.hollow ? SUSPECT_RELOCATION : "");
    const outlined = form === DETECTION_SEGMENT_CROSSING || form === SUSPECT_RELOCATION;
    diamond(s);
    if (outlined) {
      ctx.fill();   // the plate's own background, so the mark reads as a hole
      ctx.stroke();
    } else {
      // hurdat2_L_record, bracketing_fix, and any kind this build does not recognise.
      ctx.fillStyle = m.color;
      ctx.fill();
    }
    // A surrounding ring: the position is a published fix that fell inside the polygon, rather
    // than a hurdat2_L_record. Both were read; only one was recorded AS a landfall.
    if (form === DETECTION_BRACKETING_FIX) { diamond(s + 2.2); ctx.stroke(); }
    // A cross-bar: the archive flags this crossing as a probable centre relocation and excludes
    // it from every rate it publishes -- more than segment_crossing, and it has to look like it.
    if (form === SUSPECT_RELOCATION) {
      ctx.beginPath();
      ctx.moveTo(m.x - s, m.y);
      ctx.lineTo(m.x + s, m.y);
      ctx.stroke();
    }
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
