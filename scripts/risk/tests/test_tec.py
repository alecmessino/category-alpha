"""Regression gates for the Millibar time model and residual evaluator."""
from datetime import datetime, timezone
from tec import *

R = {r.record_id: r for r in load_all()}

def test_15z_release_is_not_hour_zero():
    t = datetime(2026, 9, 7, 15, 0, tzinfo=timezone.utc)
    assert nominal_cycle_for_release(t).hour == 12
    f = R["TCM46-071451-f0800"]
    assert f.nominal_cycle == "2026-09-07T12:00Z" and f.issued == "2026-09-07T15:00Z"
    assert f.lead_h == 12.0          # 00Z is +12 from the 12Z cycle, not +9 or +12 from 15Z

def test_three_timestamps_stored_separately():
    a = R["TCA46-p3"]
    assert (a.nominal_cycle, a.issued, a.valid) == ("2026-09-07T12:00Z", "2026-09-07T15:00Z", "2026-09-07T18:00Z")
    assert a.lead_h == 6.0           # '+3 HR' display label must not become the lead

def test_tca_degrees_minutes_not_decimal():
    a = R["TCA46-p3"]
    assert abs(a.lat - (18 + 10/60)) < 1e-9 and abs(a.lon + (162 + 17/60)) < 1e-9

def test_revised_fix_preserves_both_vintages():
    early, late = R["TCP46A-071744"], R["TCM47-072047-prior"]
    assert early.valid == late.valid == "2026-09-07T18:00Z"
    assert (early.lon, late.lon) == (-162.1, -162.2)
    assert early.issued < late.issued

def test_corrections_kept_in_lineage():
    ids = [k for k in R if k.startswith(("TCP45-", "TCP45-CCA"))]
    assert len(ids) == 2 and any("CCA" in k for k in ids)
    assert len([k for k in R if k.startswith("TCM34S") and k.endswith("-cur")]) == 2

def test_residual_refuses_non_matching_valid_time():
    try:
        residual(R["TCM46-071451-f0800"], R["TCP46A-071744"], 23.3, "x")
        assert False
    except Refusal:
        pass

def test_residual_refuses_observation_as_forecast():
    try:
        residual(R["TCA46-obs"], R["TCP46A-071744"], 23.3, "x")
        assert False
    except Refusal:
        pass

def test_residual_reproduces_sourced_values():
    hd = bearing((R["TCA46-obs"].lat, R["TCA46-obs"].lon), (R["TCA46-p6"].lat, R["TCA46-p6"].lon))
    a = residual(R["TCA46-p3"], R["TCM47-072047-prior"], hd, "t")
    b = residual(R["TCA46-p3"], R["TCP46A-071744"], hd, "t")
    assert (a["along_nm"], a["cross_nm"]) == (-7.3, 8.3)
    assert (b["along_nm"], b["cross_nm"]) == (-5.0, 13.6)

def test_retired_zero_along_track_result_cannot_reappear():
    hd = bearing((R["TCA46-obs"].lat, R["TCA46-obs"].lon), (R["TCA46-p6"].lat, R["TCA46-p6"].lon))
    for o in ("TCP46A-071744", "TCM47-072047-prior"):
        assert abs(residual(R["TCA46-p3"], R[o], hd, "t")["along_nm"]) > 1.0


# ---------------------------------------------------------------------------------------
# Added in production hardening. The nine tests above came with the Rev 3 hand-off and are
# unchanged; these close the two gaps that let the hand-off ship unbuildable.
# ---------------------------------------------------------------------------------------

def test_cycle_origin_is_proven_by_the_discussion_not_assumed():
    """The retired model is refuted by the products, not merely disagreed with.

    NHC labels the 08/0000Z row 12H while printing INIT at 07/1500Z. That is consistent
    with a 12Z lead origin and inconsistent with a 15Z one, and the check requires exactly
    that asymmetry: a product where both origins reconciled would not discriminate and is
    reported as unproven rather than counted as evidence.
    """
    r = reconcile_lead_labels(RAW / "TCDCP4.202609071452.txt")
    assert r["cycle"] == "2026-09-07T12:00Z"
    assert r["init_valid"] == "2026-09-07T15:00Z"
    assert r["from_cycle_ok"] is True and r["from_init_ok"] is False
    assert r["labels_are_nhc_lead_set"] is True
    twelve = next(x for x in r["rows"] if x["label_h"] == 12)
    assert twelve["from_cycle_h"] == 12.0 and twelve["from_init_h"] == 9.0


