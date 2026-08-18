"""NHC Tropical Weather Outlook (TWO) -- the archive's only PRE-genesis source.

WHY THIS FILE EXISTS. Every other source in this archive starts at genesis: IBTrACS and
HURDAT2 begin when a depression exists, SHIPS begins when there is an ATCF id to key on.
None of them can answer the question the terminal is actually asked -- "NHC is watching a
blob south of Hawaii today; what happened to past blobs like it?" -- because none of them
record the blob. The Tropical Weather Outlook does. It is the only published product in
which a disturbance that never developed leaves a trace at all, and that trace is what
turns the archive from a catalogue of storms into a base rate for disturbances.

Both callers use this module: the live daily pipeline (fetch today's issuance, append rows)
and the historical back-fill (walk /archive/text/TWOxx/YYYY/, append the same rows). They
must produce identical rows for the same issuance, so nothing here reads a clock except to
stamp `ingested_utc`, and nothing here consults anything outside the text it was handed.

-----------------------------------------------------------------------------------------
THE FORMAT IS NOT ONE FORMAT. FIVE ERAS, ALL MEASURED AGAINST THE REAL BYTES.
-----------------------------------------------------------------------------------------
Every date below was established by fetching the files and reading them, not from memory.
The scan that produced them walked https://www.nhc.noaa.gov/archive/text/{TWOAT,TWOEP,TWOCP}/.

  ERA 0  archive start .. 2009-05  PROSE ONLY, no probability of any kind.
         "AN AREA OF SHOWERS AND THUNDERSTORMS CENTERED ABOUT 200 MILES WEST-SOUTHWEST OF
          ACAPULCO MEXICO HAS BECOME BETTER ORGANIZED THIS MORNING."
         There is no number and no category. THIS PARSER EMITS NO AREAS HERE -- see
         PRE-PROBABILITY ERA below. Earliest issuance in the archive: TWOAT/TWOEP 2003-06-16.

  ERA 1  2009 season               CATEGORICAL ONLY. The 2009 season-opening outlook
         (TWOEP.200905151140, verbatim) announces it:
            "BEGINNING THIS YEAR...THE OUTLOOK WILL ALSO CONTAIN CATEGORICAL PROBABILITIES
             OF FORMATION...I.E. LOW...LESS THAN 30 PERCENT...MEDIUM...30 TO 50 PERCENT...
             OR HIGH...GREATER THAN 50 PERCENT FOR EACH DISTURBANCE DESCRIBED."
         So a 2009 area reads "THERE IS A LOW CHANCE...LESS THAN 30 PERCENT..." and the
         number is the CATEGORY BOUNDARY, not a forecast. `prob_48h_pct` is None for the
         whole of 2009 and `prob_48h_label` carries low/medium/high. Writing 30 into the
         probability column because the text contains "30" would be inventing a forecast
         NHC did not make -- the single most likely way to poison this table.

  ERA 2  2010-05-24 .. 2013        POINT PROBABILITIES, 48 h only, in prose.
         First observed: TWOAT.201005240024 (2010-05-24 00:24Z) and TWOEP.201005242339
         (2010-05-24 23:39Z), both "THERE IS A ... CHANCE...NN PERCENT...OF THIS SYSTEM
         BECOMING A TROPICAL CYCLONE DURING THE NEXT 48 HOURS."  Values are 10-percent
         increments plus the special phrase "NEAR 0 PERCENT".

  ERA 3  2013-08-01 .. 2023-05     FIVE-DAY probability added beside the 48-hour one, in
         BOTH basins on the same day (TWOEP.201308011131, TWOAT.201308011749). The product
         announced it in advance and called it experimental in its own words: "FIVE-DAY
         FORMATION PROBABILITIES ARE EXPERIMENTAL IN 2013". The layout moves from prose to
         bullets during 2014:
            "* Formation chance through 48 hours...low...20 percent"
            "* Formation chance through 5 days...medium...40 percent"
         Mixed case replaces ALL CAPS during 2015. A trailing period on the bullet appears
         and disappears; both are handled.

  ERA 3b 2022-05-22 ..             AREAS ACQUIRE TITLES: "North Central Gulf of Mexico:",
         "East-Central Pacific well offshore of Southwestern Mexico:", and an "Active
         Systems:" block that is NOT an area. This is a SEPARATE boundary from the seven-day
         one and it is the boundary that matters for `disturbance_key`: measured across 553
         sampled 2021 issuances, not one carried a titled area; the first is
         TWOAT.202205222311 (2022-05-22 23:11Z), TWOEP.202205231133 the next morning.

  ERA 4  2023-05-15 ..             SEVEN-DAY replaces five-day: "through 7 days", first in
         the season-opening quiet sentence (TWOAT.202305151124). Invest designators start
         appearing inside the titles -- "Central Tropical Atlantic (AL92)" -- first observed
         TWOEP.202307091138 (EP93); zero in 547 sampled 2022 issuances.

THE TRAP THAT FOLLOWS FROM THIS: `prob_7d_pct` is a column whose HORIZON CHANGED. A 40% in
2015 is a five-day forecast; a 40% in 2024 is a seven-day forecast. `horizon_days` on every
area (and, in the row, recoverable from `issuance_utc`) says which. Any query that ranks
disturbances by `prob_7d_pct` across the 2023 boundary without conditioning on the horizon
is comparing two different forecasts, and it will look like it worked.

-----------------------------------------------------------------------------------------
THE PRE-PROBABILITY ERA IS A GAP, NOT A ZERO.
-----------------------------------------------------------------------------------------
Before 2009 the product names disturbances in prose with no probability. It is tempting to
emit those blocks with NULL probabilities, and it is wrong: in that era the same
blank-line-delimited block structure also holds the season's name list, the "THIS PRODUCT
...IS ISSUED FOUR TIMES A DAY" boilerplate, and the sentence saying NHC is issuing
advisories on an existing storm. Nothing in the text distinguishes a disturbance paragraph
from those except meaning, so a block-shaped heuristic would file the 2007 pronunciation
guide as a tropical disturbance. This parser therefore recognises exactly one thing as an
area -- a block that carries a formation-probability statement -- and reports every other
block back to the caller in `unparsed_blocks` with `parse_status='pre_probability_era'`.
`coverage_gap()` turns that into a provenance.Gap with the boundary date on it.

-----------------------------------------------------------------------------------------
THE CENTRAL PACIFIC IS THE BIGGEST GAP IN THIS SOURCE, AND HAWAII IS THE USE CASE.
-----------------------------------------------------------------------------------------
Measured, not assumed: https://www.nhc.noaa.gov/archive/text/TWOCP/ lists exactly ONE year,
2013, with 518 issuances (2013-07-29 .. 2013-12-01). CPHC's outlook is not in this archive
for any other season. What partially covers it instead:
  - From 2025-06-01 11:00Z the NHC eastern Pacific outlook widened its own domain. Measured
    by binary search on the coverage line: TWOEP.202506010501 still says "For the eastern
    North Pacific...east of 140 degrees west longitude:" and TWOEP.202506011100 says "For
    the eastern and central North Pacific east of 180 longitude:". From that issuance
    forward, central Pacific disturbances appear in TWOEP.
  - 1993-2024 central Pacific disturbances have NO outlook coverage in this archive.
`basin` on a row is the ISSUING PRODUCT's basin and nothing else. A TWOEP row after
2025-06-01 may describe a disturbance near Hawaii; this module does not reclassify it,
because doing so would need a position and there is none (below).

-----------------------------------------------------------------------------------------
THERE ARE NO COORDINATES IN THIS PRODUCT. NOT ONE.
-----------------------------------------------------------------------------------------
Verified by regex over every cached issuance in the sample corpus: zero matches for a
lat/lon pair. The product locates disturbances only as prose -- "several hundred miles
south of the southern tip of the Baja California peninsula". Turning that into numbers is
the exact thing the archive forbids, so `lat`/`lon` are None here, always, unless a future
issuance states an explicit position (the regex is kept and will fire if one ever does).
Positions for LIVE disturbances come from the graphical outlook shapefile -- see
sources/gtwo.py, which reads the polygons NHC actually publishes -- and are joined on
(basin, area number) by the caller. That product has no historical archive, so back-filled
rows keep lat/lon NULL and the gap is recorded rather than filled.

-----------------------------------------------------------------------------------------
disturbance_key: HOW IT IS STABLE, AND EXACTLY WHAT BREAKS IT.
-----------------------------------------------------------------------------------------
The log is append-only: one row per (issuance, area). To follow a disturbance from first
mention to resolution you need a key that is the SAME string on Monday's 5 AM outlook and
Monday's 11 AM outlook when it is the same blob. The obvious candidate -- the area's
position in the product -- is the trap. NHC orders and renumbers areas freely between
issuances, and it changes their titles as they move. Position is not identity, and here is
the proof from two consecutive real issuances six hours apart:

    TWOAT.202608100517  1 Central Tropical Atlantic   2 Eastern and Central   3 Western Sub
    TWOAT.202608101147  1 Eastern and Central         2 Central Tropical      3 Western Sub

Areas 1 and 2 swapped with no other change. A key built on the ordinal would have credited
each disturbance with the other's forecast history at that issuance, and nothing in the
product would have said so.

`disturbance_key()` is a PURE function of one issuance, because `disturbance_rows` is
handed one outlook and must not invent linkage it cannot see. It anchors on the strongest
identifier the text actually carries, and it SAYS WHICH ONE IT USED in the key's prefix, so
a query can never silently mix a stable key with an unstable one:

  inv:epac:2024:ep92            NHC's own invest designator, lifted from the title
                                "Central Portion of the East Pacific (EP92):". Stable across
                                issuances and across renumbering. BREAKS when the invest
                                number is recycled -- 90-99 cycle within a season -- so a
                                follow-up pass must split a key's rows on a time gap (a real
                                disturbance is mentioned every 6 h; a gap of days means the
                                number was reused). Only present once NHC opens an invest,
                                which is typically days AFTER first mention.

  ttl:atlantic:2026:central-tropical-atlantic
                                The published area title (2022 onward). Stable while NHC
                                keeps the name. BREAKS when the forecaster renames the area
                                as it moves ("South of Mexico" -> "Central East Pacific"),
                                and when a parenthetical changes ("Central Subtropical
                                Atlantic (Remnants of Emily)" -> "Central Subtropical
                                Atlantic"). Two areas sharing a title in one issuance get
                                the published index appended so the key stays unique.

  iss:epac:20200822T1138Z#2     No invest, no title -- the 2010-2021 product gives areas
                                neither. This key is unique per issuance and DELIBERATELY
                                NOT STABLE: there is nothing in the text to make it stable.
                                Rows carrying an `iss:` key are a per-issuance observation
                                log and must not be counted as distinct disturbances. This
                                is the honest form of "the source does not say". Measured:
                                every area in TWOEP 2020 and TWOCP 2013 lands here (39 rows
                                -> 39 keys over 2020-08-20..25; 46 -> 46 over 2013-08-10..16).

WHY INVEST BEATS TITLE, WHEN BOTH ARE IMPERFECT. Anchoring on the title keeps a run whole
across the moment NHC opens an invest; anchoring on the invest splits it there. Measured on
TWOAT 2026-08-10..14: 47 area-issuances collapse to 9 keys, and the disturbance that became
AL92 appears as `ttl:...central-tropical-atlantic` for its first 8 issuances and
`inv:...al92` for the next 10, at the issuance where "(AL92)" was appended to a title that
did not otherwise change. That split is the cost of this choice, and it is paid on purpose:
a title is REUSED within a season -- "Eastern Tropical Atlantic" describes a different wave
every few weeks -- so a title-first key would silently MERGE unrelated disturbances into one
three-month-long entry. A split is visible as two keys and is stitchable (the unchanged
title survives in the row's `text`, the invest in `invest_id`); a merge looks like a single
well-observed disturbance and is not recoverable from the table at all. Splits over merges,
every time.

The season component is the calendar year of the issuance in UTC. An off-season issuance in
December belongs to the season that is ending; January belongs to the one that has not
started. Both are deterministic and derived from the published stamp, which is what the key
needs; neither is a claim about which season the storm "really" belongs to.

-----------------------------------------------------------------------------------------
PURE PARSER. `parse_outlook` and `disturbance_rows` do no I/O. `list_issuances` is the only
function that touches the network, and it goes through provenance.fetch so the directory
listing it read is hashed and cached like every other byte in the archive.
"""

