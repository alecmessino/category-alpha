#!/usr/bin/env node
/* Millibar Terminal — server-side data refresh.
 *
 * Runs in GitHub Actions (open internet, no browser CORS). Fetches REAL data:
 *   - NHC CurrentStorms.json  → active tropical cyclones (name, position, intensity, advisory)
 *   - Kalshi / Polymarket     → real hurricane prediction-market prices + order books
 *   - Open-Meteo (best-effort)→ sea-surface temperature near the storm
 * Normalizes into docs/data/latest.json and appends one snapshot to docs/data/frames.json
 * (rolling last 24 = the replay history).
 *
 * HONESTY CONTRACT: every feed is wrapped independently. A failure records
 * {ok:false, status, note} and the value stays null — the UI then shows "NO FEED".
 * Nothing here invents a storm, a price, a track, or a probability.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dir, "../docs/data");
const STEP_MIN = Number(process.env.MT_STEP_MIN || 10);
const FRAME_GAP_MIN = Number(process.env.MT_FRAME_GAP_MIN || 20);  // replay-history granularity
const FRAME_KEEP = Number(process.env.MT_FRAME_KEEP || 144);       // 144 x 20min = 48h of real history
const UA = "MillibarTerminal/1.0 (+https://github.com; institutional weather research dashboard)";
const now = new Date();
const nowIso = now.toISOString();

async function getJSON(url, { timeout = 20000, headers = {} } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json", ...headers }, signal: ctrl.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ok: false, status: res.status, latencyMs, error: "HTTP " + res.status };
    const json = await res.json();
    return { ok: true, status: res.status, latencyMs, json };
  } catch (e) {
    return { ok: false, status: null, latencyMs: Date.now() - t0, error: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}

async function getText(url, { timeout = 30000 } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "*/*" }, signal: ctrl.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ok: false, status: res.status, latencyMs, error: "HTTP " + res.status };
    return { ok: true, status: res.status, latencyMs, text: await res.text() };
  } catch (e) {
    return { ok: false, status: null, latencyMs: Date.now() - t0, error: String(e && e.message || e) };
  } finally { clearTimeout(to); }
}

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }
function parseLat(s) { if (s == null) return null; const m = /(-?[\d.]+)\s*([NS])?/i.exec(String(s)); if (!m) return null; let v = Number(m[1]); if (/S/i.test(m[2] || "")) v = -v; return Number.isFinite(v) ? v : null; }
function parseLon(s) { if (s == null) return null; const m = /(-?[\d.]+)\s*([EW])?/i.exec(String(s)); if (!m) return null; let v = Number(m[1]); if (/W/i.test(m[2] || "")) v = -v; return Number.isFinite(v) ? v : null; }
function clsFromWind(w) {
  if (!Number.isFinite(w)) return { cls: "—", full: "Unknown" };
  if (w >= 137) return { cls: "C5", full: "Cat 5 Hurricane" };
  if (w >= 113) return { cls: "C4", full: "Cat 4 Hurricane" };
  if (w >= 96) return { cls: "C3", full: "Cat 3 Hurricane" };
  if (w >= 83) return { cls: "C2", full: "Cat 2 Hurricane" };
  if (w >= 64) return { cls: "C1", full: "Cat 1 Hurricane" };
  if (w >= 34) return { cls: "TS", full: "Tropical Storm" };
  return { cls: "TD", full: "Tropical Depression" };
}
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function compass(deg) { if (!Number.isFinite(deg)) return ""; return COMPASS[Math.round(deg / 22.5) % 16]; }

/* ---------------- NHC active storms ---------------- */
async function fetchStorms() {
  const url = "https://www.nhc.noaa.gov/CurrentStorms.json";
  const r = await getJSON(url, { headers: { "Accept": "*/*" } });
  const feed = { ok: false, status: r.status, source: "NHC CurrentStorms.json", url, latencyMs: r.latencyMs, count: 0 };
  if (!r.ok) { feed.note = r.error; return { feed, storms: [] }; }
  const active = (r.json && (r.json.activeStorms || r.json.storms)) || [];
  const storms = active.map((s) => {
    const wind = num(s.intensity);           // kt
    const pressure = num(s.pressure);         // mb
    const lat = parseLat(s.latitude ?? s.latitudeNumeric);
    const lon = parseLon(s.longitude ?? s.longitudeNumeric);
    const id = (s.id || s.binNumber || (s.name || "storm")).toString().toUpperCase();
    const cc = clsFromWind(wind);
    const dir = num(s.movementDir), spd = num(s.movementSpeed);
    const movement = dir != null && spd != null ? `${compass(dir)} ${spd} kt` : "—";
    const basin = /^(AL|AT)/i.test(id) ? "east" : /^(EP|CP)/i.test(id) ? "west" : (lon != null && lon < -100 ? "west" : "east");
    const adv = s.publicAdvisory || {};
    const fcst = s.forecastAdvisory || {};
    return {
      id, name: s.name || "Unnamed", cls: s.classification || cc.cls, full_cls: cc.full, basin,
      center: lat != null && lon != null ? [lat, lon] : null, movement, wind, pressure,
      advNum: adv.advNum || null, advTimeZ: adv.issuance || s.lastUpdate || null,
      _fcstUrl: fcst.url || (typeof fcst === "string" ? fcst : null),
      track: null, cone: null, reconTracks: null, pastIdx: 0,
      modelCat4: null,        // no public ensemble Cat-probability feed wired — stays null
      marketCat4: null,       // filled from markets below if a Cat 4+ contract is found
      reconAge: null,
    };
  }).filter((s) => s.center);
  feed.ok = true; feed.count = storms.length;
  feed.note = storms.length ? `${storms.length} active` : "no active tropical cyclones";
  feed.raw = active.length ? JSON.stringify(active[0]).slice(0, 500) : null; // schema probe

  // Forecast track + reconstructed cone, per storm, straight from the TCM product.
  const fnotes = [];
  for (const s of storms) {
    const f = await fetchForecastFor(s, s._fcstUrl);
    s.track = f.track; s.trackPoints = f.trackPoints || null; s.cone = f.cone;
    s.pastIdx = 0;
    fnotes.push(`${s.name}: ${f.note}`);
    delete s._fcstUrl;
  }
  feed.forecast = fnotes.join(" | ");
  return { feed, storms };
}

/* ---------------- NHC forecast track + uncertainty cone ----------------
 * The forecast positions come from the official Forecast/Advisory (TCM) text product
 * linked by CurrentStorms.json — real published coordinates, parsed verbatim.
 *
 * The CONE is then reconstructed the way NHC defines it: the envelope of circles
 * whose radii are NHC's published average track-forecast errors at each lead time.
 * Those radii are documented constants, not invented — but this is a RECONSTRUCTION
 * of the official graphic, and the UI labels it that way. If the advisory can't be
 * fetched or parsed, track and cone stay null and the map shows NO FEED.
 */
