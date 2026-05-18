/**
 * send_message_to_agent — Cross-agent messaging via synthetic inbound events.
 *
 * Aligned with OpenClaw's sessions_send semantics:
 * - Same-org access control (equivalent to OpenClaw's agentToAgent policy)
 * - Asynchronous delivery (target processes on next run)
 * - Deterministic conversation pairing for agent-to-agent channels
 *
 * Flow: auto-provisions an 'agent' channel for the target assistant,
 * then inserts a synthetic inbound event into assistant_inbound_events.
 * The existing worker pollInboundEvents() picks it up via claim_next_inbound_event.
 *
 * Requires migration 083 (adds 'agent' to channel_type CHECK, makes
 * secret_token_hash nullable).
 *
 * When/if the gateway spike passes, this can be replaced by
 * OpenClaw's sessions_send with a callGateway() adapter.
 */

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { withSpan } from '../../observability/tracing.js'
import { TenantRateLimiter } from '../../guards/TenantRateLimiter.js'
import { incMessagesEnqueued, incMessagesRejected } from '../../observability/metrics.js'
import { emitAgentFeedEvent } from './feed-events.js'
import { canCrewMembersCommunicate, type CrewContext } from './crew-context.js'

/** Rate limit: max cross-agent messages per minute per org */
const AGENT_MSG_RATE_LIMIT = 30
const AGENT_MSG_RATE_WINDOW_SEC = 60

/** Loop protection: minimum seconds between same-sender messages to same target */
const LOOP_GUARD_WINDOW_SEC = 5

/** Max message length (50KB) — prevents oversized payloads hitting the DB */
const MAX_MESSAGE_LENGTH = 50_000

export interface SendMessageToAgentParams {
  /** UUID of the target assistant — used if provided */
  target_assistant_id?: string
  /** Human-readable name of the target assistant — resolved to ID via DB lookup */
  target_name?: string
  message: string
}

export interface MessagingContext {
  supabase: SupabaseClient
  sourceAssistantId: string
  sourceAssistantName?: string
  orgId: string
  parentRunId?: string
  /** Run ID used to make external_message_id deterministic for dedup on retries */
  toolCallId?: string
  /** Crew context for topology enforcement + message enrichment */
  crewContext?: CrewContext | null
}

/**
 * Find or create an 'agent' channel for the target assistant.
 * Agent channels have no webhook secrets or external IDs — they exist
 * solely to satisfy the channel_id FK in assistant_inbound_events.
 *
 * SECURITY: Caller MUST verify org ownership before calling this function.
 * The assistant_channels table has no org_id column — org isolation is
 * enforced by the FK to assistants (which does have org_id) and by the
 * app-level check in toolSendMessageToAgent. The worker uses service role
 * (bypasses RLS), so the app-level check is the sole org boundary.
 */
async function ensureAgentChannel(
  supabase: SupabaseClient,
  targetAssistantId: string,
): Promise<string> {
  // Check for existing active agent channel
  const { data: existing } = await supabase
    .from('assistant_channels')
    .select('id')
    .eq('assistant_id', targetAssistantId)
    .eq('channel_type', 'agent')
    .eq('is_active', true)
    .single()

  if (existing) return existing.id

  // Create agent channel (no webhook/secrets needed)
  const { data: created, error } = await supabase
    .from('assistant_channels')
    .insert({
      assistant_id: targetAssistantId,
      channel_type: 'agent',
      // secret_token_hash nullable after migration 083
      external_channel_id: `agent-internal:${targetAssistantId}`,
    })
    .select('id')
    .single()

  if (error) {
    // Race condition: another worker created it simultaneously
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('assistant_channels')
        .select('id')
        .eq('assistant_id', targetAssistantId)
        .eq('channel_type', 'agent')
        .eq('is_active', true)
        .single()
      if (retry) return retry.id
    }
    throw new Error(`Failed to create agent channel: ${error.message}`)
  }

  return created.id
}

