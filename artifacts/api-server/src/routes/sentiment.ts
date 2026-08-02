/**
 * POST /api/sentiment
 *
 * Provider: Bluesky unauthenticated AppView search — no key, no login.
 * Endpoint: https://api.bsky.app/xrpc/app.bsky.feed.searchPosts
 *
 * NOTE: public.api.bsky.app is Cloudflare-blocked from this environment
 *       (returns 403). api.bsky.app is the correct unauthenticated host.
 *
 * Flow:
 *   1. Extract entity-focused search terms from the headline + topic seeds.
 *   2. Fetch up to 50 recent top-ranked posts from Bluesky.
 *   3. Filter: regular posts only, no replies, ≥40 chars of real text,
 *      one post per author, near-dedup by text prefix, keyword relevance.
 *   4. If < 8 posts survive  → return { status: 'insufficient' }.
 *   5. Otherwise send up to 30 posts to Gemini for strict-JSON sentiment.
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
  observedAt: string;
};

export type SentimentInsufficient = {
  status: "insufficient";
  postCount: number;
};

export type SentimentResponse = SentimentOk | SentimentInsufficient;

// ── Bluesky post shape ─────────────────────────────────────────────
type BskyAuthor = { did: string; handle: string };

type BskyRecord = {
  $type: string;
  text?: string;
  createdAt?: string;
  langs?: string[];
  reply?: unknown;
};

type BskyPost = {
  uri: string;
  author: BskyAuthor;
  record: BskyRecord;
  indexedAt?: string;
};

type BskySearchResponse = { posts?: unknown[] };

// ── In-memory cache ────────────────────────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000;

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
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Query construction ─────────────────────────────────────────────
// Stop words excluded from keyword extraction.
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "its","their","this","that","is","are","was","were","by","from","new",
  "as","up","over","how","why","when","what","into","out","has","have",
  "than","more","one","two","after","before","about","will","would",
  "could","should","may","might","says","said","amid","plan","set","get",
  "not","it","be","been","had","his","her","he","she","they","we","us",
  "amid","reset","terms","deal","move","amid","also","just","even","back",
]);

// Topic-specific seed terms added to every query regardless of headline.
const TOPIC_SEEDS: Record<string, string[]> = {
  ai:       ["OpenAI", "AI", "artificial intelligence"],
  nuclear:  ["nuclear", "SMR", "reactor"],
  football: ["football", "Champions League", "Premier League"],
};

/**
 * Build a Bluesky search query from an article headline and topic.
 *
 * Strategy: prefer proper-noun / title-case words (likely entities),
 * then fill with remaining significant words. Append topic seeds so
 * niche topics return enough posts even when the headline is abstract.
 *
 * Returns both the query string and the keywords used for relevance
 * filtering later.
 */
function buildQuery(
  headline: string,
  topic: string,
): { query: string; keywords: string[] } {
  // Split on whitespace and punctuation boundaries
  const rawWords = headline.split(/[\s\-\/,.:;!?()"']+/).filter(Boolean);

  // Separate proper-noun candidates (title-case or ALL-CAPS, length > 2)
  const entities: string[] = [];
  const common:   string[] = [];

  for (const w of rawWords) {
    const clean = w.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length <= 2) continue;
    const lower = clean.toLowerCase();
    if (STOP_WORDS.has(lower)) continue;

    // Proper noun: starts with uppercase in the middle of a sentence,
    // or is all-caps
    const isProper =
      /^[A-Z]/.test(clean) || clean === clean.toUpperCase();
    if (isProper) {
      entities.push(clean);
    } else {
      common.push(clean);
    }
  }

  // Build keyword list: entities first, then common words, then topic seeds
  const seeds = TOPIC_SEEDS[topic] ?? [];
  const allKeywords = [
    ...new Set([
      ...entities.map((w) => w.toLowerCase()),
      ...common.map((w) => w.toLowerCase()),
      ...seeds.map((w) => w.toLowerCase()),
    ]),
  ];

  // Use top 5 entities + any topic seeds that aren't already present
  // for the actual Bluesky query string
  const queryTerms = [
    ...entities.slice(0, 4),
    ...seeds
      .filter(
        (s) => !entities.some(
          (e) => e.toLowerCase() === s.toLowerCase(),
        ),
      )
      .slice(0, 2),
  ].slice(0, 6);

  // Fallback: if we have no query terms, use first 4 common words
  const finalTerms =
    queryTerms.length > 0 ? queryTerms : common.slice(0, 4);

  return {
    query: finalTerms.join(" "),
    keywords: allKeywords.slice(0, 10),
  };
}

// ── Post validation helper ─────────────────────────────────────────
function isBskyPost(value: unknown): value is BskyPost {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.uri !== "string") return false;
  if (typeof v.author !== "object" || v.author === null) return false;
  const author = v.author as Record<string, unknown>;
  if (typeof author.did !== "string") return false;
  if (typeof v.record !== "object" || v.record === null) return false;
  return true;
}

