#!/usr/bin/env node
/* COVERAGE GATE — the build fails when Priority 1 or 2 is missing on an active storm.
 *
 * WHY A GATE AND NOT A WARNING. The other feeds on this board degrade visibly: when the
 * market feed dies the panel says NO FEED and nobody is misled. These two degrade
 * INVISIBLY. If the guidance decks stop being read, the terminal keeps publishing a
 * probability — it just quietly goes back to being built from the advisory the market has
 * already priced, and the board looks exactly as it did when it had a head start. The
 * only symptom of losing the edge is that there is no longer an edge, which is not a
 * symptom anyone notices in time.
 *
 * WHAT IS ACTUALLY REQUIRED, and this is the whole design of the gate:
 *
 *   PRIORITY 1 (ATCF) is required to have DELIVERED. The decks exist for every active
 *   system, always — NHC writes them as it works. So an active storm with no deck is a
 *   broken ingest, and it fails.
 *
 *   PRIORITY 2 (recon) is required to have been POLLED, not to have found an aircraft.
 *   Whether a plane is flying is a decision the Air Force and NOAA make about hurricane
 *   hunting, not a property of this pipeline: eastern Pacific storms are rarely flown at
 *   all. Failing a build because no aircraft was tasked would be failing it for the
 *   weather, and a gate that fails for reasons nobody can fix is a gate that gets turned
 *   off. What is enforced is that the poll ran, reached the products, and recorded a
 *   definite answer.
 *
 * The distinction is the point: a feed that CAN be absent legitimately is checked for
 * having been asked, and a feed that cannot is checked for having answered.
 *
 * Run: node scripts/check-intel-coverage.mjs [path/to/latest.json]
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const FILE = process.argv[2] || resolve(__dir, "../docs/data/latest.json");

const problems = [], notes = [];
const bad = (m) => problems.push(m);
const note = (m) => notes.push(m);

let latest;
try { latest = JSON.parse(await readFile(FILE, "utf8")); }
catch (e) {
  console.error(`[intel] cannot read ${FILE}: ${e.message}`);
  process.exit(1);
}

const feeds = latest.feeds || {};
const storms = latest.storms || [];

console.log(`[intel] ${FILE}`);
console.log(`[intel] snapshot ${latest.generatedAt} · ${storms.length} active system(s)`);

/* No storms is a legitimate state and most of the year is exactly that. There is nothing
   to have coverage OF, so the gate passes — but the feed rows still have to exist, because
   their absence would mean the ingest never ran at all. */
if (!storms.length) {
  for (const k of ["atcf", "recon", "ships", "ascat"]) {
    if (!feeds[k]) bad(`no "${k}" feed record at all — the ingest did not run this cycle`);
  }
  if (!problems.length) console.log("[intel] no active systems — nothing to cover, and all four feed records present");
}