// NHC average track-error radii (nautical miles) defining the 2/3-probability circle.
const CONE_NM = {
  east: { 12: 26, 24: 41, 36: 55, 48: 70, 60: 85, 72: 100, 96: 139, 120: 175 }, // Atlantic
  west: { 12: 24, 24: 38, 36: 51, 48: 64, 60: 77, 72: 90, 96: 120, 120: 150 },  // E/C Pacific
};
function coneRadiusNm(basin, hr) {
  const tbl = CONE_NM[basin] || CONE_NM.east;
  const keys = Object.keys(tbl).map(Number).sort((a, b) => a - b);
  if (hr <= 0) return 0;
  if (hr <= keys[0]) return tbl[keys[0]] * (hr / keys[0]);
  for (let i = 1; i < keys.length; i++) {
    if (hr <= keys[i]) {
      const a = keys[i - 1], b = keys[i];
      return tbl[a] + (tbl[b] - tbl[a]) * ((hr - a) / (b - a));
    }
  }
  return tbl[keys[keys.length - 1]];
}

function parseForecastAdvisory(text, baseIso) {
  const pts = [];
  const re = /(?:FORECAST|OUTLOOK)\s+VALID\s+(\d{2})\/(\d{2})(\d{2})Z\s+([\d.]+)\s*([NS])\s+([\d.]+)\s*([EW])/gi;
  const base = baseIso ? new Date(baseIso) : new Date();
  let m;
  while ((m = re.exec(text))) {
    let lat = Number(m[4]); if (/S/i.test(m[5])) lat = -lat;
    let lon = Number(m[6]); if (/W/i.test(m[7])) lon = -lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Valid times are day-of-month + HHMM; roll the month forward if it wrapped.
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Number(m[1]), Number(m[2]), Number(m[3])));
    if (d.getTime() < base.getTime() - 3 * 3600e3) d.setUTCMonth(d.getUTCMonth() + 1);
    const hr = Math.round((d.getTime() - base.getTime()) / 3600e3);
    if (hr < 0 || hr > 168) continue;
    pts.push({ lat, lon, hr, validZ: d.toISOString() });
  }
  return pts.sort((a, b) => a.hr - b.hr);
}

// Envelope of the error circles → cone polygon (lat/lon ring).
function buildCone(points, basin) {
  if (!points || points.length < 2) return null;
  const rad = (x) => (x * Math.PI) / 180;
  const left = [], right = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const cosLat = Math.max(0.2, Math.cos(rad(p.lat)));
    const brg = Math.atan2((b.lon - a.lon) * cosLat, b.lat - a.lat); // radians from north
    const rNm = coneRadiusNm(basin, p.hr);
    const dLat = -Math.sin(brg) * (rNm / 60);
    const dLon = (Math.cos(brg) * (rNm / 60)) / cosLat;
    right.push([p.lat + dLat, p.lon + dLon]);
    left.push([p.lat - dLat, p.lon - dLon]);
  }
  // rounded cap at the final forecast point
  const last = points[points.length - 1];
  const cosLat = Math.max(0.2, Math.cos(rad(last.lat)));
  const rNm = coneRadiusNm(basin, last.hr);
  const prev = points[points.length - 2];
  const brg = Math.atan2((last.lon - prev.lon) * cosLat, last.lat - prev.lat);
  const cap = [];
  for (let k = 1; k <= 7; k++) {
    const th = brg - Math.PI / 2 + (Math.PI * k) / 8;
    cap.push([last.lat + Math.cos(th) * (rNm / 60), last.lon + (Math.sin(th) * (rNm / 60)) / cosLat]);
  }
  return right.concat(cap, left.reverse());
}

async function fetchForecastFor(storm, rawAdvisoryUrl) {
  if (!rawAdvisoryUrl) return { track: null, cone: null, note: "no forecast-advisory link in feed" };
  const r = await getText(rawAdvisoryUrl);
  if (!r.ok) return { track: null, cone: null, note: "advisory fetch " + r.error };
  const pts = parseForecastAdvisory(r.text, storm.advTimeZ);
  if (!pts.length) return { track: null, cone: null, note: "no FORECAST VALID lines parsed" };
  const withNow = [{ lat: storm.center[0], lon: storm.center[1], hr: 0 }, ...pts];
  return {
    track: withNow.map((p) => [p.lat, p.lon]),
    trackPoints: withNow.map((p) => ({ at: [p.lat, p.lon], hr: p.hr, validZ: p.validZ || storm.advTimeZ })),
    cone: buildCone(withNow, storm.basin),
    note: `${pts.length} forecast positions · cone reconstructed from NHC track-error radii`,
  };
}

/* ---------------- HURDAT2 climatology (fair-value baseline) ----------------
 * HURDAT2 is NOAA/NHC's official Atlantic best-track archive (public domain). We
 * derive an EMPIRICAL base rate for seasonal hurricane-count contracts:
 *   P(season total > strike) = share of past seasons whose total exceeded strike.
 * This is a transparent CLIMATOLOGY baseline, not a skill forecast — it knows
 * nothing about ENSO, SSTs, or season-to-date progress. It is labelled as such
 * everywhere it surfaces. If HURDAT2 is unreachable, the anchor stays null and the
 * UI keeps showing MODEL DEFERRED rather than inventing a probability.
 */
const CLIM_FROM_YEAR = Number(process.env.MT_CLIM_FROM || 1991); // modern geostationary-satellite era

function doyOf(yyyymmdd) {
  const s = String(yyyymmdd).trim();
  const y = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  if (!y || !m || !d) return null;
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

function parseHurdat2(text, fromYear, excludeYear) {
  const byYear = new Map();
  let curId = null, curYear = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split(",");
    const head = /^AL\d{2}(\d{4})$/.exec((f[0] || "").trim());
    if (head && f.length <= 4) {
      curId = f[0].trim(); curYear = Number(head[1]);
      if (!byYear.has(curYear)) byYear.set(curYear, { hur: new Map(), maj: new Map() });
      continue;
    }
    if (!curId || curYear == null) continue;
    const status = (f[3] || "").trim();
    const wind = Number((f[6] || "").trim());
    if (status === "HU") {                       // hurricane-strength best-track point
      const y = byYear.get(curYear);
      // Record the day-of-year each storm FIRST reached each threshold, so the
      // climatology can be conditioned on how much of the season remains.
      const doy = doyOf(f[0]);
      if (!y.hur.has(curId)) y.hur.set(curId, doy);
      if (Number.isFinite(wind) && wind >= 96 && !y.maj.has(curId)) y.maj.set(curId, doy); // Cat 3+
    }
  }
  const years = [...byYear.keys()].filter((y) => y >= fromYear && y !== excludeYear).sort((a, b) => a - b);
  if (!years.length) return null;
  const after = (map, doy) => [...map.values()].filter((d) => d != null && d >= doy).length;
  return {
    years, from: years[0], to: years[years.length - 1],
    hurricanes: years.map((y) => byYear.get(y).hur.size),
    major: years.map((y) => byYear.get(y).maj.size),
    // Seasonal formation dates retained so we can ask: in each past season, how many
    // hurricanes had NOT yet formed by this calendar date?
    hurricanesAfter: (doy) => years.map((y) => after(byYear.get(y).hur, doy)),
    majorAfter: (doy) => years.map((y) => after(byYear.get(y).maj, doy)),
  };
}

