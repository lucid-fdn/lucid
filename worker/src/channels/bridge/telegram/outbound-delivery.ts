import type { SupabaseClient } from '@supabase/supabase-js'

import type { Config } from '../../../config.js'
import {
  resolveTelegramVoiceReplySettings,
  shouldSendVoiceReply,
} from '../media/voice-reply-policy.js'
import type { createTelegramPlugin } from './TelegramPlugin.js'
import { resolveTelegramDelivery } from './delivery.js'
import {
  extractTelegramPhotoPayload,
  mergeTelegramPlatformOptions,
  sendTelegramPhoto,
} from './media.js'
import { parseTelegramOutboundIntents } from './outbound-intents.js'
import { buildTelegramReactionFallbackText } from './presentation.js'

export interface TelegramOutboundEvent {
  id: string
  inbound_event_id: string | null
  message_text: string
  reply_to_external_id: string | null
}

export interface TelegramOutboundChannel {
  id: string
  assistant_id?: string | null
  external_channel_id: string | null
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
}

function getTelegramVoiceSettings(channel: TelegramOutboundChannel): {
  mode: 'off' | 'auto' | 'always'
  voiceId: string | null
  instructions: string | null
} {
  const ai = Array.isArray(channel.ai_assistants) ? channel.ai_assistants[0] : channel.ai_assistants
  const channelConfig = channel.channel_config && typeof channel.channel_config === 'object' ? channel.channel_config : null
  return resolveTelegramVoiceReplySettings({ channelConfig, assistant: ai ?? null })
}

function hasTelegramVoiceInput(messageData: Record<string, unknown> | null | undefined): boolean {
  if (messageData?.telegram_voice_input === true) return true
  const raw = messageData?.attachments
  if (!Array.isArray(raw)) return false
  return raw.some((item) => {
    if (!item || typeof item !== 'object') return false
    const kind = (item as { kind?: unknown }).kind
    return kind === 'voice' || kind === 'audio'
  })
}

