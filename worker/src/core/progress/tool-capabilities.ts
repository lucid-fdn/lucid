import type {
  ChannelProgressDescriptor,
  ChannelProgressEvent,
} from './types.js'

export interface ToolProgressMetadata {
  capability?: string
  label?: string
  phase?: ChannelProgressDescriptor['phase']
  source?: ChannelProgressDescriptor['source']
  riskLevel?: ChannelProgressEvent['riskLevel']
}

const TOOL_PROGRESS_REGISTRY: Record<string, ToolProgressMetadata> = {
  wallet_balance: {
    capability: 'web3.wallet.balance.read',
    label: 'Checking wallet balances',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  wallet_history: {
    capability: 'web3.wallet.history.read',
    label: 'Checking wallet activity',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_wallet_profile: {
    capability: 'web3.wallet.history.read',
    label: 'Checking wallet profile',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_portfolio: {
    capability: 'web3.portfolio.read',
    label: 'Reading portfolio exposure',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  portfolio_snapshot: {
    capability: 'web3.portfolio.read',
    label: 'Reading portfolio exposure',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_pnl: {
    capability: 'web3.portfolio.read',
    label: 'Checking portfolio PnL',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_defi_positions: {
    capability: 'web3.portfolio.read',
    label: 'Checking DeFi positions',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_price: {
    capability: 'web3.price.read',
    label: 'Checking live prices',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_market_data: {
    capability: 'web3.price.read',
    label: 'Checking live market data',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  search_token: {
    capability: 'web3.price.read',
    label: 'Looking up token data',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_token_info: {
    capability: 'web3.price.read',
    label: 'Reading token data',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_trending: {
    capability: 'web3.trending.read',
    label: 'Checking trending tokens',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_liquidity: {
    capability: 'web3.token.liquidity.read',
    label: 'Checking token liquidity',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_holders: {
    capability: 'web3.token.holders.read',
    label: 'Checking token holders',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  detect_snipers: {
    capability: 'web3.token.risk.read',
    label: 'Checking sniper activity',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  risk_check: {
    capability: 'web3.token.risk.read',
    label: 'Checking token risk',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  polymarket_search: {
    capability: 'web3.prediction.read',
    label: 'Reading prediction markets',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  polymarket_automation: {
    capability: 'web3.prediction.automation.manage',
    label: 'Checking prediction automation',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'medium',
  },
  polymarket_trade: {
    capability: 'web3.prediction.trade.execute',
    label: 'Preparing prediction-market trade',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  dex_get_quote: {
    capability: 'web3.price.read',
    label: 'Getting swap quote',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_quote_0x: {
    capability: 'web3.price.read',
    label: 'Getting swap quote',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  dex_swap: {
    capability: 'web3.swap.execute',
    label: 'Preparing swap',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  limit_order: {
    capability: 'web3.swap.execute',
    label: 'Preparing limit order',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  dca_create: {
    capability: 'web3.swap.execute',
    label: 'Preparing DCA order',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  stop_loss: {
    capability: 'web3.swap.execute',
    label: 'Preparing stop-loss order',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  wallet_transfer: {
    capability: 'web3.transfer.execute',
    label: 'Preparing transfer',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  bridge: {
    capability: 'web3.transfer.execute',
    label: 'Preparing bridge transfer',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  hl_account_info: {
    capability: 'web3.perps.read',
    label: 'Checking perps account',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  get_trading_policy: {
    capability: 'web3.perps.read',
    label: 'Checking trading policy',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  hl_place_order: {
    capability: 'web3.perps.execute',
    label: 'Preparing perps order',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  hl_cancel_order: {
    capability: 'web3.perps.execute',
    label: 'Preparing order cancellation',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  hl_deposit: {
    capability: 'web3.transfer.execute',
    label: 'Preparing deposit',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  hl_withdraw: {
    capability: 'web3.transfer.execute',
    label: 'Preparing withdrawal',
    phase: 'approval_waiting',
    source: 'tool',
    riskLevel: 'high',
  },
  code_interpreter: {
    capability: 'analysis.code.execute',
    label: 'Running analysis',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'low',
  },
  plan_dag: {
    capability: 'agent_ops.workflow.plan',
    label: 'Planning workflow',
    phase: 'thinking',
    source: 'tool',
    riskLevel: 'read',
  },
  expand_dag: {
    capability: 'agent_ops.workflow.plan',
    label: 'Expanding workflow',
    phase: 'thinking',
    source: 'tool',
    riskLevel: 'read',
  },
  dag_status: {
    capability: 'agent_ops.workflow.read',
    label: 'Checking workflow status',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  generate_content: {
    capability: 'content.generate',
    label: 'Generating content',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'low',
  },
  schedule_task: {
    capability: 'agent_ops.routine.manage',
    label: 'Scheduling routine',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'medium',
  },
  list_scheduled_tasks: {
    capability: 'agent_ops.routine.read',
    label: 'Checking routines',
    phase: 'fetching',
    source: 'tool',
    riskLevel: 'read',
  },
  cancel_scheduled_task: {
    capability: 'agent_ops.routine.manage',
    label: 'Cancelling routine',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'medium',
  },
  sessions_send: {
    capability: 'agent_ops.team.coordinate',
    label: 'Coordinating agents',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'low',
  },
  sessions_spawn: {
    capability: 'agent_ops.team.coordinate',
    label: 'Spawning specialist',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'low',
  },
  spawn_subagent: {
    capability: 'agent_ops.team.coordinate',
    label: 'Spawning specialist',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'low',
  },
  send_message_to_agent: {
    capability: 'agent_ops.team.coordinate',
    label: 'Coordinating agents',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'low',
  },
  crew_complete: {
    capability: 'agent_ops.team.coordinate',
    label: 'Completing team handoff',
    phase: 'tool_running',
    source: 'tool',
    riskLevel: 'read',
  },
}

export function resolveToolProgressMetadata(toolName: string): ToolProgressMetadata {
  const exact = TOOL_PROGRESS_REGISTRY[toolName]
  if (exact) return exact

  const normalized = toolName
    .replace(/^(?:builtin|plugin|tool)[.:/_-]+/i, '')
    .replace(/[:/]+/g, '_')
    .toLowerCase()
  return TOOL_PROGRESS_REGISTRY[normalized] ?? {}
}
