/* ATCF deck parsers — a-deck (guidance), b-deck (best track), f-deck (fixes).
 *
 * WHY THIS EXISTS. Every number on this board used to arrive after NHC had already
 * written it into a public advisory, which is the same moment the market reads it. The
 * decks are the layer underneath: the aids land in the a-deck as soon as the models
 * finish, typically 30-60 minutes before the advisory built from them is issued. That
 * window is the only structural head-start this terminal can have, and it is why the
 * a-deck is priority one.
 *
 * These are PURE parsers — no network, no clock. Everything that fetches lives in
 * scripts/ingest.mjs, so the formats can be tested against committed fixtures.
 *
 * FORMAT, ESTABLISHED BY EVIDENCE rather than from memory. Every field index below was
 * read off a live deck (acp012026 / fcp012026, 14 Aug 2026) before it was written down:
 *
 *   a-deck  CP, 01, 2026081418, 03, HCCA, 132, 236N, 1732W, 113, 0, , 0, , 0,0,0,0
 *           0    1   2           3   4     5    6     7      8   9  10 11 12 13..16
 *           basin cy  cycle    technum tech tau  lat  lon   vmax mslp ty rad code radii
 *
 *   f-deck  CP, 01, 202608140921, 31, OSCT, CI, , 1652N, 14868W, , 3, 40, 3, , 3, ...
 *           0    1   2             3   4     5   6  7      8      9 10  11  12 13 14
 *           basin cy  time      format type ci flag lat  lon  height posC vmax vC pres pC
 *
 * TWO TRAPS THE LIVE DATA CONTAINS, both handled here rather than downstream:
 *
 *  1. A ZERO IS A MISSING VALUE, NOT A FORECAST. TVCN — the track consensus — ships
 *     vmax=0 on every row, because it is a TRACK aid and has no intensity to give.
 *     Reading that as "the consensus forecasts 0 kt" would drag every blend it touches
 *     to nothing. Zero vmax and zero mslp are nulled here, at the parse boundary.
 *  2. ONE FORECAST APPEARS ON SEVERAL ROWS. Each wind-radius threshold (34/50/64 kt)
 *     repeats the whole record, so a naive read counts one aid three times and a
 *     "member spread" computed over it is spuriously tight. Rows are keyed on
 *     (tech, tau) and merged.
 */

/* Lat/lon arrive in tenths of a degree with a hemisphere suffix: "236N" is 23.6N,
   "1732W" is 173.2W. A bare number with no hemisphere is not a position we can place,
   so it is refused rather than assumed to be northern and western. */
export function atcfLat(s) {
  const m = /^(-?\d+)\s*([NS])$/i.exec(String(s || "").trim());
  if (!m) return null;
  const v = Number(m[1]) / 10;
  if (!Number.isFinite(v) || v === 0) return null;
  return /S/i.test(m[2]) ? -v : v;
}
export function atcfLon(s) {
  const m = /^(-?\d+)\s*([EW])$/i.exec(String(s || "").trim());
  if (!m) return null;
  const v = Number(m[1]) / 10;
  if (!Number.isFinite(v) || v === 0) return null;
  return /W/i.test(m[2]) ? -v : v;
}
/* ATCF uses 0 for "not reported" in every numeric field, and a real 0 kt / 0 mb does
   not exist. Both read as absent. */
function numOrNull(s) {
  const v = Number(String(s == null ? "" : s).trim());
  return Number.isFinite(v) && v !== 0 ? v : null;
}
function intOrNull(s) {
  const v = Number(String(s == null ? "" : s).trim());
  return Number.isFinite(v) ? v : null;
}

