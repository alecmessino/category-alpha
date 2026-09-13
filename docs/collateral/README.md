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
| `C-karina-major-hurricane-analog-brief.html` | A live major hurricane beside the cohort for its declared genesis cell | 2 |
| `D-storm-atlas-tear-sheet.html` | What the instrument is, what it refuses, what ships today and what does not | 1 |
| `E-discrete-event-contract-evidence.html` | A published Cat 4+ CONUS landfall trigger, the declared cohort beside it, and the three places the archive stops short of scoring it | 1 |
| `SOURCE-MANIFEST.html` | The evidence gate as a printable reference document | 8 |
| `source-manifest.json` / `.txt` | Every cohort, contract row, interval, stamp, gap, representative member, cite string and URL | — |
| `contract-sources.json` | Public sources for the contract terms printed on E: publisher, document, what it is the source of, date read, URL. A null URL is a gap the sheet prints. | — |
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
node scripts/check-collateral-asof.mjs       # no send-ready sheet makes a stale present-tense live claim
```

Current: 249/249 content, 42/42 replay, 10/10 as-of, every slot inside budget and printed
somewhere, every sheet fits, every semantic class clears its own type floor.

Re-exporting a named sheet without moving the evidence under it:

```bash
node scripts/reexport-collateral.mjs E B1    # render only these, from the COMMITTED manifest
node scripts/render-collateral-pdf.mjs E B1  # one Letter page each, fonts asserted (needs a browser)
```

`build-collateral.mjs` re-renders all eight documents from a live `build()`, which re-opens the
archive pack as it stands now — and the refresh loop rebuilds that pack on main every few minutes.
A full rebuild is therefore the right tool for a full rebuild and the wrong one for a copy
correction on one sheet: it restamps every masthead, footer and cite string, and it rewrites the
six sheets nobody asked to change. `reexport-collateral.mjs` reads its evidence from the committed
`source-manifest.json` instead — the same file `check-collateral.mjs` gates every printed figure
against — so no cohort number, interval, refusal, cite string, replay URL or pack stamp can move,
and it writes only the sheets named on the command line.

### The contract's own provenance

The Atlas cohort on E carries a cite string and a replay URL. The contract terms printed beside it
are **not** Atlas output and do not travel on that cite, so they carry their own sources, read from
`contract-sources.json` and printed as a SOURCES line under the terms. Two checks hold it: every
entry must appear on the sheet — with its URL, or, where this build holds no citable public
document, as a named `SOURCE URL NOT HELD` gap — and no URL may appear anywhere a reader could
follow it unless it is the Atlas replay URL or one of those declared sources, so a citation cannot
be invented on the page.

This build holds NOAA/NHC sources for the Category 4 = 130 mph definition and for the landfall and
intensity determination authority, and — since 13 Sep 2026 — Discrete's own published contract page
for the reference event, the observation deadline, the trigger wording, the CONUS reference region
and the Gulf-only and Florida-only variants. The terms block is headed **PUBLISHED ILLUSTRATIVE
TERMS · VERIFIED 13 SEP 2026** and the SOURCES line prints the citation.

That heading was earned, not typed. Until the URL was held the same block read **PUBLIC TERMS
TRANSCRIBED 31 AUG 2026 · SOURCE RECORD INCOMPLETE**, because a transcription nobody can re-open is
not a verified citation. Both headings live in `contract-sources.json` and the sheet picks between
them from whether the URL is held, so supplying the URL restored the stronger heading and printed
the citation in one edit — and a check fails the sheet if heading and record ever disagree. Three
details of that entry are deliberate:

- **VERIFIED 13 SEP, not 31 AUG.** 31 Aug is when the terms were transcribed. No document was held
  on that date to verify them against, so dating the verification to it would claim a check that
  never happened.
- **ILLUSTRATIVE, not PUBLIC.** That is the publisher's own word: the page heads its term sheet
  *Illustrative terms* and adds *"Terms for discussion. Not an offer, solicitation, or
  recommendation to enter into any transaction."* A citable source makes overstating it checkable,
  so the heading does not.
- **The source's own wording is stored.** The page's eight term-sheet fields are kept verbatim in
  the entry as `source_quotes`, and the printed transcription was corrected against them — the
  reference event now reads *on or before* 30 Nov 2026, matching an observation period that runs
  *through November 30, 2026, 11:59 p.m. ET*.

### As-of, not live

`check-collateral-asof.mjs` gates the sheets that are actually sent — today B1 and E. A terminal
re-renders on its own tick, so present tense there is a reading of the moment it is read; a PDF is
opened on a day of the recipient's choosing, so the same sentence asserts a months-old observation
as a fact about that day. Both sheets were rendered at the 01 Sep 2026 21:08 UTC ingest with
AL052026 live, and both said so in the present tense. AL052026 has since left the feed: the numbers
were still right, and the tense had turned them into a false claim.

The fix is neither deletion nor a refresh — a refresh re-arms the same failure with a newer date.
The reading stays, verbatim, and is dated: the masthead key reads `OPERATIONAL AS OF`, the sentence
is in the past, and the paragraph carries the ingest's day. The gate checks four things on those
sheets: no `LIVE STATUS` / `LIVE, <stamp>` framing label; every live reading in a block that also
carries the ingest's day; no present-tense verb binding a live subject to a reading; and every
printed as-of day equal to the manifest's own ingest day. Statements about the committed pack —
*the archive holds no genesis row for it* — are evergreen and are deliberately left in the present.

### Width is a fit question too

`check-collateral-fit.mjs` also measures the widest painted node against the sheet's content box.
A ledger whose cells are all `white-space:nowrap` cannot shrink below its own min-content width; in
a half-width grid track it runs past the track, over its neighbour, and off the sheet, where
`overflow:hidden` clips it. Height gates cannot see that — the sheet still fits — so it reached
print. Callers in narrow columns pass a short `statusHead` to `ledger()`; the heading, not the
data, is what sets a compact ledger's minimum width.

### The evidence row

The frequency panels on B, B1 and C, and the worked samples on D, print each contract row as two
lines rather than four columns:

```
reached Cat 1                          25.0%
3 / 12 · [9–53%]

