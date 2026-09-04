/* getAnalogs -- the browser's execution surface for scripts/genesis/retrieval/analogs.py.
 *
 * THIS IS NOT A SECOND METHODOLOGY. The archive's Python is authoritative. This file is a
 * transliteration of it, function by function and in the same order, so that the Atlas can
 * answer a click on the ocean without shipping the question to a server that does not exist.
 * scripts/test-atlas-parity.mjs runs both against the same query matrix and fails the build
 * when they disagree, which is the only thing that makes a second execution surface safe.
 *
 * WHAT IS PORTED. All of it, as of Phase 3.1: the spatial / seasonal / temporal filter, the
 * environment similarity weighting, the distance weighting, the effective sample size, the
 * gaps, the historical pathway density -- and the conditioned rates, their Wilson intervals,
 * the weighted rates, the refusal branches and the time-to-event distributions. The rate half
 * lives in ./rates.js.
 *
 * Phase 1 returned UNSCOREABLE_REQUIRES_CANONICAL wherever a rate belonged, because an
 * approximate browser statistic is not a smaller version of the archive's answer; it is a
 * different answer wearing its clothes. That box is closed by proving the port at parity, not
 * by lowering the bar.
 *
 * THE FOUR RULES, restated from the Python because they constrain this file too:
 *   1. Rates are refused below min_sample. Counts are always returned.
 *   2. The sample is STORMS, not track points.
 *   3. Effective sample size is published beside every rate, and the gate is applied to the
 *      RAW distinct-storm count, never to the flattering ESS.
 *   4. An absent outcome is not a zero.
 * AND A FIFTH, THIS BUILD'S OWN: a variable used to define the cohort cannot be reported as an
 * outcome of it. Enforced in rates.js -- `conditionedOn` below is how a caller declares what it
 * narrowed on, and the circular rows then refuse instead of returning a tautological 100%.
 */

import { haversineKm, wrap180 } from "./geo.js";
import { CATEGORIES, MIN_EVENTS_FOR_SKILL, THRESHOLDS_KT, kishEss } from "./stats.js";
import { circularOutcomes, circularRefusal, rateResult, timeDistribution } from "./rates.js";

/** The environment fields an envVector may key on, mapped to the archive column.
 *  Mirrors ENV_FIELDS in analogs.py:84 -- seven keys, and anything else is reported as a gap. */
export const ENV_FIELDS = {
  shear_kt: "shear_kt",
  rh_mid_pct: "rh_mid_pct",
  vort850_1e5: "vort850_1e5",
  pot_intensity_kt: "pot_intensity_kt",
  sst_c: "sst_c",
  gpi: "gpi",
  ohc_kj_cm2: "ohc_kj_cm2",
};

/** The window inside which an environment record counts as "the environment at genesis". */
const ENV_WINDOW_S = 12 * 3600;

const MS_PER_MIN = 60000;

