#!/usr/bin/env node
/* THE CONFLICT RULE — what happens when the guidance deck and the aircraft disagree.
 *
 * This was the last piece of the engine implemented in code and owned by nobody: a rule
 * that decides a price, described only in a comment, where no feed could contradict it
 * and no reader could check it. That is the exact shape of the three drifts the claim
 * registry exists to prevent, so the rule now has a claim, and the claim has this.
 *
 * THE RULE:
 *
 *   A consensus peak and an aircraft fix are NEVER AVERAGED, because they do not answer
 *   the same question. The deck forecasts what the storm WILL PEAK AT; the aircraft
 *   measures what it IS NOW. Averaging them would be a category error that runs cleanly
 *   and means nothing.
 *
 *   The apparent conflict is resolved BY CONSTRUCTION rather than by a weight: every
 *   forecast is anchored on an initial intensity, the aircraft has just measured that
 *   initial intensity, and the measured difference is applied to the whole curve.
 *
 *   NEITHER CAN VETO THE OTHER — the deck keeps its weight, the fix keeps its full
 *   undamped difference, and there is no tunable parameter between them.
 *
 *   The answer is the LARGER of the corrected forecast peak clearing the strike and the
 *   measured current intensity already clearing it.
 *
 * Two halves below: the engine does this, and the claim SAYS the engine does this. The
 * second half matters as much as the first — a rule nobody can read is a rule that gets
 * quietly changed.
 *
 * Run: node scripts/test-conflict.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { calibratedIntensityP, MAX_RECON_CORRECTION_KT } from "./lib/probability.mjs";
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

const run = (o) => calibratedIntensityP(Object.assign({ official: OFFICIAL, currentKt: ADVISORY_KT }, o), OPTS);
const peakOf = (r, id) => (r.sources.find((s) => s.id === id) || {}).peakKt;

console.log("\n[1] the two are not averaged — they are not answering the same question");
/* A bullish deck (95 kt peak) and an aircraft finding the storm 10 kt WEAKER than the
   advisory carries. If these were averaged as two estimates of one quantity the answer
   would land somewhere between 95 and 40; it must not. */
const conflict = run({ consensus: deck(95), recon: fix(ADVISORY_KT - 10) });
const deckOnly = run({ consensus: deck(95) });
ck("the deck's peak still enters the blend near its own value",
   peakOf(conflict, "consensus") > 80, String(peakOf(conflict, "consensus")));
ck("and nowhere near the measured current intensity",
   peakOf(conflict, "consensus") > 60, String(peakOf(conflict, "consensus")));
/* THE IDENTITY THAT DEFINES THE RULE. The correction is a translation of the whole
   curve, so every source moves by exactly the measured difference — no damping, no
   weight, no blend. */
eq("the measured difference is applied undamped", conflict.reconDeltaKt, -10);
near("the deck's peak shifts by exactly that much", peakOf(conflict, "consensus"), peakOf(deckOnly, "consensus") - 10, 1e-9);
near("and so does the official peak", peakOf(conflict, "official"), peakOf(deckOnly, "official") - 10, 1e-9);
near("so the combined peak shifts by exactly that much too", conflict.meanKt, deckOnly.meanKt - 10, 0.05);

console.log("\n[2] neither can veto the other");
/* The fix does not suppress the deck: a bullish deck under a weakening fix still prices
   far above the advisory-only estimate. */
const fixOnly = run({ recon: fix(ADVISORY_KT - 10) });
ck("a bullish deck survives a weakening fix", conflict.p > fixOnly.p, `${fixOnly.p} → ${conflict.p}`);
/* And the deck does not suppress the fix: the correction is applied in full even when
   the deck disagrees with its direction. */
ck("a weakening fix still pulls a bullish deck down", conflict.p < deckOnly.p, `${deckOnly.p} → ${conflict.p}`);
eq("both sources are in the blend", conflict.sources.map((s) => s.id).sort(), ["consensus", "official"]);
eq("and both are recorded as used", [conflict.used.consensus, conflict.used.recon], [true, true]);

