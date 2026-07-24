import { ReactNode, CSSProperties } from "react";

export interface HealthRowProps {
  name: ReactNode;
  /** monospaced detail line */
  detail?: ReactNode;
  status?: "PASS" | "EMPTY" | "BLOCKED" | "FAIL";
  style?: CSSProperties;
}

/**
 * HealthRow — one operational system-health check with a PASS/EMPTY/BLOCKED/FAIL chip.
 * @startingPoint section="Telemetry" subtitle="System-health check row" viewport="700x120"
 */
export function HealthRow(props: HealthRowProps): JSX.Element;
