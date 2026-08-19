#!/usr/bin/env node
/* One methodology, two execution surfaces -- and this is the proof.
 *
 * docs/GENESIS-ARCHIVE.md states the rule that made the terminal's Analog Prior trustworthy:
 * "Nothing is recomputed in the browser, so there is no second implementation of any rate to
 * drift from this one." The Storm Atlas cannot honour that literally. A click anywhere on the
 * ocean, at any radius, over any month range, is not a question a precomputed payload can
 * answer, so the Atlas transliterates scripts/genesis/retrieval/analogs.py into JavaScript and
 * runs it in the browser.
 *
 * That is only safe while the two provably agree, and this is the gate that makes it provable.
 * 42 query vectors -- dense pools, empty pools, pools below the sample gate, both sides of the
 * antimeridian, the zero-peek cutoff, the environment exclusion in both directions, and the
 * subbasin distinction that keeps Iniki in a Hawaii query -- are answered by the Python and
 * then by the browser's engine, and compared field by field.
 *
 * EXACT WHERE EXACT IS POSSIBLE, WHICH IS ALMOST EVERYWHERE.
 * The matched storm set and its order, every count, every gap string, the sample gate, the
 * pathway-density cells and every archive value carried through untouched are compared for
 * EXACT equality. No tolerance, no rounding.
 *
 * TOLERANCE ONLY WHERE THE PLATFORM MAKES IT UNAVOIDABLE.
 * The distance and the weights go through exp(), sin(), cos() and asin(). IEEE-754 does not
 * specify those: CPython calls the platform libm, V8 calls its own fdlibm port, and the two may
 * differ in the last bit. So those five quantities are compared to a relative tolerance -- and
 * this script REPORTS THE DEVIATION IT ACTUALLY MEASURED, because a bound nobody has looked at
 * is not a check, it is a decoration.
 *
 * Run: node scripts/test-atlas-parity.mjs
 */
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { getAnalogs } from "../docs/storm-atlas/src/engine/analogs.js";
import { ensureVerification, ROOT } from "./lib/atlas-verify.mjs";

/* Four orders of magnitude beyond a one-ULP libm difference amplified through a Gaussian, and
   twelve orders tighter than anything that could move a number on screen. If a real divergence
   ever appears it will be enormous compared with this, not marginal. */
const FLOAT_TOLERANCE = 1e-9;

/* The quantities that pass through a transcendental function on their way out. Everything not
   named here is compared exactly. */
const TOLERANCE_FIELDS = new Set([
  "distance_km", "weight", "weight_distance", "weight_env", "effective_sample_size",
]);

let failures = 0;
let checks = 0;
let worst = { field: null, rel: 0, label: null, got: null, want: null };

const fail = (label, detail) => {
  failures++;
  if (failures <= 40) console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
  else if (failures === 41) console.log("  ... further failures suppressed");
};

function exact(label, got, want) {
  checks++;
  if (Object.is(got, want)) return true;
  // JSON has no -0, and null/undefined mean the same absence on both sides.
  if (got === 0 && want === 0) return true;
  if ((got === null || got === undefined) && (want === null || want === undefined)) return true;
  fail(label, `browser ${JSON.stringify(got)} | archive ${JSON.stringify(want)}`);
  return false;
}

function near(label, got, want, vecLabel) {
  checks++;
  if (got === null || want === null) return exact(label, got, want);
  const rel = want === 0 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
  if (rel > worst.rel) worst = { field: label.split(" ").pop(), rel, label: vecLabel, got, want };
  if (rel <= FLOAT_TOLERANCE) return true;
  fail(label, `browser ${got} | archive ${want} | relative ${rel.toExponential(3)} ` +
              `> ${FLOAT_TOLERANCE.toExponential(0)}`);
  return false;
}

/* Timestamps are compared as INSTANTS, not as strings.
 *
 * The two runtimes spell the same moment differently and neither spelling is wrong: Python's
 * datetime.isoformat() gives "2015-09-25T00:00:00+00:00", str(datetime) gives
 * "1959-08-07 06:00:00+00:00", and JS toISOString() gives "2015-09-25T00:00:00.000Z". Failing on
 * that would be a test asserting a formatting convention while claiming to assert parity. What
 * has to agree is the instant, and that is compared exactly -- to the millisecond, no tolerance.
 */
function instant(label, got, want) {
  checks++;
  if ((got === null || got === undefined) && (want === null || want === undefined)) return true;
  const a = parseInstant(got);
  const b = parseInstant(want);
  if (a !== null && a === b) return true;
  fail(label, `browser ${JSON.stringify(got)} (${a}) | archive ${JSON.stringify(want)} (${b})`);
  return false;
}

function parseInstant(v) {
  if (v === null || v === undefined) return null;
  const ms = Date.parse(String(v).replace(" ", "T"));
  return Number.isNaN(ms) ? null : ms;
}

