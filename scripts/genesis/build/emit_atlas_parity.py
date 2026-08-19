"""Canonical test vectors: what the archive's own Python answers, for the browser to reproduce.

THE PROBLEM THIS SOLVES. docs/GENESIS-ARCHIVE.md states the rule that made the terminal's
Analog Prior panel trustworthy: "Nothing is recomputed in the browser, so there is no second
implementation of any rate to drift from this one." The Storm Atlas cannot honour that rule
literally -- a click anywhere on the ocean, at any radius, over any month range, is not a
question a precomputed payload can answer -- so it honours the rule's PURPOSE instead. There is
still exactly one methodology. It simply has two execution surfaces now, and this file is the
evidence that they agree.

WHAT IS COMPARED, AND WHY THE ANSWER IS NOT "EVERYTHING, EXACTLY".
Almost everything is compared exactly, because almost everything is discrete or is computed
from operations IEEE-754 specifies exactly: the matched storm set and its order, every count,
every gap string, the sample gate, the pathway-density cells, and every archive value carried
through untouched.

The exception is the weighting, which goes through exp(), sin(), cos() and asin(). Those are
NOT specified exactly by IEEE-754: CPython calls the platform libm and V8 calls its own port of
fdlibm, and the two are free to differ in the last bit. So `distance_km`, the three weights and
the effective sample size are compared to an explicit relative tolerance, and the test reports
the deviation it actually measured rather than merely asserting a bound nobody has looked at.
That is what "exact or explicitly tolerance-bounded parity" has to mean to be worth anything.

THE MATRIX IS NOT A HAPPY PATH. Every case below is here because it exercises a branch that
could be got wrong silently: the antimeridian, an empty pool, a pool small enough to fail the
gate, the pre-1971 bias warning, the environment exclusion in both directions, the zero-peek
cutoff, and the difference between "formed in this subbasin" and "was ever in it" -- the
distinction that keeps Iniki in a Hawaii query.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from ..provenance import ARCHIVE_DIR, METHODOLOGY_VERSION, PROCESSING_VERSION, REPO_ROOT
from ..retrieval.analogs import get_analogs

# NOT a committed fixture. These vectors are a function of the archive, and the archive is
# rebuilt four times a day -- committing them would put a multi-megabyte churn into git for no
# gain, and would test whatever the archive looked like when someone last remembered to
# regenerate. The parity test generates them from the CURRENT archive on every run instead,
# which is both smaller and stricter.
OUT_PATH = REPO_ROOT / ".atlas-build" / "atlas-parity.json"

# Each entry: a label saying what it is for, and the kwargs get_analogs is called with.
MATRIX = [
    ("dense east pacific pool, peak season",
     dict(lat=14.9, lon=-145.0, radius_km=500.0, season_months=[7, 8, 9],
          min_pool_season=1971, regions=["hawaii", "mexico", "conus"])),
    ("the same pool with the pre-1971 seasons left in -- must emit the bias gap",
     dict(lat=14.9, lon=-145.0, radius_km=500.0, season_months=[7, 8, 9],
          regions=["hawaii", "mexico", "conus"])),
    ("no month filter at all",
     dict(lat=14.9, lon=-145.0, radius_km=500.0, min_pool_season=1971)),
    ("the main east pacific development region, wide radius",
     dict(lat=12.0, lon=-105.0, radius_km=800.0, min_pool_season=1971,
          regions=["mexico", "conus"])),
    ("tight radius over the same point -- a small pool that still clears the gate",
     dict(lat=12.0, lon=-105.0, radius_km=200.0, min_pool_season=1971)),
    ("radius so tight the pool falls below min_sample",
     dict(lat=12.0, lon=-105.0, radius_km=40.0, min_pool_season=1971)),
    ("a point with no genesis anywhere near it -- the empty pool",
     dict(lat=0.5, lon=-30.0, radius_km=100.0)),
    ("mid-Atlantic, where the sample is Atlantic rather than east Pacific",
     dict(lat=15.0, lon=-45.0, radius_km=600.0, min_pool_season=1971,
          regions=["conus", "caribbean"])),
    ("gulf of Mexico",
     dict(lat=25.0, lon=-90.0, radius_km=500.0, min_pool_season=1971, regions=["conus"])),
    ("cape verde",
     dict(lat=13.0, lon=-25.0, radius_km=500.0, min_pool_season=1971)),
    ("central pacific, near the dateline -- exercises the antimeridian",
     dict(lat=15.0, lon=179.5, radius_km=900.0)),
    ("the other side of the antimeridian, same neighbourhood",
     dict(lat=15.0, lon=-179.5, radius_km=900.0)),
    ("hawaii approach box -- the sparse case the archive refuses to score",
     dict(lat=18.0, lon=-150.0, radius_km=500.0, regions=["hawaii"])),
    ("hawaii, restricted to storms that ever ENTERED the central pacific",
     dict(lat=15.0, lon=-140.0, radius_km=900.0, subbasins=["CP"], regions=["hawaii"])),
    ("hawaii, restricted to storms that FORMED in the central pacific -- the wrong filter, "
     "kept as a vector precisely because it must differ from the one above",
     dict(lat=15.0, lon=-140.0, radius_km=900.0, genesis_subbasins=["CP"], regions=["hawaii"])),
    ("basin filter, east pacific only",
     dict(lat=14.0, lon=-110.0, radius_km=700.0, basins=["EP"], min_pool_season=1971)),
    ("basin filter, north atlantic only, over a point both basins reach",
     dict(lat=14.0, lon=-90.0, radius_km=700.0, basins=["NA"], min_pool_season=1971)),
    ("a region that does not exist in the landfalls table",
     dict(lat=14.9, lon=-145.0, radius_km=500.0, regions=["hawaii", "atlantis"])),
    ("provisional seasons included",
     dict(lat=14.0, lon=-105.0, radius_km=600.0, include_provisional=True,
          min_pool_season=1971)),
    ("provisional seasons excluded (the default), same query",
     dict(lat=14.0, lon=-105.0, radius_km=600.0, min_pool_season=1971)),
    ("zero-peek: as_of 2000, so nothing from 2000 onwards may appear",
     dict(lat=14.0, lon=-105.0, radius_km=600.0,
          as_of=datetime(2000, 1, 1, tzinfo=timezone.utc), min_pool_season=1971)),
    ("zero-peek: as_of 1985, a much thinner record",
     dict(lat=14.0, lon=-105.0, radius_km=600.0,
          as_of=datetime(1985, 1, 1, tzinfo=timezone.utc))),
    ("zero-peek: as_of before the archive begins -- nothing is eligible",
     dict(lat=14.0, lon=-105.0, radius_km=600.0,
          as_of=datetime(1800, 1, 1, tzinfo=timezone.utc))),
    ("max_cases truncation after the weight sort",
     dict(lat=12.0, lon=-105.0, radius_km=800.0, max_cases=25, min_pool_season=1971)),
    ("a single excluded storm -- the harness's self-exclusion path",
     dict(lat=12.0, lon=-105.0, radius_km=800.0, min_pool_season=1971,
          exclude_storm_ids={"1994253N12242"})),
    ("september only",
     dict(lat=12.0, lon=-105.0, radius_km=600.0, season_months=[9], min_pool_season=1971)),
    ("the shoulder months, where the sample thins",
     dict(lat=12.0, lon=-105.0, radius_km=600.0, season_months=[5, 11], min_pool_season=1971)),
    ("every month named explicitly -- must equal no filter at all",
     dict(lat=12.0, lon=-105.0, radius_km=600.0, season_months=list(range(1, 13)),
          min_pool_season=1971)),
    ("pathway density at 1 degree",
     dict(lat=12.0, lon=-105.0, radius_km=500.0, min_pool_season=1971, track_density_deg=1.0)),
    ("pathway density at 5 degrees",
     dict(lat=12.0, lon=-105.0, radius_km=500.0, min_pool_season=1971, track_density_deg=5.0)),
    ("environment conditioning, a plausible east pacific vector",
     dict(lat=14.0, lon=-110.0, radius_km=600.0, min_pool_season=1971,
          env_vector={"shear_kt": 10.0, "sst_c": 28.5, "rh_mid_pct": 55.0})),
    ("the same, keeping the unmatched cases at a neutral weight instead of excluding them",
     dict(lat=14.0, lon=-110.0, radius_km=600.0, min_pool_season=1971,
          env_require_match=False,
          env_vector={"shear_kt": 10.0, "sst_c": 28.5, "rh_mid_pct": 55.0})),
    ("environment conditioning on all seven fields",
     dict(lat=14.0, lon=-110.0, radius_km=600.0, min_pool_season=1971,
          env_vector={"shear_kt": 12.0, "sst_c": 28.0, "rh_mid_pct": 50.0, "gpi": 8.0,
                      "ohc_kj_cm2": 40.0, "pot_intensity_kt": 140.0, "vort850_1e5": 1.2})),
    ("environment conditioning with a key the archive does not have",
     dict(lat=14.0, lon=-110.0, radius_km=600.0, min_pool_season=1971,
          env_vector={"shear_kt": 10.0, "unicorn_index": 3.0})),
    ("environment conditioning over a pre-SHIPS era, where nothing can match",
     dict(lat=14.0, lon=-110.0, radius_km=600.0,
          as_of=datetime(1975, 1, 1, tzinfo=timezone.utc),
          env_vector={"shear_kt": 10.0, "sst_c": 28.5})),
    ("a hostile environment vector -- far from anything the archive holds",
     dict(lat=14.0, lon=-110.0, radius_km=600.0, min_pool_season=1971,
          env_vector={"shear_kt": 60.0, "sst_c": 20.0})),
    ("weighting concentrated enough to trip the effective-sample-size warning",
     dict(lat=14.0, lon=-110.0, radius_km=1500.0, min_pool_season=1971,
          env_vector={"shear_kt": 45.0, "sst_c": 22.0})),
    ("a very large radius, so the pool is most of a basin",
     dict(lat=15.0, lon=-120.0, radius_km=2500.0, min_pool_season=1971)),
    ("min_sample raised above the pool",
     dict(lat=12.0, lon=-105.0, radius_km=300.0, min_sample=500, min_pool_season=1971)),
    ("min_sample of one",
     dict(lat=12.0, lon=-105.0, radius_km=300.0, min_sample=1, min_pool_season=1971)),
    ("the southern edge of the record",
     dict(lat=6.0, lon=-95.0, radius_km=400.0, min_pool_season=1971)),
    ("the northern edge, where genesis is rare",
     dict(lat=40.0, lon=-60.0, radius_km=500.0, min_pool_season=1971)),
]


def _case(c) -> dict:
    return {
        "storm_id": c.storm_id, "name": c.name, "season": c.season,
        "basin": c.basin, "subbasin": c.subbasin,
        "genesis_utc": c.genesis_utc, "genesis_lat": c.genesis_lat,
        "genesis_lon": c.genesis_lon, "genesis_month": c.genesis_month,
        "distance_km": c.distance_km, "weight": c.weight,
        "weight_distance": c.weight_distance, "weight_env": c.weight_env,
        "env_fields_compared": c.env_fields_compared,
        "peak_vmax_kt": c.peak_vmax_kt, "max_category": c.max_category,
        "hours_to_ts": c.hours_to_ts, "hours_to_cat1": c.hours_to_cat1,
        "hours_to_cat3": c.hours_to_cat3,
        "landfalls": [{"region": l["region"], "sub_region": l["sub_region"],
                       "landfall_utc": l["landfall_utc"], "vmax_kt": l["vmax_kt"],
                       "category": l["category"], "hurricane": l["hurricane"],
                       "detection": l["detection"],
                       "suspect_relocation": l["suspect_relocation"]}
                      for l in c.landfalls],
    }


def _kwargs_json(kw: dict) -> dict:
    out = {}
    for k, v in kw.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat().replace("+00:00", "Z")
        elif isinstance(v, set):
            out[k] = sorted(v)
        else:
            out[k] = v
    return out


def build(archive_dir: Path | None = None) -> dict:
    base = archive_dir or ARCHIVE_DIR
    vectors = []
    for label, kw in MATRIX:
        r = get_analogs(archive_dir=base, **kw)
        vectors.append({
            "label": label,
            "kwargs": _kwargs_json(kw),
            "expect": {
                "n_cases": r.n_cases,
                # Only the counting half. The rate, the weighted rate and the interval are not
                # compared because the browser does not compute them -- it returns
                # UNSCOREABLE -- REQUIRES CANONICAL COMPUTATION instead. What IS compared is
                # every numerator, every denominator and every unknown, because the archive
                # publishes those unconditionally and so does the Atlas.
                "intensity_counts": {
                    k: {"count": v["count"], "n_storms": v["n_storms"],
                        "n_unknown": v["n_unknown"]}
                    for k, v in r.intensity.items()
                },
                "landfall_counts": {
                    region: {kind: {"count": cell["count"], "n_storms": cell["n_storms"],
                                    "n_unknown": cell["n_unknown"]}
                             for kind, cell in by_kind.items()}
                    for region, by_kind in r.landfall.items()
                },
                "unscoreable": r.unscoreable,
                "env_unmatched_excluded": r.env_unmatched_excluded,
                "effective_sample_size": r.effective_sample_size,
                "sufficient": r.sufficient,
                "min_sample": r.min_sample,
                "gaps": list(r.gaps),
                "track_density": r.track_density,
                "cases": [_case(c) for c in r.cases],
            },
        })
    return {
        "methodology_version": METHODOLOGY_VERSION,
        "processing_version": PROCESSING_VERSION,
        "generator": "scripts/genesis/build/emit_atlas_parity.py",
        "authority": ("scripts/genesis/retrieval/analogs.py -- these are ITS answers. The "
                      "browser reproduces them; it does not define them."),
        "vectors": vectors,
    }


def write(payload: dict, path: Path | None = None) -> Path:
    out = path or OUT_PATH
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1, sort_keys=True) + "\n")
    return out
