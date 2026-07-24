**IngestionHUD** — the header feed-freshness pill. Dots: green fresh, amber STALE, grey MISSING (never red — absence is honest). Click opens a diagnostic mapping feed latency to evidence-quality penalty.

```jsx
<IngestionHUD streams={[
  {name:"ATCF", status:"ok", age:"2m"},
  {name:"RECON", status:"stale", age:"41m", penalty:"−1 tier"},
  {name:"SST", status:"missing"},
]} />
```
