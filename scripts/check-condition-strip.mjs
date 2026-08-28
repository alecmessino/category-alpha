#!/usr/bin/env node
/* THE QUERY'S BOUNDARY, ASSERTED FROM STRUCTURE RATHER THAN FROM PROSE.
 *
 * WHAT IS ACTUALLY AT RISK. A cohort is defined by two kinds of condition that are not
 * interchangeable. Genesis-side conditions narrow the POPULATION. Outcome-side conditions narrow
 * the population AND take the conditioned variable out of the evidence -- a cohort defined by
 * "reached Cat 4" cannot report a Category 4 rate, because every member has one by construction.
 *
 * A reader who cannot tell which side a condition sits on cannot tell a finding from an artefact
 * of their own question. That is the failure this file exists to prevent, and it is a failure
 * that a screenshot review passes every time: the sentence looks fine, the words are all
 * correct, and the two sides are simply not distinguishable at a glance.
 *
 * WHAT CHANGED, AND WHY THE ASSERTIONS MOVED WITH IT. The query used to be three labelled zones
 * in a band under the question, and this file asserted the band's rules. `5c` puts both sides
 * INSIDE the sentence as pressable clauses, so the boundary is now carried twice and both are
 * checked here:
 *
 *   IN THE GRAMMAR.  engine/cohort-language.js composes the sentence so a genesis condition sits
 *                    inside a `formed …` clause and an outcome one follows `that …` or `given
 *                    that they also …`. The zone each clause belongs to is emitted with it, and
 *                    scripts/test-atlas-cohort.mjs proves the clauses join back into the exact
 *                    string the citation quotes.
 *   IN THE INK.      A set genesis clause is ruled in the accent; a set outcome clause in the
 *                    flag, because an outcome-side condition COSTS a row; scope in the hairline,
 *                    because it changes which RECORDS are eligible rather than which storms
 *                    qualify. An UNSET clause is dotted rather than solid: an invitation is not
 *                    a condition, and that difference has to survive the words too.
 *
 * SO THE TEST COVERS THE PROSE. Every assertion below about the boundary is made against
 * COMPUTED STYLE with the text ignored -- rule style, weight and ink, per zone, pairwise
 * distinct. A reader scanning a sentence reads its shapes before its words, and a boundary that
 * only exists once you have parsed a subordinate clause is a boundary that is late.
 *
 * AND EVERY ZONE IS ASSERTED UNSET AS WELL AS SET. An unset side that renders nothing is the
 * same failure by another route: with no conditions at all the question would read as a bare
 * "Every storm in the archive", and a reader would have no way to learn the surface HAS two
 * sides until they happened to set a condition on one of them.
 *
 * Run: node scripts/check-condition-strip.mjs [--self-test] [--require-browser]
 */
