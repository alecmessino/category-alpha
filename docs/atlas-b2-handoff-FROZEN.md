# Storm Atlas — B2+ handoff (FROZEN, approved for implementation)

**Status: frozen and approved.** Design is closed. The next work begins in Claude Code with
**PR 1 · Resting instrument**. Nothing in this document is implemented.

> **Implementation record — appended, not part of the frozen design.**
>
> **PR 1 · Resting instrument is built.** `docs/storm-atlas/` now ships the 5c frame: plate left
> and evidence ledger right, a 30px question whose unset genesis and outcome sides are pressable
> clauses, one cohort line, five type steps, paper-set plate metadata, an uninterrupted dark
> plate, the `OUTCOME | n / N | RATE | 95% WILSON` research table with the limits pinned to its
> foot, the Saffir–Simpson key, the Figure 1 caption and the foot colophon.
> `scripts/check-atlas-instrument.mjs` asserts that frame in the real page at 1920 / 1440 / 900 /
> 768 / 760 / 390, and `scripts/check-atlas-published-values.mjs` pins every published figure
> against a committed snapshot.
>
> **Three measured deviations from 5c, each forced by a gate this repository already had:**
>
> 1. **Plate 834×499, not 834×580.** The aspect floor is 1.67 rather than 1.421, derived from the
>    research corridors the opening view must contain, the NA + EP clamp and Leaflet's zoom snap.
>    At the frozen height the opening view drops the East Pacific development region off a plate
>    captioned for it — `scripts/check-atlas-camera.mjs` fails on it. See `atlas.css`.
> 2. **The Wilson interval keeps its percent sign** (`88.1–90.1%`, not `88.1–90.1`). The brackets
>    went with the shared cell; the unit is the house form every other surface prints and a bound
>    with no unit beside a rate with one is a reader's problem.
> 3. **Outcome names keep the archive's own labels** (`TROPICAL STORM`, not `Reached tropical
>    storm`). They are the published row identifiers the gates and the values snapshot key on.
> 4. **A limit's count is not set at 14px.** The archive publishes each limit as one measured
>    sentence with its figures inside it — there is no free-standing numeral to promote, and
>    pulling one out means rewording the finding. The block is pinned under its ink rule as
>    specified; only the count's type step is unmet. See the comment at `.at-deck-limits`.
>
> **Two things 5c does not place, left where they were:** HOME and FIT stay Leaflet controls on
> the plate rather than moving to the paper caption line (map interaction semantics are outside
> this PR), and the coordinate readout is on paper beneath the plate, which is what 5c's own
> implementation-QA note asks for.
>
> **What the frozen measure costs between 900 and 1387, measured:** 5c states the ledger as a
> percentage that is 486px at 1440, and a percentage alone falls to 304px at 900 — a measure that
> puts a refused row's STATUS off the right-hand edge of a horizontal scroll. The measure is
> therefore floored at the five resting tracks' own width, and what pays for it is the plate:
> 834px at 1440 and 1180 at 1920 as specified, but 460 at 1024 and 336 at 900. Below 1280 the
> plate's two paper lines wrap rather than truncate, so the seven-class key survives the narrower
> figure whole. The instrument stacks at 900 exactly as frozen.
>
> **One consequence of the frozen measure, recorded rather than designed:** the inspector is an
> overlay on the plate at every width, where the previous shell gave it a column of its own above
> 1180. The panel, its state, its bridge and its close are untouched — but a resident column
> would make the plate's width a function of whether a storm is selected, and the plate's width
> is what 5c freezes at 834 and 1180. The selected-storm state is otherwise unchanged and its
> redesign is still PR-later work.
>
> Everything else in this document is still design, still unimplemented, and still the authority.
>
> ---
>
> **HANDOFF B IS IMPLEMENTED. Appended, not part of the frozen design.**
>
> The approved Storm Atlas redesign (Handoff B · Institutional Cartographic) is built into
> `docs/storm-atlas/`. 5c remains the resting-screen authority for COMPOSITION and Turn 4 / 3j for
> INTERACTION; B supplies the visual language, the evidence hierarchy and the interaction model,
> and where the two disagreed the composition locks won. Nothing analytical came from the
> prototype: `DEMO_MDR`, `COND`, `genStorms`, `mulberry32`, its `BASE` table and its
> `resolveRefusal` are absent from the source and the bundle, which
> `scripts/check-atlas-canonical.mjs` asserts by name over both.
>
> **What changed, and what each is bound by:**
>
> 1. **One shell, B's charcoal.** `#13171c` with the plate one tone below it at `#0f1317`; the
>    paper shell is retired as a selectable surface and its tokens remain, unread, for Direction
>    C. There is no `data-shell` attribute and no stored preference, and the adherence gate fails
>    if a shell selector returns. The contrast gate now sweeps every word on the one shell.
> 2. **Two families, five sizes — B's families on 5c's scale.** IBM Plex Sans carries the question
>    and every outcome name where Source Serif 4 did; IBM Plex Mono carries every figure. Both are
>    self-hosted, and Plex Mono stopped loading from Google Fonts for the terminal as well.
> 3. **The plate rests on Pathway counts.** Three readings of the same storms — PATHWAY COUNTS /
>    GENESIS COUNTS / TRACKS — as a mode segment on the plate's own head, with the tracks kept
>    under either surface at a reduced alpha. The counts are literal and deduped by storm id;
>    `scripts/test-atlas-cells.mjs` proves both against a brute-force count over the real archive,
>    and the cell under the pointer or the reticle prints its own count on the plate's foot.
> 4. **The interval is a mark as well as a sentence.** A hairline whisker, a dot at the point
>    estimate and a tick at the archive base rate, on a common 0–100 track, beside the interval
>    still printed in type. No filled bar: 5c removed that reading and B does not ask it back.
> 5. **The lens.** Hovering or holding a row of the answer draws that row's own storms on the
>    plate and echoes its already-published figures on the foot. The member rows come from
>    `scoreCases`, collected in the same loop that counts the numerator, so the lifted set and the
>    published n are the same set by construction. Holds publish nothing —
>    `scripts/check-atlas-lens.mjs` captures the URL, the question, the cohort and every figure
>    either side of one.
> 6. **The brush.** A shift-drag lifts the storms of the cohort that passed through that water and
>    states the count. It is an inspection only: a rectangle is not a condition this archive can
>    be asked, so it writes no URL and no cohort. A rectangle genesis condition was DEFERRED.
> 7. **The keyboard.** RETICLE turns the arrows into a crosshair on the plate; Enter does what a
>    click does, Escape gives the arrows back to Leaflet, and a polite live region says what is
>    under it. `scripts/check-atlas-a11y.mjs` drives the whole path with keys alone.
> 8. **The selected storm opens on the minimum strip** the locked rules ask for, with the record
>    one press behind OPEN RECORD. Nothing was removed; the bridge stays pinned in both states.
> 9. **The editor is anchored to the clause that opened it.** It may overlap the plate and it may
>    not move it: absolutely positioned, so the plate's rectangle stays a function of the viewport
>    and the composition — `check-atlas-stability` drives that transition and measures both sides.
> 10. **The plate is self-contained.** The third-party tile service is gone; Natural Earth 110m
>    land is packed with the archive as the context tier under the archive's own landfall rings.
>
> **Measured divergences from Handoff B, each forced by a lock this repository already had:**
>
> 1. **No tabs and no REFUSAL column.** B folds the matrix behind All / Intensity / Landfall and
>    puts the refusal in a column; the locked rules keep STATUS a row-line at every width and
>    forbid a fold that can hide a refusal.
> 2. **No KPI headline.** B's chartboard leads with a 17px rate and its interval; 5c forbids KPI
>    cards, so the synthesis sentence keeps the position and the two outcome denominators are
>    stated on the answer's own head instead.
> 3. **The status vocabulary is the registry's.** B prints OK / TRUE 0% / BELOW MIN in coloured
>    pills; the refusal registry's closed vocabulary and single ink stand, and a true 0/N still
>    publishes as 0.0% with its Wilson interval.
> 4. **The interval is a whisker, not a bar** (see above).
> 5. **The chrome accent is slate, not cyan.** B reserves the cyan for cartography; the chrome
>    takes `#8ea3b8` so nothing outside the plate competes with it, and the probe ring keeps the
>    cyan as `--plate-accent`.
>
> **An editorial pass followed the correctness pass**, reviewed at 1440×900 and at US Letter
> landscape (1056×816), both at 100%, against one question: with the branding removed, would
> this still read as an art-directed research publication? What it changed, none of it a number:
> the plate head names the plate, its reading and its aperture and nothing the cohort line
> above it already says (the context count moved into Figure 1's sentence); the projection
> moved from the foot to the figure line beside PLATE NOTES; RETICLE joined HOME and FIT on the
> camera bar, since it drives the plate and the foot reads it; the foot keeps one readout slot,
> the cell under the pointer or the row that is held, and neither is ever ellipsised inside a
> figure; the caption apparatus now actually queries the plate's width (its container rules had
> been resolving to nothing, so items were clipped where they should have given way); the
> invitation uses the stylesheet's own placement at the head of the plate rather than an inline
> box over the Gulf; the sample gate is a word rather than a pill; the density legend lost its
> border; and with a storm selected the count surfaces dim under it the way the tracks do.

