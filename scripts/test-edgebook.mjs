#!/usr/bin/env node
/* Tests for the edge-book ranking.
 *
 * compute.js is browser code with no module system, so it is loaded here into a minimal
 * window/MT shim and exercised headlessly. That is deliberate: this function decides
 * what an operator is told to buy, and it must not be the one piece of arithmetic on the
 * board whose only test is that the page renders.
 *
 * The fixtures are hand-built so the right answer is arithmetic, not judgement.
 *
 * Run: node scripts/test-edgebook.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const __dir = dirname(fileURLToPath(import.meta.url));

let fail = 0;
const ck = (name, cond, detail = "") => { if (!cond) fail++; console.log((cond ? "  ok   " : "  FAIL ") + name + (detail ? "  " + detail : "")); };
const near = (name, got, want, tol = 1e-6) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + name + (ok ? "" : `  got=${got} want=${want}`));
};
const eq = (name, got, want) => ck(name + (JSON.stringify(got) === JSON.stringify(want) ? "" : ""), JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got) === JSON.stringify(want) ? "" : `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);

/* Build MTX over a supplied contract list. compute.js polls for window.MT, so MT is set
   before it is evaluated and the poll succeeds on the first pass. */
function buildMTX(contracts) {
  const MT = {
    FRAMES: 1, STEP_MIN: 10, storms: {}, contracts, evidence: [], models: [], events: [],
    _feeds: {}, _frames: [{ tsZ: "2026-08-12T17:00:00Z" }], _generatedAt: "2026-08-12T17:00:00Z",
    _outlook: [], _enso: null, _verify: null,
  };
  const sandbox = { MT, window: { MT }, setTimeout, console, Math, JSON, Date, Number, String, Object, Array, Set, isFinite, parseFloat };
  sandbox.window.MT = MT;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(__dir, "../docs/app/compute.js"), "utf8"), sandbox);
  if (!sandbox.window.MTX) throw new Error("MTX did not build");
  return sandbox.window.MTX;
}

const C = (over) => Object.assign({
  id: "KXTEST-26DEC01-T1", label: "Test contract", market: 0.5, model: null,
  modelLayers: null, modelBasis: null, spread: 0.02, volume24h: 100,
  yesBid: 0.49, yesAsk: 0.51, depth: { bidSize: 1000, askSize: 1000, notional: 1 },
  liquidity: 500, priceAt: () => over && over.market != null ? over.market : 0.5,
  modelAt: () => (over && "model" in over ? over.model : null),
}, over);

console.log("\n[1] the fee is Kalshi's, and it bites hardest at a coin flip");
const MTX0 = buildMTX([]);
near("fee at 50c is 1.75c per contract", MTX0.feePerContract(0.5), 0.0175);
near("fee at 10c is 0.63c", MTX0.feePerContract(0.1), 0.07 * 0.1 * 0.9);
near("fee at 99c is near zero", MTX0.feePerContract(0.99), 0.07 * 0.99 * 0.01);
ck("the fee is symmetric about 50c", Math.abs(MTX0.feePerContract(0.3) - MTX0.feePerContract(0.7)) < 1e-12);

console.log("\n[2] edge is measured against the ask, not the mid");
/* A 0/2c book. The mid says 1c; a taker pays 2c. With a model at 6c, the honest net
   edge is 6 - 2 - fee(2c) = 3.86c, not the 5c a mid-based board would print. */
const thin = C({ id: "KXA-26-T1", market: 0.01, model: 0.06, modelAt: () => 0.06,
  yesBid: 0, yesAsk: 0.02, depth: { bidSize: 0, askSize: 100000, notional: 1 } });
const bk = buildMTX([thin]).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
ck("the contract ranks", bk.rows.length === 1, JSON.stringify(bk.skipped));
near("net edge charges the ask and the fee", bk.rows[0].edge, 0.06 - 0.02 - 0.07 * 0.02 * 0.98);
ck("and it is strictly below the mid-based edge", bk.rows[0].edge < 0.06 - 0.01, `${bk.rows[0].edge} vs ${0.05}`);
eq("the side taken is YES", bk.rows[0].side, "YES");

