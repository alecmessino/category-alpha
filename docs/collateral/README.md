# Storm Atlas — proof-of-utility collateral

Six artifacts, a source manifest and a replay index. Built from the Storm Atlas archive by
`scripts/build-collateral.mjs`; nothing in them is transcribed by hand.

**Live status throughout: 31 AUG 2026, 16:14 CT / 21:14 UTC** — the instant the feeds were
ingested. Every live line carries it. The cohort pages do not: a cohort is evergreen, and stamping
it would imply otherwise.

**Operational formation is a fact and is stated; Atlas genesis is a different thing.** NHC/ATCF
classifies Tropical Depression Five (AL052026, declared as Invest 97L), and the operational record
carries a first tropical-status fix at 2026-08-31T18:00Z, 28.1°N 91.0°W. Both are printed, with
their sources and instants. Neither is an Atlas **OBSERVED GENESIS** point: the archive's rule is
the first observed tropical-status fix *for a storm the pack holds*, and the engine does not accept
the operational layer as a genesis source. AL052026, EP112026 and EP122026 are all absent from pack
`134661125525f27a`, so every cohort here is keyed to a **declared** point and no cohort is run from
an operational fix. Karina's and Lowell's points carry the full label
**DECLARED GENESIS POINT · NOT ATLAS-OBSERVED** — Atlas did not establish them and does not vouch
for them. Nothing here says a storm formed "where Atlas observed it".

## The claim these artifacts make

Not that Storm Atlas knows where a live storm will go. That it can state exactly what the
historical record supports from a declared genesis condition, show the cohort behind the
statement, and visibly refuse what the record cannot support.

## Files

| file | what it is | pages |
|---|---|---|
| `A-active-systems-overview.html` | Four live systems, four declared points, and what the archive can answer for each | 1 |
| `B-97L-gulf-event-dossier.html` | AL052026 (97L): genesis-conditioned outcomes for a declared Gulf cell, with the analog paths | 2 |
| `B1-97L-reinsurance-ils-parametric.html` | Contract-row frequencies, trigger explainability, near-miss members, basis risk | 1 |
| `B2-97L-energy-weather-trading.html` | Frequency bands from contract rows; analog paths as geography, not scored state probabilities | 1 |
| `C-karina-major-hurricane-analog-brief.html` | A live major hurricane beside the cohort for its declared genesis cell | 1 |
| `D-storm-atlas-tear-sheet.html` | What the instrument is, what it refuses, what ships today and what does not | 1 |
| `E-discrete-event-contract-evidence.html` | A published Cat 4+ CONUS landfall trigger, the declared cohort beside it, and the three places the archive stops short of scoring it | 1 |
| `SOURCE-MANIFEST.html` | The evidence gate as a printable reference document | 8 |
| `source-manifest.json` / `.txt` | Every cohort, contract row, interval, stamp, gap, representative member, cite string and URL | — |
| `replay-urls.json` | The six cohorts and the URL that reopens each | — |
| `copy.json` | The prose, with `_edits` recording every hand change and why | — |
| `legibility-cuts.json` | Every block removed to meet the type gate: what it was, what it cost, what carries its content instead | — |

Print: US Letter, `@page` margin 10 mm. Each `.sheet` is exactly the printed content box, so a
sheet that fits on screen prints as one page — `scripts/check-collateral-fit.mjs` enforces it.

## The cohorts, and what the archive returned

| id | point type | coordinates | radius | window | N | cohort status |
|---|---|---|---|---|---|---|
| 97L | PRE-GENESIS REFERENCE CELL | 28.0°N 88.7°W | 250 km | Aug–Sep, 1971+ | 12 | SUFFICIENT |
| 97L-r150 | PRE-GENESIS REFERENCE CELL | 28.0°N 88.7°W | 150 km | Aug–Sep, 1971+ | 5 | BELOW MIN SAMPLE — rates refused |
| 97L-allmonths | PRE-GENESIS REFERENCE CELL | 28.0°N 88.7°W | 250 km | all months, 1971+ | 17 | SUFFICIENT |
| KARINA | DECLARED GENESIS POINT · NOT ATLAS-OBSERVED | 13.2°N 115.0°W | 250 km | Aug–Sep, 1971+ | 14 | SUFFICIENT |
| 95E | PRE-GENESIS REFERENCE CELL | 12.0°N 107.5°W | 250 km | Aug–Sep, 1971+ | 24 | SUFFICIENT |
| LOWELL | DECLARED GENESIS POINT · NOT ATLAS-OBSERVED | 11.3°N 133.8°W | 250 km | Aug–Sep, 1971+ | 6 | BELOW MIN SAMPLE — rates refused |

Karina's and Lowell's points are operator-declared, not archive rows: the pack holds no genesis
event for EP112026 or EP122026. The manifest prints each one's separation from the first tropical
fix in the operational record (Karina 465 km, Lowell 24 km) so the gap is visible rather than
implied.

METHODOLOGY 1.1.0 · PACK `134661125525f27a` · archive built 2026-08-18T05:18:57Z.

## Rules the build enforces, not the reviewer

- **No geographic outcome category the archive does not already score.** There is no TX, LA or
  Gulf-state rate anywhere, because none exists to publish. A named member's own landfall is a
  fact about that storm and is labelled as one.
