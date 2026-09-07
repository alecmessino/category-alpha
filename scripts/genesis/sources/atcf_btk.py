"""ATCF b-deck (best track) -- the OPERATIONAL record of where a live storm actually formed.

WHY THIS EXISTS, AND WHAT IT FIXES.

The analog prior is genesis-conditioned: its whole claim is "for a system that formed HERE, in
this season, what did the ones like it go on to do?". The position it queries on must therefore
be a GENESIS position. `live.genesis_position` looked that up in the archive's `genesis_events`
table -- correct for a historical storm, and empty for every live one, because the archive is
IBTrACS-derived and lags a running season by days.

The fallback was the storm's CURRENT position, and it was silent. On the snapshot that exposed
this, all three live east-Pacific systems were being matched on where they were rather than where
they formed:

    EP112026   8.6N 103.8W formed  ->  23.0N 145.7W current   4,739 km away
    EP122026  10.1N 136.7W formed  ->  17.0N 162.9W current   2,931 km away
    EP132026  10.4N 105.3W formed  ->  24.5N 124.1W current   2,531 km away

All three returned zero analogs, and the zero was the archive being HONEST about a question
nobody meant to ask: almost nothing forms at 23N 145.7W, so a genesis cohort drawn there is
empty. The failure mode that makes this worth a module of its own is the one where it is NOT
empty -- a storm that drifts into a genesis-rich cell would have published a confident rate for
the wrong cohort, under the archive's name, with every existing test still passing.

The operational answer is in the b-deck: the storm's first best-track fix is where NHC says it
began. Same host and same access pattern as `ships_rt`, so this adds no new dependency.

THIS IS AN ANCHOR, NOT A VALUE. What this module supplies is WHERE the archive is asked its
question. No number from here enters a case, a weight, a rate, an interval or an effective
sample size -- those stay the archive's own, and `position_used` on every entry declares which
anchor was used. Choosing a better place to ask is not the same as putting an operational
number into a historical answer.

PURE PARSER PLUS A THIN FETCH, deliberately split so the parsing is testable with no network
and no pyarrow.
"""

from __future__ import annotations

import urllib.request

# The archive's own vocabulary, imported rather than restated so the two definitions of
# "tropical" cannot drift apart. status.py is stdlib-only, so this parser stays testable
# without the archive's pyarrow dependency.
from ..status import TROPICAL_STATUS

BTK_DIR = "https://ftp.nhc.noaa.gov/atcf/btk/"
USER_AGENT = "millibar-terminal/1 (+https://github.com/alecmessino/category-alpha)"


def btk_filename(atcf_id: str) -> str | None:
    """EP132026 -> bep132026.dat. None when the id is not an ATCF id."""
    s = str(atcf_id or "").strip().upper()
    if len(s) != 8 or not s[:2].isalpha() or not s[2:].isdigit():
        return None
    return "b" + s.lower() + ".dat"


def _coord(tok: str):
    """'104N' -> 10.4 ; '1053W' -> -105.3 ; '1904E' -> 190.4 handled by the caller's wrap.

    ATCF writes tenths of a degree with a hemisphere letter. A zero magnitude is the field's
    "not set" marker, not the equator or the prime meridian, so it reads as absent -- the same
    rule the JavaScript deck parser follows.
    """
    t = str(tok or "").strip().upper()
    if len(t) < 2 or t[-1] not in "NSEW":
        return None
    try:
        v = int(t[:-1]) / 10.0
    except ValueError:
        return None
    if v == 0:
        return None
    return -v if t[-1] in "SW" else v


def first_fix(text: str, *, tropical_only: bool = True):
    """Where NHC says this system began -- by the ARCHIVE'S definition of genesis.

    The archive defines genesis as the FIRST TROPICAL POINT (`genesis_lat` in
    `genesis_events`), not the first point of any kind -- that is a separate column,
    `first_track_lat`. A b-deck routinely opens with `DB` disturbance rows days before the
    system is tropical, so taking the first row outright would anchor the cohort somewhere the
    archive would not call genesis at all, and the two sides of the comparison would silently
    mean different things. Same field name, different measurement: exactly the mismatch this
    build refuses elsewhere.

    Returns {'lat', 'lon', 'iso', 'month', 'kt', 'stage', 'source'} or None. The earliest DTG
    is taken explicitly rather than trusting file order -- a re-issued deck with an appended
    earlier fix would otherwise move genesis to whichever row happened to be printed first.
    """
    best = None
    for line in str(text or "").splitlines():
        f = [c.strip() for c in line.split(",")]
        if len(f) < 11 or f[4].upper() != "BEST":
            continue
        dtg = f[2]
        if len(dtg) != 10 or not dtg.isdigit():
            continue
        stage = f[10].upper()
        # An unknown stage is not evidence of a tropical cyclone, so it does not count --
        # the same rule genesis_events._is_tropical applies to the archive.
        if tropical_only and stage not in TROPICAL_STATUS:
            continue
        lat, lon = _coord(f[6]), _coord(f[7])
        if lat is None or lon is None:
            continue
        try:
            kt = int(f[8])
        except ValueError:
            kt = None
        if best is None or dtg < best[0]:
            best = (dtg, lat, lon, kt, stage)
    if best is None:
        return None
    dtg, lat, lon, kt, stage = best
    return {
        "lat": lat,
        # East of the dateline the deck writes a west longitude past 180; keep it a real
        # east longitude rather than a coordinate 190 degrees west of Greenwich.
        "lon": lon + 360.0 if lon < -180.0 else lon,
        "iso": f"{dtg[0:4]}-{dtg[4:6]}-{dtg[6:8]}T{dtg[8:10]}:00:00Z",
        "month": int(dtg[4:6]),
        "kt": kt,
        "stage": stage,
        "source": "NHC ATCF b-deck first tropical fix",
    }


def _get(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def fetch_first_fix(atcf_id: str, *, text: str | None = None):
    """The operational genesis fix for one live system, or None.

    `text` short-circuits the network so callers and tests can supply a deck directly. A deck
    that does not exist yet is a normal state (a system numbered minutes ago), not a failure,
    and returns None rather than raising.
    """
    if text is not None:
        return first_fix(text)
    name = btk_filename(atcf_id)
    if not name:
        return None
    try:
        return first_fix(_get(BTK_DIR + name))
    except Exception:
        return None
