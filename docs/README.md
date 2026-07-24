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
| Prediction-market prices, volume | Kalshi (`KXHUR*`) → Polymarket fallback | **live** |
| Order-book depth | Kalshi order book | **live** (Kalshi contracts only; else NO FEED) |
| Forecast cone, recon, ASCAT, ensemble spaghetti | — | **NO FEED** (GIS/feeds not wired) |
| Model probability anchor → edge, Q-Kelly allocation | — | **MODEL DEFERRED** (no public ensemble Cat-probability feed; fabricating one would break the honesty rule) |
| SST anomaly | — | **NO FEED** (live SST is available but an anomaly needs a climatology baseline that isn't wired) |

When no storm is active (e.g. a quiet Atlantic), the terminal shows the honest
`[ SYSTEM AWAITING TELEMETRY ]` state — that's the real condition, not an error.

## Architecture (permanent URL + fresh data, no CORS)

- **`docs/`** is a static site served by **GitHub Pages** → a permanent `*.github.io` URL that never breaks.
- **`.github/workflows/refresh-data.yml`** runs **`scripts/fetch-data.mjs`** on a ~15-min cron. It fetches
  the real feeds *server-side* (open internet, no browser CORS) and commits `docs/data/latest.json` +
  a rolling `docs/data/frames.json` (last 24 snapshots = the real replay history).
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

1. Create a GitHub repo and push this project (`git remote add origin … && git push -u origin main`).
2. **Settings → Pages → Source = "Deploy from a branch" → `main` / `/docs`.**
3. **Settings → Actions → General →** allow workflows and set **Workflow permissions = Read and write**
   (so the cron can commit refreshed data).
4. **Actions → "Refresh Millibar Terminal data" → Run workflow** to populate real data immediately
   (otherwise the first cron run fills it within ~15 min).
5. Live URL: `https://<user>.github.io/<repo>/`.

The Claude terminal-console assistant only runs when the page is opened inside claude.ai; on plain
Pages it degrades to local `help` / `status` / `clear` commands, which it states plainly.

## Local preview

```
cd docs && python3 -m http.server 8099   # then open http://localhost:8099/
```
(External feeds may show NO FEED locally depending on your network/CORS — that's the honest fallback.)