- **The STATUS column prints what the engine returned and nothing else.** No code path writes
  SUFFICIENT, VALID or OK onto an outcome row. SUFFICIENT belongs to the cohort line.
- **Drawn tracks are not rates.** Track geometry lives in its own field. Live b-deck geometry and
  NHC outlook polygons are drawn in their own ink and labelled LIVE. No forecast cone anywhere.
- **Rates are genesis-conditioned and assume formation.** Not P(forms), not a live feed, not a
  forecast cone. The composition rule is printed verbatim on every sheet: an unconditional
  intensity probability requires an external formation probability defined on the *same formation
  event and conditioning set*, none is computed here, and an NHC outlook probability is never
  multiplied by these rows unless the conditioning events are demonstrably aligned. Landfall is
  counted jointly and is never decomposed into path/intensity marginals.
- **NHC opening an advisory package is not observed genesis.** The point-type label on every page
  comes from the manifest's genesis determination, not from a wire classification.
- **The type gate is measured per semantic class, not globally.** A single page-wide minimum
  proves nothing about body copy, so `check-collateral-legibility.mjs` classifies every painting
  text node by the role it plays — body, callout, headline, table, citation, detail, map label,
  footer/legal — and measures each class against its own floor: 8.5 pt for body, callout and
  subhead; 7.5 pt for table, citation, detail and map label; 7 pt for footer and legal only. The
  gate is green only when every class clears its own floor on every sheet. Classification is
  conservative — an unrecognised node falls to `body`, the strictest class.
- **The cut register records; it never waives.** `legibility-cuts.json` names every block removed
  or compressed for the type gate, with what it cost and what carries its content instead. It
  carries no authority: the four-mark plate on A, a `CITE THIS COHORT` block and its replay URL on
  every prospect-facing artifact, and the comparison in full or compressed form are checked
  directly against the rendered page, and a register entry claiming to have cut one is itself a
  gate failure.

## Gates

```bash
node scripts/build-collateral-manifest.mjs   # the evidence gate: execute the cohorts, write the manifest
node scripts/build-collateral.mjs            # render the artifacts from it
node scripts/check-collateral.mjs            # every figure traces to the manifest; prohibitions hold
node scripts/check-collateral-replay.mjs     # every printed URL reopens the identical cohort
node scripts/check-collateral-copy-budget.mjs # prose stays inside its layout budget
node scripts/check-collateral-fit.mjs        # every sheet fits its printed page (needs a browser)
node scripts/check-collateral-legibility.mjs # measured type sizes clear the gate (needs a browser)
```

Current: 172/172 content, 42/42 replay, every slot inside budget and printed somewhere, every
sheet fits, every semantic class clears its own type floor.

### The trigger lock

Artifact E names a joint trigger — an intensity condition evaluated **at** a landfall — that the
archive does not score. Three checks in `check-collateral.mjs` hold that boundary, and they run
on any artifact that names such a trigger, not on E by name:

- **exact trigger** — the page must print `EXACT TRIGGER NOT SCORED`, and no rate, count or
  interval may share a block with the joint trigger. The claim is checked against the archive
  before it is checked on the page: every landfall row key must be `region:any` or
  `region:hurricane`, so if a future pack ever holds a Cat 4-at-landfall row the assertion fails
  first and the refusal comes off the page before a reader has to notice it went stale.
- **marginal product** — no block may multiply an intensity row by a landfall row, and no printed
  percentage may equal any such product. The second half needs no language at all: it recomputes
  every intensity × landfall product the manifest makes possible and fails if one appears,
  whatever it is called. A value the manifest itself publishes is read as that row, not a product.
- **regional inference** — no sub-CONUS region name may share a block with a rate or an interval.
  The registry has no sub-CONUS row, so any such number would be invented, and unlike the
  package-wide state-name rule there is no disclaimer that buys an exemption.

## Measured type, per prospect-facing sheet

Computed font size of every painting text node, in points. "Min substantive" excludes the footer
and `.disclaim` legal text, which is allowed down to 7 pt.

Minimum and character-weighted median, in points, per class per artifact. The median is weighted
by character count so a three-character chip does not count the same as a paragraph.

| class | floor | A | B | B1 | B2 | C | D | E |
|---|---|---|---|---|---|---|---|---|
| body | 8.5 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 |
| callout | 8.5 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 |
| headline | 8.5 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 | 8.55 / 8.55 |
| table | 7.5 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 |
| citation | 7.5 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 |
| detail | 7.5 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 | 7.57 / 7.57 |
| map label | 7.5 | 7.54 / 7.54 | 7.58 / 7.58 | — | 7.58 / 7.58 | 7.58 / 7.58 | — | — |
| footer/legal | 7.0 | 7.05 / 7.05 | 7.05 / 7.05 | 7.05 / 7.05 | 7.05 / 7.05 | 7.05 / 7.05 | 7.05 / 7.05 | 7.05 / 7.05 |

Substantive minimum (every class but footer/legal): 7.54 pt on A, 7.57 pt on the rest, E included. `detail` is
the footnote, chip, plate-furniture and refusal-reason class; it carries real text — 1.7k
characters on A, 2.4k on B — and sits at the 7.5 pt detail floor, not at body size.
