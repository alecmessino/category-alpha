/* Where a mark came from, and the one place the map decides how to say so.
 *
 * Two of the Atlas's visual distinctions are about PROVENANCE rather than about a storm: a
 * track portion that precedes genesis, and a landfall the archive derived instead of read.
 * Both already had an answer -- selection-layer.js states the rule in prose and implements it
 * for the selected storm -- and the answer simply never reached the population layer.
 *
 * SO THIS FILE EXISTS TO STOP THE RULE BEING WRITTEN A FOURTH TIME. Before it, the pre-genesis
 * predicate lived at selection-layer.js twice and ui/transport.jsx once, and the three copies
 * had already drifted: two guarded genesis with `!Number.isNaN(g) && g !== I32_NULL` and one
 * with `g !== I32_NULL` alone. That is exactly the shape of divergence that ends with two
 * surfaces disagreeing about where a storm began, so the predicate is defined once here and
 * imported rather than retyped.
 *
 * THE INK CONSTANTS ARE THE ONES ALREADY SHIPPED. Nothing here is a new visual semantic. The
 * dash pattern and alpha are lifted verbatim from what the selected storm has always used, so
 * propagating the treatment cannot silently restyle the surface that already had it.
 */

/** The pack's null for an int32 minute column. */
export const I32_NULL = -2147483648;

/**
 * Genesis for storms[row], in packed minutes, or null where the archive published none.
 *
 * 54 storms have no genesis at all. They are not pre-genesis and not post-genesis: the question
 * does not apply, and every caller below answers false for them rather than guessing a side.
 */
export function genesisMinute(archive, row) {
  const g = archive.genesisT[row];
  return Number.isNaN(g) || g === I32_NULL ? null : g;
}

/**
 * Is a SEGMENT part of the pre-genesis portion?
 *
 * The test is on the segment's FORWARD endpoint, not its start: the segment that ends exactly
 * at genesis is the last pre-genesis one, and the segment leaving genesis is the first of the
 * storm proper. That is the rule selection-layer.js has always used, and matching it is the
 * whole point of this function existing.
 */
export function isPreGenesisSegment(forwardEndMinute, genesisMin) {
  return genesisMin !== null && forwardEndMinute <= genesisMin;
}

/** Is a FIX before genesis? Strict, because a fix AT genesis is the genesis fix. */
export function isPreGenesisFix(minute, genesisMin) {
  return genesisMin !== null && minute < genesisMin;
}

/* The pre-genesis treatment, exactly as selection-layer.js has drawn it: dimmed, dashed, and
   in an ink that is deliberately outside the intensity ramp because a disturbance has no
   category to report. */
export const PRE_GENESIS_DASH = [2, 3];
export const PRE_GENESIS_ALPHA = 0.5;

/* ---- landfall provenance ------------------------------------------------------------------
 *
 * The archive establishes a landfall three ways and records which. `hurdat2_L_record` is NHC's
 * post-storm analyst judgement. `bracketing_fix` is a published fix that fell inside the
 * polygon. `segment_crossing` is derived: both bracketing fixes were over water and the
 * interpolated path cut the coast.
 *
 * DERIVED IS NOT INVALID, and the encoding must not read as a warning. For roughly forty years
 * of East Pacific landfalls a segment crossing is the ONLY answer that exists -- NHC did not
 * systematically flag them until about 1988 (geo.py:9-15) -- so a derived mark is the archive
 * doing its job, not failing at it. The distinction is carried in mark FORM, never in hue: the
 * landfall colour keeps its single job, and no landfall mark is ever coloured by category,
 * which is what preserves the withheld Saffir-Simpson class as withheld rather than letting a
 * mark imply a class the archive declined to publish.
 */
export const DETECTION_RECORDED = "hurdat2_L_record";
export const DETECTION_BRACKETED = "bracketing_fix";
export const DETECTION_DERIVED = "segment_crossing";

/**
 * How a landfall mark should state the way it was established.
 *
 * `suspect` outranks the detection kind because it is a stronger statement about the same row:
 * the archive excludes those crossings from every rate it publishes, so a mark that merely said
 * "derived" would understate it.
 */
export function landfallForm(landfall) {
  if (landfall.suspect_relocation === true) return "suspect";
  if (landfall.detection === DETECTION_DERIVED) return "derived";
  if (landfall.detection === DETECTION_BRACKETED) return "bracketed";
  return "recorded";
}
