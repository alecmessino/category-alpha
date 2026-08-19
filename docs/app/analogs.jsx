/* ---- ANALOG PRIOR — the genesis-to-intensity archive, on the board ----------
   The archive (scripts/genesis/, Python + Parquet) is a separable product with its
   own daily job and its own payload, docs/data/analogs.json. This panel renders that
   payload and nothing else: every number below is a field of that file, read at the
   position and season the archive actually queried.

   The archive refuses to publish numbers it cannot support. This panel is written so
   that it cannot quietly undo a refusal:

     1. No bare percentage. A rate is count/denominator AND the percent AND its 95%
        interval, in the same row. "33%" on its own is the failure this panel exists
        to prevent — 2 of 10 and 200 of 1000 are the same rate and different evidence.
     2. rate === null renders the archive's own refused_reason. Never 0%, never a bare
        dash.
     3. The effective sample size sits beside the matched-storm count, always. When the
        weighting has concentrated on a few analogs the reader sees it on the same line.
     4. A contract listed in `unscoreable` carries a BASE RATE ONLY badge with its
        archived-event count. No skill number for such a contract exists anywhere in
        this repository, so this panel gives one nowhere to appear.
     5. conditioning_note is displayed verbatim, above every rate. It is the sentence
        that stops a reader multiplying a landfall rate by a formation chance.
     6. When the match used a GENESIS position the panel says plainly that the system's
        current position was not queried, and shows both. Matching is on where a storm
        formed; querying where it is now has already misled a reader once.

   Capability / provenance language is owned by claims.js (analogs.*), as everywhere
   else on this board. Identifiers are AX-prefixed because every app script shares one
   global lexical scope. */
const AXDS = window.CategoryAlphaDesignSystem_a835cf || {};
const { Panel: AXPanel, Badge: AXBadge, ProvenanceFooter: AXProv } = AXDS;

const AX_URL = (window.MT_DATA_BASE || "data/") + "analogs.json";
const AXclaim = (id) => (window.MTC ? MTC.claim(id) : { id, text: "UNREGISTERED CLAIM (" + id + ")", ok: false });

/* The archive's own ladder and its own thresholds (scripts/genesis/schema.py
   THRESHOLDS_KT). A depression is a closed circulation rather than a wind threshold,
   so it carries no knots here either. */
const AX_LADDER = [
  { k: "td", label: "depression", at: "closed circulation", tone: "var(--text-2)" },
  { k: "ts", label: "tropical storm", at: "≥ 34 kt", tone: "var(--text-1)" },
  { k: "cat1", label: "Cat 1", at: "≥ 64 kt", tone: "var(--warn)" },
  { k: "cat2", label: "Cat 2", at: "≥ 83 kt", tone: "var(--warn)" },
  { k: "cat3", label: "Cat 3", at: "≥ 96 kt", tone: "var(--neg)" },
  { k: "cat4", label: "Cat 4", at: "≥ 113 kt", tone: "var(--neg)" },
  { k: "cat5", label: "Cat 5", at: "≥ 137 kt", tone: "var(--neg)" },
];
const AX_CONTRACT = { any: "landfall, any intensity", hurricane: "landfall ≥ 64 kt" };
/* The ladder and the two contracts are the archive's own (scripts/genesis/schema.py
   THRESHOLDS_KT, and any/hurricane). Iterating those lists alone would silently DROP an
   outcome a future archive publishes — the same drift this board audits for, running the
   other way. Anything the payload carries and this file does not know is rendered too,
   under its raw key and marked as unknown to the panel rather than omitted. */
