# The Track Residual Monitor

An auditable measurement of where a storm actually is against where an issued forecast said it
would be — with the frame it was measured in, the uncertainty that is not yet known, and the
claims that are refused.

**Status: unmerged preview.** Nothing here is wired to the board, to the Edge Book, to
mark-to-bid, or to any published probability. `residual_state` is deliberately left unwired.

**Predictive advantage and commercial value are hypotheses, not findings.** No part of this
module has been scored against a held-out storm, and no surface it produces says otherwise.

| | |
|---|---|
| Implementation | `scripts/lib/track-residual.mjs` (geometry), `-state.mjs` (what may be claimed), `-closure.mjs` (conditional kinematics), `-ingest.mjs` (sources), `-backtest.mjs` (scoring definitions), `scripts/lib/settlement-geometry.mjs` (contract terms) |
| Preview | `docs/preview/track-residual/` — reads `data.json`, contains no arithmetic |
| Gate | `scripts/test-track-residual.mjs` — 167 checks |
| Fixture | `scripts/fixtures/lowell-ep122026/` — eight preserved NHC products with URLs, retrieval times and SHA-256 |
| Coverage | `research/track-residual/COVERAGE.md` — measured, not estimated |
| Pre-registration | `research/track-residual/PRE-REGISTRATION.md` — written before any backtest is run |

---

## 1. What a residual is here, and what it is not

An advisory is a claim about future positions. A centre fix is an observation. Evaluated at a
shared valid time, the difference between them is a **residual**: a measurement, reportable with
its uncertainty.

It is not a trend, not a bias, not a forecast of the next advisory, and not an input to a price.
The sentence the module is built around, and prints:

> A residual can be reported with its uncertainty; a bias cannot be asserted from one fix, and
> this module will not assert one.

**Sign convention, printed on every artefact:**

```
+CROSS = RIGHT OF BASELINE FORECAST DIRECTION · +ALONG = AHEAD ALONG IT · ALONG ≠ SPEED ERROR
```

There is no hardcoded east. The geographic meaning of `+cross` is derived per call from the frame
(`crossPointsToward`), so a storm heading 023° and one heading 203° do not silently share a
"rightward" that means opposite things. Longitude is stored and returned as **signed degrees
east**; differences wrap to (−180, +180], so a 0.2° straddle of the antimeridian is 12 nm and not
21,580.

**The frame is the forecast's, not the storm's.** Along-track and cross-track are meaningless
without a direction, and there are two candidates: the baseline forecast's own local direction at
the evaluated time, and the storm's reported motion. They are not the same — on Lowell at
07/1800Z the forecast's local course is **023.11°** and the intermediate advisory reports motion
**030°**. "Did the storm leave the forecast track, and on which side" is a question about the
forecast, so the frame is the forecast's, derived from the same piecewise-linear-in-time path the
position came from. Reported motion is carried beside it and never substituted.

---

## 2. The concept brief's worked example was wrong, and here is the arithmetic

The brief called the metric validated on Hurricane Lowell (EP122026) and quoted a table. A table
cannot be re-read, which is how three consequential errors survived. The originals were
recoverable, so the correction is a computation over preserved bytes rather than an argument.

### 2.1 The products, preserved

| Key | Product | What it prints |
|---|---|---|
| `tcm-046` | TCM 46, forecast/advisory | INIT `07/1500Z 17.5N 162.6W`, `POSITION ACCURATE WITHIN 15 NM`, motion `025 DEGREES AT 12 KT` |
| `tcp-046a` | TCP 46A, intermediate | `18.0N 162.1W` at 1800 UTC, motion `030 DEGREES AT 15 MPH`, centre located **by an Air Force Hurricane Hunter aircraft** |
| `tcd-046` | TCD 46, discussion | "initial motion is north-northeastward or 025/12 kt … the guidance has shifted about 30 n mi to the east" |
| `tcm-045`, `tcm-047`, `tcp-046`, `tcp-047` | the neighbouring advisories | the superseded and superseding baselines |
| `fdeck`, `bdeck` | ATCF | the centre fixes actually filed, and the working best track |

Each carries its URL, retrieval time, the SHA-256 of the served page and of the product text.
`scripts/test-track-residual.mjs` re-hashes all eight before it asserts anything, so a passing
golden is a golden about bytes that have not moved.

**TCM 46 and TCP 46A are different products.** One prints knots and an advisory-analysed centre;
the other prints miles per hour and an aircraft centre, three hours later. The brief quoted
"030/15" against a 12 kt motion as though they described the same thing.

