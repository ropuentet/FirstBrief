---
name: FirstBrief Architecture
description: State-based routing, data layer, All-tab editorial layout, sentiment pipeline, and design constraints.
---

## Monorepo layout

- `artifacts/firstbrief` — Vite/React frontend
- `artifacts/api-server` — Express backend (mounts all routes at `/api` prefix in `app.ts`)

## Backend routes (`artifacts/api-server/src/routes/`)

- `health.ts` — `GET /health`
- `guardian.ts` — `GET /guardian` — fetches 4 articles/topic from Guardian Content API (`GUARDIAN_API_KEY`), returns `{ topics: { ai[], nuclear[], football[] } }`
- `why-it-matters.ts` — `POST /why-it-matters` — headline+summary+body to Gemini, returns `{ whyItMatters: string }`
- `sentiment.ts` — `POST /sentiment` — full v2 pipeline (see below)
- `index.ts` — registers all four routers

## Gemini pattern (confirmed working)

```ts
const ai = new GoogleGenAI({ apiKey });
const interaction = await ai.interactions.create({ model: "gemini-3.6-flash", input: prompt, store: false });
const text = interaction.output_text?.trim();
```

Model name is `gemini-3.6-flash` (Replit-specific).

## Bluesky sentiment pipeline v2

**CRITICAL HOST RULE**: Use `api.bsky.app`, NOT `public.api.bsky.app`.
`public.api.bsky.app` is Cloudflare-blocked from Replit's IP range (returns 403 HTML every time).
`api.bsky.app` returns 200 for unauthenticated `searchPosts` and `getPostThread`.

**Do NOT pass `lang=en`** as a query param — many valid English posts have no `langs` field. Filter language in JavaScript instead.

### Pipeline steps

1. **Entity extraction** — Gemini call: extracts 3-5 proper-noun entities from headline + rundown. Falls back to capitalised headline words if Gemini fails.
2. **Multi-search** — 5 parallel Bluesky searches: one per top-3 entities (sort=top), one combined (sort=latest), limit=25 each.
3. **Thread fetching** — `getPostThread` for top-5 engagement-ranked raw posts; depth=2, MAX_REPLIES_PER_THREAD=20 (prevents flooding — was 889 before cap was added).
4. **Dedup** — URI dedup + near-text dedup (first 80 chars). Sort by engagement score first.
5. **Entity pre-filter** — light filter: keep posts where at least one entity keyword appears. Falls back to all candidates if <5 survive.
6. **Gemini analysis** — single call: semantic relevance filter + tiered sentiment. Sends top 50 candidates.

### Tiered response types (mirrored in frontend types)

| status | condition | fields |
|--------|-----------|--------|
| `insufficient` | 0 relevant | `postCount` |
| `small_sample` | 1-2 relevant | `summary`, `postCount`, `source`, `observedAt` |
| `qualitative` | 3-7 relevant | `summary`, `themes[]`, `postCount`, `source`, `observedAt` |
| `ok` | 8+ relevant | `positive`, `neutral`, `negative`, `interpretation`, `themes[]`, `postCount`, `source`, `observedAt` |

**Server-side tier correction**: after Gemini returns, the server recalculates the correct tier from `relevant_indices.length` and overrides Gemini's declared tier if they mismatch.

### Cache

15-min in-memory cache per `clusterId`. Max 200 entries.

### Verified test results (Aug 2026)

- DeepMind leadership change (current story): `ok` tier, 9 relevant posts, 13s
- Obscure Farnborough drainage story: `insufficient`, 0 posts, 16s
- OpenAI public-benefit restructure: `qualitative`, 6 relevant posts, 30s

## Frontend (`artifacts/firstbrief/src/App.tsx`)

- `useWhyItMatters(cluster)` — React Query, fires on detail page mount
- `useSentiment(cluster)` — React Query v2 cache key, `POST /api/sentiment`, sends `{ clusterId, headline, rundown, topic }`, 15-min staleTime
- `rundown` sent to API is `[cluster.rundown, cluster.rundownP2].filter(Boolean).join(' ')` — this comes from the Guardian overlay (real article content, NOT mock data)
- Guardian overlay at `displayStories` useMemo correctly updates `headline`, `rundown`, `rundownP2` from live Guardian `trailText`/`bodyParagraphs` — entity extraction always gets real content

### SentimentPanel sub-components

- `SentimentLoading` — skeleton
- `SentimentError` — technical failure text
- `SentimentInsufficientState` — no percentages, just message
- `SentimentSmallSampleState` — qualitative summary + "very limited sample" note
- `SentimentQualitativeState` — summary + theme pills + "small sample" note
- `SentimentSuccess` — bar + pos/neu/neg stats + interpretation + themes + disclaimer

## CSS (`artifacts/firstbrief/src/index.css`)

Monochrome tokens, `--radius: 0`, whole-px font sizes throughout.

Sentiment classes: `.sentiment-bar`, `.sentiment-bar-pos/neu/neg`, `.sentiment-stats`, `.sentiment-stat`, `.sentiment-stat-val`, `.sentiment-stat-label`, `.sentiment-themes`, `.sentiment-theme-pill`, `.sentiment-state-text`, `.sentiment-disclaimer-text`, `.detail-sentiment-line`, `.detail-sentiment-disclaimer`

## Data (`artifacts/firstbrief/src/stories.ts`)

- `Cluster` type has `sentiment: string[]` (kept, not rendered anywhere)
- 12 clusters across 3 topics; `featuredIds[]` drives All-tab (6 IDs ranked by score)
- AI cluster `ai-001` is the lead story; Guardian overlay replaces it with today's top AI article

## Design constraints

- All inline Tailwind overrides encoded into CSS
- Font sizes: whole-px integers throughout
- Focus-tab system: inactive=muted, hover=thin black outline, active=black text + outline + weight 700, no fill
- `--radius: 0` everywhere (no border radius)
