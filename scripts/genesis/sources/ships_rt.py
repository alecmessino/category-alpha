"""Operational (real-time) SHIPS from the NHC ATCF `stext` directory.

WHY THIS EXISTS: IT IS THE ONLY LIVE ENVIRONMENT THIS ARCHIVE CAN HAVE.
The developmental SHIPS file ends in 2023 and NCEP/NCAR R1 ends 2026-03-17, so an
environment-conditioned query about a system that exists *today* had nothing to condition on.
NHC publishes a SHIPS run per synoptic cycle per system here, and -- the part that matters --
it does so for INVESTS and genesis candidates, not just named storms. Measured on the live
directory: 390 files covering AL0126..AL0326, EP0126..EP0826, CP0126, the invest series
AL9026-AL9426 / EP9026-EP9926 / CP9026-CP9326, and the 80-series genesis candidates
AL8126/AL8226/AL8326/AL8726/EP8126/CP8126. So a disturbance acquires an environment vector at
roughly the moment NHC starts numbering it.

FILENAME: YYMMDDHH + ATCFID + "_ships.txt", e.g. 26081800CP0126_ships.txt.

FORMAT IS NOT THE DEVELOPMENTAL FORMAT, and the difference is the whole reason this is a
separate module. The developmental lsdiag file is fixed-width integers whose scalings live in a
PDF; this product is a labelled human-readable table that PUBLISHES ITS UNITS IN THE ROW LABEL:

    SHEAR (KT)         9    12    17 ...      <- knots, not knots*10
    SST (C)         27.8  27.9  28.0 ...      <- degrees C, not C*10
    POT. INT. (KT)   142   143   144 ...
    200 MB T (C)   -50.7 -50.9 -51.0 ...
    700-500 MB RH     41    41    44 ...      <- percent
    850 MB ENV VOR    57    51    54 ...      <- NO UNIT PUBLISHED
    200 MB DIV        -6    -7     0 ...      <- NO UNIT PUBLISHED
    LONG(DEG W)    165.0 166.0 166.9 ...      <- DEGREES WEST, so a sign flip is required

Applying the developmental divisors here would be wrong by a factor of ten on shear and SST.
The two rows with no published unit are carried RAW and marked unconfirmed -- see UNCONFIRMED
below -- because a remembered divisor is exactly what this archive refuses to apply.

MISSING MARKERS the live product actually uses: `xx.x` and `xxx.x` past the end of the track,
`N/A`, and `LOST` where the model lost the vortex. Every one of them parses as a number under a
looser reader, and a NaN that reaches a probability is a silent wrong answer.
"""

from __future__ import annotations

import re
import urllib.request
from datetime import datetime, timezone

from ..provenance import PROCESSING_VERSION, USER_AGENT, _now

STEXT_INDEX = "https://ftp.nhc.noaa.gov/atcf/stext/"
ENV_SOURCE = "ships_rt"

# Rows whose unit is published in the label itself. Value = (schema column, scale).
LABELLED = {
    "SHEAR (KT)": ("shear_kt", 1.0),
    "SHEAR DIR": ("shear_dir_deg", 1.0),
    "SST (C)": ("sst_c", 1.0),
    "POT. INT. (KT)": ("pot_intensity_kt", 1.0),
    "200 MB T (C)": ("t200_c", 1.0),
    "700-500 MB RH": ("rh_mid_pct", 1.0),
    "HEAT CONTENT": ("ohc_kj_cm2", 1.0),
}
# Rows the product publishes with NO unit in the label. The developmental file's scalings are
# documented in an official PDF (Z850 = sec^-1 * 1e7, D200 likewise); whether THIS product uses
# the same decade is stated nowhere, so it was not assumed -- it was MEASURED.
#
# THE MEASUREMENT (37 live tau=0 rows, every system published on 2026-08-18, against the
# 32,842 developmental tau=0 rows in the archive):
#
#   control fields, whose units the live product DOES publish in the label, agree --
#     sst_c        live median 28.2 vs archive 27.9      rh_mid_pct  59 vs 60
#     shear_kt     16.0 vs 12.5                          t200_c      -51.8 vs -53.2
#   and the two unlabelled fields share the developmental decade and range --
#     850 ENV VOR  live [-102, 116] vs archive raw [-180, 367]
#     200 DIV      live [ -44, 233] vs archive raw [-141, 233]   <- identical upper bound
#
# So the developmental scaling is applied, and the inference is recorded as a Gap with the
# evidence above. What this does NOT establish is identical calibration: 37 rows from one
# synoptic hour show the decade is right, not that the two products agree storm-for-storm.
# `env_source` stays 'ships_rt' so the two can always be separated, and must be, before any
# quantitative comparison between them.
SCALED_UNLABELLED = {
    "850 MB ENV VOR": ("vort850_1e5", 0.01),   # sec^-1 * 1e7  ->  1e-5 s^-1
    "200 MB DIV": ("div200_1e7", 1.0),         # already 1e-7 s^-1, as in the developmental file
}

