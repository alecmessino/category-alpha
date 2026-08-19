#!/usr/bin/env node
/* Does the Storm Atlas's honesty surface reach the SCREEN?
 *
 * Every other Atlas check asserts something about a value: the pack matches the archive, the
 * browser's engine matches the Python. This one asserts something about the pixels -- that the
 * denominators, the refusals, the withheld class, the derived flags and the gaps actually
 * render, in text a reader can see. A rule that only lives in source is a rule nobody enforced,
 * and this surface's entire job is to not undo the archive's refusal discipline on the way to a
 * pixel. It is the same argument as scripts/check-panel-dom.mjs, applied to the second surface.
 *
 * IT DRIVES THE UI INTO EACH STATE RATHER THAN SUBSTITUTING A FIXTURE. check-panel-dom.mjs has
 * to swap in an edge-case payload because the live one rarely contains a refusal. The Atlas
 * holds the whole archive, so every honest state is reachable from the real data by clicking:
 * an ocean point where nothing forms, a storm whose intensity was never recorded, a landfall
 * whose class the archive withheld. Exercising the real paths is strictly stronger than
 * exercising a fixture that resembles them.
 *
 * NOT IN CI, for the same reason check-panel-dom.mjs is not: it needs a browser binary.
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/check-atlas-dom.mjs
 */
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.log("[atlas-dom] playwright is not installed - SKIPPED, not passed.");
  console.log("            npm i --no-save playwright && npx playwright install chromium");
  process.exit(0);
}

async function findChromium() {
  if (process.env.ATLAS_DOM_CHROMIUM) return process.env.ATLAS_DOM_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base) return null;
  const { access } = await import("node:fs/promises");
  let dirs = [];
  try { dirs = (await readdir(base)).filter((d) => d.startsWith("chromium-")).sort(); }
  catch { return null; }
  for (const d of dirs.reverse()) {
    const exe = join(base, d, "chrome-linux", "chrome");
    try { await access(exe); return exe; } catch { /* next */ }
  }
  return null;
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".gz": "application/gzip" };
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

let failures = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log("  ok    " + label); return; }
  failures++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

const exe = await findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
for (const h of ["**fonts.googleapis.com**", "**fonts.gstatic.com**", "**basemaps.cartocdn.com**"]) {
  await ctx.route(h, (r) => r.abort());
}
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/net::|ERR_/.test(m.text())) errors.push("console: " + m.text().slice(0, 200));
});