function toMs(t) {
  if (t === null || t === undefined) return null;
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  const ms = Date.parse(String(t).replace(" ", "T"));
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Rank historical genesis events near (lat, lon) and describe what became of them.
 *
 * `asOf` is the zero-peek gate the back-test harness depends on: when set, only storms whose
 * GENESIS was strictly before that instant are eligible. Without it a back-test would score a
 * 2015 disturbance against analogs drawn from 2016-2025, which is not a base rate, it is the
 * answer written down in advance.
 */
export function getAnalogs(archive, opts = {}) {
  const {
    lat,
    lon,
    radiusKm = 500.0,
    seasonMonths = null,
    envVector = null,
    minSample = 10,
    asOf = null,
    basins = null,
    subbasins = null,
    genesisSubbasins = null,
    excludeStormIds = null,
    includeProvisional = false,
    envRequireMatch = true,
    minPoolSeason = null,
    regions = null,
    maxCases = null,
    trackDensityDeg = 2.0,
    /* What the CALLER narrowed the cohort on, so the engine can refuse to report those same
       variables as outcomes. Absent by default, which is what every parity vector uses -- with
       no conditioning declared this function is byte-for-byte the Python. See rates.js. */
    conditionedOn = null,
  } = opts;

  const gaps = [];
  const A = archive;
  const S = A.storms;
  const G = A.genesis;
  const asOfMs = toMs(asOf);
  const months = seasonMonths ? new Set(seasonMonths) : null;
  const excluded = excludeStormIds ? new Set(excludeStormIds) : new Set();

  // ---- 1. spatial / seasonal / temporal filter --------------------------------------
  // Iterates rows in the archive's own genesis_events order, which the pack preserves. That
  // matters at the sort below: two storms sharing a genesis position weigh exactly the same,
  // and a stable sort then falls back to input order. 200 storms in this archive sit on a
  // position shared with another.
  const matched = [];
  for (let i = 0; i < A.nStorms; i++) {
    const sid = S.str("storm_id", i);
    if (excluded.has(sid)) continue;
    const glat = G.num("genesis_lat", i);
    const glon = G.num("genesis_lon", i);
    const gtMin = G.num("genesis_t", i);
    if (glat === null || glon === null || gtMin === null) continue; // no genesis point
    const gtMs = gtMin * MS_PER_MIN;
    if (asOfMs !== null && gtMs >= asOfMs) continue; // THE ZERO-PEEK GATE
    const month = new Date(gtMs).getUTCMonth() + 1;
    if (months && !months.has(month)) continue;
    const season = G.num("season", i) || S.num("season", i);
    if (minPoolSeason && season && season < minPoolSeason) continue;
    if (basins && !basins.includes(S.str("basin", i))) continue;
    if (genesisSubbasins && !genesisSubbasins.includes(S.str("subbasin", i))) continue;
    if (subbasins && !A.enteredAny(i, subbasins)) continue;
    if (S.bool("provisional", i) && !includeProvisional) continue;
    const d = haversineKm(lat, lon, glat, glon);
    if (d > radiusKm) continue;
    matched.push({ row: i, storm_id: sid, d, gtMs, month, season, glat, glon });
  }

  // ---- 2. environment similarity ----------------------------------------------------
  let envByStorm = new Map();
  let stats = null;
  if (envVector) {
    const wanted = {};
    for (const [k, v] of Object.entries(envVector)) {
      if (k in ENV_FIELDS && v !== null && v !== undefined) wanted[k] = v;
    }
    const unknown = Object.keys(envVector).filter((k) => !(k in ENV_FIELDS)).sort();
    if (unknown.length) {
      gaps.push(`env_vector keys ignored (not in archive): [${unknown.map((u) => `'${u}'`).join(", ")}]`);
    }
    if (!A.env) {
      throw new Error("an env_vector was supplied but the environment pack is not loaded");
    }
    const E = A.env.tables.environment;
    if (!E.rows) gaps.push("environment table is empty -- env_vector could not be applied");

    // The environment AT GENESIS: the row nearest the genesis time for that storm. The scan
    // runs in archive order so the Map's insertion order -- and therefore the summation order
    // of the standardisation below -- reproduces the Python's exactly.
    const wantT = new Map();
    for (const m of matched) wantT.set(m.storm_id, m.gtMs);
    const stormRow = E.raw("storm_row");
    const best = new Map();
    for (let r = 0; r < E.rows; r++) {
      const sr = stormRow[r];
      if (sr < 0) continue;
      const sid = S.str("storm_id", sr);
      if (!wantT.has(sid)) continue;
      const rt = E.time("t", r);
      if (rt === null) continue;
      const dt = Math.abs((rt - wantT.get(sid)) / 1000);
      const cur = best.get(sid);
      if (cur === undefined || dt < cur[0]) best.set(sid, [dt, r]);
    }
    envByStorm = new Map();
    for (const [sid, [dt, r]] of best) if (dt <= ENV_WINDOW_S) envByStorm.set(sid, r);

    // Standardise against the MATCHED POOL, not the globe -- keeps a field from dominating
    // merely because it has large units.
    stats = {};
    for (const f of Object.keys(wanted)) {
      const col = ENV_FIELDS[f];
      const vals = [];
      for (const r of envByStorm.values()) {
        const v = E.num(col, r);
        if (v !== null && !Number.isNaN(v)) vals.push(v);
      }
      if (vals.length >= 3) {
        let sum = 0;
        for (const v of vals) sum += v;
        const mu = sum / vals.length;
        let acc = 0;
        for (const v of vals) acc += (v - mu) * (v - mu);
        const sd = Math.sqrt(acc / (vals.length - 1));
        if (sd > 0) stats[f] = sd;
      }
    }
    const missingSd = Object.keys(wanted).filter((f) => !(f in stats)).sort();
    if (missingSd.length) {
      gaps.push("env fields with too few archived values to standardise, ignored: " +
        `[${missingSd.map((u) => `'${u}'`).join(", ")}]`);
    }
  }

  // ---- 3. weights -------------------------------------------------------------------
  const scale = Math.max(radiusKm / 2.0, 1e-6);
  let cases = [];
  const E = A.env ? A.env.tables.environment : null;
  for (const m of matched) {
    const q = m.d / scale;
    const wDist = Math.exp(-0.5 * (q * q));
    let wEnv = 1.0;
    let compared = 0;
    const envValues = {};
    if (envVector) {
      const r = envByStorm.get(m.storm_id);
      if (r !== undefined) {
        let acc = 0.0;
        for (const [f, target] of Object.entries(envVector)) {
          if (!(f in ENV_FIELDS) || target === null || target === undefined) continue;
          const sd = stats ? stats[f] : undefined;
          const val = E.num(ENV_FIELDS[f], r);
          if (sd === undefined || val === null || Number.isNaN(val)) continue;
          const z = (val - Number(target)) / sd;
          acc += z * z;
          compared += 1;
        }
        // per-field mean keeps the weight comparable across cases that matched different counts
        if (compared) wEnv = Math.exp((-0.5 * acc) / compared);
        for (const [k, col] of Object.entries(ENV_FIELDS)) envValues[k] = E.num(col, r);
      }
    }
    cases.push({
      storm_id: m.storm_id,
      row: m.row,
      atcf_id: G.str("source_key", m.row) === null ? null : S.str("atcf_id", m.row),
      name: S.str("name", m.row),
      season: m.season,
      basin: S.str("basin", m.row),
      subbasin: S.str("subbasin", m.row),
      genesis_utc: new Date(m.gtMs).toISOString(),
      genesis_lat: m.glat,
      genesis_lon: m.glon,
      genesis_month: m.month,
      distance_km: m.d,
      weight: wDist * wEnv,
      weight_distance: wDist,
      weight_env: wEnv,
      env_fields_compared: compared,
      peak_vmax_kt: G.num("peak_vmax_kt", m.row) !== null
        ? G.num("peak_vmax_kt", m.row)
        : S.num("max_vmax_kt", m.row),
      max_category: S.str("max_category", m.row),
      hours_to_ts: G.num("hours_to_ts", m.row),
      hours_to_cat1: G.num("hours_to_cat1", m.row),
      hours_to_cat3: G.num("hours_to_cat3", m.row),
      landfalls: [],
      environment: Object.keys(envValues).length ? envValues : {},
    });
  }

  // AN UNKNOWN ENVIRONMENT IS NOT A PERFECT MATCH.
  //
  // A case with no archived environment near its genesis has env_fields_compared == 0. Left at
  // weight 1.0 it does not merely survive an environment-conditioned query -- it WINS it,
  // ranking above every case whose environment was actually measured and found similar, and
  // then dominating the weighted rate. So when an env_vector is supplied, cases that cannot be
  // compared are EXCLUDED and counted.
  let envUnmatched = 0;
  if (envVector) {
    const unmatched = cases.filter((c) => c.env_fields_compared === 0);
    envUnmatched = unmatched.length;
    if (envUnmatched) {
      if (envRequireMatch) {
        cases = cases.filter((c) => c.env_fields_compared > 0);
        gaps.push(
          `${envUnmatched} of ${envUnmatched + cases.length} positional analogs have no ` +
          "archived environment within 12h of genesis and were EXCLUDED from this " +
          "environment-conditioned query (SHIPS begins 1982 and ends 2023). Pass " +
          "env_require_match=False to keep them at a neutral weight instead.");
      } else {
        gaps.push(
          `${envUnmatched} analogs have no archived environment and are kept at a neutral ` +
          "weight (env_require_match=False): their similarity to the supplied env_vector is " +
          "UNKNOWN, not established.");
      }
    }
  }

  // THE PRE-SATELLITE INTENSITY BIAS, MEASURED ON THIS ARCHIVE.
  // East Pacific storms reaching Cat 3 by decade: 1950s 5.2%, 1960s 1.7%, then 1970s 20.3%,
  // 1980s 22.5%, 1990s 29.7%. The step is not weather -- before geostationary satellites and
  // Dvorak, major hurricanes there were simply not seen, and a pool reaching into those seasons
  // drags every intensity rate downward invisibly.
  const early = cases.filter((c) => c.season && c.season < 1971);
  if (early.length && !minPoolSeason) {
    gaps.push(
      `${early.length} of ${cases.length} analogs are from before 1971, when East Pacific ` +
      "intensities were estimated without geostationary satellites or Dvorak analysis and " +
      "major hurricanes were under-observed (measured: 1.7% Cat 3 in the 1960s vs 20-30% from " +
      "the 1970s on). Intensity rates above are therefore biased LOW. Pass " +
      "min_pool_season=1971 to restrict the pool to the reliably-observed era.");
  }

  // Stable sort on descending weight. The explicit comparator returns 0 for equal weights so
  // ties keep input order, which is what Python's sort(key=-weight) does -- and ties are real
  // here, because storms sharing a genesis position weigh identically.
  cases.sort((a, b) => (a.weight === b.weight ? 0 : a.weight < b.weight ? 1 : -1));
  if (maxCases) cases = cases.slice(0, maxCases);

  const ids = new Set(cases.map((c) => c.storm_id));
  const weights = cases.map((c) => c.weight);
  const ess = kishEss(weights);
  /* Summed here, in case order, because that is where analogs.py:601 sums it -- and a float
     sum is order-dependent, so "the same total computed later" is not the same total. It is the
     weighted DENOMINATOR for every landfall contract below. */
  let wsum = 0;
  for (const w of weights) wsum += w;

  /* Landfalls, outcomes, transit times and the unscoreable contracts -- all of it delegated to
     scoreCases so that a cohort assembled any other way is scored by the SAME code. wsum is
     passed rather than recomputed: it must be summed in case order (analogs.py:601) and a float
     sum computed elsewhere is a different float. */
  /* THE SCOPE, derived the same way analogs.py derives it: the basins the matches actually
     occupy, falling back to the declared basins and then to the whole archive when nothing
     matched. An empty pool still publishes its refusals -- the count was never a property of
     the match -- so it must not derive a scope from no storms. */
  const matchedBasins = [...new Set(cases.map((c) => c.basin).filter(Boolean))].sort();
  const scopeBasins = matchedBasins.length ? matchedBasins : (basins ? [...basins].sort() : null);
  const scored = scoreCases(A, cases, {
    minSample, regions, conditionedOn, wsum, gaps,
    scope: { basins: scopeBasins, minSeason: minPoolSeason ?? null, maxSeason: null },
  });
  const { intensity, landfall, time_to_event: timeToEvent, unscoreable } = scored;

  // ---- 6. historical pathway density ------------------------------------------------
  const trackDensity = pathwayDensity(A, cases, trackDensityDeg);

  // THE GATE COUNTS STORMS; THE WEIGHTING CAN STILL CONCENTRATE ON A HANDFUL.
  const nCases = cases.length;
  if (wsum > 0 && ess < minSample && minSample <= nCases) {
    gaps.push(
      `effective sample size is ${fmt1(ess)} from ${nCases} matched storms -- the weighting ` +
      "has concentrated on a few analogs, so the WEIGHTED rates rest on fewer effective cases " +
      `than the ${minSample} the gate requires. The unweighted \`rate\` is over all ${nCases}.`);
  }

  return {
    query: {
      lat, lon, radius_km: radiusKm,
      season_months: seasonMonths,
      env_vector: envVector,
      as_of: asOfMs === null ? null : new Date(asOfMs).toISOString(),
      basins, subbasins, genesis_subbasins: genesisSubbasins, regions,
      include_provisional: includeProvisional,
      min_pool_season: minPoolSeason,
    },
    n_cases: nCases,
    env_unmatched_excluded: envUnmatched,
    intensity,
    landfall,
    time_to_event: timeToEvent,
    unscoreable,
    effective_sample_size: ess,
    sufficient: nCases >= minSample,
    min_sample: minSample,
    cases,
    track_density: trackDensity,
    gaps,
    /* What the cohort was narrowed on, echoed back so a reader can see which rows refuse and
       why without inferring it from the refusal text. Null when nothing was declared. */
    conditioned_on: conditionedOn,
    provenance: {
      methodology_version: A.core.header.methodology_version,
      processing_version: A.core.header.processing_version,
      archive_stamp: A.core.header.archive_stamp,
      track_density_deg: trackDensityDeg,
      surface: "browser (transliterated from scripts/genesis/retrieval/analogs.py)",
    },
    ids,
  };
}

/**
 * Historical pathway density: 2-degree cells, each storm counted ONCE per cell.
 *
 * Counting fixes instead of storms would let a slow-moving storm outvote a fast one, which
 * turns a pathway map into a speed map. Cell keys use Python's float formatting, including its
 * signed zero, so the two implementations produce the same key set.
 */
export function pathwayDensity(archive, cases, step = 2.0) {
  const density = new Map();
  if (!cases.length) return density;
  const { ptLat, ptLon } = archive;
  const g = cellGrid(step);
  /* A DENSE COUNT PLUS A PER-CELL STAMP, rather than a Set of "cell|storm" marks.
     The dedupe question -- "has THIS storm already been counted in THIS cell?" -- is answered
     by writing the storm's ordinal into the cell and comparing, which is one array read and one
     compare per track point instead of a hash insert. Over the whole archive that is 224,153
     points, and this runs on every click and every filter change.
     The returned keys are unchanged: still the archive's own "lat,lon" strings in Python's
     float formatting, because the parity harness compares them against Python's dict. */
  const counts = new Int32Array(g.cells);
  const stamp = new Int32Array(g.cells).fill(-1);
  for (let ci = 0; ci < cases.length; ci++) {
    const c = cases[ci];
    const row = typeof c === "object" ? c.row : c;
    const [a, b] = archive.trackRange(row);
    for (let k = a; k < b; k++) {
      const cell = cellOf(g, ptLat[k] / 100, wrap180(ptLon[k] / 100), step);
      if (stamp[cell] === ci) continue;
      stamp[cell] = ci;
      counts[cell]++;
    }
  }
  emitCells(density, counts, g, step);
  return density;
}

/**
 * Where the storms in this population FORMED: genesis points per cell, a plain count.
 *
 * Deliberately a count and not a proportion. The brief asks to see genesis by intensity
 * outcome, and that is applied as a FILTER -- pass the rows that reached Cat 3 and the surface
 * shows where those storms formed. Shading each cell by the fraction of its storms that reached
 * Cat 3 would be a conditioned rate wearing a colour ramp, and this build does not publish
 * rates; it would also divide by cell counts of one or two over most of the map.
 *
 * @param rows storm rows (a Uint32Array from filterStorms, or any array of indexes)
 */
export function genesisDensity(archive, rows, step = 2.0) {
  const density = new Map();
  if (!rows.length) return density;
  const lat = archive.genesisLat;
  const lon = archive.genesisLon;
  const g = cellGrid(step);
  const counts = new Int32Array(g.cells);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const la = lat[row];
    // 54 storms have no genesis point. They are absent from this surface rather than being
    // placed at a coordinate nobody recorded.
    if (Number.isNaN(la)) continue;
    counts[cellOf(g, la, wrap180(lon[row]), step)]++;
  }
  emitCells(density, counts, g, step);
  return density;
}

