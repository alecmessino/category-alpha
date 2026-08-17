#!/usr/bin/env node
/* PREFLIGHT — the gate that stands in front of wiring up the satellite imagery streams.
 *
 * Cluster 1 of the Resource Master List: AWS Open Data GOES-18/19 (`s3://noaa-goes18/`,
 * `s3://noaa-goes19/`) and NASA GIBS raster tiles. This script answers one question with
 * one word — GO or NO-GO — and shows its working for every check on the way there.
 *
 * WHY IT IS A SCRIPT AND NOT A CHECKLIST. Every item here was already written down, in
 * plugins/millibar-pipeline-architect/commands/preflight.md, as instructions for a person
 * or an agent to carry out by reading files. Six of the seven can be decided mechanically
 * from committed bytes, and a check that is decided by reading is a check that passes when
 * somebody is tired. The one that genuinely cannot be decided here — whether an unsigned
 * request to a public NOAA bucket actually succeeds over the network — reports UNKNOWN and
 * says what would settle it.
 *
 * UNKNOWN IS NOT A PASS. It is counted separately and it blocks a GO, because a preflight
 * that rounds "could not tell" up to "fine" is worse than no preflight: it produces a
 * verdict with the same shape as a real one.
 *
 * Usage:
 *   node scripts/preflight-imagery.mjs              human-readable report, exits non-zero on NO-GO
 *   node scripts/preflight-imagery.mjs --json       machine-readable, same exit code
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PF, auditServerlessTopology, auditUnsignedReads, auditServiceWorkerBarrier,
  auditFrameProbabilityPairs, auditLoaderProbabilityFallback, auditCalibrationGate,
  auditNoPolling, unknown,
} from "./lib/preflight.mjs";
import { auditNoCanvasReads } from "./lib/tile-grid.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const PLUGIN = "plugins/millibar-pipeline-architect/skills/data-pipeline-integration";

async function read(rel) {
  try { return { path: rel, text: await readFile(resolve(ROOT, rel), "utf8") }; }
  catch { return { path: rel, text: null }; }
}
async function readJson(rel) {
  const f = await read(rel);
  if (f.text == null) return null;
  try { return JSON.parse(f.text); } catch { return undefined; }   // undefined = present but bad
}

/* The sources each audit reads. Named here rather than globbed so that adding a file that
   touches a public bucket is a deliberate act that shows up in a diff — a glob would let a
   new signed client join the repo without joining the audit. */
const S3_SOURCES = [
  `${PLUGIN}/assets/python/nodd_worker.py`,
  `${PLUGIN}/assets/python/goes_latest.py`,
  `${PLUGIN}/assets/serverless/serverless.yml`,
  `${PLUGIN}/assets/terraform/nodd-goes-ingest.tf`,
  `${PLUGIN}/references/cluster-1-satellite-imagery.md`,
  `${PLUGIN}/references/cluster-2-model-feeds.md`,
  `${PLUGIN}/references/serialization-parsing.md`,
  "scripts/probe-wind.mjs",
  "scripts/fetch-wind.mjs",
];
const POLL_SOURCES = [
  `${PLUGIN}/assets/python/nodd_worker.py`,
  `${PLUGIN}/assets/python/goes_latest.py`,
  `${PLUGIN}/assets/serverless/serverless.yml`,
  `${PLUGIN}/assets/terraform/nodd-goes-ingest.tf`,
  "scripts/ingest.mjs",
  "scripts/fetch-data.mjs",
  "docs/app/map.jsx",
];
const MAP_VERIFY_SOURCES = ["scripts/lib/tile-grid.mjs", "scripts/verify-live.mjs", "docs/app/map.jsx"];

