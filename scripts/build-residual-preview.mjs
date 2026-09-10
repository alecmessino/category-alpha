#!/usr/bin/env node
/* BUILD THE TRACK RESIDUAL MONITOR'S PREVIEW PAYLOAD.
 *
 * Everything the preview page draws is computed here, from the preserved products in
 * scripts/fixtures/lowell-ep122026/ and from nothing else. The page has no arithmetic in it —
 * the same rule the rest of this repository runs on, for the same reason: a number that appears
 * only in a browser is a number no test can reach.
 *
 * The payload carries FIVE STATES on purpose, because a monitor whose refusals are only ever
 * seen in production is a monitor whose refusals were never reviewed:
 *
 *   1. the corrected Lowell worked example, both heading frames tabulated
 *   2. INSUFFICIENT_SAMPLE          — an official-only pair, refused
 *   3. UNCALIBRATED_UNCERTAINTY     — every series, always, until a fit exists
 *   4. a baseline reset             — advisory 46 superseded by 47, marked, trend not continued
 *   5. excluded geometry            — a strike on carved-out geography that does not resolve No
 *
 * Run: node scripts/build-residual-preview.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as R from "./lib/track-residual.mjs";
import * as S from "./lib/track-residual-state.mjs";
import * as C from "./lib/track-residual-closure.mjs";
import * as G from "./lib/settlement-geometry.mjs";
import { baselineFromTcm, fixFromTcp, fixesFromFdeck, buildSeries, firstAvailabilityFrom,
         SOURCE_FAMILIES } from "./lib/track-residual-ingest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "scripts/fixtures/lowell-ep122026");
const OUT = join(ROOT, "docs/preview/track-residual");

const read = (f) => readFile(join(FIX, f), "utf8");

export async function buildPayload() {
  const manifest = JSON.parse(await read("manifest.json"));
  const avail = firstAvailabilityFrom(manifest.transmissions);
  const srcOf = (key) => {
    const e = manifest.entries.find((x) => x.key === key);
    return e ? { url: e.url, retrievedZ: e.retrievedZ, sha256: e.productSha256 } : null;
  };

  /* ---- baselines ------------------------------------------------------------------- */
  const b45 = baselineFromTcm(await read("tcm-045.txt"),
    { baselineId: "EP122026/TCM/045", firstAvailableZ: avail["45"] && avail["45"].firstAvailableZ, source: srcOf("tcm-045") });
  const b46 = baselineFromTcm(await read("tcm-046.txt"),
    { baselineId: "EP122026/TCM/046", firstAvailableZ: avail["46"] && avail["46"].firstAvailableZ, source: srcOf("tcm-046") });
  const b47 = baselineFromTcm(await read("tcm-047.txt"),
    { baselineId: "EP122026/TCM/047", firstAvailableZ: avail["47"] && avail["47"].firstAvailableZ, source: srcOf("tcm-047") });

  /* ---- fixes ----------------------------------------------------------------------- */
  const tcp46a = fixFromTcp(await read("tcp-046a.txt"),
    { fixId: "tcp:46A", receivedZ: avail["46A"] && avail["46A"].firstAvailableZ });
  /* The advisory that SUPERSEDES 46. Its own initial position is a real observed centre at
     21:00Z, and it is what puts a baseline reset into the latest-advisory series. */
  const tcp47 = fixFromTcp(await read("tcp-047.txt"),
    { fixId: "tcp:47", receivedZ: avail["47"] && avail["47"].firstAvailableZ });
  const fdeck = fixesFromFdeck(await read("fdeck.dat"), {
    fromMs: Date.parse(b46.initialValidZ),
    toMs: Date.parse("2026-09-07T21:00:00Z"),
  });
  const allFixes = [...fdeck, tcp46a, tcp47];

  /* ---- 1. THE CORRECTED WORKED EXAMPLE --------------------------------------------- */
  const worked = workedExample(b46, tcp46a);

  /* ---- 2/3. the series and its four refusals --------------------------------------- */
  const nowMs = Date.parse("2026-09-07T21:10:00Z");
  const series = buildSeries([b45, b46, b47], allFixes, (b, f, o) => R.residual(b, f, o),
    { fixedBaselineId: "EP122026/TCM/046" });
  const assessedFixed = S.assessSeries(series.fixed, { nowMs });
  const assessedLatest = S.assessSeries(series.latest, { nowMs });

  /* Official-only: the two products of advisory 46 and nothing else. It must refuse, and the
     refusal must be INSUFFICIENT_SAMPLE, not a trend built from two Tier-2 products. */
  const officialOnly = buildSeries([b46], [tcp46a], (b, f, o) => R.residual(b, f, o), {});
  const assessedOfficial = S.assessSeries(officialOnly.fixed, { nowMs });

  /* ---- 4. the baseline reset -------------------------------------------------------- */
  const resets = S.markBaselineResets(series.latest).filter((r) => r.baselineReset);

  /* ---- closure --------------------------------------------------------------------- */
  const hawaii = JSON.parse(await readFile(join(ROOT, "data/genesis-archive/coastlines/hawaii.geojson"), "utf8"));
  const QUALIFYING = ["Niihau", "Kauai", "Oahu", "Molokai", "Lanai", "Maui", "Kahoolawe", "Island of Hawaii"];
  const rings = C.ringsFromGeoJson(hawaii, (name) => QUALIFYING.includes(name));
  const nwRings = C.ringsFromGeoJson(hawaii, (name) => !QUALIFYING.includes(name));

  const target = { label: "Main Hawaiian Islands (qualifying set, illustrative)", rings,
                   centroidLat: 21.5, centroidLonE: -158.5 };
  const cl = {};
  for (const assumption of ["forecast-as-issued", "residual-persists", "residual-decays"]) {
    cl[assumption] = C.closure(b46, worked.residualForecastFrame, target,
      { assumption, deadlineMs: Date.parse("2026-09-09T00:00:00Z"), decayHours: 24 });
  }
  /* The same question asked over the WHOLE advisory instead of the window: it refuses for
     recurvature, which is the correct answer and is why the window exists. */
  cl["full-track-recurvature"] = C.closure(b46, worked.residualForecastFrame, target,
    { assumption: "forecast-as-issued" });
  const latDiag = C.latitudeCrossingDiagnostic(b46, worked.residualForecastFrame, 21.9,
    { assumption: "forecast-as-issued" });

  /* THE FRAME ERROR, DEMONSTRATED RATHER THAN DESCRIBED. */
  let frameGuard = null;
  try {
    C.assertSameFrame({ frame: "cross-track-nm" }, { frame: "shoreline-gap-east-nm" });
    frameGuard = { threw: false };
  } catch (e) { frameGuard = { threw: true, message: String(e.message) }; }

  /* ---- 5. settlement ---------------------------------------------------------------- */
  const contractProbe = G.getContract("ANY-HAWAII-HURRICANE-CONTRACT");
  /* A complete-looking record that is still refused, to show WHICH field decides. */
  const incomplete = G.defineContract({
    contractId: "EXAMPLE-ONLY", venue: "(none)", rulesUrl: "(none)",
    qualifyingGeography: QUALIFYING, namedExclusions: ["Papahanaumokuakea Marine National Monument"],
    eventWindow: { startZ: "2026-09-07T00:00:00Z", endZ: "2026-09-12T00:00:00Z", timezone: "UTC" },
    intensity: { definition: "1-minute sustained surface wind", units: "kt", comparison: ">=64" },
    requiresCentreCrossing: true, resolutionAuthority: "(none)",
    rulesVersion: null,
  });
  /* Excluded strike, window still open: NOT a terminal No. Demonstrated on a hypothetical
     contract record built by hand, and labelled as one. */
  const demoContract = G.defineContract({
    contractId: "DEMO-NOT-A-REAL-CONTRACT", venue: "DEMONSTRATION ONLY",
    rulesUrl: "https://example.invalid/demonstration-only",
    rulesText: "DEMONSTRATION RECORD. Not a real contract and not a quotation of any venue's "
             + "rules. Present only so the resolution state machine can be exercised on screen.",
    rulesRetrievedZ: "2026-09-07T18:00:00.000Z", rulesVersion: null,
    rulesSha256: "0".repeat(64),
    qualifyingGeography: QUALIFYING,
    namedExclusions: ["Papahanaumokuakea Marine National Monument", "French Frigate Shoals", "Nihoa"],
    eventWindow: { startZ: "2026-09-07T00:00:00Z", endZ: "2026-09-12T00:00:00Z", timezone: "UTC" },
    intensity: { definition: "1-minute sustained surface wind", units: "kt", comparison: ">=64" },
    requiresCentreCrossing: true, resolutionAuthority: "DEMONSTRATION ONLY",
  });
  const excludedStrike = { region: "Nihoa", centreCrossed: true, atZ: "2026-09-08T06:00:00Z" };
  const settlement = {
    registryEmpty: contractProbe,
    incompleteRecordRefusal: incomplete,
    demonstration: demoContract.ok ? {
      contractId: demoContract.contract.contractId,
      disclaimer: "DEMONSTRATION RECORD — not a real contract, not any venue's rules.",
      strikeClassification: G.classifyStrike(demoContract.contract, excludedStrike),
      stateWhileWindowOpen: G.resolutionState(demoContract.contract, [excludedStrike], Date.parse("2026-09-08T12:00:00Z")),
      stateAfterWindowCloses: G.resolutionState(demoContract.contract, [excludedStrike], Date.parse("2026-09-13T00:00:00Z")),
      warningVsCrossing: G.classifyStrike(demoContract.contract, { region: "Oahu", centreCrossed: false }),
    } : { refusal: demoContract.refusal },
    layers: G.LAYERS, warningSemantics: G.WARNING_SEMANTICS,
    hawaiiTrigger: {
      text: "EXACT TRIGGER NOT SCORED",
      note: "A Hawaii >=64 kt landfall contract is not scoreable as a probability by this "
          + "module. What is published is a required rate and a state.",
    },
  };

  return {
    schema: "millibar.track-residual.preview/1",
    generatedAt: new Date().toISOString(),
    signConvention: R.SIGN_CONVENTION,
    interpolation: R.RESIDUAL_INTERPOLATION,
    fixtureManifest: { retrievedZ: manifest.retrievedZ, status: manifest.status,
                       entries: manifest.entries.map((e) => ({ key: e.key, url: e.url, sha256: e.productSha256 })) },
    firstAvailability: avail,
    sourceFamilies: SOURCE_FAMILIES,
    worked,
    series: {
      fixedBaselineId: series.fixedBaselineId,
      fixed: series.fixed, latest: series.latest,
      assessedFixed, assessedLatest,
      baselineResets: resets.map((r) => ({ at: r.fixValidZ, from: r.previousBaselineId, to: r.baselineId })),
      wobbleBound: S.wobbleBoundNm(series.fixed),
    },
    officialOnly: { series: officialOnly.fixed, assessed: assessedOfficial },
    closure: { byAssumption: cl, latitudeDiagnostic: latDiag, frameGuard,
               qualifyingRings: rings.map((r) => r.name), excludedRings: [...new Set(nwRings.map((r) => r.name))] },
    settlement,
    knownLimits: [
      "Linear interpolation between forecast positions; the deviation from a geodesic is measured and printed, not hidden.",
      "Wobble is BOUNDED, not removed.",
      "The heading frame is derived from a smoothed forecast path, not from the storm's instantaneous motion.",
      "Mixed centre definitions disagree by several nautical miles; no offset between them has been measured.",
      "A required rate is kinematics, not achievability.",
      "The quadrature noise floor is an assumption. WITHIN_NOISE is not absence of signal.",
    ],
  };
}