/** One member row appended to a contract's list, creating the list on first use. */
function memberPush(bag, key, row) {
  const list = bag[key] || (bag[key] = []);
  list.push(row);
}

/* One cell convention, shared by both surfaces so the two grids line up exactly on screen.
   Sized with a margin so a fix at a pole or hard on the antimeridian cannot land out of range. */
export function cellGrid(step) {
  const rows = Math.ceil(180 / step) + 2;
  const cols = Math.ceil(360 / step) + 2;
  return { rows, cols, cells: rows * cols, oy: Math.ceil(90 / step) + 1, ox: Math.ceil(180 / step) + 1 };
}
export function cellOf(g, lat, lon180, step) {
  const cy = Math.floor(lat / step) + g.oy;
  const cx = Math.floor(lon180 / step) + g.ox;
  return cy * g.cols + cx;
}
export function emitCells(density, counts, g, step) {
  for (let cell = 0; cell < counts.length; cell++) {
    const n = counts[cell];
    if (!n) continue;
    const cy = ((cell / g.cols) | 0) - g.oy;
    const cx = (cell % g.cols) - g.ox;
    density.set(`${fmt1(cy * step)},${fmt1(cx * step)}`, n);
  }
}

/** Python's f"{x:.1f}" -- which prints negative zero as "-0.0" where JS toFixed prints "0.0". */
export function fmt1(x) {
  const s = Math.abs(x).toFixed(1);
  return (x < 0 || Object.is(x, -0)) ? "-" + s : s;
}

