# Pre-registration — does the evidence boundary generalise?

**Registered before any expanded measurement was run.** This file is committed and pushed on its
own, ahead of the runner that produces the results. A pre-registration that lands in the same
commit as its results is not a pre-registration.

Repository: `alecmessino/category-alpha`, branch `claude/storm-atlas-research-27ef4m`.
Methodology version at registration: **1.1.0**.

---

## 1. The question

Methodology 1.1.0 replaced an archive-wide event-sufficiency gate with a **scope-aware** one: the
gate counts the events a contract has *within the population the query can actually draw from*
(the basins its matches occupy, over the era it declares), rather than across the whole archive.

On the archive's own zero-peek replay of **10 contracts**, four earned no skill claim. The
archive-wide gate refused 1 of those 4; the scope-aware gate refuses 4 of 4, and refuses none of
the 6 that beat climatology.

That is a ten-point contingency table. It demonstrates the mechanism. It does not establish that
the mechanism generalises.

> **Does the evidence-boundary mechanism reliably separate historically learnable questions from
> historically unsupported ones across a materially broader contract population?**

The result is published either way. A negative result is a finding about the limits of this
method and is worth exactly as much as a positive one.

## 2. What was known at the time of registration — full disclosure

Standard practice is to declare what the registrant had already seen, because it bounds how much
freedom the design had.

**Known:** the existing 10-contract EP result in full, including which four earned no skill claim
and the 1-of-4 / 4-of-4 gate tallies. The per-region, per-basin **distinct-storm counts** in
`landfalls.parquet` (read while designing the enumeration): NA conus 693 / caribbean 503 /
mexico 238 / central_america 136 / hawaii 0; EP mexico 229 / hawaii 11 / central_america 9 /
conus 6 / caribbean 0. That storms.parquet holds 925 NA and 1,099 EP storms from 1971. That
`THRESHOLDS_KT` and `hours_to_{ts,cat1,cat3}` exist.

**Not known:** any replay result for any contract outside the existing 10, for either basin. No
expanded backtest has been run.

**Why the known counts do not compromise the design.** Event count is precisely what the gate
keys on, so choosing contracts by event count would be choosing them by something adjacent to the
outcome. The enumeration below is therefore **exhaustive over the archive's own structure** and
selects nothing: every threshold, every region, both basins, a uniform horizon grid. Knowing the
counts changed only one decision — to *include* the low- and zero-evidence cells rather than
filter them out, which makes the test harder, not easier.

## 3. The contract set — 25 per basin, 50 total

Enumerated by rule, not chosen. Applied identically to **NA** and **EP**.

**Intensity (6).** Every key in `schema.THRESHOLDS_KT` except `td`:
`reaches_ts_34kt`, `reaches_cat1_64kt`, `reaches_cat2_83kt`, `reaches_cat3_96kt`,
`reaches_cat4_113kt`, `reaches_cat5_137kt`.

**Landfall (10).** Every region the archive names except `unattributed`, crossed with
{`any`, `hurricane`}: `conus`, `caribbean`, `mexico`, `central_america`, `hawaii`.
**All five in both basins**, including cells with near-zero or zero evidence in that basin.

**Time-to-event (9).** A uniform grid, {`ts`, `cat1`, `cat3`} × {24, 48, 96} hours from genesis:
`reaches_<event>_within_<H>h`.

### Exclusions, declared in advance

- **`td`** — 0 kt. The schema itself says it is "not a wind threshold"; every storm satisfies it.
- **`unattributed`** — a residual bucket for crossings that resolved to no named region. Not a
  geographic question anyone would ask.
- **Landfall-timing contracts** — region × horizon would multiply the set without adding a
  distinct *type* of question. Intensity timing already tests whether the mechanism handles
  time-to-event at all.

### Time-to-event resolution and prediction, stated precisely

- **Resolves** from the storm's own `genesis_events.hours_to_<event>`: `True` if
  `hours_to_<event> <= H`; `False` if the storm reached the event later or never reached it (its
  full track is in the archive); **`None`** if the archive holds no value where one is required —
  never `False`. This follows the archive's fourth rule: unknown is not a failure.
