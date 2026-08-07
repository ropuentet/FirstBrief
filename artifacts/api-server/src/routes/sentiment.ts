/**
 * POST /api/sentiment  — v2
 *
 * Pipeline:
 *   1. Gemini extracts 3-5 high-value search entities from headline + rundown.
 *   2. Bluesky searched in parallel — one query per entity (sort=top) + one
 *      combined query (sort=latest) — to maximise coverage without compound-
 *      keyword matching that destroys recall.
 *   3. Reply threads fetched in parallel for the top-engaged posts, because
 *      discussion lives in replies not just top-level posts.
 *   4. All candidates are merged, deduplicated (by URI and near-text).
 *   5. ONE Gemini call does semantic relevance filtering + tiered sentiment
 *      analysis.  Tier is determined by the COUNT of posts Gemini marks
 *      relevant, not by a hard pre-filter gate.
 *   6. Tiered response:
 *        insufficient   — 0 relevant opinions
 *        small_sample   — 1-2 relevant (qualitative summary, no percentages)
 *        qualitative    — 3-7 relevant (summary + themes, no percentages)
 *        ok             — 8+ relevant (pos/neu/neg + interpretation + themes)
 *   7. Result cached 15 min per clusterId.
 *
 * IMPORTANT: Use api.bsky.app, NOT public.api.bsky.app.
 *            public.api.bsky.app is Cloudflare-blocked from this environment.
 */

import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";

const router: IRouter = Router();
const BSKY_HOST = "https://api.bsky.app";
const CACHE_TTL_MS = 15 * 60 * 1000;

// ── Public response types (mirrored in frontend App.tsx) ───────────

export type SentimentInsufficient = {
  status: "insufficient";
  postCount: number;
};

export type SentimentSmallSample = {
  status: "small_sample";
  summary: string;
  postCount: number;
  source: "Bluesky";
  observedAt: string;
};

export type SentimentQualitative = {
  status: "qualitative";
  summary: string;
  themes: string[];
  postCount: number;
  source: "Bluesky";
  observedAt: string;
};

export type SentimentOk = {
  status: "ok";
  positive: number;
  neutral: number;
  negative: number;
  interpretation: string;
  themes: string[];
  postCount: number;
  source: "Bluesky";
  observedAt: string;
};

export type SentimentResponse =
  | SentimentInsufficient
  | SentimentSmallSample
  | SentimentQualitative
  | SentimentOk;

// ── Cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { result: SentimentResponse; expiresAt: number }>();

function getCached(key: string): SentimentResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.result;
}

function setCached(key: string, result: SentimentResponse): void {
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) if (now > v.expiresAt) cache.delete(k);
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Step 1: Entity extraction via Gemini ───────────────────────────

async function extractEntities(
  ai: GoogleGenAI,
  headline: string,
  rundown: string,
): Promise<string[]> {
  const prompt = `You are helping a news app find social media discussion about a news story.

HEADLINE: ${headline}
SUMMARY: ${rundown.slice(0, 700)}

Extract 3 to 5 specific search entities or short phrases that someone on Bluesky would use when discussing this exact news story. Prioritise:
- Company or organisation names (e.g. "DeepMind", "OpenAI", "EDF Energy", "Real Madrid")
- People's names (e.g. "Demis Hassabis", "Sam Altman", "Pep Guardiola")
- Specific product, technology, or place names relevant to this event
- Distinctive short phrases unique to this news event (e.g. "SMR reactor", "Champions League final")

Rules:
- Avoid overly generic words like "AI", "tech", "company", "deal", "report", "news" on their own
- Each entity should be specific enough to identify this particular news event
- 3 entities minimum, 5 maximum

Return ONLY a JSON array of strings. No markdown, no code fences, nothing else.
Example: ["DeepMind", "Demis Hassabis", "Google AI lab", "Isomorphic Labs"]`.trim();

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input: prompt,
    store: false,
  });

  const raw = (interaction.output_text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(raw) as unknown[];
    const entities = parsed
      .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
      .map((e) => e.trim())
      .slice(0, 5);
    if (entities.length > 0) return entities;
    throw new Error("empty entity array");
  } catch {
    // Fallback: capitalised words from headline
    const words = headline
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9'-]/g, ""))
      .filter((w) => /^[A-Z]/.test(w) && w.length > 3);
    const fallback = [...new Set(words)].slice(0, 4);
    return fallback.length > 0 ? fallback : [headline.slice(0, 60)];
  }
}

