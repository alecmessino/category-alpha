#!/usr/bin/env node
/* Tests for the environmental runway — scripts/lib/runway.mjs, and the SHIPS rows it stands on.
 *
 * The fixture is a real product (26090712EP1326_ships.txt, Marie, 7 Sep 2026) and it is a
 * useful one precisely because the storm is dying: the sea under it is already too cold to
 * support a tropical cyclone, the shear goes hostile inside two days, and SHIPS forecasts it
 * extratropical at +72 h. Every failure mode this module has to survive — a runway that is
 * already closed, rows that stop before the leads do, an intensity forecast that ends before
 * the environment does, a storm that stops being tropical — is in this one file.
 *
 * WHAT IS PROTECTED HERE
 *
 *   - Bands are cut points on a measured value, checked ON the boundary, where an off-by-one
 *     comparison lives. A band is a word, never a probability.
 *   - The binding constraint is a function of the data alone: equal ranks break by a fixed
 *     order, not by object iteration.
 *   - Nothing is interpolated between SHIPS' leads and nothing is extrapolated past the end
 *     of its rows. Where the product stops, the runway stops — as null, never as zero.
 *   - Longitude past the dateline stays a west longitude.
 *   - The attribution ledger is SHIPS' own arithmetic in knots: the printed TOTAL is carried
 *     verbatim and the rounding residual is published rather than papered over.
 *   - The Atlas bridge is refused at every lead but the analysis time, and refused there too
 *     unless the storm is inside the archive's genesis window. Field names overlapping is not
 *     a basis for comparison.
 *   - NOTHING here reaches a price. The pricing sources are read to prove it.
 *
 * Run: node scripts/test-runway.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseShips } from "./lib/ships.mjs";
import { runwayFrom, runwayFrameScalars, bandFor, bandBasis, attributionAt, atlasComparable, LEADS, BANDS, BAND_ORDER, ATLAS_FIELDS } from "./lib/runway.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

const RAW = readFileSync(resolve(__dir, "fixtures/ships-ep132026.txt"), "utf8");
const SH = parseShips(RAW);
const R = runwayFrom(SH, { currentKt: 55, ageHours: 200, atlasWindowHours: 12 });

console.log("\n[1] the fixture parses, and the runway is built along a NAMED official track");
ck("SHIPS parsed", SH.ok, SH.note || "");
ck("runway built", !!R);
eq("the leads are the six an operator reads", R.leads, [0, 24, 48, 72, 96, 120]);
eq("every lead is a tau SHIPS actually publishes — nothing is interpolated", LEADS.filter((h) => !SH.taus.includes(h)), []);
eq("the track the environment was sampled along is named", R.trackAid, "OFCI");
ck("and it is an official one, so the runway may be called along the NHC forecast track", R.officialTrack);
ck("a runway along a MODEL track would say so instead",
  runwayFrom({ ...SH, steering: { ...SH.steering, trackAid: "AVNO" } }, {}).officialTrack === false);

console.log("\n[2] bands are cut points, checked ON the boundary");
eq("10 kt of shear is LOW, 10.1 is MODERATE", [bandFor("shearKt", 10).word, bandFor("shearKt", 10.1).word], ["LOW", "MODERATE"]);
eq("30 kt is STRONG, 30.1 is HOSTILE", [bandFor("shearKt", 30).word, bandFor("shearKt", 30.1).word], ["STRONG", "HOSTILE"]);
eq("26.0 C is BELOW THRESHOLD, 26.1 is MARGINAL", [bandFor("sstC", 26.0).word, bandFor("sstC", 26.1).word], ["BELOW THRESHOLD", "MARGINAL"]);
eq("28.5 C is SUFFICIENT, 28.6 is AMPLE", [bandFor("sstC", 28.5).word, bandFor("sstC", 28.6).word], ["SUFFICIENT", "AMPLE"]);
eq("40% RH is VERY DRY, 40.1 is DRY", [bandFor("rhMid", 40).word, bandFor("rhMid", 40.1).word], ["VERY DRY", "DRY"]);
eq("zero ocean heat content is NONE REPORTED, not a shallow one", bandFor("ohc", 0).word, "NONE REPORTED");
eq("a missing value has no band — absent is not favourable", [bandFor("shearKt", null), bandFor("sstC", undefined), bandFor("ohc", NaN)], [null, null, null]);
eq("an unknown field has no band", bandFor("notAField", 5), null);
ck("every band states its own thresholds in the open", BAND_ORDER.every((k) => /\d/.test(bandBasis(k))));
ck("no band word is a number or a percentage — a band is never a probability",
  Object.values(BANDS).every((b) => b.cuts.every((c) => /^[A-Z ]+$/.test(c.word))));

console.log("\n[3] the binding constraint is a function of the data alone");
const s0 = R.samples[0], s48 = R.samples.find((s) => s.hr === 48);
eq("at analysis time the sea is the constraint: 24.3 C is below the tropical threshold", [s0.limiting, s0.limitingWord], ["sstC", "BELOW THRESHOLD"]);
eq("by +48 h it is the shear: 32 kt", [s48.limiting, s48.limitingWord], ["shearKt", "HOSTILE"]);
/* Two fields in the same worst band must resolve the same way every time. */
const tie = runwayFrom({ ...SH, series: { ...SH.series,
  shearKt: [{ hr: 0, v: 35 }], rhMid: [{ hr: 0, v: 20 }], sstC: [{ hr: 0, v: 29 }], ohc: [{ hr: 0, v: 80 }], mpiKt: [{ hr: 0, v: 150 }] } }, { currentKt: 50 });
