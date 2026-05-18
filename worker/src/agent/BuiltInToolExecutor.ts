/**
 * BuiltInToolExecutor — Registry-based tool dispatch.
 *
 * Tools self-register into a typed registry with their handler + category.
 * Adding a new tool = one registry entry. No switch cases, no guard sets,
 * no possibility of tools falling through cracks.
 *
 * Categories:
 *   - 'simple'    — No context needed (data intelligence, content, code)
 *   - 'runtime'   — Needs supabase/assistant/run context (scheduler, messaging, subagent)
 *   - 'read'      — Read-only blockchain (no wallet context, no x402 import)
 *   - 'elevated'  — Needs wallet context + signing (dex_swap, wallet_transfer, etc.)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AssistantConfig } from './types.js'
import type { ToolContext } from './tools/types.js'
import { createX402Fetch } from '../services/x402/index.js'
import { createPrivySigner } from './signing/privy-signer.js'
import { getConfig } from '../config.js'

// Runtime primitives (agent infrastructure)
import {
  toolSpawnSubagent,
  toolSendMessageToAgent,
  toolScheduleTask,
  toolListScheduledTasks,
  toolCancelScheduledTask,
  toolSoulEdit,
  toolPlanDag,
  toolExpandDag,
  toolDagStatus,
  toolCreateWorkItem,
} from './runtime-tools/index.js'
import type { SubagentContext } from './runtime-tools/subagent.js'
import type { CrewContext } from './runtime-tools/crew-context.js'
import { toolCrewComplete } from './runtime-tools/crew-context.js'
import { IncrementalScheduler } from '../pulse/dag/scheduler.js'
import { DagStepCreator } from '../pulse/dag/dag-step-creator.js'

// Platform tools (elevated, need signing)
import {
  toolWalletTransfer,
  toolDexSwap,
  toolHlPlaceOrder,
  toolHlCancelOrder,
  toolHlDeposit,
  toolHlWithdraw,
  toolBridgeExecute,
  toolPolymarketTrade,
} from './platform-tools/index.js'

// Hedge analysis (read-only brain tool)
import { toolLucidHedge } from '../skills/polymarket/tools/hedge.js'

// Automation rules (read-only tool, action-level capability checks)
import { toolPolymarketAutomation } from '../skills/polymarket/tools/automation.js'

// Built-in service tools (read-only — still in worker, depend on services/)
import {
  toolDexGetQuote,
  toolHlAccountInfo,
} from './tools/index.js'

// Extracted tool packages
import { toolGenerateContent } from '@lucid-fdn/content'
import { toolCodeInterpreter } from '@lucid-fdn/code-interpreter'

// Internal tools (private SaaS tools)
import { executeTradingPolicyTool } from './internal-tools/index.js'

// Web3 operator tools (Read/Reason/Action lanes)
import {
  toolGetQuote0x,
  toolPortfolioSnapshot,
  toolGetPnL,
  toolLimitOrder,
  toolDCACreate,
  toolStopLoss,
  toolBridge,
} from '@lucid-fdn/web3-operator'

// Enhanced tools — Moralis/Helius first, fallback to original
import {
  enhancedGetPrice,
  enhancedSearchToken,
  enhancedGetPortfolio,
  enhancedWalletBalance,
  enhancedRiskCheck,
  enhancedWalletHistory,
  getTokenInfo,
  getTrending,
  getLiquidity,
  getHolders,
  getDefiPositions,
  getWalletProfile,
  getMarketData,
  detectSnipers,
} from './tools/web3-operator/enhanced-tools.js'

export interface BuiltInToolExecutorParams {
  supabase: SupabaseClient
  userId: string
  assistant: AssistantConfig
  runId?: string
  conversationId?: string
  channelId?: string
  subagentCtx?: SubagentContext
  /** Crew context for topology enforcement in messaging */
  crewContext?: CrewContext | null
}

// ── Tool Registry ─────────────────────────────────────────────────────

type ToolCategory = 'simple' | 'runtime' | 'read' | 'elevated'

interface ToolEntry {
  category: ToolCategory
  handler: (args: unknown, params: BuiltInToolExecutorParams, toolCallId?: string) => Promise<string>
}

const TOOL_REGISTRY = new Map<string, ToolEntry>()

/** Register a tool with its category and handler */
function register(name: string, category: ToolCategory, handler: ToolEntry['handler']): void {
  TOOL_REGISTRY.set(name, { category, handler })
}

/** Register an alias (same handler, different name) */
function alias(newName: string, existingName: string): void {
  const entry = TOOL_REGISTRY.get(existingName)
  if (entry) TOOL_REGISTRY.set(newName, entry)
}

// ── Simple tools (no context needed) ──────────────────────────────────

