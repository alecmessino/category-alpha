/* One storm, and its whole life.
 *
 * Every value here is an archive column, a count of archive rows, or a subtraction of two
 * archive timestamps. Where a column is null the panel says so and says why -- a storm whose
 * intensity was never recorded shows an em-dash for its peak, not a zero, and its
 * threshold-crossing rows are absent rather than false.
 *
 * Three distinctions this panel exists to keep visible, because each is a place the archive
 * knows something a prettier panel would flatten:
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
import { Capt, Drv, Figure, Head, MONO, Masthead, Note, Num, OverDenom, Refusal, Row, TextButton, Txt, claimText, fmtHours, fmtUTC, CATEGORY_INK } from "./kit.jsx";

const CAT_LABEL = { td: "TROPICAL DEPRESSION", ts: "TROPICAL STORM", cat1: "CATEGORY 1",
  cat2: "CATEGORY 2", cat3: "CATEGORY 3", cat4: "CATEGORY 4", cat5: "CATEGORY 5" };

export function StormPanel({ storm, archive, onClose, onReplay, replaying, spec, specUrl,
  bridge, cohortSentence, result, onBridge, cursorLive }) {
  if (!storm) return null;
  const s = storm;
  const catColor = s.max_category ? CATEGORY_INK[s.max_category] : "var(--t2)";
  const q = s.quality;

  const loc = (
    <>
      {s.season} · {s.basin}{s.genesis_subbasin ? ` / ${s.genesis_subbasin}` : ""} ·{" "}
      <span>{s.atcf_id || s.storm_id}</span>
    </>
  );

  return (
    /* THREE PARTS, AND ONLY THE MIDDLE ONE SCROLLS.
     *
     * The inspector is a flex column: the masthead is fixed, the whole-life blocks take the
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
     * its end at three content sizes and requires the bridge to still be on screen. */
    <div className="at-inspector" data-inspector>
      <div className="at-insp-head">
      <Masthead kicker="One storm, whole life"
        right={<TextButton onClick={onClose} title="clear selection">Clear</TextButton>}
        title={s.name || "UNNAMED"} titleClass="storm" loc={loc} spec={spec} specUrl={specUrl}>
        {s.provisional === true ? (
          <div style={{ ...MONO, marginTop: 8, fontSize: 9, color: "var(--flag)",
            letterSpacing: ".8px", border: "1px solid #4a3a14", padding: "3px 6px",
            display: "inline-block" }}>
            PROVISIONAL — THIS SEASON HAS NOT BEEN POST-ANALYSED
          </div>
        ) : null}
      </Masthead>
      </div>

      <div className="at-insp-body">
      <div className="at-pad">
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button type="button" onClick={onReplay} data-storm-replay
            className={replaying ? "at-tbtn at-wide at-on" : "at-tbtn at-wide"}>
            {replaying ? "❚❚ PAUSE REPLAY" : "▶ REPLAY THIS STORM"}
          </button>
        </div>

        <Head n="01">Genesis</Head>
        <Row k="first tropical fix" v={<Txt value={fmtUTC(s.genesis_t)} />}
          title="The archive defines genesis as the first TROPICAL point in the best track." />
        <Row k="position" v={s.genesis_lat === null ? <Txt value={null} />
          : <Txt value={formatPosition(s.genesis_lat, s.genesis_lon)} />} />
        <Row k="first fix of any kind" v={<Txt value={fmtUTC(s.first_track_t)} />}
          title="The best track may begin before genesis, as a disturbance or a low." />
        <Row k="stage at first fix" v={<Txt value={s.first_track_stage} transform="upper" />} />

        <Head n="02" right={s.max_category ? s.max_category.toUpperCase() : "no class"}>
          Intensity
        </Head>
        <Figure tone={catColor}
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

        <Head n="03" right="hours from genesis">Intensification</Head>
        <Note style={{ marginBottom: 6 }}>
          A dash means the storm <b>never reached</b> the threshold — not that it happened at
          hour zero.
        </Note>
        {[["ts", "TROPICAL STORM · 34 kt", s.hours_to_ts, false],
          ["cat1", "CATEGORY 1 · 64 kt", s.hours_to_cat1, false],
          ["cat2", "CATEGORY 2 · 83 kt", s.hours_to_cat2, true],
          ["cat3", "CATEGORY 3 · 96 kt", s.hours_to_cat3, false],
          ["cat4", "CATEGORY 4 · 113 kt", s.hours_to_cat4, true],
          ["cat5", "CATEGORY 5 · 137 kt", s.hours_to_cat5, true]].map(([k, label, v, derived]) => (
          <Row key={k} k={label} dim={v === null}
            title={derived
              ? "Derived by the Atlas pack by replaying the archive's own crossing rule; the "
                + "archive stores no elapsed-hours column for this threshold."
              : "An archive column."}
            v={<span>
              <Txt value={fmtHours(v)} absent="this storm never reached this threshold" />
              {derived ? <Drv /> : null}
            </span>} />
        ))}
        <Row k="time to peak" v={<Txt value={fmtHours(s.hours_to_peak)} />} />

        <Head n="04" right={String(s.landfalls.length || "none")}>Landfall</Head>
        {s.landfalls.length === 0 ? (
          <Note>
            No coastline crossing was detected for this storm in the five modelled regions.
          </Note>
        ) : s.landfalls.map((l, i) => <LandfallGroup key={i} l={l} />)}

        <Head n="05" right={`±${archive.manifest.env_genesis_window_hours} h of genesis`}>
          Environment
        </Head>
        <EnvNote storm={s} archive={archive} />

        <Head n="06">Data quality</Head>
        <Row k="observed fixes" v={<OverDenom n={q.observed} of={q.total} />}
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
        <Row k="track type" dim v={<Txt value={s.track_type} />} />
        <Row k="storm id" dim v={<Txt value={s.storm_id} />} />
        <Row k="source" dim v={<Txt value={s.source_key} />} />

      </div>
      </div>

      {/* PINNED. Outside the scrolling body, so it is on screen whatever the reader has scrolled
          to -- and asserted as such by scripts/check-inspector-bridge.mjs, which drives the body
          to its full scroll extent and requires the bridge to still be in the viewport. */}
      <div className="at-insp-bridge" data-bridge-pinned>
        <Head n="07">This storm in the archive</Head>
        <Bridge storm={s} archive={archive} bridge={bridge} result={result}
          cohortSentence={cohortSentence} onBridge={onBridge} onClose={onClose}
          cursorLive={cursorLive} />
      </div>
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

function Bridge({ storm, archive, bridge, result, cohortSentence, onBridge, onClose, cursorLive }) {
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

      {!onIt ? (
        <>
          <Note style={{ marginTop: 7 }}>
            Build the historical cohort around this genesis point. Every other condition you have
            set is kept{p && p.kept.length ? <> — <b>{p.kept.join(", ")}</b></> : null}; only the
            location condition {p && p.replaces ? "is replaced" : "is added"}.
          </Note>
          <button type="button" onClick={onBridge} data-bridge-build
            className="at-tbtn at-wide" style={{ marginTop: 8, width: "100%" }}>
            BUILD COHORT AROUND THIS GENESIS →
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
