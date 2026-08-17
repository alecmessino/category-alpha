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
