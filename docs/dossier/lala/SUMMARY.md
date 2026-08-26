# Lala CP012026 — event dossier

**Millibar · 2026 EP/CP Pacific · archive id 2026222N15223 · built 2026-08-25 20:52Z**
Archive c3998bd7bd784a62 · methodology 1.1.0 · full dossier `/dossier/lala` · facts `facts.json`
External / public contract facts used: **none**.

**Two records describe this storm. They begin at the same instant, 2026-08-10 00:00Z, and end 9.8 d apart.**

| | ARCHIVE — IBTrACS, provisional | OPERATIONAL — ATCF b-deck |
|---|---|---|
| Last fix | 2026-08-16 00:00Z | 2026-08-25 18:00Z |
| Peak wind | 65 kt, Category 1 | **115 kt, Category 4** |
| Minimum pressure | 988 mb | **947 mb** |
| Fixes | 49 (28 pre-genesis) | 64 (14 pre-genesis) |

Neither record corrects the other. Every statistic below is computed from the archive alone.

**This was not a Category 4 near-miss of Hawaiʻi.** Closest approach to the Main
Hawaiian Islands was **61 km** at 2026-08-16 06:00Z, at 65 kt. The 115 kt peak
came 3.0 d later, 946 km from the islands —
885 km further away than at the nearest passage, and
15× it. Intensity and proximity did not coincide. Distances are
minimum geodesic distance to coastline *segments* of the archive's own Hawaiʻi geometry, not to
stored vertices; the northwestern chain (closest approach 40 km, 2026-08-21 06:00Z) is
partitioned out by ring, because it is uninhabited and runs 1,807 km further west.

**The archive record ends 6 h before that closest approach**,
at 67 km and still closing. Everything after 2026-08-16 00:00Z exists only in the
operational record.

**The environment Lala formed in is REFUSED.** No operational environment record exists before 2026-08-18T00:00Z, and the archive holds no developmental SHIPS record within 12 h of genesis. The environment Lala formed in is unmeasured by both sources.

**What the historical record supports.** Storms forming within 500 km of
14.9°N 145.0°W — N = **26**, effective sample size 26, minimum 10, sufficient.

| Outcome | All seasons | 95% Wilson | From 1971 | 95% Wilson |
|---|---|---|---|---|
| Reached Cat 3+ | 5/26 · 19.2% | 8.5–37.9% | 3/18 · 16.7% | 5.8–39.2% |
| Reached Cat 4+ | 4/26 · 15.4% | 6.1–33.5% | 2/18 · 11.1% | 3.1–32.8% |
| Hawaiʻi landfall, any | 1/26 · 3.8% | 0.7–18.9% | 0/18 | **OUT OF SCOPE -- unscoreable here** |

Cumulative thresholds, not exclusive bins. Three qualifications, printed rather than buried:

1. **Lala is not in this cohort.** Its genesis defines the location condition; the archive's
   provisional-record scope then excludes it. No operational value enters any number above.
2. **The entire Hawaiʻi numerator is one storm** — Dot (1959), Kauai,
   1959-08-07, 75 kt, detection `bracketing_fix`. 3.8% with a numerator of one
   1959 event is a count, not a frequency, and 0.7–18.9% says so.
3. **Under the archive's own quality remedy the rate refuses.** A season floor of
   1971 — which the archive recommends, because 8 of 26
   cohort storms predate the reliably-observed era — removes Dot and the outcome becomes
   0/18: **OUT OF SCOPE -- unscoreable here**.

**That is the answer about Hawaiʻi risk at this genesis point: over the reliably-observed era, the
record declines to support a rate at all.**

**What Millibar recorded, and when.** 141 timestamped entries, 2026-08-14 16:22Z to
2026-08-25 20:48Z, on one question — `hurricane@65`, whether Lala would reach 65 kt.
Not a Hawaiʻi question, not a Category 4 question; no record of either exists. First
record 2026-08-14 16:22Z at 59.8%, 26 h before
Lala reached 65 kt at 2026-08-15 18:00Z.

**This demonstrates point-in-time replay discipline, not forecasting skill.** The calibration
ledger declines to publish a score: 2 resolved storms of the
10 required. One storm cannot establish calibration and this document
does not claim it does. What it establishes is that those values were recorded before the outcome
and have not been edited since.

**The separation is enforced, not observed.** No module computing cohort membership, analog
matching, rates, Wilson intervals, effective sample size, calibration or a refusal can reach the
operational layer: a build gate walks the import graph, and a second recomputes every published
historical value with the operational artifact absent and again with it loaded, requiring both to
be identical.

---
**Request an institutional walkthrough / design-partner discussion.**

Research use. Not a forecast, not advice, not an offer. Every value above is reproduced by
`node scripts/build-dossier-lala.mjs` and recorded in `facts.json`.
