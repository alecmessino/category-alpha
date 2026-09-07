/* THE ENVIRONMENTAL RUNWAY — what the storm is flying through, and what runs out first.
 *
 * The engine is scripts/lib/runway.mjs; this file only renders what it published. Every
 * number on screen is SHIPS', sampled at SHIPS' leads, along the track SHIPS was run on.
 *
 * SYNTHESIS FIRST. The masthead answers the two operator questions — how much headroom,
 * and what is the binding constraint — before any row is read. The per-lead table is one
 * table, not six cards, and the attribution ledger is SHIPS' own arithmetic for why its
 * intensity forecast moves, in knots, ranked. Nothing here is a probability and nothing
 * here reaches a price.
 *
 * THE AS-OF RULE, unchanged from the guidance envelope. The frame stores the runway's
 * SCALARS. Rewound to a frame whose recorded SHIPS cycle is not the cycle in hand, the
 * per-lead table, the ledger and the dry-air block are WITHHELD — they describe the latest
 * cycle and would be a current answer under a historical cursor — and the recorded scalars
 * are shown in their place, with the state named.
 */
const RA = window.CategoryAlphaDesignSystem_a835cf || {};
const { Panel: RP, ProvenanceFooter: RPF } = RA;
const rmono = { fontFamily: "var(--font-mono)" };

/* The band vocabulary, mirrored from the engine so the surface can colour a word without
   re-deriving it. A word not in this table is rendered plainly rather than guessed at. */
const R_RANK_TONE = ["var(--pos)", "var(--text-1)", "var(--warn)", "var(--neg)"];
const R_FIELD_LABEL = { shearKt: "SHEAR", rhMid: "MID RH", sstC: "SST", ohc: "OHC", mpiKt: "MPI" };
const R_FIELD_UNIT = { shearKt: "kt", rhMid: "%", sstC: "°C", ohc: "", mpiKt: "kt" };

function rFmtZ(iso) { return window.MTFeedHealth ? MTFeedHealth.fmtZ(iso) : String(iso || "—"); }
function rNum(v, digits) { return v == null || !Number.isFinite(v) ? "—" : (digits ? v.toFixed(digits) : String(Math.round(v))); }
function rSign(v, unit) { return v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v) + (unit || ""); }

function rFrameRow(S, frame) {
  const fr = (window.MT && MT._frames) || [];
  const f = fr[Math.max(0, Math.min(fr.length - 1, frame))];
  return (f && f.storms && f.storms[S.id]) || null;
}

/* The fingerprint the as-of rule compares. Cycle equality alone is not enough: a SHIPS file
   accretes nothing after its cycle, but a frame recorded before this build shipped carries no
   runway scalars at all, and that frame must not borrow the current one's. */
const R_FINGERPRINT = [
  ["rwCycle", (R) => R.cycle],
  ["rwHeadNow", (R) => (R.summary.headroomNowKt ?? null)],
  ["rwLimNow", (R) => (R.summary.limitingNow || null)],
  ["rwClose", (R) => (R.summary.closesAtHr ?? null)],
  ["rwExtp", (R) => (R.summary.extratropicalAtHr ?? null)],
];
function rUnchangedSince(row, R) {
  if (!row || !R || !R.summary) return false;
  if (row.rwCycle == null) return false;
  return R_FINGERPRINT.every(([k, of]) => (row[k] ?? null) === (of(R) ?? null));
}
/* True when the cycle in hand is the cycle this frame recorded — i.e. when the per-lead
   detail may be drawn. At LIVE it always is. */
function rDetailAt(S, frame) {
  const R = S && S.runway;
  if (!R) return false;
  const NF = (window.MT ? MT.FRAMES : 1) - 1;
  if (frame >= NF) return true;
  return rUnchangedSince(rFrameRow(S, frame), R);
}
window.MT_runwayDetailAt = rDetailAt;

