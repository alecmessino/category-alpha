#!/usr/bin/env node
/* THE LALA DOSSIER'S FACTS, COMPUTED RATHER THAN TYPED.
 *
 * WHY A GENERATOR AND NOT A HAND-WRITTEN PAGE. The dossier is an evidence document: its whole
 * claim is that every number on it can be traced to a source. A number typed into HTML has no
 * source — it has an author, and it goes stale silently the moment the archive is rebuilt or the
 * deck is revised. So every value the page prints is produced here, from a named file, and the
 * page is assembled around them. `facts.json` is written beside the page as the machine-readable
 * record of exactly what was computed and from what.
 *
 * FOUR PROVENANCE CLASSES, AND EVERY VALUE CARRIES ONE:
 *
 *   ARCHIVE             IBTrACS, via docs/storm-atlas/data/atlas-core-v1.bin.gz
 *   OPERATIONAL         ATCF b-deck and operational SHIPS, via the pinned files under
 *                       docs/dossier/lala/data/
 *   DERIVED             computed here by replaying a rule the archive already owns; the page
 *                       marks these and names the rule
 *   RECORDED / MILLIBAR timestamped Millibar system output preserved in
 *                       docs/data/forecast-log.json. Evidence of what the system recorded at a
 *                       given instant. NOT an upstream observation, NOT evidence of skill, and
 *                       not necessarily published externally at the time.
 *
 * EXTERNAL / PUBLIC CONTRACT FACTS: none used. No carrier, policy, trigger geometry, attachment
 * threshold or payout function appears anywhere in this dossier, because no public source for one
 * is in hand.
 *
 * THE INPUTS ARE PINNED. The b-deck under docs/dossier/lala/data/ is a snapshot with its own
 * fetch timestamp, NOT a live fetch and NOT the Storm Atlas fixture — the dossier must reproduce
 * byte for byte in five years, and it must not be coupled to a file the Atlas gates own.
 *
 * Run: node scripts/build-dossier-lala.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBestTrack } from "./lib/atcf.mjs";
import { nearestRingKm } from "./lib/geo-segment.mjs";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { decodeCoastlines } from "../docs/storm-atlas/src/engine/coastlines.js";
import { cohortResult, normalise, sentenceOf } from "../docs/storm-atlas/src/engine/cohort.js";
import { whyMatched } from "../docs/storm-atlas/src/engine/cohort-membership.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/dossier/lala");
const DATA = join(OUT, "data");
const PACKS = join(ROOT, "docs/storm-atlas/data");

const ATCF_ID = "CP012026";
/* The b-deck snapshot this dossier is built from, and when it was taken. Both are printed on the
   page: a dossier that does not say when it stopped looking is not evidence. */
const DECK_FILE = "bdeck-cp012026.dat";
const DECK_URL = "https://ftp.nhc.noaa.gov/atcf/btk/bcp012026.dat";
const DECK_FETCHED_AT = "2026-08-25T20:52:00Z";

/* The cohort the dossier reports. The radius is the surface's own default and the point is the
   ARCHIVE's genesis for CP012026 — not the operational deck's, though for this storm the two are
   the same instant and position. */
const RADIUS_KM = 500;

/* The archive's own recommended remedy for the pre-1971 observation gap, applied as a second
   cohort so the reader sees what the qualification actually costs. */
const RELIABLE_ERA_FROM = 1971;

/* Millibar ledger checkpoints. FIVE, chosen for what each one establishes, not for how they
   read: the first record of any kind, the last before the outcome, the outcome-adjacent entry,
   the peak, and the current state. The full 141-entry ledger is cited as provenance. */
const LEDGER_CHECKPOINTS = 5;

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

/* ---- sources ---------------------------------------------------------------------------- */

const archive = await openArchive(PACKS);
const deckText = await readFile(join(DATA, DECK_FILE), "utf8");
const deck = parseBestTrack(deckText);
const env = JSON.parse(await readFile(join(DATA, "env-ships-rt.json"), "utf8"));
/* The ledger and the calibration state are PINNED, not read live. scripts/fetch-data.mjs rewrites
   docs/data/forecast-log.json on every refresh; a dossier that re-read it would silently restate
   what Millibar recorded about a past storm every time the site refreshed, which is the exact
   failure this document argues against.

   THE PINNED LEDGER IS A PURPOSE-LIMITED EXTRACT, and says so in its own `note` field. It carries
   the CP012026 entries with only the fields this dossier reads; the complete recorded ledger is
   retained unchanged in Millibar's system of record and in this repository's history. The values
   are untouched -- what is omitted is omitted, not rewritten. */
