const A = window.CategoryAlphaDesignSystem_a835cf || {};
const { Pill: PL, Badge: BA, IngestionHUD: HUD, StatTile: STt, EmptyState: ES } = A;
// Live-frame index. MUST be evaluated per render: the data-loader sets window.MT
// asynchronously, so a module-level constant resolved to 0 and pinned the whole
// terminal to the oldest frame while the transport still displayed LIVE.
function lastFrame() { return (window.MT ? MT.FRAMES : 1) - 1; }

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

function fmtAgo(iso) {
  const t = Date.parse(iso); if (!t) return null;
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 1 ? "just now" : m < 60 ? m + "m ago" : Math.floor(m / 60) + "h" + ("0" + (m % 60)).slice(-2) + "m ago";
}

function Anno({ tone, icon, title, desc }) {
  const c = { pos: "var(--pos)", warn: "var(--warn)", info: "var(--accent-bright)", neu: "var(--text-2)" }[tone];
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 0", borderBottom: "1px solid var(--border-dim)" }}>
      <div style={{ width: 20, height: 20, flex: "none", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>{icon}</div>
      <div><div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>{title}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", marginTop: 1, lineHeight: 1.4 }}>{desc}</div></div>
    </div>
  );
}

// Cinematic terminal empty state — honest awaiting-telemetry, per the design spec.
function AwaitingTelemetry({ feeds, generatedAt, note }) {
  const line = "──────────────────────────────────────────────";
  return (
    <section style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-cmd)", marginBottom: 16, background: "var(--slate-950)" }}>
      <div style={{ padding: "40px 28px", fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 12.5, lineHeight: 1.85 }}>
        <div style={{ color: "var(--border-strong)" }}>{line}</div>
        <div style={{ color: "var(--accent)", fontWeight: 700, letterSpacing: 2, fontSize: 14, margin: "6px 0" }}>[ SYSTEM AWAITING TELEMETRY ]</div>
        <div>No active tropical cyclones in the ingestion feed.</div>
        <div style={{ marginTop: 14, color: "var(--text-2)" }}>Feed status:</div>
        {feeds.map((f) => (
          <div key={f.name} style={{ paddingLeft: 12 }}>
            <span style={{ color: f.ok ? "var(--pos)" : f.status === "FAIL" ? "var(--neg)" : "var(--warn)" }}>{f.ok ? "●" : "○"}</span>{" "}
            {f.name} — <span style={{ color: "var(--text-1)" }}>{f.detail}</span>
          </div>
        ))}
        <div style={{ marginTop: 14 }}>Pipeline Status: <span style={{ color: "var(--pos)" }}>INGESTION READY</span></div>
        <div>Last refresh: <span style={{ color: "var(--text-1)" }}>{generatedAt ? (fmtAgo(generatedAt) + " (" + generatedAt.replace("T", " ").replace(/\..*/, "Z") + ")") : "awaiting first scheduled refresh"}</span></div>
        {note && <div style={{ marginTop: 10, color: "var(--text-2)", maxWidth: 640 }}>{note}</div>}
        <div style={{ color: "var(--border-strong)", marginTop: 6 }}>{line}</div>
      </div>
    </section>
  );
}