export async function toolSendMessageToAgent(
  params: SendMessageToAgentParams,
  ctx: MessagingContext,
): Promise<string> {
  if (!params.message?.trim()) {
    return JSON.stringify({ error: 'message is required' })
  }

  if (!params.target_assistant_id && !params.target_name) {
    return JSON.stringify({ error: 'Either target_assistant_id or target_name is required' })
  }

  if (params.message.length > MAX_MESSAGE_LENGTH) {
    incMessagesRejected('too_long')
    return JSON.stringify({ error: `Message too long (${params.message.length} chars). Maximum is ${MAX_MESSAGE_LENGTH} characters.` })
  }

  // Resolve target: by ID or by name (name lookup scoped to same org)
  let targetAssistant: { id: string; name: string; org_id: string } | null = null
  let lookupError: any = null

  if (params.target_assistant_id) {
    if (params.target_assistant_id === ctx.sourceAssistantId) {
      incMessagesRejected('self_send')
      return JSON.stringify({ error: 'Cannot send a message to yourself. Use spawn_subagent for self-delegation.' })
    }

    const { data, error } = await ctx.supabase
      .from('ai_assistants')
      .select('id, name, org_id')
      .eq('id', params.target_assistant_id)
      .single()
    targetAssistant = data
    lookupError = error
  } else if (params.target_name) {
    // Label/name lookup — scoped to same org for safety
    const { data, error } = await ctx.supabase
      .from('ai_assistants')
      .select('id, name, org_id')
      .eq('org_id', ctx.orgId)
      .ilike('name', params.target_name)
      .limit(1)
      .maybeSingle()
    targetAssistant = data
    lookupError = error

    if (targetAssistant && targetAssistant.id === ctx.sourceAssistantId) {
      incMessagesRejected('self_send')
      return JSON.stringify({ error: 'Cannot send a message to yourself. Use spawn_subagent for self-delegation.' })
    }
  }

  if (lookupError || !targetAssistant) {
    incMessagesRejected('not_found')
    return JSON.stringify({ error: 'Target assistant not found' })
  }

  if (targetAssistant.org_id !== ctx.orgId) {
    incMessagesRejected('cross_org')
    return JSON.stringify({ error: 'Cannot message assistants in other organizations' })
  }

  // Crew topology enforcement: if source is in a topology-enforced crew,
  // check if the communication path is allowed before proceeding
  if (ctx.crewContext?.topologyEnforced) {
    const topoCheck = await canCrewMembersCommunicate(
      ctx.supabase,
      ctx.crewContext,
      targetAssistant.id,
    )
    if (!topoCheck.allowed) {
      incMessagesRejected('topology_blocked')
      return JSON.stringify({
        error: topoCheck.reason,
        allowed_targets: topoCheck.allowedTargets,
        hint: 'Only message crew members you are connected to in the topology.',
      })
    }
  }

  return withSpan('messaging.send_to_agent', {
    'lucid.messaging.source_assistant_id': ctx.sourceAssistantId,
    'lucid.messaging.target_assistant_id': targetAssistant.id,
  }, async (span) => {

  // Rate limit: prevent one agent from flooding another's queue
  const rateLimiter = new TenantRateLimiter(ctx.supabase, AGENT_MSG_RATE_LIMIT, AGENT_MSG_RATE_WINDOW_SEC)
  const rateResult = await rateLimiter.tryConsume(ctx.orgId, 'agent_msg_per_min')
  if (!rateResult.allowed) {
    incMessagesRejected('rate_limit')
    return JSON.stringify({
      error: 'Rate limit exceeded for cross-agent messaging. Try again shortly.',
      retry_after_ms: rateResult.retryAfterMs,
    })
  }

  // Loop protection: block if same sender→target pair fired within N seconds
  const loopCutoff = new Date(Date.now() - LOOP_GUARD_WINDOW_SEC * 1000).toISOString()
  const { data: recentMsg } = await ctx.supabase
    .from('assistant_inbound_events')
    .select('id')
    .eq('external_user_id', `agent:${ctx.sourceAssistantId}`)
    .eq('external_chat_id', `agent-pair:${[ctx.sourceAssistantId, targetAssistant.id].sort().join(':')}`)
    .gte('created_at', loopCutoff)
    .limit(1)
    .maybeSingle()

  if (recentMsg) {
    incMessagesRejected('loop_guard')
    return JSON.stringify({
      error: `Loop protection: you already sent a message to this agent within the last ${LOOP_GUARD_WINDOW_SEC}s. Wait before sending again.`,
    })
  }

  // Auto-provision agent channel for the target
  let channelId: string
  try {
    channelId = await ensureAgentChannel(ctx.supabase, targetAssistant.id)
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to provision agent channel' })
  }

  span.setAttribute('lucid.messaging.channel_id', channelId)

  // Deterministic identifiers for dedup and conversation pairing
  // external_message_id uses parentRunId+toolCallId for retry-idempotent inserts
  const pairKey = [ctx.sourceAssistantId, targetAssistant.id].sort().join(':')
  const dedupKey = ctx.toolCallId
    ? `${ctx.parentRunId || 'norun'}:${ctx.toolCallId}`
    : crypto.randomUUID()
  const senderName = ctx.sourceAssistantName || `Agent ${ctx.sourceAssistantId.slice(0, 8)}`

  // Insert synthetic inbound event with proper schema columns
  // channel_id (FK), external_message_id, external_user_id, external_chat_id are all required
  const { error: insertError } = await ctx.supabase
    .from('assistant_inbound_events')
    .insert({
      channel_id: channelId,
      external_message_id: `agent-msg:${dedupKey}`,
      external_user_id: `agent:${ctx.sourceAssistantId}`,
      external_chat_id: `agent-pair:${pairKey}`,
      message_text: `[Message from ${senderName}]: ${params.message}`,
      message_data: {
        source: 'cross_agent_message',
        source_assistant_id: ctx.sourceAssistantId,
        source_assistant_name: senderName,
        source_run_id: ctx.parentRunId,
        pair_key: pairKey,
        // Crew enrichment (null-safe — omitted if not in a crew)
        ...(ctx.crewContext && {
          crew_context: {
            crew_id: ctx.crewContext.crewId,
            crew_name: ctx.crewContext.crewName,
            sender_role: ctx.crewContext.myRole,
          },
        }),
      },
      status: 'pending',
    })

  if (insertError) {
    return JSON.stringify({ error: `Failed to send message: ${insertError.message}` })
  }

  incMessagesEnqueued()

  emitAgentFeedEvent(ctx.supabase, {
    agentId: ctx.sourceAssistantId,
    orgId: ctx.orgId,
    eventType: 'agent_message_sent',
    runId: ctx.parentRunId,
    payload: {
      target_assistant_id: targetAssistant.id,
      target_assistant_name: targetAssistant.name,
      source_assistant_name: senderName,
      message_preview: params.message.slice(0, 200),
    },
  })

  return JSON.stringify({
    success: true,
    target_assistant: { id: targetAssistant.id, name: targetAssistant.name },
    channel_id: channelId,
    message_id: dedupKey,
    delivery: 'async',
    note: 'Message queued. The target agent will process it on its next poll cycle.',
  })

  })
}
