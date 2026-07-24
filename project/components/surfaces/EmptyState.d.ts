import { CSSProperties } from "react";

export interface EmptyStateProps {
  /** bracketed headline, e.g. "SYSTEM AWAITING TELEMETRY" */
  title?: string;
  /** plain-language line under the title */
  message?: string;
  /** bullet list rendered under "Awaiting:" */
  awaiting?: string[];
  /** pipeline-status value */
  status?: string;
  statusTone?: "pos" | "warn" | "neg" | "special" | "neutral";
  style?: CSSProperties;
}

/**
 * EmptyState — the cinematic terminal empty state. Replaces generic "No data
 * available" fallbacks with a monospaced telemetry-style block (rule lines,
 * bracketed title, awaiting list, pipeline status).
 * @startingPoint section="Surfaces" subtitle="Cinematic terminal empty state" viewport="700x260"
 */
export function EmptyState(props: EmptyStateProps): JSX.Element;