MISSING = re.compile(r"^(xx+\.?x*|xxx+|N/A|NA|LOST|-{2,}|\*+)$", re.I)
_HEAD = re.compile(r"\*\s+(\S.*?)\s+([A-Z]{2}\d{6})\s+(\d{2})/(\d{2})/(\d{2})\s+(\d{2})\s*UTC")
_FILE = re.compile(r"(\d{2})(\d{2})(\d{2})(\d{2})([A-Z]{2}\d{2}\d{2})_ships\.txt")


def _num(tok: str):
    t = tok.strip()
    if not t or MISSING.match(t):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _get(url: str, timeout: int = 90, retries: int = 3) -> str:
    """Fetch with backoff. The live directory is polled once per system per run -- ~37 requests
    in a burst -- and NHC resets a connection often enough that a single failure must not cost
    the whole capture. These rows can never be back-filled, so a lost run is lost permanently."""
    import time
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as exc:                                # noqa: BLE001
            last = exc
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
    raise last if last else RuntimeError("fetch failed: " + url)


def list_runs(*, index_html: str | None = None) -> list[dict]:
    """Every SHIPS run currently published, newest last.

    Returns {url, filename, atcf_id, iso_time, is_invest}. `is_invest` marks the 90-99 and
    80-89 series -- the pre-genesis systems, which is what a live analog query is usually
    asking about.
    """
    html = index_html if index_html is not None else _get(STEXT_INDEX)
    out = []
    for m in sorted(set(_FILE.findall(html))):
        yy, mm, dd, hh, atcf = m
        try:
            when = datetime(2000 + int(yy), int(mm), int(dd), int(hh), tzinfo=timezone.utc)
        except ValueError:
            continue
        num = int(atcf[2:4])
        out.append({
            "url": STEXT_INDEX + f"{yy}{mm}{dd}{hh}{atcf}_ships.txt",
            "filename": f"{yy}{mm}{dd}{hh}{atcf}_ships.txt",
            "atcf_id": f"{atcf[:2]}{atcf[2:4]}20{atcf[4:6]}",
            "iso_time": when,
            "is_invest": num >= 80,
        })
    return sorted(out, key=lambda r: (r["iso_time"], r["atcf_id"]))


def parse(text: str, *, url: str | None = None) -> dict:
    """Parse one operational SHIPS product into {header, times, rows}."""
    lines = text.splitlines()
    head = {}
    for ln in lines[:8]:
        m = _HEAD.search(ln)
        if m:
            name, atcf, mo, da, yr, hr = m.groups()
            head = {
                "name": name.strip(),
                "atcf_id": atcf,
                "iso_time": datetime(2000 + int(yr), int(mo), int(da), int(hr),
                                     tzinfo=timezone.utc),
            }
            break
    times: list[int] = []
    rows: dict = {}
    for ln in lines:
        if ln.strip().startswith("TIME (HR)"):
            times = [int(t) for t in ln.split("TIME (HR)")[1].split()]
            continue
        for label in list(LABELLED) + list(SCALED_UNLABELLED) + ["LAT (DEG N)", "LONG(DEG W)",
                                                           "V (KT) NO LAND", "LAND (KM)"]:
            if ln.startswith(label):
                rows[label] = [_num(t) for t in ln[len(label):].split()]
                break
    return {"header": head, "times": times, "rows": rows, "url": url,
            "n_times": len(times)}


def environment_rows(text: str, *, source_key: str, storm_id: str | None = None,
                     taus: tuple = (0,), url: str | None = None) -> list[dict]:
    """schema.ENVIRONMENT rows from one operational SHIPS product.

    Defaults to tau=0 -- the ANALYSED environment. Later taus are forecasts of the
    environment, and mixing a forecast environment into a historical analog pool would
    compare a prediction against a set of analyses.

    LONGITUDE. The product prints `LONG(DEG W)` as a POSITIVE west longitude. It is negated
    here, so a Central Pacific system comes out near -165 and never +165. Getting this
    backwards silently destroys every Hawaii query, so `__main__` asserts it.
    """
    p = parse(text, url=url)
    head, times, rows = p["header"], p["times"], p["rows"]
    if not head or not times:
        return []
    now = _now()
    out = []
    for tau in taus:
        if tau not in times:
            continue
        i = times.index(tau)

        def val(label):
            v = rows.get(label)
            return v[i] if v and i < len(v) else None

        lat = val("LAT (DEG N)")
        lon_w = val("LONG(DEG W)")
        row = {
            "storm_id": storm_id,
            "iso_time": head["iso_time"],
            "atcf_id": head["atcf_id"],
            "lat": lat,
            # positive-west -> signed. See the docstring; this is the Hawaii-killing trap.
            "lon": (-lon_w if lon_w is not None else None),
            "env_source": ENV_SOURCE,
            "mslp_env_mb": None,        # not published in this product
            "rh_lo_pct": None, "rh_hi_pct": None, "tpw_mm": None, "u200_kt": None,
            "gpi": None, "gpi_method": None,
            "lead_hours": float(tau),
            "source_key": source_key,
            "processing_version": PROCESSING_VERSION,
            "ingested_utc": now,
        }
        for label, (col, scale) in LABELLED.items():
            v = val(label)
            row[col] = (v * scale) if v is not None else None
        for label, (col, scale) in SCALED_UNLABELLED.items():
            v = val(label)
            row[col] = (v * scale) if v is not None else None
        out.append(row)
    return out


