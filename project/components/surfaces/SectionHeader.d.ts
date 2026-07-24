import { ReactNode, CSSProperties } from "react";

export interface SectionHeaderProps {
  children?: ReactNode;
  /** left-rule color — tone name or raw color/var */
  tone?: "accent" | "pos" | "warn" | "neg" | "special" | string;
  style?: CSSProperties;
}

/**
 * SectionHeader — uppercase, tracked, muted label with a left accent rule. Titles a
 * module inside a column ("STRIKE ZONE", "DIVERGENCE SIGNALS", "EDGE MATRIX").
 */
export function SectionHeader(props: SectionHeaderProps): JSX.Element;
