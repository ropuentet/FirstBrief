export type TopicId = 'ai' | 'nuclear' | 'football';

export type AccessLevel = 'full' | 'excerpt' | 'headline-only';

export type Article = {
  source: string;
  time: string;
  paywall: boolean;
  accessLevel: AccessLevel;
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
  return6m: string;
  return1y: string;
  volume: string;
  marketCap: string;
  pe: string;
  avgVolume: string;
  eventDate: string;
  sinceEvent: string;
  explanation: string;
  points30d: number[];
  points6m: number[];
  points1y: number[];
};

export type Cluster = {
  id: string;
  topic: TopicId;
  label: string;
  headline: string;
  rundown: string;
  rundownP2: string;
  /** 2\u20134 lines describing public reaction. Future: replace with authorised social-media API data (X, Reddit, etc.). */
  sentiment: string[];
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

/* ─── Curated All-tab selection: top 6 events ranked across topics ─── */
export const featuredIds: string[] = [
  "ai-001",       // score 92 — lead story
  "football-001", // score 88 — medium card
  "nuclear-001",  // score 86 — medium card
  "ai-004",       // score 85 — small card
  "football-003", // score 82 — small card
  "nuclear-003",  // score 80 — small card (Belgium reversal)
];

/* ─── All stories ─── */
export const stories: Cluster[] = [

  /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ARTIFICIAL INTELLIGENCE \u2550\u2550 */
  {
    id: "ai-001",
    topic: "ai",
    label: "01 \u00b7 INFRASTRUCTURE",
    headline: "Microsoft and OpenAI reset the terms of their partnership",
    rundown: "Microsoft and OpenAI agreed to a revised commercial framework as OpenAI prepares for its next corporate structure. The companies said their model-development and cloud relationship continues, while several governance details remain under negotiation.",
    rundownP2: "Separately, OpenAI confirmed details of its transition from a capped-profit entity to a public-benefit corporation. The restructured governance model is intended to give the company more flexibility to raise capital, though it remains subject to ongoing negotiation with several stakeholders including Microsoft.",
    sentiment: [
      "Public discussion is broadly positive toward OpenAI\u2019s restructuring, with many observers welcoming the move toward a more conventional corporate form as a sign of long-term stability.",
      "A recurring concern across online forums centres on Microsoft\u2019s continued influence, with some commentators questioning whether the new structure meaningfully shifts control or simply repackages existing arrangements.",
      "Tech-focused communities are debating the long-term implications for open-source AI development, with some arguing the deal signals a tightening of the frontier model ecosystem around a small number of well-capitalised partners.",
    ],
    why: "The agreement redraws the boundary between model ownership, cloud distribution and investor control \u2014 the three levers shaping who captures value in frontier AI.",
    score: 92,
    market: {
      name: "Microsoft",
      ticker: "MSFT",
      price: "$417.89",
      day: "+0.84%",
      week: "+2.41%",
      month: "+5.18%",
      return6m: "+12.3%",
      return1y: "+18.7%",
      volume: "18.7M",
      marketCap: "$3.11T",
      pe: "36.2",
      avgVolume: "19.4M",
      eventDate: "25 Jul 2026",
      sinceEvent: "Microsoft shares moved broadly in line with the wider large-cap technology sector in the session following the announcement. The partnership update may have contributed to positive sentiment, though it occurred during a period of broad market strength. No direct causal link can be confirmed from available information.",
      explanation: "Microsoft traded higher in the latest session alongside a broad advance in large-cap technology. The available information does not establish that this story caused the move; the note describes market context rather than a price forecast.",
      points30d: [34, 31, 37, 35, 42, 43, 48, 46, 51, 55, 52, 58, 60],
      points6m:  [18, 20, 22, 19, 24, 26, 28, 25, 30, 33, 31, 36, 38, 35, 40, 43, 45, 48, 52, 58, 60],
      points1y:  [10, 12, 9, 14, 16, 13, 18, 20, 17, 22, 25, 23, 28, 26, 31, 29, 34, 32, 37, 35, 40, 42, 46, 50, 54, 60],
    },
    articles: [
      {
        source: "Financial Times",
        time: "18 min ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "The new framework is designed to preserve the companies\u2019 commercial ties while accommodating a more conventional investment structure.",
        detail: "Reporting focuses on the balance between Microsoft\u2019s multibillion-dollar investment, OpenAI\u2019s new corporate arrangements and continued access to compute. It notes that the agreement is an important signal, but not a complete answer to questions about control.",
        href: "https://www.ft.com/",
      },
      {
        source: "The Verge",
        time: "1 hr ago",
        paywall: false,
        accessLevel: "full",
        summary: "A plain-language account of what changes in the partnership and what stays the same for customers.",
        detail: "The explainer maps the relationship across Azure infrastructure, product distribution and model research. It separates confirmed terms from the areas the companies have not publicly detailed.",
        href: "https://www.theverge.com/ai-artificial-intelligence",
      },
      {
        source: "Reuters",
        time: "2 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "Investors are parsing the announcement for clues about governance, capital and future product economics.",
        detail: "Reuters\u2019 account places the agreement within the wider race to finance data centres and train increasingly expensive models. The report also records the companies\u2019 statements on ongoing collaboration.",
        href: "https://www.reuters.com/technology/",
      },
    ],
  },

  {
    id: "ai-002",
    topic: "ai",
    label: "02 \u00b7 REGULATION",
    headline: "EU publishes the first practical enforcement timetable for the AI Act",
    rundown: "European regulators outlined the next implementation milestones for the bloc\u2019s AI Act, including guidance for general-purpose model providers. Companies are being asked to document risk management and training-data practices as obligations move from text to supervision.",
    rundownP2: "Separately, the Commission published draft codes of practice for general-purpose AI model providers, inviting comment from industry participants over a defined window. The draft distinguishes between models above and below compute thresholds, with the heavier obligations applying to frontier systems.",
    sentiment: [
      "European online discussion is split between those who see regulatory clarity as overdue and technology practitioners worried about compliance costs for smaller companies and open-source model developers.",
      "Sentiment in developer communities leans sceptical, with many questioning whether the enforcement timetable is realistic given the pace of model development and the regulator\u2019s limited technical capacity.",
      "Broader public commentary outside specialist circles remains limited, with the story attracting more engagement in policy, legal and compliance communities than among general audiences.",
    ],
    why: "The timetable turns a high-level rulebook into operational work for product, legal and engineering teams \u2014 and gives global vendors a clearer baseline for European launches.",
    score: 81,
    market: {
      name: "European software sector",
      price: "Index 1,184.6",
      day: "+0.21%",
      week: "+1.08%",
      month: "+3.64%",
      return6m: "+8.1%",
      return1y: "+14.2%",
      volume: "\u20ac2.9B",
      marketCap: "N/A",
      pe: "N/A",
      avgVolume: "N/A",
      eventDate: "25 Jul 2026",
      sinceEvent: "The European software sector index was broadly flat in the hours following the publication. Regulatory announcements of this type tend to have diffuse rather than immediate price effects; the timetable\u2019s impact on individual company valuations will likely unfold over months rather than sessions.",
      explanation: "European software shares were broadly firmer over the period shown. This is an industry-level snapshot; it does not isolate regulatory news as the cause of any price change and makes no prediction about future returns.",
      points30d: [42, 40, 43, 45, 44, 49, 47, 50, 52, 54, 51, 56, 57],
      points6m:  [22, 24, 26, 23, 28, 30, 29, 32, 34, 31, 36, 38, 37, 40, 42, 44, 47, 50, 53, 55, 57],
      points1y:  [12, 14, 16, 13, 18, 20, 17, 22, 25, 23, 28, 26, 31, 29, 34, 32, 37, 35, 40, 42, 44, 47, 50, 53, 55, 57],
    },
    articles: [
      {
        source: "European Commission",
        time: "3 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "The Commission\u2019s implementation page gathers the next dates, codes of practice and support resources.",
        detail: "The official material distinguishes prohibited practices, general-purpose model obligations and the role of national authorities. It is the best source for the legal text, although practical guidance is still developing.",
        href: "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai",
      },
      {
        source: "Politico Europe",
        time: "4 hrs ago",
        paywall: true,
        accessLevel: "headline-only",
        summary: "Industry teams are preparing for documentation demands that may reach deep into model supply chains.",
        detail: "The report captures reactions from European policymakers and technology companies. The summary here is based only on the accessible headline and metadata; the full article is behind a subscriber paywall.",
        href: "https://www.politico.eu/section/technology/",
      },
      {
        source: "Ars Technica",
        time: "6 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "A useful guide to which AI Act deadlines matter now, and which remain further out.",
        detail: "The article translates the calendar into product decisions, covering model evaluations, transparency documents and prohibited-use restrictions. It flags where the Commission has not yet filled in technical detail.",
        href: "https://arstechnica.com/ai/",
      },
    ],
  },

  {
    id: "ai-003",
    topic: "ai",
    label: "03 \u00b7 ENTERPRISE",
    headline: "Salesforce and ServiceNow deploy autonomous AI agents across enterprise workflows",
    rundown: "Salesforce and ServiceNow both announced autonomous agent products designed to handle multi-step enterprise tasks without human intervention. The announcements mark a shift from AI as a productivity tool toward AI as an active participant in business processes.",
    rundownP2: "The agent frameworks differ in approach: Salesforce emphasises CRM and sales workflows while ServiceNow targets IT operations and HR processes. Both companies are positioning their existing platform relationships as the primary distribution advantage over standalone AI providers.",
    sentiment: [
      "Enterprise software communities are cautiously curious, with many professionals asking whether agent autonomy in practice matches what the announcements describe, and requesting independent benchmarks.",
      "A notable portion of online discussion expresses concern about workforce implications, particularly in operational and administrative roles where AI agents would most directly replace current workflows.",
      "Enthusiasm among developers is tempered by scepticism about vendor lock-in, with comparisons to previous enterprise AI announcements that generated excitement but underdelivered on promised automation.",
    ],
    why: "Enterprise adoption is the next test of whether AI creates measurable productivity gains or simply displaces existing software spend. The agent model changes the unit of value from tokens consumed to tasks completed.",
    score: 78,
    articles: [
      {
        source: "Bloomberg Technology",
        time: "2 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "Both companies framed their announcements as the beginning of a new category of enterprise software rather than an upgrade to existing products.",
        detail: "Bloomberg\u2019s report contrasts the two deployment models and includes analyst reactions on pricing strategy. The summary is based on the accessible excerpt; the full article requires a subscription.",
        href: "https://www.bloomberg.com/technology",
      },
      {
        source: "TechCrunch",
        time: "3 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "A developer-focused breakdown of what the agent frameworks can and cannot do in their current release state.",
        detail: "The piece tests the stated capabilities against real workflow scenarios, noting where automation holds and where human review remains effectively mandatory. It is the most grounded technical account available in the open-access coverage.",
        href: "https://techcrunch.com/",
      },
      {
        source: "The Information",
        time: "5 hrs ago",
        paywall: true,
        accessLevel: "headline-only",
        summary: "Internal documents suggest the companies have been competing on enterprise agent contracts for several months ahead of the public announcements.",
        detail: "This summary is based only on the accessible headline and metadata. The full investigation into pre-announcement competition is behind a subscriber paywall.",
        href: "https://www.theinformation.com/",
      },
    ],
  },

  {
    id: "ai-004",
    topic: "ai",
    label: "04 \u00b7 POLICY",
    headline: "US tightens export controls on advanced AI chips, expanding the restricted country list",
    rundown: "The US Commerce Department announced expanded export restrictions on advanced AI chips, extending the list of countries requiring licences to include several additional markets. The rules target chips capable of training and running large-scale AI models at data-centre scale.",
    rundownP2: "The new controls include a tiered licensing framework that distinguishes between allied nations with established review processes and countries of broader concern. Companies with existing supply agreements have a defined compliance window before the rules take effect.",
    sentiment: [
      "Reaction is sharply divided along national and ideological lines, with US-based commentary largely supportive of the controls as a necessary security measure, and international technology communities more critical of their reach.",
      "Observers in Asia, particularly in countries affected by the expanded list, are expressing frustration about the impact on research collaboration, academic partnerships and independent AI development capacity.",
      "Investor-focused communities express uncertainty, with NVIDIA shareholders debating whether the long-term addressable market reduction outweighs the short-term compliance friction and diplomatic friction with key markets.",
    ],
    why: "Chip controls are now a primary instrument of AI policy, sitting alongside safety regulation and investment screening. Their reach shapes which countries can build competitive model-training infrastructure independently.",
    score: 85,
    market: {
      name: "NVIDIA",
      ticker: "NVDA",
      price: "$138.42",
      day: "-1.64%",
      week: "-0.87%",
      month: "+3.91%",
      return6m: "+22.7%",
      return1y: "+41.3%",
      volume: "214.3M",
      marketCap: "$3.38T",
      pe: "48.6",
      avgVolume: "198.7M",
      eventDate: "25 Jul 2026",
      sinceEvent: "NVIDIA shares fell in the session following the announcement, a pattern consistent with prior export-control expansions. The move occurred during a broader technology sector decline; whether the controls were the primary driver or a contributing factor cannot be established from available information. Longer-term impacts on addressable market size remain subject to significant uncertainty.",
      explanation: "NVIDIA is referenced as the most directly relevant public company given its dominant position in AI chip supply. The figures shown are descriptive snapshots; they do not predict future returns or establish that this event caused the observed price change.",
      points30d: [68, 72, 70, 75, 71, 66, 69, 73, 77, 74, 70, 65, 62],
      points6m:  [38, 42, 45, 43, 48, 52, 55, 50, 58, 62, 60, 65, 68, 72, 70, 75, 71, 66, 69, 65, 62],
      points1y:  [20, 22, 25, 28, 24, 30, 34, 31, 38, 42, 45, 43, 48, 52, 55, 50, 58, 62, 60, 65, 68, 72, 70, 75, 65, 62],
    },
    articles: [
      {
        source: "Reuters",
        time: "1 hr ago",
        paywall: false,
        accessLevel: "full",
        summary: "The Commerce Department\u2019s statement details the expanded list and the compliance timeline for affected companies.",
        detail: "Reuters covers the official announcement and includes early reactions from semiconductor industry groups. It distinguishes the new measures from earlier rounds and notes which product categories are specifically named.",
        href: "https://www.reuters.com/technology/",
      },
      {
        source: "Wall Street Journal",
        time: "2 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "Chip makers are assessing which existing contracts fall under the new rules and how quickly they must act.",
        detail: "The report focuses on corporate compliance teams and their immediate priorities. The summary is based on the accessible excerpt; the full account of affected supply chains is behind a subscriber paywall.",
        href: "https://www.wsj.com/tech",
      },
      {
        source: "Wired",
        time: "4 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "An explainer on how the tiered licensing system works and which country groupings face the strictest limits.",
        detail: "Wired maps the new country tiers against the previous framework, explaining why the intermediary-routing loophole is now closed. It also covers the appeal process for companies seeking case-by-case review.",
        href: "https://www.wired.com/",
      },
    ],
  },

  /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 NUCLEAR ENERGY & SMRS \u2550\u2550\u2550 */
  {
    id: "nuclear-001",
    topic: "nuclear",
    label: "01 \u00b7 NEW BUILD",
    headline: "The UK selects a site and financing model for a new SMR fleet",
    rundown: "The UK government selected a preferred location for the country\u2019s first small modular reactor programme and advanced its regulated-asset financing plan. The decision moves the project from technology competition toward the harder questions of licensing, grid connection and construction risk.",
    rundownP2: "The regulated-asset base model, which allows developers to recover costs from consumers during construction rather than only at completion, is central to the financing plan. Supporters argue it reduces investor risk; critics note it shifts construction-cost uncertainty onto bill payers before a reactor has demonstrated it can be built on schedule.",
    sentiment: [
      "Sentiment in the UK is cautiously optimistic, with public commentary reflecting broad support for energy security while expressing scepticism about delivery timelines and the government\u2019s track record on large infrastructure projects.",
      "Environmental discussion is polarised: some groups welcome nuclear as a low-carbon option, while others question whether SMRs can be built fast enough and cheaply enough to contribute meaningfully to net-zero targets in time.",
      "Local community voices are beginning to emerge alongside national coverage, with concerns about planning processes, employment commitments and long-term waste management appearing in regional forums.",
    ],
    why: "SMRs need repeatable delivery, not just a certified design. A credible first site can create the reference project that determines whether a wider fleet is financeable.",
    score: 86,
    market: {
      name: "Rolls-Royce Holdings",
      ticker: "RR.",
      price: "\u00a38.74",
      day: "+1.12%",
      week: "+3.09%",
      month: "+7.47%",
      return6m: "+21.5%",
      return1y: "+34.2%",
      volume: "31.4M",
      marketCap: "\u00a316.7B",
      pe: "28.4",
      avgVolume: "29.8M",
      eventDate: "25 Jul 2026",
      sinceEvent: "Rolls-Royce shares were among the stronger performers in the FTSE 100 on the day of the announcement. The move occurred during a period of broadly positive sentiment toward UK defence and energy infrastructure stocks. Whether the SMR site decision contributed to the session\u2019s gain, or whether it was incidental to wider sector momentum, cannot be confirmed from available information.",
      explanation: "Rolls-Royce is shown as a relevant public-company reference because its SMR business is part of the UK programme. The market figures are descriptive snapshots only; they do not prove causation or indicate where the price may go next.",
      points30d: [28, 29, 31, 34, 33, 37, 39, 36, 42, 46, 45, 50, 53],
      points6m:  [14, 16, 18, 20, 19, 22, 25, 27, 24, 29, 32, 30, 35, 38, 36, 41, 44, 47, 50, 52, 53],
      points1y:  [8, 10, 12, 9, 14, 17, 15, 20, 22, 19, 25, 28, 26, 31, 33, 30, 36, 39, 37, 42, 44, 47, 50, 52, 53, 53],
    },
    articles: [
      {
        source: "BBC News",
        time: "42 min ago",
        paywall: false,
        accessLevel: "full",
        summary: "The site decision is the clearest signal yet that the UK\u2019s SMR plan is entering a delivery phase.",
        detail: "The piece covers the proposed location, the companies in contention and the government\u2019s stated timeline. It also includes local questions around jobs, planning and long-term waste management.",
        href: "https://www.bbc.com/news/science_and_environment",
      },
      {
        source: "Nuclear Engineering International",
        time: "1 hr ago",
        paywall: false,
        accessLevel: "full",
        summary: "Project developers are now focused on regulatory sequencing and the cost of the first unit.",
        detail: "The specialist view details the licensing route and why a first-of-a-kind reactor carries a different risk profile from later units. It is especially useful for understanding the engineering milestones behind the announcement.",
        href: "https://www.neimagazine.com/",
      },
      {
        source: "The Guardian",
        time: "2 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "Local and climate groups are weighing the programme\u2019s promise against its unresolved delivery questions.",
        detail: "The report places the announcement in the UK\u2019s wider energy-security strategy. It includes competing perspectives on cost, speed, the grid and the role nuclear can play alongside renewables.",
        href: "https://www.theguardian.com/environment/nuclear-power",
      },
    ],
  },

  {
    id: "nuclear-002",
    topic: "nuclear",
    label: "02 \u00b7 SUPPLY CHAIN",
    headline: "France and Japan deepen cooperation on advanced reactor fuel",
    rundown: "French and Japanese nuclear firms signed a cooperation agreement covering fuel-cycle resilience and advanced-reactor research. The announcement links long-term technology work with a near-term effort to diversify specialist industrial capacity.",
    rundownP2: "The two countries have existing bilateral nuclear cooperation agreements, but this memorandum extends the relationship into advanced fuel cycles and next-generation reactor technology. Officials described the effort as part of a broader strategy to reduce dependence on any single enrichment or fabrication supplier.",
    sentiment: [
      "Coverage of this story is largely confined to specialist and policy communities, where sentiment is generally positive about supply-chain diversification as a hedge against geopolitical disruption.",
      "General public engagement with the story is low, consistent with the technical nature of fuel-cycle cooperation agreements and the absence of an immediate consumer-level impact.",
    ],
    why: "Fuel availability, enrichment and component manufacturing are strategic bottlenecks. Cooperation between two established nuclear economies can make new reactor programmes less dependent on a single supplier.",
    score: 73,
    articles: [
      {
        source: "Nikkei Asia",
        time: "3 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "The agreement broadens a bilateral energy relationship into next-generation nuclear supply chains.",
        detail: "Nikkei reports that the partners are looking at fuel-cycle capabilities and research links rather than announcing a single commercial reactor. This summary is based on the accessible excerpt; the full analysis is behind a subscriber paywall.",
        href: "https://asia.nikkei.com/",
      },
      {
        source: "World Nuclear News",
        time: "5 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "An industry briefing lists the named companies and the technical areas covered by the memorandum.",
        detail: "The specialist account provides the clearest list of the workstreams, while noting that the memorandum is not itself a binding construction contract. It also gives context on existing French-Japanese nuclear ties.",
        href: "https://world-nuclear-news.org/",
      },
      {
        source: "Reuters",
        time: "7 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "Officials described the deal as part of a broader push to secure low-carbon energy technology.",
        detail: "The report situates the agreement alongside national energy strategies and geopolitical supply-chain concerns. It does not attach a value or completion date to the cooperation.",
        href: "https://www.reuters.com/business/energy/",
      },
    ],
  },

  {
    id: "nuclear-003",
    topic: "nuclear",
    label: "03 \u00b7 LIFE EXTENSION",
    headline: "Belgium finalises ten-year extension for two nuclear units as phase-out policy reverses",
    rundown: "Belgium reached a final agreement with Engie to extend the operational life of Doel 4 and Tihange 3 by ten years, formally reversing a phase-out commitment the country had maintained for decades. The reactors together supply roughly fifteen per cent of Belgian electricity.",
    rundownP2: "The agreement requires a substantial investment programme to upgrade safety systems and extend the operational licence, with costs shared between the operator and the Belgian state. Regulators must still approve the safety case for each reactor, and that process is expected to take several years before the extended operations can begin.",
    sentiment: [
      "Online discussion in Belgium and across the EU is notably divided, with energy security advocates welcoming the reversal as pragmatic and climate campaigners expressing frustration about the signal it sends to renewable energy investment.",
      "Commentary from Germany, the Netherlands and France is being watched closely, with observers in each country drawing comparisons to their own unresolved energy policy debates and phase-out timelines.",
      "The decision is generating substantive engagement in EU policy circles around whether the bloc\u2019s taxonomy framework for sustainable investment will need to be revisited in light of the reversal.",
    ],
    why: "Belgium is the first EU country to formally reverse a legislated nuclear phase-out. The political and regulatory template may be referenced by other member states weighing similar decisions.",
    score: 80,
    articles: [
      {
        source: "Reuters",
        time: "1 hr ago",
        paywall: false,
        accessLevel: "full",
        summary: "The Belgian government and Engie confirmed the extension agreement after months of negotiation on cost-sharing terms.",
        detail: "Reuters covers the cost-sharing structure, the regulatory steps still required and the political context of a country that had committed to phasing out nuclear energy. It is the most comprehensive open-access account of the terms.",
        href: "https://www.reuters.com/business/energy/",
      },
      {
        source: "Politico Europe",
        time: "2 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "The decision is already being interpreted in Brussels as a signal about the direction of EU energy policy.",
        detail: "Politico examines how the Belgian reversal interacts with EU taxonomy debates and the positions of other member states. This summary is based on the accessible excerpt; the full policy analysis requires a subscription.",
        href: "https://www.politico.eu/section/energy/",
      },
      {
        source: "Euractiv",
        time: "4 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "A timeline of how Belgium arrived at this decision and what it means for the phase-out schedules of neighbouring countries.",
        detail: "Euractiv traces the policy journey from the original phase-out law through the energy crisis to the current agreement. It includes reactions from German, Dutch and French policymakers, each of whom is managing different versions of the same question.",
        href: "https://www.euractiv.com/",
      },
    ],
  },

  {
    id: "nuclear-004",
    topic: "nuclear",
    label: "04 \u00b7 FUSION",
    headline: "Commonwealth Fusion breaks plasma confinement record at SPARC facility",
    rundown: "Commonwealth Fusion Systems reported a new plasma confinement duration record at its SPARC facility, using high-temperature superconducting magnets operating at full design specification. The milestone is a step toward demonstrating that the compact tokamak approach can sustain conditions required for net energy gain.",
    rundownP2: "The record does not demonstrate net energy output, which remains a further engineering challenge. The company described the result as validation that their magnet technology performs to specification at scale, reducing one key uncertainty in the path toward a demonstration plant. A commercial reactor remains at least a decade away on the most optimistic timelines.",
    sentiment: [
      "Science and technology communities are reacting with genuine enthusiasm, describing the milestone as one of the more credible signals of progress in private fusion this year and a meaningful validation of the high-field tokamak approach.",
      "More sceptical voices, common in energy research forums, caution against extrapolating from a confinement record to commercial viability, citing decades of fusion optimism that has not yet translated to grid-connected power.",
      "Investor communities are watching the result as a data point for the broader private fusion funding landscape, though opinions on the investment thesis remain divided between those who see an accelerating timeline and those who do not.",
    ],
    why: "Commercial fusion remains years away, but each technical milestone either tightens or extends the credible delivery window. Progress on confinement duration at design conditions is one of the clearest signals available from current-generation pilot facilities.",
    score: 71,
    articles: [
      {
        source: "Nature",
        time: "4 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "The peer-reviewed record result is described as significant for the high-field tokamak approach but not yet a demonstration of net energy gain.",
        detail: "The Nature abstract situates the result within the broader fusion research landscape. This summary is based on the accessible abstract and metadata; the full paper requires institutional or subscriber access.",
        href: "https://www.nature.com/",
      },
      {
        source: "MIT News",
        time: "5 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "MIT researchers involved in the project describe the significance of sustained plasma at full magnet design parameters.",
        detail: "The MIT release is the most detailed open-access technical account, explaining the relationship between confinement time, plasma density and the conditions needed for net energy production. It avoids overstating what the milestone means for a commercial timeline.",
        href: "https://news.mit.edu/",
      },
      {
        source: "Financial Times",
        time: "6 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "Investors in Commonwealth Fusion and rival fusion companies are watching the result as a signal for the sector\u2019s credibility.",
        detail: "The FT report covers the investor reaction and frames the milestone in the context of the broader private fusion funding landscape. This summary is based on the accessible excerpt.",
        href: "https://www.ft.com/",
      },
    ],
  },

  /* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 EUROPEAN FOOTBALL \u2550\u2550\u2550\u2550 */
  {
    id: "football-001",
    topic: "football",
    label: "01 \u00b7 CHAMPIONS LEAGUE",
    headline: "Inter\u2019s late win reshapes the Champions League knockout picture",
    rundown: "Inter Milan scored in the final minutes to beat Atl\u00e9tico Madrid and move into a stronger position in the Champions League knockout race. The result leaves the tie finely balanced ahead of the return fixture and changes the likely paths through the draw.",
    rundownP2: "Inter\u2019s winning goal came from a counter-attack in the 88th minute, capitalising on Atl\u00e9tico\u2019s defensive line pushing higher in search of an equaliser. The result means Atl\u00e9tico must score at least once in Madrid to have any chance of progressing, which changes the likely tactical shape of the second leg considerably.",
    sentiment: [
      "Fan reaction in Italy is jubilant, with Inter supporters describing the late winner as a defining moment in the club\u2019s season and generating significant engagement across Italian football forums and supporter communities.",
      "Atl\u00e9tico supporter communities are frustrated but largely focused on the return leg, with debate centring on the manager\u2019s tactical decisions in the closing stages and whether the defensive line was set too high.",
      "Neutral commentators are highly engaged by the tactical implications, with discussion of how both teams will approach the second leg dominating football analysis forums and podcasts ahead of the return fixture.",
    ],
    why: "One goal changes the tactical incentives for both legs: Inter can protect a lead, while Atl\u00e9tico must create more without exposing its defence to transition attacks.",
    score: 88,
    articles: [
      {
        source: "The Athletic",
        time: "26 min ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "A tactical breakdown of how Inter\u2019s midfield overload created the decisive late opening.",
        detail: "The analysis follows the spacing around the half-spaces and the substitutions that changed the game\u2019s final phase. This summary is based on the accessible excerpt; the full tactical analysis is behind a subscriber paywall.",
        href: "https://www.nytimes.com/athletic/football/",
      },
      {
        source: "UEFA.com",
        time: "38 min ago",
        paywall: false,
        accessLevel: "full",
        summary: "The official match report, line-ups and post-match comments from both managers.",
        detail: "UEFA\u2019s report provides the verified score, scorers, disciplinary record and quotes. It is the cleanest reference for the competition state before the second leg.",
        href: "https://www.uefa.com/uefachampionsleague/",
      },
      {
        source: "Marca",
        time: "1 hr ago",
        paywall: false,
        accessLevel: "full",
        summary: "Spanish coverage focuses on Atl\u00e9tico\u2019s missed chances and the pressure now on the return leg.",
        detail: "The report reflects the local reaction and highlights the team\u2019s finishing problem. Its framing is more emotional than the official account, so it is best read alongside the match data.",
        href: "https://www.marca.com/en/football.html",
      },
    ],
  },

  {
    id: "football-002",
    topic: "football",
    label: "02 \u00b7 PREMIER LEAGUE",
    headline: "The title race tightens after a weekend of dropped points",
    rundown: "A draw between two leading Premier League sides compressed the gap at the top of the table, while a third contender won away from home. With the schedule entering a dense run of fixtures, small swings in availability and finishing could decide the order.",
    rundownP2: "The draw involved two clubs who had been expected to take maximum points from the fixture, making it a double drop rather than a single one. Meanwhile, the away win by the third contender was achieved without several first-choice players, raising further questions about which squad has the depth to sustain a run through the remaining matches.",
    sentiment: [
      "Fan communities for all three leading clubs are reacting with a mixture of optimism and anxiety, with online discourse reflecting the uncertainty of a title race that has compressed from a four-point gap to a single point in 48 hours.",
      "Pundit commentary is generating significant engagement, particularly around the question of which squad has the depth to maintain performance through the remaining fixtures and a congested calendar.",
      "Neutral supporters appear to welcome the heightened competition, with many describing this as one of the more compelling final stretches of recent Premier League seasons and expressing hope the race goes to the final day.",
    ],
    why: "The table is now a race of margins. Congestion makes rotation and squad depth more consequential than any single headline result.",
    score: 76,
    articles: [
      {
        source: "BBC Sport",
        time: "1 hr ago",
        paywall: false,
        accessLevel: "full",
        summary: "The updated table and fixture run-in show just how little separates the leading clubs.",
        detail: "BBC\u2019s report combines the weekend results with the remaining fixtures and points gap. It avoids treating the table as settled, noting the different difficulty of each club\u2019s run-in.",
        href: "https://www.bbc.com/sport/football/premier-league",
      },
      {
        source: "The Guardian",
        time: "2 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "Managers are balancing title ambition with the physical cost of a crowded calendar.",
        detail: "The analysis focuses on rotation, injury management and how teams change their pressing intensity late in a season. It includes manager comments but separates them from the underlying results.",
        href: "https://www.theguardian.com/football/premierleague",
      },
      {
        source: "Sky Sports",
        time: "3 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "A concise review of the weekend\u2019s turning points and the next fixtures to watch.",
        detail: "Sky\u2019s roundup provides the practical schedule view, including kickoff changes and team news that may influence the next round. It is a useful quick read rather than a full tactical analysis.",
        href: "https://www.skysports.com/football",
      },
    ],
  },

  {
    id: "football-003",
    topic: "football",
    label: "03 \u00b7 TRANSFERS",
    headline: "Real Madrid agree terms for marquee Premier League signing in \u20ac120m deal",
    rundown: "Real Madrid reached agreement in principle with a Premier League club for one of the transfer window\u2019s highest-profile movements. A fee in the region of \u20ac120 million has been reported, which would rank among the largest deals between the two leagues in several years.",
    rundownP2: "Personal terms between the player and Real Madrid are understood to be agreed, with the deal subject to a medical and finalisation of the fee structure. The transfer is expected to complete before the summer deadline, though neither club had made an official statement at the time of publication.",
    sentiment: [
      "Reaction from Real Madrid\u2019s global supporter base is overwhelmingly positive, with the fee widely interpreted as a statement of intent rather than an overpay, and considerable enthusiasm about the player\u2019s fit in the current squad.",
      "Premier League fan communities are divided: supporters of the selling club are expressing frustration and disappointment, while neutral observers are debating the transfer\u2019s long-term implications for player pricing across the two leagues.",
      "Transfer market commentators are focused on the benchmark implications, noting that the fee is likely to influence how other clubs price comparable players for the remainder of the summer window and into future windows.",
    ],
    why: "High-value transfers between the Premier League and La Liga are a proxy for relative financial power and sporting ambition. The fee level, if confirmed, will reset market benchmarks and influence how other clubs price similar players for the remainder of the window.",
    score: 82,
    articles: [
      {
        source: "Fabrizio Romano",
        time: "45 min ago",
        paywall: false,
        accessLevel: "full",
        summary: "Here we go confirmed: Real Madrid have reached full agreement with the Premier League club on fee and personal terms.",
        detail: "Romano\u2019s report is the transfer market\u2019s standard-bearer for confirmation. It names the fee structure, the contract length and the medical timeline. It is the primary reference for whether the deal is confirmed.",
        href: "https://twitter.com/FabrizioRomano",
      },
      {
        source: "The Athletic",
        time: "1 hr ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "The move is described as transformative for Real Madrid\u2019s midfield for the next five years.",
        detail: "The Athletic\u2019s tactical context explains how the player fits the manager\u2019s system and what it means for the players currently at the club. This summary is based on the accessible excerpt.",
        href: "https://www.nytimes.com/athletic/football/",
      },
      {
        source: "Marca",
        time: "2 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "Spanish media had been tracking this deal for weeks and describe the conclusion as expected rather than surprising.",
        detail: "Marca\u2019s account covers the Madrid side of the negotiations, the president\u2019s involvement and how the fee compares with the club\u2019s recent transfer record. It is useful for understanding how the deal is framed domestically.",
        href: "https://www.marca.com/en/football/real-madrid.html",
      },
    ],
  },

  {
    id: "football-004",
    topic: "football",
    label: "04 \u00b7 EUROPA LEAGUE",
    headline: "Arsenal and PSG advance to Europa League semi-finals after contrasting quarter-final nights",
    rundown: "Arsenal and Paris Saint-Germain both progressed to the Europa League semi-finals following their respective quarter-final second legs. Arsenal advanced comfortably on aggregate while PSG needed a dramatic late goal to overturn a first-leg deficit and progress on away goals.",
    rundownP2: "The draw for the semi-finals will take place in the coming days. A potential Arsenal-PSG final has emerged as a widely discussed scenario among commentators, though both clubs face credible opponents before any such meeting. Coverage has already begun mapping the tactical matchups that such a final would produce.",
    sentiment: [
      "Arsenal supporters are reacting with significant enthusiasm, with online discussion focused on whether the club can sustain momentum across two competitions simultaneously and whether squad depth is sufficient for the run-in.",
      "PSG\u2019s dramatic late progression is generating strong commentary in France, with the comeback widely described as evidence of renewed belief within the squad under the current manager and a turning point in their European campaign.",
      "A hypothetical Arsenal-PSG final is already attracting wide discussion across European football communities, described by many as the most commercially and competitively significant possible outcome for the competition.",
    ],
    why: "Europa League qualification carries significant financial and sporting weight for clubs not in the Champions League. An Arsenal-PSG final would draw the kind of global audience that resets commercial expectations for the competition and influences next season\u2019s broadcasting negotiations.",
    score: 74,
    articles: [
      {
        source: "UEFA.com",
        time: "2 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "Official match reports for both quarter-final second legs, including scorers, bookings and post-match quotes.",
        detail: "UEFA\u2019s reports are the primary factual reference for the results, line-ups and competition state. They include both managers\u2019 assessments of the ties and confirm the semi-final participants.",
        href: "https://www.uefa.com/uefaeuropaleague/",
      },
      {
        source: "BBC Sport",
        time: "3 hrs ago",
        paywall: false,
        accessLevel: "full",
        summary: "The semi-final picture and what the draw means for Arsenal\u2019s ambitions in two competitions simultaneously.",
        detail: "BBC\u2019s analysis concentrates on Arsenal\u2019s schedule density and whether their squad can sustain European and domestic demands through the run-in. It is the most balanced account of the competing pressures.",
        href: "https://www.bbc.com/sport/football/europa-league",
      },
      {
        source: "L\u2019\u00c9quipe",
        time: "4 hrs ago",
        paywall: true,
        accessLevel: "excerpt",
        summary: "French coverage describes PSG\u2019s comeback as a statement of the squad\u2019s mentality under their current manager.",
        detail: "L\u2019\u00c9quipe\u2019s framing emphasises the character shown by PSG rather than the tactical detail. This summary is based on the accessible excerpt; the full piece is behind a subscriber paywall.",
        href: "https://www.lequipe.fr/Football/",
      },
    ],
  },
];
