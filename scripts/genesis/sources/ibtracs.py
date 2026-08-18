"""IBTrACS v04r01 -- the archive's spine: one row per storm, one row per published fix.

WHY THIS FILE IS THE SPINE. Every other table in this archive keys off `storm_id`, and
`storm_id` is the IBTrACS SID. IBTrACS is the only source that reconciles NHC, CPHC, JTWC
and JMA into a single track with a single identity, which is the only reason a storm that
was EP012014 to NHC and CP012014 to CPHC and WP112014 to JTWC can be counted once. Build
the archive off HURDAT2 instead and every dateline-crossing storm is three storms.

EVERYTHING BELOW WAS ESTABLISHED BY READING .genesis-cache/ibtracs.EP.csv (46 MB,
99,951 data rows, 1,717 SIDs, seasons 1876-2026), not from memory of the format.

-----------------------------------------------------------------------------------
TRAP 1 -- LINE 2 IS NOT DATA.
-----------------------------------------------------------------------------------
Line 1 is the 174 column names. Line 2 is a UNITS row:

    SID,SEASON,NUMBER,BASIN,...,LAT,LON,WMO_WIND,WMO_PRES,...
     ,Year, , , , , , ,degrees_north,degrees_east,kts,mb, , ,km,km,...

Feed it to a DictReader without skipping and you get a storm whose SID is a single space
and whose SEASON is the literal string "Year". It parses. It just is not a storm.

That units row is also the ONLY in-band statement of units in the file, so it is where
the unit claims in this module come from rather than from documentation that may not
match the bytes: LAT degrees_north, LON degrees_east, WMO_WIND/USA_WIND kts,
WMO_PRES/USA_PRES mb, DIST2LAND km, LANDFALL km, STORM_SPEED kts, STORM_DIR degrees.

-----------------------------------------------------------------------------------
TRAP 2 -- LON IS CONTINUOUS EAST-LONGITUDE, NOT -180..180. THIS ONE IS EXPENSIVE.
-----------------------------------------------------------------------------------
The header says `degrees_east` and most rows look signed (-58.8, -140.0), so it is very
easy to assume the column is already -180..180. It is not. Measured range in the EP file
is -179.8 .. 266.9, and 3,786 rows across 375 storms exceed 180.

IBTrACS keeps each track CONTINUOUS: it picks a branch cut per storm so the longitude
series never jumps. Hurricane/Typhoon John 1994 (SID 1994222N11267, the longest-lived TC
on record) starts at LON 266.9 -- which is 266.9-360 = 93.1W, off Mexico -- and walks
monotonically west through 216, 180.4, 175.9 into the WP and back east to 186.9.

Proof, measured over all 1,717 tracks:
    max |dLON| between consecutive fixes, RAW           = 11.2 deg   (0 jumps > 20 deg)
    max |dLON| between consecutive fixes, WRAPPED       = 359.9 deg  (435 jumps > 20 deg)
    storms with a raw LON both < -170 and > 170         = 0

So the raw column is continuous and the wrapped column is not. The archive schema demands
signed -180..180, so `signed_lon()` wraps -- and that wrap COSTS the dateline continuity.
Two consequences a consumer must know:

  * Never difference `lon` between consecutive track points to get motion. Use the
    `storm_speed_kt` / `storm_dir_deg` columns, which IBTrACS computed on its own
    continuous representation before the wrap and which this module passes through
    untouched. Differencing wrapped longitudes yields a 360-degree phantom jump for
    435 fix pairs in this file alone.
  * Bounding-box filters near the dateline must be written as two boxes, not one.

`signed_lon()` deliberately leaves any value already inside [-180, 180] BIT-IDENTICAL and
touches only the 3,786 out-of-range rows. Minimum intervention: a transform that rewrites
96% of a column to produce the same numbers is a transform whose bugs are invisible.

-----------------------------------------------------------------------------------
TRAP 3 -- THE "EP" FILE IS NOT THE EP BASIN, AND BASIN IS PER-POINT.
-----------------------------------------------------------------------------------
Measured BASIN over the 99,951 rows of the *East Pacific* file:

    EP 65,662     WP 33,074     NA 1,215

A third of the file is not EP. BASIN is the basin the storm was in AT THAT FIX, so a
dateline-crosser changes basin mid-track. The storm's basin therefore CANNOT be taken
from the filename, and cannot be taken from the last point either. This module derives it
from the GENESIS point (see TRAP 6), which is the only definition under which a storm has
exactly one basin and it is the one it formed in.

-----------------------------------------------------------------------------------
TRAP 4 -- CENTRAL PACIFIC IS A SUBBASIN, AND 'MM' MEANS MISSING.
-----------------------------------------------------------------------------------
There is no 'CP' basin. Measured (BASIN, SUBBASIN) pairs, all of them:

    ('EP','MM') 54,234   ('EP','CP') 11,428   ('WP','MM') 33,074
    ('NA','CS')    532   ('NA','NA')    417   ('NA','GM')    266

'MM' is IBTrACS's own missing marker, not a place, and it is normalised to None here so
that "no subbasin was assigned" cannot be mistaken for a region code. CS/GM/NA are the
Caribbean Sea / Gulf of Mexico / North Atlantic subbasins.

The Hawaii use case rides entirely on 'CP', so the boundary was checked against the bytes
rather than assumed. Signed-longitude ranges:

    EP + subbasin CP    -180.0 .. -140.0  (11,328 rows) plus 100 rows at exactly 180.0
    EP + subbasin MM    -140.0 ..  -84.9  (zero rows west of 140W)

Zero CP rows east of 140W and zero EP/MM rows west of it: the CPHC/NHC area-of-
responsibility boundary at 140W is reproduced exactly in the data. Filtering
`subbasin == 'CP'` is therefore a sound Central Pacific filter, with the caveat that a
storm continuing west past the dateline stops being CP and becomes WP/None.

READ THIS BEFORE WRITING A HAWAII QUERY. `STORMS.subbasin` is the subbasin AT GENESIS,
because it is anchored to the same fix as `STORMS.basin` (see TRAP 3). Most storms that
threaten Hawaii do NOT form in the Central Pacific -- they form off Mexico and travel
west into it. Measured:

    storms whose GENESIS subbasin is CP            116
    storms with AT LEAST ONE CP track point        664
    -> CP-entering but not CP-forming              548

Hurricane INIKI (1992249N12229), the most destructive hurricane ever to strike Hawaii, is
in that 548: it formed at 134.0W, which is EP, and only became CP later. A query written
as `storms.subbasin == 'CP'` silently loses Iniki and 547 others -- an 83% undercount that
returns a clean-looking answer.

    The Central Pacific question is a TRACK question, not a storm-attribute question:
        SELECT DISTINCT storm_id FROM track_points WHERE subbasin = 'CP'

(0 storms have a CP genesis without also having a CP track point, so the track-level
filter is a strict superset -- it never loses a storm the storm-level filter would find.)

-----------------------------------------------------------------------------------
TRAP 5 -- HALF THE ROWS ARE INTERPOLATIONS, AND IFLAG[0] IS NOT HOW YOU TELL.
-----------------------------------------------------------------------------------
IBTrACS publishes 3-hourly rows, but the off-synoptic ones are interpolated by IBTrACS
between agency reports. Mixing them into an "observations" archive would double the
apparent sample size with numbers nobody measured, which is exactly the fabrication this
project forbids.

IFLAG is a 15-character string with ONE CHARACTER PER SOURCE DATASET, not a single flag:

    'O______________'  21,310      'P_________PP___'   6,751
    'P______________'  20,475      'O_________OO___'   3,754
    'OOOO___________'   3,579      '_OO____________'   2,184   (213 distinct strings)

Reading only IFLAG[0] therefore misclassifies every row whose first source is absent:
9,144 rows have IFLAG[0] == '_', and 4,468 of those carry a real report ('O' or 'V')
further along the string. The rule used here is "did ANY source PUBLISH a value at this
time" -- 'O' or 'V' anywhere in IFLAG (see IFLAG_REPORTED for why 'V' counts and 'I' does
not; it was checked against the raw HURDAT2 files, not assumed). Measured over all 99,951
rows of ibtracs.EP.csv:

                      synoptic hour   off-synoptic
    'O' or 'V' present   50,595            999      -> observed
    only P / I              148         48,202      -> interpolated
    no flag at all            6              1      -> see below

Note the 999 and the 148: the flag is NOT a restatement of the clock, so classifying by
hour instead of by IFLAG would silently mislabel 1,147 rows. `synoptic` is carried as its
own column precisely so the two facts stay separable. The 999 off-synoptic reports are
mostly the very rows a landfall table needs -- HURDAT2 publishes its landfall fix at the
real time (16:30, 09:30, 19:15), never rounded to a synoptic hour.

THE 7 UNFLAGGED ROWS. Seven rows carry '_______________' -- no source claims them as
either observed or interpolated, yet they have positions. Neither label is true. Since
`schema.quality` admits exactly three values and inventing a fourth is not available,
they are conservatively demoted to 'interpolated': under-claiming excludes them from a
`quality == 'observed'` query, which is the safe direction when provenance is absent.
The raw string survives in `iter_points()['iflag']` so the demotion is always reversible.
They are (SID, ISO_TIME): 1960164N29134 1960-06-11 15:00 (a spur-split track, so it is
dropped before it reaches the tables and only 6 of the 7 are ever emitted),
1968213N16218 1968-07-31 00:00, 1968214N22219 1968-08-01 00:00, 1969152N13268
1969-05-31 12:00, 1969222N19253 1969-08-09 12:00, 1969277N21253 1969-10-04 00:00,
1989287N11259 1989-10-14 06:00.

SYNOPTIC ALSO MEANS MINUTE ZERO. 37 rows carry non-zero minutes (12:30, 06:15, 18:45...).
A 12:30 fix is not a synoptic fix, so `synoptic` tests the minute as well as the hour.
Seconds are '00' on all 99,951 rows.

-----------------------------------------------------------------------------------
TRAP 6 -- TRACK_TYPE: SPURS ARE DUPLICATES, PROVISIONAL IS THIS SEASON.
-----------------------------------------------------------------------------------
Measured TRACK_TYPE, per storm (each storm has exactly one value; no storm mixes):

    main            1,695 storms / 98,595 rows
    PROVISIONAL         9 storms /    511 rows   -- all season 2026
    US-PROVISIONAL      8 storms /    641 rows   -- all season 2025
    spur-split          4 storms /    173 rows   -- seasons 1952, 1958, 1960, 1994
    spur-other          1 storm  /     31 rows   -- season 1960

Spurs are secondary tracks split off a main track: counting them is double-counting, so
`include_spurs=False` is the default. PROVISIONAL means the season has not been
post-analysed and the numbers will change; those points get quality='provisional' and
their storms get provisional=True.

TRACK_TYPE IS PASSED THROUGH RAW, not collapsed to main/spur/provisional. The schema
comment suggests the shorter vocabulary, but 'spur-split' and 'spur-other' are different
claims about how a track was derived and collapsing them destroys that distinction with
no way to recover it. Use `is_spur()` / `is_provisional()` to test, not string equality.

QUALITY PRECEDENCE, when a point is both provisional and interpolated:
    interpolated > provisional > observed.
Interpolation wins because it has nowhere else to live in TRACK_POINTS, whereas the
provisional fact is recoverable losslessly by joining STORMS.provisional /
STORMS.track_type on storm_id. A provisional point is never labelled 'observed'.

-----------------------------------------------------------------------------------
WIND SOURCE RULE -- AND THE 10-MINUTE WIND IT SMUGGLES IN.
-----------------------------------------------------------------------------------
`vmax_kt` prefers WMO_WIND and falls back to USA_WIND. The two are NEVER averaged: they
are different agencies' analyses of the same storm, and a mean of two best-tracks is a
number no forecaster ever published. Measured coverage:

    WMO_WIND only        89 rows        USA_WIND only    52,218 rows
    both present     38,527 rows        neither           9,117 rows
    -> vmax from WMO 38,616 / from USA 52,218 / null 9,117

WHY THIS RULE IS NOT FREE. Where both exist they agree exactly for the US agencies --
hurdat_epa 31,257 rows with ZERO disagreements, hurdat_atl 756 with zero, atcf 34 with
zero -- so for the East Pacific proper the preference changes nothing. It changes a lot
for JMA:

    WMO_AGENCY   rows both   disagreeing   mean(WMO-USA)   min      max
    hurdat_epa     31,257          0           0.00 kt     0.0      0.0
    tokyo           6,212      5,215          -9.93 kt   -65.0    +40.0
    cphc              268         38          -0.42 kt   -20.0    +25.0

JMA (tokyo) publishes 10-MINUTE sustained wind; NHC/CPHC/JTWC publish 1-MINUTE sustained.
They are not the same quantity, and the measured -9.93 kt mean offset is that difference,
not noise. Preferring WMO_WIND therefore puts a 10-minute wind into `vmax_kt` for the
6,212 tokyo rows where both exist, and for tokyo rows where only WMO_WIND exists there is
nothing to compare against at all. THIS MODULE DOES NOT CONVERT BETWEEN AVERAGING PERIODS.
The usual 0.88 factor is a WMO-recommended rule of thumb, not a published per-fix value,
and applying it would manufacture numbers -- exactly what this archive forbids. The
mismatch is reported, not repaired.

Reach into the Central Pacific: all 78 tokyo-agency rows in the EP basin are subbasin CP
(75 SIDs, seasons 1951-2021), but only 1 of them has a WMO_WIND at all. So the Hawaii
path takes a JMA 10-minute wind for exactly ONE fix in this file. Small, but stated.

Both raw columns survive as `wmo_wind` / `usa_wind` in `iter_points()`, so the choice is
re-derivable per point. TRACK_POINTS has no column for the wind's provenance and this
module does not add one, because an emitted key that is not in the schema would fail the
pyarrow cast -- see `vmax_for()` if you need the source name programmatically.

MSLP follows the same preference (WMO_PRES 35,087 rows, USA_PRES 45,262, both 22,846 of
which 3,317 disagree). No pressure sentinel exists: the ranges are 870-1022 mb (WMO) and
872-1021 mb (USA), with no zeros and no -999.

-----------------------------------------------------------------------------------
GENESIS -- FIRST TROPICAL POINT, OR NOTHING.
-----------------------------------------------------------------------------------
Genesis is the first fix at which the system was TROPICAL. Two columns can say so and
they disagree, so the order of resolution is fixed and documented:

  1. USA_STATUS if it is in schema.TROPICAL_STATUS or schema.NONTROPICAL_STATUS. It is
     the operational agency classification and it is the more specific claim.
  2. otherwise NATURE, where IBTrACS 'TS' means "tropical nature" (NOT "tropical storm
     strength") and DS/ET/SS/NR mean disturbance/extratropical/subtropical/not-reported.
  3. otherwise not tropical -- do not guess.

Step 2 is load-bearing: 17,082 rows have NATURE 'TS' with USA_STATUS blank, and dropping
them would delete genesis for most pre-satellite storms. Two codes are in neither
schema set: NATURE 'MX' (4,066 rows -- "mixture", i.e. the agencies disagreed about the
nature) resolves to not-tropical, because NATURE is the last word in the chain. USA_STATUS
'XX' (189 rows, unknown) is NOT a verdict either way, so it falls through to step 2 like
any other unrecognised status; 170 of those 189 rows have NATURE 'TS' and are therefore
tropical. Measured: treating 'XX' as not-tropical instead moves the genesis fix of ZERO
storms, so the two readings are indistinguishable in this file.

13 of 1,717 storms have no tropical point under this rule -- seven of them in 1982 (NATURE
'NR' throughout), the other six one apiece in 1960 (MAMIE, a spur, ET throughout), 1993,
1994, 1996, 1997 and 2019. Two of the 13 are spurs, so 11 reach the tables. They
KEEP their storm row with genesis_utc/lat/lon NULL. Dropping them would understate the
1982 season; inventing a genesis for them would be worse than dropping them.

STORMS.basin is NOT NULL in the schema, so those 13 still need a basin. It falls back to
the FIRST FIX's basin -- a value read from the file, not derived -- while the genesis
columns stay NULL so the difference between "formed here" and "first seen here" stays
visible in the data rather than living only in this comment.

INTENSITY AGGREGATES ARE LIFETIME EXTREMES OVER EVERY FIX, tropical or not, including
extratropical and subtropical phases. One rule, no exceptions, so max_category is always
exactly category_for(max_vmax_kt) and reached_cat1 is always max_vmax_kt >= 64. A
consumer wanting tropical-only extremes can compute them from track_points, which carries
`stage` and `nature` per fix; the reverse would not be recoverable.

The cost of that choice was measured rather than assumed. Recomputing every aggregate
over tropical fixes only changes max_vmax_kt for 19 of 1,712 storms, flips reached_cat1
for 2 and reached_ts for 2 -- storms that reached the threshold only while extratropical.
Small, but it is a real 2-storm difference in any "how many became hurricanes" count, so
it is stated here rather than left for someone to rediscover.

WHERE NO WIND WAS EVER PUBLISHED (14 storms), max_vmax_kt, max_category and all three
reached_* flags are NULL, not False. "Never reached hurricane strength" and "nobody
recorded how strong it was" are different answers and the archive must not conflate them.

-----------------------------------------------------------------------------------
OTHER MEASURED FACTS RELIED ON HERE
-----------------------------------------------------------------------------------
  * Missing values are BLANK or a single space -- never -999, never 'NA'. All 11 numeric
    columns this module reads parse cleanly with zero non-numeric tokens.
  * Rows are contiguous by SID and time-sorted within SID. `_grouped_by_storm()` exploits
    this to stream one storm at a time instead of holding 100k dicts, and RAISES if a SID
    ever reappears after its group closed rather than silently emitting a half storm.
  * (SID, ISO_TIME) is unique: 0 duplicates in 99,951 rows.
  * SEASON and NUMBER are constant within a SID, and SEASON always equals SID[:4].
  * NAME is constant within a SID (1,717/1,717). 297 storms are 'UNNAMED'. Cross-basin
    renames appear colon-joined ('IRENE:OLIVIA', 'FIFI:ORLENE') and are left verbatim.
  * LANDFALL is blank on exactly 1,717 rows -- each storm's LAST fix, and nowhere else.
    It is the distance to land BETWEEN this fix and the next, so it is undefined at the
    end of a track. It is not a missing measurement.
  * USA_ATCF_ID is blank on some fixes of 383 storms and absent entirely from 37. 17
    storms carry two genuinely different ATCF ids because they crossed a basin
    (1957 DELLA is CP011957 and WP101957). `atcf_id` takes the FIRST non-blank in time
    order, matching the genesis-basin convention.
  * LAT/LON are the IBTrACS reconciled position and differ from USA_LAT/USA_LON by more
    than 0.05 deg on 17,036 rows. This module uses LAT/LON.
  * USA_SSHS is a coded scale, verified against USA_WIND: -5 no wind at all, -4 EX,
    -3 LO/DB/MD/WV, -2 SS/SD, -1 TD (10-33 kt), 0 TS (34-63), 1 (64-82), 2 (83-95),
    3 (97-110), 4 (113-135), 5 (138-185) -- consistent with schema.THRESHOLDS_KT.

DOWNSTREAM NOTE ON TIMESTAMPS. The declared schemas use timestamp('s'). Parquet has no
second-resolution logical timestamp, so a table written to Parquet and read back returns
timestamp('ms') and will NOT compare equal to schema.STORMS / schema.TRACK_POINTS. The
rows this module emits DO cast exactly into the declared schemas
(pa.Table.from_pylist(rows, schema=...) round-trips schema-equal); the widening happens in
the Parquet writer, not here. Whoever writes the archive files needs to decide whether to
cast on read or to change the declared unit.

PURE PARSER -- no network, no clock at import time.
"""

