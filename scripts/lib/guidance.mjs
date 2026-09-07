/* Track and intensity guidance — the whole a-deck, reduced to what a reader can interrogate.
 *
 * WHY THIS EXISTS. scripts/lib/atcf.mjs already reads every aid in the deck and keeps three of
 * them: the corrected consensus, the variable consensus and DeepMind, because those are what the
 * probability engine needs. Everything else — the global models, the hurricane models, the
 * ensemble means, the statistical intensity aids, the official forecast itself — was parsed and
 * dropped on every ten-minute tick. That is the raw material of every "spaghetti" plot on the
 * web, and this module turns it into measurements instead of a picture:
 *
 *   TRACK SPREAD      how far the members sit from their own centroid at each lead
 *   INTENSITY SPREAD  the range of the members' winds at each lead
 *   SCENARIO COUNT    how many distinct clusters the members fall into, by distance
 *   CYCLE TREND       whether that spread tightened or widened since the previous cycle
 *   NHC VS CONSENSUS  where the official forecast sits relative to the consensus and the centroid
 *
 * WHAT IT IS NOT, stated in the output and enforced by scripts/test-guidance.mjs:
 *
 *   - A member count is not a probability. "7 of 9 members go west" is a fact about seven
 *     model runs; it is not P(west). No field here is a fraction of members and no field is
 *     named as if it were.
 *   - The envelope is not the NHC cone. The cone is NHC's published track-error radius around
 *     NHC's forecast; the spread is the disagreement between model runs. They are different
 *     quantities with different owners and are never merged.
 *   - A cluster is a heuristic partition by distance, at a threshold stated in the output.
 *   - Nothing here enters a price. The Kelly / grading path reads the probability engine, and
 *     the probability engine does not import this module. That is asserted by the test.
 *
 * PURE. No network, no clock: the caller supplies `fetchedAt` and, for replay, `asOf`.
 */
import { atcfTimeIso, TRACK_CONSENSUS } from "./atcf.mjs";

export const GUIDANCE_CADENCE_MIN = 360;   // a synoptic cycle: 00/06/12/18Z
export const LEADS = [24, 48, 72, 96, 120];

/* THE ROSTER — named, not pattern-matched, because "whatever looks like a model" is how a
 * baseline (CLP5, XTRP) or a thirty-member perturbation set ends up counted as guidance.
 *
 * Each family lists its IDs in preference order and the first one the cycle carries answers.
 * The early-cycle "I" forms (interpolated from the previous run, available at the synoptic time)
 * are preferred over the late forms (HWRF, AVNO...) that land hours later, because at any given
 * cycle the late forms are still running: a latest-cycle census taken while they are absent would
 * otherwise read as "HWRF did not run" when it means "HWRF has not finished".
 *
 *   spread  — enters the track-spread / scenario computation
 *   fan     — enters the intensity fan
 * The official forecast and the consensus aids are shown against the members, never inside them:
 * a consensus IS the members averaged, and counting it as one more member double-counts the lot.
 */
