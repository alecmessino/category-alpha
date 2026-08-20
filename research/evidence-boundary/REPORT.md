# Does the evidence boundary generalise? — result

Measured against the contract set and criterion registered in
[`PRE-REGISTRATION.md`](PRE-REGISTRATION.md), which was committed — with both amendments — before
this measurement was run. Raw output: [`results.json`](results.json). Per-basin replay ledgers:
`backtest-NA.json`, `backtest-EP.json`.

Methodology **1.1.0**. 50 contracts, 25 in each of two basins. **1,881 storms replayed** (EP 1,039,
NA 842; 50 burn-in storms skipped per basin).

---

## The answer

**Yes, on the tier the gate covers — and the old gate fails badly at this scale.**

Primary table, the 20 landfall contracts, both gates:

| gate | sensitivity (unsupported refused) | specificity (learnable allowed) |
|---|---|---|
| **scope-aware (1.1.0)** | **0.91** — 10 of 11 | **1.00** — 7 of 7 |
| archive-wide (1.0.0) | **0.18** — 2 of 11 | 1.00 — 7 of 7 |

**Criterion (sensitivity ≥ 0.90, specificity ≥ 0.95): MET.**

The ten-contract result generalised, and the case for 1.1.0 is stronger at 20 contracts than it
was at 10. The archive-wide gate looked mediocre on the original set — it caught 1 of 4. Given
twice the population and both basins it catches **2 of 11**. Its single-basin result was not a
small sample being unlucky; it was a gate measuring the wrong population, and the wider the
contract set, the more often that shows.

**The scope rule moved 8 contracts from allowed to refused, and every one of them was a true
positive.** It introduced no new false refusal: specificity is 1.00 under both gates.

```
EP landfall_caribbean_any          EP landfall_conus_any
EP landfall_caribbean_hurricane    EP landfall_conus_hurricane
EP landfall_central_america_any    EP landfall_hawaii_any
EP landfall_central_america_hurricane   NA landfall_hawaii_any
```

`EP landfall_conus_any` is the case that started this: **699 storms in the archive carry a CONUS
landfall, and 2 of them are reachable by an east Pacific query.** The archive-wide gate saw 699
and allowed a skill claim. The scope-aware gate sees 2 and refuses.

## The one miss, stated precisely

`NA landfall_central_america_hurricane` — the gate allowed it, the replay could not score it.

It is a **boundary case between two different questions**, not a gate that counted the wrong
population. The gate asks whether *the record* can support the contract: 19 storms in scope, above
the threshold of 10, so it allows. The classifier asks whether *this replay* scored enough events:
9, one below the same threshold, so it is `UNSUPPORTED`. A record holding 19 events will not always
yield a replay with 10 — forecasts get refused for thin analog pools, and outcomes go unresolved.

Where the two thresholds are this close the two answers can disagree, and this is what that looks
like. Raising the gate to remove this miss would cost specificity on the seven learnable
contracts, which the criterion protects deliberately.

## Secondary table — intensity contracts, and what it does not show

Twelve intensity contracts, judged separately as registered:

| | scope-aware | archive-wide |
|---|---|---|
| sensitivity | **undefined** | **undefined** |
| specificity | 1.00 — 10 of 10 | 1.00 — 10 of 10 |

**No intensity contract in either basin was `UNSUPPORTED`**, so this tier says nothing at all
about sensitivity and is not evidence that the gate works here. It is reported because the
absence is itself informative: wind-threshold crossings are common events, the record carries
them everywhere, and an evidence gate has nothing to refuse. Both gates allowed all twelve, and
the two `SCORED-NO-SKILL` contracts among them were correctly **not** refused.

## The coverage hole — a registered outcome, and it is real

**3 of the 18 time-to-event contracts came back `UNSUPPORTED`, and no gate in either surface has
a verdict on them:**

| contract | replay events |
|---|---|
| `NA reaches_cat3_within_24h` | 0 |
| `NA reaches_cat3_within_48h` | 8 |
| `EP reaches_cat3_within_24h` | 0 |

These are rapid-intensification questions — major-hurricane strength within a day or two of
genesis — and they are exactly where the archive is thinnest. A user asking one today would get a
number with no refusal attached, because the evidence gate iterates landfall regions and cannot
see a timing contract at all.

This is a **coverage hole, not a misclassification**. The boundary is sound where it is drawn; it
is not drawn everywhere a question can be asked. Closing it would mean an event-count rule for
timing contracts in the engine, with parity coverage — a methodology change, deliberately not
made here, because inventing a gate in order to pass a test of that gate is the failure this
pre-registration exists to prevent.

## The larger finding: the method's skill is narrower than its evidence

The evidence boundary is about whether a question *can* be scored. Separately, and more soberly,
here is how often the analog method actually beat climatology once it was:

| tier | LEARNABLE | SCORED-NO-SKILL | UNSUPPORTED |
|---|---|---|---|
| landfall (20) | 7 | 2 | 11 |
| intensity (12) | 10 | 2 | 0 |
| time-to-event (18) | 4 | 11 | 3 |
| **total (50)** | **21** | **15** | **14** |

Two things in that table matter more than the headline:

**Time-to-event is where the method is weakest.** Eleven of eighteen scored negative, some heavily —
`NA reaches_ts_within_96h` at **−0.206**, `NA reaches_cat1_within_24h` at −0.157. The record
supports measuring these; the method simply does not beat the base rate at them. That is a
published negative result and the gate is right not to refuse them: refusing a well-evidenced
question because the answer is unflattering would be the opposite of what this system is for.

**Skill is basin-dependent, and the Atlantic is worse.** `reaches_ts_34kt` scores **+0.046 in EP
and −0.145 in NA** — the same contract, the same method, opposite signs. Every NA intensity
contract scores below its EP counterpart. The east Pacific result the shipped ledger reports is
the method's better basin, and nothing on the surface says so today.

## Limitations

- **One archive, one method.** This measures the analog engine against zero-peek climatology over
  this archive. It is not a forecast, a loss model, an exposure or vulnerability model, or a
  general hazard model.
- **The primary table is 20 contracts.** Wider than the 10 it replaces, still small. Eleven
  `UNSUPPORTED` contracts means one reclassification moves sensitivity by 9 points.
- **The gate covers two of three tiers.** Landfall in the live surface, intensity in the ledger,
  timing nowhere.
- **The time-to-event statistic is research-only.** It is computed from `AnalogResult.cases`
  inside the contract, not from the engine's published outputs, so it is *not* covered by the
  42-vector Python/browser parity harness. It could not become a product surface without moving
  into the engine first, with parity coverage.
- **The two thresholds are the same number by coincidence, not by design.** The gate's
  `MIN_EVENTS_FOR_SKILL` and the replay's are both 10 and are independent constants in different
  files. The single miss sits exactly on that coincidence.

## What did not change

The published calibration ledger is untouched and still reports the ten EP contracts. The
archive, the engine, `METHODOLOGY_VERSION` and the parity harness are all unchanged: the harness
gained an optional contract list and the climatology gained an optional exact denominator, and
the published EP run reproduces bit-for-bit under the new code — same 10,390 ledger rows, same
scores for all ten contracts.
