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
/* MATCHED PER SEGMENT, NOT AS A PREFIX. The first draft of this anchored at the start of the
   token, which caught --rule-4 and would have missed --at-paper-rule -- and the light shell
   names its hairlines exactly that way, so the gate would have gone green over the very
   tokens it exists to police. A name is forbidden when ANY of its dash-separated segments is
   one of these words. */
const RULE_WORDS = new Set(["rule", "rules", "hair", "hairline", "hairlines", "mark", "marks", "stroke", "grid", "tick", "ticks"]);
const NAME_RULE = { test: (tok) => tok.replace(/^--/, "").split("-").some((seg) => RULE_WORDS.has(seg)) };
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
    /* The light shell names its hairlines --at-paper-rule / --at-paper-hair, so the word sits
       in the MIDDLE of the token. A prefix-anchored rule passes these, which is the exact
       shape of the mistake this gate exists to stop. */
    { kind: "css", name: "a light-shell hairline whose rule word is not the first segment",
      snippet: "\n[data-atlas] .at-seeded5{color:var(--at-paper-rule)}\n" },
    { kind: "jsx", name: "a light-shell mark ink mid-name (JSX inline style)",
      snippet: '\nconst Seeded3 = () => <span style={{ color: "var(--at-paper-hair)" }}>—</span>;\n' },
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

