import React from "react";

/* ReplayDeck — the Temporal Replay VCR transport (IIDS hero). A multi-control tactical
   playback cluster: step-back [◀◀], play/pause [▶/❚❚], step-forward [▶▶|], jump-to-live
   [▶▶ Live], a scrubber with bookmarked historical-event micro-jumps, a live/replay
   badge, timestamp, and speed cycle. Self-driving: manages play + cursor internally,
   emitting onSeek(idx). Frames are assumed evenly spaced (stepMin apart, ending now). */
export function ReplayDeck({
  frames = 24, stepMin = 10, speeds = [1, 2, 4], bookmarks = [],
  subLabel = "GOES · ABI", autoplay = true, onSeek, style = {}, ...rest
}) {
  const [idx, setIdx] = React.useState(frames - 1);
  const [playing, setPlaying] = React.useState(autoplay);
  const [speed, setSpeed] = React.useState(speeds[0]);
  const last = frames - 1;
  React.useEffect(() => { onSeek && onSeek(idx); }, [idx]);
  React.useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setIdx((i) => (i >= last ? 0 : i + 1)), Math.round(560 / speed));
    return () => clearInterval(t);
  }, [playing, speed, last]);

  const ageMin = (last - idx) * stepMin;
  const isLive = idx >= last;
  const now = Date.now();
  const stamp = new Date(now - ageMin * 60000);
  const pad = (n) => (n < 10 ? "0" : "") + n;
  const hhmm = pad(stamp.getUTCHours()) + ":" + pad(stamp.getUTCMinutes()) + "Z";
  const humanAge = ageMin < 60 ? ageMin + "m" : Math.floor(ageMin / 60) + "h" + pad(ageMin % 60) + "m";

  const btn = {
    cursor: "pointer", flex: "none", border: "1px solid var(--border-strong)",
    background: "var(--surface-sunken)", color: "var(--text-2)", display: "flex",
    alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)",
    borderRadius: "var(--radius-sm)", transition: "all var(--ease-ui)",
  };
  const seek = (i) => { setPlaying(false); setIdx(Math.max(0, Math.min(last, i))); };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
      background: "var(--surface-card)", border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)", ...style,
    }} {...rest}>
      {/* transport cluster */}
      <div style={{ display: "flex", gap: "6px", flex: "none" }}>
        <div title="Step back" onClick={() => seek(idx - 1)} style={{ ...btn, width: "30px", height: "30px", fontSize: "11px" }}>◀◀</div>
        <div title="Play / pause" onClick={() => setPlaying(!playing)} style={{
          ...btn, width: "36px", height: "36px", fontSize: "13px",
          background: "var(--surface-solid)", color: "var(--text-inverse)", borderColor: "var(--surface-solid)",
        }}>{playing ? "❚❚" : "▶"}</div>
        <div title="Step forward" onClick={() => seek(idx + 1)} style={{ ...btn, width: "30px", height: "30px", fontSize: "11px" }}>▶▶|</div>
        <div title="Jump to live" onClick={() => { setPlaying(true); setIdx(last); }} style={{
          ...btn, padding: "0 10px", height: "30px", fontSize: "10px", fontWeight: 700, letterSpacing: ".5px",
          color: isLive ? "var(--pos)" : "var(--text-2)",
          borderColor: isLive ? "var(--pos)" : "var(--border-strong)",
        }}>▶▶ Live</div>
      </div>

      {/* scrubber with bookmarks */}
      <div style={{ flex: 1, position: "relative", height: "30px", display: "flex", alignItems: "center", minWidth: 0 }}>
        <div style={{ position: "relative", width: "100%", height: "5px", borderRadius: "3px", background: "var(--border-dim)", overflow: "visible" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (idx / last * 100) + "%", background: "linear-gradient(90deg,var(--cyan-500),var(--cyan-400))", borderRadius: "3px" }} />
          {bookmarks.map((b) => (
            <span key={b.i} title={b.label} onClick={() => seek(b.i)} style={{
              position: "absolute", top: "-4px", left: (b.i / last * 100) + "%", width: "2px", height: "13px",
              background: b.color || "var(--warn)", transform: "translateX(-1px)", cursor: "pointer",
            }} />
          ))}
        </div>
        <input type="range" min={0} max={last} value={idx} step={1}
          onChange={(e) => seek(+e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "30px", margin: 0, opacity: 0, cursor: "pointer" }} />
      </div>

      {/* live / replay badge + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: "none" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "var(--font-mono)",
          fontSize: "9.5px", fontWeight: 700, letterSpacing: "1px", padding: "3px 9px",
          borderRadius: "var(--radius-pill)",
          color: isLive ? "var(--pos)" : "var(--warn)",
          border: "1px solid " + (isLive ? "color-mix(in srgb,var(--pos) 35%,transparent)" : "color-mix(in srgb,var(--warn) 35%,transparent)"),
          background: isLive ? "color-mix(in srgb,var(--pos) 8%,transparent)" : "color-mix(in srgb,var(--warn) 8%,transparent)",
        }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: isLive ? "var(--pos)" : "var(--warn)", animation: isLive ? "ca-pulse 1.8s infinite" : "none" }} />
          {isLive ? "LIVE" : "REPLAY −" + humanAge}
        </span>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-1)", textAlign: "right", minWidth: "96px", fontVariantNumeric: "tabular-nums" }}>
          {hhmm}
          <small style={{ display: "block", color: "var(--text-2)", fontWeight: 600, fontSize: "9px", letterSpacing: "1px" }}>{subLabel}</small>
        </div>
        <div title="Playback speed" onClick={() => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length])} style={{
          ...btn, padding: "5px 9px", height: "26px", fontSize: "10px", fontWeight: 700,
        }}>{speed}×</div>
      </div>
    </div>
  );
}
