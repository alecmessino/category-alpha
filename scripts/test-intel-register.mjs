#!/usr/bin/env node
/* Tests that the four ingested feeds actually REACH the board.
 *
 * This is the hard rule, and it is a rule about wiring rather than about arithmetic:
 * every field lives on the FRAME, and every field has to trigger the live assertions the
 * board already runs — the probability update, the Signal Register, and the Situation
 * strip. A field that exists only on the newest snapshot cannot be diffed, which means it
 * cannot raise a register row, cannot move under the scrubber, and cannot be seen to have
 * changed. The number moves on the page and nothing records that it moved.
 *
 * That failure has happened here before, in the other direction: a whole advisory block
 * was written to latest.json and silently dropped by the loader's whitelist, so the panel
 * that renders it never once appeared on the deployed page. Adding a field to the
 * snapshot is not the same as shipping it. These fixtures walk the real compute engine
 * over real frame shapes and assert what comes out the other end.
 *
 * Run: node scripts/test-intel-register.mjs
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

const T0 = Date.UTC(2026, 7, 14, 20, 0);

/* The frame shape the server actually writes, with the four feeds on it. Each fixture
   passes a list of per-frame overrides so a test can move exactly one field. */
function build(steps, opts = {}) {
  const base = {
    wind: 50, pressure: 997, center: [17.2, -150.9],
    modelCat4: null, marketCat4: null, reconAge: null,
    advNum: "10", advisoryLagMin: 60, hurricaneP: 0.6, peakKt: 70, peakHr: 120, guidance: "above",
    conKt: null, conHr: null, conSpread: null, conN: null, conCycle: null,
    reconMb: null, reconKt: null, reconFlKt: null, reconOb: null,
    shShear: null, shOhc: null, shRh: null, shMpi: null, shRi: null,
    ascatKt: null, ascatAge: null,
    pCal: 0.6, pSigma: 17, quality: "MEDIUM",
  };
  const frames = steps.map((s, i) => ({
    tsZ: new Date(T0 + i * 20 * 60000).toISOString(),
    storms: { CP012026: Object.assign({}, base, s) },
    contracts: {},
  }));
  const at = (key) => (f) => frames[Math.max(0, Math.min(frames.length - 1, f))].storms.CP012026[key];
  const MT = {
    FRAMES: frames.length, STEP_MIN: 20,
    storms: { CP012026: {
      id: "CP012026", name: "Lala", full_cls: "Tropical Storm", movement: "WNW 12 kt",
      wind: at("wind"), pressure: at("pressure"),
      advisoryLagMin: at("advisoryLagMin"), reconAge: at("reconAge"),
      pCalAt: at("pCal"), pSigmaAt: at("pSigma"), qualityAt: at("quality"),
      conKtAt: at("conKt"), conSpreadAt: at("conSpread"), conCycleAt: at("conCycle"),
      conAgeAt: () => 30,
      reconMbAt: at("reconMb"), reconKtAt: at("reconKt"), reconFlKtAt: at("reconFlKt"),
      shearAt: at("shShear"), ohcAt: at("shOhc"), mpiAt: at("shMpi"), rhAt: at("shRh"), riAt: at("shRi"),
      ascatKtAt: at("ascatKt"), ascatAgeAt: at("ascatAge"),
      hurricanePAt: at("hurricaneP"), advNumAt: at("advNum"), guidanceAt: at("guidance"),
    } },
    contracts: opts.contracts || [{ id: "KX-1", modelMaxLagMin: 360 }],
    evidence: [], models: [], events: opts.events || [],
    _feeds: opts.feeds || { nhc: { ok: true }, markets: { ok: true }, atcf: { ok: true, note: "2/2 decks" },
                            recon: { ok: true, count: 1, note: "1 message" }, ships: { ok: true }, ascat: { ok: true, count: 1 } },
    _frames: frames, _generatedAt: frames[frames.length - 1].tsZ, _outlook: [], _enso: null, _verify: null,
  };
  const MTC = { claim: () => ({ text: "", ok: true }), footer: () => ({}) };
  const sandbox = { MT, MTC, window: { MT, MTC }, setTimeout, console, Math, JSON, Date, Number, String,
                    Object, Array, Set, Map, isFinite, parseFloat, RegExp };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(__dir, "../docs/app/compute.js"), "utf8"), sandbox);
  if (!sandbox.window.MTX) throw new Error("MTX did not build");
  return sandbox.window.MTX;
}
const rows = (MTX, kind) => MTX.signals({ sinceMin: 100000 }).filter((s) => s.kind === kind);

