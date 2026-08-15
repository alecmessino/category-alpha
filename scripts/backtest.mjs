#!/usr/bin/env node
/* Replay the probability engine over archived storms and score it against best tracks.
 *
 *   [historical a-decks] -> [simulate at time t] -> [score vs post-storm b-deck]
 *
 * Every read of the deck goes through the zero-peek gate. The archived file holds every
 * cycle the storm ever had, including the ones issued after the moment being simulated, so
 * the gate filters the RAW LINES by cycle before the parser ever sees them. What comes back
 * is the deck exactly as it stood at t, which means parseAdeck's own notion of "latest
 * cycle" is the operative one and consensusFrom needs no special casing.
 *
 * The estimator is imported from lib/estimator-core.mjs — the same function the live board
 * calls. Replaying a replica would score a model nobody trades.
 *
 * Usage:
 *   node scripts/backtest.mjs --year 2024 --basin al
 *   node scripts/backtest.mjs --year 2024 --basin al --limit 5
 *   node scripts/backtest.mjs --storms al012024,al092023
 *   node scripts/backtest.mjs --years 2022,2023,2024 --basin al
 *
 * Writes docs/data/backtest.json. Network-bound; not wired into any workflow.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { reachesHurricaneP, parseAdeck, consensusFrom, parseBestTrack,
         INTENSITY_MAE, LATENT_THRESHOLD, HURRICANE_REPORTED_KT } from "./lib/estimator-core.mjs";
import { calibratedIntensityP } from "./lib/probability.mjs";
import { cycleMs, visibleAt, milestones, outcomeFrom, entryOf, aggregate } from "./lib/backtest.mjs";
import { parseMessagesIndex, advisoryTimeline, advisoryInForce, cycleTransmitMs } from "./lib/advisories.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dir, "../docs/data");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const YEARS = (arg("years", arg("year", "2024")) || "").split(",").map((s) => s.trim()).filter(Boolean);
const BASIN = arg("basin", "al").toLowerCase();
const LIMIT = Number(arg("limit", 0)) || 0;
const STORMS = (arg("storms", "") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const archiveFor = (year) => `https://ftp.nhc.noaa.gov/atcf/archive/${year}/`;

async function get(url, binary) {
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return null;
    return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
  } catch { return null; }
}

/* Archived decks are gzipped. Try both suffixes rather than assuming the mirror's layout. */
async function deckText(year, stem, kind) {
  for (const suffix of [".dat.gz", ".dat"]) {
    const buf = await get(archiveFor(year) + kind + stem + suffix, true);
    if (!buf) continue;
    if (suffix.endsWith(".gz")) {
      try { return gunzipSync(buf).toString("utf8"); } catch { continue; }
    }
    return buf.toString("utf8");
  }
  return null;
}

async function listStorms(year) {
  const idx = await get(archiveFor(year));
  if (!idx) return [];
  const re = new RegExp("a(" + BASIN + "\\d{2}" + year + ")\\.dat", "gi");
  return [...new Set([...idx.matchAll(re)].map((m) => m[1].toLowerCase()))].sort();
}

/* THE ZERO-PEEK GATE, applied to raw text. Keeping it at the line level means nothing
   downstream — not the parser, not the consensus, not the estimator — can reach a cycle
   that had not been issued, because those lines are not in the string they are handed. */
function deckTextAt(lines, tMs, visibleAtMs) {
  const keep = [];
  for (const ln of lines) {
    const c = (ln.split(",")[2] || "").trim();
    /* A cycle becomes readable when ITS ADVISORY WENT OUT, not at its DTG. Gating on the
       DTG let the replay read guidance a median 2h41m before anyone had it — and that
       guidance had already absorbed the recon fix the engine was about to apply again. */
    const vis = visibleAtMs.get(c);
    if (vis != null && vis <= tMs) keep.push(ln);
  }
  return keep.join("\n");
}

/* One storm, replayed. The outcome is read from the b-deck only after every prediction for
   the storm has already been computed, and is never passed into the simulation. */
