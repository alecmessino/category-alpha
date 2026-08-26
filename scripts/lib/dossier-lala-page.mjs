/* The Lala dossier, rendered from facts.json.
 *
 * NO NUMBER IN THIS FILE. Every value comes from the `facts` object that
 * scripts/build-dossier-lala.mjs computed from a named source, and every one carries the
 * provenance class it was computed under. A literal typed here would be a claim with an author
 * instead of a source, which is the one thing this document exists not to contain.
 *
 * THE PAGE IS STATIC. No script, no fetch, no build step at read time. It links the site's own
 * stylesheet (whose @import paths resolve relative to styles.css, so a subdirectory works
 * unmodified) and inlines everything else, so it renders from the site, from a checkout, or from
 * a directory someone unzipped.
 */

const MHI = "Main Hawaiian Islands";

/* ---- formatting ------------------------------------------------------------------------- */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** An instant, to the minute, always UTC, always stamped Z. */
const Z = (ms) => (ms === null || ms === undefined ? "—"
  : new Date(ms).toISOString().slice(0, 16).replace("T", " ") + "Z");
const Zd = (ms) => (ms === null || ms === undefined ? "—"
  : new Date(ms).toISOString().slice(0, 10));

/** Hours, days past two of them — the archive's own convention — and MINUTES below the hour.
 *  Without the minute case a record made three minutes before the outcome it was about prints as
 *  "0 h", which reads as no lead at all rather than as a very short one. */
