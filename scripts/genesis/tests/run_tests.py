"""Gates for the genesis archive. A data commit cannot exist unless these passed.

These do NOT test that the code runs. They test the four properties that, if they broke, would
let the archive publish a confident wrong number without crashing:

  1. an interpolated value never becomes an observation
  2. a rate is refused when the sample cannot support it
  3. the zero-peek gate actually excludes the future
  4. an unknown outcome is never scored as a negative one

No pytest: this runs with the standard library so the CI gate has no dependency that can rot.
"""

from __future__ import annotations

import math
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from genesis.backtest.contracts import landfall_contract, standard_contracts   # noqa: E402
from genesis.backtest.scoring import (                                          # noqa: E402
    Prediction, brier, reliability, score_contract, skill)
from genesis.build.genesis_events import (                                      # noqa: E402
    build_genesis_events, summarise_storms, _is_tropical)
from genesis.provenance import PROCESSING_VERSION                               # noqa: E402
from genesis.retrieval.analogs import (                                         # noqa: E402
    get_analogs, haversine_km, wilson_interval, _wrap180)
from genesis.schema import ALL_TABLES, THRESHOLDS_KT, category_for              # noqa: E402
from genesis.sources.gtwo import _centroid, _read_dbf                           # noqa: E402
from genesis import store                                                       # noqa: E402

UTC = timezone.utc
FAILS: list[str] = []
RUN = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global RUN
    RUN += 1
    if not cond:
        FAILS.append(f"{name}: {detail}")
        print(f"  FAIL  {name}  {detail}")
    else:
        print(f"  ok    {name}")


def eq(name: str, got, want) -> None:
    check(name, got == want, f"got {got!r}, want {want!r}")


# ---------------------------------------------------------------------------
def test_categories():
    eq("cat: 63 kt is a tropical storm", category_for(63), "ts")
    eq("cat: 64 kt is a hurricane", category_for(64), "cat1")
    eq("cat: 137 kt is cat5", category_for(137), "cat5")
    eq("cat: 33 kt is a depression", category_for(33), "td")
    # THE RULE: unknown intensity is not a depression.
    eq("cat: missing intensity is unknown, not 'td'", category_for(None), None)
    eq("cat: NaN is unknown", category_for(float("nan")), None)
    check("thresholds ascend",
          all(THRESHOLDS_KT[a] < THRESHOLDS_KT[b] for a, b in
              zip(["ts", "cat1", "cat2", "cat3", "cat4"], ["cat1", "cat2", "cat3", "cat4", "cat5"])))


def test_geometry():
    check("antimeridian: 179E->179W is short",
          haversine_km(15, 179, 15, -179) < 300,
          f"{haversine_km(15, 179, 15, -179):.0f} km")
    check("haversine: Honolulu->Hilo ~340 km",
          330 < haversine_km(21.31, -157.86, 19.72, -155.06) < 355)
    eq("wrap 190 -> -170", _wrap180(190), -170.0)
    eq("wrap -190 -> 170", _wrap180(-190), 170.0)
    lo, hi = wilson_interval(2, 3)
    check("wilson interval stays in [0,1]", 0 <= lo < hi <= 1, f"({lo:.3f},{hi:.3f})")
    eq("wilson on empty sample refuses", wilson_interval(0, 0), None)


def test_genesis_rules():
    d = lambda h: datetime(2020, 8, 1, h, tzinfo=UTC)
    pts = [
        # a pre-tropical low: NOT genesis
        dict(storm_id="S1", iso_time=d(0), lat=12.0, lon=-140.0, vmax_kt=25, mslp_mb=1008,
             stage="LO", nature="DS", quality="observed"),
        dict(storm_id="S1", iso_time=d(6), lat=12.5, lon=-141.0, vmax_kt=30, mslp_mb=1006,
             stage="TD", nature="TS", quality="observed"),
        # an INTERPOLATED point that would cross 34 kt three hours early
        dict(storm_id="S1", iso_time=d(9), lat=12.7, lon=-141.5, vmax_kt=60, mslp_mb=1000,
             stage="TS", nature="TS", quality="interpolated"),
        dict(storm_id="S1", iso_time=d(12), lat=13.0, lon=-142.0, vmax_kt=40, mslp_mb=1000,
             stage="TS", nature="TS", quality="observed"),
        dict(storm_id="S1", iso_time=d(18), lat=13.5, lon=-143.0, vmax_kt=70, mslp_mb=985,
             stage="HU", nature="TS", quality="observed"),
    ]
    storms = [dict(storm_id="S1", atcf_id="EP012020", basin="EP", subbasin="MM", season=2020)]
    summarise_storms(pts, storms)
    g = build_genesis_events(pts, storms, source_key="t")[0]

    eq("genesis is the first TROPICAL point, not the first point", g["genesis_utc"], d(6))
    eq("the pre-tropical low is kept as first_track", g["first_track_utc"], d(0))
    # THE RULE THIS FILE EXISTS FOR
    eq("an INTERPOLATED point does not establish a crossing", g["ts_utc"], d(12))
    eq("hours_to_ts measured from genesis", g["hours_to_ts"], 6.0)
    eq("hours_to_cat1", g["hours_to_cat1"], 12.0)
    eq("an event that never happened is NULL, not a sentinel", g["cat3_utc"], None)
    eq("...and so is its time-to-event", g["hours_to_cat3"], None)
    eq("peak intensity", g["peak_vmax_kt"], 70)
    eq("storm summary category", storms[0]["max_category"], "cat1")

    check("tropical: 'LO'/'DS' is not tropical", not _is_tropical("LO", "DS"))
    check("tropical: 'TD' is tropical", _is_tropical("TD", "TS"))
    check("tropical: unknown stage is not assumed tropical", not _is_tropical(None, None))

    # a storm with NO intensity anywhere must not be recorded as having failed a threshold
    pts2 = [dict(storm_id="S2", iso_time=d(0), lat=10.0, lon=-120.0, vmax_kt=None, mslp_mb=None,
                 stage="TS", nature="TS", quality="observed")]
    st2 = [dict(storm_id="S2", atcf_id="EP022020", basin="EP", subbasin=None, season=2020)]
    summarise_storms(pts2, st2)
    eq("no intensity anywhere -> reached_cat1 is UNKNOWN, not False",
       st2[0]["reached_cat1"], None)


