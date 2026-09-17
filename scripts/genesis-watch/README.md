# Pacific Genesis Watch

Frozen decision states for pre-genesis Pacific disturbances, published at
`/category-alpha/risk/genesis-watch/`.

Each record holds the authoritative NHC source state at an official Tropical Weather Outlook
issuance, and — from record 0002 onward — the Storm Atlas state as the repository actually
held it when that source was acquired. The point is not to forecast anything. It is to make
what was knowable at a given moment recoverable afterwards, including what the system
refused to say.

## Capture

```sh
pip install -r scripts/genesis-watch/requirements.txt
python3 scripts/genesis-watch/capture.py --seq 0003 --expect-issued-after 2026-09-17T17:53Z
python3 scripts/genesis-watch/build.py
```

`--expect-issued-after` is what makes a capture **prospective**: the run refuses unless the
outlook's own issuance is strictly later than the one already in the sequence. It cannot
re-capture an outlook that is already recorded, and nothing is ever backdated.

`--dry-run` fetches and parses without writing or ledgering.

## Four timestamps, never conflated

```
source_issued_at        what the product says about itself
source_acquired_at      when this process fetched it
atlas_computed_at       when the Atlas state was computed
snapshot_committed_at   when the record entered the ledger
```

None is derived from another. `snapshot_committed_at` is null inside the record itself
because it belongs to the ledger entry, which is written after the record is sealed.

**Snapshot 0001 is an archived NHC baseline, not a joint decision state.** Its products were
issued 11:54Z and its manifest was captured at 16:23:22Z, and its own `atlas_state.status` is
`NOT CAPTURED IN THIS SNAPSHOT`. What the Atlas would have held at 11:54Z is not recoverable
— the archive is rebuilt several times a day — so it is not reconstructed. The Atlas state
is appended as record **0001b** with its own capture time and the gap stated. Record **0002**
is the first fully prospective capture: issued 17:53:52Z, acquired 17:54:21Z.

## Append-only, enforced

| Rule | Where it is enforced |
|---|---|
| A committed record is immutable | `contract.py::verify` + `scripts/check-genesis-watch-append-only.mjs` |
| Later outlooks append; they never rewrite | `contract.py::append` refuses a used `record_id` |
| Errors append a supersession record | `test_a_correction_appends_a_supersession_and_leaves_the_original` |
| Nothing appends onto a broken chain | `test_appending_onto_a_broken_chain_is_refused` |

Two hashes, deliberately: the record's own `manifest_sha256_excluding_this_field` travels
with it, and the ledger's `file_sha256` is the repository's claim about the bytes on disk.
An edit breaks both. Even a trailing newline breaks both — good faith is not a defence.

The canonical form is `json.dumps(body_without_the_hash_field, indent=1, ensure_ascii=False)`.
That convention was **chosen by snapshot 0001**, which arrived with its hash already computed;
adopting it is what let 0001 be imported byte-for-byte and still verify, rather than being
"normalised" into the contract on day one.

**It has already been used.** Record 0002 shipped with a provenance defect — two objects
recorded `identity_basis: "carried forward from ?"` because the generator read a record's
identifier from a field that snapshot 0001 does not have. 0002 was not edited. The generator
was fixed and **0002c1** was appended.

## What it refuses

- **No track.** None exists for a pre-genesis disturbance, and a formation polygon is not a
  cone. The polygon is drawn small, without a heading or a time axis, and labelled.
- **No formation probability of its own.** NHC's is the only one, in NHC's own words.
- **No GIS `0%` in place of the product's `near 0 percent`.** That phrase is a label at the
  bottom of the scale, not the number zero. Both are carried; the text stands.
- **No regeneration rate for the former TD15-E.** This archive enumerates genesis events, not
  remnant lows, so neither the population that regenerated nor the one that did not can be
  counted. A rate without a denominator is not a small rate — it is not a rate.
- **No invented invest or NHC identifier.** Internal ids are `PGW-*` and say so. GTWO area
  numbers are product-local and are carried as such.
- **No invented continuity.** An identifier carries forward only on an exact NHC name match.
  When NHC renamed the Mexico area between 0001 and 0002, a new id was minted and no
  continuity was asserted — and the new object did **not** inherit the retired one's test
  label, which would have asserted that continuity through the back door.
- **No conflation of formation probability with impact probability.**

Archive cohorts are conditioned on genesis having occurred — historical evidence about
pathways, never a formation or impact probability, and never multiplied by NHC's.

## The three tests

| | Object | Question |
|---|---|---|
| **HORIZON** | `PGW-2026-D1` | How does the system represent low near-term against high medium-horizon genesis probability? |
| **IDENTITY** | `PGW-2026-D2` | Can the archive preserve depression → remnant → possible regeneration without inventing continuity? |
| **EXPOSURE CLOCK** | `PGW-2026-D3` | How does geographic relevance migrate when near-term formation stays low and the medium-horizon probability is high? |

Tests follow identifiers, not slots in the product's ordering. `PGW-2026-D3` is no longer
carried as of record 0002; `PGW-2026-N4` is a new object with no test assigned.

## Verification, later

Each new outlook appends the changes — probabilities, geometry, wording, designation,
guidance availability, Atlas state, refusals — and the surface renders them. Scoring comes
afterwards, against what actually happened, in five columns: what was knowable, what changed,
what happened, what Storm Atlas said, and what it refused to say.

This is not a prediction contest. **Success does not require a storm to form.**
