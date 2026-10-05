import { Router, type IRouter } from "express";
import {
  canonicalGuardianUrl, fetchGuardianTopic, guardianTopics, selectGuardianArticles,
  type GuardianArticle, type GuardianTopic,
} from "../guardian-feed";

const router: IRouter = Router();
// Last successful topic results are only an outage fallback, not a refresh TTL.
const previous = new Map<GuardianTopic, GuardianArticle[]>();

router.get("/guardian", async (req, res) => {
  const apiKey = process.env.GUARDIAN_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Guardian API key is not configured" });
    return;
  }
  const results = await Promise.allSettled(guardianTopics.map(topic => fetchGuardianTopic(topic, apiKey)));
  const topics = {} as Record<GuardianTopic, GuardianArticle[]>;
  const unavailableTopics: GuardianTopic[] = [];
  results.forEach((result, index) => {
    const topic = guardianTopics[index].id;
    if (result.status === "fulfilled") {
      previous.set(topic, result.value);
    } else {
      unavailableTopics.push(topic);
      req.log.warn({ topic }, "Guardian topic refresh failed");
    }
    topics[topic] = selectGuardianArticles(previous.get(topic) ?? [], topic, Date.now());
  });
  if (unavailableTopics.length === guardianTopics.length && !previous.size) {
    res.status(503).json({ error: "Unable to fetch Guardian articles" });
    return;
  }
  const ids = new Set<string>();
  const urls = new Set<string>();
  let total = 0;
  for (const article of Object.values(topics).flat()) {
    const url = canonicalGuardianUrl(article.webUrl);
    if (ids.has(article.id) || urls.has(url)) continue;
    ids.add(article.id);
    urls.add(url);
    total++;
  }
  res.json({ status: "ok", total, topics, unavailableTopics });
});

export default router;
