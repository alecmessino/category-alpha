import React from "react";

/* StatTile — a hero stat (.stat) or command-rail metric (.cmd-metric). Big value with
   a dimmed unit, an uppercase label, and an optional sub line. `color` tints the value. */
export function StatTile({ label, value, unit, sub, color, variant = "tile", style = {}, ...rest }) {
  const rail = variant === "metric";
  return (
    <div style={{
      background: rail ? "var(--surface-card)" : "var(--surface-sunken)",
      border: rail ? "none" : "1px solid var(--border-dim)",
      borderRadius: rail ? 0 : "var(--radius-lg)",
      padding: rail ? "9px 14px" : "12px 14px", minWidth: 0, ...style,
    }} {...rest}>
      <div style={{
        fontFamily: rail ? "var(--font-mono)" : "var(--font-sans)",
        fontSize: rail ? "9px" : "10px", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: rail ? "1.2px" : "var(--track-label)",
        color: "var(--text-2)",
      }}>{label}</div>
      <div className="num" style={{
        fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
        fontSize: rail ? "22px" : "var(--fs-stat)", fontWeight: 800,
        lineHeight: 1, marginTop: "3px", color: color || "var(--text-1)", letterSpacing: "-.3px",
      }}>
        {value}
        {unit && <small style={{ fontSize: rail ? "11px" : "13px", color: "var(--text-2)", fontWeight: 700, marginLeft: "3px" }}>{unit}</small>}
      </div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-2)", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}
