# Q2 — plan

**This is a plan. It has not been run.** No archive was opened for Q2, no residual series was
read, no storm's behaviour influenced anything below, and there is no count, rate, Brier score,
accuracy figure or impression anywhere in this document. Q3 is untouched and the contract registry
is still empty.

Written against `research/track-residual/PRE-REGISTRATION.md`, which is the authority; where this
document adds anything it is a *choice being named*, not a rule being changed. Machine-readable
twin: `Q2-PLAN.json`, checked by `scripts/test-track-residual.mjs` §15.

**The question.** Did a promoted residual predict the **sign** of the next advisory's cross-track
shift at shared future valid times? It is a question about NHC's revisions, not about the storm,
and not about landfall. Success would say nothing about Q3.

---

## 1. The split, named before anything is measured

**Method:** held-out *period*, seasons ≥ cut year — the pre-registration's `byYear` form, chosen
over a random storm split because a rule tuned on 2015–2020 and tested on 2021+ is tested against
a forecasting system that has itself changed.

**Cut year: 2022.** The rule is the smallest cut year whose training share reaches the **0.60**
the pre-registration declares as its default training fraction:

| Through | Training storms | Share |
|---|---|---|
| 2020 | 33 of 65 | 0.508 |
| **2021** | **39 of 65** | **0.600** |
| 2022 | 48 of 65 | 0.738 |

Chosen on **storm counts only**. The counts come from `Q1-RESULT.json`, from which exactly two
fields were read — `stormId` and `year`. No storm's residuals, errors, refusals or advisory count
entered the decision, and no archive request was made to build this split.

### Training — 39 storms, seasons 2015–2021

| Season | Storms |
|---|---|
| 2015 | `ep022015` `ep032015` `ep052015` `ep172015` `ep202015` `ep222015` |
| 2016 | `ep012016` `ep112016` `ep152016` `ep172016` `ep222016` |
| 2017 | `ep022017` `ep032017` `ep142017` `ep162017` `ep172017` `ep182017` `ep192017` `ep202017` |
| 2018 | `ep032018` `ep042018` `ep112018` `ep202018` `ep212018` `ep222018` `ep242018` `ep252018` |
| 2019 | `ep152019` `ep162019` `ep172019` `ep192019` |
| 2020 | `ep022020` `ep122020` |
| 2021 | `ep042021` `ep052021` `ep142021` `ep152021` `ep162021` `ep172021` |

### Held out — 26 storms, seasons 2022–2025

| Season | Storms |
|---|---|
| 2022 | `ep012022` `ep042022` `ep112022` `ep122022` `ep132022` `ep142022` `ep162022` `ep182022` `ep192022` |
| 2023 | `ep022023` `ep092023` `ep152023` `ep162023` `ep172023` `ep182023` `ep192023` |
| 2024 | `ep092024` `ep102024` `ep112024` |
| 2025 | `ep042025` `ep052025` `ep062025` `ep122025` `ep132025` `ep162025` `ep172025` |

### Eligibility, and why no storm is excluded here

Every one of the 65 EP storms carrying at least one intermediate advisory is assigned. **Nothing
else is an exclusion criterion.** A storm that turns out to yield no comparable advisory pair, or
no promotion, or no shared valid time inside both tracks, becomes **published missingness at run
time** — it is not quietly dropped from a denominator now, and it certainly is not dropped later,
once its series has been seen.

That is the whole point of naming the lists in advance: **no storm enters or leaves on the strength
of its residuals**, and the lists above are the record that makes the claim checkable rather than
promised. `assertNoOverlap` throws on any overlap; §15 re-derives the partition from the artefact
and fails if either list has gained or lost a member.

---

## 2. Thresholds, named now, taken not fitted

Every value below already exists in the pre-registration or in shipped code. **None is fitted, and
none may be fitted on the held-out seasons.**

| Choice | Value | Where it comes from |
|---|---|---|
| Promotion rule | `candidateTrendRule()` exactly as implemented | `scripts/lib/track-residual-state.mjs` |
| Independent groups required | `MIN_INDEPENDENT_FIXES` | same file, unchanged |
| Window | `WINDOW_HOURS`, single baseline | same file, unchanged |
| Dead band | `|cross| < 6 nm` → **NO CALL** | `NEGLIGIBLE_SHIFT_NM`, pre-registration §revision target |
| Horizons | **12 / 24 / 48 / 72 h** | `HORIZONS_H` |
| Frame | the **earlier** advisory's local direction at the shared valid time | pre-registration; the later advisory's frame already contains the revision being measured |
| Component | **cross-track sign only** | pre-registration; along-track is a timing change, recorded, not the target |
| Shared valid time | inside **both** tracks | `sharedValidTimes()` — a horizon only one advisory reaches is not a comparison |

