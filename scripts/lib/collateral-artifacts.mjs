/* The six artifacts. Structure and every figure live here; the prose slots are injected from
 * docs/collateral/copy.json. A slot that is missing renders as a visible TODO rather than as
 * silence, so an unwritten section cannot ship looking finished.
 */
import {
  page, masthead, sectionHead, cohortLine, ledger, ledgerPair, unscoreableTable, unscoreableNote, citeBlock,
  comparisonStrip, answersRail, repCards, repCardRow, repRule, footer, disclaimerLine,
  esc, pct, ci, hrs, coord, DISCLAIMER,
} from "./collateral-kit.mjs";
import { basinPlate, cellPlate, plate, LEGEND } from "./collateral-plates.mjs";

/* THE ONE LIVE INSTANT this package is stamped to. Every live line carries it; no historical
   cohort page does, because a cohort is evergreen and stamping it would imply otherwise. */
export const LIVE_STAMP = "31 AUG 2026 · 08:25 CT / 13:25 UTC";
export const LIVE_ISO = "2026-08-31T13:25Z";

const SLOT_MISS = (id) =>
  `<p style="color:#dc2626;font-family:var(--font-mono);font-size:8px">[COPY SLOT "${esc(id)}" NOT SUPPLIED]</p>`;

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
      + `${D.pack.counts.environment.toLocaleString()} environment records<br>`
      + `<b>METHODOLOGY</b> ${esc(D.pack.methodology_version)} &nbsp; `
      + `<b>PACK</b> ${esc(D.pack.archive_stamp)} &nbsp; `
      + `<b>ARCHIVE BUILT</b> ${esc(D.pack.archive_built_utc)}<br>`
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
    <th style="width:20%">System / basin</th><th style="width:16%">Point type</th>
    <th style="width:30%">Live status (desk line, ${esc(LIVE_STAMP.split("·")[1].trim())})</th>
    <th style="width:34%">What the archive's own feeds hold</th>
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
  const al97 = D.outlook.find((o) => o.id === "AL97");
  const ep95 = D.outlook.find((o) => o.id === "EP95");
  const feedTs = () => "";
  return {
    "97L": {
      name: "Invest 97L", basin: "NORTH ATLANTIC / GULF",
      pre: true, pointType: "PRE-GENESIS REFERENCE CELL", point: "28.0N 88.7W",
      live: `North-central Gulf disturbance, <b>~27.4N 90.7W</b>, ~100 mi S of Louisiana. `
        + `High chance of NHC development. <b>Current centre ≠ query cell.</b>`,
      feed: `NHC GTWO <b>${esc(al97 ? al97.id : "AL97")}</b> ${al97 ? al97.pct48 : "—"}% / `
        + `${al97 ? al97.pct7d : "—"}% (48 h / 7 d) · no ATCF b-deck: pre-genesis.`
        + feedTs(`issued ${esc(al97 ? al97.issued : "")} · ingested ${esc(D.feeds_generated_at)}`),
    },
    KARINA: {
      name: "Hurricane Karina", basin: "EAST PACIFIC",
      pre: false, pointType: "OBSERVED GENESIS", point: "13.2N 115.0W (~27 Aug)",
      live: `Category 4, <b>~17.2N 124.4W, 125 kt / 942 mb</b>, well WSW of Baja California.`,
      feed: `ATCF b-deck <b>EP112026</b> ${K ? `${K.latest.lat}N ${Math.abs(K.latest.lon)}W `
        + `<b>${K.latest.kt} kt / ${K.latest.mslp} mb</b> · peak ${K.peak_wind_kt} kt over ${K.fix_count} fixes` : "unavailable"}.`
        + feedTs(K ? `fix valid ${esc(K.latest_valid_time)} · layer ${esc(D.operational.generated_at)}` : ""),
    },
    "95E": {
      name: "Invest 95E", basin: "EAST PACIFIC",
      pre: true, pointType: "PRE-GENESIS REFERENCE CELL", point: "12.0N 107.5W",
      live: `Broad disturbance WSW of Acapulco. High chance of a tropical depression. `
        + `<b>Watch candidate.</b>`,
      feed: `NHC GTWO <b>${esc(ep95 ? ep95.id : "EP95")}</b> ${ep95 ? ep95.pct48 : "—"}% / `
        + `${ep95 ? ep95.pct7d : "—"}% (48 h / 7 d) · no ATCF b-deck: pre-genesis.`
        + feedTs(`issued ${esc(ep95 ? ep95.issued : "")} · ingested ${esc(D.feeds_generated_at)}`),
    },
    LOWELL: {
      name: "TS Lowell", basin: "EAST PACIFIC / CENTRAL PACIFIC",
      pre: false, pointType: "OBSERVED GENESIS", point: "11.3N 133.8W (~27 Aug)",
      live: `Tropical storm, <b>~13.0N 144W, 50 kt</b>, far from land. Basin breadth only.`,
      feed: `ATCF b-deck <b>EP122026</b> ${L ? `${L.latest.lat}N ${Math.abs(L.latest.lon)}W `
        + `<b>${L.latest.kt} kt / ${L.latest.mslp} mb</b> · peak ${L.peak_wind_kt} kt over ${L.fix_count} fixes` : "unavailable"}.`
        + feedTs(L ? `fix valid ${esc(L.latest_valid_time)} · layer ${esc(D.operational.generated_at)}` : ""),
    },
  };
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
      + `the observed genesis point — in <b>${esc(sys.month_window)}</b>, in seasons from `
      + `<b>${sys.season_floor}</b> onwards: what happened next?`;
  return `<div class="box sunken">
    <h3>THE PUBLISHED QUESTION</h3>
    <p style="font-size:10.4px;line-height:1.5">${q}</p>
    <p style="margin-top:7px">${cohortLine(sys)}
      <span class="chip">${esc(sys.point_type)}</span>
      <span class="chip">RADIUS ${sys.radius_km} km</span>
      <span class="chip">SEASON FLOOR ${sys.season_floor}</span>
      <span class="chip">${esc(sys.basin_label)}</span></p>
    ${conditional ? `<p class="disclaim" style="margin-top:4px"><b>Conditional on formation.</b>
      It says nothing about whether the system forms — <b>P(forms)</b> is NHC's outlook number,
      not Storm Atlas's. The two compose by multiplication for intensity thresholds and do not
      compose at all for landfall, which the archive counts jointly.</p>` : ""}
  </div>`;
}

