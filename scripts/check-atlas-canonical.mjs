#!/usr/bin/env node
/* IS EVERY NUMBER ON THIS SURFACE THE ARCHIVE'S?
 *
 * The Storm Atlas was redesigned against a PROTOTYPE, and a prototype carries demonstration
 * data: a hand-written table of base rates, a conditioned cohort typed as a literal, a seeded
 * random walk standing in for tracks, and a refusal resolver written beside them. Every one of
 * those reads exactly like the real thing on screen -- that is what makes a prototype useful and
 * what makes it dangerous. A single one of them surviving into production would publish a number
 * no archive ever recorded, under a masthead that says it did.
 *
 * So the rule is stated as a property of the SHIPPED SOURCE and its BUNDLE rather than as a
 * review note: no demonstration constant, no synthetic population, no second refusal resolver,
 * and no analytical literal that the engine should have computed.
 *
 * WHAT THIS IS NOT. It is not a ban on numbers in source: thresholds, budgets, tolerances, cell
 * sizes and type steps are all real constants of the instrument. The rule is about ANALYTICAL
 * truth -- counts, rates, intervals, denominators, refusals -- which must come from the pack
 * through the engine, and from nowhere else.
 *
 * Run: node scripts/check-atlas-canonical.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs/storm-atlas/src");
const DIST = join(ROOT, "docs/storm-atlas/dist");

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

const walk = async (dir, out = []) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
};
const srcFiles = (await walk(SRC)).filter((p) => /\.jsx?$/.test(p));
const distFiles = (await walk(DIST)).filter((p) => /\.js$/.test(p));
const read = async (p) => ({ path: p.slice(ROOT.length + 1), text: await readFile(p, "utf8") });
const sources = await Promise.all(srcFiles.map(read));
const bundles = await Promise.all(distFiles.map(read));
/* Comments carry the argument for every rule in this repository, and several of them quote the
   prototype by name in order to say what was NOT ported. The rule is about code. */
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

console.log("\n[canonical] the prototype's demonstration data is nowhere in the source");
{
  /* Named exactly as the handoff names them, so a copy-paste of any block is caught by its own
     identifier rather than by a resemblance. */
  const BANNED = ["DEMO_MDR", "genStorms", "mulberry32", "REFUSAL_REGISTRY", "resolveRefusal",
    "COND_STORMS", "isMDR", "CAT_COLOR"];
  const hits = [];
  for (const f of [...sources, ...bundles]) {
    const code = codeOf(f.text);
    for (const name of BANNED) {
      if (new RegExp(`\\b${name}\\b`).test(code)) hits.push(`${f.path}: ${name}`);
    }
  }
  ok("no DEMO_MDR, genStorms, mulberry32, REFUSAL_REGISTRY or resolveRefusal, in source or bundle",
    hits.length === 0, hits.join("\n"));
}

