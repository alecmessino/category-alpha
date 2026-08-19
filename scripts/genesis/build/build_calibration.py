"""Project the genesis-conditioned backtest into the file the Storm Atlas ledger reads.

WHY THIS FILE EXISTS. The archive has been scoring itself since before the Atlas existed:
`backtest/harness.py` replays the record storm by storm with a zero-peek `as_of`, asks the
analog engine for a probability at each moment, and scores what actually happened against it.
The result -- 1,039 storms replayed, a 10,390-row ledger, Brier against climatology and full
reliability curves -- has been sitting in `data/genesis-archive/backtest.json` and reaching no
reader. The Atlas could show its refusals but could not answer the first question anyone
serious asks of them: IS ANY OF THIS ANY GOOD, AND HOW WOULD I KNOW?

It is, in places, and the places it is not are the more useful half.

WHAT THIS ADDS TO THE BACKTEST, AND WHY IT IS THE POINT
-------------------------------------------------------
The backtest reports skill per contract. It does not report whether the Atlas would have
REFUSED that contract -- and once both numbers sit in one row, they disagree.

The Atlas refuses a contract when fewer than MIN_EVENTS_FOR_SKILL distinct storms carry the
outcome ARCHIVE-WIDE (`contract_event_counts`, analogs.py:119 -- "whether a contract can ever
carry a skill number is a property of the record, not of one query"). That is the right
instinct and the wrong population. The backtest replays EAST PACIFIC storms; CONUS landfall has
699 events archive-wide, almost all of them Atlantic, and 6 in the entire east Pacific record.
So the gate passes the contract on the strength of storms the query could never have drawn, and
the method then scores WORSE than climatology on it.

    contract                archive-wide   in the replayed population   skill
    landfall_conus_any               699                            1   -0.172
    landfall_hawaii_any               11                            6   -0.033
    landfall_hawaii_hurricane          2                            0   degenerate  <- refused
    landfall_mexico_any              467                          143   +0.180

Three of the four contracts with no skill pass the archive-wide gate. One is caught. That is a
defect in the gate, not in the ledger -- and the ledger is what makes it visible, which is the
whole argument for shipping it. So every contract row carries BOTH counts and a `scope_audit`
verdict, and the surface prints the disagreement rather than the flattering half.

Fixing the gate would change what the Atlas refuses, in both surfaces, and is therefore a
METHODOLOGY_VERSION decision rather than something this emitter should quietly do.

WHAT IS COPIED VERBATIM. `mode`, `conditions_on` and `cannot_answer` are the harness's own
words about what it did and did not test. A ledger that let those be paraphrased would be
publishing a calibration for a question other than the one that was scored.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..provenance import (ARCHIVE_DIR, METHODOLOGY_VERSION, PROCESSING_VERSION, REPO_ROOT,
                          sha256_file, today)
from ..retrieval.analogs import MIN_EVENTS_FOR_SKILL, contract_event_counts
from ..schema import THRESHOLDS_KT
from ..store import read_table

OUT_DIR = REPO_ROOT / "docs" / "storm-atlas" / "data"
OUT_NAME = "atlas-calibration.json"
BACKTEST_NAME = "backtest.json"

# The intensity contracts the harness scores, mapped to the archive threshold they mean.
INTENSITY_CONTRACT = {
    "reaches_ts_34kt": "ts",
    "reaches_cat1_64kt": "cat1",
    "reaches_cat3_96kt": "cat3",
    "reaches_cat4_113kt": "cat4",
}


def _archive_intensity_counts(base: Path) -> dict:
    """Distinct storms reaching each threshold ARCHIVE-WIDE.

    The same population the landfall gate counts over, computed the same way, so the two halves
    of the scope audit are comparable. A storm with no recorded wind is counted in neither the
    numerator nor the denominator -- rule 4, and the reason this is not just `>= threshold`.
    """
    out = {k: 0 for k in THRESHOLDS_KT if k != "td"}
    col = read_table("storms", base).column("max_vmax_kt").to_pylist()
    for v in col:
        if v is None or v != v:          # NaN-safe: unknown is not a failure
            continue
        for key, kt in THRESHOLDS_KT.items():
            if key == "td":
                continue
            if v >= kt:
                out[key] += 1
    return out


def _skill(brier, clim, replay_events) -> float | None:
    """Brier skill against climatology -- or None, which is a different statement from zero.

    NONE WHEN NO EVENT OCCURRED IN THE REPLAY. With zero events both Brier scores collapse
    toward zero, and their RATIO does not: Hawaii hurricane landfall has a climatological Brier
    of 3.2e-5 against a model Brier of 1.0e-3, which is a skill of -29.9. Printed beside two
    figures that both round to 0.0000 that number reads as a computation error, and taken at
    face value it reads as a catastrophic failure. It is neither. It is a ratio of two
    quantities that are each indistinguishable from nothing, on a contract the replay never got
    to test -- and this archive does not publish numbers that mean nothing.

    The counts still publish. `scope_audit` still says the gate refused it and the replay had
    nothing to score. Only the score itself is withheld, with its reason.
    """
    if brier is None or not clim:
        return None
    if not replay_events:
        return None
    return 1.0 - (brier / clim)


def _scope_audit(contract: str, score: dict, archive_events: int) -> dict:
    """Does the archive-wide refusal gate agree with what the replay measured?

    Four verdicts, and the one that matters is `gate_missed`: the contract passed the gate and
    then failed to beat climatology, because the events the gate counted were in a population
    the query could not reach.
    """
    replay_events = score.get("n_events")
    brier = score.get("brier")
    clim = score.get("brier_climatology")
    skill = _skill(brier, clim, replay_events)
    refused = archive_events < MIN_EVENTS_FOR_SKILL
    # "No skill" means it did not beat climatology. A degenerate contract -- zero events in the
    # replay -- has no meaningful Brier at all and is called out separately rather than being
    # folded in as a failure.
    degenerate = not replay_events
    has_skill = None if degenerate or skill is None else skill > 0

    if degenerate:
        verdict = "refused_and_degenerate" if refused else "gate_passed_but_degenerate"
    elif has_skill:
        verdict = "refused_despite_skill" if refused else "agreed_scoreable"
    else:
        verdict = "agreed_refused" if refused else "gate_missed"

    return {
        "archive_events": archive_events,
        "replay_events": replay_events,
        "required": MIN_EVENTS_FOR_SKILL,
        "refused_by_gate": refused,
        "beat_climatology": has_skill,
        "verdict": verdict,
        "note": _AUDIT_NOTE[verdict],
    }


_AUDIT_NOTE = {
    "agreed_scoreable": "The gate allows a skill claim here and the replay earned one.",
    "agreed_refused": "The gate refuses a skill claim here and the replay confirms none was "
                      "available.",
    "gate_missed": "THE GATE AND THE EVIDENCE DISAGREE. Enough storms carry this outcome "
                   "archive-wide for the gate to allow a skill claim, but in the population "
                   "this backtest replayed the method did not beat climatology. The gate "
                   "counts events across the whole record; the skill that matters is skill "
                   "within the population a query can actually draw from.",
    "gate_passed_but_degenerate": "The gate allows a skill claim, but no storm in the replayed "
                                  "population carried this outcome at all, so nothing was "
                                  "scored. An unmeasured contract is not a calibrated one.",
    "refused_and_degenerate": "The gate refuses a skill claim and the replay had no events to "
                              "score either. Both agree there is nothing here.",
    "refused_despite_skill": "The gate refuses a skill claim although the replay beat "
                             "climatology -- a conservative refusal, not a wrong one.",
}


def build(archive_dir: Path | None = None, out_dir: Path | None = None) -> dict:
    base = archive_dir or ARCHIVE_DIR
    src = base / BACKTEST_NAME
    if not src.exists():
        raise FileNotFoundError(
            f"{src} does not exist. Run the backtest first (genesis backtest) -- this emitter "
            "projects an existing result and will not invent one.")

    bt = json.loads(src.read_text())
    lf_events = contract_event_counts(base)
    intensity_events = _archive_intensity_counts(base)

    contracts = []
    for key, definition in sorted(bt["contracts"].items()):
        score = bt["scores"].get(key, {})

        if key in INTENSITY_CONTRACT:
            archive_events = intensity_events.get(INTENSITY_CONTRACT[key], 0)
            kind = "intensity"
        else:
            # landfall_<region>_<any|hurricane> -> "<region>:<kind>"
            body = key[len("landfall_"):]
            region, _, lf_kind = body.rpartition("_")
            archive_events = lf_events.get(f"{region}:{lf_kind}", 0)
            kind = "landfall"

        brier = score.get("brier")
        clim = score.get("brier_climatology")
        contracts.append({
            "key": key,
            "kind": kind,
            "definition": definition,
            "n_forecasts": score.get("n_forecasts"),
            "n_storms": score.get("n_storms"),
            "n_events": score.get("n_events"),
            "n_refused": score.get("n_refused"),
            "n_unresolved": score.get("n_unresolved"),
            "base_rate": score.get("base_rate"),
            "brier": brier,
            "brier_climatology": clim,
            # Published rather than recomputed in the browser: one definition of skill, here.
            "skill": _skill(brier, clim, score.get("n_events")),
            "refused_reason": score.get("refused_reason"),
            # Bins with no forecasts are dropped: an empty bin is not a calibration point and
            # drawing it as one puts a mark on a curve where nothing was measured.
            "reliability": [b for b in score.get("reliability", []) if b.get("n")],
            "scope_audit": _scope_audit(key, score, archive_events),
        })

    payload = {
        "schema": "atlas-calibration/1",
        # The harness's own words about what it tested. Never paraphrased.
        "mode": bt["mode"],
        "conditions_on": bt["conditions_on"],
        "cannot_answer": bt["cannot_answer"],
        "settings": bt["settings"],
        "n_storms_replayed": bt["n_storms_replayed"],
        "n_storms_skipped_burn_in": bt["n_storms_skipped_burn_in"],
        "ledger": bt["ledger"],
        "min_events_for_skill": MIN_EVENTS_FOR_SKILL,
        "contracts": contracts,
        "provenance": {
            "backtest_built_utc": bt["built_utc"],
            # THE LEDGER AGES AND THE ARCHIVE DOES NOT WAIT FOR IT. The backtest is an
            # expensive replay run on its own cadence; the archive appends four times a day.
            # The two dates are published side by side rather than one being presented as
            # current: a calibration measured on a record that has since grown is still the
            # best evidence available, but a reader is entitled to see how far apart they are
            # before leaning on it.
            "archive_as_of": today(),
            "backtest_processing_version": bt["processing_version"],
            "backtest_sha256": sha256_file(src),
            "methodology_version": METHODOLOGY_VERSION,
            "processing_version": PROCESSING_VERSION,
            "source": f"data/genesis-archive/{BACKTEST_NAME}",
        },
    }
    payload["audit_summary"] = _summarise(contracts)

    out = out_dir or OUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / OUT_NAME
    # sort_keys so the file is byte-stable and CI can compare it against a rebuild.
    path.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n")
    return {"path": str(path), "bytes": path.stat().st_size, "contracts": len(contracts),
            "audit": payload["audit_summary"]}


def _summarise(contracts: list[dict]) -> dict:
    """The headline the surface leads with, computed here so both surfaces agree on it."""
    by = {}
    for c in contracts:
        by.setdefault(c["scope_audit"]["verdict"], []).append(c["key"])
    scored = [c for c in contracts if c["scope_audit"]["beat_climatology"] is not None]
    with_skill = [c for c in scored if c["scope_audit"]["beat_climatology"]]
    without = [c for c in scored if not c["scope_audit"]["beat_climatology"]]
    return {
        "by_verdict": {k: sorted(v) for k, v in sorted(by.items())},
        "n_contracts": len(contracts),
        "n_scored": len(scored),
        "n_beat_climatology": len(with_skill),
        "min_replay_events_with_skill": min((c["n_events"] for c in with_skill), default=None),
        "max_replay_events_without_skill": min(
            (c["n_events"] for c in without), default=None) if not without else max(
            c["n_events"] for c in without),
        "n_gate_missed": len(by.get("gate_missed", [])),
    }


if __name__ == "__main__":  # pragma: no cover
    print(json.dumps(build(), indent=2))
