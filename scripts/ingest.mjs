#!/usr/bin/env node
/* THE INGESTION DAEMON — the four feeds that arrive before the advisory does.
 *
 * Everything this terminal priced used to come from products NHC publishes for the
 * public: the advisory, the discussion, the outlook. Those are the same products the
 * market reads, at the same moment, so no amount of care in the arithmetic downstream
 * could produce a number that was EARLIER than the price it was being compared against.
 *
 * These four are earlier, in descending order of how much earlier:
 *
 *   1. ATCF DECKS (a/b/f). The a-deck carries the model guidance the forecaster is
 *      looking at while writing the advisory — HCCA, the variable consensus, DeepMind —
 *      and it lands 30-60 minutes before the advisory built on it. The b-deck carries the
 *      best track as it is being written. The f-deck carries every fix: satellite,
 *      scatterometer, aircraft.
 *   2. AIRCRAFT RECONNAISSANCE (URNT12 / URPN11 / URPN12 KNHC). A measurement, not an
 *      estimate, transmitted the moment the aircraft leaves the eye — typically well over
 *      an hour before the intermediate advisory that reports it.
 *   3. SHIPS. The environment the forecast is standing on, 6-hourly, plus NHC's own
 *      calibrated rapid-intensification probabilities.
 *   4. ASCAT. Objective surface winds and wind radii from the latest scatterometer pass,
 *      which is intermittent by nature — an orbit either crossed the storm or it did not.
 *
 * THE HONESTY CONTRACT IS UNCHANGED. Every feed is wrapped independently. A failure
 * records {ok:false, status, note} with every attempt it made, and the value stays null.
 * Nothing here invents a fix, a consensus, a diagnostic or a pass.
 *
 * WHAT IT WRITES. Nothing directly — it returns a normalised object. fetch-data.mjs puts
 * the fields on the storms, on every frame, and into the register. Keeping the fetching
 * here means the parsers stay pure and the whole ingest can be exercised on its own:
 *
 *   node scripts/ingest.mjs                 # live report against the current storms
 *   node scripts/ingest.mjs --storm CP012026
 */
import { gunzipSync } from "node:zlib";
import { parseAdeck, parseBestTrack, parseFdeck, consensusFrom, latestScatPass, latestAircraftFix, deckStem } from "./lib/atcf.mjs";
import { parseVDM, parseReccoHeader, vdmKey } from "./lib/recon.mjs";
import { parseShips, shipsFileName, shipsCycles } from "./lib/ships.mjs";

const UA = "MillibarTerminal/1.0 (+https://github.com; institutional weather research dashboard)";
const ATCF = process.env.MT_ATCF_BASE || "https://ftp.nhc.noaa.gov/atcf";
const TGFTP = process.env.MT_TGFTP_BASE || "https://tgftp.nws.noaa.gov/data/raw/ur";
/* A runaway guard on the a-deck, which is the only file here that can be large: a
   long-lived storm's guidance deck reaches a couple of megabytes compressed. It is a
   guard, not a silent trim — anything it refuses is reported. */
const ADECK_MAX_BYTES = Number(process.env.MT_ADECK_MAX || 12 * 1024 * 1024);

async function getBuf(url, { timeout = 25000, gzip = false } = {}) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA, Accept: "*/*" } });
    const buf = Buffer.from(await r.arrayBuffer());
    const latencyMs = Date.now() - t0;
    if (!r.ok) return { ok: false, status: r.status, latencyMs, url, error: `HTTP ${r.status}` };
    if (buf.length > ADECK_MAX_BYTES) return { ok: false, status: r.status, latencyMs, url, error: `${buf.length} bytes exceeds the ${ADECK_MAX_BYTES}-byte ceiling` };
    let text;
    try { text = gzip ? gunzipSync(buf).toString("utf8") : buf.toString("utf8"); }
    catch (e) { return { ok: false, status: r.status, latencyMs, url, error: "decompress failed: " + e.message }; }
    return { ok: true, status: r.status, latencyMs, url, text, bytes: buf.length };
  } catch (e) {
    return { ok: false, status: 0, latencyMs: Date.now() - t0, url, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(timer); }
}