function groupsFor(sys, { landfall = true } = {}) {
  const g = [{ label: "INTENSITY THRESHOLDS — genesis-conditioned, assume formation", rows: sys.intensity_rows }];
  if (landfall) g.push({ label: "LANDFALL CONTRACT ROWS — the regions this archive actually scores", rows: sys.landfall_rows });
  return g;
}

function unscoreableBlock(sys) {
  const keys = Object.keys(sys.unscoreable);
  if (!keys.length) return "";
  return `<div class="box refusal">
    <h3>WHAT THE ARCHIVE REFUSES ON THIS COHORT</h3>
    <ul>${keys.map((k) => {
      const u = sys.unscoreable[k];
      return `<li><b>${esc(k)}</b> — <b>${esc(u.status)}</b>. ${esc(u.reason)}</li>`;
    }).join("")}</ul>
    <p class="disclaim" style="margin-top:7px">These stamps are the archive's own strings,
    reproduced character for character. A stamped row still publishes its count and its interval;
    what it will not carry is a calibrated or skill-scored probability.</p>
  </div>`;
}

function gapsBlock(sys) {
  if (!sys.gaps.length) return "";
  return `<div class="box hole"><h3>GAPS THE ENGINE REPORTED WITH THIS COHORT</h3>
    <ul>${sys.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>`;
}

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
  const bp = basinPlate(D, { width: 430, height: 162 });
  const order = ["97L", "KARINA", "95E", "LOWELL"];
  const sysOf = { "97L": D.byId["97L"], KARINA: D.byId.KARINA, "95E": D.byId["95E"], LOWELL: D.byId.LOWELL };
  const REL = {
    "97L": "Insured US Gulf coastline; offshore energy corridor.",
    KARINA: "No modelled coastline reached at ≥64 kt in the cohort.",
    "95E": "Mexican Pacific coast adjacency.",
    LOWELL: "Open ocean, west of every modelled coastline.",
  };

  const table = `<table class="ledger sysgrid"><caption>FOUR SYSTEMS · POINT TYPE · LIVE STATUS (TIMESTAMPED) · EXPOSURE · WHAT THE ARCHIVE CAN ANSWER</caption>
  <thead><tr>
    <th style="width:11%">System / basin</th>
    <th style="width:16%;text-align:left">Point type + coordinates</th>
    <th style="width:28%;text-align:left" class="livecol">Live status &amp; feeds<br>as of ${esc(LIVE_STAMP)}</th>
    <th style="width:16%;text-align:left">Land / exposure</th>
    <th style="width:29%;text-align:left">Atlas value-add — cohort, rows, refusal</th>
  </tr></thead>
  <tbody>${order.map((k, i) => {
    const sy = sysOf[k];
    const r = rows[k];
    return `<tr class="${i % 2 ? "band" : ""}">
      <td><b>${esc(sy.name)}</b><br><span class="mono6">${esc(sy.basin_label)}</span></td>
      <td class="lft"><span class="chip ${r.pre ? "pre" : "obs"}">${r.pre ? "PRE-GENESIS CELL" : "OBSERVED GENESIS"}</span><br>
        <span class="mono8">${coord(sy.coordinates_queried.lat, sy.coordinates_queried.lon)}</span>
        <span class="mono6">r ${sy.radius_km} km · ${esc(sy.month_window)} · floor ${sy.season_floor}</span></td>
      <td class="lft livecol"><div class="prose">${r.live}</div>
        <div class="feed">${r.feed}</div></td>
      <td class="lft"><div class="prose">${esc(REL[k])}</div></td>
      <td class="lft"><span class="chip ${sy.cohort.sufficient ? "ok" : "refuse"}">${esc(sy.cohort.cohort_status)}</span>
        <span class="chip">N = ${sy.cohort.n_cases}</span>
        <div class="prose">${C.get(`atlas-value-${k}`)}</div></td></tr>`;
  }).join("")}</tbody></table>`;

  const tags = `<div class="tagstack">${order.map((k) => `<div class="box commercial tag">
    <h3>${esc(sysOf[k].name.toUpperCase())}</h3>
    <div class="tagbody">${C.get(`tag-${k}`)}</div></div>`).join("")}</div>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT A · ACTIVE SYSTEMS OVERVIEW", sheet: "1 OF 1",
    title: "Four live systems, four declared points, and exactly what the historical record supports from each",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [
      ["LIVE STATUS", LIVE_STAMP],
      ["CAMERA", "NORTH ATLANTIC + EAST PACIFIC"],
      ["METHODOLOGY", D.pack.methodology_version],
      ["PACK", D.pack.archive_stamp],
    ],
  })}

${answersRail(C.answers.now || "", C.answers.adds || "", C.answers.commercial || "")}

<section class="sec">${sectionHead("01", "Active systems", "live columns are timestamped · cohort columns are evergreen")}
${table}
<p class="fn"><b>INSTANTS.</b> Desk line ${esc(LIVE_STAMP)}. NHC graphical outlook ingested
${esc(D.feeds_generated_at)} (Atlantic issued ${esc((D.outlook.find((o) => o.id === "AL97") || {}).issued || "—")};
Pacific issued ${esc((D.outlook.find((o) => o.id === "EP95") || {}).issued || "—")}). ATCF b-deck
fixes valid ${esc((D.operational.storms.find((x) => x.atcf_id === "EP112026") || {}).latest_valid_time || "—")},
operational layer generated ${esc(D.operational.generated_at)}.
<b>THE LIVE COLUMN IS NOT ATLAS OUTPUT.</b> It is the desk's own line and the archive's
operational feeds. The operational layer never enters a cohort,
never matches an analog and never computes a rate — its own source note says so.
<b>POINT-TYPE RULE:</b> for an Invest that has not reached the archive's genesis definition, the
supplied coordinate is not an observed formation point. It is a <b>PRE-GENESIS REFERENCE CELL</b>,
and the only valid question against it is conditional on formation. Once an observed genesis
point exists, the reference cell is replaced by it.</p>
</section>

<div class="platerow">
  <section class="sec">${sectionHead("02", "The camera — one plate, four marks")}
  ${plate({
    title: "NA + EP · FOUR QUERIED POINTS",
    meta: `plate carrée · archive coastline`,
    svg: bp.svg,
    legendItems: [LEGEND.cell, LEGEND.genesisCell, LEGEND.live, LEGEND.outlook],
  })}
  <p class="fn">${C.get("plate-note").replace(/^<p>|<\/p>$/g, "")}</p>
  </section>
  <section class="sec">${sectionHead("03", "Commercial tags", "interpretation, never a rate")}
  ${tags}
  <div class="box refusal" style="margin-top:5px"><h3>THE REFUSALS HERE — THE MOST VALUABLE ROWS ON THE PAGE</h3>
    ${C.get("refusal-note")}
    <p style="margin-top:3px"><b>THE CONTRACT, AND ITS EDGE.</b> The scored landfall regions are
    CONUS, Mexico, Caribbean, Central America, Hawaii and Unattributed, each with an <b>any</b>
    and a <b>≥64 kt</b> pair. <b>The archive does not score state-level landfall</b>, so no TX, LA
    or Gulf-state rate appears anywhere in this package — none exists to publish.</p></div>
  </section>
</div>

<section class="sec">${sectionHead("04", "What Storm Atlas adds", "and where it is deliberately silent")}
${comparisonStrip({ compact: true })}
</section>

<section class="sec">${sectionHead("05", "Cite these cohorts", "the exact string, and the URL that reopens each one")}
<div class="citelist two">${order.map((k) => `<div class="cite">
  <span class="k">CITE THIS COHORT — ${esc(sysOf[k].name.toUpperCase())}</span>
  <div class="v">${esc(sysOf[k].cite)}</div>
  <a class="u" href="${esc(sysOf[k].replay_url)}">${esc(sysOf[k].replay_url)}</a>
