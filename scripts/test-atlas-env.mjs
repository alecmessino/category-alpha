#!/usr/bin/env node
/* The environment, as a lens rather than a filter -- and the boundary it must not paper over.
 *
 * Phase 3.5 exposes the environmental feature store without letting anyone condition on it. The
 * reason is coverage, and coverage is the thing this gate measures rather than assumes: if a
 * rebuild ever extends the record far enough to support conditioning, these numbers move and
 * this test should be re-measured, not relaxed.
 *
 * The load-bearing check is [3]. The three sources are sequential ERAS, and `ships_dev+csst`
 * substitutes a CLIMATOLOGICAL sea-surface temperature for an observed one -- so a cohort
 * spanning 2022 into 2023 crosses a boundary where the DEFINITION of sst_c changes underneath
 * it. Averaging across that would produce a number with no single meaning. There must be no
 * code path that does, and the surface must say the boundary was crossed.
 *
 * Run: node scripts/test-atlas-env.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openArchive, readPack } from "../docs/storm-atlas/src/engine/node-io.js";
import { Archive } from "../docs/storm-atlas/src/engine/archive.js";
import { cohortResult } from "../docs/storm-atlas/src/engine/cohort.js";
import {
  LENS_FIELDS, envAtGenesis, envCoverage, eraWarning, nonPoolingNote,
} from "../docs/storm-atlas/src/engine/env.js";
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

const DIR = join(ROOT, "docs/storm-atlas/data");
const archive = await openArchive(DIR);

head("[1] coverage costs nothing — it is answered from the core pack alone");
{
  /* The 991 KB environment block must NOT be needed to say "these storms cannot be evaluated".
     If it were, the honest refusal would cost a megabyte and the surface would be tempted to
     skip it on first paint. Proven by building an archive with no environment attached. */
  const manifest = JSON.parse(readFileSync(`${DIR}/atlas-manifest.json`, "utf8"));
  const bare = new Archive(manifest, await readPack(`${DIR}/atlas-core-v1.bin.gz`),
    await readPack(`${DIR}/atlas-tracks-v1.bin.gz`));
  ok(bare.env === null, "the environment pack is not attached");

  const r = cohortResult(bare, { seasonFrom: 1990, seasonTo: 2000 });
  const cov = envCoverage(bare, r.rows);
  ok(cov.evaluable > 0 && cov.notEvaluable > 0,
    "coverage still answers both halves", JSON.stringify(cov));
  ok(cov.evaluable + cov.notEvaluable === cov.n, "and they add up to the cohort");
  ok(cov.windowHours === 12, "the window is the archive's, not this surface's", cov.windowHours);
  ok(envAtGenesis(bare, r.rows) === null,
    "while the distributions refuse rather than returning a partial answer");
}

head("[2] a cohort the record does not reach");
{
  const r = cohortResult(archive, { seasonTo: 1970 });
  const cov = envCoverage(archive, r.rows);
  ok(cov.n > 1000, "the cohort is large", cov.n);
  ok(cov.evaluable === 0, "and not one storm of it can be evaluated", cov.evaluable);
  ok(cov.notEvaluable === cov.n, "every one is NOT EVALUABLE, not zero-valued");
  ok(cov.earliest === null && cov.latest === null,
    "and no era is claimed for a cohort with no records");
  const lens = envAtGenesis(archive, r.rows);
  ok(lens.sources.length === 0, "the lens holds no sources rather than empty ones",
    lens.sources.length);
}