async function fetchClimatology() {
  // The HURDAT2 filename carries a revision date that changes yearly, so discover
  // it from the directory index rather than hardcoding a URL that will rot.
  const base = "https://www.nhc.noaa.gov/data/hurdat/";
  const idx = await getText(base);
  let names = [];
  if (idx.ok) {
    names = [...new Set([...idx.text.matchAll(/hurdat2-1851-\d{4}-\d+\.txt/g)].map((m) => m[0]))].sort().reverse();
  }
  if (!names.length) return { feed: { ok: false, source: "HURDAT2 (NOAA/NHC)", status: idx.status || null, note: "could not locate hurdat2 file: " + (idx.error || "no match in index") }, clim: null };
  const r = await getText(base + names[0]);
  if (!r.ok) return { feed: { ok: false, source: "HURDAT2 (NOAA/NHC)", status: r.status, note: r.error }, clim: null };
  const clim = parseHurdat2(r.text, CLIM_FROM_YEAR, now.getUTCFullYear());
  if (!clim) return { feed: { ok: false, source: "HURDAT2 (NOAA/NHC)", status: r.status, note: "parsed 0 seasons" }, clim: null };
  return {
    feed: { ok: true, status: r.status, source: `HURDAT2 ${clim.from}–${clim.to}`, latencyMs: r.latencyMs, count: clim.years.length,
            note: `${clim.years.length}-season Atlantic climatology (baseline, not a skill forecast)` },
    clim: Object.assign(clim, { file: names[0] }),
  };
}

/* ---------------- ENSO / ONI (the L3 stratification) ----------------
 * ENSO is the single best-established seasonal modulator of Atlantic hurricane
 * activity: El Niño raises Caribbean/Atlantic vertical wind shear and suppresses
 * counts; La Niña does the reverse. We do NOT model that mechanism — we condition
 * empirically, exactly like L1: restrict the HURDAT2 seasons to those whose peak
 * (Aug–Sep–Oct) ONI sat in the SAME phase as today's, and re-read the frequency.
 *
 * Two honesty constraints are enforced below rather than papered over:
 *   1. Small samples. A phase bucket holds ~8–14 of the ~35 modern seasons, so the
 *      raw stratified frequency is noisy. It is shrunk toward the unstratified
 *      estimate by m/(m+k), and buckets under MIN_MATCH seasons are refused
 *      outright (layer reports NO FEED rather than a 3-season "probability").
 *   2. The current season's ASO ONI does not exist in July. We carry the most
 *      recent observed 3-month ONI forward and LABEL that persistence assumption
 *      everywhere the layer surfaces — it is an assumption, not an observation.
 */
const ONI_EL = 0.5, ONI_LA = -0.5;          // CPC's standard phase thresholds
const ONI_SHRINK_K = Number(process.env.MT_ONI_K || 8);
const ONI_MIN_MATCH = Number(process.env.MT_ONI_MIN || 6);
const SEAS_ORDER = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"];
const PHASE_LABEL = { el: "El Niño", la: "La Niña", neutral: "ENSO-neutral" };

function phaseOf(v) { return v == null || !Number.isFinite(v) ? null : v >= ONI_EL ? "el" : v <= ONI_LA ? "la" : "neutral"; }

// CPC's canonical oni.ascii.txt:  "SEAS YR TOTAL ANOM"  →  "  ASO 2023 27.94  1.75"
function parseOniAscii(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 4) continue;
    const seas = f[0].toUpperCase(), year = Number(f[1]), anom = Number(f[3]);
    if (SEAS_ORDER.indexOf(seas) < 0 || !Number.isFinite(year) || !Number.isFinite(anom)) continue;
    rows.push({ seas, year, anom });
  }
  return rows;
}

// NOAA PSL oni.data mirror: one row per year, 12 centred 3-month means, -99.9 = missing.
// Column m is the mean CENTRED on month m — so column 9 is ASO, matching SEAS_ORDER.
function parseOniPsl(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f.length !== 13) continue;
    const year = Number(f[0]);
    if (!Number.isInteger(year) || year < 1850 || year > 2200) continue;
    for (let m = 0; m < 12; m++) {
      const v = Number(f[m + 1]);
      if (!Number.isFinite(v) || v <= -99) continue;
      rows.push({ seas: SEAS_ORDER[m], year, anom: v });
    }
  }
  return rows;
}

function buildOni(rows, sourceName, status, latencyMs) {
  rows.sort((a, b) => a.year - b.year || SEAS_ORDER.indexOf(a.seas) - SEAS_ORDER.indexOf(b.seas));
  const asoByYear = new Map(rows.filter((r) => r.seas === "ASO").map((r) => [r.year, r.anom]));
  const latest = rows[rows.length - 1];
  const yr = now.getUTCFullYear();
  // Prefer this season's own peak-season value; if it doesn't exist yet, carry the
  // most recent observed season forward and flag it as an assumption.
  const observedPeak = asoByYear.has(yr);
  const anchor = observedPeak ? { seas: "ASO", year: yr, anom: asoByYear.get(yr) } : latest;
  const centre = Date.UTC(anchor.year, SEAS_ORDER.indexOf(anchor.seas), 15);
  const ageMonths = Math.max(0, Math.round((now.getTime() - centre) / (30.44 * 86400000)));
  return {
    source: sourceName, status, latencyMs,
    asoByYear, seasons: asoByYear.size,
    phase: phaseOf(anchor.anom),
    anchorSeas: anchor.seas, anchorYear: anchor.year, anchorAnom: anchor.anom,
    assumed: !observedPeak, ageMonths,
    recent: rows.slice(-6).map((r) => ({ seas: r.seas, year: r.year, anom: r.anom })),
  };
}

async function fetchEnso() {
  const sources = [
    { url: "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt", name: "CPC ONI", parse: parseOniAscii },
    { url: "https://psl.noaa.gov/data/correlation/oni.data",           name: "NOAA PSL ONI mirror", parse: parseOniPsl },
  ];
  const attempts = [];
  for (const s of sources) {
    const r = await getText(s.url);
    if (!r.ok) { attempts.push({ source: s.name, ok: false, status: r.status, note: r.error }); continue; }
    let rows = [];
    try { rows = s.parse(r.text); } catch (e) { rows = []; }
    // A truncated or reformatted file must not quietly become a two-season "climatology".
    if (rows.length < 120) { attempts.push({ source: s.name, ok: false, status: r.status, note: `parsed ${rows.length} usable rows — format changed?` }); continue; }
    const oni = buildOni(rows, s.name, r.status, r.latencyMs);
    if (!oni.phase) { attempts.push({ source: s.name, ok: false, status: r.status, note: "no usable anchor value" }); continue; }
    const sign = oni.anchorAnom >= 0 ? "+" : "";
    return {
      feed: {
        ok: true, source: s.name, status: r.status, latencyMs: r.latencyMs, count: oni.seasons, attempts,
        note: `${PHASE_LABEL[oni.phase]} · ${oni.anchorSeas} ${oni.anchorYear} ONI ${sign}${oni.anchorAnom.toFixed(2)}`
            + (oni.assumed ? ` (peak-season ASO not yet observed — carried forward, ${oni.ageMonths}mo old)` : ""),
      },
      oni,
    };
  }
  return { feed: { ok: false, source: "CPC ONI", note: "no ONI source reachable — L3 stays unstratified", attempts }, oni: null };
}

