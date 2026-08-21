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
        if args.cases and res.n_cases:
            print("\n  closest analogs:")
            for c in res.cases[:args.cases]:
                print(f"    {c.season} {(c.name or '?'):<12s} {c.atcf_id or '':<9s}"
                      f" {c.distance_km:6.0f} km  peak {c.peak_vmax_kt or float('nan'):5.0f} kt"
                      f"  w={c.weight:.3f}"
                      + (f"  LANDFALL {[l['region'] for l in c.landfalls]}" if c.landfalls else ""))
    return 0 if res.n_cases else 1


def cmd_evidence_boundary(args) -> int:
    """Research only. Writes under research/, touches no published artifact."""
    from genesis.build.build_evidence_boundary import build
    out = build(archive_dir=_archive(args))
    c = out["criterion"]
    sa = out["primary_landfall"]["scope_aware"]
    aw = out["primary_landfall"]["archive_wide"]
    print(f"  {out['n_contracts']} contracts over {', '.join(out['basins'])}")
    for name, t in (("scope-aware ", sa), ("archive-wide", aw)):
        se = "n/a" if t["sensitivity"] is None else f"{t['sensitivity']:.2f}"
        sp = "n/a" if t["specificity"] is None else f"{t['specificity']:.2f}"
        print(f"  landfall {name}  sensitivity {se}  specificity {sp}"
              f"   ({t['refused_unsupported']}/{t['n_unsupported']} unsupported refused, "
              f"{t['allowed_learnable']}/{t['n_learnable']} learnable allowed)")
    print(f"  criterion (>={c['sensitivity_min']:.2f} / >={c['specificity_min']:.2f}): "
          f"{'MET' if c['met'] else 'NOT MET'}")
    u = out["uncovered_timing"]
    print(f"  uncovered time-to-event: {u['n_unsupported']} of {u['n']} unsupported")
    return 0


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
    # NO SKILL NUMBER IS PRINTED UNLESS THE TWO SAMPLING SCHEMES AGREE IN SIGN.
    # They currently do not (+26.8% per disturbance, -3.1% per observation), so surfacing
    # either would be presenting a choice of methodology as a result. The values stay in the
    # JSON for diagnosis; they do not reach a human-facing surface.
    if st.get("schemes_agree_in_sign"):
        a = st.get("thread_level_skill_vs_nhc")
        b = st.get("observation_level_skill_vs_nhc")
        print(f"    analog skill vs NHC, per disturbance : {format(a, '+.1%')}")
        print(f"    analog skill vs NHC, per observation : {format(b, '+.1%')}")
    else:
        print("    NO SKILL CLAIM -- the per-disturbance and per-observation sampling schemes")
        print("    disagree in SIGN, so the effect is smaller than the choice of scheme. The")
        print("    two values are in the JSON for diagnosis and are deliberately not shown here.")
    print(f"    {st.get('verdict', '')}")
    return 0


def cmd_live(args) -> int:
    """Analog query for an active ATCF system, conditioned on its operational SHIPS run."""
    from genesis.live import analogs_for_live_system, describe_live
    from genesis.sources import ships_rt
    if args.list:
        runs = ships_rt.list_runs()
        latest = {}
        for r in runs:
            latest[r["atcf_id"]] = r
        print(f"{len(runs)} SHIPS runs published, {len(latest)} systems:")
        for aid, r in sorted(latest.items()):
            print(f"   {aid}  newest {r['iso_time']:%Y-%m-%d %H:%M}Z"
                  f"{'  [INVEST/genesis-series]' if r['is_invest'] else ''}")
        return 0
    if not args.atcf:
        print("give --atcf ID (e.g. CP012026, EP9626) or --list", file=sys.stderr)
        return 2
    res, ctx = analogs_for_live_system(
        args.atcf, radius_km=args.radius, min_sample=args.min_sample,
        archive_dir=_archive(args), use_environment=not args.no_environment,
        regions=args.regions.split(",") if args.regions else None)
    print(describe_live(res, ctx))
    return 0 if (res is not None and res.n_cases) else 1


