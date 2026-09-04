/* ONE OUTCOME, UNDER THE ARCHIVE'S FOUR PANEL RULES.
 *
 *   1. NO BARE PERCENTAGE. The percent never appears without the count, the denominator and the
 *      95% Wilson interval in the same block. A reader who wants only the percent has to ignore
 *      the evidence beside it; they are never handed the percent alone.
 *   2. A REFUSED RATE PRINTS ITS REFUSAL -- the archive's own reason, verbatim. Never 0.0%.
 *   3. AN UNSCOREABLE CONTRACT PRINTS `BASE RATE ONLY`. No skill number for it exists anywhere
 *      in this repository to display.
 *   4. THE CONDITIONING NOTE TRAVELS WITH THE NUMBERS, so it cannot drift from what it
 *      qualifies.
 *
 * THE INTERVAL IS DRAWN, NOT ONLY PRINTED. The bar carries the rate as a filled length and the
 * Wilson interval as a paler band spanning it, so the width of what is not known is the first
 * thing seen and the digits are the confirmation. 26.9% [23.3-30.8] and 30.2% [24.5-36.7] are
 * two lines of near-identical text and two visibly different bands; the second is the reading
 * that matters, and 3.4's comparison rests on a reader already having it.
 *
 * THIS IS THE ONLY PLACE A RATE IS RENDERED. `OutcomeLadder` and `RateLine` both live here, so
 * the ladder and the compact form in a list cannot come to disagree about how a refusal reads.
 *
 * THE SIX PER-CONTRACT CARDS ARE GONE, and with them CardHead, IntervalBar, Delta and
 * ConditionedGroup. They are not kept "in case": a second way to render a rate is a second way
 * for a rate to be rendered wrongly, and the whole argument for one rendering site is that there
 * is exactly one. The measure, the interval band and the baseline beneath it all survive inside
 * the ladder row -- see atlas.css for what the compression does and does not give up.
 */

import React from "react";
import { MONO, OverDenom } from "./kit.jsx";
import { REFUSALS, Refusal } from "./refusal.jsx";

const CIRCULAR = "CONDITIONED ON -- NOT AN OUTCOME";

/* WHICH REFUSAL THE ENGINE PRODUCED. The status string is the engine's, not the surface's --
   picking the card by re-deriving the condition here would be a second implementation of the
   gate, and the two would drift. */
export function refusalKindOf(u) {
  return u && /^OUT OF SCOPE/.test(u.status || "") ? "OUT_OF_SCOPE" : "BASE_RATE_ONLY";
}

/* BOTH COUNTS, because their difference IS the finding: 0 in scope against 11 archive-wide says
   "your population cannot reach these", which is a different statement from "they do not
   exist". Before 1.1.0 only the second number was shown, and it was the wrong one. */
export function countsOf(u) {
  if (!u) return undefined;
  if (u.scope_events === undefined || u.scope_events === u.archive_events) {
    return `${u.archive_events} archive-wide · ${u.required} needed`;
  }
  return `${u.scope_events} ${u.scope} · ${u.archive_events} archive-wide · `
    + `${u.required} needed`;
}

/* THE LADDER AND THE RATE LINE ARE GONE, AND WHAT THEY LEFT BEHIND IS THIS FILE'S POINT.
 *
 * `OutcomeLadder` and `RateLine` rendered the outcome panel this surface no longer has: the deck
 * replaced the ladder, and the answer replaced the compact line. Both were unreferenced -- the
 * only import anywhere is `refusalKindOf` and `countsOf`, in evidence-deck.jsx -- and dead JSX
 * that still reads the refusal registry is exactly the code that goes on looking correct while
 * nothing renders it.
 *
 * The two functions kept here are not presentation: they are the READINGS every surface makes of
 * an unscoreable cell -- which refusal kind it is, and what counts it publishes -- and they stay
 * in one place so the deck, the answer and the limits cannot disagree about either.
 */