from __future__ import annotations

import re
import urllib.error
from datetime import datetime, timedelta, timezone

from genesis.provenance import Gap, PROCESSING_VERSION, SourceRecord, fetch, _now

# ---------------------------------------------------------------------------
# products, basins, and what the archive actually contains
# ---------------------------------------------------------------------------

ARCHIVE_BASE = "https://www.nhc.noaa.gov/archive/text"

BASIN_PRODUCT = {"atlantic": "TWOAT", "epac": "TWOEP", "cpac": "TWOCP"}
PRODUCT_BASIN = {v: k for k, v in BASIN_PRODUCT.items()}

# The WMO abbreviated heading on line 2. Kept as a second, independent witness of which
# basin the product is: the AWIPS id line has been seen with trailing whitespace and the
# NWS API wrapper rewrites it, but the WMO heading is the transmission header itself.
WMO_BASIN = {"ABNT20": "atlantic", "ABPZ20": "epac", "ACPN50": "cpac"}

# Measured coverage of the per-issuance text archive, by listing every year directory.
# `None` for the end year means "still being written". These are directory facts, not
# guesses: TWOCP has exactly one year in it.
ARCHIVE_COVERAGE = {
    "atlantic": (2003, None),
    "epac": (2003, None),
    "cpac": (2013, 2013),
}

