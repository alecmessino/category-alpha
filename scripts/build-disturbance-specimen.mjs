#!/usr/bin/env node
/* BUILD THE FROZEN SPECIMEN — offline, from the pinned sources only.
 *
 * This is the archival layer over the live builder, not a replacement for it. It reads nothing
 * from the network: every input comes from research/specimens/2026-09-09-three-systems/sources/,
 * and every one is hash-checked against the manifest before it is parsed. If a byte moved, this
 * refuses to build rather than quietly producing a different specimen under the same name.
 *
 * It shares the live builder's PARSERS by import rather than by copy, so the frozen document and
 * the live page cannot drift into reading the same product two different ways.
 *
 * Emits, all deterministic from the frozen bytes:
 *   specimen.json      the payload
 *   snapshot.html      a static, self-contained HTML snapshot (no network, no fonts fetched)
 *   print.html         the one-page Letter layout the PDF is rendered from
 *
 * Run: node scripts/build-disturbance-specimen.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pre, parseOutlookAreas, bestRows, forecastRows, pack, noComposition,
         TROPICAL_STATUS } from "./build-disturbance-brief.mjs";
import { parseOutlookShapes } from "./lib/shapefile.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "research/specimens/2026-09-09-three-systems");
const SRC = join(SPEC, "sources");
const M = JSON.parse(readFileSync(join(SPEC, "MANIFEST.json"), "utf8"));

/* EVERY INPUT IS VERIFIED BEFORE IT IS READ. A specimen whose sources have moved is not this
   specimen, and building it anyway under the same filename is the failure this guards. */
function frozen(key) {
  const e = M.sources.find((x) => x.key === key);
  if (!e) throw new Error(`no frozen source "${key}" in the manifest`);
  const buf = readFileSync(join(SRC, e.file));
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== e.sha256)
    throw new Error(`REFUSING TO BUILD: ${e.file} hashes ${got.slice(0, 16)}, manifest says ${e.sha256.slice(0, 16)}`);
  return buf;
}
const frozenText = (k) => frozen(k).toString("utf8");
const frozenJson = (k) => JSON.parse(frozenText(k));

const twoText = pre(frozenText("two-ep-092321"));
const areas = parseOutlookAreas(twoText);
if (areas.length !== 2) throw new Error(`expected 2 outlook areas in the frozen outlook, got ${areas.length}`);

const shapes = parseOutlookShapes(frozen("gtwo-shapefiles"));
/* The captured shapefile cannot be re-fetched, so its identity is asserted rather than assumed. */
const EXPECTED_GTWO = "202609092323";
if (shapes.issued !== EXPECTED_GTWO)
  throw new Error(`frozen GTWO is issuance ${shapes.issued}, specimen is pinned to ${EXPECTED_GTWO}`);

const geo = (n) => {
  const s = shapes.areas.find((x) => x.n === n);
  const pts = s.rings.flat();
  const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
  return { pct48: s.pct48, pct7d: s.pct7d, rings: s.rings,
           bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
           centroid: [lats.reduce((a, b) => a + b, 0) / lats.length,
                      lons.reduce((a, b) => a + b, 0) / lons.length] };
};
const g1 = geo(1), g2 = geo(2);

const current = frozenJson("currentstorms");
const st = (id) => (current.activeStorms || []).find((s) => s.id === id) || null;
const e14raw = st("ep142026"), lowraw = st("ep122026");

const bdeck = bestRows(frozenText("bdeck-ep142026"));
const firstTrack = bdeck[0];
const genesis = bdeck.find((r) => TROPICAL_STATUS.has((r.type || "").toUpperCase()));
const latestBest = bdeck[bdeck.length - 1];
const preGenesisHours = (Date.parse(genesis.atZ) - Date.parse(firstTrack.atZ)) / 3600e3;
const tcm = forecastRows(pre(frozenText("tcm-ep14-001")));

