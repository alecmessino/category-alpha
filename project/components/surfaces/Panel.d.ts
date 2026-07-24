import { ReactNode, CSSProperties } from "react";

export interface PanelProps {
  children?: ReactNode;
  /** uppercase cyan header title */
  title?: ReactNode;
  /** right-aligned header slot (badges, toggles) */
  right?: ReactNode;
  /** left accent rule — tone name or a raw color/var */
  accent?: "accent" | "pos" | "warn" | "neg" | "special" | string;
  /** node rendered flush below the body (e.g. a ProvenanceFooter) */
  footer?: ReactNode;
  /** pad the body (default true) */
  pad?: boolean;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

/**
 * Panel — flat bordered card/section container with an optional uppercase header
 * and left accent rule. The base surface for every module in the terminal.
 * @startingPoint section="Surfaces" subtitle="Bordered panel with header + accent rule" viewport="700x300"
 */
export function Panel(props: PanelProps): JSX.Element;
