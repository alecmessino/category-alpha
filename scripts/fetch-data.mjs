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
/* The four pre-advisory feeds and the engine that combines them. The fetching lives in
   ingest.mjs and the arithmetic in lib/probability.mjs, so both can be exercised without
   this file's live pulls — and so the guidance-envelope tilt below stays the single
   implementation of itself. */
import { ingestIntel, arrivalEvents } from "./ingest.mjs";
import { calibratedIntensityP, evidenceQuality } from "./lib/probability.mjs";
import { riFloorFor } from "./lib/ships.mjs";
import { parseOutlookShapes, attachShapes } from "./lib/shapefile.mjs";
/* Moved to lib so the backtest replays the same estimator the board trades. Pure move,
   proven by scripts/verify-extraction.mjs. */
import { INTENSITY_MAE, HURRICANE_REPORTED_KT, KT_INCREMENT, LATENT_THRESHOLD,
         SIGMA_BAND, GUIDANCE_TILT, GUIDANCE_SIGN, maeAt, normCdf,
         reachesHurricaneP } from "./lib/estimator-core.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dir, "../docs/data");
const STEP_MIN = Number(process.env.MT_STEP_MIN || 10);
const FRAME_GAP_MIN = Number(process.env.MT_FRAME_GAP_MIN || 20);  // replay-history granularity
const FRAME_KEEP = Number(process.env.MT_FRAME_KEEP || 96);        // 96 x 20min = 32h of real history
const MAX_CONTRACTS = Number(process.env.MT_MAX_CONTRACTS || 300); // runaway guard only — never a silent trim
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

async function getBuffer(url, { timeout = 30000 } = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "*/*" }, signal: ctrl.signal });
    const latencyMs = Date.now() - t0;
    if (!res.ok) return { ok: false, status: res.status, latencyMs, error: "HTTP " + res.status };
    return { ok: true, status: res.status, latencyMs, buf: Buffer.from(await res.arrayBuffer()) };
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
    /* movementSpeed is mph in this feed; intensity is kt. Do not relabel either. */
    const movement = dir != null && spd != null ? `${compass(dir)} ${spd} mph` : "—";
    const basin = /^(AL|AT)/i.test(id) ? "east" : /^(EP|CP)/i.test(id) ? "west" : (lon != null && lon < -100 ? "west" : "east");
    const adv = s.publicAdvisory || {};
    const fcst = s.forecastAdvisory || {};
    const disc = s.forecastDiscussion || {};
    return {
      id, name: s.name || "Unnamed", cls: s.classification || cc.cls, full_cls: cc.full, basin,
      center: lat != null && lon != null ? [lat, lon] : null, movement, wind, pressure,
      advNum: adv.advNum || null, advTimeZ: adv.issuance || s.lastUpdate || null,
      _fcstUrl: fcst.url || (typeof fcst === "string" ? fcst : null),
      _advUrl: adv.url || (typeof adv === "string" ? adv : null),
      _discUrl: disc.url || (typeof disc === "string" ? disc : null),
      watches: null, forecastKt: null, hurricaneP: null, advisoryLagMin: null, discussion: null,
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
    /* The intensity forecast was already being downloaded and thrown away — the MAX WIND
       lines sit directly under the positions this parser has always read. */
    const kts = (f.trackPoints || []).filter((p) => Number.isFinite(p.kt));
    s.forecastKt = kts.length ? kts.map((p) => ({ hr: p.hr, kt: p.kt, gustKt: p.gustKt ?? null })) : null;
    /* The discussion is fetched BEFORE the anchor is computed. It used to be read after,
       which meant the guidance position always described the PREVIOUS advisory by the time
       anything used it — a caveat one cycle behind the number it qualifies. */
    if (s._discUrl) {
      const d2 = await getText(s._discUrl);
      if (d2.ok) {
        try { s.discussion = parseDiscussion(d2.text, now.getTime()); }
        catch (e) { s.discussion = null; }
      }
    }
    const gI = s.discussion && s.discussion.guidance && s.discussion.guidance.intensity;
    s.hurricaneP = reachesHurricaneP(f.trackPoints || [], null, gI || null);

    /* The Public Advisory, for watches and warnings. A Hurricane Watch is a discrete
       official act and the sharpest single line in the product; nothing here read it. */
    if (s._advUrl) {
      const a2 = await getText(s._advUrl);
      if (a2.ok) {
        s.watches = parseWatchesWarnings(a2.text);
        /* Ingestion lag, MEASURED rather than asserted. The WMO header carries the exact
           minute the product left Miami or Honolulu — "WTPA32 PHFO 132343" is day 13,
           23:43 UTC. Comparing that with this cycle's clock is the only honest answer to
           "how current is this", and it is published so nobody has to take a claim about
           polling speed on trust. */
        const wmo = /^\s*[A-Z]{4}\d{2}\s+[A-Z]{4}\s+(\d{2})(\d{2})(\d{2})\s*$/m.exec(a2.text);
        if (wmo) {
          const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(),
            Number(wmo[1]), Number(wmo[2]), Number(wmo[3])));
          if (d.getTime() - now.getTime() > 3 * 86400e3) d.setUTCMonth(d.getUTCMonth() - 1);
          s.advisoryIssuedZ = d.toISOString();
          s.advisoryLagMin = Math.round((now.getTime() - d.getTime()) / 60000);
        }
        const nA = /Advisory\s+Number\s+(\d+[A-Z]?)/i.exec(a2.text);
        if (nA) s.advNumFull = nA[1];                    // keeps the "6A" of an intermediate
      }
    }
    if (f.diag) s.forecastDiag = f.diag;
    fnotes.push(`${s.name}: ${f.note}`
      + (f.diag ? ` · NO INTENSITY PARSED (maxWind present=${f.diag.hasMaxWind}, count=${f.diag.maxWindCount})` : "")
      + (s.hurricaneP ? ` · P(hurricane) ${Math.round(s.hurricaneP.p * 100)}%` : "")
      + (s.watches && s.watches.highest ? ` · ${s.watches.highest}` : "")
      + (s.discussion && s.discussion.guidance ? ` · forecast ${s.discussion.guidance.position} guidance` : "")
      + (s.advisoryLagMin != null ? ` · advisory ${s.advisoryLagMin}m old` : ""));
    delete s._fcstUrl; delete s._advUrl; delete s._discUrl;
  }
  feed.forecast = fnotes.join(" | ");
  const lags = storms.map((s) => s.advisoryLagMin).filter((v) => v != null);
  if (lags.length) feed.advisoryLagMin = Math.max(...lags);
  return { feed, storms };
}

/* ---------------- NHC Tropical Weather Outlook (pre-genesis) ----------------
 * CurrentStorms.json lists only systems ALREADY classified as a depression or
 * stronger. It is silent on invests and areas of interest — so with three Atlantic
 * disturbances up, one of them at 80% over seven days, the terminal was reporting
 * "no active tropical cyclones" and meaning it literally while being blind to the
 * entire formation pipeline the count ladders are priced on.
 *
 * The TWO is the product that carries them, with NHC's own formation probabilities.
 * Those percentages are published forecasts, not our inference; we parse and attribute
 * them, and we do not convert them into anything else.
 */
/* Source list, corrected by evidence rather than by guessing again.
   Three rounds of evidence got us here. The tgftp raw paths 404 — that mirror is gone.
   The .shtml pages return 200, but a captured sample showed the anchor landing in ~35
   lines of site navigation, so scraping them is a bet on page furniture staying put.
   The NHC RSS feeds return 200 and carry the outlook, but as escaped markup inside a
   channel that also advertises "There are no tropical cyclones at this time" — a line
   about CLASSIFIED systems that says nothing about what is under watch.

   So the primary source is now the NWS product API, which serves the identical AWIPS
   product as a plain-text field in JSON. No markup, no navigation, no scraping. The two
   scrapes stay behind it as fallbacks: if the API changes shape, the board degrades to
   a page that has been serving this product for twenty years rather than to nothing. */
const TWO_SOURCES = [
  { basin: "atlantic", name: "Atlantic TWO (NWS API)", kind: "nws", wmo: "ABNT20" },
  { basin: "atlantic", name: "Atlantic TWO (html)", url: "https://www.nhc.noaa.gov/text/MIATWOAT.shtml" },
  { basin: "atlantic", name: "Atlantic TWO (rss)", url: "https://www.nhc.noaa.gov/index-at.xml" },
  /* ABCP20 was here and is gone: the NHC-located TWO list carries ABNT20, ABPZ20/21 and
     the ACPN/ACCA collectives, never ABCP20 — the central Pacific outlook is issued by
     CPHC Honolulu, not Miami. It cost nothing, because the eastern Pacific product
     already carries the central Pacific areas (CP93 came through ABPZ20), but a source
     that cannot exist should not sit in the health panel as a standing failure. */
  { basin: "pacific",  name: "E/C Pacific TWO (NWS API)", kind: "nws", wmo: "ABPZ20" },
  { basin: "pacific",  name: "E/C Pacific TWO (html)", url: "https://www.nhc.noaa.gov/text/MIATWOEP.shtml" },
  { basin: "pacific",  name: "E/C Pacific TWO (rss)", url: "https://www.nhc.noaa.gov/index-ep.xml" },
];

/* The NWS product API is a two-step: list the issuances of a WMO collective, then fetch
   the newest one for its productText. Returns the same {ok,status,latencyMs,text} shape
   as getText so fetchOutlook does not have to care which kind of source it is holding. */
/* The list is fetched ONCE per process and shared. All three outlooks are issuances of
   the same product type — TWO — and are told apart by WMO collective, not by URL:
   ABNT20 Atlantic, ABPZ20 eastern Pacific, ABCP20 central Pacific. The first version of
   this put the collective in the type slot and got a 200 with an empty list, which is
   how a wrong URL looks on this API. */
let _twoList = null;
function nwsTwoList() {
  if (_twoList) return _twoList;
  _twoList = (async () => {
    const urls = [
      "https://api.weather.gov/products/types/TWO/locations/NHC",
      "https://api.weather.gov/products/types/TWO",
    ];
    let last = { ok: false, status: null, error: "not attempted" };
    for (const url of urls) {
      const r = await getJSON(url, { headers: { Accept: "application/ld+json" } });
      if (!r.ok) { last = { ok: false, status: r.status, error: r.error }; continue; }
      const items = (r.json && (r.json["@graph"] || r.json.graph)) || [];
      if (items.length) return { ok: true, status: r.status, items, url };
      last = { ok: false, status: r.status, error: "200 but no issuances listed at " + url };
    }
    return last;
  })();
  return _twoList;
}

async function fetchNwsProduct(wmo) {
  const t0 = Date.now();
  const list = await nwsTwoList();
  if (!list.ok) return { ok: false, status: list.status, latencyMs: Date.now() - t0, error: "list: " + (list.error || "?") };
  const mine = list.items.filter((it) => String(it.wmoCollectiveId || "").toUpperCase() === wmo);
  if (!mine.length) {
    const seen = [...new Set(list.items.map((it) => it.wmoCollectiveId).filter(Boolean))].join(",") || "none";
    return { ok: false, status: list.status, latencyMs: Date.now() - t0, error: `no ${wmo} issuance in the TWO list (collectives present: ${seen})` };
  }
  const newest = mine.slice().sort((a, b) => String(b.issuanceTime || "").localeCompare(String(a.issuanceTime || "")))[0];
  const href = newest["@id"] || newest.id;
  if (!href) return { ok: false, status: list.status, latencyMs: Date.now() - t0, error: "issuance carried no id" };
  const doc = await getJSON(href, { headers: { Accept: "application/ld+json" } });
  if (!doc.ok) return { ok: false, status: doc.status, latencyMs: Date.now() - t0, error: "product: " + (doc.error || "?") };
  const text = doc.json && doc.json.productText;
  if (!text) return { ok: false, status: doc.status, latencyMs: Date.now() - t0, error: "product carried no productText" };
  return { ok: true, status: doc.status, latencyMs: Date.now() - t0, text, issuanceTime: newest.issuanceTime || null };
}

/* &amp; is decoded LAST so "&amp;lt;" survives as "&lt;" rather than becoming a tag. */
function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")            // a non-breaking space after the colon defeats /:\s*$/
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(t) {
  /* Entities first, then line structure, then tags — in that order for two reasons.
     The RSS feeds carry the product as ESCAPED markup, so "&lt;br /&gt;" is only a line
     break after decoding. And the whole product is anchored on "^N. Title:" and
     "* Formation chance ...", so stripping tags before converting <br> and block closes
     collapses it into one line and every multiline anchor stops matching. That is why a
     200 response parsed to zero areas. */
  return decodeEntities(t)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|tr|li|h[1-6]|pre|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
}

/* The product is fixed-format text. Each area is "N. Title (ID):" followed by prose
   and two "* Formation chance through ..." lines. An area without an invest ID is
   normal and keeps id null rather than being skipped.

   The NUMBER is optional, and that is not defensiveness \u2014 it is measured. The raw
   product numbers its areas; the .shtml page marks them up as list items, so the "2."
   is a CSS marker rather than text and never reaches the parser. A captured diagnostic
   showed the formation lines present and headings visible to the split at zero, which
   is exactly that shape. Positional numbering is assigned here instead.

   Loosening the heading cannot invent areas: a candidate is only kept if it carries a
   published formation percentage, so a stray line ending in a colon is dropped a few
   lines later. The one line that would otherwise be tempting \u2014 "For the North
   Atlantic...Caribbean Sea and the Gulf of America:" \u2014 is excluded by name, because it
   precedes the first area and would otherwise adopt that area's percentages. */
const TWO_HEADING_SRC = "^[ \\t]*(?:(\\d+)\\.[ \\t]+)?([A-Za-z][^\\n:]{2,90}):[ \\t\\u00a0]*$";
/* Structural lines in the product also end in a colon and sit immediately above an area,
   so without this they adopt that area's percentages. "For the North Atlantic...:"
   introduces the basin; "Active Systems:" precedes the advisories note whenever a
   classified cyclone exists — and it was seen on the live board carrying a 90% formation
   chance that belonged to the area below it. They are excluded from being EMITTED as
   areas, not from splitting the text, so a real area beneath one still parses. */