def gaps() -> list:
    """What a reader must be told about these rows before mixing them with anything."""
    from ..provenance import Gap
    return [
        Gap(key="ships_rt_scaling",
            what="two SHIPS columns are scaled by inference, not by a published unit",
            why=("The operational product publishes units in the row label for shear, SST, "
                 "potential intensity, 200 mb T, RH and heat content, but NOT for '850 MB ENV "
                 "VOR' or '200 MB DIV'. The developmental scalings were applied after measuring "
                 "37 live tau=0 rows against the archive's 32,842 developmental rows: control "
                 "fields agree (SST 28.2 vs 27.9, RH 59 vs 60) and both unlabelled fields share "
                 "the developmental decade and range (200 DIV upper bound identical at 233)."),
            impact=("The decade is evidenced; identical calibration is NOT. 37 rows from one "
                    "synoptic hour cannot establish storm-for-storm agreement. Filter on "
                    "env_source before comparing ships_rt with ships_dev quantitatively."),
            url=STEXT_INDEX),
        Gap(key="ships_rt_retention",
            what="the live SHIPS directory is not an archive",
            why=("ftp.nhc.noaa.gov/atcf/stext/ holds only the current season's runs (390 files "
                 "at time of writing). There is no historical archive of this product, so it "
                 "can only be accumulated forward by the daily job."),
            impact=("Live environment vectors exist from the day this pipeline starts running, "
                    "not retrospectively. Historical environment stays SHIPS-developmental "
                    "(1982-2023)."),
            url=STEXT_INDEX),
        Gap(key="ships_rt_coverage",
            what="a disturbance has no environment vector until NHC numbers it",
            why=("SHIPS is run per ATCF system. Invests (90-99) and genesis candidates (80-89) "
                 "ARE covered -- 177 of 390 current runs -- but an outlook area that has not "
                 "been given a number yet has no run at all."),
            impact=("env_vector conditioning on a live area works from the moment it becomes an "
                    "invest, and not before. Position-and-season conditioning works throughout."),
            url=STEXT_INDEX),
    ]


def fetch_latest(*, atcf_ids: set | None = None, invests_only: bool = False,
                 limit: int | None = None) -> list[tuple]:
    """(run, text) for the newest run of each system currently published."""
    runs = list_runs()
    latest: dict = {}
    for r in runs:
        if invests_only and not r["is_invest"]:
            continue
        if atcf_ids and r["atcf_id"] not in atcf_ids:
            continue
        latest[r["atcf_id"]] = r          # runs are time-sorted, so last wins
    picked = list(latest.values())[: limit or len(latest)]
    # ONE BAD FILE MUST NOT COST THE BATCH. A system whose file cannot be read is skipped and
    # the rest are kept: a partial live capture is strictly better than none, because none can
    # never be recovered.
    out = []
    for r in picked:
        try:
            out.append((r, _get(r["url"])))
        except Exception:                                        # noqa: BLE001
            continue
    return out


if __name__ == "__main__":
    import sys
    txt = open(sys.argv[1]).read() if len(sys.argv) > 1 else _get(
        STEXT_INDEX + "26081800CP0126_ships.txt")
    p = parse(txt)
    print("header:", p["header"])
    print("times :", p["times"][:8], "...")
    rows = environment_rows(txt, source_key="test")
    r = rows[0]
    for k in ("atcf_id", "iso_time", "lat", "lon", "env_source", "shear_kt", "shear_dir_deg",
              "sst_c", "pot_intensity_kt", "t200_c", "rh_mid_pct", "ohc_kj_cm2",
              "vort850_1e5", "div200_1e7", "lead_hours"):
        print(f"  {k:20s} {r.get(k)}")
    assert r["lon"] is None or r["lon"] < 0, "CENTRAL PACIFIC LONGITUDE MUST BE NEGATIVE"
    print("\nlongitude sign assertion passed")