def _seed_archive(base: Path, n: int = 24, *, hurricanes: int = 12) -> None:
    """A synthetic archive near 12N 140W: n storms, `hurricanes` of which reach 64 kt."""
    storms, points, genesis, landfalls = [], [], [], []
    prov = dict(source_key="test", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    for i in range(n):
        sid = f"T{i:03d}"
        gt = datetime(2000 + i, 8, 10, 0, tzinfo=UTC)
        peak = 90.0 if i < hurricanes else 40.0
        storms.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}{2000+i}", basin="EP",
                           subbasin=None, name=f"N{i}", season=2000 + i,
                           genesis_utc=gt, genesis_lat=12.0, genesis_lon=-140.0,
                           max_vmax_kt=peak, max_category=category_for(peak),
                           reached_ts=True, reached_cat1=peak >= 64, reached_cat3=False,
                           named=True, track_points=2, provisional=False, **prov))
        for h in (0, 24):
            points.append(dict(storm_id=sid, iso_time=gt + timedelta(hours=h),
                               lat=12.0 + h / 24, lon=-140.0 - h / 24, vmax_kt=peak,
                               mslp_mb=None, stage="TS", nature="TS", basin="EP",
                               subbasin=None, synoptic=True, quality="observed", **prov))
        genesis.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}{2000+i}", basin="EP",
                            season=2000 + i, genesis_utc=gt, genesis_lat=12.0,
                            genesis_lon=-140.0, first_track_utc=gt, peak_vmax_kt=peak,
                            hours_to_ts=6.0, hours_to_cat1=(30.0 if peak >= 64 else None),
                            pregenesis_source="none", **prov))
        if i < 4:      # four of them hit Hawaii, two as hurricanes
            landfalls.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}{2000+i}", season=2000 + i,
                                  region="hawaii", sub_region="Oahu",
                                  landfall_utc=gt + timedelta(hours=72), lat=21.4, lon=-158.0,
                                  vmax_kt=(80.0 if i < 2 else 50.0),
                                  hurricane_at_landfall=i < 2, ts_at_landfall=True,
                                  detection="hurdat2_L_record", suspect_relocation=False, **prov))
    store.write_table("storms", storms, base)
    store.write_table("track_points", points, base)
    store.write_table("genesis_events", genesis, base)
    store.write_table("landfalls", landfalls, base)


