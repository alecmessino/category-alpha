import { ReactNode, CSSProperties, ComponentType } from "react";

export interface SignalCardProps {
  /** anchor label, e.g. "Elida → KXHURCAT4" */
  label: ReactNode;
  /** signal side — sets the left rule + tint */
  signal?: "BUY" | "SELL" | "HOLD";
  /** signed edge in percent (e.g. +15.3) */
  edge?: number;
  /** model Cat1+ probability (0–100) */
  modelProb?: number;
  /** market-implied probability (0–100) */
  marketProb?: number;
  /** evidence-quality tier */
  conf?: "HIGH" | "MED" | "MEDIUM" | "LOW";
  /** tooltip reasons behind the confidence tier */
  confReason?: string;
  /** contract is not directly mapped (seasonal proxy only) */
  unmapped?: boolean;
  /** optional Badge component (from this system) for the confidence chip */
  Badge?: ComponentType<any>;
  style?: CSSProperties;
}

/**
 * SignalCard — a divergence signal: signed edge, centered edge meter, model vs
 * market probability, confidence tier, and BUY/SELL/HOLD side.
 * @startingPoint section="Data" subtitle="Divergence signal card" viewport="700x220"
 */
export function SignalCard(props: SignalCardProps): JSX.Element;
