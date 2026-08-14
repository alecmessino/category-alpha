const CAns = window.CategoryAlphaDesignSystem_a835cf || {};
const { Panel: P, SectionHeader: SH, ProvenanceFooter: PF, Badge: BG, Gauge: GG,
        KellyBar: KB, EdgeCell: EC, StatTile: ST, HealthRow: HR, Button: BT } = CAns;
const TIER_TONE = { A: "pos", B: "warn", C: "neg" };

function labelRow(k, v, tone) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 0", fontFamily: "var(--font-mono)", fontSize: 11 }}>
      <span style={{ color: "var(--text-2)" }}>{k}</span>
      <span style={{ color: tone || "var(--text-1)", fontWeight: 600 }}>{v}</span>
    </div>
  );
}

/* ---- Situation — the 30-second read, top of the hierarchy ---- */
const VERDICT_TONE = { "TRADE-RELEVANT": "var(--edge-glow)", MATERIAL: "var(--warn)", COSMETIC: "var(--text-2)", "NO CHANGE": "var(--text-2)" };
function MT_Situation({ dense }) {
  const s = MTX.situation ? MTX.situation(360) : null;
  if (!s) return null;
  const vc = VERDICT_TONE[s.verdict] || "var(--text-2)";
  const ago = (m) => m == null ? "—" : m < 60 ? m + "m ago" : Math.floor(m / 60) + "h" + ("0" + (m % 60)).slice(-2) + "m ago";
  const line = { fontFamily: "var(--font-mono)", fontSize: dense ? 11.5 : 12.5, color: "var(--text-2)", lineHeight: 1.75 };
  return (
    <section style={{ border: "1px solid var(--border-strong)", borderLeft: "3px solid " + vc, borderRadius: 12,
      background: "var(--surface-card)", boxShadow: "var(--shadow-cmd)", padding: dense ? "12px 15px" : "15px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "var(--accent)" }}>SITUATION</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: .8, color: vc,
          border: "1px solid " + vc, borderRadius: 5, padding: "2px 7px" }}>{s.verdict}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
          last {Math.round(s.windowMin / 60)}h · {s.totalEvents} event{s.totalEvents === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ fontSize: dense ? 18 : 22, fontWeight: 800, color: "var(--text-1)", lineHeight: 1.2, letterSpacing: "-.2px", marginBottom: 11 }}>{s.headline}</div>
      {/* Scannable metric strip — the numbers carry the read, prose only where it adds. */}
      <div style={{ display: "flex", gap: 1, background: "var(--border-dim)", borderRadius: 8, overflow: "hidden", flexWrap: "wrap", marginBottom: 10 }}>
        {[
          { k: "MATERIAL CHANGES", v: s.byClass.material + s.byClass["trade-relevant"], sub: "in " + Math.round(s.windowMin / 60) + "h" },
          { k: "LAST UPDATE", v: ago(s.lastMaterialAgo).replace(" ago", ""), sub: "ago" },
          { k: "CONFIDENCE", v: s.confidence, sub: s.confWhy,
            tone: s.confidence === "HIGH" ? "var(--pos)" : s.confidence === "MEDIUM" ? "var(--warn)" : "var(--neg)" },
        ].map((m) => (
          <div key={m.k} style={{ flex: "1 1 110px", minWidth: 0, background: "var(--surface-card)", padding: "8px 11px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".7px", color: "var(--text-2)" }}>{m.k}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 19, fontWeight: 800, lineHeight: 1.15, marginTop: 2,
              color: m.tone || "var(--text-1)" }}>{m.v}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sub}</div>
          </div>
        ))}
      </div>
      <div style={line}>
        {s.topChange && <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· Latest: <b style={{ color: "var(--text-1)" }}>{s.topChange}</b></div>}
        {!s.topChange && <div>· {s.changed}</div>}
        <div>· {s.conflicts.length
          ? <span style={{ color: "var(--warn)" }}>⚠ Conflicting evidence — {s.conflicts.join("; ")}</span>
          : "No conflicting evidence between physical and market signals."}</div>
      </div>
      {/* Why believe it — question 2, answered in one line rather than a panel.
          Feed provenance, not forecast confidence; the two are kept separate. */}
      {(() => {
        const F = MT._feeds || {};
        const live = Object.keys(F).filter((k) => F[k] && F[k].ok);
        const down = Object.keys(F).filter((k) => F[k] && !F[k].ok);
        // Clamped: a client clock behind the server renders a negative age, which reads as
        // nonsense ("snapshot -8m old") exactly when someone is checking whether to trust it.
        const stale = MT._generatedAt ? Math.max(0, Math.round((Date.now() - Date.parse(MT._generatedAt)) / 60000)) : null;
        const tier = MT.evidence.every((e) => e.tier === "A") ? "A" : MT.evidence.some((e) => e.tier === "A") ? "A/B" : "B";
        return (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginTop: 9, paddingTop: 8,
            borderTop: "1px solid var(--border-dim)", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
            <span style={{ fontWeight: 800, letterSpacing: ".8px", color: "var(--text-2)" }}>WHY BELIEVE IT</span>
            <span>{live.length}/{live.length + down.length} feeds live</span>
            <span>evidence tier <b style={{ color: "var(--text-1)" }}>{tier}</b></span>
            <span>snapshot <b style={{ color: stale == null ? "var(--text-1)" : stale <= 25 ? "var(--pos)" : stale <= 75 ? "var(--warn)" : "var(--neg)" }}>{stale == null ? "—" : stale + "m old"}</b></span>
            {down.length > 0 && <span style={{ color: "var(--neg)" }}>NO FEED: {down.join(", ")}</span>}
            <span style={{ opacity: .75 }}>· every number traces to a named feed under Verify</span>
          </div>
        );
      })()}
    </section>
  );
}

/* Progressive disclosure — supporting detail collapses so the hierarchy reads. */
function MT_Section({ label, tier, defaultOpen, summary, children }) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
        padding: "6px 2px", borderBottom: "1px solid var(--border-dim)", marginBottom: open ? 12 : 0 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", width: 10 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: 1.6,
          color: open ? "var(--text-1)" : "var(--text-2)", textTransform: "uppercase" }}>{label}</span>
        {tier && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", opacity: .7 }}>{tier}</span>}
        {!open && summary && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>{summary}</span>}
      </div>
      {open && children}
    </div>
  );
}

/* ---- Evidence Matrix ---- */
function MT_Evidence({ stormId, frame, selection, onSelect, dense }) {
  const S = MT.storms[stormId];
  const pad = dense ? "4px 8px" : "7px 9px";
  return (
    <P pad={false} title="Evidence Matrix" right={<BG tone="live" dot>{MT.evidence.length} SIGNALS</BG>}
      footer={<PF {...MTC.footer("panel.evidence")} />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: dense ? 11 : 12 }}>
          <thead><tr>{["Evidence", "Value", "Source", "Tier"].map((h) => (
            <th key={h} style={{ textAlign: "left", color: "var(--text-2)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".5px", padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{h}</th>
          ))}</tr></thead>
          <tbody>{MT.evidence.map((e) => {
            const on = selection.evidence === e.id;
            return (
              <tr key={e.id} onClick={() => onSelect(e.id)} style={{ cursor: "pointer", background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent" }}>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", color: "var(--text-1)" }}>{e.label}</td>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700 }}>{e.read(S, frame)}</td>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: 10 }}>{e.source}</td>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)" }}><BG tone={TIER_TONE[e.tier]}>{e.tier}</BG></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", padding: "6px 10px" }}>Click a row → provenance drill-down. Values re-read at the as-of cursor.</div>
    </P>
  );
}

/* ---- Confidence (evidence-quality) ---- */
function MT_Confidence({ stormId, frame }) {
  const s = MTX.snap(stormId, frame);
  return (
    <P title="Confidence" right={<BG tone={TIER_TONE[s.tier]}>TIER {s.tier}</BG>}
      footer={<PF {...MTC.footer("panel.confidence")} tier={s.tier} />}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>
        {s.tierReasons.map((r, i) => <div key={i}>· {r}</div>)}
      </div>
      <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border-dim)", borderLeft: "3px solid var(--special)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>
        Evidence-quality is <b style={{ color: "var(--text-1)" }}>not</b> probability. This tier scores how real/live/sourced the inputs are — a 60% @ B ≠ 60% @ A.
      </div>
    </P>
  );
}