function LayerToggles({ layers, setLayers, storm }) {
  const [showOff, setShowOff] = React.useState(false);
  const S = storm ? MT.storms[storm] : null;
  const all = window.MT_LAYERS.map((o) => Object.assign({}, o, {
    prov: window.MT_layerProv ? window.MT_layerProv(o, S) : o.prov }));
  const live = all.filter((o) => o.prov !== "nofeed");
  const off = all.filter((o) => o.prov === "nofeed");
  const chip = (extra) => Object.assign({
    display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono)",
    fontSize: 10.5, fontWeight: 700, letterSpacing: ".3px", padding: "4px 9px", borderRadius: 6,
    backdropFilter: "blur(4px)", cursor: "pointer",
  }, extra);
  return (
    <div style={{ position: "absolute", left: 12, bottom: 26, zIndex: 500, display: "flex", gap: 5, flexWrap: "wrap", maxWidth: "72%" }}>
      {live.map((o) => {
        const on = !!layers[o.id];
        return <span key={o.id} title="LIVE — real feed"
          onClick={() => setLayers((st) => ({ ...st, [o.id]: !st[o.id] }))}
          style={chip({
            border: "1px solid " + (on ? "var(--cyan-400)" : "var(--graphite-700)"),
            background: on ? "color-mix(in srgb,var(--cyan-400) 15%,transparent)" : "rgba(7,12,22,.8)",
            color: on ? "#eaf2ff" : "#8ea3bd",
          })}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--pos)", flex: "none" }} />
          {o.label}
        </span>;
      })}
      {off.length > 0 && (
        <span onClick={() => setShowOff(!showOff)}
          title={"Not published for this storm / not wired: " + off.map((o) => o.label).join(", ")}
          style={chip({ border: "1px dashed var(--graphite-700)", background: "rgba(7,12,22,.8)", color: "#5b6b82" })}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--neg)", flex: "none" }} />
          {showOff ? off.map((o) => o.label).join(" · ") : off.length + " unavailable"}
        </span>
      )}
    </div>
  );
}

// Age between frames must come from the REAL committed timestamps. Multiplying by the
// configured STEP_MIN (15) understated it badly: GitHub Actions throttles the schedule,
// so snapshots actually land ~90-100 min apart and a 4-frame scrub is hours, not an hour.
function frameGapMin(a, b) {
  const fr = (MT._frames || []);
  const ta = fr[a] && Date.parse(fr[a].tsZ), tb = fr[b] && Date.parse(fr[b].tsZ);
  if (!ta || !tb) return Math.abs(b - a) * (MT.STEP_MIN || 15);
  return Math.round(Math.abs(tb - ta) / 60000);
}
function humanMin(m) {
  if (m == null) return "—";
  return m < 60 ? m + "m" : Math.floor(m / 60) + "h" + ("0" + (m % 60)).slice(-2) + "m";
}

