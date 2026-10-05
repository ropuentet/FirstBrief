import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen,
  ChevronDown, ChevronUp, Clock3, ExternalLink,
  Info, RefreshCw,
} from 'lucide-react';
import { type TopicId, type Article, type Cluster, type AccessLevel, type Market, topics } from './stories';
import { useOnDemandAnalysis } from './useOnDemandAnalysis';
import { editorialSelection } from './editorialSelection';
import { z } from 'zod';

const queryClient = new QueryClient();
type GuardianResult = {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  sectionName: string;
  type?: string;
  tags?: { id: string; webTitle: string }[];
  fields?: {
    headline?: string;
    body?: string;
    trailText?: string;
    standfirst?: string;
    byline?: string;
  };
};

type MarketContextResponse = {
  ticker: string;
  from: string;
  to: string;
  latestClose: number | null;
  changePct: number | null;
  points: {
    date: string;
    close: number;
    volume: number;
  }[];
};

type MarketCompanyId = 'microsoft' | 'nvidia' | 'nuscale' | 'apple';
type MarketCompanyResolution =
  | { status: 'matched'; companyId: MarketCompanyId; name: string; ticker: string }
  | { status: 'no_match' };

const ALLOWED_MARKET_TICKERS = new Set(['MSFT', 'NVDA', 'SMR', 'AAPL']);

type GuardianResponse = {
  status: 'ok';
  total: number;
  topics: Record<TopicId, GuardianResult[]>;
  unavailableTopics?: TopicId[];
};

type WhyItMattersResponse = {
  whyItMatters: string;
  sourceNote?: string;
};

// ── Sentiment types (mirrored from api-server/src/routes/sentiment.ts) ──
type SentimentInsufficient = {
  status: 'insufficient';
  postCount: number;
};

type SentimentSmallSample = {
  status: 'small_sample';
  summary: string;
  postCount: number;
  source: 'Bluesky';
  observedAt: string;
};

type SentimentQualitative = {
  status: 'qualitative';
  summary: string;
  themes: string[];
  postCount: number;
  source: 'Bluesky';
  observedAt: string;
};

type SentimentOk = {
  status: 'ok';
  positive: number;
  neutral: number;
  negative: number;
  interpretation: string;
  themes: string[];
  postCount: number;
  source: 'Bluesky';
  observedAt: string;
};

type EvidencePost = { url: string; text: string; author: string; match: 'article_link' | 'keyword_overlap' | 'ai_verified' };
type SentimentResponse = (
  | SentimentInsufficient
  | SentimentSmallSample
  | SentimentQualitative
  | SentimentOk
  | { status: 'analysis_unavailable' | 'retrieval_failed'; reason: string; postCount: number; source: 'Bluesky'; observedAt: string }
) & { evidence?: EvidencePost[]; retrievalPartial?: boolean; sourceNote?: string };

function useWhyItMatters(cluster: Cluster) {
  const primaryArticle =
    cluster.articles.find(article => article.source === 'The Guardian') ??
    cluster.articles[0];

  return useOnDemandAnalysis<WhyItMattersResponse>('why-it-matters', {
          headline:  cluster.headline,
          summary:   [cluster.rundown, cluster.rundownP2].filter(Boolean).join('\n\n'),
          body:      primaryArticle?.detail ?? '',
          articleId: cluster.id,
          url:       primaryArticle?.href ?? '',
  }, 24 * 60 * 60 * 1000, value =>
    z.object({ whyItMatters: z.string().trim().min(1), sourceNote: z.string().max(600).optional() }).parse(value));
}

// ── Sentiment hook ────────────────────────────────────────────────
function useSentiment(cluster: Cluster) {
  const primaryArticle =
    cluster.articles.find(article => article.source === 'The Guardian') ??
    cluster.articles[0];
  const articleUrl = primaryArticle?.href ?? '';

  return useOnDemandAnalysis<SentimentResponse>('sentiment', {
          clusterId:  cluster.id,
          headline:   cluster.headline,
          rundown:    [cluster.rundown, cluster.rundownP2].filter(Boolean).join(' '),
          topic:      cluster.topic,
          articleUrl,   // stable cache key on the server
          publishedAt: primaryArticle?.publishedAt,
  }, 45 * 60 * 1000, validateSentiment);
}

function validateSentiment(value: unknown): SentimentResponse {
  const observed = {
    postCount: z.number().int().nonnegative(),
    source: z.literal('Bluesky'),
    observedAt: z.string().min(1),
  };
  return z.discriminatedUnion('status', [
    z.object({ status: z.literal('insufficient'), postCount: z.number().int().nonnegative() }),
    z.object({ status: z.literal('small_sample'), summary: z.string().min(1), ...observed }),
    z.object({ status: z.literal('qualitative'), summary: z.string().min(1), themes: z.array(z.string()), ...observed }),
    z.object({
      status: z.literal('ok'),
      positive: z.number().min(0).max(100),
      neutral: z.number().min(0).max(100),
      negative: z.number().min(0).max(100),
      interpretation: z.string().min(1),
      themes: z.array(z.string()),
      ...observed,
    }),
    z.object({ status: z.literal('analysis_unavailable'), reason: z.string(), ...observed }),
    z.object({ status: z.literal('retrieval_failed'), reason: z.string(), ...observed }),
  ]).and(z.object({
    evidence: z.array(z.object({ url: z.string().url().refine(url => {
      try { return new URL(url).hostname === 'bsky.app'; } catch { return false; }
    }), text: z.string(), author: z.string(), match: z.enum(['article_link', 'keyword_overlap', 'ai_verified']) })).optional(),
    retrievalPartial: z.boolean().optional(),
    sourceNote: z.string().max(600).optional(),
  })).parse(value);
}

function AnalysisActivation({ analysis, label }: {
  analysis: { data?: unknown; isFetching: boolean; unavailable: boolean; failureMessage: string; request: (force?: boolean) => void };
  label: string;
}) {
  if (analysis.data && !analysis.unavailable) return null;
  return (
    <div aria-live='polite'>
      {analysis.isFetching ? <p className='sentiment-state-text'>Generating analysis...</p>
        : analysis.unavailable ? <>
          <p className='sentiment-state-text'>{analysis.failureMessage} Publisher text and source links remain available.</p>
          <button className='article-outline-toggle' onClick={() => analysis.request(true)}>Try again</button>
        </>
          : <button className='article-outline-toggle' onClick={() => analysis.request()}>Generate {label}</button>}
    </div>
  );
}

