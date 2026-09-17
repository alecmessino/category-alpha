"""What every committed Genesis Watch record must refuse, enforced rather than described.

The watch's value is entirely in what it declines to say. A refusal that lives only in prose
is a refusal until someone is in a hurry, so each one below is asserted against every record
actually in the sequence.
"""
from __future__ import annotations

import json
import re

import contract as C


def schema_version(rec: dict) -> int:
    """Records are frozen, so the sequence carries more than one schema.

    Snapshot 0001 arrived as schema/1 from an external capture and can never be migrated --
    that is the whole point of an append-only contract. So each rule below asserts the
    contract THAT record was written under, rather than demanding the first record look like
    the latest one.
    """
    return int((rec.get("schema") or "0").rsplit("/", 1)[-1] or 0)


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", text)

SNAPSHOTS = [r for r in C.load_all()
             if r.get("schema", "").startswith("millibar.pacific-genesis-watch.snapshot")]


def test_there_is_at_least_one_snapshot():
    assert SNAPSHOTS


def test_no_record_renders_or_stores_a_track():
    """An outlook polygon is not a forecast cone, and no official track exists pre-genesis."""
    for rec in C.load_all():
        blob = json.dumps(rec)
        assert '"track"' not in blob, f"{rec.get('record_id')} carries a track field"
        assert '"cone"' not in blob, f"{rec.get('record_id')} carries a cone field"
        assert '"forecast_track"' not in blob
    page = (C.ROOT / "docs" / "risk" / "genesis-watch" / "index.html")
    if page.is_file():
        html = flat(page.read_text())
        assert "Not a forecast cone" in html
        assert "No official cyclone track is rendered, because none exists" in html


def test_every_object_refuses_a_track_and_an_unsourced_invest():
    for rec in SNAPSHOTS:
        for o in rec.get("objects", []):
            joined = " ".join(o.get("refusals") or [])
            assert "No track plotted" in joined or "No track" in joined, o.get("millibar_object_id")
            assert "invest" in joined.lower(), o.get("millibar_object_id")


def test_no_millibar_identifier_is_passed_off_as_an_nhc_one():
    for rec in SNAPSHOTS:
        for o in rec.get("objects", []):
            assert "Not an NHC identifier" in (o.get("id_note") or "")
            assert o["millibar_object_id"].startswith("PGW-")
            note = o.get("nhc_area_number_note") or ""
            if o.get("nhc_gtwo_area_number"):
                assert "not a persistent disturbance ID" in note


def test_the_text_outlook_outranks_the_gis_attribute():
    """'near 0 percent' is a LABEL at the bottom of the scale, not the number zero.

    NHC's GIS prints 0 for it. Showing that 0 in place of the product's own wording would
    publish a precision the product refused to state, so where they disagree the record must
    carry both and say which stands.
    """
    seen_near_zero = False
    for rec in SNAPSHOTS:
        v = schema_version(rec)
        for o in rec.get("objects", []):
            p = o.get("formation_prob_48h") or {}
            text = p.get("official_text") or ""
            if "near 0" in text:
                seen_near_zero = True
                # Both schemas must preserve the product's own wording rather than a number.
                assert "near 0 percent" in text
                if v >= 2:
                    assert p.get("official_pct") is None, "near 0 percent was coerced to a number"
                    assert p.get("official_qualifier") == "near_zero"
                    dis = p.get("text_gis_disagreement")
                    if dis is not None:
                        assert dis["gis"] == 0.0 and "the text stands" in dis["resolution"]
            if v >= 2:
                assert "TEXT product is authoritative" in (p.get("authority") or "")
    assert seen_near_zero, "no near-0-percent case in the sequence to exercise this rule"


def test_no_formation_probability_is_invented_or_adjusted():
    """NHC's is the only formation probability anywhere in a record."""
    ALLOWED = {
        1: {"official_text", "gis_attribute", "gis_risk"},
        2: {"official_text", "official_pct", "official_qualifier", "gis_attribute",
            "gis_label", "text_gis_disagreement", "authority"},
    }
    for rec in SNAPSHOTS:
        allowed = ALLOWED[schema_version(rec)]
        for o in rec.get("objects", []):
            for key in ("formation_prob_48h", "formation_prob_7d"):
                p = o.get(key) or {}
                extra = set(p) - allowed
                assert not extra, f"{key} carries {extra}, which is not NHC's"
        atlas = rec.get("atlas_state") or {}
        joined = " ".join(atlas.get("refusals") or [])
        if atlas.get("objects"):
            assert "No formation probability is computed" in joined


