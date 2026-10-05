/**
 * POST /api/why-it-matters
 *
 * Generates a "Why It Matters" analysis for a FirstBrief article.
 *
 * Protections:
 *   - 24-hour server-side cache keyed on canonical article URL (or articleId::headline
 *     fallback). Repeated browser refreshes never re-call Gemini during the TTL.
 *   - Request coalescing: simultaneous requests for the same uncached article share
 *     one Gemini call; the others wait and reuse the result.
 *   - Gemini 429 cooldown: when quota is hit, the "retry in Xs" hint from the error
 *     message is parsed. During the cooldown window no new Gemini calls are made.
 *   - Stale fallback: if Gemini returns 429 but a stale cache entry exists, that
 *     entry is served rather than showing an error.
 */

import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";
import { enqueueGeminiCall, recordGeminiQuota, isGeminiCoolingDown, geminiCooldownMs } from "../gemini-limiter";
import { analysisKey, analysisFailedRecently, recordAnalysisFailure, ANALYSIS_REQUEST_OPTIONS } from "../analysis-policy";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Server-side cache (24h TTL) ────────────────────────────────────
const WIM_TTL_MS          = 24 * 60 * 60 * 1000;  // 24 hours — fresh TTL
const WIM_STALE_MAX_MS    = 72 * 60 * 60 * 1000;  // 72 hours — maximum age before eviction

interface WimEntry {
  result:    string;
  cachedAt:  number;
  expiresAt: number;
}

const wimCache = new Map<string, WimEntry>();

function wimGet(key: string): { result: string; stale: boolean } | null {
  const e = wimCache.get(key);
  if (!e) return null;
  const now = Date.now();
  if (now > e.cachedAt + WIM_STALE_MAX_MS) {
    wimCache.delete(key);
    return null;
  }
  return { result: e.result, stale: now > e.expiresAt };
}

function wimSet(key: string, result: string): void {
  // Evict entries past the stale window to prevent unbounded growth
  if (wimCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of wimCache) {
      if (now > v.cachedAt + WIM_STALE_MAX_MS) wimCache.delete(k);
    }
  }
  const now = Date.now();
  wimCache.set(key, { result, cachedAt: now, expiresAt: now + WIM_TTL_MS });
}

function wimCacheKey(url: string, articleId: string, headline: string, summary: string, body: string): string {
  return analysisKey("wim", url || articleId, [headline, summary, body]);
}

// ── Gemini quota cooldown — shared with all routes via gemini-limiter ──────
function wimSetCooldown(errorMsg: string): void {
  recordGeminiQuota(errorMsg);
}

// ── In-flight coalescing ───────────────────────────────────────────
// Multiple simultaneous requests for the same key share one Gemini call.
const wimInFlight = new Map<string, Promise<string>>();

// ── Gemini call ────────────────────────────────────────────────────
async function callGemini(
  apiKey: string,
  headline: string,
  summary: string,
  articleBody: string,
  articleId: string,
  url: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are writing the "Why It Matters" analysis for FirstBrief, a news dashboard designed for fast understanding.

Using only the supplied article information, write 45–65 words total in two short paragraphs separated by a blank line.

Paragraph 1 should explain why the development matters and who is most affected.
Paragraph 2 should explain the most plausible next consequence.

Requirements:
- Every sentence must add new information.
- Do not simply repeat the rundown.
- Do not invent facts or combine this article with unrelated events.
- Avoid exaggerated certainty and unsupported speculation.
- Do not include a heading, bullet points, or Markdown.
- Return only the finished analysis.

ARTICLE HEADLINE:
${headline || "Not provided"}

ARTICLE SUMMARY:
${summary || "Not provided"}

ARTICLE BODY:
${articleBody || "Not provided"}

ARTICLE ID:
${articleId || "Not provided"}

ARTICLE URL:
${url || "Not provided"}
`.trim();

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input: prompt,
    store: false,
  }, ANALYSIS_REQUEST_OPTIONS);

  const text = interaction.output_text?.trim();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

// ── Route ──────────────────────────────────────────────────────────
router.post("/why-it-matters", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Gemini API key is not configured" });
    return;
  }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const headline    = typeof b.headline   === "string" ? b.headline.trim()   : "";
  const summary     = typeof b.summary    === "string" ? b.summary.trim()    : "";
  const articleBody = typeof b.body       === "string" ? b.body.trim().slice(0, 30_000) : "";
  const articleId   = typeof b.articleId  === "string" ? b.articleId.trim()  : "";
  const url         = typeof b.url        === "string" ? b.url.trim()        : "";

  if (!headline && !summary && !articleBody) {
    res.status(400).json({ error: "Article content is required" });
    return;
  }

  const cacheKey = wimCacheKey(url, articleId, headline, summary, articleBody);

  // ── 1. Cache hit (fresh) ─────────────────────────────────────────
  const cached = wimGet(cacheKey);
  if (cached && !cached.stale) {
    req.log.info({ cacheKey }, "WIM cache hit");
    res.json({ whyItMatters: cached.result });
    return;
  }
  if (cached?.stale) {
    req.log.info({ cacheKey }, "WIM cache stale");
  } else {
    req.log.info({ cacheKey }, "WIM cache miss");
  }

  // ── 2. Gemini cooldown check ─────────────────────────────────────
  if (isGeminiCoolingDown() || analysisFailedRecently(cacheKey)) {
    const secs = Math.ceil(geminiCooldownMs() / 1000);
    if (cached) {
      req.log.info({ secs }, "WIM blocked; serving stored result");
      res.json({ whyItMatters: cached.result });
    } else {
      req.log.info({ secs }, "WIM blocked; no stored result");
      res.status(503).json({ error: "Unable to generate Why It Matters analysis" });
    }
    return;
  }

  // ── 3. Request coalescing ────────────────────────────────────────
  const inFlight = wimInFlight.get(cacheKey);
  if (inFlight) {
    req.log.info({ cacheKey }, "WIM request coalesced");
    try {
      const result = await inFlight;
      res.json({ whyItMatters: result });
    } catch {
      if (cached) {
        req.log.info("WIM failed; serving stored result");
        res.json({ whyItMatters: cached.result });
      } else {
        res.status(500).json({ error: "Unable to generate Why It Matters analysis" });
      }
    }
    return;
  }

  // ── 4. Gemini call (serialised through shared limiter) ───────────
  req.log.info({ cacheKey }, "WIM generation requested");

  const promise = enqueueGeminiCall(() => callGemini(apiKey, headline, summary, articleBody, articleId, url));
  wimInFlight.set(cacheKey, promise);
  // Remove from in-flight map when settled (regardless of outcome)
  promise.catch(() => {}).finally(() => wimInFlight.delete(cacheKey));

  try {
    const result = await promise;
    wimSet(cacheKey, result);
    req.log.info({ cacheKey }, "WIM result stored");
    res.json({ whyItMatters: result });
  } catch (err) {
    recordAnalysisFailure(cacheKey);
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ message: msg.slice(0, 250) }, "WIM generation failed");

    const is429 = msg.includes("429") || /quota/i.test(msg);
    if (is429) {
      wimSetCooldown(msg);
      if (cached) {
        req.log.info("WIM quota limited; serving stored result");
        res.json({ whyItMatters: cached.result });
      } else {
        res.status(503).json({ error: "Unable to generate Why It Matters analysis" });
      }
    } else if (cached) {
      res.json({ whyItMatters: cached.result });
    } else {
      res.status(500).json({ error: "Unable to generate Why It Matters analysis" });
    }
  }
});

export default router;