export const ROSTER = [
  { key: "OFCL", ids: ["OFCL"],          label: "NHC official forecast",          cls: "official",      spread: false, fan: false },
  { key: "TVCN", ids: TRACK_CONSENSUS,   label: "track consensus",                cls: "consensus",     spread: false, fan: false },
  { key: "HCCA", ids: ["HCCA"],          label: "HFIP corrected consensus",       cls: "consensus",     spread: false, fan: false },
  { key: "IVCN", ids: ["IVCN", "IVDR"],  label: "intensity consensus",            cls: "consensus",     spread: false, fan: false },
  { key: "GFS",  ids: ["AVNI", "AVNO"],  late: ["AVNO"], label: "GFS",                            cls: "global",        spread: true,  fan: false },
  { key: "UKM",  ids: ["UKXI", "UKX2", "UKX"], late: ["UKX"], label: "UKMET",                    cls: "global",        spread: true,  fan: false },
  { key: "CMC",  ids: ["CMCI", "CMC2", "CMC"], late: ["CMC"], label: "Canadian GEM",             cls: "global",        spread: true,  fan: false },
  { key: "NVG",  ids: ["NVGI", "NVG2"],  label: "NAVGEM",                         cls: "global",        spread: true,  fan: false },
  { key: "GEFS", ids: ["AEMI", "AEMN"],  late: ["AEMN"], label: "GEFS ensemble mean",             cls: "ensemble-mean", spread: true,  fan: false },
  { key: "GEPS", ids: ["CEMI", "CEMN"],  late: ["CEMN"], label: "Canadian ensemble mean",         cls: "ensemble-mean", spread: true,  fan: false },
  { key: "HWRF", ids: ["HWFI", "HWRF"],  late: ["HWRF"], label: "HWRF",                           cls: "hurricane",     spread: true,  fan: true },
  { key: "HAFA", ids: ["HFAI", "HFSA"],  late: ["HFSA"], label: "HAFS-A",                         cls: "hurricane",     spread: true,  fan: true },
  { key: "HAFB", ids: ["HFBI", "HFSB"],  late: ["HFSB"], label: "HAFS-B",                         cls: "hurricane",     spread: true,  fan: true },
  { key: "HMON", ids: ["HMNI", "HMON"],  late: ["HMON"], label: "HMON",                           cls: "hurricane",     spread: true,  fan: true },
  { key: "CTC",  ids: ["CTCI", "CTCX"],  late: ["CTCX"], label: "COAMPS-TC",                      cls: "hurricane",     spread: true,  fan: true },
  { key: "GDM",  ids: ["GDMI", "GDMN"],  late: ["GDMN"], label: "DeepMind",                       cls: "ai",            spread: true,  fan: true },
  { key: "SHIP", ids: ["SHIP"],          label: "SHIPS",                          cls: "statistical",   spread: false, fan: true },
  { key: "DSHP", ids: ["DSHP"],          label: "decay SHIPS",                    cls: "statistical",   spread: false, fan: true },
  { key: "LGEM", ids: ["LGEM"],          label: "LGEM",                           cls: "statistical",   spread: false, fan: true },
];

/* Deliberately outside the roster, and named so the census can say so. */
export const BASELINES = ["CLP5", "XTRP", "TABS", "TABM", "TABD", "TCLP", "OCD5", "DRCL", "SHF5", "CARQ", "OFCI"];
const ENSEMBLE_MEMBER = /^(AP|AC|AN|EP|EC|EN|CP|CC|CN|UP|NP|NC)\d{2}$/;

/* The partition threshold at each lead, in km. A stated heuristic: two members within this
   distance of each other at that lead are one scenario. The numbers are roughly twice NHC's
   published mean track errors at those leads, so "one scenario" means "closer together than
   the official forecast is usually wrong by". It is a partition rule, not a probability. */
export function scenarioThresholdKm(hr) { return Math.round(150 + 3.5 * hr); }

const R_EARTH = 6371.0088;
export function haversineKm(lat1, lon1, lat2, lon2) {
  const d = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * d) / 2) ** 2
    + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(((lon2 - lon1) * d) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}

