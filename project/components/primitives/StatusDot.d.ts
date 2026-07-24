import { CSSProperties } from "react";

export interface StatusDotProps {
  /** feed / operational state */
  status?: "ok" | "live" | "stale" | "missing" | "neutral";
  /** raw color override (e.g. a PAI phase token) */
  color?: string;
  /** diameter in px */
  size?: number;
  /** force the live-pulse animation on/off (defaults on for live|ok) */
  pulse?: boolean;
  style?: CSSProperties;
}

/**
 * StatusDot — the small filled circle that signals feed freshness (green ok / amber
 * stale / grey missing) or a PAI phase color. Green pulses to mean "live".
 */
export function StatusDot(props: StatusDotProps): JSX.Element;