const ledger = JSON.parse(await readFile(join(DATA, "forecast-log-cp012026.json"), "utf8"));
const calibrationPin = JSON.parse(await readFile(join(DATA, "calibration.json"), "utf8"));
const calibration = calibrationPin.calibration;

const coastRaw = gunzipSync(await readFile(join(PACKS, "atlas-coastlines-v1.bin.gz")));
const coast = decodeCoastlines(
  coastRaw.buffer.slice(coastRaw.byteOffset, coastRaw.byteOffset + coastRaw.byteLength));

assert(deck.ok, "the pinned b-deck did not parse");

/* ---- the archive record ------------------------------------------------------------------ */

let row = -1;
for (let i = 0; i < archive.nStorms; i++) {
  if (archive.storms.str("atcf_id", i) === ATCF_ID) row = i;
}
assert(row >= 0, `the archive holds no storm with atcf_id ${ATCF_ID}`);
const S = archive.storm(row);

const H = 3600000;
const hrs = (a, b) => (b - a) / H;
const days = (h) => h / 24;

/* PRE-GENESIS FIXES ARE COUNTED, because the full track extent and the tropical lifetime are
   different spans and this record makes the difference large: 28 of the archive's 49 fixes sit
   before genesis, so "49 fixes over 2.5 days" would be two true numbers describing different
   things. */
const [tpStart, tpEnd] = archive.trackRange(row);
let archivePreGenesis = 0;
for (let k = tpStart; k < tpEnd; k++) {
  if (archive.ptT[k] * 60000 < S.genesis_t) archivePreGenesis++;
}

const archiveRecord = {
  provenance: "ARCHIVE",
  storm_id: S.storm_id,
  atcf_id: S.atcf_id,
  name: S.name,
  season: S.season,
  basin: S.basin,
  subbasin: S.genesis_subbasin,
  track_type: S.track_type,
  source_key: S.source_key,
  provisional: S.provisional,
  first_fix_t: S.first_track_t,
  first_fix_stage: S.first_track_stage,
  genesis_t: S.genesis_t,
  genesis_lat: S.genesis_lat,
  genesis_lon: S.genesis_lon,
  end_t: S.end_t,
  fixes: S.track_points,
  fixes_pre_genesis: archivePreGenesis,
  fixes_from_genesis: (tpEnd - tpStart) - archivePreGenesis,
  full_extent_hours: hrs(S.first_track_t, S.end_t),
  genesis_to_end_hours: S.lifetime_hours,
  max_vmax_kt: S.max_vmax_kt,
  min_mslp_mb: S.min_mslp_mb,
  max_category: S.max_category,
  quality: S.quality,
};

/* ---- the operational record --------------------------------------------------------------- */

const fixes = deck.records.map((r) => ({
  t: r.iso, lat: r.lat, lon: r.lon, kt: r.kt, mslp: r.mslp, stage: r.ty,
}));
const T = (f) => Date.parse(f.t);
const genesisMs = S.genesis_t;

const kts = fixes.filter((f) => f.kt !== null);
const peak = kts.reduce((m, f) => (m === null || f.kt > m.kt ? f : m), null);
const mbs = fixes.filter((f) => f.mslp !== null);
const minP = mbs.reduce((m, f) => (m === null || f.mslp < m.mslp ? f : m), null);
const latest = fixes[fixes.length - 1];

/* THE LADDER, BY THE ARCHIVE'S OWN CROSSING RULE: the FIRST fix at or above the threshold, at or
   after genesis. Not the maximum, and not a fix before genesis — the deck reaches 35 kt on
   2026-08-12T18:00Z while still classified LO, and counting that as the tropical-storm crossing
   would date the crossing before the storm existed. */
const ladderKt = archive.manifest.thresholds_kt;
const LADDER = [["ts", ladderKt.ts], ["cat1", ladderKt.cat1], ["cat2", ladderKt.cat2],
  ["cat3", ladderKt.cat3], ["cat4", ladderKt.cat4], ["cat5", ladderKt.cat5]];
