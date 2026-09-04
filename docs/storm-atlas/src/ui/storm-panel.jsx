/* One storm, and the record that describes it.
 *
 * THE PANEL USED TO SAY "WHOLE LIFE" ABOUT EVERY STORM, AND FOR A CURRENT ONE THAT IS A CLAIM THE
 * RECORD CANNOT MAKE. IBTrACS publishes a PROVISIONAL row for the running season and stops
 * updating it long before the storm stops existing. CP012026 / LALA reached this panel as 65 kt,
 * Category 1, 988 mb, 49 fixes and 2.5 days -- a finished storm -- while the forecast office was
 * still writing it up nine days later, having recorded 115 kt and 947 mb. Every number was an
 * honest archive column. The sentence around them was not.
 *
 * So the panel now says WHICH RECORD each value came from, and there are two:
 *
 *   ARCHIVE      IBTrACS, post-analysed or provisional. The only thing the research surfaces
 *                read. Unchanged by anything below.
 *   OPERATIONAL  The ATCF b-deck, as the forecast office has it now. The selected-storm
 *                representation of a current storm, and NOTHING ELSE -- it reaches no cohort, no
 *                analog, no rate, no interval, no calibration and no refusal.
 *   DERIVED      Neither published the value; the Atlas computed it by replaying the archive's
 *                own rule. Marked with the superscript this repository already uses.
 *
 * THE TWO ARE NEVER CONCATENATED AND NEVER AVERAGED. Where an operational record governs it is
 * the whole of the selected-storm representation -- its fixes, its peak, its minimum, its ladder
 * -- and the archive's own columns are still printed, still labelled ARCHIVE, wherever they say
 * something the operational deck does not. Where the two disagree the panel prints both and
 * resolves neither.
 *
 * AND WHERE AN OPERATIONAL RECORD IS EXPECTED AND MISSING, THE PANEL FAILS CLOSED. It does not
 * quietly fall back to a provisional stub that looks complete; it says the continuation is
 * unavailable and names the instant the archive representation ends.
 *
 * Three distinctions the panel already existed to keep visible, all still here:
 *   - OBSERVED vs INTERPOLATED fixes, and the fact that a crossing may never rest on an
 *     interpolated one.
 *   - A landfall the archive DERIVED from geometry versus one a source flagged, and the
 *     Saffir-Simpson class it WITHHELD when the bracketing fixes disagreed.
 *   - Whether any environment was archived near this storm's genesis at all, which for most of
 *     the record is no.
 */

import React from "react";

import { formatPosition } from "../engine/geo.js";
import { regionLabel } from "../engine/cohort-language.js";
import { LIVE_ARCHIVE_FINAL, LIVE_NONE, LIVE_OPERATIONAL, LIVE_UNAVAILABLE } from "../engine/live.js";
import { Capt, CohortSpec, Drv, Figure, Head, MONO, Masthead, Note, Num, OverDenom, Refusal, Row, TextButton, Txt, claimText, fmtHours, fmtUTC, CATEGORY_INK } from "./kit.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

/* THE SOURCE-STATE VOCABULARY, IN ONE TABLE.
 *
 * Four states, four kickers, four badges, and the reason each exists. It is a table rather than
 * four branches in the JSX because a reader of this file should be able to see all four wordings
 * at once -- the failure this whole change fixes was two of them being the same sentence.
 *
 * `tone` is chrome ink, never category ink: the badge says where a number came from, and
 * colouring it like an intensity would make provenance look like severity. */
const SOURCE_STATE = {
  [LIVE_OPERATIONAL]: {
    kicker: "One storm, operational to date",
    badge: "OPERATIONAL / PROVISIONAL",
    tone: "var(--accent)",
    why: "Every headline value below is the ATCF operational best track, not the IBTrACS "
      + "archive.",
  },
  [LIVE_UNAVAILABLE]: {
    kicker: "One storm, archive record — INCOMPLETE",
    badge: "LIVE CONTINUATION UNAVAILABLE",
    tone: "var(--neg)",
    why: "An operational record was expected for this storm and could not be read. What is below "
      + "is the provisional archive alone, and it is known to stop before the storm did.",
  },
  [LIVE_NONE]: {
    kicker: "One storm, provisional archive record",
    badge: "PROVISIONAL — THIS SEASON HAS NOT BEEN POST-ANALYSED",
    tone: "var(--flag)",
    why: "No operational record is being tracked for this storm. The archive row is provisional: "
      + "published early, and not post-analysed.",
  },
  [LIVE_ARCHIVE_FINAL]: {
    kicker: "One storm, whole life",
    badge: null,
    tone: null,
    why: null,
  },
};

/** The freshness line under the badge. Source-valid time first, because that is the fact. */
function throughLine(view) {
  if (!view) return null;
  const t = fmtUTC(view.latest_valid_time);
  const age = view.age_hours === null ? null
    : view.age_hours < 48 ? `${view.age_hours.toFixed(1)} H OLD`
      : `${(view.age_hours / 24).toFixed(1)} D OLD`;
  return `ATCF B-DECK · THROUGH ${t}${age ? ` · ${age}` : ""}`;
}

