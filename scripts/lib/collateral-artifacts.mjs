/* The six artifacts. Structure and every figure live here; the prose slots are injected from
 * docs/collateral/copy.json. A slot that is missing renders as a visible TODO rather than as
 * silence, so an unwritten section cannot ship looking finished.
 */
import {
  page, masthead, sectionHead, cohortLine, ledger, ledgerPair, unscoreableTable, unscoreableNote, citeBlock,
  comparisonStrip, answersRail, repCardRow, repRule, footer, disclaimerLine,
  esc, pct, ci, hrs, coord, DISCLAIMER,
} from "./collateral-kit.mjs";
import { basinPlate, cellPlate, plate, LEGEND } from "./collateral-plates.mjs";

/* THE ONE LIVE INSTANT this package is stamped to. Every live line carries it; no historical
   cohort page does, because a cohort is evergreen and stamping it would imply otherwise. */
export const LIVE_STAMP = "31 AUG 2026 · 16:14 CT / 21:14 UTC";
export const LIVE_ISO = "2026-08-31T13:25Z";

const SLOT_MISS = (id) =>
  `<p style="color:#dc2626;font-family:var(--font-mono);font-size:var(--t-detail)">[COPY SLOT "${esc(id)}" NOT SUPPLIED]</p>`;

export function makeCopy(all, key) {
  const art = all && all[key] ? all[key].copy : null;
  const map = new Map((art && art.sections ? art.sections : []).map((s) => [s.slot, s]));
  return {
    has: (id) => map.has(id),
    get: (id) => (map.has(id) ? map.get(id).body : SLOT_MISS(id)),
    head: (id, fallback) => (map.has(id) && map.get(id).heading ? map.get(id).heading : fallback),
    answers: (art && art.answers) || {},
  };
}

/* ---- shared furniture --------------------------------------------------------------------- */

function packFoot(D, extra = "") {
  return footer({
    left: `<b>ARCHIVE</b> ${D.pack.counts.storms.toLocaleString()} storms · `
      + `${D.pack.counts.track_points.toLocaleString()} track points · `
      + `${D.pack.counts.landfalls.toLocaleString()} landfall rows · `
      + `${D.pack.counts.environment.toLocaleString()} environment records · `
      + `<b>METHODOLOGY</b> ${esc(D.pack.methodology_version)} · `
      + `<b>PACK</b> ${esc(D.pack.archive_stamp)} · `
      + `<b>BUILT</b> ${esc(D.pack.archive_built_utc)} · `
      + `<b>SOURCES</b> ${esc(D.pack.sources.join(" · "))}${extra}`,
    right: `RESEARCH ONLY<br>NOT A FORECAST<br>MILLIBAR / STORM ATLAS`,
  });
}

/** The live strip. Every row carries the instant it is true at; nothing here is evergreen. */
function liveStrip(D, rows) {
  return `<div class="live">
  <div class="live-hd"><span>LIVE SYSTEM STATUS — STATUS ONLY, NOT ATLAS OUTPUT</span>
    <span class="ts">AS OF ${esc(LIVE_STAMP)}</span></div>
  <table><thead><tr>
    <th style="width:16%">System / basin</th><th style="width:14%">Point type</th>
    <th style="width:35%">Live status (NHC advisory)</th>
    <th style="width:35%">What the archive's feeds hold</th>
  </tr></thead><tbody>${rows.map((r) => `<tr>
    <td><span class="nm">${r.name}</span><span class="sub">${esc(r.basin)}</span></td>
    <td><span class="chip ${r.pre ? "pre" : "obs"}">${esc(r.pointType)}</span>
        <span class="sub">${esc(r.point)}</span></td>
    <td>${r.live}</td>
    <td>${r.feed}</td></tr>`).join("")}</tbody></table>
</div>`;
}

/* The four systems' live lines, written once and shared, so no two artifacts can drift. */
export function liveRows(D) {
  const K = D.operational.storms.find((s) => s.atcf_id === "EP112026");
  const L = D.operational.storms.find((s) => s.atcf_id === "EP122026");
  const F = D.operational.storms.find((s) => s.atcf_id === "AL052026");
  const adv = (id) => D.nhc_advisories.find((a) => a.atcf_id === id) || null;
  const aF = adv("AL052026"), aK = adv("EP112026"), aL = adv("EP122026");
  const ep95 = D.outlook.find((o) => o.id === "EP95");
  /* THE GENESIS DETERMINATION, PRINTED. Not asserted here -- read off the manifest block that
     applied the archive's own rule to the operational record. If it ever flips to an archive
     genesis row, this line changes because the manifest changed, not because a page was edited. */
  const gd = (id) => D.genesis_determinations.find((g) => g.atcf_id === id) || null;
  const genesisNote = (id) => {
    const g = gd(id);
    if (!g || !g.operational_record) return "Atlas genesis: <b>NO OPERATIONAL RECORD</b>.";
    return `Atlas genesis <b>${g.present_in_archive_pack ? "ARCHIVE ROW" : "NONE"}</b> — `
      + `${g.present_in_archive_pack ? "in" : "absent from"} the pack.`;
  };
  const z = (t) => (t ? String(t).slice(5, 16).replace("T", " ") + "Z" : "—");
  const deck = (S) => S ? `<b>${S.latest.kt} kt</b>, ${S.fix_count} fixes to ${z(S.latest_valid_time)}`
    : "unavailable";
  const line = (a) => a ? `NHC <b>${esc(a.cls_label)}</b> ${a.lat}N ${Math.abs(a.lon)}W, `
    + `<b>${a.wind_kt} kt / ${a.mslp_mb} mb</b>; adv ${esc(a.advisory)} ${z(a.advisory_time_utc)}.`
    : "No NHC advisory in this ingest.";
  return {
    "97L": {
      name: "TD Five (AL052026) — declared as Invest 97L", basin: "NORTH ATLANTIC / GULF",
      pre: true, pointType: "PRE-GENESIS REFERENCE CELL", point: "28.0N 88.7W",
      live: `${line(aF)}${aF && aF.watches_highest ? ` <b>${esc(aF.watches_highest)}</b> `
        + `in effect.` : ""} <b>Query cell ≠ this centre.</b>`,
      feed: `b-deck <b>AL052026</b> ${deck(F)}. ${genesisNote("AL052026")}`,
    },
    KARINA: {
      name: "Hurricane Karina", basin: "EAST PACIFIC",
      pre: false, pointType: "DECLARED GENESIS POINT · NOT ATLAS-OBSERVED", point: "13.2N 115.0W",
      live: `${line(aK)} No land in the package.`,
      feed: `b-deck <b>EP112026</b> ${deck(K)}. ${genesisNote("EP112026")}`,
    },
    "95E": {
      name: "Invest 95E", basin: "EAST PACIFIC",
      pre: true, pointType: "PRE-GENESIS REFERENCE CELL", point: "12.0N 107.5W",
      live: `Broad low offshore of SW Mexico; no ATCF id, no advisory. `
        + `<b>Pre-genesis: no formation point to query.</b>`,
      feed: `GTWO <b>${esc(ep95 ? ep95.id : "EP95")}</b> ${ep95 ? ep95.pct48 : "—"}% / `
        + `${ep95 ? ep95.pct7d : "—"}% (48 h / 7 d), issued ${esc(ep95 ? ep95.issued : "—")}. No `
        + `b-deck. <b>NHC's number; never multiplied by an Atlas row.</b>`,
    },
    LOWELL: {
      name: "TS Lowell", basin: "EAST PACIFIC / CENTRAL PACIFIC",
      pre: false, pointType: "DECLARED GENESIS POINT · NOT ATLAS-OBSERVED", point: "11.3N 133.8W",
      live: `${line(aL)} Far from land.`,
      feed: `b-deck <b>EP122026</b> ${deck(L)}. ${genesisNote("EP122026")}`,
    },
  };
}

