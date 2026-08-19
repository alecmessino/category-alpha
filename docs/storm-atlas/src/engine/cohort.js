/* The cohort spec: one object that fully determines a population, and the only query surface.
 *
 * WHY THIS EXISTS. Until now the Atlas had two query surfaces that did not compose.
 * `filterStorms` decided what was DRAWN; `getAnalogs` decided what was SCORED. A reader could
 * not ask one question and get one answer -- the map and the statistics were answering
 * different ones, and the shell kept them from colliding by hand. This collapses them.
 *
 * The spec is the truth. Everything else derives from it: the drawn rows, the outcome cards, the
 * URL, the saved scenario, the export header, the baseline for a comparison. Two specs that mean
 * the same cohort must serialise identically, which is what `normalise` is for -- without it a
 * scenario URL would depend on the order someone happened to click.
 *
 * THE ORDER OF CONDITIONS IS THE STORM'S OWN LIFECYCLE
 *     GENESIS -> ENVIRONMENT -> TRAJECTORY -> INTENSITY -> LANDFALL -> OUTCOME
 * so composing a query walks the path a storm walks, and the question assembles itself as a
 * sentence rather than as a form.
 *
 * TWO ZONES, BECAUSE TWO KINDS OF CONDITION ARE NOT THE SAME QUESTION
 *   GIVEN            -- at or before genesis: where, when, which basin, what environment.
 *                       Forms "what happens to storms that BEGIN like this?"
 *   GIVEN THAT ALSO  -- outcome-side: peak intensity, landfall region.
 *                       Forms "what did the storms that ENDED UP like this have in common?"
 * Both are legitimate. Conflating them is how circular reasoning enters, so the zone travels
 * with every condition and the outcome-side ones declare what they cost -- see `conditionsOf`.
 */

import { INTENSITY_FILTERS, LANDFALL_FILTERS, filterStorms } from "./query.js";
import { scoreCases } from "./analogs.js";

/** The spec version. Bumped when the SHAPE changes, so an old URL is detected rather than
 *  silently mis-parsed into a cohort nobody asked for. */
export const COHORT_V = 1;

export const EMPTY_COHORT = Object.freeze({
  v: COHORT_V,
  where: null,            // { lat, lon, radiusKm } -- proximity to GENESIS
  seasonFrom: null,
  seasonTo: null,
  months: null,           // GENESIS months, 1-12
  basins: null,           // genesis basin
  subbasinsEntered: null, // "was ever here" -- the Iniki-safe one
  intensity: "all",       // outcome-side
  landfall: null,         // outcome-side; region key
  includeProvisional: false,
  namedOnly: false,
});

/* Which spec keys are outcome-side. The fifth rule keys off this, and so does the builder's
   second zone. `includeProvisional` and `namedOnly` are neither -- they are properties of the
   RECORD rather than of the storm, so they sit outside both zones as scope switches. */
const OUTCOME_KEYS = new Set(["intensity", "landfall"]);

/**
 * Canonical form. Two specs meaning the same cohort must come out identical, because the URL,
 * the scenario and the memo key are all derived from this.
 */
export function normalise(spec) {
  const s = { ...EMPTY_COHORT, ...(spec || {}) };
  s.v = COHORT_V;

  // A radius of zero or a missing coordinate is not a location condition, it is a mistake.
  if (s.where) {
    const { lat, lon, radiusKm } = s.where;
    s.where = Number.isFinite(lat) && Number.isFinite(lon) && radiusKm > 0
      ? { lat, lon, radiusKm } : null;
  }
  // Sorted and de-duplicated so [9,8] and [8,9] are one cohort. An empty list means "no
  // condition", never "match nothing" -- the latter is a state a reader cannot get out of.
  s.months = tidyList(s.months, (a, b) => a - b);
  s.basins = tidyList(s.basins);
  s.subbasinsEntered = tidyList(s.subbasinsEntered);

  if (s.seasonFrom !== null && s.seasonTo !== null && s.seasonFrom > s.seasonTo) {
    const t = s.seasonFrom; s.seasonFrom = s.seasonTo; s.seasonTo = t;
  }
  if (!INTENSITY_FILTERS.some((x) => x.key === s.intensity)) s.intensity = "all";
  s.includeProvisional = s.includeProvisional === true;
  s.namedOnly = s.namedOnly === true;
  return s;
}

