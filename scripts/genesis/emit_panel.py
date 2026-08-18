"""Emit the terminal's Analog Prior payload: docs/data/analogs.json.

WHY A FILE AND NOT AN API. The terminal is a static page on GitHub Pages that fetches its own
same-origin JSON; that is the whole reason it has no CORS problems and no backend to keep alive.
The analog engine is Python and the archive is Parquet, so the join between them is a file the
daily job writes and the page reads -- exactly how every other panel on that board is fed.

WHAT THIS FILE REFUSES TO EMIT, SO THE PANEL CANNOT RENDER IT
------------------------------------------------------------
A number the sample cannot support never reaches the payload in a form that can be shown alone:

  * every rate is emitted with its numerator, denominator, Wilson interval and, when it was
    refused, the reason -- never as a scalar. A panel that wanted to print a bare percentage
    would have to go out of its way to discard the rest.
  * a contract the record cannot support carries `unscoreable`, so the Hawaii hurricane-landfall
    figure arrives labelled BASE RATE ONLY and no skill number for it exists anywhere in the
    file to be found.
  * effective sample size travels beside every entry, because a 31-storm match that concentrates
    on two analogs is not a 31-storm answer.
  * the conditioning note travels with the payload rather than being written into the page, so
    it cannot drift away from the numbers it qualifies.

Entries come from two places, and the difference matters: an OUTLOOK AREA has a position but
usually no ATCF number and therefore no environment vector, while a LIVE SYSTEM has an
operational SHIPS run and, once it is tracked, an archived genesis position that must be
queried instead of where it is now.
"""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from datetime import datetime, timezone
from pathlib import Path

from .live import analogs_for_live_system, live_env_vector
from .provenance import ARCHIVE_DIR, PROCESSING_VERSION, _now
from .retrieval.analogs import get_analogs, format_position
from .sources import ships_rt
from .store import read_table, summary

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = REPO_ROOT / "docs" / "data" / "analogs.json"

TOP_CASES = 8

CONDITIONING_NOTE = (
    "Genesis-conditioned: these rates assume a tropical cyclone forms. To combine with a "
    "formation probability, multiply -- P(reaches X) = P(forms) x P(reaches X | forms). "
    "Landfall does NOT decompose that way and is counted jointly, never as a product."
)


def _jsonable(v):
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if is_dataclass(v) and not isinstance(v, type):
        return {k: _jsonable(x) for k, x in asdict(v).items()}
    if isinstance(v, dict):
        return {k: _jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, float) and v != v:
        return None
    return v


def _entry_from_result(res, *, kind, ident, label, position_used, position,
                       current_position=None, env=None, formation=None, extra=None):
    """One panel entry. Every rate keeps count, denominator, interval and refusal reason."""
    return _jsonable({
        "kind": kind,
        "id": ident,
        "label": label,
        "position": {"lat": position[0], "lon": position[1],
                     "which": position_used,
                     "text": format_position(position[0], position[1])},
        "current_position": ({"lat": current_position[0], "lon": current_position[1],
                              "text": format_position(*current_position)}
                             if current_position else None),
        "environment": env,
        "formation": formation,
        "query": res.query,
        "n_cases": res.n_cases,
        "effective_sample_size": res.effective_sample_size,
        "sufficient": res.sufficient,
        "min_sample": res.min_sample,
        "env_unmatched_excluded": res.env_unmatched_excluded,
        "intensity": res.intensity,
        "landfall": res.landfall,
        "unscoreable": res.unscoreable,
        "time_to_event": res.time_to_event,
        "gaps": res.gaps,
        "cases": [
            {"season": c.season, "name": c.name, "atcf_id": c.atcf_id,
             "distance_km": c.distance_km, "peak_vmax_kt": c.peak_vmax_kt,
             "max_category": c.max_category, "weight": c.weight,
             "env_fields_compared": c.env_fields_compared,
             "landfalls": [l["region"] for l in c.landfalls if not l["suspect_relocation"]]}
            for c in res.cases[:TOP_CASES]
        ],
        **(extra or {}),
    })


