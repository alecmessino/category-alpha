"""The Storm Atlas's state, as the repository actually holds it at capture time.

WHAT THIS IS NOT. It is not a forecast, and it is not a second opinion on NHC's formation
probability. The archive's cohorts are conditioned on GENESIS HAVING OCCURRED: they answer
"of the systems that formed near here in this season, what followed", which is historical
evidence about pathways. NHC's 20% / 70% answers "will one form". The two are different
quantities over different populations and are never multiplied, averaged, or presented as
alternatives to each other. Every cohort this module emits carries that statement inline,
because a number travels further than the page it was printed on.

WHY IT IS CAPTURED SEPARATELY. Snapshot 0001's source products were issued 11:54Z and its
manifest was captured at 16:23:22Z. What the Atlas "would have known" at 11:54Z is not
recoverable -- the archive is rebuilt several times a day and the repository at 11:54Z is
not the repository now. So the Atlas state is appended as its own record with its own
capture time, and the gap is stated rather than closed. Backfilling it would manufacture a
contemporaneity that did not exist, which is the one thing a frozen decision state must
never do.

REFUSALS ARE OUTPUT. Where the archive cannot answer, the refusal is the answer and is
recorded with its reason. A missing denominator is not a small number.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "data" / "genesis-archive"
sys.path.insert(0, str(ROOT / "scripts"))

# The cohort radius and season window the archive's own analog retrieval defaults to. Named
# here so a snapshot records the cohort DEFINITION and not just its result.
COHORT_RADIUS_KM = 500.0
COHORT_MIN_SAMPLE = 10

NOT_A_FORECAST = (
    "Historical evidence, conditioned on genesis having occurred near this position in this "
    "season. NOT a formation probability, NOT an impact probability, and NOT a forecast. "
    "NHC's formation probability answers a different question over a different population."
)


def archive_version() -> dict:
    """What the archive is, at this instant, by its own manifest."""
    m = json.loads((ARCHIVE / "MANIFEST.json").read_text())
    return {
        "archive_dir": "data/genesis-archive",
        "built_utc": m.get("built_utc"),
        "started_utc": m.get("started_utc"),
        "processing_version": m.get("processing_version"),
        "tables": {k: v.get("rows") if isinstance(v, dict) else v
                   for k, v in (m.get("tables") or {}).items()},
        "sources": [{"key": s.get("key"), "sha256": s.get("sha256"),
                     "retrieved_utc": s.get("retrieved_utc") or s.get("downloaded_utc")}
                    for s in (m.get("sources") or [])],
        "recorded_gaps": [g.get("key") for g in (m.get("gaps") or [])],
    }


def methodology_hash() -> dict:
    """A hash over the code that decides what a cohort is.

    Not decorative. A cohort is only comparable across snapshots if the rule that built it
    did not move underneath them, and "the methodology version" is a claim nobody can check.
    This is the claim made checkable.
    """
    import hashlib
    files = [
        ROOT / "scripts" / "genesis" / "retrieval" / "analogs.py",
        ROOT / "scripts" / "genesis" / "store.py",
        ROOT / "scripts" / "genesis" / "schema.py",
        Path(__file__),
    ]
    h = hashlib.sha256()
    per = {}
    for f in sorted(files):
        b = f.read_bytes()
        per[str(f.relative_to(ROOT))] = hashlib.sha256(b).hexdigest()
        h.update(b)
    return {"spec_sha256": h.hexdigest(), "files": per}


def cohort_for(lat: float, lon: float, month: int) -> dict:
    """The archive's cohort at a position, or a refusal saying why there is none."""
    try:
        from genesis.retrieval.analogs import get_analogs
    except Exception as e:                                    # pragma: no cover
        return {"available": False,
                "refusal": f"ARCHIVE UNREADABLE: {type(e).__name__}: {e}"}
    try:
        res = get_analogs(lat=lat, lon=lon, radius_km=COHORT_RADIUS_KM,
                          season_months=[month], min_sample=COHORT_MIN_SAMPLE,
                          archive_dir=ARCHIVE)
    except Exception as e:
        return {"available": False,
                "refusal": f"COHORT QUERY FAILED: {type(e).__name__}: {e}"}

    d = res.as_dict()
    rates = {}
    for band, r in (d.get("intensity") or {}).items():
        rates[band] = {
            "n_storms": r.get("n_storms"), "count": r.get("count"),
            "rate": r.get("rate"), "ci95": r.get("ci95"),
            "refused_reason": r.get("refused_reason"),
        }
    return {
        "available": True,
        "definition": {
            "kind": "genesis-conditioned positional analog cohort",
            "radius_km": COHORT_RADIUS_KM,
            "season_months": [month],
            "min_sample": COHORT_MIN_SAMPLE,
            "position_source": "GTWO GIS disturbance point, this snapshot's own geometry",
        },
        "n": d.get("n_cases"),
        "effective_sample_size": d.get("effective_sample_size"),
        "sufficient": d.get("sufficient"),
        "env_unmatched_excluded": d.get("env_unmatched_excluded"),
        "unscoreable": d.get("unscoreable"),
        "intensity_rates": rates,
        "landfall_rates": {k: {"n_storms": v.get("n_storms"), "count": v.get("count"),
                               "rate": v.get("rate"), "ci95": v.get("ci95"),
                               "refused_reason": v.get("refused_reason")}
                           for k, v in (d.get("landfall") or {}).items()},
        "gaps": d.get("gaps"),
        "interpretation": NOT_A_FORECAST,
    }