const TWO_STRUCTURAL = /^(For the\b|Active Systems\b|Special Feature\b|Forecaster\b|Public Advisories\b|Tropical Weather Outlook\b)/i;
const isAreaHeading = (title) => !!title && !TWO_STRUCTURAL.test(String(title).trim());

function parseTWO(text, basin) {
  const t = stripHtml(text).replace(/\r/g, "");
  const issuedM = /^\s*(\d{3,4}\s+(?:AM|PM)\s+[A-Z]{2,4}\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})\s*$/m.exec(t);
  const areas = [];
  const parts = t.split(new RegExp(TWO_HEADING_SRC, "m"));
  for (let i = 1; i + 2 < parts.length + 1; i += 3) {
    const title = (parts[i + 1] || "").trim(), body = parts[i + 2] || "";
    const n = Number(parts[i]) || areas.length + 1;   // the page drops the number; keep the order
    if (!isAreaHeading(title)) continue;
    const pct = (re) => { const m = re.exec(body); return m ? Number(m[1]) : null; };
    const p48 = pct(/Formation chance through 48 hours[.\s]*\w+[.\s]*(\d+)\s*percent/i);
    const p7 = pct(/Formation chance through 7 days[.\s]*\w+[.\s]*(\d+)\s*percent/i);
    if (p48 == null && p7 == null) continue;          // not an outlook area
    const idM = /\(([A-Z]{2}\d{2})\)/.exec(title);
    areas.push({
      n, basin,
      id: idM ? idM[1] : null,
      title: title.replace(/\s*\([A-Z]{2}\d{2}\)\s*$/, "").trim(),
      pct48: p48, pct7d: p7,
      summary: body.split(/\n\s*\*/)[0].replace(/\s+/g, " ").trim().slice(0, 320),
    });
  }
  return { basin, issued: issuedM ? issuedM[1].replace(/\s+/g, " ") : null, areas };
}

/* Why a zero-area response was zero, answered in ONE cycle rather than three.
   The previous samples were guesses at where the product lived and both landed in site
   navigation. This does not guess: it reports whether the product's own marker phrases
   are present at all, how many headings the split regex can see, and — if the marker is
   there — the exact bytes around it with newlines and non-breaking spaces made visible.
   Either the text is absent (wrong source) or it is present and the window shows why the
   anchors failed. There is no third answer for this to be ambiguous about. */
function diagnoseTWO(raw) {
  const flat = stripHtml(raw);
  const vis = (s) => s.replace(/ /g, "␣").replace(/\n/g, " ⏎ ").replace(/[ \t]+/g, " ");
  const d = {
    bytes: String(raw || "").length,
    hasFormationChance: /Formation chance/i.test(flat),
    hasNotExpected: /not expected during the next\s*\d*\s*days?/i.test(flat),
    /* Counted with the parser's OWN heading pattern. A diagnostic that measures
       something the parser does not use is how the last three cycles were spent. */
    headingsVisibleToSplit: (flat.match(new RegExp(TWO_HEADING_SRC, "gm")) || [])
      .map((l) => l.trim().replace(/^\d+\.\s*/, "").replace(/:$/, ""))
      .filter(isAreaHeading).length,
  };
  const at = flat.search(/Formation chance/i);
  if (at > -1) d.window = vis(flat.slice(Math.max(0, at - 320), at + 200));
  else {
    // No marker at all: show what the document does carry near the outlook heading.
    const h = flat.search(/For the (North Atlantic|eastern and central North Pacific)/i);
    d.window = vis(flat.slice(h > -1 ? h : 0, (h > -1 ? h : 0) + 420));
  }
  return d;
}

async function fetchOutlook() {
  const out = { ok: false, source: "NHC Tropical Weather Outlook", areas: [], attempts: [] };
  const done = new Set();                       // first source to yield areas wins per basin
  for (const src of TWO_SOURCES) {
    if (done.has(src.basin)) continue;
    const r = src.kind === "nws" ? await fetchNwsProduct(src.wmo) : await getText(src.url);
    if (!r.ok) { out.attempts.push({ source: src.name, ok: false, status: r.status, note: r.error }); continue; }
    let parsed = null;
    try { parsed = parseTWO(r.text, src.basin); } catch (e) { parsed = null; }
    if (!parsed) { out.attempts.push({ source: src.name, ok: false, status: r.status, note: "parse failed" }); continue; }
    /* A fetch that succeeds and parses nothing is the case that has cost three cycles.
       A genuinely quiet basin also parses to zero, so the diagnostic is what separates
       "nothing to report" from "the parser is behind the product". */
    const quiet = /not expected during the next\s*\d*\s*days?/i.test(stripHtml(r.text));
    out.attempts.push({ source: src.name, ok: true, status: r.status, count: parsed.areas.length,
      note: parsed.areas.length + " area(s)" + (parsed.issued ? " · issued " + parsed.issued : ""),
      quietOrUnparsed: parsed.areas.length === 0
        ? (quiet ? "quiet basin — product says formation not expected"
                 : "NO AREAS PARSED and the product does not say 'not expected' — parser may be behind")
        : null,
      diag: parsed.areas.length === 0 ? diagnoseTWO(r.text) : null });
    if (parsed.areas.length) {
      done.add(src.basin);
      out.areas.push(...parsed.areas.map((a) => Object.assign(a, {
        issued: parsed.issued,
        url: src.url || `https://api.weather.gov/products/types/${src.wmo}/locations/NHC`,
      })));
    } else if (quiet) {
      done.add(src.basin);                      // genuinely quiet; do not try the fallback
    }
    out.status = r.status; out.latencyMs = r.latencyMs;
  }
  out.ok = out.attempts.some((a) => a.ok);
  out.count = out.areas.length;
  const atl = out.areas.filter((a) => a.basin === "atlantic");
  out.note = out.ok
    ? `${out.areas.length} area(s) under watch · ${atl.length} Atlantic` +
      (atl.length ? ` · highest 7-day ${Math.max(...atl.map((a) => a.pct7d ?? 0))}%` : "")
    : "no outlook product reachable";
  return out;
}

/* Geometry for the outlook areas. The text product gives a probability and a prose location
   but no coordinates, so until now the map could only list them. This is the same product
   drawn on NHC's own graphical outlook. Failure is not fatal: the areas keep their text
   entries and simply are not plotted. */
async function fetchOutlookShapes(textAreas) {
  const url = "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip";
  const r = await getBuffer(url);
  const feed = { ok: false, status: r.status, latencyMs: r.latencyMs, source: "NHC graphical TWO", count: 0 };
  if (!r.ok) return { areas: textAreas, feed: Object.assign(feed, { note: r.error || "unreachable" }) };
  let parsed;
  try { parsed = parseOutlookShapes(r.buf); }
  catch (e) { return { areas: textAreas, feed: Object.assign(feed, { note: "unparseable: " + (e && e.message) }) }; }
  if (!parsed.areas.length) return { areas: textAreas, feed: Object.assign(feed, { note: parsed.note }) };
  const j = attachShapes(textAreas, parsed.areas);
  feed.ok = true;
  feed.count = j.matched;
  feed.note = `${j.matched} of ${textAreas.length} area(s) with geometry` +
              (j.unmatched ? ` · ${j.unmatched} text-only` : "");
  return { areas: j.areas, feed };
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

/* The MAX WIND line sits directly beneath every position line in the TCM and was being
   thrown away — the single most valuable number in the whole product, discarded by a
   regex that stopped at the longitude. It is the official forecast intensity, published
   every six hours by the people who decide whether the storm IS a hurricane, and it is
   what makes a per-storm contract answerable at all.

   The INITIAL line is captured too, because the analysis intensity is the anchor the
   forecast departs from, and because a contract asking whether a storm EVER reaches
   hurricane strength has to know where it starts. */
/* Why an intensity did not parse, answered in ONE cycle. Shows the bytes around the
   first position line with whitespace made visible, plus whether the marker phrases are
   present at all — the same instrument that settled the outlook parser. */
function sampleTCM(raw) {
  const t = String(raw || "").replace(/\r/g, "");
  const at = t.search(/(CENTER\s+LOCATED|FORECAST\s+VALID|INITIAL)/i);
  const vis = (x) => x.replace(/\n/g, " \u23ce ").replace(/[ \t]{2,}/g, (m) => "\u00b7".repeat(Math.min(m.length, 6)));
  return {
    bytes: t.length,
    hasMaxWind: /MAX\s+WIND/i.test(t),
    hasForecastValid: /FORECAST\s+VALID/i.test(t),
    hasInitial: /^\s*INITIAL\s/mi.test(t),
    hasCenterLocated: /CENTER\s+LOCATED\s+NEAR/i.test(t),
    hasMaxSustained: /MAX\s+SUSTAINED\s+WINDS/i.test(t),
    maxWindCount: (t.match(/MAX\s+WIND/gi) || []).length,
    window: at > -1 ? vis(t.slice(at, at + 420)) : vis(t.slice(0, 420)),
  };
}

/* The current state of the storm, from the forecast advisory itself.
 *
 * There is no INITIAL line in this product. That was an assumption, it produced a null
 * hour-zero intensity on every storm, and the diagnostic that finally settled it captured
 * a window starting at "FORECAST VALID 15/0000Z" — the first thing in the file matching
 * either header, which means INITIAL is not in the file. The TCM states the current
 * position and intensity as two separate statements instead:
 *
 *   CENTER LOCATED NEAR 16.7N 149.5W AT 14/1500Z
 *   MAX SUSTAINED WINDS  50 KT WITH GUSTS TO  60 KT.
 *
 * Both are optional here. A product that words it differently yields null and the caller
 * falls back to CurrentStorms.json, labelled — it must never yield a guess. */
function parseAdvisoryNow(text) {
  const t = String(text || "").replace(/\r/g, "");
  const pos = /CENTER\s+LOCATED\s+NEAR\s+([\d.]+)\s*([NS])\s+([\d.]+)\s*([EW])\s+AT\s+(\d{2})\/(\d{2})(\d{2})Z/i.exec(t);
  if (!pos) return null;
  let lat = Number(pos[1]); if (/S/i.test(pos[2])) lat = -lat;
  let lon = Number(pos[3]); if (/W/i.test(pos[4])) lon = -lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const w = /MAX\s+SUSTAINED\s+WINDS\s+(\d+)\s*KT(?:[\s.]*WITH\s+GUSTS\s+TO\s+(\d+)\s*KT)?/i.exec(t);
  return {
    lat, lon,
    day: Number(pos[5]), hh: Number(pos[6]), mm: Number(pos[7]),
    kt: w ? Number(w[1]) : null,
    gustKt: w && w[2] != null ? Number(w[2]) : null,
  };
}

function parseForecastAdvisory(text, baseIso) {
  const pts = [];
  /* Position and intensity together. The MAX WIND line is optional so a product that
     omits it still yields a track rather than nothing; wind then stays null and every
     consumer treats it as absent instead of as zero. */
  /* Two layouts are in service and the INITIAL line usually uses the other one:

       INITIAL        14/1500Z 16.7N 149.5W    50 KT  60 MPH      <- intensity same line
       FORECAST VALID 15/0000Z 17.2N 151.2W
       MAX WIND  55 KT...GUSTS  65 KT.                            <- intensity next line

     Reading only the MAX WIND form left hr 0 with a null intensity on every storm while
     every forecast hour parsed fine — invisible, because the peak drives P(hurricane)
     and the peak is never at hour zero. Both forms are read; the MAX WIND line wins when
     both are present, since that is the one that carries gusts. */
  const re = new RegExp(
    "(INITIAL|FORECAST\\s+VALID|OUTLOOK\\s+VALID)\\s+(\\d{2})\\/(\\d{2})(\\d{2})Z\\s+([\\d.]+)\\s*([NS])\\s+([\\d.]+)\\s*([EW])" +
    "(?:[ \\t]+(\\d+)[ \\t]*KT)?" +
    "(?:[^\\n]*\\n\\s*MAX\\s+WIND\\s+(\\d+)\\s*KT(?:[.\\s]*GUSTS\\s+(\\d+)\\s*KT)?)?",
    "gi");
  const base = baseIso ? new Date(baseIso) : new Date();
  let m;
  while ((m = re.exec(text))) {
    let lat = Number(m[5]); if (/S/i.test(m[6])) lat = -lat;
    let lon = Number(m[7]); if (/W/i.test(m[8])) lon = -lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    // Valid times are day-of-month + HHMM; roll the month forward if it wrapped.
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), Number(m[2]), Number(m[3]), Number(m[4])));
    if (d.getTime() < base.getTime() - 3 * 3600e3) d.setUTCMonth(d.getUTCMonth() + 1);
    const hr = Math.round((d.getTime() - base.getTime()) / 3600e3);
    if (hr < 0 || hr > 168) continue;
    const ktRaw = m[10] != null ? m[10] : m[9];
    const kt = ktRaw != null ? Number(ktRaw) : null;
    pts.push({ lat, lon, hr, validZ: d.toISOString(),
      kt: Number.isFinite(kt) ? kt : null,
      gustKt: m[11] != null && Number.isFinite(Number(m[11])) ? Number(m[11]) : null,
      initial: /^INITIAL/i.test(m[1]),
      outlook: /^OUTLOOK/i.test(m[1]) });
  }
  return pts.sort((a, b) => a.hr - b.hr);
}

