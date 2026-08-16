import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";
import { enqueueGeminiCall } from "../gemini-limiter";

const router: IRouter = Router();

const OUTLINE_TTL_MS = 24 * 60 * 60 * 1000;

type OutlineCacheEntry = {
  outline: string;
  expiresAt: number;
};

const outlineCache = new Map<string, OutlineCacheEntry>();
const outlineInFlight = new Map<string, Promise<string>>();

function getCacheKey(url: string, headline: string) {
  return url.trim() || headline.trim().toLowerCase();
}

async function generateOutline(
  apiKey: string,
  headline: string,
  summary: string,
  articleBody: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
You are writing a brief AI Outline for a selected article in FirstBrief, a news dashboard designed for fast understanding.

Using only the supplied article information, summarize this specific article's main angle and key takeaway in 1–2 sentences.

Requirements:
- Maximum 45 words total.
- Focus specifically on what this article emphasizes.
- Do not reproduce or quote large portions of the article.
- Do not add outside facts, background, or speculation.
- Do not use bullet points or headings.
- Do not explain that you are an AI.
- Return only the finished outline.

ARTICLE HEADLINE:
${headline || "Not provided"}

ARTICLE SUMMARY:
${summary || "Not provided"}

ARTICLE BODY:
${articleBody || "Not provided"}
`;

  const interaction = await ai.interactions.create({
    model: "gemini-3.6-flash",
    input: prompt,
    store: false,
  });

  const text = interaction.output_text?.trim();

  if (!text) {
    throw new Error("Gemini returned empty outline");
  }

  return text;
}

router.post("/article-outline", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Gemini API key is not configured" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const headline =
    typeof body.headline === "string" ? body.headline.trim() : "";

  const summary =
    typeof body.summary === "string" ? body.summary.trim() : "";

  const articleBody =
    typeof body.body === "string"
      ? body.body.trim().slice(0, 30000)
      : "";

  const url =
    typeof body.url === "string" ? body.url.trim() : "";

  if (!headline && !summary && !articleBody) {
    res.status(400).json({ error: "Article content is required" });
    return;
  }

  const cacheKey = getCacheKey(url, headline);
  const cached = outlineCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    res.json({ outline: cached.outline });
    return;
  }

  const existingRequest = outlineInFlight.get(cacheKey);

  if (existingRequest) {
    try {
      const outline = await existingRequest;
      res.json({ outline });
    } catch {
      res.status(503).json({ error: "Unable to generate article outline" });
    }
    return;
  }

  const request = enqueueGeminiCall(() =>
    generateOutline(apiKey, headline, summary, articleBody),
  );

  outlineInFlight.set(cacheKey, request);

  try {
    const outline = await request;

    outlineCache.set(cacheKey, {
      outline,
      expiresAt: Date.now() + OUTLINE_TTL_MS,
    });

    res.json({ outline });
  } catch (error) {
    console.error("[article-outline] Gemini request failed:", error);
    res.status(503).json({ error: "Unable to generate article outline" });
  } finally {
    outlineInFlight.delete(cacheKey);
  }
});

export default router;