/* Several candidate URLs, tried in order, EVERY ATTEMPT RECORDED. The same shape the
   outlook fetcher uses, and for the same reason: when a source moves, the next cycle
   should say which URLs were tried and what each one answered, rather than leaving
   somebody to guess at it a second time. */
async function tryUrls(urls, opts) {
  const attempts = [];
  for (const u of urls) {
    const r = await getBuf(u, opts);
    attempts.push({ url: u, ok: r.ok, status: r.status, latencyMs: r.latencyMs, bytes: r.bytes ?? null, error: r.error || null });
    if (r.ok) return { ...r, attempts };
  }
  return { ok: false, status: attempts.length ? attempts[attempts.length - 1].status : 0, attempts,
           error: attempts.length ? attempts[attempts.length - 1].error : "no candidates" };
}

/* ---------------- Priority 1: ATCF a / b / f decks ---------------- */

export async function fetchDecks(stormId) {
  const s = deckStem(stormId);
  if (!s) return { ok: false, note: `"${stormId}" is not an ATCF storm id — refusing to guess a deck name` };

  const [a, b, f] = await Promise.all([
    tryUrls([`${ATCF}/aid_public/a${s.stem}.dat.gz`], { gzip: true, timeout: 45000 }),
    tryUrls([`${ATCF}/btk/b${s.stem}.dat`], {}),
    tryUrls([`${ATCF}/fix/f${s.stem}.dat`], {}),
  ]);

  const adeck = a.ok ? parseAdeck(a.text) : null;
  const bdeck = b.ok ? parseBestTrack(b.text) : null;
  const fdeck = f.ok ? parseFdeck(f.text) : null;
  const consensus = adeck ? consensusFrom(adeck) : null;

  return {
    ok: !!(adeck && adeck.ok),
    stem: s.stem,
    status: a.status,
    latencyMs: a.latencyMs ?? null,
    bytes: a.bytes ?? null,
    consensus,
    /* The deck census travels with the result. A null consensus is ambiguous on its own,
       and this is what disambiguates it. */
    cycle: adeck && adeck.ok ? adeck.latestCycle : null,
    techCount: adeck && adeck.ok ? Object.keys(adeck.techs).length : 0,
    forecastAids: adeck && adeck.ok ? adeck.forecastTechs.length : 0,
    bestTrack: bdeck && bdeck.ok ? bdeck.latest : null,
    bestTrackRecords: bdeck && bdeck.ok ? bdeck.records.length : 0,
    scat: fdeck ? latestScatPass(fdeck) : null,
    aircraftFix: fdeck ? latestAircraftFix(fdeck) : null,
    fixCount: fdeck && fdeck.ok ? fdeck.fixes.length : 0,
    attempts: { adeck: a.attempts, bdeck: b.attempts, fdeck: f.attempts },
    note: adeck && adeck.ok
      ? `a-deck cycle ${adeck.latestCycle} · ${Object.keys(adeck.techs).length} techs`
        + (consensus ? ` · consensus ${consensus.n} member(s) peak ${consensus.peakKt} kt` : " · NO CONSENSUS AID IN THIS CYCLE")
        + (bdeck && bdeck.ok ? ` · b-deck ${bdeck.records.length} records` : " · b-deck unavailable")
        + (fdeck && fdeck.ok ? ` · f-deck ${fdeck.fixes.length} fixes` : " · f-deck unavailable")
      : (a.error || "a-deck unavailable"),
  };
}

/* ---------------- Priority 2: aircraft reconnaissance ---------------- */

/* The four products the desk asked for. The *12 pair are Vortex Data Messages and carry
   the numbers; the *11 pair are RECCO-coded and their ARRIVAL is the signal, because this
   build does not decode the digits and will not pretend to.
   TGFTP writes these with an empty AWIPS field, hence the double dot in the filename —
   established by reading the directory, not by guessing twice. */
export const RECON_PRODUCTS = [
  { id: "URNT12 KNHC", kind: "vdm", basin: "Atlantic", urls: [`${TGFTP}/urnt12.knhc..txt`, `${TGFTP}/urnt12.knhc.txt`] },
  { id: "URPN12 KNHC", kind: "vdm", basin: "Pacific", urls: [`${TGFTP}/urpn12.knhc..txt`, `${TGFTP}/urpn12.knhc.txt`] },
  { id: "URNT11 KNHC", kind: "recco", basin: "Atlantic", urls: [`${TGFTP}/urnt11.knhc..txt`, `${TGFTP}/urnt11.knhc.txt`] },
  { id: "URPN11 KNHC", kind: "recco", basin: "Pacific", urls: [`${TGFTP}/urpn11.knhc..txt`, `${TGFTP}/urpn11.knhc.txt`] },
];

