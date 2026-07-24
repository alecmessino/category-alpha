# Category Alpha — Institutional Intelligence Design System (IIDS)

Category Alpha is the design system for **Millibar Terminal**, an institutional-grade,
evidence-driven intelligence terminal for hurricane-divergence research. The aesthetic
is drawn from Bloomberg Terminal, Palantir, Jane Street, and meteorological
operations centers: maximum information density, monospaced operational metadata,
transparent data provenance, and mission-control ergonomics over consumer dashboards.

**Three naming layers** (preserve them — they are load-bearing):
- **`argus`** — the unbranded platform datastore (`argus.db`).
- **Millibar Terminal** — the product / terminal chrome (the UI you see).
- **Category Alpha** — the strategy/model surfaced in the Edge Matrix.

**Core pipeline the whole product is organized around:**
`Observation → Evidence → Features → Probability → Decision`
(surfaced as: Evidence → Confidence → Expected Edge → Kelly Allocation → Liquidity
Constraint → Tradable Position.)

**Research-only ethos** (this shapes the copy and UI everywhere): nothing places orders
or gives advice. Every value is labeled **LIVE**, **SEEDED**, or **MANUAL**; nothing is
fabricated. Absent a feed, an overlay is shown *disabled*, never invented. Probability
and evidence-quality are always exposed as **separate axes** (74% @ LOW ≠ 74% @ HIGH).

## Sources
Built from the read-only mounted codebase **`category-alpha/`** — a single-process Flask
terminal. Ground truth for all visuals:
- `hurricane_template.py` — the 46 KB single-page HTML/CSS/JS terminal (Leaflet + Chart.js).
  **All tokens, components, and the UI kit are lifted from here.**
- `CLAUDE.md` — platform architecture, naming, honest-data ethos, tone.
- `static/millibar-icon.svg` — the storm/hexagon brand mark (copied into `assets/`).
- `lab/README.md`, `lab/design/storm-command-center-v2.md` — research + renderer design brief.

The pasted **IIDS master spec** additionally calls for dark-tactical hero components
(VCR replay deck, dual-layer liquidity-capped Kelly bars, ingestion HUD, provenance
micro-footers, cinematic empty states) — all present in the codebase and built here.

### Fonts
**Erode** (700, display/wordmark) and **Satoshi** (500/700, sans UI) are self-hosted
from `assets/fonts/` as woff2 (`@font-face` in `tokens/fonts.css`). **IBM Plex Mono**
(400/500/600, all telemetry) loads from Google Fonts. The original Fontshare/OTF/TTF
sources are in `uploads/Satoshi_Complete/` and `uploads/erode-*.woff2`.

---

## CONTENT FUNDAMENTALS — how Category Alpha writes

**Voice:** an engineer/quant operator talking to a peer analyst. Precise, terse,
audit-obsessed, quietly confident. Never markety, never reassuring-for-its-own-sake.
The product's honesty *is* its pitch.

- **Person:** mostly impersonal/imperative ("Paste a raw NHC advisory here…",
  "Awaiting recon ingestion"). Occasionally direct address in explanatory notes. Rarely "we".
- **Casing:** UPPERCASE for operational labels, status chips, feed names, section
  headers (`STRIKE ZONE`, `LIVE FEED`, `LIQ-CAPPED`, `MODEL OFFLINE`). Sentence case for
  prose/interpretation blocks. Monospaced ALL-CAPS for machine states.
- **Numbers are typographic citizens:** always mono, tabular-nums, signed where it
  carries meaning (`+2.4°C`, `+15.3%`, `−4 mb`), unit as a dimmed `<small>` suffix
  (`108<small>kt</small>`, `927<small>mb</small>`).
- **Provenance is stated inline, not hidden:** `[Source: NHC / RECON · Latency: 4m ·
  Ver: 1.2.4 · Tier: A]`. Every card can name its freshness and lineage.
- **Honesty markers are copy, not decoration:** `SEEDED`, `MANUAL`, `STATIC ODDS`,
  `UNMAPPED CONTRACT`, `RECON ANOMALY`, `MODEL OFFLINE`, `research-only`, `not fabricated`,
  `no per-storm market contract`. When a thing is uncertain or absent, say so plainly.
- **Tone of warnings:** factual and specific. "HAFS / ECMWF columns are MODEL OFFLINE —
  the multi-model surface requires HAFS ensemble outputs (unavailable keylessly). Seams
  are in place; add model feeds to populate." Explains *why*, names the seam.
- **Emoji:** none. Iconography is unicode glyphs (◉ ▲ ▼ ✓ ➤ ≈), the storm mark, and
  monospaced brackets. No decorative imagery, no illustrations.
- **Empty states are cinematic**, never "No data available" — see `EmptyState` component:
  `[ SYSTEM AWAITING TELEMETRY ] · Research ledger empty. · Pipeline Status: INGESTION READY`.

---

## VISUAL FOUNDATIONS

**Two real surfaces coexist** and the system supports both:
1. **Light operational chrome** (default) — the terminal body: near-white app bg
   (`#f4f5f8`), white cards, `#e2e8f0` hairlines, ink text `#0f172a`. This is where the
   dense tables, matrices, and signal cards live.
2. **Dark tactical Command Center** (`data-surface="tactical"`) — the cinematic
   satellite hero + rail: near-black `#05070d`/`#04060c`, graphite borders, `#e6edf6`
   text, cyan `#38bdf8` accents. Matches the IIDS "dark tactical palette" directive.

