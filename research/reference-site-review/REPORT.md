# Millibar / Storm Atlas against Cyclocane and SpaghettiModels

Written 2026-09-06/07, during Marie (EP13), Lowell (EP12) and Karina (EP11). Both reference
sites were inspected live that day; the repo was audited before anything was changed. The
screenshots in `shots/` are rendered by `scripts/check-terminal-responsive.mjs` against the
committed snapshot with the guidance envelope attached from the committed a-deck fixtures, so
they are reproducible at any commit.

## 1. What the reference sites taught us

**Cyclocane** (per-storm pages, `/{name}-storm-tracker/`, `/{name}-spaghetti-models/`):

- One stable URL per storm that exists before the storm does. That is the whole of "easy to
  follow": a bookmark that keeps working.
- The model list is the NHC ATCF a-deck verbatim — OFCL, TVCN, HCCA, AVNI, HWFI, HFAI/HFBI,
  HMNI, CTCI, GDMI, SHIP/DSHP/LGEM, IVCN and so on — plotted as a Highcharts intensity chart
  and four static UWM images ("early cycle" / "late cycle"). The official forecast is
  alphabetical among the rest; no cycle time is shown; no previous cycle; the only synthesis
  is the median and mean of the members' peak wind.
- Nothing environmental. Wind radii and watches appear only as verbatim advisory text.
- Freshness: ISO stamps inside the advisory text, "N hours ago" on map popups, no page-level
  age and no model run time.

**SpaghettiModels** (one hand-built page):

- Despite the name, no spaghetti plot is embedded: model content is a link wall to Tropical
  Tidbits, FSU, Albany, cyclonicwx, weathernerds and DeepMind WeatherLab.
- Its real value is breadth of environment: OSPO shear and TCFP diagnostics, CIMSS steering
  and vorticity, SST / TCHP / anomaly, SAL, precipitable water, MJO and CPC hazards, GOES
  sectors, ASCAT, all hot-linked from the primary hosts so they are always current.