def test_atlas_cohorts_are_labelled_historical_and_never_a_forecast():
    for rec in SNAPSHOTS:
        atlas = rec.get("atlas_state") or {}
        for o in atlas.get("objects", []):
            c = o.get("cohort") or {}
            if c.get("available"):
                assert "NOT a formation probability" in (c.get("interpretation") or "")
                assert "conditioned on genesis having occurred" in (c.get("interpretation") or "")
            pe = o.get("pathway_evidence") or {}
            if pe.get("available"):
                assert pe.get("label") == "HISTORICAL EVIDENCE — NOT A FORECAST"


def test_the_regeneration_rate_stays_refused_for_want_of_a_denominator():
    found = False
    for rec in SNAPSHOTS:
        for o in (rec.get("atlas_state") or {}).get("objects", []):
            ident = o.get("identity") or {}
            if ident.get("prior_designation"):
                found = True
                assert ident.get("regeneration_rate") == "REFUSED"
                assert "NO VALID DENOMINATOR" in (ident.get("refusal") or "")
    assert found, "the former TD15-E object is not in the sequence"


def test_model_guidance_is_refused_without_a_sourced_invest_association():
    for rec in SNAPSHOTS:
        g = (rec.get("atlas_state") or {}).get("model_guidance") or {}
        if not g:
            continue
        if not g.get("available"):
            assert "No invest association is sourced" in (g.get("refusal") or "")
            assert g.get("if_it_becomes_available") == "MODEL GUIDANCE — NOT AN OFFICIAL NHC FORECAST"
        else:
            assert g.get("label_required") == "MODEL GUIDANCE — NOT AN OFFICIAL NHC FORECAST"


def test_a_new_object_never_inherits_a_test_from_the_object_it_replaced():
    """The three tests follow identifiers, not slots in the product's ordering.

    When NHC renamed the Mexico area between records 0001 and 0002, the watch minted a new
    identifier and refused continuity. Handing that new object the retired one's EXPOSURE
    CLOCK label would assert through the back door exactly what the identifier refused.
    """
    for rec in SNAPSHOTS:
        for o in rec.get("objects", []):
            if o.get("continuity_asserted") == "none":
                assert not o.get("test"), (
                    f"{o['millibar_object_id']} is a new object but carries a test label")


def test_the_lifecycle_records_states_not_reached_as_null():
    keys = {"OUTLOOK", "INVEST_GUIDANCE", "DEPRESSION", "NAMED", "OFFICIAL_FORECAST",
            "OBSERVATION", "POST_SEASON"}
    for rec in SNAPSHOTS:
        for o in rec.get("objects", []):
            assert keys <= set(o.get("lifecycle") or {}), o.get("millibar_object_id")


def test_every_snapshot_hashes_its_own_raw_sources():
    for rec in SNAPSHOTS:
        raw = rec.get("raw_sha256") or {}
        assert raw, f"{rec.get('record_id')} hashes no source bytes"
        for name, h in raw.items():
            assert len(h) == 64 and all(c in "0123456789abcdef" for c in h), name


def test_a_prospective_snapshot_is_acquired_after_it_was_issued_and_never_backdated():
    for rec in SNAPSHOTS:
        ts = rec.get("timestamps")
        if not ts:
            continue
        issued = C.parse_iso(ts["source_issued_at"])
        acquired = C.parse_iso(ts["source_acquired_at"])
        computed = C.parse_iso(ts["atlas_computed_at"])
        assert acquired >= issued, "acquired before the product was issued"
        assert computed >= acquired, "Atlas state predates the acquisition it accompanies"
        if rec.get("contemporaneity", {}).get("atlas_captured_with_source"):
            assert (computed - acquired).total_seconds() < 3600, (
                "an Atlas state claiming contemporaneity was computed an hour or more later")