- **Predicts** as the weighted fraction of analog cases with `hours_to_<event> <= H`, computed
  from `AnalogResult.cases` inside the contract.
- **This statistic is research-only.** It is deliberately *not* added to `analogs.py`, so the
  shared engine and its 175,319-comparison Python/browser parity are untouched. The consequence
  is stated up front: a time-to-event contract could not become a product surface without first
  moving the statistic into the engine and giving it parity coverage.

## 4. Settings — identical to the published EP run

| setting | value |
|---|---|
| `radius_km` | 500 |
| `season_window_months` | 3 |
| `min_sample` | 10 |
| `burn_in_storms` | 50 |
| `min_season`, `min_pool_season` | 1971 |
| `subbasins` | none |

Changing any of these between basins would confound the comparison. NA holds 925 storms from
1971 against EP's 1,099, so zero-peek replay is defensible on the same footing; the archive's
pre-1971 observing-bias gap is why the floor stays at 1971 for both.

The published EP ledger stays at its current 10 contracts and is **not** modified by this work.

## 5. Classification — declared before measuring

Each contract is classified by the **replay**, using the existing
`backtest/scoring.py::score_contract`:

| class | rule |
|---|---|
| `UNSUPPORTED` | the replay refused the Brier ratio (`skill_vs_climatology is None`) |
| `LEARNABLE` | scored, and `skill_vs_climatology > 0` |
| `SCORED-NO-SKILL` | scored, and `skill_vs_climatology <= 0` |

"Earned no skill claim" means the ratio was **refused**, not that the method was measured and
found skill-less. The two are different findings and are reported separately.

**`SCORED-NO-SKILL` is not a target of the gate.** The mechanism tests *evidence sufficiency*,
not skill. Where the record supports measuring a contract and the method then loses to
climatology, the honest output is a published negative skill — refusing it would be a category
error. This class is reported on its own and is excluded from the success criterion.

## 6. Primary metric and the criterion

The 2×2 contingency of **(gate refuses / gate allows) × (`UNSUPPORTED` / `LEARNABLE`)**,
computed for **both** gates — archive-wide (1.0.0) and scope-aware (1.1.0) — per basin and
pooled.

- **sensitivity** = refused ÷ `UNSUPPORTED`
- **specificity** = allowed ÷ `LEARNABLE`

**Declared success criterion: sensitivity ≥ 0.90 and specificity ≥ 0.95, pooled.**

Both halves are required, and that is the point: a gate that tightened until it refused
everything would score a perfect sensitivity and be worthless. The raw tables are published
whatever they say, and the scope-aware gate is reported beside the archive-wide one so the change
1.1.0 made is visible at the new scale rather than asserted from the old one.

**Interpretation is fixed in advance.** Meeting the criterion supports the claim that the refusal
boundary is a general mechanism rather than an artefact of ten contracts. Missing it does not —
and in that case the report says which contracts the gate misclassified and in which direction,
without redefining the criterion, the classes, or the contract set to recover it.

## 7. Per-contract publication

For every one of the 50, whatever the outcome:

event count · forecast count · storm count · refusals · unresolved · base rate · Brier · Brier vs
zero-peek climatology · skill · reliability eligibility (or its refusal reason) · archive-wide
event count and verdict · in-scope event count and verdict · the scope itself.

Every one of these except the two gate verdicts is already computed by `score_contract`; the
verdicts reuse `contract_event_counts()` and `scope_phrase()` from `analogs.py`. This is a
measurement, not new reporting machinery.

## 8. Commitments

1. The contract set above is final. Contracts are not added, dropped or re-specified after
   results are seen.
2. The classification rule, the metric and the criterion are final.
3. Every contract is reported, including any that fail to run — a basin or contract that errors
   is published as an error, not omitted.
4. Results are published whether or not the criterion is met.
5. No product or UI surface is built on this until the measurement exists and has been read.

---

*Registered ahead of measurement. The commit that adds this file contains no results, and the
branch history is the evidence of order.*
