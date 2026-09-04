#!/usr/bin/env node
/* DOES THE REPLAY URL REOPEN THE COHORT IT CLAIMS?
 *
 * "The cohort is a URL" is the load-bearing claim of this package: a counterparty who cannot
 * reproduce the numbers has been given a picture of evidence rather than evidence. So every URL
 * printed on an artifact is parsed back through the Atlas's own parseQuery, re-executed through
 * cohortResult, and the result compared FIGURE BY FIGURE against the manifest row the artifact
 * printed -- counts, denominators, rates, Wilson bounds, refusal strings and every status stamp.
 *
 * A URL that round-trips to a DIFFERENT cohort is the worst failure this package can have,
 * because it looks correct from both ends: the artifact shows a real number and the link opens a
 * real cohort. Only comparing them catches it.
 *
 * Run: node scripts/check-collateral-replay.mjs
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { cohortResult, parseQuery, sameCohort } from "../docs/storm-atlas/src/engine/cohort.js";
import { ROOT } from "./lib/atlas-verify.mjs";
import { CONTRACT_REGIONS } from "./lib/collateral-data.mjs";

const M = JSON.parse(readFileSync(join(ROOT, "docs/collateral/source-manifest.json"), "utf8"));
const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));

let failed = 0;
let checks = 0;
const ok = (cond, label, detail) => {
  checks++;
  if (cond) return true;
  failed++;
  console.log(`  FAIL  ${label}` + (detail ? `\n        ${detail}` : ""));
  return false;
};

for (const sy of M.systems) {
  console.log(`\n${sy.id} — ${sy.replay_url}`);
  const q = sy.replay_url.split("?")[1] || "";
  const { spec, versionMismatch } = parseQuery(q);

  ok(versionMismatch === null, "spec version round-trips",
    `URL declares v=${versionMismatch}, this build is v1`);
  ok(sameCohort(spec, sy.spec), "the URL means the identical cohort",
    `parsed ${JSON.stringify(spec)}\n        printed ${JSON.stringify(sy.spec)}`);

  const r = cohortResult(archive, spec, { regions: CONTRACT_REGIONS });
  ok(r.n_cases === sy.cohort.n_cases, `N re-executes to ${sy.cohort.n_cases}`,
    `got ${r.n_cases}`);
  ok(r.sufficient === sy.cohort.sufficient, "sufficiency re-executes");

  let rowFails = 0;
  const cmp = (printed, live, where) => {
    if (printed.count !== live.count || printed.n_storms !== live.n_storms) {
      rowFails++; console.log(`        ${where}: count ${printed.count}/${printed.n_storms} vs replay ${live.count}/${live.n_storms}`);
      return;
    }
    if ((printed.rate === null) !== (live.rate === null)) {
      rowFails++; console.log(`        ${where}: rate presence differs`); return;
    }
    if (printed.rate !== null && Math.abs(printed.rate - live.rate) > 1e-12) {
      rowFails++; console.log(`        ${where}: rate ${printed.rate} vs ${live.rate}`); return;
    }
    if (printed.ci95 && live.ci95
      && (Math.abs(printed.ci95[0] - live.ci95[0]) > 1e-12
        || Math.abs(printed.ci95[1] - live.ci95[1]) > 1e-12)) {
      rowFails++; console.log(`        ${where}: interval differs`); return;
    }
    if ((printed.refused_reason || null) !== (live.refused_reason || null)) {
      rowFails++; console.log(`        ${where}: refusal string differs`);
    }
  };
  for (const row of sy.intensity_rows) cmp(row, r.intensity[row.key], row.key);
  for (const row of sy.landfall_rows) {
    const [region, kind] = row.key.split(":");
    cmp(row, r.landfall[region][kind === "hurricane" ? "hurricane" : "any"], row.key);
  }
  ok(rowFails === 0, `all ${sy.intensity_rows.length + sy.landfall_rows.length} contract rows re-execute identically`);

  const printedStamps = JSON.stringify(Object.fromEntries(
    Object.entries(sy.unscoreable).map(([k, v]) => [k, v.status])));
  const liveStamps = JSON.stringify(Object.fromEntries(
    Object.entries(r.unscoreable).map(([k, v]) => [k, v.status])));
  ok(printedStamps === liveStamps, "every unscoreable stamp re-executes identically",
    `printed ${printedStamps}\n        replay ${liveStamps}`);

  ok(JSON.stringify(sy.gaps) === JSON.stringify(r.gaps), "reported gaps re-execute identically");
}

console.log(`\n${checks - failed} / ${checks} checks passed`);
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
