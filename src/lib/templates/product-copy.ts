import type { LucidPack } from '@contracts/lucid-pack'
import type { TemplateCatalogEntry } from '@contracts/template'
import type { TemplateLibraryItem } from './library'

export interface TemplateProductStory {
  eyebrow: string
  promise: string
  bestFor: string
  timeToValue: string
  firstAction: string
  expectedOutput: string
  onboardingSteps: Array<{
    title: string
    description: string
    action: string
  }>
  proof: string[]
  examplePrompts: string[]
  alerts: string[]
}

export interface TemplateCategoryStory {
  key: string
  label: string
  description: string
  examples: string
}

export interface TemplateCombinationSuggestion {
  slug: string
  name: string
  type: TemplateLibraryItem['type']
  reason: string
}

export const FIRST_UTILITY_TEMPLATE_SLUGS = [
  'web3-whale-watchtower',
  'web3-token-war-room',
  'web3-portfolio-risk-agent',
  'web3-prediction-market-alpha-desk',
  'web3-smart-wallet-copy-desk',
]

const CATEGORY_STORIES: TemplateCategoryStory[] = [
  {
    key: 'web3',
    label: 'Markets and wallets',
    description: 'Track whales, tokens, prediction markets, portfolios, and on-chain risk.',
    examples: 'Whale alerts, token risk, portfolio exposure',
  },
  {
    key: 'sales',
    label: 'Revenue',
    description: 'Find accounts, qualify leads, write outreach, and keep the pipeline moving.',
    examples: 'Prospecting, enrichment, follow-up',
  },
  {
    key: 'support',
    label: 'Customer ops',
    description: 'Answer customers, triage tickets, summarize churn risk, and escalate clearly.',
    examples: 'Tier 1 support, churn radar, NPS',
  },
  {
    key: 'marketing',
    label: 'Growth and content',
    description: 'Plan campaigns, monitor brand, produce content, and report performance.',
    examples: 'Social posts, brand monitor, campaign brief',
  },
  {
    key: 'operations',
    label: 'Operating rhythm',
    description: 'Turn scattered inputs into briefings, decisions, workflows, and proof.',
    examples: 'CEO brief, competitive intel, contract review',
  },
]

const WEB3_WHALE_STORY: TemplateProductStory = {
  eyebrow: 'Best first Web3 utility',
  promise: 'Know when important wallets move before the timeline catches up.',
  bestFor: 'Founders, funds, traders, communities, and research teams watching wallets or token narratives.',
  timeToValue: '5 minutes after you add a watchlist or ask a one-off question.',
  firstAction: 'Paste wallets or ask “what changed?” Lucid produces an evidence-backed movement brief.',
  expectedOutput: 'Summary, wallet movements, token context, risk flags, evidence links, and next actions.',
  onboardingSteps: [
    {
      title: 'Add wallets',
      description: 'Paste whale wallets, fund wallets, exchange wallets, or your own watchlist into the Whale Watchlist source.',
      action: 'Start with 3-10 wallets you already care about.',
    },
    {
      title: 'Choose alert channels',
      description: 'Use Slack, Discord, Telegram, or Web. The pack installs a channel command so the same brief can run where the team already watches markets.',
      action: 'Route urgent alerts to the fastest channel.',
    },
    {
      title: 'Run first brief',
      description: 'Ask for a 24h movement brief. Lucid should answer with signal, confidence, evidence, and what to inspect next.',
      action: 'Use the first prompt below.',
    },
    {
      title: 'See Mission Control proof',
      description: 'Open Mission Control after the run to inspect inputs, evidence, status, and channel delivery.',
      action: 'Validate it before trusting alerts.',
    },
  ],
  proof: [
    'Mission Control run with wallet/token evidence',
    'Risk and confidence per finding',
    'Channel-ready alert summary for Slack, Discord, Telegram, or Web',
  ],
  examplePrompts: [
    'Track these wallets and tell me if anything material moved in the last 24h.',
    'Explain this whale transfer like I am deciding whether to investigate deeper.',
    'Which watched wallet movement is most likely to become a narrative today?',
  ],
  alerts: [
    'Large exchange inflow or outflow',
    'New token accumulation by a watched wallet',
    'Risky movement with weak liquidity or suspicious token context',
  ],
}

