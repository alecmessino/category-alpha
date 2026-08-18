"""Build the archive end to end, from official sources to Parquet tables plus a manifest.

ORDER MATTERS AND IS NOT ARBITRARY:

  1. IBTrACS      the spine -- storms and track_points. Every other table joins to storm_id.
  2. derivation   storms' intensity summary and genesis_events, from the points just loaded.
  3. SHIPS        the environment table, joined on ATCF id. SHIPS is keyed by ATCF id and
                  IBTrACS carries USA_ATCF_ID, so the join is exact where both exist -- and
                  where it does not exist the row is KEPT with storm_id NULL, because an
                  unjoined environment record is a measurable gap and a dropped one is not.
  4. GPI          computed over the environment rows, refusing where inputs are unconfirmed.
  5. landfalls    HURDAT2's official 'L' records first; polygon crossings only as a fallback
                  for coastlines NHC does not flag.
  6. TWO          the pre-genesis and live disturbance log.

EVERY STAGE IS OPTIONAL AND EVERY FAILURE IS A RECORDED GAP, NOT AN EXCEPTION. A build that
cannot reach CIRA still produces a usable archive with no environment table and a manifest that
says exactly why. The alternative -- a build that dies on a 403 -- means one unreachable host
costs the whole archive, and it is precisely the archive you want on the day the network is bad.
"""

from __future__ import annotations

import importlib
import traceback
from pathlib import Path

from ..provenance import ARCHIVE_DIR, Gap, Manifest, PROCESSING_VERSION, fetch, _now
from ..store import append, snapshot, summary, write_table
from .genesis_events import build_genesis_events, summarise_storms

IBTRACS_BASE = ("https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate"
                "-stewardship-ibtracs/v04r01/access/csv")
SHIPS_BASE = "https://rammb-data.cira.colostate.edu/ships/data"
SHIPS_FILES = {
    "AL": "AL/lsdiaga_1982_2023_sat_ts_7day.txt",
    "EP": "EP/lsdiage_1982_2023_sat_ts_7day.txt",
    "CP": "CP/lsdiagc_1982_2023_sat_ts_7day.txt",
}
HURDAT2_INDEX = "https://www.nhc.noaa.gov/data/hurdat/"


