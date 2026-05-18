import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { runEmbeddedPiAgent } from '@lucid/openclaw-runtime'
import type { EmbeddedPiRunResult } from '@lucid/openclaw-runtime'
import type { AgentRuntime, RunTurnInput, RunTurnOutput } from './types.js'
import type { AIStreamOutput } from '../../routes/AIStreamOutput.js'
import type { ToolSurface } from '../tool-surface/types.js'
import { buildAgentCapabilitySurface } from '../contracts/capability-surface.js'
import { noopEmitter, type RuntimeEventEmitter } from './events.js'
import { getEngineMemoryAdapter } from '../adapters/memory/index.js'
import { reportToolExecutionEvent } from '../../runtime/event-reporter.js'
import { deriveRuntimeEventSource } from '../../runtime/event-source.js'
import { applyOpenAICompatEnv } from '../../ai/openai-compat-env.js'

const SESSION_BASE = path.join(os.tmpdir(), 'lucid-openclaw-sessions')

/**
 * Build per-run immutable OpenClaw config with SaaS lockdown.
 * Skills filesystem discovery and plugin auto-loading are ALWAYS disabled.
 * Both legacy and v2 paths must use this — never mutate a shared config object.
 *
 * SECURITY: This is the actual lockdown. The v2 path previously had NO skills/plugins
 * config, meaning FEATURE_RUNTIME_V2=true allowed filesystem skill discovery and
 * plugin auto-loading. This function ADDS those security-critical blocks.
 */
export function buildOpenClawRunConfig(llmBaseUrl: string) {
  return {
    tools: {
      deny: [] as string[],  // Populated by caller from toolSurface.openclawToolPolicy
      web: { search: { provider: 'brave' as const } },
    },
    skills: {
      load: {
        extraDirs: [] as string[],
        disabled: true,
      },
    },
    plugins: {
      enabled: false,
      installs: [] as string[],
    },
    models: {
      providers: {
        openai: {
          baseUrl: `${llmBaseUrl}/v1`,
          api: 'openai-completions' as const,
          models: [] as Array<{
            id: string
            contextWindow?: number
            input?: readonly ['text'] | readonly ['text', 'image']
          }>,
        },
      },
    },
  }
}

async function ensureSessionDir(conversationId: string) {
  const dir = path.join(SESSION_BASE, conversationId)
  await fs.mkdir(dir, { recursive: true })
  return { sessionFile: path.join(dir, 'session.json'), workspaceDir: dir }
}

/** Re-export for callers that need session cleanup (e.g., worker shutdown) */
export { SESSION_BASE }

export class EmbeddedRuntime implements AgentRuntime {
  constructor(private emitter: RuntimeEventEmitter = noopEmitter) {}

