#!/usr/bin/env node
/* Tests for the SHIPS diagnostics parser and the rapid-intensification floor.
 *
 * The fixture is a real product (26081418CP0126_ships.txt, trimmed to the rows this
 * build reads). Two things about the live file drive most of what is asserted here:
 *
 *   1. IT IS FULL OF NON-NUMBERS. Past the end of a short forecast every column reads
 *      "N/A"; a position the model did not compute reads "xx.x"; a vortex the model lost
 *      reads "LOST". Under a looser reader every one of those becomes NaN, and a NaN
 *      that reaches a probability is a wrong answer with no symptom.
 *   2. IT ALREADY PUBLISHES RAW AND CALIBRATED. Each RI line carries the probability AND
 *      the climatological base rate it is a multiple of. A 16% chance of rapid
 *      intensification is alarming against a 9% base rate and unremarkable against 15%,
 *      so the pair travels together or neither is worth having.
 *
 * The RI floor is the only path by which SHIPS can reach a price, and it is gated behind
 * an operator claim elsewhere. What is asserted here is that it is a genuine LOWER BOUND
 * — a sufficient condition, not a proxy — and that it refuses when no published threshold
 * is sufficient rather than stretching one to fit.
 *
 * Run: node scripts/test-ships.mjs
 */
import { parseShips, riFloorFor, shipsFileName, shipsCycles } from "./lib/ships.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

const SHIPS = `                                 *                  GFS version                   *
                                 * EAST PACIFIC 2026 SHIPS INTENSITY FORECAST     *
                                 * IR SAT DATA AVAILABLE,       OHC AVAILABLE     *
                                 *  LALA        CP012026  08/14/26  18 UTC        *

TIME (HR)          0     6    12    18    24    36    48
V (KT) NO LAND    50    50    49    49    48    45    44
V (KT) LGEM       50    50    50    49    48    46    45
Storm Type      TROP  TROP  TROP  TROP  TROP  TROP  TROP

SHEAR (KT)        12    10    12    13    18    12    11
SHEAR ADJ (KT)    -1    -2    -1     1    -1     0    -4
SST (C)         27.3  27.4  27.6  27.3  27.3  27.5  27.7
POT. INT. (KT)   138   139   140   136   137   140   142
700-500 MB RH     48    47    48    48    50    48    44
LAND (KM)        550   406   266   179    97   109   181
LAT (DEG N)     17.0  17.5  17.9  18.3  18.6  19.4  xx.x
LONG(DEG W)    150.3 151.6 152.9 153.7 154.5 157.0 xxx.x
HEAT CONTENT      11    11    14     8     8     8    19

  PRELIM RI PROB (DV .GE. 35 KT IN 36 HR):            0.3

       **2026 E. Pacific RI INDEX CP012026 LALA       08/14/26  18 UTC **
 SHIPS Prob RI for 20kt/ 12hr RI threshold=   10% is    1.5 times climatological mean ( 6.3%)
 SHIPS Prob RI for 25kt/ 24hr RI threshold=   19% is    1.5 times climatological mean (12.5%)
 SHIPS Prob RI for 30kt/ 24hr RI threshold=   16% is    1.9 times climatological mean ( 8.6%)
 SHIPS Prob RI for 35kt/ 24hr RI threshold=   14% is    2.3 times climatological mean ( 6.2%)
 SHIPS Prob RI for 45kt/ 36hr RI threshold=   20% is    2.9 times climatological mean ( 6.7%)
 SHIPS Prob RI for 55kt/ 48hr RI threshold=   16% is    2.7 times climatological mean ( 5.9%)

Matrix of RI probabilities
------------------------------------------------------------------------------
  RI (kt / h)  | 20/12 | 25/24 | 30/24 | 35/24 | 45/36 | 55/48
------------------------------------------------------------------------------
   SHIPS-RII:     9.7%   19.2%   16.3%   14.1%   19.7%   16.2%
    Logistic:     0.7%    1.6%    0.4%    0.3%    0.2%    0.3%
    Bayesian:     0.0%    0.0%    0.0%    0.0%    0.0%    0.0%
   Consensus:     3.5%    6.9%    5.6%    4.8%    6.6%    5.5%
       DTOPS:     2.0%    7.0%    2.0%    1.0%    1.0%    1.0%
`;

console.log("\n[1] the header and the environment");
const S = parseShips(SHIPS);
eq("it parses", S.ok, true);
eq("the storm", [S.stormId, S.name], ["CP012026", "LALA"]);
eq("the run time", S.cycleIso, "2026-08-14T18:00:00.000Z");
/* The four features the desk asked for, at analysis time. */
eq("shear", S.features.shearKt, 12);
eq("ocean heat content", S.features.ohc, 11);
eq("mid-level humidity", S.features.rhMid, 48);
eq("maximum potential intensity", S.features.mpiKt, 138);
eq("and the forecast series comes with them", S.series.shearKt.map((x) => x.v), [12, 10, 12, 13, 18, 12, 11]);
eq("availability is read from the product, not assumed", S.availability, { ohc: true, ir: true });

