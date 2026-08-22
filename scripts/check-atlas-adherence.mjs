#!/usr/bin/env node
/* TOKEN ADHERENCE FOR THE STORM ATLAS SURFACE — two invariants the redesign rests on.
 *
 * WHY THIS EXISTS, AND WHY IT IS A GATE RATHER THAN A CONVENTION.
 *
 * Both shells shipped drafts that applied HAIRLINE inks to TEXT. On paper, secondary and
 * tertiary text measured 3.80:1 and 2.38:1. On the dark planes, --t4 and --rule-4 carried
 * published Wilson intervals, slot dashes and denominator statements at 2.13-3.66:1, and one
 * invented ink (#3d4c60, in no stylesheet at all) carried every graticule label. Those are not
 * typos. They are one category of mistake -- an ink chosen because it looked right next to a
 * rule, then reused for a sentence -- and it recurred across two independent drafts, which is
 * what makes it a build step instead of a review note.
 *
 * The rule is structural: a token whose NAME says rule, hairline or mark may never appear in a
 * colour declaration, and neither may a token the design system's own ink table designates
 * marks-only or hairlines-only. Slots are content: a dash meaning "the archive has no value
 * here" is held to the same contrast bar as the value it replaces, so it may not be dimmed
 * into a rule ink to make it look quieter.
 *
 * PART 2 IS THE INTENSITY RAMP. The cartographic ramp in src/render/palette.js is
 * authoritative and is NOT checked for contrast here -- it is verified against the dark plate
 * it actually draws on, and it carries extra stroke weight on the major classes, which a 1px
 * evidence bar cannot inherit. What IS checked is the light-shell BAR ECHO: it must clear 3:1
 * on every paper ground it can land on, every ADJACENT pair must separate both in luminance
 * and in monochrome, and the sequence must be monotonic so the ordering survives with no
 * colour at all. The handoff's first draft of that table failed CAT2/CAT3 at 1.00:1 and a
 * greyscale delta of 1 -- the exact pair that decides "major hurricane" -- which is why the
 * numbers below are asserted rather than trusted.
 *
 * Run: node scripts/check-atlas-adherence.mjs [--self-test]
 *   --self-test  also seeds a known violation into an in-memory copy of each checked source
 *                and requires the rule to catch it. A guard that cannot be shown to fire is
 *                not a guard; this is what makes the green result mean something.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, relative, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return true; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + String(detail).replace(/\n/g, "\n        ") : ""));
  return false;
};

/* ── PART 1 · rule, hairline and mark inks may not carry text ─────────────────────────── */

/* Two ways a token qualifies, and both are needed.
 *
 * BY NAME catches anything added later: a --rule-5 or a --hair-dim invented next quarter is
 * caught with no edit here, which is the half a hand-maintained list always loses.
 *
 * BY DESIGNATION catches the ones whose names do not say it. The ink tables designate
 * --t4 "marks only" and --rule-4 "hairlines only"; --t4's name says nothing at all, and it is
 * the token that actually carried published intervals in the draft this gate exists for. */
const NAME_RULE = /^--(?:rule|hair|hairline|mark|stroke|grid|tick)(?:-|$)/;
const DESIGNATED = new Map([
  ["--t4", "the dark shell's ink table designates it marks only"],
  ["--rule-4", "the dark shell's ink table designates it hairlines only"],
]);

const isForbidden = (tok) =>
  NAME_RULE.test(tok) ? "its name declares it a rule, hairline or mark ink" : DESIGNATED.get(tok) || null;

/* The properties that put ink on a glyph. `color` is the whole rule in CSS; the fill variant
   is how a gradient-clipped heading would smuggle the same mistake past a `color` check. */
const CSS_TEXT_PROP = /(?:^|[;{]|\*\/)\s*(color|-webkit-text-fill-color)\s*:\s*([^;}]+)/gi;

/* CSS custom-property DEFINITIONS are not usages: `--rule-2:#2e3a4a` declares the hairline,
   it does not paint a sentence with it. Only the right-hand side of a real `color:` counts.
   A definition line is `--x: value`, so the property name is what distinguishes them. */
async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

/* Returns [{ line, token, why, text }] for every text-colour declaration painted with a
   forbidden token, in either CSS or a JSX inline style object. */
