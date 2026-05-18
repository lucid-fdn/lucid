/**
 * OpenClawAgent — Thin wrapper around OpenClaw's `runEmbeddedPiAgent`.
 *
 * Replaces AgentLoop.ts (~1150 lines) with OpenClaw's own agent runtime.
 * This file is the ONLY custom agent code — everything else is OpenClaw.
 *
 * Responsibilities:
 * - Maps our AssistantConfig/plugins/budget to OpenClaw params
 * - Bridges streaming (onPartialReply → ChannelOutput.append)
 * - Manages temp session files (OpenClaw uses file-based sessions)
 * - Wraps our PluginBridge tools as OpenClaw clientTools with inline execution
 * - Maps EmbeddedPiRunResult → AgentRunResult
 */

import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelOutput } from '../channels/ChannelOutput.js'
import type { AIStreamOutput } from '../routes/AIStreamOutput.js'
import type { ActivatedPlugin } from './plugin-types.js'
import { toWireToolName, parseWireToolName } from './plugin-types.js'
import { executePluginTool, type PluginToolContext } from './PluginBridge.js'
import { buildNangoBinding } from './oauth-tools/types.js'
import { executeBuiltInTool, isBuiltInTool, resetRunToolCalls } from './BuiltInToolExecutor.js'
import { renderCrewContextPrompt, type CrewContext } from './runtime-tools/crew-context.js'
import { DANGER_TOOLS, CommandsAllowlist } from './CommandsAllowlist.js'
import { redact } from '../utils/pii-redactor.js'
import { buildToolPrompt } from '@lucid-fdn/agent-tools-core'
import type { EnrichedToolDefinition } from '@lucid-fdn/agent-tools-core'
import type { BuiltInToolExecutorParams } from './BuiltInToolExecutor.js'
import type {
  AgentRunResult,
  AssistantConfig,
  AgentMessage,
  RunBudget,
} from './types.js'
import { runEmbeddedPiAgent } from '@lucid/openclaw-runtime'
import type { EmbeddedPiRunResult } from '@lucid/openclaw-runtime'
import { getRuntime } from './runtime/index.js'
import type { RunTurnOutput } from './runtime/types.js'
import { logAgentTurnMetrics } from '../observability/agent-metrics.js'
import { toolCache } from '../lib/cache/tool-cache.js'
import { routeModel } from './model-router.js'
import { REVERSE_TOOL_NAME_MAP } from './tool-surface/compat-names.js'
import { getConfig } from '../config.js'
import { defaultAgentGovernanceRuntime } from './contracts/governance-runtime.js'
import { emitReceipt } from '../services/receipt-emitter.js'
import { createIntrospectionEmitter, type IntrospectionEmitter } from '../observability/introspection-emitter.js'
import { getEngineMemoryAdapter } from './adapters/memory/index.js'
import { getOpenClawToolAdapter } from './adapters/tools/index.js'
import { reportToolExecutionEvent } from '../runtime/event-reporter.js'
import { deriveRuntimeEventSource } from '../runtime/event-source.js'
import { applyOpenAICompatEnv } from '../ai/openai-compat-env.js'
import { emitWorkerAIGenerationReceipt, inferWorkerProvider } from '../ai/control-plane-receipts.js'
import { buildAgentCapabilitySurface } from './contracts/capability-surface.js'
import type { KnowledgePromptPacket } from '../knowledge/types.js'
import { loadAgentIdentityPromptSections, loadSharedContextPromptSections } from './identity/package.js'
import type { ChannelProgressEmitter } from '../core/progress/types.js'
import { mapToolExecutionEventToProgress } from '../core/progress/tool-events.js'

// Re-export types for callers
export type { AgentRunResult, AssistantConfig, AgentMessage, RunBudget }

/* ─── Model Context Windows ────────────────────────────── */

/**
 * Fetches model context windows from TrustGate `/v1/models` and caches them.
 * Single source of truth — no static map to drift vs GATEWAY_MODEL_META.
 *
 * Without this, OpenClaw falls back to DEFAULT_CONTEXT_TOKENS (200K) for
 * models it doesn't recognize (e.g. TrustGate model strings), which makes
 * the single-result cap too generous (~100K tokens per tool result).
 *
 * Fallback: 128K for unknown models or when TrustGate is unreachable.
 */
const DEFAULT_CONTEXT_WINDOW = 128_000
let modelContextWindowCache: Record<string, number> | null = null
let modelContextWindowFetchPromise: Promise<Record<string, number>> | null = null

async function fetchModelContextWindows(): Promise<Record<string, number>> {
  const baseUrl = process.env.OPENAI_API_BASE
  const apiKey = process.env.OPENAI_API_KEY
  if (!baseUrl || !apiKey) return {}

  try {
    const url = `${baseUrl}/v1/models`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return {}

    const body = await res.json() as { data?: Array<{ id?: string; context_window?: number }> }
    const map: Record<string, number> = {}
    for (const m of body.data ?? []) {
      if (m.id && typeof m.context_window === 'number' && m.context_window > 0) {
        map[m.id] = m.context_window
        // Index by short name too (gpt-4o → openai/gpt-4o context window)
        // so alias lookups don't silently fall back to default.
        const slash = m.id.indexOf('/')
        if (slash !== -1) {
          const shortName = m.id.slice(slash + 1)
          if (!map[shortName]) map[shortName] = m.context_window
        }
      }
    }
    console.log(`[OpenClawAgent] Cached context windows for ${Object.keys(map).length} models from TrustGate`)
    return map
  } catch {
    console.warn('[OpenClawAgent] Failed to fetch model context windows from TrustGate, using defaults')
    return {}
  }
}

/**
 * Lazy-fetch + cache model context windows from TrustGate.
 * Called once per process, deduped via promise. Returns immediately
 * on subsequent calls.
 */
async function ensureModelContextWindows(): Promise<void> {
  if (modelContextWindowCache) return
  if (!modelContextWindowFetchPromise) {
    modelContextWindowFetchPromise = fetchModelContextWindows()
  }
  modelContextWindowCache = await modelContextWindowFetchPromise
}

function getModelContextWindow(modelId: string): number {
  if (!modelContextWindowCache) return DEFAULT_CONTEXT_WINDOW
  // Try exact match first, then with/without provider prefix
  return modelContextWindowCache[modelId]
    ?? modelContextWindowCache[`openai/${modelId}`]
    ?? modelContextWindowCache[`anthropic/${modelId}`]
    ?? modelContextWindowCache[`google/${modelId}`]
    ?? DEFAULT_CONTEXT_WINDOW
}

function normalizeModelForProvider(modelId: string, baseUrl: string): string {
  if (!modelId) return modelId

  const normalizedBaseUrl = baseUrl.toLowerCase()
  const isDirectOpenAI =
    normalizedBaseUrl.includes('api.openai.com') &&
    !normalizedBaseUrl.includes('lucid')

  if (isDirectOpenAI && modelId.startsWith('openai/')) {
    return modelId.slice('openai/'.length)
  }

  return modelId
}

/* ─── Tool Result Size Cap ─────────────────────────────── */