### 2.2 Wrong interpolation parameter

The brief's own §4.2 interpolates the forecast **in time**; its worked example interpolates to the
observed **latitude**. Matching latitude forces the latitude difference to zero, so for a
northbound storm the whole departure is mechanically reported as lateral — and the example then
read that artefact as physics.

It also trusted a nominal lead label. Lowell's TCM 46 is issued at `07/1500Z` and its first
`FORECAST VALID` row is `08/0000Z` — **nine hours**, filed under a nominal "12H". Reading the
label rather than the timestamp puts the 1800Z forecast position **10.88 nm** out of place, on
every off-synoptic advisory, silently. This module parses no lead labels at all.

Time-linear interpolation of TCM 46 to `07/1800Z`:

| Quantity | Brief | Recomputed from the product |
|---|---|---|
| Forecast position | 18.00N 162.38W | **18.1667N 162.3000W** |
| Observed (TCP 46A) | 18.0N 162.1W | 18.0N 162.1W |
| Separation | — | **15.18 nm** |
| Cross-track @ 030° (comparison frame) | +13.6 nm | **+14.89 nm** |
| Along-track @ 030° (comparison frame) | 0.0 nm | **−2.95 nm** |
| Cross-track, baseline-forecast frame 023.11° | — | **+14.43 nm** |
| Along-track, baseline-forecast frame 023.11° | — | **−4.72 nm** |

### 2.3 The along-track figure is wrong even on the brief's own construction

Under the brief's latitude interpolation the forecast sits at 18.0N **162.375W**, the displacement
is due east, and the separation is 15.70 nm. Projected onto the brief's own 030° heading:

- cross = 15.70 × cos 30° = **13.60 nm** — which reproduces the brief's number exactly, so the
  construction is identified rather than guessed at;
- along = 15.70 × sin 30° = **7.85 nm** — not 0.0.

So the brief did not project at all: it called an eastward displacement pure cross-track. An
eastward displacement on a north-northeast heading has a component on **both** axes. Under the
correct time interpolation the along-track term is **−4.72 nm** in the forecast's frame.

Nothing in this follows about a steering mechanism. One fix, at one moment, in a frame, is a
displacement. The discussion's own "guidance has shifted about 30 n mi to the east" is the
forecaster's statement about *guidance*, not a verification of the storm.

### 2.4 Closure mixed frames and mixed time

The brief subtracted a cross-track residual from an eastward shoreline gap. Those are not the same
coordinate: cross-track is perpendicular to a ~023° heading, an east-west gap is measured along a
parallel. The module refuses the operation structurally — `assertSameFrame` throws — and every
distance it produces is a great-circle separation between two positions, with any displacement
assumption applied to a **position** before a distance is taken.

The brief also read `21.9` as a lead. It is a latitude — Niihau's. Piecewise interpolation of
TCM 46 to 21.9N arrives at **08/0955:52Z**, which is **T+18.93 h** from the 07/1500Z initial time,
not T+21.9 h. The latitude-crossing diagnostic is retained, labelled as a diagnostic, and refuses
when the latitude is not crossed inside coverage, is crossed more than once, or the crossing
segment is not predominantly meridional.

---

## 3. Baselines, times, and the leak that flatters everyone

Five times are distinguished and persisted: model cycle, initial-position valid time, product
issue time, **first-availability**, and receipt time.

First-availability is not the nominal hour. NHC's live `adv/` directory writes one timestamped
file per transmission, and the filename is the send time:

| Advisory | Nominal | Actually on the wire | Offset |
|---|---|---|---|
| 46 | 07/1500Z | **07/1451Z** | −9 min |
| 46A | 07/1800Z | **07/1744Z** | −16 min |
| 47 | 07/2100Z | **07/2047Z** | −13 min |

An intermediate advisory is therefore on the wire *before the time it is valid for*. The module
reports that as a negative ingest latency with `receivedBeforeValidTime: true` rather than
clamping it to zero, because clamping would hide a real property of the feed.

**The leak gate.** A fix may be scored against a baseline only when the baseline could not already
contain it. On Lowell this is not hypothetical: the aircraft found the centre at 07/1649Z;
advisory 46A went out at 1744Z and says on its face that the centre was located by aircraft;
advisory 47 went out at 2047Z. So the 1649Z fix is legitimate evidence against advisory 46
(available 1451Z, lead 1.82 h) and is **refused** against advisory 47.

The gate also refuses zero and negative lead. An advisory's own initial position scored against
that advisory produces a clean 0.00 nm that looks like a forecast that was right; the test asserts
both that it would produce zero and that it is refused.