# The era boundaries this parser was built against, as UTC instants, each taken from the
# first real file exhibiting the change. They are constants so a query can date-filter on
# them instead of re-deriving them, and so a future re-scan that disagrees is a visible diff
# rather than a silent behaviour change.
#
# NOTE ON WHAT "FIRST OBSERVED" MEANS: an outlook only shows a probability when there is a
# disturbance to attach one to, so these are upper bounds on the day NHC changed the
# product, not the change date itself. The bound is what the bytes support.
FIRST_CATEGORICAL_UTC = datetime(2009, 5, 15, 11, 40, tzinfo=timezone.utc)   # TWOEP.200905151140
FIRST_POINT_PROB_UTC = datetime(2010, 5, 24, 0, 24, tzinfo=timezone.utc)     # TWOAT.201005240024
# Both basins gained the five-day probability on the SAME DAY, 2013-08-01, and the product
# says so on the same line ("FIVE-DAY FORMATION PROBABILITIES ARE EXPERIMENTAL IN 2013").
# Two independent products agreeing to the day is what makes this a change date rather than
# merely the first day a disturbance happened to exist.
FIRST_FIVE_DAY_UTC = datetime(2013, 8, 1, 11, 31, tzinfo=timezone.utc)       # TWOEP.201308011131
# The seven-day horizon arrives in the season-opening outlooks of 2023, in the "formation is
# not expected during the next 7 days" sentence -- which is published whether or not a
# disturbance exists, so this one is the change date, not an upper bound on it.
FIRST_SEVEN_DAY_UTC = datetime(2023, 5, 15, 11, 24, tzinfo=timezone.utc)     # TWOAT.202305151124
# When areas started carrying a published title, which is what makes a `ttl:` disturbance
# key possible at all. Before this instant every archived area falls back to the unstable
# per-issuance key, and no amount of parsing changes that -- the identifier is not in the
# product. Zero titled areas in 553 sampled 2021 issuances; first is TWOAT.202205222311.
FIRST_TITLED_AREA_UTC = datetime(2022, 5, 22, 23, 11, tzinfo=timezone.utc)   # TWOAT.202205222311
# When invest designators started appearing inside those titles. Zero in 547 sampled 2022
# issuances. This is the earliest an `inv:` key can exist.
FIRST_INVEST_IN_TITLE_UTC = datetime(2023, 7, 9, 11, 38, tzinfo=timezone.utc)  # TWOEP.202307091138

# From this issuance the eastern Pacific outlook covers the central Pacific as well.
# Established by binary search on the coverage line across TWOEP 2025.
TWOEP_COVERS_CPAC_UTC = datetime(2025, 6, 1, 11, 0, tzinfo=timezone.utc)     # TWOEP.202506011100

# "near 0 percent" is NHC's published wording for the bottom of the scale. It is a LABEL,
# not a number: the product prints point probabilities in 10-percent increments and uses
# this phrase instead of "0 percent". Mapping it to 0.0 would put a forecast in the archive
# that NHC did not publish, so it maps to None and the phrase itself is preserved in
# `prob_48h_text` / `prob_7d_text` and in the row's `text`. One constant, one decision.
NEAR_ZERO_PCT = None

# ---------------------------------------------------------------------------
# the probability grammar, as observed
# ---------------------------------------------------------------------------
# Everything below runs against WHITESPACE-NORMALISED text. The product is hard-wrapped at
# ~69 columns with trailing spaces, and it wraps INSIDE the phrases we need:
#     "...THERE IS A LOW CHANCE...10\nPERCENT...OF THIS SYSTEM BECOMING..."
# A regex written against the raw lines matches on some issuances and not others purely by
# where the wrap fell that day. Normalise first, always.

_LABEL = r"(low|medium|high)"

# Every shape of "value" the product has been observed to print. Only the bare "NN percent"
# is a forecast; the rest are bounds, ranges, hedges or the bottom-of-scale phrase, and each
# resolves to a NULL probability with the qualifier recorded. The alternation is ordered
# longest-first because "near 0 percent" must not be consumed by "\d+ percent".
#   "near 0 percent"        bottom of scale, every era from 2010
#   "near zero percent"     CPHC's spelling of the same thing (TWOCP.201307301738)
#   "near 10 percent"       a hedged point value (TWOAT.201307022344) -- still not a point
#   "less than 30 percent"  2009 category boundary
#   "30 to 50 percent"      2009 category boundary
#   "greater than 50 percent" 2009 category boundary
_VALUE = (r"(near\s+0\s+percent"
          r"|near\s+zero\s+percent"
          r"|near\s+\d+\s+percent"
          r"|less\s+than\s+\d+\s+percent"
          r"|greater\s+than\s+\d+\s+percent"
          r"|\d+\s+to\s+\d+\s+percent"
          r"|\d+\s+percent)")

_HORIZON = r"(\d+\s+hours?|\d+\s+days?)"

# NHC's separator is a literal "..." but the count varies and a wrap can put a space in it.
_SEP = r"[.\s]*"

# ERA 3/4 layout. The bullet's trailing period is present in 2014, absent in 2015, present
# again in 2020; it is simply not matched on.
#
# THE LABEL SLOT IS NOT ALWAYS A LABEL. TWOEP.201908160503 published
#     "* Formation chance through 48 hours...near...0 percent."
# where the forecaster's keystroke put "near" in the category slot and left "0 percent" in
# the value slot; the phrase on the page is NHC's ordinary "near 0 percent". Requiring
# low|medium|high there dropped the whole block, and with it a real disturbance, from that
# issuance while its two siblings parsed normally. The slot therefore accepts any single
# word and `_statements` decides what it means -- see the "near" branch there. Nothing is
# repaired into a number: that reading still yields a NULL probability.
_RE_BULLET = re.compile(
    r"formation\s+chance\s+through\s+" + _HORIZON + _SEP + r"([a-z]+)" + _SEP + _VALUE,
    re.I)

# ERA 1/2/3 prose layout. The lead-in varies ("THERE IS A", "THIS SYSTEM HAS A", "...AND A")
# so it is not matched on; the anchor is "<label> chance ... <value> ... the next <horizon>".
# The bridge between value and horizon is bounded and non-greedy so that a two-sentence
# block ("...NEXT 48 HOURS...AND A LOW CHANCE...20 PERCENT...NEXT 5 DAYS") yields two
# statements rather than one straddling both. Observed bridges include "of this system
# becoming a tropical cyclone during", "of becoming a subtropical or tropical cyclone
# during", and "of this system becoming a tropical cyclone in".
_RE_PROSE = re.compile(
    _LABEL + r"\s+chance" + _SEP + _VALUE + r".{0,140}?(?:during|in|over|through|within)"
    r"\s+the\s+next\s+" + _HORIZON,
    re.I)

# CPHC's inverted dialect, from the only central Pacific season in the archive:
#     "THERE IS A NEAR ZERO PERCENT CHANCE OF REDEVELOPMENT."   (TWOCP.201307301738)
# Value before "chance", no category word, and NO HORIZON AT ALL. It is a genuine
# disturbance mention with a genuine published probability, so it makes an area -- but the
# probability is attached to no forecast window, so it cannot go in the 48-hour column or
# the long-range one. It lands in `statements_unassigned`, where it is visible and unusable
# rather than silently filed under a horizon nobody published.
_RE_PROSE_INVERTED = re.compile(
    _VALUE + r"\s+chance\s+of\s+(?:re)?(?:development|formation|regeneration|"
    r"tropical\s+cyclone\s+formation)",
    re.I)

