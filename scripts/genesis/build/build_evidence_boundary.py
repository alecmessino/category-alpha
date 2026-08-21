"""The evidence-boundary measurement: does the refusal gate generalise past ten contracts?

WHAT THIS IS. Methodology 1.1.0 replaced an archive-wide event-sufficiency gate with a
scope-aware one, and on ten contracts it refuses 4 of the 4 that earned no skill claim where the
old gate refused 1, while refusing none of the 6 that beat climatology. Ten points is a
demonstration, not a generalisation. This runs the archive's own zero-peek replay over 25
contracts in each of two basins and asks whether the separation holds.

WHAT THIS IS NOT. It is not a product surface and it does not touch one. It runs the existing
harness with an explicit contract list, reuses `score_contract` for every published figure, and
reuses `contract_event_counts` / `scope_phrase` for both gate verdicts. Nothing here changes what
the daily job scores or what the shipped calibration ledger says.

THE CONTRACT SET AND THE CRITERION WERE REGISTERED FIRST, in
research/evidence-boundary/PRE-REGISTRATION.md, in an earlier commit than this file. That
ordering is the point: it is what stops the contract set from being chosen after the results are
visible. The two amendments there -- which tiers carry a gate verdict at all -- were also
registered before this ran.

Run:  python3 scripts/genesis/cli.py evidence-boundary
"""

from __future__ import annotations

import json
from pathlib import Path

from ..provenance import ARCHIVE_DIR, METHODOLOGY_VERSION, PROCESSING_VERSION, _now
from ..retrieval.analogs import (MIN_EVENTS_FOR_SKILL, contract_event_counts, scope_phrase)
from ..schema import THRESHOLDS_KT
from ..store import read_table
from ..backtest.contracts import RESEARCH_REGIONS, research_contracts
from ..backtest.harness import run_genesis_backtest

OUT_DIR = Path(__file__).resolve().parents[3] / "research" / "evidence-boundary"

BASINS = ["NA", "EP"]
MIN_SEASON = 1971
SETTINGS = dict(radius_km=500.0, min_sample=10, burn_in_storms=50,
                min_season=MIN_SEASON, min_pool_season=MIN_SEASON)

# key -> the THRESHOLDS_KT name, for the intensity tier's event count
INTENSITY_KEY = {f"reaches_{k}_{v}kt": k for k, v in THRESHOLDS_KT.items() if k != "td"}


def _intensity_counts(base: Path, *, basins=None, min_season=None) -> dict:
    """Distinct storms reaching each threshold, over a scoped population.

    The same shape as `contract_event_counts` and the same convention as
    build_calibration.py's `_archive_intensity_counts`: a storm with no recorded wind is in
    neither the numerator nor the denominator, because unknown is not a failure.
    """
    out = {k: 0 for k in THRESHOLDS_KT if k != "td"}
    tbl = read_table("storms", base)
    col = tbl.column("max_vmax_kt").to_pylist()
    bas = tbl.column("basin").to_pylist()
    sea = tbl.column("season").to_pylist()
    want = set(basins) if basins else None
    for i, v in enumerate(col):
        if want is not None and bas[i] not in want:
            continue
        if min_season is not None and (sea[i] is None or sea[i] < min_season):
            continue
        if v is None or v != v:
            continue
        for key, kt in THRESHOLDS_KT.items():
            if key != "td" and v >= kt:
                out[key] += 1
    return out


def _classify(score: dict) -> str:
    """The replay's verdict on a contract. Registered before measuring; see §5 of the pre-reg.

    UNSUPPORTED means the Brier RATIO WAS REFUSED -- fewer than MIN_EVENTS_FOR_SKILL events in
    the replay -- not that the method was measured and found skill-less. SCORED-NO-SKILL is that
    second thing, and it is a different finding: the record supported the measurement and the
    answer was no. The gate is not expected to refuse those, and refusing them would be a
    category error, so they are excluded from the criterion.
    """
    skill = score.get("skill_vs_climatology")
    if skill is None:
        return "UNSUPPORTED"
    return "LEARNABLE" if skill > 0 else "SCORED-NO-SKILL"


def _tier(key: str) -> str:
    if key in INTENSITY_KEY:
        return "intensity"
    if key.startswith("landfall_"):
        return "landfall"
    return "timing"


def _contingency(rows: list[dict], gate_field: str) -> dict:
    """(gate refuses / allows) x (UNSUPPORTED / LEARNABLE), and the two rates.

    SCORED-NO-SKILL is deliberately absent: it is not a target of an evidence gate. It is
    counted separately so the table's denominators are never quietly inflated by it.
    """
    cell = {"refused_unsupported": 0, "allowed_unsupported": 0,
            "refused_learnable": 0, "allowed_learnable": 0}
    for r in rows:
        if r["class"] not in ("UNSUPPORTED", "LEARNABLE"):
            continue
        refused = r[gate_field]
        cell[f"{'refused' if refused else 'allowed'}_{r['class'].lower()}"] += 1
    unsupported = cell["refused_unsupported"] + cell["allowed_unsupported"]
    learnable = cell["refused_learnable"] + cell["allowed_learnable"]
    return {
        **cell,
        "n_unsupported": unsupported,
        "n_learnable": learnable,
        "n_scored_no_skill": sum(1 for r in rows if r["class"] == "SCORED-NO-SKILL"),
        "sensitivity": (cell["refused_unsupported"] / unsupported) if unsupported else None,
        "specificity": (cell["allowed_learnable"] / learnable) if learnable else None,
    }


