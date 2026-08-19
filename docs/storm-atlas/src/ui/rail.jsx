/* The left rail: what is on the map, and what it cost to get there.
 *
 * The counts at the top are the honest ones. Filtering to "Cat 3 and above" drops the
 * population from 3,959 to a few hundred, and a reader is entitled to know how much of that
 * drop was storms that did not reach Cat 3 and how much was storms whose intensity nobody
 * recorded. The archive knows the difference; so does this rail.
 *
 * THE SPINE AT THE TOP IS A DERIVED VIEW, NOT A CONTROL. The archive is interrogated in six
 * stages and the query in force constrains some of them and lets the rest through whole. That
 * is already true of the filters below it; the spine only says it out loud, so a reader can see
 * at a glance which parts of the question they have actually asked. It adds no state, computes
 * nothing, and every value it prints is a filter that is visible further down or a count out of
 * the pack's own manifest.
 */

import React from "react";
import { INTENSITY_FILTERS, LANDFALL_FILTERS } from "../engine/query.js";
import { CATEGORY_COLOR } from "../render/palette.js";
import {
  Bar, Capt, Chip, Figure, GroupRule, Head, Note, Row, TextButton, Toggle, claimText,
} from "./kit.jsx";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export function Rail({ archive, filters, setFilters, result, layers, setLayers, bounds,
  onReset, mode, setMode, showPathway, setShowPathway, showGenesisDensity,
  setShowGenesisDensity, timeline, probe }) {
  const total = archive.manifest.counts.storms;
  const q = archive.manifest.quality;
  const f = filters;

  const set = (patch) => setFilters({ ...f, ...patch });
  const toggleMonth = (m) => {
    const cur = new Set(f.months || []);
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    set({ months: cur.size ? [...cur].sort((a, b) => a - b) : null });
  };

  const droppedByFilter = Object.entries(result.excluded)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const threshold = (INTENSITY_FILTERS.find((x) => x.key === f.intensity) || {}).threshold;
  const landfallLabel = (LANDFALL_FILTERS.find((x) => x.key === f.landfall) || {}).label;

  /* Six stages, each either narrowed by the query in force or passing the whole archive
     through. `here` marks the one stage this surface has no control for -- the archive holds
     environment and the engine can weight on it, but nothing in this rail sets that vector. */
  const stages = [
    ["GENESIS",
      f.months || f.basins || f.subbasinsEntered || probe ? "CONSTRAINED" : "OPEN",
      probe ? `WITHIN ${probe.radiusKm} KM`
        : f.months ? `${f.months.length} MONTH${f.months.length > 1 ? "S" : ""}`
          : f.basins ? f.basins.join("/")
            : f.subbasinsEntered ? `ENTERED ${f.subbasinsEntered.join("/")}` : "ALL BASINS"],
    ["ENVIRONMENT", "HERE",
      `${q.storms_with_env_at_genesis.toLocaleString()} OF ${total.toLocaleString()} CARRY A RECORD`],
    ["TRAJECTORY", showPathway ? "CONSTRAINED" : "OPEN",
      showPathway ? "PATHWAY SURFACE ON" : "NOT QUERIED"],
    ["INTENSIFICATION", f.intensity !== "all" ? "CONSTRAINED" : "OPEN",
      threshold === null || threshold === undefined ? "NO THRESHOLD" : `PEAK ≥ ${threshold} KT`],
    ["LANDFALL", f.landfall ? "CONSTRAINED" : "OPEN", landfallLabel || "NO FILTER"],
    ["OUTCOME", probe ? "CONSTRAINED" : "OPEN", probe ? "COUNTS RETURNED" : "AWAITING A QUERY"],
  ];

  const pct = total ? (100 * result.kept) / total : 0;
  const seasonLabel = f.seasonFrom === null && f.seasonTo === null
    ? "ALL" : `${f.seasonFrom === null ? bounds[0] : f.seasonFrom}–${f.seasonTo === null ? bounds[1] : f.seasonTo}`;

  return (
    <div className="at-pad">
      <Head n="00" right={<TextButton onClick={onReset}>Reset</TextButton>}>Query</Head>
      <Note>
        The archive is interrogated in six stages. A stage is <b>constrained</b> when the current
        query narrows it, <b>open</b> when the whole archive passes through.
      </Note>
      <div className="at-spine">
        {stages.map(([nm, st]) => (
          <div key={nm} className={"at-stage-row" + (st === "CONSTRAINED" ? " at-on"
            : st === "HERE" ? " at-na" : "")}>
            <i className="at-tick" />
            <span className="at-nm">{nm}</span>
            <span className="at-st">{st === "HERE" ? "NO CONTROL HERE" : st}</span>
          </div>
        ))}
      </div>
      <Note style={{ marginTop: 7 }}>
        {stages.filter((s) => s[1] !== "OPEN").map((s) => (
          <div key={s[0]}>{s[0]} · <b>{s[2]}</b></div>
        ))}
      </Note>

      <GroupRule />
      <Head n="01" right="on the map">Cohort</Head>
      <Figure value={result.kept.toLocaleString()}
        denom={`of ${total.toLocaleString()} storms`} />
      <Bar pct={pct} />
      <Capt>What the filters left on the map</Capt>

      {result.undecidable > 0 ? (
        <Note style={{ marginTop: 8 }}>
          <b style={{ color: "var(--flag)" }}>
            {result.undecidable.toLocaleString()} storm(s) could not be judged by this intensity
            filter
          </b> — the archive records no wind for them. They are neither included nor counted as
          failing it.
        </Note>
      ) : null}

      {droppedByFilter.length ? (
        <details className="at-excl">
          <summary>▸ what the filters removed</summary>
          <div style={{ paddingTop: 4 }}>
            {droppedByFilter.map(([k, n]) => (
              <Row key={k} k={EXCLUSION_LABEL[k] || k} v={n.toLocaleString()} dim />
            ))}
          </div>
        </details>
      ) : null}

      <GroupRule />
      <Head n="02" right={seasonLabel}>Seasons</Head>
      <div className="at-years">
        <YearBox label="from" value={f.seasonFrom} bounds={bounds}
          onChange={(v) => set({ seasonFrom: v })} />
        <YearBox label="to" value={f.seasonTo} bounds={bounds}
          onChange={(v) => set({ seasonTo: v })} />
      </div>
      <div className="at-chips" style={{ marginTop: 6 }}>
        {[[null, null, "ALL"], [1971, null, "1971+"], [1990, null, "1990+"],
          [2000, null, "2000+"], [1851, 1970, "PRE-1971"]].map(([a, b, label]) => (
          <Chip key={label} active={f.seasonFrom === a && f.seasonTo === b}
            onClick={() => set({ seasonFrom: a, seasonTo: b })}
            title={label === "1971+"
              ? "The reliably-observed era. Before 1971 east Pacific intensities were estimated "
                + "without geostationary satellites or Dvorak analysis, and major hurricanes "
                + "were under-observed."
              : undefined}>{label}</Chip>
        ))}
      </div>

      <Head n="03" right={f.months ? `${f.months.length} selected` : "all 12"}>Genesis month</Head>
      <div className="at-months">
        {MONTHS.map((m, i) => (
          <button key={i} type="button" title={MONTH_NAMES[i]}
            aria-pressed={!!(f.months && f.months.includes(i + 1))}
            aria-label={MONTH_NAMES[i]}
            onClick={() => toggleMonth(i + 1)}>{m}</button>
        ))}
      </div>
      <Note style={{ marginTop: 5 }}>
        on the month of <b>genesis</b>, not of landfall
        {f.months ? <> · <TextButton onClick={() => set({ months: null })}
          style={{ fontSize: 8.5 }}>clear</TextButton></> : null}
      </Note>

      <Head n="04" right={f.basins ? f.basins.join(" ") : "all"}>Basin</Head>
      <div className="at-chips">
        <Chip active={!f.basins} onClick={() => set({ basins: null })}>ALL</Chip>
        {(archive.storms.col("basin").dictionary || []).map((b) => (
          <Chip key={b} active={!!f.basins && f.basins.includes(b)}
            onClick={() => set({ basins: f.basins && f.basins.includes(b) ? null : [b] })}
            title={b === "WP" ? "West Pacific genesis — dateline crossers that IBTrACS keeps in "
              + "the loaded basin files." : undefined}>{b}</Chip>
        ))}
        <Chip active={!!f.subbasinsEntered} onClick={() => set({
          subbasinsEntered: f.subbasinsEntered ? null : ["CP"] })}
          title="Storms that ENTERED the Central Pacific at any point in their life -- not
                 storms that formed there. Formed-there loses Iniki, which formed at 134W in the
                 east Pacific.">
          ENTERED CP
        </Chip>
      </div>

      <Head n="05" right={threshold === null || threshold === undefined
        ? "no threshold" : `≥ ${threshold} kt`}>Peak intensity</Head>
      <div className="at-chips">
        {INTENSITY_FILTERS.map((x) => (
          <Chip key={x.key} active={f.intensity === x.key} onClick={() => set({ intensity: x.key })}
            tone={x.key === "all" ? undefined : CATEGORY_COLOR[x.key === "ts" ? "ts" : x.key]}>
            {x.label}
          </Chip>
        ))}
      </div>

      <Head n="06" right={f.landfall ? "1 region" : "none"}>Landfall</Head>
      <div className="at-chips">
        <Chip active={f.landfall === null} onClick={() => set({ landfall: null })}>NO FILTER</Chip>
        {LANDFALL_FILTERS.map((x) => (
          <Chip key={x.key} active={f.landfall === x.key}
            onClick={() => set({ landfall: f.landfall === x.key ? null : x.key })}>
            {x.label}
          </Chip>
        ))}
      </div>
      <Note style={{ marginTop: 6 }}>
        coastline crossings are detected geometrically against the archive's own
        <b> Natural Earth 10m</b> rings — the same geometry the plate draws at full contrast.
      </Note>

      <GroupRule />
      <Head n="07" right={mode}>View</Head>
      <div className="at-chips">
        <Chip active={mode === "explore"} onClick={() => setMode("explore")}>EXPLORE</Chip>
        <Chip active={mode === "replay"} onClick={() => setMode("replay")}>REPLAY</Chip>
      </div>
      <Note style={{ marginTop: 6 }}>
        {mode === "replay"
          ? (timeline && timeline.n
            ? `${timeline.n.toLocaleString()} storms unfold in order · the clock skips stretches `
              + "with none active, and says so"
            : "no storms in this filter")
          : "the record as a finished map"}
      </Note>

      <Head n="08">Density surfaces</Head>
      {/* The notes are the registered claims themselves, not a paraphrase of them. A surface
          that can be turned on from here has to carry the same statement it carries in the
          probe panel, and prose written twice drifts. */}
      <Toggle label="PATHWAY FREQUENCY" on={!!showPathway}
        onChange={(v) => setShowPathway(v)} note={claimText("atlas.pathway")} />
      <Toggle label="GENESIS COUNT" on={!!showGenesisDensity}
        onChange={(v) => setShowGenesisDensity(v)} note={claimText("atlas.genesis_density")} />

      <Head n="09">Layers</Head>
      <Toggle label="COLOUR BY INTENSITY" on={layers.colorBy === "intensity"}
        onChange={(v) => setLayers({ ...layers, colorBy: v ? "intensity" : "uniform" })}
        note="Each segment takes the Saffir-Simpson class of the fix it leaves. Fixes with no
              recorded wind are drawn outside the ramp." />
      <Toggle label="GENESIS POINTS" on={layers.genesis}
        onChange={(v) => setLayers({ ...layers, genesis: v })} />
      <Toggle label="LANDFALLS" on={layers.landfalls}
        onChange={(v) => setLayers({ ...layers, landfalls: v })} />
      <Toggle label="PROVISIONAL SEASONS" on={f.includeProvisional}
        onChange={(v) => set({ includeProvisional: v })}
        note="2025 and 2026 have not been post-analysed. The archive excludes them from analog
              pools by default and so does this." />
    </div>
  );
}

const EXCLUSION_LABEL = {
  season: "outside the season range",
  month: "genesis in an excluded month",
  basin: "outside the basin filter",
  subbasin: "never entered the chosen subbasin",
  intensity: "did not reach the threshold",
  landfall: "no landfall in the chosen region",
  provisional: "provisional season, not post-analysed",
  unnamed: "unnamed",
  noGenesis: "no genesis point in the archive",
};

function YearBox({ label, value, bounds, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" min={bounds[0]} max={bounds[1]}
        value={value === null ? "" : value}
        aria-label={`season ${label}`}
        placeholder={String(label === "from" ? bounds[0] : bounds[1])}
        onChange={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          onChange(v === null || Number.isNaN(v) ? null : v);
        }} />
    </label>
  );
}
