import type { ToolSurface } from '../tool-surface/types.js'
import {
  buildPrompt,
  type HermesPromptInput,
  type HermesPromptResult,
  type HermesRuntimeConfig,
} from '@lucid/hermes-runtime'
import type { EngineMutationPolicy, EngineNativeMutationCandidate } from '../contracts/mutation-policy.js'
import { guardHermesNativeMutationToolCall } from './hermes-native-mutation-guard.js'
import { HermesLauncher } from './hermes/HermesLauncher.js'

const BRIDGE_PROTOCOL = [
  'You may either answer directly or request exactly one Lucid platform tool.',
  'If you need a tool, respond with strict JSON only:',
  '{"type":"tool_call","toolName":"<tool_name>","toolArgs":{}}',
  'When you are ready to answer the user, respond with strict JSON only:',
  '{"type":"final","text":"<answer>"}',
  'Do not wrap JSON in markdown. Do not emit any extra commentary outside the JSON object.',
].join('\n')

const MAX_TOOL_ARGS_HISTORY_CHARS = 1_000
const MAX_TOOL_RESULT_HISTORY_CHARS = 2_000

interface HermesToolCallEnvelope {
  type: 'tool_call'
  toolName: string
  toolArgs?: Record<string, unknown>
}

interface HermesFinalEnvelope {
  type: 'final'
  text: string
}

type HermesBridgeEnvelope = HermesToolCallEnvelope | HermesFinalEnvelope

export interface HermesToolBridgeParams {
  config: HermesRuntimeConfig
  input: HermesPromptInput
  toolSurface: ToolSurface
  launcher?: HermesLauncher
  mutationPolicy?: EngineMutationPolicy
  onNativeMutationCandidate?: (candidate: EngineNativeMutationCandidate) => void
  maxToolSteps: number
  signal?: AbortSignal
  timeoutMs?: number
}

export interface HermesToolBridgeResult {
  responseText: string
  tokenUsage: HermesPromptResult['tokenUsage']
  toolCallsUsed: number
  steps: number
  budgetExhausted: boolean
  nativeMutationCandidates: EngineNativeMutationCandidate[]
}

interface ParsedToolExecutionResult {
  error?: string
  approval_status?: 'denied' | 'expired'
}

interface ToolHistoryResultSummary {
  status: 'completed' | 'failed' | 'blocked'
  preview: string
}

function buildUnknownToolFallback(toolName: string, toolArgs: Record<string, unknown>): string {
  if (toolName === 'clarify') {
    const question = typeof toolArgs.question === 'string' ? toolArgs.question.trim() : ''
    if (question) return question
    return 'Could you clarify what you would like me to do?'
  }
  return `I can’t use the tool "${toolName}" in this runtime. Please rephrase your request and I’ll answer directly if I can.`
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    const candidate = fenced[1].trim()
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      return candidate
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return null
}

function parseBridgeEnvelope(text: string): HermesBridgeEnvelope | null {
  const json = extractJsonObject(text)
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (parsed.type === 'tool_call' && typeof parsed.toolName === 'string') {
      return {
        type: 'tool_call',
        toolName: parsed.toolName,
        toolArgs: typeof parsed.toolArgs === 'object' && parsed.toolArgs != null
          ? parsed.toolArgs as Record<string, unknown>
          : {},
      }
    }
    if (parsed.type === 'final' && typeof parsed.text === 'string') {
      return {
        type: 'final',
        text: parsed.text,
      }
    }
  } catch {
    return null
  }

  return null
}

function parseToolExecutionResult(text: string): ParsedToolExecutionResult | null {
  const json = extractJsonObject(text)
  if (!json) return null

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const error = typeof parsed.error === 'string' ? parsed.error : undefined
    const approvalStatus =
      parsed.approval_status === 'denied' || parsed.approval_status === 'expired'
        ? parsed.approval_status
        : undefined
    if (!error && !approvalStatus) {
      return null
    }
    return {
      error,
      approval_status: approvalStatus,
    }
  } catch {
    return null
  }
}

