const { Badge: BGc } = window.CategoryAlphaDesignSystem_a835cf || {};

/* Terminal console — deterministic diagnostics + a Claude-backed explainability
   assistant. Claude only ever explains/summarizes grounded evidence; it never issues
   a recommendation and every answer stays traceable to the as-of cursor. */
function buildContext(stormId, frame) {
  const s = MTX.snap(stormId, frame), S = s.S;
  if (!S) return { as_of: MTX.frameTime(frame), storm: "none active", note: "No active tropical cyclone in the feed — awaiting telemetry.", evidence: [], contracts: [], events_seen: [] };
  const ev = MT.evidence.map((e) => e.label + " = " + e.read(S, frame) + " [" + e.source + ", tier " + e.tier + "]");
  const contracts = MT.contracts.map((c) => { const k = MTX.kellyFor(c, frame, 10000, 0.25); const mkt = k.market != null ? Math.round(k.market) + "%" : "—"; const edge = k.edge != null ? k.edge.toFixed(1) + "%" : "n/a"; const tail = k.noModel ? " (no model anchor)" : k.noData ? " (no price)" : k.noBet ? " (no bet)" : ", Q-Kelly $" + k.allocation + (k.liqCapped ? " LIQ-CAPPED" : ""); return c.label + ": edge " + edge + ", mkt " + mkt + tail; });
  const past = MT.events.filter((e) => e.frame <= frame).map((e) => MTX.frameTime(e.frame) + " " + e.label);
  return {
    as_of: MTX.frameTime(frame), storm: S.name + " " + S.full_cls,
    pressure_mb: s.pressure, wind_kt: s.wind, model_cat4: s.model != null ? Math.round(s.model * 100) + "%" : "no model feed",
    market_cat4: s.market != null ? Math.round(s.market * 100) + "%" : "—", edge_pct: s.edgePct != null ? s.edgePct.toFixed(1) : "—",
    confidence_tier: s.tier, tier_reasons: s.tierReasons, evidence: ev, contracts, events_seen: past,
  };
}
const SYS = "You are the Category Alpha research assistant embedded in Millibar Terminal, an institutional hurricane-divergence research console. RULES (non-negotiable): research-only — never give financial advice or tell the user to trade/buy/sell; always ground every statement in the provided evidence; keep probability and evidence-quality (confidence) as SEPARATE axes; be terse and operational (Bloomberg/mission-control tone), plain text, no markdown headers; if something is absent or deferred, say so plainly rather than inventing. You are given the current terminal state as JSON.";

const HAS_CLAUDE = typeof window !== "undefined" && window.claude && typeof window.claude.complete === "function";

function MT_Console({ stormId, frame }) {
  const [log, setLog] = React.useState([{ role: "sys", text: HAS_CLAUDE
    ? "Category Alpha assistant ready. Type `help`, or ask about the current evidence, confidence, or edge."
    : "Category Alpha console ready. Local diagnostics only — the Claude assistant runs when this dashboard is opened inside claude.ai. Commands: help · status · clear." }]);
  const [val, setVal] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const bodyRef = React.useRef(null);
  React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [log, busy]);

  async function run(cmd) {
    const c = cmd.trim(); if (!c) return;
    setLog((l) => [...l, { role: "user", text: c }]);
    const lc = c.toLowerCase();
    if (lc === "help") {
      setLog((l) => [...l, { role: "sys", text: "commands: status · explain confidence · explain edge · compare models · summarize · clear — or ask anything in plain language." }]); return;
    }
    if (lc === "clear") { setLog([]); return; }
    if (lc === "status") {
      const ctx = buildContext(stormId, frame);
      const text = ctx.pressure_mb == null
        ? `as-of ${ctx.as_of} · ${ctx.storm}\n${ctx.note || "no active system"}`
        : `as-of ${ctx.as_of} · ${ctx.storm}\n${ctx.pressure_mb} mb · ${ctx.wind_kt} kt · model ${ctx.model_cat4} vs mkt ${ctx.market_cat4} · edge ${ctx.edge_pct}% · confidence tier ${ctx.confidence_tier}`;
      setLog((l) => [...l, { role: "sys", text }]); return;
    }
    if (!HAS_CLAUDE) {
      setLog((l) => [...l, { role: "sys", text: "assistant offline — the Claude explainability helper is only available inside claude.ai. Try `status` for a live snapshot, or open this dashboard as a Claude artifact." }]);
      return;
    }
    // Claude-backed explainability
    setBusy(true);
    const ctx = buildContext(stormId, frame);
    const prompt = { system: SYS + "\n\nSTATE:\n" + JSON.stringify(ctx, null, 1), messages: [{ role: "user", content: c }], max_tokens: 500 };
    try {
      const out = await window.claude.complete(prompt);
      setLog((l) => [...l, { role: "assistant", text: out, tier: ctx.confidence_tier, asof: ctx.as_of }]);
    } catch (err) {
      setLog((l) => [...l, { role: "sys", text: "assistant unavailable: " + (err && err.message ? err.message : "error") }]);
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-card)", border: "1px solid var(--border-dim)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--accent)" }}>Terminal Console</span>
        <BGc tone="special">EXPLAINABILITY ONLY</BGc>
      </div>
      <div ref={bodyRef} style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: 12, fontFamily: "var(--font-mono)", fontSize: 11.5, lineHeight: 1.55 }}>
        {log.map((m, i) => (
          <div key={i} style={{ marginBottom: 9 }}>
            {m.role === "user" && <div style={{ color: "var(--accent)" }}><span style={{ opacity: .6 }}>›</span> {m.text}</div>}
            {m.role === "sys" && <div style={{ color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{m.text}</div>}
            {m.role === "assistant" && <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "var(--special)", marginBottom: 3 }}>CATEGORY ALPHA ASSISTANT</div>
              <div style={{ color: "var(--text-1)", whiteSpace: "pre-wrap" }}>{m.text}</div>
              <div style={{ color: "var(--text-2)", fontSize: 9, marginTop: 4, opacity: .8 }}>[ traceable to evidence as-of {m.asof} · confidence tier {m.tier} ]</div>
            </div>}
          </div>
        ))}
        {busy && <div style={{ color: "var(--text-2)" }}>▍ reasoning over evidence…</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); run(val); setVal(""); }} style={{ display: "flex", borderTop: "1px solid var(--border-dim)" }}>
        <span style={{ padding: "9px 6px 9px 12px", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>›</span>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="explain edge · compare models · summarize…" disabled={busy}
          style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-1)", padding: "9px 12px 9px 0" }} />
      </form>
    </div>
  );
}
window.MT_Console = MT_Console;
