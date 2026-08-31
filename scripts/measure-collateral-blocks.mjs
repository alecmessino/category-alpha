#!/usr/bin/env node
/* A cutting instrument, not a gate. Prints the rendered height of every top-level block on
 * every sheet, so content is cut where it actually costs page, rather than by guesswork. */
import { join } from "node:path";
import { ROOT } from "./lib/atlas-verify.mjs";
const DIR = join(ROOT, "docs/collateral");
const { chromium } = await import("playwright-core");
const EXE = process.env.MT_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });
const files = process.argv.slice(2);
for (const f of files) {
  await page.goto(`file://${DIR}/${f}`, { waitUntil: "networkidle" });
  const out = await page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => {
    const budget = s.clientHeight;
    const h = s.style.height, o = s.style.overflow;
    s.style.height = "auto"; s.style.overflow = "visible";
    const content = s.clientHeight;
    const desc = (c, d) => {
      const lab = (c.querySelector("h2,h3,caption,.mh-title,.k") || c);
      return {
        d, cls: c.className || c.tagName.toLowerCase(),
        h: Math.round(c.getBoundingClientRect().height),
        label: (lab.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60),
      };
    };
    const blocks = [];
    for (const c of s.children) {
      blocks.push(desc(c, 0));
      if (c.classList.contains("sec") || c.classList.contains("platerow")
        || c.classList.contains("platecol")) {
        for (const g of c.children) {
          blocks.push(desc(g, 1));
          if (g.children.length && g.getBoundingClientRect().height > 120) {
            for (const k of g.children) blocks.push(desc(k, 2));
          }
        }
      }
    }
    s.style.height = h; s.style.overflow = o;
    return { budget, content, over: content - budget, blocks };
  }));
  console.log(`\n=== ${f}`);
  out.forEach((sh, i) => {
    console.log(`  sheet ${i + 1}: ${sh.content}px content / ${sh.budget}px budget  (over ${sh.over})`);
    for (const b of sh.blocks) console.log(`     ${String(b.h).padStart(5)}px ${"  ".repeat(b.d)}${b.cls.slice(0,26).padEnd(27 - 2 * b.d)} ${b.label.slice(0, 60 - 2 * b.d)}`);
  });
}
await browser.close();
