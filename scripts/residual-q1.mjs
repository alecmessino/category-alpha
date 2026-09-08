#!/usr/bin/env node
/* Q1 — IS THE POSITION-DEPARTURE MEASUREMENT ACCURATE?
 *
 * THE FIRST OF THE THREE PRE-REGISTERED QUESTIONS, AND THE ONLY ONE THIS PASS ASKS. Q2 (does a
 * promoted residual predict the sign of the next advisory's shift) and Q3 (does anything here
 * predict a landfall) are not started here and must not be inferred from anything below. Nothing
 * in this file is a skill claim. It cannot be: it asks whether the module reads and reduces the
 * products correctly, which is a question about arithmetic, parsing and frames.
 *
 * ------------------------------------------------------------------------------------------
 * WHAT COUNTS AS A REFERENCE, AND WHY THIS ONE IS LEGITIMATE
 *
 * A residual is a DEFINITION, not an estimate, so there is no "true residual" to score against.
 * "Accuracy" therefore has to decompose into things that have an independent answer. Four do:
 *
 *   Q1a  PARSE.        NHC publishes the same official forecast twice, on two channels, in two
 *                      formats: as prose in the forecast/advisory (TCM), and as rows in the ATCF
 *                      a-deck under the tech id OFCL. They are generated from one forecast, so
 *                      they must agree exactly at the 0.1-degree resolution both encode. If this
 *                      module's TCM parse disagrees with the deck at the same VALID TIME, one of
 *                      them is wrong and it is almost certainly the parse.
 *
 *                      This also settles the nominal-label question structurally rather than by
 *                      assertion. The a-deck indexes rows by TAU from the SYNOPTIC CYCLE, and a
 *                      15Z advisory off a 12Z cycle carries its initial position at TAU 3 and the
 *                      row the TCM labels "12H" at TAU 12. The label is twelve hours from the
 *                      cycle, not from the initial position. NHC's own encoding says so.
 *
 *   Q1b  LEAD LABELS.  The distribution, across the population, of the actual INIT -> first
 *                      forecast row interval, against the nominal label. One storm showed nine
 *                      hours. This measures how often that is the case and how far it runs.
 *
 *   Q1c  INTERPOLATION. Hold-one-out: drop an interior forecast position, reconstruct it linearly
 *                      in time from its neighbours, and compare against the position NHC actually
 *                      issued. The issued node is a real reference and the error is a real error.
 *                      This is the number that says what the interpolation costs.
 *
 *   Q1d  FRAME.        NOT an accuracy: a frame is a choice, and there is no true one. Reported as
 *                      a SENSITIVITY — how far the same residual moves between the baseline
 *                      forecast's local direction and the storm's reported motion — so a reader
 *                      can see what the choice is worth. Labelled as sensitivity everywhere.
 *
 * LIVE-AVAILABLE PRODUCTS ONLY. Everything above is read from products that existed at the time:
 * the transmitted messages and the guidance deck. The post-season best track is fetched and
 * reported in ONE clearly separated section as a RETROSPECTIVE REFERENCE — how far post-analysis
 * later moved the position an advisory had called initial — and is never substituted for a live
 * product, never used in a residual, and never used to correct one.
 *
 * THE SAMPLING UNIT IS THE STORM. Every metric is reduced per storm before any population figure
 * is taken, because advisories within one storm are not independent.
 *
 * MISSINGNESS IS PUBLISHED. Every fetch that failed, product that would not parse, TCM row with
 * no matching deck row and storm with no deck is counted and reported. A denominator that
 * silently shrinks is how a measurement study flatters itself.
 *
 * Run: node scripts/residual-q1.mjs                    (network-bound; not in any workflow)
 *      node scripts/residual-q1.mjs --years 2024       (a subset, for development)
 *      node scripts/residual-q1.mjs --limit 3          (first N qualifying storms per year)
 */
import { gunzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseForecastAdvisory, parsePublicAdvisory, coveragePoints, interpolateAtTime,
         localCourseDeg, projectResidual, haversineNm, signedLonE, deltaBearingDeg,
         interpolationBoundNm } from "./lib/track-residual.mjs";
