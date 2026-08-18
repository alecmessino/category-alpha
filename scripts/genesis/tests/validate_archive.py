"""Physical and referential validation of a BUILT archive.

run_tests.py proves the rules hold on fixtures. This proves they held on the real data, which
is a different question: a parser can satisfy every unit test and still put a longitude in the
wrong hemisphere for one era, or emit a 400 kt wind from a column that shifted in 1998.

It is a REPORT, not a gate, for one deliberate reason: official best-track data legitimately
contains values that look wrong. Refusing to build because NOAA published something surprising
would make the archive less faithful, not more. So every finding prints with the rows that
produced it, and the operator decides. `--strict` turns findings into a non-zero exit for use
in CI once a baseline is agreed.

    python3 scripts/genesis/tests/validate_archive.py [--archive-dir DIR] [--strict]
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from genesis.provenance import ARCHIVE_DIR                     # noqa: E402
from genesis.schema import THRESHOLDS_KT                       # noqa: E402
from genesis.store import read_table                           # noqa: E402

# Physical bounds. Deliberately generous: these catch a unit or column error, not an unusual
# storm. The upper wind bound is above the strongest tropical cyclone ever measured (185 kt,
# Patricia 2015), so tripping it means the parser is wrong, not the weather.
BOUNDS = {
    ("track_points", "lat"): (-90.0, 90.0),
    ("track_points", "lon"): (-180.0, 180.0),
    ("track_points", "vmax_kt"): (0.0, 200.0),
    ("track_points", "mslp_mb"): (850.0, 1030.0),
    ("environment", "shear_kt"): (0.0, 200.0),
    ("environment", "rh_mid_pct"): (0.0, 100.0),
    ("environment", "sst_c"): (-2.0, 35.0),
    ("environment", "pot_intensity_kt"): (0.0, 250.0),
    ("environment", "ohc_kj_cm2"): (0.0, 250.0),
    ("environment", "vort850_1e5"): (-50.0, 50.0),
    ("environment", "lat"): (-90.0, 90.0),
    ("environment", "lon"): (-180.0, 180.0),
    ("landfalls", "lat"): (-90.0, 90.0),
    ("landfalls", "lon"): (-180.0, 180.0),
    ("landfalls", "vmax_kt"): (0.0, 200.0),
    ("daily_disturbances", "prob_48h_pct"): (0.0, 100.0),
    ("daily_disturbances", "prob_7d_pct"): (0.0, 100.0),
}

findings: list[str] = []


def note(msg: str) -> None:
    findings.append(msg)
    print(f"  FINDING  {msg}")


def ok(msg: str) -> None:
    print(f"  ok       {msg}")


def check_bounds(base: Path) -> None:
    print("\nphysical bounds")
    for (table, col), (lo, hi) in BOUNDS.items():
        rows = read_table(table, base).to_pylist()
        if not rows:
            continue
        bad = [r for r in rows
               if r.get(col) is not None and r[col] == r[col] and not (lo <= r[col] <= hi)]
        if bad:
            ex = bad[0]
            note(f"{table}.{col}: {len(bad)} of {len(rows)} outside [{lo}, {hi}] "
                 f"(e.g. {ex[col]} at {ex.get('storm_id') or ex.get('disturbance_key')})")
        else:
            vals = [r[col] for r in rows if r.get(col) is not None and r[col] == r[col]]
            if vals:
                ok(f"{table}.{col}: {len(vals)} values in [{min(vals):.1f}, {max(vals):.1f}]")


def check_referential(base: Path) -> None:
    print("\nreferential integrity")
    storms = read_table("storms", base).to_pylist()
    ids = {s["storm_id"] for s in storms}
    if len(ids) != len(storms):
        note(f"storms: {len(storms) - len(ids)} duplicate storm_id")
    else:
        ok(f"storms: {len(ids)} unique storm_id")

    for table in ("track_points", "genesis_events", "landfalls"):
        rows = read_table(table, base).to_pylist()
        if not rows:
            continue
        orphan = {r["storm_id"] for r in rows if r.get("storm_id") and r["storm_id"] not in ids}
        if orphan:
            note(f"{table}: {len(orphan)} storm_id values with no row in storms")
        else:
            ok(f"{table}: every storm_id resolves ({len(rows)} rows)")

    env = read_table("environment", base).to_pylist()
    if env:
        null_sid = sum(1 for r in env if not r.get("storm_id"))
        ok(f"environment: {null_sid} of {len(env)} rows unjoined "
           f"({100 * null_sid / len(env):.1f}%) -- expected, see MANIFEST gaps")

    tp = read_table("track_points", base).to_pylist()
    if tp:
        keys = Counter((r["storm_id"], r["iso_time"]) for r in tp)
        dupes = [k for k, v in keys.items() if v > 1]
        if dupes:
            note(f"track_points: {len(dupes)} duplicate (storm_id, iso_time) keys")
        else:
            ok(f"track_points: {len(tp)} rows, no duplicate (storm_id, iso_time)")


def check_derivations(base: Path) -> None:
    """The derived columns must agree with the points they were derived from."""
    print("\nderived-column consistency")
    storms = {s["storm_id"]: s for s in read_table("storms", base).to_pylist()}
    tp = read_table("track_points", base).to_pylist()
    gen = read_table("genesis_events", base).to_pylist()
    if not (storms and tp and gen):
        return

    peak: dict = {}
    for r in tp:
        v = r.get("vmax_kt")
        if v is not None and v == v:
            sid = r["storm_id"]
            if sid not in peak or v > peak[sid]:
                peak[sid] = v
    bad = [sid for sid, s in storms.items()
           if s.get("max_vmax_kt") is not None and sid in peak
           and abs(s["max_vmax_kt"] - peak[sid]) > 1e-6]
    if bad:
        note(f"storms.max_vmax_kt disagrees with track_points for {len(bad)} storms "
             f"(e.g. {bad[0]}: {storms[bad[0]]['max_vmax_kt']} vs {peak[bad[0]]})")
    else:
        ok(f"storms.max_vmax_kt matches the track points for {len(peak)} storms")

    # reached_* flags must agree with the peak, and be NULL where the peak is unknown
    wrong = [sid for sid, s in storms.items()
             if s.get("max_vmax_kt") is not None
             and s.get("reached_cat1") is not None
             and s["reached_cat1"] != (s["max_vmax_kt"] >= THRESHOLDS_KT["cat1"])]
    if wrong:
        note(f"storms.reached_cat1 disagrees with max_vmax_kt for {len(wrong)} storms")
    else:
        ok("storms.reached_cat1 agrees with max_vmax_kt everywhere")

    unknown_but_flagged = [sid for sid, s in storms.items()
                           if s.get("max_vmax_kt") is None and s.get("reached_cat1") is not None]
    if unknown_but_flagged:
        note(f"{len(unknown_but_flagged)} storms have NO intensity but a non-NULL reached_cat1 "
             "-- an unknown outcome is being reported as a decision")
    else:
        ok("storms with no intensity carry NULL reached_* rather than False")

    # ordering: genesis <= ts <= cat1 <= cat3
    bad_order = []
    for g in gen:
        seq = [g.get("genesis_utc"), g.get("ts_utc"), g.get("cat1_utc"), g.get("cat3_utc")]
        seq = [x for x in seq if x is not None]
        if any(seq[i] > seq[i + 1] for i in range(len(seq) - 1)):
            bad_order.append(g["storm_id"])
    if bad_order:
        note(f"genesis_events: {len(bad_order)} storms whose threshold crossings are out of "
             f"order (e.g. {bad_order[0]})")
    else:
        ok("genesis_events: threshold crossings are monotonic for every storm")

    neg = [g["storm_id"] for g in gen
           if any((g.get(k) is not None and g[k] < 0)
                  for k in ("hours_to_ts", "hours_to_cat1", "hours_to_cat3"))]
    if neg:
        note(f"genesis_events: {len(neg)} storms with a NEGATIVE time-to-event")
    else:
        ok("genesis_events: no negative time-to-event")


def check_quality(base: Path) -> None:
    print("\nquality and provenance")
    tp = read_table("track_points", base).to_pylist()
    if tp:
        q = Counter(r.get("quality") for r in tp)
        bad = {k for k in q if k not in ("observed", "interpolated", "provisional")}
        if bad:
            note(f"track_points.quality has unexpected values: {bad}")
        else:
            ok(f"track_points.quality: {dict(q)}")

    for table in ("storms", "track_points", "environment", "genesis_events",
                  "landfalls", "daily_disturbances"):
        rows = read_table(table, base).to_pylist()
        if not rows:
            continue
        missing = sum(1 for r in rows if not r.get("source_key")
                      or not r.get("processing_version") or not r.get("ingested_utc"))
        if missing:
            note(f"{table}: {missing} rows missing provenance columns")
        else:
            ok(f"{table}: every row carries provenance ({len(rows)} rows)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--archive-dir")
    ap.add_argument("--strict", action="store_true",
                    help="exit non-zero if any finding is reported")
    args = ap.parse_args()
    base = Path(args.archive_dir) if args.archive_dir else ARCHIVE_DIR

    print(f"validating {base}")
    check_bounds(base)
    check_referential(base)
    check_derivations(base)
    check_quality(base)

    print(f"\n{len(findings)} finding(s)")
    for f in findings:
        print(f"  - {f}")
    return 1 if (findings and args.strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