HAWAII — ≥64 kt                         0.0%
0 / 12 · [0–24%] · BASE RATE ONLY
```

The rate is the darkest, heaviest element on the sheet; the exact denominator and the Wilson
interval sit directly under it; a state token appears only where the archive stamped the row. A
four-column row cannot be narrower than the sum of its widest cells, and at the type floors that
sum ran 107–222 px past a three-up track and printed over the table beside it. The folded row is as
wide as its widest line, so the three groups — `INTENSITY · GENESIS-CONDITIONED`, `LANDFALL ·
SCORED REGIONS`, `LANDFALL · CONTINUED` — stay side by side. Rows, order, n/N, rates, intervals and
stamps are the column model's exactly; `pct()`, `ci()` and the status strings are the same code.

**Row = state token, panel note = explanation.** Rows print `OUT OF SCOPE`, `BASE RATE ONLY` or
`RATE REFUSED`; the archive's full stamp — `OUT OF SCOPE -- unscoreable here` — is printed once per
sheet, in the note under the panel or in the UNSCOREABLE box, never twelve times down a column.

### The refusal invariant

Every rendered outcome row that the archive stamped carries that stamp as `data-status`, whatever
the row prints. `check-collateral.mjs` requires each such stamp to be visible in full somewhere on
the sheet, and requires every state token printed to be the head of a stamp some rendered row
carries. That is the rule actually owed: a sheet that *tabulates* a stamped row owes the reader the
stamp; a sheet that merely *links* a cohort — A's four replay URLs, D's samples, E's six rows — owes
the pointer. The earlier check matched a raw replay URL against markup where `&` is `&amp;` and had
never fired; it was replaced, not repaired, because its predicate ("cites the URL") was wrong.

### Width is a fit question too

`check-collateral-fit.mjs` measures the widest painted node against the sheet's **content box**
(`.sheet` insets with a 10 mm border, not padding — measuring the border box had forgiven 37.8 px
of bleed per side) and measures every table against its own grid track, since a table can print over
its neighbour without reaching the sheet edge. Both failures are reported as clipping.

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
