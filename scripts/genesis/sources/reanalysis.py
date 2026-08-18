"""Along-track environment from a gridded reanalysis, subset point-by-point over OPeNDAP.

WHY THIS FILE IS NOT ERA5, AND WHY THAT IS RECORDED RATHER THAN HIDDEN. The specification
for this archive asked for ERA5. ERA5 is not reachable from this environment and both
routes were tried against the real network before this module was written:

  * Copernicus CDS (cdsapi). POST to
    https://cds.climate.copernicus.eu/api/retrieve/v1/processes/reanalysis-era5-pressure-levels/execution
    returns HTTP 401 {"type":"permission denied","detail":"authentication required"}. The
    host resolves and the process listing is public (HTTP 200), so this is not a firewall:
    a retrieval needs a personal access token, and no credential exists here (~/.cdsapirc
    absent, no CDSAPI_* in the environment). Nobody has provisioned a key.
  * AWS Open Data mirror (era5-pds). https://era5-pds.s3.amazonaws.com/... returns HTTP 403
    <Code>AccessDenied</Code>, for both an object GET and a bucket listing.

That is a GAP, it is returned by gaps() with those exact reasons, and it is the first
thing a reader of this table should see. The substitute is NOT presented as equivalent.

WHAT WE USE INSTEAD. NCEP/NCAR Reanalysis 1 on the NOAA PSL THREDDS server, which serves
OPeNDAP and therefore lets us pull a ten-by-ten-gridpoint window out of a 546 MB/year file
instead of downloading the year. Verified request shape (this exact URL was run):

    https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis/pressure/uwnd.2020.nc.ascii
        ?uwnd[908:1:908][2:1:2][30:1:32][87:1:89]

The NCSS endpoint on the same server is 404; .ascii over OPeNDAP is the working transport.

WHAT THE SUBSTITUTION COSTS, PLAINLY. NCEP R1 is a 2.5 degree x 2.5 degree global grid,
four times a day. ERA5 is 0.25 degree, hourly. Three consequences, none of them cosmetic:

  * A tropical cyclone core is NOT RESOLVED at 2.5 degrees. One grid cell is ~275 km on a
    side at the equator; the radius of maximum wind of a hurricane is 20-60 km. Nothing in
    this table describes the storm. It describes the synoptic environment the storm sits
    in, smeared over a cell far larger than the storm.
  * The nearest-neighbour sample can be up to 1.25 degrees (~140 km) from the position
    asked for. lat/lon in the returned row is WHERE THE ENVIRONMENT WAS ASKED FOR, not
    where it was sampled; two track points 200 km apart can return byte-identical values.
  * The finite-difference vorticity and divergence below are centred differences over TWO
    cells, i.e. a ~550 km baseline. They are environmental (monsoon trough / ITCZ) vorticity
    at synoptic scale. A SHIPS Z850 is a 0-1000 km storm-relative average with the vortex
    left in; these two numbers are not the same quantity and must not be pooled blindly.

env_source is therefore the literal string 'ncep_r1' on every row this module emits, so a
query can separate these rows from ships_dev rows without reading the manifest, and no
reader can mistake them for ERA5-quality fields.

WHAT THIS MODULE IS FOR. Two jobs SHIPS structurally cannot do:
  (a) THE PRE-GENESIS ENVIRONMENT. SHIPS records begin when an ATCF invest/storm exists.
      The question this archive is built to answer -- what did the environment look like
      before there was a storm -- has no SHIPS record by construction. A reanalysis grid
      has a value at every point of every 6-hourly analysis whether or not anything is
      there, which is exactly what a pre-genesis query needs.
  (b) 2024 ONWARDS. The SHIPS developmental files stop at 2023. NCEP R1 on this server is
      current: uwnd.2026.nc had 304 time steps when this was written (through 2026-03-17
      18Z), and the same 304 steps exist for slp, pr_wtr, rhum, air and vwnd, so a row is
      either complete for all fields at a time or absent for all of them.

FORMAT, VERIFIED AGAINST THE REAL SERVER (every claim below was printed from a live
response before the parser was written, and re-checked after):

  * GRID. lat[73] = 90.0 down to -90.0 in steps of -2.5 (DESCENDING -- index 0 is the north
    pole). lon[144] = 0.0 to 357.5 ascending, i.e. degrees EAST, so a signed -180..180
    longitude must be taken modulo 360 before it is used as an index. 140 W -> 220.0 ->
    index 88.
  * LEVELS ARE NOT THE SAME FOR EVERY VARIABLE. This is the trap the assignment flagged
    and it is real:
        uwnd, vwnd, air, hgt   level[17] = 1000 925 850 700 600 500 400 300 250 200 150
                                          100 70 50 30 20 10
        rhum, shum             level[8]  = 1000 925 850 700 600 500 400 300
    So 850/600/200 hPa wind is available, 600 hPa RH is available, and RH ABOVE 300 hPa
    DOES NOT EXIST IN THIS DATASET. Requesting rhum at 200 hPa is not a slow path or a
    degraded path, it is a path that returns None and records a gap.
  * TIME. Float64 'hours since 1800-01-01 00:00:0.0', delta_t 6 hours, one file per
    calendar year starting at 00Z on 1 January. Verified arithmetically, not assumed:
    2020-01-01 00Z is 1928472.0 and the DAS actual_range for uwnd.2020.nc starts at exactly
    1928472.0; 2020-08-15 00Z is 1933920.0 and the response for time index 908 returned
    exactly 1933920.0. The index is therefore (when - Jan 1 of that year) / 6 h, and the
    code CHECKS the time coordinate that comes back rather than trusting that formula.
  * .ascii BODY LAYOUT. A header repeating the DDS, then a line of dashes, then blocks
    separated by blank lines. Block 1 is the data: a header 'uwnd.uwnd[1][1][3][3]' and
    then rows 'i][j], v, v, v' where the LEADING bracket indices are the outer dimensions
    and the FASTEST (last) dimension runs across the row. Then one block per MAP:
    'uwnd.time[1]', 'uwnd.level[1]', 'uwnd.lat[3]', 'uwnd.lon[3]', each followed by its
    values on one line. Every response carries its own coordinates, which is why this
    module can afford to verify each window instead of trusting an index.
  * UNITS COME FROM THE DAS, NOT FROM MEMORY. uwnd/vwnd 'm/s'; rhum '%'; air 'degK';
    slp 'Pascals' (NOT hPa -- a raw slp value is ~101000 and publishing it into an mb
    column would be off by a factor of 100); pr_wtr 'kg/m^2'. missing_value is
    -9.96921E36 on every variable checked, so anything non-finite or of absurd magnitude
    is treated as missing.
  * ERRORS ARE HTTP 4xx WITH AN 'Error {' BODY. A time index past the end of the file gives
    400 'Bad Projection Request: stop >= size'; a year with no file gives 404 'No such file
    or directory'; an unknown variable gives 400. None of these are retried, because none
    of them will change on a second attempt.

NETWORK DISCIPLINE, AND WHY IT IS SHAPED THIS WAY. A build can ask for tens of thousands of
points. Three rules keep that from becoming tens of thousands of requests or an infinite
hang:
  1. TILED CACHE. Requests are quantised to 20-degree tiles (8 grid cells) plus a 1-cell
     halo. Every point inside one tile at one analysis time shares ONE request per
     variable per level -- so an entire Central Pacific track segment at 2020-08-15 00Z
     costs 8 requests total, not 8 per point. The halo is what makes the 3x3 vorticity
     stencil available for points on the tile edge without a second request.
  2. THE CACHE IS THE PROVENANCE. Downloads go through provenance.fetch, so every window
     is on disk under .genesis-cache/ncep_r1/ with its sha256 recorded in a SourceRecord;
     sources() hands those to the build for MANIFEST.json. A re-run is offline and byte-
     identical, and GENESIS_OFFLINE=1 forbids the network entirely (uncached windows then
     become recorded gaps rather than new downloads).
  3. NOTHING RAISES. A failed extraction returns None and records a gap. After
     MAX_CONSECUTIVE_FAILURES failures in a row the module trips a breaker and stops trying
     for the rest of the process -- a THREDDS outage costs one timeout, not one timeout per
     point, and a build that ran during an outage says so in its manifest instead of dying
     halfway through with a stack trace.

TIME IS NOT SNAPPED. environment_at() and fetch_point() refuse a time that is not exactly
on a 6-hourly analysis step (00/06/12/18Z, minute and second zero). Nearest-neighbour in
SPACE is a documented sampling choice and the grid leaves us no alternative; nearest-
neighbour in TIME would let a row labelled 03Z carry the 00Z environment, and shifting a
genesis environment by three hours to make a row appear is exactly the silent substitution
this archive forbids. Track points in this archive are synoptic, so this costs nothing.
"""