/**
 * THE CORRECTED WORKED EXAMPLE. Both heading frames tabulated, and the two wrong readings kept
 * beside them, because "the brief was wrong" is a claim that should be checkable on screen.
 */
function workedExample(b46, tcp46a) {
  const pts = R.coveragePoints(b46);
  const tMs = Date.parse(tcp46a.validZ);
  const at = R.interpolateAtTime(pts, tMs);
  const frame = R.localCourseDeg(pts, tMs);
  const resForecastFrame = R.residual(b46, tcp46a);
  const observedMotionDeg = tcp46a.reportedMotion ? tcp46a.reportedMotion.deg : null;
  const inMotionFrame = observedMotionDeg == null ? null
    : R.projectResidual({ lat: at.lat, lonE: at.lonE }, { lat: tcp46a.lat, lonE: tcp46a.lonE }, observedMotionDeg);

  /* What latitude interpolation says, and what the brief said on top of it. */
  const cmp = R.latInterpComparison(b46, tcp46a);
  /* The brief's own numbers, from the document, for side-by-side comparison ONLY. */
  const brief = {
    forecast: { lat: 18.00, lonE: -162.38 },
    crossNm: 13.6, alongNm: 0.0,
    interpolation: "linear-in-latitude", frameDeg: 30,
    note: "The brief's table. Not a fixture, not evidence — the thing being corrected.",
  };

  return {
    storm: "Hurricane Lowell (EP122026)",
    baseline: {
      baselineId: b46.baselineId, advisoryNumber: b46.advisoryNumber,
      initialValidZ: b46.initialValidZ, issuedZ: b46.issuedZ, firstAvailableZ: b46.firstAvailableZ,
      positionAccuracyText: b46.positionAccuracyText,
      reportedMotion: b46.reportedMotion,
      source: b46.source,
      points: b46.points,
    },
    fix: { fixId: tcp46a.fixId, validZ: tcp46a.validZ, lat: tcp46a.lat, lonE: tcp46a.lonE,
           centreDefinition: tcp46a.centreDefinition, reportedMotion: tcp46a.reportedMotion,
           advisoryNumber: tcp46a.advisoryNumber },
    /* THE NOMINAL-LABEL TRAP, as a number. */
    leadLabels: {
      nominalFirstRowLabel: "12H",
      actualHoursInitToFirstRow: (Date.parse(b46.points[1].validZ) - Date.parse(b46.points[0].validZ)) / 3600e3,
      note: "The first forecast row is filed under a nominal 12 h label and is NINE hours after "
          + "the initial position. Only explicit UTC valid times are read.",
    },
    interpolated: { validZ: tcp46a.validZ, lat: at.lat, lonE: at.lonE,
                    segmentValidZ: at.segmentValidZ, segmentHours: at.segmentHours, fraction: at.fraction },
    frames: [
      { name: "baseline forecast local direction (THE FRAME THIS MODULE USES)",
        courseDeg: frame.courseDeg, crossNm: resForecastFrame.crossNm, alongNm: resForecastFrame.alongNm,
        separationNm: resForecastFrame.separationNm },
      { name: "observed motion reported in TCP 46A (comparison only)",
        courseDeg: observedMotionDeg, crossNm: inMotionFrame && inMotionFrame.crossNm,
        alongNm: inMotionFrame && inMotionFrame.alongNm,
        separationNm: inMotionFrame && inMotionFrame.separationNm },
    ],
    rejected: {
      latInterp: cmp.latInterp,
      brief,
      /* The brief's along-track is wrong even on the brief's own construction: a due-east
         displacement on a 030 heading has an along-track component of d*sin(30). */
      briefAlongOnItsOwnTerms: cmp.latInterp.ok ? cmp.latInterp.separationNm * Math.sin(30 * Math.PI / 180) : null,
    },
    interpolationBound: R.interpolationBoundNm(pts),
    positionAccuracy: {
      verbatim: b46.positionAccuracyText,
      unconverted: S.withinNmToSigma(b46.positionAccuracyNm, undefined),
      ifConverted: S.withinNmToSigma(b46.positionAccuracyNm, "two-sigma"),
    },
    rounding: S.roundingBoundNm(tcp46a.lat, 0.1),
    residualForecastFrame: resForecastFrame,
  };
}

