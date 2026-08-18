"""HURDAT2 -- the independent cross-check, and the ONLY official landfall record.

WHY THIS FILE EXISTS WHEN IBTrACS IS ALREADY THE SPINE. Two reasons, and neither is
"more track data".

  1. CROSS-CHECK. IBTrACS reconciles agencies; HURDAT2 is NHC's own re-analysed best
     track, published separately, and the two DISAGREE. A disagreement between the
     archive's spine and the agency that produced most of the spine's East Pacific rows
     is a finding about the archive's uncertainty, so `crosscheck()` returns the
     DISAGREEMENTS and refuses to merge them into a single "truth". Averaging two
     best-tracks would invent a third that no forecaster ever published.

  2. LANDFALL. The RECORD IDENTIFIER column carries 'L' at fixes NHC itself designates
     as landfalls -- the centre crossing a coastline, timed to the minute. That is a
     published fact. A polygon test against a coastline shapefile is an inference, and
     an inference that depends on which coastline resolution someone downloaded. Where
     an 'L' exists it wins, and `genesis.geo` is only the fallback for the coasts NHC
     does not flag (which, for Hawaii, is nearly all of them -- see TRAP 5, it is the
     single most consequential thing in this file).

EVERYTHING BELOW WAS ESTABLISHED BY READING .genesis-cache/hurdat2.nepac.txt
(4,083,231 bytes, 33,288 lines, 1,262 storm headers, 32,026 data lines, seasons
1949-2025), not from memory of the format. Every count in this docstring was printed
from that file.

-----------------------------------------------------------------------------------
THE SHAPE OF THE FILE
-----------------------------------------------------------------------------------
Two interleaved line types, no header row, no units row, LF endings, pure ASCII, and
NO trailing newline on the final line (32,026th data line ends at EOF -- a reader that
requires a terminating newline drops the last fix of the last storm).

HEADER   'EP011949,            UNNAMED,      7,'
         atcf id, name (right-aligned in a 19-char field), number of data lines that
         follow, and a TRAILING COMMA that makes it 4 comma-separated fields of which
         the 4th is always empty. Measured: 1,262/1,262 headers have exactly 4 fields
         and an empty 4th.

DATA     '19490611, 0000,  , TS, 20.2N, 106.3W,  45, -999, -999, ... , -999'
         yyyymmdd, hhmm, record identifier, status, lat, lon, max wind kt, min pressure
         mb, twelve wind-radii fields, RMW. NO trailing comma: 21 real fields.

The two are told apart by `is_header_line()`, which anchors on the id pattern
[A-Z]{2}\\d{6} rather than on field count, because field count is the thing that is
allowed to vary and the id pattern is not. A data line begins with 8 digits and can
never match it.

-----------------------------------------------------------------------------------
TRAP 1 -- THE ERA-VARYING COLUMN COUNT HAS ALREADY BEEN NORMALISED AWAY. DO NOT RELY
          ON THAT.
-----------------------------------------------------------------------------------
HURDAT2 is documented as having grown columns over time (wind radii from 2004, RMW
from 2021). In THIS file that growth is invisible: all 32,026 data lines carry exactly
21 fields, and the 1949 lines are padded with -999 in the columns that did not exist
in 1949. Measured field-count histogram: {21: 32026}. One value.

So the ragged-line defence in `_parse_data_line()` is dead code TODAY, and it stays
anyway. NHC re-issues HURDAT2 under a new dated filename several times a year (see
`build_archive._discover_hurdat2`), and the padding convention is a property of the
issue, not of the format. Positional access past the end of a short line raises
IndexError inside a 4 MB parse; `_field()` returns None instead, so a future issue
that stops padding loses the radii it does not have rather than the storms it does.

The header's own line count is used as a checksum on that logic: measured 0 mismatches
between the claimed count and the number of data lines actually consumed, across all
1,262 storms. A mismatch means the parse desynchronised, which would silently attach
one storm's fixes to another storm's identity, so it RAISES rather than warns.

-----------------------------------------------------------------------------------
TRAP 2 -- THE RECORD IDENTIFIER, WHICH IS THE WHOLE POINT OF THIS MODULE
-----------------------------------------------------------------------------------
Measured over all 32,026 data lines -- the complete enumeration, nothing else occurs:

    ''  31,872      L  139      I  7      T  5      S  3

    L  landfall: centre crossing a coastline.        139 rows / 107 storms / 1959-2025
    I  intensity peak (both wind and pressure).      7 rows, all status HU
    T  extra detail on the track between synoptics.  5 rows
    S  change of status of the system.               3 rows

NHC's format document also defines C (closest approach without landfall), G (genesis),
P (minimum central pressure), R (rapid intensity change) and W (maximum wind). NONE of
those five appear anywhere in the NE Pacific file. That is worth stating because it
closes off a tempting shortcut: there is no 'G' record to read genesis off, so genesis
here is derived the same way it is derived for IBTrACS -- first fix whose status is
tropical -- and there is no 'C' record, so "came close but did not land" is not a
published category in this basin and cannot be counted.

`landfall_rows()` keys on 'L' and on nothing else. It does NOT treat a coastal fix, a
'T' record near a coast, or a status change at a coast as a landfall.

-----------------------------------------------------------------------------------
TRAP 3 -- 'L' RECORDS ARE OFF-SYNOPTIC AND MUST NOT BE ROUNDED
-----------------------------------------------------------------------------------
A landfall happens when it happens. Measured minute field over the whole file:

    :00  31,990      :30  20      :15  6      :45  4      :50  2      :20  2      :35  2

and cross-tabulated against the record identifier:

    ''  31,872 on the hour,   0 off the hour
    L      104 on the hour,  35 off the hour     <-- 25% of all landfalls
    T        4 on the hour,   1 off the hour
    I, S     all on the hour

So a quarter of the official landfall times carry minutes: ISELLE hit Hawaii at
12:30 UTC, JOHN at 03:15, ERICK at 11:30, WALAKA at 06:20. Any code that snaps a
landfall to the nearest synoptic hour is moving a published event by up to 3 hours and
will mis-order it against the track fixes around it. `landfall_utc` is the file's own
minute, unrounded, and the hour is NEVER used to infer anything.

There are also 53 distinct hhmm values in the file overall and 0 duplicate
(storm, date, time) triples in 32,026 rows, so (atcf_id, iso_time) is a usable key and
an 'L' record is always its own fix -- never a duplicate of the synoptic fix beside it.
Times are non-decreasing within every storm (0 inversions measured).

-----------------------------------------------------------------------------------
TRAP 4 -- LONGITUDE IS SIGNED-BY-LETTER, AND THAT IS THE OPPOSITE OF IBTrACS
-----------------------------------------------------------------------------------
Positions are printed with a hemisphere letter: '106.3W', '179.9E', '20.2N'. Measured
suffixes: lat N 32,026 / S 0; lon W 31,393 / E 633. The 633 East rows belong to 26
storms that crossed the dateline going west, spanning +129.1 .. +179.9; the West rows
span -180.0 .. -50.5.

Converting by letter gives a true -180..180 column, which is what the schema wants and
which IBTrACS's LON column is NOT (IBTrACS keeps each track CONTINUOUS past 180 and
`ibtracs.signed_lon()` wraps it). The two files therefore have OPPOSITE traps and they
cancel in exactly the wrong direction:

    IBTrACS raw  -> continuous, safe to difference, wrong range
    HURDAT2 raw  -> correct range, UNSAFE to difference across the dateline

Differencing consecutive `lon` values here produces a 360-degree phantom jump for the
storms in that 26. This module differences longitude in exactly one place -- the
implied-speed guard in `landfall_rows()` -- and it wraps the delta into [-180, 180]
before using it (`_haversine_km`). Nothing else in this module treats lon as ordered.

THE -50.5W ROWS ARE NOT AN ERROR. 36 fixes of EP222016 OTTO, EP042022 BONNIE and
EP182022 JULIA sit east of 80W, in the Caribbean, because those storms crossed Central
America and HURDAT2 carries the whole track under the EP number. A storm's basin
therefore CANNOT be read off its position, and this module reads it off the ATCF id
prefix (EP 1,180 storms / CP 82) and nothing else.

-----------------------------------------------------------------------------------
TRAP 5 -- READ THIS BEFORE TRUSTING 'L' RECORDS FOR HAWAII. INIKI HAS NO 'L' RECORD.
-----------------------------------------------------------------------------------
Official 'L' coverage in this file is overwhelmingly Mexico and Central America.
Measured inside the Hawaii box the assignment asked about (lat 18..23N, lon
161..154W):

    'L' records in the box                                    1
        EP092014 ISELLE, 2014-08-08 12:30 UTC, 19.2N 155.4W, TS, 50 kt (Big Island)

    storms with AT LEAST ONE published fix inside that box   42

Widen to 15..30N / 180..150W and a second appears: CP012018 WALAKA, 2018-10-04 06:20
UTC, 24.1N 166.8W, HU 110 kt -- East Island, French Frigate Shoals, in the
Northwestern Hawaiian Islands. It is a real Hawaii landfall that the assignment's box
excludes, which is itself a warning about latitude/longitude boxes as region tests.

AND THE ONE THAT MATTERS MOST IS MISSING. EP181992 INIKI -- the most destructive
hurricane ever to strike Hawaii -- has 33 fixes in this file and NOT ONE record
identifier of any kind. Its track steps 19.5N 160.0W at 1992-09-11 18:00 to 21.5N
159.8W at 09-12 00:00, straddling Kauai, with the flag column blank on both sides.

    139 'L' records in the file; 138 are EP-numbered, 1 is CP-numbered.

So: `landfall_rows()` is the PRIMARY landfall source and it is very nearly EMPTY for
the archive's headline use case. A Hawaii landfall climatology built from 'L' records
alone would report one tropical-storm strike in 77 seasons and zero hurricanes, which
is false. The polygon fallback in `genesis.geo` is not a nicety here; it is the only
thing that finds Iniki, and rows it produces must stay distinguishable by `detection`
so the two claims are never counted as equally authoritative.

-----------------------------------------------------------------------------------
TRAP 6 -- SEASON COMES FROM THE ID, NOT FROM THE DATE
-----------------------------------------------------------------------------------
3 data rows carry a year different from their storm's id year: CP092015 "NINE" runs
2015-12-27 .. 2016-01-01. HURDAT2 assigns it to the 2015 season and the id says so.
Taking the season from the first fix's date would move that storm to 2016 for some of
its rows and 2015 for others depending on which fix was read. `season` is int(id[4:8]),
one value per storm, matching the publisher's own attribution.

-----------------------------------------------------------------------------------
TRAP 7 -- STATUS AND WIND DISAGREE ONCE, AND THE SPEC SAYS WIND WINS
-----------------------------------------------------------------------------------
`hurricane_at_landfall` is vmax >= THRESHOLDS_KT['cat1'] and `ts_at_landfall` is
vmax >= THRESHOLDS_KT['ts'], per assignment. Measured against the status column on the
139 'L' rows:

    status HU 56 / TS 53 / TD 30          vmax >= 64: 57      vmax >= 34: 109

56 != 57. EP111996 HERNAN, 1996-10-03 10:00, is flagged status 'TS' while carrying
65 kt. One row, and it is left exactly as it is: `stage` keeps the published status and
`hurricane_at_landfall` follows the wind, so the disagreement survives in the table
instead of being resolved by this parser. (The 34 kt boundary is clean: TS+HU = 109.)

-----------------------------------------------------------------------------------
MISSING VALUES, AND WHICH COLUMNS ACTUALLY USE THEM
-----------------------------------------------------------------------------------
-999 is the only missing marker; there is no blank, no 'NA', no -99. Measured:

    max wind      0 missing of 32,026   (range 10 .. 185 kt -- never absent HERE)
    min pressure  12,794 missing        (range 872 .. 1021 mb on the rest)
    34 kt radii   19,744 rows all-missing; first non-missing season 2004
    RMW           29,526 missing;        first non-missing season 2021 (range 5..180)

"never absent HERE" is not "never absent". Other HURDAT2 basins and future issues can
carry -999 winds, so `vmax_kt` is parsed through the same sentinel filter as everything
else and can come back None. A landfall row with vmax None gets category None and
hurricane_at_landfall/ts_at_landfall None -- NOT False. "No wind was published for this
landfall" and "this landfall was below hurricane force" are different statements.

-----------------------------------------------------------------------------------
THE TWELVE RADII COLUMNS -- LAYOUT PROVEN FROM THE BYTES, QUADRANT ORDER NOT
-----------------------------------------------------------------------------------
The grouping (threshold-major: four 34 kt quadrants, then four 50 kt, then four 64 kt)
was not taken on faith. Two independent tests over the 12,282 rows that carry radii:

  * MONOTONICITY. A 50 kt wind field cannot be larger than the 34 kt field that
    contains it. Counting quadrant triples that violate r34 >= r50 >= r64:
        threshold-major grouping     1 violation of 49,128
        quadrant-major grouping  6,142 violations
  * WIND GATING. Radii can only exist for thresholds the storm actually reached:
        rows with vmax < 34 and a non-zero first group     0 of 5,343
        rows with vmax < 50 and a non-zero middle group    0 of 8,284
        rows with vmax < 64 and a non-zero last group      0 of 9,803

Both tests agree, so fields 9-12 are 34 kt, 13-16 are 50 kt, 17-20 are 64 kt.

THE ONE VIOLATION IS PUBLISHED DATA, NOT A PARSE ERROR, and it is not repaired:
CP012006 IOKE 2006-08-21 00:00 has 34 kt SW = 15 nm but 50 kt SW = 20 nm. Similarly
EP082022 GEORGETTE 2022-07-27 18:00 has RMW 30 nm exceeding its largest 34 kt radius
(20 nm). Both pass through verbatim.

WHAT COULD NOT BE PROVEN FROM THE BYTES -- STATED AS UNCERTAINTY, NOT ASSUMED AWAY:

  * THE QUADRANT ORDER WITHIN EACH GROUP. NE, SE, SW, NW is NHC's documented order and
    there is no measurement in this file that can distinguish it from any other
    permutation -- no physical constraint orders quadrants. The keys `r34_ne` .. get
    their meaning from the format document, NOT from this file. If quadrant identity
    is load-bearing for a consumer, that consumer must re-verify it against the
    published format description; this module can only promise the four values are the
    four quadrants of that threshold, in file order.
  * THE UNITS. Unlike IBTrACS, HURDAT2 has NO in-band units row. kt / mb / nautical
    miles come from NHC's format document. The only in-file corroboration is range
    plausibility (winds 10-185, pressures 872-1021, radii 0-660, RMW 5-180), which is
    consistent with those units and rules out obvious alternatives (m/s, km) but is not
    a published statement of units. The `_nm` suffix on `rmw_nm` records that this is a
    documentation-sourced claim rather than a measured one.

-----------------------------------------------------------------------------------
WHAT `storm_id` IS IN A LANDFALL ROW, AND WHY IT IS NOT AN IBTrACS SID
-----------------------------------------------------------------------------------
schema.LANDFALLS.storm_id is NOT NULL and is documented as the IBTrACS SID. HURDAT2
has never heard of a SID. Rather than emit a null this module cannot emit, or invent a
mapping it cannot verify, `landfall_rows()` sets storm_id = atcf_id and leaves
`atcf_id` populated alongside it, so the row is self-describing and the substitution is
detectable (storm_id == atcf_id means "not yet joined"). `build_archive` re-points
storm_id through storms.atcf_id and records a Gap for any landfall it cannot join.
A consumer reading these rows directly must do the same join or accept an ATCF key.

THAT JOIN LOSES SIX OFFICIAL LANDFALLS, MEASURED. 104 of the 107 landfalling storms
match an IBTrACS storm 1:1 by ATCF id. The three that do not are the Central-America
crossers of TRAP 4 -- EP222016 OTTO, EP042022 BONNIE, EP182022 JULIA -- which IBTrACS
files under their ATLANTIC ids (AL162016, AL022022, AL132022) because it reconciles the
whole system into one storm. Their 6 'L' records (Nicaragua, Colombia, El Salvador)
therefore have no EP-file counterpart to join to and are dropped by the ATCF-keyed join,
with a Gap recorded. Recovering them needs the Atlantic IBTrACS basin loaded, not a
change here: this module reports what NHC published, and NHC published them under EP
numbers.

-----------------------------------------------------------------------------------
CROSS-CHECK POLICY
-----------------------------------------------------------------------------------
`crosscheck()` returns disagreements only, keyed on ATCF id, and never a merged value.
Three things it deliberately does NOT do:

  * It does not compare BASIN. HURDAT2 says CP012018; IBTrACS says basin EP with
    subbasin CP. Different vocabularies for the same fact would generate 82 fake
    disagreements.
  * It does not compare NAME as a disagreement. IBTrACS colon-joins cross-basin renames
    ('IRENE:OLIVIA') and HURDAT2 hyphenates re-uses ('IONE-1', 'IONE-2', 'JEN-KATH').
    Both names travel in the row as context so a human can look, but neither is scored.
  * It does not apply a tolerance. Winds are integers in both sources and times are
    exact; a 5 kt difference is a real difference between two published best tracks and
    hiding it under a threshold is how a cross-check becomes decorative.

POINT COUNTS ALWAYS DIFFER AND THAT IS STRUCTURAL, NOT AN ERROR. IBTrACS publishes
3-hourly rows (interpolating between agency reports) while HURDAT2 publishes the
6-hourly synoptics plus flagged special records: ~58 points per storm against ~25. The
count difference is still returned, because it is the number a reader needs to know
before comparing anything per-point between the two, but it is reported under its own
field name so it can be filtered out in one predicate.

-----------------------------------------------------------------------------------
WHAT THE CROSS-CHECK ACTUALLY FOUND, RUN ON THE SHIPPED FILES
-----------------------------------------------------------------------------------
1,262 HURDAT2 storms against the 1,712 storms of ibtracs.EP.csv; 1,251 ATCF ids match.
`crosscheck()` returned 1,655 rows:

    value_mismatch      1,215      of which 1,184 differ ONLY in point count
    only_in_ibtracs       393      351 WP ids, 21 AL, 18 EP, 3 CP -- see scoping note
    ambiguous_atcf_id      35
    only_in_hurdat         11
    ibtracs_no_atcf_id      1      covering 33 IBTrACS storms with a blank USA_ATCF_ID

    peak_vmax_kt differs        6 storms
    genesis_utc differs        26 storms (3 h to 42 h apart; 17 of them within 6 h)
    season differs              0 storms

SIX WIND DISAGREEMENTS, AND NOT ONE OF THEM IS THE TWO AGENCIES CONTRADICTING EACH
OTHER ABOUT THE SAME OCEAN. Four are SCOPE: IBTrACS's lifetime maximum runs over the
whole reconciled track while the NE Pacific HURDAT2 file stops at the basin edge.

    EP071986 GEORGETTE  hurdat 35 kt / ibtracs 65 kt   ibtracs track: 52 EP + 67 WP fixes
    EP112010 ELEVEN     hurdat 30 kt / ibtracs 60 kt   13 EP + 40 NA (it became HERMINE)
    CP051997 PAKA       hurdat 160 kt / ibtracs 158 kt 68 EP + 127 WP
    CP011957 DELLA      hurdat 110 kt / ibtracs 120 kt
    CP022002 ELE        hurdat 110 kt / ibtracs 115 kt
    CP041997 (unnamed)  hurdat 30 kt / ibtracs 35 kt

PAKA also shows the averaging-period trap `ibtracs` documents: 158 kt is not a multiple
of 5 because it is a converted non-US-agency wind, and it is a 10-minute wind sitting
beside CPHC's 1-minute 160. THE CROSS-CHECK DOES NOT CONVERT AND DOES NOT PICK. It says
they differ, which is the true statement; anything sharper would be manufactured.

The remaining three (DELLA, ELE, unnamed 1997) are genuine best-track differences in the
Central Pacific, 5-10 kt, on storms both agencies tracked in full. Those are the real
uncertainty in a Hawaii intensity climatology, and they are 3 storms out of 1,251.

SCOPING NOTE -- `only_in_ibtracs` IS ABOUT THE CALLER'S BASIN FILTER, NOT ABOUT NHC.
The IBTrACS "EP" file contains WP and NA storms (a third of its rows), so handing
`crosscheck()` every storm in it reports 393 ids the NE Pacific HURDAT2 file never
claimed to contain. Scoping the IBTrACS side to EP-genesis storms drops that to 41 and
leaves the other buckets untouched. Scope the two sides to the same population before
reading `only_in_ibtracs` as a HURDAT2 omission.

AMBIGUOUS IDS ARE AN IBTrACS PROPERTY, AND THEY MATTER BEYOND THIS FUNCTION. 35 ATCF
ids map to TWO IBTrACS storms each, all in early seasons: EP011969 is both 1969156N11263
(unnamed) and 1969183N13269 AVA; EP011976 is both ANNETTE and an unnamed 5-fix track.
ATCF ids were not a unique key before the modern numbering, so any
`{s['atcf_id']: s['storm_id']}` dictionary built over IBTrACS silently keeps whichever
storm was iterated last. None of the 107 landfalling storms is among those 35 (measured),
so today's landfall join is unaffected -- but the collision is real and this is the
function that can see it, which is why it is returned rather than resolved.

PURE PARSER -- no network, no clock at import time, no I/O outside the path handed in.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Callable, Iterable, Iterator

# `_now` is private in provenance.py, but it is the ONLY producer of the exact
# "%Y-%m-%dT%H:%M:%SZ" stamp SourceRecord.downloaded_utc uses. A second implementation
# here would let the manifest and the table rows drift apart on a format change.
from genesis.provenance import PROCESSING_VERSION, _now
from genesis.schema import THRESHOLDS_KT, TROPICAL_STATUS, category_for

# --------------------------------------------------------------------------------------
# constants -- every one of them measured above, none of them guessed
# --------------------------------------------------------------------------------------

# HURDAT2's only missing marker. Applies to every numeric column.
MISSING = -999

# A header line starts with the ATCF id. Anchored on the id, never on field count.
HEADER_RE = re.compile(r"^[A-Z]{2}\d{6},")

# The record identifier that means "NHC says the centre crossed a coastline here".
RECORD_LANDFALL = "L"

# schema.LANDFALLS.detection value for a row that came from an official 'L'. The polygon
# fallback uses 'bracketing_fix' / 'segment_crossing'; the three must stay distinct so a
# query can ask for published landfalls only.
DETECTION_L_RECORD = "hurdat2_L_record"

# schema.LANDFALLS.region is NOT NULL. When no attributor is supplied, or it declines to
# place the point, this is what goes in the column -- never a guessed region name.
REGION_UNATTRIBUTED = "unattributed"

# Field offsets in a data line. Named because a bare 20 in the middle of a parser is a
# fact nobody can check.
IDX_DATE, IDX_TIME, IDX_RECORD_ID, IDX_STATUS = 0, 1, 2, 3
IDX_LAT, IDX_LON, IDX_VMAX, IDX_MSLP = 4, 5, 6, 7
IDX_RADII_START, IDX_RADII_END = 8, 20     # 12 fields, threshold-major (proven above)
IDX_RMW = 20

# Threshold-major, quadrant order per NHC's format document (NOT provable from the file;
# see the docstring's uncertainty note).
RADII_KEYS = (
    "r34_ne", "r34_se", "r34_sw", "r34_nw",
    "r50_ne", "r50_se", "r50_sw", "r50_nw",
    "r64_ne", "r64_se", "r64_sw", "r64_nw",
)

# Implied translation speed above which a fix pair is called a relocation rather than
# motion. Measured on this file: the fastest inbound leg to any of the 139 'L' records is
# 26.7 kt, the 99.9th percentile over all 31,000 fix pairs is 33.3 kt, and the 12 pairs
# above 40 kt are all high-latitude extratropical acceleration (CP072015 OHO at 81.5 kt,
# 37N -> 45N in six hours), none of them adjacent to a landfall. So this guard fires ZERO
# times on today's file. It is kept because NHC re-issues the file and a re-analysis that
# moves a landfall position without moving its time would otherwise pass silently.
SUSPECT_SPEED_KT = 40.0

EARTH_RADIUS_KM = 6371.0088
KM_PER_NM = 1.852

__all__ = [
    "MISSING", "RECORD_LANDFALL", "DETECTION_L_RECORD", "REGION_UNATTRIBUTED",
    "RADII_KEYS", "SUSPECT_SPEED_KT",
    "is_header_line", "parse_lat", "parse_lon", "parse_missing_int", "parse_fix_time",
    "iter_storms", "genesis_fix", "peak_vmax_kt", "landfall_rows", "crosscheck",
]


# --------------------------------------------------------------------------------------
# scalar parsing
# --------------------------------------------------------------------------------------

def is_header_line(line: str) -> bool:
    """True for a storm header line ('EP011949, ... ,      7,').

    Tests the ATCF id pattern, not the field count: field count is exactly the thing
    that varies between HURDAT2 issues (TRAP 1) and the id pattern is exactly the thing
    that does not. A data line begins with 8 digits and cannot match.
    """
    return bool(HEADER_RE.match(line))


def parse_missing_int(token: str | None) -> int | None:
    """Integer field, or None when the file says -999.

    Returns None -- not 0, not -999 -- so that a missing value can never be summed,
    averaged or compared as though it were a measurement. Empty/blank is also None:
    it does not occur in this file (0 of 32,026 numeric fields) but a truncated future
    issue would produce it and 0 would be a silently plausible wrong answer.
    """
    if token is None:
        return None
    t = token.strip()
    if not t:
        return None
    try:
        v = int(t)
    except ValueError:
        try:
            v = int(float(t))
        except ValueError:
            return None
    return None if v == MISSING else v


def parse_lat(token: str | None) -> float | None:
    """'20.2N' -> 20.2, '5.0S' -> -5.0. Signed by the hemisphere letter.

    Every latitude in the NE Pacific file is N (32,026 of 32,026), so the S branch is
    untested against these bytes and is here for the Atlantic/Southern-Hemisphere files
    this parser is expected to be pointed at next.
    """
    return _signed_coord(token, positive="N", negative="S")


def parse_lon(token: str | None) -> float | None:
    """'106.3W' -> -106.3, '179.9E' -> +179.9. Signed -180..180 as the schema requires.

    The result is NOT safe to difference across the dateline; see TRAP 4. 633 rows in
    this file are E-hemisphere and sit next to W-hemisphere fixes of the same storm.
    """
    return _signed_coord(token, positive="E", negative="W")


def _signed_coord(token: str | None, *, positive: str, negative: str) -> float | None:
    if token is None:
        return None
    t = token.strip().upper()
    if not t:
        return None
    sign = 1.0
    if t[-1] == positive:
        t = t[:-1]
    elif t[-1] == negative:
        sign = -1.0
        t = t[:-1]
    else:
        # No hemisphere letter: refuse rather than assume one. Guessing the sign of a
        # longitude puts a storm in the wrong ocean, and every one of the 32,026 rows in
        # this file carries the letter, so a bare number means the format changed.
        return None
    try:
        return sign * float(t)
    except ValueError:
        return None


def parse_fix_time(date_token: str, time_token: str) -> datetime | None:
    """('19490611', '0000') -> tz-aware UTC datetime.

    Minutes are honoured, never rounded: 35 of the 139 landfall records are off the
    synoptic hour and rounding them would move a published event by up to 3 hours
    (TRAP 3). HURDAT2 times are UTC; the file carries no timezone field, and that claim
    comes from NHC's format document, not from the bytes.
    """
    d = (date_token or "").strip()
    t = (time_token or "").strip()
    if len(d) != 8 or not d.isdigit() or len(t) != 4 or not t.isdigit():
        return None
    try:
        return datetime(int(d[0:4]), int(d[4:6]), int(d[6:8]),
                        int(t[0:2]), int(t[2:4]), tzinfo=timezone.utc)
    except ValueError:
        return None


def _field(fields: list[str], idx: int) -> str | None:
    """Positional read that tolerates a short line (TRAP 1)."""
    return fields[idx] if 0 <= idx < len(fields) else None


def _text(token: str | None) -> str | None:
    if token is None:
        return None
    t = token.strip()
    return t or None


# --------------------------------------------------------------------------------------
# line -> record
# --------------------------------------------------------------------------------------

def _parse_header_line(line: str) -> dict:
    fields = [f.strip() for f in line.split(",")]
    atcf_id = fields[0]
    name = _text(_field(fields, 1))
    try:
        claimed = int((_field(fields, 2) or "").strip())
    except ValueError:
        claimed = None
    return {
        "atcf_id": atcf_id,
        "name": name,
        # Season from the id, never from a fix date -- TRAP 6.
        "season": int(atcf_id[4:8]),
        # Basin from the id prefix, never from a position -- TRAP 4's Caribbean rows.
        "basin": atcf_id[0:2],
        "claimed_lines": claimed,
    }


def _parse_data_line(line: str) -> dict:
    fields = [f.strip() for f in line.split(",")]
    radii_raw = [parse_missing_int(_field(fields, i))
                 for i in range(IDX_RADII_START, IDX_RADII_END)]
    return {
        "iso_time": parse_fix_time(_field(fields, IDX_DATE) or "",
                                   _field(fields, IDX_TIME) or ""),
        # '' in the file means "an ordinary synoptic fix"; it becomes None so that
        # `record_id is None` and `record_id == 'L'` are the only two tests anyone needs.
        "record_id": _text(_field(fields, IDX_RECORD_ID)),
        "status": _text(_field(fields, IDX_STATUS)),
        "lat": parse_lat(_field(fields, IDX_LAT)),
        "lon": parse_lon(_field(fields, IDX_LON)),
        "vmax_kt": parse_missing_int(_field(fields, IDX_VMAX)),
        "mslp_mb": parse_missing_int(_field(fields, IDX_MSLP)),
        "radii": dict(zip(RADII_KEYS, radii_raw)),
        "rmw_nm": parse_missing_int(_field(fields, IDX_RMW)),
    }


# --------------------------------------------------------------------------------------
# streaming reader
# --------------------------------------------------------------------------------------

def iter_storms(path) -> Iterator[dict]:
    """Yield one dict per storm, in file order, streaming.

        {atcf_id, name, season, basin, points: [
            {iso_time, record_id, status, lat, lon, vmax_kt, mslp_mb,
             radii: {r34_ne .. r64_nw}, rmw_nm}, ...]}

    Streams so that a 4 MB file (and the 100 MB Atlantic+EP+CP set a future build will
    hand it) never has to be resident at once.

    RAISES ValueError when a storm's header line count does not match the number of data
    lines that follow it, or when a data line appears before any header. Both mean the
    parse has desynchronised, and a desynchronised HURDAT2 parse does not produce
    missing data -- it produces one storm's fixes filed under another storm's identity,
    which is a fabricated track. Measured on the shipped file: 1,262 headers, 32,026
    data lines, 0 count mismatches, so this raise is a real invariant and not a wish.
    """
    current: dict | None = None
    points: list[dict] = []

    with open(path, "r", encoding="ascii", errors="strict") as fh:
        for lineno, raw in enumerate(fh, start=1):
            line = raw.rstrip("\n").rstrip("\r")
            if not line.strip():
                continue
            if is_header_line(line):
                if current is not None:
                    yield _finish(current, points, lineno)
                current = _parse_header_line(line)
                points = []
            else:
                if current is None:
                    raise ValueError(
                        "hurdat2: data line %d precedes any storm header: %r"
                        % (lineno, line[:60]))
                points.append(_parse_data_line(line))

    if current is not None:
        # The shipped file has NO trailing newline; the final storm is closed here, not
        # by a following header. Dropping this branch silently loses the last storm.
        yield _finish(current, points, None)


def _finish(header: dict, points: list[dict], lineno: int | None) -> dict:
    claimed = header.pop("claimed_lines", None)
    if claimed is not None and claimed != len(points):
        raise ValueError(
            "hurdat2: %s header claims %d data lines, %d parsed (%s). "
            "The parse desynchronised; refusing to emit a track that may belong to "
            "another storm."
            % (header["atcf_id"], claimed, len(points),
               "near line %d" % lineno if lineno else "at end of file"))
    header["points"] = points
    return header


# --------------------------------------------------------------------------------------
# derived, per storm -- pure functions over an iter_storms() dict
# --------------------------------------------------------------------------------------

def genesis_fix(storm: dict) -> dict | None:
    """First fix whose status is tropical, or None if the storm never was.

    Uses schema.TROPICAL_STATUS, the same set IBTrACS genesis uses, so `crosscheck()`
    compares two answers to the same question. HURDAT2 has no 'G' record to read this
    off (TRAP 2), and the file's own non-tropical codes (LO 3,407 / DB 332 / EX 165 /
    SS 9 / SD 8 / WV 5 rows) are exactly the pre- and post-tropical phases that must not
    be mistaken for genesis. Measured: 0 of the 1,262 storms in the NE Pacific file lack
    a tropical fix, so None is a defence against other basins and future issues rather
    than a case this file exercises.
    """
    for p in storm.get("points") or ():
        if (p.get("status") or "") in TROPICAL_STATUS:
            return p
    return None


def peak_vmax_kt(storm: dict) -> float | None:
    """Lifetime maximum wind over EVERY fix, tropical or not, or None if none published.

    Same rule as ibtracs.build_tables' max_vmax_kt (lifetime extreme over all fixes), so
    the two numbers are comparable. None when the storm has no wind at all -- which does
    not occur in this file (all 32,026 rows carry a wind, range 10-185 kt) but can in
    other basins.
    """
    winds = [p["vmax_kt"] for p in (storm.get("points") or ()) if p.get("vmax_kt") is not None]
    return float(max(winds)) if winds else None


# --------------------------------------------------------------------------------------
# landfalls -- the official record
# --------------------------------------------------------------------------------------

def _wrap180(deg: float) -> float:
    return ((deg + 180.0) % 360.0) - 180.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance. Wraps the longitude delta into [-180, 180] FIRST.

    Without the wrap, a storm stepping 179.9E -> 179.9W registers a 360-degree jump and
    the implied-speed guard fires on every dateline crossing (TRAP 4).
    """
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlam = math.radians(_wrap180(lon2 - lon1))
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def _implied_speed_kt(prev: dict | None, fix: dict) -> float | None:
    """Translation speed between the previous published fix and this one, in knots.

    DERIVED, and derived only from two published positions and two published times --
    it substitutes nothing. It exists to catch the relocation trap: when a best-track
    re-analysis moves a centre without moving its clock, the pair implies a speed no
    tropical cyclone travels at, and a landfall row built on the second fix is then
    positioned by an artefact.
    """
    if prev is None:
        return None
    for p in (prev, fix):
        if p.get("iso_time") is None or p.get("lat") is None or p.get("lon") is None:
            return None
    hours = (fix["iso_time"] - prev["iso_time"]).total_seconds() / 3600.0
    if hours <= 0:
        return None
    km = _haversine_km(prev["lat"], prev["lon"], fix["lat"], fix["lon"])
    return (km / KM_PER_NM) / hours