const dur = (h) => {
  if (h === null || h === undefined) return "—";
  const a = Math.abs(h);
  if (a < 1) return `${Math.round(h * 60)} min`;
  if (a < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
};

const km = (v) => (v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString()} km`);
const pct = (r) => (r === null || r === undefined ? "—" : `${(100 * r).toFixed(1)}%`);
const ci = (c) => (c === null || c === undefined ? "—"
  : `${(100 * c[0]).toFixed(1)}–${(100 * c[1]).toFixed(1)}%`);

/** Signed degrees are for arithmetic; hemispheres are for reading. */
function pos(lat, lon) {
  if (lat === null || lon === null || lat === undefined || lon === undefined) return "—";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}

const CAT = { td: "Tropical Depression", ts: "Tropical Storm", cat1: "Category 1",
  cat2: "Category 2", cat3: "Category 3", cat4: "Category 4", cat5: "Category 5" };
const CAT_SHORT = { ts: "TS+", cat1: "Cat 1+", cat2: "Cat 2+", cat3: "Cat 3+", cat4: "Cat 4+",
  cat5: "Cat 5" };
const STAGE = { DB: "disturbance", LO: "low", TS: "tropical storm", HU: "hurricane",
  TD: "tropical depression", EX: "extratropical", SD: "subtropical depression",
  SS: "subtropical storm", PT: "post-tropical" };

/** The provenance tag, the only chrome on this page that carries colour. */
const tag = (t) => `<span class="tag t-${t.replace(/[^a-z]/gi, "").toLowerCase()}">${esc(t)}</span>`;

/** The archive stores storm names in upper case. A table cell can carry that; a sentence cannot,
 *  so the one place a name appears inside prose renders it as a name. The id is never touched. */
const nameCase = (s) => String(s || "").replace(/\b([A-Z])([A-Z]+)\b/g,
  (_, a, b) => a + b.toLowerCase());

const rows = (arr) => arr.join("\n");
const td = (v) => `<td>${v}</td>`;
const tdn = (v) => `<td class="n">${v}</td>`;

/* ---- the page ---------------------------------------------------------------------------- */

export function renderDossier(f) {
  const a = f.archive_record;
  const o = f.operational_record;
  const g = f.geometry;
  const cAll = f.cohort.all_seasons;
  const cRel = f.cohort.reliable_era;
  const rec = f.recorded;
  const env = f.environment;
  const dot = f.cohort.hawaii_contributors[0] || null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Lala CP012026 — Event Dossier — Millibar</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="What was knowable about Hurricane Lala (CP012026), when it was knowable, and what the historical record does and does not support about Hawaii risk. Archive, operational and derived evidence kept separate throughout.">
<link rel="icon" href="../../assets/millibar-icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../../styles.css">
<style>
${CSS}
</style>
</head>
<body>
<article class="dossier">

<header class="mast">
  <div class="kicker">MILLIBAR · EVENT DOSSIER</div>
  <h1>Lala <span class="id">${esc(a.atcf_id)}</span></h1>
  <div class="sub">${esc(a.season)} · ${esc(a.basin)}${a.subbasin ? " / " + esc(a.subbasin) : ""} Pacific · archive id ${esc(a.storm_id)}</div>
  <div class="stamps">
    <span>Built ${Z(Date.parse(f.built_utc))}</span>
    <span>Archive ${esc(f.archive_provenance.archive_stamp)} · built ${Zd(Date.parse(f.archive_provenance.archive_built_utc))}</span>
    <span>Methodology ${esc(f.archive_provenance.methodology_version)}</span>
    <span>External / public contract facts used: <b>${esc(f.external_public_contract_facts)}</b></span>
  </div>
</header>

<section class="key">
  <h2>How to read every number on this page</h2>
  <p class="lead">Four sources answer four different questions. They are labelled everywhere and
  never combined.</p>
  <table>
    <tbody>
      <tr>${td(tag("ARCHIVE"))}${td("IBTrACS best track, as the Storm Atlas holds it. Post-analysed for closed seasons; <b>provisional</b> for this one. The only source any statistic on this page is computed from.")}</tr>
      <tr>${td(tag("OPERATIONAL"))}${td("ATCF b-deck and operational SHIPS, as the forecast office had them. Revised while a storm is live. Used to describe <b>this storm</b>, and nothing else.")}</tr>
      <tr>${td(tag("DERIVED"))}${td("Computed here by replaying a rule the archive already owns. The rule is named wherever a derived value appears.")}</tr>
      <tr>${td(tag("RECORDED / MILLIBAR"))}${td(esc(rec.definition))}</tr>
    </tbody>
  </table>
  <p class="note">No external or public contract fact is used anywhere in this document. No carrier,
  policy, trigger geometry, attachment threshold or payout function is named, reconstructed or
  implied, and no price quoted or settled outside Millibar enters any figure here.</p>
</section>

<!-- ============================================================ 1 -->
<section>
  <h2><span class="num">1</span> Event overview</h2>

  <p class="lead">Two records describe Lala. They begin at the same instant and end
  ${dur(o.extends_archive_by_hours)} apart.</p>

  <table class="cmp">
    <thead><tr><th></th><th>${tag("ARCHIVE")}<div class="th2">IBTrACS, provisional</div></th><th>${tag("OPERATIONAL")}<div class="th2">ATCF b-deck</div></th></tr></thead>
    <tbody>
      <tr><th>First fix</th>${td(Z(a.first_fix_t) + " <span class=q>" + esc(STAGE[a.first_fix_stage] || a.first_fix_stage) + "</span>")}${td(Z(o.first_fix_t) + " <span class=q>" + esc(STAGE[o.first_fix_stage] || o.first_fix_stage) + "</span>")}</tr>
      <tr><th>Last fix</th>${td(Z(a.end_t))}${td("<b>" + Z(o.latest_t) + "</b>")}</tr>
      <tr><th>Full track extent</th>${tdn(dur(a.full_extent_hours))}${tdn(dur(o.full_extent_hours))}</tr>
      <tr><th>Genesis to end of record</th>${tdn(dur(a.genesis_to_end_hours))}${tdn(dur(o.genesis_to_latest_hours))}</tr>
      <tr><th>Fixes</th>${tdn(a.fixes + " <span class=q>(" + a.fixes_pre_genesis + " pre-genesis, " + a.fixes_from_genesis + " from genesis)</span>")}${tdn(o.fixes + " <span class=q>(" + o.fixes_pre_genesis + " pre-genesis, " + o.fixes_from_genesis + " from genesis)</span>")}</tr>
      <tr><th>Peak wind</th>${tdn(a.max_vmax_kt + " kt <span class=q>" + esc(CAT[a.max_category] || "—") + "</span>")}${tdn("<b>" + o.peak_wind_kt + " kt</b> <span class=q>" + esc(CAT[o.peak_category]) + " " + tag("DERIVED") + "</span>")}</tr>
      <tr><th>Minimum pressure</th>${tdn(a.min_mslp_mb + " mb")}${tdn("<b>" + o.min_mslp_mb + " mb</b>")}</tr>
      <tr><th>Record status</th>${td("<span class=flag>" + esc(a.track_type) + "</span> — not post-analysed")}${td("<span class=flag>OPERATIONAL</span> — revised while live")}</tr>
      <tr><th>Fix quality</th>${td(a.quality.observed + " observed · " + a.quality.interpolated + " interpolated · " + a.quality.provisional + " provisional")}${td(o.fixes + " forecast-office analyses; a b-deck carries no interpolated rows")}</tr>
      <tr><th>Source</th>${td("<code>" + esc(a.source_key) + "</code>")}${td("<code>" + esc(o.source.file) + "</code><div class=q>fetched " + Z(Date.parse(o.source.fetched_at)) + " from " + esc(o.source.url) + "</div>")}</tr>
    </tbody>
  </table>

  <div class="callout warn">
    <h3>This was not a Category 4 near-miss of Hawaiʻi</h3>
    <p>Lala reached ${o.peak_wind_kt} kt at ${Z(o.peak_wind_t)}, at ${pos(o.peak_wind_lat, o.peak_wind_lon)}.
    At that instant it was ${km(g.at_peak.mhi_km)} from the ${MHI}
    — ${(g.at_peak.mhi_km / g.closest_main_islands.km).toFixed(0)}× its closest approach.
    The passage nearest the main islands happened
    ${dur((o.peak_wind_t - g.closest_main_islands.t) / 3600000)} <b>earlier</b>, at
    ${o.peak_wind_kt - g.closest_main_islands.kt} kt weaker
    (${g.closest_main_islands.kt} kt, ${esc(STAGE[g.closest_main_islands.stage] || g.closest_main_islands.stage)}).
    The intensity and the proximity did not coincide.</p>
  </div>
</section>

<!-- ============================================================ 2 -->
<section>
  <h2><span class="num">2</span> Point-in-time chronology</h2>
  <p class="lead">Every row carries the source-valid time of the fix it came from, not the time
  Millibar read it.</p>

  <table class="chron">
    <thead><tr><th>UTC</th><th>Event</th><th class="n">kt</th><th class="n">mb</th><th>Position</th><th class="n">${MHI}</th><th></th></tr></thead>
    <tbody>
${chronology(f)}
    </tbody>
  </table>
  <p class="note">Distances are the minimum geodesic distance from the fix to the nearest
  <b>coastline segment</b> of the archive's own ${MHI} geometry
  (${g.coastline_source.main_islands_rings} rings, ${g.coastline_source.main_islands_vertices} vertices),
  not the distance to the nearest stored vertex. ${tag("DERIVED")}</p>

  <h3>Closest approach</h3>
  <table>
    <thead><tr><th></th><th class="n">Distance</th><th>UTC</th><th class="n">Intensity</th><th>Position</th></tr></thead>
    <tbody>
      <tr><th>${MHI}</th>${tdn("<b>" + km(g.closest_main_islands.km) + "</b>")}${td(Z(g.closest_main_islands.t))}${tdn(g.closest_main_islands.kt + " kt " + esc(STAGE[g.closest_main_islands.stage] || ""))}${td(pos(g.closest_main_islands.lat, g.closest_main_islands.lon))}</tr>
      <tr><th>Northwestern Hawaiian Islands</th>${tdn(km(g.closest_nwhi.km))}${td(Z(g.closest_nwhi.t))}${tdn(g.closest_nwhi.kt + " kt " + esc(STAGE[g.closest_nwhi.stage] || ""))}${td(pos(g.closest_nwhi.lat, g.closest_nwhi.lon))}</tr>
      <tr class="dim"><th>At the ${esc(CAT[o.peak_category])} peak</th>${tdn(km(g.at_peak.mhi_km))}${td(Z(g.at_peak.t))}${tdn(g.at_peak.kt + " kt")}${td(pos(g.at_peak.lat, g.at_peak.lon))}</tr>
    </tbody>
  </table>
  <p class="note">The two island groups are reported separately because they are different
  exposure questions, not because they are far apart — their nearest points are only
  ${km(g.group_separation_km)} apart. What differs is extent and population: the archive's
  <code>hawaii</code> region is ${g.coastline_source.hawaii_rings} rings
  (${g.coastline_source.main_islands_rings} main islands,
  ${g.coastline_source.main_islands_vertices} vertices; ${g.coastline_source.nwhi_rings}
  northwestern, ${g.coastline_source.nwhi_vertices} vertices), and the northwestern chain runs a
  further ${km(g.group_extent.nwhi_extends_west_km)} west, to
  ${Math.abs(g.group_extent.nwhi_lon[0]).toFixed(1)}°W. The partition is by ring, not by a
  longitude guess.</p>

  <div class="callout">
    <h3>The archive record ends ${dur(g.archive_ends_before_closest_approach_hours)} before the closest approach</h3>
    <p>IBTrACS stops at ${Z(a.end_t)}, with Lala ${km(g.at_archive_end.mhi_km)} from the ${MHI}
    and still closing. The nearest passage — ${km(g.closest_main_islands.km)} — is at
    ${Z(g.closest_main_islands.t)}, and everything after it exists only in the operational record.</p>
  </div>

  <h3>Environment</h3>
  <div class="callout refuse">
    <h3>Genesis environment — REFUSED</h3>
    <p>${esc(env.genesis_environment.refusal)}</p>
    <p class="q">Operational SHIPS coverage for this storm begins
    ${dur(env.genesis_environment.operational_begins_after_genesis_hours)} after genesis, at
    ${Z(env.genesis_environment.operational_begins_t)}. The archive's genesis window is
    ±${env.genesis_environment.archive_window_hours} h and holds no row.</p>
  </div>

  <p>${env.rows} operational SHIPS analyses exist for Lala, ${Z(env.first_t)} to ${Z(env.last_t)},
  at tau 0. ${tag("OPERATIONAL")}</p>
${envTable(env, o)}
  <p class="note">These are observations at timestamps. This dossier draws no causal link between
  any environmental value and any intensity change: temporal association is not attribution, and
  nothing here tests one.</p>
</section>

<!-- ============================================================ 3 -->
<section>
  <h2><span class="num">3</span> What the historical record holds</h2>
  <p class="lead">${esc(cAll.sentence)}</p>

  <table class="stat">
    <tbody>
      <tr><th>Cohort</th>${tdn("<b>" + cAll.kept + "</b> storms")}<th>Effective sample size</th>${tdn(cAll.effective_sample_size)}</tr>
      <tr><th>Minimum sample</th>${tdn(cAll.min_sample)}<th>Sufficiency</th>${tdn(cAll.sufficient ? '<span class="pos">SUFFICIENT</span>' : '<span class="neg">BELOW SAMPLE</span>')}</tr>
      <tr><th>Match point</th>${td(pos(f.cohort.where.lat, f.cohort.where.lon))}<th>Radius</th>${tdn(km(f.cohort.radius_km))}</tr>
    </tbody>
  </table>

  <div class="callout">
    <h3>Lala is not in this cohort</h3>
    <p>Its genesis point defines the cohort's location condition, and the archive's record scope
    then excludes it:</p>
    <table class="verdicts">
      <tbody>
${f.cohort.own_membership.why.map((w) => `        <tr><th>${esc(w.label)}</th><td class="v-${esc(w.verdict)}">${esc(w.verdict.toUpperCase())}</td><td>${esc(w.value)}</td></tr>`).join("\n")}
      </tbody>
    </table>
    <p>No operational value from Lala enters any number in this section. That is a property of the
    archive's own provisional-scope rule, not a choice made for this document.</p>
  </div>

  <h3>Intensity outcomes</h3>
  <p class="note"><b>These are cumulative thresholds, not exclusive peak-category bins.</b>
  &ldquo;Reached Cat 3+&rdquo; counts every storm whose peak reached at least Category 3, including
  those that went further. The rows do not sum to the cohort.</p>
${thresholdTable(cAll, cRel, f.cohort.reliable_era_from)}

  <h3>Hawaiʻi outcomes</h3>
${hawaiiTable(cAll, cRel, f.cohort.reliable_era_from)}

${dot ? `  <div class="callout warn">
    <h3>The entire Hawaiʻi numerator is one storm</h3>
    <p>${esc(nameCase(dot.name))} (${dot.season}), <code>${esc(dot.atcf_id || dot.storm_id)}</code> —
    ${dot.landfalls.map((l) => `${esc(l.sub_region || "")}, ${Zd(l.t)}, ${l.vmax_kt} kt, ${esc(CAT[l.category] || "class withheld")}, detection <code>${esc(l.detection)}</code>`).join("; ")}.
    A rate of ${pct(cAll.hawaii_any.rate)} whose numerator is a single ${dot.season} event is a
    count, not a frequency, and its interval ${ci(cAll.hawaii_any.ci95)} says so.</p>
  </div>` : ""}

  <div class="callout refuse">
    <h3>Under the archive's own quality remedy, the Hawaiʻi rate refuses</h3>
${cAll.gaps.map((x) => `    <p class="q">${esc(x)}</p>`).join("\n")}
    <p>Applying that remedy — a season floor of ${f.cohort.reliable_era_from} — takes the cohort
    from ${cAll.kept} storms to ${cRel.kept}${dot ? `, and removes ${esc(nameCase(dot.name))} (${dot.season}) with it` : ""}.
    The Hawaiʻi landfall outcome becomes
    ${cRel.hawaii_any.count}/${cRel.kept} and the engine stops publishing a rate:
    <b>${esc(cRel.hawaii_any.refused || "—")}</b>.</p>
    <p><b>This is the answer to what the historical record supports about Hawaiʻi risk at Lala's
    genesis point: over the reliably-observed era, it declines to support a rate at all.</b></p>
  </div>
</section>

<!-- ============================================================ 4 -->
<section>
  <h2><span class="num">4</span> What Millibar recorded, and what happened afterwards</h2>
  <p class="lead">The historical prior above and the record below are separate evidence. Neither
  was computed from the other.</p>

  <table class="stat">
    <tbody>
      <tr><th>Entries for ${esc(f.subject)}</th>${tdn(rec.entries)}<th>Question recorded</th>${td("<code>" + esc(rec.questions[0]) + "</code>")}</tr>
      <tr><th>First record</th>${td(Z(rec.first_t))}<th>Most recent</th>${td(Z(rec.last_t))}</tr>
      <tr><th>Ledger begins</th>${td(dur(rec.starts_after_genesis_hours) + " after genesis")}<th>Source</th>${td("<code>" + esc(rec.source) + "</code>")}</tr>
    </tbody>
  </table>

  <p class="note">The recorded question is whether Lala would reach <b>${rec.threshold_kt} kt</b>.
  It is not a question about Hawaiʻi, it is not a question about Category 4, and no record of
  either exists for this storm.</p>

  <table class="chron">
    <thead><tr><th>UTC recorded</th><th>Checkpoint</th><th class="n">Storm</th><th class="n">Model</th><th class="n">Calibrated</th><th class="n">Lead to outcome</th></tr></thead>
    <tbody>
${rec.checkpoints.map((c) => `      <tr><td>${Z(Date.parse(c.tsZ))}</td><td>${esc(c.label)}</td>${tdn(c.currentKt === null ? "—" : c.currentKt + " kt")}${tdn(c.pRaw === null ? "—" : pct(c.pRaw))}${tdn(c.pCal === null ? "—" : pct(c.pCal))}${tdn(c.lead_hours_to_outcome === null || c.lead_hours_to_outcome < 0 ? "—" : dur(c.lead_hours_to_outcome))}</tr>`).join("\n")}
    </tbody>
  </table>
  <p class="note">${LEDGER_NOTE(rec)} Full ledger: <code>${esc(rec.source)}</code>,
  ${rec.entries} entries. ${tag("RECORDED / MILLIBAR")}</p>


  <p>The outcome the question was about: Lala first reached ${rec.threshold_kt} kt at
  ${Z(rec.outcome.t)} ${tag("OPERATIONAL")}.</p>

  <div class="callout refuse">
    <h3>This demonstrates replay discipline, not forecasting skill</h3>
    <p>Millibar's calibration ledger declines to publish a score:
    <b>${rec.calibration.resolved_storms} resolved storms of the ${rec.calibration.required_storms}
    required</b>, behind ${rec.calibration.resolved_entries} resolved forecasts.</p>
    <p class="q">${esc(rec.calibration.note)}</p>
    <p>One storm cannot establish calibration, and this document does not claim it does. What the
    ledger establishes is that the values above were recorded <b>before</b> the outcome and have not
    been edited since — which is a provenance property, and a precondition for measuring skill
    later rather than a substitute for having measured it.</p>
  </div>
</section>

<!-- ============================================================ 5 -->
<section>
  <h2><span class="num">5</span> Provenance discipline, demonstrated</h2>
  <p class="lead">Lala is a case where two authoritative sources disagreed by
  ${o.peak_wind_kt - a.max_vmax_kt} kt and ${a.min_mslp_mb - o.min_mslp_mb} mb, and both were kept.</p>

  <table class="cmp">
    <thead><tr><th>Question</th><th>Answered by</th><th>Answer</th></tr></thead>
    <tbody>
      <tr><td>How strong did this storm get, as the forecast office has it now?</td>${td(tag("OPERATIONAL"))}${td("<b>" + o.peak_wind_kt + " kt, " + esc(CAT[o.peak_category]) + ", " + o.min_mslp_mb + " mb</b>, " + Z(o.peak_wind_t))}</tr>
      <tr><td>What does the post-analysable archive record for this season hold?</td>${td(tag("ARCHIVE"))}${td(a.max_vmax_kt + " kt, " + esc(CAT[a.max_category]) + ", " + a.min_mslp_mb + " mb, through " + Z(a.end_t))}</tr>
      <tr><td>What happened to storms that formed here historically?</td>${td(tag("ARCHIVE"))}${td("A " + cAll.kept + "-storm cohort that contains no Lala data at all")}</tr>
    </tbody>
  </table>

  <p>The archive record is not extended, corrected or overwritten by the operational one. IBTrACS
  publishes a provisional row for a running season and revises it at post-analysis; that row is the
  input to every historical statistic Millibar computes, and it stays exactly as published. The
  operational deck describes the storm that is happening. Both are on this page, labelled, with
  their own timestamps and their own source files.</p>

  <p>The separation is enforced rather than observed. The operational layer cannot be reached by
  any module that computes cohort membership, analog matching, intensity or landfall rates, Wilson
  intervals, effective sample size, calibration, the archive comparison, an event gate or a refusal
  — a build gate walks the import graph and fails when one can, and a second gate recomputes every
  published historical value with the operational artifact absent and again with it loaded,
  requiring them to be identical.</p>

  <p class="note">The two records also agree where they overlap, which is worth stating: both begin
  at ${Z(a.first_fix_t)}, and both place genesis at ${Z(a.genesis_t)},
  ${pos(a.genesis_lat, a.genesis_lon)}. The disagreement is entirely about where the record
  <em>stops</em>.</p>
</section>

<!-- ============================================================ 6 -->
<section>
  <h2><span class="num">6</span> Where this architecture is relevant to parametric risk</h2>
  <p class="lead">Capabilities, against public primitives. No contract terms of any kind are used,
  held or implied.</p>

  <table class="cmp">
    <thead><tr><th>Need</th><th>What this architecture provides</th></tr></thead>
    <tbody>
      <tr><td>Independent historical validation</td><td>Rates computed in the reader's browser from a versioned archive pack, with the effective sample size, the Wilson interval and the refusal shown next to every number. The cohort above is reproducible from a URL.</td></tr>
      <tr><td>Trigger research</td><td>Threshold crossings and their elapsed times are re-derivable from either record under a stated rule. This page shows the ${Object.keys(o.crossings).length}-step ladder for one storm; the same rule runs over ${f.archive_provenance.storms.toLocaleString()} archive storms.</td></tr>
      <tr><td>Basis-risk research</td><td>Lala separated peak intensity from proximity by ${km(g.at_peak.mhi_km - g.closest_main_islands.km)} and ${dur((o.peak_wind_t - g.closest_main_islands.t) / 3600000)}. That is a <b>spatial-temporal separation relevant to basis-risk research</b> — not a basis-risk analysis. Millibar can support basis-risk analysis when actual exposure locations and trigger terms are supplied.</td></tr>
      <tr><td>Event reconstruction</td><td>Dual-source, timestamped, with the fetch time and the source-valid time kept distinct, and the point at which each source stopped stated explicitly.</td></tr>
      <tr><td>Model challenge</td><td>Refusals are first-class outputs. A cohort that cannot support a probability says which population it counted and why, as section 3 does for the Hawaiʻi rate under the ${f.cohort.reliable_era_from} floor.</td></tr>
    </tbody>
  </table>
  <p class="note">External / public contract facts used in this document: <b>none</b>.</p>
</section>

<!-- ============================================================ 7 -->
<section class="close">
  <h2><span class="num">7</span> Institutional use</h2>
  <table class="cmp">
    <thead><tr><th>Function</th><th>The question this answers</th></tr></thead>
    <tbody>
      <tr><td>ILS &amp; reinsurance</td><td>What does the observed record support about a peril at a given genesis region, with the sample size and the interval attached — and where does it decline to support anything?</td></tr>
      <tr><td>Parametric insurance</td><td>How do candidate index definitions behave over the archive, and how far apart can intensity and proximity sit for one event?</td></tr>
      <tr><td>Catastrophe modelling &amp; validation</td><td>An independent, versioned, refusal-preserving reference to validate a vendor or in-house view against, with provisional and post-analysed records kept apart.</td></tr>
      <tr><td>Weather-sensitive financial markets</td><td>Timestamped point-in-time state with source-valid and ingestion times kept distinct, so a backtest reads what was knowable then rather than what is known now.</td></tr>
    </tbody>
  </table>

  <div class="cta">
    <h3>Request an institutional walkthrough / design-partner discussion</h3>
    <p>The Storm Atlas, the archive, this dossier and the gates behind them are available for
    review against your own questions.</p>
  </div>
</section>

<footer>
  <p>Subject ${esc(f.subject)}. Archive ${esc(f.archive_provenance.archive_stamp)},
  ${f.archive_provenance.storms.toLocaleString()} storms,
  ${f.archive_provenance.track_points.toLocaleString()} track points, methodology
  ${esc(f.archive_provenance.methodology_version)}. Operational record
  <code>${esc(o.source.file)}</code>, ${o.source.bytes.toLocaleString()} bytes, fetched
  ${Z(Date.parse(o.source.fetched_at))}. Every value on this page is reproduced by
  <code>node scripts/build-dossier-lala.mjs</code> and recorded in
  <code>facts.json</code> beside it. Research use. Not a forecast, not advice, and not an offer.</p>
</footer>

</article>
</body>
</html>
`;
}

