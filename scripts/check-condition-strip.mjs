#!/usr/bin/env node
/* THE CONDITION STRIP'S BOUNDARY, ASSERTED FROM STRUCTURE RATHER THAN FROM PROSE.
 *
 * WHAT IS ACTUALLY AT RISK. A cohort is defined by two kinds of condition that are not
 * interchangeable. Genesis-side conditions narrow the POPULATION. Outcome-side conditions narrow
 * the population AND take the conditioned variable out of the evidence -- a cohort defined by
 * "reached Cat 4" cannot report a Category 4 rate, because every member has one by construction.
 *
 * A reader who cannot tell which side a condition sits on cannot tell a finding from an artefact
 * of their own question. That is the failure this file exists to prevent, and it is a failure
 * that a screenshot review passes every time: the strip looks fine, the words are all correct,
 * and the two zones are simply not distinguishable at a glance.
 *
 * SO THE TEST COVERS THE PROSE. Every assertion below about the boundary is made against
 * COMPUTED STYLE with the text ignored -- rule weight and rule ink, per zone, pairwise distinct.
 * A reader scanning a strip reads the shapes before the words, and a boundary that only exists
 * once you have read two headings is a boundary that does not exist when it matters.
 *
 * AND THE ZONES ARE ASSERTED EMPTY AS WELL AS FULL. An unset zone that renders nothing is the
 * same failure by another route: with no conditions at all the strip would collapse to a blank
 * band, and the reader would have no way to learn the surface HAS two sides until they happened
 * to set a condition on one of them.
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

/* Conditions in the engine's own shape -- see engine/cohort.js conditionsOf(). */
const GENESIS = [
  { key: "where", zone: "given", label: "FORMED NEAR", value: "24.1N 71.3W · 400 km" },
  { key: "season", zone: "given", label: "SEASONS", value: "since 1971" },
];
const OUTCOME = [{ key: "intensity", zone: "outcome", label: "REACHED", value: "Cat 4+" }];
const SCOPE = [{ key: "namedOnly", zone: "scope", label: "NAMED", value: "named only" }];

