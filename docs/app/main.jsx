const A = window.CategoryAlphaDesignSystem_a835cf || {};
const { Pill: PL, Badge: BA, StatTile: STt, EmptyState: ES } = A;
// Live-frame index. MUST be evaluated per render: the data-loader sets window.MT
// asynchronously, so a module-level constant resolved to 0 and pinned the whole
// terminal to the oldest frame while the transport still displayed LIVE.
function lastFrame() { return (window.MT ? MT.FRAMES : 1) - 1; }

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
/* Genesis watch — areas NHC is watching that are not yet classified cyclones. This lived inside
   the awaiting-telemetry block, which meant it disappeared the moment one of these areas became
   a storm. */
function GenesisWatch({ compact }) {
  const areas = (window.MT && MT._outlook) || [];
  if (!areas.length) return null;
  const tone = (p) => ((p ?? 0) >= 70 ? "var(--neg)" : (p ?? 0) >= 40 ? "var(--warn)" : "var(--text-2)");
  return (
    <div style={{ margin: compact ? "0 0 14px" : "14px 0", padding: "11px 13px", border: "1px solid var(--border-strong)",
      borderLeft: "3px solid var(--warn)", borderRadius: 8, background: "var(--surface-sunken)",
      fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.7, color: "var(--text-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: "var(--warn)", fontWeight: 800, letterSpacing: 1.4, fontSize: 11 }}>GENESIS WATCH — NHC TROPICAL WEATHER OUTLOOK</span>
        <window.MT_Hint id="note.genesis" />
      </div>
      {areas.map((a) => (
        <div key={a.basin + (a.id || a.n)} style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ color: tone(a.pct7d), fontWeight: 800, minWidth: 62 }}>{a.pct7d ?? "?"}% / 7d</span>
          <span style={{ color: "var(--text-2)", minWidth: 62 }}>{a.pct48 ?? "?"}% / 48h</span>
          <span style={{ color: "var(--text-1)" }}>{a.id ? a.id + " · " : ""}{a.title}</span>
          <span style={{ color: "var(--text-2)", opacity: .8 }}>{a.basin}</span>
        </div>
      ))}
    </div>
  );
}

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
        {/* Macro block. A quiet basin is not an absence of information — the reason it is quiet IS the
   read. Every figure is an owned claim computed from a feed or from the HURDAT2 record; the
   mechanism line exists so the numbers are not mistaken for a shear observation we do not have. */}
        {window.MTC && MTC.claim("macro.enso").ok && (
          <div style={{ margin: "14px 0", padding: "11px 13px", border: "1px solid var(--border-strong)",
            borderLeft: "3px solid var(--special)", borderRadius: 8, background: "var(--surface-sunken)" }}>
            <div style={{ color: "var(--special)", fontWeight: 800, letterSpacing: 1.4, fontSize: 11 }}>MACRO ENVIRONMENT</div>
            <div style={{ color: "var(--text-1)", marginTop: 5 }}>{MTC.claim("macro.enso").text}</div>
            <div style={{ marginTop: 6, lineHeight: 1.65 }}>{MTC.claim("macro.suppression").text}</div>
            <div style={{ marginTop: 6, color: "var(--warn)", lineHeight: 1.55 }}>{MTC.claim("macro.mechanism").text}</div>
          </div>
        )}
        <GenesisWatch />
        <div style={{ marginTop: 14 }}>Pipeline Status: <span style={{ color: "var(--pos)" }}>INGESTION READY</span></div>
        <div>Last refresh: <span style={{ color: "var(--text-1)" }}>{generatedAt ? (fmtAgo(generatedAt) + " (" + generatedAt.replace("T", " ").replace(/\..*/, "Z") + ")") : "awaiting first scheduled refresh"}</span></div>
        {note && <div style={{ marginTop: 10, color: "var(--text-2)", maxWidth: 640 }}>{note}</div>}
        <div style={{ color: "var(--border-strong)", marginTop: 6 }}>{line}</div>
      </div>
    </section>
  );
}

/* ---- Ingestion health, in the header ----
   Now that advisory lag is measured rather than asserted, it belongs where it is seen without
   looking for it. Three states only, and the third is the one that matters: a feed that was
   never wired is NOT a red light. */
