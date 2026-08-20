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

/* Cat 3 was pulled toward orange and Cat 2 toward a cooler yellow so that the two stay
   separable at a 1 px stroke and in monochrome -- the pair that decides "major hurricane" is
   the one pair a reader must never misread, and amber-against-amber failed that at basin
   zoom. The major classes also carry MAJOR_WEIGHT extra stroke, so the distinction survives
   colour blindness and a printed page as well as a screen. */
export const CATEGORY_COLOR = {
  td: "#9aabbf",    // below tropical-storm force
  ts: "#8cbdea",
  cat1: "#4fc3f7",
  cat2: "#f2c14e",
  cat3: "#ee7a1f",  // major hurricane begins here
  cat4: "#ef5350",
  cat5: "#9b7bf0",
};

export const CATEGORY_ORDER = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];

/** Extra stroke on the major-hurricane classes, so cat2 and cat3 stay apart at 1 px. */
export const MAJOR_WEIGHT = 1.35;

/** The first index in CATEGORY_ORDER that is a major hurricane. */
export const MAJOR_FROM = 4;

/** The colour of the population when it is context rather than subject. */
export const POPULATION_INK = "#7a9cbb";

/** The pool a query lifted out of the population. */
export const EMPHASIS_INK = "#cfe6fa";

/** Wind that was never recorded. Not a category, and deliberately outside the ramp. */
export const UNKNOWN_INK = "#6a7c92";

export const SELECTION_INK = "#ffffff";
export const LANDFALL_INK = "#f46966";
export const GENESIS_INK = "#65cdfa";
export const GENESIS_LIFTED_INK = "#9fdfff";
/** Hollow, stroke only -- see replay-layer.js. */
export const REPLAY_HEAD_INK = "rgba(224,238,250,.92)";

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
