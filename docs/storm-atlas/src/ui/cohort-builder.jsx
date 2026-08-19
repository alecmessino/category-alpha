/* THE QUERY IS THE PRODUCT.
 *
 * This replaced the filter rail. A rail is a list of switches over a schema; this is a question
 * being composed, and the difference is not cosmetic -- it decides what a reader believes they
 * are looking at. The old rail said "months: [8,9]". This says "storms that formed within 500 km
 * of 12.0N 105.0W, in Aug, Sep, since 1971 -- what happened next?", and the sentence at the top
 * is generated from the same object that selects the storms, so it cannot describe a cohort
 * other than the one on screen.
 *
 * THE ORDER IS THE STORM'S OWN LIFECYCLE, not the database's table layout:
 *
 *     GENESIS -> ENVIRONMENT -> TRAJECTORY -> INTENSITY -> LANDFALL -> OUTCOME
 *
 * so composing a query walks the path a storm walks. A researcher asks "where did it form, when,
 * what was it flying through, how strong did it get, where did it come ashore" -- in that order,
 * every time -- and the builder offers the conditions in that order for that reason.
 *
 * TWO ZONES, BECAUSE TWO KINDS OF CONDITION ARE NOT THE SAME QUESTION.
 *   GIVEN            at or before genesis -- "what happens to storms that BEGIN like this?"
 *   GIVEN THAT ALSO  outcome-side        -- "what did the storms that ENDED UP like this have
 *                                            in common?"
 * Both are real research questions and conflating them is how circular reasoning enters. The
 * second zone is separated, and every chip in it states its own consequence BEFORE it is
 * clicked. The fifth rule then reads as the direct result of a choice the reader made, rather
 * than as the engine being difficult about a number it could obviously have produced.
 *
 * EVERY CHIP CARRIES ITS COUNT. Not the cohort's cost after the fact in a footnote -- the count
 * itself, on the control, before the click. See engine/preview.js for why those counts are taken
 * over the population that satisfies every OTHER condition, and for the consequence that makes
 * the outcome zone honest: an outcome-side chip's preview count IS the outcome count on the card
 * above it.
 */

import React from "react";
import { INTENSITY_FILTERS, LANDFALL_FILTERS } from "../engine/query.js";
import { CATEGORY_COLOR } from "../render/palette.js";
import { Chip, Head, MONO, Row, claimText } from "./kit.jsx";
import { Refusal } from "./refusal.jsx";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const RADII = [250, 500, 800, 1200];

/* Measured from the pack's own manifest at build time and restated here only as a fallback for
   a manifest that predates env_coverage. The live numbers come from the manifest -- a coverage
   claim typed into a component is a coverage claim that goes stale silently. */
const ENV_FALLBACK = { storms_any_source: null, storms_total: null };

