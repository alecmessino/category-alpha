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
import { haversineKm } from "../../docs/storm-atlas/src/engine/geo.js";
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

  const liveStorms = live && live.artifact ? (live.artifact.storms || {}) : {};

  /* ---- THE GENESIS DETERMINATION, RUN RATHER THAN ASSERTED --------------------------------
   *
   * NHC initiating advisories is not automatic OBSERVED GENESIS. The archive's own definition
   * (scripts/genesis/build/genesis_events.py) is: the FIRST OBSERVED TRACK POINT whose status is
   * tropical, where tropical means one of TROPICAL_STATUS in scripts/genesis/schema.py. DB, LO,
   * EX, SD, SS, WV and the rest are explicitly not.
   *
   * That rule is applied here to the operational record, and then the SECOND question is asked,
   * which is the one that decides whether a cohort may be keyed to it: does the engine ACCEPT
   * the operational record as a genesis source? The operational layer answers that itself, in
   * its own source note -- it "never enters" the archive and "no value in it is used to build a
   * cohort, match an analog, compute a rate or an interval". So a first tropical fix in the
   * b-deck is a live observation, not an archive genesis point, and the check below proves the
   * consequence rather than trusting the prose: the storm is looked for in the pack.
   */
  const TROPICAL_STATUS = ["TD", "TS", "HU", "TY", "ST", "TC", "HR"];
  const NONTROPICAL_STATUS = ["DB", "LO", "EX", "SD", "SS", "WV", "MD", "IN", "DS", "ET", "NR", "PT"];

  function genesisDetermination(atcfId) {
    const rec = liveStorms[atcfId];
    if (!rec) {
      return { atcf_id: atcfId, operational_record: false,
        verdict: "NO OPERATIONAL RECORD", genesis_point: null };
    }
    const fixes = (rec.fixes || []).map((f) => ({ t: f.t, lat: f.lat, lon: f.lon, kt: f.kt,
      mslp: f.mslp, stage: f.stage, tropical: TROPICAL_STATUS.includes(f.stage) }));
    const firstTropical = fixes.find((f) => f.tropical) || null;

    /* Is this storm in the archive the cohorts are drawn from? Asked of the pack, not assumed. */
    let inArchive = false;
    for (let i = 0; i < archive.nStorms; i++) {
      if (archive.storms.str("atcf_id", i) === atcfId) { inArchive = true; break; }
    }
    return {
      atcf_id: atcfId,
      name: rec.name,
      operational_record: true,
      rule: "first OBSERVED track point with a tropical status; TROPICAL_STATUS = "
        + TROPICAL_STATUS.join(", ") + "; explicitly non-tropical = " + NONTROPICAL_STATUS.join(", "),
      rule_source: "scripts/genesis/build/genesis_events.py + scripts/genesis/schema.py",
      fixes,
      stages_present: [...new Set(fixes.map((f) => f.stage))],
      first_tropical_fix_in_operational_record: firstTropical,
      present_in_archive_pack: inArchive,
      archive_pack_stamp: STAMP,
      archive_built_utc: M.provenance.archive_built_utc,
      /* THE VERDICT. Both conditions must hold for an observed genesis point to exist for
         cohort purposes: a qualifying tropical fix, AND a source the engine accepts. */
      engine_accepts_operational_as_genesis: false,
      engine_accepts_reason: (live && live.artifact && live.artifact.source
        && live.artifact.source.note) || "operational layer source note unavailable",
      verdict: inArchive
        ? "OBSERVED GENESIS AVAILABLE FROM THE ARCHIVE"
        : "NO OBSERVED GENESIS POINT — the operational record is not a cohort source and this "
          + "storm is absent from the archive pack",
      cohort_keyed_to_it: false,
    };
  }

  const genesis_determinations = ["AL052026", "EP112026", "EP122026"]
    .map(genesisDetermination);

  /* WHAT KIND OF POINT THIS COHORT IS KEYED TO, and on whose authority.
     Three kinds exist in this package and only one of them would be the archive's own:
       PRE-GENESIS REFERENCE CELL   a declared cell for a system that has not formed
       DECLARED GENESIS POINT       an operator-declared formation point, not an archive row
       ARCHIVE GENESIS POINT        genesis_events.genesis_lat/lon for a storm IN the pack
     No live system in this package is the third kind: the pack holds none of them. The basis is
     attached to each system so a reader never has to infer it from a label. */
  function basisFor(atcfId, lat, lon) {
    const g = genesis_determinations.find((x) => x.atcf_id === atcfId);
    if (!g || !g.first_tropical_fix_in_operational_record) {
      return { atcf_id: atcfId || null, archive_genesis: false,
        operational_first_tropical_fix: null, separation_km: null,
        note: "No operational record; the point is a declared cell." };
    }
    const f = g.first_tropical_fix_in_operational_record;
    return {
      atcf_id: atcfId,
      archive_genesis: g.present_in_archive_pack,
      operational_first_tropical_fix: f,
      separation_km: Math.round(haversineKm(lat, lon, f.lat, f.lon)),
      note: "The archive pack holds no genesis row for this storm, so the point this cohort is "
        + "keyed to is declared, not observed by the archive. The operational record's first "
        + "tropical fix is shown for comparison and is not a cohort source.",
    };
  }

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
      genesis_basis: meta.atcf_id !== undefined
        ? basisFor(meta.atcf_id, meta.coordinates_queried.lat, meta.coordinates_queried.lon)
        : null,
      cite: cite(spec, r),
      replay_url: url(spec),
    };
  }

  const systems = [
    run("97L", {
      name: "97L / TD Five", basin: "NA", basin_label: "NORTH ATLANTIC", atcf_id: "AL052026",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 28.0, lon: -88.7 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 28.0, lon: -88.7, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["NA"] }),

    run("97L-r150", {
      name: "97L cell — 150 km variant", basin: "NA", basin_label: "NORTH ATLANTIC", atcf_id: "AL052026",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 28.0, lon: -88.7 },
      radius_km: 150, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 28.0, lon: -88.7, radiusKm: 150 }, seasonFrom: 1971, months: [8, 9], basins: ["NA"] }),

    run("97L-allmonths", {
      name: "97L cell — season-wide variant", basin: "NA", basin_label: "NORTH ATLANTIC", atcf_id: "AL052026",
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 28.0, lon: -88.7 },
      radius_km: 250, season_floor: 1971, month_window: "all months",
    }, { where: { lat: 28.0, lon: -88.7, radiusKm: 250 }, seasonFrom: 1971, basins: ["NA"] }),

    run("KARINA", {
      name: "Hurricane Karina", basin: "EP", basin_label: "EAST PACIFIC", atcf_id: "EP112026",
      point_type: "DECLARED GENESIS POINT",
      coordinates_queried: { lat: 13.2, lon: -115.0 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 13.2, lon: -115.0, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["EP"] }),

    run("95E", {
      name: "Invest 95E", basin: "EP", basin_label: "EAST PACIFIC", atcf_id: null,
      point_type: "PRE-GENESIS REFERENCE CELL",
      coordinates_queried: { lat: 12.0, lon: -107.5 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 12.0, lon: -107.5, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["EP"] }),

    run("LOWELL", {
      name: "Tropical Storm Lowell", basin: "EP", basin_label: "EAST PACIFIC", atcf_id: "EP122026",
      point_type: "DECLARED GENESIS POINT",
      coordinates_queried: { lat: 11.3, lon: -133.8 },
      radius_km: 250, season_floor: 1971, month_window: "August–September",
    }, { where: { lat: 11.3, lon: -133.8, radiusKm: 250 }, seasonFrom: 1971, months: [8, 9], basins: ["EP"] }),
  ];

  const byId = Object.fromEntries(systems.map((s) => [s.id, s]));

  /* The operational layer, verbatim. This is what the ARCHIVE holds about a live storm; it is
     not the same thing as the desk's own live-status line, and where the two differ the
     collateral prints both with their instants rather than reconciling them. */
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
    genesis_determinations,
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
    /* THE DESK LINE, TRACEABLE. NHC's own public-advisory values for each active storm, carried
       verbatim so no live figure printed on a page is hand-typed. This is operational status,
       not an Atlas result: nothing here builds a cohort, matches an analog or computes a rate. */
    nhc_advisories: (latest.storms || []).map((s) => ({
      atcf_id: s.id, name: s.name, cls: s.cls, cls_label: s.full_cls,
      lat: s.center ? s.center[0] : null, lon: s.center ? s.center[1] : null,
      wind_kt: s.wind, mslp_mb: s.pressure, movement: s.movement,
      advisory: s.advNum, advisory_time_utc: s.advTimeZ,
      watches_highest: s.watches ? s.watches.highest : null,
      watches_in_effect: s.watches ? (s.watches.inEffect || []) : [],
    })),
    feeds_generated_at: latest.generatedAt,
    coast,
    archive,
  };
}
