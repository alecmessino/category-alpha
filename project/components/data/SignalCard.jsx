import React from "react";

/* SignalCard — a divergence signal (.sigcard). Signed edge, a centered edge meter
   (model vs market), model/market probabilities, a confidence tier, and BUY/SELL/HOLD.
   Left rule + numbers are tinted by the signal side. */
const SIG = {
  BUY: { c: "var(--pos)", label: "LONG · mispriced" },
  SELL: { c: "var(--neg)", label: "SHORT · mispriced" },
  HOLD: { c: "var(--text-2)", label: "HOLD" },
};
const CONF_TONE = { HIGH: "pos", MED: "neutral", MEDIUM: "neutral", LOW: "warn" };
export function SignalCard({
  label, signal = "HOLD", edge = 0, modelProb, marketProb, conf, confReason,
  unmapped = false, Badge, style = {}, ...rest
}) {
  const s = SIG[signal] || SIG.HOLD;
  const meterPct = Math.max(0, Math.min(100, 50 + edge * 1.4));
  const sign = edge >= 0 ? "+" : "";
  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border-dim)",
      borderLeft: "var(--bw-signal) solid " + s.c, borderRadius: "var(--radius-md)",
      padding: "13px 15px", minWidth: 0, ...style,
    }} {...rest}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-1)" }}>{label}</span>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, padding: "2px 7px",
          borderRadius: "6px", color: s.c, background: `color-mix(in srgb, ${s.c} 13%, transparent)`, whiteSpace: "nowrap",
        }}>{s.label}</span>
      </div>
      <div className="num" style={{
        fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", fontSize: "22px",
        fontWeight: 800, color: s.c, marginTop: "4px",
      }}>{sign}{edge.toFixed(1)}%</div>
      <div style={{ position: "relative", height: "6px", borderRadius: "4px", background: "var(--border-dim)", marginTop: "9px" }}>
        <span style={{ position: "absolute", left: "50%", top: "-3px", width: "1px", height: "12px", background: "var(--text-2)", opacity: 0.5 }} />
        <i style={{ position: "absolute", top: 0, height: "100%", borderRadius: "4px", width: "6px", left: meterPct + "%", background: s.c, transform: "translateX(-3px)" }} />
      </div>
      {(modelProb != null || marketProb != null) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-2)", marginTop: "9px", fontFamily: "var(--font-mono)" }}>
          <span>model <b style={{ color: "var(--text-1)" }}>{modelProb}%</b></span>
          <span>mkt <b style={{ color: "var(--text-1)" }}>{marketProb}%</b></span>
        </div>
      )}
      {(conf || unmapped) && (
        <div style={{ display: "flex", gap: "6px", marginTop: "9px", flexWrap: "wrap" }}>
          {conf && (Badge
            ? <Badge tone={CONF_TONE[conf] || "neutral"} title={confReason}>CONF {conf}</Badge>
            : <span title={confReason} style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", fontWeight: 700, padding: "3px 8px", borderRadius: "5px", color: "var(--text-2)", background: "var(--surface-sunken)" }}>CONF {conf}</span>)}
          {unmapped && <span style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", fontWeight: 700, padding: "3px 8px", borderRadius: "5px", color: "var(--warn)", background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}>UNMAPPED CONTRACT</span>}
        </div>
      )}
    </div>
  );
}
