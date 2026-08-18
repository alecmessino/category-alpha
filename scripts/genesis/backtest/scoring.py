"""Scoring rules for the analog back-test: Brier, skill, reliability, and the sample gates.

WHY THIS FILE IS SEPARATE FROM THE HARNESS. The harness decides what was predicted and when;
this file decides whether it was any good. Keeping them apart means the scoring can be unit
tested against hand-worked examples with no archive, no clock and no network -- and it means a
change to the model cannot quietly change the yardstick at the same time.

THE SAMPLE IS STORMS, NOT FORECASTS. This is the rule that this project has already been bitten
by (docs/README.md, "The sample size is storms, not forecasts") and it is restated here because
it is the easiest one to lose. Forecasts within one storm are not independent: a storm that
becomes a hurricane makes every forecast issued during its life correct. Three storms can
produce four hundred ledger entries and a beautiful Brier score that measures three coin flips.
So every published score carries BOTH counts, and the gate is applied to the storm count.

SKILL IS AGAINST A ZERO-PEEK CLIMATOLOGY. A Brier score alone says nothing -- a rare event
scores well under a forecast of "never". The reference is the base rate computed from storms
that had already happened at the moment of the forecast. A reference that used the whole record
would be a reference the forecaster could not have had, and beating it would prove nothing.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, asdict

# Distinct resolved storms required before a number is published at all. Matches the existing
# calibration ledger in scripts/lib/calibration.mjs so the two harnesses refuse alike.
MIN_STORMS_FOR_SCORE = 10
MIN_STORMS_FOR_RELIABILITY = 30

# A RARE CONTRACT NEEDS EVENTS, NOT JUST STORMS.
# The storm gate above asks "did enough storms get a forecast"; it says nothing about whether
# the thing being forecast ever happened. Measured on this archive: the Hawaii any-landfall
# contract had 847 forecast storms and SIX events, and reported a tidy-looking skill of -3.3%
# that is entirely noise. The Hawaii hurricane-landfall contract had ONE event in 1,039
# replays, and the model refused to forecast that one because its analog pool was below
# min_sample -- leaving ZERO scoreable events and a Brier score of 0.0000 that means only
# "predict never, be right every time".
MIN_EVENTS_FOR_SKILL = 10


@dataclass
class Prediction:
    """One zero-peek forecast of one binary contract for one storm."""
    storm_id: str
    contract: str
    made_utc: str            # the instant the information cut-off was set to
    p: float | None          # predicted probability; None = the model refused
    p_climatology: float | None
    outcome: bool | None     # None = the archive cannot resolve it -> excluded from scoring
    n_analogs: int = 0
    ess: float = 0.0
    refused_reason: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


def brier(pairs: list[tuple[float, bool]]) -> float | None:
    """Mean squared error of probabilistic forecasts. None on an empty sample rather than 0.0,
    because a Brier of 0 is a perfect score and an empty sample is not perfect."""
    if not pairs:
        return None
    return sum((p - (1.0 if o else 0.0)) ** 2 for p, o in pairs) / len(pairs)


def skill(model: float | None, reference: float | None) -> float | None:
    """Brier skill score. Positive = better than the reference; 0 = no skill; negative = worse.

    A negative skill score against the market is the most useful output this harness can
    produce, because it says stop.
    """
    if model is None or reference is None or reference <= 0:
        return None
    return 1.0 - (model / reference)


def reliability(pairs: list[tuple[float, bool]], bins: int = 10) -> list[dict]:
    """Reliability diagram: for each probability bin, what was predicted vs what happened.

    Empty bins are RETURNED, with n=0 and observed=None, rather than omitted. A diagram that
    silently drops its empty bins looks like a well-covered forecast range when it may be three
    clusters and a lot of nothing.
    """
    edges = [i / bins for i in range(bins + 1)]
    out = []
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        sel = [(p, o) for p, o in pairs if (p >= lo and (p < hi or (i == bins - 1 and p <= hi)))]
        n = len(sel)
        out.append({
            "bin": i, "lo": lo, "hi": hi, "n": n,
            "predicted": (sum(p for p, _ in sel) / n) if n else None,
            "observed": (sum(1 for _, o in sel if o) / n) if n else None,
        })
    return out


def score_contract(preds: list[Prediction], *, min_storms: int = MIN_STORMS_FOR_SCORE) -> dict:
    """Score one contract. Refuses rather than publishing a number the sample cannot support."""
    usable = [p for p in preds if p.p is not None and p.outcome is not None]
    refused = [p for p in preds if p.p is None]
    unresolved = [p for p in preds if p.p is not None and p.outcome is None]
    storms = {p.storm_id for p in usable}
    n_storms = len(storms)

    result = {
        "contract": preds[0].contract if preds else None,
        "n_forecasts": len(usable),
        "n_storms": n_storms,
        "n_refused": len(refused),
        "n_unresolved": len(unresolved),
        "base_rate": None,
        "brier": None,
        "brier_climatology": None,
        "skill_vs_climatology": None,
        "reliability": None,
        "scored": False,
        "refused_reason": None,
    }
    if n_storms < min_storms:
        result["refused_reason"] = (
            f"{n_storms} distinct resolved storms < {min_storms} required -- NOT YET SCORED")
        return result

    model_pairs = [(p.p, p.outcome) for p in usable]
    clim_pairs = [(p.p_climatology, p.outcome) for p in usable if p.p_climatology is not None]
    n_events = sum(1 for _, o in model_pairs if o)
    result["n_events"] = n_events
    result["base_rate"] = n_events / len(model_pairs)
    result["brier"] = brier(model_pairs)
    result["brier_climatology"] = brier(clim_pairs) if clim_pairs else None
    result["scored"] = True

    # A SKILL SCORE ON A CONTRACT WHOSE EVENT NEVER HAPPENED IS NOT A SKILL SCORE.
    # With zero positives both Brier scores collapse toward zero and their ratio explodes:
    # the Hawaii hurricane-landfall contract printed "skill -2988.3%" off two numbers that
    # were each 0.0000 to four places. That reads as a catastrophic result and actually means
    # the event did not occur in the sample. The counts are still published -- "0 of 847" is
    # the useful fact -- but the ratio is refused.
    if n_events < MIN_EVENTS_FOR_SKILL:
        result["skill_vs_climatology"] = None
        result["skill_refused_reason"] = (
            f"{n_events} event(s) in this sample of {len(model_pairs)} forecasts over "
            f"{n_storms} storms, below the {MIN_EVENTS_FOR_SKILL} required. A Brier ratio over "
            "a handful of events is noise, and over zero events it only rewards predicting "
            "'never'. Counts are published; the ratio is refused.")
    else:
        result["skill_vs_climatology"] = skill(result["brier"], result["brier_climatology"])
    if n_storms >= MIN_STORMS_FOR_RELIABILITY:
        result["reliability"] = reliability(model_pairs)
    else:
        result["reliability_refused_reason"] = (
            f"{n_storms} storms < {MIN_STORMS_FOR_RELIABILITY} required for a reliability curve")
    return result