export async function fetchRecon(nowMs) {
  const attempts = [], vdms = [], reccos = [];
  for (const p of RECON_PRODUCTS) {
    const r = await tryUrls(p.urls, { timeout: 20000 });
    attempts.push({ product: p.id, ok: r.ok, status: r.status, latencyMs: r.latencyMs ?? null,
                    error: r.error || null, tried: (r.attempts || []).map((a) => a.url) });
    if (!r.ok) continue;
    if (p.kind === "vdm") {
      const v = parseVDM(r.text, nowMs);
      if (v.ok) vdms.push({ ...v, product: p.id });
      else attempts[attempts.length - 1].parse = v.note + (v.sample ? " · " + v.sample : "");
    } else {
      const c = parseReccoHeader(r.text);
      if (c.ok) reccos.push({ ...c, product: p.id });
    }
  }
  return {
    ok: attempts.some((a) => a.ok),
    polled: RECON_PRODUCTS.length,
    vdms, reccos, attempts,
    note: vdms.length
      ? `${vdms.length} vortex data message(s): ` + vdms.map((v) => `${v.stormId} ${v.fixIso ? v.fixIso.slice(11, 16) + "Z" : "?"}`).join(", ")
      : attempts.some((a) => a.ok)
        ? `${RECON_PRODUCTS.length} products polled, no current vortex data message — no aircraft is reporting`
        : "no recon product reachable",
  };
}

/* A VDM sits in its "latest" file until the next one replaces it, so the Atlantic file
 * routinely holds a message about a storm that dissipated weeks ago. Matching on storm id
 * is what stops a July fix being attached to an August storm — the single most dangerous
 * thing this loader could do, because a stale measurement is indistinguishable from a
 * fresh one once it is a number on a card. */
export function vdmForStorm(recon, stormId) {
  if (!recon || !recon.vdms) return null;
  const id = String(stormId || "").toUpperCase();
  const hits = recon.vdms.filter((v) => v.stormId === id);
  if (!hits.length) return null;
  return hits.sort((a, b) => (Date.parse(a.fixIso || 0) || 0) - (Date.parse(b.fixIso || 0) || 0))[hits.length - 1];
}

/* ---------------- Priority 3: SHIPS ---------------- */

export async function fetchShips(stormId, nowMs) {
  const cycles = shipsCycles(nowMs, 4);
  const attempts = [];
  for (const c of cycles) {
    const name = shipsFileName(stormId, c);
    if (!name) return { ok: false, note: `"${stormId}" is not an ATCF storm id`, attempts };
    const r = await getBuf(`${ATCF}/stext/${name}`, { timeout: 20000 });
    attempts.push({ url: r.url, ok: r.ok, status: r.status, latencyMs: r.latencyMs, error: r.error || null });
    if (!r.ok) continue;
    const s = parseShips(r.text);
    if (!s.ok) { attempts[attempts.length - 1].parse = s.note; continue; }
    return { ok: true, status: r.status, latencyMs: r.latencyMs, ships: s, file: name, attempts,
             note: `${s.cycleIso.slice(0, 16)}Z · shear ${s.features.shearKt ?? "—"} kt · OHC ${s.features.ohc ?? "—"}`
                 + ` · MPI ${s.features.mpiKt ?? "—"} kt · ${s.ri.thresholds.length} RI thresholds` };
  }
  return { ok: false, status: attempts.length ? attempts[attempts.length - 1].status : 0, attempts,
           note: `no SHIPS file for the last ${cycles.length} synoptic cycles — the run may not have landed yet` };
}

/* ---------------- the daemon ---------------- */

/* One pass over every active storm. Storm-level fetches run concurrently because they are
   independent and the whole ingest sits inside a 10-minute refresh tick; the recon poll is
   basin-wide and runs once for all of them. */
