---
name: FirstBrief Architecture
description: State-based routing, data layer, All-tab editorial layout, sentiment pipeline, Gemini rate-limit handling, and design constraints.
---

## Monorepo layout

- `artifacts/firstbrief` — Vite/React frontend
- `artifacts/api-server` — Express backend (mounts all routes at `/api` prefix in `app.ts`)

## Backend routes (`artifacts/api-server/src/routes/`)

- `health.ts` — `GET /health`
- `guardian.ts` — `GET /guardian` — fetches 4 articles/topic from Guardian Content API (`GUARDIAN_API_KEY`), returns `{ topics: { ai[], nuclear[], football[] } }`
- `why-it-matters.ts` — `POST /why-it-matters` — headline+summary+body to Gemini, returns `{ whyItMatters: string }`
- `sentiment.ts` — `POST /sentiment` — full v3 pipeline (deterministic entity extraction + Bluesky + single Gemini call)
- `index.ts` — registers all four routers

## Gemini pattern (confirmed working)

```ts
const ai = new GoogleGenAI({ apiKey });
const interaction = await ai.interactions.create({ model: "gemini-3.6-flash", input: prompt, store: false });
const text = interaction.output_text?.trim();
```

Model name is `gemini-3.6-flash` (Replit-specific).

## Shared Gemini rate limiter (`artifacts/api-server/src/gemini-limiter.ts`)

All Gemini calls go through `enqueueGeminiCall(fn)` — a global serial queue.

- One in-flight Gemini call at a time across ALL routes
- `MIN_GAP_MS = 5000` (12 RPM max, safely under 15 RPM free-tier)
- Shared cooldown: `setGeminiCooldown(untilMs)` / `isGeminiCoolingDown()` / `geminiCooldownMs()`
- 429 handling in each route calls `setGeminiCooldown` which is respected by the queue before the next dequeued call fires
- Queue cap: 50 entries; excess are rejected immediately

**Why:** Simultaneous WIM+sentiment calls for different articles bypassed per-key coalescing and both hit Gemini at once, causing cascading 429s. Serialising through a global queue prevents this.

## Why It Matters route (`why-it-matters.ts`)

- 24h server-side cache (`wimCache` Map), keyed on canonical Guardian URL (falls back to `articleId::headline`)
- 72h stale fallback window
- Per-key coalescing via `wimInFlight` Map (multiple requests for same article share one Gemini call)
- On 429 with a stale cache entry → serves stale rather than error
- Logs: `[wim] cache hit/miss/stale`, `[wim] Gemini call`, `[wim] Gemini 429 — cooldown Xs`

## Bluesky sentiment pipeline v3

**CRITICAL HOST RULE**: Use `api.bsky.app`, NOT `public.api.bsky.app`.
`public.api.bsky.app` is Cloudflare-blocked from Replit's IP range (returns 403 HTML every time).
`api.bsky.app` returns 200 for unauthenticated `searchPosts` and `getPostThread`.

**Do NOT pass `lang=en`** as a query param — many valid English posts have no `langs` field. Filter language in JavaScript instead.

### Pipeline steps (v3 — one Gemini call per request)

1. **Deterministic entity extraction** — no Gemini, regex-based proper-noun runs from headline + rundown
2. **Multi-search** — parallel Bluesky searches (top-4 entities sort=top, combined sort=latest), 25 each
3. **Thread fetching** — `getPostThread` for top-5 engagement-ranked raw posts; depth=2, MAX_REPLIES_PER_THREAD=20
4. **Dedup** — URI dedup + near-text dedup (first 80 chars)
5. **Entity pre-filter** — keep posts where any entity keyword appears; fallback to all candidates if <5 survive
6. **Gemini analysis** — single `enqueueGeminiCall`: semantic relevance filter + tiered sentiment on top-50 candidates

### Tiered response types (mirrored in frontend types)

| status | condition | fields |
|--------|-----------|--------|
| `insufficient` | 0 relevant | `postCount` |
| `small_sample` | 1-2 relevant | `summary`, `postCount`, `source`, `observedAt` |
| `qualitative` | 3-7 relevant | `summary`, `themes[]`, `postCount`, `source`, `observedAt` |
| `ok` | 8+ relevant | `positive`, `neutral`, `negative`, `interpretation`, `themes[]`, `postCount`, `source`, `observedAt` |

**Server-side tier correction**: after Gemini returns, the server recalculates the correct tier from `relevant_indices.length` and overrides Gemini's declared tier if they mismatch.

### Cache (v3)

- 45-min TTL, 4h stale window, keyed on canonical Guardian article URL (falls back to `clusterId`)
- `articleUrl` field sent in request body by frontend (was `clusterId` only in v2)

## Frontend (`artifacts/firstbrief/src/App.tsx`)

- `useWhyItMatters(cluster)` — React Query v4, keyed on `primaryArticle?.href`, `retry: 0`, fires on detail page mount
- `useSentiment(cluster)` — React Query v3, keyed on `articleUrl || cluster.id`, `retry: 0`, `staleTime: 45min`, sends `{ clusterId, headline, rundown, topic, articleUrl }`
- `rundown` sent to API is `[cluster.rundown, cluster.rundownP2].filter(Boolean).join(' ')`

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

## Gemini quota behaviour (free tier, Aug 2026)

- Free tier limit appears to be ~15 RPM but the quota window resets only every 60s
- Repeated testing within a session exhausts the per-minute window and triggers 429s
- The 429 error includes "retry in Xs" (typically 43–66s) — the server parses this and applies it as a shared cooldown
- After a burst of 429s, the quota appears to need a few minutes of idle time to fully recover
- In-memory cooldown is cleared on server restart — avoid restarting the API server during debugging unless the code has changed, as each restart triggers a fresh page-load WIM burst that hits the quota again

## Market Context MVP scope

For this MVP, only Microsoft/MSFT, Nvidia/NVDA, NuScale/SMR, and Apple/AAPL are eligible. Show market context only when a live article is directly about an allowed company; incidental mentions, ambiguous stories, unsupported companies, and mock fallback stories must not trigger market data or a default ticker.

**Why:** The user explicitly limited initial coverage and requires article-specific attribution rather than inheriting mock company data or implying a causal price relationship.

**How to apply:** Keep company selection on demand when a live Guardian story is opened. Expand the allowlist or classify more sources only when the product scope changes.
