#!/usr/bin/env node
/* THE BRIDGE IS PINNED, AND IS PROVEN PINNED BY BEING SCROLLED AT.
 *
 * WHAT THE BRIDGE IS. It is the one control that takes a reader from the storm they selected to
 * the population it belongs to -- Storm to Cohort, the question this surface exists to answer.
 *
 * WHERE IT USED TO SIT. At the bottom of a single scrolling column, beneath seven sections of
 * track geometry, landfalls, environment and data quality. On a docked 380px inspector that is
 * about two screens down. A reader who does not scroll never learns it exists, and "present,
 * below the fold" is indistinguishable from "absent" for everyone who does not go looking.
 *
 * WHY THIS IS A GATE AND NOT A REVIEW NOTE. The pinning rests on the middle block being a scroll
 * container: that is what lets it shrink below its content, and if it stops being one the column
 * grows past the dock and pushes the pinned foot off the bottom. None of that is visible in a
 * short-content screenshot -- it appears only once a storm has enough landfalls to overflow --
 * and it is easy to break while tidying, because the declaration that matters does not look like
 * a layout guarantee.
 *
 * It is also easy to get WRONG IN THE OTHER DIRECTION, which is the more interesting half. The
 * obvious culprit is `min-height:0`, and seeding its removal here changes nothing at all: a flex
 * item that scrolls already has an automatic minimum of zero. The first version of this file
 * asserted the wrong mechanism and reported it as an uncaught regression, which is how the
 * comment in atlas.css came to name the right one.
 *
 * So the test does the thing a reader does. It builds an inspector with more content than fits,
 * in a dock the height of a real plate row, scrolls the body to its full extent, and requires
 * the bridge to still be inside the viewport -- at the top of the scroll, at the bottom, and
 * after the body has grown.
 *
 * Run: node scripts/check-inspector-bridge.mjs [--self-test] [--require-browser]
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
    ? "[bridge] playwright is absent and --require-browser was given"
    : "[bridge] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

const CSS = await readFile(resolve(ROOT, "docs/storm-atlas/atlas.css"), "utf8");

/* The inspector's real class structure, filled with more content than fits. The blocks are
   deliberately generic -- this asserts the LAYOUT CONTRACT, not the storm panel's wording, and
   tying it to that wording would make it fail on every copy edit. */
const body = (n) => Array.from({ length: n },
  (_, i) => `<div style="height:64px">whole-life block ${i + 1}</div>`).join("");

