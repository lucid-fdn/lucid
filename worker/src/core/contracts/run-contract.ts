import type { OpenClawAgentParams } from '../../agent/OpenClawAgent.js'
import type { AgentRunResult, AssistantConfig } from '../../agent/types.js'
import type { RunTurnInput, RunTurnOutput } from '../../agent/runtime/types.js'

export type RunRequest = OpenClawAgentParams
export type EngineRunResult = AgentRunResult
export type RuntimeRunRequest = RunTurnInput
export type RuntimeRunResult = RunTurnOutput

export interface CanonicalRunUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface CanonicalRunSource {
  engine: NonNullable<AssistantConfig['engine']> | 'unknown'
  runtimeFlavor: AssistantConfig['runtime_flavor'] | 'shared' | 'unknown'
  executionMode: 'engine' | 'runtime'
}

export interface CanonicalRunDiagnostics {
  model?: string
  durationMs?: number
  stopReason?: string
  error?: {
    kind: string
    message: string
  }
  capabilitySurface?: Record<string, unknown>
}

export interface RunResult {
  text: string
  usage: CanonicalRunUsage
  steps: number
  toolCallsUsed: number
  budgetExhausted: boolean
  providerError: boolean
  source: CanonicalRunSource
  diagnostics?: CanonicalRunDiagnostics
  meta?: {
    durationMs?: number
    model?: string
    stopReason?: string
    error?: {
      kind: string
      message: string
    }
  }
}

function resolveRunSource(
  assistant: Pick<AssistantConfig, 'engine' | 'runtime_flavor'>,
  executionMode: CanonicalRunSource['executionMode'],
): CanonicalRunSource {
  return {
    engine: assistant.engine ?? 'openclaw',
    runtimeFlavor: assistant.runtime_flavor ?? 'shared',
    executionMode,
  }
}

export function normalizeEngineRunResult(
  result: EngineRunResult,
  assistant: Pick<AssistantConfig, 'engine' | 'runtime_flavor'>,
): RunResult {
  const promptTokens = result.usage?.promptTokens ?? 0
  const completionTokens = result.usage?.completionTokens ?? 0

  return {
    text: result.text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    steps: result.steps,
    toolCallsUsed: result.toolCallsUsed,
    budgetExhausted: result.budgetExhausted,
    providerError: !!result.hasProviderError,
    source: resolveRunSource(assistant, 'engine'),
    diagnostics: result.diagnostics,
    meta: result.diagnostics
      ? {
          durationMs: result.diagnostics.durationMs,
          model: result.diagnostics.model,
          stopReason: result.diagnostics.stopReason,
          error: result.diagnostics.error,
        }
      : undefined,
  }
}

export function normalizeRuntimeRunResult(
  result: RuntimeRunResult,
  assistant: Pick<AssistantConfig, 'engine' | 'runtime_flavor'>,
): RunResult {
  const promptTokens = result.meta.usage?.input ?? 0
  const completionTokens = result.meta.usage?.output ?? 0

  return {
    text: result.text,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
    steps: 1,
    toolCallsUsed: result.toolCallsUsed,
    budgetExhausted: result.meta.error?.kind === 'retry_limit',
    providerError: !!result.meta.error,
    source: resolveRunSource(assistant, 'runtime'),
    diagnostics: {
      durationMs: result.meta.durationMs,
      model: result.meta.model,
      stopReason: result.meta.stopReason,
      error: result.meta.error,
      capabilitySurface: result.meta.capabilitySurface,
    },
    meta: {
      durationMs: result.meta.durationMs,
      model: result.meta.model,
      stopReason: result.meta.stopReason,
      error: result.meta.error,
    },
  }
}
