/**
 * Outbound Event Processor
 * 
 * Sends messages back to channels (Telegram, WhatsApp).
 * 1. Load channel config
 * 2. Decrypt secrets
 * 3. Send message via channel API
 * 4. Mark outbound as sent
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Config } from '../config.js'
import { renewLease } from '../adapters/supabase.js'
import { decryptChannelSecrets } from '../crypto/decrypt-channel-secrets.js'
import { createDiscordPlugin } from '../channels/bridge/discord/DiscordPlugin.js'
import { resolveDiscordDeliveryConfig } from '../channels/bridge/discord/config.js'
import { handleDiscordOutbound } from '../channels/bridge/discord/outbound-delivery.js'
import { createSlackPlugin } from '../channels/bridge/slack/SlackPlugin.js'
import { handleSlackOutbound } from '../channels/bridge/slack/outbound-delivery.js'
import { handleIMessageOutbound } from '../channels/bridge/imessage/outbound-delivery.js'
import { handleTeamsOutbound } from '../channels/bridge/msteams/outbound-delivery.js'
import { createTelegramPlugin } from '../channels/bridge/telegram/TelegramPlugin.js'
import {
  handleTelegramOutbound,
} from '../channels/bridge/telegram/outbound-delivery.js'
import { createWhatsAppPlugin } from '../channels/bridge/whatsapp/WhatsAppPlugin.js'
import { handleWhatsAppOutbound } from '../channels/bridge/whatsapp/outbound-delivery.js'
import { PermanentChannelError, isPermanentError } from '../channels/errors.js'
import { cleanupVoiceTempFile, prepareVoiceReplyMedia } from './voice-replies.js'
import { markOutboundStage } from '../core/lifecycle/message-lifecycle.js'
import { classifyMessageFailure } from '../core/reliability/failure-classifier.js'
import { getOutboundMessageTraceFields } from '../core/trace/message-trace.js'
import {
  getTracer,
  safeSetAttribute,
  classifyError,
  SpanStatusCode,
} from '../observability/tracing.js'

interface OutboundEvent {
  id: string
  channel_id: string
  inbound_event_id: string | null
  conversation_id: string | null
  message_text: string
  reply_to_external_id: string | null
  attempts: number
  max_attempts: number
}

interface ChannelWithSecrets {
  id: string
  assistant_id?: string | null
  channel_type: string
  external_channel_id: string | null
  connection_mode?: string | null
  channel_config?: Record<string, unknown> | null
  ai_assistants?:
    | {
        name?: string | null
        telegram_display_name?: string | null
        telegram_voice_mode?: 'off' | 'auto' | 'always' | null
        telegram_voice_id?: string | null
        telegram_voice_instructions?: string | null
      }
    | Array<{
        name?: string | null
        telegram_display_name?: string | null
        telegram_voice_mode?: 'off' | 'auto' | 'always' | null
        telegram_voice_id?: string | null
        telegram_voice_instructions?: string | null
      }>
  encrypted_secrets: {
    id: string
    encrypted_data: string
  } | null
}

type TelegramAssistantProjection =
  NonNullable<Exclude<ChannelWithSecrets['ai_assistants'], Array<unknown>>>

async function loadTelegramAssistantProjection(
  supabase: SupabaseClient,
  assistantId: string | null | undefined,
  currentAssistant:
    | ChannelWithSecrets['ai_assistants']
    | null
    | undefined,
): Promise<
  TelegramAssistantProjection | null
> {
  if (currentAssistant) {
    return Array.isArray(currentAssistant) ? currentAssistant[0] ?? null : currentAssistant
  }

  if (!assistantId) return null

  const { data, error } = await supabase
    .from('ai_assistants')
    .select(`
      name,
      telegram_display_name,
      telegram_voice_mode,
      telegram_voice_id,
      telegram_voice_instructions
    `)
    .eq('id', assistantId)
    .maybeSingle()

  if (error) {
    console.warn('[outbound] Failed to load Telegram assistant projection', {
      assistantId,
      reason: error.message,
    })
    return null
  }

  return (data as TelegramAssistantProjection | null) ?? null
}

async function loadInboundMessageData(
  supabase: SupabaseClient,
  inboundEventId: string | null,
): Promise<Record<string, unknown> | null> {
  if (!inboundEventId) return null
  const { data, error } = await supabase
    .from('assistant_inbound_events')
    .select('message_data')
    .eq('id', inboundEventId)
    .maybeSingle()
  if (error) {
    console.warn('[outbound] Failed to load inbound message_data for Telegram voice policy', {
      inboundEventId,
      reason: error.message,
    })
    return null
  }
  return (data?.message_data as Record<string, unknown> | null | undefined) ?? null
}

async function enqueueHostedIMessageDispatch(params: {
  supabase: SupabaseClient
  outboundEventId: string
  surfaceId: string
  body: Record<string, unknown>
}): Promise<string> {
  const { data, error } = await params.supabase
    .from('channel_provider_dispatches')
    .upsert(
      {
        channel_type: 'imessage',
        surface_id: params.surfaceId,
        assistant_outbound_event_id: params.outboundEventId,
        payload: params.body,
        status: 'pending',
        last_error: null,
      },
      { onConflict: 'assistant_outbound_event_id' },
    )
    .select('id')
    .single()

  if (error || !data?.id) {
    throw error ?? new Error('Failed to enqueue hosted iMessage provider dispatch')
  }

  return data.id as string
}

export async function processOutboundEvent(
  event: OutboundEvent,
  supabase: SupabaseClient,
  config: Config
): Promise<void> {
  const traceFieldsBase = getOutboundMessageTraceFields('unknown', event.id)
  const span = getTracer().startSpan('outbound.pipeline', {
    attributes: {
      'lucid.channel_type': 'unknown', // updated after channel load
      'lucid.run_id': event.id,
    },
  })

  // Start heartbeat for long-running processing
  const heartbeat = setInterval(async () => {
    await renewLease(supabase, event.id, config.WORKER_ID, 'outbound')
  }, config.HEARTBEAT_INTERVAL)

  let typedChannel: ChannelWithSecrets | null = null

  try {
    console.log(`[outbound] Sending ${event.id} (attempt ${event.attempts})`, traceFieldsBase)

    // 1. Load channel with encrypted secrets
    const { data: channel, error: channelError } = await supabase
      .from('assistant_channels')
      .select(`
        id,
        assistant_id,
        channel_type,
        external_channel_id,
        connection_mode,
        channel_config,
        encrypted_secrets:encrypted_secrets_id (
          id,
          encrypted_data
        )
      `)
      .eq('id', event.channel_id)
      .single()

    if (channelError || !channel) {
      throw new Error(`Channel not found: ${event.channel_id}`)
    }

    typedChannel = channel as unknown as ChannelWithSecrets
    safeSetAttribute(span, 'lucid.channel_type', typedChannel.channel_type)

    // 2. Decrypt secrets
    let secrets: Record<string, string> = {}
    if (typedChannel.encrypted_secrets?.encrypted_data && config.ENCRYPTION_KEY) {
      secrets = decryptSecrets(typedChannel.encrypted_secrets.encrypted_data, config.ENCRYPTION_KEY)
    }

    // 2.5 Hosted channel token injection (one-click Telegram)
    // Hosted channels have no encrypted_secrets — use shared platform token
    const isHosted = !typedChannel.encrypted_secrets?.encrypted_data
    if (isHosted && typedChannel.channel_type === 'telegram' && !secrets.bot_token) {
      if (config.TELEGRAM_HOSTED_BOT_TOKEN) {
        secrets.bot_token = config.TELEGRAM_HOSTED_BOT_TOKEN
      } else {
        throw new PermanentChannelError('TELEGRAM_HOSTED_BOT_TOKEN is not configured on the worker')
      }
    }
    if (isHosted && typedChannel.channel_type === 'discord' && !secrets.bot_token) {
      if (config.DISCORD_HOSTED_BOT_TOKEN) {
        secrets.bot_token = config.DISCORD_HOSTED_BOT_TOKEN
      } else {
        throw new PermanentChannelError('DISCORD_HOSTED_BOT_TOKEN is not configured on the worker')
      }
    }
    if (isHosted && typedChannel.channel_type === 'whatsapp' && !secrets.access_token) {
      const hostedAccessToken = process.env.WHATSAPP_HOSTED_ACCESS_TOKEN
      const hostedPhoneNumberId = process.env.WHATSAPP_HOSTED_PHONE_NUMBER_ID
      if (hostedAccessToken && hostedPhoneNumberId) {
        secrets.access_token = hostedAccessToken
        secrets.phone_number_id = hostedPhoneNumberId
      } else {
        throw new PermanentChannelError('WHATSAPP_HOSTED_ACCESS_TOKEN / WHATSAPP_HOSTED_PHONE_NUMBER_ID is not configured on the worker')
      }
    }

    // 3. Send message via channel API
    let externalMessageId: string | null = null

    switch (typedChannel.channel_type) {
      case 'telegram': {
        const telegramPlugin = createTelegramPlugin(secrets)
        const telegramAssistantProjection = await loadTelegramAssistantProjection(
          supabase,
          typedChannel.assistant_id ?? null,
          typedChannel.ai_assistants,
        )
        externalMessageId = await handleTelegramOutbound({
          supabase,
          config,
          channel: {
            ...typedChannel,
            ...(telegramAssistantProjection ? { ai_assistants: telegramAssistantProjection } : {}),
          },
          event,
          plugin: telegramPlugin,
          secrets,
          hosted: isHosted,
          loadInboundMessageData: (inboundEventId) => loadInboundMessageData(supabase, inboundEventId),
          prepareVoiceReplyMedia,
          cleanupVoiceTempFile,
        })
        break
      }

      case 'whatsapp': {
        const whatsappPlugin = createWhatsAppPlugin(secrets)
        externalMessageId = await handleWhatsAppOutbound({
          config,
          channel: typedChannel,
          event,
          plugin: whatsappPlugin,
          loadInboundMessageData: (inboundEventId) => loadInboundMessageData(supabase, inboundEventId),
          prepareVoiceReplyMedia,
          cleanupVoiceTempFile,
        })
        break
      }

      case 'web':
        // Web channel messages are pulled by client, no push needed
        externalMessageId = `web-${Date.now()}`
        break

      case 'discord': {
        const discordDeliveryConfig = resolveDiscordDeliveryConfig(
          typedChannel.channel_config && typeof typedChannel.channel_config === 'object'
            ? typedChannel.channel_config
            : null,
        )
        const discordPlugin = createDiscordPlugin(secrets, {
          maxLinesPerMessage: discordDeliveryConfig.maxLinesPerMessage,
          chunkMode: discordDeliveryConfig.chunkMode,
        })
        externalMessageId = await handleDiscordOutbound({
          config,
          channel: typedChannel,
          event,
          plugin: discordPlugin,
          hosted: isHosted,
          loadInboundMessageData: (inboundEventId) => loadInboundMessageData(supabase, inboundEventId),
          prepareVoiceReplyMedia,
          cleanupVoiceTempFile,
        })
        break
      }

      case 'slack': {
        const slackPlugin = createSlackPlugin(secrets)
        externalMessageId = (await handleSlackOutbound({
          channel: typedChannel,
          event,
          plugin: slackPlugin,
          loadInboundMessageData: (inboundEventId) => loadInboundMessageData(supabase, inboundEventId),
        })).externalMessageId
        break
      }

      case 'msteams': {
        externalMessageId = await handleTeamsOutbound({
          channel: typedChannel,
          event,
          secrets,
          loadInboundMessageData: (inboundEventId) => loadInboundMessageData(supabase, inboundEventId),
        })
        break
      }

      case 'imessage': {
        externalMessageId = await handleIMessageOutbound({
          channel: typedChannel,
          event,
          secrets,
          loadInboundMessageData: (inboundEventId) => loadInboundMessageData(supabase, inboundEventId),
          enqueueHostedDispatch: ({ surfaceId, body }) =>
            enqueueHostedIMessageDispatch({
              supabase,
              outboundEventId: event.id,
              surfaceId,
              body,
            }),
        })
        break
      }

      default:
        throw new Error(`Unsupported channel type: ${typedChannel.channel_type}`)
    }

    // 4. Mark outbound as sent
    await markOutboundStage({
      supabase,
      eventId: event.id,
      stage: 'outbound_sent',
      externalMessageId,
    })

    span.setStatus({ code: SpanStatusCode.OK })
    console.log(`[outbound] ✅ Sent ${event.id} → ${externalMessageId}`, traceFieldsBase)

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isPermanent = error instanceof PermanentChannelError || isPermanentError(errorMessage)
    const failure = classifyMessageFailure({
      stage: 'outbound_send',
      error: errorMessage,
      retryable: !isPermanent,
    })

    if (isPermanent) {
      console.error(`[outbound] 🚫 PERMANENT failure ${event.id}: ${errorMessage}`, {
        ...traceFieldsBase,
        failure,
      })
      await markOutboundStage({
        supabase,
        eventId: event.id,
        stage: 'failed',
        errorMessage: `${failure.kind}: ${failure.message}`,
        attempts: event.max_attempts,
        maxAttempts: event.max_attempts,
      })
      await supabase.from('assistant_channels').update({
        is_active: false,
        metadata: { deactivated_at: new Date().toISOString(), deactivated_reason: errorMessage, deactivated_by: 'outbound_permanent_error' },
      }).eq('id', event.channel_id)
      console.warn(`[outbound] ⚠️ Channel ${event.channel_id} deactivated`, {
        ...traceFieldsBase,
        failure,
      })
    } else {
      console.error(`[outbound] ❌ Retryable failure ${event.id}:`, errorMessage, {
        ...traceFieldsBase,
        failure,
      })
      await markOutboundStage({
        supabase,
        eventId: event.id,
        stage: 'failed',
        errorMessage: `${failure.kind}: ${failure.message}`,
        attempts: event.attempts,
        maxAttempts: event.max_attempts,
      })
    }

    span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage })
    safeSetAttribute(span, 'error.type', classifyError(error))

  } finally {
    span.end()
    clearInterval(heartbeat)
  }
}

// decryptSecrets extracted to crypto/decrypt-channel-secrets.ts
const decryptSecrets = decryptChannelSecrets

// All channel send logic now lives in OpenClaw bridge plugins:
// - worker/src/channels/bridge/telegram/TelegramPlugin.ts
// - worker/src/channels/bridge/whatsapp/WhatsAppPlugin.ts
// - worker/src/channels/bridge/discord/DiscordPlugin.ts
// Outbound processor calls plugin.outbound.sendText() through the bridge contract.
// This keeps all channel-specific API logic in one place per channel,
// and allows future bridge upgrades (streaming, editing) without touching this file.