export function StormPanel({ storm, archive, onClose, onReplay, replaying, spec, specUrl,
  bridge, cohortSentence, result, onBridge, cursorLive, live }) {
  /* THE STRIP IS THE DEFAULT AND THE RECORD IS ONE PRESS AWAY.
   *
   * WHAT THIS CHANGES AND WHAT IT DOES NOT. The locked rules ask a selected storm for a MINIMUM
   * STRIP -- name, id, season, basin, archive peak, minimum pressure, how many rows it is
   * counted in, and the way back to a cohort -- and say it must not replace the ledger. What the
   * dock held instead was seven sections of track geometry, landfalls, environment and data
   * quality, opened in full every time a reader clicked a genesis point to ask one question.
   *
   * NOTHING IS REMOVED. Every block is still here, in the same order, in the same words, with
   * the same hooks; OPEN RECORD shows them. What changes is which one the reader meets first.
   * The bridge stays pinned in BOTH states -- it is the control the panel exists for -- and the
   * source badge, the freshness line and the fail-closed refusal are in the strip rather than
   * behind the press, because "which record is speaking" is not a detail a reader should have to
   * open something to learn.
   *
   * The state resets with the storm: opening one record does not commit a reader to opening the
   * next. Keyed rather than tracked, so the reset cannot be forgotten. */
  const [openRecord, setOpenRecord] = React.useState(false);
  const key = storm ? storm.storm_id : null;
  const lastKey = React.useRef(key);
  if (lastKey.current !== key) { lastKey.current = key; if (openRecord) setOpenRecord(false); }
  if (!storm) return null;
  const s = storm;
  const q = s.quality;

  /* WHICH RECORD IS SPEAKING. `live` is computed by the shell and handed down whole; the panel
     decides nothing about precedence, it only renders the decision. A shell that never loaded the
     operational layer at all passes nothing, and the panel behaves exactly as it did before this
     change -- which is what keeps 3,958 archive storms untouched. */
  const state = (live && live.state) || LIVE_ARCHIVE_FINAL;
  const view = state === LIVE_OPERATIONAL ? live.view : null;
  const cycle = (live && live.lifecycle) || null;
  const src = SOURCE_STATE[state] || SOURCE_STATE[LIVE_ARCHIVE_FINAL];

  /* The class named in the Intensity head follows the record on screen. For an operational storm
     that is the DERIVED class of the operational peak, not the archive's. The FIGURE's own tint
     is chosen inside each block, from the same value. */
  const headCategory = view ? view.peak_category : s.max_category;

  /* HOW MANY OF THE PUBLISHED ROWS THIS STORM IS COUNTED IN -- the locked rules' own line for
     the strip, and it is read from the ENGINE'S MEMBER ARRAYS rather than recomputed here.
     `scoreCases` collects the rows behind every numerator in the same loop that counts it, so
     asking whether this storm is in a contract is a lookup in the set the archive published,
     and this file never tests an intensity against a threshold.
     NOT `contributionOf`: that answers a narrower question -- which LANDFALL contracts this
     storm supplies -- and reading it as "the published rows" printed 0 for every storm that
     came ashore nowhere the archive models, including one that reached Category 1. The bridge
     still uses it, for the question it does answer. */
  const counted = React.useMemo(() => {
    const m = result && result.members;
    if (!m || !s || s.row === undefined || s.row === null) return null;
    let inRows = 0;
    let total = 0;
    for (const [cat, rows] of Object.entries(m.intensity || {})) {
      if (cat === "td") continue;          // the ladder starts where the archive's thresholds do
      total += 1;
      if (rows && rows.includes(s.row)) inRows += 1;
    }
    for (const rows of Object.values(m.landfall || {})) {
      total += 1;
      if (rows && rows.includes(s.row)) inRows += 1;
    }
    return total ? `${inRows} of ${total} published rows` : null;
  }, [result, s]);

  const loc = (
    <>
      {s.season} · {s.basin}{s.genesis_subbasin ? ` / ${s.genesis_subbasin}` : ""} ·{" "}
      <span>{s.atcf_id || s.storm_id}</span>
    </>
  );

  return (
    /* THREE PARTS, AND ONLY THE MIDDLE ONE SCROLLS.
     *
     * The inspector is a flex column: the masthead is fixed, the record blocks take the
     * remaining height and scroll inside it, and the bridge is pinned as a NON-SCROLLING SIBLING
     * at the foot. That last part is the whole point of the arrangement.
     *
     * WHY THE BRIDGE CANNOT BE ALLOWED TO SCROLL. It is the one control that takes a reader from
     * this storm to the population it belongs to -- the question the surface exists to answer --
     * and it sat at the bottom of a single scrolling column, beneath seven sections of track
     * geometry, landfalls, environment and data quality. On a docked 380px inspector that is
     * roughly two screens down. A reader who does not scroll never learns the bridge exists, and
     * "the feature is there, below the fold" is indistinguishable from "the feature is missing"
     * for everyone who does not go looking.
     *
     * The middle block is a scroll container, and that -- not its `min-height:0` -- is what lets
     * it shrink: a flex item that scrolls has its automatic minimum resolve to zero already. The
     * arrangement is asserted by scripts/check-inspector-bridge.mjs, which scrolls the body to
     * its end at three content sizes and requires the bridge to still be on screen.
     *
     * THE MASTHEAD GREW BY ONE LINE and no more, deliberately: it is capped at 42% of the dock
     * and the bridge holds 46%, so a source-state block that ran to a paragraph would squeeze the
     * body to nothing. The badge and its freshness line are two lines; the paragraph explaining
     * them is the first block of the BODY, where there is room for it. */
    <div className="at-inspector" data-inspector data-source-state={state}>
      <div className="at-insp-head">
      {/* THE CITATION IS NOT IN THE MASTHEAD, and that is a measurement rather than a preference.
          The head is capped at 42% of the dock with a 96px floor described in atlas.css as "the
          identity: kicker, name, and the season/basin/id line". Measured at 1440x900 the head
          holds 96 visible pixels around 267 of content, so everything past the id line is inside
          a scroll box nobody opens -- which is where the two-line Cohort Spec was, and where the
          SOURCE BADGE would have joined it. The badge and its freshness line are the answer to
          "which record am I looking at", the question this whole panel now exists to answer, so
          they take the space and the citation moves to the top of the body. Nothing is removed;
          one copy affordance stops competing with the identity for a 96px floor. */}
      <Masthead kicker={src.kicker}
        right={<TextButton onClick={onClose} title="clear selection">Clear</TextButton>}
        title={s.name || "UNNAMED"} titleClass="storm" loc={loc}>
        {src.badge ? (
          <div data-source-badge title={src.why || undefined} style={{ ...MONO, marginTop: 8,
            fontSize: 9, color: src.tone, letterSpacing: ".8px",
            border: `1px solid ${src.tone}`, padding: "3px 6px", display: "inline-block" }}>
            {src.badge}
          </div>
        ) : null}
        {view ? (
          <div data-source-through style={{ ...MONO, marginTop: 5, fontSize: 9,
            color: "var(--t2)", letterSpacing: ".6px" }}>
            {throughLine(view)}
          </div>
        ) : null}
      </Masthead>
      </div>

      {/* THE STRIP. Three facts and a control: what the archive recorded, how much of the
          evidence below this storm is in, and the way into the whole record. Every figure here is
          printed again in the record; none is computed for this line. */}
      {!openRecord ? (
        <div className="at-insp-strip" data-storm-strip>
          <div className="at-pad">
            {state === LIVE_UNAVAILABLE ? (
              <Refusal kind="unk"
                status={`LIVE CONTINUATION UNAVAILABLE — ARCHIVE REPRESENTATION ENDS ${fmtUTC(s.end_t) || "AT AN UNRECORDED TIME"}`}>
                {(live && live.reason) || "The operational record could not be read."} Everything
                below is the provisional archive record and stops where it stops. It is <b>not</b> a
                statement about where this storm is now.
              </Refusal>
            ) : null}
            <Row k={view ? "operational peak" : "archive peak"}
              v={<Num value={view ? view.peak_vmax_kt : s.max_vmax_kt} unit="kt" />} />
            <Row k="minimum pressure"
              v={<Num value={view ? view.min_mslp_mb : s.min_mslp_mb} unit="mb" />} />
            <Row k="class" v={<Txt value={CAT_LABEL[headCategory] || headCategory} />} />
            <Row k="genesis" v={<Txt value={formatPosition(s.genesis_lat, s.genesis_lon)} />} />
            {counted ? <Row k="counted in" v={<Txt value={counted} />} /> : null}
            <button type="button" className="at-tbtn at-wide" data-open-record
              style={{ marginTop: 9, width: "100%" }}
              onClick={() => setOpenRecord(true)}>
              OPEN RECORD — TRACK, LANDFALLS, ENVIRONMENT, QUALITY →
            </button>
          </div>
        </div>
      ) : null}

      <div className="at-insp-body" style={openRecord ? undefined : { display: "none" }}>
      <div className="at-pad">
        {openRecord ? (
          <button type="button" className="at-tbtn" data-close-record
            style={{ marginBottom: 9 }} onClick={() => setOpenRecord(false)}>
            ← BACK TO THE STRIP
          </button>
        ) : null}
        {/* FAIL CLOSED. The archive representation is shown -- it is what exists -- and it is
            shown under a refusal naming the instant it stops. A stale archive-only state must
            never be able to read as current truth, and this is where that is enforced on screen.
            `unk` is the registered kind: the archive holds no value past its own end. The status
            qualifies that entry rather than adding a seventh mark to the Epistemic Key. */}
        {state === LIVE_UNAVAILABLE ? (
          <Refusal kind="unk"
            status={`LIVE CONTINUATION UNAVAILABLE — ARCHIVE REPRESENTATION ENDS ${fmtUTC(s.end_t) || "AT AN UNRECORDED TIME"}`}>
            {(live && live.reason) || "The operational record could not be read."} Everything
            below is the provisional archive record and stops where it stops. It is <b>not</b> a
            statement about where this storm is now.
          </Refusal>
        ) : null}

        {/* WHERE THE TWO RECORDS DISAGREE. Precedence decided what is SHOWN; it did not make the
            other number untrue, and a reader is owed both. Nothing here averages or reconciles. */}
        {live && live.disagreement && live.disagreement.length ? (
          <div data-source-disagreement>
            <Note style={{ marginTop: 9, color: "var(--flag)" }}>
              <b>THE TWO RECORDS DISAGREE.</b> Both are printed; neither is adjusted to the other.
            </Note>
            {live.disagreement.map((d) => (
              <Row key={d.key} k={d.label} title={d.why}
                v={<span style={{ ...MONO, fontSize: 9.5 }}>
                  <span style={{ color: "var(--t3)" }}>ARCHIVE </span>{d.archive}
                  <span style={{ color: "var(--t3)" }}> · OPERATIONAL </span>{d.operational}
                </span>} />
            ))}
          </div>
        ) : null}

        {/* INTENSITY LEADS, AND GENESIS FOLLOWS IT.
            The dock's body is 76 visible pixels at 1440x900 -- the head takes its floor and the
            bridge its 46% -- so whatever is first is the only section a reader sees without
            scrolling. What this panel is asked to make legible in seconds is which record is
            speaking and how strong the storm got; the genesis instant is one row and it is the
            row after. This is the same order in every state, so the panel does not rearrange
            itself under a reader who selects a second storm. */}
        <Head n="01" right={<SrcTag src={view ? "OPERATIONAL" : "ARCHIVE"}
          extra={headCategory ? headCategory.toUpperCase() : "no class"} />}>
          Intensity
        </Head>
        {view ? <OperationalIntensity view={view} storm={s} /> : <ArchiveIntensity storm={s} q={q} />}

        {/* THE HEAD SAYS ARCHIVE EVEN WHEN AN OPERATIONAL RECORD GOVERNS, because the genesis
            point is the one value on this panel that stays the archive's in every state: it is
            what every cohort matches on. The operational deck's own first fixes are printed
            below it, each row labelled, rather than replacing it. */}
        {/* THE REPLAY CONTROL SITS UNDER THE FIGURE IT REPLAYS, not above it.
            76 visible pixels of body is the whole budget at 1440x900, and a control at the top
            spends a third of it before the reader has been told anything. The transport at the
            foot of the page carries the same play control whenever a storm is selected, so this
            one is the second way in rather than the only one. */}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button type="button" onClick={onReplay} data-storm-replay
            className={replaying ? "at-tbtn at-wide at-on" : "at-tbtn at-wide"}>
            {replaying ? "❚❚ PAUSE REPLAY" : "▶ REPLAY THIS STORM"}
          </button>
        </div>

        <Head n="02" right={<SrcTag src="ARCHIVE" extra={view ? "+ OPERATIONAL" : null} />}>
          Genesis
        </Head>
        <Row k={view ? "first tropical fix · archive" : "first tropical fix"}
          v={<Txt value={fmtUTC(s.genesis_t)} />}
          title="The archive defines genesis as the first TROPICAL point in the best track. This
                 is the archive's own column, and it is the point a cohort matches on." />
        <Row k={view ? "position · archive" : "position"}
          v={s.genesis_lat === null ? <Txt value={null} />
            : <Txt value={formatPosition(s.genesis_lat, s.genesis_lon)} />} />
        {view ? (
          <>
            {/* The operational deck's own first fixes. Reported beside the archive's rather than
                instead of them: where the two agree, that agreement is itself worth seeing. */}
            <Row k="first tropical fix · operational" dim={cycle && cycle.genesis === null}
              v={<span><Txt value={fmtUTC(cycle ? cycle.genesis : null)}
                absent="the operational deck carries no tropical fix" /><Drv
                title="Derived: the first fix of the operational deck whose stage is tropical, by
                       the archive's own status vocabulary." /></span>} />
            <Row k="first fix of any kind · operational"
              v={<Txt value={fmtUTC(cycle ? cycle.first_fix : null)} />}
              title="The operational deck may begin before genesis, as a disturbance or a low." />
            <Row k="stage at first fix · operational"
              v={<Txt value={cycle ? cycle.first_stage : null} transform="upper" />} />
          </>
        ) : (
          <>
            <Row k="first fix of any kind" v={<Txt value={fmtUTC(s.first_track_t)} />}
              title="The best track may begin before genesis, as a disturbance or a low." />
            <Row k="stage at first fix" v={<Txt value={s.first_track_stage} transform="upper" />} />
          </>
        )}

        <Head n="03" right={<SrcTag src={view ? "DERIVED" : "ARCHIVE"} extra="hours from genesis" />}>
          Intensification
        </Head>
        <Note style={{ marginBottom: 6 }}>
          A dash means the storm <b>never reached</b> the threshold — not that it happened at
          hour zero.
          {view ? (
            <> These are re-derived from the <b>operational</b> fixes by the archive&rsquo;s own
              crossing rule — first fix at or above the threshold, at or after genesis. The
              archive&rsquo;s own crossing columns describe its provisional record, which stops
              at {fmtUTC(s.end_t)}, and would contradict the peak above.</>
          ) : null}
        </Note>
        <Ladder storm={s} cycle={view ? cycle : null} />
        <Row k="time to peak"
          v={<span>
            <Txt value={fmtHours(view ? (cycle && cycle.hours_to_peak) : s.hours_to_peak)} />
            {view ? <Drv /> : null}
          </span>} />

        <Head n="04" right={<SrcTag src="ARCHIVE" extra={String(s.landfalls.length || "none")} />}>
          Landfall
        </Head>
        {/* THE LANDFALL RULE IS THE ARCHIVE'S AND IT RUNS ON THE ARCHIVE'S TRACK. The operational
            deck is not tested against the coastline geometry, and saying so is the difference
            between "no landfall" and "no landfall was looked for past here". */}
        {view ? (
          <Note style={{ marginBottom: 6, color: "var(--flag)" }}>
            The archive detects landfall by crossing its own coastline polygons with the
            <b> archive</b> track, which ends {fmtUTC(s.end_t)}. The operational fixes after that
            instant have <b>not</b> been tested against a coastline by this build.
          </Note>
        ) : null}
        {s.landfalls.length === 0 ? (
          <Note>
            No coastline crossing was detected for this storm in the five modelled regions.
          </Note>
        ) : s.landfalls.map((l, i) => <LandfallGroup key={i} l={l} />)}

        <Head n="05" right={<SrcTag src="ARCHIVE"
          extra={`±${archive.manifest.env_genesis_window_hours} h of genesis`} />}>
          Environment at genesis
        </Head>
        <EnvNote storm={s} archive={archive} />

        {/* THE SECOND ENVIRONMENT QUESTION, WHICH IS NOT THE FIRST ONE.
            "What was the air like when this storm formed" and "what is the air like around it
            now" are different questions with different sources, different eras and different
            answers. They were never on this panel together; putting them in one block would have
            made them look like one measurement. */}
        {view && view.ships_rt ? (
          <>
            <Head n="06" right={<SrcTag src="OPERATIONAL" extra="tau 0" />}>
              Latest operational environment
            </Head>
            <OperationalEnv env={view.ships_rt} latest={view.latest} />
          </>
        ) : null}

        <Head n={view && view.ships_rt ? "07" : "06"} right={<SrcTag src="ARCHIVE" />}>
          Data quality
        </Head>
        {view ? (
          <>
            {/* THE OPERATIONAL DENOMINATORS FIRST, because they describe the record on screen. */}
            <Row k="operational fixes" v={<Num value={view.fix_count} />}
              title="Every fix in the operational b-deck. A b-deck has no interpolated rows: each
                     one is the forecast office's own analysis." />
            <Row k="operational fixes with a wind"
              v={<OverDenom n={view.fixes_with_wind} of={view.fix_count} />} />
            <Row k="operational fixes with a pressure"
              v={<OverDenom n={view.fixes_with_pressure} of={view.fix_count} />}
              tone={view.fixes_with_pressure < view.fix_count ? "var(--flag)" : undefined} />
            <Row k="operational source" dim
              v={<Txt value={view.provenance ? view.provenance.name : null} />} />
            <Row k="operational read at" dim v={<Txt value={fmtUTC(view.fetched_at)} />}
              title="When this pipeline read the deck. Distinct from the fix's own valid time,
                     which is the row above the badge." />
            <Row k="operational record" dim
              v={<Txt value={view.active ? "ACTIVE — still being written" : "RETAINED — the storm has left the active feed"} />} />
            <div className="at-grouprule" />
          </>
        ) : null}
        <Row k={view ? "archive fixes" : "observed fixes"}
          v={<OverDenom n={q.observed} of={q.total} />}
          title="The source published this position and intensity at this time." />
        <Row k="interpolated fixes" tone={q.interpolated ? "var(--flag)" : undefined}
          v={<OverDenom n={q.interpolated} of={q.total} />}
          title="IBTrACS interpolated these; the archive never creates a row of its own." />
        {q.provisional ? <Row k="provisional fixes" tone="var(--flag)"
          v={<OverDenom n={q.provisional} of={q.total} />} /> : null}
        {q.crossings_interpolated_only ? (
          <Note style={{ marginTop: 7 }}>
            <b style={{ color: "var(--flag)" }}>
              THRESHOLD CROSSINGS REST ON INTERPOLATED FIXES
            </b> — this track carries no observed point, so the archive fell back to its
            interpolated ones and flagged the row ({s.genesis_source_key}).
          </Note>
        ) : null}
        <Row k="archive track ends" dim v={<Txt value={fmtUTC(s.end_t)} />} />
        <Row k="track type" dim v={<Txt value={s.track_type} />} />
        <Row k="storm id" dim v={<Txt value={s.storm_id} />} />
        <Row k="source" dim v={<Txt value={s.source_key} />} />
        {view ? <Refusal kind="cond">{claimText("atlas.operational")}</Refusal> : null}

        {/* THE CITATION, AT THE FOOT OF THE RECORD IT CITES. It was in the masthead, where the
            96px floor kept it inside a scroll box, and briefly at the top of the body, where it
            occupied the whole of the 76 visible pixels and a reader's first sight of the panel
            was a URL rather than the storm. It is a copy affordance; it belongs with the source
            rows above it. */}
        {spec ? <CohortSpec text={spec} url={specUrl} /> : null}

      </div>
      </div>

      {/* PINNED. Outside the scrolling body, so it is on screen whatever the reader has scrolled
          to -- and asserted as such by scripts/check-inspector-bridge.mjs, which drives the body
          to its full scroll extent and requires the bridge to still be in the viewport. */}
      <div className="at-insp-bridge" data-bridge-pinned>
        <Head n={view && view.ships_rt ? "08" : "07"}>This storm in the archive</Head>
        <Bridge storm={s} archive={archive} bridge={bridge} result={result}
          cohortSentence={cohortSentence} onBridge={onBridge} onClose={onClose}
          cursorLive={cursorLive} operational={!!view} />
      </div>
    </div>
  );
}

/* THE SOURCE TAG ON A SECTION HEAD.
 *
 * Three words and no fourth. ARCHIVE, OPERATIONAL, DERIVED -- the same three the file header
 * names, set in the head's annotation slot where the category used to sit alone. It is CHROME
 * INK in every state: provenance is not severity, and a red OPERATIONAL tag would read as a
 * warning about the storm rather than a statement about the file. */
const SRC_TONE = {
  ARCHIVE: "var(--t3)",
  OPERATIONAL: "var(--accent)",
  DERIVED: "var(--t3)",
};

function SrcTag({ src, extra }) {
  return (
    <span data-src-tag={src} style={{ ...MONO, fontSize: 9, letterSpacing: ".7px" }}>
      <span style={{ color: SRC_TONE[src] || "var(--t3)" }}>{src}</span>
      {extra ? <span style={{ color: "var(--t3)" }}> · {extra}</span> : null}
    </span>
  );
}

/* The headline block, ARCHIVE. Byte for byte what this panel always printed. */
function ArchiveIntensity({ storm: s, q }) {
  return (
    <>
      <Figure tone={s.max_category ? CATEGORY_INK[s.max_category] : "var(--t2)"}
        value={s.peak_vmax_kt === null ? "—" : Math.round(s.peak_vmax_kt).toLocaleString()}
        denom={s.peak_vmax_kt === null
          ? "NO INTENSITY RECORDED"
          : <>kt peak · {CAT_LABEL[s.max_category] || "no class"}</>} />
      <Capt>
        Peak of the recorded fixes · <OverDenom n={q.observed} of={q.total} /> observed
      </Capt>
      <Row k="minimum pressure" v={<Num value={s.min_mslp_mb} unit="mb"
        absent="no central pressure was recorded for this storm" />} />
      <Row k="lifetime" v={<span><Txt value={fmtHours(s.lifetime_hours)} /><Drv
        title="Derived: end of track minus genesis. The archive stores no lifetime column." /></span>}
        title="Derived: end of track minus genesis. The archive stores no lifetime column." />
      <Row k="track fixes" v={<Num value={s.track_points} />} />
    </>
  );
}

/* The headline block, OPERATIONAL.
 *
 * "OPERATIONAL TO DATE" IS THE MEASUREMENT, not a hedge on it. For a storm still being written
 * up this is the maximum over the fixes that exist, and the storm has not finished; calling it a
 * peak without qualification would be the same false completeness claim "whole life" was.
 *
 * The class beside the wind is DERIVED and says so: ATCF publishes a STAGE (HU) and not a
 * Saffir-Simpson class, so the class is this build applying the archive's own ladder to the
 * operational wind. */
function OperationalIntensity({ view, storm }) {
  const dur = view.span_hours;
  return (
    <>
      <Figure tone={view.peak_category ? CATEGORY_INK[view.peak_category] : "var(--t2)"}
        value={view.peak_wind_kt === null ? "—" : Math.round(view.peak_wind_kt).toLocaleString()}
        denom={view.peak_wind_kt === null
          ? "NO INTENSITY IN THE OPERATIONAL RECORD"
          : <>kt OPERATIONAL TO DATE · {CAT_LABEL[view.peak_category] || "no class"}</>} />
      <Capt>
        Highest wind in the operational b-deck so far ·{" "}
        <OverDenom n={view.fixes_with_wind} of={view.fix_count} /> fixes carry one
        {view.peak_wind_at !== null ? <> · reached {fmtUTC(view.peak_wind_at)}</> : null}
      </Capt>
      <Row k="minimum pressure · operational to date"
        v={<Num value={view.min_mslp_mb} unit="mb"
          absent="no central pressure appears in the operational record" />}
        title={view.min_mslp_at !== null
          ? `Lowest pressure in the operational b-deck so far, at ${fmtUTC(view.min_mslp_at)}.`
          : undefined} />
      <Row k="latest fix"
        v={<span style={{ ...MONO }}>
          <Num value={view.latest ? view.latest.kt : null} unit="kt"
            absent="the latest operational fix carries no wind" />
          {view.stage_label ? <span style={{ color: "var(--t2)" }}> · {view.stage_label}</span> : null}
        </span>}
        title="The last fix in the operational deck — where the storm IS, not where it peaked." />
      <Row k="latest position"
        v={<Txt value={view.latest && view.latest.lat !== null
          ? formatPosition(view.latest.lat, view.latest.lon) : null} />} />
      <Row k="operational span"
        v={<span><Txt value={fmtHours(dur)} /><Drv
          title="Derived: last operational fix minus first. This is how much record EXISTS, not
                 how long the storm lived — an active storm has not finished." /></span>}
        title="Derived: last operational fix minus first. Not a lifetime: the record is open." />
      <Row k="operational fixes" v={<Num value={view.fix_count} />} />
      {/* THE ARCHIVE'S OWN HEADLINE, KEPT VISIBLE. Precedence decides what leads; it does not
          delete the other record, and a reader comparing this surface against IBTrACS is owed the
          number IBTrACS publishes. */}
      <div className="at-grouprule" />
      <Row k="archive peak · IBTrACS provisional" dim
        v={<Num value={storm.max_vmax_kt} unit="kt"
          absent="the archive recorded no wind for this storm" />}
        title="The provisional IBTrACS row, unchanged. It is what the research surfaces on this
               page read, and it is not what the figure above reports." />
      <Row k="archive minimum pressure" dim
        v={<Num value={storm.min_mslp_mb} unit="mb" absent="none recorded" />} />
      <Row k="archive track fixes" dim v={<Num value={storm.track_points} />} />
    </>
  );
}

/* The threshold ladder. Reads the operational lifecycle when one governs, the archive's own
   columns otherwise -- never a mixture of the two on the same row. */
function Ladder({ storm: s, cycle }) {
  const ROWS = [
    ["ts", "TROPICAL STORM · 34 kt", s.hours_to_ts, false],
    ["cat1", "CATEGORY 1 · 64 kt", s.hours_to_cat1, false],
    ["cat2", "CATEGORY 2 · 83 kt", s.hours_to_cat2, true],
    ["cat3", "CATEGORY 3 · 96 kt", s.hours_to_cat3, false],
    ["cat4", "CATEGORY 4 · 113 kt", s.hours_to_cat4, true],
    ["cat5", "CATEGORY 5 · 137 kt", s.hours_to_cat5, true],
  ];
  return (
    <>
      {ROWS.map(([k, label, archiveHours, archiveDerived]) => {
        const v = cycle ? (k in cycle.hours ? cycle.hours[k] : null) : archiveHours;
        const derived = cycle ? true : archiveDerived;
        return (
          <Row key={k} k={label} dim={v === null}
            title={cycle
              ? "Derived from the OPERATIONAL fixes by replaying the archive's own crossing rule: "
                + "the first fix at or above the threshold, at or after genesis."
              : archiveDerived
                ? "Derived by the Atlas pack by replaying the archive's own crossing rule; the "
                  + "archive stores no elapsed-hours column for this threshold."
                : "An archive column."}
            v={<span>
              <Txt value={fmtHours(v)} absent="this storm never reached this threshold" />
              {derived ? <Drv /> : null}
            </span>} />
        );
      })}
    </>
  );
}

/* THE LATEST OPERATIONAL ENVIRONMENT.
 *
 * A SEPARATE BLOCK FROM THE GENESIS ENVIRONMENT, AND IT MAY NEVER BE POOLED WITH IT. The archive's
 * environment is developmental SHIPS (1982-2022) and a one-year climatological-SST variant; this
 * is the OPERATIONAL SHIPS product, computed operationally on a live storm. engine/env.js already
 * refuses to pool those eras inside the archive, in the archive's own words. The same refusal
 * applies here and is printed here, because this is the first surface on which an operational row
 * and a developmental distribution are visible at once.
 *
 * Every field the product published, with the product's own label. Nothing is renamed into the
 * archive's column vocabulary -- a shared name is the first step towards a shared axis. */
function OperationalEnv({ env, latest }) {
  const keys = Object.keys(env.fields || {});
  return (
    <div data-operational-env={env.source}>
      <Row k="source" v={<Txt value={env.product} />} />
      <Row k="valid" v={<Txt value={fmtUTC(Date.parse(env.valid_time))} />}
        title="The operational run's own analysis time, at tau 0. Every other tau in that file is
               a FORECAST and none of them is shown here." />
      <Row k="read at" dim v={<Txt value={fmtUTC(Date.parse(env.fetched_at))} />} />
      <Row k="age at read" v={<span style={{ ...MONO }}>
        {env.age_hours === null ? "—" : `${env.age_hours.toFixed(1)} h`}
      </span>} />
      {/* THE POSITION, AND WHOSE IT IS. The operational SHIPS parse carries none, so what is
          shown is the storm's own position at the same instant -- from the b-deck. That is a
          different source in the same block, so it is named ON the row rather than in a tooltip
          nobody hovers. */}
      <Row k="position"
        v={<span>
          <Txt value={env.lat !== null && env.lat !== undefined
            ? formatPosition(env.lat, env.lon)
            : (latest && latest.lat !== null ? formatPosition(latest.lat, latest.lon) : null)}
            absent="neither this product nor the deck carries a position for this instant" />
          {(env.lat === null || env.lat === undefined) && latest && latest.lat !== null
            ? <span style={{ ...MONO, color: "var(--t3)", marginLeft: 6 }}>· FROM THE B-DECK</span>
            : null}
        </span>} />
      {keys.length === 0 ? (
        <Note style={{ marginTop: 6 }}>
          The run carried no usable field at tau 0.
        </Note>
      ) : keys.map((k) => (
        <Row key={k} k={env.fields[k].label || k}
          v={<span style={{ ...MONO }}>{env.fields[k].value}</span>} />
      ))}
      <Refusal kind="cond" status="OPERATIONAL SHIPS — NOT THE DEVELOPMENTAL ARCHIVE">
        {env.note} The genesis environment above comes from the developmental SHIPS archive; this
        comes from the operational file. They are sequential eras measured differently and this
        build does not pool, difference or compare them as one calibrated instrument.
      </Refusal>
    </div>
  );
}

/* THE BRIDGE, FROM ONE STORM TO THE POPULATION IT BELONGS TO.
 *
 * The flow this serves, in order: a selected storm, the genesis point the archive would match
 * on, the cohort that point defines, which of the reader's conditions this storm satisfies,
 * where it is itself part of the evidence, and the boundary past which the archive stops
 * answering. Everything here is a restatement of state the engine already decided.
 *
 * THE STORM STAYS IN THE COHORT. It satisfies the conditions, so under the methodology it is a
 * member, and removing it would be a new rule about which storms count. What is owed is that the
 * membership is SAID: `historical cohort including this storm`, `this storm is 1 of 59`, and --
 * where the archive's evidence is thin enough for one storm to matter -- how many of a contract's
 * observed events this storm is. On a 500 km Aug-Sep cohort around Iniki's genesis, Iniki
 * supplies 1 of the 1 observed Hawaii landfalls: the rate a reader would take as being ABOUT
 * this storm is composed ENTIRELY OF IT. Nothing on this panel can make that a good statistic,
 * and nothing should hide it either.
 *
 * AND THE COHORT IS BUILT FROM THE ARCHIVE, NEVER FROM THE OPERATIONAL TRACK. That was always
 * true and never had to be said, because there was only one record. With two on screen it does:
 * an operational storm's cohort is drawn from post-analysed IBTrACS storms, matched on the
 * ARCHIVE's genesis point, and not one operational value enters it.
 */
/* FOUR VERDICTS, NOT TWO. A condition is satisfied, or it is not -- unless the archive holds
   nothing to judge it with, which is rule 4 and is neither, or unless nothing tested it, which
   is an unknown the panel must not dress as a pass. NOT JUDGED is the one that matters: printing
   MISSED over a storm whose peak wind was never recorded would state an empirical no about a
   measurement that does not exist, which is the failure this whole surface is built to refuse.
   Its wording is the archive's own, from the same sentence the cohort panel prints. */
const VERDICT = {
  matched: { label: "MATCHED", tone: "var(--pos)" },
  missed: { label: "MISSED", tone: "var(--neg)" },
  unjudged: { label: "NOT JUDGED", tone: "var(--flag)",
    why: "The archive records no wind for this storm, so this condition could not judge it. It "
      + "is neither included nor counted as failing -- an absent measurement is not a zero." },
  unchecked: { label: "NOT CHECKED", tone: "var(--t3)",
    why: "This condition has no single-condition form the bridge can test, so nothing here "
      + "claims the storm satisfied it." },
};

function Bridge({ storm, archive, bridge, result, cohortSentence, onBridge, onClose, cursorLive,
  operational }) {
  const glat = storm.genesis_lat;
  const glon = storm.genesis_lon;
  if (glat === null || glon === null) {
    return (
      <Refusal kind="unk">
        The archive holds no genesis point for this storm, so there is no position to match on.
        A genesis-keyed cohort cannot place it — the same reason it is outside every cohort the
        rail can build.
      </Refusal>
    );
  }

  const at = formatPosition(glat, glon);
  const p = bridge && bridge.proposed;
  const con = bridge && bridge.contribution;
  const why = (bridge && bridge.why) || [];
  /* Bridged when the cohort's location condition IS this storm's genesis. Derived rather than
     tracked in state: a reader who moves the probe afterwards has stopped looking at the bridged
     cohort, and a flag would go on claiming they had not. */
  const onIt = !!(p && p.replaces
    && Math.abs(p.replaces.lat - glat) < 1e-6 && Math.abs(p.replaces.lon - glon) < 1e-6);
  /* WHAT ACTUALLY KEPT IT OUT. Three different facts, and the panel used to print one sentence
     for all of them. `provisionalScope` is excluded from `missed` deliberately: it is not one of
     the reader's conditions, and calling it one is the thing this distinction exists to stop. */
  const missed = why.filter((w) => w.verdict === "missed" && w.key !== "provisionalScope");
  const unjudged = why.filter((w) => w.verdict === "unjudged");
  const scopedOut = why.some((w) => w.key === "provisionalScope");

  return (
    <>
      <Row k="genesis point used for matching" v={<Txt value={at} />}
        title="The archive matches cohorts on where a storm FORMED. This is that point, and it
               is the only position a cohort is ever built from -- never the storm's position at
               the replay cursor." />

      {/* THE SOURCE OF THE COHORT, SAID OUT LOUD, WHENEVER AN OPERATIONAL RECORD IS ON SCREEN.
          The reader has just been shown a 115-kt operational track; the population below is drawn
          from post-analysed IBTrACS storms and contains none of it. */}
      {operational ? (
        <Note style={{ marginTop: 7 }} hook="data-bridge-archive-scope">
          <b>THIS COHORT IS BUILT FROM THE HISTORICAL ARCHIVE</b>, not from the operational track
          above. It is matched on the <b>archive&rsquo;s</b> genesis point, drawn from IBTrACS
          storms, and no operational value enters it.
        </Note>
      ) : null}

      {!onIt ? (
        <>
          <Note style={{ marginTop: 7 }}>
            Build the historical cohort around this genesis point. Every other condition you have
            set is kept{p && p.kept.length ? <> — <b>{p.kept.join(", ")}</b></> : null}; only the
            location condition {p && p.replaces ? "is replaced" : "is added"}.
          </Note>
          <button type="button" onClick={onBridge} data-bridge-build
            className="at-tbtn at-wide" style={{ marginTop: 8, width: "100%" }}>
            BUILD HISTORICAL COHORT AROUND GENESIS →
          </button>
        </>
      ) : (
        <>
          {/* WHAT THE COHORT IS, IN THE SAME WORDS THE RAIL USES. One formatter, so the storm
              panel cannot describe the cohort differently from the surface that built it.

              AND THE LEAD FOLLOWS THE VERDICT, like the list heading below it. "Including this
              storm" is a membership CLAIM, and it was printed before membership had been
              consulted -- so on every non-member path the panel asserted inclusion three lines
              above its own bold denial, and on one reachable state described a cohort of zero
              storms as including this one. The bold lead is the sentence that survives a skim;
              it is the last place the two should be allowed to disagree. */}
          <Note style={{ marginTop: 7 }}>
            <b>{con && !con.isMember
              ? "Historical cohort built on this storm's genesis point"
              : "Historical cohort including this storm"}</b> — {cohortSentence
              ? cohortSentence.replace(/ — what happened next\?$/, "") : "the archive"}.
          </Note>

          {result ? (
            <Row k="cohort" v={<span style={{ ...MONO }}>
              {result.kept.toLocaleString()} storm{result.kept === 1 ? "" : "s"}{" "}
              <span style={{ color: result.sufficient ? "var(--pos)" : "var(--neg)" }}>
                {result.sufficient
                  ? `SUFFICIENT · ${result.n_cases} ≥ ${result.min_sample}`
                  : `BELOW SAMPLE · ${result.n_cases} < ${result.min_sample}`}
              </span>
            </span>} />
          ) : null}

          {con && con.isMember ? (
            <Row k="this storm" v={<span style={{ ...MONO, color: "var(--accent)" }}>
              is 1 of {con.n.toLocaleString()}
            </span>} />
          ) : con ? (
            /* WHY IT IS OUT, IN THE TERMS THAT ARE ACTUALLY TRUE OF IT.
               This note used to assert a condition failure and point at MISSED rows in every
               non-member state -- including the two states where there is no MISSED row to point
               at. On the unjudged path it sent a reader looking for a failure that does not
               exist, and the only row it could land on says the opposite: the archive never
               measured this storm, so rule 4 leaves it neither included nor counted as failing.
               On the provisional path the storm satisfies every condition the reader set and was
               excluded by the record scope, which the old sentence flatly denied. */
            <Note style={{ marginTop: 6, color: "var(--flag)" }}>
              <b>THIS STORM IS NOT IN THAT COHORT.</b> Its genesis defines the location
              condition. {missed.length
                ? "It does not satisfy every other condition you have set — the ones it misses "
                  + "are marked below."
                : unjudged.length
                  ? "The archive holds nothing to judge "
                    + (unjudged.length === 1 ? "one of your conditions" : "some of your conditions")
                    + " with, so it is left out of the cohort without being counted as failing — "
                    + "marked NOT JUDGED below."
                  : scopedOut
                    ? "It satisfies every condition you set; what excluded it is the record "
                      + "scope, because this season has not been post-analysed."
                    : "It is outside the population this cohort draws from."} The rates the
              cohort publishes are not about it.
            </Note>
          ) : null}

          {/* WHY IT MATCHED -- membership, condition by condition, decided by the engine's own
              filter rather than by anything this file knows about storms. */}
          {why.length ? (
            <>
              {/* THE HEADING FOLLOWS THE VERDICT. "Why it matched" over a list containing a
                  MISSED row is a sentence contradicting the thing underneath it, which is the
                  one place a reader skimming the list would take MISSED for a detail rather
                  than the reason the rates below are not about this storm. */}
              <Note style={{ marginTop: 9 }}>
                {con && !con.isMember
                  ? "Where it stands, condition by condition:"
                  : "Why it matched, condition by condition:"}
              </Note>
              {why.map((w) => (
                <Row key={w.key} k={w.label} dim={w.verdict === "missed"}
                  title={VERDICT[w.verdict] ? VERDICT[w.verdict].why : undefined}
                  v={<span style={{ ...MONO, fontSize: 9.5,
                    color: (VERDICT[w.verdict] || VERDICT.unchecked).tone }}>
                    {(VERDICT[w.verdict] || VERDICT.unchecked).label}
                    <span style={{ color: "var(--t3)" }}> · {w.value}</span>
                  </span>} />
              ))}
            </>
          ) : (
            <Note style={{ marginTop: 9 }}>
              The cohort carries no conditions beyond this genesis point, so there is nothing
              further to satisfy.
            </Note>
          )}

          {/* WHERE THIS STORM IS ITSELF THE EVIDENCE. The sharp end of keeping it in the cohort:
              a contract with two observed events, one of which is the storm being described, is
              a rate a reader must not take as independent of it. */}
          {con && con.isMember && con.contracts.length ? (
            <>
              <Note style={{ marginTop: 9, color: "var(--flag)" }}>
                This storm is part of the evidence for the contracts below — it is inside these
                numerators, not being compared against them.
              </Note>
              {con.contracts.map((c) => (
                <Row key={c.key} k={`${regionLabel(c.region)} · ${c.kind === "hurricane" ? "≥64 kt" : "any"}`}
                  v={<span style={{ ...MONO, fontSize: 9.5, color: "var(--flag)" }}>
                    supplies 1 of {c.count === null ? "—" : c.count.toLocaleString()} observed
                    event{c.count === 1 ? "" : "s"}
                  </span>} />
              ))}
            </>
          ) : null}

          {/* THE HAND-OFF. The outcomes, the comparison and every refusal live in the answer
              panel, which is the same column this one occupies -- so the way to read them is to
              put the storm down, and the button says exactly that rather than pretending the two
              can be read at once in one column. The map keeps both: the cohort stays lifted, the
              storm stays drawn over it. */}
          <button type="button" onClick={onClose} data-bridge-read
            className="at-tbtn at-wide" style={{ marginTop: 10, width: "100%" }}>
            WHAT HAPPENED TO THEM → (clears the storm, keeps the cohort)
          </button>
        </>
      )}

      {/* THE REPLAY GUARD. Stated whenever the transport is holding a position part-way along
          this track, because that is the one arrangement in which a genesis-conditioned cohort
          reads as a continuation of the storm in front of it. */}
      {cursorLive ? (
        <Note hook="data-bridge-replay-guard" style={{ marginTop: 9, color: "var(--warn)" }}>
          <b>THE TRANSPORT IS HOLDING A POSITION ON THIS TRACK.</b> The cohort is conditioned on
          where storms FORMED, not on where this one is at the cursor. It is not a continuation
          of this track and it is not a forecast from this point — it is what the record holds
          about storms that began near where this one began.
        </Note>
      ) : null}
    </>
  );
}

function LandfallGroup({ l }) {
  return (
    <div className="at-grp">
      <Row k={(l.sub_region || l.region || "—").replace(/_/g, " ")}
        tone={l.hurricane_at_landfall === true ? "var(--neg)" : undefined}
        v={<Num value={l.vmax_kt} unit="kt"
          digits={l.vmax_kt !== null && l.vmax_kt % 1 ? 1 : 0}
          absent="no wind was recorded at the crossing fix" />} />
      <Row k="region" dim v={<Txt value={l.region} />} />
      <Row k="crossed" v={<Txt value={fmtUTC(l.t)} />} />
      <Row k="position" v={<Txt value={formatPosition(l.lat, l.lon)} />} />
      <Row k="class at landfall" v={
        l.category
          ? <Txt value={l.category} transform="upper" />
          : <span title={"A segment crossing whose bracketing fixes disagreed about the "
              + "Saffir-Simpson class. The archive publishes no class rather than interpolating "
              + "one -- this is the rule that kept Iniki honest."}
              style={{ ...MONO, color: "var(--flag)", cursor: "help" }}>WITHHELD</span>} />
      <Row k="detection" dim v={
        <span>
          <Txt value={l.detection} />
          {l.derived ? <span style={{ ...MONO, color: "var(--flag)", marginLeft: 6 }}
            title="Derived: the great-circle segment between two published fixes crossed the
                   coastline polygon, and the intensity was interpolated between them.">
            DERIVED</span> : null}
        </span>} />
      {l.closest_approach_km !== null ? (
        <Row k="closest published fix" dim
          v={<Num value={l.closest_approach_km} unit="km" digits={1} />} />
      ) : null}
      {/* The archive's own withheld class, set as the refusal it is. The mark is the key's
          `notev` -- a ruled-out cell -- because this is a value the archive could have
          interpolated and declined to. */}
      {l.category ? null : (
        <Refusal kind="notev">
          The bracketing fixes disagreed about the Saffir-Simpson class at this crossing, so the
          archive publishes <b>no class at all</b> rather than a plausible one. The wind and the
          position above are the crossing's own; only the class is withheld.
        </Refusal>
      )}
      {l.suspect_relocation === true ? (
        <Note style={{ color: "var(--neg)", marginTop: 4 }}>
          SUSPECT RELOCATION — excluded from every rate the archive publishes (implied speed{" "}
          <Num value={l.implied_speed_kt} unit="kt" digits={1} />).
        </Note>
      ) : null}
    </div>
  );
}

function EnvNote({ storm, archive }) {
  const e = storm.env_at_genesis;
  if (!e || e.row < 0) {
    return (
      <Refusal kind="unk">
        The archive holds no environment record within {e ? e.window_hours : 12} hours of this
        storm's genesis. SHIPS begins in 1982 and its developmental file ends in 2023, so most of
        the record has none — <b>
          {archive.manifest.quality.storms_with_env_at_genesis.toLocaleString()} of{" "}
          {archive.manifest.counts.storms.toLocaleString()}
        </b> storms do.
      </Refusal>
    );
  }
  return (
    <>
      <Row k="record near genesis" v={<Txt value={`yes, ${e.dt_hours.toFixed(1)} h away`} />} />
      <Refusal kind="cond">{claimText("atlas.environment")}</Refusal>
    </>
  );
}
