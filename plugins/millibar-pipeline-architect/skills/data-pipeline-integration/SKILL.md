---
name: data-pipeline-integration
description: Implement, connect, and parse meteorological, satellite, and oceanographic data feeds. Use when working with GOES ABI/GLM on AWS Open Data, NASA GIBS tiles, NOAA NODD SNS notifications, NHC/ATCF decks, recon HDOB/VDM, ECMWF open data, GribStream, THREDDS/OPeNDAP, CMEMS, CIMSS, NDBC buoys, Kalshi markets, ADS-B recon tracking, or the EIA API — and when the output is Terraform, Serverless Framework config, an AWS CLI statement, an API request payload, GRIB2/NetCDF4/GeoJSON/HDOB parsing code, or a service-worker cache-invalidation strategy.
---

# Meteorological Data Pipeline Integration

Reference implementation guidance for the four Resource Master List clusters. Every
integration produced under this skill is actionable as written: complete IaC, complete
payloads, complete Python.

## Before anything deploys

**Baseline pre-requisite.** These pipelines deploy only AFTER the historical calibration
loop baseline is published. In this repo the gate is a published baseline in
`docs/data/calibration.json`, produced by `node scripts/calibrate.mjs`. A live ingestion
pipeline feeding an unscored board publishes probabilities nobody can grade — which is the
one failure this project exists to prevent. State this gate on the first substantive
answer of a session.

Run `/millibar:preflight` to check the gate and the anonymous-S3 path before building.

## The four clusters

| # | Cluster | Members | Transport | Auth |
|---|---------|---------|-----------|------|
| 1 | Primary Satellite Imagery | AWS Open Data (GOES), NASA GIBS | S3 (unsigned), WMTS/HTTPS | none |
| 2 | Meteorological Model Feeds | NHC, TSR, ECMWF, GribStream | HTTPS, S3 (unsigned), REST | GribStream key only |
| 3 | Marine Thermodynamics | THREDDS, CMEMS, CIMSS, NDBC | OPeNDAP, toolbox, HTTPS | CMEMS account only |
| 4 | Alternative Alpha Signals | Kalshi, ADS-B Recon, EIA | REST | EIA key only |

Always name the cluster before emitting code. Detail per cluster:

- `references/cluster-1-satellite-imagery.md`
- `references/cluster-2-model-feeds.md`
- `references/cluster-3-marine-thermodynamics.md`
- `references/cluster-4-alpha-signals.md`
- `references/event-driven-ingest.md` — NODD SNS → SQS → worker → `sw.js`
- `references/serialization-parsing.md` — GRIB2, NetCDF4, GeoJSON, ASCII/HDOB
- `references/resource-master-list.md` — the canonical index

## Five hard rules

### 1. Anonymous access to public NOAA buckets

`s3://noaa-goes19/`, `s3://noaa-goes18/`, `s3://noaa-gfs-bdp-pds/` and the rest of the
NOAA Open Data estate are public and **must** be reached unsigned. A signed request from a
role without a trust path returns `403 AccessDenied`, which is indistinguishable from a
missing key and will send you debugging the wrong layer.

```bash
aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/2026/227/18/ --no-sign-request --region us-east-1
```

```python
import boto3
from botocore import UNSIGNED
from botocore.config import Config

s3 = boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))
```

```python
import s3fs, xarray as xr

fs = s3fs.S3FileSystem(anon=True)
ds = xr.open_dataset(fs.open("s3://noaa-goes19/ABI-L2-CMIPF/2026/227/18/OR_ABI-L2-CMIPF-M6C13_G19_s20262271800205_e20262271809524_c20262271810004.nc"))
```

### 2. Event-driven, never polling

NOAA NODD publishes an SNS notification on every new object. Subscribe SQS to the topic,
drive the worker off the queue. See `references/event-driven-ingest.md` and
`assets/terraform/nodd-goes-ingest.tf`.

```
arn:aws:sns:us-east-1:123901341784:NewGOES19Object
arn:aws:sns:us-east-1:123901341784:NewGOES18Object
```

A `while True: list_objects_v2(...)` loop against GOES is a defect: full-disk lands every
10 minutes, so a 60-second poll makes ~9 wasted LIST calls per useful object and still
adds up to 60 s of latency to the one that matters.

### 3. Filter GRIB at the proxy, transform locally second

A single GFS 0.25° cycle file is ~500 MB. Pulling it to extract 2-metre temperature at one
point is the most common memory failure in this stack. In descending order of preference:

1. **GribStream** — JSON/CSV middleware, returns only the variables and coordinates asked for.
2. **NOMADS `filter_gfs_0p25.pl`** — server-side subset by variable and lat/lon box.
3. **`.idx` byte-range** against `s3://noaa-gfs-bdp-pds/` — fetch only the message bytes.
4. **`cfgrib`/`xarray` locally** — last, on the already-reduced payload.

### 4. Parse with domain toolkits

`tropycal` for recon and track data, `xarray`+`cfgrib` for GRIB2, `xarray` for NetCDF4,
`shapely`/`geopandas` for GeoJSON. Hand-rolled fixed-width parsers only when nothing
covers the product, and then written against a captured live sample —
see `scripts/lib/recon.mjs` in this repo for the standard: fields whose meaning is not
established from evidence are captured verbatim and given no meaning.

### 5. Alpha signals carry the correlation triple

Kalshi and EIA records join to NHC best track only if they carry:

```json
{
  "observed_at": "2026-08-15T14:37:12Z",
  "synoptic_time": "2026-08-15T12:00:00Z",
  "btk_key": "AL092026_2026081512"
}
```

`observed_at` is the true event time in ISO 8601 UTC with a `Z` suffix. `synoptic_time` is
that instant floored to the ATCF 6-hourly slot (00/06/12/18Z). `btk_key` is
`{BASIN}{CYCLONE_NO}{YEAR}_{YYYYMMDDHH}`, matching the b-deck row it correlates against.
Implementation: `assets/python/alpha_timestamps.py`.

## Honesty contract

This repo wraps every feed independently. A failure records `{ok: false, status, note}`
and the value stays `null`; the UI then shows `NO FEED`. Carry that forward into
everything built here: no synthesized fallback values, no silent substitution of a stale
reading for a current one, no cached same-origin response that would make a stale board
look live.
