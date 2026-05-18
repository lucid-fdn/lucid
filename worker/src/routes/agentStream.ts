/**
 * POST /stream — Direct SSE streaming endpoint for web chat.
 *
 * Industry-standard pattern: the API route (Vercel) authenticates the user,
 * then proxies to this endpoint. The worker runs the full agent pipeline
 * and streams tokens back via Vercel AI SDK's UIMessageStream.
 *
 * Uses `createUIMessageStream` + `pipeUIMessageStreamToResponse` from the `ai`
 * package — the SDK owns the wire protocol, we just write semantic events.
 *
 * Flow: Browser (useChat) → API route (auth) → Worker /stream (this) → AgentLoop → LLM → AI SDK SSE
 */

import type { Request, Response } from 'express'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createUIMessageStream, pipeUIMessageStreamToResponse } from 'ai'
import { PolicyEngine } from '../guards/PolicyEngine.js'
import type { ActivatedPlugin, PluginToolDef } from '../agent/plugin-types.js'
import { mapWireToActivatedPlugin, mapRpcRowToActivatedPlugin } from '../agent/plugin-types.js'
import { AIStreamOutput } from './AIStreamOutput.js'
import { withDbSpan } from '../observability/tracing.js'
import { trackUsage, captureError } from '../utils/usage-tracker.js'
import type { Config } from '../config.js'
import { getWorkerLlmConfig } from '../ai/lucid-provider-config.js'
import { ConversationCompactor } from '../agent/ConversationCompactor.js'
import { loadBoardMemories } from '../agent/board-memory-loader.js'
import { emitNotification, ALERTS, isCreditError } from '../notifications/emitter.js'
import { defaultWorkerRunExecutor } from '../core/runtime/worker-run-executor.js'
import { supportsRuntimeConfiguration, supportsRuntimeFlavor } from '@lucid/runtime-compat'
import { computeTenantKeys } from '../utils/tenant-keys.js'
import { createChannelProgressController } from '../channels/progress/controller.js'
import { redact, redactObject } from '../utils/pii-redactor.js'

interface AssistantConfig {
  id: string
  name: string
  engine?: 'openclaw' | 'hermes' | null
  runtime_flavor?: 'shared' | 'c1_managed' | 'c2a_autonomous' | null
  system_prompt: string | null
  soul_content?: string | null
  lucid_model: string
  temperature: number | null
  max_tokens: number | null
  memory_enabled: boolean
  memory_window_size: number | null
  org_id: string
  project_id?: string | null
  passport_id?: string | null
  policy_config: Record<string, unknown> | null
  updated_at?: string
  wallet_enabled?: boolean
  agent_wallets?: Array<{
    chain_type: string
    privy_wallet_id: string
    address: string
    status: string
  }>
}

interface StreamRequestPlugin {
  slug: string
  name: string
  tools: PluginToolDef[]
  config: Record<string, unknown>
  // UCA fields (from BFF worker-proxy.ts)
  kind?: string
  transport?: string
  trustLevel?: string
  executionMode?: string
  authType?: string
  authProvider?: string | null
  endpointUrl?: string
  fallbackMode?: string | null
  mcpgateServerId?: string
  connectionId?: string
  /** @deprecated */
  source?: string
}

interface StreamRequestImage {
  data: string
  mimeType: string
}

interface StreamRequest {
  mode?: 'agent'
  assistantId: string
  conversationId: string
  message: string
  userId: string
  runId?: string
  assistantConfig?: AssistantConfig
  plugins?: StreamRequestPlugin[]
  images?: StreamRequestImage[]
}

// In-memory assistant cache (30s TTL). Avoids DB round-trip on hot chats.
const assistantCache = new Map<string, { data: AssistantConfig; expiresAt: number }>()
const ASSISTANT_CACHE_TTL_MS = 30_000

