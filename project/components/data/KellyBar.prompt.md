**KellyBar** — the liquidity-capped Q-Kelly allocation bar. A translucent theoretical-capacity layer sits behind a solid liquidity-restricted fill, with a red vertical marker at the liquidity limit. Never display raw theoretical Kelly on its own.

```jsx
<KellyBar theoretical={0.18} capped={0.11} allocation={2750} stakePct={11} rawPct={18} />
<KellyBar theoretical={0.06} allocation={1500} stakePct={6} rawPct={6} />
```

When `capped < theoretical` the bar auto-labels `LIQ-CAPPED` and shows the red threshold marker.
