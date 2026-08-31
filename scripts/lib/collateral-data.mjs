/* THE EVIDENCE GATE for the Storm Atlas proof-of-utility collateral.
 *
 * Every number the collateral publishes is produced HERE, by executing cohort specs through the
 * same engine the Atlas runs in the browser (docs/storm-atlas/src/engine). Nothing downstream
 * types a rate: the renderers consume this object and print what it holds. That is the only
 * arrangement in which "every published number traces to the manifest" is a property of the
 * build rather than a promise in a review checklist.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   - No geographic outcome category the archive does not already score. There is no TX row, no
 *     LA row, no Gulf-state row, and none can be added here without adding it to the archive
 *     first. `landfall_conus_any` and `landfall_conus_hurricane` are the CONUS contract.
 *   - No row-level STATUS invented for a row the instrument stamped nothing on. `status` is null
 *     unless the engine returned a refusal or the archive-wide event gate fired.
 *   - No substitution of a wider cohort for one that refuses. A refusal is published as a
 *     refusal, beside the query that produced it.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { openArchive, openLive } from "../../docs/storm-atlas/src/engine/node-io.js";
import { cohortResult, toQuery } from "../../docs/storm-atlas/src/engine/cohort.js";
import { openQuestion } from "../../docs/storm-atlas/src/engine/cohort-language.js";
import { decodeCoastlines } from "../../docs/storm-atlas/src/engine/coastlines.js";
import { ROOT } from "./atlas-verify.mjs";

export const SITE = "https://alecmessino.github.io/category-alpha/storm-atlas/";
const DATA = join(ROOT, "docs/storm-atlas/data");

/* The five modelled coastlines plus `unattributed`, which is a region the landfalls table
   carries and the filter list does not. Asked explicitly so a cohort that never reaches it
   reports an explicit zero rather than a silence a reader would have to interpret. */
export const CONTRACT_REGIONS = [
  "conus", "mexico", "caribbean", "central_america", "hawaii", "unattributed",
];

const LADDER = [
  ["td", "reached TD"], ["ts", "reached TS"], ["cat1", "reached Cat 1"],
  ["cat2", "reached Cat 2"], ["cat3", "reached Cat 3"], ["cat4", "reached Cat 4"],
  ["cat5", "reached Cat 5"],
];

export const REGION_LABEL = {
  conus: "CONUS", mexico: "MEXICO", caribbean: "CARIBBEAN",
  central_america: "CENTRAL AMERICA", hawaii: "HAWAII", unattributed: "UNATTRIBUTED",
};

/** One outcome row, exactly as the engine rendered it. STATUS is null when the instrument
 *  stamped none -- a scored row carries no row-level status in this archive, and inventing one
 *  ("SUFFICIENT", "VALID") would be a second methodology announcing itself in a table cell. */
function rowOf(label, key, r, unscoreable) {
  const gate = unscoreable && unscoreable[key] ? unscoreable[key] : null;
  return {
    label, key,
    count: r.count,
    n_storms: r.n_storms,
    n_unknown: r.n_unknown,
    rate: r.rate,
    ci95: r.ci95,
    /* Two things can stamp a row, and both are the archive's own strings:
       (1) the sample gate refused the rate outright;
       (2) the archive-wide event gate says no skill number is possible for this contract. */
    status: r.refused_reason ? "RATE REFUSED" : (gate ? gate.status : null),
    refused_reason: r.refused_reason,
    gate: gate ? {
      status: gate.status, reason: gate.reason, scope: gate.scope,
      scope_events: gate.scope_events, archive_events: gate.archive_events,
      required: gate.required,
    } : null,
  };
}

/* THE DEFAULT REPRESENTATIVE RULE.
   Storm Atlas implements no "closest analog" or "most similar" metric for a filter-defined
   cohort -- cohort.js weights every member 1.0 and says so in as many words -- so these are
   labelled REPRESENTATIVE COHORT MEMBERS and selected by a rule printed beside them. */
export const REP_RULE =
  "up to 8 members — majors (≥96 kt) first, then hurricanes (≥64 kt), then by peak wind "
  + "descending, ties by season descending. Not a similarity ranking: Storm Atlas implements "
  + "no closest-analog metric for a filter-defined cohort, and every member is weighted 1.0.";

