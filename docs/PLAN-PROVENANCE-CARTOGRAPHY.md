# Plan: provenance-aware cartography — completing an encoding the Atlas already chose

**Status:** plan only. No implementation in this pass. No change to geometry, matching,
scoring, cohorts, methodology, refusal thresholds or archive data.
**Scope:** B1, B3, B4 from `research/external-workbench-audit/REPORT.md`. B2 is gated and out
of scope; B5 stays behind B3.
**Date:** 2026-08-22

---

## What the research actually established

Four findings decide the shape of this pass. Three of them narrow it; one of them removes a
recommendation the audit made.

### 1. Nothing here needs a pack-schema change

The audit flagged a risk that B3 would require packing `detection`, and B4 would require
packing `hours_since_genesis`. Both were checked against the build and the browser. Neither
holds.

**B3 — `detection` is already packed and already decoded.** `build_atlas_pack.py` writes the
landfall table with `detection`, `implied_speed_kt`, `suspect_relocation` and
`closest_approach_km`, and `archive.js:202-206` decodes all four plus a convenience
`derived: L.str("detection", k) === "segment_crossing"`. It is already consumed:
`storm-panel.jsx:168` renders the detection kind, `:176` the closest approach, `:190` the
relocation warning with implied speed; `analogs.js:541,580,676,726` and `query.js:78` read
`suspect_relocation`; `selection-layer.js:259` already draws a hollow mark for it.

**B4 — the distinction is derivable losslessly, so a new packed field is not justified.**
The pack states the case itself, in `build_atlas_pack.py`'s note on the track table:

> `hours_since_genesis` is NOT packed: it is exactly `(t - genesis_t)/60` on every row of this
> archive (verified: 0 rows differ in nullness, max error 0.0) and is derived in the browser.

Both operands are already hoisted as hot columns: `archive.js:52` `this.ptT` (int32 minutes)
and `archive.js:44` `this.genesisT` (int32 minutes, `I32_NULL` for none). Pre-genesis is one
integer compare per point, `t[k] < genesisT[i]`, with the existing null guard. This is exactly
the test `selection-layer.js:102,127,147` already performs.

**Therefore Path C is not required for anything in this pass.** No schema version bump, no
parity-harness work, no manifest change, no byte cost. The minimum data requirement is zero
new bytes.

### 2. The design intent for B1 and B4 is not merely stated — it is implemented

This settles the question the brief asked to be settled explicitly. `selection-layer.js:1-17`
is not a general appeal to honesty; it is a specific, prior design requirement, and the code
below it satisfies that requirement:

> **PRE-GENESIS IS REAL TRACK.** The archive's genesis is the first TROPICAL fix, and 1,580
> fixes in this archive sit before it, as disturbances and lows, reaching 252 hours back.
> Truncating the track at genesis would throw away observed positions; drawing them like the
> rest would imply a storm existed before one did. **They are drawn dimmed and named.**
>
> **INTERPOLATION IS NOT OBSERVATION.** Roughly half of all fixes were interpolated by IBTrACS
> rather than observed, and the archive refuses to let an interpolated point establish a
> threshold crossing. **So an interpolated segment is dashed**, and a crossing mark is only
> ever drawn where the archive placed one — on an observed fix.

The implementation, for a selected storm:

| Concern | Treatment | Site |
|---|---|---|
| Pre-genesis | `setLineDash([2,3])`, `globalAlpha 0.5`, `UNKNOWN_INK` | `selection-layer.js:121-123` |
| Interpolated | `setLineDash([3,3])`, `globalAlpha 0.75`, category colour retained | `selection-layer.js:139-140` |
| Suspect relocation | hollow diamond against plate background | `selection-layer.js:259,285` |

**`population-layer.js` contains zero `setLineDash` calls** and reads no provenance column
except `suspect_relocation`.

**Verdict on B4: this is restoring already-approved design intent, not adding a new visual
semantic.** The vocabulary was chosen, documented and shipped — for one layer. The population
layer never received it. That is incomplete propagation, and the plan below is written as
propagation, reusing the existing constants rather than inventing new ones. The same verdict
holds for B1's *intent*; see §4 for why B1's *implementation* does not follow.

### 3. The population layer already encodes one provenance rule, and it must not be disturbed

`population-layer.js:314-316` skips suspect relocations entirely:

> A crossing the archive flags as a probable relocation artefact is excluded from every rate it
> publishes; drawing it as an ordinary landfall would put it back.

So the two layers already differ deliberately: the **population** mat draws what the rates
count (suspect excluded, 3,349 of 3,379 marks), while the **selection** layer draws the
storm's own full record (suspect included, hollow). Any B3 work must preserve that split. It
is not an inconsistency to be tidied away.

### 4. B1 must be re-scoped — the encoding would be nearly information-free at population scale

This is a correction to the audit, and it comes from applying the brief's own "prove the
minimum requirement" discipline one level further: past *is the data available* to *does the
encoding carry information*.

The audit reported that 48.7% of track points are interpolated. That is true at the **point**
level. The renderer draws **segments**, and the archive's own rule — `selection-layer.js:148`,
a segment is interpolated if *either* endpoint is — behaves very differently:

```
segments total                              220,194
interpolated under the either-end rule      217,148   = 98.6%
storms with any interpolated fix            3,959 of 3,959   (all of them)
per-storm observed fraction, IQR            0.507 – 0.522
```

IBTrACS interpolates to 3-hourly between 6-hourly observations, so observed and interpolated
fixes alternate and almost every segment straddles one of each. There is no
mostly-observed storm to contrast against a mostly-interpolated one — the whole archive sits
in a band 1.5 points wide.

Propagating the dash to the population layer would therefore dash ~98.6% of a 3,959-track mat.
That destroys the alpha-accumulation reading the layer is built on (`population-layer.js:5-7`),
costs a per-pixel dash rasterisation across the densest surface in the product, and
distinguishes almost nothing. It fails the brief's own test — *verify dense cohorts remain
readable* — and it fails it structurally, not tunably.

It is also already handled. `provenance.jsx:61-65` reports observed and interpolated fix
counts, the latter in `--flag` tone with the caveat *"Interpolated by IBTrACS, not by this
archive. An interpolated point may never…"*, and `:126-129` reports the decimation stride in
force. The fact is disclosed where it is legible: as a number, next to the count it qualifies.

**B1 disposition: no change. Already satisfied — dashed on the selected storm where the
distinction is inspectable, and disclosed numerically in the provenance panel where it is
not.** The audit's B1 recommendation is withdrawn.

---

## Path selection

The brief asked the plan to branch on what the research proves rather than force three items
into one pass. It proves this:

| Path | Condition | Verdict |
|---|---|---|
| **A** — B1 + B4 renderer-only | existing browser data supports both | **Partially taken.** B4 proceeds renderer-only. B1 is withdrawn on information-content grounds, not data grounds. |
| **B** — B3 renderer-only | `detection` already reaches the client | **Taken.** It does, and is already rendered in the storm panel. |
| **C** — B3 isolated behind a pack-schema change | `detection` absent client-side | **Not required.** No schema, version or parity work is triggered by this pass. |

**Resulting pass: B4 + B3, renderer-only, no build change.** They stay together because both
are propagation of an existing vocabulary into layers that lack it, they touch two adjacent
files, and neither can regress the pack. B1 leaves the pass entirely.

---

## Phase 1 — B4: pre-genesis on the population layer

**Change:** `population-layer.js` `_drawTracks`. Segments whose forward endpoint is at or
before `genesisT[i]` move to a separate pass drawn with the selection layer's existing
pre-genesis vocabulary — `setLineDash([2,3])`, reduced alpha, `UNKNOWN_INK` — and are excluded
from the category passes.

**Why this one is worth drawing when B1 is not.** Pre-genesis is 9,450 fixes across 744
storms — about 4.2% of points, concentrated at track origins. It is sparse, spatially
localised, and it fixes a live misreading: for those 744 storms the genesis dot currently sits
*mid-line*, with the track continuing upstream of it in identical ink. Genesis dots are the
Atlas's primary click target (`hit-test.js:10`), so the one mark a reader is asked to aim at
is the one whose meaning the line contradicts.

**Cost.** One additional pass, restricted to the 744 storms that have pre-genesis fixes, plus
one integer compare per segment in the existing category passes to exclude them. Uniform mode
goes 1 → 2 paths; intensity mode 7 → 8. Against `bench-atlas.mjs`'s `cohortWideMs: 90` budget
this should be immaterial, but it is measured, not assumed — see Verification.

