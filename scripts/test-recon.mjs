#!/usr/bin/env node
/* Tests for the Vortex Data Message parser.
 *
 * This is the highest-consequence parser in the build. A VDM is the only MEASUREMENT of
 * a storm's intensity the board holds, it arrives before the advisory that reports it,
 * and it is the input that raises evidence quality to its top tier. Every one of those
 * properties makes a wrong number here worse than no number: a mis-read pressure would
 * be the most confident-looking figure on the page.
 *
 * Both fixtures are real messages, byte for byte, from the live products (URPN12 KNHC
 * for CP012026 and URNT12 KNHC for AL022026, read 14 Aug 2026). They differ in ways that
 * matter — one has a measured central pressure and the other an extrapolated one, one is
 * a 700 mb flight and the other 850 mb — and both letter layouts have to parse.
 *
 * WHAT IS ASSERTED MOST HEAVILY: the refusals. A message about a storm that dissipated
 * in July sits in the "latest" file until an aircraft flies again, so the parser's job is
 * as much about not attaching that fix to an August storm as it is about reading it.
 *
 * Run: node scripts/test-recon.mjs
 */
import { parseVDM, parseReccoHeader, vdmKey, vdmTime, FL_REDUCTION } from "./lib/recon.mjs";

let fail = 0;
const ck = (n, c, d = "") => { if (!c) fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (d ? "  " + d : "")); };
const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fail++;
  console.log((ok ? "  ok   " : "  FAIL ") + n + (ok ? "" : `  got=${JSON.stringify(g)} want=${JSON.stringify(w)}`)); };

const NOW = Date.UTC(2026, 7, 14, 22, 0);

const PACIFIC = `URPN12 KNHC 142104
VORTEX DATA MESSAGE   CP012026
A. 14/20:46:50Z
B. 17.33 deg N 151.19 deg W
C. 700 mb 3077 m
D. 999 mb
E. 080 deg 9 kt
F. NA
G. NA
H. 45 kt
I. 331 deg 39 nm 20:35:00Z
J. 090 deg 51 kt
K. 349 deg 95 nm 20:19:00Z
L. 29 kt
M. 090 deg 0 nm 20:47:00Z
N. 252 deg 27 kt
O. 180 deg 22 nm 20:53:30Z
P. 10 C / 3050 m
Q. 11 C / 3046 m
R. 10 C / NA
S. 134 / 07
T. 0.02 / 6 nm
U. AF305 0701C LALA    OB 04
MAX FL WIND 51 KT 349 / 95 NM 20:19:00Z
MAX FL TEMP 12 C 345 / 69 NM FROM FL CNTR
;`;

const ATLANTIC = `URNT12 KNHC 231314
VORTEX DATA MESSAGE   AL022026
A. 23/11:36:40Z
B. 29.63 deg N 092.45 deg W
C. 850 mb 1466 m
D. EXTRAP 1004 mb
E. NA
F. NA
G. NA
H. 34 kt
I. 128 deg 55 nm 11:09:00Z
J. 192 deg 38 kt
K. 114 deg 77 nm 11:00:00Z
L. 26 kt
M. 260 deg 45 nm 11:50:30Z
N. 357 deg 24 kt
O. 252 deg 106 nm 12:12:30Z
P. 18 C / 1524 m
Q. 23 C / 1520 m
R. NA / NA
S. 1345 / 8
T. 0.02 / 3 nm
U. AF308 1302A BERTHA    OB 03
MAX FL WIND 38 KT 114 / 77 NM 11:00:00Z
SLP EXTRAP FROM 850 MB
;`;

console.log("\n[1] the live Pacific message");
const P = parseVDM(PACIFIC, NOW);
eq("it parses", P.ok, true);
eq("the storm it is about", P.stormId, "CP012026");
eq("the fix time", P.fixIso, "2026-08-14T20:46:50.000Z");
eq("the centre", P.center, [17.33, -151.19]);
/* Field C is the LEVEL FLOWN. Reading it as the storm's central pressure would report a
   700 mb hurricane — a record-breaking storm, from a routine flight. */
eq("the flight level is the level flown", P.flightLevelMb, 700);
eq("and the central pressure comes from D alone", P.mslp, 999);
eq("measured, not extrapolated", P.extrapolated, false);
eq("the surface wind", P.surfaceKt, 45);
eq("the flight-level wind", P.flightLevelKt, 51);
eq("the mission", [P.mission.aircraft, P.mission.storm, P.obNumber], ["AF305", "LALA", 4]);
/* RAW AND CALIBRATED. The reduction is NHC's published operational factor, applied to
   the measured flight-level wind and published alongside it — never instead of it. */
eq("the published 700 mb reduction factor is used", P.reductionFactor, FL_REDUCTION[700]);
eq("and the reduced wind is published beside the raw one", P.reducedSurfaceKt, Math.round(51 * 0.9));
ck("the raw flight-level wind survives the reduction", P.flightLevelKt === 51);
/* The measured surface wind outranks a reduced one — a radiometer reading the surface
   beats an inference from 10,000 feet. */
eq("the measured surface wind is preferred over the reduced one", P.intensityKt, 45);
ck("and it says which answered", /SFMR/.test(P.intensitySource), P.intensitySource);