/** OPERATIONAL FORMATION, WITH ITS SOURCE ON IT.
 *
 * Two facts, both real and both attributable: NHC/ATCF has classified the system, and the
 * operational record carries a first fix at tropical status. A page may print either. What it may
 * not do is call the result an Atlas OBSERVED GENESIS point or run a cohort from it -- the engine
 * does not accept the operational layer as a genesis source, and the manifest's genesis
 * determination is where that is settled. Both halves are read off the manifest, never typed. */
function opFormation(D, atcfId) {
  const g = (D.genesis_determinations || []).find((x) => x.atcf_id === atcfId);
  const a = (D.nhc_advisories || []).find((x) => x.atcf_id === atcfId);
  const bits = [];
  if (a) bits.push(`NHC/ATCF classifies <b>${esc(a.cls_label)} ${esc(a.name)}</b> (${esc(atcfId)})`);
  const f = g && g.first_tropical_fix_in_operational_record;
  if (f) {
    bits.push(`the operational record's first tropical-status fix is <b>${esc(f.t)}</b>, `
      + `<b>${f.lat}N ${Math.abs(f.lon)}W</b>, ${esc(f.stage)} ${f.kt} kt`);
  }
  return bits.length ? `${bits.join("; ")}.` : "No operational record in this ingest.";
}

/** The published question, spelled out with its declared radius and window. This is the thing a
 *  counterparty replays; it is printed in full on every page that publishes a rate from it. */
function questionBlock(sys, { conditional = false } = {}) {
  const c = sys.coordinates_queried;
  const q = conditional
    ? `If a tropical cyclone were to form within <b>${sys.radius_km} km</b> of `
      + `<b>${coord(c.lat, c.lon)}</b> — the declared pre-genesis reference cell — in `
      + `<b>${esc(sys.month_window)}</b>, in seasons from <b>${sys.season_floor}</b> onwards, `
      + `what historically happened to storms that formed there?`
    : `Storms that formed within <b>${sys.radius_km} km</b> of <b>${coord(c.lat, c.lon)}</b> — `
      + `the declared genesis point — in <b>${esc(sys.month_window)}</b>, in seasons from `
      + `<b>${sys.season_floor}</b> onwards: what happened next?`;
  return `<div class="box sunken">
    <h3>THE PUBLISHED QUESTION</h3>
    <p style="font-size:var(--t-body);line-height:1.32">${q}</p>
    <p style="margin-top:3px">${cohortLine(sys)}
      <span class="chip">${esc(sys.point_type)}</span></p>
    ${conditional ? `<p class="disclaim" style="margin-top:2px"><b>Conditional on formation.</b>
      <b>No unconditional number is computed here</b>; the composition rule is in the footer.</p>`
    : ""}
  </div>`;
}

function groupsFor(sys, { landfall = true } = {}) {
  const g = [{ label: "INTENSITY THRESHOLDS — genesis-conditioned · reached TD is definitional", rows: sys.intensity_rows }];
  if (landfall) g.push({ label: "LANDFALL CONTRACT ROWS — the regions this archive actually scores", rows: sys.landfall_rows });
  return g;
}

/* unscoreableBlock() and gapsBlock() stood here. Both printed the same refusal content as
   unscoreableNote(), one as a bulleted box and one as a coverage note, and the type-gate pass
   left room for exactly one form of it: the compact note, which reads at table width.
   scripts/lib/collateral-cuts.mjs records the removals against the pages that carried them. */

function timingRows(sys, keys) {
  const t = sys.time_to_event;
  const rows = keys.map(([k, label]) => {
    const d = t[k];
    if (!d || !d.n) return null;
    return `<tr><td>${esc(label)}</td><td class="frac">n = ${d.n}</td>`
      + `<td class="rate">${hrs(d.median)}</td><td class="ci">${hrs(d.p25)} – ${hrs(d.p75)}</td>`
      + `<td class="ci">${hrs(d.p10)} – ${hrs(d.p90)}</td></tr>`;
  }).filter(Boolean);
  if (!rows.length) return "";
  return `<table class="ledger"><caption>TIME TO EVENT — hours from genesis, historical transit only</caption>
    <thead><tr><th>Event</th><th>n</th><th>Median</th><th>p25 – p75</th><th>p10 – p90</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
}

/* ============================ A — ACTIVE SYSTEMS OVERVIEW ================================ */
/* ONE TABLE, NOT TWO. An earlier cut carried a live strip and a per-system table, and both
   listed the same four systems -- the reader met each one twice and the page ran to two sheets.
   The brief asks for one row per system carrying name, basin, point type + coordinates, a
   timestamped live status, land/exposure relevance and the Atlas value-add, which is a single
   table. The LIVE column keeps its own red rule and its own instant so the timestamped half
   stays visibly separate from the evergreen half. */
export function artifactA(D, copy) {
  const C = makeCopy(copy, "A");
  const rows = liveRows(D);
  const bp = basinPlate(D, { width: 430, height: 114, renderWidth: 356 });
  const order = ["97L", "KARINA", "95E", "LOWELL"];
  const sysOf = { "97L": D.byId["97L"], KARINA: D.byId.KARINA, "95E": D.byId["95E"], LOWELL: D.byId.LOWELL };

  const table = `<table class="ledger sysgrid">
  <thead><tr>
    <th style="width:23%;text-align:left">System · point · coords</th>
    <th style="width:40%;text-align:left" class="livecol">Live status &amp; feeds, ${esc(LIVE_STAMP)}</th>
    <th style="width:37%;text-align:left">What the archive can answer</th>
  </tr></thead>
  <tbody>${order.map((k, i) => {
    const sy = sysOf[k];
    const r = rows[k];
    return `<tr class="${i % 2 ? "band" : ""}">
      <td class="lft"><b>${esc(sy.name)}</b>
        <span class="chip ${r.pre ? "pre" : "obs"}">${r.pre ? "PRE-GENESIS CELL" : "DECLARED · NOT ATLAS-OBSERVED"}</span>
        <span class="mono8">${coord(sy.coordinates_queried.lat, sy.coordinates_queried.lon)}</span>
        <span class="mono6">${esc(sy.basin_label)} · r ${sy.radius_km} km · ${esc(sy.month_window.replace("August–September", "Aug–Sep"))} · ${sy.season_floor}+</span></td>
      <td class="lft livecol"><div class="prose">${r.live}</div>
        <div class="feed">${r.feed}</div></td>
      <td class="lft"><span class="chip ${sy.cohort.sufficient ? "ok" : "refuse"}">${esc(sy.cohort.cohort_status)}</span>
        <span class="chip">N = ${sy.cohort.n_cases}</span>
        <div class="prose">${C.get(`atlas-value-${k}`)}</div></td></tr>`;
  }).join("")}</tbody></table>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT A · ACTIVE SYSTEMS OVERVIEW", sheet: "1 OF 1",
    title: "Four live systems, four declared points, what the record supports",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [
      ["LIVE STATUS", LIVE_STAMP],
      ["METHODOLOGY", D.pack.methodology_version],
      ["PACK", D.pack.archive_stamp],
    ],
  })}

${/* THE ANSWERS RAIL, UNROLLED INTO THE PAGE. Three stacked columns cost 102 px and restated
     what the sheet already shows: the live line is the table's own LIVE column, timestamped, and
     the commercial read now sits in a labelled box beside the refusal where a reader meets it in
     the scan order rather than above it. The hero plate and the four cite blocks are what that
     space buys. Cut content before shrinking type. */""}
<section class="sec sechd-tight">${sectionHead("01", "Active systems",
    "point type · live status (timestamped) · what the archive can answer")}
${table}
<p class="fn"><b>THE LIVE COLUMN IS NOT ATLAS OUTPUT. OPERATIONAL FORMATION, ATTRIBUTED:</b>
${opFormation(D, "AL052026")} NHC's classification and the ATCF record's own fix — not an Atlas
result. <b>ATLAS GENESIS:</b> the archive's rule is the first observed tropical-status fix <i>for a
storm the pack holds</i>; the engine does not accept the operational layer as a source, so no
cohort here is run from one.</p>
</section>

<section class="sec sechd-tight">${sectionHead("02", "The refusals, and the commercial read",
    "the refusal is the most valuable half")}