export async function ingestIntel(storms, opts) {
  const o = opts || {};
  const nowMs = o.nowMs != null ? o.nowMs : Date.now();
  const list = (storms || []).filter((s) => s && s.id);

  const recon = await fetchRecon(nowMs);

  const perStorm = await Promise.all(list.map(async (s) => {
    const [decks, ships] = await Promise.all([fetchDecks(s.id), fetchShips(s.id, nowMs)]);
    return { id: s.id, name: s.name, decks, ships, vdm: vdmForStorm(recon, s.id) };
  }));

  const byStorm = {};
  for (const r of perStorm) {
    byStorm[r.id] = {
      atcf: r.decks && r.decks.ok ? r.decks : null,
      atcfNote: r.decks ? r.decks.note : "not attempted",
      consensus: r.decks && r.decks.ok ? r.decks.consensus : null,
      deck: r.decks && r.decks.ok
        ? { cycle: r.decks.cycle, techCount: r.decks.techCount, forecastAids: r.decks.forecastAids } : null,
      bestTrack: r.decks ? r.decks.bestTrack : null,
      recon: r.vdm || null,
      aircraftFix: r.decks ? r.decks.aircraftFix : null,
      ascat: r.decks ? r.decks.scat : null,
      ships: r.ships && r.ships.ok ? r.ships.ships : null,
      shipsNote: r.ships ? r.ships.note : "not attempted",
    };
  }

  /* Feed records in the shape the health panel and the claim registry already consume, so
     these four rows appear next to the others without a special case anywhere. */
  const okAtcf = perStorm.filter((r) => r.decks && r.decks.ok);
  const okShips = perStorm.filter((r) => r.ships && r.ships.ok);
  const scats = perStorm.filter((r) => r.decks && r.decks.scat);
  const feeds = {
    atcf: {
      ok: list.length === 0 ? true : okAtcf.length > 0,
      source: "NHC ATCF a/b/f decks", url: `${ATCF}/aid_public/`,
      status: okAtcf.length ? okAtcf[0].decks.status : (perStorm[0] && perStorm[0].decks ? perStorm[0].decks.status : null),
      latencyMs: okAtcf.length ? okAtcf[0].decks.latencyMs : null,
      count: okAtcf.length,
      note: list.length === 0
        ? "no active systems — no deck to read"
        : `${okAtcf.length}/${list.length} storm decks read · ` + perStorm.map((r) => `${r.id}: ${r.decks ? r.decks.note : "not attempted"}`).join(" | "),
      attempts: perStorm.map((r) => ({ source: r.id, ok: !!(r.decks && r.decks.ok), status: r.decks ? r.decks.status : null, note: r.decks ? r.decks.note : "not attempted" })),
    },
    recon: {
      ok: recon.ok, source: "TGFTP " + RECON_PRODUCTS.map((p) => p.id.split(" ")[0].toUpperCase()).join("/"),
      url: TGFTP, status: recon.attempts.length ? recon.attempts[0].status : null,
      latencyMs: recon.attempts.length ? recon.attempts[0].latencyMs : null,
      count: recon.vdms.length, note: recon.note,
      attempts: recon.attempts.map((a) => ({ source: a.product, ok: a.ok, status: a.status, note: a.error || a.parse || "polled" })),
    },
    ships: {
      ok: list.length === 0 ? true : okShips.length > 0,
      source: "NHC ATCF SHIPS (stext)", url: `${ATCF}/stext/`,
      status: okShips.length ? okShips[0].ships.status : null,
      latencyMs: okShips.length ? okShips[0].ships.latencyMs : null,
      count: okShips.length,
      note: list.length === 0 ? "no active systems — no diagnostics to read"
          : `${okShips.length}/${list.length} storms · ` + perStorm.map((r) => `${r.id}: ${r.ships ? r.ships.note : "not attempted"}`).join(" | "),
      attempts: perStorm.map((r) => ({ source: r.id, ok: !!(r.ships && r.ships.ok), status: r.ships ? r.ships.status : null, note: r.ships ? r.ships.note : "not attempted" })),
    },
    ascat: {
      /* Intermittent BY DESIGN. A cycle with no pass is the normal state of a
         scatterometer, not an outage, so this reports ok with a count of zero rather than
         raising a feed alarm that would train an operator to ignore feed alarms. */
      ok: true, source: "ATCF f-deck scatterometer fixes", url: `${ATCF}/fix/`,
      count: scats.length,
      note: list.length === 0 ? "no active systems"
          : scats.length
            ? scats.map((r) => `${r.id}: ${r.decks.scat.type} ${r.decks.scat.iso ? r.decks.scat.iso.slice(11, 16) + "Z" : "?"} ${r.decks.scat.kt ?? "—"} kt`).join(" | ")
            : "no scatterometer pass over any active system this cycle — intermittent by nature, not a failure",
    },
  };

  return { byStorm, feeds, recon, nowMs };
}

