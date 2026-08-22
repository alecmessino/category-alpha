#!/usr/bin/env node
/* Does the map's provenance ink still describe the archive it is drawn from?
 *
 * The Atlas draws two things differently because of where they came from rather than what they
 * are: a pre-genesis track portion, and a landfall the archive derived instead of read. Both
 * treatments are justified in prose, in a header comment, with counts in it -- and a comment
 * carrying a count is a claim that goes stale silently, because the archive is rebuilt four
 * times a day and nothing recomputes the sentence.
 *
 * It had already gone stale. selection-layer.js stated 1,580 pre-genesis fixes; the rule the
 * same file implements yields 9,450, and no other definition tried -- observed-only,
 * disturbances-and-lows-only, per-basin, per-era -- reproduces 1,580 either. The rule was never
 * wrong; the sentence describing it was, and only the sentence was corrected.
 *
 * So this gate pins the sentence to the pack. Every number the provenance comments state is
 * recomputed here from the bytes the browser actually loads, through the accessors the browser
 * actually uses. If the archive grows and the counts move, this fails and names the new value
 * rather than letting the map keep explaining itself with an old one.
 *
 * It also asserts the STRUCTURAL claim under the pre-genesis treatment, which is the part that
 * would matter if it broke: genesis is the first tropical fix, so no fix before it may be
 * tropical. That invariant is what makes "drawn dimmed" honest rather than decorative. A count
 * drifting is a documentation bug; this invariant failing would be a definition bug.
 *
 * Offline -- reads the pack, needs no Python. Run: node scripts/test-atlas-provenance.mjs
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { openArchive } from "../docs/storm-atlas/src/engine/node-io.js";
import { ROOT } from "./lib/atlas-verify.mjs";

const DATA = join(ROOT, "docs/storm-atlas/data");
const SRC = join(ROOT, "docs/storm-atlas/src");
const I32_NULL = -2147483648;

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

/* schema.py's TROPICAL_STATUS / NONTROPICAL_STATUS, and genesis_events.py:_is_tropical.
   Transliterated rather than imported for the same reason engine/geo.js is: the browser has no
   Python, and the point of the check is that the two agree. */
const TROPICAL_STATUS = new Set(["TD", "TS", "HU", "TY", "ST", "TC", "HR"]);
const NONTROPICAL_STATUS = new Set(["DB", "LO", "EX", "SD", "SS", "WV", "MD", "IN", "DS", "ET",
                                    "NR", "PT"]);
function isTropical(stage, nature) {
  const s = (stage || "").trim().toUpperCase();
  if (s) {
    if (TROPICAL_STATUS.has(s)) return true;
    if (NONTROPICAL_STATUS.has(s)) return false;
  }
  return (nature || "").trim().toUpperCase() === "TS";
}

const a = await openArchive(DATA);

/* ---- pre-genesis, counted the way the renderer decides ------------------------------------
   selection-layer.js draws a segment as pre-genesis when its forward endpoint is at or before
   genesis; population-layer.js must agree. Counting the FIXES strictly before genesis gives the
   same number on this archive, and both are reported so a future divergence is visible. */
let preFixes = 0;
let preSegments = 0;
let tropicalBeforeGenesis = 0;
let maxHoursBack = 0;
const preStorms = new Set();

for (let i = 0; i < a.nStorms; i++) {
  const g = a.genesisT[i];
  if (Number.isNaN(g) || g === I32_NULL) continue;
  const [s, e] = a.trackRange(i);
  for (let k = s; k < e; k++) {
    if (a.ptT[k] < g) {
      preFixes++;
      preStorms.add(i);
      if (isTropical(a.points.str("stage", k), a.points.str("nature", k))) tropicalBeforeGenesis++;
      const hours = (g - a.ptT[k]) / 60;
      if (hours > maxHoursBack) maxHoursBack = hours;
    }
    if (k < e - 1 && a.ptT[k + 1] <= g) preSegments++;
  }
}