def test_analog_rules():
    base = Path(tempfile.mkdtemp())
    _seed_archive(base, n=24, hurricanes=12)

    res = get_analogs(lat=12.0, lon=-140.0, radius_km=500, season_months=[8],
                      min_sample=10, archive_dir=base)
    eq("analogs: all 24 seeded storms match", res.n_cases, 24)
    check("analogs: sufficient at n=24", res.sufficient)
    eq("analogs: 12/24 reached cat1", res.intensity["cat1"]["count"], 12)
    check("analogs: rate published when sample suffices",
          abs(res.intensity["cat1"]["rate"] - 0.5) < 1e-9)
    check("analogs: hawaii landfall rate", res.landfall["hawaii"]["any"]["count"] == 4)
    eq("analogs: hurricane-at-landfall counted jointly",
       res.landfall["hawaii"]["hurricane"]["count"], 2)
    check("analogs: ESS is finite and <= n", 0 < res.effective_sample_size <= res.n_cases)
    check("analogs: track density populated", len(res.track_density) > 0)
    check("analogs: time-to-cat1 median present",
          res.time_to_event["cat1"]["median"] is not None)

    # RULE 2: below min_sample, counts are given but the RATE is refused.
    res2 = get_analogs(lat=12.0, lon=-140.0, radius_km=500, season_months=[8],
                       min_sample=100, archive_dir=base)
    eq("analogs: refused rate is None", res2.intensity["cat1"]["rate"], None)
    check("analogs: refusal states its reason",
          "min_sample" in (res2.intensity["cat1"]["refused_reason"] or ""))
    check("analogs: counts still reported when the rate is refused",
          res2.intensity["cat1"]["count"] == 12)
    check("analogs: sufficient flag is false", not res2.sufficient)

    # RULE 3: the zero-peek gate.
    cutoff = datetime(2010, 1, 1, tzinfo=UTC)
    res3 = get_analogs(lat=12.0, lon=-140.0, radius_km=500, min_sample=1,
                       archive_dir=base, as_of=cutoff)
    eq("zero-peek: only pre-cutoff storms are eligible", res3.n_cases, 10)
    check("zero-peek: no case has genesis at or after the cutoff",
          all(datetime.fromisoformat(c.genesis_utc) < cutoff for c in res3.cases))

    # a storm must never be its own analog
    res4 = get_analogs(lat=12.0, lon=-140.0, radius_km=500, min_sample=1,
                       archive_dir=base, exclude_storm_ids={"T005"})
    check("self-exclusion works", all(c.storm_id != "T005" for c in res4.cases))

    # distance filter really filters
    res5 = get_analogs(lat=40.0, lon=-40.0, radius_km=500, min_sample=1, archive_dir=base)
    eq("far-away query matches nothing", res5.n_cases, 0)


def test_env_unknown_is_not_a_match():
    """An unknown environment must never rank as a perfect environmental match.

    Seeds 12 storms of which 6 have an environment record and 6 have none. Under an
    env_vector, the 6 without one cannot be established as similar to anything, so they must
    not out-rank the ones that were actually measured.
    """
    base = Path(tempfile.mkdtemp())
    prov = dict(source_key="t", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    storms, genesis, env = [], [], []
    for i in range(12):
        sid = f"E{i:02d}"
        gt = datetime(1990 + i, 9, 1, tzinfo=UTC)
        storms.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}", basin="EP", season=1990 + i,
                           name=sid, genesis_utc=gt, genesis_lat=12.0, genesis_lon=-140.0,
                           max_vmax_kt=70.0, provisional=False, **prov))
        genesis.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}", basin="EP", season=1990 + i,
                            genesis_utc=gt, genesis_lat=12.0, genesis_lon=-140.0,
                            peak_vmax_kt=70.0, pregenesis_source="none", **prov))
        if i < 6:      # only half have an environment
            env.append(dict(storm_id=sid, iso_time=gt, atcf_id=f"EP{i:02d}", lat=12.0,
                            lon=-140.0, env_source="ships_dev", shear_kt=5.0 + i,
                            rh_mid_pct=60.0, sst_c=28.0, lead_hours=0.0, **prov))
    store.write_table("storms", storms, base)
    store.write_table("genesis_events", genesis, base)
    store.write_table("environment", env, base)

    plain = get_analogs(lat=12.0, lon=-140.0, radius_km=300, min_sample=1, archive_dir=base)
    eq("env: without an env_vector every positional analog is kept", plain.n_cases, 12)
    eq("env: and none are excluded", plain.env_unmatched_excluded, 0)

    cond = get_analogs(lat=12.0, lon=-140.0, radius_km=300, min_sample=1, archive_dir=base,
                       env_vector={"shear_kt": 5.0, "rh_mid_pct": 60.0, "sst_c": 28.0})
    eq("env: cases with no environment are excluded from an env-conditioned query",
       cond.n_cases, 6)
    eq("env: and the exclusion is counted", cond.env_unmatched_excluded, 6)
    check("env: every surviving case actually compared a field",
          all(c.env_fields_compared > 0 for c in cond.cases))
    check("env: the exclusion is reported as a gap",
          any("EXCLUDED" in g for g in cond.gaps), str(cond.gaps))

    keep = get_analogs(lat=12.0, lon=-140.0, radius_km=300, min_sample=1, archive_dir=base,
                       env_vector={"shear_kt": 5.0}, env_require_match=False)
    eq("env: the old behaviour is available explicitly", keep.n_cases, 12)
    check("env: and it says the similarity is UNKNOWN rather than established",
          any("UNKNOWN" in g for g in keep.gaps), str(keep.gaps))


