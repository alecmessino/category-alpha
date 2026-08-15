# Structural Normalization — GRIB2, NetCDF4, GeoJSON, ASCII/HDOB

Lifecycle rule 5. Use the domain toolkit. A hand-rolled parser is a last resort, and when
it is unavoidable it is written against a captured live sample, not against recollection.

| Format | Toolkit | Never |
|---|---|---|
| GRIB2 | `xarray` + `cfgrib` (after proxy filtering) | `struct.unpack` on GRIB sections |
| NetCDF4 | `xarray` (`h5netcdf` / `netcdf4` engine) | manual HDF5 traversal |
| GeoJSON | `shapely` + `geopandas` | string-built geometry |
| ATCF a/b/f decks | `tropycal.tracks`, or `scripts/lib/atcf.mjs` | a third parser |
| HDOB / VDM / dropsonde | `tropycal.recon`, or `scripts/lib/recon.mjs` | regex over the whole message |
| Fixed-width CIMSS/SHIPS | column slices from a committed fixture | `split()` on whitespace |

## GRIB2

Order of operations is the whole game: **filter at the proxy, then open locally.**

```python
import xarray as xr

# Opened AFTER a GribStream / NOMADS / .idx byte-range reduction — never on a full cycle.
ds = xr.open_dataset(
    "gfs-wind-f024.grib2",
    engine="cfgrib",
    backend_kwargs={
        # cfgrib refuses a file whose messages span incompatible hypercubes. Selecting
        # the level type up front is what makes a mixed subset openable at all.
        "filter_by_keys": {"typeOfLevel": "heightAboveGround", "level": 10},
        "indexpath": "",          # do not litter .idx sidecars next to the input
    },
)
speed = (ds["u10"] ** 2 + ds["v10"] ** 2) ** 0.5
```

`cfgrib` needs ecCodes present (`conda install -c conda-forge eccodes`, or the
`eccodes` wheel). In Lambda, ship it as a layer — the pure-pip path routinely produces a
runtime that imports and then fails on the first message.

This repo also carries a dependency-free GRIB2 reader at `scripts/grib2.mjs` for the
Node path. Reuse it there rather than adding a Python step to a JS pipeline.

## NetCDF4

```python
import s3fs
import xarray as xr

fs = s3fs.S3FileSystem(anon=True)
with fs.open("noaa-goes19/ABI-L2-CMIPF/2026/227/18/OR_ABI-L2-CMIPF-M6C13_G19_s20262271800205_e20262271809524_c20262271810004.nc") as fh:
    ds = xr.open_dataset(fh, engine="h5netcdf")
```

Two habits that matter more than they look:

- **Subset before compute.** `ds["CMI"].sel(...)` then `.load()`. For OPeNDAP the slice is
  executed server-side; for S3 it avoids materializing a full-disk array in a 512 MB
  Lambda.
- **Read the scale factors from the file.** ABI L1b radiance carries `scale_factor` and
  `add_offset`; `xarray` applies them when `mask_and_scale=True` (the default). If you
  disable that for speed, you own the arithmetic — and a forgotten offset produces
  brightness temperatures that are wrong by a constant and look entirely plausible.

## GeoJSON

The publication format for tracks, cones and wind radii. Keep coordinate order right:
GeoJSON is `[longitude, latitude]`, the reverse of how every meteorological product quotes
a position.

```python
import json

from shapely.geometry import LineString, mapping

def track_to_geojson(fixes: list[dict], storm_id: str) -> dict:
    """fixes: [{'lat': 24.4, 'lon': -71.2, 'observed_at': '...Z', 'vmax_kt': 85}, ...]"""
    line = LineString([(f["lon"], f["lat"]) for f in fixes])   # lon first
    return {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": mapping(line),
            "properties": {
                "storm_id": storm_id,
                "observed_at": fixes[-1]["observed_at"],
                "vmax_kt": fixes[-1]["vmax_kt"],
            },
        }],
    }
```

NHC publishes its own GIS shapefiles and KML at `https://www.nhc.noaa.gov/gis/`. Prefer
converting those with `geopandas` over rebuilding a cone from advisory text — the cone
geometry is a defined product, and a reconstructed one is an approximation wearing the
same visual authority.

## ASCII / HDOB

High-density observations: one line per 30 seconds of flight, fixed-width, from the
`URNT15`/`URPN15` products and the NHC recon archive.

Use `tropycal.recon` rather than parsing by hand:

```python
from tropycal import recon

data = recon.ReconDataset(storm=("fausto", 2026))
hdobs = data.hdobs.to_dataframe()     # time, lat, lon, plane_p, sfmr_wspd, flight_wspd, ...
```

When no toolkit covers a product — as with the VDM, which `scripts/lib/recon.mjs` parses
directly — follow the standard set in that file:

1. **Establish fields from live samples**, and say in a comment which products they were
   read off.
2. **Capture unestablished fields verbatim and give them no meaning.** `scripts/lib/recon.mjs`
   does exactly this for VDM fields E, F and G, and refuses to decode RECCO-coded
   URNT11/URPN11 numbers at all — their arrival is recorded, their values are not.
3. **Self-check against a redundant statement in the message.** The VDM trailer restates
   maximum flight-level wind in plain words; when it disagrees with the lettered field,
   publish both and let the unambiguous one govern. A silent disagreement means the field
   letters have shifted underneath you.

The reason for all three: a wrong wind speed looks identical to a right one. Nothing
downstream — not the calibration loop, not a Brier score — can recover from a parser that
guesses.

## Cross-format normalization target

Everything ingested lands in one shape before it reaches the board:

```json
{
  "source": "noaa-goes19/ABI-L2-CMIPF",
  "cluster": 1,
  "ok": true,
  "status": 200,
  "observed_at": "2026-08-15T18:00:20Z",
  "synoptic_time": "2026-08-15T18:00:00Z",
  "btk_key": "AL092026_2026081518",
  "value": { "...": "product-specific payload" },
  "note": null
}
```

`ok: false` sets `value` to `null` and puts the reason in `note`. That is this repo's
honesty contract, and it is the reason a broken feed renders as `NO FEED` instead of as a
confident stale number.
