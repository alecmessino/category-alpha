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

/* ---- Evidence Matrix ---- */
function MT_Evidence({ stormId, frame, selection, onSelect, dense }) {
  const S = MT.storms[stormId];
  const pad = dense ? "4px 8px" : "7px 9px";
  return (
    <P pad={false} title="Evidence Matrix" right={<BG tone="live" dot>{MT.evidence.length} SIGNALS</BG>}
      footer={<PF source="canonical.fix()" latency="live" version="1.2.4" tier="A" />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: dense ? 11 : 12 }}>
          <thead><tr>{["Evidence", "Value", "Source", "Tier"].map((h) => (
            <th key={h} style={{ textAlign: "left", color: "var(--text-2)", fontWeight: 600, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".5px", padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{h}</th>
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
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", padding: "6px 10px" }}>Click a row → provenance drill-down. Values re-read at the as-of cursor.</div>
    </P>
  );
}

/* ---- Confidence (evidence-quality) ---- */
function MT_Confidence({ stormId, frame }) {
  const s = MTX.snap(stormId, frame);
  return (
    <P title="Confidence" right={<BG tone={TIER_TONE[s.tier]}>TIER {s.tier}</BG>}
      footer={<PF source="evidence_quality.py" latency="live" version="1.2.4" tier={s.tier} />}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>
        {s.tierReasons.map((r, i) => <div key={i}>· {r}</div>)}
      </div>
      <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--border-dim)", borderLeft: "3px solid var(--special)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>
        Evidence-quality is <b style={{ color: "var(--text-1)" }}>not</b> probability. This tier scores how real/live/sourced the inputs are — a 60% @ B ≠ 60% @ A.
      </div>
    </P>
  );
}

/* ---- Probability (model consensus) ---- */
function MT_Probability({ stormId, frame }) {
  const s = MTX.snap(stormId, frame);
  const models = MT.models || [];
  const hasModel = s.model != null;
  return (
    <P title="Probability — Cat4+" right={<BG tone={hasModel ? "special" : "neg"}>{hasModel ? "ANCHOR ONLY" : "NO MODEL FEED"}</BG>}
      footer={<PF source={hasModel ? "ensemble consensus" : "no ensemble feed wired"} latency={hasModel ? "40m" : "—"} version="—" tier={hasModel ? "B" : "C"} />}>
      {hasModel ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 800, color: "var(--accent)" }}>{Math.round(s.model * 100)}%</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>model anchor · vs mkt {s.market != null ? Math.round(s.market * 100) + "%" : "—"}</span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: "var(--neg)" }}>NO FEED</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" }}>market {s.market != null ? Math.round(s.market * 100) + "%" : "—"}</span>
        </div>
      )}
      {models.map((m) => (
        <div key={m.id} style={{ marginBottom: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", marginBottom: 3 }}>
            <span>{m.label}</span><span style={{ color: "var(--text-1)" }}>{Math.round(m.cat4 * 100)}%</span>
          </div>
          <GG value={m.cat4 * 100} color={m.color} height={5} />
        </div>
      ))}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 8 }}>
        {hasModel ? "Probability shown is an anchor, not a fitted model." : "No public ensemble Cat-probability feed is wired, so no independent probability is shown. Fabricating one would violate the data-honesty standard — market price is live above."}
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
      footer={<PF source={mktSrc + " prices × HURDAT2 climatology baseline"} latency="live" version="—" tier="C" />}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, padding: dense ? 9 : 12 }}>
        {rows.map(({ c, k }) => (
          <div key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: "pointer", borderRadius: 9, outline: selection.contract === c.id ? "1px solid var(--accent)" : "none", outlineOffset: 1 }}>
            {k.noModel || k.noData ? (
              <div style={{ border: "1px solid var(--border-dim)", borderRadius: 9, padding: "10px 11px", height: "100%" }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.25 }}>{c.short}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>MARKET</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>{k.market != null ? Math.round(k.market) + "¢" : "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>KELLY</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--neg)" }}>{k.noData ? "NO PRICE" : "NO MODEL"}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: "var(--text-2)", marginTop: 6, lineHeight: 1.4 }}>{c.liquidity != null ? "liq $" + Math.round(c.liquidity / 1000) + "k · " : ""}edge needs a model anchor</div>
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

/* ---- Term structure: strike ladder vs climatology (the "yield curve") ----
   Market-implied probability and the HURDAT2 baseline plotted against strike, with
   the gap between them shaded. Rich = market above climatology, cheap = below. */
