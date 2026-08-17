#!/usr/bin/env node
/* THE RECON CORRECTION, and the conflict that no longer exists.
 *
 * This file used to test an arbitration: a guidance deck and an aircraft both moved the
 * estimate, they answer different questions, and averaging them would have been a category
 * error that ran cleanly and meant nothing. The rule was that they are never averaged.
 *
 * THE DECK'S MEAN HAS SINCE BEEN MEASURED AND REMOVED. Four Atlantic seasons of replay:
 * it moved 531 of 940 forecasts by a median 3.6 points and bought 0.4% Brier, losing in
 * three seasons of four. So there is now ONE source, and the arbitration is a structural
 * fact rather than a policy anyone has to enforce.
 *
 * WHAT REMAINS, and it is the part that was always doing the work:
 *
 *   The aircraft measures the initial intensity every forecast is anchored on, and the
 *   measured difference is applied to the whole forecast curve — undamped, no weight.
 *
 *   It applies ONLY while the forecaster had not yet seen the fix. Once an advisory
 *   postdates it, their number IS their reading of it, and shifting again counts one
 *   measurement twice. Caught live on Lala; see [6b].
 *
 *   The deck still sizes the uncertainty band. How much the guidance disagrees is real
 *   information about how uncertain the forecast is, even when where it points is not.
 *
 *   The answer is the LARGER of the corrected forecast peak clearing the strike and the
 *   measured current intensity already clearing it.
 *
 * Two halves below: the engine does this, and the claim SAYS the engine does this. The
 * second half matters as much as the first — a rule nobody can read is a rule that gets
 * quietly changed, and the removal above is exactly that kind of change.
 *
 * Run: node scripts/test-conflict.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { calibratedIntensityP, evidenceQuality, SFMR_SIGMA_KT, MAX_RECON_CORRECTION_KT } from "./lib/probability.mjs";
import { reachesHurricaneP, INTENSITY_MAE } from "./fetch-data.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };
const near = (n, g, w, tol) => { const ok = Math.abs(g - w) <= tol; if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${g} want=${w}±${tol}`)); };

const NOW = Date.UTC(2026, 7, 14, 22, 0);
const OPTS = { nowMs: NOW, maeTable: INTENSITY_MAE, thresholdKt: 62.5, reportedKt: 65 };
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();

/* A real official-forecast estimate, from the real estimator: 50 kt now, forecast to
   peak at 70 kt in five days. */
const ADVISORY_KT = 50;
const PTS = [{ hr: 0, kt: ADVISORY_KT, initial: true }, { hr: 24, kt: 55 }, { hr: 48, kt: 60 },
             { hr: 72, kt: 65 }, { hr: 120, kt: 70 }];
const OFFICIAL = reachesHurricaneP(PTS, null, null);

/* A BULLISH deck: it forecasts a far stronger storm than the advisory does. */
const deck = (peakKt, spreadKt = 8, ageMin = 30) => ({
  cycle: "2026081418", cycleIso: iso(ageMin), peakKt, peakHr: 120, spreadKt, n: 3,
  members: [{ tech: "HCCA", peakKt: peakKt + spreadKt }, { tech: "IVCN", peakKt: peakKt },
            { tech: "GDMI", peakKt: peakKt - spreadKt }],
});
/* An aircraft fix, expressed as what it MEASURED — the conflict is the gap between that
   and what the advisory carries. */
const fix = (measuredKt, ageMin = 60) => ({ ok: true, stormId: "CP012026", fixIso: iso(ageMin),
  mslp: 990, extrapolated: false, intensityKt: measuredKt, intensitySource: "SFMR surface wind",
  surfaceKt: measuredKt, flightLevelKt: measuredKt + 6, mission: { aircraft: "AF305" }, obNumber: 4 });

/* Fixtures default to an advisory issued BEFORE the fix, which is the head-start case the
   correction exists for. The already-priced case passes its own advisoryIso. */
const DEFAULT_ADV_ISO = iso(240);
const run = (o) => calibratedIntensityP(
  Object.assign({ official: OFFICIAL, currentKt: ADVISORY_KT, advisoryIso: DEFAULT_ADV_ISO }, o), OPTS);
const peakOf = (r, id) => (r.sources.find((s) => s.id === id) || {}).peakKt;

console.log("\n[1] the conflict CANNOT ARISE — the deck is not in the blend");
/* This rule used to arbitrate between a deck and an aircraft because both moved the
   estimate. The deck's mean was then measured over four Atlantic seasons at no skill and
   removed, so the arbitration is now a structural fact instead of a policy: there is one
   source, and the fix corrects it. These assertions guard that structure. */
