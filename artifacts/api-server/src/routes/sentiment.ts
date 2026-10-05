/**
 * POST /api/sentiment  — v3
 *
 * Protections added in v3:
 *   - Deterministic entity extraction (no Gemini call at search stage).
 *     Only ONE Gemini call per request: the combined relevance-filter + tiered
 *     sentiment analysis at the end.
 *   - 45-min server-side cache keyed on the canonical Guardian article URL
 *     (falling back to clusterId). Repeated browser refreshes never repeat
 *     Bluesky+Gemini work during the TTL.
 *   - Stale fallback window of 4 hours: if Gemini returns 429 during a refresh
 *     attempt, the previous successful snapshot is served instead of an error.
 *   - Gemini 429 cooldown: the "retry in Xs" hint is parsed; no Gemini calls are
 *     made during the cooldown window.
 *   - Request coalescing: simultaneous requests for the same uncached article
 *     share one pipeline run; the others wait and reuse the result.
 *
 * IMPORTANT: Use api.bsky.app (NOT public.api.bsky.app — Cloudflare-blocked).
 */

import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";
import { enqueueGeminiCall, recordGeminiQuota, isGeminiCoolingDown, geminiCooldownMs } from "../gemini-limiter";
import { analysisKey, analysisFailedRecently, recordAnalysisFailure, ANALYSIS_REQUEST_OPTIONS } from "../analysis-policy";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const BSKY_HOST = "https://api.bsky.app";

// ── Cache (45-min TTL, 4-hour stale window) ────────────────────────
const SENTIMENT_TTL_MS       = 45 * 60 * 1000;   // 45 minutes — fresh TTL
const SENTIMENT_STALE_MAX_MS =  4 * 60 * 60 * 1000; // 4 hours — eviction threshold

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

// ── Server-side cache ──────────────────────────────────────────────
interface SentimentEntry {
  result:    SentimentResponse;
  cachedAt:  number;
  expiresAt: number;
}

const sentimentCache = new Map<string, SentimentEntry>();

function sentimentGet(key: string): { result: SentimentResponse; stale: boolean } | null {
  const e = sentimentCache.get(key);
  if (!e) return null;
  const now = Date.now();
  if (now > e.cachedAt + SENTIMENT_STALE_MAX_MS) {
    sentimentCache.delete(key);
    return null;
  }
  return { result: e.result, stale: now > e.expiresAt };
}

function sentimentSet(key: string, result: SentimentResponse): void {
  if (sentimentCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of sentimentCache) {
      if (now > v.cachedAt + SENTIMENT_STALE_MAX_MS) sentimentCache.delete(k);
    }
  }
  const now = Date.now();
  sentimentCache.set(key, { result, cachedAt: now, expiresAt: now + SENTIMENT_TTL_MS });
}

function sentimentCacheKey(articleUrl: string, clusterId: string): string {
  const raw = articleUrl.trim() || clusterId.trim();
  return raw.toLowerCase().replace(/\/+$/, "").slice(0, 500);
}

// ── Gemini quota cooldown — shared with all routes via gemini-limiter ──────
function sentimentSetCooldown(errorMsg: string): void {
  recordGeminiQuota(errorMsg);
}

// ── Request coalescing ─────────────────────────────────────────────
const sentimentInFlight = new Map<string, Promise<SentimentResponse>>();

// ── Step 1: Deterministic entity extraction (no Gemini) ────────────
// Extracts proper-noun entities from headline + rundown without any API call.
// This eliminates the first Gemini call from the previous pipeline, leaving
// only one Gemini call per sentiment request (the relevance filter + analysis).

