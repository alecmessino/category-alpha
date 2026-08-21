/* THE ENVIRONMENT THESE STORMS FORMED IN.
 *
 * A LENS, NOT A FILTER, and the distinction is the whole of Phase 3.5. The reader can look at
 * the air this cohort formed in; they cannot yet condition on it. That is a measurement talking:
 * 1,461 of 3,959 storms carry any environment at all and none of it predates 1982, so a shear
 * condition would silently turn a 175-year archive into a 40-year one and present the result as
 * a stronger analog. Richer-looking and less true is the trade this repository exists to refuse.
 *
 * THREE THINGS THIS SURFACE WILL NOT DO.
 *   1. It will not pool sources. ships_dev, ships_dev+csst and ships_rt are sequential ERAS,
 *      and one of them substitutes a climatological sea-surface temperature for an observed
 *      one -- so a cohort spanning 2022 into 2023 has the DEFINITION of sst_c change underneath
 *      it. One block per source, never a combined number, and no code path that makes one.
 *   2. It will not download 991 KB to say "no". Coverage comes from the core pack, so the
 *      NOT EVALUABLE refusal and the per-cohort count are honest on first paint at zero cost.
 *      The distributions are opt-in, and the button says what they weigh.
 *   3. It will not report a mean. Quantiles with their own n, per field, per source -- because
 *      a field can be null on a row whose neighbours are present, and a spread is the only
 *      honest summary of a distribution nobody has shown to be symmetric.
 */

import React from "react";
import { LENS_FIELDS, eraWarning, nonPoolingNote } from "../engine/env.js";
import { Head, MONO, Row } from "./kit.jsx";
import { Refusal } from "./refusal.jsx";

const ENV_FILE = "atlas-env-v1.bin.gz";