function compareCase(vecLabel, i, got, want) {
  const at = `${vecLabel} · case ${i} (${want.storm_id})`;
  exact(`${at} storm_id`, got.storm_id, want.storm_id);
  for (const f of ["name", "season", "basin", "subbasin", "genesis_lat",
                   "genesis_lon", "genesis_month", "env_fields_compared", "peak_vmax_kt",
                   "max_category", "hours_to_ts", "hours_to_cat1", "hours_to_cat3"]) {
    exact(`${at} ${f}`, got[f], want[f]);
  }
  instant(`${at} genesis_utc`, got.genesis_utc, want.genesis_utc);
  for (const f of ["distance_km", "weight", "weight_distance", "weight_env"]) {
    near(`${at} ${f}`, got[f], want[f], vecLabel);
  }
  /* Landfalls are compared as a MULTISET, matched on the instant, and then the browser's own
     ordering property is asserted separately.
     Two different orders are in play and neither is a defect. The archive stores landfalls in
     the order its detection passes produced them -- every HURDAT2 'L' record, then every
     geometry crossing -- so one storm's landfalls interleave two passes and read out of
     sequence. The pack sorts each storm's landfalls chronologically, because a reader looking
     at a track wants them in the order they happened. That changes no value, only sequence, so
     comparing position-by-position would fail on a deliberate improvement while telling us
     nothing about fidelity. Comparing content by instant tests strictly more: identical
     landfalls AND a stated ordering. */
  exact(`${at} landfall count`, got.landfalls.length, want.landfalls.length);
  const unmatched = [...want.landfalls];
  for (const a of got.landfalls) {
    const ta = parseInstant(a.landfall_utc);
    const k = unmatched.findIndex((b) => parseInstant(b.landfall_utc) === ta &&
      b.region === a.region && b.detection === a.detection);
    if (k < 0) {
      fail(`${at} landfall at ${a.landfall_utc} (${a.region}/${a.detection})`,
        "the browser carries a landfall the archive does not");
      continue;
    }
    const b = unmatched.splice(k, 1)[0];
    for (const f of ["region", "sub_region", "vmax_kt", "category",
                     "hurricane", "detection", "suspect_relocation"]) {
      exact(`${at} landfall@${a.landfall_utc}.${f}`, a[f], b[f]);
    }
  }
  for (const b of unmatched) {
    fail(`${at} landfall at ${b.landfall_utc} (${b.region})`,
      "the archive carries a landfall the browser dropped");
  }
  // The ordering the pack promises, asserted rather than assumed.
  checks++;
  let ordered = true;
  for (let k = 1; k < got.landfalls.length; k++) {
    if (parseInstant(got.landfalls[k].landfall_utc) <
        parseInstant(got.landfalls[k - 1].landfall_utc)) ordered = false;
  }
  if (!ordered) fail(`${at} landfalls are in chronological order`, "they are not");
}

/* kwargs come out of the Python emitter in the Python's own naming. */
function toOpts(kw) {
  const map = {
    lat: "lat", lon: "lon", radius_km: "radiusKm", season_months: "seasonMonths",
    env_vector: "envVector", min_sample: "minSample", as_of: "asOf", basins: "basins",
    subbasins: "subbasins", genesis_subbasins: "genesisSubbasins",
    exclude_storm_ids: "excludeStormIds", include_provisional: "includeProvisional",
    env_require_match: "envRequireMatch", min_pool_season: "minPoolSeason",
    regions: "regions", max_cases: "maxCases", track_density_deg: "trackDensityDeg",
  };
  const out = {};
  for (const [k, v] of Object.entries(kw)) {
    if (!(k in map)) throw new Error(`the emitter passed an option the port does not know: ${k}`);
    out[map[k]] = v;
  }
  return out;
}

const vectors = ensureVerification("parity", "atlas-parity.json");
const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));

console.log(`\n[1] methodology version declared by both surfaces`);
exact("  pack declares the same METHODOLOGY_VERSION as the archive",
  archive.core.header.methodology_version, vectors.methodology_version);
if (archive.core.header.methodology_version !== vectors.methodology_version) {
  console.log("        A methodology change must be a versioned event, not a silent one.");
} else {
  console.log(`  ok    both surfaces are methodology ${vectors.methodology_version}`);
}

