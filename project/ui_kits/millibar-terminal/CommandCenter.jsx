const { Pill, StatTile, ReplayDeck, Badge } = window.CategoryAlphaDesignSystem_a835cf;

const PAI = {
  ACCUMULATION: { c: "var(--pai-accumulation)", t: "Accumulation", d: "Pressure trend building — early organization." },
  VELOCITY: { c: "var(--pai-velocity)", t: "Velocity", d: "Pressure falling fast — intensification underway." },
  EXHAUSTION: { c: "var(--pai-exhaustion)", t: "Exhaustion", d: "Deepening decelerating — near peak / weakening." },
  WATCH: { c: "var(--pai-watch)", t: "Watch", d: "Insufficient pressure trend — monitoring." },
};
const PRODUCTS = ["GeoColor", "Clean IR", "Water Vapor", "Visible"];
const OVERLAYS = [
  { label: "Eye", live: true }, { label: "Forecast Track", live: true },
  { label: "Uncertainty Cone", live: true }, { label: "Wind Radii", live: false },
  { label: "Recon", live: false }, { label: "Lightning (GLM)", live: false },
];

function Anno({ kind, icon, title, desc }) {
  const tone = { pos: "var(--pos)", warn: "var(--warn)", info: "var(--accent-bright)", neu: "var(--text-2)" }[kind];
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--border-dim)" }}>
      <div style={{ width: "22px", height: "22px", flex: "none", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", marginTop: "1px", color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)` }}>{icon}</div>
      <div>
        <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-1)", lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-2)", marginTop: "2px", lineHeight: 1.4 }}>{desc}</div>
      </div>
    </div>
  );
}

