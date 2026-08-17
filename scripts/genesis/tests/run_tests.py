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


def main() -> int:
    for fn in (test_categories, test_geometry, test_genesis_rules, test_analog_rules,
               test_scoring_rules, test_contract_resolution, test_store_and_schema,
               test_gtwo_reader):
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
