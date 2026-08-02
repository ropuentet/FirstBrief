/**
 * POST /api/sentiment
 *
 * Provider: Bluesky public unauthenticated search API — no key, no login.
 * Endpoint: https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
 *
 * Flow:
 *   1. Build a short keyword query from the cluster headline.
 *   2. Fetch up to 50 recent top-ranked English posts from Bluesky.
 *   3. Filter: regular posts only, no replies, ≥40 chars substantive text,
 *      one post per author, de-duped by text prefix, must contain a keyword.
 *   4. If < 8 posts survive: return { status: 'insufficient' } — no invention.
 *   5. Otherwise: send up to 30 posts to Gemini for strict-JSON sentiment.
 *   6. Cache result per clusterId for 15 minutes.
 */

import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

// ── Public types (mirrored in the frontend) ────────────────────────
export type SentimentOk = {
  status: "ok";
  positive: number;
  neutral: number;
  negative: number;
  interpretation: string;
  themes: string[];
  postCount: number;
  source: "Bluesky";
  observedAt: string; // ISO-8601
};

export type SentimentInsufficient = {
  status: "insufficient";
  postCount: number; // how many passed filtering (0–7)
};

export type SentimentResponse = SentimentOk | SentimentInsufficient;

// ── Bluesky post shape ─────────────────────────────────────────────
type BskyAuthor = { did: string; handle: string };

type BskyRecord = {
  $type: string;
  text: string;
  createdAt: string;
  langs?: string[];
  reply?: unknown;
};

type BskyPost = {
  uri: string;
  author: BskyAuthor;
  record: BskyRecord;
  indexedAt: string;
};

type BskySearchResponse = { posts?: BskyPost[] };

// ── In-memory cache ────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

const cache = new Map<
  string,
  { result: SentimentResponse; expiresAt: number }
>();

function getCached(key: string): SentimentResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(key: string, result: SentimentResponse): void {
  // Evict old entries if cache grows large
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Query construction ─────────────────────────────────────────────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "its","their","this","that","is","are","was","were","by","from","new",
  "as","up","over","how","why","when","what","into","out","has","have",
  "than","more","one","two","after","before","about","will","would",
  "could","should","may","might","says","said","amid","plan","set","get",
  "not","it","be","been","had","his","her","he","she","they","we","us",
]);