def _normalise_region(value) -> tuple[str, str | None]:
    """Whatever `region_for` returned -> (region, sub_region), never a guess.

    Accepts None, a bare string, a (region, sub_region) pair, or a mapping, because the
    geometry module is written by a different hand and its exact return shape is not
    this module's to dictate. Anything that does not resolve to a non-empty region name
    becomes REGION_UNATTRIBUTED: schema.LANDFALLS.region is NOT NULL, and the honest
    filler for "nobody attributed this point" is a word that says so, not 'mexico'
    because most landfalls in this file happen to be there.
    """
    if value is None:
        return REGION_UNATTRIBUTED, None
    if isinstance(value, str):
        return (value.strip() or REGION_UNATTRIBUTED), None
    if isinstance(value, dict):
        region = _text(value.get("region"))
        sub = _text(value.get("sub_region"))
        return (region or REGION_UNATTRIBUTED), sub
    try:
        seq = list(value)
    except TypeError:
        return REGION_UNATTRIBUTED, None
    region = _text(seq[0]) if len(seq) > 0 and isinstance(seq[0], str) else None
    sub = _text(seq[1]) if len(seq) > 1 and isinstance(seq[1], str) else None
    return (region or REGION_UNATTRIBUTED), sub


def landfall_rows(path, *, source_key: str,
                  region_for: Callable[[float, float], object] | None = None) -> list[dict]:
    """One row per official 'L' record, matching schema.LANDFALLS exactly.

    `region_for(lat, lon)` attributes the point to a region (hawaii / conus / mexico /
    ...). When it is None, or returns None, the row is emitted with
    region='unattributed' rather than dropped and rather than guessed -- a published
    landfall whose region nobody could resolve is still a published landfall, and it is
    findable later by its coordinates. Exceptions from `region_for` are NOT swallowed: a
    broken attributor should stop a build, not quietly unattribute 139 rows.

    FIELDS THAT ARE DELIBERATELY NULL:
      closest_approach_km -- meaningless for an 'L': NHC's claim is that the centre was
        ON the coast, so there is no distance to compute and no published one to copy.
        It belongs to the polygon fallback, where the number is a real output.
      mslp_mb -- null wherever HURDAT2 published -999. (0 of the 139 'L' rows, as it
        happens: every official landfall in this file carries a pressure.)

    `storm_id` is set to the ATCF id; see the docstring section on why, and re-point it
    through storms.atcf_id before joining to the rest of the archive.

    Measured on .genesis-cache/hurdat2.nepac.txt: 139 rows, 107 distinct storms, seasons
    1959-2025, 57 hurricane-strength / 109 TS-or-stronger, 0 flagged suspect_relocation.
    """
    ingested = _now()
    rows: list[dict] = []

    for storm in iter_storms(path):
        pts = storm["points"]
        for i, fix in enumerate(pts):
            if fix.get("record_id") != RECORD_LANDFALL:
                continue
            # A landfall with no position is not a locatable landfall, and lat/lon are
            # NOT NULL in the schema. Never occurs in this file (139 of 139 positioned);
            # skipping is the only honest option if it ever does.
            if fix.get("lat") is None or fix.get("lon") is None or fix.get("iso_time") is None:
                continue

            region, sub_region = _normalise_region(
                region_for(fix["lat"], fix["lon"]) if region_for is not None else None)

            vmax = fix.get("vmax_kt")
            vmax_f = None if vmax is None else float(vmax)
            mslp = fix.get("mslp_mb")
            speed = _implied_speed_kt(pts[i - 1] if i > 0 else None, fix)

            rows.append({
                "storm_id": storm["atcf_id"],
                "atcf_id": storm["atcf_id"],
                "season": storm["season"],
                "region": region,
                "sub_region": sub_region,
                "landfall_utc": fix["iso_time"],
                "lat": float(fix["lat"]),
                "lon": float(fix["lon"]),
                "vmax_kt": vmax_f,
                "mslp_mb": None if mslp is None else float(mslp),
                "category": category_for(vmax_f),
                "stage": fix.get("status"),
                # None, not False, when no wind was published: "below hurricane force"
                # and "intensity unrecorded" are different answers (TRAP 7 note).
                "hurricane_at_landfall":
                    None if vmax_f is None else vmax_f >= THRESHOLDS_KT["cat1"],
                "ts_at_landfall":
                    None if vmax_f is None else vmax_f >= THRESHOLDS_KT["ts"],
                "detection": DETECTION_L_RECORD,
                "implied_speed_kt": speed,
                "suspect_relocation": None if speed is None else speed > SUSPECT_SPEED_KT,
                "closest_approach_km": None,
                "source_key": source_key,
                "processing_version": PROCESSING_VERSION,
                "ingested_utc": ingested,
            })

    return rows