const afterGenesis = fixes.filter((f) => T(f) >= genesisMs);
const crossings = {};
for (const [name, thr] of LADDER) {
  const hit = afterGenesis.find((f) => f.kt !== null && f.kt >= thr) || null;
  crossings[name] = hit
    ? { t: T(hit), kt: hit.kt, mslp: hit.mslp, lat: hit.lat, lon: hit.lon, threshold_kt: thr,
        hours_from_genesis: hrs(genesisMs, T(hit)) }
    : { t: null, threshold_kt: thr, hours_from_genesis: null };
}

/* The class of a wind, by the same ladder. ATCF publishes a stage, never a Saffir-Simpson class. */
function categoryFor(kt) {
  if (kt === null || kt === undefined) return null;
  const desc = [...LADDER].sort((a, b) => b[1] - a[1]);
  for (const [name, thr] of desc) if (kt >= thr) return name;
  return null;
}

/* Stage transitions, verbatim from the deck's own `ty` column. */
const stageChanges = [];
let prevStage = null;
for (const f of fixes) {
  if (f.stage !== prevStage) {
    stageChanges.push({ t: T(f), stage: f.stage, kt: f.kt, mslp: f.mslp, lat: f.lat, lon: f.lon });
    prevStage = f.stage;
  }
}

const operationalRecord = {
  provenance: "OPERATIONAL",
  source: { file: `data/${DECK_FILE}`, url: DECK_URL, fetched_at: DECK_FETCHED_AT,
    bytes: deckText.length },
  fixes: fixes.length,
  fixes_pre_genesis: fixes.filter((f) => T(f) < genesisMs).length,
  fixes_from_genesis: afterGenesis.length,
  first_fix_t: T(fixes[0]),
  first_fix_stage: fixes[0].stage,
  latest_t: T(latest),
  latest,
  latest_category: categoryFor(latest.kt),
  full_extent_hours: hrs(T(fixes[0]), T(latest)),
  genesis_to_latest_hours: hrs(genesisMs, T(latest)),
  peak_wind_kt: peak.kt,
  peak_wind_t: T(peak),
  peak_wind_lat: peak.lat,
  peak_wind_lon: peak.lon,
  peak_category: categoryFor(peak.kt),
  min_mslp_mb: minP.mslp,
  min_mslp_t: T(minP),
  fixes_with_wind: kts.length,
  fixes_with_pressure: mbs.length,
  stage_changes: stageChanges,
  crossings,
  extends_archive_by_hours: hrs(archiveRecord.end_t, T(latest)),
};

assert(operationalRecord.peak_wind_kt >= 115, "the pinned deck no longer reaches 115 kt");
assert(operationalRecord.min_mslp_mb <= 947, "the pinned deck no longer reaches 947 mb");
assert(operationalRecord.fixes > archiveRecord.fixes, "the operational record is not longer");
assert(operationalRecord.peak_category === "cat4", "the derived peak class is no longer cat4");
assert(operationalRecord.first_fix_t === archiveRecord.first_fix_t,
  "the two records no longer begin at the same instant");

/* ---- Hawaii geometry, to segments ---------------------------------------------------------- */

/* THE PARTITION IS BY RING, NOT BY A LONGITUDE GUESS. The archive's `hawaii` region is 14 rings
   spanning 154.8W to 178.3W: eight are the Main Hawaiian Islands and six are the Northwestern
   Hawaiian Islands, and there is a clean gap between them (ring 504 reaches 160.25W, ring 505
   begins at 161.95W). Reporting one number across both would average an inhabited island chain
   with a line of uninhabited atolls 1,500 km away. */
const MHI_LON_EAST_OF = -161;
const hawaiiIdx = coast.regions.indexOf("hawaii");
assert(hawaiiIdx >= 0, "the coastline pack has no hawaii region");
const mhi = [];
const nwhi = [];
for (let r = 0; r < coast.nRings; r++) {
  if (coast.ringRegion[r] !== hawaiiIdx) continue;
  const pts = [];
  for (let k = coast.ringOffset[r]; k < coast.ringOffset[r + 1]; k++) {
    pts.push([coast.lat[k], coast.lon[k]]);
  }
  (Math.max(...pts.map((p) => p[1])) > MHI_LON_EAST_OF ? mhi : nwhi).push(pts);
}
assert(mhi.length === 8 && nwhi.length === 6,
  `hawaii ring partition changed: ${mhi.length} main / ${nwhi.length} NWHI`);

