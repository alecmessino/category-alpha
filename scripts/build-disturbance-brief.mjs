#!/usr/bin/env node
/* THE DISTURBANCE BRIEF: what the Storm Atlas can and cannot say about three systems.
 *
 * On 09 Sep 2026 the eastern and central Pacific carried three things at once, and they sit at
 * three different EPISTEMIC STATES — which is the whole reason this brief is interesting:
 *
 *   Disturbance 1   a trough south-southeast of Hawaii, 10% / 20% formation. Not a storm yet.
 *   Disturbance 2   a low FORECAST TO FORM south of Baja, 0% / 50%. Not a storm, and not even
 *                   a disturbance with a centre yet.
 *   Fourteen-E      an actual tropical depression, advisory 1 already issued.
 *
 * The Atlas answers each one differently, and the differences are the finding: one query falls
 * below the sample gate and its rates are REFUSED; one clears it and can be composed with NHC's
 * own formation chance; one is a formed storm, so no formation probability is needed at all and
 * the archive is conditioned on its genesis fix instead — which is exactly what the Millibar →
 * Storm Atlas bridge does on a live storm.
 *
 * NOTHING IS COMPUTED IN THE PAGE. This script does the arithmetic and writes both data.json and
 * an index.html with that payload inlined, so a figure on screen is a figure a reader can trace
 * and a test can reach. The page formats and draws; it does not calculate.
 *
 * NO PROBABILITY IS COMPOSED. An earlier version multiplied NHC's 7-day formation chance by the
 * archive's conditional rate. That is withdrawn: NHC's probability is over ITS forecast formation
 * area and window, the archive's is conditional on formation under a DECLARED REFERENCE CONDITION,
 * and those conditioning events are not demonstrably the same event. See noComposition() below.
 *
 * Run: node scripts/build-disturbance-brief.mjs           (network + python; not in any workflow)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOutlookShapes } from "./lib/shapefile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs/preview/disturbance-brief");

/* ------------------------------------------------------------------ live products */

async function text(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return await r.text();
}
export const pre = (html) => {
  const m = /<pre>([\s\S]*?)<\/pre>/i.exec(html);
  return m ? m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim() : "";
};

/** The two numbered outlook areas, as NHC words them. Quoted, never paraphrased. */
export function parseOutlookAreas(twoText) {
  const out = [];
  const re = /\n([A-Z][^\n:]{5,80}):\n([\s\S]*?)\* Formation chance through 48 hours\.\.\.(\w+)\.\.\.(?:near )?(\d+) percent\.\s*\n\* Formation chance through 7 days\.\.\.(\w+)\.\.\.(?:near )?(\d+) percent\./g;
  for (const m of twoText.matchAll(re)) {
    out.push({ heading: m[1].trim(), text: m[2].replace(/\s+/g, " ").trim(),
               word48: m[3], pct48: Number(m[4]), word7d: m[5], pct7d: Number(m[6]) });
  }
  return out;
}

/* THE ARCHIVE'S GENESIS RULE, MIRRORED HERE SO THE TWO CLOCKS AGREE.
 *
 * scripts/genesis/schema.py splits best-track status codes into tropical and not, and
 * build/genesis_events.py states the consequence in as many words:
 *
 *   "GENESIS is the first point whose status is TROPICAL. Not the first point in the best track:
 *    best tracks routinely open with a disturbance or a low, sometimes days earlier, and counting
 *    that as genesis would inflate every time-to-event in the archive."
 *
 * Every analog's time-to-hurricane is measured from THAT point. So a live storm compared against
 * the cohort must use the same definition, or the comparison is between two different clocks.
 *
 * Fourteen-E is exactly the case the docstring warns about: its best track opens with 48 hours of
 * DB (disturbance) rows before the first TD. Measuring from the first fix put the storm 48 h older
 * than the cohort convention and moved the query point ~700 km east of its genesis.
 *
 * NOTE, REPORTED NOT FIXED: the live Millibar → Atlas bridge (guidance.mjs genesisFromBestTrack)
 * takes the b-deck's FIRST FIX of any kind. On a storm with a long pre-genesis disturbance stage
 * that is not the archive's genesis, so the bridge conditions the Atlas on a point the Atlas would
 * not call genesis. That is a cross-component inconsistency in the terminal, out of scope here.
 */