console.log("\n[3] an overpriced contract is a NO bet, not a skipped row");
/* Market bid 80c, model says 40c. Selling YES into the bid costs 20c for a contract
   worth 60c. A YES-only board sees nothing here at all. */
const rich = C({ id: "KXB-26-T1", market: 0.8, model: 0.4, modelAt: () => 0.4,
  yesBid: 0.8, yesAsk: 0.82, depth: { bidSize: 500, askSize: 500, notional: 1 } });
const nb = buildMTX([rich]).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
eq("side is NO", nb.rows[0].side, "NO");
near("NO edge is (1-p) - (1-bid) - fee", nb.rows[0].edge, 0.6 - 0.2 - 0.07 * 0.2 * 0.8);
ck("the NO cost is what you actually pay, 20c", Math.abs(nb.rows[0].price - 0.2) < 1e-12);

console.log("\n[4] a contract with no anchor never ranks, whatever its price");
const noModel = C({ id: "KXC-26-T1", model: null, modelAt: () => null, yesAsk: 0.02, yesBid: 0.01 });
const nm = buildMTX([noModel]).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
eq("no rows", nm.rows.length, 0);
eq("and it is counted as skipped for want of a model", nm.skipped.noModel, 1);

console.log("\n[5] an empty book is skipped rather than filled at an imaginary price");
const noBook = C({ id: "KXD-26-T1", model: 0.9, modelAt: () => 0.9,
  yesBid: 0, yesAsk: 0.1, depth: { bidSize: 0, askSize: 0, notional: 1 } });
const nbk = buildMTX([noBook]).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
eq("no rows", nbk.rows.length, 0);
eq("counted as no book", nbk.skipped.noBook, 1);

console.log("\n[6] ranking is by expected DOLLARS, so capacity beats raw edge");
/* Fat: 6-point gross edge with 20,000 contracts resting. Thin: 30-point edge with 20.
   The thin one has five times the edge and a fraction of a percent of the value. */
const fat = C({ id: "KXFAT-26-T1", market: 0.5, model: 0.58, modelAt: () => 0.58,
  yesBid: 0.49, yesAsk: 0.5, depth: { bidSize: 0, askSize: 20000, notional: 1 } });
const thinBig = C({ id: "KXTHIN-26-T1", market: 0.5, model: 0.85, modelAt: () => 0.85,
  yesBid: 0.49, yesAsk: 0.5, depth: { bidSize: 0, askSize: 20, notional: 1 } });