export function CohortBuilder({
  archive, cohort, setCohort, result, preview, sentence, conditions,
  layers, setLayers, bounds, onReset, mode, setMode,
  showPathway, setShowPathway, showGenesisDensity, setShowGenesisDensity, timeline,
}) {
  const total = archive.manifest.counts.storms;
  const s = cohort;
  const set = (patch) => setCohort({ ...s, ...patch });

  /* DISABLE RATHER THAN DELETE. Removing a condition keeps its value here, so putting it back is
     one click rather than a re-entry -- which is what makes "what if I had not restricted the
     season" a thing a reader tries rather than a thing they consider trying. It lives in view
     state on purpose: a disabled condition means the same cohort as no condition, so it must not
     enter the spec, or two identical cohorts would serialise to two different URLs. */
  const [ghosts, setGhosts] = React.useState({});

  const drop = (key) => {
    setGhosts((g) => ({ ...g, [key]: snapshot(s, key) }));
    setCohort(clearKey(s, key));
  };
  const restore = (key) => {
    const g = ghosts[key];
    setGhosts(({ [key]: _drop, ...rest }) => rest);
    if (g) setCohort({ ...s, ...g });
  };

  const toggleMonth = (m) => {
    const cur = new Set(s.months || []);
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    set({ months: cur.size ? [...cur].sort((a, b) => a - b) : null });
  };
  const toggleList = (key, v) => {
    const cur = new Set(s[key] || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    set({ [key]: cur.size ? [...cur] : null });
  };

  const given = conditions.filter((c) => c.zone === "given" || c.zone === "scope");
  const outcome = conditions.filter((c) => c.zone === "outcome");
  const ghostKeys = Object.keys(ghosts).filter((k) => !conditions.some((c) => c.key === k));
  const env = (archive.manifest.env_coverage || ENV_FALLBACK);

  return (
    <div style={{ padding: "var(--sp-5) var(--sp-6) var(--sp-8)" }}>
      {/* ---- THE QUESTION ---------------------------------------------------------------- */}
      <Head right={<button type="button" onClick={onReset} style={RESET_BTN}>RESET</button>}>
        THE QUESTION
      </Head>
      <div data-cohort-sentence style={{ fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)", lineHeight: "var(--lh-body)", color: "var(--text-1)" }}>
        {sentence}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)",
        marginTop: "var(--sp-4)" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-stat)", fontWeight: 800,
          color: "var(--text-1)", lineHeight: 1 }}>{result.kept.toLocaleString()}</span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-2)" }}>
          of {total.toLocaleString()} storms
        </span>
      </div>
      <Row k="sample gate" v={result.sufficient
        ? <span style={{ ...MONO, color: "var(--pos)" }}>
            SUFFICIENT · {result.n_cases} ≥ {result.min_sample}</span>
        : <span style={{ ...MONO, color: "var(--neg)" }}>
            BELOW SAMPLE · {result.n_cases} &lt; {result.min_sample}</span>} />

      {result.undecidable > 0 ? (
        <Refusal kind="UNKNOWN" compact
          counts={`${result.undecidable.toLocaleString()} storm(s)`}
          detail={`${result.undecidable.toLocaleString()} storm(s) could not be judged by this `
            + "intensity filter — the archive records no wind for them. They are neither "
            + "included nor counted as failing it."} />
      ) : null}

      {/* The mode switch stays at the top rather than under the disclosure below: replaying the
          record is a way of reading the cohort, not a drawing preference, and burying it would
          hide the archive's own clock behind a triangle. */}
      <div style={{ display: "flex", gap: 4, marginTop: "var(--sp-4)" }}>
        <Chip chipKey="mode-explore" active={mode === "explore"}
          onClick={() => setMode("explore")}>EXPLORE</Chip>
        <Chip chipKey="mode-replay" active={mode === "replay"}
          onClick={() => setMode("replay")}>REPLAY</Chip>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          alignSelf: "center", lineHeight: "var(--lh-body)" }}>
          {mode === "replay"
            ? (timeline && timeline.n
              ? `${timeline.n.toLocaleString()} storms unfold in order`
              : "no storms in this cohort")
            : "the record as a finished map"}
        </span>
      </div>

      {/* ---- THE CONDITION STACK --------------------------------------------------------- */}
      {conditions.length || ghostKeys.length ? (
        <>
          <Head>CONDITIONS</Head>
          {given.length ? <ZoneLabel>GIVEN — at or before genesis</ZoneLabel> : null}
          {given.map((c) => (
            <ConditionChip key={c.key} c={c} cost={costOf(result, c.key)} onDrop={() => drop(c.key)} />
          ))}
          {outcome.length ? (
            <ZoneLabel outcome>
              GIVEN THAT IT ALSO — outcome-side
            </ZoneLabel>
          ) : null}
          {outcome.map((c) => (
            <ConditionChip key={c.key} c={c} outcome cost={costOf(result, c.key)}
              onDrop={() => drop(c.key)} />
          ))}
          {ghostKeys.map((k) => (
            <button key={k} type="button" onClick={() => restore(k)} style={GHOST}>
              ↩ restore {LABEL_OF[k] || k}
            </button>
          ))}
        </>
      ) : null}

      {/* ---- GENESIS --------------------------------------------------------------------- */}
      <Head>1 · GENESIS</Head>
      <SubLabel>WHERE IT FORMED</SubLabel>
      {s.where ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
            RADIUS
          </span>
          {RADII.map((km) => (
            <Chip key={km} chipKey={`radius-${km}`} active={s.where.radiusKm === km}
              onClick={() => set({ where: { ...s.where, radiusKm: km } })}>{km} km</Chip>
          ))}
        </div>
      ) : (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          lineHeight: "var(--lh-body)" }}>
          click open water on the map — matching is on GENESIS position, where a storm formed
        </div>
      )}

      <SubLabel>WHEN — SEASON</SubLabel>
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
        <YearBox label="from" value={s.seasonFrom} bounds={bounds}
          onChange={(v) => set({ seasonFrom: v })} />
        <span style={{ color: "var(--text-2)" }}>–</span>
        <YearBox label="to" value={s.seasonTo} bounds={bounds}
          onChange={(v) => set({ seasonTo: v })} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "var(--sp-3)" }}>
        {[[null, null, "ALL"], [1971, null, "1971+"], [1990, null, "1990+"],
          [2000, null, "2000+"], [1851, 1970, "PRE-1971"]].map(([a, b, label]) => (
          <Chip key={label} chipKey={`season-${label}`} active={s.seasonFrom === a && s.seasonTo === b}
            onClick={() => set({ seasonFrom: a, seasonTo: b })}
            title={label === "1971+"
              ? "The reliably-observed era. Before 1971 east Pacific intensities were estimated "
                + "without geostationary satellites or Dvorak analysis, and major hurricanes "
                + "were under-observed."
              : undefined}>{label}</Chip>
        ))}
      </div>

      <SubLabel>WHEN — GENESIS MONTH</SubLabel>
      <div style={{ display: "flex", gap: 3 }}>
        {MONTHS.map((m, i) => {
          const on = !!(s.months && s.months.includes(i + 1));
          const n = preview ? (preview.months[i + 1] || 0) : null;
          return (
            <button key={i} type="button" onClick={() => toggleMonth(i + 1)}
              title={`${MONTH_NAMES[i]}${n === null ? "" : ` — ${n.toLocaleString()} storms of `
                + `the ${(preview.basisOf.months || 0).toLocaleString()} that satisfy every `
                + "other condition formed in this month"}`}
              style={{
                ...MONO, flex: 1, fontSize: "var(--fs-mono-xs)", padding: "4px 0",
                border: "1px solid " + (on ? "var(--accent)" : "var(--border-dim)"),
                background: on ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                  : "transparent",
                color: on ? "var(--accent)" : "var(--text-2)",
                borderRadius: "var(--radius-sm)", cursor: "pointer", lineHeight: 1.25,
              }}>
              {m}
              {n === null ? null : (
                <div style={{ fontSize: 8, color: "var(--text-2)" }}>{compact(n)}</div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)", marginTop: 4,
        lineHeight: "var(--lh-body)" }}>
        the month of GENESIS, not of landfall{s.months ? <> · <button type="button" onClick={() => set({ months: null })}
          style={LINK_BTN}>clear</button></> : null}
      </div>
      {preview ? <Basis n={preview.basisOf.months} cohort={result.kept}
        what="the month" /> : null}

      <SubLabel>WHERE — BASIN</SubLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <Chip chipKey="basin-all" active={!s.basins} onClick={() => set({ basins: null })}>ALL</Chip>
        {(archive.storms.col("basin").dictionary || []).map((b) => (
          <Chip key={b} chipKey={`basin-${b}`} active={!!s.basins && s.basins.includes(b)}
            onClick={() => toggleList("basins", b)}
            title={b === "WP" ? "West Pacific genesis — dateline crossers that IBTrACS keeps in "
              + "the loaded basin files." : undefined}>
            {b}{preview ? <Count n={preview.basins[b] || 0} /> : null}
          </Chip>
        ))}
      </div>
      {preview ? <Basis n={preview.basisOf.basins} cohort={result.kept}
        what="the basin" /> : null}

      <SubLabel>TRAJECTORY — EVER ENTERED</SubLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {/* Only the subbasins the PACK actually records. A cohort count of zero is an answer --
            none of these storms went there -- but a code the archive never sets for any storm
            would be a control that cannot do anything, and offering one implies the record
            holds something it does not. The empty ones are named below instead. */}
        {archive.subbasinBits.filter((c) => !preview || preview.subbasinsArchive[c] > 0)
          .map((code) => (
            <Chip key={code} chipKey={`entered-${code}`}
              active={!!s.subbasinsEntered && s.subbasinsEntered.includes(code)}
              onClick={() => toggleList("subbasinsEntered", code)}
              title={"Storms that ENTERED this subbasin at any point in their life — not storms "
                + "that formed there. Formed-there loses Iniki, which formed at 134W in the east "
                + "Pacific."}>
              {code}{preview ? <Count n={preview.subbasinsEntered[code] || 0} /> : null}
            </Chip>
          ))}
      </div>
      {preview && emptyBits(archive, preview).length ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          marginTop: 4, lineHeight: "var(--lh-body)" }}>
          {emptyBits(archive, preview).join(", ")} are not offered: IBTrACS records them as
          BASINS and leaves the subbasin field empty, so the archive sets that bit for no storm
          at all. Use the basin condition above for those.
        </div>
      ) : null}
      {preview ? <Basis n={preview.basisOf.subbasinsEntered} cohort={result.kept}
        what="the subbasin" /> : null}

      {/* ---- ENVIRONMENT ----------------------------------------------------------------- */}
      <Head>2 · ENVIRONMENT</Head>
      <Refusal kind="NOT_EVALUABLE"
        subject="shear · SST · OHC"
        counts={env.storms_any_source !== null
          ? `${env.storms_any_source.toLocaleString()} of ${env.storms_total.toLocaleString()} storms`
          : undefined}
        detail={"Conditioning on the environment is not offered yet, and the reason is the "
          + "coverage: the environment record reaches under half this archive and none of it "
          + "before 1982. An environmental filter over that would silently convert a 175-year "
          + "archive into a 40-year one and call the result a stronger analog. The sources are "
          + "also sequential eras rather than alternatives, and one of them substitutes a "
          + "climatological sea-surface temperature for an observed one, so they cannot be "
          + "pooled to make the coverage look better than it is."} />

      {/* ---- THE OUTCOME ZONE ------------------------------------------------------------ */}
      <div style={{ marginTop: "var(--sp-6)", borderTop: "1px dashed var(--warn)",
        paddingTop: "var(--sp-4)" }}>
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)",
          letterSpacing: ".5px", fontWeight: 800 }}>
          GIVEN THAT IT ALSO — OUTCOME-SIDE CONDITIONS
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 3 }}>
          Below this line you stop asking <em>what happens to storms that begin like this</em> and
          start asking <em>what did the storms that ended up like this have in common</em>. Both
          are real questions. Each chip says what it takes off the table, because a variable that
          defines a cohort cannot also be reported as an outcome of it.
        </div>
      </div>

      <Head>3 · PEAK INTENSITY</Head>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {INTENSITY_FILTERS.map((x) => (
          <Chip key={x.key} chipKey={`intensity-${x.key}`} active={s.intensity === x.key}
            onClick={() => set({ intensity: x.key })}
            tone={x.key === "all" ? undefined : CATEGORY_COLOR[x.key === "ts" ? "ts" : x.key]}
            title={x.key === "all" ? "No intensity condition."
              : `Conditioning on ${x.label} means every intensity row at or below ${x.key} `
                + "stops being an outcome of this cohort and reports its count only."}>
            {x.label}{preview ? <Count n={preview.intensity[x.key] || 0} /> : null}
          </Chip>
        ))}
      </div>
      {preview ? <Basis n={preview.basisOf.intensity} cohort={result.kept}
        what="the peak intensity" /> : null}
      {preview && preview.intensityUnknown > 0 ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)", marginTop: 4,
          lineHeight: "var(--lh-body)" }}>
          {preview.intensityUnknown.toLocaleString()} storm(s) here have no recorded wind at all.
          They are in none of the counts above and they are not failures.
        </div>
      ) : null}

      <Head>4 · LANDFALL</Head>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <Chip chipKey="landfall-none" active={s.landfall === null}
          onClick={() => set({ landfall: null })}>NO FILTER</Chip>
        {LANDFALL_FILTERS.map((x) => (
          <Chip key={x.key} chipKey={`landfall-${x.key}`} active={s.landfall === x.key}
            onClick={() => set({ landfall: s.landfall === x.key ? null : x.key })}
            title={x.key === "any"
              ? "Conditioning on landfall means every landfall contract stops being an outcome "
                + "of this cohort."
              : `Conditioning on ${x.label} means its landfall rate stops being an outcome of `
                + "this cohort. Its hurricane-intensity rate is still one."}>
            {x.label}{preview ? <Count n={preview.landfall[x.key] || 0} /> : null}
          </Chip>
        ))}
      </div>
      {preview ? <Basis n={preview.basisOf.landfall} cohort={result.kept}
        what="the landfall region" /> : null}

      {/* ---- SCOPE ----------------------------------------------------------------------- */}
      <Head>SCOPE OF THE RECORD</Head>
      <Toggle label="NAMED STORMS ONLY" on={s.namedOnly}
        onChange={(v) => set({ namedOnly: v })}
        note="A property of the record rather than of the storm, so it is neither a genesis
              condition nor an outcome. Unnamed systems are mostly early-record and weak." />
      <Toggle label="PROVISIONAL SEASONS" on={s.includeProvisional}
        onChange={(v) => set({ includeProvisional: v })}
        note="2025 and 2026 have not been post-analysed. The archive excludes them from analog
              pools by default and so does this." />

      {/* ---- HOW IT IS DRAWN ------------------------------------------------------------- */}
      <details data-drawn style={{ marginTop: "var(--sp-6)" }}>
        <summary style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          cursor: "pointer", letterSpacing: "var(--track-label)" }}>
          ▸ HOW IT IS DRAWN
        </summary>

        <SubLabel>DENSITY SURFACES</SubLabel>
        {/* The notes are the registered claims themselves, not a paraphrase. A surface that can
            be turned on from here has to carry the same statement it carries beside the
            numbers, and prose written twice drifts. */}
        <Toggle label="PATHWAY FREQUENCY" on={!!showPathway} onChange={setShowPathway}
          note={claimText("atlas.pathway")} />
        <Toggle label="GENESIS COUNT" on={!!showGenesisDensity} onChange={setShowGenesisDensity}
          note={claimText("atlas.genesis_density")} />

        <SubLabel>LAYERS</SubLabel>
        <Toggle label="COLOUR BY INTENSITY" on={layers.colorBy === "intensity"}
          onChange={(v) => setLayers({ ...layers, colorBy: v ? "intensity" : "uniform" })}
          note="Each segment takes the Saffir-Simpson class of the fix it leaves. Fixes with no
                recorded wind are drawn outside the ramp." />
        <Toggle label="GENESIS POINTS" on={layers.genesis}
          onChange={(v) => setLayers({ ...layers, genesis: v })} />
        <Toggle label="LANDFALLS" on={layers.landfalls}
          onChange={(v) => setLayers({ ...layers, landfalls: v })} />
      </details>
    </div>
  );
}