register('generate_content', 'simple', (args, params) =>
  toolGenerateContent(
    args as Parameters<typeof toolGenerateContent>[0],
    { apiUrl: process.env.PAYLOAD_API_URL || '', apiKey: process.env.PAYLOAD_API_KEY || '' },
    { tenantId: params.assistant.org_id ?? undefined, agentId: params.assistant.id },
  ),
)

register('code_interpreter', 'simple', (args) =>
  toolCodeInterpreter(args as Record<string, unknown>),
)

register('get_trading_policy', 'simple', (_args, params) =>
  executeTradingPolicyTool(params),
)

// Data intelligence (Moralis/Helius — no wallet needed)
register('get_token_info', 'simple', (args) =>
  getTokenInfo(args as { token: string; chain?: string }),
)
register('get_trending', 'simple', (args) =>
  getTrending(args as { chain?: string; category?: string }),
)
register('get_liquidity', 'simple', (args) =>
  getLiquidity(args as { token: string; chain?: string }),
)
register('get_holders', 'simple', (args) =>
  getHolders(args as { token: string; chain?: string }),
)
register('get_defi_positions', 'simple', (args) =>
  getDefiPositions(args as { address: string; chain?: string }),
)
register('get_wallet_profile', 'simple', (args) =>
  getWalletProfile(args as { address: string; chain?: string }),
)
register('get_market_data', 'simple', (args) =>
  getMarketData(args as { limit?: number }),
)
register('detect_snipers', 'simple', (args) =>
  detectSnipers(args as { pair_address: string; chain?: string }),
)

// ── Runtime tools (need supabase + assistant context) ─────────────────

register('sessions_spawn', 'runtime', (args, params) => {
  if (!params.subagentCtx) {
    return Promise.resolve(JSON.stringify({ error: 'Subagent context not available' }))
  }
  return toolSpawnSubagent(
    args as Parameters<typeof toolSpawnSubagent>[0],
    params.subagentCtx,
  )
})

register('sessions_send', 'runtime', (args, params, toolCallId) =>
  toolSendMessageToAgent(
    args as Parameters<typeof toolSendMessageToAgent>[0],
    {
      supabase: params.supabase,
      sourceAssistantId: params.assistant.id,
      sourceAssistantName: params.assistant.name,
      orgId: params.assistant.org_id ?? '',
      parentRunId: params.runId,
      toolCallId,
      crewContext: params.crewContext ?? undefined,
    },
  ),
)

register('cron_schedule', 'runtime', (args, params, toolCallId) =>
  toolScheduleTask(
    args as Parameters<typeof toolScheduleTask>[0],
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      conversationId: params.conversationId,
      parentRunId: params.runId,
      toolCallId,
      channelId: params.channelId,
    },
  ),
)

register('cron_list', 'runtime', (args, params) =>
  toolListScheduledTasks(
    args as Parameters<typeof toolListScheduledTasks>[0],
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
    },
  ),
)

register('cron_cancel', 'runtime', (args, params) =>
  toolCancelScheduledTask(
    args as Parameters<typeof toolCancelScheduledTask>[0],
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
    },
  ),
)

register('crew_complete', 'runtime', (args, params) =>
  toolCrewComplete(
    args as { outcome_summary: string; status?: 'completed' | 'failed' },
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      crewContext: params.crewContext,
    },
  ),
)

register('plan_dag', 'runtime', (args, params) => {
  const scheduler = new IncrementalScheduler(
    params.supabase,
    new DagStepCreator(params.supabase),
    undefined,
    undefined,
    { FEATURE_CONFIDENCE_ROUTER: getConfig().FEATURE_CONFIDENCE_ROUTER },
  )
  return toolPlanDag(
    args as Parameters<typeof toolPlanDag>[0],
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      scheduler,
    },
  )
})

register('expand_dag', 'runtime', (args, params) => {
  const scheduler = new IncrementalScheduler(
    params.supabase,
    new DagStepCreator(params.supabase),
    undefined,
    undefined,
    { FEATURE_CONFIDENCE_ROUTER: getConfig().FEATURE_CONFIDENCE_ROUTER },
  )
  return toolExpandDag(
    args as Parameters<typeof toolExpandDag>[0],
    {
      supabase: params.supabase,
      redis: null,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      runId: params.runId,
      scheduler,
    },
  )
})

register('dag_status', 'runtime', (args, params) =>
  toolDagStatus(
    args as Parameters<typeof toolDagStatus>[0],
    {
      supabase: params.supabase,
      redis: null,
      orgId: params.assistant.org_id ?? '',
    },
  ),
)

register('soul_edit', 'runtime', (args, params) =>
  toolSoulEdit(
    args as { content: string },
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      runId: params.runId,
    },
  ),
)

