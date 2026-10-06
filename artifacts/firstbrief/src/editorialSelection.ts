import type { Cluster } from './stories';
export const FRONT_PAGE_LIMIT = 6;
export const frontPageStories = (stories: Cluster[]) => stories.slice(0, FRONT_PAGE_LIMIT);

/** Approximate prioritization, not an objective measure of importance.
 * Uses format + corroborating summary context + freshness, never hype words.
 * The newest article anchors freshness so unchanged inputs have stable order.
 */
export function editorialSelection(stories: Cluster[]): Cluster[] {
  const anchor = Math.max(0, ...stories.map(story => Date.parse(story.articles[0]?.publishedAt ?? '') || 0));
  const score = (story: Cluster) => {
    const headline = story.headline;
    const summary = `${story.rundown} ${story.rundownP2}`;
    const context = `${headline} ${summary}`;
    const opinion = story.editorial?.tags.some(tag => /comment|opinion|editorial|letters/i.test(tag)) ||
      /\|\s*[^|]+$|[|–-]\s*(?:Letters|review)\b/i.test(headline);
    const routine = story.editorial?.format === 'liveblog' ||
      story.editorial?.tags.some(tag => /matchreports|previews/i.test(tag)) ||
      /as it happened|match report|preview|talking points|football daily|transfer rumours/i.test(headline) ||
      (story.topic === 'football' && /beat|defeat|draw|goals?|penalty|equalis/i.test(headline) && /match|game|minutes?|victory/i.test(summary));
    let importance = opinion || routine ? 0 : 2;
    const publicScope = /\b(?:government|regulat\w*|national|European Union|EU|law|industry|billions?|million households|party|parliament)\b/i.test(context);
    const decision = /\b(?:approv\w*|adopt\w*|bans?|banned|revers\w*|introduc\w*|invest\w*|launch\w*|rules?|ruling|signs?|signed|commit\w*|opens?|opened|reform\w*|drops?|quits?|resigns?|abandons?)\b/i.test(headline) &&
      /\b(?:policy|law|rules?|fund\w*|investment|plants?|grid|models?|security|power|energy|technology|financial|safety)\b/i.test(summary);
    if (!opinion && !routine && publicScope && decision) importance = 4;
    if (!opinion && story.topic === 'football' &&
      /sanction|ownership|financial rules|governance|league rules|champions league final/i.test(context) &&
      /ruling|ban|approve|win|reform|decision|agree/i.test(headline) && summary.length > 40) importance = 4;
    const age = (anchor - (Date.parse(story.articles[0]?.publishedAt ?? '') || 0)) / 3_600_000;
    const freshness = age <= 24 ? 3 : age <= 48 ? 2 : age <= 96 ? 1 : 0;
    return importance * 4 + freshness;
  };
  const ranked = [...stories].sort((a, b) => score(b) - score(a) ||
    Date.parse(b.articles[0]?.publishedAt ?? '') - Date.parse(a.articles[0]?.publishedAt ?? '') ||
    a.id.localeCompare(b.id));
  const opening: Cluster[] = [];
  const represented = new Set<string>();
  while (opening.length < 3 && ranked.length) {
    const index = opening.length === 0 ? 0 : ranked.findIndex(story => !represented.has(story.topic));
    if (index < 0) break;
    const [story] = ranked.splice(index, 1);
    opening.push(story);
    represented.add(story.topic);
  }
  return [...opening, ...ranked];
}
