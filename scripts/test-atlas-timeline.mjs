#!/usr/bin/env node
/* The replay clock's invariants.
 *
 * The mass replay makes one claim that has to be true rather than approximately true: SKIPPING
 * QUIET STRETCHES CHANGES ONLY THE WALL-CLOCK, NEVER THE RECORD. Every storm still appears, once,
 * in the order it happened, over its whole observed span. If that ever stopped holding, the
 * screen would still look plausible -- storms would still march across the map -- while quietly
 * having dropped or reordered part of the archive. Nothing on the surface would give it away.
 *
 * So this asserts it directly, and against the real archive rather than a fixture: a linear run
 * and a skipping run over all 3,959 storms must reveal the same storms in the same order.
 *
 * Run: node scripts/test-atlas-timeline.mjs
 */
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { filterStorms } from "../docs/storm-atlas/src/engine/query.js";
import {
  activeAt, advance, buildTimeline, fromActive, intervalAt, quietFraction, revealedThrough,
  toActive,
} from "../docs/storm-atlas/src/engine/timeline.js";
import { ROOT } from "./lib/atlas-verify.mjs";

let failed = 0;
let checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log("  ok    " + label); return true; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
  return false;
}
function head(s) { console.log("\n" + s); }

/* ---- a fake archive, for the shapes the real one does not contain ---------------------- */

/** spans: [[firstFixMin, lastFixMin, genesisMin|null], ...] in storm-row order. */
function fakeArchive(spans) {
  const tpOffset = new Int32Array(spans.length);
  const tpCount = new Int32Array(spans.length);
  const genesisT = new Int32Array(spans.length);
  const t = [];
  spans.forEach(([a, b, g], i) => {
    tpOffset[i] = t.length;
    // two fixes is enough: the timeline reads only the first and the last
    t.push(a, b);
    tpCount[i] = 2;
    genesisT[i] = g === null || g === undefined ? -2147483648 : g;
  });
  return { tpOffset, tpCount, ptT: Int32Array.from(t), genesisT };
}
const allRows = (n) => Uint32Array.from({ length: n }, (_, i) => i);

/* Play a timeline to the end exactly as the replay layer does.
 *
 * REVEALING IS A PREFIX, NOT A SAMPLE, and that distinction is load-bearing. `activeAt` answers
 * "what is on the map at this instant", which is what the bright head needs -- but no sampled
 * clock can be trusted to LAND on a storm. 26 storms in this archive consist of a single fix:
 * they exist at one minute and have no duration at all, so a six-hourly tick steps straight over
 * them, and an earlier draft of this harness duly lost 11 storms while looking perfectly healthy.
 *
 * Because the timeline is sorted by first fix, "everything revealed so far" is a prefix of it,
 * and growing that prefix is exact regardless of tick size. So the layer accumulates the prefix
 * and uses activeAt only to decide what to draw bright. This plays it the same way. */
function play(tl, stepMin, skipQuiet) {
  const order = [];
  let revealed = 0;
  let everActive = 0;
  const seenActive = new Set();
  let cursor = tl.firstT;
  let guard = 0;
  let jumps = 0;
  let skippedTotal = 0;
  let prev = -Infinity;
  let monotonic = true;
  const limit = 4_000_000;
  for (;;) {
    if (cursor < prev) monotonic = false;
    prev = cursor;
    const upto = revealedThrough(tl, cursor);
    for (let p = revealed; p < upto; p++) order.push(p);
    revealed = upto;
    for (const p of activeAt(tl, cursor)) if (!seenActive.has(p)) seenActive.add(p);
    const r = advance(tl, cursor, stepMin, { skipQuiet });
    if (r.skippedMin > 0) { jumps++; skippedTotal += r.skippedMin; }
    cursor = r.cursor;
    if (r.done) break;
    if (++guard > limit) throw new Error("play did not terminate");
  }
  const upto = revealedThrough(tl, cursor);
  for (let p = revealed; p < upto; p++) order.push(p);
  everActive = seenActive.size;
  return { order, steps: guard, jumps, skippedTotal, monotonic, everActive };
}

/* ---- synthetic ------------------------------------------------------------------------ */

head("[1] the shapes a real archive may not hand us");

