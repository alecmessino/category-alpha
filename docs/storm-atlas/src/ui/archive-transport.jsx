/* The archive's clock: 175 years of record, played.
 *
 * Sibling to transport.jsx, not a replacement for it. That one replays ONE storm along its own
 * track and assumes a single range; this one drives the whole filtered population. They share
 * the same discipline -- setInterval rather than rAF, halt at the end rather than wrap, real
 * timestamps rather than a frame index times a nominal step.
 *
 * THE SKIP IS NEVER SILENT. 75.1% of the archive's calendar span has no storm active at all,
 * so the cursor jumps those stretches -- but a clock that quietly teleported through eleven
 * months would misrepresent the record's rhythm, and the off-season IS one of the things the
 * record has to say. Every jump is announced, and the running total of skipped days stays on
 * screen for the whole run.
 *
 * SPEED IS STATED IN ARCHIVE TIME, NOT AS A MULTIPLIER. "8×" is meaningless without knowing
 * what one× was; "45 d/s" says exactly what the trade is. The consequence is legible too: a
 * median storm lasts about six days, so at 5 d/s it crosses the screen in a second and at
 * 120 d/s it is a flash -- which is the right choice when the subject is the mat rather than
 * the storm.
 */

import React from "react";
import { activeAt, advance, fromActive, toActive } from "../engine/timeline.js";
import { MONO, fmtUTC } from "./kit.jsx";

/* Archive days per wall-clock second. The whole record holds 15,878 storm-active days, so the
   fastest preset runs it in about two minutes and the slowest in nearly an hour. */
const SPEEDS = [5, 15, 45, 120];
const TICK_MS = 50;
const DAY_MIN = 1440;

