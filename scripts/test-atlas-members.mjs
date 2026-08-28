#!/usr/bin/env node
/* THE CANONICAL MEMBER-ID FEED, RECONCILED TO THE NUMBERS IT CLAIMS TO BE THE IDENTITIES OF.
 *
 * WHY THIS EXISTS. The lens has to draw the storms behind one ledger row and de-colour the rest,
 * and the frozen rule is that the renderer never approximates cohort membership and never
 * reproduces a statistical predicate. So the engine emits the identities, collected inside the
 * same branch that increments the count -- and this file is what makes "the same branch" a
 * claim with evidence rather than a comment.
 *
 * THE TWO THINGS IT PROVES, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 *   1. SIZE. `member_ids.length` and its unique-set size are exactly the published numerator,
 *      for every intensity contract and every landfall contract in every state below.
 *
 *   2. IDENTITY. The set is the RIGHT set, not merely the right size -- checked against a
 *      reconstruction derived independently, here, from the archive's own fields. A count and a
 *      cardinality can agree while the members are wrong, and that failure would reach a reader
 *      as the wrong tracks lit on the plate with a correct-looking number beside them.
 *
 * RECONSTRUCTING IN A TEST IS THE POINT; RECONSTRUCTING IN THE RENDERER IS THE PROHIBITION. The
 * rule exists so that no SHIPPING surface holds a second copy of a threshold. A gate whose whole
 * job is to disagree with the engine has to hold one -- that is what makes it a check and not an
 * echo. It is also what the dossier already does by hand for the Hawaii numerator.
 *
 * AND IT PROVES THE FEED IS OFF UNLESS ASKED FOR: every cell computed without `members` carries
 * `member_ids: null` and is otherwise field-for-field identical to the same cell computed with
 * it. That is the "existing outputs do not change when the new field is ignored" invariant,
 * asserted rather than assumed.
 *
 * Run: node scripts/test-atlas-members.mjs
 */
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { cohortResult, parseQuery } from "../docs/storm-atlas/src/engine/cohort.js";
import { THRESHOLDS_KT } from "../docs/storm-atlas/src/engine/stats.js";
import { ROOT } from "./lib/atlas-verify.mjs";

let failed = 0;
let checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  if (cond) return true;
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + String(detail).replace(/\n/g, "\n        ") : ""));
  return false;
};
const okq = (label, cond, detail = "") => { if (!ok(label, cond, detail)) return false; return true; };

const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));

/* THE STATES, CHOSEN SO EVERY BRANCH THE FEED CAN TAKE IS TAKEN. The query strings are the
   surface's own, parsed through the canonical path rather than hand-built, so a change to the
   spec grammar fails here too. Coverage is asserted at the end -- a corpus that stopped
   exercising refusals would otherwise go on passing in silence. */
const STATES = [
  ["the unqueried archive", ""],                        // every contract scored, none refused
  ["a conditioned cohort", "w=12,-105,800&s0=1971"],    // regions the cohort never reached: 0
  ["a small Atlantic cohort", "w=25,-80,500"],
  ["conditioned on its own outcome", "i=cat4"],         // six circular intensity contracts
  ["conditioned on a landfall region", "l=mexico"],     // circular landfall contracts
  ["below the sample gate", "s0=2022&b=NA&i=cat3"],     // fifteen storms, circular and zero
  ["two storms", "w=25,-80,150&s0=2015"],               // under min_sample: every cell refuses
];

/* ── the independent reconstruction ─────────────────────────────────────────────────────────
 * Derived from the archive's own per-case fields, NOT from the engine's counters. Deliberately
 * written a second time: if it agreed with scoreCases by construction it would prove nothing. */
const intensityMembers = (result, cat) => {
  const thr = THRESHOLDS_KT[cat];
  const out = new Set();
  for (const c of result.cases) {
    const v = c.peak_vmax_kt;
    if (v === null || v === undefined || Number.isNaN(v)) continue;   // rule 4: not a failure
    if (v >= thr) out.add(c.storm_id);
  }
  return out;
};
const landfallMembers = (result, region, kind) => {
  const out = new Set();
  for (const c of result.cases) {
    const hits = (c.landfalls || []).filter((l) => l.region === region && !l.suspect_relocation);
    if (!hits.length) continue;
    if (kind === "any" || hits.some((h) => h.hurricane)) out.add(c.storm_id);
  }
  return out;
};

const seen = { intensity: 0, landfall: 0, zero: 0, refused: 0, circular: 0, nonzero: 0 };