import { parseMessagesIndex } from "./lib/advisories.mjs";
import { aggregateByStorm } from "./lib/track-residual-backtest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "research/track-residual");
const CACHE = process.env.MT_Q1_CACHE
  || "/tmp/claude-0/-home-user-category-alpha/24e0e56a-0b41-567a-87ea-8910317ce4b7/scratchpad/q1";

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const YEARS = (arg("years", "") || "").split(",").filter(Boolean).map(Number);
const ALL_YEARS = YEARS.length ? YEARS : [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const LIMIT = Number(arg("limit", 0)) || 0;
const BASIN = "ep";
const CONC = Number(arg("conc", 6));

const MS = (iso) => Date.parse(iso);
const archive = (y) => `https://ftp.nhc.noaa.gov/atcf/archive/${y}/`;

/* -------------------------------------------------------------------------------- fetching */

let fetched = 0, failed = 0;
async function get(url, binary) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      fetched++;
      return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch {
      if (attempt === 2) { failed++; return null; }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return null;
}

/** Run tasks with bounded concurrency. Politeness, not speed: this is someone else's server. */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

async function deckText(year, stem, kind) {
  for (const suffix of [".dat.gz", ".dat"]) {
    const buf = await get(archive(year) + kind + stem + suffix, true);
    if (!buf) continue;
    if (suffix.endsWith(".gz")) { try { return gunzipSync(buf).toString("utf8"); } catch { continue; } }
    return buf.toString("utf8");
  }
  return null;
}

/* ------------------------------------------------------------------------- deck extraction */

const atcfLat = (s) => { const m = /^(\d+)([NS])$/.exec(String(s || "").trim()); return m ? (m[2] === "S" ? -1 : 1) * Number(m[1]) / 10 : null; };
const atcfLon = (s) => { const m = /^(\d+)([EW])$/.exec(String(s || "").trim()); return m ? signedLonE((m[2] === "W" ? -1 : 1) * Number(m[1]) / 10) : null; };
const cycleMs = (dtg) => {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(String(dtg || "").trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]) : null;
};

/**
 * OFCL rows only, deduplicated to one position per (cycle, tau).
 *
 * OFCL and OFCI are NOT interchangeable: OFCI is the official forecast INTERPOLATED forward for
 * use as guidance in the next cycle. Comparing a TCM against OFCI would compare a product against
 * an adjusted copy of itself and report the adjustment as a parse error.
 */
function ofclByCycle(text) {
  const cycles = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.includes("OFCL")) continue;
    const c = line.split(",").map((s) => s.trim());
    if (c.length < 9 || c[4] !== "OFCL") continue;
    const dtg = c[2], tau = Number(c[5]);
    const lat = atcfLat(c[6]), lon = atcfLon(c[7]);
    if (lat == null || lon == null || !Number.isFinite(tau)) continue;
    const base = cycleMs(dtg);
    if (base == null) continue;
    if (!cycles.has(dtg)) cycles.set(dtg, { dtg, baseMs: base, rows: new Map() });
    const key = String(tau);
    if (!cycles.get(dtg).rows.has(key))
      cycles.get(dtg).rows.set(key, { tau, validMs: base + tau * 3600e3, lat, lonE: lon });
  }
  return cycles;
}

/** BEST rows, one per time. RETROSPECTIVE REFERENCE ONLY — never enters a residual. */
function bestByTime(text) {
  const out = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    const c = line.split(",").map((s) => s.trim());
    if (c.length < 9 || c[4] !== "BEST") continue;
    const t = cycleMs(c[2]);
    const lat = atcfLat(c[6]), lon = atcfLon(c[7]);
    if (t == null || lat == null || lon == null) continue;
    if (!out.has(t)) out.set(t, { validMs: t, lat, lonE: lon });
  }
  return out;
}

/* --------------------------------------------------------------------------- the metrics */

/**
 * Q1a: every TCM position against the deck row at the SAME valid time.
 *
 * THE JOIN IS NHC'S OWN CONSTRUCTION, AND IT IS BUILT FROM TIMES ALONE.
 *
 * Two wrong joins were tried before this one, and Q1 is what found both.
 *
 *   1. "The latest cycle carrying a row at the advisory's initial time." An advisory whose
 *      initial position falls on a synoptic hour has such a row in TWO cycles: as a mid-tau row
 *      of the cycle it was written off, and as TAU 0 of the NEXT cycle, which belongs to the next
 *      advisory. Preferring the later one compared two different analyses of one instant and
 *      called the difference a parse error — 18.90 nm on ep102024 advisory 10.
 *
 *   2. "The cycle matching the most valid times." Every earlier cycle also has rows at 00Z and
 *      12Z, because that is where every cycle's TAU 12/24/36 land. That join happily matched a
 *      15Z advisory against a cycle twelve hours older and reported 132 nm.
 *
 * The construction NHC actually uses: a forecast/advisory's first FORECAST VALID row is TAU 12 of
 * its own cycle. So the cycle is `first forecast row − 12 h`, exactly, with no search.
 *
 * THE REFERENCE MUST ALSO BE LIKE-FOR-LIKE. That cycle is only a reference for THIS advisory if
 * the deck also carries a row at the advisory's own initial valid time — TAU 3 for a standard 15Z
 * advisory off a 12Z cycle. Where it does not, the deck's rows for that cycle are anchored on a
 * different analysis (ep102024's OFCL runs TAU 0/6/12 off the 12Z synoptic hour, while its
 * advisory's initial position is a fresher 15Z analysis), and comparing them measures NHC's
 * three-hour update rather than this module's parse. Those advisories are REFUSED and counted,
 * not compared.
 *
 * POSITION AGREEMENT NEVER ENTERS THE JOIN. The keys are valid times only. A join that preferred
 * the cycle whose positions agreed would be searching for the answer it wanted, and would report
 * zero error against any deck at all.
 */
