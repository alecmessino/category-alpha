"""Command line for the genesis archive.

    python3 scripts/genesis/cli.py build     --basins EP
    python3 scripts/genesis/cli.py analogs   --lat 12 --lon -140 --radius 500 --months 8,9,10
    python3 scripts/genesis/cli.py backtest  --regions hawaii
    python3 scripts/genesis/cli.py daily
    python3 scripts/genesis/cli.py summary
    python3 scripts/genesis/cli.py gaps

Every command prints what it did and what it could not do. A command that cannot answer says
so and exits non-zero, rather than printing a confident empty result.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from genesis.provenance import ARCHIVE_DIR                       # noqa: E402
from genesis.store import summary                                # noqa: E402


def _archive(args) -> Path:
    return Path(args.archive_dir) if args.archive_dir else ARCHIVE_DIR


def cmd_build(args) -> int:
    from genesis.build.build_archive import build
    out = build(
        basins=tuple(args.basins.split(",")),
        ships_basins=tuple(args.ships_basins.split(",")) if args.ships_basins else (),
        archive_dir=_archive(args),
        with_environment=not args.no_environment,
        with_landfalls=not args.no_landfalls,
    )
    print(json.dumps(out["summary"], indent=2))
    if out["gaps"]:
        print(f"\n{len(out['gaps'])} GAP(S) RECORDED:")
        for g in out["gaps"]:
            print(f"  [{g['key']}] {g['what']}\n      why: {g['why']}\n      impact: {g['impact']}")
    return 0


def cmd_analogs(args) -> int:
    from genesis.retrieval.analogs import get_analogs
    env = json.loads(args.env) if args.env else None
    res = get_analogs(
        lat=args.lat, lon=args.lon, radius_km=args.radius,
        season_months=[int(m) for m in args.months.split(",")] if args.months else None,
        env_vector=env, min_sample=args.min_sample,
        min_pool_season=args.min_pool_season,
        regions=args.regions.split(',') if args.regions else None,
        archive_dir=_archive(args), as_of=args.as_of,
        basins=args.basins.split(",") if args.basins else None,
        subbasins=args.subbasins.split(",") if args.subbasins else None,
    )
    if args.json:
        print(json.dumps(res.as_dict(), indent=2, default=str))
    else:
        print(res.describe())
        if args.cases:
            print("\n  closest analogs:")
            for c in res.cases[:args.cases]:
                print(f"    {c.season} {(c.name or '?'):<12s} {c.atcf_id or '':<9s}"
                      f" {c.distance_km:6.0f} km  peak {c.peak_vmax_kt or float('nan'):5.0f} kt"
                      f"  w={c.weight:.3f}"
                      + (f"  LANDFALL {[l['region'] for l in c.landfalls]}" if c.landfalls else ""))
    return 0 if res.n_cases else 1


def cmd_backtest(args) -> int:
    from genesis.backtest.harness import run_genesis_backtest, run_disturbance_backtest
    out = run_genesis_backtest(
        archive_dir=_archive(args), radius_km=args.radius, min_sample=args.min_sample,
        basins=args.basins.split(",") if args.basins else None,
        subbasins=args.subbasins.split(",") if args.subbasins else None,
        regions=args.regions.split(",") if args.regions else None,
        min_season=args.min_season, max_season=args.max_season,
        min_pool_season=args.min_pool_season,
        out_path=Path(args.out) if args.out else None,
    )
    print(f"mode: {out['mode']}  replayed {out['n_storms_replayed']} storms "
          f"(burn-in skipped {out['n_storms_skipped_burn_in']})")
    print(f"  conditions on: {out['conditions_on']}")
    print(f"  cannot answer: {out['cannot_answer']}\n")
    for key, s in out["scores"].items():
        if not s["scored"]:
            print(f"  {key:<28s} NOT SCORED -- {s['refused_reason']}")
            continue
        sk = s["skill_vs_climatology"]
        if sk is None and s.get("skill_refused_reason"):
            print(f"  {key:<28s} storms {s['n_storms']:4d}  events {s.get('n_events', 0):4d}  "
                  f"NO SKILL SCORE -- {s['skill_refused_reason'].split('.')[0]}")
            continue
        print(f"  {key:<28s} storms {s['n_storms']:4d}  base {s['base_rate']:.3f}  "
              f"Brier {s['brier']:.4f}  clim {s['brier_climatology'] if s['brier_climatology'] is None else format(s['brier_climatology'],'.4f')}  "
              f"skill {'n/a' if sk is None else format(sk, '+.1%')}")
    d = run_disturbance_backtest(archive_dir=_archive(args),
                                 out_path=Path(args.out).with_name("disturbance-backtest.json")
                                 if args.out else None)
    print(f"\n  disturbance-conditioned: {d.get('question', '')}")
    if d.get("refused_reason"):
        print(f"    NOT SCORED -- {d['refused_reason']}")
        return 0
    print(f"    {d['n_threads']} outlook threads, {d['n_threads_developed']} developed "
          f"({100 * (d.get('observed_development_rate') or 0):.1f}%), "
          f"{d['n_observations']} observations")
    for name, label in (("nhc_published", "NHC published 7-day chance"),
                        ("analog", "this archive's analog rate")):
        b = d.get(name) or {}
        if b.get("scored"):
            print(f"    {label:<28s} threads {b['n_storms']:4d}  events {b.get('n_events', 0):4d}"
                  f"  Brier {b['brier']:.4f}")
        else:
            print(f"    {label:<28s} NOT SCORED -- {b.get('refused_reason')}")
    st = d.get("stability") or {}
    a, b = st.get("thread_level_skill_vs_nhc"), st.get("observation_level_skill_vs_nhc")
    print(f"    analog skill vs NHC, per disturbance : "
          f"{'n/a' if a is None else format(a, '+.1%')}")
    print(f"    analog skill vs NHC, per observation : "
          f"{'n/a' if b is None else format(b, '+.1%')}")
    print(f"    {st.get('verdict', '')}")
    return 0


def cmd_daily(args) -> int:
    from genesis.build.daily import run_daily
    out = run_daily(archive_dir=_archive(args))
    print(json.dumps(out, indent=2, default=str))
    return 0


def cmd_summary(args) -> int:
    base = _archive(args)
    print(json.dumps(summary(base), indent=2))
    mf = base / "MANIFEST.json"
    if mf.exists():
        man = json.loads(mf.read_text())
        print(f"\nprocessing_version {man['processing_version']}  built {man['built_utc']}")
        print(f"sources {len(man['sources'])}   gaps {len(man['gaps'])}")
    return 0


def cmd_gaps(args) -> int:
    mf = _archive(args) / "MANIFEST.json"
    if not mf.exists():
        print("no MANIFEST.json -- the archive has not been built", file=sys.stderr)
        return 1
    man = json.loads(mf.read_text())
    if not man["gaps"]:
        print("no gaps recorded")
        return 0
    for g in man["gaps"]:
        print(f"[{g['key']}] {g['what']}")
        print(f"    why:    {g['why']}")
        print(f"    impact: {g['impact']}")
        if g.get("url"):
            print(f"    url:    {g['url']}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="genesis", description=__doc__.split("\n")[0])
    ap.add_argument("--archive-dir")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build the archive from official sources")
    b.add_argument("--basins", default="EP", help="IBTrACS basin files, comma separated")
    b.add_argument("--ships-basins", default="EP,CP")
    b.add_argument("--no-environment", action="store_true")
    b.add_argument("--no-landfalls", action="store_true")
    b.set_defaults(fn=cmd_build)

    a = sub.add_parser("analogs", help="rank historical analogs for a position")
    a.add_argument("--lat", type=float, required=True)
    a.add_argument("--lon", type=float, required=True)
    a.add_argument("--radius", type=float, default=500.0)
    a.add_argument("--months", help="e.g. 8,9,10")
    a.add_argument("--env", help='JSON, e.g. {"shear_kt":10,"sst_c":28}')
    a.add_argument("--min-sample", type=int, default=10)
    a.add_argument("--min-pool-season", type=int)
    a.add_argument("--regions", help="always report these landfall regions, e.g. hawaii")
    a.add_argument("--as-of", help="zero-peek cut-off, ISO 8601")
    a.add_argument("--basins")
    a.add_argument("--subbasins")
    a.add_argument("--cases", type=int, default=10)
    a.add_argument("--json", action="store_true")
    a.set_defaults(fn=cmd_analogs)

    t = sub.add_parser("backtest", help="zero-peek replay over the archive")
    t.add_argument("--radius", type=float, default=500.0)
    t.add_argument("--min-sample", type=int, default=10)
    t.add_argument("--basins")
    t.add_argument("--subbasins")
    t.add_argument("--regions", help="e.g. hawaii,conus")
    t.add_argument("--min-season", type=int)
    t.add_argument("--min-pool-season", type=int,
                   help="restrict the ANALOG POOL to this season onward (1971 = post-Dvorak)")
    t.add_argument("--max-season", type=int)
    t.add_argument("--out")
    t.set_defaults(fn=cmd_backtest)

    d = sub.add_parser("daily", help="ingest today's NHC outlook and follow open disturbances")
    d.set_defaults(fn=cmd_daily)

    s = sub.add_parser("summary", help="row counts and manifest header")
    s.set_defaults(fn=cmd_summary)

    g = sub.add_parser("gaps", help="print every recorded data gap")
    g.set_defaults(fn=cmd_gaps)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
