#!/usr/bin/env node
/* THE ACTIVE / PROVISIONAL FRESHNESS CONTRACT.
 *
 * WHAT WENT WRONG, AND WHY A LALA-SHAPED PATCH WOULD HAVE BEEN THE WRONG FIX. The Storm Atlas
 * packs are pure IBTrACS. IBTrACS publishes a PROVISIONAL row for the running season and stops
 * updating it long before the storm stops existing, so CP012026 / LALA reached the inspector as
 * 65 kt, Category 1, 988 mb, 49 fixes, ending 2026-08-16T00:00Z -- a finished storm -- while the
 * forecast office was still writing it up nine days later at 115 kt and 947 mb. The ATCF b-deck
 * carrying that was already being fetched and parsed on the same tick; it was never joined.
 *
 * The failure is not about Lala. It is about EVERY provisional storm for which a fresher
 * operational record exists, and it will recur on the next one unless the rule is a rule. So
 * this gate states the rule generically and then proves it against a PINNED FIXTURE, rather than
 * asserting a production number that would be a different number tomorrow.
 *
 * THE NINE CLAUSES, in the order they are checked below:
 *   1. the selected-storm representation uses the OPERATIONAL source;
 *   2. the displayed record cannot terminate before the operational source without an explicit
 *      stale / incomplete state;
 *   3. the displayed peak wind cannot be below an already-observed operational maximum;
 *   4. the displayed minimum pressure cannot be above an already-observed operational minimum,
 *      where pressure exists at all;
 *   5. the latest position and time satisfy a defined freshness bound;
 *   6. the record is identified as OPERATIONAL / PROVISIONAL;
 *   7. operational fixes do not duplicate through source blending;
 *   8. a failure of the live layer produces an explicit incomplete state, never a silent
 *      fallback to an archive representation that looks complete;
 *   9. historical cohort, calibration and refusal outputs are unchanged by the live layer.
 *
 * Clause 9 has its own gate as well -- scripts/test-atlas-live-boundary.mjs proves the import
 * graph -- because a behavioural check and a structural one fail for different reasons and both
 * are worth having.
 *
 * OFFLINE. The fixture is a committed b-deck, so this runs with no network and its answer is the
 * same in five years as it is today. That is the whole point of pinning it: a gate that fetches
 * the live deck would go green the day NHC revised the file and tell nobody.
 *
 * Run: node scripts/test-atlas-live.mjs
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBestTrack } from "./lib/atcf.mjs";
import {
  ACTIVE_STALE_HOURS, SCHEMA, buildAtlasLive, operationalRecord, parseAtcfId,
} from "./lib/atlas-live.mjs";
import { openArchive, openLive } from "../docs/storm-atlas/src/engine/node-io.js";
import {
  LIVE_ARCHIVE_FINAL, LIVE_NONE, LIVE_OPERATIONAL, LIVE_UNAVAILABLE, Live, categoryLadder,
  liveStateFor, operationalLifecycle, operationalView, shortfall, sourceDisagreement,
} from "../docs/storm-atlas/src/engine/live.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "docs/storm-atlas/data");
const FIXTURE = join(ROOT, "scripts/fixtures/bdeck-cp012026.dat");

let failed = 0;
let checks = 0;
const ok = (label, cond, detail = "") => {
  checks++;
  if (cond) { console.log("  ok    " + label); return; }
  failed++;
  console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
};

const Z = (ms) => (ms === null || ms === undefined ? "—" : new Date(ms).toISOString());

/* THE PINNED STATE. These are the numbers the fixture carries, and they are the floor the
 * contract is proved against -- not equalities, because a b-deck is revised and a future fixture
 * refresh should be allowed to carry MORE storm, never less.
 *
 * Read straight off scripts/fixtures/bdeck-cp012026.dat with the repo's own parser:
 *   63 fixes, 2026-08-10T00:00Z .. 2026-08-25T12:00Z, peak 115 kt at 2026-08-19T06:00Z,
 *   minimum 947 mb, last fix 45 kt TS at 34.8N 176.4W.
 * The archive's provisional row for the same storm: 49 fixes, 65 kt, 988 mb, ending
 * 2026-08-16T00:00Z. A build that renders the second where the first exists fails here. */
