"""The six archive tables, declared once.

Schemas are explicit rather than inferred. An inferred schema silently changes type when
a season arrives in which some column happens to be all-null, and a Parquet file whose
`vmax_kt` is int64 in one snapshot and double in the next cannot be read as one dataset.

EVERY table carries provenance columns:
    source_key          the MANIFEST.json entry the row was parsed out of
    processing_version  the code version that produced it
    ingested_utc        when this build ran

`quality` marks how a row was obtained, and it is the column that keeps the archive
honest about interpolation:
    observed      the source published this value at this time
    interpolated  the SOURCE (not this code) published an interpolated value, flagged
                  as such by the source's own flag (IBTrACS IFLAG 'P')
    provisional   the source published it but marked the track provisional
This code never creates a row of its own; there is no fourth value.
"""

from __future__ import annotations

import pyarrow as pa

# ---------------------------------------------------------------------------
# shared column groups
# ---------------------------------------------------------------------------

_PROV = [
    pa.field("source_key", pa.string(), nullable=False),
    pa.field("processing_version", pa.string(), nullable=False),
    pa.field("ingested_utc", pa.string(), nullable=False),
]

# Saffir-Simpson thresholds in knots, and the stage ladder. These are the definitions
# every threshold question in the archive is answered against, in one place.
THRESHOLDS_KT = {
    "td": 0,      # a depression has a closed circulation, not a wind threshold
    "ts": 34,
    "cat1": 64,
    "cat2": 83,
    "cat3": 96,
    "cat4": 113,
    "cat5": 137,
}

# IBTrACS/HURDAT2 status codes that count as "a tropical cyclone existed here".
TROPICAL_STATUS = {"TD", "TS", "HU", "TY", "ST", "TC", "HR"}
# Codes that are explicitly NOT a tropical cyclone: disturbance, low, extratropical,
# subtropical, wave. Kept separate because genesis is defined as the first TROPICAL point.
NONTROPICAL_STATUS = {"DB", "LO", "EX", "SD", "SS", "WV", "MD", "IN", "DS", "ET", "NR", "PT"}

# ---------------------------------------------------------------------------
# storms -- one row per storm
# ---------------------------------------------------------------------------

STORMS = pa.schema([
    pa.field("storm_id", pa.string(), nullable=False),   # IBTrACS SID (archive primary key)
    pa.field("atcf_id", pa.string()),                    # e.g. EP012026, joins SHIPS/ATCF
    pa.field("basin", pa.string(), nullable=False),      # genesis basin: NA/EP/WP/...
    pa.field("subbasin", pa.string()),                   # CP marks Central Pacific
    pa.field("name", pa.string()),
    pa.field("season", pa.int32(), nullable=False),
    pa.field("genesis_utc", pa.timestamp("s", tz="UTC")),
    pa.field("genesis_lat", pa.float64()),
    pa.field("genesis_lon", pa.float64()),               # signed, -180..180
    pa.field("end_utc", pa.timestamp("s", tz="UTC")),
    pa.field("max_vmax_kt", pa.float64()),
    pa.field("min_mslp_mb", pa.float64()),
    pa.field("max_category", pa.string()),               # td/ts/cat1..cat5
    pa.field("reached_ts", pa.bool_()),
    pa.field("reached_cat1", pa.bool_()),
    pa.field("reached_cat3", pa.bool_()),
    pa.field("named", pa.bool_()),
    pa.field("track_points", pa.int32()),
    pa.field("track_type", pa.string()),                 # main / spur / provisional
    pa.field("provisional", pa.bool_()),                 # season not yet post-analysed
] + _PROV)

# ---------------------------------------------------------------------------
# track_points -- every synoptic fix
# ---------------------------------------------------------------------------

TRACK_POINTS = pa.schema([
    pa.field("storm_id", pa.string(), nullable=False),
    pa.field("iso_time", pa.timestamp("s", tz="UTC"), nullable=False),
    pa.field("lat", pa.float64(), nullable=False),
    pa.field("lon", pa.float64(), nullable=False),
    pa.field("vmax_kt", pa.float64()),
    pa.field("mslp_mb", pa.float64()),
    pa.field("stage", pa.string()),                      # TD/TS/HU/EX/LO/DB...
    pa.field("nature", pa.string()),                     # IBTrACS NATURE
    pa.field("basin", pa.string()),
    pa.field("subbasin", pa.string()),
    pa.field("dist2land_km", pa.float64()),
    pa.field("storm_speed_kt", pa.float64()),
    pa.field("storm_dir_deg", pa.float64()),
    pa.field("synoptic", pa.bool_()),                    # hour in {0,6,12,18}
    pa.field("quality", pa.string(), nullable=False),    # observed/interpolated/provisional
    pa.field("hours_since_genesis", pa.float64()),
] + _PROV)

