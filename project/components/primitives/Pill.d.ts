import { ReactNode, CSSProperties } from "react";

export interface PillProps {
  children?: ReactNode;
  /** selected — accent fill + ring glow */
  active?: boolean;
  /** optional leading color dot (e.g. PAI phase / storm color) */
  dotColor?: string;
  mono?: boolean;
  size?: "sm" | "md";
  onClick?: () => void;
  style?: CSSProperties;
}

/**
 * Rounded capsule chip — the "Category Alpha" strategy chip, Command-Center storm
 * selector, and imagery-product toggles.
 * @startingPoint section="Primitives" subtitle="Capsule chip / storm selector" viewport="700x150"
 */
export function Pill(props: PillProps): JSX.Element;