export async function handleTelegramOutbound(params: {
  supabase: SupabaseClient
  config: Config
  channel: TelegramOutboundChannel
  event: TelegramOutboundEvent
  plugin: ReturnType<typeof createTelegramPlugin>
  secrets: Record<string, string>
  hosted: boolean
  loadInboundMessageData: (inboundEventId: string | null) => Promise<Record<string, unknown> | null>
  prepareVoiceReplyMedia: (params: {
    config: Config
    text: string
    voice?: string
    instructions?: string
    fileBaseName: string
    tempDirName: string
  }) => Promise<{
    filePath: string
    mediaUrl: string
    localRoot: string
  }>
  cleanupVoiceTempFile: (filePath: string | null) => Promise<void>
}): Promise<string | null> {
  const intents = parseTelegramOutboundIntents(params.event.message_text)
  const shouldLoadInboundMessageData =
    params.hosted && !params.channel.external_channel_id
  const initialInboundMessageData = shouldLoadInboundMessageData
    ? await params.loadInboundMessageData(params.event.inbound_event_id)
    : null
  const delivery = await resolveTelegramDelivery({
    supabase: params.supabase,
    channel: params.channel,
    text: intents.text,
    hosted: params.hosted,
    inboundMessageData: initialInboundMessageData,
  })

  if (intents.reactionEmoji) {
    if (!params.event.reply_to_external_id) {
      throw new Error('Telegram reaction requires reply_to_external_id')
    }
    const reactionResult = await params.plugin.reactMessage({
      to: delivery.chatId,
      messageId: params.event.reply_to_external_id,
      emoji: intents.reactionEmoji,
    })
    if (!reactionResult.ok) {
      const fallbackText = buildTelegramReactionFallbackText({
        emoji: intents.reactionEmoji,
        text: intents.text,
      })
      const fallbackDelivery = await resolveTelegramDelivery({
        supabase: params.supabase,
        channel: params.channel,
        text: fallbackText,
        hosted: params.hosted,
      })
      console.warn('[outbound] Telegram reaction rejected, falling back to visible reply', {
        channelId: params.channel.id,
        replyToExternalId: params.event.reply_to_external_id,
        reason: reactionResult.error || reactionResult.warning || 'unknown',
      })
      const fallbackResult = await params.plugin.outbound.sendText({
        to: fallbackDelivery.chatId,
        text: fallbackDelivery.text,
        replyToId: params.event.reply_to_external_id,
        ...(fallbackDelivery.platformOptions
          ? { platformOptions: fallbackDelivery.platformOptions }
          : {}),
      })
      if (!fallbackResult.ok && fallbackResult.error) {
        throw new Error(
          `Telegram reaction fallback error: ${fallbackResult.error} (reaction failed: ${reactionResult.error || reactionResult.warning || 'unknown'})`,
        )
      }
      return fallbackResult.messageId ? String(fallbackResult.messageId) : null
    }
    return `reaction:${params.event.reply_to_external_id}`
  }

  if (intents.stickerFileId) {
    const stickerResult = await params.plugin.sendSticker({
      to: delivery.chatId,
      fileId: intents.stickerFileId,
      ...(params.event.reply_to_external_id ? { replyToId: params.event.reply_to_external_id } : {}),
    })
    if (!stickerResult.ok && stickerResult.error) {
      throw new Error(`Telegram sticker error: ${stickerResult.error}`)
    }
    return stickerResult.messageId ? String(stickerResult.messageId) : null
  }

  const voiceSettings = getTelegramVoiceSettings(params.channel)
  const inboundMessageData =
    voiceSettings.mode === 'auto'
      ? (initialInboundMessageData
          ?? await params.loadInboundMessageData(params.event.inbound_event_id))
      : initialInboundMessageData
  const shouldSendTelegramVoiceReply =
    intents.mediaUrls.length === 0 &&
    !intents.reactionEmoji &&
    !intents.stickerFileId &&
    shouldSendVoiceReply({
      text: intents.text,
      mode: voiceSettings.mode,
      hasVoiceInput: hasTelegramVoiceInput(inboundMessageData),
    })

  if (shouldSendTelegramVoiceReply) {
    let tempVoiceFilePath: string | null = null
    try {
      const voiceMedia = await params.prepareVoiceReplyMedia({
        config: params.config,
        text: intents.text,
        voice: voiceSettings.voiceId ?? undefined,
        instructions: voiceSettings.instructions ?? undefined,
        fileBaseName: 'telegram-voice-reply',
        tempDirName: 'lucid-telegram-voice',
      })
      tempVoiceFilePath = voiceMedia.filePath
      const voiceResult = await params.plugin.outbound.sendMedia({
        to: delivery.chatId,
        text: '',
        mediaUrl: voiceMedia.mediaUrl,
        replyToId: params.event.reply_to_external_id || undefined,
        platformOptions: {
          audioAsVoice: true,
          mediaLocalRoots: [voiceMedia.localRoot],
        },
      })
      if (!voiceResult.ok && voiceResult.error) {
        throw new Error(`Telegram voice send error: ${voiceResult.error}`)
      }
      return voiceResult.messageId ? String(voiceResult.messageId) : null
    } catch (error) {
      console.warn('[outbound] Telegram voice reply failed, falling back to text', {
        channelId: params.channel.id,
        outboundId: params.event.id,
        reason: error instanceof Error ? error.message : String(error),
      })
    } finally {
      await params.cleanupVoiceTempFile(tempVoiceFilePath)
    }
  }

  const mediaUrls = intents.mediaUrls.length > 0 ? intents.mediaUrls : []
  if (mediaUrls.length > 0) {
    let lastMessageId: string | null = null
    for (let i = 0; i < mediaUrls.length; i += 1) {
      const mediaUrl = mediaUrls[i]!
      const sendResult = await params.plugin.outbound.sendMedia({
        to: delivery.chatId,
        text: i === 0 ? delivery.text : '',
        mediaUrl,
        replyToId: params.event.reply_to_external_id || undefined,
        platformOptions: mergeTelegramPlatformOptions(
          delivery.platformOptions,
          intents.audioAsVoice ? { audioAsVoice: true } : undefined,
        ),
      })
      if (!sendResult.ok && sendResult.error) {
        throw new Error(`Telegram media error: ${sendResult.error}`)
      }
      if (sendResult.messageId) {
        lastMessageId = String(sendResult.messageId)
      }
    }
    return lastMessageId
  }

  const photoPayload = extractTelegramPhotoPayload(delivery.text)
  if (photoPayload && params.secrets.bot_token) {
    const result = await sendTelegramPhoto({
      botToken: params.secrets.bot_token,
      chatId: delivery.chatId,
      photoUrl: photoPayload.photoUrl,
      ...(photoPayload.caption ? { caption: photoPayload.caption } : {}),
      ...(params.event.reply_to_external_id ? { replyToId: params.event.reply_to_external_id } : {}),
      ...(delivery.platformOptions ? { platformOptions: delivery.platformOptions } : {}),
    })
    if (!result.ok && result.error) {
      throw new Error(`Telegram bridge error: ${result.error}`)
    }
    return result.messageId ? String(result.messageId) : null
  }

  const platformOptions = mergeTelegramPlatformOptions(
    delivery.platformOptions,
    intents.audioAsVoice ? { audioAsVoice: true } : undefined,
  )
  const chunks = params.plugin.outbound.chunker(
    delivery.text,
    params.plugin.outbound.textChunkLimit,
  ).filter((chunk) => chunk.trim().length > 0)

  let lastMessageId: string | null = null
  for (const [index, chunk] of chunks.entries()) {
    const textResult = await params.plugin.outbound.sendText({
      to: delivery.chatId,
      text: chunk,
      replyToId: index === 0 ? params.event.reply_to_external_id || undefined : undefined,
      ...(platformOptions ? { platformOptions } : {}),
    })
    if (!textResult.ok && textResult.error) {
      throw new Error(`Telegram bridge error: ${textResult.error}`)
    }
    lastMessageId = textResult.messageId ? String(textResult.messageId) : lastMessageId
  }
  return lastMessageId
}