<div class="grid2">
  <div class="box refusal"><h3>WHAT THIS PACKAGE WILL NOT RETURN</h3>
    ${C.get("refusal-note")}
    <p style="margin-top:2px"><b>THE CONTRACT.</b> Six landfall regions, each an <b>any</b> and a
    <b>≥64 kt</b> pair. <b>No state-level landfall is scored.</b></p></div>
  <div class="box commercial"><h3>COMMERCIAL RELEVANCE — NOT MEASUREMENT</h3>
    <p>${C.answers.commercial || ""} <b>WHAT ATLAS ADDS:</b> ${C.answers.adds || ""}</p></div>
</div>
</section>

${/* THE COMPARISON STRIP THAT IS NOT HERE. Three rows, 173 px, on a page whose mandated scan
     order -- question, live status, core evidence, refusal, commercial relevance, replay URL --
     already needs every pixel at the type gate. The strip says what Storm Atlas adds over a
     public map; the answers rail at the head of this page says it in three sentences, and B, B1,
     B2, C and D all carry the full strip. Cut content before shrinking type. */""}<section class="sec sechd-tight">${sectionHead("03", "The camera, and the cohorts to cite",
    "four queried points · and the replay URL for each")}
<div class="platecol">
  <div>${plate({
    title: "NA + EP · FOUR QUERIED POINTS",
    meta: `plate carrée · archive coastline`,
    svg: bp.svg,
    legendItems: [LEGEND.cell, LEGEND.genesisCell, LEGEND.live],
    note: C.get("plate-note").replace(/^<p>|<\/p>$/g, ""),
  })}</div>
  ${/* ONE CITE BLOCK, FOUR COHORTS. A replay URL is 106 characters and wraps to two lines at any
       column width this page can give it, so four separately headed cite blocks spend their height
       on four repeated labels rather than on evidence. The label stands once, the published cite
       string prints in full for the cohort this page leads with, and every cohort keeps its own
       name beside its own URL. */""}
  <div class="cite">
    <span class="k">CITE THIS COHORT</span>
    <div class="citerows">${order.map((k) => `<div>
      <span class="nm">${esc(sysOf[k].name.toUpperCase())} · N = ${sysOf[k].cohort.n_cases}</span>
      <a class="u" href="${esc(sysOf[k].replay_url)}">${esc(sysOf[k].replay_url)}</a></div>`).join("")}
    </div>
    <p class="disclaim" style="margin-top:1px">Each URL reproduces its cohort's published citation
    string; all four are in the source manifest.</p>
  </div>
</div>
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — Active Systems Overview", body });
}

/* ============================ B — 97L GULF EVENT DOSSIER ================================= */
export function artifactB(D, copy) {
  const C = makeCopy(copy, "B");
  const s = D.byId["97L"];
  const s150 = D.byId["97L-r150"];
  const sAll = D.byId["97L-allmonths"];
  const rows = liveRows(D);
  const cp = cellPlate(D, "97L", {
    lon0: -99, lon1: -73, lat0: 20, lat1: 34.5, width: 460, height: 62, renderWidth: 354,
    liveAtcf: "AL052026", liveLabel: "LIVE TD FIVE", dLon: 5, dLat: 5, decimate: 1,
    cellAnchor: "start", cellDx: 8, cellDy: -18,
  });

  const sensRow = (sys, label) => `<tr><td>${esc(label)}</td>
    <td class="frac">${sys.cohort.n_cases}</td>
    <td class="cohortstat ${sys.cohort.sufficient ? "" : "refused"}">${esc(sys.cohort.cohort_status)}</td>
    <td class="ci">${sys.intensity_rows.find((r) => r.key === "cat1").rate === null ? "REFUSED"
      : pct(sys.intensity_rows.find((r) => r.key === "cat1").rate)}</td>
    <td class="ci">${sys.landfall_rows.find((r) => r.key === "conus:any").rate === null ? "REFUSED"
      : pct(sys.landfall_rows.find((r) => r.key === "conus:any").rate)}</td></tr>`;

  const p1 = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B · EVENT DOSSIER", sheet: "1 OF 2",
    title: "AL052026 (97L): genesis-conditioned outcomes, declared Gulf cell",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [
      ["LIVE STATUS", LIVE_STAMP],
      ["POINT TYPE", "PRE-GENESIS REFERENCE CELL"],
      ["CELL", "28.0°N 88.7°W · r 250 km"],
      ["PACK", D.pack.archive_stamp],
    ],
  })}

${/* THE ANSWERS RAIL THAT IS NOT HERE. 161 px of three columns on the first sheet of a two-sheet
     dossier whose live strip is directly below it, whose cell rationale is beside that, and whose
     commercial box fills a third of sheet 2. Cut content before shrinking type. */""}
<section class="sec sechd-tight">${sectionHead("01", "Live — status only, not Atlas output")}
${liveStrip(D, [rows["97L"]])}
</section>

<section class="sec sechd-tight">${sectionHead("02", "The cell, and why the query is not run at the centre")}
<div class="grid2">
  <div>${questionBlock(s, { conditional: true })}</div>
  <div>${C.get("cell-rationale")}</div>
</div>
</section>

<section class="sec sechd-tight">${sectionHead("03", "Outcome frequency panel", `exact n / N · 95% Wilson · N = ${s.cohort.n_cases} · ${s.cohort.cohort_status}`)}
${ledgerPair(s)}
<p class="fn">${C.get("reading-the-ledger").replace(/^<p>|<\/p>$/g, "")}</p>
${citeBlock(s)}
</section>

<section class="sec sechd-tight">${sectionHead("04", "The instrument's own sample boundary", "radius and window move the answer")}
<table class="ledger"><caption>RADIUS AND WINDOW SENSITIVITY — the same cell, three declared questions</caption>
<thead><tr><th>Declared question</th><th>N</th><th>Cohort status</th><th>reached Cat 1</th><th>CONUS — any</th></tr></thead>
<tbody>
${sensRow(s, "250 km · Aug–Sep · floor 1971  (published)")}
${sensRow(s150, "150 km · Aug–Sep · floor 1971")}
${sensRow(sAll, "250 km · all months · floor 1971")}
</tbody></table>
<p class="fn">${C.get("radius-sensitivity").replace(/^<p>|<\/p>$/g, "")}</p>
<div class="citelist two urls" style="margin-top:2px">
  <div class="cite"><span class="k">150 KM · N = ${s150.cohort.n_cases}</span><a class="u"
    href="${esc(s150.replay_url)}">${esc(s150.replay_url)}</a></div>
  <div class="cite"><span class="k">ALL MONTHS · N = ${sAll.cohort.n_cases}</span><a class="u"
    href="${esc(sAll.replay_url)}">${esc(sAll.replay_url)}</a></div>
</div>
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;

  const p2 = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B · EVENT DOSSIER", sheet: "2 OF 2",
    title: "Analog paths, members, and the commercial reading — kept apart from the numbers",
    sub: "",
    rule: [["COHORT", `N = ${s.cohort.n_cases} · ${s.cohort.cohort_status}`],
      ["CELL", "28.0°N 88.7°W · r 250 km · Aug–Sep · 1971+"],
      ["PACK", D.pack.archive_stamp]],
  })}

<div class="platecol">
  <section class="sec sechd-tight">${sectionHead("05", "Analog-track plate", "a drawn track is not a rate")}
  ${plate({
    title: `97L CELL · ALL ${s.cohort.n_cases} COHORT MEMBER TRACKS`,
    meta: `plate carrée · no forecast geometry`,
    svg: cp.svg,
    legendItems: [LEGEND.cohortTrack, LEGEND.majorTrack, LEGEND.liveTrack],
    note: C.get("analog-plate-note"),
  })}
  </section>
  <section class="sec sechd-tight">${sectionHead("06", "Seasonal timing", "historical transit, never a lead time")}
  ${timingRows(s, [["ts", "genesis → tropical storm (34 kt)"], ["cat1", "genesis → hurricane (64 kt)"],
    ["cat3", "genesis → major (96 kt)"], ["landfall_conus", "genesis → CONUS crossing"]])}
  <p class="fn">${C.get("seasonal-timing").replace(/^<p>|<\/p>$/g, "")}</p>
  </section>
