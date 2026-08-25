/* THE OPERATIONAL TRACK OF A CURRENT STORM.
 *
 * WHY A SECOND LAYER RATHER THAN A FLAG ON THE FIRST. SelectionLayer draws out of the pack's
 * typed arrays -- `trackRange(row)`, `ptT`, `ptVmax`, `ptQuality`, and the world projection built
 * once over all 224,153 points. That is what makes it fast and it is exactly what an operational
 * record does not have: 63 fixes that arrived as JSON five minutes ago are in no pack and have no
 * row. Teaching the selection layer to sometimes read one and sometimes the other would put a
 * branch inside the inner loop of the layer whose whole design is that it has none.
 *
 * PRECEDENCE IS DRAWN, NOT OVERLAID. When this layer holds a track the shell stops feeding the
 * selection layer that storm, so exactly ONE track is on screen and it is the operational one.
 * Drawing both would be the map's version of concatenating two best tracks: six days of overlap
 * rendered as two lines a pixel apart, which reads as two storms.
 *
 * WHAT IS DRAWN, AND WHERE EACH PART COMES FROM:
 *   - the pre-genesis span, dimmed and dashed, exactly as the archive's own layer draws it. The
 *     b-deck begins at a disturbance too, and truncating it would throw away observed positions;
 *     drawing it like the rest would imply a storm existed before one did.
 *   - the track proper, coloured by the category of the wind at the fix each segment leaves, by
 *     the archive's own ladder. ATCF publishes a STAGE, not a Saffir-Simpson class, so the colour
 *     is DERIVED and the panel says so beside every number that depends on it.
 *   - three marks: the ARCHIVE's genesis point (the one every cohort on this surface matches on,
 *     and the reason it is drawn even though this track is not the archive's), the operational
 *     peak, and the LATEST fix -- which is a different mark from the archive layer's END, because
 *     an active storm has not ended.
 *
 * NOTHING IS INTERPOLATED. A b-deck has no interpolated rows -- every one is the forecast
 * office's own analysis -- so there is no dashed-versus-solid quality pass here. That is a
 * property of the source, not a relaxation of the rule, and the panel reports the counts.
 */

import { AtlasLayer, worldOffsets } from "./atlas-layer.js";
import { drawMark } from "./selection-layer.js";
import {
  CATEGORY_COLOR, CATEGORY_ORDER, GENESIS_INK, SELECTION_INK, UNKNOWN_INK,
} from "./palette.js";
import { PRE_GENESIS_ALPHA, PRE_GENESIS_DASH } from "./provenance-ink.js";

const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

/**
 * Project an operational track into the unit world square, longitudes unwrapped ALONG the track.
 *
 * The same rule as projectWorld's, for the same reason: CP012026 runs from 137W to 176E and a
 * per-point projection would draw the last third of it as a horizontal streak across the entire
 * plate. Sixty-three points of trigonometry is nothing; correctness here is everything.
 */
