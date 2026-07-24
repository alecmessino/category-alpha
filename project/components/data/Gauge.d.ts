import { CSSProperties } from "react";

export interface GaugeProps {
  /** 0–100 */
  value?: number;
  /** solid fill color (ignored if gradient) */
  color?: string;
  /** use the cyan→violet gradient fill */
  gradient?: boolean;
  height?: number;
  style?: CSSProperties;
}

/**
 * Gauge — thin telemetry progress bar (SST anomaly, probability, generic ratio).
 */
export function Gauge(props: GaugeProps): JSX.Element;