When first-availability is unknown the module **refuses rather than assuming the nominal hour**,
and names the missing assumption. Assuming availability is the direction that flatters the module.

**Two series, never merged.** `fixed-baseline` measures every fix against one advisory until it is
superseded; `latest-advisory` measures against whatever was in force. Every reset is marked, and
no trend is evaluated across one. On the Lowell window the reset 46 → 47 is visible on the strip,
and the row at the reset is refused by the leak gate — both facts on screen at once.

**How a six-hour window exists at all.** If the only observations were full advisories, a six-hour
window would hold two of them, one being the baseline's own analysis, so an official-only series
could never clear a gate of three independent groups. That is the correct answer, not a defect,
and the module returns it. Windows are populated by intermediate advisories and by non-advisory
centre fixes.

---

## 4. Four refusals, not one

A single "insufficient data" flag conflates four independent questions, and conflating them is how
"we have three fixes" becomes "we have a trend". Each field carries its own reason:

| Field | On the Lowell window | Why |
|---|---|---|
| `dataQuality` | **DEGRADED** — `MIXED_CENTRE_DEFINITIONS: aircraft-fix + dvorak-subjective + dvorak-objective` | An aircraft centre and an ADT centre answer different questions. No offset between them has been measured, so they are not one series. |
| `uncertaintyCalibration` | **UNCALIBRATED_UNCERTAINTY** | There is no empirical fit. There has never been one. |
| `sampleSufficiency` | 4 independent groups of 3 required — **SUFFICIENT** | Three of the five fixes are one group. |
| `trendStatus` | **NO_TREND_ASSERTED**, `promoted: false` | The promotion rule is a hypothesis, not a law. |

Sample sufficiency passing while uncertainty is uncalibrated is the normal state of this module
and is asserted as such.

**Independence is groups, not rows.** In the Lowell window, PGTW and PHFO filed subjective Dvorak
fixes thirty minutes apart and CIMSS an objective one ten minutes later — all three off **GOES-18**.
That is one independent group, not three, and the platform is read from the deck row rather than a
fixed column so a new fix format does not silently promote a Dvorak code to a satellite name.

| Fix | Valid | Cross-track vs TCM 46 | Group |
|---|---|---|---|
| AIRC (aircraft centre drop) | 16:49Z | +7.45 nm | `site:KNHC` |
| DVTS (PGTW) | 17:00Z | +15.47 nm | `platform:GOES18` |
| DVTS (PHFO) | 17:30Z | +16.80 nm | `platform:GOES18` |
| DVTO (CIMSS) | 17:40Z | +21.18 nm | `platform:GOES18` |
| TCP 46A | 18:00Z | +14.43 nm | `advisory:46A` |
| TCP 47 | 21:00Z | +13.60 nm | `advisory:47` |

Every fix is right of the forecast track. That is a *description of six numbers*, and the module
says nothing more about it.

**The noise floor is an assumption and says so.** The brief's 12 / 5 / 12 / 6 nm defaults are
carried unchanged as `PROVISIONAL_SIGMA_NM` with `provisional: true` and `fittedOn: null`, so a
future fit shows as a diff. Their quadrature is drawn on the strip labelled
`PROVISIONAL BAND ±18.7 nm — ASSUMED, NOT FITTED`. `WITHIN_NOISE` would mean "indistinguishable
from an unvalidated floor", which is a statement about the floor.

**A printed accuracy bound is not a sigma.** `POSITION ACCURATE WITHIN 15 NM` is preserved
verbatim. `withinNmToSigma` refuses without an explicit named assumption, and returns the
assumption with the number so the conversion cannot travel without its label.

**Coordinate rounding is not negligible.** At 18N, 0.1° is a half-step box of **±4.14 nm** —
comparable to the aircraft fix's own departure. It is reported as a box, not a sigma.

**Wobble is bounded, not removed.** The observed peak-to-peak spread across the window is
**13.7 nm**; it bounds the sum of wobble, observation error and any real departure without
separating them, and nothing is subtracted from a residual on the strength of it.

**The promotion rule is a candidate.** Three same-sign residuals, six hours, n ≥ 3, source tier
0–1 is implemented as `candidateTrendRule`, evaluated, reported, and never promoted. Source tier
is neither accuracy nor independence; six hours need not span a trochoidal cycle; and same-sign is
a weak test when consecutive fixes share an upstream source — which, on the only window here, they
do.

