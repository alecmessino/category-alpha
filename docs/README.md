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
| Forecast cone, recon, ASCAT, ensemble spaghetti | — | **NO FEED** (GIS/feeds not wired) |
| Per-storm intensity probability (Cat 4+) | — | **MODEL DEFERRED** (no public ensemble Cat-probability feed; fabricating one would break the honesty rule) |

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

## Architecture (permanent URL + fresh data, no CORS)

- **`docs/`** is a static site served by **GitHub Pages** → a permanent `*.github.io` URL that never breaks.
- **`.github/workflows/refresh-data.yml`** runs **`scripts/fetch-data.mjs`** server-side (open internet,
  no browser CORS) and commits `docs/data/latest.json` + a rolling `docs/data/frames.json`.
  The cron fires **once an hour** and the job then **loops internally for ~55 minutes, refreshing every
  10**. That structure is deliberate: GitHub throttles high-frequency schedules hard — a `*/15` cron was
  measured delivering a **106-minute median**, so the board was routinely 2h+ stale. Scheduling jitter now
  only affects when the hour's run starts, not the cadence inside it.
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
docs/
  index.html            entry (vendored libs → DS bundle → data-loader → compute → app)
  _ds_bundle.js         Category Alpha design-system components (namespace only)
  styles.css, tokens/   design tokens
  assets/               logos, fonts
  vendor/               react, react-dom, babel, leaflet (self-hosted)
  app/                  data-loader.js, compute.js, map.jsx, panels.jsx, drawer.jsx, console.jsx, main.jsx, tweaks-panel.jsx
  data/                 latest.json + frames.json  (written by the workflow)
scripts/fetch-data.mjs  server-side real-data fetch/normalize
```

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