const distTo = (f, rings) => nearestRingKm(f.lat, f.lon, rings).km;
let closestMhi = null;
let closestNwhi = null;
for (const f of fixes) {
  if (f.lat === null) continue;
  const dm = distTo(f, mhi);
  const dn = distTo(f, nwhi);
  if (closestMhi === null || dm < closestMhi.km) closestMhi = { km: dm, ...f };
  if (closestNwhi === null || dn < closestNwhi.km) closestNwhi = { km: dn, ...f };
}
const atInstant = (ms) => {
  const f = fixes.find((x) => T(x) === ms);
  if (!f) return null;
  return { t: T(f), kt: f.kt, mslp: f.mslp, stage: f.stage, lat: f.lat, lon: f.lon,
    mhi_km: distTo(f, mhi), nwhi_km: distTo(f, nwhi) };
};

/* THE DISTANCE FOR EVERY FIX, not only for the four the summary names. The chronology prints one
   per row, and a column that is mostly em-dashes because the build only measured its own
   highlights is a column that looks like missing data. */
const mhiKmByT = {};
for (const f of fixes) if (f.lat !== null) mhiKmByT[T(f)] = distTo(f, mhi);

/* HOW FAR APART THE TWO ISLAND GROUPS ARE, measured rather than asserted — and the measurement
   corrected an assumption. The gap between their NEAREST points is small: the easternmost
   northwestern island sits close to Kauai. What separates them is EXTENT, not that gap. So both
   numbers are computed and the page uses the one that carries the argument. */
let groupGapKm = Infinity;
for (const ring of mhi) {
  for (const [la, lo] of ring) {
    const d = nearestRingKm(la, lo, nwhi).km;
    if (d < groupGapKm) groupGapKm = d;
  }
}
const westmost = (rings) => Math.min(...rings.flat().map((p) => p[1]));
const eastmost = (rings) => Math.max(...rings.flat().map((p) => p[1]));
const groupExtent = {
  main_islands_lon: [westmost(mhi), eastmost(mhi)],
  nwhi_lon: [westmost(nwhi), eastmost(nwhi)],
  /* How much further west the northwestern chain reaches than the main islands do, at the
     latitude band where it matters. A degree of longitude at 25N is ~101 km. */
  nwhi_extends_west_km: nearestRingKm(
    (Math.min(...nwhi.flat().map((p) => p[0])) + Math.max(...nwhi.flat().map((p) => p[0]))) / 2,
    westmost(mhi),
    [[[(Math.min(...nwhi.flat().map((p) => p[0])) + Math.max(...nwhi.flat().map((p) => p[0]))) / 2,
       westmost(nwhi)]]]).km,
};

const geometry = {
  provenance: "DERIVED",
  method: "minimum geodesic distance from each operational fix to the nearest COASTLINE SEGMENT "
    + "(not to the nearest stored vertex), computed by scripts/lib/geo-segment.mjs and gated by "
    + "scripts/test-geo-segment.mjs",
  coastline_source: {
    file: "docs/storm-atlas/data/atlas-coastlines-v1.bin.gz",
    built_utc: coast.header.provenance ? coast.header.provenance.built_utc : null,
    geometry_sources: coast.header.provenance
      ? (coast.header.provenance.geometry_sources || []).map((g) => g.key) : [],
    hawaii_rings: coast.header.counts.per_region.hawaii.rings,
    main_islands_rings: mhi.length,
    main_islands_vertices: mhi.reduce((n, r) => n + r.length, 0),
    nwhi_rings: nwhi.length,
    nwhi_vertices: nwhi.reduce((n, r) => n + r.length, 0),
  },
  closest_main_islands: { km: closestMhi.km, t: T(closestMhi), kt: closestMhi.kt,
    mslp: closestMhi.mslp, stage: closestMhi.stage, lat: closestMhi.lat, lon: closestMhi.lon },
  closest_nwhi: { km: closestNwhi.km, t: T(closestNwhi), kt: closestNwhi.kt,
    mslp: closestNwhi.mslp, stage: closestNwhi.stage, lat: closestNwhi.lat, lon: closestNwhi.lon },
  at_archive_end: atInstant(archiveRecord.end_t),
  at_peak: atInstant(operationalRecord.peak_wind_t),
  main_islands_km_by_t: mhiKmByT,
  group_separation_km: groupGapKm,
  group_extent: groupExtent,
  /* The fact the dossier leads with, computed rather than asserted. */
  archive_ends_before_closest_approach_hours:
    hrs(archiveRecord.end_t, T(closestMhi)),
};

