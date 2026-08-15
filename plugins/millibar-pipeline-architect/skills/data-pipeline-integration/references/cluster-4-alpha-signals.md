# Cluster 4 — Alternative Alpha Signals

Kalshi, ADS-B recon, EIA. These are the feeds that are not weather but move with it.

**Correlation rule (lifecycle rule 3): every record in this cluster carries the timestamp
triple.** Without it an alpha series cannot be joined to NHC best track, and an alpha
series that cannot be joined is decoration.

## The timestamp triple

```json
{
  "observed_at":   "2026-08-15T14:37:12Z",
  "synoptic_time": "2026-08-15T12:00:00Z",
  "btk_key":       "AL092026_2026081512"
}
```

| Field | Definition |
|---|---|
| `observed_at` | True event time, ISO 8601 UTC, `Z` suffix, second precision |
| `synoptic_time` | `observed_at` floored to the ATCF 6-hourly slot (00/06/12/18Z) |
| `btk_key` | `{BASIN}{CC}{YYYY}_{YYYYMMDDHH}` — joins one b-deck row exactly |

Floor, never round. Rounding to the nearest slot attributes a price printed at 14:37Z to
the 12Z fix in one direction and the 18Z fix in the other, so the same market moves
between storms depending on the minute. Flooring means the correlated fix is always one
that had already been published when the alpha event happened — which is the only version
that is causally honest.

Implementation: `assets/python/alpha_timestamps.py`.

```python
import datetime as dt

def synoptic_floor(when: dt.datetime) -> dt.datetime:
    """Floor a UTC instant to the ATCF 6-hourly synoptic slot."""
    when = when.astimezone(dt.timezone.utc)
    return when.replace(hour=(when.hour // 6) * 6, minute=0, second=0, microsecond=0)


def btk_key(basin: str, cyclone_no: int, year: int, when: dt.datetime) -> str:
    """ATCF b-deck join key, e.g. AL092026_2026081512."""
    return f"{basin.upper()}{cyclone_no:02d}{year}_{synoptic_floor(when):%Y%m%d%H}"
```

## Kalshi

Public read endpoints need no authentication. Trading requires RSA request signing, which
is out of scope for an ingestion pipeline.

```
https://api.elections.kalshi.com/trade-api/v2/markets
https://api.elections.kalshi.com/trade-api/v2/events
https://api.elections.kalshi.com/trade-api/v2/markets/{ticker}/orderbook?depth=6
```

`scripts/fetch-data.mjs` already implements host failover across
`api.elections.kalshi.com`, `api.kalshi.com` and `trading-api.kalshi.com`, series-scoped
collection, and order-book hydration. Extend it rather than starting over.

**Field migration is the live hazard here, and it has bitten this repo twice.** Kalshi has
moved price and size fields between representations:

- integer cents (`last_price`, `yes_bid`)
- dollar-denominated strings (`last_price_dollars: "0.0300"`)
- fixed-point strings suffixed `_fp` (`volume_fp`)

A reader that assumes one representation returns `0` for the others — silently, because
`0` is a legal price. Normalize defensively and record which representation was found:

```python
from decimal import Decimal

def kalshi_price_cents(market: dict) -> tuple[int | None, str]:
    """Return (cents, representation). None when the market genuinely carries no price.

    Never coerce a missing price to 0 — 0 is a legal Kalshi price and the two states
    must stay distinguishable downstream.
    """
    if (v := market.get("last_price")) is not None:
        return int(v), "cents"
    if (v := market.get("last_price_dollars")) is not None:
        return int(Decimal(str(v)) * 100), "dollars_string"
    if (v := market.get("last_price_fp")) is not None:
        return int(Decimal(str(v)) / Decimal(10**7) * 100), "fixed_point"
    return None, "absent"
```

Confirm the `_fp` scale against a live payload before trusting it — the exponent is the
one piece here that is worth re-deriving from data rather than assuming, and a wrong scale
produces a plausible price rather than an error.

Kalshi timestamps (`open_time`, `close_time`, `expiration_time`) are ISO 8601 UTC. Set
`observed_at` from the fetch instant for a quote and from `close_time` for a resolution.

## ADS-B recon

Aircraft position is a **leading indicator of the recon message**, not a substitute for
it. A NOAA WP-3D or a 53rd WRS C-130 turning toward a storm is visible on ADS-B an hour or
more before the VDM it will produce hits TGFTP — and that gap is the entire reason to
carry this feed.