const DEFAULT_STORY: TemplateProductStory = {
  eyebrow: 'Reusable agent utility',
  promise: 'Start with a complete operating setup instead of a blank prompt.',
  bestFor: 'Teams that want a working agent or team with sane defaults, memory, workflows, and proof.',
  timeToValue: 'A few minutes after install.',
  firstAction: 'Preview what Lucid will create, install it, then run the first task from the template detail.',
  expectedOutput: 'Summary, findings, evidence, risks, and next actions.',
  onboardingSteps: [
    {
      title: 'Preview resources',
      description: 'Check what agents, commands, workflows, policies, and knowledge sources Lucid will manage.',
      action: 'Install only when setup looks right.',
    },
    {
      title: 'Add the first input',
      description: 'Give the template the smallest useful watchlist, target, account, source, or policy.',
      action: 'Start narrow; expand once output is trusted.',
    },
    {
      title: 'Run first task',
      description: 'Use the starter prompt and verify the answer shape before enabling repeat usage.',
      action: 'Expect Summary, Findings, Evidence, Risks, Next actions.',
    },
    {
      title: 'Check proof',
      description: 'Mission Control should show resources, run evidence, channel status, and any setup gap.',
      action: 'Reconcile if anything drifted.',
    },
  ],
  proof: [
    'Install preview before changes',
    'Managed resources and reconcile health',
    'Mission Control evidence after the first run',
  ],
  examplePrompts: [
    'Run the first workflow and show me the evidence.',
    'Summarize what this template can automate for my workspace.',
    'What should I configure first to get value today?',
  ],
  alerts: [
    'Setup is incomplete',
    'A managed resource drifted from the template',
    'A recurring workflow needs attention',
  ],
}

