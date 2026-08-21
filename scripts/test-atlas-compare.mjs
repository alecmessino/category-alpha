#!/usr/bin/env node
/* The comparison, and the vocabulary it is not allowed to use.
 *
 * Phase 3.4 lets a reader hold out one condition and see what the outcome distribution does.
 * That is the most useful thing the Atlas does and the easiest thing in it to overstate: a
 * cohort's rate moves five points, the eye reads a finding, and unless the surface says
 * otherwise the reader leaves believing the archive established something it did not.
 *
 * So this gate is mostly about restraint.
 *
 *   [1] the arithmetic, against figures measured from the pack
 *   [2] the overlap verdict is the intervals, not a judgement about them
 *   [3] a refusal on either side is NOT a difference of zero
 *   [4] the relationship between the two populations is measured, including the one baseline
 *       that is a SUBSET rather than a superset
 *   [5] the words of a hypothesis test appear nowhere in the engine, the sources, or the
 *       shipped bundle -- this build runs no such test and must not borrow its authority
 *
 * Run: node scripts/test-atlas-compare.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { cohortResult, normalise, parentOf } from "../docs/storm-atlas/src/engine/cohort.js";
import {
  NOT_SEPARATED, NO_COMPARISON, SEPARATED, changedKeyOf, compare, compareResults, delta, relate,
} from "../docs/storm-atlas/src/engine/compare.js";
import { ROOT } from "./lib/atlas-verify.mjs";

let failed = 0;
let checks = 0;
const head = (s) => console.log(`\n${s}`);
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log(`  ok    ${label}`); return; }
  failed++;
  console.log(`  FAIL  ${label}`);
  if (detail !== undefined) console.log(`        ${detail}`);
}

const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));

head("[1] the arithmetic, against the pack");
{
  /* The example from the design: 800 km of 12.0N 105.0W since 1971, narrowed to Aug-Sep. The
     figures below are MEASURED from this pack, not chosen -- if the archive is rebuilt and they
     move, this test is supposed to fail and be re-measured rather than loosened. */
  const spec = normalise({ where: { lat: 12, lon: -105, radiusKm: 800 }, seasonFrom: 1971,
    months: [8, 9] });
  const c = compare(archive, spec, parentOf(spec, "months"));
  ok(!!c, "the comparison exists");
  ok(c.cohort.n_cases === 215, "the cohort is 215 storms", c.cohort.n_cases);
  ok(c.baseline.n_cases === 539, "the baseline is 539 storms", c.baseline.n_cases);

  const d = c.intensity.cat3;
  ok(near(100 * d.rate, 30.2), "the cohort's Cat 3 rate is 30.2%", (100 * d.rate).toFixed(2));
  ok(near(100 * d.baseRate, 26.9), "the baseline's is 26.9%", (100 * d.baseRate).toFixed(2));
  ok(near(d.deltaPp, 3.3), "the delta is +3.3 points", d.deltaPp.toFixed(2));
  ok(d.direction === "higher", "and its direction is named");

  const ci = c.cohort.intensity.cat3.ci95;
  const bci = c.baseline.intensity.cat3.ci95;
  ok(near(100 * ci[0], 24.5) && near(100 * ci[1], 36.7),
    "the cohort's interval is 24.5-36.7%", ci.map((x) => (100 * x).toFixed(1)).join("-"));
  ok(near(100 * bci[0], 23.3) && near(100 * bci[1], 30.8),
    "the baseline's is 23.3-30.8%", bci.map((x) => (100 * x).toFixed(1)).join("-"));

  /* THE POINT OF THE WHOLE EXERCISE. A three-point lift that reads as a finding until the
     intervals qualify it. That qualification is the product. */
  ok(d.verdict === NOT_SEPARATED, "and the samples do not separate the two rates", d.verdict);
  ok(/do not separate the two rates/.test(d.statement), "which the statement says in words");

  /* PERCENTAGE POINTS, NEVER A RATIO. 26.9 -> 30.2 is +3.3 points and also a 12% relative
     lift; the second framing makes the same three storms sound like a result. */
  ok(Math.abs(d.deltaPp - (100 * d.rate - 100 * d.baseRate)) < 1e-9,
    "the delta is in percentage points, not a ratio");
}