> **PR 2 onward of the design document below has not been started.**

## Two authorities

| Concern | Authority |
|---|---|
| **Resting-screen specification** — type scale, proportions, chrome, ledger, plate framing, spacing | **`5c` · Minimal Research Instrument** (turn 5). **Supersedes 4a / B2+.** |
| **Interaction and state behaviour** — the 16 states, contracts, gates, methodology boundaries, responsive rules, PR sequence | **Turn 4** (`4e` state contract, `4f` treatment table, `4g` responsive contract, `4h` governance), with `3j` as the interaction contract. **Unchanged.** |

Artifact: `Storm Atlas - Directions.dc.html`. Where an earlier turn disagrees with these two,
these two are right.

## 5c — the authoritative resting frame
- **Two type families, five sizes.** Source Serif 4 carries the question and every outcome
  name; IBM Plex Mono carries every figure. No sans in the frame. Sizes: **30 · 14 · 11.5 ·
  10.5 · 9.5** — every element assigned to one step. (4a used 12 sizes and three families.)
- **Uninterrupted dark plate.** No chrome bands. The plate is one rectangle; its metadata is
  paper-set immediately above and below, aligned to its edges. Measured plate box 834×580.
- **Class key preserved.** The Saffir–Simpson class legend (TD · TS · 1 · 2 · 3 · 4 · 5, with
  `MAJORS CARRY EXTRA STROKE`) sits on the paper line directly beneath the plate at 9.5px
  mono — compact and subordinate to the question and plate, but present wherever
  class-coloured tracks are shown. **The class palette is never removed for minimalism.**
