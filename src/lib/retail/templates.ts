/**
 * Retail funnel — the 10 consumer templates.
 *
 * Source of truth for the landing gallery and the 3-question wizard.
 * Lives in code (not the DB) so cleanup is `rm src/lib/retail/templates.ts`.
 *
 * Order matters: this is the order shown on the landing page gallery.
 */

import type { RetailTemplate } from './types'

export const RETAIL_TEMPLATES: readonly RetailTemplate[] = [
  {
    slug: 'personal-research-assistant',
    name: 'Personal research assistant',
    tagline: 'Answers questions, finds sources, summarizes anything.',
    description:
      'A general-purpose researcher that browses the web, reads articles, and gives you sourced answers. Good first agent if you have no specific use case.',
    audience: 'generic',
    defaultChannel: 'telegram',
    soulPreset: 'expert',
    preselectedSkills: ['lucid-veille'],
    samplePrompts: [
      'Summarize the latest news on AI regulation in the EU.',
      'Find me three sources comparing Vercel and Cloudflare Workers.',
      'What happened in tech this week? Cite your sources.',
    ],
    monthlyCostCapUsd: 5,
  },
  {
    slug: 'customer-support-agent',
    name: 'Customer support agent',
    tagline: 'Handles common support questions on your website.',
    description:
      'Answers FAQs, drafts polite replies, escalates the hard ones. Drops into a web widget on your site in minutes.',
    audience: 'generic',
    defaultChannel: 'web',
    soulPreset: 'friendly',
    preselectedSkills: ['lucid-feedback'],
    samplePrompts: [
      'How do I reset my password?',
      'Where is my order #1234?',
      'Can I get a refund? I changed my mind.',
    ],
    monthlyCostCapUsd: 20,
  },
  {
    slug: 'sales-qualifier',
    name: 'Sales qualifier',
    tagline: 'Qualifies inbound leads in Slack, books meetings.',
    description:
      'Reads inbound leads, asks qualifying questions, and drops a calendar link when the fit is right. Slack-native.',
    audience: 'generic',
    defaultChannel: 'slack',
    soulPreset: 'professional',
    preselectedSkills: ['lucid-prospect', 'lucid-meet'],
    samplePrompts: [
      'New lead from the contact form: Acme Corp, 200 employees, looking for AI tooling.',
      "Qualify this lead: company size, budget, timeline.",
      'Book a 30-min intro call with sarah@acme.com next Tuesday.',
    ],
    monthlyCostCapUsd: 30,
  },
  {
    slug: 'personal-finance-coach',
    name: 'Personal finance coach',
    tagline: 'Explains money. No jargon, no judgement.',
    description:
      'Helps you think about budgets, savings, and basic investing. Read-only — never moves money. Good for someone learning.',
    audience: 'generic',
    defaultChannel: 'telegram',
    soulPreset: 'friendly',
    preselectedSkills: ['lucid-veille'],
    samplePrompts: [
      'Explain index funds like I\u2019m 12.',
      'I have $500 left at the end of each month. What should I do with it?',
      'What\u2019s the difference between a Roth IRA and a 401k?',
    ],
    monthlyCostCapUsd: 5,
  },
  {
    slug: 'hr-policy-bot',
    name: 'HR policy bot',
    tagline: 'Answers policy questions in Slack so HR doesn\u2019t have to.',
    description:
      'Reads your handbook and answers questions about PTO, benefits, and policies. Knows when to escalate to a human.',
    audience: 'generic',
    defaultChannel: 'slack',
    soulPreset: 'professional',
    preselectedSkills: [],
    samplePrompts: [
      'How many PTO days do I get?',
      'What\u2019s our parental leave policy?',
      'Can I expense a co-working day?',
    ],
    monthlyCostCapUsd: 15,
  },
  {
    slug: 'crypto-portfolio-companion',
    name: 'Crypto portfolio companion',
    tagline: 'Tracks your wallet, explains your positions.',
    description:
      'Reads your on-chain portfolio and gives you plain-English updates. Read-only by default — no signing, no trades.',
    audience: 'crypto',
    defaultChannel: 'telegram',
    soulPreset: 'concise',
    preselectedSkills: [],
    samplePrompts: [
      'What\u2019s in my wallet right now?',
      'How did my portfolio perform this week?',
      'Which token in my wallet has the highest 24h move?',
    ],
    monthlyCostCapUsd: 10,
  },
  {
    slug: 'trading-copilot',
    name: 'Trading copilot',
    tagline: 'Suggests trades. Approval required before execution.',
    description:
      'Watches markets, proposes entries and exits, and asks for your approval before placing orders. Requires explicit policy grant for execution.',
    audience: 'crypto',
    defaultChannel: 'telegram',
    soulPreset: 'expert',
    preselectedSkills: [],
    samplePrompts: [
      'What\u2019s a reasonable entry on SOL right now?',
      'Should I take profit on my HYPE position?',
      'Set up a stop loss at -5% for my open positions.',
    ],
    monthlyCostCapUsd: 25,
  },
  {
    slug: 'predictions-watcher',
    name: 'Predictions watcher',
    tagline: 'Tracks Polymarket odds and pings you on big moves.',
    description:
      'Follows the prediction markets you care about and notifies you when odds shift meaningfully. Read-only.',
    audience: 'crypto',
    defaultChannel: 'telegram',
    soulPreset: 'concise',
    preselectedSkills: [],
    samplePrompts: [
      'What are the current odds on the next Fed rate decision?',
      'Notify me if any election market moves more than 5% today.',
      'Which markets are trending up in volume right now?',
    ],
    monthlyCostCapUsd: 10,
  },
  {
    slug: 'on-chain-alerts',
    name: 'On-chain alerts bot',
    tagline: 'Watches addresses and pings you on activity.',
    description:
      'Subscribe to wallets, contracts, or token mints. Get a Telegram ping when something interesting happens.',
    audience: 'crypto',
    defaultChannel: 'telegram',
    soulPreset: 'concise',
    preselectedSkills: [],
    samplePrompts: [
      'Alert me whenever wallet 0xabc...123 sends more than 10 ETH.',
      'Watch the BONK/SOL pool — ping me if liquidity drops 20%.',
      'Tell me when any of my followed wallets buy a new token.',
    ],
    monthlyCostCapUsd: 15,
  },
  {
    slug: 'discord-community-moderator',
    name: 'Discord community moderator',
    tagline: 'First-line moderator for your Discord server.',
    description:
      'Answers FAQs, welcomes new members, flags rule violations for human review. Never bans without approval.',
    audience: 'generic',
    defaultChannel: 'discord',
    soulPreset: 'friendly',
    preselectedSkills: [],
    samplePrompts: [
      'Welcome new members and point them to the rules channel.',
      'Flag any messages that look like spam or scams.',
      'Answer the question "where can I find the docs?"',
    ],
    monthlyCostCapUsd: 20,
  },
] as const

/** Look up a template by slug. Returns null if not found. */
export function getTemplateBySlug(slug: string): RetailTemplate | null {
  return RETAIL_TEMPLATES.find((t) => t.slug === slug) ?? null
}