from __future__ import annotations

import datetime as _dt
import math
import os
import re
import urllib.error
from pathlib import Path

from genesis.provenance import CACHE_DIR, Gap, PROCESSING_VERSION, SourceRecord, fetch

__all__ = ["grid_index", "fetch_point", "environment_at", "gaps", "sources"]

# --- constants, all verified against the live server ------------------------------------

THREDDS_ROOT = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis"
ENV_SOURCE = "ncep_r1"

# The two published level sets. Verified by fetching '?level' from uwnd/air/hgt (17 values)
# and rhum/shum (8 values) for 2020. Every response is additionally checked against the
# level coordinate it returns, so a year whose file disagreed with this would be caught.
LEVELS_17 = (1000., 925., 850., 700., 600., 500., 400., 300., 250., 200., 150., 100.,
             70., 50., 30., 20., 10.)
LEVELS_8 = (1000., 925., 850., 700., 600., 500., 400., 300.)

# lat DESCENDS from the north pole; lon is degrees east. Both confirmed value-by-value.
GRID_LATS = tuple(90.0 - 2.5 * i for i in range(73))
GRID_LONS = tuple(2.5 * i for i in range(144))

TIME_EPOCH = _dt.datetime(1800, 1, 1, tzinfo=_dt.timezone.utc)  # 'hours since 1800-01-01'
ANALYSIS_STEP_HOURS = 6

# Tile quantisation for the request cache. 8 cells = 20 degrees; +1 cell of halo on each
# side makes the 3x3 finite-difference stencil available for every point in the core.
TILE_CELLS = 8
TILE_HALO = 1

# Trip the breaker after this many consecutive network failures.
MAX_CONSECUTIVE_FAILURES = 5
# Seconds per OPeNDAP request. Windows are ~1.3 KB, so this is a liveness bound on the
# server, not a transfer budget; provenance.fetch retries a transport failure 3 times, so a
# genuinely dead endpoint costs at most ~3x this once, and then the breaker takes over.
DEFAULT_TIMEOUT = 120

# m/s -> kt. Exact: a nautical mile is 1852 m by definition, so 1 m/s = 3600/1852 kt.
MS_TO_KT = 3600.0 / 1852.0
# Mean Earth radius. Used only for the finite-difference metric terms; at 2.5 degrees the
# choice between 6371 km and a local ellipsoidal radius is far below the resolution error.
EARTH_RADIUS_M = 6371000.0
KELVIN_ZERO_C = 273.15

# Anything this large in magnitude is the missing_value sentinel (-9.96921E36).
_MISSING_ABS = 1e30


class _Var:
    """One published variable: where it lives, which levels it has, what its units are.

    `stem` is the filename stem and `name` the variable name inside the file -- they differ
    for precipitable water, whose file is pr_wtr.eatm.YYYY.nc but whose variable is pr_wtr.
    """

    __slots__ = ("name", "directory", "stem", "levels", "units")

    def __init__(self, name: str, directory: str, stem: str,
                 levels: tuple[float, ...] | None, units: str) -> None:
        self.name = name
        self.directory = directory
        self.stem = stem
        self.levels = levels
        self.units = units


# Only variables whose level list and units were read off the live DAS/DDS are registered.
VARIABLES: dict[str, _Var] = {
    "uwnd": _Var("uwnd", "pressure", "uwnd", LEVELS_17, "m/s"),
    "vwnd": _Var("vwnd", "pressure", "vwnd", LEVELS_17, "m/s"),
    "air": _Var("air", "pressure", "air", LEVELS_17, "degK"),
    "hgt": _Var("hgt", "pressure", "hgt", LEVELS_17, "m"),
    "rhum": _Var("rhum", "pressure", "rhum", LEVELS_8, "%"),
    "shum": _Var("shum", "pressure", "shum", LEVELS_8, "kg/kg"),
    "slp": _Var("slp", "surface", "slp", None, "Pascals"),
    "pr_wtr": _Var("pr_wtr", "surface", "pr_wtr.eatm", None, "kg/m^2"),
}

# The levels this module reads for the ENVIRONMENT row, named once so the docstring, the
# gaps and the code cannot drift apart.
SHEAR_LOW_HPA = 850.0
SHEAR_HIGH_HPA = 200.0
RH_MID_HPA = 600.0     # NOT the SHIPS 700-500 hPa layer. See gaps().
VORT_HPA = 850.0
DIV_HPA = 200.0

# --- module state: caches, provenance, gaps ---------------------------------------------

_TILE_MEMO: dict[tuple, dict] = {}          # in-process memo, so one build re-reads nothing
_COVERAGE: dict[tuple[str, int], int | None] = {}   # (stem, year) -> number of analyses
_SOURCES: dict[str, SourceRecord] = {}      # every window fetched, for MANIFEST.json
_DYNAMIC_GAPS: dict[str, Gap] = {}          # deduped by a stable id, not by message
_STATE = {"consecutive_failures": 0, "breaker_open": False}


class _WindowError(RuntimeError):
    """A window could not be obtained or did not describe what we asked for."""


def _utcnow_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _offline() -> bool:
    return str(os.environ.get("GENESIS_OFFLINE", "")).lower() in ("1", "true", "yes", "on")


def _record_gap(gap_id: str, what: str, why: str, impact: str, url: str = "") -> None:
    """Record a gap once. Deduped by `gap_id` so a 10,000-point build that hits the same
    structural hole 10,000 times reports it once, with the count of hits."""
    existing = _DYNAMIC_GAPS.get(gap_id)
    if existing is not None:
        existing.impact = _bump_hits(existing.impact)
        return
    _DYNAMIC_GAPS[gap_id] = Gap(key=ENV_SOURCE, what=what, why=why,
                                impact=impact + " [hits: 1]", url=url)


_HITS_RE = re.compile(r"\[hits: (\d+)\]$")