</div>`).join("")}</div>
</section>

<div class="spacer"></div>
${disclaimerLine()}
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
    lon0: -99, lon1: -73, lat0: 20, lat1: 34.5, width: 424, height: 228,
    outlookId: "AL97", dLon: 5, dLat: 5, decimate: 1,
    cellAnchor: "start", cellDx: 8, cellDy: -18,
  });

  const sensRow = (sys, label) => `<tr><td>${esc(label)}</td>
    <td class="frac">${sys.cohort.n_cases}</td>
    <td class="cohortstat ${sys.cohort.sufficient ? "" : "refused"}">${esc(sys.cohort.cohort_status)}</td>
    <td class="ci">${sys.intensity_rows.find((r) => r.key === "cat1").rate === null ? "REFUSED"
      : pct(sys.intensity_rows.find((r) => r.key === "cat1").rate)}</td>
    <td class="ci">${sys.landfall_rows.find((r) => r.key === "conus:any").rate === null ? "REFUSED"
      : pct(sys.landfall_rows.find((r) => r.key === "conus:any").rate)}</td>
    <td class="status" style="font-size:7.2px">${esc(sys.replay_url)}</td></tr>`;

  const p1 = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B · EVENT DOSSIER", sheet: "1 OF 2",
    title: "Live Gulf Disturbance 97L: Genesis-Conditioned Historical Outcomes and Exposure-Relevant Analog Paths",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [
      ["LIVE STATUS", LIVE_STAMP],
      ["POINT TYPE", "PRE-GENESIS REFERENCE CELL"],
      ["CELL", "28.0°N 88.7°W · r 250 km"],
      ["METHODOLOGY", D.pack.methodology_version],
      ["PACK", D.pack.archive_stamp],
    ],
  })}

${answersRail(C.answers.now || "", C.answers.adds || "", C.answers.commercial || "")}

<section class="sec">${sectionHead("01", "Live — status only, not Atlas output")}
${liveStrip(D, [rows["97L"]])}
</section>

<section class="sec">${sectionHead("02", "The cell, and why the query is not run at the live centre")}
<div class="grid2">
  <div>${questionBlock(s, { conditional: true })}</div>
  <div>${C.get("cell-rationale")}</div>
</div>
</section>

<section class="sec">${sectionHead("03", "Outcome frequency panel", `contract rows only · exact n / N · 95% Wilson · N = ${s.cohort.n_cases} · ${s.cohort.cohort_status}`)}
${ledgerPair(s)}
<p class="fn">${C.get("reading-the-ledger").replace(/^<p>|<\/p>$/g, "")}</p>
${citeBlock(s)}
</section>

<section class="sec">${sectionHead("04", "The instrument's own sample boundary", "radius and window are declared because they move the answer")}
<table class="ledger"><caption>RADIUS AND WINDOW SENSITIVITY — the same cell, three declared questions</caption>
<thead><tr><th>Declared question</th><th>N</th><th>Cohort status</th><th>reached Cat 1</th><th>CONUS — any</th><th style="text-align:left">Replay</th></tr></thead>
<tbody>
${sensRow(s, "250 km · Aug–Sep · floor 1971  (published)")}
${sensRow(s150, "150 km · Aug–Sep · floor 1971")}
${sensRow(sAll, "250 km · all months · floor 1971")}
</tbody></table>
<p class="fn">${C.get("radius-sensitivity").replace(/^<p>|<\/p>$/g, "")}</p>
</section>

<div class="spacer"></div>
${disclaimerLine()}
${packFoot(D)}
</div>`;

  const p2 = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B · EVENT DOSSIER", sheet: "2 OF 2",
    title: "Analog paths, cohort members, and the commercial reading — kept apart from the numbers",
    sub: "",
    rule: [["COHORT", `N = ${s.cohort.n_cases} · ${s.cohort.cohort_status}`],
      ["CELL", "28.0°N 88.7°W · r 250 km · Aug–Sep · floor 1971"],
      ["PACK", D.pack.archive_stamp]],
  })}

