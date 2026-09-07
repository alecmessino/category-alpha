# Track residual — pre-registration

Written before any backtest is run, so that the choices below do not depend on the results.
Companion to `docs/TRACK-RESIDUAL.md`. The primitives are in
`scripts/lib/track-residual-backtest.mjs`; nothing in this repository has executed them over the
archive yet.

## Why this file exists first

The failure mode is specific and it is not dishonesty: run the thing, look at the output, then
decide what "the next advisory's shift" meant, which horizon to score, what counts as a
negligible revision, and whether to count fixes or storms. Every one of those choices has a
version that improves the number, and choosing after seeing it turns a null result into a
positive one without anyone lying.

## The three questions

They are scored separately and their results are never combined.

**Q1 — Is the position-departure measurement accurate?**
A geometry question, not a skill question. Does the residual this module computes agree with the
residual an independent position implies? It tests parsing, interpolation and frames. It is the
only question a small sample can inform, and it is still reported per storm.

**Q2 — Does a promoted residual predict the sign of the next advisory's track shift at shared
future valid times?**
A question about NHC's revisions, not about the storm. Directional classification only.

**Q3 — Does anything here predict a qualifying landfall or contract resolution?**
A question about rare events with a different unit, a different base rate and a different loss
function. **Success on Q1 or Q2 does not establish Q3**, and `scoreQ3` refuses a Q2-shaped input:
a Brier score needs a defined binary outcome and a numeric forecast in [0,1], and this module
emits neither. Until Q3 is actually scored, the module reports kinematics and refusals only.

## The revision target, defined now

`advisoryShift(earlier, later, sharedValidZ)` — four choices fixed in advance:

| | Choice | Why the alternative is wrong |
|---|---|---|
| Frame | the **earlier** baseline's local direction at the shared valid time | The later advisory's frame already contains the revision being measured. |
| Time | a **shared valid time**, at named horizons (12/24/48/72 h from the later advisory's initial time), inside both tracks | Comparing advisory N's +24 h against N+1's +24 h compares two different moments and reports the storm's own motion as a revision. |
| Dead band | `|cross| < 6 nm` is **NO CALL**, not a sign | Scoring a coin flip on a 0.3 nm revision is noise dressed as skill. 6 nm is smaller than the coordinate rounding of the products being compared, and is chosen for that reason rather than fitted. |
| Component | the **cross-track** sign only | An along-track revision is a timing change. It is recorded and is not the target. |

## Sampling

- **The unit is the storm**, or the promotion event where that is what is under test. Never the
  fix. Fixes within a storm are not independent: a storm that departs east departs east all
  afternoon, so a count over fixes describes the storm's persistence rather than the rule's skill.
- `aggregateByStorm` collapses to one unit **before** anything is counted, and records how mixed
  the storm's own rows were.
- **A Wilson interval over fixes is refused**, by a function that exists to make the wrong version
  fail loudly.
- **Gates**: 10 distinct resolved storms before any score is published, 30 before a reliability
  curve is. Matched to the terminal's own calibration gate so two surfaces cannot disagree about
  what "enough" means.
- **A stratum below the gate returns its base rate and a refusal**, in the archive's own voice:
  `BASE RATE ONLY -- unscoreable`. The counts are the evidence, not the answer.

## Splits, and what is fitted

- Training and held-out split on **storms** and on **later periods** — the default is seasons
  ≥ a named year, because a rule tuned on 2015–2020 and tested on 2021+ is tested against a
  forecasting system that has itself changed.
- **Nothing is fitted on evaluation storms.** `assertNoOverlap` throws rather than warning.
- Thresholds — the promotion rule's `n`, its window, its dead band — are chosen on training storms
  only, and the chosen values are recorded before the held-out run.
- **The archive is not searched for a favourable analogue.** No storm is selected into or out of
  the evaluation set on the strength of its residuals.

## Baselines any result must beat

Declared in `BASELINES`, all trivial, which is the point — a rule that does not beat "assume it
does again" has not been shown to add information.

1. `persistLastResidualSign` — the last non-zero residual sign.
2. `persistLastOfficialBias` — the last non-zero official-shift sign.
3. `climatology` — a fixed sign, supplied.

## What will be reported, whatever the answer

Independent storm counts; promotion coverage (how often the rule fires at all); false alarms;
misses; lead time when promoted; NO CALLs, counted rather than dropped; and each baseline's score
beside the rule's. A negative result against the baselines is the most useful output this can
produce, because it says stop.

## Leakage rules that apply to the replay

Inherited from `scripts/lib/track-residual-ingest.mjs` and not relaxed for a backtest:

- A fix is admissible against a baseline only if the baseline was **first-available** before the
  fix's valid time — from the archived `messages/` index filename, to the minute, never from the
  nominal slot.
- Zero and negative lead are refused, so an advisory's own initial position is never scored
  against that advisory.
- **Post-season best track is never substituted for what was available live.** The b-deck may be
  used as a separate retrospective reference and is labelled as one.
- Where receipt time at this pipeline is unknown — which is every historical storm — the
  availability assumption is stated on the entry rather than filled in.

## Known reasons this may not be answerable

From `research/track-residual/COVERAGE.md`: only 65 of 221 archived EP storms carry intermediate
advisories, many f-decks hold satellite fixes from a single platform (one independent group), and
the CP-id population is 14 storms across eleven seasons. A large share of the archive will produce
`INSUFFICIENT_SAMPLE` under this module's own gate, and that is the correct output rather than a
reason to lower the gate.