/* ---------------- Official-forecast intensity → P(reaches hurricane) ----------------
 * This is a DIFFERENT KIND of estimate from everything else on the board. The count
 * ladders are anchored on what happened in 35 seasons of HURDAT2. This is anchored on
 * what NHC says is going to happen to one storm in the next five days, widened by how
 * wrong NHC's intensity forecasts have historically been. It must never be presented as
 * the same sort of number, and it carries its own source string for that reason.
 *
 * NHC's published official-forecast mean absolute intensity errors, in knots, by lead
 * time. These are verification statistics from NHC's own forecast reports, not fitted
 * here. A normal with sigma = MAE * sqrt(pi/2) reproduces that MAE.
 *
 * THREE BIASES, ALL NAMED:
 *  - Normality. Intensity errors are right-skewed: rapid intensification is a fat tail
 *    that a normal does not have. For a threshold ABOVE the forecast this understates;
 *    below it, overstates. Stated rather than corrected, because correcting it would be
 *    fitting a skew nobody published.
 *  - Serial correlation. The contract needs 64 kt at ANY point, and errors at adjacent
 *    lead times are strongly correlated — nearly the same error all the way along. So
 *    the peak forecast is evaluated ONCE at its own lead time rather than treating each
 *    period as an independent try. Independent tries would be badly too high; one shot
 *    is mildly too low. The mildly-too-low direction is the one to be wrong in.
 *  - Analysis uncertainty. The current intensity is itself an estimate with roughly
 *    5 kt of uncertainty. It is folded in when the storm is ALREADY at or above the
 *    threshold, which is the only case where it decides the answer.
 */
const HURRICANE_KT = 64;
/* Best-track and advisory intensities are reported in 5-knot increments, so the values
   that exist are 55, 60, 65 — never 64. A storm is CALLED a hurricane when the reported
   number is 65, which means the latent wind only has to clear the midpoint between 60 and
   65. Testing against 64 asks for a value that can never be published and understates
   every one of these probabilities in the same direction. */

/* ---------------- Watches and warnings ----------------
 * A Hurricane Watch is a discrete, timestamped, official act — the sharpest single
 * signal in the product and the one nothing here was reading. It is not a forecast of
 * intensity; it is a statement that hurricane conditions are POSSIBLE somewhere specific
 * within about 48 hours, which is a different and more decision-relevant claim.
 */
function parseWatchesWarnings(text) {
  const t = String(text || "").replace(/\r/g, "");
  const block = /WATCHES AND WARNINGS\s*\n-+\n([\s\S]*?)(?:\n\s*\n\s*[A-Z][A-Z ]{6,}\n-+|$)/i.exec(t);
  if (!block) return null;
  const body = block[1];
  const changesM = /CHANGES WITH THIS ADVISORY:\s*\n+([\s\S]*?)(?:\n\s*SUMMARY OF WATCHES|$)/i.exec(body);
  const changes = changesM ? changesM[1].trim() : null;
  const inEffect = [];
  /* Walked line by line rather than matched as one block, because both shapes here are
     things a regex gets wrong in opposite directions:

       * Maui County, including the islands of Maui, Lanai, Molokai and
       Kahoolawe

     Bullets WRAP, so matching only lines that begin with "*" truncated that at the line
     break and dropped an island off a Tropical Storm Warning. Widening the match to "any
     non-empty line" then swallowed the REST OF THE PRODUCT — the separator lines in this
     product are a single space, not empty, so the greedy group ran straight through the
     next two "is in effect for..." headers and only the first group survived. Live data
     showed one area where there were four.

     A walk has neither failure: a header opens a group, a bullet adds an area, an
     unmarked line folds onto the area above it, and a blank-or-whitespace line closes
     the group. */
  let cur = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const head = /^(?:A|An)\s+(.+?)\s+is in effect for\.\.\.$/i.exec(line);
    if (head) { cur = { kind: head[1].trim(), areas: [] }; inEffect.push(cur); continue; }
    if (!cur) continue;
    if (!line) { cur = null; continue; }                        // whitespace-only ends it
    if (/^\*/.test(line)) cur.areas.push(line.replace(/^\*\s*/, "").trim());
    else if (cur.areas.length) cur.areas[cur.areas.length - 1] += " " + line;   // wrap
    else cur = null;                    // prose directly under a header: not an area list
  }
  for (let i = inEffect.length - 1; i >= 0; i--) if (!inEffect[i].areas.length) inEffect.splice(i, 1);
  const severity = (k) => (/Hurricane Warning/i.test(k) ? 4 : /Hurricane Watch/i.test(k) ? 3
    : /Tropical Storm Warning/i.test(k) ? 2 : /Tropical Storm Watch/i.test(k) ? 1 : 0);
  const top = inEffect.slice().sort((a, b) => severity(b.kind) - severity(a.kind))[0] || null;
  return {
    inEffect, changes: changes && !/^none\.?$/i.test(changes) ? changes : null,
    changed: !!(changes && !/^none\.?$/i.test(changes)),
    highest: top ? top.kind : null, highestRank: top ? severity(top.kind) : 0,
    /* Intermediate advisories run every 3 hours instead of 6 once any watch or warning
       is up, so this also tells the board how often the next product is coming. */
    intermediateCadence: inEffect.length > 0,
  };
}

/* ---------------- Tropical Cyclone Discussion ----------------
 * The richest product NHC issues and the one this board was throwing away. The public
 * advisory says WHAT the forecast is; the discussion says how much the forecaster
 * believes it, what observations it rests on, and — the line that actually matters here
 * — where the official forecast sits inside the guidance envelope.
 *
 * That last one is not a nicety. P(reaches hurricane) on this board is built ON the
 * official intensity forecast. When the forecaster writes that the forecast is "near the
 * upper end of the guidance envelope", every number derived from it inherits that tilt,
 * and an operator sizing a position off it should be told so.
 *
 * NOTHING here is scored. The discussion is prose written by a human, and turning prose
 * into a probability is exactly the kind of invention this project refuses. What is
 * extracted is a category plus the VERBATIM sentence it came from, so the classification
 * can be checked against the source in one glance. When no sentence matches, the field
 * is absent — never a default.
 */
/* Guidance phrasing, and the aspect it is about. The aspect matters more than the
   phrasing: the first version classified on phrasing alone and the sentence

     "The NHC TRACK forecast ... is based on a BLEND of the latest ... aids"

   set the guidance position to "with", when the sentence that actually bears on this
   board said the INTENSITY forecast "remains near the upper end of the guidance
   envelope". A confident category attached to the wrong sentence is worse than no
   category, so a sentence that does not name its aspect is not classified at all. */
const GUIDANCE_PHRASE = [
  { value: "above", re: /\b(?:upper end|high end|above|stronger than|higher than)\b/i },
  { value: "below", re: /\b(?:lower end|low end|below|weaker than)\b/i },
  { value: "with",  re: /\b(?:in line with|close to|near the middle of|follows|blend of)\b/i },
];
const GUIDANCE_ASPECT = [
  { key: "intensity", re: /\b(?:intensity|strength|wind speed)\b/i },
  { key: "track",     re: /\b(?:track|motion|position)\b/i },
];
const DISCUSSION_CUES = [
  { value: "aircraft",
    re: /[^.]*\b(?:reconnaissance|Air Force|dropsonde|aircraft)\b[^.]*\./i },
  { value: "scatterometer",
    re: /[^.]*\b(?:scatterometer|OSCAT|ASCAT|SAR)\b[^.]*\./i },
  { value: "strengthening",
    re: /[^.]*\b(?:strengthening|intensification) is (?:expected|forecast|anticipated)[^.]*\./i },
  { value: "weakening",
    re: /[^.]*\bweakening is (?:expected|forecast|anticipated)[^.]*\./i },
];