// Empirical P(count > strike) for Atlantic seasonal hurricane-count contracts.
/* Progressive conditional posterior.
   L0 unconditional base rate  →  L1 conditioned on how much season remains.
   L1 is the layer that matters most right now: an unconditional July estimate
   silently assumes a full season ahead. Each layer is computed only where real
   data supports it; anything else is reported as an unavailable layer rather
   than folded in silently. */
function posteriorFor(major, strike, clim, seasonToDate, oni) {
  if (!clim || strike == null) return null;
  const counts = major ? clim.major : clim.hurricanes;
  const n = counts.length;
  const layers = [];

  // L0 — unconditional seasonal frequency
  const p0 = counts.filter((c) => c > strike).length / n;
  layers.push({ id: "base", label: "Historical climatology", p: p0,
    basis: `${clim.from}–${clim.to} full seasons (n=${n})` });

  // L1 — condition on day-of-year: only count storms that had NOT yet formed by today
  const doy = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
  const remainFn = major ? clim.majorAfter : clim.hurricanesAfter;
  const need = strike - (seasonToDate == null ? 0 : seasonToDate);
  let p1 = null, remaining = null;
  if (typeof remainFn === "function") {
    remaining = remainFn(doy);
    p1 = remaining.filter((r) => r > need).length / n;
    layers.push({ id: "doy", label: "Day-of-year conditional", p: p1,
      basis: `hurricanes forming on/after day ${doy} in each past season; needs >${need} more` });
  }

  // L2 — season-to-date. Requires the current year's count, which HURDAT2 does not
  // publish until after the season. Declared, not guessed.
  layers.push(seasonToDate == null
    ? { id: "std", label: "Season-to-date state", p: null, unavailable: true,
        basis: "no in-season Atlantic count feed wired — L1 assumes 0 so far" }
    : { id: "std", label: "Season-to-date state", p: p1, basis: `${seasonToDate} already recorded in ${now.getUTCFullYear()}` });

  // L3 — ENSO stratification: re-read the SAME conditional frequency, but only over
  // seasons whose peak-season ONI shared today's phase. Shrunk for sample size, and
  // refused entirely when the phase bucket is too thin to mean anything.
  const anchorP = p1 != null ? p1 : p0;
  let p3 = null;
  if (!oni || !oni.phase) {
    layers.push({ id: "enso", label: "ENSO-stratified", p: null, unavailable: true,
      basis: "no CPC ONI feed this cycle — phase stratification not applied" });
  } else {
    const matched = [];
    clim.years.forEach((y, i) => { if (phaseOf(oni.asoByYear.get(y)) === oni.phase) matched.push(i); });
    const m = matched.length;
    const pl = PHASE_LABEL[oni.phase];
    if (m < ONI_MIN_MATCH) {
      layers.push({ id: "enso", label: "ENSO-stratified", p: null, unavailable: true,
        basis: `only ${m} ${pl} season${m === 1 ? "" : "s"} in ${clim.from}–${clim.to} — below the ${ONI_MIN_MATCH}-season floor, so no stratified estimate is published` });
    } else {
      const hit = remaining
        ? matched.filter((i) => remaining[i] > need).length
        : matched.filter((i) => counts[i] > strike).length;
      const raw = hit / m;
      const w = m / (m + ONI_SHRINK_K);              // shrink small buckets toward L1
      p3 = w * raw + (1 - w) * anchorP;
      const sign = oni.anchorAnom >= 0 ? "+" : "";
      layers.push({ id: "enso", label: "ENSO-stratified", p: p3,
        basis: `${m} ${pl} season${m === 1 ? "" : "s"} → ${Math.round(raw * 100)}% raw, shrunk ${Math.round((1 - w) * 100)}% toward the unstratified estimate (k=${ONI_SHRINK_K})`
             + ` · phase from ${oni.anchorSeas} ${oni.anchorYear} ONI ${sign}${oni.anchorAnom.toFixed(2)}`
             + (oni.assumed ? ` (ASO ${now.getUTCFullYear()} not yet observed — persistence assumed)` : "") });
    }
  }

  const posterior = p3 != null ? p3 : anchorP;
  return { p: posterior, layers, doy,
    basis: layers.filter((l) => !l.unavailable).map((l) => l.label).join(" → ") };
}

/* What does this series actually COUNT? Derive it from the ticker, never the title.
   Kalshi titles are unreliable for this: KXTROPSTORM-26DEC01-T10 counts tropical
   storms but is titled "Will there be more than 10 Atlantic hurricanes in 2026?" —
   byte-identical to the real hurricane-count market KXHURCTOT-26DEC01-T10. Title
   matching therefore anchored a named-storm contract against hurricane frequencies
   and manufactured a −43pt edge out of nothing. Tickers are structured and stable. */
function seriesQuantity(ticker) {
  const t = String(ticker || "").toUpperCase();
  if (!t) return null;
  if (/CPAC|EPAC|PACIFIC/.test(t)) return { q: "hurricane", basin: "pacific" }; // not Atlantic
  if (/^KXHURCTOTMAJ/.test(t)) return { q: "major", basin: "atlantic" };
  if (/^KXHURCTOT/.test(t)) return { q: "hurricane", basin: "atlantic" };
  if (/^KXTROPSTORM/.test(t)) return { q: "namedstorm", basin: "atlantic" };  // different base rate
  if (/^KXHURCAT-/.test(t)) return { q: "perstorm", basin: null };            // single-storm ladder
  if (/^KXHURRICANENAMES|^KXFIRSTHURRICANE/.test(t)) return { q: "naming", basin: null };
  return null;
}

function climatologyAnchor(title, strike, clim, ticker, oni) {
  if (!clim || strike == null) return null;
  const t = (String(title) + " " + String(ticker || "")).toLowerCase();
  // Ticker-derived identification is authoritative; fall back to the title only for
  // series we don't recognise (and then demand explicit Atlantic + hurricane wording).
  const sq = seriesQuantity(ticker);
  let major;
  if (sq) {
    if (sq.basin !== "atlantic") return null;          // climatology is Atlantic-only
    if (sq.q !== "hurricane" && sq.q !== "major") return null; // TS / per-storm / naming: no anchor
    major = sq.q === "major";
  } else {
    if (!/hurricane/.test(t)) return null;
    if (/named storm|tropical storm/.test(t)) return null;
    if (!/atlantic/.test(t) && !/\bkxatl/.test(t)) return null;
    if (!/how many|more than|at least|total|count/.test(t)) return null;
    major = /\bmajor\b/.test(t) || /categor(?:y|ies)\s*[345]\b/.test(t);
  }
  const counts = major ? clim.major : clim.hurricanes;
  if (!counts || !counts.length) return null;
  const hits = counts.filter((c) => c > strike).length;
  const post = posteriorFor(major, strike, clim, null, oni);
  return {
    p: post ? post.p : hits / counts.length,
    unconditional: hits / counts.length,
    layers: post ? post.layers : null,
    basis: post
      ? `${post.basis} · ${clim.from}–${clim.to} ${major ? "major " : ""}seasons (n=${counts.length}), day ${post.doy}`
      : `${clim.from}–${clim.to} ${major ? "major " : ""}Atlantic hurricane seasons (n=${counts.length}); ${hits} exceeded ${strike}`,
  };
}

