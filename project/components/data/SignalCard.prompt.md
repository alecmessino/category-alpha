**SignalCard** — a divergence signal. Signed edge, a centered model-vs-market meter, probabilities, confidence tier, BUY/SELL/HOLD. Left rule tints by side.

```jsx
<SignalCard label="Elida → KXHURCAT4" signal="BUY" edge={15.3}
  modelProb={62} marketProb={47} conf="HIGH" Badge={Badge} />
<SignalCard label="Fausto (seasonal proxy)" signal="HOLD" edge={-1.2}
  modelProb={30} marketProb={31} conf="LOW" unmapped Badge={Badge} />
```

Pass the system's `Badge` for a proper confidence chip; omit for a plain fallback.
