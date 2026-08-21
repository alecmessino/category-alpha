/* THE ENVIRONMENT THESE STORMS FORMED IN -- as a lens, not a filter.
 *
 * WHY THIS IS READ-ONLY, AND WHY THAT IS THE CONCLUSION OF A MEASUREMENT RATHER THAN CAUTION.
 * The coverage decides the scope. 1,461 of this archive's 3,959 storms carry any environment at
 * all, and only 1,430 carry one within 12 h of genesis; none of it predates 1982. Offering
 * "storms in shear below 10 kt" as a condition over that would silently convert a 175-year
 * archive into a 40-year one and present the result as a stronger analog -- richer-looking and
 * less true, which is the exact trade this repository exists to refuse. Conditioning arrives
 * when the scaffolding below is carrying weight, not before.
 *
 * THE SOURCES ARE ERAS, NOT ALTERNATIVES, and they are never pooled:
 *
 *   ships_dev       1982-05 -> 2022-11
 *   ships_dev+csst  2023 only -- carries a CLIMATOLOGICAL sea-surface temperature where
 *                   ships_dev carries an observed one. A normal SST for that place and date,
 *                   not a measurement of that day.
 *   ships_rt        2026-03 onward -- the operational SHIPS files rather than the
 *                   developmental archive, and its GPI carries a vorticity decade INFERRED
 *                   from the distribution rather than read from a published unit.
 *
 * A cohort spanning 2022 into 2023 therefore crosses a boundary where the DEFINITION of sst_c
 * changes underneath it. Averaging across that boundary would produce a number with no single
 * meaning, so this returns one block per source and the surface renders them separately. There
 * is no code path here that combines two sources into one statistic.
 *
 * COVERAGE COSTS NOTHING TO STATE. `env_at_genesis_row` lives in the CORE pack -- the 991 KB
 * environment block is not needed to answer "can these storms be evaluated at all", only to
 * answer "and what was it like". So the refusal is free and the detail is opt-in, which is why
 * NOT EVALUABLE can be honest on first paint without downloading anything.
 */

import { percentile } from "./stats.js";

/** The fields this lens reports, in the order a reader asks about them. */
export const LENS_FIELDS = [
  { key: "shear_kt", label: "DEEP-LAYER SHEAR", unit: "kt", digits: 1 },
  { key: "sst_c", label: "SEA-SURFACE TEMP", unit: "°C", digits: 1 },
  { key: "ohc_kj_cm2", label: "OCEAN HEAT CONTENT", unit: "kJ/cm²", digits: 0 },
  { key: "rh_mid_pct", label: "MID-LEVEL RH", unit: "%", digits: 0 },
  { key: "pot_intensity_kt", label: "POTENTIAL INTENSITY", unit: "kt", digits: 0 },
];

/**
 * Can these storms be evaluated at all? Answered from the core pack alone.
 *
 * @returns {{n, evaluable, notEvaluable, windowHours, medianDtHours, earliest, latest}}
 *   `notEvaluable` is the NOT EVALUABLE refusal's count: storms with no environment record
 *   within the archive's genesis window. They are not zeros and they are not failures; nobody
 *   measured the air those storms formed in.
 */
export function envCoverage(archive, rows) {
  const ix = archive.core.indexes;
  const at = ix.env_at_genesis_row.array;
  const dt = ix.env_at_genesis_dt_h.array;
  const S = archive.storms;

  let evaluable = 0;
  let earliest = null;
  let latest = null;
  const dts = [];
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    if (!(at[i] >= 0)) continue;
    evaluable++;
    if (!Number.isNaN(dt[i])) dts.push(dt[i]);
    const season = S.num("season", i);
    if (season !== null) {
      if (earliest === null || season < earliest) earliest = season;
      if (latest === null || season > latest) latest = season;
    }
  }
  return {
    n: rows.length,
    evaluable,
    notEvaluable: rows.length - evaluable,
    windowHours: archive.manifest.env_genesis_window_hours,
    medianDtHours: dts.length ? percentile(dts.slice().sort((a, b) => a - b), 0.5) : null,
    earliest,
    latest,
  };
}