**The interpolation's own error is measured.** Linear-in-time against the geodesic through the
same forecast positions: **≤ 0.338 nm** over the forecast rows (wider if the day-6/7 outlook rows
are included, which is why the outlook is excluded from coverage rather than averaged in). It is
reported as a systematic bound beside the residual, never added in quadrature to it.

---

## 5. Closure — conditional kinematics only

No function emits `P(centre reaches X)`. `probability` is `null` on every result, beside a stated
refusal, and `EXACT TRIGGER NOT SCORED` is printed.

What is published is a **required rate** — the great-circle distance from a stated position to the
nearest point of a stated shoreline geometry, over the time remaining — and a **state**. Under
every displacement assumption tried against the Main Hawaiian Islands, the required rate to Niihau
is **8.36 kt over 30 h**, and the state is `UNRESOLVED — NO_INTERSECTION_IN_COVERAGE`. The
required rate being easily achievable and the path not intersecting are not in tension: one is
arithmetic about a distance, the other is a statement about a path.

Displacement assumptions are named (`forecast-as-issued`, `residual-persists`, `residual-decays`)
and an unnamed one is refused. The same displacement component is applied once, to the path,
before any crossing is found.

**A named lon/lat is a waypoint, not a shore.** Every coastline claim takes the rings the genesis
archive's own landfall rule tests against (`data/genesis-archive/coastlines/hawaii.geojson`), and
measures to the *segment* via `lib/geo-segment.mjs`. A caller supplying only a point gets a
refusal.

Refusals: multiple crossings, recurvature, target astern, no intersection inside coverage,
nonpositive time remaining, ambiguous shore side. Recurvature is real here — asked over the whole
of TCM 46 the path turns 112° and the closure correctly refuses, which is why the calculation is
windowed to the deadline being asked about and reports that it truncated.

---

## 6. Settlement geometry — a separate surface, deliberately empty

The contract registry holds nothing, and `getContract` returns
`UNRESOLVED — RULES NOT INGESTED`. A record is admissible only with the venue's own public rules
text, hashed and dated, plus qualifying geography, named exclusions, event window **with its
timezone**, intensity definition **with units and comparison semantics**,
`requiresCentreCrossing`, and a resolution authority. `defineContract` refuses and names the
missing field rather than filling one in.

Three things that are not contract terms, enforced: a market title, a hurricane warning polygon, a
map. A hurricane warning means hurricane conditions are expected somewhere in an area; it does not
decide whether the centre stays offshore. Settlement-qualifying, settlement-excluded, warning-area
and residual-marker are four named layers with four different authorities, rendered separately.

**An excluded-geography strike does not resolve No.** It is recorded as a non-qualifying event; if
the window is still open the contract is `OPEN`, and only the window closing without a qualifying
event resolves No. This is the single most tempting error in the file, because the strike looks
decisive on a map. The window, not the map, decides.

A Hawaii ≥64 kt landfall contract remains unscoreable as a probability by this module.

---

## 7. The backtest: three questions, none of them answered

`scripts/lib/track-residual-backtest.mjs` holds the scoring primitives and the definitions they
need, written before any run so the choices do not depend on the results. It scores nothing on
import and ships no number. See `research/track-residual/PRE-REGISTRATION.md`.

1. **Accuracy of the position-departure measurement.** A geometry question.
2. **Whether a promoted residual predicts the sign of the next advisory's track shift** at shared
   future valid times, in the *earlier* advisory's frame, with a 6 nm dead band where the answer
   is NO CALL rather than a coin flip.
3. **Whether anything here predicts a qualifying landfall or contract resolution.**

Success on (1) or (2) does not establish (3), and `scoreQ3` refuses to accept a directional
classification as a landfall probability: a Brier score needs a defined binary outcome and a
numeric forecast, and this module emits neither.

The sampling unit is the **storm** (or the promotion event), never the fix — `aggregateByStorm`
collapses before anything is counted, and asking for a Wilson interval over fixes is a refusal.
Training and held-out split on storms and on later periods; an overlap throws. Any result must be
reported against three trivial baselines: persist the last residual sign, persist the last
official bias, climatology.

---

## 8. What actually exists to test it on

Measured from two public indexes per season — `research/track-residual/COVERAGE.md`.

- **221 EP storms, 2015–2025**, every one with an f-deck and a guidance deck, all in seasons where
  first-availability can be established from the archived `messages/` index.
- **Only 65 of those 221 have intermediate advisories.** Intermediates are what make a sub-six-hour
  official window possible, so roughly 70% of the EP archive can only ever produce an official-only
  series — which this module refuses for sample sufficiency, correctly.