import { build } from "esbuild";
import { writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
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

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* reported below */ }
if (!chromium) {
  const required = process.argv.includes("--require-browser");
  console.log(required
    ? "[strip] playwright is absent and --require-browser was given"
    : "[strip] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

/* THE SPECS ARE THE ENGINE'S, NOT A FIXTURE'S. The head renders whatever `questionSegmentsOf`
   emits, so handing it a hand-written clause list would prove that this file and the head agree
   and say nothing about the sentence a reader actually meets. Each state below is a real cohort
   spec, normalised and put through the same two engine functions the surface calls. */
const SPECS = {
  "no conditions at all": {},
  "genesis-side only": { where: { lat: 24.1, lon: -71.3, radiusKm: 400 }, seasonFrom: 1971 },
  "outcome-side only": { intensity: "cat4" },
  "scope only": { namedOnly: true },
  "all three zones populated": {
    where: { lat: 24.1, lon: -71.3, radiusKm: 400 }, seasonFrom: 1971,
    intensity: "cat4", namedOnly: true,
  },
};

const dir = await mkdtemp(join(ROOT, ".strip-build-"));
const entry = join(dir, "entry.jsx");
await writeFile(entry, `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryHead } from ${JSON.stringify(resolve(ROOT, "docs/storm-atlas/src/ui/condition-strip.jsx"))};
import { conditionsOf, normalise } from ${JSON.stringify(resolve(ROOT, "docs/storm-atlas/src/engine/cohort.js"))};
import { questionSegmentsOf } from ${JSON.stringify(resolve(ROOT, "docs/storm-atlas/src/engine/cohort-language.js"))};

/* The head, built from a real spec exactly as ui/atlas.jsx builds it. */
export function render(spec, extra = {}) {
  const s = normalise(spec);
  const conditions = conditionsOf(s);
  return renderToStaticMarkup(React.createElement(QueryHead, {
    segments: questionSegmentsOf(s),
    conditions,
    scope: conditions.filter((c) => c.zone === "scope"),
    kept: 3885, total: 3959, sufficient: true, minSample: 10,
    ...extra,
  }));
}
`);
const outfile = join(dir, "bundle.mjs");
await build({
  entryPoints: [entry], outfile, bundle: true, format: "esm", platform: "node",
  jsx: "automatic", logLevel: "silent",
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
});
const { render } = await import(outfile);

const CSS = await readFile(resolve(ROOT, "docs/storm-atlas/atlas.css"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 400 } });

/* The head is rendered inside a `[data-atlas]` host because every rule in atlas.css is scoped to
   it -- rendering the markup without that ancestor would compute unstyled and pass nothing. The
   light shell is the default and is what a reader gets, so nothing is forced here. */
const mount = async (html, extraCss = "") => {
  await page.setContent(`<!doctype html><html><head><style>${CSS}${extraCss}</style></head>
    <body style="margin:0"><div data-atlas class="atlas-shell atlas-instrument">${html}</div></body></html>`);
};

/* THE BOUNDARY, READ FROM COMPUTED STYLE. Text is deliberately not consulted. Every clause is
   ruled UNDER rather than beside, because it sits inside a sentence rather than beside a label,
   so the signature is the bottom rule's style, weight and ink. */
const READ_RULES = () => [...document.querySelectorAll("[data-zone]")].map((z) => {
  const s = getComputedStyle(z);
  return {
    zone: z.getAttribute("data-zone"),
    style: s.borderBottomStyle,
    width: s.borderBottomStyle === "none" ? 0 : Math.round(parseFloat(s.borderBottomWidth) * 100) / 100,
    ink: s.borderBottomColor,
    empty: z.hasAttribute("data-zone-empty"),
    hint: z.hasAttribute("data-zone-hint"),
    text: (z.textContent || "").trim(),
    tag: z.tagName,
    edits: z.getAttribute("data-zone-edit"),
    /* A clause is ruled underneath and nowhere else: a box around a word inside a sentence reads
       as a chip, and a chip in a sentence is the tag treatment 5c replaced. */
    box: [s.borderTopStyle, s.borderRightStyle, s.borderLeftStyle].join(","),
    h: Math.round(z.getBoundingClientRect().height),
  };
});

console.log("[strip] both sides and the scope are addressable in every state, set or unset");
for (const [name, spec] of Object.entries(SPECS)) {
  await mount(render(spec));
  const rules = await page.evaluate(READ_RULES);
  const zones = rules.map((r) => r.zone);
  ok(`${name}: all three zones are present`,
     ["given", "outcome", "scope"].every((z) => zones.includes(z)),
     `saw ${zones.join(", ")}`);
  /* IN LIFECYCLE ORDER, WHICH IS THE ORDER OF THE BOUNDARY AND NOT OF THE WHOLE SENTENCE. A
     storm forms before it does anything, so the genesis side is read before the outcome side --
     that is the pair a reader must never transpose, and it is asserted. SCOPE IS NOT PINNED TO A
     POSITION: `namedOnly` is a scope condition that reads as an adjective on the head noun
     ("Named North Atlantic storms"), so English puts it first, while `includeProvisional` reads
     as a trailing clause and puts it last. Pinning it to third would be asserting a grammar the
     engine deliberately does not have. */
  const iGiven = zones.indexOf("given");
  const iOutcome = zones.indexOf("outcome");
  ok(`${name}: the genesis side is read before the outcome side`,
     iGiven >= 0 && iOutcome >= 0 && iGiven < iOutcome,
     `given at ${iGiven}, outcome at ${iOutcome} in ${zones.join(", ")}`);
  const emptyOnes = rules.filter((r) => r.empty);
  ok(`${name}: every unset side says what it would hold, in the sentence`,
     emptyOnes.every((r) => r.hint && r.text.length > 3),
     emptyOnes.filter((r) => !r.hint).map((r) => r.zone).join(", ") || "an unset clause is empty");
  ok(`${name}: no clause is drawn as a box`,
     rules.every((r) => r.box === "none,none,none"),
     rules.filter((r) => r.box !== "none,none,none").map((r) => `${r.zone}: ${r.box}`).join(" "));
}

console.log("\n[strip] and the boundary survives the prose being covered");
{
  await mount(render(SPECS["all three zones populated"]));
  const rules = await page.evaluate(READ_RULES);
  const set = rules.filter((r) => !r.empty);
  const sig = (r) => `${r.style}|${r.width}|${r.ink}`;
  const byZone = (z) => set.find((r) => r.zone === z);
  const given = byZone("given"), outcome = byZone("outcome"), scope = byZone("scope");
  ok("with every side set, each zone's rule is a distinct style-weight-ink signature",
     new Set([given, outcome, scope].map(sig)).size === 3,
     [given, outcome, scope].map((r) => `${r.zone}: ${sig(r)}`).join("  "));
  ok("genesis-side and outcome-side are told apart by INK, not only by weight",
     given.ink !== outcome.ink, `both ${given.ink}`);
  ok("and both are ruled, so neither reads as unset",
     given.width >= 1 && outcome.width >= 1 && given.style === "solid" && outcome.style === "solid",
     `given ${given.style} ${given.width}px, outcome ${outcome.style} ${outcome.width}px`);
  ok("scope is neither of them",
     scope.ink !== given.ink && scope.ink !== outcome.ink,
     `scope ${scope.ink}, given ${given.ink}, outcome ${outcome.ink}`);

  /* THE SHARPEST FORM OF THE TEST. With every word removed the set sides must still be visibly
     different things -- this is what a reader gets in the first fifth of a second, before any
     word has been read. */
  const blind = await page.evaluate(() => [...document.querySelectorAll("[data-zone]")]
    .filter((z) => !z.hasAttribute("data-zone-empty"))
    .map((z) => {
      z.textContent = "";
      const s = getComputedStyle(z);
      return `${z.getAttribute("data-zone")}:${s.borderBottomStyle}|${s.borderBottomWidth}|${s.borderBottomColor}`;
    }));
  ok("with every word erased, the set sides remain distinct shapes",
     new Set(blind.map((b) => b.split(":")[1])).size === 3, blind.join("  "));
}

console.log("\n[strip] an unset side is an invitation, and it does not look like a condition");
{
  await mount(render({ intensity: "cat4" }, { onEdit: () => {} }));
  const rules = await page.evaluate(READ_RULES);
  const unset = rules.find((r) => r.zone === "given" && r.empty);
  const set = rules.find((r) => r.zone === "outcome" && !r.empty);
  ok("an unset clause is a real button, so it answers Enter and takes focus",
     unset && unset.tag === "BUTTON", unset && unset.tag);
  ok("and it opens the editor for its own side",
     unset && unset.edits === "given", unset && unset.edits);
  /* THE DIFFERENCE A READER MUST NOT MISS. A dotted rule under an invitation and a solid one
     under a condition: an unset side that looked like a set one would let a reader believe they
     had narrowed a population they had not. */
  ok("an unset clause is dotted and a set one is solid",
     unset && set && unset.style === "dotted" && set.style === "solid",
     `unset ${unset && unset.style}, set ${set && set.style}`);
  ok("the clause is its own hit target, at the height of the line it sits in",
     unset && unset.h >= 14, unset && `${unset.h}px`);
  /* A SET CLAUSE CARRIES ITS OWN REMOVAL, BESIDE IT RATHER THAN INSIDE IT. A × within the button
     that opens the editor would make removing one condition a coin flip against editing it. */
  await mount(render({ intensity: "cat4" }, { onEdit: () => {}, onClear: () => {} }));
  const removal = await page.evaluate(() => {
    const x = document.querySelector("[data-condition-clear]");
    const clause = document.querySelector('[data-condition="intensity"]');
    if (!x || !clause) return null;
    return { inside: clause.contains(x), after: clause.compareDocumentPosition(x) & 4 };
  });
  ok("a set clause has a removal", !!removal);
  if (removal) {
    ok("which is beside the clause, not inside the control that edits it",
       !removal.inside && !!removal.after);
  }
}

console.log("\n[strip] RESET QUERY is present exactly when there is a query to reset");
{
  await mount(render({}, { onReset: () => {} }));
  ok("absent on an unqueried archive",
     !(await page.evaluate(() => !!document.querySelector("[data-reset-query]"))));
  await mount(render(SPECS["all three zones populated"],
    { onReset: () => {}, onClear: () => {}, onEdit: () => {} }));
  const r = await page.evaluate(() => {
    const b = document.querySelector("[data-reset-query]");
    if (!b) return null;
    const head = document.querySelector("[data-condition-strip]");
    return {
      text: b.textContent.trim(),
      title: b.title || "",
      right: Math.round(b.getBoundingClientRect().right),
      headRight: Math.round(head.getBoundingClientRect().right),
      removals: document.querySelectorAll("[data-condition-clear]").length,
      conditions: document.querySelectorAll("[data-condition]").length,
    };
  });
  ok("present the moment any condition is set", !!r);
  if (r) {
    ok("it says RESET QUERY", r.text === "RESET QUERY", r.text);
    ok("on the cohort line, inside the head", r.right <= r.headRight + 1,
       `right ${r.right} against head ${r.headRight}`);
    /* THE THREE WAYS OUT ARE DISTINCT, AND THIS ONE SAYS WHICH IT IS. RESET QUERY clears the
       conditions; HOME and FIT move the camera. A control that did both would be the one a
       reader can never use deliberately. */
    ok("and it says what it does NOT touch", /camera/i.test(r.title), r.title);
    /* ONE PER CONDITION, WHICH IS THE POINT. RESET is the blunt instrument and these are the
       precise one: a reader dropping one of four conditions should not have to rebuild the
       other three. Counted against the engine's own condition list rather than a literal. */
    ok("the individual × removals survive alongside it, one per set clause",
       r.removals === r.conditions && r.removals > 0,
       `${r.removals} removals for ${r.conditions} set clauses`);
  }
}

console.log("\n[strip] the last edit is one number to one number, and nothing accumulates");
{
  await mount(render(SPECS["genesis-side only"], { lastEdit: { from: 964, to: 847 } }));
  const t = await page.evaluate(() => {
    const e = document.querySelector("[data-last-edit]");
    return e ? e.textContent.replace(/\s+/g, " ").trim() : null;
  });
  ok("it reads as a population delta", /964\s*→\s*847/.test(t || ""), String(t));
  await mount(render(SPECS["genesis-side only"]));
  const none = await page.evaluate(() => !!document.querySelector("[data-last-edit]"));
  ok("and it is absent before the first edit rather than showing zeros", !none);
}

console.log("\n[strip] the cohort has one primary home, and it is under the question");
{
  await mount(render({}));
  const c = await page.evaluate(() => {
    const q = document.querySelector("[data-question]");
    const n = document.querySelector("[data-cohort-size]");
    const line = document.querySelector("[data-cohort-line]");
    if (!q || !n || !line) return null;
    const qs = getComputedStyle(q), ns = getComputedStyle(n);
    return {
      question: parseFloat(qs.fontSize),
      cohort: parseFloat(ns.fontSize),
      below: line.getBoundingClientRect().top >= q.getBoundingClientRect().bottom - 1,
      text: line.textContent.replace(/\s+/g, " ").trim(),
      /* HOW MANY TIMES THE COUNT APPEARS IN THE HEAD. Once. A second rendering of one number is
         a reader looking for the difference between them. */
      repeats: (document.querySelector("[data-condition-strip]").textContent.match(/3,885/g) || []).length,
    };
  });
  ok("the head renders a question and a cohort line", !!c);
  if (c) {
    ok("the question unmistakably dominates", c.question >= 2 * c.cohort,
       `question ${c.question}px against cohort ${c.cohort}px`);
    ok("and the cohort line sits beneath it", c.below);
    ok("which carries the count, the sufficiency and the gate",
       /3,885 of 3,959 archive storms/.test(c.text) && /SUFFICIENT/.test(c.text)
       && /MIN 10/.test(c.text), c.text);
    ok("and states the count exactly once", c.repeats === 1, `${c.repeats} renderings of 3,885`);
  }
}

/* ── seeded regressions ──────────────────────────────────────────────────────────────────── */
if (process.argv.includes("--self-test")) {
  console.log("\n[strip] seeded regressions — each must be caught");

  const SEEDS = [
    {
      name: "the two sides given the same rule ink (the boundary erased)",
      css: '[data-atlas] .at-clause.at-zone-muted{border-bottom-color:var(--accent)!important}',
      expect: (rules) => {
        const g = rules.find((r) => r.zone === "given" && !r.empty);
        const o = rules.find((r) => r.zone === "outcome" && !r.empty);
        return g.ink === o.ink;
      },
      rule: "genesis-side and outcome-side are told apart by INK",
    },
    {
      name: "scope given a question side's ink",
      css: '[data-atlas] .at-clause.at-zone-hair,[data-atlas] .at-cohort-scope'
        + '{border-bottom-color:var(--accent)!important}',
      expect: (rules) => {
        const g = rules.find((r) => r.zone === "given" && !r.empty);
        const s = rules.find((r) => r.zone === "scope" && !r.empty);
        return s.ink === g.ink;
      },
      rule: "scope is neither of them",
    },
    {
      name: "every clause rule removed (three sides, no boundary at all)",
      css: '[data-atlas] .at-clause,[data-atlas] .at-cohort-scope{border-bottom:0!important}',
      expect: (rules) => new Set(rules.filter((r) => !r.empty)
        .map((r) => `${r.style}|${r.width}|${r.ink}`)).size < 3,
      rule: "each zone's rule is a distinct signature",
    },
    {
      name: "an unset clause ruled solid, so an invitation reads as a condition",
      css: '[data-atlas] .at-clause.at-zone-empty{border-bottom-style:solid!important}',
      expect: (rules) => rules.filter((r) => r.empty).every((r) => r.style === "solid"),
      rule: "an unset clause is dotted and a set one is solid",
    },
  ];

  for (const seed of SEEDS) {
    await mount(render(SPECS["all three zones populated"], { onEdit: () => {} }), seed.css);
    const rules = await page.evaluate(READ_RULES);
    let caught = false;
    try { caught = seed.expect(rules); } catch { caught = false; }
    ok(`caught: ${seed.name}`, caught, `"${seed.rule}" would not have failed`);
  }

  /* AND A CHANGE THAT MOVES NOTHING IS NOT A FAILURE. A gate that fires on any edit at all is a
     gate everybody learns to override. */
  await mount(render(SPECS["all three zones populated"]),
    '[data-atlas] .at-cohort{letter-spacing:.61px}');
  const rules = await page.evaluate(READ_RULES);
  const set = rules.filter((r) => !r.empty);
  ok("an unrelated style change leaves the boundary intact",
     new Set(set.map((r) => `${r.style}|${r.width}|${r.ink}`)).size === 3);
}

await browser.close();
await rm(dir, { recursive: true, force: true });

console.log(failures === 0
  ? "\nboth sides of the query are legible from the sentence's own shapes, set or unset"
  : `\n${failures} boundary check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
