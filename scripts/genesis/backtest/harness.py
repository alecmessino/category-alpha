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
from ..retrieval.analogs import get_analogs, haversine_km, _as_dt
from ..store import read_table
from .contracts import standard_contracts
from .scoring import Prediction, score_contract, skill

# A +/- 1 month window around the genesis month. Wider than an exact month because a month
# boundary is an artefact of the calendar, not of the atmosphere, and an exact-month filter
# throws away the analog three days on the other side of 31 August.
SEASON_HALF_WIDTH = 1


def _month_window(month: int, half: int = SEASON_HALF_WIDTH) -> list[int]:
    return sorted({((month - 1 + d) % 12) + 1 for d in range(-half, half + 1)})


def _climatology(storms_before: list[dict], contract_key: str, thresholds: dict,
                 landfall_hits: dict | None = None) -> float | None:
    """Unconditional base rate among storms that had already occurred. None when too thin.

    Covers BOTH contract families. An intensity contract compares against the share of prior
    storms that reached the threshold; a landfall contract against the share that made that
    landfall. Without the second, every landfall contract reported `skill n/a` -- a Brier score
    with nothing to compare it to, which for a rare event looks impressive and means nothing.
    """
    if len(storms_before) < 10:
        return None
    thr = thresholds.get(contract_key)
    if thr is not None:
        known = [s for s in storms_before
                 if s.get("max_vmax_kt") is not None and s["max_vmax_kt"] == s["max_vmax_kt"]]
        if len(known) < 10:
            return None
        return sum(1 for s in known if s["max_vmax_kt"] >= thr) / len(known)
    if landfall_hits is not None and contract_key in landfall_hits:
        hits = landfall_hits[contract_key]
        return sum(1 for s in storms_before if s["storm_id"] in hits) / len(storms_before)
    return None


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
    # storm_id sets per landfall contract, so the climatology reference can be computed
    # incrementally over storms already past without re-scanning the table each step.
    landfall_hits: dict = {}
    for region in (regions or []):
        clean = {r["storm_id"] for r in read_table("landfalls", base).to_pylist()
                 if r.get("region") == region and not r.get("suspect_relocation")}
        hur = {r["storm_id"] for r in read_table("landfalls", base).to_pylist()
               if r.get("region") == region and not r.get("suspect_relocation")
               and r.get("hurricane_at_landfall")}
        landfall_hits[f"landfall_{region}_any"] = clean
        landfall_hits[f"landfall_{region}_hurricane"] = hur
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
            # WITHOUT THIS, A LANDFALL CONTRACT IS ONLY SCORED WHERE IT ALREADY HAPPENED.
            # get_analogs reports a region only when some matched analog hit it, so omitting
            # `regions` meant the Hawaii contract produced a prediction for 215 of 847 storms
            # -- precisely the 215 whose pool already contained a Hawaii landfall. Scoring a
            # rare-event contract only on the subset where the event is over-represented is
            # how a back-test flatters itself. Naming the regions makes the model answer 0.0
            # where no analog reached them, which is a forecast and belongs in the score.
            regions=regions,
        )
        lf = landfalls.get(g["storm_id"], [])
        for c in contracts:
            p = c.predict(res)
            preds[c.key].append(Prediction(
                storm_id=g["storm_id"], contract=c.key, made_utc=gt.isoformat(),
                p=p, p_climatology=_climatology(prior, c.key, thresholds, landfall_hits),
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


def run_disturbance_backtest(
    *,
    archive_dir: Path | None = None,
    radius_km: float = 750.0,
    horizon_hours: float = 168.0,
    min_prior: int = 20,
    out_path: Path | None = None,
    verbose: bool = True,
) -> dict:
    """Score 'does this outlook area become a tropical cyclone within 7 days'.

    THIS IS THE QUESTION THE BEST-TRACK ARCHIVE CANNOT ASK. Failures have no best-track row, so
    only the disturbance log carries the denominator. It is scored here against the one
    benchmark that matters: **NHC's own published formation probability**, which is on the same
    page as the disturbance and is what any operator already has.

    Two estimates per observation, both strictly zero-peek:

      p_nhc     the published 7-day formation chance, read off that issuance
      p_analog  the development rate of OTHER threads observed STRICTLY BEFORE this instant,
                within `radius_km` and a +/-1 month window -- the archive's own base rate

    OUTCOME matches the horizon NHC's number is about: developed, AND genesis within
    `horizon_hours` of this observation. A thread that developed eleven days later did not
    develop within seven, and scoring it as a hit would flatter every forecast in the file.

    THE SAMPLE UNIT IS THE THREAD, NOT THE OBSERVATION. One area observed four times a day for
    a week is 28 rows and one disturbance; the gate in scoring.py counts distinct threads.
    """
    base = archive_dir or ARCHIVE_DIR
    say = print if verbose else (lambda *a, **k: None)
    rows = [r for r in read_table("daily_disturbances", base).to_pylist()
            if r.get("lat") is not None and r.get("observed_utc") is not None]
    if not rows:
        return {"mode": "disturbance_conditioned", "scored": False,
                "refused_reason": "daily_disturbances is empty -- run the back-fill"}

    for r in rows:
        t = r["observed_utc"]
        r["_t"] = t if getattr(t, "tzinfo", None) else t.replace(tzinfo=timezone.utc)
    rows.sort(key=lambda r: r["_t"])

    # per-thread outcome: when (if ever) did it become a cyclone?
    genesis_at: dict = {}
    for r in rows:
        key = (r.get("basin"), r.get("disturbance_key"))
        if r.get("outcome") == "developed" and r.get("outcome_utc") is not None:
            g = r["outcome_utc"]
            genesis_at[key] = g if getattr(g, "tzinfo", None) else g.replace(tzinfo=timezone.utc)

    preds: list[Prediction] = []
    history: list[dict] = []          # observations already past, for the analog base rate
    skipped_thin = 0

    for r in rows:
        key = (r.get("basin"), r.get("disturbance_key"))
        t = r["_t"]
        g = genesis_at.get(key)
        outcome = bool(g is not None
                       and 0 <= (g - t).total_seconds() / 3600.0 <= horizon_hours)

        # ---- the archive's own base rate, from strictly earlier observations --------
        prior = [h for h in history
                 if h["_key"] != key
                 and abs(((h["_t"].month - t.month + 6) % 12) - 6) <= 1
                 and haversine_km(r["lat"], r["lon"], h["lat"], h["lon"]) <= radius_km]
        p_analog = None
        if len(prior) >= min_prior:
            # de-duplicate to one vote per prior THREAD, else a long-lived area votes 28 times
            per_thread: dict = {}
            for h in prior:
                per_thread.setdefault(h["_key"], []).append(h["_outcome"])
            votes = [any(v) for v in per_thread.values()]
            if len(votes) >= 5:
                p_analog = sum(1 for v in votes if v) / len(votes)
        if p_analog is None:
            skipped_thin += 1

        pn = r.get("prob_7d_pct")
        p_nhc = (float(pn) / 100.0) if pn is not None and pn == pn else None

        preds.append(Prediction(
            storm_id=f"{key[0]}|{key[1]}",     # THE SAMPLE UNIT: the thread
            contract="develops_within_7d", made_utc=t.isoformat(),
            p=p_analog, p_climatology=p_nhc, outcome=outcome,
            n_analogs=len(prior),
            refused_reason=None if p_analog is not None else "prior pool too thin",
        ))
        history.append({**r, "_key": key, "_outcome": outcome})

    analog = score_contract(preds)
    # score NHC's published number on the SAME rows, so the two are comparable
    nhc_preds = [Prediction(storm_id=p.storm_id, contract="develops_within_7d",
                            made_utc=p.made_utc, p=p.p_climatology, p_climatology=None,
                            outcome=p.outcome)
                 for p in preds]
    nhc = score_contract(nhc_preds)

    threads = {(r.get("basin"), r.get("disturbance_key")) for r in rows}
    developed = sum(1 for k in threads if k in genesis_at)
    report = {
        "mode": "disturbance_conditioned",
        "question": f"does an NHC outlook area become a tropical cyclone within "
                    f"{horizon_hours:.0f} h",
        "built_utc": _now(),
        "processing_version": PROCESSING_VERSION,
        "settings": {"radius_km": radius_km, "horizon_hours": horizon_hours,
                     "min_prior": min_prior},
        "n_observations": len(rows),
        "n_threads": len(threads),
        "n_threads_developed": developed,
        "observed_development_rate": developed / len(threads) if threads else None,
        "n_observations_without_analog_pool": skipped_thin,
        "analog": analog,
        "nhc_published": nhc,
        "skill_analog_vs_nhc": (
            skill(analog.get("brier"), nhc.get("brier"))
            if analog.get("brier") is not None and nhc.get("brier") is not None else None),
        "note": ("p_climatology in the analog block IS the NHC published probability, so "
                 "'skill_vs_climatology' there answers: does this archive add anything to the "
                 "number NHC already published on the same page?"),
    }
    if out_path:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(json.dumps(report, indent=2, sort_keys=True, default=str) + "\n")
    say(f"  threads {len(threads)}, developed {developed} "
        f"({100 * developed / max(1, len(threads)):.1f}%)")
    return report