/* ---- the pieces ------------------------------------------------------------------------- */

/** One applied condition: what it says, what it cost, and how to take it back off. */
function ConditionChip({ c, cost, outcome, onDrop }) {
  const tone = outcome ? "var(--warn)" : "var(--accent)";
  return (
    <div data-condition={c.key} style={{
      border: "1px solid var(--border-dim)", borderLeft: `var(--bw-signal) solid ${tone}`,
      borderRadius: "var(--radius-sm)", padding: "var(--sp-3)", marginBottom: 4,
      background: "var(--surface-sunken)",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: tone, flex: "none" }}>
          {outcome ? "↺" : "●"} {c.label}
        </span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-1)",
          flex: 1, minWidth: 0 }}>{c.sentence}</span>
        <button type="button" onClick={onDrop} title="remove this condition" style={{
          ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent", border: 0,
          color: "var(--text-2)", cursor: "pointer", flex: "none", padding: 0,
        }}>✕</button>
      </div>
      {/* WHAT IT COST, where the choice was made. The difference between "44 storms did not
          reach Cat 3" and "12 storms nobody measured" is the archive's whole discipline. */}
      {cost ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          marginTop: 3 }}>
          −{cost.excluded.toLocaleString()} excluded
          {cost.undecidable
            ? <span style={{ color: "var(--warn)" }}> · {cost.undecidable.toLocaleString()} could
                not be judged</span>
            : null}
        </div>
      ) : null}
      {c.costs ? (
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--warn)", lineHeight: "var(--lh-body)", marginTop: 3 }}>
          ↳ {c.costs}
        </div>
      ) : null}
    </div>
  );
}