- **Figure 1 caption** — the one borrowing from `5b`. A serif sentence under the plate naming
  what is drawn, the five modelled landfall regions, that the landfall rule never consults
  the basemap, and the two gestures.
- **Cohort / promotion line.** One 11.5px mono line: `3,885 / 3,959 archive storms ·
  SUFFICIENT · MIN 10`, scope, and the promoted unknown as a clause in the same voice with
  one `see the row`.
- **Simplified ledger.** `OUTCOME | n / N | RATE | 95% WILSON`, interval in type, 29px rows,
  hairline rules, no header band, no filled group bands.
- **Pinned limits** under one ink rule, counts at 14px — the same size as a rate, because a
  limit is a finding.
- **Foot colophon.** Wordmark, method, pack, build, and CALIBRATION · PROVENANCE · CITE on
  one hairline-ruled line at the foot.

## Not to be reintroduced
Chrome bands · rails · a third type voice · dashboard furniture · a light plate in the
instrument · KPI cards · filled group bands.

## Implementation QA (not design)
The coordinate readout sits on paper rather than on dark, so during a pan the numbers change
just off the map. Left-aligned to the plate's edge and immediately beneath it. **Treat as an
implementation QA item, not another design cycle.**

## Retired · parked
- Turn-1 frames **1a, 1c, 1d, 1h**: `EXPLORATION — SUPERSEDED BY B2+ · NOT AN ENGINEERING
  SPEC`. Not to be corrected.
- **4a / B2+ resting frame**: superseded by 5c for the resting screen; its structural
  decisions live on in turn 4's contracts.
- **5b · Editorial institutional**: not shipped. Its rail and numbered notes are the right
  material for Direction C.
- **Direction C**: journal / CITE / export treatment, and the only place the paper plate
  belongs. Outside the seven PRs; not to be developed now. `1c` is its reference.

## Architecture and law
Architecture: **B2** plate + ledger, carried by **E** every row is a lens.
Governing law: **Inspection changes the view. Commit changes the answer.**