def build_payload(*, archive_dir=None, radius_km: float = 500.0, min_sample: int = 10,
                  min_pool_season: int | None = 1971, regions=("hawaii", "mexico", "conus"),
                  verbose: bool = True) -> dict:
    base = Path(archive_dir) if archive_dir else ARCHIVE_DIR
    say = print if verbose else (lambda *a, **k: None)
    regions = list(regions)
    entries = []
    notes = []

    # ---- 1. live ATCF systems with an operational SHIPS run --------------------------
    try:
        runs = ships_rt.list_runs()
        latest = {}
        for r in runs:
            latest[r["atcf_id"]] = r
        # Only systems whose newest run is recent enough to be about the present. A run from
        # March is a system that is long gone; showing it as "live" would be the exact lie the
        # terminal's freshness rules exist to prevent.
        now = datetime.now(timezone.utc)
        fresh = {a: r for a, r in latest.items()
                 if (now - r["iso_time"]).total_seconds() <= 36 * 3600}
        say(f"  live systems with a run in the last 36h: {len(fresh)} of {len(latest)}")
        for atcf in sorted(fresh):
            res, ctx = analogs_for_live_system(
                atcf, radius_km=radius_km, min_sample=min_sample, archive_dir=base,
                min_pool_season=min_pool_season, regions=regions)
            if res is None:
                notes.append(f"{atcf}: {ctx.get('error')}")
                continue
            entries.append(_entry_from_result(
                res, kind="live_system", ident=atcf,
                label=atcf, position_used=ctx["position_used"], position=ctx["position"],
                current_position=ctx["current_position"],
                env={"vector": ctx["env_vector"], "run_utc": ctx["run_utc"],
                     "source": "ships_rt", "url": ctx["run_url"],
                     "is_invest": ctx["is_invest"], "caveat": ctx["caveat"]},
                extra={"is_invest": ctx["is_invest"]}))
    except Exception as exc:                                    # noqa: BLE001
        notes.append(f"live systems unavailable: {type(exc).__name__}: {exc}")

    # ---- 2. open outlook areas from the disturbance log -------------------------------
    try:
        rows = [r for r in read_table("daily_disturbances", base).to_pylist()
                if r.get("lat") is not None]
        latest_thread: dict = {}
        for r in sorted(rows, key=lambda r: r["observed_utc"]):
            latest_thread[(r["basin"], r["disturbance_key"])] = r
        open_areas = [r for r in latest_thread.values() if r.get("outcome") == "open"]
        say(f"  open outlook areas: {len(open_areas)}")
        for r in open_areas:
            month = r["observed_utc"].month
            months = sorted({((month - 1 + d) % 12) + 1 for d in (-1, 0, 1)})
            res = get_analogs(lat=r["lat"], lon=r["lon"], radius_km=radius_km,
                              season_months=months, min_sample=min_sample, archive_dir=base,
                              min_pool_season=min_pool_season, regions=regions)
            entries.append(_entry_from_result(
                res, kind="outlook_area", ident=r["disturbance_key"],
                label=f"{r['basin']} area", position_used="current", position=(r["lat"], r["lon"]),
                formation={"prob_48h_pct": r.get("prob_48h_pct"),
                           "prob_7d_pct": r.get("prob_7d_pct"),
                           "prob_7d_label": r.get("prob_7d_label"),
                           "observed_utc": r.get("observed_utc")},
                extra={"basin": r.get("basin")}))
    except Exception as exc:                                    # noqa: BLE001
        notes.append(f"outlook areas unavailable: {type(exc).__name__}: {exc}")

    snaps = sorted((base / "snapshots").glob("*.json")) if (base / "snapshots").exists() else []
    payload = {
        "generated_utc": _now(),
        "processing_version": PROCESSING_VERSION,
        "archive": {
            "tables": summary(base),
            "snapshot": snaps[-1].stem if snaps else None,
        },
        "settings": {"radius_km": radius_km, "min_sample": min_sample,
                     "min_pool_season": min_pool_season, "regions": regions},
        "conditioning_note": CONDITIONING_NOTE,
        "entries": entries,
        "notes": notes,
    }
    return _jsonable(payload)


def write(payload: dict, out_path: Path | None = None) -> Path:
    out = Path(out_path) if out_path else OUT_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n")
    return out


if __name__ == "__main__":
    p = build_payload()
    path = write(p)
    print(f"\nwrote {path} ({path.stat().st_size:,} B)")
    print(f"  entries: {len(p['entries'])}  "
          f"(live {sum(1 for e in p['entries'] if e['kind']=='live_system')}, "
          f"outlook {sum(1 for e in p['entries'] if e['kind']=='outlook_area')})")
    for n in p["notes"]:
        print(f"  note: {n}")
