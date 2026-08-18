"""Derive genesis_events from track points: stage transitions and time-to-event.

This is the analytical core of the archive. Every question the retrieval layer answers --
"what fraction became hurricanes", "how long did it take" -- is answered from a row built here.

FOUR DEFINITIONS, STATED ONCE, BECAUSE EVERYTHING DOWNSTREAM DEPENDS ON THEM
----------------------------------------------------------------------------
GENESIS is the first point whose status is TROPICAL. Not the first point in the best track:
best tracks routinely open with a disturbance or a low, sometimes days earlier, and counting
that as genesis would inflate every time-to-event in the archive. Both are stored --
`first_track_utc` for the earliest point of any kind, `genesis_utc` for the first tropical one
-- because the gap between them is exactly the pre-genesis window a live disturbance is in.

A THRESHOLD CROSSING is the FIRST time the storm's recorded intensity reached it. First, not
maximum: a storm that hits 65 kt, weakens, and re-intensifies to 100 kt crossed 64 kt once, at
the earlier time, and "time to hurricane" means the first one.

TIME-TO-EVENT is measured from GENESIS, in hours, and is NULL when the event never happened.
Null, not a large number and not a censoring sentinel: a storm that never became a hurricane
has no time-to-hurricane, and a reader who averages a column of sentinels gets a number that
means nothing.

INTERPOLATED POINTS DO NOT ESTABLISH A CROSSING. IBTrACS publishes 3-hourly positions between
6-hourly observations, flagged (schema.quality == 'interpolated'). Those carry a wind value
carried forward from the observation, so allowing them to set a crossing time would date the
crossing up to three hours early on a value nobody observed. Crossings are established only on
observed points; interpolated ones are still stored in track_points, just not consulted here.
"""

from __future__ import annotations

from datetime import datetime

from ..provenance import PROCESSING_VERSION, _now
from ..schema import THRESHOLDS_KT, TROPICAL_STATUS, NONTROPICAL_STATUS, category_for


def _is_tropical(stage: str | None, nature: str | None) -> bool:
    """A point counts as tropical when the best track's own status says so.

    Status wins over nature: IBTrACS NATURE is a coarse classification ('TS' covers everything
    tropical including depressions) while USA_STATUS carries the actual designation (TD/TS/HU).
    Where status is absent we fall back to nature, and where neither is present the point is
    NOT counted -- an unknown stage is not evidence of a tropical cyclone.
    """
    s = (stage or "").strip().upper()
    if s:
        if s in TROPICAL_STATUS:
            return True
        if s in NONTROPICAL_STATUS:
            return False
    n = (nature or "").strip().upper()
    return n == "TS"        # IBTrACS NATURE 'TS' = tropical storm class (incl. depressions)


def _hours(a: datetime | None, b: datetime | None) -> float | None:
    if a is None or b is None:
        return None
    return (b - a).total_seconds() / 3600.0


