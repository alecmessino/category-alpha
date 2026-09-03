/* The archive's own coastline geometry, in memory.
 *
 * This is the geometry the landfall rule tests against -- the same rings, at the same
 * precision, with nothing removed. scripts/build-atlas-coastlines.mjs explains the encoding and
 * scripts/test-atlas-coastlines.mjs proves it round-trips vertex for vertex against the
 * GeoJSON. What this file does is turn the delivered bytes into the two Float32Arrays the plate
 * draws from, in one pass and with no per-vertex object.
 *
 * PROJECTED ONCE, LIKE THE TRACKS. Positions land in the same unit world square the track
 * points use (atlas-layer.js), so drawing a frame is a multiply and a subtract for the coast
 * exactly as it is for a storm. Mercator's y is a logarithm and calling it 69,471 times per
 * frame is not affordable; calling it once at load is free.
 *
 * IT IS NOT ON THE CRITICAL PATH. The plate paints tracks with contextual coastline underneath
 * as soon as the pack arrives; this replaces the contextual line when it lands, a moment later.
 * Nothing else is substituted for it in the meantime -- an absent authoritative coast is shown
 * as an absent one.
 */

const MAGIC = "MBCOAST1";
const DEG = Math.PI / 180;
const MAX_LAT = 85.0511287798;

/** Decode the coastline pack from raw (already un-gzipped) bytes. */
export function decodeCoastlines(buffer) {
  const bytes = new Uint8Array(buffer);
  let magic = "";
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(bytes[i]);
  if (magic !== MAGIC) {
    throw new Error(`not an atlas coastline pack (magic ${JSON.stringify(magic)})`);
  }
  const hdrLen = new DataView(buffer).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hdrLen)).trim());
  const base = 12 + hdrLen;
  const s = header.sections;

  const delta = new Int32Array(buffer, base + s.delta.offset, s.delta.length);
  const ringOffset = new Uint32Array(buffer, base + s.ring_offset.offset, s.ring_offset.length);
  const ringRegion = new Uint8Array(buffer, base + s.ring_region.offset, s.ring_region.length);
  const coastal = new Uint8Array(buffer, base + s.coastal.offset, s.coastal.length);

  const n = delta.length / 2;
  const scale = header.scale;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const wx = new Float32Array(n);
  const wy = new Float32Array(n);

  /* One prefix sum over the whole stream. The deltas run continuously across ring boundaries,
     so there is no per-ring reset to get wrong. */
  let ix = 0;
  let iy = 0;
  for (let k = 0; k < n; k++) {
    ix += delta[k * 2];
    iy += delta[k * 2 + 1];
    const lo = ix / scale;
    let la = iy / scale;
    lon[k] = lo;
    lat[k] = la;
    if (la > MAX_LAT) la = MAX_LAT;
    else if (la < -MAX_LAT) la = -MAX_LAT;
    wx[k] = (lo + 180) / 360;
    wy[k] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI);
  }

  /* The world-x span of each ring, so a frame can skip the rings it cannot see without
     touching their vertices. Unlike a storm track no ring crosses the antimeridian here, so
     this is a cull rather than the tracks' unwrapping problem. */
  const minX = new Float32Array(ringRegion.length);
  const maxX = new Float32Array(ringRegion.length);
  const minY = new Float32Array(ringRegion.length);
  const maxY = new Float32Array(ringRegion.length);
  for (let r = 0; r < ringRegion.length; r++) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = ringOffset[r]; k < ringOffset[r + 1]; k++) {
      if (wx[k] < x0) x0 = wx[k];
      if (wx[k] > x1) x1 = wx[k];
      if (wy[k] < y0) y0 = wy[k];
      if (wy[k] > y1) y1 = wy[k];
    }
    minX[r] = x0;
    maxX[r] = x1;
    minY[r] = y0;
    maxY[r] = y1;
  }

  return {
    header, lon, lat, wx, wy, ringOffset, ringRegion, coastal,
    minX, maxX, minY, maxY,
    nRings: ringRegion.length,
    nVertices: n,
    regions: header.regions,
  };
}

