/* atlas-live-v1 — the operational selected-storm artifact the Storm Atlas reads.
 *
 * WHY THIS EXISTS. The Storm Atlas packs are pure IBTrACS. IBTrACS publishes a PROVISIONAL
 * record for the current season and stops updating it long before the storm stops existing, so
 * a storm that is still being flown reaches the Atlas as a finished, shorter, weaker storm.
 * Measured on the shipped pack: CP012026 / LALA is 65 kt, Category 1, 988 mb, 49 fixes, ending
 * 2026-08-16T00:00Z. The ATCF b-deck the ingest ALREADY FETCHES on the same tick carries 63
 * fixes reaching 2026-08-25T12:00Z, a peak of 115 kt and a minimum of 947 mb. Nothing was
 * missing from the pipeline; the two halves were never joined.
 *
 * They are not joined here either, and that is the design. This file writes a SECOND, tiny
 * artifact beside the packs, keyed by ATCF id. The Atlas loads it separately, uses it as the
 * OPERATIONAL representation of a selected current storm, and never lets a value from it reach
 * the archive: no cohort, no analog, no rate, no interval, no calibration, no refusal. IBTrACS
 * remains the archive. ATCF becomes the operational selected-storm view. See
 * docs/storm-atlas/ATLAS-LIVE.md for the precedence rule in full.
 *
 * PURE. No network and no clock — `nowMs` and the parsed decks are arguments, so the whole
 * artifact can be built from a committed fixture and asserted byte for byte. Everything that
 * fetches lives in scripts/ingest.mjs, exactly as the deck parsers do.
 *
 * TWO TIMESTAMPS, NEVER ONE. `latest_valid_time` is when the SOURCE says the storm was where it
 * says it was. `fetched_at` is when this pipeline read the file. A single "cycle" field
 * collapsing the two is how a nine-day-old record comes to look like a fresh one, so the two are
 * separate everywhere in this schema and the age between them is published rather than implied.
 */

export const SCHEMA = "atlas-live-v1";

/* A storm keeps its operational record after it stops being an active system.
 *
 * WHY RETENTION IS NOT OPTIONAL. The active list is NHC's CurrentStorms.json, and a storm leaves
 * it the moment the last advisory is written. IBTrACS will not post-analyse that storm for
 * months. Without retention the Atlas would show operational truth for exactly as long as the
 * storm was on the news and then silently revert to the 49-fix archive stub the day it
 * dissipated — reintroducing the identical failure at the identical place. A retained record is
 * NOT re-polled; it is the last operational record observed, and it carries the age that says so.
 *
 * The window is the season, bounded. Sixty days past the last fix covers the whole gap between
 * dissipation and the next IBTrACS provisional refresh without letting a "live" artifact
 * accumulate a decade of dead storms. */
export const RETENTION_DAYS = 60;

/* Freshness bound for an ACTIVE storm, in hours.
 *
 * The b-deck is written on synoptic hours and NHC posts it a few hours behind, so a healthy
 * active record is routinely 3-9 hours old and that is not staleness. Past this bound the record
 * is still shown — it is still the freshest thing anyone has — but it is shown as STALE, because
 * an operational record that has stopped advancing while the storm has not is the one state that
 * must never read as current truth. It does NOT apply to a retained record: that record is
 * complete to the last fix that exists, and ageing is what it is supposed to do. */
export const ACTIVE_STALE_HOURS = 18;

const HOUR = 3600000;
const DAY = 86400000;

/* ATCF ids are BBNNYYYY. The season is in the id, which is what makes the join to the archive
   safe: CP012026 can only ever be a 2026 storm, so an operational record can never attach to the
   same-named storm of another year. LALA is in this archive twice — EP121984 and CP012026 — and
   a name join would have picked the wrong one. */
const ATCF_ID = /^([A-Z]{2})(\d{2})(\d{4})$/;

export function parseAtcfId(id) {
  const m = ATCF_ID.exec(String(id || "").trim().toUpperCase());
  if (!m) return null;
  return { atcf_id: m[1] + m[2] + m[3], basin: m[1], number: Number(m[2]), season: Number(m[3]) };
}

/* The b-deck's own stage codes, kept verbatim. They are NOT Saffir-Simpson classes and are not
   translated into one here: DB and LO are pre-tropical, and the archive's category ladder is a
   different vocabulary applied to a different question. The Atlas derives a category from the
   WIND, by the archive's own thresholds, and says that it did. */