function CommandStage({ storm }) {
  const pc = (PAI[storm.phase] || PAI.WATCH).c;
  const [prod, setProd] = React.useState(0);
  const [ovl, setOvl] = React.useState({ 0: true, 1: true, 2: true });
  return (
    <div style={{ position: "relative", background: "var(--slate-950)", minHeight: "540px", overflow: "hidden" }}>
      {/* abstract dark map field (no fabricated imagery) */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 46% 52%, #0a1424 0%, #060b16 55%, #04060c 100%)" }} />
      {/* overlay vector layer: cone + track + eye reticle */}
      <svg viewBox="0 0 800 540" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {ovl[2] && <polygon points="360,300 560,150 720,60 760,120 640,230 400,320" fill={pc} opacity="0.09" />}
        {ovl[2] && <polygon points="360,300 560,150 720,60 760,120 640,230 400,320" fill="none" stroke={pc} strokeWidth="1.1" opacity="0.8" strokeDasharray="2,6" />}
        {ovl[1] && <>
          <polyline points="360,300 470,220 600,150 720,90" fill="none" stroke="var(--cyan-400)" strokeWidth="5" opacity="0.16" />
          <polyline points="360,300 470,220 600,150 720,90" fill="none" stroke="#e2e8f0" strokeWidth="1.8" opacity="0.92" />
          {[[470, 220], [600, 150], [720, 90]].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.6" fill="#0b1830" stroke="#e2e8f0" strokeWidth="1.4" />)}
        </>}
      </svg>
      {ovl[0] && (
        <div style={{ position: "absolute", left: "45%", top: "55.5%", transform: "translate(-50%,-50%)", width: "34px", height: "34px", color: pc }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid currentColor", opacity: 0.85, animation: "ca-reticle 2.4s ease-out infinite" }} />
          <div style={{ position: "absolute", inset: "9px", borderRadius: "50%", border: "1.5px solid currentColor", opacity: 0.5 }} />
          <div style={{ position: "absolute", left: "50%", top: 0, width: "1px", height: "100%", background: "currentColor", opacity: 0.7, transform: "translateX(-.5px)" }} />
          <div style={{ position: "absolute", top: "50%", left: 0, height: "1px", width: "100%", background: "currentColor", opacity: 0.7, transform: "translateY(-.5px)" }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", transform: "translate(-50%,-50%)", boxShadow: "0 0 7px 1px currentColor" }} />
        </div>
      )}
      {/* vignette */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 120px 20px rgba(2,5,12,.75),inset 0 0 40px rgba(2,5,12,.6)" }} />
      {/* products (top-left) */}
      <div style={{ position: "absolute", top: "52px", left: "14px", display: "flex", gap: "5px", flexWrap: "wrap", maxWidth: "70%" }}>
        {PRODUCTS.map((p, i) => (
          <Pill key={p} size="sm" mono={false} active={prod === i} onClick={() => setProd(i)} style={{ fontSize: "10px" }}>{p}</Pill>
        ))}
      </div>
      {/* overlay toggles (bottom-left, above transport) */}
      <div style={{ position: "absolute", left: "14px", bottom: "74px", display: "flex", gap: "5px", flexWrap: "wrap", maxWidth: "62%" }}>
        {OVERLAYS.map((o, i) => (
          <span key={o.label} onClick={() => o.live && setOvl((s) => ({ ...s, [i]: !s[i] }))} style={{
            fontFamily: "var(--font-mono)", fontSize: "9.5px", fontWeight: 700, letterSpacing: ".4px",
            padding: "4px 9px", borderRadius: "6px", cursor: o.live ? "pointer" : "not-allowed",
            display: "inline-flex", alignItems: "center", gap: "6px",
            textDecoration: o.live ? "none" : "line-through", opacity: o.live ? 1 : 0.42,
            border: "1px solid " + (o.live && ovl[i] ? "var(--cyan-400)" : "var(--graphite-700)"),
            background: o.live && ovl[i] ? "color-mix(in srgb,var(--cyan-400) 15%,transparent)" : "rgba(7,12,22,.72)",
            color: o.live && ovl[i] ? "#eaf2ff" : "#8ea3bd",
          }}>{o.label}</span>
        ))}
      </div>
      {/* transport */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "10px 12px", background: "linear-gradient(0deg,rgba(4,6,12,.94),rgba(4,6,12,.5) 60%,transparent)" }}>
        <ReplayDeck frames={36} stepMin={10} subLabel={(storm.basin === "west" ? "GOES-18" : "GOES-19") + " · " + PRODUCTS[prod]}
          bookmarks={[{ i: 8, label: "RI onset" }, { i: 24, label: "Landfall watch", color: "var(--neg)" }]}
          style={{ background: "transparent", border: "none", padding: "2px 4px" }} />
      </div>
    </div>
  );
}

function MB_CommandCenter({ storms, activeIdx, onSelect, sst, risk }) {
  const storm = storms[activeIdx];
  const P0 = PAI[storm.phase] || PAI.WATCH;
  const annos = [];
  annos.push(<Anno key="l" kind="info" icon="◉" title={"Lifecycle — " + P0.t} desc={P0.d} />);
  if (storm.basin === "east" && sst != null) {
    const hot = (risk[0] === "HIGH" || risk[0] === "EXTREME");
    annos.push(<Anno key="s" kind={hot ? "warn" : "neu"} icon={hot ? "▲" : "≈"} title={"Gulf ocean heat " + risk[0]} desc={"Gulf SST anomaly +" + sst + "°C — " + (hot ? "RI-supportive fuel." : "near climatology.")} />);
  }
  if (storm.recon) annos.push(<Anno key="r" kind="pos" icon="✓" title="Recon confirms circulation" desc={"Aircraft min pressure " + storm.recon.pressure + " mb, sfc " + storm.recon.sfc + " kt."} />);
  annos.push(<Anno key="t" kind="neu" icon="➤" title="Tracking" desc={storm.wind + " kt " + storm.full_cls + ", moving " + storm.movement + "."} />);

  return (
    <section data-surface="tactical" style={{
      margin: "18px 0 26px", borderRadius: "16px", overflow: "hidden",
      background: "var(--slate-925)", border: "1px solid var(--graphite-600)",
      boxShadow: "var(--shadow-cmd)", color: "#e6edf6",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px" }}>
        <div style={{ position: "relative" }}>
          {/* top ribbon */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", flexWrap: "wrap", background: "linear-gradient(180deg,rgba(4,6,12,.92),rgba(4,6,12,.5) 65%,transparent)" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "2.5px", color: "var(--blue-300)", textTransform: "uppercase" }}>Live Storm Command Center</span>
            <Badge tone="live" dot>LIVE</Badge>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginLeft: "auto" }}>
              {storms.map((s, i) => (
                <Pill key={s.id} mono={false} size="sm" active={i === activeIdx} dotColor={s.color} onClick={() => onSelect(i)}>
                  {s.name} <span style={{ opacity: 0.6, fontWeight: 600, fontSize: "10px" }}>{s.cls}</span>
                </Pill>
              ))}
            </div>
          </div>
          <CommandStage storm={storm} />
        </div>
        {/* rail */}
        <aside style={{ background: "linear-gradient(180deg,#070b14,#060911)", borderLeft: "1px solid var(--graphite-800)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ padding: "11px 16px 8px", borderBottom: "1px solid var(--graphite-800)" }}>
            <div style={{ fontSize: "26px", fontWeight: 800, lineHeight: 1.05, color: "#fff", letterSpacing: "-.5px", display: "flex", alignItems: "center", gap: "10px" }}>
              {storm.name}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 800, letterSpacing: "1px", padding: "3px 9px", borderRadius: "6px", color: storm.color, background: `color-mix(in srgb, ${storm.color} 15%, transparent)` }}>{storm.full_cls}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#6f86a6", marginTop: "6px", letterSpacing: ".3px" }}>
              {storm.lat.toFixed(1)}°N  {Math.abs(storm.lon).toFixed(1)}°{storm.lon < 0 ? "W" : "E"}  ·  {storm.basin === "west" ? "GOES-18 West" : "GOES-19 East"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", background: "var(--graphite-800)", borderBottom: "1px solid var(--graphite-800)" }}>
            <StatTile variant="metric" label="WIND" value={storm.wind} unit="kt" sub="NHC advisory" />
            <StatTile variant="metric" label="PRESSURE" value={storm.recon ? storm.recon.pressure : "—"} unit={storm.recon ? "mb" : ""} sub={storm.recon ? "recon (aircraft)" : "no recon"} />
            <StatTile variant="metric" label="MOTION" value={storm.movement} sub="NHC" />
            <StatTile variant="metric" label="LIFECYCLE" value={P0.t} sub="PAI phase" />
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", fontWeight: 800, letterSpacing: "1.4px", color: "var(--blue-300)", textTransform: "uppercase", marginBottom: "10px" }}>Category Alpha Read</div>
            {annos}
          </div>
          <div style={{ margin: "0 16px 16px", padding: "11px 13px", borderRadius: "10px", border: "1px solid var(--graphite-700)", background: "linear-gradient(180deg,rgba(18,34,58,.5),rgba(8,14,26,.5))", fontSize: "11px", color: "#8ea3bd", lineHeight: 1.5 }}>
            <b style={{ color: "#bcd3ee" }}>Interpretation, not observation.</b> Annotations are Category Alpha's read of real signals — never fabricated meteorology. Absent a live feed, an overlay stays <i>disabled</i> rather than invented.
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#4b6183", padding: "0 16px 14px", letterSpacing: ".3px" }}>Imagery NASA GIBS / NOAA GOES ABI · tracks &amp; cone NHC · SEEDED demo</div>
        </aside>
      </div>
    </section>
  );
}
window.MB_CommandCenter = MB_CommandCenter;
