const A = window.CategoryAlphaDesignSystem_a835cf || {};
const { Pill: PL, Badge: BA, IngestionHUD: HUD, StatTile: STt } = A;
const NF = (window.MT ? MT.FRAMES : 24) - 1;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "tactical",
  "density": "comfortable"
}/*EDITMODE-END*/;

const PAI = {
  ACCUMULATION: { c: "var(--pai-accumulation)", t: "Accumulation", d: "Pressure trend building — early organization." },
  VELOCITY: { c: "var(--pai-velocity)", t: "Velocity", d: "Pressure falling fast — intensification underway." },
  EXHAUSTION: { c: "var(--pai-exhaustion)", t: "Exhaustion", d: "Deepening decelerating — near peak." },
  WATCH: { c: "var(--pai-watch)", t: "Watch", d: "Insufficient pressure trend — monitoring." },
};

function Anno({ tone, icon, title, desc }) {
  const c = { pos: "var(--pos)", warn: "var(--warn)", info: "var(--accent-bright)", neu: "var(--text-2)" }[tone];
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--border-dim)" }}>
      <div style={{ width: 20, height: 20, flex: "none", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>{icon}</div>
      <div><div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 1, lineHeight: 1.4 }}>{desc}</div></div>
    </div>
  );
}

function LayerToggles({ layers, setLayers }) {
  const PROV = { live: "var(--pos)", seeded: "var(--warn)", nofeed: "var(--neg)" };
  const PROV_TITLE = { live: "LIVE — probed feed", seeded: "SEEDED — illustrative, not a live forecast", nofeed: "NO FEED — requires live backend telemetry; disabled" };
  return (
    <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 500, display: "flex", gap: 5, flexWrap: "wrap", maxWidth: "72%" }}>
      {window.MT_LAYERS.map((o) => {
        const nofeed = o.prov === "nofeed";
        const on = layers[o.id] && !nofeed;
        return <span key={o.id} title={PROV_TITLE[o.prov]} onClick={() => { if (nofeed) return; setLayers((s) => ({ ...s, [o.id]: !s[o.id] })); }} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: ".3px", padding: "4px 9px", borderRadius: 6,
          cursor: nofeed ? "not-allowed" : "pointer",
          border: "1px solid " + (on ? "var(--cyan-400)" : "var(--graphite-700)"),
          background: on ? "color-mix(in srgb,var(--cyan-400) 15%,transparent)" : "rgba(7,12,22,.8)",
          color: nofeed ? "#5b6b82" : on ? "#eaf2ff" : "#8ea3bd", backdropFilter: "blur(4px)",
          opacity: nofeed ? 0.75 : 1, textDecoration: nofeed ? "line-through" : "none",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: PROV[o.prov], flex: "none" }} />
          {o.label}{nofeed && <span style={{ textDecoration: "none", color: "var(--neg)", fontSize: 8.5, letterSpacing: ".5px" }}>NO FEED</span>}
        </span>;
      })}
    </div>
  );
}

