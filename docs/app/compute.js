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
    if (age == null) reasons.push(window.MTC.claim("capability.recon").text);
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
      /* The full book is fetched for a handful of contracts only, but every market
         carries top-of-book size. That is one level, not a depth curve, and the
         panel says so rather than drawing a ladder we do not have. */
      if (c.depth && (c.depth.bidSize > 0 || c.depth.askSize > 0)) {
        return { contract: c.id, mid, topOfBook: true, real: true,
          bidSize: c.depth.bidSize, askSize: c.depth.askSize,
          notional: c.depth.notional || 1,
          liquidityCap: c.liquidity || null,
          spread: c.spread != null ? c.spread : null };
      }
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

  /* Operational classification — what deserves an operator's attention.
     TRADE-RELEVANT is reserved for changes that can actually move a position:
     a Saffir-Simpson boundary crossing (category contracts resolve on exactly
     these), RI-scale intensification, or a price move large enough to reprice
     risk. Everything else degrades to MATERIAL or COSMETIC. */
  const SS_BOUNDS = [34, 64, 83, 96, 113, 137];           // TS, C1..C5 thresholds (kt)
  function crossedCategory(from, to) {
    if (from == null || to == null) return null;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const b = SS_BOUNDS.find((x) => lo < x && hi >= x);
    return b == null ? null : b;
  }
  function classify(sig) {
    if (sig.kind === "advisory") return sig.magnitude >= 0.85 ? "trade-relevant" : "material";
    const a = Math.abs(sig.delta || 0);
    if (sig.kind === "market") return a >= 5 ? "trade-relevant" : a >= 2 ? "material" : "cosmetic";
    if (sig.kind === "intensity") {
      if (sig.crossed != null || a >= 20) return "trade-relevant";
      return a >= 10 ? "material" : "cosmetic";
    }
    if (sig.kind === "pressure") return a >= 5 ? "material" : "cosmetic";
    return "cosmetic";
  }
  // Confidence in the OBSERVATION, separate from magnitude. NHC products are
  // authoritative; a market print on a book with no depth is weaker evidence.
  function confidenceOf(sig) {
    if (sig.kind === "advisory") return 0.95;
    if (sig.kind === "intensity" || sig.kind === "pressure") return 0.9; // NHC best-track
    if (sig.kind === "market") {
      const C = (MT.contracts || []).find((x) => x.id === sig.contractId);
      return C && C.liquidity ? 0.8 : 0.6;   // no resting depth → thinner evidence
    }
    return 0.5;
  }
  const CLASS_RANK = { "trade-relevant": 3, material: 2, cosmetic: 1 };

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

    /* ---- Register metadata: give the terminal memory ----
       Each change becomes a durable object rather than a line in a feed, so the
       question "what has changed in the last 6 hours" is answerable, not just
       "what changed on this render". */
    const seenByTrack = new Map();   // track key -> most recent signal (walking newest→oldest)
    out.forEach((s) => {
      s.id = [s.kind, s.contractId || s.stormId || s.subject, s.tsZ].join("|");
      s.source = s.kind === "advisory" ? "NHC"
        : s.kind === "market" ? ((MT._feeds && MT._feeds.markets && MT._feeds.markets.source) || "market")
        : "NHC CurrentStorms";
      s.crossed = s.kind === "intensity" ? crossedCategory(s.from, s.to) : null;
      s.class = classify(s);
      s.confidence = confidenceOf(s);
      s.ageMin = Math.max(0, Math.round((Date.now() - (Date.parse(s.tsZ) || 0)) / 60000));

      const track = [s.kind, s.contractId || s.stormId || s.subject].join("|");
      const newer = seenByTrack.get(track);
      if (!newer) {
        s.status = "active";           // most recent on this track
        s.novelty = "new";
        s.persistence = 1;
        seenByTrack.set(track, s);
      } else {
        s.status = "superseded";       // a later observation on the same track exists
        s.supersededBy = newer.id;
        // Direction continuity, computed newest→oldest then read as oldest→newest.
        const sameDir = (newer.delta || 0) * (s.delta || 0) > 0;
        s.novelty = sameDir ? "continuation" : "reversal";
        if (sameDir) newer.persistence = (newer.persistence || 1) + 1;
      }
    });
    // Reversals matter more than their raw size suggests — a trend that flips is news.
    out.forEach((s) => { if (s.novelty === "reversal" && s.class === "cosmetic") s.class = "material"; });

    // Co-movement: what else was recorded in the window before each market move.
    // Temporal association only — no causal weights are derived from it.
    out.forEach((s) => {
      if (s.kind !== "market") return;
      const t = Date.parse(s.tsZ) || 0;
      s.alongside = out.filter((o2) => o2.kind !== "market" && o2.tsZ &&
        (s.stormId ? (o2.stormId === s.stormId || o2.kind === "advisory") : true) &&
        Date.parse(o2.tsZ) <= t && Date.parse(o2.tsZ) >= t - windowMin * 60000)
        .slice(0, 3);
    });
    return finalize(out, o);
  }

  // Filtering / rollup shared by the panel.
  function finalize(list, o) {
    let res = list;
    if (o.sinceMin) {
      const cut = Date.now() - o.sinceMin * 60000;
      res = res.filter((s) => (Date.parse(s.tsZ) || 0) >= cut);
    }
    if (o.minClass) res = res.filter((s) => CLASS_RANK[s.class] >= CLASS_RANK[o.minClass]);
    if (o.activeOnly) res = res.filter((s) => s.status === "active");
    return res;
  }

  // Rollup for the register header: what has changed over a window.
  function signalSummary(sinceMin) {
    const all = signals({ sinceMin: sinceMin || 360 });
    const by = { "trade-relevant": 0, material: 0, cosmetic: 0 };
    all.forEach((s) => { by[s.class] = (by[s.class] || 0) + 1; });
    return {
      windowMin: sinceMin || 360, total: all.length, byClass: by,
      active: all.filter((s) => s.status === "active").length,
      verdict: by["trade-relevant"] ? "TRADE-RELEVANT" : by.material ? "MATERIAL" : all.length ? "COSMETIC" : "NO CHANGE",
    };
  }

  /* ---------------- Situation ----------------
     The 30-second read. Everything here is derived from the register and the feed
     health — no narrative is generated that isn't backed by an observed change. */
  function situation(windowMin) {
    const W = windowMin || 360;
    const sum = signalSummary(W);
    const sigs = signals({ sinceMin: W });
    const storms = Object.values(MT.storms || {});
    const F = MT._feeds || {};

    // Headline — the most intense active system, stated plainly.
    const lead = storms.slice().sort((a, b) => (b.wind ? b.wind(NF) : 0) - (a.wind ? a.wind(NF) : 0))[0];
    const watch = (MT._outlook || []);
    const topWatch = watch.slice().sort((a, b) => (b.pct7d ?? 0) - (a.pct7d ?? 0))[0];
    const headline = lead
      ? `${lead.name} ${lead.full_cls.replace(" Hurricane", "")} · ${Math.round(lead.wind(NF))} kt, ${Math.round(lead.pressure(NF))} mb, moving ${lead.movement}`
      : watch.length
        // "No active tropical cyclones" is true of the classified list and misleading
        // when the basin has areas under watch. Say which is which.
        ? `No classified cyclones · ${watch.length} area${watch.length === 1 ? "" : "s"} under watch, top ${topWatch.pct7d ?? "?"}% in 7 days`
        : "No active tropical cyclones";

    // What changed — the highest-class change, and whether anything did.
    const ranked = sigs.slice().sort((a, b) => CLASS_RANK[b.class] - CLASS_RANK[a.class] || b.magnitude - a.magnitude);
    const top = ranked[0] || null;
    const material = sigs.filter((s) => CLASS_RANK[s.class] >= 2);
    const lastMaterial = material[0] || null;  // signals are newest-first
    const mktMoves = sigs.filter((s) => s.kind === "market" && s.class === "trade-relevant");

    // Conflict — physical signal and market pointing opposite ways on the same storm.
    const conflicts = [];
    storms.forEach((S) => {
      const phys = sigs.filter((s) => s.stormId === S.id && s.kind === "intensity");
      const mk = sigs.filter((s) => s.stormId === S.id && s.kind === "market");
      if (!phys.length || !mk.length) return;
      const pDir = Math.sign(phys.reduce((a, s) => a + s.delta, 0));
      const mDir = Math.sign(mk.reduce((a, s) => a + s.delta, 0));
      if (pDir && mDir && pDir !== mDir) {
        conflicts.push(`${S.name}: intensity ${pDir > 0 ? "rising" : "easing"} while market ${mDir > 0 ? "bids" : "fades"}`);
      }
    });

    // Confidence in the PICTURE (feed health + evidence quality), not in any forecast.
    const coreOk = !!(F.nhc && F.nhc.ok) && !!(F.markets && F.markets.ok);
    const genAge = MT._generatedAt ? (Date.now() - Date.parse(MT._generatedAt)) / 60000 : null;
    const stale = genAge != null && genAge > 45;
    const confidence = !coreOk || stale ? (F.nhc && F.nhc.ok ? "MEDIUM" : "LOW") : "HIGH";
    const confWhy = !coreOk ? "a core feed is down"
      : stale ? `last refresh ${Math.round(genAge)}m ago` : "all core feeds live, data fresh";

    return {
      windowMin: W, headline, storms: storms.length,
      verdict: sum.verdict, byClass: sum.byClass, totalEvents: sum.total,
      topChange: top ? top.label : null,
      topClass: top ? top.class : null,
      changed: material.length
        ? `${material.length} material change${material.length === 1 ? "" : "s"} in ${Math.round(W / 60)}h`
        : `No material change in ${Math.round(W / 60)}h`,
      marketsLine: mktMoves.length
        ? `${mktMoves.length} contract${mktMoves.length === 1 ? "" : "s"} repriced ≥5¢`
        : "No material repricing",
      conflicts,
      lastMaterialAgo: lastMaterial ? lastMaterial.ageMin : null,
      confidence, confWhy,
    };
  }

  /* ---- ATTENTION — a prioritised work queue, not a log ----------------------
     The register answered "what happened, in order". This answers "what needs you,
     and in what order" — which is a different question, and the one an operator
     returning after two hours actually has.

     Everything here is derived from something already on screen. The one piece of
     new arithmetic is the advisory ETA, which is NHC's published 6-hourly cycle
     applied to the last advisory we actually received; it is labelled as a
     schedule, never as an observation, and it is never used as an input to a
     probability. */
  const PRIO_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  function nextAdvisory(S) {
    if (!S || !S.advTimeZ) return null;
    const t = Date.parse(S.advTimeZ);
    if (!t) return null;
    let due = t + 6 * 3600000;                    // full advisories run 03/09/15/21Z
    const now = Date.now();
    // If we are past a slot the feed has not caught up to yet, roll forward rather
    // than reporting a time in the past.
    let guard = 0;
    while (due < now - 20 * 60000 && guard++ < 8) due += 6 * 3600000;
    return { dueMs: due, inMin: Math.round((due - now) / 60000) };
  }

  /* ---- Decision lifecycle -----------------------------------------------
     Events stop being history and become state machines:

       Observed → Validated → Assessed → Resolved → Archived

     Every state here is MACHINE-derived from committed data, and each one names
     what would have to be true. States we cannot observe are "n/a", never an
     unticked box that implies the system is watching something it isn't.

     Operator-owned states (has a human acknowledged this, has a human checked
     their exposure) are deliberately NOT in this function. The terminal cannot
     observe them, so they live separately, are stored in the browser, and are
     labelled as the operator's assertion rather than the system's. */
  const LIFECYCLE = ["observed", "validated", "assessed", "resolved", "archived"];

  function lifecycleFor(sig, sigs) {
    const st = { observed: true, validated: "n/a", assessed: "n/a", resolved: false, archived: false, why: {} };
    st.why.observed = "appeared in a committed frame diff";

    if (sig.kind === "intensity" || sig.kind === "pressure") {
      // Corroborated when the authoritative advisory product lands near the same time.
      const t = Date.parse(sig.tsZ) || 0;
      const adv = (MT.events || []).some((e) => {
        const fr = (MT._frames || [])[e.frame];
        const et = fr ? Date.parse(fr.tsZ) : 0;
        return et && Math.abs(et - t) <= 3 * 3600000;
      });
      st.validated = adv;
      st.why.validated = adv ? "an NHC advisory landed within 3h" : "no advisory yet within 3h — summary feed only";
      const anchored = (MT.contracts || []).some((c) => c.storm === sig.stormId && mdl(c, NF) != null);
      st.assessed = anchored;
      st.why.assessed = anchored ? "a priced contract exists for this storm" : "no anchored contract for this storm";
    } else if (sig.kind === "market") {
      // One tick on one strike is noise; the same direction across the ladder is a move.
      const series = String(sig.contractId || "").replace(/-[^-]*$/, "");
      const peers = sigs.filter((x) => x.kind === "market" && x.contractId
        && String(x.contractId).replace(/-[^-]*$/, "") === series
        && Math.sign(x.delta) === Math.sign(sig.delta));
      st.validated = peers.length >= 2;
      st.why.validated = peers.length >= 2
        ? peers.length + " strikes in the same series moved the same way"
        : "single strike moved — not corroborated across the ladder";
      const C = (MT.contracts || []).find((x) => x.id === sig.contractId);
      const anchored = !!(C && mdl(C, NF) != null);
      st.assessed = anchored;
      st.why.assessed = anchored ? "climatology anchor available for this strike" : "no anchor — edge is not computable";
    } else if (sig.kind === "advisory") {
      st.validated = true;
      st.why.validated = "the advisory IS the authoritative product";
    }

    st.resolved = sig.status === "superseded";
    st.why.resolved = st.resolved ? "a newer reading on the same track replaced it" : "still the current reading on this track";
    const frames = MT._frames || [];
    const oldest = frames.length ? Date.parse(frames[0].tsZ) : 0;
    st.archived = !!(oldest && Date.parse(sig.tsZ) < oldest);
    st.why.archived = st.archived ? "older than the retained history" : "inside the retained history window";
    return st;
  }

  function attention(opts) {
    const o = opts || {};
    const W = o.windowMin || 360;
    const F = MT._feeds || {};
    const out = [];
    const push = (it) => { if (it) out.push(it); };

    // 1 ---- state + market changes, one row per track (newest wins). A physical
    //        change carries its co-moving repricing on the same line, so the
    //        operator reads one item instead of five.
    const sigs = signals({ sinceMin: W }).filter((s) => s.status === "active");
    const seen = new Set();
    sigs.forEach((s) => {
      const key = s.kind + "|" + (s.contractId || s.stormId || s.subject);
      if (seen.has(key)) return;
      seen.add(key);
      const priority = s.class === "trade-relevant" ? "HIGH" : s.class === "material" ? "MEDIUM" : "LOW";
      let title = s.label;
      if (s.kind === "market" && s.contractId) {
        // The register abbreviates contract names to fit a dense log. The queue is
        // the primary read, so it gets the question in full.
        const C = (MT.contracts || []).find((x) => x.id === s.contractId);
        if (C && C.label) title = C.label.replace(/\?$/, "") + " \u00b7 " + (s.delta > 0 ? "+" : "") + s.delta.toFixed(1) + "\u00a2";
      }
      if (s.crossed != null) title = (s.subject || "Storm") + " crossed the " + s.crossed + " kt Saffir-Simpson boundary";
      const co = (s.alongside || []).filter((x) => x.kind === "market");
      if (co.length) {
        const net = co.reduce((a, x) => a + (x.delta || 0), 0);
        title += " (" + (net > 0 ? "+" : "") + net.toFixed(1) + "\u00a2 across " + co.length + " contract" + (co.length === 1 ? "" : "s") + ")";
      }
      push({
        id: "sig:" + s.id, priority, title,
        detail: s.detail, kind: s.kind, source: s.source, tsZ: s.tsZ, ageMin: s.ageMin,
        confidence: s.confidence, seekTs: s.tsZ, contractId: s.contractId, stormId: s.stormId,
        lifecycle: lifecycleFor(s, sigs),
      });
    });

    // 2 ---- disagreement between the physical signal and the market on one storm.
    (situation(W).conflicts || []).forEach((c, i) => push({
      id: "conflict:" + i, priority: "MEDIUM", title: c,
      detail: "physical and market signals point opposite ways", kind: "divergence",
      source: "cross-feed", ageMin: null,
    }));

    // 2b --- pre-genesis areas. A 7-day formation probability is the leading
    //        indicator for every seasonal count ladder on the board, and it exists
    //        well before anything reaches CurrentStorms.json.
    (MT._outlook || []).forEach((a) => {
      const p7 = a.pct7d ?? 0, p48 = a.pct48 ?? 0;
      const priority = p7 >= 70 ? "HIGH" : p7 >= 40 ? "MEDIUM" : "LOW";
      push({
        id: "twa:" + a.basin + ":" + (a.id || a.n),
        priority,
        title: (a.id ? a.id + " · " : "") + a.title + " — " + p7 + "% formation within 7 days"
             + (p48 ? " (" + p48 + "% within 48h)" : ""),
        detail: a.basin === "atlantic" ? "Atlantic · counts toward the season ladders" : a.basin,
        kind: "genesis", source: "NHC Tropical Weather Outlook", ageMin: null,
        waitingOn: "NHC classification (this becomes an advisory only once it is a depression)",
        nextAutomatic: window.MTC ? window.MTC.claim("action.automatic").text : null,
      });
    });

    // 3 ---- the next scheduled advisory, when it is close enough to wait for.
    Object.values(MT.storms || {}).forEach((S) => {
      const n = nextAdvisory(S);
      if (!n || n.inMin > 90 || n.inMin < -20) return;
      push({
        id: "adv:" + S.id, priority: n.inMin <= 30 ? "MEDIUM" : "LOW",
        title: S.name + " Advisory #" + ((S.advNum ? Number(S.advNum) + 1 : "?")) + " expected in " + Math.max(0, n.inMin) + " min",
        detail: "NHC 6-hourly cycle from advisory #" + (S.advNum || "?") + " — scheduled, not observed",
        kind: "schedule", source: "NHC cadence", ageMin: null,
        waitingOn: "NHC issuance",
        nextAutomatic: window.MTC ? window.MTC.claim("action.automatic").text : null,
      });
    });

    // 4 ---- the terminal's own trustworthiness. A degraded feed is a reason to
    //        discount everything above it, so it belongs in the same queue.
    const stale = MT._generatedAt ? Math.round((Date.now() - Date.parse(MT._generatedAt)) / 60000) : null;
    if (stale != null && stale > 45) push({
      id: "stale", priority: stale > 90 ? "HIGH" : "MEDIUM",
      title: "Data pipeline stale — " + stale + " min since the last refresh",
      detail: "every number on screen is at least this old", kind: "pipeline", source: "refresh", ageMin: stale,
    });
    const FEEDS = [
      ["nhc", "NHC advisories", true], ["markets", "Prediction markets", true],
      ["models", "Climatology anchor", false], ["enso", "ENSO / ONI layer", false],
      ["sst", "SST anomaly", false],
    ];
    FEEDS.forEach(([k, name, core]) => {
      const f = F[k];
      if (f && f.ok) return;
      push({
        id: "feed:" + k, priority: core ? "HIGH" : "LOW",
        title: name + " — NO FEED",
        detail: (f && f.note) || "not reachable this cycle",
        kind: "feed", source: (f && f.source) || name, ageMin: null,
      });
    });
    if (o.imageryAgeMin != null && o.imageryAgeMin > 20) push({
      id: "sat", priority: "LOW",
      title: "Satellite imagery delayed " + Math.round(o.imageryAgeMin) + " min",
      detail: o.imageryProduct || "GIBS", kind: "feed", source: "NASA GIBS", ageMin: o.imageryAgeMin,
    });

    out.sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
      || (a.ageMin == null ? 1 : b.ageMin == null ? -1 : a.ageMin - b.ageMin));
    const byPriority = { HIGH: [], MEDIUM: [], LOW: [] };
    out.forEach((i) => byPriority[i.priority].push(i));
    return { items: out, byPriority, windowMin: W,
      topPriority: out.length ? out[0].priority : null };
  }

  /* ---- BOARD IMPACT — the honest answer to "does this touch my positions?" ----
     There is no position feed wired, so we cannot answer it at portfolio level and
     do not pretend to. What we can answer is board level: what repriced, and where
     the spread to the climatology anchor widened or narrowed. */
  function exposure(windowMin) {
    const W = windowMin || 360;
    const moves = signals({ sinceMin: W }).filter((s) => s.kind === "market" && s.status === "active");
    const byContract = new Map();
    moves.forEach((s) => {
      if (!s.contractId) return;
      const cur = byContract.get(s.contractId) || { id: s.contractId, net: 0, n: 0, label: s.subject };
      cur.net += s.delta; cur.n += 1;
      byContract.set(s.contractId, cur);
    });
    const rows = [...byContract.values()].map((r) => {
      const C = (MT.contracts || []).find((x) => x.id === r.id);
      const price = C ? mkt(C, NF) : null;
      const model = C ? mdl(C, NF) : null;
      const edge = (price != null && model != null) ? (model - price) * 100 : null;
      const prevEdge = (C && model != null && price != null) ? (model - (price - r.net / 100)) * 100 : null;
      return Object.assign(r, { price, model, edge, prevEdge,
        widened: (edge != null && prevEdge != null) ? Math.abs(edge) > Math.abs(prevEdge) : null,
        anchored: model != null, contract: C });
    }).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const anchored = rows.filter((r) => r.anchored);
    return {
      windowMin: W, rows,
      repriced: rows.length,
      widened: anchored.filter((r) => r.widened === true).length,
      narrowed: anchored.filter((r) => r.widened === false).length,
      unanchored: rows.length - anchored.length,
    };
  }

  /* ---------------- Edge book ----------------
   * The board could say what MOVED and what a contract was worth, but never which bet
   * to take. Every existing surface either ordered by ladder, by recency, or by the size
   * of the last tick — so the operator's actual question, "what should I buy and how
   * much", was answered by reading 151 cards.
   *
   * Four things this does that the old edge display did not:
   *
   *  1. Prices the side you can ACTUALLY trade. Edge was computed against the mid, which
   *     is not a price anyone fills at. On a 0/2c book the mid says 1c and a taker pays
   *     2c — the whole edge, twice over, on the cheap rungs where it matters most.
   *  2. Charges the fee. Kalshi takes 0.07 x P x (1-P) per contract, which peaks at
   *     1.75c near a coin flip. A 3c gross edge at 50c is a 1.25c net edge; the board
   *     used to show the 3c.
   *  3. Considers the NO side. Half a mispricing is the market being too HIGH, and a
   *     board that only ever buys YES cannot see it.
   *  4. Ranks by expected dollars, not by edge. A 20-point edge with $17 of resting size
   *     is worth less than a 6-point edge with $1,400 behind it, and the old cards gave
   *     both the same visual weight.
   *
   * What it deliberately does NOT do: weight the score by an invented confidence factor.
   * The governing posterior layer and its sample size are shown as their own column so
   * the operator can gate on them, rather than being folded into a number whose
   * construction nobody can see.
   */
  const FEE_RATE = 0.07;                                    // Kalshi's published taker fee
  const feePerContract = (p) => FEE_RATE * p * (1 - p);

  // Rungs of one ladder are the same underlying bet. "More than 3 hurricanes" and "more
  // than 4" cannot be sized independently without staking the same view twice.
  function ladderOf(c) { return String(c.id).replace(/-[^-]*$/, ""); }

  function edgeBook(frame, bankroll, stakeFrac, opts) {
    const o = Object.assign({ minEdge: 0.02, minDollars: 25, limit: 8 }, opts || {});
    const f = clampF(frame == null ? NF : frame);
    const all = MT.contracts || [];
    const skipped = { noModel: 0, noBook: 0, noEdge: 0, tooThin: 0 };
    const rows = [];

    for (const c of all) {
      const p = mdl(c, f);
      if (p == null) { skipped.noModel++; continue; }
      const d = c.depth || {};
      const notional = d.notional || 1;
      const ask = c.yesAsk != null ? c.yesAsk : null;
      const bid = c.yesBid != null ? c.yesBid : null;

      /* Two ways to take the same view. Buying YES at the ask wins when the model is
         above the price; buying NO — selling YES into the bid — wins when it is below.
         Each is evaluated against the size actually resting on that side. */
      const legs = [];
      if (ask != null && ask > 0 && ask < 1 && d.askSize > 0) {
        const cost = ask + feePerContract(ask);
        legs.push({ side: "YES", price: ask, cost, edge: p - cost, size: d.askSize, notional });
      }
      if (bid != null && bid > 0 && bid < 1 && d.bidSize > 0) {
        const cost = (1 - bid) + feePerContract(1 - bid);
        legs.push({ side: "NO", price: 1 - bid, cost, edge: (1 - p) - cost, size: d.bidSize, notional });
      }
      if (!legs.length) { skipped.noBook++; continue; }

      const best = legs.slice().sort((a, b) => b.edge - a.edge)[0];
      if (best.edge < o.minEdge) { skipped.noEdge++; continue; }

      /* Kelly on a binary at this cost, then capped by what is actually resting. The cap
         binds constantly on this board — most rungs have two-figure depth — which is the
         point: an edge you cannot get size on is not an opportunity. */
      const kf = Math.max(0, best.edge / (1 - best.cost));
      const idealDollars = bankroll * kf * (stakeFrac == null ? 1 : stakeFrac);
      const capacityContracts = best.size;
      const capacityDollars = capacityContracts * best.cost * notional;
      const capacityDollarsOf = capacityDollars;
      const stakeDollars = Math.min(idealDollars, capacityDollars);
      const contracts = best.cost > 0 ? stakeDollars / (best.cost * notional) : 0;
      const ev = contracts * best.edge * notional;
      if (stakeDollars < o.minDollars) { skipped.tooThin++; continue; }

      const layers = c.modelLayers || [];
      const live = layers.filter((l) => l && !l.unavailable && l.p != null);
      const governing = live.slice(-1)[0] || null;

      /* How much the answer depends on WHICH conditioning you use. Every layer asks the
         same question of the same record under a different restriction, so when they
         cluster the estimate is robust to method, and when they scatter the number is an
         artefact of one choice. This is the single most useful thing to show next to an
         edge, and it costs nothing to compute. */
      const ps = live.map((l) => l.p);
      const dispersion = ps.length > 1 ? Math.max(...ps) - Math.min(...ps) : null;

      /* The verdict. Deliberately demotes very large edges rather than celebrating them:
         a climatology baseline that disagrees with a traded market by 25 points, while
         its own layers disagree with each other, is far more likely to be missing
         something than to have found free money. */
      const why = [];
      /* An anchor that carries a BAND rather than a point cannot claim an edge the band
         does not survive. The official-forecast anchor is a repackaging of a public NHC
         product plus its published error — it holds no information the market has not
         also read, so when the honest range of that estimate straddles the price you
         would pay, the correct output is that there is nothing here, not a number
         derived from the middle of the band. */
      let bandKills = false;
      if (c.modelLow != null && c.modelHigh != null) {
        const worst = best.side === "YES" ? c.modelLow - best.cost : (1 - c.modelHigh) - best.cost;
        if (worst <= 0) {
          bandKills = true;
          why.push("the estimate's own range (" + Math.round(c.modelLow * 100) + "-"
            + Math.round(c.modelHigh * 100) + "%) straddles the " + Math.round(best.price * 100)
            + "c you would pay — no edge survives it");
        }
      }
      const frictionOk = c.spread == null || best.edge >= 1.5 * c.spread;
      /* Absence of disagreement is NOT agreement. An anchor that publishes no layer
         detail cannot be shown to be robust to method, so it must not earn the top
         grade on the strength of having nothing to contradict it. */
      /* Three layers, not two. The per-name anchors publish an unweighted ordinal and an
         ONI-weighted one — but the second is a shrunk transformation of the first, so the
         two cannot disagree by much no matter how wrong they both are. Agreement between
         nested estimates is not corroboration. The count ladders carry five genuinely
         different conditionings (base, day-of-year, season-to-date, phase bucket, ONI
         kernel) and can earn the top grade; a two-layer anchor tops out at SMALL. */
      const measured = live.length >= 3 && dispersion != null;
      const agrees = measured && dispersion <= 0.10;
      const deep = capacityDollarsOf >= o.minDollars * 2;
      if (!live.length) why.push("no layer detail to check the estimate against");
      else if (live.length < 3) why.push("only " + live.length + " layer" + (live.length === 1 ? "" : "s")
        + ", and the second is a shrunk form of the first — not independent corroboration");
      else if (!agrees) why.push("layers disagree by " + Math.round(dispersion * 100) + " pts");
      if (!frictionOk) why.push("edge is under 1.5x the " + Math.round((c.spread || 0) * 100) + "c spread");
      if (!deep) why.push("only $" + Math.round(capacityDollarsOf) + " resting");
      if (best.edge >= 0.25 && !agrees) why.push("a " + Math.round(best.edge * 100) + "-pt disagreement with a traded market is more likely a model gap than free money");
      const grade = bandKills ? "SUSPECT"
        : (best.edge >= 0.25 && !agrees) ? "SUSPECT"
        : (agrees && frictionOk && deep && best.edge >= 0.03) ? "TAKE"
        : "SMALL";
      if (grade === "TAKE") why.push("every layer within " + Math.round(dispersion * 100) + " pts, edge clears the spread, real size resting");

      rows.push({
        grade, why, dispersion,
        c, id: c.id, label: c.label || c.short || c.id,
        side: best.side, model: p, price: best.price, cost: best.cost,
        fee: feePerContract(best.side === "YES" ? best.price : best.price),
        edge: best.edge, edgeGross: best.side === "YES" ? p - best.price : (1 - p) - best.price,
        kellyFrac: kf, capacityContracts, capacityDollars,
        stake: stakeDollars, contracts, ev, roi: stakeDollars > 0 ? ev / stakeDollars : null,
        capped: idealDollars > capacityDollars,
        layer: governing ? governing.label : null, basis: c.modelBasis || null,
        ladder: ladderOf(c), spread: c.spread ?? null, volume24h: c.volume24h ?? null,
      });
    }

    /* Expected dollars first — that is the quantity being maximised. Return on the stake
       breaks ties so a thin, very mispriced rung outranks a fat, barely mispriced one at
       equal expected value; then the tighter book, then the busier market. */
    /* Grade first, then expected dollars. An operator scanning this wants the bets that
       survive scrutiny at the top, not the biggest numbers — the biggest numbers are the
       ones most likely to be a model gap, which is exactly why SUSPECT sorts last. */
    const GRADE_RANK = { TAKE: 0, SMALL: 1, SUSPECT: 2 };
    rows.sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade]
      || b.ev - a.ev || b.roi - a.roi
      || (a.spread ?? 1) - (b.spread ?? 1) || (b.volume24h || 0) - (a.volume24h || 0));

    // One rung per ladder in the headline list; the rest stay available underneath.
    const seen = new Set(), top = [], alsoInLadder = [];
    for (const r of rows) {
      if (seen.has(r.ladder)) { alsoInLadder.push(r); continue; }
      seen.add(r.ladder); top.push(r);
    }

    const anchored = all.filter((c) => mdl(c, f) != null).length;
    return {
      rows: top.slice(0, o.limit), overflow: top.slice(o.limit), alsoInLadder,
      candidates: rows.length, ladders: seen.size,
      byGrade: { TAKE: top.filter((r) => r.grade === "TAKE").length,
                 SMALL: top.filter((r) => r.grade === "SMALL").length,
                 SUSPECT: top.filter((r) => r.grade === "SUSPECT").length },
      coverage: { anchored, total: all.length },
      skipped, thresholds: o, bankroll, stakeFrac,
    };
  }

  /* ---------------- Ladder consistency ----------------
   * "More than 4" cannot be less likely than "more than 5" — the second outcome implies
   * the first. When a ladder prints otherwise there is a locked spread available that
   * does not depend on the model being right about anything, which makes it the only
   * edge on this board with no forecasting risk at all.
   *
   * The distinction that matters is EXECUTABLE versus DISPLAYED. Exchange screens show a
   * last trade or a mid, and those invert constantly on thin books — the Atlantic major
   * ladder and the eastern Pacific named-storm ladder are both inverted on mids right
   * now. Neither is tradeable: at the touch the prices are ordered correctly. So this
   * compares the ask you would pay on the lower strike against the bid you would hit on
   * the higher one, and reports the two cases separately. Calling a mid inversion an
   * arbitrage is how you lose money confirming someone else's screenshot.
   */
  function ladderArbs(frame) {
    const f = clampF(frame == null ? NF : frame);
    const by = {};
    for (const c of (MT.contracts || [])) {
      if (c.strike == null) continue;
      (by[ladderOf(c)] = by[ladderOf(c)] || []).push(c);
    }
    const executable = [], displayed = [];
    for (const [key, arr] of Object.entries(by)) {
      arr.sort((a, b) => a.strike - b.strike);
      for (let i = 0; i + 1 < arr.length; i++) {
        const lo = arr[i], hi = arr[i + 1];
        const loP = mkt(lo, f), hiP = mkt(hi, f);
        if (loP != null && hiP != null && hiP > loP + 1e-9) {
          displayed.push({ ladder: key, lo: lo.strike, hi: hi.strike, loP, hiP,
            gap: hiP - loP, label: lo.label || lo.id });
        }
      }
      // Every pair, not just adjacent rungs — the implication holds across the ladder.
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const lo = arr[i], hi = arr[j];
          const a = lo.yesAsk, b = hi.yesBid;
          if (a == null || b == null || !(b > a)) continue;
          const size = Math.min((lo.depth && lo.depth.askSize) || 0, (hi.depth && hi.depth.bidSize) || 0);
          if (!(size > 0)) continue;
          const fee = feePerContract(a) + feePerContract(1 - b);
          const net = (b - a) - fee;
          if (!(net > 0)) continue;
          executable.push({ ladder: key, buyStrike: lo.strike, sellStrike: hi.strike,
            buyId: lo.id, sellId: hi.id, buyAsk: a, sellBid: b,
            gross: b - a, fee, net, size, profit: net * size,
            label: (lo.label || lo.id) });
        }
      }
    }
    executable.sort((x, y) => y.profit - x.profit);
    displayed.sort((x, y) => y.gap - x.gap);
    return { executable, displayed };
  }

  /* ---------------- Exit cost ----------------
   * A quoted market is not a tradeable one. Twenty-one of the contracts on this board
   * have a bid and an ask more than fifteen cents apart, and several are quoted 5c bid
   * against 57c offered with five contracts resting on each side. Buying one of those
   * is close to irreversible: you pay the ask, you are marked at the bid, and there is
   * nobody to sell back to at any size.
   *
   * That is not a hypothetical. It is the difference between a position showing "63%"
   * when you bought it and "5%" an hour later with nothing having happened in the
   * atmosphere at all — the first number was the offer, the second is the bid, and the
   * gap between them was always the cost of the trade.
   *
   * So the board states the round trip explicitly: what you pay to get in, what you
   * would receive to get out RIGHT NOW, and how many contracts the exit is actually
   * good for. A market whose exit is five contracts deep is a hold-to-expiry position
   * whatever the screen says.
   */
  const EXIT_WIDE = 0.15;          // a spread this wide costs more than most edges here
  const EXIT_THIN = 25;            // contracts; below this the quote is decorative

  function exitCost(c, contracts) {
    const bid = c.yesBid, ask = c.yesAsk;
    if (bid == null || ask == null) return null;
    const spread = ask - bid;
    const n = contracts || 1;
    const inAt = ask + feePerContract(ask);
    const outAt = bid - feePerContract(bid);
    const exitDepth = (c.depth && c.depth.bidSize) || 0;
    return {
      bid, ask, spread,
      roundTrip: inAt - outAt,                       // per contract, both fees charged
      roundTripPct: inAt > 0 ? (inAt - outAt) / inAt : null,
      costToEnter: n * inAt, valueOnExit: n * Math.max(0, outAt), payoutIfYes: n,
      exitDepth, fillableOnExit: Math.min(n, exitDepth),
      wide: spread >= EXIT_WIDE, thin: exitDepth < EXIT_THIN,
      tradeable: spread < EXIT_WIDE && exitDepth >= EXIT_THIN,
    };
  }

  function liquidityTraps() {
    const out = [];
    for (const c of (MT.contracts || [])) {
      const e = exitCost(c, 100);
      if (!e || e.tradeable) continue;
      out.push({ id: c.id, label: c.label || c.short || c.id, ...e });
    }
    return out.sort((a, b) => b.spread - a.spread);
  }

  return { snap, at, kellyFor, tier, frameTime, mkt, mdl, priceHist, orderBookFor, signals, signalSummary, situation, attention, exposure, nextAdvisory, lifecycleFor, LIFECYCLE, edgeBook, feePerContract, ladderArbs, exitCost, liquidityTraps };
})();
})();
