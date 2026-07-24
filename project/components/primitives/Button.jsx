import React from "react";

/* Millibar Terminal button. Flat, tight, mono-or-sans by variant.
   variant: solid (ink fill) | accent (cyan fill) | segment (bordered toggle) | preset (mono chip)
   Segmented toggles set `active` on the selected one. */
export function Button({
  children, variant = "segment", size = "md", active = false,
  mono = false, disabled = false, onClick, title, style = {}, ...rest
}) {
  const pad = size === "sm" ? "5px 10px" : size === "lg" ? "7px 14px" : "6px 12px";
  const fs = size === "sm" ? "11px" : "12px";
  const base = {
    fontFamily: mono || variant === "preset" ? "var(--font-mono)" : "var(--font-sans)",
    fontWeight: 700, fontSize: fs, letterSpacing: mono ? "var(--track-mono)" : ".3px",
    padding: pad, borderRadius: "var(--radius-sm)", cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid var(--border-dim)", transition: "all var(--ease-ui)",
    display: "inline-flex", alignItems: "center", gap: "7px", lineHeight: 1,
    opacity: disabled ? 0.42 : 1, whiteSpace: "nowrap",
  };
  const skin = {
    solid: { background: "var(--surface-solid)", color: "var(--text-inverse)", borderColor: "var(--surface-solid)" },
    accent: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
    segment: active
      ? { background: "var(--surface-solid)", color: "#fff", borderColor: "var(--surface-solid)" }
      : { background: "var(--surface-card)", color: "var(--text-2)" },
    preset: active
      ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
      : { background: "var(--surface-sunken)", color: "var(--text-2)" },
  }[variant] || {};
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick}
      style={{ ...base, ...skin, ...style }} {...rest}>
      {children}
    </button>
  );
}
