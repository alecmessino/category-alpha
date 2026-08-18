"""Back-fill the disturbance log from NHC's ARCHIVED graphical outlooks.

WHY THIS MATTERS MORE THAN IT LOOKS. The best-track archive contains only the disturbances that
succeeded. Every rate computed from it is conditioned on "a tropical cyclone formed", so it can
never answer the question a live outlook actually poses -- *will this area develop at all*.
Answering that needs the failures, and the failures exist in exactly one place: the outlooks NHC
published at the time.

The outlook TEXT reaches back to 2003 (EP/Atlantic) and 2019 (Central Pacific) but carries NO
COORDINATES -- "well to the east-southeast of the Hawaiian Islands" is not a position, and
geocoding it would be inventing data. The GRAPHICAL product carries the polygons NHC actually
drew, and it turns out to be archived:

    https://www.nhc.noaa.gov/gis/gtwo/archive/YYYYMMDDHHMM_gtwo.zip                (NHC)
    https://www.nhc.noaa.gov/gis/gtwo/archive/CPHC/gtwo_cphc_shapefiles_YYYY....zip (CPHC)

Measured coverage: **5,821 NHC issuances from 2023-05-15**, and CPHC from 2022-12. So the
positional pre-genesis record is about three and a half seasons deep -- thin, but real, and it
grows every day the daily job runs. That limit is reported, not smoothed over.

RESOLUTION IS A STATED HEURISTIC, NOT A PUBLISHED FACT. NHC does not publish "outlook area 2
became Hurricane Greg". Threads are matched to a best-track genesis within `link_km` and
`link_hours` of the thread's last observation, and every resolved row records the rule and the
distance that fired it in `source_key`. A thread with no match inside the window resolves to
'dissipated'. Both directions can be wrong -- a genuine development whose first fix lands
outside the window reads as a failure -- so the window is a parameter, the match distance is
kept, and the back-test that consumes this refuses until the sample is real.
"""

from __future__ import annotations

import re
import urllib.request
from datetime import datetime, timedelta, timezone

from ..provenance import ARCHIVE_DIR, Gap, PROCESSING_VERSION, USER_AGENT, _now, fetch
from ..retrieval.analogs import haversine_km
from ..sources.gtwo import read_areas
from ..store import append, read_table
from .daily import SHP_BASIN

NHC_ARCHIVE = "https://www.nhc.noaa.gov/gis/gtwo/archive/"
CPHC_INDEX = "https://www.nhc.noaa.gov/gis/archive_cpac_gtwo.php"

LINK_KM = 900.0        # thread continuity between issuances
MATCH_KM = 600.0       # thread -> best-track genesis
MATCH_HOURS = 96.0     # a thread may lead its genesis by this much


def _get(url: str, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def list_archived(*, include_cphc: bool = True) -> list[dict]:
    """Every archived outlook issuance, as {url, stamp, issued_utc, agency}, oldest first."""
    out = []
    html = _get(NHC_ARCHIVE).decode("utf-8", "replace")
    for name in sorted(set(re.findall(r"\d{12}_gtwo\.zip", html))):
        out.append({"url": NHC_ARCHIVE + name, "stamp": name[:12],
                    "issued_utc": _stamp_dt(name[:12]), "agency": "nhc"})
    if include_cphc:
        try:
            html = _get(CPHC_INDEX).decode("utf-8", "replace")
            for name in sorted(set(re.findall(
                    r"gtwo_cphc_shapefiles_(\d{12})\.zip", html))):
                out.append({
                    "url": f"{NHC_ARCHIVE}CPHC/gtwo_cphc_shapefiles_{name}.zip",
                    "stamp": name, "issued_utc": _stamp_dt(name), "agency": "cphc"})
        except Exception:
            pass          # the caller records the gap; a missing CPHC index is not fatal
    return sorted([o for o in out if o["issued_utc"]], key=lambda o: o["issued_utc"])


def _stamp_dt(stamp: str):
    try:
        return datetime(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8]),
                        int(stamp[8:10]), int(stamp[10:12]), tzinfo=timezone.utc)
    except ValueError:
        return None


