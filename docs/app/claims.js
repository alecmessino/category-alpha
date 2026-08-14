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
  define("pipeline.features", "nhc", (s) => {
    const bits = ["wind", "pressure", "track", "reconstructed cone"];
    if (okOf(s, "atcf")) bits.push("guidance consensus");
    if (s.feeds.recon && s.feeds.recon.count) bits.push("recon fix");
    if (okOf(s, "ships")) bits.push("shear", "ocean heat", "potential intensity");
    if (s.feeds.ascat && s.feeds.ascat.count) bits.push("scatterometer wind");
    return { text: okOf(s, "nhc") ? bits.join(" · ") : "no active system", ok: okOf(s, "nhc") };
  });
  /* The tier means something specific now and the row says what: whether the storm's
     present intensity was measured by an aircraft or estimated from a satellite. */
  define("pipeline.confidence", "derived", (s) => ({
    text: "evidence-quality tiering (not forecast confidence) — HIGH requires a measured initial condition"
        + (s.feeds.recon && s.feeds.recon.count ? "" : ", and no aircraft is reporting"),
    ok: true,
  }));
  /* The row that drifted. It is a climatology anchor and, when the ONI feed is up, an
     ENSO stratification of that anchor. It has never been an ensemble. */
  /* The row that drifted, corrected a second time — in the other direction. It described
     a climatology anchor and nothing else, which stopped being the whole truth the moment
     the guidance decks and recon started feeding a per-storm estimate. Two anchors of
     different kinds now share this stage and the row names both, because a reader who
     believes a seasonal base rate is pricing an active storm is being misled by omission
     as surely as by invention. */
  define("pipeline.probability", "models", (s) => {
    const seasonal = okOf(s, "models")
      ? "HURDAT2 climatology anchor" + (okOf(s, "enso") ? " + ENSO stratification" : "")
      : null;
    const perStorm = okOf(s, "atcf")
      ? "per-storm: official forecast + ATCF consensus"
        + (s.feeds.recon && s.feeds.recon.count ? " + aircraft recon" : "")
      : null;
    const bits = [seasonal, perStorm].filter(Boolean);
    return {
      text: bits.length ? bits.join(" · ") + " — no ensemble feed" : "no climatology anchor and no guidance decks",
      ok: bits.length > 0,
    };
  });
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
  /* This claim has been wrong twice in opposite directions. It first asserted a REASON
     the board could not know ("remote basin / none tasked"). It then asserted that no
     recon feed was wired, which was true until the products were polled and is now the
     stale half of the same mistake — a capability statement outliving the code it
     describes. It is a function of the fetch result, so it can only ever say what this
     cycle actually found. */
  define("capability.recon", "recon", (s) => {
    const f = s.feeds.recon || {};
    if (!f.ok) return { text: "Reconnaissance products unreachable this cycle — intensity rests on the advisory's satellite estimate", ok: false };
    if (!f.count) return { text: "Reconnaissance polled, no aircraft reporting on an active system — intensity rests on the advisory's satellite estimate", ok: true };
    return { text: "Aircraft reconnaissance in hand — the storm's intensity is measured rather than estimated", ok: true };
  });
  /* Stated once, in one place, instead of four dead toggles on the map. Two of the four
     things this row used to list are now ingested, so it lists what is genuinely still
     absent and names what replaced the rest. Shrinking this list is the only honest way
     to shorten it. */
  define("capability.notIngested", "none", (s) => {
    const have = [];
    if (okOf(s, "recon")) have.push("aircraft reconnaissance");
    if (okOf(s, "atcf")) have.push("model-consensus tracks");
    if (s.feeds.ascat && s.feeds.ascat.count) have.push("scatterometer winds");
    return {
      text: "Not ingested: SFMR flight-level wind traces · radar reflectivity · ensemble Cat-probability feeds"
          + (have.length ? " — now ingested: " + have.join(" · ") : ""),
      ok: false,
    };
  });
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

  /* The honest answer to "are you reading these the moment they are released": no, and
     here is the measured number instead of a claim. */
  define("advisory.latency", "nhc", (s) => {
    const f = s.feeds.nhc || {};
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const lags = storms.map((x) => x.advisoryLagMin).filter((v) => v != null);
    if (!f.ok) return { text: "advisory feed unavailable this cycle", ok: false };
    if (!lags.length) return { text: "no advisory issuance time parsed — ingestion lag unmeasured", ok: false };
    const worst = Math.max(...lags);
    return {
      text: "Advisory ingestion lag " + worst + " min at fetch: the pipeline POLLS every ~10 minutes,"
          + " it is not notified on release. Expected staleness is half the poll interval plus the"
          + " scheduler's own delay, and this is the measured figure rather than a claim about speed.",
      ok: worst <= 20,
    };
  });
  define("advisory.forecast", "nhc", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const withP = storms.filter((x) => x.hurricaneP && x.hurricaneP.p != null);
    if (!storms.length) return { text: "no active system carrying an official forecast", ok: false };
    if (!withP.length) return { text: "no forecast intensity parsed from the advisory this cycle", ok: false };
    return {
      text: withP.map((x) => x.name + " " + Math.round(x.hurricaneP.p * 100) + "% to reach hurricane strength").join(" · ")
          + " — from the official NHC forecast intensity widened by NHC's own published forecast error."
          + " This is a deterministic forecast with an error bar, not a calibrated ensemble, and it is a"
          + " different kind of estimate from the season-count anchors. It holds no information the"
          + " market has not also read — it repackages a public product — so it cannot be expected to"
          + " beat a price set by people looking at the same advisory. Where its own range straddles"
          + " the price, the board reports no edge rather than the middle of the range.",
      ok: true,
    };
  });
  define("advisory.watches", "nhc", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const w = storms.filter((x) => x.watches && x.watches.highest);
    if (!w.length) return { text: "no watch or warning in effect for any active system", ok: true };
    return {
      text: w.map((x) => x.name + ": " + x.watches.highest
        + (x.watches.inEffect[0] ? " for " + x.watches.inEffect[0].areas.join(", ") : "")).join(" · ")
        + " — advisories move to the 3-hourly intermediate cycle while any watch or warning is up.",
      ok: true,
    };
  });

  /* The forecaster's own statement about where the official intensity forecast sits
     inside the guidance envelope. This board's P(reaches hurricane) is built ON that
     forecast, so the position is not trivia — it is the direction of the bias in a
     number an operator sizes a position from. Quoted, never converted into an
     adjustment: there is no defensible way to turn "near the upper end" into a number
     of knots, and inventing one would be worse than saying it plainly. */
  define("advisory.guidance", "nhc", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const g = storms
      .map((x) => ({ name: x.name, g: x.discussion && x.discussion.guidance && x.discussion.guidance.intensity }))
      .filter((x) => x.g && x.g.position !== "with");
    if (!g.length) return { text: "no intensity-guidance position stated in the discussion", ok: true };
    return {
      text: g.map((x) => x.name + ": NHC places its own intensity forecast " + x.g.position
        + " the guidance envelope, so the probability above — which is derived from that forecast — leans the same way").join(" · "),
      ok: true,
    };
  });
  define("advisory.discussion", "nhc", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const d = storms.filter((x) => x.discussion);
    if (!d.length) return { text: "no forecast discussion ingested for any active system", ok: false };
    const lags = d.map((x) => x.discussion.lagMin).filter((v) => v != null);
    return {
      text: "Tropical Cyclone Discussion read for " + d.length + " system" + (d.length === 1 ? "" : "s")
        + (lags.length ? " · " + Math.max(...lags) + "m old at fetch" : "")
        + " — quoted verbatim, not scored",
      ok: true,
    };
  });

  /* The one place on this board where prose moves a number, and the fraction that does
     it is an OPERATOR SETTING — declared by a human, not observed. NHC publishes the
     position in words and never a magnitude, so no feed can produce this; the owner class
     exists for exactly that. Registered here so the constant, its direction rule and its
     unadjusted counterpart are all one click from the number they change. */
  define("model.guidanceTilt", "operator", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const adj = storms.map((x) => ({ name: x.name, a: x.hurricaneP && x.hurricaneP.adjustment }))
      .filter((x) => x.a);
    const rule = "The discussion's placement of the official intensity forecast inside the guidance"
      + " envelope displaces the forecast peak by 0.25 of that lead time's published mean absolute"
      + " error, in the stated direction only. The fraction is an operator setting, not an"
      + " observation — NHC states the position in words and never a magnitude. The unadjusted"
      + " estimate is published alongside and the reported band is widened to contain it, so the"
      + " tilt can never move the answer outside what the plain arithmetic reaches.";
    if (!adj.length) return { text: rule + " No active system has a stated position, so nothing is tilted.", ok: true };
    return {
      text: adj.map((x) => x.name + ": peak read " + Math.abs(x.a.shiftKt).toFixed(1) + " kt "
        + (x.a.shiftKt < 0 ? "lower" : "higher") + " (" + Math.round(x.a.raw * 100) + "% unadjusted → "
        + Math.round((x.a.raw + x.a.delta) * 100) + "%)").join(" · ") + " — " + rule,
      ok: true,
    };
  });

  /* Advisory age is a model input, not a status light. An anchor built on a product that
     has been superseded but not yet fetched is a stale forecast wearing a current
     timestamp, so the ranking grades on it and this states the thresholds it grades by. */
  define("advisory.lag", "nhc", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const at = (x) => (typeof x.advisoryLagMin === "function" ? x.advisoryLagMin(window.MT.FRAMES - 1) : x.advisoryLagMin);
    const lags = storms.map((x) => ({ name: x.name, lag: at(x) })).filter((x) => x.lag != null);
    const rule = "Past half an advisory cycle (180 min) a storm anchor cannot grade TAKE; past a"
      + " full cycle (360 min) it is not priced at all.";
    if (!lags.length) return { text: "no advisory age measured for any active system. " + rule, ok: false };
    return {
      text: lags.map((x) => x.name + " " + x.lag + "m at fetch").join(" · ") + " — " + rule,
      ok: lags.every((x) => x.lag <= 180),
    };
  });

  /* The hard rule, stated where the grade it produces can be checked against it. This is
     a claim about the PRODUCT, not the estimate — which is why it is not a demotion to
     SMALL and not an accusation of SUSPECT, and why no amount of edge argues against it. */
  define("edgebook.hold", "nhc", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const NF = (window.MT ? window.MT.FRAMES : 1) - 1;
    const at = (x) => (typeof x.advisoryLagMin === "function" ? x.advisoryLagMin(NF) : x.advisoryLagMin);
    const cyc = (window.MT && (MT.contracts || []).find((c) => Number.isFinite(c.modelMaxLagMin)));
    const cycle = cyc ? cyc.modelMaxLagMin : 360;
    const held = storms.map((x) => ({ name: x.name, lag: at(x) }))
      .filter((x) => x.lag != null && x.lag > cycle / 2);
    const rule = "Past " + (cycle / 2) + " minutes the next advisory is likelier out than not, so the"
      + " forecast on screen may already have been superseded by one nobody here has fetched."
      + " Every contract anchored on that storm is graded HOLD regardless of its edge,"
      + " agreement or resting depth, and is excluded from the staked and expected totals."
      + " Past " + cycle + " minutes the anchor is withdrawn and the contract is not priced at all.";
    if (!held.length) return { text: "no active system is past the " + (cycle / 2) + "-minute line. " + rule, ok: true };
    return {
      text: held.map((x) => x.name + " is " + x.lag + "m old — its contracts are on HOLD").join(" · ")
        + ". " + rule,
      ok: false,
    };
  });

  /* ---- the four pre-advisory feeds ------------------------------------------------
     Each of these is a capability statement about something this build now DOES ingest,
     which is exactly the category that has drifted before. They are functions of the
     fetch result, so a feed that goes down changes the sentence rather than leaving a
     confident claim standing over a dead pipe. */

  /* Priority 1. The head start is a claim about TIMING, so it is stated as one and it is
     stated conditionally: the deck is ahead of the advisory when it is fresher than the
     advisory, and the board can check that rather than assert it. */
  define("intel.atcf", "atcf", (s) => {
    const f = s.feeds.atcf || {};
    if (!f.ok) return { text: "ATCF guidance decks unavailable this cycle — the board is back to the advisory the market has already read: " + (f.note || "no detail"), ok: false };
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const NF = (window.MT ? window.MT.FRAMES : 1) - 1;
    const rows = storms.map((x) => ({
      name: x.name,
      kt: typeof x.conKtAt === "function" ? x.conKtAt(NF) : null,
      age: typeof x.conAgeAt === "function" ? x.conAgeAt(NF) : null,
      lag: typeof x.advisoryLagMin === "function" ? x.advisoryLagMin(NF) : null,
    })).filter((x) => x.kt != null);
    if (!rows.length) return { text: "ATCF decks read, but no consensus aid for any active system this cycle", ok: false };
    return {
      text: rows.map((r) => r.name + " consensus peak " + r.kt + " kt"
        + (r.age != null ? " from a deck " + r.age + "m old" : "")
        + (r.age != null && r.lag != null
            ? (r.age < r.lag ? " — AHEAD of the advisory by " + (r.lag - r.age) + "m" : " — the advisory has caught up")
            : "")).join(" · "),
      ok: true,
    };
  });

  /* Priority 2. The distinction this claim exists to hold: measured versus estimated. */
  define("intel.recon", "recon", (s) => {
    const f = s.feeds.recon || {};
    if (!f.ok) return { text: "reconnaissance products unreachable this cycle — no aircraft measurement available", ok: false };
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const NF = (window.MT ? window.MT.FRAMES : 1) - 1;
    const fixes = storms.map((x) => ({
      name: x.name,
      age: typeof x.reconAge === "function" ? x.reconAge(NF) : null,
      mb: typeof x.reconMbAt === "function" ? x.reconMbAt(NF) : null,
      kt: typeof x.reconKtAt === "function" ? x.reconKtAt(NF) : null,
    })).filter((x) => x.age != null);
    if (!fixes.length) {
      return { text: (f.count === 0 ? "all " + (f.polled || 4) + " reconnaissance products polled and no aircraft is reporting on an active system"
                                    : "reconnaissance messages received, none for a currently active system")
                   + " — intensity rests on the advisory's satellite estimate", ok: true };
    }
    return {
      text: fixes.map((x) => x.name + " measured by aircraft " + x.age + "m ago"
        + (x.mb != null ? " at " + x.mb + " mb" : "") + (x.kt != null ? ", " + x.kt + " kt surface" : "")).join(" · ")
        + " — measured, not estimated",
      ok: true,
    };
  });

  /* Priority 3. The scoring gate is the claim. Whether SHIPS moves a price is an operator
     decision, and this is where the operator's decision is recorded. */
  define("intel.ships", "ships", (s) => {
    const f = s.feeds.ships || {};
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const scored = storms.some((x) => x.hurricanePCal && x.hurricanePCal.shipsScoring);
    if (!f.ok) return { text: "SHIPS diagnostics unavailable this cycle — no shear, ocean heat or RI table: " + (f.note || ""), ok: false };
    const NF = (window.MT ? window.MT.FRAMES : 1) - 1;
    const rows = storms.map((x) => ({
      name: x.name,
      shear: typeof x.shearAt === "function" ? x.shearAt(NF) : null,
      ohc: typeof x.ohcAt === "function" ? x.ohcAt(NF) : null,
      mpi: typeof x.mpiAt === "function" ? x.mpiAt(NF) : null,
      ri: typeof x.riAt === "function" ? x.riAt(NF) : null,
    })).filter((x) => x.shear != null || x.ri != null);
    return {
      text: (rows.length
        ? rows.map((r) => r.name + " shear " + (r.shear ?? "—") + " kt, ocean heat " + (r.ohc ?? "—")
            + ", potential intensity " + (r.mpi ?? "—") + " kt"
            + (r.ri != null ? ", rapid-intensification floor " + Math.round(r.ri * 100) + "%" : "")).join(" · ")
        : "SHIPS read, no features for an active system")
        + " — features are published and "
        + (scored ? "ARE scored into the probability under an active operator claim." : "are NOT scored into any probability. No feature here moves a price until that is claimed."),
      ok: true,
    };
  });

  /* Priority 4. Intermittent is the normal state, and saying so is the whole claim —
     otherwise an empty cycle reads as a broken feed. */
  define("intel.ascat", "ascat", (s) => {
    const f = s.feeds.ascat || {};
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const NF = (window.MT ? window.MT.FRAMES : 1) - 1;
    const rows = storms.map((x) => ({
      name: x.name,
      kt: typeof x.ascatKtAt === "function" ? x.ascatKtAt(NF) : null,
      age: typeof x.ascatAgeAt === "function" ? x.ascatAgeAt(NF) : null,
      used: !!(x.hurricanePCal && x.hurricanePCal.ascatUsed),
    })).filter((x) => x.kt != null);
    if (!rows.length) return { text: "no scatterometer pass over an active system — passes are orbits, not a continuous feed, and a cycle without one is the normal state", ok: true };
    return {
      text: rows.map((r) => r.name + " " + r.kt + " kt objective surface wind"
        + (r.age != null ? " from a pass " + Math.round(r.age / 60) + "h ago" : "")
        + (r.used ? " — tightening the current-intensity band" : " — not tightening the band")).join(" · ")
        + ". A pass never moves the estimate, only its width.",
      ok: true,
    };
  });

  /* ---- THE CONFLICT RULE ------------------------------------------------------------
   * What happens when the guidance deck and the aircraft disagree.
   *
   * This is the last piece of the engine that was implemented in code and owned by
   * nobody, which is precisely the shape of the three drifts this registry exists to
   * prevent — a rule that decides a price, described only in a comment, where no feed can
   * contradict it and no reader can check it.
   *
   * THE RULE, and the reason it is not a weighting:
   *
   *   A consensus peak and an aircraft fix are NEVER AVERAGED, because they do not answer
   *   the same question. The deck forecasts what the storm WILL PEAK AT; the aircraft
   *   measures what it IS RIGHT NOW. Averaging them would be a category error dressed up
   *   as caution — the arithmetic would run and the number would mean nothing.
   *
   *   So the apparent conflict is resolved BY CONSTRUCTION rather than by a weight. Every
   *   forecast on this board is anchored on an initial intensity, and the aircraft has
   *   just measured that initial intensity. The measured difference is applied to the
   *   whole forecast curve — the deck's peak and the official peak alike — because a
   *   forecast built on an initial condition that has since been measured wrong is wrong
   *   by roughly that amount all the way along.
   *
   *   NEITHER CAN VETO THE OTHER. The deck keeps its shape and its weight in the blend;
   *   the fix keeps its full measured difference, undamped. There is no tunable parameter
   *   between them, which is the point: there is nothing here to fit.
   *
   *   The published answer is then the LARGER of two probabilities — the corrected
   *   forecast peak clearing the strike, or the measured current intensity already
   *   clearing it — because reaching a threshold now implies reaching it at some point.
   *
   * The one thing this claim must never let slide: the correction is a SHIFT, so it moves
   * the estimate without narrowing it. A disagreement between the deck and the aircraft is
   * not evidence that either is sharper. */
  define("model.conflict", "recon", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const rule = "A guidance consensus and an aircraft fix are never averaged: the deck forecasts the peak,"
      + " the aircraft measures the present, and the measured difference is applied to the forecast curve"
      + " rather than weighed against it. Neither can veto the other, there is no tunable weight between"
      + " them, and the correction shifts the estimate without narrowing it.";
    const rows = [];
    for (const s of storms) {
      const c = s.hurricanePCal;
      if (!c || !c.ok) continue;
      const deckKt = s.consensus ? s.consensus.peakKt : null;
      const shifted = (c.sources || []).find((x) => x.id === "consensus");
      const measured = s.recon && s.recon.ok ? s.recon.intensityKt : null;
      const d = c.reconDeltaKt;
      if (c.used.consensus && c.used.recon && d != null) {
        /* Both in hand: state the deck's own peak, the measurement that moved it, and
           where it entered the blend — raw and corrected, side by side, for the same
           reason every other pair on this board is. */
        rows.push(s.name + ": the deck peaks at " + deckKt + " kt and the aircraft measured "
          + measured + " kt against the advisory's " + Math.round((measured - d) * 10) / 10 + " kt"
          + (Math.abs(d) < 0.05
              ? " — the fix confirms the advisory, so the deck enters uncorrected"
              : ", so the whole curve is read " + Math.abs(d) + " kt "
                + (d < 0 ? "lower" : "higher") + " and the deck's peak enters at "
                + (shifted ? shifted.peakKt : "—") + " kt")
          + ". Answer driven by the " + c.drivenBy + ".");
      } else if (c.used.consensus) {
        rows.push(s.name + ": the deck peaks at " + deckKt + " kt with no aircraft fix to correct it"
          + (s.recon && s.recon.ok ? " (a fix exists but was not applied — see the refusals above)" : "")
          + ". Answer driven by the " + c.drivenBy + ".");
      } else if (c.used.recon) {
        rows.push(s.name + ": an aircraft measured " + measured + " kt and no guidance deck was usable"
          + " this cycle, so the correction is applied to the official forecast alone."
          + " Answer driven by the " + c.drivenBy + ".");
      } else {
        rows.push(s.name + ": neither a usable deck nor an aircraft fix — the official forecast stands alone.");
      }
    }
    if (!rows.length) return { text: rule + " No active system is being calibrated, so nothing is in conflict.", ok: true };
    return { text: rows.join(" ") + " " + rule, ok: true };
  });

  /* Where the published number comes from, in one line, per storm. This is the claim that
     makes "raw and calibrated, side by side" enforceable rather than aspirational: if the
     engine ever stopped publishing both, this sentence could not be written. */
  define("intel.calibration", "atcf", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const rows = storms.map((x) => x.hurricanePCal).filter(Boolean);
    if (!rows.length) return { text: "no per-storm probability is being calibrated — the official-forecast estimate stands alone", ok: false };
    return {
      text: rows.map((c) => {
        const used = Object.entries(c.used).filter(([, v]) => v).map(([k]) => k);
        return "raw " + Math.round(c.pRaw * 100) + "% → calibrated " + Math.round(c.p * 100) + "%"
          + " from " + (used.join(" + ") || "nothing")
          + " (combined peak " + c.meanKt + " kt, ±" + c.sigmaKt + " of which " + c.tauKt + " kt is measured disagreement)";
      }).join(" · "),
      ok: true,
    };
  });

  define("wind.field", "wind", () => {
    const w = window.MT && MT._wind;
    if (!w) return { text: "no surface wind field ingested this cycle", ok: false };
    const ageH = Math.round((Date.now() - Date.parse(w.cycleZ)) / 3600e3);
    return {
      text: w.source + " · " + w.grid.nx + "x" + w.grid.ny + " vectors at " + w.grid.dx + "\u00b0 · cycle "
          + w.cycleZ.replace("T", " ").replace(":00:00Z", "Z") + " (" + ageH + "h old). This is a MODEL"
          + " ANALYSIS, not an observation — a different class of thing from an advisory. GFS runs four"
          + " times a day, so the field is refreshed on that cadence and not on the board's.",
      ok: true,
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
    "panel.storms":    { owner: "nhc",       source: (s) => srcOf(s, "nhc", "NHC") + " advisory · forecast intensity and watches as published", tier: (s) => okOf(s, "nhc") ? "A" : "C" },
    "panel.edgebook":  { owner: "models",   source: (s) => srcOf(s, "markets", "market") + " executable prices × HURDAT2 baseline, net of fee", tier: () => "C" },
    "panel.orderbook": { owner: "markets",  source: (s) => okOf(s, "markets") ? srcOf(s, "markets") + " resting depth" : "exchange returned no depth", tier: () => "C" },
    "panel.observability": { owner: "derived", source: () => "feed results as returned this cycle", tier: () => "A" },
  };
  Object.keys(FOOTERS).forEach((id) => {
    const f = FOOTERS[id];
    define(id, f.owner, (s) => ({ text: f.source(s), tier: f.tier(s), ok: true }));
  });

  /* ---- notes: the explanations, moved out of the panels ---------------------
     Every panel used to carry a paragraph of caveat under it, permanently on screen
     whether or not anyone was asking. That is where a third of the page height went,
     and it read as a wall. The text is not dropped — deleting a caveat is how a board
     starts implying coverage it does not have — it moves behind a "?" on the panel it
     qualifies, and it lives HERE, next to the claims it is a caveat about, so it
     cannot drift away from what the code actually does.

     `body` is an array of short lines, not a paragraph, because a caveat that has to
     be read as prose does not get read. */
  const note = (id, owner, title, body) =>
    define(id, owner, (s) => ({ text: title, title, body: typeof body === "function" ? body(s) : body, ok: true }));

  note("note.exposure", "derived", "Board level, not portfolio level", () => [
    "No position feed is wired, so this cannot know what you hold.",
    "It reports what repriced on the board and how the spread to the anchor moved.",
    "Anchor is a HURDAT2 climatology baseline — a base rate, not a skill forecast.",
  ]);
  note("note.markets", "markets", "Where these prices come from", (s) => [
    srcOf(s, "markets", "the exchange") + " order book, taken at the touch.",
    "The same contracts appear in Coinbase Predictions, which is Kalshi-powered, so quotes should track.",
    "Model % is a climatology anchor. A blank means no anchor exists for that contract, not a 50/50.",
  ]);
  note("note.orderbook", "markets", "One level per side", [
    "This is the size the exchange will fill at the touch, not a depth curve.",
    "The full book is fetched for a handful of contracts; everything else shows the touch.",
    "FILLABLE NOW caps the Kelly allocation — sizing above resting depth is a number you cannot trade.",
  ]);
  note("note.observability", "derived", "What this table is", [
    "Feed results exactly as this cycle's fetch returned them.",
    "A field the feed did not return is omitted, never filled in with a plausible value.",
  ]);
  note("note.genesis", "outlook", "Systems with no advisory yet", [
    "NHC formation probabilities, quoted as published.",
    "These are not classified cyclones, so they carry no advisory, track or cone.",
    "CurrentStorms.json is silent on them by design — that is not a gap in ingestion.",
  ]);
  note("note.register", "derived", "How an event gets in here", [
    "A frame-to-frame diff over committed snapshots, at fixed thresholds: wind ≥5 kt, pressure ≥2 mb, price ≥2¢.",
    "TRADE-RELEVANT = a Saffir–Simpson boundary crossing, ≥20 kt intensification, or a ≥5¢ reprice.",
    "Co-movement is temporal only. No causal weight is computed, because nothing here can establish one.",
  ]);
  note("note.lifecycle", "derived", "Read this as interpretation", [
    "The stage is inferred from the advisory, not stated by it.",
    "Research only — no execution, no advice.",
  ]);
  note("note.posterior", "models", "What the stack does and does not use", [
    "Layers are applied in order; each shrinks toward the one above it by effective sample size.",
    "An unwired layer is declared, never folded in silently.",
    "Day-of-year conditioning still assumes zero Atlantic hurricanes to date — real once an in-season count feed exists.",
  ]);
  note("note.edgebook", "models", "How this is ranked", [
    "Ranked by expected value after the exchange fee, not by raw edge.",
    "Model range is the estimator's own band. Price inside the band = the estimate cannot separate it from fair.",
    "Stake is Kelly, capped at resting depth, so it is never a size you could not get filled at.",
    "TAKE needs ≥3 independent layers agreeing. Two layers where one is a shrunk form of the other is one layer.",
    "It cannot forecast. Every anchor is a base rate plus what the advisory already published.",
  ]);
  /* The engine's own account of itself, per storm: what it combined, what it refused,
     and why. Authored here rather than in the panel because it is a statement about what
     the code did, and this file is the only place such a statement may be made. */
  note("note.intel", "atcf", "How the calibrated number was built", () => {
    const storms = (window.MT && MT.storms) ? Object.values(MT.storms) : [];
    const out = [];
    for (const s of storms) {
      const c = s.hurricanePCal;
      if (!c) { out.push(s.name + ": no calibrated probability — the official forecast estimate stands alone."); continue; }
      out.push(s.name + ": " + c.basis);
      for (const n of (c.notes || [])) out.push(s.name + " — " + n);
    }
    if (!out.length) out.push("No active system, so nothing is being calibrated.");
    /* The conflict rule is composed in rather than restated, so the drawer and the rule's
       own claim can never drift into two different accounts of the same arithmetic. */
    out.push(claim("model.conflict").text);
    out.push("The scatterometer never moves the estimate, only the width of its band, and only when no aircraft is in the storm.");
    out.push("SHIPS features are published on every cycle and score into a probability only under an operator claim.");
    return out;
  });

  note("note.provenance", "derived", "Content-addressed and bitemporal", [
    "Each input is an immutable event keyed by an FNV-1a digest of its content.",
    "A correction arrives as a new row at a higher revision. Nothing is edited in place.",
  ]);

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
