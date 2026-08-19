/* The small pieces every panel is built from.
 *
 * ONE RULE RUNS THROUGH ALL OF THEM: a value the archive does not have renders as an em-dash
 * with a reason attached, never as zero and never as a blank. `Num` takes null and prints "—";
 * it has no code path that turns an absent value into a number. That is not defensive
 * programming, it is the product: this archive's whole claim is that it distinguishes "we
 * measured nothing" from "we measured nothing there".
 */

import React from "react";

const DS = globalThis.CategoryAlphaDesignSystem_a835cf || {};
export const { Panel, Badge, StatTile, EmptyState, ProvenanceFooter, StatusDot, SectionHeader,
  Button } = DS;

/* The claim registry, shared with the terminal and loaded by index.html. Capability prose --
   what this surface can and cannot answer -- is authored there and only there; components read
   claims and never write them. A missing registry is loud rather than silent, for the same
   reason an unknown claim id renders as UNREGISTERED rather than as nothing. */
const MTC = globalThis.MTC;

export function claimText(id) {
  if (!MTC) return "claim registry unavailable";
  return MTC.claim(id).text;
}

export const MONO = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/** A number, or an em-dash carrying the reason it is absent. */
export function Num({ value, unit, digits = 0, absent = "not recorded in the archive", tone }) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span title={absent} style={{ ...MONO, color: "var(--text-2)", cursor: "help" }}>—</span>
    );
  }
  // -0.0 appears throughout the archive's float columns; it is zero and should read as zero.
  const v = Object.is(value, -0) ? 0 : value;
  return (
    <span style={{ ...MONO, color: tone || "inherit" }}>
      {digits ? v.toFixed(digits) : Math.round(v).toLocaleString()}
      {unit ? <small style={{ color: "var(--text-2)", marginLeft: 2 }}>{unit}</small> : null}
    </span>
  );
}

/** A string value, or an em-dash. Same rule. */
export function Txt({ value, absent = "not recorded in the archive", tone, transform }) {
  if (value === null || value === undefined || value === "") {
    return (
      <span title={absent} style={{ ...MONO, color: "var(--text-2)", cursor: "help" }}>—</span>
    );
  }
  const s = transform === "upper" ? String(value).toUpperCase() : String(value);
  return <span style={{ ...MONO, color: tone || "inherit" }}>{s}</span>;
}

/** The label/value row the terminal uses everywhere. */
export function Row({ k, v, tone, title, dim }) {
  return (
    <div
      title={title}
      style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: "var(--sp-4)", padding: "3px 0", minWidth: 0,
        opacity: dim ? 0.6 : 1,
      }}
    >
      <span style={{
        ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--text-2)",
        letterSpacing: "var(--track-label)", textTransform: "uppercase", whiteSpace: "nowrap",
      }}>{k}</span>
      <span style={{
        ...MONO, fontSize: "var(--fs-mono-sm)", color: tone || "var(--text-1)",
        textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
      }}>{v}</span>
    </div>
  );
}

/** A section label with the design system's left rule. */
export function Head({ children, right }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      borderLeft: "var(--bw-accent) solid var(--accent)", paddingLeft: "var(--sp-3)",
      margin: "var(--sp-6) 0 var(--sp-3)", gap: "var(--sp-3)",
    }}>
      <span style={{
        fontFamily: "var(--font-sans)", fontSize: "var(--fs-label)", fontWeight: "var(--fw-bold)",
        letterSpacing: "var(--track-caps)", textTransform: "uppercase", color: "var(--text-1)",
      }}>{children}</span>
      {right}
    </div>
  );
}

export function Chip({ children, active, tone, onClick, title, disabled, chipKey }) {
  const c = tone || "var(--accent)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      /* A stable hook for the checks. Chips carry live counts in their label now, so matching
         them by visible text would break the moment the archive grows by one storm. */
      data-chip={chipKey}
      aria-pressed={active ? "true" : "false"}
      style={{
        ...MONO,
        fontSize: "var(--fs-mono-xs)",
        letterSpacing: "var(--track-label)",
        padding: "4px 7px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid " + (active ? c : "var(--border-strong)"),
        background: active ? `color-mix(in srgb, ${c} 16%, transparent)` : "transparent",
        color: active ? c : "var(--text-2)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "border-color var(--ease-ui), color var(--ease-ui), background var(--ease-ui)",
        whiteSpace: "nowrap",
      }}
    >{children}</button>
  );
}

/** A count with its denominator -- the shape the archive's own panels use. */
export function OverDenom({ n, of, tone }) {
  return (
    <span style={{ ...MONO, color: tone || "var(--text-1)" }}>
      {n.toLocaleString()}<span style={{ color: "var(--text-2)" }}> / {of.toLocaleString()}</span>
    </span>
  );
}

/* `Unscoreable` lived here and is gone: ui/refusal.jsx generalises it into the five states, so
   every refusal now comes from one definition instead of one component knowing about one of
   them. Left as a note rather than as a re-export, because a shim would let a caller keep
   rendering a refusal that cannot say whether the reader can do anything about it. */

/** A gap the archive recorded. Shown verbatim -- rewording one would change what it says. */
export function Gap({ text }) {
  return (
    <div style={{
      display: "flex", gap: "var(--sp-3)", padding: "var(--sp-3) 0",
      borderTop: "1px solid var(--border-dim)",
    }}>
      <span style={{ ...MONO, fontSize: "var(--fs-mono-xs)", color: "var(--warn)", flex: "none" }}>
        GAP
      </span>
      <span style={{
        fontFamily: "var(--font-sans)", fontSize: "var(--fs-caption)", color: "var(--text-2)",
        lineHeight: "var(--lh-body)",
      }}>{text}</span>
    </div>
  );
}

export function fmtUTC(ms, { time = true } = {}) {
  if (ms === null || ms === undefined) return null;
  const d = new Date(ms);
  const date = d.toISOString().slice(0, 10);
  return time ? `${date} ${d.toISOString().slice(11, 16)}Z` : date;
}

/** Hours as a human duration that never implies precision the archive lacks. */
export function fmtHours(h) {
  if (h === null || h === undefined || Number.isNaN(h)) return null;
  if (Math.abs(h) < 48) return `${Math.round(h)} h`;
  const d = h / 24;
  return `${d.toFixed(1)} d`;
}
