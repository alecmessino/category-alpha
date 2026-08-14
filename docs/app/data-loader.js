/* Millibar Terminal — LIVE data loader. Replaces the old static seed (data.js).

   Fetches same-origin data/latest.json + data/frames.json (produced server-side by
   the scheduled GitHub Action, so no browser CORS) and rebuilds window.MT in the exact
   shape the panels / compute engine / map already consume. Every value here traces to a
   real feed; anything a feed could not supply is left null and rendered as "NO FEED" —
   nothing is fabricated. compute.js polls for window.MT, so an async set is fine. */
(function loadMT() {
  const BASE = window.MT_DATA_BASE || "data/";

  function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isNum(x) { return typeof x === "number" && isFinite(x); }

  // Saffir–Simpson from sustained wind (kt). Defensive — the feed also sends cls,
  // but we recompute so a bad/missing label can't misrepresent intensity.
  function clsFromWind(w) {
    if (!isNum(w)) return { cls: "—", full: "Unknown" };
    if (w >= 137) return { cls: "C5", full: "Cat 5 Hurricane" };
    if (w >= 113) return { cls: "C4", full: "Cat 4 Hurricane" };
    if (w >= 96) return { cls: "C3", full: "Cat 3 Hurricane" };
    if (w >= 83) return { cls: "C2", full: "Cat 2 Hurricane" };
    if (w >= 64) return { cls: "C1", full: "Cat 1 Hurricane" };
    if (w >= 34) return { cls: "TS", full: "Tropical Storm" };
    return { cls: "TD", full: "Tropical Depression" };
  }
  // Lifecycle phase (interpretation label only) from the intensity trend over history.
  function phaseFrom(w0, wN) {
    if (!isNum(wN)) return "WATCH";
    const d = isNum(w0) ? wN - w0 : 0;
    if (wN < 34) return "WATCH";
    if (d >= 8) return "VELOCITY";
    if (wN >= 113 && d < 4) return "EXHAUSTION";
    if (d > 0) return "ACCUMULATION";
    return "WATCH";
  }
  const PHASE_COLOR = {
    ACCUMULATION: "var(--pai-accumulation)", VELOCITY: "var(--pai-velocity)",
    EXHAUSTION: "var(--pai-exhaustion)", WATCH: "var(--pai-watch)",
  };

  function synthFrame(latest, tsZ) {
    const storms = {}, contracts = {};
    (latest.storms || []).forEach((s) => { storms[s.id] = { wind: s.wind, pressure: s.pressure, center: s.center, modelCat4: s.modelCat4 ?? null, marketCat4: s.marketCat4 ?? null, reconAge: s.reconAge ?? null }; });
    (latest.contracts || []).forEach((c) => { contracts[c.id] = { market: c.market ?? null, model: c.model ?? null }; });
    return { tsZ: tsZ, storms, contracts };
  }

  function build(latest, framesJson) {
    latest = latest || {};
    const feeds = latest.feeds || {};
    const stepMin = latest.stepMin || (framesJson && framesJson.stepMin) || 15;
    const nowIso = latest.generatedAt || new Date().toISOString();
    let framesArr = (framesJson && Array.isArray(framesJson.frames)) ? framesJson.frames.slice(-24) : [];
    if (framesArr.length === 0) framesArr = [synthFrame(latest, nowIso)];
    const FRAMES = framesArr.length, NF = FRAMES - 1;
    // Median gap between committed snapshots — what the pipeline ACTUALLY delivers.
    const gaps = [];
    for (let i = 1; i < framesArr.length; i++) {
      const a = Date.parse(framesArr[i - 1].tsZ), b = Date.parse(framesArr[i].tsZ);
      if (a && b && b > a) gaps.push((b - a) / 60000);
    }
    gaps.sort((x, y) => x - y);
    const observedStepMin = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null;
    const clampF = (f) => Math.max(0, Math.min(NF, Math.round(f)));

    // ---- storms ----
    const storms = {};
    (latest.storms || []).forEach((s) => {
      const fs = (f) => framesArr[clampF(f)].storms[s.id] || null;
      const pick = (f, key, dflt) => { const r = fs(f); return r && r[key] != null ? r[key] : dflt; };
      const windEnd = pick(NF, "wind", s.wind), windStart = pick(0, "wind", s.wind);
      const phase = s.phase || phaseFrom(windStart, windEnd);
      const cc = clsFromWind(s.wind);
      storms[s.id] = {
        id: s.id, name: s.name, cls: s.cls || cc.cls, full_cls: s.full_cls || cc.full,
        basin: s.basin || "east", color: s.color || PHASE_COLOR[phase] || "var(--accent)", phase,
        center: s.center, movement: s.movement || "—",
        track: s.track || null, trackPoints: s.trackPoints || null,
        pastIdx: isNum(s.pastIdx) ? s.pastIdx : 0,
        cone: s.cone || null, reconTracks: s.reconTracks || null,
        advNum: s.advNum || null, advTimeZ: s.advTimeZ || null,
        // frame accessors read the REAL per-frame snapshot; fall back to the latest value
        wind: (f) => pick(f, "wind", s.wind),
        pressure: (f) => pick(f, "pressure", s.pressure),
        modelCat4: (f) => { const r = fs(f); return r && r.modelCat4 != null ? r.modelCat4 : (s.modelCat4 ?? null); },
        marketCat4: (f) => { const r = fs(f); return r && r.marketCat4 != null ? r.marketCat4 : (s.marketCat4 ?? null); },
        reconAge: (f) => { const r = fs(f); return r && r.reconAge != null ? r.reconAge : (s.reconAge ?? null); },
        centerAt: (f) => pick(f, "center", s.center),
      };
    });

    // ---- contracts (real prices per frame; model = climatology anchor when present) ----
    const contracts = (latest.contracts || []).map((c) => {
      const fc = (f) => framesArr[clampF(f)].contracts[c.id] || null;
      // Full committed price history for trend charts (nulls where the contract
      // wasn't yet listed — the chart skips those rather than interpolating).
      const histSeries = framesArr.map((fr) => {
        const r = fr.contracts && fr.contracts[c.id];
        return r && r.market != null ? r.market : null;
      });
      const histTimes = framesArr.map((fr) => fr.tsZ);
      return Object.assign({}, c, {
        subject: c.subject || null, depth: c.depth || null,
        volume24h: c.volume24h ?? null, openInterest: c.openInterest ?? null,
        histSeries, histTimes,
        priceAt: (f) => { const r = fc(f); return r && r.market != null ? r.market : (c.market ?? null); },
        modelAt: (f) => { const r = fc(f); return r && r.model != null ? r.model : (c.model ?? null); },
      });
    });

    // ---- evidence (built from what the feeds actually delivered) ----
    const primary = (latest.storms || [])[0];
    const evidence = [];
    if (primary) {
      const mkt = feeds.markets || {};
      const nhc = feeds.nhc || {};
      evidence.push({
        id: "ev-adv", kind: "advisory", label: "NHC Public Advisory", source: "NHC",
        tier: nhc.ok ? "A" : "C", latency: nhc.latencyMs != null ? Math.round(nhc.latencyMs) + "ms" : "live",
        ver: primary.advNum ? "adv-" + primary.advNum : "adv", prov: nhc.ok ? "live" : "nofeed", weight: 0.32,
        hash: fnv("adv" + primary.id + (primary.advNum || "")),
        read: (S, f) => S.full_cls + " · " + Math.round(S.wind(f)) + " kt",
      });
      evidence.push({
        id: "ev-pres", kind: "recon_fix", label: "Min central pressure", source: nhc.source || "NHC",
        tier: nhc.ok ? "A" : "C", latency: "live", ver: primary.advNum ? "adv-" + primary.advNum : "adv",
        prov: nhc.ok ? "live" : "nofeed", weight: 0.24, hash: fnv("pres" + primary.id),
        read: (S, f) => Math.round(S.pressure(f)) + " mb",
      });
      if (isNum(latest.sstAnomalyC)) {
        evidence.push({
          id: "ev-sst", kind: "sst_reading", label: "Sea-surface temp anomaly", source: (feeds.sst && feeds.sst.source) || "Open-Meteo",
          tier: "B", latency: "hourly", ver: "sst", prov: "live", weight: 0.15, hash: fnv("sst" + latest.sstAnomalyC),
          read: () => (latest.sstAnomalyC >= 0 ? "+" : "") + latest.sstAnomalyC.toFixed(1) + " °C",
        });
      }
      const hasMarketForPrimary = contracts.some((c) => c.storm === primary.id);
      if (hasMarketForPrimary) {
        evidence.push({
          id: "ev-market", kind: "market_snapshot", label: "Prediction-market price", source: mkt.source ? mkt.source[0].toUpperCase() + mkt.source.slice(1) : "Market",
          tier: "C", latency: "live", ver: "mkt", prov: mkt.ok ? "live" : "nofeed", weight: 0.0, hash: fnv("mkt" + primary.id),
          read: (S, f) => { const c = contracts.find((x) => x.storm === S.id); return c ? Math.round(c.priceAt(f) * 100) + "¢" : "—"; },
        });
      }
    }

    // ENSO is a seasonal-scale input, not a storm-scale one, so it stands outside the
    // per-storm block and reads the same whether or not a cyclone is active.
    const enso = latest.enso;
    if (enso && enso.ok && enso.phase) {
      const sign = enso.anchorAnom >= 0 ? "+" : "";
      evidence.push({
        id: "ev-enso", kind: "enso_state", label: "ENSO phase (ONI)", source: enso.source || "CPC ONI",
        tier: enso.assumed ? "B" : "A", latency: "monthly",
        ver: (enso.anchorSeas || "") + " " + (enso.anchorYear || ""),
        prov: "live", weight: 0, hash: fnv("enso" + enso.anchorSeas + enso.anchorYear + enso.anchorAnom),
        read: () => enso.phaseLabel + " · " + sign + Number(enso.anchorAnom).toFixed(2)
          + (enso.assumed ? " (carried)" : ""),
      });
    }

    // ---- events → frame indices (nearest committed snapshot by timestamp) ----
    const frameTimeMs = framesArr.map((fr) => Date.parse(fr.tsZ) || 0);
    function nearestFrame(tsZ) {
      const t = Date.parse(tsZ); if (!t) return NF;
      let best = 0, bd = Infinity;
      for (let i = 0; i < frameTimeMs.length; i++) { const d = Math.abs(frameTimeMs[i] - t); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    const events = (latest.events || []).map((e) => ({
      frame: e.frame != null ? clampF(e.frame) : nearestFrame(e.tsZ), kind: e.kind, label: e.label,
      source: e.source, tier: e.tier || "B", hot: !!e.hot,
    })).sort((a, b) => a.frame - b.frame);

    // ---- pipeline (honest: reflects real feed availability) ----
    const anyStorm = (latest.storms || []).length > 0;
    const mktOk = !!(feeds.markets && feeds.markets.ok);
    const nhcOk = !!(feeds.nhc && feeds.nhc.ok);
    /* Pipeline stage text is NOT authored here. Each row asks the claim registry,
       which is the single owner of every capability statement on the page. This row
       is where "ensemble consensus" was invented and survived for weeks. */
    const stageStatus = (c) => c.ok ? "PASS" : "EMPTY";
    const pipeline = [
      ["Observation", "pipeline.observation"], ["Evidence", "pipeline.evidence"],
      ["Features", "pipeline.features"], ["Confidence", "pipeline.confidence"],
      ["Probability", "pipeline.probability"], ["Edge", "pipeline.edge"],
      ["Kelly", "pipeline.kelly"], ["Position", "pipeline.position"],
    ].map(([stage, id]) => {
      // window.MT does not exist yet — hand the claim the state we are building.
      const c = window.MTC.claim(id, { feeds, evidence, generatedAt: latest.generatedAt || null });
      return { stage, status: stageStatus(c), detail: c.text, owner: c.owner };
    });

    // ---- health (honest: real HTTP status / counts / freshness) ----
    const staleMin = latest.generatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(latest.generatedAt)) / 60000)) : null;
    function agoStr(iso) { const t = Date.parse(iso); if (!t) return "—"; const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + "m ago" : Math.floor(m / 60) + "h" + pad2(m % 60) + "m ago"; }
    /* The row summarises; `diag` carries what the fetch actually reported, so the
       panel can expand rather than hiding it in a title attribute. Every entry is a
       field the feed really returned — absent fields are omitted, never filled in. */
    function diagOf(f) {
      const d = [];
      const put = (k, v) => { if (v !== undefined && v !== null && v !== "") d.push({ k, v: String(v) }); };
      put("source", f.source);
      put("endpoint", f.url);
      put("http status", f.status);
      put("latency", f.latencyMs != null ? Math.round(f.latencyMs) + " ms" : null);
      put("items returned", f.count);
      put("note", f.note);
      put("archive file", f.file);
      put("seasons", f.seasons);
      put("series kept", f.seriesKept);
      if (f.droppedForCap) put("DROPPED FOR CAP", f.droppedForCap);
      put("forecast products", f.forecast);
      (f.attempts || []).forEach((a) => {
        put("attempt · " + (a.source || "?"), [a.ok ? "ok" : "FAILED", a.status ? "HTTP " + a.status : null,
          a.count != null ? a.count + " items" : null, a.note].filter(Boolean).join(" · "));
        (a.hosts || []).forEach((h) => put("   host " + String(h.host || "").replace(/^https?:\/\//, ""),
          ["status " + h.status, h.mode, h.category,
           h.pages != null ? h.pages + " pages" : null,
           h.scanned != null ? h.scanned + " scanned" : null, h.error].filter(Boolean).join(" · ")));
      });
      return d;
    }
    function feedHealth(f, name) {
      f = f || {}; const st = f.ok ? "PASS" : (f.status ? "FAIL" : "EMPTY");
      const bits = [f.source || name]; if (f.status) bits.push("HTTP " + f.status); if (f.count != null) bits.push(f.count + " items"); if (f.note && !f.ok) bits.push(f.note);
      return { name, detail: bits.join(" · "), status: st, diag: diagOf(f) };
    }
    const health = [
      feedHealth(feeds.nhc, "NHC advisories"),
      Object.assign(feedHealth(feeds.markets, "Prediction markets"),
        (feeds.markets && feeds.markets.droppedForCap) ? { status: "FAIL" } : {}),
      feedHealth(feeds.satellite, "GIBS imagery"),
      feedHealth(feeds.sst, "SST anomaly"),
      feedHealth(feeds.models, "Ensemble models"),
      feedHealth(feeds.enso, "ENSO / ONI"),
      feedHealth(feeds.outlook, "Genesis outlook"),
      /* Two different clocks, and conflating them is what previously understated
         staleness: the SNAPSHOT refreshes on the pipeline tick, while replay FRAMES
         are spaced further apart on purpose. Report both. */
      { name: "Data refresh", status: latest.generatedAt ? (staleMin != null && staleMin > 90 ? "FAIL" : "PASS") : "EMPTY",
        detail: latest.generatedAt
          ? "snapshot " + agoStr(latest.generatedAt) +
            (observedStepMin != null ? " · replay frames ~" + observedStepMin + "m apart" : "")
          : "awaiting first refresh",
        diag: [
          { k: "snapshot written", v: latest.generatedAt || "never" },
          { k: "snapshot age", v: staleMin != null ? staleMin + " min" : "—" },
          { k: "replay frames retained", v: String(framesArr.length) },
          { k: "frame spacing (observed)", v: observedStepMin != null ? observedStepMin + " min" : "—" },
          { k: "frame spacing (configured)", v: stepMin + " min" },
          { k: "history span", v: framesArr.length > 1
              ? Math.round((Date.parse(framesArr[framesArr.length - 1].tsZ) - Date.parse(framesArr[0].tsZ)) / 3600000) + " h"
              : "—" },
        ] },
    ];

    return {
      FRAMES, STEP_MIN: stepMin, OBSERVED_STEP_MIN: observedStepMin, storms, contracts,
      evidence, models: latest.models || [], events, pipeline, health,
      _frames: framesArr, _feeds: feeds, _generatedAt: latest.generatedAt || null, _note: latest.note || null,
      _verify: window.__MT_VERIFY || null, _enso: latest.enso || null,
      _outlook: latest.outlook || [],
      _wind: window.__MT_WIND || null,
    };
  }

  function emptyLatest(err) {
    return { stepMin: 15, generatedAt: null, note: "data unreachable: " + err,
      feeds: { nhc: { ok: false, note: "fetch failed: " + err }, markets: { ok: false }, satellite: { ok: true, source: "NASA GIBS VIIRS" }, sst: { ok: false }, models: { ok: false } },
      storms: [], contracts: [], models: [], events: [] };
  }

  function done(latest, framesJson) {
    window.MT = build(latest, framesJson);
    window.MT_READY = true;
    window.dispatchEvent(new CustomEvent("mt-data-ready", { detail: { generatedAt: (latest && latest.generatedAt) || null } }));
  }

  /* An open tab used to sit on whatever snapshot it booted with — leave the terminal
     up for two hours and it silently showed two-hour-old prices with a green LIVE dot.
     Poll the same-origin snapshot and announce a newer one; the UI decides whether to
     take it (at live) or offer it (mid-scrub), so a refresh never yanks the cursor
     out from under someone mid-investigation. */
  const POLL_MS = 60000;
  function startPolling() {
    let seen = window.MT && window.MT._generatedAt;
    let announced = null;
    setInterval(function () {
      if (document.hidden) return;                 // don't poll a backgrounded tab
      fetch(BASE + "latest.json", { cache: "no-store" })
        .then((r) => r.ok ? r.json() : null)
        .then((j) => {
          if (!j || !j.generatedAt) return;
          if (j.generatedAt === seen || j.generatedAt === announced) return;
          announced = j.generatedAt;
          window.dispatchEvent(new CustomEvent("mt-data-newer", { detail: { generatedAt: j.generatedAt } }));
        })
        .catch(() => { /* transient — the next tick retries */ });
    }, POLL_MS);
  }

  Promise.all([
    fetch(BASE + "latest.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject("HTTP " + r.status)),
    fetch(BASE + "frames.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
    // Verdict of the CI job that drives a real browser against the public URL.
    fetch(BASE + "verify-live.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).catch(() => null),
    /* GFS surface wind. Cached hard rather than no-store: it changes four times a day,
       not every ten minutes, and re-pulling 64 KB on every poll would be waste. Absent is
       a normal state — the map simply has no wind layer to offer. */
    fetch(BASE + "wind.json").then((r) => r.ok ? r.json() : null).catch(() => null),
  ]).then(([latest, framesJson, verify, wind]) => { window.__MT_VERIFY = verify; window.__MT_WIND = wind; done(latest, framesJson); startPolling(); })
    .catch((err) => { console.warn("[millibar] data load failed:", err); done(emptyLatest(err), null); startPolling(); });
})();
