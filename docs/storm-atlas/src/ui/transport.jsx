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
 *
 * REDUCED MOTION HALVES THE FRAMES, NOT THE RUN. Where a reader has asked for less movement the
 * clock ticks half as often and steps twice as far: the same storm over the same hours, watched
 * in fewer moving frames rather than in a shorter or a different replay. Nothing autoplays in
 * either mode; the transport only ever runs because someone pressed it.
 */

import React from "react";

import { categoryFor } from "../engine/stats.js";
import { formatPosition } from "../engine/geo.js";
import { MONO, Num, Txt, fmtUTC } from "./kit.jsx";

const SPEEDS = [1, 2, 4, 8];

/** Whether the reader has asked for less movement. Read at tick time, not cached at import:
 *  the preference can change while the page is open. */
export function prefersReducedMotion() {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function Transport({ archive, row, playing, setPlaying, cursorMs, setCursorMs }) {
  const [speed, setSpeed] = React.useState(2);
  const a = archive;
  const range = React.useMemo(() => (row === null ? null : a.trackRange(row)), [a, row]);

  const t0 = range ? a.ptT[range[0]] * 60000 : null;
  const t1 = range ? a.ptT[range[1] - 1] * 60000 : null;

  /* SELECTING A STORM IS NOT STARTING A REPLAY, and parking the cursor here made it one.
   *
   * This used to set the cursor to t0 the moment a storm was selected. The shell passes that
   * cursor to the selection layer as `replayMs`, and the layer reveals the track only as far as
   * the instant it is given -- so clicking a genesis point drew ONE DOT. The panel beside it
   * said "One storm, whole life" and listed a 71-fix track and an 8.8-day lifetime, and the map
   * showed the first fix. The reader's next move, reasonably, is to conclude the map is broken.
   *
   * A null cursor means "no instant is selected", which the layer already renders as the whole
   * observed track -- the finished record, which is what EXPLORE means everywhere else on this
   * surface. The transport then reads at the LAST fix, because that is where a finished record
   * stands, and pressing play rewinds to the first: `atEnd` is already true in that state, so
   * the existing restart branch does exactly the right thing with no new state. */
  React.useEffect(() => {}, [row]);

  /* setInterval rather than rAF, and it HALTS at the end rather than wrapping. A transport that
     wraps silently restarts the storm, which reads as a live feed rather than a replay. */
  React.useEffect(() => {
    if (!playing || row === null || t0 === null) return undefined;
    const coarse = prefersReducedMotion() ? 2 : 1;
    const stepMs = 3 * 3600 * 1000 * coarse; // three archive hours per tick, six when coarse
    const iv = setInterval(() => {
      setCursorMs((c) => {
        const next = (c === null ? t0 : c) + stepMs;
        if (next >= t1) { setPlaying(false); return t1; }
        return next;
      });
    }, Math.round((320 * coarse) / speed));
    return () => clearInterval(iv);
  }, [playing, speed, row, t0, t1]);

  if (row === null || !range) return null;

  // The fix in force: the last one at or before the cursor. Nothing is interpolated here.
  // With no cursor the whole track is drawn, so the transport stands at its last fix.
  const cursor = cursorMs === null ? t1 : cursorMs;
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
    <div className="at-transport">
      <button type="button" className={playing ? "at-tbtn at-on" : "at-tbtn"}
        aria-label={playing ? "pause" : atEnd ? "replay from genesis" : "play"}
        title={playing ? "pause" : atEnd ? "replay from genesis" : "play"}
        onClick={() => { if (atEnd) setCursorMs(t0); setPlaying(!playing); }}>
        {playing ? "❚❚" : atEnd ? "↻" : "▶"}
      </button>

      <div className="at-speeds">
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={speed === s ? "at-on" : undefined}
            aria-label={`${s} times speed`} aria-pressed={speed === s}
            onClick={() => setSpeed(s)}>{s}×</button>
        ))}
      </div>

      <div className="at-scrub">
        <input type="range" min={t0} max={t1} step={3600000} value={cursor}
          onChange={(e) => { setPlaying(false); setCursorMs(Number(e.target.value)); }}
          aria-label="replay position along the track" />
        <div className="at-ends">
          <span>{fmtUTC(t0, { time: false })}</span>
          <span>FIX {k - range[0] + 1} / {range[1] - range[0]}</span>
          <span>{fmtUTC(t1, { time: false })}</span>
        </div>
      </div>

      <div className="at-readouts">
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
              />
            {cat ? <span style={{ ...MONO, marginLeft: 6 }}>
              {cat.toUpperCase()}
            </span> : null}
          </span>} />
        <Readout label="FIX" value={
          <span style={{ ...MONO, color: quality === "observed" ? "var(--pos)" : "var(--flag)" }}>
            {String(quality || "—").toUpperCase()}
          </span>} />
      </div>
    </div>
  );
}

function Readout({ label, value }) {
  return (
    <div className="at-ro">
      <span className="at-k">{label}</span>
      <span className="at-v">{value}</span>
    </div>
  );
}