const conflict = run({ consensus: deck(95), recon: fix(ADVISORY_KT - 10) });
const deckOnly = run({ consensus: deck(95) });
eq("only the official forecast is in the blend", conflict.sources.map((s) => s.id), ["official"]);
eq("the deck is not recorded as used", conflict.used.consensus, false);
eq("its spread is", conflict.used.consensusSpread, true);
/* A 95 kt deck and a 45 kt deck are 50 kt apart and must price identically. */
near("a 95 kt deck and a 45 kt deck give the same answer",
     deckOnly.p, run({ consensus: deck(45) }).p, 1e-12);
/* THE IDENTITY THAT DEFINES THE REMAINING RULE. The correction is a translation of the
   forecast curve — no damping, no weight. */
eq("the measured difference is applied undamped", conflict.reconDeltaKt, -10);
near("the official peak shifts by exactly that much", peakOf(conflict, "official"), peakOf(deckOnly, "official") - 10, 1e-9);
near("and so does the combined mean", conflict.meanKt, deckOnly.meanKt - 10, 0.05);

console.log("\n[2] the fix acts on the official forecast alone");
const fixOnly = run({ recon: fix(ADVISORY_KT - 10) });
/* With the deck's mean gone, a deck present or absent changes only the band — so the two
   differ in width and not in centre. */
near("deck present or absent, the mean is the same", conflict.meanKt, fixOnly.meanKt, 1e-9);
ck("the deck's disagreement still widens the band", conflict.sigmaKt > fixOnly.sigmaKt,
   `${fixOnly.sigmaKt} → ${conflict.sigmaKt}`);
ck("a weakening fix lowers the estimate", conflict.p < deckOnly.p, `${deckOnly.p} → ${conflict.p}`);

console.log("\n[3] the mirror case behaves identically");
/* An aircraft finding the storm STRONGER. The rule has no preferred direction; if it did,
   it would be a bias rather than a correction. */
const mirror = run({ consensus: deck(45), recon: fix(ADVISORY_KT + 10) });
const bearOnly = run({ consensus: deck(45) });
eq("the measured difference is applied undamped the other way", mirror.reconDeltaKt, 10);
near("the peak shifts up by exactly that much", mirror.meanKt, bearOnly.meanKt + 10, 0.05);
ck("a strengthening fix lifts the estimate", mirror.p > bearOnly.p, `${bearOnly.p} → ${mirror.p}`);

console.log("\n[4] a correction MOVES the estimate; it never sharpens it");
/* The single most abusable thing a conflict rule could do is treat disagreement as
   information and narrow the band. Both sources shift by the same amount, so their
   disagreement is unchanged — and the published width with it. */
near("the measured disagreement between sources is untouched", conflict.tauKt, deckOnly.tauKt, 1e-9);
near("and so is the published width", conflict.sigmaKt, deckOnly.sigmaKt, 1e-9);
ck("only the current-intensity width tightens, because that is what was measured",
   conflict.sigmaInitKt < deckOnly.sigmaInitKt, `${deckOnly.sigmaInitKt} → ${conflict.sigmaInitKt}`);

console.log("\n[5] the answer is the larger of the two questions");
/* An aircraft that finds the storm already at hurricane strength settles the question by
   observation, whatever a bearish deck forecasts for the peak. */
const alreadyThere = run({ consensus: deck(45), recon: fix(72) });
eq("a measurement past the strike drives the answer", alreadyThere.drivenBy, "current intensity");
ck("and it is high despite a bearish deck", alreadyThere.p > 0.9, String(alreadyThere.p));
ck("the answer is never below either term", alreadyThere.p >= alreadyThere.pNow - 1e-9 && alreadyThere.p >= alreadyThere.pPeak - 1e-9);
/* Below the strike the forecast peak governs, because reaching it later is the only way
   the contract resolves. */
eq("otherwise the corrected forecast peak drives it", conflict.drivenBy, "forecast peak");

console.log("\n[6] the refusals still govern the conflict");
/* A fix too old to describe the present storm cannot correct anything, so the deck is
   left exactly as it was — the conflict simply does not arise. */
const staleFix = run({ consensus: deck(95), recon: fix(ADVISORY_KT - 10, 400) });
eq("a stale fix corrects nothing", staleFix.used.recon, false);
near("and the deck is untouched", staleFix.meanKt, deckOnly.meanKt, 1e-9);
/* A difference too large to be credible is a mis-parse or the wrong storm, not a 50 kt
   analysis error, and it must not reach a price through this rule. */