/* ---- section builders ---------------------------------------------------------------------- */

function LEDGER_NOTE(rec) {
  return `Checkpoints are chosen for what each establishes — the first record, the last before the `
    + `outcome, the highest intensity recorded, and the current state — not for how they read.`;
}

/** The chronology: stage changes and threshold crossings, merged and sorted, with the two
 *  archive boundaries and the closest approach placed in the same sequence. */
function chronology(f) {
  const o = f.operational_record;
  const a = f.archive_record;
  const g = f.geometry;
  const out = [];

  for (const s of o.stage_changes) {
    out.push({ t: s.t, what: `b-deck stage <code>${esc(s.stage)}</code> — ${esc(STAGE[s.stage] || "")}`,
      kt: s.kt, mslp: s.mslp, lat: s.lat, lon: s.lon, tag: "OPERATIONAL" });
  }
  for (const [name, c] of Object.entries(o.crossings)) {
    if (c.t === null) continue;
    out.push({ t: c.t, what: `<b>${esc(CAT[name])}</b> crossing — first fix ≥ ${c.threshold_kt} kt, `
      + `${dur(c.hours_from_genesis)} from genesis`, kt: c.kt, mslp: c.mslp, lat: c.lat, lon: c.lon,
      tag: "DERIVED" });
  }
  out.push({ t: a.genesis_t, what: "<b>Genesis</b> — first tropical fix; both records agree",
    kt: null, mslp: null, lat: a.genesis_lat, lon: a.genesis_lon, tag: "ARCHIVE", mark: true });
  out.push({ t: a.end_t, what: "<b>Archive record ends</b> — IBTrACS publishes nothing after this",
    kt: g.at_archive_end.kt, mslp: g.at_archive_end.mslp, lat: g.at_archive_end.lat,
    lon: g.at_archive_end.lon, tag: "ARCHIVE", mark: true });
  out.push({ t: g.closest_main_islands.t,
    what: `<b>Closest approach, ${MHI}</b> — ${km(g.closest_main_islands.km)}`,
    kt: g.closest_main_islands.kt, mslp: g.closest_main_islands.mslp,
    lat: g.closest_main_islands.lat, lon: g.closest_main_islands.lon, tag: "DERIVED", mark: true });
  out.push({ t: o.peak_wind_t, what: `<b>Peak — ${o.peak_wind_kt} kt, ${esc(CAT[o.peak_category])}</b>`,
    kt: o.peak_wind_kt, mslp: o.min_mslp_mb, lat: o.peak_wind_lat, lon: o.peak_wind_lon,
    tag: "OPERATIONAL", mark: true });
  out.push({ t: g.closest_nwhi.t,
    what: `Closest approach, Northwestern Hawaiian Islands — ${km(g.closest_nwhi.km)}`,
    kt: g.closest_nwhi.kt, mslp: g.closest_nwhi.mslp, lat: g.closest_nwhi.lat,
    lon: g.closest_nwhi.lon, tag: "DERIVED" });
  out.push({ t: o.latest_t, what: "<b>Latest operational fix</b> — the record is open",
    kt: o.latest.kt, mslp: o.latest.mslp, lat: o.latest.lat, lon: o.latest.lon,
    tag: "OPERATIONAL", mark: true });

  /* ONE ROW PER INSTANT. Genesis, the tropical-storm crossing and the b-deck's own change to
     stage TS are three descriptions of the same fix; printed as three rows they read as three
     events. They are merged, and the merged row keeps every provenance tag that produced it. */
  out.sort((x, y) => x.t - y.t || (x.mark ? -1 : 0) - (y.mark ? -1 : 0));
  const merged = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.t === r.t) {
      prev.what += `<div class="also">${r.what}</div>`;
      if (!prev.tags.includes(r.tag)) prev.tags.push(r.tag);
      prev.mark = prev.mark || r.mark;
      if (prev.kt === null) prev.kt = r.kt;
      if (prev.mslp === null || prev.mslp === undefined) prev.mslp = r.mslp;
      if (prev.lat === null) { prev.lat = r.lat; prev.lon = r.lon; }
      continue;
    }
    merged.push({ ...r, tags: [r.tag] });
  }

  const dist = f.geometry.main_islands_km_by_t || {};
  return merged.map((r) => `      <tr class="${r.mark ? "mark" : ""}">`
    + `<td class="t">${Z(r.t)}</td><td>${r.what}</td>`
    + `<td class="n">${r.kt === null ? "—" : r.kt}</td>`
    + `<td class="n">${r.mslp === null || r.mslp === undefined ? "—" : r.mslp}</td>`
    + `<td>${pos(r.lat, r.lon)}</td>`
    + `<td class="n">${dist[r.t] === undefined ? "—" : km(dist[r.t])}</td>`
    + `<td>${r.tags.map(tag).join(" ")}</td></tr>`).join("\n");
}

