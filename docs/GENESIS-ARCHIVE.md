# Tropical cyclone genesis-to-intensity analog archive

A reproducible, versioned archive of every tropical cyclone from its first best-track fix to
its last, with the environment it formed in, so that a **live NHC area of interest can be
matched to the historical cases most like it** and turned into empirical probabilities:

- becoming a named storm
- reaching any intensity threshold (TS, Cat 1, Cat 2, Cat 3+)
- making landfall (Hawaii islands, CONUS, Mexico) while still ≥ 64 kt
- how long each of those took

Research only. Every number traces to an official file, a download date and a processing
version. **Nothing is interpolated, imputed or invented** — where a source is silent the
archive returns `NULL` and records a gap.

---

## Quick start

```bash
pip install -r scripts/genesis/requirements.txt

python3 scripts/genesis/cli.py build --basins EP,NA --ships-basins EP,CP,AL   # build from source
python3 scripts/genesis/cli.py summary                                  # row counts
python3 scripts/genesis/cli.py gaps                                     # what is missing, and why
python3 scripts/genesis/cli.py daily                                    # ingest today's outlook
python3 scripts/genesis/cli.py live --list                              # systems SHIPS is running on
python3 scripts/genesis/cli.py live --atcf CP012026                     # one system, conditioned on its environment
python3 scripts/genesis/cli.py emit                                     # regenerate the terminal payload
python3 scripts/genesis/cli.py backtest --basins EP --min-season 1971       # zero-peek replay
```

### The headline query

> *Disturbances that formed within 500 km of 12°N 140°W in August–October — what fraction later
> made Hawaii landfall as a hurricane?*

```bash
python3 scripts/genesis/cli.py analogs --lat 12 --lon -140 --radius 500 \
        --months 8,9,10 --min-pool-season 1971 --regions hawaii
```

```
ANALOGS  12.0N 140.0W  r=500 km  months=[8, 9, 10]
  matched 24 storms   effective sample 18.2   SUFFICIENT
  intensity outcomes:
    reached td      24/24   100.0%  [86-100%]
    reached ts      17/24    70.8%  [51-85%]
    reached cat1     8/24    33.3%  [18-53%]
    reached cat2     2/24     8.3%  [2-26%]
    reached cat3     2/24     8.3%  [2-26%]
    reached cat4     2/24     8.3%  [2-26%]
    reached cat5     0/24     0.0%  [0-14%]
  landfalls:
    hawaii       any   0/24   0.0% [0-14%]        >=64kt   0 0.0% [0-14%]
      ! hawaii >=64kt: BASE RATE ONLY -- unscoreable (2 event(s) archive-wide, 10 needed). No skill number exists for this.
  time to ts: n=17  median 18 h  p25 6  p75 24
  time to cat1: n=8  median 66 h  p25 45  p75 82
  time to cat3: n=2  median 123 h  p25 98  p75 148
  CONDITIONING: these are GENESIS-CONDITIONED rates -- they assume a tropical cyclone forms.
    To combine with a formation probability (e.g. NHC's outlook chance), multiply:
      P(reaches X) = P(forms) x P(reaches X | forms).  Landfall does NOT decompose that way
      and is counted jointly here, never as a product of two marginals.
```

**The answer is zero, with an interval.** Of the 24 disturbances that formed within 500 km of
12°N 140°W in August–October since 1971, 71% became tropical storms and 33% became hurricanes,
but **none** made landfall in Hawaii — and the honest bound on that is 0–14%, not 0. A zero
count is a result, so it is printed with its Wilson interval rather than omitted; "0 of 24" and
"0 of 400" are the same rate and completely different evidence.

Move the query to where Hawaii's one modern hurricane landfall actually came from and the rate
becomes non-zero, which is the check that the zero above means something:

```bash
python3 scripts/genesis/cli.py analogs --lat 16 --lon -134 --radius 900 \
        --months 7,8,9,10 --min-pool-season 1971 --regions hawaii
```

```
  matched 65 storms
    hawaii       any   2/65   3.1% [1-11%]        >=64kt   1 1.5% [0-8%]
  time to landfall_hawaii: n=4  median 142 h  p25 140  p75 146
```

That single ≥64 kt case is **Iniki**, and the ~142 h median transit is the real travel time from
the East Pacific genesis belt to the islands.

