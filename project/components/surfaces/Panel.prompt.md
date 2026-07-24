**Panel** — the flat bordered card that wraps every terminal module. Optional uppercase cyan header (`title` + `right` slot), optional left accent rule, optional flush `footer` (typically a `ProvenanceFooter`).

```jsx
<Panel title="Edge Matrix" right={<Badge tone="live" dot>LIVE</Badge>}
       footer={<ProvenanceFooter source="NHC / RECON" latency="4m" version="1.2.4" tier="A" />}>
  …dense content…
</Panel>
<Panel accent="warn" title="Vortex Recon">…</Panel>
```
