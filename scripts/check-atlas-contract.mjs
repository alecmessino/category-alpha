#!/usr/bin/env node
/* THE VISUAL CONTRACT, MEASURED ON THE SURFACE THAT CLAIMS TO IMPLEMENT IT.
 *
 * WHAT THIS FILE IS. Six approved frames fixed the composition -- 1920 conditioned, 1440
 * conditioned, 1024 conditioned, 414 conditioned, 1920 resting, 1920 refusal-heavy -- and the
 * instruction that came with them was that the gates follow the frames rather than the other way
 * round. So this gate is not a taste rule written after the fact: every number in it is read off
 * a frame, and where a frame and the live surface disagree the frame is what fails the run.
 *
 * WHY IT IS ITS OWN FILE RATHER THAN SEVEN EDITS TO SEVEN GATES. The composition is a set of
 * TRADES -- the plate's share against the answer's, the band's height against the fold, the
 * pointer's brevity against the refusal's completeness -- and each of those trades is only
 * legible next to the others. Split across the gates that happen to own each element, a
 * regression reads as one unrelated failure in one file and the shape of what broke is invisible.
 * Here the whole contract fails together, in the order the reader meets it.
 *
 * WHAT IT DOES NOT DUPLICATE. check-plate-aperture owns the plate's aspect envelope and the
 * blank-plane rule; check-atlas-acceptance owns what is on screen at first paint; check-evidence-
 * deck owns what a refusal is allowed to say. This file asserts the six things the contract named
 * and nothing else:
 *
 *   1  the width bands, BOTH SIDES        1920: plate 60-62%, answer 38-40%
 *                                         1440: plate 57-59%, answer 41-43%
 *   2  one declared band                  the plate column and the answer end on one baseline
 *   3  eight findings above the fold       at 1440 and wider, without scrolling
 *   4  no nested evidence scroller         the page's own scroll reaches the matrix
 *   5  no second masthead                  the comparison is stamp-size copy on the answer
 *   6  the pointer carries one fact        a count and a direction, never the refusal prose
 *
 *   and, at 1024 and 414, the stack: sample plus at least two numerical findings clear the first
 *   screen, with zero horizontal overflow.
 *
 * Run: node scripts/check-atlas-contract.mjs [--self-test] [--require-browser]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const DOCS = resolve(ROOT, "docs");
const SELF_TEST = process.argv.includes("--self-test");

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return true; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + String(detail).replace(/\n/g, "\n        ") : ""));
  return false;
};
const note = (text) => console.log("  note  " + text);

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch { /* reported below */ }
if (!chromium) {
  const required = process.argv.includes("--require-browser");
  console.log(required
    ? "[contract] playwright is absent and --require-browser was given"
    : "[contract] SKIPPED, not passed: playwright is absent");
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
    } catch { res.writeHead(404); res.end("not found"); }
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
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const open = async (query, w, h) => {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`http://127.0.0.1:${port}/storm-atlas/?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
  await page.waitForTimeout(900);
};

/* THE THREE FRAMES THE CONTRACT WAS DRAWN ON. The conditioned cohort is the one the defects were
   reported against -- a genesis radius over the East Pacific -- and it is the state that carries
   a comparison, so it is the only one where rules 5 and 6 have anything to be wrong about. */
const CONDITIONED = "w=11.6,-105.4,500";

/* EVERYTHING THE CONTRACT MEASURES, READ IN ONE PASS. Read together rather than in six evaluate
   calls because the trades are between these numbers: a plate share is only meaningful beside the
   answer share that paid for it, and a baseline delta is only meaningful beside the band that
   declared it. */
const measure = () => page.evaluate(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const band = document.querySelector(".atlas-plate-row");
  const col = document.querySelector(".atlas-stage-col");
  const answer = document.querySelector("[data-answer-col]");
  const plate = document.querySelector(".at-plate");
  const ev = document.querySelector("[data-evidence-row]");
  const pointer = document.querySelector("[data-limits-pointer]");
  const cmp = document.querySelector("[data-comparison-note]");
  const sample = document.querySelector("[data-sample-state]");
  const fold = window.innerHeight;

  /* THE STACK IS READ FROM THE GRID, NOT FROM THE WIDTH. A media query is a number in a
     stylesheet; one track is the fact the rules branch on. */
  const stacked = !band || getComputedStyle(band).gridTemplateColumns.trim().split(/\s+/).length === 1;

  /* THE USABLE WIDTH IS THE BAND LESS ITS OWN PADDING, which is what the two columns actually
     divide between them. Measured against the viewport instead, every share would be understated
     by the page margin and the bands would have to be written around it. */
  const usable = band ? band.getBoundingClientRect().width
    - parseFloat(getComputedStyle(band).paddingLeft)
    - parseFloat(getComputedStyle(band).paddingRight) : 0;

  const findings = [...document.querySelectorAll("[data-finding]")].filter(vis);
  const numerical = findings.filter((f) => /\d/.test(
    (f.querySelector(".at-ans-rate")?.textContent || "")));

  /* A NESTED SCROLLER IS AN ANCESTOR OF THE MATRIX THAT SCROLLS ON ITS OWN ACCOUNT. Walked from
     the matrix upward rather than searched for by class, because the defect is structural: any
     element in that chain with its own overflow takes the matrix out of the page's scroll and
     puts it behind a second one the reader has to find. */
  const nested = [];
  for (let el = ev; el && el !== document.documentElement; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const scrolls = /(auto|scroll)/.test(cs.overflowY)
      && el.scrollHeight > el.clientHeight + 2;
    if (scrolls) nested.push(el.className || el.tagName);
  }

  /* THE MASTHEAD RULE IS ABOUT SIZE, NOT ABOUT WORDS. Deleting the phrase and setting the same
     block at 24px would satisfy a text search and break the contract, so every element carrying
     comparison language is measured; a second headline is anything that says it at heading size. */
  const bigCompare = [...document.querySelectorAll("*")].filter((el) => {
    if (!vis(el) || el.children.length) return false;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (parseFloat(getComputedStyle(el).fontSize) < 15) return false;
    /* A LABEL, NOT A SENTENCE. The synthesis is two or three lines of prose set at 16.5px and it
       is ALLOWED to say the word baseline -- "5 of 6 intensity thresholds run higher than the
       baseline" is the finding. What the contract forbids is a comparison HEADING: a short
       all-caps block announcing the comparison beside the answer, which is what the rejected
       frame carried and what gave the reader two mastheads to choose between. So the test is
       shape as well as size -- short, upper-case, and naming the comparison. */
    const label = t.length <= 40 && t === t.toUpperCase();
    return (label && /VS ARCHIVE|COMPARISON|BASELINE/.test(t)) || /VS ARCHIVE MEANS/i.test(t);
  }).map((el) => `${(el.textContent || "").trim().slice(0, 40)} @ ${getComputedStyle(el).fontSize}`);

  const foot = (el) => {
    if (!el) return null;
    const kids = [...el.children].filter((c) => c.getBoundingClientRect().height > 0);
    return kids.length ? kids[kids.length - 1].getBoundingClientRect().bottom
      : el.getBoundingClientRect().bottom;
  };

  return {
    stacked, usable,
    plateW: plate ? Math.round(plate.getBoundingClientRect().width) : 0,
    answerW: answer ? Math.round(answer.getBoundingClientRect().width) : 0,
    /* THE BASELINE IS THE GAP BETWEEN THE TWO COLUMNS' LAST OCCUPIED PIXELS, on either side.
       Comparing the boxes alone passes a column stretched by the grid with paper under its
       content, which is the beige the contract exists to remove. */
    baseline: (stacked || !answer || !col) ? 0
      : Math.round(Math.max(
        Math.abs(col.getBoundingClientRect().bottom - answer.getBoundingClientRect().bottom),
        col.getBoundingClientRect().bottom - foot(col),
        answer.getBoundingClientRect().bottom - foot(answer))),
    findings: findings.length,
    aboveFold: findings.filter((f) => f.getBoundingClientRect().bottom <= fold + 1).length,
    numericalAboveFold: numerical.filter((f) => f.getBoundingClientRect().bottom <= fold + 1).length,
    sampleAboveFold: !!(sample && vis(sample) && sample.getBoundingClientRect().bottom <= fold + 1),
    sampleState: sample ? (sample.textContent || "").trim() : null,
    nested,
    bigCompare,
    cmp: cmp ? { text: (cmp.textContent || "").replace(/\s+/g, " ").trim(),
      size: parseFloat(getComputedStyle(cmp).fontSize),
      inAnswer: !!cmp.closest("[data-answer]") } : null,
    pointer: pointer ? { text: (pointer.textContent || "").replace(/\s+/g, " ").trim(),
      size: parseFloat(getComputedStyle(pointer).fontSize) } : null,
    /* THE SENTENCES THE POINTER MUST NOT BE. Read from the page rather than typed here, so the
       rule cannot drift away from the prose it is about. */
    said: [...document.querySelectorAll(".at-say-text")]
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean),
    refusedRows: document.querySelectorAll("[data-outcome][data-refusal-state]").length,
    allRows: document.querySelectorAll("[data-outcome]").length,
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    plateAr: plate && plate.getBoundingClientRect().height
      ? +(plate.getBoundingClientRect().width / plate.getBoundingClientRect().height).toFixed(3)
      : null,
    /* THE WIDTH BETWEEN THE PLATE'S RIGHT EDGE AND THE FIGURE COLUMN'S, and whether anything is
       standing in it. Read against the COLUMN rather than the viewport, because a centred figure
       block has page margin either side of it which is not the same thing as a hole inside the
       block. */
    sideGap: (() => {
      const col = document.querySelector(".atlas-stage-col");
      if (!col || !plate) return 0;
      return Math.round(col.getBoundingClientRect().right - plate.getBoundingClientRect().right);
    })(),
    sideOccupied: (() => {
      const col = document.querySelector(".atlas-stage-col");
      if (!col || !plate) return true;
      const pr = plate.getBoundingClientRect().right;
      return [...col.querySelectorAll(".at-platefoot, .at-plate-figure, .at-plate-caption")]
        .some((el) => el.getBoundingClientRect().left >= pr - 1);
    })(),
  };
});

/* ── 1 & 2: the split, and the one band it sits in ───────────────────────────────────────── */
console.log("[contract] the two columns hold the frames' split, and end on one baseline");
const DESKTOP = [
  /* w,    h,    plate lo/hi,  answer lo/hi -- read off the approved frames */
  [1920, 1080, 0.60, 0.62, 0.38, 0.40],
  [1440,  900, 0.57, 0.59, 0.41, 0.43],
];
for (const [w, h, plo, phi, alo, ahi] of DESKTOP) {
  await open(CONDITIONED, w, h);
  const m = await measure();
  const ps = m.plateW / m.usable, as = m.answerW / m.usable;
  const tag = String(w + "x" + h).padEnd(10);
  ok(`${tag} the plate is ${(100 * ps).toFixed(1)}% of the band`, ps >= plo && ps <= phi,
     `${m.plateW}px of ${Math.round(m.usable)}px — the frame says ${100 * plo}–${100 * phi}%`);
  ok(`${tag} the answer is ${(100 * as).toFixed(1)}% of the band`, as >= alo && as <= ahi,
     `${m.answerW}px of ${Math.round(m.usable)}px — the frame says ${100 * alo}–${100 * ahi}%`);
  /* ONE DECLARED BAND, WHICH IS THE DEFECT THAT OPENED THIS WHOLE REVIEW: the plate died into
     beige while the column beside it kept going. Two pixels of tolerance for subpixel layout,
     and nothing else -- a shared baseline is either constructed or it is a coincidence. */
  ok(`${tag} the plate column and the answer end on one baseline`, m.baseline <= 2,
     `${m.baseline}px of paper under one of the two columns`);
}

/* ── 3: eight findings, above the fold, at 1440 and wider ────────────────────────────────── */
console.log("\n[contract] the whole answer is on the first screen at 1440 and wider");
for (const [w, h] of [[1920, 1080], [1440, 900], [1600, 900], [1440, 800]]) {
  await open(CONDITIONED, w, h);
  const m = await measure();
  const tag = String(w + "x" + h).padEnd(10);
  ok(`${tag} eight findings render`, m.findings === 8, `${m.findings} rows carry data-finding`);
  ok(`${tag} and all eight clear the fold`, m.aboveFold === 8,
     `${m.aboveFold} of ${m.findings} are above ${h}px`);
  ok(`${tag} with the effective sample above them`, m.sampleAboveFold);
}

/* ── 4: the matrix is in the page ────────────────────────────────────────────────────────── */
console.log("\n[contract] the matrix is reached by the page's own scroll, at every width");
for (const [w, h] of [[1920, 1080], [1440, 900], [1180, 800], [1024, 768], [414, 896]]) {
  await open(CONDITIONED, w, h);
  const m = await measure();
  ok(`${String(w + "x" + h).padEnd(10)} nothing between the matrix and the document scrolls`,
     m.nested.length === 0, JSON.stringify(m.nested));
}

/* ── 5 & 6: the comparison is a stamp, and the pointer carries one fact ──────────────────── */
console.log("\n[contract] the comparison is an annotation and the pointer is one line");
for (const [name, query, sufficient] of [
  ["conditioned", CONDITIONED, true],
  ["resting", "", true],
  /* THE REFUSAL-HEAVY FRAME IS `e=AS`: four storms, below the archive's gate of ten, every one of
     eighteen contracts refusing. Not a merely small cohort -- a cohort that publishes no rate at
     all, which is the state the contract wrote its own rules for. */
  ["refusal-heavy", "e=AS", false],
]) {
  await open(query, 1920, 1080);
  const m = await measure();
  const tag = name.padEnd(14);
  /* NO SECOND MASTHEAD. The frame that was rejected carried `VS ARCHIVE MEANS` at headline size
     beside the answer, so a reader met two headings and had to decide which was the finding. */
  ok(`${tag} no comparison language is set at heading size`, m.bigCompare.length === 0,
     JSON.stringify(m.bigCompare));
  if (sufficient) {
    ok(`${tag} the comparison is stamp-size copy attached to the answer`,
       !!m.cmp && m.cmp.inAnswer && m.cmp.size <= 12,
       m.cmp ? `${m.cmp.size}px, inAnswer=${m.cmp.inAnswer}` : "no comparison note rendered");
  } else {
    /* AND BELOW THE GATE THERE IS NO COMPARISON TO MAKE. With no rate published, a stamp naming a
       baseline offers a reading the answer cannot support; the frame omits it and keeps
       BELOW SAMPLE as the whole finding. */
    ok(`${tag} publishes no comparison, because no rate exists to compare`, m.cmp === null,
       m.cmp ? `"${m.cmp.text}"` : "");
    ok(`${tag} and says BELOW SAMPLE instead`, m.sampleState === "BELOW SAMPLE", m.sampleState || "");
  }

  /* ONE FACT ON THE POINTER. The nit that closed the contract: the line carried the refusal count
     AND an archive-gap caveat, which are two governing ideas, and the caveat moved into Limits &
     exclusions. So the pointer is held to a count, a direction, and nothing that is a sentence
     from below it. */
  ok(`${tag} the pointer names the refusals and where they are explained`,
     !!m.pointer && /\bREFUSED\b/.test(m.pointer.text) && /BELOW/.test(m.pointer.text),
     m.pointer ? `"${m.pointer.text}"` : "no pointer rendered");
  ok(`${tag} and its counts are the matrix's own`,
     !!m.pointer && m.pointer.text.includes(`${m.refusedRows} OF ${m.allRows}`),
     m.pointer ? `"${m.pointer.text}" against ${m.refusedRows} refused of ${m.allRows}` : "");
  ok(`${tag} and it is not the refusal prose`,
     !!m.pointer && m.pointer.text.length <= 80
     && !m.said.some((s) => m.pointer.text.includes(s.slice(0, 40))),
     m.pointer ? `${m.pointer.text.length} characters` : "");
}

