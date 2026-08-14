/* THE PROBABILITY ENGINE — one calibrated P(event) per storm, per frame.
 *
 * WHAT CHANGED AND WHY. The board's per-storm probability used to have exactly one input:
 * the official NHC forecast intensity, widened by NHC's published forecast error. That is
 * a good number and it stays — but it is also the number the market already has. Everyone
 * pricing a hurricane contract has read the same advisory. An estimate built only from it
 * cannot, even in principle, be earlier or better informed than the price it is being
 * compared against.
 *
 * This engine adds the two things that ARE earlier:
 *
 *   1. THE ATCF CONSENSUS, which lands in the a-deck 30-60 minutes before the advisory
 *      built from it is issued, and which frequently disagrees with the official forecast
 *      — that disagreement is the forecaster's judgement made visible, and it is tradeable
 *      before it is published in prose.
 *   2. RECON, which is a MEASUREMENT of the initial condition every forecast is anchored
 *      on. When an aircraft finds the storm stronger than the advisory carries, every
 *      forecast built on the old initial condition is stale by a known amount.
 *
 * HOW THEY ARE COMBINED — and what is deliberately NOT done.
 *
 * Estimates are combined in KNOTS, not in probability space, and converted once at the
 * end. Averaging probabilities from different sources is meaningless when they answer the
 * same question with different sharpness; averaging the intensities they forecast is not.
 *
 * The width is a random-effects combination:
 *
 *      sigma_total^2 = min_i(sigma_i)^2 + tau^2
 *
 *   - min_i(sigma_i), NOT the inverse-variance combination, because the sources are
 *     strongly correlated: the official forecast is a forecaster's judgement OVER the
 *     aids, so treating the two as independent draws would shrink the band as though we
 *     had two independent looks at the storm when we have roughly one and a half. The
 *     combined answer is therefore never sharper than its sharpest single input.
 *   - tau^2 is the OBSERVED disagreement — between the sources, and between the consensus
 *     members themselves — so a cycle where the guidance scatters produces a wider answer
 *     without anyone choosing to widen it. It is the only term here that is measured
 *     rather than published, and it can only ever make the band wider.
 *
 * Every sigma traces to something published or measured: NHC's own mean absolute
 * intensity errors by lead time, the SFMR's specified accuracy, the scatterometer's
 * specified accuracy, and the spread the aids actually printed this cycle. No weight in
 * this file was fitted, tuned, or chosen to make an edge appear.
 *
 * THE RULES THIS FILE OBEYS:
 *   - RAW AND CALIBRATED ARE ALWAYS PUBLISHED SIDE BY SIDE. `pRaw` is the untouched
 *     official-forecast estimate. It is never overwritten and it is always inside the
 *     published band, so the calibration can never move the answer somewhere the plain
 *     arithmetic does not reach.
 *   - ASCAT NEVER MOVES THE MEAN. It is a band-tightening input only, it applies only
 *     when recon is absent, and only below the wind speed where scatterometry stops being
 *     trustworthy.
 *   - SHIPS DOES NOT SCORE UNTIL IT IS CLAIMED. Its contribution is computed and
 *     published every cycle; it enters the answer only when the operator claim that
 *     authorises it is on.
 *   - A REFUSAL IS AN ANSWER. Every path that cannot be supported returns null with a
 *     stated reason rather than a plausible number.
 */

/* Standard normal CDF, Abramowitz & Stegun 26.2.17 — good to ~1e-7. A pure mathematical
   identity rather than a modelling choice; it is duplicated from the advisory estimator
   deliberately, so importing this module can never pull the live fetch in behind it. */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/* ---- declared uncertainties, each with the source it comes from --------------------
 * These are the ONLY constants in the engine, and none of them was chosen by looking at
 * an outcome. */

/* Satellite-based current-intensity analysis. The advisory estimator already uses 5 kt
   for exactly this quantity; the same value is used here so the two cannot disagree
   about how well the storm's present intensity is known. */
export const DVORAK_SIGMA_KT = 5;
/* SFMR surface wind, per NOAA/AOC's stated instrument accuracy. */
export const SFMR_SIGMA_KT = 4;
/* Scatterometer wind speed accuracy in its valid range (~2 m/s). */
export const ASCAT_SIGMA_KT = 4;
/* Above this the scatterometer's wind retrieval saturates and rain contaminates the
   signal, so a pass reporting a high wind is not evidence of a low uncertainty. Past it,
   ASCAT tightens nothing and the board says why. */
