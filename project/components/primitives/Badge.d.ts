import { ReactNode, CSSProperties } from "react";

export interface BadgeProps {
  children?: ReactNode;
  /** semantic tone — maps to color + 14% tint */
  tone?: "neutral" | "pos" | "warn" | "neg" | "special" | "live" | "seeded";
  /** monospaced (default true — operational states are mono) */
  mono?: boolean;
  /** leading status dot (pulses when tone="live") */
  dot?: boolean;
  style?: CSSProperties;
}

/**
 * Tonal status badge — LIVE / SEEDED / STATIC ODDS honesty markers, PASS/FAIL/BLOCKED
 * health chips, confidence tiers, and BUY/SELL/HOLD tags.
 * @startingPoint section="Primitives" subtitle="Tonal status + honesty-marker badges" viewport="700x150"
 */
export function Badge(props: BadgeProps): JSX.Element;
