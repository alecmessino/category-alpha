const CA = window.CategoryAlphaDesignSystem_a835cf;
const { Panel, SectionHeader, ProvenanceFooter, StatTile, Gauge, Button, Badge,
        EdgeCell, SignalCard, HealthRow } = CA;
const D = window.MILLIBAR_DATA;

function MapModePanel() {
  const modes = ["observation", "forecast", "market", "physics", "alpha"];
  const labels = { observation: "Observation", forecast: "Forecast", market: "Market", physics: "Physics", alpha: "Category Alpha" };
  const [mode, setMode] = React.useState("observation");
  const m = D.modes[mode];
  return (
    <Panel pad={false} title="Strike Zone — Live NHC Systems &amp; Projected Tracks"
      footer={<ProvenanceFooter source="NHC (MIATCDATx)" latency="3m" version="1.2.4" tier="A" />}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)", display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--text-2)" }}>Map Mode</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0" }}>
          {modes.map((k, i) => (
            <Button key={k} variant="segment" active={mode === k} onClick={() => setMode(k)}
              style={{ borderRadius: i === 0 ? "6px 0 0 6px" : i === modes.length - 1 ? "0 6px 6px 0" : 0, marginLeft: i ? "-1px" : 0 }}>
              {labels[k]}
            </Button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", padding: "10px 16px" }}>
        <Badge tone={m.tone}>{m.status}</Badge>
        <span style={{ fontSize: "11.5px", color: "var(--text-2)", lineHeight: 1.4 }}><b style={{ color: "var(--text-1)" }}>{labels[mode]}</b> — {m.text}</span>
      </div>
      <div style={{ height: "220px", margin: "0 16px 16px", borderRadius: "8px", border: "1px solid var(--border-dim)", background: "repeating-linear-gradient(0deg,#eef2f7,#eef2f7 1px,#f4f5f8 1px,#f4f5f8 28px),repeating-linear-gradient(90deg,#eef2f7,#eef2f7 1px,#f4f5f8 1px,#f4f5f8 28px)", position: "relative", overflow: "hidden" }}>
        <svg viewBox="0 0 600 220" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {D.storms.map((s, i) => {
            const x = 120 + i * 150, y = 150 - i * 30;
            return <g key={s.id}>
              <polyline points={`${x},${y} ${x + 40},${y - 40} ${x + 80},${y - 75}`} fill="none" stroke="var(--cyan-500)" strokeWidth="2" opacity="0.8" />
              <circle cx={x} cy={y} r="7" fill="none" stroke={s.color} strokeWidth="2" />
              <circle cx={x} cy={y} r="2.5" fill={s.color} />
              <text x={x} y={y + 22} fill="var(--text-2)" fontSize="10" fontFamily="var(--font-mono)" textAnchor="middle">{s.name}</text>
            </g>;
          })}
        </svg>
        <div style={{ position: "absolute", right: "10px", top: "10px", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-2)" }}>schematic · SEEDED</div>
      </div>
    </Panel>
  );
}

function EdgeMatrix() {
  const [bankroll, setBankroll] = React.useState(10000);
  const [stake, setStake] = React.useState(0.25);
  const rows = D.matrix.map((r) => {
    if (r.theoretical == null || r.edge <= 0) return { ...r, noBet: true };
    const applied = r.theoretical * stake;
    const ideal = bankroll * applied;
    const alloc = r.liquidity ? Math.min(ideal, r.liquidity) : ideal;
    return { ...r, theoretical: applied, capped: alloc / bankroll, allocation: Math.round(alloc), stakePct: Math.round(applied * 100), rawPct: r.rawPct };
  });
  const total = rows.reduce((a, r) => a + (r.allocation || 0), 0);
  return (
    <Panel pad={false} title="Edge Matrix — Alpha Surface"
      right={<Badge tone="live" dot>LIVE</Badge>}
      footer={<ProvenanceFooter source="Category Alpha × Kalshi (seeded)" latency="5m" version="1.2.4" tier="B" />}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--text-2)" }}>Bankroll</span>
        <input type="number" value={bankroll} min={100} step={500} onChange={(e) => setBankroll(+e.target.value || 0)}
          style={{ width: "110px", fontFamily: "var(--font-mono)", fontSize: "13px", padding: "5px 8px", border: "1px solid var(--border-dim)", borderRadius: "6px", background: "var(--surface-card)", color: "var(--text-1)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--text-2)" }}>Stake</span>
        <div style={{ display: "flex", gap: 0 }}>
          {[[1, "FULL"], [0.5, "½"], [0.25, "¼"]].map(([f, l], i) => (
            <Button key={l} variant="preset" mono active={stake === f} onClick={() => setStake(f)}
              style={{ borderRadius: i === 0 ? "6px 0 0 6px" : i === 2 ? "0 6px 6px 0" : 0, marginLeft: i ? "-1px" : 0 }}>{l}</Button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-2)" }}>Total deploy <b style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", fontSize: "13px" }}>${total.toLocaleString()}</b></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "11px", padding: "12px" }}>
        {rows.map((r) => (
          <EdgeCell key={r.contract} contract={r.contract} edge={r.edge} marketPct={r.market} liquidity={r.liquidity}
            theoretical={r.noBet ? undefined : r.theoretical} capped={r.capped} allocation={r.allocation} stakePct={r.stakePct} rawPct={r.rawPct} />
        ))}
      </div>
      <div style={{ margin: "0 12px 12px", padding: "11px 13px", border: "1px solid var(--border-dim)", borderLeft: "3px solid var(--warn)", borderRadius: "10px", fontSize: "12px", color: "var(--text-2)", lineHeight: 1.55 }}>
        Alpha rows show <b style={{ color: "var(--text-1)" }}>Category Alpha</b> (NHC-anchored) edge only. HAFS / ECMWF / DeepMark columns are <b style={{ color: "var(--text-1)" }}>MODEL OFFLINE</b> — the multi-model surface needs HAFS ensemble outputs (unavailable keylessly). Seams are in place; add model feeds to populate.
      </div>
    </Panel>
  );
}