from __future__ import annotations

import csv
from datetime import datetime, timezone
from typing import Iterable, Iterator

# `_now` is private in provenance.py, but it is the ONLY producer of the exact
# "%Y-%m-%dT%H:%M:%SZ" stamp that SourceRecord.downloaded_utc uses. Re-implementing the
# format here would let the manifest and the table rows drift apart on a format change.
from genesis.provenance import PROCESSING_VERSION, _now
from genesis.schema import (
    NONTROPICAL_STATUS,
    THRESHOLDS_KT,
    TROPICAL_STATUS,
    category_for,
)

# The units row: line 2 of every IBTrACS CSV. Not data. See TRAP 1.
UNITS_ROW_INDEX = 1

# IBTrACS's own "missing" code for SUBBASIN. Not a region. See TRAP 4.
SUBBASIN_MISSING = "MM"

# NAME sentinels. Only 'UNNAMED' occurs in the EP file (verified: every other NAME is
# alphabetic), but IBTrACS has used the others in older releases and a storm wrongly
# marked `named=True` would corrupt any named-storm count.
UNNAMED_TOKENS = frozenset({"UNNAMED", "NOT_NAMED", "NOT NAMED", "NONAME", "NO-NAME", ""})

# IFLAG characters that assert a REAL PUBLISHED value from some source at this time.
#
# 'O' is the obvious one. 'V' is not, and getting it wrong is expensive: 'V' marks a value
# the agency published at a NON-SYNOPTIC time -- in practice HURDAT2's special records,
# which carry a record identifier in USA_RECORD ('L' landfall, 'I' peak intensity,
# 'S' status change, 'T' track). Verified against the raw agency files, not assumed:
# all 64 V-only rows of ibtracs.EP.csv whose USA_AGENCY is hurdat_epa/hurdat_atl match a
# record in .genesis-cache/hurdat2.{nepac,atl}.txt EXACTLY on position, wind AND pressure.
# e.g. IBTrACS 2002295N11261 2002-10-25 16:30 21.7N 105.4W 120 kt 950 mb  ==
#      HURDAT2  20021025, 1630, L, HU, 21.7N, 105.4W, 120, 950   (Kenna's Mexican landfall)
# Their USA_RECORD distribution is L 51 / I 6 / S 3 / T 3 / blank 7, whereas all 48,357
# rows flagged only 'P' have USA_RECORD blank -- interpolations never carry one.
#
# Treating 'V' as interpolated therefore threw away PUBLISHED LANDFALL FIXES: 51 of the
# 161 'L' records in ibtracs.EP.csv and 277 of the 1,177 in ibtracs.NA.csv (23.5%). A
# landfall table built off `quality == 'observed'` would have silently dropped a quarter
# of the real landfall fixes and interpolated replacements for them.
#
# 'I' is deliberately NOT in this set. Its 6 rows in the EP file match HURDAT2 exactly on
# position and wind but NOT on pressure (HURDAT2 publishes -999 where IBTrACS carries a
# value), i.e. the intensity really was filled in. 'interpolated' under-claims those rows,
# which is the safe direction.
IFLAG_REPORTED = frozenset({"O", "V"})

