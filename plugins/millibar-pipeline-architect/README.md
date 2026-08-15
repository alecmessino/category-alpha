# Millibar Pipeline Architect

A Claude Code plugin: architecture and deployment assistant for meteorological,
satellite, and oceanographic data pipelines.

It turns "I need SST under the storm" into a runnable OPeNDAP call, and "wire up GOES"
into a Terraform module that subscribes to NOAA NODD instead of polling S3. Every answer
is infrastructure-as-code, an API payload, or parsing logic — never a survey of options.

## Install

From this repo (it ships its own marketplace manifest):

```
/plugin marketplace add alecmessino/category-alpha
/plugin install millibar-pipeline-architect@category-alpha
```

Or, working locally in a clone:

```
/plugin marketplace add ./
/plugin install millibar-pipeline-architect@category-alpha
```

## What it knows: the Resource Master List

Four clusters. Every integration is categorized against exactly one of them; anything
else is flagged as an extension rather than silently absorbed.

| Cluster | Members |
|---|---|
| 1 — Primary Satellite Imagery | AWS Open Data (`s3://noaa-goes19/`, `s3://noaa-goes18/`), NASA GIBS |
| 2 — Meteorological Model Feeds | NHC, TSR, ECMWF, GribStream |
| 3 — Marine Thermodynamics | THREDDS, CMEMS, CIMSS, NDBC |
| 4 — Alternative Alpha Signals | Kalshi, ADS-B Recon, EIA |

Full index with endpoints, auth, cadence and format:
`skills/data-pipeline-integration/references/resource-master-list.md`.

## Usage

```
/millibar:resource-index              # the whole Master List
/millibar:resource-index 3            # one cluster, in detail
/millibar:resource-index ndbc         # one resource + its first real call
/millibar:preflight                   # deploy-gate checks before you build
/millibar:ingest-scaffold goes19 --iac terraform
```

The `pipeline-architect` agent engages automatically for pipeline work, and the
`data-pipeline-integration` skill loads whenever GOES, NODD, ATCF, GRIB2, OPeNDAP, NDBC,
Kalshi or EIA come up.

## The rules it enforces

**Anonymous access to public NOAA buckets.** Every CLI statement carries
`--no-sign-request`; every SDK client is unsigned. This is correctness, not style — a
signed request from a role with no trust path returns `403 AccessDenied`, which is
indistinguishable from a missing object and costs an afternoon.

**Event-driven ingestion.** NODD SNS (`arn:aws:sns:us-east-1:123901341784:NewGOES*`) →
SQS → worker → manifest → `sw.js`. GOES full disk lands every 10 minutes, so a 60-second
poll makes nine wasted LIST calls per useful object and still adds a minute of latency to
the one that matters.

**GRIB filtered at the proxy.** A GFS 0.25° cycle is ~500 MB. Filter at GribStream, or a
NOMADS `filter_*.pl` subset, or an `.idx` byte-range against `s3://noaa-gfs-bdp-pds/` —
then open locally with `cfgrib` on what survives.

**Domain toolkits over hand-rolled parsers.** `tropycal` for recon and tracks, `xarray`
for NetCDF4, `shapely` for GeoJSON. A bespoke fixed-width parser only when nothing covers
the product, and then written against a committed live sample.

**The correlation triple.** Kalshi and EIA records carry `observed_at`, `synoptic_time`
(floored to the ATCF 6-hourly slot) and `btk_key`, so they join directly against NHC
best track. Floored, never rounded — a market cannot have reacted to a fix that did not
exist yet.

**The deploy gate.** These pipelines ship only after the historical calibration loop
baseline is published (`docs/data/calibration.json`, via `node scripts/calibrate.mjs`).
The plugin says so on the first substantive answer of every session.

## Layout

```
.claude-plugin/plugin.json
agents/pipeline-architect.md                      the persona and its constraints
commands/{resource-index,preflight,ingest-scaffold}.md
skills/data-pipeline-integration/
  SKILL.md                                        entry point, five hard rules
  references/
    resource-master-list.md                       canonical index
    cluster-1-satellite-imagery.md                GOES buckets, GIBS WMTS
    cluster-2-model-feeds.md                      NHC/ATCF, TSR, ECMWF, GribStream
    cluster-3-marine-thermodynamics.md            THREDDS, CMEMS, CIMSS, NDBC
    cluster-4-alpha-signals.md                    Kalshi, ADS-B, EIA + the triple
    event-driven-ingest.md                        NODD SNS -> SQS -> worker -> sw.js
    serialization-parsing.md                      GRIB2, NetCDF4, GeoJSON, HDOB
    preflight-satellite-imagery.md                the Cluster 1 preflight, in full
  assets/
    terraform/nodd-goes-ingest.tf                 queue, DLQ, cross-account policy, filter
    serverless/serverless.yml                     same topology, Serverless Framework
    python/nodd_worker.py                         SQS handler, unsigned reads
    python/alpha_timestamps.py                    the correlation triple (self-testing)
    python/goes_latest.py                         backfill granule resolution
    worker/sw-tile-invalidation.js                additive docs/sw.js extension
    worker/manifest-listener.js                   page side of the chain
```

`python/alpha_timestamps.py` runs its own assertions:

```
python3 skills/data-pipeline-integration/assets/python/alpha_timestamps.py
```

## Relationship to this repo

The plugin is grounded in what `category-alpha` already does. It will tell you to extend
rather than duplicate: `scripts/ingest.mjs` and `scripts/lib/atcf.mjs` for NHC/ATCF,
`scripts/lib/recon.mjs` for VDM, `scripts/lib/ships.mjs` for SHIPS,
`scripts/fetch-wind.mjs` and `scripts/grib2.mjs` for GFS, `scripts/fetch-data.mjs` for
markets, `docs/sw.js` for tile caching.

It also carries this project's honesty contract into everything it generates: a failed
feed records `{ok: false, status, note}` and the value stays `null`. No synthesized
fallbacks, no stale value dressed as current.

## Verification status

The endpoints and formats here are grounded in this repo's working ingestion code where
it overlaps, and in public documentation elsewhere. Three things are worth confirming
against live sources before a first production deploy, and the plugin says so at the point
of use rather than burying it here:

- the exact NODD SNS topic names (NOAA adds them as satellites rotate into service)
- the GribStream route and request-body schema
- the Kalshi `_fp` fixed-point scale

Each is isolated in a single named constant so confirming it is a one-line change.
