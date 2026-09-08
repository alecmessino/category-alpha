# Q1 — is the position-departure measurement accurate?

Result of the first of the three pre-registered questions
(`research/track-residual/PRE-REGISTRATION.md`). Measured by `scripts/residual-q1.mjs`; the
machine-readable output is `Q1-RESULT.json`, and `scripts/test-track-residual.mjs` §14 gates the
claims below against it.

**Q2 and Q3 are not started and nothing here answers them.** Q1 asks whether the module reads and
reduces the products correctly. That is a question about parsing, interpolation and frames. It is
not a skill claim, it cannot become one, and no number below should be quoted as one.

---

## Population and coverage

| | |
|---|---|
| Basin / seasons | EP, 2015–2025 |
| Criterion | at least one intermediate public advisory in the archived `messages/` index |
| Storms | **65** |
| Forecast/advisories read | 1105 |
| Positions parsed | 7013 |
| Deck rows compared | 6907 |
| Intermediate advisories used | 611 of the 634 that parsed (637 products, 3 unreadable) |
| HTTP fetches | 2515, **0 failed** |

The population is re-derived from the archived indexes inside the sweep rather than taken from the
coverage report, so the two agree by construction rather than by copying.

---

## Q1a — parse: 6907 rows against the a-deck, and 7013 against the products' own bytes

**Reference.** NHC publishes the same official forecast twice: as prose in the forecast/advisory
(TCM) and as rows in the ATCF a-deck under the tech id `OFCL`. They come from one forecast, so at
the 0.1° both encode they must agree. `OFCI` is deliberately not used — it is the official forecast
*interpolated forward* for the next cycle, so comparing against it would report NHC's own
adjustment as a parse error.

**The join is NHC's construction and uses times only.** A forecast/advisory's first `FORECAST VALID`
row is TAU 12 of its own cycle, so the cycle is `first forecast row − 12 h`, exactly, with no
search. The cycle must additionally carry a row at the advisory's own initial valid time — TAU 3
for a standard 15Z advisory — or the deck's rows are anchored on a different analysis and the
advisory is refused rather than compared. **Position agreement never enters the join**; a join that
preferred the cycle whose positions agreed would report zero error against any deck at all.

Two earlier joins were wrong and Q1 is what found them, which is worth recording because both
produced plausible-looking numbers:

| Join | What it did | Reported |
|---|---|---|
| latest cycle with a row at the advisory's initial time | matched an 18Z special advisory against the *next* cycle's TAU 0 | 18.90 nm |
| cycle matching the most valid times | matched a 15Z advisory against a cycle twelve hours older, because every cycle has rows at 00Z and 12Z | 132.04 nm |
| **first forecast row − 12 h, with a like-for-like check** | — | **see below** |

### Result

| | Rows | Exact (<0.05 nm) | Non-zero | Max |
|---|---|---|---|---|
| Initial rows | 1057 | 1051 | 6 | 29.52 nm |
| Forecast/outlook rows | 5850 | 5839 | 11 | 13.06 nm |
| **Total** | **6907** | **6890 (99.75%)** | **17** | **29.52 nm** |

p50 = p90 = **p99 = 0.00 nm**. 57 of 65 storms agree exactly on every row.

### The 17 disagreements are between NHC's two channels, not parse errors

This is the load-bearing claim, so it is established without the deck. Every parsed position is
re-formatted into the notation the product prints and required to appear verbatim in the product's
own bytes:

> **7013 / 7013 positions verbatim.**

That check has one author. It cannot be satisfied by a parser that read the right line and mangled
the number, read a neighbouring line, or swapped a hemisphere. So where the deck and the module
disagree, the module is reproducing the transmitted product and the two NHC channels differ.

Inspected directly, the disagreements are single-tenth edits. ep022015 advisory 6:

| Valid | TCM prints | `OFCL` row |
|---|---|---|
| 02/1200Z | 13.0N 104.2W | 13.1N 104.2W |
| 03/0000Z | 12.9N 104.4W | 13.0N 104.3W |
| 03/1200Z | 12.7N 104.5W | 12.8N 104.4W |

The largest, 29.52 nm, is one initial row on ep212018 advisory 44: the product says
`17.5N 124.9W AT 10/0900Z`, the deck's TAU 3 says `17.9N 124.6W`. One of the eight affected storms
(ep152016) is a retransmission — the archive holds two transmissions of advisory 5, eight minutes
apart, and both were read.

**What this costs a consumer.** Nothing here, because the module reads the TCM. But a consumer who
took the track from the deck instead would occasionally get a forecast position 6–30 nm from the
one that was transmitted, on about 0.25% of rows.

