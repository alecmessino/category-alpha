/* THE LEDGER: what this method got right, what it got wrong, and how anyone would know.
 *
 * Every other surface in the Atlas answers "what does the record say". This one answers the
 * question a reader asks immediately afterwards and that almost no analytical product will
 * answer about itself: IS ANY OF THIS ANY GOOD?
 *
 * The answer comes from a run the archive has been doing since before this browser surface
 * existed -- `backtest/harness.py` replays the record storm by storm with a zero-peek `as_of`,
 * asks the analog engine for a probability at each moment, and scores what actually happened.
 * 1,039 storms, a 10,390-row ledger, Brier against climatology, reliability curves. Nothing
 * here computes a score; this module carries the archive's own scores to the screen and joins
 * them to the refusals they belong beside.
 *
 * THE JOIN IS THE POINT. A refusal that says "BASE RATE ONLY -- 2 events archive-wide" is a
 * claim about the record. The ledger is the evidence for or against that claim, and putting
 * them in one place is what turns a refusal from a policy into a finding.
 *
 * AND IT DOES NOT FLATTER. The join immediately shows that the refusal gate counts the wrong
 * population: it asks whether the WHOLE ARCHIVE carries ten events, when what decides skill is
 * whether the population a query can draw from carries them. Of the four contracts that earned
 * no skill claim, the gate catches one. Two it passes outright, and one it passes on a contract
 * the replay never scored at all. `scope_audit` on every contract carries that verdict, and the
 * surface prints it. Fixing the gate would change what both surfaces refuse and is a
 * METHODOLOGY_VERSION decision, not something a display module should do quietly.
 */

import { THRESHOLDS_KT } from "./stats.js";

export const CALIBRATION_FILE = "atlas-calibration.json";

/** Verdicts the scope audit emits, and how a reader should weigh each. */
export const VERDICT = {
  agreed_scoreable: {
    label: "CALIBRATED", tone: "pos",
    short: "the gate allows a skill claim and the replay earned one",
  },
  agreed_refused: {
    label: "CORRECTLY REFUSED", tone: "pos",
    short: "the gate refuses a skill claim and the replay confirms none was available",
  },
  refused_and_degenerate: {
    label: "CORRECTLY REFUSED", tone: "pos",
    short: "refused by the gate, and the replay had no events to score either",
  },
  refused_despite_skill: {
    label: "CONSERVATIVELY REFUSED", tone: "warn",
    short: "the replay beat climatology but the gate refuses anyway",
  },
  gate_missed: {
    label: "GATE MISSED IT", tone: "neg",
    short: "the gate allows a skill claim the evidence does not support",
  },
  gate_passed_but_degenerate: {
    label: "NEVER SCORED", tone: "warn",
    short: "the gate allows a skill claim, but nothing in the replay tested it",
  },
};

/**
 * Fetch the ledger. Separate from the pack and fetched only by the calibration surface, so no
 * reader pays 16 KB to look at a map.
 */
export async function loadCalibration(base) {
  const r = await fetch(`${base}/${CALIBRATION_FILE}`, { cache: "force-cache" });
  if (!r.ok) throw new Error(`calibration ledger: ${r.status} ${r.statusText}`);
  const cal = await r.json();
  if (cal.schema !== "atlas-calibration/1") {
    throw new Error(`calibration ledger declares schema '${cal.schema}', which this surface `
      + "does not know how to read -- refusing rather than guessing at its shape");
  }
  return cal;
}

/* ---- joining a contract on screen to its row in the ledger -------------------------------
 *
 * The Atlas names its contracts one way and the harness names them another. This is the only
 * place the two vocabularies meet; everything downstream works in ledger rows.
 *
 * NOT EVERY CONTRACT WAS SCORED. The harness scored four intensity thresholds -- ts, cat1, cat3,
 * cat4 -- and not cat2 or cat5. A surface that returned nothing for those would let a reader
 * infer they had been calibrated and found fine. `null` here means "the backtest never tested
 * this", and the UI says exactly that.
 */

/* The key builders are PURE -- no ledger needed. That matters: a refusal on the tactical
   surface has to be able to link to its own evidence, and the tactical surface has not fetched
   the 16 KB ledger and should not have to in order to draw a link. The link is built from the
   Atlas's own vocabulary; whether the harness actually scored that contract is answered on the
   other side, where the file is loaded, and answered in words rather than by a dead anchor. */

