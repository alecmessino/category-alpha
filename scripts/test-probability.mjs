#!/usr/bin/env node
/* Tests for the probability engine.
 *
 * This is the one piece of arithmetic on the board that decides what a contract is
 * worth, so most of what follows asserts the RULES rather than the numbers — the rules
 * are what stop a plausible-looking calibration from quietly manufacturing an edge:
 *
 *   - The raw official-forecast estimate is never overwritten and always inside the
 *     published band. A calibration that can reach somewhere the plain arithmetic cannot
 *     is not a calibration.
 *   - The combined answer is NEVER SHARPER than its sharpest single input. The sources
 *     are correlated — the official forecast is a judgement over the same aids — and
 *     combining them as independent draws would shrink the band on evidence that does
 *     not exist.
 *   - Disagreement can only ever widen. It is the only measured term in the engine.
 *   - ASCAT never moves the mean, only the width, only when no aircraft is in the storm,
 *     and only below the wind speed where the retrieval saturates.
 *   - SHIPS does not score until it is claimed, and is published either way.
 *   - Staleness caps evidence quality no matter what else arrived.
 *
 * Run: node scripts/test-probability.mjs
 */
import { calibratedIntensityP, evidenceQuality, DVORAK_SIGMA_KT, SFMR_SIGMA_KT,
         ASCAT_SIGMA_KT, ASCAT_SATURATION_KT, MAX_RECON_CORRECTION_KT } from "./lib/probability.mjs";
import { reachesHurricaneP, INTENSITY_MAE } from "./fetch-data.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = Math.abs(g - w) <= tol; if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${g} want=${w}±${tol}`)); };

const NOW = Date.UTC(2026, 7, 14, 22, 0);
const OPTS = { nowMs: NOW, maeTable: INTENSITY_MAE, thresholdKt: 62.5, reportedKt: 65 };
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();

/* The official estimator's REAL output, not a hand-written stand-in.
 *
 * The first version of this fixture was written by hand and claimed a probability its own
 * peak intensity did not imply, which made the engine look wrong when it was right. That
 * is worth more than a corrected constant: a hand-made fixture cannot check that the two
 * pieces of arithmetic agree, and them agreeing is the single most important property
 * here. With no feeds ingested the engine must reproduce the advisory estimator exactly,
 * because a storm with no deck and no aircraft has to price the way it always did. */
const PTS = [{ hr: 0, kt: 50, initial: true }, { hr: 24, kt: 55 }, { hr: 48, kt: 60 },
             { hr: 72, kt: 65 }, { hr: 120, kt: 70 }];
const OFFICIAL = reachesHurricaneP(PTS, null, null);
const consensus = (peakKt, spreadKt, ageMin = 30) => ({
  cycle: "2026081418", cycleIso: iso(ageMin), peakKt, peakHr: 120, spreadKt, n: 3,
  members: [{ tech: "HCCA", peakKt }, { tech: "IVCN", peakKt }, { tech: "GDMI", peakKt }],
});
const recon = (kt, mslp, ageMin = 60) => ({ ok: true, stormId: "CP012026", fixIso: iso(ageMin),
  mslp, extrapolated: false, intensityKt: kt, intensitySource: "SFMR surface wind",
  surfaceKt: kt, flightLevelKt: kt + 6, mission: { aircraft: "AF305" }, obNumber: 4 });
const ascat = (kt, ageMin = 90) => ({ iso: iso(ageMin), kt, type: "ASCT", instrument: "ASCT", radii: {} });

console.log("\n[1] with nothing ingested, the answer is exactly what it always was");
const bare = calibratedIntensityP({ official: OFFICIAL, currentKt: 50 }, OPTS);
eq("it still answers", bare.ok, true);
near("and it reproduces the advisory estimator exactly", bare.p, OFFICIAL.p, 0.001);
eq("nothing but the official forecast was used", bare.used, { official: true, consensus: false, recon: false, ascat: false, ships: false });
/* The regression that matters most: a storm with no deck and no aircraft must price
   identically to before this build existed. */
eq("the raw estimate is carried unchanged", bare.pRaw, OFFICIAL.p);

console.log("\n[2] the guidance consensus moves the number — that is the head start");
const up = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, consensus: consensus(95, 8) }, OPTS);
ck("a consensus above the official forecast raises it", up.p > bare.p, `${bare.p} → ${up.p}`);
const down = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, consensus: consensus(45, 8) }, OPTS);
ck("and one below it lowers it", down.p < bare.p, `${bare.p} → ${down.p}`);
ck("the combined peak sits between the two sources", up.meanKt > 70 && up.meanKt < 95, String(up.meanKt));
/* A stale deck describes a storm that has moved on. It is refused, and the refusal is
   published rather than silently degrading the answer. */