<div class="platecol">
  <section class="sec">${sectionHead("05", "Analog-track plate", "a drawn track is not a rate")}
  ${plate({
    title: `97L CELL · ALL ${s.cohort.n_cases} COHORT MEMBER TRACKS`,
    meta: `plate carrée · no forecast geometry`,
    svg: cp.svg,
    legendItems: [LEGEND.cohortTrack, LEGEND.majorTrack, LEGEND.genesisDot, LEGEND.cell,
      LEGEND.outlook],
    note: C.get("analog-plate-note"),
  })}
  </section>
  <section class="sec">${sectionHead("06", "Seasonal timing", "historical transit, never a lead time")}
  ${timingRows(s, [["ts", "genesis → tropical storm (34 kt)"], ["cat1", "genesis → hurricane (64 kt)"],
    ["cat3", "genesis → major (96 kt)"], ["landfall_conus", "genesis → CONUS crossing"],
    ["landfall_mexico", "genesis → Mexico crossing"]])}
  <p class="fn">${C.get("seasonal-timing").replace(/^<p>|<\/p>$/g, "")}</p>
  </section>
</div>

<section class="sec">${sectionHead("07", "Representative cohort members", "explicit rule · not a similarity ranking")}
${repCardRow(s)}
${repRule(s)}
</section>

<section class="sec">${sectionHead("08", "Commercial reading", "labelled box · never mixed into the rates")}
<div class="grid2">
  <div class="box commercial"><h3>COMMERCIAL RELEVANCE — INTERPRETATION, NOT MEASUREMENT</h3>
    ${C.get("commercial")}</div>
  <div>
    ${unscoreableBlock(s)}
    ${gapsBlock(s)}
    <div class="box hole" style="margin-top:9px"><h3>THE HOLES, PRESERVED</h3>${C.get("hole")}</div>
  </div>
