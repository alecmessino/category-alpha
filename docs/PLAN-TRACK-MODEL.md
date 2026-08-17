# Plan: a landfall model, and the infrastructure to keep it honest

Written 2026-08-16, during Lala. The trigger: a live position on
`KXHURPATHHAWAII-26DEC` that this board could not price at all, because everything
built so far prices **intensity** ("does it reach 65 kt") and the contract asks
about **track** ("does the centre cross a coastline").

## What tonight actually established

Two results, both negative, both worth keeping:

1. **The consensus blend has no skill.** Four seasons, 77 storms, 940 scored
   forecasts: skill vs the raw NHC forecast **+0.4%**. Zero. Per season it swings
   +15.5 / −13.9 / −1.2 / −44.3, which is noise, not signal.
2. **One real miscalibration survived every correction.** The 0.8–0.9 bin says
   85% and happens 98%, on 57 forecasts across 17 storms. Consistent
   underconfidence when the board is fairly-but-not-totally sure.

The measurement rig that produced those is the asset. The model it measured is not.

## Why the board was mute on the Hawaii contract

`reachesHurricaneP` answers *how strong*. Nothing answers *where*. The contract
needs three things this repo cannot currently compute:

- centre position forecast, not just peak intensity
- a coastline test — does the track cross land
- the **joint** probability of crossing AND being ≥64 kt at the crossing moment

That third one is the whole trade and it is not the product of two independent
numbers. On Lala they are *negatively* correlated: the terrain interaction that
could pull the centre ashore is the same interaction forecast to destroy the
intensity. A model that multiplies P(cross) × P(≥64 kt) will be badly wrong.

## Phase 1 — track ingestion (no new science)

Everything needed is already parsed or trivially reachable.

| piece | status |
|---|---|
| a-deck track members (lat/lon per tech per tau) | `parseAdeck` already returns lat/lon; currently discarded |
| coastline polygons | need one small vendored GeoJSON, main Hawaiian islands + CONUS |
| point-in-polygon + great-circle | ~40 lines, no dependency |
| advisory transmission times | `lib/advisories.mjs`, done tonight |
| historical replay + scoring | `lib/backtest.mjs`, done tonight |

**Deliverable:** `lib/track.mjs` — `crossesCoast(trackPoints, polygons)` returning
the crossing point and the interpolated intensity there.

**The trap to design around, found tonight:** a 6-hourly deck cannot distinguish a
physical traverse from a centre relocation. Seven of nine "landfall" members in
one cycle only crossed because a straight line between 6-hourly points cut the
island, at implied speeds of 15–19 kt against a storm moving 7–8 kt. A centre that
dissipates east of an island and reforms west of it is **not** a landfall. Any leg
implying a speed far above the observed translation must be flagged, not counted.

## Phase 2 — the joint estimate

Score `P(crossing AND ≥64 kt at crossing)` directly from ensemble members rather
than composing two marginals. Each member gives a track and an intensity series;
count the members that both cross and carry ≥64 kt at the crossing point. That
respects the correlation by construction.

**Gate this on the backtest before it prices anything**, using the same rig:
zero-peek on transmission time, outcome from the post-storm b-deck landfall
record, storm-level sample gate, 10-bin reliability. If it shows no skill, it does
not ship. That rule is the point of the last two days.

## Phase 3 — GOES, and an honest note on its value

`s3://noaa-goes18` is reachable from here with no credentials (HTTP 200 on an
unsigned list). **GOES-18 is the West satellite and the only one that sees
Hawaii** — 16 and 19 are East.

But be clear about what it buys. Satellite imagery is a *nowcasting* input: centre
fixing, eye definition, convective trends. It would not have answered tonight's
question, because the binding uncertainty was a 20-nm terrain-capture problem that
the South Point radar already resolves better than any geostationary product.

So GOES is **Phase 3, not Phase 1**, and its first real use is narrow and
defensible: an independent centre fix to cross-check the advisory position between
advisories, at 10-minute cadence instead of hourly.

The SNS topics (`NewGOES18Object`) are genuinely useful later — event-driven cache
invalidation for `sw.js` — but they are plumbing for a model that does not exist
yet. Per the standing sequence, they stay dormant until a calibration baseline is
on disk.

## What must not be repeated

- **Do not ship a model before the backtest scores it.** The consensus blend rode
  in the live edge book for two days and turned out to be noise.
- **Do not trust a gate you have only read.** Tonight's deployment guard silently
  disabled itself as a truthy regex, and `node --check` passed it.
- **Do not compose marginals when the parts are correlated.** See Phase 2.
- **State the sample.** A skill number is a ratio of two Brier scores over the same
  storms, or it is two unrelated numbers divided.