function replayStorm(stormId, aText, bRecords, timeline) {
  const truth = outcomeFrom(bRecords.map((r) => ({ vmax: r.kt, iso: r.iso })), HURRICANE_REPORTED_KT);
  const crossMs = truth && truth.firstCrossIso ? Date.parse(truth.firstCrossIso) : null;
  if (!truth) return { entries: [], skipped: "no usable best track" };

  const lines = aText.split(/\r?\n/).filter((l) => l.trim());
  const indexRows = lines.map((l) => ({ cycle: (l.split(",")[2] || "").trim() }));

  /* Every cycle mapped to the moment its advisory transmitted. A cycle whose advisory is
     absent from the archive (WPC-issued, mostly post-tropical) maps to nothing and is
     dropped — assuming its DTG would put back the look-ahead this fix removes. */
  const visibleAtMs = new Map();
  let noAdvisory = 0;
  for (const t of milestones(indexRows)) {
    const dtg = new Date(t).toISOString().replace(/[-:T]/g, "").slice(0, 10);
    const tx = cycleTransmitMs(timeline, t);
    if (tx == null) { noAdvisory++; continue; }
    visibleAtMs.set(dtg, tx);
  }
  /* Steps are advisory transmissions, in order — the moments an operator actually had
     something new. */
  const steps = [...new Set(visibleAtMs.values())].sort((a, b) => a - b);

  const entries = [];
  const refusals = noAdvisory ? { noArchivedAdvisory: noAdvisory } : {};
  for (const t of steps) {
    /* Past the crossing the contract has already resolved, so there is no open question to
       score. Same exclusion the live ledger applies. */
    if (crossMs != null && t >= crossMs) { refusals.settled = (refusals.settled || 0) + 1; continue; }
    const asOf = deckTextAt(lines, t, visibleAtMs);
    if (!asOf) continue;
    const deck = parseAdeck(asOf);
    if (!deck || !deck.ok) { refusals.deck = (refusals.deck || 0) + 1; continue; }

    /* Belt and braces: the parser's own latest cycle must not exceed t. If it ever does,
       the gate leaked and the run is void — better to abort than publish the score. */
    const latestVis = visibleAtMs.get(String(deck.latestCycle));
    if (latestVis == null || latestVis > t) {
      throw new Error(`ZERO-PEEK VIOLATION on ${stormId}: cycle ${deck.latestCycle} transmitted `
        + `${latestVis == null ? "never" : new Date(latestVis).toISOString()} but was read at ${new Date(t).toISOString()}`);
    }

    const ofcl = (deck.rows || []).filter((r) => (r.tech === "OFCL" || r.tech === "OFCI")
      && r.tau >= 0 && Number.isFinite(r.vmax) && r.vmax > 0);
    if (!ofcl.length) { refusals.noOfficial = (refusals.noOfficial || 0) + 1; continue; }

    /* THE ADVISORY'S OWN CURRENT INTENSITY, not the synoptic analysis.
       TAU 0 is the analysis at the cycle DTG and equals CARQ; the advisory publishes the
       TAU=T row, where T is the smallest positive sub-12h TAU in the set (3 for a scheduled
       advisory, 4-7 when a special advisory displaced it). Verified on Helene: 7 of 18
       cycles differ, up to 20 kt, and two of them straddle the hurricane threshold — so
       reading TAU 0 scored a forecast where NHC had already said hurricane.
       A cycle with no positive sub-12h TAU produced no advisory at all. */
    const T = ofcl.map((r) => r.tau).filter((x) => x > 0 && x < 12).sort((a, b) => a - b)[0];
    if (T == null) { refusals.noAdvisoryTau = (refusals.noAdvisoryTau || 0) + 1; continue; }
    const now = ofcl.find((r) => r.tau === T);
    if (!now) { refusals.noAnalysis = (refusals.noAnalysis || 0) + 1; continue; }

    /* Rebased onto the ADVISORY's clock. a-deck TAUs run from the cycle DTG, so a TAU 12
       row is 12h after the DTG but only 12-T hours after the advisory went out. The MAE
       table is indexed by lead time from issuance, so feeding raw TAU looks the error up
       T hours too far out. Rows before the advisory are dropped: they are not part of it. */
    const points = ofcl.filter((r) => r.tau >= T)
      .map((r) => ({ hr: r.tau - T, kt: r.vmax, initial: r.tau === T }));
    const official = reachesHurricaneP(points, null, null);
    if (!official || official.p == null) { refusals.noOfficialP = (refusals.noOfficialP || 0) + 1; continue; }

    const consensus = consensusFrom(deck);
    const cal = calibratedIntensityP({
      official, currentKt: now.vmax,
      /* No advisory issue time in the archive and no historical VDMs wired yet, so recon is
         absent by construction rather than by accident. The engine's own precondition — a
         fix may only shift the estimate when it can be shown to post-date the advisory —
         cannot be evaluated without that timestamp, and guessing it would be the same
         double-count this build already fixed once. Stated in the output. */
      /* The advisory in force at this instant, including intermediates: an intermediate
         publishes a recon fix exactly as a full advisory does, so omitting them would make
         a fix look like news NHC had already put on the wire. */
      advisoryIso: (() => { const a = advisoryInForce(timeline, t); return a ? new Date(a.transmitMs).toISOString() : null; })(),
      advisoryLabel: (() => { const a = advisoryInForce(timeline, t); return a ? `${a.product} ${a.advNum}` : null; })(),
      consensus, recon: null, ascat: null, ships: null, riFloor: null,
    }, {
      nowMs: t, maeTable: INTENSITY_MAE,
      thresholdKt: LATENT_THRESHOLD, reportedKt: HURRICANE_REPORTED_KT,
    });

    const calP = cal && cal.ok && Number.isFinite(cal.p) ? cal.p : official.p;
    const e = entryOf({
      tMs: t, stormId: stormId.toUpperCase(),
      rawP: official.p, calP,
      threshold: "hurricane", outcome: truth.outcome,
    });
    if (e) entries.push(e); else refusals.noEntry = (refusals.noEntry || 0) + 1;
  }
  return { entries, truth, refusals };
}