/** The harness's key for an intensity threshold. Pure; says nothing about whether it exists. */
export function intensityContractKey(cat) {
  const kt = THRESHOLDS_KT[cat];
  return kt === undefined ? null : `reaches_${cat}_${kt}kt`;
}

/** The harness's key for a landfall contract. Pure; same caveat. */
export function landfallContractKey(region, kind) {
  return `landfall_${region}_${kind}`;
}

/** Ledger row for an intensity threshold, or null when the harness did not score it. */
export function intensityContract(cal, cat) {
  const key = intensityContractKey(cat);
  return key ? cal.contracts.find((c) => c.key === key) || null : null;
}

/** Ledger row for a landfall contract, or null when the harness did not score it. */
export function landfallContract(cal, region, kind) {
  const key = landfallContractKey(region, kind);
  return cal.contracts.find((c) => c.key === key) || null;
}

/**
 * What to say when a reader followed a link to a contract the backtest never scored.
 *
 * A dead anchor would be the worst outcome here: the reader arrives at a page of calibration
 * evidence, finds nothing about the thing they clicked, and concludes either that the page is
 * broken or -- far worse -- that silence means the contract was fine. It was never tested, and
 * that is a different statement from both.
 */
export function unscoredNote(cal, anchor) {
  if (!anchor || cal.contracts.some((c) => c.key === anchor)) return null;
  const scored = cal.contracts.map((c) => c.key).sort();
  return `The backtest did not score ${anchor}. It scored ${scored.length} contracts — `
    + `${scored.join(", ")} — over ${cal.settings.basins.join(", ")} storms from `
    + `${cal.settings.min_season}. There is no calibration evidence for ${anchor} either way: `
    + "it was not tested, which is not the same as having been tested and found sound.";
}

/**
 * The ledger row a refusal on screen should point at.
 *
 * @param {object} cal
 * @param {{kind: "intensity"|"landfall", cat?: string, region?: string, lfKind?: string}} at
 * @returns {{contract: object|null, reason: string|null}} `reason` explains a null, because
 *   "this contract was never scored" and "this contract scored badly" must not look alike.
 */
export function evidenceFor(cal, at) {
  if (!cal || !at) return { contract: null, reason: null };
  const c = at.kind === "intensity"
    ? intensityContract(cal, at.cat)
    : landfallContract(cal, at.region, at.lfKind);
  if (c) return { contract: c, reason: null };
  return {
    contract: null,
    reason: at.kind === "intensity"
      ? `The backtest scored ts, cat1, cat3 and cat4. It did not score ${String(at.cat)
        .toUpperCase()}, so there is no calibration evidence for this threshold either way.`
      : `The backtest scored ${cal.settings.regions.join(", ")}. It did not score `
        + `${String(at.region).replace(/_/g, " ")}, so there is no calibration evidence for `
        + "this contract either way.",
  };
}

/** Skill as a signed fraction, or null when the contract was never scored. */
export function skillOf(contract) {
  return contract && typeof contract.skill === "number" ? contract.skill : null;
}

/**
 * Contracts ordered the way the hero table reads: by the evidence behind them.
 *
 * Sorted by the events the REPLAY carried, not by skill and not by the archive-wide count.
 * That ordering is the argument -- run down the column and the sign of the skill flips exactly
 * once, at the point where the population stops carrying enough events to learn from.
 */
export function byEvidence(cal) {
  return cal.contracts.slice().sort((a, b) => (b.n_events || 0) - (a.n_events || 0));
}

/**
 * The one-line summary the surface leads with, built from the ledger's own audit.
 *
 * Deliberately states BOTH halves. The clean half -- skill tracks the replayed event count with
 * no contract in between -- is the finding. The other half is that the gate protecting readers
 * from the second group catches one of four, and a summary that omitted it would be the
 * marketing version of this page.
 */
export function headline(cal) {
  const a = cal.audit_summary;
  const notScoring = cal.contracts.filter((c) => c.scope_audit.beat_climatology !== true);
  const caught = notScoring.filter((c) => c.scope_audit.refused_by_gate);
  return {
    beat: a.n_beat_climatology,
    scored: a.n_scored,
    minWith: a.min_replay_events_with_skill,
    maxWithout: a.max_replay_events_without_skill,
    notScoring: notScoring.length,
    caught: caught.length,
    missed: a.n_gate_missed,
  };
}