/* ---- Edge Matrix / Q-Kelly ---- */
function MT_EdgeMatrix({ frame, bankroll, stake, setBankroll, setStake, selection, onSelect, dense }) {
  const rows = MT.contracts.map((c) => ({ c, k: MTX.kellyFor(c, frame, bankroll, stake) }));
  const total = rows.reduce((a, r) => a + (r.k.allocation || 0), 0);
  const hasModel = (MT._feeds && MT._feeds.models && MT._feeds.models.ok);
  const mktSrc = (MT._feeds && MT._feeds.markets && MT._feeds.markets.source) || "market";
  return (
    <P pad={false} title="Edge Matrix — Q-Kelly Allocation" right={<BG tone={hasModel ? "live" : "neg"} dot>{hasModel ? "CLIMATOLOGY ANCHOR" : "MODEL DEFERRED"}</BG>}
      footer={<PF {...MTC.footer("panel.edge")} />}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--text-2)" }}>Bankroll</span>
        <input type="number" value={bankroll} min={100} step={500} onChange={(e) => setBankroll(+e.target.value || 0)}
          style={{ width: 104, fontFamily: "var(--font-mono)", fontSize: 13, padding: "5px 8px", border: "1px solid var(--border-dim)", borderRadius: 6, background: "var(--surface-card)", color: "var(--text-1)" }} />
        <div style={{ display: "flex" }}>
          {[[1, "FULL"], [0.5, "½"], [0.25, "¼"]].map(([f, l], i) => (
            <BT key={l} variant="preset" mono active={stake === f} onClick={() => setStake(f)}
              style={{ borderRadius: i === 0 ? "6px 0 0 6px" : i === 2 ? "0 6px 6px 0" : 0, marginLeft: i ? "-1px" : 0 }}>{l}</BT>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-2)" }}>Total deploy <b style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", fontSize: 13 }}>${total.toLocaleString()}</b></span>
      </div>
      {rows.length === 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", padding: "14px 12px" }}>No hurricane prediction markets currently listed.</div>}
      <div className="mt-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))", gap: 10, padding: dense ? 9 : 12 }}>
        {rows.map(({ c, k }) => (
          <div key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: "pointer", borderRadius: 9, outline: selection.contract === c.id ? "1px solid var(--accent)" : "none", outlineOffset: 1 }}>
            {k.noModel || k.noData ? (
              <div style={{ border: "1px solid var(--border-dim)", borderRadius: 9, padding: "10px 11px", height: "100%" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.25 }}>{c.short}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>MARKET</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>{k.market != null ? Math.round(k.market) + "¢" : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>KELLY</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--neg)" }}>{k.noData ? "NO PRICE" : "NO MODEL"}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 6, lineHeight: 1.4 }}>{c.liquidity != null ? "liq $" + Math.round(c.liquidity / 1000) + "k · " : ""}edge needs a model anchor</div>
              </div>
            ) : (
              <EC contract={c.label} edge={k.edge} marketPct={k.market} liquidity={c.liquidity}
                theoretical={k.noBet ? undefined : k.theoretical} capped={k.capped} allocation={k.allocation} stakePct={k.stakePct} rawPct={k.rawPct} />
            )}
          </div>
        ))}
      </div>
    </P>
  );
}

/* ---- Edge book: the ranked answer to "what do I buy" ----
   Everything else on this board answers a question about the world. This answers a
   question about the operator's next action, which is why it sits at the top and why
   it is a short list rather than a grid of every contract. */
/* ---- Mission control: one storm, everything that decides it ----
   The advisory carries four things that matter and they were scattered across four
   surfaces: how intense it is now, what NHC says it becomes, whether an official watch
   is up, and how old the product was when we read it. An operator deciding on a position
   should not have to assemble that. */
function StormConsole({ storm, dense }) {
  const S = storm;
  if (!S) return null;
  const mono = { fontFamily: "var(--font-mono)" };
  const hp = S.hurricaneP || null;
  const w = S.watches || null;
  const fc = S.forecastKt || [];
  const peak = fc.length ? fc.reduce((a, b) => (b.kt > a.kt ? b : a), fc[0]) : null;
  /* Lag is the honest liveness number: how old the product was when it was fetched. It
     is green only inside one intermediate cycle. */
  const lag = S.advisoryLagMin;
  const lagTone = lag == null ? "var(--text-2)" : lag <= 45 ? "var(--pos)" : lag <= 180 ? "var(--warn)" : "var(--neg)";

  const cell = (label, value, tone) => (
    <div style={{ padding: "8px 11px", borderRight: "1px solid var(--border-dim)", minWidth: 0 }}>
      <div style={{ ...mono, fontSize: 9.5, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--text-2)" }}>{label}</div>
      <div style={{ ...mono, fontSize: 15, fontWeight: 800, color: tone || "var(--text-1)", marginTop: 2, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );

  return (
    <div style={{ border: "1px solid var(--border-strong)", borderRadius: 10, overflow: "hidden",
      background: "var(--surface-card)", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 11px",
        borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)", flexWrap: "wrap" }}>
        <span style={{ ...mono, fontWeight: 800, fontSize: 13, color: "var(--text-1)", letterSpacing: ".5px" }}>{S.name}</span>
        <span style={{ ...mono, fontSize: 11, color: "var(--text-2)" }}>{S.full_cls || S.cls}</span>
        {w && w.highest && (
          <span style={{ ...mono, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 4,
            color: w.highestRank >= 3 ? "var(--neg)" : "var(--warn)",
            background: w.highestRank >= 3 ? "rgba(239,68,68,.12)" : "rgba(234,179,8,.12)",
            border: "1px solid currentColor" }}>{w.highest.toUpperCase()}</span>
        )}
        <span style={{ marginLeft: "auto", ...mono, fontSize: 10.5, color: "var(--text-2)" }}>
          adv #{S.advNumFull || S.advNum || "?"}
          {lag != null && <span style={{ color: lagTone }}> · {lag}m old at fetch</span>}
        </span>
      </div>

      <div className="mt-grid" style={{ display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(112px,100%),1fr))", borderBottom: "1px solid var(--border-dim)" }}>
        {cell("Now", (S.wind ?? "—") + " kt")}
        {cell("Pressure", (S.pressure ?? "—") + " mb")}
        {cell("Moving", S.movement || "—")}
        {peak && cell("Forecast peak", peak.kt + " kt", "var(--accent)")}
        {peak && cell("At", "+" + peak.hr + "h")}
        {hp && cell("To hurricane", Math.round(hp.p * 100) + "%", "var(--accent)")}
      </div>

      {/* The forecast curve as published, so the shape is readable at a glance rather
          than inferred from a single peak number. */}
      {fc.length > 1 && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, padding: "9px 11px 6px", height: 58 }}>
          {fc.map((p) => {
            const h = Math.max(3, Math.min(1, p.kt / 100) * 40);
            const isHur = p.kt >= 65;
            return (
              <div key={p.hr} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{ ...mono, fontSize: 8.5, color: isHur ? "var(--neg)" : "var(--text-2)" }}>{p.kt}</span>
                <div style={{ width: "100%", height: h, borderRadius: 2,
                  background: isHur ? "var(--neg)" : "var(--accent)", opacity: isHur ? .9 : .5 }} />
                <span style={{ ...mono, fontSize: 8, color: "var(--text-2)" }}>{p.hr}h</span>
              </div>
            );
          })}
        </div>
      )}

      {(hp || (w && w.highest)) && (
        <div style={{ ...mono, fontSize: 10, color: "var(--text-2)", padding: "0 11px 9px", lineHeight: 1.55 }}>
          {hp && <div>{hp.basis}</div>}
          {w && w.highest && <div style={{ marginTop: 4 }}>{MTC.claim("advisory.watches").text}</div>}
        </div>
      )}
    </div>
  );
}

function MT_StormConsoles({ dense }) {
  const storms = Object.values((window.MT && MT.storms) || {});
  const live = storms.filter((s) => s.forecastKt || s.hurricaneP || (s.watches && s.watches.highest));
  if (!live.length) return null;
  return (
    <P pad={false} title="Active systems — official advisory"
      right={<BG tone="live" dot>{live.length} TRACKED</BG>}
      footer={<PF {...MTC.footer("panel.storms")} />}>
      <div style={{ padding: dense ? 9 : 11 }}>
        {live.map((s) => <StormConsole key={s.id} storm={s} dense={dense} />)}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", lineHeight: 1.55 }}>
          {MTC.claim("advisory.latency").text}
        </div>
      </div>
    </P>
  );
}

const GRADE_TONE = {
  TAKE:    { fg: "var(--pos)",  bg: "rgba(34,197,94,.10)" },
  SMALL:   { fg: "var(--warn)", bg: "rgba(234,179,8,.10)" },
  SUSPECT: { fg: "var(--text-2)", bg: "transparent" },
};