const A = {
  d1AllEras: pack(frozenJson("analogs-d1-alleras"), "Disturbance 1 — all eras"),
  d1: pack(frozenJson("analogs-d1-1971"), "Disturbance 1 — 1971+"),
  d2: pack(frozenJson("analogs-d2-1971"), "Disturbance 2 — 1971+"),
  fourteenE: pack(frozenJson("analogs-e14-genesis"), "Fourteen-E — conditioned on its genesis point, 1971+"),
  fourteenEFromFirstTrack: pack(frozenJson("analogs-e14-firsttrack-WITHDRAWN"),
    "Fourteen-E — WITHDRAWN: conditioned on the first-track disturbance fix"),
};

const genesisMs = Date.parse(genesis.atZ);
const firstCat1 = tcm.rows.find((r) => r.kt >= 64) || null;
const t = A.fourteenE.timeToEvent.cat1 || null;
const elapsed = firstCat1 ? (Date.parse(firstCat1.validZ) - genesisMs) / 3600e3 : null;
const marks = t ? ["p10", "p25", "median", "p75", "p90"].filter((k) => t[k] != null).map((k) => ({ k, h: t[k] })) : [];

const payload = {
  schema: "millibar.storm-atlas.disturbance-specimen/1",
  specimen: { name: M.name, asOf: M.asOf, asOfLocal: M.asOfLocal, frozenAt: M.frozenAt },
  /* The freeze time, NOT the wall clock. Every input is hash-pinned, so a rebuild from the
     same MANIFEST must produce byte-identical output; a `new Date()` here would silently make
     the specimen differ from itself on every run and defeat the point of freezing it. */
  builtAt: M.frozenAt,
  /* Alias only. The live brief template renders this key; the specimen and the live page are
     the same document rendered from the same shape. */
  generatedAt: M.frozenAt,
  outlook: {
    issuedLocal: (/^\s*\d{3,4}\s+(AM|PM)\s+[A-Z]{3}[^\n]*$/im.exec(twoText) || [""])[0].trim(),
    forecaster: (/\$\$\s*\nForecaster\s+(.+)/.exec(twoText) || [null, null])[1],
    areas: areas.map((a, i) => ({ ...a, n: i + 1 })),
  },
  gtwo: { issued: shapes.issued, d1: g1, d2: g2 },
  storms: {
    fourteenE: {
      id: "EP142026", name: "Fourteen-E", cls: e14raw.classification,
      advNum: e14raw.publicAdvisory && e14raw.publicAdvisory.advNum,
      atZ: e14raw.lastUpdate, lat: e14raw.latitudeNumeric, lonE: e14raw.longitudeNumeric,
      kt: e14raw.intensity, mslp: e14raw.pressure,
      motionDeg: e14raw.movementDir, motionKt: e14raw.movementSpeed,
      firstTrack, genesis, preGenesisHours, latestBest,
      forecastIssuedZ: tcm.issuedZ, forecast: tcm.rows,
      forecastVsAnalogs: firstCat1 ? {
        firstCat1,
        clock: { genesisZ: genesis.atZ, genesisRule: "first best-track point with a TROPICAL status",
                 genesisType: genesis.type, genesisKt: genesis.kt,
                 forecastValidZ: firstCat1.validZ, forecastKt: firstCat1.kt, elapsedHours: elapsed,
                 arithmetic: `${firstCat1.validZ} − ${genesis.atZ} = ${elapsed} h`,
                 withdrawn: { fromZ: firstTrack.atZ, fromType: firstTrack.type,
                   elapsedHours: (Date.parse(firstCat1.validZ) - Date.parse(firstTrack.atZ)) / 3600e3 } },
        analogHoursToCat1: t,
        above: marks.filter((m) => m.h <= elapsed).map((m) => m.k),
        below: marks.filter((m) => m.h > elapsed).map((m) => m.k),
        caveat: "Both clocks start at the first tropical best-track point. The operational b-deck "
              + "and the archive's IBTrACS record are still different sources and can place that "
              + "point a synoptic period apart.",
      } : null,
    },
    lowell: lowraw ? { id: "EP122026", name: "Lowell", cls: lowraw.classification,
      advNum: lowraw.publicAdvisory && lowraw.publicAdvisory.advNum, atZ: lowraw.lastUpdate,
      lat: lowraw.latitudeNumeric, lonE: lowraw.longitudeNumeric, kt: lowraw.intensity,
      mslp: lowraw.pressure, motionDeg: lowraw.movementDir, motionKt: lowraw.movementSpeed } : null,
  },
  atlas: A,
  composition: { d1: noComposition(g1.pct7d, A.d1), d2: noComposition(g2.pct7d, A.d2) },
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
  pointType: {
    d1: "OUTLOOK AREA · BROAD TROUGH, NO CENTRE",
    d2: "FORECAST FORMATION AREA · NO CURRENT DISTURBANCE",
    fourteenE: "OBSERVED GENESIS POINT · ADVISORIES RUNNING",
  },
  spine: { d1: "RATES REFUSED",
           d2: "CONDITIONAL RATES PUBLISHED · NO COMPOSED NUMBER",
           fourteenE: "CONDITIONAL RATES + HISTORICAL TIMING" },
  limits: [
    "The Atlas is conditioned on GENESIS — where and when a storm formed — and nothing else. It is not a forecast and it knows nothing about this week's shear, ocean heat or steering.",
    "A conditional rate assumes a tropical cyclone forms UNDER THE DECLARED REFERENCE CONDITION — this cell, radius, season and scope. It is not combined with NHC's formation probability, whose conditioning event is a different one.",
    "Analog pools are small. Below the sample gate the archive publishes counts and refuses rates, and that refusal is the answer rather than a missing number.",
    "An outlook polygon is an area; its centroid is an analyst-declared stand-in. A different point inside the same polygon draws a different pool.",
    "Wilson intervals are over distinct storms. They are not intervals over forecasts.",
  ],
  provenance: { sources: M.sources.map((s) => ({ kind: s.kind, key: s.key, file: s.file, sha256: s.sha256 })),
                reproducibility: M.reproducibility,
                genesisArchive: M.genesisArchive },
};