const markup = (blocks) => `
<div data-atlas class="atlas-shell" style="height:452px;width:380px;display:block">
  <div class="at-inspector" data-inspector>
    <div class="at-insp-head" style="height:74px">masthead</div>
    <div class="at-insp-body"><div class="at-pad">${body(blocks)}</div></div>
    <div class="at-insp-bridge" data-bridge-pinned>
      <div style="height:88px">THIS STORM IN THE ARCHIVE — build cohort around this genesis</div>
    </div>
  </div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 520, height: 452 } });

const mount = async (blocks, extraCss = "") => {
  await page.setContent(`<!doctype html><html><head><style>${CSS}${extraCss}</style></head>
    <body style="margin:0">${markup(blocks)}</body></html>`);
};

/* Is the bridge inside the dock, and is the dock inside the viewport? Both, because a bridge
   that sits inside an inspector which itself overflows the plate row is off screen either way. */
const measure = () => page.evaluate(() => {
  const dock = document.querySelector("[data-inspector]");
  const bridge = document.querySelector("[data-bridge-pinned]");
  const bodyEl = document.querySelector(".at-insp-body");
  const d = dock.getBoundingClientRect();
  const b = bridge.getBoundingClientRect();
  return {
    dockBottom: Math.round(d.bottom), dockHeight: Math.round(d.height),
    bridgeTop: Math.round(b.top), bridgeBottom: Math.round(b.bottom),
    bridgeHeight: Math.round(b.height),
    viewport: window.innerHeight,
    scrollTop: Math.round(bodyEl.scrollTop),
    scrollMax: Math.round(bodyEl.scrollHeight - bodyEl.clientHeight),
    /* the whole bridge, inside the dock, inside the viewport */
    onScreen: b.height > 0 && b.bottom <= window.innerHeight + 1 && b.top >= 0
      && b.bottom <= d.bottom + 1,
  };
});

const scrollToEnd = () => page.evaluate(() => {
  const b = document.querySelector(".at-insp-body");
  b.scrollTop = b.scrollHeight;
});

console.log("[bridge] the bridge is on screen at every scroll position, at three content sizes");
for (const blocks of [2, 12, 40]) {
  await mount(blocks);
  const top = await measure();
  ok(`${blocks} blocks · visible before any scrolling`, top.onScreen,
     `bridge ${top.bridgeTop}-${top.bridgeBottom}, dock ends ${top.dockBottom}, viewport ${top.viewport}`);
  await scrollToEnd();
  const end = await measure();
  ok(`${blocks} blocks · still visible with the body scrolled to its end`, end.onScreen,
     `bridge ${end.bridgeTop}-${end.bridgeBottom}, dock ends ${end.dockBottom}, viewport ${end.viewport}`);
  if (blocks > 2) {
    ok(`${blocks} blocks · and the body really did scroll, so the test is not vacuous`,
       end.scrollMax > 0 && end.scrollTop > 0,
       `scrollTop ${end.scrollTop} of a maximum ${end.scrollMax} — nothing overflowed, so nothing was tested`);
  }
  ok(`${blocks} blocks · the bridge keeps its full height rather than being crushed`,
     top.bridgeHeight >= 40, `${top.bridgeHeight}px`);
}

/* THE PROPERTY RESTATED THE WAY A READER WOULD PUT IT: the bridge must not be reachable ONLY by
   scrolling. Asserted at the worst case -- the most content, the smallest dock. */
console.log("\n[bridge] and it is never reachable only by scrolling");
{
  await mount(40);
  const before = await measure();
  ok("with 40 blocks of body, the bridge is already on screen at scrollTop 0",
     before.onScreen && before.scrollTop === 0,
     `onScreen ${before.onScreen}, scrollTop ${before.scrollTop}`);
}

/* ── seeded regressions ──────────────────────────────────────────────────────────────────── */
if (process.argv.includes("--self-test")) {
  console.log("\n[bridge] seeded regressions — each must push the bridge off screen and be caught");

  /* EACH SEED NAMES THE PROPERTY IT BREAKS, because "the bridge went off screen" is not the only
     way this can fail -- a bridge crushed to a sliver is still technically on screen and is still
     unusable. A seed that does not actually reproduce its failure is reported as such rather than
     counted as a pass: the first version of this file seeded `min-height:auto` and learned that
     it changes nothing, since a flex item that is a scroll container already has an automatic
     minimum of zero. That was a wrong belief about the layout, not a missing rule, and it is the
     reason the mechanism is now described correctly in atlas.css. */
  const SEEDS = [
    { name: "the body stops being a scroll container, so the column grows past the dock",
      css: "[data-atlas] .at-insp-body{overflow-y:visible!important;min-height:auto!important}",
      breaks: "the bridge is inside the dock and the viewport",
      expect: (m) => !m.onScreen },
    { name: "the bridge allowed to flex away instead of holding its size",
      css: "[data-atlas] .at-insp-bridge{flex:1 1 auto!important;min-height:0!important;height:0!important}",
      breaks: "the bridge keeps a usable height",
      expect: (m) => m.bridgeHeight < 40 },
    { name: "the inspector losing its column height",
      css: "[data-atlas] .at-inspector{height:auto!important}",
      breaks: "the bridge is inside the dock and the viewport",
      expect: (m) => !m.onScreen },
    { name: "the whole inspector scrolling instead of its body",
      css: "[data-atlas] .at-inspector{height:auto!important;overflow-y:auto!important}"
        + "[data-atlas] .at-insp-body{overflow-y:visible!important}",
      breaks: "the bridge is inside the dock and the viewport",
      expect: (m) => !m.onScreen },
  ];

  for (const seed of SEEDS) {
    await mount(40, seed.css);
    const m = await measure();
    ok(`${seed.name} → breaks "${seed.breaks}"`, seed.expect(m),
       `the property held anyway (bridge ${m.bridgeTop}-${m.bridgeBottom}, ${m.bridgeHeight}px tall, `
       + `dock ends ${m.dockBottom}), so this seed does not reproduce the failure and the rule is unchecked`);
  }

  console.log("\n[bridge] and a harmless change does not trip it");
  {
    await mount(40, "[data-atlas] .at-insp-bridge{padding-top:12px}");
    const m = await measure();
    ok("extra padding on the bridge is not a regression", m.onScreen,
       `bridge ${m.bridgeTop}-${m.bridgeBottom}, dock ends ${m.dockBottom}`);
  }
}

await browser.close();
console.log(failures === 0
  ? "\nthe bridge is pinned: on screen at every scroll position, at every content size"
  : `\n${failures} bridge check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