assert(geometry.archive_ends_before_closest_approach_hours > 0,
  "the archive no longer ends before the closest main-island approach");
assert(geometry.at_peak.mhi_km > geometry.closest_main_islands.km * 5,
  "the peak is no longer far from the main islands — recheck the near-miss rejection");

/* ---- the historical cohort ----------------------------------------------------------------- */

function cohort(spec) {
  const s = normalise(spec);
  const r = cohortResult(archive, s);
  const cell = (c, key) => ({
    count: c.count,
    n_storms: c.n_storms,
    n_unknown: c.n_unknown,
    rate: c.rate,
    ci95: c.ci95,
    refused: r.unscoreable && r.unscoreable[key] ? r.unscoreable[key].status : null,
  });
  return {
    provenance: "ARCHIVE",
    sentence: sentenceOf(s),
    kept: r.kept,
    n_cases: r.n_cases,
    effective_sample_size: r.effective_sample_size,
    min_sample: r.min_sample,
    sufficient: r.sufficient,
    thresholds: Object.fromEntries(LADDER.map(([k]) => [k, cell(r.intensity[k], k)])),
    hawaii_any: cell(r.landfall.hawaii.any, "hawaii:any"),
    hawaii_hurricane: cell(r.landfall.hawaii.hurricane, "hawaii:hurricane"),
    other_regions: Object.fromEntries(Object.keys(r.landfall)
      .filter((x) => x !== "hawaii")
      .map((x) => [x, cell(r.landfall[x].any, `${x}:any`)])),
    gaps: r.gaps || [],
    rows: Array.from(r.rows),
  };
}

const WHERE = { lat: S.genesis_lat, lon: S.genesis_lon, radiusKm: RADIUS_KM };
const cohortAll = cohort({ where: WHERE });
const cohortReliable = cohort({ where: WHERE, seasonFrom: RELIABLE_ERA_FROM });

/* WHO SUPPLIES THE HAWAII NUMERATOR. One storm, and the dossier names it: a rate whose entire
   numerator is a single 1959 event is not a rate a reader should carry away as a frequency. */
const hawaiiContributors = [];
for (const i of cohortAll.rows) {
  const lf = archive.stormLandfalls(i).filter((l) => l.region === "hawaii");
  if (!lf.length) continue;
  hawaiiContributors.push({
    name: archive.storms.str("name", i),
    season: archive.storms.num("season", i),
    atcf_id: archive.storms.str("atcf_id", i),
    storm_id: archive.storms.str("storm_id", i),
    landfalls: lf.map((l) => ({ t: l.t, sub_region: l.sub_region, vmax_kt: l.vmax_kt,
      category: l.category, detection: l.detection, hurricane_at_landfall: l.hurricane_at_landfall })),
  });
}
assert(hawaiiContributors.length === cohortAll.hawaii_any.count,
  "the named Hawaii contributors do not match the counted numerator");

/* LALA IS NOT IN ITS OWN COHORT, and the reason is the archive's own record scope rather than
   anything this dossier decided. Recorded as the engine states it. */
const ownMembership = {
  provenance: "ARCHIVE",
  is_member: cohortAll.rows.includes(row),
  why: whyMatched(archive, normalise({ where: WHERE }), row)
    .map((w) => ({ key: w.key, verdict: w.verdict, label: w.label, value: w.value })),
};
assert(ownMembership.is_member === false,
  "CP012026 is now inside its own cohort — the provisional scope rule has changed");

/* ---- what Millibar recorded, and when ------------------------------------------------------- */

const entries = (ledger.entries || []).filter((e) => e.stormId === ATCF_ID);
assert(entries.length > 0, "the ledger holds no entries for this storm");
const questions = [...new Set(entries.map((e) => `${e.question}@${e.thresholdKt}`))];

/* The outcome the recorded question was ABOUT: the first operational fix at or above the ledger's
   own threshold, at or after genesis. Not the peak, and not anything to do with Hawaii. */
