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

import re

import json
from datetime import datetime, timezone
from pathlib import Path

from ..provenance import ARCHIVE_DIR, PROCESSING_VERSION, _now
from ..retrieval.analogs import get_analogs, haversine_km, _as_dt
from ..store import read_table
from ..schema import THRESHOLDS_KT
from .contracts import standard_contracts
from .scoring import Prediction, score_contract, skill

# A +/- 1 month window around the genesis month. Wider than an exact month because a month
# boundary is an artefact of the calendar, not of the atmosphere, and an exact-month filter
# throws away the analog three days on the other side of 31 August.
SEASON_HALF_WIDTH = 1


def _month_window(month: int, half: int = SEASON_HALF_WIDTH) -> list[int]:
    return sorted({((month - 1 + d) % 12) + 1 for d in range(-half, half + 1)})


def _climatology(storms_before: list[dict], contract_key: str, thresholds: dict,
                 landfall_hits: dict | None = None,
                 hit_denoms: dict | None = None) -> float | None:
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
        # THE DENOMINATOR IS EVERY PRIOR STORM unless the contract says otherwise. For a landfall
        # that is right: a storm with a full track and no crossing genuinely did not cross. For a
        # TIME-TO-EVENT contract it is not, because a storm that reached the threshold at an
        # unrecorded hour is unknown rather than late, and rule 4 keeps unknown out of the
        # denominator. Measured on this archive: 31 NA and 1 EP storm since 1971 reached tropical
        # storm strength with no hour recorded. Counting them as misses would depress the
        # reference the model is scored against, which flatters the model.
        denom = storms_before
        if hit_denoms is not None and contract_key in hit_denoms:
            keep = hit_denoms[contract_key]
            denom = [s for s in storms_before if s["storm_id"] in keep]
        if len(denom) < 10:
            return None
        return sum(1 for s in denom if s["storm_id"] in hits) / len(denom)
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
    contracts: list | None = None,
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

    # `contracts` is how the evidence-boundary research runs a wider set without widening what
    # the daily job scores. Omitted, this is exactly what it has always been.
    contracts = contracts or standard_contracts(regions or [])
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
    # Any further threshold contract in the list gets its own reference. Written as an addition
    # so the four above -- and therefore the published run -- are bit-for-bit what they were.
    for c in contracts:
        m = re.fullmatch(r"reaches_(\w+?)_(\d+)kt", c.key)
        if m and c.key not in thresholds:
            thresholds[c.key] = int(m.group(2))

    # TIME-TO-EVENT REFERENCES, same shape as the landfall ones: the share of prior storms that
    # reached the event inside the horizon, over the prior storms whose answer is KNOWN.
    hit_denoms: dict = {}
    genesis_by_id = {g["storm_id"]: g for g in genesis}
    for c in contracts:
        m = re.fullmatch(r"reaches_(\w+)_within_(\d+)h", c.key)
        if not m:
            continue
        event, hours = m.group(1), int(m.group(2))
        thr = THRESHOLDS_KT[event]
        hit, known = set(), set()
        for sid, st in storms.items():
            h = (genesis_by_id.get(sid) or {}).get(f"hours_to_{event}")
            if h is not None and h == h:
                known.add(sid)
                if h <= hours:
                    hit.add(sid)
                continue
            pk = st.get("max_vmax_kt")
            if pk is not None and pk == pk and pk < thr:
                known.add(sid)          # never reached it at all: a resolved no
        landfall_hits[c.key] = hit
        hit_denoms[c.key] = known

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
                p=p, p_climatology=_climatology(prior, c.key, thresholds, landfall_hits, hit_denoms),
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
    }
    if out_path:
        # THE LEDGER GOES TO PARQUET, NOT INTO THE JSON.
        # Every prediction is worth keeping -- a skill number nobody can audit is a rumour --
        # but 10,390 of them inline is a 3.35 MB JSON blob, and re-running the back-test would
        # add a fresh copy of it to git history each time. The scores stay in the JSON where a
        # human reads them; the ledger goes beside the other tables in the format the rest of
        # the archive already uses, where it costs about a tenth as much and is queryable.
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        ledger = [p.as_dict() for v in preds.values() for p in v]
        ledger_path = out_path.with_name(out_path.stem + "-ledger.parquet")
        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
            cols = ["storm_id", "contract", "made_utc", "p", "p_climatology", "outcome",
                    "n_analogs", "ess", "refused_reason"]
            tbl = pa.table({c: [r.get(c) for r in ledger] for c in cols})
            pq.write_table(tbl, ledger_path, compression="zstd")
            report["ledger"] = {"path": ledger_path.name, "rows": len(ledger)}
        except Exception as exc:                                # noqa: BLE001
            report["ledger"] = {"error": f"{type(exc).__name__}: {exc}", "rows": len(ledger)}
        out_path.write_text(json.dumps(report, indent=2, sort_keys=True, default=str) + "\n")
    return report


