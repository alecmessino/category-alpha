/* THE CALIBRATION LEDGER — does the published probability actually happen?
 *
 * Until now nothing on this board has ever been scored. Every probability it has
 * published has vanished unmeasured, which means "calibrated" has been a claim about the
 * construction of the arithmetic rather than about its results. Those are different
 * claims, and only one of them is worth money.
 *
 * The ground truth was already being ingested. A b-deck is NHC's best track: it says what
 * the storm actually did. For "will X become a hurricane", the outcome is simply whether
 * any best-track record ever carried 65 kt.
 *
 * WHAT IS SCORED, and why three of them side by side:
 *
 *   pCal     the calibrated probability the board publishes
 *   pRaw     the untouched official-forecast estimate
 *   pMarket  the contract price at the same moment
 *
 * Scoring pCal alone would say whether the board is any good. Scoring it against pRaw says
 * whether the CALIBRATION is any good — whether the decks and the aircraft added anything,
 * or whether four feeds of machinery has been decorating a number the advisory already
 * gave us. Scoring both against pMarket says whether there is an edge at all, which is the
 * only question that pays.
 *
 * ------------------------------------------------------------------------------------
 * THE TRAP THIS FILE EXISTS TO AVOID, AND IT IS A BIG ONE
 *
 * Forecasts for the same storm are NOT INDEPENDENT. A storm that becomes a hurricane makes
 * every one of the forty entries recorded during its life "correct", and a storm that does
 * not makes all forty "wrong". Counting entries would let three storms report n=400 and a
 * beautiful Brier score, and that number would be worth exactly nothing — it would measure
 * three coin flips and quote them to three decimal places.
 *
 * So every refusal threshold in this file counts DISTINCT RESOLVED STORMS, never entries.
 * Entries are reported too, because the gap between the two numbers is itself the warning.
 *
 * That is the whole reason this is worth building carefully rather than quickly: a
 * miscalibrated calibration report is worse than none, because it would be believed.
 * ------------------------------------------------------------------------------------
 *
 * PURE — no network, no clock beyond what is passed in.
 */

/* A season or two of storms. Below this, a Brier score is a description of a handful of
 * coin flips and must not be published as a property of the engine. The counts are always
 * published so progress toward it is visible; only the SCORE is withheld. */
export const MIN_RESOLVED_STORMS = 10;
/* A reliability curve slices the sample into bins, so each bin needs its own support. It
 * needs far more than a headline score and is refused for far longer. */
export const MIN_RELIABILITY_STORMS = 30;
/* The threshold the per-storm question resolves on. Best-track intensities come in 5 kt
 * steps, so a hurricane is a reported 65 kt — the same constant the estimator uses. */
export const HURRICANE_REPORTED_KT = 65;

/* Identity of a forecast. A forecast is a distinct thing when the STATE it was built on
 * changes: a new advisory, or a new guidance cycle. Re-reading the same two products ten
 * minutes later is the same forecast, and recording it again would inflate the sample with
 * copies of itself — the independence trap arriving by a second route. */
export function forecastKey(e) {
  if (!e || !e.stormId) return null;
  return [e.stormId, e.question || "hurricane", e.advNum || "?", e.conCycle || "?"].join("|");
}

/* Build a ledger entry from one storm's published state. Returns null when there is no
   probability to score — an unpriced storm is not a forecast. */
export function entryFrom(storm, opts) {
  const o = opts || {};
  if (!storm || !storm.stormId) return null;
  if (storm.pCal == null && storm.pRaw == null) return null;
  const e = {
    stormId: storm.stormId,
    name: storm.name || storm.stormId,
    question: o.question || "hurricane",
    thresholdKt: o.thresholdKt || HURRICANE_REPORTED_KT,
    tsZ: storm.tsZ || null,
    advNum: storm.advNum ?? null,
    conCycle: storm.conCycle ?? null,
    /* The three estimates, side by side, exactly as published at this moment. */
    pCal: storm.pCal ?? null,
    pRaw: storm.pRaw ?? null,
    pMarket: storm.pMarket ?? null,
    contractId: storm.contractId ?? null,
    /* What the estimate was standing on, so the score can be sliced by it later —
       whether recon-backed forecasts beat consensus-only ones is a question worth being
       able to ask, and it cannot be asked retrospectively unless it is recorded now. */
    used: storm.used || null,
    quality: storm.quality ?? null,
    advisoryLagMin: storm.advisoryLagMin ?? null,
    currentKt: storm.currentKt ?? null,
  };
  e.key = forecastKey(e);
  return e.key ? e : null;
}