def cmd_daily(args) -> int:
    from genesis.build.daily import run_daily
    out = run_daily(archive_dir=_archive(args))
    print(json.dumps(out, indent=2, default=str))
    return 0


def cmd_emit(args) -> int:
    """Regenerate the terminal's Analog Prior payload (docs/data/analogs.json)."""
    from genesis.emit_panel import build_payload, write
    p = build_payload(archive_dir=_archive(args), radius_km=args.radius,
                      min_sample=args.min_sample,
                      regions=args.regions.split(",") if args.regions else
                      ("hawaii", "mexico", "conus"))
    path = write(p, Path(args.out) if args.out else None)
    live = sum(1 for e in p["entries"] if e["kind"] == "live_system")
    outlook = sum(1 for e in p["entries"] if e["kind"] == "outlook_area")
    print(f"wrote {path} ({path.stat().st_size:,} B) -- {live} live system(s), "
          f"{outlook} outlook area(s)")
    for n in p["notes"]:
        print(f"  note: {n}")
    return 0


def cmd_atlas_pack(args) -> int:
    """Pack the archive into the binary the Storm Atlas reads (docs/storm-atlas/data/).

    Emits three gzipped column packs and a manifest. Each file is rewritten only when its
    content changes, so a daily run that appends a handful of environment rows does not put a
    fresh megabyte of track binary into git.
    """
    from genesis.build.build_atlas_pack import build as build_pack
    r = build_pack(base=_archive(args), out_dir=Path(args.out) if args.out else None)
    for name, f in r["files"].items():
        mark = "written" if name in r["changed"] else "unchanged"
        print(f"  {name:28s} {f['bytes']:>9,} B gz  ({f['raw_bytes']:>9,} B raw)  {mark}")
    print(f"  total {r['total_gz_bytes']:,} B gzipped")
    print("  " + "  ".join(f"{k} {v:,}" for k, v in sorted(r["counts"].items())))
    if not r["changed"]:
        print("  archive unchanged since the last pack -- nothing to commit")
    return 0


def cmd_atlas_calibration(args) -> int:
    """Project the genesis-conditioned backtest into the Atlas's calibration ledger.

    This does NOT run the backtest -- it reads the one the archive already scored and reshapes
    it for the browser, adding the scope audit that compares each contract's archive-wide event
    count (the population the refusal gate counts) against the events actually observed in the
    replayed population (the population a query can draw from). Where those disagree, the gate
    is passing a contract the evidence does not support, and the ledger says so.
    """
    from genesis.build.build_calibration import build as build_cal
    r = build_cal(archive_dir=_archive(args), out_dir=Path(args.out) if args.out else None)
    a = r["audit"]
    print(f"  {r['path']}  ({r['bytes']:,} B, {r['contracts']} contracts)")
    print(f"  {a['n_beat_climatology']} of {a['n_scored']} scored contracts beat climatology")
    print(f"  fewest replay events WITH skill: {a['min_replay_events_with_skill']}  ·  "
          f"most WITHOUT: {a['max_replay_events_without_skill']}")
    if a["n_gate_missed"]:
        print(f"  {a['n_gate_missed']} contract(s) passed the archive-wide gate and did NOT "
              "beat climatology:")
        for k in a["by_verdict"].get("gate_missed", []):
            print(f"      {k}")
    return 0


