/* Millibar Terminal — SEEDED demo data for the UI kit recreation.
   Values are illustrative (labeled SEEDED throughout), never live. Honest-data ethos:
   nothing here is presented as a real forecast or market price. */
window.MILLIBAR_DATA = {
  updated: "18:42:07Z",
  gulf_anom_c: 2.4,
  risk: ["HIGH", "var(--warn)"],
  storms: [
    { id: "AL04", name: "Bertha", cls: "C3", full_cls: "Cat 3 Hurricane", wind: 108, pressure: 954,
      movement: "WNW 12 kt", lat: 24.1, lon: -78.6, basin: "east", phase: "VELOCITY",
      color: "var(--pai-velocity)", recon: { pressure: 954, sfc: 105 } },
    { id: "EP07", name: "Elida", cls: "C1", full_cls: "Cat 1 Hurricane", wind: 75, pressure: 985,
      movement: "W 9 kt", lat: 16.8, lon: -112.4, basin: "west", phase: "ACCUMULATION",
      color: "var(--pai-accumulation)", recon: null },
    { id: "EP08", name: "Fausto", cls: "TS", full_cls: "Tropical Storm", wind: 50, pressure: 998,
      movement: "WNW 14 kt", lat: 14.2, lon: -120.1, basin: "west", phase: "WATCH",
      color: "var(--pai-watch)", recon: null },
  ],
  feeds: [
    { name: "ATCF", status: "ok", age: "2m" },
    { name: "RECON", status: "stale", age: "41m", penalty: "−1 tier" },
    { name: "SST", status: "missing" },
  ],
  matrix: [
    { contract: "KXHURCAT4-25 · Bertha Cat4+", edge: 16.2, market: 44, liquidity: 38000,
      theoretical: 0.18, capped: 0.11, rawPct: 18 },
    { contract: "KXHURCAT3-25 · Bertha Cat3+", edge: 7.4, market: 58, liquidity: 61000,
      theoretical: 0.09, capped: 0.09, rawPct: 9 },
    { contract: "KXHURCAT1-25 · Elida Cat1+", edge: 3.1, market: 63, liquidity: 22000,
      theoretical: 0.04, capped: 0.04, rawPct: 4 },
    { contract: "KXATLSEAS-25 · seasonal (proxy)", edge: -2.1, market: 71, liquidity: 12000 },
  ],
  signals: [
    { label: "Bertha → KXHURCAT4", signal: "BUY", edge: 16.2, modelProb: 60, marketProb: 44, conf: "HIGH" },
    { label: "Elida → KXHURCAT1", signal: "BUY", edge: 3.1, modelProb: 66, marketProb: 63, conf: "MED" },
    { label: "Fausto (seasonal proxy)", signal: "HOLD", edge: -1.2, modelProb: 30, marketProb: 31, conf: "LOW", unmapped: true },
  ],
  health: [
    { name: "Event store", detail: "argus.db · 4,182 events", status: "PASS" },
    { name: "Live NHC feed", detail: "CurrentStorms.json · 200 OK", status: "PASS" },
    { name: "Kalshi snapshot", detail: "seeded · auth-gated keylessly", status: "EMPTY" },
    { name: "Probability engine", detail: "deferred until features promote", status: "BLOCKED" },
    { name: "Recon ingester", detail: "no valid-time parser yet", status: "EMPTY" },
    { name: "Replay fold", detail: "zero look-ahead · verified", status: "PASS" },
  ],
  modes: {
    observation: { status: "LIVE", tone: "live", text: "Live NHC systems, official forecast tracks, and uncertainty cones." },
    forecast: { status: "LIVE", tone: "live", text: "Category Alpha Cat1+ probability anchored on NHC intensity guidance." },
    market: { status: "SEEDED", tone: "seeded", text: "Seeded Kalshi / Polymarket prices — hurricane markets are auth-gated keylessly." },
    physics: { status: "OFFLINE", tone: "special", text: "HAFS / ECMWF ensemble surface — MODEL OFFLINE (no keyless ensemble feed)." },
    alpha: { status: "LIVE", tone: "live", text: "Category Alpha edge surface: model probability minus market price, per contract." },
  },
};