def environmental_availability() -> dict:
    """Is there environmental data for a pre-genesis disturbance? Usually not, and say so."""
    return {
        "archive_environment_rows": _rows("environment"),
        "for_these_objects": "REFUSED",
        "refusal": (
            "The archive's environment table is keyed to storms that exist in the best-track "
            "record. A pre-genesis GTWO disturbance has no ATCF identifier and no best-track "
            "row, so no environmental vector can be attached to it from this archive without "
            "inventing the association. Operational SHIPS runs exist only for systems that "
            "have been designated or invested."),
    }


def guidance_availability(invest_ids: list[str] | None) -> dict:
    """Model guidance is admissible only through a SOURCED invest association."""
    if not invest_ids:
        return {
            "available": False,
            "refusal": (
                "No invest association is sourced for these disturbances, so no model guidance "
                "is retrieved. a-deck files for aep90-99 exist every season and naming one "
                "would be a guess about which disturbance it belongs to."),
            "if_it_becomes_available": "MODEL GUIDANCE — NOT AN OFFICIAL NHC FORECAST",
        }
    return {"available": True, "invest_ids": invest_ids,
            "label_required": "MODEL GUIDANCE — NOT AN OFFICIAL NHC FORECAST"}


def identity_confidence(object_record: dict) -> dict:
    """Can the archive carry a depression -> remnant -> regeneration lineage?

    This is the IDENTITY test, answered honestly. The archive records genesis events and
    best tracks. It does not record a dissipation-then-regeneration lineage as a first-class
    relation, so a regeneration RATE has no denominator here: the population "remnant lows
    that later regenerated" is not enumerated in this archive, and neither is the population
    of remnant lows that did not. A rate without a denominator is not a small rate.
    """
    name = (object_record.get("nhc_name") or "")
    prior = "Former TD15-E" in name or "remnants" in (object_record.get("official_description") or "")
    if not prior:
        return {"prior_designation": None,
                "lineage": "No prior official designation is claimed for this object."}
    return {
        "prior_designation": "Tropical Depression Fifteen-E (per the NHC outlook's own wording)",
        "lineage_preserved": (
            "The outlook's own text is carried verbatim, which is the whole of the sourced "
            "lineage: an area of low pressure related to the remnants of TD Fifteen-E. No "
            "continuity beyond what NHC states is asserted."),
        "regeneration_rate": "REFUSED",
        "refusal": (
            "NO VALID DENOMINATOR. This archive enumerates genesis events and best tracks; it "
            "does not enumerate remnant lows, so neither the population that later regenerated "
            "nor the population that did not can be counted. A regeneration rate computed "
            "against storms-that-formed would silently change the question. A rate without a "
            "denominator is not a small rate -- it is not a rate."),
        "would_require": (
            "An enumerated remnant-low population with outcomes, which would be new archive "
            "work and is not done here."),
    }


def pathway_availability(cohort: dict) -> dict:
    if not cohort.get("available"):
        return {"available": False, "refusal": cohort.get("refusal")}
    n = cohort.get("n") or 0
    return {
        "available": bool(n),
        "n": n,
        "effective_sample_size": cohort.get("effective_sample_size"),
        "sufficient": cohort.get("sufficient"),
        "label": "HISTORICAL EVIDENCE — NOT A FORECAST",
        "note": NOT_A_FORECAST,
    }


def _rows(table: str) -> int | None:
    try:
        from genesis import store
        return store.summary().get(table)
    except Exception:
        return None


def compute(objects: list[dict], *, captured_at: str, source_issued_at: str,
            simultaneous: bool) -> dict:
    """The full Atlas state for a set of GTWO objects."""
    per = []
    for o in objects:
        pt = ((o.get("geometry") or {}).get("points") or {}).get("coordinates")
        month = int(source_issued_at[5:7])
        cohort = cohort_for(pt[1], pt[0], month) if pt else {
            "available": False, "refusal": "NO POSITION: the object carries no GTWO point geometry."}
        per.append({
            "millibar_object_id": o.get("millibar_object_id"),
            "test": o.get("test"),
            "position_used": {"lat": pt[1], "lon": pt[0]} if pt else None,
            "cohort": cohort,
            "pathway_evidence": pathway_availability(cohort),
            "identity": identity_confidence(o),
            "not_yet_knowable": o.get("not_yet_knowable"),
        })

    return {
        "schema": "millibar.pacific-genesis-watch.atlas-state/1",
        "atlas_computed_at_utc": captured_at,
        "contemporaneous_with_source": simultaneous,
        "timing_statement": (
            "Computed at the time above, against the repository as it then stood."
            if simultaneous else
            f"CAPTURED LATER THAN THE NHC SOURCE STATE. The source products were issued "
            f"{source_issued_at}; this Atlas state was computed at {captured_at}. What the "
            f"Atlas would have held at the source issuance is NOT RECOVERABLE -- the archive "
            f"is rebuilt several times a day -- and is not reconstructed here. The gap is "
            f"stated, not closed."),
        "archive": archive_version(),
        "methodology": methodology_hash(),
        "cohort_defaults": {"radius_km": COHORT_RADIUS_KM, "min_sample": COHORT_MIN_SAMPLE},
        "objects": per,
        "environmental_data": environmental_availability(),
        "model_guidance": guidance_availability(None),
        "refusals": [
            "No official NHC track is rendered for any object: none exists.",
            "No invest or model-guidance association is claimed: none is sourced.",
            "No formation probability is computed, offered, or adjusted. NHC's is the only one.",
            "No regeneration rate for the former TD15-E object: no valid denominator exists "
            "in this archive.",
            "No environmental vector is attached to a pre-genesis disturbance: the archive's "
            "environment table is keyed to designated systems.",
            "Cohort rates are conditioned on genesis having occurred and are historical "
            "evidence about pathways, never formation or impact probability.",
        ],
    }
