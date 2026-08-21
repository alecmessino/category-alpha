/* THE COHORT, IN ENGLISH. One formatter, five call sites, no second opinion.
 *
 * WHY THIS FILE EXISTS. The cohort spec was described in five places -- the question at the top
 * of the rail, the chip for each applied condition, the comparison's "the same cohort without
 * X", the answer panel's subtitle, and the citable spec line -- and each one built its own
 * string by comma-joining pre-baked fragments. That is not a style problem. Comma-joining
 * fragments that were written to stand alone produces sentences that are WRONG about the cohort
 * they describe, and this surface's entire claim is that the sentence and the population come
 * from one object. What it actually rendered:
 *
 *     Storms formed in the NA, that reached CAT 5, that made landfall in hawaii
 *     Storms in Jan, formed in the NA
 *     the same cohort without that reached CAT 3+
 *     baseline 13.0% [11.9-14.1%] · without that reached CAT 3+      (once per outcome card)
 *
 * A missing "that", a dangling participle, a raw filter key where a contract name belongs, a
 * region printed in the lowercase the database happens to store, and a preposition doing the
 * work of a conjunction. A reader who cannot parse the question cannot audit the answer.
 *
 * THE FIX IS STRUCTURAL, NOT EDITORIAL. A condition no longer carries one pre-joined fragment.
 * It carries the GRAMMATICAL PARTS it can contribute, and one assembler decides how they
 * combine:
 *
 *   adjective    qualifies the head noun          "North Atlantic", "named"
 *   genesis      a verb phrase after "that formed" "in August or September"
 *   trajectory   its own verb phrase              "later entered the Caribbean Sea"
 *   outcome      an outcome-side verb phrase      "reached Category 3"
 *   trailing     a scope note                     "including seasons not yet post-analysed"
 *   value        the bare value, for a chip       "August or September"
 *   noun         a noun phrase, for "without X"   "the genesis-month condition"
 *
 * Because the parts are typed, a combination nobody anticipated still composes: there is no
 * path that emits a dangling comma, an empty noun, or two prepositions in a row, because no
 * part is ever concatenated with a separator chosen by a different function.
 *
 * THE ZONE DISTINCTION IS CARRIED BY THE GRAMMAR ITSELF. An outcome-side condition following a
 * genesis condition reads "…, given that they also reached Category 3" -- the reader is told,
 * in the sentence, that the question changed from "what happens to storms that BEGIN like this"
 * to "what did the storms that ENDED UP like this have in common". With no genesis condition
 * there is nothing to be "also", so it is a plain relative clause. The distinction the builder
 * draws with a dashed rule is the same distinction the sentence draws with a subordinate
 * clause, which is the point: it should be legible without the rule.
 *
 * NO NUMBER, NO THRESHOLD AND NO CLAIM IS DECIDED HERE. This module names things the spec
 * already says. It reads no archive, computes no count, and applies no filter -- every label
 * below is a display name for a code the engine chose, and an unknown code falls through to the
 * code itself rather than to a guess.
 */

/* Full month names. The rail's twelve buttons stay single letters because they are a control;
   a sentence that says "Aug, Sep" is abbreviating for no reason -- there is room, and "August
   or September" is what the reader is actually asking. */
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

/* Display names for the codes the pack stores. FALLING BACK TO THE CODE IS DELIBERATE: the
   basin and subbasin dictionaries come from the archive, so a pack that adds one must print
   something honest rather than something invented. `NA` is a worse label than "North Atlantic"
   and a much better one than a name this file made up. */
const BASIN_NAME = {
  NA: "North Atlantic", EP: "East Pacific", WP: "West Pacific",
  CP: "Central Pacific", NI: "North Indian", SI: "South Indian", SP: "South Pacific",
  SA: "South Atlantic",
};
const SUBBASIN_NAME = {
  NA: "North Atlantic", EP: "East Pacific", WP: "West Pacific", CP: "Central Pacific",
  CS: "Caribbean Sea", GM: "Gulf of Mexico", AS: "Arabian Sea", BB: "Bay of Bengal",
  NI: "North Indian",
};
const REGION_NAME = {
  mexico: "Mexico", conus: "the continental United States", hawaii: "Hawaii",
  caribbean: "the Caribbean", central_america: "Central America",
};

/* The contracts, in prose. INTENSITY_FILTERS carries "CAT 3+", which is the right label for a
   4-character chip and the wrong one for a sentence -- and printing the raw key `cat5` in a
   question, which is what happened, states a threshold in the vocabulary of a column name. */
const INTENSITY_NAME = {
  ts: "tropical-storm strength", cat1: "Category 1", cat2: "Category 2",
  cat3: "Category 3", cat4: "Category 4", cat5: "Category 5",
};