**Decimation.** `strideForZoom` skips fixes at low zoom, so the genesis boundary can fall
inside a skipped span. Follow the precedent already in the file — *"The final fix is always
joined, whatever the stride"* (`population-layer.js:228`) — and always join the boundary
segment at full resolution. A storm's genesis must not move because the reader zoomed out.

**The count discrepancy is resolved — see Amendment 1.** The rule is correct and unchanged;
the comment was stale. Authoritative figures, measured from the pack the browser loads:
**9,450 pre-genesis fixes across 744 storms, reaching 252 hours back.**

## Phase 2 — B3: landfall detection kind, where it is legible

**The inspectability requirement is already met.** `storm-panel.jsx:168-193` renders the
detection kind, the closest published approach, and — for a suspect relocation — the implied
speed. Selecting a storm already exposes the provenance of each of its landfalls in words. No
new hover plumbing is needed, and none should be added: making landfalls hit-test targets would
cut across the rule in `hit-test.js:10-12` that genesis points are the click targets and
everything else probes. That rule is load-bearing and is not in scope.

**Change:** `selection-layer.js` `_marks` / `drawMark`. The landfall diamond currently carries
one bit (`hollow` for suspect relocation). Extend it to carry detection kind as *mark form*,
not colour — `LANDFALL_INK` keeps its single job:

| State | Form | Population |
|---|---|---|
| `hurdat2_L_record` | filled diamond (unchanged) | 1,292 drawn |
| `bracketing_fix` | filled diamond with a surrounding ring | 1,052 drawn |
| `segment_crossing` | hollow diamond, ring weight scaled by `closest_approach_km` | 1,005 drawn |
| `suspect_relocation` | existing hollow + cross-bar | 30, excluded from the mat |

**Derived is not invalid, and the design must say so.** A `segment_crossing` is the archive's
answer where no source published one — for forty years of East Pacific landfalls it is *the
only* answer that exists (`geo.py:12-15`). The encoding must therefore read as *how this was
established*, not as a warning. Concretely: no red, no alert glyph, no reduced opacity on the
mark itself; the ring is a statement of method, and the panel already carries the number that
qualifies it.

**Iniki is the acceptance case.** `EP181992` / Kauai is a `segment_crossing` with
`closest_approach_km = 41.03`, and `geo.py:37` treats ~45 km as the point beyond which such
a crossing is *"a straight line's opinion"*. It must keep its landfall, its region, its
sub-region and its place in every rate. **Nothing in this phase may filter, reweight or
threshold on `closest_approach_km`** — it scales a ring's weight and nothing else. The audit
already confirmed Atlas's attribution here is independently correct to 4.7 cm; this phase must
not put that at risk.

**A fourth state exists and should be honoured.** `category` is NULL on 466 landfalls
archive-wide — 241 of them on `segment_crossing` rows the population mat draws — a *withheld* Saffir-Simpson class where the bracketing fixes
disagree, Iniki among them (`build_atlas_pack.py` landfall note; `archive.js:196-198`).
`provenance.jsx:71-73` already counts these. The mark for a withheld class should not borrow a
category colour it does not have; use `UNKNOWN_INK`, consistent with `palette.js`'s treatment
of unrecorded wind.

**Population layer: no change in this pass.** At basin zoom the landfall mark is a 2.3–2.8 px
cross (`population-layer.js:301`). Three legible forms do not fit in it, and the same
information-content argument that removed B1 applies. Revisit only as a zoom-gated refinement
after Phase 2 ships, with a legibility check, not before.

---

## What must not change

- Geometry, matching, scoring, cohort rules, methodology, refusal thresholds, archive data.
- The pack schema, its version, the parity harness, the manifest. This pass touches neither.
- The suspect-relocation exclusion on the population layer (`population-layer.js:314-316`) and
  its deliberate difference from the selection layer's hollow mark.
- The hit-test rule that genesis points are the click targets and everything else probes.
- `LANDFALL_INK` as a single-job colour; `palette.js:3` rations hue to five jobs and this
  pass adds none.
- Atlas unwrapped longitude stays canonical internally. If we later export to GIS systems,
  add an explicit wrapped-longitude transform at the export boundary — PostGIS geography
  rejects the unwrapped form outright, and the planar alternative reports a Central Pacific
  track as intersecting the mid-Atlantic. No production geometry change is warranted.

