#!/usr/bin/env node
/* THE WALL BETWEEN THE OPERATIONAL LAYER AND THE HISTORICAL RESEARCH.
 *
 * The Atlas now shows two records for a current storm: the IBTrACS archive, and the ATCF
 * operational best track. The second is a SELECTED-STORM REPRESENTATION LAYER and nothing else.
 * It must never enter or alter cohort membership, historical analog matching, historical
 * intensity rates, landfall rates, Wilson intervals, effective sample size, calibration,
 * reliability, the archive comparison, an event gate, refusal logic, or zero-peek replay
 * semantics.
 *
 * WHY THIS IS A GATE AND NOT A CONVENTION. The failure it prevents is silent and it is
 * attractive: `scoreCases` takes an untyped array of plain objects and reads `peak_vmax_kt` off
 * each one, so a future live-aware case builder would put an operational wind straight into an
 * intensity rate, a Wilson interval and an ESS with nothing between it and the number on screen.
 * The archive would then publish a rate that is not the archive's, under the archive's name, and
 * every existing test would still pass -- because every existing test asks whether the arithmetic
 * is right, not whose numbers went into it.
 *
 * TWO HALVES, BECAUSE THEY FAIL FOR DIFFERENT REASONS:
 *
 *   [A] THE IMPORT GRAPH. Nothing that computes a historical result may reach engine/live.js,
 *       transitively. This catches the leak the day it is written, in the diff, before anyone
 *       has to reason about whether a particular number moved.
 *
 *   [B] THE OUTPUTS. Every historical result is computed with the live artifact absent and again
 *       with it loaded, and the two are compared field by field. This catches a leak that
 *       arrives some other way -- through a mutated column, a shared cache, a global.
 *
 * Run: node scripts/test-atlas-live-boundary.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs/storm-atlas/src");
const ENGINE = join(SRC, "engine");
const DATA = join(ROOT, "docs/storm-atlas/data");

let failed = 0;
let checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  if (cond) { console.log("  ok    " + label); return; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

/* ---------------------------------------------------------------------------------------
   [A] THE IMPORT GRAPH
   --------------------------------------------------------------------------------------- */

/* EVERY MODULE THAT COMPUTES A HISTORICAL RESULT, NAMED INDIVIDUALLY.
 *
 * A glob would quietly stop covering a module the day someone renamed one, which is the failure
 * this file exists to catch. Each name below is a thing the brief says an operational value must
 * never enter, mapped to the file that decides it. */
const RESEARCH = {
  "engine/query.js": "cohort membership — the filter that decides which storms are in",
  "engine/cohort.js": "cohort results, case building, the sample-sufficiency gate",
  "engine/cohort-membership.js": "why a storm matched, its contribution, the bridge spec",
  "engine/cohort-language.js": "the sentence a cohort is described by",
  "engine/analogs.js": "analog matching, scoring, the refusal statuses, the zero-peek gate",
  "engine/rates.js": "historical intensity and landfall rates, and their intervals",
  "engine/stats.js": "the Wilson interval and the Kish effective sample size",
  "engine/calibration.js": "the calibration ledger and its scope audit",
  "engine/compare.js": "the archive comparison and its three verdicts",
  "engine/preview.js": "what each condition would cost, in storms",
  "engine/timeline.js": "replay ordering over the archive's own instants",
  "engine/env.js": "the environment lens, and its refusal to pool source eras",
  "engine/archive.js": "the archive in memory — the store every one of the above reads",
  "engine/pack.js": "the pack decoder",
};

const LIVE = "engine/live.js";