  async runTurn(input: RunTurnInput): Promise<RunTurnOutput> {
    const runId = input.runId
    const { sessionFile, workspaceDir } = await ensureSessionDir(input.conversationId)
    const runtimeFlavor = input.assistant.runtime_flavor ?? 'shared'
    const channelOwnership = runtimeFlavor === 'c2a_autonomous' ? 'runtime_native' : 'lucid_relay'
    const runtimeEventSource = deriveRuntimeEventSource({ runtimeFlavor, channelOwnership })

    if (input.embeddedConfig?.llmConfig) {
      applyOpenAICompatEnv(input.embeddedConfig.llmConfig)
    }

    // Build system prompt
    const systemParts: string[] = []
    if (input.assistant.system_prompt) systemParts.push(input.assistant.system_prompt)
    const mountedMemory = getEngineMemoryAdapter((input.assistant.engine ?? 'openclaw') as 'openclaw' | 'hermes').mountMemory({
      memories: input.memories,
    }, {
      engine: (input.assistant.engine ?? 'openclaw') as 'openclaw' | 'hermes',
      runtimeFlavor,
      channelOwnership,
    })
    systemParts.push(...mountedMemory.systemSections)

    // Detect streaming output
    const streamOutput = input.output && 'toolStart' in input.output
      ? input.output as AIStreamOutput
      : undefined

    // Build tool surface (collision guard, deny policy, executor)
    const capabilitySurface = await buildAgentCapabilitySurface({
      engine: input.assistant.engine ?? 'openclaw',
      runtimeFlavor,
      channelOwnership,
      assistant: input.assistant,
      plugins: input.plugins,
      supabase: input.supabase,
      userId: input.userId,
      runId,
      conversationId: input.conversationId,
      channelId: input.channelId,
      userMessage: input.userMessage,
      subagentDepth: input.subagentDepth ?? 0,
      sessionFile,
      workspaceDir,
      systemPrompt: systemParts.join('') || undefined,
      abortSignal: input.abortSignal,
      streamOutput,
      onToolEvent: (event) => {
        reportToolExecutionEvent({
          agentId: input.assistantId,
          runId,
          source: runtimeEventSource,
          event,
        })
      },
      selection: {
        engine: input.assistant.engine ?? 'openclaw',
        model: input.assistant.lucid_model,
        provider: 'openai',
      },
      runTurn: (subInput) => this.runTurn(subInput),
    })
    const toolSurface = capabilitySurface.tools

    // Build per-run immutable config with SaaS lockdown
    const llmBaseUrl = input.embeddedConfig?.llmConfig?.baseUrl || process.env.OPENAI_API_BASE || ''
    const openClawConfig = buildOpenClawRunConfig(llmBaseUrl)
    openClawConfig.tools.deny = [...toolSurface.openclawToolPolicy.tools.deny]
    openClawConfig.models.providers.openai.models = [
      {
        id: input.assistant.lucid_model,
        input:
          (input.images?.length ?? 0) > 0
            ? (['text', 'image'] as const)
            : (['text'] as const),
      },
    ]
    if ((input.images?.length ?? 0) > 0 && !openClawConfig.tools.deny.includes('image')) {
      // Lucid already injected image bytes for this run, so block OpenClaw's
      // native image tool from trying to re-fetch stale Discord CDN URLs.
      openClawConfig.tools.deny.push('image')
    }

    const skillsSnapshot = capabilitySurface.skills.snapshot

    let fullText = ''
    const startMs = Date.now()
    this.emitter.onRunStart({ runId, assistantId: input.assistantId, orgId: input.orgId, model: input.assistant.lucid_model })

    try {
      const result = await runEmbeddedPiAgent({
        sessionId: input.conversationId,
        sessionFile,
        workspaceDir,
        prompt: input.userMessage,
        images: input.images?.map(img => ({ type: 'image' as const, data: img.data, mimeType: img.mimeType })),
        skipPromptImageDetection: (input.images?.length ?? 0) > 0,
        provider: 'openai',
        model: input.assistant.lucid_model,
        config: openClawConfig,
        // DB-backed skills snapshot with SaaS lockdown fallback.
        // resolvedSkills MUST be [] (not undefined) — undefined triggers filesystem fallback
        // in skills-runtime.ts: `!params.skillsSnapshot.resolvedSkills` would be true.
        skillsSnapshot,
        temperature: input.assistant.temperature,
        maxOutputTokens: input.assistant.max_tokens,
        streamParams: {
          temperature: input.assistant.temperature,
          maxTokens: input.assistant.max_tokens,
        },
        timeoutMs: input.budget.maxWallTimeMs,
        runId,
        abortSignal: input.abortSignal,
        extraSystemPrompt: systemParts.join('') || undefined,
        agentDir: workspaceDir,
        clientTools: toolSurface.clientTools.length > 0 ? toolSurface.clientTools : undefined,
        clientToolExecutor: toolSurface.clientTools.length > 0 ? toolSurface.executor : undefined,
        onPartialReply: async ({ text }: { text?: string }) => {
          if (input.output && text) {
            const delta = text.slice(fullText.length)
            if (delta) await input.output.append(delta)
            fullText = text
          }
        },
        onReasoningStream: streamOutput
          ? async ({ text }: { text?: string }) => { if (text) streamOutput.reasoningStream(text) }
          : undefined,
        onReasoningEnd: streamOutput
          ? async () => { streamOutput.reasoningEnd() }
          : undefined,
        onAgentEvent: (evt: { stream: string; data: Record<string, unknown> }) => {
          if (evt.stream === 'tool') {
            console.log('[EmbeddedRuntime] Tool event:', evt.data)
          }
        },
      })

      const durationMs = Date.now() - startMs
      const mapped = this.mapResult(
        result,
        fullText,
        toolSurface,
        capabilitySurface.introspection as unknown as Record<string, unknown>,
        durationMs,
      )
      this.emitter.onRunEnd({ runId, durationMs, toolCallsUsed: mapped.toolCallsUsed, usage: mapped.meta.usage })
      return mapped
    } catch (err) {
      this.emitter.onRunError({ runId, error: err instanceof Error ? err : new Error(String(err)), phase: 'runTurn' })
      throw err
    }
  }

  private mapResult(
    result: EmbeddedPiRunResult,
    streamedText: string,
    toolSurface: ToolSurface,
    capabilitySurface: Record<string, unknown>,
    durationMs: number,
  ): RunTurnOutput {
    const responseText = result.payloads?.map(p => p.text).filter(Boolean).join('\n') || streamedText
    const usage = result.meta?.agentMeta?.usage
    return {
      text: responseText,
      toolCallsUsed: toolSurface.getToolCallCount(),
      meta: {
        durationMs,
        model: result.meta?.agentMeta?.model,
        usage: usage ? { input: usage.input, output: usage.output, total: (usage.input ?? 0) + (usage.output ?? 0) } : undefined,
        stopReason: result.meta?.stopReason,
        error: result.meta?.error ? { kind: result.meta.error.kind ?? 'unknown', message: result.meta.error.message ?? '' } : undefined,
        capabilitySurface,
      },
    }
  }
}