/**
 * How the counted population is named on screen.
 *
 * Transliterated word for word from `scope_phrase` in analogs.py. The refusal `reason` built
 * from it is compared VERBATIM across the two surfaces by test-atlas-parity.mjs, so a
 * difference of one comma here fails the build -- which is the intended tripwire.
 */
export function scopePhrase(basins, minSeason, maxSeason) {
  let where = basins && basins.length
    ? `in the ${[...basins].sort().join(", ")} basin` : "in the archive";
  if (basins && basins.length > 1) where += "s";
  if (minSeason !== null && minSeason !== undefined
    && maxSeason !== null && maxSeason !== undefined) {
    return `${where} between ${minSeason} and ${maxSeason}`;
  }
  if (minSeason !== null && minSeason !== undefined) return `${where} since ${minSeason}`;
  if (maxSeason !== null && maxSeason !== undefined) return `${where} up to ${maxSeason}`;
  return basins && basins.length ? where : "in the entire archive";
}

/* Distinct storms per landfall contract, over the population a query can draw from.
   THIS IS NOT THE MATCHED SAMPLE -- whether a contract can carry a skill number is a property of
   the RECORD; whether enough matched storms have a known outcome is a property of the SAMPLE,
   and min_sample governs that.

   WHICH RECORD, THOUGH. Counting the WHOLE archive was the bug methodology 1.1.0 fixed: an east
   Pacific query asking about a US mainland landfall passed the gate on 699 Atlantic events and
   six Pacific ones. Basin and era bound the population a query can draw from, so they bound the
   count; months, radius and subbasin deliberately do not, because they narrow WITHIN a drawable
   population and that is the matched sample again.

   Cached per scope. The old cache keyed on the archive alone, which would now serve the first
   scope's answer to every later one -- the shape would be right and the numbers wrong. */