for (const [name, query] of STATES) {
  /* `parseQuery` returns {spec, versionMismatch}, not a spec. Handing the wrapper to
     cohortResult normalises it into the EMPTY cohort, which scores cleanly and silently -- this
     file scored the unqueried archive six times over before the coverage assertions at the foot
     reported that no refusal, no circular contract and no zero numerator had been reached. That
     is what those assertions are for: 609 green checks over one state, six times. */
  const { spec } = parseQuery(query);
  const withIds = cohortResult(archive, spec, { members: true });
  const without = cohortResult(archive, spec, {});
  console.log(`\n[members] ${name}`);

  const cohortIds = new Set(withIds.cases.map((c) => c.storm_id));
  ok(`  the cohort's own ids are unique`, cohortIds.size === withIds.cases.length,
     `${cohortIds.size} unique of ${withIds.cases.length} cases`);

  /* Every published cell in this state: the six intensity contracts and both contracts of every
     region the cohort reports. `unscoreable` entries are NOT here and must not be -- they count
     events in the archive or the scope, not in this cohort, and an id list on one of them would
     assert a membership that does not exist. */
  const cells = [];
  for (const [cat, cell] of Object.entries(withIds.intensity || {})) {
    cells.push([`intensity ${cat}`, cell, intensityMembers(withIds, cat), "intensity"]);
  }
  for (const [region, kinds] of Object.entries(withIds.landfall || {})) {
    for (const kind of ["any", "hurricane"]) {
      if (!kinds[kind]) continue;
      cells.push([`${region}:${kind}`, kinds[kind], landfallMembers(withIds, region, kind), "landfall"]);
    }
  }

  for (const [label, cell, expected, family] of cells) {
    seen[family]++;
    if (cell.count === 0) seen.zero++; else seen.nonzero++;
    if (cell.rate === null && cell.refused_reason) seen.refused++;
    if (/^CONDITIONED ON/.test(cell.status || "")) seen.circular++;

    if (!okq(`  ${label}: carries an id list`, Array.isArray(cell.member_ids),
             `member_ids is ${JSON.stringify(cell.member_ids)}`)) continue;
    const ids = cell.member_ids;
    const set = new Set(ids);
    ok(`  ${label}: length reconciles to the numerator`, ids.length === cell.count,
       `${ids.length} ids against count ${cell.count}`);
    ok(`  ${label}: the ids are unique`, set.size === ids.length,
       `${set.size} unique of ${ids.length}`);
    ok(`  ${label}: every id is in this cohort`, ids.every((x) => cohortIds.has(x)),
       ids.filter((x) => !cohortIds.has(x)).slice(0, 3).join(", "));
    /* THE SET, NOT THE SIZE. */
    const missing = [...expected].filter((x) => !set.has(x));
    const extra = ids.filter((x) => !expected.has(x));
    ok(`  ${label}: the ids are the numerator's own`, missing.length === 0 && extra.length === 0,
       `missing ${missing.slice(0, 3).join(", ") || "none"}; extra ${extra.slice(0, 3).join(", ") || "none"}`);
  }

  /* ── the field is inert unless asked for ────────────────────────────────────────────── */
  const pairs = [];
  for (const cat of Object.keys(without.intensity || {})) {
    pairs.push([`intensity ${cat}`, without.intensity[cat], withIds.intensity[cat]]);
  }
  for (const region of Object.keys(without.landfall || {})) {
    for (const kind of ["any", "hurricane"]) {
      if (!without.landfall[region][kind]) continue;
      pairs.push([`${region}:${kind}`, without.landfall[region][kind], withIds.landfall[region][kind]]);
    }
  }
  let offNull = 0;
  let identical = 0;
  for (const [label, a, b] of pairs) {
    if (a.member_ids === null) offNull++;
    const strip = (o) => { const { member_ids, ...rest } = o; return JSON.stringify(rest); };
    if (strip(a) === strip(b)) identical++;
    else ok(`  ${label}: identical but for the new field`, false, `${strip(a)}\n${strip(b)}`);
  }
  ok(`  every cell is null-membered with the flag off (${offNull}/${pairs.length})`,
     offNull === pairs.length);
  ok(`  and otherwise field-for-field identical (${identical}/${pairs.length})`,
     identical === pairs.length);

  /* The counts, denominators and refusals themselves may not move either. */
  ok(`  the cohort size is unchanged by the flag`, without.kept === withIds.kept,
     `${without.kept} against ${withIds.kept}`);
  ok(`  the unscoreable set is unchanged by the flag`,
     JSON.stringify(without.unscoreable || {}) === JSON.stringify(withIds.unscoreable || {}));
  /* AND NO unscoreable ENTRY CARRIES IDENTITIES. */
  const stray = Object.entries(withIds.unscoreable || {})
    .filter(([, u]) => u && u.member_ids !== undefined).map(([k]) => k);
  ok(`  no unscoreable entry carries member_ids`, stray.length === 0, stray.join(", "));
}

/* ── the corpus actually exercised every branch ─────────────────────────────────────────── */
console.log("\n[members] the states above reached every branch the feed can take");
for (const [what, n] of Object.entries(seen)) {
  ok(`  ${what.padEnd(9)} cells reached: ${String(n).padStart(4)}`, n > 0,
     "no cell of this kind was exercised");
}

console.log(failed === 0
  ? `\nevery member set is exactly its numerator, and the field is inert unless asked for (${checks} checks)`
  : `\n${failed} of ${checks} checks failed`);
process.exit(failed === 0 ? 0 : 1);