console.log(`\n[2] ${vectors.vectors.length} query vectors, answered by both surfaces`);
let totalCases = 0;
for (const v of vectors.vectors) {
  const before = failures;
  const t0 = performance.now();
  const got = getAnalogs(archive, toOpts(v.kwargs));
  const ms = performance.now() - t0;
  const want = v.expect;
  totalCases += want.n_cases;

  exact(`${v.label} · n_cases`, got.n_cases, want.n_cases);
  exact(`${v.label} · sufficient`, got.sufficient, want.sufficient);
  exact(`${v.label} · min_sample`, got.min_sample, want.min_sample);
  exact(`${v.label} · env_unmatched_excluded`, got.env_unmatched_excluded,
    want.env_unmatched_excluded);
  near(`${v.label} · effective_sample_size`, got.effective_sample_size,
    want.effective_sample_size, v.label);

  /* Gaps are compared verbatim and in order. They are the archive's own prose, and a port that
     reworded one would have changed what the screen tells a reader. */
  exact(`${v.label} · gap count`, got.gaps.length, want.gaps.length);
  for (let i = 0; i < Math.max(got.gaps.length, want.gaps.length); i++) {
    exact(`${v.label} · gap[${i}]`, got.gaps[i], want.gaps[i]);
  }

  /* The counting half of the archive's outcome tables. The browser publishes numerators,
     denominators and unknowns; it publishes no rate. Both are checked here -- the counts for
     agreement, and the refusal for presence. */
  for (const [cat, cell] of Object.entries(want.intensity_counts)) {
    const g = got.intensity_counts[cat] || {};
    exact(`${v.label} · intensity[${cat}].count`, g.count, cell.count);
    exact(`${v.label} · intensity[${cat}].n_storms`, g.n_storms, cell.n_storms);
    exact(`${v.label} · intensity[${cat}].n_unknown`, g.n_unknown, cell.n_unknown);
  }
  exact(`${v.label} · reported region count`,
    Object.keys(got.landfall_counts).length, Object.keys(want.landfall_counts).length);
  for (const [region, kinds] of Object.entries(want.landfall_counts)) {
    for (const [kind, cell] of Object.entries(kinds)) {
      const g = (got.landfall_counts[region] || {})[kind] || {};
      exact(`${v.label} · landfall[${region}].${kind}.count`, g.count, cell.count);
      exact(`${v.label} · landfall[${region}].${kind}.n_storms`, g.n_storms, cell.n_storms);
    }
  }
  exact(`${v.label} · unscoreable contract count`,
    Object.keys(got.unscoreable).length, Object.keys(want.unscoreable).length);
  for (const [key, u] of Object.entries(want.unscoreable)) {
    const g = got.unscoreable[key] || {};
    exact(`${v.label} · unscoreable[${key}].archive_events`, g.archive_events, u.archive_events);
    exact(`${v.label} · unscoreable[${key}].status`, g.status, u.status);
    exact(`${v.label} · unscoreable[${key}].reason`, g.reason, u.reason);
  }
  checks++;
  if (!got.rates || !/UNSCOREABLE/.test(got.rates.status)) {
    fail(`${v.label} · the browser declines to publish a conditioned rate`,
      "it returned something instead of the refusal");
  }

  exact(`${v.label} · case count`, got.cases.length, want.cases.length);
  for (let i = 0; i < Math.min(got.cases.length, want.cases.length); i++) {
    compareCase(v.label, i, got.cases[i], want.cases[i]);
  }

  /* Pathway density: same cells, same counts. Key order is not compared -- a Map and a dict
     enumerate in insertion order and the two implementations scan the archive differently --
     but the cell SET and every count must agree exactly. */
  const wantCells = Object.keys(want.track_density);
  exact(`${v.label} · density cell count`, got.track_density.size, wantCells.length);
  let cellMismatch = 0;
  for (const [k, n] of Object.entries(want.track_density)) {
    if (got.track_density.get(k) !== n) cellMismatch++;
  }
  exact(`${v.label} · density cell counts`, cellMismatch, 0);

  if (failures === before) {
    console.log(`  ok    ${v.label}  (n=${want.n_cases}, ${ms.toFixed(1)} ms)`);
  }
}

console.log(`\n[3] what the tolerance was actually needed for`);
if (worst.field === null) {
  console.log("  every compared value agreed bit for bit; the tolerance was never used");
} else {
  console.log(`  worst relative deviation ${worst.rel.toExponential(3)} on ${worst.field}`);
  console.log(`    vector: ${worst.label}`);
  console.log(`    browser ${worst.got}`);
  console.log(`    archive ${worst.want}`);
  console.log(`  the bound is ${FLOAT_TOLERANCE.toExponential(0)}, ` +
    `${(FLOAT_TOLERANCE / Math.max(worst.rel, Number.MIN_VALUE)).toExponential(1)}x the ` +
    `observed worst case`);
}

console.log(`\n${checks.toLocaleString()} comparisons over ${totalCases.toLocaleString()} ` +
  `matched cases in ${vectors.vectors.length} vectors`);
console.log(failures
  ? `${failures} parity failure(s) -- the browser and the archive disagree\n`
  : "the browser computes what the archive computes\n");
process.exit(failures ? 1 : 0);
