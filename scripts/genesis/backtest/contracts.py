"""The contracts the archive is scored on -- generic, and defined once.

A contract is a QUESTION plus the RESOLUTION RULE that answers it from the archive. Both halves
live here so that the thing being predicted and the thing being scored can never drift apart,
which is the classic way a back-test comes out flattering.

Every resolver returns True, False, or None. None means THE ARCHIVE CANNOT RESOLVE IT -- not
False. A storm whose peak intensity was never recorded did not fail to become a hurricane; it
is unknown, and it is excluded from the denominator rather than counted as a miss.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from ..schema import THRESHOLDS_KT


@dataclass
class Contract:
    key: str
    question: str
    # resolve(storm_row, genesis_row, landfall_rows) -> True | False | None
    resolve: Callable
    # the analog statistic that predicts it: (analog_result) -> float | None
    predict: Callable


def _peak(storm, genesis):
    v = genesis.get("peak_vmax_kt")
    if v is None or v != v:
        v = storm.get("max_vmax_kt")
    return v if (v is not None and v == v) else None


def _threshold_contract(key: str, thr_key: str) -> Contract:
    thr = THRESHOLDS_KT[thr_key]

    def resolve(storm, genesis, landfalls):
        v = _peak(storm, genesis)
        return None if v is None else bool(v >= thr)

    def predict(res):
        r = res.intensity.get(thr_key) or {}
        # the WEIGHTED rate is the model's answer; the unweighted one is the plain base rate
        return r.get("weighted_rate") if r.get("weighted_rate") is not None else r.get("rate")

    return Contract(
        key=key,
        question=f"reaches >= {thr} kt ({thr_key})",
        resolve=resolve,
        predict=predict,
    )


def landfall_contract(region: str, *, hurricane: bool = True) -> Contract:
    """Landfall in `region`, optionally requiring >= 64 kt at the crossing.

    NOTE the joint nature of this one. It is NOT P(cross) x P(>=64 kt): on a real case those are
    NEGATIVELY correlated, because the terrain interaction that pulls a centre ashore is the same
    interaction that destroys the intensity (docs/PLAN-TRACK-MODEL.md). The analog estimate
    respects that by construction -- it counts storms that DID BOTH, rather than multiplying two
    marginals.
    """
    kind = "hurricane" if hurricane else "any"

    def resolve(storm, genesis, landfalls):
        hits = [l for l in landfalls
                if l.get("region") == region and not l.get("suspect_relocation")]
        if not hits:
            return False          # a storm with a full track and no crossing genuinely did not
        if not hurricane:
            return True
        known = [l for l in hits if l.get("vmax_kt") is not None]
        if not known:
            return None           # it crossed, but at an unrecorded intensity
        return any(bool(l.get("hurricane_at_landfall")) for l in known)

    def predict(res):
        r = (res.landfall.get(region) or {}).get(kind) or {}
        return r.get("weighted_rate") if r.get("weighted_rate") is not None else r.get("rate")

    return Contract(
        key=f"landfall_{region}" + ("_hurricane" if hurricane else "_any"),
        question=f"makes landfall in {region}" + (" while >= 64 kt" if hurricane else ""),
        resolve=resolve,
        predict=predict,
    )


def time_to_event_contract(event: str, hours: int) -> Contract:
    """Reaches `event` within `hours` of genesis. Binary, so it scores like everything else.

    A DISTRIBUTION IS NOT A PROBABILITY. `AnalogResult.time_to_event` publishes quantiles --
    p10, median, p90 -- and a quantile cannot be Brier-scored. Reading P(<= H) off a median
    would be interpolating a distribution the archive never claimed, which is the one thing
    this project does not do. So the contract asks a binary question and counts it.

    COMPUTED FROM `res.cases`, NOT FROM THE ENGINE'S PUBLISHED STATISTICS. That is deliberate
    and it is a limitation, recorded here rather than in a commit message: this rate is NOT one
    of the engine's outputs and is therefore NOT covered by the 42-vector Python/browser parity
    harness. It is fit for a research measurement, where both sides are this file. It is not fit
    for a surface, and moving it to one means moving the statistic into analogs.py and its
    transliteration first, with parity coverage, which is a methodology change.
    """
    thr = THRESHOLDS_KT[event]
    col = f"hours_to_{event}"

    def _hours(c):
        return c.get(col) if isinstance(c, dict) else getattr(c, col, None)

    def _peak_of(c):
        v = c.get("peak_vmax_kt") if isinstance(c, dict) else getattr(c, "peak_vmax_kt", None)
        return v if (v is not None and v == v) else None

    def resolve(storm, genesis, landfalls):
        v = genesis.get(col)
        if v is not None and v == v:
            return bool(v <= hours)
        # No timing recorded. A storm whose PEAK never reached the threshold genuinely never
        # reached it, within this horizon or any other -- that is a resolved False. A storm
        # whose peak is itself unrecorded is unknown, and RULE 4 says unknown is not a failure.
        peak = _peak(storm, genesis)
        if peak is None:
            return None
        return False if peak < thr else None

    def predict(res):
        num = den = 0.0
        for c in res.cases:
            h = _hours(c)
            w = c.get("weight") if isinstance(c, dict) else getattr(c, "weight", 1.0)
            if h is not None and h == h:
                den += w
                if h <= hours:
                    num += w
                continue
            peak = _peak_of(c)
            if peak is None:
                continue                      # unknown, excluded from the denominator
            if peak < thr:
                den += w                      # never reached it: a resolved no
        return (num / den) if den > 0 else None

    return Contract(
        key=f"reaches_{event}_within_{hours}h",
        question=f"reaches >= {thr} kt ({event}) within {hours} h of genesis",
        resolve=resolve,
        predict=predict,
    )


def standard_contracts(regions: list[str] | None = None) -> list[Contract]:
    out = [
        _threshold_contract("reaches_ts_34kt", "ts"),
        _threshold_contract("reaches_cat1_64kt", "cat1"),
        _threshold_contract("reaches_cat3_96kt", "cat3"),
        _threshold_contract("reaches_cat4_113kt", "cat4"),
    ]
    for r in regions or []:
        out.append(landfall_contract(r, hurricane=True))
        out.append(landfall_contract(r, hurricane=False))
    return out


# ---------------------------------------------------------------------------------------------
# THE RESEARCH SET. Deliberately NOT reachable from `standard_contracts`, which the daily archive
# job calls: widening that default would silently rewrite backtest.json and the published
# calibration ledger, and this is a measurement, not a product change.
#
# Enumerated rather than chosen, and the enumeration is registered in
# research/evidence-boundary/PRE-REGISTRATION.md before any of it was run. `td` is excluded
# because it is 0 kt and not a wind threshold; `unattributed` because it is a residual bucket
# rather than a place. Every remaining region appears for BOTH basins, including the cells with
# almost no evidence there -- those are the negative controls, and dropping them would select
# the population on the very quantity the gate keys on.

RESEARCH_REGIONS = ["conus", "caribbean", "mexico", "central_america", "hawaii"]
RESEARCH_THRESHOLDS = ["ts", "cat1", "cat2", "cat3", "cat4", "cat5"]
RESEARCH_TIMING_EVENTS = ["ts", "cat1", "cat3"]
RESEARCH_HORIZONS_H = [24, 48, 96]


def research_contracts() -> list[Contract]:
    """The 25 contracts each basin is scored on. Order is stable so reports diff cleanly."""
    out = [_threshold_contract(f"reaches_{k}_{THRESHOLDS_KT[k]}kt", k)
           for k in RESEARCH_THRESHOLDS]
    for r in RESEARCH_REGIONS:
        out.append(landfall_contract(r, hurricane=False))
        out.append(landfall_contract(r, hurricane=True))
    for e in RESEARCH_TIMING_EVENTS:
        for h in RESEARCH_HORIZONS_H:
            out.append(time_to_event_contract(e, h))
    return out