def _stability_note(analog_first, nhc_first, analog_obs, nhc_obs) -> dict:
    """Compare the two sampling schemes and say plainly when they disagree.

    THE POINT OF THIS FUNCTION. The same question scored two defensible ways -- one forecast per
    disturbance, or every observation -- gave answers of OPPOSITE SIGN on this archive
    (+26.8% and -3.1%). Either the effect is smaller than the choice of sampling scheme, or the
    outcome labels are noisy, or both. Publishing whichever number flattered the archive would
    have been trivial and wrong, so the disagreement is reported as the result.

    The outcome labels depend on a linkage NHC does not publish (see backfill_two: a thread is
    matched to a best-track genesis within 600 km and -6..+96 h). Any error there lands on BOTH
    estimates, which is why the analog-vs-NHC comparison on identical rows is more trustworthy
    than either estimate's skill against a constant -- and why the latter must not be read as a
    verdict on NHC's forecasts.
    """
    a = (analog_first or {}).get("skill_vs_climatology")
    b = (analog_obs or {}).get("skill_vs_climatology")
    agree = (a is not None and b is not None and (a > 0) == (b > 0))
    return {
        "thread_level_skill_vs_nhc": a,
        "observation_level_skill_vs_nhc": b,
        "schemes_agree_in_sign": agree,
        "verdict": (
            "STABLE: both sampling schemes agree in sign" if agree else
            "NOT STABLE -- the two defensible sampling schemes disagree in SIGN, so this "
            "archive makes NO claim to beat NHC's published formation probability. The effect "
            "is smaller than the choice of scheme."),
        "caveat": (
            "Outcome labels come from an unpublished linkage heuristic, so neither estimate's "
            "skill against a constant is a verdict on NHC -- only the like-for-like comparison "
            "on identical rows is, and it is the one that is unstable."),
    }


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

    # NHC's number scored over EVERY observation -- what an operator actually has.
    base_rate_all = (sum(1 for p in preds if p.outcome) / len(preds)) if preds else None
    nhc_preds = [Prediction(storm_id=p.storm_id, contract="develops_within_7d",
                            made_utc=p.made_utc, p=p.p_climatology,
                            p_climatology=base_rate_all, outcome=p.outcome)
                 for p in preds]
    nhc = score_contract(nhc_preds)

    # AND over the SAME rows the analog could answer, because otherwise the two Brier scores
    # are computed on different samples and their ratio is not a comparison at all. The analog
    # refuses where its prior pool is thin, and the rows it refuses are not a random subset --
    # they are the early-season and sparsely-observed ones. Comparing 5,273 forecasts against
    # 9,810 different forecasts would have reported a "skill" that is mostly a change of sample.
    matched = [p for p in preds if p.p is not None and p.p_climatology is not None]
    nhc_matched = score_contract(
        [Prediction(storm_id=p.storm_id, contract="develops_within_7d", made_utc=p.made_utc,
                    p=p.p_climatology, p_climatology=None, outcome=p.outcome) for p in matched])
    analog_matched = score_contract(
        [Prediction(storm_id=p.storm_id, contract="develops_within_7d", made_utc=p.made_utc,
                    p=p.p, p_climatology=p.p_climatology, outcome=p.outcome) for p in matched])

    # ---- thread-level scoring: ONE forecast per disturbance -------------------------
    #
    # WHY THIS EXISTS BESIDE THE OBSERVATION-LEVEL SCORE. An area NHC watches for ten days
    # produces ~40 observations that share one outcome and nearly the same probability. Scoring
    # all of them makes long-lived, high-probability areas dominate, and it inflates the
    # reference base rate from the 23% of THREADS that develop to the 37% of OBSERVATIONS whose
    # thread develops. Against that inflated constant, NHC's own published probability appears
    # to have no skill (-1.0%), which is an artefact of the sampling and not a finding about
    # NHC. One forecast per thread -- its FIRST appearance in the outlook, the moment an
    # operator first sees the area -- is the cleaner object, and it is the one to quote.
    first_by_thread: dict = {}
    for p_ in preds:
        first_by_thread.setdefault(p_.storm_id, p_)      # preds are in time order
    firsts = list(first_by_thread.values())
    base_first = (sum(1 for p_ in firsts if p_.outcome) / len(firsts)) if firsts else None
    nhc_first = score_contract(
        [Prediction(storm_id=p_.storm_id, contract="develops_within_7d", made_utc=p_.made_utc,
                    p=p_.p_climatology, p_climatology=base_first, outcome=p_.outcome)
         for p_ in firsts])
    analog_first = score_contract(
        [Prediction(storm_id=p_.storm_id, contract="develops_within_7d", made_utc=p_.made_utc,
                    p=p_.p, p_climatology=p_.p_climatology, outcome=p_.outcome)
         for p_ in firsts])

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
        "first_sighting": {
            "n_threads": len(firsts),
            "base_rate": base_first,
            "nhc": nhc_first,
            "analog": analog_first,
            "note": ("one forecast per disturbance, at its first appearance in the outlook -- "
                     "the statistically clean object, since observations within one thread are "
                     "not independent"),
        },
        "like_for_like": {
            "n_forecasts": len(matched),
            "nhc_brier": nhc_matched.get("brier"),
            "analog_brier": analog_matched.get("brier"),
            "skill_analog_vs_nhc": analog_matched.get("skill_vs_climatology"),
            "note": "both scored on the SAME forecasts -- the only fair comparison",
        },
        "stability": _stability_note(analog_first, nhc_first, analog_matched, nhc_matched),
        "note": ("p_climatology in the analog block IS the NHC published probability, so its "
                 "skill_vs_climatology answers the question that matters: does this archive add "
                 "anything to the number NHC already prints on the same page? The top-level "
                 "nhc_published block is scored against the unconditional base rate instead, "
                 "and over ALL observations, so its Brier is NOT comparable to the analog's -- "
                 "use like_for_like."),
    }
    if out_path:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        Path(out_path).write_text(json.dumps(report, indent=2, sort_keys=True, default=str) + "\n")
    say(f"  threads {len(threads)}, developed {developed} "
        f"({100 * developed / max(1, len(threads)):.1f}%)")
    return report
