# Cluster 2 — Meteorological Model Feeds

NHC, TSR, ECMWF, GribStream. Everything here except GribStream is anonymous.

## NHC / ATCF

Already wired in this repo (`scripts/ingest.mjs`, `scripts/lib/atcf.mjs`) — extend those
rather than adding a second reader.

| Product | URL | Cadence |
|---|---|---|
| Active storms | `https://www.nhc.noaa.gov/CurrentStorms.json` | ~5 min |
| Best track (b-deck) | `https://ftp.nhc.noaa.gov/atcf/btk/b{bb}{nn}{yyyy}.dat` | 6 h |
| Guidance (a-deck) | `https://ftp.nhc.noaa.gov/atcf/aid_public/a{bb}{nn}{yyyy}.dat.gz` | 6 h |
| Fixes (f-deck) | `https://ftp.nhc.noaa.gov/atcf/fix/f{bb}{nn}{yyyy}.dat` | irregular |
| SHIPS/LGEM text | `https://ftp.nhc.noaa.gov/atcf/stext/` | 6 h |
| Advisory RSS | `https://www.nhc.noaa.gov/index-at.xml` / `index-ep.xml` | per advisory |
| Tropical Weather Outlook | `https://api.weather.gov/products/types/TWO/locations/NHC` | 6 h |
| HURDAT2 archive | `https://www.nhc.noaa.gov/data/hurdat/` | seasonal |

`{bb}` is the basin (`al`, `ep`, `cp`), `{nn}` the two-digit cyclone number, `{yyyy}` the
year. `AL092026` → `bal092026.dat`.

### b-deck row anatomy

Comma-delimited, space-padded. The fields that matter for correlation:

```
AL, 09, 2026081512,   , BEST,   0, 244N,  712W,  85,  966, HU, ...
 |   |       |                     |      |     |    |    |
 |   |       |                     |      |     |    |    +-- storm type (TD/TS/HU/EX/LO)
 |   |       |                     |      |     |    +------- MSLP, mb
 |   |       |                     |      |     +------------ Vmax, kt (1-min sustained)
 |   |       |                     |      +------------------ longitude, tenths of deg
 |   |       |                     +------------------------- latitude, tenths of deg
 |   |       +----------------------------------------------- YYYYMMDDHH, UTC, 6-hourly
 |   +------------------------------------------------------- cyclone number
 +----------------------------------------------------------- basin
```

The `YYYYMMDDHH` field is the **synoptic time** every alpha signal correlates against —
see `cluster-4-alpha-signals.md`.

Parse with `tropycal.tracks`, or reuse `scripts/lib/atcf.mjs`. Do not write a third parser.

```python
import tropycal.tracks as tracks

basin = tracks.TrackDataset(basin="north_atlantic", source="ibtracs", include_btk=True)
storm = basin.get_storm(("fausto", 2026))
df = storm.to_dataframe()            # time, lat, lon, vmax, mslp, type
```

## TSR (Tropical Storm Risk)

Seasonal forecasts only — December, April, May/June, July, August updates. **No API**: the
products are HTML and PDF at `https://www.tropicalstormrisk.com/`.

Treat TSR as a low-frequency scalar prior, not a feed:

- Fetch at most once per day, on a schedule, never on a request path.
- Cache the extracted numbers with the issue date attached; a TSR figure without its issue
  date is unusable, because the same page is revised in place.
- If extraction fails, record `{ok: false, status, note}` and leave the prior `null`. A
  stale seasonal number silently reused as current is worse than no prior at all.

## ECMWF open data

```
https://data.ecmwf.int/forecasts/{YYYYMMDD}/{HH}z/ifs/0p25/oper/{YYYYMMDD}{HH}0000-{step}h-oper-fc.grib2
```

- Runs: `00`, `06`, `12`, `18` UTC. `oper` = deterministic HRES; `enfo` = ensemble;
  `aifs-single` = the ML model.
- Every GRIB has a sibling `.index` file — newline-delimited JSON, one record per GRIB
  message, carrying `param`, `levtype`, `levelist`, `step`, `_offset` and `_length`.
  **Read the index and byte-range only the messages you need.** That is rule 2 of the
  lifecycle, applied to a feed with no proxy in front of it.
- Mirror: `s3://ecmwf-forecasts/` in `eu-central-1`, anonymous.
- Licence CC-BY-4.0 — attribution is required on anything published downstream.