function ZoneLabel({ children, outcome }) {
  return (
    <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", letterSpacing: ".5px",
      color: outcome ? "var(--warn)" : "var(--text-2)", margin: "var(--sp-3) 0 3px" }}>
      {children}
    </div>
  );
}

function SubLabel({ children }) {
  return (
    <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", letterSpacing: "var(--track-label)",
      color: "var(--text-2)", margin: "var(--sp-4) 0 var(--sp-2)" }}>{children}</div>
  );
}

/* WHICH POPULATION A GROUP'S COUNTS ARE OVER, stated exactly when it stops being obvious.
 *
 * While a dimension carries no condition its basis IS the cohort, the chip counts and the
 * outcome cards agree to the storm, and saying so would be noise. The moment a condition of that
 * dimension is applied the two part -- the card counts within the cohort, the chip counts over
 * the population without that condition, because a chip in an applied dimension means "switch to
 * this" rather than "narrow by this". Both numbers are right and they are not the same number,
 * so the line appears and names the difference. */
function Basis({ n, cohort, what }) {
  if (n === null || n === undefined || n === cohort) return null;
  return (
    <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)", marginTop: 4,
      lineHeight: "var(--lh-body)" }}>
      counts are over the {n.toLocaleString()} storms that satisfy every condition EXCEPT{" "}
      {what} — each chip answers “switch to this”, so they will not match the{" "}
      {cohort.toLocaleString()} in the cohort above.
    </div>
  );
}