// ── Post filtering ─────────────────────────────────────────────────
const MIN_POSTS = 8;

function filterPosts(posts: BskyPost[], keywords: string[]): BskyPost[] {
  const seenAuthors = new Set<string>();
  const seenText    = new Set<string>();
  const kept: BskyPost[] = [];

  for (const post of posts) {
    const rec  = post.record;
    const text = rec.text ?? "";

    // Must be a standard post record
    if (rec.$type !== "app.bsky.feed.post") continue;

    // No replies — they're context-dependent fragments
    if (rec.reply) continue;

    // Minimum substantive length
    if (text.length < 40) continue;

    // Must contain real words beyond URLs
    const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
    if (stripped.length < 20) continue;

    // Language: pass if langs is unset (many real English posts omit it),
    // or if 'en' is explicitly present.
    // Reject only when langs is set AND 'en' is absent.
    const langs = rec.langs;
    if (langs && langs.length > 0 && !langs.includes("en")) continue;

    // One post per author
    if (seenAuthors.has(post.author.did)) continue;

    // Near-duplicate text deduplication (first 60 chars)
    const textKey = text.slice(0, 60).toLowerCase().replace(/\s+/g, " ");
    if (seenText.has(textKey)) continue;

    // Relevance: at least one keyword must appear in the text
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
// IMPORTANT: Use api.bsky.app, NOT public.api.bsky.app.
// public.api.bsky.app returns 403 from this environment (Cloudflare block).
const BSKY_HOST = "https://api.bsky.app";

async function fetchBskyPosts(query: string): Promise<BskyPost[]> {
  if (!query.trim()) {
    throw new Error("Bluesky query is empty — cannot search");
  }

  const url = new URL(
    `${BSKY_HOST}/xrpc/app.bsky.feed.searchPosts`,
  );
  url.searchParams.set("q",      query);
  url.searchParams.set("limit",  "50");
  url.searchParams.set("sort",   "top");
  // NOTE: lang param omitted intentionally. Many valid English posts
  // have no langs field; filtering in JS catches true non-English posts.

  const response = await fetch(url.toString(), {
    headers: {
      "Accept":     "application/json",
      "User-Agent": "FirstBrief/1.0 (news-intelligence-dashboard)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[bsky] search returned ${response.status} — query: "${query}" — body: ${body.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as BskySearchResponse;

  if (!Array.isArray(data.posts)) {
    throw new Error(
      `[bsky] unexpected response shape — no posts array in response`,
    );
  }

  // Validate each element defensively before casting
  return data.posts.filter(isBskyPost);
}

// ── Gemini sentiment analysis ──────────────────────────────────────
type GeminiSentimentResult = {
  positive:       number;
  neutral:        number;
  negative:       number;
  interpretation: string;
  themes:         string[];
};

async function analyseSentimentWithGemini(
  apiKey: string,
  headline: string,
  posts: BskyPost[],
): Promise<GeminiSentimentResult> {
  const ai = new GoogleGenAI({ apiKey });

  const sample    = posts.slice(0, 30);
  const postLines = sample
    .map((p, i) => {
      const text = (p.record.text ?? "").replace(/\s+/g, " ").trim();
      return `[${i + 1}] ${text}`;
    })
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
  "interpretation": "<one factual sentence, 15-30 words, summarising the overall tone>",
  "themes": ["<theme 1, 3-8 words>", "<theme 2, 3-8 words>"]
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

  if (!raw) {
    throw new Error("[gemini] empty response from model");
  }

  // Strip markdown code fences if the model wraps its output
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: Partial<GeminiSentimentResult>;
  try {
    parsed = JSON.parse(cleaned) as Partial<GeminiSentimentResult>;
  } catch (e) {
    throw new Error(
      `[gemini] JSON parse failed — raw output: ${cleaned.slice(0, 300)}`,
    );
  }

  // Validate required fields are present
  if (
    typeof parsed.positive !== "number" ||
    typeof parsed.neutral  !== "number" ||
    typeof parsed.negative !== "number"
  ) {
    throw new Error(
      `[gemini] missing numeric fields — parsed: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }

  // Normalise buckets to non-negative integers
  let pos = Math.max(0, Math.min(100, Math.round(parsed.positive)));
  let neu = Math.max(0, Math.min(100, Math.round(parsed.neutral)));
  let neg = Math.max(0, Math.min(100, Math.round(parsed.negative)));

  // Force total to exactly 100 by adjusting the largest bucket
  const total = pos + neu + neg;
  if (total !== 100) {
    const diff = 100 - total;
    if (pos >= neu && pos >= neg) pos = Math.max(0, pos + diff);
    else if (neu >= neg)          neu = Math.max(0, neu + diff);
    else                          neg = Math.max(0, neg + diff);
  }

  const interpretation =
    typeof parsed.interpretation === "string"
      ? parsed.interpretation.trim()
      : "Insufficient data to characterise overall sentiment.";

  const themes = Array.isArray(parsed.themes)
    ? (parsed.themes as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return { positive: pos, neutral: neu, negative: neg, interpretation, themes };
}

// ── Route ──────────────────────────────────────────────────────────
router.post("/sentiment", async (req, res) => {
  const body = (req.body ?? {}) as {
    clusterId?: unknown;
    headline?:  unknown;
    topic?:     unknown;
  };

  const clusterId = typeof body.clusterId === "string" ? body.clusterId.trim() : "";
  const headline  = typeof body.headline  === "string" ? body.headline.trim()  : "";
  const topic     = typeof body.topic     === "string" ? body.topic.trim()     : "";

  if (!clusterId || !headline) {
    res.status(400).json({ error: "clusterId and headline are required" });
    return;
  }

  // Serve from cache when still fresh
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

  // ── Bluesky fetch + filter ───────────────────────────────────────
  let filtered: BskyPost[];

  try {
    const { query, keywords } = buildQuery(headline, topic);
    console.log(`[sentiment] cluster=${clusterId} query="${query}" keywords=[${keywords.join(",")}]`);

    const rawPosts = await fetchBskyPosts(query);
    console.log(`[sentiment] bsky raw=${rawPosts.length}`);

    filtered = filterPosts(rawPosts, keywords);
    console.log(`[sentiment] bsky filtered=${filtered.length} (min=${MIN_POSTS})`);
  } catch (err) {
    // Technical failure on the Bluesky side — not an insufficient-discussion result
    console.error("[sentiment] Bluesky fetch failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Unable to retrieve Bluesky posts" });
    return;
  }

  if (filtered.length < MIN_POSTS) {
    console.log(`[sentiment] insufficient posts (${filtered.length} < ${MIN_POSTS})`);
    const result: SentimentInsufficient = {
      status:    "insufficient",
      postCount: filtered.length,
    };
    setCached(clusterId, result);
    res.json(result);
    return;
  }

  // ── Gemini analysis ──────────────────────────────────────────────
  try {
    const sentiment = await analyseSentimentWithGemini(apiKey, headline, filtered);
    console.log(`[sentiment] gemini ok pos=${sentiment.positive} neu=${sentiment.neutral} neg=${sentiment.negative}`);

    const result: SentimentOk = {
      status:     "ok",
      ...sentiment,
      postCount:  filtered.length,
      source:     "Bluesky",
      observedAt: new Date().toISOString(),
    };

    setCached(clusterId, result);
    res.json(result);
  } catch (err) {
    console.error("[sentiment] Gemini analysis failed:", err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: "Unable to analyse sentiment" });
  }
});

export default router;