export function createAgentStreamHandler(
  supabase: SupabaseClient,
  config: Config,
) {
  return async (req: Request, res: Response) => {
    const { mode, assistantId, conversationId, message, userId, runId, assistantConfig, plugins: trustedPlugins, images } = req.body as unknown as StreamRequest

    // Hard gate: worker only accepts agent-mode traffic
    if (mode && mode !== 'agent') {
      return res.status(400).json({ error: 'Worker only accepts mode=agent requests' })
    }
    if (!assistantId || !conversationId || !message) {
      return res.status(400).json({ error: 'Missing required fields (assistantId, conversationId, message)' })
    }

    const t0 = Date.now()
    const rid = runId || '???'
    console.log(`[stream] ▶ incoming runId=${rid.slice(0, 8)}… assistant=${assistantId.slice(0, 8)}… messageChars=${message.length}`)


    // Abort propagation: detect client disconnect.
    // IMPORTANT: Listen on `res` not `req` — req 'close' fires when the
    // request body is fully consumed (immediately for JSON POST), while
    // res 'close' fires when the TCP connection drops (actual disconnect).
    let aborted = false
    res.on('close', () => {
      if (!res.writableFinished) {
        console.log('[stream] client disconnected (res close before finish)')
        aborted = true
      }
    })

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const output = new AIStreamOutput(writer)
        const progress = createChannelProgressController({
          runId: runId || rid,
          channelType: 'web',
          output,
        })
        let assistant: AssistantConfig | null = null

        try {
          // Resolve assistant: passed config → cache → DB fallback

          // 1. Trusted server-to-server config (from API route, behind Bearer auth)
          if (assistantConfig?.id === assistantId) {
            assistant = assistantConfig
            assistantCache.set(assistantId, { data: assistant, expiresAt: Date.now() + ASSISTANT_CACHE_TTL_MS })
          }

          // 2. In-memory cache (30s TTL)
          if (!assistant) {
            const cached = assistantCache.get(assistantId)
            if (cached && cached.expiresAt > Date.now()) {
              assistant = cached.data
            } else {
              assistantCache.delete(assistantId)
            }
          }

          // 3. DB fallback
          if (!assistant) {
            // Try with wallet fields; fall back without if migration 079 not yet applied
            let { data, error: asstErr } = await supabase
              .from('ai_assistants')
              .select('id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, project_id, passport_id, policy_config, wallet_enabled, approval_required_tools, agent_wallets(chain_type, privy_wallet_id, address, status)')
              .eq('id', assistantId)
              .single()

            if (asstErr) {
              const fallback = await supabase
                .from('ai_assistants')
                .select('id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, project_id, passport_id, policy_config, approval_required_tools')
                .eq('id', assistantId)
                .single()

              if (fallback.error || !fallback.data) {
                console.error('[stream] assistant not found:', assistantId, fallback.error?.message)
                await output.error(new Error('Assistant not found'))
                return
              }
              data = { ...fallback.data, wallet_enabled: false, agent_wallets: [] } as typeof data
            }

            if (!data) {
              console.error('[stream] assistant not found:', assistantId)
              await output.error(new Error('Assistant not found'))
              return
            }
            assistant = data as AssistantConfig
            assistantCache.set(assistantId, { data: assistant, expiresAt: Date.now() + ASSISTANT_CACHE_TTL_MS })
          }

          const effectiveEngine = assistant.engine ?? 'openclaw'
          const effectiveRuntimeFlavor = assistant.runtime_flavor ?? 'shared'
          if (!supportsRuntimeFlavor(effectiveEngine, effectiveRuntimeFlavor)) {
            await output.error(new Error(`${effectiveEngine} does not support ${effectiveRuntimeFlavor}`))
            return
          }
          if (!supportsRuntimeConfiguration(effectiveEngine, effectiveRuntimeFlavor, 'lucid_relay')) {
            await output.error(new Error(`${effectiveEngine} does not support lucid_relay for ${effectiveRuntimeFlavor}`))
            return
          }

          // Policy check (sync, no DB)
          const policyEngine = new PolicyEngine({
            maxLlmCalls: config.DEFAULT_MAX_LLM_CALLS,
            maxToolCalls: config.DEFAULT_MAX_TOOL_CALLS,
            maxWallTimeMs: config.DEFAULT_MAX_WALL_TIME_MS,
          })
          const policy = policyEngine.evaluate(assistant.policy_config || null)
          if (!policy.allowed) {
            await output.error(new Error(`Policy blocked: ${policy.reason}`))
            return
          }

          await output.begin()
          progress.emitPhase('thinking', 'Preparing agent', { source: 'system' })

          // Plan usage limit check (skip internal orgs)
          const internalOrgIds = (process.env.INTERNAL_ORG_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
          if (assistant.org_id && !internalOrgIds.includes(assistant.org_id)) {
            const { data: withinLimit } = await supabase.rpc('check_usage_limit', {
              p_org_id: assistant.org_id,
              p_metric_name: 'ai_queries_monthly',
            })
            if (withinLimit === false) {
              await output.error(new Error('AI query limit exceeded. Upgrade your plan.'))
              return
            }
          }

          // Reasoning models (o1, o3, etc.) need longer timeouts
          const model = assistant.lucid_model?.toLowerCase() || ''
          if (/\b(o1|o3|o1-pro|o1-mini|o3-mini)\b/.test(model)) {
            policy.budget.maxWallTimeMs = Math.max(policy.budget.maxWallTimeMs, 180_000)
          }

          // 1. Persist user message (fire-and-forget with single retry)
          persistMessage(supabase, {
            conversation_id: conversationId,
            role: 'user',
            content: message,
            encryption_mode: 'NONE',
          })

          const tenantKeys = computeTenantKeys({
            orgId: assistant.org_id,
            projectId: assistant.project_id ?? null,
            channelType: 'web',
            externalChatId: conversationId,
            externalUserId: userId,
          })

          // 2. Parallel reads: context + memories (independent, read-only)
          const memoriesPromise = assistant.memory_enabled && userId
            ? (async () => {
                progress.emitPhase('memory', 'Reading relevant memory', {
                  capability: 'knowledge.recall',
                  source: 'memory',
                  riskLevel: 'read',
                })
                const { data: memData } = await supabase.rpc('get_recent_memories', {
                  p_assistant_id: assistant.id,
                  p_scoped_user_id: tenantKeys.userKey,
                  p_limit: 10,
                })
                return (memData || []).map((m: { content: string }) => m.content)
              })()
            : Promise.resolve([] as string[])

          // Resolve plugins: trusted passthrough (from BFF, pre-filtered) → DB fallback
          const pluginsPromise: Promise<ActivatedPlugin[]> = trustedPlugins?.length
            ? Promise.resolve(trustedPlugins.map(p => mapWireToActivatedPlugin({
                ...p,
                tools: p.tools as PluginToolDef[],
              })))
            : (async () => {
                progress.emitPhase('thinking', 'Loading tools', { source: 'system' })
                return withDbSpan('get_assistant_active_plugins', () =>
                  supabase.rpc('get_assistant_active_plugins', { p_assistant_id: assistantId })
                ).then(({ data }) =>
                  (data || []).map((row: Record<string, unknown>) => mapRpcRowToActivatedPlugin(row))
                ).catch((pluginErr) => {
                  console.error('[stream] CRITICAL: plugin fetch failed, agent will run without plugins:', pluginErr instanceof Error ? pluginErr.message : pluginErr)
                  return [] as ActivatedPlugin[]
                })
              })()

          const useConversationSummary = process.env.FEATURE_CONVERSATION_SUMMARY === 'true'

          const [{ data: recentMessages }, memories, plugins] = await Promise.all([
            supabase
              .from('assistant_messages')
              .select('role, content')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
              .limit(useConversationSummary ? 50 : (assistant.memory_window_size || 20)),
            memoriesPromise,
            pluginsPromise,
          ])

          const allMessages = (recentMessages || [])
            .reverse()
            .filter((m: { role: string; content: string | null }) => m.content != null && m.content.trim() !== '')
            .map((m: { role: string; content: string }) => ({
              role: m.role,
              content: m.content,
            }))

          // Phase 2: Run conversation compaction if feature is enabled
          let messages = allMessages
          let conversationSummary: string | undefined
          if (useConversationSummary) {
            const compactor = new ConversationCompactor(supabase, config)
            const { summary, recentMessages: recent } = await compactor.getSummaryAndRecent(
              conversationId,
              allMessages,
              { assistantId, orgId: assistant.org_id },
            )
            conversationSummary = summary
            messages = recent
          }

          // Load board memories (org-level shared knowledge)
          const boardMemories = assistant.org_id
            ? await loadBoardMemories(supabase, assistant.org_id)
            : []

          // Check if client disconnected before starting the expensive agent run
          if (aborted) {
            console.log(`[stream] ✗ runId=${rid.slice(0, 8)}… client disconnected before agent run (${Date.now() - t0}ms)`)
            return
          }

          const tPrep = Date.now() - t0
          console.log(`[stream] ⏱ runId=${rid.slice(0, 8)}… prep done in ${tPrep}ms (model=${assistant.lucid_model}, plugins=${plugins.length}, memories=${memories.length}, history=${messages.length})`)

          // Inject wallet addresses into system prompt if wallet is enabled
          let systemPrompt = assistant.system_prompt
          const walletEnabled = assistant.wallet_enabled ?? false
          const agentWallets = assistant.agent_wallets || []
          if (walletEnabled && agentWallets.length > 0) {
            const activeWallets = agentWallets.filter((w: { status: string }) => w.status === 'active')
            if (activeWallets.length > 0) {
              const evmW = activeWallets.find((w: { chain_type: string }) => w.chain_type === 'ethereum')
              const solW = activeWallets.find((w: { chain_type: string }) => w.chain_type === 'solana')
              const walletLines = ['\n\n## Your Wallets']
              if (evmW) walletLines.push(`- EVM (Ethereum/Base/Arbitrum): ${evmW.address}`)
              if (solW) walletLines.push(`- Solana: ${solW.address}`)
              walletLines.push('Use these addresses when executing trades or checking balances.')
              walletLines.push('Never ask the user for a wallet address -- use your own.')
              systemPrompt = (systemPrompt || '') + walletLines.join('\n')
            }
          }

          // Run agent with streaming output.
          // (Built-in tool registration is handled inside OpenClawAgent.ts
          // via CommandsAllowlist — single source of truth.)
          progress.emitPhase('thinking', 'Thinking', { source: 'runtime' })

          const result = await defaultWorkerRunExecutor.execute({
            assistant: {
              id: assistant.id,
              name: assistant.name,
              engine: assistant.engine ?? 'openclaw',
              system_prompt: systemPrompt,
              soul_content: (assistant.soul_content as string | null) ?? null,
              lucid_model: assistant.lucid_model,
              temperature: assistant.temperature ?? 0.7,
              max_tokens: assistant.max_tokens ?? 4096,
              memory_enabled: assistant.memory_enabled,
              memory_window_size: assistant.memory_window_size ?? 20,
              org_id: assistant.org_id,
              passport_id: assistant.passport_id ?? null,
              policy_config: assistant.policy_config,
              wallet_enabled: walletEnabled,
              agent_wallets: agentWallets,
            },
            conversationId,
            messages,
            memories,
            userMessage: message,
            budget: policy.budget,
            runId: runId || crypto.randomUUID(),
            userId,
            output,
            plugins,
            images,
            supabase,
            summary: conversationSummary,
            boardMemories,
            llmConfig: getWorkerLlmConfig(config),
            onProgress: progress.emit,
          })
          progress.emitPhase('writing', 'Writing final answer', { source: 'runtime' })

          const tTotal = Date.now() - t0
          const agentWallTime = tTotal - tPrep
          const textLen = result.text?.length ?? 0
          console.log(`[stream] ✓ runId=${rid.slice(0, 8)}… done in ${tTotal}ms (prep=${tPrep}ms, agent=${agentWallTime}ms, tokens=${result.usage.promptTokens}+${result.usage.completionTokens}, text=${textLen}ch, tools=${result.toolCallsUsed}, providerError=${result.providerError})`)

          // Handle empty responses — replace with a friendly message
          const responseText = textLen === 0
            ? "I wasn't able to generate a response. Please try again."
            : result.text
          if (textLen === 0) {
            console.warn(`[stream] ⚠ empty response text for runId=${rid.slice(0, 8)}… — tokens=${result.usage.promptTokens}+${result.usage.completionTokens}, tools=${result.toolCallsUsed}, budgetExhausted=${result.budgetExhausted}`)
          }

          // If the provider errored (or empty), the text wasn't streamed — send it now
          // so the user sees the friendly message immediately instead of a blank bubble.
          if (result.providerError || textLen === 0) {
            await output.append(responseText)

            // Emit notification for provider errors / empty responses
            if (assistant.org_id) {
              void emitNotification(supabase, {
                orgId: assistant.org_id,
                ...(textLen === 0
                  ? ALERTS.runEmpty(assistant.name)
                  : ALERTS.llmError(assistant.name, 'Provider returned an error')),
              })
            }
          }

          // Store assistant response (fire-and-forget with single retry)
          persistMessage(supabase, {
            conversation_id: conversationId,
            role: 'assistant',
            content: responseText,
            encryption_mode: 'NONE',
            tokens_prompt: result.usage.promptTokens,
            tokens_completion: result.usage.completionTokens,
          })

          // Usage tracking (fire-and-forget — same as channels path)
          void trackUsage(supabase, {
            runId: runId || rid,
            tenantKey: `web:${assistant.org_id || 'unknown'}`,
            orgId: assistant.org_id || null,
            assistantId: assistant.id,
            conversationId,
            model: assistant.lucid_model,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.promptTokens + result.usage.completionTokens,
            llmCalls: result.steps,
            toolCalls: result.toolCallsUsed,
            wallTimeMs: agentWallTime,
            isAgentLoop: true,
          })

          await output.finalize(responseText)
          progress.complete()
        } catch (err) {
          progress.fail(err)
          const tErr = Date.now() - t0
          const rawErrMsg = err instanceof Error ? err.message : 'Unknown error'
          const safeErrMsg = isCreditError(rawErrMsg) ? rawErrMsg : 'Agent runtime error'
          console.error(`[stream] ✗ runId=${rid.slice(0, 8)}… error after ${tErr}ms: ${safeErrMsg}`)
          captureError(
            new Error(safeErrMsg),
            { runId: runId || rid, operation: 'agent-stream', assistantId, conversationId }
          )

          // Stream a friendly error message instead of sending error event (which shows empty)
          const friendlyError = "I encountered an issue processing your request. Please try again."
          await output.append(friendlyError)

          // Persist the friendly error as the assistant message so refresh shows the same thing
          persistMessage(supabase, {
            conversation_id: conversationId,
            role: 'assistant',
            content: friendlyError,
            encryption_mode: 'NONE',
            tokens_prompt: 0,
            tokens_completion: 0,
          })

          // Emit user-facing notification for critical errors
          if (assistant?.org_id) {
            const alert = isCreditError(rawErrMsg)
              ? ALERTS.creditExhausted(assistant.name, assistant.lucid_model, rawErrMsg)
              : ALERTS.llmError(assistant.name, 'Agent runtime error')
            void emitNotification(supabase, { orgId: assistant.org_id, ...alert })
          }

          await output.finalize(friendlyError)
        }
      },
      onError: (error) => {
        return error instanceof Error ? error.message : 'Unknown error'
      },
    })

    pipeUIMessageStreamToResponse({
      stream,
      response: res as unknown as import('http').ServerResponse,
      headers: {
        'x-vercel-ai-ui-message-stream': 'v1',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'x-lucid-route': 'worker',
        'x-lucid-route-reason': 'agent',
        ...(runId ? { 'x-run-id': runId } : {}),
      },
    })
  }
}

/**
 * Persist a message to assistant_messages with a single retry.
 * Fire-and-forget — does not block the caller.
 */
function persistMessage(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): void {
  void (async () => {
    const { error } = await supabase.from('assistant_messages').insert(payload)
    if (error) {
      console.warn(`[stream] message insert failed (attempt 1): ${error.message}`)
      // Single retry after 500ms
      await new Promise(r => setTimeout(r, 500))
      const { error: retryErr } = await supabase.from('assistant_messages').insert(payload)
      if (retryErr) {
        console.error(`[stream] message insert failed after retry: ${redact(retryErr.message)}`, redactObject({
          conversationId: payload.conversation_id,
          role: payload.role,
        }))
      }
    }
  })()
}