def _try(name: str, manifest: Manifest, fn, *, impact: str):
    """Run a build stage; convert any failure into a recorded Gap and carry on."""
    try:
        return fn()
    except Exception as exc:                                   # noqa: BLE001 -- deliberate
        manifest.add_gap(Gap(
            key=name, what=f"build stage '{name}' failed", why=f"{type(exc).__name__}: {exc}",
            impact=impact))
        print(f"  ! {name} FAILED: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        return None


def _mod(path: str):
    """Import a source module, returning None if it has not been written yet."""
    try:
        return importlib.import_module(path)
    except Exception:
        return None


def build(*, basins: tuple = ("EP",), archive_dir: Path | None = None,
          with_environment: bool = True, with_landfalls: bool = True,
          with_two: bool = False, ships_basins: tuple = ("EP", "CP"),
          verbose: bool = True) -> dict:
    base = archive_dir or ARCHIVE_DIR
    base.mkdir(parents=True, exist_ok=True)
    m = Manifest()
    say = print if verbose else (lambda *a, **k: None)

    storms: list[dict] = []
    points: list[dict] = []
    seen_storms: set = set()
    seen_points: set = set()

    # ---- 1. IBTrACS ------------------------------------------------------------------
    ibtracs = _mod("genesis.sources.ibtracs")
    if ibtracs is None:
        m.add_gap(Gap(key="ibtracs", what="IBTrACS loader missing",
                      why="genesis.sources.ibtracs not importable",
                      impact="no storms or track points -- the archive cannot be built"))
    else:
        for b in basins:
            def _load(b=b):
                key = f"ibtracs.{b}.csv"
                url = f"{IBTRACS_BASE}/ibtracs.{b}.list.v04r01.csv"
                path, rec = fetch(key, url, note=f"IBTrACS v04r01 basin file {b}")
                m.add_source(rec)
                s, p = ibtracs.build_tables(path, source_key=key)
                say(f"  IBTrACS {b}: {len(s)} storms, {len(p)} points")
                return s, p
            got = _try(f"ibtracs.{b}", m, _load,
                       impact=f"basin {b} absent from storms and track_points")
            if got:
                # DE-DUPLICATE ACROSS BASIN FILES. IBTrACS per-basin files are not disjoint:
                # a storm is included in every basin it ever entered, so a dateline crosser
                # appears in both the EP and WP files in full. Concatenating them would
                # double-count that storm in every rate the archive publishes -- silently,
                # because nothing about the output would look wrong.
                for row in got[0]:
                    if row["storm_id"] not in seen_storms:
                        seen_storms.add(row["storm_id"])
                        storms.append(row)
                for row in got[1]:
                    k = (row["storm_id"], row["iso_time"])
                    if k not in seen_points:
                        seen_points.add(k)
                        points.append(row)

    # ---- 2. derivation ---------------------------------------------------------------
    if points:
        summarise_storms(points, storms)
        genesis = build_genesis_events(points, storms, source_key="derived:ibtracs")
        say(f"  derived: {len(genesis)} genesis events")
    else:
        genesis = []

    # ---- 3. environment (SHIPS) ------------------------------------------------------
    environment: list[dict] = []
    if with_environment:
        ships = _mod("genesis.sources.ships_dev")
        if ships is None:
            m.add_gap(Gap(key="ships_dev", what="SHIPS parser missing",
                          why="genesis.sources.ships_dev not importable",
                          impact="environment table empty -- env_vector matching unavailable"))
        else:
            # exact join: SHIPS is keyed by ATCF id, IBTrACS carries USA_ATCF_ID
            by_atcf = {s["atcf_id"]: s["storm_id"] for s in storms if s.get("atcf_id")}
            unjoined = {"n": 0}

            def storm_id_for(atcf_id, iso_time=None):
                sid = by_atcf.get(atcf_id)
                if sid is None:
                    unjoined["n"] += 1
                return sid

            for b in ships_basins:
                def _env(b=b):
                    key = f"ships.{b}.txt"
                    path, rec = fetch(key, f"{SHIPS_BASE}/{SHIPS_FILES[b]}",
                                      note=f"SHIPS developmental data {b} 1982-2023")
                    m.add_source(rec)
                    rows = ships.environment_rows(path, source_key=key,
                                                  storm_id_for=storm_id_for)
                    say(f"  SHIPS {b}: {len(rows)} environment rows")
                    return rows
                got = _try(f"ships.{b}", m, _env,
                           impact=f"no SHIPS environment for basin {b}")
                if got:
                    environment.extend(got)
            if unjoined["n"]:
                m.add_gap(Gap(
                    key="ships_join", what="SHIPS records with no IBTrACS storm",
                    why=(f"{unjoined['n']} SHIPS records carry an ATCF id absent from the loaded "
                         "IBTrACS basins (a basin not loaded, or a storm IBTrACS did not adopt)"),
                    impact="those environment rows have storm_id NULL and cannot be analog-matched"))

    # ---- 4. GPI ----------------------------------------------------------------------
    gpi_mod = _mod("genesis.indices.gpi")
    if gpi_mod is None:
        m.add_gap(Gap(key="gpi", what="GPI module missing",
                      why="genesis.indices.gpi not importable",
                      impact="environment.gpi is NULL for every row"))
    elif environment:
        computed = refused = 0
        for row in environment:
            try:
                val, method = gpi_mod.gpi_for_environment_row(row)
            except Exception as exc:                            # noqa: BLE001
                val, method = None, f"error: {type(exc).__name__}"
            row["gpi"], row["gpi_method"] = val, method
            if val is None:
                refused += 1
            else:
                computed += 1
        say(f"  GPI: {computed} computed, {refused} refused (missing/unconfirmed inputs)")
        if refused:
            m.add_gap(Gap(key="gpi_refused",
                          what=f"GPI not computed for {refused} of {len(environment)} rows",
                          why="a required input was missing or its unit scaling is unconfirmed",
                          impact="those rows carry gpi NULL; see gpi_method for the reason"))

    # ---- 5. landfalls ----------------------------------------------------------------
    landfalls: list[dict] = []
    if with_landfalls:
        hurdat = _mod("genesis.sources.hurdat2")
        geo = _mod("genesis.geo")
        region_for = None
        regions = None
        if geo is not None:
            def _regions():
                return geo.load_regions()
            regions = _try("coastlines", m, _regions,
                           impact="landfalls cannot be attributed to a region")
            if regions is not None:
                def region_for(lat, lon, _r=regions):
                    return geo.point_region(lat, lon, _r)
        else:
            m.add_gap(Gap(key="geo", what="coastline geometry missing",
                          why="genesis.geo not importable",
                          impact="landfalls unattributed and no polygon-crossing fallback"))

        if hurdat is None:
            m.add_gap(Gap(key="hurdat2", what="HURDAT2 parser missing",
                          why="genesis.sources.hurdat2 not importable",
                          impact="no official 'L'-record landfalls"))
        else:
            def _lf():
                key = "hurdat2.nepac.txt"
                path, rec = fetch(key, _discover_hurdat2("nepac"),
                                  note="HURDAT2 NE Pacific best track")
                m.add_source(rec)
                rows = hurdat.landfall_rows(path, source_key=key, region_for=region_for)
                say(f"  HURDAT2 landfalls: {len(rows)}")
                return rows
            got = _try("hurdat2.landfalls", m, _lf,
                       impact="landfalls table lacks official NHC 'L' records")
            if got:
                # Map ATCF ids onto IBTrACS storm ids so landfalls join the rest of the archive.
                by_atcf = {s["atcf_id"]: s["storm_id"] for s in storms if s.get("atcf_id")}
                kept = 0
                for r in got:
                    sid = by_atcf.get(r.get("atcf_id"))
                    if sid:
                        r["storm_id"] = sid
                        kept += 1
                landfalls.extend([r for r in got if r.get("storm_id")])
                if kept < len(got):
                    m.add_gap(Gap(
                        key="landfall_join",
                        what=f"{len(got) - kept} HURDAT2 landfalls unjoined to IBTrACS",
                        why="the storm's ATCF id is not present in the loaded IBTrACS basins",
                        impact="those landfalls are absent from the archive"))

        # polygon fallback for coastlines NHC does not flag with 'L'
        if geo is not None and regions and points:
            def _cross():
                by_storm: dict = {}
                for p in points:
                    by_storm.setdefault(p["storm_id"], []).append(p)
                have = {(r["storm_id"], r.get("region")) for r in landfalls}
                out = []
                now = _now()
                for sid, pts in by_storm.items():
                    pts = sorted(pts, key=lambda p: p["iso_time"])
                    for c in geo.crossings(pts, regions):
                        if (sid, c.get("region")) in have:
                            continue          # NHC already flagged this one officially
                        out.append({
                            "storm_id": sid,
                            "atcf_id": next((s.get("atcf_id") for s in storms
                                             if s["storm_id"] == sid), None),
                            "season": next((s.get("season") for s in storms
                                            if s["storm_id"] == sid), None),
                            "region": c.get("region"), "sub_region": c.get("sub_region"),
                            "landfall_utc": c.get("iso_time"), "lat": c.get("lat"),
                            "lon": c.get("lon"), "vmax_kt": c.get("vmax_kt"),
                            "mslp_mb": c.get("mslp_mb"),
                            "category": None, "stage": c.get("stage"),
                            "hurricane_at_landfall": (None if c.get("vmax_kt") is None
                                                      else c["vmax_kt"] >= 64),
                            "ts_at_landfall": (None if c.get("vmax_kt") is None
                                               else c["vmax_kt"] >= 34),
                            "detection": c.get("detection"),
                            "implied_speed_kt": c.get("implied_speed_kt"),
                            "suspect_relocation": c.get("suspect_relocation"),
                            "closest_approach_km": c.get("closest_approach_km"),
                            "source_key": "derived:geo", "processing_version": PROCESSING_VERSION,
                            "ingested_utc": now,
                        })
                say(f"  polygon-crossing landfalls (fallback): {len(out)}")
                return out
            got = _try("geo.crossings", m, _cross,
                       impact="no polygon-derived landfalls beyond HURDAT2's 'L' records")
            if got:
                landfalls.extend(got)

    # ---- 6. write --------------------------------------------------------------------
    if storms:
        write_table("storms", storms, base)
        m.add_table("storms", rows=len(storms), path="storms.parquet",
                    sources=[f"ibtracs.{b}.csv" for b in basins])
    if points:
        write_table("track_points", points, base)
        m.add_table("track_points", rows=len(points), path="track_points.parquet",
                    sources=[f"ibtracs.{b}.csv" for b in basins])
    if genesis:
        write_table("genesis_events", genesis, base)
        m.add_table("genesis_events", rows=len(genesis), path="genesis_events.parquet",
                    sources=[f"ibtracs.{b}.csv" for b in basins],
                    note="derived: first tropical point + first threshold crossings")
    if environment:
        write_table("environment", environment, base)
        m.add_table("environment", rows=len(environment), path="environment.parquet",
                    sources=[f"ships.{b}.txt" for b in ships_basins],
                    note="SHIPS developmental data; ERA5 unavailable -- see gaps")
    if landfalls:
        write_table("landfalls", landfalls, base)
        m.add_table("landfalls", rows=len(landfalls), path="landfalls.parquet",
                    sources=["hurdat2.nepac.txt", "coastlines"],
                    note="HURDAT2 'L' records primary; polygon crossings fallback")

    m.write(base)
    snap = snapshot(base)
    say(f"  manifest + snapshot {snap.name}")
    return {"summary": summary(base), "gaps": [g.as_dict() for g in m.gaps],
            "snapshot": str(snap)}


def _discover_hurdat2(which: str) -> str:
    """Find the current HURDAT2 filename from NHC's directory index.

    The filename carries its own revision date and changes every year -- hardcoding it means
    the build silently rots each spring. Discovery is cheap and it fails loudly.
    """
    import re
    import urllib.request

    with urllib.request.urlopen(HURDAT2_INDEX, timeout=60) as r:
        html = r.read().decode("utf-8", "replace")
    pat = r"hurdat2-nepac-[0-9]{4}-[0-9]{4}-[0-9]{6,8}\.txt" if which == "nepac" \
        else r"hurdat2-[0-9]{4}-[0-9]{4}-[0-9]{6,8}\.txt"
    names = sorted(set(re.findall(pat, html)))
    if not names:
        raise RuntimeError(f"no HURDAT2 {which} file found in the NHC index")
    return HURDAT2_INDEX + names[-1]       # lexically last == most recent revision