const STAGE_LABEL = {
  DB: "DISTURBANCE", LO: "LOW", WV: "TROPICAL WAVE", EX: "EXTRATROPICAL",
  SD: "SUBTROPICAL DEPRESSION", SS: "SUBTROPICAL STORM",
  TD: "TROPICAL DEPRESSION", TS: "TROPICAL STORM", HU: "HURRICANE",
  TY: "TYPHOON", ST: "SUPER TYPHOON", TC: "TROPICAL CYCLONE", HR: "HURRICANE",
  ET: "EXTRATROPICAL", PT: "POST-TROPICAL", IN: "INLAND", DS: "DISSIPATING",
  MD: "MONSOON DEPRESSION", NR: "NOT REPORTED",
};

export function stageLabel(ty) {
  const k = String(ty || "").trim().toUpperCase();
  return STAGE_LABEL[k] || null;
}

/* One b-deck record, reduced to what a track needs.
 *
 * NO ROUNDING AND NO FILLING. Lat/lon arrive in tenths of a degree and stay in tenths; a null
 * wind stays null rather than becoming zero. parseBestTrack has already nulled the ATCF
 * zero-means-absent sentinel, and nothing here undoes that. */
function fix(r) {
  return {
    t: r.iso,
    lat: r.lat,
    lon: r.lon,
    kt: r.kt === undefined ? null : r.kt,
    mslp: r.mslp === undefined ? null : r.mslp,
    stage: r.ty || null,
  };
}

/* The SHIPS run that is in force now, at tau 0 only.
 *
 * TAU 0 AND NOTHING ELSE. Every other tau in the file is a FORECAST, and this artifact carries
 * observed and diagnosed state — putting a 48-hour forecast shear into a panel headed LATEST
 * OPERATIONAL ENVIRONMENT would be publishing a forecast as an observation. The forecast series
 * stays where it already is, on the terminal, where it is labelled as one.
 *
 * The field names are the operational product's own, not the archive's. That is deliberate: the
 * archive's environment columns (`shear_kt`, `sst_c`, `pot_intensity_kt`) belong to the
 * developmental SHIPS file, and giving these the same names is the first step towards a surface
 * that averages the two. They are separate eras measured differently and this repository already
 * says so in engine/env.js; the naming keeps them separate here too. */
function shipsRt(ships, fetchedAtIso) {
  if (!ships || !ships.ok || !ships.features) return null;
  const valid = ships.cycleIso || null;
  const labels = ships.labels || {};

  /* EVERY FIELD THE PRODUCT PUBLISHED, WITH THE PRODUCT'S OWN LABEL, AND NO CURATION.
   *
   * Two of these -- the SHIPS and LGEM intensity values -- are model output rather than
   * environment, and dropping them to make the block tidier was the obvious move and is the
   * wrong one: a reader comparing this panel against the operational file would find fields
   * missing with nothing saying they had been removed. They are carried and they are labelled
   * as what they are, which is the same rule the rest of this repository follows about a value
   * it would rather not show.
   *
   * A NULL FIELD IS DROPPED, A ZERO IS KEPT. `parseShips` has already mapped the product's
   * missing markers (N/A, xx.x, LOST) to null, so a field that survives here was published.
   * OHC 0 over cold water is a measurement, and `availability` travels alongside so a panel can
   * still tell a published zero from a diagnostic the run could not compute. */
  const fields = {};
  for (const [k, v] of Object.entries(ships.features)) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    fields[k] = { value: v, label: labels[k] || null };
  }
  return {
    source: "ships_rt",
    product: "NHC operational SHIPS (stext)",
    tau: 0,
    valid_time: valid,
    fetched_at: fetchedAtIso,
    age_hours: ageHours(valid, fetchedAtIso),
    /* The operational product publishes no position of its own in this parse; the storm's
       position at the same instant is the b-deck's and is reported as the b-deck's. Null here
       means "this product did not carry one", never "the storm has no position". */
    lat: ships.lat ?? null,
    lon: ships.lon ?? null,
    availability: ships.availability || null,
    fields,
    field_count: Object.keys(fields).length,
    /* THE CAVEAT TRAVELS WITH THE DATA. Operational SHIPS is not developmental SHIPS: it is a
       different file, computed operationally, and engine/env.js already refuses to pool the two
       inside the archive. Carrying the statement here means a panel cannot render this block
       without it. */
    not_comparable_with: "ships_dev",
    note: "Operational SHIPS, not the developmental SHIPS archive. The two are sequential eras "
      + "measured differently and are never pooled, differenced or compared as one instrument.",
  };
}

