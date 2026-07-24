import React from "react";

/* KellyBar — the liquidity-capped Q-Kelly allocation bar (IIDS hero component).
   Dual-layer: a TRANSLUCENT background bar = theoretical Kelly capacity, overlaid by
   a SOLID foreground bar = the size actually allowed by real-time order-book liquidity,
   with a distinct vertical RED threshold marker at the liquidity limit.
   theoretical / capped are Kelly fractions (0–1). scale magnifies small fractions
   (codebase uses 2.5). Never show raw theoretical Kelly in isolation. */
export function KellyBar({
  theoretical = 0, capped, allocation, rawPct, stakePct,
  scale = 2.5, showCaption = true, style = {}, ...rest
}) {
  const cap = capped == null ? theoretical : capped;
  const isCapped = cap < theoretical - 1e-6;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const theoPct = clamp(theoretical * 100 * scale);
  const actPct = clamp(cap * 100 * scale);
  return (
    <div style={style} {...rest}>
      {showCaption && (allocation != null || stakePct != null) && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-2)", marginBottom: "6px" }}>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>Q-Kelly:</span>{" "}
          {allocation != null && <b style={{ color: "var(--text-1)" }}>${Number(allocation).toLocaleString()}</b>}
          {stakePct != null && <> · {stakePct}% stake</>}
          {rawPct != null && <span style={{ opacity: 0.7 }}> (raw {rawPct}%)</span>}
          {isCapped && <span style={{ color: "var(--warn)", fontWeight: 700 }}> · LIQ-CAPPED</span>}
        </div>
      )}
      <div style={{ position: "relative", height: "6px", borderRadius: "4px", background: "var(--border-dim)", overflow: "visible" }}>
        {/* theoretical capacity — translucent */}
        <i style={{
          position: "absolute", left: 0, top: 0, height: "100%", width: theoPct + "%",
          borderRadius: "4px", background: "color-mix(in srgb, var(--edge-hot) 26%, transparent)",
        }} />
        {/* liquidity-restricted actual — solid */}
        <i style={{
          position: "absolute", left: 0, top: 0, height: "100%", width: actPct + "%",
          borderRadius: "4px", background: "var(--edge-hot)",
        }} />
        {/* red liquidity threshold marker */}
        {isCapped && (
          <span style={{
            position: "absolute", left: actPct + "%", top: "-3px", width: "2px", height: "12px",
            background: "var(--neg)", transform: "translateX(-1px)",
          }} />
        )}
      </div>
    </div>
  );
}
