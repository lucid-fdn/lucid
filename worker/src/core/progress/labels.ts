import type { ChannelProgressDescriptor, ChannelProgressPhase } from './types.js'

interface CapabilityProgressRule {
  capability: string
  aliases?: string[]
  phase: ChannelProgressPhase
  label: string
  source?: ChannelProgressDescriptor['source']
  riskLevel?: ChannelProgressDescriptor['riskLevel']
  patterns: RegExp[]
}

const CAPABILITY_RULES: CapabilityProgressRule[] = [
  {
    capability: 'web3.wallet.balance.read',
    phase: 'fetching',
    label: 'Checking wallet balances',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/wallet.*balance/i, /balance.*wallet/i, /portfolio/i, /holdings/i],
  },
  {
    capability: 'web3.wallet.history.read',
    aliases: ['web3.wallet.activity.read'],
    phase: 'fetching',
    label: 'Checking wallet activity',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/wallet.*activity/i, /transaction/i, /transfer/i, /whale/i],
  },
  {
    capability: 'web3.prediction.read',
    aliases: ['web3.prediction.market.read'],
    phase: 'fetching',
    label: 'Reading prediction markets',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/prediction/i, /polymarket/i, /kalshi/i, /market.*odds/i],
  },
  {
    capability: 'web3.price.read',
    aliases: ['web3.market.price.read'],
    phase: 'fetching',
    label: 'Checking live market data',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/price/i, /market/i, /ohlc/i, /token.*data/i, /quote/i],
  },
  {
    capability: 'web3.trending.read',
    phase: 'fetching',
    label: 'Checking trending tokens',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/trending/i, /hot.*token/i],
  },
  {
    capability: 'web3.token.holders.read',
    phase: 'fetching',
    label: 'Checking token holders',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/holder/i, /holder.*distribution/i],
  },
  {
    capability: 'web3.token.liquidity.read',
    phase: 'fetching',
    label: 'Checking token liquidity',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/liquidity/i, /pool/i],
  },
  {
    capability: 'web3.portfolio.read',
    phase: 'fetching',
    label: 'Reading portfolio exposure',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/portfolio/i, /pnl/i, /defi.*position/i],
  },
  {
    capability: 'web3.token.risk.read',
    phase: 'fetching',
    label: 'Checking token risk',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/risk/i, /honeypot/i, /liquidity/i, /contract/i, /token.*audit/i],
  },
  {
    capability: 'web3.prediction.automation.manage',
    phase: 'tool_running',
    label: 'Checking prediction automation',
    source: 'tool',
    riskLevel: 'medium',
    patterns: [/prediction.*automation/i, /polymarket.*automation/i],
  },
  {
    capability: 'web3.prediction.trade.execute',
    phase: 'approval_waiting',
    label: 'Preparing prediction-market trade',
    source: 'tool',
    riskLevel: 'high',
    patterns: [/prediction.*trade/i, /polymarket.*trade/i],
  },
  {
    capability: 'web3.swap.execute',
    phase: 'approval_waiting',
    label: 'Preparing swap',
    source: 'tool',
    riskLevel: 'high',
    patterns: [/swap/i, /limit.*order/i, /dca/i, /stop.*loss/i],
  },
  {
    capability: 'web3.transfer.execute',
    phase: 'approval_waiting',
    label: 'Preparing transfer',
    source: 'tool',
    riskLevel: 'high',
    patterns: [/transfer/i, /bridge/i, /deposit/i, /withdraw/i],
  },
  {
    capability: 'web3.perps.execute',
    phase: 'approval_waiting',
    label: 'Preparing perps order',
    source: 'tool',
    riskLevel: 'high',
    patterns: [/perp/i, /hyperliquid/i, /futures/i],
  },
  {
    capability: 'knowledge.recall',
    phase: 'memory',
    label: 'Reading relevant memory',
    source: 'memory',
    riskLevel: 'read',
    patterns: [/memory/i, /knowledge/i, /recall/i, /rag/i],
  },
  {
    capability: 'browser.observe',
    phase: 'browser',
    label: 'Opening browser',
    source: 'browser',
    riskLevel: 'read',
    patterns: [/browser/i, /playwright/i, /web.*page/i, /screenshot/i, /navigate/i],
  },
  {
    capability: 'web.search',
    phase: 'fetching',
    label: 'Searching the web',
    source: 'tool',
    riskLevel: 'read',
    patterns: [/web_search/i, /search/i],
  },
]

const WIRE_PREFIX_PATTERN = /^(?:builtin|plugin|capability|tool)[.:/_-]+/i

export function sanitizeProgressText(value: string, maxLength = 96): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  const chars = Array.from(compact)
  if (chars.length <= maxLength) return compact
  return `${chars.slice(0, Math.max(1, maxLength - 1)).join('')}…`
}

export function normalizeProgressToolName(toolName: string): string {
  return toolName
    .trim()
    .replace(WIRE_PREFIX_PATTERN, '')
    .replace(/[:/]+/g, '.')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function friendlyToolName(toolName: string): string {
  const normalized = normalizeProgressToolName(toolName)
  if (!normalized) return 'tool'
  return normalized
    .split(/[.\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

export function resolveCapabilityProgress(input: {
  capability?: string | null
  toolName?: string | null
}): ChannelProgressDescriptor {
  const capability = input.capability?.trim()
  const toolName = input.toolName?.trim()
  const haystack = `${capability ?? ''} ${toolName ?? ''}`.trim()

  for (const rule of CAPABILITY_RULES) {
    if (
      capability === rule.capability ||
      rule.aliases?.includes(capability ?? '') ||
      rule.patterns.some((pattern) => pattern.test(haystack))
    ) {
      return {
        phase: rule.phase,
        label: rule.label,
        capability: capability ?? rule.capability,
        source: rule.source,
        riskLevel: rule.riskLevel,
      }
    }
  }

  return {
    phase: 'tool_running',
    label: toolName ? `Using ${friendlyToolName(toolName)}` : 'Running tool',
    capability: capability ?? undefined,
    source: 'tool',
  }
}