/** Browser: fetch the .gz and inflate it with the platform's own stream, as the pack does. */
export async function fetchCoastlines(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser has no DecompressionStream; the coastline pack cannot be read");
  }
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return decodeCoastlines(await new Response(stream).arrayBuffer());
}

/* ── THE CONTEXT TIER ─────────────────────────────────────────────────────────────────────
 *
 * Natural Earth 1:110m land, packed by scripts/build-atlas-context.mjs and drawn UNDER the
 * archive's own rings at contextual ink. It replaces the third-party tile service the plate
 * used to fetch for South America, Africa and Canada, so the plate is drawn entirely from bytes
 * on this origin. It is context and only context: no landfall, membership, count, rate or
 * refusal consults it, and scripts/test-atlas-context.mjs asserts the pack is the vendored
 * TopoJSON vertex for vertex.
 *
 * Decoded into the same shape as the coastline pack -- unit-square Float32 positions, ring
 * offsets, per-ring boxes -- so the layer culls and fills it with the same two loops. */
const CONTEXT_MAGIC = "MBCONTX1";

export function decodeContext(buffer) {
  const bytes = new Uint8Array(buffer);
  let magic = "";
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(bytes[i]);
  if (magic !== CONTEXT_MAGIC) {
    throw new Error(`not an atlas context pack (magic ${JSON.stringify(magic)})`);
  }
  const hdrLen = new DataView(buffer).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hdrLen)).trim());
  const base = 12 + hdrLen;
  const s = header.sections;
  const delta = new Int32Array(buffer, base + s.delta.offset, s.delta.length);
  const ringOffset = new Uint32Array(buffer, base + s.ring_offset.offset, s.ring_offset.length);
  const [kx, ky] = header.transform.scale;
  const [dx, dy] = header.transform.translate;

  const n = delta.length / 2;
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const wx = new Float32Array(n);
  const wy = new Float32Array(n);
  let ix = 0;
  let iy = 0;
  for (let k = 0; k < n; k++) {
    ix += delta[k * 2];
    iy += delta[k * 2 + 1];
    /* topojson-client's own transform, in the same order of operations, so the decoded
       coordinate is the source's to the bit. */
    const lo = ix * kx + dx;
    let la = iy * ky + dy;
    lon[k] = lo;
    lat[k] = la;
    if (la > MAX_LAT) la = MAX_LAT;
    else if (la < -MAX_LAT) la = -MAX_LAT;
    wx[k] = (lo + 180) / 360;
    wy[k] = 0.5 - Math.log(Math.tan(Math.PI / 4 + (la * DEG) / 2)) / (2 * Math.PI);
  }
  const nRings = ringOffset.length - 1;
  const minX = new Float32Array(nRings);
  const maxX = new Float32Array(nRings);
  const minY = new Float32Array(nRings);
  const maxY = new Float32Array(nRings);
  for (let r = 0; r < nRings; r++) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = ringOffset[r]; k < ringOffset[r + 1]; k++) {
      if (wx[k] < x0) x0 = wx[k];
      if (wx[k] > x1) x1 = wx[k];
      if (wy[k] < y0) y0 = wy[k];
      if (wy[k] > y1) y1 = wy[k];
    }
    minX[r] = x0; maxX[r] = x1; minY[r] = y0; maxY[r] = y1;
  }
  return { header, lon, lat, wx, wy, ringOffset, minX, maxX, minY, maxY, nRings, nVertices: n };
}

export async function fetchContext(url, { signal } = {}) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (typeof DecompressionStream === "undefined") {
    throw new Error("this browser has no DecompressionStream; the context pack cannot be read");
  }
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  return decodeContext(await new Response(stream).arrayBuffer());
}
