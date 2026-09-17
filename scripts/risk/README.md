# Millibar Risk Evidence — the Trigger Evidence Record pipeline

Builds the published records under `/category-alpha/risk/` from archived official products.
One command produces each record's web note, one-page PDF and machine-readable manifest, and
a second one gates them.

| Record | Event | Route |
|---|---|---|
| `lala-2026` | CP012026 Lala, 12–28 Aug | `/risk/lala-2026/` |
| `lowell-2026` | EP122026 Lowell, 4–8 Sep | `/risk/lowell-2026/` |

`build.py` also writes the `/risk/` index, after the records and from their published
manifests — see **The doorway** below.

Both are evaluated against the **same contract manifest** — the TNC-HI-REEF public view,
written once in `record.py::contract_manifest()` — by the same evaluator, with no logic
written for either storm.

## Rebuild

```sh
pip install -r scripts/risk/requirements.txt
python3 -m playwright install chromium          # the PDFs are rendered, not hand-assembled
cd scripts/risk && python3 build.py && python3 gates.py
```

`build.py` and `gates.py` take an optional record slug (`python3 build.py lala-2026`) and do
every record when given none. `gates.py --offline` skips the one gate that needs the network —
the live-URL 200 check — and reports it as SKIP rather than counting it as a pass. Each record
is gated in a process of its own, because the gates read the rendered PDF and page as module
state and a record whose gates could see another record's document is a record whose gates can
pass on the wrong one.

**A rebuild is byte-identical.** `python3 build.py && python3 gates.py && git status` is the
reproducibility check: if anything under `docs/risk/` shows as modified, the build is not a
function of its inputs. Chromium stamps each PDF with the wall clock, which was the only thing
that ever differed between two renders, so the dates are pinned to the latest archived source
time instead.

## How a second record was added

`tec.py` holds the evaluator and `record.py` the build machinery; both are shared and neither
knows which storm it is working on. What differs between two records is declared as data in
`tec.EVENTS` — which products were archived and what they are named, which coastline rings the
distances are measured to, which ATCF deck, and how precisely the issuance time is known — and
the prose lives in that record's own module (`record_lowell.py`, `record_lala.py`).

Adding Lala changed Lowell's build path substantially and its published bytes **not at all**;
that is the check, and it is `git status` after a rebuild.

## What this reads, and nothing else

`tec.py::declared_inputs(event)` is the single list of files a build opens, and each manifest's
source register is built from it. Both directions are gated, for every event:

- nothing declared may be absent from the checkout,
- nothing read may go undeclared.

That is not a general principle applied speculatively. The Rev 3 hand-off this pipeline came
from declared a Natural Earth file it never shipped and never read for geometry, while leaving
the geometry it *did* read out of its own register, and a clean checkout could not build it at
all. `scripts/check-risk-provenance.mjs` enforces the same invariant in Node so it runs on every
pull request without the Python dependencies.

Coastlines come from `data/genesis-archive/coastlines/hawaii.geojson`, the shared repository
primitive, with islands selected by `properties.name`. See each event's `SOURCES.md` for what
was archived and what was verified.

## The time model

Three times are stored separately and never derived from one another:

```
nominal_cycle   the synoptic cycle the forecast belongs to     — the lead origin
issued          when the product went out
valid           what a row is valid for

forecast lead = valid − nominal_cycle
```

The cycle is **derived from each product's own forecast rows** (`nominal_cycle_from_rows`),
which land on the canonical NHC lead set measured from the cycle and on nothing else, and is
**refused** where the rows do not determine it. It is not taken from the release hour, because
that rule is right for a scheduled advisory and wrong for a special: Lowell's special 34 went
out `04/1830Z` and its discussion labels the `05/0000Z` row `12H` — twelve hours from the 12Z
cycle, six from the 18Z slot the release hour would suggest. A special reissues the running
cycle; it does not open one.

Where the rows genuinely do not determine the cycle, the **companion discussion does** — by
printing the lead label, not by applying a convention. Lala's last three advisories print five
rows as the system dissipates, and a five-row set beginning at +12 h is equally canonical read
as +24 h from a cycle six hours earlier. Two candidates, so `nominal_cycle_from_rows` refuses;
`label_cycles` then reads `12H` off the discussion. Each manifest records which advisories
those were.

`reconcile_lead_labels` proves the model from the archive rather than from convention. Both
hypotheses are scored on every archived discussion in both events, and the check requires the
cycle origin to hold **while the initial-position origin fails** — a product where both held
would not discriminate and is reported as unproven rather than counted as evidence. Across the
two archives: **84 discriminating discussions, cycle origin holds on 84, initial-position
origin on none.**

## Issuance precision differs between the two archives, and is declared

Lowell's products were captured off the WMO feed, so their filenames carry the transmission
time to the minute. Lala's come from NHC's public archive, which masks the transmission group
as the literal `TTAA00 PHFO DDHHMM`; those products establish their issuance only to the hour
they print for themselves, and no minute is reconstructed. `Event.issued_basis` says which, the
manifest carries it under `event_manifest.issuance_provenance`, and each page states it.

## The doorway

`doorway.py` writes `docs/risk/index.html`, and `build.py` runs it after the records because
it reads what they published. Every card is derived: the trigger evidence records from their
own manifests, the Pacific Genesis Watch from its ledger. Nothing on that page is a second
copy of a fact, so it cannot list a record that no longer exists or quietly stop listing one
that was added — and the ordering is the season's, taken from the earliest record each
manifest holds, not a list anyone maintains.

`scripts/check-risk-doorway.mjs` gates it in both directions: every published route under
`docs/risk/` must be linked from the index, and every link on the index must resolve. That is
not hypothetical — `docs/` is the Pages root, and `/preview/track-residual/` is served at 200
in this repository while being linked from nothing. The same gate holds the standing
constraint on this surface: no page here may carry the vocabulary of a trading or wagering
venue. It ships a `--self-test`.

The page's Methodology section states the standing commitments in prose and links the
repository's markdown underneath as source, rather than sending a reader to an unrendered
file and calling that a methodology.

## What is retired

A Lowell 18Z residual of 0.0 nm along-track and +13.6 nm cross-track, which took the 15Z
release as forecast hour zero and used a forecast position not traceable to an official
product. `scripts/check-retired-residual.mjs` walks every published file under `docs/` and
fails if that result can render anywhere except inside a withdrawal.
