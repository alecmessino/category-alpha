import { CSSProperties } from "react";

export interface ProvenanceFooterProps {
  /** data source / lineage, e.g. "NHC / RECON" */
  source?: string;
  /** feed latency, e.g. "4m" */
  latency?: string;
  /** artifact version, e.g. "1.2.4" */
  version?: string;
  /** evidence-quality tier — A (pos) / B (warn) / C (neg), rendered as a tinted chip */
  tier?: "A" | "B" | "C";
  /** extra freeform key/value fields appended after the named ones */
  items?: { k: string; v: string }[];
  style?: CSSProperties;
}

/**
 * ProvenanceFooter — the monospaced observability micro-footer every card should carry:
 * [ Source: NHC / RECON · Latency: 4m · Ver: 1.2.4 · Tier: A ]. Makes freshness and
 * lineage impossible to miss (radical-provenance directive).
 * @startingPoint section="Surfaces" subtitle="Monospace provenance micro-footer" viewport="700x120"
 */
export function ProvenanceFooter(props: ProvenanceFooterProps): JSX.Element;