const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r0 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v));
function median(vals) {
  const v = vals.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function addHours(iso, h) { const t = Date.parse(iso); return t ? new Date(t + h * 3600000).toISOString() : null; }

/* Position of one track at an arbitrary lead, linearly interpolated between the two rows
   that bracket it. Returns null when the lead is outside what the aid forecast — never an
   extrapolation, because a track that ends at 72h has said nothing about 96h. */
export function positionAt(track, hr) {
  if (!track || !track.length) return null;
  const exact = track.find((p) => p.hr === hr);
  if (exact) return { lat: exact.lat, lon: exact.lon, interpolated: false };
  let lo = null, hi = null;
  for (const p of track) {
    if (p.hr < hr && (!lo || p.hr > lo.hr)) lo = p;
    if (p.hr > hr && (!hi || p.hr < hi.hr)) hi = p;
  }
  if (!lo || !hi) return null;
  const f = (hr - lo.hr) / (hi.hr - lo.hr);
  /* Unwrap across the antimeridian before interpolating; the Central Pacific decks cross it. */
  let dlon = hi.lon - lo.lon;
  if (dlon > 180) dlon -= 360; else if (dlon < -180) dlon += 360;
  let lon = lo.lon + f * dlon;
  if (lon > 180) lon -= 360; else if (lon < -180) lon += 360;
  return { lat: lo.lat + f * (hi.lat - lo.lat), lon, interpolated: true };
}
function intensityAt(intensity, hr) {
  const p = (intensity || []).find((x) => x.hr === hr);
  return p ? p.kt : null;
}
/* The previous cycle is sampled at the CURRENT cycle's valid times, which fall between its own
   taus (a 6-hour gap against 12-hour rows). Linear between the two bracketing rows, never beyond
   the last one — and every consumer of this labels the result as interpolated. */
export function intensityAtInterp(intensity, hr) {
  const exact = intensityAt(intensity, hr);
  if (exact != null) return exact;
  let lo = null, hi = null;
  for (const p of intensity || []) {
    if (p.hr < hr && (!lo || p.hr > lo.hr)) lo = p;
    if (p.hr > hr && (!hi || p.hr < hi.hr)) hi = p;
  }
  if (!lo || !hi) return null;
  return lo.kt + ((hr - lo.hr) / (hi.hr - lo.hr)) * (hi.kt - lo.kt);
}

/* Mean position of a set of points, with the longitudes unwrapped about the first one so a
   set straddling 180 does not average to the wrong hemisphere. */
function centroidOf(pts) {
  if (!pts.length) return null;
  const lon0 = pts[0].lon;
  let lat = 0, lon = 0;
  for (const p of pts) {
    lat += p.lat;
    let dl = p.lon - lon0;
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    lon += lon0 + dl;
  }
  lat /= pts.length; lon /= pts.length;
  if (lon > 180) lon -= 360; else if (lon < -180) lon += 360;
  return { lat, lon };
}

/* Single-linkage partition: members closer than `thresholdKm` to any member of a cluster join
   it. Returns clusters as arrays of tech ids, largest first. Deterministic for a given input
   order (members are sorted by tech before partitioning). */
export function partition(points, thresholdKm) {
  const pts = [...points].sort((a, b) => (a.tech < b.tech ? -1 : 1));
  const clusters = [];
  const seen = new Set();
  for (const p of pts) {
    if (seen.has(p.tech)) continue;
    const c = [p]; seen.add(p.tech);
    for (let i = 0; i < c.length; i++) {
      for (const q of pts) {
        if (seen.has(q.tech)) continue;
        if (haversineKm(c[i].lat, c[i].lon, q.lat, q.lon) <= thresholdKm) { c.push(q); seen.add(q.tech); }
      }
    }
    clusters.push(c.map((x) => x.tech));
  }
  return clusters.sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
}

/* One cycle's roster, resolved against what the cycle actually carries. */
function resolveCycle(cycle) {
  const byTech = new Map();
  for (const r of cycle.rows) {
    let arr = byTech.get(r.tech);
    if (!arr) { arr = []; byTech.set(r.tech, arr); }
    arr.push(r);
  }
  const aids = [];
  const missing = [];
  for (const fam of ROSTER) {
    const id = fam.ids.find((x) => byTech.has(x) && byTech.get(x).some((r) => r.tau > 0));
    if (!id) { missing.push({ key: fam.key, label: fam.label, ids: fam.ids }); continue; }
    const rows = byTech.get(id).filter((r) => r.tau >= 0).sort((a, b) => a.tau - b.tau);
    const track = rows.filter((r) => r.lat != null && r.lon != null).map((r) => ({ hr: r.tau, lat: r.lat, lon: r.lon }));
    const intensity = rows.filter((r) => r.vmax != null).map((r) => ({ hr: r.tau, kt: r.vmax }));
    const peak = intensity.length ? intensity.reduce((a, b) => (b.kt > a.kt ? b : a), intensity[0]) : null;
    aids.push({
      key: fam.key, tech: id, label: fam.label, cls: fam.cls,
      inSpread: fam.spread && track.length > 1,
      inFan: fam.fan && intensity.length > 1,
      late: !!(fam.late && fam.late.includes(id)),   // a late form answered because the early one was absent
      track, intensity,
      peakKt: peak ? peak.kt : null, peakHr: peak ? peak.hr : null,
    });
  }
  const techs = Object.keys(cycle.techs || {});
  return {
    aids, missing,
    ensembleMembers: techs.filter((t) => ENSEMBLE_MEMBER.test(t)).length,
    baselines: techs.filter((t) => BASELINES.includes(t)).sort(),
    unlisted: techs.filter((t) => !ENSEMBLE_MEMBER.test(t) && !BASELINES.includes(t)
      && !ROSTER.some((f) => f.ids.includes(t))).sort(),
  };
}

/* Spread statistics for one lead of one cycle, with an optional `offsetHr` so the PREVIOUS cycle
   can be sampled at the CURRENT cycle's valid time (its tau is the current tau plus the gap
   between the two cycles). Every aid is interpolated along its own track; an aid whose track
   does not reach the lead is absent, and `n` says so. */
function leadStats(res, hr, offsetHr) {
  const at = hr + (offsetHr || 0);
  const pts = [];
  for (const a of res.aids) {
    if (!a.inSpread) continue;
    const p = positionAt(a.track, at);
    if (p) pts.push({ tech: a.tech, key: a.key, lat: p.lat, lon: p.lon });
  }
  const cen = centroidOf(pts);
  const dists = cen ? pts.map((p) => haversineKm(cen.lat, cen.lon, p.lat, p.lon)) : [];
  const meanKm = pts.length >= 2 ? dists.reduce((x, y) => x + y, 0) / dists.length : null;
  const maxKm = pts.length >= 2 ? Math.max(...dists) : null;
  const ofclAid = res.aids.find((a) => a.cls === "official");
  const ofcl = ofclAid ? positionAt(ofclAid.track, at) : null;
  const conAid = res.aids.find((a) => a.key === "TVCN");
  const con = conAid ? positionAt(conAid.track, at) : null;
  return {
    n: pts.length, pts, centroid: cen, meanKm, maxKm,
    ofcl: ofcl ? { lat: ofcl.lat, lon: ofcl.lon, offsetKm: cen ? haversineKm(cen.lat, cen.lon, ofcl.lat, ofcl.lon) : null } : null,
    consensus: con ? { tech: conAid.tech, lat: con.lat, lon: con.lon, offsetKm: cen ? haversineKm(cen.lat, cen.lon, con.lat, con.lon) : null } : null,
    ofclVsConsensusKm: ofcl && con ? haversineKm(ofcl.lat, ofcl.lon, con.lat, con.lon) : null,
    ofclKt: ofclAid ? intensityAt(ofclAid.intensity, at) : null,
    fanKts: res.aids.filter((a) => a.inFan).map((a) => intensityAt(a.intensity, at)).filter((k) => k != null),
  };
}

/**
 * @param {{kept: Array<{cycle, cycleIso, rows, techs}>}} deck  from parseAdeckCycles
 * @param {{fetchedAt?: string, asOf?: string}} opts
 *   asOf — replay guard. A cycle whose date-time group is AFTER `asOf` cannot have been knowable
 *   at `asOf` and is dropped. The DTG is a LOWER bound on availability (the aids land one to
 *   four hours after it); the terminal's own frames record when each cycle was first seen, and
 *   that is the tighter bound for replay. This guard exists so the engine can never be handed a
 *   future cycle by accident.
 */
export function guidanceFrom(deck, opts) {
  const o = opts || {};
  if (!deck || !deck.ok || !deck.kept || !deck.kept.length) return null;
  let cycles = deck.kept;
  if (o.asOf) {
    const cut = Date.parse(o.asOf);
    if (cut) cycles = cycles.filter((c) => Date.parse(c.cycleIso) <= cut);
  }
  if (!cycles.length) return null;
  const cur = cycles[cycles.length - 1];
  const prev = cycles.length > 1 ? cycles[cycles.length - 2] : null;
  const res = resolveCycle(cur);
  const pres = prev ? resolveCycle(prev) : null;
  const gapHr = prev ? Math.round((Date.parse(cur.cycleIso) - Date.parse(prev.cycleIso)) / 3600000) : null;
  if (!res.aids.length) return null;

  const leads = LEADS.map((hr) => {
    const s = leadStats(res, hr, 0);
    const thr = scenarioThresholdKm(hr);
    const clusters = s.n ? partition(s.pts, thr) : [];
    const p = pres ? leadStats(pres, hr, gapHr) : null;
    const prevOut = p && p.n ? {
      n: p.n,
      centroidShiftKm: s.centroid && p.centroid ? r0(haversineKm(p.centroid.lat, p.centroid.lon, s.centroid.lat, s.centroid.lon)) : null,
      meanKm: r0(p.meanKm),
      spreadDeltaKm: s.meanKm != null && p.meanKm != null ? r0(s.meanKm - p.meanKm) : null,
      ofclShiftKm: s.ofcl && p.ofcl ? r0(haversineKm(p.ofcl.lat, p.ofcl.lon, s.ofcl.lat, s.ofcl.lon)) : null,
    } : null;
    return {
      hr, validZ: addHours(cur.cycleIso, hr),
      n: s.n,
      centroid: s.centroid ? [r1(s.centroid.lat), r1(s.centroid.lon)] : null,
      meanKm: r0(s.meanKm), maxKm: r0(s.maxKm),
      ofcl: s.ofcl ? { lat: r1(s.ofcl.lat), lon: r1(s.ofcl.lon), offsetKm: r0(s.ofcl.offsetKm) } : null,
      consensus: s.consensus ? { tech: s.consensus.tech, lat: r1(s.consensus.lat), lon: r1(s.consensus.lon), offsetKm: r0(s.consensus.offsetKm) } : null,
      ofclVsConsensusKm: r0(s.ofclVsConsensusKm),
      thresholdKm: thr,
      clusters,
      scenarios: clusters.filter((c) => c.length >= 2).length,
      outliers: clusters.filter((c) => c.length === 1).map((c) => c[0]),
      prev: prevOut,
    };
  });

  /* The intensity fan, at every lead the deck carries up to 120h. Exact taus only — a wind
     interpolated between two runs of the same model is a number nobody forecast. */
  const fanHrs = [...new Set(res.aids.filter((a) => a.inFan || a.cls === "official" || a.key === "IVCN" || a.key === "HCCA")
    .flatMap((a) => a.intensity.map((x) => x.hr)))].filter((h) => h <= 120 && h % 12 === 0).sort((a, b) => a - b);
  const ofclAid = res.aids.find((a) => a.cls === "official");
  const pOfclAid = pres ? pres.aids.find((a) => a.cls === "official") : null;
  const ivcn = res.aids.find((a) => a.key === "IVCN");
  const hcca = res.aids.find((a) => a.key === "HCCA");
  const intensityFan = fanHrs.map((hr) => {
    const kts = res.aids.filter((a) => a.inFan).map((a) => intensityAt(a.intensity, hr)).filter((k) => k != null);
    const pk = pres ? pres.aids.filter((a) => a.inFan).map((a) => intensityAtInterp(a.intensity, hr + gapHr)).filter((k) => k != null) : [];
    return {
      hr, validZ: addHours(cur.cycleIso, hr), n: kts.length,
      min: kts.length ? Math.min(...kts) : null,
      median: r0(median(kts)),
      max: kts.length ? Math.max(...kts) : null,
      ofcl: ofclAid ? intensityAt(ofclAid.intensity, hr) : null,
      ivcn: ivcn ? intensityAt(ivcn.intensity, hr) : null,
      hcca: hcca ? intensityAt(hcca.intensity, hr) : null,
      prevOfcl: pOfclAid ? r0(intensityAtInterp(pOfclAid.intensity, hr + gapHr)) : null,
      prevMedian: r0(median(pk)),
      prevInterpolated: true,
    };
  });

  const fanMembers = res.aids.filter((a) => a.inFan && a.peakKt != null);
  const peakKts = fanMembers.map((a) => a.peakKt);
  const peaks = {
    members: fanMembers.map((a) => ({ tech: a.tech, label: a.label, kt: a.peakKt, hr: a.peakHr })),
    n: fanMembers.length,
    min: peakKts.length ? Math.min(...peakKts) : null,
    median: r0(median(peakKts)),
    max: peakKts.length ? Math.max(...peakKts) : null,
    medianHr: r0(median(fanMembers.map((a) => a.peakHr))),
    ofcl: ofclAid && ofclAid.peakKt != null ? { kt: ofclAid.peakKt, hr: ofclAid.peakHr } : null,
    prevOfcl: pOfclAid && pOfclAid.peakKt != null ? { kt: pOfclAid.peakKt, hr: pOfclAid.peakHr } : null,
    prevMedian: pres ? r0(median(pres.aids.filter((a) => a.inFan).map((a) => a.peakKt))) : null,
  };

  /* The trend, read at 72h — the lead the desk watches — and only when both cycles held enough
     members there for a spread to exist. Below the bar the trend is null, never "steady". */
  const l72 = leads.find((l) => l.hr === 72);
  let trend = null;
  if (l72 && l72.prev && l72.meanKm != null && l72.prev.meanKm != null && l72.n >= 3 && l72.prev.n >= 3) {
    const pct = l72.prev.meanKm > 0 ? ((l72.meanKm - l72.prev.meanKm) / l72.prev.meanKm) * 100 : null;
    const label = pct == null ? null : pct <= -15 ? "tightening" : pct >= 15 ? "widening" : "steady";
    trend = { hr: 72, label, spreadDeltaKm: l72.prev.spreadDeltaKm, spreadDeltaPct: r0(pct), centroidShiftKm: l72.prev.centroidShiftKm };
  }

  /* Tracks and intensities carried out, truncated to 120h and rounded to source precision.
     The deck prints tenths of a degree, so a tenth is the whole of the information. */
  const aids = res.aids.map((a) => ({
    key: a.key, tech: a.tech, label: a.label, cls: a.cls, inSpread: a.inSpread, inFan: a.inFan, late: a.late,
    track: a.track.filter((p) => p.hr <= 120).map((p) => ({ hr: p.hr, validZ: addHours(cur.cycleIso, p.hr), lat: r1(p.lat), lon: r1(p.lon) })),
    intensity: a.intensity.filter((p) => p.hr <= 120).map((p) => ({ hr: p.hr, kt: p.kt })),
    peakKt: a.peakKt, peakHr: a.peakHr,
  }));
  const prevOfclTrack = pOfclAid ? pOfclAid.track.filter((p) => p.hr <= 126)
    .map((p) => ({ hr: p.hr, validZ: addHours(prev.cycleIso, p.hr), lat: r1(p.lat), lon: r1(p.lon) })) : null;

  const int72 = intensityFan.find((f) => f.hr === 72);
  return {
    schema: "millibar-guidance/1",
    source: { name: "NHC ATCF a-deck (aid_public)", kind: "raw model guidance" },
    cycle: cur.cycle, cycleIso: cur.cycleIso,
    validZ: cur.cycleIso,
    fetchedAt: o.fetchedAt || null,
    cadenceMin: GUIDANCE_CADENCE_MIN,
    previousCycle: prev ? prev.cycle : null, previousCycleIso: prev ? prev.cycleIso : null, cycleGapHr: gapHr,
    semantics: {
      kind: "raw model guidance",
      isProbability: false,
      isForecastCone: false,
      note: "Each line is one model run. A count of members is a count of runs, not a probability; "
          + "the spread is model disagreement, not the NHC cone; clusters are a distance partition at a stated threshold.",
    },
    roster: {
      present: aids.map((a) => a.tech),
      inSpread: aids.filter((a) => a.inSpread).map((a) => a.tech),
      inFan: aids.filter((a) => a.inFan).map((a) => a.tech),
      missing: res.missing,
      lateForms: aids.filter((a) => a.late).map((a) => a.tech),
      excluded: { ensembleMembers: res.ensembleMembers, baselines: res.baselines, unlisted: res.unlisted },
      /* Whether the core deterministic set answered. A partial cycle is normal in the first hours
         after the synoptic time and a reader should see it as partial, not as disagreement. */
      complete: res.missing.filter((m) => ROSTER.find((f) => f.key === m.key).spread).length === 0,
    },
    aids,
    prevOfclTrack,
    leads,
    intensityFan,
    peaks,
    trend,
    summary: {
      trackSpread72Km: l72 ? l72.meanKm : null,
      trackSpreadMax72Km: l72 ? l72.maxKm : null,
      n72: l72 ? l72.n : 0,
      intensitySpread72Kt: int72 && int72.n >= 2 ? int72.max - int72.min : null,
      intensityN72: int72 ? int72.n : 0,
      scenarios72: l72 ? l72.scenarios : null,
      scenarios120: (leads.find((l) => l.hr === 120) || {}).scenarios ?? null,
      ofclVsConsensus72Km: l72 ? l72.ofclVsConsensusKm : null,
      ofclOffset72Km: l72 && l72.ofcl ? l72.ofcl.offsetKm : null,
      cycleShift72Km: l72 && l72.prev ? l72.prev.centroidShiftKm : null,
      ofclShift72Km: l72 && l72.prev ? l72.prev.ofclShiftKm : null,
      trend: trend ? trend.label : null,
      peakMedianKt: peaks.median, peakOfclKt: peaks.ofcl ? peaks.ofcl.kt : null,
      peakDeltaVsPrevKt: peaks.median != null && peaks.prevMedian != null ? peaks.median - peaks.prevMedian : null,
      ofclPeakDeltaVsPrevKt: peaks.ofcl && peaks.prevOfcl ? peaks.ofcl.kt - peaks.prevOfcl.kt : null,
    },
  };
}

/* The scalars a replay frame carries, so the register can diff them and the scrubber can rewind
   them. Every one is null when the quantity does not exist — never 0. */
export function guidanceFrameScalars(g) {
  if (!g) return { gCycle: null, gN72: null, gTrack72: null, gInt72: null, gScen72: null, gOfclCon72: null, gPeakMed: null, gPeakOfcl: null };
  const s = g.summary || {};
  return {
    gCycle: g.cycle, gN72: s.n72 || null, gTrack72: s.trackSpread72Km, gInt72: s.intensitySpread72Kt,
    gScen72: s.scenarios72, gOfclCon72: s.ofclVsConsensus72Km, gPeakMed: s.peakMedianKt, gPeakOfcl: s.peakOfclKt,
  };
}

/* The genesis point, from the b-deck: the first fix the forecasters wrote down. This is the
   position the Storm Atlas conditions on — where the storm FORMED — and it is never the
   current position, which is what a naive bridge would pass. */
export function genesisFromBestTrack(records) {
  const r = (records || []).find((x) => x.lat != null && x.lon != null);
  if (!r) return null;
  return { lat: r.lat, lon: r.lon, iso: r.iso, month: r.iso ? new Date(r.iso).getUTCMonth() + 1 : null,
           kt: r.kt ?? null, source: "NHC ATCF b-deck first fix" };
}