</div>

<section class="sec sechd-tight">${sectionHead("07", "Representative cohort members",
    "majors first, then hurricanes, peak descending · a selection, never a ranking")}
${repCardRow(s, { limit: 4 })}
</section>

<section class="sec sechd-tight">${sectionHead("08", "Commercial reading, and what is not here",
    "labelled boxes · never mixed into the rates")}
<div class="grid2">
  <div class="box commercial"><h3>COMMERCIAL RELEVANCE — INTERPRETATION, NOT MEASUREMENT</h3>
    ${C.get("commercial")}</div>
  <div class="box hole"><h3>THE HOLES, PRESERVED</h3>${C.get("hole")}</div>
</div>
<div style="margin-top:4px">${unscoreableNote(s)}</div>
</section>

<section class="sec sechd-tight">${sectionHead("09", "What Storm Atlas adds")}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;

  return page({ title: "Storm Atlas — Invest 97L Gulf Event Dossier", body: p1 + p2 });
}

/* ============================ B1 — REINSURANCE / ILS / PARAMETRIC ======================== */
export function artifactB1(D, copy) {
  const C = makeCopy(copy, "B1");
  const s = D.byId["97L"];
  const s150 = D.byId["97L-r150"];
  const conusAny = s.landfall_rows.find((r) => r.key === "conus:any");
  const conusHur = s.landfall_rows.find((r) => r.key === "conus:hurricane");

  /* The CONUS pair a cat underwriter reaches for first, restated in the section head rather than
     as tiles: the ledger below carries the same two rows and duplicating them cost a third of
     the page. `conusAny` / `conusHur` are the manifest rows, not a re-derivation. */
  const headline = `CONUS any ${conusAny.count}/${conusAny.n_storms} ${pct(conusAny.rate)} `
    + `[${ci(conusAny.ci95)}] · CONUS ≥64 kt ${conusHur.count}/${conusHur.n_storms} `
    + `${pct(conusHur.rate)} [${ci(conusHur.ci95)}] · no state-level row exists`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B1 · REINSURANCE / ILS / PARAMETRIC", sheet: "1 OF 1",
    title: "Contract-row frequencies, trigger explainability, basis risk",
    sub: `<b>THE PUBLISHED QUESTION, CONDITIONAL ON FORMATION.</b> If a cyclone were to form `
      + `within <b>250 km</b> of <b>28.0°N 88.7°W</b> — the declared pre-genesis reference cell — `
      + `in <b>August or September</b>, in seasons from <b>1971</b> onwards, what happened to `
      + `storms that formed there? <b>${esc(s.cohort.cohort_status)}</b>, N = ${s.cohort.n_cases}, `
      + `ESS ${s.cohort.effective_sample_size}, min ${s.cohort.min_sample}.`,
    rule: [["LIVE STATUS", LIVE_STAMP], ["CELL", "28.0°N 88.7°W · r 250 km · Aug–Sep · 1971+"],
      ["PACK", D.pack.archive_stamp]],
  })}

${/* THE QUESTION BOX, FOLDED INTO THE MASTHEAD. It stood as its own sunken panel and cost 104 px;
     the masthead sub-line carries the same sentence for 40, and the composition rule it closed
     with is printed verbatim in this page's footer. Cut content before shrinking type. */""}
<p class="fn"><b>IT SAYS NOTHING ABOUT WHETHER THE SYSTEM FORMS.</b> An unconditional intensity
probability would require an external formation probability on the <b>same formation event and
conditioning set</b>; none is computed here, and an NHC outlook probability is not multiplied by
these rows unless the conditioning events are demonstrably aligned. <b>LIVE,
${esc(LIVE_STAMP)}:</b> ${C.answers.now || ""}</p>

${/* THE ANSWERS RAIL THAT IS NOT HERE. 133 px of three columns — what is happening now, what
     Storm Atlas adds, how it helps — on a page that already opens with the published question in
     full and closes with the basis-risk box and two replay URLs. The live line it carried now
     sits under the question box in one sentence. Cut content before shrinking type. */""}
<section class="sec sechd-tight">${sectionHead("01", "Contract-row frequencies", headline)}
${ledgerPair(s)}
</section>

<section class="sec">${sectionHead("02", "Trigger explainability, refusal, near misses")}
<div class="grid3 tight lastwide">
  <div class="box"><h3>WHY A REPLAYABLE COHORT IS THE ARTEFACT</h3>${C.get("trigger-explainability")}
    ${C.get("how-used")}</div>
  <div class="box refusal"><h3>THE REFUSAL A COUNTERPARTY CAN CHECK</h3>
    <p>Tighten the same question from 250 km to <b>150 km</b> and the cohort falls to
    <b>N = ${s150.cohort.n_cases}</b>. Every rate then <b>REFUSES</b>: the engine returns
    “${esc(s150.intensity_rows[0].refused_reason)}” on every row. Counts still publish — CONUS any
    ${s150.landfall_rows.find((r) => r.key === "conus:any").count} of ${s150.cohort.n_cases} —
    because a count is a fact and a rate over ${s150.cohort.n_cases} storms is not. That refusal
    has its own replay URL below.</p></div>
  <div class="box commercial"><h3>BASIS RISK — READ BEFORE USING ANY ROW ABOVE</h3>${C.get("basis-risk")}</div>
</div>
<p class="fn">${C.get("near-miss").replace(/^<p>|<\/p>$/g, "")}</p>
</section>

${/* THE MEMBER-CARD ROW THAT IS NOT HERE. Eight cards, cut to four, then cut: 135 px naming
     members the near-miss list below already names with the facts that matter to a trigger —
     distance from the cell, landfall region and intensity. The full member set is in the source
     manifest and behind the replay URL. Cut content before shrinking type. */""}
${/* THE SIDE-BY-SIDE THAT IS NOT HERE. The comparison strip used to run in a narrow column beside
     the two cite blocks and cost 440 px, because a five-column table squeezed to 40% of the page
     wraps every cell. Full width it is 132 px and reads better. Cut content before shrinking
     type. */""}
<section class="sec sechd-tight">${sectionHead("03", "What Storm Atlas adds, and the cohorts to cite")}
${comparisonStrip({ compact: true })}
<div class="citelist two">${citeBlock(s)}${citeBlock(s150, { label: "CITE THE REFUSAL — 150 KM" })}</div>
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — 97L for Reinsurance / ILS / Parametric", body });
}

/* ============================ B2 — ENERGY / WEATHER TRADING ============================== */
export function artifactB2(D, copy) {
  const C = makeCopy(copy, "B2");
  const s = D.byId["97L"];
  const cp = cellPlate(D, "97L", {
    lon0: -98, lon1: -74, lat0: 19.5, lat1: 34, width: 400, height: 150, renderWidth: 354,
    liveAtcf: "AL052026", liveLabel: "LIVE TD FIVE", dLon: 5, dLat: 5, decimate: 1,
    cellAnchor: "start", cellDx: 8, cellDy: -20,
  });
  const band = (key, label) => {
    const r = [...s.intensity_rows, ...s.landfall_rows].find((x) => x.key === key);
    return `<tr><td>${esc(label)}</td><td class="frac">${r.count} / ${r.n_storms}</td>
      <td class="rate">${pct(r.rate)}</td><td class="ci">${ci(r.ci95)}</td>
      <td class="status ${r.status ? "gate" : "none"}">${r.status ? esc(r.status) : "—"}</td></tr>`;
  };

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B2 · ENERGY / WEATHER TRADING", sheet: "1 OF 1",
    title: "Gulf genesis cohort: contract-row frequency bands, and analog paths as geography",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [["LIVE STATUS", LIVE_STAMP], ["CELL", "28.0°N 88.7°W · r 250 km · Aug–Sep · 1971+"],
      ["PACK", D.pack.archive_stamp]],
  })}

${answersRail(C.answers.now || "", C.answers.adds || "", C.answers.commercial || "")}