function parseDiscussion(text, nowMs) {
  const t = String(text || "").replace(/\r/g, "");
  if (!/\S/.test(t)) return null;
  const out = { forecaster: null, issuedZ: null, lagMin: null,
                guidance: { intensity: null, track: null }, cues: [] };

  const wmo = /^\s*[A-Z]{4}\d{2}\s+[A-Z]{4}\s+(\d{2})(\d{2})(\d{2})\s*$/m.exec(t);
  if (wmo) {
    const ref = new Date(nowMs);
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(),
      Number(wmo[1]), Number(wmo[2]), Number(wmo[3])));
    if (d.getTime() - ref.getTime() > 3 * 86400e3) d.setUTCMonth(d.getUTCMonth() - 1);
    out.issuedZ = d.toISOString();
    out.lagMin = Math.round((ref.getTime() - d.getTime()) / 60000);
  }
  const fc = /^\s*Forecaster\s+(.+?)\s*$/mi.exec(t);
  if (fc) out.forecaster = fc[1].trim();

  const clean = (x) => x.replace(/\s+/g, " ").trim();

  /* Sentence by sentence, so a match cannot span two of them and so the quote returned
     is the sentence the classification was actually made from. */
  for (const raw of t.split(/(?<=\.)\s+/)) {
    const sent = clean(raw);
    if (sent.length < 20 || sent.length > 400) continue;
    if (!/guidance|envelope|consensus|\baids?\b/i.test(sent)) continue;
    const aspect = GUIDANCE_ASPECT.find((a) => a.re.test(sent));
    const phrase = GUIDANCE_PHRASE.find((p) => p.re.test(sent));
    if (!aspect || !phrase) continue;                    // unclassifiable stays unclassified
    if (!out.guidance[aspect.key]) out.guidance[aspect.key] = { position: phrase.value, quote: sent };
  }

  const seen = new Set();
  for (const c of DISCUSSION_CUES) {
    const m = c.re.exec(t);
    if (!m) continue;
    const quote = clean(m[0]);
    if (quote.length > 400 || seen.has(quote)) continue;   // a runaway match is not a sentence
    seen.add(quote);
    out.cues.push({ value: c.value, quote });
  }
  const any = out.guidance.intensity || out.guidance.track || out.cues.length;
  if (!any) out.guidance = null;
  return (out.issuedZ || any) ? out : null;
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
  if (!pts.length) return { track: null, cone: null, note: "no FORECAST VALID lines parsed", diag: sampleTCM(r.text) };
  /* Positions parsed but no intensity: the MAX WIND line is there in every real product,
     so a miss means the shape is not what the regex expects. Capture the bytes around the
     first position rather than guessing at the format for a second cycle. */
  let kt = pts.filter((p) => Number.isFinite(p.kt));
  /* The hour-zero point used to be SYNTHESIZED from CurrentStorms.json and prepended
     unconditionally, so the product's own current state was invisible and hour-zero
     intensity was null on every storm.

     Prefer what the product says, in this order: an INITIAL line if it has one, then
     CENTER LOCATED NEAR + MAX SUSTAINED WINDS, then the feed position labelled with its
     source. The middle one is what this product actually uses; that was established by
     the diagnostic below rather than assumed, after assuming it once already. */
  let parsedInitial = pts.find((p) => p.hr === 0) || null;
  if (!parsedInitial || !Number.isFinite(parsedInitial.kt)) {
    const nowPt = parseAdvisoryNow(r.text);
    if (nowPt) {
      const base = storm.advTimeZ ? new Date(storm.advTimeZ) : new Date();
      const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), nowPt.day, nowPt.hh, nowPt.mm));
      if (d.getTime() - base.getTime() > 3 * 86400e3) d.setUTCMonth(d.getUTCMonth() - 1);
      const p0 = { lat: nowPt.lat, lon: nowPt.lon, hr: 0, validZ: d.toISOString(),
                   kt: nowPt.kt, gustKt: nowPt.gustKt, initial: true, ktFrom: "forecast advisory" };
      if (parsedInitial) pts[pts.indexOf(parsedInitial)] = p0; else pts.unshift(p0);
      parsedInitial = p0;
    }
  }
  /* Recomputed AFTER the recovery above, so the diagnostic describes the state that
     actually shipped rather than the state before the fallback ran. It fires on "forecast
     hours have intensities but hour zero does not", which is precisely the condition that
     went unnoticed, and it reports which of the three layouts the product contains. */
  kt = pts.filter((p) => Number.isFinite(p.kt));
  const diag = kt.length ? (parsedInitial && Number.isFinite(parsedInitial.kt) ? null
    : { reason: "no hour-zero intensity", ...sampleTCM(r.text) })
    : sampleTCM(r.text);
  /* When the product's INITIAL line gives a position but no intensity, the current wind
     is taken from CurrentStorms.json. That is not a substitute number — it is the SAME
     advisory's intensity, published by the same centre in the sibling product — but the
     point records where it came from so the two sources never blur together. */
  const withNow = parsedInitial
    ? pts.map((p) => (p.hr === 0 && !Number.isFinite(p.kt) && Number.isFinite(storm.wind)
        ? { ...p, kt: storm.wind, ktFrom: "CurrentStorms.json" } : p))
    : [{ lat: storm.center[0], lon: storm.center[1], hr: 0, kt: storm.wind ?? null,
         ktFrom: Number.isFinite(storm.wind) ? "CurrentStorms.json" : null, initial: false }, ...pts];
  return {
    diag,
    track: withNow.map((p) => [p.lat, p.lon]),
    trackPoints: withNow.map((p) => ({ at: [p.lat, p.lon], hr: p.hr, validZ: p.validZ || storm.advTimeZ,
      kt: p.kt ?? null, gustKt: p.gustKt ?? null, ktFrom: p.ktFrom || null })),
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

/* `basins` selects which storm-ID prefixes count toward the totals. HURDAT2 ships two
   files: the Atlantic archive (AL ids) and the northeast/north-central Pacific archive,
   which carries BOTH eastern-Pacific (EP) and central-Pacific (CP) ids in one file. So
   the eastern and central Pacific climatologies come from one fetch, split by prefix —
   which is also exactly how NHC draws the 140°W boundary between those two basins.

   Defaults to Atlantic so existing callers are unchanged. */
function parseHurdat2(text, fromYear, excludeYear, basins = ["AL"], lonBox = null) {
  const want = new Set(basins.map((b) => String(b).toUpperCase()));
  const byYear = new Map();
  /* Every season the FILE covers, regardless of which basin the storm belongs to.
     A central-Pacific season with no CP storms is a genuine zero and has to stay in the
     sample — dropping it would silently delete the quietest seasons and bias every
     central-Pacific probability upward. Seeding the year from any header in the file is
     what keeps those zeros. */
  const seedYear = (y) => { if (!byYear.has(y)) byYear.set(y, { ts: new Map(), hur: new Map(), maj: new Map(), box: new Set() }); };
  let curId = null, curYear = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split(",");
    const head = /^(AL|EP|CP)(\d{2})(\d{4})$/.exec((f[0] || "").trim());
    if (head && f.length <= 4) {
      seedYear(Number(head[3]));
      if (!want.has(head[1])) { curId = null; curYear = null; continue; }  // other basin, same file
      curId = f[0].trim(); curYear = Number(head[3]);
      continue;
    }
    if (!curId || curYear == null) continue;
    const status = (f[3] || "").trim();
    const wind = Number((f[6] || "").trim());
    const doyTs = doyOf(f[0]);
    /* Basin membership by TRACK, not by identifier. HURDAT2 numbers a storm for where it
       formed, so a system that develops east of 140W and crosses into the central Pacific
       keeps its EP id for life — while CPHC, and the market's resolution source, count it
       as a central Pacific storm. Counting on the prefix alone therefore undercounts the
       basin by exactly the crossovers, which in a strong El Nino is not a small number. */
    if (lonBox) {
      const lon = parseLon(f[5]);
      if (lon != null && lon >= lonBox[0] && lon <= lonBox[1]) byYear.get(curYear).box.add(curId);
    }
    /* Named storms — tropical/subtropical systems that reached 34 kt. The board
       carries eight KXTROPSTORM rungs that had NO anchor at all, because this
       parser only ever counted hurricanes. "More than 15 Atlantic named storms"
       is a different base rate from "more than 15 Atlantic hurricanes", and
       anchoring one with the other is the mis-classification we already fixed
       once on the ticker side. */
    if ((status === "TS" || status === "HU" || status === "SS") && Number.isFinite(wind) && wind >= 34) {
      const y = byYear.get(curYear);
      if (!y.ts.has(curId)) y.ts.set(curId, doyTs);
    }
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
  /* When a longitude box is in force, only storms that actually entered it count. */
  const inBox = (y, id) => !lonBox || byYear.get(y).box.has(id);
  const sized = (y, which) => [...byYear.get(y)[which].keys()].filter((id) => inBox(y, id)).length;
  const after = (y, which, doy) => [...byYear.get(y)[which].entries()]
    .filter(([id, d]) => d != null && d >= doy && inBox(y, id)).length;
  /* Each season's named storms in FORMATION ORDER, with what each went on to become.
     This is what makes the per-name markets answerable: a name is the k-th slot on an
     ordered list, so "will Dolly be a hurricane" is "did the 4th named storm of the
     season reach hurricane strength" — a question this sequence answers by counting,
     with no independence assumption between formation and intensification. */
  const seasonNamed = years.map((y) => {
    const Y = byYear.get(y);
    return [...Y.ts.entries()]
      .filter(([id]) => inBox(y, id))
      .map(([id, doy]) => ({ doy, hu: Y.hur.has(id), maj: Y.maj.has(id) }))
      .filter((s) => s.doy != null)
      .sort((a, b) => a.doy - b.doy);
  });
  return {
    years, from: years[0], to: years[years.length - 1], seasonNamed,
    namedstorms: years.map((y) => sized(y, "ts")),
    hurricanes: years.map((y) => sized(y, "hur")),
    major: years.map((y) => sized(y, "maj")),
    // Seasonal formation dates retained so we can ask: in each past season, how many
    // hurricanes had NOT yet formed by this calendar date?
    namedstormsAfter: (doy) => years.map((y) => after(y, "ts", doy)),
    hurricanesAfter: (doy) => years.map((y) => after(y, "hur", doy)),
    majorAfter: (doy) => years.map((y) => after(y, "maj", doy)),
  };
}

/* Two archives, three basins. The Atlantic file is AL only; the northeast/north-central
   Pacific file carries EP and CP ids together, which is the same 140°W split Kalshi uses
   to separate its "Eastern Pacific" and "Central Pacific" ladders.
   Both filenames carry a revision date that changes yearly, so they are discovered from
   the directory index rather than hardcoded into a URL that will rot. */
const CLIM_ARCHIVES = [
  { key: "atlantic", file: /hurdat2-1851-\d{4}-\d+\.txt/g, basins: ["AL"], label: "Atlantic" },
  { key: "epac", file: /hurdat2-nepac-\d{4}-\d{4}-\d+\.txt/g, basins: ["EP"], label: "eastern Pacific" },
  /* Both prefixes, filtered to the 140W-180 box: the central Pacific basin as CPHC
     defines it, which includes systems that formed to the east and crossed in. */
  { key: "cpac", file: /hurdat2-nepac-\d{4}-\d{4}-\d+\.txt/g, basins: ["CP", "EP"], lonBox: [-180, -140], label: "central Pacific" },
];

async function fetchClimatology() {
  const base = "https://www.nhc.noaa.gov/data/hurdat/";
  const idx = await getText(base);
  const texts = new Map();                       // one fetch per FILE, reused across basins
  const clims = {};
  const notes = [];

  for (const a of CLIM_ARCHIVES) {
    const names = idx.ok
      ? [...new Set([...idx.text.matchAll(a.file)].map((m) => m[0]))].sort().reverse()
      : [];
    if (!names.length) { notes.push(`${a.key}: no archive matching ${a.file.source} in the index`); continue; }
    const name = names[0];
    if (!texts.has(name)) {
      const r = await getText(base + name);
      texts.set(name, r.ok ? r : null);
      if (!r.ok) notes.push(`${a.key}: ${name} ${r.error}`);
    }
    const r = texts.get(name);
    if (!r) continue;
    const c = parseHurdat2(r.text, CLIM_FROM_YEAR, now.getUTCFullYear(), a.basins, a.lonBox || null);
    if (!c) { notes.push(`${a.key}: parsed 0 seasons from ${name}`); continue; }
    clims[a.key] = Object.assign(c, { file: name, basin: a.key, label: a.label });
  }

  const got = Object.keys(clims);
  if (!got.length) {
    return { feed: { ok: false, source: "HURDAT2 (NOAA/NHC)", status: idx.status || null,
                     note: "no climatology parsed · " + (notes.join(" · ") || idx.error || "index unreachable") },
             clim: null, clims: {} };
  }
  const atl = clims.atlantic || null;
  return {
    feed: {
      ok: true, status: idx.status, source: `HURDAT2 ${(atl || clims[got[0]]).from}–${(atl || clims[got[0]]).to}`,
      count: got.reduce((n, k) => n + clims[k].years.length, 0),
      note: got.map((k) => `${clims[k].label} ${clims[k].years.length}`).join(" · ") +
            " seasons (baseline, not a skill forecast)" + (notes.length ? " · unavailable: " + notes.join(" · ") : ""),
      basins: got, missing: notes,
    },
    clim: atl,                                   // the Atlantic stays the default clim
    clims,
  };
}

/* ---------------- Season-to-date (the L2 layer) ----------------
 * The posterior stack has always had an L2 slot and never a feed for it, so every
 * seasonal probability was computed as if the season had not started. In August that
 * is a large error in a known direction: "more than 5 hurricanes" is a very different
 * bet when four have already formed.
 *
 * HURDAT2 is not the source — it is a post-season archive and does not carry the
 * current year at all. ATCF b-decks are: NHC writes one best-track file per numbered
 * system, in season, at bal/bep/bcpNN<year>.dat. Counting them gives the in-season
 * total for all three basins from a single directory listing.
 *
 * The thresholds here are deliberately IDENTICAL to parseHurdat2's — 34 kt with a
 * TS/HU/SS status for a named storm, HU status for a hurricane, 96 kt for a major.
 * An L2 count measured differently from the climatology it is subtracted from would
 * be worse than no L2 at all.
 */
const STD_MAX_FILES = Number(process.env.MT_STD_MAX || 80);
const STD_CONCURRENCY = 6;

function parseBdeck(text) {
  let vmax = 0, named = false, hurricane = false, major = false, enteredCpac = false;
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split(",").map((x) => x.trim());
    if (f.length < 11) continue;
    const w = Number(f[8]);
    const status = (f[10] || "").toUpperCase();
    /* Longitude, so the in-season count uses the same basin rule as the climatology it
       is subtracted from. The climatology counts the central Pacific by track through
       140W-180; counting the season to date by filename instead would miss exactly the
       storms that formed east and crossed in, and every central Pacific probability
       would come out too high. B-decks give tenths of a degree, hemisphere-suffixed. */
    const lonM = /^(\d+)([EW])$/.exec(f[7] || "");
    if (lonM) {
      const lon = (Number(lonM[1]) / 10) * (lonM[2] === "W" ? -1 : 1);
      if (lon >= -180 && lon <= -140) enteredCpac = true;
    }
    if (!Number.isFinite(w)) continue;
    if (w > vmax) vmax = w;
    if ((status === "TS" || status === "HU" || status === "SS") && w >= 34) named = true;
    if (status === "HU") { hurricane = true; if (w >= 96) major = true; }
  }
  return { vmax, named, hurricane, major, enteredCpac };
}

const STD_BASIN = { al: "atlantic", ep: "epac", cp: "cpac" };

async function fetchSeasonToDate(year) {
  const base = "https://ftp.nhc.noaa.gov/atcf/btk/";
  const idx = await getText(base);
  if (!idx.ok) {
    return { ok: false, source: "NHC ATCF b-decks", status: idx.status, note: "directory unreachable: " + idx.error, counts: null };
  }
  const re = new RegExp(`b(al|ep|cp)(\\d{2})${year}\\.dat`, "gi");
  const files = [...new Set([...idx.text.matchAll(re)].map((m) => m[0].toLowerCase()))].sort();
  if (!files.length) {
    /* A season with no systems yet is a real state, not a failure — but so is a
       renamed directory. They are distinguished by the listing having parsed at all. */
    return { ok: true, source: "NHC ATCF b-decks", status: idx.status, files: 0,
             counts: { atlantic: zeroStd(), epac: zeroStd(), cpac: zeroStd() },
             note: `no ${year} b-decks listed yet — every basin counted as zero so far` };
  }
  const take = files.slice(0, STD_MAX_FILES);
  const counts = { atlantic: zeroStd(), epac: zeroStd(), cpac: zeroStd() };
  const failed = [];
  for (let i = 0; i < take.length; i += STD_CONCURRENCY) {
    const batch = take.slice(i, i + STD_CONCURRENCY);
    const got = await Promise.all(batch.map((f) => getText(base + f, { timeout: 15000 })));
    got.forEach((r, k) => {
      const f = batch[k];
      if (!r.ok) { failed.push(f); return; }
      const basin = STD_BASIN[f.slice(1, 3)];
      const b = parseBdeck(r.text);
      /* A storm can count in two basins, exactly as the climatology counts it: the
         eastern Pacific by where it formed, the central Pacific by whether it got there. */
      const into = [basin];
      if (basin === "epac" && b.enteredCpac) into.push("cpac");
      for (const key of into) {
        const c = counts[key];
        if (!c) continue;
        c.systems++;
        if (b.named) c.namedstorms++;
        if (b.hurricane) c.hurricanes++;
        if (b.major) c.major++;
        if (b.vmax > c.peakKt) c.peakKt = b.vmax;
      }
    });
  }
  /* A partial read would UNDERCOUNT, and an undercount silently inflates every
     "more than N" probability. Refuse rather than publish a number we know is short. */
  if (failed.length) {
    return { ok: false, source: "NHC ATCF b-decks", status: idx.status, files: files.length,
             note: `${failed.length}/${take.length} b-decks unreadable (${failed.slice(0, 4).join(", ")}) — a partial count would undercount the season, so none is published`,
             counts: null };
  }
  const summary = Object.entries(counts)
    .map(([b, c]) => `${BASIN_LABEL[b] || b} ${c.namedstorms}/${c.hurricanes}/${c.major}`).join(" · ");
  return {
    ok: true, source: "NHC ATCF b-decks", status: idx.status, files: files.length,
    truncated: files.length > take.length ? files.length - take.length : 0,
    counts, note: `${year} season to date (named/hurricanes/major): ${summary}`,
  };
}

function zeroStd() { return { systems: 0, namedstorms: 0, hurricanes: 0, major: 0, peakKt: 0 }; }

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

/* Every empirical frequency on this board goes through here.
 *
 * A raw hits/n publishes 0.0000 for anything that has not happened in the sample, and
 * the central Pacific major-hurricane ladders are full of those — no season in the
 * record exceeded the strike. Against a market quoting 2c that reads as a riskless bet
 * with the whole resting size behind it, and it would have ranked at the top of the edge
 * book. "Never observed in 33 seasons" is not "impossible", and the difference is the
 * difference between a good bet and a fabricated one.
 *
 * Jeffreys — Beta(1/2, 1/2), the reference prior for a binomial rate — is the smallest
 * honest correction: 0 of 33 becomes 1.5%, 33 of 33 becomes 98.5%, and anything with
 * real support in the sample is barely moved. It is applied at every layer so the stack
 * cannot disagree with itself.
 */
function jeffreys(hits, n) { return n > 0 ? (hits + 0.5) / (n + 1) : null; }

/* ---------------- ONI similarity weighting (L4) ----------------
 * The phase bucket treats +0.55 and +2.50 as the same season. They are not: the eastern
 * Pacific in a strong El Nino runs far hotter than in a marginal one, and 2026 is at
 * +1.39. The strong-phase subset that would answer this stays refused because it never
 * clears the six-season floor — so the honest fix is not a narrower bucket, it is to stop
 * bucketing. Every season is weighted by how close its ONI was to today's, with a
 * Gaussian kernel whose width is the phase threshold itself.
 *
 * Nothing is thrown away and nothing is counted equally. A 2015 (+2.6) and a 1997 (+2.4)
 * carry real weight against +1.39; a +0.6 season carries some; a La Nina carries almost
 * none. The effective sample size is Kish's, and it is published — a weighted estimate
 * standing on three seasons' worth of information must not look like one standing on
 * thirty-five.
 */
const ONI_KERNEL_H = Number(process.env.MT_ONI_H || 0.6);
const ONI_MIN_EFF = Number(process.env.MT_ONI_MIN_EFF || 5);