function Transport({ frame, setFrame, playing, setPlaying, speed, setSpeed }) {
  const NF = lastFrame();
  const isLive = frame >= NF;
  const ageMin = frameGapMin(frame, NF);
  const human = humanMin(ageMin);
  const [stepFlash, setStepFlash] = React.useState(null);
  const flashRef = React.useRef();
  const flash = (txt) => { setStepFlash(txt); clearTimeout(flashRef.current); flashRef.current = setTimeout(() => setStepFlash(null), 900); };
  const mode = isLive ? (playing ? "LIVE" : "HOLD") : (playing ? "REPLAY" : "PAUSED");
  const modeGreen = mode === "LIVE" || mode === "HOLD";
  const modeColor = modeGreen ? "var(--pos)" : "var(--warn)";
  const stepBack = frame > 0 ? frameGapMin(frame - 1, frame) : null;
  const stepFwd = frame < NF ? frameGapMin(frame, frame + 1) : null;
  const btn = { cursor: "pointer", flex: "none", border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", color: "var(--text-2)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", borderRadius: 6 };
  const single = NF <= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--surface-card)", borderTop: "1px solid var(--border-dim)" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div title={"Step back " + humanMin(stepBack) + " (←)"} onClick={() => { setPlaying(false); setFrame(Math.max(0, frame - 1)); flash("STEP −" + humanMin(stepBack)); }} style={{ ...btn, width: 30, height: 30, fontSize: 11, opacity: single ? 0.4 : 1 }}>◀◀</div>
        <div title="Play/pause (space)" onClick={() => setPlaying(!playing)} style={{ ...btn, width: 36, height: 36, fontSize: 13, background: "var(--surface-solid)", color: "var(--text-inverse)", borderColor: "var(--surface-solid)", opacity: single ? 0.4 : 1 }}>{playing ? "❚❚" : "▶"}</div>
        <div title={"Step forward " + humanMin(stepFwd) + " (→)"} onClick={() => { setPlaying(false); setFrame(Math.min(NF, frame + 1)); flash("STEP +" + humanMin(stepFwd)); }} style={{ ...btn, width: 30, height: 30, fontSize: 11, opacity: single ? 0.4 : 1 }}>▶▶|</div>
        <div title="Jump to live" onClick={() => { setPlaying(true); setFrame(NF); }} style={{ ...btn, padding: "0 10px", height: 30, fontSize: 10, fontWeight: 700, color: isLive ? "var(--pos)" : "var(--text-2)", borderColor: isLive ? "var(--pos)" : "var(--border-strong)" }}>▶▶ Live</div>
      </div>
      <div style={{ flex: 1, position: "relative", height: 30, display: "flex", alignItems: "center", minWidth: 0 }}>
        <div style={{ position: "relative", width: "100%", height: 5, borderRadius: 3, background: "var(--border-dim)" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (NF ? frame / NF * 100 : 100) + "%", background: "linear-gradient(90deg,var(--cyan-500),var(--cyan-400))", borderRadius: 3 }} />
          {MT.events.map((e) => (
            <span key={e.frame + e.label} title={e.label} onClick={() => { setPlaying(false); setFrame(e.frame); }} style={{ position: "absolute", top: -4, left: (NF ? e.frame / NF * 100 : 100) + "%", width: 2, height: 13, background: e.hot ? "var(--warn)" : "var(--accent)", transform: "translateX(-1px)", cursor: "pointer" }} />
          ))}
        </div>
        <input type="range" min={0} max={Math.max(0, NF)} value={frame} onChange={(e) => { setPlaying(false); setFrame(+e.target.value); }} style={{ position: "absolute", inset: 0, width: "100%", height: 30, margin: 0, opacity: 0, cursor: "pointer" }} />
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, letterSpacing: 1, padding: "3px 9px", borderRadius: 999, color: modeColor, border: "1px solid " + ("color-mix(in srgb," + modeColor + " 35%,transparent)") }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: modeColor, animation: mode === "LIVE" ? "ca-pulse 1.8s infinite" : "none" }} />
        {mode}{isLive ? "" : " −" + human}
      </span>
      {stepFlash && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, letterSpacing: .5, color: "var(--accent)", padding: "3px 8px", borderRadius: 6, border: "1px solid color-mix(in srgb,var(--accent) 35%,transparent)" }}>{stepFlash}</span>}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text-1)", minWidth: 64, textAlign: "right" }}>{MTX.frameTime(frame)}</div>
      <div title="Speed" onClick={() => setSpeed(speed >= 4 ? 1 : speed * 2)} style={{ ...btn, padding: "5px 9px", height: 26, fontSize: 10, fontWeight: 700 }}>{speed}×</div>
    </div>
  );
}

function MillibarTerminalApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const NF = lastFrame();
  const stormIds = Object.keys(MT.storms);
  const [frame, setFrame] = React.useState(NF);
  const [playing, setPlaying] = React.useState(false); // boot LIVE — never auto-scrub on load
  const [speed, setSpeed] = React.useState(2);
  const [storm, setStorm] = React.useState(stormIds[0] || null);
  const [sel, setSel] = React.useState({ contract: (MT.contracts[0] && MT.contracts[0].id) || null, evidence: null });
  const [bankroll, setBankroll] = React.useState(10000);
  const [stake, setStake] = React.useState(0.25);
  const [layers, setLayers] = React.useState({ satellite: true, track: true, forecast: true, cone: true, recon: false, ascat: false, models: false, particles: false });
  const [vw, setVw] = React.useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  const narrow = vw < 900;
  const [imagery, setImagery] = React.useState(null);
  React.useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  /* Very wide viewports (4K panels, or a zoomed-out browser) were rendering the whole
     terminal as a narrow ~1680px band of 9px type marooned in gutters. Scale the shell
     with the viewport so the layout keeps its proportions and the type stays legible,
     then let the container use more of the width it has. */
  const zoom = vw >= 3300 ? 1.65 : vw >= 2700 ? 1.4 : vw >= 2200 ? 1.2 : vw >= 1900 ? 1.08 : 1;
  const cw = vw / zoom;                    // effective layout width after scaling
  const wide = cw >= 1280;                 // room for a third column
  const gap = wide ? 18 : 14;
  const shell = { width: "100%", maxWidth: 2000, margin: "0 auto", boxSizing: "border-box",
    padding: wide ? "22px 26px 56px" : "16px 16px 48px" };
  const cmdH = wide ? 420 : 340;           // command block height; register matches it
  /* Newer snapshot available. At live with playback stopped we take it immediately
     (a reload is the honest way to rebuild MT — nothing is patched in place); if the
     operator is scrubbing history we surface a chip and let them choose. */
  const [newer, setNewer] = React.useState(null);
  React.useEffect(() => {
    const onNewer = (e) => setNewer((e.detail && e.detail.generatedAt) || null);
    window.addEventListener("mt-data-newer", onNewer);
    return () => window.removeEventListener("mt-data-newer", onNewer);
  }, []);
  const atLive = frame >= NF;
  React.useEffect(() => {
    if (newer && atLive && !playing && !sel.evidence) location.reload();
  }, [newer, atLive, playing, sel.evidence]);

  const dense = t.density === "compact";
  const tactical = t.theme !== "light";
  const panelGrid = narrow ? "1fr" : "1.5fr 1fr 1fr";

  React.useEffect(() => {
    if (!playing || NF <= 0) return;
    const iv = setInterval(() => setFrame((f) => {
      if (f >= NF) { setPlaying(false); return NF; }  // halt at live; wrapping to t-6h silently staled the rail
      return f + 1;
    }), Math.round(700 / speed));
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
      else if (/^[1-9]$/.test(e.key)) { const id = stormIds[+e.key - 1]; if (id) setStorm(id); }
      else if (e.key === "Escape") setSel((s) => ({ ...s, evidence: null }));
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ---- honest ingestion HUD (real feed status) ----
  const F = MT._feeds || {};
  const hud = (name, f, extra) => Object.assign({ name, status: f && f.ok ? "ok" : (f && f.status ? "stale" : "missing"), source: (f && f.source) || name, timestamp: MTX.frameTime(frame), latency: f && f.latencyMs != null ? Math.round(f.latencyMs) + "ms" : "live", penalty: f && f.ok ? null : "feed unavailable", tier: f && f.ok ? "HIGH" : "LOW", buffer: (f && f.note) || "" }, extra);
  const feeds = [
    hud("ATCF", F.nhc, { source: (F.nhc && F.nhc.source) || "NHC ATCF", buffer: (F.nhc && F.nhc.count != null) ? F.nhc.count + " active" : (F.nhc && F.nhc.note) || "" }),
    hud("MKT", F.markets, { source: (F.markets && F.markets.source) || "market", latency: "live", buffer: (F.markets && F.markets.count != null) ? F.markets.count + " mkts" : "" }),
    hud("SAT", F.satellite, { status: "ok", latency: "daily", penalty: null, tier: "MEDIUM", buffer: "client-probed" }),
  ];

  // ---- empty / awaiting-telemetry state (honest current condition) ----
  const healthLines = [
    { name: "NHC advisories", ok: !!(F.nhc && F.nhc.ok), status: F.nhc && !F.nhc.ok && F.nhc.status ? "FAIL" : "EMPTY", detail: (F.nhc && F.nhc.note) || "—" },
    { name: "Prediction markets", ok: !!(F.markets && F.markets.ok), status: F.markets && !F.markets.ok && F.markets.status ? "FAIL" : "EMPTY", detail: (F.markets && F.markets.note) || "—" },
    { name: "GIBS imagery", ok: !!(F.satellite && F.satellite.ok), status: "EMPTY", detail: (F.satellite && F.satellite.source) || "NASA GIBS" },
  ];

  /* Satellite freshness, normalised for the attention queue. GOES carries a real
     10-minute slot timestamp; the VIIRS fallback is a daily composite, so its age
     is reported as a fallback condition rather than a misleading minute count. */
  const imageryState = React.useMemo(() => {
    const f = imagery && imagery.fresh;
    if (!f) return null;
    if (f.product === "GOES GeoColor") {
      const t = Date.parse(f.at);
      return { product: f.product, ageMin: t ? Math.round((Date.now() - t) / 60000) : null };
    }
    return { product: f.product + " (GOES slot unavailable)", ageMin: 999 };
  }, [imagery]);

  const sitVerdict = (MTX.situation ? MTX.situation(360).verdict : null);
  // Real staleness of the snapshot itself — the dot was green regardless of age.
  const staleMin = MT._generatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(MT._generatedAt)) / 60000)) : null;
  const VTONE = { "TRADE-RELEVANT": "var(--edge-glow)", MATERIAL: "var(--warn)", COSMETIC: "var(--text-2)", "NO CHANGE": "var(--text-2)" };
  const shellHeader = (
    <header style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", gap: 12, padding: "9px 20px", background: "var(--surface-card)", borderBottom: "1px solid var(--border-dim)", flexWrap: "wrap" }}>
      <img src={tactical ? "assets/logo-dark.svg" : "assets/logo.svg"} alt="Millibar Terminal" style={{ height: 34 }} onError={(e) => { e.target.style.display = "none"; }} />
      <PL>Category Alpha</PL>
      <HUD streams={feeds} />
      {/* Active systems live in the top bar — switching storms shouldn't require
          hunting inside the map overlay. */}
      {stormIds.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4, borderLeft: "1px solid var(--border-dim)", marginLeft: 2, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", letterSpacing: ".6px" }}>ACTIVE</span>
          {Object.values(MT.storms).map((s2) => (
            <PL key={s2.id} mono={false} size="sm" active={s2.id === storm} dotColor={s2.color} onClick={() => setStorm(s2.id)}>
              {s2.name} <span style={{ opacity: .6, fontSize: 10 }}>{(s2.full_cls.match(/Cat \d/) || [s2.cls])[0].replace("Cat ", "C")}</span>
            </PL>
          ))}
        </div>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
        {sitVerdict && (
          <span title="Highest-severity change in the last 6h" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .6,
            color: VTONE[sitVerdict] || "var(--text-2)", border: "1px solid " + (VTONE[sitVerdict] || "var(--border-dim)"),
            borderRadius: 5, padding: "2px 7px" }}>{sitVerdict}</span>
        )}
        <span title={MT._generatedAt || ""} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: staleMin == null ? "var(--warn)" : staleMin <= 25 ? "var(--pos)" : staleMin <= 75 ? "var(--warn)" : "var(--neg)" }} />
          {MT._generatedAt ? "updated " + (fmtAgo(MT._generatedAt) || "—") : "awaiting refresh"}
        </span>
        {newer && (
          <span onClick={() => location.reload()} title={"Newer snapshot committed at " + newer}
            style={{ cursor: "pointer", fontSize: 10.5, fontWeight: 800, letterSpacing: .5, color: "var(--edge-glow)",
              border: "1px solid var(--edge-glow)", borderRadius: 5, padding: "2px 7px" }}>
            NEW DATA — LOAD
          </span>
        )}
        {imagery && imagery.fresh && (
          <>
            <span style={{ opacity: .4 }}>·</span>
            <span title={imagery.attribution || ""} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: imagery.fresh.product === "GOES GeoColor" ? "var(--pos)" : "var(--warn)" }} />
              {imagery.fresh.product === "GOES GeoColor" ? "sat " + String(imagery.fresh.at).slice(11, 16) + "Z" : "sat " + imagery.fresh.at}
            </span>
          </>
        )}
        <span style={{ opacity: .4 }}>·</span><span>as-of <b style={{ color: "var(--accent)" }}>{MTX.frameTime(frame)}</b></span>
      </div>
    </header>
  );

  if (!storm || !MT.storms[storm]) {
    return (
      <div data-surface={tactical ? "tactical" : undefined} style={{ minHeight: "100vh", background: "var(--surface-app)", color: "var(--text-1)", fontFamily: "var(--font-sans)", zoom: zoom }}>
        {shellHeader}
        <main style={shell}>
          <AwaitingTelemetry feeds={healthLines} generatedAt={MT._generatedAt} note={MT._note} />
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: gap, alignItems: "start" }}>
            <window.MT_Observability narrow={narrow} />
            <div style={{ height: 210 }}><window.MT_Console stormId={null} frame={frame} /></div>
          </div>
        </main>
        <TweaksPanel>
          <TweakSection label="Display" />
          <TweakRadio label="Theme" value={t.theme} options={["tactical", "light"]} onChange={(v) => setTweak("theme", v)} />
          <TweakRadio label="Density" value={t.density} options={["compact", "comfortable"]} onChange={(v) => setTweak("density", v)} />
        </TweaksPanel>
      </div>
    );
  }

  const S = MT.storms[storm], P0 = PAI[S.phase] || PAI.WATCH, snap = MTX.snap(storm, frame);
  const pickContract = (id) => { const c = MT.contracts.find((x) => x.id === id); setSel((s) => ({ ...s, contract: id })); if (c && c.storm && MT.storms[c.storm]) setStorm(c.storm); };

  return (
    <div data-surface={tactical ? "tactical" : undefined} style={{ minHeight: "100vh", background: "var(--surface-app)", color: "var(--text-1)", fontFamily: "var(--font-sans)", zoom: zoom }}>
      {shellHeader}

      <main style={shell}>
        {/* The screen answers five questions, in order:
              1 what changed  ·  2 why believe it  ·  3 does it touch the board
              4 what deserves investigation  ·  5 where can I verify it
            Everything below Attention is supporting material and collapses. */}

        {/* 1 + 2 — what changed, and whether to trust it */}
        <window.MT_Situation dense={dense} />

        {/* 4 + 3 — what needs you, and what it touches. This is the hero row now;
            the map moved below it, because the product stopped being the data and
            became the interpretation of the data. */}
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1.5fr 1fr", gap: gap, alignItems: "start", marginBottom: gap }}>
          <window.MT_Attention dense={dense} imagery={imageryState}
            onSeek={(tsZ) => { const i = (MT._frames || []).findIndex((fr) => fr.tsZ === tsZ); if (i >= 0) { setPlaying(false); setFrame(i); } }}
            onSelectContract={pickContract} />
          <window.MT_Exposure frame={frame} dense={dense} selection={sel} onSelect={pickContract} />
        </div>

        {/* 5a — spatial context. Supporting, not the headline. */}
        <window.MT_Section label="Spatial context" tier="track · cone · satellite · replay" defaultOpen
          summary={S.name + " " + S.cls + " · " + Math.round(snap.wind) + " kt"}>
        <section style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-cmd)", marginBottom: gap }}>
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1fr) " + (wide ? 360 : 320) + "px" }}>
            <div style={{ position: "relative", minHeight: narrow ? 300 : cmdH, background: "var(--slate-950)" }}>
              <window.MT_Map stormId={storm} frame={frame} layers={layers} onSelect={setStorm} onImagery={setImagery} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 500, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", background: "linear-gradient(180deg,rgba(4,6,12,.9),rgba(4,6,12,.4) 70%,transparent)", pointerEvents: "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: "var(--blue-300)", textTransform: "uppercase" }}>Storm Command Center</span>
              </div>
              <LayerToggles layers={layers} setLayers={setLayers} storm={storm} />
            </div>
            {/* rail */}
            <aside style={{ background: "var(--surface-card)", borderLeft: narrow ? "none" : "1px solid var(--border-dim)", borderTop: narrow ? "1px solid var(--border-dim)" : "none", display: "flex", flexDirection: "column", maxHeight: narrow ? "none" : cmdH, overflow: "hidden" }}>
              <div style={{ padding: "11px 15px 8px", borderBottom: "1px solid var(--border-dim)" }}>
                <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05, display: "flex", alignItems: "center", gap: 9 }}>{S.name}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6, color: S.color, background: `color-mix(in srgb,${S.color} 15%,transparent)` }}>{S.full_cls}</span></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", marginTop: 5 }}>{S.center[0].toFixed(1)}°{S.center[0] >= 0 ? "N" : "S"} {Math.abs(S.center[1]).toFixed(1)}°{S.center[1] >= 0 ? "E" : "W"}{S.advNum ? " · Adv #" + S.advNum : ""}</div>
                {frame < NF && (
                  <div onClick={() => { setPlaying(false); setFrame(NF); }} title="Return to live"
                    style={{ marginTop: 7, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)",
                      fontSize: 10.5, fontWeight: 800, letterSpacing: ".5px", color: "var(--warn)", border: "1px solid var(--warn)",
                      borderRadius: 5, padding: "3px 8px" }}>
                    ⏱ HISTORICAL — {MTX.frameTime(frame)} · −{humanMin(frameGapMin(frame, NF))} · click for live
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border-dim)", borderBottom: "1px solid var(--border-dim)" }}>
                <STt variant="metric" label="WIND" value={snap.wind} unit="kt" sub="NHC" />
                <STt variant="metric" label="PRESSURE" value={snap.pressure} unit="mb" sub="NHC" />
                <STt variant="metric" label="CATEGORY" value={(S.full_cls.match(/Cat \d/) || [S.cls])[0].replace("Cat ", "C")} sub={S.advNum ? "adv #" + S.advNum : "NHC"} />
                <STt variant="metric" label="MOVING" value={String(S.movement).split(" ")[0] || "—"} unit={String(S.movement).split(" ")[1] || ""} sub="NHC" />
              </div>
              <div style={{ padding: "10px 15px 12px", flex: 1, overflowY: "auto", minHeight: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: "var(--accent)", textTransform: "uppercase", marginBottom: 6 }}>Lifecycle</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: P0.c, flex: "none" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)" }}>{P0.t}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>PAI</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", lineHeight: 1.5 }}>{P0.d}</div>
                {snap.reconAge != null && snap.reconAge >= 30 && (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--warn)", marginTop: 6 }}>▼ Recon stale {Math.round(snap.reconAge)}m — confidence −0.5</div>
                )}
                <div style={{ marginTop: 9, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", opacity: .75, lineHeight: 1.45 }}>
                  Interpretation, not observation. Research-only — no execution, no advice.
                </div>
              </div>
            </aside>
          </div>
          <Transport frame={frame} setFrame={setFrame} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
        </section>
        </window.MT_Section>

        {/* 5b — fair value and the posterior stack behind every edge on screen */}
        <window.MT_Section label="Fair value" tier="term structure · posterior stack" defaultOpen summary="collapsed">
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1.5fr 1fr", gap: gap, alignItems: "start" }}>
            <window.MT_YieldCurve dense={dense} />
            <window.MT_Observability narrow={narrow} />
          </div>
        </window.MT_Section>

        {/* 5c — the audit trail: every input, and the full unfiltered register */}
        <window.MT_Section label="Verify" tier="inputs · confidence · full register"
          summary={MT.evidence.length + " inputs · tier " + MTX.snap(storm, frame).tier}>
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : wide ? "1.2fr 1fr 1.1fr" : "1.5fr 1fr", gap: gap, alignItems: "start" }}>
            <window.MT_Evidence stormId={storm} frame={frame} selection={sel} onSelect={(id) => setSel((s) => ({ ...s, evidence: id }))} dense={dense} />
            <window.MT_Confidence stormId={storm} frame={frame} />
            <window.MT_Signals stormId={storm} dense={dense} maxH={520} onSeek={(tsZ) => {
              const i = (MT._frames || []).findIndex((fr) => fr.tsZ === tsZ);
              if (i >= 0) { setPlaying(false); setFrame(i); }
            }} />
          </div>
        </window.MT_Section>

        {/* 5d — the full board, on demand */}
        <window.MT_Section label="Raw data" tier="full market board · depth · sizing"
          summary={MT.contracts.length + " contracts · " + (MT._feeds && MT._feeds.markets ? MT._feeds.markets.source : "—")}>
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1.5fr 1fr", gap: gap, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: gap, minWidth: 0 }}>
              <window.MT_Markets frame={frame} selection={sel} onSelect={pickContract} dense={dense} />
              <window.MT_EdgeMatrix frame={frame} bankroll={bankroll} stake={stake} setBankroll={setBankroll} setStake={setStake} selection={sel} onSelect={pickContract} dense={dense} />
            </div>
            <window.MT_OrderBook contractId={sel.contract} frame={frame} dense={dense} />
          </div>
        </window.MT_Section>

        <div style={{ marginTop: gap, height: wide ? 240 : 210 }}>
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
  // Order-independent boot: wait for the plain-script globals (live data, compute
  // engine, DS bundle) before first render. The async data-loader sets window.MT
  // when the fetch resolves, so poll until everything is present.
  if (window.MT && window.MTX && window.CategoryAlphaDesignSystem_a835cf && window.MT_Evidence) {
    ReactDOM.createRoot(document.getElementById("root")).render(<MillibarTerminalApp />);
  } else {
    setTimeout(mount, 30);
  }
})();
