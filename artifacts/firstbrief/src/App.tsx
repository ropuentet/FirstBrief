import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertCircle, BookOpen, Check, ChevronDown, ChevronUp, Clock3,
  ExternalLink, Info, Library, Menu, RefreshCw, SlidersHorizontal, X,
} from 'lucide-react';

type TopicId = 'ai' | 'nuclear' | 'football';
type Article = {
  source: string; time: string; paywall: boolean; summary: string; detail: string; href: string;
};
type Market = {
  name: string; ticker?: string; price: string; day: string; week: string; month: string;
  volume: string; explanation: string; points: number[];
};
type Cluster = {
  id: string; topic: TopicId; label: string; headline: string; rundown: string;
  why: string; score: number; articles: Article[]; market?: Market;
};

const queryClient = new QueryClient();
const topics: { id: TopicId; label: string; short: string; tint: string }[] = [
  { id: 'ai', label: 'Artificial Intelligence', short: 'AI', tint: 'hsl(177 49% 30%)' },
  { id: 'nuclear', label: 'Nuclear Energy & SMRs', short: 'Nuclear', tint: 'hsl(30 58% 49%)' },
  { id: 'football', label: 'European Football', short: 'Football', tint: 'hsl(200 42% 39%)' },
];

const stories: Cluster[] = [
  {
    id: 'ai-001', topic: 'ai', label: '01 · INFRASTRUCTURE',
    headline: 'Microsoft and OpenAI reset the terms of their partnership',
    rundown: 'Microsoft and OpenAI agreed to a revised commercial framework as OpenAI prepares for its next corporate structure. The companies said their model-development and cloud relationship continues, while several governance details remain under negotiation.',
    why: 'The agreement redraws the boundary between model ownership, cloud distribution and investor control — the three levers shaping who captures value in frontier AI.',
    score: 92,
    market: { name: 'Microsoft', ticker: 'MSFT', price: '$417.89', day: '+0.84%', week: '+2.41%', month: '+5.18%', volume: '18.7M', explanation: 'Microsoft traded higher in the latest session alongside a broad advance in large-cap technology. The available information does not establish that this story caused the move; the note describes market context rather than a price forecast.', points: [34, 31, 37, 35, 42, 43, 48, 46, 51, 55, 52, 58, 60] },
    articles: [
      { source: 'Financial Times', time: '18 min ago', paywall: true, summary: 'The new framework is designed to preserve the companies’ commercial ties while accommodating a more conventional investment structure.', detail: 'Reporting focuses on the balance between Microsoft’s multibillion-dollar investment, OpenAI’s new corporate arrangements and continued access to compute. It notes that the agreement is an important signal, but not a complete answer to questions about control.', href: 'https://www.ft.com/' },
      { source: 'The Verge', time: '1 hr ago', paywall: false, summary: 'A plain-language account of what changes in the partnership and what stays the same for customers.', detail: 'The explainer maps the relationship across Azure infrastructure, product distribution and model research. It separates confirmed terms from the areas the companies have not publicly detailed.', href: 'https://www.theverge.com/ai-artificial-intelligence' },
      { source: 'Reuters', time: '2 hrs ago', paywall: false, summary: 'Investors are parsing the announcement for clues about governance, capital and future product economics.', detail: 'Reuters’ account places the agreement within the wider race to finance data centres and train increasingly expensive models. The report also records the companies’ statements on ongoing collaboration.', href: 'https://www.reuters.com/technology/' },
    ],
  },
  {
    id: 'ai-002', topic: 'ai', label: '02 · REGULATION',
    headline: 'EU publishes the first practical enforcement timetable for the AI Act',
    rundown: 'European regulators outlined the next implementation milestones for the bloc’s AI Act, including guidance for general-purpose model providers. Companies are being asked to document risk management and training-data practices as obligations move from text to supervision.',
    why: 'The timetable turns a high-level rulebook into operational work for product, legal and engineering teams — and gives global vendors a clearer baseline for European launches.',
    score: 81,
    market: { name: 'European software sector', price: 'Index 1,184.6', day: '+0.21%', week: '+1.08%', month: '+3.64%', volume: '€2.9B', explanation: 'European software shares were broadly firmer over the period shown. This is an industry-level snapshot; it does not isolate regulatory news as the cause of any price change and makes no prediction about future returns.', points: [42, 40, 43, 45, 44, 49, 47, 50, 52, 54, 51, 56, 57] },
    articles: [
      { source: 'European Commission', time: '3 hrs ago', paywall: false, summary: 'The Commission’s implementation page gathers the next dates, codes of practice and support resources.', detail: 'The official material distinguishes prohibited practices, general-purpose model obligations and the role of national authorities. It is the best source for the legal text, although practical guidance is still developing.', href: 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai' },
      { source: 'Politico Europe', time: '4 hrs ago', paywall: true, summary: 'Industry teams are preparing for documentation demands that may reach deep into model supply chains.', detail: 'The report captures reactions from European policymakers and technology companies, with particular attention to how smaller providers can meet compliance requirements without duplicating large-company infrastructure.', href: 'https://www.politico.eu/section/technology/' },
      { source: 'Ars Technica', time: '6 hrs ago', paywall: false, summary: 'A useful guide to which AI Act deadlines matter now, and which remain further out.', detail: 'The article translates the calendar into product decisions, covering model evaluations, transparency documents and prohibited-use restrictions. It flags where the Commission has not yet filled in technical detail.', href: 'https://arstechnica.com/ai/' },
    ],
  },
  {
    id: 'nuclear-001', topic: 'nuclear', label: '01 · NEW BUILD',
    headline: 'The UK selects a site and financing model for a new SMR fleet',
    rundown: 'The UK government selected a preferred location for the country’s first small modular reactor programme and advanced its regulated-asset financing plan. The decision moves the project from technology competition toward the harder questions of licensing, grid connection and construction risk.',
    why: 'SMRs need repeatable delivery, not just a certified design. A credible first site can create the reference project that determines whether a wider fleet is financeable.',
    score: 86,
    market: { name: 'Rolls-Royce Holdings', ticker: 'RR.', price: '£8.74', day: '+1.12%', week: '+3.09%', month: '+7.47%', volume: '31.4M', explanation: 'Rolls-Royce is shown as a relevant public-company reference because its SMR business is part of the UK programme. The market figures are descriptive snapshots only; they do not prove causation or indicate where the price may go next.', points: [28, 29, 31, 34, 33, 37, 39, 36, 42, 46, 45, 50, 53] },
    articles: [
      { source: 'BBC News', time: '42 min ago', paywall: false, summary: 'The site decision is the clearest signal yet that the UK’s SMR plan is entering a delivery phase.', detail: 'The piece covers the proposed location, the companies in contention and the government’s stated timeline. It also includes local questions around jobs, planning and long-term waste management.', href: 'https://www.bbc.com/news/science_and_environment' },
      { source: 'Nuclear Engineering International', time: '1 hr ago', paywall: false, summary: 'Project developers are now focused on regulatory sequencing and the cost of the first unit.', detail: 'The specialist view details the licensing route and why a first-of-a-kind reactor carries a different risk profile from later units. It is especially useful for understanding the engineering milestones behind the announcement.', href: 'https://www.neimagazine.com/' },
      { source: 'The Guardian', time: '2 hrs ago', paywall: false, summary: 'Local and climate groups are weighing the programme’s promise against its unresolved delivery questions.', detail: 'The report places the announcement in the UK’s wider energy-security strategy. It includes competing perspectives on cost, speed, the grid and the role nuclear can play alongside renewables.', href: 'https://www.theguardian.com/environment/nuclear-power' },
    ],
  },
  {
    id: 'nuclear-002', topic: 'nuclear', label: '02 · SUPPLY CHAIN',
    headline: 'France and Japan deepen cooperation on advanced reactor fuel',
    rundown: 'French and Japanese nuclear firms signed a cooperation agreement covering fuel-cycle resilience and advanced-reactor research. The announcement links long-term technology work with a near-term effort to diversify specialist industrial capacity.',
    why: 'Fuel availability, enrichment and component manufacturing are strategic bottlenecks. Cooperation between two established nuclear economies can make new reactor programmes less dependent on a single supplier.',
    score: 73,
    articles: [
      { source: 'Nikkei Asia', time: '3 hrs ago', paywall: true, summary: 'The agreement broadens a bilateral energy relationship into next-generation nuclear supply chains.', detail: 'Nikkei reports that the partners are looking at fuel-cycle capabilities and research links rather than announcing a single commercial reactor. The distinction matters: industrial cooperation can take years to produce capacity.', href: 'https://asia.nikkei.com/' },
      { source: 'World Nuclear News', time: '5 hrs ago', paywall: false, summary: 'An industry briefing lists the named companies and the technical areas covered by the memorandum.', detail: 'The specialist account provides the clearest list of the workstreams, while noting that the memorandum is not itself a binding construction contract. It also gives context on existing French-Japanese nuclear ties.', href: 'https://world-nuclear-news.org/' },
      { source: 'Reuters', time: '7 hrs ago', paywall: false, summary: 'Officials described the deal as part of a broader push to secure low-carbon energy technology.', detail: 'The report situates the agreement alongside national energy strategies and geopolitical supply-chain concerns. It does not attach a value or completion date to the cooperation.', href: 'https://www.reuters.com/business/energy/' },
    ],
  },
  {
    id: 'football-001', topic: 'football', label: '01 · CHAMPIONS LEAGUE',
    headline: 'Inter’s late win reshapes the Champions League knockout picture',
    rundown: 'Inter Milan scored in the final minutes to beat Atlético Madrid and move into a stronger position in the Champions League knockout race. The result leaves the tie finely balanced ahead of the return fixture and changes the likely paths through the draw.',
    why: 'One goal changes the tactical incentives for both legs: Inter can protect a lead, while Atlético must create more without exposing its defence to transition attacks.',
    score: 88,
    articles: [
      { source: 'The Athletic', time: '26 min ago', paywall: true, summary: 'A tactical breakdown of how Inter’s midfield overload created the decisive late opening.', detail: 'The analysis follows the spacing around the half-spaces and the substitutions that changed the game’s final phase. It also explains why the narrow scoreline does not fully represent Inter’s control of territory.', href: 'https://www.nytimes.com/athletic/football/' },
      { source: 'UEFA.com', time: '38 min ago', paywall: false, summary: 'The official match report, line-ups and post-match comments from both managers.', detail: 'UEFA’s report provides the verified score, scorers, disciplinary record and quotes. It is the cleanest reference for the competition state before the second leg.', href: 'https://www.uefa.com/uefachampionsleague/' },
      { source: 'Marca', time: '1 hr ago', paywall: false, summary: 'Spanish coverage focuses on Atlético’s missed chances and the pressure now on the return leg.', detail: 'The report reflects the local reaction and highlights the team’s finishing problem. Its framing is more emotional than the official account, so it is best read alongside the match data.', href: 'https://www.marca.com/en/football.html' },
    ],
  },
  {
    id: 'football-002', topic: 'football', label: '02 · PREMIER LEAGUE',
    headline: 'The title race tightens after a weekend of dropped points',
    rundown: 'A draw between two leading Premier League sides compressed the gap at the top of the table, while a third contender won away from home. With the schedule entering a dense run of fixtures, small swings in availability and finishing could decide the order.',
    why: 'The table is now a race of margins. Congestion makes rotation and squad depth more consequential than any single headline result.',
    score: 76,
    articles: [
      { source: 'BBC Sport', time: '1 hr ago', paywall: false, summary: 'The updated table and fixture run-in show just how little separates the leading clubs.', detail: 'BBC’s report combines the weekend results with the remaining fixtures and points gap. It avoids treating the table as settled, noting the different difficulty of each club’s run-in.', href: 'https://www.bbc.com/sport/football/premier-league' },
      { source: 'The Guardian', time: '2 hrs ago', paywall: false, summary: 'Managers are balancing title ambition with the physical cost of a crowded calendar.', detail: 'The analysis focuses on rotation, injury management and how teams change their pressing intensity late in a season. It includes manager comments but separates them from the underlying results.', href: 'https://www.theguardian.com/football/premierleague' },
      { source: 'Sky Sports', time: '3 hrs ago', paywall: false, summary: 'A concise review of the weekend’s turning points and the next fixtures to watch.', detail: 'Sky’s roundup provides the practical schedule view, including kickoff changes and team news that may influence the next round. It is a useful quick read rather than a full tactical analysis.', href: 'https://www.skysports.com/football' },
    ],
  },
];

function TopicMark({ topic }: { topic: TopicId }) {
  return <span aria-hidden="true" className={`inline-flex h-2 w-2 rounded-full ${topic === 'ai' ? 'bg-[hsl(177_49%_30%)]' : topic === 'nuclear' ? 'bg-[hsl(30_58%_49%)]' : 'bg-[hsl(200_42%_39%)]'}`} />;
}

function Score({ value }: { value: number }) {
  const color = value >= 85 ? 'text-[hsl(2_55%_42%)]' : value >= 75 ? 'text-[hsl(30_58%_43%)]' : 'text-[hsl(177_49%_30%)]';
  return (
    <div className="score-lockup text-right" data-testid={`score-${value}`}>
      <div className={`font-data text-2xl font-medium leading-none ${color}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">heat / 100</div>
    </div>
  );
}

function ArticleRow({ article, index }: { article: Article; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="border-t border-[hsl(var(--border))] py-4" data-testid={`article-${index}-${article.source.toLowerCase().replaceAll(' ', '-')}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-[hsl(var(--foreground))]" data-testid={`article-source-${index}`}>{article.source}</span>
            <span className="text-[hsl(var(--muted-foreground))]">{article.time}</span>
            <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${article.paywall ? 'bg-[hsl(40_22%_88%)] text-[hsl(var(--muted-foreground))]' : 'bg-[hsl(161_25%_88%)] text-[hsl(177_49%_26%)]'}`}>
              {article.paywall ? 'Paywall' : 'Open access'}
            </span>
          </div>
          <p className="m-0 text-sm leading-6 text-[hsl(var(--foreground))]">{article.summary}</p>
        </div>
        <a className="mt-0.5 shrink-0 text-[hsl(var(--primary))] transition-opacity hover:opacity-60" href={article.href} target="_blank" rel="noreferrer" aria-label={`Open ${article.source} article`} data-testid={`link-article-${index}`}>
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <button onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--primary))] hover:underline" aria-expanded={open} data-testid={`button-expand-article-${index}`}>
        {open ? 'Hide detailed summary' : 'Read detailed summary'} {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <p className="mt-2 border-l-2 border-[hsl(var(--accent))] pl-3 text-xs leading-5 text-[hsl(var(--muted-foreground))]" data-testid={`detail-summary-${index}`}>{article.detail}</p>}
    </article>
  );
}

function MarketPanel({ market }: { market: Market }) {
  const width = 250; const height = 60;
  const points = market.points.map((point, index) => `${(index / (market.points.length - 1)) * width},${height - ((point - 20) / 45) * height}`).join(' ');
  return (
    <aside className="mt-6 border-t border-[hsl(var(--border))] pt-5" data-testid={`market-context-${market.ticker ?? 'sector'}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Market context</p>
          <h4 className="mt-1 font-editorial text-lg text-[hsl(var(--foreground))]">{market.name} {market.ticker && <span className="font-data text-xs text-[hsl(var(--muted-foreground))]">{market.ticker}</span>}</h4>
        </div>
        <span className="font-data text-sm text-[hsl(var(--foreground))]">{market.price}</span>
      </div>
      <div className="rounded-sm border border-dashed border-[hsl(var(--border))] bg-[hsl(43_28%_97%)] p-3">
        <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]"><span>30-day chart</span><span>placeholder</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label="Placeholder 30-day market chart">
          <polyline points={points} fill="none" stroke="hsl(177 49% 30%)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
        {[['1D', market.day], ['1W', market.week], ['1M', market.month], ['Volume', market.volume]].map(([term, value]) => <div key={term}><dt className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{term}</dt><dd className="mt-1 font-data text-[hsl(var(--foreground))]">{value}</dd></div>)}
      </dl>
      <p className="mt-4 text-xs leading-5 text-[hsl(var(--muted-foreground))]"><span className="font-semibold text-[hsl(var(--foreground))]">AI-generated market note · factual, non-predictive.</span> {market.explanation}</p>
    </aside>
  );
}

function ClusterCard({ cluster }: { cluster: Cluster }) {
  return (
    <section id={`cluster-${cluster.id}`} className="quiet-shadow rounded-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 scroll-mt-5 sm:p-5" data-testid={`cluster-${cluster.id}`}>
      <div className="cluster-header flex items-start justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[.16em] text-[hsl(var(--muted-foreground))]"><TopicMark topic={cluster.topic} /> {cluster.label}</div>
          <h3 className="m-0 max-w-3xl font-editorial text-[clamp(1.45rem,1.8vw,1.85rem)] leading-[1.08] text-[hsl(var(--foreground))]">{cluster.headline}</h3>
        </div>
        <Score value={cluster.score} />
      </div>
      <div className="mt-4 grid gap-4 border-y border-[hsl(var(--border))] py-4 md:grid-cols-[1.2fr_.8fr]">
        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">The rundown</p><p className="m-0 text-sm leading-5.5 text-[hsl(var(--foreground))]">{cluster.rundown}</p></div>
        <div className="md:border-l md:border-[hsl(var(--border))] md:pl-4"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))]">Why it matters</p><p className="m-0 text-sm leading-5.5 text-[hsl(var(--muted-foreground))]">{cluster.why}</p></div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3"><h4 className="m-0 text-xs font-semibold uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Curated coverage <span className="font-data font-normal">/ 03</span></h4><span className="text-xs text-[hsl(var(--muted-foreground))]">One event · three perspectives</span></div>
      <div className="mt-1">{cluster.articles.map((article, index) => <ArticleRow key={article.source} article={article} index={index} />)}</div>
      {cluster.market && <MarketPanel market={cluster.market} />}
    </section>
  );
}