# --------------------------------------------------------------------------------------
# cross-check against the spine
# --------------------------------------------------------------------------------------

def _hours_between(a: datetime | None, b: datetime | None) -> float | None:
    if a is None or b is None:
        return None
    return (a - b).total_seconds() / 3600.0


def crosscheck(hurdat_storms: Iterable[dict],
               ibtracs_storm_rows: Iterable[dict]) -> list[dict]:
    """Per-storm disagreements between HURDAT2 and IBTrACS, keyed on ATCF id.

    `hurdat_storms` is anything `iter_storms()` yields; `ibtracs_storm_rows` is the
    storm-level rows from `ibtracs.build_tables()` (schema.STORMS shape: atcf_id,
    storm_id, name, season, genesis_utc, max_vmax_kt, track_points).

    RETURNS THE DISAGREEMENTS, NOT A MERGED TRUTH. Storms on which the two sources agree
    on all compared fields produce no row at all. Each returned row carries `kind` and a
    `fields` list naming what differs, so a gap report can be grouped without re-deriving
    anything:

        only_in_hurdat        the ATCF id is in HURDAT2 and not in the IBTrACS rows
        only_in_ibtracs       the reverse
        ambiguous_atcf_id     one ATCF id maps to several storms in one source, so no
                              per-storm comparison is defined; values are NOT compared
        value_mismatch        both sources have exactly one storm and they differ

    Comparison rules and what they cost are documented in the module docstring
    (CROSS-CHECK POLICY): no tolerance, no basin comparison, name carried but not
    scored, and point-count differences reported under their own field because they are
    structural (IBTrACS 3-hourly vs HURDAT2 6-hourly-plus-specials) rather than a
    disagreement about any storm.

    Rows with a NULL atcf_id on the IBTrACS side are not comparable at all -- there is
    no key -- and are counted into one `kind='ibtracs_no_atcf_id'` row rather than
    dropped, so the size of the blind spot is visible in the report.
    """
    hurdat_by_id: dict[str, list[dict]] = {}
    for s in hurdat_storms:
        hurdat_by_id.setdefault(s["atcf_id"], []).append(s)

    ibtracs_by_id: dict[str, list[dict]] = {}
    unkeyed: list[str] = []
    for r in ibtracs_storm_rows:
        aid = (r.get("atcf_id") or "").strip()
        if not aid:
            unkeyed.append(r.get("storm_id"))
            continue
        ibtracs_by_id.setdefault(aid, []).append(r)

    out: list[dict] = []

    if unkeyed:
        out.append({
            "atcf_id": None,
            "kind": "ibtracs_no_atcf_id",
            "fields": ["atcf_id"],
            "hurdat_name": None, "ibtracs_name": None,
            "hurdat_season": None, "ibtracs_season": None,
            "hurdat_peak_vmax_kt": None, "ibtracs_peak_vmax_kt": None,
            "peak_vmax_diff_kt": None,
            "hurdat_genesis_utc": None, "ibtracs_genesis_utc": None,
            "genesis_diff_hours": None,
            "hurdat_points": None, "ibtracs_points": None, "point_count_diff": None,
            "ibtracs_storm_id": None,
            "note": "%d IBTrACS storms carry no USA_ATCF_ID and cannot be cross-checked: %s"
                    % (len(unkeyed), ",".join(str(x) for x in unkeyed[:10])
                       + ("..." if len(unkeyed) > 10 else "")),
        })

    for aid in sorted(set(hurdat_by_id) | set(ibtracs_by_id)):
        hs = hurdat_by_id.get(aid, [])
        ibs = ibtracs_by_id.get(aid, [])

        h = hs[0] if hs else None
        b = ibs[0] if ibs else None
        row = {
            "atcf_id": aid,
            "kind": None,
            "fields": [],
            "hurdat_name": h["name"] if h else None,
            "ibtracs_name": b.get("name") if b else None,
            "hurdat_season": h["season"] if h else None,
            "ibtracs_season": b.get("season") if b else None,
            "hurdat_peak_vmax_kt": None, "ibtracs_peak_vmax_kt": None,
            "peak_vmax_diff_kt": None,
            "hurdat_genesis_utc": None, "ibtracs_genesis_utc": None,
            "genesis_diff_hours": None,
            "hurdat_points": len(h["points"]) if h else None,
            "ibtracs_points": b.get("track_points") if b else None,
            "point_count_diff": None,
            "ibtracs_storm_id": b.get("storm_id") if b else None,
            "note": "",
        }

        if not ibs:
            row["kind"] = "only_in_hurdat"
            row["fields"] = ["present"]
            row["hurdat_peak_vmax_kt"] = peak_vmax_kt(h)
            g = genesis_fix(h)
            row["hurdat_genesis_utc"] = g["iso_time"] if g else None
            out.append(row)
            continue
        if not hs:
            row["kind"] = "only_in_ibtracs"
            row["fields"] = ["present"]
            row["ibtracs_peak_vmax_kt"] = b.get("max_vmax_kt")
            row["ibtracs_genesis_utc"] = b.get("genesis_utc")
            out.append(row)
            continue
        if len(hs) > 1 or len(ibs) > 1:
            # 17 IBTrACS storms carry two ATCF ids because they crossed a basin, and a
            # future combined HURDAT2 (Atlantic + NE Pacific) can repeat an id across
            # files. Comparing "the first one" would produce a confident wrong answer.
            row["kind"] = "ambiguous_atcf_id"
            row["fields"] = ["atcf_id"]
            row["note"] = ("%d HURDAT2 storms and %d IBTrACS storms share this ATCF id "
                           "(%s); values not compared"
                           % (len(hs), len(ibs),
                              ",".join(str(x.get("storm_id")) for x in ibs)))
            out.append(row)
            continue

        h_peak = peak_vmax_kt(h)
        b_peak = b.get("max_vmax_kt")
        h_gen = genesis_fix(h)
        h_gen_t = h_gen["iso_time"] if h_gen else None
        b_gen_t = b.get("genesis_utc")
        h_pts = len(h["points"])
        b_pts = b.get("track_points")

        row["hurdat_peak_vmax_kt"] = h_peak
        row["ibtracs_peak_vmax_kt"] = b_peak
        row["hurdat_genesis_utc"] = h_gen_t
        row["ibtracs_genesis_utc"] = b_gen_t
        row["point_count_diff"] = (None if (h_pts is None or b_pts is None)
                                   else h_pts - b_pts)

        fields: list[str] = []

        # Peak wind. One-sided presence is itself a disagreement: one source published an
        # intensity and the other did not.
        if (h_peak is None) != (b_peak is None):
            fields.append("peak_vmax_kt")
        elif h_peak is not None and b_peak is not None:
            diff = float(h_peak) - float(b_peak)
            row["peak_vmax_diff_kt"] = diff
            if diff != 0.0:
                fields.append("peak_vmax_kt")

        # Genesis time, both sources defined as "first tropical fix".
        if (h_gen_t is None) != (b_gen_t is None):
            fields.append("genesis_utc")
        elif h_gen_t is not None and b_gen_t is not None:
            dh = _hours_between(h_gen_t, b_gen_t)
            row["genesis_diff_hours"] = dh
            if dh != 0.0:
                fields.append("genesis_utc")

        if row["point_count_diff"] not in (None, 0):
            fields.append("track_points")

        if (h["season"] is not None and b.get("season") is not None
                and int(h["season"]) != int(b["season"])):
            fields.append("season")

        if fields:
            row["kind"] = "value_mismatch"
            row["fields"] = fields
            out.append(row)

    return out