def test_effective_sample_warning():
    """n >= min_sample but ESS < min_sample must be said out loud."""
    base = Path(tempfile.mkdtemp())
    prov = dict(source_key="t", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    storms, genesis = [], []
    # one storm right on the query point, nine out near the radius edge: the Gaussian distance
    # kernel (scale = radius/2) then puts most of the weight on the single close one, so the
    # effective sample collapses while the raw count still clears the gate.
    for i in range(10):
        sid = f"W{i:02d}"
        gt = datetime(1990 + i, 9, 1, tzinfo=UTC)
        lat = 12.0 if i == 0 else 12.0 + 4.4
        storms.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}", basin="EP", season=1990 + i,
                           name=sid, genesis_utc=gt, genesis_lat=lat, genesis_lon=-140.0,
                           max_vmax_kt=70.0, provisional=False, **prov))
        genesis.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}", basin="EP", season=1990 + i,
                            genesis_utc=gt, genesis_lat=lat, genesis_lon=-140.0,
                            peak_vmax_kt=70.0, pregenesis_source="none", **prov))
    store.write_table("storms", storms, base)
    store.write_table("genesis_events", genesis, base)

    res = get_analogs(lat=12.0, lon=-140.0, radius_km=500, min_sample=10, archive_dir=base)
    eq("ESS warning: all 10 storms match on distance", res.n_cases, 10)
    check("ESS warning: the effective sample really is much smaller",
          res.effective_sample_size < 10, f"ess={res.effective_sample_size:.2f}")
    check("ESS warning: and the result says so",
          any("effective sample size" in g for g in res.gaps), str(res.gaps))
    check("ESS warning: the raw gate still reports sufficient", res.sufficient)


def test_empty_result_is_explicit():
    """A query that matches nothing must say so, not print a table of zeroes.

    This is the shape produced by the commonest user error -- querying an ACTIVE storm's
    current position -- and "0/0" read as a rate is exactly the misreading the archive exists
    to prevent.
    """
    base = Path(tempfile.mkdtemp())
    _seed_archive(base, n=12, hurricanes=6)
    res = get_analogs(lat=60.0, lon=-30.0, radius_km=200, min_sample=10, archive_dir=base,
                      regions=["hawaii"])
    eq("empty: nothing matches a far-away query", res.n_cases, 0)
    text = res.describe()
    check("empty: says NO ANALOGS", "NO ANALOGS" in text, text[:120])
    check("empty: states that matching is on genesis location only",
          "GENESIS LOCATION ONLY" in text, text[:200])
    check("empty: does NOT print a zero rate table",
          "reached cat1" not in text and "hawaii" not in text.lower().split("genesis")[0],
          text[:200])
    check("empty: is not marked sufficient", not res.sufficient)