function MT_EdgeBook({ frame, bankroll, stake, setBankroll, setStake, onSelect, dense }) {
  const [showAll, setShowAll] = React.useState(false);
  /* The page had become a wall of prose: sixty-six trap rows, four inversion lines and
     three explanatory paragraphs, all inline, above the only table anyone reads. The
     reasoning still has to be reachable — that is the whole provenance contract — but
     reachable is not the same as unavoidable. Each collapses to its headline count. */
  const [showTraps, setShowTraps] = React.useState(false);
  const [showLadder, setShowLadder] = React.useState(false);
  const [showMethod, setShowMethod] = React.useState(false);
  const book = MTX.edgeBook(frame, bankroll, stake, { limit: showAll ? 40 : 6 });
  const cov = MTC.claim("edgebook.coverage");
  const mono = { fontFamily: "var(--font-mono)" };
  const pct = (v) => (v * 100).toFixed(1) + "¢";
  const money = (v) => "$" + Math.round(v).toLocaleString();

  const head = (t, align) => (
    <th style={{ ...mono, fontSize: 9.5, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase",
      color: "var(--text-2)", textAlign: align || "left", padding: "7px 8px", borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap" }}>{t}</th>
  );
  const cell = (v, align, style) => (
    <td style={{ ...mono, fontSize: 11.5, padding: "7px 8px", textAlign: align || "left",
      borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap", ...(style || {}) }}>{v}</td>
  );

  return (
    <P pad={false} title="Edge Book — ranked by expected value"
      right={<BG tone={book.rows.length ? "live" : "warn"} dot>{book.rows.length ? book.rows.length + " ACTIONABLE" : "NOTHING CLEARS"}</BG>}
      footer={<PF {...MTC.footer("panel.edgebook")} />}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)" }}>
        <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--text-2)" }}>Bankroll</span>
        <input type="number" value={bankroll} min={100} step={500} onChange={(e) => setBankroll(+e.target.value || 0)}
          style={{ width: 104, ...mono, fontSize: 13, padding: "5px 8px", border: "1px solid var(--border-dim)", borderRadius: 6, background: "var(--surface-card)", color: "var(--text-1)" }} />
        <div style={{ display: "flex" }}>
          {[[1, "FULL"], [0.5, "½"], [0.25, "¼"]].map(([f, l], i) => (
            <BT key={l} variant="preset" mono active={stake === f} onClick={() => setStake(f)}
              style={{ borderRadius: i === 0 ? "6px 0 0 6px" : i === 2 ? "0 6px 6px 0" : 0, marginLeft: i ? "-1px" : 0 }}>{l}</BT>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-2)" }}>
          <b style={{ ...mono, color: "var(--pos)", fontSize: 13 }}>{book.byGrade.TAKE}</b> take ·{" "}
          <b style={{ ...mono, color: "var(--warn)", fontSize: 13 }}>{book.byGrade.SMALL}</b> small ·{" "}
          <b style={{ ...mono, color: "var(--text-2)", fontSize: 13 }}>{book.byGrade.SUSPECT}</b> suspect
          {"  ·  "}expected <b style={{ ...mono, color: "var(--pos)", fontSize: 13 }}>
            {money(book.rows.filter((r) => r.grade !== "SUSPECT").reduce((a, r) => a + r.ev, 0))}</b>
          {" "}on <b style={{ ...mono, color: "var(--text-1)", fontSize: 13 }}>
            {money(book.rows.filter((r) => r.grade !== "SUSPECT").reduce((a, r) => a + r.stake, 0))}</b> staked
        </span>
      </div>

      {(() => {
        const storms = Object.values((window.MT && MT.storms) || {});
        const live = storms.filter((x) => x.hurricaneP || (x.watches && x.watches.highest));
        if (!live.length) return null;
        return (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-dim)", background: "rgba(56,189,248,.07)" }}>
            <div style={{ ...mono, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: "var(--accent)" }}>
              OFFICIAL FORECAST — NHC ADVISORY
            </div>
            {live.map((x) => (
              <div key={x.id} style={{ ...mono, fontSize: 11.5, marginTop: 4, color: "var(--text-1)" }}>
                {x.name} {x.wind}kt
                {x.hurricaneP && <span> · <b style={{ color: "var(--accent)" }}>{Math.round(x.hurricaneP.p * 100)}%</b> to reach hurricane strength</span>}
                {x.watches && x.watches.highest && <span style={{ color: "var(--warn)" }}> · {x.watches.highest}</span>}
                {x.advisoryLagMin != null && <span style={{ color: "var(--text-2)" }}> · advisory {x.advisoryLagMin}m old at fetch</span>}
              </div>
            ))}
            <div style={{ ...mono, fontSize: 10, marginTop: 5, color: "var(--text-2)", lineHeight: 1.5 }}>
              {MTC.claim("advisory.forecast").text}
            </div>
            <div style={{ ...mono, fontSize: 10, marginTop: 4, color: "var(--text-2)", lineHeight: 1.5 }}>
              {MTC.claim("advisory.latency").text}
            </div>
          </div>
        );
      })()}

      {(() => {
        const traps = MTX.liquidityTraps();
        if (!traps.length) return null;
        const worst = showTraps ? traps.slice(0, 12) : [];
        return (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-dim)", background: "rgba(234,179,8,.07)" }}>
            <div onClick={() => setShowTraps(!showTraps)} style={{ ...mono, fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: "var(--warn)", cursor: "pointer" }}>
              {showTraps ? "▾" : "▸"} CANNOT BE ROUND-TRIPPED — {traps.length} OF {(window.MT && MT.contracts || []).length} CONTRACTS
            </div>
            {worst.map((t) => (
              <div key={t.id} style={{ ...mono, fontSize: 11, marginTop: 4, color: "var(--text-2)" }}>
                <span style={{ color: "var(--text-1)" }}>{String(t.label).slice(0, 54)}</span>
                {" — pay "}{(t.ask * 100).toFixed(0)}¢, exit at {(t.bid * 100).toFixed(0)}¢
                {" ("}{Math.round(t.roundTripPct * 100)}% round trip{t.thin ? `, only ${Math.round(t.exitDepth)} resting to sell into` : ""}{")"}
              </div>
            ))}
            {showTraps && traps.length > worst.length && (
              <div style={{ ...mono, fontSize: 10.5, marginTop: 4, color: "var(--text-2)" }}>
                …and {traps.length - worst.length} more
              </div>
            )}
            {showTraps && (
              <div style={{ ...mono, fontSize: 10, marginTop: 5, color: "var(--text-2)", lineHeight: 1.5 }}>
                {MTC.claim("edgebook.exit").text}
              </div>
            )}
          </div>
        );
      })()}

      {(() => {
        const lad = MTX.ladderArbs(frame);
        if (!lad.executable.length && !lad.displayed.length) return null;
        return (
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-dim)",
            background: lad.executable.length ? "rgba(34,197,94,.07)" : "var(--surface-sunken)" }}>
            <div onClick={() => setShowLadder(!showLadder)} style={{ ...mono, fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
              color: lad.executable.length ? "var(--pos)" : "var(--text-2)", cursor: "pointer" }}>
              {lad.executable.length ? "" : (showLadder ? "▾ " : "▸ ")}
              LADDER CONSISTENCY — {lad.executable.length ? lad.executable.length + " LOCKED SPREAD(S)" : lad.displayed.length + " DISPLAYED-ONLY INVERSIONS, NONE TRADEABLE"}
            </div>
            {lad.executable.map((x) => (
              <div key={x.buyId + x.sellId} style={{ ...mono, fontSize: 11.5, marginTop: 4, color: "var(--text-1)" }}>
                buy &gt;{x.buyStrike} at {(x.buyAsk * 100).toFixed(0)}¢ · sell &gt;{x.sellStrike} at {(x.sellBid * 100).toFixed(0)}¢
                {" → "}<b style={{ color: "var(--pos)" }}>{(x.net * 100).toFixed(1)}¢ locked</b>
                {" "}on {Math.round(x.size).toLocaleString()} contracts ({money(x.profit)}), net of fee
              </div>
            ))}
            {showLadder && lad.displayed.map((x) => (
              <div key={x.ladder + x.lo} style={{ ...mono, fontSize: 10.5, marginTop: 4, color: "var(--text-2)" }}>
                displayed only: &gt;{x.lo} shows {(x.loP * 100).toFixed(0)}¢ under &gt;{x.hi} at {(x.hiP * 100).toFixed(0)}¢ —
                {" "}the touch is ordered correctly, so there is nothing to take
              </div>
            ))}
            {showLadder && (
              <div style={{ ...mono, fontSize: 10, marginTop: 5, color: "var(--text-2)", lineHeight: 1.5 }}>
                {MTC.claim("edgebook.ladder").text}
              </div>
            )}
          </div>
        );
      })()}

      {book.rows.length === 0 ? (
        <div style={{ ...mono, fontSize: 11.5, color: "var(--text-2)", padding: "14px 12px", lineHeight: 1.7 }}>
          <div style={{ color: "var(--text-1)" }}>No contract clears the bar right now.</div>
          <div style={{ marginTop: 6 }}>
            {book.skipped.noModel} unmodelled · {book.skipped.noBook} with nothing resting ·{" "}
            {book.skipped.noEdge} inside the fee and spread · {book.skipped.tooThin} too small to stake
          </div>
          <div style={{ marginTop: 6 }}>{cov.text}</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {head("Verdict", "center")}{head("Contract")}{head("Side", "center")}{head("Pay", "right")}{head("Model / range", "right")}
              {head("Net edge", "right")}{head("Agree", "right")}{head("Stake", "right")}{head("Expected", "right")}{head("Why")}
            </tr></thead>
            <tbody>
              {book.rows.map((r) => (
                <tr key={r.id} onClick={() => onSelect && onSelect(r.id)} style={{ cursor: "pointer", opacity: r.grade === "SUSPECT" ? .62 : 1 }}>
                  {cell(<span style={{ fontWeight: 800, fontSize: 10, letterSpacing: ".5px", padding: "2px 7px", borderRadius: 4,
                    color: GRADE_TONE[r.grade].fg, background: GRADE_TONE[r.grade].bg, border: "1px solid " + GRADE_TONE[r.grade].fg }}>{r.grade}</span>, "center")}
                  <td style={{ fontSize: 11.5, padding: "7px 8px", borderBottom: "1px solid var(--border-dim)", color: "var(--text-1)", maxWidth: 300 }}>{r.label}</td>
                  {cell(<span style={{ fontWeight: 800, color: r.side === "YES" ? "var(--pos)" : "var(--neg)" }}>{r.side}</span>, "center")}
                  {cell(pct(r.price), "right")}
                  {cell(r.c.modelLow != null && r.c.modelHigh != null ? (
                    /* The band drawn to scale on 0-100, with the price marked on the same
                       axis. When the marker sits inside the bar the estimate does not
                       clear the price and the row is graded on exactly that. */
                    <span style={{ display: "inline-block", width: 74, verticalAlign: "middle" }} title={`${(r.c.modelLow*100).toFixed(0)}-${(r.c.modelHigh*100).toFixed(0)}% · pay ${(r.price*100).toFixed(0)}c`}>
                      <span style={{ display: "block", fontSize: 10, color: "var(--text-2)", textAlign: "right" }}>{pct(r.model)}</span>
                      <span style={{ position: "relative", display: "block", height: 6, borderRadius: 3, background: "var(--surface-sunken)", border: "1px solid var(--border-dim)", marginTop: 2 }}>
                        <span style={{ position: "absolute", left: (r.c.modelLow * 100) + "%",
                          width: Math.max(2, (r.c.modelHigh - r.c.modelLow) * 100) + "%",
                          top: 0, bottom: 0, borderRadius: 3,
                          background: r.grade === "SUSPECT" ? "var(--text-2)" : "var(--accent)", opacity: .55 }} />
                        <span style={{ position: "absolute", left: (r.price * 100) + "%", top: -2, bottom: -2, width: 2,
                          background: "var(--warn)" }} />
                      </span>
                    </span>
                  ) : pct(r.model), "right", { color: "var(--text-2)" })}
                  {cell(<span style={{ fontWeight: 800, color: r.grade === "SUSPECT" ? "var(--text-2)" : "var(--edge-glow)" }}>+{(r.edge * 100).toFixed(1)}</span>, "right")}
                  {cell(<span style={{ color: r.dispersion == null ? "var(--text-2)" : r.dispersion <= 0.10 ? "var(--pos)" : "var(--warn)" }}>
                    {r.dispersion == null ? "—" : "±" + (r.dispersion * 100).toFixed(0)}</span>, "right")}
                  {cell(<span>{money(r.stake)}{r.capped && <span style={{ color: "var(--warn)" }} title="capped by resting depth"> ▲</span>}</span>, "right")}
                  {cell(<span style={{ color: r.grade === "SUSPECT" ? "var(--text-2)" : "var(--pos)", fontWeight: 700 }}>{money(r.ev)}</span>, "right")}
                  {cell(<span style={{ fontSize: 10, color: "var(--text-2)", whiteSpace: "normal", display: "block", maxWidth: 300 }}>{(r.why || []).join(" · ")}</span>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ ...mono, fontSize: 10.5, color: "var(--text-2)", padding: "9px 12px", lineHeight: 1.65, borderTop: "1px solid var(--border-dim)" }}>
            <div onClick={() => setShowMethod(!showMethod)} style={{ cursor: "pointer", color: "var(--text-2)" }}>
              {showMethod ? "▾" : "▸"} how this is ranked, what the verdicts mean, and what the model cannot do
            </div>
            {showMethod && (
              <div style={{ marginTop: 5 }}>
                <div>{MTC.claim("edgebook.method").text}</div>
                <div style={{ marginTop: 5 }}>{MTC.claim("edgebook.verdict").text}</div>
                <div style={{ marginTop: 5, color: "var(--warn)" }}>{MTC.claim("edgebook.limits").text}</div>
                <div style={{ marginTop: 5 }}>{cov.text}</div>
              </div>
            )}
            {(book.overflow.length > 0 || book.alsoInLadder.length > 0) && (
              <div style={{ marginTop: 6 }}>
                <BT variant="preset" mono onClick={() => setShowAll(!showAll)}>{showAll ? "TOP 6" : "SHOW ALL " + (book.rows.length + book.overflow.length)}</BT>
                <span style={{ marginLeft: 8 }}>
                  {book.alsoInLadder.length} further rung{book.alsoInLadder.length === 1 ? "" : "s"} on ladders already listed — the same view, not a second bet
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </P>
  );
}

/* ---- Term structure: strike ladder vs climatology (the "yield curve") ----
   Market-implied probability and the HURDAT2 baseline plotted against strike, with
   the gap between them shaded. Rich = market above climatology, cheap = below. */
function MT_YieldCurve({ dense }) {
  // Group by SERIES ticker (KXHURCTOTMAJ-26DEC01-T3 → KXHURCTOTMAJ-26DEC01). Grouping
  // by prose label merged distinct series that share strike values, which produced a
  // zig-zag curve instead of a monotone ladder.
  const groups = {};
  (MT.contracts || []).forEach((c) => {
    if (c.horizon !== "seasonal" || c.strike == null || c.model == null) return;
    const key = String(c.id).replace(/-T\d+$/i, "");
    (groups[key] = groups[key] || []).push(c);
  });
  const series = Object.entries(groups)
    .map(([k, arr]) => {
      const byStrike = new Map();                       // one contract per strike
      arr.forEach((c) => {
        const prev = byStrike.get(c.strike);
        if (!prev || (c.volume || 0) > (prev.volume || 0)) byStrike.set(c.strike, c);
      });
      const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
      const name = (rows[0] && rows[0].label || k).replace(/more than\s*\d+\s*/i, "").replace(/\?$/, "").trim();
      return [name, rows];
    })
    .filter(([, arr]) => arr.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 2);

  if (!series.length) {
    return (
      <P title="Term Structure — strike ladder" right={<BG tone="neg">NO LADDER</BG>}
        footer={<PF {...MTC.footer("panel.fairvalue")} source="needs ≥3 anchored strikes in one series" />}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>
          No multi-strike seasonal series with a climatology anchor is currently listed. The curve
          renders as soon as a hurricane-count ladder is quoted.
        </div>
      </P>
    );
  }

  const W = 900, H = dense ? 150 : 168, PADL = 34, PADB = 20, PADT = 12;
  return (
    <P title="Term Structure — market vs climatology" right={<BG tone="special">EDGE SHADED</BG>}
      footer={<PF {...MTC.footer("panel.fairvalue")} />}>
      {series.map(([name, arr]) => {
        const xs = arr.map((c) => c.strike);
        const minX = Math.min(...xs), maxX = Math.max(...xs), spanX = (maxX - minX) || 1;
        const px = (s) => PADL + ((s - minX) / spanX) * (W - PADL - 8);
        const py = (p) => PADT + (1 - Math.max(0, Math.min(1, p))) * (H - PADT - PADB);
        const mkPts = arr.map((c) => [px(c.strike), py(c.market)]);
        const mdPts = arr.map((c) => [px(c.strike), py(c.model)]);
        const band = mkPts.map((p) => p.join(",")).concat(mdPts.slice().reverse().map((p) => p.join(","))).join(" ");
        const line = (pts) => pts.map((p) => p.join(",")).join(" ");
        const avgEdge = arr.reduce((a, c) => a + (c.model - c.market), 0) / arr.length * 100;
        return (
          <div key={name} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: "var(--text-1)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: avgEdge >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {avgEdge >= 0 ? "+" : ""}{avgEdge.toFixed(1)} avg
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMinYMid meet"
              style={{ width: "100%", height: "auto", display: "block" }} aria-label={name + " term structure"}>
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <line x1={PADL} x2={W - 8} y1={py(t)} y2={py(t)} stroke="var(--border-dim)" strokeWidth="1" />
                  <text x={2} y={py(t) + 3} fill="var(--text-2)" style={{ fontSize: 8, fontFamily: "var(--font-mono)" }}>{Math.round(t * 100)}%</text>
                </g>
              ))}
              <polygon points={band} fill={avgEdge >= 0 ? "var(--pos)" : "var(--neg)"} opacity="0.16" />
              <polyline points={line(mdPts)} fill="none" stroke="var(--special)" strokeWidth="1.6" strokeDasharray="4,3" />
              <polyline points={line(mkPts)} fill="none" stroke="var(--accent)" strokeWidth="1.8" />
              {arr.map((c, i) => (
                <g key={c.id}>
                  <circle cx={mkPts[i][0]} cy={mkPts[i][1]} r="2.6" fill="var(--accent)" />
                  <text x={mkPts[i][0]} y={H - 4} textAnchor="middle" fill="var(--text-2)" style={{ fontSize: 8, fontFamily: "var(--font-mono)" }}>{c.strike}</text>
                </g>
              ))}
            </svg>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", flexWrap: "wrap" }}>
        <span><b style={{ color: "var(--accent)" }}>—</b> market</span>
        <span><b style={{ color: "var(--special)" }}>- -</b> conditional posterior</span>
        <span>x-axis = strike (count above)</span>
      </div>
      {/* Posterior layer stack — each conditioning step, and what isn't wired */}
      {(() => {
        const withLayers = series.map(([, arr]) => arr.find((c) => c.modelLayers))[0];
        const layers = withLayers && withLayers.modelLayers;
        if (!layers) return null;
        return (
          <div style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--border-dim)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".5px", color: "var(--text-2)", marginBottom: 5 }}>
              POSTERIOR STACK <span style={{ opacity: .7 }}>(strike &gt;{withLayers.strike})</span>
            </div>
            {(() => {
              // The deciding layer is the last one that actually produced a number —
              // that is the estimate the edge is computed from, so it gets the callout.
              const live = layers.filter((l) => !l.unavailable && l.p != null);
              const gov = live[live.length - 1];
              return (
                <React.Fragment>
                  {layers.map((l, i) => {
                    const isGov = gov && l.id === gov.id;
                    return (
                      <div key={l.id} title={l.basis || ""} style={{ display: "flex", alignItems: "baseline", gap: 7, fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.65 }}>
                        <span style={{ color: "var(--text-2)", minWidth: 12 }}>{i === 0 ? "" : "↓"}</span>
                        <span style={{ color: l.unavailable ? "var(--text-2)" : "var(--text-1)", minWidth: 148,
                          fontWeight: isGov ? 700 : 400,
                          textDecoration: l.unavailable ? "line-through" : "none" }}>{l.label}</span>
                        {l.unavailable
                          ? <span style={{ color: "var(--neg)", fontWeight: 700, fontSize: 9.5 }}>NO FEED</span>
                          : <span style={{ color: "var(--special)", fontWeight: 700 }}>{Math.round(l.p * 100)}%</span>}
                        {isGov && <span style={{ color: "var(--text-2)", fontSize: 9.5, letterSpacing: ".5px" }}>← USED</span>}
                      </div>
                    );
                  })}
                  {gov && gov.basis && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 6, lineHeight: 1.5 }}>
                      {gov.label}: {gov.basis}
                    </div>
                  )}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5, opacity: .85 }}>
                    Unwired layers are declared, never folded in silently. Day-of-year conditioning still
                    assumes zero Atlantic hurricanes so far this season — that becomes a real input once an
                    in-season count feed is wired.
                  </div>
                </React.Fragment>
              );
            })()}
          </div>
        );
      })()}
    </P>
  );
}


