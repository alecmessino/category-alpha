**StatusDot** — small filled circle for feed freshness or PAI phase. Green (`ok`/`live`) pulses; amber `stale`; grey `missing` (honest absence, never red).

```jsx
<StatusDot status="ok" />
<StatusDot status="stale" />
<StatusDot status="missing" />
<StatusDot color="var(--pai-exhaustion)" pulse={false} />
```
