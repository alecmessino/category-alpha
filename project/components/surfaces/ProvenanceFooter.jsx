import React from "react";

/* ProvenanceFooter — the Phase-3 observability micro-footer every card can carry:
   [ Source: NHC / RECON · Latency: 4m · Ver: 1.2.4 · Tier: A ]
   All monospaced. Tier renders as a tinted letter chip (A pos / B warn / C neg).
   Pass named fields and/or freeform `items` [{k,v}]. */
const TIER = { A: "var(--pos)", B: "var(--warn)", C: "var(--neg)" };
export function ProvenanceFooter({ source, latency, version, tier, items = [], style = {}, ...rest }) {
  const parts = [];
  if (source) parts.push(["Source", source]);
  if (latency) parts.push(["Latency", latency]);
  if (version) parts.push(["Ver", version]);
  items.forEach((it) => parts.push([it.k, it.v]));
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px",
      fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono-xs)", fontWeight: 500,
      letterSpacing: "var(--track-mono)", color: "var(--text-2)",
      padding: "7px 12px", background: "var(--surface-sunken)",
      borderTop: "1px solid var(--border-dim)", ...style,
    }} {...rest}>
      <span style={{ opacity: 0.5 }}>[</span>
      {parts.map(([k, v], i) => (
        <span key={i}>
          <span style={{ opacity: 0.7 }}>{k}:</span>{" "}
          <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{v}</span>
        </span>
      ))}
      {tier && (
        <span style={{
          color: TIER[tier] || "var(--text-2)", fontWeight: 700,
          background: `color-mix(in srgb, ${TIER[tier] || "var(--text-2)"} 14%, transparent)`,
          padding: "1px 6px", borderRadius: "4px",
        }}>Tier: {tier}</span>
      )}
      <span style={{ opacity: 0.5 }}>]</span>
    </div>
  );
}
