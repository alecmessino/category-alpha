**ProvenanceFooter** — the monospaced observability micro-footer. Every card in the system should expose its lineage and freshness with one. Tier renders as a tinted letter chip.

```jsx
<ProvenanceFooter source="NHC / RECON" latency="4m" version="1.2.4" tier="A" />
<ProvenanceFooter source="Kalshi (seeded)" latency="—" version="1.0.0" tier="C"
  items={[{k:"Mode", v:"MANUAL"}]} />
```

Drop it into `<Panel footer={…}>` or render standalone below any block.
