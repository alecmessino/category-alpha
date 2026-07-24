**Button** — flat tactical button/toggle for the terminal (map-mode switches, Kelly stake, bankroll presets, solid actions). Use `segment` for grouped tab-style toggles, `preset` for mono value chips, `solid`/`accent` for actions.

```jsx
<Button variant="solid">Parse advisory</Button>
<Button variant="segment" active>Observation</Button>
<Button variant="segment">Forecast</Button>
<Button variant="preset" active mono>¼</Button>
```

Variants: `solid` (ink fill), `accent` (cyan fill), `segment` (bordered toggle, `active` fills ink), `preset` (mono chip, `active` fills cyan). Sizes `sm|md|lg`; `disabled` dims to 42%.