const PINNED = {
  atcf_id: "CP012026",
  min_peak_kt: 115,
  max_min_mslp_mb: 947,
  min_fixes: 50,          // strictly more than the 49-fix archive stub
  latest_valid_time: "2026-08-25T12:00:00.000Z",
  first_valid_time: "2026-08-10T00:00:00.000Z",
};

const archive = await openArchive(DATA);
const ladder = categoryLadder(archive.manifest);

/* ---------------------------------------------------------------------------------------
   [1] the artifact's schema, and the two clocks it refuses to collapse
   --------------------------------------------------------------------------------------- */
console.log("\n[1] atlas-live-v1 — the schema, and two timestamps that are never one");
const deckText = await readFile(FIXTURE, "utf8");
const deck = parseBestTrack(deckText);
ok("the pinned b-deck parses with the repo's own parser", deck.ok,
  `parseBestTrack returned ok=${deck.ok}`);

/* A FIXED INSTANT, so the artifact is byte-reproducible. Three hours and 44 minutes after the
   last fix -- a realistic posting lag, and inside the active freshness bound. */
const NOW = Date.parse("2026-08-25T15:43:45.983Z");
const fixtureArtifact = buildAtlasLive({
  storms: [{ id: "CP012026", name: "Lala" }],
  intel: { byStorm: { CP012026: {
    bestTrackHistory: deck.records,
    ships: null,
    bestTrackSource: { url: "fixture://bdeck-cp012026.dat", status: 200, bytes: deckText.length },
  } } },
  nowMs: NOW,
  previous: null,
});

ok("the artifact declares its schema", fixtureArtifact.schema === SCHEMA, fixtureArtifact.schema);
ok("and a generated timestamp", !!Date.parse(fixtureArtifact.generated_at || ""));
{
  const r = fixtureArtifact.storms.CP012026;
  for (const k of ["atcf_id", "fetched_at", "latest_valid_time", "fixes", "latest", "stage",
    "peak_wind_kt", "min_mslp_mb", "source", "age_hours", "fix_count"]) {
    ok(`the record exposes \`${k}\``, r && r[k] !== undefined, JSON.stringify(Object.keys(r || {})));
  }
  ok("source-valid time and fetch time are DIFFERENT fields with different values",
    r.latest_valid_time !== r.fetched_at
      && Date.parse(r.fetched_at) > Date.parse(r.latest_valid_time),
    `valid ${r.latest_valid_time} vs fetched ${r.fetched_at}`);
  ok("and the age between them is published rather than implied",
    typeof r.age_hours === "number" && Math.abs(r.age_hours - 3.7) < 0.1, String(r.age_hours));
  ok("no field named `cycle` carries two meanings — there is none",
    !("cycle" in r), JSON.stringify(Object.keys(r)));
}
{
  const h = fixtureArtifact.health;
  for (const k of ["ok", "active_atcf_ids", "expected_atcf_ids", "emitted_atcf_ids",
    "missing_atcf_ids"]) {
    ok(`health exposes \`${k}\``, h && h[k] !== undefined);
  }
  ok("health is green when every expected id was emitted", h.ok === true, h.note);
}

/* ---------------------------------------------------------------------------------------
   [2] the three states the browser must be able to tell apart
   --------------------------------------------------------------------------------------- */
console.log("\n[2] the three states — not expected, loaded, expected-and-missing");
{
  const loaded = new Live(fixtureArtifact, null);
  ok("an emitted id resolves to a record", !!loaded.record("CP012026"));
  ok("an id nobody is tracking resolves to nothing AND is not expected",
    !loaded.record("AL992026") && !loaded.expected.has("AL992026"));

  /* A DECK THAT DID NOT READ. The storm is active, so a record is EXPECTED; the ingest could not
     produce one, so none is emitted. Those two facts together are the whole of fail-closed and
     they have to survive into the artifact rather than being lost as an absence. */
  const broken = buildAtlasLive({
    storms: [{ id: "CP012026", name: "Lala" }],
    intel: { byStorm: { CP012026: { bestTrackHistory: null, ships: null } } },
    nowMs: NOW,
    previous: null,
  });
  ok("a storm whose deck failed is EXPECTED and NOT emitted",
    broken.health.expected_atcf_ids.includes("CP012026")
      && !broken.health.emitted_atcf_ids.includes("CP012026")
      && broken.health.missing_atcf_ids.includes("CP012026"),
    JSON.stringify(broken.health));
  ok("and the artifact's health says so rather than looking healthy",
    broken.health.ok === false, broken.health.note);
}

