# Millibar Terminal — live build

An institutional hurricane-divergence research terminal (Category Alpha design system),
rebuilt from the design-handoff prototype to run on **real, live data** at a **permanent URL**.

**Research only — no financial advice, no execution.**

## What's real vs. not (data-honesty standard)

The design's core rule is *never fabricate data*. Every panel here traces to a real feed, and
anything a feed can't supply is labelled **NO FEED / MODEL DEFERRED**, never invented:

| Data | Source | Status |
|---|---|---|
| Active tropical cyclones (name, position, intensity, movement, advisory #) | NHC `CurrentStorms.json` | **live** |
| Satellite imagery | NASA GIBS VIIRS/NOAA-20 (probed in-browser) | **live** |
| Observed storm track | committed replay history (real past fixes) | **live** |
| Prediction-market prices, volume | Kalshi (paginated) → Polymarket fallback | **live** — per-storm *and* seasonal count contracts |
| Order-book depth | Kalshi order book | **live** (Kalshi contracts only; else NO FEED) |
| Fair-value anchor for **seasonal** count contracts → edge, Q-Kelly | HURDAT2 (NOAA best-track archive) | **live climatology baseline** |
| ENSO phase (Oceanic Niño Index) | CPC `oni.ascii.txt` → NOAA PSL mirror | **live** — stratifies the seasonal anchor (L3) |
| Model guidance consensus (track + intensity) | NHC ATCF **a-deck** (`aid_public`) — HCCA, variable consensus, DeepMind | **live** — the pre-advisory signal |
| Best track and observed wind radii | NHC ATCF **b-deck** (`btk`) | **live** |
| Fixes: satellite, scatterometer, aircraft | NHC ATCF **f-deck** (`fix`) | **live** |
| Aircraft reconnaissance (central pressure, surface and flight-level wind) | TGFTP `URNT12`/`URPN12 KNHC` vortex data messages | **live** when an aircraft is flying — a measurement, not an estimate |
| Recon mission arrival (coded observations) | TGFTP `URNT11`/`URPN11 KNHC` | **live** — arrival recorded, digits deliberately not decoded |
| Shear, ocean heat content, mid-level RH, maximum potential intensity, RI probabilities | NHC ATCF SHIPS (`stext`) | **live** — published, and scored into a probability only under an operator claim |
| Objective surface winds and radii | scatterometer fixes in the f-deck (ASCAT/OSCAT) | **live but intermittent** — an orbit either crossed the storm or it did not |
| Forecast cone, ensemble spaghetti | — | **NO FEED** (GIS layers not wired) |
| Per-storm intensity probability (Cat 4+) | — | **MODEL DEFERRED** (no public ensemble Cat-probability feed; fabricating one would break the honesty rule) |

### The four pre-advisory feeds, and why they exist

Everything above the divide in that table is a product NHC publishes **for the public** —
the advisory, the discussion, the outlook. Those are the same products the market reads,
at the same moment. An estimate built only from them cannot, even in principle, be earlier
or better informed than the price it is being compared against.

These four are earlier, in descending order of how much earlier:

| | Feed | Lead | What it adds |
|---|---|---|---|
| 1 | **ATCF decks** | ~30–60 min | The guidance a forecaster is looking at *while writing* the advisory. It frequently disagrees with the official forecast, and that disagreement is tradeable before it is published in prose. |
| 2 | **Aircraft reconnaissance** | often >1 h | A *measurement* of the initial condition every forecast rests on. When a plane finds the storm 12 mb deeper than the advisory carries, every forecast built on the old analysis is stale by a known amount. |
| 3 | **SHIPS** | 6-hourly | The environment the forecast is standing on — shear, ocean heat, humidity, potential intensity — plus NHC's own calibrated rapid-intensification probabilities, which arrive with their climatological base rate on the same line. |
| 4 | **Scatterometer** | intermittent | Objective surface winds. It **never moves an estimate**, only tightens the band around it, only when no aircraft is in the storm, and only below the wind speed where the retrieval saturates. |

### The probability engine

Per-storm probabilities are combined in **knots**, not in probability space, and converted
once at the end. Averaging probabilities from sources of different sharpness is
meaningless; averaging the intensities they forecast is not.

The width is a random-effects combination, `sigma² = min(sigma_i)² + tau²`:

- **`min(sigma_i)`, not the inverse-variance combination.** The sources are correlated —
  the official forecast is a forecaster's judgement *over* these aids — so treating them as
  independent draws would shrink the band as though the board had two independent looks at
  the storm when it has roughly one and a half. **The combined answer is never sharper
  than its sharpest single input.**
- **`tau²` is the observed disagreement**, between the sources and between the consensus
  members themselves. It is the only term in the engine that is measured rather than
  published, and it can only ever make the band *wider*.

Every sigma traces to something published or measured: NHC's own mean absolute intensity
errors by lead time, the SFMR's specified accuracy, the scatterometer's specified accuracy,
and the spread the aids actually printed this cycle. **No weight in the engine was fitted,
tuned, or chosen to make an edge appear.**

**When the deck and the aircraft disagree** they are *never averaged*, because they do not
answer the same question: the deck forecasts what the storm will **peak at**, the aircraft
measures what it **is now**. Every forecast here is anchored on an initial intensity and
the aircraft has just measured that initial intensity, so the measured difference is
applied to the whole curve — the deck's peak and the official peak alike. Neither can veto
the other: the deck keeps its weight, the fix keeps its full undamped difference, and
there is no tunable parameter between them. The published answer is then the larger of the
corrected forecast peak clearing the strike and the measured current intensity already
clearing it. Because both sources shift by the same amount, **a correction moves the
estimate without narrowing it** — disagreement between the deck and the aircraft is not
evidence that either is sharper. The rule is owned by the `model.conflict` claim, rendered
in the storm console's drawer, and asserted end to end by `scripts/test-conflict.mjs`.

Four rules are enforced by tests rather than by convention:

- **Raw and calibrated are published side by side, everywhere** — on the frame, on the
  contract, in the Situation strip, in the console. The untouched official-forecast
  estimate is never overwritten, and it is always inside the published band, so a
  calibration can never reach somewhere the plain arithmetic does not.
- **The scatterometer never moves the mean.** Band only.
- **SHIPS does not score until it is claimed.** Its RI floor is computed, carried on the
  frame and displayed on every cycle; it enters a published probability only when
  `MT_SHIPS_RI_SCORING` is on, and the row says which state it is in.
- **HOLD and staleness override everything.** A measured initial condition under a
  superseded advisory describes a storm that no longer exists, so evidence quality is
  capped by advisory age from the same constant the anchor refuses on, and the HOLD rule
  is untouched by any of this.

### Evidence quality means something specific

The tier used to be earned by feeds being reachable, which every tier-A source here was,
all the time — so the grade separated "the internet works" from "the internet does not".
It now turns on one question: **was the storm's present intensity measured, or estimated?**

| Tier | Earned by |
|---|---|
| **HIGH** | An aircraft flew through the storm and read the pressure off an instrument. |
| **MEDIUM** | The guidance deck is in hand ahead of the advisory, but no aircraft is reporting. |
| **LOW** | The advisory alone — or anything at all, when the advisory is past the staleness line. |

### About the climatology anchor
Seasonal contracts ("How many Atlantic hurricanes in 2026?") get a fair-value anchor computed from
**HURDAT2**, NOAA/NHC's official Atlantic best-track archive: `P(season total > strike)` = the share of
past seasons (1991→last complete year) that exceeded the strike. The file name is discovered from the
NHC directory index so it doesn't rot each year.

This is an **empirical baseline, not a skill forecast**. The UI labels it as such and tells the reader
to treat EDGE as a reference spread rather than alpha. If HURDAT2 is unreachable the anchor stays `null`
and allocations revert to MODEL DEFERRED — never a fabricated probability.

### The posterior stack
The anchor is built in declared layers, and every layer that isn't wired says so on the page rather
than being folded in silently. The last layer that produces a number is the one the edge uses, and the
panel marks it `← USED`.

| | Layer | Conditioning | Status |
|---|---|---|---|
| L0 | Historical climatology | none — unconditional seasonal frequency | live |
| L1 | Day-of-year conditional | only counts storms that formed on/after today's day-of-year in each past season | live |
| L2 | Season-to-date state | this year's count so far | **NO FEED** — HURDAT2 only publishes after the season; L1 assumes zero so far |
| L3 | ENSO-stratified | restricts the L1 seasons to those whose peak-season ONI shared today's phase | live |

**L3 in detail.** ENSO is the best-established seasonal modulator of Atlantic activity (El Niño raises
shear and suppresses counts; La Niña does the reverse). We don't model that mechanism — we condition
empirically, the same way L1 does. Three guards keep it honest:

- **Small samples are shrunk.** A phase bucket holds roughly 8–14 of the ~35 modern seasons, so the raw
  stratified frequency is noisy. It is shrunk toward the unstratified estimate by `m/(m+k)`, `k=8`, and
  the panel prints both the raw rate and how far it was shrunk.
- **Thin buckets are refused.** Under 6 phase-matched seasons the layer reports `NO FEED` instead of
  publishing a 3-season "probability".
- **The persistence assumption is labelled.** The current season's Aug–Sep–Oct ONI does not exist in
  July. The most recent observed 3-month ONI is carried forward, and every surface that shows the layer
  says so explicitly. It's an assumption, not an observation.
| SST anomaly | — | **NO FEED** (live SST is available but an anomaly needs a climatology baseline that isn't wired) |

When no storm is active (e.g. a quiet Atlantic), the terminal shows the honest
`[ SYSTEM AWAITING TELEMETRY ]` state — that's the real condition, not an error.

## Information architecture

The screen answers five questions in order, and everything that does not answer one of
them collapses or is gone:

| | Question | Where |
|---|---|---|
| 1 | What changed? | **Situation** — headline, material-change counts, the latest event |
| 2 | Why should I believe it? | **Why believe it** — one line: feeds live, evidence tier, snapshot age, what is NO FEED |
| 3 | Does it affect the board? | **Board Impact** — what repriced, where the spread to the anchor widened or narrowed |
| 4 | What deserves investigation? | **Attention** — a prioritised HIGH/MEDIUM/LOW queue |
| 5 | Where can I verify it? | **Spatial context**, **Fair value**, **Verify**, **Raw data** — progressive disclosure |

**Attention is a work queue, not a log.** The register (still available in full under
Verify) answered "here is everything that happened, newest first". The queue answers
"here is what requires you, in order". It merges four sources and ranks them: register
signals (trade-relevant → HIGH, material → MEDIUM, cosmetic → LOW), cross-feed
divergences, the terminal's own health (a stale pipeline or a dead feed is a reason to
discount everything above it, so it competes in the same list), and the next scheduled
advisory. A physical change carries its co-moving repricing on the same row, so one
event reads as one item rather than five.

The only new derivation is the advisory ETA — NHC's published 6-hourly cycle applied to
the last advisory actually received. It is labelled *scheduled, not observed*, and it is
never an input to a probability.

**The map is no longer the hero.** When the project started the map *was* the product,
because it was the data. The product is now the interpretation, so the map sits under
Situation and Attention as spatial context.

**Question 3 is answered honestly, not completely.** There is no position feed, so the
terminal cannot answer it at portfolio level and does not pretend to — Board Impact says
so on the panel.

**Target: a 27–32" analyst workstation** (~2560px). The layout is responsive and holds
down to phone width, but that is a floor, not a design target.

## Decision lifecycle

Events do not become history, they progress through states. Every state below is
**machine-derived from committed data**, and each one names what would have to be true:

| State | Asserted when | Owner |
|---|---|---|
| Observed | it appeared in a committed frame diff | frame-diff |
| Validated | corroborated by a second independent source — an NHC advisory within 3h of a summary-feed intensity change, or ≥2 strikes in the same series moving the same way | cross-feed |
| Assessed | it can be priced — an anchored contract exists for this storm / strike | HURDAT2 anchor |
| Resolved | a newer reading on the same track superseded it | register |
| Archived | older than the retained history window | retention |

States the terminal cannot observe are rendered `–` (n/a), never as an unticked box —
an empty checkbox implies the system is watching something, and it is not.

**Operator marks are kept separate on purpose.** Whether a human has acknowledged an
item or checked their exposure is not observable by the terminal, so it is not derived:
those are the operator's assertions, stored in `localStorage`, labelled *this browser
only, not observed by the system*. That is one analyst's memory on one machine — useful,
but it is not institutional memory, and the UI does not call it that.

## Provenance ownership (enforced, not aspirational)

**Every visible claim has exactly one owner** — not just numbers. Labels, status text,
capability descriptions, health indicators, provenance footers.

This is a build step because the UI drifted ahead of the code three separate times, each
the same way: a capability written as a string literal inside a component, where no feed
could contradict it.

- a hardcoded `Live NHC feed · 200 OK` with no fetch behind it
- a pipeline row reading `ensemble consensus` when the only model was climatology
- footers citing `canonical.fix() · v1.2.4` — a module and a version that do not exist

`docs/app/claims.js` is the only place such statements may be authored. Each is a
function of the real feed result and carries a named owner (a feed key, `derived`,
`operator`, or `none` — where `none` means the claim is that the capability is absent).
Components read claims; they never write them. Footers derive latency from snapshot age
and cite the actual snapshot instead of a made-up semver.

`scripts/audit-claims.mjs` runs in CI and fails the build if capability language
reappears as a literal, or if a component references a claim id that is not registered.

## Verification

Three gates run before every data refresh, so a data commit cannot exist unless all
three passed:

| Gate | What it protects |
|---|---|
| `scripts/test-enso.mjs` | the posterior stack — ONI parsers, CPC phase thresholds, shrinkage bounds, both refusal paths |
| `scripts/test-markets.mjs` | the Kalshi payload parsers — the current field shape, both previous shapes for rollback safety, and that an unrecognised shape degrades to all-null rather than a confident zero |
| `scripts/test-atcf.mjs` | the deck parsers, against the two things live decks actually do that a naive reader gets wrong: a track consensus that ships zero intensity, and one forecast spread across three wind-radius rows |
| `scripts/test-recon.mjs` | the vortex-data-message parser, and above all its refusals — a fix about a storm that dissipated weeks ago sits in the "latest" file until an aircraft flies again |
| `scripts/test-ships.mjs` | the SHIPS parser's missing-value handling (`N/A`, `xx.x`, `LOST` all become NaN under a looser reader) and that the RI floor is a sufficient condition rather than a proxy |
| `scripts/test-probability.mjs` | the engine's rules — raw never overwritten and always inside the band, never sharper than its sharpest input, disagreement only widens, scatterometer never moves the mean, SHIPS unscored until claimed, staleness caps quality |
| `scripts/test-conflict.mjs` | the consensus-versus-recon rule — that the measured difference shifts the forecast curve rather than being averaged against it, that neither source can veto the other, that a correction never narrows the band, **and that the claim on the board says all of it** |
| `scripts/test-intel-register.mjs` | that every ingested field reaches the **frame**, and from there the register, the probability update and the Situation strip |
| `scripts/check-intel-coverage.mjs` | **the coverage gate** — the build fails when Priority 1 or 2 is missing on an active storm |
| `scripts/audit-claims.mjs` | every visible claim has a provenance owner |

**Why the coverage gate is a gate and not a warning.** The other feeds degrade *visibly*:
when the market feed dies the panel says NO FEED and nobody is misled. The ATCF decks and
the reconnaissance poll degrade *invisibly* — the terminal keeps publishing a probability,
it just quietly goes back to being built from the advisory the market has already priced,
and the board looks exactly as it did when it had a head start. The only symptom of losing
the edge is that there is no longer an edge.

The two priorities are checked differently, on purpose:

- **Priority 1 must have delivered.** The decks exist for every active system, always —
  NHC writes them as it works — so an active storm with no deck is a broken ingest.
- **Priority 2 must have been polled, not to have found an aircraft.** Whether a plane is
  flying is a decision the Air Force and NOAA make about hurricane hunting, not a property
  of this pipeline; eastern Pacific storms are rarely flown at all. Failing a build because
  no aircraft was tasked would be failing it for the weather, and a gate that fails for
  reasons nobody can fix is a gate that gets turned off.

A fourth runs against the **deployed site**, not the repository:
`.github/workflows/verify-live.yml` drives a real Chromium against the public Pages
URL on every code push, four times a day, and on demand. It byte-compares the served
assets against the commit (polling while a deploy propagates), disables cache at the
protocol level, and asserts the page renders — every panel, full market coverage, the
ask-priced fillable cap, no console errors, no failed same-origin requests. Third-party
tile failures are reported but never fail the run.

That job exists because the authoring sandbox cannot reach `*.github.io`. Deployment
verification is automated there rather than left to a human.

## Architecture (permanent URL + fresh data, no CORS)

- **`docs/`** is a static site served by **GitHub Pages** → a permanent `*.github.io` URL that never breaks.
- **`.github/workflows/refresh-data.yml`** runs **`scripts/fetch-data.mjs`** server-side (open internet,
  no browser CORS) and commits `docs/data/latest.json` + a rolling `docs/data/frames.json`.
  The cron fires **once an hour** and the job then **loops internally for ~55 minutes, refreshing every
  10**. That structure is deliberate: GitHub throttles high-frequency schedules hard — a `*/15` cron was
  measured delivering a **106-minute median**, so the board was routinely 2h+ stale. Scheduling jitter now
  only affects when the hour's run starts, not the cadence inside it.
  Measured over 39 consecutive refreshes: a clean **10-minute median inside each run**,
  but 51–104 minute gaps *across the hour boundary*, because the hourly cron itself
  lands up to ~45 min late. The loop therefore overruns into the next hour so the
  successor overlaps rather than leaving dead air; `cancel-in-progress` hands over.
- **Two clocks, reported separately.** The *snapshot* refreshes every ~10 min. *Replay frames* are spaced
  ~20 min apart on purpose — appending one per tick would rewrite a ~400 KB history file six times an hour
  for no added information. The header shows snapshot age; the health panel shows both.
- **An open tab keeps itself current.** The page polls its own `latest.json` every 60s. At live with
  playback stopped it reloads into the newer snapshot; mid-scrub it surfaces a `NEW DATA — LOAD` chip
  instead, so a refresh never yanks the cursor out from under an investigation.
- The page fetches its **own same-origin** JSON — so there are no CORS problems and the data is always
  as fresh as the last commit, honestly timestamped in the header ("updated Nm ago").
- Libraries (React, ReactDOM, Babel, Leaflet JS) are **vendored** in `docs/vendor/` so the URL doesn't
  depend on any third-party CDN staying up. Leaflet's stylesheet is the one CDN `<link>`.

```
scripts/
  ingest.mjs            THE INGESTION DAEMON — polls the four pre-advisory feeds,
                        normalises them, and emits the arrivals the register reads.
                        Runnable on its own: `node scripts/ingest.mjs` prints what every
                        feed answered, with every URL it tried.
  lib/atcf.mjs          pure a/b/f-deck parsers + consensus extraction
  lib/recon.mjs         pure vortex-data-message parser
  lib/ships.mjs         pure SHIPS parser + the rapid-intensification floor
  lib/probability.mjs   THE PROBABILITY ENGINE — one calibrated P(event) per storm
  check-intel-coverage.mjs   the coverage gate

docs/
  index.html            entry (vendored libs → DS bundle → data-loader → compute → app)
  _ds_bundle.js         Category Alpha design-system components (namespace only)
  styles.css, tokens/   design tokens
  assets/               logos, fonts
  vendor/               react, react-dom, babel, leaflet (self-hosted)
  app/                  data-loader.js, compute.js, map.jsx, panels.jsx, drawer.jsx, console.jsx, main.jsx, tweaks-panel.jsx
  data/                 latest.json + frames.json  (written by the workflow)
  storm-atlas/          THE HISTORICAL SURFACE — a second entry document, not a panel
    index.html          its own page: no data-loader, no compute, no babel
    src/                ESM + JSX sources (engine / render / ui)
    dist/               esbuild output, committed and byte-verified against src/
    data/               the archive as column packs (written by the archive workflow)
scripts/fetch-data.mjs  server-side real-data fetch/normalize
```

## The Storm Atlas

A second surface, at `/storm-atlas/`, over the historical archive rather than the live feeds.
It answers one question — *given where and when a storm formed, what did storms like it
historically do* — by putting 3,959 trajectories and 224,153 observed positions on a map and
letting a click on the ocean query them.

**It is a separate document, and that is the whole isolation story.** The terminal loads none of
it: not the 1.4 MB of archive, not the bundle, not a byte. There is no router, no lazy panel and
no shared runtime to inherit — just a link. Measured: the terminal fetches 4.70 MB over 16
requests with the Atlas in the repo, exactly as it did without.

**One methodology, two execution surfaces.** The rule that made the Analog Prior panel
trustworthy — *nothing is recomputed in the browser* — cannot hold literally here, because a
click anywhere on the ocean at any radius is not a question a precomputed payload can answer. So
the Atlas transliterates `scripts/genesis/retrieval/analogs.py` into JavaScript, and
`scripts/test-atlas-parity.mjs` answers 42 query vectors with both and compares them field by
field: exact for every count, every gap string and every matched storm; a declared 1e-9
tolerance only for the weights, which pass through `exp` and `asin` where CPython's libm and
V8's are free to differ in the last bit. The measured worst case is 1.4e-15. A `METHODOLOGY_VERSION`
constant makes a methodology change a versioned event rather than a silent one — precisely: the
browser reads it from the pack header rather than declaring it, so the version check is a
staleness gate on the committed pack, and the vectors are what prove the two surfaces agree.

**It publishes counts, not rates.** Phase 1 ports the matching half of the analog query — the
pool, its effective sample size, its gaps, its pathway density. The conditioned probabilities,
their Wilson intervals and the skill numbers are not ported yet, and where one would appear the
Atlas renders `UNSCOREABLE — REQUIRES CANONICAL COMPUTATION` rather than a division it could
obviously do. No percentage is rendered anywhere in this build except inside the archive's own
verbatim gap prose, and `scripts/check-atlas-dom.mjs` asserts exactly that against the rendered
DOM.

Every gate runs in `checks.yml`, browser gates included. The bundle is rebuilt and
byte-compared against its source; every packed column is digested from the Parquet and
reproduced from the pack; the browser's answers are checked against the archive's own; the
calibration ledger is rebuilt from the backtest and byte-compared. Then Chromium is installed
and three more run against a real DOM: `check-atlas-dom.mjs` (the honesty surface, on screen),
`check-panel-dom.mjs` (the terminal's refusals, on screen) and `bench-atlas.mjs` (every
performance budget, stated).

Those three used to be run by hand, and between them they caught the two worst regressions of
the last phase — a crash that took the live board from 46 honesty probes to 34, and a silently
dropped pre-1971 observing-bias warning that every set-comparison test passed straight through.
They take `--require-browser`, which turns their "playwright is not installed — SKIPPED" path
into an exit 2: without it a CI step would go green forever while testing nothing. `bench-atlas`
also takes `--ci`, which scales the wall-clock budgets ×3 for a shared runner and prints that it
did; byte budgets are never scaled.

## One-time deployment

### Easiest — one command (uses the GitHub CLI)

Install the [GitHub CLI](https://cli.github.com), run `gh auth login` once, then from the project root:

```bash
bash setup.sh                 # creates a private repo "millibar-terminal"
# bash setup.sh my-name       # custom repo name
# bash setup.sh my-name --public
```

That creates the repo, pushes the project, enables Pages, grants the workflow write access, and
prints your live URL. Your push auto-triggers the first data fetch — **nothing to click**.

### Manual (no CLI) — 3 steps

1. Create a GitHub repo and push: `git remote add origin <url> && git push -u origin main`.
2. **Settings → Pages → Source = "Deploy from a branch" → `main` / `/docs`.**
3. **Settings → Actions → General → Workflow permissions = Read and write.**

Your push automatically runs the refresh workflow and populates real data within a minute or two
(the bot's data commits carry `[skip ci]`, so it never loops). Live URL: `https://<user>.github.io/<repo>/`.

The Claude terminal-console assistant only runs when the page is opened inside claude.ai; on plain
Pages it degrades to local `help` / `status` / `clear` commands, which it states plainly.

## Local preview

```
cd docs && python3 -m http.server 8099   # then open http://localhost:8099/
```
(External feeds may show NO FEED locally depending on your network/CORS — that's the honest fallback.)

## The genesis-to-intensity analog archive

`docs/GENESIS-ARCHIVE.md` documents a second, separable product in this repository: a
versioned archive of every tropical cyclone from first fix to last, with the environment it
formed in, so a **live NHC area of interest can be matched to the historical cases most like
it**. It answers the question the board could not — `docs/PLAN-TRACK-MODEL.md` was written
during Lala precisely because `reachesHurricaneP` answers *how strong* and nothing answered
*where* — and it answers it empirically rather than with a model:

> Disturbances that formed within 500 km of 12°N 140°W in August–October — what fraction later
> made Hawaii landfall as a hurricane?

It shares this project's standard and enforces it with its own gate suite: nothing is
interpolated or imputed, an interpolated best-track point may never establish a threshold
crossing, a rate is refused below its sample gate, and the back-test replays under a zero-peek
cut-off with the reference climatology restricted to storms already past.

It is **Python** (`scripts/genesis/`, Parquet + DuckDB) rather than Node, because the archive
is a columnar-analytics problem and the terminal is not. The two share no runtime; they share
only the data-honesty rule.

```bash
pip install -r scripts/genesis/requirements.txt
python3 scripts/genesis/cli.py analogs --lat 12 --lon -140 --radius 500 --months 8,9,10
python3 scripts/genesis/cli.py gaps      # every data gap, with the measurement behind it
```

## Calibration — has any of this ever been right?

Every other section describes what the board does. This one describes whether it has
worked, and it is the only claim here a reader should weight heavily.

`scripts/calibrate.mjs` runs after every fetch and does three things:

| | | |
|---|---|---|
| **Record** | a ledger entry per storm per forecast state | keyed on `(storm, advisory, guidance cycle)`, so re-reading the same two products ten minutes later is not a second forecast |
| **Resolve** | when a storm leaves the active feed, its b-deck answers the question | did it ever carry 65 kt? |
| **Score** | Brier for three estimates, side by side | the calibrated probability, the raw official-forecast estimate, and the market price |

Scoring the calibrated probability alone says whether the board is any good. Scoring it
**against the raw estimate** says whether the calibration earned its keep — whether four
ingested feeds added anything, or have been decorating a number the advisory already gave
us. Scoring both **against the market** says whether there is an edge, which is the only
question that pays. A negative skill against the market is the most useful output this
file can produce, because it says stop.

### The sample size is storms, not forecasts

Forecasts within one storm are **not independent**. A storm that becomes a hurricane makes
every forecast issued during its life "correct"; one that doesn't makes them all wrong.
Three storms can produce four hundred ledger entries and a beautiful Brier score that
measures three coin flips and quotes them to three decimal places.

So every threshold counts **distinct resolved storms** — 10 before any score is published,
30 before a reliability curve is. Both counts are always shown, because the gap between
them is itself the warning. Until the threshold is met the board says `NOT YET SCORED` and
makes no claim about its own accuracy, which is the honest state of a system that has not
yet been measured.

Nothing is backfilled. The committed replay frames are seeded in, because those
probabilities were genuinely published at the times they carry, but a forecast that was
never made cannot be reconstructed and this build will not invent one.