Brackets throughout are Wilson 95% intervals, and their width is the point: 24 storms is a
real sample for "does it become a hurricane" and a thin one for anything rarer — see
[Refusals](#refusals-are-a-feature).

### Using it on a live disturbance

On 2026-08-17 23:30Z the NHC outlook carried an area at **12.0°N 143.7°W** (the graphical
product's centroid) with a **50% 7-day formation chance**, forecast to drift west into the
Central Pacific. What the archive says about disturbances like it:

```bash
python3 scripts/genesis/cli.py analogs --lat 12.0 --lon -143.7 --radius 500 \
        --months 7,8,9 --min-pool-season 1971 --regions hawaii
```

```
  matched 25 storms   effective sample 19.2   SUFFICIENT
    reached ts      13/25    52.0%  [33-70%]
    reached cat1     4/25    16.0%  [6-35%]
    reached cat3     3/25    12.0%  [4-30%]
  landfalls:
    hawaii       any   0/25   0.0% [0-13%]        >=64kt   0 0.0% [0-13%]
  time to ts: n=13  median 18 h    time to cat1: n=4  median 63 h
  closest analogs: KEONI 1993 (115 kt), KELI 2025 (45 kt), IONA 2025 (115 kt),
                   ULEKI 1988 (110 kt), WILA 1988 (35 kt)
```

**Read the conditioning carefully.** These are *genesis-conditioned* rates — they assume a
tropical cyclone forms. NHC's 50% is the probability it forms at all. The two compose by
multiplication because they are sequential conditionals, not independent events:

    P(reaches Cat 1) = P(forms) × P(reaches Cat 1 | forms) ≈ 0.50 × 0.16 ≈ 8%

The landfall question does **not** decompose that way — see
[the joint-probability note](#6-a-6-hourly-track-cannot-tell-a-traverse-from-a-centre-relocation)
— which is why the archive counts storms that did both rather than multiplying two marginals.
Note also that several of these analogs reached Cat 3+ and none reached Hawaii: systems forming
at that longitude tend to track west, south of the islands.

### The one way to hold this wrong

`get_analogs` matches on **where a storm formed**, not where it is now. Querying an active
storm's current position returns nothing useful and can return nothing at all — Tropical Storm
Lala at 20.4°N 164.3°W on 2026-08-17 matches **0 analogs** in a 400 km radius, because almost
nothing *forms* that far north and west; storms arrive there.

```
  matched 0 storms   effective sample 0.0   BELOW MIN SAMPLE -- rates refused
```

That is the correct answer to the question actually asked, and it is the wrong question. For a
storm already underway, query the position where it **formed**; for an outlook area, query the
area's own position, which is what the graphical product publishes. The CLI exits non-zero when
a query matches nothing, so a script cannot mistake an empty result for a confident zero.

In Python:

```python
from genesis.retrieval.analogs import get_analogs

res = get_analogs(lat=12.0, lon=-140.0, radius_km=500,
                  season_months=[8, 9, 10],
                  env_vector={"shear_kt": 10, "sst_c": 28, "rh_mid_pct": 60},
                  min_sample=10)
print(res.describe())
res.intensity["cat1"]["rate"]          # None if the sample is too thin -- never a guess
res.landfall["hawaii"]["hurricane"]    # count, rate, Wilson interval
res.effective_sample_size              # Kish ESS after weighting
```

---

## The six tables

`data/genesis-archive/*.parquet`, queryable directly or through DuckDB views
(`genesis.store.connect()`).

| table | grain | what it is |
|---|---|---|
| `storms` | one row per storm | id, basin, name, season, genesis time/place, lifetime peak |
| `track_points` | every fix | time, position, intensity, stage, and a **`quality`** column |
| `environment` | fix-aligned | shear, mid-level RH, 850 vorticity, potential intensity, SST, OHC, GPI |
| `genesis_events` | one row per storm | first fix, first *tropical* fix, every threshold crossing, time-to-event |
| `landfalls` | one row per crossing | region, sub-region, time, intensity at landfall, how it was detected |
| `daily_disturbances` | append-only | every NHC outlook area observed, and its eventual fate |

As built for Atlantic + East/Central Pacific:

| table | rows |
|---|---|
| `storms` | 3,959 |
| `track_points` | 224,153 |
| `environment` | 32,842 |
| `genesis_events` | 3,959 |
| `landfalls` | 3,379 |
| `daily_disturbances` | grows daily; back-filled from 2023 |

Every row carries `source_key`, `processing_version` and `ingested_utc`. `MANIFEST.json`
records the URL, SHA-256, byte count and download date of every source file, plus every gap.
`snapshots/YYYY-MM-DD.json` pins the SHA-256 and row count of each table on that date — a
dated snapshot is a *manifest*, not a copy, so version history costs a few hundred bytes a day
instead of duplicating the archive.

### `quality`, the column that keeps the archive honest

IBTrACS publishes 3-hourly positions between the 6-hourly observations, and the off-synoptic
ones are **interpolated by IBTrACS**, carrying a wind value held over from the observation.
Measured here: **113,925 observed vs 109,562 interpolated** points. They are all stored, and
marked, and **an interpolated point is never allowed to establish a threshold crossing** —
otherwise "time to hurricane" would be dated up to three hours early off a wind nobody measured.

---

## Data sources, and exactly how far each one reaches

| source | used for | coverage actually verified |
|---|---|---|
| **IBTrACS v04r01** (NCEI) | storms, track_points | EP + NA basin files: **3,959 storms / 224,153 points**, seasons 1851–2026. Per-basin files are not disjoint (24 storms cross Central America) and are de-duplicated on build. |
| **SHIPS developmental** (CIRA) | environment | AL/EP/CP **1982–2023**: EP 17,518 + AL 14,328 + CP 996 = **32,842 records** |
| **HURDAT2** (NHC) | official landfalls, cross-check | NE Pacific 1949–2025 (filename auto-discovered) |
| **NHC TWO text archive** | pre-genesis | **TWOEP/TWOAT 2003+**, **Central Pacific (HFOCP) 2019+** |
| **NHC GTWO shapefile** | disturbance *positions* | live, plus an archive: 5,821 NHC issuances from 2023-05-15, 1,367 CPHC from 2022-12 |
| **NHC CurrentStorms.json** | live resolution | current |
| **NCEP/NCAR R1** (NOAA PSL, OPeNDAP) | environment where SHIPS is silent | 1948 → **2026-03-17 18Z**, 2.5°, 4×daily |
| **Natural Earth 10m land** | coastline polygons | public domain |

---

## Gaps

Reported rather than filled. `python3 scripts/genesis/cli.py gaps` prints the machine-recorded
version; this is the narrative one.

### 1. ERA5 is not available in this environment

The spec asked for ERA5 along-track extracts. It is **unreachable here**, verified two ways:
the Copernicus CDS API requires an API key that is not provisioned, and the AWS `era5-pds`
mirror returns **HTTP 403**.

**What is used instead, and what it costs.** The environment table is built from the **SHIPS
developmental data**, which is the better source for this purpose anyway — it is the
operational standard, already quality-controlled, storm-relative, and it carries exactly the
fields the analog query conditions on (`SHDC` deep-layer shear, `RHMD` mid-level RH, `Z850`
vorticity, `VMPI` potential intensity, `RSST` SST, `COHC` heat content). Where SHIPS is silent,
**NCEP/NCAR Reanalysis 1** is used via OPeNDAP subsetting. NCEP R1 is **2.5° and 4×daily**
against ERA5's 0.25° and hourly: a TC core is unresolved at 2.5° and the "environment" is a
much coarser average. Rows carry `env_source` so the two can never be confused.

**And the substitute does not reach the present either.** The NCEP R1 files were checked
year by year: 1948 has 1,464 timesteps, 2023 and 2025 have 1,460, and **2026 has 304 — it ends
at 2026-03-17 18Z**. Every variable reports the same 304, so a row is complete for all fields or
absent for all. That means the reanalysis fallback covers the 2024–2025 hole left by SHIPS but
**not the current season**: for a live disturbance there is no gridded environment in this
archive at all, only what SHIPS publishes operationally once a storm exists.

One trap worth recording because it is a factor of 100: NCEP R1 publishes `slp` in **Pascals**
(raw ≈ 101050), not millibars.

### 2. Environment coverage is a function of the SHIPS era

Fraction of genesis events with a SHIPS environment record within 12 h of genesis:

| decade | coverage | |
|---|---|---|
| 1876–1979 | **0%** | SHIPS begins in 1982 |
| 1980s | 65.0% | |
| 1990s | 72.0% | |
| 2000s | 79.6% | |
| 2010s | 85.0% | |
| 2020s | **49.7%** | the developmental file **ends in 2023** |

Overall **47.8%** (813 of 1,701). So `env_vector` matching is a modern-era instrument. A query
that supplies one is answered from the subset that has it, and the per-case
`env_fields_compared` count says how much was actually compared.

### 3. Pre-genesis coverage is thin, and thinnest exactly where Hawaii needs it

The best-track archive contains only the disturbances that **succeeded**. A wave that never
became a depression has no row, so a development rate computed from best tracks alone is
computed over survivors and is meaningless. The failures live only in the NHC Tropical Weather
Outlook, and that archive reaches back only:

- **East Pacific / Atlantic: 2003**
- **Central Pacific: 2019** (`archive/text/HFOCP/`; `TWOCP/` holds 2013 alone)

and the **text carries no coordinates** ("well to the east-southeast of the Hawaiian Islands").
Prose is never geocoded — that would be inventing data.

Positions come from the **graphical** outlook, which *is* archived:

```
https://www.nhc.noaa.gov/gis/gtwo/archive/YYYYMMDDHHMM_gtwo.zip                   (NHC)
https://www.nhc.noaa.gov/gis/gtwo/archive/CPHC/gtwo_cphc_shapefiles_YYYY....zip   (CPHC)
```

Measured coverage: **5,821 NHC issuances from 2023-05-15** and **1,367 CPHC from 2022-12**. So
the positional pre-genesis record is about **three and a half seasons** deep — thin, but real,
and it grows with every daily run. `cli.py` back-fills it:

```bash
python3 -c "from genesis.build.backfill_two import backfill; backfill(since='2023')"
```

**Resolution is a stated heuristic, not a published fact.** NHC does not publish "outlook area 2
became Hurricane Greg". Threads and best-track genesis events are matched **one-to-one**,
greedily by distance, using each thread's observation *nearest in time* to the genesis, within
600 km and −6…+96 h. Every matched row records the distance that fired it, and the rule is
returned with the result.

Getting this right took three corrections, each found by checking the 2026 season against the
storms that actually formed, and **each one biased the development rate downward** — the worst
direction for a table whose entire purpose is an honest denominator:

| bug | symptom | fix |
|---|---|---|
| threads went stale after 5 days | one thread spanned 1,644 km and 15 days, swallowing EP04's precursor *and* an unrelated successor | 36 h (NHC issues 4×/day) |
| matched only a thread's **last** observation | the thread that became EP04 ran 11 days from 20% → 100% and sat 93 km from genesis at the genesis hour, yet resolved "dissipated" | match the observation nearest in time; split the thread at the genesis it produced |
| threads claimed genesis events many-to-one | 11 "developed" threads for 8 distinct storms | one-to-one greedy assignment |

Verified end to end on 2026: **9 storms formed, 9 matched, 0 duplicated, 0 missed** — 41
threads, 9 developed, a measured **22.0%** development rate.

### 4. Official landfall flags are close to useless for Hawaii — measured

HURDAT2 marks landfall points with an `L` record identifier, which would be far better evidence
than any polygon test. In the NE Pacific file there are **139 `L` records**. Inside the Hawaii
box (18–23°N, 161–154°W) there is exactly **one**: Iselle (2014), at 50 kt.

**Iniki is not flagged.** The most destructive hurricane ever to strike Hawaii passed over
Kauai on 1992-09-12 at 21.5°N 159.8°W carrying **115 kt**, and its record identifier is blank:

```
19920912, 0000,  , HU, 21.5N, 159.8W, 115      <- over Kauai, NOT flagged 'L'
19920912, 0600,  , HU, 23.7N, 159.4W, 100
```

So for Hawaii the **polygon-crossing geometry is the primary detector, not the fallback**, and
the `detection` column on every landfall row says which produced it (`hurdat2_L_record` vs
`segment_crossing`). Any Hawaii rate computed from `L` records alone would be wrong by an order
of magnitude while looking authoritative.

### 5. What the polygon detector finds, and how far to trust the coastline

Run over the 213 archived storms with any fix in the Hawaii box, the crossing detector returns
**19 crossings**, and the ones at hurricane strength are exactly the two in the historical
record:

| season | storm | island | intensity | detection |
|---|---|---|---|---|
| 1959 | DOT | Kauai | 75 kt | bracketing_fix |
| 1992 | **INIKI** | Kauai | **112 kt** (class withheld, see below) | segment_crossing |
| 2014 | ISELLE | Island of Hawaii | 50 kt | bracketing_fix |
| 2016 | DARBY | Island of Hawaii | 35 kt | bracketing_fix |
| 2018 | OLIVIA | Maui, Lanai | 39 kt | segment_crossing |
| 2021 | LINDA | Molokai | 32 kt | segment_crossing |

Dot and Iniki are the only two hurricane landfalls in Hawaii's recorded history, and Iniki is
the one HURDAT2 does not flag. `bracketing_fix` means a published fix was itself over land;
`segment_crossing` means the intensity was interpolated between two fixes and the row is
derived.

#### A segment crossing publishes no Saffir-Simpson class

The interpolated wind stays on the row, clearly labelled by `detection`. The **class** derived
from it does not, unless the two published fixes either side agree on it.

Iniki is why. Its crossing interpolates to **112.0 kt** between published fixes of 115 kt
(Cat 4) and 108 kt (Cat 3) — one knot below the Cat 4 line, on Hawaii's costliest hurricane.
Reading `cat3` off that number would be a categorical claim NOAA never published, decided by
arithmetic, on the single most consequential row in this archive. So `landfalls.category` is
NULL there. `hurricane_at_landfall` stays **True**, because both bracketing fixes agree it was
a hurricane — only the class was ever in doubt.

The same rule applies to the two threshold booleans, and there it changes counts. Measured over
the archive: of 1,013 segment crossings, **75** had a category the bracketing fixes disagreed
on, and **21** had a `hurricane_at_landfall` decided by the interpolation — the fixes straddled
64 kt. Doreen (1977, Mexico) interpolated to 63.3 kt between published 65 and 58; Isis (1998)
to 63.7 between 65 and 63. Those 21 are now NULL, which `get_analogs` already treats correctly:
an unknown outcome leaves the denominator and is counted on its own rather than scored as a no.

None of the published back-test scores moved: the withdrawn flags fall outside the EP 1971+
scored set, and Hawaii's two hurricane landfalls are both intact.

**Attribution tolerates the erosion; containment alone did not.** A landfall is *on* the coast
by definition, so requiring the point to fall strictly inside a simplified polygon discards
exactly the rows that matter. Measured: **726 of 1,305 official HURDAT2 `L` records — 56% —
came out `unattributed`**, clustered on the Florida, Louisiana, Texas and Carolina coasts, which
is to say they were all obviously CONUS. Attribution now falls back to the nearest region within
30 km, measured to polygon vertices so it over-estimates distance and can only fail to
attribute, never over-reach. Unattributed dropped to **57**, and those are genuinely outside the
five modelled regions: Nova Scotia and Newfoundland (24), Bermuda (9), the Azores and Cape Verde
(5), South America (4), Iberia (1). They are kept as `region='unattributed'` — a landfall NOAA
published is a fact whether or not this code can name the coast it hit.

Spot-checked against the record, CONUS major-hurricane landfalls since 2000 come back exactly
right: Charley and Ivan and Jeanne (2004), Dennis/Katrina/Rita/Wilma (2005), Harvey and Irma
(2017), Michael at 140 kt (2018), Laura and Zeta (2020), Ida (2021), Ian (2022), Idalia (2023),
Helene and Milton (2024) — right storms, right states, right intensities.

**A higher-resolution source exists and is not yet used.** Natural Earth's *physical* land layer
is no better than the admin-1 layer already in use — measured, both give the same 8 polygons and
605 vertices over Hawaii. GSHHG (Wessel & Smith), the standard shoreline for this work, **is**
reachable from the maintainer's mirror at `soest.hawaii.edu/pwessel/gshhg/gshhg-shp-2.3.7.zip`
(149 MB; the NOAA NGDC path now 404s). Its full-resolution level-1 layer would replace the
~5 km erosion below with something far finer, clipped to the Hawaii box and committed at a
fraction of the download size. It is deliberately **not** done: it changes no current result —
the detector already finds every historical Hawaii landfall, including the one HURDAT2 misses —
and the Hawaii contract is unscoreable for want of events, not for want of coastline precision.

**The coastline is simplified, and the erosion is measurable.** The polygons are Natural Earth
10m; walking inland from Miami, a point registers as CONUS only about **5 km** from the
shoreline, and the same is true of Hawaii's south shores. For centre-crossing detection that
rarely matters — a storm that traverses an island crosses the eroded polygon too, which is why
every landfall above was found — but a **grazing** landfall within ~5 km of the shore can be
missed. `closest_approach_km` is returned on every crossing so a near-miss is visible rather
than silently absent, and Hawaii's polygons carry only 651 vertices across 14 islands, so
per-island geometry is coarse.

### 6. A 6-hourly track cannot tell a traverse from a centre relocation

Documented from a real incident on this project in `docs/PLAN-TRACK-MODEL.md`: seven of nine
"landfall" ensemble members in one cycle crossed an island only because a straight line between
6-hourly points cut it, at implied speeds of 15–19 kt against a storm moving 7–8 kt. A centre
that dissipates east of an island and reforms west of it is **not** a landfall. Every crossing
therefore carries `implied_speed_kt` and `suspect_relocation`, and suspect crossings are
excluded from rates but **kept in the table** so the exclusion is auditable.

### 7. Basin and subbasin mean less than they look like

- The IBTrACS "EP" file is not EP-pure: it contains every storm with *any* point in EP,
  including **341 storms whose genesis was in the West Pacific** (dateline crossers) and 18 in
  the North Atlantic. Storm basin is taken from the **genesis** fix.
- **`storms.subbasin` is the subbasin at genesis**, and using it for Hawaii work undercounts by
  83%: **116** storms have a CP genesis but **664** have at least one CP track point. Iniki
  formed at 134°W — East Pacific — so it is *not* a "CP storm" at storm level.
  `get_analogs(subbasins=["CP"])` therefore means **"was ever here"**; the strict question is
  `genesis_subbasins=`, named so it cannot be reached for by accident.

### 8. Known SHIPS mapping caveats

- `ohc_kj_cm2` is SHIPS **COHC**, which the official predictor file defines as a
  *climatological* ocean heat content. The analysed field is `NOHC`.
- `mslp_env_mb` is SHIPS **MSLP**, the storm's own central pressure, not an environmental
  pressure (`PENV`/`PENC`).
- SHIPS switches input model from CFSR reanalysis (1982–2000) to operational GFS (2001+)
  mid-record, and **no column flags the discontinuity**.
- 167 of 32,842 SHIPS records (0.5%) carry an ATCF id IBTrACS never adopted. They are kept with
  `storm_id` NULL so the gap is countable; they never match an analog query.

### 9. Provisional data

2025–2026 seasons are `US-PROVISIONAL`/`PROVISIONAL` in IBTrACS — not yet post-analysed, and
their intensities will change. They are excluded from analog pools by default
(`include_provisional=False`) and flagged in `storms.provisional`.

---

## Refusals are a feature

Four rules, each present because the alternative is a plausible wrong number.

1. **A rate is refused below `min_sample`.** Counts are always returned; a *rate* only when
   enough distinct storms support it. Three analogs of which two became hurricanes is not
   "67%", it is three storms.
2. **The sample is storms, not fixes.** A storm contributing 60 six-hourly fixes is one
   observation. The back-test gate counts distinct resolved storms (10 to score, 30 for a
   reliability curve) — 400 forecasts over 3 storms is refused, and there is a test for it.
3. **Effective sample size is published beside every rate.** Kish ESS = (Σw)²/Σw². The gate is
   applied to the raw storm count, never to the flattering ESS.
4. **An absent outcome is not a zero.** A storm whose intensity was never recorded did not fail
   to become a hurricane — it is unknown, excluded from the denominator and counted separately.

---

## Back-test: does any of this carry information?

Zero-peek replay from each storm's genesis moment. Two gates, not one: `as_of` drops every
storm whose genesis was at or after the moment simulated, and `exclude_storm_ids` drops the
storm being predicted, which `as_of` alone does not do at t₀. The reference forecast is a
climatology **also** restricted to storms already past — a reference the forecaster could not
have had is not a reference.

```bash
python3 scripts/genesis/cli.py backtest --basins EP --min-season 1971 --min-pool-season 1971 \
        --regions mexico,hawaii,conus
```

East Pacific, seasons 1971+, **847 scored storms**:

| contract | base rate | Brier | climatology | skill |
|---|---|---|---|---|
| reaches TS (34 kt) | 0.894 | 0.0929 | 0.0974 | **+4.6%** |
| reaches Cat 1 (64 kt) | 0.504 | 0.2220 | 0.2501 | **+11.2%** |
| reaches Cat 3 (96 kt) | 0.253 | 0.1704 | 0.1900 | **+10.3%** |
| reaches Cat 4 (113 kt) | 0.176 | 0.1387 | 0.1470 | **+5.6%** |

**Read this honestly.** Genesis location and season carry real information about eventual
intensity, and much less about whether a depression reaches TS strength — which the base rate
already tells you: 89% of East Pacific depressions reach 34 kt, so there is very little there
to predict. Discrimination is real but modest. Storms whose analog pool fell below
`min_sample` were **refused**, not answered from a handful of cases.

### Landfall contracts, and the one that cannot be scored at all

Landfall contracts are only scored when `--regions` names the coasts to score, because the
region set decides which contracts exist:

```
  landfall_mexico_hurricane    storms  847  base 0.067  Brier 0.0600  clim 0.0633  skill  +5.2%
  landfall_mexico_any          storms  847  base 0.169  Brier 0.1158  clim 0.1413  skill +18.0%
  landfall_hawaii_hurricane    storms  847  events    0  NO SKILL SCORE -- below the 10 required
  landfall_hawaii_any          storms  847  events    6  NO SKILL SCORE -- below the 10 required
  landfall_conus_hurricane     storms  847  events    0  NO SKILL SCORE -- below the 10 required
  landfall_conus_any           storms  847  events    1  NO SKILL SCORE -- below the 10 required
```

**Mexico landfall is where the analog method is strongest** — +18.0% against a zero-peek
climatology, on 143 scoreable events. Genesis position genuinely tells you whether an East
Pacific storm ends up on the Mexican coast.

**The Hawaii hurricane-landfall contract cannot be scored, and that is the most important
result here.** In 1,039 replayed storms there is exactly **one** Hawaii hurricane landfall —
Iniki — and the model *refused to forecast it*, because Iniki's analog pool held only 8 storms,
below `min_sample`. So the contract has **zero scoreable events**. Its Brier score is 0.0000,
which sounds excellent and means only "predict never, and be right every time".

That drove a gate this harness now enforces: a skill ratio requires **at least 10 events**, not
merely 10 storms. Before it, the Hawaii any-landfall contract reported a tidy `-3.3%` off six
events, and the hurricane contract reported `-2988%` off a ratio between two numbers that were
both 0.0000 to four places.

So, plainly: **this archive can give you an empirical Hawaii landfall base rate, and it cannot
give you a validated Hawaii landfall model.** The modern record contains one event. Any product
quoting a calibrated Hawaii hurricane-landfall probability is extrapolating beyond what the
record can support, and should say so.

| contract | events | refused by min_sample | scoreable |
|---|---|---|---|
| reaches TS | 895 | 138 | 757 |
| reaches Cat 1 | 486 | 59 | 427 |
| reaches Cat 3 | 240 | 26 | 214 |
| reaches Cat 4 | 159 | 11 | 148 |
| Mexico landfall (any) | 161 | 18 | **143** |
| Mexico landfall (≥64 kt) | 61 | 4 | **57** |
| Hawaii landfall (any) | 8 | 2 | 6 |
| **Hawaii landfall (≥64 kt)** | **1** | **1** | **0** |

### The disturbance contract: does an outlook area develop?

This is the question the best-track archive structurally cannot ask, and the one the
back-filled disturbance log exists for. **367 outlook threads from 7,188 archived issuances
(2022-12 → 2026-08), 85 of which developed — a measured 23.1% development rate.** The benchmark
is not climatology, it is **NHC's own published 7-day formation chance**, which is printed on
the same page as the disturbance.

```
  368 outlook threads, 85 developed (23.1%), 9811 observations
  NO SKILL CLAIM -- the per-disturbance and per-observation sampling schemes
  disagree in SIGN, so the effect is smaller than the choice of scheme.
```

**No skill number is printed for this contract.** The two values exist in the JSON for
diagnosis and are deliberately kept off every human-facing surface until the schemes agree —
showing either one would present a choice of methodology as a result.

**Two defensible ways to score it give answers of opposite sign, so the archive claims
nothing.** Scoring one forecast per disturbance (its first appearance in the outlook — the
statistically clean object, since observations within one thread share an outcome) the analog
rate beats NHC by 26.8% on 170 shared forecasts. Scoring every observation, it *loses* by 3.1%
on 5,273. When the effect is smaller than the choice of sampling scheme, there is no effect to
report yet, and picking the flattering number would have been trivial and wrong.

Two further cautions, both structural:

- **The outcome labels rest on a heuristic NHC does not publish.** A thread counts as
  "developed" when a best-track genesis falls within 600 km and −6…+96 h of it. Errors there
  land on both estimates equally, which is why only the like-for-like comparison is meaningful —
  and it is the unstable one.
- **Do not read this as a verdict on NHC.** Scored against a constant, NHC's published
  probability comes out at −37.6% per-disturbance, which says the resolution heuristic is
  under-detecting developments, not that NHC's forecasts are poor. The harness prints that
  caveat next to the number.

### `min_pool_season`, and why the default record is not the best record

The first run of this back-test showed the Cat 3 contract **systematically underconfident in
every populated bin** — predicted 0.344 where 0.473 was observed, and in the same direction
throughout. That is a signature, not noise, and the archive itself explains it. East Pacific
storms reaching Cat 3, by decade:

| 1950s | 1960s | 1970s | 1980s | 1990s | 2010s |
|---|---|---|---|---|---|
| 5.2% | **1.7%** | 20.3% | 22.5% | 29.7% | 27.9% |

The step between the 1960s and the 1970s is not weather. The East Pacific is remote, has never
been routinely flown by reconnaissance, and before geostationary satellites and the Dvorak
technique its intensities were estimated from ship reports — so major hurricanes there were
largely **not seen**. An analog pool reaching into those seasons drags every intensity rate
downward, invisibly.

Restricting the pool with `min_pool_season=1971` fixed both the calibration and the skill:

| | Cat 3 skill | Cat 3 weighted mean \|calibration error\| |
|---|---|---|
| pool = whole record | +7.0% | 0.078 |
| pool = 1971+ | **+10.3%** | **0.031** |

The archive does **not** silently truncate the record — those storms happened and their
positions are sound. Instead `get_analogs` emits a gap whenever the pool reaches before 1971,
naming the bias and its direction, and `min_pool_season` is there to cut it.

This is a *base rate*, not a forecast. It knows nothing about the current atmosphere beyond
what the environment vector supplies, and it should be beaten by any competent operational
model. Its value is as the reference an operational estimate has to beat, and as the empirical
prior when nothing else is available.

---

## What independent verification found

Every source parser was written against the real bytes, then handed to a separate reviewer told
to break it against those same bytes. That pass found defects the author's own testing did not,
and all of them were the quiet kind — wrong values, not crashes:

| module | defect | why it mattered |
|---|---|---|
| `ibtracs` | `IFLAG='V'` rows were labelled **interpolated** | `V` marks a value an agency published at a *non-synoptic* time — in practice HURDAT2's special records. All 64 V-only EP rows match HURDAT2 exactly on position, wind **and** pressure (Kenna's Mexican landfall among them), while all 48,357 P-only rows carry a blank record identifier. **51 of 161 published EP landfall fixes (32%) and 277 of 1,177 in the Atlantic (24%) were mislabelled** — a build filtering on `quality=='observed'` would have dropped a quarter of the real landfall fixes and substituted interpolations for them. |
| `ibtracs` | JMA **10-minute** winds bucketed by a 1-minute scale | Saffir-Simpson is *defined* on a 1-minute sustained wind. Mean(WMO−USA) = −9.9 kt over 6,212 rows where both exist. 79 storms had a different lifetime peak, 16 a different category, 8 flipped `reached_cat3` — BART 1999 read cat2 at 90 kt on the JMA wind and cat5 at 140 kt on the US one. Fixed by **source selection**, not conversion: where the WMO agency reports a 10-minute mean and a US value exists, the US value is used. The 0.88 factor often quoted is a rule of thumb, not a published per-fix value, and applying it would fabricate numbers. |
| `hurdat2` | `-99` emitted as an observed wind | The NE Pacific file uses only `-999`; **the Atlantic file also uses `-99`, on 57 fixes across 54 storms (1971–1987)** — and `category_for(-99)` returns `'td'`, laundering a sentinel into a Saffir-Simpson category. Found only because the archive had grown to read both files through one parser. |
| `geo` | `crossings()` emitted **two longitude conventions in one column** | A `segment_crossing` position is computed (always signed) but a `bracketing_fix` position is the input fix echoed verbatim — and IBTrACS publishes continuous 0–360 east longitude on **3,786 rows across 375 storms** (max 266.9°). Fed an unnormalised track, the same result list returned both −155.4 and +204.6. Latent today because the IBTrACS loader normalises first, but the module invites foreign tracks and a-deck members that nobody normalises. |
| `build_archive` | `stage` and `category` NULL on **every** polygon-derived landfall | `c.get("stage")` read a key `crossings()` never returns, and `category` was hardcoded `None` — so the same two columns meant different things depending on which detector produced the row. 263 of 411 EP crossings were affected, 145 at a *published* fix whose stage was sitting in the track. Now: `category` derived from the wind already on the row, `stage` looked up by exact timestamp for a bracketing fix and left NULL for a segment crossing, where no published stage exists. |
| `gpi` | missing-value guard covered 2 of 5 inputs | An escaped sentinel could be published as a GPI. The physics held under independent scrutiny: a from-scratch reimplementation over all 32,842 rows gave **0 mismatches at 1e-9**, and the self-check literals were reproduced at 40-digit precision. |
| `ships_dev` | 4 defects, 3 fixed in file | Core science held: all 32,842 records were joined to HURDAT2 on `(atcf_id, iso_time)` and **32,842 matched**, with zero position mismatches in CP and AL. All 12 unit scalings re-extracted from the official PDF and confirmed verbatim. |

The point of recording this is not that the code is now correct — it is that **each of these
would have produced a plausible number rather than an error**, which is the only failure mode
that matters in an archive whose entire value is that its numbers are trustworthy.

## Live conditioning

Everything above is historical. The environment table stops in 2023 (SHIPS developmental) and
the reanalysis fallback stops 2026-03-17, so until now nothing could supply an `env_vector` for
a system that exists **today**. NHC's operational SHIPS closes that, and the decisive property
is its coverage: it runs per ATCF system, and that **includes invests**.

Measured on the live directory (`ftp.nhc.noaa.gov/atcf/stext/`): **390 runs across 37 systems,
177 of them 90–99 invests or 80–89 genesis candidates**. A disturbance therefore acquires an
environment vector at roughly the moment NHC starts numbering it.

```bash
python3 scripts/genesis/cli.py live --list              # systems with a published run
python3 scripts/genesis/cli.py live --atcf CP012026 --regions hawaii
```

```
LIVE ANALOGS  CP012026  SHIPS run 2026-08-18 00:00Z
  position used: 14.9N 145.0W  (genesis)
  current position 20.3N 165.0W is NOT queried -- matching is on genesis location
  env_vector: shear_kt=9, rh_mid_pct=41, sst_c=27.8, pot_intensity_kt=142, ohc_kj_cm2=25, ...
  CAVEAT: the env_vector is OPERATIONAL SHIPS; the pool it matches is DEVELOPMENTAL SHIPS.
```

### It is a different product from the pool it matches

The live vector is **operational** SHIPS; the archive's environment is **developmental** SHIPS.
The operational product publishes its units in the row label (`SHEAR (KT)`, `SST (C)`,
`POT. INT. (KT)`) — so applying the developmental divisors would be wrong by a factor of ten on
shear and SST — but it publishes **no unit** for `850 MB ENV VOR` or `200 MB DIV`.

Rather than assume the developmental decade, it was measured: 37 live tau=0 rows against the
archive's 32,842 developmental rows.

| field | live median | archive median | |
|---|---|---|---|
| `sst_c` | 28.2 | 27.9 | control — unit published in the label |
| `rh_mid_pct` | 59 | 60 | control |
| `shear_kt` | 16.0 | 12.5 | control |
| `850 MB ENV VOR` (raw) | range [−102, 116] | range [−180, 367] | **no published unit** |
| `200 MB DIV` (raw) | range [−44, **233**] | range [−141, **233**] | **no published unit** |

The controls agree and both unlabelled fields share the developmental decade and range — the
200 mb divergence upper bound is identical at 233. **That establishes the decade. It does not
establish identical calibration**, and 37 rows from one synoptic hour never could.

So `gpi.py` gained a second, deliberately weaker tier. `VORT_SCALING_CONFIRMED_SOURCES` still
means "verified against the publisher's own documentation" and still contains only `ships_dev`;
`VORT_SCALING_INFERRED_SOURCES` contains `ships_rt`, and every GPI computed from such a row
carries this in its own `gpi_method` column:

```
vorticity decade INFERRED from distribution against ships_dev, not read from a published
unit; decade evidenced, calibration not (env_source='ships_rt')
```

Filter on `env_source` before comparing the two quantitatively. A quantile-mapping layer between
the products would make them safely mixable and **does not exist yet** — this is an honest
statement of the problem, not a solution to it.

### Which position a live query uses

`get_analogs` matches on **genesis** location, so `live.py` does not guess:

- a system already in the best track → its **archived genesis position**, and the panel says the
  current position was not queried
- an invest with no track yet → its **current position**, which for a disturbance is the right
  one, because that is where a system like it forms

### Three limits, stated

| limit | consequence |
|---|---|
| `stext` holds only the current season | live environment accumulates **forward** from the day the daily job starts; it can never be back-filled |
| SHIPS runs per ATCF system | an outlook area with no number yet has **no** vector. Position-and-season conditioning still works |
| operational ≠ developmental | decade evidenced, calibration not. Never pool `env_source` values |

## The daily pipeline

`.github/workflows/genesis-archive.yml` runs four times a day, on `cron: "20 5,11,17,23 * * *"`,
which targets the 05/11/17/23Z block the live graphical outlook is actually transmitted in — see
**Measured timing** below, which corrects an earlier claim in this file that the target was
06/12/18/00Z. It:

1. pulls the graphical outlook (positions + probabilities) and the text outlook (narrative)
2. appends every area to `daily_disturbances` — **append-only**: every issuance is a row, even
   a repeat, because the log's job is to record what was knowable *when*
3. threads areas across issuances **by position**, because NHC renumbers them between
   issuances; the rule that fired is recorded per row in `source_key`
4. resolves an area to `developed` when an active storm appears near it, or `dissipated` after
   5 days unmentioned
5. captures the operational SHIPS environment for every active system (see **Live conditioning**)
6. regenerates `docs/data/analogs.json`, the terminal's payload, *after* the ingest, so the
   board describes the disturbances this run just observed
7. re-snapshots the archive

The gate suite (`scripts/genesis/tests/run_tests.py`, 162 checks) runs **before** any data
commit, so a parser that has started inventing data cannot write a row.

### Measured timing, and a correction

**A previous version of this file, and the comment in the workflow, said the cron fires "shortly
after NHC's 06/12/18/00Z outlook issuances". That is wrong about the hours, and the error made
the cron look 40 minutes early when it is not.** The archive's own `issuance_utc` column settles
it, which is the point of carrying that column.

There are two populations in `daily_disturbances.issuance_utc` and they must not be pooled:

| population | what stamps it | issuance times seen |
|---|---|---|
| backfill (`backfill_two.py`) | the archived **text** product's nominal hour | exactly 00/06/12/18Z |
| live daily ingest | the **graphical** product's own transmission stamp, carried in `source_key` as `gtwo:YYYYMMDDHHMM` | 23:31Z, 05:21Z, 11:42Z |

The live graphical outlook lands in the 05/11/17/23Z block, drifting by tens of minutes — the
three consecutive issuances observed so far were 5 h 50 m and 6 h 21 m apart, not a fixed 6 h.
So `20 5,11,17,23` is aimed at the right hours. **Retargeting it to `20 0,6,12,18` — the "fix"
that the wrong-hours reading appeared to call for — would make every run roughly 5 h 50 m stale
instead of minutes.**

What has actually been measured, from the first scheduled fire (run `32133281007`, 2026-08-18):

| quantity | value | n |
|---|---|---|
| scheduler lag, this workflow | nominal 11:20Z → started 11:45:06Z = **25 min 06 s** | 1 |
| scheduler lag band, sibling `refresh-data.yml` | 9–43 min | 30 |
| ingest staleness, scheduled run | issued 11:42Z, fetched 11:45Z = **3.3 min** | 1 |
| ingest staleness, off-cadence manual run | issued 05:21Z, fetched 05:23Z = **2.6 min** | 1 |
| ingest staleness, a run deliberately off-block | issued 23:31Z, fetched 04:29Z = **4 h 58 m** | 1 |

**The margin is thin and it is not yet characterised.** The run catches a fresh outlook only
because the scheduler lag exceeds that cycle's issuance offset. On 2026-08-18 the 11:42Z issuance
sat 22 minutes past the 11:20 cron, and the observed 25-minute lag cleared it by 3 minutes — but
a 9-minute lag, well inside the measured band, would have fired at 11:29 and picked up the 05:21Z
outlook, 6 h 08 m stale. The offset varies per cycle (+1 min at 05:21, +22 min at 11:42, +11 min
at 23:31), so both terms drift.

That is a question for accumulated observations, not for a same-day edit: one scheduled fire is
n=1. The cron is deliberately unchanged pending more samples, and the column that answers it is
already being written on every row.

## The terminal panel

`scripts/genesis/emit_panel.py` writes `docs/data/analogs.json`; `docs/app/analogs.jsx` renders
it as **Analog prior**, the first section of the board's Models tab. The panel is a renderer
and nothing else: every number on it is a field of the payload, and the payload is a call to
`get_analogs`. Nothing is recomputed in the browser, so there is no second implementation of
any rate to drift from this one.

### What each entry carries

One entry per live system and per open outlook area:

| field | what it is |
|---|---|
| `position` / `current_position` | the position matched on, and — for a tracked storm — the current position that was **not** queried |
| `n_cases`, `effective_sample_size`, `min_sample` | matched storms, Kish ESS, and the gate |
| `intensity`, `landfall`, `time_to_event` | per-threshold counts, rates, Wilson intervals, weighted rates, transit-time percentiles |
| `unscoreable` | per contract: the reason the archive will not produce a skill number |
| `environment` | the live vector, its source, and the product-mismatch caveat |
| `formation` | NHC's own published 48-hour and 7-day chance, as published |
| `gaps` | what this particular query could not answer |

### Four rules the panel is built to keep

1. **No bare percentage.** Every rate is rendered as `count / denominator`, the percent, and
   its 95% Wilson interval **in the same row**. The weighted rate sits in that same row, with a
   footnote saying the archive publishes no interval for it and the interval to read is the
   unweighted one.
2. **A refused rate prints the refusal.** Where `rate` is null the row keeps its counts and
   spans the remaining columns with `RATE REFUSED` and the archive's own reason — never `0.0%`.
3. **An unscoreable contract prints `BASE RATE ONLY`.** No skill number for Hawaii hurricane
   landfall appears on the panel, because none exists anywhere in this repository to display.
4. **The conditioning note is reproduced verbatim**, and every entry says which position was
   matched. An empty pool renders as `NO ANALOGS — 0 STORMS MATCHED`, not as a zero rate.

The claim registry (`docs/app/claims.js`, owner `genesis`) owns the wording of all four, so a
capability written as a string literal inside the component fails `scripts/audit-claims.mjs`.

### Verification

The rules above are asserted against a rendered DOM rather than read out of the source, because
a rule that only lives in source is a rule nobody enforced.

```bash
npm i --no-save playwright && npx playwright install chromium
node scripts/check-panel-dom.mjs
```

It serves `docs/` to a real Chromium **twice**: once against the committed payload, and once
against `scripts/fixtures/analogs-edge.json`, which carries a refused rate, a zero-analog pool
and a null environment. The second run is not optional — the live payload frequently contains
none of those (as of writing all three of its entries clear `min_sample`), so a check that only
ever sees live data leaves every refusal path unexercised and reports green. Each run asserts
the counts, the intervals, the refusal cells, the `BASE RATE ONLY` badge, the verbatim
conditioning note, that the `BASE RATE ONLY` statement survives inside a **zero-analog** entry,
and that the section's collapsed summary matches the payload it is summarising. Any page error
fails it.

It is **not** in `.github/workflows/checks.yml`. That job's header promises it is entirely
offline; this one needs a browser binary it would have to download. Run it by hand after
touching `docs/app/analogs.jsx`, `docs/app/claims.js` or `scripts/genesis/emit_panel.py`.

The check has been made to fail on purpose: deleting the interval from the rate row turns both
runs red on `a Wilson interval`, which is the only evidence that it is testing the screen and
not itself.

---

---

## Layout

```
scripts/genesis/
  provenance.py        fetch + sha256 + Manifest + Gap; gaps are first-class output
  schema.py            the six pyarrow schemas, thresholds, category_for()
  store.py             Parquet + DuckDB views + per-run snapshot manifests
  geo.py               coastline polygons, point-in-polygon, crossing detection
  live.py              live query: which position, which environment, and which it used
  emit_panel.py        get_analogs -> docs/data/analogs.json, the terminal's payload
  cli.py               build / analogs / backtest / live / daily / emit / summary / gaps
  sources/
    ibtracs.py         IBTrACS v4 -> storms + track_points
    ships_dev.py       SHIPS developmental -> environment (the archive's history)
    ships_rt.py        SHIPS operational -> environment (today, for live conditioning)
    hurdat2.py         HURDAT2 -> official 'L' landfalls + IBTrACS cross-check
    two_archive.py     NHC Tropical Weather Outlook text -> pre-genesis
    gtwo.py            NHC graphical outlook -> disturbance POSITIONS
    reanalysis.py      NCEP/NCAR R1 via OPeNDAP (the ERA5 substitute)
  indices/gpi.py       Emanuel-Nolan genesis potential index
  build/
    build_archive.py   the orchestrator; every stage failure becomes a recorded gap
    genesis_events.py  stage transitions and time-to-event
    daily.py           the daily ingest
    backfill_two.py    the archived outlook backfill, one-to-one thread resolution
  retrieval/analogs.py get_analogs()
  backtest/            contracts, scoring, zero-peek harness
  tests/
    run_tests.py       the gate: 162 checks, runs before any data commit
    validate_archive.py  a report, not a gate - official data is allowed to look wrong
docs/
  GENESIS-ARCHIVE.md   this file
  data/analogs.json    the emitted payload the board reads same-origin
  app/analogs.jsx      the Analog prior panel
  app/claims.js        the claim registry that owns its wording (owner `genesis`)
data/genesis-archive/  the tables, MANIFEST.json, snapshots/, coastlines/
```