function EventIndex({ stories: visibleStories }: { stories: Cluster[] }) {
  const jumpToCluster = (id: string) => {
    document.getElementById(`cluster-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="event-index" aria-label="Jump to event">
      <span className="event-index-label">Events</span>
      <div className="event-index-list">
        {visibleStories.map((story, index) => (
          <button
            key={story.id}
            type="button"
            onClick={() => jumpToCluster(story.id)}
            className="event-index-tab"
            title={story.headline}
            data-testid={`event-tab-${story.id}`}
          >
            <span className="font-data text-[10px] text-[hsl(var(--muted-foreground))]">{String(index + 1).padStart(2, '0')}</span>
            <TopicMark topic={story.topic} />
            <span>{story.headline}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function SkeletonState() {
  return <div className="space-y-5" aria-label="Loading briefing" data-testid="state-loading">{[1, 2].map((item) => <div className="rounded-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6" key={item}><div className="skeleton h-3 w-28 rounded-sm" /><div className="skeleton mt-4 h-8 w-3/4 rounded-sm" /><div className="skeleton mt-6 h-20 w-full rounded-sm" /><div className="skeleton mt-5 h-12 w-full rounded-sm" /></div>)}</div>;
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return <div className="rounded-sm border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-16 text-center" data-testid="state-empty"><BookOpen className="mx-auto h-7 w-7 text-[hsl(var(--muted-foreground))]" /><h3 className="mt-4 font-editorial text-2xl">No stories in this view</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">This briefing is intentionally limited to the previous 24 hours. Return to all topics to see the full desk.</p><button onClick={onReset} className="mt-5 text-xs font-semibold text-[hsl(var(--primary))] hover:underline" data-testid="button-reset-empty">Show all topics</button></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-sm border border-[hsl(2_55%_75%)] bg-[hsl(4_44%_97%)] px-6 py-14 text-center" role="alert" data-testid="state-error"><AlertCircle className="mx-auto h-7 w-7 text-[hsl(var(--destructive))]" /><h3 className="mt-4 font-editorial text-2xl">The desk could not refresh</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[hsl(var(--muted-foreground))]">This is a simulated provider error. Your last briefing remains available once you retry.</p><button onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[hsl(var(--primary))] px-4 py-2 text-xs font-semibold text-[hsl(var(--primary-foreground))]" data-testid="button-retry-refresh"><RefreshCw className="h-3.5 w-3.5" /> Try again</button></div>;
}

function AppContent() {
  const [activeTopic, setActiveTopic] = useState<TopicId | 'all'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showError, setShowError] = useState(false);
  const [updated, setUpdated] = useState(() => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
  const [showAbout, setShowAbout] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const filteredStories = useMemo(() => activeTopic === 'all' ? stories : stories.filter((story) => story.topic === activeTopic), [activeTopic]);
  const briefingDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const refresh = () => {
    setIsRefreshing(true); setShowError(false);
    window.setTimeout(() => { setIsRefreshing(false); setUpdated(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())); }, 900);
  };
  return (
    <div className="briefing-shell">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(43_38%_99%)]">
        <div className="mx-auto max-w-[1440px] px-5 py-5 sm:px-8 lg:px-12">
          <div className="header-meta flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"><Library className="h-4 w-4" /></div><div><div className="font-editorial text-[1.65rem] leading-none">FirstBrief</div><div className="mt-1 text-[10px] uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">The 24-hour desk</div></div></div>
            <div className="flex items-center gap-5 text-xs text-[hsl(var(--muted-foreground))]"><button onClick={refresh} className="inline-flex items-center gap-2 rounded-sm border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:bg-[hsl(var(--secondary))] disabled:opacity-60" disabled={isRefreshing} data-testid="button-refresh"><RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> {isRefreshing ? 'Refreshing' : 'Refresh'}</button><button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu" data-testid="button-mobile-menu">{mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button></div>
          </div>
          <div className={`${mobileMenu ? 'flex' : 'hidden'} mt-4 flex-col gap-2 border-t border-[hsl(var(--border))] pt-3 md:flex md:flex-row md:items-center md:justify-between`}><div className="filter-row flex items-center gap-1.5" aria-label="Filter briefing by topic"><span className="mr-2 hidden text-[10px] font-semibold uppercase tracking-[.16em] text-[hsl(var(--muted-foreground))] md:inline">Focus</span><button onClick={() => setActiveTopic('all')} className={`all-filter ${activeTopic === 'all' ? 'all-filter-active' : ''}`} aria-pressed={activeTopic === 'all'} data-testid="filter-all">All</button>{topics.map((topic) => <button key={topic.id} onClick={() => setActiveTopic(topic.id)} className={`topic-filter ${activeTopic === topic.id ? 'topic-filter-active' : ''}`} aria-pressed={activeTopic === topic.id} data-testid={`filter-${topic.id}`}><TopicMark topic={topic.id} /> {topic.label}</button>)}</div><div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))] md:justify-end"><button onClick={() => setShowAbout(!showAbout)} className="inline-flex items-center gap-1.5 hover:text-[hsl(var(--foreground))]" aria-expanded={showAbout} data-testid="button-about"><Info className="h-3.5 w-3.5" /> About this desk</button></div></div>
        </div>
      </header>
      {showAbout && <section className="border-b border-[hsl(var(--border))] bg-[hsl(41_23%_91%)]" data-testid="panel-about"><div className="mx-auto grid max-w-[1440px] gap-6 px-5 py-5 sm:px-8 lg:grid-cols-3 lg:px-12"><div><h2 className="m-0 font-editorial text-xl">A briefing, not a feed.</h2><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">FirstBrief groups duplicate coverage around the developments most worth understanding from the previous 24 hours.</p></div><div><p className="m-0 text-[10px] font-semibold uppercase tracking-[.14em]">Current status</p><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">All stories and market figures are realistic local mock data. No external providers or client-side secrets are connected.</p></div><div><p className="m-0 text-[10px] font-semibold uppercase tracking-[.14em]">Planned boundaries</p><p className="mt-2 text-xs leading-5 text-[hsl(var(--muted-foreground))]">Future server-side adapters may connect news providers, OpenAI summarisation and market APIs. Bias scoring, personalisation, alerts and price predictions are intentionally out of scope.</p></div></div></section>}
      <main className="briefing-main mx-auto max-w-[1440px] px-5 pb-16 pt-5 sm:px-8 lg:px-12">
        <section className="briefing-bar border-b border-[hsl(var(--border))] pb-5" aria-labelledby="briefing-title">
          <div className="briefing-copy">
            <p className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]"><SlidersHorizontal className="h-3.5 w-3.5" /> Morning edition</p>
            <h1 id="briefing-title" className="m-0 font-editorial text-[clamp(2rem,3.5vw,3.25rem)] leading-[.98] tracking-[-.025em]">What changed <span className="text-[hsl(var(--primary))]">while you were away.</span></h1>
            <p className="briefing-description">A compact read across three desks. Start with the highest-heat cluster, then follow the thread.</p>
          </div>
          <dl className="briefing-meta">
            <div><dt>Briefing date</dt><dd data-testid="text-briefing-date">{briefingDate}</dd></div>
            <div><dt>Last updated</dt><dd className="flex items-center gap-1.5" data-testid="text-last-updated"><Clock3 className="h-3 w-3" /> {updated}</dd></div>
            <div><dt>Event clusters</dt><dd className="font-data" data-testid="text-event-count">{filteredStories.length}</dd></div>
          </dl>
        </section>
        <EventIndex stories={filteredStories} />
        {showError ? <ErrorState onRetry={refresh} /> : isRefreshing ? <SkeletonState /> : filteredStories.length === 0 ? <EmptyState onReset={() => setActiveTopic('all')} /> : <div className="event-grid">{filteredStories.map((cluster) => <ClusterCard cluster={cluster} key={cluster.id} />)}</div>}
        <footer className="mt-10 flex flex-col gap-3 border-t border-[hsl(var(--border))] pt-5 text-[11px] leading-5 text-[hsl(var(--muted-foreground))] sm:flex-row sm:items-center sm:justify-between"><span>FirstBrief is a quiet, edited starting point — not a complete record of the news.</span><button onClick={() => setShowError(!showError)} className="text-left font-medium text-[hsl(var(--primary))] hover:underline" data-testid="button-simulate-error">{showError ? 'Dismiss simulated issue' : 'Test error state'}</button></footer>
      </main>
    </div>
  );
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><AppContent /></TooltipProvider></QueryClientProvider>;
}

export default App;