def build(archive_dir: Path | None = None, out_dir: Path | None = None) -> dict:
    base = archive_dir or ARCHIVE_DIR
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    archive_lf = contract_event_counts(base)
    archive_int = _intensity_counts(base)

    rows: list[dict] = []
    per_basin: dict = {}

    for basin in BASINS:
        bt = run_genesis_backtest(
            archive_dir=base, basins=[basin], regions=RESEARCH_REGIONS,
            contracts=research_contracts(),
            out_path=out_dir / f"backtest-{basin}.json", **SETTINGS)
        per_basin[basin] = {
            "n_storms_replayed": bt["n_storms_replayed"],
            "n_storms_skipped_burn_in": bt["n_storms_skipped_burn_in"],
            "settings": bt["settings"],
        }

        # THE SCOPE THE LIVE GATE WOULD USE. In the replay every query is inside the basin being
        # replayed and declares 1971, so the drawable population is exactly that basin over that
        # era -- which is what the live gate derives from the matched cases. Same convention as
        # build_calibration.py's audit of the shipped EP run.
        scope_lf = contract_event_counts(base, basins=[basin], min_season=MIN_SEASON)
        scope_int = _intensity_counts(base, basins=[basin], min_season=MIN_SEASON)
        where = scope_phrase([basin], MIN_SEASON, None)

        for key, definition in sorted(bt["contracts"].items()):
            score = bt["scores"].get(key, {})
            tier = _tier(key)

            if tier == "intensity":
                archive_events = archive_int.get(INTENSITY_KEY[key], 0)
                scope_events = scope_int.get(INTENSITY_KEY[key], 0)
            elif tier == "landfall":
                body = key[len("landfall_"):]
                region, _, lf_kind = body.rpartition("_")
                archive_events = archive_lf.get(f"{region}:{lf_kind}", 0)
                scope_events = scope_lf.get(f"{region}:{lf_kind}", 0)
            else:
                # NO GATE EXISTS FOR THESE, in either surface, and none is invented here.
                archive_events = scope_events = None

            gated = archive_events is not None
            rows.append({
                "basin": basin,
                "key": key,
                "tier": tier,
                "definition": definition,
                "class": _classify(score),
                # everything the pre-registration promised to publish per contract
                "n_events": score.get("n_events"),
                "n_forecasts": score.get("n_forecasts"),
                "n_storms": score.get("n_storms"),
                "n_refused": score.get("n_refused"),
                "n_unresolved": score.get("n_unresolved"),
                "base_rate": score.get("base_rate"),
                "brier": score.get("brier"),
                "brier_climatology": score.get("brier_climatology"),
                "skill_vs_climatology": score.get("skill_vs_climatology"),
                "skill_refused_reason": score.get("skill_refused_reason"),
                "refused_reason": score.get("refused_reason"),
                "reliability_eligible": score.get("reliability") is not None,
                "reliability_refused_reason": score.get("reliability_refused_reason"),
                # the two gate verdicts, and the scope the new one counted over
                "archive_events": archive_events,
                "scope_events": scope_events,
                "scope": where if gated else None,
                "refused_by_gate": (scope_events < MIN_EVENTS_FOR_SKILL) if gated else None,
                "refused_by_archive_wide_gate":
                    (archive_events < MIN_EVENTS_FOR_SKILL) if gated else None,
            })

    landfall = [r for r in rows if r["tier"] == "landfall"]
    intensity = [r for r in rows if r["tier"] == "intensity"]
    timing = [r for r in rows if r["tier"] == "timing"]

    def tables(subset):
        return {
            "scope_aware": _contingency(subset, "refused_by_gate"),
            "archive_wide": _contingency(subset, "refused_by_archive_wide_gate"),
            "by_basin": {b: {
                "scope_aware": _contingency([r for r in subset if r["basin"] == b],
                                            "refused_by_gate"),
                "archive_wide": _contingency([r for r in subset if r["basin"] == b],
                                             "refused_by_archive_wide_gate"),
            } for b in BASINS},
        }

    primary = tables(landfall)
    sa = primary["scope_aware"]
    met = (sa["sensitivity"] is not None and sa["sensitivity"] >= 0.90
           and sa["specificity"] is not None and sa["specificity"] >= 0.95)

    out = {
        "built_utc": _now(),
        "methodology_version": METHODOLOGY_VERSION,
        "processing_version": PROCESSING_VERSION,
        "pre_registration": "research/evidence-boundary/PRE-REGISTRATION.md",
        "min_events_for_skill": MIN_EVENTS_FOR_SKILL,
        "basins": per_basin,
        "n_contracts": len(rows),
        "criterion": {"sensitivity_min": 0.90, "specificity_min": 0.95,
                      "judged_on": "landfall", "met": met},
        "primary_landfall": primary,
        "secondary_intensity": tables(intensity),
        "uncovered_timing": {
            "n": len(timing),
            "n_unsupported": sum(1 for r in timing if r["class"] == "UNSUPPORTED"),
            "unsupported": [f"{r['basin']} {r['key']}" for r in timing
                            if r["class"] == "UNSUPPORTED"],
            "note": ("No event-sufficiency gate exists for these in either surface. A contract "
                     "here that the replay could not score is a question the evidence boundary "
                     "has no verdict on -- a coverage hole, not a misclassification."),
        },
        "moved_by_scope_rule": [
            f"{r['basin']} {r['key']}" for r in rows
            if r["refused_by_gate"] and r["refused_by_archive_wide_gate"] is False],
        "contracts": rows,
    }

    (out_dir / "results.json").write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    return out
