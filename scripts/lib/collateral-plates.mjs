/* The plates themselves. Geometry only — every path here comes from the archive pack, the
 * operational b-deck, or the NHC graphical outlook, and each of those three inks is different
 * and legended. No plate carries a forecast cone, and no plate is the source of a number.
 */
import { projector, coastPath, trackPath, radiusRing, ringPath, graticule, esc, f2 }
  from "./collateral-plate.mjs";

const INK = {
  coast: "#c3ccd8",
  coastFill: "#eef2f7",
  grat: "#e8edf3",
  track: "#7c8ea6",
  trackMajor: "#0f172a",
  cell: "#7c3aed",
  genesis: "#0f172a",
  live: "#dc2626",
  outlook: "#dc2626",
};

function frame(P) {
  const { lon0, lon1, lat0, lat1 } = P.bounds;
  const [x0, y0] = P(lon0, lat1);
  const [x1, y1] = P(lon1, lat0);
  return { x: f2(x0), y: f2(y0), w: f2(x1 - x0), h: f2(y1 - y0) };
}

/* TEXT INSIDE A PLATE IS TEXT. A plate is drawn at its own viewBox width and then laid out with
   `width:100%`, so a label declared at 10.1 user units paints at 10.1 x (rendered / viewBox) px --
   and every plate on these sheets renders NARROWER than it is drawn. The type gate is about the
   painted size, so the label size is divided by that scale here: pass `renderWidth`, the CSS width
   the plate will occupy, and the label comes out at the declared point size on paper.
   scripts/check-collateral-legibility.mjs measures the painted result and fails if it is short. */
const LABEL_PX = 10.1;              /* 7.58 pt -- the detail floor */
const labelSize = (P, renderWidth, px = LABEL_PX) =>
  Math.round(px * (P.size.width / (renderWidth || P.size.width)) * 100) / 100;

function gratLayer(P, opts, fs = LABEL_PX) {
  const g = graticule(P, opts);
  return `<g class="grat">`
    + g.lines.map((d) => `<path d="${d}" fill="none" stroke="${INK.grat}" stroke-width=".6"/>`).join("")
    + g.labels.map((l) => `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" `
      + `font-family="IBM Plex Mono,monospace" font-size="${fs}" fill="#8a95a5">${esc(l.text)}</text>`).join("")
    + `</g>`;
}

function coastLayer(coast, P, decimate) {
  const paths = coastPath(coast, P, { decimate });
  return `<g class="coast">${paths.map((d) =>
    `<path d="${d}" fill="${INK.coastFill}" stroke="${INK.coast}" stroke-width=".7" `
    + `stroke-linejoin="round"/>`).join("")}</g>`;
}

/** A cross-hair mark with a label, used for every point a query was actually run at. */
function mark(P, lat, lon, { color, label, sub, kind = "cell", anchor = "start", dy = 0, dx = 0,
  leader = false, fs = LABEL_PX }) {
  const [x, y] = P(lon, lat);
  const r = 4.2;
  const glyph = kind === "genesis"
    ? `<circle cx="${f2(x)}" cy="${f2(y)}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.3"/>`
    : kind === "live"
      ? `<g><circle cx="${f2(x)}" cy="${f2(y)}" r="${r + 2.4}" fill="none" stroke="${color}" `
        + `stroke-width="1" opacity=".45"/><circle cx="${f2(x)}" cy="${f2(y)}" r="${r - .6}" `
        + `fill="${color}" stroke="#fff" stroke-width="1.2"/></g>`
      : `<g><path d="M${f2(x - 7)} ${f2(y)}H${f2(x + 7)}M${f2(x)} ${f2(y - 7)}V${f2(y + 7)}" `
        + `stroke="${color}" stroke-width="1.1"/><circle cx="${f2(x)}" cy="${f2(y)}" r="3.2" `
        + `fill="#fff" stroke="${color}" stroke-width="1.5"/></g>`;
  const tx = (anchor === "start" ? x + 9 : x - 9) + dx;
  /* A LEADER RATHER THAN AN OVERLAP. Four marks inside one basin frame put labels on top of one
     another; nudging a label away from its mark then makes it ambiguous which mark it names.
     The hairline restores the association without moving the mark, which must stay where the
     query actually ran. */
  const lead = leader
    ? `<path d="M${f2(x + (anchor === "start" ? 5 : -5))} ${f2(y)}L${f2(tx + (anchor === "start" ? -2 : 2))} ${f2(y - 3 + dy)}" `
      + `stroke="${color}" stroke-width=".6" stroke-dasharray="1.5 1.5" fill="none" opacity=".7"/>`
    : "";
  return glyph + lead
    + `<text x="${f2(tx)}" y="${f2(y - 1 + dy)}" text-anchor="${anchor}" `
    + `font-family="IBM Plex Mono,monospace" font-size="${fs}" font-weight="600" fill="${color}" `
    + `letter-spacing=".4">${esc(label)}</text>`
    + (sub ? `<text x="${f2(tx)}" y="${f2(y + fs * 1.1 + dy)}" text-anchor="${anchor}" `
      + `font-family="IBM Plex Mono,monospace" font-size="${fs}" fill="#475569">${esc(sub)}</text>` : "");
}