writeFileSync(join(SPEC, "specimen.json"), JSON.stringify(payload, null, 2) + "\n");

/* The print sheet and the static snapshot are the SAME payload rendered two ways. */
const inject = (tplFile, outFile) => {
  const tpl = readFileSync(join(SPEC, tplFile), "utf8");
  writeFileSync(join(SPEC, outFile),
    tpl.replace('"__DATA__"', JSON.stringify(payload).replace(/</g, "\\u003c")));
};
inject("print-template.html", "print.html");
/* The prospect plate is the SAME payload, editorially reduced: one finding, one refusal, no
   number of its own. print.html stays the audit sheet -- see prospect-template.html's header. */
inject("prospect-template.html", "prospect.html");
/* The static snapshot is the LIVE brief template with the frozen payload — deliberately the
   same template the live builder uses, so the snapshot cannot drift into a second design that
   says something the live page does not. */
const BRIEF_TPL = join(ROOT, "docs", "preview", "disturbance-brief", "template.html");
{
  const tpl = readFileSync(BRIEF_TPL, "utf8");
  writeFileSync(join(SPEC, "snapshot.html"),
    tpl.replace('"__DATA__"', JSON.stringify(payload).replace(/</g, "\\u003c")));
}
console.log(`  as of        ${payload.specimen.asOfLocal}`);
console.log(`  D1           ${payload.spine.d1} · ${A.d1.nCases} storms, ESS ${A.d1.ess.toFixed(1)}`);
console.log(`  D2           ${payload.spine.d2} · ${A.d2.nCases} storms, ESS ${A.d2.ess.toFixed(1)}`);
console.log(`  Fourteen-E   ${payload.spine.fourteenE} · ${A.fourteenE.nCases} storms, ESS ${A.fourteenE.ess.toFixed(1)}`);
const f = payload.storms.fourteenE.forecastVsAnalogs;
console.log(`  clock        ${f.clock.arithmetic}`);
console.log(`  timing       ${f.clock.elapsedHours} h above ${f.above.join("/")}, below ${f.below.join("/")}`);
console.log(`\n  Wrote ${join(SPEC, "specimen.json")}`);