# The same statement with the forecast window written as prose instead of a horizon:
#     "HAS A HIGH CHANCE...90 PERCENT...OF BECOMING A TROPICAL CYCLONE BEFORE IT REACHES
#      THE COAST OF MEXICO IN A DAY OR SO."          (TWOEP.201305281739)
# Ninety percent is a real published forecast and this is a real disturbance, so the block
# becomes an area -- but "in a day or so" is not 48 hours, and writing 90 into `prob_48h_pct`
# would attribute to NHC a 48-hour forecast it did not make. The statement is carried in
# `statements_unassigned`. This pattern is tried last: when the horizon form also matches at
# the same offset, the horizon form wins.
_RE_PROSE_NO_HORIZON = re.compile(
    _LABEL + r"\s+chance" + _SEP + _VALUE + _SEP + r"(?:of|that)\b", re.I)

# Any "percent" the two patterns above did not consume is reported, not swallowed. This is
# the instrument that found "30 TO 50 PERCENT" (2009 category bounds) and "LESS THAN 30
# PERCENT" in the first place; leaving it in means the next wording change is visible in a
# build report instead of appearing as an area that quietly stopped being parsed.
_RE_PERCENT = re.compile(r"\bpercent\b", re.I)

# A position, if the product ever states one. It never has in any issuance sampled, and
# that is exactly why it is a strict pattern rather than a prose reader: it fires only on an
# explicit coordinate pair and produces None otherwise.
_RE_LATLON = re.compile(
    r"\b(\d{1,2}(?:\.\d+)?)\s*([NS])\b[\s,]{1,3}(\d{1,3}(?:\.\d+)?)\s*([EW])\b")

# NHC's invest designators. Restricted to the four real ocean prefixes so that a
# parenthetical like "(Remnants of Emily)" or "(AL)" cannot be mistaken for one.
_RE_INVEST = re.compile(r"\b((?:AL|EP|CP|WP)\d{2})\b")

# ---------------------------------------------------------------------------
# header parsing
# ---------------------------------------------------------------------------

# The human-readable issuance line. Four things about it are traps, all found in real files:
#   "705 AM PDT Thu Apr 23 2020"    the modern shape
#   "10 AM PDT MON JUN 16 2003"     minutes DROPPED when zero -- "10 AM" is ten o'clock
#   "10 PM SUN OCT 12 2003"         NO TIME ZONE AT ALL (TWOEP.200310130408)
#   "4 AM PDT TUE JUNE 8 2004"      month spelled in full (TWOEP.200406081030)
# The time zone is therefore optional and the month is 3-9 letters, matched on its first
# three. Regex backtracking is what resolves the ambiguity when the zone is missing: the
# optional zone group tries "SUN", then the month group fails on "12" and it gives it back.
# A fifth: "11+30 AM EDT TUE SEP 21 2004" (TWOAT.200409211506) is a typing slip in the
# published product. The time field therefore tolerates one punctuation character among the
# digits, which are then read as printed. Only the DATE from this line is load-bearing --
# the timestamp itself comes from the WMO header -- so the slip costs nothing once the line
# parses at all, and refusing to parse it cost the whole issuance a timestamp.
_RE_ISSUED_LOCAL = re.compile(
    r"^\s*(\d{1,2}[^\w\s]?\d{0,2})\s+(AM|PM)\s+(?:([A-Z]{2,4})\s+)?([A-Z]{3})\s+"
    r"([A-Z]{3,9})\s+(\d{1,2})\s+(\d{4})\s*$",
    re.I | re.M)

# "ABPZ20 KNHC 231405" -- day-of-month and HHMM UTC of transmission. No month, no year.
# THE TRAILING TRAP: an amended transmission appends a WMO BBB indicator --
# "ABNT20 KNHC 231326 RRA", "ACPN50 PHFO 301147 CCA". Anchoring the pattern at the digits
# made those nine issuances fall back to the scheduled local time, which is up to two hours
# from the real transmission and looked like clock drift rather than a missing suffix. The
# indicator is captured, not discarded: CCA means NHC corrected this outlook.
_RE_WMO = re.compile(
    r"^\s*([A-Z]{4}\d{2})\s+([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})(?:\s+([A-Z]{3}))?\s*$", re.M)

_RE_AWIPS = re.compile(r"\b(?:MIA|HFO)?(TWO(?:AT|EP|CP))\b")

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"])}

# Fixed offsets for the time-zone abbreviations NHC and CPHC actually print. These are used
# ONLY to cross-check the WMO stamp, never to produce the timestamp: the WMO header is the
# machine-readable transmission time and it is what `issuance_utc` comes from. HST has no
# daylight variant, which is why the Honolulu products are unambiguous.
_TZ_OFFSET_HOURS = {
    "UTC": 0, "GMT": 0, "Z": 0,
    "AST": -4, "EDT": -4, "EST": -5, "CDT": -5, "CST": -6,
    "MDT": -6, "MST": -7, "PDT": -7, "PST": -8, "AKDT": -8, "AKST": -9, "HST": -10,
}

_RE_STAMP_IN_NAME = re.compile(r"TWO(?:AT|EP|CP)\.(\d{12})(?:\.txt)?$", re.I)


def _norm(s: str) -> str:
    """Collapse every run of whitespace to one space. See the note above _LABEL."""
    return re.sub(r"\s+", " ", s).strip()


def _parse_pct(value_text: str) -> tuple[float | None, str]:
    """Turn one published value phrase into (percent, qualifier).

    Only a bare "NN percent" is a forecast. Everything else -- a bound, a range, or the
    bottom-of-scale phrase -- returns None with the qualifier naming what was published, so
    the archive can distinguish "NHC said 20%" from "NHC said less than 30%" from "NHC said
    nothing". Collapsing those three into a number is how a categorical 2009 season would
    end up looking like a decade of point forecasts.
    """
    v = value_text.lower()
    if v.startswith("near 0 ") or v.startswith("near zero"):
        return NEAR_ZERO_PCT, "near_zero"
    if v.startswith("near "):
        return None, "near"
    if v.startswith("less than"):
        return None, "less_than"
    if v.startswith("greater than"):
        return None, "greater_than"
    if re.match(r"^\d+\s+to\s+\d+\s+percent$", v):
        return None, "range"
    m = re.match(r"^(\d+)\s+percent$", v)
    if m:
        return float(m.group(1)), "exact"
    return None, "unrecognised"


def _horizon_hours(horizon_text: str) -> float | None:
    m = re.match(r"^(\d+)\s+(hours?|days?)$", horizon_text.strip(), re.I)
    if not m:
        return None
    n = float(m.group(1))
    return n if m.group(2).lower().startswith("hour") else n * 24.0