export function legend(items) {
  return `<div class="plate-ft">${items.map((i) => {
    const style = i.kind === "dot" ? `background:${i.color}`
      : i.kind === "sq" ? `border-color:${i.color};background:${i.fill || "transparent"}`
        : `border-top-color:${i.color};border-top-style:${i.dash || "solid"};`
          + (i.w ? `border-top-width:${i.w}` : "");
    return `<span class="lg"><i class="${i.kind === "dot" ? "dot" : i.kind === "sq" ? "sq" : ""}" `
      + `style="${style}"></i>${esc(i.label)}</span>`;
  }).join("")}</div>`;
}

export function plate({ title, meta, svg, legendItems, note }) {
  return `<div class="plate">
  <div class="plate-hd"><span class="t">${esc(title)}</span><span class="m">${esc(meta)}</span></div>
  ${svg}
  ${legendItems ? legend(legendItems) : ""}
  ${note ? `<div class="plate-note">${note}</div>` : ""}
</div>`;
}

/* ---- PLATE 1: the NA + EP camera, four marks --------------------------------------------- */
export function basinPlate(D, { width = 700, height = 300, renderWidth = null } = {}) {
  /* The camera reaches to 168°W so the westernmost live mark has room for its label on the left
     rather than against the frame; it also brings Hawaii into the plate, which is one of the six
     coastlines the landfall contract scores. */
  const P = projector({ lon0: -168, lon1: -55, lat0: 5, lat1: 42, width, height, pad: 6 });
  const fs = labelSize(P, renderWidth);
  /* SHORT LABELS, NO COORDINATES, ALL ABOVE THE MARK.
     Five marks sit inside one small stretch of the east Pacific here, and a two-line label on
     each of them collided with its neighbours whatever the offsets. The coordinates are printed
     on the system table two blocks up and in the citation string, so the plate carries the name
     only and leans on the leader line for the association. */
  const marks = [
    { id: "97L", lat: 28.0, lon: -88.7, kind: "cell", color: INK.cell,
      label: "97L", anchor: "start", dx: 5, dy: -11, leader: true },
    { id: "KARINA", lat: 13.2, lon: -115.0, kind: "genesis", color: INK.genesis,
      label: "KARINA", anchor: "end", dx: -6, dy: 20, leader: true },
    { id: "95E", lat: 12.0, lon: -107.5, kind: "cell", color: INK.cell,
      label: "95E", anchor: "start", dx: 5, dy: 24, leader: true },
    { id: "LOWELL", lat: 11.3, lon: -133.8, kind: "genesis", color: INK.genesis,
      label: "LOWELL", anchor: "end", dx: -5, dy: 20, leader: true },
  ];
  const rings = marks.map((m) =>
    `<path d="${radiusRing(m.lat, m.lon, 250, P)}" fill="${m.kind === "cell"
      ? "rgba(124,58,237,.10)" : "rgba(15,23,42,.08)"}" stroke="${m.color}" stroke-width=".9" `
    + `stroke-dasharray="${m.kind === "cell" ? "3 2" : "none"}"/>`).join("");

  /* The live positions, in live ink and nowhere near the cohort geometry. */
  const liveMarks = [];
  const K = D.operational.storms.find((s) => s.atcf_id === "EP112026");
  const L = D.operational.storms.find((s) => s.atcf_id === "EP122026");
  if (K) liveMarks.push(mark(P, K.latest.lat, K.latest.lon, { color: INK.live, kind: "live",
    label: `LIVE KARINA ${K.latest.kt} KT`,
    anchor: "start", dx: 4, dy: -12, leader: true, fs }));
  if (L) liveMarks.push(mark(P, L.latest.lat, L.latest.lon, { color: INK.live, kind: "live",
    label: `LIVE LOWELL ${L.latest.kt} KT`,
    anchor: "end", dx: -5, dy: -13, leader: true, fs }));

  const F = D.operational.storms.find((s) => s.atcf_id === "AL052026");
  if (F) liveMarks.unshift(mark(P, F.latest.lat, F.latest.lon, { color: INK.live, kind: "live",
    label: `LIVE TD FIVE ${F.latest.kt} KT`,
    anchor: "start", dx: 4, dy: -12, leader: true, fs }));

  /* Whatever outlook areas this ingest carries, drawn as NHC's own and never as a cohort. The
     list is read from the feed rather than named here: a system that reaches an ATCF identifier
     leaves the outlook, and a plate that hard-codes an id would quietly draw nothing. */
  const outlookPaths = D.outlook.filter((o) => o.id && (o.rings || []).length).map((o) =>
    o.rings.map((r) => `<path d="${ringPath(r, P)}" fill="rgba(220,38,38,.10)" `
      + `stroke="${INK.outlook}" stroke-width=".9" stroke-dasharray="2 2"/>`).join("")).join("");

  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="North Atlantic and East Pacific plate, four marks">
  <rect width="${width}" height="${height}" fill="#fbfcfe"/>
  ${gratLayer(P, { dLon: 20, dLat: 10 }, fs)}
  ${coastLayer(D.coast, P, 3)}
  ${outlookPaths}
  ${rings}
  ${marks.map((m) => mark(P, m.lat, m.lon, { ...m, fs })).join("")}
  ${liveMarks.join("")}
</svg>`;
  return { svg, P };
}

/* ---- PLATE 2: one cell, its cohort's tracks, and the live system -------------------------- */
export function cellPlate(D, sysId, opts = {}) {
  const sys = D.byId[sysId];
  const {
    lon0, lon1, lat0, lat1, width = 700, height = 330,
    liveAtcf = null, outlookId = null, dLon = 10, dLat = 10, decimate = 2,
    liveLabel = null, cellAnchor = "start", cellDx = 0, cellDy = 0, cellLeader = true,
    renderWidth = null,
  } = opts;
  const P = projector({ lon0, lon1, lat0, lat1, width, height, pad: 6 });
  const fs = labelSize(P, renderWidth);

  const tracks = sys.all_member_tracks.map((t) => {
    const major = t.peak_vmax_kt >= 96;
    return trackPath(t.points, P).map((d) =>
      `<path d="${d}" fill="none" stroke="${major ? INK.trackMajor : INK.track}" `
      + `stroke-width="${major ? 1.15 : .8}" stroke-opacity="${major ? .85 : .55}" `
      + `stroke-linejoin="round" stroke-linecap="round"/>`).join("");
  }).join("");

  const genesisDots = sys.all_member_tracks.map((t) => {
    const p = t.points[0];
    if (!p) return "";
    const [x, y] = P(p[0], p[1]);
    return `<circle cx="${f2(x)}" cy="${f2(y)}" r="1.7" fill="#0f172a" fill-opacity=".8"/>`;
  }).join("");

  const isPre = sys.point_type === "PRE-GENESIS REFERENCE CELL";
  const color = isPre ? INK.cell : INK.genesis;
  const ring = `<path d="${radiusRing(sys.coordinates_queried.lat, sys.coordinates_queried.lon,
    sys.radius_km, P)}" fill="${isPre ? "rgba(124,58,237,.09)" : "rgba(15,23,42,.07)"}" `
    + `stroke="${color}" stroke-width="1.1" stroke-dasharray="${isPre ? "3 2" : "none"}"/>`;

  let outlookPaths = "";
  if (outlookId) {
    const o = D.outlook.find((x) => x.id === outlookId);
    if (o) {
      outlookPaths = o.rings.map((r) => `<path d="${ringPath(r, P)}" fill="rgba(220,38,38,.09)" `
        + `stroke="${INK.outlook}" stroke-width="1" stroke-dasharray="2.5 2"/>`).join("");
    }
  }

  let liveLayer = "";
  if (liveAtcf) {
    const s = D.operational.storms.find((x) => x.atcf_id === liveAtcf);
    if (s) {
      const path = trackPath(s.fixes.map((f) => [f[0], f[1]]), P).map((d) =>
        `<path d="${d}" fill="none" stroke="${INK.live}" stroke-width="1.7" `
        + `stroke-linejoin="round" stroke-linecap="round"/>`).join("");
      liveLayer = path + mark(P, s.latest.lat, s.latest.lon, {
        color: INK.live, kind: "live",
        label: liveLabel || `LIVE ${s.name} ${s.latest.kt} KT`,
        sub: `b-deck ${s.latest_valid_time.slice(0, 16).replace("T", " ")}Z`,
        anchor: "start", fs,
      });
    }
  }

  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(sys.name)} plate">
  <rect width="${width}" height="${height}" fill="#fbfcfe"/>
  ${gratLayer(P, { dLon, dLat }, fs)}
  ${coastLayer(D.coast, P, decimate)}
  ${tracks}
  ${genesisDots}
  ${outlookPaths}
  ${ring}
  ${mark(P, sys.coordinates_queried.lat, sys.coordinates_queried.lon, {
    color, kind: isPre ? "cell" : "genesis",
    label: isPre ? "PRE-GENESIS REFERENCE CELL" : "DECLARED GENESIS POINT",
    sub: `${Math.abs(sys.coordinates_queried.lat).toFixed(1)}N `
      + `${Math.abs(sys.coordinates_queried.lon).toFixed(1)}W · r ${sys.radius_km} km`,
    anchor: cellAnchor, dx: cellDx, dy: cellDy, leader: cellLeader, fs,
  })}
  ${liveLayer}
</svg>`;
  return { svg, P };
}

export const LEGEND = {
  cohortTrack: { kind: "line", color: INK.track, label: "cohort member track (archive)" },
  majorTrack: { kind: "line", color: INK.trackMajor, w: "2px", label: "cohort member, peak ≥ Cat 3" },
  genesisDot: { kind: "dot", color: "#0f172a", label: "member genesis fix" },
  cell: { kind: "sq", color: INK.cell, fill: "rgba(124,58,237,.12)", label: "pre-genesis reference cell + query radius" },
  genesisCell: { kind: "sq", color: INK.genesis, fill: "rgba(15,23,42,.08)", label: "declared genesis point + query radius" },
  live: { kind: "dot", color: INK.live, label: "LIVE — operational b-deck position" },
  liveTrack: { kind: "line", color: INK.live, w: "2px", label: "LIVE — operational b-deck track" },
  outlook: { kind: "sq", color: INK.outlook, fill: "rgba(220,38,38,.10)", label: "LIVE — NHC graphical outlook area" },
  coast: { kind: "sq", color: "#c3ccd8", fill: "#eef2f7", label: "archive coastline (the landfall rule's own geometry)" },
};