const stale = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, consensus: consensus(95, 8, 600) }, OPTS);
eq("a stale deck is not used", stale.used.consensus, false);
ck("and the refusal is stated", stale.notes.some((n) => /past the .* line/.test(n)), stale.notes.join("; "));

console.log("\n[3] disagreement can only ever widen");
const tight = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, consensus: consensus(95, 2) }, OPTS);
const wide = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, consensus: consensus(95, 25) }, OPTS);
ck("wider aid disagreement makes a wider answer", wide.sigmaKt > tight.sigmaKt, `${tight.sigmaKt} vs ${wide.sigmaKt}`);
/* THE RULE THAT PREVENTS A MANUFACTURED EDGE. Two correlated sources must not produce a
   sharper answer than the sharper of them; the official forecast IS a judgement over
   these aids, so treating them as independent looks would be inventing a second look. */
const sharpest = Math.min(OFFICIAL.sigma, tight.sources.find((s) => s.id === "consensus").sigmaKt);
ck("and the combination is never sharper than its sharpest input",
   tight.sigmaKt >= sharpest - 0.05, `${tight.sigmaKt} vs ${sharpest}`);
ck("agreement between sources leaves a narrower band than disagreement",
   calibratedIntensityP({ official: OFFICIAL, currentKt: 50, consensus: consensus(70, 2) }, OPTS).sigmaKt <= wide.sigmaKt);

console.log("\n[4] the aircraft corrects the initial condition every forecast rests on");
const strongerRecon = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, recon: recon(65, 985) }, OPTS);
eq("the correction is the measured difference, not a weight", strongerRecon.reconDeltaKt, 15);
ck("a storm measured stronger than the advisory raises the answer", strongerRecon.p > bare.p, `${bare.p} → ${strongerRecon.p}`);
ck("and every forecast peak moves with it", strongerRecon.meanKt > 70, String(strongerRecon.meanKt));
const weakerRecon = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, recon: recon(40, 1002) }, OPTS);
ck("measured weaker lowers it", weakerRecon.p < bare.p, `${bare.p} → ${weakerRecon.p}`);
/* The one guard that exists to stop a bad read reaching a price. A 60 kt disagreement
   between an aircraft and an advisory is far likelier to be a mis-parse or the wrong
   storm than a real analysis error of that size. */
const absurd = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, recon: recon(50 + MAX_RECON_CORRECTION_KT + 10, 940) }, OPTS);
eq("an impossible correction is refused", absurd.used.recon, false);
ck("and named as a sanity limit", absurd.notes.some((n) => /sanity limit/.test(n)), absurd.notes.join("; "));
const oldFix = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, recon: recon(65, 985, 400) }, OPTS);
eq("a fix older than the freshness line is refused", oldFix.used.recon, false);

console.log("\n[5] the scatterometer tightens the band and NOTHING else");
const noPass = calibratedIntensityP({ official: OFFICIAL, currentKt: 60 }, OPTS);
const withPass = calibratedIntensityP({ official: OFFICIAL, currentKt: 60, ascat: ascat(40) }, OPTS);
eq("with no aircraft, a valid pass is used", withPass.used.ascat, true);
eq("the current-intensity width tightens", [noPass.sigmaInitKt, withPass.sigmaInitKt], [DVORAK_SIGMA_KT, ASCAT_SIGMA_KT]);
/* The mean must be untouched. This is the assertion that keeps ASCAT a band input. */
eq("and the combined peak does not move at all", withPass.meanKt, noPass.meanKt);
/* Above saturation the retrieval stops being trustworthy, so a high reading is not
   evidence of a low uncertainty — it is the opposite. */
const saturated = calibratedIntensityP({ official: OFFICIAL, currentKt: 60, ascat: ascat(ASCAT_SATURATION_KT + 10) }, OPTS);
eq("a saturated pass tightens nothing", saturated.used.ascat, false);
ck("and says why", saturated.notes.some((n) => /saturates/.test(n)), saturated.notes.join("; "));
const oldPass = calibratedIntensityP({ official: OFFICIAL, currentKt: 60, ascat: ascat(40, 900) }, OPTS);
eq("a pass from a previous orbit tightens nothing", oldPass.used.ascat, false);
/* "Only when recon is absent" — an aircraft is the better instrument and outranks it. */
const both = calibratedIntensityP({ official: OFFICIAL, currentKt: 60, recon: recon(62, 990), ascat: ascat(40) }, OPTS);
eq("with an aircraft in the storm the pass is not used", both.used.ascat, false);
eq("and the width comes from the aircraft", both.sigmaInitKt, SFMR_SIGMA_KT);