console.log("\n[2] the live Atlantic message — a different layout of the same product");
const A = parseVDM(ATLANTIC, Date.UTC(2026, 6, 23, 14, 0));
eq("it parses too", A.ok, true);
eq("its storm", A.stormId, "AL022026");
eq("an extrapolated pressure is read", A.mslp, 1004);
/* An extrapolated pressure is a materially weaker observation than a measured one, and
   the flag is what lets every surface downstream say so. */
eq("and flagged as extrapolated", A.extrapolated, true);
eq("850 mb has its own published factor", A.reductionFactor, FL_REDUCTION[850]);
eq("flown at 850 mb", A.flightLevelMb, 850);
eq("surface wind", A.surfaceKt, 34);
eq("flight-level wind", A.flightLevelKt, 38);

console.log("\n[3] the fields whose meaning this build cannot state");
/* E, F and G differ between the two live samples and nothing here knows what they are.
   Captured verbatim, given no meaning, and above all never read as a wind — a number
   pulled out of a field whose definition is a guess looks exactly like a real one. */
eq("they are captured", P.unparsed.E, "080 deg 9 kt");
ck("and they are not any published wind", P.surfaceKt !== 9 && P.flightLevelKt !== 9);

console.log("\n[4] the trailer governs, and a disagreement is reported rather than hidden");
const shifted = PACIFIC.replace("MAX FL WIND 51 KT", "MAX FL WIND 66 KT");
const S = parseVDM(shifted, NOW);
eq("the trailer wins", S.flightLevelKt, 66);
/* If these ever disagree the lettered fields have shifted under us, which is exactly the
   failure that silently reads the wrong number out of the right message. */
eq("and the disagreement is published", S.flDisagreement, { trailer: 66, lettered: 51 });
eq("agreement reports no disagreement", P.flDisagreement, null);

console.log("\n[5] refusals");
eq("a product that is not a VDM is refused", parseVDM("URNT11 KNHC 141129\n97779 11274", NOW).ok, false);
eq("so is an empty message", parseVDM("", NOW).ok, false);
/* A VDM with a header and no numbers is not a fix. Returning ok with three nulls would
   let it raise an arrival, reset the age, and lift the evidence tier on nothing. */
const bare = parseVDM("URPN12 KNHC 142104\nVORTEX DATA MESSAGE   CP012026\nA. 14/20:46:50Z\nD. NA\nH. NA\nJ. NA\n;", NOW);
eq("a message with no pressure and no wind is refused", bare.ok, false);
ck("and says why", /no pressure or wind/.test(bare.note), bare.note);
/* Field C's pressure must never leak into the central-pressure field. */
const noD = parseVDM(PACIFIC.replace("D. 999 mb", "D. NA"), NOW);
eq("no D means no central pressure — C is not a substitute", noD.mslp, null);
ck("but the fix still stands on its winds", noD.ok === true && noD.surfaceKt === 45);
/* A pressure outside the range a sea-level pressure can take is a mis-parse. */
eq("an impossible pressure is refused", parseVDM(PACIFIC.replace("D. 999 mb", "D. 700 mb"), NOW).mslp, null);

console.log("\n[6] the month boundary");
/* "14/20:46:50Z" carries no month. A fix that lands days in the future is last month's. */
eq("a same-month fix", vdmTime("14/20:46:50Z", NOW), "2026-08-14T20:46:50.000Z");
eq("a fix dated after now rolls back a month",
   vdmTime("31/23:00:00Z", Date.UTC(2026, 8, 2, 1, 0)), "2026-08-31T23:00:00.000Z");
eq("a malformed time is refused", vdmTime("nonsense", NOW), null);

console.log("\n[7] identity — what makes an arrival an arrival");
/* The file is re-read every ten minutes and holds the same message until an aircraft
   reports again. Without identity the register would raise the same fix six times an
   hour, which is how a register stops being read. */
eq("the same message has the same key", vdmKey(parseVDM(PACIFIC, NOW)), vdmKey(P));
ck("a new observation number is a new fix",
   vdmKey(parseVDM(PACIFIC.replace("OB 04", "OB 05"), NOW)) !== vdmKey(P));
ck("and so is a new fix time",
   vdmKey(parseVDM(PACIFIC.replace("A. 14/20:46:50Z", "A. 14/21:46:50Z"), NOW)) !== vdmKey(P));
eq("an unparsed message has no key", vdmKey({ ok: false }), null);

console.log("\n[8] the coded products are recorded, not decoded");
const R = parseReccoHeader(`URPN11 KNHC 141129
97779 11274 61181 5180/ 73300 05041 6393/ /5759
RMK AF302 0601C LALA               OB 31
LAST REPORT
;`);
eq("the header is read", R.ok, true);
eq("the mission is read", R.mission.storm, "LALA");
eq("the end of a mission is worth knowing", R.lastReport, true);
/* The digits are a code this build does not decode, and it says so rather than guessing
   at them. A decoded-wrong wind is indistinguishable from a decoded-right one. */
ck("and it states that it did not decode the numbers", /not decoded/.test(R.note), R.note);

console.log(fail ? `\n${fail} FAILED\n` : "\nall reconnaissance checks passed\n");
process.exit(fail ? 1 : 0);