function useMarketCompany(cluster: Cluster) {
  const article =
    cluster.articles.find(item => item.source === 'The Guardian' && item.publishedAt) ?? null;

  return useQuery<MarketCompanyResolution>({
    queryKey: [
      'market-company',
      'v1',
      article?.href ?? cluster.id,
      cluster.headline,
      cluster.rundown,
      cluster.rundownP2,
      article?.detail ?? '',
    ],
    queryFn: async () => {
      if (!article?.publishedAt) {
        throw new Error('A live Guardian article is required for market resolution');
      }
      const response = await fetch('/api/market-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: article.href,
          headline: cluster.headline,
          summary: [cluster.rundown, cluster.rundownP2, article.summary].filter(Boolean).join('\n\n'),
          body: article.detail,
        }),
      });
      if (!response.ok) throw new Error('Market company resolution failed');
      const result = await response.json() as MarketCompanyResolution;
      if (result.status === 'no_match') return result;
      if (
        result.status !== 'matched' ||
        !ALLOWED_MARKET_TICKERS.has(result.ticker) ||
        !result.companyId ||
        !result.name
      ) {
        throw new Error('Market company response was invalid');
      }
      return result;
    },
    enabled: Boolean(article?.publishedAt),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 0,
  });
}

// ── Sentiment panel sub-states ────────────────────────────────────
function SentimentLoading() {
  return (
    <div className='sentiment-loading' data-testid='sentiment-loading' aria-label='Loading sentiment analysis'>
      <div className='skeleton' style={{ height: 8, width: '100%', marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: 12 }}>
        {[40, 55, 30].map((w, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className='skeleton' style={{ height: 14, width: w }} />
            <div className='skeleton' style={{ height: 9, width: w - 8 }} />
          </div>
        ))}
      </div>
      <div className='skeleton' style={{ height: 13, width: '88%', marginBottom: 6 }} />
      <div className='sentiment-disclaimer-text'>Analysing Bluesky discussion&hellip;</div>
    </div>
  );
}

function SentimentError() {
  return (
    <p className='sentiment-state-text' data-testid='sentiment-error'>
      Could not load discussion data.
    </p>
  );
}

function SentimentInsufficientState({ count }: { count: number }) {
  return (
    <div data-testid='sentiment-insufficient'>
      <p className='sentiment-state-text'>Insufficient discussion available.</p>
      <p className='sentiment-disclaimer-text' style={{ marginTop: 6 }}>
        {count === 0 ? 'No matching Bluesky posts were found for this article.' : `Only ${count} matching posts were found. That is too little to summarise reactions reliably.`}
      </p>
    </div>
  );
}

function SentimentSmallSampleState({ data }: { data: SentimentSmallSample }) {
  return (
    <div data-testid='sentiment-small-sample'>
      <p className='detail-sentiment-line'>{data.summary}</p>
      <p className='detail-sentiment-disclaimer'>
        Based on {data.postCount} relevant Bluesky {data.postCount === 1 ? 'post' : 'posts and replies'} &middot; Very limited sample — not representative of the entire public.
      </p>
    </div>
  );
}

function SentimentQualitativeState({ data }: { data: SentimentQualitative }) {
  return (
    <div data-testid='sentiment-qualitative'>
      <p className='detail-sentiment-line'>{data.summary}</p>
      {data.themes.length > 0 && (
        <div className='sentiment-themes' style={{ marginTop: 10 }}>
          {data.themes.map((theme, i) => (
            <span key={i} className='sentiment-theme-pill'>{theme}</span>
          ))}
        </div>
      )}
      <p className='detail-sentiment-disclaimer'>
        Based on {data.postCount} relevant Bluesky posts and replies &middot; Small sample — not representative of the entire public.
      </p>
    </div>
  );
}

function SentimentSuccess({ data }: { data: SentimentOk }) {
  const { positive, neutral, negative, interpretation, themes, postCount } = data;

  return (
    <div data-testid='sentiment-result'>
      {/* Three-segment bar */}
      <div className='sentiment-bar' role='img' aria-label={`Sentiment: ${positive}% positive, ${neutral}% neutral, ${negative}% negative`}>
        {positive > 0 && <div className='sentiment-bar-pos' style={{ width: `${positive}%` }} />}
        {neutral  > 0 && <div className='sentiment-bar-neu' style={{ width: `${neutral}%`  }} />}
        {negative > 0 && <div className='sentiment-bar-neg' style={{ width: `${negative}%` }} />}
      </div>

      {/* Stats row */}
      <div className='sentiment-stats'>
        <div className='sentiment-stat'>
          <span className='sentiment-stat-val'>{positive}%</span>
          <span className='sentiment-stat-label'>Positive</span>
        </div>
        <div className='sentiment-stat'>
          <span className='sentiment-stat-val'>{neutral}%</span>
          <span className='sentiment-stat-label'>Neutral</span>
        </div>
        <div className='sentiment-stat'>
          <span className='sentiment-stat-val'>{negative}%</span>
          <span className='sentiment-stat-label'>Negative</span>
        </div>
      </div>

      {/* Interpretation */}
      <p className='detail-sentiment-line' style={{ marginTop: 12 }}>
        {interpretation}
      </p>

      {/* Recurring themes */}
      {themes.length > 0 && (
        <div className='sentiment-themes'>
          {themes.map((theme, i) => (
            <span key={i} className='sentiment-theme-pill'>{theme}</span>
          ))}
        </div>
      )}

      {/* Source + disclaimer */}
      <p className='detail-sentiment-disclaimer'>
        Based on {postCount} relevant Bluesky posts and replies &middot; Selected discussion — not representative of the entire public.
      </p>
    </div>
  );
}