function rMetrics(S, frame) {
  const R = S && S.runway ? S.runway : null;
  const NF = (window.MT ? MT.FRAMES : 1) - 1;
  const atLive = frame >= NF;
  const row = rFrameRow(S, frame);
  const detail = rDetailAt(S, frame);
  /* At LIVE the summary is read from the runway itself; rewound, from the frame's own
     recorded scalars — never from the current cycle. */
  const now = atLive && R
    ? { headNow: R.summary.headroomNowKt, headEnd: R.summary.headroomEndKt, limNow: R.summary.limitingNow,
        limEnd: R.summary.limitingEnd, close: R.summary.closesAtHr, extp: R.summary.extratropicalAtHr }
    : { headNow: row ? row.rwHeadNow ?? null : null, headEnd: row ? row.rwHeadEnd ?? null : null,
        limNow: row ? row.rwLimNow || null : null, limEnd: row ? row.rwLimEnd || null : null,
        close: row ? row.rwClose ?? null : null, extp: row ? row.rwExtp ?? null : null };
  const cycle = atLive && R ? R.cycle : (row ? row.rwCycle : null);
  return { R, row, cycle, atLive, detail, now, NF };
}

function rHealth(R, frame) {
  if (!window.MTFeedHealth) return null;
  const fr = (window.MT && MT._frames) || [];
  const f = fr[Math.max(0, Math.min(fr.length - 1, frame))];
  const nowMs = f && f.tsZ ? Date.parse(f.tsZ) : Date.now();
  return MTFeedHealth.classify({ ok: !!(R && R.cycle), validZ: R ? R.cycle : null, cadenceMin: 360, nowMs });
}
function rTone(h) {
  const T = { pos: "var(--pos)", warn: "var(--warn)", neg: "var(--neg)", info: "var(--blue-300)", off: "var(--border-strong)" };
  return T[(window.MTFeedHealth && MTFeedHealth.TONE[h.status]) || "warn"];
}