function AXladderRows(intensity) {
  const known = AX_LADDER.map((x) => x.k);
  return AX_LADDER.concat(
    Object.keys(intensity || {}).filter((k) => known.indexOf(k) < 0).sort()
      .map((k) => ({ k, label: k, at: "threshold not in this panel's ladder", tone: "var(--warn)" })));
}
function AXcontracts(row) {
  const known = ["any", "hurricane"];
  return known.concat(Object.keys(row || {}).filter((k) => known.indexOf(k) < 0).sort());
}
const AX_MONTH = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AX_ENV = [
  { k: "shear_kt", label: "SHEAR", unit: "kt", d: 0 },
  { k: "rh_mid_pct", label: "RH MID", unit: "%", d: 0 },
  { k: "sst_c", label: "SST", unit: "°C", d: 1 },
  { k: "pot_intensity_kt", label: "POT INT", unit: "kt", d: 0 },
  { k: "ohc_kj_cm2", label: "OHC", unit: "kJ/cm²", d: 0 },
  { k: "vort850_1e5", label: "VORT 850", unit: "×10⁻⁵ s⁻¹", d: 2 },
];

const AXnum = (x, d) => (x == null || !isFinite(x)) ? "—" : Number(x).toFixed(d == null ? 1 : d);
const AXpct = (x, d) => (x == null || !isFinite(x)) ? "—" : (Number(x) * 100).toFixed(d == null ? 1 : d) + "%";
const AXci = (ci) => (!ci || ci.length !== 2 || ci[0] == null || ci[1] == null)
  ? null : "[" + (ci[0] * 100).toFixed(1) + "–" + (ci[1] * 100).toFixed(1) + "%]";
const AXstamp = (iso) => iso ? String(iso).replace("T", " ").slice(0, 16) + "Z" : "—";
function AXage(iso) {
  const t = Date.parse(iso);
  if (!t) return null;
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? m + "m" : Math.floor(m / 60) + "h" + ("0" + (m % 60)).slice(-2) + "m";
}
function AXhours(h) {
  if (h == null || !isFinite(h)) return "—";
  const r = Math.round(h);
  return r >= 72 ? r + " h (" + (h / 24).toFixed(1) + " d)" : r + " h";
}
/* A chance NHC published as a percent already — never suffix "%" onto a dash. */
const AXpc0 = (x) => (x == null || !isFinite(x)) ? "not published" : Number(x).toFixed(0) + "%";
const AXmonths = (ms) => (ms && ms.length) ? ms.map((m) => AX_MONTH[m] || m).join(" · ") : "—";
/* Transit-time keys in the ladder's order, landfalls after the intensity crossings —
   alphabetical order put "to TS" below three landfall rows, which reads as a sequence
   that does not exist. */
function AXtteOrder(tte) {
  const keys = Object.keys(tte || {});
  const rank = (k) => {
    const i = AX_LADDER.map((x) => x.k).indexOf(k);
    return i >= 0 ? i : 100;
  };
  return keys.sort((a, b) => (rank(a) - rank(b)) || (a < b ? -1 : a > b ? 1 : 0));
}

/* One fetch per page, shared by every mount. The payload is committed by the archive's
   own job and is not part of the ten-minute snapshot, so it is read here rather than in
   the data-loader's bundle. */
