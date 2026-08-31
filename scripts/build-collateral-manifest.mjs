#!/usr/bin/env node
/* Writes the source manifest and the replay-URL index. The collateral is rendered FROM these;
 * nothing downstream may publish a number this file does not contain. */
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "./lib/collateral-data.mjs";
import { ROOT } from "./lib/atlas-verify.mjs";

const D = await build();
const OUT = join(ROOT, "docs/collateral");
mkdirSync(OUT, { recursive: true });

/* The archive object and the decoded coastline are build-time handles, not evidence. */
const { coast, archive, byId, ...rest } = D;
const manifest = {
  ...rest,
  systems: D.systems.map((s) => {
    /* Track geometry is drawn, not published, and it is bulky. The manifest records that it
       exists and how many points it carries; the plates read it from the live build. */
    const { tracks, all_member_tracks, ...keep } = s;
    return { ...keep, track_geometry: {
      cohort_members_drawn: all_member_tracks.length,
      points: all_member_tracks.reduce((n, t) => n + t.points.length, 0),
      note: "Drawn from the archive track_points pack. A drawn track is not a rate.",
    } };
  }),
};
writeFileSync(join(OUT, "source-manifest.json"), JSON.stringify(manifest, null, 2));

const urls = D.systems.map((s) => ({
  id: s.id, name: s.name, point_type: s.point_type,
  coordinates: s.coordinates_queried, radius_km: s.radius_km,
  season_floor: s.season_floor, month_window: s.month_window,
  n: s.cohort.n_cases, status: s.cohort.cohort_status,
  question: s.question, cite: s.cite, replay_url: s.replay_url,
}));
writeFileSync(join(OUT, "replay-urls.json"), JSON.stringify({
  schema: "storm-atlas-collateral-replay/1",
  methodology_version: D.pack.methodology_version,
  archive_stamp: D.pack.archive_stamp,
  site: D.pack.site,
  cohorts: urls,
}, null, 2));

/* A compact, human-readable index of every published figure, for the ledger check. */
const lines = [];
lines.push(`STORM ATLAS COLLATERAL — SOURCE MANIFEST`);
lines.push(`METHODOLOGY ${D.pack.methodology_version} · PACK ${D.pack.archive_stamp} · ARCHIVE BUILT ${D.pack.archive_built_utc}`);
lines.push(`ARCHIVE ${D.pack.counts.storms} storms / ${D.pack.counts.track_points} track points / ${D.pack.counts.landfalls} landfall rows`);
lines.push("");
for (const s of D.systems) {
  lines.push(`## ${s.id} — ${s.name}`);
  lines.push(`   POINT TYPE      ${s.point_type}`);
  lines.push(`   COORDS QUERIED  ${s.coordinates_queried.lat}N ${Math.abs(s.coordinates_queried.lon)}W`);
  lines.push(`   RADIUS          ${s.radius_km} km`);
  lines.push(`   SEASON WINDOW   floor ${s.season_floor}, ${s.month_window}`);
  lines.push(`   COHORT N        ${s.cohort.n_cases}  (ESS ${s.cohort.effective_sample_size}, min sample ${s.cohort.min_sample})`);
  lines.push(`   COHORT STATUS   ${s.cohort.cohort_status}`);
  lines.push(`   QUESTION        ${s.question}`);
  lines.push(`   ROWS:`);
  for (const r of [...s.intensity_rows, ...s.landfall_rows]) {
    const rate = r.rate === null ? "RATE REFUSED" :
      `${(100 * r.rate).toFixed(1)}%  [${(100 * r.ci95[0]).toFixed(0)}-${(100 * r.ci95[1]).toFixed(0)}%]`;
    lines.push(`     ${r.label.padEnd(22)} ${String(r.count).padStart(3)}/${String(r.n_storms).padEnd(4)} ${rate.padEnd(28)} ${r.status ? r.status : "(no row status returned)"}`);
  }
  if (Object.keys(s.unscoreable).length) {
    lines.push(`   UNSCOREABLE CONTRACTS:`);
    for (const [k, u] of Object.entries(s.unscoreable)) {
      lines.push(`     ${k}: ${u.status} — ${u.scope_events} in scope (${u.scope}) / ${u.archive_events} archive-wide, ${u.required} required`);
    }
  }
  for (const g of s.gaps) lines.push(`   GAP: ${g}`);
  const t = s.time_to_event;
  for (const k of Object.keys(t)) {
    if (!t[k] || !t[k].n) continue;
    lines.push(`   TIME TO ${k}: n=${t[k].n} median ${t[k].median} h  p25 ${t[k].p25}  p75 ${t[k].p75}`);
  }
  lines.push(`   REPRESENTATIVES (${s.representatives.printed} printed, shortfall ${s.representatives.shortfall}):`);
  for (const m of s.representatives.members) {
    lines.push(`     ${m.name} ${m.season} — ${m.peak_vmax_kt} kt, genesis ${(m.genesis_utc||"").slice(0,10)}, ${m.distance_km} km from cell`
      + (m.landfalls.length ? `, landfall: ${m.landfalls.map((l) => `${l.region}${l.sub_region ? "/" + l.sub_region : ""} ${l.vmax_kt} kt`).join("; ")}` : ", no modelled landfall"));
  }
  lines.push(`   CITE: ${s.cite}`);
  lines.push(`   URL:  ${s.replay_url}`);
  lines.push("");
}
lines.push(`## OPERATIONAL LAYER (atlas-live-v1) — generated ${D.operational.generated_at}`);
for (const s of D.operational.storms) {
  lines.push(`   ${s.atcf_id} ${s.name} — ${s.stage_label}, latest fix ${s.latest_valid_time}: `
    + `${s.latest.lat}N ${Math.abs(s.latest.lon)}W ${s.latest.kt} kt ${s.latest.mslp} mb; peak ${s.peak_wind_kt} kt; age ${s.age_hours} h; active ${s.active}`);
}
lines.push("");
lines.push(`## NHC GRAPHICAL OUTLOOK (live, ingested ${D.feeds_generated_at})`);
for (const o of D.outlook) {
  lines.push(`   ${o.id || "(no id)"} ${o.basin} — ${o.title}: 48h ${o.pct48 === null ? "n/a" : o.pct48 + "%"}, 7d ${o.pct7d}% · issued ${o.issued}`);
}
writeFileSync(join(OUT, "source-manifest.txt"), lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nwrote docs/collateral/source-manifest.json, source-manifest.txt, replay-urls.json`);
