/* SHIPS — the 6-hourly statistical intensity diagnostics.
 *
 * WHAT THIS ADDS THAT NOTHING ELSE ON THE BOARD HAS. The advisory says what NHC thinks
 * the storm will do. The a-deck says what the models think. Neither says WHY, and "why"
 * is what tells you whether the forecast is fragile. SHIPS publishes the environment the
 * forecast is standing on — deep-layer shear, ocean heat content, mid-level humidity,
 * and the maximum potential intensity the sea surface can support — and, at the bottom of
 * the file, NHC's own calibrated rapid-intensification probabilities.
 *
 * Those RI probabilities are the single most valuable number in this product, because
 * they are ALREADY CALIBRATED against the historical record by the people who publish
 * them, and they come with their own climatological base rate on the same line. Raw and
 * calibrated, side by side, in the source itself.
 *
 * SCORING IS OFF UNTIL IT IS CLAIMED. These features do not move a published probability
 * on their own. They are ingested, surfaced, and carried on the frame; the probability
 * engine reads them only when the operator claim that authorises it is on, and the
 * unscored estimate stays published beside the scored one either way. A feature that
 * quietly re-weights an anchor is indistinguishable from a bug until it costs money.
 *
 * PURE PARSER — no network, no clock.
 *
 * FORMAT, ESTABLISHED BY EVIDENCE (26081418CP0126_ships.txt, 14 Aug 2026):
 *
 *   *  LALA        CP012026  08/14/26  18 UTC        *
 *   TIME (HR)          0     6    12    18    24 ...
 *   SHEAR (KT)        12    10    12    13    18 ...
 *   POT. INT. (KT)   138   139   140   136   137 ...
 *   HEAT CONTENT      11    11    14     8     8 ...
 *   700-500 MB RH     48    47    48    48    50 ...
 *    SHIPS Prob RI for 30kt/ 24hr RI threshold=   16% is  1.9 times climatological mean ( 8.6%)
 *    Matrix of RI probabilities → SHIPS-RII / Logistic / Bayesian / Consensus / DTOPS / SDCON
 */

/* Missing markers the live product actually uses. "N/A" past the end of the forecast,
   "xx.x" where a position was not computed, "LOST" where the model lost the vortex.
   Each one means "no value", and every one of them would parse as a number under a
   looser reader — LOST would not, but xx.x becomes NaN and N/A becomes NaN, and a NaN
   that reaches a probability is a silent wrong answer. */
const MISSING = /^(N\/A|NA|xx+\.?x*|xxx+|LOST|-{2,}|\*+)$/i;

function cells(line) {
  return String(line).trim().split(/\s{1,}/).map((s) => s.trim()).filter((s) => s !== "");
}
function numsAfterLabel(line, label) {
  const rest = line.slice(line.indexOf(label) + label.length);
  return cells(rest).map((c) => (MISSING.test(c) ? null : (Number.isFinite(Number(c)) ? Number(c) : null)));
}

/* Rows are matched on the label the product prints, exactly. A fuzzy match here would be
   the same class of error as a fuzzy field letter in a VDM: it silently reads the wrong
   row and publishes it under the right name. */
const ROWS = [
  ["shearKt", "SHEAR (KT)", "850-200 mb deep-layer shear"],
  ["shearAdjKt", "SHEAR ADJ (KT)", "shear adjusted for storm motion"],
  ["shearDirDeg", "SHEAR DIR", "direction the deep-layer shear vector points toward"],
  ["sstC", "SST (C)", "sea-surface temperature"],
  ["mpiKt", "POT. INT. (KT)", "maximum potential intensity the ocean supports"],
  ["rhMid", "700-500 MB RH", "mid-level relative humidity"],
  ["thetaEDevC", "TH_E DEV (C)", "theta-e deviation from moist adiabatic — low is a dry, stable column"],
  ["ohc", "HEAT CONTENT", "ocean heat content (kJ/cm2)"],
  ["landKm", "LAND (KM)", "distance to land"],
  ["stmSpeedKt", "STM SPEED (KT)", "forecast translation speed"],
  ["latN", "LAT (DEG N)", "forecast latitude on the track SHIPS was run along"],
  ["lonW", "LONG(DEG W)", "forecast longitude west on the track SHIPS was run along"],
  ["t200C", "200 MB T (C)", "200 mb temperature"],
  ["div200", "200 MB DIV", "200 mb divergence (10^7 s-1)"],
  ["envVor850", "850 MB ENV VOR", "850 mb environmental relative vorticity"],
  ["tadv700850", "700-850 TADV", "700-850 mb temperature advection"],
  ["modelVtxKt", "MODEL VTX (KT)", "the model's own vortex strength"],
  ["vNoLandKt", "V (KT) NO LAND", "SHIPS intensity forecast, no land interaction"],
  ["vLandKt", "V (KT) LAND", "SHIPS intensity forecast with land interaction"],
  ["vLgemKt", "V (KT) LGEM", "LGEM intensity forecast"],
];

