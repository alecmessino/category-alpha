import React from "react";

/* IngestionHUD — header feed-freshness telemetry (.hud). A monospaced pill of feed
   cells (dot + name + age); clicking opens a diagnostic popover mapping each feed's
   latency to its evidence-quality penalty. Honest colors: fresh=green(ok),
   STALE=amber, MISSING=grey (an un-ingested stream is honest absence, never red). */
const DOT = { ok: "var(--pos)", stale: "var(--warn)", missing: "var(--border-strong)" };
export function IngestionHUD({ streams = [], diagnostics = true, style = {}, ...rest }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }} {...rest}>
      <div onClick={() => diagnostics && setOpen(!open)} style={{
        display: "inline-flex", alignItems: "center", gap: "10px", cursor: diagnostics ? "pointer" : "default",
        fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono-sm)", fontWeight: 600, color: "var(--text-2)",
        background: "var(--surface-sunken)", border: "1px solid var(--border-dim)",
        borderRadius: "var(--radius-pill)", padding: "5px 12px",
      }}>
        {streams.map((s, i) => (
          <React.Fragment key={s.name}>
            {i > 0 && <span style={{ width: "1px", height: "12px", background: "var(--border-dim)" }} />}
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: DOT[s.status] || DOT.missing, flex: "none", animation: s.status === "ok" ? "ca-pulse 2.4s infinite" : "none" }} />
              <b style={{ color: "var(--text-1)", fontWeight: 700, letterSpacing: ".5px" }}>{s.name}</b>
              <span>{s.status === "missing" ? "—" : (s.age || s.status)}</span>
            </span>
          </React.Fragment>
        ))}
      </div>
      {open && diagnostics && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40, minWidth: "300px",
          background: "var(--surface-card)", border: "1px solid var(--border-dim)",
          borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-card)", padding: "11px 13px",
          fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono-sm)",
        }}>
          <div style={{ color: "var(--accent)", letterSpacing: ".5px", marginBottom: "9px", fontWeight: 700 }}>[ INGESTION DIAGNOSTIC AUDIT ]</div>
          {streams.map((s) => {
            const tier = s.tier || (s.status === "ok" ? "HIGH" : s.status === "stale" ? "MEDIUM" : "LOW");
            const tierColor = /HIGH|^A$/.test(tier) ? "var(--pos)" : /LOW|^C$/.test(tier) ? "var(--neg)" : "var(--warn)";
            return (
              <div key={s.name} style={{ padding: "7px 0", borderTop: "1px solid var(--border-dim)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                  <span style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: DOT[s.status] || DOT.missing }} />
                    <b style={{ color: "var(--text-1)", letterSpacing: ".5px" }}>{s.name}</b>
                  </span>
                  <span style={{ color: tierColor }}>TIER {tier}</span>
                </div>
                <div style={{ color: "var(--text-2)", lineHeight: 1.55 }}>
                  <div>src {s.source || s.name}</div>
                  <div>ts {s.timestamp || "—"} · lat <span style={{ color: "var(--text-1)" }}>{s.latency || s.age || (s.status === "missing" ? "—" : s.status)}</span></div>
                  <div>penalty <span style={{ color: s.penalty ? "var(--neg)" : "var(--pos)" }}>{s.penalty || "none"}</span></div>
                  <div>buffer {s.buffer || (s.status === "missing" ? "NO STREAM" : "SYNCED · 0 dropped")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
