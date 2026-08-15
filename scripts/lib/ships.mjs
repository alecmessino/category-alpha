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
  ["sstC", "SST (C)", "sea-surface temperature"],
  ["mpiKt", "POT. INT. (KT)", "maximum potential intensity the ocean supports"],
  ["rhMid", "700-500 MB RH", "mid-level relative humidity"],
  ["ohc", "HEAT CONTENT", "ocean heat content (kJ/cm2)"],
  ["landKm", "LAND (KM)", "distance to land"],
  ["vNoLandKt", "V (KT) NO LAND", "SHIPS intensity forecast, no land interaction"],
  ["vLgemKt", "V (KT) LGEM", "LGEM intensity forecast"],
];

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
