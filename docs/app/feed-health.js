/* Millibar Terminal — FEED / CYCLE HEALTH. One rule for every operational source.
 *
 * Every feed on this board has two clocks and they used to be shown as one. VALID TIME is the
 * instant the source says its data is about (an advisory's issuance, a deck cycle's date-time
 * group, a SHIPS run, a satellite slot). FETCHED is when this pipeline read it. AGE is measured
 * from VALID TIME to the clock the reader is standing at — the live clock, or the replay cursor —
 * and it is judged against the source's EXPECTED CADENCE, because a six-hourly product that is
 * four hours old is on schedule and a ten-minute product that is four hours old is dead.
 *
 * The status words are the four the desk asked for, plus one for sources that have no cadence:
 *
 *   LIVE      inside one cadence plus a grace period       — what you would expect to have
 *   DELAYED   past the grace period, inside two cadences   — the next issue is late
 *   STALE     past two cadences                            — do not lean on it
 *   NO FEED   nothing valid was ever read this cycle       — absent, and shown as absent
 *   EVENT     no cadence exists (a plane flies when it is tasked; a satellite pass is an orbit)
 *             — the age is shown and no judgement is passed on it
 *
 * Pure, and loaded as a plain script so the terminal (no bundler) and the test (node, via vm)
 * read the same file. Nothing here touches window.MT; the caller hands it plain values, so a
 * frame's clock can be passed as easily as the live one.
 */