async function main() {
  const payload = await buildPayload();
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "data.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
  const w = payload.worked;
  console.log(`\n  ${w.storm} — baseline ${w.baseline.baselineId}, fix ${w.fix.fixId}`);
  console.log(`  nominal label 12H, actual ${w.leadLabels.actualHoursInitToFirstRow} h`);
  console.log(`  forecast @ ${w.interpolated.validZ}: ${w.interpolated.lat.toFixed(4)}N ${(-w.interpolated.lonE).toFixed(4)}W`);
  for (const f of w.frames)
    console.log(`  frame ${String(f.courseDeg && f.courseDeg.toFixed(2)).padStart(6)}°  cross ${f.crossNm.toFixed(2).padStart(7)} nm  along ${f.alongNm.toFixed(2).padStart(7)} nm  — ${f.name}`);
  console.log(`  interpolation bound (linear vs geodesic): ${w.interpolationBound.maxDeviationNm.toFixed(3)} nm`);
  console.log(`  fixed series: ${payload.series.fixed.filter((r) => r.ok).length} usable / ${payload.series.fixed.length}`);
  console.log(`  sample: ${payload.series.assessedFixed.sampleSufficiency.state} (${payload.series.assessedFixed.sampleSufficiency.independentGroups} independent groups)`);
  console.log(`  uncertainty: ${payload.series.assessedFixed.uncertaintyCalibration.state}`);
  console.log(`  trend: ${payload.series.assessedFixed.trendStatus.state}`);
  console.log(`  official-only: ${payload.officialOnly.assessed.sampleSufficiency.state}`);
  console.log(`\nWrote ${join(OUT, "data.json")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
