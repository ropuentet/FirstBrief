import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertCircle, ArrowLeft, ArrowRight, BookOpen,
  ChevronDown, ChevronUp, Clock3, ExternalLink,
  Info, Library, RefreshCw,
} from 'lucide-react';
import { type TopicId, type Article, type Market, type Cluster, topics, stories } from './stories';

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

/* ── Article row (detail page) ──────────────────────────────── */
function ArticleRow({ article, index }: { article: Article; index: number }) {
  const [open, setOpen] = useState(false);
  const slug = article.source.toLowerCase().replaceAll(' ', '-');
  return (
    <article
      className='border-t border-[hsl(var(--border))] py-4'
      data-testid={`article-${index}-${slug}`}
    >
      <div className='flex items-start justify-between gap-4'>
        <div className='min-w-0'>
          <div className='mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
            <span className='font-semibold' data-testid={`article-source-${index}`}>
              {article.source}
            </span>
            <span className='font-data text-[hsl(var(--muted-foreground))]'>{article.time}</span>
            <span className={[
              'rounded-none border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              article.paywall
                ? 'border-[hsl(var(--border))] bg-[hsl(0_0%_93%)] text-[hsl(var(--muted-foreground))]'
                : 'border-[hsl(0_0%_78%)] bg-transparent text-[hsl(0_0%_22%)]',
            ].join(' ')}>
              {article.paywall ? 'Paywall' : 'Open access'}
            </span>
          </div>
          <p className='m-0 text-sm leading-6'>{article.summary}</p>
        </div>
        <a
          className='mt-0.5 shrink-0 opacity-40 transition-opacity hover:opacity-100'
          href={article.href}
          target='_blank'
          rel='noreferrer'
          aria-label={`Open ${article.source} article`}
          data-testid={`link-article-${index}`}
        >
          <ExternalLink className='h-4 w-4' />
        </a>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className='mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline-offset-2 hover:underline'
        aria-expanded={open}
        data-testid={`button-expand-article-${index}`}
      >
        {open ? 'Hide detailed summary' : 'Read detailed summary'}
        {open ? <ChevronUp className='h-3.5 w-3.5' /> : <ChevronDown className='h-3.5 w-3.5' />}
      </button>
      {open && (
        <p
          className='mt-2 border-l border-[hsl(var(--border))] pl-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]'
          data-testid={`detail-summary-${index}`}
        >
          {article.detail}
        </p>
      )}
    </article>
  );
}

/* ── Market panel (detail page) ─────────────────────────────── */
function MarketPanel({ market }: { market: Market }) {
  const W = 250; const H = 60;
  const pts = market.points
    .map((p, i) => `${(i / (market.points.length - 1)) * W},${H - ((p - 20) / 45) * H}`)
    .join(' ');
  return (
    <aside
      className='mt-8 border-t border-[hsl(var(--border))] pt-6'
      data-testid={`market-context-${market.ticker ?? 'sector'}`}
    >
      <div className='mb-4 flex flex-wrap items-baseline justify-between gap-2'>
        <div>
          <p className='detail-meta-label'>Market context</p>
          <h4 className='mt-1 font-editorial text-lg'>
            {market.name}{' '}
            {market.ticker && (
              <span className='font-data text-xs text-[hsl(var(--muted-foreground))]'>
                {market.ticker}
              </span>
            )}
          </h4>
        </div>
        <span className='font-data text-sm'>{market.price}</span>
      </div>
      <div className='border border-[hsl(var(--border))] bg-[hsl(0_0%_98%)] p-3'>
        <div className='mb-1 flex justify-between text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]'>
          <span>30-day chart</span><span>placeholder</span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className='h-16 w-full'
          preserveAspectRatio='none'
          role='img'
          aria-label='Placeholder 30-day market chart'
        >
          <polyline points={pts} fill='none' stroke='hsl(0 0% 12%)' strokeWidth='2' vectorEffect='non-scaling-stroke' />
        </svg>
      </div>
      <dl className='mt-3 grid grid-cols-4 gap-2 text-xs'>
        {([['1D', market.day], ['1W', market.week], ['1M', market.month], ['Volume', market.volume]] as const).map(
          ([term, val]) => (
            <div key={term}>
              <dt className='text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]'>{term}</dt>
              <dd className='mt-1 font-data'>{val}</dd>
            </div>
          ),
        )}
      </dl>
      <p className='mt-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
        <span className='font-semibold text-[hsl(var(--foreground))]'>
          AI-generated market note · factual, non-predictive.
        </span>{' '}
        {market.explanation}
      </p>
    </aside>
  );
}

/* ── Dashboard card ─────────────────────────────────────────── */
function ClusterCard({ cluster, onBriefMe }: { cluster: Cluster; onBriefMe: () => void }) {
  return (
    <section
      className='cluster-card'
      id={`cluster-${cluster.id}`}
      data-testid={`cluster-${cluster.id}`}
    >
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

/* ── Detail page ────────────────────────────────────────────── */
function DetailPage({ cluster, onBack }: { cluster: Cluster; onBack: () => void }) {
  const topicLabel = topics.find(t => t.id === cluster.topic)?.label ?? '';
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
          <p className='detail-meta-label'>The rundown</p>
          <p className='detail-body-text'>{cluster.rundown}</p>
        </div>
        <div className='detail-why-col'>
          <p className='detail-meta-label'>Why it matters</p>
          <p className='detail-body-text detail-why-text'>{cluster.why}</p>
        </div>
      </div>

      <div className='detail-coverage'>
        <div className='detail-coverage-header'>
          <span className='detail-meta-label'>Curated coverage</span>
          <span className='font-data text-[11px] text-[hsl(var(--muted-foreground))]'>/ 03</span>
          <span className='detail-perspectives'>One event · three perspectives</span>
        </div>
        {cluster.articles.map((article, i) => (
          <ArticleRow key={article.source} article={article} index={i} />
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

  const filteredStories = useMemo(
    () => activeTopic === 'all' ? stories : stories.filter(s => s.topic === activeTopic),
    [activeTopic],
  );

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
            <div className='fb-brand-mark-box'>
              <Library strokeWidth={1.4} className='h-3 w-3' />
            </div>
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
              <span className='fb-focus-label'>Focus</span>
              <button
                onClick={() => handleSetTopic('all')}
                className={`all-filter${activeTopic === 'all' ? ' all-filter-active' : ''}`}
                aria-pressed={activeTopic === 'all'}
                data-testid='filter-all'
              >
                All
              </button>
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
              <h2 className='m-0 font-editorial text-xl'>A briefing, not a feed.</h2>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                FirstBrief groups duplicate coverage around the developments most worth understanding from the previous 24 hours.
              </p>
            </div>
            <div>
              <p className='m-0 text-[10px] font-semibold uppercase tracking-[.14em]'>Current status</p>
              <p className='mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]'>
                All stories and market figures are realistic local mock data. No external providers or client-side secrets are connected.
              </p>
            </div>
            <div>
              <p className='m-0 text-[10px] font-semibold uppercase tracking-[.14em]'>Planned boundaries</p>
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