function MT_YieldCurve({ dense }) {
  const groups = {};
  (MT.contracts || []).forEach((c) => {
    if (c.horizon !== "seasonal" || c.strike == null || c.model == null) return;
    const key = c.label.replace(/more than\s*\d+\s*/i, "").replace(/\?$/, "").trim();
    (groups[key] = groups[key] || []).push(c);
  });
  const series = Object.entries(groups)
    .map(([k, arr]) => [k, arr.slice().sort((a, b) => a.strike - b.strike)])
    .filter(([, arr]) => arr.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 2);

  if (!series.length) {
    return (
      <P title="Term Structure — strike ladder" right={<BG tone="neg">NO LADDER</BG>}
        footer={<PF source="needs ≥3 anchored strikes in one series" latency="—" version="—" tier="C" />}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>
          No multi-strike seasonal series with a climatology anchor is currently listed. The curve
          renders as soon as a hurricane-count ladder is quoted.
        </div>
      </P>
    );
  }

  const W = 300, H = dense ? 108 : 128, PADL = 26, PADB = 16, PADT = 8;
  return (
    <P title="Term Structure — market vs climatology" right={<BG tone="special">EDGE SHADED</BG>}
      footer={<PF source="Kalshi ladder × HURDAT2 baseline" latency="live" version="—" tier="C" />}>
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
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} aria-label={name + " term structure"}>
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
      <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", flexWrap: "wrap" }}>
        <span><b style={{ color: "var(--accent)" }}>—</b> market</span>
        <span><b style={{ color: "var(--special)" }}>- -</b> HURDAT2 climatology</span>
        <span>x-axis = strike (count above)</span>
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
  const mktSource = (MT._feeds && MT._feeds.markets && MT._feeds.markets.source) || "market";
  const tvol = rows.reduce((a, r) => a + r.c.volume, 0);
  const th = (h, right) => (
    <th key={h} style={{ textAlign: right ? "right" : "left", color: "var(--text-2)", fontWeight: 600, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".5px", padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{h}</th>
  );
  const cell = { padding: pad, borderBottom: "1px solid var(--border-dim)", fontFamily: "var(--font-mono)", textAlign: "right" };
  return (
    <P pad={false} title={"Prediction Markets — " + (mktSource[0].toUpperCase() + mktSource.slice(1)) + " board"} right={<BG tone={rows.length ? "live" : "neg"} dot>{rows.length} MKTS</BG>}
      footer={<PF source={mktSource + " · live prices · model = HURDAT2 climatology"} latency="live" version="—" tier="C" />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: dense ? 11 : 12 }}>
          <thead><tr>{th("Contract")}{th("Px", 1)}{th("Δ", 1)}{th("Model", 1)}{th("Edge", 1)}{th("Vol", 1)}{th("4h", 1)}</tr></thead>
          <tbody>{rows.map(({ c, px, model, edge, d, hist }) => {
            const on = selection.contract === c.id;
            const eStyle = edge == null ? { color: "var(--text-2)" } : edge >= 15 ? { color: "var(--edge-glow)", textShadow: "var(--glow-edge)" } : edge > 0 ? { color: "var(--pos)" } : { color: "var(--text-2)" };
            return (
              <tr key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: "pointer", background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent" }}>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)" }}>
                  <div style={{ color: "var(--text-1)", fontWeight: 600, fontSize: dense ? 11 : 11.5 }}>{c.short}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    {c.horizon && <span style={{ color: c.horizon === "seasonal" ? "var(--special)" : "var(--accent)", fontWeight: 700, letterSpacing: ".4px" }}>{c.horizon === "seasonal" ? "SEASONAL" : "STORM"}</span>}
                    <span>{c.id}</span>{c.proxy ? <span>· proxy</span> : null}
                  </div>
                </td>
                <td style={{ ...cell, color: "var(--text-1)", fontWeight: 700 }}>{px != null ? Math.round(px * 100) + "¢" : "—"}</td>
                <td style={{ ...cell, color: d >= 0 ? "var(--pos)" : "var(--neg)" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</td>
                <td style={{ ...cell, color: model != null ? "var(--special)" : "var(--text-2)" }}
                    title={c.modelBasis ? "Climatology baseline — " + c.modelBasis : "No fair-value anchor for this contract"}>{model != null ? Math.round(model * 100) + "%" : "—"}</td>
                <td style={{ ...cell, fontWeight: 800, ...eStyle }}>{edge == null ? "—" : (edge >= 0 ? "+" : "") + edge.toFixed(1)}</td>
                <td style={{ ...cell, color: "var(--text-2)", fontSize: 10 }}>{fmtVol(c.volume)}</td>
                <td style={{ padding: pad, borderBottom: "1px solid var(--border-dim)" }}>{MT_spark(hist, 64, 18, edge == null ? "var(--accent)" : edge > 0 ? "var(--pos)" : "var(--neg)")}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", padding: "6px 10px", flexWrap: "wrap" }}>
        <span>Click a market → order book + allocation.</span><span>Σ vol {fmtVol(tvol)}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", padding: "0 10px 8px", lineHeight: 1.5, opacity: .85 }}>
        Prices are Kalshi's exchange book — the same contracts surfaced in Coinbase Predictions (Kalshi-powered), so quotes here should track what you see there.<br />
        MODEL = empirical HURDAT2 season-count climatology, a <b style={{ color: "var(--warn)" }}>baseline</b> — it ignores ENSO, SSTs and season-to-date progress, which the market price already reflects. Treat EDGE as a reference spread, not alpha.
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
      <P pad={false} title="Order Book & Liquidity" right={<BG tone="neg">NO FEED</BG>}
        footer={<PF source="depth not available" latency="—" version="—" tier="C" />}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)", lineHeight: 1.6, padding: "16px 12px" }}>
          {c ? <>Live depth is available only for Kalshi contracts. <b style={{ color: "var(--text-1)" }}>{c.short}</b>{ob.mid != null ? " · mid " + Math.round(ob.mid * 100) + "¢" : ""} has no order-book feed wired — shown as NO FEED rather than a synthesized book.</> : "No contract selected — no order book to display."}
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
      footer={<PF source="Kalshi live depth" latency="live" version="—" tier="C" />}>
      <div style={{ padding: "6px 11px", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", display: "flex", justifyContent: "space-between", gap: 8 }}>
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

/* ---- Event Ledger (VCR bookmarks) ---- */
function MT_Ledger({ frame, onSeek, dense }) {
  return (
    <P pad={false} title="Research Ledger — Event Timeline"
      footer={<PF source="event_store (immutable)" latency="live" version="1.2.4" tier="A" />}>
      <div>{MT.events.slice().reverse().map((ev) => {
        const on = Math.abs(ev.frame - frame) <= 0;
        const near = ev.frame <= frame;
        return (
          <div key={ev.frame} onClick={() => onSeek(ev.frame)} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: dense ? "6px 11px" : "8px 12px", borderBottom: "1px solid var(--border-dim)", cursor: "pointer", background: on ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "transparent", opacity: near ? 1 : 0.45 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)", minWidth: 46, paddingTop: 1 }}>{MTX.frameTime(ev.frame)}</span>
            <span style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 4, flex: "none", background: ev.hot ? "var(--warn)" : near ? "var(--pos)" : "var(--border-strong)" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: "var(--text-1)", lineHeight: 1.3 }}>{ev.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 1 }}>{ev.source} · tier {ev.tier}</div>
            </div>
          </div>
        );
      })}</div>
    </P>
  );
}

/* ---- Observability / Pipeline ---- */
function MT_Observability({ narrow }) {
  const CHIP = { PASS: "var(--pos)", EMPTY: "var(--text-2)", BLOCKED: "var(--special)", FAIL: "var(--neg)" };
  return (
    <P pad={false} title="Observability — Pipeline Status"
      footer={<PF source="verify_stack.py" latency="live" version="1.2.4" tier="A" />}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 1, padding: 12, background: "var(--border-dim)" }}>
        {MT.pipeline.map((s, i) => (
          <div key={s.stage} style={{ flex: narrow ? "1 1 100%" : "1 1 30%", minWidth: narrow ? 0 : 120, background: "var(--surface-card)", padding: "8px 10px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", letterSpacing: ".5px" }}>{i + 1}. {s.stage.toUpperCase()}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: CHIP[s.status] }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: CHIP[s.status] }}>{s.status}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-2)", marginTop: 3 }}>{s.detail}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "1fr 1fr", gap: 8, padding: 12 }}>
        {MT.health.map((h) => <HR key={h.name} {...h} />)}
      </div>
    </P>
  );
}

Object.assign(window, { MT_Evidence, MT_Confidence, MT_Probability, MT_EdgeMatrix, MT_Markets, MT_OrderBook, MT_Ledger, MT_Observability, MT_YieldCurve });
