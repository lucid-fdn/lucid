import { LucidPackManifestSchema, type LucidPackManifest } from '@contracts/lucid-pack'
import type { TemplateCapability } from '@contracts/template-composition'
import { WEB3_CAPABILITIES, web3Capability } from '@/lib/templates/composition'

type Resource = LucidPackManifest['resources'][number]

const SCHEMA_VERSION = '2026-05-07.lucid-pack.v1' as const

function defineWeb3CapabilityTemplate(manifest: LucidPackManifest): LucidPackManifest {
  return LucidPackManifestSchema.parse({
    ...manifest,
    metadata: {
      product_surface: 'template',
      template_type: 'capability',
      template_family: 'web3-intelligence',
      backing_lifecycle: 'lucid_pack',
      install_copy: 'Installs as a reusable capability template. LucidPack remains the internal managed-resource lifecycle.',
      ...(manifest.metadata ?? {}),
    },
  })
}

function agent(key: string, name: string, systemPrompt: string, capabilities: TemplateCapability[]): Resource {
  return {
    key: `agent:${key}`,
    kind: 'agent',
    name,
    policy: 'fork_on_edit',
    spec: {
      role: name,
      system_prompt: systemPrompt,
      model_hint: 'strong',
      memory_enabled: true,
      memory_strategy: 'conservative',
      capability_keys: capabilities.map((capability) => capability.key),
      output_contract: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
      runtime_compatibility: ['hermes', 'openclaw', 'shared'],
      execution_mode: 'analysis_first',
    },
  }
}

function workflow(key: string, name: string, objective: string, capabilities: TemplateCapability[]): Resource {
  return {
    key: `workflow:${key}`,
    kind: 'workflow',
    name,
    policy: 'managed',
    spec: {
      workflow_id: key,
      objective,
      capability_keys: capabilities.map((capability) => capability.key),
      output_contract: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
      mission_control: {
        evidence_required: true,
        sections: ['signals', 'wallets', 'tokens', 'risks', 'recommendations'],
      },
    },
  }
}

function routine(key: string, name: string, cadence: string, workflowId: string): Resource {
  return {
    key: `routine:${key}`,
    kind: 'routine',
    name,
    policy: 'managed',
    spec: {
      cadence,
      workflow_id: workflowId,
      timezone: 'workspace',
      disabled_by_default: true,
      promote_to_recurring: true,
    },
  }
}

function knowledgeSource(key: string, name: string, sourceType: string): Resource {
  return {
    key: `knowledge_source:${key}`,
    kind: 'knowledge_source',
    name,
    policy: 'advisory',
    spec: {
      source_type: sourceType,
      scope: 'project',
      memory_write_policy: 'operator_review',
      provenance_required: true,
    },
  }
}

function command(key: string, name: string, commandName: string, workflowId: string): Resource {
  return {
    key: `channel_command:${key}`,
    kind: 'channel_command',
    name,
    policy: 'managed',
    spec: {
      command: commandName,
      workflow_id: workflowId,
      channels: ['slack', 'telegram', 'discord', 'web'],
      response_contract: ['summary', 'top_findings', 'mission_control_link'],
    },
  }
}

function approvalPolicy(key: string, name: string, risk: 'medium' | 'high'): Resource {
  return {
    key: `policy:${key}`,
    kind: 'policy',
    name,
    policy: 'managed',
    spec: {
      policy_type: 'approval',
      approval_required: true,
      high_risk_approval: risk === 'high',
      risk_level: risk,
      default_mode: risk === 'high' ? 'approval_only' : 'review_before_automation',
      blocks: ['wallet_transfer', 'dex_swap', 'prediction_trade', 'perps_order'],
    },
  }
}

const dataProviderDependency = {
  capability: 'integration.web3.data-provider',
  required: true,
  acceptedProviders: ['alchemy', 'helius', 'quicknode', 'etherscan', 'birdeye', 'defined'],
  reason: 'Web3 intelligence templates need at least one read-only chain/token data provider before live monitoring can run.',
}

const walletReadDependency = {
  capability: 'integration.wallet.read',
  required: true,
  acceptedProviders: ['privy', 'walletconnect', 'manual-watchlist'],
  reason: 'Wallet templates need wallet addresses from a connected wallet, read-only watchlist, or imported list.',
}

const predictionDataDependency = {
  capability: 'integration.prediction-market.read',
  required: true,
  acceptedProviders: ['polymarket', 'kalshi', 'manual-watchlist'],
  reason: 'Prediction-market templates need a market data source before signal routines can run.',
}

