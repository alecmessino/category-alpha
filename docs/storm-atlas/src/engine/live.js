/* THE OPERATIONAL LAYER, AND THE WALL AROUND IT.
 *
 * The Atlas's packs are IBTrACS. IBTrACS's current-season record is PROVISIONAL: it is published
 * early, it stops being updated long before the storm stops existing, and it is not post-analysed.
 * For CP012026 / LALA the shipped pack holds 49 fixes, 65 kt, 988 mb, ending 2026-08-16T00:00Z,
 * while the storm was still being written up nine days later at 115 kt peak and 947 mb minimum.
 * The Atlas was rendering the stub as though it were the storm's life.
 *
 * This module reads a separate artifact -- atlas-live-v1.json, written by the terminal's own
 * ingest from the ATCF b-deck -- and turns it into the OPERATIONAL representation of a selected
 * current storm.
 *
 * ================= WHAT THIS MODULE IS NOT ALLOWED TO TOUCH =================
 *
 * Nothing in here may reach the archive. Not the cohort, not analog matching, not intensity or
 * landfall rates, not a Wilson interval, not ESS, not calibration, not reliability, not the
 * archive comparison, not an event gate, not a refusal, not zero-peek replay. Those are
 * historical research over a post-analysed record, and an operational value entering any of them
 * would silently change what the archive says while looking like a bug fix.
 *
 * The wall is STRUCTURAL rather than a rule someone has to remember:
 *
 *   1. `Live` never sees the Archive's mutable state and the Archive never sees `Live`. The join
 *      is done by the caller, by ATCF id, and produces a THIRD object that neither owns.
 *   2. No historical module imports this file. scripts/test-atlas-live-boundary.mjs reads the
 *      import graph and fails the build if one ever does.
 *   3. Every historical entry point still takes exactly the arguments it took before. There is no
 *      optional `live` parameter anywhere in cohort.js, analogs.js, rates.js, stats.js,
 *      calibration.js, compare.js or timeline.js, so there is no call site that could pass one.
 *
 * ================= PRECEDENCE, IN ONE PARAGRAPH =================
 *
 * For a storm whose ARCHIVE record is provisional and for which an operational record exists, the
 * operational record IS the selected-storm representation: its fixes, its peak, its minimum, its
 * latest position and stage. The two are never concatenated and never blended -- taking the union
 * of two best tracks that overlap for six days would duplicate every fix in the overlap and
 * average two answers to the same question. The archive record stays exactly where it is,
 * unmodified, and remains the only thing the research surfaces read. When the archive record
 * stops being provisional -- post-analysis -- the archive wins and the operational record is no
 * longer used for values. That transition needs no code: it follows from the `provisional` column.
 */

/** The artifact this module knows how to read. A different schema is refused, not adapted. */
export const LIVE_SCHEMA = "atlas-live-v1";
export const LIVE_FILE = "atlas-live-v1.json";

/* The four states a selected storm can be in with respect to the operational layer. The whole
   point of naming them is that the fourth is not the first: "there is no live record" and "there
   should be a live record and there is not" look identical on screen unless something insists
   they do not. */
export const LIVE_NONE = "none";                 // no operational record expected for this storm
export const LIVE_OPERATIONAL = "operational";   // expected and loaded
export const LIVE_UNAVAILABLE = "unavailable";   // expected and NOT loaded — fail closed
export const LIVE_ARCHIVE_FINAL = "archive";     // post-analysed; the archive is the record

/* The archive's own Saffir-Simpson ladder, in knots. Copied from the pack's manifest at runtime
   where it exists so this cannot drift from the archive; the literals are the fallback and are
   the same numbers build_atlas_pack.py uses. A category shown beside an operational wind is
   DERIVED by this rule, and the panel marks it derived rather than implying ATCF published it. */
export const CATEGORY_KT = [
  ["cat5", 137], ["cat4", 113], ["cat3", 96], ["cat2", 83], ["cat1", 64], ["ts", 34], ["td", 0],
];

export function categoryForKt(kt, thresholds) {
  if (kt === null || kt === undefined || Number.isNaN(kt)) return null;
  const ladder = thresholds || CATEGORY_KT;
  for (const [name, min] of ladder) if (kt >= min) return name;
  return null;
}