/* "2026081418" → ISO. The decks carry no timezone because ATCF times are always UTC. */
export function atcfTimeIso(s) {
  const t = String(s || "").trim();
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?$/.exec(t);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5] || "00"}:00.000Z`;
}

/* ---------------- a-deck: model guidance ---------------- */

/* Returns every (tech, tau) row of the LATEST cycle in the deck, plus a census of what
   the deck contains. The census matters: it is how an operator sees that an aid they
   expect is missing this cycle, instead of the board quietly blending fewer members.

   `opts.allCycles` keeps EVERY cycle instead of only the newest, merged per
   (cycle, tech, tau). The live board never wants this — it is pricing now, and a
   twelve-hour-old guidance cycle is not what "the guidance" means. A backtest wants
   nothing else: an a-deck file accumulates every cycle of the storm's life, and
   `scripts/lib/backtest-gate.mjs` has to see all of them to choose the ones that had been
   issued by the simulated decision time. The default is unchanged, so no live caller
   moves. */
export function parseAdeck(text, opts) {
  const allCycles = !!(opts && opts.allCycles);
  const rows = [];
  const cycles = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = line.split(",").map((x) => x.trim());
    if (c.length < 9) continue;
    const cycle = c[2];
    if (!/^\d{10}$/.test(cycle)) continue;
    const tau = intOrNull(c[5]);
    if (tau == null) continue;
    cycles.add(cycle);
    rows.push({
      basin: c[0], cy: c[1], cycle, tech: c[4], tau,
      lat: atcfLat(c[6]), lon: atcfLon(c[7]),
      vmax: numOrNull(c[8]), mslp: numOrNull(c[9]), ty: c[10] || null,
    });
  }
  if (!rows.length) return { ok: false, cycles: [], latestCycle: null, techs: {}, rows: [] };

  const sorted = [...cycles].sort();
  const latestCycle = sorted[sorted.length - 1];

  /* Merge the radii duplicates. First row wins for position; the first NON-NULL wins for
     intensity and pressure, because the 34-kt row sometimes carries the pressure and the
     64-kt row does not. */
  const byKey = new Map();
  const techs = {};
  for (const r of rows) {
    if (!allCycles && r.cycle !== latestCycle) continue;
    /* The census stays a census OF THE LATEST CYCLE even when every cycle is kept.
       "IVCN is missing this cycle" is a statement about one cycle; summing an aid's
       appearances across a week of decks would answer a question nobody asked. */
    if (r.cycle === latestCycle) techs[r.tech] = (techs[r.tech] || 0) + 1;
    const k = (allCycles ? r.cycle + "|" : "") + r.tech + "|" + r.tau;
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, { ...r }); continue; }
    if (prev.vmax == null && r.vmax != null) prev.vmax = r.vmax;
    if (prev.mslp == null && r.mslp != null) prev.mslp = r.mslp;
    if (prev.lat == null && r.lat != null) { prev.lat = r.lat; prev.lon = r.lon; }
  }
  const merged = [...byKey.values()].sort((a, b) =>
    (a.cycle < b.cycle ? -1 : a.cycle > b.cycle ? 1 : 0) || a.tau - b.tau || (a.tech < b.tech ? -1 : 1));
  /* Which techs actually FORECAST something. Derived from the data rather than from a list
     of names: an aid that forecasts has rows beyond tau 0, and an analysis-only record
     like CARQ carries -24h..0h and nothing after it.
     This is what separates "NHC ran no guidance for this system" from "the parser stopped
     finding the guidance NHC ran" — two states that look identical from a null consensus
     and need opposite responses. */
  const forecastTechs = [...new Set(merged.filter((r) => r.tau > 0 && r.cycle === latestCycle).map((r) => r.tech))].sort();
  return {
    ok: true, cycles: sorted, latestCycle, cycleIso: atcfTimeIso(latestCycle),
    techs, forecastTechs, rows: merged,
  };
}

/* ---- which aids we read, and what each one is ------------------------------------
 *
 * Named rather than pattern-matched, because "whatever looks like a consensus" is how a
 * deterministic single model ends up counted as corroboration for itself.
 *
 * The two consensus families the desk asked for are here under the IDs the live decks
 * actually carry. TVCA and TVCN are the same variable-consensus family under two names —
 * the Atlantic decks have historically shipped TVCA, the Pacific decks TVCN — so both are
 * listed and whichever is present is used, with the ID that answered recorded on the
 * output. Nothing is inferred from a missing one.
 *
 * DEEPMIND. The live decks carry GDMN (the model), GDMI (its interpolated form, which is
 * what is usable at an off-cycle time) and GDM2. The family is matched by ID against what
 * the deck actually contains and reported under the ID that answered — if none is present
 * the field is null and says so. The list is overridable by MT_ATCF_DEEPMIND so a new ID
 * can be picked up without a code change, and nothing is ever published under a tech ID
 * that was not in the file.
 */
export const TRACK_CONSENSUS = ["TVCA", "TVCN", "TVCE"];
export const CORRECTED_CONSENSUS = ["HCCA"];
export const INTENSITY_CONSENSUS = ["IVCN", "IVDR", "ICON"];
export const DEEPMIND = (process.env.MT_ATCF_DEEPMIND || "GDMI,GDMN,GDM2").split(",").map((s) => s.trim()).filter(Boolean);
export const OFFICIAL = ["OFCL", "OFCI"];

export const TECH_LABEL = {
  TVCA: "variable consensus (track)", TVCN: "variable consensus (track)", TVCE: "variable consensus (track)",
  HCCA: "HFIP corrected consensus", IVCN: "variable consensus (intensity)", IVDR: "variable consensus (intensity)",
  ICON: "intensity consensus", GDMI: "DeepMind (interpolated)", GDMN: "DeepMind", GDM2: "DeepMind (2-cycle)",
  OFCL: "NHC official forecast", OFCI: "NHC official (interpolated)",
};

/* The first ID in `wanted` that the deck actually carries. Order is preference, and the
   answer names itself so nothing downstream has to guess which one spoke. */
function pickTech(deck, wanted) {
  for (const id of wanted) {
    const rows = deck.rows.filter((r) => r.tech === id);
    if (rows.length) return { id, rows };
  }
  return null;
}

/* A track: position by lead time. Intensity is deliberately separate — TVCN has a track
   and no intensity, HCCA has both, and conflating them is how a 0 becomes a forecast. */
function trackOf(rows) {
  return rows.filter((r) => r.tau >= 0 && r.lat != null && r.lon != null)
    .map((r) => ({ hr: r.tau, lat: r.lat, lon: r.lon }));
}
function intensityOf(rows) {
  return rows.filter((r) => r.tau >= 0 && r.vmax != null)
    .map((r) => ({ hr: r.tau, kt: r.vmax, mslp: r.mslp ?? null }));
}
function peakOf(pts) {
  if (!pts.length) return null;
  return pts.reduce((a, b) => (b.kt > a.kt ? b : a), pts[0]);
}

/* One aid, reduced to what a probability can be built on. Returns null — never a
   half-populated object — when the aid carries no usable intensity, so a consumer
   cannot accidentally treat "present but silent" as "forecasts nothing". */
function aidOf(deck, wanted, kind) {
  const p = pickTech(deck, wanted);
  if (!p) return null;
  const track = trackOf(p.rows);
  const intensity = intensityOf(p.rows);
  const peak = peakOf(intensity);
  if (kind === "intensity" && !peak) return null;
  if (kind === "track" && !track.length) return null;
  return {
    tech: p.id, label: TECH_LABEL[p.id] || p.id,
    track, intensity,
    peakKt: peak ? peak.kt : null, peakHr: peak ? peak.hr : null,
    initialKt: (intensity.find((x) => x.hr === 0) || {}).kt ?? null,
    taus: intensity.map((x) => x.hr),
  };
}

/* Sample standard deviation of the members' PEAK intensities. This is a measured
   dispersion, not a modelled one: it says how much the aids disagree about the number
   the contract resolves on. It is the only widening term in the probability engine that
   is observed rather than published, and n<2 returns null rather than 0 — one member
   agreeing with itself is not agreement. */
export function spreadOf(values) {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const s2 = v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1);
  return { n: v.length, mean: m, sd: Math.sqrt(s2), min: Math.min(...v), max: Math.max(...v) };
}

/* The pre-advisory consensus signal, assembled from one storm's a-deck.
 *
 * `members` is the set of aids whose peak intensity enters the spread. It is
 * deliberately the CONSENSUS aids plus DeepMind, not every model in the deck: the deck
 * carries thirty AP## ensemble perturbations whose spread describes one ensemble's
 * internal uncertainty, which is a different quantity and would swamp the disagreement
 * between the aids a forecaster actually weighs. */
export function consensusFrom(deck) {
  if (!deck || !deck.ok) return null;
  const corrected = aidOf(deck, CORRECTED_CONSENSUS, "intensity");
  const variableI = aidOf(deck, INTENSITY_CONSENSUS, "intensity");
  const variableT = aidOf(deck, TRACK_CONSENSUS, "track");
  const deepmind = aidOf(deck, DEEPMIND, "intensity");
  const official = aidOf(deck, OFFICIAL, "intensity");

  const members = [corrected, variableI, deepmind].filter(Boolean);
  if (!members.length) return null;

  const spread = spreadOf(members.map((m) => m.peakKt));
  /* The consensus peak is the MEAN of the members' peaks, not the peak of the mean
     curve. The contract asks whether the storm ever reaches a threshold, so each member
     is asked its own best answer to that question and the answers are averaged; taking
     the peak of an averaged curve would let members peaking at different lead times
     cancel each other and understate every one of them. */
  const peakKt = spread ? spread.mean : members[0].peakKt;
  const peakHr = members.map((m) => m.peakHr).sort((a, b) => a - b)[Math.floor(members.length / 2)];

  return {
    cycle: deck.latestCycle, cycleIso: deck.cycleIso,
    peakKt: Math.round(peakKt * 10) / 10, peakHr,
    spreadKt: spread ? Math.round(spread.sd * 10) / 10 : null,
    minKt: spread ? spread.min : members[0].peakKt,
    maxKt: spread ? spread.max : members[0].peakKt,
    n: members.length,
    members: members.map((m) => ({ tech: m.tech, label: m.label, peakKt: m.peakKt, peakHr: m.peakHr, initialKt: m.initialKt })),
    corrected: corrected ? { tech: corrected.tech, peakKt: corrected.peakKt, peakHr: corrected.peakHr, intensity: corrected.intensity, track: corrected.track } : null,
    variableIntensity: variableI ? { tech: variableI.tech, peakKt: variableI.peakKt, peakHr: variableI.peakHr } : null,
    variableTrack: variableT ? { tech: variableT.tech, track: variableT.track } : null,
    deepmind: deepmind ? { tech: deepmind.tech, peakKt: deepmind.peakKt, peakHr: deepmind.peakHr, track: deepmind.track } : null,
    official: official ? { tech: official.tech, peakKt: official.peakKt, peakHr: official.peakHr } : null,
    /* What was asked for and not found, named. A missing aid is information — it is the
       difference between "the consensus eased" and "the aid that was carrying it did not
       run this cycle". */
    missing: [
      corrected ? null : "corrected consensus (" + CORRECTED_CONSENSUS.join("/") + ")",
      variableI ? null : "intensity consensus (" + INTENSITY_CONSENSUS.join("/") + ")",
      variableT ? null : "track consensus (" + TRACK_CONSENSUS.join("/") + ")",
      deepmind ? null : "DeepMind (" + DEEPMIND.join("/") + ")",
    ].filter(Boolean),
    techsPresent: Object.keys(deck.techs).sort(),
  };
}

/* ---------------- b-deck: best track ---------------- */

/* The observed record: where the storm HAS been and how strong it HAS been, as the
   forecasters themselves have written it down. Used for the current-intensity check and
   the observed wind radii — never for a forecast, because it contains none. */
export function parseBestTrack(text) {
  const byTime = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = line.split(",").map((x) => x.trim());
    if (c.length < 9) continue;
    if (!/^\d{10}$/.test(c[2])) continue;
    const t = c[2];
    const rec = byTime.get(t) || {
      time: t, iso: atcfTimeIso(t), lat: atcfLat(c[6]), lon: atcfLon(c[7]),
      kt: numOrNull(c[8]), mslp: numOrNull(c[9]), ty: c[10] || null, radii: {},
    };
    /* Radii rows: RAD (34/50/64) + WINDCODE + four quadrant distances in nm. Kept as the
       observed extent of the wind field; a quadrant of 0 is a real answer here (no winds
       of that strength in that quadrant) so these are NOT nulled the way vmax is. */
    const rad = intOrNull(c[11]);
    if (rad && [34, 50, 64].includes(rad)) {
      rec.radii[rad] = { code: c[12] || null, ne: intOrNull(c[13]), se: intOrNull(c[14]), sw: intOrNull(c[15]), nw: intOrNull(c[16]) };
    }
    byTime.set(t, rec);
  }
  const recs = [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
  return { ok: recs.length > 0, records: recs, latest: recs.length ? recs[recs.length - 1] : null };
}

/* ---------------- f-deck: fixes ---------------- */

/* Fix formats, from the ATCF specification. Only the ones this board reads are named;
   an unrecognised format is kept with its raw code rather than dropped, so a new fix
   type shows up as itself instead of vanishing. */
export const FIX_FORMAT = {
  10: "subjective Dvorak", 20: "objective Dvorak", 30: "microwave", 31: "scatterometer",
  40: "radar", 50: "aircraft", 60: "dropsonde", 70: "analysis",
};
/* Scatterometer fix types seen in the live decks. ASCT is ASCAT proper; OSCT is the
   OSCAT/ScatSat family, which answers the same question with the same instrument class.
   Both are carried, and each pass reports which one it was — the board never says
   "ASCAT" over a pass that was something else. */
export const SCAT_TYPES = ["ASCT", "OSCT", "SCAT", "ASCA", "AMSU"];
export const AIRCRAFT_TYPES = ["AIRC", "DRPS"];

export function parseFdeck(text) {
  const fixes = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const c = line.split(",").map((x) => x.trim());
    if (c.length < 12) continue;
    if (!/^\d{12}$/.test(c[2])) continue;
    const fmt = intOrNull(c[3]);
    const radii = {};
    const rad = intOrNull(c[16]);
    if (rad && [34, 50, 64].includes(rad)) {
      radii[rad] = { code: c[17] || null, ne: intOrNull(c[18]), se: intOrNull(c[19]), sw: intOrNull(c[20]), nw: intOrNull(c[21]) };
    }
    fixes.push({
      basin: c[0], cy: c[1], time: c[2], iso: atcfTimeIso(c[2]),
      format: fmt, formatLabel: FIX_FORMAT[fmt] || ("format " + fmt),
      type: c[4] || null, ci: c[5] || null,
      lat: atcfLat(c[7]), lon: atcfLon(c[8]),
      positionConfidence: intOrNull(c[10]),
      kt: numOrNull(c[11]), windConfidence: intOrNull(c[12]),
      mslp: numOrNull(c[13]), pressureConfidence: intOrNull(c[14]),
      pressureDerivation: c[15] || null,
      radii, site: c[30] || null,
    });
  }
  fixes.sort((a, b) => (a.time < b.time ? -1 : 1));
  return { ok: fixes.length > 0, fixes };
}

/* The LATEST scatterometer pass, and only that one.
 *
 * Scatterometry is intermittent by nature — a satellite either flew over the storm in
 * the last few hours or it did not — so a history of passes would be a history of
 * satellite orbits, not of the storm. One pass, with its age, is the whole signal.
 *
 * Radii are merged across the rows of the same pass because each wind threshold arrives
 * on its own row, exactly as in the a-deck. */
export function latestScatPass(fdeck) {
  if (!fdeck || !fdeck.ok) return null;
  const scat = fdeck.fixes.filter((f) => f.format === 31 || SCAT_TYPES.includes(f.type));
  if (!scat.length) return null;
  const t = scat[scat.length - 1].time;
  const rows = scat.filter((f) => f.time === t);
  const radii = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.radii)) radii[k] = v;
  const kt = rows.map((r) => r.kt).filter((x) => x != null);
  const base = rows[0];
  return {
    iso: base.iso, type: base.type, instrument: base.type,
    lat: base.lat, lon: base.lon,
    kt: kt.length ? Math.max(...kt) : null,
    positionConfidence: base.positionConfidence ?? null,
    windConfidence: base.windConfidence ?? null,
    radii, site: base.site,
    passes: scat.length,
  };
}

/* Aircraft fixes as the f-deck records them. This is the same aircraft the VDM comes
   from, arriving by a second, structured route — when both are present they corroborate
   each other, and when the VDM is missing this still carries the fix. */
export function latestAircraftFix(fdeck) {
  if (!fdeck || !fdeck.ok) return null;
  const air = fdeck.fixes.filter((f) => f.format === 50 || AIRCRAFT_TYPES.includes(f.type));
  if (!air.length) return null;
  const f = air[air.length - 1];
  return { iso: f.iso, type: f.type, lat: f.lat, lon: f.lon, kt: f.kt, mslp: f.mslp,
           pressureDerivation: f.pressureDerivation, site: f.site, fixes: air.length };
}

/* ATCF file stems for a storm. NHC ids are "CP012026"; the decks are lower-case
   "acp012026.dat.gz" / "bcp012026.dat" / "fcp012026.dat". Refused rather than guessed
   when the id is not in the ATCF shape, because a wrong stem fetches a DIFFERENT
   STORM'S deck and every number after that is confidently about the wrong system. */
export function deckStem(stormId) {
  const m = /^([A-Z]{2})(\d{2})(\d{4})$/i.exec(String(stormId || "").trim());
  if (!m) return null;
  const basin = m[1].toLowerCase();
  if (!["al", "ep", "cp", "wp", "io", "sh"].includes(basin)) return null;
  return { basin, cy: m[2], year: m[3], stem: `${basin}${m[2]}${m[3]}` };
}