function trimForHistory(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`
}

function summarizeToolResult(text: string): ToolHistoryResultSummary {
  const parsed = parseToolExecutionResult(text)
  if (parsed?.approval_status) {
    return {
      status: 'blocked',
      preview: trimForHistory(parsed.error ?? text, MAX_TOOL_RESULT_HISTORY_CHARS),
    }
  }
  if (parsed?.error) {
    return {
      status: 'failed',
      preview: trimForHistory(parsed.error, MAX_TOOL_RESULT_HISTORY_CHARS),
    }
  }
  return {
    status: 'completed',
    preview: trimForHistory(text, MAX_TOOL_RESULT_HISTORY_CHARS),
  }
}

export async function runHermesWithToolBridge(params: HermesToolBridgeParams): Promise<HermesToolBridgeResult> {
  const launcher = params.launcher ?? new HermesLauncher()
  let aggregateInputTokens = 0
  let aggregateOutputTokens = 0
  let aggregateCostUsd = 0
  const toolHistory: string[] = []
  const nativeMutationCandidates: EngineNativeMutationCandidate[] = []
  const maxSteps = Math.max(1, params.maxToolSteps)

  for (let step = 0; step <= maxSteps; step++) {
    const prompt = buildPrompt({
      ...params.input,
      systemPrompt: [
        params.input.systemPrompt?.trim(),
        BRIDGE_PROTOCOL,
        toolHistory.length > 0 ? `Tool interaction history:\n${toolHistory.join('\n\n')}` : null,
      ].filter(Boolean).join('\n\n'),
    })

    const result = await launcher.runPrompt(
      {
        ...params.config,
        model: params.config.model,
      },
      prompt,
      {
        timeoutMs: params.timeoutMs,
        signal: params.signal,
      },
    )

    aggregateInputTokens += result.tokenUsage.inputTokens
    aggregateOutputTokens += result.tokenUsage.outputTokens
    aggregateCostUsd += result.tokenUsage.estimatedCostUsd

    const parsed = parseBridgeEnvelope(result.responseText)
    if (!parsed) {
      return {
        responseText: result.responseText,
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
        toolCallsUsed: params.toolSurface.getToolCallCount(),
        steps: step + 1,
        budgetExhausted: false,
        nativeMutationCandidates,
      }
    }

    if (parsed.type === 'final') {
      return {
        responseText: parsed.text,
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
        toolCallsUsed: params.toolSurface.getToolCallCount(),
        steps: step + 1,
        budgetExhausted: false,
        nativeMutationCandidates,
      }
    }

    if (params.mutationPolicy) {
      const guardResult = guardHermesNativeMutationToolCall(
        params.mutationPolicy,
        parsed.toolName,
        parsed.toolArgs ?? {},
      )
      if (guardResult.blocked) {
        if (guardResult.candidate) {
          nativeMutationCandidates.push(guardResult.candidate)
          params.onNativeMutationCandidate?.(guardResult.candidate)
        }
        return {
          responseText: guardResult.responseText ?? 'This Hermes-native mutation is not allowed in the current runtime.',
          tokenUsage: {
            inputTokens: aggregateInputTokens,
            outputTokens: aggregateOutputTokens,
            estimatedCostUsd: aggregateCostUsd,
          },
          toolCallsUsed: params.toolSurface.getToolCallCount(),
          steps: step + 1,
          budgetExhausted: false,
          nativeMutationCandidates,
        }
      }
    }

    if (!params.toolSurface.allowlist.has(parsed.toolName)) {
      return {
        responseText: buildUnknownToolFallback(parsed.toolName, parsed.toolArgs ?? {}),
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
        toolCallsUsed: params.toolSurface.getToolCallCount(),
        steps: step + 1,
        budgetExhausted: false,
        nativeMutationCandidates,
      }
    }

    const toolResult = await params.toolSurface.executor(parsed.toolName, parsed.toolArgs ?? {})
    const toolMeta = parseToolExecutionResult(toolResult)
    const toolSummary = summarizeToolResult(toolResult)
    toolHistory.push(
      `Tool request ${step + 1}: ${trimForHistory(
        JSON.stringify({
          toolName: parsed.toolName,
          toolArgs: parsed.toolArgs ?? {},
        }),
        MAX_TOOL_ARGS_HISTORY_CHARS,
      )}\nTool result ${step + 1}: ${JSON.stringify(toolSummary)}`,
    )

    if (toolMeta?.approval_status && toolMeta.error) {
      return {
        responseText: toolMeta.error,
        tokenUsage: {
          inputTokens: aggregateInputTokens,
          outputTokens: aggregateOutputTokens,
          estimatedCostUsd: aggregateCostUsd,
        },
        toolCallsUsed: params.toolSurface.getToolCallCount(),
        steps: step + 1,
        budgetExhausted: false,
        nativeMutationCandidates,
      }
    }
  }

  return {
    responseText: 'I could not complete the tool workflow within the allowed number of steps.',
    tokenUsage: {
      inputTokens: aggregateInputTokens,
      outputTokens: aggregateOutputTokens,
      estimatedCostUsd: aggregateCostUsd,
    },
    toolCallsUsed: params.toolSurface.getToolCallCount(),
    steps: maxSteps + 1,
    budgetExhausted: true,
    nativeMutationCandidates,
  }
}
