---
name: category-alpha-design
description: Use this skill to generate well-branded interfaces and assets for Category Alpha / Millibar Terminal — an institutional-grade, evidence-driven hurricane-divergence intelligence terminal (Bloomberg / Palantir / Jane Street / mission-control aesthetic). Contains design guidelines, colors, type, fonts, assets, and UI-kit components for production or throwaway prototypes and mocks.
user-invocable: true
---

Read the `readme.md` file within this skill, then explore the other available files.

This system has **two real surfaces**: the light operational terminal chrome (default) and
the dark tactical **Storm Command Center** (`data-surface="tactical"`). Components use
semantic tokens that flip between them — set the attribute on any ancestor to go dark.

- **Foundations** — `styles.css` (link this one file) → `tokens/*.css`. Colors, type
  (Erode / Satoshi / IBM Plex Mono, all CDN), spacing, effects, semantic aliases.
- **Components** — `components/{primitives,surfaces,data,telemetry}/`. Button, Badge, Pill,
  StatusDot, Panel, SectionHeader, ProvenanceFooter, EmptyState, StatTile, Gauge, KellyBar
  (dual-layer liquidity-capped), SignalCard, EdgeCell, IngestionHUD, HealthRow, ReplayDeck
  (temporal-replay VCR). Read each `.prompt.md` for usage.
- **UI kit** — `ui_kits/millibar-terminal/` recreates the full terminal.

Core ethos to preserve in any output: **information density over whitespace**, **monospaced
operational metadata** (timestamps, prices, ids, latencies, versions), **radical provenance**
(every card carries a `ProvenanceFooter`), **honest data** (label LIVE / SEEDED / MANUAL;
never fabricate a value or an overlay; show `EmptyState`, never "No data available"), and
**probability separate from evidence-quality**. No emoji, no gradients (except the logo mark),
no glassmorphism.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and
create static HTML files for the user to view. If working on production code, copy assets
and apply the rules here. If invoked with no other guidance, ask what the user wants to
build, ask a few questions, and act as an expert designer who outputs HTML artifacts or
production code as needed.
