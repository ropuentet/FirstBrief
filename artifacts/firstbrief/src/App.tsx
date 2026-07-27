import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen,
  ChevronDown, ChevronUp, Clock3, ExternalLink,
  Info, RefreshCw,
} from 'lucide-react';
import { type TopicId, type Article, type Market, type Cluster, type AccessLevel, topics, stories, featuredIds } from './stories';

const queryClient = new QueryClient();

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
      <path d='M4.5 20h15M7 20c0-4.4 1.2-6.8 3-8.2h4c1.8 1.4 3 3.8 3 8.2M10 11.8 8.5 4h7L14 11.8M8.5 4h7' />
      <path d='M9.3 8h5.4M10.3 6h3.4' />
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
  'full':           'Full article',
  'excerpt':        'Publisher excerpt',
  'headline-only':  'Headline and metadata only',
};

/* ── Article row (detail page) ──────────────────────────────── */
function ArticleRow({ article, index }: { article: Article; index: number }) {
  const [open, setOpen] = useState(false);
  const slug = article.source.toLowerCase().replaceAll(' ', '-');
  const isLimited = article.accessLevel === 'excerpt' || article.accessLevel === 'headline-only';

  return (
    <article
      className='article-row'
      data-testid={`article-${index}-${slug}`}
    >
      {/* ── Meta bar ── */}
      <div className='article-meta-bar'>
        <div className='article-meta-left'>
          <span className='article-source' data-testid={`article-source-${index}`}>
            {article.source}
          </span>
          <span className='font-data text-[hsl(var(--muted-foreground))] text-[11px]'>
            {article.time}
          </span>
          {/* Paywall / open-access badge */}
          <span
            className={article.paywall ? 'access-badge access-badge-paywall' : 'access-badge access-badge-open'}
            data-testid={`badge-access-${index}`}
          >
            {article.paywall ? 'Paywall' : 'Open access'}
          </span>
          {/* Access level label */}
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

      {/* ── Summary ── */}
      <p className='article-summary'>{article.summary}</p>

      {/* ── Limited-access notice ── */}
      {isLimited && (
        <p className='article-limited-notice' data-testid={`notice-limited-${index}`}>
          Summary based only on accessible material — full article not available without subscription.
        </p>
      )}

      {/* ── AI outline toggle ── */}
      <button
        onClick={() => setOpen(!open)}
        className='article-outline-toggle'
        aria-expanded={open}
        data-testid={`button-expand-article-${index}`}
      >
        {open ? 'Hide AI outline' : 'AI outline'}
        {open ? <ChevronUp className='h-3 w-3' /> : <ChevronDown className='h-3 w-3' />}
      </button>
      {open && (
        <p className='article-outline-body' data-testid={`detail-summary-${index}`}>
          {article.detail}
        </p>
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
      <polyline
        points={pts}
        fill='none'
        stroke='hsl(0 0% 12%)'
        strokeWidth='1.8'
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  );
}

function MarketPanel({ market }: { market: Market }) {
  const [range, setRange] = useState<RangeKey>('30D');

  const chartPoints: Record<RangeKey, number[]> = {
    '30D': market.points30d,
    '6M':  market.points6m,
    '1Y':  market.points1y,
  };

  const metrics: { label: string; value: string }[] = [
    { label: 'Current price',    value: market.price },
    { label: '1-day return',     value: market.day },
    { label: '1-month return',   value: market.month },
    { label: '6-month return',   value: market.return6m },
    { label: '1-year return',    value: market.return1y },
    { label: 'Market cap',       value: market.marketCap },
    { label: 'P/E ratio',        value: market.pe },
    { label: 'Avg. daily volume',value: market.avgVolume },
  ];

  return (
    <aside
      className='market-panel'
      data-testid={`market-context-${market.ticker ?? 'sector'}`}
    >
      {/* ── Section header ── */}
      <div className='market-header'>
        <div>
          <p className='detail-meta-label'>Market Context</p>
          <h4 className='market-name'>
            {market.name}
            {market.ticker && (
              <span className='market-ticker'>{market.ticker}</span>
            )}
          </h4>
        </div>
        {/* Range controls */}
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

      {/* ── Chart + Since This Event ── */}
      <div className='market-body'>
        {/* Left: chart */}
        <div className='market-chart-col'>
          <MarketChart points={chartPoints[range]} label={`${market.name} ${range}`} />
          <p className='market-chart-caption'>{range} · placeholder data</p>
        </div>

        {/* Separator */}
        <div className='market-separator' aria-hidden='true' />

        {/* Right: since this event */}
        <div className='market-since-col'>
          <p className='detail-meta-label'>Since This Event</p>
          <p className='market-event-date'>{market.eventDate}</p>
          <p className='market-since-text'>{market.sinceEvent}</p>
        </div>
      </div>

      {/* ── 8-metric grid ── */}
      <dl className='market-metrics-grid'>
        {metrics.map(({ label, value }) => (
          <div key={label} className='market-metric'>
            <dt className='market-metric-label'>{label}</dt>
            <dd className={`market-metric-value${value === 'N/A' ? ' market-metric-na' : ''}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* ── Disclaimer ── */}
      <p className='market-disclaimer'>
        <span className='market-disclaimer-strong'>
          AI-generated market note &middot; factual, non-predictive.
        </span>{' '}
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
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className='mini-sparkline-svg'
      preserveAspectRatio='none'
      aria-hidden='true'
    >
      <polyline
        points={pts}
        fill='none'
        stroke='hsl(0 0% 18%)'
        strokeWidth='1.5'
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  );
}

/* ── Dashboard card (topic tabs only) ──────────────────────── */
function ClusterCard({
  cluster, onBriefMe, showTopic = false,
}: {
  cluster: Cluster; onBriefMe: () => void; showTopic?: boolean;
}) {
  const topicShort = topics.find(t => t.id === cluster.topic)?.label ?? '';
  return (
    <section
      className='cluster-card'
      id={`cluster-${cluster.id}`}
      data-testid={`cluster-${cluster.id}`}
    >
      {showTopic && (
        <span className='cluster-topic-tag' data-testid={`tag-topic-${cluster.id}`}>
          {topicShort}
        </span>
      )}
      <h3 className='cluster-headline'>{cluster.headline}</h3>
      <div className='cluster-body'>
        <div>
          <p className='cluster-meta-label'>The rundown</p>
          <p className='cluster-body-text'>{cluster.rundown}</p>
        </div>
        <div className='cluster-why'>
          <p className='cluster-meta-label'>Why it matters</p>
          <p className='cluster-body-text cluster-why-text'>{cluster.why}</p>
        </div>
      </div>
      <div className='cluster-footer'>
        <button
          className='brief-me-btn'
          onClick={onBriefMe}
          data-testid={`button-brief-me-${cluster.id}`}
        >
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

  return (
    <section
      className='fp-lead-card'
      id={`cluster-${cluster.id}`}
      data-testid={`cluster-${cluster.id}`}
    >
      <span className="cluster-topic-tag text-center text-[8px] border-t-[#000000] border-r-[#000000] border-b-[#000000] border-l-[#000000]" data-testid={`tag-topic-${cluster.id}`}>
        {topicLabel}
      </span>
      <h2 className='fp-lead-headline'>{cluster.headline}</h2>
      <div className='fp-lead-body'>
        <div className='fp-lead-rundown-col'>
          <p className='cluster-meta-label'>The rundown</p>
          <p className="fp-lead-rundown text-[#000000] text-[13px]">{cluster.rundown}</p>
        </div>
        <div className='fp-lead-why-col'>
          <p className='cluster-meta-label'>Why it matters</p>
          <p className="fp-lead-why text-[#000000] text-[13px]">{cluster.why}</p>
        </div>
      </div>
      {/* Market snapshot or key-context fallback */}
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
          <p className='cluster-meta-label' style={{ marginBottom: '.3rem' }}>Key context</p>
          <p className='lead-context-text'>{cluster.why}</p>
        </div>
      )}
      <div className='cluster-footer'>
        <button
          className="brief-me-btn text-[11px]"
          onClick={onBriefMe}
          data-testid={`button-brief-me-${cluster.id}`}
        >
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
    <section
      className='fp-medium-card'
      id={`cluster-${cluster.id}`}
      data-testid={`cluster-${cluster.id}`}
    >
      <span className="cluster-topic-tag text-center text-[8px] border-t-[#000000] border-r-[#000000] border-b-[#000000] border-l-[#000000]" data-testid={`tag-topic-${cluster.id}`}>
        {topicLabel}
      </span>
      <h3 className="fp-medium-headline text-[17px] font-medium">{cluster.headline}</h3>
      <div className='fp-medium-body'>
        <p className='cluster-meta-label'>The rundown</p>
        <p className="fp-medium-rundown text-[13px] text-[#000000]">{cluster.rundown}</p>
      </div>
      <div className='cluster-footer'>
        <button
          className="brief-me-btn text-[11px]"
          onClick={onBriefMe}
          data-testid={`button-brief-me-${cluster.id}`}
        >
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
      <span className="cluster-topic-tag fp-small-topic-tag text-[8px] text-center border-t-[#000000] border-r-[#000000] border-b-[#000000] border-l-[#000000]" data-testid={`tag-topic-${cluster.id}`}>
        {topicLabel}
      </span>
      <p className='fp-small-headline'>{cluster.headline}</p>
    </button>
  );
}

/* ── Front-page layout (All tab) ────────────────────────────── */
function FrontPageLayout({
  clusters,
  onBriefMe,
}: {
  clusters: Cluster[];
  onBriefMe: (c: Cluster) => void;
}) {
  const [lead, med1, med2, ...smalls] = clusters;

  return (
    <div className="fp-layout border-t-[#000000] border-r-[#000000] border-b-[#000000] border-l-[#000000]" data-testid='frontpage-layout'>
      {/* Top row: lead + two medium cards */}
      <div className='fp-top'>
        {lead && (
          <LeadCard
            cluster={lead}
            onBriefMe={() => onBriefMe(lead)}
          />
        )}
        {(med1 || med2) && (
          <div className='fp-medium-col'>
            {med1 && (
              <MediumCard
                cluster={med1}
                onBriefMe={() => onBriefMe(med1)}
              />
            )}
            {med2 && (
              <MediumCard
                cluster={med2}
                onBriefMe={() => onBriefMe(med2)}
              />
            )}
          </div>
        )}
      </div>
      {/* Bottom row: small compact cards */}
      {smalls.length > 0 && (
        <div className='fp-smalls'>
          {smalls.map(c => (
            <SmallCard
              key={c.id}
              cluster={c}
              onBriefMe={() => onBriefMe(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Detail page ────────────────────────────────────────────── */
function DetailPage({ cluster, onBack }: { cluster: Cluster; onBack: () => void }) {
  const topicLabel = topics.find(t => t.id === cluster.topic)?.label ?? '';
  return (
    <div className='detail-page' data-testid={`detail-${cluster.id}`}>
      {/* Nav */}
      <div className='detail-nav'>
        <button className='detail-back-btn' onClick={onBack} data-testid='button-back'>
          <ArrowLeft className='h-3.5 w-3.5' aria-hidden='true' />
          <span>Back to briefing</span>
        </button>
        <span className='detail-topic-pill'>{topicLabel}</span>
      </div>

      {/* Headline */}
      <h1 className='detail-headline'>{cluster.headline}</h1>

      {/* Rundown — two paragraphs + why */}
      <div className='detail-summary-grid'>
        <div>
          <p className='detail-meta-label'>The Rundown</p>
          <p className='detail-body-text'>{cluster.rundown}</p>
          <p className='detail-body-text detail-rundown-p2'>{cluster.rundownP2}</p>
        </div>
        <div className='detail-why-col'>
          <p className='detail-meta-label'>Why it matters</p>
          <p className='detail-body-text detail-why-text'>{cluster.why}</p>
        </div>
      </div>

      {/* Public Sentiment Snapshot — future: connect to X, Reddit, and other platforms */}
      <div className='detail-sentiment' data-testid='sentiment-snapshot'>
        <div className='detail-sentiment-header'>
          <p className='detail-meta-label'>Public Sentiment Snapshot</p>
          {/* future: <SentimentSourceTabs sources={['X', 'Reddit', 'News comments']} /> */}
        </div>
        <div className='detail-sentiment-lines'>
          {cluster.sentiment.map((line, i) => (
            <p key={i} className='detail-body-text detail-sentiment-line'>{line}</p>
          ))}
        </div>
        <p className='detail-sentiment-disclaimer'>
          This snapshot reflects simulated online discussion and is not representative of the entire public.
        </p>
      </div>

      {/* Selected Reporting */}
      <div className='detail-coverage'>
        <div className='detail-coverage-header'>
          <span className='detail-meta-label'>Selected Reporting</span>
          <span className='font-data text-[11px] text-[hsl(var(--muted-foreground))]'>
            / 0{cluster.articles.length}
          </span>
          <span className='detail-perspectives'>One event &middot; three perspectives</span>
        </div>
        {cluster.articles.map((article, i) => (
          <ArticleRow key={article.source} article={article} index={i} />
        ))}
      </div>

      {/* Market context */}
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

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div
      className='border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center'
      data-testid='state-empty'
    >
      <BookOpen className='mx-auto h-6 w-6 text-[hsl(var(--muted-foreground))]' />
      <h3 className='mt-4 font-editorial text-2xl'>No stories in this view</h3>
      <p className='mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]'>
        This briefing covers the previous 24 hours. Return to all topics to see the full desk.
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
      <h3 className='mt-4 font-editorial text-2xl'>The desk could not refresh</h3>
      <p className='mx-auto mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]'>
        This is a simulated provider error. Your last briefing remains available once you retry.
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
  const [showError, setShowError]       = useState(false);
  const [updated, setUpdated]           = useState(() =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
  );
  const [showAbout, setShowAbout] = useState(false);

  const filteredStories = useMemo(() => {
    if (activeTopic === 'all') {
      return featuredIds
        .map(id => stories.find(s => s.id === id))
        .filter((s): s is Cluster => s !== undefined);
    }
    return stories.filter(s => s.topic === activeTopic);
  }, [activeTopic]);

  const briefingDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  const handleSetTopic = (topic: TopicId | 'all') => {
    setActiveTopic(topic);
    setSelected(null);
    window.scrollTo({ top: 0 });
  };

  const refresh = () => {
    setIsRefreshing(true);
    setShowError(false);
    setSelected(null);
    window.setTimeout(() => {
      setIsRefreshing(false);
      setUpdated(
        new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()),
      );
    }, 900);
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
              <div className='fb-meta-div' />
              <div className='fb-meta-item'>
                <Clock3 className='h-3 w-3 text-[hsl(var(--muted-foreground))]' />
                <span className='fb-label'>Last updated</span>
                <span className='fb-meta-val' data-testid='text-last-updated'>{updated}</span>
              </div>
            </div>
            <button
              onClick={refresh}
              className="fb-refresh-btn font-bold bg-[#ffffff] text-[#000000] text-[12px]"
              disabled={isRefreshing}
              data-testid='button-refresh'
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>

          <div className='fb-focus-bar'>
            <nav className='fb-focus-nav' aria-label='Filter briefing by topic'>
              <button
                onClick={() => handleSetTopic('all')}
                className="all-filter all-filter-active text-center text-[12px] font-semibold text-[#767676] bg-[#ffffff] border-t-[#ffffff] border-r-[#ffffff] border-b-[#ffffff] border-l-[#ffffff]"
                aria-pressed={activeTopic === 'all'}
                data-testid='filter-all'
              >
                All
              </button>
              {topics.map(topic => (
                <button
                  key={topic.id}
                  onClick={() => handleSetTopic(topic.id)}
                  className="topic-filter text-[12px]"
                  aria-pressed={activeTopic === topic.id}
                  data-testid={`filter-${topic.id}`}
                >
                  <TopicIcon id={topic.id} />
                  {topic.label}
                </button>
              ))}
            </nav>
            <button
              onClick={() => setShowAbout(!showAbout)}
              className='inline-flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
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
              <h2 className="m-0 font-editorial text-[11px] font-semibold text-[#000000]">A briefing, not a feed</h2>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                FirstBrief groups duplicate coverage around the developments most worth understanding from the previous 24 hours.
              </p>
            </div>
            <div>
              <p className="m-0 font-semibold uppercase tracking-[.14em] text-[11px] text-[#000000]">Current status</p>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                All stories and market figures are realistic local mock data. No external providers or client-side secrets are connected.
              </p>
            </div>
            <div>
              <p className="m-0 font-semibold uppercase tracking-[.14em] text-[11px] text-[#000000]">Planned boundaries</p>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                Future server-side adapters may connect news providers, OpenAI summarisation and market APIs. Bias scoring, personalisation, alerts and price predictions are intentionally out of scope.
              </p>
            </div>
          </div>
        </section>
      )}
      {/* ── Main ─────────────────────────────────────────────── */}
      <main className='briefing-main mx-auto max-w-[1440px] px-5 pb-16 pt-6 sm:px-8 lg:px-12'>
        {selected ? (
          <DetailPage cluster={selected} onBack={() => { setSelected(null); window.scrollTo({ top: 0 }); }} />
        ) : showError ? (
          <ErrorState onRetry={refresh} />
        ) : isRefreshing ? (
          <SkeletonState />
        ) : filteredStories.length === 0 ? (
          <EmptyState onReset={() => handleSetTopic('all')} />
        ) : activeTopic === 'all' ? (
          /* ── All tab: asymmetric editorial front page ── */
          (<FrontPageLayout
            clusters={filteredStories}
            onBriefMe={openDetail}
          />)
        ) : (
          /* ── Topic tabs: uniform two-column card grid ── */
          (<div className='event-grid'>
            {filteredStories.map(cluster => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                onBriefMe={() => openDetail(cluster)}
                showTopic={false}
              />
            ))}
          </div>)
        )}

        <footer className='mt-10 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-5 text-[11px] leading-5 text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between'>
          <span>FirstBrief is a quiet, edited starting point — not a complete record of the news.</span>
          <button
            onClick={() => setShowError(!showError)}
            className='text-left text-xs font-medium underline-offset-2 hover:underline'
            data-testid='button-simulate-error'
          >
            {showError ? 'Dismiss simulated issue' : 'Test error state'}
          </button>
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