for (const s of storms) {
  const name = `${s.id} ${s.name}`;

  // ---- PRIORITY 1: the guidance decks must have delivered ----
  const atcf = feeds.atcf || {};
  if (!atcf.ok) {
    bad(`${name}: PRIORITY 1 — the ATCF feed failed this cycle (${atcf.note || "no detail"})`);
  } else if (!s.consensus) {
    /* A NULL CONSENSUS IS TWO DIFFERENT EVENTS AND THEY NEED OPPOSITE RESPONSES.
     *
     * Either NHC ran no guidance for this system this cycle, or this pipeline stopped
     * finding the guidance NHC ran. The first is the atmosphere and the operations desk:
     * a storm being wound down stops getting aids, and the 00Z deck for a dying 30 kt
     * depression carries a single CARQ analysis record and nothing else. The second is
     * the silent degradation this whole gate exists to catch.
     *
     * They are told apart by what the deck actually contains, derived from the data
     * rather than from a list of names: a tech that FORECASTS has rows beyond tau 0.
     * A deck with forecast aids in it and no consensus out of it is this pipeline's
     * fault. A deck with no forecast aids at all had nothing to give.
     *
     * This is the same distinction already drawn for Priority 2 — polled, not flown —
     * and it was missing here. Caught by the gate failing on Hernan for the weather,
     * which is precisely how a gate earns a reputation for crying wolf and gets
     * switched off. */
    const deck = s.atcfDeck || null;
    const why = (s.intelNotes && s.intelNotes.atcf) || "no detail recorded";
    if (deck && deck.forecastAids > 0) {
      bad(`${name}: PRIORITY 1 — the ${deck.cycle} deck carries ${deck.forecastAids} forecasting aid(s)`
        + ` but no consensus was extracted from it — that is this pipeline, not the deck (${why})`);
    } else if (deck) {
      console.log(`  ok  ${name}: ${deck.cycle} deck carries no forecasting aids at all`
        + ` (${deck.techCount} record${deck.techCount === 1 ? "" : "s"}, analysis only)`
        + ` — NHC ran no guidance for this system, so there is no consensus to lose`);
      note(`${name}: no pre-advisory signal this cycle — the deck had nothing to give, and the board says so`);
    } else {
      bad(`${name}: PRIORITY 1 — no guidance consensus and no deck census to explain it (${why})`);
    }
  } else {
    const c = s.consensus;
    if (c.peakKt == null) bad(`${name}: PRIORITY 1 — consensus present but carries no peak intensity`);
    if (!c.cycleIso) bad(`${name}: PRIORITY 1 — consensus carries no cycle time, so its age cannot be checked`);
    if (c.missing && c.missing.length) note(`${name}: aids absent this cycle — ${c.missing.join(" · ")}`);
    console.log(`  ok  ${name}: consensus ${c.cycle} · ${c.n} aid(s) · peak ${c.peakKt} kt`
      + (c.spreadKt != null ? ` ±${c.spreadKt}` : "") + ` · ${(c.members || []).map((m) => m.tech).join("/")}`);
  }

  // ---- PRIORITY 2: the reconnaissance poll must have run and answered ----
  const recon = feeds.recon || {};
  if (!recon.ok) {
    bad(`${name}: PRIORITY 2 — the reconnaissance poll failed (${recon.note || "no detail"})`);
  } else if (!Array.isArray(recon.attempts) || recon.attempts.length === 0) {
    bad(`${name}: PRIORITY 2 — the poll recorded no attempts, so nothing proves it ran`);
  } else {
    const reached = recon.attempts.filter((a) => a.ok).length;
    if (!reached) bad(`${name}: PRIORITY 2 — every reconnaissance product was unreachable`);
    else if (s.recon && s.recon.ok) {
      console.log(`  ok  ${name}: aircraft fix ${s.recon.fixIso} · ${s.recon.mslp ?? "—"} mb · ${s.recon.intensityKt ?? "—"} kt`);
    } else {
      /* The legitimate absence. Recorded loudly enough to be visible in a build log,
         because "no aircraft was tasked" and "the poll broke" must never look alike. */
      console.log(`  ok  ${name}: ${reached}/${recon.attempts.length} products polled, no aircraft reporting on this system`);
    }
  }

  // ---- the engine has to have produced something from all that ----
  if (!s.hurricanePCal) {
    /* A storm with a deck but no calibrated probability means the engine refused. That is
       allowed — it refuses when there is no official forecast to calibrate — but it must
       be visible rather than looking like a storm nobody priced. */
    note(`${name}: no calibrated probability (${s.hurricaneP ? "engine refused" : "no official forecast parsed"})`);
  } else {
    const c = s.hurricanePCal;
    /* RAW AND CALIBRATED, SIDE BY SIDE — enforced, not assumed. If the engine ever stops
       publishing the untouched official estimate next to the calibrated one, no surface
       downstream can show both and the rule has been silently dropped. */
    if (c.pRaw == null) bad(`${name}: the calibrated probability is published without the raw one beside it`);
    if (c.p == null) bad(`${name}: the engine returned ok with no probability`);
    if (c.pLow == null || c.pHigh == null) bad(`${name}: the calibrated probability carries no band`);
    else if (!(c.pLow <= c.pRaw + 1e-9 && c.pHigh >= c.pRaw - 1e-9)) {
      /* The calibration must never reach somewhere the plain arithmetic cannot. */
      bad(`${name}: the published band ${c.pLow}..${c.pHigh} does not contain the raw estimate ${c.pRaw}`);
    }
    console.log(`  ok  ${name}: P raw ${Math.round(c.pRaw * 100)}% → calibrated ${Math.round(c.p * 100)}%`
      + ` · ${c.meanKt} kt ±${c.sigmaKt} · evidence ${s.evidenceQuality ? s.evidenceQuality.tier : "?"}`
      + ` · used ${Object.entries(c.used).filter(([, v]) => v).map(([k]) => k).join("+") || "nothing"}`);
  }

  /* Priorities 3 and 4 are reported, never enforced. SHIPS runs 6-hourly and may not have
     landed; a scatterometer pass is an orbit that either crossed the storm or did not.
     Failing on either would be failing on a schedule this pipeline does not control. */
  if (!s.ships) note(`${name}: no SHIPS diagnostics (${(s.intelNotes && s.intelNotes.ships) || "not recorded"})`);
  if (!s.ascat) note(`${name}: no scatterometer pass — intermittent by nature`);
}

for (const n of notes) console.log(`  --  ${n}`);

if (problems.length) {
  console.error(`\n[intel] COVERAGE GATE FAILED — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error("  · " + p);
  console.error("\n  Priority 1 (ATCF decks) and Priority 2 (reconnaissance poll) are the only inputs");
  console.error("  that arrive before the advisory. Without them the board is pricing the same");
  console.error("  products the market has already read, and nothing on screen would say so.\n");
  process.exit(1);
}

console.log(`\n[intel] coverage gate clean · ${storms.length} system(s) · priorities 1 and 2 satisfied\n`);
