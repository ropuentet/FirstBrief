---
name: FirstBrief architecture
description: Key decisions, component structure, provider flows, and data conventions for the FirstBrief app.
---

## Routing
State-based: `selectedCluster: Cluster | null` in AppContent. No router. Back clears selection and scrolls to top. Refresh also clears detail view.

## Data layer
All mock data in `artifacts/firstbrief/src/stories.ts`. Double-quoted strings, `\uXXXX` for special chars (apostrophes = `\u2019`). `featuredIds[]` drives All tab (currently 6 IDs ranked by score). Each `Cluster` has: `id, topic, label, headline, rundown, rundownP2, sentiment (mock, not rendered directly), why, score, articles, market?`.

The `sentiment: string[]` field on `Cluster` still exists in `stories.ts` as mock fallback data but is **not rendered** — the frontend uses the live `SentimentPanel` component instead.

## All tab vs topic tabs
- **All tab**: `FrontPageLayout` — asymmetric editorial grid. Lead card (score #1, ~65% wide) + medium column (scores #2–3 stacked, ~360px) + small row (scores #4–6, 3 columns, headline + topic only). Conditional market snapshot in lead card; falls back to key-context box when no market data.
- **Topic tabs**: uniform `event-grid` (2-col grid, 1px gap as border). `ClusterCard` component.

## API server routes (`artifacts/api-server/src/routes/`)
All registered via `router.use(...)` in `index.ts`. Express mounts all routes at `/api` prefix (in `app.ts`). So route files use paths WITHOUT `/api` prefix.

- `health.ts` — `GET /health`
- `guardian.ts` — `GET /guardian` — fetches 4 recent articles per topic via Guardian Content API (`GUARDIAN_API_KEY`). Returns `{ topics: { ai[], nuclear[], football[] } }`.
- `why-it-matters.ts` — `POST /why-it-matters` — sends headline+summary+body to Gemini (`GEMINI_API_KEY`, model `gemini-3.6-flash`, `ai.interactions.create`). Returns `{ whyItMatters: string }`.
- `sentiment.ts` — `POST /sentiment` — Bluesky public unauthenticated search → filter → Gemini structured JSON. Returns `SentimentOk | SentimentInsufficient`. In-memory cache, 15-min TTL.

## Gemini API pattern (working, do not change)
```typescript
const ai = new GoogleGenAI({ apiKey });
const interaction = await ai.interactions.create({
  model: "gemini-3.6-flash",
  input: prompt,
  store: false,
});
const text = interaction.output_text?.trim();
```
Both `why-it-matters` and `sentiment` routes use this exact pattern. For JSON output from Gemini, use a strict "Return ONLY a JSON object. No code fences." prompt and strip fences from `output_text` before `JSON.parse`.

## Public Sentiment Panel (detail page)
`SentimentPanel` component in `App.tsx`. Four states:
- **Loading**: skeleton shimmer
- **Success**: 3-segment bar (dark/mid/light gray) + stat row + interpretation + theme pills + source disclaimer
- **Insufficient**: "Insufficient discussion available." shown when < 8 relevant Bluesky posts found — no mock fallback, no invented data
- **Error**: "Could not load discussion data."

Source label: "Based on N selected Bluesky posts · Not representative of the entire public."

Bluesky filtering rules (in `sentiment.ts`): regular posts only, no replies, ≥40 chars substantive text (after URL stripping), one post per `author.did`, near-dedup on first 60 chars of text, at least one keyword from headline present in text.

## Guardian overlay (AppContent → displayStories memo)
When Guardian data loads, replaces `headline`, `rundown`, `rundownP2`, and first `articles[]` entry with live Guardian content. `sentiment`, `why`, `score`, `market` spread through unchanged from mock.

## Design constraints
- Monochrome: all tokens `hsl(0 0% …)`. `--radius: 0` everywhere.
- Grid gap as border: `gap: 1px; background: hsl(var(--border))` on grid containers.
- Header frozen — never change brand, meta row, or focus filters unless explicitly asked.
- All font sizes in CSS: whole-px integers (no rem).
- Focus tabs (All / topic / About): unified CSS system — inactive=muted gray + transparent border, hover=thin black outline, active=black text + black outline + weight 700, no fill.

## Key CSS classes
- `.fp-layout`, `.fp-top`, `.fp-medium-col`, `.fp-smalls` — All-tab editorial layout.
- `.fp-lead-card`, `.fp-medium-card`, `.fp-small-card` — card variants.
- `.lead-market-snap` — market strip in lead card (ticker, price, day change, mini sparkline).
- `.detail-sentiment` — sentiment panel container (used by `SentimentPanel`).
- `.sentiment-bar`, `.sentiment-bar-pos/neu/neg` — 3-segment sentiment bar.
- `.sentiment-stats`, `.sentiment-stat-val/label` — pos/neu/neg stat row.
- `.sentiment-theme-pill` — recurring theme tags.
- `.sentiment-state-text`, `.sentiment-disclaimer-text` — reusable helpers for insufficient/error/loading states.

## Responsive
- 900px: fp-top collapses to single column, fp-smalls to single column, lead body stacks.
- 640px: reduced padding, market snap wraps, sparkline goes full-width.

**Why:** keeping these separate from code means future sessions don't re-derive them from reading every file.
