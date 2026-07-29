import { GoogleGenAI } from "@google/genai";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

type WhyItMattersRequest = {
  headline?: unknown;
  summary?: unknown;
  body?: unknown;
  articleId?: unknown;
  url?: unknown;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

router.post("/why-it-matters", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "Gemini API key is not configured",
    });
    return;
  }

  const requestBody = (req.body ?? {}) as WhyItMattersRequest;

  const headline = cleanText(requestBody.headline);
  const summary = cleanText(requestBody.summary);
  const articleBody = cleanText(requestBody.body).slice(0, 30000);
  const articleId = cleanText(requestBody.articleId);
  const url = cleanText(requestBody.url);

  if (!headline && !summary && !articleBody) {
    res.status(400).json({
      error: "Article content is required",
    });
    return;
  }

  const prompt = `
You are writing the "Why It Matters" analysis for FirstBrief, a news dashboard designed for fast understanding.

Using only the supplied article information, write 45–65 words total in two short paragraphs separated by a blank line.

Paragraph 1 should explain why the development matters and who is most affected.
Paragraph 2 should explain the most plausible next consequence.

Explain why the development matters, who is most affected, and the most plausible next consequence.

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

  try {
    const ai = new GoogleGenAI({ apiKey });

    const interaction = await ai.interactions.create({
      model: "gemini-3.6-flash",
      input: prompt,
      store: false,
    });

    const whyItMatters = interaction.output_text?.trim();

    if (!whyItMatters) {
      throw new Error("Gemini returned an empty response");
    }

    res.json({
      whyItMatters,
    });
  } catch (error) {
    console.error(
      "Gemini request failed:",
      error instanceof Error ? error.message : "Unknown error",
    );

    res.status(500).json({
      error: "Unable to generate Why It Matters analysis",
    });
  }
});

export default router;