/* ---- arrival detection --------------------------------------------------------------
 * The register's question is "what is NEW", and every one of these products sits in a
 * file that is re-read on every tick. Identity is what makes an arrival an arrival: a
 * VDM's fix time and observation number, a deck's cycle, a SHIPS run's cycle, a pass's
 * time. Comparing those against the previous committed snapshot is the only place this
 * can be decided, because it is the only place the previous state exists.
 */
export function arrivalEvents(prevLatest, storms, nowIso) {
  const prev = {};
  for (const s of ((prevLatest && prevLatest.storms) || [])) prev[s.id] = s;
  const events = [];
  for (const s of storms) {
    const p = prev[s.id] || {};
    const nm = s.name || s.id;

    /* Recon first: it is the one that moves a market. */
    const v = s.recon, pv = p.recon;
    if (v && v.ok && vdmKey(v) && vdmKey(v) !== vdmKey(pv)) {
      const bits = [];
      if (v.mslp != null) bits.push(`${v.mslp} mb${v.extrapolated ? " (extrapolated)" : ""}`);
      if (v.surfaceKt != null) bits.push(`${v.surfaceKt} kt surface`);
      if (v.flightLevelKt != null) bits.push(`${v.flightLevelKt} kt flight level`);
      const dP = (pv && pv.mslp != null && v.mslp != null) ? v.mslp - pv.mslp : null;
      events.push({
        tsZ: v.fixIso || nowIso, kind: "recon", stormId: s.id,
        label: `${nm} reconnaissance fix — ` + (bits.join(", ") || "no numbers in the message")
             + (dP != null && dP !== 0 ? ` · ${dP > 0 ? "+" : ""}${dP} mb since the last fix` : ""),
        detail: (v.mission ? `${v.mission.aircraft} mission ${v.mission.number}` + (v.obNumber != null ? ` observation ${v.obNumber}` : "") : "aircraft reconnaissance")
              + " — measured, not estimated",
        source: v.product || "TGFTP recon", tier: "A",
        /* A pressure fall of this size between fixes is a storm doing something, and the
           board should be loud about it. */
        hot: (dP != null && dP <= -5) || (v.surfaceKt != null && v.surfaceKt >= 64),
      });
    }

    /* The pre-advisory consensus. A new a-deck cycle IS the head start. */
    const c = s.consensus, pc = p.consensus;
    if (c && c.cycle && (!pc || pc.cycle !== c.cycle)) {
      const d = (pc && pc.peakKt != null && c.peakKt != null) ? c.peakKt - pc.peakKt : null;
      events.push({
        tsZ: c.cycleIso || nowIso, kind: "consensus", stormId: s.id,
        label: `${nm} guidance consensus ${c.cycle.slice(-2)}Z — peak ${c.peakKt} kt`
             + (d != null && Math.abs(d) >= 1 ? ` (${d > 0 ? "+" : ""}${Math.round(d)} kt on the cycle)` : ""),
        detail: `${c.n} aid${c.n === 1 ? "" : "s"} (${c.members.map((m) => m.tech).join(", ")})`
              + (c.spreadKt != null ? ` disagreeing by ${c.spreadKt} kt` : "")
              + " — in the deck before the advisory built on it",
        source: "NHC ATCF a-deck", tier: "A",
        hot: d != null && Math.abs(d) >= 10,
      });
    }

    /* SHIPS and a scatterometer pass are quieter arrivals; they are recorded because a
       register that only records the loud things stops being a record. */
    const sh = s.ships, psh = p.ships;
    if (sh && sh.cycleIso && (!psh || psh.cycleIso !== sh.cycleIso)) {
      const ri = (sh.ri && sh.ri.thresholds && sh.ri.thresholds[0]) || null;
      events.push({
        tsZ: sh.cycleIso, kind: "ships", stormId: s.id,
        label: `${nm} SHIPS ${sh.cycleIso.slice(11, 13)}Z — shear ${sh.features.shearKt ?? "—"} kt, OHC ${sh.features.ohc ?? "—"}, MPI ${sh.features.mpiKt ?? "—"} kt`,
        detail: ri ? `RI ${Math.round(ri.p * 100)}% for ${ri.dvKt} kt in ${ri.hours}h against a ${Math.round(ri.climoP * 100)}% base rate — published, scored only under an operator claim`
                   : "no RI table in this run",
        source: "NHC ATCF SHIPS", tier: "A", hot: false,
      });
    }
    const a = s.ascat, pa = p.ascat;
    if (a && a.iso && (!pa || pa.iso !== a.iso)) {
      events.push({
        tsZ: a.iso, kind: "ascat", stormId: s.id,
        label: `${nm} scatterometer pass (${a.type}) — ${a.kt != null ? a.kt + " kt objective surface wind" : "position only"}`,
        detail: "objective surface winds" + (Object.keys(a.radii || {}).length ? " and wind radii" : ", no radii in this pass")
              + " — tightens the current-intensity band when no aircraft is in the storm",
        source: "ATCF f-deck", tier: "A", hot: false,
      });
    }
  }
  return events;
}

