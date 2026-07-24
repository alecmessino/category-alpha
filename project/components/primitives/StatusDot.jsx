import React from "react";

/* StatusDot — small filled circle carrying feed/PAI state. status: ok|stale|missing|
   live|neutral, or pass a raw `color`. `pulse` runs the sanctioned live-pulse anim
   (auto on for status="live"|"ok"). */
const S = {
  ok: "var(--pos)", live: "var(--pos)", stale: "var(--warn)",
  missing: "var(--border-strong)", neutral: "var(--text-2)",
};
export function StatusDot({ status = "neutral", color, size = 8, pulse, style = {}, ...rest }) {
  const c = color || S[status] || S.neutral;
  const doPulse = pulse != null ? pulse : (status === "live" || status === "ok");
  return (
    <span style={{
      display: "inline-block", width: size + "px", height: size + "px", borderRadius: "50%",
      background: c, flex: "none",
      animation: doPulse ? "ca-pulse 2s infinite" : "none", ...style,
    }} {...rest} />
  );
}