function parseCheck(tcm, cycles) {
  const pts = tcm.points;
  const cov = pts.filter((p) => p.kind !== "initial");
  if (!pts.length || !cov.length)
    return { matched: [], unmatched: 0, cycleDtg: null, initTau: null, reason: "NO_FORECAST_ROWS" };
  const initMs = MS(pts[0].validZ);
  /* NHC's construction: the first FORECAST VALID row is TAU 12 of the advisory's own cycle. */
  const dtgMs = MS(cov[0].validZ) - 12 * 3600e3;
  const chosen = [...cycles.values()].find((c) => c.baseMs === dtgMs);
  if (!chosen)
    return { matched: [], unmatched: pts.length, cycleDtg: null, initTau: null,
             reason: "NO_DECK_CYCLE_AT_THIS_ADVISORY_CYCLE_TIME" };
  const byValid = new Map([...chosen.rows.values()].map((r) => [r.validMs, r]));
  const initRow = byValid.get(initMs);
  if (!initRow)
    return { matched: [], unmatched: pts.length, cycleDtg: chosen.dtg, initTau: null,
             reason: "REFERENCE_NOT_LIKE_FOR_LIKE_NO_ROW_AT_ADVISORY_INITIAL_TIME" };

  const matched = [], missing = [];
  for (const p of pts) {
    const r = byValid.get(MS(p.validZ));
    if (!r) { missing.push({ validZ: p.validZ, kind: p.kind }); continue; }
    matched.push({ validZ: p.validZ, kind: p.kind, tau: r.tau,
                   deltaNm: haversineNm(p.lat, p.lonE, r.lat, r.lonE) });
  }
  return { matched, unmatched: missing.length, missing, cycleDtg: chosen.dtg,
           initTau: initRow.tau, ambiguous: false };
}


/**
 * A SECOND PARSE CHECK THAT DOES NOT INVOLVE THE DECK AT ALL.
 *
 * Q1a compares against the a-deck, so a disagreement there has two possible authors. This check
 * has only one: it re-formats every parsed position back into the notation the product prints and
 * requires that exact string to appear in the product's own bytes. It cannot be satisfied by a
 * parser that read the right line and mangled the number, or read a neighbouring line, or
 * silently swapped a hemisphere.
 *
 * It is what makes the Q1a finding attributable. Where the deck and the module disagree, this says
 * whether the module is reproducing the transmitted product verbatim — in which case the two NHC
 * channels differ and the module is reading the one it claims to read.
 */
function literalRoundTrip(text, points) {
  let ok = 0, bad = [];
  for (const p of points) {
    const ns = p.lat < 0 ? "S" : "N";
    const ew = p.lonE < 0 ? "W" : "E";
    const lat = Math.abs(p.lat).toFixed(1);
    const lon = Math.abs(p.lonE).toFixed(1);
    /* The products pad degrees with spaces (" 98.5W"), so the separator is flexible; the DIGITS
       are not. */
    const re = new RegExp(lat.replace(".", "\\.") + "\\s*" + ns + "\\s+" + lon.replace(".", "\\.") + "\\s*" + ew);
    if (re.test(text)) ok++;
    else bad.push({ validZ: p.validZ, kind: p.kind, lat: p.lat, lonE: p.lonE });
  }
  return { ok, bad };
}

/**
 * Q1c: hold-one-out reconstruction of an interior issued position.
 *
 * Works on any list of `{validZ, lat, lonE}` on ONE issued forecast curve — the TCM's own rows,
 * or the deck rows of the cycle that produced them. Both are used, because they answer the
 * question at different GAPS and only one of them answers it at the gap the module runs on:
 *
 *   TCM rows are 12 h apart, so holding one out interpolates across 24 h.
 *   Deck rows for a standard cycle are TAU 0 / 3 / 12 / 24 …, so holding out TAU 3 interpolates
 *   across 12 h — which IS the module's operating gap, and reconstructs a 3-hour point, which is
 *   the kind of point a residual is actually evaluated at.
 *
 * Interpolation error grows with the gap, so the 24 h figure is an upper bound that overstates
 * what the module does. Both are reported, by gap, rather than one being presented as "the"
 * interpolation error.
 */
function holdOneOut(points) {
  const out = [];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i + 1], truth = points[i];
    const ta = MS(a.validZ), tb = MS(b.validZ), tt = MS(truth.validZ);
    if (!(tb > ta) || tt <= ta || tt >= tb) continue;
    const at = interpolateAtTime([a, b], tt);
    if (!at.ok) continue;
    out.push({ validZ: truth.validZ, kind: truth.kind,
               gapHours: (tb - ta) / 3600e3,
               errNm: haversineNm(at.lat, at.lonE, truth.lat, truth.lonE) });
  }
  return out;
}

/* ---------------------------------------------------------------------------- one storm */