const rank = buildMTX([thinBig, fat]).edgeBook(0, 1000000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
eq("the fat book ranks first", rank.rows[0].id, "KXFAT-26-T1");
ck("even though the thin one has the larger edge", rank.rows[1].edge > rank.rows[0].edge,
   `thin=${rank.rows[1].edge.toFixed(3)} fat=${rank.rows[0].edge.toFixed(3)}`);
ck("expected value orders them", rank.rows[0].ev > rank.rows[1].ev,
   `${rank.rows[0].ev.toFixed(0)} vs ${rank.rows[1].ev.toFixed(0)}`);

console.log("\n[7] the stake is capped by resting size, and says when it was");
const capped = buildMTX([thinBig]).edgeBook(0, 1000000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
ck("capped flag set", capped.rows[0].capped === true);
ck("stake never exceeds what is resting", capped.rows[0].stake <= capped.rows[0].capacityDollars + 1e-9,
   `${capped.rows[0].stake} vs ${capped.rows[0].capacityDollars}`);
ck("contracts bought never exceed the resting size", capped.rows[0].contracts <= 20 + 1e-9);

console.log("\n[8] one rung per ladder in the headline — a ladder is one view, not five");
/* Three rungs of the same series, all mispriced. Sizing them independently would stake
   the same opinion about the season three times over. */
const rungs = [3, 4, 5].map((n) => C({
  id: "KXHURCTOT-26DEC01-T" + n, market: 0.5, model: 0.58 + n / 1000,
  modelAt: () => 0.58 + n / 1000, yesBid: 0.49, yesAsk: 0.5,
  depth: { bidSize: 0, askSize: 5000, notional: 1 },
}));
const lad = buildMTX(rungs).edgeBook(0, 1000000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
eq("only one rung is promoted", lad.rows.length, 1);
eq("the other two are held back, not discarded", lad.alsoInLadder.length, 2);
eq("and they share one ladder key", lad.ladders, 1);
eq("the best rung is the one promoted", lad.rows[0].id, "KXHURCTOT-26DEC01-T5");

console.log("\n[9] thresholds exclude rather than silently rank");
const marginal = C({ id: "KXE-26-T1", market: 0.5, model: 0.53, modelAt: () => 0.53,
  yesBid: 0.49, yesAsk: 0.5, depth: { bidSize: 0, askSize: 5000, notional: 1 } });
const gated = buildMTX([marginal]).edgeBook(0, 100000, 1, { minEdge: 0.05, minDollars: 0, limit: 5 });
eq("a sub-threshold edge does not rank", gated.rows.length, 0);
eq("it is counted, so the count is auditable", gated.skipped.noEdge, 1);
const open = buildMTX([marginal]).edgeBook(0, 100000, 1, { minEdge: 0.001, minDollars: 0, limit: 5 });
eq("and it does rank when the threshold allows it", open.rows.length, 1);

console.log("\n[10] coverage is reported against the whole board, not the ranked subset");
const mixed = [thin, noModel, noBook];
const cov = buildMTX(mixed).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 0, limit: 5 });
eq("total counts every contract", cov.coverage.total, 3);
eq("anchored counts those with a model", cov.coverage.anchored, 2);

console.log("\n[10b] the verdict — what the operator actually reads off the row");
const L = (...ps) => ps.map((p, i) => ({ id: "l" + i, label: "layer " + i, p }));
const graded = (over) => buildMTX([C(Object.assign({
  id: "KXG-26-T1", market: 0.5, yesBid: 0.49, yesAsk: 0.5, spread: 0.01,
  depth: { bidSize: 0, askSize: 5000, notional: 1 },
}, over))]).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 25, limit: 5 }).rows[0];

const take = graded({ model: 0.62, modelAt: () => 0.62, modelLayers: L(0.60, 0.61, 0.62) });
eq("agreeing layers, real size, edge over the spread -> TAKE", take.grade, "TAKE");
near("dispersion is the spread between layers", take.dispersion, 0.02, 1e-9);

const scattered = graded({ model: 0.62, modelAt: () => 0.62, modelLayers: L(0.40, 0.55, 0.62) });
eq("the same edge with layers 22 points apart is only SMALL", scattered.grade, "SMALL");
ck("and it says why", scattered.why.some((w) => /layers disagree/.test(w)), scattered.why.join("; "));

/* The rule that matters most: a huge edge whose own layers disagree is demoted, not
   celebrated. A climatology baseline differing from a traded market by 30 points while
   disagreeing with itself is far likelier to be missing something than to be right. */
const suspect = graded({ model: 0.85, modelAt: () => 0.85, modelLayers: L(0.45, 0.65, 0.85) });
eq("a 30-point edge with scattered layers is SUSPECT", suspect.grade, "SUSPECT");
ck("and the reason names the model, not the market",
   suspect.why.some((w) => /more likely a model gap/.test(w)), suspect.why.join("; "));
ck("SUSPECT still carries the larger raw edge", suspect.edge > take.edge);

/* Absence of disagreement is not agreement. */
const blind = graded({ model: 0.62, modelAt: () => 0.62, modelLayers: null });
ck("an anchor with no layer detail is never TAKE", blind.grade !== "TAKE", blind.grade);
ck("and it says the estimate could not be checked",
   blind.why.some((w) => /no layer detail/.test(w)), blind.why.join("; "));
