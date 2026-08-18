"""The daily pipeline: ingest today's NHC outlook, and follow every area to its fate.

WHAT MAKES THIS TABLE WORTH HAVING. The best-track archive contains only the disturbances that
SUCCEEDED -- a wave that never became a depression has no best-track row, so a development rate
computed from best tracks alone is computed over survivors and is meaningless. This log records
every area NHC watched, including the ones that came to nothing, and follows each to
'developed' or 'dissipated'. That denominator is the whole point.

APPEND-ONLY, AND WHY. Every issuance is a row, even when it repeats yesterday's. The log's job
is to answer "what did NHC say, and when did they say it" -- which is exactly what a zero-peek
back-test needs. Collapsing repeats to a current-state table would destroy the timeline and make
it impossible to ask what was knowable at 06Z.

POSITIONS COME FROM THE GRAPHICAL PRODUCT, NOT THE PROSE. The text says "east-southeast of the
Hawaiian Islands"; the shapefile says 11.99N 143.74W. Only the second is a position. Where the
shapefile has no matching area, lat/lon stay NULL -- the prose is never geocoded.

THE HARD PART IS IDENTITY. NHC renumbers outlook areas between issuances: today's "Area 2" may
be tomorrow's "Area 1" when the area ahead of it develops. So the area number CANNOT be the
identity. Areas are instead threaded by POSITION: a new area within `link_km` of an open
area's last position, in the same basin, continues it. That is a heuristic, it is stated as
one, and its failure mode is named in `link_method` on every row: two areas that pass within
`link_km` of each other can be merged in error, and an area that jumps further than `link_km`
in one issuance starts a new thread. Neither failure invents data -- both are visible in the
log, and `link_method` says which rule fired.
"""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timedelta, timezone

from ..provenance import ARCHIVE_DIR, Gap, PROCESSING_VERSION, USER_AGENT, _now, fetch
from ..retrieval.analogs import haversine_km
from ..store import append, read_table, snapshot
from ..sources.gtwo import read_areas

GTWO_ZIP = "https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip"
CURRENT_STORMS = "https://www.nhc.noaa.gov/CurrentStorms.json"
TWO_RSS = {
    "atlantic": "https://www.nhc.noaa.gov/xml/TWOAT.xml",
    "epac": "https://www.nhc.noaa.gov/xml/TWOEP.xml",
    "cpac": "https://www.nhc.noaa.gov/xml/TWOCP.xml",
}
# NHC's shapefile BASIN attribute uses these words; map them to our basin keys.
SHP_BASIN = {"atlantic": "atlantic", "pacific": "epac", "central pacific": "cpac"}

LINK_KM = 900.0        # threading radius between consecutive issuances
STALE_DAYS = 5         # unmentioned this long -> dissipated