console.log("\n[3] the mirror case behaves identically");
/* A bearish deck and an aircraft finding the storm STRONGER. The rule has no preferred
   direction; if it did, it would be a bias rather than a correction. */
const mirror = run({ consensus: deck(45), recon: fix(ADVISORY_KT + 10) });
const bearOnly = run({ consensus: deck(45) });
eq("the measured difference is applied undamped the other way", mirror.reconDeltaKt, 10);
near("the combined peak shifts up by exactly that much", mirror.meanKt, bearOnly.meanKt + 10, 0.05);
ck("a strengthening fix lifts a bearish deck", mirror.p > bearOnly.p, `${bearOnly.p} → ${mirror.p}`);

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
ck("it names the deck's own peak, uncorrected", /deck peaks at 95 kt/.test(c.text), c.text);
ck("and what the aircraft measured, against what the advisory carried",
   /aircraft measured 40 kt against the advisory's 50 kt/.test(c.text), c.text);
ck("it states the size and direction of the correction", /10 kt lower/.test(c.text), c.text);
/* The corrected value the deck actually entered at — raw and calibrated, side by side,
   for the same reason every other pair on this board is. */
ck("and where the deck entered the blend after it", /enters at 85 kt/.test(c.text), c.text);
ck("it names which term drove the answer", /driven by the forecast peak/i.test(c.text), c.text);
/* THE RULE ITSELF, in words, on the board. */
ck("it says they are never averaged", /never averaged/i.test(c.text), c.text);
ck("it says why — they answer different questions",
   /forecasts the peak.*measures the present/i.test(c.text), c.text);
ck("it says neither can veto the other", /Neither can veto/i.test(c.text), c.text);
ck("it says there is no tunable weight", /no tunable weight/i.test(c.text), c.text);
ck("and it says a correction shifts without narrowing", /without narrowing/i.test(c.text), c.text);

console.log("\n[9] the claim degrades honestly when one side is missing");
const noFix = evalClaims(stormWith("Lala", deckOnly, deck(95), null)).claim("model.conflict");
ck("with no aircraft it says so", /no aircraft fix to correct it/.test(noFix.text), noFix.text);
const noDeck = evalClaims(stormWith("Lala", staleDeck, null, fix(ADVISORY_KT - 10))).claim("model.conflict");
ck("with no usable deck it says the fix corrects the official forecast alone",
   /official forecast alone/.test(noDeck.text), noDeck.text);
const refused = evalClaims(stormWith("Lala", staleFix, deck(95), fix(ADVISORY_KT - 10, 400))).claim("model.conflict");
/* A fix that exists but was refused must not read as a fix that never arrived. */
ck("a refused fix is distinguished from an absent one",
   /a fix exists but was not applied/.test(refused.text), refused.text);
const quiet = evalClaims({}).claim("model.conflict");
ck("with no storms it still states the rule", /never averaged/i.test(quiet.text), quiet.text);
ck("and says nothing is in conflict", /nothing is in conflict/.test(quiet.text), quiet.text);
const confirmsClaim = evalClaims(stormWith("Lala", confirms, deck(95), fix(ADVISORY_KT))).claim("model.conflict");
ck("a confirming fix is described as confirming, not as a correction of zero",
   /confirms the advisory/.test(confirmsClaim.text), confirmsClaim.text);

console.log("\n[10] the rule is reachable from the board, not just registered");
/* A claim nobody renders is a comment with extra steps. The console's drawer composes it
   in rather than restating it, so the two can never drift into different accounts of the
   same arithmetic. */
const drawer = MTC.claim("note.intel");
ck("the storm console's drawer carries it",
   (drawer.body || []).some((l) => /never averaged/i.test(l)), JSON.stringify((drawer.body || []).slice(-3)));
ck("and the drawer still carries the engine's own basis",
   (drawer.body || []).some((l) => /combined \d+ intensity estimate/.test(l)), JSON.stringify((drawer.body || []).slice(0, 2)));

console.log(fail ? `\n${fail} FAILED\n` : "\nall conflict-rule checks passed\n");
process.exit(fail ? 1 : 0);