console.log("\n[canonical] no synthetic population, anywhere on the surface");
{
  const hits = [];
  /* THIS ONE READS THE SOURCE AND NOT THE BUNDLE, and the reason is worth stating rather than
     silently narrowing: the bundle contains React, and React seeds its own internal property
     names with Math.random. A rule that failed on that would be switched off within a week --
     which is the same as not having one. What is being asserted is that THIS REPOSITORY's
     surface generates nothing; the banned identifiers above are specific enough to be safe
     against the bundle and are checked there too. */
  for (const f of sources) {
    const code = codeOf(f.text);
    /* A surface that draws the archive has no reason to generate anything. Math.random in
       particular cannot appear: a random number in a research instrument is either a synthetic
       storm or a jitter applied to a real one, and both are the same lie. */
    if (/Math\.random\s*\(/.test(code)) hits.push(`${f.path}: Math.random()`);
    if (/\bsynthetic\b/i.test(code)) hits.push(`${f.path}: a "synthetic" identifier`);
  }
  ok("no Math.random and no synthetic identifier in the surface's own source", hits.length === 0,
    hits.join("\n"));
}

console.log("\n[canonical] the surface computes no rate of its own");
{
  /* THE ONE ARITHMETIC RULE. A rate is a division of a count by a denominator, and the engine is
     the only place that may do it: rates.js computes the rate, stats.js the interval, compare.js
     the delta. A component that divides two counts has become a second methodology -- and the
     one that matters is invisible, because its output looks exactly like the engine's.
     Presentation arithmetic is allowed and is what the exemptions are: multiplying a rate the
     engine already published by 100 to print it, and placing that value on a 0-100 track. */
  const ALLOWED = [
    /100 \* /,                       // a published rate, as a percentage
    /\* 100/,
    /\/ 100/,
    /100 - /,                        // the far end of an interval track
    /\/ 2\b/,                        // centring a mark
    /\/ 60000|\/ 525600|\/ 1000\b/,  // time and distance formatting
    /\/ g\.cols|\/ scale|\/ step\b/, // the cell grid's own arithmetic
  ];
  const hits = [];
  for (const f of sources) {
    if (!/\/ui\//.test(f.path)) continue;   // the engine is where arithmetic belongs
    const code = codeOf(f.text);
    for (const m of code.matchAll(/^.*\b(count|numerator|n_storms|n_cases|kept)\b\s*\/\s*\w+.*$/gm)) {
      const line = m[0].trim();
      if (ALLOWED.some((re) => re.test(line))) continue;
      hits.push(`${f.path}: ${line.slice(0, 110)}`);
    }
  }
  ok("no component divides a count by a denominator", hits.length === 0, hits.join("\n"));
}

console.log("\n[canonical] every published figure is read from the engine's own object");
{
  /* The four fields a rate is published from -- rate, ci95, count, n_storms -- are read, never
     assigned, outside the engine. An assignment in the UI is a value the UI decided. */
  const hits = [];
  for (const f of sources) {
    if (!/\/ui\//.test(f.path)) continue;
    const code = codeOf(f.text);
    for (const m of code.matchAll(/^.*\.(rate|ci95|n_storms|refused_reason)\s*=[^=].*$/gm)) {
      hits.push(`${f.path}: ${m[0].trim().slice(0, 110)}`);
    }
  }
  ok("no component assigns a rate, an interval, a denominator or a refusal reason",
    hits.length === 0, hits.join("\n"));
}

console.log("\n[canonical] the lens draws the engine's members, not its own");
{
  /* The one place membership could quietly be re-derived. scoreCases collects the member rows in
     the same loop that counts the numerator; the shell hands them to the layer; the layer draws
     them. What must not exist is a UI-side predicate that decides which storms reached a
     contract -- so no component may compare a peak against a threshold. */
  const hits = [];
  for (const f of sources) {
    if (!/\/ui\/|\/render\//.test(f.path)) continue;
    const code = codeOf(f.text);
    for (const m of code.matchAll(/^.*\b(peak_vmax_kt|max_vmax_kt)\b\s*(>=|>|<|<=)\s*.*$/gm)) {
      hits.push(`${f.path}: ${m[0].trim().slice(0, 110)}`);
    }
  }
  ok("no component tests a storm's peak against a threshold", hits.length === 0, hits.join("\n"));
  const members = sources.find((f) => f.path.endsWith("engine/analogs.js"));
  ok("and the engine is where the member rows are collected",
    /collectMembers/.test(members.text) && /memberPush/.test(members.text));
}

console.log("\n[canonical] the archive's own counts, in the bundle that ships");
{
  /* THE PROTOTYPE'S TABLE, BY ITS DIGITS. Its base rates were 3,224 / 3,616 and its conditioned
     cohort 514 of 3,885 -- real-looking numbers, typed. The archive publishes the same figures
     by COMPUTING them, so the digits appearing as literals in the bundle would mean a table had
     been pasted in beside the engine that derives them. */
  const PROTOTYPE_LITERALS = ["3224", "3616", "1844", "n:417", "N:457", "rate:91.2", "delta:+16.7"];
  const hits = [];
  for (const f of bundles) {
    for (const lit of PROTOTYPE_LITERALS) {
      if (f.text.includes(lit)) hits.push(`${f.path}: ${lit}`);
    }
  }
  ok("no published figure is a literal in the shipped bundle", hits.length === 0, hits.join("\n"));
}

console.log(failures === 0
  ? "\nevery cohort, count, rate, interval and refusal on this surface comes from the archive"
  : `\n${failures} canonical-truth check(s) failed`);
process.exit(failures ? 1 : 0);
