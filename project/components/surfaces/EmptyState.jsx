import React from "react";

/* EmptyState — cinematic terminal empty state. NEVER "No data available".
   Renders monospaced rule lines, a bracketed title, a plain-language line, an
   "Awaiting:" bullet list, and a pipeline-status line. */
export function EmptyState({
  title = "SYSTEM AWAITING TELEMETRY",
  message = "Research ledger empty.",
  awaiting = [],
  status = "INGESTION READY",
  statusTone = "pos",
  style = {}, ...rest
}) {
  const rule = "─".repeat(52);
  const stColor = { pos: "var(--pos)", warn: "var(--warn)", neg: "var(--neg)", special: "var(--special)", neutral: "var(--text-2)" }[statusTone] || "var(--pos)";
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono-md)", lineHeight: 1.7,
      color: "var(--text-2)", background: "var(--surface-sunken)",
      border: "1px solid var(--border-dim)", borderRadius: "var(--radius-md)",
      padding: "18px 20px", whiteSpace: "pre-wrap", overflowX: "auto", ...style,
    }} {...rest}>
      <div style={{ color: "var(--border-strong)", letterSpacing: "-.5px" }}>{rule}</div>
      <div style={{ color: "var(--accent)", fontWeight: 700, letterSpacing: "1px", margin: "6px 0" }}>[ {title} ]</div>
      <div style={{ color: "var(--text-1)" }}>{message}</div>
      {awaiting.length > 0 && (
        <div style={{ margin: "8px 0" }}>
          <div style={{ color: "var(--text-2)" }}>Awaiting:</div>
          {awaiting.map((a, i) => (
            <div key={i} style={{ color: "var(--text-2)", paddingLeft: "4px" }}>• {a}</div>
          ))}
        </div>
      )}
      <div style={{ margin: "6px 0" }}>
        <span style={{ color: "var(--text-2)" }}>Pipeline Status: </span>
        <span style={{ color: stColor, fontWeight: 700, letterSpacing: ".5px" }}>{status}</span>
      </div>
      <div style={{ color: "var(--border-strong)", letterSpacing: "-.5px" }}>{rule}</div>
    </div>
  );
}
