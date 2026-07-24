/* Derived snapshot math — pure functions over the LIVE data at a replay frame.
   Prices, positions and order books come from the real committed frames when present
   (data-loader builds priceAt/centerAt/etc.); anything a feed didn't supply stays null
   and surfaces as "—" / "NO FEED" downstream. Nothing is invented here. Keeps the
   probability axis separate from the evidence-quality (confidence) axis, always. */
(function buildMTX() {
  if (typeof MT === "undefined" || !window.MT) { setTimeout(buildMTX, 20); return; }
  window.MTX = (function () {
  const NF = MT.FRAMES - 1;
  function seed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  function clampF(f) { return Math.max(0, Math.min(NF, Math.round(f))); }
  const feeds = MT._feeds || {};
  const feedOk = (k) => !!(feeds[k] && feeds[k].ok);

  // Evidence-quality tier (NOT probability): how live/sourced the inputs are.
  function tier(stormId, frame) {
    const S = MT.storms[stormId]; const reasons = [];
    if (!S) return { tier: "C", reasons: ["No active system"] };
    let score = 1; // start at C, earn up
    if (feedOk("nhc")) { reasons.push("NHC advisory: live, tier-A source → +1.5"); score += 1.5; }
    else { reasons.push("NHC feed unreachable → tier-A source lost"); }
    const age = S.reconAge ? S.reconAge(frame) : null;
    if (age == null) reasons.push("No recon coverage (remote basin / none tasked)");
    else if (age > 30) { reasons.push("Recon stale (" + Math.round(age) + "m) → −0.5"); score -= 0.5; }
    else { reasons.push("Recon fresh (" + Math.round(age) + "m) → +0.5"); score += 0.5; }
    reasons.push(feedOk("markets") ? "Market price: live" : "No market feed");
    reasons.push(feedOk("models") ? "Ensemble consensus: live" : "No fitted model — probability is NHC-intensity anchor only");
    const t = score >= 2.5 ? "A" : score >= 1.5 ? "B" : "C";
    return { tier: t, reasons };
  }

  function snap(stormId, frame) {
    const S = MT.storms[stormId];
    if (!S) return { S: null, frame, pressure: null, wind: null, model: null, market: null, edgePct: null, reconAge: null, tier: "C", tierReasons: ["No active system"] };
    const model = S.modelCat4(frame), market = S.marketCat4(frame);
    const tt = tier(stormId, frame);
    const edgePct = (model != null && market != null) ? (model - market) * 100 : null;
    return {
      S, frame, pressure: Math.round(S.pressure(frame)), wind: Math.round(S.wind(frame)),
      model, market, edgePct, reconAge: S.reconAge(frame),
      tier: tt.tier, tierReasons: tt.reasons,
    };
  }

  // Live market price for a contract at a frame — real committed price when available.
  function mkt(c, frame) {
    const f = clampF(frame);
    if (c && typeof c.priceAt === "function") { const v = c.priceAt(f); if (v != null) return v; }
    return c && c.market != null ? c.market : null;
  }
  // Model anchor for a contract — null unless a real model feed supplied one.
  function mdl(c, frame) {
    const f = clampF(frame);
    if (c && typeof c.modelAt === "function") { const v = c.modelAt(f); if (v != null) return v; }
    return c && c.model != null ? c.model : null;
  }

  // Liquidity-capped Q-Kelly. Requires BOTH a live market price and a model anchor;
  // with no model feed it returns noModel and the UI shows the allocation as deferred.
  function kellyFor(c, frame, bankroll, stakeFrac) {
    const model = mdl(c, frame), market = mkt(c, frame);
    if (market == null) return { noBet: true, noData: true, market: null, model: null, edge: null };
    if (model == null) return { noBet: true, noModel: true, market: market * 100, model: null, edge: null };
    const edge = (model - market) * 100;
    const kf = market < 0.99 ? Math.max(0, (model - market) / (1 - market)) : 0;
    if (edge <= 0 || kf <= 0) return { edge, market: market * 100, model: model * 100, noBet: true };
    const applied = kf * stakeFrac;
    const ideal = bankroll * applied;
    const alloc = c.liquidity ? Math.min(ideal, c.liquidity) : ideal;
    return {
      edge, market: market * 100, model: model * 100,
      theoretical: applied, capped: alloc / bankroll,
      allocation: Math.round(alloc), stakePct: Math.round(applied * 100),
      rawPct: Math.round(kf * 100), liqCapped: c.liquidity && ideal > c.liquidity,
    };
  }

  function priceHist(c, frame, n) { const a = []; for (let i = n - 1; i >= 0; i--) { const v = mkt(c, frame - i); if (v != null) a.push(v); } return a; }

  // Order book — REAL Kalshi depth when the loader attached c.orderbook; otherwise
  // there is honestly no book to show (Polymarket / no feed) and we say so.
  function orderBookFor(c, frame) {
    if (!c) return { noFeed: true };
    const mid = mkt(c, frame);
    if (!c.orderbook || (!c.orderbook.bids.length && !c.orderbook.asks.length)) {
      return { noFeed: true, contract: c.id, mid };
    }
    const bids = c.orderbook.bids.map(([p, q]) => [p, Math.max(1, Math.round(q * p))]); // $ notional ≈ contracts × price
    const asks = c.orderbook.asks.map(([p, q]) => [p, Math.max(1, Math.round(q * p))]);
    const bestBid = bids.length ? bids[0][0] : (mid != null ? mid - 0.01 : 0.5);
    const bestAsk = asks.length ? asks[0][0] : (mid != null ? mid + 0.01 : 0.5);
    const liquidityCap = c.liquidity || bids.reduce((a, b) => a + b[1], 0) || 1000;
    return { contract: c.id, mid: mid != null ? mid : (bestBid + bestAsk) / 2, asks, bids, bestAsk, bestBid, liquidityCap, slippageBudget: Math.max(1, Math.round((bestAsk - bestBid) * 100)) + "¢", real: true };
  }

  // Bitemporal as-of accessor — engine.at(T). Real per-frame eye position from the
  // committed history; advisory = latest issued at-or-before T.
  function at(stormId, frame) {
    const S = MT.storms[stormId];
    if (!S) return { S: null, frame: clampF(frame), center: null, reconAge: null, reconVisible: false, advisory: null, asOf: frameTime(frame) };
    const f = clampF(frame);
    let center = S.center;
    if (typeof S.centerAt === "function") center = S.centerAt(f) || S.center;
    const reconAge = S.reconAge ? S.reconAge(f) : null;
    const advisory = (MT.events || []).filter((e) => e.kind === "advisory" && e.frame <= f).slice(-1)[0] || null;
    return { S, frame: f, t: NF ? f / NF : 0, center, reconAge, reconVisible: reconAge != null, advisory, asOf: frameTime(f) };
  }

  // Frame time — real committed snapshot timestamp when available.
  function frameTime(frame) {
    const f = clampF(frame);
    const fr = MT._frames && MT._frames[f];
    let d;
    if (fr && fr.tsZ) d = new Date(fr.tsZ);
    else d = new Date(Date.now() - (NF - f) * MT.STEP_MIN * 60000);
    if (isNaN(d)) return "--:--Z";
    const p = (n) => (n < 10 ? "0" : "") + n;
    return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + "Z";
  }

  return { snap, at, kellyFor, tier, frameTime, mkt, mdl, priceHist, orderBookFor };
})();
})();
