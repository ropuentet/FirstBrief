// Explicit, read-only Guardian/Bluesky verification. Never invokes generation.
import { GUARDIAN_WINDOW_MS, nuclearOnlyRelevant, relevantToTopic, type GuardianArticle } from "../src/guardian-feed";
import { getBlueskyDiscussion } from "../src/routes/sentiment";

async function main() {
const apiKey = process.env.GUARDIAN_API_KEY;
if (!apiKey) throw new Error("Guardian configuration unavailable");
const now = Date.now();
const legacyQuery = '"nuclear power" OR "nuclear energy" OR "small modular reactor" OR nuclear OR NuScale OR Oklo OR "Hinkley Point" OR Sizewell OR Sellafield OR Fukushima OR Chernobyl OR "fusion energy" OR "fusion reactor"';
const candidates: GuardianArticle[] = [];
const signal = AbortSignal.timeout(15_000);
for (let page = 1; ; page++) {
  const url = new URL("https://content.guardianapis.com/search");
  for (const [key, value] of Object.entries({
    "api-key": apiKey, q: legacyQuery, "query-fields": "headline", "from-date": new Date(now - GUARDIAN_WINDOW_MS).toISOString().slice(0, 10),
    "to-date": new Date(now).toISOString().slice(0, 10), "page-size": "50", page: String(page), "order-by": "newest",
    "show-fields": "headline,trailText,standfirst",
  })) url.searchParams.set(key, value);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Guardian audit HTTP ${response.status}`);
  const data = await response.json() as { response: { results: GuardianArticle[]; pages: number } };
  candidates.push(...data.response.results.filter(article => {
    const date = Date.parse(article.webPublicationDate); return date >= now - GUARDIAN_WINDOW_MS && date <= now;
  }));
  if (page >= data.response.pages) break;
}
console.log("LIVE former nuclear query", JSON.stringify({
  windowCandidates: candidates.length,
  previousFilterAccepted: candidates.filter(nuclearOnlyRelevant).length,
  broadenedEnergyAcceptedFromSameCandidates: candidates.filter(article => relevantToTopic(article, "nuclear")).length,
}));
console.log("Legacy rejected headline examples", candidates.filter(article => !nuclearOnlyRelevant(article)).slice(0, 6).map(article => article.webTitle));
const feedResponse = await fetch(process.argv[2], { signal: AbortSignal.timeout(20_000) });
if (!feedResponse.ok) throw new Error(`Guardian feed HTTP ${feedResponse.status}`);
const feed = await feedResponse.json() as { topics: Record<string, GuardianArticle[]>; total: number };
console.log("LIVE feed counts", Object.fromEntries(Object.entries(feed.topics).map(([id, items]) => [id === "nuclear" ? "energy" : id, items.length])), "unique total", feed.total);
const article = feed.topics.ai[0];
try {
  const discussion = await getBlueskyDiscussion(article.webTitle, article.fields?.trailText ?? "", "ai", article.webUrl, article.webPublicationDate);
  console.log("LIVE Bluesky evidence", JSON.stringify({ headline: article.webTitle, count: discussion.posts.length, partial: discussion.retrievalPartial, articleLinks: discussion.evidence.filter(post => post.match === "article_link").length, sample: discussion.evidence.slice(0, 3) }));
} catch {
  console.log("LIVE Bluesky retrieval failed; no no-discussion or sentiment conclusion inferred.");
}
console.log("Generation requests in this source check: zero.");
}
void main().catch(() => { console.error("Live source check could not complete."); process.exitCode = 1; });
