/* Aircraft reconnaissance — the Vortex Data Message (VDM).
 *
 * WHY THIS IS THE VOLATILITY CATALYST. Every other intensity number on this board is an
 * estimate: satellite pattern-matching, a model, or a forecaster's judgement over those.
 * A VDM is a MEASUREMENT — an aircraft flew through the middle of the storm and read the
 * pressure off an instrument. When a plane finds a central pressure 12 mb lower than the
 * last advisory carried, the advisory that follows will move, and the market has not seen
 * it yet. That gap is the trade.
 *
 * The message is transmitted the moment the aircraft leaves the eye, typically an hour or
 * more before the intermediate advisory built on it. Nothing else this terminal reads has
 * that lead.
 *
 * PURE PARSER — no network, no clock. scripts/ingest.mjs does the polling.
 *
 * FORMAT, ESTABLISHED BY EVIDENCE. The lettered fields below were read off two live
 * products (URPN12 KNHC for CP012026, URNT12 KNHC for AL022026) rather than recalled:
 *
 *   URPN12 KNHC 142104
 *   VORTEX DATA MESSAGE   CP012026
 *   A. 14/20:46:50Z                    time of the center fix
 *   B. 17.33 deg N 151.19 deg W        center
 *   C. 700 mb 3077 m                   flight level
 *   D. 999 mb                          minimum sea-level pressure ("EXTRAP 1004 mb" when
 *                                      extrapolated rather than measured)
 *   H. 45 kt                           maximum surface wind, inbound leg
 *   J. 090 deg 51 kt                   maximum flight-level wind, inbound leg
 *   L. 29 kt                           maximum surface wind, outbound leg
 *   N. 252 deg 27 kt                   maximum flight-level wind, outbound leg
 *   U. AF305 0701C LALA    OB 04       mission, storm, observation number
 *   MAX FL WIND 51 KT 349 / 95 NM 20:19:00Z
 *
 * WHAT IS DELIBERATELY NOT PARSED. Fields E, F and G differ between the two live samples
 * and this build cannot state what they are, so they are captured verbatim and given no
 * meaning. Reading a number out of a field whose definition is a guess is exactly the
 * failure this file is supposed to prevent — a wrong wind speed looks identical to a
 * right one. The same rule kills the RECCO-coded URNT11/URPN11 products: their arrival is
 * recorded, their numbers are not decoded.
 *
 * SELF-CHECKING. The trailer line states the maximum flight-level wind in plain words.
 * When it disagrees with the lettered field, BOTH are published and the trailer governs,
 * because it is the unambiguous one. A silent disagreement would mean the letters have
 * shifted under us, so the disagreement is reported rather than resolved away.
 */

/* NHC's operational flight-level-to-surface reduction factors (Franklin, Black and
 * Valde 2003, adopted as NHC operational practice): a 700 mb flight-level wind is
 * multiplied by 0.90 to estimate the surface wind, an 850 mb wind by 0.80.
 *
 * Two levels, and nothing between them. A storm flown at 600 mb gets no calibrated
 * surface wind from this file at all — interpolating a factor nobody published would be
 * inventing the very number the board exists to source honestly. The RAW flight-level
 * wind is always published either way, so a refused reduction costs a derived figure,
 * never an observed one. */
export const FL_REDUCTION = { 700: 0.90, 850: 0.80 };

/* SFMR (the radiometer that reads surface wind directly) is specified by NOAA/AOC to
 * roughly 4 kt. It is the tightest current-intensity observation available to this board
 * and the reason a recon fix collapses the initial-condition uncertainty that a satellite
 * estimate carries. Declared here, used by the probability engine, cited on the frame. */
export const SFMR_SIGMA_KT = 4;
/* Aircraft-measured central pressure is good to ~2 mb; an EXTRAPOLATED one (the plane
 * flew above the surface and the value was reduced hydrostatically) is not the same
 * observation and is labelled as such everywhere it appears. */
export const RECON_PRESSURE_SIGMA_MB = 2;

const KT = /(-?\d+(?:\.\d+)?)\s*kt\b/i;

function fieldMap(text) {
  const out = {};
  /* Fields run to the end of the line and occasionally wrap; a continuation line is one
     that does not itself start a new lettered field. */
  let cur = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([A-Z])\.\s*(.*)$/.exec(line);
    if (m) { cur = m[1]; out[cur] = (m[2] || "").trim(); continue; }
    if (cur && line && !/^(MAX |SLP |REMARKS|;)/i.test(line) && !/^[A-Z]{4}\d{2}\s/.test(line)) {
      out[cur] = (out[cur] + " " + line).trim();
    }
    if (/^(MAX |SLP |;)/i.test(line)) cur = null;
  }
  return out;
}

/* "14/20:46:50Z" is a day-of-month and a time, with no month or year — the WMO header
 * carries the same day. The calling code supplies the reference clock so this stays pure;
 * a fix that lands in the future by more than a few hours is rolled back a month, which
 * is the same month-boundary rule the advisory-lag reader already uses. */