/* ── the stack ───────────────────────────────────────────────────────────────────────────── */
console.log("\n[contract] stacked, the plate does not take the first screen");
for (const [w, h] of [[1024, 768], [414, 896]]) {
  await open(CONDITIONED, w, h);
  const m = await measure();
  const tag = String(w + "x" + h).padEnd(10);
  ok(`${tag} the composition stacks`, m.stacked);
  ok(`${tag} the effective sample clears the fold`, m.sampleAboveFold);
  /* TWO NUMERICAL FINDINGS, NOT TWO ROWS. A refused row above the fold carries a count and no
     rate, and a first screen of plate plus two refusals is the state the contract capped the
     stacked plate to prevent. */
  ok(`${tag} and at least two numerical findings clear it with the sample`,
     m.numericalAboveFold >= 2, `${m.numericalAboveFold} numerical of ${m.aboveFold} above the fold`);
  ok(`${tag} with no horizontal overflow`, m.overflow === 0, `${m.overflow}px`);
  /* AND THE PLATE IS A PLATE RATHER THAN A STRIP. 3.2 is where a single East Pacific track stops
     being the subject of its own plate -- a ceiling, not a landing. A frame that sits on it is a
     frame whose composition has run out of ideas, which is what a 639x199.7 plate beside a
     333x220 rectangle of paper was. */
  ok(`${tag} the plate reads as geography, not a strip`, m.plateAr <= 3.2,
     `aspect ${m.plateAr}`);
  /* AND THE PAPER BESIDE IT IS CHROME, NOT A VOID. Where the fold and the aspect ceiling forbid
     a full-bleed plate, the width left over carries the class key, the scale, Figure 1 and PLATE
     NOTES -- the figure's own caption apparatus, set to the plate's right edge instead of its
     bottom one. What is asserted is that the leftover is OCCUPIED: an empty rectangle wider than
     a third of the block beside the map is the defect this frame was rejected for. */
  ok(`${tag} and the width beside it carries the figure's chrome`,
     m.sideGap <= 8 || m.sideOccupied,
     `${m.sideGap}px beside the plate, occupied=${m.sideOccupied}`);
}

