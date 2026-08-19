/* The loaded archive: typed arrays, per-storm slices, and the accessors the UI reads.
 *
 * TWO ACCESS STYLES, ON PURPOSE. The renderer walks 224,153 points sixty times a second and
 * must touch raw TypedArrays with no allocation; the panel reads one storm and wants plain
 * values with real nulls. Mixing those needs would make one of them bad, so both exist and the
 * boundary is explicit: `raw*` returns the array, `storm(i)` returns an object.
 *
 * NOTHING HERE COMPUTES A STATISTIC. This file is the archive in memory. The methodology lives
 * in analogs.js, which is a transliteration of the Python and is tested against it.
 */

import { decodePack, fetchPack } from "./pack.js";

/* Bit order must match SUBBASIN_BITS in build_atlas_pack.py; the pack header carries the
   authoritative list and load() checks it rather than trusting this copy. */
const SUBBASIN_BITS = ["NA", "EP", "CP", "CS", "GM", "AS", "WP", "NI"];

export class Archive {
  constructor(manifest, core, tracks) {
    this.manifest = manifest;
    this.core = core;
    this.tracks = tracks;
    this.env = null; // lazy; see loadEnvironment()

    this.storms = core.tables.storms;
    this.genesis = core.tables.genesis_events;
    this.landfalls = core.tables.landfalls;
    this.points = tracks.tables.track_points;
    this.nStorms = this.storms.rows;
    this.nPoints = this.points.rows;

    const declared = (core.header.indexes.subbasin_mask.note || "").split("order ")[1];
    this.subbasinBits = declared ? declared.split(",") : SUBBASIN_BITS;

    // Hot columns, hoisted once. Every one of these is read in a loop somewhere.
    this.tpOffset = tracks.indexes.storm_offset.array;
    this.tpCount = tracks.indexes.storm_count.array;
    this.lfOffset = core.indexes.landfall_offset.array;
    this.lfCount = core.indexes.landfall_count.array;
    this.subbasinMask = core.indexes.subbasin_mask.array;

    this.genesisLat = this.genesis.raw("genesis_lat"); // float64, unquantised
    this.genesisLon = this.genesis.raw("genesis_lon");
    this.genesisT = this.genesis.raw("genesis_t"); // int32 minutes, I32_NULL for none
    this.season = this.storms.raw("season");
    this.peakVmax = this.genesis.raw("peak_vmax_kt");
    this.maxVmax = this.storms.raw("max_vmax_kt");
    this.provisional = this.storms.raw("provisional"); // 0 unknown / 1 false / 2 true

    this.ptLat = this.points.raw("lat"); // int16 hundredths
    this.ptLon = this.points.raw("lon");
    this.ptT = this.points.raw("t"); // int32 minutes
    this.ptVmax = this.points.raw("vmax_kt"); // int16, -32768 = no wind recorded
    this.ptQuality = this.points.raw("quality"); // dictionary codes
    this.qualityDict = this.points.col("quality").dictionary;
    this.qInterpolated = this.qualityDict.indexOf("interpolated") + 1;
    this.qObserved = this.qualityDict.indexOf("observed") + 1;
    this.qProvisional = this.qualityDict.indexOf("provisional") + 1;

    this._byId = null;
    this._spatial = null;
  }

  get counts() { return this.manifest.counts; }

  /* ---- identity ------------------------------------------------------------------- */

  rowOf(stormId) {
    if (!this._byId) {
      this._byId = new Map();
      for (let i = 0; i < this.nStorms; i++) this._byId.set(this.storms.str("storm_id", i), i);
    }
    return this._byId.has(stormId) ? this._byId.get(stormId) : -1;
  }

  /* ---- slices --------------------------------------------------------------------- */

  /** [start, end) into the track-point arrays for storms[i]. */
  trackRange(i) {
    const s = this.tpOffset[i];
    return [s, s + this.tpCount[i]];
  }

  /** [start, end) into the landfall arrays for storms[i]. Most storms have none. */
  landfallRange(i) {
    const s = this.lfOffset[i];
    return [s, s + this.lfCount[i]];
  }

  /** Did storms[i] ever enter this subbasin? NOT "was it born there" -- see enteredAny(). */
  entered(i, subbasin) {
    const b = this.subbasinBits.indexOf(subbasin);
    return b >= 0 && (this.subbasinMask[i] & (1 << b)) !== 0;
  }