/** A chip's preview count. Small and dim: the label is the control, the count is the evidence. */
function Count({ n }) {
  return (
    <span style={{ color: "var(--text-2)", marginLeft: 4, fontSize: "0.92em" }}>
      {compact(n)}
    </span>
  );
}

/** Subbasin codes the pack never sets for any storm -- an empty column, not an empty answer. */
function emptyBits(archive, preview) {
  return archive.subbasinBits.filter((c) => !(preview.subbasinsArchive[c] > 0));
}

function compact(n) {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* Which exclusion counter belongs to which condition. `filterStorms` counts the cost of every
   filter as it applies them; this is what maps that ledger back onto the chip that caused it. */
const COST_KEY = {
  where: "distance", season: "season", months: "month", basins: "basin",
  subbasinsEntered: "subbasin", intensity: "intensity", landfall: "landfall",
  namedOnly: "unnamed", includeProvisional: "provisional",
};

const LABEL_OF = {
  where: "the location", season: "the seasons", months: "the months", basins: "the basin",
  subbasinsEntered: "the subbasin", intensity: "the intensity", landfall: "the landfall",
  namedOnly: "named-only", includeProvisional: "provisional seasons",
};

function costOf(result, key) {
  const k = COST_KEY[key];
  if (!k) return null;
  const excluded = result.excluded[k] || 0;
  // Only the intensity filter produces undecidables -- it is the only one asking a question the
  // archive can fail to have an answer to.
  const undecidable = key === "intensity" ? result.undecidable : 0;
  if (!excluded && !undecidable) return null;
  return { excluded, undecidable };
}

/** The values a dropped condition has to remember to be restorable. */
function snapshot(spec, key) {
  if (key === "season") return { seasonFrom: spec.seasonFrom, seasonTo: spec.seasonTo };
  if (key === "where") return { where: spec.where };
  return { [key]: spec[key] };
}

function clearKey(spec, key) {
  if (key === "season") return { ...spec, seasonFrom: null, seasonTo: null };
  if (key === "intensity") return { ...spec, intensity: "all" };
  if (key === "namedOnly") return { ...spec, namedOnly: false };
  if (key === "includeProvisional") return { ...spec, includeProvisional: false };
  return { ...spec, [key]: null };
}

const RESET_BTN = {
  ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
  border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
  color: "var(--text-2)", cursor: "pointer", padding: "2px 6px",
};

const GHOST = {
  ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
  border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-sm)",
  color: "var(--text-2)", cursor: "pointer", padding: "4px 7px", marginTop: 4,
  display: "block", width: "100%", textAlign: "left",
};

