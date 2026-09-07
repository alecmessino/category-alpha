/* Model guidance — the a-deck envelope, interrogated rather than drawn.
 *
 * Two components. MT_Guidance is the full panel: the five disagreement metrics as previous →
 * current → delta, the lead table, the intensity fan, the members, and the feed-health row.
 * MT_GuidanceStrip is the five metrics alone, for the map rail, with the bridge to the Storm
 * Atlas beneath them.
 *
 * FRAME-AWARE, THE WAY THE CONSENSUS IS. The scalars (spread, scenario count, official-versus-
 * consensus, peaks) are read from the frame the scrubber is on, so rewinding rewinds them. The
 * geometry — tracks, the lead table, the fan — is the latest deck, because only the scalars are
 * on the frame, and the panel SAYS which cycle each part belongs to rather than letting a
 * rewound number sit beside an un-rewound line as though they agreed.
 *
 * Every sentence about what this is and is not comes from claims.js. Nothing here asserts a
 * capability on its own authority.
 */
const GA = window.CategoryAlphaDesignSystem_a835cf || {};
const { Panel: GP, ProvenanceFooter: GPF } = GA;
const gmono = { fontFamily: "var(--font-mono)" };
const GCLS = { global: "global model", hurricane: "hurricane model", "ensemble-mean": "ensemble average", ai: "DeepMind",
               consensus: "consensus", official: "official", statistical: "statistical intensity" };
const GCLS_ORDER = ["official", "consensus", "hurricane", "global", "ensemble-mean", "ai", "statistical"];

function gFrameClock(frame) {
  const fr = (window.MT && MT._frames) || [];
  const f = fr[Math.max(0, Math.min(fr.length - 1, frame))];
  return f && f.tsZ ? Date.parse(f.tsZ) : Date.now();
}
function gAt(S, key, frame) { return typeof S[key] === "function" ? S[key](frame) : null; }
function gFmtZ(iso) { return window.MTFeedHealth ? MTFeedHealth.fmtZ(iso) : String(iso || "—"); }
function gSign(v, unit) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v) + (unit || ""); }
function gDeltaTone(v, lowerIsBetter) {
  if (v == null || v === 0) return "var(--text-2)";
  return (v < 0) === !!lowerIsBetter ? "var(--pos)" : "var(--warn)";
}

/* The health row for the envelope, judged at the FRAME's clock, so a rewound frame sitting
   before the cycle's date-time group reports FUTURE rather than LIVE. */
function gHealth(G, frame) {
  if (!window.MTFeedHealth) return null;
  return MTFeedHealth.classify({ ok: !!(G && G.cycleIso), validZ: G ? G.cycleIso : null, fetchedAt: G ? G.fetchedAt : null,
    cadenceMin: G ? G.cadenceMin : 360, nowMs: gFrameClock(frame) });
}
const G_TONE = { pos: "var(--pos)", warn: "var(--warn)", neg: "var(--neg)", info: "var(--blue-300)", off: "var(--border-strong)" };
function gTone(h) { return G_TONE[(window.MTFeedHealth && MTFeedHealth.TONE[h.status]) || "warn"]; }

/* ---- the five metrics, and the AS-OF rule ------------------------------------------------
 *
 * THE FRAME CARRIES THE ENVELOPE'S SCALARS AND NOTHING ELSE — no tracks, no lead table, no fan.
 * So a rewound cursor can honestly show the numbers the board recorded at that moment, and it
 * cannot show the geometry, because the geometry was never stored. The temptation is to draw the
 * latest deck's lines under a historical AS OF banner, and that is exactly the leak this closes:
 * lines from a cycle the reader had not seen yet, sitting beneath a timestamp that says otherwise.
 *
 *   LIVE      the deck in hand IS the current state. Every part of the panel reads from it —
 *             scalars, tracks, lead table, fan — so no part can disagree with another.
 *   REWOUND   the scalars come from the frame's OWN row, read raw: never through the loader's
 *             accessors, which fall back to the latest deck when a frame has no value and would
 *             quietly reintroduce current guidance under a historical cursor. The geometry is
 *             withheld unless the frame's recorded fingerprint proves the deck in hand is the
 *             same deck, unchanged. Equal cycle ids are NOT enough: an a-deck accretes late
 *             members for hours after its cycle time, so a 12Z deck read at 19Z holds runs the
 *             board did not have at 13Z. Every scalar the frame recorded must still match.
 */