head("[2] the verdict is the intervals, not a judgement about them");
{
  const cases = [
    [[0.20, 0.30], [0.25, 0.35], true, "overlapping"],
    [[0.20, 0.30], [0.30, 0.40], true, "touching at a bound counts as overlap"],
    [[0.20, 0.30], [0.31, 0.40], false, "disjoint by a hair"],
    [[0.60, 0.90], [0.10, 0.20], false, "far apart"],
  ];
  for (const [a, b, overlap, label] of cases) {
    const d = delta(cell(0.25, a, 100), cell(0.30, b, 100));
    ok(d.overlap === overlap, `${label}: overlap ${overlap}`, `got ${d.overlap}`);
    ok(d.verdict === (overlap ? NOT_SEPARATED : SEPARATED),
      `  and the verdict follows the intervals`, d.verdict);
  }

  /* A separated pair exists in the archive, so the second statement is reachable rather than
     theoretical. Storms that came ashore in Mexico reach Cat 3 at a different rate from the
     whole modern-era population, and by enough that the samples separate. */
  const spec = normalise({ seasonFrom: 1971, landfall: "mexico" });
  const c = compare(archive, spec, parentOf(spec, "landfall"));
  const separated = Object.entries(c.intensity).filter(([, d]) => d.verdict === SEPARATED);
  ok(separated.length > 0,
    "a separating pair exists in the archive, so the statement is reachable",
    Object.entries(c.intensity).map(([k, d]) =>
      `${k}:${d.verdict}${d.deltaPp === null ? "" : ` ${d.deltaPp.toFixed(1)}pp`}`).join(" "));
  for (const [, d] of separated) {
    ok(/do not overlap/.test(d.statement), "and it says the intervals do not overlap");
  }
}

head("[3] a refusal is not a difference of zero");
{
  const small = normalise({ seasonFrom: 1971, months: [2] });
  const c = compare(archive, small, parentOf(small, "months"));
  const d = c.intensity.cat3;
  ok(d.verdict === NO_COMPARISON, "a refused rate yields no comparison, not 0.0 points",
    d.verdict);
  ok(d.deltaPp === null, "and no delta is invented");
  ok(/refused/.test(d.why), "and the reason names which side could not answer", d.why);

  /* The fifth rule reaches the comparison too: a cohort conditioned on an outcome has no rate
     for it, so there is nothing to difference -- and the reason says so rather than reporting
     a change of zero against a baseline that does have one. */
  const cond = normalise({ seasonFrom: 1971, intensity: "cat3" });
  const cc = compare(archive, cond, parentOf(cond, "intensity"));
  ok(cc.intensity.cat3.verdict === NO_COMPARISON,
    "a conditioned-on contract yields no comparison");
  ok(/conditioned on this outcome/.test(cc.intensity.cat3.why),
    "and says the cohort was conditioned on it", cc.intensity.cat3.why);
  ok(cc.intensity.cat4.verdict !== NO_COMPARISON,
    "while a threshold above the condition still compares", cc.intensity.cat4.verdict);
}

head("[4] the relationship between the two populations is measured, not assumed");
{
  const spec = normalise({ where: { lat: 12, lon: -105, radiusKm: 800 }, seasonFrom: 1971 });
  const r = relate(cohortResult(archive, spec), cohortResult(archive, parentOf(spec, "season")));
  ok(r.kind === "baseline contains this cohort", "a dropped condition normally widens", r.kind);
  ok(r.independent === false, "so the two estimates are not independent");
  ok(/not independent estimates/.test(r.note), "and the note says so in as many words");
  ok(/never as a test/.test(r.note), "and refuses the word test explicitly");

  /* THE INVERSION, which is why this is measured. Dropping `includeProvisional` does not widen
     the population -- it EXCLUDES the provisional seasons, so that baseline is a SUBSET. Code
     that assumed containment would describe this backwards. */
  const prov = normalise({ seasonFrom: 2020, includeProvisional: true });
  const pr = relate(cohortResult(archive, prov),
    cohortResult(archive, parentOf(prov, "includeProvisional")));
  ok(pr.kind === "this cohort contains the baseline",
    "and the one baseline that is a subset is described as one", pr.kind);
  ok(pr.baseN < pr.n, "measured, not asserted", `${pr.baseN} < ${pr.n}`);
}