function tidyList(v, cmp) {
  if (!v || !v.length) return null;
  const out = [...new Set(v)].sort(cmp);
  return out.length ? out : null;
}

/* ---- deriving the two engine calls ------------------------------------------------------
 *
 * NEITHER ENGINE FUNCTION IS REWRITTEN. filterStorms and getAnalogs keep the arguments they
 * already take and the behaviour the parity harness already proves. That is the seam that makes
 * this migration provable: the spec path and the legacy path must select the identical storm
 * set, and test-atlas-cohort.mjs asserts exactly that before the rail is allowed to go. */

/** The arguments `filterStorms` takes. This decides the cohort's MEMBERSHIP. */
export function toFilters(spec) {
  const s = normalise(spec);
  return {
    where: s.where,
    seasonFrom: s.seasonFrom,
    seasonTo: s.seasonTo,
    months: s.months,
    basins: s.basins,
    subbasinsEntered: s.subbasinsEntered,
    intensity: s.intensity,
    landfall: s.landfall,
    includeProvisional: s.includeProvisional,
    namedOnly: s.namedOnly,
  };
}

/**
 * The arguments `getAnalogs` takes -- the DISTANCE-WEIGHTED view, which needs a point.
 *
 * Returns null when the spec has no location, because an analog query without one is not a
 * smaller version of the question; it is a different question. The cohort is still fully
 * scoreable in that case -- scoreCases handles it with uniform weights.
 */
export function toAnalogOpts(spec, { regions = null } = {}) {
  const s = normalise(spec);
  if (!s.where) return null;
  return {
    lat: s.where.lat,
    lon: s.where.lon,
    radiusKm: s.where.radiusKm,
    seasonMonths: s.months,
    minPoolSeason: s.seasonFrom,
    basins: s.basins,
    subbasins: s.subbasinsEntered,
    includeProvisional: s.includeProvisional,
    regions,
    conditionedOn: conditionedOn(s),
  };
}

/** What the cohort was narrowed on, in the shape `rates.js` expects. This is what makes the
 *  fifth rule fire: declare the conditioning and the circular rows refuse. */
export function conditionedOn(spec) {
  const s = normalise(spec);
  const out = {};
  if (s.intensity && s.intensity !== "all") out.minPeak = s.intensity;
  if (s.landfall && s.landfall !== "any") out.landfallRegion = s.landfall;
  return Object.keys(out).length ? out : null;
}

/* ---- the condition list, in lifecycle order --------------------------------------------- */

/**
 * The chips, ordered the way a researcher asks and the way a storm lives.
 *
 * Each carries its zone, the sentence fragment it contributes, and -- for outcome-side
 * conditions -- the consequence of adding it, so the builder can say what a chip costs BEFORE
 * it is applied rather than leaving the reader to discover a refusal afterwards.
 */
