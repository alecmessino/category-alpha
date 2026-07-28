const { Badge: BGd } = window.CategoryAlphaDesignSystem_a835cf || {};

/* Provenance drawer — drill-down from any evidence row to its lineage + envelope
   (source, content hash, timestamp, latency, revision) and the pipeline chain it
   feeds. Slides in from the right. */
function MT_Provenance({ evidenceId, stormId, frame, onClose }) {
  const e = MT.evidence.find((x) => x.id === evidenceId);
  const open = !!e;
  const S = MT.storms[stormId];
  const chain = ["Observation", "Evidence", "Feature", "Confidence", "Decision"];
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(2,5,12,.5)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: "opacity .2s", zIndex: 60 }} />
      <aside style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: 380, maxWidth: "92vw", background: "var(--surface-card)", borderLeft: "1px solid var(--border-strong)", boxShadow: "var(--shadow-cmd)", transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform .25s", zIndex: 61, overflowY: "auto", padding: 18 }}>
        {e && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--accent)" }}>Data Provenance</div>
            <span onClick={onClose} style={{ cursor: "pointer", color: "var(--text-2)", fontSize: 18, lineHeight: 1 }}>×</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginTop: 6 }}>{e.label}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, color: "var(--accent)", margin: "8px 0" }}>{e.read(S, frame)}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <BGd tone={{ A: "pos", B: "warn", C: "neg" }[e.tier]}>TIER {e.tier}</BGd>
            <BGd tone="neutral">{e.kind}</BGd>
          </div>
          {[["source", e.source], ["timestamp", MTX.frameTime(frame) + " (as-of cursor)"], ["latency", e.latency || "—"], ["revision", e.ver], ["content hash", "fnv1a32:" + e.hash], ["weight in confidence", e.weight ? (e.weight * 100).toFixed(0) + "%" : "excluded"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
              <span style={{ color: "var(--text-2)" }}>{k}</span>
              <span style={{ color: "var(--text-1)", fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--text-2)", margin: "16px 0 8px" }}>Pipeline lineage</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {chain.map((c, i) => (
              <div key={c} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0" }}>
                <span style={{ width: 22, height: 22, flex: "none", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, background: i <= 2 ? "color-mix(in srgb,var(--accent) 14%,transparent)" : "var(--surface-sunken)", color: i <= 2 ? "var(--accent)" : "var(--text-2)" }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: i <= 3 ? "var(--text-1)" : "var(--text-2)" }}>{c}</span>
                {c === "Decision" && <BGd tone="special" style={{ marginLeft: "auto" }}>NULL (engine deferred)</BGd>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-dim)", borderLeft: "3px solid var(--accent)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>
            Content-addressed &amp; bitemporal: this fix is an immutable event; a correction is a new row with a higher revision, never an edit.
          </div>
        </>}
      </aside>
    </>
  );
}
window.MT_Provenance = MT_Provenance;
