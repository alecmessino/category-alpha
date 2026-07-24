import React from "react";
import { KellyBar } from "./KellyBar.jsx";

/* EdgeCell — a cell of the Edge Matrix / Alpha Surface (.mxcell). Contract name, the
   Category Alpha edge (radioactive glow at >=15%, green >0, dim otherwise), market
   price + order-book liquidity, and an embedded liquidity-capped KellyBar. */
export function EdgeCell({
  contract, edge = 0, marketPct, liquidity,
  theoretical, capped, allocation, stakePct, rawPct, style = {}, ...rest
}) {
  const sign = edge >= 0 ? "+" : "";
  const edgeStyle = edge >= 15
    ? { color: "var(--edge-glow)", textShadow: "var(--glow-edge)" }
    : edge > 0 ? { color: "var(--pos)" } : { color: "var(--text-2)", opacity: 0.7 };
  const hasBet = theoretical != null && edge > 0;
  return (
    <div style={{
      background: "var(--surface-card)", border: "1px solid var(--border-dim)",
      borderRadius: "var(--radius-md)", padding: "10px 12px", minWidth: 0,
      overflowWrap: "break-word", ...style,
    }} {...rest}>
      <div style={{ fontSize: "11px", color: "var(--text-2)", marginBottom: "6px", wordBreak: "break-word" }}>{contract}</div>
      <div className="num" style={{
        fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums",
        fontSize: "21px", fontWeight: 800, ...edgeStyle,
      }}>{sign}{edge.toFixed(1)}%</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-2)", marginTop: "5px" }}>
        mkt <span style={{ color: "var(--text-1)" }}>{marketPct != null ? Math.round(marketPct) + "%" : "—"}</span>
        {" · "}liq {liquidity ? "$" + Number(liquidity).toLocaleString() : "n/a"}
      </div>
      {hasBet ? (
        <div style={{ marginTop: "6px" }}>
          <KellyBar theoretical={theoretical} capped={capped} allocation={allocation}
            stakePct={stakePct} rawPct={rawPct} />
        </div>
      ) : (
        <div style={{ fontSize: "10px", color: "var(--text-2)", marginTop: "5px" }}>no positive edge</div>
      )}
    </div>
  );
}
