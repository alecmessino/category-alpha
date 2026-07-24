import React from "react";

/* SectionHeader — the .sec label: uppercase, tracked, muted, with a left accent rule.
   Separates modules inside a column. tone sets the rule color. */
const RULE = {
  accent: "var(--accent)", pos: "var(--pos)", warn: "var(--warn)",
  neg: "var(--neg)", special: "var(--special)",
};
export function SectionHeader({ children, tone = "accent", style = {}, ...rest }) {
  return (
    <div style={{
      fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "1px", color: "var(--text-2)",
      borderLeft: "var(--bw-accent) solid " + (RULE[tone] || tone),
      paddingLeft: "10px", margin: "var(--sp-8) 0 10px", ...style,
    }} {...rest}>{children}</div>
  );
}