// ── Step 2: Bluesky search ─────────────────────────────────────────

type BskyPost = {
  uri: string;
  author: { did: string; handle: string; displayName?: string };
  record: {
    $type: string;
    text?: string;
    createdAt?: string;
    langs?: string[];
    reply?: unknown;
    embed?: unknown;
  };
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  indexedAt?: string;
};

function isBskyPost(v: unknown): v is BskyPost {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.uri === "string" &&
    typeof p.author === "object" && p.author !== null &&
    typeof (p.author as Record<string, unknown>).did === "string" &&
    typeof p.record === "object" && p.record !== null
  );
}

async function searchBsky(
  query: string,
  sort: "top" | "latest",
): Promise<BskyPost[]> {
  if (!query.trim()) return [];

  const url = new URL(`${BSKY_HOST}/xrpc/app.bsky.feed.searchPosts`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "25");
  url.searchParams.set("sort", sort);
  // NOTE: lang omitted intentionally — many real English posts have no langs tag.
  // Language filtering happens later in deduplication / Gemini relevance pass.

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "FirstBrief/1.0 (news-intelligence-dashboard)",
      },
      signal: AbortSignal.timeout(9_000),
    });

    if (!resp.ok) {
      console.warn(`[bsky] search "${query}" sort=${sort} → HTTP ${resp.status}`);
      return [];
    }

    const data = (await resp.json()) as { posts?: unknown[] };
    if (!Array.isArray(data.posts)) return [];
    return data.posts.filter(isBskyPost);
  } catch (err) {
    console.warn(`[bsky] search "${query}" sort=${sort} failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Step 3: Thread fetching ────────────────────────────────────────
// We only want direct replies (depth 2 = root + immediate replies + one more level).
// Cap at MAX_REPLIES_PER_THREAD so popular threads don't flood the candidate pool.

const MAX_REPLIES_PER_THREAD = 20;

function walkThreadNode(node: unknown, out: BskyPost[], maxDepth: number, currentDepth = 0): void {
  if (currentDepth > maxDepth) return;
  if (typeof node !== "object" || node === null) return;
  if (out.length >= MAX_REPLIES_PER_THREAD) return;

  const n = node as Record<string, unknown>;

  // Collect the post at this node (skip the root — it's already in allRaw)
  if (currentDepth > 0 && isBskyPost(n.post)) out.push(n.post as BskyPost);

  // Recurse into replies (only direct + one level deeper)
  if (Array.isArray(n.replies)) {
    for (const child of n.replies) {
      if (out.length >= MAX_REPLIES_PER_THREAD) break;
      walkThreadNode(child, out, maxDepth, currentDepth + 1);
    }
  }
}

async function fetchThreadPosts(uri: string): Promise<BskyPost[]> {
  const url = new URL(`${BSKY_HOST}/xrpc/app.bsky.feed.getPostThread`);
  url.searchParams.set("uri", uri);
  url.searchParams.set("depth", "2");       // root → replies → their replies
  url.searchParams.set("parentHeight", "0");

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "FirstBrief/1.0 (news-intelligence-dashboard)",
      },
      signal: AbortSignal.timeout(7_000),
    });

    if (!resp.ok) {
      console.warn(`[bsky] thread ${uri.slice(-30)} → HTTP ${resp.status}`);
      return [];
    }

    const data = (await resp.json()) as { thread?: unknown };
    const posts: BskyPost[] = [];
    walkThreadNode(data.thread, posts, 2);
    return posts;
  } catch (err) {
    console.warn(`[bsky] thread fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Step 4: Merge + deduplicate candidates ─────────────────────────

function deduplicatePosts(posts: BskyPost[]): BskyPost[] {
  const seenUris  = new Set<string>();
  const seenTexts = new Set<string>();
  const result: BskyPost[] = [];

  for (const post of posts) {
    // Must be a standard post record
    if (post.record.$type !== "app.bsky.feed.post") continue;

    // URI deduplicate
    if (seenUris.has(post.uri)) continue;
    seenUris.add(post.uri);

    const text = (post.record.text ?? "").trim();

    // Skip empty, pure-URL, or very short posts (spam guard — not a relevance filter)
    const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
    if (stripped.length < 10) continue;

    // Near-duplicate text (first 80 chars, normalised)
    const textKey = stripped.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
    if (seenTexts.has(textKey)) continue;
    seenTexts.add(textKey);

    result.push(post);
  }

  return result;
}

// ── Step 5: Gemini — semantic relevance filter + tiered analysis ───

type GeminiTierInsufficient = {
  tier: "insufficient";
  relevant_indices: number[];
};
type GeminiTierSmallSample = {
  tier: "small_sample";
  relevant_indices: number[];
  summary: string;
};
type GeminiTierQualitative = {
  tier: "qualitative";
  relevant_indices: number[];
  summary: string;
  themes: string[];
};
type GeminiTierOk = {
  tier: "ok";
  relevant_indices: number[];
  positive: number;
  neutral: number;
  negative: number;
  interpretation: string;
  themes: string[];
};

type GeminiAnalysis =
  | GeminiTierInsufficient
  | GeminiTierSmallSample
  | GeminiTierQualitative
  | GeminiTierOk;

async function analyseWithGemini(
  ai: GoogleGenAI,
  headline: string,
  candidates: BskyPost[],
): Promise<GeminiAnalysis> {
  const sample = candidates.slice(0, 50);

  const postLines = sample
    .map((p, i) => {
      const text = (p.record.text ?? "").replace(/\s+/g, " ").trim().slice(0, 350);
      const isReply = p.record.reply ? " [reply]" : "";
      return `[${i}]${isReply} ${text}`;
    })
    .join("\n");

  const count = sample.length;

  const prompt = `You are analysing Bluesky social media posts for FirstBrief, a news intelligence dashboard.

NEWS EVENT: "${headline}"

CANDIDATE POSTS (indexed 0–${count - 1}):
${postLines}

INSTRUCTIONS:
First, identify which posts genuinely discuss this specific news event or its direct consequences. A post is relevant if it:
- Explicitly references the same organisations, people, decisions, or developments described in the news event
- Expresses an opinion or reaction to this specific event (even if brief)
- Is a reply that engages meaningfully with the topic (even without restating the headline)

A post is NOT relevant if it:
- Discusses a different event that happens to mention the same names
- Is spam, a pure link share with no opinion, or promotional content
- Is in a language other than English (unless clearly bilingual and relevant)

After identifying relevant posts, count them and produce a response in one of these tiers:

TIER "insufficient" — 0 relevant posts:
{ "tier": "insufficient", "relevant_indices": [] }

TIER "small_sample" — 1 or 2 relevant posts:
{ "tier": "small_sample", "relevant_indices": [<indices>], "summary": "<2-3 sentence FirstBrief-style description of what these Bluesky users are saying. Acknowledge this is a very limited sample.>" }

TIER "qualitative" — 3 to 7 relevant posts:
{ "tier": "qualitative", "relevant_indices": [<indices>], "summary": "<2-3 sentence FirstBrief-style editorial note describing the discussion tone and main perspectives. Write like a journalist, not a data analyst.>", "themes": ["<recurring theme, 3-6 words>", "<second theme>"] }

TIER "ok" — 8 or more relevant posts:
{ "tier": "ok", "relevant_indices": [<indices>], "positive": <int 0-100>, "neutral": <int 0-100>, "negative": <int 0-100>, "interpretation": "<one sentence, 15-30 words, describing the overall tone and what drives it>", "themes": ["<theme 1, 3-6 words>", "<theme 2>", "<theme 3, optional>"] }

RULES:
- positive + neutral + negative MUST sum exactly to 100 for tier "ok"
- "themes" max 3 entries; 2 for "qualitative"
- "summary" and "interpretation": write like a concise FirstBrief editorial observation, not a data dump
- Be strict about relevance — quality over quantity
- Return ONLY valid JSON. No markdown, no code fences, no extra text.`.trim();

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input: prompt,
    store: false,
  });

  const raw = (interaction.output_text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!raw) throw new Error("[gemini] empty response");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`[gemini] JSON parse failed — raw: ${raw.slice(0, 300)}`);
  }

  // Extract relevant_indices defensively
  const relevantIndices: number[] = Array.isArray(parsed.relevant_indices)
    ? (parsed.relevant_indices as unknown[]).filter((n): n is number => typeof n === "number" && n >= 0 && n < count)
    : [];

  const relevantCount = relevantIndices.length;

  // Server-side tier override: Gemini may mis-tier; we enforce by count
  const correctTier =
    relevantCount === 0 ? "insufficient" :
    relevantCount <= 2  ? "small_sample" :
    relevantCount <= 7  ? "qualitative"  : "ok";

  const geminiTier = typeof parsed.tier === "string" ? parsed.tier : correctTier;
  // Use Gemini's tier only if it matches the count-based tier (avoids mismatch)
  const tier = geminiTier === correctTier ? geminiTier : correctTier;

  if (tier === "insufficient") {
    return { tier: "insufficient", relevant_indices: [] };
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  if (tier === "small_sample") {
    return {
      tier: "small_sample",
      relevant_indices: relevantIndices,
      summary: summary || `${relevantCount} Bluesky ${relevantCount === 1 ? "post" : "posts"} discuss this topic, reflecting an early or limited reaction.`,
    };
  }

  const rawThemes = Array.isArray(parsed.themes)
    ? (parsed.themes as unknown[]).filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 3)
    : [];

  if (tier === "qualitative") {
    return {
      tier: "qualitative",
      relevant_indices: relevantIndices,
      summary: summary || `${relevantCount} selected Bluesky posts discuss this news event.`,
      themes: rawThemes,
    };
  }

  // tier === "ok"
  const pos = Math.max(0, Math.min(100, Math.round(Number(parsed.positive) || 0)));
  const neu = Math.max(0, Math.min(100, Math.round(Number(parsed.neutral)  || 0)));
  let neg = Math.max(0, Math.min(100, Math.round(Number(parsed.negative)  || 0)));
  let adjPos = pos, adjNeu = neu, adjNeg = neg;
  const total = adjPos + adjNeu + adjNeg;
  if (total !== 100) {
    const diff = 100 - total;
    if (adjPos >= adjNeu && adjPos >= adjNeg) adjPos = Math.max(0, adjPos + diff);
    else if (adjNeu >= adjNeg) adjNeu = Math.max(0, adjNeu + diff);
    else adjNeg = Math.max(0, adjNeg + diff);
  }

  return {
    tier: "ok",
    relevant_indices: relevantIndices,
    positive: adjPos,
    neutral:  adjNeu,
    negative: adjNeg,
    interpretation: typeof parsed.interpretation === "string" ? parsed.interpretation.trim() : "",
    themes: rawThemes,
  };
}

