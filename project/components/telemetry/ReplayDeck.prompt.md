**ReplayDeck** — the Temporal Replay VCR transport. Multi-control playback cluster (step-back ◀◀, play/pause, step-forward, jump-to-live ▶▶ Live), a scrubber with bookmarked event micro-jumps, an honest LIVE↔REPLAY badge (green pulsing live / amber replay offset), timestamp, and speed cycle. Self-driving — starts playing and emits `onSeek(idx)`.

```jsx
<ReplayDeck frames={36} stepMin={10} subLabel="GOES-19 · GeoColor"
  bookmarks={[{i:6, label:"RI onset"}, {i:22, label:"Landfall watch", color:"var(--neg)"}]}
  onSeek={(i)=>setFrame(i)} />
```

Best placed on a `data-surface="tactical"` (dark) container, matching the Storm Command Center.