/**
 * Hard cap on any single tool result returned to OpenClaw (chars).
 * Defense-in-depth: even if OpenClaw's context guard uses a generous budget,
 * no single tool result should overwhelm the LLM context.
 *
 * 80K chars ≈ 20-40K tokens depending on content density.
 * This leaves ample room for system prompt, conversation, and output.
 */
const MAX_TOOL_RESULT_CHARS = 80_000
const TOOL_RESULT_TRUNCATION_SUFFIX = '\n\n[truncated: output exceeded size limit — results are partial. Use more specific filters or smaller page sizes to get complete data.]'
const MIDDLE_OMISSION_MARKER = '\n\n[... middle content omitted — showing head and tail ...]\n\n'

/**
 * Head+tail truncation strategy (matches OpenClaw's approach).
 * Preserves errors, JSON closings, and summaries that appear at the end.
 */
function capToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result
  const budget = Math.max(2_000, MAX_TOOL_RESULT_CHARS - TOOL_RESULT_TRUNCATION_SUFFIX.length)

  // Check if tail contains important content (errors, JSON structure, summaries)
  const tail = result.slice(-2000).toLowerCase()
  const hasImportantTail =
    /\b(error|exception|failed|fatal|traceback|panic|total|summary|result|complete)\b/.test(tail) ||
    /\}\s*$/.test(tail.trim())

  if (hasImportantTail && budget > 4_000) {
    // Head+tail: keep 70% head, 30% tail (max 4K tail)
    const tailBudget = Math.min(Math.floor(budget * 0.3), 4_000)
    const headBudget = budget - tailBudget - MIDDLE_OMISSION_MARKER.length
    if (headBudget > 2_000) {
      let headCut = headBudget
      const headNewline = result.lastIndexOf('\n', headBudget)
      if (headNewline > headBudget * 0.8) headCut = headNewline

      let tailStart = result.length - tailBudget
      const tailNewline = result.indexOf('\n', tailStart)
      if (tailNewline !== -1 && tailNewline < tailStart + tailBudget * 0.2) tailStart = tailNewline + 1

      return result.slice(0, headCut) + MIDDLE_OMISSION_MARKER + result.slice(tailStart) + TOOL_RESULT_TRUNCATION_SUFFIX
    }
  }

  // Default: head-only
  let cutPoint = budget
  const newline = result.lastIndexOf('\n', budget)
  if (newline > budget * 0.7) cutPoint = newline
  return result.slice(0, cutPoint) + TOOL_RESULT_TRUNCATION_SUFFIX
}

/* ─── LLM Env Config (set-once, no per-request mutation) ── */

/**
 * Set OPENAI_API_KEY / OPENAI_API_BASE once for the process.
 * OpenClaw's streamSimple reads these from process.env.
 * All tenants share the same TrustGate endpoint so this is safe.
 * When BYOK per-tenant routing is added, this must be replaced with
 * OpenClaw config params (upstream PR) instead of env mutation.
 */
function ensureLlmEnv(llmConfig: { baseUrl: string; apiKey: string }): void {
  applyOpenAICompatEnv(llmConfig)
  // Patch global fetch to fix null content in assistant messages.
  // OpenClaw sends content:null on tool-call assistant messages (valid per OpenAI spec)
  // but TrustGate's Zod validation rejects it. This intercepts LLM API calls and
  // converts null content to "" so multi-turn tool loops don't crash on the second turn.
  patchFetchForNullContent(llmConfig.baseUrl)
}

let _fetchPatched = false
function patchFetchForNullContent(trustGateBaseUrl: string): void {
  if (_fetchPatched) return
  _fetchPatched = true

  const originalFetch = globalThis.fetch
  globalThis.fetch = async function patchedFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    // Only intercept POST requests to TrustGate LLM endpoints
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (
      init?.method?.toUpperCase() === 'POST' &&
      url.startsWith(trustGateBaseUrl) &&
      typeof init.body === 'string'
    ) {
      try {
        const body = JSON.parse(init.body)
        if (Array.isArray(body.messages)) {
          let patched = false
          for (const msg of body.messages) {
            if (msg.content === null || msg.content === undefined) {
              msg.content = ''
              patched = true
            }
          }
          if (patched) {
            init = { ...init, body: JSON.stringify(body) }
          }
        }
      } catch { /* not JSON or no messages — pass through */ }
    }
    const fetchStart = Date.now()
    const res = await originalFetch(input, init)
    const fetchMs = Date.now() - fetchStart
    if (url.includes('/chat/completions')) {
      let model = 'unknown'
      try { model = JSON.parse(init?.body as string)?.model || 'unknown' } catch {}
      const isStream = init?.body?.toString().includes('"stream":true') || false
      console.log(`[fetch-timing] ⏱ inference request → ${res.status} in ${fetchMs}ms (method=${init?.method || 'GET'}, stream=${isStream}, model=${model})`)
    }
    return res
  } as typeof globalThis.fetch
}

/* ─── Session Directory (Per-Run Isolation) ────────────── */
//
// Filesystem is TEMPORARY SCRATCH ONLY — not a state store.
// DB is the source of truth for conversation history, memory, and state.
// Each run gets its own isolated directory keyed by runId (UUID).
// Directories are cleaned up in a finally block after every run.
// This prevents:
//   - Path reuse / poisoned session files across runs
//   - Cross-user filesystem conflicts on shared instances
//   - Stale state surviving deployments or crashes
//

const SESSION_BASE = path.join(os.tmpdir(), 'lucid-openclaw-sessions')

/**
 * Create an isolated per-run session directory.
 * Uses runId (UUID) — guaranteed unique, never reused.
 * If the directory already exists (shouldn't happen), wipe it first.
 */
