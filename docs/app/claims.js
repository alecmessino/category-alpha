/* Millibar Terminal — CLAIM REGISTRY.
 *
 * THE RULE: every visible claim has exactly one owner. Not just numbers — labels,
 * status text, capability descriptions, health indicators, provenance footers.
 *
 * This exists because the UI kept drifting ahead of the code. Three separate times a
 * panel described a capability the system did not have: a hardcoded "Live NHC feed ·
 * 200 OK" with no fetch behind it, a pipeline row reading "ensemble consensus" when
 * the only model was HURDAT2 climatology, and provenance footers citing
 * "canonical.fix() · v1.2.4" — files and versions that do not exist. Each was written
 * as a string literal inside a component, so nothing could contradict it.
 *
 * Now a claim is a function of the real feed state, registered once, with a named
 * owner. Components read claims; they never author them. `scripts/audit-claims.mjs`
 * fails CI if capability language reappears as a literal in a component.
 *
 * Owner values:
 *   a feed key ("nhc", "markets", "enso", …)  — asserted by that feed's fetch result
 *   "derived"                                  — computed from committed data on this page
 *   "operator"                                 — asserted by a human, not observed
 *   "none"                                     — not wired; the claim is that it is absent
 */
(function () {
  const REG = {};
  /* Claims are read both AFTER window.MT exists (from components) and DURING the
     loader's build, before it is assigned. So state is passed in explicitly and only
     falls back to the global — otherwise every claim evaluated at build time silently
     reported "no feeds reachable", which is its own species of the bug this file
     exists to prevent. */
  function state(ctx) {
    if (ctx && ctx.feeds) return ctx;
    const M = window.MT || {};
    return { feeds: M._feeds || {}, evidence: M.evidence || [], generatedAt: M._generatedAt || null,
             verify: M._verify || null, enso: M._enso || null, outlook: M._outlook || [] };
  }
  const okOf = (s, k) => { const f = s.feeds[k]; return !!(f && f.ok); };
  const srcOf = (s, k, fallback) => { const f = s.feeds[k]; return (f && f.source) || fallback || k; };

  function define(id, owner, fn) { REG[id] = { id, owner, fn }; }

  /* Snapshot age drives every liveness claim on the page. A footer that says "live"
     while the snapshot is four hours old is the same lie in a smaller font. */
  function snapshotAgeMin(ctx) {
    const g = state(ctx).generatedAt;
    if (!g) return null;
    const t = Date.parse(g);
    return t ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
  }
  function freshness(ctx) {
    const a = snapshotAgeMin(ctx);
    if (a == null) return "no snapshot";
    if (a <= 25) return "live · " + a + "m";
    if (a <= 75) return a + "m old";
    return "STALE " + (a < 120 ? a + "m" : Math.floor(a / 60) + "h" + ("0" + (a % 60)).slice(-2) + "m");
  }

  // ---- pipeline stages -----------------------------------------------------
  define("pipeline.observation", "nhc+markets", (s) => {
    const bits = [okOf(s, "nhc") && "NHC", okOf(s, "markets") && srcOf(s, "markets"), okOf(s, "satellite") && "GIBS"].filter(Boolean);
    return { text: bits.join(" · ") || "no feeds reachable", ok: bits.length > 0 };
  });
  define("pipeline.evidence", "derived", (s) => {
    const n = (s.evidence || []).length;
    return { text: n + " input" + (n === 1 ? "" : "s") + " · content-addressed (FNV-1a)", ok: n > 0 };
  });
  define("pipeline.features", "nhc", (s) => ({
    text: okOf(s, "nhc") ? "wind · pressure · track · reconstructed cone" : "no active system",
    ok: okOf(s, "nhc"),
  }));
  define("pipeline.confidence", "derived", () => ({
    text: "evidence-quality tiering (not forecast confidence)", ok: true,
  }));
  /* The row that drifted. It is a climatology anchor and, when the ONI feed is up, an
     ENSO stratification of that anchor. It has never been an ensemble. */
  define("pipeline.probability", "models", (s) => ({
    text: okOf(s, "models")
      ? "HURDAT2 climatology anchor" + (okOf(s, "enso") ? " + ENSO stratification" : "") + " — no ensemble feed"
      : "no climatology anchor and no ensemble feed",
    ok: okOf(s, "models"),
  }));
  define("pipeline.edge", "derived", (s) => ({
    text: okOf(s, "markets") && okOf(s, "models") ? "anchor − market price" : "needs both a market and an anchor",
    ok: okOf(s, "markets") && okOf(s, "models"),
  }));
  define("pipeline.kelly", "derived", (s) => ({
    text: "quarter-Kelly, capped by resting depth", ok: okOf(s, "markets"),
  }));
  define("pipeline.position", "none", () => ({
    text: "no position feed wired — research only, no execution", ok: false,
  }));

  // ---- capability statements ----------------------------------------------
  define("capability.ensemble", "none", () => ({
    text: "No public ensemble Cat-probability feed is wired, so no independent per-storm probability is published.",
    ok: false,
  }));
  /* Previously read "No recon coverage (remote basin / none tasked)" — which asserted
     a REASON we have no way to know. We do not ingest the feed; that is all we know. */
  define("capability.recon", "none", () => ({
    text: "No reconnaissance feed is wired — intensity rests on the advisory's satellite estimate",
    ok: false,
  }));
  /* Stated once, in one place, instead of four dead toggles on the map. */
  define("capability.notIngested", "none", () => ({
    text: "Not ingested: reconnaissance tracks · scatterometer winds · model-consensus tracks · SFMR surface winds",
    ok: false,
  }));
  /* Inactive is defined narrowly: the storm is absent from CurrentStorms.json. The
     tag makes no claim about dissipation or post-tropical status. */
  define("contract.subjectInactive", "nhc", () => ({
    text: "subject not in the active NHC feed",
    ok: false,
  }));
  /* No silent caps. If the ingest ceiling ever removes a market, the board says so
     instead of quietly showing a shorter list under an unchanged header. */
  define("markets.coverage", "markets", (s) => {
    const f = s.feeds.markets || {};
    if (!f.ok) return { text: "market feed unavailable this cycle", ok: false };
    const over = f.droppedForCap || 0;
    return {
      text: (f.count || 0) + " markets across " + (f.seriesKept || "?") + " series"
          + (over ? " · " + over + " BEYOND THE INGEST CEILING — not shown" : " · every qualifying market listed"),
      ok: over === 0,
    };
  });
  /* Drifted the moment L3 shipped: the board still read "it ignores ENSO, SSTs and
     season-to-date progress" after the ENSO layer was wired. State what the anchor
     actually conditions on, from the feeds. */
  define("model.caveat", "models", (s) => ({
    text: "MODEL = empirical HURDAT2 season-count climatology conditioned on day-of-year"
        + (okOf(s, "enso") ? " and ENSO phase" : "")
        + ". It has no in-season count feed and no SST term, and it is a baseline rather than a skill"
        + " forecast — treat EDGE as a reference spread, not alpha.",
    ok: okOf(s, "models"),
  }));
  /* The terminal's own deployment check, written into the repo by the CI job that
     drives a real browser against the public URL. Reported here so the last verdict
     is visible on the page rather than only in a build log. */
  define("deploy.verified", "derived", (s) => {
    const v = s.verify;
    if (!v || !v.ranAt) return { text: "no deployed-site check on record", ok: false };
    const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(v.ranAt)) / 60000));
    const ago = ageMin < 60 ? ageMin + "m" : Math.floor(ageMin / 60) + "h" + ("0" + (ageMin % 60)).slice(-2) + "m";
    return {
      text: v.ok
        ? `deployed site verified ${ago} ago — ${v.passed}/${v.total} checks in a real browser against ${v.url}`
        : `deployed-site check FAILED ${ago} ago — ${(v.failures || []).map((f) => f.check).join(", ") || "see the run log"}`,
      ok: !!v.ok,
    };
  });
  /* Macro context for the quiet-basin state. Every number here comes from a feed or
     from the HURDAT2 record; nothing is quoted from elsewhere. */
  define("macro.enso", "enso", (s) => {
    const e = s.enso;
    if (!e || !e.ok) return { text: "ENSO state unavailable", ok: false };
    const sign = e.anchorAnom >= 0 ? "+" : "";
    return {
      text: e.phaseLabel.toUpperCase() + " · ONI " + sign + Number(e.anchorAnom).toFixed(2)
          + " (" + e.anchorSeas + " " + e.anchorYear + (e.assumed ? ", ASO not yet observed" : "") + ")",
      ok: true,
    };
  });
  /* The honest form of a "genesis suppression" figure: measured from the same record
     the anchor uses, phrased as history rather than forecast. */
  define("macro.suppression", "models", (s) => {
    const c = s.enso && s.enso.climate;
    if (!c || !c.matched) return { text: "too few phase-matched seasons to characterise", ok: false };
    const m = c.matched, part = [];
    for (const [k, lbl] of [["namedstorms", "named storms"], ["hurricanes", "hurricanes"], ["major", "major"]]) {
      if (m[k] && m[k].phase != null) part.push(lbl + " " + m[k].phase + " vs " + m[k].all
        + " (" + (m[k].deltaPct > 0 ? "+" : "") + m[k].deltaPct + "%)");
    }
    const strong = c.strong
      ? " · strong-phase subset (|ONI| ≥ " + c.strongThreshold + ", n=" + c.strong.n + "): hurricanes "
        + c.strong.hurricanes.phase + " (" + (c.strong.hurricanes.deltaPct > 0 ? "+" : "") + c.strong.hurricanes.deltaPct + "%)"
      : " · strong-phase subset below the sample floor, not published";
    return {
      text: "MEDIAN SEASON, " + c.phaseLabel.toUpperCase() + " YEARS vs ALL (" + c.seasons + ", n=" + m.n + "): "
          + part.join(" · ") + strong,
      ok: true,
    };
  });
  /* Named because it is the accepted mechanism, and flagged because we do not measure
     it. Asserting "shear: elevated" from an ONI reading would be inventing an
     observation out of a correlation. */
  define("macro.mechanism", "none", () => ({
    text: "Mechanism is Atlantic vertical wind shear — NOT INGESTED here. The figures above are"
        + " an empirical count record, not a shear measurement and not a seasonal forecast.",
    ok: false,
  }));
  /* Pre-genesis areas. The percentages are NHC's own published formation forecasts,
     lifted verbatim — we attribute them and never convert them into anything else. */
  define("outlook.summary", "outlook", (s) => {
    const f = s.feeds.outlook || {};
    const areas = s.outlook || [];
    if (!f.ok) return { text: "genesis outlook unavailable this cycle", ok: false };
    if (!areas.length) {
      /* Zero areas has two very different causes and they must not read the same:
         the product saying formation is not expected, versus the parser failing to
         find headings it should have found. The fetch records which. */
      const susp = (f.attempts || []).filter((a) => a.quietOrUnparsed && /may be behind/.test(a.quietOrUnparsed));
      if (susp.length) return {
        text: "OUTLOOK PARSED 0 AREAS but the product does not say formation is unexpected — "
            + "treat the quiet-basin reading as unverified (" + susp.map((a) => a.source).join(", ") + ")",
        ok: false,
      };
      return { text: "No areas under NHC watch in either basin.", ok: true };
    }
    const atl = areas.filter((a) => a.basin === "atlantic");
    const top = areas.slice().sort((a, b) => (b.pct7d ?? 0) - (a.pct7d ?? 0))[0];
    return {
      text: areas.length + " area(s) under NHC watch (" + atl.length + " Atlantic) · highest 7-day "
          + (top.pct7d ?? "?") + "% — " + (top.id || top.title)
          + ". NHC formation probabilities, quoted as published.",
      ok: true,
    };
  });
  define("capability.positions", "none", () => ({
    text: "No position feed is wired — board level, not portfolio level.",
    ok: false,
  }));
  /* What the server-side pipeline genuinely re-runs on every tick. Anything listed
     here must correspond to a step in scripts/fetch-data.mjs. */
  define("action.automatic", "derived", (s) => ({
    text: "re-read NHC advisories · re-fetch the market ladder · recompute the climatology posterior"
        + (okOf(s, "enso") ? " and its ENSO stratification" : ""),
    ok: true,
  }));

  /* Edge book. Two claims, because the ranked list and the reason most of the board is
     absent from it are different statements with different owners. */
  define("edgebook.coverage", "models", (s) => {
    const cs = (window.MT && MT.contracts) || [];
    const anchored = cs.filter((c) => c.model != null).length;
    if (!cs.length) return { text: "no market ladder this cycle — nothing to rank", ok: false };
    return {
      text: anchored + " of " + cs.length + " contracts carry a climatology anchor; the remaining "
          + (cs.length - anchored) + " are unmodelled, which is not the same as unattractive",
      ok: anchored > 0,
    };
  });
  define("edgebook.method", "derived", (s) => ({
    text: "Ranked by verdict, then expected dollars: model probability against the price you would"
        + " pay to take the side, less the exchange fee, sized by Kelly and capped at the depth"
        + " actually resting. One rung per ladder — the rungs of a ladder are one view, not several.",
    ok: true,
  }));
  define("edgebook.verdict", "derived", () => ({
    text: "TAKE means every posterior layer agrees within 10 points, the edge is at least 1.5x the"
        + " spread, and there is real size resting. SMALL clears the edge but fails one of those."
        + " SUSPECT is a large edge whose own layers disagree — a climatology baseline that differs"
        + " from a traded market by 25 points while disagreeing with itself is more likely to be"
        + " missing something than to have found free money, so it sorts last and is not counted"
        + " in the expected total. AGREE is the spread between layers: smaller is more robust.",
    ok: true,
  }));
  define("edgebook.limits", "none", () => ({
    text: "The anchor is a count record, not a seasonal forecast, and there is no per-storm"
        + " intensity model. Depth is top-of-book only, so a stake larger than the first level"
        + " would move the price by an amount this does not estimate.",
    ok: false,
  }));

  define("edgebook.ladder", "derived", () => ({
    text: "A locked spread needs the ASK on the lower strike and the BID on the higher one."
        + " Exchange screens show a last trade or a mid, and on thin books those invert"
        + " constantly without being tradeable — so displayed inversions are listed"
        + " separately and are not opportunities.",
    ok: true,
  }));

  define("edgebook.exit", "markets", () => {
    const cs = (window.MT && MT.contracts) || [];
    const traps = (window.MTX && MTX.liquidityTraps) ? MTX.liquidityTraps().length : null;
    if (traps == null) return { text: "exit costs not computed this cycle", ok: false };
    return {
      text: traps + " of " + cs.length + " quoted contracts cannot be round-tripped: the spread or the"
          + " resting size means you pay the offer, get marked at the bid, and have nobody to sell back"
          + " to at size. Those are hold-to-expiry positions whatever the screen says.",
      ok: traps === 0,
    };
  });

  // ---- provenance footers --------------------------------------------------
  // source/latency/version/tier, each traced rather than typed.
  const FOOTERS = {
    "panel.evidence":  { owner: "nhc",      source: (s) => "NHC advisory + " + srcOf(s, "markets", "market") + " snapshot", tier: (s) => okOf(s, "nhc") ? "A" : "C" },
    "panel.confidence":{ owner: "derived",  source: (s) => "evidence-quality tiering over " + (s.evidence || []).length + " inputs", tier: () => "A" },
    "panel.attention": { owner: "derived",  source: () => "frame-diff register, prioritised", tier: () => "A" },
    "panel.exposure":  { owner: "derived",  source: () => "frame-diff × HURDAT2 anchor", tier: () => "B" },
    "panel.register":  { owner: "derived",  source: () => "frame-diff over committed history", tier: () => "A" },
    "panel.fairvalue": { owner: "models",   source: (s) => srcOf(s, "markets", "market") + " ladder × HURDAT2 baseline", tier: () => "C" },
    "panel.markets":   { owner: "markets",  source: (s) => srcOf(s, "markets", "market") + " prices · anchor = HURDAT2 climatology", tier: () => "C" },
    "panel.edge":      { owner: "models",   source: (s) => srcOf(s, "markets", "market") + " prices × HURDAT2 baseline", tier: () => "C" },
    "panel.edgebook":  { owner: "models",   source: (s) => srcOf(s, "markets", "market") + " executable prices × HURDAT2 baseline, net of fee", tier: () => "C" },
    "panel.orderbook": { owner: "markets",  source: (s) => okOf(s, "markets") ? srcOf(s, "markets") + " resting depth" : "exchange returned no depth", tier: () => "C" },
    "panel.observability": { owner: "derived", source: () => "feed results as returned this cycle", tier: () => "A" },
  };
  Object.keys(FOOTERS).forEach((id) => {
    const f = FOOTERS[id];
    define(id, f.owner, (s) => ({ text: f.source(s), tier: f.tier(s), ok: true }));
  });

  function claim(id, ctx) {
    const c = REG[id];
    if (!c) return { id, owner: "none", text: "UNREGISTERED CLAIM (" + id + ")", ok: false };
    try {
      const r = c.fn(state(ctx)) || {};
      return Object.assign({ id, owner: c.owner }, r);
    } catch (e) {
      return { id, owner: c.owner, text: "CLAIM ERROR", ok: false };
    }
  }

  /* Props for a ProvenanceFooter. Latency and version are derived, never typed:
     "version" is the snapshot the panel is actually reading, not a made-up semver. */
  function footer(id, ctx) {
    const s = state(ctx);
    const c = claim(id, ctx);
    const f = s.feeds[REG[id] && REG[id].owner] || {};
    const g = s.generatedAt;
    return {
      source: c.text,
      latency: f.latencyMs != null ? Math.round(f.latencyMs) + "ms" : freshness(ctx),
      version: g ? String(g).replace("T", " ").slice(0, 16) + "Z" : "—",
      tier: c.tier || "C",
    };
  }

  window.MTC = { claim, footer, freshness, snapshotAgeMin, registered: () => Object.keys(REG) };
})();