function representatives(result, limit = 8) {
  const tier = (c) => (c.peak_vmax_kt >= 96 ? 0 : c.peak_vmax_kt >= 64 ? 1 : 2);
  const known = result.cases.filter((c) => c.peak_vmax_kt !== null && c.peak_vmax_kt !== undefined);
  const sorted = [...known].sort((a, b) =>
    tier(a) - tier(b) || (b.peak_vmax_kt - a.peak_vmax_kt) || (b.season - a.season));
  return {
    rule: REP_RULE,
    cohort_n: result.n_cases,
    with_known_peak: known.length,
    printed: Math.min(limit, sorted.length),
    shortfall: Math.max(0, limit - sorted.length),
    members: sorted.slice(0, limit).map((c) => ({
      row: c.row,
      name: c.name || "UNNAMED", season: c.season, storm_id: c.storm_id,
      peak_vmax_kt: c.peak_vmax_kt, max_category: c.max_category,
      genesis_utc: c.genesis_utc, genesis_lat: c.genesis_lat, genesis_lon: c.genesis_lon,
      distance_km: c.distance_km === null ? null : Math.round(c.distance_km),
      hours_to_ts: c.hours_to_ts, hours_to_cat1: c.hours_to_cat1, hours_to_cat3: c.hours_to_cat3,
      landfalls: c.landfalls
        .filter((l) => !l.suspect_relocation)
        .map((l) => ({
          region: l.region, sub_region: l.sub_region, vmax_kt: l.vmax_kt,
          hurricane: l.hurricane, category: l.category, detection: l.detection,
          landfall_utc: l.landfall_utc,
        })),
    })),
  };
}

/** Track polyline for one storm row, from the pack. Drawn geometry, never a rate. */
function trackOf(archive, row) {
  const [a, b] = archive.trackRange(row);
  const pts = [];
  for (let k = a; k < b; k++) {
    const lat = archive.ptLat[k] / 100;
    const lon = archive.ptLon[k] / 100;
    const kt = archive.ptVmax[k] === -32768 ? null : archive.ptVmax[k];
    pts.push([lon, lat, kt]);
  }
  return pts;
}

