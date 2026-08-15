# Cluster 1 — Primary Satellite Imagery

AWS Open Data (GOES) and NASA GIBS. Both are anonymous. Every S3 call carries
`--no-sign-request` or an unsigned SDK client.

## Bucket layout

```
s3://noaa-goes19/<Product>/<YYYY>/<DDD>/<HH>/OR_<Product>-M6C<NN>_G19_s<start>_e<end>_c<created>.nc
```

- `<DDD>` is **day of year**, zero-padded to 3 (`%j`), not day of month.
- `<HH>` is UTC hour.
- `s`/`e`/`c` timestamps are `YYYYDDDHHMMSSm` — 4-digit year, 3-digit DOY, then
  HHMMSS plus one tenth-second digit.
- `M6` is the ABI scan mode (mode 6 = 10-minute full disk, the operational default);
  `C<NN>` is the ABI band, `C13` being 10.3 µm clean longwave IR.

| Product prefix | Contents | Domain cadence |
|---|---|---|
| `ABI-L1b-RadF` | Radiances, full disk | 10 min |
| `ABI-L1b-RadC` | Radiances, CONUS | 5 min |
| `ABI-L1b-RadM1` / `RadM2` | Radiances, mesoscale sectors | 1 min |
| `ABI-L2-CMIPF` | Cloud & moisture imagery, single band | 10 min |
| `ABI-L2-MCMIPF` | Multiband cloud & moisture (16 bands, one file) | 10 min |
| `ABI-L2-ACHAF` | Cloud-top height | 10 min |
| `ABI-L2-DMWF` | Derived motion winds | 10 min |
| `GLM-L2-LCFA` | Lightning events / groups / flashes | 20 s |

Satellite assignment: **GOES-19 is operational GOES-East, GOES-18 is operational
GOES-West.** GOES-16 and GOES-17 remain readable as archives. Do not hardcode `G16` in a
filename pattern built today.

## Listing and fetching — AWS CLI

```bash
# What full-disk clean-IR slots exist for 2026 day 227, hour 18Z?
aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/2026/227/18/ \
  --no-sign-request --region us-east-1

# Narrow to one band without listing the whole hour.
aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/2026/227/18/OR_ABI-L2-CMIPF-M6C13 \
  --no-sign-request --region us-east-1

# Pull one granule.
aws s3 cp \
  s3://noaa-goes19/ABI-L2-CMIPF/2026/227/18/OR_ABI-L2-CMIPF-M6C13_G19_s20262271800205_e20262271809524_c20262271810004.nc \
  ./goes19-c13.nc --no-sign-request --region us-east-1

# GLM lightning for the same hour (20-second granules — expect ~180 objects).
aws s3 ls s3://noaa-goes19/GLM-L2-LCFA/2026/227/18/ \
  --no-sign-request --region us-east-1 --summarize
```

## Latest-granule resolution — Python

Runnable version: `assets/python/goes_latest.py`. The shape:

```python
import datetime as dt

import boto3
from botocore import UNSIGNED
from botocore.config import Config

BUCKET = "noaa-goes19"          # GOES-East. Use noaa-goes18 for GOES-West.
REGION = "us-east-1"

_s3 = boto3.client("s3", region_name=REGION, config=Config(signature_version=UNSIGNED))


def prefix_for(product: str, when: dt.datetime) -> str:
    """NODD key prefix. `when` must be UTC; DOY is zero-padded to 3."""
    when = when.astimezone(dt.timezone.utc)
    return f"{product}/{when:%Y}/{when.timetuple().tm_yday:03d}/{when:%H}/"
```

**Do not run a lister on a timer.** It exists for backfill and for resolving one historical
slot. Live ingestion is driven by the NODD SNS topics — see `event-driven-ingest.md`.

## Reading a granule without downloading it

```python
import s3fs
import xarray as xr

fs = s3fs.S3FileSystem(anon=True)          # the s3fs form of --no-sign-request
key = ("noaa-goes19/ABI-L2-CMIPF/2026/227/18/"
       "OR_ABI-L2-CMIPF-M6C13_G19_s20262271800205_e20262271809524_c20262271810004.nc")

with fs.open(key) as fh:
    ds = xr.open_dataset(fh, engine="h5netcdf")
    tb = ds["CMI"]                          # calibrated brightness temperature, kelvin
    print(tb.sizes, float(tb.min()), float(tb.max()))
```

The ABI grid is in fixed-grid scan angles (`x`, `y`, radians) on the GOES projection
described by `ds["goes_imager_projection"]`, not lat/lon. Reproject with `pyproj` using
that variable's `perspective_point_height`, `longitude_of_projection_origin`,
`semi_major_axis`, `semi_minor_axis` and `sweep_angle_axis` attributes — never assume a
sub-satellite longitude, because it changes when a satellite is repositioned.

## NASA GIBS

WMTS REST template:

```
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.{ext}
```

Axis order is `{z}/{y}/{x}` = `TileMatrix/TileRow/TileCol`. Swapping the last two returns
tiles from the wrong place rather than an error, which is why it is worth stating.

| Layer | Time dimension | Extension |
|---|---|---|
| `VIIRS_NOAA20_CorrectedReflectance_TrueColor` | `YYYY-MM-DD` (daily) | `.jpg` |
| `GOES-East_ABI_GeoColor` | `YYYY-MM-DDTHH:MM:SSZ` (10-minute) | `.png` |

**Resolve the TileMatrixSet and the valid time range from the capabilities document rather
than hardcoding them** — GIBS revises both, and a stale `GoogleMapsCompatible_LevelN`
returns 400s that look like an outage:

```bash
curl -s "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml" \
  | grep -A 12 "VIIRS_NOAA20_CorrectedReflectance_TrueColor"
```

GIBS sends `Access-Control-Allow-Origin: *`, which is what lets `docs/sw.js` re-issue tile
requests in `cors` mode and read a real status instead of an opaque response. Any new tile
host added to that worker must be checked for the same header first, or the cache silently
stores 404 pages as imagery — the exact bug called out in that file's header comment.

## Failure modes

| Symptom | Cause |
|---|---|
| `403 AccessDenied` on a public bucket | Signed request — missing `--no-sign-request` / `UNSIGNED` |
| Empty listing for the current hour | Slot has not landed yet; walk back one hour, do not retry-storm |
| Granule count ~10× expected | Listing a mesoscale product (1-minute cadence) as if full disk |
| Off-by-one at month boundaries | Used day-of-month instead of `%j` day-of-year |
| Tiles cached but blank | Opaque (`no-cors`) response cached without a readable status |