export function basinName(code) { return BASIN_NAME[code] || code; }
export function subbasinName(code) { return SUBBASIN_NAME[code] || code; }
export function regionName(key) {
  return REGION_NAME[key] || String(key || "").replace(/_/g, " ");
}

/* THE SAME REGION, SPELLED ONE WAY WHEREVER IT IS A LABEL.
 *
 * `regionName` is for PROSE -- "made landfall in the continental United States" -- and it is
 * the wrong string for a table row, where the column is 96px wide and the reader is scanning.
 * Before this pair existed the panel printed the raw storage key (`hawaii`), the applied chip
 * printed the filter's own label (`HAWAII`) and the sentence printed the prose name, so one
 * region appeared three ways on one screen. Prose takes `regionName`; every label takes this. */
const REGION_LABEL = {
  mexico: "Mexico", conus: "CONUS", hawaii: "Hawaii", caribbean: "Caribbean",
  central_america: "Central America", unattributed: "Unattributed",
};
export function regionLabel(key) {
  return REGION_LABEL[key]
    || String(key || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function intensityName(key) { return INTENSITY_NAME[key] || key; }

/**
 * A serial join that cannot produce a dangling separator.
 *
 * Empty and absent items are dropped BEFORE the count is taken, which is the whole trick: the
 * `in , Jan` family of bugs all came from a join running over a list whose first element was
 * absent, and `Array.prototype.join` renders null and undefined as the empty string rather than
 * refusing. Nothing here ever sees such an element.
 *
 * The serial comma appears only when an item already contains one, where it is the only thing
 * separating "A, B and C" from "A, B, and C" meaning different groupings.
 */
export function serial(list, conj = "and") {
  const xs = (list || []).filter((x) => typeof x === "string" && x.trim() !== "");
  if (!xs.length) return "";
  if (xs.length === 1) return xs[0];
  const oxford = xs.some((x) => x.includes(","));
  if (xs.length === 2) return `${xs[0]}${oxford ? "," : ""} ${conj} ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}${oxford ? "," : ""} ${conj} ${xs[xs.length - 1]}`;
}

/** A position, at the precision the probe actually carries. */
function coord(lat, lon) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} `
       + `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
}

/**
 * Months as a phrase.
 *
 * Contiguous runs read as spans because that is what a reader means by them: [6,7,8,9,10] is
 * "June through October", not a list of five alternatives they enumerated. Two adjacent months
 * stay "August or September" -- "August through September" implies a range where there is only
 * a pair.
 */
export function monthPhrase(months) {
  const ms = (months || [])
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b);
  if (!ms.length) return null;
  const runs = [];
  for (const m of ms) {
    const last = runs[runs.length - 1];
    if (last && m === last[1] + 1) last[1] = m; else runs.push([m, m]);
  }
  return serial(runs.map(([a, b]) => (
    a === b ? MONTH_FULL[a - 1]
      : b === a + 1 ? `${MONTH_FULL[a - 1]} or ${MONTH_FULL[b - 1]}`
        : `${MONTH_FULL[a - 1]} through ${MONTH_FULL[b - 1]}`)), "or");
}

/** Seasons as a phrase. Named as SEASONS so it cannot be read as a second month clause. */
export function seasonPhrase(from, to) {
  if (from !== null && from !== undefined && to !== null && to !== undefined) {
    return from === to ? `in the ${from} season` : `in the ${from}–${to} seasons`;
  }
  if (from !== null && from !== undefined) return `in seasons from ${from} onwards`;
  if (to !== null && to !== undefined) return `in seasons up to ${to}`;
  return null;
}

/**
 * The grammatical parts one condition contributes, keyed by the spec key that produced it.
 *
 * Returned in LIFECYCLE ORDER, the same order `conditionsOf` publishes, so a caller that zips
 * the two together gets a stable pairing. The shape is additive: `conditionsOf` merges these
 * onto the condition objects it already returns, so nothing that reads `key`, `zone`, `label`
 * or `costs` has to change.
 */