/** Relative-import edges out of one module. Bare specifiers (react) are not part of this graph. */
async function importsOf(rel) {
  let text;
  try { text = await readFile(join(SRC, rel), "utf8"); }
  catch { return null; }
  const out = [];
  /* Static edges. The `[^;]` is deliberate and the `\n` is NOT excluded: a named-import list
     that spans four lines is the ordinary shape in this codebase, and a regex that stopped at the
     first newline reported the SHELL -- the one file that must import this module -- as not
     importing it. A statement ends at its semicolon. */
  for (const m of text.matchAll(/(?:^|\n)\s*(?:import|export)[^;]*?from\s+["'](\.[^"']+)["']/g)) {
    out.push(normalise(rel, m[1]));
  }
  /* Dynamic imports too: React.lazy(() => import("./x.jsx")) is a real edge. */
  for (const m of text.matchAll(/\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) {
    out.push(normalise(rel, m[1]));
  }
  return out;
}

function normalise(from, spec) {
  const dir = dirname(from);
  const p = resolve("/" + dir, spec).slice(1);
  return p;
}

/** Everything `rel` can reach, transitively. */
async function reachable(rel, seen = new Set()) {
  if (seen.has(rel)) return seen;
  seen.add(rel);
  const edges = await importsOf(rel);
  if (!edges) return seen;
  for (const e of edges) await reachable(e, seen);
  return seen;
}

console.log("\n[A] the import graph — no historical module can reach the operational layer");
{
  const live = await readFile(join(SRC, LIVE), "utf8").then(() => true).catch(() => false);
  ok("engine/live.js exists to be walled off", live);

  for (const [rel, what] of Object.entries(RESEARCH)) {
    const seen = await reachable(rel);
    ok(`${rel} cannot reach the operational layer  (${what})`,
      !seen.has(LIVE),
      `reaches: ${[...seen].filter((x) => x !== rel).join(", ")}`);
  }

  /* AND THE RENDERERS THAT DRAW THE ARCHIVE. The operational track has its own layer; the
     archive's layers must not learn about it, or a single flag would put an operational fix into
     the population the reader is comparing against. */
  const ARCHIVE_LAYERS = ["render/selection-layer.js", "render/replay-layer.js",
    "render/population-layer.js", "render/atlas-layer.js", "render/pathway-layer.js"];
  for (const rel of ARCHIVE_LAYERS) {
    const seen = await reachable(rel);
    ok(`${rel} cannot reach the operational layer`, !seen.has(LIVE),
      [...seen].join(", "));
  }
}

console.log("\n[A2] and only the shell and the panel may import it at all");
{
  /* The permitted importers, named. The shell performs the join; the panel renders it; the
     operational render layer draws the track it produces; node-io is the gates' loader. Anything
     else importing this module is a design change, and it should be a visible one. */
  const ALLOWED = new Set([
    "ui/atlas.jsx",             // the shell — the one place the join happens
    "ui/storm-panel.jsx",       // the inspector — renders the join's result
    "engine/node-io.js",        // Node's loader, for these gates
  ]);
  const files = [];
  const walk = async (dir, prefix) => {
    for (const e of await readdir(join(SRC, dir), { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(dir, e.name), rel);
      else if (/\.(js|jsx)$/.test(e.name)) files.push(rel);
    }
  };
  await walk(".", "");
  const importers = [];
  for (const rel of files) {
    if (rel === LIVE) continue;
    const edges = (await importsOf(rel)) || [];
    if (edges.includes(LIVE)) importers.push(rel);
  }
  ok("every importer of engine/live.js is one of the three permitted",
    importers.every((f) => ALLOWED.has(f)),
    `unexpected: ${importers.filter((f) => !ALLOWED.has(f)).join(", ")}`);
  ok("and the shell is one of them, so the join is actually wired",
    importers.includes("ui/atlas.jsx"), importers.join(", "));
  console.log(`  note  importers: ${importers.join(", ")}`);
}

console.log("\n[A3] no historical entry point accepts an operational argument");
{
  /* A SIGNATURE CHECK, because the import graph does not cover a value passed IN. If none of
     these functions has a parameter that could carry an operational record, there is no call
     site that could hand one over -- which is the second half of the structural wall. */
  const SIGNATURES = [
    ["engine/query.js", "filterStorms"],
    ["engine/cohort.js", "cohortResult"],
    ["engine/analogs.js", "getAnalogs"],
    ["engine/analogs.js", "scoreCases"],
    ["engine/rates.js", "rateResult"],
    ["engine/rates.js", "circularOutcomes"],
    ["engine/stats.js", "wilsonInterval"],
    ["engine/stats.js", "kishEss"],
    ["engine/stats.js", "categoryFor"],
    ["engine/cohort-membership.js", "bridgeSpec"],
    ["engine/cohort-membership.js", "whyMatched"],
    ["engine/compare.js", "compareResults"],
    ["engine/preview.js", "previewCounts"],
    ["engine/env.js", "envCoverage"],
  ];
  const BANNED = /\b(live|operational|atcf|bdeck|b_deck)\b/i;
  for (const [rel, fn] of SIGNATURES) {
    const text = await readFile(join(SRC, rel), "utf8");
    const m = new RegExp(`export\\s+function\\s+${fn}\\s*\\(([^)]*)\\)`).exec(text);
    if (!m) { ok(`${rel}: ${fn} is exported`, false, "not found — has it been renamed?"); continue; }
    ok(`${rel}: ${fn}(${m[1].replace(/\s+/g, " ").trim()}) takes nothing operational`,
      !BANNED.test(m[1]), m[1]);
  }
}

/* ---------------------------------------------------------------------------------------
   [B] THE OUTPUTS
   --------------------------------------------------------------------------------------- */
console.log("\n[B] every historical result is identical with the operational layer loaded");

const { openArchive, openLive } = await import("../docs/storm-atlas/src/engine/node-io.js");
const { cohortResult, normalise: normaliseSpec, sentenceOf } = await import("../docs/storm-atlas/src/engine/cohort.js");
const { getAnalogs, genesisDensity, pathwayDensity } = await import("../docs/storm-atlas/src/engine/analogs.js");
const { filterStorms } = await import("../docs/storm-atlas/src/engine/query.js");
const { previewCounts } = await import("../docs/storm-atlas/src/engine/preview.js");
const { compareResults } = await import("../docs/storm-atlas/src/engine/compare.js");
const { envAtGenesis, envCoverage } = await import("../docs/storm-atlas/src/engine/env.js");
const { buildTimeline } = await import("../docs/storm-atlas/src/engine/timeline.js");
const { bridgeSpec, contributionOf, whyMatched } = await import("../docs/storm-atlas/src/engine/cohort-membership.js");
const { liveStateFor, LIVE_OPERATIONAL } = await import("../docs/storm-atlas/src/engine/live.js");

/* THE SPECS. One is the whole archive; the rest exercise the paths that carry a refusal, a
   sample gate, a landfall rate and a Hawaii cohort -- the shapes a leak would show up in. */
const SPECS = [
  {},
  { s0: 1971 },
  { where: { lat: 14.9, lon: -145.0, radiusKm: 500 } },   // Lala's own genesis point
  { where: { lat: 14.9, lon: -145.0, radiusKm: 500 }, mo: [8, 9] },
  { i: "cat3", b: "EP" },
  { where: { lat: 21.0, lon: -157.5, radiusKm: 500 }, s0: 1971 },
  { includeProvisional: true },
];

/** Everything the research surfaces publish, for one spec, as plain comparable data. */
function snapshot(archive, spec) {
  const s = normaliseSpec(spec);
  const result = cohortResult(archive, s);
  const parent = normaliseSpec({});
  const context = cohortResult(archive, parent);
  const analogs = getAnalogs(archive, {
    lat: s.where ? s.where.lat : 15, lon: s.where ? s.where.lon : -145,
    radiusKm: s.where ? s.where.radiusKm : 500,
  });
  return {
    sentence: sentenceOf(s),
    kept: result.kept,
    rows: Array.from(result.rows),
    n_cases: result.n_cases,
    min_sample: result.min_sample,
    sufficient: result.sufficient,
    effective_sample_size: result.effective_sample_size,
    /* THE RATES, THEIR INTERVALS AND THEIR REFUSALS -- the whole published surface. */
    outcomes: JSON.parse(JSON.stringify(result.outcomes ?? null)),
    intensity: JSON.parse(JSON.stringify(result.intensity ?? null)),
    landfall: JSON.parse(JSON.stringify(result.landfall ?? null)),
    conditionedOn: JSON.parse(JSON.stringify(result.conditionedOn ?? null)),
    refusals: JSON.parse(JSON.stringify(result.refusals ?? null)),
    comparison: JSON.parse(JSON.stringify(compareResults(result, context) ?? null)),
    filtered: Array.from(filterStorms(archive, s).rows ?? []),
    preview: JSON.parse(JSON.stringify(previewCounts(archive, s))),
    analogs: JSON.parse(JSON.stringify({
      n: analogs.n ?? null, status: analogs.status ?? null,
      refused_reason: analogs.refused_reason ?? null,
      rates: analogs.rates ?? null, ess: analogs.effective_sample_size ?? null,
    })),
    envCoverage: JSON.parse(JSON.stringify(envCoverage(archive, result.rows))),
    envLens: JSON.parse(JSON.stringify(envAtGenesis(archive, result.rows))),
    timeline: (() => {
      const t = buildTimeline(archive, result.rows);
      return t ? { start: t.start ?? null, end: t.end ?? null, steps: t.steps ?? null,
        skips: t.skips ? t.skips.length : null } : null;
    })(),
    densities: (() => {
      const p = pathwayDensity(archive, result.rows, 2.0);
      const g = genesisDensity(archive, result.rows, 2.0);
      const sum = (m) => { let n = 0; if (m) for (const v of m.values()) n += v; return n; };
      return { pathCells: p ? p.size : 0, pathSum: sum(p), genCells: g ? g.size : 0, genSum: sum(g) };
    })(),
  };
}

/** Everything Archive.storm(i) publishes for one row — the object the panel reads. */
function stormSnapshot(archive, row) {
  return JSON.parse(JSON.stringify(archive.storm(row)));
}

{
  /* TWO INDEPENDENT ARCHIVES. Not one archive read twice: a shared object could hide a mutation
     by carrying it into both snapshots. These are separate decodes of the same bytes. */
  const before = await openArchive(DATA);
  const after = await openArchive(DATA);
  const live = await openLive(DATA);

  const baseline = SPECS.map((s) => snapshot(before, s));

  /* NOW DO EVERYTHING THE SHELL DOES WITH THE LIVE LAYER, against `after`. If any of it touched
     the archive, the snapshots below diverge. */
  let governed = 0;
  for (let i = 0; i < after.nStorms; i++) {
    const st = liveStateFor(after, i, live);
    if (st.state === LIVE_OPERATIONAL) {
      governed++;
      /* The full join, exactly as ui/atlas.jsx performs it. */
      const { operationalView, operationalLifecycle, categoryLadder, sourceDisagreement, shortfall } =
        await import("../docs/storm-atlas/src/engine/live.js");
      const v = operationalView(st.record, { manifest: after.manifest });
      operationalLifecycle(v.fixes, categoryLadder(after.manifest));
      sourceDisagreement(after.storm(i), v);
      shortfall(after.storm(i), v);
      /* And the bridge, which is the one path a storm's own values reach a cohort spec. */
      const b = bridgeSpec(after, normaliseSpec({}), i, { radiusKm: 500 });
      if (b) {
        const r = cohortResult(after, b.spec);
        whyMatched(after, b.spec, i);
        contributionOf(r, i);
      }
    }
  }
  ok("the live layer governs at least one storm, so this is not vacuous", governed > 0,
    `${governed} governed — with none, nothing was exercised`);

  const withLive = SPECS.map((s) => snapshot(after, s));

  for (let k = 0; k < SPECS.length; k++) {
    const a = JSON.stringify(baseline[k]);
    const b = JSON.stringify(withLive[k]);
    ok(`spec ${k + 1}/${SPECS.length} — every published historical value is unchanged`,
      a === b, firstDifference(baseline[k], withLive[k]));
  }

  /* AND THE ARCHIVE'S OWN STORM OBJECTS, INCLUDING THE GOVERNED ONE. The governed storm is the
     single row most likely to be "helpfully" merged, so it is checked by name rather than left
     to a sample. */
  for (let i = 0; i < after.nStorms; i++) {
    const st = liveStateFor(after, i, live);
    if (st.state !== LIVE_OPERATIONAL) continue;
    const a = JSON.stringify(stormSnapshot(before, i));
    const b = JSON.stringify(stormSnapshot(after, i));
    ok(`archive.storm(${i}) — ${after.storms.str("atcf_id", i)} — is byte-identical after the join`,
      a === b, firstDifference(stormSnapshot(before, i), stormSnapshot(after, i)));
  }

  /* THE SHARED HINGE. `provisional` is simultaneously the live layer's precedence test and the
     cohort filter's FIRST membership test, so rewriting it in memory -- to mark a storm
     "no longer provisional because live data arrived" -- would change every cohort at once. It is
     the single mutation that must never happen, and this is the assertion that says so. */
  const provBefore = Array.from(before.provisional);
  const provAfter = Array.from(after.provisional);
  ok("the `provisional` column was not rewritten by the live layer",
    provBefore.join(",") === provAfter.join(","),
    `${provBefore.filter((v, i) => v !== provAfter[i]).length} row(s) differ`);

  /* And the packed columns a rate is computed from. */
  for (const col of ["max_vmax_kt", "season", "track_points"]) {
    ok(`the packed \`${col}\` column is unchanged`,
      Array.from(before.storms.raw(col)).join(",") === Array.from(after.storms.raw(col)).join(","));
  }
  ok("the track-point wind column is unchanged",
    Array.from(before.ptVmax).join(",") === Array.from(after.ptVmax).join(","));
}

function firstDifference(a, b) {
  const ka = Object.keys(a);
  for (const k of ka) {
    const x = JSON.stringify(a[k]);
    const y = JSON.stringify(b[k]);
    if (x !== y) return `${k}: ${String(x).slice(0, 180)}  !=  ${String(y).slice(0, 180)}`;
  }
  return "";
}

console.log(failed
  ? `\n${failed} of ${checks} boundary check(s) failed — the operational layer has reached the archive\n`
  : `\n${checks} checks: the operational layer is a display layer, and the archive does not know it exists\n`);
process.exit(failed ? 1 : 0);