# Distinct causes must not be merged into one gap. Deduping a whole build's failures under
# 'window for uwnd at 850 hPa could not be read' would let 'the 1900 file does not exist'
# and 'that time is past the end of the 2026 file' share one entry, and only the first
# reason would ever be published -- absence reported imprecisely is barely better than
# absence not reported.
_CAUSES = (
    ("does not exist on the server", "missing_year"),
    ("is outside that record", "past_end"),
    ("is not published at", "unpublished_level"),
    ("has no levels", "unpublished_level"),
    ("GENESIS_OFFLINE", "offline"),
    ("breaker open", "breaker"),
    ("unregistered variable", "unknown_variable"),
    ("HTTP ", "http_status"),
    ("DAP Error", "dap_error"),
    ("returned", "grid_mismatch"),
)


def _cause_tag(message: str) -> str:
    for needle, tag in _CAUSES:
        if needle in message:
            return tag
    return "transport"


def _bump_hits(impact: str) -> str:
    m = _HITS_RE.search(impact)
    if not m:
        return impact + " [hits: 2]"
    return impact[: m.start()] + "[hits: %d]" % (int(m.group(1)) + 1)


# --- pure helpers ------------------------------------------------------------------------

def grid_index(coord_values, target) -> int:
    """Index of the coordinate value nearest `target`. NEAREST ONLY -- never interpolates.

    Ties go to the LOWER index deterministically (min() keeps the first minimum), so the
    same request always reads the same cell across runs; a tie-break that depended on
    floating-point noise would make the archive irreproducible for points that land exactly
    halfway between two 2.5-degree cells, which on this grid is every point at x.25 or
    x.75 degrees.

    Raises ValueError on an empty coordinate array -- there is no nearest cell to a grid
    that does not exist, and returning 0 would silently read the north pole.
    """
    values = list(coord_values)
    if not values:
        raise ValueError("grid_index: empty coordinate array")
    t = float(target)
    best = 0
    best_d = abs(float(values[0]) - t)
    for i in range(1, len(values)):
        d = abs(float(values[i]) - t)
        if d < best_d:
            best, best_d = i, d
    return best


def _signed_lon(lon_east: float) -> float:
    """0..360 degrees east -> signed -180..180, the archive's convention."""
    x = float(lon_east) % 360.0
    return x - 360.0 if x > 180.0 else x


def _finite(value: float | None) -> float | None:
    """None for the missing_value sentinel, a NaN, or anything of absurd magnitude."""
    if value is None:
        return None
    v = float(value)
    if v != v or math.isinf(v) or abs(v) > _MISSING_ABS:
        return None
    return v


def _as_utc(when: _dt.datetime) -> _dt.datetime:
    if not isinstance(when, _dt.datetime):
        raise TypeError("when must be a datetime, got %r" % type(when).__name__)
    if when.tzinfo is None:
        return when.replace(tzinfo=_dt.timezone.utc)
    return when.astimezone(_dt.timezone.utc)


def _is_analysis_time(when: _dt.datetime) -> bool:
    return (when.hour % ANALYSIS_STEP_HOURS == 0 and when.minute == 0
            and when.second == 0 and when.microsecond == 0)


def _hours_since_epoch(when: _dt.datetime) -> float:
    return (when - TIME_EPOCH).total_seconds() / 3600.0


def _time_index(when: _dt.datetime) -> int:
    """Index into the year file. Files start at 00Z 1 January and step 6 h with no gaps --
    verified from the DAS actual_range (1928472.0..1937250.0 over 1464 steps for 2020) and
    re-verified per request against the time coordinate the server returns."""
    year_start = _dt.datetime(when.year, 1, 1, tzinfo=_dt.timezone.utc)
    return int(round((when - year_start).total_seconds() / 3600.0 / ANALYSIS_STEP_HOURS))


# --- the .ascii parser -------------------------------------------------------------------

_SEPARATOR_RE = re.compile(r"^-{5,}\s*$")
_HEADER_RE = re.compile(r"^([A-Za-z_][\w.]*)((?:\[\d+\])+)\s*$")
_ROW_PREFIX_RE = re.compile(r"^(?:\[\d+\])+\s*,\s*")
_DIM_RE = re.compile(r"\[(\d+)\]")


def _parse_dods_ascii(text: str) -> dict[str, dict]:
    """Parse an OPeNDAP .ascii body into {array_name: {'dims': [...], 'values': [...]}}.

    Handles 1-D through 4-D uniformly: the leading '[i][j], ' on a data row is positional
    bookkeeping the flat value order already carries, so it is stripped and every remaining
    comma-separated token is appended in file order. Values are checked against the declared
    dimensions afterwards -- a truncated response (a proxy cutting a body short) then fails
    loudly here instead of silently yielding a short array that the caller indexes into.
    """
    if text.lstrip().startswith("Error {"):
        raise _WindowError("server returned a DAP Error body: %s"
                           % " ".join(text.split())[:200])

    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        if _SEPARATOR_RE.match(line):
            start = i + 1
            break
    if start is None:
        raise _WindowError("no '-----' separator in .ascii body (got %r)"
                           % " ".join(text.split())[:200])

    arrays: dict[str, dict] = {}
    name: str | None = None
    dims: list[int] = []
    values: list[float] = []

    def flush() -> None:
        if name is None:
            return
        expected = 1
        for d in dims:
            expected *= d
        if len(values) != expected:
            raise _WindowError("array %s declared %s = %d values but %d were parsed"
                               % (name, dims, expected, len(values)))
        arrays[name] = {"dims": list(dims), "values": list(values)}

    for raw in lines[start:]:
        line = raw.strip()
        if not line:
            continue
        m = _HEADER_RE.match(line)
        if m:
            flush()
            name = m.group(1)
            dims = [int(d) for d in _DIM_RE.findall(m.group(2))]
            values = []
            continue
        if name is None:
            continue
        body = _ROW_PREFIX_RE.sub("", line)
        for tok in body.split(","):
            tok = tok.strip()
            if not tok:
                continue
            try:
                values.append(float(tok))
            except ValueError as exc:
                raise _WindowError("non-numeric value %r in array %s" % (tok, name)) from exc
    flush()
    if not arrays:
        raise _WindowError("no arrays found in .ascii body")
    return arrays


# --- window fetching ---------------------------------------------------------------------

def _dataset_url(var: _Var, year: int) -> str:
    return "%s/%s/%s.%d.nc" % (THREDDS_ROOT, var.directory, var.stem, year)


def _window_url(var: _Var, year: int, tidx: int, level_idx: int | None,
                y0: int, y1: int, x0: int, x1: int) -> str:
    parts = ["[%d:1:%d]" % (tidx, tidx)]
    if level_idx is not None:
        parts.append("[%d:1:%d]" % (level_idx, level_idx))
    parts.append("[%d:1:%d]" % (y0, y1))
    parts.append("[%d:1:%d]" % (x0, x1))
    return "%s.ascii?%s%s" % (_dataset_url(var, year), var.name, "".join(parts))


def _cache_key(var: _Var, year: int, tidx: int, level_hpa: float | None,
               y0: int, y1: int, x0: int, x1: int) -> str:
    lev = "sfc" if level_hpa is None else "%g" % level_hpa
    return "ncep_r1/%s.%d.t%04d.L%s.y%02d-%02d.x%03d-%03d.ascii" % (
        var.stem, year, tidx, lev, y0, y1, x0, x1)