export function conditionsOf(spec) {
  const s = normalise(spec);
  const out = [];
  const add = (key, zone, label, sentence, extra) =>
    out.push({ key, zone, label, sentence, ...extra });

  if (s.where) {
    add("where", "given", "FORMED NEAR",
      `within ${Math.round(s.where.radiusKm)} km of ` +
      `${Math.abs(s.where.lat).toFixed(1)}${s.where.lat >= 0 ? "N" : "S"} ` +
      `${Math.abs(s.where.lon).toFixed(1)}${s.where.lon >= 0 ? "E" : "W"}`);
  }
  if (s.months) {
    add("months", "given", "IN", `in ${s.months.map((m) => MONTH[m - 1]).join(", ")}`);
  }
  if (s.seasonFrom !== null || s.seasonTo !== null) {
    const from = s.seasonFrom;
    const to = s.seasonTo;
    add("season", "given", "SEASONS",
      from !== null && to !== null ? `between ${from} and ${to}`
        : from !== null ? `since ${from}` : `up to ${to}`);
  }
  if (s.basins) add("basins", "given", "BASIN", `formed in the ${s.basins.join(" or ")}`);
  if (s.subbasinsEntered) {
    add("subbasinsEntered", "given", "ENTERED",
      `that ever entered the ${s.subbasinsEntered.join(" or ")}`);
  }
  if (s.namedOnly) add("namedOnly", "scope", "NAMED", "that were named");
  if (s.includeProvisional) {
    add("includeProvisional", "scope", "PROVISIONAL",
      "including seasons not yet post-analysed");
  }

  /* OUTCOME-SIDE. These change the question from "what happens to storms that begin like this"
     to "what did the storms that ended up like this have in common" -- so each one states what
     it takes off the table. */
  if (s.intensity && s.intensity !== "all") {
    const f = INTENSITY_FILTERS.find((x) => x.key === s.intensity);
    add("intensity", "outcome", "REACHED", `that reached ${f ? f.label : s.intensity}`, {
      costs: `every intensity row at or below ${s.intensity} stops being an outcome ` +
             "of this cohort and reports its count only",
    });
  }
  if (s.landfall) {
    add("landfall", "outcome", "CAME ASHORE",
      s.landfall === "any" ? "that made landfall anywhere"
        : `that made landfall in ${s.landfall.replace(/_/g, " ")}`, {
        costs: s.landfall === "any"
          ? "every landfall contract stops being an outcome of this cohort"
          : `the ${s.landfall.replace(/_/g, " ")} landfall rate stops being an outcome of ` +
            "this cohort; its hurricane-intensity rate is still one",
      });
  }
  return out;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The whole question, as one sentence. What the builder reads back to the reader. */
export function sentenceOf(spec) {
  const cs = conditionsOf(spec);
  if (!cs.length) return "Every storm in the archive — what happened next?";
  return `Storms ${cs.map((c) => c.sentence).join(", ")} — what happened next?`;
}

/**
 * The cohort with one condition removed -- the default baseline for a comparison.
 *
 * Defaults to the LAST condition in lifecycle order, which is the one a reader most recently
 * reasoned about. Pass a key to drop a specific one; that is what a pinned baseline will use
 * later, and it needs no engine change because the comparison already takes two specs.
 */
export function parentOf(spec, key) {
  const s = normalise(spec);
  const cs = conditionsOf(s);
  if (!cs.length) return null;
  const drop = key || cs[cs.length - 1].key;
  const out = { ...s };
  if (drop === "where") out.where = null;
  else if (drop === "season") { out.seasonFrom = null; out.seasonTo = null; }
  else if (drop === "intensity") out.intensity = "all";
  else if (drop === "landfall") out.landfall = null;
  else if (drop === "namedOnly") out.namedOnly = false;
  else if (drop === "includeProvisional") out.includeProvisional = false;
  else out[drop] = null;
  return normalise(out);
}

/* ---- URL round-trip ----------------------------------------------------------------------
 *
 * A scenario is a URL. That is the whole persistence story below the institutional tier: it
 * costs no server, it is shareable and diffable, and it survives a reload. Keys are short
 * because the string is meant to be pasted into a message.
 */

const K = {
  where: "w", seasonFrom: "s0", seasonTo: "s1", months: "m", basins: "b",
  subbasinsEntered: "e", intensity: "i", landfall: "l",
  includeProvisional: "p", namedOnly: "n",
};

export function toQuery(spec) {
  const s = normalise(spec);
  const q = new URLSearchParams();
  q.set("v", String(s.v));
  if (s.where) q.set(K.where, `${round(s.where.lat, 3)},${round(s.where.lon, 3)},${Math.round(s.where.radiusKm)}`);
  if (s.seasonFrom !== null) q.set(K.seasonFrom, String(s.seasonFrom));
  if (s.seasonTo !== null) q.set(K.seasonTo, String(s.seasonTo));
  if (s.months) q.set(K.months, s.months.join("."));
  if (s.basins) q.set(K.basins, s.basins.join("."));
  if (s.subbasinsEntered) q.set(K.subbasinsEntered, s.subbasinsEntered.join("."));
  if (s.intensity !== "all") q.set(K.intensity, s.intensity);
  if (s.landfall) q.set(K.landfall, s.landfall);
  if (s.includeProvisional) q.set(K.includeProvisional, "1");
  if (s.namedOnly) q.set(K.namedOnly, "1");
  return q.toString();
}

/**
 * @returns {{spec: object, versionMismatch: number|null}} -- a spec written by a DIFFERENT
 * shape version is reported rather than silently coerced. A scenario that quietly means
 * something else than it did when it was saved is worse than one that refuses to open.
 */
export function parseQuery(str) {
  const q = new URLSearchParams(str || "");
  const v = q.get("v");
  const versionMismatch = v !== null && Number(v) !== COHORT_V ? Number(v) : null;
  const s = { ...EMPTY_COHORT };

  const w = q.get(K.where);
  if (w) {
    const [lat, lon, r] = w.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && r > 0) s.where = { lat, lon, radiusKm: r };
  }
  const num = (k) => (q.get(k) === null ? null : Number(q.get(k)));
  s.seasonFrom = num(K.seasonFrom);
  s.seasonTo = num(K.seasonTo);
  const list = (k, f) => (q.get(k) ? q.get(k).split(".").map(f || ((x) => x)) : null);
  s.months = list(K.months, Number);
  s.basins = list(K.basins);
  s.subbasinsEntered = list(K.subbasinsEntered);
  s.intensity = q.get(K.intensity) || "all";
  s.landfall = q.get(K.landfall) || null;
  s.includeProvisional = q.get(K.includeProvisional) === "1";
  s.namedOnly = q.get(K.namedOnly) === "1";
  return { spec: normalise(s), versionMismatch };
}

