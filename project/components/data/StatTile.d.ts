import { ReactNode, CSSProperties } from "react";

export interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  /** dimmed unit suffix, e.g. "kt", "mb", "°C" */
  unit?: ReactNode;
  /** small mono sub line (source / note) */
  sub?: ReactNode;
  /** value color (a risk/tone token) */
  color?: string;
  /** tile = boxed hero stat; metric = flush command-rail metric */
  variant?: "tile" | "metric";
  style?: CSSProperties;
}

/**
 * StatTile — hero KPI stat or command-rail metric: mono tabular value with a dimmed
 * unit, uppercase label, optional sub line.
 * @startingPoint section="Data" subtitle="Hero stat / command-rail metric" viewport="700x150"
 */
export function StatTile(props: StatTileProps): JSX.Element;