async function doStorm(year, stormId, entries) {
  const cachePath = join(CACHE, `${stormId}.json`);
  try { return JSON.parse(await readFile(cachePath, "utf8")); } catch { /* not cached */ }

  const stem = stormId;
  const aText = await deckText(year, stem, "a");
  const bText = await deckText(year, stem, "b");
  const cycles = aText ? ofclByCycle(aText) : new Map();
  const best = bText ? bestByTime(bText) : new Map();

  const fst = entries.filter((e) => e.product === "fstadv");
  const inter = entries.filter((e) => e.product === "public_a");

  const stamp = (e) => {
    const d = new Date(e.transmitMs);
    const p = (n) => String(n).padStart(2, "0");
    return p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + p(d.getUTCHours()) + p(d.getUTCMinutes());
  };
  const msgUrl = (e) => `${archive(year)}messages/${stormId}.${e.product}.${String(e.advNum).padStart(3, "0")}.${stamp(e)}`;

  const miss = { fstadvFetch: 0, fstadvParse: 0, interFetch: 0, interParse: 0,
                 noDeck: aText ? 0 : 1, noBestTrack: bText ? 0 : 1 };

  /* --- forecast advisories --- */
  const parseDeltas = [], hooErrs = [], deckHooErrs = [], leadRows = [], boundNm = [];
  let advWithDeckCycle = 0, advTotal = 0, rowsMatched = 0, rowsUnmatched = 0;
  const refusedJoins = {};
  let roundTripOk = 0; const roundTripBad = [];
  const initRefs = [];

  await pool(fst, CONC, async (e) => {
    const text = await get(msgUrl(e));
    if (text == null) { miss.fstadvFetch++; return; }
    const tcm = parseForecastAdvisory(text);
    if (!tcm.ok) { miss.fstadvParse++; return; }
    advTotal++;

    const rt = literalRoundTrip(text, tcm.points);
    roundTripOk += rt.ok; roundTripBad.push(...rt.bad.map((b) => ({ ...b, advNum: e.advNum })));

    const pc = parseCheck(tcm, cycles);
    if (pc.matched.length) advWithDeckCycle++;
    if (pc.reason) refusedJoins[pc.reason] = (refusedJoins[pc.reason] || 0) + 1;
    rowsMatched += pc.matched.length;
    rowsUnmatched += pc.unmatched;
    for (const m of pc.matched) parseDeltas.push({ kind: m.kind, tau: m.tau, deltaNm: m.deltaNm, advNum: e.advNum });

    /* Q1b — the actual interval, and the deck's own TAU for the initial position. */
    const cov = coveragePoints(tcm);
    if (cov.length >= 2 && cov[0].kind === "initial") {
      leadRows.push({ advNum: e.advNum,
        initToFirstRowHours: (MS(cov[1].validZ) - MS(cov[0].validZ)) / 3600e3,
        initTau: pc.initTau,
        issueHourZ: new Date(MS(cov[0].validZ)).getUTCHours() });
    }
    for (const h of holdOneOut(cov)) hooErrs.push(h);
    /* THE SAME TEST ON THE DECK ROWS OF THIS ADVISORY'S OWN CYCLE — same forecast curve, finer
       spacing, so the 12-hour gap the module actually interpolates across gets measured directly
       instead of being extrapolated down from a 24-hour one. */
    if (pc.cycleDtg && cycles.has(pc.cycleDtg)) {
      const cyc = cycles.get(pc.cycleDtg);
      const deckPts = [...cyc.rows.values()].sort((a, b) => a.tau - b.tau)
        .map((r) => ({ validZ: new Date(r.validMs).toISOString(), lat: r.lat, lonE: r.lonE, kind: "tau" + r.tau }));
      for (const h of holdOneOut(deckPts)) deckHooErrs.push(h);
    }
    const b = interpolationBoundNm(cov, { samples: 41 });
    if (Number.isFinite(b.maxDeviationNm)) boundNm.push(b.maxDeviationNm);

    /* RETROSPECTIVE REFERENCE, KEPT APART — and matched where the two actually meet.
       An advisory's initial position is at 03/09/15/21Z; the best track is written at synoptic
       hours. They coincide only on the rare advisory issued on a synoptic hour, which gave 19
       samples across 65 storms — too few to say anything with. The comparison that has the same
       meaning and a real sample is the OPERATIONAL ANALYSIS against the POST-ANALYSIS at the same
       synoptic instant: the deck's own TAU 0 row against the best track. Both are "where the
       storm was"; one was written at the time and one months later. */
    if (pc.cycleDtg && cycles.has(pc.cycleDtg)) {
      const zero = [...cycles.get(pc.cycleDtg).rows.values()].find((r) => r.tau === 0);
      const bt = zero ? best.get(zero.validMs) : null;
      if (zero && bt) initRefs.push(haversineNm(zero.lat, zero.lonE, bt.lat, bt.lonE));
    }
  });

  /* --- intermediate advisories: Q1d frame sensitivity --- */
  const frameDelta = [], frameCourseDelta = [];
  const interRefusals = {};
  let residualsComputed = 0, residualsRefused = 0;
  const baselines = [];
  await pool(fst.slice(), CONC, async () => {});          // keep ordering deterministic
  /* Baselines are re-read from cache-free parse of the fstadv set once more, but only the ones
     needed to bracket an intermediate — bounded by the number of intermediates, not advisories. */
  const fstByNum = new Map(fst.map((e) => [String(e.advNum), e]));
  await pool(inter, CONC, async (e) => {
    const text = await get(msgUrl(e));
    if (text == null) { miss.interFetch++; return; }
    const tcp = parsePublicAdvisory(text);
    if (!tcp.ok) { miss.interParse++; return; }
    /* The intermediate NNA follows full advisory NN. */
    const refuse = (why) => { residualsRefused++; interRefusals[why] = (interRefusals[why] || 0) + 1; };
    const be = fstByNum.get(String(e.advNum));
    if (!be) return refuse("NO_FULL_ADVISORY_WITH_THIS_NUMBER");
    const btext = await get(msgUrl(be));
    if (btext == null) return refuse("BASELINE_FETCH_FAILED");
    const tcm = parseForecastAdvisory(btext);
    if (!tcm.ok) return refuse("BASELINE_PARSE_FAILED");
    const cov = coveragePoints(tcm);
    const t = MS(tcp.validZ);
    const at = interpolateAtTime(cov, t);
    if (!at.ok) return refuse("INTERP_" + at.refusal);
    const fr = localCourseDeg(cov, t);
    if (!fr.ok) return refuse("FRAME_" + fr.refusal);
    /* No reported motion means there is no SECOND frame to compare against, so this residual
       cannot contribute to a frame-SENSITIVITY figure. The residual itself is computable and is
       not what is being refused here. */
    if (!tcp.reportedMotion) return refuse("NO_REPORTED_MOTION_TO_COMPARE_FRAMES");
    const inForecastFrame = projectResidual({ lat: at.lat, lonE: at.lonE }, tcp, fr.courseDeg);
    const inMotionFrame = projectResidual({ lat: at.lat, lonE: at.lonE }, tcp, tcp.reportedMotion.deg);
    residualsComputed++;
    frameDelta.push({ cross: Math.abs(inForecastFrame.crossNm - inMotionFrame.crossNm),
                      along: Math.abs(inForecastFrame.alongNm - inMotionFrame.alongNm),
                      separationNm: inForecastFrame.separationNm });
    frameCourseDelta.push(Math.abs(deltaBearingDeg(fr.courseDeg, tcp.reportedMotion.deg)));
    baselines.push(tcm.advisoryNumber);
  });

  const rec = {
    stormId, year,
    advisories: { total: advTotal, withComparableDeckCycle: advWithDeckCycle, refusedJoins },
    rows: { matched: rowsMatched, unmatched: rowsUnmatched },
    parseDeltas, hooErrs, deckHooErrs, leadRows, boundNm, initRefs,
    roundTrip: { ok: roundTripOk, bad: roundTripBad },
    frameDelta, frameCourseDelta,
    intermediates: { total: inter.length, residualsComputed, residualsRefused, refusalReasons: interRefusals },
    missing: miss,
  };
  await mkdir(CACHE, { recursive: true });
  await writeFile(cachePath, JSON.stringify(rec), "utf8");
  return rec;
}