eq("its dispersion is null, not zero", blind.dispersion, null);

const thinBook = graded({ model: 0.62, modelAt: () => 0.62, modelLayers: L(0.61, 0.62),
  depth: { bidSize: 0, askSize: 60, notional: 1 } });
ck("a good edge with almost nothing resting is not TAKE", thinBook.grade !== "TAKE", thinBook.grade + " " + thinBook.why.join("; "));

const wide = graded({ model: 0.62, modelAt: () => 0.62, modelLayers: L(0.61, 0.62),
  spread: 0.10, yesAsk: 0.55, yesBid: 0.45 });
ck("an edge that does not clear 1.5x the spread is not TAKE", wide.grade !== "TAKE", wide.grade + " " + wide.why.join("; "));

console.log("\n[10c] verdict outranks expected value in the ordering");
/* A big SUSPECT must not sit above a modest TAKE — the whole point of the grade is that
   scanning the top of the list is safe. */
const graded10c = buildMTX([
  C({ id: "KXBIG-26-T1", market: 0.5, model: 0.9, modelAt: () => 0.9, modelLayers: L(0.40, 0.65, 0.90),
      yesBid: 0.49, yesAsk: 0.5, spread: 0.01, depth: { bidSize: 0, askSize: 40000, notional: 1 } }),
  C({ id: "KXOK-26-T1", market: 0.5, model: 0.58, modelAt: () => 0.58, modelLayers: L(0.57, 0.575, 0.58),
      yesBid: 0.49, yesAsk: 0.5, spread: 0.01, depth: { bidSize: 0, askSize: 3000, notional: 1 } }),
]).edgeBook(0, 100000, 1, { minEdge: 0, minDollars: 25, limit: 5 });
eq("the TAKE sorts first", graded10c.rows[0].grade, "TAKE");
eq("the SUSPECT sorts last", graded10c.rows[1].grade, "SUSPECT");
ck("even though the SUSPECT has far more expected value", graded10c.rows[1].ev > graded10c.rows[0].ev,
   `suspect=$${graded10c.rows[1].ev.toFixed(0)} take=$${graded10c.rows[0].ev.toFixed(0)}`);
eq("the grade tally is reported", graded10c.byGrade, { TAKE: 1, SMALL: 0, SUSPECT: 1 });

console.log("\n[10d] ladder consistency — the only edge with no forecasting risk");
const rung = (strike, bid, ask, bidSize, askSize) => C({
  id: "KXHURCTOTMAJ-26DEC01-T" + strike, strike, market: (bid + ask) / 2,
  yesBid: bid, yesAsk: ask, spread: ask - bid, modelLayers: null, model: null, modelAt: () => null,
  depth: { bidSize, askSize, notional: 1 },
});

/* Executable violation: "more than 5" can be BOUGHT at 8c while "more than 6" can be
   SOLD at 12c. The second outcome implies the first, so the pair cannot lose. */
const arb = buildMTX([rung(5, 0.07, 0.08, 100, 400), rung(6, 0.12, 0.13, 300, 100)]).ladderArbs(0);
eq("one locked spread found", arb.executable.length, 1);
eq("buy the lower strike", arb.executable[0].buyStrike, 5);
eq("sell the higher strike", arb.executable[0].sellStrike, 6);
near("gross is the bid minus the ask", arb.executable[0].gross, 0.12 - 0.08, 1e-9);
ck("net is smaller than gross, because the fee is charged on both legs",
   arb.executable[0].net < arb.executable[0].gross, `${arb.executable[0].net} vs ${arb.executable[0].gross}`);
/* You BUY the low rung, so its ASK side is the constraint (400); you SELL the high rung,
   so its BID side is (300). The binding side is 300 — not either contract's other half. */