- Costs: 129 images and 499 links with no headings, no valid-time labelling anywhere (the
  "LIVE as of" clock is the visitor's), no per-storm pages, no invest workflow, and several
  hard-coded URLs and 2015-era query strings.

**The lesson that shaped the tranche.** Both sites hand the reader pictures and leave the
interrogation to them. Cyclocane's a-deck list is exactly the raw material a disagreement
metric needs, and it stops one step short of computing one; SpaghettiModels' breadth is
exactly what a sampled environmental runway needs, and it stops one step short of sampling.
Neither site says when anything is valid. Those three gaps — measure the disagreement, label
the clock, say what changed — are what Millibar should own.

## 2. What already existed (audit)

Before touching anything, the repo already had, and none of it was duplicated:

- **The a-deck, parsed on every 10-minute tick** (`scripts/lib/atcf.mjs`) — but only three
  aids (HCCA, TVCN, DeepMind) were kept, for the probability engine; every other model run was
  parsed and dropped. `latest.json` carried a per-storm `consensus` block and the frame
  carried its scalars.
- **The b-deck** (best track, wind radii, latest fix) and the **f-deck** (scatterometer and
  aircraft fixes); SHIPS diagnostics (shear, OHC, RH, MPI, RI probabilities); TGFTP
  reconnaissance; NHC forecast track and a reconstructed cone; GOES/VIIRS imagery; the TWO
  with its polygons; Kalshi/Polymarket contracts; HURDAT2 climatology; ENSO.
- **Bitemporal replay** with a frame register that diffs committed snapshots, a claim registry
  that owns every capability sentence (`docs/app/claims.js`, enforced by
  `scripts/audit-claims.mjs`), zero-peek rules in the backtest, sample gates and refusals in
  the Atlas, and a large deterministic and browser gate suite.
- **The Storm Atlas** with genesis-radius / month conditioning already expressible as a URL
  (`?v=1&w=lat,lon,km&mo=M`) and an operational layer joined by ATCF id — the two halves a
  bridge needs, without the bridge.
- **A recorded negative result** (`docs/PLAN-TRACK-MODEL.md`): the consensus intensity blend
  had no skill over four seasons. That is why nothing built here feeds a price.

Three defects found in passing and fixed: the header read `ADV NaNm` and the panel read
"Advisory ingestion lag NaN min" (a frame accessor read as a number in two places; visible in
the user's own screenshot); and f-deck fix positions were parsed as tenths of a degree when
the f-deck stores hundredths, so `latest.json` carried a scatterometer fix at 230.6°N; and
`check-panel-dom` required a Wilson interval of the live payload unconditionally, so on a day
when every live analog entry is refused below the sample gate (2026-09-06: 4, 0 and 0 storms
with a known outcome) the gate failed the panel for the archive's honesty — it was already red
on the base commit, and now requires the interval only of a payload that publishes a rate.

## 3. Ranking

Score = decision value × differentiation × data quality ÷ implementation complexity, each 1–5,
judged after the audit. Items that share an ingest are grouped; the tranche is the top block.

| # | Opportunity | value | diff | data | ÷ cost | score | verdict |
|---|---|---|---|---|---|---|---|
| 1 | Track guidance + spread / centroid / scenarios | 5 | 4 | 5 (a-deck, already fetched) | 2 | 50 | **built** |
| 2 | Intensity guidance fan | 4 | 4 | 5 (same deck) | 1.5 | 53 | **built** |
| 10 | Model disagreement signal (5 metrics) | 5 | 5 | 5 | 1.5 | 83 | **built** |
| 3 | Cycle delta engine — guidance and official track, at valid time | 5 | 5 | 5 (previous cycle in the same file) | 2 | 62 | **built** for guidance and OFCL; watches/radii/recon deltas already existed in the register |
| 13 | Feed / cycle health (VALID · FETCHED · AGE · CADENCE · STATUS) | 4 | 3 | 5 | 1 | 60 | **built** |
| 8 | Millibar → Atlas bridge (genesis + month + ATCF id) | 4 | 5 | 4 (b-deck first fix; pack lags IBTrACS) | 1 | 80 | **built** |
| 6 | Synchronized evidence clock | 4 | 4 | 3 (only the frame's scalars are bitemporal) | 3 | 21 | **built** for the envelope: the scalars ride the cursor, and the geometry is WITHHELD under a historical as-of rather than drawn from the deck in hand |
| 11 | Contract lens (price · official · Atlas rate · raw guidance) | 4 | 4 | 3 | 2.5 | 19 | deferred; guidance is on the board beside the anchor, never inside it |
| 4 | Environmental runway sampled along the track | 4 | 5 | 2 (SHIPS gives storm-centre values; along-track needs GRIB sampling) | 4 | 10 | deferred |
| 5 | Official hazard geometry (radii, watches, surge/rain) | 4 | 2 | 4 (b-deck radii parsed; GIS shapefiles not) | 3 | 11 | deferred |
| 9 | Historical trajectory envelope in the Atlas | 4 | 5 | 4 (tracks in the pack) | 3 | 27 | deferred, needs Atlas-side attrition semantics |
| 7 | Disturbance → invest → name continuity | 3 | 4 | 2 (TWO areas carry no id; invests are `xx9x` decks) | 4 | 6 | deferred |
| 12 | Exposure point lens | 3 | 3 | 4 | 3 | 12 | deferred |
| 14 | Verification lab, bitemporal archive, other basins | 3 | 4 | 3 | 5 | 7 | longer-term |

## 4. What was added

**Pipeline**

- `scripts/lib/guidance.mjs` — the envelope. A named roster (early interpolated forms
  preferred, late forms flagged), tracks and intensities for the latest and previous cycle,
  per-lead centroid / mean and max spread / official-vs-centroid / official-vs-consensus /
  single-linkage scenario partition at a stated threshold / previous→current at the **same
  valid time**, an intensity fan with previous-cycle values interpolated to this cycle's valid
  times, peaks, a 72 h trend, frame scalars, and the genesis fix from the b-deck's first row.
  ~27 KB per storm.
- `scripts/lib/atcf.mjs` — `parseAdeckCycles` (the last N cycles, merged exactly as the
  single-cycle reader merges), and the f-deck hundredths fix.
- `scripts/ingest.mjs` / `scripts/fetch-data.mjs` — `guidance` and `genesis` on each storm,
  the scalars on each frame, the envelope handed to nothing that prices.
- `docs/app/compute.js` — a `guidance` register signal: cycle landed, spread tightened /
  widened / held, scenario count changed, official vs consensus, members' median vs official
  peak; classified material or cosmetic, never trade-relevant; lifecycle `assessed` is n/a
  because nothing in it is priced.

**Terminal**

- `docs/app/map.jsx` — a *Model Guidance* layer under the official track and the cone:
  members thin and muted by class, consensus aids heavier and pale, previous-cycle official
  as a dotted ghost, lead centroids as crosses (no ring, because a ring reads as a cone).
- **The as-of rule.** The frame stores the envelope's scalars and no geometry, so a rewound
  cursor shows the numbers that frame recorded — read from the frame's own row, never through
  the loader's fall-back-to-latest accessors — while the tracks, the lead table, the intensity
  fan, the member roster, the deck's health row and the latest cycle id in the masthead are all
  withheld, replaced by `HISTORICAL GUIDANCE GEOMETRY NOT STORED FOR THIS FRAME` / `Recorded
  cycle metrics below remain valid as-of this cursor.` The test is a **fingerprint, not a cycle
  id**: an a-deck accretes late-arriving members for hours after its cycle time, so a frame keeps
  its geometry only while every scalar it recorded still matches the deck in hand. At live
  everything reads from that one deck, so no part can disagree with another. One predicate
  (`MT_guidanceGeometryAt`) serves the panel, the rail strip, the layer chip and the map, whose
  guidance layer moved into its own cursor-keyed effect so scrubbing toggles it without
  rebuilding the cone, the track and the eye. A storm with no deck at all keeps its NO FEED
  health row — that absence is a feed statement, not a leak.
- `docs/app/guidance.jsx` — the rail strip (five metrics, health status, the bridge) and the
  Models-tab panel (metrics as previous → current → delta, the lead table with valid times,
  the intensity fan with category thresholds, the members, the health row judged at the
  frame's clock, the bridge, the semantics footer). Rewound frames show an AS OF banner and
  that frame's scalars.
- `docs/app/feed-health.js` — one freshness rule; the header pills and the table behind them
  rebuilt on it (ADV · GUID · RECON · SAT · MKT · SNAP, ten rows in the table).
- `docs/app/claims.js` — `map.guidance`, `guidance.semantics`, `guidance.threshold`,
  `guidance.replay`, `atlas.bridge`, `feed.health`, `note.guidance`; the `advisory.latency`
  NaN fix.
- Layer toggles are buttons with `aria-pressed`; on phones they fold into one LAYERS control
  so apparatus never covers more than a quarter of the map; the header and the transport wrap
  instead of scrolling the page sideways (main already scrolled sideways at 390 px).

**Storm Atlas**

- `?atcf=` surface key, resolved by `rowOfAtcfId` under the operational join's rules; a
  notice under the question says whether the storm is a row yet, because the pack is IBTrACS
  and a storm on the board now is usually not in the archive yet. The cohort opens either way.

## 5. What was rejected, and why

- **Drawing GEFS/GEPS perturbation members.** Thirty members of one model describe one
  model's internal uncertainty; drawn beside twelve independent runs they swamp the
  disagreement that matters. They are counted in the census and named as not drawn.
- **A spread ring around the centroid.** It reads as a cone. Crosses with the numbers in the
  tooltip instead.
- **A "confidence" word anywhere.** The trend is tightening / widening / steady on a stated
  threshold; scenarios are counts; nothing is calibrated, so nothing is called confidence.
- **Feeding the envelope into fair value.** The recorded backtest says the consensus blend
  had no skill; the envelope is shown beside the anchor and `test-guidance.mjs` reads the
  engine, the Kelly path and the edge book to prove it stays outside them.
- **Scraping either site.** Everything here reads the NHC ATCF decks the sites themselves
  read.
- **ECMWF.** Not in the public a-deck (licensing); listed as absent rather than fetched from a
  third party.
- **A weather-link directory or an environmental image wall.** The environmental runway is
  deferred to a sampled, synthesized form rather than reproduced as pictures.

## 6. Sources and provenance

| Data | Source | Where it is read |
|---|---|---|
| Model guidance, latest + previous cycle | NHC ATCF a-deck, `https://ftp.nhc.noaa.gov/atcf/aid_public/a{id}.dat.gz` | `scripts/ingest.mjs` → `parseAdeckCycles` → `guidanceFrom` |
| Genesis fix | NHC ATCF b-deck, `.../btk/b{id}.dat`, first positioned row | `genesisFromBestTrack` |
| Fix positions (hundredths) | NHC ATCF f-deck, `.../fix/f{id}.dat` | `parseFdeck` |
| Cadences | NHC synoptic cycle (00/06/12/18Z), NHC advisory schedule, the pipeline's own tick | `docs/app/feed-health.js` `CADENCE` |
| Scenario threshold | 150 km + 3.5 km per hour of lead, roughly twice NHC's published mean track errors | `scenarioThresholdKm`, stated on every lead and in `guidance.threshold` |
| Fixtures | real two-cycle a-decks and b-decks for EP11/12/13, 2026-09-06 | `scripts/fixtures/` |

## 7. Screenshots

`shots/terminal-{wide-2560,half-1280,compact-1024,narrow-900,phone-390}-{situation,guidance}.png`
and `shots/atlas-bridge-{missing,resolved}-1440.png`. Tiles and imagery are blocked in the
harness, so the map shows the vector layers over an empty ground; the live page draws them
over CARTO and GOES.

## 8. Tests

Deterministic:

- `scripts/test-guidance.mjs` — 14 groups: roster semantics on a real deck, valid time on every
  point, cycle-to-cycle at the same valid time (a naive tau match would report ~64 km of
  motion as a shift; the engine reports 0), `asOf` no-future-leak, null never zero, exclusions,
  early vs late forms, radii duplicates, the partition, the antimeridian, isolation from
  `probability.mjs` / `estimator-core.mjs` / `calibration.mjs` / `calibratedIntensityP` /
  `kellyFor` / `edgeBook`, real-deck sanity and payload budget, genesis, f-deck hundredths.
- `scripts/test-feed-health.mjs` — the status ladder at its boundaries, two clocks kept apart,
  FUTURE never clamped, absent never LIVE, event sources never STALE, worst-of and latest, the
  board rows with no NaN, a rewound clock reading the deck as FUTURE.
- `scripts/test-atlas-bridge.mjs` — the resolver and the link's shape at both ends.

Browser:

- `scripts/check-terminal-responsive.mjs` at 2560, 1280, 1024, 900 and 390 px: map floor
  (≥480 / ≥300 px) and width share, no sideways scroll, layer controls ≤25 % of the map and
  folded on phones, semantics footer text, health pills with statuses and no `NaN`, VALID
  columns, health at the frame's clock, the null-deck state, the genesis bridge (not the
  current position), a11y attributes, render budgets, no page errors, no missing assets.
  It also withholds one storm's envelope deterministically, so the null state is exercised on
  every run rather than whenever the ocean happens to carry a storm this repo has no fixture
  for — the day Karina dissipated, both remaining storms had fixtures and that path went
  unexercised.
- **The as-of rule, in four steps at every width.** 1 LIVE renders the geometry, the lead table
  and the fan. 2 REWOUND shows the frame's own 72 h spread — the fixture writes it 40 km wider
  than the deck's, so the frame's number and the deck's cannot be mistaken for one another.
  3 REWOUND renders no lead table, no fan, no members, no deck health row, no map layers
  (counted through `__MT_GUIDANCE_DRAWN`, because the polylines are canvas-drawn and have no
  DOM node to query), no latest-deck cycle id or roster count anywhere in the block, and states
  the absence in as many words. 4 Returning to LIVE restores all of it. A fifth step proves the
  rule is a fingerprint rather than "any rewind hides": a rewound frame that recorded *this*
  deck keeps its geometry.

All wired into `.github/workflows/checks.yml`. The Atlas bundle was rebuilt with the pinned
esbuild and byte-compares to source; the existing Atlas suites that touch the changed
modules pass.

## 9. Next five

1. **Environmental runway along the official track.** Sample shear, RH, SST/OHC and MPI at
   NOW/+24…+120 from the GRIB reader that already exists (`scripts/lib/grib2.mjs`) rather
   than from SHIPS' storm-centre row, and set each beside the Atlas cohort's environment
   distribution where the archive holds the same field.
2. **Contract lens.** One row per contract with MARKET PRICE · OFFICIAL FORECAST · ATLAS
   RATE · RAW GUIDANCE (members' median), divergence highlighted, guidance still outside the
   grade — the four columns now exist in three places.
3. **Historical trajectory envelope in the Atlas.** Matched storms at +24…+120 h from
   genesis, dispersion and attrition per lead, styled as a distribution, with the current
   official forecast located against it when the storm is a row.
4. **Official hazard geometry.** The b-deck 34/50/64 kt radii (already parsed) drawn as
   quadrant arcs, and the watch/warning breakpoints and cone from NHC's GIS shapefiles,
   labelled as official products.
5. **Invest continuity.** Read the `xx9x` invest decks and the TWO's area ids so a
   disturbance keeps one thread through naming, with its formation-probability history.
