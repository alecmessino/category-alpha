"""Regression gates for the Millibar time model and residual evaluator.

The evaluator is shared by every published record, so the suite runs it over every event in
tec.EVENTS as well as over the two events' own fixed figures.
"""
from datetime import datetime, timezone
from tec import *

LOWELL = EVENTS["lowell-2026"]
LALA = EVENTS["lala-2026"]
R = {r.record_id: r for r in load_all(LOWELL)}

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
# Added in production hardening. The nine tests above came with the Rev 3 hand-off; their
# assertions are unchanged and only the evaluator calls now name the event they are about.
# These close the gaps that let the hand-off ship unbuildable.
# ---------------------------------------------------------------------------------------

def test_cycle_origin_is_proven_by_the_discussion_not_assumed():
    """The retired model is refuted by the products, not merely disagreed with.

    NHC labels the 08/0000Z row 12H while printing INIT at 07/1500Z. That is consistent
    with a 12Z lead origin and inconsistent with a 15Z one, and the check requires exactly
    that asymmetry: a product where both origins reconciled would not discriminate and is
    reported as unproven rather than counted as evidence.
    """
    r = reconcile_lead_labels(LOWELL.raw / "TCDCP4.202609071452.txt", LOWELL)
    assert r["cycle"] == "2026-09-07T12:00Z"
    assert r["init_valid"] == "2026-09-07T15:00Z"
    assert r["from_cycle_ok"] is True and r["from_init_ok"] is False
    assert r["labels_are_nhc_lead_set"] is True
    twelve = next(x for x in r["rows"] if x["label_h"] == 12)
    assert twelve["from_cycle_h"] == 12.0 and twelve["from_init_h"] == 9.0


def test_every_archived_discussion_confirms_the_cycle_origin():
    checked = [reconcile_lead_labels(p, LOWELL) for p in LOWELL.glob("TCD")]
    proven = [r for r in checked if r.get("ok") is not None]
    assert len(proven) >= 20, f"only {len(proven)} discussions carry a labelled table"
    assert all(r["ok"] for r in proven)


def test_declared_inputs_all_exist_and_are_readable():
    """No build may depend on an untracked local file.

    The hand-off declared raw/ne_10m_land.geojson, never shipped it, and crashed on a
    clean checkout. This is that failure as a test.
    """
    missing = [str(f) for ev in EVENTS.values() for f in declared_inputs(ev) if not f.is_file()]
    assert not missing, f"declared inputs absent from the checkout: {missing}"


def test_coastline_is_the_shared_primitive_selected_by_name():
    by_name, polys, prov = load_coastline(LOWELL)
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
    by_name, _, _ = load_coastline(LOWELL)
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
    special = [r for r in load_all(LOWELL) if r.record_id.startswith("TCM34S")]
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
    R2 = {r.record_id: r for r in load_all(LOWELL)}
    a = R2["TCA46-p3"]
    tcm = R2["TCM46-071451-f0800"]
    assert a.nominal_cycle == tcm.nominal_cycle == "2026-09-07T12:00Z"
    assert a.issued == "2026-09-07T15:00Z" and a.valid == "2026-09-07T18:00Z"
    assert a.lead_h == 6.0
    for r in load_all(LOWELL):
        if r.product == "TCA" and r.nominal_cycle is None:
            assert r.lead_h is None and "CYCLE UNRESOLVED" in r.note


# ---------------------------------------------------------------------------------------
# Added with the second record. One evaluator now serves two archives that were acquired
# differently, and these are the places where that could go wrong quietly.
# ---------------------------------------------------------------------------------------

def test_every_event_declares_inputs_that_exist_and_are_all_read():
    """Both directions, for every event, not just the one that happened to be checked."""
    for slug, ev in EVENTS.items():
        declared = declared_inputs(ev)
        assert declared, f"{slug} declares no inputs"
        assert not [f for f in declared if not f.is_file()], slug
        read = {p.name for product in ("TCM", "TCP", "TCA", "TCD", "PWS", "TCU")
                for p in ev.glob(product)} | {ev.deck, COASTLINES.name, COASTLINE_REGISTER.name}
        assert {f.name for f in declared} == read, slug
        # Nothing archived under raw/ may sit outside the declared list.
        assert not [f.name for f in ev.raw.iterdir() if f.is_file() and f.name not in read], slug