## Verification

1. `bench-atlas.mjs` before and after, `cohortWideMs` and the per-cohort budgets. The added
   pass must not move them beyond noise; if it does, the pre-genesis pass is gated by zoom.
2. `check-atlas-dom.mjs` — pixel-level assertions; a new visual class may need a case.
3. `test-atlas-pack.mjs`, `test-atlas-parity.mjs` — must be untouched and must stay green. If
   either moves, the change has escaped the render layer and the pass is wrong.
4. `audit-claims.mjs` — any new capability/provenance wording belongs in `docs/app/claims.js`
   and nowhere else. A legend entry for the pre-genesis class and any B3 legend text go there.
5. `provenance.jsx` — add a pre-genesis fix count beside the existing observed/interpolated
   rows (`:61-65`), once the Phase 1 open item resolves which count is authoritative.
6. Dense-cohort readability check at basin zoom on the broad NA+EP archive, a dense
   hurricane-season cohort, and a small refused cohort — the pre-genesis pass must not thicken
   the mat.

---

## Out of scope

**B2 — closest-approach distribution.** A new analytical output, not cartographic polish. Not
started, and not to be added to the UI ahead of its own specification. Before any
implementation, specify separately: the exact distance definition; point-to-track versus
segment-to-geometry calculation; sphere versus ellipsoid convention; treatment of
observed versus interpolated segments; whether pre-genesis track contributes; which summary
statistics are exposed; antimeridian behaviour; zero-peek and conditioning implications;
refusal and minimum-sample behaviour; Python/browser parity requirements. Then test whether it
improves decisions across multiple cohorts, not only the Two-C case. That specification belongs
in `research/`, as a pre-registration, in the shape of
`research/evidence-boundary/PRE-REGISTRATION.md`.

**B5 — landfall concentration surface.** Deferred until B3 is complete, and then only with an
authoritative-records-only toggle. Without it, a third density grid would launder 1,005 derived
crossings into apparent fact.

**Felt.** Blocked at the workspace entitlement. Nothing further.

**Rejected and staying rejected:** live-centre proximity as analog similarity; KDE/H3
pseudo-cones; smoothing historical pathways into forecast-looking surfaces.

---

## What must not be repeated

The audit recommended B1 on the strength of a true point-level statistic — 48.7% of fixes are
interpolated — without checking what the renderer actually draws. Segments are not points, the
archive's own either-end rule turns 48.7% into 98.6%, and an encoding that fires on 98.6% of
its subject encodes nothing. The data being available was never the question worth asking.

Ask of every proposed encoding, in this order: is the distinction *derivable* from what the
browser already holds; does it *carry information* at the scale it will be drawn; and is it
already *disclosed* somewhere more legible. B1 passed the first and failed the other two.

---

## Amendment 1 — the pre-genesis count, resolved

Registered after measuring, because the measurement is the point. The plan as first written
carried three numbers and refused to choose between them. It can now choose.

**What each number counts.**

| Number | What it actually counts | Source |
|---|---|---|
| **9,450** | fixes strictly before genesis, over all 3,959 storms, across 744 of them | measured from `atlas-tracks-v1.bin.gz` + `atlas-core-v1.bin.gz` |
| 3,969 | the subset of those whose `stage` is a disturbance, low or wave (`LO`+`DB`+`WV`) | same, filtered |
| 1,580 | **nothing reproducible** | `selection-layer.js:8` |

**Which definition matches the renderer.** `selection-layer.js:127,147` treats a segment as
pre-genesis when its forward endpoint is at or before genesis. Counting segments that way and
counting fixes strictly before genesis give the *same* number on this archive — 9,450 both
ways — so the two framings do not need to be distinguished in prose. That equality is now
asserted rather than assumed.

**Is the comment stale, the rule wrong, or are these different populations?** The comment is
stale. The rule is right. Twenty-four candidate definitions were tried against the archive —
observed-only, interpolated-only, non-tropical-only, `LO`/`DB`/`WV` in five combinations,
per-basin (NA/EP/WP), `EP`+`WP`, `season >= 1971`, stage-null, storms rather than fixes, and
each of those crossed with observed-only — and **none yields 1,580**. The nearest neighbours are
1,623 (`stage` null and observed) and 1,557 (`DB` only); neither is a definition anyone would
have written down. There is no git history to date the comment: the whole Atlas tree arrived in
a single commit, so the sentence cannot be traced to an earlier archive.