/* ---------------------------------------------------------------------------------------
   [3] identity: the ATCF id, and nothing else
   --------------------------------------------------------------------------------------- */
console.log("\n[3] identity — joined on the ATCF id, refused on anything else");
{
  ok("an ATCF id carries its own season", parseAtcfId("CP012026").season === 2026);
  ok("a malformed id is refused rather than guessed at", parseAtcfId("LALA") === null);

  /* THE NAME COLLISION THIS ARCHIVE ACTUALLY CONTAINS. LALA appears twice -- EP121984 and
     CP012026 -- so a name join would have attached a 2026 hurricane to a 1984 tropical storm. */
  const lalas = [];
  for (let i = 0; i < archive.nStorms; i++) {
    if ((archive.storms.str("name", i) || "").toUpperCase() === "LALA") lalas.push(i);
  }
  ok("the archive holds more than one storm named LALA, so a name join is unsafe",
    lalas.length > 1, `${lalas.length} row(s)`);

  const loaded = new Live(fixtureArtifact, null);
  for (const row of lalas) {
    const id = archive.storms.str("atcf_id", row);
    const st = liveStateFor(archive, row, loaded);
    if (id === "CP012026") {
      ok(`row ${row} (${id}) joins to the operational record`, st.state === LIVE_OPERATIONAL);
    } else {
      ok(`row ${row} (${id || "no atcf id"}) does NOT join to it`,
        st.state !== LIVE_OPERATIONAL, st.state);
    }
  }
}

/* ---------------------------------------------------------------------------------------
   [4] precedence, and the transition out of it
   --------------------------------------------------------------------------------------- */
console.log("\n[4] precedence — provisional yields to the operational record, post-analysis does not");
const lalaRow = (() => {
  for (let i = 0; i < archive.nStorms; i++) {
    if (archive.storms.str("atcf_id", i) === PINNED.atcf_id) return i;
  }
  return -1;
})();
ok(`the archive holds ${PINNED.atcf_id}`, lalaRow >= 0, "no row with that ATCF id");

{
  const loaded = new Live(fixtureArtifact, null);
  ok("a PROVISIONAL archive row with an operational record reads OPERATIONAL",
    archive.storms.bool("provisional", lalaRow) === true
      && liveStateFor(archive, lalaRow, loaded).state === LIVE_OPERATIONAL);

  /* THE POST-ANALYSIS TRANSITION, which needs no code: it follows from the provisional column.
     Proved against a real post-analysed storm, with the SAME artifact present. */
  let finalRow = -1;
  for (let i = 0; i < archive.nStorms; i++) {
    if (archive.storms.bool("provisional", i) === false && archive.storms.str("atcf_id", i)) {
      finalRow = i; break;
    }
  }
  ok("a post-analysed storm exists to test the transition against", finalRow >= 0);
  ok("and it reads ARCHIVE even with the live layer loaded",
    liveStateFor(archive, finalRow, loaded).state === LIVE_ARCHIVE_FINAL,
    `${archive.storms.str("atcf_id", finalRow)} → ${liveStateFor(archive, finalRow, loaded).state}`);
}

/* ---------------------------------------------------------------------------------------
   [5] THE CONTRACT. Nine clauses, over every provisional storm that has an operational record.
   --------------------------------------------------------------------------------------- */
console.log("\n[5] the freshness contract, over every provisional storm with an operational record");

/** Every (row, record) pair a given live layer governs. Generic: it does not know about Lala. */
function governed(live) {
  const out = [];
  for (let i = 0; i < archive.nStorms; i++) {
    const st = liveStateFor(archive, i, live);
    if (st.state === LIVE_OPERATIONAL) out.push({ row: i, state: st });
  }
  return out;
}

/**
 * The nine clauses, applied to one governed storm. Returns a list of violations.
 *
 * `nowMs` is passed rather than read from the clock so the answer is reproducible: a gate whose
 * verdict depends on when it ran is not a gate.
 */