export function getTemplateProductStory(item: TemplateLibraryItem | TemplateCatalogEntry | LucidPack): TemplateProductStory {
  const slug = readSlug(item)
  if (slug === 'web3-whale-watchtower') return WEB3_WHALE_STORY
  if (slug === 'web3-token-war-room') {
    return {
      ...DEFAULT_STORY,
      eyebrow: 'Token intelligence room',
      promise: 'Watch price, liquidity, holders, and risk in one operating view.',
      bestFor: 'Token teams, analysts, investors, and communities watching a token narrative.',
      timeToValue: '5 minutes after you add token contracts or tickers.',
      firstAction: 'Add a token watchlist or ask for a token risk brief.',
      expectedOutput: 'Token health, liquidity shifts, holder changes, risk flags, and next actions.',
      onboardingSteps: [
        {
          title: 'Add tokens',
          description: 'Paste contract addresses, tickers, or canonical token links into the Token Watchlist.',
          action: 'Start with one token plus two competitors.',
        },
        {
          title: 'Set risk lens',
          description: 'Decide whether you care most about liquidity, holders, narrative, exchange flow, or launch health.',
          action: 'Tell Lucid what “bad” looks like for this token.',
        },
        {
          title: 'Run war-room brief',
          description: 'Generate a token brief that separates market movement from structural risk.',
          action: 'Use the first prompt below.',
        },
        {
          title: 'Verify evidence',
          description: 'Mission Control should show the source signals behind each risk flag.',
          action: 'Keep only the alerts you would act on.',
        },
      ],
      examplePrompts: [
        'Watch this token and explain the top three risks today.',
        'Summarize holder and liquidity changes that matter.',
        'Give me a token war-room brief with evidence and confidence.',
      ],
      alerts: [
        'Liquidity drop or pool imbalance',
        'Holder concentration change',
        'Narrative spike without matching liquidity depth',
      ],
    }
  }
  if (slug === 'web3-portfolio-risk-agent') {
    return {
      ...DEFAULT_STORY,
      eyebrow: 'Portfolio risk radar',
      promise: 'Turn wallet exposure into a risk brief your team can actually use.',
      bestFor: 'Funds, treasuries, founders, and operators monitoring on-chain exposure.',
      timeToValue: '10 minutes after you add wallets and a basic risk policy.',
      firstAction: 'Add portfolio wallets, set the risk lens, then ask for the biggest avoidable risk.',
      expectedOutput: 'Exposure map, concentration risk, liquidity risk, drawdown watch, and action-ready next steps.',
      onboardingSteps: [
        {
          title: 'Add portfolio wallets',
          description: 'Register treasury, trading, LP, or monitored wallets as read-only inputs.',
          action: 'Never add private keys; this template is read-only.',
        },
        {
          title: 'Set risk policy',
          description: 'Define max concentration, illiquid exposure, chain exposure, or tokens to watch closely.',
          action: 'Start with 3 simple thresholds.',
        },
        {
          title: 'Run risk review',
          description: 'Ask Lucid to rank risks by materiality, not noise.',
          action: 'Use the first prompt below.',
        },
        {
          title: 'Review proof',
          description: 'Mission Control should show wallet evidence and why each risk was prioritized.',
          action: 'Schedule weekly only after the first review feels useful.',
        },
      ],
      proof: [
        'Wallet exposure and source evidence',
        'Risk policy used for scoring',
        'Mission Control trail for every flagged exposure',
      ],
      examplePrompts: [
        'Review these wallets and tell me the biggest risk I should care about this week.',
        'Which exposure is most fragile if liquidity dries up?',
        'Give me a portfolio risk memo with evidence, confidence, and no trade hype.',
      ],
      alerts: [
        'Concentration above policy',
        'Illiquid exposure changed materially',
        'Watched token risk or holder profile deteriorated',
      ],
    }
  }
  if (slug === 'web3-prediction-market-alpha-desk') {
    return {
      ...DEFAULT_STORY,
      eyebrow: 'Prediction market signal desk',
      promise: 'Catch probability moves and catalysts before they become consensus.',
      bestFor: 'Research teams, traders, founders, and communities watching narrative markets.',
      timeToValue: '10 minutes after adding markets and catalysts.',
      firstAction: 'Add markets, map likely catalysts, and ask what probability move is most interesting.',
      expectedOutput: 'Market move summary, catalyst map, liquidity caveats, evidence, and watchlist actions.',
      onboardingSteps: [
        {
          title: 'Add markets',
          description: 'Paste market URLs, topics, or watchlist names into the Prediction Market Watchlist.',
          action: 'Track fewer markets with better hypotheses.',
        },
        {
          title: 'Add catalysts',
          description: 'Record event dates, announcements, elections, unlocks, or earnings that could move probability.',
          action: 'Tie every market to a catalyst.',
        },
        {
          title: 'Run alpha brief',
          description: 'Ask for probability moves, liquidity caveats, and where the market may be wrong.',
          action: 'Use the first prompt below.',
        },
        {
          title: 'Verify evidence',
          description: 'Mission Control should show probability movement and catalyst evidence separately.',
          action: 'Do not automate trades from this template.',
        },
      ],
      proof: [
        'Probability movement and timestamped evidence',
        'Catalyst mapping and confidence',
        'Approval policy for any automation',
      ],
      examplePrompts: [
        'Which watched prediction market moved most today and why might it matter?',
        'Map these markets to upcoming catalysts and tell me where to watch next.',
        'Give me an alpha desk brief with probability changes, liquidity caveats, and evidence.',
      ],
      alerts: [
        'Probability moved beyond threshold',
        'Catalyst date is approaching',
        'Market liquidity changed enough to affect confidence',
      ],
    }
  }
  if (slug === 'web3-smart-wallet-copy-desk') {
    return {
      ...DEFAULT_STORY,
      eyebrow: 'Smart-wallet copy desk',
      promise: 'Draft copy-trade plans from smart-wallet behavior without letting automation run wild.',
      bestFor: 'Advanced operators watching smart wallets but wanting approval-first execution.',
      timeToValue: '10 minutes after adding smart-wallet leads and execution policy.',
      firstAction: 'Add smart wallets, request a copy plan, and keep execution approval-only.',
      expectedOutput: 'Wallet thesis, entry context, sizing draft, risks, approval state, and evidence.',
      onboardingSteps: [
        {
          title: 'Add smart wallets',
          description: 'Paste wallets you believe are skilled and explain why they matter.',
          action: 'Track behavior before copying anything.',
        },
        {
          title: 'Set approval policy',
          description: 'Keep execution disabled or approval-only until the template proves signal quality.',
          action: 'Require human approval for every action.',
        },
        {
          title: 'Draft first copy plan',
          description: 'Ask Lucid for a plan with thesis, sizing, stop conditions, and evidence.',
          action: 'Use the first prompt below.',
        },
        {
          title: 'Inspect proof',
          description: 'Mission Control should show why the smart-wallet behavior is meaningful.',
          action: 'Reject low-confidence plans by default.',
        },
      ],
      proof: [
        'Source wallet behavior and timing',
        'Approval policy status',
        'Risk and confidence per suggested action',
      ],
      examplePrompts: [
        'Analyze this smart wallet and draft a copy plan without executing.',
        'Which wallet in my watchlist has the cleanest recent signal?',
        'Give me a copy-desk plan with thesis, sizing, risks, and approval status.',
      ],
      alerts: [
        'Smart wallet entered a watched token',
        'Plan requires approval before execution',
        'Signal quality dropped below policy',
      ],
    }
  }
  if (slug === 'web3-intelligence-suite') {
    return {
      ...DEFAULT_STORY,
      eyebrow: 'Composable Web3 command center',
      promise: 'Combine wallet, token, prediction-market, portfolio, and copy-trading intelligence.',
      bestFor: 'Teams that want one operating room for Web3 monitoring.',
      firstAction: 'Install the suite, then add watchlists and channel alerts.',
      expectedOutput: 'Cross-market briefing, evidence, risks, alerts, and recommended follow-up.',
    }
  }
  return DEFAULT_STORY
}

