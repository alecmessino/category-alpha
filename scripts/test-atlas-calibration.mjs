#!/usr/bin/env node
/* The calibration ledger, and the disagreement it exists to publish.
 *
 * The archive has been scoring itself since before the Atlas existed. This gate proves three
 * things about the file that carries those scores to the browser:
 *
 *   [1] IT IS THE ARCHIVE'S, NOT A COPY THAT DRIFTED. Rebuilt from
 *       data/genesis-archive/backtest.json and compared byte for byte, the same contract the
 *       pack keeps. A ledger that quietly diverged from the run it claims to report would be
 *       worse than no ledger, because its whole value is that it is auditable.
 *
 *   [2] THE MEASURED FIGURES ARE WHAT THEY SAY. Skill, Brier and event counts asserted against
 *       values measured from this archive. If a rebuild moves them, this fails and they get
 *       re-measured -- it does not get loosened.
 *
 *   [3] THE SCOPE AUDIT FINDS THE HOLE. This is the reason the ledger is worth shipping. The
 *       Atlas refuses a contract when fewer than 10 distinct storms carry it ARCHIVE-WIDE. The
 *       backtest replays EAST PACIFIC storms. CONUS landfall has 699 events archive-wide and
 *       one in the replayed population, so the gate allows a skill claim and the method then
 *       scores WORSE than climatology. Three of the four contracts that earned no skill pass
 *       the gate; one is caught. The audit must find exactly that, and the surface must print
 *       it -- a ledger that only published the flattering half would be marketing.
 *
 * Run: node scripts/test-atlas-calibration.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const SHIPPED = join(ROOT, "docs/storm-atlas/data/atlas-calibration.json");
const shippedText = readFileSync(SHIPPED, "utf8");
const cal = JSON.parse(shippedText);
const byKey = new Map(cal.contracts.map((c) => [c.key, c]));

head("[1] the shipped ledger is exactly what the archive's backtest produces");
{
  /* Regenerated into a temp directory and compared byte for byte. Same discipline as the pack:
     the committed artefact is not trusted, it is reproduced. */
  const tmp = mkdtempSync(join(tmpdir(), "atlas-cal-"));
  let rebuilt = null;
  try {
    execFileSync("python3", ["-m", "genesis.cli", "atlas-calibration", "--out", tmp],
      { cwd: join(ROOT, "scripts"), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    rebuilt = readFileSync(join(tmp, "atlas-calibration.json"), "utf8");
  } catch (e) {
    console.error("[calibration] could not rebuild from the archive.");
    console.error("[calibration] this needs python3 with scripts/genesis/requirements.txt;");
    console.error("[calibration] without it there is no authority to compare the file against.");
    console.error(String(e.stderr || e.message).split("\n").slice(-10).join("\n"));
    process.exit(2);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  ok(rebuilt === shippedText,
    "the committed ledger is byte-identical to a fresh projection of the backtest",
    rebuilt === shippedText ? "" : `${shippedText.length} B shipped vs ${rebuilt.length} B rebuilt`);
  ok(cal.schema === "atlas-calibration/1", "it declares its schema", cal.schema);
}

head("[2] what the harness tested, in its own words");
{
  ok(cal.mode === "genesis_conditioned", "the mode is carried verbatim", cal.mode);
  ok(/a tropical cyclone already existed/.test(cal.conditions_on),
    "and what it conditions on", cal.conditions_on);
  /* The most important sentence in the file. This backtest cannot say anything about whether a
     disturbance becomes a storm at all, because the failures are absent from the best-track
     archive -- and a calibration surface that let a reader think otherwise would be claiming
     skill at the one question it never asked. */
  ok(/failures are absent from the best-track archive/.test(cal.cannot_answer),
    "and, load-bearingly, what it CANNOT answer", cal.cannot_answer);
  ok(cal.settings.basins.length === 1 && cal.settings.basins[0] === "EP",
    "the replayed population is the east Pacific", JSON.stringify(cal.settings.basins));
  ok(cal.settings.min_season === 1971 && cal.settings.min_pool_season === 1971,
    "restricted to the reliably-observed era");
  ok(cal.n_storms_replayed === 1039 && cal.n_storms_skipped_burn_in === 50,
    "1,039 storms replayed, 50 skipped as burn-in",
    `${cal.n_storms_replayed} / ${cal.n_storms_skipped_burn_in}`);
  ok(cal.ledger.rows === 10390, "over a 10,390-row ledger", cal.ledger.rows);
  ok(cal.provenance.backtest_sha256 && cal.provenance.backtest_sha256.length === 64,
    "and the backtest it came from is hashed");
  ok(!!cal.provenance.methodology_version && !!cal.provenance.processing_version,
    "with the methodology and processing versions that produced it");
}

head("[3] the measured figures");
{
  /* Measured from this archive. If a rebuild moves them the right response is to re-measure
     and restate, not to widen the tolerance. */
  const expect = [
    ["landfall_mexico_any", 143, 0.1158, 0.1413, 0.180],
    ["reaches_cat1_64kt", 427, 0.2220, 0.2501, 0.112],
    ["reaches_cat3_96kt", 214, 0.1704, 0.1900, 0.103],
    ["reaches_cat4_113kt", 149, 0.1387, 0.1470, 0.056],
    ["landfall_mexico_hurricane", 57, 0.0600, 0.0633, 0.052],
    ["reaches_ts_34kt", 757, 0.0929, 0.0974, 0.046],
    ["landfall_hawaii_any", 6, 0.0073, 0.0070, -0.033],
    ["landfall_conus_any", 1, 0.0014, 0.0012, -0.172],
  ];
  for (const [key, events, brier, clim, skill] of expect) {
    const c = byKey.get(key);
    ok(!!c && c.n_events === events, `${key}: ${events} events in the replay`,
      c && c.n_events);
    ok(c && Math.abs(c.brier - brier) < 5e-5, `  Brier ${brier}`, c && c.brier);
    ok(c && Math.abs(c.brier_climatology - clim) < 5e-5, `  climatology ${clim}`,
      c && c.brier_climatology);
    ok(c && Math.abs(c.skill - skill) < 5e-4, `  skill ${skill > 0 ? "+" : ""}${skill}`,
      c && c.skill);
  }
  ok(byKey.get("landfall_conus_any").n_forecasts === 847,
    "847 scoreable forecasts per contract");
  ok(byKey.get("landfall_conus_any").n_refused === 192,
    "and 192 refused by the sample gate -- published, not dropped");
}

head("[4] the clean fact: skill tracks the events the query could actually draw on");
{
  const scored = cal.contracts.filter((c) => c.scope_audit.beat_climatology !== null);
  const withSkill = scored.filter((c) => c.scope_audit.beat_climatology);
  const without = scored.filter((c) => !c.scope_audit.beat_climatology);
  const minWith = Math.min(...withSkill.map((c) => c.n_events));
  const maxWithout = Math.max(...without.map((c) => c.n_events));
  ok(minWith === 57, "the fewest replay events on a contract WITH skill is 57", minWith);
  ok(maxWithout === 6, "the most on a contract WITHOUT skill is 6", maxWithout);
  /* No contract sits between. That gap is the finding: the method's skill is a function of how
     many events the replayed population actually carried, and nothing else in this table
     crosses it. */
  ok(maxWithout < minWith,
    "and nothing sits between them -- the separation is clean, not a trend line",
    `${maxWithout} < ${minWith}`);
  ok(cal.audit_summary.min_replay_events_with_skill === minWith
    && cal.audit_summary.max_replay_events_without_skill === maxWithout,
    "the summary the surface leads with is computed from the same rows");
}

head("[5] the hole: the refusal gate counts the wrong population");
{
  /* THE REASON THIS SURFACE IS WORTH SHIPPING. The gate asks "does the whole record carry ten
     of these events" when the question that matters is "does the population this query draws
     from carry them". For an east-Pacific query about a US mainland landfall those are 699 and
     1. The gate passes it; the method has negative skill. */
  const conus = byKey.get("landfall_conus_any");
  ok(conus.scope_audit.archive_events === 699,
    "CONUS landfall has 699 events archive-wide", conus.scope_audit.archive_events);
  ok(conus.scope_audit.replay_events === 1,
    "and one in the population the backtest replayed", conus.scope_audit.replay_events);
  ok(conus.scope_audit.refused_by_gate === false,
    "so the archive-wide gate does NOT refuse it");
  ok(conus.scope_audit.beat_climatology === false, "and it does not beat climatology");
  ok(conus.scope_audit.verdict === "gate_missed", "the audit calls that a missed gate",
    conus.scope_audit.verdict);
  ok(/THE GATE AND THE EVIDENCE DISAGREE/.test(conus.scope_audit.note),
    "and says so in the row itself, not in a footnote");

  const hawaiiHur = byKey.get("landfall_hawaii_hurricane");
  ok(hawaiiHur.scope_audit.archive_events === 2 && hawaiiHur.scope_audit.refused_by_gate === true,
    "Hawaii hurricane landfall has 2 events archive-wide and IS refused",
    `${hawaiiHur.scope_audit.archive_events} events`);
  ok(hawaiiHur.scope_audit.verdict === "refused_and_degenerate",
    "the one contract where the gate and the evidence agree there is nothing",
    hawaiiHur.scope_audit.verdict);

  /* The honest tally, asserted so a future rebuild cannot quietly improve it. */
  const notScoring = cal.contracts.filter((c) => c.scope_audit.beat_climatology !== true);
  const caught = notScoring.filter((c) => c.scope_audit.refused_by_gate);
  ok(notScoring.length === 4, "four contracts earned no skill claim", notScoring.length);
  ok(caught.length === 1,
    "and the archive-wide gate catches exactly one of them",
    `${caught.length} caught: ${caught.map((c) => c.key).join(",")}`);
  ok(cal.audit_summary.n_gate_missed === 2,
    "two are missed outright; the third scored nothing at all to be missed on",
    cal.audit_summary.n_gate_missed);
  ok(byKey.get("landfall_conus_hurricane").scope_audit.verdict === "gate_passed_but_degenerate",
    "that third is named rather than folded in with the failures");
}

head("[5b] a contract the replay never tested publishes no score");
{
  /* WHERE A RATIO STOPS MEANING ANYTHING. With zero events in the replay both Brier scores
     collapse toward zero and their ratio does not: Hawaii hurricane landfall carries a model
     Brier of 4.5e-05 against a climatological 1.4e-06, which is a skill of -29.9. Printed, that
     reads as a catastrophic failure or as a bug. It is neither -- it is a ratio of two
     quantities each indistinguishable from nothing, on a contract nothing tested. The counts
     still publish; only the score is withheld, with its reason. */
  for (const c of cal.contracts.filter((x) => !x.n_events)) {
    ok(c.skill === null, `${c.key}: no events in the replay, so no skill score`, c.skill);
    ok(c.n_forecasts > 0,
      "  while the forecast count still publishes — the contract was asked, just never resolved",
      c.n_forecasts);
    ok(/_degenerate$/.test(c.scope_audit.verdict),
      "  and the audit marks it degenerate rather than failed", c.scope_audit.verdict);
    ok(/nothing was scored|no events to score/i.test(c.scope_audit.note),
      "  saying in words that the replay never tested it", c.scope_audit.note);
  }
  const hh = byKey.get("landfall_hawaii_hurricane");
  ok(hh.brier > 0 && hh.brier_climatology > 0 && hh.brier / hh.brier_climatology > 20,
    "the underlying ratio really is that large — the suppression is a judgement, not a rounding",
    `${hh.brier.toExponential(1)} / ${hh.brier_climatology.toExponential(1)}`);
  ok(cal.contracts.filter((c) => !c.n_events).length === 2,
    "two contracts are in this state", cal.contracts.filter((c) => !c.n_events).length);
}

head("[6] no bin is drawn where nothing was measured");
{
  for (const c of cal.contracts) {
    ok(c.reliability.every((b) => b.n > 0),
      `${c.key}: every reliability bin carries forecasts`,
      JSON.stringify(c.reliability.map((b) => b.n)));
    ok(c.reliability.every((b) => b.observed !== null && b.predicted !== null),
      `  and none has a null coordinate`);
  }
  const cat3 = byKey.get("reaches_cat3_96kt");
  ok(cat3.reliability.length === 7, "Cat 3 keeps seven populated bins", cat3.reliability.length);
  /* Calibrated through the bulk, over-confident in the tail -- and the tail's own n says why.
     The surface has to show both or the curve flatters itself. */
  const top = cat3.reliability[cat3.reliability.length - 1];
  ok(top.n < 10, "its top bin rests on fewer than ten forecasts", top.n);
  ok(top.observed < top.predicted, "and is over-confident there",
    `predicted ${top.predicted.toFixed(3)} vs observed ${top.observed.toFixed(3)}`);
  const bulk = cat3.reliability.filter((b) => b.n >= 100);
  ok(bulk.every((b) => Math.abs(b.observed - b.predicted) < 0.07),
    "while every bin with 100+ forecasts lands within 7 points of the diagonal",
    bulk.map((b) => `${b.predicted.toFixed(2)}->${b.observed.toFixed(2)}`).join(" "));
}

console.log(failed
  ? `\n${failed} of ${checks} calibration check(s) failed\n`
  : `\n${checks} checks: the ledger is the archive's, and it publishes its own failures\n`);
process.exit(failed ? 1 : 0);