---

## Q1b — the nominal lead label is nine hours, on essentially every advisory

| INIT → first forecast row | Advisories |
|---|---|
| **9 h** | **1062** |
| 6 h | 7 |
| 8.5 h / 7.5 h / 6.5 h | 1 each |
| **12 h** | **0** |

The Lowell fixture was not a special case. It is the rule: **99.1% of the 1072 advisories place
their first forecast row nine hours after their initial position**, and none places it twelve.

The mechanism is visible in the deck's own encoding. TAU is measured from the **synoptic cycle**,
not from the initial position: a 15Z advisory off a 12Z cycle carries its initial position at
TAU 3 and the row the product labels "12H" at TAU 12. Twelve hours from the cycle; nine from the
analysis. Reading the label instead of the clock displaces the interpolated forecast position by
10.88 nm on Lowell — and would do so on 1062 of 1072 archived advisories.

---

## Q1c — what the interpolation costs, by gap

Hold-one-out: an interior issued position is dropped, reconstructed linearly in time from its
neighbours, and compared against the position NHC actually issued. The issued node is a real
reference and the error is a real error.

Deck rows of each advisory's own cycle are spaced TAU 0 / 3 / 12 / 24 …, which reaches shorter
gaps than the TCM's 12-hourly rows can:

| Gap | Nodes | p50 | p90 | Max |
|---|---|---|---|---|
| 12 h | 1070 | **3.32 nm** | 9.62 | 77.9 |
| 21 h | 986 | 8.78 nm | 18.29 | 46.0 |
| 24 h | 2578 | 9.44 nm | 21.14 | 61.4 |
| 36 h | 607 | 15.29 nm | 35.73 | 87.2 |
| 48 h | 1122 | 26.70 nm | 62.72 | 178.6 |

Monotone in the gap, as it must be. Per storm, the median deck-row error is 8.78 nm (max 22.70).

**This is an upper bound on what the module does, not a measurement of it.** The module
interpolates inside a 9-hour segment — from the advisory's initial position to its first forecast
row — and no product provides a position inside that segment to test a reconstruction against. The
12 h figure is the finest gap the archive can measure, and the module's gap is shorter than it.
The trend across the table supports extrapolating downward; the value at 9 h is **not measured**
and is not claimed.

Separately, the linear-in-time path's deviation from a geodesic through the same two forecast
positions is p50 **0.17 nm**, max 10.23 nm — an order of magnitude below the reconstruction error,
which says the interpolation's cost is in treating a curve as straight, not in treating the earth
as flat.

---

## Q1d — the frame is a choice, and this is what it is worth

Not an accuracy: there is no true frame. This is how far the same residual moves between the
baseline forecast's local direction and the storm's reported motion, over 611 residuals on 65
storms.

| | p50 | p90 | Max |
|---|---|---|---|
| Course difference between the two frames | 7.21° | 22.46° | 143.12° |
| Cross-track difference | **0.63 nm** | 3.58 nm | 21.50 nm |
| Along-track difference | 0.54 nm | 3.14 nm | 39.49 nm |

Per storm, the median cross-track difference is 0.70 nm (max 3.21).

**This is a partly deflationary result and it is reported as one.** The frame distinction is
defended at length in `docs/TRACK-RESIDUAL.md` §1, and in the median it moves the cross-track
residual by two thirds of a nautical mile — well inside the coordinate rounding box (±4.14 nm) and
far inside the unfitted uncertainty band. On Lowell the difference was 0.46 nm.

The argument for the forecast frame is unchanged, because it is an argument about **meaning**, not
magnitude: "did the storm leave the forecast track, and on which side" is a question about the
forecast, and the two frames answer different questions even where they return similar numbers.
But anyone expecting the frame choice to be worth a lot of nautical miles should read the p50, and
the p90 of 3.58 nm and max of 21.50 nm are where it starts to matter — the tail, not the middle.

---

## What Q1 found that was wrong, and what was fixed

**A real bug in the shipped library.** `parsePublicAdvisory` built a valid time from the header's
**local** date and the summary's **UTC** hour. Whenever those fall on different days — which for an
evening advisory they always do — it was a day out. Measured on ep122022: `600 PM MDT Mon Sep 05`
carries `0000 UTC`, which is 6 September; the old reading dated it 5 September and placed the fix
twenty-four hours before the advisory it belonged to.

- It was invisible on the Lowell fixture, because both of that storm's intermediates are morning
  HST, where local and UTC share a date.