function optionalDependency(dependency: typeof dataProviderDependency): typeof dataProviderDependency {
  return {
    ...dependency,
    required: false,
  }
}

const price = web3Capability(WEB3_CAPABILITIES.priceRead)
const tokenRisk = web3Capability(WEB3_CAPABILITIES.tokenRiskRead)
const holders = web3Capability(WEB3_CAPABILITIES.tokenHoldersRead)
const liquidity = web3Capability(WEB3_CAPABILITIES.tokenLiquidityRead)
const trending = web3Capability(WEB3_CAPABILITIES.trendingRead)
const walletBalance = web3Capability(WEB3_CAPABILITIES.walletBalanceRead)
const walletHistory = web3Capability(WEB3_CAPABILITIES.walletHistoryRead)
const portfolio = web3Capability(WEB3_CAPABILITIES.portfolioRead)
const prediction = web3Capability(WEB3_CAPABILITIES.predictionRead)
const predictionAutomation = web3Capability(WEB3_CAPABILITIES.predictionAutomationManage)
const swapExecute = web3Capability(WEB3_CAPABILITIES.swapExecute)

export const whaleWatchtowerTemplate = defineWeb3CapabilityTemplate({
  schemaVersion: SCHEMA_VERSION,
  key: 'web3-whale-watchtower',
  name: 'Whale Watchtower',
  description: 'Track whale wallets, classify movements, and send evidence-backed alerts before narratives move.',
  version: '1.0.0',
  composition: {
    provides: [walletBalance, walletHistory, price, tokenRisk],
    requires: [dataProviderDependency, walletReadDependency],
    optional: [
      {
        capability: 'integration.channel.alerts',
        required: false,
        acceptedProviders: ['slack', 'telegram', 'discord'],
        reason: 'Channel alerts make whale movement reports useful in real time.',
      },
    ],
    conflicts: [],
    tags: ['web3', 'wallet-tracking', 'whales', 'alerts'],
    upgradesFrom: [],
  },
  resources: [
    agent('web3-whale-watchtower', 'Whale Watchtower Analyst', 'Monitor watched wallets, explain material movements, and separate signal from noise. Never suggest a trade without evidence and risk context.', [walletBalance, walletHistory, price, tokenRisk]),
    workflow('web3-whale-watchtower-brief', 'Whale Movement Brief', 'Review watched wallets and produce a concise movement brief with evidence and confidence.', [walletBalance, walletHistory, price, tokenRisk]),
    routine('web3-whale-watchtower-hourly', 'Hourly Whale Scan', 'FREQ=HOURLY;INTERVAL=1', 'web3-whale-watchtower-brief'),
    knowledgeSource('web3-whale-watchtower-watchlist', 'Whale Watchlist', 'wallet_watchlist'),
    command('web3-whales', 'Whale Watchtower Command', 'whales', 'web3-whale-watchtower-brief'),
  ],
  metadata: {
    vertical: 'web3',
    default_risk: 'read_only',
    activation_prompt: 'Track whale wallets and tell me what matters.',
  },
})

export const tokenWarRoomTemplate = defineWeb3CapabilityTemplate({
  schemaVersion: SCHEMA_VERSION,
  key: 'web3-token-war-room',
  name: 'Token War Room',
  description: 'Monitor token price, liquidity, holders, risks, and narrative shifts in one operating room.',
  version: '1.0.0',
  composition: {
    provides: [price, tokenRisk, holders, liquidity, trending],
    requires: [dataProviderDependency],
    optional: [],
    conflicts: [],
    tags: ['web3', 'token-tracking', 'risk', 'liquidity'],
    upgradesFrom: [],
  },
  resources: [
    agent('web3-token-war-room', 'Token War Room Analyst', 'Track token health across price, liquidity, holder distribution, and narrative velocity. Flag evidence, not vibes.', [price, tokenRisk, holders, liquidity, trending]),
    workflow('web3-token-war-room-brief', 'Token War Room Brief', 'Produce a token intelligence report with risk changes, liquidity shifts, holder changes, and narrative movement.', [price, tokenRisk, holders, liquidity, trending]),
    routine('web3-token-war-room-daily', 'Daily Token War Room', 'FREQ=DAILY;INTERVAL=1', 'web3-token-war-room-brief'),
    knowledgeSource('web3-token-war-room-watchlist', 'Token Watchlist', 'token_watchlist'),
    command('web3-token', 'Token War Room Command', 'token', 'web3-token-war-room-brief'),
  ],
  metadata: {
    vertical: 'web3',
    default_risk: 'read_only',
    activation_prompt: 'Watch this token and explain the risks.',
  },
})

