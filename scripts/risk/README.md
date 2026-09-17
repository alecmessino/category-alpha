# Millibar Risk Evidence — the Trigger Evidence Record pipeline

Builds the published record at `/category-alpha/risk/lowell-2026/` from archived official
products. One command produces the web note, the one-page PDF and the machine-readable
manifest, and a second one gates them.

## Rebuild

```sh
pip install -r scripts/risk/requirements.txt
python3 -m playwright install chromium          # the PDF is rendered, not hand-assembled
cd scripts/risk && python3 build.py && python3 gates.py
```

`gates.py --offline` skips the one gate that needs the network — the live-URL 200 check —
and reports it as SKIP rather than counting it as a pass. Everything else runs offline
against committed bytes.

**A rebuild is byte-identical.** `python3 build.py && python3 gates.py && git status` is the
reproducibility check: if anything under `docs/risk/lowell-2026/` shows as modified, the
build is not a function of its inputs. Chromium stamps the PDF with the wall clock, which was
the only thing that ever differed between two renders, so the dates are pinned to the latest
archived source transmission time instead.

## What this reads, and nothing else

`tec.py::declared_inputs()` is the single list of files the build opens, and the manifest's
source register is built from it. Both directions are gated:

- nothing declared may be absent from the checkout,
- nothing read may go undeclared.

That is not a general principle applied speculatively. The Rev 3 hand-off this pipeline came
from declared a Natural Earth file it never shipped and never read for geometry, while
leaving the geometry it *did* read out of its own register, and a clean checkout could not
build it at all. `scripts/check-risk-provenance.mjs` enforces the same invariant in Node so
it runs on every pull request without the Python dependencies.

Coastlines come from `data/genesis-archive/coastlines/hawaii.geojson`, the shared repository
primitive, with islands selected by `properties.name`. See
`data/risk/lowell-ep122026/SOURCES.md` for why, and for what was verified before switching.

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

`reconcile_lead_labels` proves the model from the archive rather than from convention. The
discussion products print the forecast table with its labels attached, and those labels
reconcile with the explicit UTC valid times against the cycle and against nothing else. Both
hypotheses are scored on every archived discussion, and the check requires the cycle origin
to hold **while the initial-position origin fails** — a product where both held would not
discriminate and is reported as unproven rather than counted as evidence.

## What is retired

A Lowell 18Z residual of 0.0 nm along-track and +13.6 nm cross-track, which took the 15Z
release as forecast hour zero and used a forecast position not traceable to an official
product. `scripts/check-retired-residual.mjs` walks every published file under `docs/` and
fails if that result can render anywhere except inside a withdrawal.

The record's own 18Z figures are against **NHC's own interpolated 18Z position** (aviation
advisory 46, `+3 HR`), and both source vintages of the verifying fix are reported as peers:

| Vintage | Along | Right-of-track |
|---|---|---|
| As known at 18Z · Intermediate 46A (18.0N 162.1W) | −5.0 nm | +13.6 nm |
| Revised at 21Z · Advisory 47 prior position (18.0N 162.2W) | −7.3 nm | +8.3 nm |

Same forecast, same valid time. The verifying observation changed with the source vintage,
and no later product overwrites the earlier one.