console.log("\n[6] SHIPS is published always and scored only when claimed");
const floor = { dvKt: 20, hours: 12, p: 0.92, climoP: 0.06, ratioToClimo: 1.5, basis: "a 20 kt gain clears the gap" };
const unscored = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, ships: { ok: true }, riFloor: floor, shipsScoring: false }, OPTS);
ck("the floor is computed and published", unscored.pWithRi >= 0.92, String(unscored.pWithRi));
ck("but the published probability is untouched by it", Math.abs(unscored.p - bare.p) < 0.001, `${bare.p} vs ${unscored.p}`);
eq("and it is not counted as used", unscored.used.ships, false);
ck("the refusal is stated rather than silent", unscored.notes.some((n) => /NOT scored/.test(n)), unscored.notes.join("; "));
const scored = calibratedIntensityP({ official: OFFICIAL, currentKt: 50, ships: { ok: true }, riFloor: floor, shipsScoring: true }, OPTS);
ck("under a claim it becomes a floor on the answer", scored.p >= 0.92, String(scored.p));
ck("and the claim is recorded on the row", scored.notes.some((n) => /operator claim/.test(n)), scored.notes.join("; "));
/* An unscored layer must not vote in the agreement test that earns a TAKE. */
const riLayer = unscored.layers.find((l) => l.id === "ships-ri");
eq("the unscored layer publishes no probability", riLayer.p, null);
eq("and is marked unavailable", riLayer.unavailable, true);

console.log("\n[7] the band always contains the raw estimate");
for (const [name, r] of [["bare", bare], ["consensus up", up], ["consensus down", down],
                         ["recon up", strongerRecon], ["recon down", weakerRecon], ["scored", scored]]) {
  ck("raw sits inside the published band — " + name,
     r.pLow <= OFFICIAL.p + 1e-9 && r.pHigh >= OFFICIAL.p - 1e-9, `${r.pLow} .. ${r.pHigh}`);
  ck("and so does the calibrated answer — " + name,
     r.pLow <= r.p + 1e-9 && r.pHigh >= r.p - 1e-9, `${r.p} in ${r.pLow}..${r.pHigh}`);
}

console.log("\n[8] a storm already at the threshold is answered by observation");
const already = calibratedIntensityP({ official: OFFICIAL, currentKt: 75, recon: recon(78, 975) }, OPTS);
ck("the current intensity drives it", already.drivenBy === "current intensity", already.drivenBy);
ck("and it is high", already.p > 0.9, String(already.p));
/* Reaching the threshold now implies reaching it at some point, so the answer can never
   be lower than the current-intensity probability. */
ck("the answer is never below the current-intensity probability", already.p >= already.pNow - 1e-9);

console.log("\n[9] refusals");
eq("no official estimate, no calibration", calibratedIntensityP({ currentKt: 50 }, OPTS).ok, false);
eq("nor with a null probability", calibratedIntensityP({ official: { p: null }, currentKt: 50 }, OPTS).ok, false);
ck("and it says the engine adds to that number rather than replacing it",
   /does not replace/.test(calibratedIntensityP({ currentKt: 50 }, OPTS).note));

console.log("\n[10] evidence quality — HIGH means measured, and staleness outranks it");
eq("an aircraft earns the top tier", evidenceQuality(strongerRecon, {}).tier, "HIGH");
eq("a deck alone does not", evidenceQuality(up, {}).tier, "MEDIUM");
eq("neither earns nothing", evidenceQuality(bare, {}).tier, "LOW");
/* THE HARD RULE. A measured initial condition under a superseded advisory describes a
   storm that no longer exists, and no amount of arriving evidence promotes it. */
const capped = evidenceQuality(strongerRecon, { advisoryLagMin: 200, staleAtMin: 180 });
eq("a stale advisory caps the tier regardless of what arrived", capped.tier, "LOW");
ck("and the cap leads the reasons", /capped regardless/.test(capped.reasons[0]), capped.reasons[0]);
eq("inside the line the tier stands", evidenceQuality(strongerRecon, { advisoryLagMin: 100, staleAtMin: 180 }).tier, "HIGH");
eq("no estimate at all is LOW", evidenceQuality(null, {}).tier, "LOW");

console.log(fail ? `\n${fail} FAILED\n` : "\nall probability-engine checks passed\n");
process.exit(fail ? 1 : 0);