```bash
# Enumerate one run's index, then pull just 10 m u-wind at step 24.
curl -s "https://data.ecmwf.int/forecasts/20260815/12z/ifs/0p25/oper/20260815120000-24h-oper-fc.index" \
  | python3 -c 'import json,sys; [print(r["param"], r["levtype"], r["_offset"], r["_length"]) for r in map(json.loads, sys.stdin) if r["param"]=="10u"]'
```

Python client:

```python
from ecmwf.opendata import Client

client = Client(source="ecmwf")          # or source="azure" / "aws"
client.retrieve(
    date=-1, time=12, step=[0, 6, 12, 24], stream="oper", type="fc",
    param=["10u", "10v", "msl"], target="ecmwf-hres.grib2",
)
```

## GribStream — the GRIB proxy

The whole point of this integration: **filter server-side, transform locally second.**
A GFS 0.25° cycle file is roughly half a gigabyte; extracting one variable at one point
from a local copy is the most common memory failure in this stack.

Base URL and routes are isolated in one constant so a vendor route change is a one-line
edit. Confirm the route and body schema against the current GribStream docs before first
deploy — the client below is written so that check touches nothing else.

```python
import os
from typing import Any

import requests

GRIBSTREAM_BASE = "https://gribstream.com/api/v2"
ROUTES = {"gfs": "/gfs/history", "hrrr": "/hrrr/history", "nbm": "/nbm/history"}


def gribstream_point_series(
    model: str,
    lat: float,
    lon: float,
    from_time: str,
    until_time: str,
    variables: list[dict[str, str]],
    api_key: str | None = None,
    timeout: int = 60,
) -> list[dict[str, Any]]:
    """Pull a point time series with the filtering done at the proxy.

    variables: e.g. [{"name": "UGRD", "level": "10 m above ground"},
                     {"name": "VGRD", "level": "10 m above ground"},
                     {"name": "PRMSL", "level": "mean sea level"}]
    """
    key = api_key or os.environ["GRIBSTREAM_API_KEY"]
    resp = requests.post(
        GRIBSTREAM_BASE + ROUTES[model],
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={
            "fromTime": from_time,          # ISO 8601 Z
            "untilTime": until_time,        # ISO 8601 Z
            "coordinates": [{"lat": lat, "lon": lon}],
            "variables": variables,
        },
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()
```

### If GribStream is unavailable: NOMADS server-side subset

Same principle, different server. Already used by `scripts/fetch-wind.mjs`.

```bash
curl -sG "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl" \
  --data-urlencode "file=gfs.t12z.pgrb2.0p25.f024" \
  --data-urlencode "lev_10_m_above_ground=on" \
  --data-urlencode "var_UGRD=on" \
  --data-urlencode "var_VGRD=on" \
  --data-urlencode "subregion=" \
  --data-urlencode "leftlon=-90" --data-urlencode "rightlon=-60" \
  --data-urlencode "toplat=35"  --data-urlencode "bottomlat=10" \
  --data-urlencode "dir=/gfs.20260815/12/atmos" \
  -o gfs-wind-f024.grib2
```

### If NOMADS is rate-limited: `.idx` byte-range on S3

`s3://noaa-gfs-bdp-pds/` is anonymous and every GRIB carries a `.idx` sidecar listing
`recordnum:byteoffset:date:param:level:forecast`. Read the sidecar, compute the byte range
for the messages you want, and issue a ranged GET. This transfers kilobytes instead of
hundreds of megabytes and needs no credentials.

```bash
BASE=https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20260815/12/atmos/gfs.t12z.pgrb2.0p25.f024
curl -s "$BASE.idx" | grep -E ':(UGRD|VGRD):10 m above ground:'
# -> 512:284419502:d=2026081512:UGRD:10 m above ground:24 hour fcst:
# Then: curl -s -r 284419502-<next_offset-1> "$BASE" -o ugrd10m.grib2
```

## Failure modes

| Symptom | Cause |
|---|---|
| a-deck parse returns nothing | File is gzipped (`.dat.gz`); decompress first |
| Storm found in `CurrentStorms.json`, absent from `btk/` | b-deck lags the advisory; expected, record and move on |
| TSR number drifts with no new issue date | Page revised in place; key the cache on issue date |
| ECMWF 404 on a fresh run | Run not yet complete; runs publish by step, not atomically |
| GFS pull exhausts container memory | Full cycle downloaded — you skipped the proxy/subset step |
