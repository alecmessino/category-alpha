import React from "react";

/* Gauge — thin telemetry bar. value 0–100. `gradient` uses the cyan→violet fill;
   otherwise a solid `color`. */
export function Gauge({ value = 0, color = "var(--accent)", gradient = false, height = 7, style = {}, ...rest }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div style={{
      height: height + "px", borderRadius: "6px", background: "var(--border-dim)",
      overflow: "hidden", ...style,
    }} {...rest}>
      <div style={{
        height: "100%", width: v + "%",
        background: gradient ? "linear-gradient(90deg,var(--cyan-500),var(--violet-600))" : color,
        transition: "width var(--ease-ui)",
      }} />
    </div>
  );
}
