# The operational layer — `atlas-live-v1`

The Storm Atlas packs are pure IBTrACS. IBTrACS publishes a **provisional** row for the running
season and stops updating it long before the storm stops existing. Measured on the shipped pack:

| | IBTrACS (archive) | ATCF b-deck (operational) |
|---|---|---|
| `CP012026` / LALA | 49 fixes | 63 fixes |
| peak wind | 65 kt | **115 kt** |
| class | Category 1 | **Category 4** |
| minimum pressure | 988 mb | **947 mb** |
| record ends | 2026-08-16T00:00Z | 2026-08-25T12:00Z |

Every number in the left column is a correct archive column. What was wrong was the sentence
around them — the inspector's masthead read *One storm, whole life* over a storm that was still
being written up nine days later. The b-deck in the right column was already being fetched and
parsed by `scripts/ingest.mjs` on the same ten-minute tick; it was never joined.

This document is the precedence rule in full. The code that implements it is
`scripts/lib/atlas-live.mjs` (the emitter) and `docs/storm-atlas/src/engine/live.js` (the browser
layer). The gates are `scripts/test-atlas-live.mjs`, `scripts/test-atlas-live-boundary.mjs` and
`scripts/check-atlas-live-dom.mjs`.

---

## 1. What the artifact is

`docs/storm-atlas/data/atlas-live-v1.json`, written by the terminal's own refresh loop —
`scripts/fetch-data.mjs`, every ten minutes — from the parsed ATCF b-deck and the operational
SHIPS run the ingest already holds.

It is **not** built by the archive job. `genesis-archive.yml` rebuilds the packs four times a day,
and an operational record refreshed that slowly would be past its own published freshness bound
most of the time.

### Schema

```jsonc
{
  "schema": "atlas-live-v1",
  "generated_at": "2026-08-25T15:43:45.983Z",   // when this artifact was assembled
  "source": { "name", "url", "kind": "operational", "note" },
  "freshness": {
    "active_stale_hours": 18,                   // the bound, published rather than implicit
    "retention_days": 60,
    "note": "…"
  },
  "health": {
    "ok": true,
    "active_atcf_ids":   [...],   // storms the live feed currently lists
    "retained_atcf_ids": [...],   // storms carried forward after leaving that list
    "expected_atcf_ids": [...],   // active ∪ retained — every id that SHOULD have a record
    "emitted_atcf_ids":  [...],   // every id that DOES
    "missing_atcf_ids":  [...],   // expected − emitted; non-empty ⇒ ok:false
    "stale_atcf_ids":    [...],   // active records past the freshness bound
    "note": "…"
  },
  "storms": {
    "CP012026": {
      "atcf_id": "CP012026", "season": 2026, "basin": "CP", "name": "LALA",
      "active": true,

      "fetched_at":        "2026-08-25T15:43:45.983Z",   // when this pipeline read the deck
      "first_valid_time":  "2026-08-10T00:00:00.000Z",   // the SOURCE's own instants
      "latest_valid_time": "2026-08-25T12:00:00.000Z",
      "age_hours": 3.7,                                   // latest_valid_time → fetched_at

      "fix_count": 63,
      "fixes": [ { "t", "lat", "lon", "kt", "mslp", "stage" }, … ],
      "latest": { … },
      "stage": "TS", "stage_label": "TROPICAL STORM",

      "peak_wind_kt": 115, "peak_wind_at": "2026-08-19T06:00:00.000Z",
      "min_mslp_mb":  947, "min_mslp_at":  "2026-08-19T06:00:00.000Z",
      "fixes_with_wind": 63, "fixes_with_pressure": 63,

      "ships_rt": {
        "source": "ships_rt", "product": "NHC operational SHIPS (stext)", "tau": 0,
        "valid_time", "fetched_at", "age_hours", "lat", "lon", "availability",
        "fields": { "<product key>": { "value", "label" } },
        "not_comparable_with": "ships_dev", "note": "…"
      },

      "source": { "name", "kind": "operational", "url", "status", "bytes", "note" }
    }
  }
}
```

**Two clocks, never one.** `latest_valid_time` is when the *source* says the storm was where it
says it was. `fetched_at` is when this pipeline read the file. There is deliberately no field
named `cycle`: a single timestamp standing for both is how a nine-day-old record comes to look
fresh, and the age between the two is published rather than left to be inferred.