/* ---- ATTENTION — the work queue -------------------------------------------
   Replaces the scrolling register as the primary object. The register said "here
   is everything that happened"; this says "here is what requires you, in order".
   The full register is still one click away under Verify — nothing is hidden,
   it is just no longer competing for the top of the screen. */
const PRIO_STYLE = {
  HIGH:   { c: "var(--neg)", label: "HIGH" },
  MEDIUM: { c: "var(--warn)",      label: "MEDIUM" },
  LOW:    { c: "var(--text-2)",    label: "LOW" },
};
const KIND_ICON = { intensity: "◆", pressure: "▼", market: "▮", advisory: "✦", divergence: "⚠", schedule: "◷", feed: "○", pipeline: "◌", genesis: "◉" };

/* Operator marks. The terminal cannot observe whether a human has acknowledged an
   item or checked their exposure, so it does not pretend to derive it: these are
   asserted by the operator, stored in this browser, and labelled as such. They are
   kept visually and structurally apart from the machine-derived lifecycle. */
const MARKS_KEY = "mt.marks.v1";
function loadMarks() {
  try { return JSON.parse(localStorage.getItem(MARKS_KEY) || "{}"); } catch (e) { return {}; }
}
function saveMarks(m) {
  try { localStorage.setItem(MARKS_KEY, JSON.stringify(m)); } catch (e) { /* private mode — marks just don't persist */ }
}

