#!/usr/bin/env node
/* THE CALIBRATION LOOP — record every published probability, resolve it, score it.
 *
 * Runs after each fetch. Three jobs, in order:
 *
 *   1. RECORD.  Append a ledger entry for every active storm's current forecast, keyed on
 *               the state it was built from, so re-reading the same advisory and the same
 *               guidance cycle ten minutes later does not record the same forecast twice.
 *   2. RESOLVE. For any storm in the ledger that has left the active feed, fetch its
 *               b-deck and ask the only question that matters: did it ever reach 65 kt?
 *   3. SCORE.   Brier for the calibrated probability, the raw official estimate and the
 *               market price, side by side — refusing to publish a score until enough
 *               STORMS have resolved to make one mean anything.
 *
 * WHY THIS IS SEPARATE FROM fetch-data.mjs. The board must publish whether or not it can
 * be scored, and the scorer must be able to run over history without re-fetching the
 * world. Keeping them apart also means a failure here cannot stop the board publishing —
 * a scorecard is a report on the pipeline, and a report must never be able to break the
 * thing it reports on.
 *
 * SEEDING. On its first run the ledger is empty, but the committed replay frames hold up
 * to 32 hours of probabilities that were genuinely published at the times they carry. Those
 * are real forecasts and they are seeded in. Nothing older can be reconstructed — a
 * forecast that was never made cannot be backfilled, and this file will not invent one.
 *
 *   node scripts/calibrate.mjs            # record, resolve, score
 *   node scripts/calibrate.mjs --dry      # report without writing
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBestTrack, deckStem } from "./lib/atcf.mjs";
import { entryFrom, appendEntries, outcomeFromBestTrack, summarize,
         HURRICANE_REPORTED_KT, MIN_RESOLVED_STORMS } from "./lib/calibration.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = pathResolve(__dir, "../docs/data");
const ATCF = process.env.MT_ATCF_BASE || "https://ftp.nhc.noaa.gov/atcf";
const UA = "MillibarTerminal/1.0 (+https://github.com; institutional weather research dashboard)";
const DRY = process.argv.includes("--dry");
const NOW = Date.now();

async function readJson(name, dflt) {
  try { return JSON.parse(await readFile(pathResolve(DATA, name), "utf8")); } catch { return dflt; }
}

async function getText(url, timeout = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA, Accept: "*/*" } });
    if (!r.ok) return { ok: false, status: r.status, error: `HTTP ${r.status}` };
    return { ok: true, status: r.status, text: await r.text() };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally { clearTimeout(timer); }
}

/* The market price for a storm's own contract, at the moment of the forecast. Only a
   contract this board actually anchored on that storm counts — pricing the model against
   an unrelated ladder would be scoring it on a different question. */
function marketFor(contracts, stormId) {
  const c = (contracts || []).find((x) => x.storm === stormId && x.modelCalibrated);
  return c ? { pMarket: c.market ?? null, contractId: c.id } : { pMarket: null, contractId: null };
}