function ageHours(fromIso, toIso) {
  const a = Date.parse(fromIso || "");
  const b = Date.parse(toIso || "");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(((b - a) / HOUR) * 10) / 10;
}

/**
 * One storm's operational record, from its parsed b-deck.
 *
 * @param {object} arg
 * @param {string} arg.atcfId    ATCF id, e.g. "CP012026".
 * @param {string|null} arg.name The storm's name as the live feed reports it.
 * @param {Array} arg.records    parseBestTrack(...).records — the WHOLE deck, oldest first.
 * @param {object|null} arg.ships parseShips(...) output for the same storm, or null.
 * @param {object|null} arg.provenance {url, status, bytes} for the deck fetch.
 * @param {string} arg.fetchedAt ISO instant this pipeline read the deck.
 * @returns {object|null} null when there is no usable deck — an empty record is not a record.
 */
export function operationalRecord({ atcfId, name, records, ships, provenance, fetchedAt }) {
  const id = parseAtcfId(atcfId);
  if (!id) return null;
  const recs = (records || []).filter((r) => r && r.iso);
  if (!recs.length) return null;

  const fixes = recs.map(fix);
  const first = fixes[0];
  const last = fixes[fixes.length - 1];

  /* OPERATIONAL TO DATE, and the words are the measurement. This is the maximum over the fixes
     that EXIST, which for an active storm is not the storm's peak — the storm has not finished.
     Every surface that prints it has to say so, which is why the Atlas never labels an active
     storm's intensity "whole life". */
  let peakKt = null;
  let peakAt = null;
  let minMb = null;
  let minMbAt = null;
  for (const f of fixes) {
    if (f.kt !== null && (peakKt === null || f.kt > peakKt)) { peakKt = f.kt; peakAt = f.t; }
    if (f.mslp !== null && (minMb === null || f.mslp < minMb)) { minMb = f.mslp; minMbAt = f.t; }
  }

  const withWind = fixes.filter((f) => f.kt !== null).length;
  const withPressure = fixes.filter((f) => f.mslp !== null).length;

  return {
    atcf_id: id.atcf_id,
    season: id.season,
    basin: id.basin,
    name: name ? String(name).toUpperCase() : null,

    /* THE TWO CLOCKS. */
    fetched_at: fetchedAt,
    first_valid_time: first.t,
    latest_valid_time: last.t,
    age_hours: ageHours(last.t, fetchedAt),

    fix_count: fixes.length,
    fixes,
    latest: last,
    stage: last.stage,
    stage_label: stageLabel(last.stage),

    peak_wind_kt: peakKt,
    peak_wind_at: peakAt,
    min_mslp_mb: minMb,
    min_mslp_at: minMbAt,

    /* Denominators, so the panel can print 63 of 63 rather than implying every fix carried
       every field. A b-deck routinely carries a position with no pressure. */
    fixes_with_wind: withWind,
    fixes_with_pressure: withPressure,

    ships_rt: shipsRt(ships, fetchedAt),

    source: {
      name: "NHC ATCF b-deck (best track)",
      kind: "operational",
      url: (provenance && provenance.url) || null,
      status: (provenance && provenance.status) || null,
      bytes: (provenance && provenance.bytes) || null,
      note: "Operational best track, revised by the forecast office while the storm is live. "
        + "Not post-analysed and not an archive record.",
    },
  };
}

/* Is a retained record still worth carrying? Season first, then the window: a record from a
   previous season has been superseded by whatever IBTrACS published for it, and one whose last
   fix is two months old has stopped being a continuation of anything. */
function retainable(rec, nowMs) {
  if (!rec || !rec.latest_valid_time) return false;
  const t = Date.parse(rec.latest_valid_time);
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= RETENTION_DAYS * DAY;
}

