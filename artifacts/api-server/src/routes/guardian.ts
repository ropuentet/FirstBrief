import { Router, type IRouter } from "express";

const router: IRouter = Router();

const topics = [
  {
    id: "ai",
    query:
      '"artificial intelligence" OR OpenAI OR Anthropic OR ChatGPT OR DeepMind',
  },
  {
    id: "nuclear",
    query:
      '"nuclear power" OR "nuclear energy" OR "small modular reactor" OR NuScale OR Oklo',
  },
  {
    id: "football",
    query:
      '"Premier League" OR "Champions League" OR "Europa League" OR "La Liga" OR Bundesliga OR "Serie A"',
    section: "football",
  },
];

async function fetchTopic(
  topic: (typeof topics)[number],
  apiKey: string,
) {
  const url = new URL("https://content.guardianapis.com/search");

  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("q", topic.query);
  url.searchParams.set("query-fields", "headline");
  url.searchParams.set("page-size", "4");
  url.searchParams.set("order-by", "newest");
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 3);

  url.searchParams.set(
    "from-date",
    yesterday.toISOString().slice(0, 10),
  );
  url.searchParams.set(
    "show-fields",
    "headline,trailText,standfirst,byline,thumbnail",
  );

  if (topic.section) {
    url.searchParams.set("section", topic.section);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Guardian request failed for ${topic.id}: ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    response: {
      results: unknown[];
    };
  };
  return data.response.results;
}

router.get("/guardian", async (_req, res) => {
  const apiKey = process.env.GUARDIAN_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "Guardian API key is not configured",
    });
    return;
  }

  try {
    const [ai, nuclear, football] = await Promise.all(
      topics.map((topic) => fetchTopic(topic, apiKey)),
    );

    res.json({
      status: "ok",
      total: ai.length + nuclear.length + football.length,
      topics: {
        ai,
        nuclear,
        football,
      },
    });
  } catch (error) {
    console.error("Guardian API request failed:", error);

    res.status(500).json({
      error: "Unable to fetch Guardian articles",
    });
  }
});

export default router;