function contractViolations({ row, state }, nowMs, { activeBound = ACTIVE_STALE_HOURS } = {}) {
  const bad = [];
  const s = archive.storm(row);
  const view = operationalView(state.record, { manifest: archive.manifest, now: nowMs });
  const id = s.atcf_id;

  // 1. the selected-storm representation uses the operational source
  if (view.source !== "atcf_bdeck") bad.push(`${id}: representation is not the operational source`);
  if (!view.fixes.length) bad.push(`${id}: operational representation has no fixes`);

  // 2. the displayed record does not terminate before the operational source
  const short = shortfall(s, view);
  if (view.latest_valid_time === null) bad.push(`${id}: no latest valid time`);
  if (short.hours !== null && short.hours > 0 && view.latest_valid_time <= s.end_t) {
    bad.push(`${id}: displayed record ends at or before the archive's own end`);
  }

  // 3. peak wind is never below an already-observed operational maximum
  const observedPeak = view.fixes.reduce(
    (m, f) => (f.kt !== null && (m === null || f.kt > m) ? f.kt : m), null);
  if (observedPeak !== null && (view.peak_wind_kt === null || view.peak_wind_kt < observedPeak)) {
    bad.push(`${id}: displayed peak ${view.peak_wind_kt} kt is below the observed ${observedPeak} kt`);
  }

  // 4. minimum pressure is never above an already-observed operational minimum, where one exists
  const observedMin = view.fixes.reduce(
    (m, f) => (f.mslp !== null && (m === null || f.mslp < m) ? f.mslp : m), null);
  if (observedMin !== null && (view.min_mslp_mb === null || view.min_mslp_mb > observedMin)) {
    bad.push(`${id}: displayed minimum ${view.min_mslp_mb} mb is above the observed ${observedMin} mb`);
  }
  if (observedMin === null && view.min_mslp_mb !== null) {
    bad.push(`${id}: a minimum pressure is displayed where no fix carries one`);
  }

  // 5. the latest position and time satisfy a defined freshness bound (ACTIVE storms only:
  //    a retained record is complete to its last fix and ageing is what it is supposed to do)
  if (view.latest === null || view.latest.lat === null || view.latest.lon === null) {
    bad.push(`${id}: the latest fix carries no position`);
  }
  if (view.active && view.age_hours !== null && view.age_hours > activeBound) {
    bad.push(`${id}: active record is ${view.age_hours} h old, past the ${activeBound} h bound, `
      + "and nothing marks it stale");
  }

  // 6. the record is identifiable as OPERATIONAL / PROVISIONAL
  if (archive.storms.bool("provisional", row) !== true) {
    bad.push(`${id}: an operational record governs a row that is not provisional`);
  }
  if (view.peak_wind_kt !== null && view.peak_category === null) {
    bad.push(`${id}: a peak wind with no class derived from it`);
  }

  // 7. no duplication through source blending
  const times = view.fixes.map((f) => f.t);
  if (new Set(times).size !== times.length) bad.push(`${id}: duplicate fix timestamps`);
  if (view.fix_count !== view.fixes.length) {
    bad.push(`${id}: fix_count ${view.fix_count} disagrees with ${view.fixes.length} fixes`);
  }
  if (view.fix_count === s.track_points + state.record.fix_count) {
    bad.push(`${id}: the fix count is the SUM of both sources — they have been concatenated`);
  }
  const sorted = times.slice().sort();
  if (times.join("|") !== sorted.join("|")) bad.push(`${id}: fixes are not in time order`);

  return bad;
}

{
  const loaded = new Live(fixtureArtifact, null);
  const g = governed(loaded);
  ok("the fixture governs exactly one storm", g.length === 1, `${g.length} governed`);
  const bad = g.flatMap((x) => contractViolations(x, NOW));
  ok("clauses 1-7 hold for every governed storm in the fixture", bad.length === 0,
    bad.join("\n        "));
}

