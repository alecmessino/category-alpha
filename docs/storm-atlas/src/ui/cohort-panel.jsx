/* WHAT HAPPENED NEXT.
 *
 * The answer half of the surface the builder asks from. It renders for ANY cohort, not only for
 * one with a location: until 3.2 this panel existed solely to answer a click on open water, and
 * a reader who narrowed to "Cat 3+, since 1971, Aug-Sep" got a map and no statistics at all. One
 * spec, one answer -- so if the cohort exists, its outcomes are published.
 *
 * WHAT IT PUBLISHES, AND UNDER WHICH RULES. The conditioned rates are ported and proven at
 * parity with the archive's own analog query, so they appear -- under the same four panel rules
 * the terminal's Analog Prior panel keeps, because two surfaces of one archive must not disagree
 * about how a rate is shown. The rules live in outcome-card.jsx, which is the only place a rate
 * is rendered.
 *
 * ORDER IS AN ARGUMENT. The cohort and its evidence come first, then what these storms became,
 * then where they went, then how long it took, then what the rates assume, then every gap the
 * archive recorded, and only then the storms themselves. A reader who stops early stops having
 * read the sample size, never having read a percentage.
 */

import React from "react";
import { CATEGORY_COLOR, CATEGORY_ORDER } from "../render/palette.js";
import { formatPosition } from "../engine/geo.js";
import { Chip, Gap, Head, MONO, Num, OverDenom, Row, Txt, claimText } from "./kit.jsx";
import { ConditionedGroup, OutcomeCard, RateLine } from "./outcome-card.jsx";
import { Refusal } from "./refusal.jsx";
import { EnvLens } from "./env-lens.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

