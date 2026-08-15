"""Alpha-signal correlation timestamps.

Lifecycle rule 3: every Kalshi or EIA record carries the triple that lets it join
directly against NHC best-track (b-deck) rows.

    observed_at    true event time, ISO 8601 UTC, Z suffix, second precision
    synoptic_time  observed_at FLOORED to the ATCF 6-hourly slot (00/06/12/18Z)
    btk_key        {BASIN}{CC}{YYYY}_{YYYYMMDDHH} — matches exactly one b-deck row

WHY FLOOR AND NOT ROUND. Rounding attributes a price printed at 14:37Z to the 12Z fix
in one direction and the 18Z fix in the other, so the same market lands on a different
storm state depending on the minute. Flooring guarantees the correlated fix had already
been published when the alpha event happened. That is the only version that is causally
honest: a market cannot have reacted to a fix that did not exist yet.

Run the self-test:  python3 alpha_timestamps.py
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from typing import Any

UTC = dt.timezone.utc

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------


def iso_z(when: dt.datetime) -> str:
    """ISO 8601 UTC with a Z suffix, second precision."""
    return when.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def synoptic_floor(when: dt.datetime) -> dt.datetime:
    """Floor a UTC instant to the ATCF 6-hourly synoptic slot."""
    when = when.astimezone(UTC)
    return when.replace(hour=(when.hour // 6) * 6, minute=0, second=0, microsecond=0)


def btk_key(basin: str, cyclone_no: int, year: int, when: dt.datetime) -> str:
    """ATCF b-deck join key, e.g. AL092026_2026081512.

    `basin` is the two-letter ATCF basin (AL, EP, CP), `cyclone_no` the cyclone number
    within that basin and season.
    """
    return f"{basin.upper()}{cyclone_no:02d}{year}_{synoptic_floor(when):%Y%m%d%H}"


def correlation_triple(
    observed_at: dt.datetime, basin: str, cyclone_no: int, year: int
) -> dict[str, str]:
    """The three fields every Cluster 4 record carries."""
    return {
        "observed_at": iso_z(observed_at),
        "synoptic_time": iso_z(synoptic_floor(observed_at)),
        "btk_key": btk_key(basin, cyclone_no, year, observed_at),
    }


# ---------------------------------------------------------------------------
# EIA
# ---------------------------------------------------------------------------


def eia_period_to_observed_at(period: str) -> dt.datetime:
    """'2026-08-15T14' -> tz-aware UTC datetime.

    The EIA v2 hourly RTO `period` field is UTC hour-ending with no zone suffix. It is
    NOT local time and NOT hour-beginning. A demand series shifted by four hours against
    a landfall correlates to the wrong fix and reads as a real signal, so this
    conversion is made explicitly and never inferred from a naive string.
    """
    return dt.datetime.strptime(period, "%Y-%m-%dT%H").replace(tzinfo=UTC)


def eia_record(
    raw: dict[str, Any], basin: str, cyclone_no: int, year: int
) -> dict[str, Any]:
    """Normalize one EIA v2 data row into the project's record shape."""
    observed_at = eia_period_to_observed_at(raw["period"])
    value = raw.get("value")
    return {
        "source": f"eia:{raw.get('respondent', 'unknown')}:{raw.get('type', 'D')}",
        "cluster": 4,
        "ok": value is not None,
        "status": 200,
        "note": None if value is not None else "EIA returned a null value for this period",
        # A null value stays null. Never carry the previous hour forward: a flat demand
        # curve through a landfall is a conclusion, and an interpolated one is a lie.
        "value": None if value is None else float(value),
        "units": raw.get("value-units"),
        **correlation_triple(observed_at, basin, cyclone_no, year),
    }


# ---------------------------------------------------------------------------
# Kalshi
# ---------------------------------------------------------------------------

# Kalshi has migrated price and size representations more than once: integer cents,
# dollar-denominated strings ("0.0300"), and fixed-point strings suffixed _fp. A reader
# that assumes one returns 0 for the others — silently, because 0 is a legal price.
_FP_SCALE = Decimal(10) ** 7  # confirm against a live payload before trusting it


def kalshi_price_cents(market: dict[str, Any]) -> tuple[int | None, str]:
    """Return (cents, representation). None when the market carries no price at all.

    Missing is never coerced to 0 — 0 is a legal Kalshi price and the two states must
    stay distinguishable all the way to the board.
    """
    value = market.get("last_price")
    if value is not None:
        return int(value), "cents"

    value = market.get("last_price_dollars")
    if value is not None:
        return int(Decimal(str(value)) * 100), "dollars_string"

    value = market.get("last_price_fp")
    if value is not None:
        return int(Decimal(str(value)) / _FP_SCALE * 100), "fixed_point"

    return None, "absent"


def kalshi_record(
    market: dict[str, Any],
    observed_at: dt.datetime,
    basin: str,
    cyclone_no: int,
    year: int,
) -> dict[str, Any]:
    """Normalize one Kalshi market into the project's record shape.

    `observed_at` is the fetch instant for a live quote, or `close_time` for a
    resolution — pass the one that matches what the row means.
    """
    cents, representation = kalshi_price_cents(market)
    return {
        "source": "kalshi",
        "cluster": 4,
        "ok": cents is not None,
        "status": 200,
        "note": None if cents is not None else "no price on this market",
        "ticker": market.get("ticker"),
        "value": None if cents is None else cents / 100.0,
        # Recording which representation was found is what turns the next field
        # migration into a one-line diff instead of a week of zeroed prices.
        "price_representation": representation,
        **correlation_triple(observed_at, basin, cyclone_no, year),
    }


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    t = dt.datetime(2026, 8, 15, 14, 37, 12, tzinfo=UTC)

    assert iso_z(t) == "2026-08-15T14:37:12Z"
    assert iso_z(synoptic_floor(t)) == "2026-08-15T12:00:00Z", "14:37Z floors to 12Z"
    assert btk_key("al", 9, 2026, t) == "AL092026_2026081512"

    # Floor, not round: 17:59Z belongs to 12Z, and 18:00Z is the first instant of 18Z.
    assert synoptic_floor(t.replace(hour=17, minute=59)).hour == 12
    assert synoptic_floor(t.replace(hour=18, minute=0)).hour == 18
    assert synoptic_floor(t.replace(hour=0, minute=1)).hour == 0

    # A naive local-time reading of an EIA period is the highest-cost bug in Cluster 4.
    assert eia_period_to_observed_at("2026-08-15T14") == dt.datetime(
        2026, 8, 15, 14, tzinfo=UTC
    )

    # All three Kalshi price representations resolve to the same 3 cents.
    assert kalshi_price_cents({"last_price": 3}) == (3, "cents")
    assert kalshi_price_cents({"last_price_dollars": "0.0300"}) == (3, "dollars_string")
    assert kalshi_price_cents({"last_price_fp": str(3 * 10**7 // 100)}) == (3, "fixed_point")

    # Missing is not zero.
    assert kalshi_price_cents({}) == (None, "absent")
    assert kalshi_price_cents({"last_price": 0}) == (0, "cents")

    rec = eia_record(
        {"period": "2026-08-15T14", "respondent": "FLA", "type": "D", "value": 31240},
        "AL", 9, 2026,
    )
    assert rec["btk_key"] == "AL092026_2026081512"
    assert rec["ok"] and rec["value"] == 31240.0

    null_rec = eia_record({"period": "2026-08-15T14", "value": None}, "AL", 9, 2026)
    assert null_rec["ok"] is False and null_rec["value"] is None

    print("alpha_timestamps: all assertions passed")