// ── Route ──────────────────────────────────────────────────────────

router.post("/sentiment", async (req, res) => {
  const body = (req.body ?? {}) as {
    clusterId?: unknown;
    headline?:  unknown;
    rundown?:   unknown;
    topic?:     unknown;
  };

  const clusterId = typeof body.clusterId === "string" ? body.clusterId.trim() : "";
  const headline  = typeof body.headline  === "string" ? body.headline.trim()  : "";
  const rundown   = typeof body.rundown   === "string" ? body.rundown.trim()   : "";

  if (!clusterId || !headline) {
    res.status(400).json({ error: "clusterId and headline are required" });
    return;
  }

  // Serve from cache
  const cached = getCached(clusterId);
  if (cached) { res.json(cached); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Gemini API key not configured" });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });

  // ── 1. Extract entities ────────────────────────────────────────
  let entities: string[];
  try {
    entities = await extractEntities(ai, headline, rundown);
    console.log(`[sentiment] cluster=${clusterId} entities=[${entities.join(" | ")}]`);
  } catch (err) {
    console.error("[sentiment] entity extraction failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Entity extraction failed" });
    return;
  }

  // ── 2. Multi-search Bluesky in parallel ────────────────────────
  // One top-sorted search per entity, plus a combined latest search
  const topSearches   = entities.slice(0, 4).map((e) => searchBsky(e, "top"));
  const latestCombined = searchBsky(entities.slice(0, 2).join(" "), "latest");

  let allRaw: BskyPost[];
  try {
    const results = await Promise.all([...topSearches, latestCombined]);
    allRaw = results.flat();
    console.log(`[sentiment] bsky searches=${results.length} raw_total=${allRaw.length}`);
  } catch (err) {
    console.error("[sentiment] Bluesky multi-search failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Unable to retrieve Bluesky posts" });
    return;
  }

  // ── 3. Fetch reply threads for top-engaged posts ───────────────
  const topByEngagement = [...allRaw]
    .sort((a, b) =>
      ((b.likeCount ?? 0) + (b.repostCount ?? 0)) -
      ((a.likeCount ?? 0) + (a.repostCount ?? 0)),
    )
    .slice(0, 5);

  const threadResults = await Promise.all(
    topByEngagement.map((p) => fetchThreadPosts(p.uri)),
  );
  const threadPosts = threadResults.flat();
  console.log(`[sentiment] thread_replies=${threadPosts.length}`);

  // ── 4. Deduplicate + prioritise ───────────────────────────────
  // Sort raw posts by engagement first so the best signal is at the front.
  const engagementScore = (p: BskyPost) =>
    (p.likeCount ?? 0) + (p.repostCount ?? 0) * 2 + (p.replyCount ?? 0);

  const sortedRaw     = [...allRaw].sort((a, b) => engagementScore(b) - engagementScore(a));
  const sortedThreads = [...threadPosts].sort((a, b) => engagementScore(b) - engagementScore(a));

  // Merge: raw first (more directly relevant from entity searches), threads after
  const candidates = deduplicatePosts([...sortedRaw, ...sortedThreads]);
  console.log(`[sentiment] candidates=${candidates.length}`);

  // Light entity-keyword pre-filter to boost signal before the Gemini call.
  // Only keeps posts that mention at least one extracted entity (case-insensitive).
  // This is NOT a relevance gate — Gemini still decides relevance. It just cuts
  // pure noise (posts that share a word with our entity names but discuss something else).
  const entityKeywords = entities.map((e) => e.toLowerCase());

  const entityMatched = candidates.filter((p) => {
    const lower = (p.record.text ?? "").toLowerCase();
    return entityKeywords.some((kw) =>
      kw.split(/\s+/).every((part) => lower.includes(part)),
    );
  });

  // Fall back to all candidates if the pre-filter eliminates too many
  const preFiltered = entityMatched.length >= 5 ? entityMatched : candidates;
  console.log(`[sentiment] pre_filtered=${preFiltered.length} (entity_matched=${entityMatched.length})`);

  if (preFiltered.length === 0) {
    const result: SentimentInsufficient = { status: "insufficient", postCount: 0 };
    setCached(clusterId, result);
    res.json(result);
    return;
  }

  // ── 5. Gemini: semantic filter + tiered analysis ───────────────
  let analysis: GeminiAnalysis;
  try {
    analysis = await analyseWithGemini(ai, headline, preFiltered);
    console.log(`[sentiment] tier=${analysis.tier} relevant=${analysis.relevant_indices.length}`);
  } catch (err) {
    console.error("[sentiment] Gemini analysis failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Unable to analyse sentiment" });
    return;
  }

  const relevantCount = analysis.relevant_indices.length;
  const now = new Date().toISOString();

  let result: SentimentResponse;

  if (analysis.tier === "insufficient") {
    result = { status: "insufficient", postCount: relevantCount };
  } else if (analysis.tier === "small_sample") {
    result = {
      status:     "small_sample",
      summary:    analysis.summary,
      postCount:  relevantCount,
      source:     "Bluesky",
      observedAt: now,
    };
  } else if (analysis.tier === "qualitative") {
    result = {
      status:     "qualitative",
      summary:    analysis.summary,
      themes:     analysis.themes,
      postCount:  relevantCount,
      source:     "Bluesky",
      observedAt: now,
    };
  } else {
    result = {
      status:         "ok",
      positive:       analysis.positive,
      neutral:        analysis.neutral,
      negative:       analysis.negative,
      interpretation: analysis.interpretation,
      themes:         analysis.themes,
      postCount:      relevantCount,
      source:         "Bluesky",
      observedAt:     now,
    };
  }

  setCached(clusterId, result);
  res.json(result);
});

export default router;
