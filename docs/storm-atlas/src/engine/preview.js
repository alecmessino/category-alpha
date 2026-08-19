/* What a condition would cost, counted before the reader pays it.
 *
 * WHY THIS EXISTS. A query builder that only tells you what a filter did after you applied it
 * makes the archive feel like a machine you poke until something happens. Every chip in the
 * builder carries its own count instead -- "AUG 1,204", "CAT 3+ 87" -- so composing a cohort is
 * reading the archive rather than guessing at it.
 *
 * COUNTED AGAINST THE POPULATION THAT SATISFIES EVERY OTHER CONDITION, never against the
 * current cohort. Two reasons, and the second is the load-bearing one:
 *
 *   1. It stays still. Toggling AUG on must not renumber SEP; a number that moves when you
 *      touch an unrelated control cannot be read.
 *   2. It is the true count. Months compose as a UNION -- clicking SEP while AUG is on WIDENS
 *      the cohort -- so a preview counted against the current cohort would report how many of
 *      the August storms formed in September, which is zero, for every month. The number a
 *      reader wants is "of the storms that satisfy everything else, how many formed in
 *      September", and that is what this counts.
 *
 * ONE CONSEQUENCE WORTH SEEING, AND ITS EXACT LIMIT. While a dimension carries NO condition,
 * its basis is the cohort itself, and an outcome-side preview count is then literally the
 * outcome count: the CAT 3+ chip reads 145 because 145 of these storms reached Cat 3, which is
 * exactly the number the outcome card above it publishes (test-atlas-cohort [11] pins the
 * equality). Clicking it conditions the cohort on the number the reader just read -- and the
 * fifth rule then refuses to report it back as a finding. Making the circularity visible at the
 * moment of the click is the whole point of previewing here rather than explaining later.
 *
 * ONCE THAT DIMENSION CARRIES A CONDITION THE TWO NUMBERS PART, and they are answering
 * different questions: the card counts within the cohort, the chip counts over the basis, so a
 * cohort already restricted to Mexico landfalls shows CENTRAL AMERICA 9 on the chip ("switch to
 * this") and 2 on the card ("also came ashore there"). Both are right and neither is the other.
 * A surface showing both must say which population each is over -- see the basis line in
 * cohort-builder.jsx, which appears exactly when the two diverge.
 *
 * RULE 4 SURVIVES THE PREVIEW. A storm the archive holds no wind for is not counted as failing
 * an intensity chip; it is reported separately as unknown, exactly as `filterStorms` does.
 */

import { INTENSITY_FILTERS, LANDFALL_FILTERS, filterStorms } from "./query.js";
import { THRESHOLDS_KT } from "./stats.js";
import { toFilters, withoutCondition } from "./cohort.js";

/** Archive-wide subbasin counts, cached: a property of the pack, not of any one cohort. */
const ARCHIVE_SUBBASINS = new WeakMap();

function archiveSubbasinCounts(archive) {
  let c = ARCHIVE_SUBBASINS.get(archive);
  if (c) return c;
  c = {};
  for (const code of archive.subbasinBits) {
    let n = 0;
    for (let i = 0; i < archive.nStorms; i++) if (archive.entered(i, code)) n++;
    c[code] = n;
  }
  ARCHIVE_SUBBASINS.set(archive, c);
  return c;
}

/**
 * @returns {{months, basins, subbasinsEntered, subbasinsArchive, intensity, landfall,
 *            intensityUnknown, basisOf}} counts keyed by chip. `basisOf[dim]` is the size of the population each
 *   dimension's counts were taken over, so a surface can state the denominator rather than
 *   printing a bare number.
 */