/* FEED / CYCLE HEALTH, in the header. Every operational source on one rule (docs/app/feed-health.js):
   VALID TIME · FETCHED · AGE · EXPECTED CADENCE · LIVE / DELAYED / STALE / NO FEED. The previous
   version of this read `s.advisoryLagMin` as a number; on the built MT it is a frame accessor, so
   Math.max over functions printed "ADV NaNm" in the header. The model below is built from plain
   values, and scripts/test-feed-health.mjs holds the rows to that. */
function feedHealthModel() {
  const M = window.MT || {};
  const F = M._feeds || {};
  const img = window.__MT_IMAGERY || null;
  const fresh = img && img.fresh ? img.fresh : null;
  return {
    nowMs: Date.now(),
    generatedAt: M._generatedAt || null,
    fetchedAt: M._generatedAt || null,
    marketsOk: !!(F.markets && F.markets.ok),
    outlookOk: !!(F.outlook && F.outlook.ok),
    outlookIssuedZ: null,
    satelliteAt: fresh && fresh.at ? (fresh.product === "VIIRS daily" ? fresh.at + "T00:00:00Z" : fresh.at) : null,
    satelliteDaily: !!(fresh && fresh.product === "VIIRS daily"),
    satelliteProduct: fresh ? fresh.product : null,
    storms: Object.values(M.storms || {}).map((s) => ({
      advisoryIssuedZ: s.advisoryIssuedZ || s.advTimeZ || null,
      guidanceCycleIso: s.guidance ? s.guidance.cycleIso : null,
      shipsCycleIso: s.ships ? s.ships.cycleIso : null,
      reconFixIso: s.recon && s.recon.ok ? s.recon.fixIso : null,
      ascatIso: s.ascat ? s.ascat.iso : null,
    })),
  };
}
const HUD_TONE = { pos: "var(--pos)", warn: "var(--warn)", neg: "var(--neg)", info: "var(--blue-300)", off: "var(--border-strong)" };
function IngestionHUD() {
  const [open, setOpen] = React.useState(false);
  const [, setTick] = React.useState(0);
  /* Ages move; the header must move with them. Re-read every 30 s and when the imagery resolves. */
  React.useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    const onImg = () => setTick((t) => t + 1);
    window.addEventListener("mt-imagery", onImg);
    return () => { clearInterval(iv); window.removeEventListener("mt-imagery", onImg); };
  }, []);
  const FH = window.MTFeedHealth;
  if (!FH) return null;
  const rows = FH.rows(feedHealthModel());
  const pillKeys = ["ADV", "GUID", "RECON", "SAT", "MKT", "SNAP"];
  const pills = rows.filter((r) => pillKeys.includes(r.k));
  const toneOf = (h) => HUD_TONE[FH.TONE[h.status] || "warn"];
  const val = (r) => {
    const h = r.h;
    if (h.status === "OFF" || h.status === "NO FEED") return "—";
    return FH.fmtMin(h.ageMin);
  };

  return (
    <span data-feed-health style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8, flexWrap: "wrap", maxWidth: "100%" }}>
      {pills.map((r) => {
        const off = r.h.status === "OFF";
        const col = toneOf(r.h);
        return (
          <button key={r.k} type="button" title={r.name + " — " + r.h.status + (r.h.reason ? ": " + r.h.reason : "")}
            aria-label={r.name + " " + r.h.status} aria-expanded={open} data-feed-pill={r.k} data-feed-status={r.h.status}
            onClick={() => setOpen(!open)}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", font: "inherit",
              fontSize: 9, fontWeight: 800, letterSpacing: ".4px", padding: "2px 6px", borderRadius: 999,
              color: off ? "var(--text-2)" : col,
              border: "1px solid " + (off ? "var(--border-dim)" : col),
              background: off ? "transparent" : "color-mix(in srgb, " + col + " 12%, transparent)",
              opacity: off ? .55 : 1 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: off ? "var(--border-strong)" : col }} />
            {r.k}<span style={{ opacity: .75 }}>{val(r)}</span>
          </button>
        );
      })}
      {open && (
        <div role="dialog" aria-label="Feed and cycle health" data-feed-health-table onClick={() => setOpen(false)}
          style={{ position: "absolute", top: 22, right: 0, zIndex: 900, width: "min(640px, calc(100vw - 24px))",
          background: "var(--surface-card)", border: "1px solid var(--border-strong)", borderRadius: 10,
          boxShadow: "var(--shadow-cmd)", padding: "11px 13px", fontSize: 11, lineHeight: 1.6, cursor: "default" }}>
          <div style={{ fontWeight: 800, letterSpacing: 1, fontSize: 10, color: "var(--accent)" }}>FEED / CYCLE HEALTH</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 3 }}>
            {MTC.claim("feed.health").text}
          </div>
          <div style={{ overflowX: "auto", marginTop: 7 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 10, whiteSpace: "nowrap" }}>
              <thead><tr>{["SOURCE", "VALID TIME", "FETCHED", "AGE", "CADENCE", "STATUS"].map((h) => (
                <th key={h} scope="col" style={{ textAlign: "left", color: "var(--text-2)", fontWeight: 700, letterSpacing: ".5px", padding: "2px 8px 3px 0", borderBottom: "1px solid var(--border-dim)" }}>{h}</th>
              ))}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.k} data-feed-row={r.k}>
                  <td style={{ padding: "2px 8px 2px 0", color: "var(--text-1)" }}>{r.k} <span style={{ color: "var(--text-2)" }}>{r.name}</span></td>
                  <td style={{ padding: "2px 8px 2px 0", color: "var(--text-2)" }}>{FH.fmtZ(r.h.validZ)}</td>
                  <td style={{ padding: "2px 8px 2px 0", color: "var(--text-2)" }}>{FH.fmtZ(r.h.fetchedAt)}</td>
                  <td style={{ padding: "2px 8px 2px 0", color: "var(--text-1)" }}>{r.h.ageMin == null ? "—" : FH.fmtMin(r.h.ageMin)}</td>
                  <td style={{ padding: "2px 8px 2px 0", color: "var(--text-2)" }}>{r.cadenceMin == null ? (r.h.status === "OFF" ? "—" : "event") : FH.fmtMin(r.cadenceMin)}</td>
                  <td style={{ padding: "2px 0", fontWeight: 800, color: toneOf(r.h) }} title={r.h.reason || ""}>{r.h.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ marginTop: 6, color: "var(--text-2)" }}>{MTC.claim("advisory.latency").text}</div>
          <div style={{ marginTop: 6, color: "var(--text-2)" }}>{MTC.claim("capability.notIngested").text}</div>
          {/* How staleness actually moved the evidence tier, from the same function
              that computes it — not a restatement of it. */}
          {(() => {
            const sid = Object.keys((window.MT && MT.storms) || {})[0];
            if (!sid || !window.MTX) return null;
            const t = MTX.tier(sid, (window.MT ? MT.FRAMES : 1) - 1);
            return (
              <div style={{ marginTop: 8, borderTop: "1px solid var(--border-dim)", paddingTop: 7 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
                  EVIDENCE TIER <b style={{ color: "var(--text-1)" }}>{t.tier}</b> — how each input moved it
                </div>
                {t.reasons.map((r, i) => (
                  <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", paddingLeft: 8 }}>· {r}</div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </span>
  );
}

function LayerToggles({ layers, setLayers, storm, compact }) {
  const [showOff, setShowOff] = React.useState(false);
  /* PHONE: the chips fold into one control. Six chips laid over a 356px-wide map covered most
     of it — apparatus was shrinking the map, which is the one thing it must not do. Below the
     compact width the row is a single LAYERS button and the chips open under it on demand. */
  const [menuOpen, setMenuOpen] = React.useState(false);
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
  const onCount = live.filter((o) => layers[o.id]).length;
  return (
    <div data-layer-toggles style={{ position: "absolute", left: 12, bottom: 26, zIndex: 500, display: "flex", gap: 5, flexWrap: "wrap", maxWidth: compact ? "60%" : "72%", alignItems: "flex-end" }}>
      {compact && (
        <button type="button" aria-expanded={menuOpen} aria-controls="mt-layer-menu" data-layer-menu
          onClick={() => setMenuOpen(!menuOpen)}
          style={chip({ font: "inherit", fontFamily: "var(--font-mono)", border: "1px solid var(--cyan-400)",
            background: "rgba(7,12,22,.85)", color: "#eaf2ff" })}>
          LAYERS <span style={{ opacity: .7 }}>{onCount}/{live.length}</span> {menuOpen ? "▾" : "▸"}
        </button>
      )}
      {(!compact || menuOpen) && live.map((o) => {
        const on = !!layers[o.id];
        /* A real button: keyboard-reachable, and aria-pressed says which layers are on without
           reading the colour. The map's toggles were spans, which a screen reader announced as
           nothing at all. */
        return <button key={o.id} type="button" title="LIVE — real feed" aria-pressed={on} data-layer-toggle={o.id}
          onClick={() => setLayers((st) => ({ ...st, [o.id]: !st[o.id] }))}
          style={chip({
            font: "inherit", fontFamily: "var(--font-mono)",
            border: "1px solid " + (on ? "var(--cyan-400)" : "var(--graphite-700)"),
            background: on ? "color-mix(in srgb,var(--cyan-400) 15%,transparent)" : "rgba(7,12,22,.8)",
            color: on ? "#eaf2ff" : "#8ea3bd",
          })}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--pos)", flex: "none" }} />
          {o.label}
        </button>;
      })}
      {(!compact || menuOpen) && off.length > 0 && (
        <button type="button" onClick={() => setShowOff(!showOff)} aria-expanded={showOff} data-layer-toggle="unavailable"
          title={"Not published for this storm / not wired: " + off.map((o) => o.label).join(", ")}
          style={chip({ font: "inherit", fontFamily: "var(--font-mono)", border: "1px dashed var(--graphite-700)", background: "rgba(7,12,22,.8)", color: "#5b6b82" })}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--neg)", flex: "none" }} />
          {showOff ? off.map((o) => o.label).join(" · ") : off.length + " unavailable"}
        </button>
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

/* Four views, so no single scroll is a wall. The map and the header sit ABOVE this and
   never change with the tab — spatial context and the active-system switcher are
   permanent furniture, and only the analysis below them swaps. */
const TABS = [
  { id: "Situation", hint: "the edge book, then what changed" },
  { id: "Markets",   hint: "the full board, depth and sizing" },
  { id: "Models",    hint: "fair value, posterior stack, analog prior, audit trail" },
];
function TabBar({ tab, setTab }) {
  return (
    <div role="tablist" aria-label="Terminal views"
      style={{ display: "flex", gap: 2, marginBottom: 14, borderBottom: "1px solid var(--border-dim)", overflowX: "auto" }}>
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <button key={t.id} role="tab" aria-selected={on} title={t.hint} onClick={() => setTab(t.id)}
            style={{ flex: "1 1 0", minWidth: 0, cursor: "pointer", background: on ? "var(--surface-card)" : "transparent",
              border: "1px solid " + (on ? "var(--border-strong)" : "transparent"), borderBottom: on ? "1px solid var(--surface-card)" : "1px solid transparent",
              borderRadius: "8px 8px 0 0", marginBottom: -1, padding: "9px 6px",
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase",
              color: on ? "var(--accent)" : "var(--text-2)", whiteSpace: "nowrap" }}>
            {t.id}
          </button>
        );
      })}
    </div>
  );
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
  /* Wraps onto a second line on a phone: the transport is apparatus, and apparatus folds
     before the page is allowed to scroll sideways or the map to shrink. */
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap", background: "var(--surface-card)", borderTop: "1px solid var(--border-dim)" }}>
      <div style={{ display: "flex", gap: 6, flex: "none" }}>
        <div title={"Step back " + humanMin(stepBack) + " (←)"} onClick={() => { setPlaying(false); setFrame(Math.max(0, frame - 1)); flash("STEP −" + humanMin(stepBack)); }} style={{ ...btn, width: 30, height: 30, fontSize: 11, opacity: single ? 0.4 : 1 }}>◀◀</div>
        <div title="Play/pause (space)" onClick={() => setPlaying(!playing)} style={{ ...btn, width: 36, height: 36, fontSize: 13, background: "var(--surface-solid)", color: "var(--text-inverse)", borderColor: "var(--surface-solid)", opacity: single ? 0.4 : 1 }}>{playing ? "❚❚" : "▶"}</div>
        <div title={"Step forward " + humanMin(stepFwd) + " (→)"} onClick={() => { setPlaying(false); setFrame(Math.min(NF, frame + 1)); flash("STEP +" + humanMin(stepFwd)); }} style={{ ...btn, width: 30, height: 30, fontSize: 11, opacity: single ? 0.4 : 1 }}>▶▶|</div>
        <div title="Jump to live" onClick={() => { setPlaying(true); setFrame(NF); }} style={{ ...btn, padding: "0 10px", height: 30, fontSize: 10, fontWeight: 700, color: isLive ? "var(--pos)" : "var(--text-2)", borderColor: isLive ? "var(--pos)" : "var(--border-strong)" }}>▶▶ Live</div>
      </div>
      <div style={{ flex: "1 1 160px", position: "relative", height: 30, display: "flex", alignItems: "center", minWidth: 0 }}>
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
  const NF = lastFrame();
  const stormIds = Object.keys(MT.storms);
  const [frame, setFrame] = React.useState(NF);
  const [playing, setPlaying] = React.useState(false); // boot LIVE — never auto-scrub on load
  const [speed, setSpeed] = React.useState(2);
  /* Boot to the OVERVIEW, not to storm #1. The board is a scanning surface before it is a
     single-storm surface: what is classified, what is forming, and where. Selecting a system
     is the drill-down, and the map is how you do it. */
  const [storm, setStorm] = React.useState(null);
  const [sel, setSel] = React.useState({ contract: (MT.contracts[0] && MT.contracts[0].id) || null, evidence: null });
  const [bankroll, setBankroll] = React.useState(10000);
  const [stake, setStake] = React.useState(0.25);
  const [layers, setLayers] = React.useState({ satellite: true, infrared: false, track: true, forecast: true, cone: true, guidance: true });
  const [vw, setVw] = React.useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  const [vh, setVh] = React.useState(typeof window !== "undefined" ? window.innerHeight : 900);
  const narrow = vw < 900;
  React.useEffect(() => {
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  /* Very wide viewports (4K panels, or a zoomed-out browser) were rendering the whole terminal
     as a narrow ~1680px band of 9px type marooned in gutters. Scale the shell with the viewport
     so the layout keeps its proportions and the type stays legible, then let the container use
     more of the width it has. */
  const zoom = vw >= 3300 ? 1.65 : vw >= 2700 ? 1.4 : vw >= 2200 ? 1.2 : vw >= 1900 ? 1.08 : 1;
  const cw = vw / zoom;                    // effective layout width after scaling
  const wide = cw >= 1280;                 // room for a third column
  const gap = wide ? 18 : 14;
  const shell = { width: "100%", maxWidth: 2000, margin: "0 auto", boxSizing: "border-box",
    padding: wide ? "22px 26px 56px" : "16px 16px 48px" };
  /* Spatial data is the reason this is a terminal and not a spreadsheet, and it was sized like
     a supporting chart. Half the viewport, floored at 500px so it stays a centrepiece on a
     laptop and grows on a wall display. */
  const cmdH = Math.max(480, Math.round(vh * 0.35 / zoom));
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

  const dense = false;   // one density; the switch was design-tool residue
  const [tab, setTab] = React.useState("Situation");
  /* The analog payload is fetched by its own panel, not by the data loader, so this
     component does not re-render when it lands. Without this the collapsed summary of
     the Analog prior section keeps whatever count it read at mount — "0 system(s) and
     area(s) matched" over a panel showing three. Resolve on the shared promise the panel
     publishes and re-read it once. */
  const [, setAnalogsRead] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    if (window.__MT_ANALOGS_P) window.__MT_ANALOGS_P.then(() => { if (alive) setAnalogsRead((n) => n + 1); });
    return () => { alive = false; };
  }, [tab]);
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


  const F = MT._feeds || {};

  // ---- empty / awaiting-telemetry state (honest current condition) ----
  const healthLines = [
    { name: "NHC advisories", ok: !!(F.nhc && F.nhc.ok), status: F.nhc && !F.nhc.ok && F.nhc.status ? "FAIL" : "EMPTY", detail: (F.nhc && F.nhc.note) || "—" },
    { name: "Prediction markets", ok: !!(F.markets && F.markets.ok), status: F.markets && !F.markets.ok && F.markets.status ? "FAIL" : "EMPTY", detail: (F.markets && F.markets.note) || "—" },
  ];

  /* Satellite freshness, normalised for the attention queue. GOES carries a real
     10-minute slot timestamp; the VIIRS fallback is a daily composite, so its age
     is reported as a fallback condition rather than a misleading minute count. */

  // Real staleness of the snapshot itself — the dot was green regardless of age.
  const staleMin = MT._generatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(MT._generatedAt)) / 60000)) : null;
  const shellHeader = (
    <header style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", gap: 12, padding: "9px 20px", background: "var(--surface-card)", borderBottom: "1px solid var(--border-dim)", flexWrap: "wrap" }}>
      <img src="assets/logo-dark.svg" alt="Millibar Terminal" style={{ height: 34 }} onError={(e) => { e.target.style.display = "none"; }} />
      <PL>Category Alpha</PL>
      {/* Active systems live in the top bar — switching storms shouldn't require
          hunting inside the map overlay. */}
      {stormIds.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4, borderLeft: "1px solid var(--border-dim)", marginLeft: 2, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", letterSpacing: ".6px" }}>ACTIVE</span>
          <PL mono={false} size="sm" active={storm == null} onClick={() => setStorm(null)}>All</PL>
          {Object.values(MT.storms).map((s2) => (
            <PL key={s2.id} mono={false} size="sm" active={s2.id === storm} dotColor={s2.color} onClick={() => setStorm(s2.id)}>
              {s2.name} <span style={{ opacity: .6, fontSize: 10 }}>{(s2.full_cls.match(/Cat \d/) || [s2.cls])[0].replace("Cat ", "C")}</span>
            </PL>
          ))}
        </div>
      )}
      {/* Wraps: on a phone the links, the clock and the feed pills fold onto further lines rather
          than pushing the page sideways. minWidth 0 lets the flex item shrink below its content. */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0, maxWidth: "100%", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
        {/* The historical surface. A LINK, not a panel: the Storm Atlas is a separate document
            with its own runtime, so this board loads none of its 1.9 MB of archive and none of
            its bundle. The trailing slash matters — there is no 404 fallback, and Pages serves
            a directory only when it is asked for one. */}
        <a href="storm-atlas/" title="Storm Atlas — the historical record, queried"
          style={{ color: "var(--text-2)", textDecoration: "none", letterSpacing: ".6px",
                   border: "1px solid var(--border-strong)", borderRadius: 5, padding: "2px 7px" }}>
          STORM ATLAS ›
        </a>
        {/* THE LEDGER, FROM THE FRONT DOOR. The archive's own backtest -- 1,039 storms replayed
            zero-peek, Brier against climatology, reliability curves -- is how a reader checks
            whether anything either surface says is worth believing, so it gets its own entrance
            rather than being three clicks inside the Atlas. Still just an anchor: this board
            loads none of the ledger's bytes and none of the Atlas's runtime. */}
        <a href="storm-atlas/?view=calibration" data-calibration-link
          title="Calibration ledger — how well the archive's own method scored against climatology"
          style={{ color: "var(--accent)", textDecoration: "none", letterSpacing: ".6px",
                   border: "1px solid var(--accent)", borderRadius: 5, padding: "2px 7px" }}>
          CALIBRATION ›
        </a>
        <span style={{ opacity: .4 }}>·</span>
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
        <span style={{ opacity: .4 }}>·</span><span>as-of <b style={{ color: "var(--accent)" }}>{MTX.frameTime(frame)}</b></span>
        <IngestionHUD />
      </div>
    </header>
  );

  /* No active cyclone used to short-circuit the ENTIRE terminal to the awaiting-telemetry
     notice — which also hid 142 live seasonal markets, their anchors, the posterior stack and
     the whole board. */
  const S = storm ? MT.storms[storm] : null;
  const P0 = (S && PAI[S.phase]) || PAI.WATCH;
  const snap = MTX.snap(storm, frame);
  const pickContract = (id) => { const c = MT.contracts.find((x) => x.id === id); setSel((s) => ({ ...s, contract: id })); if (c && c.storm && MT.storms[c.storm]) setStorm(c.storm); };

  return (
    <div data-surface="tactical" style={{ minHeight: "100vh", background: "var(--surface-app)", color: "var(--text-1)", fontFamily: "var(--font-sans)", zoom: zoom }}>
      {shellHeader}

      <main style={shell}>
        {/* The screen answers five questions, in order: 1 what changed · 2 why believe it · 3 does it
   touch the board 4 what deserves investigation · 5 where can I verify it Everything below
   Attention is supporting material and collapses. */}

        {/* 2 — WHERE. The map is the centrepiece and now sits like one: directly
            under the situation line, above every panel derived from it. It was
            previously made taller but never moved, so it stayed sixth down the page. */}
        {/* The map used to disappear whenever no storm was selected, which is backwards: a basin with
   three areas under watch and nothing classified is exactly when you want to see the water. */}
        {true && (
        <window.MT_Section label="Spatial context" tier="track · cone · satellite · replay" defaultOpen
          summary={S ? (S.name + " " + S.cls + " · " + Math.round(snap.wind) + " kt")
                     : (stormIds.length + " active · " + ((MT._outlook || []).length) + " area(s) watched")}>
        {/* Sticky, so the map stays put while a tab scrolls under it. overflow:hidden on the
            shell because Leaflet paints tiles outside its own box during a pan and they
            spill over whatever is beneath. */}
        <section style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-cmd)", marginBottom: gap,
          position: narrow ? "static" : "sticky", top: 8, zIndex: 400 }}>
          <div className="mt-grid" style={{ display: "grid", gridTemplateColumns: (narrow || !S) ? "1fr" : "minmax(0,1fr) " + (wide ? 360 : 320) + "px" }}>
            <div style={{ position: "relative", height: narrow ? Math.max(300, Math.round(vh * 0.42)) : cmdH, overflow: "hidden", background: "var(--slate-950)" }}>
              <window.MT_Map stormId={storm} frame={frame} layers={layers} onSelect={setStorm} resizeKey={tab + ":" + vw + ":" + vh} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 500, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", background: "linear-gradient(180deg,rgba(4,6,12,.9),rgba(4,6,12,.4) 70%,transparent)", pointerEvents: "none" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color: "var(--blue-300)", textTransform: "uppercase" }}>
                  {S ? S.name : "Storm Command Center"}
                </span>
                {/* Back out of the drill-down from the map itself, where the click that got
                    you here happened. pointerEvents restored: the gradient bar disables it. */}
                {S && (
                  <span onClick={() => setStorm(null)} title="Back to all systems and formation areas"
                    style={{ pointerEvents: "auto", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10,
                      fontWeight: 800, letterSpacing: ".6px", color: "var(--text-1)", padding: "3px 9px",
                      borderRadius: 6, border: "1px solid var(--border-strong)", background: "rgba(7,12,22,.8)" }}>
                    ← ALL SYSTEMS
                  </span>
                )}
              </div>
              <LayerToggles layers={layers} setLayers={setLayers} storm={storm} compact={vw < 640} />
            </div>
            {/* rail */}
            {S && (
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
                <div style={{ marginTop: 9 }}><window.MT_Hint id="note.lifecycle" label="interpretation, not observation" /></div>
              </div>
              {/* The five disagreement metrics and the bridge to the archive, on the rail beside
                  the map they describe. The full panel — lead table, fan, members — is under
                  Models; this is the glance. */}
              <window.MT_GuidanceStrip stormId={storm} frame={frame} />
            </aside>
            )}
          </div>
          <Transport frame={frame} setFrame={setFrame} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed} />
        </section>
        </window.MT_Section>
        )}
        {/* Gated on the FEED being empty, not on the selection being empty. Now that the board
            boots to the overview, `!S` is the normal state with storms on screen — showing
            "no active tropical cyclones" there would be a flat lie told by the layout. */}
        {stormIds.length === 0 && <AwaitingTelemetry feeds={healthLines} generatedAt={MT._generatedAt} note={MT._note} />}

        <TabBar tab={tab} setTab={setTab} />

        {tab === "Situation" && (<>
        {/* The ranked answer to "what do I buy", first, above everything that explains it. */}
        <div style={{ marginBottom: gap }}>
          <window.MT_EdgeBook frame={frame} bankroll={bankroll} stake={stake}
            setBankroll={setBankroll} setStake={setStake} onSelect={pickContract} dense={dense} />
        </div>

        <div className="mt-grid" style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.4fr) minmax(0,1fr)", gap: gap, alignItems: "start", marginBottom: gap }}>
          <window.MT_Situation dense={dense} />
          <GenesisWatch compact />       {/* self-hides when nothing is under watch */}
        </div>

        <div style={{ marginBottom: gap }}>
          <window.MT_Attention dense={dense} maxH={narrow ? 380 : 400}
            onSeek={(tsZ) => { const i = (MT._frames || []).findIndex((fr) => fr.tsZ === tsZ); if (i >= 0) { setPlaying(false); setFrame(i); } }}
            onSelectContract={pickContract} />
        </div>

        </>)}

        {tab === "Models" && (<>
        {/* 5 — the guidance envelope. What the models disagree about, by lead, and what moved
            since the last cycle. Above the analog prior because it is about THIS storm's next
            five days; the archive below is about storms like it. Raw guidance: it feeds nothing
            under Fair value, and claims.js `guidance.semantics` says so on the panel. */}
        <window.MT_Section label="Model guidance" tier="ATCF a-deck · track spread · intensity fan · cycle delta · raw guidance, not a probability"
          defaultOpen summary={S && S.guidance ? (S.guidance.roster.inSpread.length + " track runs · 72h spread " + (S.guidance.summary.trackSpread72Km ?? "—") + " km")
            : (stormIds.filter((id) => MT.storms[id].guidance).length + " system(s) with a deck")}>
          <window.MT_Guidance stormId={storm} frame={frame} narrow={narrow} />
        </window.MT_Section>

        {/* 5a — the empirical prior. A separate archive answering the question the rest of
            this tab cannot: for a system that formed HERE, in this season, in this
            environment, what did the ones like it go on to do? Above fair value because it
            is the base rate every anchor below it is a refinement of. */}
        <window.MT_Section label="Analog prior" tier="genesis-to-intensity archive · empirical base rates, not a skill forecast"
          defaultOpen summary={window.__MT_ANALOGS
            ? (((window.__MT_ANALOGS.entries) || []).length + " system(s) and area(s) matched")
            : "archive payload not read yet"}>
          <window.MT_AnalogPrior dense={dense} narrow={narrow} />
        </window.MT_Section>

        {/* 5b — fair value and the posterior stack behind every edge on screen */}
        <window.MT_Section label="Fair value" tier="term structure · posterior stack" defaultOpen summary="collapsed">
          <div className="mt-grid" style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.5fr) minmax(0,1fr)", gap: gap, alignItems: "start" }}>
            <window.MT_YieldCurve dense={dense} />
            <window.MT_Observability narrow={narrow} />
          </div>
        </window.MT_Section>

        {/* 5c — the audit trail: every input, and the full unfiltered register */}
        <window.MT_Section label="Verify" tier="inputs · confidence · full register"
          summary={MT.evidence.length + " inputs · tier " + MTX.snap(storm, frame).tier}>
          <div className="mt-grid" style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.5fr) minmax(0,1fr)", gap: gap, alignItems: "start" }}>
            <window.MT_StormConsoles dense={dense} frame={frame} />
            <window.MT_Evidence stormId={storm} frame={frame} selection={sel} onSelect={(id) => setSel((s) => ({ ...s, evidence: id }))} dense={dense} />
            <window.MT_Signals stormId={storm} dense={dense} maxH={520} onSeek={(tsZ) => {
              const i = (MT._frames || []).findIndex((fr) => fr.tsZ === tsZ);
              if (i >= 0) { setPlaying(false); setFrame(i); }
            }} />
          </div>
        </window.MT_Section>

        </>)}

        {tab === "Markets" && (<>
        {/* 5d — the full board, on demand */}
        <window.MT_Section label="Raw data" tier="full market board · depth · sizing"
          summary={MT.contracts.length + " contracts · " + (MT._feeds && MT._feeds.markets ? MT._feeds.markets.source : "—")}>
          <div className="mt-grid" style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "minmax(0,1.5fr) minmax(0,1fr)", gap: gap, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: gap, minWidth: 0 }}>
              <window.MT_Exposure frame={frame} dense={dense} selection={sel} onSelect={pickContract} />
              <window.MT_Markets frame={frame} selection={sel} onSelect={pickContract} dense={dense} />
            </div>
            <window.MT_OrderBook contractId={sel.contract} frame={frame} dense={dense} />
          </div>
        </window.MT_Section>


        </>)}

      </main>

      <window.MT_Provenance evidenceId={sel.evidence} stormId={storm} frame={frame} onClose={() => setSel((s) => ({ ...s, evidence: null }))} />
    </div>
  );
}
(function mount() {
  // Order-independent boot: wait for the plain-script globals (live data, compute
  // engine, DS bundle) before first render. The async data-loader sets window.MT
  // when the fetch resolves, so poll until everything is present.
  if (window.MT && window.MTX && window.CategoryAlphaDesignSystem_a835cf && window.MT_Evidence && window.MT_AnalogPrior && window.MT_Guidance) {
    ReactDOM.createRoot(document.getElementById("root")).render(<MillibarTerminalApp />);
  } else {
    setTimeout(mount, 30);
  }
})();
