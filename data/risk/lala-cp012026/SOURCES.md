# CP012026 Lala — archived source products

Every byte the published record at `/risk/lala-2026/` rests on. The build reads this
directory and nothing else except the shared coastline primitive; the set is enumerated by
`scripts/risk/tec.py::declared_inputs()` and hashed into the record's own source register.

## What is here

| Prefix | Product | Count |
|---|---|---|
| `TCMCP2.advNNN.txt` | Forecast/Advisory (TCM) — positions, intensities, quadrant wind radii, forecast rows | 64 |
| `TCPCP2.advNNN[a].txt` | Public Advisory (TCP) — 64 scheduled, 27 intermediates (`a` suffix) | 91 |
| `TCDCP2.advNNN.txt` | Tropical Cyclone Discussion (TCD) — **the labelled forecast table** | 64 |
| `PWSCP2.advNNN.txt` | Wind Speed Probabilities (PWS) | 64 |
| `TCUCP2.MMDDHHMM.txt` | Tropical Cyclone Update (TCU) — off-schedule position and wind statements | 11 |
| `acp012026.dat` | ATCF a-deck; the CARQ records are the operational working best track | 1 |

The WMO PIL is **CP2** — CPHC's second slot of the 2026 season — while the ATCF identifier is
**CP012026**. The two numbering systems are not the same and neither is derived from the
other. Filenames carry the PIL taken from each product's own `ZCZC` header rather than from
the URL it was fetched from, and the advisory number the product prints for itself.

Retrieved from the NHC public product archive, `https://www.nhc.noaa.gov/archive/2026/cp01/`,
one file per product (`cp012026.fstadv.001.shtml`, `.public.001.shtml`, `.public_a.005.shtml`,
`.discus.001.shtml`, `.wndprb.001.shtml`, `.update.MMDDHHMM.shtml`). The a-deck is
`https://ftp.nhc.noaa.gov/atcf/aid_public/acp012026.dat.gz`, decompressed and stored whole:
the record reads only its CARQ lines, but a filtered file would be a Millibar artefact whose
hash matches nothing NOAA published, and the point of the register is that it does.

## The transmission minute is not in these bytes

Each product opens with

```
ZCZC HFOTCMCP2 ALL
TTAA00 PHFO DDHHMM
```

`DDHHMM` is **literal**. The NHC public archive masks the WMO transmission group, so unlike
the Lowell archive — captured off the feed as it went out, with the transmission time to the
minute in every filename — these products establish their issuance only to the hour they
print for themselves. That difference is carried into the record rather than smoothed over:
`Event.issued_basis` is `product-body-hour`, the manifest states it under
`event_manifest.issuance_provenance`, and the published page says so in as many words. No
minute is reconstructed, and the two archives are never mixed inside one record.

A public advisory prints its local time in full (`1100 PM HST Sun Aug 16 2026`) and its UTC
time as an hour inside the summary line (`...0900 UTC...`). Neither alone gives a UTC
instant, and the date is where it goes wrong: 11 PM HST on the 16th is 09Z on the
**seventeenth**. So the date comes from the local line, the conversion is the fixed HST
offset — Hawaii does not observe daylight saving — and the result must reproduce the UTC hour
the product states for itself. Where the two disagree the reading is refused.

## Why the discussions are archived

They are the only product that prints the forecast table **with its lead labels attached**:

```
INIT  12/1500Z 15.0N 141.8W   30 KT
 12H  13/0000Z 15.3N 142.9W   35 KT
```

`13/0000Z` is +12 h from the 12Z nominal cycle and +9 h from the 15Z initial position, and
CPHC labels it 12H — so the lead origin is the cycle. Across this archive and Lowell's, 84
discussions carry a labelled table that discriminates, the cycle origin holds on all 84, and
the initial-position origin holds on none.

They do a second job here. Advisories 62, 63 and 64 print only five forecast rows as the
system dissipates, and a five-row set beginning at +12 h is equally canonical read as +24 h
from a cycle six hours earlier. `nominal_cycle_from_rows` refuses that ambiguity instead of
picking, and the cycle is taken from the companion discussion, which prints `12H` outright.
The manifest records which advisories those are.

## No ICAO aviation advisory

The Lowell record's headline residual is measured against NHC's own interpolated position for
an off-cycle hour, taken from the aviation advisory (TCA) issued alongside Advisory 46. The
NHC public archive does not carry aviation advisories, so none is held for Lala and the same
construction is unavailable. The record reports at a synoptic hour instead, where official
forecast rows exist, and does not interpolate one of its own.

## Coastline geometry is NOT here

Coastline distances use `data/genesis-archive/coastlines/hawaii.geojson`, the shared
repository primitive, with islands selected by `properties.name` — here the eight main
Hawaiian Islands. Its provenance is in that directory's `SOURCES.json`. Selecting by name is
what keeps the uninhabited northwestern chain out of the distances without a longitude cutoff
having to be invented.

## Licence

NOAA/NWS products are works of the United States Government and are not subject to copyright.
Natural Earth is public domain; see the coastline register for its terms.