<section class="sec">${sectionHead("01", "Analog paths, and the only scored rows",
    "geometry on the left · contract rows on the right · neither is a state probability")}
<div class="platecol">
<div>
${plate({
    title: "GULF CELL · COHORT MEMBER TRACKS",
    meta: `plate carrée · drawn geometry, not a rate`,
    svg: cp.svg,
    legendItems: [LEGEND.cohortTrack, LEGEND.majorTrack, LEGEND.cell, LEGEND.liveTrack],
    note: `<b>Where ${s.cohort.n_cases} historical storms went.</b> Not a probability surface,
      not a forecast, not a state-level rate.`,
  })}
</div>
<div>
<table class="ledger"><caption>THE ONLY SCORED ROWS ON THIS PAGE</caption>
<thead><tr><th>Contract row</th><th>n / N</th><th>Rate</th><th>95% Wilson</th><th style="text-align:left">Status</th></tr></thead>
<tbody>
${band("ts", "reached tropical storm (34 kt)")}
${band("cat1", "reached hurricane (64 kt)")}
${band("cat3", "reached major (96 kt)")}
${band("conus:any", "CONUS landfall — any")}
${band("conus:hurricane", "CONUS landfall — ≥64 kt")}
</tbody></table>
<p class="fn">${C.get("frequency-bands").replace(/^<p>|<\/p>$/g, "")}</p>
${citeBlock(s)}
</div>
</div>
</section>

<section class="sec">${sectionHead("02", "Geography, exposure and the refusals",
    "adjacency, never impact")}
<div class="grid3 tight">
  <div class="box refusal"><h3>READ THIS BEFORE THE PLATE</h3>${C.get("geography-not-probability")}</div>
  <div class="box commercial"><h3>EXPOSURE CLASSES ADJACENT TO THIS COHORT</h3>${C.get("exposure-map")}</div>
  <div class="box refusal"><h3>WHAT THIS PAGE IS NOT</h3>${C.get("not-this")}</div>
</div>
</section>

<section class="sec">${sectionHead("03", "What Storm Atlas adds")}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — 97L for Energy / Weather Trading", body });
}

/* ============================ C — KARINA ANALOG BRIEF ==================================== */
/* ONE SHEET, AND WHAT THAT COSTS. This page carries a live observation, a nineteen-row contract
   ledger, an analog plate, eight cohort cards, the refusals and the comparison strip. At a
   legible print size that is more than a Letter page holds in a single column, so the middle
   band runs three across -- plate, intensity contracts, landfall contracts -- and the published
   question moves into the masthead rather than taking a block of its own. Nothing is dropped:
   every contract row, every stamp and every interval the engine returned is on the sheet. */
export function artifactC(D, copy) {
  const C = makeCopy(copy, "C");
  const s = D.byId.KARINA;
  const rows = liveRows(D);
  const K = D.operational.storms.find((x) => x.atcf_id === "EP112026");
  const aK = D.nhc_advisories.find((a) => a.atcf_id === "EP112026") || null;
  const cp = cellPlate(D, "KARINA", {
    lon0: -137, lon1: -94, lat0: 6, lat1: 30, width: 300, height: 100, renderWidth: 265,
    liveAtcf: "EP112026", dLon: 10, dLat: 10, decimate: 3,
    cellAnchor: "end", cellDx: -6, cellDy: 22,
  });
  const th = (k) => s.intensity_rows.find((r) => r.key === k);

  const liveTiles = `<div class="tiles grid3">
    <div class="tile"><span class="k">LIVE — NHC ADVISORY</span><div class="v">${aK ? aK.wind_kt : "—"} <small>KT / ${aK ? aK.mslp_mb : "—"} MB</small></div>
      <span class="s">${aK ? `${aK.lat}°N ${Math.abs(aK.lon)}°W · ${esc(aK.cls_label)} · adv ${esc(aK.advisory)} ${esc(aK.advisory_time_utc)}` : "no advisory in this ingest"}</span></div>
    <div class="tile"><span class="k">LIVE — ARCHIVE b-DECK</span><div class="v">${K ? K.latest.kt : "—"} <small>KT / ${K ? K.latest.mslp : "—"} MB</small></div>
      <span class="s">${K ? `${K.latest.lat}°N ${Math.abs(K.latest.lon)}°W · fix valid ${esc(K.latest_valid_time)}` : ""}</span></div>

    <div class="tile"><span class="k">COHORT — REACHED CAT 4</span><div class="v">${th("cat4").count} / ${th("cat4").n_storms}</div>
      <span class="s">${pct(th("cat4").rate)} · 95% Wilson ${ci(th("cat4").ci95)}</span></div>
  </div>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT C · MAJOR-HURRICANE ANALOG BRIEF", sheet: "1 OF 1",
    title: "Hurricane Karina, beside her declared genesis cohort",
    sub: `Outcomes for the point this cohort is keyed to — declared, not an archive row. `
      + `<b>${esc(s.cohort.cohort_status)}</b>, N = ${s.cohort.n_cases}, ESS `
      + `${s.cohort.effective_sample_size}, min sample ${s.cohort.min_sample}.`,
    rule: [["LIVE STATUS", LIVE_STAMP], ["POINT TYPE", "DECLARED GENESIS POINT · NOT ATLAS-OBSERVED"],
      ["GENESIS", "13.2°N 115.0°W · r 250 km · Aug–Sep · 1971+"], ["PACK", D.pack.archive_stamp]],
  })}

${/* THE ANSWERS RAIL THAT IS NOT HERE. Three columns, 130 px: what is happening now, what Storm
     Atlas adds, how it helps. On this page the live tiles below already carry the first and the
     SO WHAT box carries the third, and at the type gate the page could keep the rail or keep the
     cohort's own evidence. Cut content before shrinking type. */""}
<section class="sec">
${liveTiles}
<p class="fn"><b>NOT ATLAS OUTPUT.</b> ${rows.KARINA.live} ${rows.KARINA.feed}
<b>No cohort, no analog and no rate comes from it.</b></p>
</section>

<section class="sec">${sectionHead("01", "Plate and outcome frequency panel",
    `exact n / N · 95% Wilson · a drawn track is not a rate`)}
<div class="triband">
  ${plate({
    title: `GENESIS 13.2°N 115.0°W · ${s.cohort.n_cases} MEMBER TRACKS + LIVE b-DECK`,
    meta: `plate carrée`,
    svg: cp.svg,
    legendItems: [LEGEND.cohortTrack, LEGEND.majorTrack, LEGEND.genesisCell, LEGEND.liveTrack],
  })}
  <div>${ledger([{ label: "INTENSITY — assumes formation · TD is definitional", rows: s.intensity_rows }],
    { showBar: false, compact: true })}</div>
  <div>${ledger([{ label: "LANDFALL CONTRACT ROWS", rows: s.landfall_rows }],
    { showBar: false, compact: true })}</div>
</div>
<p class="fn">The red track is Karina's operational b-deck: <b>not</b> a cohort member, in no rate,
and no cone is drawn. Every landfall row is published even at zero or stamped.</p>
</section>

${/* THE MEMBER-CARD ROW THAT IS NOT HERE. Eight cards naming cohort members with their genesis
     date, peak, class and recorded landfalls, cut to five and then cut entirely: 163 px on a page
     whose live tiles, nineteen contract rows, refusal table and replay block already fill it at
     the type gate. The members are not lost -- the replay URL below reopens the cohort and names
     every one of the ${s.cohort.n_cases}, and the source manifest prints the representative set in
     full. B keeps its card row, because on B the members ARE the argument. Cut content before
     shrinking type. */""}

${/* THE COVERAGE-GAPS BLOCK THAT IS NOT HERE, AND THE RARITY BOX WITH IT. Section 04 ran three
     columns deep -- live-vs-history, rarity, land rows, so-what, the unscoreable table and the
     gaps note -- and cost 502 px of a 980 px page at the type gate. The refusal is the part the
     brief calls load-bearing, so the unscoreable table keeps its own full-width band where its
     twelve rows read at table width; the rarity statement folds into the live-vs-history box it
     restates, and the coverage-gaps note lives in the source manifest. Cut content before
     shrinking type. */""}
<section class="sec">${sectionHead("02", "Reading the live storm, and the refusals")}
<div class="grid2">
  <div class="box"><h3>THE LIVE OBSERVATION BESIDE THE HISTORICAL FREQUENCIES</h3>${C.get("live-vs-history")}</div>
  <div class="box commercial"><h3>SO WHAT — RESEARCH USE, NOT THREAT MONITORING</h3>${C.get("so-what")}
    ${C.get("land-rows")}
    <p style="margin-top:2px"><b>WHAT ATLAS ADDS.</b> A public map gives position, P(forms) and a
    cone; Atlas gives exact n / N with a 95% Wilson interval on every contract row, a visible
    refusal, and a URL that reproduces both.</p></div>
</div>
${unscoreableNote(s)}
</section>

${/* THE COMPARISON STRIP THAT IS NOT HERE. Three rows, 147 px with its heading, saying what
     Storm Atlas adds over a public map. This page's argument is a live major hurricane beside its
     own cohort, and at the type gate the strip and the member cards would not both fit; B, B1, B2
     and D all carry the strip in full. Cut content before shrinking type. */""}
${citeBlock(s)}

<div class="spacer"></div>
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — Karina Major-Hurricane Analog Brief", body });
}

/* ============================ D — TEAR SHEET ============================================= */
export function artifactD(D, copy) {
  const C = makeCopy(copy, "D");
  const g = D.byId["97L"];
  const k = D.byId.KARINA;
  const l = D.byId.LOWELL;
  const pick = (sys, key) => [...sys.intensity_rows, ...sys.landfall_rows].find((r) => r.key === key);

  const sample = (sys, keys, title) => `<div class="box"><h3>${esc(title)}</h3>
    <p class="disclaim" style="margin-bottom:3px">${esc(sys.question)}</p>
    <table class="ledger compact"><thead><tr><th>Row</th><th>n / N</th><th>Rate</th><th>95% Wilson</th>
      <th style="text-align:left">Status returned</th></tr></thead><tbody>
    ${keys.map(([kk, label]) => { const r = pick(sys, kk); return `<tr><td>${esc(label)}</td>
      <td class="frac">${r.count} / ${r.n_storms}</td>
      <td class="rate ${r.rate === null ? "refused" : ""}">${r.rate === null ? "REFUSED" : pct(r.rate)}</td>
      <td class="ci">${ci(r.ci95)}</td>
      <td class="status ${r.status ? (r.status === "RATE REFUSED" ? "refused" : "gate") : "none"}">${r.status ? esc(r.status) : "—"}</td></tr>`; }).join("")}
    </tbody></table>
    <div class="cite" style="margin-top:3px"><span class="k">CITE THIS COHORT</span><a class="u"
      style="margin-top:0" href="${esc(sys.replay_url)}">${esc(sys.replay_url)}</a></div></div>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT D · TEAR SHEET", sheet: "1 OF 1",
    title: "Storm Atlas",
    sub: C.get("one-sentence").replace(/^<p>|<\/p>$/g, ""),
    rule: [["METHODOLOGY", D.pack.methodology_version], ["PACK", D.pack.archive_stamp]],
  })}