(function (root) {
  const MIN = 60000;

  /* Expected cadence per source, in minutes. Stated here once, and shown on the row, so a reader
     can see the bar a status was judged against rather than trusting the word. */
  const CADENCE = {
    advisory: 360,      // NHC full advisories: 03/09/15/21Z (intermediate 3-hourly under watches)
    guidance: 360,      // ATCF a-deck: 00/06/12/18Z synoptic cycles
    ships: 360,         // SHIPS text: each synoptic cycle
    outlook: 360,       // Tropical Weather Outlook: 00/06/12/18Z
    snapshot: 10,       // this pipeline's own tick
    markets: 10,        // read on the same tick
    satellite: 10,      // GOES full-disk slots
    recon: null,        // event-driven — an aircraft is tasked, or it is not
    ascat: null,        // event-driven — an orbit crosses the storm, or it does not
    sst: null,          // not wired
  };

  /* Grace beyond one cadence before a source reads DELAYED: a quarter of the cadence, never under
     fifteen minutes. The a-deck's aids land one to four hours after the cycle's date-time group,
     so a 90-minute grace on a 360-minute cadence is deliberately generous there and the row says
     what the bar was. */
  function graceFor(cadenceMin) { return cadenceMin == null ? null : Math.max(15, Math.round(cadenceMin * 0.25)); }

  function ms(x) { if (x == null) return null; const t = typeof x === "number" ? x : Date.parse(x); return Number.isFinite(t) ? t : null; }

  /**
   * @param {object} f
   *   f.ok          the feed answered this cycle (default: validZ present)
   *   f.validZ      ISO or ms — the source's own instant
   *   f.fetchedAt   ISO or ms — when the pipeline read it (optional)
   *   f.cadenceMin  minutes, or null for an event-driven source
   *   f.nowMs       the clock to judge against (live, or a frame's tsZ) — REQUIRED for a status
   */
  function classify(f) {
    const o = f || {};
    const now = ms(o.nowMs);
    const valid = ms(o.validZ);
    const fetched = ms(o.fetchedAt);
    const cadence = o.cadenceMin === undefined ? null : o.cadenceMin;
    const ok = o.ok === undefined ? valid != null : !!o.ok;
    const base = { validZ: valid == null ? null : new Date(valid).toISOString(),
      fetchedAt: fetched == null ? null : new Date(fetched).toISOString(),
      cadenceMin: cadence, graceMin: graceFor(cadence),
      ageMin: null, fetchAgeMin: null, ingestLagMin: null, expectedByZ: null, overdueMin: null };
    if (!ok || valid == null) return { ...base, status: "NO FEED", reason: ok ? "no valid time was read" : "the source did not answer" };
    if (now == null) return { ...base, status: "UNKNOWN", reason: "no clock to judge against" };
    /* A valid time in the FUTURE of the clock is a leak — the reader is standing at a moment
       before this data existed. Report it loudly; never clamp it to zero. */
    const ageMin = Math.round((now - valid) / MIN);
    const fetchAgeMin = fetched == null ? null : Math.round((now - fetched) / MIN);
    const ingestLagMin = fetched == null ? null : Math.round((fetched - valid) / MIN);
    const out = { ...base, ageMin, fetchAgeMin, ingestLagMin };
    if (ageMin < 0) return { ...out, status: "FUTURE", reason: "valid time is after the clock — not knowable at this moment" };
    if (cadence == null) return { ...out, status: "EVENT", reason: "event-driven source — age shown, no cadence to judge it against" };
    const grace = graceFor(cadence);
    const expectedBy = valid + cadence * MIN;
    out.expectedByZ = new Date(expectedBy).toISOString();
    out.overdueMin = Math.max(0, Math.round((now - expectedBy) / MIN));
    /* The stale line is two cadences, or one cadence plus two graces where the grace floor is
       what binds (a ten-minute tick with a fifteen-minute grace would otherwise be STALE before
       it was ever DELAYED). Stated on the row either way. */
    const staleAt = Math.max(2 * cadence, cadence + 2 * grace);
    out.staleAtMin = staleAt;
    if (ageMin <= cadence + grace) return { ...out, status: "LIVE", reason: "inside one cadence (" + cadence + " min) plus " + grace + " min grace" };
    if (ageMin <= staleAt) return { ...out, status: "DELAYED", reason: "past " + (cadence + grace) + " min, inside the " + staleAt + " min stale line — the next issue is late" };
    return { ...out, status: "STALE", reason: "past the " + staleAt + " min stale line" };
  }

  /* Short forms for a pill: "1h07m", "12m", "3d02h". */
  function fmtMin(m) {
    if (m == null || !Number.isFinite(m)) return "—";
    const a = Math.abs(m); const sign = m < 0 ? "−" : "";
    if (a < 60) return sign + a + "m";
    if (a < 48 * 60) return sign + Math.floor(a / 60) + "h" + ("0" + (a % 60)).slice(-2) + "m";
    return sign + Math.floor(a / 1440) + "d" + ("0" + Math.floor((a % 1440) / 60)).slice(-2) + "h";
  }
  function fmtZ(iso) {
    if (!iso) return "—";
    const d = new Date(iso); if (!Number.isFinite(d.getTime())) return "—";
    const p = (n) => (n < 10 ? "0" : "") + n;
    return p(d.getUTCDate()) + " " + ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()] + " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + "Z";
  }

  /* Tone for a status word. A design token name, resolved by the component. */
  const TONE = { LIVE: "pos", DELAYED: "warn", STALE: "neg", "NO FEED": "neg", EVENT: "info", UNKNOWN: "warn", FUTURE: "neg", OFF: "off" };

  /* The worst of several classifications — a board with three storms shows the storm that is
     furthest behind, because that is the one a reader would otherwise miss. */
  const RANK = { FUTURE: 6, "NO FEED": 5, STALE: 4, DELAYED: 3, UNKNOWN: 2, EVENT: 1, LIVE: 0, OFF: -1 };
  function worst(list) {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return null;
    return arr.reduce((a, b) => (RANK[b.status] > RANK[a.status]
      || (RANK[b.status] === RANK[a.status] && (b.ageMin ?? -1) > (a.ageMin ?? -1)) ? b : a), arr[0]);
  }
  /* The most recent of several — for EVENT sources, where one storm having a pass and another
     not having one is the normal condition, not a failure of the feed. */
  function latest(list) {
    const arr = (list || []).filter((x) => x && x.ageMin != null);
    if (!arr.length) return null;
    return arr.reduce((a, b) => (b.ageMin < a.ageMin ? b : a), arr[0]);
  }

  /* Build the board's rows from a plain model of what each feed reported. Every input is a value
     the caller extracted; this function never reads globals, so a frame can be passed in place of
     the live snapshot. */
  function rows(model) {
    const m = model || {};
    const now = m.nowMs;
    const each = (items, key, cadence) => (items || []).map((s) => classify({
      ok: s[key] != null, validZ: s[key], fetchedAt: s.fetchedAt || m.fetchedAt, cadenceMin: cadence, nowMs: now }));
    /* Scheduled sources: the storm furthest behind is the row. Event sources: the most recent
       event is the row, because "no aircraft in the other storm" is weather, not a feed fault. */
    const advisory = worst(each(m.storms, "advisoryIssuedZ", CADENCE.advisory));
    const guidance = worst(each(m.storms, "guidanceCycleIso", CADENCE.guidance));
    const ships = worst(each(m.storms, "shipsCycleIso", CADENCE.ships));
    const recon = latest(each(m.storms, "reconFixIso", CADENCE.recon));
    const ascat = latest(each(m.storms, "ascatIso", CADENCE.ascat));
    const snapshot = classify({ ok: !!m.generatedAt, validZ: m.generatedAt, fetchedAt: m.generatedAt, cadenceMin: CADENCE.snapshot, nowMs: now });
    const markets = classify({ ok: !!m.marketsOk, validZ: m.marketsOk ? m.generatedAt : null, fetchedAt: m.generatedAt, cadenceMin: CADENCE.markets, nowMs: now });
    const outlook = classify({ ok: !!m.outlookOk, validZ: m.outlookIssuedZ || (m.outlookOk ? m.generatedAt : null), fetchedAt: m.generatedAt, cadenceMin: CADENCE.outlook, nowMs: now });
    const satellite = classify({ ok: !!m.satelliteAt, validZ: m.satelliteAt, fetchedAt: null, cadenceMin: m.satelliteDaily ? 1440 : CADENCE.satellite, nowMs: now });
    const off = (label) => ({ status: "OFF", reason: label, validZ: null, fetchedAt: null, cadenceMin: null, ageMin: null });
    const empty = (label) => ({ status: "NO FEED", reason: label, validZ: null, fetchedAt: null, cadenceMin: null, ageMin: null });
    return [
      { k: "ADV",   name: "NHC advisory",           h: advisory || empty("no active system"),   cadenceMin: CADENCE.advisory },
      { k: "GUID",  name: "ATCF guidance deck",     h: guidance || empty("no deck read"),        cadenceMin: CADENCE.guidance },
      { k: "SHIPS", name: "SHIPS diagnostics",      h: ships || empty("no SHIPS run read"),      cadenceMin: CADENCE.ships },
      { k: "RECON", name: "Aircraft reconnaissance", h: recon || empty("no fix on record"),      cadenceMin: null },
      { k: "SCAT",  name: "Scatterometer pass",     h: ascat || empty("no pass on record"),      cadenceMin: null },
      { k: "SAT",   name: "Satellite imagery",      h: satellite,                                cadenceMin: m.satelliteDaily ? 1440 : CADENCE.satellite },
      { k: "MKT",   name: "Prediction markets",     h: markets,                                  cadenceMin: CADENCE.markets },
      { k: "TWO",   name: "Tropical Weather Outlook", h: outlook,                                cadenceMin: CADENCE.outlook },
      { k: "SNAP",  name: "Pipeline snapshot",      h: snapshot,                                 cadenceMin: CADENCE.snapshot },
      { k: "SST",   name: "SST anomaly",            h: off("not wired"),                         cadenceMin: null },
    ];
  }

  const api = { CADENCE, graceFor, classify, rows, worst, latest, fmtMin, fmtZ, TONE, RANK };
  root.MTFeedHealth = api;
})(typeof window !== "undefined" ? window : globalThis);