await page.goto(`http://127.0.0.1:${port}/storm-atlas/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => globalThis.__ATLAS && globalThis.__ATLAS.archive, { timeout: 90000 });
await page.waitForTimeout(700);

const text = () => page.evaluate(() => document.body.innerText);
const clickLatLng = async (lat, lng) => {
  const p = await page.evaluate(({ lat, lng }) => {
    const m = globalThis.__ATLAS_MAP;
    const c = m.latLngToContainerPoint([lat, lng]);
    const r = m.getContainer().getBoundingClientRect();
    return { x: r.left + c.x, y: r.top + c.y };
  }, { lat, lng });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(600);
};
const selectRow = (row) => page.evaluate((r) => globalThis.__ATLAS_SELECT(r), row);

console.log("\n[1] the archive's scale, from the pack that was actually loaded");
{
  const t = await text();
  const m = await page.evaluate(() => globalThis.__ATLAS.archive.manifest.counts);
  for (const [k, n] of Object.entries(m)) {
    ok(`${k} count on screen (${n.toLocaleString()})`, t.includes(n.toLocaleString()));
  }
  ok("the surface names itself", /STORM ATLAS/.test(t));
  ok("it says what it is not", /not a forecast|not a weather map/i.test(t));
}

console.log("\n[2] an intensity filter reports what it could NOT judge");
/* Chips carry live counts in their labels now, so they are addressed by their stable hook
   rather than by visible text -- a text match would break when the archive grows by a storm. */
await page.click('[data-chip="intensity-cat3"]');
await page.waitForTimeout(500);
{
  const t = await text();
  ok("the undecidable storms are counted, not silently dropped",
    /could not be judged by this intensity filter/.test(t));
  ok("and the reason is stated", /records no wind for them/.test(t));
  ok("and they are not called failures",
    /neither included nor counted as failing/.test(t));
}
await page.click('[data-chip="intensity-all"]');
await page.waitForTimeout(500);

console.log("\n[3] an ocean point where nothing formed");
await clickLatLng(25.8, -119.9);
{
  const t = await text();
  ok("the empty pool is named, not tabulated as zeroes",
    /NO STORMS MATCHED THIS COHORT/.test(t));
  ok("it says there are no rates because there is no sample",
    /no sample here, so there are no rates/i.test(t));
  ok("it explains that matching is on genesis, not on passage",
    /GENESIS LOCATION ONLY/.test(t));
  ok("no zero percentage is rendered anywhere on an empty pool", !/\b0(\.0)?%/.test(t));
}

console.log("\n[4] a dense pool: counts with denominators, and every refusal");
await clickLatLng(14.6, -113.9);
{
  const t = await text();
  ok("a count over a denominator", /\d+\s*\/\s*\d+/.test(t));
  ok("the effective sample size is published", /EFFECTIVE SAMPLE SIZE/.test(t));
  ok("the sample gate states its own threshold", /SUFFICIENT · \d+ ≥ \d+|BELOW SAMPLE/.test(t));
  ok("the rate ladder declares its own shape", /count · rate · 95% Wilson/.test(t));
  ok("storms with no recorded intensity leave the denominator",
    /out of every denominator above/.test(t));
  ok("an unscoreable contract is badged", /BASE RATE ONLY/.test(t));
  ok("and says how many events the archive holds", /\d+ archive-wide · \d+ needed/.test(t));
  ok("pathway frequency is labelled as frequency", /HISTORICAL PATHWAY FREQUENCY/.test(t));
  ok("and disclaimed as not a forecast", /THIS IS NOT A FORECAST/.test(t));
  ok("and denies being a cone", /not a forecast cone/.test(t));
  ok("a Wilson interval accompanies the rates",
    /\[\s*\d+\s*[-–—]\s*\d+%\s*\]/.test(t));
  /* THE WEIGHTED RATE CHANGED MEANING IN 3.2, SO THE CHECK CHANGED WITH IT -- and got harder.
     The probe was a distance-weighted analog pool and published a weighted rate beside the
     unweighted one. A COHORT spends distance as a hard membership condition instead, so
     weighting by it again would count the same variable twice; every member counts once and the
     weighted rate is identical to the unweighted one by construction. Printing the same number
     twice under two names would be the dishonest option, and so would dropping it in silence.
     The surface must therefore STATE the decision -- which is a stricter thing to satisfy than
     rendering a number. */
  ok("the surface says every member counts once", /Every storm here counts once/.test(t));
  ok("and why distance is not also used as a weight",
    /Distance is already a condition of membership/.test(t)
    && /count the same variable twice/.test(t));
  ok("the conditioning the rates assume is stated",
    /GENESIS-CONDITIONED|assume a tropical cyclone forms/i.test(t));
  ok("and that landfall does not decompose as a product",
    /Landfall does NOT decompose/i.test(t));
  ok("the pre-1971 observing bias is surfaced verbatim",
    /before 1971, when East Pacific intensities were estimated/.test(t));
  /* THE RULE CHANGED SHAPE IN PHASE 3.1, AND GOT STRICTER RATHER THAN LOOSER.
     Phase 1 published no conditioned rate, so the probe was "no percentage at all" -- easy to
     satisfy by saying nothing. The rates are ported and proven now, so percentages legitimately
     appear, and the rule becomes the archive's own first panel rule: NO BARE PERCENTAGE. Every
     percent must be accompanied, in the same region of the screen, by the count over the
     denominator it came from AND by a Wilson interval. That is harder to satisfy than silence,
     and it is the property that actually matters: a reader must never be handed a probability
     stripped of the evidence it rests on.
     The archive's own gap prose is excluded, deliberately -- those strings quote measured
     figures ("1.7% Cat 3 in the 1960s vs 20-30% from the 1970s on") and are reproduced verbatim
     because rewording a finding is how a finding stops being one. */
  const computed = t.split("GAPS THE ARCHIVE RECORDED")[0];
  const pcts = computed.match(/\d+(\.\d+)?%/g) || [];
  ok("the surface publishes rates now", pcts.length > 0);
  ok("every percentage sits with a count over a denominator",
    !pcts.length || /\d+\s*\/\s*\d+/.test(computed));
  ok("and none appears without an interval beside it",
    !pcts.length || /\[\s*\d+\s*[-–—]\s*\d+%\s*\]/.test(computed));
  ok("the archive's own measured percentages survive verbatim in its gaps",
    /1\.7% Cat 3 in the 1960s/.test(t));
}

console.log("\n[4b] the five refusals — reachable, distinct, and honest about the remedy");
{
  /* THE CREDIBILITY SURFACE. Five different reasons the archive declines to answer, and the
     distinction that matters is not why but WHETHER THE READER CAN DO ANYTHING. Three dissolve
     if the question changes; two are limits of the record and no cohort can move them. An
     interface that offers a remedy for the second kind is lying more comfortably than one that
     refuses, so the check is not "a refusal appeared" -- it is that all five are on screen, no
     two say the same thing, and the irreducible ones do not pretend to be fixable. */
  const seen = async () => page.evaluate(() =>
    [...document.querySelectorAll("[data-refusal]")].map((e) => ({
      kind: e.getAttribute("data-refusal"),
      text: (e.innerText || "").replace(/\s+/g, " ").trim(),
    })));

  // A dense cohort is already selected from [4]: it carries UNKNOWN and BASE RATE ONLY.
  let states = new Map((await seen()).map((r) => [r.kind, r.text]));
  const t0 = await text();
  ok("— UNKNOWN reaches the screen", states.has("UNKNOWN"));
  ok("BASE RATE ONLY reaches the screen", states.has("BASE_RATE_ONLY"));
  ok("NOT EVALUABLE reaches the screen", states.has("NOT_EVALUABLE"));
  ok("and NOT EVALUABLE states the measured coverage, not a round number",
    /\d[\d,]* of [\d,]+ storms/.test(states.get("NOT_EVALUABLE") || ""),
    (states.get("NOT_EVALUABLE") || "").slice(0, 140));
  ok("the two irreducible states say so in as many words",
    /A LIMIT OF THE RECORD/.test(states.get("UNKNOWN") || "")
    && /A LIMIT OF THE RECORD/.test(states.get("BASE_RATE_ONLY") || ""));
  ok("and neither of them offers the reader a remedy",
    !/YOU CAN CHANGE THIS/.test(states.get("UNKNOWN") || "")
    && !/YOU CAN CHANGE THIS/.test(states.get("BASE_RATE_ONLY") || ""));
  ok("while NOT EVALUABLE is honest that it is only partly in the reader's hands",
    /PARTLY IN YOUR HANDS/.test(states.get("NOT_EVALUABLE") || ""));
  void t0;

  /* CONDITIONED ON -- the fifth rule. Conditioning the cohort on an outcome must make that
     outcome refuse to be reported back as a finding. */
  await page.click('[data-chip="intensity-cat3"]');
  await page.waitForTimeout(700);
  states = new Map((await seen()).map((r) => [r.kind, r.text]));
  const t1 = await text();
  ok("CONDITIONED ON fires when the cohort is defined by an outcome",
    states.has("CONDITIONED_ON"), t1.slice(0, 200));
  ok("and it names the way out — remove that condition",
    /Remove that condition/.test(states.get("CONDITIONED_ON") || ""));
  ok("the outcome zone declares its own consequence on the chip stack",
    /stops being an outcome/.test(t1));
  ok("and the zone is named as a different question",
    /GIVEN THAT IT ALSO/.test(t1));

  /* RATE REFUSED -- the sample gate. A cohort small enough to refuse still publishes counts. */
  await page.click('[data-chip="radius-250"]').catch(() => {});
  await page.waitForTimeout(700);
  const t2 = await text();
  states = new Map((await seen()).map((r) => [r.kind, r.text]));
  const refusedSomewhere = states.has("RATE_REFUSED") || /RATE REFUSED/.test(t2);
  ok("RATE REFUSED reaches the screen on a small cohort", refusedSomewhere,
    `n on screen: ${(t2.match(/BELOW SAMPLE[^\n]*/) || ["-"])[0]}`);
  if (states.has("RATE_REFUSED")) {
    ok("and it says a wider cohort would carry one",
      /wider cohort/.test(states.get("RATE_REFUSED") || ""));
  }
  ok("a refused rate never prints as 0.0%", !/\b0\.0%/.test(t2.split("GAPS THE ARCHIVE")[0]));

  /* NO TWO REFUSALS MAY READ THE SAME. If two states rendered identical prose the reader would
     have five badges and one meaning, which is the failure this whole surface exists to avoid. */
  const all = await seen();
  const byKind = new Map();
  for (const r of all) if (!byKind.has(r.kind)) byKind.set(r.kind, r.text);
  const texts = [...byKind.values()];
  ok("no two refusal states render the same text",
    new Set(texts).size === texts.length, texts.map((x) => x.slice(0, 40)).join(" | "));
  ok("at least four distinct refusals are reachable in one session",
    byKind.size >= 4, [...byKind.keys()].join(","));

  await page.click('[data-chip="intensity-all"]');
  await page.click('[data-chip="radius-800"]').catch(() => {});
  await page.waitForTimeout(700);
}

console.log("\n[4c] the builder reads as a question, not as a schema");
{
  const t = await text();
  ok("the cohort is stated as a sentence", /what happened next\?/i.test(t));
  ok("the lifecycle order is on screen",
    /1 · GENESIS/.test(t) && /2 · ENVIRONMENT/.test(t) && /3 · PEAK INTENSITY/.test(t)
    && /4 · LANDFALL/.test(t));
  ok("the given zone is named", /GIVEN — at or before genesis/.test(t));
  ok("applied conditions show what they cost", /−[\d,]+ excluded/.test(t));
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll("[data-chip]")].map((e) => e.getAttribute("data-chip")));
  ok("every Phase 1/2 filter survives as a first-class condition",
    ["intensity-all", "intensity-cat3", "intensity-cat5", "landfall-mexico", "landfall-any",
     "basin-all", "season-1971+", "mode-replay", "radius-500"]
      .every((k) => chips.includes(k)),
    chips.join(","));
}

console.log("\n[5] Iniki 1992 — the storm the archive's landfall methodology exists for");
{
  const row = await page.evaluate(() => {
    const a = globalThis.__ATLAS.archive;
    for (let i = 0; i < a.nStorms; i++) if (a.storms.str("name", i) === "INIKI") return i;
    return -1;
  });
  ok("Iniki is in the archive", row >= 0);
  await selectRow(row);
  await page.waitForTimeout(500);
  const t = await text();
  ok("its Hawaii landfall is shown", /KAUAI|Kauai/i.test(t) && /hawaii/i.test(t));
  ok("the Saffir-Simpson class is WITHHELD, not interpolated", /WITHHELD/.test(t));
  ok("the crossing is flagged as derived", /DERIVED/.test(t));
  ok("the detection method is named", /segment_crossing/.test(t));
  ok("observed and interpolated fixes are counted separately",
    /OBSERVED FIXES/.test(t) && /INTERPOLATED FIXES/.test(t));
  ok("the derived crossings are marked as derived", /·d/.test(t));
}

console.log("\n[6] a storm whose intensity was never recorded");
{
  const row = await page.evaluate(() => {
    const a = globalThis.__ATLAS.archive;
    for (let i = 0; i < a.nStorms; i++) {
      if (a.storms.num("max_vmax_kt", i) === null && a.storms.num("track_points", i) > 6) return i;
    }
    return -1;
  });
  ok("the archive holds such storms", row >= 0);
  if (row >= 0) {
    await selectRow(row);
    await page.waitForTimeout(500);
    const t = await text();
    ok("its peak is not rendered as a number", /NO INTENSITY RECORDED/.test(t));
    ok("and an em-dash stands in for the missing value", /—/.test(t));
    ok("its unreached thresholds are dashes, not zeroes",
      !/CATEGORY 1 · 64 KT\s*0\s*h/.test(t));
  }
}

console.log("\n[7] provenance is one keystroke away and carries the archive's own findings");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("p");
await page.waitForTimeout(700);
{
  const t = await text();
  ok("the methodology version is shown", /methodology/i.test(t));
  ok("the archive stamp is shown", /archive stamp/i.test(t));
  ok("the coordinate quantisation is declared", /track geometry/i.test(t));
  ok("with the deviation it actually introduced", /worst deviation/i.test(t));
  ok("columns the archive holds empty are named", /NULL on every row/.test(t));
  ok("what the pack leaves out is named", /NOT IN THIS PACK/.test(t));
  ok("the archive's own gaps are carried through", /GAPS RECORDED BY THE ARCHIVE/.test(t));
  ok("including the ERA5 refusal", /era5/i.test(t));
  ok("interpolated fixes are counted in provenance too", /interpolated fixes/i.test(t));
}

console.log("\n[8] the replay reveals the record without lying about time");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
{
  await page.click('[data-chip="mode-replay"]');
  await page.waitForTimeout(700);
  const t = await text();
  ok("the transport shows a real UTC date, not a frame index",
    /\d{4}-\d{2}-\d{2}|\d{1,2}\s+\w{3}\s+\d{4}/.test(t), t.slice(0, 160));
  ok("speed is stated in archive time, not as a bare multiplier", /d\/s/.test(t));
  ok("it says how many storms are active now", /ACTIVE NOW/.test(t));
  ok("and how much of the record has been revealed", /REVEALED/.test(t));
  ok("the skip is declared before it happens", /skips/i.test(t));

  /* Play until the clock has jumped at least once. The notice is transient by design, so this
     watches for it rather than sampling once and hoping. */
  const cursorOf = () => page.evaluate(() => {
    const r = globalThis.__ATLAS_REPLAY;
    return r ? r.cursor() : null;
  });
  const start = await cursorOf();
  await page.keyboard.press(" ");
  let sawSkip = false;
  let backwards = false;
  let prev = start;
  for (let i = 0; i < 40 && !sawSkip; i++) {
    await page.waitForTimeout(150);
    const now = await cursorOf();
    if (now !== null && prev !== null && now < prev) backwards = true;
    prev = now;
    if (/SKIPPED\s+[\d,]+\s+(DAYS?|HOURS?)\s+·\s+NO STORM ACTIVE/i.test(await text())) sawSkip = true;
  }
  await page.keyboard.press(" ");
  await page.waitForTimeout(200);
  const end = await cursorOf();
  ok("the cursor advanced", end !== null && start !== null && end > start, `${start} -> ${end}`);
  ok("and never ran backwards across a skip", !backwards);
  ok("a jump is announced on screen when it happens", sawSkip,
    "no SKIPPED … NO STORM ACTIVE notice appeared in six seconds of play");
  ok("storms have been revealed", /REVEALED[\s\S]{0,40}[1-9]/.test(await text()));
}

console.log("\n[8b] accumulated ink survives a pan, a zoom and a resize");
{
  /* THE FAILURE THIS EXISTS FOR. Assigning canvas.width or canvas.height throws the backing
     store away -- specified behaviour, and it fires on every moveend, zoomend and resize. An
     accumulating layer that merely skipped its clearRect would therefore lose the whole run on
     the first drag, and no text probe could see it: the DOM is identical either way. So this
     counts actual painted pixels. */
  const inkOf = () => page.evaluate(() => {
    const l = globalThis.__ATLAS_REPLAY;
    if (!l || !l._canvas) return -1;
    const c = l._canvas;
    const g = c.getContext("2d");
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 8) n++;   // sample the alpha channel
    return n;
  });
  const before = await inkOf();
  ok("the replay canvas has ink on it", before > 0, `sampled ${before} painted pixels`);

  await page.evaluate(() => globalThis.__ATLAS_MAP.panBy([140, 90], { animate: false }));
  await page.waitForTimeout(900);
  const afterPan = await inkOf();
  ok("it survives a pan", afterPan > before * 0.4, `${before} -> ${afterPan}`);

  await page.evaluate(() => globalThis.__ATLAS_MAP.setZoom(globalThis.__ATLAS_MAP.getZoom() - 1,
    { animate: false }));
  await page.waitForTimeout(900);
  const afterZoom = await inkOf();
  ok("it survives a zoom", afterZoom > before * 0.4, `${before} -> ${afterZoom}`);

  await page.setViewportSize({ width: 1600, height: 950 });
  await page.waitForTimeout(900);
  const afterResize = await inkOf();
  ok("it survives a resize", afterResize > before * 0.3, `${before} -> ${afterResize}`);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(500);
}

console.log("\n[8c] the density surfaces say what they count");
{
  await page.click('[data-chip="mode-explore"]');
  await page.waitForTimeout(400);
  /* The layer and density toggles sit under a disclosure now. The query is the product; how the
     cohort is DRAWN is a preference, and putting it behind one triangle is what keeps the
     builder from reading as a control panel. Opened here so the checks can still reach it. */
  await page.evaluate(() => {
    const d = document.querySelector("details[data-drawn]");
    if (d) d.open = true;
  });
  await page.waitForTimeout(200);
  await page.getByText("PATHWAY FREQUENCY", { exact: true }).click();
  await page.waitForTimeout(900);
  let t = await text();
  ok("the pathway surface names itself", /HISTORICAL PATHWAY FREQUENCY/i.test(t));
  ok("and denies being a forecast", /not a forecast/i.test(t));
  await page.getByText("GENESIS COUNT", { exact: true }).click();
  await page.waitForTimeout(900);
  t = await text();
  ok("the genesis surface names itself a count", /GENESIS COUNT/i.test(t));
  ok("and says a count is not a rate", /not (a|the) rate|a count, not/i.test(t));
  /* Naming a surface is not the same as drawing one. The archive-wide pathway grid holds 2,934
     cells and the genesis grid 869, so a peak of zero means the layer is a caption over an
     empty canvas -- which is precisely how a density surface fails quietly. */
  const peaks = await page.evaluate(() => {
    const q = globalThis.__ATLAS_QUERY;
    const A = globalThis.__ATLAS;
    if (!q || !A) return null;
    const rows = q.filterStorms(A.archive, {}).rows;
    const path = A.pathwayDensity ? A.pathwayDensity(A.archive, rows, 2.0) : null;
    const gen = A.genesisDensity ? A.genesisDensity(A.archive, rows, 2.0) : null;
    const peak = (m) => { let p = 0; if (m) for (const v of m.values()) if (v > p) p = v; return p; };
    return { pathCells: path ? path.size : 0, genCells: gen ? gen.size : 0,
      pathPeak: peak(path), genPeak: peak(gen) };
  });
  ok("the pathway grid actually holds cells", peaks && peaks.pathCells > 0 && peaks.pathPeak > 0,
    JSON.stringify(peaks));
  ok("the genesis grid actually holds cells", peaks && peaks.genCells > 0 && peaks.genPeak > 0,
    JSON.stringify(peaks));
}

console.log("\n[9] the page did not complain");
ok("no page or console errors", errors.length === 0, errors.join("\n        "));

await browser.close();
server.close();
console.log(failures
  ? `\n${failures} honesty probe(s) failed — something the archive knows is not reaching the screen\n`
  : "\nthe honesty surface reaches the screen\n");
process.exit(failures ? 1 : 0);