export const predictionMarketAlphaDeskTemplate = defineWeb3CapabilityTemplate({
  schemaVersion: SCHEMA_VERSION,
  key: 'web3-prediction-market-alpha-desk',
  name: 'Prediction Market Alpha Desk',
  description: 'Track markets, probability moves, catalysts, and watchlist opportunities without executing trades by default.',
  version: '1.0.0',
  composition: {
    provides: [prediction, predictionAutomation],
    requires: [predictionDataDependency],
    optional: [{
      capability: 'integration.calendar',
      required: false,
      acceptedProviders: ['google-calendar', 'outlook-calendar'],
      reason: 'Calendar context helps map market catalysts to dates and reminders.',
    }],
    conflicts: [],
    tags: ['web3', 'prediction-markets', 'alpha', 'research'],
    upgradesFrom: [],
  },
  resources: [
    agent('web3-prediction-alpha-desk', 'Prediction Market Alpha Analyst', 'Track markets, catalysts, probability moves, and liquidity. Automation may schedule monitoring, but never executes trades without a separate execution template and approval policy.', [prediction, predictionAutomation]),
    workflow('web3-prediction-alpha-brief', 'Prediction Market Alpha Brief', 'Summarize probability moves, catalysts, liquidity, and watchlist actions.', [prediction, predictionAutomation]),
    routine('web3-prediction-alpha-daily', 'Daily Prediction Market Desk', 'FREQ=DAILY;INTERVAL=1', 'web3-prediction-alpha-brief'),
    approvalPolicy('web3-prediction-automation-review', 'Prediction Automation Review Policy', 'medium'),
    knowledgeSource('web3-prediction-watchlist', 'Prediction Market Watchlist', 'prediction_market_watchlist'),
    command('web3-markets', 'Prediction Market Command', 'markets', 'web3-prediction-alpha-brief'),
  ],
  metadata: {
    vertical: 'web3',
    default_risk: 'medium',
    activation_prompt: 'Track prediction markets and tell me where probabilities moved.',
  },
})

export const portfolioRiskAgentTemplate = defineWeb3CapabilityTemplate({
  schemaVersion: SCHEMA_VERSION,
  key: 'web3-portfolio-risk-agent',
  name: 'Portfolio Risk Agent',
  description: 'Read wallet exposures, classify concentration and liquidity risks, and produce action-ready portfolio reviews.',
  version: '1.0.0',
  composition: {
    provides: [portfolio, walletBalance, walletHistory, price, tokenRisk],
    requires: [dataProviderDependency, walletReadDependency],
    optional: [],
    conflicts: [],
    tags: ['web3', 'portfolio', 'risk', 'wallets'],
    upgradesFrom: [],
  },
  resources: [
    agent('web3-portfolio-risk-agent', 'Portfolio Risk Analyst', 'Analyze wallet exposures, concentration, liquidity, and drawdown risk. Stay read-only and provide evidence-backed risk actions.', [portfolio, walletBalance, walletHistory, price, tokenRisk]),
    workflow('web3-portfolio-risk-review', 'Portfolio Risk Review', 'Review current wallet exposures and produce a portfolio risk report.', [portfolio, walletBalance, walletHistory, price, tokenRisk]),
    routine('web3-portfolio-risk-weekly', 'Weekly Portfolio Risk Review', 'FREQ=WEEKLY;INTERVAL=1', 'web3-portfolio-risk-review'),
    knowledgeSource('web3-portfolio-policy', 'Portfolio Risk Policy', 'portfolio_policy'),
    command('web3-portfolio', 'Portfolio Risk Command', 'portfolio', 'web3-portfolio-risk-review'),
  ],
  metadata: {
    vertical: 'web3',
    default_risk: 'read_only',
    activation_prompt: 'Review my wallets and tell me the biggest risks.',
  },
})