/* One index request per year covers every storm, basin and product — the send times are in
   the filenames, so no advisory bodies are fetched. Cached in memory for the run. */
const msgIndex = new Map();
async function advisoriesFor(year) {
  if (!msgIndex.has(year)) {
    const html = await get(archiveFor(year) + "messages/", false);
    const entries = html ? parseMessagesIndex(html, Number(year)) : [];
    if (!entries.length) console.log(`  ! ${year}: no messages/ index — every storm that year will be skipped`);
    msgIndex.set(year, entries);
  }
  return msgIndex.get(year);
}

const ids = [];
if (STORMS.length) {
  for (const s of STORMS) ids.push({ year: s.slice(-4), stem: s });
} else {
  for (const y of YEARS) {
    const found = await listStorms(y);
    for (const stem of (LIMIT ? found.slice(0, LIMIT) : found)) ids.push({ year: y, stem });
  }
}
console.log(`[backtest] ${ids.length} storm(s) · basin ${BASIN} · ${YEARS.join(", ")}`);

const all = [];
const perStorm = [];
for (const { year, stem } of ids) {
  const [aText, bText] = await Promise.all([deckText(year, stem, "a"), deckText(year, stem, "b")]);
  if (!aText || !bText) { console.log(`  ${stem}: decks unavailable — skipped`); continue; }
  const b = parseBestTrack(bText);
  if (!b || !b.ok) { console.log(`  ${stem}: unreadable best track — skipped`); continue; }

  const entries = await advisoriesFor(year);
  const timeline = advisoryTimeline(entries, stem);
  if (!timeline.length) { console.log(`  ${stem}: no archived advisories — skipped`); continue; }

  let r;
  try { r = replayStorm(stem, aText, b.records, timeline); }
  catch (e) { console.error(`\n${e.message}\n`); process.exit(2); }
  if (r.skipped) { console.log(`  ${stem}: ${r.skipped}`); continue; }

  all.push(...r.entries);
  perStorm.push({ storm_id: stem.toUpperCase(), steps: r.entries.length,
                  peakKt: r.truth.peakKt, outcome: r.truth.outcome });
  console.log(`  ${stem}: ${String(r.entries.length).padStart(3)} step(s) · peak ${String(r.truth.peakKt).padStart(3)} kt`
    + ` · outcome ${r.truth.outcome}`
    + (Object.keys(r.refusals).length ? `  (skipped: ${Object.entries(r.refusals).map(([k, v]) => k + "=" + v).join(" ")})` : ""));
}

const score = aggregate(all, {});
await mkdir(DATA, { recursive: true });
await writeFile(resolve(DATA, "backtest.json"), JSON.stringify({
  schema: "millibar-backtest/1",
  basin: BASIN, years: YEARS,
  thresholdKt: HURRICANE_REPORTED_KT,
  reconApplied: false,
  advisoryIntensityFromTau: true,
  gatedOnTransmitTime: true,
  note: "Recon and SHIPS are absent from this replay: the archive carries no advisory issue"
      + " time, and the engine may only shift on a fix it can show post-dates the advisory."
      + " This scores the official-forecast and ATCF-consensus path only.",
  excludesPostResolution: true,
  storms: perStorm, entries: all, score,
}, null, 2) + "\n");

console.log(`\n[backtest] ${all.length} entries across ${perStorm.length} storm(s)`);
if (!score.ok) {
  console.log("  NOT SCORED — " + score.note);
} else {
  const f = (v) => (v == null ? "—" : v.toFixed(4));
  console.log(`  base rate ${(score.baseRate * 100).toFixed(1)}%`);
  console.log(`  Brier: calibrated ${f(score.brier.calibrated)} · raw ${f(score.brier.raw)} · climatology ${f(score.brier.climatology)}`);
  console.log(`  skill: vs raw ${(score.skill.calibratedVsRaw * 100).toFixed(1)}% · vs climatology ${(score.skill.vsClimatology * 100).toFixed(1)}%`);
  console.log("\n  bin        n  storms   mean-fcst    observed");
  for (const b of score.reliability) {
    if (!b.n) continue;
    console.log(`  ${b.lo.toFixed(1)}-${b.hi.toFixed(1)} ${String(b.n).padStart(7)} ${String(b.storms).padStart(7)}`
      + ` ${b.meanForecast.toFixed(3).padStart(11)} ${b.observed.toFixed(3).padStart(11)}`);
  }
}
console.log("\nwrote docs/data/backtest.json");