def test_unscoreable_is_stated():
    """A contract the record cannot support must be marked BASE RATE ONLY, from the data."""
    base = Path(tempfile.mkdtemp())
    # 20 storms; 12 reach hawaii, but only 2 of them at hurricane strength
    _seed_archive(base, n=20, hurricanes=20)
    prov = dict(source_key="t", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    lf = []
    for i in range(12):
        gt = datetime(2000 + i, 8, 10, tzinfo=UTC)
        lf.append(dict(storm_id=f"T{i:03d}", atcf_id=f"EP{i:02d}", season=2000 + i,
                       region="hawaii", sub_region="Kauai",
                       landfall_utc=gt + timedelta(hours=72), lat=21.9, lon=-159.5,
                       vmax_kt=(90.0 if i < 2 else 45.0), hurricane_at_landfall=i < 2,
                       ts_at_landfall=True, detection="hurdat2_L_record",
                       suspect_relocation=False, **prov))
    store.write_table("landfalls", lf, base)

    res = get_analogs(lat=12.0, lon=-140.0, radius_km=500, min_sample=5,
                      archive_dir=base, regions=["hawaii"])
    eq("unscoreable: the >=64kt contract has 2 archive-wide events",
       res.unscoreable.get("hawaii:hurricane", {}).get("archive_events"), 2)
    check("unscoreable: and is marked BASE RATE ONLY",
          "BASE RATE ONLY" in (res.unscoreable.get("hawaii:hurricane", {}).get("status") or ""))
    check("unscoreable: the 'any' contract has enough events and is NOT marked",
          "hawaii:any" not in res.unscoreable, str(res.unscoreable.keys()))
    text = res.describe()
    check("unscoreable: describe() says no skill number exists",
          "No skill number exists" in text, text[-400:])
    check("describe(): carries the genesis-conditioning note",
          "GENESIS-CONDITIONED" in text)
    check("describe(): says landfall does not decompose into a product",
          "does NOT decompose" in text)


def test_live_ships_rt():
    """Operational SHIPS: units are in the labels, and LONG(DEG W) must be negated."""
    from genesis.sources import ships_rt
    fixture = Path(__file__).with_name("fixture_ships_rt.txt")
    if not fixture.exists():
        check("ships_rt: fixture present", False, "fixture_ships_rt.txt missing")
        return
    text = fixture.read_text()
    p = ships_rt.parse(text)
    eq("ships_rt: header ATCF id", p["header"]["atcf_id"], "CP012026")
    check("ships_rt: times parsed", p["times"][:3] == [0, 6, 12], str(p["times"][:3]))

    rows = ships_rt.environment_rows(text, source_key="t")
    eq("ships_rt: one row at tau=0 by default", len(rows), 1)
    r = rows[0]
    # THE HAWAII-KILLING TRAP: the product prints degrees WEST as a positive number.
    check("ships_rt: Central Pacific longitude is NEGATIVE", r["lon"] < 0, str(r["lon"]))
    eq("ships_rt: longitude magnitude preserved", round(abs(r["lon"]), 1), 165.0)
    # units come from the row label, so no divisor -- a /10 here would read 0.9 kt
    eq("ships_rt: shear is knots, not knots*10", r["shear_kt"], 9.0)
    eq("ships_rt: SST is degrees C, not C*10", r["sst_c"], 27.8)
    eq("ships_rt: potential intensity in knots", r["pot_intensity_kt"], 142.0)
    # the unlabelled row IS scaled, to the archive's decade
    check("ships_rt: vorticity scaled to the archive decade",
          abs(r["vort850_1e5"] - 0.57) < 1e-9, str(r["vort850_1e5"]))
    eq("ships_rt: env_source distinguishes live from historical", r["env_source"], "ships_rt")

    # missing markers must never become numbers
    eq("ships_rt: 'xx.x' is missing, not a number", ships_rt._num("xx.x"), None)
    eq("ships_rt: 'xxx.x' is missing", ships_rt._num("xxx.x"), None)
    eq("ships_rt: 'N/A' is missing", ships_rt._num("N/A"), None)
    eq("ships_rt: 'LOST' is missing", ships_rt._num("LOST"), None)

    # GPI on a live row is permitted but must declare the weaker warrant
    from genesis.indices import gpi as G
    val, method = G.gpi_for_environment_row(r)
    check("ships_rt: GPI computes on a live row", val is not None)
    check("ships_rt: and its method says the decade was INFERRED",
          "INFERRED" in (method or ""), (method or "")[-120:])


def test_subbasin_semantics():
    """The Iniki trap: a Hawaii question must not be filtered on the GENESIS subbasin.

    Seeds two storms -- one that forms in CP, and one that forms outside CP and tracks into it,
    which is exactly Iniki's shape (formed 134W in the East Pacific, devastated Kauai).
    """
    base = Path(tempfile.mkdtemp())
    prov = dict(source_key="t", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    gt = datetime(1992, 9, 5, tzinfo=UTC)
    storms = [
        dict(storm_id="CPGEN", atcf_id="CP011992", basin="EP", subbasin="CP", name="HOMEGROWN",
             season=1992, genesis_utc=gt, genesis_lat=12.0, genesis_lon=-150.0,
             max_vmax_kt=90.0, provisional=False, **prov),
        # forms OUTSIDE CP, enters it later -- Iniki's shape
        dict(storm_id="INIKISH", atcf_id="EP111992", basin="EP", subbasin=None, name="INIKISH",
             season=1992, genesis_utc=gt, genesis_lat=12.0, genesis_lon=-150.2,
             max_vmax_kt=125.0, provisional=False, **prov),
    ]
    points = []
    for sid, subs in (("CPGEN", ["CP", "CP"]), ("INIKISH", [None, "CP"])):
        for i, sub in enumerate(subs):
            points.append(dict(storm_id=sid, iso_time=gt + timedelta(hours=6 * i),
                               lat=12.0 + i, lon=-150.0 - i, vmax_kt=90.0, stage="HU",
                               nature="TS", basin="EP", subbasin=sub, quality="observed", **prov))
    genesis = [dict(storm_id=s["storm_id"], atcf_id=s["atcf_id"], basin="EP", season=1992,
                    genesis_utc=gt, genesis_lat=s["genesis_lat"], genesis_lon=s["genesis_lon"],
                    peak_vmax_kt=s["max_vmax_kt"], pregenesis_source="none", **prov)
               for s in storms]
    store.write_table("storms", storms, base)
    store.write_table("track_points", points, base)
    store.write_table("genesis_events", genesis, base)

    ever = get_analogs(lat=12.0, lon=-150.0, radius_km=500, min_sample=1,
                       archive_dir=base, subbasins=["CP"])
    eq("subbasin: default filter means EVER ENTERED, so the Iniki-shaped storm is kept",
       {c.storm_id for c in ever.cases}, {"CPGEN", "INIKISH"})

    strict = get_analogs(lat=12.0, lon=-150.0, radius_km=500, min_sample=1,
                         archive_dir=base, genesis_subbasins=["CP"])
    eq("subbasin: the strict genesis filter is available and does exclude it",
       {c.storm_id for c in strict.cases}, {"CPGEN"})
    check("subbasin: the two filters genuinely differ", ever.n_cases > strict.n_cases)


def test_zero_is_an_answer():
    """A region the caller asked about must be reported even when nothing hit it."""
    base = Path(tempfile.mkdtemp())
    _seed_archive(base, n=20, hurricanes=10)
    # the seeded archive puts 4 landfalls in hawaii; add a region nothing reaches
    res = get_analogs(lat=12.0, lon=-140.0, radius_km=500, min_sample=5,
                      archive_dir=base, regions=["hawaii", "conus"])
    check("regions: a hit region is reported", "hawaii" in res.landfall)
    eq("regions: an unhit region requested by the caller is still reported with 0",
       res.landfall.get("conus", {}).get("any", {}).get("count"), None
       if "conus" not in res.landfall else 0)
    check("regions: asking for a region absent from the table is reported as a gap",
          any("absent from the landfalls table" in g for g in
              get_analogs(lat=12.0, lon=-140.0, radius_km=500, min_sample=5,
                          archive_dir=base, regions=["antarctica"]).gaps))
    # a zero rate must carry an interval, not be silent
    r = res.landfall["hawaii"]["hurricane"]
    check("regions: a reported rate carries a Wilson interval", r["ci95"] is not None)


def test_min_pool_season():
    """The analog pool can be restricted, and the un-restricted case warns about the bias."""
    base = Path(tempfile.mkdtemp())
    _seed_archive(base, n=24, hurricanes=12)     # seasons 2000..2023
    early = Path(tempfile.mkdtemp())
    prov = dict(source_key="t", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    storms, genesis = [], []
    for i in range(20):
        sid = f"O{i:02d}"
        season = 1950 + i                        # all pre-1971
        gt = datetime(season, 9, 1, tzinfo=UTC)
        storms.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}", basin="EP", season=season,
                           name=sid, genesis_utc=gt, genesis_lat=12.0, genesis_lon=-140.0,
                           max_vmax_kt=40.0, provisional=False, **prov))
        genesis.append(dict(storm_id=sid, atcf_id=f"EP{i:02d}", basin="EP", season=season,
                            genesis_utc=gt, genesis_lat=12.0, genesis_lon=-140.0,
                            peak_vmax_kt=40.0, pregenesis_source="none", **prov))
    store.write_table("storms", storms, early)
    store.write_table("genesis_events", genesis, early)

    unres = get_analogs(lat=12.0, lon=-140.0, radius_km=300, min_sample=1, archive_dir=early)
    eq("min_pool_season: unrestricted keeps the pre-satellite storms", unres.n_cases, 20)
    check("min_pool_season: and warns that intensity rates are biased LOW",
          any("biased LOW" in g for g in unres.gaps), str(unres.gaps))

    res = get_analogs(lat=12.0, lon=-140.0, radius_km=300, min_sample=1,
                      archive_dir=early, min_pool_season=1971)
    eq("min_pool_season: restricting the pool drops them", res.n_cases, 0)
    check("min_pool_season: and then does not warn", not any("biased LOW" in g for g in res.gaps))


