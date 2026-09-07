/* THE ENVIRONMENTAL RUNWAY — how much room this storm has to intensify, and for how long.
 *
 * WHAT THIS ANSWERS THAT NOTHING ELSE ON THE BOARD DOES. The advisory says what NHC thinks
 * the storm will do. The guidance envelope says how much the models disagree about it.
 * Neither says what the storm is flying through. SHIPS does — deep-layer shear, mid-level
 * humidity, sea-surface temperature, ocean heat content and the maximum intensity the ocean
 * can support — sampled at every forecast lead, along a named forecast track. This module
 * turns those rows into the two things an operator actually asks:
 *
 *     How much headroom is there?        MPI minus the forecast intensity, in knots.
 *     What runs out first, and when?     The binding constraint at each lead, by name.
 *
 * SYNTHESIS, NOT A WALL OF MAPS. Six variables moving at once across six leads is 36 numbers
 * and no answer. What is published here is the headroom, the one binding constraint per lead,
 * and SHIPS' OWN ranked arithmetic for why its intensity forecast moves. The rows remain
 * available underneath; the synthesis is what is read first.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS NOT
 *
 * NOT A PROBABILITY. Every verdict here is a word from a closed vocabulary, chosen by a
 * stated numeric threshold. There is no path from this module to a probability, a price, an
 * edge or a Kelly fraction, and `test-runway.mjs` reads the pricing sources to prove it.
 * A band is a band. "HOSTILE" means shear is at or above 30 kt; it does not mean the storm
 * will weaken, and it must never be rendered as a likelihood that it will.
 *
 * NOT A FORECAST OF ITS OWN. Every number is SHIPS', sampled at SHIPS' leads, along the track
 * SHIPS was run on. This module interpolates nothing between leads and extrapolates nothing
 * past the end of the file. Where the product stops, the runway stops.
 *
 * NOT ATTRIBUTION OF THE STORM'S BEHAVIOUR. The attribution ledger is SHIPS' decomposition of
 * ITS OWN regression, in knots of forecast intensity change. "SST POTENTIAL: -54 kt" says the
 * sea-surface term contributed -54 kt to THIS FORECAST's arithmetic. It does not say the ocean
 * will cost the storm 54 knots.
 *
 * NOT COMPARABLE TO THE ATLAS AT EVERY LEAD. The Storm Atlas holds the same five fields —
 * shear, SST, OHC, mid-level RH, potential intensity — but it holds them AT GENESIS, within a
 * stated window, for the 1,461 of its 3,959 storms that carry any environment at all. A +96 h
 * forecast shear and a genesis-time shear distribution are not the same measurement, and
 * laying one over the other would manufacture a comparison the archive cannot support. So the
 * bridge is offered at the ONE lead whose basis matches and refused, by name, everywhere else.
 * See `atlasComparable`.
 *
 * PURE — no network, no clock. The caller supplies the cycle instant.
 */

/* The leads an operator reads. Every one is a tau SHIPS actually publishes, so nothing here
   is interpolated: NOW plus each of the five forecast days. */
export const LEADS = [0, 24, 48, 72, 96, 120];

/* ---------------------------------------------------------------------------------------
 * THE BANDS.
 *
 * Every threshold below is an operational convention, stated in the open so a reader can
 * disagree with the number rather than with an opaque verdict. They are cut points on a
 * measured value — not probabilities, not skill scores, and not calibrated against this
 * archive's outcomes. Changing one changes a word on the screen and nothing else.
 *
 * Each band carries `rank`: 0 is the most favourable, 3 the least. The binding constraint at
 * a lead is the field with the highest rank, which is why the scales below all point the
 * same way regardless of whether the underlying variable is good when high or when low.
 */
