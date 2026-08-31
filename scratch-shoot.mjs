import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const dir = process.argv[2] || "/home/user/category-alpha/docs/collateral";
const only = process.argv[3];
const outdir = process.argv[4] || "/tmp/claude-0/-home-user-category-alpha/42bfa050-f070-5207-8003-55bce487af88/scratchpad/shots";
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
for (const f of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
  if (only && !f.startsWith(only)) continue;
  await page.goto("file://" + dir + "/" + f, { waitUntil: "networkidle" });
  const sheets = await page.$$(".sheet");
  for (let i = 0; i < sheets.length; i++) {
    await sheets[i].screenshot({ path: `${outdir}/${f.replace(".html","")}-p${i+1}.png` });
  }
  const h = await page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => s.scrollHeight));
  console.log(f, "sheets:", sheets.length, "heights:", h.join(","));
}
if (errs.length) console.log("ERRORS:\n" + errs.slice(0, 20).join("\n"));
await browser.close();