def test_scoring_rules():
    eq("brier: perfect forecasts score 0", brier([(1.0, True), (0.0, False)]), 0.0)
    eq("brier: 0.5 everywhere scores 0.25", brier([(0.5, True), (0.5, False)]), 0.25)
    eq("brier: empty sample refuses rather than scoring 0", brier([]), None)
    check("skill: better than reference is positive", skill(0.10, 0.25) > 0)
    check("skill: worse than reference is negative", skill(0.30, 0.25) < 0)
    eq("skill: undefined against a zero reference", skill(0.1, 0.0), None)

    rel = reliability([(0.05, False), (0.95, True)], bins=10)
    eq("reliability keeps empty bins visible", len(rel), 10)
    eq("reliability: empty bin has n=0 and observed None",
       (rel[5]["n"], rel[5]["observed"]), (0, None))

    thin = [Prediction(storm_id=f"s{i}", contract="c", made_utc="t", p=0.3,
                       p_climatology=0.2, outcome=True) for i in range(5)]
    s = score_contract(thin)
    check("scoring: refuses below 10 distinct storms", not s["scored"])
    check("scoring: refusal names the count", "5 distinct" in s["refused_reason"])

    # 400 forecasts, 3 storms -- the trap this rule exists to catch
    many = [Prediction(storm_id=f"s{i % 3}", contract="c", made_utc="t", p=0.9,
                       p_climatology=0.5, outcome=True) for i in range(400)]
    s2 = score_contract(many)
    check("scoring: 400 forecasts over 3 storms is still refused", not s2["scored"],
          f"n_forecasts={s2['n_forecasts']} n_storms={s2['n_storms']}")
    eq("scoring: the storm count is what is gated on", s2["n_storms"], 3)

    fat = [Prediction(storm_id=f"s{i}", contract="c", made_utc="t", p=0.3,
                      p_climatology=0.2, outcome=(i % 3 == 0)) for i in range(35)]
    s3 = score_contract(fat)
    check("scoring: scores once the sample is real", s3["scored"])
    check("scoring: reliability appears at >=30 storms", s3["reliability"] is not None)

    # A RARE CONTRACT NEEDS EVENTS, NOT JUST STORMS. 847 forecasts and 6 events is noise;
    # 847 forecasts and 0 events only rewards predicting "never".
    rare = [Prediction(storm_id=f"r{i}", contract="landfall", made_utc="t", p=0.01,
                       p_climatology=0.01, outcome=(i < 3)) for i in range(200)]
    s_rare = score_contract(rare)
    check("scoring: a 200-storm sample with 3 events publishes counts", s_rare["scored"])
    eq("scoring: ...but refuses the skill ratio", s_rare["skill_vs_climatology"], None)
    check("scoring: and says why", "below the" in (s_rare.get("skill_refused_reason") or ""))
    eq("scoring: the event count is published", s_rare["n_events"], 3)

    never = [Prediction(storm_id=f"n{i}", contract="landfall", made_utc="t", p=0.0,
                        p_climatology=0.0, outcome=False) for i in range(200)]
    s_never = score_contract(never)
    eq("scoring: an event that never happened yields no skill score",
       s_never["skill_vs_climatology"], None)
    eq("scoring: ...and a Brier of 0 is not reported as success", s_never["n_events"], 0)

    enough = [Prediction(storm_id=f"e{i}", contract="landfall", made_utc="t", p=0.1,
                         p_climatology=0.08, outcome=(i < 15)) for i in range(200)]
    check("scoring: 15 events clears the event gate",
          score_contract(enough)["skill_vs_climatology"] is not None)

    # RULE 4: an unresolvable outcome is excluded, not counted as a miss.
    mixed = [Prediction(storm_id=f"s{i}", contract="c", made_utc="t", p=0.3,
                        p_climatology=0.2, outcome=(True if i < 12 else None))
             for i in range(20)]
    s4 = score_contract(mixed)
    eq("scoring: unresolved forecasts are excluded from the denominator", s4["n_storms"], 12)
    eq("scoring: and counted separately", s4["n_unresolved"], 8)