</div>
</section>

<section class="sec">${sectionHead("09", "What Storm Atlas adds")}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${disclaimerLine()}
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
  const headline = `CONUS any ${conusAny.count} / ${conusAny.n_storms} = ${pct(conusAny.rate)} `
    + `[${ci(conusAny.ci95)}] · CONUS ≥64 kt ${conusHur.count} / ${conusHur.n_storms} = `
    + `${pct(conusHur.rate)} [${ci(conusHur.ci95)}] · no state-level row exists in this archive`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT B1 · REINSURANCE / ILS / PARAMETRIC", sheet: "1 OF 1",
    title: "Contract-row frequencies, trigger explainability and basis risk from a declared pre-genesis cell",
    sub: `${C.get("lede").replace(/^<p>|<\/p>$/g, "")}`,
    rule: [["LIVE STATUS", LIVE_STAMP], ["CELL", "28.0°N 88.7°W · r 250 km · Aug–Sep · floor 1971"],
      ["METHODOLOGY", D.pack.methodology_version], ["PACK", D.pack.archive_stamp]],
  })}

<div class="box sunken qline"><h3>THE PUBLISHED QUESTION — CONDITIONAL ON FORMATION</h3>
<p>If a tropical cyclone were to form within <b>250 km</b> of <b>28.0°N 88.7°W</b> — the declared
pre-genesis reference cell — in <b>August or September</b>, in seasons from <b>1971</b> onwards,
what historically happened to storms that formed there? <b>${esc(s.cohort.cohort_status)}</b>,
N = ${s.cohort.n_cases}, ESS ${s.cohort.effective_sample_size}, min sample ${s.cohort.min_sample}.
It says nothing about whether the system forms — <b>P(forms)</b> is NHC's outlook number, not
Storm Atlas's; the two compose by multiplication for intensity thresholds and do not compose at
all for landfall, which the archive counts jointly.</p></div>

${answersRail(C.answers.now || "", C.answers.adds || "", C.answers.commercial || "")}

<section class="sec">${sectionHead("01", "Contract-row frequencies", headline)}
${ledgerPair(s)}
<div class="citepair">${citeBlock(s)}${citeBlock(s150, { label: "CITE THE REFUSAL — 150 KM VARIANT" })}</div>
</section>

<section class="sec">${sectionHead("02", "Trigger explainability", "and the refusal a counterparty can check")}
<div class="grid4 tight">
  <div class="box"><h3>WHY A REPLAYABLE COHORT IS THE ARTEFACT</h3>${C.get("trigger-explainability")}</div>
  <div class="box"><h3>WHERE THIS SITS — RESEARCH, NOT LIVE PRICING</h3>${C.get("how-used")}</div>
  <div class="box refusal"><h3>THE REFUSAL A COUNTERPARTY CAN CHECK</h3>
    <p>Tighten the same question from 250 km to <b>150 km</b> and the cohort falls to
    <b>N = ${s150.cohort.n_cases}</b>. Every rate then <b>REFUSES</b>: the engine returns
    “${esc(s150.intensity_rows[0].refused_reason)}” on every row rather than a rate computed over
    ${s150.cohort.n_cases} storms. Counts are still published — CONUS any
    ${s150.landfall_rows.find((r) => r.key === "conus:any").count} of ${s150.cohort.n_cases} —
    because a count is a fact and a rate over ${s150.cohort.n_cases} storms is not one.
    That refusal has its own replay URL, cited below.</p></div>
  <div class="box commercial"><h3>BASIS RISK — READ BEFORE USING ANY ROW ABOVE</h3>${C.get("basis-risk")}</div>
</div>
</section>

<section class="sec">${sectionHead("03", "Near-miss members", "cohort members that miss a key condition")}
${repCardRow(s)}
${repRule(s)}
<p class="fn">${C.get("near-miss").replace(/^<p>|<\/p>$/g, "")}</p>
</section>

