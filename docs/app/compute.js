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
    reasons.push(feedOk("models")
      ? "Fair value: HURDAT2 climatology baseline (seasonal contracts only — no per-storm model)"
      : "No fitted model — allocations deferred");
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

  /* ---------------- Signal Engine ----------------
     Most refresh cycles change nothing — NHC advises 3-hourly while we poll every
     15 min, so the majority of frames are byte-identical. This walks the committed
     history and emits ONLY genuine state changes, scored by magnitude, so the
     operator reads "what changed" instead of re-reading unchanged feeds.

     Market moves carry a co-movement list: observations recorded in the preceding
     window. That is TEMPORAL ASSOCIATION, deliberately not causal attribution —
     decomposing a price move into weighted causes would need a fitted structural
     model or sub-minute event-study data, neither of which exists here. Inventing
     those weights would be fabricated precision, so the UI says "alongside", never
     "because of". */
  const NOISE = { wind: 5, pressure: 2, market: 0.02 };   // below this = not a signal
  const SCALE = { wind: 30, pressure: 20, market: 0.15 }; // |Δ| that counts as maximal

  function signals(opts) {
    const o = opts || {};
    const windowMin = o.windowMin || 180;                 // co-movement lookback
    const frames = MT._frames || [];
    if (frames.length < 2) return [];
    const out = [];
    const tOf = (fr) => Date.parse(fr.tsZ) || 0;

    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i], ts = b.tsZ;
      // ---- storm state ----
      Object.keys(b.storms || {}).forEach((sid) => {
        const pv = (a.storms || {})[sid], cv = (b.storms || {})[sid];
        if (!pv || !cv) return;
        const S = MT.storms[sid];
        const nm = (S && S.name) || sid;
        const dW = (cv.wind != null && pv.wind != null) ? cv.wind - pv.wind : 0;
        if (Math.abs(dW) >= NOISE.wind) out.push({
          tsZ: ts, kind: "intensity", subject: nm, stormId: sid,
          delta: dW, unit: "kt", from: pv.wind, to: cv.wind,
          magnitude: Math.min(1, Math.abs(dW) / SCALE.wind),
          label: `${nm} intensity ${dW > 0 ? "+" : ""}${dW} kt`, detail: `${pv.wind} → ${cv.wind} kt`,
        });
        const dP = (cv.pressure != null && pv.pressure != null) ? cv.pressure - pv.pressure : 0;
        if (Math.abs(dP) >= NOISE.pressure) out.push({
          tsZ: ts, kind: "pressure", subject: nm, stormId: sid,
          delta: dP, unit: "mb", from: pv.pressure, to: cv.pressure,
          magnitude: Math.min(1, Math.abs(dP) / SCALE.pressure),
          // falling pressure = strengthening, so invert the "good/bad" sense downstream
          label: `${nm} pressure ${dP > 0 ? "+" : ""}${dP} mb`, detail: `${pv.pressure} → ${cv.pressure} mb`,
          inverted: true,
        });
      });
      // ---- market prices ----
      Object.keys(b.contracts || {}).forEach((cid) => {
        const pv = (a.contracts || {})[cid], cv = (b.contracts || {})[cid];
        if (!pv || !cv || pv.market == null || cv.market == null) return;
        const d = cv.market - pv.market;
        if (Math.abs(d) < NOISE.market) return;
        const C = (MT.contracts || []).find((x) => x.id === cid);
        out.push({
          tsZ: ts, kind: "market", subject: (C && C.short) || cid, contractId: cid,
          stormId: C && C.storm, delta: d * 100, unit: "¢",
          from: Math.round(pv.market * 100), to: Math.round(cv.market * 100),
          magnitude: Math.min(1, Math.abs(d) / SCALE.market),
          label: `${(C && C.short) || cid} ${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}¢`,
          detail: `${Math.round(pv.market * 100)}¢ → ${Math.round(cv.market * 100)}¢`,
        });
      });
    }

    // ---- advisories (from the real event ledger) ----
    (MT.events || []).forEach((e) => {
      const fr = frames[Math.max(0, Math.min(frames.length - 1, e.frame))];
      out.push({ tsZ: fr ? fr.tsZ : null, kind: "advisory", subject: e.source || "NHC",
        magnitude: e.hot ? 0.9 : 0.6, label: e.label, detail: "tier " + (e.tier || "A") });
    });

    out.sort((x, y) => (Date.parse(y.tsZ) || 0) - (Date.parse(x.tsZ) || 0));

    // Co-movement: what else was recorded in the window before each market move.
    out.forEach((s) => {
      if (s.kind !== "market") return;
      const t = Date.parse(s.tsZ) || 0;
      s.alongside = out.filter((o) => o.kind !== "market" && o.tsZ &&
        (s.stormId ? o.stormId === s.stormId || o.kind === "advisory" : true) &&
        Date.parse(o.tsZ) <= t && Date.parse(o.tsZ) >= t - windowMin * 60000)
        .slice(0, 3);
    });
    return out;
  }

  return { snap, at, kellyFor, tier, frameTime, mkt, mdl, priceHist, orderBookFor, signals };
})();
})();
