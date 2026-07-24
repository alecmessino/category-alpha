# Millibar Terminal — UI kit

High-fidelity, interactive recreation of the Millibar Terminal `/hurricanes` view (the
Category Alpha strategy surface). Recreated from `hurricane_template.py` in the mounted
codebase — light operational chrome with the dark cinematic **Storm Command Center** hero.

**All data is SEEDED** (`data.js`) and labeled as such — nothing is a live forecast or price.

## Files
- `index.html` — mounts the interactive terminal (loads the DS bundle + the JSX below).
- `data.js` — seeded storms, feeds, matrix, signals, health (`window.MILLIBAR_DATA`).
- `Header.jsx` — sticky light header: logo, strategy pill, ingestion HUD, nav.
- `CommandCenter.jsx` — dark tactical hero: storm selector, overlay vector layer
  (cone/track/eye reticle), product toggles, right rail (metrics + Category Alpha read),
  and the temporal-replay VCR deck.
- `App.jsx` — hero stats, map-mode panel, live Q-Kelly Edge Matrix, divergence signals,
  system health.

## Composed components
`Pill · Badge · IngestionHUD · StatTile · Gauge · Panel · SectionHeader · ProvenanceFooter ·
EdgeCell · KellyBar · SignalCard · HealthRow · ReplayDeck · Button` — all from
`window.CategoryAlphaDesignSystem_a835cf`.

## Interactions
- Command-center **storm selector** (Bertha / Elida / Fausto) swaps the stage + rail.
- **Map-mode** switch (Observation / Forecast / Market / Physics / Alpha) updates the status caption.
- **Edge Matrix** bankroll input + FULL/½/¼ stake toggles recompute Q-Kelly allocations
  live, with liquidity caps and the red threshold marker.
- **Ingestion HUD** — click to open the latency → evidence-penalty diagnostic.
- The **VCR deck** plays; scrub, step, jump-to-live, bookmarks, speed cycle.

## Not recreated (honest omissions)
The real Leaflet + NASA GIBS satellite loop is replaced with an abstract dark map field
+ vector overlays (no fabricated satellite imagery). Chart.js edge-spread and the
provenance-explorer / replay-ledger panels are out of scope for this kit.