const ENTITY_NOISE = new Set([
  "the","a","an","in","on","at","to","for","of","with","by","from","as",
  "and","or","but","is","are","was","were","be","been","has","have","had",
  "it","he","she","they","we","this","that","these","those","his","her",
  "their","our","its","my","your","not","no","so","yet","now","then","here",
  "there","since","just","still","over","back","up","out","off","more","most",
  "last","first","next","other","same","few","much","many","some","own","well",
  "also","even","only","both","each","every","such","while","where","which",
  "than","less","far","near","against","between","among","through","across",
  "without","within","beyond","despite","until","unless","though","although",
  "however","therefore","big","new","old","key","top","major","high","low",
  "former","senior","latest","current","recent","said","says","amid","could",
  "would","should","will","may","can","must","might","set","get","make",
  "take","give","put","keep","let","come","go","see","know","think","look",
  "want","use","find","tell","ask","seem","feel","try","leave","call","turn",
  "start","open","close","win","lose","move","live","plan","lead","seek",
  "aim","face","hit","cut","fall","rise","push","pull","end","run","hold",
  "show","plan","deal","move","step","meet","join","sign","launch","report",
  "after","before","during","about","into","amid","amid","one","two","three",
]);

// Topic-specific seed terms used as fallback when fewer than 2 entities found
const TOPIC_SEEDS: Record<string, string[]> = {
  ai:       ["OpenAI", "DeepMind", "artificial intelligence"],
  nuclear:  ["nuclear energy", "SMR reactor", "nuclear power"],
  football: ["Champions League", "Premier League", "transfer window"],
};