const _eventCounts = new WeakMap();

export function scopeKeyOf(scope) {
  if (!scope) return "*";
  const b = scope.basins && scope.basins.length ? [...scope.basins].sort().join(",") : "*";
  return `${b}|${scope.minSeason ?? "*"}|${scope.maxSeason ?? "*"}`;
}

function archiveEventCounts(A, scope = null) {
  let per = _eventCounts.get(A);
  if (!per) { per = new Map(); _eventCounts.set(A, per); }
  const key = scopeKeyOf(scope);
  const hit = per.get(key);
  if (hit) return hit;

  const S = A.storms;
  const want = scope && scope.basins && scope.basins.length ? new Set(scope.basins) : null;
  const lo = scope && scope.minSeason !== null && scope.minSeason !== undefined
    ? scope.minSeason : null;
  const hi = scope && scope.maxSeason !== null && scope.maxSeason !== undefined
    ? scope.maxSeason : null;

  /* The landfalls table carries no basin, so basin and era come through the storms table.
     Built once per scope rather than per row. */
  let inScope = null;
  if (want || lo !== null || hi !== null) {
    inScope = new Set();
    for (let i = 0; i < A.nStorms; i++) {
      if (want && !want.has(S.str("basin", i))) continue;
      const season = S.num("season", i);
      if (lo !== null && (season === null || season < lo)) continue;
      if (hi !== null && (season === null || season > hi)) continue;
      inScope.add(S.str("storm_id", i));
    }
  }

  const L = A.landfalls;
  const sets = new Map();
  for (let k = 0; k < L.rows; k++) {
    const region = L.str("region", k);
    if (!region || L.bool("suspect_relocation", k) === true) continue;
    const sid = A.storms.str("storm_id", L.raw("storm_row")[k]);
    if (inScope && !inScope.has(sid)) continue;
    add(sets, `${region}:any`, sid);
    if (L.bool("hurricane_at_landfall", k) === true) add(sets, `${region}:hurricane`, sid);
  }
  const out = {};
  for (const [k, v] of sets) out[k] = v.size;
  per.set(key, out);
  return out;
}