const dir = await mkdtemp(join(ROOT, ".strip-build-"));
const entry = join(dir, "entry.jsx");
await writeFile(entry, `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionStrip } from ${JSON.stringify(resolve(ROOT, "docs/storm-atlas/src/ui/condition-strip.jsx"))};
export function render(props) {
  return renderToStaticMarkup(React.createElement(ConditionStrip, props));
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
const page = await browser.newPage({ viewport: { width: 1440, height: 200 } });

/* The strip is rendered inside a `[data-atlas]` host because every rule in atlas.css is scoped
   to it -- rendering the markup without that ancestor would compute unstyled and pass nothing. */
const mount = async (html, extraCss = "") => {
  await page.setContent(`<!doctype html><html><head><style>${CSS}${extraCss}</style></head>
    <body style="margin:0"><div data-atlas class="atlas-shell">${html}</div></body></html>`);
};

const STATES = [
  { name: "no conditions at all", props: { conditions: [] } },
  { name: "genesis-side only", props: { conditions: GENESIS } },
  { name: "outcome-side only", props: { conditions: OUTCOME } },
  { name: "scope only", props: { conditions: SCOPE } },
  { name: "all three zones populated",
    props: { conditions: [...GENESIS, ...OUTCOME, ...SCOPE], lastEdit: { from: 964, to: 847 } } },
];

/* THE BOUNDARY, READ FROM COMPUTED STYLE. Text is deliberately not consulted. */
const READ_RULES = () => [...document.querySelectorAll("[data-zone]")].map((z) => {
  const s = getComputedStyle(z);
  return {
    zone: z.getAttribute("data-zone"),
    width: s.borderLeftStyle === "none" ? 0 : Math.round(parseFloat(s.borderLeftWidth) * 100) / 100,
    ink: s.borderLeftColor,
    empty: z.hasAttribute("data-zone-empty"),
    hint: !!z.querySelector("[data-zone-hint]"),
    items: z.querySelectorAll("[data-condition]").length,
  };
});

console.log("[strip] all three zones are present in every state, set or unset");
for (const st of STATES) {
  await mount(render(st.props));
  const rules = await page.evaluate(READ_RULES);
  ok(`${st.name}: three zones render`, rules.length === 3,
     `saw ${rules.length}: ${rules.map((r) => r.zone).join(", ")}`);
  ok(`${st.name}: the zones are genesis-side, outcome-side and scope, in that order`,
     JSON.stringify(rules.map((r) => r.zone)) === '["given","outcome","scope"]',
     JSON.stringify(rules.map((r) => r.zone)));
  const emptyOnes = rules.filter((r) => r.empty);
  ok(`${st.name}: every empty zone says what it would hold`,
     emptyOnes.every((r) => r.hint),
     `${emptyOnes.filter((r) => !r.hint).map((r) => r.zone).join(", ")} render no placeholder`);
}

console.log("\n[strip] and the boundary survives the prose being covered");
{
  await mount(render({ conditions: [...GENESIS, ...OUTCOME, ...SCOPE] }));
  const rules = await page.evaluate(READ_RULES);
  const sig = (r) => `${r.width}|${r.ink}`;
  const sigs = rules.map(sig);
  ok("each zone's rule is a distinct weight-and-ink signature",
     new Set(sigs).size === 3, rules.map((r) => `${r.zone}: ${sig(r)}`).join("  "));

  const given = rules.find((r) => r.zone === "given");
  const outcome = rules.find((r) => r.zone === "outcome");
  const scope = rules.find((r) => r.zone === "scope");
  ok("genesis-side and outcome-side carry the heavier 2px rule",
     given.width >= 2 && outcome.width >= 2, `given ${given.width}px, outcome ${outcome.width}px`);
  ok("and they are told apart by ink, not only by weight",
     given.ink !== outcome.ink, `both ${given.ink}`);
  ok("scope is the lighter hairline, so it does not read as a third kind of question",
     scope.width < given.width, `scope ${scope.width}px against ${given.width}px`);

  /* THE SHARPEST FORM OF THE TEST. With every text node removed the three zones must still be
     three visibly different things -- this is what a reader gets in the first fifth of a second,
     before any word has been read. */
  const blind = await page.evaluate(() => {
    for (const n of [...document.querySelectorAll("[data-zone] *")]) {
      if (n.childNodes.length && [...n.childNodes].every((c) => c.nodeType === 3)) n.textContent = "";
    }
    return [...document.querySelectorAll("[data-zone]")].map((z) => {
      const s = getComputedStyle(z);
      return `${z.getAttribute("data-zone")}:${s.borderLeftWidth}|${s.borderLeftColor}`;
    });
  });
  ok("with every word erased, the three zones remain three distinct shapes",
     new Set(blind.map((b) => b.split(":")[1])).size === 3, blind.join("  "));
}

console.log("\n[strip] an unset zone is a target, not a decoration");
{
  await mount(render({ conditions: OUTCOME, onEdit: () => {} }));
  const z = await page.evaluate(() => {
    const empty = document.querySelector("[data-zone-empty]");
    const filled = document.querySelector('[data-zone="outcome"]');
    const hint = empty && empty.querySelector("[data-zone-hint]");
    const cs = empty && getComputedStyle(empty);
    const hs = hint && getComputedStyle(hint);
    return {
      tag: empty ? empty.tagName : null,
      edits: empty ? empty.getAttribute("data-zone-edit") : null,
      /* THE WHOLE ZONE, not a heading inside it: the click target's area against the label's. */
      zoneArea: empty ? Math.round(empty.getBoundingClientRect().width
        * empty.getBoundingClientRect().height) : 0,
      labelArea: empty ? (() => { const l = empty.querySelector(".at-zone-label");
        const b = l.getBoundingClientRect(); return Math.round(b.width * b.height); })() : 0,
      tinted: cs ? cs.backgroundColor : null,
      filledTint: filled ? getComputedStyle(filled).backgroundColor : null,
      /* NO DASHED BOX. The hint used to draw its own dashed rectangle, which reads as a drop
         target and frames one idea twice inside a zone that already has a rule and a heading. */
      hintBorder: hs ? [hs.borderTopStyle, hs.borderRightStyle, hs.borderBottomStyle,
        hs.borderLeftStyle].join(",") : null,
      filledIsButton: filled ? filled.tagName === "BUTTON" : null,
    };
  });
  ok("an empty zone is a real button, so it answers Enter and takes focus", z.tag === "BUTTON", z.tag);
  ok("and the whole zone opens the editor, not just its heading",
     z.edits === "given" || z.edits === "scope", `data-zone-edit is ${z.edits}`);
  ok("the target is the zone's whole area", z.zoneArea > z.labelArea * 3,
     `${z.zoneArea}px² of zone against ${z.labelArea}px² of label`);
  ok("it carries a faint tint that a populated zone does not", z.tinted !== z.filledTint,
     `both ${z.tinted}`);
  ok("and its hint draws no dashed box", !/dashed/.test(z.hintBorder || ""), z.hintBorder);
  /* AND A POPULATED ZONE IS NOT A BUTTON. Its conditions carry their own × removals, and a click
     anywhere in it opening an editor would make removing one condition a coin flip. */
  ok("a populated zone is not itself a click target", z.filledIsButton === false);
}

console.log("\n[strip] RESET QUERY is present exactly when there is a query to reset");
{
  await mount(render({ conditions: [], onReset: () => {} }));
  ok("absent on an unqueried archive",
     !(await page.evaluate(() => !!document.querySelector("[data-reset-query]"))));
  await mount(render({ conditions: [...GENESIS, ...OUTCOME], onReset: () => {}, onClear: () => {} }));
  const r = await page.evaluate(() => {
    const b = document.querySelector("[data-reset-query]");
    if (!b) return null;
    const strip = document.querySelector("[data-condition-strip]");
    const zs = [...document.querySelectorAll("[data-zone]")];
    return {
      text: b.textContent.trim(),
      title: b.title || "",
      /* FAR RIGHT: past the right edge of every zone, and inside the strip. */
      right: Math.round(b.getBoundingClientRect().right),
      stripRight: Math.round(strip.getBoundingClientRect().right),
      pastZones: zs.every((z) => b.getBoundingClientRect().left >= z.getBoundingClientRect().right - 1),
      removals: document.querySelectorAll("[data-condition-clear]").length,
    };
  });
  ok("present the moment any condition is set", !!r);
  if (r) {
    ok("it says RESET QUERY", r.text === "RESET QUERY", r.text);
    ok("at the far right of the strip", r.pastZones && r.right <= r.stripRight + 1,
       `right ${r.right} against strip ${r.stripRight}`);
    /* THE THREE WAYS OUT ARE DISTINCT, AND THIS ONE SAYS WHICH IT IS. RESET QUERY clears the
       conditions; HOME and FIT move the camera. A control that did both would be the one a
       reader can never use deliberately. */
    ok("and it says what it does NOT touch", /camera/i.test(r.title), r.title);
    /* ONE PER CONDITION, WHICH IS THE POINT. RESET is the blunt instrument and these are the
       precise one: a reader dropping one of three conditions should not have to rebuild the
       other two. Counted against the fixture rather than pinned to a literal. */
    ok("the individual × removals survive alongside it, one per condition",
       r.removals === 3, `${r.removals} removals for 3 conditions`);
  }
}

console.log("\n[strip] the last edit is one number to one number, and nothing accumulates");
{
  await mount(render({ conditions: GENESIS, lastEdit: { from: 964, to: 847 } }));
  const t = await page.evaluate(() => {
    const e = document.querySelector("[data-last-edit]");
    return e ? e.textContent.replace(/\s+/g, " ").trim() : null;
  });
  ok("it reads as a population delta", /964\s*→\s*847/.test(t || ""), String(t));
  await mount(render({ conditions: GENESIS }));
  const none = await page.evaluate(() => !!document.querySelector("[data-last-edit]"));
  ok("and it is absent before the first edit rather than showing zeros", !none);
}

/* ── seeded regressions ──────────────────────────────────────────────────────────────────── */
if (process.argv.includes("--self-test")) {
  console.log("\n[strip] seeded regressions — each must be caught");

  const SEEDS = [
    {
      name: "the two sides given the same rule ink (the boundary erased)",
      css: '[data-atlas] .at-zone-muted{border-left-color:var(--accent)!important}',
      expect: (rules) => {
        const g = rules.find((r) => r.zone === "given"), o = rules.find((r) => r.zone === "outcome");
        return g.ink === o.ink;
      },
      rule: "and they are told apart by ink, not only by weight",
    },
    {
      name: "scope promoted to the same weight as a question zone",
      css: '[data-atlas] .at-zone-hair{border-left-width:2px!important}',
      expect: (rules) => {
        const g = rules.find((r) => r.zone === "given"), s = rules.find((r) => r.zone === "scope");
        return !(s.width < g.width);
      },
      rule: "scope is the lighter hairline",
    },
    {
      name: "every zone rule removed (three zones, no boundary at all)",
      css: '[data-atlas] .at-zone{border-left:0!important}',
      expect: (rules) => new Set(rules.map((r) => `${r.width}|${r.ink}`)).size < 3,
      rule: "each zone's rule is a distinct signature",
    },
  ];

  for (const seed of SEEDS) {
    await mount(render({ conditions: [...GENESIS, ...OUTCOME, ...SCOPE] }), seed.css);
    const rules = await page.evaluate(READ_RULES);
    ok(`${seed.name} → breaks "${seed.rule}"`, seed.expect(rules),
       "the seeded stylesheet did not actually break the property, so this regression is unchecked");
  }

  /* An empty zone that renders no placeholder — the failure that makes an unqueried strip
     unreadable. Seeded in the markup rather than the stylesheet, because it is a rendering
     decision and not a paint one. */
  {
    const html = render({ conditions: GENESIS }).replace(/<span class="at-zone-hint"[^>]*>[^<]*<\/span>/, "");
    await mount(html);
    const rules = await page.evaluate(READ_RULES);
    const emptyOnes = rules.filter((r) => r.empty);
    ok("an empty zone stripped of its placeholder is caught",
       emptyOnes.some((r) => !r.hint), "the check passed a zone that says nothing");
  }

  console.log("\n[strip] and it stays silent on a change that breaks nothing");
  {
    await mount(render({ conditions: [...GENESIS, ...OUTCOME, ...SCOPE] }),
      "[data-atlas] .at-strip{padding-left:24px}");
    const rules = await page.evaluate(READ_RULES);
    ok("a padding change is not a boundary failure",
       new Set(rules.map((r) => `${r.width}|${r.ink}`)).size === 3);
  }
}

await browser.close();
await rm(dir, { recursive: true, force: true });

console.log(failures === 0
  ? "\nthree zones, always, and the boundary is legible before a word is read"
  : `\n${failures} condition-strip check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
