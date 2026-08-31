import { chromium } from "playwright-core";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const file = process.argv[2];
const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });
await page.goto("file://" + file, { waitUntil: "networkidle" });
const out = await page.evaluate(() => {
  const sheets = [...document.querySelectorAll(".sheet")];
  return sheets.map((s, i) => {
    const kids = [...s.children].map((k) => ({
      tag: k.tagName.toLowerCase() + (k.className ? "." + String(k.className).split(" ")[0] : ""),
      label: (k.querySelector("h1,h2,h3") || {}).textContent?.trim().slice(0, 42) || "",
      h: Math.round(k.getBoundingClientRect().height),
    }));
    return { sheet: i + 1, total: s.scrollHeight, budget: Math.round(s.clientHeight), kids };
  });
});
for (const s of out) {
  console.log(`SHEET ${s.sheet}: content ${s.total}px / budget ${s.budget}px  ${s.total > s.budget ? "OVER by " + (s.total - s.budget) : "fits"}`);
  for (const k of s.kids) console.log(`   ${String(k.h).padStart(5)}  ${k.tag.padEnd(22)} ${k.label}`);
}
await browser.close();
