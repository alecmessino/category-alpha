#!/usr/bin/env node
/* EVERY WORD ON EVERY SURFACE, IN BOTH SHELLS, AGAINST THE GROUND IT ACTUALLY LANDS ON.
 *
 * WHY THIS EXISTS, AND WHY THE TOKEN CHECK WAS NOT ENOUGH.
 *
 * check-atlas-adherence verifies the light shell's TOKEN TABLE: every ink it declares clears AA
 * on every paper ground, and every dark-shell token is re-declared or exempt by name. All of it
 * passed while the light shell shipped a storm name at 1.07:1 -- invisible -- because the
 * inspector's masthead did not use a token. It used `#f8fbff`, written when the only chrome was
 * near-black. A rule that enumerates tokens cannot see a literal, and a stylesheet with 19 of
 * them has 19 blind spots. The same hole ran the other way: the provenance drawer kept a
 * hard-coded `#151d29` ground while its text resolved the light shell's near-black inks.
 *
 * So this gate does not read the stylesheet at all. It opens the real surfaces, walks every
 * visible text node, and computes the contrast the browser actually resolved -- colour against
 * the first opaque background above it -- in the light shell and the dark one.
 *
 * SVG TEXT IS PAINTED WITH `fill`, NOT `color`, and reading `color` on a `<text>` reports the
 * inherited value while the glyphs use something else entirely. A first draft of this sweep
 * flagged the plate's graticule labels at 1.06:1 on a plate that renders them in legible grey.
 * That was the gate being wrong, not the surface, and it is the reason `paint()` exists.
 *
 * Run: node scripts/check-light-contrast.mjs [--require-browser]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(__dir, "../docs");

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
    ? "[contrast] playwright is absent and --require-browser was given"
    : "[contrast] SKIPPED, not passed: playwright is absent");
  process.exit(required ? 2 : 0);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml",
  ".gz": "application/octet-stream", ".geojson": "application/json" };
const server = await new Promise((r) => {
  const s = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const b = await readFile(join(DOCS, p));
      res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
      res.end(b);
    } catch { res.writeHead(404); res.end("nf"); }
  });
  s.listen(0, () => r(s));
});
const port = server.address().port;

const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "block" });
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();

const SWEEP = () => {
  const px = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || "");
    if (!m) return null;
    const p = m[1].split(",").map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const CR = (a, b) => {
    const la = L(a), lb = L(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  /* WHAT ACTUALLY PAINTS THE GLYPHS. SVG text takes `fill`; HTML text takes `color`. */
  const paint = (el, cs) => {
    if (el.ownerSVGElement || el.tagName.toLowerCase() === "svg") {
      const f = cs.fill;
      if (f && f !== "none") return px(f);
      return null;
    }
    return px(cs.color);
  };
  /* The first opaque background at or above the element. An SVG glyph over a <canvas> has no
     opaque ancestor of its own, so the plate's own background is what it lands on. */
  const ground = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      if (n.nodeType === 1) {
        const bg = px(getComputedStyle(n).backgroundColor);
        if (bg && bg.a === 1) return bg;
      }
      n = n.parentElement || n.parentNode;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = (n.nodeValue || "").trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) continue;
    const fg = paint(el, cs);
    if (!fg) continue;
    const size = parseFloat(cs.fontSize) || 16;
    const wt = parseInt(cs.fontWeight, 10) || 400;
    /* WCAG large text: 24px, or 18.66px bold. Everything else is body text at 4.5. */
    const need = (size >= 24 || (size >= 18.66 && wt >= 700)) ? 3.0 : 4.5;
    const cr = CR(fg, ground(el));
    if (cr >= need) continue;
    let a = el, cls = "";
    while (a && !cls) {
      cls = (typeof a.className === "string" ? a.className : "").trim();
      a = a.parentElement;
    }
    out.push({ text: t.slice(0, 30), cls: cls.split(/\s+/).slice(0, 2).join("."),
      color: cs.color, size, cr: Math.round(cr * 100) / 100, need });
  }
  const seen = new Map();
  for (const o of out) {
    const k = `${o.color}|${o.cls}|${o.size}`;
    if (!seen.has(k)) seen.set(k, o);
  }
  return [...seen.values()];
};

const boot = async (query) => {
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(1000);
};

await page.setViewportSize({ width: 1440, height: 900 });
await boot("");
const pick = await page.evaluate(() => {
  const a = globalThis.__ATLAS.archive;
  for (let i = 0; i < a.nStorms; i += 1) {
    const s = a.storm(i);
    if (s && s.name && s.max_category && s.landfalls && s.landfalls.length) return s.storm_id;
  }
  return null;
});

/* EVERY SURFACE A READER CAN OPEN, not just the one the shell swap was developed against. Four
   of the six failures this gate was written for were on surfaces nobody re-opened after the
   swap: the inspector, the builder sheet, the provenance drawer and the calibration ledger. */
const SURFACES = [
  ["the unqueried archive", "", null],
  ["a cohort that refuses", "s0=2022&b=NA&i=cat3", null],
  ["the inspector, with a storm", `storm=${pick}`, null],
  ["the builder sheet", "", async () => {
    await page.click("[data-zone-edit]"); await page.waitForTimeout(500);
  }],
  ["the provenance drawer", "", async () => {
    await page.keyboard.press("p"); await page.waitForTimeout(800);
  }],
  ["the calibration ledger", "", async () => {
    await page.click("[data-open-ledger]"); await page.waitForTimeout(2600);
  }],
];

for (const shell of ["light", "dark"]) {
  console.log(`\n[contrast] the ${shell} shell, every surface, every word`);
  for (const [name, query, after] of SURFACES) {
    await boot(query);
    await page.evaluate((s) => {
      if (s === "dark") localStorage.setItem("atlas.shell", "dark");
      else localStorage.removeItem("atlas.shell");
    }, shell);
    await boot(query);
    if (after) await after();
    const bad = await page.evaluate(SWEEP);
    ok(`${name.padEnd(28)}`, bad.length === 0,
       bad.map((o) => `${String(o.cr).padStart(5)}:1 (needs ${o.need})  ${o.size}px  `
         + `${o.color}  .${o.cls}  "${o.text}"`).join("\n"));
  }
}
await page.evaluate(() => localStorage.removeItem("atlas.shell"));

await browser.close();
server.close();
console.log(failures === 0
  ? "\nevery word on every surface clears AA against the ground it lands on, in both shells"
  : `\n${failures} surface(s) carry text below AA`);
process.exit(failures === 0 ? 0 : 1);