/* ---- CLI ---------------------------------------------------------------------------
   Runs the whole ingest against the live storm list and prints what each feed answered.
   This is the diagnostic path: when a deck moves or a product is renamed, run this and
   the attempts are all printed rather than inferred from a blank panel. */
async function cli() {
  const argStorm = (() => { const i = process.argv.indexOf("--storm"); return i > 0 ? process.argv[i + 1] : null; })();
  let storms;
  if (argStorm) storms = [{ id: argStorm.toUpperCase(), name: argStorm.toUpperCase() }];
  else {
    const r = await getBuf("https://www.nhc.noaa.gov/CurrentStorms.json");
    if (!r.ok) { console.error("[ingest] CurrentStorms unreachable:", r.error); process.exit(1); }
    const j = JSON.parse(r.text);
    storms = ((j.activeStorms || j.storms) || []).map((s) => ({ id: String(s.id || "").toUpperCase(), name: s.name }));
  }
  console.log(`[ingest] ${storms.length} active system(s): ${storms.map((s) => s.id + " " + s.name).join(", ") || "none"}`);
  const out = await ingestIntel(storms, {});
  for (const [k, f] of Object.entries(out.feeds)) {
    console.log(`\n  ${k.toUpperCase().padEnd(6)} ${f.ok ? "ok" : "FAIL"}  ${f.note}`);
    for (const a of (f.attempts || [])) console.log(`      · ${String(a.source).padEnd(12)} ok=${a.ok} status=${a.status} ${a.note || ""}`);
  }
  for (const [id, s] of Object.entries(out.byStorm)) {
    console.log(`\n  === ${id}`);
    if (s.consensus) {
      console.log(`      consensus ${s.consensus.cycle}: peak ${s.consensus.peakKt} kt @${s.consensus.peakHr}h, spread ${s.consensus.spreadKt} kt`);
      for (const m of s.consensus.members) console.log(`         ${m.tech.padEnd(5)} ${m.label.padEnd(34)} peak ${m.peakKt} kt @${m.peakHr}h`);
      if (s.consensus.missing.length) console.log(`         MISSING: ${s.consensus.missing.join(" · ")}`);
    } else console.log(`      consensus: none (${s.atcfNote})`);
    console.log(`      recon: ${s.recon ? `${s.recon.fixIso} ${s.recon.mslp} mb / ${s.recon.intensityKt} kt (${s.recon.intensitySource})` : "no VDM for this storm"}`);
    console.log(`      ships: ${s.ships ? s.ships.basis : s.shipsNote}`);
    console.log(`      ascat: ${s.ascat ? `${s.ascat.type} ${s.ascat.iso} ${s.ascat.kt} kt` : "no pass"}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("ingest.mjs")) {
  cli().catch((e) => { console.error("[ingest] fatal:", e); process.exit(1); });
}