register('create_work_item', 'runtime', (args, params) =>
  toolCreateWorkItem(
    args as Parameters<typeof toolCreateWorkItem>[0],
    {
      supabase: params.supabase,
      assistantId: params.assistant.id,
      orgId: params.assistant.org_id ?? '',
      runId: params.runId,
    },
  ),
)

// Old names → aliases
alias('spawn_subagent', 'sessions_spawn')
alias('send_message_to_agent', 'sessions_send')
alias('schedule_task', 'cron_schedule')
alias('list_scheduled_tasks', 'cron_list')
alias('cancel_scheduled_task', 'cron_cancel')

// ── Read-only blockchain tools (no wallet context, no x402) ───────────

register('wallet_balance', 'read', (args) =>
  enhancedWalletBalance(args as { address: string; chain?: string }),
)
register('dex_get_quote', 'read', (args) =>
  toolDexGetQuote(args as Parameters<typeof toolDexGetQuote>[0]),
)
register('get_price', 'read', (args) =>
  enhancedGetPrice(args as { token: string; chain?: string }),
)
register('search_token', 'read', (args) =>
  enhancedSearchToken(args as { query: string; chain?: string }),
)
register('get_portfolio', 'read', (args) =>
  enhancedGetPortfolio(args as { address: string; chain?: string }),
)
register('wallet_history', 'read', (args) =>
  enhancedWalletHistory(args as { address: string; chain?: string; mode?: string }),
)
register('get_quote_0x', 'read', (args) =>
  toolGetQuote0x(args as Parameters<typeof toolGetQuote0x>[0]),
)
register('risk_check', 'read', (args) =>
  enhancedRiskCheck(args as { token: string; chain?: string; pair_address?: string }),
)
register('portfolio_snapshot', 'read', (args, params) => {
  const snapArgs = args as Record<string, unknown>
  return toolPortfolioSnapshot({
    assistantId: params.assistant.id,
    portfolio: (snapArgs.portfolio as Parameters<typeof toolPortfolioSnapshot>[0]['portfolio']) || {
      wallet: '', chain: 'all', balances: [], totalValueUsd: 0, timestamp: new Date().toISOString(),
    },
    label: snapArgs.label as string | undefined,
  })
})
register('get_pnl', 'read', (args, params) => {
  const pnlArgs = args as Record<string, unknown>
  return toolGetPnL({
    assistantId: params.assistant.id,
    currentPortfolio: (pnlArgs.currentPortfolio as Parameters<typeof toolGetPnL>[0]['currentPortfolio']) || {
      wallet: '', chain: 'all', balances: [], totalValueUsd: 0, timestamp: new Date().toISOString(),
    },
    snapshotLabel: pnlArgs.snapshotLabel as string | undefined,
  })
})

// ── Elevated tools (need wallet context + signing) ────────────────────

register('dex_swap', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolDexSwap(args as Parameters<typeof toolDexSwap>[0], ctx, signer)
})

register('wallet_transfer', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolWalletTransfer(args as Parameters<typeof toolWalletTransfer>[0], ctx, signer)
})

register('hl_account_info', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  return toolHlAccountInfo(args as Parameters<typeof toolHlAccountInfo>[0], ctx)
})

register('hl_place_order', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolHlPlaceOrder(args as Parameters<typeof toolHlPlaceOrder>[0], ctx, signer)
})

register('hl_cancel_order', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolHlCancelOrder(args as Parameters<typeof toolHlCancelOrder>[0], ctx, signer)
})

register('hl_deposit', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolHlDeposit(args as Parameters<typeof toolHlDeposit>[0], ctx, signer)
})

register('hl_withdraw', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolHlWithdraw(args as Parameters<typeof toolHlWithdraw>[0], ctx, signer)
})

register('polymarket_trade', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  return toolPolymarketTrade(args as Parameters<typeof toolPolymarketTrade>[0], ctx)
})

register('lucid_hedge', 'read', async (args, params) =>
  toolLucidHedge(args, params.assistant.id, params.supabase),
)

register('polymarket_automation', 'read', async (args, params) =>
  toolPolymarketAutomation(
    args,
    params.assistant.id,
    params.assistant.org_id ?? '',
    params.supabase,
    params.assistant.policy_config ?? null,
  ),
)

// Web3 operator action lane (simulation-first)
register('limit_order', 'elevated', (args) =>
  toolLimitOrder(args as Parameters<typeof toolLimitOrder>[0]),
)
register('dca_create', 'elevated', (args) =>
  toolDCACreate(args as Parameters<typeof toolDCACreate>[0]),
)
register('stop_loss', 'elevated', (args) =>
  toolStopLoss(args as Parameters<typeof toolStopLoss>[0]),
)
register('bridge', 'elevated', async (args, params, toolCallId) => {
  const ctx = await buildToolContext(params, toolCallId)
  const signer = createSignerFromContext(params, ctx)
  return toolBridgeExecute(args as Parameters<typeof toolBridgeExecute>[0], ctx, signer)
})