export function EnvLens({ archive, coverage, lens, loading, onLoad, dataBase }) {
  if (!coverage) return null;
  const bytes = (archive.manifest.files[ENV_FILE] || {}).bytes || null;

  return (
    <>
      <Head right={<span style={{ ...MONO, fontSize: "var(--fs-mono-xs)",
        color: "var(--text-2)" }}>a lens, not a filter</span>}>
        THE ENVIRONMENT THEY FORMED IN
      </Head>

      <Row k="evaluable at genesis"
        title={`A storm is evaluable when the archive holds an environment record within ${coverage.windowHours} h of its genesis. The window is the archive's, not this surface's.`}
        v={<span style={{ ...MONO }}>
          {coverage.evaluable.toLocaleString()}
          <span style={{ color: "var(--text-2)" }}> / {coverage.n.toLocaleString()} storms</span>
        </span>} />
      {coverage.evaluable > 0 ? (
        <Row k="record era in this cohort"
          v={<span style={{ ...MONO }}>{coverage.earliest} – {coverage.latest}</span>} />
      ) : null}

      {/* THE FOURTH REFUSAL, wired to a real count rather than to a category. */}
      {coverage.notEvaluable > 0 ? (
        <Refusal kind="NOT_EVALUABLE"
          subject={`${coverage.notEvaluable.toLocaleString()} of ${coverage.n.toLocaleString()}`}
          detail={`No environment record within ${coverage.windowHours} h of genesis for these `
            + "storms. The environment record begins in 1982 and reaches under half this "
            + "archive; a storm outside it is not calm, it is unmeasured."} />
      ) : null}

      {coverage.evaluable === 0 ? null : !lens ? (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <button type="button" onClick={onLoad} disabled={loading} data-env-load style={{
            ...MONO, fontSize: "var(--fs-mono-xs)", padding: "6px 10px",
            background: "transparent", border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)", color: "var(--accent)",
            cursor: loading ? "wait" : "pointer",
          }}>
            {loading ? "LOADING…" : "SHOW THE DISTRIBUTIONS"}
          </button>
          <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            marginTop: 4, lineHeight: "var(--lh-body)" }}>
            {bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB, fetched once. ` : ""}
            Everything above came from the pack already loaded — stating what cannot be
            evaluated costs nothing.
          </div>
        </div>
      ) : (
        <>
          {/* THE NON-POOLING STATEMENT, in the archive's own words rather than a paraphrase. */}
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
            color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: "var(--sp-3)" }}>
            {nonPoolingNote(archive)}
          </div>
          {eraWarning(lens) ? (
            <div data-era-warning style={{
              border: "1px solid var(--border-strong)",
              borderLeft: "var(--bw-signal) solid var(--warn)",
              borderRadius: "var(--radius-sm)", padding: "var(--sp-3) var(--sp-4)",
              background: "color-mix(in srgb, var(--warn) 6%, transparent)",
              marginTop: "var(--sp-3)",
            }}>
              <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", fontWeight: 800,
                color: "var(--warn)", letterSpacing: ".5px" }}>
                ⧗ THIS COHORT CROSSES A SOURCE BOUNDARY
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)",
                color: "var(--text-2)", lineHeight: "var(--lh-body)", marginTop: 3 }}>
                {eraWarning(lens)}
              </div>
            </div>
          ) : null}

          {lens.sources.map((s) => <SourceBlock key={s.source} s={s} />)}
        </>
      )}

      <div style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        marginTop: "var(--sp-4)", lineHeight: "var(--lh-body)" }}>
        No environmental CONDITION is offered. Over {coverage.n === 0 ? "this" : "this"} record
        an environmental filter would answer a 40-year question while looking like a 175-year
        one. The condition arrives when the coverage supports it, not when the interface would
        look richer for having it.
      </div>
    </>
  );
}

/* One source, alone. There is no aggregate row here and there is no place to put one: the
   sources measure different things under the same column names. */
function SourceBlock({ s }) {
  return (
    <div data-env-source={s.source} style={{
      border: "1px solid var(--border-dim)", borderRadius: "var(--radius-sm)",
      padding: "var(--sp-4) var(--sp-5)", marginTop: "var(--sp-3)",
      background: "var(--surface-sunken)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        gap: "var(--sp-4)" }}>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-sm)", color: "var(--accent)" }}>
          {s.source}
        </span>
        <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}>
          {s.storms.toLocaleString()} storm{s.storms === 1 ? "" : "s"}
          {s.first !== null ? ` · ${utcDay(s.first)} → ${utcDay(s.last)}` : null}
        </span>
      </div>

      {LENS_FIELDS.map((f) => {
        const d = s.fields[f.key];
        return (
          <div key={f.key} style={{ display: "flex", alignItems: "baseline",
            justifyContent: "space-between", gap: "var(--sp-3)", padding: "2px 0" }}>
            <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
              letterSpacing: "var(--track-label)" }}>{f.label}</span>
            {d.n === 0 ? (
              <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)" }}
                title="No storm of this source carries a value for this field.">
                — not recorded
              </span>
            ) : (
              <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)" }}>
                {d.median.toFixed(f.digits)}
                <small style={{ color: "var(--text-2)" }}> {f.unit}</small>
                <span style={{ color: "var(--text-2)" }}>
                  {" "}· p25 {d.p25.toFixed(f.digits)} · p75 {d.p75.toFixed(f.digits)} · n {d.n}
                </span>
              </span>
            )}
          </div>
        );
      })}

      {/* The archive's own method string for the rows in play. A source whose index was
          computed differently says so in its own words rather than in a footnote someone
          would have to remember to update. */}
      {s.methods.length ? (
        <details style={{ marginTop: "var(--sp-3)" }}>
          <summary style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
            cursor: "pointer" }}>▸ how this source's index was computed</summary>
          {s.methods.map((m, i) => (
            <div key={i} style={{ fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-caption)", color: "var(--text-2)",
              lineHeight: "var(--lh-body)", marginTop: 3 }}>{m}</div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

/** A source era, to the day. Hours would imply a precision the boundary does not have.
 *  The archive's `t` is MINUTES since the epoch, the same unit genesis_t uses. */
function utcDay(t) {
  if (t === null || t === undefined) return null;
  return new Date(t * 60000).toISOString().slice(0, 10);
}