- **14 CP-id storms in eleven seasons, none with intermediates.** A CP stratum will usually be too
  thin to score; the honest output there is a base rate and a refusal.
- **The current season has no archived `messages/` index.** It is written after the season, so
  first-availability for a live storm comes from the live `adv/` directory, which is a different
  shape and is not retained historically.
- An f-deck's presence is not fix *density*. Eastern Pacific storms are rarely flown, so many
  f-decks hold satellite fixes only — one upstream platform, one independent group, hence
  `INSUFFICIENT_SAMPLE` under this module's own gate.
- **Receipt time at this pipeline does not exist for any historical storm.** Every historical
  residual carries an explicit availability assumption.
- The `cp` basin id undercounts Central Pacific activity: a storm that forms east of 140W keeps
  its EP id for life. Lowell was written by CPHC in Honolulu and counts as EP.

---

## 9. Assessment

**What the evidence supports.**

- The corrected worked example is reproducible from preserved bytes. Every figure in §2 is
  recomputed by the test suite from files whose hashes it checks first.
- The brief's three errors are identified precisely, not merely asserted: the interpolation
  parameter, the nominal lead label, and the missing projection — the last of which is
  demonstrated by reproducing the brief's own 13.6 nm from its own construction and then showing
  the along-track term it dropped.
- A residual can be measured, framed, and reported with its provenance, and every refusal in §10
  of the task fires on real data rather than on a synthetic case built to make it fire.
- The archive is large enough for question (1) and probably for (2); the coverage report says on
  which storms.

**What remains unproven.**

- Everything about skill. No number here has been scored against a held-out storm. The window on
  Lowell shows six same-sign residuals from **four** independent groups over four hours; that is
  a description of six numbers on one storm, and it is exactly the kind of pattern that looks like
  a signal and has never been tested.
- The uncertainty band is assumed. Until it is fitted, "inside the band" means nothing.
- Mixed centre definitions differ by several nautical miles and no offset has been measured, so
  the cleanest series in this build is still marked DEGRADED.
- Question (3) — landfall or contract resolution — has not been approached at all, and the module
  is built so that it cannot be answered by accident.

**What changed because the brief was wrong.**

| Brief | This module |
|---|---|
| Interpolates to observed latitude | Interpolates linear in time; latitude interpolation is a fenced diagnostic |
| Reads nominal `12H` labels | Parses no lead labels; explicit UTC valid times only |
| Reports an eastward displacement as pure cross-track | Full 2-D rotation into the frame; both axes always reported |
| Frame is the storm's reported motion | Frame is the baseline forecast's local direction; motion carried separately |
| Subtracts cross-track from an eastward shoreline gap | `assertSameFrame` throws; one frame, positions displaced before distances |
| Reads `21.9` as a lead | 21.9N is crossed at T+18.93 h, computed from the track's own valid times |
| Calls 12/5/12/6 nm an empirical noise floor | `PROVISIONAL_SIGMA_NM`, `fittedOn: null`, labelled on the chart |
| Drops `WITHIN 15 NM` into a quadrature | Preserved verbatim; conversion refuses without a named assumption |
| Treats source tier as a warrant | Tier is neither accuracy nor independence; grouping is by upstream platform |
| One data-quality flag | Four independent refusal fields, each with reasons |
| Promotes a trend on three same-sign fixes | The rule is evaluated and never promoted |
| Infers contract terms from context | Registry empty; a record without its rules text is refused |
| Treats an excluded strike as terminal | Non-qualifying event; the window decides |

---

## 10. Known limits, printed on the artefact

- Linear interpolation between forecast positions. The deviation from a geodesic is measured
  (≤ 0.338 nm over the forecast rows) and printed, not hidden.
- Wobble is bounded, not removed.
- The heading frame comes from a smoothed forecast path, not from the storm's instantaneous
  motion.
- Mixed centre definitions disagree by several nautical miles; no offset between them has been
  measured.
- A required rate is kinematics, not achievability.
- The quadrature noise floor is an assumption. `WITHIN_NOISE` is not absence of signal.
- Polygon containment is planar in lon/lat — valid at island scale away from the poles and the
  antimeridian, and stated where it is used.

---

## 11. Running it

```bash
node scripts/test-track-residual.mjs        # the gate — 167 checks, offline
node scripts/build-residual-preview.mjs     # rebuild docs/preview/track-residual/data.json
node scripts/fetch-residual-fixture.mjs --check   # re-fetch and compare hashes (network)
node scripts/residual-coverage.mjs          # rebuild the coverage report (network)
cd docs && python3 -m http.server 8099      # then open /preview/track-residual/
```