**Nothing is invented.** `parseBestTrack` has already mapped ATCF's zero-means-absent sentinel to
`null`, and nothing downstream undoes it. A fix with no wind carries `kt: null`, never `0`. A
SHIPS field the run could not compute is absent, and `availability` travels alongside so a
published `0` (ocean heat content over cold water is a real zero) can still be told from one.

---

## 2. Identity — the ATCF id, and nothing else

The join key is the archive's `atcf_id` column against the artifact's key, compared as an
uppercased exact string.

* **Never the name.** This archive holds `LALA` twice — `EP121984` and `CP012026`. A name join
  would have attached a 2026 hurricane to a 1984 tropical storm.
* **Never the IBTrACS `storm_id`.** The operational side does not have one.
* **The season is checked.** An ATCF id carries its own year (`BBNNYYYY`), so a join whose id
  names a different season from the archive row is **refused**, not resolved.
* **No ATCF id, no join.** Most of this archive predates ATCF ids; those storms are not expected
  to have an operational record and nothing claims they do.

---

## 3. Precedence

> For a storm whose **archive record is provisional** and for which an operational record exists,
> the operational record **is** the selected-storm representation: its fixes, its peak, its
> minimum, its latest position and stage, and its threshold ladder.

The archive record is not modified, not extended and not hidden. It stays exactly where it is,
remains the only thing the research surfaces read, and its own headline values are still printed
in the panel under an `ARCHIVE` tag.

### Four states, and why the fourth is not the first

| state | when | what the panel says |
|---|---|---|
| `archive` | the archive row is **not** provisional | *One storm, whole life* — unchanged |
| `operational` | provisional, and a record is loaded | `OPERATIONAL / PROVISIONAL` + `ATCF B-DECK · THROUGH <t>` |
| `unavailable` | provisional, a record is **expected** and not loaded | `LIVE CONTINUATION UNAVAILABLE — ARCHIVE REPRESENTATION ENDS <t>` |
| `none` | provisional, and no record is being tracked | `PROVISIONAL — THIS SEASON HAS NOT BEEN POST-ANALYSED` |

"There is no live record" and "there should be a live record and there is not" look identical on
screen unless something insists they do not. `health.expected_atcf_ids` is what insists.

### Fail closed

If the artifact 404s, parses badly, or carries the wrong schema, `loadLive` returns an
**unavailable** layer rather than throwing — the archive is complete without it and must still
open. But a *provisional* storm then reads `unavailable`, because its record is known to be
incomplete and there is no way to tell how incomplete. It never silently falls back to a stub
that looks finished.

A post-analysed storm is unaffected by the layer failing. Fail-closed is about a record known to
be incomplete, not about every storm on the surface.

---

## 4. The four questions precedence has to answer

**Timestamp overlap and duplicate fixes.** They do not arise, because the two records are never
concatenated. The operational deck overlaps the archive's for six days; taking the union would
put two positions on every synoptic hour in that window and a reader counting fixes would count
the overlap twice. The operational record is used *whole* or not at all. On the plate this is the
same rule: when the operational layer holds a track, the archive's selection layer is fed `-1`,
so exactly one track is drawn.

**Source disagreement.** Precedence decides what is *shown*; it does not make the other number
untrue. `sourceDisagreement()` compares the two on peak wind, minimum pressure and record extent,
and any row where the **archive** is ahead is printed with both values and neither adjusted. This
is the direction that matters: a provisional row that has already overtaken the operational deck
must not have its higher peak quietly replaced by a lower one.

**When IBTrACS later updates.** The provisional row grows; the operational record still leads
while the row is provisional; any place the archive has overtaken shows up as a disagreement row.
No code path lowers a displayed peak.

**After post-analysis.** `provisional` flips to false and the archive wins. This needs no code —
it is the first test in `liveStateFor`.

**Retention.** A storm leaves NHC's active list the moment the last advisory is written, and
IBTrACS will not post-analyse it for months. Without retention the Atlas would show operational
truth for exactly as long as the storm was on the news and then silently revert to the stub the
day it dissipated. So a previously-emitted storm keeps its last record for
`retention_days`, marked `active: false`, with its **original** `fetched_at` — it is not
re-polled, and re-stamping a record nobody re-read is the lie the two clocks exist to prevent.
Its age goes on growing honestly. A record from a previous season is dropped.

**Staleness.** An active record older than `active_stale_hours` is still shown — it is still the
freshest thing that exists — and named on `health.stale_atcf_ids`. The bound does not apply to a
retained record: that record is complete to its last fix and ageing by design.