const ledgerThresholdKt = entries[0].thresholdKt;
const outcomeFix = afterGenesis.find((f) => f.kt !== null && f.kt >= ledgerThresholdKt) || null;

const pick = (i) => {
  const e = entries[i];
  return { tsZ: e.tsZ, advNum: e.advNum, currentKt: e.currentKt,
    pRaw: e.pRaw ?? null, pCal: e.pCal ?? null,
    quality: e.quality ?? null,
    lead_hours_to_outcome: outcomeFix ? hrs(Date.parse(e.tsZ), T(outcomeFix)) : null };
};
const beforeOutcome = entries.filter((e) => outcomeFix && Date.parse(e.tsZ) < T(outcomeFix));
const peakEntry = entries.reduce((m, e, i) =>
  (e.currentKt !== null && (m === null || e.currentKt > entries[m].currentKt) ? i : m), null);

const checkpoints = [
  { label: "first record of any kind", ...pick(0) },
  ...(beforeOutcome.length > 1
    ? [{ label: "last record before the outcome", ...pick(beforeOutcome.length - 1) }] : []),
  { label: "highest intensity recorded", ...pick(peakEntry) },
  { label: "most recent record", ...pick(entries.length - 1) },
].slice(0, LEDGER_CHECKPOINTS);

const recorded = {
  provenance: "RECORDED / MILLIBAR",
  definition: "Timestamped Millibar system output, extracted here from docs/data/forecast-log.json. "
    + "Evidence of what the system recorded at that instant. It is not an upstream observation, "
    + "it is not evidence of forecasting skill, and it was not necessarily published externally "
    + "at the time.",
  source: "data/forecast-log-cp012026.json",
  source_kind: ledger.kind ?? null,
  source_extracted_from: ledger.extracted_from ?? ledger.pinned_from ?? null,
  source_extracted_at: ledger.extracted_at ?? ledger.pinned_at ?? null,
  source_fields_omitted_count: ledger.fields_omitted_count ?? null,
  entries: entries.length,
  questions,
  threshold_kt: ledgerThresholdKt,
  first_t: Date.parse(entries[0].tsZ),
  last_t: Date.parse(entries[entries.length - 1].tsZ),
  starts_after_genesis_hours: hrs(genesisMs, Date.parse(entries[0].tsZ)),
  outcome: outcomeFix
    ? { t: T(outcomeFix), kt: outcomeFix.kt, provenance: "OPERATIONAL" } : null,
  checkpoints,
  calibration: {
    ok: calibration.ok,
    resolved_storms: calibration.counts.resolvedStorms,
    required_storms: calibration.minResolvedStorms,
    resolved_entries: calibration.counts.resolvedEntries,
    note: calibration.note,
  },
};
assert(recorded.calibration.ok === false,
  "the calibration ledger now publishes a score — the refusal wording must be revisited");
assert(questions.length === 1,
  `the ledger holds more than one question for this storm: ${questions.join(", ")}`);

/* ---- the operational environment ------------------------------------------------------------ */

const envRows = env.rows.map((r) => Object.fromEntries(env.fields.map((f, i) => [f, r[i]])));
const envFirst = Date.parse(envRows[0].iso_time);
const envAtPeak = envRows.find((r) => Date.parse(r.iso_time) === operationalRecord.peak_wind_t);

const environment = {
  provenance: "OPERATIONAL",
  source: env.source,
  filter: env.filter,
  note: env.note,
  rows: envRows.length,
  first_t: envFirst,
  last_t: Date.parse(envRows[envRows.length - 1].iso_time),
  at_peak: envAtPeak || null,
  series: envRows,
  /* THE REFUSAL. Two sources could have described the air Lala formed in and neither does: the
     operational file does not begin until five days after genesis, and the archive holds no
     developmental SHIPS record inside its own +/-12 h genesis window. */
  genesis_environment: {
    available: false,
    operational_begins_t: envFirst,
    operational_begins_after_genesis_hours: hrs(genesisMs, envFirst),
    archive_env_row: S.env_at_genesis.row,
    archive_window_hours: S.env_at_genesis.window_hours,
    refusal: "No operational environment record exists before "
      + new Date(envFirst).toISOString().slice(0, 16) + "Z, and the archive holds no "
      + "developmental SHIPS record within " + S.env_at_genesis.window_hours
      + " h of genesis. The environment Lala formed in is unmeasured by both sources.",
  },
};
assert(environment.genesis_environment.operational_begins_after_genesis_hours > 0,
  "the operational environment now covers genesis — the refusal must be removed");