export function languageOf(spec) {
  const s = spec || {};
  const out = [];

  if (s.where) {
    out.push({
      key: "where",
      genesis: `within ${Math.round(s.where.radiusKm)} km of `
             + coord(s.where.lat, s.where.lon),
      value: `within ${Math.round(s.where.radiusKm)} km of `
             + coord(s.where.lat, s.where.lon),
      noun: "the location condition",
    });
  }
  if (s.months && s.months.length) {
    const p = monthPhrase(s.months);
    if (p) out.push({ key: "months", genesis: `in ${p}`, value: p,
      noun: "the genesis-month condition" });
  }
  if ((s.seasonFrom !== null && s.seasonFrom !== undefined)
      || (s.seasonTo !== null && s.seasonTo !== undefined)) {
    const p = seasonPhrase(s.seasonFrom, s.seasonTo);
    const f = s.seasonFrom;
    const t = s.seasonTo;
    if (p) out.push({
      key: "season",
      genesis: p,
      value: f !== null && f !== undefined && t !== null && t !== undefined ? `${f}–${t}`
        : f !== null && f !== undefined ? `${f} onwards` : `up to ${t}`,
      noun: "the season condition",
    });
  }
  if (s.basins && s.basins.length) {
    const p = serial(s.basins.map(basinName), "or");
    out.push({ key: "basins", adjective: p, value: p, noun: "the genesis-basin condition" });
  }
  if (s.subbasinsEntered && s.subbasinsEntered.length) {
    const p = serial(s.subbasinsEntered.map(subbasinName), "or");
    out.push({ key: "subbasinsEntered", trajectory: `later entered the ${p}`, value: p,
      noun: "the trajectory condition" });
  }
  if (s.namedOnly) {
    out.push({ key: "namedOnly", adjective: "named", value: "named storms only",
      noun: "the named-only scope" });
  }
  if (s.includeProvisional) {
    out.push({ key: "includeProvisional",
      trailing: "including seasons not yet post-analysed",
      value: "provisional seasons included", noun: "the provisional-seasons scope" });
  }
  if (s.intensity && s.intensity !== "all") {
    out.push({ key: "intensity", outcome: `reached ${intensityName(s.intensity)}`,
      value: intensityName(s.intensity), noun: "the intensity condition" });
  }
  if (s.landfall) {
    out.push({
      key: "landfall",
      outcome: s.landfall === "any" ? "made landfall anywhere"
        : `made landfall in ${regionName(s.landfall)}`,
      value: s.landfall === "any" ? "anywhere" : regionName(s.landfall),
      noun: "the landfall condition",
    });
  }
  return out;
}

/** The empty cohort, said the same way everywhere. */
export const EVERY_STORM = "Every storm in the archive";

/**
 * The whole cohort as one grammatical sentence, with no trailing question.
 *
 * @param {object} spec        a NORMALISED cohort spec
 * @param {Array}  [parts]     the output of `languageOf`, when the caller already has it
 */
export function cohortSentence(spec, parts) {
  const cs = parts || languageOf(spec);
  /* A cohort whose only condition is a SCOPE switch has not narrowed the question, it has
     widened the record the question is asked over -- so it reads as the whole archive with the
     scope named, not as "Storms including seasons not yet post-analysed". */
  const substantive = cs.filter((c) => c.adjective || c.genesis || c.trajectory || c.outcome);
  if (!substantive.length) {
    const trailing = cs.map((c) => c.trailing).filter(Boolean);
    return trailing.length ? `${EVERY_STORM}, ${serial(trailing)}` : EVERY_STORM;
  }

  /* ADJECTIVE ORDER IS NOT THE LIFECYCLE ORDER. The conditions arrive in the order a storm
     lives them, which puts the basin before the record's naming scope and reads "East Pacific
     named storms". English orders a scope adjective ahead of an origin one, so the head noun is
     assembled in its own order and the lifecycle order is left to the clauses, where it is the
     thing the reader is actually following. */
  const adjectives = [
    ...cs.filter((c) => c.key === "namedOnly").map((c) => c.adjective),
    ...cs.filter((c) => c.key !== "namedOnly").map((c) => c.adjective),
  ].filter(Boolean);
  const genesis = cs.map((c) => c.genesis).filter(Boolean);
  const trajectory = cs.map((c) => c.trajectory).filter(Boolean);
  const outcome = cs.map((c) => c.outcome).filter(Boolean);
  const trailing = cs.map((c) => c.trailing).filter(Boolean);

  let s = adjectives.length
    ? `${capitalise(adjectives.join(" "))} storms`
    : "Storms";

  const givens = [];
  if (genesis.length) givens.push(`formed ${genesis.join(", ")}`);
  if (trajectory.length) givens.push(serial(trajectory));
  if (givens.length) s += ` that ${serial(givens)}`;

  if (outcome.length) {
    s += givens.length
      ? `, given that they also ${serial(outcome)}`
      : ` that ${serial(outcome)}`;
  }
  if (trailing.length) s += `, ${serial(trailing)}`;
  return s;
}

/** The sentence as the question the surface actually asks. */
export function cohortQuestion(spec, parts) {
  return `${cohortSentence(spec, parts)} — what happened next?`;
}

/**
 * The baseline, named as a noun phrase.
 *
 * "the same cohort without that reached CAT 3+" was the old form: a relative clause where a
 * noun belongs. `noun` exists so the comparison can say what was HELD OUT rather than replay
 * the condition's own verb.
 */
export function baselineSentence(changed) {
  return changed && changed.noun
    ? `the same cohort without ${changed.noun}`
    : "the same cohort with no conditions";
}

/** The same relationship, short enough to repeat on every outcome row. */
export function baselineName(changed) {
  return changed && changed.noun ? `without ${changed.noun}` : "the whole archive";
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