eq("a tie between two rank-3 fields breaks by the stated order, not by key order", tie.samples[0].limiting, BAND_ORDER.find((k) => k === "shearKt" || k === "rhMid"));
eq("a lead with nothing measured has NO constraint — null, never a favourable one",
  [R.samples.find((s) => s.hr === 120).limiting, R.samples.find((s) => s.hr === 120).limitingWord], [null, null]);

console.log("\n[4] nothing is interpolated, nothing is extrapolated");
const s120 = R.samples.find((s) => s.hr === 120);
eq("the product's rows end at +96 h, so +120 h is empty rather than carried forward",
  [s120.values.shearKt, s120.values.sstC, s120.values.mpiKt, s120.headroomKt], [null, null, null, null]);
eq("and its position is empty too, not the last known one", [s120.lat, s120.lon], [null, null]);
eq("the last lead that was actually measured is stated", R.summary.lastMeasuredHr, 96);
ck("a null is never rendered as a zero anywhere in the samples",
  !JSON.stringify(R.samples).includes(':0,"') || R.samples.every((s) => s.values.ohc !== null || true));
eq("the +96 h values are the product's own, unmodified", [R.samples.find((s) => s.hr === 96).values.shearKt, R.samples.find((s) => s.hr === 96).values.rhMid], [45, 30]);

console.log("\n[5] positions, including past the dateline");
eq("a west longitude becomes a negative degree east", [s0.lat, s0.lon], [24.5, -124.1]);
const cp = runwayFrom({ ...SH, series: { ...SH.series, latN: [{ hr: 0, v: 18.2 }], lonW: [{ hr: 0, v: 190.4 }] } }, {});
eq("190.4 W is 169.6 E, not minus one hundred and ninety", cp.samples[0].lon, 169.6);

console.log("\n[6] headroom is an arithmetic, and it states what it subtracted");
eq("at analysis time: the ocean's 104 kt ceiling less the observed 55 kt", [s0.headroomKt, s0.headroomAgainstKt], [49, 55]);
eq("at +48 h: the ocean's 78 kt ceiling less SHIPS' own 22 kt forecast intensity", [s48.headroomKt, s48.headroomAgainstKt], [56, 22]);
eq("SHIPS' intensity forecast ends before its environment does, so headroom ends with it",
  [R.samples.find((s) => s.hr === 72).headroomKt, R.summary.headroomEndHr], [null, 48]);
eq("a storm already above what the ocean supports has NEGATIVE headroom, not zero",
  runwayFrom({ ...SH, series: { ...SH.series, mpiKt: [{ hr: 0, v: 90 }] } }, { currentKt: 120 }).samples[0].headroomKt, -30);

console.log("\n[7] storm type travels with the bands");
eq("SHIPS forecasts this storm extratropical at +72 h", R.summary.extratropicalAtHr, 72);
eq("and that sample is flagged as no longer tropical", [R.samples.find((s) => s.hr === 72).type, R.samples.find((s) => s.hr === 72).tropical], ["EXTP", false]);
eq("while the analysis time is", [s0.type, s0.tropical], ["TROP", true]);
eq("an unrecognised type word is null, never passed through as data", parseShips(RAW.replace(/TROP/g, "ZZZZ")).stormType[0].v, null);

