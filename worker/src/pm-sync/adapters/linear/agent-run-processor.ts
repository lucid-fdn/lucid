/**
 * Linear Agent Run Processor — Agent Run Execution + Activity Emission.
 *
 * Loads a Linear agent session from DB, runs the agent loop against the
 * issue context, and emits activities (thoughts, actions, responses) back
 * to Linear as the agent works. Session status is updated through the
 * lifecycle: pending → active → complete (or error).
 *
 * Activity emission flow:
 *   1. emitThought("Working on {identifier}: {title}...")
 *   2. Create inbound event for the agent
 *   3. Run agent via the engine runner
 *   4. During tool calls → emitAction(name, input, result)
 *   5. On completion → emitResponse(result) + setExternalUrl + status=complete
 *   6. On error → emitError(message) + status=error
 *
 * The signal poller runs in parallel — if Linear sends a 'stop' signal,
 * the run is aborted via AbortController.
 *
 * Design: docs/plans/2026-04-09-linear-agents-api-integration.md Phase 2
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LinearAgentClient } from './agent-client.js'
import { redact } from '../../../utils/pii-redactor.js'
import { LinearAgentHandler } from './agent-handler.js'
import {
  getLinearSessionById,
  updateLinearSessionStatus,
  type LinearAgentSessionRow,
} from './agent-session-db.js'
import { startSignalPoller } from './signal-poller.js'
import type { Config } from '../../../config.js'
import { getWorkerLlmConfig } from '../../../ai/lucid-provider-config.js'
import type { AgentRunResult } from '../../../agent/types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LinearAgentRunContext {
  /** Internal UUID from linear_agent_sessions */
  sessionId: string
  /** Linear's session ID (for API calls) */
  linearSessionId: string
  /** Organization ID */
  orgId: string
  /** Agent ID from ai_assistants */
  agentId: string
  /** Issue title from the webhook */
  issueTitle: string
  /** Issue description from the webhook */
  issueDescription?: string
  /** Issue identifier (e.g., ENG-42) */
  issueIdentifier?: string
  /** Additional prompt context from the webhook */
  promptContext?: string
  /** What triggered this session */
  triggerType: 'assignment' | 'mention' | 'comment'
}

export interface LinearAgentRunDeps {
  supabase: SupabaseClient
  config: Config
  agentClient: LinearAgentClient
  /** Nango connection ID for the linear-agent integration */
  connectionId: string
  /** Optional: inject the engine runner for testing. Defaults to the real implementation. */
  runAgent?: (params: Record<string, unknown>) => Promise<AgentRunResult>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_RESPONSE_LENGTH = 4000 // Linear activity content limit
const SIGNAL_POLL_INTERVAL_MS = 5000

// ─── Main Processor ─────────────────────────────────────────────────────────

/**
 * Process a Linear agent session run.
 *
 * This is the entry point called by the Pulse executor. It:
 * 1. Loads session from DB
 * 2. Marks session as active
 * 3. Builds an agent prompt from the issue context
 * 4. Creates a synthetic inbound event for the agent
 * 5. Runs the agent loop
 * 6. Emits activities back to Linear
 * 7. Updates session status on completion/error
 */
export async function processLinearAgentRun(
  ctx: LinearAgentRunContext,
  deps: LinearAgentRunDeps,
): Promise<void> {
  const { supabase, config, agentClient, connectionId } = deps
  const abortController = new AbortController()
  let signalPoller: { stop: () => void } | null = null

  try {
    // 1. Load session from DB and verify it exists
    const session = await getLinearSessionById(supabase, ctx.sessionId)
    if (!session) {
      console.error(
        `[LinearAgentRun] Session ${redact(ctx.sessionId)} not found in DB`,
      )
      return
    }

    // 2. Update session status to active
    await updateLinearSessionStatus(supabase, ctx.sessionId, 'active', {
      run_started_at: new Date().toISOString(),
    })

    // 3. Emit initial thought
    await agentClient.emitThought(
      ctx.linearSessionId,
      `Working on ${ctx.issueIdentifier ? `${ctx.issueIdentifier}: ` : ''}${ctx.issueTitle}...`,
    )

    // 4. Start signal poller (abort run on 'stop' signal)
    signalPoller = startSignalPoller(
      ctx.linearSessionId,
      { connectionId },
      () => {
        console.info(
          `[LinearAgentRun] Stop signal received, aborting session ${redact(ctx.sessionId)}`,
        )
        abortController.abort()
      },
      SIGNAL_POLL_INTERVAL_MS,
    )

    // 5. Build the agent prompt from issue context
    const handler = new LinearAgentHandler(supabase, agentClient)
    const systemPromptContext = handler.buildAgentPrompt(session)
    const userMessage = buildUserMessage(ctx)

    // 6. Load the agent configuration
    const assistant = await loadAssistant(supabase, ctx.agentId)
    if (!assistant) {
      throw new Error(`Agent ${ctx.agentId} not found in ai_assistants`)
    }

    // 7. Create a synthetic inbound event for the agent
    const inboundEventId = await createSyntheticInboundEvent(
      supabase,
      ctx,
      userMessage,
    )

    // 8. Run the agent
    await agentClient.emitThought(
      ctx.linearSessionId,
      'Analyzing the issue and preparing a response...',
    )

    const result = await runAgentLoop(
      supabase,
      config,
      assistant,
      userMessage,
      systemPromptContext,
      ctx,
      deps,
      abortController.signal,
    )

    // Check if aborted (stop signal)
    if (abortController.signal.aborted) {
      await agentClient.emitError(
        ctx.linearSessionId,
        'Agent run was stopped by signal.',
      )
      await agentClient.updateSessionStatus(ctx.linearSessionId, 'canceled')
      await updateLinearSessionStatus(supabase, ctx.sessionId, 'cancelled' /* DB uses UK spelling */, {
        completed_at: new Date().toISOString(),
      })
      // Mark inbound event as completed
      await markInboundEventComplete(supabase, inboundEventId)
      return
    }

    // 9. Emit response to Linear
    const responseText = truncateResponse(result.response)
    await agentClient.emitResponse(ctx.linearSessionId, responseText)

    // 10. Set external URL pointing to Lucid Mission Control
    const mcUrl = buildMissionControlUrl(ctx.orgId, ctx.agentId, config)
    if (mcUrl) {
      await agentClient.setExternalUrl(
        ctx.linearSessionId,
        'View in Lucid',
        mcUrl,
      )
    }

    // 11. Update session status to complete
    await agentClient.updateSessionStatus(ctx.linearSessionId, 'completed')
    await updateLinearSessionStatus(supabase, ctx.sessionId, 'complete', {
      completed_at: new Date().toISOString(),
    })

    // Mark inbound event as completed
    await markInboundEventComplete(supabase, inboundEventId)

    console.info(
      `[LinearAgentRun] Session ${redact(ctx.sessionId)} completed successfully`,
    )
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err))
    console.error(
      `[LinearAgentRun] Session ${redact(ctx.sessionId)} failed:`,
      message,
    )

