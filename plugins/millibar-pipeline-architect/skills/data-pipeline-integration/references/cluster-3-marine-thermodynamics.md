# Cluster 3 — Marine Thermodynamics

THREDDS, CMEMS, CIMSS, NDBC. The ocean state under the storm: SST, ocean heat content,
shear and the observations that ground them.

CMEMS is the only member requiring credentials.

## THREDDS / OPeNDAP

The rule: **slice in the request, not after the download.** An OPeNDAP URL with an index
subscript transfers only the requested hyperslab. Opening the same dataset and slicing in
pandas after the fact transfers the global grid first, which is the failure this cluster
is most prone to.

NCEI OISST v2.1, daily 0.25° global SST:

```
https://www.ncei.noaa.gov/thredds/dodsC/OisstBase/NetCDF/V2.1/AVHRR/{YYYYMM}/oisst-avhrr-v02r01.{YYYYMMDD}.nc
```

```python
import xarray as xr

URL = ("https://www.ncei.noaa.gov/thredds/dodsC/OisstBase/NetCDF/V2.1/AVHRR/"
       "202608/oisst-avhrr-v02r01.20260815.nc")

# Lazy open: metadata only, no array bytes yet.
ds = xr.open_dataset(URL)

# OISST longitude is 0–360, not -180–180. A Caribbean box is 280–300, not -80 to -60.
box = ds["sst"].sel(lat=slice(10, 35), lon=slice(280, 300))

# .load() is the only line that moves data, and it moves the box, not the globe.
sst = box.load()
print(float(sst.mean()), "degC")
```

Catalog discovery (do this rather than guessing a filename for an older date):

```bash
curl -s "https://www.ncei.noaa.gov/thredds/catalog/OisstBase/NetCDF/V2.1/AVHRR/202608/catalog.xml" \
  | grep -o 'urlPath="[^"]*"' | head
```

NCEP RTOFS (ocean model, including subsurface temperature for OHC-style work) is on the
NOMADS DODS server:

```
https://nomads.ncep.noaa.gov/dods/rtofs
```

## CMEMS (Copernicus Marine Service)

Requires a free Copernicus Marine account. Credentials go in the environment, never in
code or IaC:

```bash
export COPERNICUSMARINE_SERVICE_USERNAME="..."
export COPERNICUSMARINE_SERVICE_PASSWORD="..."
# or, once, interactively:  copernicusmarine login
```

```python
import copernicusmarine

copernicusmarine.subset(
    dataset_id="cmems_mod_glo_phy_anfc_0.083deg_P1D-m",
    variables=["thetao", "so", "zos"],       # potential temperature, salinity, SSH
    minimum_longitude=-90.0,
    maximum_longitude=-60.0,
    minimum_latitude=10.0,
    maximum_latitude=35.0,
    minimum_depth=0.0,
    maximum_depth=200.0,                     # the layer that matters for cyclone heat flux
    start_datetime="2026-08-14T00:00:00",
    end_datetime="2026-08-15T00:00:00",
    output_filename="cmems-gulf-thermo.nc",
)
```

CMEMS longitudes are -180–180, the opposite convention to OISST. Normalize at the
boundary of your code, once, and assert it — a 180° error in an SST lookup produces a
plausible-looking wrong number, not a crash.

For a service, prefer `copernicusmarine.open_dataset(...)` which returns a lazy `xarray`
dataset over the same subset arguments, so nothing lands on disk.

## CIMSS (UW-Madison SSEC)

Real-time tropical products at `https://tropic.ssec.wisc.edu/real-time/`:

| Product | Path | Contents |
|---|---|---|
| ADT | `/real-time/adt/` | Advanced Dvorak Technique objective intensity |
| AMSU | `/real-time/amsu/` | Microwave sounder intensity estimates |
| MTPW2 | `/real-time/mtpw2/` | Morphed total precipitable water |
| ARCHER | `/real-time/archerOnline/` | Objective center fixing |

These are fixed-width ASCII wrapped in HTML, published per satellite pass rather than on a
clock. Consequences for the pipeline:

- Cadence is irregular. Age-check every record against its own embedded timestamp, not
  against fetch time.
- Column positions, not delimiters, carry meaning. Parse by slice, and derive the slices
  from a captured live sample committed to the repo as a fixture.
- Follow this repo's rule from `scripts/lib/recon.mjs`: a field whose definition is not
  established from evidence is captured verbatim and given no meaning. A wrong intensity
  looks exactly like a right one.

For the environmental diagnostics themselves (shear, MPI, OHC, RI thresholds) this repo
already reads NHC's SHIPS text at `https://ftp.nhc.noaa.gov/atcf/stext/` via
`scripts/lib/ships.mjs`. Use that before adding a CIMSS scraper.

## NDBC

```
https://www.ndbc.noaa.gov/data/realtime2/{STATION}.txt     standard meteorological, 45 days
https://www.ndbc.noaa.gov/data/realtime2/{STATION}.spec    spectral wave summary
https://www.ndbc.noaa.gov/data/realtime2/{STATION}.ocean   ocean data
https://www.ndbc.noaa.gov/activestations.xml               station inventory with lat/lon
```

Format: two header lines (names, then units), both `#`-prefixed, then whitespace-delimited
rows, **newest first**. Missing values are `MM`.

```
#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 08 15 14 50  120  8.0 10.0   1.8   7.1   5.4 115 1012.4  28.9  29.6  24.1   MM   MM    MM
```

```python
import io

import pandas as pd
import requests

def ndbc_realtime(station: str) -> pd.DataFrame:
    """Standard meteorological observations for one NDBC station, newest row first."""
    url = f"https://www.ndbc.noaa.gov/data/realtime2/{station.upper()}.txt"
    text = requests.get(url, timeout=30).text

    # Line 0 is column names, line 1 is units. Both begin with '#'.
    df = pd.read_csv(io.StringIO(text), sep=r"\s+", skiprows=[1], na_values=["MM"])
    df = df.rename(columns={"#YY": "YY"})

    df["observed_at"] = pd.to_datetime(
        df[["YY", "MM", "DD", "hh", "mm"]].astype(str).agg(
            lambda r: f"{r.YY}-{r.MM}-{r.DD}T{r.hh}:{r.mm}:00Z", axis=1
        ),
        utc=True, format="ISO8601",
    )
    return df
```

Two traps worth naming: the `MM` sentinel collides with the month column name `MM`, which
is why `na_values` is applied and the month is read as a plain integer; and station
timestamps are already UTC, so no local-zone conversion belongs anywhere in this path.

## Failure modes

| Symptom | Cause |
|---|---|
| OPeNDAP request hangs, then OOMs | Sliced after `.load()` instead of in `.sel()` |
| SST lookup returns land / NaN | 0–360 vs -180–180 longitude convention mismatch |
| CMEMS `401` in CI | Credentials not exported into the job environment |
| CIMSS columns shift by one | Parsed by delimiter instead of by fixed column slice |
| NDBC column all-NaN | `MM` not registered in `na_values` |
| Buoy reading looks current but is hours old | Age-checked against fetch time, not the row timestamp |