/* ── the seed ────────────────────────────────────────────────────────────────────────────────
 *
 * EVERY RULE ABOVE IS A MEASUREMENT, AND A MEASUREMENT THAT HAS NEVER BEEN SEEN TO FAIL IS NOT
 * EVIDENCE. Each seed is one of the six defects the frames were drawn against, injected at
 * runtime; the run fails if the rule written for it does not fire. */
if (SELF_TEST) {
  console.log("\n[contract] seeded regressions — each rule must catch its own defect");
  const seeds = [
    { name: "the answer widened until the plate falls out of its band",
      css: "[data-atlas].atlas-shell.atlas-instrument{--at-answer:900px}",
      broke: (m) => m.plateW / m.usable < 0.60 || m.answerW / m.usable > 0.40 },
    { name: "a column stopping short of the other — the beige comes back",
      css: "[data-atlas].atlas-instrument .atlas-answer > .at-answer{flex:0 0 auto}"
        + "[data-atlas].atlas-instrument .atlas-answer{display:flex;flex-direction:column}",
      broke: (m) => m.baseline > 2 },
    { name: "the matrix put back behind a scroller of its own",
      css: "[data-atlas].atlas-instrument .atlas-evidence{max-height:200px;overflow-y:auto}",
      broke: (m) => m.nested.length > 0 },
    { name: "the comparison promoted back to a masthead",
      css: "[data-atlas].atlas-instrument .at-ans-cmp{font-size:24px}",
      broke: (m) => m.bigCompare.length > 0 || !(m.cmp && m.cmp.size <= 12) },
  ];
  /* THE STACKED FRAME'S TWO SEEDS RUN AT 1024, because that is the viewport whose composition
     they are about: the plate put back on the aspect ceiling, and the width beside it emptied. */
  for (const seed of [
    { name: "the stacked plate back on the 3.2 ceiling",
      css: `@media (max-width:1180px){[data-atlas].atlas-instrument .atlas-stage{
              height:calc((100vw - 2 * var(--at-pad) - var(--at-fig-side)
                - var(--at-fig-sidegap)) / 3.9)!important}}`,
      broke: (m) => m.plateAr > 3.2 },
    { name: "the figure's chrome put back under the map, leaving the width beside it empty",
      css: `@media (max-width:1180px){[data-atlas].atlas-instrument .at-plate-chrome{
              grid-column:1!important;grid-row:3!important}}`,
      broke: (m) => m.sideGap > 8 && !m.sideOccupied },
  ]) {
    await open(CONDITIONED, 1024, 768);
    await page.addStyleTag({ content: seed.css });
    await page.waitForTimeout(500);
    const m = await measure();
    ok(seed.name, seed.broke(m),
       `aspect ${m.plateAr}, ${m.sideGap}px beside the plate, occupied=${m.sideOccupied} — `
       + "the rule written for this defect did not fire");
  }
  for (const seed of seeds) {
    await open(CONDITIONED, 1920, 1080);
    await page.addStyleTag({ content: seed.css });
    await page.waitForTimeout(500);
    const m = await measure();
    ok(seed.name, seed.broke(m),
       "the rule written for this defect did not fire — it is no longer measuring anything");
  }
  /* THE POINTER'S SEED IS TEXT, NOT STYLE: the defect was a line carrying a second governing
     idea, and no stylesheet can express that. */
  await open(CONDITIONED, 1920, 1080);
  const said = await page.evaluate(() => {
    const p = document.querySelector("[data-limits-pointer]");
    const s = document.querySelector(".at-say-text");
    if (!p || !s) return null;
    p.textContent = (s.textContent || "").trim();
    return { text: p.textContent.replace(/\s+/g, " ").trim() };
  });
  const m = await measure();
  ok("the pointer carrying the refusal prose instead of pointing at it",
     !!said && !!m.pointer && (m.pointer.text.length > 80
       || m.said.some((s) => m.pointer.text.includes(s.slice(0, 40)))),
     "the rule written for this defect did not fire — it is no longer measuring anything");
}

await browser.close();
server.close();

if (errors.length) { failures += errors.length; console.log("\n  page errors:\n  " + errors.join("\n  ")); }
else note("no page errors in any frame");

console.log(failures === 0
  ? "\nthe surface holds the six frames: the split, the band, the eight, the page, the stamp, the pointer"
  : `\n[contract] ${failures} failure(s) — the surface and the approved frames disagree`);
process.exit(failures === 0 ? 0 : 1);