function extractEntitiesDeterministic(
  headline: string,
  rundown:  string,
  topic:    string,
): string[] {
  // Combine headline + first 400 chars of rundown; strip possessives and quotes
  const raw = (headline + " " + rundown.slice(0, 400))
    .replace(/'s\b/gi, "")    // strip possessives
    .replace(/["""''`]/g, "") // strip fancy quotes
    .replace(/--+/g, " ")     // em-dashes to spaces
    .replace(/[^\w\s\-]/g, " ") // remove other punctuation
    .trim();

  const words = raw.split(/\s+/).filter(Boolean);

  // Build consecutive proper-noun "runs" (sequences of title-case / all-caps words)
  const runs: string[] = [];
  let currentRun: string[] = [];

  const flush = () => {
    if (currentRun.length === 0) return;
    if (currentRun.length > 1) {
      runs.push(currentRun.join(" ")); // multi-word entity
    }
    for (const w of currentRun) runs.push(w); // individual words too
    currentRun = [];
  };

  for (const word of words) {
    const clean = word.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length < 2) { flush(); continue; }

    const isAllCaps    = clean === clean.toUpperCase() && /[A-Z]/.test(clean);
    const isTitleCase  = /^[A-Z]/.test(clean) && !isAllCaps;
    const isNoise      = ENTITY_NOISE.has(clean.toLowerCase());

    const isProper = (isAllCaps || isTitleCase) && !isNoise;

    if (isProper) {
      currentRun.push(clean);
    } else {
      flush();
    }
  }
  flush();

  if (runs.length === 0) {
    // Absolute fallback: use the first 50 chars of the headline as a search term
    const seeds = TOPIC_SEEDS[topic] ?? [];
    return seeds.length > 0 ? seeds.slice(0, 2) : [headline.slice(0, 50)];
  }

  // Deduplicate: sort by length DESC (more specific first), then remove substrings
  const unique = [...new Set(runs)].sort((a, b) => b.length - a.length);
  const result: string[] = [];

  for (const entity of unique) {
    if (entity.length < 2) continue;
    // Skip if already covered as a substring of a longer entity in the result
    const covered = result.some(
      (e) => e.toLowerCase().includes(entity.toLowerCase()) && e !== entity,
    );
    if (!covered) result.push(entity);
    if (result.length >= 5) break;
  }

  // Append topic seeds as fallback if we have fewer than 2 entities
  if (result.length < 2) {
    const seeds = TOPIC_SEEDS[topic] ?? [];
    for (const seed of seeds) {
      if (result.length >= 4) break;
      if (!result.some((r) => r.toLowerCase() === seed.toLowerCase())) {
        result.push(seed);
      }
    }
  }

  return result;
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

async function searchBsky(query: string, sort: "top" | "latest"): Promise<BskyPost[]> {
  if (!query.trim()) return [];
  const url = new URL(`${BSKY_HOST}/xrpc/app.bsky.feed.searchPosts`);
  url.searchParams.set("q",     query);
  url.searchParams.set("limit", "25");
  url.searchParams.set("sort",  sort);
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "Accept":     "application/json",
        "User-Agent": "FirstBrief/1.0 (news-intelligence-dashboard)",
      },
      signal: AbortSignal.timeout(9_000),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "Bluesky search unavailable");
      return [];
    }
    const data = (await resp.json()) as { posts?: unknown[] };
    if (!Array.isArray(data.posts)) return [];
    return data.posts.filter(isBskyPost);
  } catch (err) {
    logger.warn({ err }, "Bluesky search failed");
    return [];
  }
}

// ── Step 3: Thread fetching (capped) ──────────────────────────────
const MAX_REPLIES_PER_THREAD = 20;

function walkThreadNode(node: unknown, out: BskyPost[], maxDepth: number, depth = 0): void {
  if (depth > maxDepth || out.length >= MAX_REPLIES_PER_THREAD) return;
  if (typeof node !== "object" || node === null) return;
  const n = node as Record<string, unknown>;
  if (depth > 0 && isBskyPost(n.post)) out.push(n.post as BskyPost);
  if (Array.isArray(n.replies)) {
    for (const child of n.replies) {
      if (out.length >= MAX_REPLIES_PER_THREAD) break;
      walkThreadNode(child, out, maxDepth, depth + 1);
    }
  }
}

async function fetchThreadPosts(uri: string): Promise<BskyPost[]> {
  const url = new URL(`${BSKY_HOST}/xrpc/app.bsky.feed.getPostThread`);
  url.searchParams.set("uri",          uri);
  url.searchParams.set("depth",        "2");
  url.searchParams.set("parentHeight", "0");
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "Accept":     "application/json",
        "User-Agent": "FirstBrief/1.0 (news-intelligence-dashboard)",
      },
      signal: AbortSignal.timeout(7_000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { thread?: unknown };
    const posts: BskyPost[] = [];
    walkThreadNode(data.thread, posts, 2);
    return posts;
  } catch {
    return [];
  }
}

// ── Step 4: Merge + deduplicate ────────────────────────────────────
function deduplicatePosts(posts: BskyPost[]): BskyPost[] {
  const seenUris  = new Set<string>();
  const seenTexts = new Set<string>();
  const result: BskyPost[] = [];
  for (const post of posts) {
    if (post.record.$type !== "app.bsky.feed.post") continue;
    if (seenUris.has(post.uri)) continue;
    seenUris.add(post.uri);
    const text    = (post.record.text ?? "").trim();
    const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
    if (stripped.length < 10) continue;
    const textKey = stripped.slice(0, 80).toLowerCase().replace(/\s+/g, " ");
    if (seenTexts.has(textKey)) continue;
    seenTexts.add(textKey);
    result.push(post);
  }
  return result;
}

// ── Step 5: Gemini — semantic relevance + tiered analysis (ONE call) ─
// This is the only Gemini call in the entire sentiment pipeline.

type GeminiTierInsufficient = { tier: "insufficient"; relevant_indices: number[] };
type GeminiTierSmallSample  = { tier: "small_sample";  relevant_indices: number[]; summary: string };
type GeminiTierQualitative  = { tier: "qualitative";   relevant_indices: number[]; summary: string; themes: string[] };
type GeminiTierOk           = { tier: "ok"; relevant_indices: number[]; positive: number; neutral: number; negative: number; interpretation: string; themes: string[] };
type GeminiAnalysis = GeminiTierInsufficient | GeminiTierSmallSample | GeminiTierQualitative | GeminiTierOk;

async function analyseWithGemini(
  ai: GoogleGenAI,
  headline: string,
  candidates: BskyPost[],
): Promise<GeminiAnalysis> {
  const sample = candidates.slice(0, 50);
  const count  = sample.length;

  const postLines = sample
    .map((p, i) => {
      const text    = (p.record.text ?? "").replace(/\s+/g, " ").trim().slice(0, 350);
      const isReply = p.record.reply ? " [reply]" : "";
      return `[${i}]${isReply} ${text}`;
    })
    .join("\n");

  const prompt = `You are analysing Bluesky social media posts for FirstBrief, a news intelligence dashboard.

NEWS EVENT: "${headline}"

CANDIDATE POSTS (indexed 0–${count - 1}):
${postLines}

INSTRUCTIONS:
First, identify which posts genuinely discuss this specific news event or its direct consequences. A post is relevant if it explicitly references the same organisations, people, decisions, or developments. A reply is relevant if it engages meaningfully with the topic. Reject posts about unrelated events, spam, pure link shares with no opinion, or non-English posts.

Count the relevant posts and produce a response in the matching tier:

TIER "insufficient" — 0 relevant:
{ "tier": "insufficient", "relevant_indices": [] }

TIER "small_sample" — 1 or 2 relevant:
{ "tier": "small_sample", "relevant_indices": [<indices>], "summary": "<2-3 sentence FirstBrief-style note on what these users say; acknowledge limited sample>" }

TIER "qualitative" — 3 to 7 relevant:
{ "tier": "qualitative", "relevant_indices": [<indices>], "summary": "<2-3 sentence editorial note on discussion tone and main perspectives>", "themes": ["<theme 3-6 words>", "<theme 3-6 words>"] }

TIER "ok" — 8 or more relevant:
{ "tier": "ok", "relevant_indices": [<indices>], "positive": <int 0-100>, "neutral": <int 0-100>, "negative": <int 0-100>, "interpretation": "<one sentence 15-30 words on overall tone>", "themes": ["<theme>", "<theme>", "<theme optional>"] }

RULES: positive+neutral+negative must sum to exactly 100 for "ok". Max 3 themes. Return ONLY valid JSON, no markdown.`.trim();

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input: prompt,
    store: false,
  }, ANALYSIS_REQUEST_OPTIONS);

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

  const relevantIndices: number[] = Array.isArray(parsed.relevant_indices)
    ? (parsed.relevant_indices as unknown[]).filter((n): n is number => typeof n === "number" && n >= 0 && n < count)
    : [];

  const relevantCount = relevantIndices.length;

  // Server-side tier enforcement — prevents Gemini from misclassifying
  const correctTier =
    relevantCount === 0 ? "insufficient" :
    relevantCount <= 2  ? "small_sample"  :
    relevantCount <= 7  ? "qualitative"   : "ok";

  const tier = (typeof parsed.tier === "string" && parsed.tier === correctTier)
    ? parsed.tier
    : correctTier;

  if (tier === "insufficient") {
    return { tier: "insufficient", relevant_indices: [] };
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";

  if (tier === "small_sample") {
    return {
      tier: "small_sample",
      relevant_indices: relevantIndices,
      summary: summary || `${relevantCount} Bluesky ${relevantCount === 1 ? "post" : "posts"} found discussing this topic.`,
    };
  }

  const rawThemes = Array.isArray(parsed.themes)
    ? (parsed.themes as unknown[]).filter((t): t is string => typeof t === "string").map(t => t.trim()).filter(Boolean).slice(0, 3)
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
  let pos = Math.max(0, Math.min(100, Math.round(Number(parsed.positive) || 0)));
  let neu = Math.max(0, Math.min(100, Math.round(Number(parsed.neutral)  || 0)));
  let neg = Math.max(0, Math.min(100, Math.round(Number(parsed.negative) || 0)));
  const tot = pos + neu + neg;
  if (tot !== 100) {
    const diff = 100 - tot;
    if (pos >= neu && pos >= neg) pos = Math.max(0, pos + diff);
    else if (neu >= neg)          neu = Math.max(0, neu + diff);
    else                          neg = Math.max(0, neg + diff);
  }

  return {
    tier: "ok",
    relevant_indices: relevantIndices,
    positive: pos, neutral: neu, negative: neg,
    interpretation: typeof parsed.interpretation === "string" ? parsed.interpretation.trim() : "",
    themes: rawThemes,
  };
}

// ── Full pipeline (entity extraction → Bluesky → threads → dedup → Gemini) ──
async function runPipeline(
  ai: GoogleGenAI,
  headline: string,
  rundown:  string,
  topic:    string,
): Promise<SentimentResponse> {
  // 1. Deterministic entity extraction (no Gemini)
  const entities = extractEntitiesDeterministic(headline, rundown, topic);
  logger.debug({ entities }, "Sentiment entities extracted");

  // 2. Multi-search Bluesky in parallel
  const topSearches     = entities.slice(0, 4).map(e => searchBsky(e, "top"));
  const latestCombined  = searchBsky(entities.slice(0, 2).join(" "), "latest");
  const results         = await Promise.all([...topSearches, latestCombined]);
  const allRaw          = results.flat();
  logger.debug({ searches: results.length, posts: allRaw.length }, "Bluesky search completed");

  // 3. Thread replies for top-engaged posts
  const engScore = (p: BskyPost) =>
    (p.likeCount ?? 0) + (p.repostCount ?? 0) * 2 + (p.replyCount ?? 0);

  const topByEngagement = [...allRaw]
    .sort((a, b) => engScore(b) - engScore(a))
    .slice(0, 5);

  const threadResults = await Promise.all(topByEngagement.map(p => fetchThreadPosts(p.uri)));
  const threadPosts   = threadResults.flat();
  logger.debug({ replies: threadPosts.length }, "Bluesky replies retrieved");

  // 4. Deduplicate (raw sorted by engagement first — more targeted signal)
  const sortedRaw     = [...allRaw].sort((a, b) => engScore(b) - engScore(a));
  const sortedThreads = [...threadPosts].sort((a, b) => engScore(b) - engScore(a));
  const candidates    = deduplicatePosts([...sortedRaw, ...sortedThreads]);

  // Light entity keyword pre-filter (requires any entity-word to appear — cuts pure noise)
  const entityKeywords = entities.map(e => e.toLowerCase());
  const entityMatched  = candidates.filter(p => {
    const lower = (p.record.text ?? "").toLowerCase();
    return entityKeywords.some(kw =>
      kw.split(/\s+/).every(part => lower.includes(part)),
    );
  });
  const preFiltered = entityMatched.length >= 5 ? entityMatched : candidates;
  logger.debug({ candidates: candidates.length, filtered: preFiltered.length }, "Sentiment candidates filtered");

  if (preFiltered.length === 0) {
    return { status: "insufficient", postCount: 0 };
  }

  // 5. Single Gemini call (serialised through shared limiter): relevance filter + tiered analysis
  logger.info({ candidates: preFiltered.length }, "Sentiment generation requested");
  const analysis = await enqueueGeminiCall(() => analyseWithGemini(ai, headline, preFiltered));
  logger.info({ tier: analysis.tier, relevant: analysis.relevant_indices.length }, "Sentiment analysis completed");

  const relevantCount = analysis.relevant_indices.length;
  const now           = new Date().toISOString();

  if (analysis.tier === "insufficient") {
    return { status: "insufficient", postCount: relevantCount };
  }
  if (analysis.tier === "small_sample") {
    return { status: "small_sample", summary: analysis.summary, postCount: relevantCount, source: "Bluesky", observedAt: now };
  }
  if (analysis.tier === "qualitative") {
    return { status: "qualitative", summary: analysis.summary, themes: analysis.themes, postCount: relevantCount, source: "Bluesky", observedAt: now };
  }
  return {
    status: "ok",
    positive: analysis.positive, neutral: analysis.neutral, negative: analysis.negative,
    interpretation: analysis.interpretation, themes: analysis.themes,
    postCount: relevantCount, source: "Bluesky", observedAt: now,
  };
}

// ── Route ──────────────────────────────────────────────────────────
router.post("/sentiment", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;

  const clusterId  = typeof b.clusterId  === "string" ? b.clusterId.trim()  : "";
  const headline   = typeof b.headline   === "string" ? b.headline.trim()   : "";
  const rundown    = typeof b.rundown    === "string" ? b.rundown.trim()    : "";
  const topic      = typeof b.topic      === "string" ? b.topic.trim()      : "";
  const articleUrl = typeof b.articleUrl === "string" ? b.articleUrl.trim() : "";

  if (!clusterId || !headline) {
    res.status(400).json({ error: "clusterId and headline are required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Gemini API key not configured" });
    return;
  }

  // Stable cache key: prefer canonical article URL, fall back to clusterId
  const cacheKey = analysisKey("sentiment", articleUrl || clusterId, [headline, rundown, topic]);

  // ── 1. Cache hit (fresh) ─────────────────────────────────────────
  const cached = sentimentGet(cacheKey);
  if (cached && !cached.stale) {
    req.log.info({ cacheKey }, "Sentiment cache hit");
    res.json(cached.result);
    return;
  }
  if (cached?.stale) {
    req.log.info({ cacheKey }, "Sentiment cache stale");
  } else {
    req.log.info({ cacheKey }, "Sentiment cache miss");
  }

  // ── 2. Gemini cooldown check ─────────────────────────────────────
  if (isGeminiCoolingDown() || analysisFailedRecently(cacheKey)) {
    const secs = Math.ceil(geminiCooldownMs() / 1000);
    if (cached) {
      req.log.info({ secs }, "Sentiment blocked; serving stored result");
      res.json(cached.result);
    } else {
      req.log.info({ secs }, "Sentiment blocked; no stored result");
      res.status(503).json({ error: "Sentiment temporarily unavailable" });
    }
    return;
  }

  // ── 3. Request coalescing ────────────────────────────────────────
  const inFlight = sentimentInFlight.get(cacheKey);
  if (inFlight) {
    req.log.info({ cacheKey }, "Sentiment request coalesced");
    try {
      const result = await inFlight;
      res.json(result);
    } catch {
      if (cached) {
        req.log.info("Sentiment failed; serving stored result");
        res.json(cached.result);
      } else {
        res.status(500).json({ error: "Unable to analyse sentiment" });
      }
    }
    return;
  }

  // ── 4. Run pipeline ──────────────────────────────────────────────
  const ai = new GoogleGenAI({ apiKey });

  const promise = runPipeline(ai, headline, rundown, topic);
  sentimentInFlight.set(cacheKey, promise);
  promise.catch(() => {}).finally(() => sentimentInFlight.delete(cacheKey));

  try {
    const result = await promise;
    sentimentSet(cacheKey, result);
    req.log.info({ cacheKey }, "Sentiment result stored");
    res.json(result);
  } catch (err) {
    recordAnalysisFailure(cacheKey);
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ message: msg.slice(0, 250) }, "Sentiment pipeline failed");

    const is429 = msg.includes("429") || /quota/i.test(msg);
    if (is429) {
      sentimentSetCooldown(msg);
      if (cached) {
        req.log.info("Sentiment quota limited; serving stored result");
        res.json(cached.result);
      } else {
        res.status(503).json({ error: "Unable to analyse sentiment" });
      }
    } else if (cached) {
      res.json(cached.result);
    } else {
      res.status(500).json({ error: "Unable to analyse sentiment" });
    }
  }
});

export default router;
