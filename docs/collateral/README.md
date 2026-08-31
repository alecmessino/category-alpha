# Storm Atlas — proof-of-utility collateral

Six artifacts, a source manifest and a replay index. Built from the Storm Atlas archive by
`scripts/build-collateral.mjs`; nothing in them is transcribed by hand.

**Live status throughout: 31 AUG 2026, 08:25 CT / 13:25 UTC.** Every live line carries that
instant. The cohort pages do not: a cohort is evergreen, and stamping it would imply otherwise.

## The claim these artifacts make

Not that Storm Atlas knows where a live storm will go. That it can state exactly what the
historical record supports from a declared genesis condition, show the cohort behind the
statement, and visibly refuse what the record cannot support.

## Files

| file | what it is | pages |
|---|---|---|
| `A-active-systems-overview.html` | Four live systems, four declared points, and what the archive can answer for each | 1 |
| `B-97L-gulf-event-dossier.html` | Live Gulf Disturbance 97L: genesis-conditioned historical outcomes and exposure-relevant analog paths | 2 |
| `B1-97L-reinsurance-ils-parametric.html` | Contract-row frequencies, trigger explainability, near-miss members, basis risk | 1 |
| `B2-97L-energy-weather-trading.html` | Frequency bands from contract rows; analog paths as geography, not scored state probabilities | 1 |
| `C-karina-major-hurricane-analog-brief.html` | A live Category 4 beside its own genesis cohort's threshold frequencies | 1 |
| `D-storm-atlas-tear-sheet.html` | What the instrument is, what it refuses, what ships today and what does not | 1 |
| `SOURCE-MANIFEST.html` | The evidence gate as a printable reference document | 8 |
| `source-manifest.json` / `.txt` | Every cohort, contract row, interval, stamp, gap, representative member, cite string and URL | — |
| `replay-urls.json` | The six cohorts and the URL that reopens each | — |
| `copy.json` | The prose, with `_edits` recording every hand change and why | — |

Print: US Letter, `@page` margin 10 mm. Each `.sheet` is exactly the printed content box, so a
sheet that fits on screen prints as one page — `scripts/check-collateral-fit.mjs` enforces it.

## The cohorts, and what the archive returned

| id | point type | coordinates | radius | window | N | cohort status |
|---|---|---|---|---|---|---|
| 97L | PRE-GENESIS REFERENCE CELL | 28.0°N 88.7°W | 250 km | Aug–Sep, 1971+ | 12 | SUFFICIENT |
| 97L-r150 | PRE-GENESIS REFERENCE CELL | 28.0°N 88.7°W | 150 km | Aug–Sep, 1971+ | 5 | BELOW MIN SAMPLE — rates refused |
| 97L-allmonths | PRE-GENESIS REFERENCE CELL | 28.0°N 88.7°W | 250 km | all months, 1971+ | 17 | SUFFICIENT |
| KARINA | OBSERVED GENESIS | 13.2°N 115.0°W | 250 km | Aug–Sep, 1971+ | 14 | SUFFICIENT |
| 95E | PRE-GENESIS REFERENCE CELL | 12.0°N 107.5°W | 250 km | Aug–Sep, 1971+ | 24 | SUFFICIENT |
| LOWELL | OBSERVED GENESIS | 11.3°N 133.8°W | 250 km | Aug–Sep, 1971+ | 6 | BELOW MIN SAMPLE — rates refused |

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
  forecast cone. The composition rule is printed on every sheet.

## Gates

```bash
node scripts/build-collateral-manifest.mjs   # the evidence gate: execute the cohorts, write the manifest
node scripts/build-collateral.mjs            # render the artifacts from it
node scripts/check-collateral.mjs            # every figure traces to the manifest; prohibitions hold
node scripts/check-collateral-replay.mjs     # every printed URL reopens the identical cohort
node scripts/check-collateral-copy-budget.mjs # prose stays inside its layout budget
node scripts/check-collateral-fit.mjs        # every sheet fits its printed page (needs a browser)
```

Current: 105/105 content, 42/42 replay, every slot inside budget, every sheet fits.