export const ASCAT_SATURATION_KT = 50;
/* How old an observation may be and still describe the storm's present state. Recon fixes
   arrive through a mission at roughly this cadence; a scatterometer pass is an orbit, and
   an orbit six hours ago is a different storm. */
export const RECON_FRESH_MIN = 180;
export const ASCAT_FRESH_MIN = 360;
/* A consensus cycle older than this is not describing the current storm — the a-deck runs
   4x daily, so past one full cycle plus its landing time the next one exists and we have
   simply not fetched it. */
export const CONSENSUS_FRESH_MIN = 420;
/* A recon-versus-advisory intensity difference larger than this is far likelier to be a
   mis-parse or a mismatched storm than a real 40 kt analysis error. The correction is
   refused and reported rather than applied — the one guard here that exists to stop a bad
   read reaching a price. */
export const MAX_RECON_CORRECTION_KT = 40;

function maeAtOf(table) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  return function maeAt(hr) {
    const h = Number.isFinite(hr) ? hr : keys[keys.length - 1];
    if (h <= keys[0]) return table[keys[0]];
    for (let i = 1; i < keys.length; i++) {
      if (h <= keys[i]) {
        const a = keys[i - 1], b = keys[i];
        return table[a] + (table[b] - table[a]) * ((h - a) / (b - a));
      }
    }
    return table[keys[keys.length - 1]];
  };
}

const ageMin = (iso, nowMs) => {
  const t = Date.parse(iso || "");
  return t ? Math.round((nowMs - t) / 60000) : null;
};

/* The engine.
 *
 * `official` is the advisory estimator's own output and is treated as an opaque published
 * result: its tilt, its band and its basis are read, never recomputed. That is what keeps
 * the guidance-envelope tilt a single implementation with a single owner.
 */