- It never emitted a wrong number. The coverage guard caught every instance as
  `BEFORE_TRACK_COVERAGE` — a refusal, not a residual. That is the guard doing its job, and it is
  also why nothing complained until a population-scale run looked at *why* things were being
  refused. **183 of the 634 intermediates that parsed were being silently refused for a reason nobody
  had read.**
- Fixed: the valid time is built from the local clock plus the zone the product names, and the
  printed UTC hour is now a **cross-check** — two statements of one instant that disagree are
  refused, not reconciled. An unrecognised zone is refused rather than defaulted to UTC.
- Regression: the real ep122022 product is preserved as a fixture with its URL and hash, and
  `scripts/test-track-residual.mjs` §3b pins it. After the fix, 611 of 634 intermediates produce a
  residual; the remaining 23 are 21 products with no reported motion to compare frames against and
  2 with no matching full advisory.

**Two wrong joins in the Q1 harness**, described above, both of which produced plausible numbers
before being caught.

---

## Missingness

Published rather than dropped. Denominators above are after these exclusions.

| | Count | |
|---|---|---|
| Advisories with no comparable deck cycle | 48 of 1105 | 33 had no forecast rows at all; 14 had no deck row at the advisory's initial time (`REFERENCE_NOT_LIKE_FOR_LIKE`); 1 had no deck cycle at that time |
| TCM rows with no deck row at the same valid time | 73 | counted, not matched to a neighbour |
| Intermediates refused | 23 of 634 that parsed | 21 no reported motion, 2 no matching full advisory |
| Intermediates that would not parse | 3 | |
| Storms with no a-deck / no b-deck | 0 / 0 | |
| Failed fetches | **0** of 2515 | |

---

## Retrospective reference — labelled, and not used

The a-deck's own `TAU 0` row (the operational analysis at a synoptic instant) against the
post-season best track at the same instant. Both answer "where was the storm"; one was written at
the time and one months later.

| n | Storms | p50 | p90 | Max |
|---|---|---|---|---|
| 1063 | 65 | **6.00 nm** | 18.92 nm | 98.37 nm |

**This is context, not an input.** It is not used in any residual, correction or score, and no live
quantity anywhere in the module is substituted from it. What it says is worth stating plainly:
post-analysis later moves the operational position by a median of one tenth of a degree, which is
**the same order as the residuals this module measures**. A 14 nm departure is being measured
against an "observed" position that is itself revisable by a median 6.00 nm.

---

## Assessment

**What Q1 establishes.** The module reads what NHC transmitted: 7013 of 7013 positions verbatim
against the products' own bytes, and 6890 of 6907 rows identical to NHC's independent deck
encoding, with all 17 exceptions attributable to a difference between NHC's two channels rather
than to the parse. The lead-label trap is structural and near-universal, not a Lowell quirk. The
interpolation's cost is bounded and stated by gap. The frame choice is worth less in the median
than the argument for it might suggest, and that is now on the record with a number.

**What Q1 does not establish.** Anything about forecasting. Q1 is a statement that the geometry is
computed on the products it claims to be computed on. A module can be exactly right about where the
storm was relative to a forecast and have no predictive content whatsoever, and this result is
consistent with that.

**What it changes about what comes next.** Three things, and none of them is a reason to relax a
gate:

1. The uncertainty budget now has a measured term where it had none. Interpolation contributes
   ≤3.32 nm at the finest measurable gap, and the coordinate rounding box is ±4.14 nm — so a
   residual under roughly 5 nm is inside the module's own arithmetic before any observation
   uncertainty is counted. The provisional band stays provisional; this is one measured
   contribution to it, not a fit.
2. The retrospective reference says the observed position is revisable by a median 6.00 nm. Any
   future calibration has to carry that, or it will be fitting to a target that moved.
3. 611 usable residuals across 65 storms is what Q2 would have to work with, and the sampling unit
   is the storm — so it is 65, not 611.

**A negative worth recording.** Q1d is the closest thing here to a null result: the frame
distinction this module is built around moves the median cross-track residual by 0.63 nm. It is
reported at the top of the section rather than buried, and it does not change the design, because
the case for the forecast frame was never that it moves the number.

---

## Next

Per the sequence: **stop here.** Q2 does not start until this write-up exists, which it now does.
Q2 remains unstarted, Q3 remains unapproached, the settlement registry remains empty,
`residual_state` remains unwired, and nothing in this module has been scored.

```bash
node scripts/residual-q1.mjs            # rebuild Q1-RESULT.json (network, ~7 min, 2515 fetches)
node scripts/test-track-residual.mjs    # 191 checks, offline, gates the claims above
```