def _statements(block_norm: str) -> list[dict]:
    """Every formation-probability statement in one normalised block, in document order.

    Both grammars are run and the results merged on character offset, because the eras
    overlap: a 2014 issuance can carry a bulleted 48-hour line and a prose five-day
    sentence in the same product. Overlapping matches from the two patterns are de-duped by
    keeping the earlier start.
    """
    found: list[dict] = []
    for rx, kind in ((_RE_BULLET, "bullet"), (_RE_PROSE, "prose"),
                     (_RE_PROSE_INVERTED, "prose_inverted"),
                     (_RE_PROSE_NO_HORIZON, "prose_no_horizon")):
        for m in rx.finditer(block_norm):
            if kind == "bullet":
                horizon, label, value = m.group(1), m.group(2), m.group(3)
                if label.lower() not in ("low", "medium", "high"):
                    # "48 hours...near...0 percent": the word in the category slot belongs
                    # to the value phrase. Re-read the two slots as the one phrase NHC
                    # meant, which is a bottom-of-scale LABEL and therefore still a NULL
                    # probability -- never 0.0, which is what the naive read would have
                    # written into the archive.
                    value = f"{label} {value}"
                    label = None
            elif kind == "prose":
                label, value, horizon = m.group(1), m.group(2), m.group(3)
            elif kind == "prose_no_horizon":
                label, value, horizon = m.group(1), m.group(2), None
            else:
                label, value, horizon = None, m.group(1), None
            pct, qual = _parse_pct(value)
            found.append({
                "start": m.start(), "end": m.end(), "kind": kind,
                "horizon_hours": _horizon_hours(horizon) if horizon else None,
                "horizon_text": _norm(horizon) if horizon else None,
                "label": label.lower() if label else None, "value_text": _norm(value),
                "pct": pct, "qualifier": qual,
            })
    found.sort(key=lambda s: s["start"])
    out: list[dict] = []
    for s in found:
        if out and s["start"] < out[-1]["end"]:
            continue
        out.append(s)
    return out


def _split_blocks(body: str) -> list[str]:
    """Blank-line-delimited blocks, with the product's own section markers removed.

    "$$" ends the product; "&&" opens the trailing "additional information" section, which
    is dropped only implicitly -- it carries no formation probability, so it never becomes
    an area. Cutting at "&&" explicitly was tried and rejected: it is not present in every
    era and one issuance placed it before the last area.
    """
    lines = []
    for raw in body.split("\n"):
        if raw.strip() == "$$":
            break
        lines.append(raw)
    blocks, cur = [], []
    for line in lines:
        if line.strip() == "":
            if cur:
                blocks.append("\n".join(cur))
                cur = []
        elif line.strip() == "&&":
            if cur:
                blocks.append("\n".join(cur))
                cur = []
        else:
            cur.append(line)
    if cur:
        blocks.append("\n".join(cur))
    return blocks


_RE_TITLE = re.compile(r"^\s*(?:(\d{1,2})\s*[.)]\s*)?(.{1,120}?):\s*$")
_RE_LEAD_NUMBER = re.compile(r"^\s*(\d{1,2})\s*[.)]\s+")


def _block_head(block: str) -> tuple[int | None, str | None]:
    """(published index, title) from a block's first line.

    Three shapes have been observed and all three are live:
      "Central Tropical Atlantic (AL92):"   title, no number      (2022 onward, archive text)
      "1. Central Tropical Atlantic (AL92):" title with number     (the web/HTML rendering)
      "1. A large area of disturbed weather" number, no title      (special outlooks, 2020)
    A title line must end in a colon and be short; the numbered-prose form is a number
    followed by ordinary sentence text, and calling that a title would put a sentence
    fragment into every disturbance_key.
    """
    first = block.split("\n", 1)[0]
    if first.lstrip().startswith("*"):
        return None, None
    m = _RE_TITLE.match(first)
    if m and not _RE_PERCENT.search(first):
        num = int(m.group(1)) if m.group(1) else None
        return num, _norm(m.group(2))
    m = _RE_LEAD_NUMBER.match(first)
    if m:
        return int(m.group(1)), None
    return None, None


_RE_SEGMENT_HEAD = re.compile(r"^(?:(\d{1,2})\s*[.)]\s*)?([^:]{1,120}?):\s")


def _segment_head(seg_norm: str) -> tuple[int | None, str | None]:
    """The same head, read off a segment whose line structure is already gone.

    Used only for the second and later areas of a block that had to be cut because the
    blank line between them was lost -- which is what happens when the outlook arrives as
    stripped HTML from the web page rather than as the raw product. Without this the second
    area of such a block loses its title and falls back to an unstable `iss:` key even
    though NHC published a perfectly good one.
    """
    m = _RE_SEGMENT_HEAD.match(seg_norm)
    if not m or _RE_PERCENT.search(m.group(0)):
        return None, None
    num = int(m.group(1)) if m.group(1) else None
    return num, _norm(m.group(2))


def _basin_of(text: str) -> str | None:
    """Which product this is. Three independent witnesses, tried strongest first."""
    head = "\n".join(text.split("\n")[:8])
    m = _RE_AWIPS.search(head)
    if m:
        return PRODUCT_BASIN.get(m.group(1).upper())
    m = _RE_WMO.search(head)
    if m and m.group(1).upper() in WMO_BASIN:
        return WMO_BASIN[m.group(1).upper()]
    # Last resort: the product's own domain statement. Order matters -- since 2025-06-01 the
    # eastern Pacific outlook says "eastern AND CENTRAL North Pacific", so a naive test for
    # "central north pacific" would file every modern TWOEP as a Honolulu product.
    low = _norm(text).lower()
    if "north atlantic" in low:
        return "atlantic"
    if "eastern" in low and "pacific" in low:
        return "epac"
    if "central north pacific" in low:
        return "cpac"
    if "pacific" in low:
        return "epac"
    return None