function AXload() {
  if (!window.__MT_ANALOGS_P) {
    window.__MT_ANALOGS_STATE = "loading";
    window.__MT_ANALOGS_P = fetch(AX_URL, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then((j) => { window.__MT_ANALOGS = j; window.__MT_ANALOGS_STATE = "ready"; return j; })
      .catch((err) => {
        window.__MT_ANALOGS_STATE = "absent";
        window.__MT_ANALOGS_ERR = String((err && err.message) || err);
        return null;
      });
  }
  return window.__MT_ANALOGS_P;
}

const AXth = (dense) => ({
  textAlign: "left", color: "var(--text-2)", fontWeight: 600, fontSize: 10,
  textTransform: "uppercase", letterSpacing: ".5px", padding: dense ? "4px 8px" : "6px 9px",
  borderBottom: "1px solid var(--border-dim)", whiteSpace: "nowrap",
});
const AXtd = (dense) => ({
  padding: dense ? "4px 8px" : "6px 9px", borderBottom: "1px solid var(--border-dim)",
  fontFamily: "var(--font-mono)", fontSize: dense ? 10.5 : 11, color: "var(--text-1)", whiteSpace: "nowrap",
});

/* A rate, rendered whole or not at all. Three cells: the count over its denominator,
   the percent, the interval — and when the archive refused, one cell carrying its
   reason across all three. */
function AXRateCells({ r, dense, span }) {
  const td = AXtd(dense);
  if (!r) {
    return (
      <td colSpan={span} style={{ ...td, color: "var(--text-2)" }}>
        the archive published no row for this outcome
      </td>
    );
  }
  const counts = (
    <td style={{ ...td, color: "var(--text-1)", fontWeight: 700 }}>
      {r.count == null ? "—" : r.count}<span style={{ color: "var(--text-2)", fontWeight: 400 }}> / {r.n_storms == null ? "—" : r.n_storms}</span>
      {r.n_unknown > 0 && (
        <span style={{ color: "var(--warn)", fontWeight: 400 }}> · {r.n_unknown} unknown, out of the denominator</span>
      )}
    </td>
  );
  if (r.rate == null) {
    return (
      <React.Fragment>
        {counts}
        <td colSpan={(span || 4) - 1} style={{ ...td, whiteSpace: "normal", color: "var(--warn)", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 800, letterSpacing: ".5px", marginRight: 6 }}>RATE REFUSED</span>
          {r.refused_reason || "the archive refused this rate and published no reason with it"}
        </td>
      </React.Fragment>
    );
  }
  const ci = AXci(r.ci95);
  return (
    <React.Fragment>
      {counts}
      <td style={{ ...td, fontWeight: 700 }}>{AXpct(r.rate)}</td>
      <td style={{ ...td, color: ci ? "var(--text-2)" : "var(--warn)" }}>
        {ci || "no interval published"}
      </td>
      <td style={{ ...td, color: "var(--text-2)" }}>
        {r.weighted_rate == null ? "—" : AXpct(r.weighted_rate)}
      </td>
    </React.Fragment>
  );
}

function AXSubHead({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", margin: "12px 0 4px" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, letterSpacing: 1.4,
        textTransform: "uppercase", color: "var(--accent)" }}>{children}</span>
      {right && <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>{right}</span>}
    </div>
  );
}