async function main() {
  const checks = [];
  const record = (id, title, result, fix) => checks.push({ id, title, ...result, fix: fix || null });

  /* ---- 1. the event-driven ingest chain ---- */
  const sls = await read(`${PLUGIN}/assets/serverless/serverless.yml`);
  record("ingest-chain", "NODD SNS -> SQS -> Lambda: DLQ mapped, FilterPolicyScope=MessageBody, aws:SourceArn pinned",
    sls.text == null ? { ok: false, status: PF.MISSING, note: `${sls.path} not found` } : auditServerlessTopology(sls.text),
    `edit ${PLUGIN}/assets/serverless/serverless.yml — every fault in this chain presents as a queue depth of zero, which from the console is indistinguishable from a quiet satellite`);

  /* ---- 2. unsigned reads of the public buckets ---- */
  const s3src = [];
  for (const p of S3_SOURCES) { const f = await read(p); if (f.text != null) s3src.push(f); }
  record("unsigned-s3", "every read of a public NOAA bucket is unsigned in its own dialect",
    auditUnsignedReads(s3src),
    "--no-sign-request is a CLI flag and does not exist in any SDK: boto3 needs Config(signature_version=UNSIGNED), s3fs needs anon=True, and a plain HTTPS GET against the public REST endpoint signs nothing and needs no marker");

  /* ---- 3. the service-worker tile-only barrier ---- */
  const sw = await read("docs/sw.js");
  record("sw-barrier", "docs/sw.js caches raster tiles only and never same-origin",
    sw.text == null ? { ok: false, status: PF.MISSING, note: "docs/sw.js not found" } : auditServiceWorkerBarrier(sw.text),
    "a cached index.html or latest.json makes the board's freshness claim false while every indicator on the page keeps saying otherwise");

  /* ---- 4. the probability pair on the frame, and the loader that reads it ----
     Two independent checks. The frame check says the pair is written together; the loader
     check says a frame without it reports nothing rather than borrowing the current
     snapshot. Legacy raw-only rows cannot be fixed and age out on their own — what has to
     hold while they are still in the window is the second check. */
  const loader = await read("docs/app/data-loader.js");
  const fallback = loader.text == null
    ? { ok: false, status: PF.MISSING, note: "docs/app/data-loader.js not found" }
    : auditLoaderProbabilityFallback(loader.text);
  record("frame-fallback", "the scrubber never borrows the current snapshot for a past frame",
    fallback,
    "make pCalAt / pSigmaAt / qualityAt / hurricanePAt read strictly from the frame row and return null when it has nothing");

  const frames = await readJson("docs/data/frames.json");
  record("frame-pair", "every frame storm-row carries {hurricaneP, pCal} together",
    frames === null ? { ok: false, status: PF.MISSING, note: "docs/data/frames.json not found" }
      : frames === undefined ? { ok: false, status: PF.MALFORMED, note: "docs/data/frames.json is not valid JSON" }
      : auditFrameProbabilityPairs(frames),
    "scripts/fetch-data.mjs writes the pair; docs/app/data-loader.js must return null for the probability group on a frame that lacks it rather than falling back to the current snapshot");

  /* ---- 5. no canvas pixel reads in the map-verification path ---- */
  const mapSrc = [];
  for (const p of MAP_VERIFY_SOURCES) { const f = await read(p); if (f.text != null) mapSrc.push(f); }
  record("no-canvas-reads", "map integrity is graded from DOM geometry, never from pixels",
    auditNoCanvasReads(mapSrc),
    "Leaflet's tiles carry no crossOrigin attribute, so a canvas they are drawn into is tainted whatever CORS headers GIBS sends — the read throws SecurityError on the deployed board and passes against any same-origin fixture");

  /* ---- 6. no polling against a NODD bucket ---- */
  const pollSrc = [];
  for (const p of POLL_SOURCES) { const f = await read(p); if (f.text != null) pollSrc.push(f); }
  record("no-polling", "ingestion is event-driven, not a timer against a NOAA bucket",
    auditNoPolling(pollSrc),
    "subscribe to arn:aws:sns:us-east-1:123901341784:NewGOES19Object / NewGOES18Object");

  /* ---- 7. the network path, which cannot be settled here ---- */
  record("anonymous-egress", "an unsigned LIST against s3://noaa-goes19/ actually succeeds",
    unknown("not decidable from committed bytes. Settle it with: aws s3 ls s3://noaa-goes19/ABI-L2-CMIPF/ --no-sign-request --region us-east-1 | head -3 — a 403 AccessDenied there means the request was signed after all, so check AWS_PROFILE and any credential_process before touching the IaC"),
    "run the LIST from the environment that will host the worker, not from a laptop with a different credential chain");

  /* ---- 8. THE DEPLOY GATE, last, because it decides what the verdict MEANS ---- */
  const cal = await readJson("docs/data/calibration.json");
  record("deploy-gate", "the historical calibration baseline is published",
    cal === undefined ? { ok: false, status: PF.MALFORMED, note: "docs/data/calibration.json is not valid JSON" }
      : auditCalibrationGate(cal),
    "node scripts/calibrate.mjs — and note that the gate is a published SCORE, not a fitted coefficient: calibrate.mjs grades published probabilities against NHC best track and withholds the scorecard until enough distinct storms have resolved");

  const failed = checks.filter((c) => !c.ok && c.status !== PF.UNKNOWN);
  const unknowns = checks.filter((c) => c.status === PF.UNKNOWN);
  const gate = checks.find((c) => c.id === "deploy-gate");
  const blockers = failed.filter((c) => c.id !== "deploy-gate");

  /* THE TWO VERDICTS ARE DIFFERENT QUESTIONS and collapsing them is how a closed gate gets
     read as a broken build. BUILD says the code is fit to write and review. DEPLOY says it
     may run against live infrastructure. The gate blocks only the second. */
  const buildOk = blockers.length === 0;
  const deployOk = buildOk && unknowns.length === 0 && gate?.ok === true;

  if (JSON_OUT) {
    console.log(JSON.stringify({
      schema: "millibar-preflight/1", generatedAt: new Date().toISOString(),
      build: buildOk ? "GO" : "NO-GO", deploy: deployOk ? "GO" : "NO-GO",
      counts: { total: checks.length, passed: checks.filter((c) => c.ok).length, failed: failed.length, unknown: unknowns.length },
      checks,
    }, null, 2));
  } else {
    const W = 78;
    console.log("\n" + "=".repeat(W));
    console.log("PREFLIGHT — Cluster 1, Primary Satellite Imagery (GOES-18/19 + NASA GIBS)");
    console.log("=".repeat(W));
    for (const c of checks) {
      const tag = c.ok ? "PASS" : c.status === PF.UNKNOWN ? "UNKN" : "FAIL";
      console.log(`\n[${tag}] ${c.id} — ${c.title}`);
      console.log(`       status ${c.status} · ${c.note}`);
      if (!c.ok && c.fix) console.log(`       fix: ${c.fix}`);
    }
    console.log("\n" + "-".repeat(W));
    console.log(`  ${checks.filter((c) => c.ok).length} passed · ${failed.length} failed · ${unknowns.length} unknown`);
    console.log(`  BUILD  : ${buildOk ? "GO" : "NO-GO"}${buildOk ? "" : ` — ${blockers[0].id}: ${blockers[0].note.slice(0, 120)}`}`);
    console.log(`  DEPLOY : ${deployOk ? "GO" : "NO-GO"}${deployOk ? "" : ` — ${gate?.ok ? "" : "the calibration baseline is not published; "}${unknowns.length ? `${unknowns.length} check(s) could not be decided here` : ""}`}`);
    if (!gate?.ok) {
      console.log("\n  The imagery pipeline may be built, tested and reviewed. It must not be");
      console.log("  deployed live: a live ingestion pipeline feeding an unscored board");
      console.log("  publishes probabilities nobody can grade, which is the one failure this");
      console.log("  project exists to prevent.");
    }
    console.log("-".repeat(W) + "\n");
  }

  /* Exit code tracks BUILD, not DEPLOY. A closed calibration gate is the expected state
     for months and must not fail CI; a broken filter policy must. */
  process.exit(buildOk ? 0 : 1);
}

main().catch((e) => { console.error("[preflight] fatal:", e); process.exit(2); });