**NO CALL is a third outcome, not a coin flip.** It is counted and reported, never folded into the
denominator to inflate a hit rate and never dropped to shrink one.

**If any of these needs to change, it changes here and is re-committed before the run** — not
after seeing an output. A threshold adjusted post hoc is a fitted threshold whatever it is called.

---

## 3. Sampling

- **The unit is the storm**, or the promotion event where that is what is under test. **Never the
  fix.** Fixes within one storm are not independent: a storm that departs east departs east all
  afternoon, so a count over fixes describes that storm's persistence rather than the rule's skill.
- `aggregateByStorm` collapses to one unit **before** anything is counted, and records how mixed
  each storm's own rows were.
- **A Wilson interval over fixes is refused.** `wilsonRefusal` exists so the wrong version fails
  loudly instead of producing a confident interval over correlated rows.

---

## 4. Gates

- **10 distinct resolved storms** before any score is published.
- **30** before a reliability curve is.
- Below the gate: **the base rate and a refusal** — `BASE RATE ONLY -- unscoreable`, in the
  archive's own voice. The counts are the evidence; they are not the answer. Never a rate.
- Both counts are always shown, because the gap between them is itself the warning.

Given 39 training and 26 held-out storms, **the held-out set can clear the scoring gate and cannot
clear the reliability gate.** That is a property of the archive, stated in advance, and it is not a
reason to lower either gate or to move the cut year.

---

## 5. Baselines any result must beat

Declared in `BASELINES`, all trivial — which is the point. A rule that does not beat "assume it
does again" has not been shown to add information.

1. `persistLastResidualSign` — the last non-zero residual sign.
2. `persistLastOfficialBias` — the last non-zero official-shift sign.
3. `climatology` — a fixed sign, supplied.

Each is scored on the same units, the same dead band and the same gates as the rule.

---

## 6. Leakage rules — inherited, not relaxed

From `scripts/lib/track-residual-ingest.mjs`, unchanged for the backtest:

- A fix is admissible against a baseline only if that baseline was **first-available** before the
  fix's valid time, taken from the archived `messages/` filename **to the minute** — never from the
  nominal slot. Measured across 2024, transmission runs from 146 min early to 177 min late.
- **Zero and negative lead are refused**, so an advisory's own initial position is never scored
  against that advisory.
- **Post-season best track is never substituted for what was available live.** It may appear only
  as a labelled retrospective reference.
- Where receipt time at this pipeline is unknown — which is every historical storm — the
  availability assumption is **stated on the entry**, never filled in.

---

## 7. What the run will report, whatever the answer

Independent storm counts; promotion coverage — how often the rule fires at all; false alarms;
misses; NO CALLs, counted rather than dropped; lead time when promoted; and each of the three
baselines beside the rule. Missingness published, including every storm from §1 that produced
nothing.

**A negative result against the baselines is the most useful output this can produce, because it
says stop.** It will be reported in the same place and the same type size as a positive one.

---

## 8. Known reasons this may not be answerable

Stated now so that a thin result is not a surprise that invites a relaxed gate later.

- Only 65 of 221 archived EP storms carry intermediate advisories at all.
- Many f-decks hold satellite fixes from a single platform — one independent group — so a large
  share of the population will not reach the promotion rule's group requirement and will produce
  `INSUFFICIENT_SAMPLE`. That is the module working, not a defect.
- The held-out set is 26 storms. It can clear 10; it cannot clear 30.
- **Promotion coverage could be zero.** If the rule never fires on the held-out seasons, Q2's
  answer is "the rule does not fire often enough to be scored", which is a real finding and is to
  be reported as one rather than treated as a failed run.

---

## 9. What this plan does not do

It names choices. It produces no result. Specifically, nothing in this turn:

- opened the archive for residuals, revisions or skill;
- chose a storm in or out after looking at its series — the split is a cut year applied to
  identifiers and seasons;
- emitted a count, rate, Brier score, accuracy figure or an impression;
- started Q3 or touched the contract registry;
- changed anything on the keep-list: forecast frame, leak gate, negative-latency flag, four
  refusal fields, GOES-18 grouping, empty registry, `scoreQ3` refusal, unwired `residual_state`,
  Lowell golden.

**The gate on the Q1 documents pins numbers, not interpretation.** That was enough for Q1, which is
a measurement question. It is not enough for Q2, and no gate in this repository can make it so — a
Q2 result needs a reader who checks that the question asked is the question answered.

**The session that writes this split does not run it.**