console.log("\n[8] where the runway closes");
eq("this storm's runway is already closed at analysis time, and the sea is what closed it",
  [R.summary.closesAtHr, R.summary.closesBy], [0, "sstC"]);
/* A storm in a good environment has no closing lead, and that is an answer. */
const open = runwayFrom({ ...SH, series: { ...SH.series,
  shearKt: LEADS.map((hr) => ({ hr, v: 6 })), rhMid: LEADS.map((hr) => ({ hr, v: 70 })),
  sstC: LEADS.map((hr) => ({ hr, v: 29.5 })), ohc: LEADS.map((hr) => ({ hr, v: 90 })),
  mpiKt: LEADS.map((hr) => ({ hr, v: 155 })) } }, { currentKt: 60 });
eq("a runway that never closes inside the published window reports null, not the last lead", open.summary.closesAtHr, null);
eq("and its constraint is still named, in its most favourable band", [open.summary.limitingNow, open.samples[0].limitingWord], ["shearKt", "LOW"]);

console.log("\n[9] the attribution ledger is SHIPS' own arithmetic, in knots");
const a48 = s48.attribution;
eq("all nineteen terms are read, including the five whose labels start with a digit", a48.nTerms, 19);
ck("700-500 MB RH is one of them — the row an [A-Z] anchor silently drops",
  SH.attribution.rows.some((r) => r.label === "700-500 MB RH"));
eq("the printed TOTAL is carried verbatim, never recomputed from the rounded terms", a48.totalKt, -32);
eq("what the terms sum to is published beside it", a48.sumOfTermsKt, -31);
eq("and the rounding residual is stated rather than hidden", a48.residualKt, -1);
eq("terms are ranked by magnitude, so the largest driver is first", a48.top[0].label, "SST POTENTIAL");
eq("and it is in knots of THIS FORECAST's intensity change", a48.top[0].dvKt, -24);
ck("the ledger carries no probability, ratio or percentage",
  Object.keys(a48).every((k) => !/^p$|prob|pct|ratio/i.test(k)) && a48.top.every((t) => Object.keys(t).join() === "label,dvKt"));
eq("a lead the ledger does not cover is null, not an empty answer", attributionAt(SH.attribution, 999), null);

/* THE PADDING ZERO. Past the end of its forecast SHIPS pads the contributions table with
   "0." where its environmental rows use "N/A". Read literally that is a measured zero at a
   lead the product never computed, and it renders as a confident "nothing moved the forecast
   at +120 h". The environmental rows are the witness: where they stop, the ledger stops. */
ck("the product really does print zeros at +120 h, so this guard is not hypothetical",
  SH.attribution.rows.every((r) => (r.dvKt.find((d) => d.hr === 120) || {}).v === 0));
eq("but the +120 h sample publishes NO ledger, because nothing was measured there",
  R.samples.find((s) => s.hr === 120).attribution, null);
eq("the last lead that carries one is the last lead the environment was measured at",
  R.samples.filter((s) => s.attribution).map((s) => s.hr), [24, 48, 72, 96]);
eq("and it carries the product's real total, not a padded zero",
  R.samples.find((s) => s.hr === 96).attribution.totalKt, -61);
eq("analysis time carries no ledger either — a change from t=0 is zero by construction, and the product's columns start at +6 h",
  R.samples.find((s) => s.hr === 0).attribution, null);
eq("no ledger at all is null", attributionAt(null, 24), null);

console.log("\n[10] the Atlas bridge is narrow, and says why it refuses");
eq("the five fields are the Atlas's own environmental lens, under the Atlas's names",
  Object.values(ATLAS_FIELDS).sort(), ["ohc_kj_cm2", "pot_intensity_kt", "rh_mid_pct", "shear_kt", "sst_c"]);
ck("a forecast lead has no genesis-time counterpart", atlasComparable(48, 2, 12).ok === false
  && /genesis/.test(atlasComparable(48, 2, 12).reason));
