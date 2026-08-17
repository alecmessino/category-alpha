#!/usr/bin/env node
/* Identity check for the reachesHurricaneP extraction.
 *
 * A backtest running against a parallel replica of the estimator is worse than no backtest:
 * the two drift, and the score validates a model that is no longer the one being traded. So
 * the function is MOVED, not copied, and this proves the move changed nothing.
 *
 * Protocol: 100 historical cycles are pushed through the golden fixture — outputs captured
 * from the pre-extraction code — and through the shared module. Every delta must be exactly
 * zero. Not "within tolerance": zero. A pure move that shifts a probability by 1e-16 is not
 * a pure move.
 *
 *   node scripts/verify-extraction.mjs --capture   # write the fixture from fetch-data.mjs
 *   node scripts/verify-extraction.mjs             # compare estimator-core against it
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dir, "fixtures/estimator-identity.json");
const CAPTURE = process.argv.includes("--capture");

/* 100 cycles spanning the paths that actually differ: below threshold, already at it,
   every lead time in the MAE table, and all three guidance positions including absent.
   Deterministic and seeded by index, so the fixture is reproducible. */
function cases() {
  const out = [];
  const hrs = [0, 12, 24, 36, 48, 72, 96, 120];
  const positions = [null, "above", "below", "with"];
  let i = 0;
  for (const hr of hrs) {
    for (const peak of [30, 40, 45, 50, 55, 60, 62, 65, 70, 80, 85, 100, 120]) {
      const pos = positions[i % positions.length];
      const current = Math.max(20, peak - 10 - (i % 15));
      out.push({
        id: `hr${hr}-peak${peak}-${pos || "none"}`,
        points: [{ hr: 0, kt: current, initial: true }, { hr, kt: peak }],
        guidance: pos ? { position: pos, quote: "fixture" } : null,
      });
      if (++i >= 100) return out;
    }
  }
  return out;
}

function runAll(fn) {
  return cases().map((c) => {
    let r = null, err = null;
    try { r = fn(c.points, null, c.guidance); } catch (e) { err = String(e.message); }
    return {
      id: c.id,
      err,
      /* Full precision. Rounding here would hide exactly the drift this exists to catch. */
      p: r ? r.p : null,
      raw: r ? r.raw : null,
      pLow: r ? r.pLow : null,
      pHigh: r ? r.pHigh : null,
      sigma: r ? r.sigma : null,
      mae: r ? r.mae : null,
      peakKt: r ? r.peakKt : null,
      peakHr: r ? r.peakHr : null,
      already: r ? r.already : null,
      shiftKt: r && r.adjustment ? r.adjustment.shiftKt : null,
      basis: r ? r.basis : null,
    };
  });
}

if (CAPTURE) {
  const legacy = await import("./fetch-data.mjs");
  if (typeof legacy.reachesHurricaneP !== "function") {
    console.error("fetch-data.mjs does not export reachesHurricaneP — capture before extracting");
    process.exit(1);
  }
  const rows = runAll(legacy.reachesHurricaneP);
  await writeFile(FIXTURE, JSON.stringify({
    schema: "millibar-estimator-identity/1",
    note: "outputs captured from scripts/fetch-data.mjs BEFORE reachesHurricaneP was moved."
        + " Regenerating this file defeats its purpose — it is the pre-move record.",
    cases: rows.length,
    rows,
  }, null, 2) + "\n");
  console.log(`captured ${rows.length} case(s) -> scripts/fixtures/estimator-identity.json`);
  process.exit(0);
}

const golden = JSON.parse(await readFile(FIXTURE, "utf8"));
const core = await import("./lib/estimator-core.mjs");
if (typeof core.reachesHurricaneP !== "function") {
  console.error("estimator-core.mjs does not export reachesHurricaneP");
  process.exit(1);
}
const now = runAll(core.reachesHurricaneP);

let diffs = 0, checked = 0;
const FIELDS = ["p", "raw", "pLow", "pHigh", "sigma", "mae", "peakKt", "peakHr", "already", "shiftKt", "basis", "err"];
for (let i = 0; i < golden.rows.length; i++) {
  const a = golden.rows[i], b = now[i];
  if (!b || a.id !== b.id) { console.log(`  MISMATCHED CASE at ${i}: ${a.id} vs ${b && b.id}`); diffs++; continue; }
  for (const f of FIELDS) {
    checked++;
    const x = a[f], y = b[f];
    /* Exact equality, with the two exceptions JSON forces and nothing else.
       -0: the estimator returns -0 for shiftKt when sign is -1 and mae is 0, and JSON has
       no -0 — it serialises to 0, so the fixture reloads as +0. Object.is would call that
       drift; it is numerically identical and === says so.
       NaN: never produced here, but Object.is(NaN,NaN) is true while === is false, so it
       is handled rather than left to flip the verdict if it ever appears.
       This is NOT a tolerance. Every other difference, down to the last bit, still fails. */
    const same = (typeof x === "number" && typeof y === "number")
      ? (x === y || (Number.isNaN(x) && Number.isNaN(y)))
      : x === y;
    if (!same) {
      diffs++;
      console.log(`  DELTA ${a.id}.${f}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`
        + (typeof x === "number" && typeof y === "number" ? `  (${(y - x).toExponential()})` : ""));
    }
  }
}

console.log(`\n${golden.rows.length} case(s), ${checked} field comparison(s)`);
if (diffs) {
  console.log(`${diffs} DELTA(S) — the move was not pure. The backtest cannot be trusted until this is zero.\n`);
  process.exit(1);
}
console.log("delta 0.00000000 across every field — the extraction is a pure move\n");