/**
 * Build the whole artifact.
 *
 * @param {object} arg
 * @param {Array}  arg.storms   The active systems, each {id, name} — the live feed's own list.
 * @param {object} arg.intel    ingestIntel(...) output; byStorm[id] carries the parsed decks.
 * @param {number} arg.nowMs    The tick's instant.
 * @param {object|null} arg.previous The artifact written on the last tick, for retention.
 */
export function buildAtlasLive({ storms, intel, nowMs, previous }) {
  const fetchedAt = new Date(nowMs).toISOString();
  const byStorm = (intel && intel.byStorm) || {};

  const out = {};
  const active = [];
  const failed = [];

  for (const s of storms || []) {
    const id = parseAtcfId(s && s.id);
    if (!id) continue;
    active.push(id.atcf_id);
    const I = byStorm[s.id] || null;
    const rec = operationalRecord({
      atcfId: id.atcf_id,
      name: s.name || null,
      records: I ? I.bestTrackHistory : null,
      ships: I ? I.ships : null,
      provenance: I ? I.bestTrackSource : null,
      fetchedAt,
    });
    /* A STORM WHOSE DECK DID NOT READ IS NOT SILENTLY DROPPED. It goes on the missing list, the
       artifact's health goes false, and the Atlas turns that into an explicit incomplete state
       rather than falling back to an archive record that looks complete. That is the whole of
       fail-closed and it is decided here, where the failure actually happened. */
    if (!rec) { failed.push(id.atcf_id); continue; }
    out[id.atcf_id] = { ...rec, active: true };
  }

  /* Retention. A previously-emitted storm that has left the active list keeps its last record,
     its ORIGINAL fetched_at, and an age that goes on growing honestly. It is never re-polled and
     never re-timestamped: re-stamping a record nobody re-read is the exact lie this schema's two
     clocks exist to prevent. */
  const prev = (previous && previous.storms) || {};
  const retained = [];
  for (const [id, rec] of Object.entries(prev)) {
    if (out[id]) continue;
    if (!retainable(rec, nowMs)) continue;
    const p = parseAtcfId(id);
    if (!p || p.season !== new Date(nowMs).getUTCFullYear()) continue;
    retained.push(id);
    out[id] = { ...rec, active: false, age_hours: ageHours(rec.latest_valid_time, fetchedAt) };
  }

  const emitted = Object.keys(out).sort();
  const expected = [...new Set([...active, ...retained, ...failed])].sort();
  const missing = expected.filter((id) => !out[id]);

  /* Stale ACTIVE records, named. Not an error and not a reason to withhold the record: the
     Atlas shows it and marks it, because the freshest thing that exists is still the freshest
     thing that exists. It is on the health block so a gate can see it without walking storms. */
  const stale = emitted.filter((id) => out[id].active
    && out[id].age_hours !== null && out[id].age_hours > ACTIVE_STALE_HOURS);

  return {
    schema: SCHEMA,
    generated_at: fetchedAt,
    source: {
      name: "NHC ATCF b-deck (best track)",
      url: "https://ftp.nhc.noaa.gov/atcf/btk/",
      kind: "operational",
      note: "Operational best track and operational SHIPS, read on the terminal's refresh tick. "
        + "This artifact is the OPERATIONAL representation of a current storm. It is not the "
        + "archive, it never enters one, and no value in it is used to build a cohort, match an "
        + "analog, compute a rate or an interval, or calibrate anything.",
    },
    freshness: {
      active_stale_hours: ACTIVE_STALE_HOURS,
      retention_days: RETENTION_DAYS,
      note: "age_hours is latest_valid_time to fetched_at. The stale bound applies to ACTIVE "
        + "storms only; a retained record is complete to its last fix and ages by design.",
    },
    health: {
      /* THE THREE STATES THE BROWSER HAS TO TELL APART, made answerable from this block alone:
         an id absent from `expected` has no operational record and is not supposed to; an id in
         `emitted` has one; an id in `missing` was supposed to have one and does not. */
      ok: missing.length === 0,
      active_atcf_ids: active.slice().sort(),
      retained_atcf_ids: retained.slice().sort(),
      expected_atcf_ids: expected,
      emitted_atcf_ids: emitted,
      missing_atcf_ids: missing,
      stale_atcf_ids: stale,
      note: missing.length
        ? `${missing.length} expected operational record(s) could not be read this tick: `
          + missing.join(", ")
        : `${emitted.length} operational record(s) emitted`,
    },
    storms: out,
  };
}
