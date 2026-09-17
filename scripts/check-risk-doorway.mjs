/* THE /risk/ DOORWAY MUST LIST EVERY ROOM BEHIND IT, AND EVERY DOOR MUST OPEN.
 *
 * WHY THIS EXISTS. docs/ is the Pages root: anything under it is served whether or not
 * anything links to it. This repository already has a live example -- /preview/track-residual/
 * returns 200 and is linked from no index -- and the retired-residual scanner walks all of
 * docs/ rather than a list of pages for exactly that reason.
 *
 * An index is the other half of that problem. A published record that the index forgets is
 * invisible to a reader while being perfectly public, and a link the index keeps after a
 * record is renamed is a 404 with a confident label on it. So both directions are checked:
 *
 *   UNLISTED   a published route under docs/risk/ that the index does not link.
 *   DANGLING   a link on the index that resolves to nothing in the checkout.
 *
 * And the standing constraint on this surface, which is not a matter of intent: no page in
 * this tree may carry the vocabulary of a trading or wagering venue. It is checked here on
 * the index, and by scripts/risk/gates.py on each record.
 *
 * Run: node scripts/check-risk-doorway.mjs [--self-test]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const RISK = join(ROOT, "docs", "risk");
const INDEX = join(RISK, "index.html");

const MARKET = /kalshi|polymarket|edge ?book|\bbet(s|ting|tor)?\b|\bEV-ranked\b|\bmark-to-bid\b|\bodds\b/i;

/** Every href on the page, minus off-site ones and the page's own canonical URL. */
function links(html) {
  const out = [];
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const h = m[1];
    if (/^(https?:|mailto:|#)/.test(h)) continue;
    out.push(h);
  }
  return [...new Set(out)];
}

/** Published routes under docs/risk/: any subdirectory carrying an index.html. */
function routes(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() && existsSync(join(p, "index.html"));
  });
}

function check(html, riskDir, docsDir) {
  const problems = [];
  const hrefs = links(html);

  // UNLISTED. Every published route must be reachable from the index.
  const linked = new Set(hrefs.map((h) => h.replace(/\/$/, "").split("/")[0]));
  for (const r of routes(riskDir)) {
    if (!linked.has(r)) {
      problems.push({ kind: "UNLISTED", detail: `docs/risk/${r}/ is published but the index does not link it` });
    }
  }

  // DANGLING. Every link must resolve to something in the checkout.
  for (const h of hrefs) {
    const target = h.startsWith("../") ? join(docsDir, h.slice(3)) : join(riskDir, h);
    const ok = existsSync(target) || existsSync(join(target, "index.html"));
    if (!ok) problems.push({ kind: "DANGLING", detail: `${h} is linked from the index but resolves to nothing` });
  }

  if (MARKET.test(html)) {
    problems.push({ kind: "TRADING PATHWAY", detail: "the index carries the vocabulary of a trading or wagering venue" });
  }
  if (!/Not a weather forecast|not a forecast/i.test(html)) {
    problems.push({ kind: "UNQUALIFIED", detail: "the index does not say what it is not" });
  }
  return problems;
}

/* SELF-TEST. A guard that has never failed is a guard nobody has checked. */
function selfTest() {
  const base = '<p>Not a weather forecast.</p>';
  const cases = [
    ["a published route the index forgot", base, ["ghost-2026"], [], true],
    ["a link that resolves to nothing", base + '<a href="nope-2026/">x</a>', [], [], true],
    ["a trading pathway", base + '<a href="lala-2026/">x</a> see the edge book', ["lala-2026"], ["lala-2026"], true],
    ["the qualifier missing", '<a href="lala-2026/">x</a>', ["lala-2026"], ["lala-2026"], true],
    ["a complete index", base + '<a href="lala-2026/">x</a>', ["lala-2026"], ["lala-2026"], false],
  ];
  const bad = [];
  for (const [name, html, published, present, mustFail] of cases) {
    // Stand in for the filesystem rather than writing to docs/.
    const fakeRisk = { routes: published, present: new Set(present) };
    const problems = [];
    const hrefs = links(html);
    const linked = new Set(hrefs.map((h) => h.replace(/\/$/, "").split("/")[0]));
    for (const r of fakeRisk.routes) if (!linked.has(r)) problems.push("UNLISTED");
    for (const h of hrefs) if (!fakeRisk.present.has(h.replace(/\/$/, ""))) problems.push("DANGLING");
    if (MARKET.test(html)) problems.push("TRADING PATHWAY");
    if (!/Not a weather forecast|not a forecast/i.test(html)) problems.push("UNQUALIFIED");
    if ((problems.length > 0) !== mustFail) {
      bad.push(`${mustFail ? "missed" : "false positive"}: ${name}`);
    }
  }
  if (bad.length) {
    console.error("FAIL  the doorway gate does not do what it claims\n");
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`PASS  doorway gate self-test: ${cases.filter((c) => c[4]).length} bad indexes rejected, 1 allowed`);
}

if (process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

if (!existsSync(RISK)) {
  console.log("PASS  no /risk/ tree yet");
  process.exit(0);
}
if (!existsSync(INDEX)) {
  console.error("FAIL  docs/risk/ publishes routes but has no index");
  console.error(`      Unlisted published routes: ${routes(RISK).join(", ") || "(none)"}`);
  console.error("      docs/ is the Pages root; a route nobody links is public and invisible at once.");
  process.exit(1);
}

const html = readFileSync(INDEX, "utf8");
const problems = check(html, RISK, join(ROOT, "docs"));
if (problems.length) {
  console.error(`FAIL  ${relative(ROOT, INDEX)}\n`);
  for (const p of problems) console.error(`        [${p.kind}] ${p.detail}`);
  process.exit(1);
}
console.log("PASS  the /risk/ doorway lists every published route and every link resolves");
console.log(`      ${routes(RISK).length} routes linked, ${links(html).length} links checked`);