export const TROPICAL_STATUS = new Set(["TD", "TS", "HU", "TY", "ST", "TC", "HR"]);

/** ATCF b-deck BEST rows — used for the genesis point and the latest analysed position. */
export function bestRows(dat) {
  const rows = [];
  for (const line of dat.split(/\r?\n/)) {
    const c = line.split(",").map((s) => s.trim());
    if (c.length < 10 || c[4] !== "BEST") continue;
    const t = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(c[2]);
    const la = /^(\d+)([NS])$/.exec(c[6]), lo = /^(\d+)([EW])$/.exec(c[7]);
    if (!t || !la || !lo) continue;
    const iso = `${t[1]}-${t[2]}-${t[3]}T${t[4]}:00:00.000Z`;
    if (rows.some((r) => r.atZ === iso)) continue;
    rows.push({ atZ: iso, lat: (la[2] === "S" ? -1 : 1) * Number(la[1]) / 10,
                lonE: (lo[2] === "W" ? -1 : 1) * Number(lo[1]) / 10,
                kt: Number(c[8]) || null, type: c[10] || null });
  }
  return rows;
}

/** Forecast/advisory positions, by explicit UTC valid time — never by the nominal lead label. */
export function forecastRows(tcm) {
  const iss = /^\s*(\d{3,4})\s+UTC\s+[A-Z]{3}\s+([A-Z]{3})\s+(\d{2})\s+(\d{4})\s*$/im.exec(tcm);
  const M = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  if (!iss) return { issuedZ: null, rows: [] };
  const base = Date.UTC(+iss[4], M[iss[2].toUpperCase()], +iss[3],
                        Math.floor(+iss[1] / 100), +iss[1] % 100);
  const rows = [];
  const re = /(FORECAST|OUTLOOK)\s+VALID\s+(\d{2})\/(\d{4})Z\s+([\d.]+)([NS])\s+([\d.]+)([EW])[^\n]*\n\s*MAX\s+WIND\s+(\d+)\s*KT/gi;
  for (const m of tcm.matchAll(re)) {
    let d = Date.UTC(new Date(base).getUTCFullYear(), new Date(base).getUTCMonth(),
                     +m[2], Math.floor(+m[3] / 100), +m[3] % 100);
    if (d < base - 3 * 3600e3) d = Date.UTC(new Date(base).getUTCFullYear(), new Date(base).getUTCMonth() + 1,
                                            +m[2], Math.floor(+m[3] / 100), +m[3] % 100);
    rows.push({ validZ: new Date(d).toISOString(),
                lat: (m[5] === "S" ? -1 : 1) * Number(m[4]),
                lonE: (m[7] === "W" ? -1 : 1) * Number(m[6]),
                kt: Number(m[8]), outlook: m[1].toUpperCase() === "OUTLOOK" });
  }
  return { issuedZ: new Date(base).toISOString(), rows };
}

/* --------------------------------------------------------------------- the archive */

function analogs(lat, lon, opts = {}) {
  const args = ["scripts/genesis/cli.py", "analogs", "--lat", String(lat), "--lon", String(lon),
                "--radius", String(opts.radiusKm ?? 500), "--months", opts.months ?? "9",
                "--regions", opts.regions ?? "hawaii", "--json"];
  if (opts.minPoolSeason) args.push("--min-pool-season", String(opts.minPoolSeason));
  return JSON.parse(execFileSync("python3", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 }));
}

export const pct = (x) => (x == null ? null : x * 100);
export const LEVELS = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];