console.log("\npre-genesis");
ok("no fix before genesis is tropical -- genesis IS the first tropical fix",
  tropicalBeforeGenesis === 0,
  `${tropicalBeforeGenesis} tropical fixes sit before their storm's genesis`);
ok("the fix rule and the segment rule agree on this archive",
  preFixes === preSegments,
  `${preFixes} fixes strictly before genesis vs ${preSegments} segments ending at or before it`);

/* ---- the sentence in the source must still be true ---------------------------------------- */
const selection = await readFile(join(SRC, "render/selection-layer.js"), "utf8");
/* Flatten the block comment before matching: the sentence wraps, and a regex that cared where
   the line breaks fall would fail every time someone reflowed a paragraph. */
const flat = selection.replace(/\n\s*\*\s?/g, " ").replace(/\s+/g, " ");
const stated = flat.match(
  /([\d,]+) fixes in this archive sit before it,[^.]*?across ([\d,]+) storms and reaching ([\d,]+) hours back/);

ok("selection-layer.js states its pre-genesis counts in the documented form", stated !== null,
  "expected '<n> fixes in this archive sit before it ... across <n> storms ... reaching <n> hours back'");

if (stated) {
  const num = (x) => Number(x.replace(/,/g, ""));
  ok(`stated pre-genesis fixes == packed (${preFixes.toLocaleString()})`,
    num(stated[1]) === preFixes, `comment says ${stated[1]}, pack says ${preFixes.toLocaleString()}`);
  ok(`stated pre-genesis storms == packed (${preStorms.size.toLocaleString()})`,
    num(stated[2]) === preStorms.size, `comment says ${stated[2]}, pack says ${preStorms.size}`);
  ok(`stated maximum reach == packed (${maxHoursBack} hours)`,
    num(stated[3]) === maxHoursBack, `comment says ${stated[3]}, pack says ${maxHoursBack}`);
}

/* ---- landfall detection provenance --------------------------------------------------------
   The map now distinguishes a landfall the archive READ from one it DERIVED, so the three
   detection kinds have to keep meaning what the manifest says they mean. */
const manifest = JSON.parse(await readFile(join(DATA, "atlas-manifest.json"), "utf8"));
const counts = {};
let withheldCategory = 0;
let suspect = 0;
const L = a.landfalls;
for (let k = 0; k < L.rows; k++) {
  const d = L.str("detection", k) ?? "(null)";
  counts[d] = (counts[d] || 0) + 1;
  if (L.str("category", k) === null) withheldCategory++;
  if (L.bool("suspect_relocation", k) === true) suspect++;
}

console.log("\nlandfall detection");
for (const [kind, n] of Object.entries(manifest.quality.landfall_detection)) {
  ok(`${kind} == manifest (${n.toLocaleString()})`, counts[kind] === n,
    `pack has ${counts[kind]}, manifest says ${n}`);
}
ok("every landfall carries a detection kind", !("(null)" in counts),
  `${counts["(null)"]} landfalls have no detection kind`);
ok(`withheld Saffir-Simpson class == manifest (${manifest.quality.landfall_category_withheld})`,
  withheldCategory === manifest.quality.landfall_category_withheld,
  `pack has ${withheldCategory}`);

/* The population mat excludes suspect relocations because every rate the archive publishes
   excludes them. If that ever stops being true the mat starts drawing rows the statistics do
   not count, which is the one way these two surfaces are allowed to disagree and must not. */
ok("suspect relocations exist and are a small, bounded population",
  suspect > 0 && suspect < L.rows * 0.02,
  `${suspect} of ${L.rows} -- if this grew, the mat's exclusion rule deserves a second look`);

console.log(`\n        pre-genesis: ${preFixes.toLocaleString()} fixes across ` +
            `${preStorms.size} storms, reaching ${maxHoursBack} hours back`);
console.log(`        landfalls: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(failures
  ? `\n${failures} provenance check(s) failed\n`
  : "\nthe map's provenance ink still describes the archive\n");
process.exit(failures ? 1 : 0);