/* ---------------- Prediction markets ---------------- */
const HUR_RE = /hurricane|tropical (storm|cyclone|depression)|named storm|\bcyclone\b|landfall|make landfall|category\s*\d|saffir|typhoon/i;
// "Hurricanes" is also a sports franchise — exclude those so the board stays weather-only.
const NOT_WEATHER_RE = /stanley cup|\bnhl\b|\bnfl\b|\bnba\b|carolina hurricanes|miami hurricanes|super bowl/i;

function assocStorm(title, storms) {
  const t = title.toLowerCase();
  const hit = storms.find((s) => s.name && s.name.length > 2 && t.includes(s.name.toLowerCase()));
  return hit ? hit.id : null;
}

// Kalshi caps a page at 1000 markets and there are far more open than that, so the
// hurricane series only appears if we follow the cursor. (Not paginating was why the
// board previously reported "0 hurricane markets" despite HTTP 200.)
// Kalshi has published under a couple of API hosts; try them in order so a host
// change doesn't silently kill the board. Diagnostics are recorded either way.
const KALSHI_HOSTS = [
  "https://api.elections.kalshi.com/trade-api/v2",
  "https://api.kalshi.com/trade-api/v2",
  "https://trading-api.kalshi.com/trade-api/v2",
];

// Best path: discover the WEATHER SERIES by category, then pull only those events.
// Kalshi carries >5k open events / >15k open markets, so brute-force paging blows
// past any sane page cap and misses the hurricane series entirely. Series discovery
// is a couple of cheap calls and lands directly on the right contracts.
const KALSHI_WEATHER_CATEGORIES = ["Climate and Weather", "Weather", "Climate", "Science and Technology"];

async function fetchKalshiWeatherSeries() {
  const tried = [];
  for (const host of KALSHI_HOSTS) {
    for (const cat of KALSHI_WEATHER_CATEGORIES) {
      const r = await getJSON(`${host}/series?category=${encodeURIComponent(cat)}`);
      const list = (r.json && (r.json.series || r.json.data)) || [];
      tried.push({ host, mode: "series", category: cat, status: r.status, scanned: list.length, error: r.ok ? null : r.error });
      if (!r.ok || !list.length) continue;
      const hits = list.filter((s) => {
        const hay = `${s.title || ""} ${s.ticker || ""} ${s.sub_title || ""}`;
        return HUR_RE.test(hay) && !NOT_WEATHER_RE.test(hay);
      });
      if (hits.length) return { ok: true, host, series: hits, category: cat, status: r.status, tried };
    }
  }
  return { ok: false, series: [], tried };
}

// Simplest reliable form: ask /markets directly per series. Returns FULL market
// objects (with quotes) in one call each — no event indirection, no hydration.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 60+ rapid sequential series calls get throttled, which made the board's contents
// swing between runs (116 -> 44 -> 8 contracts) and intermittently drop the active
// storm's market. Pace the calls and retry once so a run comes back complete.
async function fetchKalshiMarketsForSeries(host, series) {
  const out = []; let raw = null, okCalls = 0, failCalls = 0;
  for (const s of series.slice(0, 80)) {
    const t = s.ticker || s.series_ticker;
    if (!t) continue;
    const url = `${host}/markets?series_ticker=${encodeURIComponent(t)}&status=open&limit=200`;
    let r = await getJSON(url);
    if (!r.ok) { await sleep(700); r = await getJSON(url); }   // one retry on throttle/blip
    if (!r.ok) { failCalls++; continue; }
    okCalls++;
    const list = (r.json && r.json.markets) || [];
    if (!raw && list.length) raw = JSON.stringify(list[0]).slice(0, 420); // schema probe
    for (const m of list) out.push({ m, title: m.title || s.title || "", eventTicker: m.event_ticker });
    await sleep(120);                                          // stay under the rate limit
  }
  return { pairs: out, raw, okCalls, failCalls };
}

async function fetchKalshiEventsForSeries(host, series) {
  const events = [];
  for (const s of series.slice(0, 80)) {
    const t = s.ticker || s.series_ticker;
    if (!t) continue;
    const r = await getJSON(`${host}/events?series_ticker=${encodeURIComponent(t)}&with_nested_markets=true&status=open&limit=200`);
    if (r.ok && r.json && Array.isArray(r.json.events)) events.push(...r.json.events);
  }
  return events;
}

// Markets nested inside /events carry ticker + sub-title but NO pricing fields, so
// they must be hydrated from /markets before they're usable. Batch by ticker (one
// call covers ~100), falling back to per-event queries.
async function hydrateKalshiPrices(host, pairs) {
  const byTicker = new Map();
  // Per-event is the reliable form; the batch `tickers=` param is not consistently honoured.
  const evts = [...new Set(pairs.map((p) => p.eventTicker).filter(Boolean))].slice(0, 60);
  for (const et of evts) {
    const r = await getJSON(`${host}/markets?event_ticker=${encodeURIComponent(et)}&limit=200`);
    const list = (r.json && r.json.markets) || [];
    for (const m of list) if (m && m.ticker) byTicker.set(m.ticker, m);
  }
  if (!byTicker.size) { // last resort: batch by ticker
    const tickers = [...new Set(pairs.map((p) => p.m && p.m.ticker).filter(Boolean))];
    for (let i = 0; i < tickers.length && i < 600; i += 100) {
      const r = await getJSON(`${host}/markets?tickers=${encodeURIComponent(tickers.slice(i, i + 100).join(","))}&limit=200`);
      const list = (r.json && r.json.markets) || [];
      for (const m of list) if (m && m.ticker) byTicker.set(m.ticker, m);
    }
  }
  let hydrated = 0, priced = 0;
  const out = pairs.map((p) => {
    const full = p.m && byTicker.get(p.m.ticker);
    if (!full) return p;
    hydrated++;
    if (full.yes_bid != null || full.yes_ask != null || full.last_price != null) priced++;
    return Object.assign({}, p, { m: Object.assign({}, p.m, full) });
  });
  return { pairs: out, hydrated, priced, events: evts.length };
}

// Fallback path: page Kalshi EVENTS with nested markets. There are >15k open
// markets (paging them all blew past the page cap and missed the hurricane series),
// but far fewer events — and an event carries the question title we need for
// strike/climatology matching, with its markets nested inside.
async function fetchKalshiEvents(maxPages = 25) {
  const tried = [];
  for (const host of KALSHI_HOSTS) {
    let cursor = null, events = [], pages = 0, status = null, err = null;
    do {
      const url = `${host}/events?limit=200&status=open&with_nested_markets=true` +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      const r = await getJSON(url);
      status = r.status;
      if (!r.ok) { err = r.error; break; }
      const batch = (r.json && r.json.events) || [];
      events.push(...batch);
      cursor = (r.json && r.json.cursor) || null;
      pages++;
      if (!batch.length) break;
    } while (cursor && pages < maxPages);
    tried.push({ host, mode: "events", status, pages, scanned: events.length, error: err });
    if (events.length) return { ok: true, host, status, events, pages, scanned: events.length, tried };
  }
  return { ok: false, status: tried[0] && tried[0].status, error: (tried.find((t) => t.error) || {}).error || "no events returned", events: [], pages: 0, scanned: 0, tried };
}

