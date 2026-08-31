# Storm Atlas — proof-of-utility collateral

Six artifacts, a source manifest and a replay index. Built from the Storm Atlas archive by
`scripts/build-collateral.mjs`; nothing in them is transcribed by hand.

**Live status throughout: 31 AUG 2026, 16:14 CT / 21:14 UTC** — the instant the feeds were
ingested. Every live line carries it. The cohort pages do not: a cohort is evergreen, and stamping
it would imply otherwise.

**Genesis determination, settled before anything else.** NHC has opened advisory packages on
AL052026 (Tropical Depression Five, declared as Invest 97L), and Karina and Lowell are named
storms. None of that is the archive's genesis definition, which is the first OBSERVED track point
carrying a tropical status *for a storm the pack holds*. The manifest applies that rule to the
operational record and returns **NO OBSERVED GENESIS POINT** for all three: AL052026, EP112026 and
EP122026 are absent from pack `134661125525f27a`, and the operational layer is not a cohort source.
Every cohort here is therefore keyed to a **declared** point, labelled as declared, and no
coordinate on any page is an observed formation point.

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
| KARINA | DECLARED GENESIS POINT | 13.2°N 115.0°W | 250 km | Aug–Sep, 1971+ | 14 | SUFFICIENT |
| 95E | PRE-GENESIS REFERENCE CELL | 12.0°N 107.5°W | 250 km | Aug–Sep, 1971+ | 24 | SUFFICIENT |
| LOWELL | DECLARED GENESIS POINT | 11.3°N 133.8°W | 250 km | Aug–Sep, 1971+ | 6 | BELOW MIN SAMPLE — rates refused |

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
- **The type gate is measured, not asserted.** Body and callout copy at 8.5 pt or larger, table,
  citation and detail at 7.5 pt or larger, footer and legal no smaller than 7 pt — including text
  inside the SVG plates, where the painted size is the label size times the plate's render scale.
  Where a page could not hold its content at those sizes, content was cut and the cut is recorded
  in `legibility-cuts.json`; type was never reduced to make something fit.

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

Current: 133/133 content, 42/42 replay, every slot inside budget, every sheet fits, every
prospect-facing sheet clears the type gate.

## Measured type, per prospect-facing sheet

Computed font size of every painting text node, in points. "Min substantive" excludes the footer
and `.disclaim` legal text, which is allowed down to 7 pt.

| artifact | text nodes | min | min substantive | median | weighted median | max |
|---|---|---|---|---|---|---|
| A | 145 | 7.05 | 7.57 | 7.57 | 7.57 | 14.25 |
| B | 385 | 7.05 | 7.57 | 7.57 | 7.57 | 14.25 |
| B1 | 211 | 7.05 | 7.57 | 7.57 | 7.57 | 14.25 |
| B2 | 129 | 7.05 | 7.57 | 7.57 | 7.57 | 14.25 |
| C | 203 | 7.05 | 7.57 | 7.57 | 7.57 | 14.25 |
| D | 128 | 7.05 | 7.57 | 7.57 | 8.55 | 14.25 |

The weighted median weights each node by its character count, so a three-character chip does not
count the same as a paragraph.