QUALITY_OBSERVED = "observed"
QUALITY_INTERPOLATED = "interpolated"
QUALITY_PROVISIONAL = "provisional"

SYNOPTIC_HOURS = frozenset({0, 6, 12, 18})


# ---------------------------------------------------------------------------
# scalar normalisers
# ---------------------------------------------------------------------------

def _text(value: str | None) -> str | None:
    """Blank-or-whitespace -> None. IBTrACS writes a single space, not an empty cell."""
    if value is None:
        return None
    v = value.strip()
    return v or None


def _num(value: str | None) -> float | None:
    """Numeric cell -> float, or None when blank. Never returns a substitute."""
    v = _text(value)
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        # Zero of these occur in the EP file across all 11 numeric columns read here.
        # If a future release introduces one, it becomes a None (an honest gap) rather
        # than a crash or, far worse, a silently coerced zero.
        return None


def _int(value: str | None) -> int | None:
    n = _num(value)
    return None if n is None else int(n)


def signed_lon(lon: float | None) -> float | None:
    """IBTrACS continuous east-longitude -> signed -180..180. See TRAP 2.

    Values already inside the range are returned UNCHANGED, bit for bit. Only the 3,786
    rows (of 99,951) that IBTrACS carried past 180 to keep a dateline-crossing track
    continuous are rewritten. 266.9 -> -93.1; 181.1 -> -178.9.

    This is lossless for POSITION and lossy for CONTINUITY: after the wrap, consecutive
    fixes either side of the dateline are 360 degrees apart. Do not difference these.
    """
    if lon is None:
        return None
    if -180.0 <= lon <= 180.0:
        return lon
    return ((lon + 180.0) % 360.0) - 180.0