function add(map, key, value) {
  let s = map.get(key);
  if (!s) { s = new Set(); map.set(key, s); }
  s.add(value);
}

const _regions = new WeakMap();
function regionsPresent(A) {
  const hit = _regions.get(A);
  if (hit) return hit;
  const out = new Set();
  for (let k = 0; k < A.landfalls.rows; k++) {
    const r = A.landfalls.str("region", k);
    if (r) out.add(r);
  }
  _regions.set(A, out);
  return out;
}

function landfallView(l) {
  return {
    region: l.region,
    sub_region: l.sub_region,
    landfall_utc: l.t === null ? null : new Date(l.t).toISOString(),
    vmax_kt: l.vmax_kt,
    category: l.category,
    hurricane: l.hurricane_at_landfall === true,
    detection: l.detection,
    suspect_relocation: l.suspect_relocation === true,
  };
}

/**
 * Score a set of cases: landfalls, intensity outcomes, transit times, unscoreable contracts.
 *
 * EXTRACTED SO THAT A COHORT ASSEMBLED ANY OTHER WAY IS SCORED BY THE SAME CODE.
 * getAnalogs builds its cases by distance from a genesis point; the cohort layer builds them
 * from a filter with no spatial term at all. Both must produce outcomes the same way or the
 * Atlas has two answers again -- which is the whole thing this phase exists to end. The parity
 * harness proves this extraction moved nothing: getAnalogs' output is unchanged by it.
 *
 * @param A            the loaded Archive
 * @param cases        case objects; each needs {row, storm_id, weight, peak_vmax_kt,
 *                     hours_to_ts, hours_to_cat1, hours_to_cat3, genesis_utc}. `landfalls` is
 *                     populated here.
 * @param wsum         sum of case weights, summed IN CASE ORDER by the caller. Not recomputed
 *                     here: a float sum is order-dependent, so the caller owns the order.
 * @param gaps         appended to, not replaced.
 */