/* AND AGAINST WHAT IS ACTUALLY COMMITTED. The fixture proves the contract; this proves that the
   artifact currently on disk satisfies it too, so a bad emit cannot ship. An absent artifact is
   NOT a failure here -- a checkout with no live file is a valid state and clause 8 covers it. */
{
  const live = await openLive(DATA);
  if (!live.ok) {
    console.log(`  note  no committed operational artifact to check (${live.error})`);
  } else {
    const g = governed(live);
    console.log(`  note  the committed artifact governs ${g.length} storm(s)`);
    const now = Date.parse(live.generatedAt);
    const bad = g.flatMap((x) => contractViolations(x, now));
    ok("clauses 1-7 hold for every governed storm in the committed artifact",
      bad.length === 0, bad.join("\n        "));
    ok("every emitted id in the committed artifact is a well-formed ATCF id",
      [...live.emitted].every((id) => parseAtcfId(id) !== null), [...live.emitted].join(", "));
  }
}

/* ---------------------------------------------------------------------------------------
   [6] clause 8 — the live layer failing produces an explicit incomplete state
   --------------------------------------------------------------------------------------- */
console.log("\n[6] clause 8 — a failed live layer never falls back silently");
{
  for (const [label, live] of [
    ["never attempted", null],
    ["fetch failed", new Live(null, "HTTP 404")],
    ["wrong schema", await openLive(DATA, { file: "atlas-manifest.json" })],
  ]) {
    const st = liveStateFor(archive, lalaRow, live);
    ok(`a provisional storm reads UNAVAILABLE when the layer ${label}`,
      st.state === LIVE_UNAVAILABLE, `${st.state} — ${st.reason}`);
    ok(`  ...and the state carries a reason a panel can print`,
      typeof st.reason === "string" && st.reason.length > 10, String(st.reason));
  }

  /* THE OTHER HALF: a broken live layer must NOT turn a post-analysed storm into a warning.
     Fail-closed is about a record known to be incomplete, not about every storm on the surface. */
  let finalRow = -1;
  for (let i = 0; i < archive.nStorms; i++) {
    if (archive.storms.bool("provisional", i) === false) { finalRow = i; break; }
  }
  ok("a post-analysed storm is unaffected by the layer failing",
    liveStateFor(archive, finalRow, new Live(null, "HTTP 404")).state === LIVE_ARCHIVE_FINAL);

  /* AND a provisional storm the layer knows nothing about is NONE, not UNAVAILABLE: there is
     nothing to be missing. This is the distinction the health block exists to carry. */
  const emptyArtifact = buildAtlasLive({ storms: [], intel: { byStorm: {} }, nowMs: NOW,
    previous: null });
  const st = liveStateFor(archive, lalaRow, new Live(emptyArtifact, null));
  ok("a provisional storm nobody is tracking reads NONE, not UNAVAILABLE",
    st.state === LIVE_NONE, `${st.state} — ${st.reason}`);
}

/* ---------------------------------------------------------------------------------------
   [7] THE PERMANENT LALA REGRESSION. The fixture proves the generic contract; this is the
       specific state it was pinned from, and it must not silently become the archive stub again.
   --------------------------------------------------------------------------------------- */
