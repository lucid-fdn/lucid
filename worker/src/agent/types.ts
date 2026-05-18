/**
 * Shared agent types — used by both AgentLoop (legacy) and OpenClawAgent.
 * Extracted so callers (inbound.ts, agentStream.ts) don't depend on a specific agent impl.
 */

import type { ChannelOutput } from '../channels/ChannelOutput.js'
import type { ActivatedPlugin } from './plugin-types.js'

export interface RunBudget {
  maxLlmCalls: number
  maxToolCalls: number
  maxWallTimeMs: number
  maxOutputTokens?: number
}

export interface AssistantConfig {
  id: string
  name: string
  engine?: 'openclaw' | 'hermes' | null
  runtime_flavor?: 'shared' | 'c1_managed' | 'c2a_autonomous' | null
  system_prompt: string | null
  /** Agent SOUL — persistent persona, values, and behavioral identity */
  soul_content: string | null
  lucid_model: string
  temperature: number
  max_tokens: number
  memory_enabled: boolean
  memory_window_size: number
  org_id: string | null
  project_id?: string | null
  passport_id: string | null
  policy_config: Record<string, unknown> | null
  wallet_enabled: boolean
  agent_wallets?: Array<{
    chain_type: string
    privy_wallet_id: string
    address: string
    status: string
  }>
  /** Mission Control: tools requiring owner approval before execution */
  approval_required_tools?: string[]
  /** Mission Control: active or paused */
  mc_status?: 'active' | 'paused'
  /** Mission Control: max token spend per run (USD) */
  cost_limit_per_run_usd?: number
  /** Mission Control: max daily spend (USD) */
  cost_limit_daily_usd?: number
  /** Mission Control: max monthly spend (USD) */
  cost_limit_monthly_usd?: number
}

export interface AgentMessage {
  role: string
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

export interface AgentRunResult {
  text: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
  steps: number
  toolCallsUsed: number
  budgetExhausted: boolean
  /** True when the LLM provider returned an error (billing, rate limit, etc.) and
   *  result.text contains a sanitized user-facing message instead of an AI response. */
  hasProviderError?: boolean
  diagnostics?: {
    model?: string
    durationMs?: number
    stopReason?: string
    error?: {
      kind: string
      message: string
    }
    capabilitySurface?: Record<string, unknown>
  }
}

export interface AgentRunParams {
  assistant: AssistantConfig
  conversationId: string
  messages: AgentMessage[]
  memories: string[]
  userMessage: string
  budget: RunBudget
  runId?: string
  userId?: string
  output?: ChannelOutput
  plugins?: ActivatedPlugin[]
}
