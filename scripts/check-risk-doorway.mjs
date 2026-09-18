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

/* THE COMPARISON FIGURE MUST BE ON ONE BASIS, AND THAT BASIS MUST BE THE MANIFESTS'.
 *
 * Two official quantities exist for each event: the closest approach of the OPERATIONAL
 * working best track, and the closest approach of an advisory's own forecast track. Both are
 * in the records and both are true; they are not the same measurement. A figure that plots
 * one event on one basis and the other event on the other reads as a comparison and is not
 * one -- which is the single easiest way for this page to mislead a reader who trusts it.
 *
 * So the plotted pairs are read back out of the rendered figure and required to equal the
 * operational figures in each manifest. Retyping a number into a chart is exactly the failure
 * this checks for.
 */
function checkComparison(html, riskDir) {
  const problems = [];
  const fig = html.match(/<figure class="cmp-fig">([\s\S]*?)<\/figure>/);
  if (!fig) return [{ kind: "NO COMPARISON FIGURE", detail: "the index draws no comparison figure" }];
  const plotted = new Map();
  for (const m of fig[1].matchAll(/>([\w'’\-]+)<\/text>\s*<text[^>]*>(\d+) kt &#183; (\d+) nm &#183; \$(\d+)k</g)) {
    plotted.set(m[1].toLowerCase(), { kt: +m[2], nm: +m[3], payout: +m[4] * 1000 });
  }
  if (plotted.size < 2) {
    return [{ kind: "COMPARISON UNREADABLE", detail: `parsed ${plotted.size} plotted event(s), expected >= 2` }];
  }
  for (const dir of readdirSync(riskDir)) {
    const mp = join(riskDir, dir, `${dir}.manifest.json`);
    if (!existsSync(mp)) continue;
    const m = JSON.parse(readFileSync(mp, "utf8"));
    const name = String(m.event).split(" ").pop().toLowerCase();
    const got = plotted.get(name);
    if (!got) continue;
    const op = m.decision_manifest.operational;
    const ca = op.operational_closest_approach_hawaii || op.operational_closest_approach_niihau;
    const nm = ca.hawaii_nm ?? ca.niihau_nm;
    if (got.kt !== ca.wind_kt || got.nm !== nm) {
      problems.push({
        kind: "BASIS MISMATCH",
        detail: `${name}: figure plots ${got.kt} kt / ${got.nm} nm, the manifest's operational `
              + `closest approach is ${ca.wind_kt} kt / ${nm} nm`,
      });
    }
    const payout = m.decision_manifest.settlement.payout_observed;
    if (got.payout !== payout) {
      problems.push({ kind: "PAYOUT MISMATCH",
        detail: `${name}: figure says $${got.payout}, manifest says $${payout}` });
    }
  }
  /* The 2024 ladder may be shown. It may never be shown as a current term. */
  if (/\b2024\b/.test(html) && !/historical terms, not assumed for 2026/i.test(html)) {
    problems.push({ kind: "HISTORICAL TERMS UNLABELLED",
      detail: "the 2024 ladder appears without the historical-terms qualifier" });
  }
  problems.push(...checkNo2026Term(html));
  return problems;
}

/* NO 2026 CONTRACT TERM MAY BE NAMED, HOWEVER FAINTLY -- AND THE OLD GUARD COULD NOT FIRE.
 *
 * It read:
 *     /2026 (payout )?(cell|schedule) (is|was) /i.test(html) && !/not (reconstructable|public)/i
 *
 * Two independent defects, either of which alone would have disabled it:
 *
 *   1. THE QUALIFIER WAS DOCUMENT-SCOPED. The escape clause asked whether the WHOLE PAGE
 *      contains "not reconstructable" or "not public". It always does -- both events carry
 *      the settlement status "Not reconstructable from public terms" -- so the negation was
 *      false on every run and the branch was unreachable. Injecting the literal sentence
 *      "The 2026 payout cell is 64 kt in zone Z." into the published page returned PASS.
 *
 *   2. THE DETECTOR WAS TOO NARROW. It required the exact word order
 *      "2026 [payout] cell|schedule is|was " with a trailing space. "the 2026 zone polygon is
 *      Z", "the cell for 2026 was 64 kt" and "2026 attachment = 96 kt" all walked past it.
 *
 * The invariant is not "the page mentions a refusal somewhere". It is: A SENTENCE THAT BINDS A
 * 2026 CONTRACT TERM TO A VALUE MUST REFUSE IT IN THAT SAME SENTENCE. So the qualifier is
 * sentence-local, and the detector matches a term bound either by a copula or by a figure.
 *
 * The page's real sentences all pass, because each carries its own refusal:
 *   "Neither payout traces to a 2026 contract cell."
 *   "No 2026 payout cell is identified for either event."
 *   "for 2026 the schedule, the zone polygons ... are all unpublished."
 *   "No zone boundary is drawn, estimated or implied."
 */
const TERM_2026 = /\b(cells?|schedules?|zones?|polygons?|triggers?|attachments?|thresholds?|rows?|terms?)\b/i;
const BINDS = /\b(is|was|are|were|equals?|sits? at|settles? at)\b|=/i;
const FIGURE = /\d+\s*(kt|kts|knots|nm|mi|km)\b|\$\s?[\d,]+/i;
const REFUSES = /\b(no|not|never|cannot|can't|none|neither|nothing|unpublished|unknown|undisclosed|absent|refus\w*|withheld)\b/i;

function sentences(html) {
  /* Block ends are sentence ends: a table cell and the next one are not one sentence. */
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|td|th|li|h1|h2|h3|h4|figcaption|dd|dt|section|tr|caption)>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/);
}

function checkNo2026Term(html) {
  const hits = [];
  for (const s of sentences(html)) {
    if (!/\b2026\b/.test(s)) continue;
    if (!TERM_2026.test(s)) continue;
    if (!(BINDS.test(s) || FIGURE.test(s))) continue;
    if (REFUSES.test(s)) continue;
    hits.push(s.trim().slice(0, 140));
  }
  return hits.length
    ? [{ kind: "2026 CELL IMPLIED",
         detail: `a 2026 contract term is bound to a value in a sentence that does not refuse `
               + `it: "${hits[0]}"` + (hits.length > 1 ? ` (+${hits.length - 1} more)` : "") }]
    : [];
}

/* THE ASSOCIATION'S STRENGTH ON THE PAGE MUST BE THE STRENGTH IN THE RECORDS.
 *
 * The genesis-watch sequence can upgrade an association from geometric containment to one NHC
 * states itself. A page that keeps saying "containment only" after that understates the
 * record; one that says NHC states it before that overstates it. Both are failures, and which
 * one is live is decided by the ledger, not by this gate. */
function checkAssociationWording(root) {
  const page = join(root, "docs", "risk", "genesis-watch", "index.html");
  const ledger = join(root, "data", "genesis-watch", "LEDGER.json");
  if (!existsSync(page) || !existsSync(ledger)) return [];
  const html = readFileSync(page, "utf8");
  const entries = JSON.parse(readFileSync(ledger, "utf8")).entries || [];
  const snaps = join(root, "data", "genesis-watch", "snapshots");
  let stated = false, haveInvest = false;
  for (const e of entries) {
    const f = join(snaps, e.file || "");
    if (!existsSync(f)) continue;
    const rec = JSON.parse(readFileSync(f, "utf8"));
    if (e.kind === "invest-designation") haveInvest = true;
    if (e.kind === "association" && rec.association) {
      stated = rec.association.nhc_states_this_association === true;
    }
  }
  if (!haveInvest) return [];
  const saysStated = /NHC states this association itself/i.test(html);
  const saysContainment = /NHC DOES NOT\s+STATE THE ASSOCIATION/i.test(html);
  if (stated && !saysStated) {
    return [{ kind: "ASSOCIATION UNDERSTATED",
      detail: "a record states the association, but the page does not say so" }];
  }
  if (!stated && !saysContainment) {
    return [{ kind: "ASSOCIATION OVERSTATED",
      detail: "no record states the association, and the page does not label it containment-only" }];
  }
  return [];
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
  /* THE COMPARISON CHECK, MADE TO FIRE. It reads the real manifests, so it is exercised
     against the REAL published figure with one value bent -- which is exactly the mistake it
     exists to catch (a number retyped into a chart instead of derived). Nothing is written. */
  let cmpCases = 0;
  let termCases = 0;
  if (existsSync(INDEX) && existsSync(RISK)) {
    const real = readFileSync(INDEX, "utf8");
    const bent = real.replace(/(\d+) kt &#183; (\d+) nm/, (m, kt, nm) => `${+kt + 7} kt &#183; ${nm} nm`);
    const stripped = real.replace(/historical terms, not assumed for 2026/gi, "current terms");
    const checks = [
      ["a plotted wind that does not match the manifest", bent, "BASIS MISMATCH"],
      ["the 2024 ladder shown without its historical qualifier", stripped, "HISTORICAL TERMS UNLABELLED"],
    ];
    for (const [name, doc, kind] of checks) {
      cmpCases++;
      const got = checkComparison(doc, RISK).map((p) => p.kind);
      if (!got.includes(kind)) bad.push(`missed: ${name} (got ${got.join(",") || "nothing"})`);
    }
    if (checkComparison(real, RISK).length) {
      bad.push("false positive: the real published figure is rejected by its own check");
    }
    cmpCases++;

    /* THE 2026-TERM GUARD, MADE TO FIRE. Its predecessor could not: the escape clause was
       document-scoped and the whole page always satisfied it, so the branch was dead for as
       long as it existed and every run reported PASS. It is exercised here against the REAL
       page with a prohibited sentence spliced in -- including the four forms the old pattern
       did not even describe -- and against the real page unmodified. */
    const implied = [
      "The 2026 payout cell is 64 kt in zone Z.",
      "The 2026 zone polygon is Zone B.",
      "The cell for 2026 was 96 kt at 25 nm.",
      "2026 attachment = 96 kt.",
      "This event settles at the 64 kt row for 2026.",
      "The 2026 schedule pays $300,000 at that wind.",
    ];
    for (const sentence of implied) {
      termCases++;
      const doc = real.replace("<footer>", `<p>${sentence}</p><footer>`);
      if (!checkNo2026Term(doc).length) bad.push(`missed: an implied 2026 term — "${sentence}"`);
    }
    if (checkNo2026Term(real).length) {
      bad.push("false positive: the real published page names a 2026 term");
    }
  }

  if (bad.length) {
    console.error("FAIL  the doorway gate does not do what it claims\n");
    for (const b of bad) console.error(`  ${b}`);
    process.exit(1);
  }
  console.log(`PASS  doorway gate self-test: ${cases.filter((c) => c[4]).length} bad indexes rejected, 1 allowed`);
  if (cmpCases) console.log(`      comparison check: ${cmpCases - 1} bent figures rejected, the real one allowed`);
  if (termCases) console.log(`      2026-term check: ${termCases} implied terms rejected, the real page allowed`);
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
const problems = [...check(html, RISK, join(ROOT, "docs")),
                  ...checkComparison(html, RISK),
                  ...checkAssociationWording(ROOT)];
if (problems.length) {
  console.error(`FAIL  ${relative(ROOT, INDEX)}\n`);
  for (const p of problems) console.error(`        [${p.kind}] ${p.detail}`);
  process.exit(1);
}
console.log("PASS  the /risk/ doorway lists every published route and every link resolves");
console.log(`      ${routes(RISK).length} routes linked, ${links(html).length} links checked`);