def _issuance_from_text(text: str) -> tuple[datetime | None, dict]:
    """The transmission time, in UTC, from the two published time fields together.

    Neither field is sufficient alone. The WMO header carries day-of-month, hour and minute
    in UTC but no month or year; the human line carries the full local date but a local
    clock. Combining them is not interpolation -- both are published, and the answer is the
    intersection of the two.

    The one-day trap: at 1100 PM PDT the local date and the UTC date differ. TWOEP.201908220501
    prints "1100 PM PDT Wed Aug 21 2019" with WMO day 22. So the UTC day is chosen as the
    calendar date within +/- 1 day of the local date whose day-of-month equals the WMO day,
    which also handles month and year rollover at the end of December.
    """
    diag: dict = {}
    mw = _RE_WMO.search(text)
    ml = _RE_ISSUED_LOCAL.search(text)
    local_date: datetime | None = None
    if ml:
        hhmm, ampm, tzname, _dow, mon, day, year = ml.groups()
        diag["issued_local"] = _norm(ml.group(0))
        local_month = _MONTHS.get(mon.upper()[:3])
        if local_month:
            local_date = datetime(int(year), local_month, int(day), tzinfo=timezone.utc)
            digits = re.sub(r"\D", "", hhmm)
            if digits != hhmm:
                diag["local_time_punctuation"] = hhmm     # e.g. "11+30" as published
            hhmm = digits
            hour = int(hhmm[:-2] or 0) % 12 if len(hhmm) > 2 else int(hhmm) % 12
            minute = int(hhmm[-2:]) if len(hhmm) > 2 else 0
            if ampm.upper() == "PM":
                hour += 12
            # The offset is only ever used for the cross-check below. When the product omits
            # the zone -- 2003 and 2004 do -- the date still anchors the WMO day, so the
            # timestamp survives and only the cross-check is lost.
            off = _TZ_OFFSET_HOURS.get((tzname or "").upper())
            if off is not None:
                diag["scheduled_utc"] = (local_date.replace(hour=hour, minute=minute)
                                         - timedelta(hours=off))
    if not mw:
        # No WMO header (the NWS API wrapper strips it on some products). Fall back to the
        # scheduled time derived from the human line, and say so.
        if "scheduled_utc" in diag:
            diag["issuance_utc_source"] = "local_line"
            return diag["scheduled_utc"], diag
        diag["issuance_utc_source"] = "none"
        return None, diag
    diag["wmo_header"] = _norm(mw.group(0))
    diag["wmo_bbb"] = mw.group(6)          # CCA/RRA/AAA: this transmission is an amendment
    wmo_day, wmo_h, wmo_m = int(mw.group(3)), int(mw.group(4)), int(mw.group(5))
    if local_date is None:
        diag["issuance_utc_source"] = "wmo_header_no_date"
        return None, diag
    # The local calendar date and the UTC calendar date differ by at most one day, so the
    # UTC date is the one within +/- 1 whose day-of-month is the day the WMO header states.
    # +/- 2 is allowed only so that a genuinely broken header fails loudly rather than
    # matching something plausible.
    for delta in (0, 1, -1, 2, -2):
        cand = local_date + timedelta(days=delta)
        if cand.day == wmo_day:
            when = datetime(cand.year, cand.month, wmo_day, wmo_h, wmo_m, tzinfo=timezone.utc)
            diag["issuance_utc_source"] = "wmo_header"
            # The transmission normally precedes the scheduled issuance by under an hour.
            # A wider spread is not an error -- special outlooks are unscheduled -- but it
            # is recorded so a systematic drift would be visible.
            if "scheduled_utc" in diag:
                diag["transmit_minus_scheduled_min"] = round(
                    (when - diag["scheduled_utc"]).total_seconds() / 60.0, 1)
            return when, diag
    diag["issuance_utc_source"] = "wmo_header_unmatched"
    return None, diag