  /**
   * "Was ever here", the filter a landfall question actually asks.
   *
   * storms.subbasin is the subbasin AT GENESIS, and filtering Hawaii work on it is wrong in the
   * worst possible way -- quietly, and in the direction of a smaller answer. Measured on this
   * archive: 116 storms have a CP genesis, 664 have at least one CP track point. Among the 548
   * it would discard is Iniki (1992), which formed at 134W in the East Pacific and went on to
   * be the most destructive hurricane ever to strike Hawaii.
   */
  enteredAny(i, subbasins) {
    for (const s of subbasins) if (this.entered(i, s)) return true;
    return false;
  }

  /* ---- reading one storm ----------------------------------------------------------- */

  /** Everything the detail panel shows, with real nulls. Allocates -- not for hot loops. */
  storm(i) {
    const S = this.storms;
    const G = this.genesis;
    const ix = this.core.indexes;
    const genesisT = S.time("genesis_t", i);
    const endT = S.time("end_t", i);
    return {
      row: i,
      storm_id: S.str("storm_id", i),
      atcf_id: S.str("atcf_id", i),
      name: S.str("name", i),
      season: S.num("season", i),
      basin: S.str("basin", i),
      genesis_subbasin: S.str("subbasin", i),
      subbasins_entered: this.subbasinBits.filter((_, b) => this.subbasinMask[i] & (1 << b)),
      genesis_t: genesisT,
      genesis_lat: G.num("genesis_lat", i),
      genesis_lon: G.num("genesis_lon", i),
      end_t: endT,
      // A subtraction of two archive timestamps, not a new measurement. The archive has no
      // lifetime column and this is what one would mean.
      lifetime_hours: genesisT !== null && endT !== null ? (endT - genesisT) / 3600000 : null,
      max_vmax_kt: S.num("max_vmax_kt", i),
      min_mslp_mb: S.num("min_mslp_mb", i),
      max_category: S.str("max_category", i),
      reached_ts: S.bool("reached_ts", i),
      reached_cat1: S.bool("reached_cat1", i),
      reached_cat3: S.bool("reached_cat3", i),
      named: S.bool("named", i),
      track_points: S.num("track_points", i),
      track_type: S.str("track_type", i),
      provisional: S.bool("provisional", i),
      source_key: S.str("source_key", i),
      genesis_source_key: G.str("source_key", i),
      peak_vmax_kt: G.num("peak_vmax_kt", i),
      first_track_t: G.time("first_track_t", i),
      first_track_stage: G.str("first_track_stage", i),
      hours_to_ts: G.num("hours_to_ts", i),
      hours_to_cat1: G.num("hours_to_cat1", i),
      hours_to_cat3: G.num("hours_to_cat3", i),
      hours_to_peak: G.num("hours_to_peak", i),
      // cat2/cat4/cat5 elapsed hours are DERIVED here, by replaying the archive's own crossing
      // rule at pack time. The archive stores no such column; the pack marks them derived.
      hours_to_cat2: idxNum(ix.cat2_hours, i),
      hours_to_cat4: idxNum(ix.cat4_hours, i),
      hours_to_cat5: idxNum(ix.cat5_hours, i),
      crossings: {
        td: G.time("td_t", i),
        ts: G.time("ts_t", i),
        cat1: G.time("cat1_t", i),
        cat2: idxTime(ix.cat2_t, i),
        cat3: G.time("cat3_t", i),
        cat4: G.time("cat4_t", i),
        cat5: G.time("cat5_t", i),
      },
      crossing_positions: {
        ts: pair(G.num("ts_lat", i), G.num("ts_lon", i)),
        cat1: pair(G.num("cat1_lat", i), G.num("cat1_lon", i)),
      },
      landfalls: this.stormLandfalls(i),
      quality: this.trackQuality(i),
      env_at_genesis: {
        row: ix.env_at_genesis_row.array[i],
        dt_hours: idxNum(ix.env_at_genesis_dt_h, i),
        window_hours: this.manifest.env_genesis_window_hours,
      },
    };
  }

  stormLandfalls(i) {
    const L = this.landfalls;
    const [a, b] = this.landfallRange(i);
    const out = [];
    for (let k = a; k < b; k++) {
      out.push({
        row: k,
        t: L.time("t", k),
        lat: L.num("lat", k),
        lon: L.num("lon", k),
        region: L.str("region", k),
        sub_region: L.str("sub_region", k),
        vmax_kt: L.num("vmax_kt", k),
        mslp_mb: L.num("mslp_mb", k),
        // Null here is a WITHHELD class, not a missing one: a segment crossing whose bracketing
        // fixes disagree about the Saffir-Simpson class publishes none.
        category: L.str("category", k),
        stage: L.str("stage", k),
        hurricane_at_landfall: L.bool("hurricane_at_landfall", k),
        ts_at_landfall: L.bool("ts_at_landfall", k),
        detection: L.str("detection", k),
        derived: L.str("detection", k) === "segment_crossing",
        implied_speed_kt: L.num("implied_speed_kt", k),
        suspect_relocation: L.bool("suspect_relocation", k),
        closest_approach_km: L.num("closest_approach_km", k),
        source_key: L.str("source_key", k),
      });
    }
    return out;
  }