export function calibratedIntensityP(input, opts) {
  const o = opts || {};
  const nowMs = o.nowMs != null ? o.nowMs : Date.now();
  const maeAt = maeAtOf(o.maeTable || { 0: 0, 24: 7.5, 48: 10, 120: 13.5 });
  const thr = o.thresholdKt;                       // latent-wind threshold, e.g. 62.5
  const reported = o.reportedKt || 65;
  const SQ = Math.sqrt(Math.PI / 2);

  const official = input.official || null;
  const currentKt = Number.isFinite(input.currentKt) ? input.currentKt : null;
  const consensus = input.consensus || null;
  const recon = input.recon && input.recon.ok ? input.recon : null;
  const ascat = input.ascat || null;
  const ships = input.ships && input.ships.ok ? input.ships : null;

  if (!official || official.p == null || thr == null) {
    return { ok: false, note: "no official-forecast estimate to calibrate — the engine adds to that number, it does not replace it" };
  }

  const sources = [], notes = [], layers = [];
  const clamp = (v) => Math.max(0.01, Math.min(0.99, v));

  /* ---- 1. the official forecast, as published ------------------------------------- */
  const tilt = official.adjustment && Number.isFinite(official.adjustment.shiftKt) ? official.adjustment.shiftKt : 0;
  const officialPeakKt = Number.isFinite(official.peakKt) ? official.peakKt + tilt : null;
  const officialHr = Number.isFinite(official.peakHr) ? official.peakHr : 0;
  if (officialPeakKt != null) {
    sources.push({ id: "official", label: "NHC official forecast intensity",
      peakKt: officialPeakKt, peakHr: officialHr, sigma: Math.max(1e-6, maeAt(officialHr) * SQ),
      basis: "official forecast peak" + (tilt ? ` with the published guidance-envelope tilt of ${tilt.toFixed(1)} kt` : "")
           + `, widened by NHC's published mean absolute intensity error at ${officialHr}h` });
  }
  layers.push({ id: "official", label: "Official forecast intensity", p: official.p, basis: official.basis });

  /* ---- 2. the ATCF consensus — the pre-advisory signal ----------------------------- */
  let consensusAge = null;
  if (consensus && consensus.peakKt != null) {
    consensusAge = ageMin(consensus.cycleIso, nowMs);
    if (consensusAge != null && consensusAge > CONSENSUS_FRESH_MIN) {
      notes.push(`ATCF consensus cycle ${consensus.cycle} is ${consensusAge} min old, past the ${CONSENSUS_FRESH_MIN}-min line — not used`);
    } else {
      sources.push({ id: "consensus", label: `ATCF consensus (${consensus.members.map((m) => m.tech).join("/")})`,
        peakKt: consensus.peakKt, peakHr: consensus.peakHr, sigma: Math.max(1e-6, maeAt(consensus.peakHr) * SQ),
        spreadKt: consensus.spreadKt,
        basis: `${consensus.n} aid${consensus.n === 1 ? "" : "s"} in the ${consensus.cycle} deck peak at a mean of`
             + ` ${consensus.peakKt} kt near ${consensus.peakHr}h`
             + (consensus.spreadKt != null ? `, disagreeing by ${consensus.spreadKt} kt` : "") });
    }
  }

  /* ---- 3. recon: a measured initial condition -------------------------------------
     The correction is applied to the FORECAST CURVE, not to the probability, because a
     forecast anchored on an initial intensity that has since been measured wrong is wrong
     by roughly that amount all the way along. */
  let reconAgeMin = null, reconDeltaKt = null, reconUsed = false, reconRefused = null;
  if (recon) {
    reconAgeMin = ageMin(recon.fixIso, nowMs);
    const obsKt = recon.intensityKt;
    if (obsKt == null) reconRefused = "the fix carried no surface wind and its flight level has no published reduction factor";
    else if (reconAgeMin != null && reconAgeMin > RECON_FRESH_MIN) reconRefused = `the fix is ${reconAgeMin} min old, past the ${RECON_FRESH_MIN}-min line`;
    else if (currentKt == null) reconRefused = "no advisory intensity to correct against";
    else {
      const d = obsKt - currentKt;
      if (Math.abs(d) > MAX_RECON_CORRECTION_KT) {
        reconRefused = `the fix differs from the advisory by ${Math.round(d)} kt, past the ${MAX_RECON_CORRECTION_KT} kt sanity limit — likelier a bad read than a real correction`;
      } else { reconDeltaKt = d; reconUsed = true; }
    }
    if (reconRefused) notes.push("recon fix not applied: " + reconRefused);
  }
  if (reconUsed && reconDeltaKt) {
    for (const s of sources) s.peakKt += reconDeltaKt;
    notes.push(`every forecast peak shifted ${reconDeltaKt > 0 ? "+" : ""}${Math.round(reconDeltaKt * 10) / 10} kt:`
      + ` the aircraft measured ${recon.intensityKt} kt (${recon.intensitySource}) against the advisory's ${currentKt} kt`);
  }

  if (!sources.length) {
    return { ok: false, note: "no usable intensity estimate — nothing to combine" };
  }

  /* ---- 4. combine ------------------------------------------------------------------ */
  const w = sources.map((s) => 1 / (s.sigma * s.sigma));
  const wSum = w.reduce((a, b) => a + b, 0);
  const meanKt = sources.reduce((a, s, i) => a + s.peakKt * w[i], 0) / wSum;
  const sigmaMin = Math.min(...sources.map((s) => s.sigma));
  /* Between-source disagreement, weighted the same way the mean was. */
  const varBetween = sources.length > 1
    ? sources.reduce((a, s, i) => a + w[i] * (s.peakKt - meanKt) * (s.peakKt - meanKt), 0) / wSum
    : 0;
  /* The aids' own scatter is the same kind of quantity. The larger of the two governs —
     summing them would count one disagreement twice, and taking the smaller would let a
     tight pair of sources hide a wide field of aids behind it. */
  const spreadKt = consensus && consensus.spreadKt != null ? consensus.spreadKt : 0;
  const tau2 = Math.max(varBetween, spreadKt * spreadKt);
  const sigmaTotal = Math.sqrt(sigmaMin * sigmaMin + tau2);

  /* ---- 5. the current-intensity term, and the only place ASCAT acts --------------- */
  let sigmaInit = DVORAK_SIGMA_KT;
  let initSource = "satellite intensity analysis";
  let ascatAgeMin = null, ascatUsed = false;
  if (reconUsed) {
    sigmaInit = SFMR_SIGMA_KT;
    initSource = "aircraft reconnaissance";
  } else if (ascat && ascat.kt != null) {
    ascatAgeMin = ageMin(ascat.iso, nowMs);
    if (ascatAgeMin != null && ascatAgeMin > ASCAT_FRESH_MIN) {
      notes.push(`scatterometer pass is ${ascatAgeMin} min old, past the ${ASCAT_FRESH_MIN}-min line — band not tightened`);
    } else if (ascat.kt > ASCAT_SATURATION_KT) {
      notes.push(`scatterometer read ${ascat.kt} kt, above the ${ASCAT_SATURATION_KT} kt point where the retrieval saturates — band not tightened`);
    } else {
      sigmaInit = ASCAT_SIGMA_KT;
      initSource = `scatterometer (${ascat.instrument || "SCAT"})`;
      ascatUsed = true;
    }
  }
  /* The observed current intensity: recon's measurement when there is one, otherwise the
     advisory's. ASCAT does NOT supply this — it tightens the width, never the value. */
  const observedNowKt = reconUsed && recon.intensityKt != null ? recon.intensityKt : currentKt;

  const pPeak = clamp(normCdf((meanKt - thr) / sigmaTotal));
  const pNow = observedNowKt != null ? clamp(normCdf((observedNowKt - thr) / sigmaInit)) : 0;
  /* Reaching the threshold NOW implies reaching it at some point, so the answer is at
     least the current-intensity probability. This is the same reasoning the advisory
     estimator uses for a storm already at hurricane strength, applied continuously. */
  let p = Math.max(pPeak, pNow);
  const drivenBy = pNow > pPeak ? "current intensity" : "forecast peak";

  /* ---- 6. SHIPS: computed always, scored only when claimed ------------------------- */
  let riFloor = null, pWithRi = p;
  if (ships && input.riFloor) {
    riFloor = input.riFloor;
    if (riFloor && riFloor.p != null) pWithRi = Math.max(p, riFloor.p);
  }
  const shipsScoring = !!input.shipsScoring;
  if (shipsScoring && riFloor && pWithRi > p) {
    notes.push(`SHIPS RI floor applied under an active operator claim: ${riFloor.basis}`);
    p = pWithRi;
  } else if (riFloor && pWithRi > p) {
    notes.push(`SHIPS RI implies a floor of ${Math.round(riFloor.p * 100)}% — published, NOT scored (no operator claim)`);
  }

  /* ---- 7. the band ----------------------------------------------------------------
     Evaluated across a plausible range of error widths, exactly as the advisory estimator
     does, and then forced to contain the RAW official estimate so the calibration can
     never claim ground the unadjusted arithmetic does not reach. */
  const ends = [
    clamp(normCdf((meanKt - thr) / (sigmaTotal * 0.8))),
    clamp(normCdf((meanKt - thr) / (sigmaTotal * 1.6))),
    official.p,
    p,
  ].sort((a, b) => a - b);

  /* ---- 8. the layers the edge book grades on -------------------------------------- */
  if (consensus && consensus.peakKt != null) {
    const cs = sources.find((s) => s.id === "consensus");
    layers.push({
      id: "consensus", label: "ATCF guidance consensus",
      p: cs ? clamp(normCdf((cs.peakKt - thr) / Math.max(1e-6, cs.sigma))) : null,
      unavailable: !cs,
      basis: cs ? cs.basis : `consensus present but stale (${consensusAge} min) — not scored`,
    });
  }
  if (recon) {
    layers.push({
      id: "recon", label: "Aircraft reconnaissance",
      /* p: null on purpose, and this is the same rule the guidance-position layer
         follows. A recon fix measures what the storm IS, not what it will become, so a
         probability derived from it answers a different question from the layers around
         it — a 45 kt measurement would publish "1%" next to a forecast layer's "93%" and
         the agreement test would read a 92-point disagreement that does not exist. The
         fix has already moved the answer, through the initial condition every forecast
         here is anchored on. It informs; it does not vote. */
      p: null,
      unavailable: !reconUsed,
      basis: reconUsed
        ? `aircraft measured ${recon.intensityKt} kt (${recon.intensitySource})`
          + (recon.mslp != null ? ` and ${recon.mslp} mb${recon.extrapolated ? " extrapolated" : " measured"}` : "")
          + `, ${reconAgeMin} min ago`
        : "recon fix present but not applied: " + (reconRefused || "unusable"),
    });
  }
  if (riFloor) {
    layers.push({
      id: "ships-ri", label: "SHIPS rapid-intensification floor",
      /* p is null unless the claim is on. An unscored layer must not count toward the
         agreement test that earns a TAKE — it is published, not voted. */
      p: shipsScoring ? riFloor.p : null,
      unavailable: !shipsScoring,
      basis: riFloor.basis + (shipsScoring ? " — scored under an active operator claim" : " — published, not scored"),
    });
  }

  const usedIds = sources.map((s) => s.id);
  return {
    ok: true,
    p, pRaw: official.p, pLow: ends[0], pHigh: ends[ends.length - 1],
    pPeak, pNow, pWithRi, drivenBy,
    meanKt: Math.round(meanKt * 10) / 10, sigmaKt: Math.round(sigmaTotal * 10) / 10,
    sigmaInitKt: sigmaInit, initSource,
    tauKt: Math.round(Math.sqrt(tau2) * 10) / 10,
    reconDeltaKt: reconDeltaKt != null ? Math.round(reconDeltaKt * 10) / 10 : null,
    reconAgeMin, reconUsed, ascatAgeMin, ascatUsed, consensusAgeMin: consensusAge,
    shipsScoring, riFloor,
    sources: sources.map((s) => ({ id: s.id, label: s.label, peakKt: Math.round(s.peakKt * 10) / 10, peakHr: s.peakHr, sigmaKt: Math.round(s.sigma * 10) / 10 })),
    layers, notes,
    /* Which inputs are actually behind this number, for the quality tier and the CI gate.
       "Present" is not the same as "used", and only what was used is listed. */
    used: { official: usedIds.includes("official"), consensus: usedIds.includes("consensus"),
            recon: reconUsed, ascat: ascatUsed, ships: shipsScoring && !!riFloor },
    basis: `combined ${sources.length} intensity estimate${sources.length === 1 ? "" : "s"} at`
         + ` ${Math.round(meanKt)} kt (sigma ${Math.round(sigmaTotal * 10) / 10} kt, of which`
         + ` ${Math.round(Math.sqrt(tau2) * 10) / 10} kt is observed disagreement)`
         + `; ${reported} kt needs ${thr} kt of latent wind`
         + (reconUsed ? ` · initial condition MEASURED by aircraft ${reconAgeMin} min ago` : "")
         + (ascatUsed ? ` · band tightened by a scatterometer pass ${ascatAgeMin} min ago` : "")
         + ` · driven by the ${drivenBy}`
         + ` · raw official estimate ${Math.round(official.p * 100)}%, calibrated ${Math.round(p * 100)}%`,
  };
}