def build_genesis_events(track_points: list[dict], storms: list[dict], *,
                         source_key: str, two_index: dict | None = None) -> list[dict]:
    """One genesis_events row per storm.

    `two_index` optionally maps storm_id -> {two_first_mention_utc, two_first_lat,
    two_first_lon, invest_id} from the NHC Tropical Weather Outlook back-fill. Where a storm has
    no TWO record the pre-genesis fields stay NULL and `pregenesis_source` is 'none' -- the
    archive says it has no pre-genesis coverage for that storm rather than implying it formed
    unwatched.
    """
    by_storm: dict = {}
    for p in track_points:
        by_storm.setdefault(p["storm_id"], []).append(p)

    storm_by_id = {s["storm_id"]: s for s in storms}
    now = _now()
    rows = []

    for sid, pts in by_storm.items():
        pts = sorted(pts, key=lambda p: p["iso_time"])
        st = storm_by_id.get(sid, {})

        first = pts[0]
        # Crossings are established on OBSERVED points only -- see the module docstring.
        observed = [p for p in pts if p.get("quality") != "interpolated"]
        pool = observed or pts          # a track with no observed point at all still gets a row
        used_interpolated_only = not observed

        tropical = [p for p in pool if _is_tropical(p.get("stage"), p.get("nature"))]
        gen = tropical[0] if tropical else None
        gen_t = gen["iso_time"] if gen else None

        # First crossing of each threshold, at or after genesis.
        after = [p for p in pool if gen_t is None or p["iso_time"] >= gen_t]
        crossings: dict = {}
        for key, thr in THRESHOLDS_KT.items():
            if key == "td":
                continue
            hit = next((p for p in after
                        if p.get("vmax_kt") is not None and p["vmax_kt"] == p["vmax_kt"]
                        and p["vmax_kt"] >= thr), None)
            crossings[key] = hit

        winds = [p["vmax_kt"] for p in pool
                 if p.get("vmax_kt") is not None and p["vmax_kt"] == p["vmax_kt"]]
        peak = max(winds) if winds else None
        peak_pt = next((p for p in after if p.get("vmax_kt") == peak), None) if peak else None

        two = (two_index or {}).get(sid) or {}
        two_first = two.get("two_first_mention_utc")

        rows.append({
            "storm_id": sid,
            "atcf_id": st.get("atcf_id"),
            "basin": st.get("basin"),
            "subbasin": st.get("subbasin"),
            "season": st.get("season"),
            "first_track_utc": first["iso_time"],
            "first_track_lat": first.get("lat"),
            "first_track_lon": first.get("lon"),
            "first_track_stage": first.get("stage"),
            "genesis_utc": gen_t,
            "genesis_lat": gen.get("lat") if gen else None,
            "genesis_lon": gen.get("lon") if gen else None,
            "td_utc": gen_t,
            "ts_utc": crossings["ts"]["iso_time"] if crossings.get("ts") else None,
            "ts_lat": crossings["ts"].get("lat") if crossings.get("ts") else None,
            "ts_lon": crossings["ts"].get("lon") if crossings.get("ts") else None,
            "cat1_utc": crossings["cat1"]["iso_time"] if crossings.get("cat1") else None,
            "cat1_lat": crossings["cat1"].get("lat") if crossings.get("cat1") else None,
            "cat1_lon": crossings["cat1"].get("lon") if crossings.get("cat1") else None,
            "cat3_utc": crossings["cat3"]["iso_time"] if crossings.get("cat3") else None,
            "cat4_utc": crossings["cat4"]["iso_time"] if crossings.get("cat4") else None,
            "cat5_utc": crossings["cat5"]["iso_time"] if crossings.get("cat5") else None,
            "hours_to_ts": _hours(gen_t, crossings["ts"]["iso_time"]) if crossings.get("ts") else None,
            "hours_to_cat1": _hours(gen_t, crossings["cat1"]["iso_time"]) if crossings.get("cat1") else None,
            "hours_to_cat3": _hours(gen_t, crossings["cat3"]["iso_time"]) if crossings.get("cat3") else None,
            "hours_to_peak": _hours(gen_t, peak_pt["iso_time"]) if peak_pt else None,
            "peak_vmax_kt": peak,
            "two_first_mention_utc": two_first,
            "two_first_lat": two.get("two_first_lat"),
            "two_first_lon": two.get("two_first_lon"),
            "two_lead_hours": _hours(two_first, gen_t) if (two_first and gen_t) else None,
            "invest_id": two.get("invest_id"),
            "pregenesis_source": "two_archive" if two_first else "none",
            "source_key": source_key + ("+interpolated_only" if used_interpolated_only else ""),
            "processing_version": PROCESSING_VERSION,
            "ingested_utc": now,
        })
    return rows


def summarise_storms(track_points: list[dict], storm_rows: list[dict]) -> list[dict]:
    """Fill the derived intensity columns on storms from their track points.

    Kept here rather than in the IBTrACS loader so that the SAME derivation applies no matter
    which best-track source produced the points -- HURDAT2-derived storms must not get their
    'reached hurricane' flag from different arithmetic than IBTrACS-derived ones.
    """
    by_storm: dict = {}
    for p in track_points:
        by_storm.setdefault(p["storm_id"], []).append(p)

    for s in storm_rows:
        pts = sorted(by_storm.get(s["storm_id"], []), key=lambda p: p["iso_time"])
        if not pts:
            continue
        winds = [p["vmax_kt"] for p in pts
                 if p.get("vmax_kt") is not None and p["vmax_kt"] == p["vmax_kt"]]
        pres = [p["mslp_mb"] for p in pts
                if p.get("mslp_mb") is not None and p["mslp_mb"] == p["mslp_mb"]]
        peak = max(winds) if winds else None
        s["max_vmax_kt"] = peak
        s["min_mslp_mb"] = min(pres) if pres else None
        s["max_category"] = category_for(peak)
        # None (unknown) is preserved rather than collapsing to False: "we do not know whether
        # it reached 64 kt" is a different fact from "it did not".
        s["reached_ts"] = None if peak is None else bool(peak >= THRESHOLDS_KT["ts"])
        s["reached_cat1"] = None if peak is None else bool(peak >= THRESHOLDS_KT["cat1"])
        s["reached_cat3"] = None if peak is None else bool(peak >= THRESHOLDS_KT["cat3"])
        s["track_points"] = len(pts)
        s["end_utc"] = pts[-1]["iso_time"]
    return storm_rows