  /** How much of this track was actually observed. Counted, never estimated. */
  trackQuality(i) {
    const [a, b] = this.trackRange(i);
    let observed = 0;
    let interpolated = 0;
    let provisional = 0;
    for (let k = a; k < b; k++) {
      const q = this.ptQuality[k];
      if (q === this.qObserved) observed++;
      else if (q === this.qInterpolated) interpolated++;
      else if (q === this.qProvisional) provisional++;
    }
    return {
      observed,
      interpolated,
      provisional,
      total: b - a,
      // The archive flags a storm whose crossings rest on interpolated points because the track
      // carries no observed point at all. The flag is its own, and it survives into the Atlas.
      crossings_interpolated_only:
        (this.genesis.str("source_key", i) || "").endsWith("+interpolated_only"),
    };
  }

  /* ---- environment (lazy) ---------------------------------------------------------- */

  /** The environment pack is not fetched until something asks for it. No Phase 1 surface does
   *  beyond reporting whether a row exists, which the core pack already answers. */
  async loadEnvironment(url) {
    if (this.env) return this.env;
    this.env = await fetchPack(url);
    return this.env;
  }

  attachEnvironment(pack) {
    this.env = pack;
    return this.env;
  }

  /* ---- spatial index --------------------------------------------------------------- */

  /**
   * A uniform lat/lon bucket grid over every track point, for hit-testing.
   *
   * Built here rather than shipped: it is a permutation of 224,153 uint32s, roughly 900 KB
   * that would have to cross the network, against about a hundred milliseconds of counting
   * sort on arrival. The network is the scarcer resource.
   */
  spatialIndex(cellDeg = 2) {
    if (this._spatial && this._spatial.cellDeg === cellDeg) return this._spatial;
    const nx = Math.ceil(360 / cellDeg);
    const ny = Math.ceil(180 / cellDeg);
    const nCells = nx * ny;
    const counts = new Uint32Array(nCells + 1);
    const cellOf = new Uint32Array(this.nPoints);
    for (let k = 0; k < this.nPoints; k++) {
      const la = this.ptLat[k] / 100;
      const lo = this.ptLon[k] / 100;
      let cx = Math.floor((lo + 180) / cellDeg);
      let cy = Math.floor((la + 90) / cellDeg);
      if (cx >= nx) cx = nx - 1;
      if (cx < 0) cx = 0;
      if (cy >= ny) cy = ny - 1;
      if (cy < 0) cy = 0;
      const c = cy * nx + cx;
      cellOf[k] = c;
      counts[c + 1]++;
    }
    for (let c = 0; c < nCells; c++) counts[c + 1] += counts[c];
    const order = new Uint32Array(this.nPoints);
    const cursor = counts.slice(0, nCells);
    for (let k = 0; k < this.nPoints; k++) order[cursor[cellOf[k]]++] = k;
    this._spatial = { cellDeg, nx, ny, starts: counts, order };
    return this._spatial;
  }

  /** Which storm owns track point k. Binary search over the offsets -- no per-point column. */
  stormOfPoint(k) {
    let lo = 0;
    let hi = this.nStorms - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.tpOffset[mid] <= k) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
}

function pair(a, b) { return a === null || b === null ? null : { lat: a, lon: b }; }

function idxNum(col, i) {
  const v = col.array[i];
  if (col.nullValue === "nan") return Number.isNaN(v) ? null : v;
  return col.nullValue !== null && v === col.nullValue ? null : v;
}

function idxTime(col, i) {
  const v = idxNum(col, i);
  return v === null ? null : v * 60000;
}

/* ---- loading ------------------------------------------------------------------------ */

/** Browser. The manifest lands first and is tiny, so the archive's scale can be on screen
 *  before the track block has finished arriving. */
export async function loadArchive(baseUrl, { onProgress } = {}) {
  const manifest = await (await fetch(`${baseUrl}/atlas-manifest.json`)).json();
  if (onProgress) onProgress({ stage: "manifest", manifest });
  const [core, tracks] = await Promise.all([
    fetchPack(`${baseUrl}/atlas-core-v1.bin.gz`).then((p) => {
      if (onProgress) onProgress({ stage: "core" });
      return p;
    }),
    fetchPack(`${baseUrl}/atlas-tracks-v1.bin.gz`).then((p) => {
      if (onProgress) onProgress({ stage: "tracks" });
      return p;
    }),
  ]);
  return new Archive(manifest, core, tracks);
}

export { decodePack };
