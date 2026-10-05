import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";
import { enqueueGeminiCall, isGeminiCoolingDown } from "../gemini-limiter";
import { analysisKey, analysisFailedRecently, recordAnalysisFailure, ANALYSIS_REQUEST_OPTIONS, analysisFailure, AnalysisError, clearAnalysisFailure, previousAnalysisFailure } from "../analysis-policy";
import { logger } from "../lib/logger";

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
  }, ANALYSIS_REQUEST_OPTIONS);

  const text = interaction.output_text?.trim();

  if (!text) {
    throw new Error("Gemini returned empty outline");
  }

  return text;
}

router.post("/article-outline", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(503).json(analysisFailure(new AnalysisError("auth", "")));
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

  if (!summary && !articleBody) {
    res.status(422).json(analysisFailure(new AnalysisError("input", "")));
    return;
  }

  const cacheKey = analysisKey("outline", url, [headline, summary, articleBody]);
  if (body.retry === true) clearAnalysisFailure(cacheKey);
  const cached = outlineCache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    res.json({ outline: cached.outline });
    return;
  }
  if (isGeminiCoolingDown() || analysisFailedRecently(cacheKey)) {
    res.status(503).json(isGeminiCoolingDown() ? analysisFailure(new AnalysisError("quota", "")) : previousAnalysisFailure(cacheKey));
    return;
  }

  const existingRequest = outlineInFlight.get(cacheKey);

  if (existingRequest) {
    try {
      const outline = await existingRequest;
      res.json({ outline });
    } catch (error) {
      res.status(503).json(analysisFailure(error));
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
    recordAnalysisFailure(cacheKey, error);
    logger.warn({ err: error }, "Article outline generation failed");
    res.status(503).json(analysisFailure(error));
  } finally {
    outlineInFlight.delete(cacheKey);
  }
});

export default router;