head("[3] the 2022 → 2023 boundary, where sst_c changes meaning underneath the cohort");
{
  const r = cohortResult(archive, { seasonFrom: 2022, seasonTo: 2023 });
  const cov = envCoverage(archive, r.rows);
  const lens = envAtGenesis(archive, r.rows);

  ok(cov.n === 81 && cov.evaluable === 72 && cov.notEvaluable === 9,
    "coverage is stated per cohort: 72 of 81 evaluable, 9 not",
    JSON.stringify(cov));
  ok(cov.earliest === 2022 && cov.latest === 2023, "with the era the records span");

  const names = lens.sources.map((s) => s.source);
  ok(names.length === 2 && names[0] === "ships_dev" && names[1] === "ships_dev+csst",
    "two sources, in time order", names.join(","));
  ok(lens.sources[0].storms === 33 && lens.sources[1].storms === 39,
    "each with its own storm count", lens.sources.map((s) => s.storms).join(","));
  ok(lens.sources[0].storms + lens.sources[1].storms === cov.evaluable,
    "and together they account for every evaluable storm");

  /* THE ERAS DO NOT OVERLAP, which is what makes them eras rather than alternatives. */
  ok(lens.sources[0].last < lens.sources[1].first,
    "the sources do not overlap in time",
    `${day(lens.sources[0].last)} then ${day(lens.sources[1].first)}`);

  /* THE WARNING MUST FIRE, and must name the climatological substitution specifically -- "two
     sources" alone would not tell a reader that one of the columns changed definition. */
  const w = eraWarning(lens);
  ok(!!w, "the boundary crossing is reported");
  ok(/CLIMATOLOGICAL/.test(w), "and names the climatological sea-surface temperature", w);
  ok(/not an observation of that day/.test(w), "and says what that means");
  ok(/must not be averaged or differenced/.test(w), "and forbids the operation it invites");
  ok(/never combined into one distribution/.test(w), "and states that they are not pooled");

  /* NO POOLED STATISTIC EXISTS TO RENDER. Not "the UI declines to show one" -- there is no
     aggregate anywhere in the returned object, so a future surface cannot reach for one by
     accident. */
  ok(!("fields" in lens) && !("median" in lens) && !("all" in lens),
    "the lens holds no pooled block at all", Object.keys(lens).join(","));
  const sstMedians = lens.sources.map((s) => s.fields.sst_c.median);
  ok(sstMedians[0] !== sstMedians[1],
    "and the two sources' sst_c medians genuinely differ, which is why",
    sstMedians.map((x) => x.toFixed(2)).join(" vs "));

  // A single-source cohort must NOT be warned; a warning that always fires is not a warning.
  const inside = envAtGenesis(archive, cohortResult(archive, { seasonFrom: 1990, seasonTo: 2000 }).rows);
  ok(inside.sources.length === 1, "a cohort inside one era draws on one source");
  ok(eraWarning(inside) === null, "and is not warned about a boundary it does not cross");
}

head("[4] every quantile carries its own n");
{
  const r = cohortResult(archive, { seasonFrom: 2000, seasonTo: 2010 });
  const lens = envAtGenesis(archive, r.rows);
  for (const s of lens.sources) {
    for (const f of LENS_FIELDS) {
      const d = s.fields[f.key];
      ok(d.n <= s.storms,
        `${s.source} · ${f.key}: n is the storms with a value, never the source's total`,
        `${d.n} of ${s.storms}`);
      if (d.n === 0) {
        ok(d.median === null, `  and an empty field is null, not zero`);
      } else {
        ok(d.p25 <= d.median && d.median <= d.p75, `  and the quantiles are ordered`,
          `${d.p25} ${d.median} ${d.p75}`);
      }
    }
  }
}

head("[5] the non-pooling statement comes from the archive, not from the interface");
{
  const note = nonPoolingNote(archive);
  ok(!!note, "the pack carries it");
  ok(/must not be pooled/.test(note), "and it says so", note);
  ok(/CLIMATOLOGICAL/.test(note), "and names the substitution");
  const packer = readFileSync(join(ROOT, "scripts/genesis/build/build_atlas_pack.py"), "utf8");
  ok(packer.includes("must not be pooled"),
    "and the words are written in the packer, not in the browser");
}

function day(t) { return new Date(t * 60000).toISOString().slice(0, 10); }

console.log(failed
  ? `\n${failed} of ${checks} environment check(s) failed\n`
  : `\n${checks} checks: a lens, per source, never pooled\n`);
process.exit(failed ? 1 : 0);