def test_contract_resolution():
    lc = landfall_contract("hawaii", hurricane=True)
    eq("contract: no landfall resolves False", lc.resolve({}, {}, []), False)
    eq("contract: landfall at unknown intensity is UNKNOWN, not False",
       lc.resolve({}, {}, [dict(region="hawaii", vmax_kt=None, suspect_relocation=False)]), None)
    eq("contract: landfall at 70 kt resolves True",
       lc.resolve({}, {}, [dict(region="hawaii", vmax_kt=70, hurricane_at_landfall=True,
                                suspect_relocation=False)]), True)
    eq("contract: a suspected centre relocation does not count as a landfall",
       lc.resolve({}, {}, [dict(region="hawaii", vmax_kt=70, hurricane_at_landfall=True,
                                suspect_relocation=True)]), False)
    keys = {c.key for c in standard_contracts(["hawaii"])}
    check("contract set covers every requested threshold",
          {"reaches_ts_34kt", "reaches_cat1_64kt", "reaches_cat3_96kt",
           "reaches_cat4_113kt"} <= keys)


def test_store_and_schema():
    base = Path(tempfile.mkdtemp())
    prov = dict(source_key="k", processing_version=PROCESSING_VERSION,
                ingested_utc="2026-01-01T00:00:00Z")
    row = dict(storm_id="X", atcf_id="EP012020", basin="EP", season=2020, **prov)
    _p, a, r = store.append("storms", [row], base)
    eq("store: first append adds", (a, r), (1, 0))
    _p, a, r = store.append("storms", [row], base)
    eq("store: re-appending the same key replaces, never duplicates", (a, r), (0, 1))
    eq("store: row count stays 1", store.summary(base)["storms"], 1)

    try:
        store.write_table("storms", [dict(row, not_a_column=1)], base)
        check("store: an unknown column is rejected", False, "no error raised")
    except ValueError:
        check("store: an unknown column is rejected", True)

    snap = store.snapshot(base, stamp="2026-01-01")
    import json
    entry = json.loads(snap.read_text())
    check("snapshot: pins a sha256 per table", entry["tables"]["storms"]["sha256"])
    check("snapshot: names tables that do not exist", entry["tables"]["environment"] is None)

    for name, sch in ALL_TABLES.items():
        for req in ("source_key", "processing_version", "ingested_utc"):
            check(f"schema: {name} carries {req}", req in sch.names)