def test_every_archived_discussion_confirms_the_cycle_origin():
    checked = [reconcile_lead_labels(p) for p in sorted(RAW.glob("TCDCP4.*.txt"))]
    proven = [r for r in checked if r.get("ok") is not None]
    assert len(proven) >= 20, f"only {len(proven)} discussions carry a labelled table"
    assert all(r["ok"] for r in proven)


def test_declared_inputs_all_exist_and_are_readable():
    """No build may depend on an untracked local file.

    The hand-off declared raw/ne_10m_land.geojson, never shipped it, and crashed on a
    clean checkout. This is that failure as a test.
    """
    missing = [str(f) for f in declared_inputs() if not f.is_file()]
    assert not missing, f"declared inputs absent from the checkout: {missing}"


def test_coastline_is_the_shared_primitive_selected_by_name():
    by_name, polys, prov = load_coastline()
    assert "Niihau" in by_name and "Kauai" in by_name
    assert prov.get("geometry_source"), "coastline carries no provenance"
    assert not (COASTLINES.parent.parent.parent / "scripts" / "risk" / "hawaii_land.geojson").exists()


def test_coastline_equivalence_to_the_handoff_geometry_is_bounded():
    """The hand-off's own rings, to the precision this file is quantised at.

    Every published coastline distance is identical under both geometries; the rings
    themselves agree to the half-step of a 4-decimal quantisation. Recorded as a bound so
    a future coastline refresh that actually moves the geometry fails here first.
    """
    import json
    by_name, _, _ = load_coastline()
    niihau = by_name["Niihau"]
    minx, miny, maxx, maxy = niihau.bounds
    assert -160.25 <= minx and maxx <= -160.05, (minx, maxx)
    assert 21.77 <= miny and maxy <= 22.01, (miny, maxy)


def test_a_special_advisory_inherits_its_cycle_and_does_not_open_one():
    """Lowell special advisory 34, and the six-hour error the convention would make.

    Issued 04/1830Z. The synoptic-slot convention would call that an 18Z cycle. Its own
    companion discussion labels the 05/0000Z row 12H, which is +12 h from 12Z and +6 h
    from 18Z, so the special is reissuing the 12Z cycle. Every record of this advisory
    is checked, because a six-hour lead error on a special is the same class of defect
    as reading the release hour as forecast hour zero -- and it is invisible unless the
    cycle is derived from the product instead of from the clock.
    """
    from datetime import datetime as _dt
    special = [r for r in load_all() if r.record_id.startswith("TCM34S")]
    assert special, "special advisory 34 is not in the archive"
    assert {r.nominal_cycle for r in special} == {"2026-09-04T12:00Z"}
    assert {r.issued for r in special} == {"2026-09-04T18:30Z"}
    # What the convention alone would have returned, and the error it carries.
    wrong = nominal_cycle_for_release(_dt(2026, 9, 4, 18, 30, tzinfo=timezone.utc))
    assert wrong.hour == 18
    leads = {r.valid: r.lead_h for r in special if r.lead_h is not None}
    assert leads["2026-09-05T00:00Z"] == 12.0      # not 6.0
    assert all(l in NHC_LEAD_SET for l in leads.values())


def test_aviation_advisory_takes_the_forecast_advisorys_cycle():
    """A TCA's '+3 HR' label is relative to issuance and constrains no cycle.

    So it adopts the numbered forecast/advisory's derived cycle rather than having one
    guessed from its own release hour, and reports no lead at all when that advisory is
    not archived.
    """
    R2 = {r.record_id: r for r in load_all()}
    a = R2["TCA46-p3"]
    tcm = R2["TCM46-071451-f0800"]
    assert a.nominal_cycle == tcm.nominal_cycle == "2026-09-07T12:00Z"
    assert a.issued == "2026-09-07T15:00Z" and a.valid == "2026-09-07T18:00Z"
    assert a.lead_h == 6.0
    for r in load_all():
        if r.product == "TCA" and r.nominal_cycle is None:
            assert r.lead_h is None and "CYCLE UNRESOLVED" in r.note