/** The ladder the pack itself declares, when it declares one. */
export function categoryLadder(manifest) {
  const t = manifest && manifest.thresholds_kt;
  if (!t || typeof t !== "object") return null;
  const out = [];
  for (const [k, v] of Object.entries(t)) {
    if (typeof v === "number" && /^(td|ts|cat[1-5])$/.test(k)) out.push([k, v]);
  }
  if (out.length < 2) return null;
  return out.sort((a, b) => b[1] - a[1]);
}

/**
 * Fetch the operational artifact.
 *
 * NEVER THROWS INTO THE ARCHIVE LOAD. A missing or broken live artifact must not be able to stop
 * the Atlas opening -- the archive is the surface's reason to exist and it is complete without
 * this. What a failure DOES do is produce an `unavailable` layer, which is the state that makes
 * every provisional storm fail closed rather than quietly present its stub as current truth.
 */
export async function loadLive(baseUrl, { signal } = {}) {
  try {
    const res = await fetch(`${baseUrl}/${LIVE_FILE}`, { signal });
    if (!res.ok) return new Live(null, `HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.schema !== LIVE_SCHEMA) {
      return new Live(null, `unexpected schema ${JSON.stringify(json && json.schema)}`);
    }
    return new Live(json, null);
  } catch (e) {
    return new Live(null, String((e && e.message) || e));
  }
}

/**
 * The operational artifact in memory, plus the identity rule.
 *
 * `artifact` is null when the file could not be read. That is not the same as an artifact that
 * loaded and holds no storms: the first knows nothing about what should exist, the second knows
 * that nothing should. `ok` tells them apart and every state below turns on it.
 */
export class Live {
  constructor(artifact, error) {
    this.artifact = artifact || null;
    this.error = error || null;
    this.ok = !!artifact;
    const h = (artifact && artifact.health) || {};
    this.expected = new Set(h.expected_atcf_ids || []);
    this.emitted = new Set(h.emitted_atcf_ids || []);
    this.missing = new Set(h.missing_atcf_ids || []);
    this.stale = new Set(h.stale_atcf_ids || []);
    this.generatedAt = (artifact && artifact.generated_at) || null;
    this.health = h;
  }

  /**
   * The operational record for an ATCF id, or null.
   *
   * IDENTITY IS THE ATCF ID AND NOTHING ELSE. Not the name -- this archive holds LALA twice, as
   * EP121984 and as CP012026, and a name join would have attached a 2026 hurricane to a 1984
   * tropical storm. Not the IBTrACS storm_id, which the operational side does not have. The ATCF
   * id carries its own season, so a join can be checked against the archive row's season and
   * refused when they disagree, which is the guard below.
   */
  record(atcfId) {
    if (!this.ok || !atcfId) return null;
    const id = String(atcfId).trim().toUpperCase();
    const s = this.artifact.storms || {};
    return Object.prototype.hasOwnProperty.call(s, id) ? s[id] : null;
  }
}

/* An ATCF id's season, or null. BBNNYYYY. */
export function seasonOfAtcfId(id) {
  const m = /^([A-Z]{2})(\d{2})(\d{4})$/.exec(String(id || "").trim().toUpperCase());
  return m ? Number(m[3]) : null;
}

/**
 * WHICH OF THE FOUR STATES THIS STORM IS IN.
 *
 * @param {object} archive  the loaded pack
 * @param {number} row      the storm's pack row
 * @param {Live|null} live  the operational layer, or null when it was never even attempted
 * @returns {{state, record, atcfId, reason}}
 *
 * The order of the tests is the argument:
 *
 *  1. A POST-ANALYSED STORM IS FINISHED. `provisional === false` means the archive's record is
 *     the record; there is nothing for an operational file to continue and its presence changes
 *     nothing. This is the post-analysis transition, and it is one comparison.
 *  2. NO ATCF ID, NO JOIN. Most of this archive predates ATCF ids. A storm without one cannot be
 *     matched to an operational record and is not expected to have one.
 *  3. SEASON MUST AGREE. A defensive check that costs one comparison and forecloses the entire
 *     class of wrong-storm joins.
 *  4. THE LIVE LAYER FAILED TO LOAD. Now the fail-closed rule bites: the archive record is
 *     PROVISIONAL, so it is known to be incomplete, and there is no way to tell how incomplete.
 *     Showing it as a finished storm is the failure this whole change exists to end, so the state
 *     is `unavailable` and the panel says so.
 *  5. THE LAYER LOADED AND SAYS THIS STORM SHOULD HAVE A RECORD, but does not carry one. Same
 *     answer, better reason: the artifact's own health block names it as missing.
 *  6. THE LAYER LOADED AND HAS THE RECORD. Operational.
 *  7. THE LAYER LOADED AND DOES NOT EXPECT ONE. A provisional storm from a season nobody is
 *     tracking any more. The archive stub is all there is, it is still marked PROVISIONAL exactly
 *     as it was before this change, and nothing claims an operational continuation exists.
 */
export function liveStateFor(archive, row, live) {
  const provisional = archive.storms.bool("provisional", row);
  const atcfId = archive.storms.str("atcf_id", row);
  const season = archive.storms.num("season", row);

  if (provisional === false) {
    return { state: LIVE_ARCHIVE_FINAL, record: null, atcfId,
      reason: "post-analysed — the archive record is the record" };
  }
  if (!atcfId) {
    return { state: LIVE_NONE, record: null, atcfId: null,
      reason: "the archive holds no ATCF id for this storm, so no operational record can be matched to it" };
  }
  const idSeason = seasonOfAtcfId(atcfId);
  if (idSeason !== null && season !== null && idSeason !== season) {
    return { state: LIVE_NONE, record: null, atcfId,
      reason: `the ATCF id names season ${idSeason} and the archive row is season ${season} — refused rather than joined` };
  }
  if (!live || !live.ok) {
    return { state: LIVE_UNAVAILABLE, record: null, atcfId,
      reason: live && live.error
        ? `the operational record could not be read: ${live.error}`
        : "the operational record was not loaded" };
  }
  const rec = live.record(atcfId);
  if (rec) return { state: LIVE_OPERATIONAL, record: rec, atcfId, reason: null };
  if (live.expected.has(atcfId)) {
    return { state: LIVE_UNAVAILABLE, record: null, atcfId,
      reason: live.health && live.health.note
        ? `the operational source did not deliver this storm: ${live.health.note}`
        : "the operational source did not deliver this storm" };
  }
  return { state: LIVE_NONE, record: null, atcfId,
    reason: "no operational record is being tracked for this storm" };
}

/**
 * THE OPERATIONAL SELECTED-STORM REPRESENTATION.
 *
 * A third object, built from the operational record alone. It borrows NOTHING from the archive
 * row except the ladder used to name a category, and it is handed to the panel BESIDE the archive
 * storm rather than merged into it -- so every value on screen can say which of the two it came
 * from, and the archive object the research surfaces read is byte-for-byte what it was.
 *
 * `fixes` is the operational deck in full and is the ONLY track this returns. There is no code
 * path here that appends archive fixes to it: an overlap of six days would put two positions on
 * every synoptic hour, and a reader counting fixes would be counting the overlap twice.
 */
export function operationalView(rec, { manifest, now } = {}) {
  if (!rec) return null;
  const ladder = categoryLadder(manifest);
  const nowMs = now === undefined ? Date.now() : now;

  const latestMs = Date.parse(rec.latest_valid_time || "");
  const firstMs = Date.parse(rec.first_valid_time || "");
  const fetchedMs = Date.parse(rec.fetched_at || "");

  return {
    source: "atcf_bdeck",
    atcf_id: rec.atcf_id,
    name: rec.name || null,
    season: rec.season ?? null,
    basin: rec.basin || null,
    active: rec.active !== false,

    /* THE TWO CLOCKS, KEPT APART ALL THE WAY TO THE SCREEN. `age_hours` is the artifact's own
       source-to-fetch age. `stale_hours` is how long ago THIS BROWSER's clock says the fetch was,
       which is a different question and is the one that catches a page left open overnight. */
    fetched_at: Number.isFinite(fetchedMs) ? fetchedMs : null,
    first_valid_time: Number.isFinite(firstMs) ? firstMs : null,
    latest_valid_time: Number.isFinite(latestMs) ? latestMs : null,
    age_hours: rec.age_hours ?? null,
    since_fetch_hours: Number.isFinite(fetchedMs) && Number.isFinite(nowMs)
      ? Math.round(((nowMs - fetchedMs) / 3600000) * 10) / 10 : null,

    fix_count: rec.fix_count ?? null,
    fixes: rec.fixes || [],
    fixes_with_wind: rec.fixes_with_wind ?? null,
    fixes_with_pressure: rec.fixes_with_pressure ?? null,

    /* OPERATIONAL TO DATE. Not "peak" without qualification and never "whole life": for an active
       storm this is the maximum over the fixes that exist so far, and the storm has not
       finished. The category beside it is DERIVED from this wind by the archive's own ladder,
       because ATCF publishes a STAGE (HU) and not a Saffir-Simpson class. */
    peak_wind_kt: rec.peak_wind_kt ?? null,
    peak_wind_at: parseOrNull(rec.peak_wind_at),
    peak_category: categoryForKt(rec.peak_wind_kt, ladder),
    peak_category_derived: true,
    min_mslp_mb: rec.min_mslp_mb ?? null,
    min_mslp_at: parseOrNull(rec.min_mslp_at),

    latest: rec.latest || null,
    stage: rec.stage || null,
    stage_label: rec.stage_label || null,
    latest_category: categoryForKt(rec.latest && rec.latest.kt, ladder),

    /* The span the operational record covers. A subtraction of two source timestamps, exactly as
       the archive panel's lifetime is -- and labelled the same way, as derived. */
    span_hours: Number.isFinite(latestMs) && Number.isFinite(firstMs)
      ? (latestMs - firstMs) / 3600000 : null,

    ships_rt: rec.ships_rt || null,
    provenance: rec.source || null,
  };
}

function parseOrNull(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : null;
}

/**
 * WHERE THE TWO SOURCES DISAGREE, STATED RATHER THAN RESOLVED.
 *
 * Precedence decides what is SHOWN; it does not make the other number go away. A provisional
 * IBTrACS record that already holds a higher peak than the operational deck is a real fact about
 * the record and the reader is owed it -- silently showing the lower operational number would be
 * exactly the failure this change fixes, in the opposite direction.
 *
 * Nothing here averages, reconciles or picks a winner. Each row names both values and their
 * sources; the panel prints them.
 */
export function sourceDisagreement(archiveStorm, view) {
  if (!archiveStorm || !view) return [];
  const out = [];
  const a = archiveStorm;

  if (a.max_vmax_kt !== null && view.peak_wind_kt !== null && a.max_vmax_kt > view.peak_wind_kt) {
    out.push({
      key: "peak_wind", label: "PEAK WIND",
      archive: `${a.max_vmax_kt} kt`, operational: `${view.peak_wind_kt} kt`,
      why: "The provisional archive record holds a HIGHER peak than the operational deck has "
        + "reached. Both are shown; neither is adjusted to the other.",
    });
  }
  if (a.min_mslp_mb !== null && view.min_mslp_mb !== null && a.min_mslp_mb < view.min_mslp_mb) {
    out.push({
      key: "min_mslp", label: "MINIMUM PRESSURE",
      archive: `${a.min_mslp_mb} mb`, operational: `${view.min_mslp_mb} mb`,
      why: "The provisional archive record holds a LOWER minimum pressure than the operational "
        + "deck has reached. Both are shown; neither is adjusted to the other.",
    });
  }
  if (a.end_t !== null && view.latest_valid_time !== null && a.end_t > view.latest_valid_time) {
    out.push({
      key: "extent", label: "RECORD EXTENT",
      archive: fmtZ(a.end_t), operational: fmtZ(view.latest_valid_time),
      why: "The provisional archive record extends PAST the operational deck's last fix. The "
        + "operational record is still the selected-storm representation; it is not extended "
        + "with archive fixes to close the gap.",
    });
  }
  return out;
}

function fmtZ(ms) {
  const d = new Date(ms);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
}

/**
 * How far the archive falls short of the operational record. Used for the sentence a reader sees
 * when the archive stub is all there is -- ARCHIVE REPRESENTATION ENDS [timestamp] -- and for the
 * gate that refuses to let a displayed track terminate before the operational source without one.
 */
export function shortfall(archiveStorm, view) {
  if (!archiveStorm || !view) return null;
  const a = archiveStorm;
  const hours = a.end_t !== null && view.latest_valid_time !== null
    ? (view.latest_valid_time - a.end_t) / 3600000 : null;
  return {
    archive_end: a.end_t,
    operational_end: view.latest_valid_time,
    hours: hours !== null && hours > 0 ? hours : null,
    fixes: a.track_points !== null && view.fix_count !== null
      ? view.fix_count - a.track_points : null,
    wind_kt: a.max_vmax_kt !== null && view.peak_wind_kt !== null
      ? view.peak_wind_kt - a.max_vmax_kt : null,
    mslp_mb: a.min_mslp_mb !== null && view.min_mslp_mb !== null
      ? a.min_mslp_mb - view.min_mslp_mb : null,
  };
}

/* ---- the lifecycle of an operational record -------------------------------------------
 *
 * WHY THIS IS DERIVED HERE AND NOT LEFT TO THE ARCHIVE'S COLUMNS.
 *
 * The archive's genesis_events table carries hours_to_ts / cat1 / cat3 and the pack derives
 * cat2 / cat4 / cat5. Those describe the PROVISIONAL ARCHIVE RECORD. Printed beside an
 * operational peak they produce a flat contradiction on screen: for CP012026 the archive says
 * `CATEGORY 3 · 96 kt — never reached`, and the panel three rows above it says the storm reached
 * 115 kt. A dash there means "never reached the threshold", and against the operational record
 * that statement is false.
 *
 * So the ladder is re-derived from the operational fixes, by THE ARCHIVE'S OWN RULE, transcribed
 * from scripts/genesis/build/build_atlas_pack.py:derive_crossings and
 * build/genesis_events.py:build_genesis_events:
 *
 *   * genesis is the FIRST TROPICAL fix, by the archive's own status vocabulary;
 *   * only fixes at or after genesis are eligible;
 *   * the crossing is the FIRST fix at or above the threshold, never the maximum;
 *   * a threshold never reached has no crossing and no elapsed hours -- it is absent, not zero.
 *
 * The one rule that has no operational counterpart is the observed-versus-interpolated pool. A
 * b-deck has no interpolated fixes: every row is the forecast office's own analysis. The pool is
 * therefore every fix, and that is a difference in the SOURCE, not a relaxation of the rule.
 *
 * Everything this returns is DERIVED and the panel marks it so. It is a statement about one
 * selected storm and it goes nowhere near a cohort. */

/* The archive's own tropicality vocabulary, from scripts/genesis/schema.py. Subtropical stages
   are deliberately NOT tropical here, because they are not tropical there. */
export const TROPICAL_STATUS = new Set(["TD", "TS", "HU", "TY", "ST", "TC", "HR"]);

export function isTropicalStage(stage) {
  return TROPICAL_STATUS.has(String(stage || "").trim().toUpperCase());
}

/**
 * The operational record's own genesis and threshold ladder.
 *
 * @param {Array} fixes    the operational fixes, oldest first
 * @param {Array} ladder   [[name, minKt], ...] descending, from the pack's manifest
 * @returns {{genesis, first_fix, first_stage, crossings, hours, peak, hours_to_peak}}
 */
export function operationalLifecycle(fixes, ladder) {
  const f = fixes || [];
  const ord = (ladder || CATEGORY_KT).slice().sort((a, b) => a[1] - b[1]); // ascending
  const empty = { genesis: null, first_fix: null, first_stage: null,
    crossings: {}, hours: {}, peak: null, peak_at: null, hours_to_peak: null };
  if (!f.length) return empty;

  const t = (x) => Date.parse(x.t);
  const genesisFix = f.find((x) => isTropicalStage(x.stage)) || null;
  const genesisT = genesisFix ? t(genesisFix) : null;
  const after = genesisT === null ? f : f.filter((x) => t(x) >= genesisT);

  const crossings = {};
  const hours = {};
  for (const [name, thr] of ord) {
    /* td sits at 0 kt in the ladder and would match the first fix of any storm with a wind,
       which is not what a threshold crossing means. Genesis IS the td crossing here, and it is
       reported as genesis rather than twice. */
    if (thr <= 0) continue;
    const hit = after.find((x) => x.kt !== null && x.kt !== undefined && x.kt >= thr) || null;
    crossings[name] = hit ? t(hit) : null;
    hours[name] = hit && genesisT !== null ? (t(hit) - genesisT) / 3600000 : null;
  }

  let peak = null;
  let peakAt = null;
  for (const x of f) {
    if (x.kt !== null && x.kt !== undefined && (peak === null || x.kt > peak)) {
      peak = x.kt; peakAt = t(x);
    }
  }

  return {
    genesis: genesisT,
    genesis_position: genesisFix ? { lat: genesisFix.lat, lon: genesisFix.lon } : null,
    genesis_stage: genesisFix ? genesisFix.stage : null,
    first_fix: t(f[0]),
    first_stage: f[0].stage,
    first_position: { lat: f[0].lat, lon: f[0].lon },
    crossings,
    hours,
    peak,
    peak_at: peakAt,
    hours_to_peak: peakAt !== null && genesisT !== null ? (peakAt - genesisT) / 3600000 : null,
  };
}
