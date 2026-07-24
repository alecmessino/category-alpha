import { ReactNode, CSSProperties } from "react";

export interface EdgeCellProps {
  /** contract label, e.g. "KXHURCAT4-25 · Cat4+" */
  contract: ReactNode;
  /** Category Alpha edge in percent (radioactive glow at ≥15) */
  edge?: number;
  /** market-implied price (0–100) */
  marketPct?: number;
  /** order-book liquidity in dollars, or null */
  liquidity?: number | null;
  /** Kelly fields forwarded to the embedded KellyBar */
  theoretical?: number;
  capped?: number;
  allocation?: number;
  stakePct?: number;
  rawPct?: number;
  style?: CSSProperties;
}

/**
 * EdgeCell — one cell of the Edge Matrix / Alpha Surface: contract, Category Alpha
 * edge, market price + liquidity, and an embedded liquidity-capped KellyBar.
 * @startingPoint section="Data" subtitle="Edge Matrix / Alpha Surface cell" viewport="700x180"
 */
export function EdgeCell(props: EdgeCellProps): JSX.Element;