export function scoreCases(A, cases, {
  minSample = 10, regions = null, conditionedOn = null, wsum = 0, gaps = [],
  /* THE POPULATION THIS QUERY CAN DRAW FROM: {basins, minSeason, maxSeason}, or null for the
     whole archive. It decides what the BASE RATE ONLY gate counts over, and nothing else.
     scoreCases is the one seam both surfaces score through, so it is the one place the scope
     has to arrive -- and until methodology 1.1.0 it arrived nowhere, which is exactly how the
     gate came to count a population no query could reach. */
  scope = null,
  /* PER-CONTRACT MEMBER ROWS, OFF BY DEFAULT.
   *
   * The lens -- hold a row, see those storms on the plate -- needs to know WHICH storms are in
   * each contract's numerator, and the locked rule is that the renderer never reproduces a
   * statistical predicate: membership is the engine's to decide, here, in the same loop that
   * counts it. Collecting it here rather than re-deriving it in the UI is what makes the lifted
   * set and the published count the same set by construction, which scripts/check-atlas-lens.mjs
   * asserts row by row.
   *
   * OPT-IN, because this function is also the parity seam. Every existing caller -- the parity
   * harness, the gates, the bench -- gets exactly the object it got before, with no extra key
   * and no extra work; the surface asks for members and pays for them. */
  collectMembers = false,
} = {}) {
  const circular = circularOutcomes(conditionedOn);
  /* row arrays, in case order, so a member list is in the archive's own row order. */
  const members = collectMembers ? { intensity: {}, landfall: {} } : null;
  const becamePeak = conditionedOn && conditionedOn.minPeak
    ? `a peak intensity of ${conditionedOn.minPeak} or above` : null;
  // ---- 4. landfalls for the matched storms ------------------------------------------
  if (!A.landfalls.rows) {
    gaps.push("the landfalls table is empty -- landfall rates cannot be computed");
  }
  for (const c of cases) c.landfalls = A.stormLandfalls(c.row).map(landfallView);

  const knownRegions = regionsPresent(A);
  if (regions) {
    const unknownAsked = regions.filter((r) => !knownRegions.has(r)).sort();
    if (unknownAsked.length) {
      gaps.push("regions requested but absent from the landfalls table: " +
        `[${unknownAsked.map((u) => `'${u}'`).join(", ")}]`);
    }
  }

  // ---- 5. intensity outcomes --------------------------------------------------------
  //
  // analogs.py:624. Rule 4 is what makes the denominator worth having: a storm whose intensity
  // was never recorded leaves the denominator and is counted in n_unknown. It is not a storm
  // that failed to reach hurricane strength.
  //
  // The weighted sums accumulate INSIDE this loop, in case order, exactly where the Python
  // accumulates them. Summing them anywhere else would give a different float.
  const intensity = {};
  for (const cat of CATEGORIES) {
    const thr = THRESHOLDS_KT[cat];
    let count = 0;
    let known = 0;
    let unknown = 0;
    let wnum = 0;
    let wden = 0;
    for (const c of cases) {
      const v = c.peak_vmax_kt;
      if (v === null || v === undefined || Number.isNaN(v)) { unknown++; continue; }
      known++;
      wden += c.weight;
      if (v >= thr) { count++; wnum += c.weight; if (members) memberPush(members.intensity, cat, c.row); }
    }
    if (members && !members.intensity[cat]) members.intensity[cat] = [];
    intensity[cat] = circular.intensity.has(cat)
      ? circularRefusal(count, known, unknown, becamePeak)
      : rateResult(count, known, unknown, minSample, wnum, wden);
  }

  // Regions reported are the ones the matched storms actually hit, plus any the caller named
  // that the archive knows about -- so a named region reports an explicit zero rather than
  // silence. analogs.py:650.
  const hitRegions = new Set();
  for (const c of cases) for (const l of c.landfalls) if (l.region) hitRegions.add(l.region);
  const asked = new Set(regions || []);
  const reportRegions = [...new Set([...hitRegions, ...[...asked].filter((r) => knownRegions.has(r))])]
    .sort();
  /* analogs.py:675. The denominator is EVERY matched case, not just the ones that came ashore,
     and the weighted denominator is wsum for the same reason: the question is "what fraction of
     the storms that formed here reached this coast", so a storm that went out to sea is a
     measured no, not a missing value. Hence n_unknown = 0 -- there is nothing unknown about it. */
  const landfall = {};
  for (const region of reportRegions) {
    let any = 0;
    let hur = 0;
    let wAny = 0;
    let wHur = 0;
    for (const c of cases) {
      const hits = c.landfalls.filter((l) => l.region === region && !l.suspect_relocation);
      if (hits.length) {
        any++;
        wAny += c.weight;
        if (members) memberPush(members.landfall, `${region}:any`, c.row);
      }
      if (hits.some((h) => h.hurricane)) {
        hur++;
        wHur += c.weight;
        if (members) memberPush(members.landfall, `${region}:hurricane`, c.row);
      }
    }
    if (members) {
      if (!members.landfall[`${region}:any`]) members.landfall[`${region}:any`] = [];
      if (!members.landfall[`${region}:hurricane`]) members.landfall[`${region}:hurricane`] = [];
    }
    const because = conditionedOn && conditionedOn.landfallRegion === region
      ? `a landfall in ${region}` +
        (conditionedOn.landfallHurricaneOnly ? " at hurricane intensity" : "")
      : null;
    landfall[region] = {
      any: circular.landfall.has(`${region}:any`)
        ? circularRefusal(any, cases.length, 0, because)
        : rateResult(any, cases.length, 0, minSample, wAny, wsum),
      hurricane: circular.landfall.has(`${region}:hurricane`)
        ? circularRefusal(hur, cases.length, 0, because)
        : rateResult(hur, cases.length, 0, minSample, wHur, wsum),
    };
  }

  /* THE DENOMINATOR NOTE. A cohort conditioned on "made landfall anywhere" makes no single
     contract circular -- regions do not partition, so no cell is 100% by construction and
     refusing them would be over-refusing a real answer. What it does do is change what every
     landfall denominator MEANS: the storms that never came ashore have been removed from it, so
     each regional rate is now a share of the landfalling population rather than of the cohort a
     reader thinks they built. That is a selection effect, not a tautology, and it gets a
     statement rather than a refusal -- attached here so it travels with the numbers. */
  const landfallNote = conditionedOn && conditionedOn.landfallAny
    ? `This cohort was defined by making landfall SOMEWHERE, so every rate below is a share of ` +
      `the ${cases.length} storms that came ashore — not of all storms. Regions do not ` +
      "partition (a storm can appear in several), so no single rate is circular, but each is " +
      "higher than the same contract over an unselected cohort would be."
    : null;

  /* ---- 7. time-to-event distributions (analogs.py:693) ------------------------------
   *
   * NEVER SUPPRESSED BY THE FIFTH RULE. If a cohort is conditioned on reaching Cat 3 then the
   * RATE is a tautology, but WHEN those storms reached it is a real distribution and usually
   * the most useful thing such a cohort has to say. Only rates go circular; timings do not.
   *
   * The landfall series appends one value PER LANDFALL, not per storm -- a storm that came
   * ashore in a region twice contributes both transits, which is what the Python does. */
  const timeToEvent = {
    ts: timeDistribution(cases.map((c) => c.hours_to_ts)),
    cat1: timeDistribution(cases.map((c) => c.hours_to_cat1)),
    cat3: timeDistribution(cases.map((c) => c.hours_to_cat3)),
  };
  for (const region of reportRegions) {
    const hrs = [];
    for (const c of cases) {
      const gt = Date.parse(c.genesis_utc);
      for (const l of c.landfalls) {
        if (l.region !== region || l.suspect_relocation) continue;
        const lt = l.landfall_utc === null ? NaN : Date.parse(l.landfall_utc);
        if (Number.isFinite(gt) && Number.isFinite(lt)) hrs.push((lt - gt) / 3600000);
      }
    }
    timeToEvent[`landfall_${region}`] = timeDistribution(hrs);
  }

  /* Which of these contracts can NEVER carry a skill number -- and whether that is a limit of
     the RECORD or a limit of the POPULATION THIS QUERY ASKED ABOUT. Two different statements,
     conflated until methodology 1.1.0, and the difference is what a reader can act on.

     Hawaii hurricane landfall has two events in the whole archive: irreducible, and no cohort
     helps. CONUS landfall has 699, six of them east Pacific: an east Pacific query cannot reach
     them, but a different query can, and saying so is strictly more useful than silence. */
  const scoped = archiveEventCounts(A, scope);
  const global = archiveEventCounts(A, null);
  const where = scopePhrase(
    scope && scope.basins, scope && scope.minSeason, scope && scope.maxSeason);

  const unscoreable = {};
  for (const region of reportRegions) {
    for (const kind of ["any", "hurricane"]) {
      const n = scoped[`${region}:${kind}`] || 0;
      if (n >= MIN_EVENTS_FOR_SKILL) continue;
      const total = global[`${region}:${kind}`] || 0;
      if (total < MIN_EVENTS_FOR_SKILL) {
        // IRREDUCIBLE: no population in this archive carries enough.
        unscoreable[`${region}:${kind}`] = {
          archive_events: total,
          scope_events: n,
          scope: where,
          required: MIN_EVENTS_FOR_SKILL,
          status: "BASE RATE ONLY -- unscoreable",
          reason: `only ${total} storm(s) in the entire archive carry this outcome, below the ` +
            `${MIN_EVENTS_FOR_SKILL} distinct events any skill score requires. A base rate can ` +
            "be quoted with its interval; a calibrated or skill-scored probability cannot, and " +
            "this archive will not produce one.",
        };
      } else {
        // OUT OF SCOPE: the events exist, somewhere this query cannot reach.
        unscoreable[`${region}:${kind}`] = {
          archive_events: total,
          scope_events: n,
          scope: where,
          required: MIN_EVENTS_FOR_SKILL,
          status: "OUT OF SCOPE -- unscoreable here",
          reason: `only ${n} storm(s) ${where} carry this outcome, below the ` +
            `${MIN_EVENTS_FOR_SKILL} distinct events any skill score requires. The archive ` +
            `holds ${total} in total, outside the population this query draws from. Widen the ` +
            "basin or the era and this contract becomes scoreable; a skill number over a " +
            "population that does not carry the events would be borrowed from one that does.",
        };
      }
    }
  }
  /* MEMBERS ARE FROZEN INTO TYPED ARRAYS ON THE WAY OUT, so nothing downstream can push a row
     into a published numerator's membership after the fact. Absent entirely unless asked for. */
  if (members) {
    for (const k of Object.keys(members.intensity)) {
      members.intensity[k] = Uint32Array.from(members.intensity[k]);
    }
    for (const k of Object.keys(members.landfall)) {
      members.landfall[k] = Uint32Array.from(members.landfall[k]);
    }
  }
  return { intensity, landfall, time_to_event: timeToEvent, unscoreable, reportRegions,
           landfall_note: landfallNote, ...(members ? { members } : {}) };
}
