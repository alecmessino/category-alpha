**HealthRow** — one operational system-health check with a status chip.

```jsx
<HealthRow name="Event store" detail="argus.db · 4,182 events" status="PASS" />
<HealthRow name="Probability engine" detail="deferred until features promote" status="BLOCKED" />
<HealthRow name="Recon ingester" detail="no valid-time parser yet" status="EMPTY" />
```

States: `PASS` (green) · `EMPTY` (grey) · `BLOCKED` (violet) · `FAIL` (red).