<section class="sec">${sectionHead("05", "What Storm Atlas adds", "and where it is deliberately silent")}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${disclaimerLine()}
${packFoot(D)}
</div>`;
  return page({ title: "Storm Atlas — 97L for Reinsurance / ILS / Parametric", body });
}

/* ============================ B2 — ENERGY / WEATHER TRADING ============================== */
export function artifactB2(D, copy) {
  const C = makeCopy(copy, "B2");
  const s = D.byId["97L"];
  const cp = cellPlate(D, "97L", {
    lon0: -98, lon1: -74, lat0: 19.5, lat1: 34, width: 430, height: 250,
    outlookId: "AL97", dLon: 5, dLat: 5, decimate: 1,
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
    title: "Gulf genesis cohort: frequency bands from contract rows, and analog paths as geography",
    sub: C.get("lede").replace(/^<p>|<\/p>$/g, ""),
    rule: [["LIVE STATUS", LIVE_STAMP], ["CELL", "28.0°N 88.7°W · r 250 km · Aug–Sep · floor 1971"],
      ["METHODOLOGY", D.pack.methodology_version], ["PACK", D.pack.archive_stamp]],
  })}

${answersRail(C.answers.now || "", C.answers.adds || "", C.answers.commercial || "")}

<section class="sec">${sectionHead("01", "Analog paths are geography", "not scored state probabilities")}
<div class="platecol">
${plate({
    title: "97L CELL · COHORT MEMBER TRACKS OVER THE GULF",
    meta: `plate carrée · drawn geometry, not a rate`,
    svg: cp.svg,
    legendItems: [LEGEND.cohortTrack, LEGEND.majorTrack, LEGEND.genesisDot, LEGEND.cell,
      LEGEND.outlook],
    note: `<b>These lines are where ${s.cohort.n_cases} historical storms went.</b> They are not a
      probability surface, not a forecast, and not a state-level rate. No coastline segment on
      this plate is scored anywhere in this document. The scored rows are CONUS and CONUS ≥64 kt,
      in the panel below, and nothing finer exists in this archive.`,
  })}
<div class="box refusal"><h3>READ THIS BEFORE THE PLATE</h3>
${C.get("geography-not-probability")}</div>
</div>
</section>

<section class="sec">${sectionHead("02", "Frequency bands — contract rows only")}
<table class="ledger"><caption>THE ONLY SCORED ROWS ON THIS PAGE · exact n / N · 95% Wilson band</caption>
<thead><tr><th>Contract row</th><th>n / N</th><th>Rate</th><th>95% Wilson band</th><th style="text-align:left">Status returned</th></tr></thead>
<tbody>
${band("ts", "reached tropical storm (34 kt)")}
${band("cat1", "reached hurricane (64 kt)")}
${band("cat3", "reached major (96 kt)")}
${band("conus:any", "CONUS landfall — any intensity")}
${band("conus:hurricane", "CONUS landfall — ≥64 kt")}
${band("mexico:any", "MEXICO landfall — any intensity")}
</tbody></table>
<p class="fn">${C.get("frequency-bands").replace(/^<p>|<\/p>$/g, "")}</p>
${citeBlock(s)}
</section>

<section class="sec">${sectionHead("03", "Exposure adjacency", "labelled box · adjacency, never impact")}
<div class="grid2">
  <div class="box commercial"><h3>EXPOSURE CLASSES ADJACENT TO THIS COHORT</h3>${C.get("exposure-map")}</div>
  <div class="box refusal"><h3>WHAT THIS PAGE IS NOT</h3>${C.get("not-this")}</div>
</div>
</section>

<section class="sec">${sectionHead("04", "What Storm Atlas adds")}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${disclaimerLine()}
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
  const cp = cellPlate(D, "KARINA", {
    lon0: -137, lon1: -94, lat0: 6, lat1: 30, width: 286, height: 178,
    liveAtcf: "EP112026", dLon: 10, dLat: 10, decimate: 3,
    cellAnchor: "end", cellDx: -6, cellDy: 22,
  });
  const th = (k) => s.intensity_rows.find((r) => r.key === k);

  const liveTiles = `<div class="tiles grid4">
    <div class="tile"><span class="k">LIVE — DESK LINE</span><div class="v">125 <small>KT / 942 MB</small></div>
      <span class="s">~17.2°N 124.4°W · Cat 4 · ${esc(LIVE_STAMP)}</span></div>
    <div class="tile"><span class="k">LIVE — ARCHIVE b-DECK</span><div class="v">${K ? K.latest.kt : "—"} <small>KT / ${K ? K.latest.mslp : "—"} MB</small></div>
      <span class="s">${K ? `${K.latest.lat}°N ${Math.abs(K.latest.lon)}°W · fix valid ${esc(K.latest_valid_time)}` : ""}</span></div>
    <div class="tile"><span class="k">CAT 4 THRESHOLD</span><div class="v">113 <small>KT</small></div>
      <span class="s">both live readings sit at or above it</span></div>
    <div class="tile"><span class="k">COHORT — REACHED CAT 4</span><div class="v">${th("cat4").count} / ${th("cat4").n_storms}</div>
      <span class="s">${pct(th("cat4").rate)} · 95% Wilson ${ci(th("cat4").ci95)}</span></div>
  </div>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT C · MAJOR-HURRICANE ANALOG BRIEF", sheet: "1 OF 1",
    title: "Hurricane Karina: an observed genesis point, and a live Category 4 beside its cohort's threshold frequencies",
    sub: `<b>THE PUBLISHED QUESTION —</b> ${esc(s.question)} `
      + `<b>${esc(s.cohort.cohort_status)}</b>, N = ${s.cohort.n_cases}, ESS ${s.cohort.effective_sample_size}, min sample ${s.cohort.min_sample}.`,
    rule: [["LIVE STATUS", LIVE_STAMP], ["POINT TYPE", "OBSERVED GENESIS"],
      ["GENESIS", "13.2°N 115.0°W · r 250 km · Aug–Sep · floor 1971"],
      ["METHODOLOGY", D.pack.methodology_version], ["PACK", D.pack.archive_stamp]],
  })}

