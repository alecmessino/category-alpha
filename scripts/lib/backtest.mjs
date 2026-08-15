/* Historical replay of the probability engine against archived storms.
 *
 * THE ONE PROPERTY THIS FILE EXISTS TO GUARANTEE: no peeking. An a-deck downloaded today
 * contains every cycle the storm ever had, including the ones issued after the moment being
 * simulated. Replaying against the whole file would let the engine see its own answer and
 * would produce a Brier score that means nothing at all — the most dangerous number this
 * project could publish, because it would look like validation.
 *
 * So the timeline is reconstructed by filtering on the DTG each row carries, and
 * `visibleAt` is the only way any simulated step is allowed to read the deck.
 */

/* A row is visible at time t if the cycle it belongs to had been issued by then. ATCF
   cycles are YYYYMMDDHH in UTC. */
export function cycleMs(cycle) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(String(cycle || ""));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
}

/* THE ZERO-PEEK GATE. Everything the simulation reads goes through here.
   Rows are kept only when their own cycle is at or before t — never after. */
export function visibleAt(rows, tMs) {
  if (!Array.isArray(rows) || tMs == null) return [];
  return rows.filter((r) => {
    const c = cycleMs(r.cycle);
    return c != null && c <= tMs;
  });
}

/* The decision milestones: every distinct cycle in the deck, in order. Each one is a moment
   the operator would have had something new to price. */
export function milestones(rows, opts) {
  const o = opts || {};
  const seen = new Set();
  for (const r of rows || []) {
    const c = cycleMs(r.cycle);
    if (c != null) seen.add(c);
  }
  let out = [...seen].sort((a, b) => a - b);
  if (o.fromMs != null) out = out.filter((t) => t >= o.fromMs);
  if (o.toMs != null) out = out.filter((t) => t <= o.toMs);
  return out;
}

/* VDMs aligned by exact timestamp. A fix is available at t only if it was filed by then —
   the same rule as the deck, applied to a different clock. Returns the most recent one,
   because that is what an operator would have been looking at. */
export function fixVisibleAt(fixes, tMs) {
  if (!Array.isArray(fixes) || tMs == null) return null;
  const past = fixes
    .map((f) => ({ f, ms: Date.parse(f.iso || f.fixIso || "") }))
    .filter((x) => Number.isFinite(x.ms) && x.ms <= tMs)
    .sort((a, b) => b.ms - a.ms);
  return past.length ? past[0].f : null;
}

/* The truth, from the post-storm b-deck. Deliberately a SEPARATE input from anything the
   simulation touches: the outcome is read once, after every prediction is already made. */
export function outcomeFrom(bdeckRows, thresholdKt) {
  const rows = (bdeckRows || []).filter((r) => Number.isFinite(r.vmax) && r.vmax > 0);
  if (!rows.length) return null;
  const peak = Math.max(...rows.map((r) => r.vmax));
  /* WHEN the question stopped being open. A contract asking "does this storm reach
     hurricane strength" resolves the moment it does, so a forecast issued after that
     instant is not a forecast of anything — and scoring one against the settled outcome is
     how a decaying remnant correctly priced at 1% gets recorded as a 1%-that-happened.
     The live ledger already excludes these; this is the same rule. */
  const hit = rows.find((r) => r.vmax >= thresholdKt) || null;
  return {
    outcome: peak >= thresholdKt ? 1 : 0,
    peakKt: peak,
    records: rows.length,
    firstCrossIso: hit ? (hit.iso || null) : null,
  };
}

/* The flat transactional payload, one per simulated prediction. */
export function entryOf(o) {
  if (o == null || !Number.isFinite(o.rawP) || !Number.isFinite(o.calP)) return null;
  return {
    timestamp: new Date(o.tMs).toISOString(),
    storm_id: o.stormId,
    raw_p: Math.round(o.rawP * 1000) / 1000,
    calibrated_p: Math.round(o.calP * 1000) / 1000,
    target_threshold: o.threshold || "hurricane",
    outcome: o.outcome,
  };
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function brierOf(pairs) {
  const ok = (pairs || []).filter((x) => Number.isFinite(x.p) && (x.o === 0 || x.o === 1));
  if (!ok.length) return null;
  return ok.reduce((a, x) => a + (x.p - x.o) ** 2, 0) / ok.length;
}

/* Ten bins, as specified. Each reports its own support in FORECASTS and in STORMS, because
   a bin holding forty entries from one storm holds one observation. */
export function reliabilityTable(pairs, nBins) {
  const bins = nBins || 10;
  const ok = (pairs || []).filter((x) => Number.isFinite(x.p) && (x.o === 0 || x.o === 1));
  const out = [];
  for (let i = 0; i < bins; i++) {
    const lo = i / bins, hi = (i + 1) / bins;
    const inBin = ok.filter((x) => {
      const p = clamp01(x.p);
      return p >= lo && (i === bins - 1 ? p <= hi : p < hi);
    });
    out.push({
      bin: i + 1, lo, hi,
      n: inBin.length,
      storms: new Set(inBin.map((x) => x.stormId)).size,
      meanForecast: inBin.length ? inBin.reduce((a, x) => a + x.p, 0) / inBin.length : null,
      observed: inBin.length ? inBin.reduce((a, x) => a + x.o, 0) / inBin.length : null,
    });
  }
  return out;
}

/* Aggregate. Same storm-level gate as the live scorer: forecasts inside one storm share
   that storm's single outcome, so the storms are the sample size and a score quoted off a
   handful of them is a handful of coin flips to three decimal places. */
export const MIN_BACKTEST_STORMS = 10;

export function aggregate(entries, opts) {
  const o = opts || {};
  const min = o.minStorms == null ? MIN_BACKTEST_STORMS : o.minStorms;
  const rows = (entries || []).filter((e) => e && (e.outcome === 0 || e.outcome === 1));
  const storms = new Set(rows.map((e) => e.storm_id));
  const counts = { entries: rows.length, storms: storms.size };

  if (storms.size < min) {
    return {
      ok: false, counts,
      note: `${storms.size} storm(s) of the ${min} needed. ${rows.length} forecast(s) sit behind them,`
          + ` and the threshold counts STORMS because every forecast inside one storm shares that`
          + ` storm's single outcome.`,
    };
  }

  const cal = rows.map((e) => ({ p: e.calibrated_p, o: e.outcome, stormId: e.storm_id }));
  const raw = rows.map((e) => ({ p: e.raw_p, o: e.outcome, stormId: e.storm_id }));
  const base = cal.reduce((a, x) => a + x.o, 0) / cal.length;
  const bsCal = brierOf(cal), bsRaw = brierOf(raw), bsClim = base * (1 - base);
  return {
    ok: true, counts,
    baseRate: base,
    brier: { calibrated: bsCal, raw: bsRaw, climatology: bsClim },
    skill: {
      /* Paired by construction — every entry carries both numbers, so these divide scores
         computed over the same rows. */
      calibratedVsRaw: bsRaw > 0 ? 1 - bsCal / bsRaw : null,
      vsClimatology: bsClim > 0 ? 1 - bsCal / bsClim : null,
    },
    reliability: reliabilityTable(cal, 10),
  };
}