async function main() {
  const latest = await readJson("latest.json", null);
  const framesJson = await readJson("frames.json", { frames: [] });
  const log = await readJson("forecast-log.json", { schema: "millibar-forecast-log/1", entries: [] });
  if (!latest) { console.error("[calibrate] no latest.json — nothing to record"); process.exit(1); }

  const entries = [];

  /* ---- 1. RECORD: the current forecast for every active storm ---- */
  for (const s of (latest.storms || [])) {
    const cal = s.hurricanePCal;
    const { pMarket, contractId } = marketFor(latest.contracts, s.id);
    entries.push(entryFrom({
      stormId: s.id, name: s.name, tsZ: latest.generatedAt,
      advNum: s.advNumFull || s.advNum || null,
      conCycle: s.consensus ? s.consensus.cycle : null,
      pCal: cal && cal.ok ? cal.p : null,
      pRaw: s.hurricaneP ? s.hurricaneP.p : null,
      pMarket, contractId,
      used: cal && cal.ok ? cal.used : null,
      quality: s.evidenceQuality ? s.evidenceQuality.tier : null,
      advisoryLagMin: s.advisoryLagMin ?? null,
      currentKt: s.wind ?? null,
    }, { thresholdKt: HURRICANE_REPORTED_KT }));
  }

  /* ---- 1b. SEED from the committed frames ----
     These probabilities were genuinely published at the times the frames carry. Anything
     outside the retained window is gone and is not reconstructed. */
  const nameOf = {};
  for (const s of (latest.storms || [])) nameOf[s.id] = s.name;
  for (const fr of (framesJson.frames || [])) {
    for (const [sid, fs] of Object.entries(fr.storms || {})) {
      if (fs.pCal == null && fs.hurricaneP == null && fs.pRaw == null) continue;
      /* The market price AT THAT FRAME, not today's — scoring a past forecast against a
         present price would be marking it against information it never had. */
      const c = (latest.contracts || []).find((x) => x.storm === sid && x.modelCalibrated);
      const fc = c && fr.contracts ? fr.contracts[c.id] : null;
      entries.push(entryFrom({
        stormId: sid, name: nameOf[sid] || sid, tsZ: fr.tsZ,
        advNum: fs.advNum ?? null, conCycle: fs.conCycle ?? null,
        /* `pRaw` first: frames written by the current writer carry the raw estimate under
           that name, taken from the value the calibration was actually computed from.
           `hurricaneP` is the older name for the same number and answers for every frame
           still in the retained window. */
        pCal: fs.pCal ?? null, pRaw: fs.pRaw ?? fs.hurricaneP ?? null,
        pMarket: fc ? fc.market ?? null : null, contractId: c ? c.id : null,
        used: null, quality: fs.quality ?? null,
        advisoryLagMin: fs.advisoryLagMin ?? null, currentKt: fs.wind ?? null,
      }, { thresholdKt: HURRICANE_REPORTED_KT }));
    }
  }

  const appended = appendEntries(log.entries, entries.filter(Boolean));
  let ledger = appended.ledger;

  /* ---- 2. RESOLVE: storms that have left the active feed ---- */
  const active = new Set((latest.storms || []).map((s) => s.id));
  const unresolved = [...new Set(ledger.filter((e) => !e.resolved).map((e) => e.stormId))]
    .filter((id) => !active.has(id));
  const resolutions = [];
  for (const id of unresolved) {
    const stem = deckStem(id);
    if (!stem) { resolutions.push({ id, ok: false, note: "not an ATCF id" }); continue; }
    const r = await getText(`${ATCF}/btk/b${stem.stem}.dat`);
    if (!r.ok) { resolutions.push({ id, ok: false, note: r.error }); continue; }
    const bd = parseBestTrack(r.text);
    const outcome = bd.ok ? outcomeFromBestTrack(bd.records, HURRICANE_REPORTED_KT, { nowMs: NOW }) : null;
    if (!outcome) { resolutions.push({ id, ok: false, note: "b-deck carried no intensities" }); continue; }
    /* Only forecasts made BEFORE the outcome was known are scored. A forecast issued after
       the storm had already crossed the threshold is not a forecast of anything. */
    const crossMs = outcome.firstCrossIso ? Date.parse(outcome.firstCrossIso) : null;
    let scored = 0, excluded = 0;
    for (const e of ledger) {
      if (e.stormId !== id || e.resolved) continue;
      const tMs = Date.parse(e.tsZ || "");
      if (crossMs && tMs && tMs >= crossMs) { e.excluded = "made after the threshold was already crossed"; excluded++; continue; }
      e.resolved = outcome;
      e.leadHr = (crossMs && tMs) ? Math.round((crossMs - tMs) / 3600e3) : null;
      scored++;
    }
    resolutions.push({ id, ok: true, outcome: outcome.outcome, peakKt: outcome.peakKt,
                       provisional: outcome.provisional, scored, excluded });
  }

  /* ---- 3. SCORE ---- */
  const card = summarize(ledger, {});
  const out = {
    schema: "millibar-calibration/1", generatedAt: new Date(NOW).toISOString(),
    thresholdKt: HURRICANE_REPORTED_KT, minResolvedStorms: MIN_RESOLVED_STORMS,
    ...card,
  };

  if (!DRY) {
    await writeFile(pathResolve(DATA, "forecast-log.json"),
      JSON.stringify({ schema: "millibar-forecast-log/1", updatedAt: new Date(NOW).toISOString(), entries: ledger }) + "\n");
    await writeFile(pathResolve(DATA, "calibration.json"), JSON.stringify(out, null, 2) + "\n");
  }

  console.log(`[calibrate] ledger ${ledger.length} entries across ${out.counts.storms} storm(s) · +${appended.added} new`);
  for (const r of resolutions) {
    console.log(`  resolved ${r.id}: ` + (r.ok
      ? `${r.outcome ? "REACHED" : "did not reach"} ${HURRICANE_REPORTED_KT} kt (peak ${r.peakKt} kt)`
        + ` · ${r.scored} forecast(s) scored, ${r.excluded} excluded as after-the-fact`
        + (r.provisional ? " · PROVISIONAL, best track still settling" : "")
      : `NOT resolved — ${r.note}`));
  }
  if (out.ok) {
    console.log(`  Brier  calibrated ${out.brier.calibrated?.toFixed(4)} · raw ${out.brier.raw?.toFixed(4)}`
      + ` · market ${out.brier.market?.toFixed(4)} · climatology ${out.brier.climatology?.toFixed(4)}`);
    console.log(`  skill  vs climatology ${out.skill.vsClimatology?.toFixed(3)}`
      + ` · calibration vs raw ${out.skill.calibrationVsRaw?.toFixed(3)}`
      + ` · vs market ${out.skill.vsMarket?.toFixed(3)}`);
  } else {
    console.log(`  NO SCORE YET — ${out.note}`);
  }
  if (DRY) console.log("  (dry run — nothing written)");
}

main().catch((e) => { console.error("[calibrate] fatal:", e); process.exit(1); });