/* Append, refusing duplicates. Returns {ledger, added} rather than mutating, so a caller
   can report what actually changed. */
export function appendEntries(ledger, entries) {
  const out = Array.isArray(ledger) ? ledger.slice() : [];
  const seen = new Set(out.map((e) => e.key));
  let added = 0;
  for (const e of entries) {
    if (!e || !e.key || seen.has(e.key)) continue;
    seen.add(e.key);
    out.push(e);
    added++;
  }
  out.sort((a, b) => String(a.tsZ || "").localeCompare(String(b.tsZ || "")));
  return { ledger: out, added };
}

/* Did the storm ever reach the threshold, according to the best track?
 *
 * `records` is the b-deck as parsed by lib/atcf.mjs. The answer is deliberately simple —
 * any record at or above the threshold — because the contract resolves on exactly that and
 * dressing it up would be inventing a subtlety the market does not price. */
export function outcomeFromBestTrack(records, thresholdKt, opts) {
  const o = opts || {};
  const recs = (records || []).filter((r) => r && Number.isFinite(r.kt));
  if (!recs.length) return null;
  const thr = thresholdKt || HURRICANE_REPORTED_KT;
  const hits = recs.filter((r) => r.kt >= thr);
  const peak = recs.reduce((a, b) => (b.kt > a.kt ? b : a), recs[0]);
  const last = recs[recs.length - 1];
  /* A best track is still being written while the storm is alive, and NHC reanalyses it
     after the season. Both are stated rather than smoothed over: an outcome scored today
     against an operational track may move, and a scorecard that hid that would be
     claiming a precision the record does not have yet. */
  const lastMs = Date.parse(last.iso || "");
  const provisional = o.nowMs != null && lastMs ? (o.nowMs - lastMs) < (o.settleHours || 24) * 3600e3 : true;
  return {
    outcome: hits.length > 0 ? 1 : 0,
    peakKt: peak.kt,
    firstCrossIso: hits.length ? hits[0].iso : null,
    lastRecordIso: last.iso || null,
    records: recs.length,
    provisional,
    source: "NHC best track (b-deck), operational — subject to post-season reanalysis",
  };
}

/* Brier score: the mean squared error of a probability against a binary outcome. Lower is
   better; 0 is perfect; 0.25 is what you get by always saying 50%. */
export function brier(pairs) {
  const ok = pairs.filter((x) => x && Number.isFinite(x.p) && (x.o === 0 || x.o === 1));
  if (!ok.length) return null;
  return ok.reduce((a, x) => a + (x.p - x.o) * (x.p - x.o), 0) / ok.length;
}

/* Skill against a reference, on the usual scale: 1 is perfect, 0 is no better than the
   reference, negative is worse than it. */
export function skill(bs, bsRef) {
  if (bs == null || bsRef == null || !(bsRef > 0)) return null;
  return 1 - bs / bsRef;
}

/* Reliability: bin the forecasts and compare the average forecast in each bin against the
   frequency actually observed in it. This is what "calibrated" means operationally — when
   the board says 70%, it should happen about 70% of the time. */
export function reliability(pairs, nBins) {
  const bins = nBins || 5;
  const ok = pairs.filter((x) => x && Number.isFinite(x.p) && (x.o === 0 || x.o === 1));
  const out = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins, hi = (i + 1) / bins;
    const inBin = ok.filter((x) => x.p >= lo && (i === bins - 1 ? x.p <= hi : x.p < hi));
    out.push({
      lo, hi, n: inBin.length,
      /* Distinct storms in the bin, because that is the real support. */
      storms: new Set(inBin.map((x) => x.stormId)).size,
      meanForecast: inBin.length ? inBin.reduce((a, x) => a + x.p, 0) / inBin.length : null,
      observed: inBin.length ? inBin.reduce((a, x) => a + x.o, 0) / inBin.length : null,
    });
  }
  return out;
}