console.log("\n[1] Priority 1 — a guidance cycle reaches the register");
/* The pre-advisory signal. A new a-deck cycle IS the head start, so it has to be a row. */
const con = build([
  { conCycle: "2026081412", conKt: 70, conSpread: 6, conN: 3 },
  { conCycle: "2026081418", conKt: 92, conSpread: 20, conN: 3, pCal: 0.72 },
]);
const cr = rows(con, "consensus");
eq("a new cycle raises exactly one row", cr.length, 1);
eq("carrying the move on the cycle", [cr[0].from, cr[0].to], [70, 92]);
ck("named as guidance", /guidance consensus/i.test(cr[0].label), cr[0].label);
ck("and it says the deck is ahead of the advisory", /before the advisory/i.test(cr[0].detail), cr[0].detail);
/* A 22 kt jump in the consensus peak is a repricing event, not a diary entry. */
eq("a large move is trade-relevant", cr[0].class, "trade-relevant");
/* The same cycle re-read every ten minutes must be silent. A register that restates a
   condition stops being read. */
eq("re-reading the same cycle raises nothing",
   rows(build([{ conCycle: "2026081418", conKt: 92 }, { conCycle: "2026081418", conKt: 92 }]), "consensus").length, 0);

console.log("\n[2] Priority 2 — an aircraft fix reaches the register");
const rec = build([
  { reconAge: 140, reconMb: 999, reconKt: 45, reconFlKt: 51, reconOb: 4, quality: "HIGH" },
  { reconAge: 20, reconMb: 987, reconKt: 62, reconFlKt: 71, reconOb: 5, quality: "HIGH", pCal: 0.84 },
]);
const rr = rows(rec, "recon");
eq("a new fix raises exactly one row", rr.length, 1);
eq("the pressure fall is the delta", [rr[0].from, rr[0].to, rr[0].unit], [999, 987, "mb"]);
/* Falling pressure is a storm strengthening, so the good/bad sense is inverted for it
   exactly as it is for the advisory's own pressure row. */
eq("and it is marked inverted", rr[0].inverted, true);
eq("a 12 mb fall is trade-relevant", rr[0].class, "trade-relevant");
ck("the row says it is a measurement", /measurement/i.test(rr[0].detail), rr[0].detail);
/* Nothing on this board is more confident than an instrument inside the storm. */
eq("and nothing outranks it for confidence", rr[0].confidence, 1);
/* An aircraft flying through a storm is never cosmetic, even when it finds nothing new. */
const quietFix = build([
  { reconAge: 140, reconMb: 999, reconKt: 45, reconOb: 4 },
  { reconAge: 15, reconMb: 999, reconKt: 45, reconOb: 5 },
]);
eq("a fix that confirms the advisory is still material", rows(quietFix, "recon")[0].class, "material");
/* The age reset is the detector, and it works even when the observation number is
   missing from the message. */
eq("a reset age alone is enough to see a new fix",
   rows(build([{ reconAge: 150, reconMb: 999 }, { reconAge: 10, reconMb: 990 }]), "recon").length, 1);
eq("and a merely ageing fix is not a new one",
   rows(build([{ reconAge: 40, reconMb: 999, reconOb: 4 }, { reconAge: 60, reconMb: 999, reconOb: 4 }]), "recon").length, 0);

console.log("\n[3] Priority 3 and 4 — SHIPS and the scatterometer");
const sh = rows(build([
  { shShear: 12, shOhc: 11, shMpi: 138, shRh: 48, shRi: 0.10 },
  { shShear: 26, shOhc: 9, shMpi: 136, shRh: 44, shRi: 0.22 },
]), "ships");
eq("a materially changed environment raises a row", sh.length, 1);
ck("carrying the features", /shear 26 kt/.test(sh[0].label), sh[0].label);
/* The scoring gate has to be visible on the row itself, not only in a settings panel. */
ck("and stating that they do not score", /operator claim/i.test(sh[0].detail), sh[0].detail);
eq("noise below the floor is not a signal",
   rows(build([{ shShear: 12, shRi: 0.10 }, { shShear: 14, shRi: 0.11 }]), "ships").length, 0);
const asc = rows(build([{ ascatKt: 38, ascatAge: 700 }, { ascatKt: 44, ascatAge: 40 }]), "ascat");
eq("a new pass raises a row", asc.length, 1);
/* A pass informs the width of an estimate and reprices nothing on its own. */
eq("and it is never more than cosmetic", asc[0].class, "cosmetic");
eq("an ageing pass is not a new one",
   rows(build([{ ascatKt: 38, ascatAge: 100 }, { ascatKt: 38, ascatAge: 120 }]), "ascat").length, 0);

console.log("\n[4] the P update — the assertion the whole ingest exists to trigger");
/* A calibrated probability can move WITHOUT an advisory. That is the entire point of
   reading the decks early, and it is worth its own row: an operator must never have to
   notice a probability move for themselves. */
const pm = build([
  { conCycle: "2026081412", conKt: 70, pCal: 0.60 },
  { conCycle: "2026081418", conKt: 92, pCal: 0.72 },
]);
const pr = rows(pm, "probability");
eq("a probability move raises a row", pr.length, 1);
eq("of the right size", pr[0].delta, 12);
eq("a 12-point move is trade-relevant", pr[0].class, "trade-relevant");
ck("and it names the raw estimate alongside", /official-forecast estimate/.test(pr[0].detail), pr[0].detail);
eq("the advisory number never changed", rows(pm, "advisory").length, 0);
eq("a move below the floor is not a row",
   rows(build([{ pCal: 0.60 }, { pCal: 0.61 }]), "probability").length, 0);