Two details make the diagnosis firm rather than merely likely. The same sentence's *"reaching
252 hours back"* is **exactly right today** — a maximum is stable as an archive grows once its
record-holder is in, while a count is not, which is the signature of a partially-refreshed
comment. And the archive is rebuilt roughly four times a day, so any count written into a source
comment drifts by construction.

**The rule is sound, and that is now asserted structurally.** Genesis is defined as the first
*tropical* fix (`schema.py:48-51`, `genesis_events.py:38-53`), so no fix before it may be
tropical. Measured: **0 of 9,450 pre-genesis fixes are tropical.** That invariant — not the
count — is what makes "drawn dimmed" honest, and a break in it would be a definition bug rather
than a documentation one.

**The rule was not changed to fit the numbers.** Only the sentence was corrected.

**Anti-drift.** `scripts/test-atlas-provenance.mjs` recomputes every number the provenance
comments state, from the pack, through the browser's own accessors, and fails naming the new
value if any has moved. It also pins the tropicality invariant and the landfall detection counts
against the manifest. It needs no Python and runs offline.

## Amendment 2 — reconciliation against the adversarial cross-check

The verification workflow returned 7 of 7 readers and 2 of 3 verifiers; the third verifier and
the synthesis agent died on a session limit, so the reconciliation below was done directly. Both
surviving verifiers approached the gating question independently — one from the build side, one
from the browser side — and were instructed to refute rather than confirm.

**The plan survived on every material point.** Both verifiers independently confirm:

- `landfalls.detection` — **packed**, reachable as `archive.storm(i).landfalls[n].detection` and
  column-form `archive.landfalls.str("detection", k)`. B3 stays renderer-only; Path B holds.
- `landfalls.closest_approach_km`, `suspect_relocation`, `implied_speed_kt`, `region`,
  `sub_region`, `category`, `vmax_kt` — all packed and named.
- `track_points.quality` — packed, `archive.ptQuality` + `archive.qualityDict`.
- `track_points.hours_since_genesis` — **not packed, accessor NONE**, exactly as the build note
  states. Path C stays unused.

Three refinements are folded in. None changes the path selection, the B1 withdrawal or the B4
verdict.

**1. There is no shared accessor for the pre-genesis rule, and it is already implemented three
times.** Both verifiers flagged that `hours_since_genesis` "costs nothing to recover" overstates
the position: the derivation exists only as a local expression inside one React component
(`transport.jsx:85-87`), with no `archive.hoursSinceGenesis()` and no engine-level equivalent.
Checking that against the tree, the pre-genesis *predicate* now exists at three sites —
`selection-layer.js:127`, `selection-layer.js:147`, and `transport.jsx:87` — and they already
disagree slightly on the null guard: selection-layer tests
`!Number.isNaN(genesisMin) && genesisMin !== -2147483648` (`:103`), transport tests only
`genesisMin !== -2147483648` (`:84`). Adding a fourth copy in the population layer would make
that worse. **The implementation therefore introduces one shared predicate in the render layer
and routes the new code through it**, rather than copying the comparison again. This is a
strengthening of the plan, not a departure from it.

**2. `track_points.stage` is null on 45,542 of 224,153 rows (20.3%).** Anything reading `stage`
must handle null on one row in five. The pre-genesis population is itself 3,354 stage-null fixes
out of 9,450. The regression test's tropicality check already handles this correctly by falling
through to `nature`, mirroring `genesis_events.py:_is_tropical`; noted here so the next reader
does not assume a clean column.

**3. Byte budget, for the record.** `bench-atlas.mjs:159` gates `packTransferMB` at 3.0 MB over
every `.gz` and `.json` in the data directory — including the lazily-fetched environment pack —
leaving roughly 349,010 B of headroom. This pass spends none of it, and the figure is recorded
only so a future pack proposal starts from the right number.

**Corrections the verifiers raised that do not affect this plan:** several `schema.py` line
references in the phase-1 reader's own report were off by one to three lines, and one
`build_atlas_pack.py` tuple was cited a line late. Every citation in this document was verified
independently against the current working tree — which matters, because `population-layer.js`
grew from 337 to 346 lines mid-audit when the branch was restarted onto a refreshed `main`.