export function vdmTime(dayTime, refMs) {
  const m = /^(\d{2})\/(\d{2}):(\d{2})(?::(\d{2}))?Z?$/.exec(String(dayTime || "").trim());
  if (!m || refMs == null) return null;
  const day = Number(m[1]), hh = Number(m[2]), mm = Number(m[3]), ss = Number(m[4] || 0);
  const ref = new Date(refMs);

  /* Candidates are built rather than adjusted, because adjusting overshoots at the one
     place this has to be right. Rolling a date back by a month from "31 September" —
     which JavaScript has already silently turned into 1 October — lands on 1 September,
     a day that is not the 31st of anything and is a day late. The fix would be filed
     under the wrong date, aged wrongly, and diffed as an arrival that never happened.

     So each candidate month is constructed and then CHECKED: if the day-of-month did not
     survive, that month does not have that day and the candidate is discarded. */
  const build = (monthOffset) => {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + monthOffset, day, hh, mm, ss));
    return d.getUTCDate() === day && !isNaN(d.getTime()) ? d : null;
  };
  /* Only this month and last. A vortex data message reports a fix an aircraft has
     already made, so a candidate in the future is not a candidate — the small tolerance
     below is for clock skew between the transmitting site and this process, nothing
     more. */
  const SKEW_MS = 6 * 3600e3;
  const cands = [build(0), build(-1)].filter(Boolean).filter((d) => d.getTime() - refMs <= SKEW_MS);
  if (!cands.length) return null;
  // The most recent one that is not in the future — the aircraft flew as recently as it could have.
  cands.sort((a, b) => b.getTime() - a.getTime());
  return cands[0].toISOString();
}

