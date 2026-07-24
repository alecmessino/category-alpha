import { ReactNode, CSSProperties } from "react";

export interface ButtonProps {
  children?: ReactNode;
  /** solid = ink fill (primary action); accent = cyan fill; segment = bordered toggle tab; preset = mono value chip */
  variant?: "solid" | "accent" | "segment" | "preset";
  size?: "sm" | "md" | "lg";
  /** selected state for segment/preset toggles */
  active?: boolean;
  /** force monospaced label */
  mono?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  style?: CSSProperties;
}

/**
 * Millibar Terminal button — flat, tight, no shadow. Used for map-mode segmented
 * switches, Kelly stake toggles (FULL/½/¼), bankroll presets, and solid actions.
 * @startingPoint section="Primitives" subtitle="Flat tactical button + segmented toggles" viewport="700x150"
 */
export function Button(props: ButtonProps): JSX.Element;