def cmd_atlas_verify(args) -> int:
    """Emit what the browser must reproduce: pack digests and canonical analog vectors.

    Neither output is committed. Both are functions of an archive that is rebuilt four times a
    day, so a committed copy would churn and would test whatever the archive looked like when
    someone last regenerated it. scripts/test-atlas-pack.mjs and scripts/test-atlas-parity.mjs
    call this and then check the browser's answers against it.
    """
    from genesis.build.build_atlas_pack import expectations
    from genesis.build.emit_atlas_parity import build as build_vectors
    # Anchored to the repository, not to the shell's cwd: this command is run from the repo
    # root by the JS tests and from scripts/ by hand, and a relative default would put the
    # output in two different places depending on which.
    from genesis.provenance import REPO_ROOT
    out = Path(args.out)
    if not out.is_absolute():
        out = REPO_ROOT / out
    out.mkdir(parents=True, exist_ok=True)
    base = _archive(args)

    if args.what in ("pack", "all"):
        e = expectations(base)
        (out / "atlas-pack-expect.json").write_text(json.dumps(e, indent=1, sort_keys=True) + "\n")
        n = sum(len(v) for v in e["columns"].values())
        print(f"  atlas-pack-expect.json   {n} column digests over {len(e['columns'])} tables")

    if args.what in ("parity", "all"):
        v = build_vectors(base)
        (out / "atlas-parity.json").write_text(json.dumps(v, indent=1, sort_keys=True) + "\n")
        cases = sum(x["expect"]["n_cases"] for x in v["vectors"])
        empty = sum(1 for x in v["vectors"] if x["expect"]["n_cases"] == 0)
        thin = sum(1 for x in v["vectors"] if not x["expect"]["sufficient"])
        print(f"  atlas-parity.json        {len(v['vectors'])} vectors, {cases} matched cases "
              f"({empty} empty pool(s), {thin} below the sample gate)")
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
    # THE DEFAULTS REPRODUCE THE COMMITTED ARCHIVE, and that is the whole reason they are
    # these values. `build` overwrites the tables in place, so a default that loads fewer
    # sources than the archive was built from silently REPLACES it with a smaller one --
    # EP alone gives 1,712 storms instead of 3,959 and drops every Atlantic landfall, while
    # exiting 0. Narrowing is still available by passing the flags; it just is not the thing
    # that happens when you type the command in the README.
    b.add_argument("--basins", default="EP,NA", help="IBTrACS basin files, comma separated")
    b.add_argument("--ships-basins", default="EP,CP,AL")
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

    eb = sub.add_parser("evidence-boundary",
                        help="research: does the refusal gate generalise past ten contracts?")
    eb.add_argument("--archive")
    eb.set_defaults(fn=cmd_evidence_boundary)

    lv = sub.add_parser("live", help="analog query for an active system, conditioned on its "
                                     "operational SHIPS run")
    lv.add_argument("--atcf", help="ATCF id, e.g. CP012026 or EP9626")
    lv.add_argument("--list", action="store_true", help="list systems with a published run")
    lv.add_argument("--radius", type=float, default=500.0)
    lv.add_argument("--min-sample", type=int, default=10)
    lv.add_argument("--regions")
    lv.add_argument("--no-environment", action="store_true",
                    help="position and season only; do not condition on the live SHIPS vector")
    lv.set_defaults(fn=cmd_live)

    d = sub.add_parser("daily", help="ingest today's NHC outlook and follow open disturbances")
    d.set_defaults(fn=cmd_daily)

    em = sub.add_parser("emit", help="regenerate the terminal's Analog Prior payload")
    em.add_argument("--radius", type=float, default=500.0)
    em.add_argument("--min-sample", type=int, default=10)
    em.add_argument("--regions")
    em.add_argument("--out")
    em.set_defaults(fn=cmd_emit)

    ap_ = sub.add_parser("atlas-pack", help="pack the archive for the Storm Atlas browser route")
    ap_.add_argument("--out", help="output directory (default docs/storm-atlas/data)")
    ap_.set_defaults(fn=cmd_atlas_pack)

    ac = sub.add_parser("atlas-calibration",
                        help="project the backtest into the Atlas's calibration ledger")
    ac.add_argument("--out", help="output directory (default docs/storm-atlas/data)")
    ac.set_defaults(fn=cmd_atlas_calibration)

    av = sub.add_parser("atlas-verify",
                        help="emit pack digests and canonical analog vectors for the JS tests")
    av.add_argument("--out", default=".atlas-build", help="output directory (gitignored)")
    av.add_argument("--what", default="all", choices=["all", "pack", "parity"])
    av.set_defaults(fn=cmd_atlas_verify)

    s = sub.add_parser("summary", help="row counts and manifest header")
    s.set_defaults(fn=cmd_summary)

    g = sub.add_parser("gaps", help="print every recorded data gap")
    g.set_defaults(fn=cmd_gaps)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