export function ArchiveTransport({ timeline, cursorMin, setCursorMin, playing, setPlaying,
  skipQuiet = true }) {
  const [speed, setSpeed] = React.useState(15);
  const [skipped, setSkipped] = React.useState(0);      // running total, minutes
  const [flash, setFlash] = React.useState(null);       // the jump just made, minutes
  const tl = timeline;

  // A new timeline is a new run: the totals belong to it, not to the previous filter.
  React.useEffect(() => { setSkipped(0); setFlash(null); }, [tl]);

  React.useEffect(() => {
    if (!playing || !tl || !tl.n) return undefined;
    const perTick = (speed * DAY_MIN * TICK_MS) / 1000;
    const iv = setInterval(() => {
      setCursorMin((c) => {
        const from = c === null ? tl.firstT : c;
        const r = advance(tl, from, perTick, { skipQuiet });
        if (r.skippedMin > 0) {
          setSkipped((s) => s + r.skippedMin);
          setFlash(r.skippedMin);
        }
        if (r.done) setPlaying(false);
        return r.cursor;
      });
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [playing, speed, tl, skipQuiet, setCursorMin, setPlaying]);

  /* The jump notice clears itself; without this a single early skip would sit on screen for the
     rest of the run and read as though the clock were still jumping. */
  React.useEffect(() => {
    if (flash === null) return undefined;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  if (!tl || !tl.n) return null;
  const cursor = cursorMin === null ? tl.firstT : cursorMin;
  const active = activeAt(tl, cursor);
  const atEnd = cursor >= tl.lastT;
  const activeMin = toActive(tl, cursor);

  const jump = (deltaYears) => {
    setPlaying(false);
    const target = cursor + deltaYears * 365.25 * DAY_MIN;
    setCursorMin(Math.max(tl.firstT, Math.min(tl.lastT, target)));
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "var(--sp-5)",
      padding: "var(--sp-4) var(--sp-6)", borderTop: "1px solid var(--border-dim)",
      background: "var(--surface-card)", minHeight: 56, flexWrap: "wrap",
    }}>
      <button type="button" onClick={() => {
        if (atEnd) { setCursorMin(tl.firstT); setSkipped(0); }
        setPlaying(!playing);
      }} style={{
        ...MONO, fontSize: "var(--fs-mono-md)", width: 34, height: 28,
        border: "1px solid " + (playing ? "var(--accent)" : "var(--border-strong)"),
        background: playing ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
        color: playing ? "var(--accent)" : "var(--text-1)", borderRadius: "var(--radius-sm)",
        cursor: "pointer", flex: "none",
      }} title={playing ? "pause" : atEnd ? "replay from the start of the record" : "play"}>
        {playing ? "❚❚" : atEnd ? "↻" : "▶"}
      </button>

      <div style={{ display: "flex", gap: 3, flex: "none" }}>
        {SPEEDS.map((s) => (
          <button key={s} type="button" onClick={() => setSpeed(s)}
            title={`${s} archive days per second`} style={{
              ...MONO, fontSize: "var(--fs-mono-xs)", padding: "3px 6px",
              border: "1px solid " + (speed === s ? "var(--accent)" : "var(--border-dim)"),
              background: "transparent", color: speed === s ? "var(--accent)" : "var(--text-2)",
              borderRadius: "var(--radius-sm)", cursor: "pointer",
            }}>{s} d/s</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 3, flex: "none" }}>
        <Step onClick={() => jump(-10)} title="back ten years">« 10y</Step>
        <Step onClick={() => jump(10)} title="forward ten years">10y »</Step>
      </div>

      {/* The scrub runs in ACTIVE time, so the bar is uniformly dense in storms rather than in
          calendar years -- dragging through the 1860s would otherwise cross a decade of empty
          ocean in a few pixels while a busy modern season occupied the same width. */}
      <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
        <input type="range" min={0} max={Math.round(tl.activeMin)} step={DAY_MIN}
          value={Math.round(activeMin)}
          onChange={(e) => { setPlaying(false); setCursorMin(fromActive(tl, Number(e.target.value))); }}
          aria-label="position in the archive"
          style={{ width: "100%", accentColor: "var(--accent)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", ...MONO,
          fontSize: "var(--fs-mono-xs)", color: "var(--text-2)", marginTop: -2 }}>
          <span>{fmtUTC(tl.firstT * 60000, { time: false })}</span>
          <span style={{ color: "var(--text-2)" }}>storm-active time</span>
          <span>{fmtUTC(tl.lastT * 60000, { time: false })}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--sp-6)", flex: "none", alignItems: "baseline" }}>
        <Readout label="UTC" value={fmtUTC(cursor * 60000)} />
        <Readout label="ACTIVE NOW" value={`${active.length} storm${active.length === 1 ? "" : "s"}`} />
        <Readout label="REVEALED" value={`${revealedLabel(tl, cursor)} / ${tl.n.toLocaleString()}`} />
        <Readout label="QUIET TIME SKIPPED"
          value={skipped > 0 ? `${Math.round(skipped / DAY_MIN).toLocaleString()} d` : "0 d"} />
      </div>

      {flash !== null ? (
        <div style={{
          ...MONO, fontSize: "var(--fs-mono-xs)", letterSpacing: "var(--track-label)",
          color: "var(--warn)", border: "1px solid var(--warn)",
          background: "color-mix(in srgb, var(--warn) 12%, transparent)",
          borderRadius: "var(--radius-sm)", padding: "3px 8px", flex: "none", whiteSpace: "nowrap",
        }}>
          SKIPPED {fmtGap(flash)} · NO STORM ACTIVE
        </div>
      ) : null}
    </div>
  );
}

/* A gap shorter than a day is reported in hours rather than rounded up to "1 DAYS" -- which was
   both ungrammatical and an overstatement of how much time the clock actually skipped. */
function fmtGap(minutes) {
  if (minutes < DAY_MIN) {
    const h = Math.max(1, Math.round(minutes / 60));
    return `${h} HOUR${h === 1 ? "" : "S"}`;
  }
  const d = Math.round(minutes / DAY_MIN);
  return `${d.toLocaleString()} DAY${d === 1 ? "" : "S"}`;
}

/* Reported from the timeline rather than counted on screen: the prefix is what has been
   revealed, and it includes the 26 single-fix storms that no sampled frame ever catches. */
function revealedLabel(tl, cursor) {
  let lo = 0;
  let hi = tl.n - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.start[mid] <= cursor) { last = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return (last + 1).toLocaleString();
}

function Step({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} style={{
      ...MONO, fontSize: "var(--fs-mono-xs)", padding: "3px 6px",
      border: "1px solid var(--border-dim)", background: "transparent",
      color: "var(--text-2)", borderRadius: "var(--radius-sm)", cursor: "pointer",
    }}>{children}</button>
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