{
  const tl = buildTimeline(fakeArchive([[100, 200, 120]]), allRows(1));
  ok(tl.n === 1 && tl.intervals === 1, "a single storm is one interval");
  ok(tl.activeMin === 100 && tl.spanMin === 100, "a single storm has no quiet time");
  ok(quietFraction(tl) === 0, "quiet fraction of a single storm is zero");
}
{
  // overlapping, adjacent, and separated -- the three ways intervals can meet
  const tl = buildTimeline(fakeArchive([[0, 100, 10], [50, 150, 60], [150, 200, 160],
    [1000, 1100, 1010]]), allRows(4));
  ok(tl.intervals === 2, "overlapping and touching spans merge; a gap does not",
    `got ${tl.intervals}`);
  ok(tl.ivStart[0] === 0 && tl.ivEnd[0] === 200, "the merged interval covers all three");
  ok(tl.activeMin === 300, "active minutes exclude the gap", `got ${tl.activeMin}`);
  ok(tl.spanMin === 1100, "span is calendar time, gap included");
}
{
  // a storm shorter than one tick must not stall or be skipped
  const tl = buildTimeline(fakeArchive([[0, 10, 0], [1000, 1001, 1000], [5000, 5100, 5000]]),
    allRows(3));
  const r = play(tl, 360, true);
  ok(r.order.length === 3, "a one-minute storm between two long gaps is still revealed",
    `revealed ${r.order.length}`);
  ok(r.monotonic, "the cursor never runs backwards across a skip");
  ok(r.everActive < 3, "and it is revealed by the prefix, not by landing a tick on it",
    `${r.everActive} of 3 were caught by a sampled frame`);
}
{
  // storms sharing an instant: order must be stable and total, never partial
  const tl = buildTimeline(fakeArchive([[0, 50, 0], [0, 60, 0], [0, 40, 0]]), allRows(3));
  ok(tl.n === 3 && tl.intervals === 1, "co-genesis storms share one interval");
  const r = play(tl, 6, true);
  ok(r.order.length === 3, "all three are revealed");
}
{
  const tl = buildTimeline(fakeArchive([]), new Uint32Array(0));
  const r = advance(tl, 0, 60, { skipQuiet: true });
  ok(tl.n === 0 && r.done === true, "an empty filter yields an empty, finished timeline");
  ok(activeAt(tl, 0).length === 0, "nothing is active in an empty timeline");
}
{
  /* A storm with no fixes cannot be placed on a clock. It is dropped from the TIMELINE and the
     count is what the transport reports, so the surface never claims to be replaying it. */
  const a = fakeArchive([[0, 100, 0], [0, 0, 0]]);
  a.tpCount[1] = 0;
  const tl = buildTimeline(a, allRows(2));
  ok(tl.n === 1, "a storm with no fixes is not on the clock", `got ${tl.n}`);
}
{
  // the active <-> clock mapping must round-trip through a gap
  const tl = buildTimeline(fakeArchive([[0, 100, 0], [1000, 1100, 1000]]), allRows(2));
  ok(toActive(tl, 0) === 0 && toActive(tl, 100) === 100, "active time accrues inside an interval");
  ok(toActive(tl, 500) === 100, "active time does not accrue in a gap", `got ${toActive(tl, 500)}`);
  ok(toActive(tl, 1050) === 150, "active time resumes at the next interval");
  ok(fromActive(tl, 150) === 1050, "and inverts back to the same instant");
  ok(fromActive(tl, 0) === 0 && fromActive(tl, tl.activeMin) === 1100,
    "the ends of the scrub are the ends of the record");
  ok(intervalAt(tl, 500) === 1, "a cursor in a gap selects the interval AFTER it");
}

/* ---- the real archive ----------------------------------------------------------------- */

head("[2] the whole archive, played twice");

/* Reads the committed pack directly, and deliberately asks Python for nothing.
 *
 * These are invariants of the CLOCK -- ordering, coverage, monotonicity -- not comparisons
 * against the archive's own answers, so there is no fixture to generate and no authority to
 * defer to. Whether the pack still matches the archive is test-atlas-pack's job.
 *
 * An earlier draft called ensureVerification("timeline", ...) for a fixture it never read. That
 * spawns `atlas-verify --what timeline`, which is not a valid choice -- but only when the cached
 * artefact is STALE, so it sat green through CI and every local run and would first have fired
 * on the next data refresh. Caught by merging a moved archive. */
const archive = await openArchive(join(ROOT, "docs/storm-atlas/data"));
const result = filterStorms(archive, {});
const tl = buildTimeline(archive, result.rows);

console.log(`        ${tl.n.toLocaleString()} storms · ${tl.intervals.toLocaleString()} active ` +
  `intervals · ${(tl.activeMin / 525600).toFixed(1)} storm-active years of ` +
  `${(tl.spanMin / 525600).toFixed(1)} calendar years`);
console.log(`        ${(quietFraction(tl) * 100).toFixed(1)}% of the record has no storm active`);

ok(tl.n === result.rows.length, "every filtered storm is on the clock",
  `${tl.n} vs ${result.rows.length}`);

let sorted = true;
for (let i = 1; i < tl.n; i++) if (tl.start[i] < tl.start[i - 1]) sorted = false;
ok(sorted, "the timeline is sorted by first fix");

let spansOk = true;
for (let i = 0; i < tl.n; i++) if (tl.end[i] < tl.start[i]) spansOk = false;
ok(spansOk, "no storm ends before it starts");

/* Every storm's span must sit inside some merged interval -- otherwise a skip could jump over a
   storm entirely, which is the one failure the whole design is built to prevent. */
let covered = 0;
for (let i = 0; i < tl.n; i++) {
  const k = intervalAt(tl, tl.start[i]);
  if (k < tl.intervals && tl.ivStart[k] <= tl.start[i] && tl.ivEnd[k] >= tl.end[i]) covered++;
}
ok(covered === tl.n, "every storm's whole span lies inside one active interval",
  `${covered} of ${tl.n}`);