def _http(key: str, url: str, timeout: int) -> str:
    """Fetch one window through provenance.fetch, or read it from the cache.

    provenance.fetch already retries transport failures with exponential backoff and does
    NOT retry a 4xx, which is the right policy here: 'stop >= size' and 'No such file' are
    verdicts, not weather. retries is held to 3 so one dead window costs at most ~3*timeout
    rather than the default 4 attempts, and the breaker above stops the second one.
    """
    path = CACHE_DIR / key
    cached = path.exists()
    if cached and path.read_text(errors="replace").lstrip().startswith("Error {"):
        # A DAP error body that reached disk would poison every later run. Drop it and
        # treat the window as un-cached, so the refusal is re-derived from the live server
        # rather than replayed forever out of the cache.
        path.unlink(missing_ok=True)
        cached = False
    if not cached:
        if _offline():
            raise _WindowError(
                "GENESIS_OFFLINE is set and this window is not cached: %s" % key)
        if _STATE["breaker_open"]:
            raise _WindowError("network breaker open after %d consecutive failures"
                               % MAX_CONSECUTIVE_FAILURES)
        (CACHE_DIR / "ncep_r1").mkdir(parents=True, exist_ok=True)
    # Always through provenance.fetch, cache hit included: it is the only thing that
    # computes the sha256 that MANIFEST.json needs, and on a hit it does no network I/O.
    got, rec = fetch(key, url, note="ncep_r1 OPeNDAP window", timeout=timeout, retries=3)
    _SOURCES[key] = rec
    text = got.read_text(errors="replace")
    if text.lstrip().startswith("Error {"):
        got.unlink(missing_ok=True)
        raise _WindowError("server returned a DAP Error body for %s" % url)
    return text


def _coverage(var: _Var, year: int, timeout: int) -> int | None:
    """How many 6-hourly analyses the year file actually publishes, or None if there is no
    such file. Read from the .dds, which is a few hundred bytes and is itself cached.

    WHY THIS EXISTS, AND THE BUG IT FIXES. Without it, asking for a time past the end of the
    published record produces HTTP 400 'Bad Projection Request: stop >= size' -- one round
    trip per variable per point, forever, and (before this check) enough consecutive
    failures to trip the outage breaker and NULL out the rest of a build over what is
    really a coverage boundary, not an outage. The current year is short by construction:
    when this was written uwnd.2026.nc held 304 analyses, i.e. through 2026-03-17 18Z. A
    build that runs in August of that year must be told that plainly, once, with the date
    the record ends -- not discover it 40,000 times.
    """
    memo = (var.stem, year)
    if memo in _COVERAGE:
        return _COVERAGE[memo]
    url = "%s.dds" % _dataset_url(var, year)
    key = "ncep_r1/%s.%d.dds" % (var.stem, year)
    try:
        text = _http(key, url, timeout)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            _COVERAGE[memo] = None
            return None
        raise _WindowError("HTTP %s reading %s" % (exc.code, url)) from exc
    m = re.search(r"time\s*=\s*(\d+)", text)
    if not m:
        raise _WindowError("no time dimension in %s" % url)
    n = int(m.group(1))
    _COVERAGE[memo] = n
    return n


def _load_window(var: _Var, when: _dt.datetime, level_hpa: float | None,
                 y0: int, y1: int, x0: int, x1: int, timeout: int) -> dict:
    """One request. Returns {(lat_idx, lon_idx): value|None} for the requested window.

    The window is VERIFIED against the coordinates the server sends back with it: time,
    level, lat and lon must all be what we indexed for. Index arithmetic that was right for
    2020 and wrong for some other year would otherwise put a 700 hPa wind in an 850 hPa
    column with nothing to show for it. Every response carries its own MAPS, so this check
    is free -- there is no excuse for not making it.
    """
    year = when.year
    tidx = _time_index(when)

    # Refuse out-of-coverage times LOCALLY, with the date the record actually ends, rather
    # than letting the server say 'stop >= size' once per variable per point.
    steps = _coverage(var, year, timeout)
    if steps is None:
        raise _WindowError("%s does not exist on the server (no such year)"
                           % _dataset_url(var, year))
    if not 0 <= tidx < steps:
        last = (_dt.datetime(year, 1, 1, tzinfo=_dt.timezone.utc)
                + _dt.timedelta(hours=ANALYSIS_STEP_HOURS * (steps - 1)))
        raise _WindowError(
            "%s publishes %d analyses, ending %s; %s is outside that record"
            % (_dataset_url(var, year), steps, last.strftime("%Y-%m-%d %HZ"),
               when.strftime("%Y-%m-%d %HZ")))

    level_idx = None
    if level_hpa is not None:
        if var.levels is None:
            raise _WindowError("%s is a surface variable and has no levels" % var.name)
        if float(level_hpa) not in var.levels:
            raise _WindowError("%s is not published at %g hPa (levels: %s)"
                               % (var.name, level_hpa,
                                  ", ".join("%g" % L for L in var.levels)))
        level_idx = var.levels.index(float(level_hpa))

    url = _window_url(var, year, tidx, level_idx, y0, y1, x0, x1)
    key = _cache_key(var, year, tidx, level_hpa, y0, y1, x0, x1)
    arrays = _parse_dods_ascii(_http(key, url, timeout))

    data = arrays.get("%s.%s" % (var.name, var.name))
    if data is None:
        raise _WindowError("response has no %s.%s array (got %s)"
                           % (var.name, var.name, sorted(arrays)))

    def _map(axis: str) -> list[float]:
        got = arrays.get("%s.%s" % (var.name, axis))
        if got is None:
            raise _WindowError("response has no %s coordinate" % axis)
        return got["values"]

    want_hours = _hours_since_epoch(when)
    got_time = _map("time")
    if len(got_time) != 1 or abs(got_time[0] - want_hours) > 1e-6:
        raise _WindowError("time index %d of %d returned %r hours since 1800-01-01, "
                           "expected %r" % (tidx, year, got_time, want_hours))
    if level_hpa is not None:
        got_level = _map("level")
        if len(got_level) != 1 or abs(got_level[0] - float(level_hpa)) > 1e-6:
            raise _WindowError("level index %d returned %r hPa, expected %g"
                               % (level_idx, got_level, level_hpa))
    lat_expect = [GRID_LATS[i] for i in range(y0, y1 + 1)]
    lon_expect = [GRID_LONS[i] for i in range(x0, x1 + 1)]
    got_lat, got_lon = _map("lat"), _map("lon")
    if len(got_lat) != len(lat_expect) or any(
            abs(a - b) > 1e-3 for a, b in zip(got_lat, lat_expect)):
        raise _WindowError("lat window %d:%d returned %r, expected %r"
                           % (y0, y1, got_lat, lat_expect))
    if len(got_lon) != len(lon_expect) or any(
            abs(a - b) > 1e-3 for a, b in zip(got_lon, lon_expect)):
        raise _WindowError("lon window %d:%d returned %r, expected %r"
                           % (x0, x1, got_lon, lon_expect))

    ny, nx = len(lat_expect), len(lon_expect)
    if data["values"] and len(data["values"]) != ny * nx:
        raise _WindowError("data array has %d values, expected %d"
                           % (len(data["values"]), ny * nx))

    out: dict[tuple[int, int], float | None] = {}
    for j in range(ny):
        for i in range(nx):
            out[(y0 + j, x0 + i)] = _finite(data["values"][j * nx + i])
    return out