def backfill(*, archive_dir=None, since: str | None = None, until: str | None = None,
             limit: int | None = None, link_km: float = LINK_KM,
             resolve: bool = True, verbose: bool = True) -> dict:
    base = archive_dir or ARCHIVE_DIR
    say = print if verbose else (lambda *a, **k: None)
    gaps: list[dict] = []

    issuances = list_archived()
    if since:
        issuances = [i for i in issuances if i["stamp"][:len(since)] >= since]
    if until:
        issuances = [i for i in issuances if i["stamp"][:len(until)] <= until]
    if limit:
        issuances = issuances[:limit]
    say(f"  archived issuances to ingest: {len(issuances)}")
    if not issuances:
        return {"issuances": 0, "rows": 0, "gaps": gaps}

    # THREADING. Identical rule to the daily job: NHC renumbers areas between issuances, so
    # identity is positional, not the area number. Threads are carried forward in memory here
    # because the back-fill walks the whole history in one ordered pass.
    threads: dict = {}          # (basin, key) -> last row
    rows: list[dict] = []
    sources: list = []
    failed = 0

    for n, iss in enumerate(issuances, 1):
        try:
            # Through provenance.fetch, not a bare GET, for two reasons that both matter:
            # every outlook that contributes a row gets its sha256 and download date recorded
            # like any other source in this archive, AND the fetch is cached, which turns a
            # ~50-minute non-resumable walk over 7,188 issuances into a resumable one.
            path, rec = fetch(f"gtwo/{iss['agency']}.{iss['stamp']}.zip", iss["url"],
                              note=f"archived graphical outlook {iss['stamp']}", timeout=90)
            sources.append(rec)
            areas = read_areas(path.read_bytes())
        except Exception:
            failed += 1
            continue
        seen = set()
        for a in areas:
            basin = SHP_BASIN.get(str(a.get("basin") or "").strip().lower(),
                                  "cpac" if iss["agency"] == "cphc" else "epac")
            lat, lon = a.get("lat"), a.get("lon")
            key, method = None, "new_thread"
            if lat is not None and lon is not None:
                best, bestd = None, None
                for (b, k), r in threads.items():
                    if b != basin or r.get("lat") is None:
                        continue
                    # A thread goes stale after 36 h without a mention. Five days was far
                    # too generous: NHC issues four outlooks a day, so a two-day silence
                    # means the area is gone, and a later area forming in the same region
                    # was being glued onto the dead thread. Measured consequence before
                    # this: one thread spanned 1,644 km and 15 days, swallowing both a
                    # precursor that became EP042026 AND an unrelated successor.
                    if (iss["issued_utc"] - r["observed_utc"]) > timedelta(hours=36):
                        continue
                    d = haversine_km(lat, lon, r["lat"], r["lon"])
                    if d <= link_km and (bestd is None or d < bestd):
                        best, bestd = k, d
                if best:
                    key, method = best, f"position_link<{bestd:.0f}km"
            if key is None:
                where = ("%.1f_%.1f" % (lat, lon) if lat is not None
                         else "area%s" % a.get("area_number"))
                key = f"{basin}-{iss['stamp']}-{where}"
            row = {
                "observed_utc": iss["issued_utc"], "issuance_utc": iss["issued_utc"],
                "basin": basin, "disturbance_key": key, "invest_id": None,
                "lat": lat, "lon": lon,
                "prob_48h_pct": a.get("prob_48h_pct"), "prob_7d_pct": a.get("prob_7d_pct"),
                "prob_48h_label": a.get("prob_48h_label"),
                "prob_7d_label": a.get("prob_7d_label"),
                "text": None, "source_url": iss["url"],
                "resolved_storm_id": None, "resolved_atcf_id": None,
                "outcome": "open", "outcome_utc": None, "hours_to_genesis": None,
                "source_key": f"gtwo_archive:{iss['stamp']}|link:{method}",
                "processing_version": PROCESSING_VERSION, "ingested_utc": _now(),
            }
            threads[(basin, key)] = row
            seen.add((basin, key))
            rows.append(row)
        if n % 500 == 0:
            say(f"    {n}/{len(issuances)} issuances, {len(rows)} observations")

    if failed:
        gaps.append(Gap(key="gtwo_archive_fetch",
                        what=f"{failed} archived outlooks could not be read",
                        why="fetch or shapefile parse failed",
                        impact="those issuances are absent from the disturbance log").as_dict())

    # ---- resolution against the best track -------------------------------------------
    #
    # MATCHING IS ON THE OBSERVATION NEAREST IN TIME TO A GENESIS, NOT ON THE THREAD'S LAST
    # OBSERVATION. The first version of this matched last-observation-only and missed a third
    # of real developments, in a way that biased the development rate DOWNWARD -- the worst
    # possible direction, since the whole reason this table exists is to supply an honest
    # denominator. The failure was concrete: the thread that became EP042026 was watched for
    # eleven days from 20% to 100%, sat 93 km from the genesis point at the genesis hour, and
    # still resolved as 'dissipated', because a later unrelated area had extended the thread
    # past the matching window.
    #
    # A thread is also SPLIT at the genesis it produced: observations after that instant
    # describe a different system and are re-keyed, then resolved on their own.
    resolved = dissipated = 0
    if resolve and rows:
        gen = [g for g in read_table("genesis_events", base).to_pylist()
               if g.get("genesis_utc") and g.get("genesis_lat") is not None]
        by_thread: dict = {}
        for r in rows:
            by_thread.setdefault((r["basin"], r["disturbance_key"]), []).append(r)
        say(f"  resolving {len(by_thread)} threads against {len(gen)} genesis events")

        # ONE GENESIS COMES FROM ONE DISTURBANCE, so the assignment is one-to-one.
        # Letting every thread independently claim its nearest genesis produced 11 "developed"
        # threads for 8 distinct storms -- three storms claimed twice, which both inflates the
        # numerator and leaves the true parent of another storm unmatched. Candidate pairs are
        # therefore scored, sorted by distance, and assigned greedily: each genesis is claimed
        # once, each thread develops at most once.
        queue = list(by_thread.items())
        passes = 0
        claimed_gen: set = set()
        while queue and passes < 4:
            passes += 1
            cands = []
            for (basin, key), obs in queue:
                obs.sort(key=lambda r: r["observed_utc"])
                for g in gen:
                    if g["storm_id"] in claimed_gen:
                        continue
                    inwin = [o for o in obs if o.get("lat") is not None and
                             -6.0 <= (g["genesis_utc"] - o["observed_utc"]).total_seconds()
                             / 3600.0 <= MATCH_HOURS]
                    if not inwin:
                        continue
                    o = min(inwin, key=lambda o: abs(
                        (g["genesis_utc"] - o["observed_utc"]).total_seconds()))
                    d = haversine_km(o["lat"], o["lon"], g["genesis_lat"], g["genesis_lon"])
                    if d <= MATCH_KM:
                        cands.append((d, (basin, key), g))
            cands.sort(key=lambda c: c[0])

            taken_thread: set = set()
            matched: dict = {}
            for d, tkey, g in cands:
                if tkey in taken_thread or g["storm_id"] in claimed_gen:
                    continue
                taken_thread.add(tkey)
                claimed_gen.add(g["storm_id"])
                matched[tkey] = (g, d)

            nxt = []
            for (basin, key), obs in queue:
                hit = matched.get((basin, key))
                if not hit:
                    for r in obs:
                        r["outcome"] = "dissipated"
                        r["outcome_utc"] = obs[-1]["observed_utc"]
                        r["source_key"] += "|match:none"
                    dissipated += 1
                    continue
                best, bestd = hit
                cut = best["genesis_utc"]
                for r in obs:
                    if r["observed_utc"] <= cut:
                        r["outcome"] = "developed"
                        r["resolved_storm_id"] = best["storm_id"]
                        r["resolved_atcf_id"] = best.get("atcf_id")
                        r["outcome_utc"] = cut
                        r["hours_to_genesis"] = (
                            cut - r["observed_utc"]).total_seconds() / 3600.0
                        r["source_key"] += f"|match:{bestd:.0f}km"
                resolved += 1
                after = [r for r in obs if r["observed_utc"] > cut]
                if after:
                    newkey = f"{key}+post{cut:%Y%m%d%H%M}"
                    for r in after:
                        r["disturbance_key"] = newkey
                        r["source_key"] += "|split_at_genesis"
                    nxt.append(((basin, newkey), after))
            queue = nxt

    _p, added, replaced = append("daily_disturbances", rows, base)
    say(f"  appended {added} observations ({replaced} replaced); "
        f"{resolved} threads developed, {dissipated} did not")
    return {
        "issuances": len(issuances), "rows": len(rows), "added": added,
        "sources_recorded": len(sources),
        "threads_developed": resolved, "threads_dissipated": dissipated,
        "fetch_failures": failed, "gaps": gaps,
        "resolution_rule": (f"threads and best-track genesis events are matched ONE-TO-ONE, "
                            f"greedily by distance, using each thread's observation nearest in "
                            f"time to the genesis; a pair qualifies within {MATCH_KM:.0f} km and "
                            f"-6..+{MATCH_HOURS:.0f} h. NHC does not publish this linkage - it "
                            f"is this archive's stated heuristic, and every matched row records "
                            f"the distance that fired it."),
    }