## Frozen rules (turn 4, unchanged)
- **The PUBLISHES chip is the state-contract test.** Of sixteen states, fourteen publish
  nothing, one publishes an editor-local preview count, and exactly one — commit — publishes
  an answer and writes the URL. If a proposed state cannot be given one of these chips
  honestly, it is not an inspection and belongs behind the query sentence.
- Only commit publishes the answer and writes the URL. The query sentence is the only
  publishing surface. The preview count is editor-local and must come from the canonical
  query path.
- A canonical member-ID feed is required before the lens ships. The renderer never
  approximates cohort membership and never reproduces a statistical predicate.
- Nonmember context loses colour, never contrast — a nonmember row still publishes a rate
  and must stay AA.
- Overlap remains conditional on the real basin-density test. Fallback: set emphasis plus a
  legend entry carrying **no number**.
- Below 900px, loss of simultaneity is explicit and handled by the held-row + plate-footer
  echo, with the held row sticking to the top of the ledger. 390px clause-edit and
  single-hold treatments are specified in `4g`.
- The scale bar is computed from the actual rendered plate box at layout time, from the
  plate's own aperture and centre latitude. **Never stored as a fixed constant.** (Evidence:
  restoring the class key and Figure 1 caption to 5c moved its bar from 65px to 61px.)
- Holds are view state: they never write rates, cohort, citation or URL. Nested/containing
  thresholds cannot be co-held. Overlap publishes nothing. `SCORE THIS AS A COHORT →` opens
  the clause editor unset.
- Limits stay pinned at the ledger foot; promotion is presentation priority only.
- Coordinate readouts are legal only inside the plate's stated aperture; off-plate reads `—`.
- East Pacific questions use the EP plate (168°W–98°W). Reticles make no distance claim.
- Dark plate inside the paper shell. Tracks remain placeholder until the engine supplies
  canonical member IDs.

## Promotion terminology (locked)
- **PROMOTE UNKNOWN** when `unknown_n > min(numerator)` over **every published row** where
  `numerator > 0` — not only visible rows. A statement of scale, not of consequence.
- **ZERO-EVENT / UNKNOWN-DOMINANT** is a separate case: `max(numerator) = 0` over relevant
  rows with `unknown_n > 0`. Copy order: nothing was observed, *then* part of the cohort is
  unseen.
- Out of bounds: any clause about what the unknown "could" do to a conclusion; a zero
  rendered as `0.0%` with an interval; the word "no" without its denominator in the same
  sentence.
- Invariant: identical in every view state. A hold cannot alter it.

## Implementation gates
- **GATE A · 300px basin plate.** Prove the two-ink lens stays interpretable at 390 on a real
  device. If it fails: use the documented fallback (set emphasis + legend, count and rate in
  the plate footer). Do not thicken strokes until the population turns to mud.
- **GATE B · 180px mobile plate strip.** Prove ring geometry stays judgeable — a 500 km ring
  is ~27px there. If it fails: adjust the mobile inspection treatment rather than shrinking
  blindly. A ring too small to judge is a condition set on trust.

## PR sequence
1. **Resting instrument** — build to `5c`. No engine surface; improves the product alone.
2. **Refusal and limits presentation** — needs `unknown_n`, per-row numerators, unpublishable flag.
3. **Single-row lens** — gated on the member-ID feed.
4. **Clause preview and commit** — needs a count-only endpoint sharing the cohort builder's predicate path.
5. **Selected storm, ledger preserved** — the strip stays a strip.
6. **Reverse membership** (genesis → ledger) — reuses PR 3's feed and de-colouring rule.
7. **Two-row inspection** — gated on the basin-density test.

Ordering principle: presentation before interaction; inside interaction, least new engine
surface first.

## Sources
`alecmessino/category-alpha@main`: `docs/storm-atlas/atlas.css`,
`docs/storm-atlas/src/render/palette.js` (CATEGORY_COLOR, POPULATION_INK `#7a9cbb`,
EMPHASIS_INK `#cfe6fa`, GENESIS_LIFTED_INK `#9fdfff`, MAJOR_WEIGHT 1.35),
`docs/storm-atlas/ATLAS-LIVE.md`, `docs/dossier/lala/`. Plate geometry rendered from Natural
Earth 110m via `ref/plate-render.html`.
