import React from "react";

/* Tonal status badge — the terminal's b-ok/warn/bad/vio badges, livebadge, and
   PASS/FAIL/BLOCKED health chips. Tint is a color-mix over the semantic tone token,
   so it flips correctly on light vs tactical surfaces.
   tone: neutral | pos | warn | neg | special | live | seeded */
const TONE = {
  neutral: "var(--text-2)", pos: "var(--pos)", warn: "var(--warn)",
  neg: "var(--neg)", special: "var(--special)", live: "var(--pos)", seeded: "var(--warn)",
};
export function Badge({ children, tone = "neutral", mono = true, dot = false, style = {}, ...rest }) {
  const c = TONE[tone] || TONE.neutral;
  const bg = tone === "neutral"
    ? "var(--surface-sunken)"
    : `color-mix(in srgb, ${c} 14%, transparent)`;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: "var(--fs-mono-xs)", fontWeight: 700, letterSpacing: ".5px",
      color: c, background: bg, padding: "3px 8px", borderRadius: "5px",
      whiteSpace: "nowrap", lineHeight: 1.2, ...style,
    }} {...rest}>
      {dot && <span style={{
        width: "6px", height: "6px", borderRadius: "50%", background: c, flex: "none",
        animation: tone === "live" ? "ca-pulse 2s infinite" : "none",
      }} />}
      {children}
    </span>
  );
}