    // Emit error to Linear (defensive — never let error-path calls block cleanup)
    try { await agentClient.emitError(
      ctx.linearSessionId,
      `Agent encountered an error: ${truncateResponse(message)}`,
    ) } catch { /* fire-and-forget */ }
    try { await agentClient.updateSessionStatus(ctx.linearSessionId, 'failed') } catch { /* fire-and-forget */ }
    await updateLinearSessionStatus(supabase, ctx.sessionId, 'error', {
      completed_at: new Date().toISOString(),
    }).catch(() => { /* best-effort */ })
  } finally {
    // Clean up signal poller
    if (signalPoller) {
      signalPoller.stop()
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build the user message from issue context.
 */
function buildUserMessage(ctx: LinearAgentRunContext): string {
  const parts: string[] = []

  if (ctx.issueIdentifier) {
    parts.push(`[${ctx.issueIdentifier}] ${ctx.issueTitle}`)
  } else {
    parts.push(ctx.issueTitle)
  }

  if (ctx.issueDescription) {
    parts.push('')
    parts.push(ctx.issueDescription)
  }

  if (ctx.promptContext) {
    parts.push('')
    parts.push(`Context: ${ctx.promptContext}`)
  }

  return parts.join('\n')
}

/**
 * Load assistant configuration from ai_assistants.
 */
async function loadAssistant(
  supabase: SupabaseClient,
  agentId: string,
): Promise<AssistantRow | null> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select(
      'id, name, engine, system_prompt, soul_content, lucid_model, temperature, max_tokens, memory_enabled, memory_window_size, org_id, passport_id, policy_config, wallet_enabled, approval_required_tools',
    )
    .eq('id', agentId)
    .single()

  if (error || !data) return null
  return data as AssistantRow
}

interface AssistantRow {
  id: string
  name: string | null
  engine?: 'openclaw' | 'hermes' | null
  system_prompt: string | null
  soul_content: string | null
  lucid_model: string | null
  temperature: number | null
  max_tokens: number | null
  memory_enabled: boolean
  memory_window_size: number | null
  org_id: string
  passport_id: string | null
  policy_config: Record<string, unknown> | null
  wallet_enabled: boolean
  approval_required_tools: string[] | null
}

/**
 * Create a synthetic inbound event so the agent run is tracked.
 */
async function createSyntheticInboundEvent(
  supabase: SupabaseClient,
  ctx: LinearAgentRunContext,
  message: string,
): Promise<string> {
  const crypto = await import('node:crypto')
  const eventId = crypto.randomUUID()

  const { error } = await supabase.from('assistant_inbound_events').insert({
    id: eventId,
    assistant_id: ctx.agentId,
    org_id: ctx.orgId,
    channel_type: 'linear',
    external_channel_id: `linear-session:${ctx.linearSessionId}`,
    external_user_id: `linear-session:${ctx.linearSessionId}`,
    external_message_id: `linear-agent-session:${ctx.sessionId}`,
    message_text: message,
    status: 'processing',
    metadata: {
      linear_session_id: ctx.linearSessionId,
      trigger_type: ctx.triggerType,
      issue_identifier: ctx.issueIdentifier,
    },
  })

  if (error) {
    console.warn(
      `[LinearAgentRun] Failed to create synthetic inbound event: ${error.message}`,
    )
  }

  return eventId
}

/**
 * Mark a synthetic inbound event as completed.
 */
async function markInboundEventComplete(
  supabase: SupabaseClient,
  eventId: string,
): Promise<void> {
  await supabase
    .from('assistant_inbound_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', eventId)
}

/**
 * Run the agent loop against the issue context.
 *
 * Uses the engine runner pipeline (OpenClawAgentParams interface)
 * with a synthetic message. The system prompt context is prepended to the
 * assistant's own system prompt.
 */
async function runAgentLoop(
  supabase: SupabaseClient,
  config: Config,
  assistant: AssistantRow,
  userMessage: string,
  systemPromptContext: string,
  ctx: LinearAgentRunContext,
  deps: LinearAgentRunDeps,
  signal: AbortSignal,
): Promise<{ response: string }> {
  // Use injected runAgent for testing, or dynamically import the real implementation
  const runAgent = deps.runAgent
    ?? (await import('../../../agent/engines/index.js')).runAgent
  const crypto = await import('node:crypto')
  const runId = crypto.randomUUID()

  // Combine Linear issue context with the assistant's own system prompt
  const combinedSystemPrompt = [
    assistant.system_prompt || '',
    systemPromptContext,
  ].filter(Boolean).join('\n\n')

  try {
    const result = await runAgent({
      assistant: {
        id: assistant.id,
        name: assistant.name || 'Linear Agent',
        engine: (assistant.engine as 'openclaw' | 'hermes' | null | undefined) ?? 'openclaw',
        system_prompt: combinedSystemPrompt,
        soul_content: assistant.soul_content ?? null,
        lucid_model: assistant.lucid_model || config.STRONG_MODEL,
        temperature: assistant.temperature ?? 0.7,
        max_tokens: assistant.max_tokens ?? 4096,
        memory_enabled: assistant.memory_enabled ?? false,
        memory_window_size: assistant.memory_window_size ?? 10,
        org_id: assistant.org_id || null,
        passport_id: assistant.passport_id ?? null,
        policy_config: assistant.policy_config ?? null,
        wallet_enabled: assistant.wallet_enabled ?? false,
        approval_required_tools: assistant.approval_required_tools ?? [],
      },
      conversationId: `linear-session:${ctx.linearSessionId}`,
      messages: [],
      memories: [],
      userMessage,
      budget: {
        maxLlmCalls: config.DEFAULT_MAX_LLM_CALLS,
        maxToolCalls: config.DEFAULT_MAX_TOOL_CALLS,
        maxWallTimeMs: config.DEFAULT_MAX_WALL_TIME_MS,
      },
      runId,
      // Linear agent sessions have no human user — use the assistant's own ID as userId
      // so builtInParams is populated and built-in tools are reachable.
      userId: assistant.id,
      llmConfig: getWorkerLlmConfig(config),
      supabase,
      abortSignal: signal,
    })

    return { response: result.text || 'Agent completed without a response.' }
  } catch (err) {
    if (signal.aborted) {
      // Abort is expected — don't re-throw
      return { response: 'Run was stopped.' }
    }
    throw err
  }
}

/**
 * Truncate a response to fit Linear's activity content limit.
 */
function truncateResponse(text: string): string {
  if (text.length <= MAX_RESPONSE_LENGTH) return text
  return text.slice(0, MAX_RESPONSE_LENGTH - 3) + '...'
}

/**
 * Build a Mission Control URL for this agent run.
 */
function buildMissionControlUrl(
  orgId: string,
  agentId: string,
  config?: Config,
): string | null {
  // Use the app base URL from config, falling back to the API base URL
  // (stripping /api suffix) or a sensible default
  const baseUrl = (config as Record<string, unknown> | undefined)?.APP_BASE_URL as string
    ?? (config?.LUCID_API_BASE_URL
      ? config.LUCID_API_BASE_URL.replace(/\/api\/?$/, '')
      : null)
  if (!baseUrl) return null
  return `${baseUrl}/mission-control/agents/${agentId}`
}
