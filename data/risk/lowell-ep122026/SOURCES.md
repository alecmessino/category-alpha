# EP122026 Lowell — archived source products

Every byte the published record at `/risk/lowell-2026/` rests on. The build reads this
directory and nothing else except the shared coastline primitive; the set is enumerated by
`scripts/risk/tec.py::declared_inputs()` and hashed into the record's own source register.

## What is here

| Prefix | Product | Count |
|---|---|---|
| `TCMCP4.*` | Forecast/Advisory (TCM) — positions, intensities, quadrant wind radii, forecast rows | 22 |
| `TCPCP4.*` | Public Advisory (TCP) — including intermediates and corrections | 36 |
| `TCDCP4.*` | Tropical Cyclone Discussion (TCD) — **the labelled forecast table** | 23 |
| `TCAPA4.*` | ICAO aviation advisory (TCA) — NHC's own interpolated positions | 21 |
| `PWSCP4.*` | Wind Speed Probabilities, Advisory 46 | 1 |
| `aep122026.dat` | ATCF a-deck; the CARQ records are the operational working best track | 1 |

Filenames carry the WMO transmission time to the minute (`TCMCP4.202609071451.txt` went out
07 Sep 14:51Z). That is the transmission time, not the nominal hour and not the valid time,
and the three are never substituted for one another.

## Why the discussions are archived

They are the only product that prints the forecast table **with its lead labels attached**:

```
INIT  07/1500Z 17.5N 162.6W  100 KT
 12H  08/0000Z 19.5N 161.7W   95 KT
```

That single pair is the documentary proof of the time model. `08/0000Z` is +12 h from the 12Z
nominal cycle and +9 h from the 15Z initial position, and NHC labels it 12H — so the lead
origin is the cycle. A module reading only the TCM, which prints no labels, cannot see this;
that is how the retired 0.0 nm along-track residual survived. `reconcile_lead_labels` checks
both hypotheses on every discussion here and requires the cycle origin to hold while the
initial-position origin fails.

## Coastline geometry is NOT here

Coastline distances use `data/genesis-archive/coastlines/hawaii.geojson`, the shared
repository primitive, with islands selected by `properties.name`. Its provenance — source
URL, SHA-256, byte count, licence and retrieval time — is in that directory's `SOURCES.json`,
which also records that Natural Earth's `ne_10m_land` was inspected, rejected as the geometry
source because it carries no name fields, and retained as a fidelity control matching to
1.1e-13 deg.

The Rev 3 hand-off shipped its own `hawaii_land.geojson` instead: eight unnamed rings, absent
from its own manifest's source register, with islands picked out by guessing at a centroid
longitude, alongside a manifest entry for a `ne_10m_land.geojson` that was never shipped and
that the build never read for geometry. That file is not imported. The substitution was
verified rather than assumed: every published coastline distance is identical under both
geometries, and two closest-approach *timestamps* (advisories 39 and 45) move by one 15-minute
sampling step on a minimum that is flat to 0.002 nm across those samples. The width of that
tie is now carried in the manifest as `niihau_time_tie_window_min` so it cannot move again
unnoticed.

## Licence

NOAA/NWS products are works of the United States Government and are not subject to copyright.
Natural Earth is public domain; see the coastline register for its terms.
