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

function parseHurdat2(text, fromYear, excludeYear) {
  const byYear = new Map();
  let curId = null, curYear = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split(",");
    const head = /^AL\d{2}(\d{4})$/.exec((f[0] || "").trim());
    if (head && f.length <= 4) {
      curId = f[0].trim(); curYear = Number(head[1]);
      if (!byYear.has(curYear)) byYear.set(curYear, { hur: new Set(), maj: new Set() });
      continue;
    }
    if (!curId || curYear == null) continue;
    const status = (f[3] || "").trim();
    const wind = Number((f[6] || "").trim());
    if (status === "HU") {                       // hurricane-strength best-track point
      const y = byYear.get(curYear);
      y.hur.add(curId);
      if (Number.isFinite(wind) && wind >= 96) y.maj.add(curId); // Cat 3+ = major
    }
  }
  const years = [...byYear.keys()].filter((y) => y >= fromYear && y !== excludeYear).sort((a, b) => a - b);
  if (!years.length) return null;
  return {
    years, from: years[0], to: years[years.length - 1],
    hurricanes: years.map((y) => byYear.get(y).hur.size),
    major: years.map((y) => byYear.get(y).maj.size),
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

// Empirical P(count > strike) for Atlantic seasonal hurricane-count contracts.
function climatologyAnchor(title, strike, clim) {
  if (!clim || strike == null) return null;
  const t = String(title).toLowerCase();
  if (!/atlantic/.test(t) || !/hurricane/.test(t)) return null;
  if (!/how many|total|count/.test(t)) return null;
  const major = /\bmajor\b/.test(t);
  const counts = major ? clim.major : clim.hurricanes;
  if (!counts || !counts.length) return null;
  const hits = counts.filter((c) => c > strike).length;
  return {
    p: hits / counts.length,
    basis: `${clim.from}–${clim.to} ${major ? "major " : ""}Atlantic hurricane seasons (n=${counts.length}); ${hits} exceeded ${strike}`,
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
  const tickers = [...new Set(pairs.map((p) => p.m && p.m.ticker).filter(Boolean))];
  for (let i = 0; i < tickers.length && i < 600; i += 100) {
    const batch = tickers.slice(i, i + 100);
    const r = await getJSON(`${host}/markets?tickers=${encodeURIComponent(batch.join(","))}&limit=200`);
    const list = (r.json && r.json.markets) || [];
    for (const m of list) if (m && m.ticker) byTicker.set(m.ticker, m);
  }
  if (!byTicker.size) { // batch form unsupported — walk the distinct events instead
    const evts = [...new Set(pairs.map((p) => p.eventTicker).filter(Boolean))].slice(0, 40);
    for (const et of evts) {
      const r = await getJSON(`${host}/markets?event_ticker=${encodeURIComponent(et)}&limit=200`);
      const list = (r.json && r.json.markets) || [];
      for (const m of list) if (m && m.ticker) byTicker.set(m.ticker, m);
    }
  }
  let hydrated = 0;
  const out = pairs.map((p) => {
    const full = p.m && byTicker.get(p.m.ticker);
    if (full) { hydrated++; return Object.assign({}, p, { m: Object.assign({}, p.m, full) }); }
    return p;
  });
  return { pairs: out, hydrated };
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
    const evs = await fetchKalshiEventsForSeries(ser.host, ser.series);
    const out = [];
    for (const e of evs) {
      const title = e.title || e.sub_title || e.event_ticker || "";
      for (const m of (e.markets || [])) out.push({ m, title, eventTicker: e.event_ticker });
    }
    if (out.length) {
      const h = await hydrateKalshiPrices(ser.host, out);
      return { ok: true, status: ser.status, pairs: h.pairs, pages: ser.series.length,
        scanned: out.length, mode: `series(${ser.category}·${ser.series.length}·hyd${h.hydrated})`, tried: ser.tried };
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

async function fetchKalshi(storms, clim) {
  const paged = await collectKalshiMarkets();
  if (!paged.ok) return { ok: false, status: paged.status, source: "kalshi", note: paged.error, contracts: [], diag: paged.tried };
  const contracts = [];
  const drops = { noKeyword: 0, sports: 0, noPrice: 0 };
  const samples = [];
  for (const pair of paged.pairs) {
    const m = pair.m;
    const title = pair.title || m.title || m.ticker || "";
    const sub = m.yes_sub_title || m.subtitle || "";
    if (samples.length < 6) samples.push(`${title.slice(0, 44)} | ${sub.slice(0, 18)} | bid=${m.yes_bid} ask=${m.yes_ask} last=${m.last_price}`);
    if (!HUR_RE.test(title) && !HUR_RE.test(m.ticker || "")) { drops.noKeyword++; continue; }
    if (NOT_WEATHER_RE.test(title)) { drops.sports++; continue; } // sports teams named "Hurricanes"
    const bid = num(m.yes_bid), ask = num(m.yes_ask), last = num(m.last_price);
    // Prefer a live two-sided quote; fall back to last trade, then to any single side.
    let price = (bid != null && ask != null) ? (bid + ask) / 200
      : (last != null && last > 0) ? last / 100
      : (bid != null) ? bid / 100
      : (ask != null) ? ask / 100 : null;
    if (price == null) { drops.noPrice++; continue; }
    const spread = bid != null && ask != null ? (ask - bid) / 100 : 0.02;
    const liquidity = num(m.liquidity) != null ? Math.round(num(m.liquidity) / 100) : null; // cents → $
    const volume = num(m.dollar_volume) ?? num(m.volume) ?? 0;
    const strike = parseStrike(sub, m.yes_sub_title, m.subtitle);
    const anchor = climatologyAnchor(title, strike, clim);
    contracts.push({
      id: m.ticker, label: title, short: (sub ? title.replace(/\?$/, "") + " · " + sub : title).slice(0, 44),
      storm: assocStorm(title, storms), market: Math.max(0.01, Math.min(0.99, price)),
      model: anchor ? anchor.p : null,
      modelSource: anchor ? "HURDAT2 climatology" : null,
      modelBasis: anchor ? anchor.basis : null,
      horizon: horizonOf(title), strike,
      liquidity, spread, volume, proxy: false, source: "kalshi",
      url: "https://kalshi.com/markets/" + (pair.eventTicker || m.event_ticker || m.ticker),
      _catFour: /category\s*[45]|cat\s*[45]/i.test(title),
    });
  }
  // Highest-signal first: anchored contracts, then by volume.
  contracts.sort((a, b) => (b.model != null) - (a.model != null) || (b.volume || 0) - (a.volume || 0));
  const anchored = contracts.filter((c) => c.model != null).length;
  return { ok: true, status: paged.status, source: "kalshi", count: contracts.length, contracts, diag: paged.tried,
           drops, samples,
           note: `${contracts.length} hurricane markets (${anchored} anchored) from ${paged.scanned} ${paged.mode} · dropped ${drops.noKeyword}kw/${drops.sports}sport/${drops.noPrice}px` };
}

async function fetchPolymarket(storms, clim) {
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
    const anchor = climatologyAnchor(title, strike, clim);
    contracts.push({
      id: m.slug || m.conditionId || m.id, label: title, short: title.slice(0, 44),
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

  // markets: Kalshi first, fall back to Polymarket if Kalshi unreachable/empty.
  // BOTH attempts are recorded — a silent fallback previously hid a Kalshi failure
  // behind a healthy-looking Polymarket "0 markets".
  const kal = await fetchKalshi(storms, clim);
  let poly = null;
  if (!kal.ok || kal.count === 0) poly = await fetchPolymarket(storms, clim);
  let mkt = kal;
  if (poly && ((poly.ok && poly.count > 0) || (!kal.ok && poly.ok))) mkt = poly;
  const marketAttempts = [
    { source: "kalshi", ok: kal.ok, status: kal.status, count: kal.count || 0, note: kal.note, hosts: kal.diag || null, drops: kal.drops || null, samples: kal.samples || null },
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
  console.log(`  markets: ${feeds.markets.ok ? feeds.markets.source + " · " + feeds.markets.note : "FAIL — " + feeds.markets.note}`);
  for (const a of marketAttempts) {
    console.log(`    [${a.source}] ok=${a.ok} status=${a.status} → ${a.note}`);
    if (a.hosts) for (const h of a.hosts) console.log(`        ${h.host} status=${h.status} pages=${h.pages} scanned=${h.scanned}${h.error ? " err=" + h.error : ""}`);
  }
  console.log(`  climatology: ${climFeed.ok ? climFeed.source + " · " + clim.years.length + " seasons" : "FAIL — " + climFeed.note}`);
  console.log(`  storms: ${storms.length} · contracts: ${contracts.length} (${contracts.filter((c) => c.model != null).length} anchored) · frames: ${framesJson.frames.length}`);
  if (contracts.length) for (const c of contracts.slice(0, 8)) {
    console.log(`    · ${String(c.id).slice(0, 26).padEnd(26)} mkt ${Math.round(c.market * 100)}¢  model ${c.model != null ? Math.round(c.model * 100) + "%" : "—"}  ${c.horizon}`);
  }
}

main().catch((e) => { console.error("[millibar] fatal:", e); process.exit(1); });
