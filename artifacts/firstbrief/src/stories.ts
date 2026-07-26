export type TopicId = 'ai' | 'nuclear' | 'football';

export type Article = {
  source: string;
  time: string;
  paywall: boolean;
  summary: string;
  detail: string;
  href: string;
};

export type Market = {
  name: string;
  ticker?: string;
  price: string;
  day: string;
  week: string;
  month: string;
  volume: string;
  explanation: string;
  points: number[];
};

export type Cluster = {
  id: string;
  topic: TopicId;
  label: string;
  headline: string;
  rundown: string;
  why: string;
  score: number;
  articles: Article[];
  market?: Market;
};

export const topics: { id: TopicId; label: string; short: string }[] = [
  { id: "ai",       label: "Artificial Intelligence", short: "AI" },
  { id: "nuclear",  label: "Nuclear Energy & SMRs",   short: "Nuclear" },
  { id: "football", label: "European Football",        short: "Football" },
];

export const stories: Cluster[] = [
  {
    id: "ai-001",
    topic: "ai",
    label: "01 · INFRASTRUCTURE",
    headline: "Microsoft and OpenAI reset the terms of their partnership",
    rundown: "Microsoft and OpenAI agreed to a revised commercial framework as OpenAI prepares for its next corporate structure. The companies said their model-development and cloud relationship continues, while several governance details remain under negotiation.",
    why: "The agreement redraws the boundary between model ownership, cloud distribution and investor control \u2014 the three levers shaping who captures value in frontier AI.",
    score: 92,
    market: {
      name: "Microsoft",
      ticker: "MSFT",
      price: "$417.89",
      day: "+0.84%",
      week: "+2.41%",
      month: "+5.18%",
      volume: "18.7M",
      explanation: "Microsoft traded higher in the latest session alongside a broad advance in large-cap technology. The available information does not establish that this story caused the move; the note describes market context rather than a price forecast.",
      points: [34, 31, 37, 35, 42, 43, 48, 46, 51, 55, 52, 58, 60],
    },
    articles: [
      {
        source: "Financial Times",
        time: "18 min ago",
        paywall: true,
        summary: "The new framework is designed to preserve the companies\u2019 commercial ties while accommodating a more conventional investment structure.",
        detail: "Reporting focuses on the balance between Microsoft\u2019s multibillion-dollar investment, OpenAI\u2019s new corporate arrangements and continued access to compute. It notes that the agreement is an important signal, but not a complete answer to questions about control.",
        href: "https://www.ft.com/",
      },
      {
        source: "The Verge",
        time: "1 hr ago",
        paywall: false,
        summary: "A plain-language account of what changes in the partnership and what stays the same for customers.",
        detail: "The explainer maps the relationship across Azure infrastructure, product distribution and model research. It separates confirmed terms from the areas the companies have not publicly detailed.",
        href: "https://www.theverge.com/ai-artificial-intelligence",
      },
      {
        source: "Reuters",
        time: "2 hrs ago",
        paywall: false,
        summary: "Investors are parsing the announcement for clues about governance, capital and future product economics.",
        detail: "Reuters\u2019 account places the agreement within the wider race to finance data centres and train increasingly expensive models. The report also records the companies\u2019 statements on ongoing collaboration.",
        href: "https://www.reuters.com/technology/",
      },
    ],
  },
  {
    id: "ai-002",
    topic: "ai",
    label: "02 · REGULATION",
    headline: "EU publishes the first practical enforcement timetable for the AI Act",
    rundown: "European regulators outlined the next implementation milestones for the bloc\u2019s AI Act, including guidance for general-purpose model providers. Companies are being asked to document risk management and training-data practices as obligations move from text to supervision.",
    why: "The timetable turns a high-level rulebook into operational work for product, legal and engineering teams \u2014 and gives global vendors a clearer baseline for European launches.",
    score: 81,
    market: {
      name: "European software sector",
      price: "Index 1,184.6",
      day: "+0.21%",
      week: "+1.08%",
      month: "+3.64%",
      volume: "\u20ac2.9B",
      explanation: "European software shares were broadly firmer over the period shown. This is an industry-level snapshot; it does not isolate regulatory news as the cause of any price change and makes no prediction about future returns.",
      points: [42, 40, 43, 45, 44, 49, 47, 50, 52, 54, 51, 56, 57],
    },
    articles: [
      {
        source: "European Commission",
        time: "3 hrs ago",
        paywall: false,
        summary: "The Commission\u2019s implementation page gathers the next dates, codes of practice and support resources.",
        detail: "The official material distinguishes prohibited practices, general-purpose model obligations and the role of national authorities. It is the best source for the legal text, although practical guidance is still developing.",
        href: "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
      },
      {
        source: "Politico Europe",
        time: "4 hrs ago",
        paywall: true,
        summary: "Industry teams are preparing for documentation demands that may reach deep into model supply chains.",
        detail: "The report captures reactions from European policymakers and technology companies, with particular attention to how smaller providers can meet compliance requirements without duplicating large-company infrastructure.",
        href: "https://www.politico.eu/section/technology/",
      },
      {
        source: "Ars Technica",
        time: "6 hrs ago",
        paywall: false,
        summary: "A useful guide to which AI Act deadlines matter now, and which remain further out.",
        detail: "The article translates the calendar into product decisions, covering model evaluations, transparency documents and prohibited-use restrictions. It flags where the Commission has not yet filled in technical detail.",
        href: "https://arstechnica.com/ai/",
      },
    ],
  },
  {
    id: "nuclear-001",
    topic: "nuclear",
    label: "01 · NEW BUILD",
    headline: "The UK selects a site and financing model for a new SMR fleet",
    rundown: "The UK government selected a preferred location for the country\u2019s first small modular reactor programme and advanced its regulated-asset financing plan. The decision moves the project from technology competition toward the harder questions of licensing, grid connection and construction risk.",
    why: "SMRs need repeatable delivery, not just a certified design. A credible first site can create the reference project that determines whether a wider fleet is financeable.",
    score: 86,
    market: {
      name: "Rolls-Royce Holdings",
      ticker: "RR.",
      price: "\u00a38.74",
      day: "+1.12%",
      week: "+3.09%",
      month: "+7.47%",
      volume: "31.4M",
      explanation: "Rolls-Royce is shown as a relevant public-company reference because its SMR business is part of the UK programme. The market figures are descriptive snapshots only; they do not prove causation or indicate where the price may go next.",
      points: [28, 29, 31, 34, 33, 37, 39, 36, 42, 46, 45, 50, 53],
    },
    articles: [
      {
        source: "BBC News",
        time: "42 min ago",
        paywall: false,
        summary: "The site decision is the clearest signal yet that the UK\u2019s SMR plan is entering a delivery phase.",
        detail: "The piece covers the proposed location, the companies in contention and the government\u2019s stated timeline. It also includes local questions around jobs, planning and long-term waste management.",
        href: "https://www.bbc.com/news/science_and_environment",
      },
      {
        source: "Nuclear Engineering International",
        time: "1 hr ago",
        paywall: false,
        summary: "Project developers are now focused on regulatory sequencing and the cost of the first unit.",
        detail: "The specialist view details the licensing route and why a first-of-a-kind reactor carries a different risk profile from later units. It is especially useful for understanding the engineering milestones behind the announcement.",
        href: "https://www.neimagazine.com/",
      },
      {
        source: "The Guardian",
        time: "2 hrs ago",
        paywall: false,
        summary: "Local and climate groups are weighing the programme\u2019s promise against its unresolved delivery questions.",
        detail: "The report places the announcement in the UK\u2019s wider energy-security strategy. It includes competing perspectives on cost, speed, the grid and the role nuclear can play alongside renewables.",
        href: "https://www.theguardian.com/environment/nuclear-power",
      },
    ],
  },
  {
    id: "nuclear-002",
    topic: "nuclear",
    label: "02 · SUPPLY CHAIN",
    headline: "France and Japan deepen cooperation on advanced reactor fuel",
    rundown: "French and Japanese nuclear firms signed a cooperation agreement covering fuel-cycle resilience and advanced-reactor research. The announcement links long-term technology work with a near-term effort to diversify specialist industrial capacity.",
    why: "Fuel availability, enrichment and component manufacturing are strategic bottlenecks. Cooperation between two established nuclear economies can make new reactor programmes less dependent on a single supplier.",
    score: 73,
    articles: [
      {
        source: "Nikkei Asia",
        time: "3 hrs ago",
        paywall: true,
        summary: "The agreement broadens a bilateral energy relationship into next-generation nuclear supply chains.",
        detail: "Nikkei reports that the partners are looking at fuel-cycle capabilities and research links rather than announcing a single commercial reactor. The distinction matters: industrial cooperation can take years to produce capacity.",
        href: "https://asia.nikkei.com/",
      },
      {
        source: "World Nuclear News",
        time: "5 hrs ago",
        paywall: false,
        summary: "An industry briefing lists the named companies and the technical areas covered by the memorandum.",
        detail: "The specialist account provides the clearest list of the workstreams, while noting that the memorandum is not itself a binding construction contract. It also gives context on existing French-Japanese nuclear ties.",
        href: "https://world-nuclear-news.org/",
      },
      {
        source: "Reuters",
        time: "7 hrs ago",
        paywall: false,
        summary: "Officials described the deal as part of a broader push to secure low-carbon energy technology.",
        detail: "The report situates the agreement alongside national energy strategies and geopolitical supply-chain concerns. It does not attach a value or completion date to the cooperation.",
        href: "https://www.reuters.com/business/energy/",
      },
    ],
  },
  {
    id: "football-001",
    topic: "football",
    label: "01 · CHAMPIONS LEAGUE",
    headline: "Inter\u2019s late win reshapes the Champions League knockout picture",
    rundown: "Inter Milan scored in the final minutes to beat Atl\u00e9tico Madrid and move into a stronger position in the Champions League knockout race. The result leaves the tie finely balanced ahead of the return fixture and changes the likely paths through the draw.",
    why: "One goal changes the tactical incentives for both legs: Inter can protect a lead, while Atl\u00e9tico must create more without exposing its defence to transition attacks.",
    score: 88,
    articles: [
      {
        source: "The Athletic",
        time: "26 min ago",
        paywall: true,
        summary: "A tactical breakdown of how Inter\u2019s midfield overload created the decisive late opening.",
        detail: "The analysis follows the spacing around the half-spaces and the substitutions that changed the game\u2019s final phase. It also explains why the narrow scoreline does not fully represent Inter\u2019s control of territory.",
        href: "https://www.nytimes.com/athletic/football/",
      },
      {
        source: "UEFA.com",
        time: "38 min ago",
        paywall: false,
        summary: "The official match report, line-ups and post-match comments from both managers.",
        detail: "UEFA\u2019s report provides the verified score, scorers, disciplinary record and quotes. It is the cleanest reference for the competition state before the second leg.",
        href: "https://www.uefa.com/uefachampionsleague/",
      },
      {
        source: "Marca",
        time: "1 hr ago",
        paywall: false,
        summary: "Spanish coverage focuses on Atl\u00e9tico\u2019s missed chances and the pressure now on the return leg.",
        detail: "The report reflects the local reaction and highlights the team\u2019s finishing problem. Its framing is more emotional than the official account, so it is best read alongside the match data.",
        href: "https://www.marca.com/en/football.html",
      },
    ],
  },
  {
    id: "football-002",
    topic: "football",
    label: "02 · PREMIER LEAGUE",
    headline: "The title race tightens after a weekend of dropped points",
    rundown: "A draw between two leading Premier League sides compressed the gap at the top of the table, while a third contender won away from home. With the schedule entering a dense run of fixtures, small swings in availability and finishing could decide the order.",
    why: "The table is now a race of margins. Congestion makes rotation and squad depth more consequential than any single headline result.",
    score: 76,
    articles: [
      {
        source: "BBC Sport",
        time: "1 hr ago",
        paywall: false,
        summary: "The updated table and fixture run-in show just how little separates the leading clubs.",
        detail: "BBC\u2019s report combines the weekend results with the remaining fixtures and points gap. It avoids treating the table as settled, noting the different difficulty of each club\u2019s run-in.",
        href: "https://www.bbc.com/sport/football/premier-league",
      },
      {
        source: "The Guardian",
        time: "2 hrs ago",
        paywall: false,
        summary: "Managers are balancing title ambition with the physical cost of a crowded calendar.",
        detail: "The analysis focuses on rotation, injury management and how teams change their pressing intensity late in a season. It includes manager comments but separates them from the underlying results.",
        href: "https://www.theguardian.com/football/premierleague",
      },
      {
        source: "Sky Sports",
        time: "3 hrs ago",
        paywall: false,
        summary: "A concise review of the weekend\u2019s turning points and the next fixtures to watch.",
        detail: "Sky\u2019s roundup provides the practical schedule view, including kickoff changes and team news that may influence the next round. It is a useful quick read rather than a full tactical analysis.",
        href: "https://www.skysports.com/football",
      },
    ],
  },
];