function envTable(env, o) {
  const F = [["shear_kt", "Deep-layer shear", "kt"], ["sst_c", "Sea-surface temp", "°C"],
    ["ohc_kj_cm2", "Ocean heat content", "kJ/cm²"], ["rh_mid_pct", "Mid-level RH", "%"],
    ["pot_intensity_kt", "Potential intensity", "kt"]];
  /* Daily sample, plus the last row, plus the analysis valid at the Cat 4 peak — which a plain
     every-4th filter skips, since the peak fell on a 06Z fix and the sample lands on 00Z. */
  const peakIdx = env.at_peak ? env.series.findIndex((r) => r.iso_time === env.at_peak.iso_time) : -1;
  const show = env.series.filter((_, i) =>
    i % 4 === 0 || i === env.series.length - 1 || i === peakIdx);
  return `  <table class="chron">
    <thead><tr><th>UTC valid</th>${F.map(([, l, u]) => `<th class="n">${esc(l)}<div class="th2">${esc(u)}</div></th>`).join("")}<th class="n">Storm</th></tr></thead>
    <tbody>
${show.map((r) => {
    const isPeak = env.at_peak && r.iso_time === env.at_peak.iso_time;
    const fix = isPeak ? o.peak_wind_kt : null;
    return `      <tr class="${isPeak ? "mark" : ""}"><td class="t">${Z(Date.parse(r.iso_time))}</td>`
      + F.map(([k]) => `<td class="n">${r[k] === null || r[k] === undefined ? "—" : r[k]}</td>`).join("")
      + `<td class="n">${fix === null ? "" : "<b>" + fix + " kt peak</b>"}</td></tr>`;
  }).join("\n")}
    </tbody>
  </table>
  <p class="note">Every 4th analysis shown, plus the peak row and the last; all ${env.series.length} are in
  <code>data/env-ships-rt.json</code>. Operational SHIPS is not the developmental SHIPS archive
  section 3's cohort draws on — they are sequential eras measured differently and are never pooled,
  differenced or compared here as one instrument.</p>`;
}