function gFrameRow(S, frame) {
  const fr = (window.MT && MT._frames) || [];
  const f = fr[Math.max(0, Math.min(fr.length - 1, frame))];
  return (f && f.storms && f.storms[S.id]) || null;
}
/* What the frame records about the deck, and where the same quantity lives on the deck itself.
   The comparison is the fingerprint: all of it, or the geometry is not this frame's. */
const G_FINGERPRINT = [
  ["gCycle", (G) => G.cycle],
  ["gN72", (G) => (G.summary.n72 || null)],
  ["gTrack72", (G) => G.summary.trackSpread72Km],
  ["gInt72", (G) => G.summary.intensitySpread72Kt],
  ["gScen72", (G) => G.summary.scenarios72],
  ["gOfclCon72", (G) => G.summary.ofclVsConsensus72Km],
  ["gPeakMed", (G) => G.summary.peakMedianKt],
  ["gPeakOfcl", (G) => G.summary.peakOfclKt],
];
function gDeckUnchangedSince(row, G) {
  if (!row || !G || !G.summary) return false;
  if (row.gCycle == null) return false;          // a frame that recorded no deck proves nothing
  return G_FINGERPRINT.every(([k, of]) => (row[k] ?? null) === (of(G) ?? null));
}
/* THE ONE PREDICATE, shared with the map so the lines and the panel can never disagree about
   whether this cursor is allowed to see them. */
function gGeometryAt(S, frame) {
  const G = S && S.guidance;
  if (!G) return false;
  const NF = (window.MT ? MT.FRAMES : 1) - 1;
  if (frame >= NF) return true;
  return gDeckUnchangedSince(gFrameRow(S, frame), G);
}
window.MT_guidanceGeometryAt = gGeometryAt;

function gMetrics(S, frame) {
  const G = S.guidance || null;
  const NF = (window.MT ? MT.FRAMES : 1) - 1;
  const atLive = frame >= NF;
  const row = gFrameRow(S, frame);
  const sum = (G && G.summary) || {};
  const geometry = gGeometryAt(S, frame);
  const cycle = atLive ? (G ? G.cycle : null) : (row ? row.gCycle ?? null : null);
  const now = atLive
    ? { track: sum.trackSpread72Km ?? null, int: sum.intensitySpread72Kt ?? null, scen: sum.scenarios72 ?? null,
        n: sum.n72 ?? null, ofclCon: sum.ofclVsConsensus72Km ?? null,
        peakMed: sum.peakMedianKt ?? null, peakOfcl: sum.peakOfclKt ?? null }
    : { track: row ? row.gTrack72 ?? null : null, int: row ? row.gInt72 ?? null : null,
        scen: row ? row.gScen72 ?? null : null, n: row ? row.gN72 ?? null : null,
        ofclCon: row ? row.gOfclCon72 ?? null : null, peakMed: row ? row.gPeakMed ?? null : null,
        peakOfcl: row ? row.gPeakOfcl ?? null : null };
  /* previous → delta are the DECK's own cycle-to-cycle comparison, so they travel with the
     geometry: where the geometry is withheld they are unavailable, never 0. */
  const l72 = geometry && G.leads ? G.leads.find((l) => l.hr === 72) : null;
  const prev = l72 && l72.prev ? {
    track: l72.prev.meanKm, trackDelta: l72.prev.spreadDeltaKm, shift: l72.prev.centroidShiftKm, ofclShift: l72.prev.ofclShiftKm,
    int: (G.intensityFan.find((f) => f.hr === 72) || {}).prevMedian, peakMed: G.peaks.prevMedian, peakOfcl: G.peaks.prevOfcl ? G.peaks.prevOfcl.kt : null,
  } : null;
  const int72 = geometry && G.intensityFan ? G.intensityFan.find((f) => f.hr === 72) : null;
  const scen120 = geometry ? sum.scenarios120 ?? null : null;
  return { G, row, cycle, atLive, geometry, now, prev, sum, l72, int72, scen120, NF,
           trend: geometry ? G.trend : null };
}

