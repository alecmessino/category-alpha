import React from "react";

/* HealthRow — one operational system-health check (.hrow + .hchip). Name, a mono
   detail line, and a status chip (PASS / EMPTY / BLOCKED / FAIL). Distinct from
   evidence-quality: this is operational, not scientific. */
const CHIP = {
  PASS: "var(--pos)", EMPTY: "var(--text-2)", BLOCKED: "var(--special)", FAIL: "var(--neg)",
};
export function HealthRow({ name, detail, status = "PASS", style = {}, ...rest }) {
  const c = CHIP[status] || CHIP.FAIL;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
      background: "var(--surface-sunken)", border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)", padding: "9px 11px", minWidth: 0, ...style,
    }} {...rest}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-1)" }}>{name}</div>
        {detail && <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-2)", marginTop: "2px", wordBreak: "break-word" }}>{detail}</div>}
      </div>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "9.5px", fontWeight: 700, letterSpacing: ".6px",
        padding: "3px 8px", borderRadius: "var(--radius-pill)", flex: "none", color: c,
        background: status === "EMPTY" ? "var(--surface-app)" : `color-mix(in srgb, ${c} 13%, transparent)`,
      }}>{status}</span>
    </div>
  );
}