async function fetchKalshiPaged(maxPages = 15) {
  const tried = [];
  for (const host of KALSHI_HOSTS) {
    let cursor = null, all = [], pages = 0, status = null, err = null;
    do {
      const url = `${host}/markets?status=open&limit=1000` + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      const r = await getJSON(url);
      status = r.status;
      if (!r.ok) { err = r.error; break; }
      const batch = (r.json && r.json.markets) || [];
      all.push(...batch);
      cursor = (r.json && r.json.cursor) || null;
      pages++;
      if (!batch.length) break;
    } while (cursor && pages < maxPages);
    tried.push({ host, status, pages, scanned: all.length, error: err });
    if (all.length) return { ok: true, host, status, markets: all, pages, scanned: all.length, tried };
  }
  return { ok: false, status: tried[0] && tried[0].status, error: (tried.find((t) => t.error) || {}).error || "no markets returned", markets: [], pages: 0, scanned: 0, tried };
}

// Kalshi migrated to dollar-denominated STRING fields (last_price_dollars:"0.0300",
// liquidity_dollars, …) alongside the legacy cent-denominated numbers. Read both so
// the board survives either shape.
function dollarNum(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}
// → probability in 0..1, or null when the contract carries no quote at all.
function priceOf(m) {
  const bidD = dollarNum(m.yes_bid_dollars), askD = dollarNum(m.yes_ask_dollars), lastD = dollarNum(m.last_price_dollars);
  if (bidD != null && askD != null && (bidD > 0 || askD > 0)) return (bidD + askD) / 2;
  if (lastD != null && lastD > 0) return lastD;
  if (bidD != null && bidD > 0) return bidD;
  if (askD != null && askD > 0) return askD;
  const bid = num(m.yes_bid), ask = num(m.yes_ask), last = num(m.last_price);
  if (bid != null && ask != null && (bid > 0 || ask > 0)) return (bid + ask) / 200;
  if (last != null && last > 0) return last / 100;
  if (bid != null && bid > 0) return bid / 100;
  if (ask != null && ask > 0) return ask / 100;
  return null;
}
function spreadOf(m) {
  const bidD = dollarNum(m.yes_bid_dollars), askD = dollarNum(m.yes_ask_dollars);
  if (bidD != null && askD != null) return Math.max(0, askD - bidD);
  const bid = num(m.yes_bid), ask = num(m.yes_ask);
  if (bid != null && ask != null) return Math.max(0, (ask - bid) / 100);
  return 0.02;
}
function liquidityOf(m) {
  const d = dollarNum(m.liquidity_dollars);
  if (d != null && d > 0) return Math.round(d);
  const c = num(m.liquidity);
  return c != null && c > 0 ? Math.round(c / 100) : null;
}
function volumeOf(m) {
  return dollarNum(m.volume_dollars) ?? num(m.dollar_volume) ?? num(m.volume) ?? 0;
}

function shortLabel(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s·,]+$/, "") + "…";
}

function parseStrike(...vals) {
  for (const v of vals) {
    const m = /(?:above|over|more than|greater than|>=?)\s*(\d+(?:\.\d+)?)/i.exec(String(v || ""));
    if (m) return Number(m[1]);
  }
  return null;
}
// seasonal/index contract vs. a single active storm
function horizonOf(title) {
  return /how many|total|this year|season|in 20\d\d|\bby (jan|dec)/i.test(String(title)) ? "seasonal" : "storm";
}

// Flatten either shape into {market, title} pairs, where title is the human question.
async function collectKalshiMarkets() {
  // 1) targeted: weather series → their events (cheap, lands on the hurricane board)
  const ser = await fetchKalshiWeatherSeries();
  if (ser.ok) {
    // 1a) direct per-series market query — full objects incl. quotes
    const direct = await fetchKalshiMarketsForSeries(ser.host, ser.series);
    if (direct.pairs.length) {
      return { ok: true, status: ser.status, pairs: direct.pairs, pages: ser.series.length,
        scanned: direct.pairs.length, mode: `series-markets(${ser.series.length}s·${direct.okCalls}ok/${direct.failCalls}fail)`, tried: ser.tried, raw: direct.raw };
    }
    // 1b) event indirection + price hydration
    const evs = await fetchKalshiEventsForSeries(ser.host, ser.series);
    const out = [];
    for (const e of evs) {
      const title = e.title || e.sub_title || e.event_ticker || "";
      for (const m of (e.markets || [])) out.push({ m, title, eventTicker: e.event_ticker });
    }
    if (out.length) {
      const h = await hydrateKalshiPrices(ser.host, out);
      return { ok: true, status: ser.status, pairs: h.pairs, pages: ser.series.length,
        scanned: out.length, mode: `series(${ser.series.length}s·${h.events}ev·hyd${h.hydrated}·px${h.priced})`, tried: ser.tried };
    }
  }
  // 2) broad event scan
  const ev = await fetchKalshiEvents();
  ev.tried = [...(ser.tried || []), ...(ev.tried || [])];
  if (ev.ok) {
    const out = [];
    for (const e of ev.events) {
      const title = e.title || e.sub_title || e.event_ticker || "";
      for (const m of (e.markets || [])) out.push({ m, title, eventTicker: e.event_ticker });
    }
    if (out.length) {
      const h = await hydrateKalshiPrices(ev.host, out.filter((p) => HUR_RE.test(p.title)));
      return { ok: true, status: ev.status, pairs: h.pairs.length ? h.pairs : out, pages: ev.pages,
        scanned: ev.scanned, mode: `events(hyd${h.hydrated})`, tried: ev.tried };
    }
  }
  // Fallback: page the flat markets list (older/alternate API behaviour).
  const paged = await fetchKalshiPaged();
  const tried = [...(ev.tried || []), ...(paged.tried || [])];
  if (!paged.ok) return { ok: false, status: paged.status, error: paged.error || ev.error, pairs: [], pages: 0, scanned: 0, mode: "markets", tried };
  return { ok: true, status: paged.status, mode: "markets", pages: paged.pages, scanned: paged.scanned, tried,
           pairs: paged.markets.map((m) => ({ m, title: m.title || m.subtitle || m.ticker || "", eventTicker: m.event_ticker })) };
}