export const BANDS = {
  shearKt: {
    label: "DEEP-LAYER SHEAR", unit: "kt", digits: 0, goodHigh: false,
    source: "SHIPS 850-200 mb shear",
    cuts: [
      { max: 10, word: "LOW", rank: 0 },
      { max: 20, word: "MODERATE", rank: 1 },
      { max: 30, word: "STRONG", rank: 2 },
      { max: Infinity, word: "HOSTILE", rank: 3 },
    ],
  },
  rhMid: {
    label: "MID-LEVEL RH", unit: "%", digits: 0, goodHigh: true,
    source: "SHIPS 700-500 mb relative humidity",
    cuts: [
      { max: 40, word: "VERY DRY", rank: 3 },
      { max: 50, word: "DRY", rank: 2 },
      { max: 60, word: "MARGINAL", rank: 1 },
      { max: Infinity, word: "MOIST", rank: 0 },
    ],
  },
  sstC: {
    label: "SEA-SURFACE TEMP", unit: "°C", digits: 1, goodHigh: true,
    source: "SHIPS sea-surface temperature",
    cuts: [
      { max: 26.0, word: "BELOW THRESHOLD", rank: 3 },
      { max: 26.5, word: "MARGINAL", rank: 2 },
      { max: 28.5, word: "SUFFICIENT", rank: 1 },
      { max: Infinity, word: "AMPLE", rank: 0 },
    ],
  },
  ohc: {
    label: "OCEAN HEAT CONTENT", unit: "kJ/cm²", digits: 0, goodHigh: true,
    source: "SHIPS ocean heat content",
    cuts: [
      { max: 0, word: "NONE REPORTED", rank: 3 },
      { max: 25, word: "SHALLOW", rank: 2 },
      { max: 50, word: "MODERATE", rank: 1 },
      { max: Infinity, word: "DEEP WARM", rank: 0 },
    ],
  },
};

/* The order the bands are read in, and the order a tie between equal ranks is broken in.
   Fixed rather than derived from object key order, so the binding constraint is a
   deterministic function of the data and never of an engine's iteration order. */
export const BAND_ORDER = ["shearKt", "rhMid", "sstC", "ohc"];

export function bandFor(key, v) {
  const b = BANDS[key];
  if (!b || v == null || !Number.isFinite(v)) return null;
  for (const c of b.cuts) if (v <= c.max) return { word: c.word, rank: c.rank, label: b.label, unit: b.unit, digits: b.digits };
  return null;
}

/* The threshold text for a band, so a surface can print WHY a word was chosen rather than
   asking a reader to trust it. */
export function bandBasis(key) {
  const b = BANDS[key];
  if (!b) return null;
  const parts = [];
  let lo = null;
  for (const c of b.cuts) {
    parts.push(c.max === Infinity ? `${c.word} above ${lo}` : (lo == null ? `${c.word} at or below ${c.max}` : `${c.word} ${lo}–${c.max}`));
    lo = c.max;
  }
  return `${b.label} (${b.unit}): ` + parts.join(", ");
}

function seriesAt(series, hr) {
  if (!series) return null;
  const row = series.find((x) => x.hr === hr);
  return row ? row.v : null;
}
function typeAt(stormType, hr) {
  if (!stormType) return null;
  const row = stormType.find((x) => x.hr === hr);
  return row ? row.v : null;
}

/* ---------------------------------------------------------------------------------------
 * THE ATLAS BRIDGE, AND WHY IT IS NARROW.
 *
 * The five fields below are exactly the Storm Atlas environmental lens's fields, under the
 * Atlas's own names. The archive records them AT GENESIS. This build therefore offers the
 * comparison at tau 0 only, and only when the storm is itself near genesis — otherwise the
 * two sides are measuring different moments in a storm's life and the overlap of field names
 * is a coincidence, not a basis.
 */
export const ATLAS_FIELDS = {
  shearKt: "shear_kt",
  sstC: "sst_c",
  ohc: "ohc_kj_cm2",
  rhMid: "rh_mid_pct",
  mpiKt: "pot_intensity_kt",
};

/**
 * Is a runway sample comparable to the Atlas's genesis-time distribution?
 *
 * @param hr the forecast lead of the sample
 * @param ageHours hours since the storm's first best-track fix, or null when unknown
 * @param windowHours the archive's own genesis window (manifest.env_genesis_window_hours)
 * @returns {{ok:boolean, reason:string, fields?:object}}
 */
export function atlasComparable(hr, ageHours, windowHours) {
  const w = Number.isFinite(windowHours) ? windowHours : 12;
  if (hr !== 0) {
    return { ok: false, reason: `the archive records this environment at genesis; a +${hr} h forecast sample has no genesis-time counterpart to be compared against` };
  }
  if (ageHours == null) {
    return { ok: false, reason: "the storm's age since its first fix is unknown, so it cannot be placed inside or outside the archive's genesis window" };
  }
  if (ageHours > w) {
    return { ok: false, reason: `the storm is ${Math.round(ageHours)} h past its first fix, outside the archive's ${w} h genesis window` };
  }
  return { ok: true, reason: `within the archive's ${w} h genesis window, so the analysis-time sample and the archive's genesis distribution measure the same moment`, fields: ATLAS_FIELDS };
}

/* ---------------------------------------------------------------------------------------
 * THE ATTRIBUTION LEDGER.
 *
 * SHIPS prints every term rounded to a whole knot and then prints its own TOTAL CHANGE. The
 * two do not always agree — 19 rounded terms can drift a knot or two from the total they were
 * summed to produce. The total is therefore carried VERBATIM and never recomputed, and the
 * disagreement is published as `residualKt` rather than hidden by silently preferring one.
 */
