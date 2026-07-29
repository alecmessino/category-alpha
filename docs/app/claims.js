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
    return { feeds: M._feeds || {}, evidence: M.evidence || [], generatedAt: M._generatedAt || null };
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
