import type { SupabaseClient } from '@supabase/supabase-js'
import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import {
  requiresApproval as requiresToolApproval,
  waitForApproval as waitForToolApproval,
  type ApprovalGateParams,
  type ApprovalResult,
} from '../approval-gate.js'
import { CostTracker } from '../cost-tracker.js'
import { emitNotification, ALERTS } from '../../notifications/emitter.js'
import type { AssistantConfig } from '../types.js'

const DEFAULT_CHARS_PER_TOKEN = 4

export interface UsageEstimate {
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
}

export interface NormalizedRunUsage extends UsageEstimate {
  source: 'provider' | 'estimated'
}

export interface RunGovernanceCostTracker {
  addUsage(inputTokens: number, outputTokens: number): void
  getRunCostUsd(): number
  isRunLimitExceeded(): boolean
  persistAndCheckLimits(): Promise<{ exceeded: boolean; type?: 'daily' | 'monthly' }>
  getSummary(): {
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
    model: string
  }
}

export interface ToolApprovalFlowParams {
  supabase: SupabaseClient
  assistant: AssistantConfig
  toolCallId: string
  toolName: string
  toolArgs: Record<string, unknown>
  runId?: string
  streamOutput?: Pick<AIStreamOutput, 'toolStart' | 'toolError'>
}

export interface ToolApprovalFlowResult {
  status: 'proceed' | 'blocked'
  lifecycle: 'not_required' | 'awaiting' | 'approved' | 'denied' | 'expired' | 'error'
  response?: string
}

export interface AgentGovernanceRuntime {
  requiresApproval(assistant: AssistantConfig, toolName: string): boolean
  waitForApproval(params: ApprovalGateParams): Promise<ApprovalResult>
  authorizeToolCall(params: ToolApprovalFlowParams): Promise<ToolApprovalFlowResult>
  createCostTracker(params: {
    assistant: AssistantConfig
    supabase: SupabaseClient
  }): RunGovernanceCostTracker
  estimateUsageFromText(params: {
    model: string
    promptText: string
    responseText: string
  }): UsageEstimate
  normalizeUsage(params: {
    model: string
    promptTokens?: number
    completionTokens?: number
    promptText?: string
    responseText?: string
    source?: 'provider' | 'estimated'
  }): NormalizedRunUsage
  persistRunUsage(params: {
    assistant: AssistantConfig
    supabase: SupabaseClient
    usage: NormalizedRunUsage
  }): Promise<{ exceeded: boolean; type?: 'daily' | 'monthly' }>
}

function estimateTokenCount(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN))
}

function estimateCostUsdForModel(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const lower = model.toLowerCase()
  const rates = [
    { key: 'gpt-4o-mini', input: 0.15, output: 0.6 },
    { key: 'gpt-4o', input: 2.5, output: 10.0 },
    { key: 'gpt-4.1-mini', input: 0.4, output: 1.6 },
    { key: 'gpt-4.1', input: 2.0, output: 8.0 },
    { key: 'claude-3-haiku', input: 0.25, output: 1.25 },
    { key: 'claude-3-5-sonnet', input: 3.0, output: 15.0 },
    { key: 'default', input: 1.0, output: 3.0 },
  ] as const
  const rate = rates.find((entry) => lower.includes(entry.key)) ?? rates[rates.length - 1]
  return ((inputTokens / 1_000_000) * rate.input) + ((outputTokens / 1_000_000) * rate.output)
}

class DefaultAgentGovernanceRuntime implements AgentGovernanceRuntime {
  requiresApproval(assistant: AssistantConfig, toolName: string): boolean {
    return requiresToolApproval(assistant, toolName)
  }

  waitForApproval(params: ApprovalGateParams): Promise<ApprovalResult> {
    return waitForToolApproval(params)
  }