/* The scorecard.
 *
 * Every number here is either computed from resolved outcomes or refused with a reason.
 * There is no third state — a scorecard that hedges is one nobody can act on. */
export function summarize(ledger, opts) {
  const o = opts || {};
  const entries = Array.isArray(ledger) ? ledger : [];
  const resolved = entries.filter((e) => e.resolved && (e.resolved.outcome === 0 || e.resolved.outcome === 1));
  const stormsAll = new Set(entries.map((e) => e.stormId));
  const stormsResolved = new Set(resolved.map((e) => e.stormId));
  const minStorms = o.minStorms || MIN_RESOLVED_STORMS;

  const pairsFor = (field) => resolved
    .filter((e) => Number.isFinite(e[field]))
    .map((e) => ({ p: e[field], o: e.resolved.outcome, stormId: e.stormId }));

  const counts = {
    entries: entries.length,
    storms: stormsAll.size,
    resolvedEntries: resolved.length,
    /* THE NUMBER THAT GATES EVERYTHING. Entries are correlated within a storm; storms are
       the independent unit, and a threshold on entries would be a threshold on nothing. */
    resolvedStorms: stormsResolved.size,
    outcomes: { reached: new Set(resolved.filter((e) => e.resolved.outcome === 1).map((e) => e.stormId)).size,
                notReached: new Set(resolved.filter((e) => e.resolved.outcome === 0).map((e) => e.stormId)).size },
    provisional: resolved.filter((e) => e.resolved.provisional).length,
  };

  if (stormsResolved.size < minStorms) {
    return {
      ok: false, counts,
      note: `${stormsResolved.size} resolved storm${stormsResolved.size === 1 ? "" : "s"} of the ${minStorms} needed`
          + ` to publish a score. ${resolved.length} resolved forecast${resolved.length === 1 ? "" : "s"} sit behind them,`
          + ` and that gap is the reason the threshold counts STORMS: every forecast made during one storm's life`
          + ` shares that storm's single outcome, so scoring the entries would quote a handful of coin flips to`
          + ` three decimal places.`,
      /* Published even while refused, so the ledger can be seen to be filling. */
      progress: { have: stormsResolved.size, need: minStorms },
    };
  }

  const pairsCal = pairsFor("pCal"), pairsRaw = pairsFor("pRaw"), pairsMkt = pairsFor("pMarket");
  const bsCal = brier(pairsCal), bsRaw = brier(pairsRaw), bsMkt = brier(pairsMkt);
  /* The climatological reference: the base rate of this very sample, which is the score a
     forecaster gets by ignoring every storm and quoting the long-run frequency. */
  const base = pairsCal.length ? pairsCal.reduce((a, x) => a + x.o, 0) / pairsCal.length : null;
  const bsClim = base != null ? base * (1 - base) : null;

  return {
    ok: true, counts,
    baseRate: base,
    brier: { calibrated: bsCal, raw: bsRaw, market: bsMkt, climatology: bsClim },
    /* Skill against climatology answers "is this better than knowing nothing".
       Skill against the RAW estimate answers "did the four ingested feeds earn their
       keep", which is the question this whole build is accountable to.
       Skill against the MARKET answers "is there an edge", which is the only one that
       pays — and a negative number there is the most useful output this file can produce,
       because it says stop. */
    skill: {
      vsClimatology: skill(bsCal, bsClim),
      calibrationVsRaw: skill(bsCal, bsRaw),
      vsMarket: skill(bsCal, bsMkt),
    },
    reliability: stormsResolved.size >= (o.minReliabilityStorms || MIN_RELIABILITY_STORMS)
      ? reliability(pairsCal, o.bins || 5)
      : null,
    reliabilityNote: stormsResolved.size >= (o.minReliabilityStorms || MIN_RELIABILITY_STORMS)
      ? null
      : `a reliability curve needs ${o.minReliabilityStorms || MIN_RELIABILITY_STORMS} resolved storms to have`
        + ` support in each bin; ${stormsResolved.size} so far`,
    note: `scored over ${stormsResolved.size} resolved storms (${resolved.length} forecasts).`
        + ` Forecasts within a storm share one outcome, so the storms are the sample size.`,
  };
}