assert(S.env_at_genesis.row < 0,
  "the archive now holds a genesis environment row — the refusal must be removed");

/* ---- assemble -------------------------------------------------------------------------------- */

const facts = {
  schema: "millibar-dossier-lala/1",
  built_utc: new Date(Date.parse(DECK_FETCHED_AT)).toISOString(),
  subject: ATCF_ID,
  /* NO EXTERNAL CONTRACT FACT OF ANY KIND REACHES THIS DOCUMENT. The pinned ledger under data/
     carries Millibar's own recorded fields verbatim, including ones this dossier does not use;
     the projection above takes only the model and calibrated probabilities. Nothing priced,
     quoted or settled outside Millibar enters any figure, table or sentence here. */
  external_public_contract_facts: "none",
  provenance_classes: {
    ARCHIVE: "IBTrACS, via docs/storm-atlas/data/atlas-core-v1.bin.gz",
    OPERATIONAL: "ATCF b-deck and operational SHIPS, via the pinned files under docs/dossier/lala/data/",
    DERIVED: "computed by replaying a rule the archive already owns; the rule is named where used",
    "RECORDED / MILLIBAR": recorded.definition,
  },
  archive_provenance: {
    archive_built_utc: archive.manifest.archive_built_utc,
    archive_stamp: archive.manifest.archive_stamp,
    methodology_version: archive.manifest.methodology_version,
    storms: archive.manifest.counts.storms,
    track_points: archive.manifest.counts.track_points,
  },
  archive_record: archiveRecord,
  operational_record: operationalRecord,
  geometry,
  cohort: { radius_km: RADIUS_KM, where: WHERE, all_seasons: cohortAll,
    reliable_era: cohortReliable, reliable_era_from: RELIABLE_ERA_FROM,
    hawaii_contributors: hawaiiContributors, own_membership: ownMembership },
  recorded,
  environment,
};

if (failures.length) {
  console.error(`\n${failures.length} fact check(s) failed — the dossier was NOT written:\n`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "facts.json"), JSON.stringify(facts, null, 2) + "\n");

const { renderDossier } = await import("./lib/dossier-lala-page.mjs");
await writeFile(join(OUT, "index.html"), renderDossier(facts));

const { renderSummary, renderDemoScript, renderOutreach } =
  await import("./lib/dossier-lala-docs.mjs");
await writeFile(join(OUT, "SUMMARY.md"), renderSummary(facts));
await writeFile(join(OUT, "DEMO-SCRIPT.md"), renderDemoScript(facts));
await mkdir(join(OUT, "outreach"), { recursive: true });
for (const [name, body] of Object.entries(renderOutreach(facts))) {
  await writeFile(join(OUT, "outreach", name), body);
}

console.log("dossier facts, page and companion documents written");
console.log(`  archive      ${archiveRecord.fixes} fixes, ${archiveRecord.max_vmax_kt} kt, `
  + `${archiveRecord.min_mslp_mb} mb, ends ${new Date(archiveRecord.end_t).toISOString().slice(0, 16)}Z`);
console.log(`  operational  ${operationalRecord.fixes} fixes, ${operationalRecord.peak_wind_kt} kt `
  + `(${operationalRecord.peak_category}), ${operationalRecord.min_mslp_mb} mb, through `
  + `${new Date(operationalRecord.latest_t).toISOString().slice(0, 16)}Z`);
console.log(`  geometry     main islands ${geometry.closest_main_islands.km.toFixed(1)} km, `
  + `NWHI ${geometry.closest_nwhi.km.toFixed(1)} km, at peak ${geometry.at_peak.mhi_km.toFixed(0)} km`);
console.log(`  cohort       N=${cohortAll.kept} all seasons, N=${cohortReliable.kept} from `
  + `${RELIABLE_ERA_FROM}; Hawaii numerator = ${hawaiiContributors.map((h) => h.name + " " + h.season).join(", ") || "none"}`);
console.log(`  recorded     ${recorded.entries} entries, ${recorded.checkpoints.length} checkpoints, `
  + `calibration ok=${recorded.calibration.ok}`);