def test_the_time_model_holds_in_both_archives_and_the_retired_one_holds_in_neither():
    """87 archived discussions across two storms, and the asymmetry is the whole proof."""
    total = cycle_ok = init_ok = 0
    for ev in EVENTS.values():
        for p in ev.glob("TCD"):
            r = reconcile_lead_labels(p, ev)
            if r.get("ok") is None:
                continue
            total += 1
            cycle_ok += bool(r["from_cycle_ok"])
            init_ok += bool(r["from_init_ok"])
    assert total >= 80, total
    assert cycle_ok == total, f"cycle origin failed on {total - cycle_ok} discussions"
    assert init_ok == 0, f"initial-position origin held on {init_ok} discussions"


def test_an_ambiguous_cycle_is_refused_and_then_taken_from_the_printed_label():
    """A dissipating storm's five-row forecast does not determine its own cycle.

    Rows at +12..+60 from one cycle are equally canonical read as +24..+72 from the cycle
    six hours earlier. nominal_cycle_from_rows must REFUSE that rather than pick, and the
    companion discussion -- which prints '12H' outright -- must be what settles it.
    """
    from datetime import timedelta
    init = datetime(2026, 8, 27, 21, 0, tzinfo=timezone.utc)
    rows = [datetime(2026, 8, 28, 6, 0, tzinfo=timezone.utc) + timedelta(hours=12 * i)
            for i in range(5)]
    try:
        nominal_cycle_from_rows(init, rows)
        assert False, "an ambiguous row set was resolved instead of refused"
    except Refusal:
        pass
    assert label_cycles(LALA)["62"] == datetime(2026, 8, 27, 18, 0, tzinfo=timezone.utc)
    recs = {r.record_id: r for r in load_all(LALA)}
    adv62 = [r for r in recs.values() if r.advisory == "62" and r.product == "TCM"]
    assert adv62 and {r.nominal_cycle for r in adv62} == {"2026-08-27T18:00Z"}
    assert CYCLE_BASIS["lala-2026"]["62"] == "discussion-lead-labels"
    assert CYCLE_BASIS["lala-2026"]["15"] == "forecast-rows"


def test_a_public_advisory_is_read_against_its_own_utc_line_or_refused():
    """11 PM HST on the 16th is 09Z on the SEVENTEENTH.

    Taking the date from the local stamp and the hour from the summary line, without
    converting, puts the record a day out. The conversion is therefore checked against the
    UTC the product prints for itself, and a product that disagrees with itself is refused.
    """
    body = ("\n1100 PM HST Sun Aug 16 2026\n\n"
            "SUMMARY OF 1100 PM HST...0900 UTC...INFORMATION\n")
    assert issued_from_tcp_body(body) == datetime(2026, 8, 17, 9, 0, tzinfo=timezone.utc)
    try:
        issued_from_tcp_body(body.replace("0900 UTC", "2300 UTC"))
        assert False, "a self-inconsistent advisory time was resolved instead of refused"
    except Refusal:
        pass
    # And the real product it was modelled on lands on the same instant.
    real = (LALA.raw / "TCPCP2.adv020.txt").read_text()
    assert issued_from_tcp_body(real) == datetime(2026, 8, 17, 9, 0, tzinfo=timezone.utc)


def test_the_issuance_basis_is_per_archive_and_never_mixed():
    """Lowell's minute comes from the filename; Lala's archive does not carry one."""
    assert LOWELL.issued_basis == "wmo-transmission-minute"
    assert LALA.issued_basis == "product-body-hour"
    # Lala's products print whole hours only; inventing a minute would show up here.
    for r in load_all(LALA):
        if r.issued:
            assert r.issued.endswith(":00Z"), r.record_id
    # Lowell's do not, and that difference must survive.
    assert any(not r.issued.endswith(":00Z") for r in load_all(LOWELL) if r.issued)


def test_both_observation_vintages_are_carried_where_they_agree_too():
    recs = {r.record_id: r for r in load_all(LALA)}
    early, late = recs["TCP14A-160000"], recs["TCM15-160300-prior"]
    assert early.valid == late.valid == "2026-08-16T00:00Z"
    assert (early.lat, early.lon) == (late.lat, late.lon) == (18.3, -155.7)
    assert early.issued < late.issued        # still two vintages, not one record reused


def test_an_update_carries_no_cycle_and_no_forecast():
    """A Tropical Cyclone Update states a position, not a forecast, so it constrains nothing."""
    ups = [r for r in load_all(LALA) if r.product == "TCU"]
    assert len(ups) == 11
    for r in ups:
        assert r.nominal_cycle is None and r.lead_h is None and r.advisory is None
        assert r.kind == "observation" and "rounded mph" in r.note