${answersRail(C.answers.now || "", C.answers.adds || "", C.answers.commercial || "")}

<section class="sec">${sectionHead("01", "Live — status only, not Atlas output")}
${liveTiles}
<p class="fn"><b>NOT ATLAS OUTPUT.</b> ${rows.KARINA.live} ${rows.KARINA.feed}
<b>The operational layer never enters a cohort, matches no analog and computes no rate</b> — its
own source note says so. The two live readings carry their own instants and are not reconciled.</p>
</section>

<section class="sec">${sectionHead("02", "Plate and outcome frequency panel",
    `contract rows only · exact n / N · 95% Wilson · a drawn track is not a rate`)}
<div class="triband">
  ${plate({
    title: `GENESIS 13.2°N 115.0°W · ${s.cohort.n_cases} MEMBER TRACKS + LIVE b-DECK`,
    meta: `plate carrée`,
    svg: cp.svg,
    legendItems: [LEGEND.cohortTrack, LEGEND.majorTrack, LEGEND.genesisCell, LEGEND.liveTrack],
  })}
  <div>${ledger([{ label: "INTENSITY THRESHOLDS — assume formation", rows: s.intensity_rows }],
    { showBar: false, compact: true })}</div>
  <div>${ledger([{ label: "LANDFALL CONTRACT ROWS", rows: s.landfall_rows }],
    { showBar: false, compact: true })}</div>
</div>
<p class="fn">The red track on the plate is Karina's own operational b-deck. It is <b>not</b> a
cohort member, contributes to no rate and never enters the archive. <b>No forecast cone is
drawn.</b> Every landfall row is published even where it is zero or stamped: a zero with an
interval is a result, and an omitted row is not.</p>
${citeBlock(s)}
</section>

<section class="sec">${sectionHead("03", "Representative cohort members", "explicit rule · not a similarity ranking")}
${repCardRow(s)}
${repRule(s)}
</section>

<div class="grid4 tight">
  <div class="box"><h3>THE LIVE OBSERVATION BESIDE THE HISTORICAL FREQUENCIES</h3>${C.get("live-vs-history")}</div>
  <div class="box"><h3>WHAT RARITY THE ARCHIVE SUPPORTS</h3>${C.get("rarity")}</div>
  <div class="box"><h3>THE LAND ROWS, PUBLISHED ANYWAY</h3>${C.get("land-rows")}</div>
  <div class="box commercial"><h3>SO WHAT — RESEARCH USE, NOT THREAT MONITORING</h3>${C.get("so-what")}</div>
</div>

<section class="sec">${sectionHead("05", "The refusals on this cohort, and what Storm Atlas adds",
    "the archive's own strings, verbatim · and where the instrument is deliberately silent")}
${unscoreableNote(s)}
${gapsBlock(s)}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${disclaimerLine()}
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
    <p class="disclaim" style="margin-bottom:6px">${esc(sys.question)}</p>
    <table class="ledger compact"><thead><tr><th>Row</th><th>n / N</th><th>Rate</th><th>95% Wilson</th>
      <th style="text-align:left">Status returned</th></tr></thead><tbody>
    ${keys.map(([kk, label]) => { const r = pick(sys, kk); return `<tr><td>${esc(label)}</td>
      <td class="frac">${r.count} / ${r.n_storms}</td>
      <td class="rate ${r.rate === null ? "refused" : ""}">${r.rate === null ? "REFUSED" : pct(r.rate)}</td>
      <td class="ci">${ci(r.ci95)}</td>
      <td class="status ${r.status ? (r.status === "RATE REFUSED" ? "refused" : "gate") : "none"}">${r.status ? esc(r.status) : "—"}</td></tr>`; }).join("")}
    </tbody></table>
    <div class="cite" style="margin-top:8px"><span class="k">CITE THIS COHORT</span>
      <div class="v">${esc(sys.cite)}</div>
      <a class="u" href="${esc(sys.replay_url)}">${esc(sys.replay_url)}</a></div></div>`;

  const colophon = `<table class="ledger"><caption>COLOPHON — ARCHIVE SCALE, AS BUILT</caption>
  <thead><tr><th>Table</th><th>Rows</th><th style="text-align:left">What it holds</th></tr></thead><tbody>
  ${[["storms", D.pack.counts.storms, "one row per storm: id, basin, name, season, genesis time and place, lifetime peak"],
    ["track_points", D.pack.counts.track_points, "every fix: time, position, intensity, stage, and a quality column"],
    ["genesis_events", D.pack.counts.genesis_events, "first fix, first tropical fix, every threshold crossing, time-to-event"],
    ["landfalls", D.pack.counts.landfalls, "one row per crossing: region, sub-region, time, intensity, how it was detected"],
    ["environment", D.pack.counts.environment, "fix-aligned shear, mid-level RH, 850 vorticity, potential intensity, SST, OHC, GPI"]]
    .map(([t, n, w], i) => `<tr class="${i % 2 ? "band" : ""}"><td style="font-family:var(--font-mono)">${esc(t)}</td>
      <td class="frac">${n.toLocaleString()}</td>
      <td style="text-align:left;white-space:normal;font-family:var(--font-sans);font-size:8.6px">${esc(w)}</td></tr>`).join("")}
  </tbody></table>
  <p class="fn"><b>CAMERA</b> North Atlantic + East Pacific. <b>METHODOLOGY</b> ${esc(D.pack.methodology_version)}.
  <b>PACK</b> ${esc(D.pack.archive_stamp)} — a hash of every table this pack was built from, so an
  unchanged archive produces an unchanged pack. <b>ARCHIVE BUILT</b> ${esc(D.pack.archive_built_utc)}.
  <b>SOURCES</b> ${esc(D.pack.sources.join(", "))}. Environment coverage over genesis events:
  ${D.pack.env_coverage && D.pack.env_coverage.overall_pct !== undefined
    ? esc(String(D.pack.env_coverage.overall_pct)) + "%" : "see manifest"} — environment is a lens, not a filter.</p>`;

  const body = `<div class="sheet">