def parse_iso_time(value: str | None) -> datetime | None:
    """'1994-08-10 06:00:00' -> tz-aware UTC datetime.

    IBTrACS times are UTC but the column carries no offset, so it is attached here. A
    naive datetime would compare and subtract wrongly against every other table in the
    archive, all of which are timestamp(tz='UTC').
    """
    v = _text(value)
    if v is None:
        return None
    try:
        return datetime.strptime(v, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def is_spur(track_type: str | None) -> bool:
    """spur-split / spur-other and any future spur-* variant. See TRAP 6."""
    return bool(track_type) and track_type.strip().lower().startswith("spur")


def is_provisional(track_type: str | None) -> bool:
    """PROVISIONAL (2026) and US-PROVISIONAL (2025). See TRAP 6."""
    return bool(track_type) and "PROVISIONAL" in track_type.strip().upper()


def quality_for(iflag: str | None, track_type: str | None) -> str:
    """Classify one fix as observed / interpolated / provisional. See TRAP 5 and 6.

    'O' or 'V' ANYWHERE in the 15-character IFLAG means some source PUBLISHED this time
    for real ('V' = published at a non-synoptic time; see IFLAG_REPORTED for the proof
    against hurdat2.*.txt). Testing only IFLAG[0] would misread the 4,468 rows whose first
    source is absent while a later source reports.
    """
    flag = iflag or ""
    if any(ch in IFLAG_REPORTED for ch in flag):
        # An observation on a not-yet-post-analysed track is still going to be revised.
        return QUALITY_PROVISIONAL if is_provisional(track_type) else QUALITY_OBSERVED
    # No source claims an original value here. That covers flagged interpolation (P/I/V)
    # and the 7 rows with no flag at all, which are demoted rather than promoted.
    return QUALITY_INTERPOLATED


def is_tropical(usa_status: str | None, nature: str | None) -> bool:
    """Was this fix a TROPICAL cyclone? USA_STATUS first, NATURE as fallback.

    See the GENESIS section of the module docstring for why the order is this way and why
    NATURE 'MX' and USA_STATUS 'XX' resolve to False instead of being guessed.
    """
    status = (usa_status or "").strip().upper()
    if status in TROPICAL_STATUS:
        return True
    if status in NONTROPICAL_STATUS:
        return False
    nat = (nature or "").strip().upper()
    return nat in TROPICAL_STATUS


# Agencies whose "sustained wind" is a 10-MINUTE mean, not the 1-minute mean the
# Saffir-Simpson scale is defined on. IBTrACS reports each agency's own published value; it
# does not harmonise the averaging period, and there is no published per-fix conversion.
TEN_MINUTE_AGENCIES = frozenset({
    "tokyo", "newdelhi", "reunion", "bom", "nadi", "wellington",
})


def vmax_for(point: dict) -> tuple[float | None, str | None]:
    """(knots, 'wmo'|'usa'|None) for one normalised point. Never averaged, never converted.

    WMO IS PREFERRED, EXCEPT WHERE ITS AVERAGING PERIOD IS WRONG FOR THE SCALE.
    schema.category_for implements Saffir-Simpson, which is DEFINED on a 1-minute sustained
    wind. Several WMO agencies publish a 10-minute mean instead, which is systematically lower
    -- measured on this archive, mean(WMO - USA) = -9.9 kt over the 6,212 East Pacific rows
    where a JMA WMO wind and a US wind both exist. Bucketing that into Saffir-Simpson is an
    averaging-period error even though no value was invented: 79 storms get a different
    lifetime peak, 16 a different max_category, and 8 flip reached_cat3 (BART 1999 reads cat2
    at 90 kt on the JMA wind and cat5 at 140 kt on the US one).

    The remedy is SOURCE SELECTION, not conversion. The 0.88 factor often quoted is a WMO rule
    of thumb, not a published per-fix value, and applying it would fabricate numbers. So where
    the WMO agency reports a 10-minute mean and a US 1-minute value exists, the US value is
    used and the choice is reported as 'usa'. Where no US value exists the WMO value is still
    published -- with 'wmo_10min' as its source, so the caller can see what it is holding
    rather than silently receiving a different quantity.

    Returned as a pair because TRACK_POINTS has no column for the wind's provenance and
    emitting one would break the pyarrow cast.
    """
    wmo = point.get("wmo_wind")
    usa = point.get("usa_wind")
    ten_min = str(point.get("wmo_agency") or "").strip().lower() in TEN_MINUTE_AGENCIES
    if wmo is not None and not ten_min:
        return wmo, "wmo"
    if usa is not None:
        return usa, "usa"
    if wmo is not None:
        return wmo, "wmo_10min"
    return None, None


def mslp_for(point: dict) -> tuple[float | None, str | None]:
    """(millibars, 'wmo'|'usa'|None). Same preference and same no-averaging rule."""
    if point.get("wmo_pres") is not None:
        return point["wmo_pres"], "wmo"
    if point.get("usa_pres") is not None:
        return point["usa_pres"], "usa"
    return None, None


def _basin_set(basins: Iterable[str] | str | None) -> frozenset[str] | None:
    if basins is None:
        return None
    if isinstance(basins, str):
        basins = [basins]
    return frozenset(b.strip().upper() for b in basins if b and b.strip())


# ---------------------------------------------------------------------------
# the point stream
# ---------------------------------------------------------------------------

def iter_points(path, *, basins=None, include_spurs=False) -> Iterator[dict]:
    """Stream normalised per-point dicts out of an IBTrACS v4 CSV.

    `basins` filters on THE POINT'S basin, which is what BASIN means in this file (see
    TRAP 3). That makes this the wrong entry point for building storm-level tables: a
    point filter truncates dateline-crossing tracks and would move their genesis. Use
    `build_tables()` for that; it filters storms, not fixes.

    `include_spurs=False` (default) drops the 5 spur storms / 204 rows, which are
    secondary tracks split off a main track and would double-count.

    Emits None for every absent value. Nothing is interpolated, estimated or defaulted.
    """
    wanted = _basin_set(basins)
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        header = next(reader)
        next(reader)  # TRAP 1: the units row. Discarded, never parsed as a storm.
        col = {name: i for i, name in enumerate(header)}

        def get(row, name):
            i = col.get(name)
            return row[i] if i is not None and i < len(row) else None

        for row in reader:
            track_type = _text(get(row, "TRACK_TYPE"))
            if not include_spurs and is_spur(track_type):
                continue

            basin = _text(get(row, "BASIN"))
            if wanted is not None and (basin or "").upper() not in wanted:
                continue

            iso_time = parse_iso_time(get(row, "ISO_TIME"))
            subbasin = _text(get(row, "SUBBASIN"))
            if subbasin == SUBBASIN_MISSING:
                subbasin = None  # TRAP 4: 'MM' is "missing", not a place.

            iflag = _text(get(row, "IFLAG"))
            # Synoptic requires minute 0 as well as hour: 37 rows sit at :15/:30/:45 and
            # a 12:30 fix is not a synoptic fix.
            synoptic = bool(
                iso_time is not None
                and iso_time.hour in SYNOPTIC_HOURS
                and iso_time.minute == 0
                and iso_time.second == 0
            )

            yield {
                "sid": _text(get(row, "SID")),
                "season": _int(get(row, "SEASON")),
                "number": _int(get(row, "NUMBER")),
                "basin": basin,
                "subbasin": subbasin,
                "name": _text(get(row, "NAME")),
                "iso_time": iso_time,
                "nature": _text(get(row, "NATURE")),
                "lat": _num(get(row, "LAT")),
                "lon": signed_lon(_num(get(row, "LON"))),
                "wmo_wind": _num(get(row, "WMO_WIND")),
                "wmo_pres": _num(get(row, "WMO_PRES")),
                # Needed to know the WMO wind's AVERAGING PERIOD -- see vmax_for. Without it
                # a 10-minute JMA wind and a 1-minute US wind are indistinguishable downstream.
                "wmo_agency": _text(get(row, "WMO_AGENCY")),
                "usa_wind": _num(get(row, "USA_WIND")),
                "usa_pres": _num(get(row, "USA_PRES")),
                "usa_status": _text(get(row, "USA_STATUS")),
                "usa_sshs": _int(get(row, "USA_SSHS")),
                "usa_atcf_id": _text(get(row, "USA_ATCF_ID")),
                "track_type": track_type,
                "iflag": iflag,
                "dist2land_km": _num(get(row, "DIST2LAND")),
                # Blank on each storm's last fix by definition, not by omission.
                "landfall_km": _num(get(row, "LANDFALL")),
                "storm_speed_kt": _num(get(row, "STORM_SPEED")),
                "storm_dir_deg": _num(get(row, "STORM_DIR")),
                "synoptic": synoptic,
                "quality": quality_for(iflag, track_type),
            }


def _grouped_by_storm(points: Iterator[dict]) -> Iterator[tuple[str, list[dict]]]:
    """Group a point stream into per-storm lists without buffering the whole file.

    The file IS contiguous by SID (verified over all 1,717 storms), so one storm at a
    time is enough. But correctness must not depend on an unverified promise from a
    future release, so a SID that reappears after its group closed RAISES. Silently
    emitting two half-storms would corrupt genesis, track_points and every aggregate,
    and would look exactly like real data.
    """
    seen: set[str] = set()
    current: str | None = None
    batch: list[dict] = []
    for p in points:
        sid = p["sid"]
        if sid != current:
            if current is not None:
                yield current, batch
            if sid in seen:
                raise ValueError(
                    "IBTrACS rows are not contiguous by SID: %r reappears after its "
                    "group closed. Sort the file by (SID, ISO_TIME) before parsing." % sid
                )
            seen.add(sid)
            current, batch = sid, []
        batch.append(p)
    if current is not None:
        yield current, batch


# ---------------------------------------------------------------------------
# the tables
# ---------------------------------------------------------------------------

def build_tables(path, *, source_key, basins=None) -> tuple[list[dict], list[dict]]:
    """Build (storm_rows, track_point_rows) matching schema.STORMS / schema.TRACK_POINTS.

    `basins` HERE MEANS SOMETHING DIFFERENT FROM `iter_points`, deliberately. It selects
    STORMS BY GENESIS BASIN and then emits each selected storm's COMPLETE track. Applying
    a per-point basin filter first would hand this function a truncated track whose first
    tropical fix is not the storm's genesis -- it would publish a genesis that never
    happened, for every dateline-crossing storm. That is a fabricated value, so the
    function does not offer it. Storms with no tropical point are selected on their first
    fix's basin, the same value their `basin` column reports.

    Spur tracks are always excluded here (they are duplicate tracks, and counting them
    would inflate every storm-level statistic). Read them with
    `iter_points(include_spurs=True)` if you need to inspect them.

    Every row carries source_key / processing_version / ingested_utc. `ingested_utc` is
    stamped once per call so an entire build shares one timestamp.
    """
    wanted = _basin_set(basins)
    ingested = _now()

    storm_rows: list[dict] = []
    point_rows: list[dict] = []

    for sid, pts in _grouped_by_storm(iter_points(path, include_spurs=False)):
        # Sort defensively; a None time sorts last rather than raising on comparison.
        pts.sort(key=lambda p: (p["iso_time"] is None,
                                p["iso_time"] or datetime.max.replace(tzinfo=timezone.utc)))

        genesis = next((p for p in pts if is_tropical(p["usa_status"], p["nature"])), None)
        first = pts[0]
        last = pts[-1]

        # Genesis basin, or -- only when the storm never became tropical -- the basin of
        # the first published fix. STORMS.basin is NOT NULL, and neither value is invented.
        anchor = genesis if genesis is not None else first
        basin = anchor["basin"]
        if wanted is not None and (basin or "").upper() not in wanted:
            continue

        genesis_time = genesis["iso_time"] if genesis is not None else None

        winds = [vmax_for(p)[0] for p in pts]
        winds = [w for w in winds if w is not None]
        presses = [mslp_for(p)[0] for p in pts]
        presses = [m for m in presses if m is not None]
        max_vmax = max(winds) if winds else None
        min_mslp = min(presses) if presses else None

        atcf_id = next((p["usa_atcf_id"] for p in pts if p["usa_atcf_id"]), None)
        name = first["name"]
        track_type = first["track_type"]

        for p in pts:
            vmax, _src = vmax_for(p)
            mslp, _psrc = mslp_for(p)
            # Negative before genesis, which is correct and useful: it is how long the
            # disturbance was tracked before it became a tropical cyclone.
            hours = None
            if genesis_time is not None and p["iso_time"] is not None:
                hours = (p["iso_time"] - genesis_time).total_seconds() / 3600.0
            point_rows.append({
                "storm_id": sid,
                "iso_time": p["iso_time"],
                "lat": p["lat"],
                "lon": p["lon"],
                "vmax_kt": vmax,
                "mslp_mb": mslp,
                "stage": p["usa_status"],
                "nature": p["nature"],
                "basin": p["basin"],
                "subbasin": p["subbasin"],
                "dist2land_km": p["dist2land_km"],
                "storm_speed_kt": p["storm_speed_kt"],
                "storm_dir_deg": p["storm_dir_deg"],
                "synoptic": p["synoptic"],
                "quality": p["quality"],
                "hours_since_genesis": hours,
                "source_key": source_key,
                "processing_version": PROCESSING_VERSION,
                "ingested_utc": ingested,
            })

        storm_rows.append({
            "storm_id": sid,
            "atcf_id": atcf_id,
            "basin": basin,
            "subbasin": anchor["subbasin"],
            "name": name,
            "season": first["season"],
            "genesis_utc": genesis_time,
            "genesis_lat": genesis["lat"] if genesis is not None else None,
            "genesis_lon": genesis["lon"] if genesis is not None else None,
            "end_utc": last["iso_time"],
            "max_vmax_kt": max_vmax,
            "min_mslp_mb": min_mslp,
            "max_category": category_for(max_vmax),
            # None, not False, when no wind was ever published: "never reached cat 1" and
            # "nobody recorded how strong it was" are different answers.
            # Thresholds come from schema.THRESHOLDS_KT, never from a literal here: a
            # second copy of 64 is a second thing to forget to change.
            "reached_ts": None if max_vmax is None else max_vmax >= THRESHOLDS_KT["ts"],
            "reached_cat1": None if max_vmax is None else max_vmax >= THRESHOLDS_KT["cat1"],
            "reached_cat3": None if max_vmax is None else max_vmax >= THRESHOLDS_KT["cat3"],
            "named": (name or "").strip().upper() not in UNNAMED_TOKENS,
            "track_points": len(pts),
            "track_type": track_type,
            "provisional": is_provisional(track_type),
            "source_key": source_key,
            "processing_version": PROCESSING_VERSION,
            "ingested_utc": ingested,
        })

    return storm_rows, point_rows