/* Evidence quality for one storm, from what actually reached the engine.
 *
 * HIGH is reserved for a MEASURED initial condition. That is the whole point of the tier:
 * it separates "an aircraft flew through this storm and read the pressure" from "a
 * satellite pattern was matched against a table", and no amount of model agreement
 * promotes the second into the first. */
export function evidenceQuality(cal, opts) {
  const o = opts || {};
  if (!cal || !cal.ok) return { tier: "LOW", reasons: ["no calibrated probability for this system"] };
  const reasons = [];
  let tier = "LOW";
  if (cal.used.recon) {
    tier = "HIGH";
    reasons.push(`aircraft reconnaissance ${cal.reconAgeMin} min old — the initial condition is measured, not estimated`);
  } else if (cal.used.consensus) {
    tier = "MEDIUM";
    reasons.push(`ATCF consensus ${cal.consensusAgeMin} min old, no aircraft in the storm`);
  } else {
    reasons.push("official advisory only — no guidance deck and no aircraft");
  }
  if (cal.used.ascat) reasons.push("scatterometer pass tightened the current-intensity band");
  if (cal.riFloor) reasons.push("SHIPS RI diagnostics present" + (cal.shipsScoring ? " and scored" : ", published but not scored"));
  /* Staleness is the one thing that can take the tier away again, and it outranks every
     reason to raise it. A measured initial condition six hours old describes a storm that
     no longer exists. */
  if (o.advisoryLagMin != null && o.staleAtMin != null && o.advisoryLagMin > o.staleAtMin) {
    tier = "LOW";
    reasons.unshift(`the advisory under this estimate is ${o.advisoryLagMin} min old, past the ${o.staleAtMin}-min line — quality is capped regardless of what else arrived`);
  }
  return { tier, reasons };
}