console.log("\n[7] the pinned Lala regression — 115 kt / 947 mb, never 65 kt / Category 1");
{
  const loaded = new Live(fixtureArtifact, null);
  const st = liveStateFor(archive, lalaRow, loaded);
  const view = operationalView(st.record, { manifest: archive.manifest, now: NOW });
  const s = archive.storm(lalaRow);
  const cycle = operationalLifecycle(view.fixes, ladder);

  ok(`the selected-storm representation is OPERATIONAL`, st.state === LIVE_OPERATIONAL, st.state);
  ok(`peak wind >= ${PINNED.min_peak_kt} kt`, view.peak_wind_kt >= PINNED.min_peak_kt,
    `${view.peak_wind_kt} kt`);
  ok(`minimum pressure <= ${PINNED.max_min_mslp_mb} mb`,
    view.min_mslp_mb !== null && view.min_mslp_mb <= PINNED.max_min_mslp_mb,
    `${view.min_mslp_mb} mb`);
  ok(`the record carries at least ${PINNED.min_fixes} fixes`,
    view.fix_count >= PINNED.min_fixes, `${view.fix_count} fixes`);
  ok("the derived class is at least Category 4",
    ["cat4", "cat5"].includes(view.peak_category), String(view.peak_category));

  /* THE FAILURE, NAMED. A build that reverts to the archive stub renders these instead. */
  ok("the representation is NOT the archive's 65 kt",
    view.peak_wind_kt !== s.max_vmax_kt || s.max_vmax_kt >= PINNED.min_peak_kt,
    `operational ${view.peak_wind_kt} kt vs archive ${s.max_vmax_kt} kt`);
  ok("the representation is NOT Category 1",
    view.peak_category !== "cat1", String(view.peak_category));
  ok("and it does not stop at the archive's 49 fixes",
    view.fix_count > s.track_points, `${view.fix_count} vs ${s.track_points}`);

  ok(`the record reaches ${PINNED.latest_valid_time}`,
    view.latest_valid_time >= Date.parse(PINNED.latest_valid_time),
    Z(view.latest_valid_time));
  ok("which is past where the archive's own record ends",
    view.latest_valid_time > s.end_t, `${Z(view.latest_valid_time)} vs ${Z(s.end_t)}`);
  ok(`it begins at ${PINNED.first_valid_time}, before the archive's genesis`,
    view.first_valid_time <= Date.parse(PINNED.first_valid_time),
    Z(view.first_valid_time));

  /* THE LADDER, RE-DERIVED. The archive's own crossing columns describe its 49-fix stub and say
     this storm never reached Category 3; the operational record says it reached Category 4. The
     panel prints the second, and this is the arithmetic behind it. */
  ok("the operational ladder reaches cat4", cycle.crossings.cat4 !== null, Z(cycle.crossings.cat4));
  ok("and cat5 is absent rather than zero", cycle.crossings.cat5 === null);
  ok("the operational genesis agrees with the archive's, to the hour",
    cycle.genesis !== null && Math.abs(cycle.genesis - s.genesis_t) < 3600000,
    `${Z(cycle.genesis)} vs archive ${Z(s.genesis_t)}`);

  /* THE SHORTFALL, which is what the fail-closed sentence would have to name. */
  const sf = shortfall(s, view);
  ok("the shortfall against the archive is reported in hours, fixes, wind and pressure",
    sf.hours > 0 && sf.fixes > 0 && sf.wind_kt > 0 && sf.mslp_mb > 0, JSON.stringify(sf));
}

/* ---------------------------------------------------------------------------------------
   [8] disagreement is stated, never resolved
   --------------------------------------------------------------------------------------- */
console.log("\n[8] source disagreement — both printed, neither adjusted");
{
  const loaded = new Live(fixtureArtifact, null);
  const view = operationalView(loaded.record("CP012026"),
    { manifest: archive.manifest, now: NOW });
  const s = archive.storm(lalaRow);
  ok("with the operational record ahead on every axis, there is nothing to report",
    sourceDisagreement(s, view).length === 0,
    JSON.stringify(sourceDisagreement(s, view)));

  /* THE OTHER DIRECTION, WHICH IS THE ONE THAT MATTERS: IBTrACS catches up and overtakes. The
     rule must not quietly LOWER a displayed peak, and it must not hide that the archive holds a
     bigger number. Synthesised, because the archive does not currently contain this state -- and
     it is exactly the state the next post-analysis produces. */
  const ahead = { ...s, max_vmax_kt: 130, min_mslp_mb: 930, end_t: view.latest_valid_time + 86400000 };
  const d = sourceDisagreement(ahead, view);
  const keys = d.map((x) => x.key).sort();
  ok("an archive peak above the operational one is reported",
    keys.includes("peak_wind"), keys.join(","));
  ok("an archive minimum below the operational one is reported", keys.includes("min_mslp"));
  ok("an archive record extending past the operational one is reported", keys.includes("extent"));
  ok("and every row names BOTH values",
    d.every((x) => x.archive && x.operational && x.archive !== x.operational),
    JSON.stringify(d));
  ok("nothing in the view was changed by reporting the disagreement",
    view.peak_wind_kt === 115 && view.min_mslp_mb === 947);
}

/* ---------------------------------------------------------------------------------------
   [9] retention — the record survives the storm leaving the active feed
   --------------------------------------------------------------------------------------- */
