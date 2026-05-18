import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { OpenClawAgentParams } from '../OpenClawAgent.js'
import type { AgentRunResult } from '../types.js'
import { buildPrompt, resolveHermesRuntimeConfig } from '@lucid/hermes-runtime'
import type { EngineRunner } from './types.js'
import { getEngineMemoryAdapter } from '../adapters/memory/index.js'
import { defaultAgentGovernanceRuntime } from '../contracts/governance-runtime.js'
import { getHermesToolAdapter } from '../adapters/tools/index.js'
import { buildAgentCapabilitySurface } from '../contracts/capability-surface.js'
import { runHermesWithToolBridge } from './hermes-tool-bridge.js'
import { reportNativeMutationCandidateEvent, reportToolExecutionEvent } from '../../runtime/event-reporter.js'
import { deriveRuntimeEventSource } from '../../runtime/event-source.js'
import { buildMutationPolicyPrompt, getEngineMutationPolicy } from '../contracts/mutation-policy.js'
import { HermesLauncher } from './hermes/HermesLauncher.js'
import { routeModel } from '../model-router.js'
import { mapToolExecutionEventToProgress } from '../../core/progress/tool-events.js'
import { emitWorkerAIGenerationReceipt, inferWorkerProvider } from '../../ai/control-plane-receipts.js'