export function pack(a, label) {
  const lv = (k) => {
    const o = a.intensity[k];
    if (!o) return null;
    /* BELOW THE GATE, A RATE IS NOT PUBLISHED — the count is the evidence, not the answer. */
    return { count: o.count, n: o.n_storms,
             rate: a.sufficient ? pct(o.rate) : null,
             ci: a.sufficient ? [pct(o.ci95[0]), pct(o.ci95[1])] : null,
             refused: !a.sufficient };
  };
  const lf = Object.fromEntries(Object.entries(a.landfall || {}).map(([reg, v]) => [reg,
    Object.fromEntries(Object.entries(v).map(([kind, o]) => {
      const un = (a.unscoreable || {})[`${reg}:${kind}`] || null;
      return [kind, { count: o.count, n: o.n_storms,
                      rate: a.sufficient ? pct(o.rate) : null,
                      ci: a.sufficient ? [pct(o.ci95[0]), pct(o.ci95[1])] : null,
                      unscoreable: un && { status: un.status, reason: un.reason,
                                           archiveEvents: un.archive_events,
                                           scopeEvents: un.scope_events, scope: un.scope,
                                           required: un.required } }];
    }))]));
  return {
    label,
    query: { lat: a.query.lat, lonE: a.query.lon, radiusKm: a.query.radius_km,
             months: a.query.season_months, minPoolSeason: a.query.min_pool_season },
    nCases: a.n_cases, ess: a.effective_sample_size, minSample: a.min_sample,
    sufficient: a.sufficient,
    levels: Object.fromEntries(LEVELS.map((k) => [k, lv(k)])),
    landfall: lf,
    timeToEvent: a.time_to_event || {},
    gaps: a.gaps || [],
    trackDensity: a.track_density || {},
    cases: (a.cases || []).map((c) => ({ season: c.season, name: c.name, atcf: c.atcf_id,
      km: Math.round(c.distance_km), w: Number(c.weight.toFixed(3)),
      peakKt: c.peak_vmax_kt, cat: c.max_category,
      /* Landfalls arrive as records, not names. Flattened to "region (sub-region) at intensity"
         here so the page never has to reach inside one — and so a hurricane landfall is
         distinguishable from a tropical-storm one, which is the distinction that matters. */
      landfalls: (c.landfalls || []).map((f) => ({
        region: f.region, sub: f.sub_region || null, kt: f.vmax_kt, cat: f.max_category || f.category,
        hurricane: !!f.hurricane,
        label: `${f.region}${f.sub_region ? " · " + f.sub_region : ""}${f.vmax_kt ? " " + Math.round(f.vmax_kt) + " kt" : ""}`,
      })) })),
  };
}

/* NO COMPOSED NUMBER. This function used to multiply NHC's 7-day formation chance by the
 * archive's conditional rate. That is withdrawn, and the reason is not a rounding quibble:
 *
 *   NHC's figure is P(a tropical cyclone forms somewhere inside ITS forecast formation area,
 *   within seven days of this outlook).
 *
 *   The archive's figure is P(reaches X | a storm formed under the DECLARED REFERENCE CONDITION
 *   -- this cell, this radius, this season, this basin scope, 1971+).
 *
 * The conditioning events are not demonstrably the same event. The areas differ, the windows
 * differ (seven days against "September, any year"), and the populations differ. Multiplying two
 * probabilities is only the law of total probability when the conditioning event of the second is
 * the outcome of the first, and here that has not been shown. So the product is not computed.
 *
 * REPORTED, NOT FIXED: the archive's own CLI prints "To combine with a formation probability
 * (e.g. NHC's outlook chance), multiply: P(reaches X) = P(forms) x P(reaches X | forms)." That
 * guidance is correct only when the two conditioning events match, and it does not say so. It is
 * what this brief followed in its first version. The note belongs in scripts/genesis, and changing
 * it is outside this task.
 */
export function noComposition(formationPct, packed) {
  return {
    composed: null,
    formationPct,
    conditionalPublished: packed.sufficient,
    state: packed.sufficient ? "CONDITIONAL RATES PUBLISHED · NO COMPOSED NUMBER" : "RATES REFUSED",
    reason: "NHC publishes a formation probability for its forecast area. Storm Atlas publishes "
          + "historical outcome frequencies conditional on formation under the declared reference "
          + "condition. Because those conditioning events are not identical, the two are not "
          + "multiplied here.",
  };
}

/* ------------------------------------------------------------------------- assemble */