export function findViolations(source, kind) {
  const hits = [];
  const lineOf = (idx) => source.slice(0, idx).split("\n").length;

  if (kind === "css") {
    for (const m of source.matchAll(CSS_TEXT_PROP)) {
      const value = m[2];
      for (const v of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const why = isForbidden(v[1]);
        if (why) hits.push({ line: lineOf(m.index), token: v[1], why, text: m[0].trim().slice(0, 90) });
      }
    }
  } else {
    /* JSX: `color: "var(--t4)"` inside a style object, and the styled-string form used by a
       few inline `style` attributes. Both reduce to a colour key and a var() on its value. */
    for (const m of source.matchAll(/\bcolor\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`|([^,}\n]+))/g)) {
      const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      for (const v of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const why = isForbidden(v[1]);
        if (why) hits.push({ line: lineOf(m.index), token: v[1], why, text: m[0].trim().slice(0, 90) });
      }
    }
  }
  return hits;
}

const CHECK_ROOTS = [
  { dir: resolve(ROOT, "docs/storm-atlas/src"), exts: [".js", ".jsx"], kind: "jsx" },
  { dir: resolve(ROOT, "docs/storm-atlas"), exts: [".css"], kind: "css", shallow: true },
  { dir: resolve(ROOT, "docs/tokens"), exts: [".css"], kind: "css" },
];

console.log("[adherence] rule, hairline and mark inks may not carry text");
const checked = [];
for (const root of CHECK_ROOTS) {
  let files = root.shallow
    ? (await readdir(root.dir, { withFileTypes: true }).catch(() => []))
        .filter((e) => e.isFile()).map((e) => join(root.dir, e.name))
    : await walk(root.dir);
  files = files.filter((f) => root.exts.includes(extname(f))).sort();
  for (const f of files) {
    const src = await readFile(f, "utf8");
    checked.push({ file: f, src, kind: root.kind });
    const hits = findViolations(src, root.kind);
    ok(
      relative(ROOT, f),
      hits.length === 0,
      hits.map((h) => `line ${h.line}: ${h.token} — ${h.why}\n  ${h.text}`).join("\n"),
    );
  }
}
ok("at least one source was actually read", checked.length > 0, "the walk found nothing to check");

/* ── PART 1b · the guard is made to fire ──────────────────────────────────────────────── */

if (process.argv.includes("--self-test")) {
  console.log("\n[adherence] seeded violations — the rule must catch every one");

  /* Each seed is a mistake that really happened, restated in the syntax of the file it is
     planted in. None of these touch disk: the source is read, mutated in memory, and the
     detector is run over the mutation. */
  const SEEDS = [
    { kind: "css", name: "a hairline ink on a graticule label (CSS)",
      snippet: "\n[data-atlas] .at-seeded{color:var(--rule-4)}\n" },
    { kind: "css", name: "a marks-only ink on a published interval (CSS)",
      snippet: "\n[data-atlas] .at-seeded2{font-size:11px;color:var(--t4)}\n" },
    { kind: "css", name: "a rule ink smuggled through -webkit-text-fill-color",
      snippet: "\n[data-atlas] .at-seeded3{-webkit-text-fill-color:var(--rule-2)}\n" },
    { kind: "jsx", name: "a marks-only ink on a slot dash (JSX inline style)",
      snippet: '\nconst Seeded = () => <span style={{ color: "var(--t4)" }}>—</span>;\n' },
    { kind: "jsx", name: "a hairline ink on a denominator statement (JSX inline style)",
      snippet: '\nconst Seeded2 = () => <b style={{ fontSize: 11, color: "var(--rule-4)" }}>of 3,885</b>;\n' },
    { kind: "css", name: "a token invented later whose NAME declares it a rule ink",
      snippet: "\n[data-atlas] .at-seeded4{color:var(--hairline-dim)}\n" },
  ];

  for (const seed of SEEDS) {
    const host = checked.find((c) => c.kind === seed.kind);
    if (!host) { ok(seed.name, false, `no ${seed.kind} source available to seed`); continue; }
    const before = findViolations(host.src, seed.kind).length;
    const after = findViolations(host.src + seed.snippet, seed.kind);
    ok(seed.name, after.length === before + 1,
       `expected exactly one new violation, saw ${after.length - before}`);
  }

  /* AND IT MUST NOT FIRE ON THE THINGS THAT ARE FINE. A guard that flags every mention of a
     rule token would be silenced within a week, which is the same outcome as not having it. */
  console.log("\n[adherence] and it stays silent on legitimate uses");
  const LEGIT = [
    { kind: "css", name: "a hairline ink used as a border", snippet: "\n[data-atlas] .at-ok{border-top:1px solid var(--rule-4)}\n" },
    { kind: "css", name: "a mark ink used as a background", snippet: "\n[data-atlas] .at-ok2{background:var(--t4)}\n" },
    { kind: "css", name: "the definition of a rule token itself", snippet: "\n[data-atlas]{--rule-9:#334455}\n" },
    { kind: "css", name: "a text ink that is allowed to carry text", snippet: "\n[data-atlas] .at-ok3{color:var(--t3)}\n" },
    { kind: "jsx", name: "a mark ink passed as a stroke, not a colour", snippet: '\nconst Ok = () => <i style={{ background: "var(--t4)" }} />;\n' },
  ];
  for (const l of LEGIT) {
    const host = checked.find((c) => c.kind === l.kind);
    if (!host) continue;
    const before = findViolations(host.src, l.kind).length;
    const after = findViolations(host.src + l.snippet, l.kind).length;
    ok(l.name, after === before, `it fired on a legitimate use (${after - before} new)`);
  }
}

/* ── PART 2 · the light-shell evidence-bar ramp ───────────────────────────────────────── */

const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
const rgb = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lum = (h) => { const [r, g, b] = rgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/* Rec.601 luma — what a monochrome print and a greyscale display actually reduce to, and a
   different weighting from WCAG's relative luminance. Both are asserted because for blues and
   violets they disagree: a pair can clear a luminance ratio and still collapse in greyscale. */
const luma = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

export const CLASS_ORDER = ["td", "ts", "cat1", "cat2", "cat3", "cat4", "cat5"];

/* The light grounds a bar can land on. The bar must clear 3:1 on the DARKEST of them. */
export const PAPER_GROUNDS = { paper: "#f6f3ee", raised: "#efeae1", sunken: "#ece7dd" };

/* The light-shell echo of the cartographic ramp. NOT palette.js — that is the plate's own ink
   and ships unchanged. This is the paper derivation, and every number in it is the output of
   the constraint set asserted below rather than a hand-picked swatch. */
export const BAR_RAMP_LIGHT = {
  td: "#788594", ts: "#577691", cat1: "#2a6985",
  cat2: "#5e4b1e", cat3: "#61320d", cat4: "#541d1c", cat5: "#1f1930",
};

const MIN_ON_GROUND = 3.0;   // WCAG 1.4.11 — a bar is a graphical object carrying meaning
const MIN_ADJ_CR = 1.25;     // adjacent classes at a 1px stroke
const MIN_ADJ_LUMA = 12;     // and in monochrome, where hue buys nothing

console.log("\n[adherence] the light-shell evidence-bar ramp");
for (const c of CLASS_ORDER) {
  const worst = Math.min(...Object.values(PAPER_GROUNDS).map((g) => contrast(BAR_RAMP_LIGHT[c], g)));
  ok(`${c.toUpperCase().padEnd(4)} clears ${MIN_ON_GROUND}:1 on every paper ground`,
     worst >= MIN_ON_GROUND, `worst ground contrast ${worst.toFixed(2)}:1`);
}
for (let i = 0; i < CLASS_ORDER.length - 1; i++) {
  const a = CLASS_ORDER[i], b = CLASS_ORDER[i + 1];
  const cr = contrast(BAR_RAMP_LIGHT[a], BAR_RAMP_LIGHT[b]);
  const dl = luma(BAR_RAMP_LIGHT[a]) - luma(BAR_RAMP_LIGHT[b]);
  ok(`${a.toUpperCase()}/${b.toUpperCase()} separate at 1px and in monochrome`,
     cr >= MIN_ADJ_CR && dl >= MIN_ADJ_LUMA,
     `contrast ${cr.toFixed(2)}:1 (need ${MIN_ADJ_CR}), monochrome delta ${dl.toFixed(0)} (need ${MIN_ADJ_LUMA})`);
}
{
  const seq = CLASS_ORDER.map((c) => luma(BAR_RAMP_LIGHT[c]));
  ok("the ramp darkens monotonically, so the ordering survives with no colour at all",
     seq.every((v, i) => i === 0 || seq[i - 1] > v), `sequence ${seq.map((v) => v.toFixed(0)).join(" → ")}`);
}

/* THE PLATE'S RAMP IS NOT RE-TONED HERE, AND THAT IS THE POINT. It is authoritative, it is
   verified against the dark stage it actually draws on, and the classes it names are the same
   classes the bar echoes. What must hold is that the two tables describe the SAME SEVEN
   CLASSES in the same order -- a bar row for a class the plate does not draw, or a missing
   one, is a presentation table that has drifted from the cartography it claims to echo. */
{
  const src = await readFile(resolve(ROOT, "docs/storm-atlas/src/render/palette.js"), "utf8");
  const block = src.slice(src.indexOf("CATEGORY_COLOR"), src.indexOf("CATEGORY_ORDER"));
  const plateClasses = [...block.matchAll(/\b(td|ts|cat[1-5])\s*:/g)].map((m) => m[1]);
  ok("the bar echo names exactly the plate's seven classes, in the plate's order",
     JSON.stringify(plateClasses) === JSON.stringify(CLASS_ORDER),
     `plate declares ${JSON.stringify(plateClasses)}`);
}

console.log(
  failures === 0
    ? "\nno rule, hairline or mark ink carries text, and the paper ramp separates everywhere"
    : `\n${failures} adherence check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
