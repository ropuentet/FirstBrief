---
name: FirstBrief architecture
description: Key decisions, component structure, and data conventions for the FirstBrief app.
---

## Routing
State-based: `selectedCluster: Cluster | null` in AppContent. No router. Back clears selection and scrolls to top. Refresh also clears detail view.

## Data layer
All data in `artifacts/firstbrief/src/stories.ts`. Double-quoted strings, `\uXXXX` for special chars (apostrophes = `\u2019`). `featuredIds[]` drives All tab (currently 6 IDs ranked by score). Each `Cluster` has: `id, topic, label, headline, rundown, rundownP2, sentiment, why, score, articles, market?`.

## All tab vs topic tabs
- **All tab**: `FrontPageLayout` — asymmetric editorial grid. Lead card (score #1, ~65% wide) + medium column (scores #2–3 stacked, ~360px) + small row (scores #4–6, 3 columns, headline + topic only). Conditional market snapshot in lead card; falls back to key-context box when no market data.
- **Topic tabs**: uniform `event-grid` (2-col grid, 1px gap as border). `ClusterCard` component, no `showTopic` prop needed.

## Public Sentiment Snapshot (detail page)
Replaced "What Changed Since Yesterday" section. `cluster.sentiment: string[]` — 2–4 plain-text lines of mock public reaction. Rendered in `.detail-sentiment` with a disclaimer and a JSX comment marking where X/Reddit API would slot in. No usernames, quotes, or individual posts.

## Design constraints
- Monochrome: all tokens `hsl(0 0% …)`. `--radius: 0` everywhere.
- Grid gap as border: `gap: 1px; background: hsl(var(--border))` on grid containers.
- Header frozen — never change brand, meta row, or focus filters unless explicitly asked.
- No animations beyond skeleton shimmer and spin on refresh icon.

## Key CSS classes
- `.fp-layout`, `.fp-top`, `.fp-medium-col`, `.fp-smalls` — All-tab editorial layout.
- `.fp-lead-card`, `.fp-medium-card`, `.fp-small-card` — card variants.
- `.lead-market-snap` — market strip in lead card (ticker, price, day change, mini sparkline).
- `.mini-sparkline-svg` — 120×36px sparkline, uses 30D points array.
- `.detail-sentiment`, `.detail-sentiment-disclaimer` — sentiment section in detail page.

## Responsive
- 900px: fp-top collapses to single column, fp-smalls to single column, lead body stacks.
- 640px: reduced padding, market snap wraps, sparkline goes full-width.

**Why:** keeping these separate from code means future sessions don't re-derive them from reading every file.
