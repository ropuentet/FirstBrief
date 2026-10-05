export const GUARDIAN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const TOPIC_LIMIT = 12;
export type GuardianTopic = "ai" | "nuclear" | "football";
export type GuardianArticle = {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  sectionId?: string;
  sectionName?: string;
  fields?: { headline?: string; trailText?: string; standfirst?: string; body?: string };
  tags?: { id: string; webTitle: string }[];
};

export const guardianTopics: { id: GuardianTopic; query?: string; section?: string }[] = [
  { id: "ai", query: '"artificial intelligence" OR AI OR OpenAI OR Anthropic OR ChatGPT OR DeepMind OR "machine learning" OR "large language model"' },
  { id: "nuclear", query: 'energy OR electricity OR renewables OR solar OR "wind power" OR "battery storage" OR grid OR utilities OR oil OR gas OR EDF OR BP OR Shell OR nuclear OR "Hinkley Point" OR Sizewell OR Sellafield OR NuScale OR Oklo' },
  // Scan football independently; European competition/team tags also identify
  // relevant stories whose headlines do not mention their league.
  { id: "football", section: "football" },
];

function text(value = ""): string {
  return value.replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalGuardianUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

export function inGuardianWindow(article: GuardianArticle, now: number): boolean {
  const published = Date.parse(article.webPublicationDate);
  return Number.isFinite(published) && published >= now - GUARDIAN_WINDOW_MS && published <= now;
}

export function nuclearOnlyRelevant(article: GuardianArticle): boolean {
  const headline = text(article.fields?.headline || article.webTitle);
  const context = `${headline} ${text(article.fields?.trailText)} ${text(article.fields?.standfirst)}`;
  if (/\bnuclear (?:power|energy|reactors?|plants?|stations?|fuel|waste)|small modular reactors?|\bfusion (?:energy|reactors?|power)\b/i.test(headline)) return true;
  return /\b(?:nuclear|SMRs?|NuScale|Oklo|Hinkley Point|Sizewell|Sellafield|Fukushima|Chernobyl)\b/i.test(headline) &&
    !/\b(?:weapons?|bombs?|warheads?|missiles?|arsenal|arms|tests?|medicine|medical)\b/i.test(headline) &&
    !/\b(?:weapons?|bombs?|warheads?|arsenal|deterrence|proliferation|enrichment)\b/i.test(context) &&
    /\b(?:energy|electricity|reactors?|power|plants?|stations?|decommissioning)\b/i.test(context);
}

export function relevantToTopic(article: GuardianArticle, topic: GuardianTopic): boolean {
  const headline = text(article.fields?.headline || article.webTitle);
  // Body-only mentions cannot qualify an otherwise unrelated story.
  const context = `${headline} ${text(article.fields?.trailText)} ${text(article.fields?.standfirst)}`;
  if (topic === "ai") {
    if (/artificial intelligence|machine learning|large language models?|\b(?:ChatGPT|OpenAI|Anthropic|DeepMind)\b/i.test(headline)) return true;
    return /\bAI\b/i.test(headline) &&
      /\b(?:models?|chatbots?|technology|tech|software|tools?|generative|automation|training|data|regulation|safety|research|chips?|robots?|intelligence|agents?)\b/i.test(context);
  }
  if (topic === "nuclear") {
    if (/\b(?:energy|electricity|renewables?|solar (?:power|energy|panels?|farms?|industry|projects?|cells?)|wind farms?|wind power|power grid|electricity grid|battery storage|energy storage|oil (?:industry|prices?|production|supply|investment)|gas (?:industry|prices?|pipelines?|supply|imports)|energy bills?|power stations?)\b/i.test(headline) &&
      !/energy drinks?|energy levels?/i.test(headline) &&
      !/\bnuclear weapons?|warheads?|atomic bombs?\b/i.test(headline)) return true;
    if (/\b(?:utilities|utility|EDF|BP|Shell|National Grid)\b/i.test(headline) &&
      /\b(?:energy|electricity|oil|gas|nuclear|renewable|power|grid)\b/i.test(context)) return true;
    return nuclearOnlyRelevant(article);
  }
  if (article.sectionId !== "football" && article.sectionName?.toLowerCase() !== "football") return false;
  const tags = article.tags?.map(tag => `${tag.id} ${tag.webTitle}`).join(" ") ?? "";
  const european = /premier[ -]?league|champions[ -]?league|europa[ -]?league|conference[ -]?league|la[ -]?liga|bundesliga|serie[ -]?a\b|ligue[ -]?1|women'?s[ -]?super[ -]?league|european[ -]?super[ -]?league|fa[ -]?cup|efl|carabao|scottish|european football|euro 20\d\d|euros\b|\b(?:Arsenal|Chelsea|Liverpool|Everton|Tottenham|Manchester City|Manchester United|Aston Villa|Newcastle|West Ham|Brighton|Brentford|Bournemouth|Crystal Palace|Fulham|Wolves|Wolverhampton|Nottingham Forest|Leeds|Burnley|Sunderland|Leicester|Southampton|Ipswich|Celtic|Rangers|Barcelona|Real Madrid|Atlético|Atletico|Bayern|Dortmund|Leverkusen|Juventus|Milan|Napoli|Roma|Lazio|Paris Saint-Germain|PSG|Marseille|Lyon|Monaco|Ajax|PSV|Feyenoord|Benfica|Porto|Sporting|England|Scotland|Wales|France|Germany|Italy|Spain|Portugal|Netherlands|Belgium|Ireland)\b/i;
  // A former European club in the summary must not turn an MLS/Saudi story
  // into European coverage. Transfers involving a European headline club qualify.
  if (/\bMLS\b|Inter Miami|Saudi Pro League|\bNWSL\b|Copa Libertadores|A-League|Chinese Super League/i.test(context) && !european.test(headline)) return false;
  return european.test(`${context} ${tags}`);
}

export function selectGuardianArticles(articles: GuardianArticle[], topic: GuardianTopic, now: number): GuardianArticle[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  return articles
    .filter(article => article.id && article.webUrl && (article.fields?.headline || article.webTitle) &&
      inGuardianWindow(article, now) && relevantToTopic(article, topic))
    .sort((a, b) => Date.parse(b.webPublicationDate) - Date.parse(a.webPublicationDate) || a.id.localeCompare(b.id))
    .filter(article => {
      const url = canonicalGuardianUrl(article.webUrl);
      if (seenIds.has(article.id) || seenUrls.has(url)) return false;
      seenIds.add(article.id);
      seenUrls.add(url);
      return true;
    })
    .slice(0, TOPIC_LIMIT);
}

export async function fetchGuardianTopic(topic: typeof guardianTopics[number], apiKey: string, now = Date.now()): Promise<GuardianArticle[]> {
  const articles: GuardianArticle[] = [];
  const signal = AbortSignal.timeout(15_000);
  for (let page = 1; ; page++) {
    const url = new URL("https://content.guardianapis.com/search");
    url.searchParams.set("api-key", apiKey);
    if (topic.query) {
      url.searchParams.set("q", topic.query);
      url.searchParams.set("query-fields", "headline");
    }
    if (topic.section) url.searchParams.set("section", topic.section);
    url.searchParams.set("page-size", "50");
    url.searchParams.set("page", String(page));
    url.searchParams.set("order-by", "newest");
    // Guardian's date parameter is day-granular; enforce the exact rolling
    // timestamp boundary locally, including on every cached fallback.
    url.searchParams.set("from-date", new Date(now - GUARDIAN_WINDOW_MS).toISOString().slice(0, 10));
    url.searchParams.set("to-date", new Date(now).toISOString().slice(0, 10));
    url.searchParams.set("show-fields", "headline,trailText,standfirst,body,byline,thumbnail");
    url.searchParams.set("show-tags", "all");
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Guardian ${topic.id} request failed: ${response.status}`);
    const data = await response.json() as { response?: { status?: string; pages?: number; results?: GuardianArticle[] } };
    const result = data.response;
    if (result?.status !== "ok" || !Array.isArray(result.results)) throw new Error(`Invalid Guardian ${topic.id} response`);
    articles.push(...result.results);
    const selected = selectGuardianArticles(articles, topic.id, now);
    if (selected.length === TOPIC_LIMIT || !result.results.length || page >= (result.pages ?? 1)) return selected;
  }
}