const LC_LABEL = { observed: "OBSERVED", validated: "VALIDATED", assessed: "ASSESSED", resolved: "RESOLVED", archived: "ARCHIVED" };
function LifecycleRail({ lc }) {
  if (!lc) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 9.5 }}>
      {MTX.LIFECYCLE.map((k, i) => {
        const v = lc[k];
        const na = v === "n/a";
        const on = v === true;
        return (
          <span key={k} title={(lc.why && lc.why[k]) || ""} style={{ display: "inline-flex", alignItems: "center", gap: 4,
            color: na ? "var(--text-2)" : on ? "var(--pos)" : "var(--text-2)", opacity: na ? .45 : 1 }}>
            {i > 0 && <span style={{ opacity: .4, marginRight: 2 }}>›</span>}
            <span>{na ? "–" : on ? "\u2713" : "\u25a1"}</span>
            <span style={{ letterSpacing: ".3px" }}>{LC_LABEL[k]}</span>
          </span>
        );
      })}
    </div>
  );
}

function MT_Attention({ dense, imagery, onSeek, onSelectContract }) {
  const [minPrio, setMinPrio] = React.useState("LOW");
  const [marks, setMarks] = React.useState(loadMarks);
  const [openId, setOpenId] = React.useState(null);
  const toggleMark = (id, field) => setMarks((m) => {
    const cur = Object.assign({}, m[id]);
    if (cur[field]) delete cur[field]; else cur[field] = new Date().toISOString();
    const next = Object.assign({}, m, { [id]: cur });
    saveMarks(next);
    return next;
  });
  const imageryAgeMin = imagery && imagery.ageMin != null ? imagery.ageMin : null;
  const a = MTX.attention ? MTX.attention({ windowMin: 360, imageryAgeMin, imageryProduct: imagery && imagery.product }) : null;
  if (!a) return null;
  const order = ["HIGH", "MEDIUM", "LOW"];
  const cutoff = order.indexOf(minPrio);
  const shown = order.slice(0, cutoff + 1);
  const total = a.items.length;
  const counts = order.map((p) => a.byPriority[p].length);

  const chip = (p, n) => (
    <span key={p} onClick={() => setMinPrio(p)} title={"Show " + p + " and above"}
      style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".4px",
        padding: "3px 8px", borderRadius: 5,
        border: "1px solid " + (minPrio === p ? PRIO_STYLE[p].c : "var(--border-dim)"),
        color: minPrio === p ? PRIO_STYLE[p].c : "var(--text-2)",
        background: minPrio === p ? "color-mix(in srgb," + PRIO_STYLE[p].c + " 12%,transparent)" : "transparent" }}>
      {p} {n}
    </span>
  );

  return (
    <P pad={false} title="Attention"
      right={<div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", letterSpacing: ".4px" }}>SHOW DOWN TO</span>
        {order.map((p, i) => chip(p, counts[i]))}</div>}
      footer={<PF {...MTC.footer("panel.attention")} />}>
      {!total && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-2)", padding: "18px 14px", lineHeight: 1.7 }}>
          [ NOTHING REQUIRES ATTENTION ]<br />
          Every feed re-read identical values across the last 6 hours and all core feeds are live.
          Nothing to action — which is itself the answer.
        </div>
      )}
      {shown.map((p) => {
        const rows = a.byPriority[p];
        if (!rows.length) return null;
        const st = PRIO_STYLE[p];
        return (
          <div key={p}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: dense ? "7px 13px 4px" : "9px 14px 5px",
              borderTop: "1px solid var(--border-dim)", background: "var(--surface-sunken)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.c }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: st.c }}>{st.label}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>{rows.length}</span>
            </div>
            {rows.map((it) => {
              const mk = marks[it.id] || {};
              const open = openId === it.id;
              const done = MTX.LIFECYCLE.filter((k) => it.lifecycle && it.lifecycle[k] === true).length;
              return (
              <div key={it.id} style={{ borderTop: "1px solid var(--border-dim)" }}>
                <div
                  onClick={() => { setOpenId(open ? null : it.id); if (it.seekTs && onSeek) onSeek(it.seekTs); if (it.contractId && onSelectContract) onSelectContract(it.contractId); }}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: dense ? "7px 14px" : "9px 15px", cursor: "pointer" }}>
                  <span style={{ color: st.c, fontSize: 12, lineHeight: 1.35, width: 12, flex: "none" }}>{KIND_ICON[it.kind] || "•"}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: dense ? 12.5 : 13.5, color: "var(--text-1)", lineHeight: 1.4, fontWeight: 600 }}>{it.title}</div>
                    <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>
                      {it.ageMin != null && <span>{it.ageMin < 60 ? it.ageMin + "m ago" : Math.floor(it.ageMin / 60) + "h" + ("0" + (it.ageMin % 60)).slice(-2) + "m ago"}</span>}
                      {it.source && <span>{it.source}</span>}
                      {it.confidence != null && <span>conf {Math.round(it.confidence * 100)}%</span>}
                      {it.lifecycle && <span style={{ color: done >= 3 ? "var(--pos)" : "var(--text-2)" }}>{done}/5 state{done === 1 ? "" : "s"}</span>}
                      {mk.ack && <span style={{ color: "var(--accent)" }}>ACK</span>}
                      {mk.reviewed && <span style={{ color: "var(--accent)" }}>REVIEWED</span>}
                      {it.detail && <span style={{ opacity: .85 }}>· {it.detail}</span>}
                    </div>
                    {open && <LifecycleRail lc={it.lifecycle} />}
                    {open && it.waitingOn && (
                      <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", lineHeight: 1.6 }}>
                        <div>WAITING ON <b style={{ color: "var(--text-1)" }}>{it.waitingOn}</b></div>
                        {it.nextAutomatic && <div>NEXT AUTOMATIC ACTION <span style={{ color: "var(--text-1)" }}>{it.nextAutomatic}</span></div>}
                      </div>
                    )}
                    {open && (
                      <div style={{ marginTop: 7, paddingTop: 6, borderTop: "1px dashed var(--border-dim)", display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", letterSpacing: ".3px" }}>YOUR MARKS — this browser only, not observed by the system</span>
                        {[["ack", "ACKNOWLEDGED"], ["reviewed", "EXPOSURE REVIEWED"]].map(([f, lab]) => (
                          <span key={f} onClick={(ev) => { ev.stopPropagation(); toggleMark(it.id, f); }}
                            title={mk[f] ? "marked " + String(mk[f]).slice(11, 16) + "Z — click to clear" : "click to mark"}
                            style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                              border: "1px solid " + (mk[f] ? "var(--accent)" : "var(--border-dim)"), color: mk[f] ? "var(--accent)" : "var(--text-2)" }}>
                            {mk[f] ? "\u2713 " : "\u25a1 "}{lab}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );})}
          </div>
        );
      })}
      {total > 0 && cutoff < 2 && (
        <div onClick={() => setMinPrio("LOW")} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--text-2)", padding: "8px 14px", borderTop: "1px solid var(--border-dim)" }}>
          + {a.items.length - shown.reduce((n, p) => n + a.byPriority[p].length, 0)} lower-priority item(s) — show all
        </div>
      )}
    </P>
  );
}

/* ---- BOARD IMPACT — "does this touch what I would trade?" -------------------
   Deliberately board-level. No position feed is wired, so a portfolio answer would
   have to be invented; the panel says that outright rather than implying coverage
   it does not have. */