export function getTemplateCategoryStories(items: TemplateLibraryItem[]): TemplateCategoryStory[] {
  const categories = new Set(items.map((item) => normalizeCategory(item.category)))
  return CATEGORY_STORIES.filter((story) => categories.has(story.key) || story.key === 'web3')
}

export function getBestFirstUtilities(items: TemplateLibraryItem[], limit = 5): TemplateLibraryItem[] {
  const bySlug = new Map(items.map((item) => [item.slug, item]))
  const preferred = FIRST_UTILITY_TEMPLATE_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((item): item is TemplateLibraryItem => Boolean(item))
  const fallback = items.filter((item) => !FIRST_UTILITY_TEMPLATE_SLUGS.includes(item.slug))
  return [...preferred, ...fallback].slice(0, limit)
}

export function getCompatibleTemplateSuggestions(
  item: TemplateLibraryItem | LucidPack,
  items: TemplateLibraryItem[],
  limit = 3,
): TemplateCombinationSuggestion[] {
  const slug = readSlug(item)
  const explicit = explicitCombinationSlugs(slug)
  const bySlug = new Map(items.map((candidate) => [candidate.slug, candidate]))
  const suggestions: TemplateCombinationSuggestion[] = explicit
    .map(({ slug: candidateSlug, reason }) => {
      const candidate = bySlug.get(candidateSlug)
      if (!candidate) return null
      return { slug: candidate.slug, name: candidate.name, type: candidate.type, reason }
    })
    .filter((candidate): candidate is TemplateCombinationSuggestion => Boolean(candidate))

  if (suggestions.length >= limit) return suggestions.slice(0, limit)

  const category = normalizeCategory(readCategory(item))
  const tags = new Set(readTags(item).map((tag) => tag.toLowerCase()))
  for (const candidate of items) {
    if (candidate.slug === slug || suggestions.some((suggestion) => suggestion.slug === candidate.slug)) continue
    const candidateTags = candidate.tags.map((tag) => tag.toLowerCase())
    const tagOverlap = candidateTags.some((tag) => tags.has(tag))
    const categoryMatch = normalizeCategory(candidate.category) === category
    if (!tagOverlap && !categoryMatch) continue
    suggestions.push({
      slug: candidate.slug,
      name: candidate.name,
      type: candidate.type,
      reason: categoryMatch
        ? `Adds another ${category || 'related'} operating layer without changing the current setup.`
        : 'Shares tags or capabilities with this template.',
    })
    if (suggestions.length >= limit) break
  }

  return suggestions
}

export function normalizeCategory(category: string): string {
  const normalized = category.toLowerCase().replace(/[-_]+/g, ' ')
  if (normalized.includes('web3')) return 'web3'
  if (/(sales|prospect|revenue)/.test(normalized)) return 'sales'
  if (/(support|success|nps|churn)/.test(normalized)) return 'support'
  if (/(marketing|content|social|brand|growth)/.test(normalized)) return 'marketing'
  if (/(ops|operation|strategy|research|finance|legal|executive)/.test(normalized)) return 'operations'
  return normalized
}

function explicitCombinationSlugs(slug: string): Array<{ slug: string; reason: string }> {
  if (slug === 'web3-whale-watchtower') {
    return [
      { slug: 'web3-token-war-room', reason: 'Add token liquidity, holder, and risk context to whale movements.' },
      { slug: 'web3-portfolio-risk-agent', reason: 'Translate whale signals into portfolio exposure and risk review.' },
      { slug: 'web3-prediction-market-alpha-desk', reason: 'Connect wallet movement to market catalysts and probability shifts.' },
    ]
  }
  if (slug === 'web3-token-war-room') {
    return [
      { slug: 'web3-whale-watchtower', reason: 'See which wallets are driving token movement.' },
      { slug: 'web3-intelligence-suite', reason: 'Upgrade from a single token room to a full Web3 command center.' },
    ]
  }
  if (slug === 'prospect-intelligence') {
    return [
      { slug: 'sales-assistant', reason: 'Turn account research into outbound and follow-up execution.' },
      { slug: 'competitive-intel', reason: 'Add competitor signals to every account brief.' },
    ]
  }
  return []
}

function readSlug(item: TemplateLibraryItem | TemplateCatalogEntry | LucidPack): string {
  if ('slug' in item) return item.slug
  return item.packKey
}

function readCategory(item: TemplateLibraryItem | LucidPack): string {
  if ('category' in item) return item.category
  const family = item.manifest.metadata?.template_family
  return typeof family === 'string' ? family : 'capability'
}

function readTags(item: TemplateLibraryItem | LucidPack): string[] {
  if ('tags' in item) return item.tags
  const tags = item.manifest.metadata?.tags
  const compositionTags = item.manifest.composition?.tags ?? []
  return [
    ...(Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : []),
    ...compositionTags,
  ]
}
