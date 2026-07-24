**EmptyState** — cinematic terminal empty state. Never render "No data available"; use this instead.

```jsx
<EmptyState
  title="SYSTEM AWAITING TELEMETRY"
  message="Research ledger empty."
  awaiting={["Recon ingestion", "Satellite processing", "Model consensus"]}
  status="INGESTION READY" />
```

`statusTone` colors the pipeline-status word (`pos|warn|neg|special|neutral`).
