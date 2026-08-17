"""SHIPS developmental data -- the archive's environment table.

WHY THIS FILE CARRIES THE ENVIRONMENT. ERA5 is unreachable from this environment, so the
analysed environment around every storm comes from the SHIPS developmental files
(lsdiag*.dat). That is not a downgrade: the SHIPS developmental sample is what the
operational SHIPS/RII regressions were fit against, its predictors are the same fields NHC
reasons with in a discussion, and it is published as a single self-describing text file per
basin with an official predictor dictionary. What it is NOT is a gridded reanalysis -- every
value here is already reduced to a storm-relative annulus average, and the annulus is part
of the definition (see the radii in UNITS below). Comparing a SHIPS RHMD to a free-air
700-500 hPa RH from anywhere else is comparing two different quantities.

EVERY SCALING BELOW WAS READ OUT OF THE OFFICIAL DOCUMENT, NOT REMEMBERED. The units are
the only part of this format that cannot be inferred from the bytes: a column of integers
near 120 is 12.0 kt of shear or 120 kt of potential intensity depending only on what the
publisher says, and there is no way to tell from the file. The scalings applied here were
extracted from .genesis-cache/ships_predictor_file.pdf ("SHIPS Predictor Files", last
updated 2 Oct 2023) and each one is quoted verbatim in UNITS. Any predictor whose scaling
is not quoted there is emitted as the raw published integer and is NOT divided by anything.

FORMAT, VERIFIED BYTE-BY-BYTE against .genesis-cache/ships.CP.txt (996 records),
ships.EP.txt (17,518 records) and ships.AL.txt (14,328 records):

  * A record is HEAD ... LAST. In all three files a record is exactly 139 lines: HEAD,
    TIME, 136 predictor rows, LAST. The label sequence is identical for every record in
    every file -- there is no era-dependent row set to switch on.
  * Lines are 180 bytes, except IR00/IRM1/IRM3/PC00/PCM1/PCM3 which are 160 because the
    trailing label padding is absent. Column positions are unaffected: value field k is
    line[5*k : 5*k+5] for k in 0..30, and the label field is line[155:].
  * The label is the FIRST token of line[155:]. Some labels carry a second token that is
    DATA, not part of the name: "RSST    5" means the weekly Reynolds analysis used was
    5 days old, "NOHC 9999" means the NCODA record is missing. Splitting on whitespace and
    taking token 0 is the only reading that survives both.
  * 9999 means MISSING, everywhere, per the official document. Verified: no field in any of
    the three files is non-numeric, none is "-9999", and no field fills all five characters
    (so no two columns can ever run together).
  * Blank fields are ALSO missing, and they are common: the -12 h and -6 h columns of every
    analysis-derived predictor (U200, RHLO, Z850, ... ) are blank, not 9999 -- 2 per line,
    35,036 of them in the EP file alone. Reading a blank as 0.0 would put a dead-calm 200
    hPa wind and zero vorticity into the archive at every t-12.

THE LONGITUDE TRAP, AND THE PROOF. HEAD and the LON row both publish longitude as a
POSITIVE number of degrees WEST (LON is "deg W *10"). Emitting that unchanged puts every
Central Pacific storm in the Philippine Sea and silently destroys the Hawaii use case. The
proof this file relies on is Hurricane IWA, CP041982, the storm that struck Kauai on 23 Nov
1982: its HEAD line reads " IWA  821124 06   80   23.3  158.4 ... CP041982", and Kauai is at
159.5 W. 158.4 is therefore 158.4 WEST, and the signed value is -158.4. Additionally, all
996 CP HEAD longitudes fall in 136.5..177.9 with ATCF ids CP##YYYY -- the Central Pacific
basin is 140 W..180, which only works under the west-positive reading. Every HEAD lat/lon
was checked against the LAT/LON predictor rows at t=0: 0 mismatches in 32,842 records.

THE CENTURY TRAP. HEAD carries a 2-digit year, and a naive pivot is not needed because the
ATCF id on the same line carries the 4-digit SEASON year. They are not always equal: 23
Atlantic records read " ZETA 060101 00 ... AL312005" -- Hurricane Zeta ran from 30 Dec 2005
into 6 Jan 2006, so the calendar year is 2006 while the season year is 2005. The calendar
year is resolved as the member of {season-1, season, season+1} whose last two digits match,
which is exact and needs no assumption about where the file's coverage starts.

THE MTPW TRAP, AND THE PROOF. MTPW's 31 columns are NOT a time series -- the official
document lists 21 different TPW quantities packed into one line, and the file lays value 1
in the column where TIME reads 0. So reading MTPW "at t=+6" does not give TPW six hours
later, it gives the 0-200 km TPW STANDARD DEVIATION. This was proven, not assumed: for
i in 1..21, MTPW's i-th value equals PW<i>'s t=0 value in 32,842 of 32,842 records across
CP, EP and AL. PW01..PW21 are the time-dependent versions of the same 21 quantities, so
tpw_mm reads MTPW at tau=0 and PW01 at every other tau.

PERFECT PROG, AND THE 2023 PERTURBATION BUG. The official document warns that the AL/CP/EP
files uploaded on 23 Jun 2023 carried a track perturbation that was zero at t=0 and grew
with lead time, and that corrected files were posted on 3 Oct 2023. The cached files here
are the CORRECTED ones: for every pair of consecutive 6-hourly records of the same storm,
the t=+6 column of the earlier record equals the t=0 column of the later record exactly --
939/939 in CP, 33,478/33,478 in EP, 27,322/27,322 in AL, for both LAT and LON. The same
test on RHMD/SHRD/VMAX also agrees exactly, which establishes that non-zero taus in the
DEVELOPMENTAL file are analyses valid at that later time (perfect prog), not forecasts.
That is why a tau row is emitted with iso_time = analysis time + tau: the row describes the
environment at that valid time, and lead_hours records where it was read from.

BUT PERFECT PROG IS NOT UNIVERSAL, AND THE EXCEPTIONS ARE THE INTERESTING COLUMNS. Running
the same t+6-vs-next-t0 test through environment_rows() on the CP file, per emitted column,
over the 939 comparable pairs:

    lat lon rh_lo/mid/hi_pct vort850_1e5 div200_1e7 tpw_mm u200_kt t200_c mslp_env_mb
                                                                    0 differences  (0.0%)
    ohc_kj_cm2   (COHC)                                            43 differences  (4.6%)
    sst_c        (RSST)                                            31 differences  (3.3%)
    pot_intensity_kt (VMPI, computed from SST)                     31 differences  (3.3%)
    shear_dir_deg (SDDC)                                          196 differences (20.9%)
    shear_kt     (SHDC)                                           242 differences (25.8%)

So the plain gridded fields are a pure function of valid time, while the vortex-removed
shear (SHDC/SDDC) and the ocean fields are a function of the CASE as well: SHRD, which does
not remove the vortex, reproduces exactly, and SHDC, which does, does not. RSST comes from a
WEEKLY Reynolds analysis whose age -- the number printed after the RSST label -- changes
between records, so two records legitimately publish different SSTs for the same hour, and
VMPI inherits that because it is computed from SST.

Consequence for callers: rows at lead_hours != 0 are NOT interchangeable with the archive's
analysis rows even though they share a valid time, and shear is exactly the column where
substituting one for the other would move an analog match. Combined with the fact that
non-zero taus duplicate valid times the next record already covers, that is why the default
is taus=(0,) -- the analysis, and only the analysis.

PURE PARSER: no network, no clock at import time, no state. iter_records() NEVER scales
anything -- it hands back the integers the publisher printed. environment_rows() is the only
place a divisor is applied, and every divisor it applies is quoted in UNITS.
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Callable, Iterator, Sequence

from genesis.provenance import Gap, PROCESSING_VERSION

# --- fixed-format constants, all verified against the bytes -----------------------------

FIELD_WIDTH = 5
N_FIELDS = 31            # TIME = -12, -6, 0, 6, ... 168 h
LABEL_COL = 155          # 31 * 5; the label field is line[155:]
MISSING_TOKEN = "9999"   # the ONLY missing sentinel in the file (verified: no -9999, no 9998)

ENV_SOURCE = "ships_dev"

#: env_source suffixes. A substituted column is never silent: if the primary predictor was
#: missing and a documented alternate was used instead, the row says so in env_source, which
#: is the only string column the ENVIRONMENT schema leaves free for it. Filter with
#: `env_source LIKE 'ships_dev%'`, not `= 'ships_dev'`, or you will drop these rows.
SUBST_SHRD = "shrd"      # shear_kt came from SHRD (200-800 km, vortex present) not SHDC
SUBST_CSST = "csst"      # sst_c came from CLIMATOLOGICAL SST, not the Reynolds analysis


class ShipsFormatError(ValueError):
    """The file did not match the format this parser verified. Never guessed around."""


# --- units, quoted from the official predictor document ---------------------------------
#
# key: (divisor, unit-after-division, verbatim quote from ships_predictor_file.pdf)
#
# A divisor of 1 means the publisher's integer IS the value in the stated unit. It does NOT
# mean "scaling unknown" -- every entry below is quoted, so every entry is confirmed. A
# predictor absent from this table is emitted raw by environment_rows and is not divided.

UNITS: dict[str, tuple[float, str, str]] = {
    "LAT":  (10.0, "deg N",        "LAT:  Storm latitude (deg N *10) vs time"),
    "LON":  (10.0, "deg W",        "LON:  Storm longitude (deg W *10) vs time"),
    "VMAX": (1.0,  "kt",           "VMAX: Maximum surface wind (kt)"),
    "MSLP": (1.0,  "hPa",          "MSLP: Minimum Sea Level Pressure (hPa)"),
    "SHRD": (10.0, "kt",           "SHRD: 850-200 hPa shear magnitude (kt *10) vs time (200-800 km)"),
    "SHDC": (10.0, "kt",           "SHDC: Same as SHRD but with vortex removed and averaged from 0-500 km "
                                   "relative to 850 hPa vortex center"),
    "SDDC": (1.0,  "deg",          "SDDC: Heading (deg) of above shear vector. Westerly shear has a "
                                   "value of 90 deg."),
    "SHTD": (1.0,  "deg",          "SHTD: Heading (deg) of above shear vector."),
    "RHLO": (1.0,  "percent",      "RHLO: 850-700 hPa relative humidity (%) vs time (200-800 km)"),
    "RHMD": (1.0,  "percent",      "RHMD: Same as RHLO for 700-500 hPa"),
    "RHHI": (1.0,  "percent",      "RHHI: Same as RHLO for 500-300 hPa"),
    # Z850 is published as vorticity * 1e7, i.e. the integer is in units of 1e-7 s^-1. The
    # archive column is vort850_1e5 (units of 1e-5 s^-1), so the conversion is /100 -- two
    # decades, not ten. Getting this wrong is a 100x error that still "looks plausible".
    "Z850": (100.0, "1e-5 s^-1",   "Z850: 850 hPa vorticity (sec-1 * 10**7) vs time (r=0-1000 km)"),
    # D200 is "same as above", i.e. also *1e7, and the archive column div200_1e7 is already
    # in units of 1e-7 s^-1 -- so the published integer passes through UNCHANGED.
    "D200": (1.0,  "1e-7 s^-1",    "D200: Same as above for 200 hPa divergence "
                                   "(above = Z850: ... sec-1 * 10**7)"),
    "VMPI": (1.0,  "kt",           "VMPI:  Maximum potential intensity from Kerry Emanuel equation (kt)"),
    "CSST": (10.0, "deg C",        "CSST: Climatological SST (deg C * 10) vs time"),
    "RSST": (10.0, "deg C",        "RSST: Reynolds SST (deg C*10) vs time. Number after SST label is the "
                                   "age in days of the SST analysis"),
    "COHC": (1.0,  "kJ/cm2",       "COHC: Same as above for ocean heat content (kJ/cm2) "
                                   "(above = CD20: Climatological depth (m) ... from 2005-2010 NCODA analyses)"),
    "U200": (10.0, "kt",           "U200: 200 hPa zonal wind (kt *10) vs time (r=200-800 km)"),
    "T200": (10.0, "deg C",        "T200: Same as above for 200 hPa temperature (deg C *10) "
                                   "(above = T150: 200 to 800 km area average ... deg C *10)"),
    "MTPW": (10.0, "mm",           "MTPW: ... 1) 0-200 km average TPW (mm * 10)"),
    "PW01": (10.0, "mm",           "PW01-PW19: Time dependent versions of the 21 TPW variables listed above."),
}

# Predictors environment_rows actually needs. Decoding only these instead of all 136 rows is
# what keeps the 438 MB EP file to one pass in tens of seconds rather than minutes.
_ENV_LABELS = frozenset({
    "LAT", "LON", "SHDC", "SHRD", "SDDC", "RHMD", "RHLO", "RHHI", "Z850", "D200",
    "VMPI", "RSST", "CSST", "MSLP", "COHC", "MTPW", "PW01", "U200", "T200",
})


# --- primitives -------------------------------------------------------------------------


def _label_of(line: str) -> str | None:
    """The row's predictor name: the first whitespace-delimited token of the label field.

    Returns None for a line with no label field at all, which is how a truncated final line
    or a stray blank line is dropped instead of being mistaken for a predictor.
    """
    field = line[LABEL_COL:]
    if not field or not field.strip():
        return None
    return field.split(None, 1)[0]


def _values(line: str) -> list[float | None]:
    """The 31 published numbers of one predictor row, missing as None, NOTHING scaled.

    Blank and 9999 are both missing and both become None. They are not the same thing in the
    source -- blank means "this column does not exist for this predictor", 9999 means "the
    publisher had no value" -- but the archive cannot act on the difference and MUST NOT act
    on either by inventing a number, so both collapse to absent.
    """
    out: list[float | None] = []
    for start in range(0, N_FIELDS * FIELD_WIDTH, FIELD_WIDTH):
        token = line[start:start + FIELD_WIDTH].strip()
        if not token or token == MISSING_TOKEN:
            out.append(None)
        else:
            out.append(float(token))
    return out


def _signed_lon(deg_west: float) -> float:
    """Degrees WEST (the file's convention) -> signed degrees east-positive, -180..180.

    The wrap branch is not decoration: a storm that crosses the dateline is published as
    e.g. 182.0 W, which must become +178.0, not -182.0. No such value occurs in the AL, EP
    or CP files (ranges 6.0..126.6, 69.2..177.9, 136.5..177.9 W) but the WP/IO/SH files use
    the same format and this function is the only place the convention is applied.
    """
    lon = -float(deg_west)
    while lon < -180.0:
        lon += 360.0
    while lon > 180.0:
        lon -= 360.0
    return lon


def _calendar_year(yy: int, atcf_id: str) -> int:
    """Resolve the HEAD line's 2-digit year using the 4-digit SEASON year in the ATCF id.

    A pivot rule ("82..99 -> 19xx") would be a guess; the ATCF id makes it a lookup. The +-1
    window exists because a storm can outlive its season: AL312005 (Zeta) published 23
    records dated 06/01/01..06/01/06, i.e. calendar 2006 under season 2005.
    """
    if len(atcf_id) < 8 or not atcf_id[4:8].isdigit():
        raise ShipsFormatError("HEAD line has no 4-digit season year in ATCF id %r" % atcf_id)
    season = int(atcf_id[4:8])
    for year in (season, season + 1, season - 1):
        if year % 100 == yy:
            return year
    raise ShipsFormatError(
        "HEAD 2-digit year %02d cannot be reconciled with ATCF season %d" % (yy, season))


def _parse_head(line: str, lineno: int) -> dict:
    """HEAD -> name, aware-UTC time, vmax, signed lat/lon, ATCF id.

    HEAD is whitespace-delimited into exactly 9 tokens in all 32,842 records of the three
    cached files (name, YYMMDD, HH, VMAX, LAT, LON, MSLP, ATCF id, "HEAD"), and the name is
    the storm name truncated to its first four letters so it never contains a space. Column
    slicing would also work; token splitting is used because it is the reading that the data
    itself validates, and a short/blank name would show up as a token-count error rather than
    silently shifting every following field by one column.
    """
    tok = line.split()
    if len(tok) != 9 or tok[8] != "HEAD":
        raise ShipsFormatError("line %d: HEAD line has %d tokens, expected 9: %r"
                               % (lineno, len(tok), line[:60]))
    name, date, hh, vmax, lat, lon, _mslp, atcf = tok[:8]
    if len(date) != 6 or not date.isdigit():
        raise ShipsFormatError("line %d: HEAD date %r is not YYMMDD" % (lineno, date))
    year = _calendar_year(int(date[:2]), atcf)
    when = _dt.datetime(year, int(date[2:4]), int(date[4:6]), int(hh),
                        tzinfo=_dt.timezone.utc)
    return {
        "atcf_id": atcf,
        "name": name.strip(),
        "iso_time": when,
        # VMAX/LAT/LON on HEAD are already decimal (not *10) and 9999 marks missing there
        # too -- the pressure column is 9999 for every pre-2010 record.
        "vmax_kt": None if vmax == MISSING_TOKEN else float(vmax),
        "lat": None if lat == MISSING_TOKEN else float(lat),
        "lon": None if lon == MISSING_TOKEN else _signed_lon(float(lon)),
    }


def _parse_times(line: str, lineno: int) -> list[int]:
    """The TIME row -> 31 lead times in hours.

    A missing or blank TIME field is fatal rather than None. Every other row in the record is
    positional: without knowing which column is tau=0 there is no honest way to say what any
    number means, and picking the third column "because it always is" would be exactly the
    kind of remembered-format assumption this parser exists to avoid. (It always is, in all
    32,842 records -- the TIME row is byte-identical everywhere -- but that is a fact this
    code re-derives per record, not one it hard-codes.)
    """
    out: list[int] = []
    for start in range(0, N_FIELDS * FIELD_WIDTH, FIELD_WIDTH):
        token = line[start:start + FIELD_WIDTH].strip()
        if not token or token == MISSING_TOKEN:
            raise ShipsFormatError("line %d: TIME row has an unreadable column %r"
                                   % (lineno, token))
        try:
            out.append(int(token))
        except ValueError:
            raise ShipsFormatError("line %d: TIME row column %r is not an integer"
                                   % (lineno, token)) from None
    return out


def _iter_raw(path: Path | str, want: frozenset[str] | None) -> Iterator[dict]:
    """Stream records, decoding only the predictor rows in `want` (None = all of them).

    Streaming is not an optimisation here, it is a requirement: ships.EP.txt is 438 MB /
    2,435,002 lines and readlines() on it costs more RAM than the whole archive.
    """
    head: dict | None = None
    times: list[int] | None = None
    preds: dict[str, list[float | None]] = {}
    with open(path, "r", encoding="ascii", errors="replace") as fh:
        for lineno, line in enumerate(fh, 1):
            label = _label_of(line)
            if label is None:
                continue
            if label == "HEAD":
                head = _parse_head(line, lineno)
                times = None
                preds = {}
                continue
            if head is None:
                # Bytes before the first HEAD have no record to belong to. Dropping them is
                # safe; attaching them to the next record would not be.
                continue
            if label == "TIME":
                times = _parse_times(line, lineno)
            elif label == "LAST":
                if times is None:
                    raise ShipsFormatError(
                        "line %d: record %s %s ended without a TIME row"
                        % (lineno, head["atcf_id"], head["iso_time"]))
                rec = dict(head)
                rec["times"] = times
                rec["predictors"] = preds
                yield rec
                head, times, preds = None, None, {}
            elif want is None or label in want:
                preds[label] = _values(line)
    if head is not None:
        raise ShipsFormatError("file ended inside record %s %s (no LAST line)"
                               % (head["atcf_id"], head["iso_time"]))


# --- public API -------------------------------------------------------------------------


def iter_records(path: Path | str) -> Iterator[dict]:
    """Yield one dict per synoptic record, streaming, with NOTHING scaled or invented.

        {
          "atcf_id":    "CP041982",
          "name":       "IWA",
          "iso_time":   datetime(1982, 11, 24, 6, tzinfo=timezone.utc),   # aware UTC
          "vmax_kt":    80.0,          # HEAD line, kt, None if 9999
          "lat":        23.3,          # HEAD line, deg N
          "lon":       -158.4,         # HEAD line, SIGNED east-positive (file says 158.4 W)
          "times":      [-12, -6, 0, 6, ... 168],       # 31 ints, read from the TIME row
          "predictors": {"SHDC": [None, None, 61.0, ...], ...},   # 31 entries each
        }

    The values in `predictors` are the integers the publisher printed, as floats, with 9999
    and blank both mapped to None. They are deliberately UNSCALED: SHDC 61.0 is 6.1 kt and
    Z850 34.0 is 3.4e-6 s^-1, and the divisor that says so lives in UNITS, applied once, in
    environment_rows(). A caller that wants raw SHIPS numbers gets exactly the file; a caller
    that wants physical units should use environment_rows() rather than reinvent the table.
    """
    return _iter_raw(path, None)


def environment_rows(
    path: Path | str,
    *,
    source_key: str,
    storm_id_for: Callable[[str, _dt.datetime], str | None] | None = None,
    taus: Sequence[int] = (0,),
) -> list[dict]:
    """SHIPS -> rows matching schema.ENVIRONMENT exactly, in physical units.

    `taus` selects which SHIPS lead columns become rows; the default (0,) is the ANALYSIS
    time only, because that is what the archive stores -- the environment as analysed, not a
    forecast of it. Non-zero taus are legitimate (the developmental file is perfect-prog, see
    the module docstring) but they duplicate the analysis rows of later records, so a build
    that asks for them will get several rows per valid time distinguished only by
    lead_hours.

    `iso_time` is always the time the values DESCRIBE: analysis time + tau. `lead_hours`
    records which SHIPS column it was read from, so the two together are lossless.

    `storm_id_for(atcf_id, iso_time)` maps onto IBTrACS SIDs. When it returns None the row is
    still emitted with storm_id=None: an environment record that no track row claims is a
    finding about the join, and dropping it would hide the finding.

    NOTE FOR THE WRITER -- schema.ENVIRONMENT declares storm_id nullable=False. Those rows go
    into a pyarrow Table fine (from_pylist does not enforce nullability) and then fail at
    write time with "ArrowInvalid: Column 'storm_id' is declared non-nullable but contains
    nulls", verified against pyarrow.parquet.write_table. That failure is the intended alarm:
    count the unjoined rows, record a Gap naming them, and either resolve the join or exclude
    them deliberately. Do not "fix" it by inventing an id or by relaxing the schema.

    SUBSTITUTIONS ARE NEVER SILENT. shear_kt prefers SHDC (vortex removed, 0-500 km) and
    falls back to SHRD; sst_c prefers the Reynolds analysis RSST and falls back to CSST,
    which is CLIMATOLOGY, not an observation. Where a fallback was used the row's env_source
    carries a suffix ('ships_dev+csst'), so a query can exclude climatology-backed rows
    without re-reading the source. In the cached files SHDC is never missing at tau=0, and
    RSST is missing at tau=0 in 361/17,518 EP and 478/14,328 AL records and 0/996 CP.
    """
    taus = tuple(int(t) for t in taus)
    if not taus:
        raise ValueError("taus must name at least one SHIPS lead column")
    # One stamp for the whole build so every row of one run is comparable. Format matches
    # provenance._now() so MANIFEST.json and the tables agree.
    ingested = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    rows: list[dict] = []
    for rec in _iter_raw(path, _ENV_LABELS):
        times = rec["times"]
        index_of = {t: i for i, t in enumerate(times)}
        for tau in taus:
            if tau not in index_of:
                raise ShipsFormatError(
                    "record %s %s publishes no tau=%d column (TIME row is %s..%s)"
                    % (rec["atcf_id"], rec["iso_time"], tau, times[0], times[-1]))
            rows.append(_env_row(rec, tau, index_of[tau], index_of.get(0),
                                 source_key=source_key, storm_id_for=storm_id_for,
                                 ingested=ingested))
    return rows


def _env_row(rec: dict, tau: int, i: int, i0: int | None, *, source_key: str,
             storm_id_for, ingested: str) -> dict:
    p = rec["predictors"]

    def raw(label: str) -> float | None:
        seq = p.get(label)
        return seq[i] if seq is not None else None

    def scaled(label: str) -> float | None:
        v = raw(label)
        if v is None:
            return None
        return v / UNITS[label][0]

    when = rec["iso_time"] + _dt.timedelta(hours=tau)

    # Position: the LAT/LON rows, which at tau=0 reproduce HEAD exactly (0 mismatches in
    # 32,842 records) -- HEAD is only used if the predictor row is missing there.
    lat = scaled("LAT")
    lon_w = scaled("LON")
    lon = None if lon_w is None else _signed_lon(lon_w)
    if tau == 0:
        if lat is None:
            lat = rec["lat"]
        if lon is None:
            lon = rec["lon"]

    marks: list[str] = []

    shear = scaled("SHDC")
    if shear is None:
        shear = scaled("SHRD")
        if shear is not None:
            marks.append(SUBST_SHRD)

    sst = scaled("RSST")
    if sst is None:
        sst = scaled("CSST")
        if sst is not None:
            marks.append(SUBST_CSST)

    # TPW: MTPW is a t=0-only record of 21 different quantities whose first value sits in the
    # tau=0 column, so it can only be read there. Every other tau reads PW01, the official
    # time-dependent version of that same quantity (0-200 km average TPW). The two are
    # byte-identical at tau=0 in all 32,842 cached records.
    if tau == 0:
        tpw = scaled("MTPW")
        if tpw is None:
            tpw = scaled("PW01")
    else:
        tpw = scaled("PW01")

    env_source = ENV_SOURCE + "".join("+" + m for m in marks)
    storm_id = storm_id_for(rec["atcf_id"], when) if storm_id_for is not None else None

    return {
        "storm_id": storm_id,
        "iso_time": when,
        "atcf_id": rec["atcf_id"],
        "lat": lat,
        "lon": lon,
        "env_source": env_source,
        "shear_kt": shear,                 # kt              <- SHDC (kt*10), else SHRD
        "rh_mid_pct": scaled("RHMD"),      # percent         <- RHMD (already %)
        "vort850_1e5": scaled("Z850"),     # 1e-5 s^-1       <- Z850 (s^-1 * 1e7) / 100
        "pot_intensity_kt": scaled("VMPI"),  # kt            <- VMPI (already kt)
        "sst_c": sst,                      # deg C           <- RSST (degC*10), else CSST
        "mslp_env_mb": scaled("MSLP"),     # hPa             <- MSLP (see caveat in known_gaps)
        "ohc_kj_cm2": scaled("COHC"),      # kJ/cm2          <- COHC (see caveat in known_gaps)
        "div200_1e7": scaled("D200"),      # 1e-7 s^-1       <- D200 raw, already 1e-7 s^-1
        "rh_lo_pct": scaled("RHLO"),       # percent
        "rh_hi_pct": scaled("RHHI"),       # percent
        "tpw_mm": tpw,                     # mm              <- MTPW value 1 / PW01 (mm*10)
        "shear_dir_deg": scaled("SDDC"),   # deg, 90 = westerly shear
        "u200_kt": scaled("U200"),         # kt              <- U200 (kt*10)
        "t200_c": scaled("T200"),          # deg C           <- T200 (degC*10)
        # Genesis indices are a separate module's job; leaving them None here keeps the
        # decision about which GPI formulation the archive publishes in one place.
        "gpi": None,
        "gpi_method": None,
        "lead_hours": float(tau),
        "source_key": source_key,
        "processing_version": PROCESSING_VERSION,
        "ingested_utc": ingested,
    }


def known_gaps(source_key: str) -> list[Gap]:
    """The things this source does NOT say, stated up front so no reader has to infer them.

    These are properties of SHIPS itself, not of a particular file, so they are constant and
    a build can add them to the manifest without re-reading anything. Counts that depend on
    the file (unjoined storm_ids, how many rows fell back to climatology) belong to the build
    that produced them and are deliberately not manufactured here.
    """
    return [
        Gap(
            key=source_key,
            what="ohc_kj_cm2 is COHC, which is CLIMATOLOGICAL ocean heat content",
            why=("The official predictor document defines COHC by reference to CD20, "
                 "'Climatological depth (m) of 20 deg C isotherm from 2005-2010 NCODA "
                 "analyses', and lists COHC among the 'New climatological variables added' "
                 "in 2013. The analysed OHC is a different predictor, NOHC ('Ocean heat "
                 "content from the NCODA analysis (kJ/cm2) relative to the 26 C isotherm'), "
                 "which the ENVIRONMENT schema has no column for."),
            impact=("ohc_kj_cm2 answers 'how much heat is normally there in this place at "
                    "this time of year', NOT 'how much heat was there that day'. Any analog "
                    "match conditioned on it is matching climatology, and a warm-eddy or "
                    "cold-wake case will not be distinguishable."),
        ),
        Gap(
            key=source_key,
            what="mslp_env_mb is the storm's central pressure, not an environmental pressure",
            why=("SHIPS MSLP is defined as 'Minimum Sea Level Pressure (hPa)' -- the best "
                 "track central pressure of the cyclone. The environmental surface pressure "
                 "predictors are PENV ('200 to 800 km average surface pressure') and PENC, "
                 "both published as (hPa-1000)*10, and the schema has no column for them."),
            impact=("A query that reads mslp_env_mb as an ambient pressure will read storm "
                    "intensity instead, and the correlation with vmax will look like signal."),
        ),
        Gap(
            key=source_key,
            what="MSLP is not published for most early records",
            why=("The 2010 modification note in the official document says min pressure and "
                 "ATCF id were added to the header that year. Measured at tau=0 in the cached "
                 "files: MSLP is missing in 502/996 CP, 3,811/17,518 EP and 127/14,328 AL "
                 "records."),
            impact=("mslp_env_mb is null for roughly half the Central Pacific sample. Any "
                    "period-over-period comparison that drops nulls silently drops the "
                    "pre-2010 era with them."),
        ),
        Gap(
            key=source_key,
            what="sst_c falls back to climatology when the Reynolds analysis is absent",
            why=("RSST (Reynolds SST) is missing at tau=0 in 361/17,518 EP and 478/14,328 AL "
                 "records (0/996 in CP). Those rows carry CSST, the climatological SST, and "
                 "say so in env_source ('ships_dev+csst')."),
            impact=("Rows marked ships_dev+csst carry a normal SST for the location and date, "
                    "not an observed one. Exclude them from any anomaly analysis."),
        ),
        Gap(
            key=source_key,
            what="SHIPS predictors are storm-relative annulus averages, not point values",
            why=("Every predictor is defined over a radius band around the best-track centre "
                 "(RHLO/RHMD/RHHI and U200 over 200-800 km, SHDC over 0-500 km relative to "
                 "the 850 hPa vortex centre, Z850 over 0-1000 km), and the atmospheric fields "
                 "come from NCEP analyses -- CFSR reanalysis for 1982-2000 and operational GFS "
                 "analyses from 2001 on, per the official document."),
            impact=("These values are not interchangeable with gridded reanalysis point values, "
                    "and the 2000/2001 change of input model is a discontinuity in the middle "
                    "of the record that no column of the archive flags."),
        ),
    ]