function parseCenter(s) {
  const m = /(-?\d+(?:\.\d+)?)\s*deg\s*([NS])\s+(-?\d+(?:\.\d+)?)\s*deg\s*([EW])/i.exec(String(s || ""));
  if (!m) return null;
  const lat = Number(m[1]) * (/S/i.test(m[2]) ? -1 : 1);
  const lon = Number(m[3]) * (/W/i.test(m[4]) ? -1 : 1);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

/* A bare "45 kt" — a surface wind field. A field carrying a direction is a flight-level
   wind and is refused here, so the two can never be read into each other. */
function surfaceKt(s) {
  const t = String(s || "").trim();
  if (!t || /^NA$/i.test(t)) return null;
  if (/\bdeg\b/i.test(t)) return null;
  const m = KT.exec(t);
  const v = m ? Number(m[1]) : null;
  return Number.isFinite(v) && v > 0 && v < 250 ? v : null;
}
/* "090 deg 51 kt" — direction and speed. */
function flightKt(s) {
  const t = String(s || "").trim();
  if (!t || /^NA$/i.test(t)) return null;
  const m = /(\d{1,3})\s*deg\s+(\d+(?:\.\d+)?)\s*kt/i.exec(t);
  if (!m) return null;
  const kt = Number(m[2]);
  return Number.isFinite(kt) && kt > 0 && kt < 250 ? { dir: Number(m[1]), kt } : null;
}

export function parseVDM(text, refMs) {
  const raw = String(text || "");
  const head = /^\s*([A-Z]{4}\d{2})\s+([A-Z]{4})\s+(\d{6})\s*$/m.exec(raw);
  const idm = /VORTEX DATA MESSAGE\s+([A-Z]{2}\d{6})/i.exec(raw);
  if (!idm) {
    return { ok: false, note: "no VORTEX DATA MESSAGE header — not a VDM",
             sample: raw.trim().split(/\r?\n/).slice(0, 3).join(" | ").slice(0, 160) };
  }
  const F = fieldMap(raw);
  const stormId = idm[1].toUpperCase();

  const fixIso = vdmTime(F.A, refMs);
  const center = parseCenter(F.B);

  /* Flight level: "700 mb 3077 m". The pressure here is the LEVEL FLOWN, never the
     storm's central pressure, and mixing the two would report a 700 mb hurricane. */
  const flm = /(\d{3,4})\s*mb/.exec(String(F.C || ""));
  const flightLevelMb = flm ? Number(flm[1]) : null;

  /* Central pressure, from D only. "EXTRAP" marks a value the aircraft did not measure
     at the surface but reduced to it — a materially weaker observation, carried as a
     flag rather than folded away. */
  const dRaw = String(F.D || "").trim();
  const extrapolated = /EXTRAP/i.test(dRaw) || /SLP EXTRAP/i.test(raw);
  const dm = /(\d{3,4})\s*mb/.exec(dRaw);
  let mslp = dm ? Number(dm[1]) : null;
  if (mslp != null && (mslp < 850 || mslp > 1050)) mslp = null;   // not a sea-level pressure

  const sfcIn = surfaceKt(F.H), sfcOut = surfaceKt(F.L);
  const flIn = flightKt(F.J), flOut = flightKt(F.N);

  /* The trailer states the maximum flight-level wind unambiguously. It governs. */
  const tr = /MAX\s+FL\s+WIND\s+(\d+(?:\.\d+)?)\s*KT/i.exec(raw);
  const trailerFlKt = tr ? Number(tr[1]) : null;
  const letterFlKt = [flIn, flOut].filter(Boolean).map((x) => x.kt);
  const maxLetterFl = letterFlKt.length ? Math.max(...letterFlKt) : null;
  const flDisagreement = (trailerFlKt != null && maxLetterFl != null && Math.abs(trailerFlKt - maxLetterFl) > 0.5)
    ? { trailer: trailerFlKt, lettered: maxLetterFl } : null;
  const flightKtMax = trailerFlKt != null ? trailerFlKt : maxLetterFl;

  const surfaceKtMax = [sfcIn, sfcOut].filter((x) => x != null).length
    ? Math.max(...[sfcIn, sfcOut].filter((x) => x != null)) : null;

  /* The calibrated surface wind: the published reduction factor applied to the measured
     flight-level wind. Published NEXT TO the raw flight-level number, never instead of
     it, and null when the level flown has no published factor. */
  const factor = flightLevelMb != null ? (FL_REDUCTION[flightLevelMb] ?? null) : null;
  const reducedKt = (factor != null && flightKtMax != null) ? Math.round(flightKtMax * factor) : null;

  /* Mission line: "AF305 0701C LALA    OB 04". Matched by shape anywhere in the message
     rather than by assuming which letter carries it, because that letter has moved
     between message versions and the shape has not. */
  const mm = /\b((?:AF|NOAA)\s?\d{2,3}[A-Z]?)\s+(\d{4}[A-Z])\s+([A-Z][A-Z0-9'-]*)\s*(?:OB\s*(\d+))?/i.exec(raw);
  const mission = mm ? { aircraft: mm[1].replace(/\s+/g, ""), number: mm[2], storm: mm[3], ob: mm[4] ? Number(mm[4]) : null } : null;

  const usable = mslp != null || surfaceKtMax != null || flightKtMax != null;
  if (!usable) {
    return { ok: false, stormId, fixIso, note: "VDM parsed but carried no pressure or wind",
             sample: Object.entries(F).slice(0, 8).map(([k, v]) => k + "=" + v).join(" | ").slice(0, 200) };
  }

  return {
    ok: true,
    stormId, fixIso, center,
    wmo: head ? head[1] + " " + head[2] : null,
    issuedDdhhmm: head ? head[3] : null,
    flightLevelMb, mslp, extrapolated,
    /* RAW and CALIBRATED, side by side, exactly as measured and exactly as reduced. */
    surfaceKt: surfaceKtMax, surfaceInboundKt: sfcIn, surfaceOutboundKt: sfcOut,
    flightLevelKt: flightKtMax, flightInbound: flIn, flightOutbound: flOut,
    reducedSurfaceKt: reducedKt, reductionFactor: factor,
    flDisagreement,
    mission, obNumber: mission ? mission.ob : null,
    /* The strongest defensible surface intensity from this fix: the measured SFMR wind
       when there is one, otherwise the published reduction of the measured flight-level
       wind. Which of the two answered is always stated. */
    intensityKt: surfaceKtMax != null ? surfaceKtMax : reducedKt,
    intensitySource: surfaceKtMax != null ? "SFMR surface wind" : (reducedKt != null ? "flight-level wind reduced by the published factor" : null),
    unparsed: { E: F.E ?? null, F: F.F ?? null, G: F.G ?? null },
    raw: raw.trim().slice(0, 1400),
  };
}

/* URNT11 / URPN11 are RECCO-coded observations, not VDMs. Their ARRIVAL is evidence that
 * an aircraft is in the storm; their contents are a numeric code this build does not
 * decode, and it says so rather than guessing at digits. */
export function parseReccoHeader(text) {
  const raw = String(text || "");
  const head = /^\s*([A-Z]{4}\d{2})\s+([A-Z]{4})\s+(\d{6})\s*$/m.exec(raw);
  if (!head) return { ok: false, note: "no WMO header" };
  const mm = /\bRMK\s+((?:AF|NOAA)\s?\d{2,3}[A-Z]?)\s+(\d{4}[A-Z])\s+([A-Z][A-Z0-9'-]*)/i.exec(raw);
  return {
    ok: true, wmo: head[1] + " " + head[2], issuedDdhhmm: head[3],
    mission: mm ? { aircraft: mm[1].replace(/\s+/g, ""), number: mm[2], storm: mm[3] } : null,
    lastReport: /LAST REPORT/i.test(raw),
    note: "RECCO-coded observation — arrival recorded, contents not decoded",
    raw: raw.trim().slice(0, 400),
  };
}

/* Was this fix worth calling a new one? A VDM sits in the "latest" file until the next
 * message replaces it, so the same message is re-read every cycle. Identity is the fix
 * time plus the observation number — the pair that changes when, and only when, the
 * aircraft reports again. */
export function vdmKey(v) {
  if (!v || !v.ok) return null;
  return [v.stormId, v.fixIso || "?", v.obNumber == null ? "?" : v.obNumber].join("|");
}