function round(x, d) {
  const p = 10 ** d;
  return Math.round(x * p) / p;
}

/** True when two specs mean the same cohort. Used to skip recomputation and to decide whether
 *  a scenario actually changed. Compares the CANONICAL form, not the object identity. */
export function sameCohort(a, b) {
  return toQuery(a) === toQuery(b);
}

/** Is this key an outcome-side condition? The builder's zoning and the fifth rule share it. */
export function isOutcomeKey(key) {
  return OUTCOME_KEYS.has(key);
}

/* ---- scoring a cohort --------------------------------------------------------------------
 *
 * THE UNIFICATION, in one function. `filterStorms` decides membership; `scoreCases` -- the same
 * code `getAnalogs` uses -- decides outcomes. One question, one answer, whether or not the spec
 * carries a location.
 *
 * WEIGHTS ARE UNIFORM HERE, AND THAT IS A DECISION RATHER THAN AN OMISSION.
 * getAnalogs weights each case by a Gaussian in distance from the query point, because there
 * the point IS the question and a storm 490 km away is weaker evidence than one 20 km away. A
 * cohort has already used distance as a HARD filter: "within 500 km" is a membership rule, and
 * weighting by it again would count the same variable twice and quietly produce a different
 * statistic from the one the archive publishes for a filter-defined pool. So every member counts
 * once. `weighted_rate` is therefore identical to `rate` on a cohort card, and the surface does
 * not render it twice.
 */

const ALL_REGIONS = LANDFALL_FILTERS.map((f) => f.region).filter(Boolean);

/* The archive's own gate, restated here so a cohort refuses on the same threshold the analog
   query does. The two must never disagree about what is measurable. */
const MIN_SAMPLE = 10;

/**
 * @returns {{spec, rows, kept, undecidable, excluded, cases, intensity, landfall,
 *            time_to_event, unscoreable, gaps, n_cases}}
 */