/**
 * The environment at genesis, one block per source.
 *
 * Requires the environment pack. Returns null when it is not loaded, rather than a partial
 * answer -- a distribution computed from whatever happened to be in memory is not a smaller
 * version of this question.
 *
 * @returns {{sources: Array<{source, storms, first, last, fields, methods}>, evaluable}|null}
 *   `fields[key]` carries {n, p25, median, p75, min, max} over the storms of THAT SOURCE only.
 *   `methods` carries the archive's own method strings verbatim for the rows in play, so a
 *   source whose index was computed differently says so in its own words.
 */
export function envAtGenesis(archive, rows) {
  if (!archive.env) return null;
  const E = archive.env.tables.environment;
  const at = archive.core.indexes.env_at_genesis_row.array;

  const bySource = new Map();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const r = at[i];
    if (!(r >= 0)) continue;
    const src = E.str("env_source", r) || "unattributed";
    let b = bySource.get(src);
    if (!b) {
      b = { source: src, storms: 0, first: null, last: null, values: {}, methods: new Set() };
      for (const f of LENS_FIELDS) b.values[f.key] = [];
      bySource.set(src, b);
    }
    b.storms++;
    const t = E.num("t", r);
    if (t !== null) {
      if (b.first === null || t < b.first) b.first = t;
      if (b.last === null || t > b.last) b.last = t;
    }
    const m = E.str("gpi_method", r);
    if (m) b.methods.add(m);
    for (const f of LENS_FIELDS) {
      const v = E.num(f.key, r);
      if (v !== null && !Number.isNaN(v)) b.values[f.key].push(v);
    }
  }

  const sources = [...bySource.values()]
    .map((b) => {
      const fields = {};
      for (const f of LENS_FIELDS) {
        const v = b.values[f.key].slice().sort((x, y) => x - y);
        /* n is the count of storms with a USABLE value for THIS field, not the count of storms
           in the source. A field can be null on a row whose other fields are present, and
           reporting the source's storm count beside a quantile taken over fewer values would
           overstate the sample every time. */
        fields[f.key] = v.length ? {
          n: v.length, p25: percentile(v, 0.25), median: percentile(v, 0.50),
          p75: percentile(v, 0.75), min: v[0], max: v[v.length - 1],
        } : { n: 0, p25: null, median: null, p75: null, min: null, max: null };
      }
      return {
        source: b.source, storms: b.storms, first: b.first, last: b.last, fields,
        methods: [...b.methods],
      };
    })
    .sort((a, b) => (a.first || 0) - (b.first || 0));

  return { sources, evaluable: sources.reduce((n, s) => n + s.storms, 0) };
}

/** The archive's own statement about why these blocks are not added together. Verbatim. */
export function nonPoolingNote(archive) {
  const c = archive.manifest.env_coverage;
  return c && c.note ? c.note : null;
}

/**
 * Does this cohort cross a source boundary? The one that matters is 2022 -> 2023, where the
 * SST under `sst_c` stops being an observation and becomes a climatological normal.
 *
 * @returns {string|null} the warning, or null when the cohort sits inside one source.
 */
export function eraWarning(lens) {
  if (!lens || lens.sources.length < 2) return null;
  const names = lens.sources.map((s) => s.source);
  const climatological = names.includes("ships_dev+csst");
  const inferred = names.includes("ships_rt");
  const parts = [
    `This cohort's environment comes from ${names.length} sources — ${names.join(", ")} — which `
    + "are sequential eras, not alternatives. They are reported separately below and are never "
    + "combined into one distribution.",
  ];
  if (climatological) {
    parts.push("ships_dev+csst carries a CLIMATOLOGICAL sea-surface temperature: a normal for "
      + "that place and date, not an observation of that day. Its sst_c does not mean the same "
      + "thing as ships_dev's, so the two must not be averaged or differenced.");
  }
  if (inferred) {
    parts.push("ships_rt is drawn from the operational SHIPS files rather than the "
      + "developmental archive, and its GPI vorticity decade was INFERRED from the "
      + "distribution rather than read from a published unit — evidenced, not calibrated.");
  }
  return parts.join(" ");
}