function oniWeights(years, oni) {
  if (!oni || oni.anchorAnom == null || !oni.asoByYear) return null;
  const w = years.map((y) => {
    const v = oni.asoByYear.get(y);
    if (v == null || !Number.isFinite(v)) return 0;
    const d = (v - oni.anchorAnom) / ONI_KERNEL_H;
    return Math.exp(-0.5 * d * d);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  const sumSq = w.reduce((a, b) => a + b * b, 0);
  return { w, sum, nEff: (sum * sum) / sumSq };            // Kish effective sample size
}

/* Weighted Jeffreys: the same prior, with the weighted hit mass and effective n in place
   of raw counts, so a kernel estimate cannot claim more certainty than it has. */
function weightedRate(hitFlags, weights) {
  const { w, nEff } = weights;
  let hit = 0, tot = 0;
  for (let i = 0; i < w.length; i++) { tot += w[i]; if (hitFlags[i]) hit += w[i]; }
  if (!(tot > 0)) return null;
  const share = hit / tot;
  return { p: (share * nEff + 0.5) / (nEff + 1), share, nEff };
}

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

/* What the current ENSO phase has historically meant for Atlantic season TOTALS.
   This is the honest version of a "genesis suppression %": not a quoted figure, but
   the median count in phase-matched seasons against the median across all seasons in
   the same record. It is a description of history, not a forecast, and the UI says so.

   Also reported: a STRONG bucket (|ASO ONI| >= 1.0, sign-matched). ONI +1.39 is not
   the same animal as +0.55, and phase alone throws that away. It is only published
   when the bucket clears the same minimum-sample floor the posterior uses. */
const ONI_STRONG = 1.0;
function median(a) {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function ensoClimate(clim, oni) {
  if (!clim || !oni || !oni.phase || !oni.asoByYear) return null;
  const pick = (pred) => {
    const idx = [];
    clim.years.forEach((y, i) => { const v = oni.asoByYear.get(y); if (v != null && pred(v)) idx.push(i); });
    return idx;
  };
  const sameSign = (v) => phaseOf(v) === oni.phase;
  const strongSign = (v) => sameSign(v) && Math.abs(v) >= ONI_STRONG;
  const build = (idx) => {
    if (idx.length < ONI_MIN_MATCH) return null;
    const out = { n: idx.length };
    for (const [k, arr] of [["namedstorms", clim.namedstorms], ["hurricanes", clim.hurricanes], ["major", clim.major]]) {
      if (!arr || !arr.length) continue;
      const all = median(arr), phase = median(idx.map((i) => arr[i]));
      out[k] = { all, phase, deltaPct: all ? Math.round((phase / all - 1) * 100) : null };
    }
    return out;
  };
  return { phase: oni.phase, phaseLabel: PHASE_LABEL[oni.phase],
    seasons: `${clim.from}–${clim.to}`, all: build(clim.years.map((_, i) => i)),
    matched: build(pick(sameSign)), strong: build(pick(strongSign)),
    strongThreshold: ONI_STRONG };
}

// Empirical P(count > strike) for Atlantic seasonal hurricane-count contracts.
/* Progressive conditional posterior.
   L0 unconditional base rate  →  L1 conditioned on how much season remains.
   L1 is the layer that matters most right now: an unconditional July estimate
   silently assumes a full season ahead. Each layer is computed only where real
   data supports it; anything else is reported as an unavailable layer rather
   than folded in silently. */
function posteriorFor(quantity, strike, clim, seasonToDate, oni) {
  if (!clim || strike == null) return null;
  // `quantity` was a boolean "is this the major-hurricane series". Named storms made
  // that a third case, so it is now the series quantity itself.
  const q = quantity === true ? "major" : quantity === false ? "hurricane" : quantity;
  const counts = q === "major" ? clim.major : q === "namedstorm" ? clim.namedstorms : clim.hurricanes;
  if (!counts || !counts.length) return null;
  const n = counts.length;
  const layers = [];

  // L0 — unconditional seasonal frequency
  const p0 = jeffreys(counts.filter((c) => c > strike).length, n);
  layers.push({ id: "base", label: "Historical climatology", p: p0,
    basis: `${clim.from}–${clim.to} full seasons (n=${n})` });

  // L1 — condition on day-of-year: only count storms that had NOT yet formed by today
  const doy = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
  const remainFn = q === "major" ? clim.majorAfter : q === "namedstorm" ? clim.namedstormsAfter : clim.hurricanesAfter;
  const need = strike - (seasonToDate == null ? 0 : seasonToDate);
  let p1 = null, remaining = null;
  if (typeof remainFn === "function") {
    remaining = remainFn(doy);
    p1 = jeffreys(remaining.filter((r) => r > need).length, n);
    const noun = q === "namedstorm" ? "named storms" : q === "major" ? "major hurricanes" : "hurricanes";
    layers.push({ id: "doy", label: "Day-of-year conditional", p: p1,
      basis: `${noun} forming on/after day ${doy} in each past season; needs >${need} more` });
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
      const raw = jeffreys(hit, m);
      const w = m / (m + ONI_SHRINK_K);              // shrink small buckets toward L1
      p3 = w * raw + (1 - w) * anchorP;
      const sign = oni.anchorAnom >= 0 ? "+" : "";
      layers.push({ id: "enso", label: "ENSO-stratified", p: p3,
        basis: `${m} ${pl} season${m === 1 ? "" : "s"} → ${Math.round(raw * 100)}% raw, shrunk ${Math.round((1 - w) * 100)}% toward the unstratified estimate (k=${ONI_SHRINK_K})`
             + ` · phase from ${oni.anchorSeas} ${oni.anchorYear} ONI ${sign}${oni.anchorAnom.toFixed(2)}`
             + (oni.assumed ? ` (ASO ${now.getUTCFullYear()} not yet observed — persistence assumed)` : "") });
    }
  }

  /* L4 — ONI similarity. Same question as L3, without the bucket: every season weighted
     by how close its ONI was to today's. This governs when it is available, because the
     bucket cannot see the difference between a marginal and a strong event and 2026 is a
     strong one. L3 is kept above it precisely so the two can be compared — when the
     bucket and the kernel agree, the answer does not depend on the method. */
  let p4 = null;
  const wts = oniWeights(clim.years, oni);
  if (!oni || !oni.phase) {
    layers.push({ id: "onisim", label: "ONI-similarity weighted", p: null, unavailable: true,
      basis: "no CPC ONI feed this cycle — similarity weighting not applied" });
  } else if (!wts || wts.nEff < ONI_MIN_EFF) {
    layers.push({ id: "onisim", label: "ONI-similarity weighted", p: null, unavailable: true,
      basis: `effective sample ${wts ? wts.nEff.toFixed(1) : "0"} seasons is below the ${ONI_MIN_EFF}-season floor — no weighted estimate published` });
  } else {
    const flags = remaining ? remaining.map((r) => r > need) : counts.map((c) => c > strike);
    const wr = weightedRate(flags, wts);
    const shrink = wts.nEff / (wts.nEff + ONI_SHRINK_K);
    p4 = shrink * wr.p + (1 - shrink) * anchorP;
    const sign = oni.anchorAnom >= 0 ? "+" : "";
    layers.push({ id: "onisim", label: "ONI-similarity weighted", p: p4,
      basis: `${clim.years.length} seasons weighted by ONI distance from ${sign}${oni.anchorAnom.toFixed(2)}`
           + ` (Gaussian, h=${ONI_KERNEL_H}) → ${Math.round(wr.p * 100)}% at an effective ${wts.nEff.toFixed(1)} seasons,`
           + ` shrunk ${Math.round((1 - shrink) * 100)}% toward the unstratified estimate` });
  }

  const posterior = p4 != null ? p4 : p3 != null ? p3 : anchorP;
  return { p: posterior, layers, doy,
    basis: layers.filter((l) => !l.unavailable).map((l) => l.label).join(" → ") };
}

/* What does this series actually COUNT? Derive it from the ticker, never the title.
   Kalshi titles are unreliable for this: KXTROPSTORM-26DEC01-T10 counts tropical
   storms but is titled "Will there be more than 10 Atlantic hurricanes in 2026?" —
   byte-identical to the real hurricane-count market KXHURCTOT-26DEC01-T10. Title
   matching therefore anchored a named-storm contract against hurricane frequencies
   and manufactured a −43pt edge out of nothing. Tickers are structured and stable. */
/* Ticker to {quantity, basin}. Order matters: the naming and per-storm families are
   matched BEFORE the basin ladders, because a naming ticker also carries EPAC/CPAC in
   its id and would otherwise be mistaken for a season-count ladder.

   This used to collapse everything Pacific to a single {hurricane, pacific}, which was
   both too coarse and unanchorable: it merged the named-storm, hurricane and major
   ladders into one quantity, and merged two basins with very different climatologies —
   the eastern Pacific averages several times the central Pacific's activity, and they
   respond to ENSO with different strength. Sixty-plus contracts sat unpriced behind it. */
function seriesQuantity(ticker) {
  const t = String(ticker || "").toUpperCase();
  if (!t) return null;
  if (/^KXHURCAT-/.test(t)) return { q: "perstorm", basin: null };            // single-storm ladder
  if (/^KXHURRICANENAMES|^KXFIRSTHURRICANE/.test(t)) return { q: "naming", basin: null };
  if (/^KXNEXTHURDATE|^KXNEXTCAT5HURDATE/.test(t)) return { q: "timing", basin: null };
  const basin = /CPAC/.test(t) ? "cpac" : /EPAC/.test(t) ? "epac" : "atlantic";
  if (basin !== "atlantic") {
    // KXHURRICANE-…EPACMAJ / …CPACMAJ are major-hurricane ladders; …TOT are hurricanes;
    // KXNAMEDSTORM-…TOT are 34 kt named storms.
    if (/^KXNAMEDSTORM/.test(t)) return { q: "namedstorm", basin };
    if (/MAJ(?:$|[^A-Z])/.test(t)) return { q: "major", basin };
    if (/^KXHURRICANE/.test(t)) return { q: "hurricane", basin };
    return null;
  }
  if (/^KXHURCTOTMAJ/.test(t)) return { q: "major", basin: "atlantic" };
  if (/^KXHURCTOT/.test(t)) return { q: "hurricane", basin: "atlantic" };
  if (/^KXTROPSTORM/.test(t)) return { q: "namedstorm", basin: "atlantic" };  // different base rate
  return null;
}

const BASIN_LABEL = { atlantic: "Atlantic", epac: "eastern Pacific", cpac: "central Pacific" };

/* ---------------- Per-name markets ----------------
 * "Will Dolly be categorized as a hurricane in the Atlantic in 2026?" is not a question
 * about Dolly. Names are assigned strictly in list order, so it is a question about the
 * FOURTH named storm of the season — an ordinal, which HURDAT2 answers by counting.
 *
 * The position comes from the first letter, because the lists are alphabetical with a
 * fixed set of skipped letters. The Atlantic list is 21 names (no Q, U, X, Y, Z); the
 * eastern Pacific list is 24 (no Q, U). Both were confirmed against the live board: the
 * 21 Atlantic tickers are exactly ART BER CRI DOL EDO FAY GON HAN ISA JOS KYL LEA MAR
 * NAN OMA PAU REN SAL TED VIC WIL, and the 22 eastern Pacific tickers are the 24-letter
 * alphabet less F and G, whose storms have already formed and settled.
 *
 * The central Pacific is deliberately absent. Its names come from four sequential lists
 * that carry over between seasons rather than restarting each year, so a name's position
 * is not a function of its letter and this derivation does not apply. Those twelve
 * contracts stay unanchored rather than being priced by an assumption that is false.
 */
const NAME_ALPHABET = {
  atlantic: "ABCDEFGHIJKLMNOPRSTVW",
  epac: "ABCDEFGHIJKLMNOPRSTVWXYZ",
};

function namePosition(basin, name) {
  const alpha = NAME_ALPHABET[basin];
  if (!alpha || !name) return null;
  const i = alpha.indexOf(String(name).trim().toUpperCase()[0]);
  return i < 0 ? null : i + 1;
}

/* The k-th name, given m named storms already recorded, is the (k − m)-th storm still
 * to form. Restricting each past season to storms forming on or after today's day-of-year
 * asks the same question of history that the operator is asking of this season. */
function ordinalOutcome(clim, kRemaining, doy, oni) {
  if (!clim || !clim.seasonNamed || !clim.seasonNamed.length || !(kRemaining >= 1)) return null;
  const n = clim.seasonNamed.length;
  let used = 0, hur = 0, first = 0;
  // Per-season outcome flags, kept so the same seasons can be re-read under a weighting.
  const fUsed = [], fHur = [], fFirst = [];
  for (const seq of clim.seasonNamed) {
    const later = seq.filter((s) => s.doy >= doy);
    const has = later.length >= kRemaining;
    const s = has ? later[kRemaining - 1] : null;
    const isHur = !!(s && s.hu);
    // First hurricane of the REMAINDER — the caller decides whether the season already
    // has one, in which case no unformed name can be the season's first.
    const isFirst = isHur && !later.slice(0, kRemaining - 1).some((x) => x.hu);
    fUsed.push(has); fHur.push(isHur); fFirst.push(isFirst);
    if (has) used++;
    if (isHur) hur++;
    if (isFirst) first++;
  }
  const out = { n, pUsed: jeffreys(used, n), pHurricane: jeffreys(hur, n), pFirstHurricane: jeffreys(first, n),
                rawUsed: used, rawHurricane: hur, rawFirst: first, kRemaining, doy, enso: null };
  /* The count ladders have been ENSO-conditioned since L3 existed; these ordinals were
     not, and that asymmetry had a direction. Atlantic hurricane counts run about 43%
     below the median in El Nino seasons while the eastern Pacific runs above it — so an
     unconditioned Atlantic per-name probability was biased HIGH and an eastern Pacific
     one biased LOW, both in exactly the direction that made them look like buys. */
  const wts = oniWeights(clim.years, oni);
  if (wts && wts.nEff >= ONI_MIN_EFF) {
    const rU = weightedRate(fUsed, wts), rH = weightedRate(fHur, wts), rF = weightedRate(fFirst, wts);
    const shrink = wts.nEff / (wts.nEff + ONI_SHRINK_K);
    const blend = (weighted, flat) => (weighted == null ? flat : shrink * weighted.p + (1 - shrink) * flat);
    out.enso = {
      nEff: wts.nEff, shrink,
      pUsed: blend(rU, out.pUsed), pHurricane: blend(rH, out.pHurricane), pFirstHurricane: blend(rF, out.pFirstHurricane),
      rawWeighted: { used: rU && rU.p, hurricane: rH && rH.p, first: rF && rF.p },
    };
  }
  return out;
}

/* `clims` is the per-basin map from fetchClimatology. The second argument used to be a
   single Atlantic climatology and every Pacific ticker returned null here; the basin now
   selects which archive answers the question. A basin whose archive did not parse still
   returns null — a missing central-Pacific file must leave those rungs unanchored rather
   than borrow the eastern Pacific's much larger counts. */
/* Anchors for the two per-name families. Returns null — never a guess — whenever the
   ordinal question is not the question being asked. */
function namingAnchor(label, ticker, clims, std, oni) {
  const t = String(ticker || "").toUpperCase();
  const kind = /^KXFIRSTHURRICANE/.test(t) ? "first" : /^KXHURRICANENAMES/.test(t) ? "hurricane" : null;
  if (!kind) return null;
  const basin = /CPAC/.test(t) ? "cpac" : /EPAC/.test(t) ? "epac" : "atlantic";
  const clim = clims && (clims.years ? (basin === "atlantic" ? clims : null) : clims[basin]);
  if (!clim) return null;                       // includes the central Pacific by design

  // The name: prefer the human label, fall back to the ticker suffix.
  const m = /^Will\s+([A-Za-z'-]+)\s/i.exec(String(label || ""));
  const name = m ? m[1] : (t.split("-").pop() || "");
  const k = namePosition(basin, name);
  if (!k) return null;

  /* Season-to-date is REQUIRED here, not optional. Without it the ordinal is measured
     from the start of the season, which in August would price the fourth name as though
     the first three had not happened. */
  if (!std || !std[basin]) return null;
  const done = std[basin].namedstorms, hurSoFar = std[basin].hurricanes;

  /* A name already in use is no longer an ordinal question — it is a question about one
     specific storm, and there is no per-storm intensity model. Cristobal is a 40 kt
     system heading for cold water; climatology for "the third named storm" knows nothing
     about that and would price it near coin-flip against a market at 1c. Refuse. */
  if (k <= done) return null;

  const doy = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
  const o = ordinalOutcome(clim, k - done, doy, oni);
  if (!o) return null;

  const label2 = BASIN_LABEL[basin] || basin;
  const noun = kind === "first" ? "was the season's FIRST hurricane" : "reached hurricane strength";
  const pick = (src) => (kind === "first" ? src.pFirstHurricane : src.pHurricane);
  const flat = pick(o);
  const weighted = o.enso ? pick(o.enso) : null;

  /* Once the season has a hurricane, no name still unformed can be its first. This is a
     logical zero, not an empirical one, so it bypasses both the prior and the weighting. */
  const settled = kind === "first" && hurSoFar > 0;
  const p = settled ? 0 : (weighted != null ? weighted : flat);

  const layers = [
    { id: "ordinal", label: "Ordinal climatology", p: flat,
      basis: `${clim.from}–${clim.to} (n=${o.n}), unweighted — the #${k - done} storm still to form ${noun} in ${o.rawUsed ? Math.round((kind === "first" ? o.rawFirst : o.rawHurricane) / o.n * 100) : 0}% of seasons` },
    o.enso
      ? { id: "onisim", label: "ONI-similarity weighted", p: weighted,
          basis: `same seasons weighted by ONI distance from ${oni && oni.anchorAnom >= 0 ? "+" : ""}${oni ? oni.anchorAnom.toFixed(2) : "?"}`
               + ` (effective ${o.enso.nEff.toFixed(1)} seasons, shrunk ${Math.round((1 - o.enso.shrink) * 100)}% toward unweighted)` }
      : { id: "onisim", label: "ONI-similarity weighted", p: null, unavailable: true,
          basis: "no usable ONI weighting this cycle — the ordinal is unconditioned, which in a strong ENSO event is a known bias" },
  ];
  if (settled) layers.push({ id: "settled", label: "Already determined", p: 0,
    basis: `${label2} already has ${hurSoFar} hurricane${hurSoFar === 1 ? "" : "s"} in ${now.getUTCFullYear()}` });

  return {
    p, unconditional: flat, layers, quantity: kind === "first" ? "firsthurricane" : "namedhurricane",
    basin, seasonToDate: done, position: k,
    basis: settled
      ? `${label2} already has ${hurSoFar} hurricane${hurSoFar === 1 ? "" : "s"} in ${now.getUTCFullYear()} — no unformed name can still be the first`
      : `${name} is name #${k} on the ${label2} list and ${done} have been used, so this is the #${k - done} storm still to form`
        + ` · in ${clim.from}–${clim.to} (n=${o.n}), that storm ${noun} in ${Math.round(flat * 100)}% of seasons`
        + (weighted != null ? ` · ${Math.round(weighted * 100)}% once seasons are weighted by ONI similarity` : "")
        + ` · used at all in ${Math.round((o.enso ? o.enso.pUsed : o.pUsed) * 100)}%`,
  };
}

/* ---------------- the probability engine, applied to the live storms ----------------
 *
 * The four ingested feeds land on the storm here, and the calibrated probability is
 * computed once, so every consumer downstream — the anchor, the frame, the register, the
 * Situation strip — reads the same number rather than each deriving its own.
 *
 * THE RAW ESTIMATE IS NEVER OVERWRITTEN. `hurricaneP` stays exactly what the official
 * advisory estimator produced, and `hurricanePCal` sits beside it. Every surface that
 * shows one can show the other, which is the whole of the raw-and-calibrated rule.
 *
 * SHIPS SCORING IS AN OPERATOR CLAIM. It is off unless MT_SHIPS_RI_SCORING is set, and
 * the unscored floor is published either way. That is not a feature flag hiding an
 * unfinished path — the RI floor is computed, carried and displayed on every cycle. It is
 * a statement about who is responsible for a number entering a price. */
const SHIPS_RI_SCORING = process.env.MT_SHIPS_RI_SCORING === "1";

function applyIntel(storms, intel) {
  for (const s of storms) {
    const I = (intel && intel.byStorm && intel.byStorm[s.id]) || null;
    s.consensus = I ? I.consensus : null;
    s.recon = I ? I.recon : null;
    s.aircraftFix = I ? I.aircraftFix : null;
    s.ships = I ? I.ships : null;
    s.ascat = I ? I.ascat : null;
    s.bestTrack = I ? I.bestTrack : null;
    s.bestTrackPeak = I ? I.bestTrackPeak : null;

    /* THE ESTIMATE IS FINALISED HERE, AND ONLY HERE, BECAUSE ONLY HERE IS THE RECORD KNOWN.
       fetchStorms() computes s.hurricaneP from the advisory alone because that is all it
       has: the b-deck arrives with the ingest, which runs a full step later (main() calls
       fetchStorms, then ingestIntel, then applyIntel). A question settled by what the storm
       HAS ALREADY DONE cannot be answered before the observed record has been read. With no
       b-deck peak the call is not made and the advisory-only estimate stands untouched. */
    const bp = I && I.bestTrackPeak;
    if (bp && Number.isFinite(bp.kt)) {
      const gI2 = s.discussion && s.discussion.guidance && s.discussion.guidance.intensity;
      s.hurricaneP = reachesHurricaneP(s.trackPoints || [], null, gI2 || null,
        { peakKt: bp.kt, peakIso: bp.iso, classified: !!(I && I.bestTrackEverHurricane),
          source: "NHC best track (b-deck)" });
    }
    s.atcfDeck = I ? I.deck : null;
    s.intelNotes = I ? { atcf: I.atcfNote, ships: I.shipsNote } : null;

    /* The rapid-intensification floor speaks to the gap between where the storm is now
       and where the contract resolves. No gap, no floor — a storm already at hurricane
       strength does not need to intensify rapidly to be a hurricane. */
    const gap = s.wind != null ? HURRICANE_REPORTED_KT - s.wind : null;
    const floor = (s.ships && gap != null && gap > 0) ? riFloorFor(s.ships, gap, 48) : null;
    s.riFloor = floor;

    const cal = calibratedIntensityP({
      official: s.hurricaneP, currentKt: s.wind,
      /* The advisory the engine is calibrating, and WHEN it was issued. The time is what
         decides whether a recon fix is still news or has already been read by the
         forecaster — the WMO header time is preferred because it is when the product
         actually left the office, with the feed's issuance as the fallback. */
      advisoryIso: s.advisoryIssuedZ || s.advTimeZ || null,
      advisoryLabel: s.advNumFull || s.advNum || null,
      consensus: s.consensus, recon: s.recon, ascat: s.ascat, ships: s.ships,
      riFloor: floor, shipsScoring: SHIPS_RI_SCORING,
    }, {
      nowMs: now.getTime(), maeTable: INTENSITY_MAE,
      thresholdKt: LATENT_THRESHOLD, reportedKt: HURRICANE_REPORTED_KT,
    });
    s.hurricanePCal = cal && cal.ok ? cal : null;
    /* Evidence quality is capped by staleness, and the cap is read from the SAME constant
       the anchor refuses on. A measured initial condition under a superseded advisory is
       not high-quality evidence about the present storm. */
    s.evidenceQuality = evidenceQuality(cal, {
      advisoryLagMin: s.advisoryLagMin, staleAtMin: STORM_ANCHOR_MAX_LAG_MIN / 2,
    });
  }
}

/* An anchor for a contract about ONE named, currently-active storm.
 *
 * This replaces a refusal, and a refusal is only worth replacing when the replacement is
 * genuinely better than silence. The test it has to pass: the number must come from the
 * forecasters who will themselves decide the outcome, not from a model invented here.
 * NHC's published forecast intensity meets that; a climatology of past seasons does not,
 * which is why the ordinal path still refuses these and always will.
 *
 * It is deliberately fragile in one direction. Everything depends on the storm being in
 * the CURRENT advisory feed with a CURRENT forecast. When the storm dissipates it leaves
 * CurrentStorms.json, this returns null, and the contract goes back to unpriced — which
 * is correct, because a five-day-old forecast for a storm that no longer exists is the
 * most dangerous number this board could display: confidently precise and about nothing.
 */
const STORM_ANCHOR_MAX_LAG_MIN = Number(process.env.MT_ADV_MAX_LAG || 360);

function stormAnchor(label, ticker, storms) {
  const t = String(ticker || "").toUpperCase();
  if (!/^KXHURRICANENAMES/.test(t)) return null;        // "will X be a hurricane" only
  const m = /^Will\s+([A-Za-z'-]+)\s/i.exec(String(label || ""));
  if (!m) return null;
  const name = m[1].toLowerCase();
  const S = (storms || []).find((x) => String(x.name || "").toLowerCase() === name);
  if (!S) return null;                                   // not an active storm — not our question
  const hp = S.hurricaneP;
  if (!hp || hp.p == null) return null;                  // no intensity forecast parsed
  /* A forecast this old is not a forecast. Six hours is one full advisory cycle; past
     that the product has been superseded and we simply have not seen the new one. */
  if (S.advisoryLagMin != null && S.advisoryLagMin > STORM_ANCHOR_MAX_LAG_MIN) return null;

  const w = S.watches || {};
  const gI = S.discussion && S.discussion.guidance && S.discussion.guidance.intensity;
  /* THE PRICE COMES FROM THE PROBABILITY ENGINE when the engine has something the
     advisory alone does not — the guidance deck that landed before the advisory, or an
     aircraft that measured the storm. When it has neither, this is exactly the estimate
     it always was, which is why a storm with no intel prices identically to before. */
  const cal = S.hurricanePCal && S.hurricanePCal.ok ? S.hurricanePCal : null;
  return {
    p: cal ? cal.p : hp.p,
    pLow: cal ? cal.pLow : (hp.pLow ?? null),
    pHigh: cal ? cal.pHigh : (hp.pHigh ?? null),
    /* RAW AND CALIBRATED, SIDE BY SIDE. The official-forecast estimate is carried on the
       anchor whether or not anything moved it, so no surface has to reach back for it. */
    pOfficial: hp.p, calibrated: !!cal, calibration: cal,
    quality: S.evidenceQuality ? S.evidenceQuality.tier : null,
    unconditional: null, quantity: "storm-intensity", basin: null,
    storm: S.id, source: cal ? "NHC forecast + ATCF/recon" : "NHC forecast",
    /* Advisory age travels WITH the anchor rather than being looked up beside it, so a
       consumer cannot price this without also being handed how old the forecast under it
       is. The hard refusal above is a cliff at one full advisory cycle; this is the
       continuous number the edge book grades on. */
    advisoryLagMin: S.advisoryLagMin ?? null,
    maxLagMin: STORM_ANCHOR_MAX_LAG_MIN,
    guidance: gI ? { position: gI.position, quote: gI.quote } : null,
    adjustment: hp.adjustment || null,
    layers: [
      { id: "official", label: "Official forecast intensity", p: hp.p, basis: hp.basis },
      /* p: null on purpose. The guidance position is a statement ABOUT the official
         forecast, not a second estimate of the same quantity, so it must not count as a
         layer that agrees with anything — the TAKE grade requires independent layers and
         this one is a transformation of the layer above it. */
      { id: "guidance", label: "Position in the guidance envelope", p: null, unavailable: !gI,
        basis: gI ? `NHC places its own intensity forecast ${gI.position} the guidance envelope`
                  + (hp.adjustment ? ` — peak read ${Math.abs(hp.adjustment.shiftKt).toFixed(1)} kt`
                     + ` ${hp.adjustment.shiftKt < 0 ? "lower" : "higher"},`
                     + ` ${Math.round(hp.adjustment.raw * 100)}% unadjusted` : "")
                  : "the discussion states no position for the intensity forecast" },
      { id: "watch", label: "Watches and warnings", p: null, unavailable: !w.highest,
        basis: w.highest
          ? `${w.highest} in effect for ${(w.inEffect[0] && w.inEffect[0].areas || []).join(", ")}`
            + ` — advisories are running on the 3-hourly intermediate cycle`
          : "no watch or warning in effect for this system" },
      /* The engine's own layers — the guidance consensus, the aircraft, the RI floor.
         The official layer it also publishes is dropped here because it is already the
         first row above; a duplicate would read as two sources agreeing when it is one
         source counted twice, and the TAKE grade is decided by exactly that count. */
      ...(cal ? cal.layers.filter((l) => l.id !== "official") : []),
    ],
    basis: `${S.name} is ${S.wind} kt now · ` + (cal ? cal.basis + " · " + hp.basis : hp.basis)
         + (w.highest ? ` · ${w.highest} in effect` : "")
         + (S.advisoryLagMin != null ? ` · advisory ${S.advisoryLagMin} min old when fetched` : ""),
  };
}

function climatologyAnchor(title, strike, clims, ticker, oni, std) {
  if (!clims || strike == null) return null;
  const byBasin = clims.years ? { atlantic: clims } : clims;   // tolerate a bare Atlantic clim
  const t = (String(title) + " " + String(ticker || "")).toLowerCase();
  // Ticker-derived identification is authoritative; fall back to the title only for
  // series we don't recognise (and then demand explicit Atlantic + hurricane wording).
  const sq = seriesQuantity(ticker);
  let q, basin;
  if (sq) {
    // Naming, per-storm and timing families are still unanchorable and still return null.
    if (!["hurricane", "major", "namedstorm"].includes(sq.q)) return null;
    q = sq.q; basin = sq.basin || "atlantic";
  } else {
    if (!/how many|more than|at least|total|count/.test(t)) return null;
    basin = /central pacific/.test(t) ? "cpac" : /eastern pacific/.test(t) ? "epac"
          : (/atlantic/.test(t) || /\bkxatl/.test(t)) ? "atlantic" : null;
    if (!basin) return null;
    if (/named storm|tropical storm/.test(t)) q = "namedstorm";
    else if (!/hurricane/.test(t)) return null;
    else q = (/\bmajor\b/.test(t) || /categor(?:y|ies)\s*[345]\b/.test(t)) ? "major" : "hurricane";
  }
  const clim = byBasin[basin];
  if (!clim) return null;
  const counts = q === "major" ? clim.major : q === "namedstorm" ? clim.namedstorms : clim.hurricanes;
  if (!counts || !counts.length) return null;
  const noun = q === "namedstorm" ? "named-storm" : q === "major" ? "major-hurricane" : "hurricane";
  const label = BASIN_LABEL[basin] || basin;
  const hits = counts.filter((c) => c > strike).length;
  /* The season-to-date count must come from the SAME basin and the SAME quantity as
     the strike, or L2 subtracts hurricanes from a named-storm ladder. */
  const key = q === "major" ? "major" : q === "namedstorm" ? "namedstorms" : "hurricanes";
  const soFar = std && std[basin] ? std[basin][key] : null;
  const post = posteriorFor(q, strike, clim, soFar ?? null, oni);
  return {
    p: post ? post.p : hits / counts.length,
    unconditional: hits / counts.length,
    layers: post ? post.layers : null,
    quantity: q, basin, seasonToDate: soFar ?? null,
    /* The ENSO layer keys off the ASO ONI, which is the Atlantic's peak season. The
       eastern Pacific peaks earlier, so on a Pacific ladder that window is a borrowed
       one — the empirical conditioning still carries the right SIGN, because it reads the
       Pacific record rather than assuming a direction, but the window is stated rather
       than left for the reader to assume. */
    basis: (post
      ? `${post.basis} · ${clim.from}–${clim.to} ${label} ${noun} seasons (n=${counts.length}), day ${post.doy}`
      : `${clim.from}–${clim.to} ${label} ${noun} seasons (n=${counts.length}); ${hits} exceeded ${strike}`)
      + (basin === "atlantic" ? "" : " · ENSO phase taken from the ASO window, which is the Atlantic peak season, not this basin's")
      + (basin === "cpac" ? " · central Pacific counted by track through 140\u00b0W\u2013180\u00b0, so systems that formed east and crossed in are included" : ""),
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

/* A per-storm ladder outlives its storm. Kalshi keeps "Will Fausto become a Category 3
   hurricane?" listed after Fausto is gone from the NHC feed, and the board showed it
   with no indication that the subject no longer exists — an operator scanning the board
   reads a live question about a dead storm. The ticker carries the name, so say so.
   Inactive is defined narrowly: the storm is absent from CurrentStorms.json. The tag
   makes no claim about dissipation or post-tropical status. */
function subjectFromTicker(ticker) {
  const m = /^KXHURCAT-\d*([A-Z]+)-/i.exec(String(ticker || ""));
  if (!m) return null;
  const n = m[1];
  return n.charAt(0) + n.slice(1).toLowerCase();
}
function subjectStatus(ticker, storms) {
  const name = subjectFromTicker(ticker);
  if (!name) return null;
  const active = storms.some((s) => (s.name || "").toLowerCase() === name.toLowerCase());
  return { subject: name, active };
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
    /* A truncated JSON blob sorted its keys alphabetically and cut off right after
       "market_type" — which put volume, volume_24h, open_interest and liquidity
       outside the sample on every single cycle. Capture a targeted inventory
       instead: the full key list, plus the values of anything that looks like size
       or price. */
    if (!raw && list.length) raw = JSON.stringify({
      keys: Object.keys(list[0]).sort(),
      size: Object.fromEntries(Object.entries(list[0]).filter(([k]) => /volume|liquid|interest|notional|count/i.test(k))),
      px: Object.fromEntries(Object.entries(list[0]).filter(([k]) => /price|bid|ask/i.test(k))),
    });
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
  const t = String(v).replace(/[$,\s]/g, "");
  if (!t) return null;                       // "" would otherwise coerce to a real 0
  const n = Number(t);
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
/* Kalshi carries sizes in fixed-point STRING fields suffixed "_fp" — volume_fp,
   volume_24h_fp, open_interest_fp, yes_bid_size_fp, yes_ask_size_fp — all in
   contracts. The older liquidity_dollars field is still present and still returns
   "0.0000", which is what made the whole board read as zero-volume, zero-depth: we
   were reading the deprecated names. The resting depth was there the entire time.
   Legacy names are kept as fallbacks so a rollback does not blank the board. */
/* Number("") is 0, not NaN. Coercing a missing field straight through Number()
   turned "absent" into a real zero, which then satisfied ?? and stopped the legacy
   fallback from ever running — so a rollback to the old field names would have read
   every volume as 0. Absent must stay null. */
function fpNum(v) {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function notionalOf(m) { return dollarNum(m.notional_value_dollars) ?? 1; }

function volumeOf(m) {
  return fpNum(m.volume_fp) ?? dollarNum(m.volume_dollars) ?? num(m.dollar_volume) ?? num(m.volume) ?? 0;
}
function volume24hOf(m) { return fpNum(m.volume_24h_fp) ?? num(m.volume_24h) ?? null; }
function openInterestOf(m) { return fpNum(m.open_interest_fp) ?? num(m.open_interest) ?? null; }

/* Top-of-book resting size, in contracts on each side. This is what the exchange
   will actually fill right now — not a modelled depth curve. */
function depthOf(m) {
  const bid = fpNum(m.yes_bid_size_fp) ?? num(m.yes_bid_size);
  const ask = fpNum(m.yes_ask_size_fp) ?? num(m.yes_ask_size);
  if (bid == null && ask == null) return null;
  return { bidSize: bid ?? 0, askSize: ask ?? 0, notional: notionalOf(m) };
}

/* The Kelly cap is a DOLLAR ceiling, so it must be the dollars a taker can actually
   put to work right now: contracts resting on the ask x THE PRICE THEY COST. Sizing
   against total volume or open interest would let an allocation exceed what the book
   can fill.
   The cost is the ASK, not the mid. Using the mid understated the cap by 50% on a
   0/1c book (54,100 contracts read as $271 fillable when taking the offer costs
   $541) and by ~3% on a tight one — the error is worst exactly where the book is
   thinnest and the cap matters most. */
function askPriceOf(m) {
  const d = dollarNum(m.yes_ask_dollars);
  if (d != null && d > 0) return d;
  const c = num(m.yes_ask);
  if (c != null && c > 0) return c / 100;
  return priceOf(m);
}
/* The bid mirrors the ask, with one deliberate difference: a missing or zero bid stays
   zero rather than falling back to the mid. "Nobody is bidding" is a real state on this
   board — 22 of 151 rungs sit with an empty bid side — and reporting the mid there would
   invent a buyer. */
function bidPriceOf(m) {
  const d = dollarNum(m.yes_bid_dollars);
  if (d != null && d > 0) return d;
  const c = num(m.yes_bid);
  if (c != null && c >= 0) return c / 100;
  return null;
}
function liquidityOf(m) {
  const d = depthOf(m), px = askPriceOf(m);
  if (d && d.askSize > 0 && px != null && px > 0) {
    const dollars = d.askSize * px * d.notional;
    if (dollars > 0) return Math.round(dollars);
  }
  const legacy = dollarNum(m.liquidity_dollars);
  if (legacy != null && legacy > 0) return Math.round(legacy);
  const c = num(m.liquidity);
  return c != null && c > 0 ? Math.round(c / 100) : null;
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

async function fetchKalshi(storms, clims, oni, std) {
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
    /* Two anchor families. The count ladders need a strike; the per-name markets have
       none and are answered by list position instead, so they are tried separately. */
    /* Order matters. A contract about a storm that EXISTS is answered by the official
       forecast for that storm; the ordinal climatology only ever spoke to names that have
       not been used yet, and it still refuses the rest. */
    const anchor = stormAnchor(title, m.ticker, storms)
                || climatologyAnchor(title, strike, clims, m.ticker, oni, std)
                || namingAnchor(title, m.ticker, clims, std, oni);
    contracts.push({
      id: m.ticker, label: title, short: shortLabel(sub ? title.replace(/\?$/, "") + " · " + sub : title, 46),
      storm: assocStorm(title + " " + sub, storms), subject: subjectStatus(m.ticker, storms),
      market: Math.max(0.01, Math.min(0.99, price)),
      model: anchor ? anchor.p : null,
      modelQuantity: anchor ? anchor.quantity : null,
      modelBasin: anchor ? anchor.basin : null,
      /* Two KINDS of anchor now sit on this board and they must not read alike. One is
         what happened in 35 seasons of record; the other is what NHC says will happen to
         one storm this week. The source string is how a reader tells them apart. */
      modelSource: anchor ? (anchor.source || "HURDAT2 climatology") : null,
      modelBasis: anchor ? anchor.basis : null,
      modelUncond: anchor ? anchor.unconditional : null,
      modelLayers: anchor ? anchor.layers : null,
      modelLow: anchor && anchor.pLow != null ? anchor.pLow : null,
      modelHigh: anchor && anchor.pHigh != null ? anchor.pHigh : null,
      /* How old the product under this anchor was when it was read, carried on the
         contract so the ranking can grade on it. A climatology anchor has no advisory
         behind it and reports null, which is not the same as zero and must not grade
         like a fresh one. */
      modelLagMin: anchor && anchor.advisoryLagMin != null ? anchor.advisoryLagMin : null,
      modelMaxLagMin: anchor && anchor.maxLagMin != null ? anchor.maxLagMin : null,
      modelGuidance: anchor && anchor.guidance ? anchor.guidance.position : null,
      modelRawP: anchor && anchor.adjustment ? anchor.adjustment.raw : null,
      /* RAW AND CALIBRATED, on the contract, side by side. `model` is what the board
         prices against; `modelOfficialP` is the untouched official-advisory estimate, so
         a reader can always see how far the pre-advisory feeds moved the number and in
         which direction — including when the answer is "not at all". */
      modelOfficialP: anchor && anchor.pOfficial != null ? anchor.pOfficial : null,
      modelCalibrated: !!(anchor && anchor.calibrated),
      modelQuality: anchor && anchor.quality ? anchor.quality : null,
      modelIntel: anchor && anchor.calibration ? {
        conKt: anchor.calibration.sources.find((x) => x.id === "consensus")?.peakKt ?? null,
        conAgeMin: anchor.calibration.consensusAgeMin ?? null,
        spreadKt: anchor.calibration.tauKt ?? null,
        reconAgeMin: anchor.calibration.reconAgeMin ?? null,
        reconDeltaKt: anchor.calibration.reconDeltaKt ?? null,
        ascatUsed: !!anchor.calibration.ascatUsed,
        riFloorP: anchor.calibration.riFloor ? anchor.calibration.riFloor.p : null,
        riScored: !!anchor.calibration.shipsScoring,
        drivenBy: anchor.calibration.drivenBy || null,
      } : null,
      horizon: horizonOf(title), strike,
      /* The board carried a mid and a spread and left every consumer to reconstruct the
         two sides from them. That reconstruction is wrong exactly where it matters: the
         mid is clamped into [0.01, 0.99], so on a 0/2c book it reports 1c and a taker
         who "pays the mid" is short by half the edge. Both sides are now carried. */
      yesBid: bidPriceOf(m), yesAsk: askPriceOf(m),
      closeTime: m.close_time || m.expiration_time || null,
      liquidity, spread, volume, volume24h: volume24hOf(m), openInterest: openInterestOf(m),
      depth: depthOf(m), proxy: false, source: "kalshi",
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
  /* This used to be slice(0, 44). Kalshi was returning 147 qualifying hurricane
     markets and the board silently kept the top 44 — which dropped WHOLE SERIES,
     not just deep rungs: Atlantic tropical-storm counts and Eastern Pacific named
     storms vanished entirely while the header still read "44 contracts · kalshi".
     A cap that hides entire markets is worse than a slow board. The ceiling now
     exists only as a runaway guard, and anything it removes is counted and
     reported rather than disappearing. */
  const kept = contracts.slice(0, MAX_CONTRACTS);
  const droppedForCap = contracts.length - kept.length;
  const seriesOf = (c) => String(c.id).replace(/-[^-]*$/, "");
  const seriesKept = new Set(kept.map(seriesOf)).size;
  return { ok: true, status: paged.status, source: "kalshi", count: kept.length, contracts: kept, diag: paged.tried,
           drops, samples, raw: paged.raw || null, droppedForCap, seriesKept,
           note: `${kept.length} hurricane markets across ${seriesKept} series (${anchored} anchored) from ${paged.scanned} ${paged.mode}`
               + ` · dropped ${drops.noKeyword}kw/${drops.sports}sport/${drops.noPrice}px`
               + (droppedForCap ? ` · ${droppedForCap} BEYOND THE ${MAX_CONTRACTS}-CONTRACT CEILING` : "") };
}

async function fetchPolymarket(storms, clims, oni, std) {
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
    const anchor = climatologyAnchor(title, strike, clims, null, oni, std);
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
/* ---------------- assemble ---------------- */
async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const { feed: nhcFeed, storms } = await fetchStorms();

  /* THE INGESTION DAEMON. Four feeds that land before the advisory does: the ATCF decks,
     aircraft reconnaissance, SHIPS and the latest scatterometer pass. Run immediately
     after the storm list because everything downstream — the anchor, the frame, the
     register — reads what it attaches. A failure in any of them degrades the estimate to
     what the advisory alone supports; none of them can block the board. */
  const intel = await ingestIntel(storms, { nowMs: now.getTime() });
  applyIntel(storms, intel);

  /* The previous committed snapshot, read ONLY to answer "what is new". Every one of the
     four products sits in a file that is re-read every tick, so arrival can be decided
     nowhere else. */
  let prevLatest = null;
  try { prevLatest = JSON.parse(await readFile(resolve(DATA_DIR, "latest.json"), "utf8")); } catch { /* first run */ }

  // Pre-genesis areas. Independent of whether anything is classified yet.
  const outlook = await fetchOutlook();
  // ...and the polygons NHC draws for them, so the map can show WHERE, not just a list.
  const shapes = await fetchOutlookShapes(outlook.areas);
  outlook.areas = shapes.areas;

  // Climatology baseline first — it supplies the fair-value anchor for seasonal contracts.
  const { feed: climFeed, clim, clims } = await fetchClimatology();

  // ENSO phase (L3). Fetched before the markets so every anchor carries the same
  // stratification; a failure here degrades the stack to L1, it never blocks it.
  const { feed: ensoFeed, oni } = await fetchEnso();

  // Season-to-date (L2). Same rule: a failure degrades the stack, it never blocks it —
  // and a partial read publishes nothing, because an undercount would inflate every
  // "more than N" probability in a direction an operator could not see.
  const stdFeed = await fetchSeasonToDate(now.getUTCFullYear());
  const std = stdFeed.ok ? stdFeed.counts : null;

  // markets: Kalshi first, fall back to Polymarket if Kalshi unreachable/empty.
  // BOTH attempts are recorded — a silent fallback previously hid a Kalshi failure
  // behind a healthy-looking Polymarket "0 markets".
  const kal = await fetchKalshi(storms, clims, oni, std);
  let poly = null;
  if (!kal.ok || kal.count === 0) poly = await fetchPolymarket(storms, clims, oni, std);
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


  // events: one per active advisory (real), pinned to now
  const events = storms.filter((s) => s.advNum).map((s) => ({
    tsZ: s.advTimeZ || nowIso, kind: "advisory",
    label: `${s.name} Advisory #${s.advNum} — ${s.full_cls}, ${s.wind ?? "?"} kt`,
    source: "NHC", tier: "A", hot: (s.wind ?? 0) >= 96,
  }));
  /* ARRIVALS. A new recon fix, a new guidance cycle, a new SHIPS run, a new pass — each
     becomes a register row at the moment it lands, which is the whole point of polling
     ahead of the advisory. Diffed against the previous snapshot so a file that has not
     changed produces no row; a register that restates the same message every ten minutes
     stops being read. */
  const arrivals = arrivalEvents(prevLatest, storms, nowIso);
  events.push(...arrivals);

  const feeds = {
    nhc: nhcFeed,
    markets: { ok: !!mkt.ok, status: mkt.status, source: mkt.source, count: mkt.count || 0, note: mkt.note,
               seriesKept: mkt.seriesKept || null, droppedForCap: mkt.droppedForCap || 0, attempts: marketAttempts },
    models: climFeed.ok
      ? Object.assign({}, climFeed, { note: climFeed.note + " — seasonal count contracts only; per-storm intensity has no fitted model" })
      : Object.assign({}, climFeed, { note: (climFeed.note || "unavailable") + " — no fair-value anchor; allocations stay deferred" }),
    climatology: climFeed.ok ? { ok: true, source: climFeed.source, file: clim && clim.file, seasons: clim ? clim.years.length : 0,
      basins: climFeed.basins || null,
      hurricanesPerSeason: clim ? clim.hurricanes : null, majorPerSeason: clim ? clim.major : null, years: clim ? clim.years : null } : { ok: false, note: climFeed.note },
    seasonToDate: stdFeed,
    satellite: { ok: true, source: "NASA GIBS VIIRS/NOAA-20", note: "probed live in the browser" },
    enso: ensoFeed,
    outlook: { ok: outlook.ok, status: outlook.status, source: outlook.source, count: outlook.count,
               note: outlook.note, latencyMs: outlook.latencyMs, attempts: outlook.attempts },
    outlookShapes: shapes.feed,
    /* The four pre-advisory feeds, reported exactly like every other feed so they appear
       in the health panel, the claim registry and the attention queue without a special
       case. ATCF and recon are CORE — the coverage gate fails the build when either is
       missing on an active system. */
    atcf: intel.feeds.atcf,
    recon: intel.feeds.recon,
    ships: intel.feeds.ships,
    ascat: intel.feeds.ascat,
  };

  const latest = {
    schema: "millibar-terminal/1", generatedAt: nowIso, stepMin: STEP_MIN,
    note: storms.length ? null
      : (outlook.areas.length
          ? `No CLASSIFIED tropical cyclones. ${outlook.areas.length} area(s) under NHC watch — see the genesis outlook below.`
          : "No active tropical cyclones and no areas under watch — honest current condition, not an error."),
    feeds, storms, contracts, models: [], events,
    outlook: outlook.ok ? outlook.areas : [],
    enso: oni ? {
      ok: true, source: oni.source, phase: oni.phase, phaseLabel: PHASE_LABEL[oni.phase],
      anchorSeas: oni.anchorSeas, anchorYear: oni.anchorYear, anchorAnom: oni.anchorAnom,
      assumed: oni.assumed, ageMonths: oni.ageMonths, seasons: oni.seasons, recent: oni.recent,
      // Atlantic stratification. fetchClimatology reports ok when ANY basin parsed,
      // so an Atlantic-only failure must degrade this to null rather than throw.
      climate: clim ? ensoClimate(clim, oni) : null,
    } : { ok: false, note: ensoFeed.note },
  };

  // append a frame to the rolling history
  let framesJson = { schema: "millibar-terminal-frames/1", stepMin: STEP_MIN, frames: [] };
  try { framesJson = JSON.parse(await readFile(resolve(DATA_DIR, "frames.json"), "utf8")); } catch { /* first run */ }
  if (!Array.isArray(framesJson.frames)) framesJson.frames = [];
  const frameStorms = {}, frameContracts = {};
  /* The advisory state goes into the FRAME, not only into latest.json. Without it the
     replay history cannot show P(hurricane) moving, the signal register cannot emit an
     event when an advisory lands, and the Situation strip has nothing to react to — the
     number changed on the page and nothing on the board recorded that it had. Four small
     scalars per storm per frame; the contract rows dwarf it. */
  const rr = (v, n) => (v == null || !Number.isFinite(v) ? null : Math.round(v * n) / n);
  storms.forEach((s) => {
    const hp = s.hurricaneP || null;
    const gI = s.discussion && s.discussion.guidance && s.discussion.guidance.intensity;
    const cal = s.hurricanePCal || null;
    const con = s.consensus || null;
    const rec = s.recon && s.recon.ok ? s.recon : null;
    const sh = s.ships || null;
    const asc = s.ascat || null;
    const ageOf = (iso) => { const t = Date.parse(iso || ""); return t ? Math.round((now.getTime() - t) / 60000) : null; };
    frameStorms[s.id] = {
      wind: s.wind, pressure: s.pressure, center: s.center,
      modelCat4: s.modelCat4, marketCat4: s.marketCat4,
      /* reconAge stops being a permanent null. It has always been on the frame and in the
         evidence-quality tier; there was simply never a feed behind it. */
      reconAge: rec ? ageOf(rec.fixIso) : s.reconAge,
      advNum: s.advNumFull || s.advNum || null,
      advisoryLagMin: s.advisoryLagMin ?? null,
      hurricaneP: hp && hp.p != null ? Math.round(hp.p * 10000) / 10000 : null,
      peakKt: hp ? hp.peakKt ?? null : null,
      peakHr: hp ? hp.peakHr ?? null : null,
      guidance: gI ? gI.position : null,
      /* ---- the four ingested feeds, ON THE FRAME ---------------------------------
         Not in latest.json only. A field that exists solely on the newest snapshot
         cannot be diffed, which means it cannot raise a register row, cannot move under
         the scrubber, and cannot be seen to have changed — the number moves on the page
         and nothing on the board records that it did. Every one of these is a scalar;
         the contract rows dwarf them. */
      // Priority 1 — the pre-advisory guidance consensus
      conKt: con ? rr(con.peakKt, 10) : null,
      conHr: con ? con.peakHr ?? null : null,
      conSpread: con ? rr(con.spreadKt, 10) : null,
      conN: con ? con.n : null,
      conCycle: con ? con.cycle : null,
      // Priority 2 — aircraft reconnaissance
      reconMb: rec ? rec.mslp ?? null : null,
      reconKt: rec ? rec.intensityKt ?? null : null,
      reconFlKt: rec ? rec.flightLevelKt ?? null : null,
      reconOb: rec ? rec.obNumber ?? null : null,
      // Priority 3 — SHIPS features
      shShear: sh ? sh.features.shearKt ?? null : null,
      shOhc: sh ? sh.features.ohc ?? null : null,
      shRh: sh ? sh.features.rhMid ?? null : null,
      shMpi: sh ? sh.features.mpiKt ?? null : null,
      shRi: s.riFloor ? rr(s.riFloor.p, 1000) : null,
      // Priority 4 — the latest scatterometer pass
      ascatKt: asc ? asc.kt ?? null : null,
      ascatAge: asc ? ageOf(asc.iso) : null,
      // the engine's output, raw and calibrated together
      pCal: cal ? rr(cal.p, 10000) : null,
      pRaw: cal ? rr(cal.pRaw, 10000) : (s.hurricaneP ? rr(s.hurricaneP.p, 10000) : null),
      pSigma: cal ? rr(cal.sigmaKt, 10) : null,
      quality: s.evidenceQuality ? s.evidenceQuality.tier : null,
    };
  });
  // 4dp is well past tick size; "model": 0.919047619047619 was ~14 wasted bytes per
  // contract per frame, which matters once every listed market is carried.
  const r4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000);
  contracts.forEach((c) => { frameContracts[c.id] = { market: r4(c.market), model: r4(c.model) }; });
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
  console.log(`  climatology: ${climFeed.ok ? climFeed.source + " · " + (clim ? clim.years.length + " seasons" : "Atlantic MISSING") + " · " + (climFeed.note || "") : "FAIL — " + climFeed.note}`);
  console.log(`  ENSO: ${ensoFeed.ok ? ensoFeed.source + " · " + ensoFeed.note : "FAIL — " + ensoFeed.note}`);
  console.log(`  outlook: ${outlook.ok ? outlook.note : "FAIL — " + outlook.note}`);
  for (const k of ["atcf", "recon", "ships", "ascat"]) {
    console.log(`  ${k}: ${feeds[k].ok ? "ok" : "FAIL"} — ${feeds[k].note}`);
  }
  for (const s of storms) {
    const cal = s.hurricanePCal;
    console.log(`    · ${s.name} ${s.evidenceQuality ? "[" + s.evidenceQuality.tier + "]" : ""}`
      + (cal ? ` P(hurricane) raw ${Math.round(cal.pRaw * 100)}% → calibrated ${Math.round(cal.p * 100)}%`
             + ` · combined ${cal.meanKt} kt ±${cal.sigmaKt} · driven by the ${cal.drivenBy}`
             + ` · used ${Object.entries(cal.used).filter(([, v]) => v).map(([k2]) => k2).join("+") || "nothing"}`
           : " no calibrated probability"));
    for (const n of ((cal && cal.notes) || [])) console.log(`        ${n}`);
  }
  if (arrivals.length) for (const a of arrivals) console.log(`    NEW [${a.kind}] ${a.label}`);
  for (const a of outlook.areas) console.log(`    · ${a.basin} #${a.n} ${a.id || "(no id)"} ${a.title} — ${a.pct48}%/48h ${a.pct7d}%/7d`);
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

export { parseOniAscii, parseOniPsl, buildOni, phaseOf, posteriorFor, parseHurdat2, seriesQuantity, parseTWO, diagnoseTWO,
         namePosition, ordinalOutcome, namingAnchor, climatologyAnchor, parseBdeck, oniWeights, weightedRate,
         parseForecastAdvisory, parseAdvisoryNow, parseWatchesWarnings, parseDiscussion, reachesHurricaneP, INTENSITY_MAE, stormAnchor,
         priceOf, askPriceOf, spreadOf, depthOf, liquidityOf, volumeOf, volume24hOf, openInterestOf, notionalOf };