def _slug(s: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


# ---------------------------------------------------------------------------
# public API
# ---------------------------------------------------------------------------


def list_issuances(basin: str, year: int) -> list[dict]:
    """Every archived TWO issuance for one basin and year, oldest first.

    Returns [{url, issuance_utc, filename}]. `issuance_utc` is a timezone-aware UTC
    datetime taken from the filename stamp, which the directory listing's own Last-Modified
    column confirms (TWOEP.202004231405.txt is listed as modified 2020-04-23 14:05).

    THE FILENAME TRAP: 2003 and 2004 (and 2005 for both TWOAT and TWOEP) name their files
    WITHOUT the .txt suffix -- "TWOEP.200306161642" -- and 2006 onward add it. A listing
    built on a `\\.txt$` pattern silently returns zero rows for the three earliest seasons
    and looks like an empty archive rather than a broken pattern.

    A year that is not in the archive returns [] rather than raising, because the back-fill
    walks a range of years and TWOCP exists for exactly one of them. Use `coverage_gap()`
    to turn that emptiness into a recorded Gap -- an empty list on its own is indisting-
    uishable from a quiet season, and that difference is the whole point of the archive.
    """
    product = BASIN_PRODUCT.get(basin)
    if product is None:
        raise ValueError(f"unknown basin {basin!r}; expected one of {sorted(BASIN_PRODUCT)}")
    url = f"{ARCHIVE_BASE}/{product}/{int(year)}/"
    try:
        path, _rec = fetch(_index_key(product, int(year)), url,
                           note=f"NHC {product} {year} per-issuance text archive listing")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return []          # the archive genuinely has no such year -- see coverage_gap
        raise
    # Any other failure -- DNS, timeout, 5xx -- is re-raised on purpose. Returning [] for a
    # network outage would tell the live pipeline that NHC published nothing today, which is
    # a fabricated fact about the world dressed up as an empty result.
    html = path.read_text(errors="replace")
    out: list[dict] = []
    seen = set()
    for href in re.findall(r'<a href="([^"]+)"', html):
        m = re.match(rf"^{product}\.(\d{{12}})(\.txt)?$", href)
        if not m or href in seen:
            continue
        seen.add(href)
        stamp = m.group(1)
        try:
            when = datetime(int(stamp[0:4]), int(stamp[4:6]), int(stamp[6:8]),
                            int(stamp[8:10]), int(stamp[10:12]), tzinfo=timezone.utc)
        except ValueError:
            continue
        out.append({"url": url + href, "issuance_utc": when, "filename": href})
    out.sort(key=lambda d: d["issuance_utc"])
    return out


def _index_key(product: str, year: int) -> str:
    """Cache key for a year's directory listing.

    A finished year's listing never changes again, so it is cached forever under a stable
    key. The CURRENT year's listing grows four times a day, and a cache hit on it would
    make the live pipeline blind to today's issuances -- so its key carries the UTC date and
    the listing is re-fetched once per day. Nothing else in this module is time-dependent.
    """
    now_year = datetime.now(timezone.utc).year
    if year >= now_year:
        return f"two.{product}.{year}.index.{datetime.now(timezone.utc):%Y-%m-%d}.html"
    return f"two.{product}.{year}.index.html"


def index_source_record(basin: str, year: int) -> SourceRecord | None:
    """The provenance record for the directory listing `list_issuances` read.

    Separate from `list_issuances` so that function's contract stays exactly
    {url, issuance_utc, filename}, but exposed because a listing is a fetched byte string
    like any other and belongs in MANIFEST.json. Re-uses the cache, so calling both costs
    one download.
    """
    product = BASIN_PRODUCT.get(basin)
    if product is None:
        raise ValueError(f"unknown basin {basin!r}")
    url = f"{ARCHIVE_BASE}/{product}/{int(year)}/"
    try:
        _path, rec = fetch(_index_key(product, int(year)), url)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise
    return rec


def coverage_gap(basin: str, year: int) -> Gap | None:
    """The recorded Gap for a (basin, year) the text archive does not cover, else None.

    Written as data rather than prose in a build script because these three sentences are
    the honest answer to "why does the Hawaii back-fill have almost no pre-genesis rows",
    and that answer has to travel with the archive.
    """
    product = BASIN_PRODUCT.get(basin)
    if product is None:
        raise ValueError(f"unknown basin {basin!r}")
    start, end = ARCHIVE_COVERAGE[basin]
    year = int(year)
    if year < start or (end is not None and year > end):
        extra = ""
        if basin == "cpac":
            extra = (" The central Pacific outlook is archived per-issuance for 2013 only "
                     "(518 issuances, 2013-07-29..2013-12-01). From 2025-06-01 11:00Z the "
                     "eastern Pacific outlook (TWOEP) covers east of 180 and so includes "
                     "central Pacific disturbances; before that there is no substitute.")
        return Gap(
            key=f"two.{product}.{year}",
            what=f"NHC {product} per-issuance text archive for {year}",
            why=(f"https://www.nhc.noaa.gov/archive/text/{product}/ lists years "
                 f"{start}..{end if end is not None else 'present'} only." + extra),
            impact=("No pre-genesis disturbance rows exist for this basin-year. Disturbances "
                    "that never developed leave no trace at all, and lead time from first "
                    "mention to genesis cannot be computed for storms that did."),
            url=f"{ARCHIVE_BASE}/{product}/{year}/",
        )
    if year <= FIRST_CATEGORICAL_UTC.year - 1:
        return Gap(
            key=f"two.{product}.{year}.pre_probability",
            what=f"formation probabilities in {product} {year}",
            why=("The Tropical Weather Outlook carried no formation probability of any kind "
                 "before the 2009 season; the 2009 season-opening outlook "
                 "(TWOEP.200905151140) announces the introduction of categorical "
                 "probabilities, and point probabilities are first observed 2010-05-24."),
            impact=("Issuances parse to zero areas: disturbances in this era are described "
                    "only in prose, and no rule in the text separates a disturbance "
                    "paragraph from the season name list or the product boilerplate."),
            url=f"{ARCHIVE_BASE}/{product}/{year}/",
        )
    return None


def parse_outlook(text: str, *, url: str | None = None) -> dict:
    """Parse one Tropical Weather Outlook into its areas. Pure: no network, no clock.

    Returns
        {issuance_utc, basin, areas: [...]}
    plus the diagnostic fields the honesty rule requires (`parse_status`,
    `unparsed_blocks`, `unmatched_probability_phrases`, `stamp_mismatch`, ...). Each area is
        {index, text, prob_48h_pct, prob_7d_pct, prob_48h_label, prob_7d_label,
         horizon_days, lat, lon, invest_id}
    with `title`, `prob_48h_text`, `prob_7d_text`, `prob_48h_qualifier`,
    `prob_7d_qualifier`, `index_source` carried alongside so nothing published is dropped.

    WHAT COUNTS AS AN AREA: a blank-line-delimited block carrying at least one formation-
    probability statement. Nothing else. That single rule is what keeps the 2007 name list,
    the "THIS PRODUCT IS ISSUED FOUR TIMES A DAY" boilerplate, the "Active Systems:" block
    and the "&&" information section out of the disturbance log, across every era, without
    a list of phrases to exclude that would go stale the first time a forecaster rephrased
    something.

    `prob_7d_pct` holds the LONG-RANGE probability as published, whose horizon is `horizon_days`
    (5 before 2023, 7 after). It is not renormalised to a common horizon -- there is no
    published conversion and inventing one would be a model, not a datum.
    """
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    issuance_utc, tdiag = _issuance_from_text(text)
    basin = _basin_of(text)

    out: dict = {
        "issuance_utc": issuance_utc,
        "basin": basin,
        "areas": [],
        # --- provenance / diagnostics ---
        "url": url,
        "product": (BASIN_PRODUCT.get(basin) if basin else None),
        "is_special": bool(re.search(r"^\s*Special Tropical Weather Outlook\s*$",
                                     text, re.I | re.M)),
        "coverage_line": None,
        "forecaster": None,
        "parse_status": "ok",
        "unparsed_blocks": [],
        "unmatched_probability_phrases": [],
        "stamp_mismatch": None,
    }
    out.update({k: v for k, v in tdiag.items()})

    # The coverage line is the product's own statement of its domain and it is what the
    # areas begin after. It is looked for only in the header, because a wrapped prose line
    # inside an area can start "for the next couple of days" and, on an issuance whose
    # header was mangled, would otherwise be mistaken for it and swallow every area above it.
    head_len = sum(len(l) + 1 for l in text.split("\n")[:15])
    mcov = re.search(r"^[ \t]*for the .+$", text[:head_len], re.I | re.M)
    if mcov:
        out["coverage_line"] = _norm(mcov.group(0))
    mfc = re.search(r"^\s*Forecaster\s+(.+?)\s*$", text, re.I | re.M)
    if mfc:
        out["forecaster"] = _norm(mfc.group(1))

    # Cross-check the time derived from the text against the time in the filename. They are
    # two independent publications of the same instant; a disagreement is a finding, and
    # silently preferring one would hide it.
    if url:
        mn = _RE_STAMP_IN_NAME.search(url.split("/")[-1])
        if mn and issuance_utc is not None:
            s = mn.group(1)
            named = datetime(int(s[0:4]), int(s[4:6]), int(s[6:8]),
                             int(s[8:10]), int(s[10:12]), tzinfo=timezone.utc)
            if named != issuance_utc:
                out["stamp_mismatch"] = {
                    "filename_utc": named, "text_utc": issuance_utc,
                    "delta_minutes": round((issuance_utc - named).total_seconds() / 60.0, 1),
                }

    body = text
    if mcov:
        body = text[mcov.end():]

    ordinal = 0
    for block in _split_blocks(body):
        block_norm = _norm(block)
        if not block_norm:
            continue
        stmts = _statements(block_norm)
        if not stmts:
            out["unparsed_blocks"].append(block_norm)
            # A block is flagged as a GRAMMAR FAILURE only when it prints a percentage AND
            # frames it as a chance. Percentages also appear in NHC's announcements about
            # the product itself -- "THIS INFORMATION WILL BE PROVIDED PROBABILISTICALLY IN
            # 10-PERCENT INCREMENTS" (2013-07-31), "LOW...LESS THAN 30 PERCENT...MEDIUM..."
            # (2009 season opener) -- and flagging those trains the reader to ignore the
            # flag, which is worse than not having it. Every non-area block is in
            # `unparsed_blocks` regardless, so nothing is hidden.
            if _RE_PERCENT.search(block_norm) and re.search(r"\bchance\b", block_norm, re.I):
                out["unmatched_probability_phrases"].append(block_norm)
            continue

        # One block normally holds one area. If a second 48-hour statement appears, the
        # blank line between two areas was lost (this happens when the text came from the
        # HTML rendering rather than the raw product), so the block is cut at that point
        # instead of merging two disturbances into one row.
        # The cut goes at the END of the previous area's last statement, not at the start of
        # the repeated 48-hour one: everything between them -- the next area's title and its
        # whole description -- belongs to the NEW area, and cutting at the statement would
        # have left the title stranded at the tail of the previous one.
        cuts = [0]
        seen_short = False
        prev_end = 0
        for s in stmts:
            short = s["horizon_hours"] is not None and s["horizon_hours"] <= 48
            if short and seen_short:
                cuts.append(prev_end)
                seen_short = False
            if short:
                seen_short = True
            prev_end = s["end"]
        cuts.append(len(block_norm))

        pub_index, title = _block_head(block)
        for i in range(len(cuts) - 1):
            # lstrip the punctuation the cut inherits from the end of the previous
            # sentence ("...80 percent. 2. Eastern Tropical Atlantic: ...").
            seg = block_norm[cuts[i]:cuts[i + 1]].strip().lstrip(" .*")
            seg_stmts = [s for s in stmts if cuts[i] <= s["start"] < cuts[i + 1]]
            if not seg_stmts:
                continue
            ordinal += 1
            if i == 0:
                seg_index, seg_title = pub_index, title
            else:
                seg_index, seg_title = _segment_head(seg)
            area = _area(seg, seg_stmts, seg_title, seg_index, ordinal)
            out["areas"].append(area)

    if not out["areas"]:
        # Both the Miami and the Honolulu ways of saying "nothing out there". CPHC's
        # phrasing shares no words with NHC's, so a single-phrase check reported 149 quiet
        # 2013 central Pacific issuances as unexplained empties.
        quiet = re.search(r"formation is not expected|no tropical cyclones are expected",
                          _norm(text), re.I)
        if issuance_utc is not None and issuance_utc < FIRST_CATEGORICAL_UTC:
            out["parse_status"] = "pre_probability_era"
        elif out["unmatched_probability_phrases"]:
            out["parse_status"] = "probabilities_present_but_unparsed"
        elif quiet:
            out["parse_status"] = "quiet"
        else:
            out["parse_status"] = "no_areas"
    return out


def _area(seg_text: str, stmts: list[dict], title: str | None,
          pub_index: int | None, ordinal: int) -> dict:
    """Assemble one area from its statements. See parse_outlook for the contract."""
    short = next((s for s in stmts
                  if s["horizon_hours"] is not None and s["horizon_hours"] <= 48), None)
    long = next((s for s in stmts
                 if s["horizon_hours"] is not None and s["horizon_hours"] > 48), None)

    invest = None
    if title:
        mi = _RE_INVEST.search(title)
        if mi:
            invest = mi.group(1).upper()

    lat = lon = None
    mll = _RE_LATLON.search(seg_text)
    if mll:
        lat = float(mll.group(1)) * (1 if mll.group(2).upper() == "N" else -1)
        lon = float(mll.group(3)) * (1 if mll.group(4).upper() == "E" else -1)

    horizon_days = None
    if long and long["horizon_hours"]:
        horizon_days = int(round(long["horizon_hours"] / 24.0))

    return {
        "index": pub_index if pub_index is not None else ordinal,
        "index_source": "published" if pub_index is not None else "document_order",
        "title": title,
        "text": seg_text,
        "prob_48h_pct": short["pct"] if short else None,
        "prob_48h_label": short["label"] if short else None,
        "prob_48h_text": short["value_text"] if short else None,
        "prob_48h_qualifier": short["qualifier"] if short else None,
        "prob_7d_pct": long["pct"] if long else None,
        "prob_7d_label": long["label"] if long else None,
        "prob_7d_text": long["value_text"] if long else None,
        "prob_7d_qualifier": long["qualifier"] if long else None,
        "horizon_days": horizon_days,
        "lat": lat,
        "lon": lon,
        "invest_id": invest,
        # Probability statements the product published without a forecast window (CPHC's
        # "NEAR ZERO PERCENT CHANCE OF REDEVELOPMENT"). Kept whole and kept OUT of the
        # probability columns, because a horizon nobody stated is not a horizon.
        "statements_unassigned": [
            {k: s[k] for k in ("kind", "label", "value_text", "pct", "qualifier",
                               "horizon_text")}
            for s in stmts if s is not short and s is not long
        ],
    }


def disturbance_key(basin: str | None, issuance_utc: datetime | None, area: dict,
                    *, title_collision: bool = False) -> str:
    """The append-only log's follow-the-disturbance key. See the module docstring.

    Pure function of ONE issuance by design: `disturbance_rows` is handed one outlook and
    cannot see yesterday's, so any linkage it claimed beyond what this text states would be
    invented. The prefix names the anchor -- `inv:` invest id, `ttl:` published title,
    `iss:` neither -- so a follow-up pass can select only the keys that are actually stable.
    """
    b = basin or "unknown"
    season = issuance_utc.year if issuance_utc else 0
    if area.get("invest_id"):
        return f"inv:{b}:{season}:{area['invest_id'].lower()}"
    if area.get("title"):
        base = _RE_INVEST.sub("", area["title"])
        base = re.sub(r"\(\s*\)", "", base)
        slug = _slug(base)
        if slug:
            return (f"ttl:{b}:{season}:{slug}#{area['index']}" if title_collision
                    else f"ttl:{b}:{season}:{slug}")
    stamp = issuance_utc.strftime("%Y%m%dT%H%MZ") if issuance_utc else "unknown"
    return f"iss:{b}:{stamp}#{area['index']}"


def disturbance_rows(outlook: dict, *, source_key: str) -> list[dict]:
    """Rows for schema.DAILY_DISTURBANCES, one per area in one issuance.

    outcome is 'open' and every resolution field is None: this module knows only what the
    outlook said. Whether the disturbance became a storm is established later by joining to
    the best track, and pre-filling a guess here would put a conclusion in the log at the
    moment of observation, which is precisely what the log exists to prevent.

    observed_utc == issuance_utc. The log records what was PUBLISHED when, not when the
    poller happened to run; a back-fill and the live pipeline must produce byte-identical
    rows for the same issuance or the archive is not reproducible.
    """
    ingested = _now()
    basin = outlook.get("basin")
    issuance = outlook.get("issuance_utc")
    url = outlook.get("url")

    titles = [a.get("title") for a in outlook.get("areas", []) if a.get("title")]
    dupes = {t for t in titles if titles.count(t) > 1}

    rows: list[dict] = []
    for area in outlook.get("areas", []):
        rows.append({
            "observed_utc": issuance,
            "issuance_utc": issuance,
            "basin": basin,
            "disturbance_key": disturbance_key(
                basin, issuance, area,
                title_collision=bool(area.get("title") and area["title"] in dupes)),
            "invest_id": area.get("invest_id"),
            "lat": area.get("lat"),
            "lon": area.get("lon"),
            "prob_48h_pct": area.get("prob_48h_pct"),
            "prob_7d_pct": area.get("prob_7d_pct"),
            "prob_48h_label": area.get("prob_48h_label"),
            "prob_7d_label": area.get("prob_7d_label"),
            "text": area.get("text"),
            "source_url": url,
            "resolved_storm_id": None,
            "resolved_atcf_id": None,
            "outcome": "open",
            "outcome_utc": None,
            "hours_to_genesis": None,
            "source_key": source_key,
            "processing_version": PROCESSING_VERSION,
            "ingested_utc": ingested,
        })
    return rows


if __name__ == "__main__":
    import json
    import sys
    from pathlib import Path

    for arg in sys.argv[1:]:
        raw = Path(arg).read_text(errors="replace")
        o = parse_outlook(raw, url=arg)
        print(f"== {arg}")
        print(f"   basin={o['basin']} issued={o['issuance_utc']} status={o['parse_status']} "
              f"special={o['is_special']} areas={len(o['areas'])}")
        for a in o["areas"]:
            print(f"   [{a['index']}] invest={a['invest_id']} title={a['title']!r} "
                  f"48h={a['prob_48h_pct']}/{a['prob_48h_label']}/{a['prob_48h_text']!r} "
                  f"long={a['prob_7d_pct']}/{a['prob_7d_label']}/{a['prob_7d_text']!r} "
                  f"horizon={a['horizon_days']}d lat/lon={a['lat']},{a['lon']}")
        if o["unmatched_probability_phrases"]:
            print("   UNMATCHED PERCENT:", json.dumps(o["unmatched_probability_phrases"])[:400])
