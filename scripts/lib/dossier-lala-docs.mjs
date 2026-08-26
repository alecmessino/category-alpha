/* The dossier's companion documents, rendered from the same facts as the page.
 *
 * WHY THESE ARE GENERATED TOO. A one-page summary and three outreach notes are exactly the
 * artefacts that get written once, pasted into an email six weeks later, and quote a peak wind the
 * deck has since revised. Every number below comes from the same `facts` object the page is built
 * from, so the summary cannot disagree with the dossier it summarises.
 *
 * NO CARRIER IS NAMED IN ANY OF THEM. The outreach notes are addressed to a risk FUNCTION —
 * parametric structuring, NatCat / alternative risk transfer, catastrophe-risk investment — and
 * make no claim about any firm's book, policy wording, trigger geometry or attachment. There is
 * no public source in hand for one, so there is nothing to say about one.
 */

const Z = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + "Z";
const Zd = (ms) => new Date(ms).toISOString().slice(0, 10);
const dur = (h) => {
  const a = Math.abs(h);
  if (a < 1) return `${Math.round(h * 60)} min`;
  if (a < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
};
const km = (v) => `${Math.round(v).toLocaleString()} km`;
const pct = (r) => (r === null ? "—" : `${(100 * r).toFixed(1)}%`);
const ci = (c) => (c === null ? "—" : `${(100 * c[0]).toFixed(1)}–${(100 * c[1]).toFixed(1)}%`);
const nameCase = (s) => String(s || "").replace(/\b([A-Z])([A-Z]+)\b/g,
  (_, a, b) => a + b.toLowerCase());
const CAT = { ts: "Tropical Storm", cat1: "Category 1", cat2: "Category 2", cat3: "Category 3",
  cat4: "Category 4", cat5: "Category 5" };

/* ---------------------------------------------------------------------------------------- */

/* ONE PAGE MEANS ONE PAGE. This is the email attachment, and it prints to a single side: the
   dossier itself is at /dossier/lala and carries the full chronology, the six-row threshold table,
   the SHIPS series and the 141-entry ledger. What survives the cut is what a reader must not be
   allowed to reconstruct wrongly — the two peaks belong to two different records, the archive
   stops before the nearest passage, the cohort excludes its own subject, the Hawaii numerator is
   one 1959 storm, and both the genesis environment and the post-1971 Hawaii rate are refusals. */
export function renderSummary(f) {
  const a = f.archive_record;
  const o = f.operational_record;
  const g = f.geometry;
  const cA = f.cohort.all_seasons;
  const cR = f.cohort.reliable_era;
  const rec = f.recorded;
  const dot = f.cohort.hawaii_contributors[0];
  const ge = f.environment.genesis_environment;
  const mhi = g.closest_main_islands;

  return `# Lala ${a.atcf_id} — event dossier

**Millibar · ${a.season} ${a.basin}/${a.subbasin} Pacific · archive id ${a.storm_id} · built ${Z(Date.parse(f.built_utc))}**
Archive ${f.archive_provenance.archive_stamp} · methodology ${f.archive_provenance.methodology_version} · full dossier \`/dossier/lala\` · facts \`facts.json\`
Insurance / reinsurance contract facts used: **${f.insurance_contract_facts}**.

**Two records describe this storm. They begin at the same instant, ${Z(a.first_fix_t)}, and end ${dur(o.extends_archive_by_hours)} apart.**

| | ARCHIVE — IBTrACS, provisional | OPERATIONAL — ATCF b-deck |
|---|---|---|
| Last fix | ${Z(a.end_t)} | ${Z(o.latest_t)} |
| Peak wind | ${a.max_vmax_kt} kt, ${CAT[a.max_category]} | **${o.peak_wind_kt} kt, ${CAT[o.peak_category]}** |
| Minimum pressure | ${a.min_mslp_mb} mb | **${o.min_mslp_mb} mb** |
| Fixes | ${a.fixes} (${a.fixes_pre_genesis} pre-genesis) | ${o.fixes} (${o.fixes_pre_genesis} pre-genesis) |

Neither record corrects the other. Every statistic below is computed from the archive alone.

**This was not a ${CAT[o.peak_category]} near-miss of Hawaiʻi.** Closest approach to the Main
Hawaiian Islands was **${km(mhi.km)}** at ${Z(mhi.t)}, at ${mhi.kt} kt. The ${o.peak_wind_kt} kt peak
came ${dur((g.at_peak.t - mhi.t) / 3600000)} later, ${km(g.at_peak.mhi_km)} from the islands —
${km(g.at_peak.mhi_km - mhi.km)} further away than at the nearest passage, and
${(g.at_peak.mhi_km / mhi.km).toFixed(0)}× it. Intensity and proximity did not coincide. Distances are
minimum geodesic distance to coastline *segments* of the archive's own Hawaiʻi geometry, not to
stored vertices; the northwestern chain (closest approach ${km(g.closest_nwhi.km)}, ${Z(g.closest_nwhi.t)}) is
partitioned out by ring, because it is uninhabited and runs ${km(g.group_extent.nwhi_extends_west_km)} further west.

**The archive record ends ${dur(g.archive_ends_before_closest_approach_hours)} before that closest approach**,
at ${km(g.at_archive_end.mhi_km)} and still closing. Everything after ${Z(a.end_t)} exists only in the
operational record.

**The environment Lala formed in is REFUSED.** ${ge.refusal}

**What the historical record supports.** Storms forming within ${f.cohort.where.radiusKm} km of
${f.cohort.where.lat.toFixed(1)}°N ${Math.abs(f.cohort.where.lon).toFixed(1)}°W — N = **${cA.kept}**, effective sample size ${cA.effective_sample_size}, minimum ${cA.min_sample}, sufficient.

| Outcome | All seasons | 95% Wilson | From ${f.cohort.reliable_era_from} | 95% Wilson |
|---|---|---|---|---|
| Reached Cat 3+ | ${cA.thresholds.cat3.count}/${cA.kept} · ${pct(cA.thresholds.cat3.rate)} | ${ci(cA.thresholds.cat3.ci95)} | ${cR.thresholds.cat3.count}/${cR.kept} · ${pct(cR.thresholds.cat3.rate)} | ${ci(cR.thresholds.cat3.ci95)} |
| Reached Cat 4+ | ${cA.thresholds.cat4.count}/${cA.kept} · ${pct(cA.thresholds.cat4.rate)} | ${ci(cA.thresholds.cat4.ci95)} | ${cR.thresholds.cat4.count}/${cR.kept} · ${pct(cR.thresholds.cat4.rate)} | ${ci(cR.thresholds.cat4.ci95)} |
| Hawaiʻi landfall, any | ${cA.hawaii_any.count}/${cA.kept} · ${pct(cA.hawaii_any.rate)} | ${ci(cA.hawaii_any.ci95)} | ${cR.hawaii_any.count}/${cR.kept} | **${cR.hawaii_any.refused}** |

Cumulative thresholds, not exclusive bins. Three qualifications, printed rather than buried:

1. **Lala is not in this cohort.** Its genesis defines the location condition; the archive's
   provisional-record scope then excludes it. No operational value enters any number above.
2. **The entire Hawaiʻi numerator is one storm** — ${nameCase(dot.name)} (${dot.season}), ${dot.landfalls[0].sub_region},
   ${Zd(dot.landfalls[0].t)}, ${dot.landfalls[0].vmax_kt} kt, detection \`${dot.landfalls[0].detection}\`. ${pct(cA.hawaii_any.rate)} with a numerator of one
   1959 event is a count, not a frequency, and ${ci(cA.hawaii_any.ci95)} says so.
3. **Under the archive's own quality remedy the rate refuses.** A season floor of
   ${f.cohort.reliable_era_from} — which the archive recommends, because ${cA.kept - cR.kept} of ${cA.kept}
   cohort storms predate the reliably-observed era — removes ${nameCase(dot.name)} and the outcome becomes
   ${cR.hawaii_any.count}/${cR.kept}: **${cR.hawaii_any.refused}**.

**That is the answer about Hawaiʻi risk at this genesis point: over the reliably-observed era, the
record declines to support a rate at all.**

**What Millibar recorded, and when.** ${rec.entries} timestamped entries, ${Z(rec.first_t)} to
${Z(rec.last_t)}, on one question — \`${rec.questions[0]}\`, whether Lala would reach ${rec.threshold_kt} kt.
Not a Hawaiʻi question, not a ${CAT[o.peak_category]} question; no record of either exists. First
record ${Z(rec.first_t)} at ${pct(rec.checkpoints[0].pRaw)}, ${dur(rec.checkpoints[0].lead_hours_to_outcome)} before
Lala reached ${rec.threshold_kt} kt at ${Z(rec.outcome.t)}.

**This demonstrates point-in-time replay discipline, not forecasting skill.** The calibration
ledger declines to publish a score: ${rec.calibration.resolved_storms} resolved storms of the
${rec.calibration.required_storms} required. One storm cannot establish calibration and this document
does not claim it does. What it establishes is that those values were recorded before the outcome
and have not been edited since.

**The separation is enforced, not observed.** No module computing cohort membership, analog
matching, rates, Wilson intervals, effective sample size, calibration or a refusal can reach the
operational layer: a build gate walks the import graph, and a second recomputes every published
historical value with the operational artifact absent and again with it loaded, requiring both to
be identical.

---
**${CTA}**

Research use. Not a forecast, not advice, not an offer. Every value above is reproduced by
\`node scripts/build-dossier-lala.mjs\` and recorded in \`facts.json\`.
`;
}

/* ---------------------------------------------------------------------------------------- */

export function renderDemoScript(f) {
  const a = f.archive_record;
  const o = f.operational_record;
  const g = f.geometry;
  const cA = f.cohort.all_seasons;
  const cR = f.cohort.reliable_era;
  const rec = f.recorded;
  const dot = f.cohort.hawaii_contributors[0];

  return `# Lala dossier — 3-minute demo script

Two surfaces: \`/storm-atlas\` (select ${a.atcf_id}) and \`/dossier/lala\`. No slides.
Timings are cumulative. Every number below is on screen — do not quote one that is not.

---

## 0:00 – 0:25 · The failure, stated first

**Screen:** Storm Atlas, ${a.atcf_id} selected.

> "This is Lala. The archive — IBTrACS, the source every catastrophe model validates against —
> holds ${a.fixes} fixes, ${a.max_vmax_kt} knots, ${CAT[a.max_category]}, ending ${Z(a.end_t)}.
> The forecast office's own record has ${o.fixes} fixes, ${o.peak_wind_kt} knots,
> ${CAT[o.peak_category]}, and it is still open. Both are correct. They answer different
> questions."

**Point at:** the \`OPERATIONAL / PROVISIONAL\` badge and the \`ATCF B-DECK · THROUGH\` line.

## 0:25 – 1:00 · Where the archive stops

**Screen:** \`/dossier/lala\`, section 2, the chronology.

> "Watch the distance column. Lala starts ${km(g.main_islands_km_by_t[o.first_fix_t])} from the
> main Hawaiian islands and closes. The archive record ends here —" **[point: ${Z(a.end_t)}]** —
> "at ${km(g.at_archive_end.mhi_km)}, still closing. Six hours later it passes at
> ${km(g.closest_main_islands.km)}. The archive stops
> ${dur(g.archive_ends_before_closest_approach_hours)} before the closest approach of the event."

## 1:00 – 1:30 · The interpretation to reject

> "Lala peaked at ${o.peak_wind_kt} knots. It would be easy to sell that as a
> ${CAT[o.peak_category]} near-miss of Hawaiʻi. It was not. The peak was
> ${dur((o.peak_wind_t - g.closest_main_islands.t) / 3600000)} later and
> ${km(g.at_peak.mhi_km)} from those islands — ${(g.at_peak.mhi_km / g.closest_main_islands.km).toFixed(0)} times
> the closest approach. Intensity and proximity did not coincide. That separation is the thing
> worth studying."

## 1:30 – 2:20 · What the record will and will not support

**Screen:** section 3.

> "Now the historical question: what happened to storms that formed where Lala formed?
> ${cA.kept} storms, effective sample size ${cA.effective_sample_size}, every rate with a Wilson
> interval. ${pct(cA.thresholds.cat4.rate)} reached ${CAT.cat4} or higher — interval
> ${ci(cA.thresholds.cat4.ci95)}."

> "Hawaiʻi landfall: ${cA.hawaii_any.count} of ${cA.kept}. One storm —
> ${nameCase(dot.name)}, ${dot.season}, ${dot.landfalls[0].sub_region}. The archive then tells us
> its own data is not good enough:" **[point: the gap statement]** "${cA.kept - cR.kept} of these
> ${cA.kept} storms predate ${f.cohort.reliable_era_from}, when major hurricanes were
> under-observed. Apply the archive's own remedy —" **[point: the ${f.cohort.reliable_era_from}
> column]** "— and the cohort drops to ${cR.kept}, ${nameCase(dot.name)} drops out, and the
> Hawaiʻi rate stops existing: **${cR.hawaii_any.refused}**."

> "Most systems would have shown you ${pct(cA.hawaii_any.rate)}. This one shows you why that
> number should not be used."

**Also point at:** *Lala is not in this cohort* — it is excluded by the archive's own provisional
scope, so no live data touches the statistics.

## 2:20 – 2:50 · Point-in-time, not hindsight

**Screen:** section 4.

> "${rec.entries} timestamped entries, on one recorded question: would it reach
> ${rec.threshold_kt} knots. At ${Z(rec.first_t)} the system recorded
> ${pct(rec.checkpoints[0].pRaw)}, ${dur(rec.checkpoints[0].lead_hours_to_outcome)} before it did.
> That is what the system held then, unedited."

> "And the calibration ledger refuses to score it: ${rec.calibration.resolved_storms} resolved
> storms of ${rec.calibration.required_storms}. One storm is not skill. This is replay discipline
> — the precondition for measuring skill honestly later."

## 2:50 – 3:00 · Close

> "Two sources, five provenance classes, never blended, refusals on the page rather than in a
> footnote. No insurance or reinsurance contract fact anywhere in it. If you want to test it
> against your own exposure and your own trigger terms, that is the conversation."

---

**Do not say:** that Millibar predicted ${CAT[o.peak_category]}; that it predicted anything about
Hawaiʻi; that the ledger shows skill; that any carrier, policy or trigger is involved; that
${pct(cA.hawaii_any.rate)} is a Hawaiʻi landfall probability.
`;
}

/* ---------------------------------------------------------------------------------------- */

const CTA = "Request an institutional walkthrough / design-partner discussion.";
const FOOTER = (f) => `---
Millibar · \`/dossier/lala\` · built ${Z(Date.parse(f.built_utc))} · archive `
  + `${f.archive_provenance.archive_stamp} · methodology ${f.archive_provenance.methodology_version}
Insurance / reinsurance contract facts used: ${f.insurance_contract_facts}. No carrier, policy,
trigger geometry, attachment threshold or payout function is named, reconstructed or implied. The
${f.external_public_contract.kind} \`${f.external_public_contract.id}\` appears as a recorded price
in one column of the dossier's section 4 and is labelled there.
Research use. Not a forecast, not advice, not an offer.`;

export function renderOutreach(f) {
  const a = f.archive_record;
  const o = f.operational_record;
  const g = f.geometry;
  const cA = f.cohort.all_seasons;
  const cR = f.cohort.reliable_era;
  const rec = f.recorded;
  const dot = f.cohort.hawaii_contributors[0];

  const spine = `Lala (${a.atcf_id}, ${a.season}) is the worked example. The archive record every `
    + `model validates against holds ${a.fixes} fixes, ${a.max_vmax_kt} kt, ${a.min_mslp_mb} mb, `
    + `ending ${Z(a.end_t)}. The forecast office's own record holds ${o.fixes} fixes, `
    + `${o.peak_wind_kt} kt, ${o.min_mslp_mb} mb, and was still open at ${Z(o.latest_t)}. `
    + `Millibar preserves both, labels both, and blends neither.`;

  return {
    "parametric.md": `# Millibar — parametric structuring and index research

*Audience: parametric structuring / index design. No claim is made about any firm's book.*

${spine}

Three things in the dossier that bear directly on index design:

- **Intensity and proximity separated.** Lala's closest approach to the Main Hawaiian Islands was
  ${km(g.closest_main_islands.km)} at ${g.closest_main_islands.kt} kt (${Z(g.closest_main_islands.t)}).
  Its peak, ${o.peak_wind_kt} kt, came ${dur((o.peak_wind_t - g.closest_main_islands.t) / 3600000)}
  later, ${km(g.at_peak.mhi_km)} from those islands. A separation of that size in space and time is the
  research object behind basis risk. Millibar can support basis-risk analysis once actual exposure
  locations and trigger terms are supplied; without them this is a measurement, not an analysis.
- **The reporting source stops before the event does.** IBTrACS ended
  ${dur(g.archive_ends_before_closest_approach_hours)} before that closest approach. An index
  settled on a provisional archive is settling on a record that may not yet cover the moment that
  matters.
- **Distances are computed to coastline segments**, not to the nearest stored vertex, over
  versioned geometry with a build stamp.

Threshold crossings, elapsed times and their intervals are re-derivable over
${f.archive_provenance.storms.toLocaleString()} archive storms under a stated rule, in the
browser, from a URL.

${CTA}

${FOOTER(f)}
`,

    "natcat-art.md": `# Millibar — NatCat research and alternative risk transfer

*Audience: NatCat research / ART structuring. No claim is made about any firm's book.*

${spine}

What the dossier demonstrates that a vendor view usually does not:

- **The record refuses.** Around Lala's genesis point the cohort is ${cA.kept} storms
  (effective sample size ${cA.effective_sample_size}). Hawaiʻi landfall is
  ${cA.hawaii_any.count}/${cA.kept} — and the entire numerator is one storm,
  ${nameCase(dot.name)} (${dot.season}). The archive then states its own defect: ${cA.kept - cR.kept}
  of the ${cA.kept} predate ${f.cohort.reliable_era_from}, when major hurricanes were
  under-observed. Apply its recommended remedy and the cohort falls to ${cR.kept}, the numerator
  goes to zero, and the rate is withheld: **${cR.hawaii_any.refused}**. The system publishes the
  refusal rather than the ${pct(cA.hawaii_any.rate)}.
- **Provisional and post-analysed records are kept apart.** Lala is excluded from its own
  historical cohort by the archive's provisional scope, so no live value reaches any statistic.
  That exclusion is enforced by a build gate, not by convention.
- **Every rate carries its interval and its sample.** ${pct(cA.thresholds.cat4.rate)} reached
  ${CAT.cat4} or higher, interval ${ci(cA.thresholds.cat4.ci95)}, ${cA.thresholds.cat4.count} of
  ${cA.kept}.

Useful as an independent reference to challenge an in-house or vendor view against — including
where it declines to answer.

${CTA}

${FOOTER(f)}
`,

    "ils.md": `# Millibar — catastrophe-risk investment and ILS

*Audience: ILS / catastrophe-risk investment analysis. No claim is made about any firm's book.*

${spine}

Why this matters to a note-holder rather than a meteorologist:

- **Settlement sources disagree, and the disagreement is large.** ${o.peak_wind_kt} kt against
  ${a.max_vmax_kt} kt; ${o.min_mslp_mb} mb against ${a.min_mslp_mb} mb; a record open
  ${dur(o.extends_archive_by_hours)} past the archive's end. Which source a structure references,
  and at what point in its revision cycle, is a term worth reading.
- **Historical validation you can reproduce.** ${cA.kept} storms around this genesis point, every
  outcome a cumulative threshold with a Wilson interval and a stated effective sample size,
  computed in the browser from a versioned pack (archive ${f.archive_provenance.archive_stamp},
  ${f.archive_provenance.storms.toLocaleString()} storms).
- **Point-in-time state, kept honestly.** ${rec.entries} timestamped entries for this storm, with
  source-valid time and ingestion time recorded separately, so a backtest reads what was knowable
  then. The calibration ledger declines to publish a score at
  ${rec.calibration.resolved_storms}/${rec.calibration.required_storms} resolved storms — it is a
  provenance record, not a track record, and it says so.

No skill claim is made or implied.

${CTA}

${FOOTER(f)}
`,
  };
}
