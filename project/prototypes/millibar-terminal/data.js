/* Millibar Terminal — prototype seed. All values are SEEDED/illustrative and labeled
   as such; nothing here is a live forecast, price, or recommendation. The replay
   window is 24 frames × 10 min (4h) ending "now"; scrubbing the VCR moves the as-of
   cursor and every panel re-reads its snapshot at that frame. */
window.MT = (function () {
  const FRAMES = 24, STEP_MIN = 10;
  // linear keyframe interpolation over frames [0..23]
  function series(keys) {
    // keys: [[frame,value],...] sorted; returns f -> value
    return (f) => {
      f = Math.max(0, Math.min(FRAMES - 1, f));
      for (let i = 1; i < keys.length; i++) {
        if (f <= keys[i][0]) {
          const [f0, v0] = keys[i - 1], [f1, v1] = keys[i];
          const t = (f - f0) / (f1 - f0 || 1);
          return v0 + (v1 - v0) * t;
        }
      }
      return keys[keys.length - 1][1];
    };
  }

  const storms = {
    AL04: {
      id: "AL04", name: "Bertha", cls: "C3", full_cls: "Cat 3 Hurricane",
      basin: "east", color: "var(--pai-velocity)", phase: "VELOCITY",
      center: [29.5, -90.5], movement: "NNW 12 kt",
      track: [[27.0, -88.5], [27.9, -89.2], [28.7, -89.9], [29.5, -90.5], [30.4, -91.0], [31.4, -91.4], [32.6, -91.6], [33.8, -91.5]],
      pastIdx: 3, // current fix — 29.5°N 90.5°W, SE Louisiana (Advisory 14A)
      cone: [[29.7, -90.0], [30.6, -90.3], [31.6, -90.5], [32.8, -90.6], [34.0, -90.4], [34.0, -92.6], [32.8, -92.6], [31.6, -92.3], [30.6, -91.7], [29.7, -91.0]],
      reconTracks: [
        { id: "AF307", label: "AF307 · USAF Vortex", color: "#f472b6", points: [[28.9, -88.9], [29.4, -88.3], [29.85, -87.77], [30.3, -87.2], [30.0, -86.6]], sondes: [[29.85, -87.77], [29.4, -88.3]] },
        { id: "NOAA3", label: "NOAA3 · P-3 Orion", color: "#38bdf8", points: [[27.5, -86.6], [27.9, -86.1], [28.22, -85.63], [28.7, -85.1], [28.4, -84.6]], sondes: [[28.22, -85.63]] },
      ],
      // time-varying quantities
      pressure: series([[0, 968], [8, 962], [12, 958], [16, 954], [23, 951]]),
      wind: series([[0, 92], [8, 99], [16, 108], [23, 112]]),
      modelCat4: series([[0, 0.38], [10, 0.47], [16, 0.56], [23, 0.61]]),
      marketCat4: series([[0, 0.41], [12, 0.42], [18, 0.44], [23, 0.44]]),
      reconAge: series([[0, 6], [6, 41], [7, 4], [14, 44], [15, 5], [23, 22]]),
    },
    EP07: {
      id: "EP07", name: "Elida", cls: "C1", full_cls: "Cat 1 Hurricane",
      basin: "west", color: "var(--pai-accumulation)", phase: "ACCUMULATION",
      center: [16.8, -112.4], movement: "W 9 kt",
      track: [[16.2, -109.8], [16.5, -111.1], [16.8, -112.4], [17.2, -114.0], [17.7, -115.8]],
      pastIdx: 2,
      cone: [[17.0, -112.7], [17.5, -114.2], [18.1, -116.0], [17.3, -116.4], [16.9, -114.6], [16.6, -113.0]],
      recon: null,
      pressure: series([[0, 992], [23, 985]]),
      wind: series([[0, 65], [23, 75]]),
      modelCat4: series([[0, 0.05], [23, 0.08]]),
      marketCat4: series([[0, 0.06], [23, 0.06]]),
      reconAge: series([[0, null], [23, null]]),
    },
    EP08: {
      id: "EP08", name: "Fausto", cls: "TS", full_cls: "Tropical Storm",
      basin: "west", color: "var(--pai-watch)", phase: "WATCH",
      center: [14.2, -120.1], movement: "WNW 14 kt",
      track: [[13.6, -117.9], [13.9, -119.0], [14.2, -120.1], [14.7, -121.6]],
      pastIdx: 2,
      cone: [[14.4, -120.4], [14.9, -121.9], [14.3, -122.2], [14.0, -120.7]],
      recon: null,
      pressure: series([[0, 1000], [23, 998]]),
      wind: series([[0, 45], [23, 50]]),
      modelCat4: series([[0, 0.01], [23, 0.01]]),
      marketCat4: series([[0, 0.02], [23, 0.02]]),
      reconAge: series([[0, null], [23, null]]),
    },
  };

  // Prediction-market contracts (Kalshi-style, SEEDED). Each carries a base market
  // price + Category Alpha model anchor; edge, Kelly, order book and sparklines are
  // all derived live per replay frame in compute.js. volume = $ notional traded.
  const contracts = [
    { id: "KXHURCAT4-25",   label: "KXHURCAT4 · Bertha Cat 4+ landfall",     short: "Bertha Cat 4+",  storm: "AL04", market: 0.44, model: 0.61, drift: 0.02, mdrift: 0.05, liquidity: 38000, spread: 0.03, volume: 1240000 },
    { id: "KXHURCAT3-25",   label: "KXHURCAT3 · Bertha Cat 3+ sustain",      short: "Bertha Cat 3+",  storm: "AL04", market: 0.58, model: 0.69, mdrift: 0.02, liquidity: 61000, spread: 0.02, volume: 2100000 },
    { id: "KXHURLALAND-25", label: "KXHURLA · Bertha LA landfall <72h",  short: "Bertha LA <72h", storm: "AL04", market: 0.36, model: 0.49, mdrift: 0.03, liquidity: 44000, spread: 0.03, volume: 880000 },
    { id: "KXHURW120-25",   label: "KXHURW120 · Bertha peak wind ≥120 kt",   short: "Bertha ≥120 kt", storm: "AL04", market: 0.28, model: 0.41, drift: 0.01, mdrift: 0.04, liquidity: 26000, spread: 0.04, volume: 540000 },
    { id: "KXHURCAT1E-25",  label: "KXHURCAT1E · Elida Cat 1+ 48h",          short: "Elida Cat 1+",   storm: "EP07", market: 0.63, model: 0.66, liquidity: 22000, spread: 0.03, volume: 410000 },
    { id: "KXHURFAU-25",    label: "KXHURFAU · Fausto → hurricane",          short: "Fausto → hur",   storm: "EP08", market: 0.22, model: 0.17, liquidity: 12000, spread: 0.05, volume: 190000 },
    { id: "KXATLNAMED-25",  label: "KXATLNAMED · Atlantic named ≥14 (season)", short: "ATL named ≥14", storm: "AL04", market: 0.71, model: 0.70, liquidity: 9000, spread: 0.04, volume: 3100000, proxy: true },
  ];

  // Evidence items for the primary storm (Evidence Matrix). value(f) computed live.
  const evidence = [
    { id: "ev-adv", kind: "advisory", label: "NHC Public Advisory", source: "NHC", tier: "A", latency: "3m", ver: "adv-15",
      read: (S, f) => S.full_cls + " · " + Math.round(S.wind(f)) + " kt", weight: 0.28, hash: "a1b2c3d4" },
    { id: "ev-recon", kind: "recon_fix", label: "Recon flight-level pressure", source: "URNT15 HDOB", tier: "B", ver: "fix-118",
      read: (S, f) => Math.round(S.pressure(f)) + " mb", weight: 0.24, hash: "9f8e7d6c" },
    { id: "ev-sst", kind: "sst_reading", label: "Gulf SST anomaly", source: "Open-Meteo / manual", tier: "B", latency: "manual", ver: "sst-0722",
      read: () => "+2.4 °C", weight: 0.15, hash: "5a5a1212" },
    { id: "ev-ascat", kind: "scatter", label: "ASCAT surface wind vectors", source: "METOP-C", tier: "B", latency: "88m", ver: "asc-441",
      read: (S, f) => Math.round(S.wind(f) * 0.86) + " kt (sfc)", weight: 0.12, hash: "cc01aa22" },
    { id: "ev-models", kind: "model_cycle", label: "Model consensus (GFS/ECMWF/HAFS)", source: "NOMADS", tier: "A", latency: "40m", ver: "12z",
      read: (S, f) => Math.round(S.modelCat4(f) * 100) + "% Cat4+", weight: 0.21, hash: "d00df00d" },
    { id: "ev-market", kind: "market_snapshot", label: "Kalshi contract price", source: "Kalshi (seeded)", tier: "C", latency: "5m", ver: "mkt-77",
      read: (S, f) => Math.round(S.marketCat4(f) * 100) + "¢", weight: 0.0, hash: "beef4444" },
  ];

  // Model consensus members for the Probability panel.
  const models = [
    { id: "GFS", label: "GFS", cat4: 0.58, color: "var(--cyan-400)" },
    { id: "ECMWF", label: "ECMWF", cat4: 0.64, color: "var(--green-400)" },
    { id: "HAFS-A", label: "HAFS-A", cat4: 0.55, color: "var(--amber-400)" },
    { id: "GEFS-mean", label: "GEFS mean", cat4: 0.52, color: "var(--violet-500)" },
  ];

  // Event ledger / research ledger — each pins a replay frame (VCR bookmarks).
  const events = [
    { frame: 0, kind: "advisory", label: "Advisory #14 issued — Cat 2, 92 kt", source: "NHC", tier: "A" },
    { frame: 6, kind: "recon_fix", label: "Recon fix — 962 mb, sfc 96 kt", source: "URNT15", tier: "B" },
    { frame: 10, kind: "signal", label: "RI onset — Δ −7 mb / 3h (PAI Velocity)", source: "Vortex", tier: "B", hot: true },
    { frame: 14, kind: "scatter", label: "ASCAT pass — surface wind field", source: "METOP-C", tier: "B" },
    { frame: 16, kind: "model_cycle", label: "12z model cycle — consensus Cat4+ 56%", source: "NOMADS", tier: "A" },
    { frame: 19, kind: "market_snapshot", label: "Market moved +2¢ → 44¢", source: "Kalshi", tier: "C" },
    { frame: 23, kind: "advisory", label: "Advisory #15 issued — Cat 3, 108 kt", source: "NHC", tier: "A" },
  ];

  // Pipeline stages (Observability) — the canonical Evidence→…→Position spine.
  const pipeline = [
    { stage: "Observation", status: "PASS", detail: "6 feeds · 1 stale (recon)" },
    { stage: "Evidence", status: "PASS", detail: "canonical.fix() · range-checked" },
    { stage: "Features", status: "PASS", detail: "wind_pressure_residual · unvalidated" },
    { stage: "Confidence", status: "PASS", detail: "tier B · recon stale −1" },
    { stage: "Probability", status: "BLOCKED", detail: "engine deferred — anchor only" },
    { stage: "Edge", status: "PASS", detail: "anchor − market" },
    { stage: "Kelly", status: "PASS", detail: "Q-Kelly ¼ · liquidity-capped" },
    { stage: "Position", status: "EMPTY", detail: "research-only · no execution" },
  ];

  const health = [
    { name: "Event store", detail: "argus.db · 4,182 events", status: "PASS" },
    { name: "Live NHC feed", detail: "CurrentStorms.json · 200 OK", status: "PASS" },
    { name: "GIBS imagery", detail: "VIIRS/NOAA-20 true-color · CORS ok", status: "PASS" },
    { name: "Kalshi snapshot", detail: "seeded board · 7 contracts", status: "PASS" },
    { name: "Recon ingester", detail: "HDOB no valid-time parser", status: "EMPTY" },
    { name: "Probability engine", detail: "deferred until promotion", status: "BLOCKED" },
  ];

  return { FRAMES, STEP_MIN, storms, contracts, evidence, models, events, pipeline, health };
})();