export function cohortResult(archive, spec, { regions = ALL_REGIONS } = {}) {
  const s = normalise(spec);
  const filtered = filterStorms(archive, toFilters(s));
  const gaps = [];

  const G = archive.genesis;
  const S = archive.storms;
  const cases = [];
  for (let i = 0; i < filtered.rows.length; i++) {
    const row = filtered.rows[i];
    const gt = G.num("genesis_t", row);
    cases.push({
      row,
      storm_id: S.str("storm_id", row),
      name: S.str("name", row),
      season: S.num("season", row),
      weight: 1.0,
      genesis_utc: gt === null ? null : new Date(gt * 60000).toISOString(),
      genesis_lat: G.num("genesis_lat", row),
      genesis_lon: G.num("genesis_lon", row),
      peak_vmax_kt: G.num("peak_vmax_kt", row) !== null
        ? G.num("peak_vmax_kt", row)
        : S.num("max_vmax_kt", row),
      max_category: S.str("max_category", row),
      hours_to_ts: G.num("hours_to_ts", row),
      hours_to_cat1: G.num("hours_to_cat1", row),
      hours_to_cat3: G.num("hours_to_cat3", row),
      landfalls: [],
    });
  }

  const scored = scoreCases(archive, cases, {
    minSample: MIN_SAMPLE,
    regions,
    conditionedOn: conditionedOn(s),
    wsum: cases.length,           // uniform weights: the sum IS the count
    gaps,
  });

  /* THE PRE-SATELLITE INTENSITY BIAS -- the same warning getAnalogs emits (analogs.js), and the
     single most consequential thing the archive says about its own intensity record.
     East Pacific storms reaching Cat 3 by decade: 1950s 5.2%, 1960s 1.7%, then 1970s 20.3%,
     1980s 22.5%, 1990s 29.7%. The step is not weather; before geostationary satellites and
     Dvorak, major hurricanes there were simply not seen, and a cohort reaching into those
     seasons has every intensity rate dragged DOWN invisibly.

     The MEASURED FINDING is reproduced verbatim, because rewording a finding is how a finding
     stops being one -- and check-atlas-dom pins that wording. Only the closing remedy differs:
     the analog query tells a caller to pass min_pool_season, and a cohort has a season floor
     instead, so it names the control the reader actually has. */
  let early = 0;
  for (const c of cases) if (c.season && c.season < 1971) early++;
  if (early && s.seasonFrom === null) {
    gaps.push(
      `${early} of ${cases.length} storms in this cohort are from before 1971, when East ` +
      "Pacific intensities were estimated without geostationary satellites or Dvorak analysis " +
      "and major hurricanes were under-observed (measured: 1.7% Cat 3 in the 1960s vs 20-30% " +
      "from the 1970s on). Intensity rates above are therefore biased LOW. Set a season floor " +
      "of 1971 to restrict the cohort to the reliably-observed era.");
  }

  /* RULE 4, surfaced at the cohort level. The intensity filter could not judge these storms
     because the archive holds no wind for them; they are neither members nor failures. */
  if (filtered.undecidable > 0) {
    gaps.push(
      `${filtered.undecidable} storm(s) could not be judged by this cohort's intensity ` +
      "condition -- the archive records no wind for them. They are excluded from the cohort and " +
      "are not counted as having failed to reach the threshold.");
  }

  return {
    spec: s,
    rows: filtered.rows,
    n_cases: cases.length,
    /* Kish ESS over uniform weights is exactly n. Reported rather than omitted, because the
       number carries a real statement: an unweighted cohort has its FULL effective sample: no
       storm in it is standing in for another. That is precisely the property a distance-weighted
       analog pool does not have, and the contrast is worth being able to see. */
    effective_sample_size: cases.length,
    min_sample: MIN_SAMPLE,
    sufficient: cases.length >= MIN_SAMPLE,
    kept: filtered.kept,
    undecidable: filtered.undecidable,
    excluded: filtered.excluded,
    cases,
    ...scored,
    gaps,
  };
}