async function main() {
  const generatedAt = new Date().toISOString();
  const twoEP = pre(await text("https://www.nhc.noaa.gov/text/MIATWOEP.shtml"));
  const areas = parseOutlookAreas(twoEP);
  if (areas.length !== 2) throw new Error(`expected 2 outlook areas, parsed ${areas.length}`);

  const gtwoBuf = Buffer.from(await (await fetch("https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip")).arrayBuffer());
  const shapes = parseOutlookShapes(gtwoBuf);
  const geo = (n) => {
    const s = shapes.areas.find((x) => x.n === n);
    if (!s) throw new Error(`no GTWO polygon for area ${n}`);
    const pts = s.rings.flat();
    const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
    return { pct48: s.pct48, pct7d: s.pct7d, rings: s.rings,
             bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
             centroid: [lats.reduce((a, b) => a + b, 0) / lats.length,
                        lons.reduce((a, b) => a + b, 0) / lons.length] };
  };
  const g1 = geo(1), g2 = geo(2);

  const current = JSON.parse(await text("https://www.nhc.noaa.gov/CurrentStorms.json"));
  const storm = (id) => (current.activeStorms || []).find((s) => s.id === id) || null;
  const e14raw = storm("ep142026"), lowraw = storm("ep122026");

  const bdeck = bestRows(await text("https://ftp.nhc.noaa.gov/atcf/btk/bep142026.dat"));
  const firstTrack = bdeck[0];                                   // first row of ANY kind
  const genesis = bdeck.find((r) => TROPICAL_STATUS.has((r.type || "").toUpperCase())) || null;
  if (!genesis) throw new Error("no tropical b-deck row: this storm has no genesis under the archive's rule");
  const latestBest = bdeck[bdeck.length - 1];
  const preGenesisHours = (Date.parse(genesis.atZ) - Date.parse(firstTrack.atZ)) / 3600e3;
  const tcm = forecastRows(pre(await text("https://www.nhc.noaa.gov/text/MIATCMEP4.shtml")));

  /* THE THREE QUERIES. Each conditioned on the point that is actually available for that system:
     an outlook polygon's centroid for a system that has not formed, and the GENESIS FIX for the
     one that has — never its current position, which is what the live bridge rule says. */
  const A = {
    d1AllEras: pack(analogs(g1.centroid[0], g1.centroid[1]), "Disturbance 1 — all eras"),
    d1: pack(analogs(g1.centroid[0], g1.centroid[1], { minPoolSeason: 1971 }), "Disturbance 1 — 1971+"),
    d2: pack(analogs(g2.centroid[0], g2.centroid[1], { minPoolSeason: 1971 }), "Disturbance 2 — 1971+"),
    fourteenE: pack(analogs(genesis.lat, genesis.lonE, { minPoolSeason: 1971 }),
                    "Fourteen-E — conditioned on its genesis point, 1971+"),
    /* Kept so the correction is auditable: the cohort the first version drew, from the
       pre-genesis disturbance fix. Shown nowhere as a result — only as what changed. */
    fourteenEFromFirstTrack: pack(analogs(firstTrack.lat, firstTrack.lonE, { minPoolSeason: 1971 }),
                    "Fourteen-E — WITHDRAWN: conditioned on the first-track disturbance fix"),
  };

  const genesisMs = Date.parse(genesis.atZ);
  const firstCat1 = tcm.rows.find((r) => r.kt >= 64) || null;

  const payload = {
    schema: "millibar.storm-atlas.disturbance-brief/1",
    generatedAt,
    outlook: {
      issuedLocal: (/^\s*\d{3,4}\s+(AM|PM)\s+[A-Z]{3}[^\n]*$/im.exec(twoEP) || [""])[0].trim(),
      forecaster: (/\$\$\s*\nForecaster\s+(.+)/.exec(twoEP) || [null, null])[1],
      areas: areas.map((a, i) => ({ ...a, n: i + 1 })),
    },
    gtwo: { issued: shapes.issued, d1: g1, d2: g2 },
    storms: {
      fourteenE: {
        id: "EP142026", name: "Fourteen-E",
        cls: e14raw && e14raw.classification, advNum: e14raw && e14raw.publicAdvisory && e14raw.publicAdvisory.advNum,
        atZ: e14raw && e14raw.lastUpdate, lat: e14raw && e14raw.latitudeNumeric, lonE: e14raw && e14raw.longitudeNumeric,
        kt: e14raw && e14raw.intensity, mslp: e14raw && e14raw.pressure,
        motionDeg: e14raw && e14raw.movementDir, motionKt: e14raw && e14raw.movementSpeed,
        firstTrack, genesis, preGenesisHours, latestBest,
        forecastIssuedZ: tcm.issuedZ, forecast: tcm.rows,
        /* THE ALIGNED COMPARISON. Both clocks now start at the same event — the first TROPICAL
           best-track point — and the arithmetic is printed so a reader can check it. No verdict
           is attached: where the forecast falls among the percentiles is stated, not judged. */
        forecastVsAnalogs: firstCat1 ? (() => {
          const t = A.fourteenE.timeToEvent.cat1 || null;
          const elapsed = (Date.parse(firstCat1.validZ) - genesisMs) / 3600e3;
          const marks = t ? ["p10", "p25", "median", "p75", "p90"]
            .filter((k) => t[k] != null).map((k) => ({ k, h: t[k] })) : [];
          return {
            firstCat1,
            clock: {
              genesisZ: genesis.atZ, genesisRule: "first best-track point with a TROPICAL status",
              genesisType: genesis.type, genesisKt: genesis.kt,
              forecastValidZ: firstCat1.validZ, forecastKt: firstCat1.kt,
              elapsedHours: elapsed,
              arithmetic: `${firstCat1.validZ} − ${genesis.atZ} = ${elapsed} h`,
              /* What the withdrawn version measured, kept so the correction can be checked. */
              withdrawn: { fromZ: firstTrack.atZ, fromType: firstTrack.type,
                           elapsedHours: (Date.parse(firstCat1.validZ) - Date.parse(firstTrack.atZ)) / 3600e3 },
            },
            analogHoursToCat1: t,
            /* Where the aligned value falls, computed rather than asserted. */
            above: marks.filter((m) => m.h <= elapsed).map((m) => m.k),
            below: marks.filter((m) => m.h > elapsed).map((m) => m.k),
            caveat: "Both clocks start at the first tropical best-track point. The operational "
                  + "b-deck and the archive's IBTrACS record are still different sources and can "
                  + "place that point a synoptic period apart; this is a forecast placed against a "
                  + "distribution, not a verdict on either.",
          };
        })() : null,
      },
      lowell: lowraw ? { id: "EP122026", name: "Lowell", cls: lowraw.classification,
        advNum: lowraw.publicAdvisory && lowraw.publicAdvisory.advNum, atZ: lowraw.lastUpdate,
        lat: lowraw.latitudeNumeric, lonE: lowraw.longitudeNumeric, kt: lowraw.intensity,
        mslp: lowraw.pressure, motionDeg: lowraw.movementDir, motionKt: lowraw.movementSpeed } : null,
    },
    atlas: A,
    composition: { d1: noComposition(g1.pct7d, A.d1), d2: noComposition(g2.pct7d, A.d2) },
    /* The point each query was conditioned on, TYPED — because they are not the same kind of
       thing and the brief must not let them read as if they were. */
    queryPoints: {
      d1: { kind: "ANALYST-DECLARED REFERENCE CELL FROM NHC FORECAST AREA",
            derivation: "centroid of NHC's 7-day formation-area polygon for outlook area 1",
            note: "Not an observed centre, not an Invest, not a disturbance position, not a genesis point." },
      d2: { kind: "ANALYST-DECLARED REFERENCE CELL FROM NHC FORECAST AREA",
            derivation: "centroid of NHC's 7-day formation-area polygon for outlook area 2",
            note: "Not an observed centre, not an Invest, not a disturbance position, not a genesis point." },
      fourteenE: { kind: "OBSERVED GENESIS POINT",
            derivation: "first best-track point with a TROPICAL status, per the archive's own rule",
            note: "The pre-genesis disturbance fix 48 h earlier is recorded separately and is not the query point." },
    },
    /* What each system IS, as a type rather than a name. D2 in particular must not read as an
       existing disturbance: NHC's own 48-hour figure for it is 0%. */
    pointType: {
      d1: "OUTLOOK AREA · BROAD TROUGH, NO CENTRE",
      d2: "FORECAST FORMATION AREA · NO CURRENT DISTURBANCE",
      fourteenE: "OBSERVED GENESIS POINT · ADVISORIES RUNNING",
    },
    spine: {
      d1: "RATES REFUSED",
      d2: "CONDITIONAL RATES PUBLISHED · NO COMPOSED NUMBER",
      fourteenE: "CONDITIONAL RATES + HISTORICAL TIMING",
    },
    corrections: [
      { id: "d2-composition-withdrawn",
        was: "NHC's 7-day formation chance multiplied by the archive's conditional rate to give an unconditional figure.",
        now: "No composed number. NHC's probability is over its forecast formation area; the archive's is conditional on formation under a declared reference condition, and those events are not demonstrably identical.",
        note: "The archive's own CLI suggests the multiplication without stating the condition under which it is valid. Reported, not fixed — that note lives in scripts/genesis." },
      { id: "fourteen-e-clock-aligned",
        was: "Elapsed hours measured from the b-deck's first fix, a DB disturbance row, against a cohort measured from genesis — and reported as beyond the historical p90.",
        now: "Both clocks start at the first TROPICAL best-track point. The claim that the forecast lies beyond p90 is withdrawn.",
        note: "The query point moved with the clock, from the disturbance fix to the genesis point, which changes the cohort." },
      { id: "d2-point-typed",
        was: "An outlook-area centroid presented alongside an observed genesis fix without distinguishing them.",
        now: "Query points are typed: an analyst-declared reference cell is not an observed genesis point." },
    ],
    limits: [
      "The Atlas is conditioned on GENESIS — where and when a storm formed — and nothing else. It is not a forecast and it knows nothing about this week's shear, ocean heat or steering.",
      "A conditional rate assumes a tropical cyclone forms UNDER THE DECLARED REFERENCE CONDITION — this cell, radius, season and scope. It is not combined with NHC's formation probability, whose conditioning event is a different one.",
      "Analog pools are small. Below the sample gate the archive publishes counts and refuses rates, and that refusal is the answer rather than a missing number.",
      "Distances are great-circle from a single point. An outlook polygon is an area, and its centroid is a stand-in for it — a different point inside the same polygon draws a different pool.",
      "Wilson intervals are over distinct storms, which is the honest unit here; they are not intervals over forecasts.",
    ],
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "data.json"), JSON.stringify(payload, null, 2) + "\n");

  const tpl = readFileSync(join(OUT, "template.html"), "utf8");
  writeFileSync(join(OUT, "index.html"),
    tpl.replace('"__DATA__"', JSON.stringify(payload).replace(/</g, "\\u003c")));

  console.log(`  outlook areas   ${areas.map((a) => `#${areas.indexOf(a) + 1} ${a.pct48}%/${a.pct7d}%`).join("  ")}`);
  console.log(`  D1 pool         ${A.d1.nCases} storms, ESS ${A.d1.ess.toFixed(1)} — ${A.d1.sufficient ? "SUFFICIENT" : "BELOW GATE, rates refused"}`);
  console.log(`  D2 pool         ${A.d2.nCases} storms, ESS ${A.d2.ess.toFixed(1)} — ${A.d2.sufficient ? "SUFFICIENT" : "BELOW GATE"}`);
  console.log(`  Fourteen-E pool ${A.fourteenE.nCases} storms, ESS ${A.fourteenE.ess.toFixed(1)} — ${A.fourteenE.sufficient ? "SUFFICIENT" : "BELOW GATE"}`);
  console.log(`  D2 composition  ${payload.composition.d2.state}`);
  const fv = payload.storms.fourteenE.forecastVsAnalogs;
  if (fv) console.log(`  E14 clock       ${fv.clock.arithmetic}  (was ${fv.clock.withdrawn.elapsedHours} h from the ${fv.clock.withdrawn.fromType} fix)`);
  if (fv) console.log(`  E14 timing      ${fv.clock.elapsedHours} h is above ${fv.above.join("/") || "none"}, below ${fv.below.join("/") || "none"}`);
  console.log(`\nWrote ${join(OUT, "data.json")} and index.html`);
}

/* Guarded so the frozen-specimen builder can import the parsers without triggering a live fetch. */
if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