function buildQuery(headline: string): { query: string; keywords: string[] } {
  const words = headline
    .split(/[\s\-\/,]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  // Up to 5 significant terms
  const keywords = [...new Set(words)].slice(0, 5);
  return { query: keywords.join(" "), keywords };
}

// ── Post filtering ─────────────────────────────────────────────────
const MIN_POSTS = 8;

function filterPosts(posts: BskyPost[], keywords: string[]): BskyPost[] {
  const seenAuthors = new Set<string>();
  const seenText = new Set<string>();
  const kept: BskyPost[] = [];

  for (const post of posts) {
    const rec = post.record;

    // Must be a standard post
    if (rec.$type !== "app.bsky.feed.post") continue;

    // No replies — they're context-dependent fragments
    if (rec.reply) continue;

    const text = rec.text ?? "";

    // Minimum substantive length
    if (text.length < 40) continue;

    // Must contain real words beyond URLs
    const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
    if (stripped.length < 20) continue;

    // Language: pass if langs unset, or if 'en' is present
    const langs = rec.langs;
    if (langs && langs.length > 0 && !langs.includes("en")) continue;

    // One post per author
    if (seenAuthors.has(post.author.did)) continue;

    // Near-duplicate text check (first 60 chars)
    const textKey = text.slice(0, 60).toLowerCase().replace(/\s+/g, " ");
    if (seenText.has(textKey)) continue;

    // Relevance: at least one keyword present in the text
    const lower = text.toLowerCase();
    if (!keywords.some((kw) => lower.includes(kw))) continue;

    seenAuthors.add(post.author.did);
    seenText.add(textKey);
    kept.push(post);

    if (kept.length >= 50) break;
  }

  return kept;
}

// ── Bluesky search ─────────────────────────────────────────────────
async function fetchBskyPosts(query: string): Promise<BskyPost[]> {
  const url = new URL(
    "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts",
  );
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "50");
  url.searchParams.set("lang", "en");
  url.searchParams.set("sort", "top");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Bluesky search returned ${response.status}`);
  }

  const data = (await response.json()) as BskySearchResponse;
  return data.posts ?? [];
}

// ── Gemini sentiment analysis ──────────────────────────────────────
type GeminiSentimentResult = {
  positive: number;
  neutral: number;
  negative: number;
  interpretation: string;
  themes: string[];
};

async function analyseSentimentWithGemini(
  apiKey: string,
  headline: string,
  posts: BskyPost[],
): Promise<GeminiSentimentResult> {
  const ai = new GoogleGenAI({ apiKey });

  const sample = posts.slice(0, 30);
  const postLines = sample
    .map((p, i) => `[${i + 1}] ${p.record.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  const prompt = `You are analysing selected Bluesky posts discussing a news topic for FirstBrief.

TOPIC: ${headline}

POSTS (${sample.length} selected, one per line):
${postLines}

Classify the overall sentiment and identify recurring discussion themes.

Return ONLY a JSON object. No markdown, no code fences, no text before or after.
Start with { and end with }.

Required schema:
{
  "positive": <integer 0-100>,
  "neutral": <integer 0-100>,
  "negative": <integer 0-100>,
  "interpretation": "<one factual sentence, 15–30 words, summarising the overall tone>",
  "themes": ["<theme 1, 3–8 words>", "<theme 2, 3–8 words>"]
}

Rules:
- positive + neutral + negative MUST sum to exactly 100
- 2 to 3 themes maximum
- interpretation must be a single complete sentence
- Be conservative: when posts are mixed, lean toward neutral
- Base analysis ONLY on the provided posts; do not add outside knowledge`.trim();

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input: prompt,
    store: false,
  });

  const raw = (interaction.output_text ?? "").trim();

  // Strip markdown code fences if the model adds them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Partial<GeminiSentimentResult>;

  // Normalise buckets to integers
  let pos = Math.max(0, Math.min(100, Math.round(Number(parsed.positive) || 0)));
  let neu = Math.max(0, Math.min(100, Math.round(Number(parsed.neutral)  || 0)));
  let neg = Math.max(0, Math.min(100, Math.round(Number(parsed.negative) || 0)));

  // Adjust largest bucket so total == 100
  const total = pos + neu + neg;
  if (total !== 100) {
    const diff = 100 - total;
    if (pos >= neu && pos >= neg) pos += diff;
    else if (neu >= neg) neu += diff;
    else neg += diff;
  }

  const themes = Array.isArray(parsed.themes)
    ? (parsed.themes as string[]).slice(0, 3).map((t) => String(t).trim())
    : [];

  return {
    positive: pos,
    neutral: neu,
    negative: neg,
    interpretation:
      typeof parsed.interpretation === "string"
        ? parsed.interpretation.trim()
        : "",
    themes,
  };
}

// ── Route ──────────────────────────────────────────────────────────
router.post("/sentiment", async (req, res) => {
  const body = (req.body ?? {}) as {
    clusterId?: unknown;
    headline?: unknown;
    summary?: unknown;
  };

  const clusterId =
    typeof body.clusterId === "string" ? body.clusterId.trim() : "";
  const headline =
    typeof body.headline === "string" ? body.headline.trim() : "";

  if (!clusterId || !headline) {
    res.status(400).json({ error: "clusterId and headline are required" });
    return;
  }

  // Serve from cache when fresh
  const cached = getCached(clusterId);
  if (cached) {
    res.json(cached);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Gemini API key not configured" });
    return;
  }

  try {
    const { query, keywords } = buildQuery(headline);

    const rawPosts = await fetchBskyPosts(query);
    const filtered = filterPosts(rawPosts, keywords);

    if (filtered.length < MIN_POSTS) {
      const result: SentimentInsufficient = {
        status: "insufficient",
        postCount: filtered.length,
      };
      setCached(clusterId, result);
      res.json(result);
      return;
    }

    const sentiment = await analyseSentimentWithGemini(
      apiKey,
      headline,
      filtered,
    );

    const result: SentimentOk = {
      status: "ok",
      ...sentiment,
      postCount: filtered.length,
      source: "Bluesky",
      observedAt: new Date().toISOString(),
    };

    setCached(clusterId, result);
    res.json(result);
  } catch (error) {
    console.error(
      "Sentiment analysis failed:",
      error instanceof Error ? error.message : String(error),
    );
    res.status(500).json({ error: "Unable to analyse sentiment" });
  }
});

export default router;
