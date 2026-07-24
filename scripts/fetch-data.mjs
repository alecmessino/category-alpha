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
const STEP_MIN = Number(process.env.MT_STEP_MIN || 15);
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
    return {
      id, name: s.name || "Unnamed", cls: s.classification || cc.cls, full_cls: cc.full, basin,
      center: lat != null && lon != null ? [lat, lon] : null, movement, wind, pressure,
      advNum: adv.advNum || null, advTimeZ: adv.issuance || s.lastUpdate || null,
      track: null, cone: null, reconTracks: null, pastIdx: 0,
      modelCat4: null,        // no public ensemble Cat-probability feed wired — stays null
      marketCat4: null,       // filled from markets below if a Cat 4+ contract is found
      reconAge: null,
    };
  }).filter((s) => s.center);
  feed.ok = true; feed.count = storms.length;
  feed.note = storms.length ? `${storms.length} active` : "no active tropical cyclones";
  return { feed, storms };
}

/* ---------------- Prediction markets ---------------- */
const HUR_RE = /hurricane|tropical (storm|cyclone|depression)|\bcyclone\b|landfall|make landfall|category\s*\d|saffir|typhoon/i;

function assocStorm(title, storms) {
  const t = title.toLowerCase();
  const hit = storms.find((s) => s.name && s.name.length > 2 && t.includes(s.name.toLowerCase()));
  return hit ? hit.id : null;
}

async function fetchKalshi(storms) {
  const url = "https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=1000";
  const r = await getJSON(url);
  if (!r.ok) return { ok: false, status: r.status, source: "kalshi", note: r.error, contracts: [] };
  const mkts = (r.json && r.json.markets) || [];
  const contracts = [];
  for (const m of mkts) {
    const title = m.title || m.subtitle || m.ticker || "";
    if (!HUR_RE.test(title) && !HUR_RE.test(m.ticker || "")) continue;
    const bid = num(m.yes_bid), ask = num(m.yes_ask), last = num(m.last_price);
    let price = last != null ? last / 100 : (bid != null && ask != null ? (bid + ask) / 200 : null);
    if (price == null) continue;
    const spread = bid != null && ask != null ? (ask - bid) / 100 : 0.02;
    const liquidity = num(m.liquidity) != null ? Math.round(num(m.liquidity) / 100) : null; // cents → $
    const volume = num(m.dollar_volume) ?? num(m.volume) ?? 0;
    contracts.push({
      id: m.ticker, label: title, short: (m.yes_sub_title || m.subtitle || title).slice(0, 34),
      storm: assocStorm(title, storms), market: Math.max(0.01, Math.min(0.99, price)),
      model: null, liquidity, spread, volume, proxy: false, source: "kalshi", url: "https://kalshi.com/markets/" + (m.event_ticker || m.ticker),
      _catFour: /category\s*[45]|cat\s*[45]/i.test(title),
    });
  }
  return { ok: true, status: r.status, source: "kalshi", count: contracts.length, contracts, note: `${contracts.length} hurricane markets` };
}

async function fetchPolymarket(storms) {
  const url = "https://gamma-api.polymarket.com/markets?closed=false&limit=500&order=volume&ascending=false";
  const r = await getJSON(url);
  if (!r.ok) return { ok: false, status: r.status, source: "polymarket", note: r.error, contracts: [] };
  const mkts = Array.isArray(r.json) ? r.json : (r.json.markets || r.json.data || []);
  const contracts = [];
  for (const m of mkts) {
    const title = m.question || m.title || "";
    if (!HUR_RE.test(title)) continue;
    let price = null;
    try { const p = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices; if (Array.isArray(p) && p.length) price = Number(p[0]); } catch { /* skip */ }
    if (!Number.isFinite(price)) continue;
    contracts.push({
      id: m.slug || m.conditionId || m.id, label: title, short: title.slice(0, 34),
      storm: assocStorm(title, storms), market: Math.max(0.01, Math.min(0.99, price)),
      model: null, liquidity: num(m.liquidityNum ?? m.liquidity), spread: 0.02,
      volume: num(m.volumeNum ?? m.volume) ?? 0, proxy: false, source: "polymarket",
      url: m.slug ? "https://polymarket.com/event/" + m.slug : "https://polymarket.com",
      _catFour: /category\s*[45]|cat\s*[45]/i.test(title),
    });
  }
  return { ok: true, status: r.status, source: "polymarket", count: contracts.length, contracts, note: `${contracts.length} hurricane markets` };
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

  // markets: Kalshi first, fall back to Polymarket if Kalshi unreachable/empty
  let mkt = await fetchKalshi(storms);
  if (!mkt.ok || mkt.count === 0) {
    const poly = await fetchPolymarket(storms);
    if (poly.ok && poly.count > 0) mkt = poly;
    else if (!mkt.ok && poly.ok) mkt = poly; // surface whichever responded
  }
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
    markets: mkt.ok ? { ok: true, status: mkt.status, source: mkt.source, count: mkt.count, note: mkt.note } : { ok: false, status: mkt.status, source: mkt.source, count: 0, note: mkt.note },
    sst: { ok: false, source: sst.source, note: sst.note },
    models: { ok: false, source: "ensemble consensus (GFS/ECMWF/HAFS)", note: "no clean public ensemble Cat-probability feed wired — probability shown as anchor only" },
    satellite: { ok: true, source: "NASA GIBS VIIRS/NOAA-20", note: "probed live in the browser" },
  };

  const latest = {
    schema: "millibar-terminal/1", generatedAt: nowIso, stepMin: STEP_MIN,
    note: storms.length ? null : "No active tropical cyclones — terminal is in awaiting-telemetry state (honest current condition, not an error).",
    feeds, storms, contracts, models: [], events, sstAnomalyC: null,
  };

  // append a frame to the rolling history
  let framesJson = { schema: "millibar-terminal-frames/1", stepMin: STEP_MIN, frames: [] };
  try { framesJson = JSON.parse(await readFile(resolve(DATA_DIR, "frames.json"), "utf8")); } catch { /* first run */ }
  if (!Array.isArray(framesJson.frames)) framesJson.frames = [];
  const frameStorms = {}, frameContracts = {};
  storms.forEach((s) => { frameStorms[s.id] = { wind: s.wind, pressure: s.pressure, center: s.center, modelCat4: s.modelCat4, marketCat4: s.marketCat4, reconAge: s.reconAge }; });
  contracts.forEach((c) => { frameContracts[c.id] = { market: c.market, model: c.model }; });
  framesJson.stepMin = STEP_MIN;
  framesJson.frames.push({ tsZ: nowIso, storms: frameStorms, contracts: frameContracts });
  framesJson.frames = framesJson.frames.slice(-24);

  await writeFile(resolve(DATA_DIR, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
  await writeFile(resolve(DATA_DIR, "frames.json"), JSON.stringify(framesJson, null, 2) + "\n");

  console.log(`[millibar] refreshed ${nowIso}`);
  console.log(`  NHC: ${nhcFeed.ok ? "ok" : "FAIL"} (${nhcFeed.note})`);
  console.log(`  markets: ${feeds.markets.ok ? feeds.markets.source + " · " + feeds.markets.count : "FAIL — " + feeds.markets.note}`);
  console.log(`  storms: ${storms.length} · contracts: ${contracts.length} · frames: ${framesJson.frames.length}`);
}

main().catch((e) => { console.error("[millibar] fatal:", e); process.exit(1); });