export function previewCounts(archive, spec) {
  const out = {
    months: {}, basins: {}, subbasinsEntered: {}, subbasinsArchive: {}, intensity: {},
    landfall: {}, intensityUnknown: 0, basisOf: {},
  };

  const rowsWithout = (dim) => {
    const r = filterStorms(archive, toFilters(withoutCondition(spec, dim)));
    out.basisOf[dim] = r.kept;
    return r.rows;
  };

  const S = archive.storms;
  const G = archive.genesis;

  // ---- months: the month of GENESIS, read the same way filterStorms reads it ----------------
  {
    const rows = rowsWithout("months");
    for (let k = 0; k < rows.length; k++) {
      const gt = G.num("genesis_t", rows[k]);
      if (gt === null) continue;
      const m = new Date(gt * 60000).getUTCMonth() + 1;
      out.months[m] = (out.months[m] || 0) + 1;
    }
  }

  // ---- genesis basin -----------------------------------------------------------------------
  {
    const rows = rowsWithout("basins");
    for (let k = 0; k < rows.length; k++) {
      const b = S.str("basin", rows[k]);
      if (b) out.basins[b] = (out.basins[b] || 0) + 1;
    }
  }

  /* ---- entered a subbasin at any point in its life ------------------------------------------
     Also counted ARCHIVE-WIDE, because the two zeroes mean opposite things. "CP 0" in a cohort
     says none of these storms went there, which is an answer. "EP 0" says the pack never sets
     that bit for any storm at all -- IBTrACS records EP as a basin and leaves the subbasin field
     empty -- so offering it as a control would be offering a filter that cannot ever do
     anything. The builder renders the first and names the second. */
  {
    const rows = rowsWithout("subbasinsEntered");
    for (const code of archive.subbasinBits) {
      let n = 0;
      for (let k = 0; k < rows.length; k++) if (archive.enteredAny(rows[k], [code])) n++;
      out.subbasinsEntered[code] = n;
    }
    out.subbasinsArchive = archiveSubbasinCounts(archive);
  }

  /* ---- peak intensity ---------------------------------------------------------------------
     Cumulative from the top, because the chips are thresholds ("CAT 3+") rather than classes.
     `cat5` is the archive's one non-cumulative case and filterStorms treats it as >= cat5, so
     the same expression produces both. */
  {
    const rows = rowsWithout("intensity");
    let unknown = 0;
    const reach = {};
    for (let k = 0; k < rows.length; k++) {
      const peak = S.num("max_vmax_kt", rows[k]);
      if (peak === null) { unknown++; continue; }
      for (const f of INTENSITY_FILTERS) {
        if (f.threshold === null) continue;
        if (peak >= f.threshold) reach[f.key] = (reach[f.key] || 0) + 1;
      }
    }
    out.intensityUnknown = unknown;
    out.intensity.all = rows.length;
    for (const f of INTENSITY_FILTERS) {
      if (f.threshold === null) continue;
      out.intensity[f.key] = reach[f.key] || 0;
    }
    // cat5 is >= cat5, which the cumulative loop already produced; stated so the reader of this
    // file does not have to re-derive it from THRESHOLDS_KT.
    void THRESHOLDS_KT;
  }

  /* ---- landfall ---------------------------------------------------------------------------
     A storm counts once per region however many times it came ashore there, and a landfall the
     archive flagged as a suspected relocation artefact is skipped -- both exactly as
     filterStorms does, or the preview would promise a cohort the filter will not deliver. */
  {
    const rows = rowsWithout("landfall");
    const regionCol = archive.landfalls.col("region");
    const regionCodes = archive.landfalls.raw("region");
    const suspect = archive.landfalls.raw("suspect_relocation");
    const dict = regionCol.dictionary || [];
    for (let k = 0; k < rows.length; k++) {
      const i = rows[k];
      const s = archive.lfOffset[i];
      const n = archive.lfCount[i];
      const seen = new Set();
      let any = false;
      for (let j = s; j < s + n; j++) {
        if (suspect[j] === 2) continue;
        any = true;
        const name = dict[regionCodes[j] - 1];
        if (name) seen.add(name);
      }
      if (any) out.landfall.any = (out.landfall.any || 0) + 1;
      for (const name of seen) out.landfall[name] = (out.landfall[name] || 0) + 1;
    }
    for (const f of LANDFALL_FILTERS) if (!(f.key in out.landfall)) out.landfall[f.key] = 0;
  }

  return out;
}