export function projectTrack(fixes) {
  const n = fixes.length;
  const wx = new Float64Array(n);
  const wy = new Float64Array(n);
  let minX = Infinity;
  let maxX = -Infinity;
  let prev = 0;
  for (let k = 0; k < n; k++) {
    let lat = fixes[k].lat;
    if (lat > MAX_LAT) lat = MAX_LAT;
    else if (lat < -MAX_LAT) lat = -MAX_LAT;
    wy[k] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / (2 * Math.PI);
    let x = (fixes[k].lon + 180) / 360;
    if (k > 0) {
      while (x - prev > 0.5) x -= 1;
      while (x - prev < -0.5) x += 1;
    }
    wx[k] = x;
    prev = x;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return { wx, wy, minX: minX === Infinity ? 0 : minX, maxX: maxX === -Infinity ? 0 : maxX, n };
}

/* The archive's own ladder, applied to an operational wind. Returns an index into
   CATEGORY_ORDER, or -1 for a fix with no wind -- which is UNKNOWN_INK and not a category. */
function categoryIndexKt(kt, ladder) {
  if (kt === null || kt === undefined || Number.isNaN(kt)) return -1;
  for (let i = ladder.length - 1; i >= 0; i--) if (kt >= ladder[i]) return i;
  return -1;
}

export const OperationalLayer = AtlasLayer.extend({
  options: {
    padding: 0.25,
    pane: "overlayPane",
    /* Above the selection layer's 2, because when both are mounted only one holds a track and
       the operational one is the subject whenever it does. */
    zIndexOffset: 3,
    width: 2.0,
    traversedWidth: 2.8,
  },

  /**
   * @param {object|null} track  {fixes, genesisMs, archiveGenesis:{lat,lon,t}, peakAt, ladderKt}
   *   or null to draw nothing. `ladderKt` is CATEGORY_ORDER's thresholds in knots, ascending,
   *   taken from the pack's manifest so this cannot drift from the archive's own classes.
   */
  setTrack(track) {
    this._track = track || null;
    this._proj = track && track.fixes && track.fixes.length ? projectTrack(track.fixes) : null;
    this._times = track && track.fixes
      ? track.fixes.map((f) => Date.parse(f.t)) : null;
    this._replayMs = null;
    this.redraw();
    return this;
  },

  setReplayTime(ms) {
    this._replayMs = ms;
    this.redrawNow();
    return this;
  },

  /** The index of the fix in force at the cursor, and how far along the next segment it sits. */
  _replayState() {
    if (!this._proj || this._replayMs === null) return null;
    const t = this._times;
    let i = 0;
    while (i + 1 < t.length && t[i + 1] <= this._replayMs) i++;
    const next = i + 1 < t.length ? i + 1 : null;
    const span = next !== null ? t[next] - t[i] : 0;
    const frac = span > 0 ? Math.max(0, Math.min(1, (this._replayMs - t[i]) / span)) : 0;
    return { index: i, next, frac };
  },

  draw(ctx, view) {
    const p = this._proj;
    const tr = this._track;
    if (!p || !tr || p.n < 1) return;
    const { scale, ox, oy } = view;
    const fixes = tr.fixes;
    const ladder = tr.ladderKt;

    /* One offset, as the selection layer does and for the same reason: a dateline crosser
       visible on both sides would otherwise get two heads, which reads as two storms. */
    const offs = worldOffsets(p.minX, p.maxX, scale, ox, view.width);
    const shift = (offs.length ? offs[0] : 0) * scale;
    const X = (k) => p.wx[k] * scale - ox + shift;
    const Y = (k) => p.wy[k] * scale - oy;

    const rs = this._replayState();
    const limit = rs ? rs.index : p.n - 1;
    const genesisMs = tr.genesisMs === null || tr.genesisMs === undefined ? null : tr.genesisMs;
    const t = this._times;

    ctx.lineWidth = rs ? this.options.traversedWidth : this.options.width;

    // 1. pre-genesis, dimmed and dashed — the archive layer's own treatment of the same fact
    if (genesisMs !== null) {
      ctx.save();
      ctx.setLineDash(PRE_GENESIS_DASH);
      ctx.globalAlpha = PRE_GENESIS_ALPHA;
      ctx.strokeStyle = UNKNOWN_INK;
      ctx.beginPath();
      let moved = false;
      for (let k = 0; k < Math.min(limit, p.n - 1); k++) {
        if (t[k + 1] > genesisMs) break;
        if (!moved) { ctx.moveTo(X(k), Y(k)); moved = true; }
        ctx.lineTo(X(k + 1), Y(k + 1));
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. the storm proper, one pass per category so colours never fight
    for (let cat = -1; cat < CATEGORY_ORDER.length; cat++) {
      ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
      ctx.beginPath();
      let drew = false;
      for (let k = 0; k < Math.min(limit, p.n - 1); k++) {
        if (genesisMs !== null && t[k + 1] <= genesisMs) continue;
        if (categoryIndexKt(fixes[k].kt, ladder) !== cat) continue;
        ctx.moveTo(X(k), Y(k));
        ctx.lineTo(X(k + 1), Y(k + 1));
        drew = true;
      }
      if (drew) ctx.stroke();
    }

    // 3. the marks
    for (const m of this._marks(view)) {
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
      const cat = categoryIndexKt(fixes[rs.index].kt, ladder);
      ctx.save();
      ctx.strokeStyle = cat < 0 ? UNKNOWN_INK : CATEGORY_COLOR[CATEGORY_ORDER[cat]];
      ctx.fillStyle = "#0d131d";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      ctx.restore();
    }
  },

  _marks(view) {
    const p = this._proj;
    const tr = this._track;
    const { scale, ox, oy } = view;
    const out = [];
    const offs = worldOffsets(p.minX, p.maxX, scale, ox, view.width);
    const shift = (offs.length ? offs[0] : 0) * scale;
    const atFix = (k) => [p.wx[k] * scale - ox + shift, p.wy[k] * scale - oy];
    const at = (lat, lon) => {
      let la = lat;
      if (la > MAX_LAT) la = MAX_LAT;
      else if (la < -MAX_LAT) la = -MAX_LAT;
      let x = (lon + 180) / 360;
      /* Bring a separately-published coordinate onto THIS track's unwrapped world, or a genesis
         point west of the dateline lands a world away from the track it belongs to. */
      while (x - p.wx[0] > 0.5) x -= 1;
      while (x - p.wx[0] < -0.5) x += 1;
      const wy = 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI);
      return [x * scale - ox + shift, wy * scale - oy];
    };

    /* THE ARCHIVE'S GENESIS POINT, ON AN OPERATIONAL TRACK, AND IT BELONGS THERE. It is the only
       position any cohort is ever built from, the bridge in the panel is about it, and a reader
       looking at a 115-kt operational track needs to see where the population underneath is
       anchored. It is the ARCHIVE's column, drawn in the archive's own genesis ink. */
    if (tr.archiveGenesis && tr.archiveGenesis.lat !== null) {
      const [x, y] = at(tr.archiveGenesis.lat, tr.archiveGenesis.lon);
      out.push({ x, y, t: tr.archiveGenesis.t, kind: "genesis", color: GENESIS_INK,
        label: "GENESIS" });
    }

    // The operational peak: the fix carrying the highest wind so far.
    let peakK = -1;
    let peakV = null;
    for (let k = 0; k < p.n; k++) {
      const v = tr.fixes[k].kt;
      if (v !== null && v !== undefined && (peakV === null || v > peakV)) { peakV = v; peakK = k; }
    }
    if (peakK >= 0) {
      const [x, y] = atFix(peakK);
      out.push({ x, y, t: this._times[peakK], kind: "peak", color: SELECTION_INK,
        label: `PEAK ${peakV} kt` });
    }

    /* THE LATEST FIX IS NOT AN END. The archive layer draws a cross for END, because an archive
       track has one. This record is open, so the mark is the default square -- "here now" rather
       than "stopped here". Two different facts must not share a glyph. */
    const last = p.n - 1;
    const [ex, ey] = atFix(last);
    out.push({ x: ex, y: ey, t: this._times[last], kind: "latest", color: SELECTION_INK,
      label: "LATEST" });

    return out;
  },
});
