/* Derived snapshot math — pure functions over the seed at a replay frame. Keeps the
   probability axis separate from the evidence-quality (confidence) axis, always.
   Market price, model anchor, edge, Q-Kelly and the order book are all derived live
   per frame here, so every panel re-reads a coherent snapshot at the as-of cursor. */
(function buildMTX() {
  if (typeof MT === "undefined" || !window.MT) { setTimeout(buildMTX, 20); return; }
  window.MTX = (function () {
  const NF = MT.FRAMES - 1;
  function seed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
  function clampF(f) { return Math.max(0, Math.min(NF, f)); }

  function tier(stormId, frame) {
    const S = MT.storms[stormId];
    const reasons = [], age = S.reconAge(frame);
    let score = 3; // 3=A 2=B 1=C
    reasons.push("Market price: SEEDED (auth-gated) → −1");
    score -= 1;
    if (age == null) { reasons.push("No recon for this basin → −1"); score -= 0.5; }
    else if (age > 30) { reasons.push("Recon stale (" + Math.round(age) + "m) → −0.5"); score -= 0.5; }
    else reasons.push("Recon fresh (" + Math.round(age) + "m) → ok");
    reasons.push("SST anomaly: manual, dated 07-22");
    reasons.push("Direct-market coverage" + (stormId === "AL04" ? "" : " via seasonal proxy"));
    const t = score >= 2.5 ? "A" : score >= 1.5 ? "B" : "C";
    return { tier: t, reasons };
  }

  function snap(stormId, frame) {
    const S = MT.storms[stormId];
    const model = S.modelCat4(frame), market = S.marketCat4(frame);
    const tt = tier(stormId, frame);
    return {
      S, frame, pressure: Math.round(S.pressure(frame)), wind: Math.round(S.wind(frame)),
      model, market, edgePct: (model - market) * 100, reconAge: S.reconAge(frame),
      tier: tt.tier, tierReasons: tt.reasons,
    };
  }

  // Live market price for a contract at a frame: base + smooth deterministic
  // micro-oscillation (order flow) + optional drift. Falls back to the storm's
  // market series when a contract has no explicit base.
  function mkt(c, frame) {
    const f = clampF(frame);
    const base = c.market != null ? c.market : MT.storms[c.storm].marketCat4(f);
    const ph = seed(c.id) * 6.283;
    const wig = Math.sin(f / 3 + ph) * 0.012 + Math.sin(f / 6.5 + ph * 2) * 0.007;
    const drift = (c.drift || 0) * (f / NF);
    return Math.max(0.02, Math.min(0.98, base + wig + drift));
  }

  // Category Alpha model anchor for a contract at a frame.
  function mdl(c, frame) {
    const f = clampF(frame);
    if (c.model != null) {
      const ph = seed(c.id + "m");
      return Math.max(0.02, Math.min(0.98, c.model + Math.sin(f / 4 + ph * 6) * 0.005 + (c.mdrift || 0) * (f / NF)));
    }
    return MT.storms[c.storm].modelCat4(f);
  }

  // Liquidity-capped Q-Kelly. Kelly fraction for a binary at price m with model
  // probability p is (p−m)/(1−m); we then apply the stake fraction and cap the
  // dollar allocation at real order-book depth.
  function kellyFor(c, frame, bankroll, stakeFrac) {
    const model = mdl(c, frame), market = mkt(c, frame);
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

  // Recent price track (for market-board sparklines).
  function priceHist(c, frame, n) { const a = []; for (let i = n - 1; i >= 0; i--) a.push(mkt(c, frame - i)); return a; }

  // Per-contract order book, built live around the current mid. Depth grows away
  // from the touch; cumulative bid depth beyond c.liquidity is the slippage cap.
  function orderBookFor(c, frame) {
    const mid = mkt(c, frame), spread = c.spread || 0.02;
    const bestAsk = Math.min(0.98, mid + spread / 2), bestBid = Math.max(0.02, mid - spread / 2);
    const liq = c.liquidity || 20000;
    const depth = (i) => Math.max(1000, Math.round(liq * (0.16 + 0.17 * i) * (0.8 + seed(c.id + "d" + i) * 0.5) / 1000) * 1000);
    const asks = [0, 1, 2, 3, 4].map((i) => [Math.min(0.98, bestAsk + i * 0.02), depth(i)]);
    const bids = [0, 1, 2, 3, 4].map((i) => [Math.max(0.02, bestBid - i * 0.02), depth(i)]);
    return { contract: c.id, mid, asks, bids, bestAsk, bestBid, liquidityCap: liq, slippageBudget: Math.max(1, Math.round(spread * 100)) + "¢" };
  }

  // Bitemporal as-of accessor — engine.at(T). Returns the coherent state of the world
  // AS IT STOOD at replay frame T: interpolated eye position, recon freshness/visibility,
  // and the latest advisory issued at-or-before T. Map + tables read this one source, so
  // scrubbing rewinds geometry and latency together — not just the numbers.
  function at(stormId, frame) {
    const S = MT.storms[stormId];
    const f = clampF(frame), t = f / NF;
    const a = S.track[Math.max(0, S.pastIdx - 1)], b = S.track[S.pastIdx];
    const center = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const reconAge = S.reconAge(f);
    const advisory = MT.events.filter((e) => e.kind === "advisory" && e.frame <= f).slice(-1)[0] || null;
    return { S, frame: f, t, center, reconAge, reconVisible: reconAge != null, advisory, asOf: frameTime(f) };
  }

  function frameTime(frame) {
    const back = (MT.FRAMES - 1 - frame) * MT.STEP_MIN;
    const d = new Date(Date.now() - back * 60000);
    const p = (n) => (n < 10 ? "0" : "") + n;
    return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + "Z";
  }

  return { snap, at, kellyFor, tier, frameTime, mkt, mdl, priceHist, orderBookFor };
})();
})();