def _get(url: str, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _rss_text(xml: bytes) -> list[tuple]:
    """(issuance_utc, text) for each item in an NHC outlook RSS feed."""
    out = []
    body = xml.decode("utf-8", "replace")
    for m in re.finditer(r"<item>(.*?)</item>", body, re.S):
        item = m.group(1)
        cdata = re.search(r"<!\[CDATA\[(.*?)\]\]>", item, re.S)
        guid = re.search(r"<guid[^>]*>(\d{12})</guid>", item)
        when = None
        if guid:
            g = guid.group(1)
            when = datetime(int(g[:4]), int(g[4:6]), int(g[6:8]),
                            int(g[8:10]), int(g[10:12]), tzinfo=timezone.utc)
        if cdata:
            text = re.sub(r"<br\s*/?>", "\n", cdata.group(1))
            out.append((when, re.sub(r"<[^>]+>", "", text)))
    return out


def run_daily(*, archive_dir=None, link_km: float = LINK_KM,
              stale_days: int = STALE_DAYS, verbose: bool = True) -> dict:
    base = archive_dir or ARCHIVE_DIR
    say = print if verbose else (lambda *a, **k: None)
    now = datetime.now(timezone.utc)
    gaps: list[dict] = []
    observed_utc = now.replace(microsecond=0)

    # ---- 1. the graphical outlook: positions + probabilities -------------------------
    areas = []
    try:
        areas = read_areas(_get(GTWO_ZIP))
        say(f"  GTWO areas: {len(areas)}")
    except Exception as exc:                                   # noqa: BLE001
        gaps.append(Gap(key="gtwo", what="graphical outlook unreachable",
                        why=f"{type(exc).__name__}: {exc}", url=GTWO_ZIP,
                        impact="today's disturbances have no position").as_dict())

    # ---- 2. the text outlook, per basin ----------------------------------------------
    texts: dict = {}
    for basin, url in TWO_RSS.items():
        try:
            items = _rss_text(_get(url))
            if items:
                texts[basin] = items[0]
        except Exception as exc:                               # noqa: BLE001
            gaps.append(Gap(key=f"two.{basin}", what=f"{basin} outlook text unreachable",
                            why=f"{type(exc).__name__}: {exc}", url=url,
                            impact="no narrative for this basin's areas").as_dict())

    # ---- 3. thread today's areas onto the open ones ----------------------------------
    existing = read_table("daily_disturbances", base).to_pylist()
    open_threads: dict = {}
    for r in sorted(existing, key=lambda r: str(r.get("observed_utc"))):
        if r.get("outcome") in ("developed", "dissipated"):
            open_threads.pop((r.get("basin"), r.get("disturbance_key")), None)
            continue
        open_threads[(r.get("basin"), r.get("disturbance_key"))] = r

    rows = []
    seen_keys = set()
    for a in areas:
        basin = SHP_BASIN.get(str(a.get("basin") or "").strip().lower(), "epac")
        lat, lon = a.get("lat"), a.get("lon")
        key, method = None, "new_thread"
        if lat is not None and lon is not None:
            best, bestd = None, None
            for (b, k), r in open_threads.items():
                if b != basin or r.get("lat") is None or r.get("lon") is None:
                    continue
                d = haversine_km(lat, lon, r["lat"], r["lon"])
                if d <= link_km and (bestd is None or d < bestd):
                    best, bestd = k, d
            if best:
                key, method = best, f"position_link<{bestd:.0f}km"
        if key is None:
            # A thread id that does not depend on the area number, which NHC reshuffles.
            where = ("%.1f_%.1f" % (lat, lon) if lat is not None
                     else "area%s" % a.get("area_number"))
            key = f"{basin}-{observed_utc:%Y%m%d%H%M}-{where}"
        seen_keys.add((basin, key))
        txt = texts.get(basin)
        rows.append({
            "observed_utc": observed_utc,
            "issuance_utc": txt[0] if txt else None,
            "basin": basin,
            "disturbance_key": key,
            "invest_id": None,
            "lat": lat, "lon": lon,
            "prob_48h_pct": a.get("prob_48h_pct"),
            "prob_7d_pct": a.get("prob_7d_pct"),
            "prob_48h_label": a.get("prob_48h_label"),
            "prob_7d_label": a.get("prob_7d_label"),
            "text": (txt[1] if txt else None),
            "source_url": GTWO_ZIP,
            "resolved_storm_id": None, "resolved_atcf_id": None,
            "outcome": "open", "outcome_utc": None, "hours_to_genesis": None,
            "source_key": f"gtwo:{a.get('issuance_stamp')}|link:{method}",
            "processing_version": PROCESSING_VERSION,
            "ingested_utc": _now(),
        })

    added = replaced = 0
    if rows:
        _p, added, replaced = append("daily_disturbances", rows, base)
    say(f"  appended {added} new observations ({replaced} replaced)")

    # ---- 4. resolution: did an open area become a storm? -----------------------------
    resolved = 0
    try:
        active = json.loads(_get(CURRENT_STORMS).decode("utf-8", "replace"))
        storms = active.get("activeStorms") or []
        say(f"  active storms: {len(storms)}")
        current = read_table("daily_disturbances", base).to_pylist()
        latest: dict = {}
        for r in sorted(current, key=lambda r: str(r.get("observed_utc"))):
            latest[(r.get("basin"), r.get("disturbance_key"))] = r
        updates = []
        for st in storms:
            slat, slon = st.get("latitudeNumeric"), st.get("longitudeNumeric")
            if slat is None or slon is None:
                continue
            for (basin, key), r in latest.items():
                if r.get("outcome") != "open" or r.get("lat") is None:
                    continue
                if haversine_km(slat, slon, r["lat"], r["lon"]) > link_km:
                    continue
                row = dict(r)
                row["outcome"] = "developed"
                row["outcome_utc"] = observed_utc
                row["resolved_atcf_id"] = (st.get("id") or "").upper() or None
                updates.append(row)
                resolved += 1
                break
        if updates:
            append("daily_disturbances", updates, base)
    except Exception as exc:                                   # noqa: BLE001
        gaps.append(Gap(key="current_storms", what="active-storm feed unreachable",
                        why=f"{type(exc).__name__}: {exc}", url=CURRENT_STORMS,
                        impact="open disturbances could not be resolved this run").as_dict())

    # ---- 5. dissipation: open, and unmentioned for too long --------------------------
    dissipated = 0
    current = read_table("daily_disturbances", base).to_pylist()
    latest = {}
    for r in sorted(current, key=lambda r: str(r.get("observed_utc"))):
        latest[(r.get("basin"), r.get("disturbance_key"))] = r
    stale_before = now - timedelta(days=stale_days)
    updates = []
    for (basin, key), r in latest.items():
        if r.get("outcome") != "open" or (basin, key) in seen_keys:
            continue
        seen = r.get("observed_utc")
        seen_dt = seen if isinstance(seen, datetime) else None
        if seen_dt and seen_dt.tzinfo is None:
            seen_dt = seen_dt.replace(tzinfo=timezone.utc)
        if seen_dt and seen_dt < stale_before:
            row = dict(r)
            row["outcome"] = "dissipated"
            row["outcome_utc"] = observed_utc
            updates.append(row)
            dissipated += 1
    if updates:
        append("daily_disturbances", updates, base)

    # ---- 6. live environment: operational SHIPS for every active system ---------------
    #
    # APPEND-ONLY AND ACCUMULATING. ftp.nhc.noaa.gov/atcf/stext/ holds only the current
    # season, so these rows exist going forward and can never be back-filled. Capturing them
    # on every run is the only way the archive ever gets a live-era environment record.
    env_added = env_systems = 0
    try:
        from ..sources import ships_rt
        pairs = ships_rt.fetch_latest()
        by_atcf = {}
        for s_ in read_table("storms", base).to_pylist():
            if s_.get("atcf_id"):
                by_atcf[s_["atcf_id"]] = s_["storm_id"]
        rows_env = []
        for run, text in pairs:
            got = ships_rt.environment_rows(
                text, source_key=f"ships_rt:{run['filename']}",
                storm_id=by_atcf.get(run["atcf_id"]), url=run["url"])
            rows_env.extend(got)
            if got:
                env_systems += 1
        if rows_env:
            # GPI where the inputs allow it; the module refuses on its own terms.
            try:
                from ..indices import gpi as _gpi
                for r in rows_env:
                    r["gpi"], r["gpi_method"] = _gpi.gpi_for_environment_row(r)
            except Exception:
                pass
            _p2, env_added, _r2 = append("environment", rows_env, base)
        say(f"  live SHIPS: {env_systems} systems, {env_added} new environment rows")
    except Exception as exc:                                   # noqa: BLE001
        gaps.append(Gap(key="ships_rt", what="operational SHIPS unreachable",
                        why=f"{type(exc).__name__}: {exc}",
                        url="https://ftp.nhc.noaa.gov/atcf/stext/",
                        impact="no live environment captured this run; env_vector "
                               "conditioning on active systems is unavailable").as_dict())

    snap = snapshot(base)
    out = {
        "ran_utc": observed_utc.isoformat(),
        "areas_observed": len(rows),
        "rows_added": added,
        "resolved_developed": resolved,
        "marked_dissipated": dissipated,
        "live_env_systems": env_systems,
        "live_env_rows_added": env_added,
        "snapshot": str(snap),
        "gaps": gaps,
        "note": ("positions come from the graphical outlook; prose locations are never "
                 "geocoded. Threads are linked by position -- see link_method in source_key."),
    }
    say(f"  developed {resolved}, dissipated {dissipated}, snapshot {snap.name}")
    return out
