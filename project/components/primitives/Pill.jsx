import React from "react";

/* Pill — rounded capsule chip. The strategy chip, command-center storm selector,
   and imagery-product toggles. size sm|md; active fills with an accent ring glow. */
export function Pill({ children, active = false, dotColor, mono = true, size = "md", onClick, style = {}, ...rest }) {
  const interactive = typeof onClick === "function";
  const pad = size === "sm" ? "4px 9px" : "5px 12px";
  return (
    <span onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: "7px",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: mono ? "var(--fs-mono-sm)" : "12px", fontWeight: 700,
      letterSpacing: mono ? ".5px" : ".2px", textTransform: mono ? "uppercase" : "none",
      padding: pad, borderRadius: "var(--radius-pill)", cursor: interactive ? "pointer" : "default",
      border: "1px solid " + (active ? "var(--accent-bright)" : "var(--border-dim)"),
      background: active ? "color-mix(in srgb, var(--accent) 15%, var(--surface-card))" : "var(--surface-sunken)",
      color: active ? "var(--accent)" : "var(--text-2)",
      boxShadow: active ? "var(--glow-accent)" : "none",
      transition: "all var(--ease-cam)", whiteSpace: "nowrap", lineHeight: 1.1, ...style,
    }} {...rest}>
      {dotColor && <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: dotColor, flex: "none" }} />}
      {children}
    </span>
  );
}