# ---------------------------------------------------------------------------
# environment -- same time index as track_points
# ---------------------------------------------------------------------------
# `source_key` distinguishes SHIPS from reanalysis; `env_source` names it in one word so
# a query can filter without reading the manifest.

ENVIRONMENT = pa.schema([
    # NULLABLE on purpose. SHIPS is keyed by ATCF id and a small number of its records carry an
    # id that IBTrACS never adopted (measured: 151 of 18,514 for EP+CP, 0.8%). Dropping those
    # rows would make the join look perfect; keeping them with a NULL storm_id makes the gap
    # countable, which is the whole point. They simply never match an analog query.
    pa.field("storm_id", pa.string(), nullable=True),
    pa.field("iso_time", pa.timestamp("s", tz="UTC"), nullable=False),
    pa.field("atcf_id", pa.string()),
    pa.field("lat", pa.float64()),
    pa.field("lon", pa.float64()),
    pa.field("env_source", pa.string(), nullable=False),  # ships_dev | ncep_r1 | oisst
    # --- the five fields the analog query conditions on ---
    pa.field("shear_kt", pa.float64()),                   # 850-200 hPa deep-layer shear
    pa.field("rh_mid_pct", pa.float64()),                 # 700-500 hPa RH (SHIPS RHMD)
    pa.field("vort850_1e5", pa.float64()),                # 850 hPa vorticity, 1e-5 s^-1
    pa.field("pot_intensity_kt", pa.float64()),           # SHIPS VMPI / derived PI
    pa.field("sst_c", pa.float64()),
    pa.field("mslp_env_mb", pa.float64()),
    # --- additional SHIPS predictors worth keeping ---
    pa.field("ohc_kj_cm2", pa.float64()),                 # COHC ocean heat content
    pa.field("div200_1e7", pa.float64()),                 # D200
    pa.field("rh_lo_pct", pa.float64()),
    pa.field("rh_hi_pct", pa.float64()),
    pa.field("tpw_mm", pa.float64()),                     # MTPW
    pa.field("shear_dir_deg", pa.float64()),
    pa.field("u200_kt", pa.float64()),
    pa.field("t200_c", pa.float64()),
    # --- genesis index ---
    pa.field("gpi", pa.float64()),                        # Emanuel-Nolan GPI
    pa.field("gpi_method", pa.string()),                  # which formulation + inputs
    pa.field("lead_hours", pa.float64()),                 # SHIPS tau this row came from (0 = analysis)
] + _PROV)

# ---------------------------------------------------------------------------
# genesis_events -- the pre-genesis and stage-transition record
# ---------------------------------------------------------------------------

GENESIS_EVENTS = pa.schema([
    pa.field("storm_id", pa.string(), nullable=False),
    pa.field("atcf_id", pa.string()),
    pa.field("basin", pa.string()),
    pa.field("subbasin", pa.string()),
    pa.field("season", pa.int32()),
    # first point of any kind in the best track (may be a disturbance/low)
    pa.field("first_track_utc", pa.timestamp("s", tz="UTC")),
    pa.field("first_track_lat", pa.float64()),
    pa.field("first_track_lon", pa.float64()),
    pa.field("first_track_stage", pa.string()),
    # first TROPICAL point -- the archive's definition of genesis
    pa.field("genesis_utc", pa.timestamp("s", tz="UTC")),
    pa.field("genesis_lat", pa.float64()),
    pa.field("genesis_lon", pa.float64()),
    # threshold crossings, each the FIRST time the storm reached it
    pa.field("td_utc", pa.timestamp("s", tz="UTC")),
    pa.field("ts_utc", pa.timestamp("s", tz="UTC")),
    pa.field("ts_lat", pa.float64()),
    pa.field("ts_lon", pa.float64()),
    pa.field("cat1_utc", pa.timestamp("s", tz="UTC")),
    pa.field("cat1_lat", pa.float64()),
    pa.field("cat1_lon", pa.float64()),
    pa.field("cat3_utc", pa.timestamp("s", tz="UTC")),
    pa.field("cat4_utc", pa.timestamp("s", tz="UTC")),
    pa.field("cat5_utc", pa.timestamp("s", tz="UTC")),
    # time-to-event, hours from genesis. NULL means it never happened.
    pa.field("hours_to_ts", pa.float64()),
    pa.field("hours_to_cat1", pa.float64()),
    pa.field("hours_to_cat3", pa.float64()),
    pa.field("hours_to_peak", pa.float64()),
    pa.field("peak_vmax_kt", pa.float64()),
    # pre-genesis linkage (NHC Tropical Weather Outlook), NULL where no archive exists
    pa.field("two_first_mention_utc", pa.timestamp("s", tz="UTC")),
    pa.field("two_first_lat", pa.float64()),
    pa.field("two_first_lon", pa.float64()),
    pa.field("two_lead_hours", pa.float64()),             # TWO mention -> genesis
    pa.field("invest_id", pa.string()),
    pa.field("pregenesis_source", pa.string()),           # two_archive | none
] + _PROV)

