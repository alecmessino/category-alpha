import { CSSProperties } from "react";

export interface KellyBarProps {
  /** theoretical Kelly fraction (0–1) — the translucent capacity layer */
  theoretical: number;
  /** liquidity-restricted fraction (0–1). Omit = uncapped (equals theoretical) */
  capped?: number;
  /** dollar allocation for the caption */
  allocation?: number;
  /** raw theoretical stake %, shown parenthetically */
  rawPct?: number;
  /** applied stake % (after fractional Kelly) */
  stakePct?: number;
  /** width magnifier for small fractions (codebase: 2.5) */
  scale?: number;
  showCaption?: boolean;
  style?: CSSProperties;
}

/**
 * KellyBar — liquidity-capped Q-Kelly allocation bar. Dual-layer: translucent
 * theoretical capacity behind a solid liquidity-restricted fill, with a red vertical
 * threshold marker at the liquidity limit. Raw Kelly is never shown in isolation.
 * @startingPoint section="Data" subtitle="Dual-layer liquidity-capped Kelly bar" viewport="700x120"
 */
export function KellyBar(props: KellyBarProps): JSX.Element;