console.log("\n[5] the Situation strip mirrors every arrival");
const sit = rec.situation(100000);
ck("the strip sees the arrival", sit.intel.arrivals >= 1, JSON.stringify(sit.intel.byKind));
eq("and names what landed last", sit.intel.last.kind, "recon");
ck("with its age", sit.intel.last.ageMin != null);
/* Lag, quality tier and guidance position all have to travel with the probability. */
eq("the lead storm carries its evidence tier", sit.lead.quality, "HIGH");
ck("its advisory age", sit.lead.lagMin === 60, String(sit.lead.lagMin));
ck("and its guidance position", sit.lead.guidance === "above", String(sit.lead.guidance));
ck("the strip reports the four feeds", sit.intel.feeds.length === 4, JSON.stringify(sit.intel.feeds.map((f) => f.k)));
/* Raw and calibrated must both be reachable from the strip. */
const cal = build([{ pCal: 0.72, hurricaneP: 0.60 }, { pCal: 0.72, hurricaneP: 0.60 }]).situation(100000);
eq("the strip leads with the calibrated number", cal.lead.p, 0.72);
eq("and carries the raw one beside it", cal.lead.pRaw, 0.60);
eq("marking that it was moved", cal.lead.calibrated, true);

console.log("\n[6] evidence quality reaches the tier the board grades on");
eq("a measured initial condition is tier A", rec.tier("CP012026", 1).tier, "A");
eq("a deck alone is tier B", build([{ quality: "MEDIUM" }, { quality: "MEDIUM" }]).tier("CP012026", 1).tier, "B");
/* The published grade already carries the staleness cap, so the tier cannot disagree
   with the HOLD rule about whether a storm is actionable. */
eq("a capped grade is tier C", build([{ quality: "LOW", reconAge: 10 }, { quality: "LOW", reconAge: 10 }]).tier("CP012026", 1).tier, "C");
const reasons = rec.tier("CP012026", 1).reasons.join(" | ");
ck("and the reasons say measured, not estimated", /measured, not estimated/.test(reasons), reasons);

console.log("\n[7] the lifecycle makes the head start auditable");
/* A guidance cycle is OBSERVED when it lands and VALIDATED when the advisory built on it
   catches up. Until then the board is holding something the market has not been told —
   which is the claim being made, so it is the claim that has to be checkable. */
const sigsCon = con.signals({ sinceMin: 100000 });
const lcOpen = con.lifecycleFor(sigsCon.find((s) => s.kind === "consensus"), sigsCon);
eq("with no advisory since, the head start is open", lcOpen.validated, false);
ck("and it says so", /head start is still open/.test(lcOpen.why.validated), lcOpen.why.validated);
const withAdv = build([
  { conCycle: "2026081412", conKt: 70 },
  { conCycle: "2026081418", conKt: 92 },
  { conCycle: "2026081418", conKt: 92, advNum: "11" },
]);
const sigsAdv = withAdv.signals({ sinceMin: 100000 });
const lcClosed = withAdv.lifecycleFor(sigsAdv.find((s) => s.kind === "consensus"), sigsAdv);
eq("once the advisory lands the head start is validated", lcClosed.validated, true);
/* Nothing corroborates an aircraft — it is the measurement the others are estimating. */
const sigsRec = rec.signals({ sinceMin: 100000 });
eq("an aircraft fix is validated by being one", rec.lifecycleFor(sigsRec.find((s) => s.kind === "recon"), sigsRec).validated, true);

console.log("\n[8] a dead core feed enters the work queue");
const down = build([{ conKt: 70 }, { conKt: 70 }], {
  feeds: { nhc: { ok: true }, markets: { ok: true }, atcf: { ok: false, note: "deck unreachable" },
           recon: { ok: false, note: "products unreachable" }, ships: { ok: true }, ascat: { ok: true } },
});
const q = down.attention({ windowMin: 100000 }).items;
ck("a dead guidance feed is HIGH priority", q.some((i) => i.id === "feed:atcf" && i.priority === "HIGH"), JSON.stringify(q.map((i) => i.id + ":" + i.priority)));
ck("so is a dead reconnaissance poll", q.some((i) => i.id === "feed:recon" && i.priority === "HIGH"));
/* An intermittent feed must never raise an alarm for being intermittent, or the alarms
   stop being read. */
eq("but an empty scatterometer cycle raises nothing", q.filter((i) => i.id === "feed:ascat").length, 0);

console.log(fail ? `\n${fail} FAILED\n` : "\nall register / frame wiring checks passed\n");
process.exit(fail ? 1 : 0);
