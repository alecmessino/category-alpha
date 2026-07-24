import { CSSProperties } from "react";

export interface FeedStream {
  /** short feed code, e.g. "ATCF" / "RECON" / "SST" */
  name: string;
  status: "ok" | "stale" | "missing";
  /** human age, e.g. "4m" (ignored when missing) */
  age?: string;
  /** evidence-quality penalty shown in the diagnostic popover, e.g. "−1 tier" */
  penalty?: string;
}
export interface IngestionHUDProps {
  streams: FeedStream[];
  /** clickable diagnostic popover mapping latency → evidence penalty (default true) */
  diagnostics?: boolean;
  style?: CSSProperties;
}

/**
 * IngestionHUD — header feed-freshness pill. Dots are green (fresh) / amber (STALE) /
 * grey (MISSING, never red). Click to open a latency→evidence-penalty diagnostic.
 * @startingPoint section="Telemetry" subtitle="Feed-freshness HUD + diagnostics" viewport="700x140"
 */
export function IngestionHUD(props: IngestionHUDProps): JSX.Element;