function thresholdTable(cAll, cRel, from) {
  const keys = ["ts", "cat1", "cat2", "cat3", "cat4", "cat5"];
  return `  <table class="stat wide">
    <thead><tr><th>Outcome</th><th class="n">Storms</th><th class="n">Rate</th><th class="n">95% Wilson</th><th class="n">From ${from}</th><th class="n">Rate</th><th class="n">95% Wilson</th></tr></thead>
    <tbody>
${keys.map((k) => {
    const A = cAll.thresholds[k];
    const R = cRel.thresholds[k];
    return `      <tr><th>Reached ${esc(CAT_SHORT[k])}</th>`
      + `<td class="n">${A.count}/${cAll.kept}</td><td class="n">${A.refused ? "—" : pct(A.rate)}</td>`
      + `<td class="n">${A.refused ? `<span class="refuse-in">${esc(A.refused)}</span>` : ci(A.ci95)}</td>`
      + `<td class="n">${R.count}/${cRel.kept}</td><td class="n">${R.refused ? "—" : pct(R.rate)}</td>`
      + `<td class="n">${R.refused ? `<span class="refuse-in">${esc(R.refused)}</span>` : ci(R.ci95)}</td></tr>`;
  }).join("\n")}
    </tbody>
  </table>`;
}

function hawaiiTable(cAll, cRel, from) {
  const r = (label, A, R) => `      <tr><th>${esc(label)}</th>`
    + `<td class="n">${A.count}/${cAll.kept}</td><td class="n">${A.refused ? "—" : pct(A.rate)}</td>`
    + `<td class="n">${A.refused ? `<span class="refuse-in">${esc(A.refused)}</span>` : ci(A.ci95)}</td>`
    + `<td class="n">${R.count}/${cRel.kept}</td><td class="n">${R.refused ? "—" : pct(R.rate)}</td>`
    + `<td class="n">${R.refused ? `<span class="refuse-in">${esc(R.refused)}</span>` : ci(R.ci95)}</td></tr>`;
  return `  <table class="stat wide">
    <thead><tr><th>Outcome</th><th class="n">Storms</th><th class="n">Rate</th><th class="n">95% Wilson</th><th class="n">From ${from}</th><th class="n">Rate</th><th class="n">95% Wilson</th></tr></thead>
    <tbody>
${r("Hawaiʻi landfall, any intensity", cAll.hawaii_any, cRel.hawaii_any)}
${r("Hawaiʻi landfall, ≥ 64 kt", cAll.hawaii_hurricane, cRel.hawaii_hurricane)}
    </tbody>
  </table>
  <p class="note">Regions the cohort's storms never approached are refused rather than reported as
  zero: ${Object.entries(cAll.other_regions).filter(([, c]) => c.refused).map(([n, c]) => `<b>${esc(n.replace(/_/g, " "))}</b> ${esc(c.refused)}`).join(", ") || "none"}.
  A refused region is not a region with no risk; it is a region this cohort cannot measure.</p>`;
}