async function fetchKalshi(storms, clim, oni) {
  const paged = await collectKalshiMarkets();
  if (!paged.ok) return { ok: false, status: paged.status, source: "kalshi", note: paged.error, contracts: [], diag: paged.tried };
  const contracts = [];
  const drops = { noKeyword: 0, sports: 0, noPrice: 0 };
  const samples = [];
  for (const pair of paged.pairs) {
    const m = pair.m;
    const title = pair.title || m.title || m.ticker || "";
    const sub = m.yes_sub_title || m.subtitle || "";
    const price = priceOf(m);
    if (samples.length < 6 && price != null) samples.push(`${title.slice(0, 40)} | ${sub.slice(0, 14)} | px=${price.toFixed(3)}`);
    if (!HUR_RE.test(title) && !HUR_RE.test(m.ticker || "")) { drops.noKeyword++; continue; }
    if (NOT_WEATHER_RE.test(title)) { drops.sports++; continue; } // sports teams named "Hurricanes"
    if (price == null) { drops.noPrice++; continue; }             // genuinely unquoted ladder rung
    const spread = spreadOf(m);
    const liquidity = liquidityOf(m);
    const volume = volumeOf(m);
    // Kalshi exposes the ladder threshold numerically; fall back to the sub-title text.
    const strike = parseStrike(sub, m.yes_sub_title, m.subtitle) ?? num(m.floor_strike);
    const anchor = climatologyAnchor(title, strike, clim, m.ticker, oni);
    contracts.push({
      id: m.ticker, label: title, short: shortLabel(sub ? title.replace(/\?$/, "") + " · " + sub : title, 46),
      storm: assocStorm(title + " " + sub, storms), market: Math.max(0.01, Math.min(0.99, price)),
      model: anchor ? anchor.p : null,
      modelSource: anchor ? "HURDAT2 climatology" : null,
      modelBasis: anchor ? anchor.basis : null,
      modelUncond: anchor ? anchor.unconditional : null,
      modelLayers: anchor ? anchor.layers : null,
      horizon: horizonOf(title), strike,
      liquidity, spread, volume, proxy: false, source: "kalshi",
      url: "https://kalshi.com/markets/" + (pair.eventTicker || m.event_ticker || m.ticker),
      _catFour: /category\s*[45]|cat\s*[45]/i.test(title),
    });
  }
  // Highest-signal first: anchored contracts, then by volume.
  // Contracts tied to a CURRENTLY ACTIVE storm outrank everything — if telemetry is
  // tracking it, its market belongs on the board ahead of any seasonal ladder.
  // Then anchored, then real activity, then low strikes (deep OTM rungs last).
  contracts.sort((a, b) => (b.storm ? 1 : 0) - (a.storm ? 1 : 0)
    || (b.model != null) - (a.model != null)
    || (b.volume || 0) - (a.volume || 0)
    || (b.liquidity || 0) - (a.liquidity || 0)
    || (a.strike ?? 999) - (b.strike ?? 999));
  const anchored = contracts.filter((c) => c.model != null).length;
  return { ok: true, status: paged.status, source: "kalshi", count: contracts.length, contracts: contracts.slice(0, 44), diag: paged.tried,
           drops, samples, raw: paged.raw || null,
           note: `${contracts.length} hurricane markets (${anchored} anchored) from ${paged.scanned} ${paged.mode} · dropped ${drops.noKeyword}kw/${drops.sports}sport/${drops.noPrice}px` };
}

async function fetchPolymarket(storms, clim, oni) {
  const url = "https://gamma-api.polymarket.com/markets?closed=false&limit=500&order=volume&ascending=false";
  const r = await getJSON(url);
  if (!r.ok) return { ok: false, status: r.status, source: "polymarket", note: r.error, contracts: [] };
  const mkts = Array.isArray(r.json) ? r.json : (r.json.markets || r.json.data || []);
  const scanned = mkts.length;
  const contracts = [];
  for (const m of mkts) {
    const title = m.question || m.title || "";
    if (!HUR_RE.test(title) || NOT_WEATHER_RE.test(title)) continue;
    let price = null;
    try { const p = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices; if (Array.isArray(p) && p.length) price = Number(p[0]); } catch { /* skip */ }
    if (!Number.isFinite(price)) continue;
    const strike = parseStrike(title);
    const anchor = climatologyAnchor(title, strike, clim, null, oni);
    contracts.push({
      id: m.slug || m.conditionId || m.id, label: title, short: shortLabel(title, 46),
      storm: assocStorm(title, storms), market: Math.max(0.01, Math.min(0.99, price)),
      model: anchor ? anchor.p : null,
      modelSource: anchor ? "HURDAT2 climatology" : null,
      modelBasis: anchor ? anchor.basis : null,
      horizon: horizonOf(title), strike,
      liquidity: num(m.liquidityNum ?? m.liquidity), spread: 0.02,
      volume: num(m.volumeNum ?? m.volume) ?? 0, proxy: false, source: "polymarket",
      url: m.slug ? "https://polymarket.com/event/" + m.slug : "https://polymarket.com",
      _catFour: /category\s*[45]|cat\s*[45]/i.test(title),
    });
  }
  return { ok: true, status: r.status, source: "polymarket", count: contracts.length, contracts,
           note: `${contracts.length} hurricane markets from ${scanned} scanned` };
}

async function fetchKalshiOrderbook(ticker) {
  const url = `https://api.elections.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker)}/orderbook?depth=6`;
  const r = await getJSON(url);
  if (!r.ok || !r.json || !r.json.orderbook) return null;
  const ob = r.json.orderbook;
  // Kalshi yes-side book: [[price_cents, contracts], ...]. Bids = yes buyers; asks derived from no side (100 - price).
  const bids = (ob.yes || []).map(([p, q]) => [p / 100, q]).sort((a, b) => b[0] - a[0]).slice(0, 6);
  const asks = (ob.no || []).map(([p, q]) => [(100 - p) / 100, q]).sort((a, b) => a[0] - b[0]).slice(0, 6);
  if (!bids.length && !asks.length) return null;
  return { bids, asks };
}

/* ---------------- SST (best-effort, honest about baseline) ---------------- */
async function fetchSST(storms) {
  // We can read live SST from Open-Meteo Marine, but a true ANOMALY needs a
  // climatological baseline we do not have wired — so we do NOT publish a
  // fabricated anomaly. Report the feed honestly as not-wired.
  return { ok: false, source: "Open-Meteo Marine", note: "live SST available, but anomaly baseline not wired — omitted rather than fabricated", value: null };
}

