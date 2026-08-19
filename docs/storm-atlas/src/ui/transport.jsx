/* Replay along a storm's actual track.
 *
 * THE READOUT COMES FROM A FIX, NOT FROM THE ANIMATION. The head moves smoothly because it is
 * interpolated along the segment between the two fixes that bracket the cursor, but every
 * number beside it -- the wind, the class, the position, the hours since genesis -- is read
 * from the fix in force. Interpolating a wind to make the counter run smoothly would be
 * inventing an observation, which is the one thing this archive will not do to look better.
 *
 * The clock is the storm's own. Elapsed time is real hours between real timestamps, never a
 * frame index times a nominal step -- the terminal learned that when a 4-frame scrub turned out
 * to be hours rather than an hour.
 */

import React from "react";
import { CATEGORY_COLOR } from "../render/palette.js";
import { categoryFor } from "../engine/stats.js";
import { formatPosition } from "../engine/geo.js";
import { MONO, Num, Txt, fmtUTC } from "./kit.jsx";

const SPEEDS = [1, 2, 4, 8];

export function Transport({ archive, row, playing, setPlaying, cursorMs, setCursorMs }) {
  const [speed, setSpeed] = React.useState(2);
  const a = archive;
  const range = React.useMemo(() => (row === null ? null : a.trackRange(row)), [a, row]);

  const t0 = range ? a.ptT[range[0]] * 60000 : null;
  const t1 = range ? a.ptT[range[1] - 1] * 60000 : null;

  React.useEffect(() => {
    if (row === null || cursorMs !== null) return;
    setCursorMs(t0);
  }, [row]);

  /* setInterval rather than rAF, and it HALTS at the end rather than wrapping. A transport that
     wraps silently restarts the storm, which reads as a live feed rather than a replay. */
  React.useEffect(() => {
    if (!playing || row === null || t0 === null) return undefined;
    const stepMs = 3 * 3600 * 1000; // three archive hours per tick
    const iv = setInterval(() => {
      setCursorMs((c) => {
        const next = (c === null ? t0 : c) + stepMs;
        if (next >= t1) { setPlaying(false); return t1; }
        return next;
      });
    }, Math.round(320 / speed));
    return () => clearInterval(iv);
  }, [playing, speed, row, t0, t1]);

  if (row === null || !range) return null;

  // The fix in force: the last one at or before the cursor. Nothing is interpolated here.
  const cursor = cursorMs === null ? t0 : cursorMs;
  let k = range[0];
  while (k + 1 < range[1] && a.ptT[k + 1] * 60000 <= cursor) k++;

  const vmaxRaw = a.ptVmax[k];
  const vmax = vmaxRaw === -32768 ? null : vmaxRaw;
  const cat = categoryFor(vmax);
  const genesisMin = a.genesisT[row];
  const hasGenesis = genesisMin !== -2147483648;
  const hoursSinceGenesis = hasGenesis ? (a.ptT[k] - genesisMin) / 60 : null;
  const quality = a.points.str("quality", k);
  const preGenesis = hasGenesis && a.ptT[k] < genesisMin;
  const atEnd = cursor >= t1;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-5)",
      padding: "var(--sp-4) var(--sp-6)", borderTop: "1px solid var(--border-dim)",
      background: "var(--surface-card)", minHeight: 56,
    }}>
      <button type="button" onClick={() => {
        if (atEnd) setCursorMs(t0);
        setPlaying(!playing);
      }} style={{
        ...MONO, fontSize: "var(--fs-mono-md)", width: 34, height: 28,
        border: "1px solid " + (playing ? "var(--accent)" : "var(--border-strong)"),
        background: playing ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
        color: playing ? "var(--accent)" : "var(--text-1)", borderRadius: "var(--radius-sm)",
        cursor: "pointer", flex: "none",
      }} title={playing ? "pause" : atEnd ? "replay from genesis" : "play"}>
        {playing ? "❚❚" : atEnd ? "↻" : "▶"}
      </button>

      <div style={{ display: "flex", gap: 3, flex: "none" }}>
        {SPEEDS.map((s) => (
          <button key={s} type="button" onClick={() => setSpeed(s)} style={{
            ...MONO, fontSize: "var(--fs-mono-xs)", padding: "3px 6px",
            border: "1px solid " + (speed === s ? "var(--accent)" : "var(--border-dim)"),
            background: "transparent", color: speed === s ? "var(--accent)" : "var(--text-2)",
            borderRadius: "var(--radius-sm)", cursor: "pointer",
          }}>{s}×</button>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <input type="range" min={t0} max={t1} step={3600000} value={cursor}
          onChange={(e) => { setPlaying(false); setCursorMs(Number(e.target.value)); }}
          aria-label="replay position"
          style={{ width: "100%", accentColor: "var(--accent)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", ...MONO,
          fontSize: "var(--fs-mono-xs)", color: "var(--text-2)", marginTop: -2 }}>
          <span>{fmtUTC(t0, { time: false })}</span>
          <span>{fmtUTC(t1, { time: false })}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--sp-6)", flex: "none", alignItems: "baseline" }}>
        <Readout label="UTC" value={<Txt value={fmtUTC(a.ptT[k] * 60000)} />} />
        <Readout label={preGenesis ? "BEFORE GENESIS" : "SINCE GENESIS"}
          value={hoursSinceGenesis === null
            ? <Txt value={null} absent="this storm has no genesis point in the archive" />
            : <span style={{ ...MONO }}>{hoursSinceGenesis >= 0 ? "+" : "−"}
                {Math.abs(Math.round(hoursSinceGenesis))} h</span>} />
        <Readout label="POSITION"
          value={<Txt value={formatPosition(a.ptLat[k] / 100, a.ptLon[k] / 100)} />} />
        <Readout label="INTENSITY" value={
          <span>
            <Num value={vmax} unit="kt" absent="no wind was recorded at this fix"
              tone={cat ? CATEGORY_COLOR[cat] : undefined} />
            {cat ? <span style={{ ...MONO, color: CATEGORY_COLOR[cat], marginLeft: 6 }}>
              {cat.toUpperCase()}
            </span> : null}
          </span>} />
        <Readout label="FIX" value={
          <span style={{ ...MONO, color: quality === "observed" ? "var(--pos)" : "var(--warn)" }}>
            {String(quality || "—").toUpperCase()}
          </span>} />
      </div>
    </div>
  );
}

function Readout({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        letterSpacing: "var(--track-label)" }}>{label}</div>
      <div style={{ ...MONO, fontSize: "var(--fs-mono-md)", color: "var(--text-1)",
        whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}