# ---------------------------------------------------------------------------
# landfalls -- explicit coastline crossings
# ---------------------------------------------------------------------------

LANDFALLS = pa.schema([
    pa.field("storm_id", pa.string(), nullable=False),
    pa.field("atcf_id", pa.string()),
    pa.field("season", pa.int32()),
    pa.field("region", pa.string(), nullable=False),      # hawaii/conus/mexico/...
    pa.field("sub_region", pa.string()),                  # island or state where resolved
    pa.field("landfall_utc", pa.timestamp("s", tz="UTC"), nullable=False),
    pa.field("lat", pa.float64(), nullable=False),
    pa.field("lon", pa.float64(), nullable=False),
    pa.field("vmax_kt", pa.float64()),
    pa.field("mslp_mb", pa.float64()),
    pa.field("category", pa.string()),
    pa.field("stage", pa.string()),
    pa.field("hurricane_at_landfall", pa.bool_()),        # vmax >= 64 kt
    pa.field("ts_at_landfall", pa.bool_()),
    # How the crossing was established. `bracketing_fix` means the centre was over land
    # at a published fix; `segment_crossing` means the great-circle segment between two
    # published fixes intersected the polygon and the intensity was linearly interpolated
    # between the bracketing fixes -- a DERIVED row, flagged so it can be excluded.
    pa.field("detection", pa.string(), nullable=False),
    pa.field("implied_speed_kt", pa.float64()),           # the relocation trap guard
    pa.field("suspect_relocation", pa.bool_()),
    pa.field("closest_approach_km", pa.float64()),
] + _PROV)

# ---------------------------------------------------------------------------
# daily_disturbances -- the append-only live log
# ---------------------------------------------------------------------------

DAILY_DISTURBANCES = pa.schema([
    pa.field("observed_utc", pa.timestamp("s", tz="UTC"), nullable=False),
    pa.field("issuance_utc", pa.timestamp("s", tz="UTC")),  # the TWO's own transmission time
    pa.field("basin", pa.string(), nullable=False),         # atlantic/epac/cpac
    pa.field("disturbance_key", pa.string(), nullable=False),
    pa.field("invest_id", pa.string()),
    pa.field("lat", pa.float64()),
    pa.field("lon", pa.float64()),
    pa.field("prob_48h_pct", pa.float64()),
    pa.field("prob_7d_pct", pa.float64()),
    pa.field("prob_48h_label", pa.string()),                # low/medium/high as published
    pa.field("prob_7d_label", pa.string()),
    pa.field("text", pa.string()),
    pa.field("source_url", pa.string()),
    # resolution, filled in later by the follow-up pass; NULL while unresolved
    pa.field("resolved_storm_id", pa.string()),
    pa.field("resolved_atcf_id", pa.string()),
    pa.field("outcome", pa.string()),                       # developed/dissipated/open
    pa.field("outcome_utc", pa.timestamp("s", tz="UTC")),
    pa.field("hours_to_genesis", pa.float64()),
] + _PROV)

ALL_TABLES = {
    "storms": STORMS,
    "track_points": TRACK_POINTS,
    "environment": ENVIRONMENT,
    "genesis_events": GENESIS_EVENTS,
    "landfalls": LANDFALLS,
    "daily_disturbances": DAILY_DISTURBANCES,
}


def category_for(vmax_kt: float | None) -> str | None:
    """Saffir-Simpson bucket for a wind speed, or None when there is no wind value.

    Returns None rather than 'td' for a missing value: a storm whose intensity was never
    recorded is not a depression, it is unknown, and the difference matters when the
    archive is asked what fraction reached a threshold.
    """
    if vmax_kt is None:
        return None
    try:
        v = float(vmax_kt)
    except (TypeError, ValueError):
        return None
    if v != v:  # NaN
        return None
    if v >= THRESHOLDS_KT["cat5"]:
        return "cat5"
    if v >= THRESHOLDS_KT["cat4"]:
        return "cat4"
    if v >= THRESHOLDS_KT["cat3"]:
        return "cat3"
    if v >= THRESHOLDS_KT["cat2"]:
        return "cat2"
    if v >= THRESHOLDS_KT["cat1"]:
        return "cat1"
    if v >= THRESHOLDS_KT["ts"]:
        return "ts"
    return "td"