/* ---------------- assemble ---------------- */
async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const { feed: nhcFeed, storms } = await fetchStorms();

  // Climatology baseline first — it supplies the fair-value anchor for seasonal contracts.
  const { feed: climFeed, clim } = await fetchClimatology();

  // ENSO phase (L3). Fetched before the markets so every anchor carries the same
  // stratification; a failure here degrades the stack to L1, it never blocks it.
  const { feed: ensoFeed, oni } = await fetchEnso();

  // markets: Kalshi first, fall back to Polymarket if Kalshi unreachable/empty.
  // BOTH attempts are recorded — a silent fallback previously hid a Kalshi failure
  // behind a healthy-looking Polymarket "0 markets".
  const kal = await fetchKalshi(storms, clim, oni);
  let poly = null;
  if (!kal.ok || kal.count === 0) poly = await fetchPolymarket(storms, clim, oni);
  let mkt = kal;
  if (poly && ((poly.ok && poly.count > 0) || (!kal.ok && poly.ok))) mkt = poly;
  const marketAttempts = [
    { source: "kalshi", ok: kal.ok, status: kal.status, count: kal.count || 0, note: kal.note, hosts: kal.diag || null, drops: kal.drops || null, samples: kal.samples || null, raw: kal.raw || null },
    poly ? { source: "polymarket", ok: poly.ok, status: poly.status, count: poly.count || 0, note: poly.note } : null,
  ].filter(Boolean);
  let contracts = mkt.contracts || [];

  // real order books for up to 4 Kalshi contracts (keeps API calls bounded)
  if (mkt.source === "kalshi") {
    const top = contracts.slice(0, 4);
    await Promise.all(top.map(async (c) => { const ob = await fetchKalshiOrderbook(c.id); if (ob) c.orderbook = ob; }));
  }

  // map a storm's Cat 4+ market price onto marketCat4 (for the headline stat)
  for (const s of storms) {
    const c4 = contracts.find((c) => c.storm === s.id && c._catFour);
    if (c4) s.marketCat4 = c4.market;
  }
  contracts.forEach((c) => { delete c._catFour; });

  const sst = await fetchSST(storms);

  // events: one per active advisory (real), pinned to now
  const events = storms.filter((s) => s.advNum).map((s) => ({
    tsZ: s.advTimeZ || nowIso, kind: "advisory",
    label: `${s.name} Advisory #${s.advNum} — ${s.full_cls}, ${s.wind ?? "?"} kt`,
    source: "NHC", tier: "A", hot: (s.wind ?? 0) >= 96,
  }));

  const feeds = {
    nhc: nhcFeed,
    markets: { ok: !!mkt.ok, status: mkt.status, source: mkt.source, count: mkt.count || 0, note: mkt.note, attempts: marketAttempts },
    sst: { ok: false, source: sst.source, note: sst.note },
    models: climFeed.ok
      ? Object.assign({}, climFeed, { note: climFeed.note + " — seasonal count contracts only; per-storm intensity has no fitted model" })
      : Object.assign({}, climFeed, { note: (climFeed.note || "unavailable") + " — no fair-value anchor; allocations stay deferred" }),
    climatology: climFeed.ok ? { ok: true, source: climFeed.source, file: clim.file, seasons: clim.years.length,
      hurricanesPerSeason: clim.hurricanes, majorPerSeason: clim.major, years: clim.years } : { ok: false, note: climFeed.note },
    satellite: { ok: true, source: "NASA GIBS VIIRS/NOAA-20", note: "probed live in the browser" },
    enso: ensoFeed,
  };

  const latest = {
    schema: "millibar-terminal/1", generatedAt: nowIso, stepMin: STEP_MIN,
    note: storms.length ? null : "No active tropical cyclones — terminal is in awaiting-telemetry state (honest current condition, not an error).",
    feeds, storms, contracts, models: [], events, sstAnomalyC: null,
    enso: oni ? {
      ok: true, source: oni.source, phase: oni.phase, phaseLabel: PHASE_LABEL[oni.phase],
      anchorSeas: oni.anchorSeas, anchorYear: oni.anchorYear, anchorAnom: oni.anchorAnom,
      assumed: oni.assumed, ageMonths: oni.ageMonths, seasons: oni.seasons, recent: oni.recent,
    } : { ok: false, note: ensoFeed.note },
  };

  // append a frame to the rolling history
  let framesJson = { schema: "millibar-terminal-frames/1", stepMin: STEP_MIN, frames: [] };
  try { framesJson = JSON.parse(await readFile(resolve(DATA_DIR, "frames.json"), "utf8")); } catch { /* first run */ }
  if (!Array.isArray(framesJson.frames)) framesJson.frames = [];
  const frameStorms = {}, frameContracts = {};
  storms.forEach((s) => { frameStorms[s.id] = { wind: s.wind, pressure: s.pressure, center: s.center, modelCat4: s.modelCat4, marketCat4: s.marketCat4, reconAge: s.reconAge }; });
  contracts.forEach((c) => { frameContracts[c.id] = { market: c.market, model: c.model }; });
  framesJson.stepMin = FRAME_GAP_MIN;
  /* latest.json refreshes every tick, but the replay history does NOT need that
     granularity — appending a frame every tick would rewrite a ~400KB file six times
     an hour for no added information. Frames are spaced FRAME_GAP_MIN apart; the
     header freshness ("updated Nm ago") still tracks the tick, not the frame. */
  const lastFrameTs = framesJson.frames.length ? Date.parse(framesJson.frames[framesJson.frames.length - 1].tsZ) : 0;
  const sinceLastFrameMin = lastFrameTs ? (now.getTime() - lastFrameTs) / 60000 : Infinity;
  const appendFrame = sinceLastFrameMin >= FRAME_GAP_MIN * 0.9;
  if (appendFrame) {
    framesJson.frames.push({ tsZ: nowIso, storms: frameStorms, contracts: frameContracts });
    framesJson.frames = framesJson.frames.slice(-FRAME_KEEP);
  }

  await writeFile(resolve(DATA_DIR, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
  // Minified: pure machine history, re-written often enough that formatting costs real bytes.
  if (appendFrame) await writeFile(resolve(DATA_DIR, "frames.json"), JSON.stringify(framesJson) + "\n");

  console.log(`[millibar] refreshed ${nowIso}`);
  console.log(`  NHC: ${nhcFeed.ok ? "ok" : "FAIL"} (${nhcFeed.note})`);
  console.log(`  markets: ${feeds.markets.ok ? feeds.markets.source + " · " + feeds.markets.note : "FAIL — " + feeds.markets.note}`);
  for (const a of marketAttempts) {
    console.log(`    [${a.source}] ok=${a.ok} status=${a.status} → ${a.note}`);
    if (a.hosts) for (const h of a.hosts) console.log(`        ${h.host} status=${h.status} pages=${h.pages} scanned=${h.scanned}${h.error ? " err=" + h.error : ""}`);
  }
  console.log(`  climatology: ${climFeed.ok ? climFeed.source + " · " + clim.years.length + " seasons" : "FAIL — " + climFeed.note}`);
  console.log(`  ENSO: ${ensoFeed.ok ? ensoFeed.source + " · " + ensoFeed.note : "FAIL — " + ensoFeed.note}`);
  for (const a of (ensoFeed.attempts || [])) console.log(`    [${a.source}] ok=${a.ok} status=${a.status} → ${a.note}`);
  console.log(`  storms: ${storms.length} · contracts: ${contracts.length} (${contracts.filter((c) => c.model != null).length} anchored) · frames: ${framesJson.frames.length}${appendFrame ? " (+1)" : " (no append — " + Math.round(sinceLastFrameMin) + "m since last, gap is " + FRAME_GAP_MIN + "m)"}`);
  if (contracts.length) for (const c of contracts.slice(0, 8)) {
    console.log(`    · ${String(c.id).slice(0, 26).padEnd(26)} mkt ${Math.round(c.market * 100)}¢  model ${c.model != null ? Math.round(c.model * 100) + "%" : "—"}  ${c.horizon}`);
  }
}

// Run only when invoked directly, so the pure parsers/estimators above can be
// imported by tests without kicking off a live fetch.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { console.error("[millibar] fatal:", e); process.exit(1); });
}

export { parseOniAscii, parseOniPsl, buildOni, phaseOf, posteriorFor, parseHurdat2, seriesQuantity };