export function attributionAt(attribution, hr, topN = 4) {
  if (!attribution || !attribution.rows) return null;
  const terms = attribution.rows
    .map((r) => {
      const c = r.dvKt.find((d) => d.hr === hr);
      return c && c.v != null ? { label: r.label, dvKt: c.v } : null;
    })
    .filter(Boolean);
  if (!terms.length) return null;
  const totalRow = attribution.total ? attribution.total.dvKt.find((d) => d.hr === hr) : null;
  const total = totalRow ? totalRow.v : null;
  const sum = terms.reduce((a, t) => a + t.dvKt, 0);
  const ranked = terms.slice().sort((a, b) => Math.abs(b.dvKt) - Math.abs(a.dvKt) || a.label.localeCompare(b.label));
  return {
    hr,
    /* Published total, exactly as SHIPS printed it. */
    totalKt: total,
    /* What the printed terms add up to, and the gap. Both stated; neither corrected. */
    sumOfTermsKt: Math.round(sum * 10) / 10,
    residualKt: total == null ? null : Math.round((total - sum) * 10) / 10,
    top: ranked.slice(0, topN),
    nTerms: terms.length,
  };
}

/**
 * Build the runway from a parsed SHIPS product.
 *
 * @param ships the object `parseShips` returns
 * @param opts.currentKt the storm's current intensity, for the analysis-time headroom
 * @param opts.ageHours hours since the first best-track fix, for the Atlas bridge
 * @param opts.atlasWindowHours the archive's genesis window
 * @returns null when there is no usable SHIPS product — never a shell of nulls that would
 *          render as an answer.
 */