function GTile({ label, value, unit, prev, delta, deltaUnit, lowerIsBetter, sub, title, testid }) {
  return (
    <div data-guidance-tile={testid} title={title || ""} style={{ padding: "8px 11px", borderRight: "1px solid var(--border-dim)", minWidth: 0 }}>
      <div style={{ ...gmono, fontSize: 9.5, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--text-2)", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ ...gmono, fontSize: 16, fontWeight: 800, color: value == null ? "var(--text-2)" : "var(--text-1)", marginTop: 2, whiteSpace: "nowrap" }}>
        {value == null ? "—" : value}{value != null && unit ? <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)", marginLeft: 3 }}>{unit}</span> : null}
      </div>
      <div style={{ ...gmono, fontSize: 9.5, color: "var(--text-2)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {prev !== undefined
          ? <span>prev <b style={{ color: "var(--text-1)", fontWeight: 600 }}>{prev == null ? "—" : prev}</b> → <b style={{ color: gDeltaTone(delta, lowerIsBetter) }}>{gSign(delta, deltaUnit)}</b></span>
          : <span>{sub || ""}</span>}
      </div>
    </div>
  );
}

function GuidanceTiles({ m, compact }) {
  const { now, prev, trend, geometry, scen120 } = m;
  const cols = compact ? "1fr 1fr" : "repeat(auto-fit,minmax(min(128px,100%),1fr))";
  const unavailable = geometry ? "" : "this cursor is standing on a frame whose recorded deck is not the deck in hand, so the cycle-to-cycle comparison is not available here";
  return (
    <div className="mt-grid" data-guidance-tiles style={{ display: "grid", gridTemplateColumns: cols, borderBottom: "1px solid var(--border-dim)" }}>
      <GTile testid="track" label="Track spread · 72h" value={now.track} unit="km" prev={prev ? prev.track : null} delta={prev ? prev.trackDelta : null} deltaUnit=" km" lowerIsBetter
        title={"mean distance of " + (now.n ?? "—") + " model runs from their centroid at +72h. " + unavailable} />
      <GTile testid="intensity" label="Intensity spread · 72h" value={now.int} unit="kt" prev={prev ? (m.int72 && m.int72.prevMedian != null && m.int72.median != null ? m.int72.prevMedian : null) : null}
        delta={prev && m.int72 && m.int72.prevMedian != null && m.int72.median != null ? m.int72.median - m.int72.prevMedian : null} deltaUnit=" kt median"
        title={"max − min of the intensity members at +72h; prev/delta are the members' MEDIAN at +72h. " + unavailable} />
      <GTile testid="scenarios" label="Scenarios · 72h / 120h" value={now.scen == null ? null : now.scen + (scen120 != null ? " / " + scen120 : "")}
        sub={now.scen == null ? "" : "clusters at a stated km threshold"} title={"single-linkage clusters of the members; a count of clusters, not a likelihood. " + unavailable} />
      <GTile testid="trend" label="Cycle trend · 72h" value={trend ? trend.label : null}
        sub={trend ? "centroid moved " + (trend.centroidShiftKm ?? "—") + " km · spread " + gSign(trend.spreadDeltaPct, "%") : (geometry ? "no previous cycle to compare" : "not recorded on this frame")}
        title={"spread at +72h against the previous cycle at the SAME valid time: tightening ≤ −15%, widening ≥ +15%. " + unavailable} />
      <GTile testid="official" label="NHC vs consensus · 72h" value={now.ofclCon} unit="km"
        sub={now.peakOfcl != null || now.peakMed != null ? "peak: official " + (now.peakOfcl ?? "—") + " · members' median " + (now.peakMed ?? "—") + " kt" : ""}
        title="distance between the official forecast position and the track consensus at +72h; the peaks compare the official intensity forecast with the members' median peak" />
    </div>
  );
}

/* ---- the intensity fan ------------------------------------------------------------------- */
function IntensityFan({ G, width }) {
  const rows = (G.intensityFan || []).filter((f) => f.n > 0 || f.ofcl != null);
  if (!rows.length) return <div style={{ ...gmono, fontSize: 10.5, color: "var(--text-2)", padding: "8px 11px" }}>no intensity members in this cycle — the fan is empty, not flat</div>;
  const W = Math.max(280, width || 560), H = 176, padL = 34, padR = 12, padT = 10, padB = 22;
  const maxKt = Math.max(140, ...rows.flatMap((f) => [f.max, f.ofcl, f.prevOfcl, f.ivcn, f.hcca]).filter((v) => v != null)) + 10;
  const x = (hr) => padL + (hr / 120) * (W - padL - padR);
  const y = (kt) => padT + (1 - kt / maxKt) * (H - padT - padB);
  const path = (pts) => pts.filter((p) => p.v != null).map((p, i) => (i ? "L" : "M") + x(p.hr).toFixed(1) + "," + y(p.v).toFixed(1)).join(" ");
  const band = rows.filter((f) => f.min != null && f.max != null);
  const bandPath = band.length >= 2
    ? "M" + band.map((f) => x(f.hr).toFixed(1) + "," + y(f.max).toFixed(1)).join(" L") + " L" + [...band].reverse().map((f) => x(f.hr).toFixed(1) + "," + y(f.min).toFixed(1)).join(" L") + " Z"
    : null;
  const thresholds = [[34, "TS"], [64, "C1"], [83, "C2"], [96, "C3"], [113, "C4"], [137, "C5"]];
  return (
    <svg role="img" aria-label={"Intensity guidance fan for cycle " + G.cycle + ": members' range, median, and the official forecast, by lead hour"}
      data-guidance-fan viewBox={"0 0 " + W + " " + H} width="100%" height={H} style={{ display: "block", maxWidth: "100%" }}>
      <title>Intensity guidance — raw model guidance, not a probability</title>
      {thresholds.filter(([kt]) => kt < maxKt).map(([kt, lab]) => (
        <g key={kt}>
          <line x1={padL} x2={W - padR} y1={y(kt)} y2={y(kt)} stroke="var(--border-dim)" strokeDasharray="2,4" />
          <text x={padL - 4} y={y(kt) + 3} textAnchor="end" fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--text-2)">{lab}</text>
        </g>
      ))}
      {[0, 24, 48, 72, 96, 120].map((hr) => (
        <text key={hr} x={x(hr)} y={H - 8} textAnchor="middle" fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--text-2)">+{hr}h</text>
      ))}
      {bandPath && <path d={bandPath} fill="#f0a860" fillOpacity="0.14" stroke="none" />}
      {bandPath && <path d={path(band.map((f) => ({ hr: f.hr, v: f.max })))} stroke="#f0a860" strokeOpacity="0.55" strokeWidth="1" fill="none" />}
      {bandPath && <path d={path(band.map((f) => ({ hr: f.hr, v: f.min })))} stroke="#f0a860" strokeOpacity="0.55" strokeWidth="1" fill="none" />}
      <path d={path(rows.map((f) => ({ hr: f.hr, v: f.median })))} stroke="#f0a860" strokeWidth="1.6" fill="none" />
      <path d={path(rows.map((f) => ({ hr: f.hr, v: f.ivcn })))} stroke="#eaf2ff" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="3,3" fill="none" />
      <path d={path(rows.map((f) => ({ hr: f.hr, v: f.prevOfcl })))} stroke="#7fb2e6" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="1,4" fill="none" />
      <path d={path(rows.map((f) => ({ hr: f.hr, v: f.ofcl })))} stroke="#38bdf8" strokeWidth="2.2" fill="none" />
      {rows.filter((f) => f.ofcl != null).map((f) => <circle key={f.hr} cx={x(f.hr)} cy={y(f.ofcl)} r="2.4" fill="#0b1830" stroke="#38bdf8" strokeWidth="1.4" />)}
      <g fontSize="8.5" fontFamily="var(--font-mono)">
        <text x={W - padR} y={padT + 8} textAnchor="end" fill="#38bdf8">— official</text>
        <text x={W - padR} y={padT + 19} textAnchor="end" fill="#f0a860">— members' median · band = min–max</text>
        <text x={W - padR} y={padT + 30} textAnchor="end" fill="#eaf2ff" fillOpacity="0.8">┄ intensity consensus</text>
        <text x={W - padR} y={padT + 41} textAnchor="end" fill="#7fb2e6">· previous-cycle official (interpolated to this cycle's valid times)</text>
      </g>
    </svg>
  );
}

/* ---- the lead table ---------------------------------------------------------------------- */
function LeadTable({ G }) {
  const th = (t) => <th key={t} scope="col" style={{ ...gmono, textAlign: "right", fontSize: 9.5, fontWeight: 700, letterSpacing: ".5px", color: "var(--text-2)", padding: "3px 8px 4px 0", borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap" }}>{t}</th>;
  const td = (v, tone, key) => <td key={key} style={{ ...gmono, textAlign: "right", fontSize: 10.5, color: tone || "var(--text-1)", padding: "3px 8px 3px 0", borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap" }}>{v == null ? "—" : v}</td>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-guidance-leads style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["LEAD", "VALID", "RUNS", "CENTROID", "MEAN SPREAD", "MAX", "OFFICIAL vs CENTROID", "OFFICIAL vs CONSENSUS", "SCENARIOS", "Δ CENTROID", "Δ SPREAD", "Δ OFFICIAL"].map(th)}</tr></thead>
        <tbody>{(G.leads || []).map((l) => (
          <tr key={l.hr}>
            {td("+" + l.hr + "h", "var(--text-2)", "hr")}
            {td(gFmtZ(l.validZ), "var(--text-2)", "v")}
            {td(l.n, null, "n")}
            {td(l.centroid ? l.centroid[0].toFixed(1) + "°, " + l.centroid[1].toFixed(1) + "°" : null, "var(--text-2)", "c")}
            {td(l.meanKm != null ? l.meanKm + " km" : null, null, "m")}
            {td(l.maxKm != null ? l.maxKm + " km" : null, "var(--text-2)", "x")}
            {td(l.ofcl && l.ofcl.offsetKm != null ? l.ofcl.offsetKm + " km" : null, null, "o")}
            {td(l.ofclVsConsensusKm != null ? l.ofclVsConsensusKm + " km" : null, null, "oc")}
            {td(l.n >= 2 ? l.scenarios + (l.outliers.length ? " +" + l.outliers.length + " outlier" + (l.outliers.length === 1 ? "" : "s") : "") : null, l.scenarios >= 2 ? "var(--warn)" : null, "s")}
            {td(l.prev ? l.prev.centroidShiftKm + " km" : null, "var(--text-2)", "dc")}
            {td(l.prev && l.prev.spreadDeltaKm != null ? gSign(l.prev.spreadDeltaKm, " km") : null, l.prev ? gDeltaTone(l.prev.spreadDeltaKm, true) : null, "ds")}
            {td(l.prev && l.prev.ofclShiftKm != null ? l.prev.ofclShiftKm + " km" : null, "var(--text-2)", "do")}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---- members ------------------------------------------------------------------------------ */
function Members({ G }) {
  const style = window.MT_GUIDANCE_STYLE || {};
  const groups = GCLS_ORDER.map((cls) => ({ cls, aids: (G.aids || []).filter((a) => a.cls === cls) })).filter((g) => g.aids.length);
  return (
    <div data-guidance-members style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {groups.map((g) => g.aids.map((a) => {
        const st = style[a.cls] || {};
        return (
          <span key={a.tech} title={a.label + " (" + a.tech + ") · " + GCLS[a.cls] + (a.inSpread ? " · in the track spread" : "") + (a.inFan ? " · in the intensity fan" : "")
              + (a.peakKt != null ? " · peak " + a.peakKt + " kt at +" + a.peakHr + "h" : "") + (a.late ? " · late form (the interpolated one had not landed)" : "")}
            style={{ ...gmono, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, padding: "2px 7px", borderRadius: 5,
              border: "1px solid var(--border-dim)", color: "var(--text-1)", background: "var(--surface-sunken)" }}>
            <span style={{ width: 10, height: 0, borderTop: "2px " + (st.dashArray ? "dotted" : "solid") + " " + (st.color || "var(--text-2)"), display: "inline-block" }} />
            {a.tech}<span style={{ color: "var(--text-2)" }}>{a.label}</span>
            {a.peakKt != null && <span style={{ color: "var(--text-2)" }}>{a.peakKt} kt</span>}
          </span>
        );
      }))}
      {G.roster.missing.map((m) => (
        <span key={m.key} title={"expected " + m.ids.join(" or ") + " — absent this cycle"}
          style={{ ...gmono, fontSize: 10, padding: "2px 7px", borderRadius: 5, border: "1px dashed var(--border-dim)", color: "var(--text-2)" }}>
          {m.label} <span style={{ color: "var(--neg)" }}>absent</span>
        </span>
      ))}
      <span style={{ ...gmono, fontSize: 9.5, color: "var(--text-2)", marginLeft: 4 }}>
        not drawn: {G.roster.excluded.ensembleMembers} ensemble perturbation member{G.roster.excluded.ensembleMembers === 1 ? "" : "s"}
        {G.roster.excluded.baselines.length ? " · baselines " + G.roster.excluded.baselines.join("/") : ""}
      </span>
    </div>
  );
}

/* ---- the health row ----------------------------------------------------------------------- */
function HealthRow({ G, frame }) {
  const h = gHealth(G, frame);
  if (!h) return null;
  const FH = window.MTFeedHealth;
  const cell = (k, v, tone) => (
    <span key={k} style={{ ...gmono, fontSize: 10, color: "var(--text-2)", whiteSpace: "nowrap" }}>{k} <b style={{ color: tone || "var(--text-1)", fontWeight: 700 }}>{v}</b></span>
  );
  return (
    <div data-guidance-health data-feed-status={h.status} style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline" }}>
      {cell("VALID TIME", FH.fmtZ(h.validZ))}
      {cell("FETCHED", FH.fmtZ(h.fetchedAt))}
      {cell("AGE", h.ageMin == null ? "—" : FH.fmtMin(h.ageMin))}
      {cell("EXPECTED CADENCE", h.cadenceMin != null ? FH.fmtMin(h.cadenceMin) + " + " + FH.fmtMin(h.graceMin) + " grace" : "—")}
      {cell("STATUS", h.status, gTone(h))}
      {h.reason && <span style={{ ...gmono, fontSize: 9.5, color: "var(--text-2)" }}>{h.reason}</span>}
    </div>
  );
}

/* ---- the bridge to the Storm Atlas ---------------------------------------------------------- */
function atlasBridgeHref(S) {
  const g = S && S.genesis;
  if (!g || g.lat == null || g.lon == null) return null;
  const q = new URLSearchParams();
  q.set("v", "1");
  q.set("w", g.lat.toFixed(3) + "," + g.lon.toFixed(3) + ",500");
  if (g.month) q.set("mo", String(g.month));
  q.set("atcf", S.id);
  return "storm-atlas/?" + q.toString();
}
function AtlasBridge({ S, compact }) {
  const href = atlasBridgeHref(S);
  const g = S && S.genesis;
  const claim = MTC.claim("atlas.bridge");
  if (!href) {
    return <div data-atlas-bridge="none" style={{ ...gmono, fontSize: 10, color: "var(--text-2)" }}>{claim.text}</div>;
  }
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(g.month || 1) - 1];
  return (
    <div data-atlas-bridge="ready" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <a href={href} data-atlas-bridge-link title={claim.text}
        style={{ ...gmono, display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800, letterSpacing: ".6px",
          color: "var(--accent)", textDecoration: "none", border: "1px solid var(--accent)", borderRadius: 5, padding: "3px 9px" }}>
        OPEN HISTORICAL CONTEXT ›
      </a>
      <span style={{ ...gmono, fontSize: 9.5, color: "var(--text-2)" }}>
        Atlas cohort: formed within 500 km of {Math.abs(g.lat).toFixed(1)}°{g.lat >= 0 ? "N" : "S"} {Math.abs(g.lon).toFixed(1)}°{g.lon >= 0 ? "E" : "W"} in {mon}
        {" — the genesis fix (" + gFmtZ(g.iso) + "), not the current position"}
        {compact ? "" : ". " + claim.text}
      </span>
    </div>
  );
}

/* ---- the rail strip ------------------------------------------------------------------------ */
function MT_GuidanceStrip({ stormId, frame }) {
  const S = stormId ? MT.storms[stormId] : null;
  if (!S) return null;
  const m = gMetrics(S, frame);
  /* The deck's own freshness is a statement about the deck, so it is shown only where the deck
     is what the cursor is looking at. */
  const h = m.G && m.geometry ? gHealth(m.G, frame) : null;
  return (
    <div data-guidance-strip style={{ borderTop: "1px solid var(--border-dim)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px 0" }}>
        <span style={{ ...gmono, fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: "var(--accent)", textTransform: "uppercase" }}>Model guidance</span>
        {m.cycle && <span style={{ ...gmono, fontSize: 10, color: "var(--text-2)" }}>cycle {String(m.cycle).slice(-2)}Z</span>}
        {h && <span data-feed-status={h.status} style={{ ...gmono, fontSize: 9, fontWeight: 800, letterSpacing: ".4px", color: gTone(h), border: "1px solid " + gTone(h), borderRadius: 999, padding: "1px 6px" }}>{h.status}</span>}
        {m.G && !m.geometry && <span data-guidance-strip-asof style={{ ...gmono, fontSize: 9, fontWeight: 800, letterSpacing: ".4px", color: "var(--warn)", border: "1px solid var(--warn)", borderRadius: 999, padding: "1px 6px" }}>AS OF</span>}
        <span style={{ marginLeft: "auto" }}><window.MT_Hint id="note.guidance" /></span>
      </div>
      {m.G ? (
        <div style={{ padding: "4px 4px 0" }}><GuidanceTiles m={m} compact /></div>
      ) : (
        <div style={{ ...gmono, fontSize: 10.5, color: "var(--text-2)", padding: "6px 15px 0" }}>{MTC.claim("map.guidance").text}</div>
      )}
      {m.G && !m.geometry && (
        <div data-guidance-geometry-absent style={{ ...gmono, fontSize: 9.5, color: "var(--warn)", padding: "6px 15px 0", lineHeight: 1.5 }}>
          HISTORICAL GUIDANCE GEOMETRY NOT STORED FOR THIS FRAME
          <span style={{ display: "block", color: "var(--text-2)" }}>Recorded cycle metrics above remain valid as-of this cursor.</span>
        </div>
      )}
      <div style={{ padding: "9px 15px 11px" }}><AtlasBridge S={S} compact /></div>
    </div>
  );
}

/* ---- the full panel ------------------------------------------------------------------------ */
function MT_Guidance({ stormId, frame, narrow }) {
  const ids = Object.keys(MT.storms || {});
  const list = stormId && MT.storms[stormId] ? [MT.storms[stormId]] : ids.map((id) => MT.storms[id]);
  const [w, setW] = React.useState(560);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((es) => { const b = es[0] && es[0].contentRect; if (b && b.width) setW(Math.round(b.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!list.length) {
    return (
      <GP pad={false} title="Model guidance" footer={<GPF {...MTC.footer("map.guidance")} />}>
        <div style={{ ...gmono, fontSize: 11, color: "var(--text-2)", padding: "10px 12px" }}>{MTC.claim("map.guidance").text}</div>
      </GP>
    );
  }
  return (
    <div ref={ref} data-guidance-panel style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {list.map((S) => {
        const m = gMetrics(S, frame);
        const G = m.G;
        const hd = (t) => <div style={{ ...gmono, fontSize: 9.5, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 5 }}>{t}</div>;
        return (
          <div key={S.id} data-guidance-storm={S.id} style={{ border: "1px solid var(--border-strong)", borderRadius: 10, overflow: "hidden", background: "var(--surface-card)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 11px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)", flexWrap: "wrap" }}>
              <span style={{ ...gmono, fontWeight: 800, fontSize: 13, color: "var(--text-1)", letterSpacing: ".5px" }}>{S.name}</span>
              <span style={{ ...gmono, fontSize: 10.5, color: "var(--text-2)" }}>model guidance</span>
              {/* THE CURSOR'S CYCLE, not the deck's. Rewound to a frame the deck in hand does not
                  describe, the head names the cycle THAT FRAME recorded and says nothing about
                  the deck — a masthead reading 18Z over an as-of 13Z body is the same leak the
                  geometry rule closes, in smaller type. */}
              {G && m.geometry && <span style={{ ...gmono, fontSize: 10.5, color: "var(--text-2)" }}>cycle <b style={{ color: "var(--text-1)" }}>{gFmtZ(G.cycleIso)}</b>
                {G.previousCycleIso ? " · previous " + gFmtZ(G.previousCycleIso) : " · no previous cycle in the deck"}</span>}
              {G && m.geometry && <span style={{ ...gmono, fontSize: 10.5, color: "var(--text-2)" }}>{G.roster.inSpread.length} track runs · {G.roster.inFan.length} intensity runs{G.roster.complete ? "" : " · PARTIAL CYCLE"}</span>}
              {G && !m.geometry && <span style={{ ...gmono, fontSize: 10.5, color: "var(--warn)" }}>as of {MTX.frameTime(frame)}
                {m.cycle ? " · recorded cycle " + String(m.cycle).slice(-2) + "Z" : " · no deck recorded on this frame"}</span>}
              <span style={{ marginLeft: "auto" }}><window.MT_Hint id="note.guidance" label="what these are" /></span>
            </div>
            {!G && <div style={{ ...gmono, fontSize: 11, color: "var(--text-2)", padding: "10px 11px" }}>{MTC.claim("map.guidance").text}</div>}
            {G && !m.geometry && (
              <div data-guidance-rewound style={{ ...gmono, fontSize: 10.5, color: "var(--warn)", padding: "6px 11px", borderBottom: "1px solid var(--border-dim)" }}>
                ⏱ AS OF {MTX.frameTime(frame)} — the metrics below are what this frame recorded{m.cycle ? " for cycle " + String(m.cycle).slice(-2) + "Z" : ""}.
              </div>
            )}
            {G && <GuidanceTiles m={m} />}
            {/* WHERE THE GEOMETRY WOULD BE. Not an empty space and not the latest deck: the state
                itself, said in as many words, above the metrics that ARE valid here. */}
            {G && !m.geometry && (
              <div data-guidance-geometry-absent style={{ padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
                <div style={{ ...gmono, fontSize: 10, fontWeight: 800, letterSpacing: ".6px", color: "var(--warn)" }}>
                  HISTORICAL GUIDANCE GEOMETRY NOT STORED FOR THIS FRAME
                </div>
                <div style={{ ...gmono, fontSize: 10.5, color: "var(--text-1)", marginTop: 3 }}>
                  Recorded cycle metrics below remain valid as-of this cursor.
                </div>
                <div style={{ ...gmono, fontSize: 9.5, color: "var(--text-2)", marginTop: 5, lineHeight: 1.5 }}>
                  {MTC.claim("guidance.asOfGeometry").text}
                </div>
              </div>
            )}
            {G && m.geometry && (
              <div style={{ padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
                {hd("By lead · deck " + String(G.cycle).slice(-2) + "Z · previous → current at the same valid time")}
                <LeadTable G={G} />
                <div style={{ ...gmono, fontSize: 9.5, color: "var(--text-2)", marginTop: 5 }}>{MTC.claim("guidance.threshold").text}</div>
              </div>
            )}
            {G && m.geometry && (
              <div style={{ padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
                {hd("Intensity guidance · " + G.roster.inFan.length + " members · peak median " + (G.peaks.median ?? "—") + " kt at +" + (G.peaks.medianHr ?? "—") + "h · official " + (G.peaks.ofcl ? G.peaks.ofcl.kt + " kt at +" + G.peaks.ofcl.hr + "h" : "—")
                  + (G.peaks.prevOfcl ? " · previous official " + G.peaks.prevOfcl.kt + " kt" : ""))}
                <IntensityFan G={G} width={w - 24} />
              </div>
            )}
            {G && m.geometry && (
              <div style={{ padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
                {hd("Members · " + G.roster.present.length + " aids answered" + (G.roster.lateForms.length ? " · late forms: " + G.roster.lateForms.join(", ") : ""))}
                <Members G={G} />
              </div>
            )}
            {/* The health row describes the DECK, so it goes with the deck: withheld only where a
                deck EXISTS that this cursor may not see, since there it would publish the current
                cycle's valid time and age under a past timestamp. A storm with no deck at all
                keeps its row — NO FEED is the honest reading of the absence, not a leak. */}
            {(!G || m.geometry) && (
              <div style={{ padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
                {hd("Feed / cycle health · judged at the frame's clock")}
                <HealthRow G={G} frame={frame} />
              </div>
            )}
            <div style={{ padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
              {hd("Historical context")}
              <AtlasBridge S={S} />
            </div>
            <div data-guidance-semantics style={{ ...gmono, fontSize: 10, color: "var(--text-2)", padding: "7px 11px", background: "var(--surface-sunken)" }}>
              {MTC.claim("guidance.semantics").text}
            </div>
          </div>
        );
      })}
      <GPF {...MTC.footer("map.guidance")} />
    </div>
  );
}
window.MT_Guidance = MT_Guidance;
window.MT_GuidanceStrip = MT_GuidanceStrip;
window.MT_atlasBridgeHref = atlasBridgeHref;
