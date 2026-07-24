import React from "react";

/* Panel — the terminal's flat bordered card/section container. Optional header row
   (title + right slot) and an optional left accent rule (tone or raw color).
   Panels are border-only (no shadow); popups/drawers add --shadow-card themselves. */
export function Panel({
  children, title, right, accent, footer, pad = true, style = {}, bodyStyle = {}, ...rest
}) {
  const accentColor = accent && (accent.startsWith("var") || accent.startsWith("#") ? accent : {
    accent: "var(--accent)", pos: "var(--pos)", warn: "var(--warn)",
    neg: "var(--neg)", special: "var(--special)",
  }[accent]);
  return (
    <section style={{
      background: "var(--surface-card)", border: "1px solid var(--border-dim)",
      borderLeft: accentColor ? "var(--bw-signal) solid " + accentColor : undefined,
      borderRadius: "var(--radius-md)", overflow: "hidden", minWidth: 0, ...style,
    }} {...rest}>
      {(title || right) && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px",
          padding: "var(--pad-panel-hd)", borderBottom: "1px solid var(--border-dim)",
          background: "var(--surface-sunken)",
        }}>
          <span style={{
            fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700,
            letterSpacing: ".6px", textTransform: "uppercase", color: "var(--accent)",
          }}>{title}</span>
          {right && <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>{right}</span>}
        </div>
      )}
      <div style={{ padding: pad ? "var(--sp-6)" : 0, minWidth: 0, ...bodyStyle }}>{children}</div>
      {footer && <div style={{ borderTop: "1px solid var(--border-dim)" }}>{footer}</div>}
    </section>
  );
}