// ── Sentiment panel (top-level) ────────────────────────────────────
function SentimentPanel({ cluster }: { cluster: Cluster }) {
  const analysis = useSentiment(cluster);
  const { data } = analysis;

  return (
    <div className='detail-sentiment' data-testid='sentiment-snapshot'>
      <div className='detail-sentiment-header'>
        <p className='detail-meta-label'>Public Sentiment</p>
      </div>
      <p className='sentiment-disclaimer-text'>Sampled Bluesky reactions, not representative public opinion. Loaded only when requested.</p>

      <AnalysisActivation analysis={analysis} label='Public Sentiment' />

      {data?.status === 'insufficient'  && <>
        <SentimentInsufficientState count={data.postCount} />
        <button className='article-outline-toggle' disabled={analysis.isFetching} onClick={() => analysis.request(true)}>Check Bluesky again</button>
      </>}
      {data?.status === 'small_sample'  && <SentimentSmallSampleState  data={data} />}
      {data?.status === 'qualitative'   && <SentimentQualitativeState  data={data} />}
      {data?.status === 'ok'            && <SentimentSuccess           data={data} />}
      {data?.sourceNote && <p className='sentiment-disclaimer-text'>{data.sourceNote}</p>}
      {data && data.status !== 'retrieval_failed' && 'observedAt' in data && (
        <p className='sentiment-disclaimer-text'>Bluesky · {data.postCount} {data.status === 'analysis_unavailable' ? 'possible article-related' : 'matching'} posts · Retrieved {formatPublicationDate(data.observedAt)}</p>
      )}
      {data?.retrievalPartial && <p className='sentiment-state-text'>Some Bluesky searches failed; this sample may be incomplete.</p>}
      {!!data?.evidence?.length && (
        <div data-testid='sentiment-evidence'>
          <p className='detail-meta-label'>Supporting Bluesky posts</p>
          {data.status === 'analysis_unavailable' && <p className='sentiment-disclaimer-text'>Relevance is based on article links or keyword overlap; AI relevance and sentiment analysis are unavailable.</p>}
          {data.evidence.slice(0, 6).map(post => (
            <p className='sentiment-state-text' key={post.url} style={{ overflowWrap: 'anywhere', marginTop: 8 }}>
              <a href={post.url} target='_blank' rel='noreferrer' className='underline'>{post.author}</a>
              {' · '}{post.match === 'article_link' ? 'Links to this article' : post.match === 'ai_verified' ? 'Included in analysis' : 'Keyword overlap'}
              <br />{post.text}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function cleanGuardianText(text?: string): string {
  if (!text) return '';

  const parsed = new DOMParser().parseFromString(text, 'text/html');
  return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function extractGuardianParagraphs(body?: string): string[] {
  if (!body) return [];

  const document = new DOMParser().parseFromString(body, 'text/html');

  return Array.from(document.querySelectorAll('p'))
    .map((paragraph) => cleanGuardianText(paragraph.textContent ?? ''))
    .filter(Boolean);
}

function formatPublicationDate(value?: string | number): string {
  if (value === undefined || value === '') return 'Publication date unavailable';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Publication date unavailable';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function guardianClusterId(articleId: string): string {
  return `guardian-${encodeURIComponent(articleId).replace(/%/g, '_')}`;
}

function canonicalGuardianUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return value.trim().replace(/\/+$/, '');
  }
}

function createGuardianCluster(topic: TopicId, result: GuardianResult): Cluster {
  const headline =
    cleanGuardianText(result.fields?.headline) ||
    cleanGuardianText(result.webTitle);
  const bodyParagraphs = extractGuardianParagraphs(result.fields?.body);
  const summary =
    cleanGuardianText(result.fields?.trailText) ||
    cleanGuardianText(result.fields?.standfirst) ||
    bodyParagraphs[0] ||
    '';
  const nextBodyParagraph =
    bodyParagraphs.find((paragraph) => paragraph !== summary) ?? '';
  const detail = bodyParagraphs.join('\n\n') || summary;

  const article: Article = {
    headline,
    source: 'The Guardian',
    time: formatPublicationDate(result.webPublicationDate),
    accessLevel: bodyParagraphs.length
      ? 'full'
      : summary
        ? 'excerpt'
        : 'headline-only',
    summary,
    detail,
    href: result.webUrl,
    publishedAt: result.webPublicationDate,
  };

  return {
    id: guardianClusterId(result.id),
    topic,
    label: result.sectionName || topics.find((item) => item.id === topic)?.label || topic,
    headline,
    rundown: summary,
    rundownP2: nextBodyParagraph,
    sentiment: [],
    articles: [article],
    editorial: { format: result.type ?? 'article', tags: result.tags?.map(tag => tag.id) ?? [] },
  };
}

function sortByPublicationDate(first: Cluster, second: Cluster): number {
  const firstDate = Date.parse(first.articles[0]?.publishedAt ?? '') || 0;
  const secondDate = Date.parse(second.articles[0]?.publishedAt ?? '') || 0;
  return secondDate - firstDate || first.id.localeCompare(second.id);
}

const GUARDIAN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function buildGuardianFeed(response?: GuardianResponse, now = Date.now()): {
  all: Cluster[];
  byTopic: Record<TopicId, Cluster[]>;
} {
  const byTopic: Record<TopicId, Cluster[]> = {
    ai: [],
    nuclear: [],
    football: [],
  };

  if (!response?.topics) return { all: [], byTopic };

  for (const topic of topics) {
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (const result of [...(response.topics[topic.id] ?? [])].sort((a, b) =>
      Date.parse(b.webPublicationDate) - Date.parse(a.webPublicationDate))) {
      const articleId = result.id?.trim();
      const articleUrl = result.webUrl?.trim();
      const headline =
        cleanGuardianText(result.fields?.headline) ||
        cleanGuardianText(result.webTitle);

      const published = Date.parse(result.webPublicationDate);
      if (!articleId || !articleUrl || !headline || !Number.isFinite(published) ||
        published < now - GUARDIAN_WINDOW_MS || published > now) continue;

      const normalizedUrl = canonicalGuardianUrl(articleUrl);
      if (seenIds.has(articleId) || seenUrls.has(normalizedUrl)) continue;

      seenIds.add(articleId);
      seenUrls.add(normalizedUrl);
      byTopic[topic.id].push(createGuardianCluster(topic.id, result));
      if (byTopic[topic.id].length === 12) break;
    }

    byTopic[topic.id].sort(sortByPublicationDate);
  }

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const all = topics
    .flatMap((topic) => byTopic[topic.id])
    .filter((cluster) => {
      const article = cluster.articles[0];
      const articleId = article ? cluster.id : '';
      const articleUrl = article ? canonicalGuardianUrl(article.href) : '';

      if (!article || seenIds.has(articleId) || seenUrls.has(articleUrl)) {
        return false;
      }

      seenIds.add(articleId);
      seenUrls.add(articleUrl);
      return true;
    })
    .sort(sortByPublicationDate);

  return { all: editorialSelection(all), byTopic };
}

function PublicationDate({
  cluster,
  className,
}: {
  cluster: Cluster;
  className?: string;
}) {
  const publishedAt = cluster.articles.find((article) => article.publishedAt)?.publishedAt;

  if (!publishedAt) {
    return (
      <span
        className={className}
        data-testid={`publication-date-${cluster.id}`}
      >
        Publication date unavailable
      </span>
    );
  }

  return (
    <time
      className={className}
      dateTime={publishedAt}
      data-testid={`publication-date-${cluster.id}`}
    >
      {formatPublicationDate(publishedAt)}
    </time>
  );
}

/* ── Header SVG marks ───────────────────────────────────────── */
function AiMark() {
  return (
    <svg className='fb-icon' viewBox='0 0 24 24' aria-hidden='true'>
      <path d='M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4' />
      <circle cx='12' cy='12' r='3' />
    </svg>
  );
}
function NuclearMark() {
  return (
    <svg className='fb-icon' viewBox='0 0 24 24' aria-hidden='true'>
      <path d='m13 2-9 12h7l-1 8 10-13h-7l1-7Z' />
    </svg>
  );
}
function FootballMark() {
  return (
    <svg className='fb-icon' viewBox='0 0 24 24' aria-hidden='true'>
      <circle cx='12' cy='12' r='8.7' />
      <path d='m12 7 2.4 1.8-.9 2.9h-3l-.9-2.9L12 7ZM5.8 9.3l3.8-.5M18.2 9.3l-3.8-.5M8 17l2.5-2.2M16 17l-2.5-2.2M12 19v-4.2' />
    </svg>
  );
}
function TopicIcon({ id }: { id: TopicId }) {
  if (id === 'ai') return <AiMark />;
  if (id === 'nuclear') return <NuclearMark />;
  return <FootballMark />;
}

/* ── Access-level label text ────────────────────────────────── */
const ACCESS_LABELS: Record<AccessLevel, string> = {
  'full':           'Publisher-provided article text',
  'excerpt':        'Publisher excerpt',
  'headline-only':  'Headline and metadata only',
};

/* ── Article row (detail page) ──────────────────────────────── */
function ArticleRow({ article, index }: { article: Article; index: number }) {
  const [open, setOpen] = useState(false);
  const slug = article.source.toLowerCase().replaceAll(' ', '-');
  const isLimited = article.accessLevel === 'excerpt' || article.accessLevel === 'headline-only';
  const outlineQuery = useOnDemandAnalysis<{ outline: string; sourceNote?: string }>('article-outline', {
          headline: article.headline || article.summary,
          summary: article.summary,
          body: article.detail,
          url: article.href,
  }, 24 * 60 * 60 * 1000, value =>
    z.object({ outline: z.string().trim().min(1), sourceNote: z.string().max(600).optional() }).parse(value));

  const outlineText = article.outline ?? outlineQuery.data?.outline;
  
  return (
    <article className='article-row' data-testid={`article-${index}-${slug}`}>
      <div className='article-meta-bar'>
        <div className='article-meta-left'>
          <span className='article-source' data-testid={`article-source-${index}`}>
            {article.source}
          </span>
          <time
            className='font-data text-[hsl(var(--muted-foreground))]'
            style={{ fontSize: 11 }}
            dateTime={article.publishedAt}
          >
            {article.publishedAt
              ? formatPublicationDate(article.publishedAt)
              : article.time}
          </time>
          {article.paywall !== undefined && (
            <span
              className={article.paywall ? 'access-badge access-badge-paywall' : 'access-badge access-badge-open'}
              data-testid={`badge-access-${index}`}
            >
              {article.paywall ? 'Paywall' : 'Open access'}
            </span>
          )}
          <span className='access-level-label' data-testid={`label-access-level-${index}`}>
            {ACCESS_LABELS[article.accessLevel]}
          </span>
        </div>
        <a
          className='article-ext-link'
          href={article.href}
          target='_blank'
          rel='noreferrer'
          aria-label={`Open ${article.source} article`}
          data-testid={`link-article-${index}`}
        >
          <ExternalLink className='h-3.5 w-3.5' />
        </a>
      </div>

      {article.summary ? (
        <p className='article-summary'>{article.summary}</p>
      ) : (
        <p className='article-limited-notice' data-testid={`notice-no-summary-${index}`}>
          The publisher did not provide a summary for this article.
        </p>
      )}

      {isLimited && (
        <p className='article-limited-notice' data-testid={`notice-limited-${index}`}>
          Only the publisher-provided text available in this feed is shown.
        </p>
      )}

      <button
        onClick={() => {
          if (!open && !article.outline) outlineQuery.request();
          setOpen(!open);
        }}
        className='article-outline-toggle'
        aria-expanded={open}
        data-testid={`button-expand-article-${index}`}
      >
        {open ? 'Hide AI outline' : 'AI outline'}
        {open ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
      </button>
      {open && (
        <div>
        <p className='article-outline-body' data-testid={`detail-summary-${index}`}>
          {outlineText ? outlineText : outlineQuery.isFetching
            ? 'Generating AI outline...'
            : `${outlineQuery.failureMessage} Publisher-provided text and the original link remain available.`}
        </p>
        {outlineQuery.unavailable && !outlineQuery.isFetching && <button className='article-outline-toggle' onClick={() => outlineQuery.request(true)}>Try outline again</button>}
        {outlineText && <p className='sentiment-disclaimer-text'>AI outline based only on the publisher-provided {isLimited ? 'excerpt' : 'text'}.</p>}
        {outlineQuery.data?.sourceNote && <p className='sentiment-disclaimer-text'>{outlineQuery.data.sourceNote}</p>}
        </div>
      )}
    </article>
  );
}

/* ── Market panel (detail page) ─────────────────────────────── */
type RangeKey = '30D' | '6M' | '1Y';
const RANGES: RangeKey[] = ['30D', '6M', '1Y'];

function MarketChart({ points, label }: { points: number[]; label: string }) {
  const W = 300; const H = 72;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pts = points
    .map((p, i) => `${(i / (points.length - 1)) * W},${H - ((p - min) / span) * (H - 6) - 3}`)
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className='market-chart-svg'
      preserveAspectRatio='none'
      role='img'
      aria-label={`${label} price chart`}
    >
      <polyline points={pts} fill='none' stroke='hsl(0 0% 12%)' strokeWidth='1.8' vectorEffect='non-scaling-stroke' />
    </svg>
  );
}

function MarketPanel({ market }: { market: Market }) {
  const [range, setRange] = useState<RangeKey>('30D');
  const marketQuery = useQuery<MarketContextResponse>({
    queryKey: ['market-context', market.ticker],
    queryFn: async () => {
      const response = await fetch(
        `/api/market-context?ticker=${encodeURIComponent(market.ticker ?? '')}`
                                    );

      if (!response.ok) {
        throw new Error('Market context request failed');
      }

      return response.json();
    },
    enabled: Boolean(market.ticker),
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });

  const livePoints = marketQuery.data?.points ?? [];
  const cutoff = new Date();

  const points30d = livePoints
    .filter((point) => {
      const date = new Date(point.date);
      const start = new Date(cutoff);
      start.setDate(start.getDate() - 30);
      return date >= start;
    })
    .map((point) => point.close);

  const points6m = livePoints
    .filter((point) => {
      const date = new Date(point.date);
      const start = new Date(cutoff);
      start.setMonth(start.getMonth() - 6);
      return date >= start;
    })
    .map((point) => point.close);

  const points1y = livePoints.map((point) => point.close);
  const chartPoints: Record<RangeKey, number[]> = {
    '30D': points30d,
    '6M': points6m,
    '1Y': points1y,
  };

  const calculateReturn = (points: number[]) => {
    if (points.length < 2) return 'N/A';

    const first = points[0];
    const last = points[points.length - 1];

    if (!first) return 'N/A';

    const change = ((last - first) / first) * 100;

    return `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  };

  const currentPrice =
    marketQuery.data?.latestClose != null
      ? `$${marketQuery.data.latestClose.toFixed(2)}`
      : 'N/A';

  const oneDayPoints = livePoints.slice(-2).map((point) => point.close);

  const dayReturn = calculateReturn(oneDayPoints);
  const monthReturn = calculateReturn(points30d);
  const sixMonthReturn = calculateReturn(points6m);
  const oneYearReturn = calculateReturn(points1y);
  const recentVolumes = livePoints
    .filter((point) => {
      const date = new Date(point.date);
      const start = new Date(cutoff);
      start.setDate(start.getDate() - 30);
      return date >= start;
    })
    .map((point) => point.volume)
    .filter((volume) => Number.isFinite(volume));

  const avgDailyVolume =
    recentVolumes.length > 0
      ? recentVolumes.reduce((sum, volume) => sum + volume, 0) / recentVolumes.length
      : null;

  const formattedAvgVolume =
    avgDailyVolume !== null
      ? `${(avgDailyVolume / 1_000_000).toFixed(1)}M`
      : 'N/A';
  const eventDate = new Date(market.eventDate);

  const sinceEventPoints = livePoints
    .filter((point) => new Date(point.date) >= eventDate)
    .map((point) => point.close);

  const sinceEventReturn = calculateReturn(sinceEventPoints);
  
  const metrics: { label: string; value: string }[] = [
    { label: 'Current price', value: currentPrice },
    { label: '1-day return', value: dayReturn },
    { label: '1-month return', value: monthReturn },
    { label: '6-month return', value: sixMonthReturn },
    { label: '1-year return', value: oneYearReturn },
    { label: 'Market cap', value: 'N/A' },
    { label: 'P/E ratio', value: 'N/A' },
    { label: 'Avg. daily volume', value: formattedAvgVolume },
  ];
  return (
    <aside className='market-panel' data-testid={`market-context-${market.ticker ?? 'sector'}`}>
      <div className='market-header'>
        <div>
          <p className='detail-meta-label'>Market Context</p>
          <h4 className='market-name'>
            {market.name}
            {market.ticker && <span className='market-ticker'>{market.ticker}</span>}
          </h4>
        </div>
        <div className='market-range-group' role='group' aria-label='Chart time range'>
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`market-range-btn${range === r ? ' market-range-btn-active' : ''}`}
              aria-pressed={range === r}
              data-testid={`range-btn-${r}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className='market-body'>
        <div className='market-chart-col'>
          <MarketChart points={chartPoints[range]} label={`${market.name} ${range}`} />
          <p className='market-chart-caption'>{range} · placeholder data</p>
        </div>
        <div className='market-separator' aria-hidden='true' />
        <div className='market-since-col'>
          <p className='detail-meta-label'>Since This Event</p>
          <p className='market-event-date'>{market.eventDate}</p>
          <p className='market-since-text'>
            {sinceEventReturn === 'N/A'
              ? 'Market has not reopened since this event.'
              : `${market.ticker} has moved ${sinceEventReturn} since this event.`}
          </p>
        </div>
      </div>
      <dl className='market-metrics-grid'>
        {metrics.map(({ label, value }) => (
          <div key={label} className='market-metric'>
            <dt className='market-metric-label'>{label}</dt>
            <dd className={`market-metric-value${value === 'N/A' ? ' market-metric-na' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className='market-disclaimer'>
        <span className='market-disclaimer-strong'>AI-generated market note &middot; factual, non-predictive.</span>{' '}
        {market.explanation}
      </p>
    </aside>
  );
}

/* ── Mini sparkline (lead card) ─────────────────────────────── */
function MiniSparkline({ points }: { points: number[] }) {
  const W = 160; const H = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pts = points
    .map((p, i) => `${(i / (points.length - 1)) * W},${H - ((p - min) / span) * (H - 4) - 2}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className='mini-sparkline-svg' preserveAspectRatio='none' aria-hidden='true'>
      <polyline points={pts} fill='none' stroke='hsl(0 0% 18%)' strokeWidth='1.5' vectorEffect='non-scaling-stroke' />
    </svg>
  );
}

/* ── Dashboard card (topic tabs only) ──────────────────────── */
function ClusterCard({ cluster, onBriefMe }: { cluster: Cluster; onBriefMe: () => void }) {
  const article = cluster.articles[0];
  return (
    <section className='cluster-card' id={`cluster-${cluster.id}`} data-testid={`cluster-${cluster.id}`}>
      <h3 className='cluster-headline'>{cluster.headline}</h3>
      <div className='cluster-body'>
        <div>
          <p className='cluster-meta-label'>The rundown</p>
          {cluster.rundown
            ? <p className='cluster-body-text'>{cluster.rundown}</p>
            : <p className='cluster-body-text'>The Guardian did not provide a summary.</p>}
        </div>
        <div className='cluster-why'>
          <p className='cluster-meta-label'>Published</p>
          <p className="cluster-body-text cluster-why-text text-[#000000]">
            <PublicationDate cluster={cluster} />
          </p>
          {article && <p className='cluster-body-text'>{article.source}</p>}
        </div>
      </div>
      <div className='cluster-footer'>
        <button className='brief-me-btn' onClick={onBriefMe} data-testid={`button-brief-me-${cluster.id}`}>
          <span>Brief Me</span>
          <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </div>
    </section>
  );
}

/* ── Front-page: lead card ──────────────────────────────────── */
function LeadCard({ cluster, onBriefMe }: { cluster: Cluster; onBriefMe: () => void }) {
  const topicLabel = topics.find(t => t.id === cluster.topic)?.label ?? '';
  const m = cluster.market;
  const whyItMattersQuery = useWhyItMatters(cluster);
  return (
    <section className='fp-lead-card' id={`cluster-${cluster.id}`} data-testid={`cluster-${cluster.id}`}>
      <span className='cluster-topic-tag' data-testid={`tag-topic-${cluster.id}`}>
        {topicLabel}
      </span>
      <p className='cluster-meta-label'>
        Published <PublicationDate cluster={cluster} />
      </p>
      <h2 className='fp-lead-headline'>{cluster.headline}</h2>
      <div className='fp-lead-body'>
        <div className='fp-lead-rundown-col'>
          <p className='cluster-meta-label'>The rundown</p>
          {cluster.rundown ? (
            <p className='fp-lead-rundown'>{cluster.rundown}</p>
          ) : (
            <p className='fp-lead-rundown'>The Guardian did not provide a summary.</p>
          )}
          {cluster.rundownP2 && <p className='fp-lead-rundown'>{cluster.rundownP2}</p>}
        </div>
        <div className='fp-lead-why-col'>
          <p className='cluster-meta-label'>Why it matters</p>
          <AnalysisActivation analysis={whyItMattersQuery} label='Why It Matters' />
          {whyItMattersQuery.data?.sourceNote && <p className='sentiment-disclaimer-text'>{whyItMattersQuery.data.sourceNote}</p>}

          {whyItMattersQuery.data?.whyItMatters
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p
                key={`${cluster.id}-lead-why-${index}`}
                className='fp-lead-why'
              >
                {paragraph}
              </p>
            ))}
        </div>
      </div>
      {m ? (
        <div className='lead-market-snap' data-testid={`lead-market-${cluster.id}`}>
          <div className='lead-market-info'>
            {m.ticker && <span className='lead-market-ticker'>{m.ticker}</span>}
            <span className='lead-market-price'>{m.price}</span>
            <span className='lead-market-change'>{m.day}</span>
            <span className='lead-market-name-label'>{m.name}</span>
          </div>
          <MiniSparkline points={m.points30d} />
        </div>
      ) : (
        <div className='lead-context-snap' data-testid={`lead-context-${cluster.id}`}>
          <p className='cluster-meta-label' style={{ marginBottom: '.3rem' }}>Reporting source</p>
          <p className='lead-context-text'>{cluster.articles[0]?.source ?? 'Source unavailable'}</p>
          <PublicationDate cluster={cluster} className='lead-context-text' />
        </div>
      )}
      <div className='cluster-footer'>
        <button className='brief-me-btn' onClick={onBriefMe} data-testid={`button-brief-me-${cluster.id}`}>
          <span>Brief Me</span>
          <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </div>
    </section>
  );
}

/* ── Front-page: medium card ────────────────────────────────── */
function MediumCard({ cluster, onBriefMe }: { cluster: Cluster; onBriefMe: () => void }) {
  const topicLabel = topics.find(t => t.id === cluster.topic)?.label ?? '';
  return (
    <section className='fp-medium-card' id={`cluster-${cluster.id}`} data-testid={`cluster-${cluster.id}`}>
      <span className='cluster-topic-tag' data-testid={`tag-topic-${cluster.id}`}>
        {topicLabel}
      </span>
      <h3 className='fp-medium-headline'>{cluster.headline}</h3>
      <p className='cluster-meta-label'>
        Published <PublicationDate cluster={cluster} />
      </p>
      <div className='fp-medium-body'>
        <p className='cluster-meta-label'>The rundown</p>
        {cluster.rundown
          ? <p className='fp-medium-rundown'>{cluster.rundown}</p>
          : <p className='fp-medium-rundown'>The Guardian did not provide a summary.</p>}
      </div>
      <div className='cluster-footer'>
        <button className='brief-me-btn' onClick={onBriefMe} data-testid={`button-brief-me-${cluster.id}`}>
          <span>Brief Me</span>
          <ArrowRight className='h-3.5 w-3.5' aria-hidden='true' />
        </button>
      </div>
    </section>
  );
}

/* ── Front-page: small card ─────────────────────────────────── */
function SmallCard({ cluster, onBriefMe }: { cluster: Cluster; onBriefMe: () => void }) {
  const topicLabel = topics.find(t => t.id === cluster.topic)?.label ?? '';
  return (
    <button
      className='fp-small-card'
      onClick={onBriefMe}
      id={`cluster-${cluster.id}`}
      data-testid={`cluster-${cluster.id}`}
      aria-label={`Read more: ${cluster.headline}`}
    >
      <span className='cluster-topic-tag fp-small-topic-tag' data-testid={`tag-topic-${cluster.id}`}>
        {topicLabel}
      </span>
      <p className='fp-small-headline'>{cluster.headline}</p>
      <PublicationDate cluster={cluster} className='cluster-meta-label' />
    </button>
  );
}

/* ── Front-page layout (All tab) ────────────────────────────── */
function FrontPageLayout({ clusters, onBriefMe }: { clusters: Cluster[]; onBriefMe: (c: Cluster) => void }) {
  const [lead, med1, med2, ...smalls] = clusters;
  return (
    <div className='fp-layout' data-testid='frontpage-layout'>
      <div className='fp-top'>
        {lead && <LeadCard cluster={lead} onBriefMe={() => onBriefMe(lead)} />}
        {(med1 || med2) && (
          <div className='fp-medium-col'>
            {med1 && <MediumCard cluster={med1} onBriefMe={() => onBriefMe(med1)} />}
            {med2 && <MediumCard cluster={med2} onBriefMe={() => onBriefMe(med2)} />}
          </div>
        )}
      </div>
      {smalls.length > 0 && (
        <div className='fp-smalls'>
          {smalls.map(c => (
            <SmallCard key={c.id} cluster={c} onBriefMe={() => onBriefMe(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Detail page ────────────────────────────────────────────── */
function DetailPage({ cluster, onBack }: { cluster: Cluster; onBack: () => void }) {
  const topicLabel = topics.find(t => t.id === cluster.topic)?.label ?? '';
  const sourceCount = new Set(
    cluster.articles.map((article) => article.source.trim()).filter(Boolean),
  ).size;
  const whyItMattersQuery = useWhyItMatters(cluster);
  return (
    <div className='detail-page' data-testid={`detail-${cluster.id}`}>
      <div className='detail-nav'>
        <button className='detail-back-btn' onClick={onBack} data-testid='button-back'>
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden='true' />
          <span>Back to briefing</span>
        </button>
        <span className='detail-topic-pill'>{topicLabel}</span>
      </div>
      <h1 className='detail-headline'>{cluster.headline}</h1>
      <div className='detail-summary-grid'>
        <div>
          <p className='detail-meta-label'>The Rundown</p>
          <p className='sentiment-disclaimer-text'>Publisher-provided {cluster.articles[0]?.accessLevel === 'headline-only' ? 'headline only; no summary supplied' : cluster.articles[0]?.accessLevel === 'full' ? 'text' : 'excerpt'} · The Guardian · Not an AI-generated summary</p>
          {cluster.rundown ? (
            <p className="detail-body-text text-[#000000]">{cluster.rundown}</p>
          ) : (
            <p className="detail-body-text text-[#000000]">The Guardian did not provide a summary.</p>
          )}
          {cluster.rundownP2 && (
            <p className='detail-body-text detail-rundown-p2 text-[#000000]'>
              {cluster.rundownP2}
            </p>
          )}
        </div>
        <div className='detail-why-col'>
          <p className='detail-meta-label'>Why it matters</p>

          <AnalysisActivation analysis={whyItMattersQuery} label='Why It Matters' />
          {whyItMattersQuery.data?.sourceNote && <p className='sentiment-disclaimer-text'>{whyItMattersQuery.data.sourceNote}</p>}

          {whyItMattersQuery.data?.whyItMatters
            .split(/\n\s*\n/)
            .filter(Boolean)
            .map((paragraph, index) => (
              <p
                key={`${cluster.id}-why-${index}`}
                className='detail-body-text detail-why-text'
              >
                {paragraph}
              </p>
            ))}
        </div>
      </div>
      {/* Live Bluesky sentiment — replaces static mock */}
      <SentimentPanel cluster={cluster} />
      <div className='detail-coverage'>
        <div className='detail-coverage-header'>
          <span className='detail-meta-label'>Selected Reporting</span>
          <span className='detail-perspectives'>
            {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
          </span>
        </div>
        {cluster.articles.map((article, i) => (
          <ArticleRow key={`${article.source}-${article.href}`} article={article} index={i} />
        ))}
      </div>
      {cluster.market && <MarketPanel market={cluster.market} />}
    </div>
  );
}

/* ── Loading / empty / error states ────────────────────────── */
function SkeletonState() {
  return (
    <div className='space-y-4' aria-label='Loading briefing' data-testid='state-loading'>
      {[1, 2, 3, 4].map(i => (
        <div className='border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5' key={i}>
          <div className='skeleton h-3 w-20' />
          <div className='skeleton mt-3 h-6 w-3/4' />
          <div className='skeleton mt-4 h-14 w-full' />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReset, unavailable }: { onReset: () => void; unavailable: boolean }) {
  return (
    <div
      className='border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center'
      data-testid='state-empty'
    >
      <BookOpen className='mx-auto h-6 w-6 text-[hsl(var(--muted-foreground))]' />
      <h3 className='mt-4 font-editorial text-2xl'>{unavailable ? 'This topic could not refresh' : 'No relevant Guardian articles in the past 7 days'}</h3>
      <p className='mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]'>
        {unavailable
          ? 'No previously fetched articles within the past 7 days are available in this view. Choose another topic or try Refresh again later.'
          : 'No matching articles were found within the past 7 days. Choose another topic or check again later.'}
      </p>
      <button
        onClick={onReset}
        className='mt-5 text-xs font-semibold underline-offset-2 hover:underline'
        data-testid='button-reset-empty'
      >
        Show all topics
      </button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className='border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-14 text-center'
      role='alert'
      data-testid='state-error'
    >
      <AlertCircle className='mx-auto h-6 w-6' />
      <h3 className='mt-4 font-editorial text-2xl'>The Guardian feed could not load</h3>
      <p className='mx-auto mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]'>
        No previously fetched articles are available. Try again to reload the feed.
      </p>
      <button
        onClick={onRetry}
        className='mt-5 inline-flex items-center gap-2 bg-[hsl(var(--foreground))] px-4 py-2 text-xs font-semibold text-[hsl(var(--card))]'
        data-testid='button-retry-refresh'
      >
        <RefreshCw className='h-3.5 w-3.5' /> Try again
      </button>
    </div>
  );
}

/* ── App shell ──────────────────────────────────────────────── */
function AppContent() {
  const [activeTopic, setActiveTopic]   = useState<TopicId | 'all'>('all');
  const [selected, setSelected]         = useState<Cluster | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [windowTick, setWindowTick] = useState(0);
  const guardianQuery = useQuery<GuardianResponse>({
    queryKey: ['guardian-news'],
    queryFn: async () => {
      const response = await fetch('/api/guardian');

      if (!response.ok) {
        throw new Error('Guardian news request failed');
      }

      return response.json();
    },
    retry: 0,
    refetchOnWindowFocus: false,
  });
  const guardianFeed = buildGuardianFeed(guardianQuery.data);
  // Expire retained articles even if the page stays open without a refresh.
  useEffect(() => {
    const now = Date.now();
    const expirations = Object.values(guardianQuery.data?.topics ?? {}).flat()
      .map(article => Date.parse(article.webPublicationDate) + GUARDIAN_WINDOW_MS)
      .filter(expiry => Number.isFinite(expiry) && expiry >= now);
    const timer = expirations.length ? setTimeout(() => setWindowTick(tick => tick + 1),
      Math.max(1, Math.min(...expirations) - now + 1)) : undefined;
    const updateWindow = () => setWindowTick(tick => tick + 1);
    document.addEventListener('visibilitychange', updateWindow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', updateWindow);
    };
  }, [guardianQuery.data, windowTick]);
  const selectedStory = selected ? guardianFeed.all.find(story => story.id === selected.id) : undefined;
  const filteredStories =
    activeTopic === 'all'
      ? guardianFeed.all
      : guardianFeed.byTopic[activeTopic];

  const briefingDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  const handleSetTopic = (topic: TopicId | 'all') => {
    setActiveTopic(topic);
    setSelected(null);
    window.scrollTo({ top: 0 });
  };

  const refresh = async () => {
    setIsRefreshing(true);
    setSelected(null);

    try {
      await guardianQuery.refetch({ throwOnError: true });
    } catch {
      // React Query retains the last successful data; the UI marks it as stale below.
    } finally {
      setIsRefreshing(false);
    }
  };

  const openDetail = (cluster: Cluster) => {
    setSelected(cluster);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className='briefing-shell'>
      {/* ── Header ───────────────────────────────────────────── */}
      <header className='border-b border-[hsl(var(--border))] bg-white'>
        <div className='mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:px-12'>

          <div className='fb-brand-center'>
            <div className='fb-brand-wordmark'>FirstBrief</div>
            <div className='fb-brand-tagline'>A quick rundown to start the day</div>
          </div>

          <div className='fb-meta-center'>
            <div className='fb-meta-inner'>
              <div className='fb-meta-item'>
                <span className='fb-label'>Briefing date</span>
                <span className='fb-meta-val' data-testid='text-briefing-date'>{briefingDate}</span>
              </div>
              <div className='fb-meta-item'>
                <span className='fb-label' data-testid='text-feed-window'>Past 7 days</span>
              </div>
              <div className='fb-meta-div' />
              <div className='fb-meta-item'>
                <Clock3 className='h-3 w-3 text-[hsl(var(--muted-foreground))]' />
                <span className='fb-label'>Last successful fetch</span>
                <span className='fb-meta-val' data-testid='text-last-updated'>
                  {guardianQuery.dataUpdatedAt
                    ? formatPublicationDate(guardianQuery.dataUpdatedAt)
                    : 'Not fetched'}
                </span>
              </div>
            </div>
            <button
              onClick={refresh}
              className='fb-refresh-btn'
              disabled={isRefreshing}
              data-testid='button-refresh'
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>

          <div className='fb-focus-bar'>
            <nav className='fb-focus-nav' aria-label='Filter briefing by topic'>
              {/* All tab */}
              <button
                onClick={() => handleSetTopic('all')}
                className={`all-filter${activeTopic === 'all' ? ' all-filter-active' : ''}`}
                aria-pressed={activeTopic === 'all'}
                data-testid='filter-all'
              >
                All
              </button>
              {/* Topic tabs */}
              {topics.map(topic => (
                <button
                  key={topic.id}
                  onClick={() => handleSetTopic(topic.id)}
                  className={`topic-filter${activeTopic === topic.id ? ' topic-filter-active' : ''}`}
                  aria-pressed={activeTopic === topic.id}
                  data-testid={`filter-${topic.id}`}
                >
                  <TopicIcon id={topic.id} />
                  {topic.label}
                </button>
              ))}
            </nav>
            {/* What is FirstBrief? — same hover/active treatment as focus tabs */}
            <button
              onClick={() => setShowAbout(!showAbout)}
              className={`fb-about-btn${showAbout ? ' fb-about-btn-active' : ''}`}
              aria-expanded={showAbout}
              data-testid='button-about'
            >
              <Info className='h-3.5 w-3.5' /> What is FirstBrief?
            </button>
          </div>
        </div>
      </header>
      {/* ── About panel ──────────────────────────────────────── */}
      {showAbout && (
        <section
          className='border-b border-[hsl(var(--border))] bg-[hsl(0_0%_95%)]'
          data-testid='panel-about'
        >
          <div className='mx-auto grid max-w-[1440px] gap-6 px-5 py-5 sm:px-8 lg:grid-cols-3 lg:px-12'>
            <div>
              <h2 className="m-0 text-[10px] font-semibold uppercase tracking-[.14em]">A briefing, not a feed</h2>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                Guardian articles from the past 7 days, up to 12 per topic. Topic views are newest first; All uses an approximate, balanced editorial selection.
              </p>
            </div>
            <div>
              <p className='m-0 text-[10px] font-semibold uppercase tracking-[.14em]'>Current status</p>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                Headlines, publication dates and available article text come from the Guardian feed.
              </p>
            </div>
            <div>
              <p className='m-0 text-[10px] font-semibold uppercase tracking-[.14em]'>Planned boundaries</p>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                Articles are not ranked by AI. Selected Reporting lists only sources returned for each article; missing reporting is not filled in.
              </p>
            </div>
          </div>
        </section>
      )}
      {/* ── Main ─────────────────────────────────────────────── */}
      <main className='briefing-main mx-auto max-w-[1440px] px-5 pb-16 pt-6 sm:px-8 lg:px-12'>
        {guardianQuery.isError && guardianQuery.data && (
          <p
            className='mb-5 border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm'
            role='status'
            data-testid='status-stale-feed'
          >
            Refresh failed. Showing previously fetched Guardian articles from{' '}
            {formatPublicationDate(guardianQuery.dataUpdatedAt)} that are still within the past 7 days.
          </p>
        )}
        {!!guardianQuery.data?.unavailableTopics?.length && (
          <p className='mb-5 border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm'
            role='status' data-testid='status-partial-feed'>
            Could not refresh {guardianQuery.data.unavailableTopics.map(id => topics.find(topic => topic.id === id)?.label).join(', ')}.
            {' '}Showing available Guardian articles within the past 7 days; some are from a previous fetch.
          </p>
        )}
        {guardianQuery.data && !selectedStory && (
          <p className='mb-5 text-xs text-[hsl(var(--muted-foreground))]' data-testid='text-article-count'>
            {filteredStories.length} {filteredStories.length === 1 ? 'article' : 'articles'} available · Past 7 days · {activeTopic === 'all' ? 'Approximate editorial selection' : 'Newest first'}
          </p>
        )}
            {selectedStory ? (
              <DetailPage cluster={selectedStory} onBack={() => { setSelected(null); window.scrollTo({ top: 0 }); }} />
        ) : !guardianQuery.data && guardianQuery.isError ? (
          <ErrorState onRetry={refresh} />
        ) : !guardianQuery.data && (guardianQuery.isPending || isRefreshing) ? (
          <SkeletonState />
        ) : filteredStories.length === 0 ? (
          <EmptyState onReset={() => handleSetTopic('all')}
            unavailable={guardianQuery.isError || Boolean(guardianQuery.data?.unavailableTopics?.some(topic => activeTopic === 'all' || topic === activeTopic))} />
        ) : activeTopic === 'all' ? (
          <FrontPageLayout clusters={filteredStories} onBriefMe={openDetail} />
        ) : (
          <div className='event-grid'>
            {filteredStories.map(cluster => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                onBriefMe={() => openDetail(cluster)}
              />
            ))}
          </div>
        )}

        <footer className='mt-10 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-5 leading-5 text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between' style={{ fontSize: 11 }}>
          <span>FirstBrief brings recent reporting across your selected topics into one view.</span>
        </footer>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