/* ---- the synthesis tiles ------------------------------------------------------------------ */
function RTile({ label, value, unit, sub, tone, testid }) {
  return (
    <div data-runway-tile={testid} style={{ padding: "6px 9px", minWidth: 0 }}>
      <div style={{ ...rmono, fontSize: 9.5, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--text-2)", whiteSpace: "nowrap" }}>{label}</div>
      <div data-runway-tile-value style={{ ...rmono, fontSize: 16, fontWeight: 800, color: value == null ? "var(--text-2)" : (tone || "var(--text-1)"), marginTop: 2, whiteSpace: "nowrap" }}>
        {value == null ? "—" : value}{value != null && unit ? <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-2)", marginLeft: 2 }}>{unit}</span> : null}
      </div>
      {sub ? <div style={{ ...rmono, fontSize: 9.5, color: "var(--text-2)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div> : null}
    </div>
  );
}

function RunwayTiles({ m, compact }) {
  const n = m.now;
  const limLabel = (k) => (k ? R_FIELD_LABEL[k] || k : null);
  return (
    <div data-runway-tiles style={{ display: "grid", gridTemplateColumns: compact ? "repeat(auto-fit,minmax(104px,1fr))" : "repeat(auto-fit,minmax(122px,1fr))", gap: 1, background: "var(--border-dim)" }}>
      <div style={{ background: "var(--surface-card)" }}>
        <RTile testid="headroom" label="Headroom at analysis" value={n.headNow} unit="kt"
          tone={n.headNow == null ? null : (n.headNow <= 0 ? "var(--neg)" : n.headNow < 20 ? "var(--warn)" : "var(--text-1)")}
          sub="ocean ceiling less intensity" />
      </div>
      <div style={{ background: "var(--surface-card)" }}>
        <RTile testid="limiting" label="Limiting at analysis" value={limLabel(n.limNow)} sub="binding constraint" />
      </div>
      <div style={{ background: "var(--surface-card)" }}>
        <RTile testid="limiting-end" label="Limiting later" value={limLabel(n.limEnd)} sub="at the last measured lead" />
      </div>
      <div style={{ background: "var(--surface-card)" }}>
        <RTile testid="closes" label="Runway closes" value={n.close == null ? null : (n.close === 0 ? "AT ANALYSIS" : "+" + n.close + "h")}
          tone={n.close == null ? null : "var(--warn)"}
          sub={n.close == null ? "not inside the window" : "worst band reached"} />
      </div>
      {n.extp != null && (
        <div style={{ background: "var(--surface-card)" }}>
          <RTile testid="extp" label="Extratropical" value={"+" + n.extp + "h"} tone="var(--warn)" sub="SHIPS storm type" />
        </div>
      )}
    </div>
  );
}

/* ---- the per-lead table -------------------------------------------------------------------- */
function RunwayTable({ R, compact }) {
  const th = (t, align) => (
    <th key={t} scope="col" style={{ ...rmono, textAlign: align || "right", fontSize: 9.5, fontWeight: 700, letterSpacing: ".5px",
      color: "var(--text-2)", padding: "3px 8px 4px 0", borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap" }}>{t}</th>
  );
  const td = (v, key, tone, align) => (
    <td key={key} style={{ ...rmono, textAlign: align || "right", fontSize: 10.5, color: tone || "var(--text-1)",
      padding: "3px 8px 3px 0", borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap" }}>{v == null ? "—" : v}</td>
  );
  const cell = (s, key, digits) => {
    const v = s.values[key];
    const b = s.bands[key];
    return td(v == null ? null : rNum(v, digits), key, b ? R_RANK_TONE[b.rank] : null);
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-runway-table style={{ borderCollapse: "collapse", width: "100%", minWidth: 0 }}>
        <caption style={{ ...rmono, captionSide: "top", textAlign: "left", fontSize: 9.5, color: "var(--text-2)", padding: "0 0 5px" }}>
          Sampled at the forecast positions of {R.trackAid || "an unnamed track"}
          {R.officialTrack ? " — the official NHC forecast" : " — a MODEL track, not the official forecast"}
          {/* Narrowed, the RAW inputs give way and the SYNTHESIS stays: a reader who can see one
              column should see the binding constraint, not the ocean heat content it was derived
              from. The dropped columns are named rather than silently missing. */}
          {compact ? " · valid time, OHC and MPI withheld at this width" : ""}
          {/* The analysis instant, always, at every width. The ANALYSIS row's own VALID cell
              carries it too, but that column is the first thing dropped when the table narrows,
              and the one number a reader must not have to infer is WHEN this analysis was. */}
          {R.samples[0] && R.samples[0].validIso
            ? " · ANALYSIS is " + rFmtZ(R.samples[0].validIso) + ", the SHIPS cycle — not the board's clock"
            : ""}
        </caption>
        <thead><tr>
          {th("LEAD", "left")}{compact ? null : th("VALID", "left")}{th("TYPE", "left")}
          {th("SHEAR")}{th("MID RH")}{th("SST")}{compact ? null : th("OHC")}{compact ? null : th("MPI")}
          {th("HEADROOM")}{th("LIMITING", "left")}
        </tr></thead>
        <tbody>
          {R.samples.map((s) => {
            const measured = !!s.limiting;
            return (
              <tr key={s.hr} data-runway-lead={s.hr} data-runway-measured={measured ? "1" : "0"}>
                {/* ANALYSIS, never NOW. Tau 0 is the SHIPS cycle's own analysis time, which is up
                    to six hours behind the terminal's clock — the board can read 18Z over a 12Z
                    SHIPS run. "NOW" invites a reader to take a six-hour-old analysis for the
                    current state of the storm; the valid time beside it is the actual instant. */}
                {td(s.hr === 0 ? "ANALYSIS" : "+" + s.hr + "h", "lead", "var(--text-1)", "left")}
                {compact ? null : td(s.validIso ? rFmtZ(s.validIso) : null, "valid", "var(--text-2)", "left")}
                {td(s.type, "type", s.tropical === false ? "var(--warn)" : "var(--text-2)", "left")}
                {cell(s, "shearKt", 0)}
                {cell(s, "rhMid", 0)}
                {cell(s, "sstC", 1)}
                {compact ? null : cell(s, "ohc", 0)}
                {compact ? null : td(s.values.mpiKt == null ? null : rNum(s.values.mpiKt, 0), "mpi")}
                {td(s.headroomKt == null ? null : rSign(s.headroomKt),
                  "head", s.headroomKt == null ? null : (s.headroomKt <= 0 ? "var(--neg)" : "var(--text-1)"))}
                {td(s.limitingWord, "lim", s.limiting ? R_RANK_TONE[s.bands[s.limiting].rank] : null, "left")}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---- SHIPS' own arithmetic ------------------------------------------------------------------ */
function Attribution({ R, compact }) {
  /* The last lead that actually carries a ledger. Reading the ledger at a lead the product
     did not compute would print an empty block under a confident heading. */
  const withLedger = R.samples.filter((s) => s.attribution && s.attribution.top.length);
  if (!withLedger.length) return null;
  const s = withLedger[withLedger.length - 1];
  const a = s.attribution;
  const max = Math.max(...a.top.map((t) => Math.abs(t.dvKt)), 1);
  return (
    <div data-runway-attribution style={{ padding: "8px 11px", borderTop: "1px solid var(--border-dim)" }}>
      <div style={{ ...rmono, fontSize: 9.5, letterSpacing: ".6px", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 5 }}>
        Why the SHIPS intensity forecast moves — at +{a.hr}h, in knots
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {a.top.map((t) => {
          const neg = t.dvKt < 0;
          const w = Math.round((Math.abs(t.dvKt) / max) * 100);
          return (
            <div key={t.label} data-runway-term={t.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...rmono, fontSize: 10, color: "var(--text-2)", flex: compact ? "0 0 118px" : "0 0 150px",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
              <span style={{ flex: 1, minWidth: 24, height: 6, background: "var(--surface-sunken)", borderRadius: 3, overflow: "hidden" }}>
                <span style={{ display: "block", width: w + "%", height: "100%", background: neg ? "var(--neg)" : "var(--pos)" }} />
              </span>
              <span style={{ ...rmono, fontSize: 10.5, fontWeight: 700, color: neg ? "var(--neg)" : "var(--pos)", width: 44, textAlign: "right" }}>{rSign(t.dvKt)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...rmono, fontSize: 9.5, color: "var(--text-2)", marginTop: 5, lineHeight: 1.5 }}>
        SHIPS publishes a total of <b style={{ color: "var(--text-1)" }}>{rSign(a.totalKt)} kt</b> at +{a.hr}h from {a.nTerms} terms
        {a.residualKt != null && a.residualKt !== 0
          ? ` (its rounded terms sum to ${rSign(a.sumOfTermsKt)}; the ${rSign(a.residualKt)} kt difference is the product's own rounding, not a correction applied here)`
          : ""}. {MTC.claim("runway.attribution").text}
      </div>
    </div>
  );
}

/* ---- dry air and steering, named ------------------------------------------------------------ */
function DryAirSteering({ R }) {
  const d = R.dryAir || {};
  const st = R.steering || {};
  const bits = [];
  if (d.blFluxWm2) bits.push(["BL DRY-AIR FLUX", rNum(d.blFluxWm2.value, 1) + " W/m²"]);
  if (d.tpwDryPctUpshear) bits.push(["UPSHEAR TPW < 45 mm", rNum(d.tpwDryPctUpshear.value, 1) + "%"]);
  if (st.levelMb != null) bits.push(["STEERING LEVEL", rNum(st.levelMb, 0) + " mb" + (st.levelClimoMb != null ? " (mean " + rNum(st.levelClimoMb, 0) + ")" : "")]);
  if (st.headingDeg != null) bits.push(["HEADING / SPEED", rNum(st.headingDeg, 0) + "° / " + rNum(st.speedKt, 0) + " kt"]);
  if (!bits.length) return null;
  return (
    <div data-runway-dryair style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", padding: "7px 11px", borderTop: "1px solid var(--border-dim)" }}>
      {bits.map(([k, v]) => (
        <span key={k} style={{ ...rmono, fontSize: 10, color: "var(--text-2)", whiteSpace: "nowrap" }}>{k} <b style={{ color: "var(--text-1)", fontWeight: 700 }}>{v}</b></span>
      ))}
      <span style={{ ...rmono, fontSize: 9.5, color: "var(--text-2)", flexBasis: "100%" }}>{MTC.claim("runway.dryair").text}</span>
    </div>
  );
}

/* ---- the historical-cursor state ------------------------------------------------------------ */
function RunwayAsOf({ inline }) {
  return (
    <div data-runway-detail-absent style={inline ? { padding: "6px 15px 0" } : { padding: "8px 11px", borderBottom: "1px solid var(--border-dim)" }}>
      <div style={{ ...rmono, fontSize: 10, fontWeight: 800, letterSpacing: ".6px", color: "var(--warn)" }}>
        HISTORICAL RUNWAY DETAIL NOT STORED FOR THIS FRAME
      </div>
      <div style={{ ...rmono, fontSize: 10.5, color: "var(--text-1)", marginTop: 3 }}>
        Recorded cycle metrics {inline ? "above" : "below"} remain valid as-of this cursor.
      </div>
      {!inline && (
        <div style={{ ...rmono, fontSize: 9.5, color: "var(--text-2)", marginTop: 5, lineHeight: 1.5 }}>
          {MTC.claim("runway.replay").text}
        </div>
      )}
    </div>
  );
}

/* ---- the rail strip -------------------------------------------------------------------------- */
function MT_RunwayStrip({ stormId, frame }) {
  const S = stormId ? MT.storms[stormId] : null;
  if (!S) return null;
  const m = rMetrics(S, frame);
  const h = m.R && m.detail ? rHealth(m.R, frame) : null;
  return (
    <div data-runway-strip style={{ borderTop: "1px solid var(--border-dim)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px 0", flexWrap: "wrap" }}>
        <span style={{ ...rmono, fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: "var(--accent)", textTransform: "uppercase" }}>Environmental runway</span>
        {m.cycle && <span style={{ ...rmono, fontSize: 10, color: "var(--text-2)" }}>cycle {String(m.cycle).slice(11, 13)}Z</span>}
        {h && <span data-feed-status={h.status} style={{ ...rmono, fontSize: 9, fontWeight: 800, letterSpacing: ".4px", color: rTone(h), border: "1px solid " + rTone(h), borderRadius: 999, padding: "1px 6px" }}>{h.status}</span>}
        {m.R && !m.detail && <span data-runway-strip-asof style={{ ...rmono, fontSize: 9, fontWeight: 800, letterSpacing: ".4px", color: "var(--warn)", border: "1px solid var(--warn)", borderRadius: 999, padding: "1px 6px" }}>AS OF</span>}
        <span style={{ marginLeft: "auto" }}><window.MT_Hint id="note.runway" /></span>
      </div>
      {m.R || m.cycle ? (
        <div style={{ padding: "4px 4px 0" }}><RunwayTiles m={m} compact /></div>
      ) : (
        <div style={{ ...rmono, fontSize: 10.5, color: "var(--text-2)", padding: "6px 15px 0" }}>{MTC.claim("runway.absent").text}</div>
      )}
      {m.R && !m.detail && <RunwayAsOf inline />}
      <div style={{ height: 9 }} />
    </div>
  );
}

/* ---- the full panel --------------------------------------------------------------------------- */
function MT_Runway({ stormId, frame, narrow }) {
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
  const compact = narrow || w < 560;
  if (!list.length) {
    return (
      <RP pad={false} title="Environmental runway" footer={<RPF {...MTC.footer("runway.absent")} />}>
        <div style={{ ...rmono, fontSize: 11, color: "var(--text-2)", padding: "10px 12px" }}>{MTC.claim("runway.absent").text}</div>
      </RP>
    );
  }
  return (
    <div ref={ref} data-runway-panel style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      {list.map((S) => {
        const m = rMetrics(S, frame);
        const R = m.R;
        return (
          <div key={S.id} data-runway-storm={S.id} style={{ border: "1px solid var(--border-strong)", borderRadius: 10, overflow: "hidden", background: "var(--surface-card)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "8px 11px", borderBottom: "1px solid var(--border-dim)", background: "var(--surface-sunken)", flexWrap: "wrap" }}>
              <span style={{ ...rmono, fontWeight: 800, fontSize: 13, color: "var(--text-1)", letterSpacing: ".5px" }}>{S.name}</span>
              <span style={{ ...rmono, fontSize: 10.5, color: "var(--text-2)" }}>environmental runway</span>
              {/* The CURSOR's cycle, never the newest one, for the same reason the guidance
                  masthead names the frame's cycle under a historical cursor. */}
              {R && m.detail && <span style={{ ...rmono, fontSize: 10.5, color: "var(--text-2)" }}>SHIPS <b style={{ color: "var(--text-1)" }}>{rFmtZ(R.cycle)}</b> · along {R.trackAid || "an unnamed track"}</span>}
              {R && !m.detail && <span style={{ ...rmono, fontSize: 10.5, color: "var(--warn)" }}>as of {MTX.frameTime(frame)}
                {m.cycle ? " · recorded SHIPS " + String(m.cycle).slice(11, 13) + "Z" : " · no SHIPS cycle recorded on this frame"}</span>}
              <span style={{ marginLeft: "auto" }}><window.MT_Hint id="note.runway" label="what these are" /></span>
            </div>

            {!R && !m.cycle && (
              <div data-runway-none style={{ ...rmono, fontSize: 10.5, color: "var(--text-2)", padding: "10px 11px" }}>{MTC.claim("runway.absent").text}</div>
            )}

            {(R || m.cycle) && <RunwayTiles m={m} compact={compact} />}

            {R && !m.detail && <RunwayAsOf />}

            {R && m.detail && (
              <>
                <div style={{ padding: "8px 11px", borderTop: "1px solid var(--border-dim)" }}>
                  <RunwayTable R={R} compact={compact} />
                </div>
                <Attribution R={R} compact={compact} />
                <DryAirSteering R={R} />
                {R.atlas && (
                  <div data-runway-atlas={R.atlas.ok ? "offered" : "refused"} style={{ ...rmono, fontSize: 9.5, color: "var(--text-2)", padding: "7px 11px", borderTop: "1px solid var(--border-dim)", lineHeight: 1.5 }}>
                    <b style={{ color: R.atlas.ok ? "var(--text-1)" : "var(--warn)", fontWeight: 800, letterSpacing: ".4px" }}>
                      {R.atlas.ok ? "COMPARABLE TO THE ARCHIVE" : "NOT COMPARABLE TO THE ARCHIVE"}
                    </b>{" — "}{R.atlas.reason}.
                  </div>
                )}
              </>
            )}

            <div style={{ ...rmono, fontSize: 9.5, color: "var(--text-2)", padding: "7px 11px", borderTop: "1px solid var(--border-dim)", lineHeight: 1.5 }}>
              {MTC.claim("runway.semantics").text}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.MT_Runway = MT_Runway;
window.MT_RunwayStrip = MT_RunwayStrip;