const LINK_BTN = {
  background: "transparent", border: 0, padding: 0, color: "var(--text-link)",
  cursor: "pointer", font: "inherit", textDecoration: "underline",
};

function YearBox({ label, value, bounds, onChange }) {
  return (
    <label style={{ flex: 1, minWidth: 0 }}>
      <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        display: "block", marginBottom: 2 }}>{label}</span>
      <input type="number" min={bounds[0]} max={bounds[1]}
        value={value === null ? "" : value}
        placeholder={String(label === "from" ? bounds[0] : bounds[1])}
        onChange={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          onChange(v === null || Number.isNaN(v) ? null : v);
        }}
        style={{
          ...MONO, width: "100%", fontSize: "var(--fs-mono-sm)", padding: "5px 7px",
          background: "var(--surface-sunken)", color: "var(--text-1)",
          border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
        }} />
    </label>
  );
}

function Toggle({ label, on, onChange, note }) {
  return (
    <div style={{ padding: "var(--sp-2) 0" }}>
      <button type="button" onClick={() => onChange(!on)} style={{
        display: "flex", alignItems: "center", gap: "var(--sp-3)", width: "100%",
        background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left",
      }}>
        <span style={{
          width: 26, height: 14, borderRadius: 999, flex: "none",
          border: "1px solid " + (on ? "var(--accent)" : "var(--border-strong)"),
          background: on ? "color-mix(in srgb, var(--accent) 24%, transparent)" : "transparent",
          position: "relative", transition: "all var(--ease-ui)",
        }}>
          <span style={{
            position: "absolute", top: 2, left: on ? 13 : 2, width: 8, height: 8,
            borderRadius: 999, background: on ? "var(--accent)" : "var(--border-strong)",
            transition: "left var(--ease-ui)",
          }} />
        </span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
          letterSpacing: "var(--track-label)", color: on ? "var(--text-1)" : "var(--text-2)" }}>
          {label}
        </span>
      </button>
      {note ? (
        <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
          color: "var(--text-2)", lineHeight: "var(--lh-body)", paddingLeft: 34, marginTop: 2 }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}