// ── Public API ────────────────────────────────────────────────────────

/** Check if a tool name is a built-in tool (not a plugin). */
export function isBuiltInTool(toolName: string): boolean {
  return TOOL_REGISTRY.has(toolName)
}

/** All registered built-in tool names (for allowlist construction). */
export const BUILT_IN_TOOL_NAMES = new Set(TOOL_REGISTRY.keys())

// ── Per-run tool call counter (prevents runaway loops) ────────────────
const runToolCallCounts = new Map<string, { total: number; perTool: Map<string, number> }>()
const MAX_TOOL_CALLS_PER_RUN = 25
const MAX_SAME_TOOL_PER_RUN = 5

export function resetRunToolCalls(runId: string): void {
  runToolCallCounts.delete(runId)
}

/**
 * Execute a built-in tool by name.
 *
 * Returns the tool result string, or null if the tool name is not recognized
 * as a built-in (caller should fall through to plugin dispatch).
 */
export async function executeBuiltInTool(
  toolName: string,
  args: Record<string, unknown>,
  params: BuiltInToolExecutorParams,
  toolCallId?: string,
): Promise<string | null> {
  const entry = TOOL_REGISTRY.get(toolName)
  if (!entry) return null

  // ── Loop guard ──────────────────────────────────────────────────────
  const runId = params.runId ?? 'unknown'
  if (!runToolCallCounts.has(runId)) {
    runToolCallCounts.set(runId, { total: 0, perTool: new Map() })
  }
  const counter = runToolCallCounts.get(runId)!
  counter.total++
  counter.perTool.set(toolName, (counter.perTool.get(toolName) ?? 0) + 1)

  if (counter.total > MAX_TOOL_CALLS_PER_RUN) {
    console.warn(`[BuiltInToolExecutor] ⛔ Run ${runId} exceeded ${MAX_TOOL_CALLS_PER_RUN} tool calls — halting`)
    return JSON.stringify({ error: `Tool call limit reached (${MAX_TOOL_CALLS_PER_RUN}). Please provide your answer with the information you already have.` })
  }
  const sameToolCount = counter.perTool.get(toolName)!
  if (sameToolCount > MAX_SAME_TOOL_PER_RUN) {
    console.warn(`[BuiltInToolExecutor] ⛔ Run ${runId}: ${toolName} called ${sameToolCount} times — halting repeat`)
    return JSON.stringify({ error: `You already called ${toolName} ${MAX_SAME_TOOL_PER_RUN} times this conversation turn. Use the results you have or try a different tool.` })
  }

  return entry.handler(args, params, toolCallId)
}

// ── Context builders (only used by elevated tools) ────────────────────

async function buildToolContext(params: BuiltInToolExecutorParams, toolCallId?: string): Promise<ToolContext> {
  const ctx: ToolContext = {
    supabase: params.supabase,
    userId: params.userId,
    assistantId: params.assistant.id,
    orgId: params.assistant.org_id ?? undefined,
    runId: params.runId,
    toolCallId,
  }

  if (params.assistant.wallet_enabled && params.assistant.agent_wallets?.length) {
    const activeWallets = params.assistant.agent_wallets.filter(w => w.status === 'active')
    const evmWallet = activeWallets.find(w => w.chain_type === 'ethereum')
    const solWallet = activeWallets.find(w => w.chain_type === 'solana')

    if (evmWallet || solWallet) {
      ctx.agentWallets = {}
      if (evmWallet) {
        ctx.agentWallets.evm = {
          address: evmWallet.address,
          privyWalletId: evmWallet.privy_wallet_id,
        }
      }
      if (solWallet) {
        ctx.agentWallets.solana = {
          address: solWallet.address,
          privyWalletId: solWallet.privy_wallet_id,
        }
      }
    }

    if (evmWallet) {
      try {
        ctx.x402Fetch = await createX402Fetch({
          assistantId: params.assistant.id,
          walletAddress: evmWallet.address,
        })
      } catch {
        // Non-fatal — agent can still work without x402
      }
    }
  }

  return ctx
}

function createSignerFromContext(params: BuiltInToolExecutorParams, ctx: ToolContext) {
  return createPrivySigner({
    assistantId: params.assistant.id,
    userId: params.userId,
    hasAgentWallets: !!ctx.agentWallets,
    fromAddress: ctx.fromAddress,
  })
}