export function CohortPanel({ spec, result, sentence, onSelectStorm, onShowPathway, pathwayOn,
  peak, pathway, comparison, onBaseline, conditions, archive, envCoverage, envLens,
  envLoading, onLoadEnv }) {
  if (!result) return null;
  const r = result;
  const n = r.n_cases;

  return (
    <div style={{ padding: "var(--sp-5) var(--sp-6) var(--sp-8)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-title)",
        fontWeight: "var(--fw-black)", color: "var(--text-1)", letterSpacing: "-.2px",
        lineHeight: "var(--lh-tight)" }}>
        WHAT HAPPENED NEXT
      </div>
      <div data-cohort-answer style={{ fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-caption)", color: "var(--text-2)", lineHeight: "var(--lh-body)",
        marginTop: 3 }}>
        {sentence}
      </div>
      {spec.where ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--accent)",
          marginTop: 3 }}>
          {formatPosition(spec.where.lat, spec.where.lon)} · {spec.where.radiusKm} km
        </div>
      ) : null}

      {n === 0 ? <NoCohort spec={spec} gaps={r.gaps} /> : (
        <>
          <Head>THE COHORT</Head>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)" }}>
            <span style={{ ...MONO, fontSize: "var(--fs-stat)", fontWeight: 800,
              color: "var(--text-1)", lineHeight: 1 }}>{n}</span>
            <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-2)" }}>
              storms
            </span>
          </div>
          <Row k="effective sample size"
            title="Kish's ESS. Every storm in a cohort counts once -- membership is decided by
                   hard conditions rather than by a weight -- so the ESS is the count itself,
                   and no storm here is standing in for another. A distance-weighted analog pool
                   does not have that property. The sample gate is applied to the RAW count."
            v={<Num value={r.effective_sample_size} digits={1} />} />
          <Row k="sample gate" v={
            r.sufficient
              ? <span style={{ ...MONO, color: "var(--pos)" }}>
                  SUFFICIENT · {n} ≥ {r.min_sample}</span>
              : <span style={{ ...MONO, color: "var(--neg)" }}>
                  BELOW SAMPLE · {n} &lt; {r.min_sample}</span>} />
          {/* WHY NO WEIGHTED RATE HERE, said rather than silently omitted.
              The archive's analog query weights each case by a Gaussian in distance from the
              query point, and the browser computes that identically -- the parity harness
              proves it. A COHORT is a different query: "within 800 km" is a hard membership
              condition, already spent, and weighting by distance again would count the same
              variable twice and publish a statistic the archive does not publish for a
              filter-defined pool. So every member counts once, the weighted rate equals the
              unweighted one, and this surface says so instead of printing the same number
              twice under two names. */}
          {spec.where ? (
            <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
              lineHeight: "var(--lh-body)", marginTop: 3 }}>
              Every storm here counts once. Distance is already a condition of membership —
              within {spec.where.radiusKm} km — so it is not also used as a weight; weighting by
              it again would count the same variable twice. The weighted rate would equal the
              unweighted rate, and is not printed twice under two names.
            </div>
          ) : null}
          <Row k="seasons in cohort" v={<Txt value={seasonSpan(r.cases)} />} />
          <Row k="median genesis" v={<Txt value={medianPosition(r.cases)} />} />

          {comparison ? (
            <Baseline c={comparison} conditions={conditions} onBaseline={onBaseline} />
          ) : null}

          <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
            color: "var(--text-2)" }}>count · rate · 95% Wilson</span>}>WHAT THEY BECAME</Head>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            lineHeight: "var(--lh-body)", marginBottom: "var(--sp-2)" }}>
            Distinct storms reaching each threshold, over the storms whose intensity the archive
            actually recorded. The pale band on each bar is the 95% interval — its width is the
            sample speaking.
          </div>
          {/* The circular rows are grouped and explained once; everything the cohort did NOT
              define gets its own card. Splitting them this way is what keeps the fifth rule
              legible when it fires on four contracts at once. */}
          <ConditionedGroup rows={circularRows(r)} reason={circularReason(r)} />
          {CATEGORY_ORDER.filter((c) => c !== "td" && !isCircular(r.intensity[c])).map((cat) => (
            <OutcomeCard key={cat} cell={r.intensity[cat]} label={CAT_LABEL[cat]}
              tone={CATEGORY_COLOR[cat]} subject={CAT_LABEL[cat]}
              of="storms whose peak intensity the archive recorded"
              delta={comparison ? comparison.intensity[cat] : null}
              baselineCell={comparison ? comparison.baseline.intensity[cat] : null}
              baselineName={comparison ? baselineNameOf(comparison) : null} />
          ))}

          {Object.keys(r.landfall).length ? (
            <>
              <Head>WHERE THEY LANDED</Head>
              {/* ORDERED BY EVIDENCE, NOT BY ALPHABET. Alphabetical order buried the one region
                  these storms actually reached under four regions they did not, and a reader
                  scanning a panel reads the top of a list. The empty regions still appear, with
                  their own intervals -- 0 of 85 with [0-4%] is a finding, not a blank. */}
              {Object.entries(r.landfall)
                .sort((a, b) => b[1].any.count - a[1].any.count || a[0].localeCompare(b[0]))
                .map(([region, kinds]) => (
                <div key={region} style={{ marginBottom: "var(--sp-3)" }}>
                  <Row k={region.replace(/_/g, " ")} v={
                    <span>
                      <OverDenom n={kinds.any.count} of={kinds.any.n_storms} />
                      <span style={{ color: "var(--text-2)" }}> · ≥64 kt </span>
                      <OverDenom n={kinds.hurricane.count} of={kinds.hurricane.n_storms} />
                    </span>} />
                  <div style={{ paddingLeft: "var(--sp-4)" }}>
                    <RateLine cell={kinds.any} label="any" />
                    <RateLine cell={kinds.hurricane} label="≥64 kt" />
                  </div>
                  {["any", "hurricane"].map((kind) => {
                    const u = r.unscoreable[`${region}:${kind}`];
                    if (!u) return null;
                    return (
                      <Refusal key={kind} kind="BASE_RATE_ONLY" compact
                        subject={`${region.replace(/_/g, " ")} · ${kind === "hurricane" ? "≥64 kt" : "any"}`}
                        counts={`${u.archive_events} archive-wide · ${u.required} needed`}
                        detail={u.reason} />
                    );
                  })}
                </div>
              ))}
            </>
          ) : null}

          <Head right={
            <button type="button" onClick={() => onShowPathway(!pathwayOn)} style={{
              ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
              border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
              color: pathwayOn ? "var(--accent)" : "var(--text-2)", cursor: "pointer",
              padding: "2px 6px",
            }}>{pathwayOn ? "SHOWN" : "SHOW"}</button>
          }>HISTORICAL PATHWAY FREQUENCY</Head>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            lineHeight: "var(--lh-body)" }}>
            {(pathway ? pathway.size : 0).toLocaleString()} two-degree cells, each counting the
            distinct storms of this cohort that passed through it
            {peak ? <> · busiest cell carries {peak}</> : null}.
            <div style={{ color: "var(--warn)", marginTop: 4 }}>
              THIS IS NOT A FORECAST. {claimText("atlas.pathway")}
            </div>
          </div>

          {hasTimes(r.time_to_event) ? (
            <>
              <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
                color: "var(--text-2)" }}>hours from genesis</span>}>HOW LONG IT TOOK</Head>
              {Object.entries(r.time_to_event).map(([key, d]) => {
                if (!d || !d.n) return null;
                return (
                  <Row key={key} k={key.replace("landfall_", "landfall · ").replace(/_/g, " ")}
                    v={<span style={{ ...MONO }}>
                      {Math.round(d.median)} h
                      <span style={{ color: "var(--text-2)" }}>
                        {" "}· p25 {Math.round(d.p25)} · p75 {Math.round(d.p75)} · n {d.n}
                      </span>
                    </span>} />
                );
              })}
            </>
          ) : null}

          {archive && envCoverage ? (
            <EnvLens archive={archive} coverage={envCoverage} lens={envLens}
              loading={envLoading} onLoad={onLoadEnv} />
          ) : null}

          {/* RULE 4: the conditioning note travels with the numbers rather than being written
              into the page, so it cannot drift away from what it qualifies. */}
          <Head>WHAT THESE RATES ASSUME</Head>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            lineHeight: "var(--lh-body)" }}>
            {claimText("atlas.rates")}
          </div>

          {r.gaps.length ? (
            <>
              <Head>GAPS THE ARCHIVE RECORDED</Head>
              {r.gaps.map((g, i) => <Gap key={i} text={g} />)}
            </>
          ) : null}

          <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
            color: "var(--text-2)" }}>{spec.where ? "by distance" : "by season"}</span>}>
            THE STORMS
          </Head>
          <div style={{ maxHeight: 260, overflowY: "auto", marginRight: "calc(-1 * var(--sp-3))",
            paddingRight: "var(--sp-3)" }}>
            {r.cases.map((c) => (
              <button key={c.storm_id} type="button" onClick={() => onSelectStorm(c.row)}
                style={{
                  display: "flex", width: "100%", gap: "var(--sp-3)", alignItems: "baseline",
                  padding: "3px 0", background: "transparent", border: 0,
                  borderTop: "1px solid var(--border-dim)", cursor: "pointer", textAlign: "left",
                }}>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-1)",
                  flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name || "UNNAMED"}
                </span>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
                  {c.season}
                </span>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", width: 46,
                  textAlign: "right",
                  color: c.max_category ? CATEGORY_COLOR[c.max_category] : "var(--warn)" }}>
                  {c.max_category ? c.max_category.toUpperCase() : "—"}
                </span>
                <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", width: 54,
                  textAlign: "right", color: "var(--text-2)" }}>
                  {c.distance_km === null ? "" : `${Math.round(c.distance_km)} km`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* The empty state is a specific message, not a table of zeroes. Rendering "0 / 0" for a query
   that matched nothing invites exactly the misreading this whole surface exists to prevent. */
function NoCohort({ spec, gaps }) {
  return (
    <div style={{ marginTop: "var(--sp-6)" }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--warn)",
        letterSpacing: ".5px", marginBottom: "var(--sp-4)" }}>
        [ NO STORMS MATCHED THIS COHORT ]
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--text-2)", lineHeight: "var(--lh-body)" }}>
        There is no sample here, so there are no rates. Every condition you set is listed on the
        left with what it removed; the one that emptied the cohort is the one with the largest
        cost beside it.
        {spec.where ? (
          <>
            <br /><br />
            Matching is on GENESIS LOCATION ONLY: where a storm formed, not where it went. A
            point along a common track will usually match nothing, because storms arrive at
            those positions rather than forming there.
            <br /><br />
            Widen the radius only if that is a question you actually mean to ask — a wider circle
            answers a different question, it does not find a missing sample.
          </>
        ) : null}
      </div>
      {gaps.map((g, i) => <Gap key={i} text={g} />)}
    </div>
  );
}

