/**
 * Inbound Event Processor
 * 
 * Processes incoming messages from channels (Telegram, WhatsApp, Web).
 * 
 * Phase 1A Pipeline (see docs/OPENCLAW_INTEGRATION_SPEC.md §5.2 v2.2):
 * 
 * Step 0:  Load channel + compute canonical tenant keys (BEFORE everything)
 * Step 1:  Idempotency check (InboundDeduper) — BEFORE lock & heartbeat
 * Step 1.5: Rate limit (TenantRateLimiter) + Policy check (PolicyEngine)
 * Step 2:  Get or create conversation (with lock)
 * Step 2.5: Update external_channel_id (only if changed)
 * Step 3:  Store user message (BEFORE LLM call - transcript consistency)
 * Step 4:  Load context (recent messages)
 * Step 5:  Load memory (real or skip if disabled)
 * Step 6:  if FEATURE_AGENT_RUNTIME → AgentLoop (Think→Act→Observe)
 *          else → legacy streamLucidL2() / callLucidL2Fetch()
 * Step 7:  Store assistant response + track billing
 * Step 8:  Mark done
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import { getWorkerLlmConfig } from '../ai/lucid-provider-config.js'
import { getWorkerMediaProviderConfig } from '../ai/media-provider-config.js'
import { markOutboundSent, renewLease } from '../adapters/supabase.js'
import type { ChannelOutput, ChannelOutputConfig } from '../channels/ChannelOutput.js'
import { resolveSlackInboundAugmentation } from '../channels/bridge/slack/inbound-media.js'
import { resolveDiscordInboundAugmentation } from '../channels/bridge/discord/inbound-media.js'
import { resolveDiscordDeliveryConfig } from '../channels/bridge/discord/config.js'
import { applyAudioLanguageGuardrail } from '../channels/bridge/media/audio-language-guardrail.js'
import {
  resolveDiscordVoiceReplySettings,
  resolveTelegramVoiceReplySettings,
} from '../channels/bridge/media/voice-reply-policy.js'
import { createDiscordPlugin } from '../channels/bridge/discord/DiscordPlugin.js'
import { createDiscordBridgeOutput } from '../channels/bridge/discord/DiscordOpenClawBridge.js'
import { DiscordVoiceChannelOutput } from '../channels/discord/DiscordVoiceChannelOutput.js'
import { createSlackPlugin } from '../channels/bridge/slack/SlackPlugin.js'
import { createSlackBridgeOutput } from '../channels/bridge/slack/SlackOpenClawBridge.js'
import { createTelegramPlugin } from '../channels/bridge/telegram/TelegramPlugin.js'
import { createTelegramBridgeOutput } from '../channels/bridge/telegram/TelegramOpenClawBridge.js'
import { resolveTelegramInboundAugmentation } from '../channels/bridge/telegram/inbound-media.js'
import { redact } from '../utils/pii-redactor.js'
import {
  buildHostedTelegramReplyMarkup,
  formatHostedTelegramFinalText,
} from '../channels/bridge/telegram/presentation.js'
import { createWhatsAppPlugin } from '../channels/bridge/whatsapp/WhatsAppPlugin.js'
import { createWhatsAppBridgeOutput } from '../channels/bridge/whatsapp/WhatsAppOpenClawBridge.js'
import { WebChannelOutput } from '../channels/WebChannelOutput.js'
import { createChannelProgressController } from '../channels/progress/index.js'
import { InboundDeduper } from '../guards/InboundDeduper.js'
import { TenantRateLimiter } from '../guards/TenantRateLimiter.js'
import { PolicyEngine } from '../guards/PolicyEngine.js'
import { getActiveCrewContext, type CrewContext } from '../agent/runtime-tools/crew-context.js'
import type { ActivatedPlugin } from '../agent/plugin-types.js'
import { mapRpcRowToActivatedPlugin } from '../agent/plugin-types.js'
import { routeSlashCommand } from '../commands/SlashCommandRouter.js'
import { ConversationLock } from '../locks/ConversationLock.js'
import { EncryptionService, type EncryptionMode } from '../crypto/encryption-service.js'
import { computeTenantKeys, type TenantKeys } from '../utils/tenant-keys.js'
import { trackUsage, createLogContext, captureError } from '../utils/usage-tracker.js'
import { extractAndStoreMemories } from '../memory/extractAndStoreMemories.js'
import crypto from 'node:crypto'
import { decryptChannelSecrets as decryptSecretString } from '../crypto/decrypt-channel-secrets.js'
import { startInboundSpan, SpanStatusCode, sanitizeErrorForTelemetry, withDbSpan } from '../observability/tracing.js'
import { recordInteractiveLatency } from '../observability/metrics.js'
import { ConversationCompactor } from '../agent/ConversationCompactor.js'
import { loadBoardMemories } from '../agent/board-memory-loader.js'
import { emitNotification, ALERTS, isCreditError } from '../notifications/emitter.js'
import { shouldFallbackWalletSchemaQuery } from '../db/postgrest-compat.js'
import { captureMessage } from '../monitoring/sentry.js'
import { enqueueOutboundEventImmediately } from '../pulse/enqueue/outbound.js'
import { createInboundTraceId, type InboundEnvelope } from '../core/contracts/index.js'
import { markInboundStage } from '../core/lifecycle/message-lifecycle.js'
import { classifyMessageFailure } from '../core/reliability/failure-classifier.js'
import { defaultWorkerRunExecutor } from '../core/runtime/worker-run-executor.js'
import { getInboundMessageTraceFields } from '../core/trace/message-trace.js'
import {
  buildKnowledgeContextLadder,
  buildKnowledgeHotPacket,
  buildKnowledgePromptPacketFromLegacyContext,
} from '../knowledge/prompt-packet.js'
import { KnowledgeOperationClient } from '../knowledge/operations-client.js'
import type { KnowledgeLayer, KnowledgePromptPacket } from '../knowledge/types.js'
import { retrieveAssistantMemoryRecall } from '../knowledge/assistant-recall.js'
import { decryptAssistantMessageRows } from '../memory/message-context.js'
import { enqueueMemoryExtractionJob } from '../jobs/memory-extraction-jobs.js'

interface InboundEvent {
  id: string
  created_at?: string | null
  channel_id: string
  external_message_id: string
  external_user_id: string
  external_chat_id: string
  message_text: string | null
  message_data: Record<string, unknown> | null
  attempts: number
  max_attempts: number
  status?: string | null
  locked_by?: string | null
  processing_started_at?: string | null
}

function toInboundEnvelope(
  event: InboundEvent,
  channelType: string,
  assistantId: string,
): InboundEnvelope<Record<string, unknown> | null> {
  const messageData =
    event.message_data && typeof event.message_data === 'object'
      ? event.message_data
      : null

  const rawAttachments = Array.isArray(messageData?.discord_attachments)
    ? messageData.discord_attachments
    : Array.isArray(messageData?.attachments)
      ? messageData.attachments
      : Array.isArray(messageData?.whatsapp_attachments)
        ? messageData.whatsapp_attachments
        : []

  const attachments = rawAttachments
    .filter((attachment): attachment is Record<string, unknown> => !!attachment && typeof attachment === 'object')
    .map((attachment) => ({
      kind: typeof attachment.kind === 'string' ? attachment.kind : 'file',
      id: typeof attachment.id === 'string' ? attachment.id : null,
      fileName: typeof attachment.fileName === 'string' ? attachment.fileName : null,
      url: typeof attachment.url === 'string' ? attachment.url : null,
      mimeType: typeof attachment.mimeType === 'string' ? attachment.mimeType : null,
    }))

  return {
    traceId: createInboundTraceId(channelType, event.id),
    inboundEventId: event.id,
    assistantId,
    channelId: event.channel_id,
    channelType,
    externalMessageId: event.external_message_id,
    externalUserId: event.external_user_id,
    externalChatId: event.external_chat_id,
    normalizedText: event.message_text || '',
    replyMode: 'direct',
    bindingScope:
      messageData && typeof messageData.discord_binding_scope === 'string'
        ? (messageData.discord_binding_scope as 'channel' | 'guild')
        : null,
    threadId:
      messageData && typeof messageData.thread_id === 'string'
        ? messageData.thread_id
        : null,
    attachments,
    messageData,
  }
}

async function finalizeInboundDone(
  supabase: SupabaseClient,
  config: Config,
  event: InboundEvent,
  channelType: string,
  assistantId: string,
  options?: {
    encryptionService?: EncryptionService
    requireQueuedReply?: boolean
  },
): Promise<void> {
  if (options?.requireQueuedReply && requiresQueuedReplyMaterialization(channelType)) {
    const repaired = await repairCompletedInboundDelivery({
      supabase,
      config,
      encryptionService: options.encryptionService,
      eventId: event.id,
      acceptedStatuses: ['processing', 'done'],
    })

    if (!repaired) {
      throw new Error(`Failed to materialize outbound reply before completion for inbound ${event.id}`)
    }
  }

  await markInboundStage({
    supabase,
    eventId: event.id,
    stage: 'done',
  })

  if (!event.created_at) return
  const latencyMs = Date.now() - new Date(event.created_at).getTime()
  const outcome =
    latencyMs >= config.INTERACTIVE_LATENCY_ALERT_MS
      ? 'alert'
      : latencyMs >= config.INTERACTIVE_LATENCY_WARN_MS
        ? 'slow'
        : 'ok'

  recordInteractiveLatency(latencyMs, channelType, outcome)

  if (latencyMs >= config.INTERACTIVE_LATENCY_ALERT_MS) {
    captureMessage('Interactive inbound latency exceeded alert threshold', 'warning', {
      assistantId,
      channel: channelType,
      latencyMs,
      thresholdMs: config.INTERACTIVE_LATENCY_ALERT_MS,
      inboundEventId: event.id,
    })
  }
}

function requiresQueuedReplyMaterialization(channelType: string): boolean {
  return channelType === 'discord' || channelType === 'slack'
}

function supportsDirectChannelOutput(channelType: string): boolean {
  return (
    channelType === 'telegram' ||
    channelType === 'whatsapp' ||
    channelType === 'discord' ||
    channelType === 'slack'
  )
}

export function isNonReplyingSystemEvent(event: Pick<InboundEvent, 'message_data'>): boolean {
  const source =
    event.message_data && typeof event.message_data.source === 'string'
      ? event.message_data.source
      : null
  return source === 'system_event'
}

export function getInboundStoredMessageRole(
  event: Pick<InboundEvent, 'message_data'>,
): 'user' | 'system' {
  return isNonReplyingSystemEvent(event) ? 'system' : 'user'
}

function getSlackReplyToMode(
  channelConfig: Record<string, unknown> | null | undefined,
): 'off' | 'first' | 'all' {
  const configuredMode = channelConfig?.slack_reply_to_mode
  return configuredMode === 'first' || configuredMode === 'all' ? configuredMode : 'off'
}

export function getSlackThreadContextConfig(
  event: Pick<InboundEvent, 'message_data' | 'external_user_id' | 'channel_id'>,
) {
  const messageData =
    event.message_data && typeof event.message_data === 'object'
      ? event.message_data
      : null
  const threadTs =
    messageData && typeof messageData.thread_ts === 'string' && messageData.thread_ts.trim().length > 0
      ? messageData.thread_ts.trim()
      : null
  if (!threadTs) {
    return null
  }

  const parentChatId =
    messageData &&
    typeof messageData.slack_parent_chat_id === 'string' &&
    messageData.slack_parent_chat_id.trim().length > 0
      ? messageData.slack_parent_chat_id.trim()
      : null

  const historyScope =
    messageData?.slack_thread_history_scope === 'channel' ? 'channel' : 'thread'
  const inheritParent = messageData?.slack_thread_inherit_parent === true
  const initialHistoryLimit =
    typeof messageData?.slack_thread_initial_history_limit === 'number' &&
    Number.isInteger(messageData.slack_thread_initial_history_limit) &&
    messageData.slack_thread_initial_history_limit >= 0
      ? messageData.slack_thread_initial_history_limit
      : null

  return {
    threadTs,
    parentChatId,
    historyScope,
    inheritParent,
    initialHistoryLimit,
  }
}

export function getDiscordThreadContextConfig(
  event: Pick<InboundEvent, 'message_data' | 'external_user_id' | 'channel_id'>,
) {
  const messageData =
    event.message_data && typeof event.message_data === 'object'
      ? event.message_data
      : null
  const threadId =
    messageData && typeof messageData.thread_id === 'string' && messageData.thread_id.trim().length > 0
      ? messageData.thread_id.trim()
      : null
  if (!threadId) {
    return null
  }

  const parentChatId =
    messageData &&
    typeof messageData.discord_parent_chat_id === 'string' &&
    messageData.discord_parent_chat_id.trim().length > 0
      ? messageData.discord_parent_chat_id.trim()
      : null

  const historyScope =
    messageData?.discord_thread_history_scope === 'channel' ? 'channel' : 'thread'
  const inheritParent = messageData?.discord_thread_inherit_parent === true
  const initialHistoryLimit =
    typeof messageData?.discord_thread_initial_history_limit === 'number' &&
    Number.isInteger(messageData.discord_thread_initial_history_limit) &&
    messageData.discord_thread_initial_history_limit >= 0
      ? messageData.discord_thread_initial_history_limit
      : null

  return {
    threadId,
    parentChatId,
    historyScope,
    inheritParent,
    initialHistoryLimit,
  }
}

export async function loadSlackParentContextMessages(params: {
  supabase: SupabaseClient
  event: InboundEvent
  conversationId: string
  assistant: AssistantChannel['assistant']
  tenantKeys: TenantKeys
  encryptionService?: EncryptionService
  fallbackLimit: number
}): Promise<Array<{ role: string; content: string }>> {
  const threadConfig = getSlackThreadContextConfig(params.event)
  if (!threadConfig?.parentChatId) return []
  if (threadConfig.historyScope !== 'channel' && !threadConfig.inheritParent) return []

  const parentHistoryLimit =
    threadConfig.initialHistoryLimit ?? params.fallbackLimit
  if (parentHistoryLimit <= 0) return []

  const { data: parentConversation, error: parentConversationError } = await params.supabase
    .from('assistant_conversations')
    .select('id')
    .eq('channel_id', params.event.channel_id)
    .eq('external_user_id', params.event.external_user_id)
    .eq('external_chat_id', threadConfig.parentChatId)
    .eq('is_active', true)
    .maybeSingle()

  if (parentConversationError || !parentConversation?.id || parentConversation.id === params.conversationId) {
    return []
  }

  const { data: parentRows, error: parentRowsError } = await params.supabase
    .from('assistant_messages')
    .select('id, role, content, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id')
    .eq('conversation_id', parentConversation.id)
    .order('created_at', { ascending: false })
    .limit(parentHistoryLimit)

  if (parentRowsError || !parentRows) {
    return []
  }

  const decryptedParentRows = await decryptAssistantMessageRows({
    rows: [...parentRows].reverse(),
    encryptionService: params.encryptionService,
    assistantOrgId: params.assistant.org_id,
    tenantKeys: params.tenantKeys,
  })

  if (threadConfig.historyScope === 'channel') {
    return decryptedParentRows
  }

  return threadConfig.inheritParent ? decryptedParentRows.slice(-2) : []
}

export async function loadDiscordParentContextMessages(params: {
  supabase: SupabaseClient
  event: InboundEvent
  conversationId: string
  assistant: AssistantChannel['assistant']
  tenantKeys: TenantKeys
  encryptionService?: EncryptionService
  fallbackLimit: number
}): Promise<Array<{ role: string; content: string }>> {
  const threadConfig = getDiscordThreadContextConfig(params.event)
  if (!threadConfig?.parentChatId) return []
  if (threadConfig.historyScope !== 'channel' && !threadConfig.inheritParent) return []

  const parentHistoryLimit =
    threadConfig.initialHistoryLimit ?? params.fallbackLimit
  if (parentHistoryLimit <= 0) return []

  const { data: parentConversation, error: parentConversationError } = await params.supabase
    .from('assistant_conversations')
    .select('id')
    .eq('channel_id', params.event.channel_id)
    .eq('external_user_id', params.event.external_user_id)
    .eq('external_chat_id', threadConfig.parentChatId)
    .eq('is_active', true)
    .maybeSingle()

  if (parentConversationError || !parentConversation?.id || parentConversation.id === params.conversationId) {
    return []
  }

  const { data: parentRows, error: parentRowsError } = await params.supabase
    .from('assistant_messages')
    .select('id, role, content, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id')
    .eq('conversation_id', parentConversation.id)
    .order('created_at', { ascending: false })
    .limit(parentHistoryLimit)

  if (parentRowsError || !parentRows) {
    return []
  }

  const decryptedParentRows = await decryptAssistantMessageRows({
    rows: [...parentRows].reverse(),
    encryptionService: params.encryptionService,
    assistantOrgId: params.assistant.org_id,
    tenantKeys: params.tenantKeys,
  })

  if (threadConfig.historyScope === 'channel') {
    return decryptedParentRows
  }

  return threadConfig.inheritParent ? decryptedParentRows.slice(-2) : []
}

interface AssistantChannel {
  id: string
  assistant_id: string
  channel_type: string
  external_channel_id: string | null
  channel_config?: Record<string, unknown> | null
  encrypted_secrets: {
    id: string
    encrypted_data: string
  } | null
  assistant: {
    id: string
    name: string
    engine?: 'openclaw' | 'hermes' | null
    system_prompt: string | null
    lucid_model: string
    temperature: number
    max_tokens: number
    memory_enabled: boolean
    memory_window_size: number
    memory_strategy: 'auto' | 'aggressive' | 'conservative' | 'off' | null
    stream_mode: string | null
    org_id: string | null
    passport_id: string | null
    telegram_voice_mode?: 'off' | 'auto' | 'always' | null
    telegram_voice_id?: string | null
    telegram_voice_instructions?: string | null
    policy_config: Record<string, unknown> | null
    wallet_enabled: boolean
    agent_wallets: Array<{
      chain_type: string
      privy_wallet_id: string
      address: string
      status: string
    }>
  }
}

interface PersistedOutboundEvent {
  id: string
  channel_id: string
  inbound_event_id: string | null
  conversation_id: string | null
  message_text: string
  reply_to_external_id: string | null
  attempts: number
  max_attempts: number
  status?: string | null
}

async function insertAndQueueOutboundEvent(params: {
  supabase: SupabaseClient
  config: Config
  assistantOrgId: string | null
  channelId: string
  channelType: string
  inboundEventId: string
  conversationId: string
  messageText: string
  replyToExternalId: string | null
}): Promise<void> {
  const outboundPayload = buildOutboundPayload(params)
  let outboundEvent = await insertOutboundEvent(params.supabase, outboundPayload)

  if (!outboundEvent) {
    outboundEvent = await findPersistedOutboundEvent(params.supabase, params.inboundEventId, params.channelId)
  }

  if (!outboundEvent) {
    console.warn(
      `[processor] Outbound insert returned no row for inbound ${params.inboundEventId}; retrying insert once`,
    )
    outboundEvent = await insertOutboundEvent(params.supabase, outboundPayload)
  }

  if (!outboundEvent) {
    outboundEvent = await findPersistedOutboundEvent(params.supabase, params.inboundEventId, params.channelId)
  }

  if (!outboundEvent) {
    throw new Error(
      `Failed to persist outbound event for inbound ${params.inboundEventId}: insert returned no row and verification found nothing`,
    )
  }

  await dispatchOrQueueOutboundEvent({
    supabase: params.supabase,
    config: params.config,
    assistantOrgId: params.assistantOrgId,
    channelType: params.channelType,
    outboundEvent,
  })
}

async function persistSatisfiedOutboundDelivery(params: {
  supabase: SupabaseClient
  channelId: string
  inboundEventId: string
  conversationId: string
  messageText: string
  replyToExternalId: string | null
}): Promise<void> {
  console.log(
    `[processor] Persisting satisfied direct delivery for inbound ${params.inboundEventId}`,
  )
  let outboundEvent = await findPersistedOutboundEvent(
    params.supabase,
    params.inboundEventId,
    params.channelId,
  )

  if (!outboundEvent) {
    outboundEvent = await insertOutboundEvent(
      params.supabase,
      buildOutboundPayload({
        channelId: params.channelId,
        inboundEventId: params.inboundEventId,
        conversationId: params.conversationId,
        messageText: params.messageText,
        replyToExternalId: params.replyToExternalId,
      }),
    )
  }

  if (!outboundEvent) {
    outboundEvent = await findPersistedOutboundEvent(
      params.supabase,
      params.inboundEventId,
      params.channelId,
    )
  }

  if (!outboundEvent) {
    throw new Error(
      `Failed to persist outbound delivery marker for inbound ${params.inboundEventId}`,
    )
  }

  if (outboundEvent.status !== 'sent') {
    await markOutboundSent(params.supabase, outboundEvent.id, null)
  }

  console.log(
    `[processor] Direct delivery marker persisted for inbound ${params.inboundEventId} as outbound ${outboundEvent.id}`,
  )
}

function buildOutboundPayload(params: {
  channelId: string
  inboundEventId: string
  conversationId: string
  messageText: string
  replyToExternalId: string | null
}) {
  return {
    channel_id: params.channelId,
    inbound_event_id: params.inboundEventId,
    conversation_id: params.conversationId,
    message_text: params.messageText,
    reply_to_external_id: params.replyToExternalId,
  }
}

async function findPersistedOutboundEvent(
  supabase: SupabaseClient,
  inboundEventId: string,
  channelId: string,
): Promise<PersistedOutboundEvent | null> {
  const { data, error } = await supabase
    .from('assistant_outbound_events')
    .select(
      'id, channel_id, inbound_event_id, conversation_id, message_text, reply_to_external_id, attempts, max_attempts, status',
    )
    .eq('inbound_event_id', inboundEventId)
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn(
      `[processor] Failed to verify outbound persistence for inbound ${inboundEventId}: ${error.message}`,
    )
    return null
  }

  return data as PersistedOutboundEvent | null
}

async function insertOutboundEvent(
  supabase: SupabaseClient,
  outboundPayload: ReturnType<typeof buildOutboundPayload>,
): Promise<PersistedOutboundEvent | null> {
  const { data, error } = await supabase
    .from('assistant_outbound_events')
    .insert(outboundPayload)
    .select(
      'id, channel_id, inbound_event_id, conversation_id, message_text, reply_to_external_id, attempts, max_attempts, status',
    )
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to insert outbound event: ${error.message}`)
  }

  return data as PersistedOutboundEvent | null
}

async function dispatchOrQueueOutboundEvent(params: {
  supabase: SupabaseClient
  config: Config
  assistantOrgId: string | null
  channelType: string
  outboundEvent: PersistedOutboundEvent
}): Promise<void> {
  const shouldInlineDispatch = requiresQueuedReplyMaterialization(params.channelType)

  if (shouldInlineDispatch) {
    try {
      const { processOutboundEvent } = await import('./outbound.js')
      await processOutboundEvent(params.outboundEvent, params.supabase, params.config)

      const latestState = await findPersistedOutboundEvent(
        params.supabase,
        params.outboundEvent.inbound_event_id ?? '',
        params.outboundEvent.channel_id,
      )

      if (!latestState || latestState.status === 'pending') {
        await enqueueOutboundEventImmediately({
          id: params.outboundEvent.id,
          channel_id: params.outboundEvent.channel_id,
          org_id: params.assistantOrgId,
        })
      }
      return
    } catch (error) {
      console.warn(
        `[processor] Inline outbound dispatch failed for ${params.outboundEvent.id}; falling back to queue`,
        error instanceof Error ? error.message : error,
      )
      await enqueueOutboundEventImmediately({
        id: params.outboundEvent.id,
        channel_id: params.outboundEvent.channel_id,
        org_id: params.assistantOrgId,
      })
      return
    }
  }

  await enqueueOutboundEventImmediately({
    id: params.outboundEvent.id,
    channel_id: params.outboundEvent.channel_id,
    org_id: params.assistantOrgId,
  })
}

async function ensureOutboundEventQueued(params: {
  supabase: SupabaseClient
  config: Config
  assistantOrgId: string | null
  channelId: string
  channelType: string
  inboundEventId: string
  conversationId: string
  messageText: string
  replyToExternalId: string | null
}): Promise<void> {
  const existing = await findPersistedOutboundEvent(params.supabase, params.inboundEventId, params.channelId)
  if (existing) {
    if (existing.status !== 'sent') {
      await dispatchOrQueueOutboundEvent({
        supabase: params.supabase,
        config: params.config,
        assistantOrgId: params.assistantOrgId,
        channelType: params.channelType,
        outboundEvent: existing,
      })
    }
    return
  }

  console.warn(
    `[processor] Missing outbound row for inbound ${params.inboundEventId} at completion boundary; repairing`,
  )
  await insertAndQueueOutboundEvent(params)
}

export async function ensureInboundReplyMaterialized(params: {
  supabase: SupabaseClient
  config: Config
  encryptionService?: EncryptionService
  assistantOrgId: string | null
  channel: AssistantChannel
  tenantKeys: TenantKeys
  inboundEventId: string
  channelId: string
  conversationId: string
  replyToExternalId: string | null
  preferredMessageText?: string | null
  userMessageCreatedAt?: string | null
}): Promise<void> {
  const existing = await findPersistedOutboundEvent(
    params.supabase,
    params.inboundEventId,
    params.channelId,
  )

  if (existing) {
    if (existing.status !== 'sent') {
      await dispatchOrQueueOutboundEvent({
        supabase: params.supabase,
        config: params.config,
        assistantOrgId: params.assistantOrgId,
        channelType: params.channel.channel_type,
        outboundEvent: existing,
      })
    }
    return
  }

  const preferredMessageText = params.preferredMessageText?.trim()
  if (preferredMessageText) {
    await ensureOutboundEventQueued({
      supabase: params.supabase,
      config: params.config,
      assistantOrgId: params.assistantOrgId,
      channelId: params.channelId,
      channelType: params.channel.channel_type,
      inboundEventId: params.inboundEventId,
      conversationId: params.conversationId,
      messageText: preferredMessageText,
      replyToExternalId: params.replyToExternalId,
    })
    return
  }

  if (!params.replyToExternalId) {
    throw new Error(
      `Cannot materialize outbound reply for inbound ${params.inboundEventId}: missing external reply id`,
    )
  }

  const repaired = await repairCompletedInboundDeliveryFromConversation({
    supabase: params.supabase,
    config: params.config,
    encryptionService: params.encryptionService,
    inboundEvent: {
      id: params.inboundEventId,
      channel_id: params.channelId,
      external_message_id: params.replyToExternalId,
    },
    channel: params.channel,
    tenantKeys: params.tenantKeys,
    conversationId: params.conversationId,
    userMessageCreatedAt: params.userMessageCreatedAt ?? null,
  })

  if (!repaired) {
    throw new Error(
      `Failed to materialize outbound reply for inbound ${params.inboundEventId}: no outbound row and no recoverable assistant reply`,
    )
  }
}

export async function repairCompletedInboundDelivery(params: {
  supabase: SupabaseClient
  config: Config
  encryptionService?: EncryptionService
  eventId: string
  acceptedStatuses?: string[]
}): Promise<boolean> {
  const acceptedStatuses = params.acceptedStatuses ?? ['done']
  const { data: inboundEvent, error: inboundError } = await params.supabase
    .from('assistant_inbound_events')
    .select(`
      id,
      channel_id,
      external_message_id,
      external_user_id,
      external_chat_id,
      message_data,
      status
    `)
    .eq('id', params.eventId)
    .maybeSingle()

  if (
    inboundError ||
    !inboundEvent ||
    !acceptedStatuses.includes(String(inboundEvent.status ?? ''))
  ) {
    return false
  }

  if (
    inboundEvent.message_data &&
    typeof inboundEvent.message_data === 'object' &&
    isNonReplyingSystemEvent({
      message_data: inboundEvent.message_data as Record<string, unknown>,
    })
  ) {
    return true
  }

  const existingOutbound = await findPersistedOutboundEvent(
    params.supabase,
    inboundEvent.id as string,
    inboundEvent.channel_id as string,
  )
  if (existingOutbound) {
    return true
  }

  if (!inboundEvent.external_message_id) {
    console.warn(
      `[processor] Cannot repair outbound for completed inbound ${params.eventId}: missing external_message_id`,
    )
    return false
  }

  const channel = await loadChannel(params.supabase, inboundEvent.channel_id as string)
  const assistant = channel.assistant
  const tenantKeys = computeTenantKeys({
    orgId: assistant.org_id,
    channelType: channel.channel_type,
    externalChatId: inboundEvent.external_chat_id as string,
    externalUserId: inboundEvent.external_user_id as string,
  })

  const { data: userMessage, error: userMessageError } = await params.supabase
    .from('assistant_messages')
    .select('id, conversation_id, created_at')
    .eq('role', 'user')
    .eq('external_message_id', inboundEvent.external_message_id as string)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (userMessageError || !userMessage?.conversation_id) {
    console.warn(
      `[processor] Cannot repair outbound for completed inbound ${params.eventId}: user message not found`,
    )
    return false
  }

  return repairCompletedInboundDeliveryFromConversation({
    ...params,
    inboundEvent: {
      id: inboundEvent.id as string,
      channel_id: inboundEvent.channel_id as string,
      external_message_id: inboundEvent.external_message_id as string,
    },
    channel,
    tenantKeys,
    conversationId: userMessage.conversation_id as string,
    userMessageCreatedAt: userMessage.created_at as string | null,
  })
}

async function repairCompletedInboundDeliveryFromConversation(params: {
  supabase: SupabaseClient
  config: Config
  encryptionService?: EncryptionService
  inboundEvent: {
    id: string
    channel_id: string
    external_message_id: string
  }
  channel: AssistantChannel
  tenantKeys: TenantKeys
  conversationId: string
  userMessageCreatedAt: string | null
}): Promise<boolean> {
  const { supabase, encryptionService, inboundEvent, channel, tenantKeys, conversationId, userMessageCreatedAt } = params
  const assistant = channel.assistant

  let assistantMessageQuery = supabase
    .from('assistant_messages')
    .select('id, content, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id, created_at')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(5)

  if (userMessageCreatedAt) {
    assistantMessageQuery = assistantMessageQuery.gte('created_at', userMessageCreatedAt)
  }

  const { data: assistantMessages, error: assistantMessagesError } = await assistantMessageQuery

  if (assistantMessagesError || !assistantMessages || assistantMessages.length === 0) {
    console.warn(
      `[processor] Cannot repair outbound for completed inbound ${inboundEvent.id}: assistant response not found`,
    )
    return false
  }

  let messageText: string | null = null
  for (const row of assistantMessages) {
    if (typeof row.content === 'string' && row.content.trim().length > 0) {
      messageText = row.content
      break
    }

    if (
      row.encryption_mode === 'APP_LAYER' &&
      row.content_encrypted &&
      encryptionService &&
      assistant.org_id
    ) {
      try {
        const aad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${row.id}`
        const decryptableRow = {
          content: row.content,
          content_encrypted: row.content_encrypted,
          content_iv: row.content_iv,
          content_auth_tag: row.content_auth_tag,
          encryption_mode: row.encryption_mode,
          key_id: row.key_id,
        }
        const decrypted = await encryptionService.decryptMessageRow(
          decryptableRow,
          assistant.org_id,
          aad,
        )
        if (decrypted.content.trim().length > 0) {
          messageText = decrypted.content
          break
        }
      } catch (error) {
        console.warn(
          `[processor] Failed to decrypt repaired outbound candidate ${row.id}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }
  }

  if (!messageText) {
    console.warn(
      `[processor] Cannot repair outbound for completed inbound ${inboundEvent.id}: assistant text unavailable`,
    )
    return false
  }

  await insertAndQueueOutboundEvent({
    supabase,
    config: params.config,
    assistantOrgId: assistant.org_id,
    channelId: inboundEvent.channel_id,
    channelType: channel.channel_type,
    inboundEventId: inboundEvent.id,
    conversationId,
    messageText: formatFinalChannelText(channel, assistant, messageText),
    replyToExternalId: inboundEvent.external_message_id,
  })

  console.warn(
    `[processor] Repaired missing outbound delivery for completed inbound ${inboundEvent.id}`,
  )
  return true
}

export async function deliverFinalResponse(params: {
  supabase: SupabaseClient
  config: Config
  assistantOrgId: string | null
  channelId: string
  channelType: string
  inboundEventId: string
  conversationId: string
  messageText: string
  replyToExternalId: string | null
  output?: Pick<ChannelOutput, 'finalize'> | null
}): Promise<void> {
  if (params.output) {
    console.log(
      `[processor] Direct channel finalize for inbound ${params.inboundEventId} on ${params.channelType}`,
    )
    await params.output.finalize(params.messageText)
    await persistSatisfiedOutboundDelivery({
      supabase: params.supabase,
      channelId: params.channelId,
      inboundEventId: params.inboundEventId,
      conversationId: params.conversationId,
      messageText: params.messageText,
      replyToExternalId: params.replyToExternalId,
    })
    return
  }

  await insertAndQueueOutboundEvent({
    supabase: params.supabase,
    config: params.config,
    assistantOrgId: params.assistantOrgId,
    channelId: params.channelId,
    channelType: params.channelType,
    inboundEventId: params.inboundEventId,
    conversationId: params.conversationId,
    messageText: params.messageText,
    replyToExternalId: params.replyToExternalId,
  })
}

export async function shouldSkipDuplicateInbound(params: {
  supabase: SupabaseClient
  event: Pick<InboundEvent, 'id' | 'channel_id' | 'external_chat_id' | 'external_message_id'>
}): Promise<boolean> {
  if (!params.event.external_message_id) {
    return false
  }

  const { data, error } = await params.supabase
    .from('assistant_inbound_events')
    .select('id, status, created_at')
    .eq('channel_id', params.event.channel_id)
    .eq('external_chat_id', params.event.external_chat_id)
    .eq('external_message_id', params.event.external_message_id)
    .neq('id', params.event.id)
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) {
    console.warn(
      `[processor] Failed to inspect competing duplicate rows for inbound ${params.event.id}: ${error.message}`,
    )
    return true
  }

  return (data?.length ?? 0) > 0
}

function formatFinalChannelText(
  channel: AssistantChannel,
  assistant: AssistantChannel['assistant'],
  text: string,
): string {
  if (channel.channel_type === 'telegram' && isHostedChannel(channel)) {
    return formatHostedTelegramFinalText(text, assistant.name)
  }
  return text
}

export async function loadRuntimeKnowledgePromptPacket(params: {
  config: Config
  orgId: string
  assistantId: string
  scopedUserId: string
  query: string
  memories: string[]
  boardMemories: string[]
  contextLadder: ReturnType<typeof buildKnowledgeContextLadder> | null
  hotPacket: ReturnType<typeof buildKnowledgeHotPacket>
  fetchImpl?: typeof fetch
}): Promise<KnowledgePromptPacket | null> {
  const fallback = () => buildKnowledgePromptPacketFromLegacyContext({
    orgId: params.orgId,
    assistantId: params.assistantId,
    scopedUserId: params.scopedUserId,
    memories: params.memories,
    boardMemories: params.boardMemories,
    contextLadder: params.contextLadder ?? buildKnowledgeContextLadder({
      orgId: params.orgId,
      assistantId: params.assistantId,
    }),
    hotPacket: params.hotPacket,
  })

  if (!params.config.WORKER_TRIGGER_SECRET) {
    return fallback()
  }

  try {
    const client = new KnowledgeOperationClient({
      controlPlaneUrl: params.config.LUCID_API_BASE_URL.replace(/\/v1.*$/, ''),
      workerTriggerSecret: params.config.WORKER_TRIGGER_SECRET,
      fetchImpl: params.fetchImpl,
    })
    const response = await client.call<KnowledgePromptPacket>({
      operation: 'knowledge.retrieve_context',
      surface: 'worker_tool',
      payload: {
        org_id: params.orgId,
        assistant_id: params.assistantId,
        scoped_user_id: params.scopedUserId,
        query: params.query.trim() || 'Latest inbound user message',
        mode: 'evidence',
        layers: [
          'assistant_memory',
          'team_brain',
          'project_brain',
          'org_brain',
          'claims',
          'rag',
          'evidence',
          'l2',
        ] satisfies KnowledgeLayer[],
        budget: {
          max_latency_ms: 900,
          max_prompt_tokens: 2600,
          max_items_per_layer: 6,
        },
      },
    })

    if (response.ok && response.result) {
      return response.result
    }
  } catch (error) {
    console.warn(
      '[processor] Brain query failed, using local legacy knowledge packet fallback:',
      error instanceof Error ? error.message : error,
    )
  }

  return fallback()
}

export async function processInboundEvent(
  event: InboundEvent,
  supabase: SupabaseClient,
  config: Config,
  encryptionService?: EncryptionService
): Promise<void> {
  // ─── Step 0: Load channel + compute canonical tenant keys ───
  // Keys MUST be computed BEFORE dedup, rate-limit, and lock (spec §5.2)
  const channel = await loadChannel(supabase, event.channel_id)
  const assistant = channel.assistant
  const inboundEnvelope = toInboundEnvelope(event, channel.channel_type, assistant.id)
  const tenantKeys: TenantKeys = computeTenantKeys({
    orgId: assistant.org_id,
    channelType: inboundEnvelope.channelType,
    externalChatId: inboundEnvelope.externalChatId || '',
    externalUserId: inboundEnvelope.externalUserId || '',
  })
  // ─── Stable runId for observability spine (Fix #7) ───
  const runId = crypto.randomUUID()

  // ─── OTel span: inbound.pipeline (P2 #18c Span 1) ───
  const otelSpan = startInboundSpan({
    tenantKey: tenantKeys.tenantKey,
    channelType: inboundEnvelope.channelType,
    conversationId: '', // set after conversation creation
    runId,
  })

  const logCtx = createLogContext(tenantKeys, {
    runId,
    inboundId: event.id,
    assistantId: assistant.id,
    channelType: inboundEnvelope.channelType,
  })
  const traceFields = getInboundMessageTraceFields(inboundEnvelope.channelType, event.id)

  // ─── Step 1: Idempotency check (BEFORE lock & heartbeat) ───
  const deduper = new InboundDeduper(supabase, config.DEDUP_TTL_HOURS)
  if (event.external_message_id) {
    const isDup = await deduper.isDuplicate(
        tenantKeys.tenantKey,
        inboundEnvelope.channelType,
        inboundEnvelope.externalChatId || '',
        inboundEnvelope.externalMessageId || '',
        event.channel_id
      )
    if (isDup) {
      const shouldSkip = await shouldSkipDuplicateInbound({
        supabase,
        event,
      })
      if (!shouldSkip) {
        console.warn(
          `[processor] Duplicate marker exists but no competing inbound rows for ${event.id}; continuing reclaimed processing`,
          logCtx,
        )
      } else {
      console.log(`[processor] ⏭ Skipping duplicate inbound ${event.id}`, logCtx)
      await finalizeInboundDone(supabase, config, event, inboundEnvelope.channelType, assistant.id)
      return
      }
    }
  }

  // Start heartbeat for long-running processing
  const heartbeat = setInterval(async () => {
    await renewLease(supabase, event.id, config.WORKER_ID, 'inbound')
  }, config.HEARTBEAT_INTERVAL)

  try {
    // PII-safe logging (no textPreview, no promptLength)
    console.log(`[processor] Processing inbound ${event.id} (attempt ${event.attempts})`, logCtx)
    console.log(`[processor] Channel loaded:`, {
      channelId: channel.id,
      channelType: channel.channel_type,
      assistantId: assistant.id,
      assistantName: assistant.name,
      model: assistant.lucid_model,
      hasEncryptedSecrets: !!channel.encrypted_secrets?.encrypted_data,
      isHosted: isHostedChannel(channel),
    })

    // ─── Step 1.5: Rate limit + Policy check (using canonical tenantKey) ───
    // Issue #2 fix: Atomic dual-bucket rate limiting (migration 065)
    // All-or-nothing: if either bucket rejects, neither is decremented.
    const rateLimiter = new TenantRateLimiter(supabase, config.DEFAULT_RATE_LIMIT_PER_MIN)

    const rateResult = await rateLimiter.tryConsumeDual(tenantKeys.tenantKey, tenantKeys.userKey)
    if (!rateResult.allowed) {
      console.warn(
        `[processor] ⛔ Rate limited (${rateResult.blockedBy}): tenantKey=${tenantKeys.tenantKey}, retryAfterMs=${rateResult.retryAfterMs}`,
        {
          ...traceFields,
          failure: classifyMessageFailure({
            stage: 'rate_limit',
            error: `Rate limited (${rateResult.blockedBy}). Retry after ${rateResult.retryAfterMs}ms`,
          }),
        },
      )
      throw new Error(`Rate limited (${rateResult.blockedBy}). Retry after ${rateResult.retryAfterMs}ms`)
    }

    const policyEngine = new PolicyEngine({
      maxLlmCalls: config.DEFAULT_MAX_LLM_CALLS,
      maxToolCalls: config.DEFAULT_MAX_TOOL_CALLS,
      maxWallTimeMs: config.DEFAULT_MAX_WALL_TIME_MS,
    })
    const policy = policyEngine.evaluate(assistant.policy_config || null)
    if (!policy.allowed) {
      console.warn(`[processor] ⛔ Policy blocked: ${policy.reason}`, {
        ...traceFields,
        failure: classifyMessageFailure({
          stage: 'policy',
          error: `Policy: ${policy.reason}`,
        }),
      })
        await markInboundStage({
          supabase,
          eventId: event.id,
          stage: 'failed',
          errorMessage: `Policy: ${policy.reason}`,
          attempts: event.attempts,
          maxAttempts: event.max_attempts,
        })
        return
    }

    // ─── Step 1.6: Plan usage limit check ───
    // Skip for internal orgs (team accounts with unlimited access)
    const internalOrgIds = (process.env.INTERNAL_ORG_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
    if (assistant.org_id && !internalOrgIds.includes(assistant.org_id)) {
      const { data: withinLimit } = await supabase.rpc('check_usage_limit', {
        p_org_id: assistant.org_id,
        p_metric_name: 'ai_queries_monthly',
      })
      if (withinLimit === false) {
        console.warn(`[processor] ⛔ AI query limit exceeded for org ${assistant.org_id}`, logCtx)
        // Don't retry — usage limit won't change without user action
      await finalizeInboundDone(supabase, config, event, inboundEnvelope.channelType, assistant.id)
        // Best-effort: notify user through channel
        await sendLimitDenial(channel, event, config)
        return
      }
    }

    // ─── Step 2: Acquire conversation lock (spec §5.2 Step 2) ───
    const conversationLock = new ConversationLock(supabase)
    const lockKey = tenantKeys.sessionKey // Lock on session (tenant + channel + chat)
    const lockAcquired = await conversationLock.acquire(lockKey, config.DEFAULT_MAX_WALL_TIME_MS)
    if (!lockAcquired) {
      console.warn(`[processor] ⏰ Could not acquire conversation lock for ${lockKey}`, logCtx)
      throw new Error('Conversation lock timeout — another worker is processing this conversation')
    }

    // Hoisted for memory extraction after lock release (Fix #5)
    let plaintextMessages: Array<{ role: string; content: string }> = []
    let conversationId: string | undefined
    let encryptionModeForMemory: EncryptionMode = 'NONE'
    let effectiveUserMessage = event.message_text || ''
    let assistantResponseForMemory: string | null = null

    try {
    // ─── Step 2a: Get or create conversation ───
    const { data: conversation, error: convError } = await supabase.rpc('get_or_create_conversation', {
      p_assistant_id: assistant.id,
      p_channel_id: event.channel_id,
      p_external_user_id: event.external_user_id,
      p_external_chat_id: event.external_chat_id,
    })

    if (convError || !conversation) {
      throw new Error(`Failed to get/create conversation: ${convError?.message}`)
    }

    // ─── Step 2.5a: Slash command intercept (before LLM pipeline) ───
    const rawUserMessage = event.message_text || ''
    if (rawUserMessage) {
      const cmdResult = await routeSlashCommand(rawUserMessage, {
        supabase,
        assistantId: assistant.id,
        assistantName: assistant.name,
        conversationId: conversation.id,
        channelId: event.channel_id,
        tenantKey: tenantKeys.tenantKey,
        model: assistant.lucid_model,
      })

      if (cmdResult.handled && cmdResult.response) {
        console.log(`[processor] 🔧 Slash command handled: ${rawUserMessage.split(' ')[0]}`, logCtx)

        // Determine encryption mode for this org
        const cmdEncMode: EncryptionMode = (encryptionService?.isAvailable() && assistant.org_id) ? 'APP_LAYER' : 'NONE'

        // Store user command with proper encryption + AAD (Fix: encryption invariant on slash commands)
        const cmdUserMsgId = crypto.randomUUID()
        const cmdUserAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${cmdUserMsgId}`
        const cmdUserCols = encryptionService && cmdEncMode === 'APP_LAYER'
          ? await encryptionService.buildMessageColumns(assistant.org_id!, rawUserMessage, cmdEncMode, cmdUserAad)
          : { content: rawUserMessage, encryption_mode: 'NONE' }

        await supabase.from('assistant_messages').insert({
          id: cmdUserMsgId,
          conversation_id: conversation.id,
          role: 'user',
          ...cmdUserCols,
          external_message_id: event.external_message_id,
        })

        // Store command response with proper encryption + AAD
        const cmdAsstMsgId = crypto.randomUUID()
        const cmdAsstAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${cmdAsstMsgId}`
        const cmdAsstCols = encryptionService && cmdEncMode === 'APP_LAYER'
          ? await encryptionService.buildMessageColumns(assistant.org_id!, cmdResult.response, cmdEncMode, cmdAsstAad)
          : { content: cmdResult.response, encryption_mode: 'NONE' }

        await supabase.from('assistant_messages').insert({
          id: cmdAsstMsgId,
          conversation_id: conversation.id,
          role: 'assistant',
          ...cmdAsstCols,
        })

        // Send response to channel
        const isStreamingCmd = supportsDirectChannelOutput(channel.channel_type)
        if (isStreamingCmd) {
          const secrets = decryptChannelSecrets(channel, config.ENCRYPTION_KEY || '')
          const hosted = isHostedChannel(channel)
          if (hosted && channel.channel_type === 'telegram' && !secrets.bot_token && config.TELEGRAM_HOSTED_BOT_TOKEN) {
            secrets.bot_token = config.TELEGRAM_HOSTED_BOT_TOKEN
          }
          if (hosted && channel.channel_type === 'discord' && !secrets.bot_token && config.DISCORD_HOSTED_BOT_TOKEN) {
            secrets.bot_token = config.DISCORD_HOSTED_BOT_TOKEN
          }
          const output = createChannelOutput(channel, event, secrets, config)
          if (output) {
            const finalResponse = formatFinalChannelText(channel, assistant, cmdResult.response)
            await output.begin()
            void output.append(finalResponse)
            await deliverFinalResponse({
              supabase,
              config,
              assistantOrgId: assistant.org_id,
              channelId: event.channel_id,
              channelType: channel.channel_type,
              inboundEventId: event.id,
              conversationId: conversation.id,
              messageText: finalResponse,
              replyToExternalId: event.external_message_id,
              output,
            })
          }
        } else {
          await deliverFinalResponse({
            supabase,
            config,
            assistantOrgId: assistant.org_id,
            channelId: event.channel_id,
            channelType: channel.channel_type,
            inboundEventId: event.id,
            conversationId: conversation.id,
            messageText: cmdResult.response,
            replyToExternalId: event.external_message_id,
          })
        }

        if (!isStreamingCmd && requiresQueuedReplyMaterialization(channel.channel_type)) {
          const repaired = await repairCompletedInboundDelivery({
            supabase,
            config,
            encryptionService,
            eventId: event.id,
            acceptedStatuses: ['processing', 'done'],
          })
          if (!repaired) {
            throw new Error(
              `Failed to materialize outbound reply before completion for inbound ${event.id}`,
            )
          }
        }

        await finalizeInboundDone(supabase, config, event, channel.channel_type, assistant.id, {
          encryptionService,
          requireQueuedReply: !isStreamingCmd,
        })
        console.log(`[processor] ✅ Inbound ${event.id} done (slash command)`, logCtx)
        plaintextMessages = []
        conversationId = conversation.id
        return
      }
    }

    // ─── Step 2.5: Update external_channel_id (only if changed — fixes write hotspot) ───
    const shouldPersistExternalChatId =
      !(channel.channel_type === 'discord' && isHostedChannel(channel)) &&
      !(channel.channel_type === 'slack' && isHostedChannel(channel))

    if (shouldPersistExternalChatId && channel.external_channel_id !== event.external_chat_id) {
      await supabase
        .from('assistant_channels')
        .update({ external_channel_id: event.external_chat_id })
        .eq('id', event.channel_id)
    }

    // ─── Step 3: Store user message FIRST (before LLM call - transcript consistency) ───
    // Fix #2: Generate messageId BEFORE encrypt so AAD includes it
    effectiveUserMessage = rawUserMessage
    let inboundImages: Array<{ data: string; mimeType: string }> = []
    const mediaProviderConfig = getWorkerMediaProviderConfig(config)
    if (channel.channel_type === 'telegram') {
      const telegramSecrets = decryptChannelSecrets(channel, config.ENCRYPTION_KEY || '')
      if (isHostedChannel(channel) && !telegramSecrets.bot_token && config.TELEGRAM_HOSTED_BOT_TOKEN) {
        telegramSecrets.bot_token = config.TELEGRAM_HOSTED_BOT_TOKEN
      }
      const augmented = await resolveTelegramInboundAugmentation({
        messageText: rawUserMessage,
        messageData: event.message_data,
        botToken: telegramSecrets.bot_token,
        llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
        llmApiKey: mediaProviderConfig.preferredGatewayApiKey || '',
        llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
        llmApiKeys: mediaProviderConfig.gatewayApiKeys,
      })
      effectiveUserMessage = augmented.effectiveText
      inboundImages = augmented.images
    } else if (channel.channel_type === 'slack') {
      const slackSecrets = decryptChannelSecrets(channel, config.ENCRYPTION_KEY || '')
      const augmented = await resolveSlackInboundAugmentation({
        messageText: rawUserMessage,
        messageData: event.message_data,
        botToken: slackSecrets.bot_token,
        llmBaseUrl: config.LUCID_API_BASE_URL,
        llmApiKey: config.LUCID_API_KEY || '',
      })
      effectiveUserMessage = augmented.effectiveText
      inboundImages = augmented.images
    } else if (channel.channel_type === 'discord') {
      const augmented = await resolveDiscordInboundAugmentation({
        messageText: rawUserMessage,
        messageData: event.message_data,
        llmBaseUrl: mediaProviderConfig.preferredGatewayBaseUrl,
        llmApiKey: mediaProviderConfig.preferredGatewayApiKey || '',
        llmBaseUrls: mediaProviderConfig.gatewayBaseUrls,
        llmApiKeys: mediaProviderConfig.gatewayApiKeys,
      })
      effectiveUserMessage = augmented.effectiveText
      inboundImages = augmented.images
    }

    const userContent = effectiveUserMessage
    // Skip encryption for web channels — messages stay internal and the Next.js app
    // doesn't have ENCRYPTION_KEY to decrypt them for the test chat UI.
    const encryptionMode: EncryptionMode =
      channel.channel_type === 'web'
        ? 'NONE'
        : (encryptionService?.isAvailable() && assistant.org_id) ? 'APP_LAYER' : 'NONE'
    const userMessageId = crypto.randomUUID()
    const userAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${userMessageId}`

    const userMsgColumns = encryptionService && encryptionMode === 'APP_LAYER'
      ? await encryptionService.buildMessageColumns(assistant.org_id!, userContent, encryptionMode, userAad)
      : { content: userContent, encryption_mode: 'NONE' }

    const userMessageCreatedAt = new Date().toISOString()
    const { error: userMsgError } = await supabase.from('assistant_messages').insert({
      id: userMessageId,
      conversation_id: conversation.id,
      role: getInboundStoredMessageRole(event),
      ...userMsgColumns,
      external_message_id: event.external_message_id,
      created_at: userMessageCreatedAt,
    })
    if (userMsgError) {
      console.error(`[processor] ❌ Failed to insert user message:`, userMsgError.message, userMsgError.details, userMsgError.hint)
    }

    if (isNonReplyingSystemEvent(event)) {
      await finalizeInboundDone(supabase, config, event, channel.channel_type, assistant.id, {
        encryptionService,
        requireQueuedReply: false,
      })
      console.log(`[processor] ✅ Inbound ${event.id} done (system event)`, logCtx)
      plaintextMessages = []
      conversationId = conversation.id
      return
    }

    const shouldBeginOutputEarly =
      (config.FEATURE_AGENT_RUNTIME &&
        (supportsDirectChannelOutput(channel.channel_type) || channel.channel_type === 'web')) ||
      (!config.FEATURE_AGENT_RUNTIME && supportsDirectChannelOutput(channel.channel_type))
    const earlyOutput = shouldBeginOutputEarly
      ? await createAndBeginChannelOutput(supabase, config, channel, event, conversation.id) ?? undefined
      : undefined
    const earlyProgress = createChannelProgressController({
      runId,
      channelType: channel.channel_type,
      output: earlyOutput,
      onEvent: (progressEvent) => {
        if (progressEvent.phase === 'failed') {
          console.warn('[processor] Channel progress failed', {
            runId,
            channelType: channel.channel_type,
            label: progressEvent.label,
          })
        }
      },
    })
    if (earlyOutput) {
      earlyProgress.emitPhase('thinking', 'Preparing agent', { source: 'system' })
    }

    // ─── Step 4: Load context (recent messages) — Fix #4: decrypt encrypted rows ───
    const useConversationSummary = config.FEATURE_CONVERSATION_SUMMARY
    const historyLimit = useConversationSummary ? 50 : assistant.memory_window_size
    const { data: recentMessages } = await supabase
      .from('assistant_messages')
      .select('id, role, content, content_encrypted, content_iv, content_auth_tag, encryption_mode, key_id')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: false })
      .limit(historyLimit)

    const rawMessages = (recentMessages || []).reverse()
    const threadParentMessages =
      channel.channel_type === 'slack'
        ? await loadSlackParentContextMessages({
            supabase,
            event,
            conversationId: conversation.id,
            assistant,
            tenantKeys,
            encryptionService,
            fallbackLimit: historyLimit,
          })
        : channel.channel_type === 'discord'
          ? await loadDiscordParentContextMessages({
              supabase,
              event,
              conversationId: conversation.id,
              assistant,
              tenantKeys,
              encryptionService,
              fallbackLimit: historyLimit,
            })
        : []
    const currentConversationMessages = await decryptAssistantMessageRows({
      rows: rawMessages,
      encryptionService,
      assistantOrgId: assistant.org_id,
      tenantKeys,
    })
    const allDecryptedMessages = [...threadParentMessages, ...currentConversationMessages]

    // Phase 2: Run conversation compaction if feature is enabled
    let messages = allDecryptedMessages
    let conversationSummary: string | undefined
    if (useConversationSummary) {
      const compactor = new ConversationCompactor(supabase, config)
      const { summary, recentMessages: recent } = await compactor.getSummaryAndRecent(
        conversation.id,
        allDecryptedMessages,
        { assistantId: assistant.id, orgId: assistant.org_id || '' },
      )
      conversationSummary = summary
      messages = recent
    }

    // ─── Step 5: Load memory. Recent recall remains the fallback; semantic recall is flag-gated. ───
    let memories: string[] = []
    if (assistant.memory_enabled && effectiveUserMessage) {
      earlyProgress.emitPhase('memory', 'Reading relevant memory', {
        capability: 'knowledge.recall',
        source: 'memory',
        riskLevel: 'read',
      })
      if (!event.external_user_id) {
        console.warn('[processor] external actor key missing; skipping memory lookup')
      } else {
        const recall = await retrieveAssistantMemoryRecall({
          supabase,
          assistantId: assistant.id,
          assistantOrgId: assistant.org_id,
          scopedUserId: tenantKeys.userKey,
          tenantKey: tenantKeys.tenantKey,
          query: effectiveUserMessage,
          channelType: channel.channel_type,
          conversationId: conversation.id,
          lucidApiUrl: config.LUCID_API_BASE_URL,
          encryptionService,
          semanticEnabled: config.LUCID_KNOWLEDGE_SEMANTIC_RECALL_ENABLED,
          recentLimit: 10,
          semanticLimit: 8,
          finalLimit: 10,
          timeoutMs: 180,
        })
        memories = recall.memories
        if (recall.telemetry.semanticEnabled || recall.telemetry.errors.length > 0) {
          console.log('[processor] Memory recall telemetry', {
            runId,
            semanticEnabled: recall.telemetry.semanticEnabled,
            semanticAttempted: recall.telemetry.semanticAttempted,
            fallbackUsed: recall.telemetry.fallbackUsed,
            timedOut: recall.telemetry.timedOut,
            recentCount: recall.telemetry.recentCount,
            semanticCount: recall.telemetry.semanticCount,
            finalCount: recall.telemetry.finalCount,
            durationMs: recall.telemetry.durationMs,
            tokenCost: recall.telemetry.tokenCost,
            errors: recall.telemetry.errors,
          })
        }
      }
    }

    // ─── Step 5.25 + 5.5: Load board memories + crew context in parallel ───
    const boardMemoriesPromise = assistant.org_id
      ? loadBoardMemories(supabase, assistant.org_id)
      : Promise.resolve([] as string[])

    const crewContextPromise = getActiveCrewContext(supabase, assistant.id)
      .then(ctx => {
        if (ctx) console.log(`[processor] Crew context loaded: crew=${ctx.crewName}, role=${ctx.myRole}, coordinator=${ctx.isCoordinator}`)
        return ctx
      })
      .catch((crewErr) => {
        // Non-fatal — continue without crew context
        console.warn('[processor] Failed to load crew context:', crewErr instanceof Error ? crewErr.message : crewErr)
        return null as CrewContext | null
      })

    const [boardMemories, crewContext] = await Promise.all([boardMemoriesPromise, crewContextPromise])
    const knowledgeContextLadder = assistant.org_id
      ? buildKnowledgeContextLadder({
          orgId: assistant.org_id,
          assistantId: assistant.id,
          channelType: channel.channel_type,
          channelId: event.channel_id,
          conversationId: conversation.id,
        })
      : null
    const knowledgeHotPacket = buildKnowledgeHotPacket({
      sourceEventId: event.id,
      latestMessage: effectiveUserMessage,
    })
    const knowledgePromptPacket = config.LUCID_KNOWLEDGE_PROMPT_PACKETS_ENABLED && assistant.org_id
      ? await loadRuntimeKnowledgePromptPacket({
          config,
          orgId: assistant.org_id,
          assistantId: assistant.id,
          scopedUserId: tenantKeys.userKey,
          query: effectiveUserMessage,
          memories,
          boardMemories,
          contextLadder: knowledgeContextLadder,
          hotPacket: knowledgeHotPacket,
        })
      : null
    const runUserMessage = applyAudioLanguageGuardrail({
      userMessage: effectiveUserMessage,
      recentMessages: messages,
      messageData: event.message_data,
    })

    // ─── Step 6: Determine delivery path ───
    if (config.FEATURE_AGENT_RUNTIME) {
      // Agent runtime pipeline (Think → Act → Observe)
      console.log('[processor] 🤖 FEATURE_AGENT_RUNTIME enabled — running agent pipeline', logCtx)

      const agentStartTime = Date.now()

      // Create channel output for streaming channels
      const output =
        earlyOutput ??
        await createAndBeginChannelOutput(supabase, config, channel, event, conversation.id) ??
        undefined
      const progress = output === earlyOutput
        ? earlyProgress
        : createChannelProgressController({
            runId,
            channelType: channel.channel_type,
            output,
          })
      if (!earlyOutput && output) {
        progress.emitPhase('thinking', 'Preparing agent', { source: 'system' })
      }
      console.log(
        `[processor] Output selection for inbound ${event.id}: ${output ? 'direct-output' : 'none'} (${channel.channel_type})`,
      )

      // Load activated plugins for this assistant
      let plugins: ActivatedPlugin[] = []
      try {
        progress.emitPhase('thinking', 'Loading tools', { source: 'system' })
        const { data: pluginRows } = await withDbSpan('get_assistant_active_plugins', () =>
          supabase.rpc('get_assistant_active_plugins', {
            p_assistant_id: assistant.id,
          })
        )
        plugins = (pluginRows || []).map((row: Record<string, unknown>) => mapRpcRowToActivatedPlugin(row))
        if (plugins.length > 0) {
          const totalTools = plugins.reduce((sum, p) => sum + p.tools.length, 0)
          console.log(`[processor] Loaded ${plugins.length} plugin(s) with ${totalTools} tool(s) for assistant ${assistant.id}`)
        }
      } catch (pluginErr) {
        // Non-fatal — continue without plugins
        console.warn('[processor] Failed to load plugins:', pluginErr instanceof Error ? pluginErr.message : pluginErr)
      }

      // Inject wallet addresses into system prompt if wallet is enabled
      let systemPrompt = assistant.system_prompt
      if (assistant.wallet_enabled && assistant.agent_wallets?.length) {
        const activeWallets = assistant.agent_wallets.filter(w => w.status === 'active')
        if (activeWallets.length > 0) {
          const evmWallet = activeWallets.find(w => w.chain_type === 'ethereum')
          const solWallet = activeWallets.find(w => w.chain_type === 'solana')
          const walletLines = ['\n\n## Your Wallets']
          if (evmWallet) walletLines.push(`- EVM (Ethereum/Base/Arbitrum): ${evmWallet.address}`)
          if (solWallet) walletLines.push(`- Solana: ${solWallet.address}`)
          walletLines.push('Use these addresses when executing trades or checking balances.')
          walletLines.push('Never ask the user for a wallet address -- use your own.')
          systemPrompt = (systemPrompt || '') + walletLines.join('\n')
        }
      }

      // Built-in tool registration is handled inside OpenClawAgent.ts
      // via CommandsAllowlist — single source of truth.
      let finalResponseForNonStreamingDelivery: string | null = null

      try {
        progress.emitPhase('thinking', 'Thinking', { source: 'runtime' })
        const result = await defaultWorkerRunExecutor.execute({
          assistant: {
            id: assistant.id,
            name: assistant.name,
            engine: assistant.engine ?? 'openclaw',
            system_prompt: systemPrompt,
            soul_content: ((assistant as Record<string, unknown>).soul_content as string | null) ?? null,
            lucid_model: assistant.lucid_model,
            temperature: assistant.temperature,
            max_tokens: assistant.max_tokens,
            memory_enabled: assistant.memory_enabled,
            memory_window_size: assistant.memory_window_size,
            org_id: assistant.org_id,
            passport_id: assistant.passport_id ?? null,
            policy_config: assistant.policy_config,
            wallet_enabled: assistant.wallet_enabled ?? false,
            agent_wallets: assistant.agent_wallets || [],
          },
          conversationId: conversation.id,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          memories,
          knowledgePromptPacket,
          userMessage: runUserMessage,
          budget: policy.budget,
          runId,
          output,
          plugins,
          supabase,
          userId: assistant.id, // For agent wallets, assistant owns the wallet
          summary: conversationSummary,
          crewContext,
          boardMemories,
          llmConfig: getWorkerLlmConfig(config),
          channelId: event.channel_id,
          images: inboundImages,
          onProgress: progress.emit,
        })
        progress.emitPhase('writing', 'Writing final answer', { source: 'runtime' })

        // Handle empty or error responses — replace with friendly message
        const responseText = !result.text
          ? "I wasn't able to generate a response. Please try again."
          : result.text
        assistantResponseForMemory = responseText

        // Emit notifications for provider errors and empty responses
        if ((result.providerError || !result.text) && assistant.org_id) {
          void emitNotification(supabase, {
            orgId: assistant.org_id,
            ...(!result.text
              ? ALERTS.runEmpty(assistant.name)
              : ALERTS.llmError(assistant.name, 'Provider returned an error')),
          })
        }

        // Store assistant response — Fix #2: AAD with pre-generated ID
        const assistantMessageId = crypto.randomUUID()
        const assistantAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${assistantMessageId}`

        const assistantMsgColumns = encryptionService && encryptionMode === 'APP_LAYER'
          ? await encryptionService.buildMessageColumns(assistant.org_id!, responseText, encryptionMode, assistantAad)
          : { content: responseText, encryption_mode: 'NONE' }

        const { error: asstMsgError } = await supabase.from('assistant_messages').insert({
          id: assistantMessageId,
          conversation_id: conversation.id,
          role: 'assistant',
          ...assistantMsgColumns,
          tokens_prompt: result.usage.promptTokens,
          tokens_completion: result.usage.completionTokens,
        })
        if (asstMsgError) {
          console.error(`[processor] ❌ Failed to insert assistant message:`, asstMsgError.message, asstMsgError.details, asstMsgError.hint)
        }

        const finalResponseText = formatFinalChannelText(channel, assistant, responseText)

        await deliverFinalResponse({
          supabase,
          config,
          assistantOrgId: assistant.org_id,
          channelId: event.channel_id,
          channelType: channel.channel_type,
          inboundEventId: event.id,
          conversationId: conversation.id,
          messageText: finalResponseText,
          replyToExternalId: event.external_message_id,
          output,
        })
        finalResponseForNonStreamingDelivery = finalResponseText

        console.log(`[processor] 🦀 Agent run: ${result.steps} steps, ${result.toolCallsUsed} tool calls, budget_exhausted=${result.budgetExhausted}, providerError=${result.providerError}`)
        progress.complete()

        // ─── Billing: Track usage for agent pipeline (Fix #5: runId for audit spine) ───
        const agentWallTime = Date.now() - agentStartTime
        void trackUsage(supabase, {
          runId,
          tenantKey: tenantKeys.tenantKey,
          orgId: assistant.org_id,
          assistantId: assistant.id,
          conversationId: conversation.id,
          model: assistant.lucid_model,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.promptTokens + result.usage.completionTokens,
          llmCalls: result.steps,
          toolCalls: result.toolCallsUsed,
          wallTimeMs: agentWallTime,
          isAgentLoop: true,
        })

      } catch (error) {
        progress.fail(error)
        captureError(
          error instanceof Error ? error : new Error('Unknown agent error'),
          { runId, tenantKeys, operation: 'agent-loop', assistantId: assistant.id, conversationId: conversation.id }
        )

        // Send a friendly error to the channel instead of raw error dump
        const friendlyError = "I encountered an issue processing your request. Please try again."
        assistantResponseForMemory = friendlyError
        const errorMessageId = crypto.randomUUID()
        const errorAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${errorMessageId}`
        const errorMsgColumns = encryptionService && encryptionMode === 'APP_LAYER'
          ? await encryptionService.buildMessageColumns(assistant.org_id!, friendlyError, encryptionMode, errorAad)
          : { content: friendlyError, encryption_mode: 'NONE' }

        const { error: assistantErrorInsert } = await supabase.from('assistant_messages').insert({
          id: errorMessageId,
          conversation_id: conversation.id,
          role: 'assistant',
          ...errorMsgColumns,
        })
        if (assistantErrorInsert) {
          console.error(
            `[processor] ❌ Failed to insert fallback assistant message:`,
            assistantErrorInsert.message,
            assistantErrorInsert.details,
            assistantErrorInsert.hint,
          )
        }

        try {
          if (output) {
            await output.append(friendlyError)
          }
          await deliverFinalResponse({
            supabase,
            config,
            assistantOrgId: assistant.org_id,
            channelId: event.channel_id,
            channelType: channel.channel_type,
            inboundEventId: event.id,
            conversationId: conversation.id,
            messageText: formatFinalChannelText(channel, assistant, friendlyError),
            replyToExternalId: event.external_message_id,
            output,
          })
          finalResponseForNonStreamingDelivery = formatFinalChannelText(channel, assistant, friendlyError)
        } catch {
          if (output) {
            await output.error(new Error(friendlyError)).catch(() => {})
          }
          throw error
        }

        // Emit user-facing notification for critical errors
        if (assistant.org_id) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error'
          const alert = isCreditError(errMsg)
            ? ALERTS.creditExhausted(assistant.name, assistant.lucid_model, errMsg)
            : ALERTS.llmError(assistant.name, errMsg)
          void emitNotification(supabase, { orgId: assistant.org_id, ...alert })
        }
      }

      if (!output) {
        await ensureInboundReplyMaterialized({
          supabase,
          config,
          encryptionService,
          assistantOrgId: assistant.org_id,
          channel,
          tenantKeys,
          inboundEventId: event.id,
          channelId: event.channel_id,
          conversationId: conversation.id,
          replyToExternalId: event.external_message_id,
          preferredMessageText: finalResponseForNonStreamingDelivery,
          userMessageCreatedAt,
        })
      }

      if (!output && requiresQueuedReplyMaterialization(channel.channel_type)) {
        const repaired = await repairCompletedInboundDelivery({
          supabase,
          config,
          encryptionService,
          eventId: event.id,
          acceptedStatuses: ['processing', 'done'],
        })
        if (!repaired) {
          throw new Error(
            `Failed to materialize outbound reply before completion for inbound ${event.id}`,
          )
        }
      }

      // Mark done and return (skip legacy path)
    await finalizeInboundDone(supabase, config, event, inboundEnvelope.channelType, assistant.id, {
      encryptionService,
      requireQueuedReply: !output,
    })
    otelSpan.setAttribute('lucid.conversation_id', conversation.id)
    console.log(`[processor] ✅ Inbound ${event.id} done (agent pipeline)`, logCtx)

    // Capture for memory extraction before return (agent path)
      plaintextMessages = messages
      conversationId = conversation.id
      encryptionModeForMemory = encryptionMode
      return
    }

    const isStreamingChannel = supportsDirectChannelOutput(channel.channel_type)
    console.log(`[processor] Delivery path: ${isStreamingChannel ? 'STREAMING' : 'NON-STREAMING'} (${channel.channel_type})`)

    if (isStreamingChannel) {
      await processWithStreaming(
        config,
        supabase,
        event,
        channel,
        assistant,
        conversation,
        messages,
        memories,
        runUserMessage,
        tenantKeys,
        runId,
        encryptionService,
        encryptionMode,
        earlyOutput,
      )
    } else {
      await processWithoutStreaming(
        config,
        supabase,
        event,
        channel,
        assistant,
        conversation,
        messages,
        memories,
        runUserMessage,
        tenantKeys,
        runId,
        encryptionService,
        encryptionMode,
      )

      await ensureInboundReplyMaterialized({
        supabase,
        config,
        encryptionService,
        assistantOrgId: assistant.org_id,
        channel,
        tenantKeys,
        inboundEventId: event.id,
        channelId: event.channel_id,
        conversationId: conversation.id,
        replyToExternalId: event.external_message_id,
        userMessageCreatedAt,
      })

      if (requiresQueuedReplyMaterialization(channel.channel_type)) {
        const repaired = await repairCompletedInboundDelivery({
          supabase,
          config,
          encryptionService,
          eventId: event.id,
          acceptedStatuses: ['processing', 'done'],
        })
        if (!repaired) {
          throw new Error(
            `Failed to materialize outbound reply before completion for inbound ${event.id}`,
          )
        }
      }
    }

    // ─── Step 8: Mark inbound as done ───
    await finalizeInboundDone(supabase, config, event, inboundEnvelope.channelType, assistant.id, {
      encryptionService,
      requireQueuedReply: !isStreamingChannel,
    })
    console.log(`[processor] ✅ Inbound ${event.id} done`)

    // Capture for memory extraction (must be inside try so variables are available)
    plaintextMessages = messages
    conversationId = conversation.id
    encryptionModeForMemory = encryptionMode

    } finally {
      // Release conversation lock (spec §5.2 Step 8)
      await conversationLock.release(lockKey)

      // ─── Fix #5: Memory extraction — fire-and-forget AFTER lock release ───
      // Rules: fail open, 1 LLM call max, never block inbound
      if (assistant.memory_enabled && effectiveUserMessage && plaintextMessages.length > 0 && conversationId) {
        if (config.LUCID_KNOWLEDGE_DURABLE_EXTRACTION_ENABLED) {
          void enqueueMemoryExtractionJob(supabase, {
            assistantId: assistant.id,
            assistantOrgId: assistant.org_id,
            conversationId,
            inboundEventId: event.id,
            channelType: channel.channel_type,
            channelId: event.channel_id,
            externalMessageId: event.external_message_id,
            conversationMessageCount: plaintextMessages.length,
            encryptionMode: encryptionModeForMemory,
            runId,
          }).then((status) => {
            if (status === 'enqueued') {
              console.log(`[processor] Memory extraction job enqueued (runId=${runId})`)
            } else if (status === 'unavailable') {
              console.warn(`[processor] Durable memory extraction unavailable (runId=${runId}); extraction skipped to preserve latency`)
            }
          }).catch(err => {
            console.warn(`[processor] Memory extraction enqueue failed (non-blocking, runId=${runId}); falling back inline:`, err)
            void extractAndStoreMemories({
              supabase,
              assistant: {
                id: assistant.id,
                name: assistant.name,
                memory_enabled: assistant.memory_enabled,
                memory_strategy: assistant.memory_strategy ?? undefined,
                org_id: assistant.org_id,
              },
              tenantKeys,
              encryptionService,
              encryptionMode: encryptionModeForMemory,
              recentMessages: plaintextMessages.slice(-10),
              conversationMessageCount: plaintextMessages.length,
              runId,
              provenance: {
                sourceUserMessage: effectiveUserMessage,
                sourceAssistantResponse: assistantResponseForMemory,
                sourceOrgId: assistant.org_id,
                sourceRunId: runId,
                sourceChannelType: channel.channel_type,
                sourceChannelId: event.channel_id,
                sourceConversationId: conversationId,
                sourceInboundEventId: event.id,
                sourceExternalMessageId: event.external_message_id,
                sourceEvidenceHandle: `inbound:${event.id}`,
              },
              lucidApiUrl: config.LUCID_API_BASE_URL,
            }).catch(fallbackErr => {
              console.warn(`[processor] Memory extraction fallback failed (non-blocking, runId=${runId}):`, fallbackErr)
            })
          })
        } else {
          void extractAndStoreMemories({
            supabase,
            assistant: {
              id: assistant.id,
              name: assistant.name,
              memory_enabled: assistant.memory_enabled,
              memory_strategy: assistant.memory_strategy ?? undefined,
              org_id: assistant.org_id,
            },
            tenantKeys,
            encryptionService,
            encryptionMode: encryptionModeForMemory,
            recentMessages: plaintextMessages.slice(-10),
            conversationMessageCount: plaintextMessages.length,
            runId,
            provenance: {
              sourceUserMessage: effectiveUserMessage,
              sourceAssistantResponse: assistantResponseForMemory,
              sourceOrgId: assistant.org_id,
              sourceRunId: runId,
              sourceChannelType: channel.channel_type,
              sourceChannelId: event.channel_id,
              sourceConversationId: conversationId,
              sourceInboundEventId: event.id,
              sourceExternalMessageId: event.external_message_id,
              sourceEvidenceHandle: `inbound:${event.id}`,
            },
            lucidApiUrl: config.LUCID_API_BASE_URL,
          }).catch(err => {
            console.warn(`[processor] Memory extraction failed (non-blocking, runId=${runId}):`, err)
          })
        }
      }
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const failure = classifyMessageFailure({
      stage: 'runtime',
      error: errorMessage,
    })
    console.error(`[processor] ❌ Inbound ${event.id} failed:`, errorMessage, {
      ...traceFields,
      failure,
    })
    const safeErr = sanitizeErrorForTelemetry(error)
    otelSpan.setStatus({ code: SpanStatusCode.ERROR, message: safeErr.message })
    otelSpan.recordException(safeErr)

    // Remove dedup entry so retries are not blocked (dedup prevents duplicate
    // webhook deliveries, not retries of failed events)
    if (event.external_message_id) {
      await deduper.remove(
        tenantKeys.tenantKey,
        inboundEnvelope.channelType,
        inboundEnvelope.externalChatId || '',
        inboundEnvelope.externalMessageId || '',
      )
    }

    await markInboundStage({
      supabase,
      eventId: event.id,
      stage: 'failed',
      errorMessage: `${failure.kind}: ${failure.message}`,
      attempts: event.attempts,
      maxAttempts: event.max_attempts,
    })

  } finally {
    clearInterval(heartbeat)
    otelSpan.setStatus({ code: otelSpan.isRecording() ? SpanStatusCode.OK : SpanStatusCode.ERROR })
    otelSpan.end()
  }
}

// ---------------------------------------------------------------------------
// STREAMING PATH — Direct delivery via ChannelOutput
// ---------------------------------------------------------------------------

async function processWithStreaming(
  config: Config,
  supabase: SupabaseClient,
  event: InboundEvent,
  channel: AssistantChannel,
  assistant: AssistantChannel['assistant'],
  conversation: { id: string },
  messages: Array<{ role: string; content: string }>,
  memories: string[],
  effectiveUserMessage: string,
  tenantKeys: TenantKeys,
  runId?: string,
  encryptionService?: EncryptionService,
  encryptionMode: EncryptionMode = 'NONE',
  prestartedOutput?: ChannelOutput,
): Promise<void> {
  const legacyStartTime = Date.now()
  const output =
    prestartedOutput ?? await createAndBeginChannelOutput(supabase, config, channel, event, conversation.id)
  if (!output) {
    throw new Error(`Cannot create output for channel type: ${channel.channel_type}`)
  }

  try {
    const apiMessages = buildLLMMessages(assistant, messages, memories, effectiveUserMessage)
    const response = await streamLucidL2(config, assistant, apiMessages, output)

    // Bonus fix: encrypt assistant response in legacy streaming path via buildMessageColumns
    const legacyAssistantId = crypto.randomUUID()
    const legacyAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${legacyAssistantId}`
    const legacyMsgColumns = encryptionService && encryptionMode === 'APP_LAYER'
      ? await encryptionService.buildMessageColumns(assistant.org_id!, response.text, encryptionMode, legacyAad)
      : { content: response.text, encryption_mode: 'NONE' }

    await supabase.from('assistant_messages').insert({
      id: legacyAssistantId,
      conversation_id: conversation.id,
      role: 'assistant',
      ...legacyMsgColumns,
      tokens_prompt: response.usage?.promptTokens,
      tokens_completion: response.usage?.completionTokens,
    })

    await output.finalize(formatFinalChannelText(channel, assistant, response.text))

    // ─── Billing: Track usage for legacy streaming path (Fix #5: runId) ───
    const legacyWallTime = Date.now() - legacyStartTime
    void trackUsage(supabase, {
      runId,
      tenantKey: tenantKeys.tenantKey,
      orgId: assistant.org_id,
      assistantId: assistant.id,
      conversationId: conversation.id,
      model: assistant.lucid_model,
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      totalTokens: (response.usage?.promptTokens ?? 0) + (response.usage?.completionTokens ?? 0),
      llmCalls: 1,
      toolCalls: 0,
      wallTimeMs: legacyWallTime,
      isAgentLoop: false,
    })

  } catch (error) {
    await output.error(error instanceof Error ? error : new Error('Unknown error'))
    captureError(
      error instanceof Error ? error : new Error('Unknown streaming error'),
      { runId, tenantKeys, operation: 'legacy-streaming', assistantId: assistant.id, conversationId: conversation.id }
    )
    throw error
  }
}

// ---------------------------------------------------------------------------
// NON-STREAMING PATH — Queue-based delivery via outbound events
// ---------------------------------------------------------------------------

async function processWithoutStreaming(
  config: Config,
  supabase: SupabaseClient,
  event: InboundEvent,
  channel: AssistantChannel,
  assistant: AssistantChannel['assistant'],
  conversation: { id: string },
  messages: Array<{ role: string; content: string }>,
  memories: string[],
  effectiveUserMessage: string,
  tenantKeys: TenantKeys,
  runId?: string,
  encryptionService?: EncryptionService,
  encryptionMode: EncryptionMode = 'NONE'
): Promise<void> {
  const legacyStartTime = Date.now()
  const response = await callLucidL2(
    config, assistant, messages, memories, effectiveUserMessage
  )

  // Bonus fix: encrypt assistant response in legacy non-streaming path via buildMessageColumns
  const nsAssistantId = crypto.randomUUID()
  const nsAad = `${tenantKeys.tenantKey}:${tenantKeys.sessionKey}:${nsAssistantId}`
  const nsMsgColumns = encryptionService && encryptionMode === 'APP_LAYER'
    ? await encryptionService.buildMessageColumns(assistant.org_id!, response.text, encryptionMode, nsAad)
    : { content: response.text, encryption_mode: 'NONE' }

  await supabase.from('assistant_messages').insert({
    id: nsAssistantId,
    conversation_id: conversation.id,
    role: 'assistant',
    ...nsMsgColumns,
    tokens_prompt: response.usage?.prompt_tokens,
    tokens_completion: response.usage?.completion_tokens,
  })

  await insertAndQueueOutboundEvent({
    supabase,
    config,
    assistantOrgId: assistant.org_id,
    channelId: event.channel_id,
    channelType: channel.channel_type,
    inboundEventId: event.id,
    conversationId: conversation.id,
    messageText: response.text,
    replyToExternalId: event.external_message_id,
  })

  // ─── Billing: Track usage for legacy non-streaming path (Fix #5: runId) ───
  const legacyWallTime = Date.now() - legacyStartTime
  void trackUsage(supabase, {
    runId,
    tenantKey: tenantKeys.tenantKey,
    orgId: assistant.org_id,
    assistantId: assistant.id,
    conversationId: conversation.id,
    model: assistant.lucid_model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
    llmCalls: 1,
    toolCalls: 0,
    wallTimeMs: legacyWallTime,
    isAgentLoop: false,
  })
}

// ---------------------------------------------------------------------------
// Entitlement denial — best-effort notification through channel
// ---------------------------------------------------------------------------

async function sendLimitDenial(
  channel: AssistantChannel,
  event: InboundEvent,
  config: Config
): Promise<void> {
  const denialMessage = '⚠️ Your AI query limit has been reached for this billing period. Please upgrade your plan to continue chatting.'

  try {
    const isMessaging = supportsDirectChannelOutput(channel.channel_type)
    if (!isMessaging) return // Web channels handle this in the Next.js API layer

    const secrets = decryptChannelSecrets(channel, config.ENCRYPTION_KEY || '')
    const hosted = isHostedChannel(channel)
    if (hosted && channel.channel_type === 'telegram' && !secrets.bot_token && config.TELEGRAM_HOSTED_BOT_TOKEN) {
      secrets.bot_token = config.TELEGRAM_HOSTED_BOT_TOKEN
    }
    if (hosted && channel.channel_type === 'discord' && !secrets.bot_token && config.DISCORD_HOSTED_BOT_TOKEN) {
      secrets.bot_token = config.DISCORD_HOSTED_BOT_TOKEN
    }

    const output = createChannelOutput(channel, event, secrets, config)
    if (!output) return

    await output.begin()
    await output.finalize(denialMessage)
  } catch (err) {
    console.warn('[processor] Failed to send limit denial to channel:', err instanceof Error ? err.message : err)
  }
}

async function createAndBeginChannelOutput(
  supabase: SupabaseClient,
  config: Config,
  channel: AssistantChannel,
  event: InboundEvent,
  conversationId: string,
): Promise<ChannelOutput | null> {
  if (channel.channel_type === 'web') {
    const output = new WebChannelOutput(conversationId, supabase)
    await output.begin()
    return output
  }

  if (!supportsDirectChannelOutput(channel.channel_type)) {
    return null
  }

  const secrets = decryptChannelSecrets(channel, config.ENCRYPTION_KEY || '')
  const hosted = isHostedChannel(channel)
  if (hosted && channel.channel_type === 'telegram' && !secrets.bot_token) {
    console.log(`[processor] Hosted Telegram channel ${redact(channel.id)} detected; using hosted bot token from config`)
    if (config.TELEGRAM_HOSTED_BOT_TOKEN) {
      secrets.bot_token = config.TELEGRAM_HOSTED_BOT_TOKEN
    } else {
      console.error('[processor] Hosted Telegram auth is not configured on the worker')
      throw new Error('Hosted Telegram auth is not configured on the worker')
    }
  }
  if (hosted && channel.channel_type === 'discord' && !secrets.bot_token) {
    if (config.DISCORD_HOSTED_BOT_TOKEN) {
      secrets.bot_token = config.DISCORD_HOSTED_BOT_TOKEN
    } else {
      throw new Error('DISCORD_HOSTED_BOT_TOKEN is not configured on the worker')
    }
  }

  console.log(`[processor] Creating ChannelOutput:`, {
    channelType: channel.channel_type,
    chatId: event.external_chat_id,
    hasBotToken: !!secrets.bot_token,
    botTokenPrefix: secrets.bot_token ? secrets.bot_token.slice(0, 10) + '...' : 'EMPTY',
    isHosted: hosted,
  })

  const output = createChannelOutput(channel, event, secrets, config)
  if (!output) {
    return null
  }

  console.log(`[processor] Calling output.begin()...`)
  await output.begin()
  console.log(`[processor] output.begin() complete`)
  return output
}

// ---------------------------------------------------------------------------
// Hosted channel detection
// ---------------------------------------------------------------------------

function isHostedChannel(channel: AssistantChannel): boolean {
  return !channel.encrypted_secrets?.encrypted_data
}

// ---------------------------------------------------------------------------
// Channel loading
// ---------------------------------------------------------------------------

async function loadChannel(supabase: SupabaseClient, channelId: string): Promise<AssistantChannel> {
  // Read channel bindings fresh so room-level Telegram settings from the mini
  // app apply on the very next inbound instead of waiting for cache expiry.
  let { data: channel, error } = await supabase
    .from('assistant_channels')
    .select(`
      id,
      assistant_id,
      channel_type,
      external_channel_id,
      channel_config,
      encrypted_secrets:encrypted_secrets_id (
        id,
        encrypted_data
      ),
      assistant:ai_assistants!inner (
        id,
        name,
        engine,
        system_prompt,
        soul_content,
        lucid_model,
        temperature,
        max_tokens,
        memory_enabled,
        memory_window_size,
        memory_strategy,
        stream_mode,
        org_id,
        passport_id,
        telegram_voice_mode,
        telegram_voice_id,
        telegram_voice_instructions,
        policy_config,
        wallet_enabled,
        approval_required_tools,
        agent_wallets (
          chain_type,
          privy_wallet_id,
          address,
          status
        )
      )
    `)
    .eq('id', channelId)
    .single()

  if (error && shouldFallbackWalletSchemaQuery(error)) {
    // Fallback: retry without wallet fields (migration not yet applied)
    const fallback = await supabase
      .from('assistant_channels')
      .select(`
        id,
        assistant_id,
        channel_type,
        external_channel_id,
        channel_config,
        encrypted_secrets:encrypted_secrets_id (
          id,
          encrypted_data
        ),
        assistant:ai_assistants!inner (
          id,
          name,
          engine,
          system_prompt,
          soul_content,
          lucid_model,
          temperature,
          max_tokens,
          memory_enabled,
          memory_window_size,
          memory_strategy,
          stream_mode,
          org_id,
          passport_id,
          telegram_voice_mode,
          telegram_voice_id,
          telegram_voice_instructions,
          policy_config,
          approval_required_tools
        )
      `)
      .eq('id', channelId)
      .single()

    if (fallback.error || !fallback.data) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    const ch = fallback.data as Record<string, unknown>
    const asst = ch.assistant as Record<string, unknown>
    ch.assistant = { ...asst, wallet_enabled: false, agent_wallets: [] }
    return ch as unknown as AssistantChannel
  }

  if (error) {
    throw new Error(`Channel lookup failed: ${error.message}`)
  }

  if (!channel) {
    throw new Error(`Channel not found: ${channelId}`)
  }

  return channel as unknown as AssistantChannel
}

// ---------------------------------------------------------------------------
// ChannelOutput factory
// ---------------------------------------------------------------------------

function createChannelOutput(
  channel: AssistantChannel,
  event: InboundEvent,
  secrets: Record<string, string>,
  runtimeConfig: Config,
): ChannelOutput | null {
  const channelConfig = channel.channel_config && typeof channel.channel_config === 'object'
    ? channel.channel_config
    : null
  const discordVoiceSession =
    channel.channel_type === 'discord' &&
    event.message_data &&
    typeof event.message_data === 'object' &&
    event.message_data.discord_voice_session &&
    typeof event.message_data.discord_voice_session === 'object'
      ? (event.message_data.discord_voice_session as Record<string, unknown>)
      : null
  const telegramVoiceSettings = resolveTelegramVoiceReplySettings({
    channelConfig,
    assistant: channel.assistant,
  })
  const discordDeliveryConfig =
    channel.channel_type === 'discord' ? resolveDiscordDeliveryConfig(channelConfig) : null
  const discordVoiceSettings = resolveDiscordVoiceReplySettings({ channelConfig })
  const baseConfig: ChannelOutputConfig = {
    channelId: channel.id,
    chatId: event.external_chat_id,
    replyToMessageId: event.external_message_id,
    replyToMode:
      channel.channel_type === 'discord'
        ? discordDeliveryConfig?.replyToMode ?? 'first'
        : channel.channel_type === 'slack'
          ? getSlackReplyToMode(channelConfig)
          : 'all',
    botToken: secrets.bot_token || '',
    channelType: channel.channel_type as 'telegram' | 'whatsapp' | 'discord' | 'slack',
    deps: { runtimeConfig },
    ...(channel.channel_type === 'slack' &&
    event.message_data &&
    typeof event.message_data === 'object' &&
    typeof event.message_data.thread_ts === 'string' &&
    event.message_data.thread_ts.trim().length > 0
      ? { threadId: event.message_data.thread_ts.trim() }
      : {}),
    ...(channel.channel_type === 'slack'
      ? {
          slackStreamingMode:
            channelConfig?.slack_streaming_mode === 'off' ||
            channelConfig?.slack_streaming_mode === 'block' ||
            channelConfig?.slack_streaming_mode === 'progress'
              ? channelConfig.slack_streaming_mode
              : 'partial',
          slackNativeStreaming: channelConfig?.slack_native_streaming === true,
          slackRecipientTeamId:
            typeof channelConfig?.slack_team_id === 'string' &&
            channelConfig.slack_team_id.trim().length > 0
              ? channelConfig.slack_team_id.trim()
              : undefined,
          slackRecipientUserId:
            channelConfig?.slack_conversation_type === 'im' &&
            typeof event.external_user_id === 'string' &&
            event.external_user_id.trim().length > 0
              ? event.external_user_id.trim()
              : undefined,
        }
      : {}),
    ...(channel.channel_type === 'telegram'
      ? {
          telegramVoice: {
            mode: telegramVoiceSettings.mode,
            voiceId: telegramVoiceSettings.voiceId,
            instructions: telegramVoiceSettings.instructions,
          },
        }
      : {}),
    ...(channel.channel_type === 'telegram' && isHostedChannel(channel)
      ? { finalPlatformOptions: buildHostedTelegramReplyMarkup() }
      : {}),
  }

  switch (channel.channel_type) {
    case 'telegram': {
      const plugin = createTelegramPlugin(secrets)
      return createTelegramBridgeOutput(
        plugin,
        baseConfig,
        telegramVoiceSettings.mode === 'always' ? { streaming: { supportsEditing: false } } : {},
      )
    }

    case 'whatsapp': {
      const plugin = createWhatsAppPlugin(secrets)
      return createWhatsAppBridgeOutput(plugin, baseConfig)
    }

    case 'discord': {
      if (
        discordVoiceSession &&
        typeof discordVoiceSession.guildId === 'string' &&
        typeof discordVoiceSession.channelId === 'string'
      ) {
        return new DiscordVoiceChannelOutput({
          guildId: discordVoiceSession.guildId,
          voiceChannelId: discordVoiceSession.channelId,
          voiceId: discordVoiceSettings.voiceId,
          instructions: discordVoiceSettings.instructions,
        })
      }
      const plugin = createDiscordPlugin(secrets, {
        maxLinesPerMessage: discordDeliveryConfig?.maxLinesPerMessage ?? 17,
        chunkMode: discordDeliveryConfig?.chunkMode ?? 'length',
      })
      return createDiscordBridgeOutput(plugin, {
        ...baseConfig,
        discordStreamingMode: discordDeliveryConfig?.streamingMode ?? 'partial',
        discordTypingFeedback: !!discordDeliveryConfig?.typingReaction,
      }, {
        streaming: {
          supportsEditing: discordDeliveryConfig?.streamingPreview !== false,
        },
      })
    }

    case 'slack': {
      const plugin = createSlackPlugin(secrets)
      return createSlackBridgeOutput(plugin, baseConfig, {
        streaming: {
          supportsEditing:
            channelConfig?.slack_streaming_mode === 'off'
              ? false
              : channelConfig?.slack_streaming_preview !== false,
        },
      })
    }

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Secret decryption
// ---------------------------------------------------------------------------

function decryptChannelSecrets(
  channel: AssistantChannel,
  encryptionKey: string
): Record<string, string> {
  if (!channel.encrypted_secrets?.encrypted_data || !encryptionKey) {
    return {}
  }
  return decryptSecretString(channel.encrypted_secrets.encrypted_data, encryptionKey)
}

// ---------------------------------------------------------------------------
// LLM message builder
// ---------------------------------------------------------------------------

function buildLLMMessages(
  assistant: AssistantChannel['assistant'],
  messages: Array<{ role: string; content: string }>,
  memories: string[],
  userMessage: string
): Array<{ role: string; content: string }> {
  let systemPrompt = assistant.system_prompt || 'You are a helpful AI assistant.'

  if (memories.length > 0) {
    systemPrompt += `\n\n## Relevant memories about this user:\n${memories.map(m => `- ${m}`).join('\n')}`
  }

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]

  if (messages.length === 0 || messages[messages.length - 1].content !== userMessage) {
    apiMessages.push({ role: 'user', content: userMessage })
  }

  return apiMessages
}

// ---------------------------------------------------------------------------
// Streaming LLM call via Lucid-L2
// ---------------------------------------------------------------------------

async function streamLucidL2(
  config: Config,
  assistant: AssistantChannel['assistant'],
  apiMessages: Array<{ role: string; content: string }>,
  output: ChannelOutput
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const proxyBase = config.LUCID_API_BASE_URL.replace(/\/v1.*$/, '')
  const modelId = assistant.lucid_model

  const prompt = apiMessages
    .map(m => {
      const prefix = m.role === 'system' ? 'System' : m.role === 'user' ? 'User' : 'Assistant'
      return `${prefix}: ${m.content}`
    })
    .join('\n\n')

  console.log('[lucid-l2] Proxy invoke call:', {
    url: `${proxyBase}/proxy/invoke/model/${modelId}`,
    model: modelId,
    messageCount: apiMessages.length,
  })

  const response = await fetch(`${proxyBase}/proxy/invoke/model/${modelId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      parameters: {
        max_tokens: assistant.max_tokens,
        temperature: assistant.temperature,
      },
    }),
  })

  if (!response.ok) {
    // Safety (Fix B): Never leak response body — may contain prompt echo or PII
    await response.text() // consume body to avoid resource leak
    throw new Error(`Lucid-L2 proxy error (${response.status})`)
  }

  const data = await response.json() as {
    output?: string
    error?: string
    message?: string
    metadata?: { cost?: number; latency_ms?: number; provider?: string }
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  // Safety (Fix B): Never leak raw API error text — may contain PII
  if (data.error) {
    throw new Error(`Lucid-L2 proxy API error`)
  }

  const text = data.output || ''
  if (!text) {
    throw new Error('Lucid-L2 proxy returned empty output')
  }

  void output.append(text)

  const usage = data.usage
  console.log('[lucid-l2] Proxy response:', {
    textLength: text.length,
    hasUsage: !!usage,
    provider: data.metadata?.provider,
    latencyMs: data.metadata?.latency_ms,
  })

  return {
    text,
    usage: usage ? {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    } : undefined,
  }
}

// ---------------------------------------------------------------------------
// Non-streaming LLM call (legacy / fallback)
// ---------------------------------------------------------------------------

async function callLucidL2(
  config: Config,
  assistant: AssistantChannel['assistant'],
  messages: Array<{ role: string; content: string }>,
  memories: string[],
  userMessage: string
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const apiMessages = buildLLMMessages(assistant, messages, memories, userMessage)
  return callLucidL2Fetch(config, assistant, apiMessages)
}

async function callLucidL2Fetch(
  config: Config,
  assistant: AssistantChannel['assistant'],
  apiMessages: Array<{ role: string; content: string }>
): Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const prompt = apiMessages
    .map(m => `${m.role === 'system' ? 'System' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  const proxyUrl = config.LUCID_API_BASE_URL.replace(/\/v1.*$/, '')
  const response = await fetch(`${proxyUrl}/proxy/invoke/model/${assistant.lucid_model}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      parameters: {
        max_tokens: assistant.max_tokens,
        temperature: assistant.temperature,
      },
    }),
  })

  if (!response.ok) {
    // Safety (Fix B): Never leak response body — may contain prompt echo or PII
    await response.text() // consume body to avoid resource leak
    throw new Error(`Lucid-L2 fetch error (${response.status})`)
  }

  const data = await response.json() as {
    output?: string
    error?: string
    message?: string
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  // Safety (Fix B): Never leak raw API error text — may contain PII
  if (data.error) {
    throw new Error(`Lucid-L2 API error`)
  }

  if (!data.output) {
    throw new Error('Lucid-L2 returned empty output')
  }

  return {
    text: data.output,
    usage: data.usage,
  }
}