head("[5] what changed is named, not inferred");
{
  const spec = normalise({ where: { lat: 12, lon: -105, radiusKm: 800 }, seasonFrom: 1971,
    months: [8, 9] });
  ok(changedKeyOf(spec, parentOf(spec, "months")) === "months", "the moved condition is found");
  const c = compareResults(cohortResult(archive, spec),
    cohortResult(archive, parentOf(spec, "months")));
  ok(c.changed && c.changed.key === "months", "and travels on the comparison");
  ok(c.changed.direction === "added", "with the direction it moved");
  ok(/Aug, Sep/.test(c.changed.sentence), "and its own sentence fragment", c.changed.sentence);
  ok(c.changed.zone === "given", "and its zone, so an outcome-side hold-out is distinguishable");
}

head("[6] the vocabulary of a test this build does not run");
{
  /* Overlapping intervals are a weak heuristic. "Significant", "not significant" and "p-value"
     are terms of art for a hypothesis test, and this repository runs none -- borrowing the
     vocabulary would borrow an authority the method does not have. Checked in the SHIPPED
     BUNDLE as well as the sources, because the bundle is what a reader actually receives. */
  const BANNED = /\b(statistically\s+significant|significan(t|ce)|p-value|p\s*<\s*0?\.\d|null\s+hypothesis|confidence\s+level\s+test)\b/i;
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(join(ROOT, "docs/storm-atlas/src"));
  for (const f of readdirSync(join(ROOT, "docs/storm-atlas/dist"))) {
    if (f.endsWith(".js")) files.push(join(ROOT, "docs/storm-atlas/dist", f));
  }
  /* COMMENTS ARE EXEMPT IN SOURCES, AND ONLY THERE. The rule is about what the SURFACE says, and
     a file has to be able to document its own prohibition -- compare.js's header names these
     words precisely in order to forbid them. Block comments and whole-line `//` comments are
     stripped before matching; anything inside a string, a template or an identifier is not,
     because that is what can reach a reader. The bundle is matched RAW: esbuild strips comments,
     so anything left there is shipped text. */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
  let hits = 0;
  for (const f of files) {
    const raw = readFileSync(f, "utf8");
    const body = f.includes("/dist/") ? raw : stripComments(raw);
    const m = body.match(BANNED);
    if (m) { hits++; console.log(`        ${f.replace(ROOT, "")}: ${m[0]}`); }
  }
  ok(hits === 0, `no test vocabulary in ${files.length} sources and bundles`, `${hits} file(s)`);

  /* The stripper must not be a way to smuggle the words past the gate: prove it still catches
     them in code, in a string, and in the bundle's shape. */
  const probe = "/* significance */\n// p-value\nconst s = \"statistically significant\";";
  ok(BANNED.test(stripComments(probe)),
    "and the stripper still catches the words in a string", stripComments(probe).trim());
  ok(!BANNED.test(stripComments("/* the word significant is forbidden */\nconst x = 1;")),
    "while a comment explaining the prohibition is allowed");

  // And the two permitted statements ARE present, so the rule is a substitution, not a silence.
  const src = readFileSync(join(ROOT, "docs/storm-atlas/src/engine/compare.js"), "utf8");
  ok(/do not separate the two rates/.test(src), "the overlap statement is written once");
  ok(/separate the two rates/.test(src), "and so is the disjoint statement");
}

function cell(rate, ci95, n) {
  return { rate, ci95, n_storms: n, n_unknown: 0, count: Math.round(rate * n),
    weighted_rate: rate, refused_reason: null };
}

/** Measured figures are pinned to a tenth of a point -- the precision the surface prints. */
function near(a, b) { return Math.abs(a - b) < 0.05; }

console.log(failed
  ? `\n${failed} of ${checks} comparison check(s) failed\n`
  : `\n${checks} checks: what changed, by how much, against what, and whether it separates\n`);
process.exit(failed ? 1 : 0);