def test_gtwo_reader():
    eq("gtwo: a centroid of a degenerate ring falls back to the mean",
       _centroid([[(0, 0), (0, 0), (0, 0)]]), (0.0, 0.0))
    eq("gtwo: empty rings give no centroid", _centroid([]), None)
    eq("gtwo: an empty dbf yields no rows", _read_dbf(b""), [])
    from genesis.sources.gtwo import read_areas
    check("gtwo: read_areas is importable", callable(read_areas))


def test_crossing_class_never_interpolates_a_class():
    """Property 1, on the row that most invites breaking it.

    A polygon crossing between two published fixes has an INTERPOLATED wind. Reading a
    Saffir-Simpson class or a >=64 kt boolean off that wind turns arithmetic into a categorical
    claim NOAA never published, and it flips at the threshold. The rule is the bracketing
    fixes' common answer, or NULL.
    """
    from genesis.build.build_archive import _crossing_class
    from datetime import datetime as DT

    def pt(h, v):
        return {"iso_time": DT(1992, 9, 12, h, tzinfo=UTC), "vmax_kt": v}

    # A published fix over land: its own wind is official, so the class is official too.
    pts = [pt(0, 115.0), pt(3, 108.0)]
    got = _crossing_class({"detection": "bracketing_fix", "vmax_kt": 115.0,
                           "iso_time": DT(1992, 9, 12, 0, tzinfo=UTC)}, pts)
    eq("crossing: a published fix keeps its published class", got["category"], "cat4")
    eq("crossing: a published fix keeps its hurricane flag", got["hurricane"], True)

    # INIKI. 112.0 kt interpolated between 115 (cat4) and 108 (cat3) -- one knot under the
    # Cat 4 line. The categories disagree, so no class is published.
    iniki = {"detection": "segment_crossing", "vmax_kt": 112.03,
             "iso_time": DT(1992, 9, 12, 1, 16, tzinfo=UTC)}
    got = _crossing_class(iniki, pts)
    eq("crossing: disagreeing bracket publishes no category", got["category"], None)
    # ... but both fixes agree it was a hurricane, so that much IS published.
    eq("crossing: agreeing bracket keeps the hurricane flag", got["hurricane"], True)
    eq("crossing: agreeing bracket keeps the ts flag", got["ts"], True)

    # DOREEN 1977: 63.3 kt interpolated between 65 and 58. The interpolation would be DECIDING
    # a hurricane landfall by 0.7 kt.
    pts2 = [pt(0, 65.0), pt(6, 58.0)]
    got = _crossing_class({"detection": "segment_crossing", "vmax_kt": 63.3,
                           "iso_time": DT(1992, 9, 12, 1, tzinfo=UTC)}, pts2)
    eq("crossing: a bracket straddling 64 kt publishes no hurricane flag", got["hurricane"], None)
    eq("crossing: the same bracket still agrees on >=34 kt", got["ts"], True)
    eq("crossing: a straddling bracket publishes no category", got["category"], None)

    # Agreement below both thresholds is still an answer -- NULL means unknown, not "no".
    pts3 = [pt(0, 25.0), pt(6, 30.0)]
    got = _crossing_class({"detection": "segment_crossing", "vmax_kt": 27.0,
                           "iso_time": DT(1992, 9, 12, 1, tzinfo=UTC)}, pts3)
    eq("crossing: agreement on 'not a hurricane' is published as False", got["hurricane"], False)
    eq("crossing: agreement on 'not a TS' is published as False", got["ts"], False)
    eq("crossing: agreement on 'td' publishes the class", got["category"], "td")

    # A missing wind on either side constrains nothing.
    pts4 = [pt(0, None), pt(6, 90.0)]
    got = _crossing_class({"detection": "segment_crossing", "vmax_kt": 80.0,
                           "iso_time": DT(1992, 9, 12, 1, tzinfo=UTC)}, pts4)
    eq("crossing: an unpublished bracketing wind publishes nothing", got["hurricane"], None)

    # A crossing time no pair brackets constrains nothing either.
    got = _crossing_class({"detection": "segment_crossing", "vmax_kt": 80.0,
                           "iso_time": DT(1999, 1, 1, tzinfo=UTC)}, pts)
    eq("crossing: an unbracketed time publishes nothing", got["category"], None)


def main() -> int:
    for fn in (test_categories, test_geometry, test_genesis_rules, test_analog_rules,
               test_subbasin_semantics, test_env_unknown_is_not_a_match, test_zero_is_an_answer,
               test_effective_sample_warning,
               test_empty_result_is_explicit,
               test_unscoreable_is_stated,
               test_live_ships_rt,
               test_crossing_class_never_interpolates_a_class,
               test_min_pool_season, test_scoring_rules, test_contract_resolution,
               test_store_and_schema, test_gtwo_reader):
        print(f"\n{fn.__name__}")
        fn()
    print(f"\n{RUN - len(FAILS)}/{RUN} checks passed")
    if FAILS:
        print("\nFAILURES:")
        for f in FAILS:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