/* ---- style ------------------------------------------------------------------------------- */

const CSS = `
:root{ --dz-rule:1px solid var(--border-dim); --dz-max:informal; }
*{box-sizing:border-box}
body{margin:0;background:var(--surface-app);color:var(--text-1);
  font-family:var(--font-sans);font-variant-numeric:tabular-nums;
  -webkit-font-smoothing:antialiased;line-height:1.5}
.dossier{max-width:1080px;margin:0 auto;padding:48px 32px 96px}
h1,h2,h3{font-weight:600;letter-spacing:-.01em}
h1{font-size:44px;line-height:1.05;margin:6px 0 4px}
h1 .id{font-family:var(--font-mono);font-size:20px;font-weight:400;color:var(--text-2);
  letter-spacing:.02em;vertical-align:middle;margin-left:10px}
h2{font-size:21px;margin:0 0 14px;display:flex;align-items:baseline;gap:12px}
h3{font-size:14px;margin:26px 0 8px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-2)}
.callout h3{margin-top:0;color:inherit;text-transform:none;letter-spacing:0;font-size:15px}
h2 .num{font-family:var(--font-mono);font-size:12px;color:var(--text-2);border:var(--dz-rule);
  border-radius:2px;padding:2px 7px;font-weight:400;flex:none}

/* masthead */
.mast{border-bottom:2px solid var(--text-1);padding-bottom:20px;margin-bottom:36px}
.kicker{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.18em;color:var(--text-2)}
.mast .sub{font-family:var(--font-mono);font-size:12px;color:var(--text-2);margin-top:2px}
.stamps{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:14px;
  font-family:var(--font-mono);font-size:10.5px;color:var(--text-2)}

section{margin:0 0 44px;padding-top:8px;border-top:var(--dz-rule)}
section:first-of-type{border-top:0}
.key{border-top:0}
p{margin:9px 0;max-width:76ch}
.lead{font-size:16px;color:var(--text-1);margin-top:0}
.note{font-size:12.5px;color:var(--text-2);max-width:82ch}
.q{color:var(--text-2);font-size:12px}
code{font-family:var(--font-mono);font-size:.92em;color:var(--text-2)}
b{font-weight:600}

/* tables */
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
th,td{text-align:left;padding:6px 10px;border-bottom:var(--dz-rule);vertical-align:top}
thead th{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;color:var(--text-2);
  text-transform:uppercase;font-weight:400;border-bottom:1px solid var(--border-strong)}
tbody th{font-weight:500;color:var(--text-1);width:1%;white-space:nowrap}
.n{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
thead .n{text-align:right}
.th2{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.04em;color:var(--text-2);
  text-transform:none;font-weight:400}
tr.dim td,tr.dim th{color:var(--text-2)}
tr.mark td,tr.mark th{background:var(--surface-sunken)}
.chron .t{font-family:var(--font-mono);font-size:11.5px;white-space:nowrap;color:var(--text-2)}
.also{color:var(--text-2);font-size:12px;margin-top:2px}
.cmp tbody th{width:24%}
/* A three-column comparison is read ACROSS, not summed down, so its values sit under their own
   column heading rather than pushed to the far right of it. Right alignment is for a column of
   numbers being compared to each other; these are two different sources answering one question. */
.cmp td.n{text-align:left}
.stat tbody th{width:1%;padding-right:14px}
.wide tbody th{width:26%;white-space:normal}
.verdicts{margin:8px 0}
.verdicts td,.verdicts th{border-bottom:0;padding:3px 10px 3px 0;font-size:12.5px}
.v-matched{color:var(--pos);font-family:var(--font-mono);font-size:11px}
.v-missed{color:var(--neg);font-family:var(--font-mono);font-size:11px}
.v-unjudged,.v-unchecked{color:var(--warn);font-family:var(--font-mono);font-size:11px}

/* provenance tags */
.tag{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;padding:2px 5px;
  border:1px solid currentColor;border-radius:2px;white-space:nowrap;display:inline-block}
.t-archive{color:var(--text-2)}
.t-operational{color:var(--accent)}
.t-derived{color:var(--text-2)}
.t-recordedmillibar{color:var(--accent)}
.flag{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;color:var(--warn)}
.pos{color:var(--pos)}.neg{color:var(--neg)}
.refuse-in{font-family:var(--font-mono);font-size:10px;color:var(--warn);letter-spacing:.04em}

/* callouts */
.callout{border:var(--dz-rule);border-left:3px solid var(--text-2);
  padding:14px 18px;margin:18px 0;background:var(--surface-sunken);border-radius:var(--radius-sm)}
.callout.warn{border-left-color:var(--warn)}
.callout.refuse{border-left-color:var(--neg)}
.callout p{margin:7px 0}
.callout p:first-of-type{margin-top:0}

/* close */
.cta{border:2px solid var(--text-1);padding:20px 22px;margin-top:24px;border-radius:var(--radius-sm)}
.cta h3{margin:0 0 6px;font-size:17px;text-transform:none;letter-spacing:-.01em;color:var(--text-1)}
.cta p{margin:0;color:var(--text-2);font-size:13px}
footer{border-top:var(--dz-rule);padding-top:16px;margin-top:8px}
footer p{font-size:11.5px;color:var(--text-2);max-width:none}

@media (max-width:820px){
  .dossier{padding:28px 16px 64px}
  h1{font-size:32px}
  table{font-size:12px}
  th,td{padding:5px 6px}
  .chron .t{font-size:10.5px}
}

/* PRINT / PDF. One page per section boundary is not attempted; what is enforced is that a table
   never splits across a page break in the middle of a row, and that the provenance tags stay
   legible without colour. */
@media print{
  body{background:#fff;color:#000}
  .dossier{max-width:none;padding:0}
  section{break-inside:auto;page-break-inside:auto}
  tr,.callout,.cta{break-inside:avoid;page-break-inside:avoid}
  h2,h3{break-after:avoid;page-break-after:avoid}
  .tag{border-color:#666;color:#000}
  .callout{background:#f4f4f4}
  a[href]:after{content:""}
}
`;
