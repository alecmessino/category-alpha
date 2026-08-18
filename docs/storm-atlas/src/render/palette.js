/* Colour, and the short list of things it is allowed to mean.
 *
 * Five jobs, and nothing else gets a hue: INTENSITY, SELECTION, DATA QUALITY, LANDFALL, and
 * (in a later phase) information advantage. Everything else is text on a surface. A metric
 * that gets its own colour because it was next in the file is how a research instrument turns
 * into a dashboard.
 *
 * The ramp is built from the design system's own accents rather than a new gradient. It runs
 * muted -> cool -> warm -> hot, so intensity reads as heat without becoming a rainbow, and
 * violet at Cat 5 is both the system's `--special` and the convention an operator already
 * reads on other tropical products.
 */

import { THRESHOLDS_KT } from "../engine/stats.js";

export const CATEGORY_COLOR = {
  td: "#94a3b8",    // --ink-400   below tropical-storm force
  ts: "#7fb2e6",    // --blue-300
  cat1: "#38bdf8",  // --cyan-400
  cat2: "#fbbf24",  // --amber-400
  cat3: "#f59e0b",  // --amber-500  major hurricane begins here
  cat4: "#ef4444",  // --red-500
  cat5: "#8b5cf6",  // --violet-500
};

export const CATEGORY_ORDER = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];

/** The colour of the population when it is context rather than subject. */
export const POPULATION_INK = "#5b7799";

/** Wind that was never recorded. Not a category, and never drawn as one. */
export const UNKNOWN_INK = "#3d4d63";

export const SELECTION_INK = "#e6edf6";
export const LANDFALL_INK = "#ef4444";
export const GENESIS_INK = "#38bdf8";

/**
 * Category index for a wind in knots, or -1 when no wind was recorded.
 *
 * Returns -1 rather than 0 for a missing value, for the same reason schema.py's category_for
 * returns None rather than 'td': a fix whose intensity was never recorded is not a depression.
 * The renderer draws those in UNKNOWN_INK, which is visibly not part of the ramp.
 */
export function categoryIndex(vmaxKt) {
  if (vmaxKt === null || vmaxKt === undefined || Number.isNaN(vmaxKt)) return -1;
  if (vmaxKt >= THRESHOLDS_KT.cat5) return 6;
  if (vmaxKt >= THRESHOLDS_KT.cat4) return 5;
  if (vmaxKt >= THRESHOLDS_KT.cat3) return 4;
  if (vmaxKt >= THRESHOLDS_KT.cat2) return 3;
  if (vmaxKt >= THRESHOLDS_KT.cat1) return 2;
  if (vmaxKt >= THRESHOLDS_KT.ts) return 1;
  return 0;
}

/** Same, straight off the packed int16 column, where -32768 marks "no wind recorded". */
export function categoryIndexRaw(v) {
  if (v === -32768) return -1;
  if (v >= THRESHOLDS_KT.cat5) return 6;
  if (v >= THRESHOLDS_KT.cat4) return 5;
  if (v >= THRESHOLDS_KT.cat3) return 4;
  if (v >= THRESHOLDS_KT.cat2) return 3;
  if (v >= THRESHOLDS_KT.cat1) return 2;
  if (v >= THRESHOLDS_KT.ts) return 1;
  return 0;
}