async function ensureRunDir(runId: string): Promise<{ sessionFile: string; workspaceDir: string }> {
  const dir = path.join(SESSION_BASE, runId)
  // Defensive: wipe if exists (belt-and-suspenders against UUID collision)
  try { await fs.rm(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  await fs.mkdir(dir, { recursive: true })
  return {
    sessionFile: path.join(dir, 'session.json'),
    workspaceDir: dir,
  }
}

/** Remove a run directory. Non-fatal — best effort cleanup. */
async function cleanupRunDir(runId: string): Promise<void> {
  try {
    await fs.rm(path.join(SESSION_BASE, runId), { recursive: true, force: true })
  } catch { /* ignore — container will reclaim on next deploy */ }
}

/**
 * Remove orphaned session directories (safety net).
 * Called periodically from the worker polling loop — non-fatal if it fails.
 * With per-run isolation + finally cleanup, this should rarely find anything.
 */
export async function cleanupStaleSessions(): Promise<number> {
  const MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2h (runs shouldn't last longer)
  try {
    const entries = await fs.readdir(SESSION_BASE, { withFileTypes: true }).catch(() => [])
    const now = Date.now()
    let cleaned = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(SESSION_BASE, entry.name)
      try {
        const dirStat = await fs.stat(dir)
        if (now - dirStat.mtimeMs > MAX_AGE_MS) {
          await fs.rm(dir, { recursive: true, force: true })
          cleaned++
        }
      } catch { /* ignore */ }
    }
    return cleaned
  } catch {
    return 0
  }
}

/* ─── OpenClaw Native Tools ────────────────────────────── */

/**
 * Safe OpenClaw native tools always enabled for all assistants.
 * These are read-only, no-risk tools that every agent benefits from.
 * Dangerous tools (exec, bash, browser, write, edit, etc.) are blocked
 * by the tools.allow policy — only these survive the filter.
 *
 * - web_search: Brave/Perplexity/Grok/Gemini/Kimi (auto-skipped if no API key set)
 * - web_fetch: Direct URL fetch with SSRF protection (no API key needed)
 * - image: Analyze images via URL using vision models (auto-skipped if no agentDir)
 * - pdf: Analyze PDFs via URL using vision models (auto-skipped if no agentDir)
 */
const OPENCLAW_NATIVE_ALLOW_BASE = ['web_search', 'web_fetch', 'image', 'pdf'] as const

function getOpenClawNativeAllow(images?: Array<{ data: string; mimeType: string }>): string[] {
  // When Lucid already injects image inputs, keep OpenClaw from re-fetching the
  // same Discord CDN URL through its native image tool path.
  if ((images?.length ?? 0) > 0) {
    return OPENCLAW_NATIVE_ALLOW_BASE.filter(tool => tool !== 'image')
  }
  return [...OPENCLAW_NATIVE_ALLOW_BASE]
}

/** Build a lookup map: wireName → PluginToolContext */
function buildPluginContextMap(plugins?: ActivatedPlugin[]): Map<string, PluginToolContext> {
  const map = new Map<string, PluginToolContext>()
  if (!plugins?.length) return map
  for (const p of plugins) {
    for (const t of p.tools) {
      const wireName = toWireToolName(p.slug, t.name)
      map.set(wireName, {
        pluginSlug: p.slug,
        config: p.config || {},
        // UCA fields — carried from DB, no derivation
        trustLevel: p.trustLevel,
        executionMode: p.executionMode,
        transport: p.transport,
        authType: p.authType,
        authProvider: p.authProvider,
        connectionId: p.connectionId,
        mcpgateServerId: p.mcpgateServerId,
        endpointUrl: p.endpointUrl,
        fallbackMode: p.fallbackMode,
        source: p.source,
      })
    }
  }
  return map
}

/**
 * Create the clientToolExecutor that routes tool calls.
 *
 * Dispatch order:
 * 1. Built-in trading tools → BuiltInToolExecutor (with ToolContext + agentWallets)
 * 2. Plugin tools → PluginBridge (embedded or HTTP)
 *
 * Tools execute inline within OpenClaw's agent loop — no multi-turn needed.
 */
function createToolExecutor(
  pluginCtxMap: Map<string, PluginToolContext>,
  builtInParams?: BuiltInToolExecutorParams,
  streamOutput?: AIStreamOutput,
  introspection?: IntrospectionEmitter,
) {
  let toolCallCount = 0
  const MAX_EXECUTOR_TOOL_CALLS = 25
  let halted = false

  return {
    get toolCallCount() { return toolCallCount },
    executor: async (toolName: string, params: Record<string, unknown>): Promise<string> => {
      // Hard stop: once halted, return empty string immediately.
      // pi-agent-core feeds tool results back to the LLM — if we return error
      // strings, the LLM ignores them and retries. An empty result gives it
      // nothing to work with, forcing it to produce a text response and exit.
      if (halted) {
        return ''
      }

      toolCallCount++
      if (toolCallCount > MAX_EXECUTOR_TOOL_CALLS) {
        halted = true
        console.warn(`[OpenClawAgent] ⛔ Executor halted: ${toolCallCount} tool calls exceeded limit of ${MAX_EXECUTOR_TOOL_CALLS}`)
        return ''
      }

      // Deny-by-default: block any tool not explicitly in our allowlists.
      // Built-in tools pass via isBuiltInTool(). Plugin tools pass via pluginCtxMap
      // (includes Nango integrations via transport: 'nango').
      // OpenClaw native tools (web_search, web_fetch, image, pdf) are handled by
      // OpenClaw's own policy pipeline and never reach this executor.
      // Everything else is BLOCKED — prevents surprise exposure on subtree pulls.
      if (!isBuiltInTool(toolName) && !pluginCtxMap.has(toolName)) {
        if (DANGER_TOOLS.has(toolName)) {
          console.error(`[OpenClawAgent] SECURITY: Blocked dangerous tool: ${toolName}`)
        } else {
          console.warn(`[OpenClawAgent] BLOCKED tool call: ${toolName} (not in allowlist)`)
        }
        return JSON.stringify({ error: `Tool "${toolName}" is not allowed.` })
      }

      toolCallCount++
      const toolCallId = crypto.randomUUID()

      // 1. Try built-in trading/blockchain tools first
      if (isBuiltInTool(toolName) && builtInParams) {
        const toolStartMs = Date.now()
        console.log(`[OpenClawAgent] Executing built-in tool: ${toolName}`, JSON.stringify(params).slice(0, 200))
        streamOutput?.toolStart(toolCallId, toolName)
        introspection?.emit('tool_start', {
          tool_name: toolName,
          args_preview: JSON.stringify(params).slice(0, 200),
        }, toolCallId)

        try {
          const result = await executeBuiltInTool(toolName, params, builtInParams, toolCallId)
          if (result !== null) {
            const capped = capToolResult(result)
            if (capped.length < result.length) {
              console.warn(`[OpenClawAgent] Tool ${toolName} result truncated: ${result.length} → ${capped.length} chars`)
            }
            const durationMs = Date.now() - toolStartMs
            console.log(`[OpenClawAgent] ⏱ Tool ${toolName} completed in ${durationMs}ms (first 200):`, capped.slice(0, 200))
            streamOutput?.toolResult(toolCallId, capped)
            introspection?.emit('tool_result', {
              tool_name: toolName,
              duration_ms: durationMs,
              success: true,
              output_preview: capped.slice(0, 200),
            }, toolCallId)
            return capped
          }
          // result === null means not handled, fall through to plugin path
        } catch (err) {
          const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : 'Tool execution failed'
          console.error(`[OpenClawAgent] Tool ${toolName} THREW:`, errorMsg)
          streamOutput?.toolError(toolCallId, errorMsg)
          introspection?.emit('tool_error', {
            tool_name: toolName,
            error: errorMsg.slice(0, 500),
            duration_ms: Date.now() - toolStartMs,
          }, toolCallId)
          return JSON.stringify({ error: errorMsg })
        }
      } else if (isBuiltInTool(toolName) && !builtInParams) {
        console.error(`[OpenClawAgent] Built-in tool ${redact(toolName)} called without runtime DB/user context`)
      }

      // 2. Plugin tools via PluginBridge (includes Nango integrations)
      const parsed = parseWireToolName(toolName)
      const ctx = pluginCtxMap.get(toolName)

      if (!parsed || !ctx) {
        console.warn(`[OpenClawAgent] Unknown tool: ${toolName}`)
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
      }

      const displayName = `${parsed.pluginSlug}:${parsed.toolName}`
      const pluginToolStartMs = Date.now()
      console.log(`[OpenClawAgent] Executing tool: ${displayName}`)

      // Emit tool start to stream (shows "running..." in chain-of-thought)
      streamOutput?.toolStart(toolCallId, displayName)
      introspection?.emit('tool_start', {
        tool_name: displayName,
        args_preview: JSON.stringify(params).slice(0, 200),
      }, toolCallId)

      try {
        const result = await executePluginTool(parsed.pluginSlug, parsed.toolName, params, ctx)
        const capped = capToolResult(result)
        if (capped.length < result.length) {
          console.warn(`[OpenClawAgent] Plugin tool ${displayName} result truncated: ${result.length} → ${capped.length} chars`)
        }
        const durationMs = Date.now() - pluginToolStartMs
        // Emit tool result (shows "done" in chain-of-thought)
        streamOutput?.toolResult(toolCallId, capped)
        introspection?.emit('tool_result', {
          tool_name: displayName,
          duration_ms: durationMs,
          success: true,
          output_preview: capped.slice(0, 200),
        }, toolCallId)
        return capped
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Tool execution failed'
        streamOutput?.toolError(toolCallId, errorMsg)
        introspection?.emit('tool_error', {
          tool_name: displayName,
          error: errorMsg.slice(0, 500),
          duration_ms: Date.now() - pluginToolStartMs,
        }, toolCallId)
        return JSON.stringify({ error: errorMsg })
      }
    },
  }
}

/* ─── Result Mapping ────────────────────────────────────── */

/** User-friendly error messages replacing raw LLM provider dumps. */
const FRIENDLY_ERRORS: Array<{ test: (t: string) => boolean; message: string }> = [
  {
    test: (t) => /credit|billing|insufficient.*(quota|balance|credit)|run out of credits/i.test(t),
    message: "I'm temporarily unable to respond — the AI service has a billing issue. Your team has been notified. Please try again shortly.",
  },
  {
    test: (t) => /rate limit|too many requests|throttl|429\b/i.test(t),
    message: "I'm experiencing high demand right now. Please try again in a moment.",
  },
  {
    test: (t) => /overloaded|503|502|service unavailable/i.test(t),
    message: "The AI service is temporarily unavailable. Please try again in a moment.",
  },
  {
    test: (t) => /litellm|healthy deployments|model[_ -]?group|fallback model group|badrequesterror|HTTP 400/i.test(t),
    message: "The AI service is temporarily unavailable. Please try again in a moment.",
  },
  {
    test: (t) => /context.*(overflow|length|window|exceeded)|prompt.*too (large|long)|request_too_large/i.test(t),
    message: "The conversation has grown too long for the model to process. Please start a new conversation.",
  },
  {
    test: (t) => /timed? ?out/i.test(t),
    message: "The request timed out. Please try again.",
  },
]

/**
 * If the text looks like a provider error, return a sanitized user-friendly message.
 * Returns null if the text is normal assistant output.
 */
export function sanitizeProviderError(text: string): string | null {
  if (!text) return null
  for (const { test, message } of FRIENDLY_ERRORS) {
    if (test(text)) return message
  }
  return null
}

function mapResult(
  result: EmbeddedPiRunResult,
  streamedText: string,
  toolCallsUsed: number,
  diagnostics?: AgentRunResult['diagnostics'],
): AgentRunResult {
  const hasError = result.payloads?.some(p => p.isError) ?? false
  const rawText = result.payloads?.map(p => p.text).filter(Boolean).join('\n') || streamedText
  const usage = result.meta?.agentMeta?.usage

  // When OpenClaw returns error payloads, sanitize the text to a user-friendly message.
  // OpenClaw's formatAssistantErrorText() produces messages that reference /reset, /new etc.
  // which don't apply in our SaaS context. Replace with our own friendly copy.
  let responseText = rawText
  let hasProviderError = false
  const friendly = rawText ? sanitizeProviderError(rawText) : null
  if ((hasError || friendly) && rawText) {
    if (friendly) {
      responseText = friendly
      hasProviderError = true
    } else {
      // Fallback: if we can't classify the error, use a generic friendly message
      // rather than dumping raw LLM error JSON to the user
      responseText = "I encountered an issue processing your request. Please try again."
      hasProviderError = true
      console.warn(`[OpenClawAgent] Unclassified provider error sanitized: ${rawText.slice(0, 200)}`)
    }
  }

  return {
    text: responseText,
    usage: {
      promptTokens: usage?.input ?? 0,
      completionTokens: usage?.output ?? 0,
    },
    steps: result.meta?.agentMeta?.compactionCount ?? 1,
    toolCallsUsed,
    budgetExhausted: result.meta?.error?.kind === 'retry_limit',
    hasProviderError,
    diagnostics: {
      model: result.meta?.agentMeta?.model,
      durationMs: result.meta?.durationMs,
      stopReason: result.meta?.stopReason,
      error: result.meta?.error
        ? {
            kind: result.meta.error.kind ?? 'unknown',
            message: result.meta.error.message ?? '',
          }
        : undefined,
      ...diagnostics,
    },
  }
}

/* ─── Params ────────────────────────────────────────────── */

export interface ImageAttachment {
  /** base64-encoded image data */
  data: string
  /** MIME type e.g. "image/png" */
  mimeType: string
}

export interface OpenClawAgentParams {
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
  abortSignal?: AbortSignal
  /** Image attachments for multimodal input */
  images?: ImageAttachment[]
  /** TrustGate LLM config */
  llmConfig: { baseUrl: string; apiKey: string }
  /** Supabase client for built-in tool context (trading tools, etc.) */
  supabase?: SupabaseClient
  /** Current subagent depth (0 = top-level, incremented by spawn_subagent) */
  subagentDepth?: number
  /** Originating channel ID — threaded to scheduler for delivery routing */
  channelId?: string
  /** Rolling conversation summary from ConversationCompactor (Phase 2) */
  summary?: string
  /** Crew membership context for multi-agent orchestration */
  crewContext?: CrewContext | null
  /** Org-level board memories (shared knowledge across all agents) */
  boardMemories?: string[]
  /** Shared Knowledge packet consumed by every engine when enabled. */
  knowledgePromptPacket?: KnowledgePromptPacket | null
  /** Engine-agnostic progress hook rendered by the channel layer. */
  onProgress?: ChannelProgressEmitter
}

/* ─── Main Entry Point ──────────────────────────────────── */

/**
 * Run the OpenClaw Pi Agent for a single inbound message.
 * Drop-in replacement for AgentLoop.run() — same params, same result shape.
 *
 * Plugin tools execute inline via clientToolExecutor → PluginBridge,
 * within the agent's own loop. No multi-turn tool call dance needed.
 */
async function legacyRunOpenClawAgent(params: OpenClawAgentParams): Promise<AgentRunResult> {
  const prepStartMs = Date.now()
  const runId = params.runId || crypto.randomUUID()
  const runtimeFlavor = params.assistant.runtime_flavor ?? 'shared'
  const channelOwnership = runtimeFlavor === 'c2a_autonomous' ? 'runtime_native' : 'lucid_relay'
  const runtimeEventSource = deriveRuntimeEventSource({ runtimeFlavor, channelOwnership })
  const { sessionFile, workspaceDir } = await ensureRunDir(runId)

  // Introspection emitter — fire-and-forget, never blocks agent loop
  const introspectionEnabled = process.env.FEATURE_INTROSPECTION_STREAM === 'true'
  const introspection = createIntrospectionEmitter(
    params.supabase,
    params.assistant.org_id ?? undefined,
    params.assistant.id,
    runId,
    introspectionEnabled,
  )
  introspection.emit('run_start', {
    model: params.assistant.lucid_model,
    channel_type: params.channelId ? 'channel' : 'test',
    user_id: params.userId,
  })

  try {
  // Ensure OpenClaw's env-based LLM config is set.
  // Set once and leave — all tenants currently share the same TrustGate endpoint.
  // This avoids the race condition of per-request save/restore with concurrent runs.
  ensureLlmEnv(params.llmConfig)

  // Lazy-fetch + cache model context windows from TrustGate (once per process).
  // Must come after ensureLlmEnv() which sets OPENAI_API_BASE/KEY.
  await ensureModelContextWindows()

  // Build system prompt with stable→volatile ordering for provider prompt cache optimization.
  // Phase 3: Order matters — stable prefixes are cached by providers (Anthropic explicit, OpenAI implicit).
  //
  // STABLE (rarely changes):
  //   1. Assistant instructions (system prompt / persona)
  //   2. Rendered skill content (added via skillsSnapshot, not here)
  //   3. Tool definitions (## Additional Tools) — deferred, pushed after tool assembly below
  //
  // SEMI-STABLE (changes rarely):
  //   4. Memories (## Memories)
  //
  // VARIABLE (changes per-turn):
  //   5. Conversation summary (## Conversation Summary)
  //   6. Recent turns (## Recent Conversation / ## Conversation History)

  const systemParts: string[] = []

  // [STABLE] 1. Assistant instructions
  if (params.assistant.system_prompt) {
    systemParts.push(params.assistant.system_prompt)
  }

  const identityPromptSections = await loadAgentIdentityPromptSections(params.supabase, params.assistant.id)

  // [STABLE] 2. Versioned identity documents, with soul_content as compatibility fallback.
  if (identityPromptSections.length > 0) {
    systemParts.push(`\n\n## Agent Identity\n${identityPromptSections.join('\n\n')}`)
  } else if (params.assistant.soul_content) {
    systemParts.push(`\n\n## Agent Identity\n${params.assistant.soul_content}`)
  }

  const sharedContextPromptSections = await loadSharedContextPromptSections(params.supabase, {
    workspaceId: params.assistant.org_id,
    projectId: params.assistant.project_id ?? null,
    agentId: params.assistant.id,
    userId: params.userId ?? null,
  })

  if (sharedContextPromptSections.length > 0) {
    systemParts.push(`\n\n## Shared Operating Context\n${sharedContextPromptSections.join('\n\n')}`)
  }

  // [STABLE] 3. ## Additional Tools — placeholder index for insertion after tool assembly
  const toolListInsertIndex = systemParts.length

  // [SEMI-STABLE] 4. Memories
  const memoryAdapter = getEngineMemoryAdapter((params.assistant.engine ?? 'openclaw') as 'openclaw' | 'hermes')
  const mountedMemory = memoryAdapter.mountMemory({
    memories: params.memories,
    boardMemories: params.boardMemories ?? [],
    knowledgePromptPacket: params.knowledgePromptPacket ?? null,
  }, {
    engine: (params.assistant.engine ?? 'openclaw') as 'openclaw' | 'hermes',
    runtimeFlavor,
    channelOwnership,
  })

  if (params.knowledgePromptPacket?.items.length) {
    systemParts.push(...mountedMemory.systemSections)
    introspection.emit('memory_load', {
      memory_count: params.knowledgePromptPacket.items.filter((item) => item.layer === 'assistant_memory').length,
      knowledge_packet_items: params.knowledgePromptPacket.items.length,
      knowledge_packet_version: params.knowledgePromptPacket.version,
    })
  } else if (params.memories.length > 0) {
    systemParts.push(...mountedMemory.systemSections.filter((section) => section.includes('## Memories')))
    introspection.emit('memory_load', {
      memory_count: params.memories.length,
      top_memory: params.memories[0]?.slice(0, 200),
    })
  }

  // [SEMI-STABLE] 4.5. Board memories (org-level shared knowledge)
  if (!params.knowledgePromptPacket && params.boardMemories && params.boardMemories.length > 0) {
    systemParts.push(...mountedMemory.systemSections.filter((section) => section.includes('## Organization Knowledge')))
    introspection.emit('board_memory_load', {
      board_memory_count: params.boardMemories.length,
    })
  }

  // [SEMI-STABLE] 4.6. Crew context (stable for the duration of crew membership)
  if (params.crewContext) {
    systemParts.push(renderCrewContextPrompt(params.crewContext))
  }

  // [VARIABLE] 5-6. Conversation context
  const useConversationSummary = process.env.FEATURE_CONVERSATION_SUMMARY === 'true'

  if (useConversationSummary) {
    // Optimized path: summary of older messages + last 6 turns, capped at 8k chars.
    if (params.summary) {
      systemParts.push(`\n\n## Conversation Summary\n${params.summary}`)
    }
    if (params.messages.length > 0) {
      const MAX_RECENT_TURNS = 6
      const MAX_RECENT_CHARS = 8_000
      const recentTurns = params.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-MAX_RECENT_TURNS)
      // Cap by total chars — truncate oldest turns first if over budget
      let totalChars = 0
      const budgetedTurns: typeof recentTurns = []
      for (let i = recentTurns.length - 1; i >= 0; i--) {
        const turnLen = recentTurns[i].content.length + 20 // overhead for role prefix
        if (totalChars + turnLen > MAX_RECENT_CHARS) break
        totalChars += turnLen
        budgetedTurns.unshift(recentTurns[i])
      }
      if (budgetedTurns.length > 0) {
        const lines = budgetedTurns.map(
          m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`,
        )
        systemParts.push(`\n\n## Recent Conversation\n${lines.join('\n\n')}`)
      }
    }
  } else {
    // Legacy path: last 20 raw messages (pre-optimization behavior)
    if (params.messages.length > 0) {
      const historyLines = params.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-20)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      if (historyLines.length > 0) {
        systemParts.push(`\n\n## Conversation History\n${historyLines.join('\n\n')}`)
      }
    }
  }

  // Introspection: context loaded
  introspection.emit('context_loaded', {
    message_count: params.messages.length,
    memory_count: params.knowledgePromptPacket?.items.length ?? params.memories.length,
    knowledge_packet_enabled: Boolean(params.knowledgePromptPacket),
    prompt_tokens: systemParts.join('').length,
  })

  // Build plugin context map and tool executor
  // Pass stream output so tool calls emit chain-of-thought events
  const pluginCtxMap = buildPluginContextMap(params.plugins)
  const streamOutput = params.output && 'toolStart' in params.output
    ? params.output as AIStreamOutput
    : undefined

  // Streaming: onPartialReply sends accumulated text, we compute deltas.
  // NOTE: Caller manages output lifecycle (begin/finalize/error) — we only call append.
  let fullText = ''

  // Explicit OpenAI provider config so OpenClaw's resolveModel() recognizes
  // the provider. Without this, resolveImplicitProviders() never adds 'openai'
  // and the model falls through to "Unknown model" error.
  // baseUrl must include /v1 — pi-ai appends /chat/completions directly.
  //
  // tools.allow: only safe, read-only OpenClaw native tools (web_search, web_fetch).
  // All dangerous tools (exec, bash, browser, write, edit, etc.) are filtered out.
  // web_search auto-skips if no BRAVE_API_KEY is set. web_fetch always works.
  const nativeAllow = getOpenClawNativeAllow(params.images)
  const config = {
    tools: {
      allow: nativeAllow,
      web: {
        search: {
          provider: 'brave' as const,
          // apiKey read from BRAVE_API_KEY env var by OpenClaw
        },
        fetch: {
          // Explicit SaaS-safe limits — OpenClaw defaults are 2MB/50K but we pin them
          // to prevent upstream changes from accidentally raising caps on shared runtime.
          maxResponseBytes: 2_000_000,  // 2 MB raw response cap
          maxCharsCap: 50_000,          // 50K chars after content extraction
        },
      },
    },
    // Explicitly disable OpenClaw's skill/plugin auto-discovery.
    // In self-hosted OpenClaw, skills load from ~/.openclaw/skills/, ~/.agents/skills/,
    // workspace/skills/, and plugins load via jiti (arbitrary JS execution).
    // In shared SaaS, ALL of these are security risks:
    //   - Home dir scanning → cross-tenant skill leakage
    //   - Workspace scanning → safe (empty per-run dir) but relies on implicit emptiness
    //   - Plugin loading via jiti → arbitrary code execution if config is compromised
    // Our tools come through clientTools/clientToolExecutor, not OpenClaw's discovery.
    skills: {
      load: {
        extraDirs: [],          // No extra skill directories
        disabled: true,         // Disable skill discovery entirely
      },
    },
    plugins: {
      enabled: false,           // No OpenClaw plugin auto-loading
      installs: [],             // No configured plugins
    },
    models: {
      providers: {
        openai: {
          baseUrl: `${params.llmConfig.baseUrl}/v1`,
          api: 'openai-completions' as const,
          models: [] as Array<{
            id: string
            contextWindow: number
            input?: readonly ['text'] | readonly ['text', 'image']
          }>,
        },
      },
    },
  }

  // Model routing: only when assistant is set to 'lucid-auto'
  const isLucidAuto = params.assistant.lucid_model === 'lucid-auto'
  const strongModel = process.env.STRONG_MODEL || 'openai/gpt-4.1'
  const fastModel = process.env.FAST_MODEL || 'openai/gpt-4.1-mini'
  const routingResult = isLucidAuto
    ? routeModel(
        params.userMessage,
        strongModel,
        fastModel,
        params.messages.length,
      )
    : undefined
  const routedModel = routingResult?.model ?? params.assistant.lucid_model
  const effectiveModel = normalizeModelForProvider(routedModel, params.llmConfig.baseUrl)

  // Inject real context window so OpenClaw's tool-result guard uses correct budgets
  // instead of falling back to DEFAULT_CONTEXT_TOKENS (200K).
  const modelCtxWindow = getModelContextWindow(effectiveModel)
  const configuredModelInput =
    (params.images?.length ?? 0) > 0
      ? (['text', 'image'] as const)
      : (['text'] as const)
  ;(config.models!.providers as any).openai.models = [
    {
      id: effectiveModel,
      contextWindow: modelCtxWindow,
      input: configuredModelInput,
    },
  ]

  if (routingResult) {
    console.log(`[OpenClawAgent] Model routing: lane=${routingResult.lane}, model=${effectiveModel}, reason=${routingResult.reason}`)
    introspection.emit('routing_decision', {
      lane: routingResult.lane,
      model_used: effectiveModel,
      reason: routingResult.reason,
    })
  }

  // Build built-in tool executor params (for trading/blockchain tools + subagent)
  const builtInParams: BuiltInToolExecutorParams | undefined =
    params.supabase && params.userId
      ? {
          supabase: params.supabase,
          userId: params.userId,
          assistant: params.assistant,
          runId,
          conversationId: params.conversationId,
          channelId: params.channelId,
          crewContext: params.crewContext ?? undefined,
          subagentCtx: {
            parentRunId: runId,
            depth: params.subagentDepth ?? 0,
            childrenSpawned: 0,
            totalChildToolCalls: 0,
            sessionFile,
            workspaceDir,
            provider: 'openai',
            model: effectiveModel,
            config,
            temperature: undefined as any,
            maxOutputTokens: isLucidAuto ? 8192 : params.assistant.max_tokens,
            extraSystemPrompt: systemParts.join('') || undefined,
            abortSignal: params.abortSignal,
            agentDir: workspaceDir,
            supabase: params.supabase,
            orgId: params.assistant.org_id ?? '',
            agentId: params.assistant.id,
          },
        }
      : undefined

  // Populate Nango context for integration plugins (transport='nango')
  // Nango integrations flow through the plugin system — tools are snapshotted
  // in manifest_snapshot at install time, connection resolved via RPC LEFT JOIN.
  const supabaseRpcFn = params.supabase
    ? (name: string, rpcParams: Record<string, unknown>) => params.supabase!.rpc(name, rpcParams)
    : undefined

  for (const [wireName, ctx] of pluginCtxMap) {
    if (ctx.transport === 'nango' && ctx.connectionId && !ctx.nangoBinding) {
      ctx.nangoBinding = buildNangoBinding({
        assistantId: params.assistant.id,
        pluginSlug: ctx.pluginSlug,
        connectionId: ctx.connectionId,
        authProvider: ctx.authProvider || null,
        config: ctx.config,
      })
      ctx.nangoRunId = runId
      ctx.nangoAssistantId = params.assistant.id
      ctx.nangoRpcFn = supabaseRpcFn
    }
  }

  const toolExec = createToolExecutor(pluginCtxMap, builtInParams, streamOutput, introspection)

  const capabilitySurface = await buildAgentCapabilitySurface({
    engine: 'openclaw',
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
    systemPrompt: systemParts.join('') || undefined,
    abortSignal: params.abortSignal,
    streamOutput,
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
      engine: 'openclaw',
      model: effectiveModel,
      provider: 'openai',
    },
    runTurn: getRuntime().runTurn,
  })
  introspection.emit('capability_surface', capabilitySurface.introspection as unknown as Record<string, unknown>)
  const toolMount = await getOpenClawToolAdapter().mount({
    assistant: params.assistant,
    plugins: params.plugins ?? [],
    supabase: params.supabase,
    userId: params.userId,
    runId,
    conversationId: params.conversationId,
    channelId: params.channelId,
    subagentDepth: params.subagentDepth ?? 0,
    sessionFile,
    workspaceDir,
    systemPrompt: systemParts.join('') || undefined,
    abortSignal: params.abortSignal,
    streamOutput,
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
      engine: 'openclaw',
      model: effectiveModel,
      provider: 'openai',
    },
    runTurn: getRuntime().runTurn,
    surface: capabilitySurface.tools,
  })

  const providerClientTools = toolMount.clientTools

  if (toolMount.selection?.originalCount !== undefined && toolMount.selection.originalCount > toolMount.selection.selectedCount) {
    console.warn(
      `[OpenClawAgent] Selected client tools for ${toolMount.selection.provider}: ${toolMount.selection.originalCount} -> ${toolMount.selection.selectedCount}`,
    )
  }

  console.log(`[OpenClawAgent] Client tools (${providerClientTools.length}${toolMount.selection ? `/${toolMount.selection.originalCount}` : ''}):`, providerClientTools.map(t => t.function.name).join(', '))

  // Surface client tool names in the system prompt so the LLM knows they exist.
  // OpenClaw's built-in "## Tooling" section only lists native tools (web_search, etc.).
  // Without this, the LLM sees clientTools as function definitions but the system prompt
  // says "only web_search/web_fetch/image/pdf are available", causing it to ignore them.
  // Phase 3: Insert at stable position (after system prompt, before memories/conversation)
  // to maximize provider prompt cache hit rate.
  if (toolMount.additionalToolsPrompt) {
    systemParts.splice(toolListInsertIndex, 0, toolMount.additionalToolsPrompt)
  }

  // Never leak internal platform details (stable — part of prefix)
  systemParts.splice(toolListInsertIndex + (toolMount.additionalToolsPrompt ? 1 : 0), 0,
    '\n\nNever mention "OpenClaw", "Pi Agent", or any internal platform/runtime names to users. You are the assistant — refer to yourself by your name only.')

  // Patch subagent context with tool executor so children inherit the tool surface
  if (builtInParams?.subagentCtx) {
    builtInParams.subagentCtx.clientTools = providerClientTools.length > 0 ? providerClientTools : undefined
    builtInParams.subagentCtx.clientToolExecutor = toolMount.clientToolExecutor
  }

  // Build DB-backed skills snapshot (replaces hardcoded empty snapshot)
  const skillsSnapshot = capabilitySurface.skills.snapshot

  const agentStartMs = Date.now()
  const promptCharCount = systemParts.join('').length + params.userMessage.length

  console.log(`[OpenClawAgent] ⏱ prep complete in ${agentStartMs - prepStartMs}ms (model=${effectiveModel}, prompt=${promptCharCount}ch, skills=${skillsSnapshot.resolvedSkills.length}, plugins=${params.plugins?.length ?? 0})`)

  const result = await runEmbeddedPiAgent({
      sessionId: params.conversationId,
      sessionFile,
      workspaceDir,
      prompt: params.userMessage,
      images: params.images?.map(img => ({ type: 'image' as const, data: img.data, mimeType: img.mimeType })),
      skipPromptImageDetection: (params.images?.length ?? 0) > 0,
      provider: 'openai',
      model: effectiveModel,
      config,
      // Top-level for type compat; streamParams for OpenClaw's actual API call
      temperature: undefined as any,
      maxOutputTokens: isLucidAuto ? 8192 : params.assistant.max_tokens,
      streamParams: {
        temperature: undefined as any,
        maxTokens: isLucidAuto ? 8192 : params.assistant.max_tokens,
      },
      timeoutMs: params.budget.maxWallTimeMs,
      runId,
      abortSignal: params.abortSignal,

      // System prompt
      extraSystemPrompt: systemParts.join('') || undefined,

      // DB-backed skills snapshot — fetched from skill_catalog via 3-tier activation.
      // resolvedSkills MUST be [] (not undefined) on fallback — undefined triggers
      // filesystem scanning in skills-runtime.ts.
      skillsSnapshot: skillsSnapshot,

      // agentDir enables image/pdf tools (they need a dir for temp files)
      agentDir: workspaceDir,

      // Our plugins + trading tools as OpenClaw clientTools with inline execution
      clientTools: providerClientTools.length > 0 ? providerClientTools : undefined,
      clientToolExecutor: toolMount.clientToolExecutor,

      // Streaming callback — only append, caller manages begin/finalize/error
      onPartialReply: async ({ text }: { text?: string }) => {
        if (params.output && text) {
          const delta = text.slice(fullText.length)
          if (delta) {
            await params.output.append(delta)
          }
          fullText = text
        }
      },

      // Reasoning callbacks — streams thinking tokens to the Reasoning component
      onReasoningStream: streamOutput
        ? async ({ text }: { text?: string }) => {
            if (text) streamOutput.reasoningStream(text)
          }
        : undefined,
      onReasoningEnd: streamOutput
        ? async () => { streamOutput.reasoningEnd() }
        : undefined,

      onAgentEvent: (evt: { stream: string; data: Record<string, unknown> }) => {
        if (evt.stream === 'tool') {
          const data = evt.data
          // Detect client tool calls that error without reaching our executor.
          // Root cause: openclaw-core run.ts may not forward clientTools/clientToolExecutor
          // to runEmbeddedAttempt. Fix: packages/openclaw-core/src/agents/pi-embedded-runner/run.ts
          // must include `clientTools: params.clientTools, clientToolExecutor: params.clientToolExecutor`
          // in the runEmbeddedAttempt() call (~line 879).
          if (
            data.phase === 'result' &&
            data.isError === true &&
            typeof data.name === 'string' &&
            isBuiltInTool(data.name) &&
            toolMount.toolCallCount() === 0
          ) {
            console.error(
              `[OpenClawAgent] CRITICAL: Tool "${data.name}" returned isError but our executor was never called. ` +
              `This likely means openclaw-core/run.ts is not forwarding clientTools/clientToolExecutor to runEmbeddedAttempt(). ` +
              `Apply the 2-line fix in packages/openclaw-core/src/agents/pi-embedded-runner/run.ts.`
            )
          }
        }
      },
    })

  const agentEndMs = Date.now()
  console.log(`[OpenClawAgent] ⏱ agent runtime: ${agentEndMs - agentStartMs}ms (LLM+tools+idle), prep: ${agentStartMs - prepStartMs}ms, total: ${agentEndMs - prepStartMs}ms`)

  // Introspection: LLM completed
  introspection.emit('llm_end', {
    model: effectiveModel,
    duration_ms: Date.now() - agentStartMs,
    input_tokens: result.meta?.agentMeta?.usage?.input ?? 0,
    output_tokens: result.meta?.agentMeta?.usage?.output ?? 0,
  })

  // Log agent turn metrics (Phase 1C observability)
  const agentResult = mapResult(result, fullText, toolMount.toolCallCount(), {
    capabilitySurface: capabilitySurface.introspection as unknown as Record<string, unknown>,
  })
  const recentTurnCount = useConversationSummary
    ? Math.min(params.messages.filter(m => m.role === 'user' || m.role === 'assistant').length, 6)
    : Math.min(params.messages.filter(m => m.role === 'user' || m.role === 'assistant').length, 20)

  logAgentTurnMetrics({
    userMessageLength: params.userMessage.length,
    toolCallCount: toolMount.toolCallCount(),
    runtimeLatencyMs: Date.now() - agentStartMs,
    tokenUsage: { input: agentResult.usage.promptTokens, output: agentResult.usage.completionTokens },
    modelUsed: effectiveModel,
    summaryPresent: !!params.summary,
    recentTurnCount,
    promptCharCount,
    toolCacheHits: toolCache.getHitCounts(),
    routingLane: routingResult?.lane,
    escalated: false,
  })

  const normalizedUsage = defaultAgentGovernanceRuntime.normalizeUsage({
    model: effectiveModel,
    promptTokens: agentResult.usage.promptTokens,
    completionTokens: agentResult.usage.completionTokens,
    source: 'provider',
  })

  // Mission Control: persist cost tracking (fire-and-forget)
  if (params.supabase && params.assistant.org_id) {
    defaultAgentGovernanceRuntime.persistRunUsage({
      assistant: params.assistant,
      supabase: params.supabase,
      usage: normalizedUsage,
    }).catch((err) => {
      console.error(`[OpenClawAgent] Cost tracking error:`, err)
    })

    // Introspection: cost update
    introspection.emit('cost_update', {
      total_tokens: normalizedUsage.inputTokens + normalizedUsage.outputTokens,
      input_tokens: normalizedUsage.inputTokens,
      output_tokens: normalizedUsage.outputTokens,
      usage_source: normalizedUsage.source,
    })
  }

  // L2 Receipt Pipeline: emit verifiable receipt (fire-and-forget)
  emitReceipt({
    runId,
    passportId: params.assistant.passport_id ?? null,
    model: effectiveModel,
    tokensIn: agentResult.usage.promptTokens,
    tokensOut: agentResult.usage.completionTokens,
    totalLatencyMs: Date.now() - agentStartMs,
    toolCallCount: toolMount.toolCallCount(),
    policyConfig: params.assistant.policy_config,
    supabase: params.supabase,
    assistantId: params.assistant.id,
    orgId: params.assistant.org_id,
  })

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
    success: !agentResult.hasProviderError,
    model: effectiveModel,
    provider: inferWorkerProvider(params.llmConfig.baseUrl),
    usage: {
      inputTokens: normalizedUsage.inputTokens,
      outputTokens: normalizedUsage.outputTokens,
      totalTokens: normalizedUsage.inputTokens + normalizedUsage.outputTokens,
      estimatedCostUsd: normalizedUsage.estimatedCostUsd,
    },
    receipt: {
      provider: inferWorkerProvider(params.llmConfig.baseUrl),
      model: effectiveModel,
      latencyMs: Date.now() - agentStartMs,
      requestId: runId,
      metadata: {
        engine: 'openclaw',
        runtimeFlavor,
        channelId: params.channelId,
        toolCallCount: toolMount.toolCallCount(),
        stopReason: agentResult.diagnostics?.stopReason,
        hasProviderError: agentResult.hasProviderError ?? false,
      },
    },
    ...(agentResult.hasProviderError ? { error: agentResult.text } : {}),
  })

  // Introspection: run completed
  introspection.emit('run_end', {
    duration_ms: Date.now() - prepStartMs,
    total_tokens: agentResult.usage.promptTokens + agentResult.usage.completionTokens,
    tool_count: toolMount.toolCallCount(),
  })

  return agentResult
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await emitWorkerAIGenerationReceipt({
      supabase: params.supabase,
      orgId: params.assistant.org_id,
      agentId: params.assistant.id,
      userId: params.userId,
      projectId: params.assistant.project_id ?? null,
      runId,
      feature: 'agent-run',
      modality: 'agent-run',
      prompt: params.userMessage,
      success: false,
      model: params.assistant.lucid_model,
      provider: inferWorkerProvider(params.llmConfig.baseUrl),
      receipt: {
        provider: inferWorkerProvider(params.llmConfig.baseUrl),
        latencyMs: Date.now() - prepStartMs,
        requestId: runId,
        metadata: {
          engine: 'openclaw',
          runtimeFlavor,
          channelId: params.channelId,
        },
      },
      error: errorMsg,
    })
    throw err
  } finally {
    // Flush introspection events before cleanup
    await introspection.close().catch(() => {})
    // Filesystem is scratch only — clean up after every run (success or failure).
    await cleanupRunDir(runId)
    // Reset per-run counters
    resetRunToolCalls(runId)
    const { clearRunEditCount } = await import('./runtime-tools/soul.js')
    clearRunEditCount(runId)
  }
}