const absurd = run({ consensus: deck(95), recon: fix(ADVISORY_KT + MAX_RECON_CORRECTION_KT + 10) });
eq("an incredible difference corrects nothing", absurd.used.recon, false);
near("and the deck is untouched there too", absurd.meanKt, deckOnly.meanKt, 1e-9);
ck("with the reason published", absurd.notes.some((n) => /sanity limit/.test(n)), absurd.notes.join("; "));
/* A stale deck leaves the fix correcting the official forecast alone — the other half of
   the same rule. */
const staleDeck = run({ consensus: deck(95, 8, 600), recon: fix(ADVISORY_KT - 10) });
eq("a stale deck drops out", staleDeck.used.consensus, false);
eq("but the fix still corrects what is left", staleDeck.used.recon, true);
near("shifting the official forecast by the measured difference", peakOf(staleDeck, "official"), peakOf(deckOnly, "official") - 10, 1e-9);

console.log("\n[6b] a fix the forecaster has already read cannot be applied a second time");
/* CAUGHT LIVE, on Lala, and it cost real accuracy before it was found. An aircraft
   measured 48 kt at 21:56Z; NHC issued Intermediate Advisory 10A at 00:00Z carrying
   55 kt; the engine then subtracted 7 kt from a forecast written by someone who had
   already read that 48 kt.
   The entire justification for shifting a published forecast is that the measurement
   arrived AFTER it was written. Once the advisory postdates the fix, the forecaster's
   number IS their reading of it — and shifting again counts one measurement twice, in
   whichever direction they exercised judgement the board does not have. */
const ADV_ISO = "2026-08-15T00:00:00.000Z";
const seen = run({ consensus: deck(95), recon: fix(ADVISORY_KT - 7, 120),
                   advisoryIso: ADV_ISO, advisoryLabel: "10A" });
eq("the mean is not shifted", seen.reconDeltaKt, null);
eq("and it is marked as already priced in", seen.reconAlreadyPriced, true);
near("so the forecast peak is exactly the deck's own", seen.meanKt, deckOnly.meanKt, 1e-9);
ck("the reason names the advisory and the gap", /issued \d+ min AFTER this fix/.test(seen.notes.join(" ")), seen.notes.join("; "));
ck("and says it would be counted twice", /count it twice/.test(seen.notes.join(" ")), seen.notes.join("; "));
/* What it must STILL do: the storm's intensity really was measured, so the band tightens
   and the evidence tier stands. Only the mean shift is withheld. */
eq("the band still tightens on a measured intensity", seen.sigmaInitKt, SFMR_SIGMA_KT);
eq("and the top evidence tier still stands", evidenceQuality(seen, {}).tier, "HIGH");
ck("with the reason saying the advisory already has it",
   /already incorporated it/.test(evidenceQuality(seen, {}).reasons.join(" ")), evidenceQuality(seen, {}).reasons.join(" | "));
/* A fix that arrives AFTER the advisory is the head start, and it must still work. */
const fresh = run({ consensus: deck(95), recon: fix(ADVISORY_KT - 7, 5),
                    advisoryIso: "2026-08-14T21:00:00.000Z", advisoryLabel: "10" });
eq("a fix newer than the advisory still corrects it", fresh.reconDeltaKt, -7);
eq("and is not marked already priced", fresh.reconAlreadyPriced, false);
/* Unknown advisory time cannot establish that the fix is news. Refusing costs a head
   start that may have been real; applying it risks double-counting into a price. Those
   are not symmetric. */
const unknownAdv = run({ consensus: deck(95), recon: fix(ADVISORY_KT - 7, 60), advisoryIso: null });
eq("an unknown advisory time refuses the correction", unknownAdv.used.recon, false);
ck("and says why", /issue time is unknown/.test(unknownAdv.notes.join(" ")), unknownAdv.notes.join("; "));

console.log("\n[7] a fix that CONFIRMS the advisory changes the estimate not at all");
/* The commonest real outcome, and the one a rule with a hidden weight in it would get
   wrong: an aircraft that agrees with the advisory must leave the number alone. */
const confirms = run({ consensus: deck(95), recon: fix(ADVISORY_KT) });
eq("the difference is zero", confirms.reconDeltaKt, 0);
near("and the combined peak is unmoved", confirms.meanKt, deckOnly.meanKt, 1e-9);
ck("but the evidence is still better than it was", confirms.sigmaInitKt < deckOnly.sigmaInitKt);
eq("and the fix is recorded as used", confirms.used.recon, true);

/* ---- the claim that owns the rule -------------------------------------------------
   Loaded and evaluated exactly as the page loads it, against fixtures shaped like the
   snapshot. A rule this specific must be readable on the board, not only true in the
   arithmetic — otherwise the next person to touch it has nothing to check against. */