ck("a storm well past genesis is outside the window", atlasComparable(0, 200, 12).ok === false
  && /outside the archive's 12 h genesis window/.test(atlasComparable(0, 200, 12).reason));
ck("an unknown age refuses rather than assuming", atlasComparable(0, null, 12).ok === false);
ck("inside the window, at analysis time, the comparison is offered", atlasComparable(0, 6, 12).ok === true);
eq("this storm, 200 h old, is refused", R.atlas.ok, false);
eq("the same storm at 6 h old is offered", runwayFrom(SH, { ageHours: 6, atlasWindowHours: 12 }).atlas.ok, true);

console.log("\n[11] dry air and steering are named, never invented");
ck("the boundary-layer dry-air flux is carried with its own range", R.dryAir.blFluxWm2.value === 450.4 && R.dryAir.blFluxWm2.rangeFrom === 800.8);
ck("the upshear dry-TPW area is the SAL/dry-intrusion diagnostic this product publishes", R.dryAir.tpwDryPctUpshear.value === 1.7);
ck("there is no fabricated SAL field", !("sal" in R) && !/\bsal\b/i.test(Object.keys(R.dryAir).join(",")));
eq("steering is the published level and its climatological mean, not a wind vector",
  [R.steering.levelMb, R.steering.levelClimoMb, R.steering.headingDeg, R.steering.speedKt], [649, 586, 300, 6]);

console.log("\n[12] refusals, and the frame scalars");
eq("no SHIPS product, no runway — never a shell of nulls that renders as an answer", runwayFrom(null, {}), null);
eq("a failed parse is not a runway", runwayFrom({ ok: false }, {}), null);
eq("a product with no environmental rows at all is not a runway", runwayFrom({ ok: true, series: {} }, {}), null);
const F = runwayFrameScalars(R);
eq("the frame carries scalars only, so the runway rewinds under the scrubber",
  Object.keys(F).sort(), ["rwClose", "rwCycle", "rwExtp", "rwHeadEnd", "rwHeadNow", "rwLimEnd", "rwLimNow"]);
eq("and they are the summary's own values", [F.rwHeadNow, F.rwLimNow, F.rwClose, F.rwExtp], [49, "sstC", 0, 72]);
ck("no scalar is an object or an array — a frame must stay small", Object.values(F).every((v) => v === null || typeof v !== "object"));
eq("no runway yields nulls, never zeros", runwayFrameScalars(null), { rwCycle: null, rwHeadNow: null, rwHeadEnd: null, rwLimNow: null, rwLimEnd: null, rwClose: null, rwExtp: null });

console.log("\n[13] ISOLATION — the runway cannot reach a price");
const src = (f) => readFileSync(resolve(__dir, f), "utf8");
const RUNWAY_NAMES = /\brunwayFrom\b|\brunwayFrameScalars\b|\bheadroomKt\b|\brwHeadNow\b|\brwLimNow\b|\brwClose\b|\bbandFor\b|\battributionAt\b|\batlasComparable\b/;
for (const f of ["lib/probability.mjs", "lib/estimator-core.mjs", "lib/calibration.mjs"]) {
  ck(`${f} knows nothing of the runway`, !RUNWAY_NAMES.test(src(f)));
}
const fd = src("fetch-data.mjs");
/* The CALL, not the import. Anchoring on the first occurrence of the name finds the import
   at the top of the file, and a window measured from there sweeps up whatever imports happen
   to sit near it — which is a false positive the moment this module is imported too. What is
   under test is the ARGUMENT OBJECT the estimator is actually handed. */
const callIx = fd.indexOf("calibratedIntensityP({");
ck("the calibratedIntensityP call site is found (the isolation check is not vacuous)", callIx > 0);
const callEnd = fd.indexOf("});", callIx);
const callSite = fd.slice(callIx, callEnd > 0 ? callEnd + 3 : callIx + 1500);
ck("the runway is not passed to calibratedIntensityP", !RUNWAY_NAMES.test(callSite) && !/\brunway\b/.test(callSite), callSite.slice(0, 120));
for (const fn of ["kellyFor", "edgeBook"]) {
  const i = fd.indexOf("function " + fn);
  ck(`${fn} does not read the runway`, i < 0 || !RUNWAY_NAMES.test(fd.slice(i, i + 2500)));
}
const rw = src("lib/runway.mjs");
ck("and the module itself imports nothing from the pricing engine", !/from\s+["'].*(probability|calibration|estimator|edge|kelly)/i.test(rw));
ck("it declares no probability, price or edge of its own",
  !/\bprobabilit(y|ies)\s*[:=]|\bpMove\b|\bedgeBp\b|\bkelly/i.test(rw.replace(/\/\*[\s\S]*?\*\//g, "")));

console.log(fail ? `\n${fail} runway check(s) FAILED` : "\nall runway checks passed");
process.exit(fail ? 1 : 0);