/* ─── V2 Feature-Flagged Entry Point ──────────────────── */

/** Maps RunTurnOutput (runtime contract) → AgentRunResult (caller contract) */
function toAgentRunResult(output: RunTurnOutput): AgentRunResult {
  return {
    text: output.text,
    usage: {
      promptTokens: output.meta.usage?.input ?? 0,
      completionTokens: output.meta.usage?.output ?? 0,
    },
    steps: 1,
    toolCallsUsed: output.toolCallsUsed,
    budgetExhausted: output.meta.error?.kind === 'retry_limit',
    diagnostics: {
      model: output.meta.model,
      durationMs: output.meta.durationMs,
      stopReason: output.meta.stopReason,
      error: output.meta.error,
      capabilitySurface: output.meta.capabilitySurface,
    },
  }
}

export async function runOpenClawAgent(params: OpenClawAgentParams): Promise<AgentRunResult> {
  const useV2 = process.env.FEATURE_RUNTIME_V2 === 'true'
  if (!useV2) {
    return legacyRunOpenClawAgent(params)
  }

  const runId = params.runId || crypto.randomUUID()
  const runtime = getRuntime('embedded')
  const output = await runtime.runTurn({
    orgId: params.assistant.org_id ?? '',
    assistantId: params.assistant.id,
    conversationId: params.conversationId,
    runId,
    assistant: params.assistant,
    plugins: params.plugins ?? [],
    budget: params.budget,
    userMessage: params.userMessage,
    messages: params.messages,
    memories: params.memories,
    images: params.images,
    output: params.output,
    supabase: params.supabase,
    userId: params.userId,
    channelId: params.channelId,
    subagentDepth: params.subagentDepth,
    embeddedConfig: { llmConfig: params.llmConfig },
    abortSignal: params.abortSignal,
  })

  // L2 Receipt Pipeline: emit verifiable receipt (fire-and-forget, V2 path)
  emitReceipt({
    runId,
    passportId: params.assistant.passport_id ?? null,
    model: params.assistant.lucid_model,
    tokensIn: output.meta.usage?.input ?? 0,
    tokensOut: output.meta.usage?.output ?? 0,
    totalLatencyMs: output.meta.durationMs ?? 0,
    toolCallCount: output.toolCallsUsed,
    policyConfig: params.assistant.policy_config,
    supabase: params.supabase,
    assistantId: params.assistant.id,
    orgId: params.assistant.org_id,
  })

  const agentResult = toAgentRunResult(output)
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
    success: !output.meta.error,
    model: output.meta.model ?? params.assistant.lucid_model,
    provider: inferWorkerProvider(params.llmConfig.baseUrl),
    usage: {
      inputTokens: output.meta.usage?.input ?? 0,
      outputTokens: output.meta.usage?.output ?? 0,
      totalTokens: (output.meta.usage?.input ?? 0) + (output.meta.usage?.output ?? 0),
    },
    receipt: {
      provider: inferWorkerProvider(params.llmConfig.baseUrl),
      model: output.meta.model ?? params.assistant.lucid_model,
      latencyMs: output.meta.durationMs ?? 0,
      requestId: runId,
      metadata: {
        engine: 'openclaw',
        runtimeVersion: 'v2',
        channelId: params.channelId,
        toolCallCount: output.toolCallsUsed,
        stopReason: output.meta.stopReason,
      },
    },
    ...(output.meta.error ? { error: output.meta.error.message } : {}),
  })

  return agentResult
}