export function runwayFrom(ships, opts = {}) {
  if (!ships || !ships.ok) return null;
  const S = ships.series || {};
  if (!S.shearKt && !S.sstC && !S.mpiKt) return null;

  const cycleMs = Date.parse(ships.cycleIso || "");
  const validIso = (hr) => (Number.isFinite(cycleMs) ? new Date(cycleMs + hr * 3600e3).toISOString() : null);

  /* The track the environment was sampled along. Every row in this product is read at the
     positions of THIS track, so a runway is only "along the NHC forecast track" when the aid
     is an official one. OFCL is the official forecast and OFCI its interpolated form; anything
     else is a model track and says so. */
  const aid = (ships.steering && ships.steering.trackAid) || null;
  const officialTrack = aid === "OFCL" || aid === "OFCI";

  const samples = [];
  for (const hr of LEADS) {
    const type = typeAt(ships.stormType, hr);
    const vals = {
      shearKt: seriesAt(S.shearKt, hr),
      rhMid: seriesAt(S.rhMid, hr),
      sstC: seriesAt(S.sstC, hr),
      ohc: seriesAt(S.ohc, hr),
      mpiKt: seriesAt(S.mpiKt, hr),
      thetaEDevC: seriesAt(S.thetaEDevC, hr),
      stmSpeedKt: seriesAt(S.stmSpeedKt, hr),
      landKm: seriesAt(S.landKm, hr),
      vLandKt: seriesAt(S.vLandKt, hr),
      vNoLandKt: seriesAt(S.vNoLandKt, hr),
      vLgemKt: seriesAt(S.vLgemKt, hr),
    };
    const lat = seriesAt(S.latN, hr);
    const lonW = seriesAt(S.lonW, hr);
    /* The product prints longitude as DEGREES WEST, positive. A central-Pacific storm past the
       dateline prints more than 180, which is still a west longitude — carrying it straight
       through as -v would put the storm at -190 instead of +170. */
    const lon = lonW == null ? null : (lonW > 180 ? 360 - lonW : -lonW);

    const bands = {};
    for (const k of BAND_ORDER) bands[k] = bandFor(k, vals[k]);

    /* THE BINDING CONSTRAINT. The field in the worst band; ties broken by BAND_ORDER, so the
       answer is a function of the data alone. Null when nothing is measured at this lead —
       an absent constraint is not a favourable one. */
    let limiting = null;
    for (const k of BAND_ORDER) {
      const b = bands[k];
      if (!b) continue;
      if (!limiting || b.rank > bands[limiting].rank) limiting = k;
    }

    /* HEADROOM. The maximum intensity the ocean supports, minus the intensity in hand:
       the observed intensity at tau 0, and SHIPS' own forecast intensity thereafter. A
       negative headroom means the storm is already above what this environment supports. */
    const against = hr === 0
      ? (opts.currentKt ?? vals.vLandKt ?? vals.vNoLandKt)
      : (vals.vLandKt ?? vals.vNoLandKt);
    const headroomKt = (vals.mpiKt != null && against != null) ? Math.round(vals.mpiKt - against) : null;

    samples.push({
      hr,
      validIso: validIso(hr),
      lat, lon,
      type,
      /* A storm forecast to be extratropical is no longer described by the tropical bands
         above it. The bands are still reported — the rows are real — but the flag travels
         with them so a surface never reads EXTP shear as a tropical constraint. */
      tropical: type == null ? null : type === "TROP" || type === "SUBT",
      values: vals,
      bands,
      limiting,
      limitingWord: limiting ? bands[limiting].word : null,
      headroomKt,
      headroomAgainstKt: against ?? null,
      /* THE LEDGER ONLY WHERE THE ENVIRONMENT WAS MEASURED.
         Past the end of its forecast SHIPS pads the contributions table with "0." rather than
         the "N/A" its environmental rows use — so every term, and the total, reads as a
         measured zero at leads the product never computed. Publishing that would put a
         confident "no term moved the forecast at +120 h" on screen for a lead that does not
         exist, which is the null-becoming-zero failure this build refuses everywhere else.
         The environmental rows are the honest witness: where they stop, the ledger stops. */
      attribution: limiting ? attributionAt(ships.attribution, hr) : null,
      observed: hr === 0,
    });
  }

  const measured = samples.filter((s) => s.limiting);
  const last = measured.length ? measured[measured.length - 1] : null;
  /* Headroom needs BOTH a potential intensity and an intensity to subtract from it, and
     SHIPS' intensity forecast routinely ends before its environmental rows do. So the last
     headroom is tracked on its own lead rather than read off the last measured band, which
     would report a null and call it the end of the runway. */
  const withHead = samples.filter((s) => s.headroomKt != null);
  const lastHead = withHead.length ? withHead[withHead.length - 1] : null;

  /* WHERE THE RUNWAY ENDS. The first lead at which the binding constraint reaches the worst
     band — the point past which the environment stops supporting intensification. Null when
     it never does inside the published window, which is a real answer and not a missing one. */
  const closes = samples.find((s) => s.limiting && s.bands[s.limiting].rank >= 3) || null;
  const etTransition = samples.find((s) => s.type === "EXTP") || null;

  return {
    ok: true,
    cycle: ships.cycleIso,
    stormId: ships.stormId,
    leads: LEADS,
    trackAid: aid,
    officialTrack,
    samples,
    steering: ships.steering || null,
    /* The only dry-air diagnostics this product publishes, under their own names. */
    dryAir: ships.dryAir || null,
    availability: ships.availability || null,
    summary: {
      nMeasured: measured.length,
      headroomNowKt: samples[0] ? samples[0].headroomKt : null,
      headroomEndKt: lastHead ? lastHead.headroomKt : null,
      headroomEndHr: lastHead ? lastHead.hr : null,
      limitingNow: samples[0] ? samples[0].limiting : null,
      limitingEnd: last ? last.limiting : null,
      lastMeasuredHr: last ? last.hr : null,
      closesAtHr: closes ? closes.hr : null,
      closesBy: closes ? closes.limiting : null,
      extratropicalAtHr: etTransition ? etTransition.hr : null,
    },
    atlas: atlasComparable(0, opts.ageHours ?? null, opts.atlasWindowHours),
    basis: `SHIPS ${ships.stormId} ${String(ships.cycleIso || "").slice(0, 16)}Z`
         + `, sampled along ${aid || "an unnamed track"}`
         + ` at +${LEADS.join("/+")} h`,
  };
}

/* The scalars the replay frame carries, so the runway rewinds under the scrubber instead of
   being a property of the newest snapshot only. Scalars only — the samples themselves are far
   too large to put on every frame, and a frame that carried them would dwarf the contracts. */
export function runwayFrameScalars(r) {
  if (!r) return { rwCycle: null, rwHeadNow: null, rwHeadEnd: null, rwLimNow: null, rwLimEnd: null, rwClose: null, rwExtp: null };
  const s = r.summary || {};
  return {
    rwCycle: r.cycle || null,
    rwHeadNow: s.headroomNowKt ?? null,
    rwHeadEnd: s.headroomEndKt ?? null,
    rwLimNow: s.limitingNow || null,
    rwLimEnd: s.limitingEnd || null,
    rwClose: s.closesAtHr ?? null,
    rwExtp: s.extratropicalAtHr ?? null,
  };
}
