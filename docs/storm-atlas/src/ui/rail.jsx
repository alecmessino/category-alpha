/* The left rail: what is on the map, and what it cost to get there.
 *
 * The counts at the top are the honest ones. Filtering to "Cat 3 and above" drops the
 * population from 3,959 to a few hundred, and a reader is entitled to know how much of that
 * drop was storms that did not reach Cat 3 and how much was storms whose intensity nobody
 * recorded. The archive knows the difference; so does this rail.
 */

import React from "react";
import { INTENSITY_FILTERS, LANDFALL_FILTERS } from "../engine/query.js";
import { CATEGORY_COLOR } from "../render/palette.js";
import { Chip, Head, MONO, Row, claimText } from "./kit.jsx";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export function Rail({ archive, filters, setFilters, result, layers, setLayers, bounds,
  onReset, mode, setMode, showPathway, setShowPathway, showGenesisDensity,
  setShowGenesisDensity, timeline }) {
  const total = archive.manifest.counts.storms;
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

  return (
    <div style={{ padding: "var(--sp-5) var(--sp-6) var(--sp-8)" }}>
      <Head right={<button type="button" onClick={onReset} style={{
        ...MONO, fontSize: "var(--fs-mono-xs)", background: "transparent",
        border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)",
        color: "var(--text-2)", cursor: "pointer", padding: "2px 6px",
      }}>RESET</button>}>ON THE MAP</Head>

      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-stat)", fontWeight: 800,
          color: "var(--text-1)", lineHeight: 1 }}>
          {result.kept.toLocaleString()}
        </span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--text-2)" }}>
          of {total.toLocaleString()} storms
        </span>
      </div>

      {result.undecidable > 0 ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)",
          marginTop: "var(--sp-3)", lineHeight: "var(--lh-body)",
          borderLeft: "var(--bw-signal) solid var(--warn)", paddingLeft: "var(--sp-3)" }}>
          {result.undecidable.toLocaleString()} storm(s) could not be judged by this intensity
          filter — the archive records no wind for them. They are neither included nor counted
          as failing it.
        </div>
      ) : null}

      {droppedByFilter.length ? (
        <details style={{ marginTop: "var(--sp-3)" }}>
          <summary style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            cursor: "pointer", listStyle: "none" }}>
            ▸ what the filters removed
          </summary>
          <div style={{ paddingTop: "var(--sp-2)" }}>
            {droppedByFilter.map(([k, n]) => (
              <Row key={k} k={EXCLUSION_LABEL[k] || k} v={n.toLocaleString()} dim />
            ))}
          </div>
        </details>
      ) : null}

      <Head>SEASONS</Head>
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
        <YearBox label="from" value={f.seasonFrom} bounds={bounds}
          onChange={(v) => set({ seasonFrom: v })} />
        <span style={{ color: "var(--text-2)" }}>–</span>
        <YearBox label="to" value={f.seasonTo} bounds={bounds}
          onChange={(v) => set({ seasonTo: v })} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: "var(--sp-3)" }}>
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

      <Head>GENESIS MONTH</Head>
      <div style={{ display: "flex", gap: 3 }}>
        {MONTHS.map((m, i) => {
          const on = !f.months || f.months.includes(i + 1);
          return (
            <button key={i} type="button" title={MONTH_NAMES[i]}
              onClick={() => toggleMonth(i + 1)}
              style={{
                ...MONO, flex: 1, fontSize: "var(--fs-mono-xs)", padding: "5px 0",
                border: "1px solid " + (f.months && f.months.includes(i + 1)
                  ? "var(--accent)" : "var(--border-dim)"),
                background: f.months && f.months.includes(i + 1)
                  ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
                color: on ? "var(--text-1)" : "var(--text-2)",
                borderRadius: "var(--radius-sm)", cursor: "pointer",
              }}>{m}</button>
          );
        })}
      </div>
      {f.months ? (
        <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
          marginTop: 4 }}>
          filtering on the month of GENESIS, not of landfall ·{" "}
          <button type="button" onClick={() => set({ months: null })} style={linkBtn}>clear</button>
        </div>
      ) : null}

      <Head>BASIN</Head>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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

      <Head>PEAK INTENSITY</Head>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {INTENSITY_FILTERS.map((x) => (
          <Chip key={x.key} active={f.intensity === x.key} onClick={() => set({ intensity: x.key })}
            tone={x.key === "all" ? undefined : CATEGORY_COLOR[x.key === "ts" ? "ts" : x.key]}>
            {x.label}
          </Chip>
        ))}
      </div>

      <Head>LANDFALL</Head>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <Chip active={f.landfall === null} onClick={() => set({ landfall: null })}>NO FILTER</Chip>
        {LANDFALL_FILTERS.map((x) => (
          <Chip key={x.key} active={f.landfall === x.key}
            onClick={() => set({ landfall: f.landfall === x.key ? null : x.key })}>
            {x.label}
          </Chip>
        ))}
      </div>

      <Head>VIEW</Head>
      <div style={{ display: "flex", gap: 4, marginBottom: "var(--sp-4)" }}>
        <Chip active={mode === "explore"} onClick={() => setMode("explore")}>EXPLORE</Chip>
        <Chip active={mode === "replay"} onClick={() => setMode("replay")}>REPLAY</Chip>
      </div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        lineHeight: "var(--lh-body)", marginBottom: "var(--sp-5)" }}>
        {mode === "replay"
          ? (timeline && timeline.n
            ? `${timeline.n.toLocaleString()} storms unfold in order · the clock skips stretches `
              + "with none active, and says so"
            : "no storms in this filter")
          : "the record as a finished map"}
      </div>

      <Head>DENSITY SURFACES</Head>
      {/* The notes are the registered claims themselves, not a paraphrase of them. A surface
          that can be turned on from here has to carry the same statement it carries in the
          probe panel, and prose written twice drifts. */}
      <Toggle label="PATHWAY FREQUENCY" on={!!showPathway}
        onChange={(v) => setShowPathway(v)} note={claimText("atlas.pathway")} />
      <Toggle label="GENESIS COUNT" on={!!showGenesisDensity}
        onChange={(v) => setShowGenesisDensity(v)} note={claimText("atlas.genesis_density")} />

      <Head>LAYERS</Head>
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
  distance: "formed outside the search radius",
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

const linkBtn = {
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
