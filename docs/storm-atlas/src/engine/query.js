/* Filtering the population -- and counting what the filter could not decide.
 *
 * This is the Atlas's own filter, not the analog query. It answers "which storms should be on
 * screen", and the one rule that shapes it is the archive's fourth: AN ABSENT OUTCOME IS NOT A
 * ZERO. 276 storms in this archive have no recorded intensity at all. Asking for "Cat 1 and
 * above" cannot include them, and it must not silently exclude them either -- a reader watching
 * the storm count drop from 3,959 to 1,855 deserves to know how much of the drop was storms
 * that did not reach hurricane strength and how much was storms nobody measured.
 *
 * So every filter returns the rows it kept AND the rows it could not decide, and the UI shows
 * the second number beside the first.
 */

import { THRESHOLDS_KT } from "./stats.js";
import { haversineKm } from "./geo.js";

export const INTENSITY_FILTERS = [
  { key: "all", label: "ALL STORMS", threshold: null },
  { key: "ts", label: "TS+", threshold: THRESHOLDS_KT.ts },
  { key: "cat1", label: "CAT 1+", threshold: THRESHOLDS_KT.cat1 },
  { key: "cat3", label: "CAT 3+", threshold: THRESHOLDS_KT.cat3 },
  { key: "cat4", label: "CAT 4+", threshold: THRESHOLDS_KT.cat4 },
  { key: "cat5", label: "CAT 5", threshold: THRESHOLDS_KT.cat5 },
];

export const LANDFALL_FILTERS = [
  { key: "any", label: "ANY LANDFALL", region: null },
  { key: "mexico", label: "MEXICO", region: "mexico" },
  { key: "conus", label: "CONUS", region: "conus" },
  { key: "hawaii", label: "HAWAII", region: "hawaii" },
  { key: "caribbean", label: "CARIBBEAN", region: "caribbean" },
  { key: "central_america", label: "CENTRAL AMERICA", region: "central_america" },
];

export const DEFAULT_FILTERS = Object.freeze({
  /* Proximity to GENESIS -- where the storm formed, never where it passed.
   *
   * This is the one filter the rail never had, and its absence is why the Atlas had two query
   * surfaces: a probe could ask "what formed within 500 km of here" but the drawn population
   * could not, so the map and the statistics were answering different questions. With it, one
   * cohort spec drives both. Null keeps every storm, which is what makes the migration from
   * the old filter path provable rather than merely likely. */
  where: null, // { lat, lon, radiusKm }
  seasonFrom: null,
  seasonTo: null,
  months: null, // null = every month
  basins: null, // null = every basin
  subbasinsEntered: null, // "was ever here", the Iniki-safe filter
  intensity: "all",
  landfall: null, // null = no landfall requirement
  includeProvisional: false,
  namedOnly: false,
});

/**
 * @returns {{rows: Uint32Array, kept: number, undecidable: number, excluded: object}}
 *   `undecidable` counts storms an intensity filter could not judge because the archive holds
 *   no wind for them. They are not in `rows`, and they are not failures either.
 */