def _lon_runs(first: int, count: int) -> list[tuple[int, int]]:
    """Split a longitude window into contiguous runs, wrapping at the 0/357.5 seam.

    OPeNDAP cannot express a wrapped slice, so a window straddling the prime meridian
    becomes two requests. The Pacific never needs this; a general archive does, and a
    silently clipped window near 0 E would give a one-sided finite difference that looks
    like a real vorticity.
    """
    idx = [(first + k) % len(GRID_LONS) for k in range(count)]
    runs: list[tuple[int, int]] = []
    start = prev = idx[0]
    for cur in idx[1:]:
        if cur == prev + 1:
            prev = cur
            continue
        runs.append((start, prev))
        start = prev = cur
    runs.append((start, prev))
    return runs


def _tile_window(ilat: int, ilon: int) -> tuple[int, int, int, int]:
    """(y0, y1, lon_first, lon_count) for the cached tile containing (ilat, ilon).

    Latitude is CLIPPED at the poles rather than wrapped -- index -1 is not 88.5 S, and a
    wrap there would difference across the pole. Longitude is wrapped, because it is a
    circle.
    """
    ty0 = (ilat // TILE_CELLS) * TILE_CELLS
    ty1 = min(ty0 + TILE_CELLS - 1, len(GRID_LATS) - 1)
    y0 = max(0, ty0 - TILE_HALO)
    y1 = min(len(GRID_LATS) - 1, ty1 + TILE_HALO)

    tx0 = (ilon // TILE_CELLS) * TILE_CELLS
    tx1 = min(tx0 + TILE_CELLS - 1, len(GRID_LONS) - 1)
    lon_first = tx0 - TILE_HALO
    lon_count = (tx1 - tx0 + 1) + 2 * TILE_HALO
    return y0, y1, lon_first, lon_count


def _tile(var_name: str, when: _dt.datetime, level_hpa: float | None,
          ilat: int, ilon: int, timeout: int) -> dict:
    """The cached tile covering (ilat, ilon), fetched at most once per process."""
    var = VARIABLES.get(var_name)
    if var is None:
        raise _WindowError("unregistered variable %r (registered: %s)"
                           % (var_name, ", ".join(sorted(VARIABLES))))
    y0, y1, lon_first, lon_count = _tile_window(ilat, ilon)
    memo_key = (var_name, when, level_hpa, y0, y1, lon_first, lon_count)
    hit = _TILE_MEMO.get(memo_key)
    if hit is not None:
        if hit.get("error"):
            raise _WindowError(hit["error"])
        return hit["cells"]

    cells: dict[tuple[int, int], float | None] = {}
    try:
        for x0, x1 in _lon_runs(lon_first, lon_count):
            cells.update(_load_window(var, when, level_hpa, y0, y1, x0, x1, timeout))
    except urllib.error.HTTPError as exc:
        # A 4xx is an ANSWER -- 'that level does not exist', 'that year does not exist' --
        # and it will be identical next time, so it must not count toward the outage
        # breaker. A 5xx is the server failing, which is what the breaker is for.
        if exc.code >= 500:
            _fail()
        msg = "HTTP %s from %s" % (exc.code, _dataset_url(var, when.year))
        _TILE_MEMO[memo_key] = {"error": msg}
        raise _WindowError(msg) from exc
    except _WindowError as exc:
        # A structural refusal (unpublished level, offline, breaker) is not a network
        # failure and must not count toward the breaker.
        _TILE_MEMO[memo_key] = {"error": str(exc)}
        raise
    except Exception as exc:  # transport exhausted inside provenance.fetch
        _fail()
        msg = "%s: %s" % (type(exc).__name__, exc)
        _TILE_MEMO[memo_key] = {"error": msg}
        raise _WindowError(msg) from exc

    _STATE["consecutive_failures"] = 0
    _TILE_MEMO[memo_key] = {"cells": cells}
    return cells


def _fail() -> None:
    _STATE["consecutive_failures"] += 1
    if _STATE["consecutive_failures"] >= MAX_CONSECUTIVE_FAILURES:
        if not _STATE["breaker_open"]:
            _STATE["breaker_open"] = True
            _record_gap(
                "ncep_r1_breaker",
                what="reanalysis extraction was abandoned mid-build",
                why=("%d consecutive OPeNDAP requests to %s failed, so the module stopped "
                     "issuing requests for the rest of this process rather than paying one "
                     "timeout per remaining point."
                     % (MAX_CONSECUTIVE_FAILURES, THREDDS_ROOT)),
                impact=("Every environment row requested after the breaker tripped has "
                        "NULL reanalysis fields. They are not zeros and not carried "
                        "forward; re-run the build when the server is up."),
                url=THREDDS_ROOT)


# --- public extraction -------------------------------------------------------------------

def fetch_point(variable: str, when: _dt.datetime, lat: float, lon: float,
                level_hpa: float | None = None, *,
                timeout: int = DEFAULT_TIMEOUT) -> float | None:
    """Nearest-grid-point value of `variable`, IN THE UNITS THE FILE PUBLISHES.

    No unit conversion happens here -- slp comes back in Pascals, air in degK, uwnd in m/s
    -- because a primitive that silently normalises units is a primitive whose callers stop
    checking them. environment_at() does the conversions and names each one.

    Returns None (never raises) when: the time is not an analysis step, the variable is not
    published at that level, the server refuses, or the value is the missing sentinel. Every
    such case records a gap.

    `lon` may be signed (-180..180) or 0..360; it is taken modulo 360 to index the grid.
    """
    try:
        when_utc = _as_utc(when)
    except TypeError:
        _record_gap("bad_when_type",
                    what="environment lookup was given a non-datetime time",
                    why="fetch_point requires a datetime; a string or date cannot be "
                        "resolved to an analysis step without guessing an hour.",
                    impact="Those lookups returned NULL.")
        return None
    if not _is_analysis_time(when_utc):
        _record_gap(
            "off_step_time",
            what="a requested time was not on a 6-hourly analysis step",
            why=("NCEP R1 publishes analyses at 00/06/12/18Z only. This module refuses to "
                 "snap to the nearest step, because a row labelled with one time carrying "
                 "another time's environment is a substituted value."),
            impact=("Those rows have NULL reanalysis fields. Ask on a synoptic hour "
                    "(first refused: %s)." % when_utc.isoformat()))
        return None

    ilat = grid_index(GRID_LATS, lat)
    ilon = grid_index(GRID_LONS, float(lon) % 360.0)
    try:
        cells = _tile(variable, when_utc, level_hpa, ilat, ilon, timeout)
    except _WindowError as exc:
        _record_gap("window_%s_%s_%s" % (variable, level_hpa, _cause_tag(str(exc))),
                    what="reanalysis window for %s%s could not be read"
                         % (variable, "" if level_hpa is None else " at %g hPa" % level_hpa),
                    why=str(exc),
                    impact="Every field derived from %s is NULL for the affected points."
                           % variable,
                    url=THREDDS_ROOT)
        return None
    return cells.get((ilat, ilon))


def _stencil(cells: dict, ilat: int, ilon: int) -> dict | None:
    """The 3x3 centred stencil around (ilat, ilon), or None if any member is missing.

    Returns None rather than a one-sided difference at the array edge: a one-sided
    derivative on a 2.5 degree grid is a different (and much worse) estimator, and quietly
    swapping estimators between rows would make the column incomparable to itself.
    """
    if ilat - 1 < 0 or ilat + 1 >= len(GRID_LATS):
        return None
    n = len(GRID_LONS)
    west, east = (ilon - 1) % n, (ilon + 1) % n
    out = {
        "c": cells.get((ilat, ilon)),
        "n": cells.get((ilat - 1, ilon)),   # lat DESCENDS, so index-1 is NORTH
        "s": cells.get((ilat + 1, ilon)),
        "w": cells.get((ilat, west)),
        "e": cells.get((ilat, east)),
    }
    if any(v is None for v in out.values()):
        return None
    out["phi_n"] = GRID_LATS[ilat - 1]
    out["phi_s"] = GRID_LATS[ilat + 1]
    out["phi_0"] = GRID_LATS[ilat]
    dlon = (GRID_LONS[east] - GRID_LONS[west]) % 360.0
    if dlon > 180.0:
        dlon -= 360.0
    out["dlam"] = math.radians(dlon)
    out["dphi"] = math.radians(out["phi_n"] - out["phi_s"])
    return out


def _vorticity_s(u: dict, v: dict) -> float | None:
    """Relative vorticity in s^-1 from centred differences on the sphere.

    On a sphere of radius a, with longitude lam east and latitude phi north,

        zeta = (1 / (a cos phi)) * [ d v / d lam  -  d (u cos phi) / d phi ]

    The cos phi inside the latitudinal derivative is not decoration: dropping it (i.e.
    using the plane form dv/dx - du/dy) leaves out the metric term that represents the
    convergence of the meridians, which at 12 N is a ~2 percent error in the du/dy term and
    grows without bound toward the pole. The differences below span TWO grid cells (5
    degrees, ~550 km at these latitudes), so this is a synoptic-scale environmental
    vorticity, not a storm-scale one.
    """
    cos0 = math.cos(math.radians(u["phi_0"]))
    if abs(cos0) < 1e-9:          # at the pole the metric term is singular
        return None
    dv_dlam = (v["e"] - v["w"]) / u["dlam"]
    ducos_dphi = (u["n"] * math.cos(math.radians(u["phi_n"]))
                  - u["s"] * math.cos(math.radians(u["phi_s"]))) / u["dphi"]
    return (dv_dlam - ducos_dphi) / (EARTH_RADIUS_M * cos0)


def _divergence_s(u: dict, v: dict) -> float | None:
    """Horizontal divergence in s^-1, the companion of _vorticity_s on the same stencil:

        div = (1 / (a cos phi)) * [ d u / d lam  +  d (v cos phi) / d phi ]
    """
    cos0 = math.cos(math.radians(u["phi_0"]))
    if abs(cos0) < 1e-9:
        return None
    du_dlam = (u["e"] - u["w"]) / u["dlam"]
    dvcos_dphi = (v["n"] * math.cos(math.radians(v["phi_n"]))
                  - v["s"] * math.cos(math.radians(v["phi_s"]))) / v["dphi"]
    return (du_dlam + dvcos_dphi) / (EARTH_RADIUS_M * cos0)


def environment_at(lat: float, lon: float, when: _dt.datetime, *, source_key: str) -> dict:
    """One schema.ENVIRONMENT-shaped row for (lat, lon, when), env_source='ncep_r1'.

    Every key of schema.ENVIRONMENT is present. A field this source cannot supply is None
    and its reason is in gaps() -- never a stand-in from a different quantity.

    WHAT IS COMPUTED, WITH ITS LEVEL AND UNITS:
      shear_kt      | 850-200 hPa | magnitude of the VECTOR difference
                    |             | (u200-u850, v200-v850), m/s -> kt at 3600/1852.
                    |             | This is the deep-layer shear of the grid-cell winds,
                    |             | with the (unresolved) vortex still in them; SHIPS SHDC
                    |             | is a 0-500 km average with the vortex REMOVED.
      shear_dir_deg | 850-200 hPa | heading the shear vector points TOWARD, degrees
                    |             | clockwise from north: atan2(du, dv). Westerly shear is
                    |             | 90, which is the convention the SHIPS predictor document
                    |             | states for SDDC, so the two columns are comparable in
                    |             | convention even though they are not the same quantity.
      rh_mid_pct    | 600 hPa     | single-level relative humidity, percent, AS PUBLISHED.
                    |             | THIS IS NOT THE SHIPS 700-500 hPa LAYER that the schema
                    |             | comment names. 600 hPa is the level nearest the middle
                    |             | of that layer that NCEP R1 actually publishes; it is a
                    |             | level, not a layer mean, and it is not a storm-relative
                    |             | annulus average.
      vort850_1e5   | 850 hPa     | spherical centred-difference relative vorticity over a
                    |             | 5-degree baseline, s^-1 / 1e-5.
      div200_1e7    | 200 hPa     | same stencil, divergence, s^-1 / 1e-7.
      mslp_env_mb   | sea level   | slp / 100 (the DAS says 'Pascals'). Unlike the SHIPS
                    |             | column of the same name, which is the storm's own
                    |             | central pressure, this really is an ambient pressure.
      u200_kt       | 200 hPa     | zonal wind, m/s -> kt.
      t200_c        | 200 hPa     | air temperature, degK - 273.15.
      tpw_mm        | column      | pr_wtr.eatm, kg/m^2, numerically equal to mm of liquid
                    |             | water at 1000 kg/m^3.
      lead_hours    |             | 0.0 -- a reanalysis analysis has no forecast lead.

    WHAT IS NULL AND WHY (all recorded in gaps()): sst_c, pot_intensity_kt, ohc_kj_cm2,
    rh_lo_pct, rh_hi_pct, gpi, gpi_method.

    lat/lon in the row are the coordinates ASKED FOR, not the 2.5-degree cell that was
    sampled -- the row describes the environment at a track point, and the sampling rule
    (nearest cell, up to ~140 km away) is a documented property of the source.

    storm_id and atcf_id are None: this function knows a position and a time, not a storm.
    The build joins them.
    """
    when_utc = _as_utc(when)
    ingested = _utcnow_iso()

    row: dict = {
        "storm_id": None,
        "iso_time": when_utc,
        "atcf_id": None,
        "lat": float(lat),
        "lon": _signed_lon(lon),
        "env_source": ENV_SOURCE,
        "shear_kt": None,
        "rh_mid_pct": None,
        "vort850_1e5": None,
        "pot_intensity_kt": None,
        "sst_c": None,
        "mslp_env_mb": None,
        "ohc_kj_cm2": None,
        "div200_1e7": None,
        "rh_lo_pct": None,
        "rh_hi_pct": None,
        "tpw_mm": None,
        "shear_dir_deg": None,
        "u200_kt": None,
        "t200_c": None,
        "gpi": None,
        "gpi_method": None,
        "lead_hours": 0.0,
        "source_key": source_key,
        "processing_version": PROCESSING_VERSION,
        "ingested_utc": ingested,
    }

    if not _is_analysis_time(when_utc):
        _record_gap(
            "off_step_time",
            what="a requested time was not on a 6-hourly analysis step",
            why=("NCEP R1 publishes analyses at 00/06/12/18Z only. This module refuses to "
                 "snap to the nearest step, because a row labelled with one time carrying "
                 "another time's environment is a substituted value."),
            impact=("Those rows have NULL reanalysis fields. Ask on a synoptic hour "
                    "(first refused: %s)." % when_utc.isoformat()))
        return row

    ilat = grid_index(GRID_LATS, lat)
    ilon = grid_index(GRID_LONS, float(lon) % 360.0)

    def tile(var: str, level: float | None):
        try:
            return _tile(var, when_utc, level, ilat, ilon, DEFAULT_TIMEOUT)
        except _WindowError as exc:
            _record_gap(
                "window_%s_%s_%s" % (var, level, _cause_tag(str(exc))),
                what="reanalysis window for %s%s could not be read"
                     % (var, "" if level is None else " at %g hPa" % level),
                why=str(exc),
                impact="Every field derived from %s is NULL for the affected points." % var,
                url=THREDDS_ROOT)
            return None

    u850 = tile("uwnd", SHEAR_LOW_HPA)
    v850 = tile("vwnd", SHEAR_LOW_HPA)
    u200 = tile("uwnd", SHEAR_HIGH_HPA)
    v200 = tile("vwnd", SHEAR_HIGH_HPA)

    here = (ilat, ilon)
    if u850 and v850 and u200 and v200:
        cu850, cv850 = u850.get(here), v850.get(here)
        cu200, cv200 = u200.get(here), v200.get(here)
        if None not in (cu850, cv850, cu200, cv200):
            du, dv = cu200 - cu850, cv200 - cv850
            row["shear_kt"] = math.hypot(du, dv) * MS_TO_KT
            row["shear_dir_deg"] = math.degrees(math.atan2(du, dv)) % 360.0
        if cu200 is not None:
            row["u200_kt"] = cu200 * MS_TO_KT

    if u850 and v850:
        su, sv = _stencil(u850, ilat, ilon), _stencil(v850, ilat, ilon)
        if su and sv:
            z = _vorticity_s(su, sv)
            if z is not None:
                row["vort850_1e5"] = z / 1e-5
        else:
            _record_gap(
                "stencil_850",
                what="850 hPa vorticity stencil incomplete",
                why=("A centred difference needs all four neighbours; at least one was "
                     "missing or the point was on the first/last row of the grid."),
                impact="vort850_1e5 is NULL for those points; no one-sided difference "
                       "was substituted.")

    if u200 and v200:
        su, sv = _stencil(u200, ilat, ilon), _stencil(v200, ilat, ilon)
        if su and sv:
            d = _divergence_s(su, sv)
            if d is not None:
                row["div200_1e7"] = d / 1e-7

    rh = tile("rhum", RH_MID_HPA)
    if rh:
        row["rh_mid_pct"] = rh.get(here)

    slp = tile("slp", None)
    if slp:
        pa = slp.get(here)
        # DAS: units 'Pascals', valid_range 87000..115000. /100 -> hPa == mb.
        row["mslp_env_mb"] = None if pa is None else pa / 100.0

    t200 = tile("air", SHEAR_HIGH_HPA)
    if t200:
        k = t200.get(here)
        row["t200_c"] = None if k is None else k - KELVIN_ZERO_C

    pw = tile("pr_wtr", None)
    if pw:
        row["tpw_mm"] = pw.get(here)

    _record_missing_field_reasons()
    return row


def _record_missing_field_reasons() -> None:
    """The fields this source structurally cannot fill, recorded the first time a row is
    built so the manifest carries them even for a build that never hit a network error."""
    _record_gap(
        "ncep_r1_no_sst",
        what="sst_c is NULL on every ncep_r1 row",
        why=("NCEP R1's atmospheric files publish no sea surface temperature. The nearest "
             "things it does publish are skt.sfc (model skin temperature over land AND "
             "ocean) and air.sig995 (air temperature at sigma 0.995) -- both are different "
             "physical quantities, and writing either into an SST column would be a "
             "substitution."),
        impact="Any analog query conditioning on SST must use the OISST rows "
               "(env_source='oisst') or accept NULLs here.")
    _record_gap(
        "ncep_r1_no_pi",
        what="pot_intensity_kt and gpi/gpi_method are NULL on every ncep_r1 row",
        why=("Potential intensity is not a published field; it is the output of the "
             "Bister-Emanuel algorithm run on an SST, a surface pressure and a full "
             "temperature/humidity sounding. SST is unavailable here (above), and the "
             "Emanuel-Nolan genesis potential index takes PI as an input, so it fails with "
             "it."),
        impact="Rows from this source cannot answer a PI-conditioned or GPI-conditioned "
               "analog query; they are NULL, not zero.")
    _record_gap(
        "ncep_r1_no_ohc",
        what="ohc_kj_cm2 is NULL on every ncep_r1 row",
        why="NCEP R1 is an atmospheric reanalysis and contains no ocean heat content.",
        impact="Warm-eddy / cold-wake cases are indistinguishable in these rows.")
    _record_gap(
        "ncep_r1_no_rh_layers",
        what="rh_lo_pct and rh_hi_pct are NULL on every ncep_r1 row",
        why=("Those columns are defined by the SHIPS layer averages (RHLO 850-700, RHHI "
             "500-300 hPa, over a storm-relative annulus). A single NCEP R1 level is not "
             "that quantity, and averaging two levels of a 2.5-degree grid would produce a "
             "third quantity that matches neither source."),
        impact="Only rh_mid_pct (600 hPa, single level) is populated from this source.")


# --- provenance and gaps -------------------------------------------------------------------

def sources() -> list[SourceRecord]:
    """Every OPeNDAP window this process fetched or read from cache, for MANIFEST.json.

    Additive to the four functions the assignment names: without it a build cannot record
    where these numbers came from, and an unrecorded source is exactly what provenance.py
    exists to forbid. Every entry carries the sha256 of the exact bytes the values were
    read from, cache hits included, so a re-run can prove the server has not silently
    re-issued the window.
    """
    return sorted(_SOURCES.values(), key=lambda r: r.key)


def gaps() -> list[Gap]:
    """Everything this source does not say, starting with the one it was supposed to be.

    The first three are structural and constant -- they are true of this module on a
    perfect network. The rest accumulate as a build runs and are deduped, with a hit count,
    so a manifest reports 'this happened' once rather than 40,000 times.
    """
    static = [
        Gap(
            key="era5",
            what="ERA5 is not in this archive at all; NCEP/NCAR Reanalysis 1 was "
                 "substituted, and it is a coarser instrument",
            why=("Both published routes to ERA5 were tried from this environment and both "
                 "refused. (1) Copernicus CDS: POST to "
                 "https://cds.climate.copernicus.eu/api/retrieve/v1/processes/"
                 "reanalysis-era5-pressure-levels/execution returns HTTP 401 "
                 "{\"detail\":\"authentication required\"}; the API needs a personal access "
                 "token and none is provisioned here (no ~/.cdsapirc, no CDSAPI_* in the "
                 "environment). The public process listing returns HTTP 200 from the same "
                 "host, so the network path is open and the missing thing is a credential. "
                 "(2) The AWS Open Data mirror era5-pds returns HTTP 403 "
                 "<Code>AccessDenied</Code> for both an object GET and a bucket listing."),
            impact=("Every environment row this module emits is 2.5 degrees and 6-hourly "
                    "instead of ERA5's 0.25 degrees and hourly -- roughly 100x coarser in "
                    "area and 6x in time. A TC inner core is not resolved at all, the "
                    "'environment' is an average over a ~275 km cell, and the sampled cell "
                    "can be up to ~140 km from the position requested. Genesis-scale "
                    "features (a mesoscale vortex inside a tropical wave) are below the "
                    "grid and simply absent. Do not compare these fields quantitatively "
                    "with any ERA5-derived study."),
            url="https://cds.climate.copernicus.eu/",
        ),
        Gap(
            key=ENV_SOURCE,
            what="rhum is published on FEWER levels than the winds: 8, not 17",
            why=("Verified against the live files for 2020: uwnd/vwnd/air/hgt carry "
                 "level[17] = 1000 925 850 700 600 500 400 300 250 200 150 100 70 50 30 20 "
                 "10, while rhum and shum carry only level[8] = 1000 925 850 700 600 500 "
                 "400 300. There is no relative humidity above 300 hPa in this dataset."),
            impact=("rh_mid_pct is read at 600 hPa, the published level nearest the middle "
                    "of the SHIPS 700-500 hPa layer, and it is a SINGLE LEVEL, not a layer "
                    "mean and not a storm-relative annulus average -- it is not the same "
                    "quantity as the ships_dev rows in the same column. Upper-level "
                    "(250/200 hPa) moisture cannot be obtained from this source at all."),
            url="%s/pressure/rhum.2020.nc.dds" % THREDDS_ROOT,
        ),
        Gap(
            key=ENV_SOURCE,
            what="vort850_1e5 and div200_1e7 are ~550 km centred differences, not "
                 "storm-scale fields",
            why=("The grid is 2.5 degrees, so the tightest centred difference available "
                 "spans two cells: 5 degrees of longitude (~545 km at 12 N) and 5 degrees "
                 "of latitude (~556 km). The spherical form used is "
                 "zeta = (1/(a cos phi)) [dv/dlam - d(u cos phi)/dphi]."),
            impact=("These are environmental (monsoon-trough / ITCZ) values. A SHIPS Z850 "
                    "is a 0-1000 km storm-relative average that retains the vortex, so the "
                    "two are not interchangeable and pooling them across env_source would "
                    "mix scales. Points on the first or last grid row get NULL rather than "
                    "a one-sided difference."),
        ),
        Gap(
            key=ENV_SOURCE,
            what="these columns are NOT drop-in replacements for the ships_dev columns of "
                 "the same name, and the difference was MEASURED, not assumed",
            why=("30 SHIPS CP developmental records at tau=0 were run through "
                 "environment_at() at the same lat, lon and time and compared column by "
                 "column: shear_kt median 11.6 kt (SHIPS) vs 16.6 kt (ncep_r1), median "
                 "difference +3.1 kt, Pearson r=0.74. vort850_1e5 median 0.34 vs 2.55 "
                 "(1e-5 s^-1), r=0.35. rh_mid_pct median 55.0 vs 57.5 percent, median "
                 "difference -4.0, PEARSON r = -0.00 -- similar distributions and NO "
                 "point-by-point relationship at all, which is what you get when a "
                 "700-500 hPa layer average over a 200-800 km storm-relative annulus is "
                 "set beside a single 600 hPa level in one 2.5 degree cell."),
            impact=("Pooling env_source='ships_dev' and env_source='ncep_r1' rows in one "
                    "humidity comparison is comparing two unrelated numbers; for shear and "
                    "vorticity it is comparing related numbers with a scale offset. Match "
                    "ncep_r1 rows against ncep_r1 rows. n=30, so these are magnitudes, not "
                    "a calibration -- and no correction factor is published here, because "
                    "fitting one from 30 points and applying it to the archive would be "
                    "manufacturing agreement that the sources do not have."),
        ),
        Gap(
            key=ENV_SOURCE,
            what="mslp_env_mb means something different here than it does on ships_dev rows",
            why=("Here it is the NCEP R1 grid-cell sea level pressure (DAS units "
                 "'Pascals', divided by 100), i.e. a genuine ambient pressure. On "
                 "ships_dev rows the same column carries SHIPS MSLP, which that module "
                 "documents as the storm's own minimum central pressure."),
            impact=("A query that pools mslp_env_mb across env_source is comparing ambient "
                    "pressure with storm intensity. Filter on env_source."),
        ),
    ]
    return static + list(_DYNAMIC_GAPS.values())


# --- proof it works ------------------------------------------------------------------------

def _demo() -> None:
    """Real extraction at the archive's headline query point: 12 N 140 W, 2020-08-15 00Z."""
    import time as _time

    when = _dt.datetime(2020, 8, 15, 0, 0, tzinfo=_dt.timezone.utc)
    lat, lon = 12.0, -140.0
    t0 = _time.time()
    row = environment_at(lat, lon, when, source_key="ncep_r1.2020")
    elapsed = _time.time() - t0

    ilat = grid_index(GRID_LATS, lat)
    ilon = grid_index(GRID_LONS, lon % 360.0)
    print("request  : lat %.2f lon %.2f (%s)  %s" % (lat, lon, _signed_lon(lon), when))
    print("sampled  : lat %.1f lon %.1f (= %.1f) -> lat idx %d, lon idx %d, time idx %d"
          % (GRID_LATS[ilat], GRID_LONS[ilon], _signed_lon(GRID_LONS[ilon]),
             ilat, ilon, _time_index(when)))
    print("wall time: %.2f s" % elapsed)
    print()
    units = {
        "shear_kt": "kt (850-200 hPa vector difference)",
        "shear_dir_deg": "deg, heading shear points toward (90 = westerly)",
        "rh_mid_pct": "% at 600 hPa (single level, NOT the SHIPS 700-500 layer)",
        "vort850_1e5": "1e-5 s^-1 at 850 hPa (5-degree centred difference)",
        "div200_1e7": "1e-7 s^-1 at 200 hPa (5-degree centred difference)",
        "mslp_env_mb": "mb at sea level (slp Pascals / 100)",
        "u200_kt": "kt at 200 hPa",
        "t200_c": "deg C at 200 hPa (degK - 273.15)",
        "tpw_mm": "mm, column integrated (pr_wtr.eatm kg/m^2)",
        "lead_hours": "h (0 = analysis)",
        "sst_c": "-- NULL, see gaps()",
        "pot_intensity_kt": "-- NULL, see gaps()",
        "ohc_kj_cm2": "-- NULL, see gaps()",
        "rh_lo_pct": "-- NULL, see gaps()",
        "rh_hi_pct": "-- NULL, see gaps()",
        "gpi": "-- NULL, see gaps()",
        "gpi_method": "-- NULL, see gaps()",
    }
    for k, v in row.items():
        note = units.get(k, "")
        shown = "NULL" if v is None else (("%.4f" % v) if isinstance(v, float) else str(v))
        print("  %-18s %-24s %s" % (k, shown, note))
    print()
    print("windows fetched: %d" % len(sources()))
    for rec in sources():
        print("  %s  %d bytes" % (rec.key, rec.bytes))
    print()
    print("gaps: %d" % len(gaps()))
    for g in gaps():
        print("  [%s] %s" % (g.key, g.what))


if __name__ == "__main__":
    _demo()