  async authorizeToolCall(params: ToolApprovalFlowParams): Promise<ToolApprovalFlowResult> {
    if (!this.requiresApproval(params.assistant, params.toolName)) {
      return { status: 'proceed', lifecycle: 'not_required' }
    }

    console.log(`[governance] Tool ${params.toolName} requires approval — waiting...`)
    params.streamOutput?.toolStart(params.toolCallId, `awaiting_approval:${params.toolName}`)

    const approvalResult = await this.waitForApproval({
      supabase: params.supabase,
      assistant: params.assistant,
      runId: params.runId ?? params.toolCallId,
      toolName: params.toolName,
      toolArgs: params.toolArgs,
    })

    if (approvalResult.status === 'approved') {
      console.log(`[governance] Tool ${params.toolName} approved — executing`)
      return { status: 'proceed', lifecycle: 'approved' }
    }

    if (approvalResult.status === 'denied') {
      const msg = `Tool "${params.toolName}" was denied by owner.${approvalResult.reason ? ` Reason: ${approvalResult.reason}` : ''}`
      params.streamOutput?.toolError(params.toolCallId, msg)
      return {
        status: 'blocked',
        lifecycle: 'denied',
        response: JSON.stringify({ error: msg, approval_status: 'denied' }),
      }
    }

    if (approvalResult.status === 'expired') {
      const msg = `Approval for "${params.toolName}" timed out. The action was not executed.`
      params.streamOutput?.toolError(params.toolCallId, msg)

      if (params.assistant.org_id) {
        void emitNotification(params.supabase, {
          orgId: params.assistant.org_id,
          ...ALERTS.approvalExpired(params.assistant.name ?? 'Agent', params.toolName),
        })
      }

      return {
        status: 'blocked',
        lifecycle: 'expired',
        response: JSON.stringify({ error: msg, approval_status: 'expired' }),
      }
    }

    console.error(`[governance] Approval gate error: ${approvalResult.message}`)
    return { status: 'proceed', lifecycle: 'error' }
  }

  createCostTracker(params: {
    assistant: AssistantConfig
    supabase: SupabaseClient
  }): RunGovernanceCostTracker {
    return new CostTracker(params)
  }

  estimateUsageFromText(params: {
    model: string
    promptText: string
    responseText: string
  }): UsageEstimate {
    const inputTokens = estimateTokenCount(params.promptText)
    const outputTokens = estimateTokenCount(params.responseText)
    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsdForModel(params.model, inputTokens, outputTokens),
    }
  }

  normalizeUsage(params: {
    model: string
    promptTokens?: number
    completionTokens?: number
    promptText?: string
    responseText?: string
    source?: 'provider' | 'estimated'
  }): NormalizedRunUsage {
    if (
      typeof params.promptTokens === 'number' &&
      Number.isFinite(params.promptTokens) &&
      typeof params.completionTokens === 'number' &&
      Number.isFinite(params.completionTokens)
    ) {
      return {
        inputTokens: params.promptTokens,
        outputTokens: params.completionTokens,
        estimatedCostUsd: estimateCostUsdForModel(
          params.model,
          params.promptTokens,
          params.completionTokens,
        ),
        source: params.source ?? 'provider',
      }
    }

    const estimated = this.estimateUsageFromText({
      model: params.model,
      promptText: params.promptText ?? '',
      responseText: params.responseText ?? '',
    })
    return {
      ...estimated,
      source: 'estimated',
    }
  }

  async persistRunUsage(params: {
    assistant: AssistantConfig
    supabase: SupabaseClient
    usage: NormalizedRunUsage
  }): Promise<{ exceeded: boolean; type?: 'daily' | 'monthly' }> {
    const tracker = this.createCostTracker({
      assistant: params.assistant,
      supabase: params.supabase,
    })
    tracker.addUsage(params.usage.inputTokens, params.usage.outputTokens)
    return tracker.persistAndCheckLimits()
  }
}

export const defaultAgentGovernanceRuntime: AgentGovernanceRuntime =
  new DefaultAgentGovernanceRuntime()
