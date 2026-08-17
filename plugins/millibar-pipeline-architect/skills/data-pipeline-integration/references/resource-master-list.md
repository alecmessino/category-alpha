# Resource Master List

The canonical index. Every integration is categorized against exactly one of these four
clusters. Anything not listed here is an **extension** to the Master List — say so
explicitly rather than expanding a cluster silently.

Legend: **A** = anonymous / no credential, **K** = API key, **U** = username+password.

---

## Cluster 1 — Primary Satellite Imagery

| Resource | Endpoint | Auth | Cadence | Format |
|---|---|---|---|---|
| GOES-19 (GOES-East) | `s3://noaa-goes19/` (us-east-1) | A | 10 min FD / 5 min CONUS / 1 min meso | NetCDF4 |
| GOES-18 (GOES-West) | `s3://noaa-goes18/` (us-east-1) | A | same | NetCDF4 |
| GOES-16 / GOES-17 archive | `s3://noaa-goes16/`, `s3://noaa-goes17/` | A | historical | NetCDF4 |
| Himawari-9 | `s3://noaa-himawari9/` | A | 10 min FD | NetCDF4 / HSD |
| NASA GIBS WMTS | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/` | A | layer-dependent | PNG / JPEG tiles |
| GIBS capabilities | `.../best/1.0.0/WMTSCapabilities.xml` | A | — | XML |

Detail: `cluster-1-satellite-imagery.md`

---

## Cluster 2 — Meteorological Model Feeds

| Resource | Endpoint | Auth | Cadence | Format |
|---|---|---|---|---|
| NHC active storms | `https://www.nhc.noaa.gov/CurrentStorms.json` | A | ~5 min | JSON |
| NHC best track (b-deck) | `https://ftp.nhc.noaa.gov/atcf/btk/b{bb}{nn}{yyyy}.dat` | A | 6 h | ATCF ASCII |
| NHC guidance (a-deck) | `https://ftp.nhc.noaa.gov/atcf/aid_public/a{bb}{nn}{yyyy}.dat.gz` | A | 6 h | ATCF ASCII (gz) |
| NHC fixes (f-deck) | `https://ftp.nhc.noaa.gov/atcf/fix/f{bb}{nn}{yyyy}.dat` | A | irregular | ATCF ASCII |
| NHC SHIPS text | `https://ftp.nhc.noaa.gov/atcf/stext/` | A | 6 h | fixed-width ASCII |
| NHC advisory RSS | `https://www.nhc.noaa.gov/index-at.xml`, `index-ep.xml` | A | per advisory | RSS/XML |
| Tropical Weather Outlook | `https://api.weather.gov/products/types/TWO/locations/NHC` | A | 6 h | JSON + text |
| TSR seasonal forecast | `https://www.tropicalstormrisk.com/` | A | monthly (Dec–Aug) | HTML / PDF |
| ECMWF open data | `https://data.ecmwf.int/forecasts/{YYYYMMDD}/{HH}z/ifs/0p25/oper/` | A | 4×/day | GRIB2 + `.index` |
| ECMWF on AWS | `s3://ecmwf-forecasts/` (eu-central-1) | A | 4×/day | GRIB2 |
| GFS on AWS | `s3://noaa-gfs-bdp-pds/gfs.{YYYYMMDD}/{HH}/atmos/` | A | 4×/day | GRIB2 + `.idx` |
| NOMADS GRIB filter | `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl` | A | 4×/day | GRIB2 subset |
| GribStream | `https://gribstream.com/api/v2/` | K | on demand | JSON / CSV |

Detail: `cluster-2-model-feeds.md`

---

## Cluster 3 — Marine Thermodynamics

| Resource | Endpoint | Auth | Cadence | Format |
|---|---|---|---|---|
| NCEI OISST v2.1 (THREDDS) | `https://www.ncei.noaa.gov/thredds/dodsC/OisstBase/NetCDF/V2.1/AVHRR/{YYYYMM}/oisst-avhrr-v02r01.{YYYYMMDD}.nc` | A | daily | OPeNDAP / NetCDF4 |
| NCEI THREDDS catalog | `https://www.ncei.noaa.gov/thredds/catalog/` | A | — | XML / HTML |
| NCEP RTOFS (NOMADS DODS) | `https://nomads.ncep.noaa.gov/dods/rtofs` | A | daily | OPeNDAP |
| CMEMS global physics | `copernicusmarine` toolbox, `cmems_mod_glo_phy_anfc_0.083deg_P1D-m` | U | daily | NetCDF4 / Zarr |
| CIMSS ADT | `https://tropic.ssec.wisc.edu/real-time/adt/` | A | per pass | fixed-width ASCII |
| CIMSS AMSU / MTPW2 | `https://tropic.ssec.wisc.edu/real-time/` | A | per pass | ASCII / imagery |
| NDBC realtime standard met | `https://www.ndbc.noaa.gov/data/realtime2/{STATION}.txt` | A | 10–60 min | whitespace ASCII |
| NDBC spectral wave | `https://www.ndbc.noaa.gov/data/realtime2/{STATION}.spec` | A | hourly | whitespace ASCII |
| NDBC station inventory | `https://www.ndbc.noaa.gov/activestations.xml` | A | daily | XML |

Detail: `cluster-3-marine-thermodynamics.md`

---

## Cluster 4 — Alternative Alpha Signals

| Resource | Endpoint | Auth | Cadence | Format |
|---|---|---|---|---|
| Kalshi markets | `https://api.elections.kalshi.com/trade-api/v2/markets` | A (read) | real time | JSON |
| Kalshi events | `.../trade-api/v2/events` | A (read) | real time | JSON |
| Kalshi order book | `.../trade-api/v2/markets/{ticker}/orderbook?depth=6` | A (read) | real time | JSON |
| ADS-B (adsb.lol) | `https://api.adsb.lol/v2/callsign/{CALLSIGN}` | A | ~1 s | JSON |
| ADS-B (adsb.fi) | `https://opendata.adsb.fi/api/v2/callsign/{CALLSIGN}` | A | ~1 s | JSON |
| Recon VDM / HDOB | `https://tgftp.nws.noaa.gov/data/raw/ur/urnt12.knhc..txt` | A | per fix | ASCII / HDOB |
| EIA v2 | `https://api.eia.gov/v2/{route}/data/` | K | hourly–weekly | JSON |

Detail: `cluster-4-alpha-signals.md`

---

## Already wired in this repo

Do not rebuild these — extend them. Sources currently read by `scripts/`:

| Source | Consumer |
|---|---|
| `https://www.nhc.noaa.gov/CurrentStorms.json` | `scripts/fetch-data.mjs` |
| `https://ftp.nhc.noaa.gov/atcf/{btk,aid_public,fix,stext}/` | `scripts/ingest.mjs`, `scripts/lib/atcf.mjs` |
| `https://tgftp.nws.noaa.gov/data/raw/ur/urnt12/urpn12/urnt11/urpn11` | `scripts/ingest.mjs`, `scripts/lib/recon.mjs` |
| `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl` | `scripts/fetch-wind.mjs`, `scripts/grib2.mjs` |
| `s3://noaa-gfs-bdp-pds/` (via HTTPS) | `scripts/fetch-wind.mjs` |
| Kalshi + Polymarket | `scripts/fetch-data.mjs` |
| CPC ONI (`oni.ascii.txt`) | `scripts/fetch-data.mjs` |
| NASA GIBS VIIRS/NOAA-20 tiles | `docs/app/map.jsx`, cached by `docs/sw.js` |