function evalClaims(storms) {
  const MT = { storms, _feeds: { recon: { ok: true, count: 1 }, atcf: { ok: true } },
               _generatedAt: new Date(NOW).toISOString(), FRAMES: 1, evidence: [], contracts: [] };
  /* `MT` is a bare global on the page because `window` IS the global object there, and
     the registry reads it that way. The sandbox has to reproduce both bindings or every
     claim throws and the registry's own try/catch turns that into a uniform "CLAIM
     ERROR" — which is exactly as informative as it sounds. */
  const window = { MT };
  const sandbox = { MT, window, console, Math, JSON, Date, Number, String, Object, Array, Set, Map, isFinite, parseFloat, RegExp };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(__dir, "../docs/app/claims.js"), "utf8"), sandbox);
  return sandbox.window.MTC;
}
const stormWith = (name, cal, consensus, recon) => ({ [name]: { id: name, name, hurricanePCal: cal, consensus, recon } });

console.log("\n[8] the claim states the rule, and states it from the real numbers");
const MTC = evalClaims(stormWith("Lala", conflict, deck(95), fix(ADVISORY_KT - 10)));
const c = MTC.claim("model.conflict");
eq("it is registered and owned by the feed the conflict needs", c.owner, "recon");
ck("and what the aircraft measured, against what the advisory carried",
   /aircraft measured 40 kt against the advisory's 50 kt/.test(c.text), c.text);
ck("it states the size and direction of the correction", /10 kt lower/.test(c.text), c.text);
ck("it names which term drove the answer", /driven by the forecast peak/i.test(c.text), c.text);
/* THE RULE ITSELF, in words, on the board — and it is now a smaller rule, because the
   thing it used to arbitrate was measured and removed. */
ck("it says the deck does not move the estimate", /deck does not move the estimate/i.test(c.text), c.text);
ck("it says on what evidence", /four Atlantic seasons.*no skill/i.test(c.text), c.text);
ck("it says what the deck still does", /sizes the uncertainty band/i.test(c.text), c.text);
ck("and it keeps the recon precondition", /had not yet seen it/i.test(c.text), c.text);
/* The old wording promised an arbitration that no longer exists. If it comes back, the
   rule it describes has come back with it. */
ck("it no longer promises an averaging rule it does not have",
   !/never averaged|no tunable weight|veto/i.test(c.text), c.text);

console.log("\n[9] the claim degrades honestly when one side is missing");
const noFix = evalClaims(stormWith("Lala", deckOnly, deck(95), null)).claim("model.conflict");
ck("with no aircraft it says the forecast stands alone", /official forecast stands alone/.test(noFix.text), noFix.text);
ck("and credits the deck with the band, which is all it does now",
   /disagreement sizing the band/.test(noFix.text), noFix.text);
const noDeck = evalClaims(stormWith("Lala", staleDeck, null, fix(ADVISORY_KT - 10))).claim("model.conflict");
ck("with a stale deck the fix still corrects the forecast",
   /aircraft measured .* kt against the advisory/.test(noDeck.text), noDeck.text);
const refused = evalClaims(stormWith("Lala", staleFix, deck(95), fix(ADVISORY_KT - 10, 400))).claim("model.conflict");
/* A fix that exists but was refused must not read as a fix that never arrived. */
ck("a refused fix is distinguished from an absent one",
   /a fix exists but was not applied/.test(refused.text), refused.text);
const quiet = evalClaims({}).claim("model.conflict");
ck("with no storms it still states the rule", /deck does not move the estimate/i.test(quiet.text), quiet.text);
ck("and says nothing is being calibrated", /No active system is being calibrated/.test(quiet.text), quiet.text);
const confirmsClaim = evalClaims(stormWith("Lala", confirms, deck(95), fix(ADVISORY_KT))).claim("model.conflict");
ck("a confirming fix is described as confirming, not as a correction of zero",
   /confirms the advisory/.test(confirmsClaim.text), confirmsClaim.text);

console.log("\n[10] the rule is reachable from the board, not just registered");
/* A claim nobody renders is a comment with extra steps. The console's drawer composes it
   in rather than restating it, so the two can never drift into different accounts of the
   same arithmetic. */
const drawer = MTC.claim("note.intel");
ck("the storm console's drawer carries it",
   (drawer.body || []).some((l) => /deck does not move the estimate/i.test(l)), JSON.stringify((drawer.body || []).slice(-3)));
ck("and the drawer still carries the engine's own basis",
   (drawer.body || []).some((l) => /combined \d+ intensity estimate/.test(l)), JSON.stringify((drawer.body || []).slice(0, 2)));

console.log(fail ? `\n${fail} FAILED\n` : "\nall conflict-rule checks passed\n");
process.exit(fail ? 1 : 0);