**Color:** a restricted, high-trust operational palette. Accents are **cyan** (primary /
live), **green** (positive / BUY / fresh), **red** (negative / SELL / fail), **amber**
(warn / stale / velocity), **violet** (special / blocked / watch). One extreme highlight:
**radioactive green `#39ff14`**, used *only* as a text-glow on edges ≥ 15%. PAI lifecycle
phases have fixed hues (Accumulation green, Velocity amber, Exhaustion red, Watch violet).
**No gradients** except the cyan→blue logo mark and the neutral progress-bar fill;
**no glassmorphism, no drop-shadow styling** on dark. Semantic colors carry meaning —
never decorative.

**Type:** Erode (serif) for the wordmark only. Satoshi (sans) for all UI. IBM Plex Mono
for every piece of telemetry — timestamps, prices, ids, latencies, versions, ages.
Mono runs small (9.5–13px) and tight; sans labels are UPPERCASE 10px with .6px tracking.

**Spacing / density:** Bloomberg-tight. Non-grid values lifted verbatim (padding `10px
12px`, gaps `11–13px`, `9px` control padding). Do not snap to a 4/8 grid.

**Cards:** flat. 1px `#e2e8f0` border, `8px` radius, `#fff` fill, a subtle
`0 1px 10px rgba(15,23,42,.18)` shadow *only* on popups/drawers (panels are borders-only).
Meaningful cards carry a **left accent rule**: `3px` on section headers (cyan), `4px` on
signal cards (signed by BUY/SELL color), `3px` on PAI cards (phase color) and intel cards
(amber). Dark command cards are border-only, no shadow.

**Borders & rules:** hairlines everywhere (`1px`), section headers use a left border not
underline, metric grids are built from `1px` gaps showing the background through.

**Backgrounds:** flat fills, no imagery/texture/pattern in chrome. The one full-bleed
image surface is the Command Center satellite map (NASA GIBS GOES ABI), framed by an
`inset` vignette (`box-shadow: inset 0 0 120px rgba(2,5,12,.75)`) — a "protection
vignette," not a card.

**Motion:** signals live state, never decorates. Fast `.15s` UI transitions; a slow
2s status **pulse** on live dots; a **dip-to-dark veil** cut on camera/basin switches; a
pulsing **lock reticle** on the storm eye; hard-cut satellite frame swaps (no crossfade —
a crossfade reads as blinking). No bounces, no springy easing.

**Hover:** subtle — border brightens to cyan and/or text lifts to full contrast; solid
toggles invert to the ink/cyan fill. **Press/active:** the selected state is a filled
chip (`.on`) with an accent ring glow, not a shrink.

**Radii:** `6px` controls/tags, `8px` cards/panels, `12px` stat tiles, `999px` pills.

**Transparency & blur:** used sparingly on dark only — control bars over the map use
`rgba(7,12,22,.7)` + `backdrop-filter: blur(4px)`; top/bottom ribbons use a fade
gradient to transparent so imagery reads through.

---

## ICONOGRAPHY

Category Alpha uses **almost no icon library**. Its icon language is:
- **The brand mark** — a hexagon "seal" containing a cyan→blue storm spiral crossed by
  an amber pressure-trend polyline ending in a dot. Copied into `assets/millibar-icon.svg`
  (glyph) and reproduced in the wordmark (`assets/logo.svg` light, `assets/logo-dark.svg`).
- **Unicode glyphs as operational icons** — ◉ (info/lifecycle), ▲ (rising/hot), ▼
  (falling pressure), ✓ (confirmed), ➤ (tracking), ≈ (near-climatology), ❚❚ / ▶ (play/pause),
  ◀◀ ▶▶ (VCR transport), ⛶ (fullscreen), ↻ (reset), ‹ › (breadcrumb). No icon font,
  no SVG icon set, **no emoji**.
- **Status dots** — small filled circles (green/amber/grey/red) that carry feed freshness
  and PAI phase; the green one pulses when live.
- **Bracketed monospace tokens** — `[?]`, `[Source: … | Ver: …]` — used as textual icons.

If a consuming design genuinely needs a broader glyph set, substitute **Lucide**
(1.5–2px stroke, matches the terminal's thin-line feel) from CDN and flag the addition —
the codebase itself ships none.

---

## INDEX / MANIFEST

**Root**
- `styles.css` — global entry (imports all tokens). Link this one file.
- `readme.md` — this guide. · `SKILL.md` — Agent-Skill wrapper. · `thumbnail.html` — DS tile.

**`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`,
`semantic.css` (aliases + `data-surface="tactical"` dark scope).

**`assets/`** — `logo.svg`, `logo-dark.svg`, `millibar-icon.svg`.

**`components/`** (React primitives — the real UI vocabulary of the terminal):
- `primitives/` — `Button`, `Badge`, `Pill`, `StatusDot`
- `surfaces/` — `Panel`, `SectionHeader`, `ProvenanceFooter`, `EmptyState`
- `data/` — `StatTile`, `Gauge`, `KellyBar`, `SignalCard`, `EdgeCell`
- `telemetry/` — `IngestionHUD`, `HealthRow`, `ReplayDeck`

**`ui_kits/millibar-terminal/`** — high-fidelity interactive recreation of the terminal
(light chrome + dark Command Center hero).

**Guidelines / specimen cards** live alongside tokens and in `guidelines/` — they populate
the Design System tab (groups: Colors, Type, Spacing, Brand, Components, Millibar Terminal).

### Intentional additions
- **`ProvenanceFooter`** — the codebase states provenance inline (`cmd-src`, data-version
  stamps, `[Source|Latency|Ver|Tier]` in the IIDS spec) but has no single reusable footer
  component; extracted as one because every card in the system is meant to carry it.

### Caveats
- The codebase's chrome is predominantly **light**; the IIDS spec asks for **dark
  tactical** everywhere. Rather than pick one, the system ships both as theme scopes and
  the UI kit shows the real product (light body + dark hero). Confirm which should be the
  default for new work.