export function filterStorms(archive, filters = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const a = archive;
  const S = a.storms;
  const G = a.genesis;
  const threshold = (INTENSITY_FILTERS.find((x) => x.key === f.intensity) || {}).threshold;
  const monthSet = f.months && f.months.length ? new Set(f.months) : null;
  const lfRegion = f.landfall && f.landfall !== "any" ? f.landfall : null;
  const wantLandfall = f.landfall !== null && f.landfall !== undefined;

  const rows = new Uint32Array(a.nStorms);
  let kept = 0;
  let undecidable = 0;
  const excluded = { distance: 0, season: 0, month: 0, basin: 0, subbasin: 0, intensity: 0,
                     landfall: 0, provisional: 0, unnamed: 0, noGenesis: 0 };

  const lfRegionCol = a.landfalls.col("region");
  const lfRegionCodes = a.landfalls.raw("region");
  const lfSuspect = a.landfalls.raw("suspect_relocation");
  const regionCode = lfRegion ? lfRegionCol.dictionary.indexOf(lfRegion) + 1 : 0;

  for (let i = 0; i < a.nStorms; i++) {
    if (S.bool("provisional", i) && !f.includeProvisional) { excluded.provisional++; continue; }
    const season = S.num("season", i);
    if (f.seasonFrom !== null && season < f.seasonFrom) { excluded.season++; continue; }
    if (f.seasonTo !== null && season > f.seasonTo) { excluded.season++; continue; }

    const gt = G.num("genesis_t", i);
    if (gt === null) {
      // 54 storms have no genesis point. They are excluded from a genesis-keyed view and
      // counted, rather than being drawn from a position the archive does not have.
      excluded.noGenesis++;
      continue;
    }
    /* Distance is tested here -- after genesis is known to exist, before anything else -- so
       the exclusion counts read in the order a reader builds the question: where first. */
    if (f.where) {
      const d = haversineKm(f.where.lat, f.where.lon, a.genesisLat[i], a.genesisLon[i]);
      if (!(d <= f.where.radiusKm)) { excluded.distance++; continue; }
    }
    if (monthSet) {
      const m = new Date(gt * 60000).getUTCMonth() + 1;
      if (!monthSet.has(m)) { excluded.month++; continue; }
    }
    if (f.basins && !f.basins.includes(S.str("basin", i))) { excluded.basin++; continue; }
    if (f.subbasinsEntered && !a.enteredAny(i, f.subbasinsEntered)) { excluded.subbasin++; continue; }
    if (f.namedOnly && S.bool("named", i) !== true) { excluded.unnamed++; continue; }

    if (threshold !== null && threshold !== undefined) {
      const peak = S.num("max_vmax_kt", i);
      if (peak === null) { undecidable++; continue; }   // RULE 4: unknown is not a failure
      if (threshold === THRESHOLDS_KT.cat5) {
        if (peak < THRESHOLDS_KT.cat5) { excluded.intensity++; continue; }
      } else if (peak < threshold) { excluded.intensity++; continue; }
    }

    if (wantLandfall) {
      const s = a.lfOffset[i];
      const n = a.lfCount[i];
      let hit = false;
      for (let k = s; k < s + n; k++) {
        // The archive excludes a suspected relocation artefact from every rate it publishes;
        // a filter that counted one would disagree with the archive about what happened.
        if (lfSuspect[k] === 2) continue;
        if (!regionCode || lfRegionCodes[k] === regionCode) { hit = true; break; }
      }
      if (!hit) { excluded.landfall++; continue; }
    }

    rows[kept++] = i;
  }

  return { rows: rows.subarray(0, kept), kept, undecidable, excluded };
}

/** Season range actually present in the archive, for the filter's own bounds. */
export function seasonRange(archive) {
  const s = archive.storms.raw("season");
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < s.length; i++) {
    if (s[i] < lo) lo = s[i];
    if (s[i] > hi) hi = s[i];
  }
  return [lo, hi];
}

/**
 * The bounding box of the archive's GENESIS points, for the opening view.
 *
 * Framed on genesis rather than on every track point deliberately: tracks reach 83N as
 * extratropical remnants over the Labrador Sea, and fitting those would open the Atlas zoomed
 * out over a great deal of ocean nothing forms in. Where storms FORM is the subject.
 */
export function genesisBounds(archive) {
  const lat = archive.genesis.raw("genesis_lat");
  const lon = archive.genesis.raw("genesis_lon");
  let s = Infinity; let n = -Infinity; let w = Infinity; let e = -Infinity;
  for (let i = 0; i < lat.length; i++) {
    if (Number.isNaN(lat[i])) continue;
    if (lat[i] < s) s = lat[i];
    if (lat[i] > n) n = lat[i];
    if (lon[i] < w) w = lon[i];
    if (lon[i] > e) e = lon[i];
  }
  return [[s, w], [n, e]];
}

/** Distinct basins present, in archive order of first appearance. */
export function basinsPresent(archive) {
  return (archive.storms.col("basin").dictionary || []).slice();
}
