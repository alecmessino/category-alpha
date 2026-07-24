import { CSSProperties } from "react";

export interface ReplayBookmark {
  /** frame index the bookmark sits at */
  i: number;
  label: string;
  /** tick color (defaults to warn/amber) */
  color?: string;
}
export interface ReplayDeckProps {
  /** number of frames in the loop */
  frames?: number;
  /** minutes between frames (for the timestamp/age readout) */
  stepMin?: number;
  /** speed multipliers to cycle through */
  speeds?: number[];
  /** bookmarked historical-event micro-jumps */
  bookmarks?: ReplayBookmark[];
  /** small mono sub-label under the timestamp, e.g. "GOES · ABI" */
  subLabel?: string;
  autoplay?: boolean;
  /** called with the current frame index whenever the cursor moves */
  onSeek?: (idx: number) => void;
  style?: CSSProperties;
}

/**
 * ReplayDeck — the Temporal Replay VCR transport: step-back / play-pause / step-forward /
 * jump-to-live, a scrubber with bookmarked event micro-jumps, an honest LIVE↔REPLAY
 * badge, timestamp, and speed cycle. Self-driving; emits onSeek(idx).
 * @startingPoint section="Telemetry" subtitle="Temporal replay VCR transport" viewport="760x110"
 */
export function ReplayDeck(props: ReplayDeckProps): JSX.Element;