function Transport({ frame, setFrame, playing, setPlaying, speed, setSpeed }) {
  const isLive = frame >= NF;
  const ageMin = (NF - frame) * MT.STEP_MIN;
  const human = ageMin < 60 ? ageMin + "m" : Math.floor(ageMin / 60) + "h" + ("0" + (ageMin % 60)).slice(-2) + "m";
  const [stepFlash, setStepFlash] = React.useState(null);
  const flashRef = React.useRef();
  const flash = (txt) => { setStepFlash(txt); clearTimeout(flashRef.current); flashRef.current = setTimeout(() => setStepFlash(null), 900); };
  const mode = isLive ? (playing ? "LIVE" : "HOLD") : (playing ? "REPLAY" : "PAUSED");
  const modeGreen = mode === "LIVE" || mode === "HOLD";
  const modeColor = modeGreen ? "var(--pos)" : "var(--warn)";
  const btn = { cursor: "pointer", flex: "none", border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", borderRadius: 6 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface-card)", borderTop: "1px solid var(--border-dim)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div title="Step back 10m (←)" onClick={() => { setPlaying(false); setFrame(Math.max(0, frame - 1)); flash("STEP −10m"); }} style={{ ...btn, width: 30, height: 30, fontSize: 11 }}>◀◀</div>
        <div title="Play/pause (space)" onClick={() => setPlaying(!playing)} style={{ ...btn, width: 36, height: 36, fontSize: 13, background: "var(--surface-solid)", color: "var(--text-inverse)", borderColor: "var(--surface-solid)" }}>{playing ? "❚❚" : "▶"}</div>
        <div title="Step forward 10m (→)" onClick={() => { setPlaying(false); setFrame(Math.min(NF, frame + 1)); flash("STEP +10m"); }} style={{ ...btn, width: 30, height: 30, fontSize: 11 }}>▶▶|</div>
        <div title="Jump to live" onClick={() => { setPlaying(true); setFrame(NF); }} style={{ ...btn, padding: "0 10px", height: 30, fontSize: 10, fontWeight: 700, color: isLive ? "var(--pos)" : "var(--text-2)", borderColor: isLive ? "var(--pos)" : "var(--border-strong)" }}>▶▶ Live</div>
      </div>
      <div style={{ flex: 1, position: "relative", height: 30, display: "flex", alignItems: "center", minWidth: 0 }}>
        <div style={{ position: "relative", width: "100%", height: 5, borderRadius: 3, background: "var(--border-dim)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (frame / NF * 100) + "%", background: "linear-gradient(90deg,var(--cyan-500),var(--cyan-400))", borderRadius: 3 }} />
          {MT.events.map((e) => (
            <span key={e.frame} title={e.label} onClick={() => { setPlaying(false); setFrame(e.frame); }} style={{ position: "absolute", top: -4, left: (e.frame / NF * 100) + "%", width: 2, height: 13, background: e.hot ? "var(--warn)" : "var(--accent)", transform: "translateX(-1px)", cursor: "pointer" }} />
          ))}
        </div>
        <input type="range" min={0} max={NF} value={frame} onChange={(e) => { setPlaying(false); setFrame(+e.target.value); }} style={{ position: "absolute", inset: 0, width: "100%", height: 30, margin: 0, opacity: 0, cursor: "pointer" }} />
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: 1, padding: "3px 9px", borderRadius: 999, color: modeColor, border: "1px solid " + ("color-mix(in srgb," + modeColor + " 35%,transparent)") }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: modeColor, animation: mode === "LIVE" ? "ca-pulse 1.8s infinite" : "none" }} />
        {mode}{isLive ? "" : " −" + human}
      </span>
      {stepFlash && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: .5, color: "var(--accent)", padding: "3px 8px", borderRadius: 6, border: "1px solid color-mix(in srgb,var(--accent) 35%,transparent)" }}>{stepFlash}</span>}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-1)", minWidth: 64, textAlign: "right" }}>{MTX.frameTime(frame)}</div>
      <div title="Speed" onClick={() => setSpeed(speed >= 4 ? 1 : speed * 2)} style={{ ...btn, padding: "5px 9px", height: 26, fontSize: 10, fontWeight: 700 }}>{speed}×</div>
    </div>
  );
}

function MillibarTerminalApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [frame, setFrame] = React.useState(NF);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(2);
  const [storm, setStorm] = React.useState("AL04");
  const [sel, setSel] = React.useState({ contract: "KXHURCAT4-25", evidence: null });
  const [bankroll, setBankroll] = React.useState(10000);
  const [stake, setStake] = React.useState(0.25);
  const [layers, setLayers] = React.useState({ satellite: true, cone: true, track: true, recon: true, ascat: false, models: false, particles: false });
  const dense = t.density === "compact";
  const tactical = t.theme !== "light";

  React.useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setFrame((f) => (f >= NF ? 0 : f + 1)), Math.round(700 / speed));
    return () => clearInterval(iv);
  }, [playing, speed]);

  const st = React.useRef({}); st.current = { frame, playing, storm };
  React.useEffect(() => {
    function onKey(e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const c = st.current;
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowRight") { setPlaying(false); setFrame(Math.min(NF, c.frame + 1)); }
      else if (e.key === "ArrowLeft") { setPlaying(false); setFrame(Math.max(0, c.frame - 1)); }
      else if (e.key === "]") { setPlaying(false); const n = MT.events.find((x) => x.frame > c.frame); if (n) setFrame(n.frame); }
      else if (e.key === "[") { setPlaying(false); const p = [...MT.events].reverse().find((x) => x.frame < c.frame); if (p) setFrame(p.frame); }
      else if (e.key === "1") setStorm("AL04");
      else if (e.key === "2") setStorm("EP07");
      else if (e.key === "3") setStorm("EP08");
      else if (e.key === "Escape") setSel((s) => ({ ...s, evidence: null }));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const S = MT.storms[storm], P0 = PAI[S.phase], snap = MTX.snap(storm, frame);
  const pickContract = (id) => { const c = MT.contracts.find((x) => x.id === id); setSel((s) => ({ ...s, contract: id })); if (c) setStorm(c.storm); };
  const rAge = snap.reconAge;
  const reconStatus = rAge == null ? "missing" : rAge > 30 ? "stale" : "ok";
  const reconLat = rAge == null ? "—" : rAge >= 60 ? (rAge / 60).toFixed(1) + " hrs" : Math.round(rAge) + "m";
  const reconPenalty = rAge == null ? "−0.50 (no coverage)" : rAge > 30 ? "−0.15 (decay curve)" : null;
  const reconTier = rAge == null ? "LOW" : rAge > 30 ? "MEDIUM" : "HIGH";
  const feeds = [
    { name: "ATCF", status: "ok", age: "2m", source: "NHC ATCF b-deck", timestamp: MTX.frameTime(frame), latency: "2m", penalty: null, tier: "HIGH", buffer: "SYNCED · 0 dropped" },
    { name: "RECON", status: reconStatus, age: rAge == null ? undefined : Math.round(rAge) + "m",
      source: "AF307 Vortex Message", timestamp: "00:31Z", latency: reconLat, penalty: reconPenalty, tier: reconTier,
      buffer: rAge == null ? "NO STREAM" : "SYNCED · 0 dropped" },
    { name: "SST", status: "stale", age: "1d", source: "Open-Meteo / manual", timestamp: "07-22 00:00Z", latency: "1d", penalty: "−0.10 (age decay)", tier: "MEDIUM", buffer: "MANUAL · cached" },
  ];

  return (
    <div data-surface={tactical ? "tactical" : undefined} style={{ minHeight: "100vh", background: "var(--surface-app)", color: "var(--text-1)", fontFamily: "var(--font-sans)" }}>
      {/* header */}
      <header style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", gap: 14, padding: "9px 20px", background: "var(--surface-card)", borderBottom: "1px solid var(--border-dim)" }}>
        <img src={tactical ? "../../assets/logo-dark.svg" : "../../assets/logo.svg"} alt="Millibar Terminal" style={{ height: 40 }} />
        <PL>Category Alpha</PL>
        <HUD streams={feeds} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
          <span>as-of <b style={{ color: "var(--accent)" }}>{MTX.frameTime(frame)}</b></span>
          <span style={{ opacity: .4 }}>·</span><span>space play · ←→ scrub · [ ] events · 1-3 storm</span>
        </div>
      </header>

      <main style={{ maxWidth: 1680, margin: "0 auto", padding: "16px 16px 48px" }}>
        {/* command block */}
        <section style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-cmd)", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px" }}>
            <div style={{ position: "relative", minHeight: 480, background: "var(--slate-950)" }}>
              <window.MT_Map stormId={storm} frame={frame} layers={layers} onSelect={setStorm} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 500, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", background: "linear-gradient(180deg,rgba(4,6,12,.9),rgba(4,6,12,.4) 70%,transparent)", pointerEvents: "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: "var(--blue-300)", textTransform: "uppercase" }}>Storm Command Center</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto", pointerEvents: "auto" }}>
                  {Object.values(MT.storms).map((s) => (
                    <PL key={s.id} mono={false} size="sm" active={s.id === storm} dotColor={s.color} onClick={() => setStorm(s.id)}>{s.name} <span style={{ opacity: .6, fontSize: 10 }}>{s.cls}</span></PL>
                  ))}
                </div>
              </div>
              <LayerToggles layers={layers} setLayers={setLayers} />
            </div>
            {/* rail */}
            <aside style={{ background: "var(--surface-card)", borderLeft: "1px solid var(--border-dim)", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "11px 15px 8px", borderBottom: "1px solid var(--border-dim)" }}>
                <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05, display: "flex", alignItems: "center", gap: 9 }}>{S.name}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, color: S.color, background: `color-mix(in srgb,${S.color} 15%,transparent)` }}>{S.full_cls}</span></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", marginTop: 5 }}>{S.center[0].toFixed(1)}°N {Math.abs(S.center[1]).toFixed(1)}°W · VIIRS/NOAA-20</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border-dim)", borderBottom: "1px solid var(--border-dim)" }}>
                <STt variant="metric" label="WIND" value={snap.wind} unit="kt" sub="NHC" />
                <STt variant="metric" label="PRESSURE" value={snap.pressure} unit="mb" sub={snap.reconAge == null ? "no recon" : "recon"} />
                <STt variant="metric" label="EDGE" value={(snap.edgePct >= 0 ? "+" : "") + snap.edgePct.toFixed(1)} unit="%" sub="model − mkt" />
                <STt variant="metric" label="PHASE" value={P0.t} sub="PAI" />
              </div>
              <div style={{ padding: "12px 15px", flex: 1, overflowY: "auto" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 800, letterSpacing: 1.4, color: "var(--accent)", textTransform: "uppercase", marginBottom: 8 }}>Category Alpha Read</div>
                <Anno tone="info" icon="◉" title={"Lifecycle — " + P0.t} desc={P0.d} />
                {S.basin === "east" && <Anno tone="warn" icon="▲" title="Gulf ocean heat HIGH" desc="SST anomaly +2.4°C — RI-supportive fuel." />}
                {snap.reconAge != null && snap.reconAge < 30 && <Anno tone="pos" icon="✓" title="Recon confirms circulation" desc={"Aircraft min pressure " + snap.pressure + " mb."} />}
                {snap.reconAge != null && snap.reconAge >= 30 && <Anno tone="warn" icon="▼" title="Recon stale" desc={Math.round(snap.reconAge) + "m since last fix — confidence −0.5."} />}
                <Anno tone="neu" icon="➤" title="Tracking" desc={snap.wind + " kt, moving " + S.movement + "."} />
                <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", opacity: .8 }}>Interpretation, not observation. SEEDED demo — no execution, no advice.</div>
              </div>
            </aside>
          </div>
          <Transport frame={frame} setFrame={setFrame} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
        </section>

        {/* panel grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 14, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <window.MT_Evidence stormId={storm} frame={frame} selection={sel} onSelect={(id) => setSel((s) => ({ ...s, evidence: id }))} dense={dense} />
            <window.MT_Markets frame={frame} selection={sel} onSelect={pickContract} dense={dense} />
            <window.MT_EdgeMatrix frame={frame} bankroll={bankroll} stake={stake} setBankroll={setBankroll} setStake={setStake} selection={sel} onSelect={pickContract} dense={dense} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <window.MT_Confidence stormId={storm} frame={frame} />
            <window.MT_Probability stormId={storm} frame={frame} />
            <window.MT_OrderBook contractId={sel.contract} frame={frame} dense={dense} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <window.MT_Ledger frame={frame} onSeek={(f) => { setPlaying(false); setFrame(f); }} dense={dense} />
            <window.MT_Observability />
          </div>
        </div>

        <div style={{ marginTop: 14, height: 300 }}>
          <window.MT_Console stormId={storm} frame={frame} />
        </div>
      </main>

      <window.MT_Provenance evidenceId={sel.evidence} stormId={storm} frame={frame} onClose={() => setSel((s) => ({ ...s, evidence: null }))} />

      <TweaksPanel>
        <TweakSection label="Display" />
        <TweakRadio label="Theme" value={t.theme} options={["tactical", "light"]} onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Density" value={t.density} options={["compact", "comfortable"]} onChange={(v) => setTweak("density", v)} />
      </TweaksPanel>
    </div>
  );
}
(function mount() {
  // Order-independent boot: wait for the plain-script globals (seed data, compute
  // engine, DS bundle) before first render. Direct load has them synchronously;
  // the offline bundle re-injects scripts async, so poll briefly.
  if (window.MT && window.MTX && window.CategoryAlphaDesignSystem_a835cf && window.MT_Evidence) {
    ReactDOM.createRoot(document.getElementById("root")).render(<MillibarTerminalApp />);
  } else {
    setTimeout(mount, 30);
  }
})();