${masthead({
    doc: "ARTIFACT D · TEAR SHEET", sheet: "1 OF 1",
    title: "Storm Atlas",
    sub: C.get("one-sentence").replace(/^<p>|<\/p>$/g, ""),
    rule: [["CAMERA", "NORTH ATLANTIC + EAST PACIFIC"], ["METHODOLOGY", D.pack.methodology_version],
      ["PACK", D.pack.archive_stamp], ["STATUS", "RESEARCH ONLY"]],
  })}

<section class="sec">${sectionHead("01", "What a user can do")}
<div class="grid2">
  <div class="box">${C.get("users-can")}</div>
  <div class="box sunken"><h3>THE MOAT — SANITATION, REFUSAL, PROVENANCE</h3>${C.get("moat")}</div>
</div>
</section>

<section class="sec">${sectionHead("02", "Archive scale")}
${colophon}
</section>

<section class="sec">${sectionHead("03", "Two worked samples", "97L and Karina · every figure replayable")}
<p class="fn">${C.get("sample-note").replace(/^<p>|<\/p>$/g, "")}</p>
<div class="grid2">
${sample(g, [["ts", "reached TS"], ["cat1", "reached Cat 1"], ["cat3", "reached Cat 3"],
    ["conus:any", "CONUS — any"], ["conus:hurricane", "CONUS — ≥64 kt"],
    ["hawaii:hurricane", "HAWAII — ≥64 kt"]],
  "SAMPLE 1 — INVEST 97L · PRE-GENESIS REFERENCE CELL 28.0°N 88.7°W")}
${sample(k, [["cat1", "reached Cat 1"], ["cat3", "reached Cat 3 (major)"], ["cat4", "reached Cat 4"],
    ["cat5", "reached Cat 5"], ["mexico:any", "MEXICO — any"], ["conus:any", "CONUS — any"]],
  "SAMPLE 2 — HURRICANE KARINA · OBSERVED GENESIS 13.2°N 115.0°W")}
</div>
<div class="box refusal" style="margin-top:11px"><h3>SAMPLE 3 — THE REFUSAL</h3>
  <p class="disclaim" style="margin-bottom:6px">${esc(l.question)}</p>
  <p><b>N = ${l.cohort.n_cases}</b>. ${esc(l.cohort.cohort_status)}. The engine returns
  “${esc(l.intensity_rows[0].refused_reason)}” on every row. Counts are still published — TS
  ${l.intensity_rows.find((r) => r.key === "ts").count} of ${l.cohort.n_cases}, Cat 3
  ${l.intensity_rows.find((r) => r.key === "cat3").count} of ${l.cohort.n_cases} — because a
  count is a fact and a rate over six storms is not one.</p>
  <a class="u" style="font-family:var(--font-mono);font-size:7.2px;color:#0066ff;word-break:break-all"
    href="${esc(l.replay_url)}">${esc(l.replay_url)}</a></div>
</section>

<section class="sec">${sectionHead("04", "Delivery")}
<div class="grid2">
  <div class="box"><h3>CURRENT — SHIPPING TODAY</h3>${C.get("delivery")}</div>
  <div class="box hole"><h3>PROPOSED / PILOT — NOT SHIPPING</h3>${C.get("pilot")}</div>
</div>
</section>

<section class="sec">${sectionHead("05", "What Storm Atlas adds")}
${comparisonStrip({ compact: true })}
</section>

<div class="spacer"></div>
${disclaimerLine()}
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
    <div class="spacer"></div>${disclaimerLine()}${packFoot(D)}</div>`);

  perPage.forEach(([a, b], i) => {
    sheets.push(`<div class="sheet manifest">${head(i + 2, total)}
      ${D.systems.slice(a, b).map((sy, j) => cohortBlock(sy, a + j + 1)).join("")}
      <div class="spacer"></div>${disclaimerLine()}${packFoot(D)}</div>`);
  });

  return page({ title: "Storm Atlas collateral — source manifest", body: sheets.join("\n") });
}