/* THE STYLESHEET AND THIS FILE NOW STATE THE SAME TABLE TWICE, WHICH IS A DRIFT WAITING TO
 * HAPPEN -- and the drift would be silent, because a bar painted from a stale token still
 * renders a bar. So the CSS is read back and compared value by value: the numbers asserted
 * above are only meaningful if they are the numbers the surface actually paints with. */
{
  const css = await readFile(resolve(ROOT, "docs/storm-atlas/atlas.css"), "utf8");
  const declared = Object.fromEntries(
    [...css.matchAll(/--at-bar-(td|ts|cat[1-5])\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]),
  );
  for (const c of CLASS_ORDER) {
    ok(`atlas.css paints ${c.toUpperCase().padEnd(4)} with the ink this gate verified`,
       declared[c] === BAR_RAMP_LIGHT[c], `stylesheet has ${declared[c] || "no value"}, gate verified ${BAR_RAMP_LIGHT[c]}`);
  }

  /* AND THE LIGHT SHELL'S TEXT TIERS CLEAR AA ON THE GROUND EACH ONE LANDS ON. The paper ramp
     is new, so its contrast is asserted from the stylesheet rather than taken from the
     handoff's table -- the whole point of this gate is that a written contrast figure and a
     shipped ink are different things. ink-3 and ink-4 land on raised and sunken strips as well
     as on paper, so each is checked against the worst ground it can meet. */
  const inks = Object.fromEntries(
    [...css.matchAll(/--at-(ink-[1-4]|paper-accent|paper-flag)\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]),
  );
  const AA_BODY = 4.5;
  for (const [name, ink] of Object.entries(inks)) {
    const worst = Math.min(...Object.values(PAPER_GROUNDS).map((g) => contrast(ink, g)));
    ok(`--at-${name} clears AA body text on every paper ground`,
       worst >= AA_BODY, `worst ground contrast ${worst.toFixed(2)}:1 (need ${AA_BODY})`);
  }
  ok("the light shell declares all six text and signal inks",
     Object.keys(inks).length === 6, `found ${Object.keys(inks).length}: ${Object.keys(inks).join(", ")}`);

  /* THE LIGHT SHELL'S SEMANTIC INKS, ON THE GROUND THEY LAND ON.
   *
   * These are not the paper text tiers -- they are the status colours: the SUFFICIENT / BELOW
   * SAMPLE line, the flag, the accent. They are set at the label token, 10px, which is normal
   * text for contrast purposes and needs 4.5:1.
   *
   * MEASURED RATHER THAN INHERITED. The dark shell's green and red do not survive the swap:
   * green-600 is 2.67:1 on paper and red-600 is 3.92:1, both below AA, and both would have read
   * as perfectly ordinary status colours to anyone looking at them. The light shell takes
   * green-800 and red-700 instead. Asserted here so the next edit to this block is measured too. */
  const lightBlock = css.slice(css.indexOf('[data-atlas]:not([data-shell="dark"]){'),
                               css.indexOf("color-scheme:light"));
  const semantic = Object.fromEntries(
    [...lightBlock.matchAll(/--(pos|neg|special)\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]),
  );
  ok("the light shell declares its own status inks", Object.keys(semantic).length === 3,
     JSON.stringify(semantic));
  for (const [name, ink] of Object.entries(semantic)) {
    const worst = Math.min(...Object.values(PAPER_GROUNDS).map((g) => contrast(ink, g)));
    ok(`--${name} clears AA as a status word on paper`, worst >= AA_BODY,
       `${ink} measures ${worst.toFixed(2)}:1 on its worst ground`);
  }

  /* EVERY DARK-SHELL COLOUR TOKEN IS EITHER RE-DECLARED FOR PAPER OR EXEMPT BY NAME.
   *
   * THIS RULE EXISTS BECAUSE ONE TOKEN WAS MISSED AND NOTHING NOTICED. `--warn` -- an amber
   * written for a near-black chrome -- was declared once in the base block and never re-declared
   * for the light shell, so it inherited straight through: #f0b429 measures 1.68:1 on
   * --at-paper against an AA bar of 4.5. It is not decoration. It is the ink on the methodology
   * notice, the builder's outcome-side warnings, the environment lens's era boundary and the
   * inspector's replay guard, so the four places the archive raises its hand were the four
   * hardest things on the light surface to read -- and every per-token contrast check above
   * passed, because none of them was looking at a token the light shell never mentions.
   *
   * Checking the tokens the light shell DOES declare can only ever find the ones somebody
   * remembered. So the assertion is inverted: enumerate the base block's colour tokens and
   * require each to appear in the light block, with a stated reason for any that must not. */
  const baseBlock = (() => {
    const i = css.indexOf("[data-atlas]{");
    let depth = 0;
    for (let k = i + "[data-atlas]".length; k < css.length; k += 1) {
      if (css[k] === "{") depth += 1;
      else if (css[k] === "}") { depth -= 1; if (depth === 0) return css.slice(i, k); }
    }
    return "";
  })();
  /* THE PLATE'S OWN INK, WHICH MUST NOT BE RE-DECLARED: --stage is the cartographic ground and
     the whole light shell is built on it staying exactly where it is. The assertion above pins
     that it appears once; this one records WHY it is absent from the light table. And the
     `--at-*` names are the paper palette's own definitions -- they are what the light block
     resolves TO, so requiring them inside it would be circular. */
  const SHELL_EXEMPT = new Map([["--stage", "the cartographic plate is dark in both shells"]]);
  const baseColour = [...baseBlock.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{3,8}\b|rgba?\()/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((n) => !n.startsWith("--at-"));
  const lightDeclares = new Set(
    [...lightBlock.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1].toLowerCase()),
  );
  const missed = [...new Set(baseColour)].filter(
    (n) => !lightDeclares.has(n) && !SHELL_EXEMPT.has(n));
  ok("every dark-shell colour token is re-declared for paper or exempt by name",
     missed.length === 0,
     `${missed.join(", ")} would inherit a dark-chrome ink onto the paper shell`);
  ok("the base block still declares the colour tokens this rule reads",
     baseColour.length >= 15, `found only ${baseColour.length}`);

  /* AND THE PLATE KEEPS THE DARK RAMP IN THE LIGHT SHELL. The stage re-declares the dark ink set
     for its own subtree, because its furniture -- the title line, the scale bar, the coastline
     statement, every graticule label -- inherits the surface's text tokens. Without this the
     light shell would paint dark ink on a plate that is dark in both shells. */
  ok("the stage re-declares the dark ink set inside the light shell",
     /\[data-atlas\]:not\(\[data-shell="dark"\]\) \.atlas-stage\{[^}]*--t1:var\(--d-t1\)/.test(css),
     "the plate would inherit paper inks");

  /* THE APERTURE'S TWO BOUNDS AND THE MEASURE THAT SETS THE PLATE'S WIDTH, PINNED TO THE NUMBERS
   * THEY WERE DERIVED AS.
   *
   * 1.421 is 1.303 (the archive's core frame) times 1.0905, which is half a Leaflet zoom-snap
   * step -- the median landing rather than the best case.
   * 3.2 is where a single East Pacific track stops being the subject of its own plate.
   *
   * THREE BOUNDS THAT USED TO BE PINNED HERE ARE GONE, AND THEIR ABSENCE IS RECORDED RATHER THAN
   * SILENT. `--at-plate-hmax:500px`, `--at-plate-ar-wide:4.0` and `--at-deck-min:352px` all
   * existed because the evidence sat UNDER the map: plate height came out of visible rows, so a
   * cap, a relaxed ceiling for the widths the cap governed, and a floor for the deck were three
   * halves of one trade. Beside a ledger with its own full-height column there is no trade --
   * the two are different tracks -- and a height cap would only force the frozen 834px plate to
   * aspect 1.67 where 5c measures 1.44.
   *
   * WHAT REPLACED THEM IS THE LEDGER MEASURE, AND IT IS PINNED THE SAME WAY. `--at-ledger` with
   * the page padding and the gutter is what decides the plate's width, and therefore -- through
   * the two aspect bounds -- its height. The expression below produces 5c's measured 834px plate
   * at 1440 and turn 4's stated 1180px plate at 1920; widening it is the modern form of exactly
   * the edit the old cap was pinned to prevent, so it is a change to this file with a number in
   * the diff. */
  const bounds = Object.fromEntries(
    [...css.matchAll(/--at-plate-(ar|ar-max)\s*:\s*([\d.]+)/g)].map((m) => [m[1], m[2]]),
  );
  /* 1.668 ROUNDED UP. 86.1 world-units of longitude (the four research corridors plus a degree
     of margin) times 1.189 (Leaflet's quarter-step ceil on the clamp fit) over 61.37 (the NA + EP
     clamp's height). Rounded UP rather than to nearest, because every term is a bound rather
     than an estimate and the rounding has to go the way that keeps them. */
  ok("the aperture floor is the one the research corridors require",
     bounds.ar === "1.67", `--at-plate-ar is ${bounds.ar}`);
  ok("and the ceiling is where one track stops being the subject of its plate",
     bounds["ar-max"] === "3.2", `--at-plate-ar-max is ${bounds["ar-max"]}`);
  ok("the aperture floor reaches the stage as a token, not as a literal",
     /min-height:min\(calc\(var\(--at-plate-avail\) \/ var\(--at-plate-ar-max\)\)/.test(css),
     "the stage's height floor is not reading the pinned token");
  /* AND THE CEILING BOUNDS THE BAND RATHER THAN THE PLATE, WHICH IS THE WHOLE OF WHY IT COSTS
     NOTHING NOW. Applied to the plate it caps the map inside a column that keeps its height, and
     the difference is paper under the map. Applied to the band it caps both columns together, so
     a tall monitor shows more of the matrix instead of a taller map with a cropped opening view.
     check-atlas-camera is what measures the consequence; this is the declaration. */
  ok("and the aperture ceiling bounds the band, not the plate",
     /height:min\(\s*calc\(100vh - var\(--at-head-h\) - var\(--at-peek\) - var\(--at-tport\)\),\s*calc\(var\(--at-plate-avail\) \/ var\(--at-plate-ar\) \+ var\(--at-fig-chrome\)\)\)/
       .test(css.replace(/\s+/g, " ").replace(/height:min\( /, "height:min(")),
     "the band's height is not composed from the viewport and the aspect bound");
  ok("the ceiling is the aspect the research corridors measured",
     /--at-plate-ar:\s*1\.6\s*;/.test(css), "--at-plate-ar has moved off the measured 1.6");
  /* AND THE THREE RETIRED TOKENS MUST STAY RETIRED. A cap re-declared but unread is a bound
     somebody will wire back up on the first aperture failure; a cap re-declared AND read is the
     stacked shell returning by the back door. Either way the argument above stops being true, so
     neither is allowed to happen quietly. */
  /* READ WITH THE COMMENTS STRIPPED, because the paragraph above NAMES all three in prose --
     that is the record of why they went, and a rule that could not tell an explanation from a
     declaration would forbid the file from explaining itself. */
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const dead of ["--at-plate-hmax", "--at-plate-ar-wide", "--at-deck-min"]) {
    ok(`${dead} is retired, not merely unused`,
       !new RegExp(`${dead}\\s*:`).test(cssCode) && !cssCode.includes(`var(${dead})`),
       `${dead} is still declared or read; the plate's height model has two answers`);
  }
  /* THE SPLIT BETWEEN THE PLATE AND THE ANSWER, WHICH IS THE CONTRACT'S FIRST NUMBER.
   *
   * WHAT WAS HERE. `--at-ledger:clamp(486px,33.75vw,620px)` -- one measure for a scrolling
   * evidence column, floored at the five tracks a refused row needs so that its STATUS could not
   * sit off the right-hand edge. The column is gone: the evidence is under the band at page
   * width, and what sits beside the plate is eight rows.
   *
   * WHAT REPLACES IT IS A DECLARED MEASURE AT EACH OF THE TWO DESKTOP BANDS, because the contract
   * fixes the split rather than the column: the plate is 60-62% of the usable width at 1920 and
   * 57-59% at 1440. The Atlas announces itself as a geographic instrument before it announces
   * itself as a table, and a percentage that drifts with the viewport cannot hold that. Both
   * bands are asserted below as PERCENTAGES, which is the form the contract states them in --
   * scripts/check-atlas-contract.mjs measures the same thing in a browser. */
  const answer = (css.match(/--at-answer:\s*(\d+)px/) || [])[1];
  const answerWide = (css.match(/@media \(min-width:1700px\)\{[^}]*--at-answer:\s*(\d+)px/)
    || [])[1];
  ok("the answer's measure is declared at both desktop bands",
     answer === "559" && answerWide === "700",
     `--at-answer is ${answer}px, ${answerWide}px above 1700`);
  const pad = (css.match(/--at-pad:\s*(\d+)px/) || [])[1];
  const gap = (css.match(/--at-gap:\s*(\d+)px/) || [])[1];
  const gapWide = (css.match(/@media \(min-width:1700px\)\{[^}]*--at-gap:\s*(\d+)px/) || [])[1];
  ok("with the page padding and gutter it names", pad === "40" && gap === "24" && gapWide === "34",
     `--at-pad ${pad}px, --at-gap ${gap}px / ${gapWide}px`);
  /* AND THE ARITHMETIC IS ASSERTED, NOT ASSUMED. If any of the numbers above moves, one of these
     two bands stops being true before anybody opens a browser. */
  const usable = (vw) => vw - 2 * Number(pad);
  const plateAt = (vw, g, a) => vw - 2 * Number(pad) - Number(g) - Number(a);
  const share = (vw, g, a) => plateAt(vw, g, a) / usable(vw);
  const at1440 = share(1440, gap, answer);
  const at1920 = share(1920, gapWide, answerWide);
  ok("which puts the plate in the contract's band at 1440",
     at1440 >= 0.57 && at1440 <= 0.59, `${(100 * at1440).toFixed(1)}%`);
  ok("and in the contract's band at 1920",
     at1920 >= 0.60 && at1920 <= 0.62, `${(100 * at1920).toFixed(1)}%`);
  /* AND THE ANSWER'S OWN SHARE, from the other end: a split stated as one bound is a split that
     can be met by shrinking the page rather than by holding the proportion. */
  const ans1440 = Number(answer) / usable(1440);
  const ans1920 = Number(answerWide) / usable(1920);
  ok("with the answer holding its own share at both",
     ans1440 >= 0.41 && ans1440 <= 0.43 && ans1920 >= 0.38 && ans1920 <= 0.40,
     `${(100 * ans1440).toFixed(1)}% at 1440, ${(100 * ans1920).toFixed(1)}% at 1920`);
  ok("the plate's available width is derived from them rather than from the viewport",
     /--at-plate-avail:calc\(100vw - 2 \* var\(--at-pad\) - var\(--at-gap\) - var\(--at-answer\)\)/
       .test(css),
     "--at-plate-avail is not composed from the measure tokens");

  /* AND NO RULE MAY NAME AN INK THAT IS NOT A TOKEN.
   *
   * THE RULE ABOVE ENUMERATES TOKENS, WHICH IS EXACTLY WHY IT MISSED WHAT IT MISSED. A stylesheet
   * written for one chrome and then given a second one keeps every literal it ever had, and a
   * literal answers to no shell: `.at-masthead h2{color:#f8fbff}` put the selected storm's NAME
   * at 1.07:1 on paper -- invisible -- while every token assertion in this file passed, because
   * none of them was looking at a declaration that mentions no token at all. There were nineteen.
   *
   * So: a `color:` declaration in atlas.css must resolve through a custom property, unless the
   * thing it paints sits ON THE CARTOGRAPHIC PLATE, which is dark in both shells and is the one
   * place a fixed light ink is always right. Those are listed by selector, so adding one is a
   * decision with a name on it rather than an oversight.
   *
   * check-light-contrast.mjs is the other half: this rule stops a literal being WRITTEN, that
   * one measures what the browser actually resolved on every surface in both shells. Neither
   * subsumes the other -- a token can be wrong too, and this file cannot see a JSX inline style. */
  const ON_PLATE = [
    "[data-atlas] .leaflet-control-zoom a:hover",   // the map's own zoom control
    "[data-atlas] .at-mapnav a:hover",              // HOME and FIT, in the same bar as the zoom
    "[data-atlas] .at-invite em",                   // the invitation, drawn over the plate
  ];
  const literalInks = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").split("\n").pop().trim();
    for (const d of m[2].matchAll(/(?<![-\w])color\s*:\s*(#[0-9a-f]{3,6})\b/gi)) {
      if (ON_PLATE.includes(sel)) continue;
      literalInks.push(`${sel} { color:${d[1]} }`);
    }
  }
  ok("no rule paints text with a literal ink instead of a token",
     literalInks.length === 0,
     literalInks.join("\n") + "\n  a literal answers to no shell; use a token, or add the "
     + "selector to ON_PLATE if it really is on the plate");
  ok("the on-plate exemptions still exist to be exempt",
     ON_PLATE.every((sel) => css.includes(sel)),
     "an exemption names a selector that is no longer in the stylesheet");

  /* THE PLATE IS EXCLUDED FROM THE SHELL SWAP BY CONSTRUCTION, and that is a structural claim
     worth pinning: --stage is declared exactly once, so no later edit to a light shell can
     lighten the cartographic plate by accident. */
  const stageDecls = [...css.matchAll(/(?:^|[;{\s])--stage\s*:/gm)].length;
  ok("--stage is declared exactly once, so no shell can re-tone the plate",
     stageDecls === 1, `found ${stageDecls} declarations`);
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

  /* AND THE DARK SHELL'S BAR IS THE CARTOGRAPHIC RAMP ITSELF, not a copy that drifted from it.
     The dark chrome and the stage are close enough in tone that the plate's own ink reads on
     both, so the dark bar SHOULD be palette.js exactly -- which means the stylesheet is holding
     a second copy of seven hexes, and a second copy is the thing this gate exists to catch. */
  const plateInk = Object.fromEntries(
    [...block.matchAll(/\b(td|ts|cat[1-5])\s*:\s*"(#[0-9a-f]{6})"/gi)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]),
  );
  const css2 = await readFile(resolve(ROOT, "docs/storm-atlas/atlas.css"), "utf8");
  const darkBar = Object.fromEntries(
    [...css2.matchAll(/--barink-(td|ts|cat[1-5])\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()]),
  );
  for (const c of CLASS_ORDER) {
    ok(`the dark shell's ${c.toUpperCase().padEnd(4)} bar is palette.js's own ink`,
       darkBar[c] === plateInk[c], `stylesheet ${darkBar[c] || "missing"}, palette.js ${plateInk[c]}`);
  }
}

console.log(
  failures === 0
    ? "\nno rule, hairline or mark ink carries text, and the paper ramp separates everywhere"
    : `\n${failures} adherence check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