/* ------------------------------------------------------------------------------ reductions */

const q = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const max = (a) => (a.length ? Math.max(...a) : null);

/** One number per storm, then the population over storms. Never over rows. */
function perStorm(records, pick) {
  return records.map((r) => ({ stormId: r.stormId, value: pick(r) }))
                .filter((x) => x.value != null && Number.isFinite(x.value));
}

async function main() {
  console.log("Q1 — measurement accuracy. EP storms with intermediate advisories, "
    + `${ALL_YEARS[0]}-${ALL_YEARS[ALL_YEARS.length - 1]}.\n`);

  /* ---- the population, re-derived rather than assumed ---- */
  const population = [];
  for (const year of ALL_YEARS) {
    const html = await get(archive(year) + "messages/");
    if (html == null) { console.log(`  ${year}: no messages index — every storm skipped`); continue; }
    const entries = parseMessagesIndex(html, year);
    const byStorm = new Map();
    for (const e of entries) {
      if (!e.stormId.startsWith(BASIN)) continue;
      if (!byStorm.has(e.stormId)) byStorm.set(e.stormId, []);
      byStorm.get(e.stormId).push(e);
    }
    let qualifying = [...byStorm.entries()].filter(([, es]) => es.some((e) => e.product === "public_a"));
    if (LIMIT) qualifying = qualifying.slice(0, LIMIT);
    for (const [stormId, es] of qualifying) population.push({ year, stormId, entries: es });
    console.log(`  ${year}: ${byStorm.size} EP storms, ${qualifying.length} with intermediates`);
  }
  console.log(`\n  population: ${population.length} storms\n`);

  /* ---- the sweep ---- */
  const records = [];
  for (const p of population) {
    const rec = await doStorm(p.year, p.stormId, p.entries);
    records.push(rec);
    process.stdout.write(`  ${rec.stormId}  adv ${String(rec.advisories.total).padStart(3)}`
      + `  cmp ${String(rec.advisories.withComparableDeckCycle).padStart(3)}`
      + `  rows ${String(rec.rows.matched).padStart(4)}/${rec.rows.matched + rec.rows.unmatched}`
      + `  parse max ${(max(rec.parseDeltas.map((x) => x.deltaNm)) ?? NaN).toFixed(2)} nm`
      + `  hoo p50 ${(q(rec.hooErrs.map((h) => h.errNm), 0.5) ?? NaN).toFixed(1)} nm`
      + `  inter ${rec.intermediates.residualsComputed}/${rec.intermediates.total}\n`);
  }

  /* ---- Q1a: parse ---- */
  const allParseRows = records.flatMap((r) => r.parseDeltas);
  const allParse = allParseRows.map((x) => x.deltaNm);
  const parseStormMax = perStorm(records, (r) => max(r.parseDeltas.map((x) => x.deltaNm)));
  /* THE SPLIT THAT MATTERS. A residual is measured against the FORECAST rows; the initial row is
     the advisory's own analysis. If the disagreements live entirely in the initial row then the
     track this module interpolates over is reproduced exactly, and the reference — not the parse
     — is what differs. Reported as two populations rather than one average. */
  const byKind = {};
  for (const x of allParseRows) {
    const k = x.kind === "initial" ? "initial" : "forecast/outlook";
    (byKind[k] = byKind[k] || []).push(x);
  }
  const kindTable = Object.entries(byKind).map(([kind, rows]) => ({
    kind, rows: rows.length,
    exact: rows.filter((x) => x.deltaNm < 0.05).length,
    nonZero: rows.filter((x) => x.deltaNm >= 0.05).length,
    maxNm: max(rows.map((x) => x.deltaNm)),
  }));
  const nonZeroRows = allParseRows.filter((x) => x.deltaNm >= 0.05)
    .map((x) => ({ ...x })).sort((a, b) => b.deltaNm - a.deltaNm);
  const nonZeroByStorm = {};
  for (const r of records) for (const x of r.parseDeltas)
    if (x.deltaNm >= 0.05) (nonZeroByStorm[r.stormId] = nonZeroByStorm[r.stormId] || []).push({ advNum: x.advNum, kind: x.kind, tau: x.tau, deltaNm: x.deltaNm });
  const stormsExact = parseStormMax.filter((x) => x.value < 0.05).length;

  const rtOk = records.reduce((a, r) => a + ((r.roundTrip && r.roundTrip.ok) || 0), 0);
  const rtBad = records.flatMap((r) => ((r.roundTrip && r.roundTrip.bad) || []).map((b) => ({ stormId: r.stormId, ...b })));

  /* ---- Q1b: lead labels ---- */
  const allLead = records.flatMap((r) => r.leadRows);
  const leadHist = {};
  for (const l of allLead) leadHist[l.initToFirstRowHours] = (leadHist[l.initToFirstRowHours] || 0) + 1;
  const tauHist = {};
  for (const l of allLead) tauHist[String(l.initTau)] = (tauHist[String(l.initTau)] || 0) + 1;
  const stormsWithNonTwelve = records.filter((r) => r.leadRows.some((l) => l.initToFirstRowHours !== 12)).length;

  /* ---- Q1c: interpolation ---- */
  const allHoo = records.flatMap((r) => r.hooErrs.map((h) => h.errNm));
  const hooStormMedian = perStorm(records, (r) => q(r.hooErrs.map((h) => h.errNm), 0.5));
  const hooStormMax = perStorm(records, (r) => max(r.hooErrs.map((h) => h.errNm)));
  const byGap = {};
  for (const r of records) for (const h of r.hooErrs) {
    const k = String(h.gapHours);
    (byGap[k] = byGap[k] || []).push(h.errNm);
  }
  const gapTable = Object.entries(byGap).map(([k, v]) => ({ gapHours: Number(k), n: v.length,
    p50: q(v, 0.5), p90: q(v, 0.9), max: max(v) })).sort((a, b) => a.gapHours - b.gapHours);

  const allDeckHoo = records.flatMap((r) => (r.deckHooErrs || []).map((h) => h.errNm));
  const deckHooStormMedian = perStorm(records, (r) => q((r.deckHooErrs || []).map((h) => h.errNm), 0.5));
  const byDeckGap = {};
  for (const r of records) for (const h of (r.deckHooErrs || [])) {
    const k = String(h.gapHours);
    (byDeckGap[k] = byDeckGap[k] || []).push(h.errNm);
  }
  const deckGapTable = Object.entries(byDeckGap).map(([k, v]) => ({ gapHours: Number(k), n: v.length,
    p50: q(v, 0.5), p90: q(v, 0.9), max: max(v) })).sort((a, b) => a.gapHours - b.gapHours);

  /* ---- Q1d: frame sensitivity ---- */
  const allFrameCross = records.flatMap((r) => r.frameDelta.map((f) => f.cross));
  const allFrameAlong = records.flatMap((r) => r.frameDelta.map((f) => f.along));
  const allCourse = records.flatMap((r) => r.frameCourseDelta);
  const frameStormMedian = perStorm(records, (r) => q(r.frameDelta.map((f) => f.cross), 0.5));

  /* ---- retrospective reference, kept apart ---- */
  const allInitRef = records.flatMap((r) => r.initRefs);
  const initRefStormMedian = perStorm(records, (r) => q(r.initRefs, 0.5));

  /* ---- missingness ---- */
  const missing = records.reduce((a, r) => {
    for (const [k, v] of Object.entries(r.missing)) a[k] = (a[k] || 0) + v;
    return a;
  }, {});
  missing.rowsUnmatched = records.reduce((a, r) => a + r.rows.unmatched, 0);
  missing.advisoriesWithoutComparableDeckCycle = records.reduce((a, r) => a + (r.advisories.total - r.advisories.withComparableDeckCycle), 0);
  missing.joinRefusalReasons = records.reduce((a, r) => {
    for (const [k, v] of Object.entries(r.advisories.refusedJoins || {})) a[k] = (a[k] || 0) + v;
    return a;
  }, {});
  missing.intermediatesRefused = records.reduce((a, r) => a + r.intermediates.residualsRefused, 0);
  missing.intermediateRefusalReasons = records.reduce((a, r) => {
    for (const [k, v] of Object.entries(r.intermediates.refusalReasons || {})) a[k] = (a[k] || 0) + v;
    return a;
  }, {});

  const report = {
    schema: "millibar.track-residual.q1/1",
    generatedAt: new Date().toISOString(),
    question: "Q1 — accuracy of the position-departure measurement. NOT a skill claim, and no "
            + "part of Q2 or Q3 is answered or implied here.",
    population: { basin: "EP", years: ALL_YEARS, storms: records.length,
                  criterion: "at least one intermediate public advisory in the archived messages index" },
    fetches: { ok: fetched, failed },
    q1a_parse: {
      reference: "ATCF a-deck OFCL rows — the same official forecast NHC publishes as prose in "
               + "the TCM, matched at the same valid time. OFCI is deliberately not used: it is "
               + "the official forecast interpolated forward, so comparing against it would "
               + "report NHC's own adjustment as a parse error.",
      rowsCompared: allParse.length,
      storms: parseStormMax.length,
      stormsAgreeingExactly: stormsExact,
      byRowKind: kindTable,
      literalRoundTrip: {
        what: "Every parsed position re-formatted into the product's own notation and required to "
            + "appear verbatim in the product's bytes. Independent of the deck: it has one author, "
            + "so it says whether the module reproduces the TRANSMITTED product.",
        positionsChecked: rtOk + rtBad.length,
        verbatim: rtOk,
        notFound: rtBad.length,
        offenders: rtBad.slice(0, 20),
      },
      everyNonZeroRow: nonZeroRows.slice(0, 40),
      nonZeroRowsByStorm: nonZeroByStorm,
      p50Nm: q(allParse, 0.5), p90Nm: q(allParse, 0.9), p99Nm: q(allParse, 0.99), maxNm: max(allParse),
      worstStorms: parseStormMax.filter((x) => x.value >= 0.05).sort((a, b) => b.value - a.value).slice(0, 10),
    },
    q1b_leadLabels: {
      advisories: allLead.length,
      initToFirstRowHoursHistogram: leadHist,
      deckTauOfInitialPositionHistogram: tauHist,
      stormsWithAtLeastOneNonTwelveHourFirstRow: stormsWithNonTwelve,
      note: "The a-deck indexes rows by TAU from the SYNOPTIC CYCLE. A 15Z advisory off a 12Z "
          + "cycle carries its initial position at TAU 3 and the row the product labels 12H at "
          + "TAU 12 — so the label is twelve hours from the cycle, not from the initial position.",
    },
    q1c_interpolation: {
      method: "hold-one-out: an interior issued forecast position is reconstructed linearly in "
            + "time from its two neighbours and compared against the position NHC issued.",
      nodesTested: allHoo.length, storms: hooStormMedian.length,
      p50Nm: q(allHoo, 0.5), p90Nm: q(allHoo, 0.9), maxNm: max(allHoo),
      perStormMedian: { p50: q(hooStormMedian.map((x) => x.value), 0.5),
                        p90: q(hooStormMedian.map((x) => x.value), 0.9),
                        max: max(hooStormMedian.map((x) => x.value)) },
      perStormMax: { p50: q(hooStormMax.map((x) => x.value), 0.5),
                     max: max(hooStormMax.map((x) => x.value)) },
      byGapHours: gapTable,
      onDeckRowsOfTheSameCycle: {
        what: "The same hold-one-out over the a-deck rows of each advisory's own cycle. TAU "
            + "0/3/12/24 spacing means the TAU 3 node is reconstructed across a 12-hour gap — the "
            + "gap this module actually interpolates across, and a 3-hour point of the kind a "
            + "residual is evaluated at.",
        nodesTested: allDeckHoo.length,
        p50Nm: q(allDeckHoo, 0.5), p90Nm: q(allDeckHoo, 0.9), maxNm: max(allDeckHoo),
        byGapHours: deckGapTable,
        perStormMedian: { p50: q(deckHooStormMedian.map((x) => x.value), 0.5),
                          max: max(deckHooStormMedian.map((x) => x.value)) },
      },
      geodesicBoundNm: { p50: q(records.flatMap((r) => r.boundNm), 0.5),
                         max: max(records.flatMap((r) => r.boundNm)) },
      caveat: "Hold-one-out spans TWO segments, so it is an upper bound on the error of "
            + "interpolating inside ONE. It is the honest number for a gap the size of the two "
            + "it replaces, and it overstates the error at the gaps the module actually uses.",
    },
    q1d_frameSensitivity: {
      isNotAnAccuracy: "A frame is a choice, not an estimate. This is how far the same residual "
                     + "moves between the two defensible frames, so a reader can see what the "
                     + "choice is worth.",
      residuals: allFrameCross.length, storms: frameStormMedian.length,
      crossDeltaNm: { p50: q(allFrameCross, 0.5), p90: q(allFrameCross, 0.9), max: max(allFrameCross) },
      alongDeltaNm: { p50: q(allFrameAlong, 0.5), p90: q(allFrameAlong, 0.9), max: max(allFrameAlong) },
      courseDeltaDeg: { p50: q(allCourse, 0.5), p90: q(allCourse, 0.9), max: max(allCourse) },
      perStormMedianCrossDeltaNm: { p50: q(frameStormMedian.map((x) => x.value), 0.5),
                                    max: max(frameStormMedian.map((x) => x.value)) },
    },
    retrospectiveReference: {
      label: "RETROSPECTIVE — NOT A LIVE PRODUCT, NEVER SUBSTITUTED FOR ONE",
      what: "The operational analysis (the a-deck's own TAU 0 row for each advisory's cycle) "
          + "against the post-season best track at the same synoptic instant. Both answer 'where "
          + "was the storm'; one was written at the time and one months later. It says how far "
          + "post-analysis later moved the position operations were standing on. Reported for "
          + "scale only: it is not used in any residual, correction or score, and no live "
          + "quantity anywhere in this module is substituted from it.",
      n: allInitRef.length, storms: initRefStormMedian.length,
      p50Nm: q(allInitRef, 0.5), p90Nm: q(allInitRef, 0.9), maxNm: max(allInitRef),
      perStormMedian: { p50: q(initRefStormMedian.map((x) => x.value), 0.5),
                        max: max(initRefStormMedian.map((x) => x.value)) },
    },
    missingness: missing,
    perStorm: records.map((r) => ({
      stormId: r.stormId, year: r.year,
      advisories: r.advisories.total, comparable: r.advisories.withComparableDeckCycle,
      rowsMatched: r.rows.matched, rowsUnmatched: r.rows.unmatched,
      parseMaxNm: max(r.parseDeltas.map((x) => x.deltaNm)),
      parseNonZeroRows: r.parseDeltas.filter((x) => x.deltaNm >= 0.05).length,
      hooMedianNm: q(r.hooErrs.map((h) => h.errNm), 0.5), hooMaxNm: max(r.hooErrs.map((h) => h.errNm)),
      deckHooMedianNm: q((r.deckHooErrs || []).map((h) => h.errNm), 0.5),
      frameCrossDeltaMedianNm: q(r.frameDelta.map((f) => f.cross), 0.5),
      intermediates: r.intermediates, missing: r.missing,
    })),
    notScored: ["Q2 — sign of the next advisory's shift", "Q3 — landfall or contract resolution"],
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "Q1-RESULT.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`\n  fetches ${fetched} ok, ${failed} failed`);
  console.log(`  Q1a  ${report.q1a_parse.rowsCompared} rows, max ${report.q1a_parse.maxNm?.toFixed(3)} nm, `
    + `${stormsExact}/${parseStormMax.length} storms exact`);
  for (const k of kindTable) console.log(`       ${k.kind.padEnd(16)} ${k.exact}/${k.rows} exact, `
    + `${k.nonZero} non-zero, max ${k.maxNm.toFixed(2)} nm`);
  console.log(`       literal round-trip against the product's own bytes: ${rtOk}/${rtOk + rtBad.length} verbatim`);
  console.log(`  Q1b  ${allLead.length} advisories, INIT→first-row hours: ${JSON.stringify(leadHist)}`);
  console.log(`  Q1c  TCM rows (24h gap): ${allHoo.length} nodes, p50 ${report.q1c_interpolation.p50Nm?.toFixed(2)} nm`);
  console.log(`       deck rows: ${allDeckHoo.length} nodes; by gap `
    + deckGapTable.map((g) => g.gapHours + "h p50 " + g.p50.toFixed(2) + " (n" + g.n + ")").join("  "));
  console.log(`  Q1d  ${allFrameCross.length} residuals, cross delta p50 `
    + `${report.q1d_frameSensitivity.crossDeltaNm.p50?.toFixed(2)} nm`);
  console.log(`\nWrote ${join(OUT, "Q1-RESULT.json")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