/* WHAT IS BEING COMPARED, NAMED BEFORE ANY DELTA IS READ.
 *
 * Three of the four questions a comparison has to answer live here rather than on the cards:
 * what changed, relative to what, and how the two populations are related. Only "by how much"
 * is per-contract. Putting the baseline above the cards means a reader cannot scroll into a
 * "+5.1 points" without having passed the sentence saying what those points are relative to.
 *
 * The relation note is the part most tools omit: a parent CONTAINS its child, so the same
 * storms are on both sides and the two rates are not independent estimates. It is computed
 * (engine/compare.js `relate`) rather than assumed, because one baseline -- dropping the
 * provisional-seasons switch -- is a subset rather than a superset. */
function Baseline({ c, conditions, onBaseline }) {
  const b = c.baseline;
  return (
    <div data-baseline style={{ border: "1px solid var(--border-dim)",
      borderLeft: "var(--bw-signal) solid var(--text-2)", borderRadius: "var(--radius-sm)",
      padding: "var(--sp-4) var(--sp-5)", marginTop: "var(--sp-5)",
      background: "var(--surface-sunken)" }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        letterSpacing: ".5px" }}>COMPARED WITH</div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-body)",
        color: "var(--text-1)", lineHeight: "var(--lh-tight)", marginTop: 3 }}>
        the same cohort {c.changed
          ? <>without <strong>{c.changed.sentence}</strong></>
          : "with no conditions"}
      </div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        marginTop: 4 }}>
        {b.n_cases.toLocaleString()} storms · effective sample {b.effective_sample_size.toFixed(1)}
        {" · "}{b.sufficient ? "SUFFICIENT" : `BELOW SAMPLE · ${b.n_cases} < ${b.min_sample}`}
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
        color: "var(--warn)", lineHeight: "var(--lh-body)", marginTop: "var(--sp-3)" }}>
        {c.relation.note}
      </div>

      {/* THE WHAT-IF CONTROL. Any applied condition can be the one held out, so "what if I had
          not restricted the season" is one click rather than a re-entry -- and the cards
          immediately answer it. */}
      {conditions && conditions.length > 1 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "var(--sp-3)",
          alignItems: "center" }}>
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
            HOLD OUT
          </span>
          {conditions.map((cond) => (
            <Chip key={cond.key} chipKey={`baseline-${cond.key}`}
              active={c.changed && c.changed.key === cond.key}
              onClick={() => onBaseline(cond.key)}>{cond.label}</Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** How the baseline is named on each card -- short, because it repeats on every one. */
function baselineNameOf(c) {
  return c.changed ? `without ${c.changed.sentence}` : "the whole archive";
}

const CIRCULAR = "CONDITIONED ON -- NOT AN OUTCOME";

function isCircular(cell) {
  return !!cell && cell.status === CIRCULAR;
}

function circularRows(r) {
  return CATEGORY_ORDER.filter((c) => c !== "td" && isCircular(r.intensity[c]))
    .map((cat) => ({ label: CAT_LABEL[cat], tone: CATEGORY_COLOR[cat], cell: r.intensity[cat] }));
}

/** The engine's own explanation, taken from the first circular row -- they all share it. */
function circularReason(r) {
  for (const c of CATEGORY_ORDER) if (isCircular(r.intensity[c])) return r.intensity[c].reason;
  return null;
}

function seasonSpan(cases) {
  if (!cases.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of cases) {
    if (c.season === null) continue;
    if (c.season < lo) lo = c.season;
    if (c.season > hi) hi = c.season;
  }
  return Number.isFinite(lo) ? `${lo} – ${hi}` : null;
}

function medianPosition(cases) {
  if (!cases.length) return null;
  const lat = cases.map((c) => c.genesis_lat).sort((a, b) => a - b);
  const lon = cases.map((c) => c.genesis_lon).sort((a, b) => a - b);
  const mid = (a) => (a.length % 2 ? a[(a.length - 1) / 2]
    : (a[a.length / 2 - 1] + a[a.length / 2]) / 2);
  return formatPosition(mid(lat), mid(lon));
}

/** Does any time-to-event series carry a usable sample? An all-empty block is not worth a head. */
function hasTimes(tte) {
  if (!tte) return false;
  for (const d of Object.values(tte)) if (d && d.n) return true;
  return false;
}
