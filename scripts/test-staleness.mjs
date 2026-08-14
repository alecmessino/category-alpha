#!/usr/bin/env node
/* Tests for the stale-advisory crossing signal.
 *
 * The register's job here is to fire ONCE, at the moment a storm's advisory crosses the
 * line past which its contracts stop being actionable — and then to be quiet. A condition
 * restated every frame is how a register stops being read, and a register nobody reads is
 * worse than no register, because the board still looks like it is telling you things.
 *
 * The other half is that the register and the edge book must agree about where the line
 * is. They read it from the same place; these fixtures prove they move together.
 *
 * Run: node scripts/test-staleness.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

/* Frames are the only place staleness can be observed, because it is a CROSSING and a
   crossing needs two snapshots. Each fixture frame carries the advisory state the real
   pipeline writes. */
function build(lags, opts = {}) {
  const t0 = Date.UTC(2026, 7, 14, 0, 0);
  const frames = lags.map((lag, i) => ({
    tsZ: new Date(t0 + i * 20 * 60000).toISOString(),
    storms: { CP012026: {
      wind: 50, pressure: 997, center: [16.7, -149.5],
      advNum: opts.advNum ? opts.advNum[i] : "9",
      advisoryLagMin: lag, hurricaneP: 0.6, peakKt: 70, peakHr: 117, guidance: "above",
    } },
    contracts: {},
  }));
  const MT = {
    FRAMES: frames.length, STEP_MIN: 20,
    storms: { CP012026: { id: "CP012026", name: "Lala", full_cls: "Tropical Storm",
      wind: () => 50, pressure: () => 997,
      advisoryLagMin: (f) => frames[Math.max(0, Math.min(frames.length - 1, f))].storms.CP012026.advisoryLagMin } },
    contracts: opts.contracts || [{ id: "KX-1", modelMaxLagMin: opts.cycle || 360 }],
    evidence: [], models: [], events: [], _feeds: {}, _frames: frames,
    _generatedAt: frames[frames.length - 1].tsZ, _outlook: [], _enso: null, _verify: null,
  };
  const sandbox = { MT, window: { MT }, setTimeout, console, Math, JSON, Date, Number, String, Object, Array, Set, isFinite, parseFloat, RegExp };
  sandbox.window.MT = MT;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(__dir, "../docs/app/compute.js"), "utf8"), sandbox);
  if (!sandbox.window.MTX) throw new Error("MTX did not build");
  return sandbox.window.MTX;
}
const staleRows = (MTX) => MTX.signals({ sinceMin: 100000 }).filter((s) => s.kind === "stale");

console.log("\n[1] it fires on the crossing, not on the condition");
/* Five frames well under the line. Nothing has changed, so nothing is reported — the
   advisory being fresh is not news. */
const quiet = build([20, 40, 60, 80, 100]);
eq("a fresh advisory never reports", staleRows(quiet).length, 0);

/* Five frames all well over the line. Still nothing: the board entered this window
   already stale, and there is no crossing inside it to report. A register that invented
   one would be reporting a transition that did not happen here. */
const alreadyStale = build([200, 220, 240, 260, 280]);
eq("a persistently stale advisory reports no crossing", staleRows(alreadyStale).length, 0);

/* The crossing. 170 -> 190 steps over 180, and that is the one frame that reports. */
const crossed = build([100, 140, 170, 190, 210, 230]);
const cr = staleRows(crossed);
eq("crossing the line reports exactly once", cr.length, 1);
eq("and it is flagged as going stale", cr[0].stale, true);
ck("the row names the storm", /Lala/.test(cr[0].label), cr[0].label);
ck("and says what it costs", /held until the next advisory/i.test(cr[0].detail), cr[0].detail);
eq("it carries both sides of the crossing", [cr[0].from, cr[0].to], [170, 190]);
ck("and it lands on the frame where it happened",
   cr[0].tsZ === crossed.signals({ sinceMin: 100000 }).find((s) => s.kind === "stale").tsZ);

console.log("\n[2] and it fires again when the advisory comes back");
/* A refresh must be reported too. Otherwise the register shows a storm going stale and
   nothing showing it recovered, and the last thing on the board stays wrong forever. */
const recovered = build([100, 190, 210, 30, 50]);
const rr = staleRows(recovered);
eq("out and back reports twice", rr.length, 2);
eq("newest first: the recovery leads", rr[0].stale, false);
eq("and the staleness precedes it", rr[1].stale, true);
ck("the recovery says the storm is gradeable again", /again/i.test(rr[0].detail), rr[0].detail);

/* Two crossings in one direction, separated by a recovery, are two events — not one
   event repeated. */
const flapping = build([100, 190, 30, 190, 30]);
eq("each crossing is its own row", staleRows(flapping).length, 4);

console.log("\n[3] going stale is trade-relevant; coming back is not");
/* Going stale removes every TAKE for that storm, which changes what an operator may do.
   Coming back restores an option rather than closing one. */
const cls = staleRows(recovered).map((s) => [s.stale, s.class]);
eq("classification follows the direction", cls, [[false, "material"], [true, "trade-relevant"]]);
ck("both are confident — the lag is measured, not inferred",
   staleRows(recovered).every((s) => s.confidence === 1));

console.log("\n[4] the line is the server's, not a second copy");
/* The edge book refuses an anchor past a full cycle and the register reports the halfway
   crossing. If those two numbers ever came from different places they could disagree
   about whether a storm is actionable, which is the one thing they exist to agree on. */
const shortCycle = build([50, 100], { cycle: 180 });   // half of 180 is 90
eq("a shorter cycle moves the crossing with it", staleRows(shortCycle).length, 1);
const longCycle = build([50, 100], { cycle: 720 });    // half of 720 is 360
eq("a longer cycle means the same lags cross nothing", staleRows(longCycle).length, 0);
/* With no contract carrying the cycle there is nothing to read it from, so it falls back
   to one advisory cycle rather than to zero — a missing value must not make everything
   stale. */
const noContracts = build([50, 100], { contracts: [] });
eq("no contract to read the cycle from falls back, it does not go stale", staleRows(noContracts).length, 0);

console.log("\n[5] a missing lag is absent, not fresh");
/* null must never be read as zero. A storm whose advisory age could not be measured has
   an unknown age, and an unknown age is not a fresh one. */
const missing = build([null, null, 190]);
eq("no crossing is claimed from an unmeasured lag", staleRows(missing).length, 0);
const appears = build([null, 190, 210]);
eq("nor when the first measurement is already past the line", staleRows(appears).length, 0);

console.log("\n[6] the crossing reaches the Situation strip");
/* The strip reads the register, so the same event has to be visible there — that is what
   makes Observability and the strip light the same thing rather than two things. */
const sit = crossed.situation(100000);
ck("the trade-relevant count includes it", sit.byClass["trade-relevant"] >= 1,
   JSON.stringify(sit.byClass));
ck("and the top change names it", /advisory went stale/i.test(sit.topChange || ""), sit.topChange);

console.log(fail ? `\n${fail} FAILED\n` : "\nall staleness checks passed\n");
process.exit(fail ? 1 : 0);