/* Storm Type is the one row that is a WORD, not a number. It is also the row that most
   often explains a runway collapsing: a forecast that goes TROP → EXTP is not a storm
   losing an argument with its environment, it is a storm ceasing to be the kind of thing
   the rest of these rows describe. Parsed separately so it is never coerced to NaN. */
const TYPE_OK = /^(TROP|SUBT|EXTP|LOW|WAVE|DISS|REMN)$/i;

export function parseShips(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  if (!/SHIPS/i.test(raw)) return { ok: false, note: "not a SHIPS product" };

  /* "*  LALA        CP012026  08/14/26  18 UTC        *" */
  const hdr = /\*\s*([A-Z][A-Z0-9'\- ]*?)\s{2,}([A-Z]{2}\d{6})\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{1,2})\s*UTC/i.exec(raw);
  if (!hdr) {
    return { ok: false, note: "no SHIPS storm header line",
             sample: lines.slice(0, 5).join(" | ").slice(0, 200) };
  }
  const name = hdr[1].trim();
  const stormId = hdr[2].toUpperCase();
  const cycleIso = `20${hdr[5]}-${hdr[3]}-${hdr[4]}T${String(Number(hdr[6])).padStart(2, "0")}:00:00.000Z`;

  const timeLine = lines.find((l) => /^\s*TIME \(HR\)/.test(l));
  if (!timeLine) return { ok: false, stormId, note: "no TIME (HR) row — layout changed" };
  const taus = numsAfterLabel(timeLine, "TIME (HR)");

  const series = {}, features = {}, labels = {};
  for (const [key, label, meaning] of ROWS) {
    const line = lines.find((l) => l.trim().startsWith(label));
    if (!line) { series[key] = null; features[key] = null; continue; }
    const vals = numsAfterLabel(line, label);
    series[key] = taus.map((hr, i) => ({ hr, v: vals[i] ?? null })).filter((x) => x.hr != null);
    features[key] = vals[0] ?? null;                 // the analysis-time value
    labels[key] = meaning;
  }

  /* ---- rapid intensification ------------------------------------------------------
     Two published forms, both kept. The per-threshold lines carry the probability AND
     the climatological base rate it should be read against; the matrix carries each
     scheme separately plus their consensus. A single "RI probability" would throw away
     the disagreement between schemes, and the disagreement is the useful part. */
  const thresholds = [];
  const lineRe = /SHIPS\s+Prob\s+RI\s+for\s+(\d+)\s*kt\/\s*(\d+)\s*hr\s+RI\s+threshold=\s*(\d+(?:\.\d+)?)%\s+is\s+(\d+(?:\.\d+)?)\s+times\s+climatological\s+mean\s*\(\s*(\d+(?:\.\d+)?)%\s*\)/gi;
  let m;
  while ((m = lineRe.exec(raw))) {
    thresholds.push({
      dvKt: Number(m[1]), hours: Number(m[2]),
      /* RAW: what the scheme says. CALIBRATED CONTEXT: the base rate it is a multiple
         of. Neither is useful without the other — a 16% RI probability is alarming at a
         9% base rate and unremarkable at 15%. */
      p: Number(m[3]) / 100, ratioToClimo: Number(m[4]), climoP: Number(m[5]) / 100,
    });
  }

  const matrix = {};
  const matHead = lines.findIndex((l) => /RI\s*\(kt\s*\/\s*h\)/i.test(l));
  if (matHead >= 0) {
    const cols = (lines[matHead].split("|").slice(1) || []).map((s) => s.trim()).filter(Boolean);
    for (let i = matHead + 1; i < Math.min(lines.length, matHead + 12); i++) {
      const mm = /^\s*([A-Za-z][A-Za-z\- ]*):\s*(.*)$/.exec(lines[i]);
      if (!mm) continue;
      const key = mm[1].trim();
      const vals = cells(mm[2]).map((c) => (/%$/.test(c) ? Number(c.replace("%", "")) / 100 : null));
      if (!vals.length) continue;
      matrix[key] = cols.map((c, j) => ({ threshold: c, p: vals[j] ?? null })).filter((x) => x.p != null);
    }
  }

  /* ---- storm type, per lead -------------------------------------------------------
     Words, not numbers, so it is read with its own reader and its own vocabulary. An
     unrecognised token becomes null rather than being passed through: this row decides
     whether the environmental rows below it still describe a tropical cyclone at all. */
  const typeLine = lines.find((l) => l.trim().startsWith("Storm Type"));
  const stormType = typeLine
    ? (() => {
        const toks = cells(typeLine.slice(typeLine.indexOf("Storm Type") + "Storm Type".length));
        return taus.map((hr, i) => ({ hr, v: toks[i] && TYPE_OK.test(toks[i]) ? toks[i].toUpperCase() : null }))
                   .filter((x) => x.hr != null);
      })()
    : null;

  /* ---- steering ------------------------------------------------------------------
     SHIPS does not publish a steering-flow field, and this build does not pretend it
     does. What it publishes is the PRESSURE OF THE STEERING LEVEL together with that
     level's climatological mean — a deep-layer steered storm sits low (a large pressure),
     a shallow one sits high — plus the initial heading and speed and the CX/CY motion
     components. That is a real steering diagnostic and it is all there is here; a wind
     vector at each lead would have to come from GRIB2, and is not claimed from this file.

     The name of the track SHIPS was run ALONG is taken from the same block. It matters:
     every environmental row in this product is sampled at the positions of THAT track,
     so a runway can only be called "along the NHC forecast track" when the track is an
     official one. OFCI is the interpolated official forecast; a run along a model track
     says so instead. */
  const steerRe = /PRESSURE\s+OF\s+STEERING\s+LEVEL\s*\(MB\)\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:\(\s*MEAN\s*=\s*(-?\d+(?:\.\d+)?)\s*\))?/i.exec(raw);
  const headRe = /INITIAL\s+HEADING\/SPEED\s*\(DEG\/KT\)\s*:\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i.exec(raw);
  const cxcyRe = /CX,\s*CY\s*:\s*(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/i.exec(raw);
  const trackRe = /FORECAST\s+TRACK\s+FROM\s+([A-Z0-9]{3,5})/i.exec(raw);
  const steering = {
    trackAid: trackRe ? trackRe[1].toUpperCase() : null,
    levelMb: steerRe ? Number(steerRe[1]) : null,
    levelClimoMb: steerRe && steerRe[2] != null ? Number(steerRe[2]) : null,
    headingDeg: headRe ? Number(headRe[1]) : null,
    speedKt: headRe ? Number(headRe[2]) : null,
    cxKt: cxcyRe ? Number(cxcyRe[1]) : null,
    cyKt: cxcyRe ? Number(cxcyRe[2]) : null,
  };

  /* ---- the attribution ledger ------------------------------------------------------
     "INDIVIDUAL CONTRIBUTIONS TO INTENSITY CHANGE": SHIPS' own decomposition of its
     intensity forecast into the terms that produced it, in KNOTS, per lead, ending in a
     TOTAL CHANGE that is the sum. This is the single most useful block in the file,
     because it answers "why" in the model's own arithmetic instead of leaving a reader
     to infer causation from six curves moving at once.

     THESE ARE KNOTS OF FORECAST INTENSITY CHANGE. They are contributions to a regression,
     not probabilities, not physical fluxes, and not attributions of a real storm's
     behaviour — only of THIS forecast's arithmetic. Nothing downstream may present them
     as anything else.

     The columns start at the SECOND tau (a change from t=0 is zero by construction), so
     the header row is read on its own rather than reusing `taus`. */
  const contribHead = lines.findIndex((l) => /INDIVIDUAL\s+CONTRIBUTIONS\s+TO\s+INTENSITY\s+CHANGE/i.test(l));
  let contributions = null, contribTaus = null, contribTotal = null;
  if (contribHead >= 0) {
    /* The lead row is the next line that is all numbers. */
    let hi = -1;
    for (let i = contribHead + 1; i < Math.min(lines.length, contribHead + 4); i++) {
      const c = cells(lines[i]);
      if (c.length > 2 && c.every((x) => /^\d+$/.test(x))) { hi = i; break; }
    }
    if (hi >= 0) {
      contribTaus = cells(lines[hi]).map(Number);
      contributions = [];
      for (let i = hi + 1; i < Math.min(lines.length, hi + 30); i++) {
        const L = lines[i];
        if (/^\s*-{5,}\s*$/.test(L)) continue;
        if (/CURRENT\s+MAX\s+WIND/i.test(L) || /^\s*$/.test(L)) break;
        /* "  SAMPLE MEAN CHANGE     0.    1. ..." — a label of words, then signed
           numbers that the product writes with a trailing dot ("-31."). */
        /* Labels begin with a letter OR a digit ("200 MB DIVERGENCE", "700-500 MB RH",
           "850-700 T ADVEC"), so the leading class must admit both — an anchor of [A-Z]
           silently drops five of the nineteen terms, including the humidity one. */
        const mm = /^\s{2,}([A-Z0-9][A-Z0-9_\/\.\- ]*?[A-Z\.])\s{2,}(-?\d.*)$/.exec(L);
        if (!mm) continue;
        const label = mm[1].trim();
        const vals = cells(mm[2]).map((c) => (MISSING.test(c) ? null
          : (Number.isFinite(Number(c.replace(/\.$/, ""))) ? Number(c.replace(/\.$/, "")) : null)));
        const row = { label, dvKt: contribTaus.map((hr, j) => ({ hr, v: vals[j] ?? null })) };
        if (/^TOTAL\s+CHANGE$/i.test(label)) contribTotal = row;
        else contributions.push(row);
      }
      if (!contributions.length) contributions = null;
    }
  }

  /* ---- the RI predictor table -----------------------------------------------------
     Analysis-time scalars, each with the RI-predictor RANGE it is scaled against and its
     percent contribution to the RI index. Two of these are the only dry-air diagnostics
     the product publishes:

        BL DRY-AIR FLUX (W/M2)        boundary-layer dry-air flux
        %area of TPW <45 mm upshear   the fraction of the upshear quadrant that is dry

     The second is the Saharan-Air-Layer / dry-intrusion diagnostic in this file. There is
     NO SAL row as such, and none is synthesised: a runway that wants to speak about dry
     air speaks through these two, under their own names.

     Note the range is printed low-to-high OR high-to-low depending on the sign of the
     predictor's effect, so it is carried as `rangeFrom`/`rangeTo` verbatim rather than
     being normalised into a min and a max that would silently flip the meaning. */
  const predictors = [];
  const predRe = /^\s*(\S.*?)\s*:\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/;
  for (const L of lines) {
    const mm = predRe.exec(L);
    if (!mm) continue;
    predictors.push({
      label: mm[1].trim(), value: Number(mm[2]),
      rangeFrom: Number(mm[3]), rangeTo: Number(mm[4]),
      scaled: Number(mm[5]), pctContribution: Number(mm[6]),
    });
  }
  const predictorBy = (re) => predictors.find((p) => re.test(p.label)) || null;
  const dryAir = {
    blFluxWm2: predictorBy(/BL\s+DRY-?AIR\s+FLUX/i),
    tpwDryPctUpshear: predictorBy(/%\s*area\s+of\s+TPW/i),
  };

  const ahiRe = /AHI\s*=\s*(\d+)/i.exec(raw);
  const annular = /STORM\s+NOT\s+ANNULAR/i.test(raw) ? false : (ahiRe ? Number(ahiRe[1]) > 0 : null);

  const prelim = /PRELIM\s+RI\s+PROB\s*\(DV\s*\.GE\.\s*(\d+)\s*KT\s*IN\s*(\d+)\s*HR\)\s*:\s*(\d+(?:\.\d+)?)/i.exec(raw);

  const ohcAvailable = /OHC AVAILABLE/i.test(raw);
  const irAvailable = /IR SAT DATA AVAILABLE/i.test(raw);

  return {
    ok: true, stormId, name, cycleIso, taus,
    features, series, labels,
    ri: {
      thresholds,
      matrix,
      /* The consensus row of the matrix is the one NHC itself presents as the combined
         answer. Named explicitly so a consumer does not have to know the row order. */
      consensus: matrix.Consensus || null,
      schemes: Object.keys(matrix),
      prelim: prelim ? { dvKt: Number(prelim[1]), hours: Number(prelim[2]), value: Number(prelim[3]) } : null,
    },
    stormType,
    steering,
    /* SHIPS' own arithmetic for its own forecast, in knots. Never a probability. */
    attribution: contributions ? { taus: contribTaus, rows: contributions, total: contribTotal } : null,
    predictors: predictors.length ? predictors : null,
    dryAir,
    annular: { ahi: ahiRe ? Number(ahiRe[1]) : null, isAnnular: annular },
    availability: { ohc: ohcAvailable, ir: irAvailable },
    basis: `SHIPS ${name} ${stormId} ${cycleIso.slice(0, 16)}Z · shear ${features.shearKt ?? "—"} kt`
         + ` · OHC ${features.ohc ?? "—"} kJ/cm2 · MPI ${features.mpiKt ?? "—"} kt`
         + ` · mid-level RH ${features.rhMid ?? "—"}%`,
  };
}

/* The SHIPS filename NHC publishes: YYMMDDHH + BASIN + CY + YY + "_ships.txt", e.g.
   "26081418CP0126_ships.txt" for CP012026 at 18Z on 14 Aug 2026. Built rather than
   discovered so the fetch is one request instead of a directory listing per cycle. */
export function shipsFileName(stormId, cycleMs) {
  const m = /^([A-Z]{2})(\d{2})(\d{4})$/i.exec(String(stormId || "").trim());
  if (!m || cycleMs == null) return null;
  const d = new Date(cycleMs);
  if (isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${yy}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`
       + `${m[1].toUpperCase()}${m[2]}${String(m[3]).slice(2)}_ships.txt`;
}

/* The synoptic cycles to try, newest first. SHIPS runs at 00/06/12/18Z and lands about
   an hour later, so the current cycle may legitimately not exist yet — that is a normal
   state, not a failure, and the fetch walks back rather than reporting an outage. */
export function shipsCycles(nowMs, count = 4) {
  const out = [];
  const d = new Date(nowMs);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(Math.floor(d.getUTCHours() / 6) * 6);
  for (let i = 0; i < count; i++) out.push(d.getTime() - i * 6 * 3600e3);
  return out;
}

/* The RI probability that speaks to ONE threshold question: "does this storm gain enough
 * intensity, fast enough, to clear the strike?" Returns the tightest published threshold
 * whose intensity gain would be SUFFICIENT, so the number is a genuine lower bound on the
 * event rather than a loose proxy for it.
 *
 * Returns null when no published threshold is sufficient — an RI probability for a 20 kt
 * jump says nothing about a 45 kt gap, and stretching it to cover one would be the exact
 * fabrication this file refuses. */
export function riFloorFor(ships, gainNeededKt, withinHours) {
  if (!ships || !ships.ok || !(gainNeededKt > 0)) return null;
  const cons = ships.ri.consensus || null;
  const rows = (ships.ri.thresholds || []).filter((t) => t.dvKt >= gainNeededKt
    && (withinHours == null || t.hours <= withinHours));
  if (!rows.length) return null;
  /* Smallest sufficient jump = the most probable sufficient path. */
  rows.sort((a, b) => a.dvKt - b.dvKt || a.hours - b.hours);
  const best = rows[0];
  const key = `${best.dvKt}/${best.hours}`;
  const consRow = cons ? cons.find((c) => String(c.threshold).replace(/\s/g, "") === key) : null;
  return {
    dvKt: best.dvKt, hours: best.hours,
    p: best.p, climoP: best.climoP, ratioToClimo: best.ratioToClimo,
    consensusP: consRow ? consRow.p : null,
    basis: `SHIPS publishes a ${Math.round(best.p * 100)}% chance of a ${best.dvKt} kt gain in ${best.hours} h`
         + ` (${best.ratioToClimo}x the ${Math.round(best.climoP * 100)}% climatological rate)`
         + `, and ${best.dvKt} kt is enough to clear the ${Math.round(gainNeededKt)} kt gap to the strike`,
  };
}