function MT_Exposure({ frame, dense, onSelect, selection }) {
  const x = MTX.exposure ? MTX.exposure(360) : null;
  if (!x) return null;
  const pad = dense ? "5px 9px" : "7px 11px";
  return (
    <P pad={false} title="Board Impact" right={<BG tone={x.repriced ? "live" : "neutral"} dot={!!x.repriced}>{x.repriced} REPRICED</BG>}
      footer={<PF {...MTC.footer("panel.exposure")} />}>
      <div style={{ display: "flex", gap: 1, background: "var(--border-dim)", flexWrap: "wrap" }}>
        {[
          { k: "REPRICED", v: x.repriced, sub: "in 6h" },
          { k: "EDGE WIDENED", v: x.widened, sub: "vs anchor", tone: x.widened ? "var(--pos)" : null },
          { k: "EDGE NARROWED", v: x.narrowed, sub: "vs anchor", tone: x.narrowed ? "var(--neg)" : null },
          { k: "NO ANCHOR", v: x.unanchored, sub: "not priceable" },
        ].map((m) => (
          <div key={m.k} style={{ flex: "1 1 92px", minWidth: 0, background: "var(--surface-card)", padding: "8px 11px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".6px", color: "var(--text-2)" }}>{m.k}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800, lineHeight: 1.15, marginTop: 2, color: m.tone || "var(--text-1)" }}>{m.v}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>{m.sub}</div>
          </div>
        ))}
      </div>
      {x.rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: dense ? 11 : 12 }}>
          <thead><tr>{["Contract", "Move", "Price", "Anchor", "Edge"].map((h) => (
            <th key={h} style={{ textAlign: h === "Contract" ? "left" : "right", color: "var(--text-2)", fontWeight: 600,
              fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{h}</th>
          ))}</tr></thead>
          <tbody>{x.rows.slice(0, 6).map((r) => (
            <tr key={r.id} onClick={() => onSelect && onSelect(r.id)}
              style={{ cursor: "pointer", background: selection && selection.contract === r.id ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent" }}>
              <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", color: "var(--text-1)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</td>
              <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                color: r.net > 0 ? "var(--pos)" : "var(--neg)" }}>{r.net > 0 ? "+" : ""}{r.net.toFixed(1)}¢</td>
              <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-1)" }}>{r.price != null ? Math.round(r.price * 100) + "¢" : "—"}</td>
              <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.model != null ? Math.round(r.model * 100) + "%" : "—"}</td>
              <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                color: r.edge == null ? "var(--text-2)" : r.edge > 0 ? "var(--pos)" : "var(--neg)" }}>{r.edge == null ? "—" : (r.edge > 0 ? "+" : "") + r.edge.toFixed(0) + "pt"}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", padding: "8px 12px", lineHeight: 1.55 }}>
        No position feed is wired, so this is <b style={{ color: "var(--text-1)" }}>board level, not portfolio level</b> — it says what moved and
        where the spread to the climatology anchor changed, not what you hold. Anchor is a climatology baseline, not a skill forecast.
      </div>
    </P>
  );
}

/* ---- Prediction Markets board ---- */
// Price trend from the REAL committed history (nulls = not yet listed, skipped).
function MT_spark(vals, w, h, color) {
  const pts0 = (vals || []).map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts0.length < 2) return null;
  const n = vals.length - 1 || 1;
  const ys = pts0.map(([, v]) => v);
  let mn = Math.min(...ys), mx = Math.max(...ys);
  if (mx - mn < 0.02) { const mid = (mx + mn) / 2; mn = mid - 0.01; mx = mid + 0.01; } // flat-line guard
  const r = mx - mn;
  const P = pts0.map(([i, v]) => [((i / n) * w), (h - ((v - mn) / r) * h)]);
  const area = `${P[0][0].toFixed(1)},${h} ` + P.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ") + ` ${P[P.length - 1][0].toFixed(1)},${h}`;
  const last = P[P.length - 1];
  return (
    <svg width={w} height={h} style={{ display: "block", marginLeft: "auto", overflow: "visible" }} aria-hidden="true">
      <polygon points={area} fill={color} opacity="0.14" />
      <polyline points={P.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ")}
        fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="1.7" fill={color} />
    </svg>
  );
}
function fmtVol(v) { return v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : "$" + Math.round(v / 1e3) + "k"; }

function MT_Markets({ frame, selection, onSelect, dense }) {
  const pad = dense ? "5px 8px" : "7px 10px";
  const rows = MT.contracts.map((c) => {
    const px = MTX.mkt(c, frame), model = MTX.mdl(c, frame);
    const prev = MTX.mkt(c, Math.max(0, frame - 3));
    const edge = (model != null && px != null) ? (model - px) * 100 : null;
    const d = (px != null && prev != null) ? (px - prev) * 100 : 0;
    return { c, px, model, edge, d, hist: (c.histSeries && c.histSeries.length ? c.histSeries : MTX.priceHist(c, frame, 12)) };
  });
  /* One row per rung, grouped under the question it belongs to. Series with an
     active-storm or anchored rung float to the top; within a series, strike order. */
  const grouped = (() => {
    const bySeries = new Map();
    rows.forEach((r) => {
      const key = String(r.c.id).replace(/-[^-]*$/, "");
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key).push(r);
    });
    const groups = [...bySeries.entries()].map(([series, rs]) => {
      rs.sort((a, b) => (a.c.strike ?? 999) - (b.c.strike ?? 999));
      const lead = rs.find((r) => r.c.storm) || rs.find((r) => r.model != null) || rs[0];
      return { series, rs, label: String(lead.c.label || lead.c.short || series).replace(/\?$/, ""),
        rank: (rs.some((r) => r.c.storm) ? 0 : rs.some((r) => r.model != null) ? 1 : 2),
        vol: rs.reduce((s, r) => s + (r.c.volume || 0), 0) };
    });
    groups.sort((a, b) => a.rank - b.rank || b.vol - a.vol);
    const out = [];
    groups.forEach((g) => { out.push({ groupHead: { series: g.series, label: g.label, n: g.rs.length } }); out.push(...g.rs); });
    return out;
  })();
  const mktSource = (MT._feeds && MT._feeds.markets && MT._feeds.markets.source) || "market";
  const spanH = (() => {
    const fr = MT._frames || [];
    if (fr.length < 2) return null;
    const a = Date.parse(fr[0].tsZ), b = Date.parse(fr[fr.length - 1].tsZ);
    return (a && b) ? Math.round((b - a) / 3600000) : null;
  })();
  const tvol = rows.reduce((a, r) => a + r.c.volume, 0);
  const th = (h, right) => (
    <th key={h} style={{ textAlign: right ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".5px", padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{h}</th>
  );
  const cell = { padding: pad, borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font-mono)", textAlign: "right" };
  return (
    <P pad={false} title={"Prediction Markets — " + (mktSource[0].toUpperCase() + mktSource.slice(1)) + " board"} right={<BG tone={rows.length ? "live" : "neg"} dot>{rows.length} MKTS</BG>}
      footer={<PF {...MTC.footer("panel.markets")} />}>
      {/* Grouped by series and capped. Every listed market is now carried, and a flat
          147-row list ordered by volume interleaves ladders from different questions —
          which is precisely the layout that makes an operator slower. Rungs of one
          question stay together, in strike order, the way the exchange presents them. */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: dense ? 460 : 560 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: dense ? 11 : 12 }}>
          <thead><tr>{th("Contract")}{th("Px", 1)}{th("Δ", 1)}{th("Model", 1)}{th("Edge", 1)}{th("OI", 1)}{th("4h", 1)}</tr></thead>
          <tbody>{grouped.map(({ c, px, model, edge, d, hist, groupHead }) => {
            if (groupHead) return (
              <tr key={"g:" + groupHead.series}>
                <td colSpan={7} style={{ padding: dense ? "5px 9px" : "7px 11px", background: "var(--surface-sunken)",
                  borderBottom: "1px solid var(--border-dim)", borderTop: "1px solid var(--border-dim)",
                  fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".5px", color: "var(--text-2)" }}>
                  <b style={{ color: "var(--text-1)" }}>{groupHead.label}</b> · {groupHead.n} strike{groupHead.n === 1 ? "" : "s"} · {groupHead.series}
                </td>
              </tr>
            );
            return ((({ c, px, model, edge, d, hist }) => {
            const on = selection.contract === c.id;
            const eStyle = edge == null ? { color: "var(--text-2)" } : edge >= 15 ? { color: "var(--edge-glow)", textShadow: "var(--glow-edge)" } : edge > 0 ? { color: "var(--pos)" } : { color: "var(--text-2)" };
            return (
              <tr key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: "pointer", background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent" }}>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)" }}>
                  <div style={{ color: "var(--text-1)", fontWeight: 600, fontSize: dense ? 11 : 11.5 }}>{c.short}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    {c.horizon && <span style={{ color: c.horizon === "seasonal" ? "var(--special)" : "var(--accent)", fontWeight: 700, letterSpacing: ".4px" }}>{c.horizon === "seasonal" ? "SEASONAL" : "STORM"}</span>}
                    {c.subject && !c.subject.active && (
                      <span title={c.subject.subject + " is not in NHC CurrentStorms.json this cycle"}
                        style={{ color: "var(--warn)", fontWeight: 700, letterSpacing: ".3px", border: "1px solid var(--warn)", borderRadius: 4, padding: "0 4px" }}>
                        {MTC.claim("contract.subjectInactive").text.toUpperCase()}
                      </span>
                    )}
                    <span>{c.id}</span>{c.proxy ? <span>· proxy</span> : null}
                  </div>
                </td>
                <td style={{ ...cell, color: "var(--text-1)", fontWeight: 700 }}>{px != null ? Math.round(px * 100) + "¢" : "—"}</td>
                <td style={{ ...cell, color: d >= 0 ? "var(--pos)" : "var(--neg)" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</td>
                <td style={{ ...cell, color: model != null ? "var(--special)" : "var(--text-2)" }}
                    title={c.modelBasis ? "Climatology baseline — " + c.modelBasis : "No fair-value anchor for this contract"}>{model != null ? Math.round(model * 100) + "%" : "—"}</td>
                <td style={{ ...cell, fontWeight: 800, ...eStyle }}>{edge == null ? "—" : (edge >= 0 ? "+" : "") + edge.toFixed(1)}</td>
                <td style={{ ...cell, color: "var(--text-2)", fontSize: 10 }}
                    title={"lifetime volume " + fmtVol(c.volume) + (c.volume24h != null ? " · 24h " + fmtVol(c.volume24h) : "") + (c.openInterest != null ? " · open interest " + fmtVol(c.openInterest) : "")}>
                  {c.openInterest != null ? fmtVol(c.openInterest) : fmtVol(c.volume)}</td>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{MT_spark(hist, 64, 18, edge == null ? "var(--accent)" : edge > 0 ? "var(--pos)" : "var(--neg)")}</td>
              </tr>
            );
            })({ c, px, model, edge, d, hist }));
          })}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", padding: "6px 10px", flexWrap: "wrap" }}>
        <span>Click a market → order book + allocation.</span><span>Σ vol {fmtVol(tvol)}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", padding: "0 10px 8px", lineHeight: 1.5, opacity: .85 }}>
        Prices are Kalshi's exchange book — the same contracts surfaced in Coinbase Predictions (Kalshi-powered), so quotes here should track what you see there.<br />
        {MTC.claim("model.caveat").text}
      </div>
    </P>
  );
}

/* ---- Order Book & Liquidity (per selected contract, live) ---- */
function MT_OrderBook({ contractId, frame, dense }) {
  const c = MT.contracts.find((x) => x.id === contractId) || MT.contracts[0];
  const ob = c ? MTX.orderBookFor(c, frame) : { noFeed: true };
  if (ob.noFeed) {
    return (
      <P pad={false} title="Order Book & Liquidity" right={<BG tone="warn">UNAVAILABLE</BG>}
        footer={<PF {...MTC.footer("panel.orderbook")} />}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.75, padding: "14px 12px" }}>
          <div style={{ color: "var(--text-1)", fontWeight: 700, letterSpacing: ".5px" }}>KELLY SIZING — UNAVAILABLE</div>
          <div style={{ marginTop: 8 }}>Reason:</div>
          <div style={{ paddingLeft: 10, color: "var(--text-1)" }}>
            {c ? <>Exchange returned no order-book depth for <b>{c.short}</b>{ob.mid != null ? " (mid " + Math.round(ob.mid * 100) + "¢)" : ""}.</> : "No contract selected."}
          </div>
          <div style={{ marginTop: 8 }}>Required to size a position:</div>
          <div style={{ paddingLeft: 10 }}>
            <div>· bid <span style={{ color: "var(--neg)" }}>missing</span></div>
            <div>· ask <span style={{ color: "var(--neg)" }}>missing</span></div>
            <div>· executable size <span style={{ color: "var(--neg)" }}>missing</span></div>
          </div>
          <div style={{ marginTop: 8 }}>Status: <span style={{ color: "var(--warn)" }}>awaiting liquidity feed</span></div>
          <div style={{ marginTop: 8, opacity: .8 }}>
            Allocation stays uncapped rather than sized against a synthesized book — a liquidity
            cap invented from volume would understate real slippage.
          </div>
        </div>
      </P>
    );
  }
  if (ob.topOfBook) {
    /* One level per side is what the market list actually gives us. Showing it beats
       "UNAVAILABLE" — it is the size a taker can fill right now — but it is labelled
       top-of-book so nobody reads it as a depth curve. */
    const px = ob.mid != null ? Math.round(ob.mid * 100) : null;
    const cell = (k, v, sub, tone) => (
      <div key={k} style={{ flex: "1 1 120px", minWidth: 0, background: "var(--surface-card)", padding: "9px 12px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".6px", color: "var(--text-2)" }}>{k}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 800, marginTop: 2, color: tone || "var(--text-1)" }}>{v}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>{sub}</div>
      </div>
    );
    return (
      <P pad={false} title="Order Book & Liquidity" right={<BG tone="warn">TOP OF BOOK</BG>}
        footer={<PF {...MTC.footer("panel.orderbook")} />}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", padding: "8px 12px" }}>{c.short}</div>
        <div style={{ display: "flex", gap: 1, background: "var(--border-dim)", flexWrap: "wrap" }}>
          {cell("BID SIZE", Math.round(ob.bidSize), "contracts resting", "var(--pos)")}
          {cell("ASK SIZE", Math.round(ob.askSize), "contracts resting", "var(--neg)")}
          {cell("MID", px != null ? px + "¢" : "—", ob.spread != null ? "spread " + Math.round(ob.spread * 100) + "¢" : "—")}
          {cell("FILLABLE NOW", ob.liquidityCap != null ? "$" + ob.liquidityCap.toLocaleString() : "—", "ask size × price")}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", padding: "9px 12px", lineHeight: 1.55 }}>
          One level per side — the size the exchange will fill at the touch, not a depth curve.
          The full book is fetched for a handful of contracts only; everything else shows the touch.
          FILLABLE NOW is what caps the Kelly allocation.
        </div>
      </P>
    );
  }
  const maxDepth = Math.max(...ob.asks.map((a) => a[1]), ...ob.bids.map((b) => b[1]), 1);
  const row = (p, d, tone, capped) => (
    <div key={tone + p} style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", padding: dense ? "3px 10px" : "5px 11px", fontFamily: "var(--font-mono)", fontSize: 11, borderBottom: "1px solid var(--border-dim)" }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: (d / maxDepth * 58) + "%", background: `color-mix(in srgb, ${tone} 14%, transparent)` }} />
      {capped && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 2, background: "var(--neg)", boxShadow: "0 0 6px 1px var(--neg)", zIndex: 2 }} />}
      <span style={{ color: tone, fontWeight: 700, zIndex: 1 }}>{Math.round(p * 100)}¢</span>
      <span style={{ color: capped ? "var(--warn)" : "var(--text-1)", zIndex: 1 }}>${d.toLocaleString()}</span>
    </div>
  );
  let cum = 0;
  return (
    <P pad={false} title="Order Book & Liquidity" right={<BG tone="live" dot>LIVE ${Math.round(ob.liquidityCap / 1000)}k</BG>}
      footer={<PF {...MTC.footer("panel.orderbook")} />}>
      <div style={{ padding: "6px 11px", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{c.short}</span><span>{c.id} · slippage {ob.slippageBudget}</span>
      </div>
      {ob.asks.slice().reverse().map((a) => row(a[0], a[1], "var(--neg)"))}
      <div style={{ padding: "4px 11px", background: "var(--surface-sunken)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", display: "flex", justifyContent: "space-between" }}>
        <span>spread {Math.round((ob.bestAsk - ob.bestBid) * 100)}¢</span><span>mid {Math.round(ob.mid * 100)}¢</span>
      </div>
      {ob.bids.map((b) => { cum += b[1]; return row(b[0], b[1], "var(--pos)", cum > ob.liquidityCap); })}
      <div style={{ padding: "8px 11px", fontSize: 10.5, color: "var(--text-2)", lineHeight: 1.5, borderTop: "1px solid var(--border-dim)" }}>
        Cumulative depth beyond <b style={{ color: "var(--warn)" }}>${ob.liquidityCap.toLocaleString()}</b> exceeds the {ob.slippageBudget} slippage budget — the red threshold marks where liquidity caps the Kelly allocation.
      </div>
    </P>
  );
}

/* ---- Signal Engine — what changed, and what it moved alongside ---- */
const SIG_META = {
  intensity: { icon: "◈", label: "INTENSITY" },
  pressure: { icon: "▼", label: "PRESSURE" },
  market: { icon: "◧", label: "MARKET" },
  advisory: { icon: "✦", label: "ADVISORY" },
};
const CLASS_STYLE = {
  "trade-relevant": { c: "var(--edge-glow)", t: "TRADE-RELEVANT" },
  material: { c: "var(--warn)", t: "MATERIAL" },
  cosmetic: { c: "var(--text-2)", t: "COSMETIC" },
};
function MT_Signals({ stormId, dense, maxH, onSeek }) {
  const [scope, setScope] = React.useState("all");
  const [minClass, setMinClass] = React.useState("material");
  const [showSuperseded, setShowSuperseded] = React.useState(false);
  const [along, setAlong] = React.useState(() => new Set());
  const toggleAlong = (i) => setAlong((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const WINDOW = 360; // 6h — "what has changed today", not just this render
  const summary = MTX.signalSummary ? MTX.signalSummary(WINDOW) : null;
  const all = (MTX.signals ? MTX.signals({ windowMin: 180, sinceMin: WINDOW, minClass }) : []);
  const sigs = all
    .filter((s) => showSuperseded || s.status === "active")
    .filter((s) => scope === "all" || (scope === "storm" ? s.stormId === stormId || s.kind === "advisory" : s.kind === "market"));
  const shown = sigs.slice(0, dense ? 10 : 14);
  const tone = (s) => {
    if (s.kind === "advisory") return "var(--accent)";
    const up = s.inverted ? s.delta < 0 : s.delta > 0;
    return up ? "var(--pos)" : "var(--neg)";
  };
  const btn = (id, txt) => (
    <span onClick={() => setScope(id)} style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10,
      fontWeight: 700, letterSpacing: ".4px", padding: "2px 7px", borderRadius: 5,
      border: "1px solid " + (scope === id ? "var(--accent)" : "var(--border-dim)"),
      color: scope === id ? "var(--accent)" : "var(--text-2)" }}>{txt}</span>
  );
  return (
    <P pad={false} title="Signal Register"
      right={<div style={{ display: "flex", gap: 4 }}>{btn("all", "ALL")}{btn("storm", "STORM")}{btn("market", "MKT")}</div>}
      footer={<PF {...MTC.footer("panel.register")} />}>
      {/* Rollup verdict — answers "has anything mattered in the last 6h?" first */}
      {summary && (
        <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", letterSpacing: ".5px" }}>LAST 6H</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800,
              color: (CLASS_STYLE[summary.verdict.toLowerCase()] || {}).c || "var(--text-2)" }}>{summary.verdict}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
              {summary.total} event{summary.total === 1 ? "" : "s"} · {summary.active} active
            </span>
          </div>
          <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap", alignItems: "center" }}>
            {["cosmetic", "material", "trade-relevant"].map((k) => {
              const st = CLASS_STYLE[k], on = minClass === k;
              return (
                <span key={k} onClick={() => setMinClass(k)} title={"Show " + st.t + " and above"} style={{
                  cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, letterSpacing: ".4px",
                  padding: "3px 7px", borderRadius: 5, border: "1px solid " + (on ? st.c : "var(--border-dim)"),
                  color: on ? st.c : "var(--text-2)", background: on ? `color-mix(in srgb, ${st.c} 12%, transparent)` : "transparent",
                }}>{st.t} {summary.byClass[k] || 0}</span>
              );
            })}
            <span onClick={() => setShowSuperseded(!showSuperseded)} title="Superseded events are retained — this is the register's memory"
              style={{ marginLeft: "auto", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700,
                letterSpacing: ".4px", padding: "3px 7px", borderRadius: 5,
                border: "1px solid " + (showSuperseded ? "var(--accent)" : "var(--border-dim)"),
                color: showSuperseded ? "var(--accent)" : "var(--text-2)" }}>
              {showSuperseded ? "HIDE HISTORY" : "SHOW HISTORY"}
            </span>
          </div>
        </div>
      )}
      {!shown.length && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", padding: "14px 12px", lineHeight: 1.6 }}>
          [ NO CHANGE ]<br />Every feed re-read identical values across this window at the selected threshold. Nothing to report — which is itself the signal.
        </div>
      )}
      {/* Capped + scrolled: an uncapped register grew to ~2x the command block next to
          it, leaving a dead column of whitespace. The list scrolls in place instead. */}
      <div style={{ maxHeight: maxH || (dense ? 360 : 440), overflowY: "auto", minHeight: 0 }}>
      {shown.map((s, i) => {
        const m = SIG_META[s.kind] || { icon: "•", label: s.kind.toUpperCase() };
        const c = tone(s);
        return (
          <div key={i} onClick={() => onSeek && onSeek(s.tsZ)} style={{ display: "flex", gap: 9, alignItems: "flex-start",
            padding: dense ? "6px 11px" : "8px 12px", borderBottom: "1px solid var(--border-dim)", cursor: onSeek ? "pointer" : "default" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", minWidth: 42, paddingTop: 2 }}>
              {String(s.tsZ || "").slice(11, 16)}Z
            </span>
            <span style={{ color: c, fontSize: 12, lineHeight: 1.2, paddingTop: 1 }}>{m.icon}</span>
            <div style={{ minWidth: 0, flex: 1, opacity: s.status === "superseded" ? 0.62 : 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: dense ? 11 : 11.5, color: "var(--text-1)", lineHeight: 1.35 }}>{s.label}</span>
                {s.crossed != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 800, color: "var(--edge-glow)",
                    border: "1px solid var(--edge-glow)", borderRadius: 4, padding: "1px 4px" }}>CROSSED {s.crossed}KT</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <div style={{ position: "relative", height: 3, flex: 1, maxWidth: 90, borderRadius: 2, background: "var(--border-dim)" }}>
                  <div style={{ position: "absolute", inset: 0, width: Math.round(s.magnitude * 100) + "%", background: c, borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>{m.label}{s.detail ? " · " + s.detail : ""}</span>
              </div>
              {/* Register metadata — the terminal's memory of this event */}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>
                <span style={{ color: (CLASS_STYLE[s.class] || {}).c, fontWeight: 700 }}>{(CLASS_STYLE[s.class] || {}).t}</span>
                <span>conf {Math.round((s.confidence || 0) * 100)}%</span>
                <span>{s.novelty}{s.persistence > 1 ? " ×" + s.persistence : ""}</span>
                <span style={{ color: s.status === "active" ? "var(--pos)" : "var(--text-2)" }}>{s.status}</span>
                <span>{s.source}</span>
              </div>
              {s.alongside && s.alongside.length > 0 && (
                <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: "2px solid var(--border-dim)" }}>
                  <div onClick={(ev) => { ev.stopPropagation(); toggleAlong(i); }}
                    style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", letterSpacing: ".3px" }}>
                    {along.has(i) ? "▾" : "▸"} ALONGSIDE {s.alongside.length} · same 3h window · association, not cause
                  </div>
                  {along.has(i) && s.alongside.map((o, j) => (
                    <div key={j} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", lineHeight: 1.4 }}>
                      · {String(o.tsZ || "").slice(11, 16)}Z {o.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
      {shown.length > 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", padding: "7px 11px", lineHeight: 1.5 }}>
          {sigs.length} shown · thresholds: wind ≥5 kt, pressure ≥2 mb, price ≥2¢. TRADE-RELEVANT = Saffir–Simpson
          boundary crossing, ≥20 kt intensification, or ≥5¢ reprice. Co-movement is temporal only — no causal
          weights are computed, because the data can't support them.
        </div>
      )}
    </P>
  );
}

/* ---- Event Ledger (VCR bookmarks) ---- */

/* ---- Observability / Pipeline ---- */
function MT_Observability({ narrow }) {
  const CHIP = { PASS: "var(--pos)", EMPTY: "var(--text-2)", BLOCKED: "var(--special)", FAIL: "var(--neg)" };
  /* Feed rows expand into what the fetch actually reported — status, latency, item
     counts, per-host attempts. These are real telemetry rows being opened up, not new
     indicators invented for feeds we do not ingest. */
  const [open, setOpen] = React.useState(() => new Set());
  const toggle = (n) => setOpen((prev) => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  return (
    <P pad={false} title="Observability — Pipeline Status"
      footer={<PF {...MTC.footer("panel.observability")} />}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", padding: "8px 12px", borderBottom: "1px solid var(--border-dim)", lineHeight: 1.5 }}>
        <div style={{ color: MTC.claim("deploy.verified").ok ? "var(--text-2)" : "var(--warn)" }}>{MTC.claim("deploy.verified").text}</div>
        <div style={{ color: MTC.claim("markets.coverage").ok ? "var(--text-2)" : "var(--warn)" }}>{MTC.claim("markets.coverage").text}</div>
        <div>{MTC.claim("capability.notIngested").text}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 1, padding: 12, background: "var(--border-dim)" }}>
        {MT.pipeline.map((s, i) => (
          <div key={s.stage} style={{ flex: narrow ? "1 1 100%" : "1 1 30%", minWidth: narrow ? 0 : 120, background: "var(--surface-card)", padding: "8px 10px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", letterSpacing: ".5px" }}>{i + 1}. {s.stage.toUpperCase()}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: CHIP[s.status] }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: CHIP[s.status] }}>{s.status}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", marginTop: 3 }}>{s.detail}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 8, padding: 12, alignItems: "start" }}>
        {MT.health.map((h) => {
          const rows = h.diag || [];
          const isOpen = open.has(h.name);
          return (
            <div key={h.name} style={{ minWidth: 0 }}>
              <div onClick={() => rows.length && toggle(h.name)}
                title={rows.length ? "Click for the fetch detail" : "No diagnostic detail reported for this feed"}
                style={{ cursor: rows.length ? "pointer" : "default", position: "relative" }}>
                <HR {...h} />
                {rows.length > 0 && (
                  <span style={{ position: "absolute", right: 8, bottom: 6, fontFamily: "var(--font-mono)",
                    fontSize: 9, color: "var(--text-2)", letterSpacing: ".4px" }}>{isOpen ? "▾ HIDE" : "▸ " + rows.length + " FIELDS"}</span>
                )}
              </div>
              {isOpen && (
                <div style={{ marginTop: 4, padding: "8px 10px", border: "1px solid var(--border-dim)", borderTop: "none",
                  borderRadius: "0 0 8px 8px", background: "var(--surface-sunken)" }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "2px 0",
                      fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.5 }}>
                      <span style={{ color: "var(--text-2)", minWidth: 132, flex: "none",
                        color: /DROPPED/.test(r.k) ? "var(--neg)" : "var(--text-2)" }}>{r.k}</span>
                      <span style={{ color: "var(--text-1)", wordBreak: "break-word", minWidth: 0 }}>{r.v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", opacity: .8 }}>
                    As reported by this cycle's fetch. Fields the feed did not return are omitted rather than filled in.
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </P>
  );
}

Object.assign(window, { MT_Evidence, MT_Confidence, MT_EdgeMatrix, MT_EdgeBook, MT_StormConsoles, MT_Markets, MT_OrderBook, MT_Observability, MT_YieldCurve, MT_Signals, MT_Situation, MT_Section, MT_Attention, MT_Exposure });