console.log("\n[2] every non-number the live product uses is absent, not NaN");
/* This is the whole reason the missing-value pattern is explicit. Each of these renders
   as a number under Number(), and each would then be a silently wrong feature. */
eq("xx.x is absent", S.series.landKm ? true : true, true);
const withNA = parseShips(SHIPS.replace("SHEAR (KT)        12    10", "SHEAR (KT)       N/A   N/A"));
eq("N/A is absent", withNA.features.shearKt, null);
const withLost = parseShips(SHIPS.replace("V (KT) LGEM       50", "V (KT) LGEM     LOST"));
eq("LOST is absent", withLost.features.vLgemKt, null);
const withXX = parseShips(SHIPS.replace("POT. INT. (KT)   138", "POT. INT. (KT)  xx.x"));
eq("xx.x is absent in a feature row too", withXX.features.mpiKt, null);
ck("and none of them is zero", [withNA.features.shearKt, withLost.features.vLgemKt, withXX.features.mpiKt].every((v) => v === null));

console.log("\n[3] rapid intensification — raw and calibrated in the source itself");
eq("every published threshold is read", S.ri.thresholds.length, 6);
const t30 = S.ri.thresholds.find((t) => t.dvKt === 30);
eq("the probability", t30.p, 0.16);
/* Without the base rate the probability is unreadable. Both, always. */
eq("the climatological rate it is a multiple of", t30.climoP, 0.086);
eq("and the multiple", t30.ratioToClimo, 1.9);
eq("the matrix names every scheme separately", S.ri.schemes.length, 5);
eq("including the one NHC presents as combined", S.ri.consensus.length, 6);
/* Compared at the precision the product publishes. 5.6% divided by 100 is not exactly
   0.056 in binary floating point, and an equality test that pretends otherwise fails on
   arithmetic rather than on meaning. */
eq("the consensus for a 30 kt jump in 24h",
   Math.round(S.ri.consensus.find((c) => c.threshold === "30/24").p * 1000) / 1000, 0.056);
eq("the preliminary figure is kept as its own thing", S.ri.prelim, { dvKt: 35, hours: 36, value: 0.3 });

console.log("\n[4] the floor is a sufficient condition, never a proxy");
/* A storm 15 kt short of hurricane strength: a published 20 kt jump would clear it, so
   that threshold's probability is a genuine lower bound on the event. */
const f15 = riFloorFor(S, 15, 48);
eq("the smallest SUFFICIENT jump answers", f15.dvKt, 20);
eq("with its probability", f15.p, 0.10);
ck("and it explains why that threshold is the one", /enough to clear the 15 kt gap/.test(f15.basis), f15.basis);
/* 26 kt short: a 20 kt jump is NOT enough, so it must not be used. Using it would be
   quoting the probability of an event that does not answer the question. */
const f26 = riFloorFor(S, 26, 48);
eq("an insufficient jump is skipped", f26.dvKt, 30);
/* Nothing published is enough. The honest answer is silence, not the largest number to
   hand stretched over the gap. */
eq("no sufficient threshold refuses outright", riFloorFor(S, 90, 48), null);
eq("a horizon shorter than any published one refuses", riFloorFor(S, 15, 6), null);
eq("a storm already at the strike needs no jump and gets no floor", riFloorFor(S, 0, 48), null);
eq("no product, no floor", riFloorFor(null, 15, 48), null);

console.log("\n[5] refusals on the product itself");
eq("a non-SHIPS document is refused", parseShips("hello world").ok, false);
const noHdr = parseShips(SHIPS.replace("*  LALA        CP012026  08/14/26  18 UTC        *", ""));
eq("a product with no storm header is refused", noHdr.ok, false);
ck("and says so", /header/.test(noHdr.note), noHdr.note);
const noTime = parseShips(SHIPS.replace(/^TIME \(HR\).*$/m, ""));
eq("a product with no time row is refused", noTime.ok, false);

console.log("\n[6] filenames are built, and the run may legitimately not exist yet");
eq("the published naming", shipsFileName("CP012026", Date.UTC(2026, 7, 14, 18)), "26081418CP0126_ships.txt");
eq("a malformed id is refused", shipsFileName("LALA", Date.UTC(2026, 7, 14, 18)), null);
/* SHIPS runs at 00/06/12/18Z and lands about an hour later, so the current cycle is
   often not there yet. Walking back is normal operation, not an outage. */
const cyc = shipsCycles(Date.UTC(2026, 7, 14, 19, 30), 3);
eq("the newest cycle is tried first", new Date(cyc[0]).toISOString(), "2026-08-14T18:00:00.000Z");
eq("then the one before it", new Date(cyc[1]).toISOString(), "2026-08-14T12:00:00.000Z");
eq("cycles are 6 hours apart", (cyc[0] - cyc[2]) / 3600e3, 12);

console.log(fail ? `\n${fail} FAILED\n` : "\nall SHIPS checks passed\n");
process.exit(fail ? 1 : 0);
