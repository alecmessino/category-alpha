"""The zero-peek back-test: replay the analog retrieval over the historical archive.

THE ONE PROPERTY THIS FILE EXISTS TO GUARANTEE is the same one that scripts/lib/backtest.mjs
guarantees for the live probability engine: NO PEEKING. The archive on disk contains every
storm that ever happened, including the ones that happened after the moment being simulated.
Querying it without a cut-off would let the analog pool contain the answer, and would produce a
skill score that means nothing at all -- the most dangerous number this project could publish,
because it would look like validation.

So every simulated forecast goes through exactly one door: `get_analogs(as_of=t0,
exclude_storm_ids={this storm})`. Two gates, not one:

  as_of              drops every storm whose GENESIS was at or after the moment simulated
  exclude_storm_ids  drops the storm being predicted, which as_of alone does NOT do at t0

WHAT THIS HARNESS CAN AND CANNOT ASK
------------------------------------
It replays from GENESIS -- the first tropical point of a storm that is in the best track. That
conditions on a tropical cyclone having formed at all. So it can honestly score:

    given a TD exists here, now: does it reach TS / Cat 1 / Cat 3 / Cat 4? does it hit Hawaii?

It CANNOT score "will this disturbance develop", because a disturbance that never became a
depression is not in the best-track archive at all -- there is no row for the failures, and a
base rate computed over survivors only would be badly, invisibly wrong. That question needs the
NHC Tropical Weather Outlook archive (the daily_disturbances table), and `run_disturbance_backtest`
below is its entry point. Which of the two ran is reported in the output, so a reader can never
mistake one for the other.

THE REFERENCE FORECAST IS ALSO ZERO-PEEK. Climatology here is the base rate among storms whose
genesis preceded the simulated moment, in the same basin -- not the base rate over the whole
record. A reference the forecaster could not have had is not a reference.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ..provenance import ARCHIVE_DIR, PROCESSING_VERSION, _now
from ..retrieval.analogs import get_analogs, _as_dt
from ..store import read_table
from .contracts import standard_contracts
from .scoring import Prediction, score_contract

# A +/- 1 month window around the genesis month. Wider than an exact month because a month
# boundary is an artefact of the calendar, not of the atmosphere, and an exact-month filter
# throws away the analog three days on the other side of 31 August.
SEASON_HALF_WIDTH = 1


def _month_window(month: int, half: int = SEASON_HALF_WIDTH) -> list[int]:
    return sorted({((month - 1 + d) % 12) + 1 for d in range(-half, half + 1)})


def _climatology(storms_before: list[dict], contract_key: str, thresholds: dict) -> float | None:
    """Unconditional base rate among storms that had already occurred. None when too thin."""
    thr = thresholds.get(contract_key)
    if thr is None:
        return None
    known = [s for s in storms_before
             if s.get("max_vmax_kt") is not None and s["max_vmax_kt"] == s["max_vmax_kt"]]
    if len(known) < 10:
        return None
    return sum(1 for s in known if s["max_vmax_kt"] >= thr) / len(known)


def run_genesis_backtest(
    *,
    archive_dir: Path | None = None,
    radius_km: float = 500.0,
    min_sample: int = 10,
    basins: list[str] | None = None,
    subbasins: list[str] | None = None,
    regions: list[str] | None = None,
    min_season: int | None = None,
    max_season: int | None = None,
    min_pool_season: int | None = None,
    burn_in_storms: int = 50,
    out_path: Path | None = None,
) -> dict:
    """Replay every storm from its genesis moment and score the analog answer.

    `burn_in_storms` skips the earliest storms in the record: the first storm in the archive has
    an empty analog pool by construction, and scoring it would be scoring an empty set. The
    number skipped is reported rather than being quietly absorbed.
    """
    base = archive_dir or ARCHIVE_DIR
    genesis = read_table("genesis_events", base).to_pylist()
    storms = {s["storm_id"]: s for s in read_table("storms", base).to_pylist()}
    landfalls: dict = {}
    for r in read_table("landfalls", base).to_pylist():
        landfalls.setdefault(r["storm_id"], []).append(r)

    contracts = standard_contracts(regions or [])
    thresholds = {"reaches_ts_34kt": 34, "reaches_cat1_64kt": 64,
                  "reaches_cat3_96kt": 96, "reaches_cat4_113kt": 113}

    # Order by genesis so "storms before now" is a prefix, and climatology can be computed
    # incrementally without ever looking forward.
    ordered = []
    for g in genesis:
        gt = _as_dt(g.get("genesis_utc"))
        if gt is None or g.get("genesis_lat") is None or g.get("genesis_lon") is None:
            continue
        st = storms.get(g["storm_id"], {})
        if basins and st.get("basin") not in basins:
            continue
        if subbasins and st.get("subbasin") not in subbasins:
            continue
        season = g.get("season") or st.get("season")
        if min_season and season and season < min_season:
            continue
        if max_season and season and season > max_season:
            continue
        ordered.append((gt, g, st))
    ordered.sort(key=lambda x: x[0])

    preds: dict = {c.key: [] for c in contracts}
    skipped_burn_in = 0
    prior: list[dict] = []

    for i, (gt, g, st) in enumerate(ordered):
        if i < burn_in_storms:
            skipped_burn_in += 1
            prior.append(st)
            continue
        res = get_analogs(
            lat=g["genesis_lat"], lon=g["genesis_lon"], radius_km=radius_km,
            season_months=_month_window(gt.month), min_sample=min_sample,
            archive_dir=base, as_of=gt, exclude_storm_ids={g["storm_id"]},
            basins=basins, subbasins=subbasins, min_pool_season=min_pool_season,
        )
        lf = landfalls.get(g["storm_id"], [])
        for c in contracts:
            p = c.predict(res)
            preds[c.key].append(Prediction(
                storm_id=g["storm_id"], contract=c.key, made_utc=gt.isoformat(),
                p=p, p_climatology=_climatology(prior, c.key, thresholds),
                outcome=c.resolve(st, g, lf),
                n_analogs=res.n_cases, ess=res.effective_sample_size,
                refused_reason=None if p is not None else "analog pool below min_sample",
            ))
        prior.append(st)

    scores = {k: score_contract(v) for k, v in preds.items() if v}
    report = {
        "mode": "genesis_conditioned",
        "conditions_on": "a tropical cyclone already existed at the moment simulated",
        "cannot_answer": (
            "P(a disturbance develops at all) -- failures are absent from the best-track "
            "archive; use run_disturbance_backtest with the TWO archive for that"),
        "built_utc": _now(),
        "processing_version": PROCESSING_VERSION,
        "settings": {
            "radius_km": radius_km, "min_sample": min_sample,
            "season_window_months": 2 * SEASON_HALF_WIDTH + 1,
            "basins": basins, "subbasins": subbasins, "regions": regions,
            "min_season": min_season, "max_season": max_season,
            "burn_in_storms": burn_in_storms,
            "min_pool_season": min_pool_season,
        },
        "n_storms_replayed": len(ordered) - skipped_burn_in,
        "n_storms_skipped_burn_in": skipped_burn_in,
        "contracts": {c.key: c.question for c in contracts},
        "scores": scores,
        "predictions": {k: [p.as_dict() for p in v] for k, v in preds.items()},
    }
    if out_path:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(json.dumps(report, indent=2, sort_keys=True, default=str) + "\n")
    return report


def run_disturbance_backtest(*, archive_dir: Path | None = None, **kw) -> dict:
    """Score 'does this TWO area become a named storm' from the append-only disturbance log.

    Refuses cleanly while the log is too thin to answer, rather than returning a number built on
    a handful of rows. The disturbance log is populated forward by the daily pipeline and
    backward by the TWO text archive back-fill.
    """
    base = archive_dir or ARCHIVE_DIR
    rows = read_table("daily_disturbances", base).to_pylist()
    resolved = [r for r in rows if r.get("outcome") in ("developed", "dissipated")]
    keys = {(r.get("basin"), r.get("disturbance_key")) for r in resolved}
    if len(keys) < 10:
        return {
            "mode": "disturbance_conditioned",
            "scored": False,
            "n_disturbance_rows": len(rows),
            "n_resolved_disturbances": len(keys),
            "refused_reason": (
                f"{len(keys)} resolved disturbances < 10 required -- NOT YET SCORED. "
                "Populate daily_disturbances from the NHC TWO archive back-fill."),
        }
    developed = sum(1 for k in keys
                    if any(r.get("outcome") == "developed" for r in resolved
                           if (r.get("basin"), r.get("disturbance_key")) == k))
    return {
        "mode": "disturbance_conditioned",
        "scored": True,
        "n_resolved_disturbances": len(keys),
        "observed_development_rate": developed / len(keys),
        "note": "base rate only; per-area analog scoring requires positions on TWO areas",
    }
