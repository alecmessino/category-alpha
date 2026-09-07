#!/usr/bin/env node
/* WHAT ACTUALLY EXISTS TO BACKTEST A TRACK RESIDUAL ON, AND WHAT DOES NOT.
 *
 * §8 of the task asks for an inventory of CP/EP coverage from 2015 forward FROM LIVE-AVAILABLE
 * PRODUCTS, and for the missingness to be published rather than smoothed over. This script
 * measures it instead of estimating it, from two public indexes per season:
 *
 *   https://ftp.nhc.noaa.gov/atcf/archive/<year>/           the decks: a (guidance), b (best
 *                                                            track), f (centre fixes)
 *   https://ftp.nhc.noaa.gov/atcf/archive/<year>/messages/  every transmitted product, with its
 *                                                            SEND TIME in the filename
 *
 * THE SEND TIME IS THE WHOLE POINT. A residual is only a lead if the forecast it is measured
 * against was already on the wire when the fix was taken. The messages index is the only public
 * record of when that was, to the minute — so a season with decks but no messages index is a
 * season where residuals can be COMPUTED but not honestly SCORED, and the two are reported as
 * different states rather than as one number.
 *
 * BEST TRACK IS NOT SUBSTITUTED FOR ANYTHING. The b-deck is counted so the inventory is complete,
 * and it is marked retrospective. A post-season best-track position is not what was available
 * live and is never used to stand in for one.
 *
 * Run: node scripts/residual-coverage.mjs                 (network-bound; not in any workflow)
 *      node scripts/residual-coverage.mjs --years 2023,2024
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "research/track-residual");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const BASINS = ["ep", "cp"];
const YEARS = (arg("years", "") || "").split(",").filter(Boolean).map(Number);
const ALL_YEARS = YEARS.length ? YEARS
  : Array.from({ length: new Date().getUTCFullYear() - 2015 + 1 }, (_, i) => 2015 + i);

async function get(url) {
  try {
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, status: r.status, text: await r.text() };
  } catch (e) { return { ok: false, status: 0, error: String(e.message) }; }
}

/** Decks present for one season, per basin. One request answers all three deck kinds. */
function decksFrom(html, year) {
  const out = {};
  for (const b of BASINS) {
    const of = (k) => new Set([...html.matchAll(new RegExp(`href="${k}(${b}\\d{2}${year})\\.dat(?:\\.gz)?"`, "gi"))].map((m) => m[1].toLowerCase()));
    const a = of("a"), bd = of("b"), f = of("f");
    const storms = new Set([...a, ...bd, ...f]);
    out[b] = {
      storms: [...storms].sort(),
      stormCount: storms.size,
      withGuidanceDeck: a.size, withBestTrack: bd.size, withFixDeck: f.size,
      /* THE ONE THAT MATTERS FOR THIS MODULE. Without an f-deck a season has no non-advisory
         centre fixes at all, so its only residual series is official-only — which this module
         refuses for sample sufficiency, correctly. */
      missingFixDeck: [...storms].filter((s) => !f.has(s)).sort(),
    };
  }
  return out;
}

/** Products transmitted for one season, per basin, from the messages index. */
function messagesFrom(html, year) {
  const out = {};
  for (const b of BASINS) {
    const re = new RegExp(`href="(${b}\\d{2}${year})\\.(fstadv|public|public_a|discus)\\.(\\d+)\\.(\\d{8})"`, "gi");
    const perStorm = new Map();
    for (const m of html.matchAll(re)) {
      const [, storm, product] = m;
      if (!perStorm.has(storm)) perStorm.set(storm, { fstadv: 0, public: 0, public_a: 0, discus: 0 });
      perStorm.get(storm)[product]++;
    }
    const totals = { fstadv: 0, public: 0, public_a: 0, discus: 0 };
    for (const v of perStorm.values()) for (const k of Object.keys(totals)) totals[k] += v[k];
    out[b] = {
      storms: [...perStorm.keys()].sort(),
      stormCount: perStorm.size,
      totals,
      /* Intermediates are what make a sub-six-hour window possible at all. A season with none
         cannot populate one from official products, whatever else it has. */
      stormsWithIntermediates: [...perStorm.entries()].filter(([, v]) => v.public_a > 0).length,
      perStorm: Object.fromEntries(perStorm),
    };
  }
  return out;
}

