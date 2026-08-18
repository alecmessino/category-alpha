"""Live conditioning: turn an active system's operational SHIPS into an analog query.

THE PATH THIS CLOSES. Everything else in the archive is historical. `get_analogs` accepts an
`env_vector`, but until now nothing could produce one for a system that exists *today* -- the
developmental SHIPS file ends in 2023 and NCEP/NCAR R1 ends 2026-03-17. NHC's operational SHIPS
(`sources/ships_rt`) covers named storms, invests and genesis candidates, so this module reads
the newest run for a system and hands the analysed (tau=0) environment straight to the query.

WHICH POSITION THE QUERY USES, AND WHY IT IS NOT ALWAYS THE CURRENT ONE.
`get_analogs` matches on GENESIS location. For an outlook area or an invest that has not
developed, its current position IS the right one -- that is where a disturbance like it forms.
For a system that has already become a tropical cyclone, the current position is where it has
ARRIVED, and querying that matches nothing useful. So this module does not guess: it uses the
archived genesis position when the system is already tracked, the current position when it is
not, and reports which it used on every result.

THE ENVIRONMENT VECTOR COMES FROM A DIFFERENT PRODUCT THAN THE POOL IT MATCHES.
The live vector is operational SHIPS; the archive's environment is developmental SHIPS. Their
decade agrees by measurement (ships_rt.SCALED_UNLABELLED) but identical calibration is NOT
established. Every result from here carries that caveat. This is an honest statement of the
mixing problem, not a fix for it -- a quantile-mapping layer between the two products would be,
and does not exist yet.
"""

from __future__ import annotations

from .provenance import ARCHIVE_DIR
from .retrieval.analogs import get_analogs, format_position
from .sources import ships_rt
from .store import read_table

# The columns a live SHIPS run can supply that get_analogs knows how to match on.
LIVE_ENV_FIELDS = ("shear_kt", "rh_mid_pct", "sst_c", "pot_intensity_kt",
                   "ohc_kj_cm2", "vort850_1e5")


def live_env_vector(atcf_id: str, *, source_key: str | None = None) -> dict | None:
    """The analysed (tau=0) environment for one active system, ready for `env_vector=`.

    Returns None when NHC has published no SHIPS run for that system -- which is the correct
    answer for an outlook area that has not been given an ATCF number yet, and is reported
    rather than filled in.
    """
    pairs = ships_rt.fetch_latest(atcf_ids={atcf_id})
    if not pairs:
        return None
    run, text = pairs[0]
    rows = ships_rt.environment_rows(text, source_key=source_key or f"ships_rt:{run['filename']}",
                                     url=run["url"])
    if not rows:
        return None
    r = rows[0]
    vec = {k: r[k] for k in LIVE_ENV_FIELDS if r.get(k) is not None}
    return {
        "atcf_id": r["atcf_id"],
        "run_utc": r["iso_time"],
        "lat": r["lat"],
        "lon": r["lon"],
        "env_vector": vec,
        "row": r,
        "url": run["url"],
        "is_invest": run["is_invest"],
    }


def genesis_position(atcf_id: str, *, archive_dir=None):
    """(lat, lon, 'genesis') from the archive, or None when the system is not tracked yet."""
    base = archive_dir or ARCHIVE_DIR
    for g in read_table("genesis_events", base).to_pylist():
        if g.get("atcf_id") == atcf_id and g.get("genesis_lat") is not None:
            return (g["genesis_lat"], g["genesis_lon"], "genesis")
    return None


def analogs_for_live_system(atcf_id: str, *, radius_km: float = 500.0,
                            season_window: int = 1, min_sample: int = 10,
                            archive_dir=None, use_environment: bool = True,
                            min_pool_season: int | None = 1971,
                            regions: list | None = None, **kw):
    """Run the archive's analog query for one live ATCF system. Returns (result, context)."""
    base = archive_dir or ARCHIVE_DIR
    live = live_env_vector(atcf_id)
    if live is None:
        return None, {"atcf_id": atcf_id, "error": "no operational SHIPS run published",
                      "note": ("SHIPS runs per ATCF system; an outlook area with no number "
                               "yet has none. Query by position instead.")}

    pos = genesis_position(atcf_id, archive_dir=base)
    if pos:
        lat, lon, which = pos
    else:
        lat, lon, which = live["lat"], live["lon"], "current"

    month = live["run_utc"].month
    months = sorted({((month - 1 + d) % 12) + 1
                     for d in range(-season_window, season_window + 1)})
    res = get_analogs(lat=lat, lon=lon, radius_km=radius_km, season_months=months,
                      env_vector=(live["env_vector"] if use_environment else None),
                      min_sample=min_sample, archive_dir=base,
                      min_pool_season=min_pool_season, regions=regions, **kw)
    ctx = {
        "atcf_id": atcf_id,
        "run_utc": live["run_utc"],
        "run_url": live["url"],
        "is_invest": live["is_invest"],
        "position_used": which,
        "position": (lat, lon),
        "current_position": (live["lat"], live["lon"]),
        "env_vector": live["env_vector"],
        "caveat": ("the env_vector is OPERATIONAL SHIPS; the pool it matches is DEVELOPMENTAL "
                   "SHIPS. Their decade agrees by measurement, identical calibration does not."),
    }
    return res, ctx


def describe_live(res, ctx) -> str:
    if res is None:
        return (f"LIVE {ctx['atcf_id']}: {ctx['error']}\n  {ctx['note']}")
    head = [
        f"LIVE ANALOGS  {ctx['atcf_id']}  SHIPS run {ctx['run_utc']:%Y-%m-%d %H:%M}Z"
        f"{'  [INVEST]' if ctx['is_invest'] else ''}",
        f"  position used: {format_position(*ctx['position'])}  ({ctx['position_used']})",
    ]
    if ctx["position_used"] == "genesis":
        head.append(f"  current position {format_position(*ctx['current_position'])} is NOT "
                    "queried -- matching is on genesis location")
    head.append("  env_vector: " + ", ".join(f"{k}={v:g}" for k, v in ctx["env_vector"].items()))
    head.append(f"  CAVEAT: {ctx['caveat']}")
    return "\n".join(head) + "\n" + res.describe()