const STEP = 6 * 60; // six hours, the archive's own synoptic step
const linear = play(tl, STEP, false);
const skipping = play(tl, STEP, true);

ok(linear.monotonic && skipping.monotonic, "the cursor only ever moves forward");
ok(skipping.order.length === tl.n, "the skipping run reveals every storm",
  `${skipping.order.length} of ${tl.n}`);
ok(linear.order.length === tl.n, "the linear run reveals every storm",
  `${linear.order.length} of ${tl.n}`);
ok(new Set(skipping.order).size === skipping.order.length,
  "no storm is revealed twice");

let sameOrder = linear.order.length === skipping.order.length;
if (sameOrder) {
  for (let i = 0; i < linear.order.length; i++) {
    if (linear.order[i] !== skipping.order[i]) { sameOrder = false; break; }
  }
}
ok(sameOrder, "linear and skipping runs reveal the SAME storms in the SAME order");

const revealedSet = new Set(skipping.order.map((p) => tl.row[p]));
let matchesFilter = revealedSet.size === result.rows.length;
if (matchesFilter) for (const r of result.rows) if (!revealedSet.has(r)) matchesFilter = false;
ok(matchesFilter, "the storms revealed are exactly the filtered set");

/* The reason the reveal is a prefix and not a sample, stated as a number rather than as a
   comment: these storms are one observation long and no tick can be relied on to find them. */
let singleFix = 0;
for (let i = 0; i < tl.n; i++) if (tl.end[i] === tl.start[i]) singleFix++;
console.log(`        ${singleFix} storms consist of a single fix · ` +
  `${(tl.n - skipping.everActive)} were never caught by a sampled frame`);
ok(tl.n - skipping.everActive <= singleFix,
  "only single-fix storms are missed by sampling; the prefix reveals them anyway",
  `${tl.n - skipping.everActive} missed vs ${singleFix} single-fix`);

console.log(`        linear ${linear.steps.toLocaleString()} ticks · ` +
  `skipping ${skipping.steps.toLocaleString()} ticks over ${skipping.jumps} jumps ` +
  `(${(skipping.skippedTotal / 1440).toFixed(0)} quiet days stepped over)`);
ok(skipping.steps < linear.steps, "skipping is genuinely shorter",
  `${skipping.steps} vs ${linear.steps}`);
ok(Math.abs(skipping.skippedTotal - (tl.spanMin - tl.activeMin)) <= tl.intervals,
  "the minutes reported as skipped are the minutes with no storm active",
  `${skipping.skippedTotal} vs ${tl.spanMin - tl.activeMin}`);

head("[3] a filtered population");

const cat3 = filterStorms(archive, { intensity: "cat3" });
const tl3 = buildTimeline(archive, cat3.rows);
const r3 = play(tl3, STEP, true);
ok(r3.order.length === tl3.n, "a Cat 3+ replay reveals every Cat 3+ storm",
  `${r3.order.length} of ${tl3.n}`);
ok(tl3.n < tl.n && tl3.intervals > 1, "and it is a genuinely sparser clock",
  `${tl3.n} storms in ${tl3.intervals} intervals`);
console.log(`        cat3+: ${tl3.n} storms · ` +
  `${(quietFraction(tl3) * 100).toFixed(1)}% of that span has none active`);

/* activeAt must agree with a brute-force scan. Sampled rather than exhaustive: the point is to
   catch the running-maximum early-exit being wrong, and a wrong bound fails broadly, not rarely. */
head("[4] activeAt against brute force");
let agree = 0;
let probes = 0;
for (let s = 0; s <= 400; s++) {
  const cursor = tl.firstT + Math.round((tl.lastT - tl.firstT) * (s / 400));
  const got = new Set(activeAt(tl, cursor));
  const want = new Set();
  for (let i = 0; i < tl.n; i++) if (tl.start[i] <= cursor && tl.end[i] >= cursor) want.add(i);
  probes++;
  if (got.size === want.size && [...want].every((x) => got.has(x))) agree++;
}
ok(agree === probes, "activeAt matches a full scan at every probe", `${agree} of ${probes}`);

let maxConc = 0;
for (let s = 0; s <= 4000; s++) {
  const cursor = tl.firstT + Math.round((tl.lastT - tl.firstT) * (s / 4000));
  const k = activeAt(tl, cursor).length;
  if (k > maxConc) maxConc = k;
}
console.log(`        peak concurrency seen in 4,000 probes: ${maxConc} storms`);
ok(revealedThrough(tl, tl.firstT - 1) === 0 && revealedThrough(tl, tl.lastT) === tl.n,
  "revealedThrough spans nothing to everything");

console.log(failed
  ? `\n${failed} of ${checks} timeline check(s) failed\n`
  : `\nthe clock skips dead air and nothing else\n`);
process.exit(failed ? 1 : 0);