function AXKV({ k, v, tone, wide }) {
  return (
    <div style={{ minWidth: 0, flex: wide ? "1 1 180px" : "0 0 auto", background: "var(--surface-card)", padding: "6px 11px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".8px", color: "var(--text-2)" }}>{k}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, marginTop: 2, color: tone || "var(--text-1)" }}>{v}</div>
    </div>
  );
}

/* ---- one matched system or outlook area ---- */
function AXEntry({ e, dense }) {
  const live = e.kind === "live_system";
  const q = e.query || {};
  const pos = e.position || {};
  const onGenesis = pos.which === "genesis";
  const ess = e.effective_sample_size;
  const essShare = (ess != null && e.n_cases) ? ess / e.n_cases : null;
  const essUnderGate = (ess != null && e.min_sample != null && ess < e.min_sample);
  const unsc = e.unscoreable || {};
  const tte = e.time_to_event || {};
  const th = AXth(dense), td = AXtd(dense);

  /* Rule 4. `unscoreable` is counted over the WHOLE archive rather than over the matched
     cases (contract_event_counts in retrieval/analogs.py), so an entry that matched nothing
     still carries it — and an empty pool must not swallow the one statement saying no skill
     number for these contracts exists. Rendered under the landfall table when there is one,
     and under the no-analogs state when there is not. */
  const unscBlock = Object.keys(unsc).length > 0 ? (
    <div style={{ marginTop: 6, padding: "8px 10px", border: "1px solid var(--neg)", borderRadius: 7 }}>
      {Object.keys(unsc).sort().map((key) => (
        <div key={key} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.55, color: "var(--text-2)", marginBottom: 4 }}>
          <span style={{ color: "var(--neg)", fontWeight: 800 }}>{key.replace(":", " · ")} — {unsc[key].status}</span>
          <span> {unsc[key].reason}</span>
        </div>
      ))}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.55, color: "var(--text-2)" }}>
        {AXclaim("analogs.scoring").short || AXclaim("analogs.scoring").text}
      </div>
    </div>
  ) : null;

  return (
    <section style={{ border: "1px solid var(--border-strong)", borderLeft: "3px solid " + (live ? "var(--accent)" : "var(--warn)"),
      borderRadius: "var(--radius-md)", background: "var(--surface-card)", padding: dense ? "10px 12px" : "12px 14px", marginBottom: 12, minWidth: 0 }}>

      {/* identity */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
          color: live ? "var(--accent)" : "var(--warn)" }}>{live ? "◉ LIVE SYSTEM" : "◉ OUTLOOK AREA"}</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-.2px" }}>{e.label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>{e.id}</span>
        {e.basin && <AXBadge tone="neutral">{String(e.basin).toUpperCase()}</AXBadge>}
        {e.is_invest === true && <AXBadge tone="special">INVEST</AXBadge>}
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)" }}>
          r={AXnum(q.radius_km, 0)} km · {AXmonths(q.season_months)} · pool {q.min_pool_season == null ? "—" : q.min_pool_season}+
          {q.include_provisional === false ? " · provisional storms excluded" : ""}
        </span>
      </div>

      {/* position — rule 6 */}
      <div style={{ display: "flex", gap: 1, background: "var(--border-dim)", borderRadius: 7, overflow: "hidden",
        flexWrap: "wrap", marginTop: 9 }}>
        <AXKV k={onGenesis ? "MATCHED ON — GENESIS POSITION" : "MATCHED ON — CURRENT POSITION"}
          v={pos.text || (AXnum(pos.lat) + " / " + AXnum(pos.lon))} tone="var(--accent)" />
        {e.current_position && (
          <AXKV k={onGenesis ? "CURRENT POSITION — NOT QUERIED" : "CURRENT POSITION"} v={e.current_position.text || (AXnum(e.current_position.lat) + " / " + AXnum(e.current_position.lon))}
            tone="var(--text-2)" />
        )}
        <AXKV k="MATCHED STORMS" v={e.n_cases} tone={e.n_cases ? "var(--text-1)" : "var(--neg)"} />
        <AXKV k="EFFECTIVE SAMPLE"
          v={<React.Fragment>{AXnum(ess)}
            {essShare != null && <span style={{ fontWeight: 400, color: "var(--text-2)" }}> · {AXpct(essShare, 0)} of matched</span>}
          </React.Fragment>}
          tone={essUnderGate ? "var(--warn)" : "var(--text-1)"} />
        <AXKV k="SAMPLE GATE" v={"≥ " + (e.min_sample == null ? "—" : e.min_sample) + " storms"} tone="var(--text-2)" />
        <AXKV k="RATES" v={e.sufficient ? "PUBLISHED" : "REFUSED — BELOW GATE"} tone={e.sufficient ? "var(--pos)" : "var(--neg)"} />
      </div>

      {onGenesis && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.55, color: "var(--warn)",
          border: "1px solid var(--warn)", borderRadius: 6, padding: "6px 9px", marginTop: 7 }}>
          {AXclaim("analogs.matching").short || AXclaim("analogs.matching").text}
        </div>
      )}
      {essUnderGate && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.55, color: "var(--warn)", marginTop: 7 }}>
          <AXBadge tone="warn">EFFECTIVE SAMPLE BELOW GATE</AXBadge>{" "}
          {AXclaim("analogs.sample").short || AXclaim("analogs.sample").text}
        </div>
      )}
      {e.env_unmatched_excluded > 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)", marginTop: 6 }}>
          {e.env_unmatched_excluded} positional analog(s) excluded for carrying no archived environment — see gaps below.
        </div>
      )}

      {/* formation chance, when NHC published one for this area */}
      {e.formation && (
        <React.Fragment>
          <AXSubHead right={"observed " + AXstamp(e.formation.observed_utc)}>Formation chance — NHC, as published</AXSubHead>
          <div style={{ display: "flex", gap: 1, background: "var(--border-dim)", borderRadius: 7, overflow: "hidden", flexWrap: "wrap" }}>
            <AXKV k="7-DAY" v={<React.Fragment>{AXpc0(e.formation.prob_7d_pct)}{e.formation.prob_7d_label ? <span style={{ fontWeight: 400, color: "var(--text-2)" }}> · {e.formation.prob_7d_label}</span> : null}</React.Fragment>}
              tone={(e.formation.prob_7d_pct || 0) >= 70 ? "var(--neg)" : (e.formation.prob_7d_pct || 0) >= 40 ? "var(--warn)" : "var(--text-1)"} />
            <AXKV k="48-HOUR" v={AXpc0(e.formation.prob_48h_pct)} tone="var(--text-1)" />
            <AXKV wide k="COMBINING IT WITH THE RATES BELOW" v="only by the conditioning rule at the top of this panel" tone="var(--warn)" />
          </div>
        </React.Fragment>
      )}

      {/* environment vector, with the archive's own caveat */}
      {e.environment && e.environment.vector && (
        <React.Fragment>
          <AXSubHead right={"run " + AXstamp(e.environment.run_utc) + " · " + (e.environment.source || "—")}>
            Environment the match was conditioned on
          </AXSubHead>
          <div style={{ display: "flex", gap: 1, background: "var(--border-dim)", borderRadius: 7, overflow: "hidden", flexWrap: "wrap" }}>
            {AX_ENV.map((f) => (
              <AXKV key={f.k} k={f.label}
                v={<React.Fragment>{AXnum(e.environment.vector[f.k], f.d)}<span style={{ fontWeight: 400, color: "var(--text-2)", fontSize: 10 }}> {f.unit}</span></React.Fragment>} />
            ))}
          </div>
          {e.environment.caveat && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.55, color: "var(--warn)", marginTop: 6 }}>
              <span style={{ fontWeight: 800, letterSpacing: ".5px" }}>CAVEAT · </span>{e.environment.caveat}
            </div>
          )}
          {e.environment.url && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, marginTop: 4, wordBreak: "break-all" }}>
              <a href={e.environment.url} target="_blank" rel="noreferrer">{e.environment.url}</a>
            </div>
          )}
        </React.Fragment>
      )}

      {/* no analogs — an explicit state, never a table of zeroes */}
      {!e.n_cases ? (
        <div style={{ marginTop: 11, padding: "10px 12px", border: "1px solid var(--neg)", borderRadius: 7,
          fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, color: "var(--text-2)" }}>
          <div style={{ color: "var(--neg)", fontWeight: 800, letterSpacing: ".6px", marginBottom: 3 }}>NO ANALOGS — 0 STORMS MATCHED</div>
          Nothing in the archive formed within {AXnum(q.radius_km, 0)} km of {pos.text || "this position"} in {AXmonths(q.season_months)}
          {" "}from season {q.min_pool_season == null ? "—" : q.min_pool_season} on. No rate is published for any outcome, and none is
          shown here: an empty pool is a result, not a zero.
          {unscBlock}
        </div>
      ) : (
        <React.Fragment>
          {/* intensity ladder */}
          <AXSubHead right={"denominator = the " + e.n_cases + " matched storms"}>Intensity ladder — what these analogs reached</AXSubHead>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead><tr>
                <th style={th}>Outcome</th><th style={th}>Threshold</th><th style={th}>Storms</th>
                <th style={th}>Rate</th><th style={th}>95% interval</th><th style={th}>Weighted</th>
              </tr></thead>
              <tbody>
                {AXladderRows(e.intensity).map((L) => {
                  const r = (e.intensity || {})[L.k];
                  return (
                    <tr key={L.k}>
                      <td style={{ ...td, color: L.tone, fontWeight: 700 }}>reached {L.label}</td>
                      <td style={{ ...td, color: "var(--text-2)" }}>{L.at}</td>
                      <AXRateCells r={r} dense={dense} span={4} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-2)", marginTop: 4, lineHeight: 1.5 }}>
            The weighted column re-weights the SAME counts by analog similarity (the weight column in the closest-analogs table).
            The archive publishes no interval for it, so the interval to read is the unweighted one beside it.
          </div>

          {/* landfall, per region and contract */}
          <AXSubHead right={"regions the archive was asked for: " + ((q.regions || []).join(" · ") || "—")}>
            Landfall — counted jointly, never a product
          </AXSubHead>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr>
                <th style={th}>Region</th><th style={th}>Contract</th><th style={th}>Storms</th>
                <th style={th}>Rate</th><th style={th}>95% interval</th><th style={th}>Weighted</th><th style={th}>Scoring</th>
              </tr></thead>
              <tbody>
                {Object.keys(e.landfall || {}).sort().map((region) => (
                  AXcontracts(e.landfall[region]).map((contract) => {
                    const r = (e.landfall[region] || {})[contract];
                    const u = unsc[region + ":" + contract];
                    return (
                      <tr key={region + ":" + contract}>
                        <td style={{ ...td, fontWeight: 700 }}>{contract === "any" ? region : ""}</td>
                        <td style={{ ...td, color: "var(--text-2)" }}>{AX_CONTRACT[contract] || contract}</td>
                        <AXRateCells r={r} dense={dense} span={4} />
                        <td style={{ ...td, whiteSpace: "normal" }}>
                          {u ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <AXBadge tone="neg">BASE RATE ONLY</AXBadge>
                              <span style={{ color: "var(--text-2)", fontSize: 10 }}>
                                {u.archive_events} archived event{u.archive_events === 1 ? "" : "s"} · {u.required} required
                              </span>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                ))}
              </tbody>
            </table>
          </div>
          {unscBlock}

          {/* transit times */}
          {Object.keys(tte).length > 0 && (
            <React.Fragment>
              <AXSubHead right="hours from genesis">Time to event — archive percentiles</AXSubHead>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead><tr>
                    <th style={th}>Outcome</th><th style={th}>n</th><th style={th}>p10</th>
                    <th style={th}>p25</th><th style={th}>median</th><th style={th}>p75</th><th style={th}>p90</th>
                  </tr></thead>
                  <tbody>
                    {AXtteOrder(tte).map((k) => {
                      const t = tte[k] || {};
                      const L = AX_LADDER.filter((x) => x.k === k)[0];
                      const label = k.indexOf("landfall_") === 0 ? "landfall · " + k.slice(9) : "to " + (L ? L.label : k);
                      if (!t.n) {
                        return (
                          <tr key={k}>
                            <td style={{ ...td, color: "var(--text-2)" }}>{label}</td>
                            <td style={{ ...td, color: "var(--text-2)" }}>0</td>
                            <td colSpan={5} style={{ ...td, color: "var(--text-2)", whiteSpace: "normal" }}>
                              no analog in this pool reached it, so no transit time exists to report
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={k}>
                          <td style={{ ...td, fontWeight: 700 }}>{label}</td>
                          <td style={td}>{t.n}</td>
                          <td style={{ ...td, color: "var(--text-2)" }}>{AXhours(t.p10)}</td>
                          <td style={{ ...td, color: "var(--text-2)" }}>{AXhours(t.p25)}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{AXhours(t.median)}</td>
                          <td style={{ ...td, color: "var(--text-2)" }}>{AXhours(t.p75)}</td>
                          <td style={{ ...td, color: "var(--text-2)" }}>{AXhours(t.p90)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </React.Fragment>
          )}

          {/* the analogs themselves */}
          {(e.cases || []).length > 0 && (
            <React.Fragment>
              <AXSubHead right={"closest " + e.cases.length + " of " + Math.max(e.cases.length, e.n_cases || 0) + " matched, nearest first"}>Closest analogs</AXSubHead>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                  <thead><tr>
                    <th style={th}>Season</th><th style={th}>Name</th><th style={th}>ATCF</th><th style={th}>Distance</th>
                    <th style={th}>Peak</th><th style={th}>Peak category</th><th style={th}>Weight</th>
                    <th style={th}>Env fields matched</th><th style={th}>Landfalls</th>
                  </tr></thead>
                  <tbody>
                    {e.cases.map((c) => {
                      const L = AX_LADDER.filter((x) => x.k === c.max_category)[0];
                      /* Keyed on storm_id, the ARCHIVE'S OWN key, which is never null. atcf_id
                         is null for pre-ATCF-era storms, and two of those in one pool gave two
                         React children the key `null` -- which React warns "may cause children
                         to be duplicated and/or omitted", i.e. a row showing the wrong storm.
                         The fallbacks cover a payload emitted before storm_id was carried. */
                      return (
                      <tr key={c.storm_id || c.atcf_id || `${c.season}:${c.name}`}>
                          <td style={{ ...td, fontWeight: 700 }}>{c.season}</td>
                          <td style={{ ...td, color: "var(--text-1)" }}>{c.name}</td>
                          <td style={{ ...td, color: "var(--text-2)" }}>{c.atcf_id}</td>
                          <td style={td}>{AXnum(c.distance_km, 0)} km</td>
                          <td style={td}>{AXnum(c.peak_vmax_kt, 0)} kt</td>
                          <td style={{ ...td, color: (L && L.tone) || "var(--text-2)", fontWeight: 700 }}>{L ? L.label : (c.max_category || "—")}</td>
                          <td style={td}>{AXnum(c.weight, 3)}</td>
                          <td style={{ ...td, color: c.env_fields_compared ? "var(--text-2)" : "var(--warn)" }}>
                            {c.env_fields_compared ? c.env_fields_compared + " compared" : "position + season only"}
                          </td>
                          <td style={{ ...td, color: (c.landfalls || []).length ? "var(--text-1)" : "var(--text-2)" }}>
                            {(c.landfalls || []).length ? c.landfalls.join(" · ") : "none recorded"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      )}

      {/* what the archive says it could not do for this entry */}
      {(e.gaps || []).length > 0 && (
        <React.Fragment>
          <AXSubHead>Gaps the archive reported for this query</AXSubHead>
          {e.gaps.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontFamily: "var(--font-mono)",
              fontSize: 10.5, lineHeight: 1.6, color: "var(--text-2)", padding: "2px 0" }}>
              <span style={{ color: "var(--warn)", flex: "none" }}>△</span><span>{g}</span>
            </div>
          ))}
        </React.Fragment>
      )}
    </section>
  );
}

/* ---- the panel ---- */
function MT_AnalogPrior({ dense, narrow }) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    let alive = true;
    AXload().then(() => { if (alive) setTick((t) => t + 1); });
    return () => { alive = false; };
  }, []);

  const ax = window.__MT_ANALOGS || null;
  const st = window.__MT_ANALOGS_STATE;
  const head = AXclaim("analogs.archive");

  if (!ax) {
    return (
      <AXPanel title="Analog Prior — genesis-to-intensity archive"
        right={<AXBadge tone={st === "loading" ? "neutral" : "neg"}>{st === "loading" ? "READING" : "NO PAYLOAD"}</AXBadge>}
        footer={<AXProv {...MTC.footer("panel.analogs")} latency="payload not read" version="—" />}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, color: "var(--text-2)" }}>
          {head.text}
          {window.__MT_ANALOGS_ERR && <div style={{ marginTop: 5, color: "var(--neg)" }}>{AX_URL} — {window.__MT_ANALOGS_ERR}</div>}
        </div>
      </AXPanel>
    );
  }

  const entries = (ax.entries || []).slice().sort((a, b) => {
    if ((a.kind === "live_system") !== (b.kind === "live_system")) return a.kind === "live_system" ? -1 : 1;
    const pa = (a.formation && a.formation.prob_7d_pct) || 0, pb = (b.formation && b.formation.prob_7d_pct) || 0;
    if (pa !== pb) return pb - pa;
    return (b.n_cases || 0) - (a.n_cases || 0);
  });
  const s = ax.settings || {};
  const nLive = entries.filter((e) => e.kind === "live_system").length;
  const age = AXage(ax.generated_utc);

  return (
    <AXPanel title="Analog Prior — genesis-to-intensity archive"
      right={<React.Fragment>
        <AXBadge tone="neutral">SNAPSHOT {(ax.archive && ax.archive.snapshot) || "—"}</AXBadge>
        <AXBadge tone={entries.length ? "neutral" : "warn"}>
          {nLive} SYSTEM{nLive === 1 ? "" : "S"} · {entries.length - nLive} AREA{entries.length - nLive === 1 ? "" : "S"}
        </AXBadge>
        <window.MT_Hint id="note.analogs" />
      </React.Fragment>}
      footer={<AXProv {...MTC.footer("panel.analogs")}
        latency={age ? age + " since the archive job ran" : "no timestamp on the payload"}
        version={AXstamp(ax.generated_utc)} />}>

      {/* rule 5 — verbatim, above every rate on the panel */}
      <div style={{ border: "1px solid var(--warn)", borderLeft: "3px solid var(--warn)", borderRadius: 7,
        padding: "9px 11px", marginBottom: 11, background: "var(--surface-sunken)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2,
          color: "var(--warn)", marginBottom: 3 }}>HOW THESE RATES ARE CONDITIONED</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: dense ? 11 : 11.5, lineHeight: 1.65, color: "var(--text-1)" }}>
          {AXclaim("analogs.conditioning").text}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: 11,
        fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
        <span style={{ fontWeight: 800, letterSpacing: ".8px" }}>ARCHIVE</span>
        <span>{head.text}</span>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginBottom: 11,
        paddingBottom: 9, borderBottom: "1px solid var(--border-dim)",
        fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-2)" }}>
        <span style={{ fontWeight: 800, letterSpacing: ".8px" }}>QUERY SETTINGS</span>
        <span>radius <b style={{ color: "var(--text-1)" }}>{AXnum(s.radius_km, 0)} km</b></span>
        <span>sample gate <b style={{ color: "var(--text-1)" }}>≥ {s.min_sample == null ? "—" : s.min_sample} storms</b></span>
        <span>pool from <b style={{ color: "var(--text-1)" }}>{s.min_pool_season == null ? "—" : s.min_pool_season}</b></span>
        <span>landfall regions <b style={{ color: "var(--text-1)" }}>{(s.regions || []).join(" · ") || "—"}</b></span>
      </div>

      {(ax.notes || []).length > 0 && (
        <div style={{ marginBottom: 11 }}>
          {ax.notes.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", fontFamily: "var(--font-mono)",
              fontSize: 10.5, lineHeight: 1.6, color: "var(--text-2)" }}>
              <span style={{ color: "var(--warn)", flex: "none" }}>△</span><span>{n}</span>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.6, color: "var(--text-2)" }}>
          The archive job ran and matched no live system and no outlook area this cycle. Nothing is being
          conditioned, so no prior is published — that is the state of the basin, not a gap in the archive.
        </div>
      ) : entries.map((e) => <AXEntry key={e.kind + ":" + e.id} e={e} dense={dense} />)}
    </AXPanel>
  );
}

Object.assign(window, { MT_AnalogPrior });