function MillibarKitApp() {
  const [active, setActive] = React.useState(0);
  return (
    <div style={{ background: "var(--surface-app)", minHeight: "100vh", fontFamily: "var(--font-sans)", color: "var(--text-1)" }}>
      <window.MB_Header feeds={D.feeds} />
      <main style={{ maxWidth: "1600px", margin: "0 auto", padding: "24px 22px 60px" }}>
        {/* hero */}
        <div style={{ border: "1px solid var(--border-dim)", borderRadius: "8px", padding: "20px 24px", marginBottom: "18px", background: "var(--surface-card)" }}>
          <h1 style={{ margin: "0 0 4px", fontSize: "22px", fontWeight: 700 }}>Hurricane &amp; Prediction-Market Divergence Terminal</h1>
          <div style={{ color: "var(--text-2)", fontSize: "13px", marginBottom: "14px" }}>Physical-model anchor (live NHC) vs retail prediction-market price — edge → sizing.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ flex: 1, minWidth: "150px" }}><StatTile label="Gulf SST Anomaly" value={"+" + D.gulf_anom_c} unit="°C" color="var(--warn)" sub="warm Gulf → RI fuel" /><div style={{ marginTop: "9px" }}><Gauge value={D.gulf_anom_c * 33} color="var(--warn)" /></div></div>
            <div style={{ flex: 1, minWidth: "150px" }}><StatTile label="Rapid Intensification Threat" value={<Badge tone="warn">{D.risk[0]}</Badge>} sub="warm Gulf → RI fuel" /></div>
            <div style={{ flex: 1, minWidth: "150px" }}><StatTile label="Active NHC Systems" value={D.storms.length} sub="live · keyless" /></div>
            <div style={{ flex: 1, minWidth: "150px" }}><StatTile label="Long Mispricing Signals" value={D.signals.filter(s => s.signal === "BUY").length} color="var(--pos)" sub="edge > +3%" /></div>
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-2)", marginTop: "12px" }}>Live · last refreshed <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>{D.updated}</span> · auto-refresh 5m · <b>SEEDED demo</b></div>
        </div>

        <window.MB_CommandCenter storms={D.storms} activeIdx={active} onSelect={setActive} sst={D.gulf_anom_c} risk={D.risk} />

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: "24px", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div><SectionHeader>Strike Zone</SectionHeader><MapModePanel /></div>
            <div>
              <SectionHeader tone="special">Divergence Signals</SectionHeader>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "13px" }}>
                {D.signals.map((s) => <SignalCard key={s.label} {...s} Badge={Badge} />)}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div><SectionHeader>Edge Matrix</SectionHeader><EdgeMatrix /></div>
            <div>
              <SectionHeader>System Health</SectionHeader>
              <Panel pad={false} footer={<ProvenanceFooter source="verify_stack.py" latency="live" version="1.2.4" tier="A" />}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "12px" }}>
                  {D.health.map((h) => <HealthRow key={h.name} {...h} />)}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<MillibarKitApp />);