<section class="sec">${sectionHead("01", "What a user can do")}
<div class="grid2">
  <div class="box">${C.get("users-can")}</div>
  <div class="box sunken"><h3>THE MOAT — SANITATION, REFUSAL, PROVENANCE</h3>${C.get("moat")}</div>
</div>
</section>

${/* THE COLOPHON THAT IS NOT HERE. A five-row table naming each archive table and what it holds,
     plus its provenance paragraph, cost 182 px. Every count in it -- storms, track points,
     landfall rows, environment records -- is printed in this page's own footer alongside the
     methodology version, the pack hash, the build time and the sources, and the full table
     descriptions are in the source manifest. Cut content before shrinking type. */""}
<section class="sec">${sectionHead("02", "Three worked samples", "every figure replayable")}
<div class="lede">${C.get("sample-note")}</div>
<div class="grid3 tight">
${sample(g, [["ts", "reached TS"], ["cat3", "reached Cat 3"],
    ["conus:any", "CONUS — any"], ["conus:hurricane", "CONUS — ≥64 kt"]],
  "SAMPLE 1 — GULF CELL, PRE-GENESIS")}
${sample(k, [["cat3", "reached Cat 3 (major)"], ["cat4", "reached Cat 4"],
    ["cat5", "reached Cat 5"], ["mexico:any", "MEXICO — any"]],
  "SAMPLE 2 — KARINA, DECLARED · NOT ATLAS-OBSERVED")}
<div class="box refusal"><h3>SAMPLE 3 — THE REFUSAL</h3>
  <p class="disclaim" style="margin-bottom:6px">${esc(l.question)}</p>
  <p><b>N = ${l.cohort.n_cases}</b>. ${esc(l.cohort.cohort_status)}. The engine returns
  “${esc(l.intensity_rows[0].refused_reason)}” on every row. Counts are still published — TS
  ${l.intensity_rows.find((r) => r.key === "ts").count} of ${l.cohort.n_cases}, Cat 3
  ${l.intensity_rows.find((r) => r.key === "cat3").count} of ${l.cohort.n_cases} — because a
  count is a fact and a rate over six storms is not one.</p>
  <div class="cite" style="margin-top:3px"><span class="k">CITE THIS COHORT</span><a class="u"
    style="margin-top:0" href="${esc(l.replay_url)}">${esc(l.replay_url)}</a></div></div>
</div>
</section>

<section class="sec">${sectionHead("03", "Delivery, and what Storm Atlas adds")}
<div class="grid2">
  <div class="box"><h3>CURRENT — SHIPPING TODAY</h3>${C.get("delivery")}</div>
  <div class="box hole"><h3>PROPOSED / PILOT — NOT SHIPPING</h3>${C.get("pilot")}</div>
</div>
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — Tear Sheet", body });
}


/* ============================ SOURCE MANIFEST (print-ready) ============================== */
/* The evidence gate as a document. Everything the six artifacts publish is here with its
   provenance: point type, coordinates, radius, season window, cohort N, every contract row with
   its exact n/N, interval and returned status, the refusals, the gaps, the representative
   members, the CITE THIS COHORT string and the replay URL. If a figure appears on an artifact
   and not here, the artifact is wrong. */
/* ============ E — DISCRETE EVENT-CONTRACT EVIDENCE ======================================== */
/* WHAT THIS PAGE IS, AND THE ONE THING IT MUST NOT BECOME.
 *
 * It is a proof of utility for one prospect, and the proof is a BOUNDARY: here is the historical
 * evidence Storm Atlas can support from a declared genesis condition, and here -- named, itemised
 * and refused -- is where that evidence stops short of the trigger a structurer would actually
 * have to price. It is not an energy page, not a forecast, not a pricing model, and not a claim
 * that Atlas scores anybody's contract.
 *
 * THE TRIGGER LOCK. Atlas landfall and Discrete's trigger are different objects, and the page
 * exists to say so. Atlas publishes a lifetime intensity ladder (did the storm ever reach Cat 4?)
 * and a landfall contract with exactly two intensity forms per region (`any`, and `>=64 kt`).
 * Discrete's published trigger is a single JOINT event -- NHC-determined centre crossing of the
 * contiguous-US coastline, at Cat 4+ AS DETERMINED AT LANDFALL -- with Gulf-only and Florida-only
 * variants. There is no vetted Atlas row for that conjunction, and this file does not make one:
 *   1. the joint row is printed as EXACT TRIGGER NOT SCORED and left uncomputed;
 *   2. no marginal is multiplied by another, and CONUS >=64 kt is never offered as a stand-in;
 *   3. no sub-CONUS rate is fabricated -- a member's Texas or Florida crossing stays a fact about
 *      that named storm, which is the only form the archive holds it in.
 *
 * The cohort is the already-validated pre-genesis reference cell. It is NOT moved to AL052026's
 * operational tropical fix, and nothing here implies the cell is where Five formed.
 */