async function main() {
  const seasons = [];
  for (const year of ALL_YEARS) {
    process.stdout.write(`  ${year} … `);
    const idx = await get(`https://ftp.nhc.noaa.gov/atcf/archive/${year}/`);
    const msg = await get(`https://ftp.nhc.noaa.gov/atcf/archive/${year}/messages/`);
    const row = {
      year,
      deckIndex: idx.ok ? "PRESENT" : `ABSENT (HTTP ${idx.status})`,
      messagesIndex: msg.ok ? "PRESENT" : `ABSENT (HTTP ${msg.status})`,
      /* THE STATE THAT MATTERS, NAMED. */
      scoreable: idx.ok && msg.ok,
      scoreabilityNote: idx.ok && msg.ok ? null
        : (idx.ok && !msg.ok
            ? "Residuals are COMPUTABLE (decks exist) but NOT SCOREABLE AS LEAD: no public "
              + "record of when each advisory transmitted, so availability cannot be established."
            : "Nothing archived for this season under this layout."),
      decks: idx.ok ? decksFrom(idx.text, year) : null,
      messages: msg.ok ? messagesFrom(msg.text, year) : null,
    };
    seasons.push(row);
    const ep = row.decks && row.decks.ep;
    process.stdout.write(`${row.deckIndex.padEnd(20)} msgs ${row.messagesIndex.padEnd(18)} `
      + (ep ? `EP ${ep.stormCount} storms, ${ep.withFixDeck} with f-decks` : "") + "\n");
  }

  const summary = {
    schema: "millibar.track-residual.coverage/1",
    generatedAt: new Date().toISOString(),
    question: "What CP/EP material exists to backtest a track residual on, from live-available "
            + "products, 2015 forward?",
    method: "Two public indexes per season, counted. Nothing is inferred from a storm's name, "
          + "and no post-season best track is substituted for a live product.",
    basins: BASINS,
    seasons,
    rollup: rollup(seasons),
    knownGaps: [
      "The current season has no archived messages/ index — it is written after the season, so "
      + "first-availability for a live storm must come from the live adv/ directory instead, "
      + "which is a different shape and is not retained historically.",
      "An f-deck's presence is not a guarantee of fix DENSITY. Eastern Pacific storms are rarely "
      + "flown, so many f-decks hold satellite fixes only — one upstream platform, hence one "
      + "independent group, hence INSUFFICIENT_SAMPLE under this module's own gate.",
      "Receipt time at THIS pipeline does not exist for any historical storm. Every historical "
      + "residual therefore carries an explicit availability assumption.",
      "The cp NN basin id undercounts Central Pacific activity: a storm that forms in the "
      + "eastern Pacific and crosses 140W keeps its EP id for life. Lowell (EP122026) was "
      + "written by CPHC in Honolulu and counts as EP here. A basin stratum built on the id is "
      + "a stratum on where a storm FORMED, not on who forecast it.",
      "Central Pacific seasons are small. A CP-only stratum will usually be too thin to score, "
      + "and the honest output there is a base rate and a refusal.",
    ],
  };
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "COVERAGE.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  await writeFile(join(OUT, "COVERAGE.md"), markdown(summary), "utf8");
  console.log(`\nWrote ${join(OUT, "COVERAGE.json")} and COVERAGE.md`);
}

function rollup(seasons) {
  const r = {};
  for (const b of BASINS) {
    let storms = 0, fix = 0, adeck = 0, scoreableStorms = 0, interm = 0, seasonsScoreable = 0;
    for (const s of seasons) {
      const d = s.decks && s.decks[b];
      if (d) { storms += d.stormCount; fix += d.withFixDeck; adeck += d.withGuidanceDeck; }
      if (s.scoreable && d) { scoreableStorms += d.stormCount; seasonsScoreable++; }
      const m = s.messages && s.messages[b];
      if (m) interm += m.stormsWithIntermediates;
    }
    r[b] = { storms, withFixDeck: fix, withGuidanceDeck: adeck,
             stormsInScoreableSeasons: scoreableStorms, seasonsScoreable,
             stormsWithIntermediateAdvisories: interm };
  }
  return r;
}

function markdown(s) {
  const L = [];
  L.push("# Track residual — historical coverage\n");
  L.push(`_Measured ${s.generatedAt} by \`scripts/residual-coverage.mjs\`. Two public indexes per season, counted._\n`);
  L.push("**" + s.question + "**\n");
  L.push("| Season | Decks | Messages | Scoreable as lead | EP storms | EP f-decks | EP w/ intermediates | CP storms | CP f-decks |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of s.seasons) {
    const ep = (r.decks && r.decks.ep) || {}, cp = (r.decks && r.decks.cp) || {};
    const mep = (r.messages && r.messages.ep) || {};
    L.push(`| ${r.year} | ${r.deckIndex} | ${r.messagesIndex} | ${r.scoreable ? "yes" : "**no**"} | `
      + `${ep.stormCount ?? "–"} | ${ep.withFixDeck ?? "–"} | ${mep.stormsWithIntermediates ?? "–"} | `
      + `${cp.stormCount ?? "–"} | ${cp.withFixDeck ?? "–"} |`);
  }
  L.push("");
  for (const [b, v] of Object.entries(s.rollup)) {
    L.push(`**${b.toUpperCase()}** — ${v.storms} storms across the window, ${v.withFixDeck} with a fix deck, `
      + `${v.stormsWithIntermediateAdvisories} with intermediate advisories, `
      + `${v.stormsInScoreableSeasons} in seasons where first-availability can be established.`);
  }
  L.push("\n## What is missing\n");
  for (const g of s.knownGaps) L.push(`- ${g}`);
  L.push("");
  return L.join("\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