console.log("\n[9] retention — a dissipated storm does not revert to the archive stub");
{
  /* One tick later, with the storm gone from the active list. Without retention the Atlas would
     show operational truth for exactly as long as the storm was on the news and then silently
     revert to the 49-fix stub the day it dissipated. */
  const later = NOW + 6 * 3600000;
  const next = buildAtlasLive({ storms: [], intel: { byStorm: {} }, nowMs: later,
    previous: fixtureArtifact });
  const r = next.storms.CP012026;
  ok("the record is retained", !!r);
  ok("and is marked inactive rather than deleted", r && r.active === false);
  ok("its fetch time is NOT restamped — nobody re-read it",
    r.fetched_at === fixtureArtifact.storms.CP012026.fetched_at, String(r && r.fetched_at));
  ok("but its age has grown honestly",
    r.age_hours > fixtureArtifact.storms.CP012026.age_hours, String(r && r.age_hours));
  ok("it is still EXPECTED, so its absence would still be a failure",
    next.health.expected_atcf_ids.includes("CP012026"));
  ok("and the freshness bound does not call a retained record stale",
    !next.health.stale_atcf_ids.includes("CP012026"), next.health.stale_atcf_ids.join(","));

  /* AND IT DOES NOT RETAIN FOREVER. A record from a previous season has been superseded by
     whatever IBTrACS published for it. */
  const nextYear = buildAtlasLive({ storms: [], intel: { byStorm: {} },
    nowMs: Date.parse("2027-03-01T00:00:00Z"), previous: fixtureArtifact });
  ok("a previous season's record is dropped rather than carried",
    !nextYear.storms.CP012026, JSON.stringify(Object.keys(nextYear.storms)));
}

/* ---------------------------------------------------------------------------------------
   [10] staleness is marked, not hidden
   --------------------------------------------------------------------------------------- */
console.log("\n[10] an active record past its freshness bound is named, not withheld");
{
  const late = NOW + (ACTIVE_STALE_HOURS + 6) * 3600000;
  const stale = buildAtlasLive({
    storms: [{ id: "CP012026", name: "Lala" }],
    intel: { byStorm: { CP012026: { bestTrackHistory: deck.records, ships: null } } },
    nowMs: late,
    previous: null,
  });
  ok("the artifact still carries the record — the freshest thing that exists still is",
    !!stale.storms.CP012026);
  ok("and names it stale on the health block",
    stale.health.stale_atcf_ids.includes("CP012026"), stale.health.stale_atcf_ids.join(","));
  ok("the bound itself is published, not implicit",
    stale.freshness.active_stale_hours === ACTIVE_STALE_HOURS,
    JSON.stringify(stale.freshness));
}

/* ---------------------------------------------------------------------------------------
   [11] the emitter is pure — same inputs, same bytes
   --------------------------------------------------------------------------------------- */
console.log("\n[11] the emitter is pure");
{
  const again = buildAtlasLive({
    storms: [{ id: "CP012026", name: "Lala" }],
    intel: { byStorm: { CP012026: {
      bestTrackHistory: deck.records,
      ships: null,
      bestTrackSource: { url: "fixture://bdeck-cp012026.dat", status: 200, bytes: deckText.length },
    } } },
    nowMs: NOW,
    previous: null,
  });
  ok("two runs over the same inputs are byte-identical",
    JSON.stringify(again) === JSON.stringify(fixtureArtifact));
  ok("no value was invented: every fix time appears in the deck",
    fixtureArtifact.storms.CP012026.fixes.every((f) => deckText.includes(
      f.t.slice(0, 4) + f.t.slice(5, 7) + f.t.slice(8, 10) + f.t.slice(11, 13))));
  ok("a null wind stays null and never becomes zero",
    fixtureArtifact.storms.CP012026.fixes.every((f) => f.kt === null || f.kt > 0));
  ok("operationalRecord refuses an empty deck rather than emitting an empty storm",
    operationalRecord({ atcfId: "CP012026", name: "Lala", records: [], fetchedAt: "x" }) === null);
}

console.log(failed
  ? `\n${failed} of ${checks} operational-record check(s) failed — the freshness contract is broken\n`
  : `\n${checks} checks: the operational record leads where it is fresher, and says so\n`);
process.exit(failed ? 1 : 0);