export function artifactE(D, copy) {
  const C = makeCopy(copy, "E");
  const s = D.byId["97L"];
  const rows = liveRows(D);
  const pick = (k) => [...s.intensity_rows, ...s.landfall_rows].find((r) => r.key === k);
  /* The six rows the brief asks for, in the archive's own order, straight off the manifest. */
  const shown = [["cat1", "reached Cat 1 (64 kt)"], ["cat3", "reached Cat 3 (96 kt)"],
    ["cat4", "reached Cat 4 (113 kt)"], ["cat5", "reached Cat 5 (137 kt)"],
    ["conus:any", "CONUS landfall — any intensity"], ["conus:hurricane", "CONUS landfall — ≥64 kt"]]
    .map(([k, label]) => ({ ...pick(k), label }));

  /* THE EVIDENCE BRIDGE. The intellectual centre of the page: what the contract needs in the left
     column, what the archive actually holds in the middle, and the archive's own verdict on the
     distance between them on the right. Every STATUS here is a refusal, not a result. */
  const BRIDGE = [
    ["Cat 4+ <b>at</b> CONUS landfall — one joint event",
      "two separate rows: <b>reached Cat 4</b> and <b>CONUS landfall</b>. No row exists for "
      + "their conjunction.",
      "EXACT TRIGGER NOT SCORED", "no"],
    ["Intensity determined <b>at the crossing</b>, 130 mph",
      "the ladder is <b>lifetime peak attainment</b>; the landfall contract has two intensity "
      + "forms, <b>any</b> and <b>≥64 kt</b>.",
      "NO ≥113 kt LANDFALL ROW", "no"],
    ["Landfall and its category determined by <b>NHC</b>",
      "Atlas modelled landfall geometry — <b>hurdat2_L_record</b>, <b>bracketing_fix</b> or "
      + "<b>segment_crossing</b>.",
      "DIFFERENT CONTRACT DEFINITION", "no"],
    ["Gulf Coast-only and Florida-only regions",
      "<b>CONUS scored as one region.</b> No sub-CONUS row at any radius or sample size.",
      "NO VETTED SUB-CONUS ROW", "no"],
    ["Which storms did this before, and where they went",
      "the named <b>${N}-member</b> cohort, each member's recorded crossings, and the tracks.",
      "SUPPORTED AS HISTORY, NOT A RATE", "yes"],
  ];

  const bridge = `<table class="ledger bridge"><thead><tr>
    <th style="width:29%;text-align:left">Discrete needs</th>
    <th style="width:48%;text-align:left">Atlas currently supports</th>
    <th style="width:23%;text-align:left">Status</th>
  </tr></thead><tbody>${BRIDGE.map(([need, has, status, ok], i) => `<tr class="${i % 2 ? "band" : ""}">
    <td class="lft">${need}</td>
    <td class="lft">${has.replace("${N}", String(s.cohort.n_cases))}</td>
    <td class="status ${ok === "yes" ? "gate" : "refused"}">${esc(status)}</td></tr>`).join("")}
  </tbody></table>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT E · DISCRETE EVENT-CONTRACT EVIDENCE", sheet: "1 OF 1",
    title: "A published Cat 4+ CONUS landfall trigger — and where the archive stops",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [["LIVE STATUS", LIVE_STAMP], ["POINT TYPE", "PRE-GENESIS REFERENCE CELL"],
      ["PACK", D.pack.archive_stamp]],
  })}

<section class="sec sechd-tight">${sectionHead("01", "The contract question, and the declared cohort")}
<div class="box"><h3>DISCRETE — PUBLIC TERMS, AS PUBLISHED · VERIFIED 31 AUG 2026</h3>
  ${C.get("discrete-terms")}</div>
<div class="grid2" style="margin-top:3px">
  <div class="box refusal"><h3>LIVE STATUS, AND WHAT IT IS NOT</h3>
    <p>${opFormation(D, "AL052026")}</p>
    <p style="margin-top:2px"><b>NOT ATLAS GENESIS.</b> The pack does not hold AL052026 and does
    not accept the operational layer as a genesis source. The cohort beside remains the declared
    <b>PRE-GENESIS REFERENCE CELL</b> at <b>28.0°N 88.7°W</b> — <b>not where Five formed</b>, and
    not moved to Five's fix.</p></div>
  <div>${ledger([{ rows: shown }], { showBar: false, compact: true,
    caption: `DECLARED COHORT · 28.0°N 88.7°W · r 250 km · Aug–Sep · 1971+ · `
      + `${s.cohort.cohort_status} · N = ${s.cohort.n_cases} · ESS ${s.cohort.effective_sample_size}` })}</div>
</div>
<p class="fn">${C.get("cohort-note").replace(/^<p>|<\/p>$/g, "")}</p>
</section>

<section class="sec sechd-tight">${sectionHead("02", "Evidence bridge, evidence gap",
    "the centre of this page · every status on the right is a refusal")}
${bridge}

<p class="fn">${C.get("history-note").replace(/^<p>|<\/p>$/g, "")}</p>
</section>

<section class="sec sechd-tight">${sectionHead("03", "The three holes, and what a desk could do with this")}
<div class="box refusal"><h3>THE THREE HOLES, NAMED</h3>
  <p><b>1 · EXACT TRIGGER NOT SCORED.</b> No vetted Atlas row exists for <b>Cat 4+ at CONUS
  landfall</b>; none was created here.</p>
  <p><b>2 · NO MARGINAL MULTIPLICATION.</b> The joint trigger is <b>not</b> estimated as
  reached-Cat-4 × CONUS-landfall — two marginals on one cohort are not a joint event — and
  <b>CONUS — ≥64 kt is not a substitute</b>. No such product is computed here.</p>
  <p><b>3 · NO REGIONAL-VARIANT FABRICATION.</b> Atlas holds <b>no vetted Gulf Coast-only or
  Florida-only row</b>. Cohort tracks reach Texas, Louisiana and Florida — facts about named
  storms and geography, <b>not</b> a Gulf, Florida, Texas or Louisiana rate.</p></div>
<div class="box commercial" style="margin-top:3px"><h3>WHAT A STRUCTURER COULD USE THIS FOR — AND WHAT THIS PAGE DOES NOT DO</h3>
  ${C.get("desk-use")}
  ${C.get("desk-not")}</div>
${citeBlock(s)}
</section>

<div class="spacer"></div>
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — Discrete Event-Contract Evidence", body });
}

export function sourceManifestDoc(D) {
  const sheets = [];
  const head = (n, of) => masthead({
    doc: "SOURCE MANIFEST · EVIDENCE GATE", sheet: `${n} OF ${of}`,
    title: "Storm Atlas collateral — source manifest",
    sub: "Every published number in artifacts A, B, B1, B2, C and D traces to a row in this "
      + "document. It is generated by executing the cohort specifications through the same "
      + "engine the Atlas runs in the browser; nothing in it is transcribed by hand.",
    rule: [["METHODOLOGY", D.pack.methodology_version], ["PACK", D.pack.archive_stamp],
      ["ARCHIVE BUILT", D.pack.archive_built_utc], ["CAMERA", "NA + EP"]],
  });

  const provenance = `<section class="sec">${sectionHead("00", "Provenance")}
  <div class="grid2">
    <table class="ledger compact"><caption>ARCHIVE, AS BUILT</caption><tbody>
      ${Object.entries(D.pack.counts).map(([k, v]) =>
    `<tr><td>${esc(k)}</td><td class="frac">${v.toLocaleString()}</td></tr>`).join("")}
      <tr><td>methodology version</td><td class="frac">${esc(D.pack.methodology_version)}</td></tr>
      <tr><td>pack format</td><td class="frac">${esc(String(D.pack.pack_format))}</td></tr>
      <tr><td>archive stamp</td><td class="frac">${esc(D.pack.archive_stamp)}</td></tr>
      <tr><td>archive built (UTC)</td><td class="frac">${esc(D.pack.archive_built_utc)}</td></tr>
    </tbody></table>
    <div class="box sunken"><h3>SOURCES</h3>
      <p class="disclaim">${esc(D.pack.sources.join(" · "))}</p>
      <h3 style="margin-top:6px">SAFFIR-SIMPSON THRESHOLDS USED (KT)</h3>
      <p class="disclaim">${Object.entries(D.pack.thresholds_kt || {}).map(([k, v]) =>
    `${k} ≥ ${v}`).join(" · ")}</p>
      <h3 style="margin-top:6px">OPERATIONAL LAYER — NOT PART OF ANY COHORT</h3>
      <p class="disclaim">${esc(D.operational.source ? D.operational.source.note : "")}
      Generated ${esc(D.operational.generated_at)}.</p>
    </div>
  </div></section>`;

  const feeds = `<section class="sec">${sectionHead("00b", "Live feeds held at build time", `timestamped · not evergreen`)}
  <div class="grid2">
    <table class="ledger compact"><caption>ATCF b-DECK RECORDS (atlas-live-v1)</caption>
    <thead><tr><th style="text-align:left">ATCF</th><th style="text-align:left">Name</th><th>Latest fix</th>
      <th>kt</th><th>mb</th><th>Peak kt</th><th>Fixes</th></tr></thead><tbody>
    ${D.operational.storms.map((x, i) => `<tr class="${i % 2 ? "band" : ""}">
      <td>${esc(x.atcf_id)}</td><td>${esc(x.name)}</td>
      <td class="ci">${esc(x.latest_valid_time)}</td><td class="frac">${x.latest.kt}</td>
      <td class="frac">${x.latest.mslp}</td><td class="frac">${x.peak_wind_kt}</td>
      <td class="frac">${x.fix_count}</td></tr>`).join("")}
    </tbody></table>
    <table class="ledger compact"><caption>NHC GRAPHICAL OUTLOOK AREAS (ingested ${esc(D.feeds_generated_at)})</caption>
    <thead><tr><th style="text-align:left">ID</th><th style="text-align:left">Title</th>
      <th>48 h</th><th>7 d</th><th style="text-align:left">Issued</th></tr></thead><tbody>
    ${D.outlook.map((o, i) => `<tr class="${i % 2 ? "band" : ""}">
      <td>${esc(o.id || "—")}</td><td style="text-align:left;white-space:normal">${esc(o.title)}</td>
      <td class="frac">${o.pct48 === null ? "—" : o.pct48 + "%"}</td>
      <td class="frac">${o.pct7d === null ? "—" : o.pct7d + "%"}</td>
      <td class="ci" style="text-align:left">${esc(o.issued)}</td></tr>`).join("")}
    </tbody></table>
  </div></section>`;

  function cohortBlock(sy, n) {
    return `<section class="sec">${sectionHead(String(n).padStart(2, "0"), `${sy.name} — ${sy.id}`,
      `${sy.point_type} · ${coord(sy.coordinates_queried.lat, sy.coordinates_queried.lon)} · r ${sy.radius_km} km · ${esc(sy.month_window)} · floor ${sy.season_floor}`)}
    <p class="disclaim"><b>QUESTION:</b> ${esc(sy.question)}</p>
    <p style="margin:3px 0">${cohortLine(sy)}<span class="chip">${esc(sy.basin_label)}</span>
      <span class="chip">UNDECIDABLE ${sy.cohort.undecidable}</span></p>
    <p class="disclaim"><b>ATTRITION —</b> ${esc(Object.entries(sy.cohort.excluded)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v.toLocaleString()} ${{ distance: "outside the radius",
        season: "before the season floor", month: "outside the month window",
        basin: "wrong basin", subbasin: "never entered the sub-basin",
        intensity: "below the intensity condition", landfall: "no qualifying landfall",
        provisional: "provisional (2025–26, excluded by default)",
        unnamed: "unnamed", noGenesis: "no genesis point in the archive" }[k] || k}`)
      .join(" · "))} — leaving <b>${sy.cohort.kept}</b> of ${D.pack.counts.storms.toLocaleString()}.</p>
    ${ledgerPair(sy)}
    ${Object.keys(sy.unscoreable).length ? unscoreableNote(sy) : ""}
    ${sy.gaps.length ? `<div class="box hole" style="margin-top:5px"><h3>GAPS REPORTED</h3>
      <ul>${sy.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>` : ""}
    ${timingRows(sy, Object.keys(sy.time_to_event).map((k) => [k, k.replace(/_/g, " ")]))}
    <table class="ledger compact"><caption>REPRESENTATIVE COHORT MEMBERS — ${esc(sy.representatives.rule)}</caption>
    <thead><tr><th style="text-align:left">Storm</th><th>Season</th><th>Peak kt</th>
      <th style="text-align:left">Genesis</th><th>Dist km</th><th>→TS h</th><th>→C1 h</th>
      <th style="text-align:left">Landfalls (facts about that storm, not rates)</th></tr></thead><tbody>
    ${sy.representatives.members.map((m, i) => `<tr class="${i % 2 ? "band" : ""}">
      <td>${esc(m.name)}</td><td class="frac">${m.season}</td><td class="frac">${m.peak_vmax_kt}</td>
      <td class="ci" style="text-align:left">${esc((m.genesis_utc || "").slice(0, 10))} ${coord(m.genesis_lat, m.genesis_lon)}</td>
      <td class="frac">${m.distance_km}</td><td class="frac">${m.hours_to_ts === null ? "—" : Math.round(m.hours_to_ts)}</td>
      <td class="frac">${m.hours_to_cat1 === null ? "—" : Math.round(m.hours_to_cat1)}</td>
      <td class="ci" style="text-align:left;white-space:normal">${m.landfalls.length
      ? esc(m.landfalls.map((l) => `${l.region}${l.sub_region ? "/" + l.sub_region : ""} ${l.vmax_kt === null ? "—" : Math.round(l.vmax_kt) + " kt"}${l.hurricane ? " ≥64" : ""} [${l.detection}]`).join("; "))
      : "none in any modelled region"}</td></tr>`).join("")}
    </tbody></table>
    ${citeBlock(sy)}
    </section>`;
  }

  const perPage = [[0, 2], [2, 4], [4, 6]];
  const total = 1 + perPage.length;
  sheets.push(`<div class="sheet manifest">${head(1, total)}${provenance}${feeds}
    <section class="sec">${sectionHead("00c", "Cohorts in this package")}
    <table class="ledger compact"><thead><tr><th style="text-align:left">ID</th>
      <th style="text-align:left">Point type</th><th style="text-align:left">Coordinates</th>
      <th>Radius</th><th style="text-align:left">Window</th><th>N</th>
      <th style="text-align:left">Cohort status</th><th style="text-align:left">Used by</th></tr></thead><tbody>
    ${D.systems.map((sy, i) => `<tr class="${i % 2 ? "band" : ""}"><td>${esc(sy.id)}</td>
      <td>${esc(sy.point_type)}</td><td>${coord(sy.coordinates_queried.lat, sy.coordinates_queried.lon)}</td>
      <td class="frac">${sy.radius_km} km</td><td>${esc(sy.month_window)} · ${sy.season_floor}+</td>
      <td class="frac">${sy.cohort.n_cases}</td>
      <td class="cohortstat ${sy.cohort.sufficient ? "" : "refused"}">${esc(sy.cohort.cohort_status)}</td>
      <td>${esc({ "97L": "A, B, B1, B2, D", "97L-r150": "B, B1, D", "97L-allmonths": "B",
      KARINA: "A, C, D", "95E": "A", LOWELL: "A, D" }[sy.id] || "—")}</td></tr>`).join("")}
    </tbody></table></section>
    <div class="spacer"></div>${packFoot(D)}</div>`);

  perPage.forEach(([a, b], i) => {
    sheets.push(`<div class="sheet manifest">${head(i + 2, total)}
      ${D.systems.slice(a, b).map((sy, j) => cohortBlock(sy, a + j + 1)).join("")}
      <div class="spacer"></div>${packFoot(D)}</div>`);
  });

  return page({ title: "Storm Atlas collateral — source manifest", body: sheets.join("\n") });
}
