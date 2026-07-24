**Badge** — tonal status marker for honesty labels (LIVE / SEEDED / STATIC ODDS), health chips (PASS/FAIL/BLOCKED/EMPTY), confidence tiers, and BUY/SELL tags. Monospaced by default.

```jsx
<Badge tone="live" dot>LIVE FEED</Badge>
<Badge tone="seeded">STATIC ODDS</Badge>
<Badge tone="pos">PASS</Badge>
<Badge tone="special">BLOCKED</Badge>
<Badge tone="warn">STALE</Badge>
```

Tones: `neutral | pos | warn | neg | special | live | seeded`. `dot` adds a leading status dot (pulses only for `live`). Tint auto-adapts to light/tactical surface.