export async function build() {
  const archive = await openArchive(DATA);
  const live = await openLive(DATA);
  const M = archive.manifest;
  const STAMP = (M.provenance || {}).archive_stamp;
  const METHOD = M.methodology_version;
  const NSTORMS = M.counts.storms;

  const coastRaw = gunzipSync(await readFile(join(DATA, "atlas-coastlines-v1.bin.gz")));
  const coast = decodeCoastlines(
    coastRaw.buffer.slice(coastRaw.byteOffset, coastRaw.byteOffset + coastRaw.byteLength));

  const latest = JSON.parse(await readFile(join(ROOT, "docs/data/latest.json"), "utf8"));

  const cite = (spec, r) =>
    `STORM ATLAS · ${openQuestion(spec).replace(/ — what happened next\?$/, "")} · `
    + `${r.kept.toLocaleString()} of ${NSTORMS.toLocaleString()} storms · `
    + `METHODOLOGY ${METHOD} · PACK ${STAMP}`;

  const url = (spec) => {
    const p = new URLSearchParams(toQuery(spec));
    p.set("m", METHOD);
    return `${SITE}?${p.toString()}`;
  };

  function run(id, meta, spec) {
    const r = cohortResult(archive, spec, { regions: CONTRACT_REGIONS });
    const intensity = LADDER.map(([k, label]) => rowOf(label, k, r.intensity[k], null));
    const landfall = [];
    for (const region of CONTRACT_REGIONS) {
      if (!r.landfall[region]) continue;
      landfall.push(rowOf(`${REGION_LABEL[region]} — any`, `${region}:any`,
        r.landfall[region].any, r.unscoreable));
      landfall.push(rowOf(`${REGION_LABEL[region]} — ≥64 kt`, `${region}:hurricane`,
        r.landfall[region].hurricane, r.unscoreable));
    }
    const reps = representatives(r);
    return {
      id, ...meta,
      spec,
      question: openQuestion(spec),
      cohort: {
        n_cases: r.n_cases, kept: r.kept, undecidable: r.undecidable, excluded: r.excluded,
        effective_sample_size: r.effective_sample_size, min_sample: r.min_sample,
        sufficient: r.sufficient,
        /* The archive's own cohort-line word, and it lives on the cohort line only. */
        cohort_status: r.sufficient ? "SUFFICIENT" : "BELOW MIN SAMPLE — rates refused",
      },
      intensity_rows: intensity,
      landfall_rows: landfall,
      unscoreable: r.unscoreable,
      landfall_note: r.landfall_note,
      time_to_event: r.time_to_event,
      gaps: r.gaps,
      representatives: reps,
      /* Drawn geometry for the analog plate. Tracks are not rates and are carried in their own
         field so no template can reach for one while meaning the other. */
      tracks: reps.members.map((m) => ({
        storm_id: m.storm_id, name: m.name, season: m.season,
        peak_vmax_kt: m.peak_vmax_kt, points: trackOf(archive, m.row),
      })),
      all_member_tracks: r.cases.map((c) => ({
        storm_id: c.storm_id, name: c.name || "UNNAMED", season: c.season,
        peak_vmax_kt: c.peak_vmax_kt, points: trackOf(archive, c.row),
      })),
      cite: cite(spec, r),
      replay_url: url(spec),
    };
  }

  const systems = [
    run("97L", {
      name: "Invest 97L", basin: "NA", basin_label: "NORTH ATLANTIC",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 28.0, lon: -88.7 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 28.0, lon: -88.7, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["NA"] }),

    run("97L-r150", {
      name: "Invest 97L — 150 km variant", basin: "NA", basin_label: "NORTH ATLANTIC",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 28.0, lon: -88.7 },
      radius_km: 150, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 28.0, lon: -88.7, radiusKm: 150 }, seasonFrom: 1971, months: [8, 9], basins: ["NA"] }),

    run("97L-allmonths", {
      name: "Invest 97L — season-wide variant", basin: "NA", basin_label: "NORTH ATLANTIC",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 28.0, lon: -88.7 },
      radius_km: 250, season_floor: 1971, month_window: "all months",
    }, { where: { lat: 28.0, lon: -88.7, radiusKm: 250 }, seasonFrom: 1971, basins: ["NA"] }),

    run("KARINA", {
      name: "Hurricane Karina", basin: "EP", basin_label: "EAST PACIFIC",
      point_type: "OBSERVED GENESIS",
      coordinates_queried: { lat: 13.2, lon: -115.0 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 13.2, lon: -115.0, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["EP"] }),

    run("95E", {
      name: "Invest 95E", basin: "EP", basin_label: "EAST PACIFIC",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 12.0, lon: -107.5 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 12.0, lon: -107.5, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["EP"] }),

    run("LOWELL", {
      name: "Tropical Storm Lowell", basin: "EP", basin_label: "EAST PACIFIC",
      point_type: "OBSERVED GENESIS",
      coordinates_queried: { lat: 11.3, lon: -133.8 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 11.3, lon: -133.8, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["EP"] }),
  ];

  const byId = Object.fromEntries(systems.map((s) => [s.id, s]));

  /* The operational layer, verbatim. This is what the ARCHIVE holds about a live storm; it is
     not the same thing as the desk's own live-status line, and where the two differ the
     collateral prints both with their instants rather than reconciling them. */
  const liveStorms = live && live.artifact ? (live.artifact.storms || {}) : {};
  const operational = {
    available: !!(live && live.ok),
    schema: live && live.artifact ? live.artifact.schema : null,
    generated_at: live && live.artifact ? live.artifact.generated_at : null,
    freshness: live && live.artifact ? live.artifact.freshness : null,
    health: live && live.artifact ? live.artifact.health : null,
    source: live && live.artifact ? live.artifact.source : null,
    storms: Object.values(liveStorms).map((s) => ({
      atcf_id: s.atcf_id, name: s.name, basin: s.basin, active: s.active,
      stage: s.stage, stage_label: s.stage_label,
      latest_valid_time: s.latest_valid_time, fetched_at: s.fetched_at, age_hours: s.age_hours,
      fix_count: s.fix_count, peak_wind_kt: s.peak_wind_kt, peak_wind_at: s.peak_wind_at,
      min_mslp_mb: s.min_mslp_mb, latest: s.latest,
      fixes: (s.fixes || []).map((f) => [f.lon, f.lat, f.kt]),
    })),
  };

  /* The NHC graphical outlook areas, as the terminal's own ten-minute ingest holds them. These
     are LIVE and they are drawn as live -- an outlook polygon is not a cohort and never becomes
     one. Carried so the plate can show, in one frame, that the reference cell is NOT the current
     centre of the disturbance. */
  const outlook = (latest.outlook || []).map((o) => ({
    n: o.n, basin: o.basin, id: o.id, title: o.title,
    pct48: o.pct48, pct7d: o.pct7d, issued: o.issued, url: o.url,
    summary: o.summary,
    rings: (o.rings || []).map((r) => r.map(([la, lo]) => [lo, la])),
  }));

  return {
    schema: "storm-atlas-collateral-manifest/1",
    pack: {
      methodology_version: METHOD,
      pack_format: M.pack_format,
      archive_stamp: STAMP,
      archive_built_utc: M.provenance.archive_built_utc,
      counts: M.counts,
      env_coverage: M.env_coverage,
      thresholds_kt: M.thresholds_kt,
      sources: M.provenance.archive_sources,
      site: SITE,
      quality: M.quality,
    },
    contract_regions: CONTRACT_REGIONS,
    systems, byId,
    operational,
    outlook,
    feeds_generated_at: latest.generatedAt,
    coast,
    archive,
  };
}