Community aggregators, anonymous, roughly 1 request/second:

```
https://api.adsb.lol/v2/callsign/{CALLSIGN}
https://opendata.adsb.fi/api/v2/callsign/{CALLSIGN}
```

Identify by callsign pattern, not by hardcoded ICAO hex:

```python
import re

RECON_CALLSIGN = re.compile(r"^(NOAA4[239]|TEAL\d{2}|AF\d{3})$")
```

`NOAA42`/`NOAA43` are the WP-3D Orions, `NOAA49` the G-IV, `TEAL##` the Air Force Reserve
53rd WRS. Resolve hex codes from the live feed and cache them with a TTL — do not commit a
hex table, because tail-to-hex mappings change and a stale hex silently tracks nothing.

Pair every ADS-B hit with the measurement it anticipates. The authoritative recon products
are the ones this repo already polls at
`https://tgftp.nws.noaa.gov/data/raw/ur/` (URNT12/URPN12 vortex data messages,
URNT11/URPN11 RECCO), parsed by `scripts/lib/recon.mjs`. For HDOB and dropsonde in Python,
use the domain toolkit rather than a hand-rolled parser:

```python
from tropycal import recon

data = recon.ReconDataset(storm=("fausto", 2026))
hdobs = data.hdobs.to_dataframe()        # 30-second high-density observations
drops = data.dropsondes.to_dataframe()
vdms  = data.vdms.to_dataframe()
```

Note the honesty boundary this repo enforces: RECCO-coded URNT11/URPN11 products have
their **arrival recorded but their numbers left undecoded**, because the field definitions
were not established from evidence. Preserve that. An undecoded arrival is information; a
guessed decode is a fabrication that looks like a reading.

## EIA v2

Requires a free API key (`https://www.eia.gov/opendata/`). Key in the environment.

```
https://api.eia.gov/v2/{route}/data/
```

| Route | Contents | Frequency |
|---|---|---|
| `electricity/rto/region-data` | Demand / generation by balancing authority | hourly |
| `electricity/rto/daily-region-data` | Same, daily rollup | daily |
| `natural-gas/stor/wkly` | Working gas in underground storage | weekly |

```python
import os

import requests

def eia_hourly_demand(respondent: str, start: str, end: str) -> list[dict]:
    """Hourly demand for one balancing authority. `start`/`end` are 'YYYY-MM-DDTHH'.

    Landfall-exposed BAs worth carrying: FLA, FPL, TEC, SOCO, DUK, CPLE, MISO, ERCO.
    """
    resp = requests.get(
        "https://api.eia.gov/v2/electricity/rto/region-data/data/",
        params={
            "api_key": os.environ["EIA_API_KEY"],
            "frequency": "hourly",
            "data[0]": "value",
            "facets[respondent][]": respondent,
            "facets[type][]": "D",                    # D = demand
            "start": start,
            "end": end,
            "sort[0][column]": "period",
            "sort[0][direction]": "desc",
            "length": 5000,
        },
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["response"]["data"]
```

**The EIA `period` field for hourly RTO series is UTC hour-ending, formatted
`YYYY-MM-DDTHH` with no zone suffix.** It is not local time and it is not hour-beginning.
Convert explicitly on ingest — never let a naive string reach the correlation layer:

```python
import datetime as dt

def eia_period_to_observed_at(period: str) -> dt.datetime:
    """'2026-08-15T14' (UTC, hour-ending) -> tz-aware UTC datetime."""
    return dt.datetime.strptime(period, "%Y-%m-%dT%H").replace(tzinfo=dt.timezone.utc)
```

A demand series shifted by four hours against a landfall time correlates against the wrong
fix and will read as a real signal. This conversion is the single highest-value assertion
in the cluster; test it against a known landfall before trusting any result built on it.

## Failure modes

| Symptom | Cause |
|---|---|
| Kalshi prices all `0` | Field representation migrated; reader assumed one form |
| Contract count silently drops | Hard `slice()` cap on a growing market list — cap must be a guard, logged, never a silent trim |
| Alpha series correlates to the wrong fix | Synoptic time rounded instead of floored |
| EIA demand leads/lags the storm by hours | `period` treated as local or hour-beginning |
| ADS-B returns nothing for a flying aircraft | Hardcoded stale ICAO hex instead of callsign match |
| Recon numbers appear from RECCO products | Guessed field decode — record arrival only |