export const smartWalletCopyDeskTemplate = defineWeb3CapabilityTemplate({
  schemaVersion: SCHEMA_VERSION,
  key: 'web3-smart-wallet-copy-desk',
  name: 'Smart Wallet Copy Desk',
  description: 'Find smart-wallet patterns, draft copy-trade plans, and keep execution approval-only by default.',
  version: '1.0.0',
  composition: {
    provides: [walletHistory, price, tokenRisk, swapExecute],
    requires: [dataProviderDependency, walletReadDependency],
    optional: [{
      capability: 'integration.wallet.execute',
      required: false,
      acceptedProviders: ['privy-server-authorized-wallet'],
      reason: 'Execution is optional and must be enabled through a server-authorized wallet plus approval policy.',
    }],
    conflicts: [{
      capability: WEB3_CAPABILITIES.swapExecute,
      mode: 'warn',
      reason: 'Another swap execution template is already installed. Keep one owner for autonomous execution policy.',
    }],
    tags: ['web3', 'smart-wallets', 'copy-trading', 'approval-required'],
    upgradesFrom: [],
  },
  resources: [
    agent('web3-smart-wallet-copy-desk', 'Smart Wallet Copy Analyst', 'Analyze smart-wallet behavior and draft copy plans. Execution is approval-only and must pass policy, wallet eligibility, and risk checks.', [walletHistory, price, tokenRisk, swapExecute]),
    workflow('web3-smart-wallet-copy-plan', 'Smart Wallet Copy Plan', 'Produce a copy-trade plan with thesis, sizing, risks, and approval status. Do not execute by default.', [walletHistory, price, tokenRisk, swapExecute]),
    approvalPolicy('web3-smart-wallet-execution', 'Smart Wallet Execution Approval Policy', 'high'),
    knowledgeSource('web3-smart-wallet-watchlist', 'Smart Wallet Watchlist', 'wallet_watchlist'),
    command('web3-copy', 'Smart Wallet Copy Command', 'copy', 'web3-smart-wallet-copy-plan'),
  ],
  metadata: {
    vertical: 'web3',
    default_risk: 'high',
    activation_prompt: 'Find smart-wallet patterns and draft a copy plan.',
  },
})

export const web3IntelligenceSuiteTemplate = defineWeb3CapabilityTemplate({
  schemaVersion: SCHEMA_VERSION,
  key: 'web3-intelligence-suite',
  name: 'Web3 Intelligence Suite',
  description: 'Composable bundle for whales, tokens, portfolio risk, prediction markets, and smart-wallet research.',
  version: '1.0.0',
  composition: {
    provides: [
      walletBalance,
      walletHistory,
      portfolio,
      price,
      tokenRisk,
      holders,
      liquidity,
      trending,
      prediction,
      predictionAutomation,
    ],
    requires: [dataProviderDependency],
    optional: [optionalDependency(walletReadDependency), optionalDependency(predictionDataDependency)],
    conflicts: [],
    tags: ['web3', 'bundle', 'intelligence', 'operating-room'],
    upgradesFrom: [
      'web3-whale-watchtower',
      'web3-token-war-room',
      'web3-prediction-market-alpha-desk',
      'web3-portfolio-risk-agent',
    ],
  },
  resources: [
    agent('web3-intelligence-suite', 'Web3 Intelligence Operator', 'Coordinate wallet, token, portfolio, and prediction-market signals into one operating view. Keep execution outside this bundle.', [walletBalance, walletHistory, portfolio, price, tokenRisk, holders, liquidity, trending, prediction]),
    workflow('web3-intelligence-daily', 'Daily Web3 Intelligence Brief', 'Produce a cross-surface web3 intelligence brief with evidence, confidence, and next actions.', [walletBalance, walletHistory, portfolio, price, tokenRisk, holders, liquidity, trending, prediction]),
    routine('web3-intelligence-daily-routine', 'Daily Web3 Intelligence Routine', 'FREQ=DAILY;INTERVAL=1', 'web3-intelligence-daily'),
    approvalPolicy('web3-intelligence-automation-review', 'Web3 Intelligence Automation Review Policy', 'medium'),
    knowledgeSource('web3-intelligence-operating-memory', 'Web3 Intelligence Operating Memory', 'web3_research_memory'),
    command('web3-intel', 'Web3 Intelligence Command', 'web3', 'web3-intelligence-daily'),
  ],
  metadata: {
    vertical: 'web3',
    default_risk: 'medium',
    activation_prompt: 'Give me a daily Web3 intelligence brief.',
  },
})

export const WEB3_CAPABILITY_TEMPLATES = [
  whaleWatchtowerTemplate,
  tokenWarRoomTemplate,
  predictionMarketAlphaDeskTemplate,
  portfolioRiskAgentTemplate,
  smartWalletCopyDeskTemplate,
  web3IntelligenceSuiteTemplate,
] as const