---

## 5. The wall

The operational layer is a **selected-current-storm representation layer only**. It must never
enter or alter:

cohort membership · historical analog matching · historical intensity rates · landfall rates ·
Wilson intervals · effective sample size · calibration · reliability · the archive comparison ·
event gates · refusal logic · zero-peek replay semantics.

The wall is structural, not a convention:

1. **The join happens in exactly one place** — `ui/atlas.jsx` — between two objects neither of
   which knows about the other, and produces a *third* object. `Archive.storm(i)` is untouched.
2. **No historical module imports `engine/live.js`**, transitively. `test-atlas-live-boundary.mjs`
   walks the import graph and fails the build if one ever does. Only the shell, the inspector and
   Node's test loader may import it at all.
3. **No historical entry point takes an operational argument.** `filterStorms`, `cohortResult`,
   `getAnalogs`, `scoreCases`, `rateResult`, `wilsonInterval`, `kishEss`, `bridgeSpec`,
   `whyMatched`, `compareResults`, `previewCounts` and `envCoverage` still take exactly what they
   took before, so there is no call site that could pass one.
4. **The `provisional` column is never rewritten.** It is simultaneously the live layer's
   precedence test and `filterStorms`' first membership test, so mutating it in memory — marking
   a storm "no longer provisional because live data arrived" — is the single change that would
   move every cohort at once. The boundary gate asserts the column is byte-identical after the
   join, along with `max_vmax_kt`, `season`, `track_points` and the whole track-point wind column.

The behavioural half of the same gate computes every published historical value over seven cohort
specs with the artifact absent and again with it loaded, and compares them field by field.

### The cohort is still the archive's

A cohort built from a current storm is matched on the **archive's** genesis point, drawn from
IBTrACS storms, and contains no operational value. The bridge says so on screen whenever an
operational record is displayed, and the control is labelled `BUILD HISTORICAL COHORT AROUND
GENESIS`.

For `CP012026` the two genesis instants happen to agree exactly — 2026-08-13T12:00Z at
14.9N 145.0W — which is a useful coincidence and not something the code relies on.

---

## 6. Derived values, and what marks them

ATCF publishes a **stage** (`HU`, `TS`, `DB`…), not a Saffir-Simpson class, and it publishes no
threshold-crossing times. Two things are therefore derived by the Atlas and marked with the
superscript `·d` this repository already uses:

* **The class beside an operational wind**, from the archive's own `thresholds_kt` ladder, read
  out of the pack's manifest at runtime so it cannot drift.
* **The threshold ladder**, by replaying the archive's own crossing rule
  (`build_atlas_pack.py:derive_crossings`) over the operational fixes: genesis is the first
  *tropical* fix by the archive's own status vocabulary, only fixes at or after genesis are
  eligible, and the crossing is the **first** fix at or above the threshold, never the maximum.

  This is not decoration. The archive's own crossing columns describe its 49-fix stub and say
  `CP012026` never reached Category 3; the panel three rows above reports 115 kt. Printing both
  would be a flat contradiction on screen, so the ladder follows the record it belongs to and
  says that it was derived.

The one rule with no operational counterpart is the observed-versus-interpolated pool: a b-deck
has no interpolated rows — every one is the forecast office's own analysis. That is a difference
in the *source*, not a relaxation of the rule, and the panel reports the counts.

---

## 7. Environment: two questions, two blocks

*What was the air like when this storm formed* and *what is the air like around it now* are
different questions with different sources, different eras and different answers.

* **`ENVIRONMENT AT GENESIS`** — unchanged. The archive's ±12 h genesis window, from developmental
  SHIPS, with its existing `— UNKNOWN` refusal and its existing caveat.
* **`LATEST OPERATIONAL ENVIRONMENT`** — a separate block, only when a `ships_rt` run exists, with
  its source, valid time, position, freshness and every field the product published under the
  product's own labels.

They are never pooled. `engine/env.js` already refuses to pool `ships_dev`, `ships_dev+csst` and
`ships_rt` inside the archive, in the archive's own words; the same refusal is printed on the
operational block, because this is the first surface on which an operational row and a
developmental distribution are visible at once.

Only tau 0 is carried. Every other tau in that file is a **forecast**, and a 48-hour forecast
shear under a heading reading *latest operational environment* would be publishing a forecast as
an observation.