function resolveSharedHermesConfig(): ReturnType<typeof resolveHermesRuntimeConfig> {
  const port = Number.parseInt(process.env.PORT || process.env.WORKER_PORT || '3000', 10)
  const timeoutMs = Number.parseInt(process.env.HERMES_TIMEOUT_MS || '90000', 10)
  const controlPlaneUrl =
    process.env.LUCID_CONTROL_PLANE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || 'http://127.0.0.1:3000'

  return {
    command: process.env.HERMES_COMMAND?.trim() || 'hermes',
    args: [],
    workdir: process.env.HERMES_WORKDIR?.trim() || undefined,
    bridgeMode: 'observe',
    runtimeId: process.env.LUCID_RUNTIME_ID?.trim() || 'shared-hermes-runtime',
    runtimeKey: process.env.LUCID_RUNTIME_KEY?.trim() || 'shared-hermes-runtime-key',
    controlPlaneUrl,
    engineVersion: process.env.HERMES_ENGINE_VERSION?.trim() || 'hermes',
    runtimeVersion: process.env.HERMES_RUNTIME_VERSION?.trim() || 'lucid-hermes-runtime/shared',
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 90_000,
    workerTriggerSecret: process.env.WORKER_TRIGGER_SECRET?.trim() || undefined,
    model: process.env.HERMES_MODEL?.trim() || undefined,
    toolsets: (process.env.HERMES_TOOLSETS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  }
}

function resolveExecutionConfig(runtimeFlavor: string): ReturnType<typeof resolveHermesRuntimeConfig> {
  if (runtimeFlavor !== 'shared') {
    return resolveHermesRuntimeConfig({
      ...process.env,
      LUCID_BRIDGE_MODE: 'observe',
    })
  }

  return resolveSharedHermesConfig()
}

function resolveTrustGateInferenceMode(policyConfig: Record<string, unknown> | null | undefined): string {
  const trustgate = policyConfig?.trustgate
  if (trustgate && typeof trustgate === 'object' && !Array.isArray(trustgate)) {
    const mode = (trustgate as Record<string, unknown>).inference_mode
    if (mode === 'managed' || mode === 'byok' || mode === 'auto') return mode
  }
  const legacy = policyConfig?.inference_mode
  if (legacy === 'managed' || legacy === 'byok' || legacy === 'auto') return legacy
  return 'auto'
}

function buildHermesTrustGateHeaders(
  params: OpenClawAgentParams,
  runtimeFlavor: string,
  runId: string,
): Record<string, string> {
  return {
    'x-lucid-org-id': params.assistant.org_id ?? '',
    'x-lucid-user-id': params.userId ?? '',
    'x-lucid-assistant-id': params.assistant.id,
    'x-lucid-agent-id': params.assistant.id,
    'x-lucid-engine': 'hermes',
    'x-lucid-runtime-flavor': runtimeFlavor,
    'x-lucid-run-id': runId,
    'x-lucid-inference-mode': resolveTrustGateInferenceMode(params.assistant.policy_config),
  }
}

export class HermesEngineRunner implements EngineRunner {
  constructor(
    private readonly launcher = new HermesLauncher(),
  ) {}

  readonly engine = 'hermes' as const
  readonly capabilities = {
    sharedExecution: 'experimental',
    toolRuntime: 'experimental',
    approvals: 'experimental',
    usageAccounting: 'experimental',
    mutationPolicy: 'experimental',
  } as const

  private async ensureRunDir(runId: string): Promise<{ sessionFile: string; workspaceDir: string }> {
    const workspaceDir = path.join(os.tmpdir(), 'lucid-hermes-sessions', runId)
    await fs.mkdir(workspaceDir, { recursive: true })
    return {
      sessionFile: path.join(workspaceDir, 'session.json'),
      workspaceDir,
    }
  }

  private isBridgeResult(
    result: Awaited<ReturnType<typeof runHermesWithToolBridge>> | Awaited<ReturnType<typeof runHermesPromptDetailed>>,
  ): result is Awaited<ReturnType<typeof runHermesWithToolBridge>> {
    return 'steps' in result && 'toolCallsUsed' in result
  }

  async run(params: OpenClawAgentParams): Promise<AgentRunResult> {
    const runtimeFlavor = params.assistant.runtime_flavor ?? 'shared'
    const channelOwnership = runtimeFlavor === 'c2a_autonomous' ? 'runtime_native' : 'lucid_relay'
    const runtimeEventSource = deriveRuntimeEventSource({ runtimeFlavor, channelOwnership })
    const config = resolveExecutionConfig(runtimeFlavor)
    const strongModel = process.env.STRONG_MODEL || 'openai/gpt-4.1'
    const fastModel = process.env.FAST_MODEL || 'openai/gpt-4.1-mini'
    const routingResult = params.assistant.lucid_model === 'lucid-auto'
      ? routeModel(
          params.userMessage,
          strongModel,
          fastModel,
          params.messages.length,
        )
      : undefined
    const effectiveModel = routingResult?.model
      ?? params.assistant.lucid_model
      ?? config.model

    const runId = params.runId ?? crypto.randomUUID()
    const { sessionFile, workspaceDir } = await this.ensureRunDir(runId)

    const mutationPolicy = getEngineMutationPolicy(params.assistant.engine ?? 'hermes', runtimeFlavor)
    const mutationPolicyPrompt = buildMutationPolicyPrompt(mutationPolicy)

    const mountedMemory = getEngineMemoryAdapter((params.assistant.engine ?? 'hermes') as 'openclaw' | 'hermes').mountMemory({
      memories: params.memories,
      boardMemories: params.boardMemories ?? [],
      knowledgePromptPacket: params.knowledgePromptPacket ?? null,
    }, {
      engine: (params.assistant.engine ?? 'hermes') as 'openclaw' | 'hermes',
      runtimeFlavor,
      channelOwnership,
    })

    const capabilitySurface = await buildAgentCapabilitySurface({
      engine: 'hermes',
      runtimeFlavor,
      channelOwnership,
      assistant: params.assistant,
      plugins: params.plugins ?? [],
      supabase: params.supabase,
      userId: params.userId,
      runId,
      conversationId: params.conversationId,
      channelId: params.channelId,
      userMessage: params.userMessage,
      subagentDepth: params.subagentDepth ?? 0,
      sessionFile,
      workspaceDir,
      abortSignal: params.abortSignal,
      onToolEvent: (event) => {
        reportToolExecutionEvent({
          agentId: params.assistant.id,
          runId,
          source: runtimeEventSource,
          event,
        })
        const progressEvent = mapToolExecutionEventToProgress(event)
        if (progressEvent) {
          void params.onProgress?.(progressEvent)
        }
      },
      selection: {
        engine: 'hermes',
        model: effectiveModel,
      },
    })
    const toolSurface = capabilitySurface.tools
    const skillPrompt = capabilitySurface.skills.promptSection || undefined

    const promptInput = {
      assistantName: params.assistant.name,
      systemPrompt: mutationPolicyPrompt
        ? `${params.assistant.system_prompt}\n\n${mutationPolicyPrompt}`
        : params.assistant.system_prompt,
      recentMessages: params.messages
        .filter(
          (
            message,
          ): message is {
            role: 'user' | 'assistant'
            content: string
          } => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string',
        )
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
      memoryInjection: mountedMemory.promptMemoryInjection,
      boardMemories: mountedMemory.promptBoardMemories,
      conversationSummary: params.summary ?? null,
      skillPrompt,
      toolPrompt: getHermesToolAdapter().mount({
        assistant: params.assistant,
        plugins: params.plugins,
        surface: toolSurface,
      }).toolPrompt,
      userMessage: params.userMessage,
    }

    const hasStructuredTools = toolSurface.clientTools.length > 0
    const result = hasStructuredTools
      ? await runHermesWithToolBridge({
          config: {
            ...config,
            model: effectiveModel,
            trustGateHeaders: buildHermesTrustGateHeaders(params, runtimeFlavor, runId),
          },
          input: promptInput,
          toolSurface,
          mutationPolicy,
          onNativeMutationCandidate: (candidate) => {
            reportNativeMutationCandidateEvent({
              agentId: params.assistant.id,
              runId,
              source: runtimeEventSource,
              candidate,
            })
          },
          maxToolSteps: Math.max(1, Math.min(params.budget.maxToolCalls, 4)),
          timeoutMs: params.budget.maxWallTimeMs,
          signal: params.abortSignal,
          launcher: this.launcher,
        })
      : await runHermesPromptDetailed({
          ...config,
          model: effectiveModel,
          trustGateHeaders: buildHermesTrustGateHeaders(params, runtimeFlavor, runId),
        }, buildPrompt(promptInput), {
          timeoutMs: params.budget.maxWallTimeMs,
          signal: params.abortSignal,
        }, this.launcher)
    if (params.output) {
      await params.output.append(result.responseText)
    }

    const normalizedUsage = defaultAgentGovernanceRuntime.normalizeUsage({
      model: effectiveModel || 'default',
      promptTokens: result.tokenUsage.inputTokens,
      completionTokens: result.tokenUsage.outputTokens,
      source: 'estimated',
    })

    if (params.supabase && params.assistant.org_id) {
      defaultAgentGovernanceRuntime.persistRunUsage({
        assistant: params.assistant,
        supabase: params.supabase,
        usage: normalizedUsage,
      }).catch((error) => {
        console.error('[HermesEngineRunner] Cost tracking error:', error)
      })
    }

    void emitWorkerAIGenerationReceipt({
      supabase: params.supabase,
      orgId: params.assistant.org_id,
      agentId: params.assistant.id,
      userId: params.userId,
      projectId: params.assistant.project_id ?? null,
      runId,
      feature: 'agent-run',
      modality: 'agent-run',
      prompt: params.userMessage,
      success: true,
      model: effectiveModel,
      provider: inferWorkerProvider(process.env.TRUSTGATE_BASE_URL ?? process.env.LUCID_API_BASE_URL),
      usage: {
        inputTokens: normalizedUsage.inputTokens,
        outputTokens: normalizedUsage.outputTokens,
        totalTokens: normalizedUsage.inputTokens + normalizedUsage.outputTokens,
        estimatedCostUsd: normalizedUsage.estimatedCostUsd,
      },
      receipt: {
        provider: inferWorkerProvider(process.env.TRUSTGATE_BASE_URL ?? process.env.LUCID_API_BASE_URL),
        model: effectiveModel,
        latencyMs: (result as { durationMs?: number }).durationMs ?? 0,
        requestId: runId,
        metadata: {
          engine: 'hermes',
          runtimeFlavor,
          channelId: params.channelId,
          toolCallCount: this.isBridgeResult(result) ? result.toolCallsUsed : 0,
        },
      },
    })

    return {
      text: result.responseText,
      usage: {
        promptTokens: normalizedUsage.inputTokens,
        completionTokens: normalizedUsage.outputTokens,
      },
      steps: this.isBridgeResult(result) ? result.steps : 1,
      toolCallsUsed: this.isBridgeResult(result) ? result.toolCallsUsed : 0,
      budgetExhausted: this.isBridgeResult(result) ? result.budgetExhausted : false,
      diagnostics: {
        model: effectiveModel,
        capabilitySurface: capabilitySurface.introspection as unknown as Record<string, unknown>,
      },
    }
  }
}

async function runHermesPromptDetailed(
  config: ReturnType<typeof resolveHermesRuntimeConfig>,
  prompt: string,
  options: { timeoutMs?: number; signal?: AbortSignal },
  launcher: HermesLauncher,
) {
  return launcher.runPrompt(config, prompt, options)
}