eq("size is the ask on the leg you buy against the bid on the leg you sell",
   Math.round(arb.executable[0].size), 300);

/* The case that matters more, because it is what an exchange screen shows. Mids invert
   on thin books constantly; the touch is ordered correctly and there is nothing to take.
   Calling this an arbitrage is how you lose money confirming a screenshot. */
const midOnly = buildMTX([rung(4, 0.07, 0.09, 100, 100), rung(5, 0.08, 0.10, 100, 100)]).ladderArbs(0);
eq("no locked spread", midOnly.executable.length, 0);
eq("but the displayed inversion is reported", midOnly.displayed.length, 1);
eq("with both displayed prices", [Math.round(midOnly.displayed[0].loP * 100), Math.round(midOnly.displayed[0].hiP * 100)], [8, 9]);

const clean = buildMTX([rung(4, 0.20, 0.22, 100, 100), rung(5, 0.10, 0.12, 100, 100)]).ladderArbs(0);
eq("a correctly ordered ladder reports nothing", [clean.executable.length, clean.displayed.length], [0, 0]);

/* A spread with nothing resting is not a spread. */
const noSize = buildMTX([rung(5, 0.07, 0.08, 100, 0), rung(6, 0.12, 0.13, 300, 100)]).ladderArbs(0);
eq("zero resting size is not an opportunity", noSize.executable.length, 0);

/* Non-adjacent rungs: the implication holds all the way up the ladder. */
const skip = buildMTX([rung(3, 0.05, 0.06, 100, 500), rung(4, 0.05, 0.055, 100, 100), rung(6, 0.20, 0.21, 200, 100)]).ladderArbs(0);
ck("a violation two rungs apart is caught", skip.executable.some((x) => x.buyStrike === 3 && x.sellStrike === 6),
   JSON.stringify(skip.executable.map((x) => x.buyStrike + "->" + x.sellStrike)));

/* Ladders must not be crossed with each other — different questions entirely. */
const crossed = buildMTX([
  rung(5, 0.07, 0.08, 100, 400),
  C({ id: "KXNAMEDSTORM-26DEC01EPACTOT-6", strike: 6, market: 0.5, yesBid: 0.5, yesAsk: 0.52,
      model: null, modelAt: () => null, modelLayers: null, depth: { bidSize: 900, askSize: 900, notional: 1 } }),
]).ladderArbs(0);
eq("two different ladders never form a spread", crossed.executable.length, 0);

console.log("\n[11] the committed board runs through it without throwing");
/* A smoke test against real data — shapes in the wild that the fixtures do not cover
   (null depth, missing yesAsk on legacy rows) must degrade, not crash. */
const latest = JSON.parse(readFileSync(resolve(__dir, "../docs/data/latest.json"), "utf8"));
const live = (latest.contracts || []).map((c) => Object.assign({}, c, {
  priceAt: () => c.market ?? null, modelAt: () => c.model ?? null,
}));
let book = null, threw = null;
try { book = buildMTX(live).edgeBook(0, 10000, 0.25, {}); } catch (e) { threw = String(e && e.message || e); }
ck("edgeBook survives the live board", !threw, threw || "");
if (book) {
  ck("coverage matches the file", book.coverage.total === live.length, `${book.coverage.total}/${live.length}`);
  const sum = Object.values(book.skipped).reduce((a, b) => a + b, 0);
  ck("every contract is either ranked or accounted for as skipped",
     sum + book.candidates === live.length, `skipped=${sum} candidates=${book.candidates} total=${live.length}`);
  ck("no ranked row has a negative expected value", book.rows.every((r) => r.ev > 0));
  ck("no ranked row lacks a model", book.rows.every((r) => r.model != null));
  console.log(`         live board: ${book.coverage.anchored}/${book.coverage.total} anchored · ${book.candidates} candidates · ${book.rows.length} shown`);
}

console.log(fail ? `\n${fail} FAILURE(S)\n` : "\nall assertions passed\n");
process.exit(fail ? 1 : 0);
